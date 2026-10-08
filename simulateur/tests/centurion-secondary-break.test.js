const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../centurion-engine'),State=require('../centurion-state');
const {editorSurface}=require('./helpers/editor-surface');
const close=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} ≠ ${b}`);

test('déclenchement manuel GMPP : sans AAR/IS/CIA, chaleur coupée, inertie puis thermosiphon',()=>{
  const m=E.make();m.controls.protectionGraphMode=true;
  assert.equal(E.tripPrimaryPumps(m),true);assert.equal(E.tripPrimaryPumps(m),false);
  assert.equal(m.state.tripDemandAt,null);assert.equal(m.state.risDemandAt,null);
  assert.notEqual(E.reactorOperatingState(m.state).code,'CIA');
  assert.equal(m.state.pumpHeatMW,0);
  assert.equal(m.state.events.filter(e=>e.text?.includes('Déclenchement manuel')||e.message?.includes('Déclenchement manuel')).length,1);
  const flow=E.C.nominalPrimaryFlowKgS/4;
  E.advance(m,10);assert.ok(m.state.loops.every(l=>l.forcedFlowKgS>0&&l.forcedFlowKgS<flow));
  E.advance(m,50);assert.ok(m.state.loops.every(l=>l.forcedFlowKgS===0&&l.naturalFlowKgS>0));
  assert.equal(m.state.tripDemandAt,null);assert.equal(m.state.risDemandAt,null);
  const ended=E.make();ended.state.endState='safe';assert.equal(E.tripPrimaryPumps(ended),false);
});

test('brèche vapeur : débit nul à 1 bar, régime étranglé, continuité et section linéaire',()=>{
  assert.equal(E.secondaryBreakFlowKgS(300,1,100),0);
  assert.equal(E.secondaryBreakFlowKgS(0,65,281),0);
  const q=E.secondaryBreakFlowKgS(300,65,281);
  assert.ok(q>170&&q<200,`débit nominal d’étude : ${q} kg/s`);
  close(E.secondaryBreakFlowKgS(600,65,281),2*q);
  close(E.secondaryBreakFlowKgS(300,130,281),2*q);
  const p=Math.pow(1.15,1.3/.3);
  close(E.secondaryBreakFlowKgS(300,p-1e-7,120),E.secondaryBreakFlowKgS(300,p+1e-7,120),1e-5);
  assert.ok(E.secondaryBreakFlowKgS(300,1.001,100)<E.secondaryBreakFlowKgS(300,1.1,100));
});

test('GV choisi : vapeur perdue comptée une seule fois, bilans masse/enthalpie fermés',()=>{
  const m=E.make(),s=m.state,g=s.gv[1],dt=.1;
  m.controls.protectionGraphMode=true;
  E.initiate(m,'secondaryBreak',{gv:2,areaCm2:300});
  assert.equal(s.tripDemandAt,null);assert.equal(s.risDemandAt,null);
  const mass=g.waterKg,T=g.tempC,energy=g.thermalEnergyJ,primary=s.primaryMassKg;
  E.step(m,dt);
  assert.ok(g.secondaryBreakKgS>0);
  assert.ok(s.gv.filter((_,i)=>i!==1).every(g=>g.secondaryBreakKgS===0));
  close(g.waterKg-mass,(g.feedKgS+g.asgKgS-g.steamKgS)*dt);
  close(g.steamKgS,g.turbineSteamKgS+g.dumpKgS+g.secondaryBreakKgS);
  close(g.secondaryBreakReleasedKg,g.secondaryBreakKgS*dt);
  close(g.thermalEnergyJ,energy+g.heatMW*1e6*dt
    +(g.feedKgS*E.C.areFeedTempC+g.asgKgS*E.C.asgFeedTempC)*E.C.secondaryCpJkgK*dt
    -g.steamKgS*(E.C.secondaryCpJkgK*T+g.steamLatentJkg)*dt,1e-4);
  close(g.secondaryBreakEnergyJ,g.secondaryBreakKgS*(E.C.secondaryCpJkgK*T+g.steamLatentJkg)*dt);
  close(s.primaryMassKg-primary,E.primaryMassBalance(s).netKgS*dt);
  close(s.totalSteamKgS,s.gv.reduce((n,g)=>n+g.steamKgS,0));
  assert.equal(s.breakAreaCm2,0);assert.ok(s.electricMW<=1300);
  const v=E.instrumentSnapshot(m,2);close(v.gvState.secondaryBreakKgS,g.secondaryBreakKgS);
  close(E.controlSignals(m).gv2SteamSignal[0],g.steamKgS);
  const point=s.history.at(-1),index=E.HISTORY_PATHS.indexOf('gv.1.secondaryBreakKgS');
  close(point.detail[index],g.secondaryBreakKgS,1e-5);
});

test('brèche secondaire : refroidissement transmis au primaire, indépendance VVP/GCT-A et isolation sélective',()=>{
  const a=E.make(),b=E.make();
  for(const m of [a,b]){m.controls.protectionGraphMode=true;
    m.controls.coolantWorthPcmC=0;m.controls.dopplerWorthPcmC=0;}
  E.initiate(b,'secondaryBreak',{gv:2,areaCm2:300});
  E.advance(a,30);E.advance(b,30);
  assert.ok(b.state.gv[1].tempC<a.state.gv[1].tempC-1);
  assert.ok(b.state.tavgC<a.state.tavgC-.1);
  const m=E.make();m.controls.protectionGraphMode=true;m.controls.gvSteamValvePct.fill(0);
  E.initiate(m,'secondaryBreak',{gv:1,areaCm2:100});
  E.initiate(m,'secondaryBreak',{gv:3,areaCm2:200});
  E.initiate(m,'break',{areaCm2:30});E.advance(m,3);
  assert.equal(m.state.gv[0].turbineSteamKgS,0);assert.equal(m.state.gv[0].dumpKgS,0);
  assert.ok(m.state.gv[0].secondaryBreakKgS>0);
  E.initiate(m,'secondaryBreak',{gv:1,areaCm2:0});
  assert.equal(m.state.gv[0].secondaryBreakKgS,0);
  assert.equal(m.state.gv[2].secondaryBreakAreaCm2,200);assert.equal(m.state.breakAreaCm2,30);
});

test('brèche vapeur : aucune masse négative ou vaporisation alimentée par le plancher thermique',()=>{
  const m=E.make(),g=m.state.gv[0];m.controls.protectionGraphMode=true;
  m.state.tavgC=20;g.tempC=20;g.pressureBar=2;g.waterKg=1;
  g.feedKgS=g.asgKgS=0;m.controls.gvManualFeedPct.fill(0);m.controls.gvSteamValvePct.fill(0);
  E.initiate(m,'secondaryBreak',{gv:1,areaCm2:2000});
  E.step(m,.1);close(g.secondaryBreakKgS,0);close(g.waterKg,1);
  close(g.thermalEnergyJ,E.gvThermalCapacityJk(1)*20);assert.equal(g.pressureBar,1);
});

test('JSON : reprise d’une brèche GV et migration v4 sans modifier les stocks ni l’arrêt GMPP',()=>{
  const m=E.make();m.controls.protectionGraphMode=true;
  E.initiate(m,'secondaryBreak',{gv:4,areaCm2:120});E.advance(m,2);E.tripPrimaryPumps(m);
  const editors=Object.fromEntries(['regul','protect'].map(mode=>[mode,
    editorSurface(mode).bridge.receive({type:'centurion-editor-save'}).saved]));
  const ui={speed:200,diagram:'gv',selectedGv:4,activeView:'synoptiques',historyFollowing:true,historyEndS:null,
    historyWindow:'1800',traceSet:'steam',coreTrailWindow:'300',ptTrailWindow:'14400',alarmLimits:{}};
  const raw=State.write(E,m,editors,ui,null),loaded=State.read(E,JSON.stringify(raw));
  E.advance(m,1);E.advance(loaded.model,1);assert.deepEqual(loaded.model,m);
  const old=structuredClone(raw);old.engineRevision='20261008-breche-v4';
  delete old.model.controls.gvSecondaryBreakAreaCm2;
  const keys=['secondaryBreakAreaCm2','secondaryBreakKgS','secondaryBreakReleasedKg','secondaryBreakEnergyJ','waterMassRateKgS'];
  old.model.state.gv.forEach(g=>keys.forEach(k=>delete g[k]));
  const mass=old.model.state.primaryMassKg,water=old.model.state.gv.map(g=>g.waterKg),pipe=structuredClone(old.model.state.risPipe);
  const migrated=State.read(E,old);
  assert.deepEqual(migrated.model.controls.gvSecondaryBreakAreaCm2,[0,0,0,0]);
  assert.equal(migrated.model.state.primaryMassKg,mass);assert.deepEqual(migrated.model.state.gv.map(g=>g.waterKg),water);
  assert.deepEqual(migrated.model.state.risPipe,pipe);assert.equal(migrated.model.state.primaryPumpsStopped,true);
  const invalid=structuredClone(raw);invalid.model.controls.gvSecondaryBreakAreaCm2[3]=300;
  assert.throws(()=>State.read(E,invalid),/incohérentes/);
  const missing=structuredClone(raw);delete missing.model.state.gv[0].secondaryBreakKgS;
  assert.throws(()=>State.read(E,missing),/type incompatible/);
});
