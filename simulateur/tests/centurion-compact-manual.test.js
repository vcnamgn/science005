const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const E=require('../centurion-engine'),State=require('../centurion-state'),H=require('../centurion-history');
const {svgSurface}=require('./helpers/svg-surface');
const app=fs.readFileSync(path.join(__dirname,'../centurion-app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../centurion.html'),'utf8');
const startup=fs.readFileSync(path.join(__dirname,'centurion-startup.test.js'),'utf8');
const ctx=vm.createContext({E,H,State,app,html,vm,assert,svgSurface,Blob,URL});
vm.runInContext(startup.slice(startup.indexOf('function application('),startup.indexOf('\ntest('))
  +'globalThis.application=application;',ctx);
const plain=x=>JSON.parse(JSON.stringify(x));
const pageFor=m=>ctx.application(app,null,{...E,make:()=>m});

test('pupitre GV : VVP TOR, position réalisée en transit et ARE réalisée → visée',()=>{
  const m=E.make(),page=pageFor(m),container=page.get('gvFeedControls');
  for(let n=1;n<=4;n++){
    const box=page.query(`input[data-kind="steam"][data-gv="${n}"]`);
    assert.equal(box.getAttribute('type'),'checkbox');assert.equal(box.checked,true);
    box.checked=false;container.fire('change',{target:box});
    assert.equal(m.controls.gvSteamValvePct[n-1],0);
    assert.equal(m.state.gv[n-1].steamValvePct,100,'le TOR ne téléporte pas l’organe physique');
  }
  E.step(m,.1);page.click('diagramZoomFit');page.get('gctaOpeningPressure').fire('input');
  assert.ok(m.state.gv[0].steamValvePct>0&&m.state.gv[0].steamValvePct<100);
  assert.equal(page.get('gvSteamOut0').textContent,`${m.state.gv[0].steamValvePct.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1})} %`);
  const are=page.query('input[data-kind="manual"][data-gv="1"]');
  are.value='70';container.fire('input',{target:are});
  assert.equal(m.controls.gvManualFeedPct[0],70);
  assert.match(page.get('gvManualOut0').textContent,/→ 70,0 %/);
  m.controls.gvGraphFeedPct[0]=25;
  page.click('toggleRegulationSynoptic');
  // La sortie CC est initialement absente ; injecter la consigne publiée pour vérifier l’affichage.
  m.controls.gvGraphFeedPct[0]=25;page.get('gctaOpeningPressure').fire('input');
  assert.match(page.get('gvManualOut0').textContent,/→ 25,0 %/);
  m.state.tripAt=0;page.get('gctaOpeningPressure').fire('input');
  assert.match(page.get('gvManualOut0').textContent,/→ 0,0 %/,'l’arrêt ARE est visible comme cible');
});

test('GCT-A : Tsat appliquée et visée restent distinctes pendant la rampe',()=>{
  const m=E.make(),page=pageFor(m),field=page.get('gctaOpeningPressure');
  field.value='60';field.fire('input');
  assert.equal(m.controls.gctAOpeningPressureBar,88.6);
  assert.equal(page.get('gctaSaturationTemp').textContent,`${E.saturationTemperatureC(88.6).toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1})} °C`);
  assert.equal(page.get('gctaSaturationTarget').textContent,`${E.saturationTemperatureC(60).toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1})} °C`);
  page.get('gctaOpeningPressureRate').value='instant';page.get('gctaOpeningPressureRate').fire('change');
  assert.equal(page.get('gctaSaturationTemp').textContent,page.get('gctaSaturationTarget').textContent);
});

test('ASG : voies A/B commandent les paires, vannes GV indépendantes et arrêt haut niveau conservé',()=>{
  const m=E.make(),page=pageFor(m);
  assert.equal(page.get('asgChannelA').disabled,true);
  page.get('asgManual').checked=true;page.get('asgManual').fire('change');
  const a=page.get('asgChannelA'),b=page.get('asgChannelB');
  a.checked=true;a.fire('change');assert.deepEqual(plain(m.controls.asgTrainEnabled),[true,true,false,false]);
  b.checked=true;b.fire('change');assert.deepEqual(plain(m.controls.asgTrainEnabled),[true,true,true,true]);
  const gv1=page.query('[data-asg-train="0"]');gv1.checked=false;gv1.fire('change');
  assert.equal(a.indeterminate,true);assert.equal(a.checked,false);
  m.state.gv[0].levelPct=95;a.checked=true;a.fire('change');
  assert.deepEqual(plain(m.controls.asgTrainEnabled),[false,true,true,true]);
  assert.equal(gv1.disabled,true);assert.equal(page.get('asgTrainStatus0').textContent,'HS');
  b.checked=false;b.fire('change');assert.deepEqual(plain(m.controls.asgTrainEnabled),[false,true,false,false]);
  page.get('asgManual').checked=false;page.get('asgManual').fire('change');assert.equal(a.disabled,true);
});

test('niveau PZR : bilan, densité et phase referment la variation en %/min, sans toucher au moteur',()=>{
  const m=E.make(),ids={pzrLevelRate:{textContent:''}},context=vm.createContext({E,model:m,
    $:id=>ids[id],fmt:(v,d)=>Number(v).toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d})});
  vm.runInContext(app.slice(app.indexOf('  let pzrTrendModel='),app.indexOf('  function renderSetpointControls('))
    +'globalThis.renderTrend=renderPzrLevelTrend;globalThis.rates=()=>pzrTrendRates;',context);
  const before=E.cppInventory(m.state.primaryMassKg-m.state.vaporMassKg,m.state.tavgC,m.state.pressureBar);
  const pzrVolume=before.components.pzr.massKg/before.densityKgM3/(before.components.pzr.fillPct/100);
  context.renderTrend();assert.equal(context.rates().total,0);
  m.state.time=60;m.state.primaryMassKg+=1000;m.state.vaporMassKg+=100;m.state.tavgC-=1;
  const saved=JSON.stringify(m);context.renderTrend();assert.equal(JSON.stringify(m),saved,'diagnostic en lecture seule');
  const r=context.rates(),after=E.cppInventory(m.state.primaryMassKg-m.state.vaporMassKg,m.state.tavgC,m.state.pressureBar);
  assert.ok(Math.abs(r.mass-1000/before.densityKgM3/pzrVolume*100)<1e-9);
  assert.ok(Math.abs(r.phase+100/before.densityKgM3/pzrVolume*100)<1e-9);
  const density=(m.state.primaryMassKg-m.state.vaporMassKg)*(1/after.densityKgM3-1/before.densityKgM3)/pzrVolume*100;
  assert.ok(Math.abs(r.density-density)<1e-9);
  assert.ok(Math.abs(r.total-r.mass-r.phase-r.density)<1e-9);
  assert.ok(Math.abs(r.total-after.components.pzr.fillPct+before.components.pzr.fillPct)<1e-9);
  assert.match(ids.pzrLevelRate.textContent,/entrées\/sorties.*densité.*phase/);
  context.renderTrend();assert.equal(context.rates().total,r.total,'valeurs maintenues en pause');
  context.model=E.make();context.renderTrend();assert.equal(context.rates().total,0,'nouvelle partie sans dérivée ancienne');
});

test('Espace dans le parent cadre le synoptique, sans voler la saisie ni les autres onglets',()=>{
  const page=pageFor(E.make()),key=target=>{
    const event={key:' ',code:'Space',target,preventDefault(){this.prevented=true;}};page.key(event);return event;
  };
  const count=()=>page.messages.filter(m=>m.type==='centurion-svg-viewport-command').length;
  const start=count();assert.equal(key(page.get('gctaOpeningPressure')).prevented,undefined);assert.equal(count(),start);
  assert.equal(key(page.get('runButton')).prevented,undefined);assert.equal(count(),start);
  assert.equal(key({localName:'div'}).prevented,true);assert.equal(count(),start+1);assert.equal(page.messages.at(-1).action,'fit');
  page.query('.tab[data-view="graphiques"]').click();
  assert.equal(key({localName:'div'}).prevented,undefined);assert.equal(count(),start+1);
});
