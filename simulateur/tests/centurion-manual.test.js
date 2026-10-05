const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const E=require('../centurion-engine.js');

test('soupapes PZR : trois commandes manuelles disponibles avec CC-RÉGUL actif',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../centurion-app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../centurion.html'),'utf8');
  const inputs=[...html.matchAll(/<input\b[^>]*>/g)].map(([tag])=>({
    id:tag.match(/id="([^"]+)"/)?.[1],regulated:tag.includes('data-regulated-control'),
    dataset:{reliefStage:tag.match(/data-relief-stage="(\d)"/)?.[1]},
    disabled:false,events:{},addEventListener(name,fn){this.events[name]=fn;}}));
  const stages=inputs.filter(input=>input.dataset.reliefStage!==undefined);
  const model=E.make();model.controls.pressureGraphHeaterKW=288;
  const ctx=vm.createContext({model,E,document:{querySelectorAll:selector=>
    selector==='[data-relief-stage]'?stages:inputs.filter(input=>input.regulated)}});
  const availability=app.slice(app.indexOf('    document.querySelectorAll("[data-regulated-control]")'),
    app.indexOf('    renderManualExtras();'));
  const binding=app.slice(app.indexOf('    document.querySelectorAll("[data-relief-stage]").forEach(input=>input.addEventListener'),
    app.indexOf('    bindManualExtras();'));
  vm.runInContext(`let regulationActive=true;function render(){const u=model.controls;${availability}}
    ${binding}\nrender();`,ctx);
  assert.equal(inputs.find(input=>input.id==='heaterInput').disabled,true);
  assert.equal(inputs.find(input=>input.id==='gctaOpeningPressure').disabled,false);
  assert.equal(stages.length,3);assert.ok(stages.every(input=>!input.disabled));
  for(const input of stages)input.events.change({target:{dataset:input.dataset,checked:true}});
  E.step(model,.1);assert.deepEqual(model.state.reliefStages,[true,true,true]);
  assert.ok(model.state.reliefKgS>140);
  stages[1].events.change({target:{dataset:stages[1].dataset,checked:false}});
  E.step(model,.1);assert.deepEqual(model.state.reliefStages,[true,false,true]);
  assert.ok(stages.every(input=>!input.disabled));
});

test('limite droite DPAX : deux segments, franchissement strict et retour dans la zone',()=>{
  assert.equal(E.dpaxRightLimit(0),0);
  assert.equal(E.dpaxRightLimit(15),15);
  assert.equal(E.dpaxRightLimit(100),6);
  assert.equal(E.dpaxRightLimit(200),6);
  for(const powerPct of [0,10,15,30,60,100]){
    const limit=E.dpaxRightLimit(powerPct);
    assert.equal(E.isDpaxRightExceeded({powerPct,dpaxPctPn:limit}),false);
    assert.equal(E.isDpaxRightExceeded({powerPct,dpaxPctPn:limit+.01}),true);
    assert.equal(E.isDpaxRightExceeded({powerPct,dpaxPctPn:limit-.01}),false);
  }
});

test('R en manuel : priorité sur le graphe, reprise à la position actuelle et AAR prioritaire',()=>{
  const m=E.make(),u=m.controls;u.protectionsEnabled=false;
  u.rMode='graph';u.rGraphPas=100;
  E.setRManualOverride(m,true);u.rManualPas=245;
  E.advance(m,20);
  assert.equal(m.state.rods.R,245);
  // Une sortie tardive du graphe ne reprend pas la main.
  u.rMode='graph';u.rGraphPas=50;E.advance(m,1);
  assert.equal(m.state.rods.R,245);
  E.setRManualOverride(m,false);u.rMode='graph';
  E.step(m,.1);assert.equal(m.state.rods.R,245);
  u.rGraphPas=200;E.step(m,.1);
  assert.ok(m.state.rods.R<245&&m.state.rods.R>244);
  const trip=E.make();trip.controls.protectionsEnabled=false;
  E.setRManualOverride(trip,true);trip.controls.rManualPas=260;
  E.initiate(trip,'trip');E.advance(trip,4);
  assert.ok(trip.state.rods.R<1,'la prise manuelle ne neutralise pas la chute sur AAR');
});

test('orifices RCV : 0, 18, 36 ou 54 m³/h sans modifier la charge',()=>{
  for(let count=0;count<=3;count++){
    const m=E.make();m.controls.protectionsEnabled=false;
    m.controls.rcvLetdownOrifices=[0,1,2].map(i=>i<count);
    E.step(m,.1);
    assert.equal(E.rcvLetdownM3h(m),18*count);
    assert.ok(Math.abs(m.state.rcvLetdownKgS*3600/E.C.primaryDensityKgM3-18*count)<1e-9);
    assert.equal(m.state.rcvChargeKgS*3600/E.C.primaryDensityKgM3,36);
  }
});

test('dilution/borication : charge seule, compteurs livrés après transit et restauration de CB',()=>{
  for(const mode of ['dilution','borication']){
    const m=E.make(),s=m.state,u=m.controls;u.protectionsEnabled=false;
    E.prepareRcvTank(m,0,1250);E.setRcvInjection(m,mode);
    assert.equal(u.rcvTankBoronPpm,1250,'la valeur manuelle reste mémorisée');
    assert.equal(s.rcvTankBoronPpm,mode==='dilution'?0:7000);
    const initialMass=s.primaryMassKg;
    E.advance(m,7);assert.equal(s.rcvInjectionLitres[mode],0);
    E.advance(m,3);
    assert.ok(s.rcvInjectionLitres[mode]>0);
    assert.equal(s.rcvChargeKgS*3600/E.C.primaryDensityKgM3,36);
    E.setRcvInjection(m,'off');assert.equal(s.rcvTankBoronPpm,1250);
    E.advance(m,8.2);
    assert.ok(Math.abs(s.rcvInjectionLitres[mode]-100)<1e-7,'10 s de charge à 36 m³/h = 100 L');
    assert.equal(s.rcvInjectionLitres[mode==='dilution'?'borication':'dilution'],0);
    assert.ok(Math.abs(s.primaryMassKg-initialMass)<1e-7,'aucun débit supplémentaire');
    assert.ok(mode==='dilution'?s.boronPpm<1200:s.boronPpm>1200);
    const litres=s.rcvInjectionLitres[mode];E.advance(m,5);
    assert.equal(s.rcvInjectionLitres[mode],litres);
  }
});

test('la régulation peut réduire la charge pendant une borication ; les litres suivent le débit réel',()=>{
  const m=E.make();m.controls.protectionsEnabled=false;
  m.controls.rcvChargeGraphM3h=18;E.setRcvInjection(m,'borication');
  E.advance(m,10);E.setRcvInjection(m,'off');E.advance(m,8.2);
  assert.ok(Math.abs(m.state.rcvInjectionLitres.borication-50)<1e-7);
  assert.equal(m.state.rcvChargeKgS*3600/E.C.primaryDensityKgM3,18);
});

test('interface manuelle : R repris malgré CC actif, CB immédiate à la molette et boutons exclusifs',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../centurion-app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../centurion.html'),'utf8');
  const ids=['rManualOverride','rManualInput','rManualValue','manualRodPanel','rcvBoron',
    'rcvOrificeStatus0','rcvOrificeStatus1','rcvOrificeStatus2',
    'rcvDilution','rcvBorication','rcvDilutionLitres','rcvBoricationLitres'];
  const element=()=>{
    const classes=new Set();return {value:'',textContent:'',disabled:false,checked:false,attrs:{},events:{},classes,
      addEventListener(name,fn){this.events[name]=fn;},setAttribute(name,value){this.attrs[name]=value;},
      classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name)}};
  };
  const elements=Object.fromEntries(ids.map(id=>[id,element()]));
  ids.forEach(id=>assert.ok(html.includes(`id="${id}"`),id));
  const orifices=[0,1,2].map(i=>Object.assign(element(),{dataset:{rcvOrifice:String(i)}}));
  const model=E.make(),context=vm.createContext({E,model,$:id=>elements[id],
    editorReady:{regul:false},sendEditorTick:()=>{},editorSignals:()=>({}),
    fmt:(v,d=0)=>Number(v).toFixed(d),
    document:{activeElement:null,querySelector:selector=>orifices[Number(selector.match(/"(\d)"/)[1])],
      querySelectorAll:()=>orifices}});
  const helpers=app.slice(app.indexOf('  function renderManualExtras()'),app.indexOf('  function editorSignals()'));
  const outputs=app.slice(app.indexOf('  function applyEditorOutputs('),app.indexOf('  function bindControls()'));
  vm.runInContext(`let regulationActive=true,protectionActive=false,running=false;
    ${helpers}\n${outputs}
    function render(){renderManualExtras();}
    globalThis.setup=bindManualExtras;globalThis.draw=renderManualExtras;
    globalThis.outputs=applyEditorOutputs;`,context);
  context.setup();context.draw();
  assert.equal(elements.rManualInput.disabled,true);
  elements.rManualOverride.events.change({target:{checked:true}});
  assert.equal(model.controls.rManualOverride,true);
  assert.equal(elements.rManualInput.disabled,false);
  assert.ok(elements.manualRodPanel.classes.has('manual-override-active'));
  context.outputs({mode:'regul',enabled:true,outputs:{posg:100}});
  assert.equal(model.controls.rMode,'manual');
  assert.equal(model.controls.rGraphPas,233);
  elements.rManualOverride.events.change({target:{checked:false}});
  assert.equal(elements.rManualInput.disabled,true);
  assert.ok(!elements.manualRodPanel.classes.has('manual-override-active'));
  context.outputs({mode:'regul',enabled:true,outputs:{posg:210}});
  assert.equal(model.controls.rMode,'graph');assert.equal(model.controls.rGraphPas,210);
  elements.rcvBoron.value='1350';elements.rcvBoron.events.input();
  assert.equal(model.controls.rcvTankBoronPpm,1350);
  let prevented=false;elements.rcvBoron.events.wheel({deltaY:-1,preventDefault:()=>{prevented=true;}});
  assert.ok(prevented);assert.equal(model.controls.rcvTankBoronPpm,1400);
  assert.equal(model.state.rcvTankBoronPpm,1400);
  elements.rcvDilution.events.click();
  assert.equal(elements.rcvBoron.value,0);assert.equal(elements.rcvBoron.disabled,true);
  assert.equal(elements.rcvDilution.attrs['aria-pressed'],'true');
  elements.rcvBorication.events.click();
  assert.equal(elements.rcvBoron.value,7000);
  assert.equal(elements.rcvDilution.attrs['aria-pressed'],'false');
  assert.equal(elements.rcvBorication.attrs['aria-pressed'],'true');
  elements.rcvBorication.events.click();
  assert.equal(elements.rcvBoron.value,1400);assert.equal(elements.rcvBoron.disabled,false);
  orifices[2].events.change({target:{dataset:{rcvOrifice:'2'},checked:true}});
  assert.equal(elements.rcvOrificeStatus2.textContent,'ES');
  assert.equal(E.rcvLetdownM3h(model),54);
});
