/* SimuREP Sûreté — modèle réduit, exclusivement pédagogique.
   Les coefficients sont des hypothèses de démonstration, pas des données de dimensionnement. */
(function (root) {
  "use strict";

  const P = Object.freeze({
    nominalMW: 3817, mass0: 269064, coolantCp: 5500, fuelCapacity: 45e6,
    coreConductance: 3817 / (800 - 306), sgConductance: 3817 / (306 - 281),
    referenceTemp: 306, referenceFuel: 800, referencePressure: 155,
    beta: 0.00650, generationTime: 0.1,
    betaGroups: [0.00025, 0.00125, 0.00120, 0.00260, 0.00085, 0.00035],
    lambdaGroups: [0.0124, 0.0305, 0.111, 0.301, 1.14, 3.01],
    rodWorthPcm: [650, 750, 1050, 1450],
    rodInitial: [100, 100, 70, 50],
    rodSpeedPctS: 0.53,
    tripDelayS: 0.45,
    tripInsertionS: 2.7,
    boronInitialPpm: 1200,
    boronWorthPcmPerPpm: -7,
    coolantWorthPcmPerC: -28,
    dopplerWorthPcmPerC: -1.2,
    chargingKgS: 3,
    chargingBoronPpm: 2400,
    injectionBoronPpm: 2200,
    maxFluxKgM2S: 25000,
    pressureCapacitanceKgBar: 620,
    minimumMassFraction: 0.20
  });

  const SCENARIOS = Object.freeze({
    normal: { label: "Référence stable", breakAreaCm2: 0, eccs: true, trip: true, stuckBank: -1 },
    small: { label: "Petite brèche · 2 cm²", breakAreaCm2: 2, eccs: true, trip: true, stuckBank: -1 },
    medium: { label: "Brèche intermédiaire · 300 cm²", breakAreaCm2: 300, eccs: true, trip: true, stuckBank: -1 },
    large: { label: "Grande brèche · 1 500 cm²", breakAreaCm2: 1500, eccs: true, trip: true, stuckBank: -1 },
    noEccs: { label: "Brèche · injection indisponible", breakAreaCm2: 300, eccs: false, trip: true, stuckBank: -1 },
    stuckRod: { label: "Brèche · grappe bloquée", breakAreaCm2: 300, eccs: true, trip: true, stuckBank: 3 }
  });

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const worthShape = p => (1 - Math.cos(Math.PI * clamp(p, 0, 100) / 100)) / 2;
  const clone = o => JSON.parse(JSON.stringify(o));

  function initialState(settings) {
    const groups = P.betaGroups.map((beta, i) => beta / (P.generationTime * P.lambdaGroups[i]));
    return {
      time: 0, massKg: P.mass0, boronInventory: P.boronInitialPpm * P.mass0,
      boronPpm: P.boronInitialPpm, pressureBar: P.referencePressure,
      coolantC: P.referenceTemp, fuelC: P.referenceFuel,
      neutron: 1, precursors: groups, fissionMW: P.nominalMW,
      decayMW: 0, coreMW: P.nominalMW, sgMW: P.nominalMW,
      reactivityPcm: 0, rods: P.rodInitial.slice(), targets: P.rodInitial.slice(),
      coverage: 1, void: 0, circulation: 1, breakKgS: 0, injectionKgS: 0,
      injectionHP: 0, injectionLP: 0, accumulatorKgS: 0, accumulatorRemainingKg: 35000,
      tripDemandAt: null, tripAt: null, eccsDemandAt: null, eccsAt: null,
      breakIsolated: false, pumpStopped: false,
      events: [{ time: 0, kind: "info", text: `Scénario chargé : ${settings.label}` }],
      peakFuelC: P.referenceFuel, minCoverage: 1, minPressureBar: P.referencePressure,
      peakFissionPct: 100, minReactivityPcm: 0,
      samples: [], sampleClock: 0
    };
  }

  function effectiveRodReactivity(rods) {
    return rods.reduce((sum, position, i) => sum + P.rodWorthPcm[i]
      * (worthShape(position) - worthShape(P.rodInitial[i])), 0);
  }

  function addEvent(s, kind, text) {
    s.events.push({ time: s.time, kind, text });
    if (s.events.length > 100) s.events.shift();
  }

  function sample(s) {
    s.samples.push({
      t: s.time, p: s.pressureBar, m: 100 * s.massKg / P.mass0,
      cover: 100 * s.coverage, fuel: s.fuelC, coolant: s.coolantC,
      boron: s.boronPpm, power: 100 * s.fissionMW / P.nominalMW,
      breakFlow: s.breakKgS, injection: s.injectionKgS,
      rho: s.reactivityPcm
    });
    if (s.samples.length > 3601) s.samples.shift();
  }

  function make(scenario = "normal") {
    const basis = typeof scenario === "string" ? SCENARIOS[scenario] : scenario;
    if (!basis) throw new Error("Scénario inconnu");
    const settings = Object.assign({ label: "Scénario personnalisé", breakAreaCm2: 0,
      eccs: true, trip: true, stuckBank: -1, boration: "off" }, clone(basis));
    const state = initialState(settings);
    sample(state);
    return { settings, state };
  }

  function setSetting(model, name, value) {
    const s = model.state, c = model.settings;
    if (name === "breakAreaCm2") {
      c.breakAreaCm2 = clamp(Number(value) || 0, 0, 5000);
      s.breakIsolated = false;
      addEvent(s, "action", `Section de brèche : ${c.breakAreaCm2} cm²`);
    } else if (name === "eccs" || name === "trip") {
      c[name] = Boolean(value);
      addEvent(s, "action", `${name === "eccs" ? "Injection de secours" : "Arrêt automatique"} ${c[name] ? "disponible" : "indisponible"}`);
    } else if (name === "stuckBank") {
      c.stuckBank = clamp(Math.round(Number(value)), -1, 3);
      addEvent(s, "action", c.stuckBank < 0 ? "Aucune grappe bloquée" : `Groupe ${"ABCD"[c.stuckBank]} bloqué`);
    } else if (name === "boration") {
      c.boration = ["off", "borate", "dilute"].includes(value) ? value : "off";
      addEvent(s, "action", `RCV : ${c.boration === "borate" ? "borication" : c.boration === "dilute" ? "dilution" : "arrêt"}`);
    } else if (name === "isolate") {
      s.breakIsolated = Boolean(value);
      addEvent(s, "action", s.breakIsolated ? "Brèche isolée (hypothèse d'exercice)" : "Brèche rouverte");
    }
  }

  function setRodTarget(model, bank, target) {
    const i = Number(bank);
    if (!Number.isInteger(i) || i < 0 || i > 3) return;
    model.state.targets[i] = clamp(Number(target) || 0, 0, 100);
    addEvent(model.state, "action", `Consigne groupe ${"ABCD"[i]} : ${model.state.targets[i].toFixed(0)} % extraits`);
  }

  function step(model, dt) {
    const s = model.state, c = model.settings;
    dt = clamp(Number(dt) || 0, 0, 0.05);
    if (dt === 0) return s;
    const oldTime = s.time;
    s.time += dt;

    // Les groupes se déplacent séparément ; un groupe bloqué reste à sa position.
    for (let i = 0; i < 4; i++) {
      if (c.stuckBank === i) continue;
      const target = s.tripAt === null ? s.targets[i] : 0;
      const rate = s.tripAt === null ? P.rodSpeedPctS : 100 / P.tripInsertionS;
      s.rods[i] += clamp(target - s.rods[i], -rate * dt, rate * dt);
    }

    const areaM2 = s.breakIsolated ? 0 : c.breakAreaCm2 * 1e-4;
    const density = clamp(720 * (s.pressureBar / 155) ** 0.08, 150, 760);
    const drivingPa = Math.max(0, (s.pressureBar - 1) * 1e5);
    const orificeFlux = 0.68 * Math.sqrt(2 * density * drivingPa);
    const criticalFlux = P.maxFluxKgM2S * Math.sqrt(Math.max(0, s.pressureBar) / 155);
    s.breakKgS = areaM2 * Math.min(orificeFlux, criticalFlux);
    s.breakKgS = Math.min(s.breakKgS, Math.max(0, (s.massKg - P.minimumMassFraction * P.mass0) / dt));

    if (c.trip && s.tripDemandAt === null && (s.pressureBar < 130 || s.neutron > 1.15)) {
      s.tripDemandAt = s.time;
      addEvent(s, "protection", "Ordre d'arrêt automatique : pression basse ou puissance haute");
    }
    if (s.tripDemandAt !== null && s.tripAt === null && s.time - s.tripDemandAt >= P.tripDelayS) {
      s.tripAt = s.time;
      addEvent(s, "protection", "Chute des grappes commencée");
    }
    if (s.pressureBar < 120 && s.eccsDemandAt === null) {
      s.eccsDemandAt = s.time;
      addEvent(s, "protection", "Signal d'injection de secours : pression basse");
    }
    if (c.eccs && s.eccsDemandAt !== null && s.eccsAt === null && s.time - s.eccsDemandAt >= 2) {
      s.eccsAt = s.time;
      addEvent(s, "protection", "Injection de secours en service");
    }

    s.injectionHP = s.eccsAt !== null && s.pressureBar < 125 ? 140 : 0;
    s.injectionLP = s.eccsAt !== null && s.pressureBar < 25 ? 1000 : 0;
    s.accumulatorKgS = c.eccs && s.pressureBar < 45 && s.accumulatorRemainingKg > 0
      ? Math.min(2000, s.accumulatorRemainingKg / dt) : 0;
    s.accumulatorRemainingKg -= s.accumulatorKgS * dt;
    s.injectionKgS = s.injectionHP + s.injectionLP + s.accumulatorKgS;
    const charge = c.boration === "off" ? 0 : P.chargingKgS;
    const chargeBoron = c.boration === "borate" ? P.chargingBoronPpm : 0;

    const rodPcm = effectiveRodReactivity(s.rods);
    s.reactivityPcm = rodPcm
      + P.boronWorthPcmPerPpm * (s.boronPpm - P.boronInitialPpm)
      + P.coolantWorthPcmPerC * (s.coolantC - P.referenceTemp)
      + P.dopplerWorthPcmPerC * (s.fuelC - P.referenceFuel);
    const rho = clamp(s.reactivityPcm * 1e-5, -0.12, 0.012);
    const source = s.precursors.reduce((sum, precursor, i) => sum + P.lambdaGroups[i] * precursor, 0);
    const nextNeutron = clamp((s.neutron + dt * source)
      / (1 - dt * (rho - P.beta) / P.generationTime), 1e-9, 3);
    s.precursors = s.precursors.map((precursor, i) =>
      Math.max(0, (precursor + dt * P.betaGroups[i] * nextNeutron / P.generationTime)
        / (1 + dt * P.lambdaGroups[i])));
    s.neutron = nextNeutron;
    s.fissionMW = P.nominalMW * s.neutron;
    s.decayMW = s.tripAt === null ? 0
      : 0.06 * P.nominalMW * (1 + (s.time - s.tripAt) / 30) ** -0.25;

    const inventoryRatio = s.massKg / P.mass0;
    const satC = 100 + 100 * Math.log10(Math.max(1, s.pressureBar)); // approximation d'affichage uniquement
    s.void = clamp((s.coolantC - satC) / 100 + Math.max(0, 0.82 - inventoryRatio), 0, 0.9);
    s.coverage = clamp((inventoryRatio - 0.52) / 0.27 - 0.22 * s.void, 0, 1);
    if (s.pressureBar < 50 && !s.pumpStopped) {
      s.pumpStopped = true;
      addEvent(s, "protection", "Circulation forcée perdue ; transfert par circulation résiduelle");
    }
    s.circulation = clamp((s.pumpStopped ? 0.16 : 1)
      * (0.35 + 0.65 * s.coverage) * (s.pressureBar / 155) ** 0.25, 0.035, 1);
    const coreFactor = Math.max(0.002, s.coverage * (0.15 + 0.85 * s.circulation));
    s.coreMW = Math.max(0, P.coreConductance * coreFactor * (s.fuelC - s.coolantC));
    s.sgMW = Math.max(0, P.sgConductance * s.circulation * (s.coolantC - 281));
    const fuelRate = (s.fissionMW + s.decayMW - s.coreMW) * 1e6 / P.fuelCapacity;
    s.fuelC = clamp(s.fuelC + fuelRate * dt, 20, 3000);

    const massBefore = s.massKg;
    const outlet = s.breakKgS + charge; // RCV : débit soutiré = débit chargé.
    s.massKg = clamp(massBefore + (s.injectionKgS + charge - outlet) * dt,
      P.minimumMassFraction * P.mass0, 1.2 * P.mass0);
    s.boronInventory += (s.injectionKgS * P.injectionBoronPpm + charge * chargeBoron
      - outlet * s.boronPpm) * dt;
    s.boronPpm = clamp(s.boronInventory / s.massKg, 0, 3000);
    const injectionCoolingMW = (s.injectionKgS * P.coolantCp * (s.coolantC - 30)) / 1e6;
    const flashCoolingMW = s.breakKgS * 0.35;
    const coolantRate = (s.coreMW - s.sgMW - injectionCoolingMW - flashCoolingMW)
      * 1e6 / (Math.max(0.2 * P.mass0, massBefore) * P.coolantCp);
    s.coolantC = clamp(s.coolantC + coolantRate * dt, 20, 360);
    const pressureCapacity = P.pressureCapacitanceKgBar * (1 + 2 * s.void);
    s.pressureBar = clamp(s.pressureBar + ((s.injectionKgS - s.breakKgS)
      / pressureCapacity + 0.28 * coolantRate) * dt, 1, 180);

    s.peakFuelC = Math.max(s.peakFuelC, s.fuelC);
    s.minCoverage = Math.min(s.minCoverage, s.coverage);
    s.minPressureBar = Math.min(s.minPressureBar, s.pressureBar);
    s.peakFissionPct = Math.max(s.peakFissionPct, 100 * s.neutron);
    s.minReactivityPcm = Math.min(s.minReactivityPcm, s.reactivityPcm);
    if (oldTime < 0.01 && c.breakAreaCm2 > 0) addEvent(s, "incident", `Brèche primaire ouverte : ${c.breakAreaCm2} cm²`);
    if (s.coverage < 0.99 && !s.uncoverLogged) {
      s.uncoverLogged = true;
      addEvent(s, "incident", "Début de perte de couverture du cœur (indicateur réduit)");
    }
    if (s.fuelC >= 1200 && !s.hotLogged) {
      s.hotLogged = true;
      addEvent(s, "incident", "Seuil pédagogique de température combustible franchi : 1 200 °C");
    }
    if (s.time - s.sampleClock >= 0.5) {
      s.sampleClock = s.time;
      sample(s);
    }
    return s;
  }

  function advance(model, seconds, dt = 0.02) {
    let remaining = Math.max(0, seconds);
    while (remaining > 1e-9) {
      const next = Math.min(dt, remaining);
      step(model, next);
      remaining -= next;
    }
    return model.state;
  }

  function assessment(s) {
    return [
      { label: "Arrêt demandé", ok: s.tripDemandAt !== null, pending: s.time < 10 && s.tripDemandAt === null },
      { label: "Réactivité négative", ok: s.reactivityPcm < 0, pending: s.time < 3 },
      { label: "Couverture du cœur ≥ 80 %", ok: s.minCoverage >= 0.8, pending: false },
      { label: "Combustible < 1 200 °C", ok: s.peakFuelC < 1200, pending: false }
    ];
  }

  const api = { P, SCENARIOS, make, step, advance, setSetting, setRodTarget,
    effectiveRodReactivity, assessment };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SafetyEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
