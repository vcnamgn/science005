const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../centurion-engine'),H=require('../centurion-history');
const {surface}=require('./helpers/history-surface');
function chartHarness(){const m=E.make();E.step(m,.1);const point=E.historyPoint(m);
  m.state.time=7200;m.state.history=Array.from({length:73},(_,i)=>({...structuredClone(point),t:i*100}));
  const h=surface(m.state);h.chart.draw();return h;}

test('catalogue : mesures du moteur, des quatre boucles/GV et des sources CC',()=>{
  const m=E.make();E.advance(m,2);const p=E.historyPoint(m),defs=H.catalog(E);
  assert.ok(defs.length>200);assert.equal(new Set(defs.map(d=>d.id)).size,defs.length);
  for(const d of defs)assert.ok(Number.isFinite(d.value(p)),d.id);
  assert.equal(defs.find(d=>d.id==='gv.2.pressure').value(p),m.state.gv[2].pressureBar);
  assert.equal(defs.find(d=>d.id==='rod.R').value(p),m.state.rods.R);
  for(const [i,[name,[value]]] of Object.entries(E.controlSignals(m)).entries())
    assert.ok(Math.abs(defs.find(d=>d.id==='cc.'+name).value(p)-value)<=Math.max(1e-7,Math.abs(value)*1e-7),name);
  assert.ok(H.search(defs,'pression 002MP').some(d=>d.id==='pressure'));
  assert.ok(H.search(defs,'decalibrage').some(d=>d.id==='cc.gcpCalibrationSignal'));
  assert.ok(H.search(defs,'thermosiphon boucle 4').some(d=>d.id==='loops.3.naturalFlowKgS'));
  assert.ok(H.search(defs,'variable inexistante').length===0);
});

test('présélections modifiables : ajouter, masquer, retirer, rechercher',async()=>{
  const h=chartHarness();await h.set('traceSet','pressures');assert.equal(h.chart.view.traces.length,2);
  await h.add('fuelC');assert.equal(h.get('traceSet').value,'custom');assert.equal(h.chart.view.traces.length,3);
  assert.match(h.get('historyLegend').innerHTML,/crayon/);
  const toggle=h.get('historyShow2');toggle.checked=false;await toggle.fire('change');
  assert.doesNotMatch(h.get('historyLegend').innerHTML,/crayon/);assert.equal(h.chart.view.traces.length,3);
  await h.get('historyRemove1').fire('click');assert.equal(h.chart.view.traces.length,2);
  assert.equal(h.chart.view.traces[1].id,'fuelC');
  await h.set('historySearch','thermosiphon boucle 4','input');assert.match(h.get('historyVariable').innerHTML,/naturalFlowKgS/);
  await h.get('historyClear').fire('click');assert.equal(h.chart.view.traces.length,0);
});

test('axes indépendants à gauche, couleurs des courbes et échelles physiques',async()=>{
  const h=chartHarness();await h.set('traceSet','pressures');await h.add('rod.R');
  const traces=h.chart.view.traces,strokes=h.get('historyChart').context.strokes;
  assert.equal(new Set(traces.map(o=>o.color)).size,traces.length,'couleurs distinctes à l’ajout et en présélection');
  for(const o of traces){const axis=strokes.find(s=>s.color===o.color&&s.path.length===2&&s.path[0][0]===s.path[1][0]);
    assert.ok(axis,o.id+' : axe vertical');assert.ok(axis.path[0][0]<300,'tous les axes sont à gauche');}
  await h.set('historyMode0','fixed');await h.set('historyMin0','100','input');await h.set('historyMax0','170','input');
  assert.deepEqual(H.rangeFor(h.chart.defs.find(d=>d.id==='pressure'),h.chart.view.traces[0],h.state.history),[100,170]);
  await h.set('historyMin0','180','input');assert.equal(h.chart.view.traces[0].min,100,'borne invalide rejetée');
  assert.equal(h.get('historyMin0').attrs['aria-invalid'],'true');
  const d=h.chart.defs.find(d=>d.id==='power');assert.equal(H.rangeFor(d,H.trace(d),[{power:135}])[1],140);
  assert.ok(h.get('reactivityChart').context.labels.some(l=>l.text.includes('Réactivité')));
  assert.ok(h.get('reactivityChart').context.strokes.filter(s=>s.color==='#cddedc').length>=7);
});

test('curseur : même instant sur les deux graphes, clic figé et copie tableur',async()=>{
  const h=chartHarness();h.state.history.at(-2).power=80;h.chart.draw();
  await h.get('historyChart').fire('pointermove',{clientX:650});
  assert.match(h.get('historyCursorLabel').textContent,/Lecture/);
  await h.get('historyChart').fire('click',{clientX:650});
  const frozen=h.chart.save().pinned;assert.ok(frozen);assert.equal(h.get('historySnapshot').hidden,false);
  h.state.time=7500;h.state.history.push({...h.state.history.at(-1),t:7500,power:125});h.chart.draw();
  assert.deepEqual(h.chart.save().pinned,frozen,'la simulation ne modifie pas la lecture figée');
  await h.get('historyCopy').fire('click');assert.match(h.copied[0],/^Instant\tVariable\tValeur\tUnité/);
  assert.ok(h.copied[0].includes(H.timeLabel(frozen.time)));assert.ok(h.copied[0].split('\n').length===6);
  assert.match(h.copied[0],/REAC.*Réactivité/);
  await h.get('historyUnpin').fire('click');assert.equal(h.chart.view.pinned,null);
  assert.equal(h.get('historyCopy').disabled,true);
});

test('période : durée, bornes saisies, glissières et déplacement dans l’aperçu',async()=>{
  const h=chartHarness();assert.equal(h.get('historyRangeLabel').textContent,'01:55:00 – 02:00:00');
  await h.set('historyWindow','14400');assert.equal(h.get('historyRangeLabel').textContent,'00:00:00 – 02:00:00');
  await h.set('historyWindow','300');h.get('historyStart').value='00:55:00';h.get('historyEnd').value='01:00:00';
  await h.get('historyEnd').fire('change');assert.equal(h.get('historyRangeLabel').textContent,'00:55:00 – 01:00:00');
  h.state.time=7500;h.chart.draw();assert.equal(h.get('historyRangeLabel').textContent,'00:55:00 – 01:00:00');
  await h.get('historyPrevious').fire('click');assert.equal(h.get('historyRangeLabel').textContent,'00:52:30 – 00:57:30');
  await h.set('historyStartRange','3000','input');assert.equal(h.chart.view.start,3000);
  await h.set('historyEndRange','4200','input');assert.equal(h.chart.view.end,4200);
  await h.get('historyOverview').fire('pointerdown',{button:0,clientX:470,pointerId:1});
  await h.get('historyOverview').fire('pointermove',{clientX:500,pointerId:1});
  await h.get('historyOverview').fire('pointerup');assert.ok(h.chart.view.start>3000,'la sélection centrale se déplace');
  await h.get('historyLive').fire('click');assert.equal(h.chart.view.following,true);
  assert.equal(h.get('historyEnd').value,'02:05:00');
  await h.set('historyStart','00:10:00','input');await h.set('historyEnd','00:20:00','input');
  h.chart.draw();assert.equal(h.get('historyStart').value,'00:10:00','saisie préservée pendant le rafraîchissement');
  await h.get('historyApplyPeriod').fire('click');
  assert.equal(h.get('historyRangeLabel').textContent,'00:10:00 – 00:20:00');
});

test('personnalisation restaurée et anciennes mesures manquantes sans fausse valeur',async()=>{
  const h=chartHarness();await h.add('heaterKW');await h.set('historyMode4','fixed');
  await h.set('historyMax4','2300','input');await h.get('historyPin').fire('click');
  const saved=h.chart.save(),other=chartHarness();other.chart.restore(saved);other.chart.draw();
  assert.deepEqual(other.chart.save(),saved);
  const old={t:0,power:100,pressure:155},d=h.chart.defs.find(d=>d.id==='heaterKW');
  assert.equal(d.value(old),undefined,'pas de valeur actuelle injectée dans l’ancien historique');
  assert.equal(H.nearest([{t:0},{t:10}],6).t,10);
  assert.throws(()=>H.validate({...saved,traces:[{...saved.traces[0],min:8,max:2}]}),/échelle/);
});

test('huit heures de données et axes multiples : pas de débordement de pile',async()=>{
  const h=chartHarness(),p=h.state.history[0];h.state.time=28800;
  h.state.history=Array.from({length:28800},(_,i)=>({...p,t:i+1}));await h.set('traceSet','temperatures');
  await h.set('historyWindow','14400');assert.doesNotThrow(()=>h.chart.draw());
});
test('l’échantillon conserve les mesures nécessaires aux courbes', () => {
  const model = E.make();
  E.step(model, 0.1);
  const p = model.state.history.at(-1);
  assert.ok(p);
  for (const key of ['cold','hot','tric','pzrTemp','pzrLevel','gvPressure','gvTemp','rods','breakDensity',
    'steamTotal','steamGctA','steamVpu','thermalPower','residualPower'])
    assert.ok(p[key] !== undefined, key);
  assert.equal(p.rods.R, model.state.rods.R);
  assert.equal(p.gvPressure[0], model.state.gv[0].pressureBar);
  assert.equal(p.pzrLevel, model.state.pzrLevelPct);
  assert.ok(Math.abs(p.steamTotal-p.steamGctA-p.steamVpu)<1e-9);
});

test('historique après AAR : courbes de fission, thermique totale et résiduelle distinctes',()=>{
  const model=E.make();E.initiate(model,'trip');E.advance(model,60);
  const point=model.state.history.at(-1);
  assert.ok(point.residualPower>2&&point.residualPower<4);
  assert.ok(Math.abs(point.thermalPower-point.power-point.residualPower)<1e-8);
  const h=surface(model.state);h.chart.draw();
  assert.match(h.get('historyLegend').innerHTML,/fission.*thermique.*résiduelle/i);
  const paths=h.get('historyChart').context.strokes;
  assert.ok(paths.some(s=>s.color===h.chart.view.traces[2].color&&s.path.length>2));
});

test('historique vapeur : un GCT-A débitant est distinct du VPU et inclus dans le total',()=>{
  const m=E.make();m.controls.protectionsEnabled=false;
  m.controls.gctAOpeningPressureBar=60; // Maintenir le rejet pendant la fenêtre échantillonnée.
  m.state.gv[1].tempC=E.C.gctATempC+1;
  m.state.gv[1].pressureBar=E.saturationPressureBar(m.state.gv[1].tempC);
  E.advance(m,2);
  const point=m.state.history.at(-1);
  assert.ok(point.steamGctA>0);
  assert.ok(point.steamVpu>0);
  assert.ok(Math.abs(point.steamTotal-point.steamGctA-point.steamVpu)<1e-9);
});

test('les mesures restent disponibles au-delà de quatre heures avec une limite de huit heures', () => {
  const afterFourHours = E.make();
  afterFourHours.state.history = Array.from({length: 14400}, (_, i) => ({t: i}));
  E.step(afterFourHours, 0.1);
  assert.equal(afterFourHours.state.history.length, 14401);

  const full = E.make();
  full.state.history = Array.from({length: 28800}, (_, i) => ({t: i}));
  E.step(full, 0.1);
  assert.equal(full.state.history.length, 28800);
  assert.equal(full.state.history[0].t, 1);
});
