const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const E=require('../centurion-engine.js');
const {svgSurface}=require('./helpers/svg-surface');
const {editorSurface}=require('./helpers/editor-surface');

test('synoptiques : zoom au pointeur, déplacement sans clic parasite, retour au cadrage et mesures vivantes',()=>{
  for(const file of ['synoptique-RCP-1300.svg','synoptique-RCPGV-1300.svg','synoptique-RCPPZR-1300.svg',
    'synoptique-RCPGRAPPES-1300.svg','CPP-inventaire.svg','Diagramme-PT.svg']){
    const svg=svgSurface(file),initial=svg.root.getAttribute('viewBox');
    const box=()=>svg.root.getAttribute('viewBox').split(' ').map(Number),before=box();
    assert.equal(svg.fire('wheel',{deltaY:-150,deltaMode:0,clientX:400,clientY:300}).prevented,true);
    const zoomed=box();assert.ok(zoomed[2]<before[2],file);
    assert.ok(Math.abs(zoomed[0]+zoomed[2]/2-before[0]-before[2]/2)<1e-8,'point sous le pointeur conservé');
    svg.fire('pointerdown',{button:0,pointerId:1,clientX:400,clientY:300});
    svg.fire('pointermove',{pointerId:1,clientX:460,clientY:315});
    svg.fire('pointerup',{pointerId:1});
    assert.ok(box()[0]<zoomed[0]);
    assert.equal(svg.fire('click').stopped,true,'un glissement ne doit pas activer un renvoi');
    svg.fire('pointerdown',{button:0,pointerId:2,clientX:400,clientY:300});
    svg.fire('pointerup',{pointerId:2});assert.equal(svg.fire('click').stopped,undefined,'un clic normal reste possible');
    const panned=box(),m=E.make();m.state.powerPct=87;svg.update(E.instrumentSnapshot(m));
    assert.deepEqual(box(),panned,'les mises à jour de mesures ne réinitialisent pas la vue');
    if(file==='synoptique-RCP-1300.svg')assert.equal(svg.get('coeur-0-valeur').getAttribute('data-current-value'),'87');
    svg.receive({type:'centurion-svg-viewport-command',action:'fit'});
    assert.equal(svg.root.getAttribute('viewBox'),before.join(' '));
    assert.equal(svg.messages.at(-1).zoom,1);
    svg.receive({type:'centurion-svg-viewport-command',action:'in'});assert.ok(box()[2]<before[2]);
    assert.ok(initial);
  }
});

test('bibliothèques CC : rôles colorés, positions accessibles et sorties regroupées à la fin',()=>{
  for(const mode of ['regul','protect']){
    const cc=editorSurface(mode),palette=cc.query('.reg-palette'),groups=palette.querySelectorAll('.palette-group');
    assert.ok(groups.at(-1).classList.contains('output-palette'));
    for(const button of cc.queryAll('[data-block-type]'))assert.ok(['sensor','operator','actuator'].includes(button.dataset.role));
    for(const type of ['posgSignal','g3CountSignal','gcpCalibrationSignal']){
      const button=cc.query(`[data-block-type="${type}"]`);assert.ok(button);
      button.click();assert.equal(cc.state().nodes.at(-1).type,type);
    }
    assert.ok(groups.at(-1).querySelector('[data-block-type="boricationOut"]'));
    assert.ok(groups.at(-1).querySelector('[data-block-type="dilutionOut"]'));
  }
});

test('régulation CB : entrées moteur → graphe → dilution/borication réelles, sans débit supplémentaire',()=>{
  const model=E.make();model.controls.protectionsEnabled=false;
  model.state.rods.R=210;model.state.g3Count=615;model.controls.gcpCalibrationPct=4.2;
  const saved={format:'SimuREP-Regulation',version:1,name:'Essai CB',nodeCounter:8,viewport:{x:0,y:0,zoom:1},
    nodes:[['N1','posgSignal',{}],['N2','g3CountSignal',{}],['N3','gcpCalibrationSignal',{}],
      ['N4','compare',{relation:'<',threshold:220,whenTrue:1,whenFalse:0}],
      ['N5','compare',{relation:'>',threshold:240,whenTrue:1,whenFalse:0}],
      ['N6','boricationOut',{}],['N7','dilutionOut',{}]].map(([id,type,params])=>({id,type,x:0,y:0,label:type,params})),
    links:[{from:'N1',to:'N4',toPort:0},{from:'N1',to:'N5',toPort:0},
      {from:'N4',to:'N6',toPort:0},{from:'N5',to:'N7',toPort:0}]};
  const cc=editorSurface('regul',{saved});
  const app=fs.readFileSync(path.join(__dirname,'../centurion-app.js'),'utf8');
  const ctx=vm.createContext({E,model,regulationActive:true,protectionActive:false});
  vm.runInContext(app.slice(app.indexOf('  function applyEditorOutputs('),app.indexOf('  function handleEditorMessage('))
    +'globalThis.apply=applyEditorOutputs;',ctx);
  cc.bridge.receive({type:'centurion-editor-enable',enabled:true,signals:E.controlSignals(model)});
  const tick=()=>{
    const result=cc.bridge.receive({type:'centurion-editor-tick',dt:.1,refresh:false,signals:E.controlSignals(model)});
    ctx.apply(result);return result;
  };
  let out=tick();assert.equal(out.outputs.boricationOut,1);assert.equal(out.outputs.dilutionOut,0);
  const nodes=cc.state().nodes,signals=cc.state().signals;
  for(const [type,value,unit] of [['posgSignal',210,'pas extraits'],['g3CountSignal',615,'pas'],['gcpCalibrationSignal',4.2,'% PN']]){
    const actual=signals.get(nodes.find(n=>n.type===type).id);assert.equal(actual.value,value);assert.equal(actual.unit,unit);
  }
  assert.equal(E.rcvChargeBoronPpm(model),7000);
  const originalBoron=model.controls.rcvTankBoronPpm;E.advance(model,20);
  assert.ok(model.state.rcvInjectionLitres.borication>100);assert.ok(model.state.boronPpm>originalBoron);
  assert.equal(E.instrumentSnapshot(model).chargeM3h,36);
  model.state.rods.R=250;out=tick();assert.equal(out.outputs.dilutionOut,1);assert.equal(E.rcvChargeBoronPpm(model),0);
  E.advance(model,20);assert.ok(model.state.rcvInjectionLitres.dilution>100);
  model.state.rods.R=233;tick();assert.equal(E.rcvInjectionMode(model),'off');assert.equal(E.rcvChargeBoronPpm(model),originalBoron);
  E.setRcvGraphInjection(model,1,1);assert.equal(E.rcvInjectionMode(model),'off');
  assert.ok(model.state.events.some(e=>e.text.includes('simultanés')));
  E.setRcvGraphInjection(model,null,null);assert.equal(model.controls.rcvInjectionGraphMode,null);
  E.setRcvInjection(model,'dilution');assert.equal(E.rcvChargeBoronPpm(model),0,'commande manuelle récupérée');
});
