const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../centurion-engine.js');
const html = fs.readFileSync(path.join(__dirname,'../centurion-cc-regul.html'),'utf8');

function appSignals(model) {
  const app=fs.readFileSync(path.join(__dirname,'../centurion-app.js'),'utf8');
  const source=app.slice(app.indexOf('  function editorSignals()'),app.indexOf('  function sendEditorTick('));
  const context=vm.createContext({E,model});
  vm.runInContext(source+';globalThis.values=editorSignals();',context);
  return context.values;
}

// Exécuter les fonctions du véritable éditeur, sans son interface DOM.
function editorFunction(name) {
  const start=html.indexOf(`    function ${name}(`);
  assert.ok(start>=0, name);
  const tail=html.slice(start);
  const end=/\n    }\r?\n/.exec(tail);
  assert.ok(end, name);
  return tail.slice(0,end.index+6);
}
function editor(mode='protect') {
  const context=vm.createContext({console});
  const specs=html.slice(html.indexOf('    const BLOCK_TYPES ='),html.indexOf('    const SPECIAL_CURVE_PRESETS ='));
  const functions=['regSignalDisplay','regSourceSignal','compareOperatorValue','runtimeStateFor',
    'evaluateRegulationGraph','formatRegLinkSignal','regInputKey','resetRegRuntime',
    'migrateCenturionProtection','centurionDefaultModel'].map(editorFunction).join('\n');
  vm.runInContext(`
    const CENTURION_EDITOR_MODE='${mode}', REG_MODEL_FORMAT='SimuREP-Regulation', REG_MODEL_VERSION=1;
    const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
    const fmt=(v,d)=>Number(v).toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d});
    const C={PNOM:3817}; const s=new Proxy({power:3817},{get:(o,k)=>o[k]??0});
    const maximumLinearPower=()=>0;
    let regNodes=[],regLinks=[],regRuntimeStates=new Map(),regLastSignals=new Map(),regLastDiagnostics=[];
    let centurionInput=null;
    const REG_MANUAL_OUTPUT_TYPES=new Set(['aarOut','risOut','gv1Out','gv2Out','gv3Out','gv4Out']);
    const $=()=>({textContent:JSON.stringify({nodes:[],links:[],nodeCounter:0})});
    ${specs}
    ${functions}
    globalThis.cc={
      setInput:(power)=>{centurionInput={signals:{pow1:[power,'% PN'],mp1Signal:[155,'bar abs.'],voltageSignal:[0,'TOR']}};},
      setSignals:signals=>{centurionInput={signals};},
      setModel:(model)=>{regNodes=model.nodes;regLinks=model.links;resetRegRuntime();},
      evaluate:evaluateRegulationGraph,display:regSignalDisplay,source:regSourceSignal,
      reset:resetRegRuntime,migrate:migrateCenturionProtection,defaults:centurionDefaultModel,
      format:formatRegLinkSignal
    };
  `,context);
  const cc=context.cc;
  const model=cc.defaults();cc.setModel(model);cc.setInput(100);
  return {cc,model};
}

test('POW1 à 135 % traverse application, source, affichage et comparateur de protection', () => {
  const m=E.make();m.state.powerPct=135;
  const values=appSignals(m);
  assert.equal(values.pow1[0],135);
  const {cc,model}=editor();cc.setInput(values.pow1[0]);
  assert.equal(cc.source('pow1').value,135);
  assert.match(cc.display('pow1'),/135,0.*% PN/);
  const evaluation=cc.evaluate(0.1,true);
  const flux=model.nodes.find(n=>n.type==='pow1');
  assert.equal(evaluation.signals.get(flux.id).value,135);
  assert.equal(evaluation.outputs.aarOut.value,1);
});

test('signaux vapeur du CC : chaque GV et MD1 incluent le débit GCT-A', () => {
  const m=E.make();m.controls.protectionsEnabled=false;
  const hot=m.state.gv[3];hot.tempC=298.2;hot.pressureBar=E.saturationPressureBar(hot.tempC);
  E.step(m,0.1);
  const signals=appSignals(m);
  assert.ok(hot.dumpKgS>0);
  m.state.gv.forEach((g,i)=>{
    assert.equal(signals[`gv${i+1}SteamSignal`][0],g.turbineSteamKgS+g.dumpKgS);
    assert.equal(signals[`gv${i+1}SteamSignal`][1],'kg/s');
  });
  const total=m.state.gv.reduce((q,g)=>q+g.turbineSteamKgS+g.dumpKgS,0);
  assert.ok(Math.abs(signals.md1Signal[0]*1000-total)<1e-9);
});

test('dérivateur : démarrage sans impulsion, rampe positive et négative en % PN/s', () => {
  for (const slope of [2,-2]) {
    const {cc,model}=editor();
    const derivative=model.nodes.find(n=>n.type==='derivative');
    cc.evaluate(0.1,true);
    for(let i=1;i<=40;i++){
      cc.setInput(100+slope*i*0.1);
      const evaluation=cc.evaluate(0.1,true);
      const out=evaluation.signals.get(derivative.id);
      assert.equal(out.unit,'% PN/s');
      if(i===40)assert.ok(Math.abs(out.value-slope)<0.002);
      assert.equal(evaluation.outputs.aarOut.value,0);
    }
  }
});

test('dérivateur : forte baisse, pause et réinitialisation sans nouveau pic', () => {
  const {cc,model}=editor();const id=model.nodes.find(n=>n.type==='derivative').id;
  assert.equal(cc.evaluate(0.1,true).signals.get(id).value,0);
  cc.setInput(80);
  const stepped=cc.evaluate(0.1,true);
  assert.ok(stepped.signals.get(id).value<-5);
  assert.equal(stepped.outputs.aarOut.value,1);
  const frozen=stepped.signals.get(id).value;
  cc.setInput(70);
  assert.equal(cc.evaluate(0,false).signals.get(id).value,frozen);
  cc.reset();
  assert.equal(cc.evaluate(0.1,true).signals.get(id).value,0);
  assert.equal(cc.evaluate(0.1,true).outputs.aarOut.value,0);
});

test('migration des protections sauvegardées : remplacer la source magique et conserver les seuils', () => {
  const {cc}=editor();
  const model={nodes:[{id:'N1',type:'pow1',params:{}},
    {id:'N2',type:'fluxRateSignal',label:'Ancien débit flux',x:230,y:100},
    {id:'N3',type:'compare',params:{threshold:7}}],
    links:[{from:'N2',to:'N3',toPort:0}],nodeCounter:3};
  cc.migrate(model);cc.migrate(model);
  assert.equal(model.nodes[1].type,'derivative');
  assert.equal(model.nodes[1].params.tau,0.5);
  assert.equal(model.nodes[2].params.threshold,7);
  assert.equal(model.links.length,2);
  assert.ok(model.links.some(l=>l.from==='N1'&&l.to==='N2'));
  const withoutFlux={nodes:[{id:'N1',type:'fluxRateSignal',x:0,y:0}],links:[],nodeCounter:1};
  cc.migrate(withoutFlux);
  assert.equal(withoutFlux.nodes.length,2);
  assert.equal(withoutFlux.nodes[1].type,'pow1');
  assert.equal(withoutFlux.links[0].from,withoutFlux.nodes[1].id);
});

test('les quatre chaînes GV du vrai graphe stabilisent le niveau GE après un écart d’inventaire', () => {
  const {cc,model:graph}=editor('regul');
  graph.nodes=graph.nodes.filter(n=>/^gv[1-4]LevelSignal$/.test(n.type)
    || /GV[1-4]|ARE[1-4]|VAP[1-4]/.test(n.label));
  const ids=new Set(graph.nodes.map(n=>n.id));
  graph.links=graph.links.filter(l=>ids.has(l.from)&&ids.has(l.to));
  cc.setModel(graph);
  const m=E.make();m.controls.protectionsEnabled=false;
  m.state.gv[0].waterKg-=1500;m.state.gv[1].waterKg+=1500;
  for(let i=0;i<2400;i++){
    const signals={gvSetpointSignal:[55,'%']};
    m.state.gv.forEach((g,n)=>{
      Object.assign(g,E.gvLevels(g.waterKg));
      signals[`gv${n+1}LevelSignal`]=[g.levelPct,'%'];
      signals[`gv${n+1}SteamSignal`]=[g.steamKgS,'kg/s'];
    });
    cc.setSignals(signals);
    const {outputs}=cc.evaluate(0.1,true);
    m.controls.gvGraphFeedPct=[1,2,3,4].map(n=>outputs[`gv${n}Out`].value);
    E.step(m,0.1);
  }
  assert.ok(m.state.gv.every(g=>Math.abs(g.levelPct-55)<0.2),
    m.state.gv.map(g=>g.levelPct.toFixed(3)).join(', '));
});
