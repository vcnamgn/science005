const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../centurion-engine');
const {svgSurface}=require('./helpers/svg-surface');
const close=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);

test('soupapes automatiques : trois seuils, hystérésis, délai et course sans CC ni ordre manuel',()=>{
  const m=E.make(),s=m.state,u=m.controls;
  u.protectionGraphMode=true;u.protectionsEnabled=false;
  function hold(p,seconds=2){for(let i=0;i<Math.round(seconds*10);i++){s.pressureBar=p;E.step(m,.1);}}
  hold(165);assert.deepEqual(s.reliefAutoArmed,[false,false,false]);close(s.reliefKgS,0);
  s.pressureBar=168;E.step(m,.1);assert.deepEqual(s.reliefAutoArmed,[true,false,false]);close(s.reliefKgS,0);
  hold(168,.5);assert.ok(s.reliefOpeningPct[0]>0&&s.reliefOpeningPct[0]<100);
  hold(168);assert.deepEqual(s.reliefOpeningPct,[100,0,0]);
  hold(171);assert.deepEqual(s.reliefOpeningPct,[100,100,0]);
  hold(174);assert.deepEqual(s.reliefOpeningPct,[100,100,100]);
  assert.ok(s.reliefKgS>150);assert.deepEqual(u.manualReliefStages,[false,false,false]);
  hold(167);assert.deepEqual(s.reliefAutoArmed,[true,true,true]);
  hold(165);assert.deepEqual(s.reliefOpeningPct,[100,100,0]);
  hold(163);assert.deepEqual(s.reliefOpeningPct,[100,0,0]);
  hold(159);assert.deepEqual(s.reliefOpeningPct,[0,0,0]);close(s.reliefKgS,0);
  assert.equal(s.tripAt,null,'les soupapes ne créent pas un AAR');
  assert.equal(E.reactorOperatingState(s).code,'RP');
  const reset=E.make();assert.deepEqual(reset.state.reliefAutoArmed,[false,false,false]);
  close(reset.state.risTankRemainingKg,2315*1000);
});

test('RIS PTR : 2315 m³, 2500 ppm distincts de REA, propriétés réellement livrées après transit',()=>{
  const m=E.make();assert.equal(m.state.risTankRemainingKg,2315000);
  E.initiate(m,'ris');E.advance(m,3);m.state.pressureBar=30;
  E.setRcvInjection(m,'borication');
  // Isoler composition et transit de la remontée de pression due aux accumulateurs.
  for(let i=0;i<150;i++){m.state.pressureBar=30;E.step(m,.1);}
  const b=E.primaryMassBalance(m.state);
  assert.ok(b.risMpKgS>0&&b.risBpKgS>0);
  close(b.risMpBoronPpm,2500);close(b.risBpBoronPpm,2500);close(b.risBoronPpm,2500);
  close(b.risTempC,20);close(b.chargeBoronPpm,7000);
  assert.ok(m.state.risTankRemainingKg<2315000&&m.state.risTankRemainingKg>2000000);
  assert.ok(b.breakLiquidBoronPpm>0);close(b.breakSteamBoronPpm,0);close(b.reliefBoronPpm,0);
});

test('recirculation RIS : EAS garde le puisard sous 90 °C, sans perdre de bore, parcelles conservées',()=>{
  const m=E.make(),s=m.state;E.initiate(m,'ris');E.advance(m,3);
  s.pressureBar=30;s.sumpKg=1000000;s.sumpBoron=3400*s.sumpKg;
  s.sumpTempC=120;s.sumpEnergyJ=s.sumpKg*E.C.primaryCpJkgK*120;
  const reserve=s.risTankRemainingKg;m.controls.risSourceMode='recirculation';
  E.step(m,.1);
  assert.ok(s.easCoolingMW>0);assert.ok(s.sumpTempC<90);
  close(s.sumpBoronPpm,3400);close(s.risTankRemainingKg,reserve);
  const recircParcel=s.risPipe.find(p=>p.source==='mp'&&p.boronPpm===3400);
  assert.ok(recircParcel);close(recircParcel.tempC,89.9);
  // Revenir au PTR sans changer les caractéristiques des volumes en tuyauterie.
  m.controls.risSourceMode='direct';E.advance(m,4);
  const arrived=E.primaryMassBalance(s);
  assert.ok(arrived.risMpBoronPpm>2500);assert.ok(arrived.risMpTempC>20);
  assert.ok(s.sumpTempC<90);
  assert.ok(s.risPipe.filter(p=>p.source==='mp').every(p=>p.boronPpm===2500));
  E.advance(m,5);close(E.primaryMassBalance(s).risMpBoronPpm,2500);
  close(E.primaryMassBalance(s).risMpTempC,20);
});

test('thermosiphon : diagnostic distingue désamorçage, GV sec et absence de source froide',()=>{
  const m=E.make(),s=m.state;m.controls.risEnabled=false;E.initiate(m,'ris');E.advance(m,70);
  s.gv[0].tempC=s.tavgC+1;s.gv[1].waterKg=0;
  E.step(m,.1);
  let d=E.primaryFlowDiagnostics(m);
  assert.equal(d.loops[0].status,'Thermosiphon perdu');assert.match(d.loops[0].detail,/absence de source froide/);
  assert.equal(d.loops[1].status,'Thermosiphon perdu');assert.match(d.loops[1].detail,/GV sans eau/);
  s.primaryMassKg=.75*E.C.nominalPrimaryMassKg;s.vaporMassKg=0;E.step(m,.1);
  d=E.primaryFlowDiagnostics(m);
  assert.ok(d.loops.every(l=>l.primingFraction===0&&/boucle désamorcée.*sommet/.test(l.detail)));
  close(d.coreKgS,d.loopKgS+d.risCoreKgS);
  const nominal=E.primaryFlowDiagnostics(E.make());
  assert.ok(nominal.loops.every(l=>l.status==='Circulation forcée'&&l.flowPct===100));
});

test('bilan CPP : brèche 300 cm² pendant 20 min, fermeture massique et séparation liquide/vapeur',()=>{
  const m=E.make();E.initiate(m,'break',{areaCm2:300});
  let phases=0,deliveredAcc=0;
  for(let i=0;i<12000;i++){
    const s=m.state,oldMass=s.primaryMassKg,oldVapor=s.vaporMassKg;
    E.step(m,.1);assert.equal(s.endState,null);
    const b=E.instrumentSnapshot(m).massBalance;
    close(b.netKgS,b.chargeKgS+b.risKgS-b.letdownKgS-b.breakKgS-b.reliefKgS);
    close(b.risKgS,b.risMpKgS+b.risBpKgS+b.accumulatorKgS);
    close(b.totalRateKgS,(s.primaryMassKg-oldMass)/.1);
    close(b.vaporRateKgS,(s.vaporMassKg-oldVapor)/.1);
    close(b.liquidRateKgS+b.vaporRateKgS,b.netKgS);
    close(b.phaseChangeKgS,b.vaporRateKgS+b.breakSteamKgS+b.reliefSteamKgS);
    close(b.closureErrorKgS,0);
    close(b.breakKgS,b.breakLiquidKgS+b.breakSteamKgS);
    if(s.vaporMassKg>0)phases++;
    deliveredAcc+=b.accumulatorKgS*.1;
  }
  assert.ok(phases>100&&deliveredAcc>1000);
  const b=E.primaryMassBalance(m.state);
  assert.ok(m.state.pressureBar>1&&m.state.pressureBar<80);
  assert.equal(m.state.inventory.overfillKg,0,'aucun stock fictif hors capacité');
  assert.ok(b.netKgS>0,'le déséquilibre est visible dans la variation réelle du stock');
  assert.ok(b.risM3h>0&&b.breakM3h>0,'injection et fuite restent présentes après 20 min');
  assert.equal(b.trend,'Inventaire total en hausse');
});

test('RIS : le bilan affiche les MP/BP/accumulateurs arrivés après leurs transits',()=>{
  const m=E.make();m.controls.protectionGraphMode=true;E.setRisOperation(m,'on');
  m.state.pressureBar=30;
  E.step(m,.1);
  assert.ok(m.state.risMpKgS>0&&m.state.risBpKgS>0&&m.state.accumulatorKgS>0);
  close(E.primaryMassBalance(m.state).risKgS,0);
  const hold=seconds=>{for(let i=0;i<seconds*10;i++){
    m.state.pressureBar=30;m.state.pzrThermalPressureBar=30;E.step(m,.1);
  }};
  hold(2);
  const early=E.primaryMassBalance(m.state);
  assert.ok(early.accumulatorKgS>0);close(early.risMpKgS,0);close(early.risBpKgS,0);
  hold(3);
  const delivered=E.primaryMassBalance(m.state);
  assert.ok(delivered.risMpKgS>0&&delivered.risBpKgS>0&&delivered.accumulatorKgS>0);
  close(delivered.risKgS,delivered.risMpKgS+delivered.risBpKgS+delivered.accumulatorKgS);
});

test('soupapes PZR : débit de chaque étage, perte de masse et baisse de pression avec CC actif',()=>{
  for(const pressure of [155,31]){
    const reference=E.make(),open=E.make();
    for(const m of [reference,open]){
      m.controls.protectionGraphMode=true;m.controls.pressureGraphHeaterKW=288;
      m.controls.pressureGraphSprayPct=0;m.state.pressureBar=pressure;
    }
    open.controls.manualReliefStages=[true,false,true];
    E.step(reference,.1);E.step(open,.1);
    const s=open.state,q=50*Math.sqrt(pressure/155);
    close(s.reliefStageKgS[0],q);close(s.reliefStageKgS[1],0);close(s.reliefStageKgS[2],q);
    close(s.reliefKgS,2*q);
    close(reference.state.primaryMassKg-s.primaryMassKg,s.reliefKgS*.1);
    assert.ok(s.pressureBar<reference.state.pressureBar);
    close(E.controlSignals(open).qsvpSignal[0],E.instrumentSnapshot(open).massBalance.reliefKgS);
    const svg=svgSurface('synoptique-RCPPZR-1300.svg');svg.update(E.instrumentSnapshot(open));
    close(Number(svg.get('soupapes-debit-total').getAttribute('data-current-value')),2*q);
    close(Number(svg.get('soupape-2-debit').getAttribute('data-current-value')),0);
    open.controls.manualReliefStages.fill(false);E.step(open,.1);close(s.reliefKgS,0);
  }
});

test('SVG inventaire : bilan en temps réel, variations de stocks et indicateur de sens',()=>{
  const m=E.make();E.initiate(m,'break',{areaCm2:300});E.advance(m,5);
  const svg=svgSurface('CPP-inventaire.svg'),snapshot=E.instrumentSnapshot(m);
  svg.update(snapshot);
  const map={'balance-net':'netKgS'};
  for(const [id,key] of Object.entries(map))
    close(Number(svg.get(id).getAttribute('data-current-value')),snapshot.massBalance[key]);
  assert.equal(svg.get('balance-net-card').getAttribute('data-balance-sign'),'loss');
  const nominal=E.instrumentSnapshot(E.make());svg.update(nominal);
  assert.equal(svg.get('balance-net-card').getAttribute('data-balance-sign'),'balanced');
  const relief=E.make();relief.controls.manualReliefStages=[true,false,false];E.step(relief,.1);
  const reliefSnapshot=E.instrumentSnapshot(relief);svg.update(reliefSnapshot);
  const phase=svg.root.querySelector('[data-value="massBalance.phaseChangeKgS"]');
  assert.ok(phase,'Le synoptique doit afficher le même transfert de phase net que le bilan');
  close(Number(phase.getAttribute('data-current-value')),reliefSnapshot.massBalance.phaseChangeKgS);
});
