const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../centurion-engine'),State=require('../centurion-state'),Cert=require('../centurion-certificate');
const {editorSurface}=require('./helpers/editor-surface');
const ui={speed:200,diagram:'inventory',selectedGv:2,activeView:'synoptiques',historyFollowing:true,historyEndS:null,
  historyWindow:'1800',traceSet:'flows',coreTrailWindow:'300',ptTrailWindow:'14400',alarmLimits:{}};
const snapshot=editor=>editor.bridge.receive({type:'centurion-editor-save'}).saved;
const plain=value=>JSON.parse(JSON.stringify(value));

test('état JSON : reprise identique de la brèche, des tuyaux, poisons et inventaires',()=>{
  const m=E.make();m.controls.protectionGraphMode=false;E.initiate(m,'break',{areaCm2:300,loop:2});
  E.setRcvInjection(m,'borication');E.advance(m,30);E.setRisOperation(m,'off');
  const archive=Cert.createArchive(E);archive.observe(m);
  const editors={regul:snapshot(editorSurface()),protect:snapshot(editorSurface('protect'))};
  const raw=State.write(E,m,editors,ui,archive.save());
  const loaded=State.read(E,JSON.stringify(raw));
  assert.deepEqual(loaded.model,m);assert.notEqual(loaded.model,m);
  E.advance(m,10);E.advance(loaded.model,10);
  assert.deepEqual(loaded.model,m,'le même moteur poursuit exactement la même trajectoire');
  assert.equal(loaded.model.controls.breakAreaCm2,300);assert.ok(loaded.model.state.breakKgS>0);
  assert.equal(loaded.model.controls.risPumpMode,'off');
});

test('état JSON : graphe et mémoires des filtres, intégrateurs et dérivés restaurés',()=>{
  const graph={format:'SimuREP-Regulation',version:1,name:'Test dynamique',nodes:[
    {id:'N1',type:'constant',x:0,y:0,params:{value:2,unit:'pas/min'}},
    {id:'N2',type:'filter',x:150,y:0,params:{tau:60}},
    {id:'N3',type:'integrator',x:300,y:0,params:{min:0,max:260,outputUnit:'pas extraits'}},
    {id:'N4',type:'posg',x:450,y:0,params:{}},
    {id:'N5',type:'derivative',x:450,y:100,params:{tau:3}}],links:[
      {from:'N1',to:'N2',toPort:0},{from:'N2',to:'N3',toPort:0},{from:'N3',to:'N4',toPort:0},
      {from:'N2',to:'N5',toPort:0}]};
  const a=editorSurface('regul',{saved:graph}),b=editorSurface();
  const signals=E.controlSignals(E.make());a.bridge.receive({type:'centurion-editor-enable',enabled:true,signals});
  for(let i=0;i<100;i++)a.bridge.receive({type:'centurion-editor-tick',dt:.1,signals});
  const saved=snapshot(a);assert.ok(saved.runtime.length>0);
  assert.equal(b.bridge.receive({type:'centurion-editor-validate',saved}).error,undefined);
  assert.equal(b.bridge.receive({type:'centurion-editor-restore',saved}).error,undefined);
  assert.deepEqual(plain(snapshot(b).runtime),plain(saved.runtime));
  for(let i=0;i<100;i++){
    const tick={type:'centurion-editor-tick',dt:.1,signals};
    assert.deepEqual(plain(b.bridge.receive(tick).outputs),plain(a.bridge.receive(tick).outputs));
  }
});

test('état JSON : fichiers incompatibles ou corrompus rejetés avant remplacement',()=>{
  const raw=State.write(E,E.make(),{regul:snapshot(editorSurface()),protect:snapshot(editorSurface('protect'))},ui,null);
  for(const mutate of [r=>r.version=99,r=>r.model.state.loops.pop(),r=>r.model.controls.breakAreaCm2=300,
    r=>r.model.state.xenon32[0]='NaN',r=>r.model.state.precursors[0]=null,
    r=>r.ui.ptTrailWindow='100000',r=>r.model.controls.pressureGraphHeaterKW='chaud']){
    const invalid=structuredClone(raw);mutate(invalid);assert.throws(()=>State.read(E,invalid));
  }
  const invalid=JSON.parse(JSON.stringify(raw));invalid.model.state['__proto__']={bad:1};
  // Une clé propre issue du JSON est refusée, même sans fusion d'objets.
  assert.throws(()=>State.read(E,JSON.stringify(raw).replace('"state":{','"state":{"__proto__":{},')),/interdite/);
  assert.equal(raw.model.state.time,0);
});

test('certificat : archive reprise avec ses événements et diagramme P–T autonome',()=>{
  const m=E.make(),archive=Cert.createArchive(E);archive.observe(m);E.initiate(m,'trip');E.advance(m,4);archive.observe(m);
  const other=Cert.createArchive(E);other.restore(m,archive.save());
  assert.deepEqual(other.getRecords(),archive.getRecords());
  const curves={lower:[[10,5],[300,125]],upper:[[10,31],[300,155]],saturation:[[0,0],[350,170]]};
  const svg=Cert.ptSvg(m,E,curves);
  assert.match(svg,/width="1280" height="850"/);assert.match(svg,/id="pt-trace" d="M/);
  assert.match(svg,/id="pt-point" cx="/);assert.doesNotMatch(svg,/<script/);
});
