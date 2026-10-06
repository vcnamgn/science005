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
  // REF-01, tableau 10, p. PDF 76 : 64,74 t d'eau à 60 % GE (GV 68/19).
  // La conversion hauteur–masse reste linéaire dans cette géométrie d'étude.
  const gvKgPerMetre = 64740 / (gvNarrowBottomM + 0.60 * (gvWideTopM - gvNarrowBottomM));
  const gvNominalWaterKg = gvKgPerMetre * (gvNarrowBottomM + 0.55 * (gvWideTopM - gvNarrowBottomM));
  const secondaryCpJkgK = 4200, areFeedTempC = 245;
  // Contribution métallique effective d'étude, sans compter une seconde fois
  // l'eau primaire, déjà incluse dans son propre bilan énergétique.
  const gvMetalHeatCapacityJk = 100e6;
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
    primaryDensityKgM3: 720, risWaterDensityKgM3: 1000,
    risInjectionTempC: 20,
    minPrimaryMassFraction: 0.20,
    pumpHeadHotBar: 7, pumpHeadColdBar: 10,
    sprayDriveNominalBar: 3.5,
    sprayFullM3hPerValve: 125, sprayContinuousM3hPerValve: 0.230,
    sprayStrokePctPerS: 50,
    auxiliarySprayMaxM3h: 8, coreDamageDelayS: 5,
    nominalSprayPct: 0, nominalHeaterKW: 288,
    // À 155 bar, 288 kW de chaufferettes compensent l'échange passif et
    // le refroidissement des deux lignes d'aspersion continue (0,46 m³/h).
    pzrPassiveTransferKW: 288-0.46*720/3600*6000*(344.79-288.4)/1000,
    // Calage sur le gradient documenté de -0,15 bar/s à pleine aspersion.
    pressureHeatGainBarPerMWs: 0.15/(250*720/3600*6000*(344.79-288.4)/1e6),
    pumpCoastdownTauS: 15,
    naturalCirculationKgSPerLoop: 250, naturalCirculationMaxKgSPerLoop: 300,
    naturalCirculationReferenceDeltaC: 10,
    boronInitialPpm: 1200, boronWorthPcmPpm: -7,
    coolantWorthPcmC: -30, dopplerWorthPcmC: -2.6,
    promptGenerationS: 0.1, beta: 0.0065,
    betaGroups: [0.00025, 0.00125, 0.0012, 0.0026, 0.0009, 0.0003],
    lambdaGroups: [0.0124, 0.0305, 0.111, 0.301, 1.14, 3.01],
    rodStroke: 260, rodSpeedPasS: 1.2, dropTimeS: 2.24,
    coreConductanceMWC: coreExchangeMWC,
    gvConductanceMWCPerUnit: 3817 / (4 * (306.5 - nominalSteamTempC)),
    gvNominalWaterKg, gvKgPerMetre, gvWideTopM, gvNarrowBottomM,
    gvNominalLevelPct: 55, gvMetalHeatCapacityJk,
    gvHeatCapacityJk: gvMetalHeatCapacityJk + gvNominalWaterKg*secondaryCpJkgK,
    areFeedTempC,
    // Lv effectif calé pour conserver 530,14 kg/s et 954,25 MW/GV au nominal.
    // Sa variation suit la table Lv(P) ; ce n'est pas une EOS secondaire complète.
    gvLatentHeatNominalJkg: 1.8e6-secondaryCpJkgK*(nominalSteamTempC-areFeedTempC),
    steamValveStrokePctPerS: 50,
    gctATempC: saturationTemperatureC(88.6), gctAPressureBar: 88.6,
    // Hypothèses d'étude pour la modulation et la capacité du GCT-A par GV.
    gctABandBar: 1, gctAFullKgSPerGV: 600, gctAStrokePctPerS: 50,
    // ASG : table symétrique utilisateur, avec hystérésis opérateur 10/90 % GE.
    asgStartDelayS: 5,
    asgFeedTempC: 20, secondaryCpJkgK,
    nominalSteamKgSPerGV: 3817e6 / (4 * 1.8e6),
    rcvNominalM3h: 36, rcvSealM3h: 6, rcvLetdownM3h: 36,
    rcvTransitS: 8, risTransitS: 4,
    rcvOrificeM3h: 18, reaBoronPpm: 7000,
    // REF-01, §4.11, p. PDF 45 : valeurs médianes des plages d'étude.
    accumulatorTransitS: 1, accumulatorKgPerLoop: 28200,
    accumulatorVolumeM3: 47.6, accumulatorPressureBar: 41.25,
    accumulatorPolytropicExponent: 1.35, accumulatorResistanceM4: 4100,
    tripLowPressureBar: 130, risLowPressureBar: 120,
    tripHighFluxPct: 109, fluxPrealarmPct: 102,
    tripFluxRatePctS: 5, tripActuationS: 0.35,
    risActuationS: 2, dieselStartS: 10,
    axialNodes: 32, axialZones: 32, axialDetectors: 6,
    nominalAverageLinearWcm: 170.23, activeFuelHeightM: 4.2672,
    tripLinearWcm: 435,
    axialCoupling: 1, axialModeratorAbsorptionPerC: 0.001,
    axialXenonAbsorption: 0.6, xenonEquilibriumWorthPcm: 3000,
    iodineHalfLifeH: 6.6, xenonHalfLifeH: 9.1,
    xenonNominalCapturePerH: 0.2,
    dpaxReferencePctPn: -1
  });

  // Capacités équivalentes d'étude. Les altitudes suivent le croquis fourni,
  // rapportées au fond de cuve ; les volumes sont une répartition schématique
  // de l'inventaire nominal existant, pas une géométrie qualifiée REP 1300.
  const CPP_GEOMETRY = Object.freeze([
    {id:"vessel",label:"Cuve",bottom:0,top:10.63,volume:90},
    {id:"hot",label:"Branches chaudes · 4",bottom:8.0,top:9.4,volume:36},
    {id:"cold",label:"Branches froides · 4",bottom:8.0,top:9.4,volume:40},
    {id:"u",label:"Branches en U · 4",bottom:5.3,top:8.7,volume:30},
    ...[1,2,3,4].map(i=>({id:`gv${i}`,label:`Faisceau GV${i}`,
      bottom:9.2,top:22.1+(i-1)*0.06,volume:40})),
    {id:"pzr",label:"Pressuriseur",bottom:18.1,top:30.1,volume:40}
  ]);
  const CPP_INITIAL_LEVEL_M=18.1+12*0.42;
  const CPP_CORE_BOTTOM_M=3.4, CPP_CORE_TOP_M=CPP_CORE_BOTTOM_M+C.activeFuelHeightM;
  const geometryFill=(g,h)=>clamp((h-g.bottom)/(g.top-g.bottom),0,1);
  const CPP_VOLUME_SCALE=C.nominalPrimaryMassKg/C.primaryDensityKgM3
    /CPP_GEOMETRY.reduce((sum,g)=>sum+g.volume*geometryFill(g,CPP_INITIAL_LEVEL_M),0);
  const CPP_LOOP_CAPACITIES=CPP_GEOMETRY.filter(g=>g.id!=="pzr");
  const CPP_LOOP_VOLUME=CPP_LOOP_CAPACITIES.reduce((sum,g)=>sum+g.volume*CPP_VOLUME_SCALE,0);
  const CPP_LOOP_TOP_M=Math.max(...CPP_LOOP_CAPACITIES.map(g=>g.top));
  const CPP_PZR_GEOMETRY=CPP_GEOMETRY.find(g=>g.id==="pzr");
  const CPP_PZR_VOLUME=CPP_PZR_GEOMETRY.volume*CPP_VOLUME_SCALE;
  function cppInventory(liquidMassKg) {
    const volume=Math.max(0,liquidMassKg)/C.primaryDensityKgM3;
    // Le PZR absorbe d'abord les variations normales d'inventaire : son niveau
    // libre ne constitue pas une surface libre commune aux boucles pressurisées.
    const pzrVolume=clamp(volume-CPP_LOOP_VOLUME,0,CPP_PZR_VOLUME);
    let loopLevelM=CPP_LOOP_TOP_M;
    if(volume<CPP_LOOP_VOLUME){
      let lo=0,hi=CPP_LOOP_TOP_M;
      for(let n=0;n<36;n++) {
        const mid=(lo+hi)/2;
        const contained=CPP_LOOP_CAPACITIES.reduce((sum,g)=>sum+g.volume*CPP_VOLUME_SCALE*geometryFill(g,mid),0);
        if(contained<volume)lo=mid;else hi=mid;
      }
      loopLevelM=(lo+hi)/2;
    }
    const pzrLevelM=pzrVolume>0?CPP_PZR_GEOMETRY.bottom
      +(CPP_PZR_GEOMETRY.top-CPP_PZR_GEOMETRY.bottom)*pzrVolume/CPP_PZR_VOLUME:0;
    const levelM=Math.max(loopLevelM,pzrLevelM),components={};
    for(const g of CPP_GEOMETRY){
      const fill=g.id==="pzr"?pzrVolume/CPP_PZR_VOLUME:geometryFill(g,loopLevelM);
      components[g.id]={massKg:g.volume*CPP_VOLUME_SCALE*fill*C.primaryDensityKgM3,
        fillPct:100*fill,bottomM:g.bottom,topM:g.top};
    }
    const overfillKg=Math.max(0,liquidMassKg-Object.values(components).reduce((sum,g)=>sum+g.massKg,0));
    return {levelM,liquidMassKg:Math.max(0,liquidMassKg),components,
      overfillKg,loopLevelM,pzrLevelM,
      coreTopM:CPP_CORE_TOP_M,coreBottomM:CPP_CORE_BOTTOM_M,
      coveragePct:100*clamp((levelM-CPP_CORE_BOTTOM_M)/C.activeFuelHeightM,0,1),
      loopPriming:[1,2,3,4].map(i=>clamp((loopLevelM-components[`gv${i}`].topM+0.3)/0.3,0,1))};
  }
  // Chaleur latente : interpolation de valeurs vapeur saturée (kJ/kg).
  // Cp effectif reste celui du modèle nominal ; ce n'est pas une EOS diphasique.
  function latentHeatJkg(p) {
    return 1000*interpolation([[1,2257],[5,2108],[10,2015],[20,1889],
      [40,1714],[70,1505],[100,1318],[155,966],[180,777]],clamp(p,1,180));
  }
  function gvThermalCapacityJk(waterKg) {
    return C.gvMetalHeatCapacityJk+Math.max(0,waterKg)*C.secondaryCpJkgK;
  }
  function gvLatentHeatJkg(pressureBar) {
    return C.gvLatentHeatNominalJkg*latentHeatJkg(pressureBar)/latentHeatJkg(C.steamPressureBar);
  }
  function accumulatorFlowKgS(pressureBar,waterKg) {
    const gas0=C.accumulatorVolumeM3-C.accumulatorKgPerLoop/C.risWaterDensityKgM3;
    const gas=Math.max(gas0,C.accumulatorVolumeM3-Math.max(0,waterKg)/C.risWaterDensityKgM3);
    const nitrogenBar=C.accumulatorPressureBar*(gas0/gas)**C.accumulatorPolytropicExponent;
    const flow=waterKg>0?Math.sqrt(2*Math.max(0,nitrogenBar-pressureBar)*1e5
      *C.risWaterDensityKgM3/C.accumulatorResistanceM4):0;
    return {nitrogenBar,flowKgS:flow};
  }
  function ptLimits(tempC) {
    const t=clamp(tempC,0,373.9);
    // Reprise du tracé fourni : limite chaude TSAT−30, limite froide TSAT−110
    // puis PSAT+110 ; domaine bas API/AN-RRA.
    const npshMargin=8*clamp((220-t)/40,0,1);
    const lower=t<=70?5:t<=160?25:t<=180?27:t>297.2?155
      :saturationPressureBar(Math.min(373.9,t+30))+npshMargin;
    const upper=t<=160?31:Math.min(155,saturationPressureBar(Math.min(373.9,t+110)),saturationPressureBar(t)+110);
    return {lowerBar:lower,upperBar:upper,inside:t>=10&&t<=306.501&&lower<=upper};
  }
  function reactorOperatingState(s) {
    const antireactivityPcm=Math.max(0,-s.reactivityPcm);
    // La cinétique conserve un plancher numérique : 0,01 % PN représente ici 0 %.
    const neutronPowerNearZero=s.powerPct<=0.01;
    const coreSubcritical=s.reactivityPcm<0;
    const coreConverged=neutronPowerNearZero&&coreSubcritical;
    const cia=[s.tripDemandAt,s.tripAt,s.risDemandAt,s.risAt].some(t=>t!==null&&t!==undefined);
    const code=cia?"CIA":coreConverged?"AN/GV":"RP";
    const label=cia?"Conduite incidentelle ou accidentelle":coreConverged?"Arrêt normal sur GV":"Réacteur en production";
    return {code,label,caption:`${code} · ${label}`,coreConverged,coreSubcritical,neutronPowerNearZero,antireactivityPcm,
      standardApplicable:!cia,
      ptRule:cia?"CIA · domaine standard non applicable":coreConverged?
        "AN/GV · limites du diagramme P–T":"RP · 297,2–307,5 °C · 150–160 bar"};
  }
  function isPtOutside(s) {
    const state=reactorOperatingState(s);
    if(!state.standardApplicable)return false;
    // Tolérance d'affichage RP : température haute à 307,5 °C et 150–160 bar.
    if(state.code==="RP")return s.tavgC<297.199||s.tavgC>307.5||s.pressureBar<150||s.pressureBar>160;
    const limits=ptLimits(s.tavgC);
    return s.tavgC>297.201||!limits.inside||s.pressureBar<limits.lowerBar-0.1||s.pressureBar>limits.upperBar+0.1;
  }
  function rraConditions(s) {
    const reasons=[];
    if(s.tavgC<90||s.tavgC>180)reasons.push("90 ≤ TMOY ≤ 180 °C");
    if(s.pressureBar<25||s.pressureBar>31)reasons.push("25 ≤ P ≤ 31 bar abs.");
    if(!reactorOperatingState(s).neutronPowerNearZero)
      reasons.push("puissance neutronique ≤ 0,01 % PN");
    if(s.inventory.levelM<CPP_CORE_TOP_M)reasons.push("cœur couvert");
    if(s.endState==="melted")reasons.push("cœur endommagé");
    return {allowed:reasons.length===0,reasons};
  }
  function connectRra(model) {
    const s=model.state;
    if(!rraConditions(s).allowed)return false;
    s.rraConnected=true;s.rraFlowKgS=200;s.endState="safe";
    s.endReason="RRA connecté : puissance neutronique quasi nulle, cœur couvert, température et pression dans le domaine de connexion.";
    addEvent(s,"system","Cœur sain et sauf · connexion du RRA");return true;
  }
  function setRisOperation(model,mode) {
    if(!["auto","on","off"].includes(mode))return;
    model.controls.risPumpMode=mode;
    if(mode==="on")requestRis(model.state,"RIS : démarrage manuel");
    addEvent(model.state,"action",`Pompes RIS : ${mode==="off"?"arrêt manuel":mode==="on"?"marche manuelle":"demande IS"}`);
  }

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
    R: 1500, G1: 200, G2: 480, N1: 750, N2: 1200,
    SA: 500, SB: 700, SC: 900, SD: 300
  });
  // Absorption axiale homogénéisée : paramètres de forme d'étude distincts
  // des efficacités intégrales en pcm. À recaler sur des cartes de flux/RPN.
  const AXIAL_ROD_ABSORPTION = Object.freeze({
    R: 0.70, G1: 0.10, G2: 0.25, N1: 0.35, N2: 0.020
  });
  const OVERLAP_OFFSETS = Object.freeze([0, 185, 360, 515]);

  function axialInsertionFraction(position, zone) {
    // Mailles numérotées du bas vers le haut ; insertion par le haut.
    const insertedZones=C.axialZones*(C.rodStroke-clamp(position,0,C.rodStroke))/C.rodStroke;
    return clamp(insertedZones-(C.axialZones-1-zone),0,1);
  }

  function axialCoolantTemperatures(coldC, thermalMW, flowFraction, shape) {
    const zoneTemperatures=[];
    const coreFlow=flowFraction*C.nominalPrimaryFlowKgS*(1-C.coreBypassFraction);
    // Le bilan diphasique a déjà séparé le sensible et le latent dans step.
    // Cette lecture axiale n'extrapole pas un Q/(débit Cp) au débit nul.
    const rise=coreFlow>1 ? Math.max(0,thermalMW)*C.corePowerFraction*1e6
      /(coreFlow*C.primaryCpJkgK) : 0;
    let inlet=coldC;
    for(const value of shape) {
      const zoneRise=rise*value/C.axialZones;
      zoneTemperatures.push(inlet+zoneRise/2);
      inlet+=zoneRise;
    }
    return zoneTemperatures;
  }

  function solveAxialShape(rods, xenon, temperatureOffset, initial,
    coefficients=AXIAL_ROD_ABSORPTION,xenonAbsorption=C.axialXenonAbsorption) {
    // Plus petite valeur propre du bilan diffusion/absorption 1D.
    // L'itération inverse et la résolution tridiagonale restent O(N).
    const n=C.axialZones,c=C.axialCoupling*(n/6)**2;
    let shape=initial?.length===n ? [...initial] :
      Array.from({length:n},(_,i)=>Math.sin(Math.PI*(i+0.5)/n));
    const absorption=Array.from({length:n},(_,i)=>{
      let value=xenonAbsorption*((xenon?.[i]??1)-1);
      value+=C.axialModeratorAbsorptionPerC*(temperatureOffset?.[i]??0);
      for(const [name,strength] of Object.entries(coefficients))
        value+=strength*axialInsertionFraction(rods[name],i);
      return value;
    });
    // Décalage uniforme : mêmes vecteurs propres, opérateur positif.
    // L'itération inverse conserve ainsi le mode fondamental positif,
    // même avec un poids élevé et une faible concentration de xénon.
    const shift=0.2-Math.min(...absorption);
    const diag=absorption.map((value,i)=>{
      // Flux nul aux limites ; nœud fantôme opposé au nœud de bord.
      return (i===0||i===n-1 ? 3 : 2)*c+shift+value;
    });
    for(let iteration=0;iteration<60;iteration++) {
      const pivot=Array(n),rhs=Array(n);
      pivot[0]=diag[0];rhs[0]=shape[0];
      for(let i=1;i<n;i++) {
        const factor=-c/pivot[i-1];
        pivot[i]=diag[i]+c*factor;
        rhs[i]=shape[i]-factor*rhs[i-1];
      }
      const next=Array(n);
      next[n-1]=rhs[n-1]/pivot[n-1];
      for(let i=n-2;i>=0;i--)next[i]=(rhs[i]+c*next[i+1])/pivot[i];
      const mean=next.reduce((sum,value)=>sum+value,0)/n;
      let change=0;
      for(let i=0;i<n;i++) {
        next[i]/=mean;
        change=Math.max(change,Math.abs(next[i]-shape[i]));
      }
      shape=next;
      if(change<1e-9)break;
    }
    return shape;
  }

  function detectorMeans(shape) {
    // Intégration exacte des recouvrements entre 32 mailles et six sections.
    const n=shape.length,m=C.axialDetectors;
    return Array.from({length:m},(_,j)=>{
      let integral=0;
      for(let i=0;i<n;i++) {
        const overlap=Math.max(0,Math.min((i+1)/n,(j+1)/m)
          -Math.max(i/n,j/m));
        integral+=overlap*shape[i];
      }
      return m*integral;
    });
  }

  function smoothAxialProfile(shape, z) {
    // Interpolation cubique préservant les extrema ; elle ne crée pas de
    // puissance supplémentaire entre les valeurs de calcul.
    const xs=[0,...shape.map((_,i)=>(i+0.5)/shape.length),1];
    const ys=[0,...shape,0];
    const slopes=xs.slice(1).map((x,i)=>(ys[i+1]-ys[i])/(x-xs[i]));
    const derivatives=ys.map((_,i)=>{
      if(i===0)return slopes[0];
      if(i===ys.length-1)return slopes.at(-1);
      const left=slopes[i-1],right=slopes[i];
      if(left*right<=0)return 0;
      const h0=xs[i]-xs[i-1],h1=xs[i+1]-xs[i];
      const w0=2*h1+h0,w1=h1+2*h0;
      return (w0+w1)/(w0/left+w1/right);
    });
    let interval=0;
    while(interval<xs.length-2 && z>xs[interval+1])interval++;
    const h=xs[interval+1]-xs[interval];
    const t=clamp((z-xs[interval])/h,0,1);
    return Math.max(0,(2*t**3-3*t*t+1)*ys[interval]
      +(t**3-2*t*t+t)*h*derivatives[interval]
      +(-2*t**3+3*t*t)*ys[interval+1]
      +(t**3-t*t)*h*derivatives[interval+1]);
  }

  const IODINE_DECAY_S=Math.LN2/(C.iodineHalfLifeH*3600);
  const XENON_DECAY_S=Math.LN2/(C.xenonHalfLifeH*3600);
  const XENON_CAPTURE_S=C.xenonNominalCapturePerH/3600;
  const INITIAL_RODS={R:233,G1:260,G2:260,N1:260,N2:260};
  const INITIAL_AXIAL_EQUILIBRIUM=(()=>{
    // Production d'iode proportionnelle au flux local ; destruction du Xe
    // par décroissance et capture. La concentration moyenne nominale vaut 1.
    let shape=solveAxialShape(INITIAL_RODS,Array(C.axialZones).fill(1),
      Array(C.axialZones).fill(0));
    let xenon=Array(C.axialZones).fill(1),productionScale=1;
    for(let iteration=0;iteration<40;iteration++) {
      const raw=shape.map(flux=>(XENON_DECAY_S+XENON_CAPTURE_S)*flux
        /(XENON_DECAY_S+XENON_CAPTURE_S*flux));
      productionScale=C.axialZones/raw.reduce((a,b)=>a+b,0);
      xenon=raw.map(value=>productionScale*value);
      const next=solveAxialShape(INITIAL_RODS,xenon,
        Array(C.axialZones).fill(0),shape);
      const change=Math.max(...next.map((value,i)=>Math.abs(value-shape[i])));
      shape=next;
      if(change<1e-10)break;
    }
    return {shape,xenon,iodine:[...shape],productionScale};
  })();
  const INITIAL_AXIAL_SHAPE=INITIAL_AXIAL_EQUILIBRIUM.shape;
  const INITIAL_XENON32=INITIAL_AXIAL_EQUILIBRIUM.xenon;
  const INITIAL_IODINE32=INITIAL_AXIAL_EQUILIBRIUM.iodine;
  const XENON_PRODUCTION_SCALE=INITIAL_AXIAL_EQUILIBRIUM.productionScale;
  const INITIAL_AXIAL_COOLANT=axialCoolantTemperatures(288.4,C.nominalThermalMW,1,
    INITIAL_AXIAL_SHAPE);

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
  function dpaxRightLimit(powerPct) {
    const p=clamp(Number(powerPct)||0,0,100);
    return p<=15 ? p : 15-(p-15)*9/85;
  }
  function isDpaxRightExceeded(s) {
    return s.dpaxPctPn>dpaxRightLimit(s.powerPct)+1e-6;
  }
  function rcvLetdownM3h(model) {
    return C.rcvOrificeM3h*model.controls.rcvLetdownOrifices.filter(Boolean).length;
  }
  function rcvChargeBoronPpm(model) {
    const u=model.controls;
    const mode=rcvInjectionMode(model);
    return mode==="dilution" ? 0 : mode==="borication"
      ? C.reaBoronPpm : clamp(Number(u.rcvTankBoronPpm)||0,0,C.reaBoronPpm);
  }
  function rcvInjectionMode(model) {
    return model.controls.rcvInjectionGraphMode??model.controls.rcvInjectionMode;
  }
  function setRcvGraphInjection(model,borication,dilution) {
    const u=model.controls,s=model.state;
    const controlled=Number.isFinite(borication)||Number.isFinite(dilution);
    const b=Number.isFinite(borication)&&borication>=.5,d=Number.isFinite(dilution)&&dilution>=.5;
    // Deux ordres simultanés sont contradictoires : ni dilution ni borication.
    const mode=controlled?(b===d?"off":b?"borication":"dilution"):null;
    if(mode!==u.rcvInjectionGraphMode||Boolean(u.rcvInjectionGraphConflict)!==Boolean(b&&d)){
      if(controlled)u.rcvInjectionMode="off";
      u.rcvInjectionGraphMode=mode;
      u.rcvInjectionGraphConflict=Boolean(b&&d);
      addEvent(s,b&&d?"alarm":"action",b&&d?"CC RCV : ordres de dilution et borication simultanés · apport suspendu"
        :mode===null?"RCV : retour à la commande manuelle"
        :`CC RCV : ${mode==="off"?"arrêt dilution/borication":mode}`);
    }
    s.rcvTankBoronPpm=rcvChargeBoronPpm(model);
  }
  function rodIntegral(position) {
    return (1 - Math.cos(Math.PI * clamp(position, 0, 260) / 260)) / 2;
  }
  function rodsReactivityPcm(rods, ejectedWorthPcm, worth = ROD_WORTH_PCM) {
    const baseline = { R: 233, G1: 260, G2: 260, N1: 260, N2: 260,
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
  function asgFlowKgS(pressureBar) {
    // Table symétrique fournie, débit par GV : 2 TPS + 2 MPS au total.
    // Hors 30–80 bar : maintien aux valeurs extrêmes, sans extrapolation.
    return interpolation([[30,157],[40,152],[60,140],[80,127]],clamp(pressureBar,30,80))
      *C.risWaterDensityKgM3/3600;
  }
  function nominalGv() {
    return Array.from({length:4}, (_, i) => ({
      index: i + 1, waterKg: C.gvNominalWaterKg,
      ...gvLevels(C.gvNominalWaterKg), feedKgS: C.nominalSteamKgSPerGV,
      feedValvePct: 100 * C.nominalSteamKgSPerGV / 950,
      asgKgS: 0, asgCoolingMW: 0, asgRunning: false,
      asgType: i%2===0?"MPS":"TPS",
      steamValvePct: 100, gctAValvePct: 0,
      turbineSteamKgS: C.nominalSteamKgSPerGV,
      steamKgS: C.nominalSteamKgSPerGV, dumpKgS: 0,
      heatMW: C.nominalThermalMW / 4,
      thermalCapacityJk: C.gvHeatCapacityJk,
      thermalEnergyJ: C.gvHeatCapacityJk*C.steamTempC,
      steamLatentJkg: C.gvLatentHeatNominalJkg,
      areCoolingMW: C.nominalSteamKgSPerGV*C.secondaryCpJkgK*(C.steamTempC-C.areFeedTempC)/1e6,
      tempC: C.steamTempC, pressureBar: C.steamPressureBar
    }));
  }
  function initialState() {
    const precursor = C.betaGroups.map((beta, i) => beta / (C.promptGenerationS * C.lambdaGroups[i]));
    const rods = Object.fromEntries(ROD_NAMES.map(name => [name, name === "R" ? 233 : 260]));
    const nominalFlow = C.nominalPrimaryFlowKgS / 4;
    return {
      time: 0, powerPct: 100, thermalPowerMW: C.nominalThermalMW,
      fissionMW: C.nominalThermalMW, decayMW: 0, coreTransferMW: C.nominalThermalMW,
      electricMW: C.nominalElectricMW,
      turbinePct: 100, demandPct: 100, trefC: C.primaryMeanC, nrefPct: 41.8,
      precursors: precursor, reactivityPcm: 0,
      reactivityParts: {rod:0,boron:0,temp:0,doppler:0,
        coreReference:C.xenonEquilibriumWorthPcm,xenon:-C.xenonEquilibriumWorthPcm},
      xenonWorthPcm: -C.xenonEquilibriumWorthPcm,
      fuelC: C.fuelC, tavgC: C.primaryMeanC,
      hotC: 324.6, coldC: 288.4, tRicC: 326.9,
      pressureBar: C.primaryPressureBar, pzrLevelPct: 42,
      primaryMassKg: C.nominalPrimaryMassKg, coveragePct: 100,
      inventory:cppInventory(C.nominalPrimaryMassKg),
      vaporMassKg:0, vaporEnergyJ:0, vaporizationKgS:0, sensibleCoreMW:C.nominalThermalMW,
      primaryEnergyJ:C.nominalPrimaryMassKg*C.primaryCpJkgK*C.primaryMeanC,
      lidC:324.6, saturationC:saturationTemperatureC(C.primaryPressureBar),
      breakLiquidKgS:0,breakSteamKgS:0,risCoreKgS:0,coreFlowKgS:C.nominalPrimaryFlowKgS,
      sumpKg:0,sumpBoron:0,sumpEnergyJ:0,sumpTempC:20,sumpBoronPpm:2500,
      accumulatorFlowsKgS:Array(4).fill(0),accumulatorNitrogenBar:Array(4).fill(C.accumulatorPressureBar),
      rraConnected:false,rraFlowKgS:0,endState:null,endReason:"",ptOutside:false,
      coreDamageWarning:null,normalShutdownAt:null,
      boronPpm: C.boronInitialPpm,
      boronInventory: C.boronInitialPpm * C.nominalPrimaryMassKg,
      rcvTankBoronPpm: C.boronInitialPpm,
      rcvChargeKgS: C.rcvNominalM3h*C.primaryDensityKgM3/3600,
      rcvSealKgS: C.rcvSealM3h*C.primaryDensityKgM3/3600,
      rcvLetdownKgS: C.rcvLetdownM3h*C.primaryDensityKgM3/3600,
      rcvDeliveredKgS: C.rcvNominalM3h*C.primaryDensityKgM3/3600,
      rcvInjectionLitres: {dilution:0,borication:0},
      reliefKgS: 0, reliefStages: [false,false,false],
      risMpKgS: 0, risBpKgS: 0, accumulatorKgS: 0,
      risDeliveredKgS: 0, risCoolingMW: 0, risTankRemainingKg: 600000,
      accumulatorsKg: Array(4).fill(C.accumulatorKgPerLoop),
      breakKgS: 0, breakAreaCm2: 0, breakLoop: 1, breakBranch: "froide",
      rods, g3Count: 780, g3Target: 780, rLimitPas: 186,
      loops: Array.from({length:4}, (_,i) => ({ index:i+1, flowKgS:nominalFlow,
        forcedFlowKgS:nominalFlow, naturalFlowKgS:0,
        hotC:324.6, coldC:288.4, pumpStopped:false,
        pumpHeadHotBar:7, pumpHeadColdBar:7+3*(324.6-288.4)/(324.6-20),
        vesselDeltaBar:3.5, gvDeltaBar:3.5 })),
      gv: nominalGv(), totalGvMW: C.nominalThermalMW,
      totalSteamKgS: 4 * C.nominalSteamKgSPerGV,
      totalTurbineSteamKgS: 4 * C.nominalSteamKgSPerGV,
      totalFeedKgS: 4 * C.nominalSteamKgSPerGV,
      asgDemandAt:null, asgAt: null, totalAsgKgS: 0,
      xenonTop: INITIAL_XENON32.slice(C.axialZones/2).reduce((a,b)=>a+b,0)/(C.axialZones/2),
      xenonBottom: INITIAL_XENON32.slice(0,C.axialZones/2).reduce((a,b)=>a+b,0)/(C.axialZones/2),
      iodineTop: INITIAL_IODINE32.slice(C.axialZones/2).reduce((a,b)=>a+b,0)/(C.axialZones/2),
      iodineBottom: INITIAL_IODINE32.slice(0,C.axialZones/2).reduce((a,b)=>a+b,0)/(C.axialZones/2),
      xenon32: [...INITIAL_XENON32], iodine32: [...INITIAL_IODINE32],
      axialShape32: [...INITIAL_AXIAL_SHAPE],
      axialZonePowerPctPn32: Array(C.axialZones).fill(100/C.axialZones),
      axialCoolant32: [...INITIAL_AXIAL_COOLANT], dpaxPctPn: 0,
      axialTilt: 0, axialFlux32: [...INITIAL_AXIAL_SHAPE],
      axialShape6: detectorMeans(INITIAL_AXIAL_SHAPE),
      axialZonePowerPctPn6: Array(C.axialDetectors).fill(100/C.axialDetectors),
      fluxDetectors6: detectorMeans(INITIAL_AXIAL_SHAPE), peakLinearWcm: 350,
      signals: {}, tripDemandAt: null, tripAt: null,
      risDemandAt: null, risAt: null, voltageLostAt: null,
      ejectWorthPcm: 0, withdrawalActive: false,
      rcvPipe: Array.from({length:80},(_,i)=>({at:i*0.1,
        massKg:C.rcvNominalM3h*C.primaryDensityKgM3/3600*0.1,
        boronPpm:C.boronInitialPpm,tempC:C.primaryMeanC})),
      risPipe: [], events: [], history: [], sampleAt: 0,
      previousPowerPct: 100, rawFluxRatePctS: 0, fluxRatePctS: 0,
      coreFlowFraction: 1, primaryPumpsStopped: false,
      primaryPumpStopAt:null,primaryPumpStopReason:"",
      subcoolingC: 344.79-324.6, dnbr: 1.65,
      heaterKW: C.nominalHeaterKW, sprayPct: C.nominalSprayPct,
      sprayValveM3h: 0, sprayContinuousM3h: 2*C.sprayContinuousM3hPerValve,
      sprayFlowM3h: 2*C.sprayContinuousM3hPerValve,
      sprayFlowPct: 100*2*C.sprayContinuousM3hPerValve
        /(2*C.sprayFullM3hPerValve),
      sprayFlowKgS: 2*C.sprayContinuousM3hPerValve*C.primaryDensityKgM3/3600,
      sprayDriveBar: C.sprayDriveNominalBar,
      auxiliarySprayM3h:0,auxiliarySpraySourceC:C.primaryMeanC,auxiliarySprayCoolingKW:0,
      totalSprayFlowM3h:2*C.sprayContinuousM3hPerValve,
      protectionsEnabled: true, risEnabled: true,
      lossOfVoltage: false, turbineTrip: false
    };
  }
  function make() {
    const model={
      state: initialState(),
      controls: {
        demandPct: 100, turbineLimitGraphPct: null, campaign: "debut", halfCycle: "premiere",
        rMode: "manual", rManualPas: 233, rGraphPas: 233, rManualOverride: false,
        g3GraphTarget: null, gcpCalibrationPct: 0, gvGraphFeedPct: [null,null,null,null],
        gvManualFeedPct: Array(4).fill(100*C.nominalSteamKgSPerGV/950), gvLevelSetpointPct: 55,
        gvSteamValvePct: Array(4).fill(100),
        asgAvailable: true, asgManual:false,asgTrainEnabled:[false,false,false,false],
        gctAOpeningPressureBar: C.gctAPressureBar,
        manualHeaterKW: C.nominalHeaterKW, manualSprayPct: C.nominalSprayPct,
        manualAuxiliarySprayM3h:0,allRodsTargetPas:null,
        manualReliefStages: [false,false,false],
        pressureGraphHeaterKW: null, pressureGraphSprayPct: null,
        nrefGraphPct: null,
      rcvChargeM3h: C.rcvNominalM3h, rcvChargeGraphM3h: null,
        rcvTankBoronPpm: C.boronInitialPpm,
        rcvLetdownOrifices: [true,true,false],
        rcvInjectionMode: "off",
        rcvInjectionGraphMode: null,
        risBoronPpm: 2500,risPumpMode:"auto",risSourceMode:"direct",
        rodWorthPcm: {...ROD_WORTH_PCM},
        axialRodAbsorption: {...AXIAL_ROD_ABSORPTION},
        coolantWorthPcmC: C.coolantWorthPcmC, dopplerWorthPcmC: C.dopplerWorthPcmC,
        xenonEquilibriumWorthPcm: C.xenonEquilibriumWorthPcm,
        naturalCirculationKgSPerLoop: C.naturalCirculationKgSPerLoop,
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
        fxYUngraped: 1.4, fxYGraped: 1,
        transient: "off", transientPhase: "off", transientStartS: 0,
        transientElapsedS: 0, transientPaused: false,
        transientTargetDemandPct: 100,
        timeScaleXenon: 1
      }
    };
    updateAxial(model.state,model.controls,0);
    return model;
  }

  const TRANSIENTS = Object.freeze({
    off: {label:"Aucun", duration:0},
    temperature: {label:"100 → 50 → 100 %", duration:2400},
    down: {label:"100 → 15 %", duration:2520},
    step: {label:"70 → 100 %", duration:600},
    lowstep: {label:"25 → 5 %", duration:900},
    frequency: {label:"Suivi de charge répété", duration:1200, loop:true},
    pilotage: {label:"100 → 10 % · 5 % PN/min", duration:1800}
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
    if (name === "pilotage") return Math.max(10,100-5*Math.max(0,elapsed)/60);
    if (name === "step") return elapsed < 300 ? 70 : elapsed < 315 ? 70 + 2*(elapsed-300) : 100;
    if (name === "lowstep") return elapsed < 300 ? 25 : 5;
    if (name === "frequency") {
      const t = elapsed % 1200;
      return interpolation([[0,100],[90,100],[240,70],[330,70],[480,35],
        [570,35],[720,80],[810,80],[960,100],[1200,100]], t);
    }
    return null;
  }
  function turbineLoadTargetPct(model) {
    const limit=Number.isFinite(model.controls.turbineLimitGraphPct)
      ? clamp(model.controls.turbineLimitGraphPct,0,100) : 100;
    return clamp(model.state.demandPct,0,limit);
  }
  function startTransient(model, name) {
    if (!TRANSIENTS[name]) return;
    const u=model.controls,s=model.state;
    u.transient=name;
    u.transientTargetDemandPct=name==="off"?100:transientDemand(name,0);
    u.transientPhase=Math.abs(s.demandPct-u.transientTargetDemandPct)>1e-9
      ? (name==="off"?"return":"approach") : (name==="off"?"off":"run");
    u.transientStartS=s.time;
    u.transientElapsedS=0;
    u.transientPaused=false;
    u.demandPct=s.demandPct;
    addEvent(s,"action",name==="off"?"Retour progressif à 100 %"
      : `Transitoire de charge : ${TRANSIENTS[name].label}`);
  }
  function isTransientActive(model) {
    return ["approach","run","return"].includes(model.controls.transientPhase);
  }
  function pauseTransient(model) {
    if(!isTransientActive(model)||model.controls.transientPaused)return;
    model.controls.transientPaused=true;
    addEvent(model.state,"action","Programme de charge en pause : PTUR maintenue");
  }
  function resumeTransient(model) {
    if(!isTransientActive(model)||!model.controls.transientPaused)return;
    model.controls.transientPaused=false;
    addEvent(model.state,"action","Reprise du programme de charge");
  }
  function interruptTransient(model) {
    if(!isTransientActive(model))return;
    const u=model.controls,s=model.state;
    u.demandPct=s.demandPct;
    u.transientPaused=false;
    u.transientPhase="interrupted";
    addEvent(s,"action",`Programme interrompu : PTUR manuelle à ${s.demandPct.toFixed(1)} %`);
  }
  function updateTurbineDemand(model,dt) {
    const s=model.state,u=model.controls;
    if(!isTransientActive(model)) {
      s.demandPct=clamp(Number(u.demandPct),0,110);
      return;
    }
    if(u.transientPaused)return;
    if(u.transientPhase==="approach"||u.transientPhase==="return") {
      const error=u.transientTargetDemandPct-s.demandPct;
      s.demandPct=clamp(s.demandPct+clamp(error,-20*dt/60,20*dt/60),0,110);
      if(Math.abs(s.demandPct-u.transientTargetDemandPct)<1e-9){
        if(u.transientPhase==="return"){
          u.transientPhase="off";u.transient="off";
        }else{
          u.transientPhase="run";u.transientStartS=s.time;
          u.transientElapsedS=0;
        }
      }
    }else{
      const program=TRANSIENTS[u.transient];
      u.transientElapsedS+=dt;
      if(!program.loop&&u.transientElapsedS>=program.duration-1e-7){
        u.transientElapsedS=program.duration;
        s.demandPct=clamp(transientDemand(u.transient,program.duration),0,110);
        u.transientPhase="finished";
        addEvent(s,"action",`Programme terminé : PTUR manuelle à ${s.demandPct.toFixed(1)} %`);
      }else{
        s.demandPct=clamp(transientDemand(u.transient,u.transientElapsedS),0,110);
      }
    }
    // Préparer le retour en manuel à la valeur courante, sans saut de consigne.
    u.demandPct=s.demandPct;
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
    } else if(name === "asg") {
      if(s.asgDemandAt===null){
        s.asgDemandAt=s.time;
        addEvent(s,"system",details.source==="cc-protect"
          ? "Ordre de démarrage ASG du CC-PROTECT" : "Ordre manuel de démarrage ASG");
      }
    }
  }
  function prepareRcvTank(model, volumeM3, boronPpm) {
    const s=model.state,u=model.controls;
    u.rcvTankBoronPpm=clamp(Number(boronPpm)||0,0,C.reaBoronPpm);
    s.rcvTankBoronPpm=rcvChargeBoronPpm(model);
    addEvent(s,"action",`CB de charge RCV réglée à ${s.rcvTankBoronPpm.toFixed(0)} ppm`);
  }
  function setRManualOverride(model, enabled) {
    const s=model.state,u=model.controls;
    u.rManualOverride=Boolean(enabled);
    u.rManualPas=s.rods.R;u.rGraphPas=s.rods.R;
    if(enabled)u.rMode="manual";
  }
  function setRcvInjection(model, mode) {
    const s=model.state,u=model.controls;
    u.rcvInjectionMode=["dilution","borication"].includes(mode)?mode:"off";
    s.rcvTankBoronPpm=rcvChargeBoronPpm(model);
    addEvent(s,"action",u.rcvInjectionMode==="off"?"Arrêt dilution/borication RCV · retour à la CB manuelle"
      :`Charge RCV : ${u.rcvInjectionMode} à ${s.rcvTankBoronPpm} ppm`);
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
    s.primaryPumpStopAt=s.time;s.primaryPumpStopReason=text;
    addEvent(s,"protection",text);
  }
  function requestRis(s, text) {
    if (s.risDemandAt !== null) return;
    s.risDemandAt = s.time;
    addEvent(s, "protection", text);
    requestTrip(s,"AAR : demande d'injection de sécurité");
    stopPrimaryPumps(s,"Arrêt des GMPP sur IS");
  }

  function commandAllRods(model,targetPas) {
    const s=model.state,u=model.controls;
    if(s.tripDemandAt!==null||s.endState)return false;
    u.allRodsTargetPas=targetPas===null?null:targetPas===0?0:260;
    u.rManualPas=s.rods.R;u.rGraphPas=s.rods.R;u.g3GraphTarget=null;
    s.withdrawalActive=false;
    addEvent(s,"action",targetPas===null?"Retour des grappes à la conduite normale"
      :targetPas===0?"Descente commandée de tous les groupes à 0 pas · hors AAR"
      :"Montée commandée de tous les groupes à 260 pas · hors AAR");
    return true;
  }

  function updateRods(s, u, dt) {
    const tripped = s.tripAt !== null;
    if (tripped) {
      for (const name of ROD_NAMES) s.rods[name] = Math.max(0,
        s.rods[name] - C.rodStroke * dt / C.dropTimeS);
      return;
    }
    if(u.allRodsTargetPas!==null){
      for(const name of ["R","SA","SB","SC","SD"])
        s.rods[name]+=clamp(u.allRodsTargetPas-s.rods[name],-C.rodSpeedPasS*dt,C.rodSpeedPasS*dt);
      // Les GCP conservent leur séquence et leurs recouvrements ; les groupes
      // d'arrêt sont manœuvrés à la vitesse normale, sans chute ni ordre AAR.
      s.g3Target=u.allRodsTargetPas===0?0:780;
      s.g3Count+=clamp(s.g3Target-s.g3Count,-C.rodSpeedPasS*dt,C.rodSpeedPasS*dt);
      [s.rods.G1,s.rods.G2,s.rods.N1,s.rods.N2]=gcpPositions(s.g3Count);
      return;
    }
    if (s.withdrawalActive) {
      s.rods.R = Math.min(260, s.rods.R + 3 * dt);
    } else if (u.rMode === "graph" && !u.rManualOverride) {
      s.rods.R += clamp(clamp(Number(u.rGraphPas),0,260)-s.rods.R,
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

  function evolveAxialPoisons(s, dt, scale=1) {
    // Évolution locale I-135/Xe-135 à puissance et forme axiale imposées.
    // La moyenne de Xe, et non sa seule dissymétrie, agit aussi sur la
    // réactivité globale lors du bilan neutronique suivant.
    const scaledDt=dt*clamp(Number(scale) || 1,0.1,100);
    for(let i=0;i<C.axialZones;i++) {
      const local=clamp(s.powerPct/100*s.axialShape32[i],0,3);
      const iodineBefore=s.iodine32[i],xenonBefore=s.xenon32[i];
      s.iodine32[i]=Math.max(0,iodineBefore+IODINE_DECAY_S
        *(local-iodineBefore)*scaledDt);
      s.xenon32[i]=clamp(xenonBefore+(
        XENON_PRODUCTION_SCALE*(XENON_DECAY_S+XENON_CAPTURE_S)*iodineBefore
        -(XENON_DECAY_S+XENON_CAPTURE_S*local)*xenonBefore
      )*scaledDt,0,4);
    }
    const half=C.axialZones/2;
    s.iodineBottom=s.iodine32.slice(0,half).reduce((a,b)=>a+b,0)/half;
    s.iodineTop=s.iodine32.slice(half).reduce((a,b)=>a+b,0)/half;
    s.xenonBottom=s.xenon32.slice(0,half).reduce((a,b)=>a+b,0)/half;
    s.xenonTop=s.xenon32.slice(half).reduce((a,b)=>a+b,0)/half;
  }

  // Tableau 11 FXY(z) SPIN en DDC fourni par l'utilisateur, cotes 1 à 31.
  // Colonnes G1, R, R+G1, G1+G2, R+G1+G2, N1, autres.
  // Pour nos 32 cellules, la cote 0 reprend la cote 1 (prolongement au pied).
  const SPIN_FXY32 = Object.freeze(Array.from({length:32},(_,z)=>Object.freeze(
    z<=18 ? [1.597,1.632,1.688,1.667,1.675,2.021,2.500]
      : z===19 ? [1.583,1.596,1.650,1.706,1.704,1.965,2.500]
      : z===20 ? [1.570,1.559,1.612,1.746,1.732,1.908,2.500]
      : [1.557,1.523,1.574,1.785,1.760,1.852,z===31?2.200:2.500]
  )));
  const FXY_BANKS = ["R","G1","G2","N1","N2"];
  function spinFxy32(rods, ungapped=1.4, tableScale=1, thermalRelative=1) {
    // La position sélectionne la configuration locale. La cellule traversée
    // par la pointe d'une grappe interpole les configurations voisines.
    const powerCorrection=1+0.3*(1-clamp(thermalRelative,0,1));
    return SPIN_FXY32.map((row,z)=>{
      let cases=[{mask:0,weight:1}];
      FXY_BANKS.forEach((name,bit)=>{
        const coverage=axialInsertionFraction(rods[name],z);
        cases=cases.flatMap(item=>{
          const next=[];
          if(coverage<1)next.push({mask:item.mask,weight:item.weight*(1-coverage)});
          if(coverage>0)next.push({mask:item.mask|(1<<bit),weight:item.weight*coverage});
          return next;
        });
      });
      const selected=cases.reduce((sum,{mask,weight})=>{
        const column=mask&16 ? 6 : mask&8 ? 5
          : ({1:1,2:0,3:2,6:3,7:4})[mask];
        const value=mask===0 ? ungapped : row[column===undefined?6:column]*tableScale;
        return sum+weight*value;
      },0);
      const shutdownCoverage=Math.max(...["SA","SB","SC","SD"]
        .map(name=>axialInsertionFraction(rods[name],z)));
      return lerp(selected,row[6]*tableScale,shutdownCoverage)*powerCorrection;
    });
  }
  function coreProtectionProfile(s,u) {
    const relative=s.thermalPowerMW/C.nominalThermalMW;
    const fxy32=spinFxy32(s.rods,u.fxYUngraped,u.fxYGraped,relative);
    const q32=s.axialShape32.map((shape,i)=>shape*fxy32[i]);
    const fDeltaH=q32.reduce((sum,value)=>sum+value,0)/C.axialZones;
    const linearWcm32=q32.map(value=>C.nominalAverageLinearWcm*relative*value);
    // Intégrale d'enthalpie du canal chaud, FHFR=FGFR=1 faute de tables
    // de mélange/redistribution. Enthalpies approchées à Cp primaire constant.
    const inletEnthalpyKJkg=C.primaryCpJkgK*s.coldC/1000;
    const deltaEnthalpyKJkg=C.primaryCpJkgK*(s.hotC-s.coldC)/1000;
    let integral=0;
    const hotChannelTemp32=s.axialShape32.map(shape=>{
      const midpoint=integral+shape/(2*C.axialZones);
      integral+=shape/C.axialZones;
      return s.coldC+(s.hotC-s.coldC)*fDeltaH*midpoint;
    });
    const satTempC=saturationTemperatureC(s.pressureBar);
    const pressureFactor=Math.sqrt(clamp(s.pressureBar,0,200)/C.primaryPressureBar);
    const flowFactor=Math.sqrt(Math.max(0,s.coreFlowFraction));
    // Proxy de flux critique : pression, débit et sous-refroidissement LOCAL.
    // Ce n'est pas WRB1. La normalisation fixe nominale sera appliquée ensuite.
    const dnbrRaw32=hotChannelTemp32.map((temp,i)=>pressureFactor*flowFactor
      *Math.max(0.1,satTempC-temp+5)/Math.max(30,linearWcm32[i]));
    return {fxy32,linearWcm32,fDeltaH,fq:Math.max(...q32),hotChannelTemp32,
      hotChannelEnthalpy32:hotChannelTemp32.map(temp=>temp*C.primaryCpJkgK/1000),
      coreOutletEnthalpyKJkg:inletEnthalpyKJkg+deltaEnthalpyKJkg/(1-C.coreBypassFraction),
      hotChannelOutletEnthalpyKJkg:inletEnthalpyKJkg+deltaEnthalpyKJkg*fDeltaH,
      subcoolingC:Math.max(0,satTempC-s.hotC),dnbrRaw32};
  }
  const NOMINAL_DNBR_RAW=Math.min(...coreProtectionProfile({
    rods:{R:233,G1:260,G2:260,N1:260,N2:260,SA:260,SB:260,SC:260,SD:260},
    axialShape32:INITIAL_AXIAL_SHAPE,thermalPowerMW:C.nominalThermalMW,
    coldC:288.4,hotC:324.6,pressureBar:C.primaryPressureBar,coreFlowFraction:1
  },{fxYUngraped:1.4,fxYGraped:1}).dnbrRaw32);

  function updateAxial(s, u, dt) {
    // 32 mailles physiques : la puissance globale reste déterminée par la
    // cinétique ponctuelle ; le mode axial répartit cette puissance sans
    // rajouter une seconde efficacité des grappes à la réactivité globale.
    evolveAxialPoisons(s,dt,u.timeScaleXenon);
    const saturationC=saturationTemperatureC(s.pressureBar);
    const coolant=axialCoolantTemperatures(s.coldC,s.sensibleCoreMW??s.coreTransferMW,
      s.coreFlowFraction,s.axialShape32).map(t=>Math.min(t,saturationC));
    const temperatureOffset=coolant.map((temp,i)=>s.coreFlowFraction<0.2
      ? 0 : clamp(temp-INITIAL_AXIAL_COOLANT[i],-30,30));
    s.axialShape32=solveAxialShape(s.rods,s.xenon32,temperatureOffset,
      s.axialShape32,u.axialRodAbsorption,C.axialXenonAbsorption
        *u.xenonEquilibriumWorthPcm/C.xenonEquilibriumWorthPcm);
    s.axialCoolant32=axialCoolantTemperatures(s.coldC,s.sensibleCoreMW??s.coreTransferMW,
      s.coreFlowFraction,s.axialShape32).map(t=>Math.min(t,saturationC));
    s.axialZonePowerPctPn32=s.axialShape32.map(value=>s.powerPct*value/C.axialZones);
    s.axialShape6=detectorMeans(s.axialShape32);
    s.axialZonePowerPctPn6=s.axialShape6.map(value=>s.powerPct*value/C.axialDetectors);
    s.dpaxPctPn=s.axialZonePowerPctPn6.slice(3).reduce((a,b)=>a+b,0)
      -s.axialZonePowerPctPn6.slice(0,3).reduce((a,b)=>a+b,0);
    s.dpaxRightExceeded=isDpaxRightExceeded(s);
    s.axialTilt=s.powerPct>1e-9 ? -s.dpaxPctPn/s.powerPct : 0;
    s.axialFlux32=[...s.axialShape32];
    // Mesures idéales des six sections : une réponse instrumentale RPN calibrée
    // pourra être introduite plus tard sans confondre mesure et état du cœur.
    s.fluxDetectors6=[...s.axialShape6];
    const protection=coreProtectionProfile(s,u);
    Object.assign(s,protection);
    s.peakLinearWcm=Math.max(...s.linearWcm32);
    s.dnbr32=s.dnbrRaw32.map(value=>clamp(1.65*value/NOMINAL_DNBR_RAW,0,10));
    s.dnbr=Math.min(...s.dnbr32);
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
      highLinearPower: s.peakLinearWcm > C.tripLinearWcm,
      rapidFluxRise: s.fluxRatePctS >= u.tripFluxRatePctS,
      rapidFluxFall: s.fluxRatePctS <= -u.tripFluxRatePctS,
      voltageLoss: s.lossOfVoltage,
      risLowPressure: s.pressureBar < u.risLowPressureBar,
      rBelowLimit: s.tripAt===null && s.rods.R < s.rLimitPas - 0.5
    };
    s.protectionsEnabled = Boolean(u.protectionsEnabled);
    s.risEnabled = Boolean(u.risEnabled);
    if (s.protectionsEnabled && !u.protectionGraphMode) {
      const reason = s.signals.voltageLoss ? "Manque de tension"
        : s.signals.lowPressure ? "Basse pression primaire"
        : s.signals.highFluxTrip ? "Haut flux nucléaire"
        : s.signals.highLinearPower ? "PLIN supérieure à 435 W/cm"
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
    const sourceReady = (u.risSourceMode==="recirculation"?s.sumpKg:s.risTankRemainingKg) > 0;
    const voltageReady = !s.lossOfVoltage || s.time-s.voltageLostAt >= C.dieselStartS;
    const enabled = s.risEnabled && u.risPumpMode!=="off"
      && (u.risPumpMode==="on"||s.risAt !== null) && sourceReady && voltageReady;
    const mpOne = p >= 120 ? 0 : p >= 40 ? (120-p) : 80+Math.max(0,40-p);
    const bpOne = p >= 40 ? 0 : 9*(40-p);
    s.risMpKgS = enabled ? mpOne*u.mpTrainEnabled.filter(Boolean).length*u.risMpScale : 0;
    s.risBpKgS = enabled ? bpOne*u.bpTrainEnabled.filter(Boolean).length*u.risBpScale : 0;
    const pumped = Math.min(s.risMpKgS+s.risBpKgS,
      (u.risSourceMode==="recirculation"?s.sumpKg:s.risTankRemainingKg)/0.1);
    if (pumped < s.risMpKgS+s.risBpKgS) {
      const ratio = pumped/(s.risMpKgS+s.risBpKgS);
      s.risMpKgS *= ratio; s.risBpKgS *= ratio;
    }
  }
  function pumpToPipe(pipe, at, massKg, boronPpm, metadata = {}) {
    if (massKg > 0) {
      pipe.push({ at, massKg, boronPpm, ...metadata });
      pipe.sort((a,b) => a.at-b.at);
    }
  }
  function deliverPipe(pipe, time, injectionLitres = null) {
    let massKg=0, boron=0,energyJ=0;
    while (pipe.length && pipe[0].at <= time+1e-9) {
      const parcel = pipe.shift();
      massKg += parcel.massKg;
      boron += parcel.massKg*parcel.boronPpm;
      energyJ += parcel.massKg*C.primaryCpJkgK*(parcel.tempC??C.risInjectionTempC);
      if(injectionLitres && Object.hasOwn(injectionLitres,parcel.mode))
        injectionLitres[parcel.mode]+=parcel.litres;
    }
    return { massKg, boron,energyJ };
  }

  function updateGv(s, u, dt) {
    const nominal = C.nominalSteamKgSPerGV;
    if(u.asgAvailable && s.asgAt===null && s.asgDemandAt!==null
        && s.time-s.asgDemandAt>=C.asgStartDelayS) {
      s.asgAt=s.time;
      s.gv.forEach(g=>{g.asgRunning=true;});
      addEvent(s,"system","ASG démarrée sur ordre · arrêt au-dessus de 90 % GE, reprise sous 10 % GE en automatique");
    }
    const totalTarget = s.turbineTrip ? 0 : turbineLoadTargetPct({state:s,controls:u});
    s.turbinePct += clamp(totalTarget-s.turbinePct,-4*dt,4*dt);
    // Le limiteur turbine répartit le débit demandé entre les quatre GV.
    // Une pression GV élevée augmente le débit disponible, pas la consigne réseau.
    const availableSteam=s.gv.map(gv=>{
      const valveTarget=clamp(u.gvSteamValvePct[gv.index-1],0,100);
      gv.steamValvePct+=clamp(valveTarget-gv.steamValvePct,
        -C.steamValveStrokePctPerS*dt,C.steamValveStrokePctPerS*dt);
      const pressureFactor=Math.sqrt(clamp(gv.pressureBar/C.steamPressureBar,0.05,1.5));
      return nominal*(s.turbinePct/100)*pressureFactor*gv.steamValvePct/100;
    });
    const availableTotal=availableSteam.reduce((sum,flow)=>sum+flow,0);
    const turbineLimit=4*nominal*s.turbinePct/100;
    const limiter=availableTotal>turbineLimit&&availableTotal>0
      ? turbineLimit/availableTotal : 1;
    let sumHeat=0, sumSteam=0, sumTurbineSteam=0, sumFeed=0, sumAsg=0;
    for (const gv of s.gv) {
      const oldWaterKg=gv.waterKg,oldTempC=gv.tempC;
      Object.assign(gv,gvLevels(gv.waterKg));
      const flowFraction = s.loops[gv.index-1].flowKgS/(C.nominalPrimaryFlowKgS/4);
      const levelFactor = clamp(gv.waterKg/C.gvNominalWaterKg, 0, 1.1);
      gv.heatMW = Math.max(0, C.gvConductanceMWCPerUnit
        * Math.max(0,s.tavgC-gv.tempC)*flowFraction*levelFactor);
      gv.turbineSteamKgS=availableSteam[gv.index-1]*limiter;
      const gctASetpoint=clamp(Number(u.gctAOpeningPressureBar),1,100);
      // Conserver la précision de l'écrêtage lors d'un refroidissement à basse pression.
      const gctABand=C.gctABandBar*Math.min(1,gctASetpoint/C.gctAPressureBar);
      const gctATarget = clamp(100*(gv.pressureBar-gctASetpoint)/gctABand, 0, 100);
      gv.gctAValvePct += clamp(gctATarget-gv.gctAValvePct,
        -C.gctAStrokePctPerS*dt, C.gctAStrokePctPerS*dt);
      gv.dumpKgS = C.gctAFullKgSPerGV*gv.gctAValvePct/100
        *Math.sqrt(gv.pressureBar/C.gctAPressureBar);
      const graphFeed=u.gvGraphFeedPct[gv.index-1];
      let feedTarget=Number.isFinite(graphFeed)
        ? clamp(graphFeed,0,100)*9.5
        : clamp(u.gvManualFeedPct[gv.index-1],0,100)*9.5;
      if (s.lossOfVoltage||s.tripAt!==null) feedTarget = 0;
      gv.feedKgS += (feedTarget-gv.feedKgS)*clamp(dt/(s.tripAt!==null?1:8),0,1);
      if(feedTarget===0&&gv.feedKgS<0.01)gv.feedKgS=0;
      gv.feedValvePct = 100*gv.feedKgS/950;
      // Coupure sur haut niveau commune à l'automatique et au manuel.
      // Ne plus admettre d'eau ni entretenir une queue de débit sur un GV plein.
      if(gv.levelPct>90+1e-9){
        gv.asgRunning=false;
        u.asgTrainEnabled[gv.index-1]=false;
        gv.asgKgS=0;
      }else if(!u.asgManual&&s.asgAt!==null&&gv.levelPct<10-1e-9){
        gv.asgRunning=true;
      }
      const asgRunning=u.asgManual?u.asgTrainEnabled[gv.index-1]:gv.asgRunning;
      // MPS secourues par diesel ; TPS autonomes. Aucun effet du bouton CC-RÉGUL.
      const asgPowerReady=gv.asgType==="TPS"||!s.lossOfVoltage
        ||s.time-s.voltageLostAt>=C.dieselStartS;
      const asgTarget=u.asgAvailable && asgRunning && asgPowerReady
        && (u.asgManual||s.asgAt!==null) ? asgFlowKgS(gv.pressureBar) : 0;
      gv.asgKgS+=(asgTarget-gv.asgKgS)*clamp(dt/2,0,1);
      if(asgTarget===0&&gv.asgKgS<0.01)gv.asgKgS=0;
      // La sortie vapeur est limitée par l'eau réellement disponible durant
      // ce pas, y compris les alimentations arrivées ; pas de vapeur fictive à sec.
      const requestedSteam=gv.turbineSteamKgS+gv.dumpKgS;
      const availableWaterKg=oldWaterKg+(gv.feedKgS+gv.asgKgS)*dt;
      const steamScale=requestedSteam>0?Math.min(1,availableWaterKg/(requestedSteam*dt)):1;
      gv.turbineSteamKgS*=steamScale;gv.dumpKgS*=steamScale;
      // Mesure vapeur du GV, également utilisée par l'anticipation ARE.
      gv.steamKgS=gv.turbineSteamKgS+gv.dumpKgS;
      gv.asgCoolingMW=gv.asgKgS*C.secondaryCpJkgK
        *(oldTempC-C.asgFeedTempC)/1e6;
      gv.areCoolingMW=gv.feedKgS*C.secondaryCpJkgK*(oldTempC-C.areFeedTempC)/1e6;
      gv.waterKg = Math.max(0,availableWaterKg-gv.steamKgS*dt);
      Object.assign(gv, gvLevels(gv.waterKg));
      gv.steamLatentJkg=gvLatentHeatJkg(gv.pressureBar);
      gv.thermalCapacityJk=gvThermalCapacityJk(gv.waterKg);
      // U = (M_eau*Cp + C_métal)*T. La vapeur emporte Cp*T + Lv,
      // ARE et ASG apportent Cp*T_alimentation. La même chaleur primaire–GV
      // est retirée au primaire et ajoutée ici, une seule fois.
      const oldEnergyJ=gvThermalCapacityJk(oldWaterKg)*oldTempC;
      const incomingJ=(gv.feedKgS*C.secondaryCpJkgK*C.areFeedTempC
        +gv.asgKgS*C.secondaryCpJkgK*C.asgFeedTempC)*dt;
      const outgoingJ=gv.steamKgS*(C.secondaryCpJkgK*oldTempC+gv.steamLatentJkg)*dt;
      const energyJ=oldEnergyJ+gv.heatMW*1e6*dt+incomingJ-outgoingJ;
      gv.tempC = clamp(energyJ/gv.thermalCapacityJk,20,330);
      gv.thermalEnergyJ=gv.thermalCapacityJk*gv.tempC;
      gv.pressureBar = saturationPressureBar(gv.tempC);
      sumHeat += gv.heatMW;
      sumSteam += gv.steamKgS;
      sumTurbineSteam += gv.turbineSteamKgS;
      sumAsg += gv.asgKgS;
      sumFeed += gv.feedKgS+gv.asgKgS;
    }
    s.totalGvMW=sumHeat; s.totalSteamKgS=sumSteam; s.totalFeedKgS=sumFeed;
    s.totalTurbineSteamKgS=sumTurbineSteam;
    s.totalAsgKgS=sumAsg;
    s.electricMW=Math.min(C.nominalElectricMW,
      C.nominalElectricMW*sumTurbineSteam/(4*nominal));
  }

  function sample(s) {
    if (s.time+1e-9 < s.sampleAt) return;
    s.sampleAt = s.time+1;
    s.history.push({ t:s.time, power:s.powerPct, electric:s.electricMW,
      thermalPower:100*s.thermalPowerMW/C.nominalThermalMW,
      residualPower:100*s.decayMW/C.nominalThermalMW,
      cold:s.coldC,tavg:s.tavgC,hot:s.hotC,tric:s.tRicC,
      pzrTemp:saturationTemperatureC(s.pressureBar),reactivity:s.reactivityPcm,
      pressure:s.pressureBar,gvPressure:s.gv.map(g=>g.pressureBar),
      boron:s.boronPpm,gv:s.gv.map(g=>g.levelPct),
      gvTemp:s.gv.map(g=>g.tempC),pzrLevel:s.pzrLevelPct,
      steamTotal:s.totalSteamKgS,steamGctA:s.gv.reduce((sum,g)=>sum+g.dumpKgS,0),
      steamVpu:s.totalTurbineSteamKgS,
      asg:s.gv.map(g=>g.asgKgS),fDeltaH:s.fDeltaH,dnbr:s.dnbr,
      rods:{R:s.rods.R,G1:s.rods.G1,G2:s.rods.G2,N1:s.rods.N1,N2:s.rods.N2,SA:s.rods.SA},
      r:s.rods.R,g3:s.g3Count,ris:s.risDeliveredKgS,break:s.breakKgS,
      accumulator:s.accumulatorKgS,risMp:s.risMpKgS,risBp:s.risBpKgS,
      cppLevel:s.inventory.levelM,cppMass:s.primaryMassKg,vaporization:s.vaporizationKgS,
      vaporMass:s.vaporMassKg,breakSteam:s.breakSteamKgS,
      breakDensity:clamp(C.primaryDensityKgM3*(s.pressureBar/155)**0.08,150,760),
      pline:s.peakLinearWcm,dpax:s.dpaxPctPn });
    if (s.history.length>8*3600) s.history.shift();
  }

  function refreshReactivity(model) {
    const s=model.state,u=model.controls;
    const rodPcm=rodsReactivityPcm(s.rods,s.ejectWorthPcm,u.rodWorthPcm);
    const boronPcm=C.boronWorthPcmPpm*(s.boronPpm-C.boronInitialPpm);
    const tempPcm=u.coolantWorthPcmC*(s.tavgC-C.primaryMeanC);
    const dopplerPcm=u.dopplerWorthPcmC*(s.fuelC-C.fuelC);
    const xenonPcm=-u.xenonEquilibriumWorthPcm*(s.xenonTop+s.xenonBottom)/2;
    // Le calage du point initial suit le poids nominal choisi ; il ne suit
    // pas la concentration de xénon pendant le transitoire.
    const coreReferencePcm=u.xenonEquilibriumWorthPcm;
    s.xenonWorthPcm=xenonPcm;
    s.reactivityParts={rod:rodPcm,boron:boronPcm,temp:tempPcm,
      doppler:dopplerPcm,coreReference:coreReferencePcm,xenon:xenonPcm};
    s.reactivityPcm=rodPcm+boronPcm+tempPcm+dopplerPcm
      +coreReferencePcm+xenonPcm;
    return s;
  }

  function step(model, dt) {
    const s=model.state,u=model.controls;
    dt=clamp(Number(dt)||0,0,0.1);
    if (!dt||s.endState) return s;
    updateTurbineDemand(model,dt);
    s.trefC=297.2+9.3*turbineLoadTargetPct(model)/100;
    s.rLimitPas=rInsertionLimit(s.powerPct,u.halfCycle);
    s.rcvTankBoronPpm=rcvChargeBoronPpm(model);
    s.breakAreaCm2=clamp(Number(u.breakAreaCm2)||0,0,2000);
    s.breakLoop=clamp(Math.round(Number(u.breakLoop)||1),1,4);
    s.breakBranch=u.breakBranch;
    updateProtection(s,u,dt);
    updateRods(s,u,dt);

    refreshReactivity(model);
    const rho=clamp(s.reactivityPcm*1e-5,-0.15,0.012);
    const source=s.precursors.reduce((sum,c,i)=>sum+C.lambdaGroups[i]*c,0);
    const n=clamp((s.powerPct/100+dt*source)
      /(1-dt*(rho-C.beta)/C.promptGenerationS),1e-8,3);
    s.precursors=s.precursors.map((c,i)=>Math.max(0,
      (c+dt*C.betaGroups[i]*n/C.promptGenerationS)/(1+dt*C.lambdaGroups[i])));
    s.powerPct=100*n;
    s.fissionMW=C.nominalThermalMW*n;
    // Loi d'étude après fonctionnement nominal prolongé : ~7 % à l'AAR,
    // puis décroissance en temps^-0,2. Ce terme chauffe réellement le combustible.
    if(u.allRodsTargetPas===0&&s.powerPct<1&&s.normalShutdownAt===null)s.normalShutdownAt=s.time;
    const shutdowns=[s.tripAt,s.normalShutdownAt].filter(t=>t!==null);
    const shutdownAt=shutdowns.length?Math.min(...shutdowns):null;
    s.decayMW=shutdownAt===null?0:0.07*C.nominalThermalMW
      *(1+Math.max(0,s.time-shutdownAt))**-0.2;
    s.thermalPowerMW=s.fissionMW+s.decayMW;

    // Les quatre boucles partagent l'inventaire global, sans le multiplier par quatre.
    s.inventory=cppInventory(Math.max(0,s.primaryMassKg-s.vaporMassKg));
    s.coveragePct=s.inventory.coveragePct;
    for (const loop of s.loops) {
      const stopped=s.primaryPumpsStopped||loop.pumpStopped;
      const nominalLoopFlow=C.nominalPrimaryFlowKgS/4;
      const flowTarget=stopped?0:nominalLoopFlow;
      const priming=s.inventory.loopPriming[loop.index-1];
      const localFactor=s.breakAreaCm2>0 && s.breakLoop===loop.index?0.82:1;
      const tau=stopped?C.pumpCoastdownTauS:8;
      const previousForced=loop.forcedFlowKgS;
      loop.forcedFlowKgS=previousForced+(flowTarget*localFactor*priming-previousForced)*clamp(dt/tau,0,1);
      if(stopped&&loop.forcedFlowKgS<0.02*nominalLoopFlow)loop.forcedFlowKgS=0;
      const fraction=loop.forcedFlowKgS/nominalLoopFlow;
      const gv=s.gv[loop.index-1];
      const thermalDrive=Math.max(0,s.tavgC-gv.tempC);
      const naturalTarget=Math.min(C.naturalCirculationMaxKgSPerLoop,
        clamp(u.naturalCirculationKgSPerLoop,0,C.naturalCirculationMaxKgSPerLoop)
          *Math.sqrt(thermalDrive/C.naturalCirculationReferenceDeltaC))
        *s.coveragePct/100*s.inventory.loopPriming[loop.index-1]
        *clamp(gv.waterKg/C.gvNominalWaterKg,0,1)*localFactor;
      // Relais progressif du débit forcé par la circulation naturelle.
      loop.naturalFlowKgS=stopped?naturalTarget*(1-clamp(fraction,0,1)):0;
      loop.flowKgS=loop.forcedFlowKgS+loop.naturalFlowKgS;
      // La variation 7→10 bar avec T représente l'effet de densité sur la HMT.
      // La pression motrice d'aspersion suit le seul débit forcé.
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
    // Loi globale à K fixe : le transfert ne s'annule pas à l'arrêt des GMPP.
    // Le même échange est retiré du combustible et ajouté au primaire.
    const coreTransferMW=C.coreConductanceMWC*(s.fuelC-s.tavgC);
    s.coreTransferMW=coreTransferMW;
    updateGv(s,u,dt);
    const fuelDelta=(s.thermalPowerMW-coreTransferMW)*1e6*dt/C.fuelHeatCapacityJk;
    s.fuelC=clamp(s.fuelC+fuelDelta,20,3000);

    // Brèche primaire, RIS à pression variable et transit des volumes injectés.
    const density=clamp(C.primaryDensityKgM3*(s.pressureBar/155)**0.08,150,760);
    const fluxOrifice=0.68*Math.sqrt(2*density*Math.max(0,s.pressureBar-1)*1e5);
    const fluxLimit=C.breakCriticalFluxKgM2S*Math.sqrt(Math.max(0,s.pressureBar)/155);
    s.breakKgS=s.breakAreaCm2*1e-4*Math.min(fluxOrifice,fluxLimit);
    s.breakKgS=Math.min(s.breakKgS,Math.max(0,(s.primaryMassKg-1)/dt));
    risPumpFlows(s,u);
    let accumPump=0;
    for(let i=0;i<4;i++) {
      const gas=accumulatorFlowKgS(s.pressureBar,s.accumulatorsKg[i]);
      s.accumulatorNitrogenBar[i]=gas.nitrogenBar;
      const target=s.risEnabled&&s.risDemandAt!==null?gas.flowKgS:0;
      // Inertie hydraulique d'étude (1 s) : pas de commutation tout ou rien.
      s.accumulatorFlowsKgS[i]+=(target-s.accumulatorFlowsKgS[i])*clamp(dt,0,1);
      const q=Math.min(s.accumulatorFlowsKgS[i],s.accumulatorsKg[i]/dt);
      s.accumulatorFlowsKgS[i]=q;accumPump+=q;s.accumulatorsKg[i]-=q*dt;
    }
    s.accumulatorKgS=accumPump;
    const recirculation=u.risSourceMode==="recirculation";
    const sourceMass=recirculation?s.sumpKg:s.risTankRemainingKg;
    const risPump=Math.min(s.risMpKgS+s.risBpKgS,sourceMass/dt);
    const sourceBoron=recirculation?s.sumpBoronPpm:clamp(Number(u.risBoronPpm),0,4000);
    const sourceTemp=recirculation?s.sumpTempC:C.risInjectionTempC;
    const risReserveBefore=s.risTankRemainingKg;
    if(recirculation){
      s.sumpKg-=risPump*dt;s.sumpBoron-=risPump*dt*sourceBoron;
      s.sumpEnergyJ-=risPump*dt*C.primaryCpJkgK*sourceTemp;
    }else s.risTankRemainingKg-=risPump*dt;
    if(risReserveBefore>0&&s.risTankRemainingKg<=0)
      addEvent(s,"protection","Réserve RIS épuisée : bascule en recirculation possible depuis la conduite manuelle");
    pumpToPipe(s.risPipe,s.time+C.risTransitS,risPump*dt,
      sourceBoron,{tempC:sourceTemp});
    pumpToPipe(s.risPipe,s.time+C.accumulatorTransitS,accumPump*dt,
      clamp(Number(u.risBoronPpm),0,4000),{tempC:C.risInjectionTempC});
    const arrivedRis=deliverPipe(s.risPipe,s.time);
    s.risDeliveredKgS=arrivedRis.massKg/dt;
    // Apport BF : hypothèse de mélange, avec 50 % de court-circuit sur la seule
    // boucle rompue. Les autres 3/4 de l'injection traversent entièrement le cœur.
    s.risCoreKgS=s.risDeliveredKgS*(s.breakAreaCm2>0&&s.breakBranch==="froide"?0.875:1);
    s.coreFlowKgS=s.loops.reduce((sum,l)=>sum+l.flowKgS,0)+s.risCoreKgS;
    s.coreFlowFraction=s.coreFlowKgS/C.nominalPrimaryFlowKgS;

    const chargeM3h=Number.isFinite(u.rcvChargeGraphM3h)
      ? u.rcvChargeGraphM3h : u.rcvChargeM3h;
    // QCHARGE est le débit total : 6 m³/h vers les joints et jusqu'à 30 m³/h
    // sur la ligne de charge directe. Le partage des retours des joints est
    // regroupé dans le volume primaire équivalent du simulateur.
    const rcvFlow=clamp(Number(chargeM3h),C.rcvSealM3h,C.rcvNominalM3h)
      *C.primaryDensityKgM3/3600;
    const letdown=rcvLetdownM3h(model)*C.primaryDensityKgM3/3600;
    s.rcvChargeKgS=rcvFlow;
    s.rcvSealKgS=C.rcvSealM3h*C.primaryDensityKgM3/3600;
    s.rcvLetdownKgS=letdown;
    pumpToPipe(s.rcvPipe,s.time+C.rcvTransitS,rcvFlow*dt,s.rcvTankBoronPpm,
      {mode:rcvInjectionMode(model),litres:rcvFlow*dt*1000/C.primaryDensityKgM3,tempC:s.tavgC});
    const arrivedRcv=deliverPipe(s.rcvPipe,s.time,s.rcvInjectionLitres);
    s.rcvDeliveredKgS=arrivedRcv.massKg/dt;

    s.reliefStages=u.manualReliefStages.map(Boolean);
    s.reliefKgS=s.reliefStages.filter(Boolean).length*50
      *Math.sqrt(Math.max(0,s.pressureBar)/155);
    const oldMass=s.primaryMassKg;
    const availableMass=oldMass+arrivedRis.massKg+arrivedRcv.massKg;
    const totalOut=s.breakKgS+letdown+s.reliefKgS;
    const outScale=Math.min(1,Math.max(0,availableMass-1)/Math.max(1,totalOut*dt));
    s.breakKgS*=outScale;s.reliefKgS*=outScale;
    const outMass=(s.breakKgS+letdown*outScale+s.reliefKgS)*dt;
    const oldTemp=s.tavgC,oldLatent=s.vaporEnergyJ;
    const latent=latentHeatJkg(s.pressureBar);
    const steamDensity=s.pressureBar*1e5/(461.5*(saturationTemperatureC(s.pressureBar)+273.15));
    const vaporVolume=s.vaporMassKg/Math.max(0.1,steamDensity);
    const liquidVolume=Math.max(1,oldMass-s.vaporMassKg)/C.primaryDensityKgM3;
    const voidFraction=clamp(vaporVolume/(liquidVolume+vaporVolume),0,1);
    s.breakSteamKgS=s.breakKgS*voidFraction*(s.breakBranch==="chaude"?0.7:0.15);
    s.breakLiquidKgS=s.breakKgS-s.breakSteamKgS;
    const steamOut=(s.breakSteamKgS+s.reliefKgS)*dt;
    const liquidOut=outMass-steamOut;
    s.boronInventory+=arrivedRis.boron+arrivedRcv.boron-liquidOut*s.boronPpm;
    s.primaryMassKg=Math.max(1,availableMass-outMass);
    s.risCoolingMW=(arrivedRis.massKg*C.primaryCpJkgK*oldTemp-arrivedRis.energyJ)/dt/1e6;
    // Conservation de l'énergie : l'eau injectée apporte son enthalpie,
    // la vapeur sortante emporte Cp*T + Lv. Aucun refroidissement forfaitaire.
    const oldEnergy=oldMass*C.primaryCpJkgK*oldTemp+oldLatent;
    const outgoingEnergy=outMass*C.primaryCpJkgK*oldTemp+steamOut*latent;
    const netEnergy=oldEnergy+(coreTransferMW-s.totalGvMW)*1e6*dt
      +arrivedRis.energyJ+arrivedRcv.energyJ-outgoingEnergy;
    const pBefore=s.pressureBar;
    const circulation=Math.max(0,s.coreFlowKgS);
    const satBefore=saturationTemperatureC(pBefore);
    const outletRiseFactor=C.corePowerFraction/(1-C.coreBypassFraction)-.5;
    const maxRise=Math.max(0,Math.min(2*(oldTemp-20),(satBefore-oldTemp)/outletRiseFactor));
    const sensibleLimit=circulation*C.primaryCpJkgK*maxRise/1e6;
    const vaporHeatMW=Math.max(0,coreTransferMW-sensibleLimit);
    // Équilibre homogénéisé du stock : une bulle locale peut se condenser
    // dans le liquide sous-refroidi. Aucune vapeur ne reste stockée à T<Tsat.
    s.vaporEnergyJ=Math.max(0,netEnergy-s.primaryMassKg*C.primaryCpJkgK*satBefore);
    let candidateTemp=Math.min(satBefore,netEnergy/(s.primaryMassKg*C.primaryCpJkgK));
    const tavgDelta=candidateTemp-oldTemp;
    s.tavgC=Math.max(20,candidateTemp);
    // Collecte simplifiée dans le puisard pour la recirculation : la vapeur
    // rejetée se condense à l'enthalpie sensible, chaleur latente vers l'enceinte.
    const collected=(s.breakKgS+s.reliefKgS)*dt;
    s.sumpKg+=collected;s.sumpBoron+=(s.breakLiquidKgS*dt)*s.boronPpm;
    s.sumpEnergyJ+=collected*C.primaryCpJkgK*Math.min(100,oldTemp);
    if(s.sumpKg>0){s.sumpTempC=s.sumpEnergyJ/(s.sumpKg*C.primaryCpJkgK);s.sumpBoronPpm=s.sumpBoron/s.sumpKg;}
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
    const saturationC=saturationTemperatureC(s.pressureBar);
    const sprayCoolingKW=s.sprayFlowKgS*C.primaryCpJkgK
      *Math.max(0,saturationC-spraySourceC)/1000;
    // Détour de la charge directe vers le PZR : même masse et même bore,
    // déjà comptés dans arrivedRcv. Ni débit supplémentaire, ni HMT GMPP.
    s.auxiliarySprayM3h=Math.min(clamp(Number(u.manualAuxiliarySprayM3h)||0,0,C.auxiliarySprayMaxM3h),
      Math.max(0,s.rcvDeliveredKgS*3600/C.primaryDensityKgM3-C.rcvSealM3h));
    s.auxiliarySpraySourceC=arrivedRcv.massKg>0
      ? arrivedRcv.energyJ/(arrivedRcv.massKg*C.primaryCpJkgK) : s.tavgC;
    s.auxiliarySprayCoolingKW=s.auxiliarySprayM3h*C.primaryDensityKgM3/3600*C.primaryCpJkgK
      *Math.max(0,saturationC-s.auxiliarySpraySourceC)/1000;
    s.totalSprayFlowM3h=s.sprayFlowM3h+s.auxiliarySprayM3h;
    // Échange passif effectif calibré au point nominal ; sa valeur reste
    // une hypothèse, distincte du débit d'aspersion documenté.
    const pzrNetHeatMW=(s.heaterKW-C.pzrPassiveTransferKW-sprayCoolingKW-s.auxiliarySprayCoolingKW)/1000;
    const pressureDelta=((s.primaryMassKg-oldMass)/dt/C.primaryPressureCapacityKgBar
      + 0.2*tavgDelta/dt
      + C.pressureHeatGainBarPerMWs*pzrNetHeatMW)*dt;
    s.pressureBar=clamp(s.pressureBar+pressureDelta,1,180);
    s.saturationC=saturationTemperatureC(s.pressureBar);
    // Détente : l'énergie excédant le liquide saturé produit de la vapeur.
    // Elle reste dans l'inventaire jusqu'à condensation ou rejet.
    s.vaporEnergyJ=Math.max(0,netEnergy-s.primaryMassKg*C.primaryCpJkgK*s.saturationC);
    s.tavgC=Math.min(s.saturationC,Math.max(20,netEnergy/(s.primaryMassKg*C.primaryCpJkgK)));
    s.vaporMassKg=Math.min(s.primaryMassKg-1,s.vaporEnergyJ/latentHeatJkg(s.pressureBar));
    s.vaporEnergyJ=s.vaporMassKg*latentHeatJkg(s.pressureBar);
    s.primaryEnergyJ=s.primaryMassKg*C.primaryCpJkgK*s.tavgC+s.vaporEnergyJ;
    s.boronPpm=clamp(s.boronInventory/Math.max(1,s.primaryMassKg-s.vaporMassKg),0,C.reaBoronPpm);
    s.inventory=cppInventory(Math.max(0,s.primaryMassKg-s.vaporMassKg));
    s.coveragePct=s.inventory.coveragePct;
    s.pzrLevelPct=s.inventory.components.pzr.fillPct;
    const primaryFlow=s.coreFlowKgS;
    const maxDelta=Math.max(0,Math.min(2*(s.tavgC-20),(s.saturationC-s.tavgC)/outletRiseFactor));
    const deltaT=primaryFlow>1?Math.min(maxDelta,Math.max(0,coreTransferMW-vaporHeatMW)*1e6
      /(primaryFlow*C.primaryCpJkgK)):0;
    s.sensibleCoreMW=primaryFlow*C.primaryCpJkgK*deltaT/1e6;
    s.vaporizationKgS=Math.max(0,coreTransferMW-s.sensibleCoreMW)*1e6/latentHeatJkg(s.pressureBar);
    s.hotC=Math.min(s.saturationC,s.tavgC+deltaT/2);
    s.coldC=Math.max(20,s.tavgC-deltaT/2);
    // T RIC est la sortie moyenne du cœur avant mélange avec les 7 % de bypass.
    // Les branches chaudes mesurent, elles, la sortie de cuve après mélange.
    s.tRicC=Math.min(s.saturationC,s.coldC+C.corePowerFraction*deltaT/(1-C.coreBypassFraction));
    s.lidC=Math.min(s.saturationC,s.hotC);
    for(const loop of s.loops) {
      const gv=s.gv[loop.index-1];
      const asymmetry=(gv.heatMW-s.totalGvMW/4)/70;
      loop.hotC=clamp(s.hotC+asymmetry,20,s.saturationC);
      loop.coldC=clamp(s.coldC-asymmetry,20,s.saturationC);
    }
    updateAxial(s,u,dt);
    s.ptOutside=isPtOutside(s);
    updateCoreDamageWarning(s,dt);
    s.time+=dt;
    sample(s);
    return s;
  }
  function updateCoreDamageWarning(s,dt) {
    const reason=s.peakLinearWcm>590?"Puissance linéique supérieure à 590 W/cm."
      :s.inventory.levelM<CPP_CORE_TOP_M?"Dénoyage du haut du cœur.":"";
    if(!reason){s.coreDamageWarning=null;return;}
    if(!s.coreDamageWarning){
      s.coreDamageWarning={elapsedS:0,remainingS:C.coreDamageDelayS,reason};
      addEvent(s,"alarm",`Risque de cœur fondu · ${reason} Temporisation de 5 s.`);
    }else{
      s.coreDamageWarning.elapsedS+=dt;
      s.coreDamageWarning.remainingS=Math.max(0,C.coreDamageDelayS-s.coreDamageWarning.elapsedS);
      s.coreDamageWarning.reason=reason;
    }
    if(s.coreDamageWarning.elapsedS>C.coreDamageDelayS+1e-9){
      s.endState="melted";s.endReason=reason+" Dépassement maintenu plus de 5 s.";
      addEvent(s,"protection",`Cœur fondu · ${s.endReason}`);
    }
  }
  function advance(model, seconds, dt=0.1) {
    let remaining=Math.max(0,Number(seconds)||0);
    while(remaining>1e-9) {
      const h=Math.min(remaining,dt,0.1);
      step(model,h); remaining-=h;
      if(model.state.endState)break;
    }
    return model.state;
  }
  function refreshAxial(model) {
    updateAxial(model.state,model.controls,0);
    return model.state;
  }
  // Lecture commune aux synoptiques, au tableau de bord et aux éditeurs CC.
  // Les commandes demandées ne remplacent jamais les positions/débits réalisés.
  function instrumentSnapshot(model, selectedGv=1) {
    const s=model.state,u=model.controls;
    const gv=Math.max(1,Math.min(4,Math.trunc(Number(selectedGv)||1)));
    const gvAll=s.gv.map(g=>({...g,areTempC:C.areFeedTempC,feedTh:g.feedKgS*3.6,
      asgM3h:g.asgKgS*3600/C.risWaterDensityKgM3}));
    const loops=s.loops.map(loop=>({...loop,pumpStopped:s.primaryPumpsStopped||loop.pumpStopped,
      flowPct:100*loop.flowKgS/(C.nominalPrimaryFlowKgS/4)}));
    const rBelowLimit=s.tripAt===null&&s.rods.R<s.rLimitPas-0.5;
    return {gv,gvState:gvAll[gv-1],gvAll,loops,operatingState:reactorOperatingState(s),
      power:s.powerPct,demand:s.demandPct,pressure:s.pressureBar,
      pzrLevel:s.pzrLevelPct,nref:s.nrefPct,pzrTempC:saturationTemperatureC(s.pressureBar),
      sprayPct:s.sprayPct,sprayFlowM3h:s.sprayFlowM3h,heaterKW:s.heaterKW,
      auxiliarySprayM3h:s.auxiliarySprayM3h,totalSprayFlowM3h:s.totalSprayFlowM3h,
      primaryPumpsStopped:s.primaryPumpsStopped,primaryPumpStopAt:s.primaryPumpStopAt,
      primaryPumpStopReason:s.primaryPumpStopReason,allRodsTargetPas:u.allRodsTargetPas,
      asgDemandAt:s.asgDemandAt,asgAt:s.asgAt,
      coreDamageWarning:s.coreDamageWarning?{...s.coreDamageWarning}:null,
      heaterImmersionPct:Math.max(0,Math.min(100,s.pzrLevelPct/15*100)),
      hotC:s.hotC,coldC:s.coldC,tRicC:s.tRicC,tavgC:s.tavgC,lidC:s.lidC,
      inventory:s.inventory,primaryMassKg:s.primaryMassKg,
      vaporMassKg:s.vaporMassKg,vaporizationKgS:s.vaporizationKgS,
      saturationC:saturationTemperatureC(s.pressureBar),risCoreKgS:s.risCoreKgS,
      accumulatorsKg:[...s.accumulatorsKg],accumulatorNitrogenBar:[...s.accumulatorNitrogenBar],
      accumulatorFlowsKgS:[...s.accumulatorFlowsKgS],accumulatorKgS:s.accumulatorKgS,
      risMpKgS:s.risMpKgS,risBpKgS:s.risBpKgS,risSourceMode:u.risSourceMode,
      risTankRemainingKg:s.risTankRemainingKg,sumpKg:s.sumpKg,sumpTempC:s.sumpTempC,
      sumpBoronPpm:s.sumpBoronPpm,risPumpMode:u.risPumpMode,
      rra:rraConditions(s),rraConnected:s.rraConnected,endState:s.endState,endReason:s.endReason,
      boron:s.boronPpm,g3:s.g3Count,g3Display:s.tripAt===null?s.g3Count:null,
      rods:{...s.rods},rLimit:s.rLimitPas,halfCycle:u.halfCycle,tripAt:s.tripAt,
      steamKgS:s.totalSteamKgS,steamTh:s.totalSteamKgS*3.6,
      turbinePct:s.turbinePct,thermalMW:s.thermalPowerMW,electricMW:s.electricMW,
      reliefStages:[...s.reliefStages],reliefOpeningPct:s.reliefStages.map(open=>open?100:0),
      reliefKgS:s.reliefKgS,gvSetpoint:u.gvLevelSetpointPct,
      risDelivered:s.risDeliveredKgS,
      risLoopM3h:s.risDeliveredKgS*3600/C.risWaterDensityKgM3/4,
      rraLoopM3h:s.rraFlowKgS*3600/C.primaryDensityKgM3/2,
      chargeM3h:s.rcvChargeKgS*3600/C.primaryDensityKgM3,
      letdownM3h:s.rcvLetdownKgS*3600/C.primaryDensityKgM3,
      alarms:{rBelowLimit,gcta:gvAll[gv-1].dumpKgS>0.01,dpax:s.dpaxRightExceeded,pt:isPtOutside(s)},
      time:s.time,signals:{...s.signals}};
  }
  function controlSignals(model) {
    const s=model.state,u=model.controls,v=instrumentSnapshot(model);
    const values={
      ptur:[s.turbinePct,"%"],pdem:[s.demandPct,"%"],pow1:[s.powerPct,"% PN"],
      mt1Signal:[s.hotC,"°C"],mt2Signal:[s.coldC,"°C"],
      mp1Signal:[s.pressureBar,"bar abs."],mn1Signal:[s.pzrLevelPct,"%"],
      pow2Signal:[s.electricMW,"MWe"],mt3Signal:[s.gv[0].tempC,"°C"],
      mt4Signal:[v.gvState.areTempC,"°C"],md1Signal:[s.totalSteamKgS/1000,"t/s"],
      mp2Signal:[s.gv[0].pressureBar,"bar abs."],
      pthcSignal:[100*s.thermalPowerMW/C.nominalThermalMW,"% PN"],
      pgvSignal:[100*s.totalGvMW/C.nominalThermalMW,"% PN"],
      tmoy:[s.tavgC,"°C"],tpzrSignal:[v.pzrTempC,"°C"],
      reacSignal:[s.reactivityPcm,"pcm"],tfuelSignal:[s.fuelC,"°C"],
      plinSignal:[s.peakLinearWcm,"W/cm"],dnbrSignal:[s.dnbr,""],
      tsubSignal:[s.subcoolingC,"°C"],
      pchauffSignal:[s.heaterKW,"kW"],qaspSignal:[s.sprayPct,"%"],
      qpriSignal:[100*s.coreFlowFraction,"% nominal"],
      qchaSignal:[v.chargeM3h,"m³/h"],qdecSignal:[v.letdownM3h,"m³/h"],
      nrefSignal:[s.nrefPct,"%"],imchSignal:[v.heaterImmersionPct,"%"],
      qsvpSignal:[s.reliefKgS,"kg/s"],posgSignal:[s.rods.R,"pas extraits"],
      posgInternalPct:[100*(260-s.rods.R)/260,"% insertion"],
      gcpPowerSignal:[Math.min(100,turbineLoadTargetPct(model)+u.gcpCalibrationPct),"% PN"],
      turbineLimitSignal:[Number.isFinite(u.turbineLimitGraphPct)?clamp(u.turbineLimitGraphPct,0,100):100,"%"],
      gcpCalibrationSignal:[u.gcpCalibrationPct,"% PN"],
      gvSetpointSignal:[u.gvLevelSetpointPct,"%"],g3CountSignal:[s.g3Count,"pas"],
      voltageSignal:[s.lossOfVoltage?1:0,"TOR"],fluxRateSignal:[s.fluxRatePctS,"% PN/s"],
      aarSignal:[s.tripDemandAt!==null||s.tripAt!==null?1:0,"TOR"],
      qaspAuxSignal:[s.auxiliarySprayM3h,"m³/h"]
    };
    s.gv.forEach((g,i)=>{
      values[`gv${i+1}LevelSignal`]=[g.levelPct,"%"];
      values[`gv${i+1}SteamSignal`]=[g.steamKgS,"kg/s"];
    });
    return values;
  }
  return { C,G3,ROD_NAMES,ROD_WORTH_PCM,AXIAL_ROD_ABSORPTION,TRANSIENTS,make,step,advance,
    CPP_GEOMETRY,CPP_CORE_TOP_M,CPP_CORE_BOTTOM_M,CPP_INITIAL_LEVEL_M,
    cppInventory,latentHeatJkg,gvThermalCapacityJk,gvLatentHeatJkg,accumulatorFlowKgS,ptLimits,reactorOperatingState,isPtOutside,rraConditions,connectRra,setRisOperation,commandAllRods,
    instrumentSnapshot,controlSignals,
    evolveAxialPoisons,
    g3Target,gcpPositions,rInsertionLimit,rodIntegral,rodsReactivityPcm,
    axialInsertionFraction,solveAxialShape,smoothAxialProfile,
    saturationPressureBar,saturationTemperatureC,gvLevels,asgFlowKgS,
    SPIN_FXY32,spinFxy32,coreProtectionProfile,
    dpaxRightLimit,isDpaxRightExceeded,rcvLetdownM3h,rcvChargeBoronPpm,
    setRManualOverride,setRcvInjection,rcvInjectionMode,setRcvGraphInjection,
    turbineLoadTargetPct,startTransient,transientDemand,isTransientActive,pauseTransient,resumeTransient,
    interruptTransient,initiate,prepareRcvTank,refreshAxial,refreshReactivity };
});
