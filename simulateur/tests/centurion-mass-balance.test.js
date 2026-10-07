const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../centurion-engine');
const {svgSurface}=require('./helpers/svg-surface');
const close=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);

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
    close(b.phaseChangeKgS,b.vaporRateKgS+b.breakSteamKgS+b.reliefKgS);
    close(b.closureErrorKgS,0);
    close(b.breakKgS,b.breakLiquidKgS+b.breakSteamKgS);
    if(s.vaporMassKg>0)phases++;
    deliveredAcc+=b.accumulatorKgS*.1;
  }
  assert.ok(phases>100&&deliveredAcc>1000);
  const b=E.primaryMassBalance(m.state);
  assert.ok(m.state.pressureBar>30&&m.state.pressureBar<32);
  assert.ok(b.netKgS>5&&b.netKgS<15,'la pression stable ne signifie pas masse stable');
  assert.ok(b.risM3h<1300&&b.breakM3h>1800,'volumes calculés avec des densités différentes');
  assert.equal(b.trend,'Inventaire total en hausse');
});

test('RIS : le bilan affiche les MP/BP/accumulateurs arrivés après leurs transits',()=>{
  const m=E.make();m.controls.protectionGraphMode=true;E.setRisOperation(m,'on');
  m.state.pressureBar=30;
  E.step(m,.1);
  assert.ok(m.state.risMpKgS>0&&m.state.risBpKgS>0&&m.state.accumulatorKgS>0);
  close(E.primaryMassBalance(m.state).risKgS,0);
  E.advance(m,2);
  const early=E.primaryMassBalance(m.state);
  assert.ok(early.accumulatorKgS>0);close(early.risMpKgS,0);close(early.risBpKgS,0);
  E.advance(m,3);
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
