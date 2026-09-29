/* Centurion — moteur pédagogique commun aux synoptiques et aux commandes.
 * Les constantes non sourcées sont des hypothèses d'exercice, jamais des valeurs de sûreté.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CenturionEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  // IAPWS-IF97, région 4, équation 30 : pression de saturation en bar absolus.
  function saturationPressureBar(tempC) {
    const t = clamp(tempC + 273.15, 273.15, 647.096);
    const theta = t - 0.23855557567849 / (t - 650.17534844798);
    const a = theta * theta + 1167.0521452767 * theta - 724213.16703206;
    const b = -17.073846940092 * theta * theta + 12020.824702470 * theta - 3232555.0322333;
    const c = 14.915108613530 * theta * theta - 4823.2657361591 * theta + 405113.40542057;
    return 10 * Math.pow(2 * c / (-b + Math.sqrt(b * b - 4 * a * c)), 4);
  }
  function saturationTemperatureC(pressureBar) {
    let lo = 0, hi = 373.946;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (saturationPressureBar(mid) < pressureBar) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  const nominalSteamTempC = saturationTemperatureC(65);
  const gvWideTopM = 17, gvNarrowBottomM = 12.5;
  const gvNominalWaterKg = 110000;
  const gvKgPerMetre = gvNominalWaterKg / (gvNarrowBottomM + 0.55 * (gvWideTopM - gvNarrowBottomM));
  // Coefficient global combustible–primaire retenu pour l'étude : 10 MW/°C.
  const coreExchangeMWC = 10;
  const C = Object.freeze({
    nominalThermalMW: 3817, nominalElectricMW: 1300,
    nominalPrimaryMassKg: 269064, nominalPrimaryFlowKgS: 17588,
    primaryCpJkgK: 6000, coreBypassFraction: 0.07,
    corePowerFraction: 0.99, fuelHeatCapacityJk: 45e6,
    primaryPressureBar: 155, primaryMeanC: 306.5,
    fuelC: 306.5 + 3817 / coreExchangeMWC,
    steamTempC: nominalSteamTempC, steamPressureBar: 65, steamEnthalpyJkg: 1.8e6,
    primaryPressureCapacityKgBar: 650, breakCriticalFluxKgM2S: 25000,
    primaryDensityKgM3: 720, minPrimaryMassFraction: 0.20,
    pumpHeadHotBar: 7, pumpHeadColdBar: 10,
    sprayDriveNominalBar: 3.5,
    sprayFullM3hPerValve: 125, sprayContinuousM3hPerValve: 0.230,
    sprayStrokePctPerS: 50,
    nominalSprayPct: 0, nominalHeaterKW: 288,
    // À 155 bar, 288 kW de chaufferettes compensent l'échange passif et
    // le refroidissement des deux lignes d'aspersion continue (0,46 m³/h).
    pzrPassiveTransferKW: 288-0.46*720/3600*6000*(344.79-288.4)/1000,
    // Calage sur le gradient documenté de -0,15 bar/s à pleine aspersion.
    pressureHeatGainBarPerMWs: 0.15/(250*720/3600*6000*(344.79-288.4)/1e6),
    pumpCoastdownTauS: 15,
    boronInitialPpm: 1200, boronWorthPcmPpm: -7,
    coolantWorthPcmC: -25, dopplerWorthPcmC: -1.2,
    promptGenerationS: 0.1, beta: 0.0065,
    betaGroups: [0.00025, 0.00125, 0.0012, 0.0026, 0.0009, 0.0003],
    lambdaGroups: [0.0124, 0.0305, 0.111, 0.301, 1.14, 3.01],
    rodStroke: 260, rodSpeedPasS: 1.2, dropTimeS: 2.24,
    coreConductanceMWC: coreExchangeMWC,
    gvConductanceMWCPerUnit: 3817 / (4 * (306.5 - nominalSteamTempC)),
    gvNominalWaterKg, gvKgPerMetre, gvWideTopM, gvNarrowBottomM,
    gvNominalLevelPct: 55, gvHeatCapacityJk: 5e9,
    steamValveStrokePctPerS: 50,
    gctATempC: 297.2, gctAPressureBar: saturationPressureBar(297.2),
    // Hypothèses d'étude pour la modulation et la capacité du GCT-A par GV.
    gctABandBar: 1, gctAFullKgSPerGV: 600, gctAStrokePctPerS: 50,
    nominalSteamKgSPerGV: 3817e6 / (4 * 1.8e6),
    rcvNominalM3h: 15, rcvLetdownM3h: 15, rcvTransitS: 8, risTransitS: 4,
    accumulatorTransitS: 1, accumulatorKgPerLoop: 20000,
    tripLowPressureBar: 130, risLowPressureBar: 120,
    tripHighFluxPct: 109, fluxPrealarmPct: 102,
    tripFluxRatePctS: 5, tripActuationS: 0.35,
    risActuationS: 2, dieselStartS: 10,
    axialNodes: 32
  });

  // Numérisation d'étude de la figure 7.14, ancrée à 780 pas extraits à 100 %.
  const G3 = Object.freeze({
    debut: [[0,260],[10,290],[20,315],[30,340],[40,355],[50,390],[60,440],[70,482],[80,535],[90,600],[100,780]],
    milieu: [[0,230],[10,260],[20,295],[30,330],[40,355],[50,380],[60,405],[70,480],[80,535],[90,610],[100,780]],
    fin: [[0,210],[10,225],[20,240],[30,290],[40,330],[50,360],[60,385],[70,455],[80,527],[90,580],[100,780]]
  });
  const ROD_NAMES = Object.freeze(["R", "G1", "G2", "N1", "N2", "SA", "SB", "SC", "SD"]);
  // Valeurs d'étude choisies par l'utilisateur, distinctes des mesures
  // REP 1300 de 2006 : Exploitation des cœurs REP, tableaux 6.7–6.9.
  // La forme axiale et la somme des groupes restent pédagogiques.
  const ROD_WORTH_PCM = Object.freeze({
    R: 1500, G1: 135, G2: 300, N1: 450, N2: 500,
    SA: 500, SB: 700, SC: 900, SD: 300
  });
  const OVERLAP_OFFSETS = Object.freeze([0, 185, 360, 515]);

  function interpolation(points, x) {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (x <= points[i][0]) {
        const [xa, ya] = points[i-1], [xb, yb] = points[i];
        return lerp(ya, yb, (x - xa) / (xb - xa));
      }
    }
    return points[points.length-1][1];
  }
  function g3Target(powerPct, campaign) {
    return interpolation(G3[campaign] || G3.debut, clamp(powerPct, 0, 100));
  }
  function gcpPositions(counter) {
    const q = counter - 520;
    return OVERLAP_OFFSETS.map(offset => clamp(q + offset, 0, C.rodStroke));
  }
  function rInsertionLimit(powerPct, halfCycle) {
    const p = clamp(powerPct, 0, 100);
    return halfCycle === "seconde" ? 211 - 0.13 * p : 202 - 0.16 * p;
  }
  function rodIntegral(position) {
    return (1 - Math.cos(Math.PI * clamp(position, 0, 260) / 260)) / 2;
  }
  function rodsReactivityPcm(rods, ejectedWorthPcm, worth = ROD_WORTH_PCM) {
    const baseline = { R: 220, G1: 260, G2: 260, N1: 260, N2: 260,
      SA: 260, SB: 260, SC: 260, SD: 260 };
    return ROD_NAMES.reduce((sum, name) => sum + worth[name]
      * (rodIntegral(rods[name]) - rodIntegral(baseline[name])), ejectedWorthPcm);
  }
  function addEvent(s, kind, text) {
    s.events.push({ time: s.time, kind, text });
    if (s.events.length > 240) s.events.shift();
  }
  function gvLevels(waterKg) {
    const levelMetres = Math.max(0, waterKg) / C.gvKgPerMetre;
    return {
      levelMetres,
      levelWidePct: clamp(100 * levelMetres / C.gvWideTopM, 0, 100),
      levelPct: clamp(100 * (levelMetres - C.gvNarrowBottomM)
        / (C.gvWideTopM - C.gvNarrowBottomM), 0, 100)
    };
  }
  function nominalGv() {
    return Array.from({length:4}, (_, i) => ({
      index: i + 1, waterKg: C.gvNominalWaterKg,
      ...gvLevels(C.gvNominalWaterKg), feedKgS: C.nominalSteamKgSPerGV,
      feedValvePct: 100 * C.nominalSteamKgSPerGV / 950,
      steamValvePct: 100, gctAValvePct: 0,
      turbineSteamKgS: C.nominalSteamKgSPerGV,
      steamKgS: C.nominalSteamKgSPerGV, dumpKgS: 0,
      heatMW: C.nominalThermalMW / 4,
      tempC: C.steamTempC, pressureBar: C.steamPressureBar
    }));
  }
  function initialState() {
    const precursor = C.betaGroups.map((beta, i) => beta / (C.promptGenerationS * C.lambdaGroups[i]));
    const rods = Object.fromEntries(ROD_NAMES.map(name => [name, name === "R" ? 220 : 260]));
    const nominalFlow = C.nominalPrimaryFlowKgS / 4;
    return {
      time: 0, powerPct: 100, thermalPowerMW: C.nominalThermalMW,
      fissionMW: C.nominalThermalMW, decayMW: 0, electricMW: C.nominalElectricMW,
      turbinePct: 100, demandPct: 100, trefC: C.primaryMeanC, nrefPct: 41.8,
      precursors: precursor, reactivityPcm: 0, reactivityParts: {},
      fuelC: C.fuelC, tavgC: C.primaryMeanC,
      hotC: 324.6, coldC: 288.4, tRicC: 326.9,
      pressureBar: C.primaryPressureBar, pzrLevelPct: 42,
      primaryMassKg: C.nominalPrimaryMassKg, coveragePct: 100,
      boronPpm: C.boronInitialPpm,
      boronInventory: C.boronInitialPpm * C.nominalPrimaryMassKg,
      rcvTankBoronPpm: C.boronInitialPpm,
      rcvChargeKgS: C.rcvNominalM3h*C.primaryDensityKgM3/3600,
      rcvLetdownKgS: C.rcvLetdownM3h*C.primaryDensityKgM3/3600,
      rcvDeliveredKgS: C.rcvNominalM3h*C.primaryDensityKgM3/3600,
      reliefKgS: 0, reliefStages: [false,false,false],
      risMpKgS: 0, risBpKgS: 0, accumulatorKgS: 0,
      risDeliveredKgS: 0, risTankRemainingKg: 600000,
      accumulatorsKg: Array(4).fill(C.accumulatorKgPerLoop),
      breakKgS: 0, breakAreaCm2: 0, breakLoop: 1, breakBranch: "froide",
      rods, g3Count: 780, g3Target: 780, rLimitPas: 186,
      loops: Array.from({length:4}, (_,i) => ({ index:i+1, flowKgS:nominalFlow,
        hotC:324.6, coldC:288.4, pumpStopped:false,
        pumpHeadHotBar:7, pumpHeadColdBar:7+3*(324.6-288.4)/(324.6-20),
        vesselDeltaBar:3.5, gvDeltaBar:3.5 })),
      gv: nominalGv(), totalGvMW: C.nominalThermalMW,
      totalSteamKgS: 4 * C.nominalSteamKgSPerGV,
      totalTurbineSteamKgS: 4 * C.nominalSteamKgSPerGV,
      totalFeedKgS: 4 * C.nominalSteamKgSPerGV,
      xenonTop: 1, xenonBottom: 1, iodineTop: 1, iodineBottom: 1,
      axialTilt: 0, axialFlux32: Array(32).fill(1),
      fluxDetectors6: Array(6).fill(1), peakLinearWcm: 350,
      signals: {}, tripDemandAt: null, tripAt: null,
      risDemandAt: null, risAt: null, voltageLostAt: null,
      ejectWorthPcm: 0, withdrawalActive: false,
      rcvPipe: Array.from({length:80},(_,i)=>({at:i*0.1,
        massKg:C.rcvNominalM3h*C.primaryDensityKgM3/3600*0.1,
        boronPpm:C.boronInitialPpm})),
      risPipe: [], events: [], history: [], sampleAt: 0,
      previousPowerPct: 100, rawFluxRatePctS: 0, fluxRatePctS: 0,
      coreFlowFraction: 1, primaryPumpsStopped: false,
      subcoolingC: 344.79-324.6, dnbr: 1.65,
      heaterKW: C.nominalHeaterKW, sprayPct: C.nominalSprayPct,
      sprayValveM3h: 0, sprayContinuousM3h: 2*C.sprayContinuousM3hPerValve,
      sprayFlowM3h: 2*C.sprayContinuousM3hPerValve,
      sprayFlowPct: 100*2*C.sprayContinuousM3hPerValve
        /(2*C.sprayFullM3hPerValve),
      sprayFlowKgS: 2*C.sprayContinuousM3hPerValve*C.primaryDensityKgM3/3600,
      sprayDriveBar: C.sprayDriveNominalBar,
      protectionsEnabled: true, risEnabled: true,
      lossOfVoltage: false, turbineTrip: false
    };
  }
  function make() {
    return {
      state: initialState(),
      controls: {
        demandPct: 100, campaign: "debut", halfCycle: "premiere",
        rMode: "manual", rManualPas: 220, rGraphPas: 220,
        g3GraphTarget: null, gcpCalibrationPct: 0, gvGraphFeedPct: [null,null,null,null],
        gvManualFeedPct: Array(4).fill(100*C.nominalSteamKgSPerGV/950), gvLevelSetpointPct: 55,
        gvSteamValvePct: Array(4).fill(100),
        manualHeaterKW: C.nominalHeaterKW, manualSprayPct: C.nominalSprayPct,
        manualReliefStages: [false,false,false],
        pressureGraphHeaterKW: null, pressureGraphSprayPct: null,
        nrefGraphPct: null,
      rcvChargeM3h: C.rcvNominalM3h, rcvChargeGraphM3h: null,
        rcvTankBoronPpm: C.boronInitialPpm,
        risBoronPpm: 2500,
        rodWorthPcm: {...ROD_WORTH_PCM},
        risMpScale: 1, risBpScale: 1,
        tripLowPressureBar: C.tripLowPressureBar,
        risLowPressureBar: C.risLowPressureBar,
        tripHighFluxPct: C.tripHighFluxPct,
        fluxPrealarmPct: C.fluxPrealarmPct,
        tripFluxRatePctS: C.tripFluxRatePctS,
        mpTrainEnabled: [true,true], bpTrainEnabled: [true,true],
        breakAreaCm2: 0, breakLoop: 1, breakBranch: "froide",
        protectionsEnabled: true, risEnabled: true, protectionGraphMode: false,
        protectionGraphFluxRatePctS: null,
        fxYUngraped: 1.28, fxYGraped: 1.36,
        transient: "off", transientPhase: "off", transientStartS: 0,
        transientTargetDemandPct: 100,
        timeScaleXenon: 1
      }
    };
  }

  const TRANSIENTS = Object.freeze({
    off: {label:"Aucun", duration:0},
    temperature: {label:"100 → 50 → 100 %", duration:2400},
    down: {label:"100 → 15 %", duration:2520},
    step: {label:"70 → 100 %", duration:600},
    lowstep: {label:"25 → 5 %", duration:900},
    frequency: {label:"Suivi de charge répété", duration:1200}
  });
  function transientDemand(name, elapsed) {
    if (name === "temperature") {
      if (elapsed <= 300) return 100;
      if (elapsed <= 900) return 100 - (elapsed - 300) * 5 / 60;
      if (elapsed <= 1500) return 50;
      if (elapsed <= 2100) return 50 + (elapsed - 1500) * 5 / 60;
      return 100;
    }
    if (name === "down") return elapsed <= 300 ? 100 : Math.max(15, 100 - (elapsed-300)*5/60);
    if (name === "step") return elapsed < 300 ? 70 : elapsed < 315 ? 70 + 2*(elapsed-300) : 100;
    if (name === "lowstep") return elapsed < 300 ? 25 : 5;
    if (name === "frequency") {
      const t = elapsed % 1200;
      return interpolation([[0,100],[90,100],[240,70],[330,70],[480,35],
        [570,35],[720,80],[810,80],[960,100],[1200,100]], t);
    }
    return null;
  }
  function startTransient(model, name) {
    if (!TRANSIENTS[name]) return;
    const u=model.controls,s=model.state;
    u.transient=name;
    u.transientTargetDemandPct=name==="off"?100:transientDemand(name,0);
    u.transientPhase=Math.abs(s.demandPct-u.transientTargetDemandPct)>1e-9
      ? (name==="off"?"return":"approach") : (name==="off"?"off":"run");
    u.transientStartS=s.time;
    addEvent(s,"action",name==="off"?"Retour progressif à 100 %"
      : `Transitoire de charge : ${TRANSIENTS[name].label}`);
  }
  function initiate(model, name, details = {}) {
    const s = model.state, u = model.controls;
    if (name === "break") {
      u.breakAreaCm2 = clamp(Number(details.areaCm2) || 0, 0, 2000);
      u.breakLoop = clamp(Math.round(Number(details.loop) || 1), 1, 4);
      u.breakBranch = details.branch === "chaude" ? "chaude" : "froide";
      s.breakAreaCm2 = u.breakAreaCm2;
      s.breakLoop = u.breakLoop;
      s.breakBranch = u.breakBranch;
      addEvent(s, "incident", `Brèche ${u.breakAreaCm2} cm² sur boucle ${u.breakLoop}, branche ${u.breakBranch}`);
    } else if (name === "ejection") {
      s.ejectWorthPcm = clamp(Number(details.worthPcm) || 300, 0, 800);
      addEvent(s, "incident", `Éjection d'une grappe : +${s.ejectWorthPcm} pcm (hypothèse)`);
    } else if (name === "withdrawal") {
      s.withdrawalActive = true;
      addEvent(s, "incident", "Remontée intempestive du groupe R");
    } else if (name === "voltage") {
      s.lossOfVoltage = true;
      s.voltageLostAt = s.time;
      addEvent(s, "incident", "Perte totale des alimentations électriques");
      stopPrimaryPumps(s,"Arrêt des GMPP sur perte de tension");
    } else if (name === "trip") {
      requestTrip(s, details.source === "cc-protect"
        ? "Ordre AAR du CC-PROTECT" : "Ordre manuel d'arrêt automatique");
    } else if (name === "ris") {
      requestRis(s, details.source === "cc-protect"
        ? "Ordre IS du CC-PROTECT" : "Demande manuelle d'injection de sécurité");
    }
  }
  function prepareRcvTank(model, volumeM3, boronPpm) {
    const s=model.state,u=model.controls;
    u.rcvTankBoronPpm=clamp(Number(boronPpm)||0,0,3000);
    s.rcvTankBoronPpm=u.rcvTankBoronPpm;
    addEvent(s,"action",`CB de charge RCV réglée à ${s.rcvTankBoronPpm.toFixed(0)} ppm`);
  }
  function requestTrip(s, text) {
    if (s.tripDemandAt !== null) return;
    s.tripDemandAt = s.time;
    s.turbineTrip = true;
    addEvent(s, "protection", text);
  }
  function stopPrimaryPumps(s,text) {
    if(s.primaryPumpsStopped)return;
    s.primaryPumpsStopped=true;
    addEvent(s,"protection",text);
  }
  function requestRis(s, text) {
    if (s.risDemandAt !== null) return;
    s.risDemandAt = s.time;
    addEvent(s, "protection", text);
    requestTrip(s,"AAR : demande d'injection de sécurité");
    stopPrimaryPumps(s,"Arrêt des GMPP sur IS");
  }

  function updateRods(s, u, dt) {
    const tripped = s.tripAt !== null;
    if (tripped) {
      for (const name of ROD_NAMES) s.rods[name] = Math.max(0,
        s.rods[name] - C.rodStroke * dt / C.dropTimeS);
      return;
    }
    if (s.withdrawalActive) {
      s.rods.R = Math.min(260, s.rods.R + 3 * dt);
    } else if (u.rMode === "graph") {
      s.rods.R += clamp(clamp(Number(u.rGraphPas),s.rLimitPas,260)-s.rods.R,
        -C.rodSpeedPasS*dt,C.rodSpeedPasS*dt);
    } else {
      s.rods.R += clamp(u.rManualPas - s.rods.R,
        -C.rodSpeedPasS*dt, C.rodSpeedPasS*dt);
    }
    s.g3Target = Number.isFinite(u.g3GraphTarget)
      ? clamp(u.g3GraphTarget,0,780) : s.g3Count;
    s.g3Count += clamp(s.g3Target - s.g3Count,
      -C.rodSpeedPasS*dt, C.rodSpeedPasS*dt);
    [s.rods.G1, s.rods.G2, s.rods.N1, s.rods.N2] = gcpPositions(s.g3Count);
  }

  function updateAxial(s, u, dt) {
    // Deux réservoirs xénon/iode et une reconstruction indicative à 32 mailles.
    const insR = (260 - s.rods.R)/260;
    const imbalance = clamp(0.16*insR + 0.08*(s.xenonBottom-s.xenonTop), -0.25, 0.25);
    s.axialTilt = imbalance;
    const topPower = clamp(s.powerPct/100*(1+imbalance), 0, 2.5);
    const bottomPower = clamp(s.powerPct/100*(1-imbalance), 0, 2.5);
    const scale = clamp(Number(u.timeScaleXenon) || 1, 0.1, 100);
    for (const [zone, local] of [["Top",topPower],["Bottom",bottomPower]]) {
      const iodine = `iodine${zone}`, xenon = `xenon${zone}`;
      s[iodine] += (local-s[iodine])*dt*scale/(6.6*3600);
      s[xenon] += (s[iodine]-s[xenon])*dt*scale/(9.2*3600)
        - 0.025*(local-1)*s[xenon]*dt*scale/3600;
      s[xenon] = clamp(s[xenon], 0.2, 2.5);
    }
    const profile = Array.from({length:C.axialNodes},(_,i) => {
      const z = (i+0.5)/C.axialNodes;
      return Math.max(0.05, Math.sin(Math.PI*z)*(1+s.axialTilt*(2*z-1)*2));
    });
    const mean = profile.reduce((a,b)=>a+b,0)/profile.length;
    s.axialFlux32 = profile.map(x => x/mean);
    s.fluxDetectors6 = Array.from({length:6},(_,j) => {
      const start = Math.floor(j*32/6), end = Math.floor((j+1)*32/6);
      const slice = s.axialFlux32.slice(start,end);
      return slice.reduce((a,b)=>a+b,0)/slice.length;
    });
    const grapped = s.rods.R < 200 || [s.rods.G1,s.rods.G2,s.rods.N1,s.rods.N2].some(p => p<260);
    const fxy = grapped ? u.fxYGraped : u.fxYUngraped;
    s.peakLinearWcm = 175*(s.thermalPowerMW/C.nominalThermalMW)
      * Math.max(...s.axialFlux32)*fxy;
    const satTempC=344.79+0.23*(s.pressureBar-155);
    s.subcoolingC=Math.max(0,satTempC-s.hotC);
    const pressureFactor=clamp(Math.sqrt(Math.max(1,s.pressureBar)/155),0.35,1.15);
    const subcoolingFactor=clamp((s.subcoolingC+5)/(344.79-324.6+5),0.05,1.5);
    const fluxFactor=350/Math.max(30,s.peakLinearWcm);
    s.dnbr=clamp(1.65*pressureFactor*subcoolingFactor*fluxFactor
      *Math.sqrt(Math.max(0,s.coreFlowFraction)),0,10);
  }

  function updateProtection(s, u, dt) {
    s.rawFluxRatePctS = (s.powerPct-s.previousPowerPct)/dt;
    s.fluxRatePctS = u.protectionGraphMode
      ? (Number.isFinite(u.protectionGraphFluxRatePctS) ? u.protectionGraphFluxRatePctS : 0)
      : s.rawFluxRatePctS;
    s.previousPowerPct = s.powerPct;
    s.signals = {
      lowPressure: s.pressureBar < u.tripLowPressureBar,
      highFluxAlarm: s.powerPct >= u.fluxPrealarmPct,
      highFluxTrip: s.powerPct >= u.tripHighFluxPct,
      rapidFluxRise: s.fluxRatePctS >= u.tripFluxRatePctS,
      rapidFluxFall: s.fluxRatePctS <= -u.tripFluxRatePctS,
      voltageLoss: s.lossOfVoltage,
      risLowPressure: s.pressureBar < u.risLowPressureBar,
      rBelowLimit: s.rods.R < s.rLimitPas - 0.5
    };
    s.protectionsEnabled = Boolean(u.protectionsEnabled);
    s.risEnabled = Boolean(u.risEnabled);
    if (s.protectionsEnabled && !u.protectionGraphMode) {
      const reason = s.signals.voltageLoss ? "Manque de tension"
        : s.signals.lowPressure ? "Basse pression primaire"
        : s.signals.highFluxTrip ? "Haut flux nucléaire"
        : s.signals.rapidFluxRise ? "Variation rapide positive du flux"
        : s.signals.rapidFluxFall ? "Variation rapide négative du flux" : null;
      if (reason) requestTrip(s, `AAR : ${reason}`);
    }
    if (s.risEnabled && !u.protectionGraphMode && s.signals.risLowPressure)
      requestRis(s, "IS : basse pression primaire");
    if (s.tripDemandAt !== null && s.tripAt === null
        && s.time-s.tripDemandAt >= C.tripActuationS) {
      s.tripAt = s.time;
      addEvent(s, "protection", "Chute des groupes R, GCP et SA à SD");
    }
    if (s.risDemandAt !== null && s.risAt === null
        && s.time-s.risDemandAt >= C.risActuationS) {
      s.risAt = s.time;
      addEvent(s, "protection", "RIS demandé : attente de la capacité des pompes et du transit");
    }
  }

  function risPumpFlows(s, u) {
    const p = s.pressureBar;
    const sourceReady = s.risTankRemainingKg > 0;
    const voltageReady = !s.lossOfVoltage || s.time-s.voltageLostAt >= C.dieselStartS;
    const enabled = s.risEnabled && s.risAt !== null && sourceReady && voltageReady;
    const mpOne = p >= 120 ? 0 : p >= 40 ? (120-p) : 80+Math.max(0,40-p);
    const bpOne = p >= 40 ? 0 : 9*(40-p);
    s.risMpKgS = enabled ? mpOne*u.mpTrainEnabled.filter(Boolean).length*u.risMpScale : 0;
    s.risBpKgS = enabled ? bpOne*u.bpTrainEnabled.filter(Boolean).length*u.risBpScale : 0;
    const pumped = Math.min(s.risMpKgS+s.risBpKgS, s.risTankRemainingKg/0.1);
    if (pumped < s.risMpKgS+s.risBpKgS) {
      const ratio = pumped/(s.risMpKgS+s.risBpKgS);
      s.risMpKgS *= ratio; s.risBpKgS *= ratio;
    }
  }
  function pumpToPipe(pipe, at, massKg, boronPpm) {
    if (massKg > 0) {
      pipe.push({ at, massKg, boronPpm });
      pipe.sort((a,b) => a.at-b.at);
    }
  }
  function deliverPipe(pipe, time) {
    let massKg=0, boron=0;
    while (pipe.length && pipe[0].at <= time+1e-9) {
      const parcel = pipe.shift();
      massKg += parcel.massKg;
      boron += parcel.massKg*parcel.boronPpm;
    }
    return { massKg, boron };
  }

  function updateGv(s, u, dt) {
    const nominal = C.nominalSteamKgSPerGV;
    const totalTarget = s.turbineTrip ? 0 : s.demandPct;
    s.turbinePct += clamp(totalTarget-s.turbinePct,-4*dt,4*dt);
    let sumHeat=0, sumSteam=0, sumTurbineSteam=0, sumFeed=0;
    for (const gv of s.gv) {
      const flowFraction = s.loops[gv.index-1].flowKgS/(C.nominalPrimaryFlowKgS/4);
      const levelFactor = clamp(gv.waterKg/C.gvNominalWaterKg, 0.08, 1.1);
      gv.heatMW = Math.max(0, C.gvConductanceMWCPerUnit
        * Math.max(0,s.tavgC-gv.tempC)*flowFraction*levelFactor);
      const pressureFactor = Math.sqrt(clamp(gv.pressureBar/C.steamPressureBar,0.05,1.5));
      const valveTarget = clamp(u.gvSteamValvePct[gv.index-1], 0, 100);
      gv.steamValvePct += clamp(valveTarget-gv.steamValvePct,
        -C.steamValveStrokePctPerS*dt, C.steamValveStrokePctPerS*dt);
      gv.turbineSteamKgS = nominal*(s.turbinePct/100)*pressureFactor*gv.steamValvePct/100;
      const gctATarget = clamp(100*(gv.pressureBar-C.gctAPressureBar)/C.gctABandBar, 0, 100);
      gv.gctAValvePct += clamp(gctATarget-gv.gctAValvePct,
        -C.gctAStrokePctPerS*dt, C.gctAStrokePctPerS*dt);
      gv.dumpKgS = C.gctAFullKgSPerGV*gv.gctAValvePct/100
        *Math.sqrt(gv.pressureBar/C.gctAPressureBar);
      // Mesure vapeur du GV, également utilisée par l'anticipation ARE.
      gv.steamKgS = gv.turbineSteamKgS + gv.dumpKgS;
      const graphFeed=u.gvGraphFeedPct[gv.index-1];
      let feedTarget=Number.isFinite(graphFeed)
        ? clamp(graphFeed,0,100)*9.5
        : clamp(u.gvManualFeedPct[gv.index-1],0,100)*9.5;
      if (s.lossOfVoltage) feedTarget = 0;
      gv.feedKgS += (feedTarget-gv.feedKgS)*clamp(dt/8,0,1);
      gv.feedValvePct = 100*gv.feedKgS/950;
      gv.waterKg = clamp(gv.waterKg+(gv.feedKgS-gv.steamKgS)*dt,0,200000);
      Object.assign(gv, gvLevels(gv.waterKg));
      const netMW = gv.heatMW-gv.steamKgS*C.steamEnthalpyJkg/1e6;
      gv.tempC = clamp(gv.tempC+netMW*1e6*dt/C.gvHeatCapacityJk,150,330);
      gv.pressureBar = saturationPressureBar(gv.tempC);
      sumHeat += gv.heatMW;
      sumSteam += gv.steamKgS;
      sumTurbineSteam += gv.turbineSteamKgS;
      sumFeed += gv.feedKgS;
    }
    s.totalGvMW=sumHeat; s.totalSteamKgS=sumSteam; s.totalFeedKgS=sumFeed;
    s.totalTurbineSteamKgS=sumTurbineSteam;
    s.electricMW=C.nominalElectricMW*sumTurbineSteam/(4*nominal);
  }

  function sample(s) {
    if (s.time+1e-9 < s.sampleAt) return;
    s.sampleAt = s.time+1;
    s.history.push({ t:s.time, power:s.powerPct, electric:s.electricMW,
      tavg:s.tavgC,fuel:s.fuelC,reactivity:s.reactivityPcm,
      pressure:s.pressureBar,
      boron:s.boronPpm, gv:s.gv.map(g=>g.levelPct), r:s.rods.R,
      g3:s.g3Count, ris:s.risDeliveredKgS, break:s.breakKgS,
      pline:s.peakLinearWcm });
    if (s.history.length>3600) s.history.shift();
  }

  function step(model, dt) {
    const s=model.state,u=model.controls;
    dt=clamp(Number(dt)||0,0,0.1);
    if (!dt) return s;
    if(u.transientPhase==="approach"||u.transientPhase==="return") {
      const error=u.transientTargetDemandPct-s.demandPct;
      s.demandPct=clamp(s.demandPct+clamp(error,-20*dt/60,20*dt/60),0,110);
      if(Math.abs(s.demandPct-u.transientTargetDemandPct)<1e-9){
        if(u.transientPhase==="return"){
          u.transientPhase="off";u.demandPct=100;
        }else{
          u.transientPhase="run";u.transientStartS=s.time;
        }
      }
    } else {
      const transient=u.transientPhase==="run"
        ? transientDemand(u.transient,s.time-u.transientStartS) : null;
      s.demandPct=clamp(transient===null?Number(u.demandPct):transient,0,110);
    }
    s.trefC=297.2+9.3*clamp(s.demandPct,0,100)/100;
    s.rLimitPas=rInsertionLimit(s.powerPct,u.halfCycle);
    s.rcvTankBoronPpm=clamp(Number(u.rcvTankBoronPpm),0,3000);
    s.breakAreaCm2=clamp(Number(u.breakAreaCm2)||0,0,2000);
    s.breakLoop=clamp(Math.round(Number(u.breakLoop)||1),1,4);
    s.breakBranch=u.breakBranch;
    updateProtection(s,u,dt);
    updateRods(s,u,dt);

    const rodPcm=rodsReactivityPcm(s.rods,s.ejectWorthPcm,u.rodWorthPcm);
    const boronPcm=C.boronWorthPcmPpm*(s.boronPpm-C.boronInitialPpm);
    const tempPcm=C.coolantWorthPcmC*(s.tavgC-C.primaryMeanC);
    const dopplerPcm=C.dopplerWorthPcmC*(s.fuelC-C.fuelC);
    const xenonPcm=-150*((s.xenonTop+s.xenonBottom)/2-1);
    s.reactivityParts={rod:rodPcm,boron:boronPcm,temp:tempPcm,doppler:dopplerPcm,xenon:xenonPcm};
    s.reactivityPcm=rodPcm+boronPcm+tempPcm+dopplerPcm+xenonPcm;
    const rho=clamp(s.reactivityPcm*1e-5,-0.15,0.012);
    const source=s.precursors.reduce((sum,c,i)=>sum+C.lambdaGroups[i]*c,0);
    const n=clamp((s.powerPct/100+dt*source)
      /(1-dt*(rho-C.beta)/C.promptGenerationS),1e-8,3);
    s.precursors=s.precursors.map((c,i)=>Math.max(0,
      (c+dt*C.betaGroups[i]*n/C.promptGenerationS)/(1+dt*C.lambdaGroups[i])));
    s.powerPct=100*n;
    s.fissionMW=C.nominalThermalMW*n;
    s.decayMW=s.tripAt===null?0:0.06*C.nominalThermalMW
      *(1+Math.max(0,s.time-s.tripAt)/30)**-0.25;
    s.thermalPowerMW=s.fissionMW+s.decayMW;

    // Les quatre boucles partagent l'inventaire global, sans le multiplier par quatre.
    for (const loop of s.loops) {
      const flowTarget=(s.primaryPumpsStopped||loop.pumpStopped?0:1)
        *(C.nominalPrimaryFlowKgS/4);
      const localFactor=s.breakAreaCm2>0 && s.breakLoop===loop.index?0.82:1;
      const tau=flowTarget===0?C.pumpCoastdownTauS:8;
      loop.flowKgS+=(flowTarget*localFactor-loop.flowKgS)*clamp(dt/tau,0,1);
      if(flowTarget===0&&loop.flowKgS<0.02*C.nominalPrimaryFlowKgS/4)
        loop.flowKgS=0;
      const fraction=loop.flowKgS/(C.nominalPrimaryFlowKgS/4);
      // La variation 7→10 bar avec T représente l'effet de densité sur la HMT.
      // Les pertes cuve et GV suivent le carré du débit de la boucle.
      const headAtTemp=tempC=>clamp(C.pumpHeadHotBar
        +(C.pumpHeadColdBar-C.pumpHeadHotBar)*(324.6-tempC)/(324.6-20),
        C.pumpHeadHotBar,C.pumpHeadColdBar);
      loop.pumpHeadHotBar=headAtTemp(loop.hotC)*fraction*fraction;
      loop.pumpHeadColdBar=headAtTemp(loop.coldC)*fraction*fraction;
      const nominalColdHead=headAtTemp(288.4);
      loop.vesselDeltaBar=C.sprayDriveNominalBar
        *loop.pumpHeadColdBar/nominalColdHead;
      loop.gvDeltaBar=loop.vesselDeltaBar;
    }
    s.coreFlowFraction=clamp(s.loops.reduce((a,l)=>a+l.flowKgS,0)/C.nominalPrimaryFlowKgS,0,1);
    s.coveragePct=100*clamp((s.primaryMassKg/C.nominalPrimaryMassKg-0.53)/0.30,0,1);
    // Loi globale à K fixe : le transfert ne s'annule pas à l'arrêt des GMPP.
    // Le même échange est retiré du combustible et ajouté au primaire.
    const coreTransferMW=C.coreConductanceMWC*(s.fuelC-s.tavgC);
    updateGv(s,u,dt);
    const fuelDelta=(s.thermalPowerMW-coreTransferMW)*1e6*dt/C.fuelHeatCapacityJk;
    s.fuelC=clamp(s.fuelC+fuelDelta,20,3000);

    // Brèche primaire, RIS à pression variable et transit des volumes injectés.
    const density=clamp(C.primaryDensityKgM3*(s.pressureBar/155)**0.08,150,760);
    const fluxOrifice=0.68*Math.sqrt(2*density*Math.max(0,s.pressureBar-1)*1e5);
    const fluxLimit=C.breakCriticalFluxKgM2S*Math.sqrt(Math.max(0,s.pressureBar)/155);
    s.breakKgS=s.breakAreaCm2*1e-4*Math.min(fluxOrifice,fluxLimit);
    s.breakKgS=Math.min(s.breakKgS,Math.max(0,
      (s.primaryMassKg-C.minPrimaryMassFraction*C.nominalPrimaryMassKg)/dt));
    risPumpFlows(s,u);
    let accumPump=0;
    if(s.risEnabled && s.risDemandAt!==null && s.pressureBar<45) {
      for(let i=0;i<4;i++) {
        const q=Math.min(400,s.accumulatorsKg[i]/dt);
        accumPump+=q;
        s.accumulatorsKg[i]-=q*dt;
      }
    }
    s.accumulatorKgS=accumPump;
    const risPump=Math.min(s.risMpKgS+s.risBpKgS,s.risTankRemainingKg/dt);
    s.risTankRemainingKg-=risPump*dt;
    pumpToPipe(s.risPipe,s.time+C.risTransitS,risPump*dt,
      clamp(Number(u.risBoronPpm),0,4000));
    pumpToPipe(s.risPipe,s.time+C.accumulatorTransitS,accumPump*dt,
      clamp(Number(u.risBoronPpm),0,4000));
    const arrivedRis=deliverPipe(s.risPipe,s.time);
    s.risDeliveredKgS=arrivedRis.massKg/dt;

    const chargeM3h=Number.isFinite(u.rcvChargeGraphM3h)
      ? u.rcvChargeGraphM3h : u.rcvChargeM3h;
    const rcvFlow=clamp(Number(chargeM3h),0,30)*C.primaryDensityKgM3/3600;
    const letdown=C.rcvLetdownM3h*C.primaryDensityKgM3/3600;
    s.rcvChargeKgS=rcvFlow;
    s.rcvLetdownKgS=letdown;
    pumpToPipe(s.rcvPipe,s.time+C.rcvTransitS,rcvFlow*dt,s.rcvTankBoronPpm);
    const arrivedRcv=deliverPipe(s.rcvPipe,s.time);
    s.rcvDeliveredKgS=arrivedRcv.massKg/dt;

    s.reliefStages=u.manualReliefStages.map(Boolean);
    s.reliefKgS=s.reliefStages.filter(Boolean).length*50
      *Math.sqrt(Math.max(0,s.pressureBar)/155);
    const oldMass=s.primaryMassKg;
    const outMass=(s.breakKgS+letdown+s.reliefKgS)*dt;
    s.boronInventory+=arrivedRis.boron+arrivedRcv.boron
      -outMass*s.boronPpm;
    s.primaryMassKg=clamp(oldMass+arrivedRis.massKg+arrivedRcv.massKg-outMass,
      C.minPrimaryMassFraction*C.nominalPrimaryMassKg,1.25*C.nominalPrimaryMassKg);
    s.boronPpm=clamp(s.boronInventory/s.primaryMassKg,0,4000);

    const coolingInjectionMW=s.risDeliveredKgS*C.primaryCpJkgK
      *Math.max(0,s.tavgC-30)/1e6;
    const breakCoolingMW=(s.breakKgS+s.reliefKgS)*0.35;
    const tavgDelta=(coreTransferMW-s.totalGvMW-coolingInjectionMW-breakCoolingMW)
      *1e6*dt/(Math.max(0.2*C.nominalPrimaryMassKg,oldMass)*C.primaryCpJkgK);
    s.tavgC=clamp(s.tavgC+tavgDelta,20,360);
    s.nrefPct=Number.isFinite(u.nrefGraphPct)
      ? clamp(u.nrefGraphPct,0,100)
      : clamp(20+21.8*(s.tavgC-297.2)/9.3,20,41.8);
    let sprayDemandPct;
    if(Number.isFinite(u.pressureGraphHeaterKW)
        || Number.isFinite(u.pressureGraphSprayPct)) {
      s.heaterKW=Number.isFinite(u.pressureGraphHeaterKW)
        ? clamp(u.pressureGraphHeaterKW,0,2500) : s.heaterKW;
      sprayDemandPct=Number.isFinite(u.pressureGraphSprayPct)
        ? clamp(u.pressureGraphSprayPct,0,100) : s.sprayPct;
    } else {
      s.heaterKW=clamp(Number(u.manualHeaterKW),0,2500);
      sprayDemandPct=clamp(Number(u.manualSprayPct),0,100);
    }
    s.sprayPct+=clamp(sprayDemandPct-s.sprayPct,
      -C.sprayStrokePctPerS*dt,C.sprayStrokePctPerS*dt);
    const sprayDrive1=s.loops[0].vesselDeltaBar;
    const sprayDrive2=s.loops[1].vesselDeltaBar;
    s.sprayDriveBar=(sprayDrive1+sprayDrive2)/2;
    const line1Drive=Math.sqrt(Math.max(0,sprayDrive1)/C.sprayDriveNominalBar);
    const line2Drive=Math.sqrt(Math.max(0,sprayDrive2)/C.sprayDriveNominalBar);
    const sprayLine1M3h=(C.sprayFullM3hPerValve*s.sprayPct/100
      +C.sprayContinuousM3hPerValve)*line1Drive;
    const sprayLine2M3h=(C.sprayFullM3hPerValve*s.sprayPct/100
      +C.sprayContinuousM3hPerValve)*line2Drive;
    s.sprayValveM3h=C.sprayFullM3hPerValve*s.sprayPct/100
      *(line1Drive+line2Drive);
    s.sprayContinuousM3h=C.sprayContinuousM3hPerValve
      *(line1Drive+line2Drive);
    s.sprayFlowM3h=sprayLine1M3h+sprayLine2M3h;
    s.sprayFlowPct=100*s.sprayFlowM3h/(2*C.sprayFullM3hPerValve);
    s.sprayFlowKgS=s.sprayFlowM3h*C.primaryDensityKgM3/3600;
    const spraySourceC=s.sprayFlowM3h>0
      ? (sprayLine1M3h*s.loops[0].coldC+sprayLine2M3h*s.loops[1].coldC)
        /s.sprayFlowM3h
      : (s.loops[0].coldC+s.loops[1].coldC)/2;
    const saturationC=344.79+0.23*(s.pressureBar-155);
    const sprayCoolingKW=s.sprayFlowKgS*C.primaryCpJkgK
      *Math.max(0,saturationC-spraySourceC)/1000;
    // Échange passif effectif calibré au point nominal ; sa valeur reste
    // une hypothèse, distincte du débit d'aspersion documenté.
    const pzrNetHeatMW=(s.heaterKW-C.pzrPassiveTransferKW-sprayCoolingKW)/1000;
    const pressureDelta=((s.primaryMassKg-oldMass)/dt/C.primaryPressureCapacityKgBar
      + 0.2*tavgDelta/dt
      + C.pressureHeatGainBarPerMWs*pzrNetHeatMW)*dt;
    s.pressureBar=clamp(s.pressureBar+pressureDelta,1,180);
    s.pzrLevelPct=clamp(42+(s.primaryMassKg-C.nominalPrimaryMassKg)/650
      + 0.6*(s.tavgC-C.primaryMeanC),0,100);
    const deltaT=s.thermalPowerMW*1e6
      /(Math.max(0.1,s.coreFlowFraction)*C.nominalPrimaryFlowKgS*C.primaryCpJkgK);
    s.hotC=s.tavgC+deltaT/2;
    s.coldC=s.tavgC-deltaT/2;
    // T RIC est la sortie moyenne du cœur avant mélange avec les 7 % de bypass.
    // Les branches chaudes mesurent, elles, la sortie de cuve après mélange.
    s.tRicC=s.coldC+C.corePowerFraction*deltaT/(1-C.coreBypassFraction);
    for(const loop of s.loops) {
      const gv=s.gv[loop.index-1];
      const asymmetry=(gv.heatMW-s.totalGvMW/4)/70;
      loop.hotC=s.hotC+asymmetry;
      loop.coldC=s.coldC-asymmetry;
    }
    updateAxial(s,u,dt);
    s.time+=dt;
    sample(s);
    return s;
  }
  function advance(model, seconds, dt=0.1) {
    let remaining=Math.max(0,Number(seconds)||0);
    while(remaining>1e-9) {
      const h=Math.min(remaining,dt,0.1);
      step(model,h); remaining-=h;
    }
    return model.state;
  }
  return { C,G3,ROD_NAMES,ROD_WORTH_PCM,TRANSIENTS,make,step,advance,
    g3Target,gcpPositions,rInsertionLimit,rodIntegral,rodsReactivityPcm,
    saturationPressureBar,saturationTemperatureC,gvLevels,
    startTransient,transientDemand,initiate,prepareRcvTank };
});
