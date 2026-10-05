const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const E=require('../centurion-engine.js');

test('les programmes finis libèrent PTUR à leur dernière consigne ; seul le suivi de charge boucle',()=>{
  for(const name of ['temperature','down','step','lowstep','pilotage']){
    const m=E.make(),u=m.controls,s=m.state;
    s.demandPct=E.transientDemand(name,0);
    E.startTransient(m,name);
    u.transientElapsedS=E.TRANSIENTS[name].duration-0.1;
    E.step(m,0.1);
    const final=E.transientDemand(name,E.TRANSIENTS[name].duration);
    assert.equal(u.transientPhase,'finished',name);
    assert.equal(E.isTransientActive(m),false,name);
    assert.equal(s.demandPct,final,name);
    assert.equal(u.demandPct,final,name);
    E.advance(m,1);
    assert.equal(s.demandPct,final,'pas de saut après la fin');
    u.demandPct=42;E.step(m,0.1);
    assert.equal(s.demandPct,42,'la commande manuelle reprend');
  }
  const m=E.make();E.startTransient(m,'frequency');
  m.controls.transientElapsedS=E.TRANSIENTS.frequency.duration-0.1;
  E.step(m,0.1);E.advance(m,240);
  assert.equal(m.controls.transientPhase,'run');
  assert.ok(Math.abs(m.state.demandPct-70)<0.01,'deuxième cycle du suivi de charge');
  assert.equal(E.isTransientActive(m),true);
});

test('pause et reprise figent le programme seul ; interruption rend PTUR manuelle sans saut',()=>{
  const m=E.make(),u=m.controls,s=m.state;
  E.startTransient(m,'down');u.transientElapsedS=600;E.step(m,0.1);
  const elapsed=u.transientElapsedS,demand=s.demandPct,time=s.time;
  E.pauseTransient(m);E.advance(m,60);
  assert.equal(u.transientElapsedS,elapsed);
  assert.equal(s.demandPct,demand);
  assert.ok(s.time>=time+59.99,'la simulation physique continue');
  assert.equal(E.isTransientActive(m),true);
  E.resumeTransient(m);E.advance(m,60);
  assert.ok(Math.abs(u.transientElapsedS-elapsed-60)<1e-6);
  assert.ok(Math.abs(s.demandPct-demand+5)<1e-6);
  const atInterruption=s.demandPct;
  E.interruptTransient(m);E.advance(m,1);
  assert.equal(E.isTransientActive(m),false);
  assert.equal(s.demandPct,atInterruption);
  assert.equal(u.demandPct,atInterruption);
  u.demandPct=80;E.step(m,0.1);assert.equal(s.demandPct,80);
});

test('pause et interruption sont aussi disponibles pendant le raccordement initial',()=>{
  const m=E.make();E.startTransient(m,'lowstep');
  E.advance(m,30);const demand=m.state.demandPct;
  E.pauseTransient(m);E.advance(m,60);
  assert.equal(m.controls.transientPhase,'approach');
  assert.equal(m.state.demandPct,demand);
  E.resumeTransient(m);E.advance(m,30);
  assert.ok(Math.abs(m.state.demandPct-demand+10)<0.01);
  E.interruptTransient(m);
  assert.equal(E.isTransientActive(m),false);
});

test('interface : PTUR suit le programme, reste grisée en pause, puis redevient manuelle',()=>{
  const app=fs.readFileSync(path.resolve(__dirname,'../centurion-app.js'),'utf8');
  const html=fs.readFileSync(path.resolve(__dirname,'../centurion.html'),'utf8');
  const ids=['demandInput','demandValue','startTransient','pauseTransient','resumeTransient',
    'interruptTransient','transientState','programElapsed'];
  const elements=Object.fromEntries(ids.map(id=>[id,{value:'',textContent:'',disabled:false}]));
  for(const id of ids)assert.ok(html.includes(`id="${id}"`),id);
  const model=E.make();
  const source=app.slice(app.indexOf('  function renderTransientControls()'),
    app.indexOf('  function render()'));
  const ctx=vm.createContext({E,model,$:id=>elements[id],
    fmt:(v,d=0)=>Number(v).toFixed(d),tLabel:v=>String(v)});
  vm.runInContext(`${source}\nglobalThis.draw=renderTransientControls;`,ctx);
  E.startTransient(model,'down');model.controls.transientElapsedS=600;E.step(model,0.1);
  ctx.draw();
  assert.equal(elements.demandInput.value,model.state.demandPct);
  assert.equal(elements.demandInput.disabled,true);
  assert.equal(elements.startTransient.disabled,true);
  assert.equal(elements.pauseTransient.disabled,false);
  E.pauseTransient(model);ctx.draw();
  assert.equal(elements.demandInput.disabled,true);
  assert.equal(elements.resumeTransient.disabled,false);
  assert.match(elements.transientState.textContent,/en pause/);
  E.resumeTransient(model);E.interruptTransient(model);ctx.draw();
  assert.equal(elements.demandInput.disabled,false);
  assert.equal(elements.startTransient.disabled,false);
  assert.equal(elements.demandInput.value,model.controls.demandPct);
  model.state.demandPct=100;
  E.startTransient(model,'down');model.controls.transientElapsedS=E.TRANSIENTS.down.duration-0.1;
  E.step(model,0.1);ctx.draw();
  assert.equal(elements.demandInput.disabled,false);
  assert.equal(elements.demandInput.value,15);
  assert.match(elements.transientState.textContent,/terminé/);
});
