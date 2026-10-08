const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const E=require('../centurion-engine.js');
const {editorSurface}=require('./helpers/editor-surface');
const {svgSurface}=require('./helpers/svg-surface');
const app=fs.readFileSync(path.join(__dirname,'../centurion-app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../centurion.html'),'utf8');
const startup=fs.readFileSync(path.join(__dirname,'centurion-startup.test.js'),'utf8');
const context=vm.createContext({E,H:require('../centurion-history'),State:require('../centurion-state'),app,html,vm,assert,svgSurface,Blob,URL});
vm.runInContext(startup.slice(startup.indexOf('function application('),startup.indexOf('\ntest('))
  +'globalThis.application=application;',context);

test('LIM. TURB. : graphe réel, plafond dynamique, vapeur/réseau et retour sans limite CC',()=>{
  const model=E.make();
  const saved={format:'SimuREP-Regulation',version:1,name:'Essai limite turbine',nodeCounter:2,
    viewport:{x:0,y:0,zoom:1},nodes:[
      {id:'N1',type:'constant',label:'Plafond',x:0,y:0,params:{value:60,unit:'%'}},
      {id:'N2',type:'turbineLimitOut',label:'LIM. TURB.',x:250,y:0,params:{}}],
    links:[{from:'N1',to:'N2',toPort:0}]};
  const cc=editorSurface('regul',{saved});
  assert.equal(cc.query('[data-block-type="turbineLimitOut"]').dataset.role,'actuator');
  const page=context.application(app,null,{...E,make:()=>model},{regulationEditor:cc.bridge});
  assert.equal(model.controls.turbineLimitGraphPct,null,'CC inactif à l’ouverture');
  page.get('simSpeed').value='1';page.get('simSpeed').fire('change');
  page.click('toggleRegulationSynoptic');page.frame(200);
  assert.equal(model.controls.turbineLimitGraphPct,60);
  assert.equal(cc.state().signals.get('N2').unit,'%');
  assert.equal(model.controls.demandPct,100,'la demande d’origine est conservée');
  assert.match(page.get('demandValue').textContent,/LIM\. TURB\. 60/);
  page.click('runButton');
  const run=seconds=>{for(let i=0;i<seconds*10;i++)page.frame(100);};
  run(12);assert.ok(Math.abs(model.state.turbinePct-60)<1e-8);
  assert.ok(model.state.totalTurbineSteamKgS<=4*E.C.nominalSteamKgSPerGV*.6+1e-6);
  assert.ok(model.state.electricMW<=780+1e-6);
  assert.equal(E.controlSignals(model).ptur[0],model.state.turbinePct);
  assert.equal(E.controlSignals(model).turbineLimitSignal[0],60);
  assert.equal(E.controlSignals(model).gcpPowerSignal[0],60);
  cc.state().nodes.find(n=>n.id==='N1').params.value=80;
  run(6);assert.equal(model.controls.turbineLimitGraphPct,80);
  assert.ok(Math.abs(model.state.turbinePct-80)<1e-8,'reprise de charge suivant le plafond');
  model.controls.demandPct=50;run(8);
  assert.ok(Math.abs(model.state.turbinePct-50)<1e-8,'une demande inférieure au plafond reste prioritaire');
  cc.state().links.splice(0);run(.5);
  assert.equal(model.controls.turbineLimitGraphPct,null,'sortie déconnectée : plafond libéré');
  cc.state().links.push({from:'N1',to:'N2',toPort:0});run(.5);
  assert.equal(model.controls.turbineLimitGraphPct,80);
  page.click('toggleRegulationSynoptic');
  assert.equal(model.controls.turbineLimitGraphPct,null,'désactivation CC : plafond libéré');
  assert.equal(E.controlSignals(model).turbineLimitSignal[0],100);
});

test('LIM. TURB. : programmes de charge et pause soumis au plafond ; arrêt turbine prioritaire',()=>{
  const m=E.make();m.controls.protectionsEnabled=false;
  m.controls.turbineLimitGraphPct=25;
  E.startTransient(m,'frequency');E.advance(m,20);
  assert.equal(m.state.demandPct,100,'le programme poursuit sa consigne prévue');
  assert.ok(Math.abs(m.state.turbinePct-25)<1e-8);
  E.pauseTransient(m);const elapsed=m.controls.transientElapsedS;
  m.controls.turbineLimitGraphPct=60;E.advance(m,10);
  assert.equal(m.controls.transientElapsedS,elapsed);
  assert.ok(Math.abs(m.state.turbinePct-60)<1e-8,'le plafond évolue aussi quand le programme est en pause');
  m.state.turbineTrip=true;m.controls.turbineLimitGraphPct=100;E.step(m,.1);
  assert.ok(m.state.turbinePct<60,'un plafond élevé ne neutralise pas l’arrêt turbine');
  for(const [limit,target] of [[120,100],[-10,0],[NaN,100],[null,100]]){
    m.controls.turbineLimitGraphPct=limit;assert.equal(E.turbineLoadTargetPct(m),target);
  }
});
