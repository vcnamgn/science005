const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../centurion-engine.js');

test('point nominal : inventaire primaire commun et quatre GV stationnaires', () => {
  const m = E.make();
  E.advance(m, 120);
  const s = m.state;
  assert.equal(s.loops.length, 4);
  assert.equal(s.gv.length, 4);
  assert.ok(Math.abs(s.loops.reduce((sum, l) => sum + l.flowKgS, 0)
    - E.C.nominalPrimaryFlowKgS) < 0.01);
  assert.ok(Math.abs(s.primaryMassKg - E.C.nominalPrimaryMassKg) < 0.01);
  assert.ok(Math.abs(s.pressureBar - 155) < 0.1);
  assert.ok(s.gv.every(g => Math.abs(g.levelPct - 55) < 0.1));
  assert.equal(s.tripAt, null);
  assert.ok(Math.abs(s.coldC-288.4)<0.1);
  assert.ok(Math.abs(s.hotC-324.6)<0.1);
  assert.ok(Math.abs(s.tRicC-326.9)<0.1);
  assert.equal(E.C.coreConductanceMWC,10);
  assert.ok(Math.abs(s.fuelC-688.2)<0.1);
  assert.ok(s.tRicC>s.hotC);
  const mixedHot=(1-E.C.coreBypassFraction)*s.tRicC
    +E.C.coreBypassFraction*s.coldC;
  assert.ok(Math.abs(mixedHot-s.hotC)<0.5);
});

test('échange des crayons à K fixe : bilan identique sans débit ou avec dénoyage', () => {
  for(const [stopped,massFraction] of [[false,1],[true,1],[true,0.6]]){
    const m=E.make();
    m.state.fuelC+=20;
    m.state.primaryMassKg*=massFraction;
    if(stopped){
      m.state.primaryPumpsStopped=true;
      m.state.loops.forEach(loop=>{loop.flowKgS=0;});
    }
    const initialFuel=m.state.fuelC,initialWater=m.state.tavgC;
    E.step(m,0.1);
    const expected=initialFuel+(m.state.thermalPowerMW
      -10*(initialFuel-initialWater))*1e6*0.1/E.C.fuelHeatCapacityJk;
    assert.ok(Math.abs(m.state.fuelC-expected)<1e-9);
    if(stopped)assert.equal(m.state.coreFlowFraction,0);
  }
});

test('après AAR et arrêt des GMPP, un cœur noyé conserve son échange thermique', () => {
  const m=E.make();
  E.initiate(m,'ris');
  E.advance(m,180);
  assert.equal(m.state.coreFlowFraction,0);
  assert.equal(m.state.coveragePct,100);
  assert.ok(m.state.fuelC-m.state.tavgC<25);
  assert.ok(Math.abs(10*(m.state.fuelC-m.state.tavgC)-m.state.thermalPowerMW)<10);
});

test('G3 et recouvrements : G1 commence seul puis entraîne G2, N1 et N2', () => {
  assert.equal(E.g3Target(100, 'debut'), 780);
  assert.equal(E.g3Target(90, 'debut'), 600);
  assert.deepEqual(E.gcpPositions(780), [260, 260, 260, 260]);
  assert.deepEqual(E.gcpPositions(600), [80, 260, 260, 260]);
  assert.deepEqual(E.gcpPositions(700), [180, 260, 260, 260]);
  assert.deepEqual(E.gcpPositions(704), [184, 260, 260, 260]);
  assert.deepEqual(E.gcpPositions(705), [185, 260, 260, 260]);
  assert.deepEqual(E.gcpPositions(704.5), [184.5, 260, 260, 260]);
  assert.deepEqual(E.gcpPositions(500), [0, 165, 260, 260]);
  assert.deepEqual(E.gcpPositions(210), [0, 0, 50, 205]);
});

test('poids initiaux des neuf groupes choisis pour l’étude : marge à 85 % PN', () => {
  assert.deepEqual(E.ROD_WORTH_PCM,{
    R:1500,G1:135,G2:300,N1:450,N2:500,
    SA:500,SB:700,SC:900,SD:300
  });
  const m=E.make(),u=m.controls;
  u.protectionsEnabled=false;
  u.rMode='graph';
  // Correcteur de température de comparaison ; le graphe CC-RÉGUL n'est pas rejoué ici.
  for(let second=0;second<600;second++){
    u.demandPct=100-15*Math.min(1,second/180);
    u.g3GraphTarget=E.g3Target(u.demandPct,'debut');
    const error=m.state.trefC-m.state.tavgC;
    if(Math.abs(error)>0.83)u.rGraphPas=Math.max(0,Math.min(260,
      u.rGraphPas+Math.max(-1.2,Math.min(1.2,error*62/60))));
    E.advance(m,1);
  }
  assert.equal(m.state.rods.G1,47.5);
  assert.ok(m.state.rods.R<250,`R à ${m.state.rods.R.toFixed(1)} pas`);
});

test('le poids R réglé est appliqué au bilan de réactivité après déplacement', () => {
  const m=E.make();
  assert.equal(m.controls.rodWorthPcm.R,1500);
  m.controls.rManualPas=240;
  E.advance(m,20);
  assert.equal(m.state.rods.R,240);
  const relativeIntegral=E.rodIntegral(240)-E.rodIntegral(220);
  assert.ok(Math.abs(m.state.reactivityParts.rod-1500*relativeIntegral)<1e-9);
  m.controls.rodWorthPcm.R=1000;
  E.advance(m,0.1);
  assert.ok(Math.abs(m.state.reactivityParts.rod-1000*relativeIntegral)<1e-9);
});

test('IL R varie avec la puissance et la moitié du cycle', () => {
  assert.equal(E.rInsertionLimit(0, 'premiere'), 202);
  assert.equal(E.rInsertionLimit(100, 'premiere'), 186);
  assert.equal(E.rInsertionLimit(0, 'seconde'), 211);
  assert.equal(E.rInsertionLimit(100, 'seconde'), 198);
});

test('RCV : dilution manuelle livrée après le délai de conduite', () => {
  const m = E.make();
  E.prepareRcvTank(m, 0, 0);
  E.advance(m, 7);
  assert.ok(Math.abs(m.state.boronPpm - 1200) < 1e-6);
  E.advance(m, 25);
  assert.ok(m.state.boronPpm < 1200);
  assert.equal(m.state.rcvChargeKgS*3600/E.C.primaryDensityKgM3, 15);
  assert.equal(m.state.rcvLetdownKgS*3600/E.C.primaryDensityKgM3, 15);
});

test('RCV : le graphe peut régler la charge sans modifier la décharge fixe', () => {
  const m = E.make();
  m.controls.rcvChargeM3h = 8;
  m.controls.rcvChargeGraphM3h = 22;
  E.advance(m, 1);
  assert.ok(Math.abs(m.state.rcvChargeKgS*3600/E.C.primaryDensityKgM3-22)<1e-9);
  assert.ok(Math.abs(m.state.rcvLetdownKgS*3600/E.C.primaryDensityKgM3-15)<1e-9);
  m.controls.rcvChargeGraphM3h = null;
  E.advance(m, 1);
  assert.ok(Math.abs(m.state.rcvChargeKgS*3600/E.C.primaryDensityKgM3-8)<1e-9);
});

test('hors CC-REGUL aucune commande automatique ne déplace R ou G3', () => {
  const m = E.make();
  m.controls.demandPct = 90;
  E.advance(m, 5);
  assert.equal(m.state.rods.R, 220);
  assert.equal(m.state.g3Count, 780);
  assert.equal(m.state.sprayPct, E.C.nominalSprayPct);
});

test('pressuriseur nominal : vannes fermées et aspersion continue équilibrée', () => {
  const m = E.make();
  E.advance(m, 120);
  assert.equal(m.state.heaterKW, 288);
  assert.equal(m.state.sprayPct, 0);
  assert.ok(Math.abs(m.state.sprayContinuousM3h-0.46)<0.001);
  assert.equal(m.state.sprayValveM3h, 0);
  assert.ok(Math.abs(m.state.sprayFlowM3h-0.46)<0.001);
  assert.ok(Math.abs(m.state.pressureBar-155)<0.02);
});

test('graphe CC-RÉGUL initial : chaufferettes et aspersion suivent les seuils VD3', () => {
  const html=fs.readFileSync(path.join(__dirname,'..','centurion-cc-regul.html'),'utf8');
  const raw=html.match(/<script type="application\/json" id="solutionDataComplete">([^<]+)<\/script>/);
  assert.ok(raw);
  const model=JSON.parse(raw[1]);
  const start=html.indexOf('    function migrateCenturionRegulation(model) {');
  const end=html.indexOf('    function applyRegState(',start);
  assert.ok(start>=0 && end>start);
  const migrate=Function('CENTURION_EDITOR_MODE',
    `${html.slice(start,end)};return migrateCenturionRegulation;`)('regul');
  migrate(model);
  const pid=model.nodes.find(n=>n.type==='pid'&&n.label==='PID pression');
  const heater=model.nodes.find(n=>n.params.curveRole==='heater');
  const spray=model.nodes.find(n=>n.params.curveRole==='spray');
  assert.deepEqual([pid.params.kp,pid.params.ki,pid.params.kd],[1,0,0]);
  assert.equal(heater.params.xUnit,'bar');
  assert.equal(spray.params.xUnit,'bar');
  const curve=(points,x)=>{
    for(let i=1;i<points.length;i++)if(x<=points[i].x){
      const a=points[i-1],b=points[i];
      return a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x);
    }
    return points.at(-1).y;
  };
  assert.equal(curve(heater.params.points,0),288);
  assert.equal(curve(heater.params.points,-1),576);
  assert.equal(curve(spray.params.points,0),0);
  assert.equal(curve(spray.params.points,2),0);
  assert.equal(curve(spray.params.points,5.2),100);
});

test('aspersion ouverte : le débit et le refroidissement abaissent la pression', () => {
  const m = E.make();
  m.controls.manualSprayPct = 100;
  E.advance(m, 1);
  assert.ok(Math.abs(m.state.sprayPct-50)<0.1);
  E.advance(m, 1);
  assert.ok(Math.abs(m.state.sprayPct-100)<0.1);
  const pressureAtFullOpening=m.state.pressureBar;
  E.advance(m, 1);
  assert.ok(Math.abs(m.state.pressureBar-pressureAtFullOpening+0.15)<0.02);
  E.advance(m, 27);
  assert.ok(m.state.pressureBar < 155);
  assert.ok(m.state.pressureBar > 149);
  assert.equal(m.state.sprayPct, 100);
  assert.ok(Math.abs(m.state.sprayValveM3h-250)<0.5);
  assert.ok(Math.abs(m.state.sprayContinuousM3h-0.46)<0.001);
  assert.ok(Math.abs(m.state.sprayFlowM3h-250.46)<0.5);
});

test('une GMPP arrêtée fait décroître son débit et divise son apport à l’aspersion', () => {
  const m = E.make();
  assert.ok(Math.abs(m.state.loops[0].pumpHeadHotBar-7)<1e-9);
  assert.ok(Math.abs(m.state.loops[0].vesselDeltaBar-3.5)<1e-9);
  assert.ok(Math.abs(m.state.loops[0].gvDeltaBar-3.5)<1e-9);
  m.controls.manualSprayPct = 100;
  m.state.loops[0].pumpStopped = true;
  E.advance(m, 60);
  assert.equal(m.state.loops[0].flowKgS, 0);
  assert.ok(Math.abs(m.state.sprayFlowM3h-125.23)<1);
  assert.ok(Math.abs(m.state.sprayDriveBar-1.75)<0.1);
});

test('brèche : baisse de pression, AAR puis IS et arrivée retardée du RIS', () => {
  const m = E.make();
  E.initiate(m, 'break', { areaCm2: 300, loop: 2, branch: 'chaude' });
  E.advance(m, 60);
  const s = m.state;
  assert.equal(s.breakLoop, 2);
  assert.equal(s.breakBranch, 'chaude');
  assert.ok(s.primaryMassKg < E.C.nominalPrimaryMassKg);
  assert.ok(s.pressureBar < 120);
  assert.ok(s.tripAt !== null && s.risAt !== null);
  assert.ok(s.tripAt < s.risAt);
  assert.ok(s.risMpKgS > 0 && s.risDeliveredKgS > 0);
  assert.ok(s.boronPpm > 1200);
});

test('RIS MP puis BP suivent leur domaine de pression', () => {
  const high = E.make();
  high.state.pressureBar = 100;
  E.initiate(high, 'ris');
  E.advance(high, 2.2);
  assert.ok(high.state.risMpKgS > 0);
  assert.equal(high.state.risBpKgS, 0);
  assert.equal(high.state.risDeliveredKgS, 0);
  E.advance(high, 4);
  assert.ok(high.state.risDeliveredKgS > 0);
  const low = E.make();
  low.state.pressureBar = 20;
  E.initiate(low, 'ris');
  E.advance(low, 2.2);
  assert.ok(low.state.risBpKgS > 0);
  assert.ok(low.state.accumulatorKgS > 0);
});

test('au démarrage R répond en manuel sans activer la régulation', () => {
  const m = E.make();
  assert.equal(m.controls.rMode, 'manual');
  m.controls.rManualPas = 260;
  E.advance(m, 5);
  assert.ok(m.state.rods.R > 220);
  assert.ok(m.state.powerPct > 100);
});

test('la demande IS entraîne AAR et arrêt des GMPP, puis QPRI atteint zéro', () => {
  const m = E.make();
  E.initiate(m, 'ris');
  assert.notEqual(m.state.risDemandAt, null);
  assert.notEqual(m.state.tripDemandAt, null);
  assert.equal(m.state.primaryPumpsStopped, true);
  E.advance(m, 60);
  assert.notEqual(m.state.tripAt, null);
  assert.equal(m.state.coreFlowFraction, 0);
  assert.equal(m.state.sprayFlowPct, 0);
  assert.ok(m.state.loops.every(loop => loop.flowKgS === 0));
});

test('un défaut ARE sur GV1 baisse son niveau sans vider les trois autres', () => {
  const m = E.make();
  m.controls.gvManualFeedPct[0] = 0;
  E.advance(m, 60);
  assert.ok(m.state.gv[0].levelPct < 45);
  assert.ok(m.state.gv.slice(1).every(g => Math.abs(g.levelPct - 55) < 0.2));
});

test('saturation secondaire : points de contrôle IAPWS-IF97 et seuil GCT-A à 297,2 °C', () => {
  for (const [kelvin, bar] of [[300,0.0353658941],[500,26.3889776],[600,123.443146]])
    assert.ok(Math.abs(E.saturationPressureBar(kelvin-273.15)-bar)<5e-7);
  assert.ok(Math.abs(E.C.gctAPressureBar-82.540582)<1e-6);
  assert.ok(Math.abs(E.saturationTemperatureC(65)-280.858851)<1e-6);
});

test('GL et GE mesurent la même hauteur : plaque tubulaire, bas GE et point nominal', () => {
  assert.deepEqual(E.gvLevels(0),{levelMetres:0,levelWidePct:0,levelPct:0});
  const low=E.gvLevels(12.5*E.C.gvKgPerMetre);
  assert.equal(low.levelPct,0);
  assert.ok(Math.abs(low.levelWidePct-100*12.5/17)<1e-9);
  const nominal=E.gvLevels(E.C.gvNominalWaterKg);
  assert.ok(Math.abs(nominal.levelMetres-14.975)<1e-9);
  assert.ok(Math.abs(nominal.levelPct-55)<1e-9);
  assert.ok(Math.abs(nominal.levelWidePct-88.0882352941)<1e-9);
  const high=E.gvLevels(17*E.C.gvKgPerMetre);
  assert.equal(high.levelPct,100);
  assert.equal(high.levelWidePct,100);
});

test('VVP : fermer puis rouvrir GV2 coupe puis rétablit son seul débit turbine', () => {
  const m=E.make();m.controls.protectionsEnabled=false;
  m.controls.gvSteamValvePct[1]=0;
  E.advance(m,2.1);
  assert.equal(m.state.gv[1].steamValvePct,0);
  assert.equal(m.state.gv[1].steamKgS,0);
  assert.ok(m.state.gv.filter((g,i)=>i!==1).every(g=>g.steamValvePct===100&&g.steamKgS>500));
  assert.ok(m.state.electricMW<1000);
  m.controls.gvSteamValvePct[1]=100;
  E.advance(m,2.1);
  assert.equal(m.state.gv[1].steamValvePct,100);
  assert.ok(m.state.gv[1].steamKgS>500);
  assert.ok(m.state.electricMW>1200);
});

test('GCT-A : fermé sous le seuil, vapeur retirée des bilans au dépassement', () => {
  const m=E.make();m.controls.protectionsEnabled=false;
  const g=m.state.gv[0];
  m.controls.gvSteamValvePct[0]=0;g.steamValvePct=0;
  g.tempC=296.2;g.pressureBar=E.saturationPressureBar(g.tempC);
  E.step(m,0.1);
  assert.equal(g.gctAValvePct,0);
  assert.equal(g.dumpKgS,0);
  g.tempC=298.2;g.pressureBar=E.saturationPressureBar(g.tempC);
  const previousWater=g.waterKg,previousTemp=g.tempC;
  E.step(m,0.1);
  assert.ok(g.gctAValvePct>0&&g.dumpKgS>0);
  assert.equal(g.turbineSteamKgS,0);
  assert.equal(g.steamKgS,g.dumpKgS);
  assert.ok(Math.abs(g.waterKg-previousWater-(g.feedKgS-g.dumpKgS)*0.1)<1e-8);
  const expectedHeat=g.heatMW-g.dumpKgS*E.C.steamEnthalpyJkg/1e6;
  assert.ok(Math.abs((g.tempC-previousTemp)*E.C.gvHeatCapacityJk/1e6/0.1-expectedHeat)<1e-6);
  E.advance(m,90);
  assert.ok(g.pressureBar>E.C.gctAPressureBar);
  assert.ok(g.pressureBar<E.C.gctAPressureBar+1);
  assert.ok(g.dumpKgS>0);
});

test('vapeur mesurée : turbine + GCT-A, avec des bilans conservatifs et une puissance électrique distincte', () => {
  const m=E.make();m.controls.protectionsEnabled=false;
  const g=m.state.gv[2];
  g.tempC=298.2;g.pressureBar=E.saturationPressureBar(g.tempC);
  const previousWater=g.waterKg,previousTemp=g.tempC;
  E.step(m,0.1);
  assert.ok(g.turbineSteamKgS>0&&g.dumpKgS>0);
  assert.equal(g.steamKgS,g.turbineSteamKgS+g.dumpKgS);
  assert.equal(m.state.totalSteamKgS,m.state.gv.reduce((q,gv)=>q+gv.steamKgS,0));
  assert.equal(m.state.totalTurbineSteamKgS,m.state.gv.reduce((q,gv)=>q+gv.turbineSteamKgS,0));
  assert.ok(m.state.totalSteamKgS>m.state.totalTurbineSteamKgS);
  assert.equal(m.state.electricMW,E.C.nominalElectricMW*m.state.totalTurbineSteamKgS
    /(4*E.C.nominalSteamKgSPerGV));
  assert.ok(Math.abs(g.waterKg-previousWater-(g.feedKgS-g.steamKgS)*0.1)<1e-8);
  const expectedHeat=g.heatMW-g.steamKgS*E.C.steamEnthalpyJkg/1e6;
  assert.ok(Math.abs((g.tempC-previousTemp)*E.C.gvHeatCapacityJk/1e6/0.1-expectedHeat)<1e-6);

  m.controls.demandPct=0;m.state.turbinePct=0;
  E.step(m,0.1);
  assert.equal(m.state.totalTurbineSteamKgS,0);
  assert.equal(m.state.electricMW,0);
  assert.ok(m.state.totalSteamKgS>0);
});

test('en mode graphe la surveillance reçoit la variation filtrée de CC-PROTECT', () => {
  const m=E.make();
  m.controls.protectionGraphMode=true;
  m.controls.protectionGraphFluxRatePctS=-6;
  E.step(m,0.1);
  assert.equal(m.state.fluxRatePctS,-6);
  assert.equal(m.state.signals.rapidFluxFall,true);
  assert.equal(m.state.signals.rapidFluxRise,false);
  assert.equal(m.state.tripDemandAt,null); // Seule la sortie AAR du graphe peut l'engager.
});

test('initiateurs éjection et perte de tension donnent des ordres de protection', () => {
  for (const [name, details] of [['ejection', { worthPcm: 300 }], ['voltage', {}]]) {
    const m = E.make();
    E.initiate(m, name, details);
    E.advance(m, 20);
    assert.ok(m.state.tripAt !== null, name);
    assert.ok(m.state.rods.SA < 1 && m.state.rods.R < 1, name);
    assert.ok(Number.isFinite(m.state.powerPct));
  }
});

test('la vue axiale fournit six mesures et 32 mailles finies', () => {
  const m = E.make();
  E.advance(m, 3);
  assert.equal(m.state.axialFlux32.length, 32);
  assert.equal(m.state.fluxDetectors6.length, 6);
  assert.ok(m.state.axialFlux32.every(Number.isFinite));
  assert.ok(m.state.peakLinearWcm > 0);
});

test('les cinq programmes de charge restent numériques et ne déclenchent pas d’AAR au réglage initial', () => {
  for (const name of ['temperature', 'down', 'frequency', 'step', 'lowstep']) {
    const m = E.make();
    E.startTransient(m, name);
    E.advance(m, E.TRANSIENTS[name].duration);
    assert.equal(m.state.tripAt, null, name);
    assert.ok(Number.isFinite(m.state.powerPct), name);
    assert.ok(m.state.gv.every(g => Number.isFinite(g.levelPct)), name);
  }
});

test('le programme rejoint son point initial puis revient à 100 % sans saut', () => {
  const m=E.make();
  E.startTransient(m,'lowstep');
  assert.equal(m.controls.transientPhase,'approach');
  E.advance(m,60);
  assert.ok(Math.abs(m.state.demandPct-80)<0.1);
  assert.equal(m.controls.transientPhase,'approach');
  E.advance(m,165);
  assert.ok(Math.abs(m.state.demandPct-25)<0.1);
  assert.equal(m.controls.transientPhase,'run');
  E.startTransient(m,'off');
  assert.equal(m.controls.transientPhase,'return');
  E.advance(m,60);
  assert.ok(Math.abs(m.state.demandPct-45)<0.1);
  E.advance(m,165);
  assert.ok(Math.abs(m.state.demandPct-100)<0.1);
  assert.equal(m.controls.transientPhase,'off');
});

test('page et ressources de la nouvelle application sont autonomes', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'centurion.html'), 'utf8');
  for (const file of ['centurion.css', 'centurion-engine.js', 'centurion-app.js',
    'centurion-svg-bridge.js']) assert.ok(fs.existsSync(path.join(root, file)), file);
  for (const file of ['synoptique-RCP-1300.svg', 'synoptique-RCPGV-1300.svg',
    'synoptique-RCPPZR-1300.svg', 'synoptique-RCPGRAPPES-1300.svg']) {
    const svg = fs.readFileSync(path.join(root, 'synoptiques', file), 'utf8');
    assert.match(svg, /centurion-svg-bridge\.js/);
  }
  assert.match(html, /centurion-engine\.js/);
  assert.match(html, /view-protection/);
  assert.match(html, /view-initiateurs/);
});
