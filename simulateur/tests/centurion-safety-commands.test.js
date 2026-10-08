const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../centurion-engine');
const close=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);

function setCppLevel(m,levelM){
  const s=m.state;let lo=0,hi=E.C.nominalPrimaryMassKg;
  for(let i=0;i<60;i++){
    const mid=(lo+hi)/2;
    if(E.cppInventory(mid,s.tavgC,s.pressureBar).loopLevelM<levelM)lo=mid;else hi=mid;
  }
  s.primaryMassKg=(lo+hi)/2;s.vaporMassKg=0;s.vaporEnergyJ=0;
  s.primaryEnergyJ=s.primaryMassKg*E.C.primaryCpJkgK*s.tavgC;
  s.boronInventory=s.primaryMassKg*s.boronPpm;
  s.inventory=E.cppInventory(s.primaryMassKg,s.tavgC,s.pressureBar);
}

test('GMPP : sommet GV dénoyé sans perte du débit forcé ; arrêt à 11 m et maintien de cet arrêt',()=>{
  const nominal=E.C.nominalPrimaryFlowKgS/4;
  for(const level of [21,15,12]){
    const m=E.make();m.controls.protectionGraphMode=true;setCppLevel(m,level);E.step(m,.1);
    assert.equal(m.state.primaryPumpsStopped,false,`niveau ${level} m`);
    assert.ok(m.state.loops.every(l=>l.primingFraction===0&&l.forcedFlowKgS===nominal));
    assert.equal(m.state.pumpHeatMW,24);
    const v=E.primaryFlowDiagnostics(m);
    assert.ok(v.loops.every(l=>l.status==='Circulation forcée'&&l.severity==='normal'));
    assert.match(v.loops[0].detail,/thermosiphon indisponible/);
  }
  const m=E.make();m.controls.protectionGraphMode=true;setCppLevel(m,11.25);E.step(m,.1);
  assert.equal(m.state.primaryPumpsStopped,false);
  assert.ok(m.state.loops.every(l=>l.forcedFlowKgS>nominal*.49&&l.forcedFlowKgS<nominal*.51));
  assert.equal(E.primaryFlowDiagnostics(m).loops[0].status,'Débit forcé réduit');
  setCppLevel(m,10.99);const stopAt=m.state.time;E.step(m,.1);
  assert.equal(m.state.primaryPumpsStopped,true);assert.match(m.state.primaryPumpStopReason,/niveau CPP.*11 m.*cavitation/);
  assert.equal(m.state.primaryPumpStopAt,stopAt);
  assert.ok(m.state.loops.every(l=>l.forcedFlowKgS===0&&l.naturalFlowKgS===0));
  assert.equal(m.state.pumpHeatMW,0);
  assert.equal(m.state.tripDemandAt,null);assert.equal(m.state.risDemandAt,null);
  assert.notEqual(E.reactorOperatingState(m.state).code,'CIA');
  setCppLevel(m,15);E.step(m,.1);
  assert.equal(m.state.primaryPumpsStopped,true,'le remplissage ne redémarre pas les GMPP');
  assert.ok(m.state.loops.every(l=>l.forcedFlowKgS===0));
});

test('GMPP : AAR et IS sans arrêt, perte de tension mémorisée et inertie puis thermosiphon',()=>{
  const aar=E.make();aar.controls.protectionGraphMode=true;E.initiate(aar,'trip');E.advance(aar,20);
  assert.equal(aar.state.primaryPumpsStopped,false);
  assert.ok(aar.state.loops.every(l=>l.forcedFlowKgS===E.C.nominalPrimaryFlowKgS/4));
  for(const [order,reason] of [['voltage','tension']]){
    const m=E.make();m.controls.protectionGraphMode=true;E.initiate(m,order);
    assert.equal(m.state.primaryPumpStopAt,0);assert.match(m.state.primaryPumpStopReason,new RegExp(reason));
    E.advance(m,10);assert.ok(m.state.loops[0].forcedFlowKgS>0);
    E.advance(m,50);assert.equal(m.state.loops[0].forcedFlowKgS,0);
    assert.ok(m.state.loops[0].naturalFlowKgS>0);
    const v=E.instrumentSnapshot(m);assert.equal(v.primaryPumpStopReason,m.state.primaryPumpStopReason);
  }
  const low=E.make();low.state.pressureBar=119;E.step(low,.1);
  assert.notEqual(low.state.risDemandAt,null);
  assert.equal(low.state.primaryPumpsStopped,false,'le seuil IS ne déclenche plus les GMPP');
});

test('aspersion auxiliaire : 8 m³/h sans HMT, partage RCV, même masse et bore, effet sur pression',()=>{
  const a=E.make(),b=E.make();
  for(const m of [a,b]){m.controls.protectionGraphMode=true;
    m.controls.gctAOpeningPressureBar=65;E.initiate(m,'voltage');}
  b.controls.manualAuxiliarySprayM3h=20;
  E.step(a,.1);E.step(b,.1);
  close(b.state.boronInventory,a.state.boronInventory);
  assert.ok(b.state.auxiliarySprayCoolingKW>0);
  assert.ok(b.state.pressureBar<a.state.pressureBar,'effet de pression à état initial identique');
  for(let i=0;i<699;i++){
    // Isoler la ligne auxiliaire à contre-pression disponible. La coupure
    // de charge au-delà de 180 bar est vérifiée dans le test de pompe RCV.
    for(const m of [a,b]){m.state.pressureBar=155;m.state.pzrThermalPressureBar=155;}
    E.step(a,.1);const before=b.state.primaryMassKg;E.step(b,.1);
    close(b.state.primaryMassKg-before,E.primaryMassBalance(b.state).netKgS*.1);
  }
  assert.equal(b.state.sprayFlowM3h,0);assert.equal(b.state.auxiliarySprayM3h,8);
  assert.equal(b.state.totalSprayFlowM3h,8);
  assert.ok(b.state.rcvDeliveredM3h<=b.state.rcvCapacityM3h+.001,'l’auxiliaire ne crée pas une nouvelle injection');
  assert.equal(E.controlSignals(b).qaspAuxSignal[0],8);
  assert.equal(E.controlSignals(b).qaspSignal[0],0);
  b.controls.rcvChargeM3h=6;E.advance(b,10);close(b.state.auxiliarySprayM3h,0);
});

test('commande complète des grappes : vitesse normale, neuf groupes, recouvrements et aucun ordre CIA',()=>{
  const down=E.make();down.controls.protectionGraphMode=true;
  assert.equal(E.commandAllRods(down,0),true);E.advance(down,1);
  close(down.state.rods.R,231.8);close(down.state.rods.SA,258.8);
  close(down.state.rods.G1,258.8);assert.equal(down.state.rods.G2,260);
  E.advance(down,659);assert.ok(E.ROD_NAMES.every(name=>down.state.rods[name]===0));
  assert.equal(down.state.tripDemandAt,null);assert.equal(down.state.risDemandAt,null);
  assert.notEqual(E.reactorOperatingState(down.state).code,'CIA');assert.ok(down.state.decayMW>0);
  const residual=down.state.decayMW;E.initiate(down,'trip');E.advance(down,1);
  assert.ok(down.state.decayMW<residual,'un AAR ultérieur ne réinitialise pas la chaleur résiduelle');
  const up=E.make();up.controls.protectionGraphMode=true;
  for(const name of E.ROD_NAMES){up.state.rods[name]=0;up.controls.rodWorthPcm[name]=0;}
  up.state.powerPct=.001;up.state.precursors=up.state.precursors.map(x=>x*.00001);
  up.controls.coolantWorthPcmC=0;up.controls.dopplerWorthPcmC=0;
  up.state.g3Count=0;E.commandAllRods(up,260);E.advance(up,651);
  assert.ok(E.ROD_NAMES.every(name=>up.state.rods[name]===260));
  E.commandAllRods(up,null);assert.equal(up.controls.allRodsTargetPas,null);
  E.initiate(up,'trip');assert.equal(E.commandAllRods(up,260),false,'AAR prioritaire');
});

test('cœur fondu : dépassement continu >5 s, pic et retour sûr réarment le décompte',()=>{
  const m=E.make();m.controls.protectionGraphMode=true;m.controls.fxYUngraped=3;
  E.step(m,.1);assert.equal(m.state.endState,null);assert.equal(m.state.coreDamageWarning.remainingS,5);
  E.advance(m,4.9);assert.equal(m.state.endState,null);
  m.controls.fxYUngraped=1.4;E.step(m,.1);assert.equal(m.state.coreDamageWarning,null);
  m.controls.fxYUngraped=3;E.step(m,.1);assert.equal(m.state.coreDamageWarning.remainingS,5);
  E.advance(m,5);assert.equal(m.state.endState,null);
  E.step(m,.1);assert.equal(m.state.endState,'melted');
  assert.match(m.state.endReason,/plus de 5 s/);
});

test('ASG : ordre mémorisé, hystérésis 90/10 et coupure haut niveau aussi en manuel',()=>{
  const m=E.make();E.initiate(m,'voltage');E.advance(m,20);
  assert.equal(m.state.asgDemandAt,null);assert.equal(m.state.asgAt,null);assert.equal(m.state.totalAsgKgS,0);
  E.initiate(m,'asg',{source:'cc-protect'});const at=m.state.asgDemandAt;
  E.advance(m,4);assert.equal(m.state.totalAsgKgS,0);
  E.initiate(m,'asg',{source:'cc-protect'});assert.equal(m.state.asgDemandAt,at);
  E.advance(m,7);assert.ok(m.state.gv.every(g=>g.asgKgS>0));
  const g=m.state.gv[0],level=p=>{g.waterKg=E.C.gvKgPerMetre*(12.5+4.5*p/100);};
  level(91);E.step(m,.1);assert.equal(g.asgRunning,false);
  level(50);E.step(m,.1);assert.equal(g.asgRunning,false);
  level(9);E.step(m,.1);assert.equal(g.asgRunning,true);
  level(90);E.step(m,.1);assert.equal(g.asgRunning,true,'seuil strict >90');
  m.controls.asgManual=true;m.controls.asgTrainEnabled=[true,false,false,false];
  level(95);E.step(m,.1);
  assert.equal(g.asgKgS,0);assert.equal(g.asgRunning,false);
  assert.equal(m.controls.asgTrainEnabled[0],false,'la coupure annule l’ordre manuel ES');
  level(50);E.step(m,.1);assert.equal(g.asgKgS,0,'pas de reprise manuelle spontanée');
  m.controls.asgTrainEnabled[0]=true;E.step(m,.1);assert.ok(g.asgKgS>0,'un nouvel ordre ES est accepté sous le seuil');
  level(100);m.controls.asgTrainEnabled[0]=true;E.step(m,.1);
  assert.equal(g.asgKgS,0,'un ordre ES répété ne contourne pas le haut niveau');
});

test('ASG automatique : hystérésis indépendante des quatre trains en RP, AN/GV et CIA',()=>{
  for(const mode of ['RP','AN/GV','CIA']){
    const m=E.make(),s=m.state;m.controls.protectionGraphMode=true;
    // Ordre déjà exécuté : la conduite reste distincte de l'ordre de démarrage.
    s.asgDemandAt=0;s.asgAt=0;s.gv.forEach(g=>{g.asgRunning=true;});
    if(mode==='AN/GV'){
      Object.keys(s.rods).forEach(name=>{s.rods[name]=0;});
      m.controls.rManualPas=0;m.controls.allRodsTargetPas=0;s.g3Count=0;
      s.powerPct=.000001;s.precursors.fill(0);
    }
    if(mode==='CIA')s.tripAt=0;
    const level=(i,p)=>{s.gv[i].waterKg=E.C.gvKgPerMetre*(12.5+4.5*p/100);};
    [91,50,9,90].forEach((p,i)=>level(i,p));E.step(m,.1);
    assert.equal(E.reactorOperatingState(s).code,mode);
    assert.deepEqual(s.gv.map(g=>g.asgRunning),[false,true,true,true],mode);
    [50,91,10,90].forEach((p,i)=>level(i,p));
    E.initiate(m,'asg',{source:'cc-protect'});E.step(m,.1);
    assert.deepEqual(s.gv.map(g=>g.asgRunning),[false,false,true,true],
      `${mode} : pas de réarmement sur répétition de l'ordre CC, seuils stricts`);
    [9,50,91,91].forEach((p,i)=>level(i,p));E.step(m,.1);
    assert.deepEqual(s.gv.map(g=>g.asgRunning),[true,false,false,false],mode);
  }
});
