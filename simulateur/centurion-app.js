(function () {
  "use strict";
  const E=window.CenturionEngine;
  if(!E) throw new Error("centurion-engine.js manquant");
  const $=id=>document.getElementById(id);
  const fmt=(v,d=0)=>Number(v).toLocaleString("fr-FR",{minimumFractionDigits:d,maximumFractionDigits:d});
  const tLabel=t=>{
    const n=Math.max(0,Math.floor(t));
    return `${String(Math.floor(n/3600)).padStart(2,"0")}:${String(Math.floor(n%3600/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
  };
  const names={rcp:"RCP · quatre boucles",core:"Cœur",pt:"Diagramme P–T",inventory:"Inventaire CPP",pzr:"Pressuriseur",rods:"Position des grappes",gv:"Générateur de vapeur"};
  const svgFiles={rcp:"synoptiques/synoptique-RCP-1300.svg",pzr:"synoptiques/synoptique-RCPPZR-1300.svg",
    rods:"synoptiques/synoptique-RCPGRAPPES-1300.svg",gv:"synoptiques/synoptique-RCPGV-1300.svg",
    inventory:"synoptiques/CPP-inventaire.svg",pt:"synoptiques/Diagramme-PT.svg"};
  const ptCurves={lower:[],upper:[],saturation:[]};
  for(let t=10;t<=306.5;t+=.5){
    const lim=E.ptLimits(t);ptCurves.lower.push([t,lim.lowerBar]);ptCurves.upper.push([t,lim.upperBar]);
  }
  for(let t=0;t<=370;t+=1)ptCurves.saturation.push([t,E.saturationPressureBar(t)]);
  const signalDefs=[
    ["voltageLoss","Manque de tension","AAR immédiat · GMPP et ARE ralentissent","trip"],
    ["lowPressure","Pression primaire basse","AAR sous le seuil d’étude","trip"],
    ["highFluxAlarm","Puissance ≥ 102 %","Préalarme de puissance nucléaire","warn"],
    ["highFluxTrip","Haut flux nucléaire","AAR par haut flux de puissance","trip"],
    ["highLinearPower","PLIN > 435 W/cm","AAR par puissance linéique élevée","trip"],
    ["rapidFluxRise","Flux en hausse rapide","AAR par variation positive","trip"],
    ["rapidFluxFall","Flux en baisse rapide","AAR par variation négative","trip"],
    ["risLowPressure","Pression d’IS basse","Demande d’injection de sécurité","warn"],
    ["rBelowLimit","R sous son IL","Surveillance de la position du groupe R","warn"]
  ];
  const NUMBER_PARAMETERS=[
    ["tripPressure","tripLowPressureBar"],["risPressure","risLowPressureBar"],
    ["fluxAlarm","fluxPrealarmPct"],["fluxTrip","tripHighFluxPct"],["fluxRateTrip","tripFluxRatePctS"],
    ["risBoron","risBoronPpm"],["mpScale","risMpScale"],["bpScale","risBpScale"],
    ["fxyUngraped","fxYUngraped"],["fxyGraped","fxYGraped"],["xenonScale","timeScaleXenon"],
    ["moderatorCoefficient","coolantWorthPcmC"],["dopplerCoefficient","dopplerWorthPcmC"],
    ["xenonWorth","xenonEquilibriumWorthPcm"],
    ["naturalCirculationFlow","naturalCirculationKgSPerLoop"],
    ["gctaOpeningPressure","gctAOpeningPressureBar"]
  ];
  let model=E.make(),running=false,speed=20,last=performance.now(),carry=0;
  const certificate=window.CenturionCertificate?.create({E,getModel:()=>model,svgFiles,ptCurves,
    prepare:()=>{$("ptTrailWindow").value="14400";setDiagram("pt");render();}});
  let diagram="rcp",selectedGv=1,activeView="synoptiques",svgDoc=null;
  let historyFollowing=true,historyEndS=null;
  let pendingInitiator=null,initiatorTimer=null;
  let regulationActive=false,protectionActive=false;
  let pendingCcStep=null,ccTickId=0;
  const alarmDefaults=[
    {id:"boardPower",tag:"POW1",unit:"% PN",limits:[null,null,102,109],value:s=>s.powerPct},
    {id:"boardPressure",tag:"002MP",unit:"bar",limits:[130,150,160,165],value:s=>s.pressureBar},
    {id:"boardPzrLevel",tag:"003MN",unit:"%",limits:[15,20,70,80],value:s=>s.pzrLevelPct},
    {id:"boardHot",tag:"101MT",unit:"°C",limits:[null,null,335,345],value:(s,g,l)=>l.hotC},
    {id:"boardCold",tag:"102MT",unit:"°C",limits:[null,null,300,310],value:(s,g,l)=>l.coldC},
    {id:"boardGvPressure",tag:"104MP",unit:"bar",limits:[null,null,85,90],value:(s,g)=>g.pressureBar},
    {id:"boardGvLevel",tag:"105MN",unit:"%",limits:[15,25,75,85],value:(s,g)=>g.levelPct},
    {id:"boardPline",tag:"PLIN",unit:"W/cm",limits:[null,null,400,435],value:s=>s.peakLinearWcm},
    {id:"boardDnBr",tag:"DNBR",unit:"—",limits:[1.4,1.5,null,null],value:s=>s.dnbr},
    {id:"boardFuel",tag:"TCRA",unit:"°C",limits:[null,null,1000,1200],value:s=>s.fuelC},
    {id:"boardSubcool",tag:"TSUB",unit:"°C",limits:[10,15,null,null],value:s=>s.subcoolingC},
    {id:"boardPrimaryFlow",tag:"QPRI",unit:"%",limits:[75,90,null,null],value:s=>100*s.coreFlowFraction},
    {id:"boardTavg",tag:"|TMOY−TREF|",unit:"°C",limits:[null,null,3,5],value:s=>Math.abs(s.tavgC-s.trefC)},
    {id:"boardReactivity",tag:"|REAC|",unit:"pcm",limits:[null,null,200,300],value:s=>Math.abs(s.reactivityPcm)}
  ];
  const alarmLimits=Object.fromEntries(alarmDefaults.map(a=>[a.id,[...a.limits]]));
  const editorReady={regul:false,protect:false};
  let lastPaint=0;

  function activateView(name) {
    activeView=name;
    document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.view===name));
    document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${name}`));
    if(name==="graphiques") {$("historyGv").value=String(selectedGv);drawHistory();}
    if(name==="transitoires") drawLoadProgramChart();
  }
  function renderInitiatorCountdown(now=performance.now()) {
    const banner=$("initiatorCountdown");
    banner.hidden=!pendingInitiator;
    if(pendingInitiator) {
      const label=$("initiatorCountdownLabel"),seconds=$("initiatorCountdownSeconds");
      if(label.textContent!==pendingInitiator.label)label.textContent=pendingInitiator.label;
      const remaining=String(Math.max(1,Math.ceil((pendingInitiator.deadline-now)/1000)));
      if(seconds.textContent!==remaining)seconds.textContent=remaining;
    }
    for(const id of ["startBreak","startEjection","startWithdrawal","startVoltage"])
      $(id).disabled=Boolean(pendingInitiator||model.state.endState);
  }
  function cancelInitiator() {
    if(initiatorTimer!==null)clearInterval(initiatorTimer);
    initiatorTimer=null;pendingInitiator=null;
    renderInitiatorCountdown();
  }
  function scheduleInitiator(name,details,label) {
    if(pendingInitiator||model.state.endState)return;
    // Délai réel : indépendant de la vitesse de simulation et de l'onglet affiché.
    pendingInitiator={name,details:{...details},label,deadline:performance.now()+5000};
    renderInitiatorCountdown();
    initiatorTimer=setInterval(()=>{
      if(!pendingInitiator)return;
      if(model.state.endState){cancelInitiator();return;}
      const now=performance.now();
      if(now<pendingInitiator.deadline){renderInitiatorCountdown(now);return;}
      const launch=pendingInitiator;
      cancelInitiator();
      E.initiate(model,launch.name,launch.details);
      render();
    },100);
  }
  function setDiagram(name,gv=selectedGv) {
    if(name!=="core"&&!svgFiles[name]) return;
    selectedGv=Number(gv)||1;
    $("gvSelect").value=String(selectedGv);
    $("historyGv").value=String(selectedGv);
    const changed=diagram!==name;
    diagram=name;
    document.querySelectorAll(".diagram-tab").forEach(b=>b.classList.toggle("active",b.dataset.diagram===name));
    $("gvSelect").disabled=name!=="gv";
    $("ptTrailPicker").hidden=name!=="pt";
    $("diagramObject").hidden=name==="core";
    $("coreDiagram").hidden=name!=="core";
    $("diagramFrame").classList.toggle("core-active",name==="core");
    $("diagramZoom").hidden=name==="core";
    if(changed&&name!=="core") {
      svgDoc=null;
      $("diagramZoomValue").textContent="100 %";
      $("diagramObject").data=svgFiles[name]+"?v=20261007-bilan-masses-phase";
    } else if(name!=="core") {
      decorateSvg();
      updateSvg();
    }
    renderBoard();renderInventoryBalance();
    if(activeView!=="synoptiques") activateView("synoptiques");
    if(name==="core")drawCoreCharts();
  }
  function recolorArrow(group,disabled) {
    if(!group) return;
    group.style.cursor=disabled?"default":"pointer";
    const shapes=group.querySelectorAll('polygon[fill="#b79af7"],path[fill="#b79af7"],path[style*="#b79af7"]');
    for(const shape of shapes){
      if(shape._centurionFill===undefined){shape._centurionFill=shape.style.fill;shape._centurionStroke=shape.style.stroke;}
      shape.style.fill=disabled?"#b9c1c8":shape._centurionFill;
      shape.style.stroke=disabled?"#737e88":shape._centurionStroke;
    }
  }
  function arrowAncestor(text) {
    let p=text;
    for(let i=0;i<5 && p;i++,p=p.parentElement) {
      if(p.localName==="g" && (/^renvoi-/i.test(p.id||"") ||
          p.querySelector('polygon[fill="#b79af7"],path[fill="#b79af7"],path[style*="#b79af7"]'))) return p;
    }
    return text;
  }
  function parseLinkLabel(label) {
    const s=label.replace(/\s+/g," ").trim().toUpperCase();
    const m=/^GV\s*([1-4])$/.exec(s);
    if(m) return {diagram:"gv",gv:Number(m[1])};
    if(s==="PZR" || s==="PRESSURISEUR") return {diagram:"pzr"};
    if(s==="GRAPPES" || s==="POSITION DES GRAPPES") return {diagram:"rods"};
    if(s==="RCP") return {diagram:"rcp"};
    return null;
  }
  function decorateSvg() {
    if(!svgDoc) return;
    const root=svgDoc.documentElement;
    if(root.hasAttribute("data-centurion-diagram"))return; // Navigation portée par le SVG.
    if(!root.dataset.centurionBound) {
      root.dataset.centurionBound="1";
      root.addEventListener("click",ev=>{
        const text=ev.target.closest?.("text");
        if(!text) return;
        const destination=parseLinkLabel(text.textContent);
        if(!destination) return;
        ev.preventDefault();ev.stopPropagation();
        setDiagram(destination.diagram,destination.gv||selectedGv);
      });
    }
    for(const text of svgDoc.querySelectorAll("text")) {
      const label=text.textContent.trim().toUpperCase();
      const destination=parseLinkLabel(label);
      if(destination) recolorArrow(arrowAncestor(text),false);
      else if(/^(RCV|RIS(?: MP| BP)? ?[1-4]?|RRA ?[1-4]?|ASG|ARE)$/.test(label))
        recolorArrow(arrowAncestor(text),true);
    }
    if(diagram==="gv") {
      for(const id of ["renvoi-ASG","renvoi-ARE"]) recolorArrow(svgDoc.getElementById(id),true);
    }
  }
  function updateSvg() {
    if(diagram==="core")return;
    const extra={};
    if(diagram==="pt"){
      const span=Number($("ptTrailWindow").value)||300;
      const points=model.state.history.filter(p=>p.t>=model.state.time-span);
      const stride=Math.max(1,Math.ceil(points.length/1200));
      extra.ptHistory=points.filter((_,i)=>i%stride===0);
      extra.ptHistory.push({t:model.state.time,tavg:model.state.tavgC,pressure:model.state.pressureBar});
      extra.ptCurves=ptCurves;
    }
    try { $("diagramObject").contentWindow?.postMessage({type:"centurion-state",
      diagram,...E.instrumentSnapshot(model,selectedGv),...extra},"*"); } catch(_) {}
  }
  function renderInventoryBalance() {
    $("inventoryBalance").hidden=diagram!=="inventory";
    $("instrumentBoard").hidden=diagram==="inventory";
    const balance=E.primaryMassBalance(model.state);
    $("inventoryPlantState").textContent=E.reactorOperatingState(model.state).code;
    $("inventoryBalanceConditions").textContent=`P ${fmt(model.state.pressureBar,1)} bar · TMOY ${fmt(model.state.tavgC,1)} °C`;
    document.querySelectorAll("[data-mass-balance]").forEach(output=>{
      output.textContent=fmt(balance[output.dataset.massBalance],Number(output.dataset.decimals??1));
    });
    $("inventoryBalanceTrend").textContent=balance.trend;
    $("inventoryBalanceNet").dataset.sign=balance.netKgS>.05?"gain":balance.netKgS<-.05?"loss":"balanced";
  }
  function renderBoard() {
    const s=model.state,g=s.gv[selectedGv-1],l=s.loops[selectedGv-1];
    const v=E.instrumentSnapshot(model,selectedGv);
    $("plantState").textContent=v.operatingState.code;
    $("plantState").setAttribute("title",v.operatingState.caption);
    $("plantState").setAttribute("data-state",v.operatingState.code);
    const show=(id,value)=>{$(id).textContent=value;};
    show("boardPower",`${fmt(s.powerPct,1)} %`);
    show("boardPressure",`${fmt(s.pressureBar,1)} bar`);
    show("boardPzrLevel",`${fmt(s.pzrLevelPct,1)} %`);
    show("boardHot",`${fmt(l.hotC,1)} °C`);
    show("boardCold",`${fmt(l.coldC,1)} °C`);
    show("boardGvPressure",`${fmt(g.pressureBar,1)} bar`);
    show("boardGvLevel",`${fmt(g.levelPct,1)} %`);
    show("boardFeed",`${fmt(g.feedKgS)} kg/s`);
    show("boardAsg",`${fmt(g.asgKgS,1)} kg/s`);
    $("boardAsg").title=!model.controls.asgAvailable?"ASG indisponible"
      : g.levelPct>90+1e-9?"ASG arrêtée sur haut niveau GE (>90 %) · arrêt applicable aussi en manuel"
      : model.controls.asgManual?(model.controls.asgTrainEnabled[selectedGv-1]
        ? "ASG en service sur commande manuelle"
        :"ASG arrêtée sur commande manuelle")
      : s.asgAt===null?"ASG en attente d'un ordre CC-PROTECT ou manuel"
      : !g.asgRunning?(g.asgKgS>0?"Arrêt ASG sur haut niveau GE · débit résiduel en décroissance"
        :"ASG arrêtée sur haut niveau GE · reprise sous 10 % GE")
      : "ASG automatique : arrêt au-dessus de 90 % GE, reprise sous 10 % GE";
    show("boardSteam",`${fmt(g.steamKgS)} kg/s`);
    show("boardGcta",`${fmt(g.dumpKgS,1)} kg/s`);
    show("boardVpu",`${fmt(g.turbineSteamKgS)} kg/s`);
    $("boardGcta").classList.toggle("alarm-blink",g.dumpKgS>0.01);
    show("boardElectric",`${fmt(s.electricMW)} MWe`);
    show("boardGvTemp",`${fmt(g.tempC,1)} °C`);
    show("boardFeedTemp",`${fmt(v.gvState.areTempC)} °C`);
    show("boardReactivity",`${fmt(s.reactivityPcm,1)} pcm`);
    show("boardXenon",`${fmt(s.xenonWorthPcm)} pcm`);
    show("boardTavg",`${fmt(s.tavgC,1)} °C`);
    show("boardTref",`${fmt(s.trefC,1)} °C`);
    show("boardNref",`${fmt(s.nrefPct,1)} %`);
    show("boardThermal",`${fmt(s.thermalPowerMW)} MWth`);
    show("boardResidual",`${fmt(100*s.decayMW/E.C.nominalThermalMW,2)} % PN`);
    $("boardResidual").title=`${fmt(s.decayMW,1)} MWth de chaleur résiduelle`;
    show("boardPline",`${fmt(s.peakLinearWcm)} W/cm`);
    show("boardDpax",`${fmt(s.dpaxPctPn,2)} % PN`);
    $("boardDpax").classList.toggle("alarm-blink",E.isDpaxRightExceeded(s));
    show("boardDnBr",fmt(s.dnbr,2));
    show("boardFdH",fmt(s.fDeltaH,3));
    show("boardBoron",`${fmt(s.boronPpm)} ppm`);
    show("boardTurbine",`${fmt(s.turbinePct,1)} %`);
    show("boardPzrTemp",`${fmt(v.pzrTempC,1)} °C`);
    show("boardFuel",`${fmt(s.fuelC)} °C`);
    show("boardSubcool",`${fmt(s.subcoolingC,1)} °C`);
    show("boardGvPower",`${fmt(s.totalGvMW)} MWth`);
    show("boardPrimaryFlow",`${fmt(s.coreFlowFraction*100)} %`);
    show("boardCharge",`${fmt(v.chargeM3h,1)} m³/h`);
    show("boardImmersion",`${fmt(v.heaterImmersionPct)} %`);
    show("boardRelief",`${fmt(s.reliefKgS,1)} kg/s · ${s.reliefStages.filter(Boolean).length}/3`);
    show("boardR",`${fmt(s.rods.R)} pas`);
    $("boardR").classList.toggle("alarm-blink",s.tripAt===null&&s.rods.R<s.rLimitPas-0.5);
    show("boardG3",s.tripAt===null?`${fmt(s.g3Count)} pas`:"— (AAR)");
    show("boardAreValve",`${fmt(g.feedValvePct)} %`);
    show("boardHeater",`${fmt(s.heaterKW)} kW`);
    show("boardSpray",`${fmt(s.totalSprayFlowM3h,2)} m³/h`);
    $("boardSpray").title=`Aspersion BF ${fmt(s.sprayFlowM3h,2)} + auxiliaire RCV ${fmt(s.auxiliarySprayM3h,2)} m³/h`;
    show("boardLetdown",`${fmt(v.letdownM3h,1)} m³/h`);
    const n=selectedGv;
    for(const [id,label] of [["boardGvPressure",`${n}04MP`],["boardGvLevel",`${n}05MN`],
      ["boardFeed",`ARE${n}01MD`],["boardAsg",`ASG${n}01MD`],["boardSteam",`VAP${n}`],
      ["boardGcta",`GCT-A${n}20KM`],["boardVpu",`VPU${n}`],
      ["boardHot",`${n}01MT`],["boardCold",`${n}02MT`]]) {
      $(id).parentElement.querySelector("strong").textContent=label;
    }
    document.querySelectorAll(".instrument span").forEach(label=>{
      label.title=label.textContent.trim();
    });
    renderAlarms(s,g,l);
  }
  function renderAlarms(s,g,l){
    const active=[];
    for(const alarm of alarmDefaults){
      const value=alarm.value(s,g,l),[redLow,orangeLow,orangeHigh,redHigh]=alarmLimits[alarm.id];
      const level=(redLow!==null&&value<=redLow)||(redHigh!==null&&value>=redHigh)?"danger"
        :(orangeLow!==null&&value<=orangeLow)||(orangeHigh!==null&&value>=orangeHigh)?"warning":"";
      const card=$(alarm.id).parentElement;
      card.classList.toggle("alarm-danger",level==="danger");
      card.classList.toggle("alarm-warning",level==="warning");
      if(level)active.push(`${alarm.tag} ${level==="danger"?"rouge":"orange"}`);
    }
    const dumping=s.gv.filter(unit=>unit.dumpKgS>0.01).map(unit=>unit.index);
    if(dumping.length)active.push(`Débit GCT-A · GV ${dumping.join(", ")}`);
    if(s.tripAt===null&&s.rods.R<s.rLimitPas-0.5)active.push("R sous sa limite d'insertion");
    if(E.isDpaxRightExceeded(s))active.push("DPAX au-delà de la limite droite");
    $("alarmSummary").textContent=active.length?`${active.length} alarme${active.length>1?"s":""} active${active.length>1?"s":""} · ${active.join(" · ")}`:"Aucune alarme active.";
    $("alarmSummary").classList.toggle("alarm-active",Boolean(active.length));
  }
  function renderAlarmTable(){
    $("alarmRows").innerHTML=alarmDefaults.map(a=>`<tr><th>${a.tag}</th><td>${a.unit}</td>${alarmLimits[a.id].map((v,i)=>
      `<td>${v===null?'<span class="not-applicable">—</span>':`<input type="number" step="any" data-alarm="${a.id}" data-limit="${i}" value="${v}" aria-label="${a.tag} seuil ${i+1}">`}</td>`).join("")}</tr>`).join("");
  }
  function setModelPage(page){
    document.querySelectorAll(".model-tab").forEach(b=>b.classList.toggle("active",b.dataset.modelPage===page));
    document.querySelectorAll(".model-page").forEach(p=>p.classList.toggle("active",p.id===`model-${page}`));
  }

  function setModelDetailPage(page){
    document.querySelectorAll(".model-detail-tab").forEach(b=>{
      const active=b.dataset.detailPage===page;
      b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));
    });
    document.querySelectorAll(".model-detail-page").forEach(v=>
      v.classList.toggle("active",v.id===`model-detail-${page}`));
  }
  function renderSignals() {
    const s=model.state,u=model.controls;
    const details={
      voltageLoss:s.lossOfVoltage?"Tension absente":"Tension présente",
      lowPressure:`${fmt(s.pressureBar,1)} / ${fmt(u.tripLowPressureBar)} bar`,
      highFluxAlarm:`${fmt(s.powerPct,1)} / ${fmt(u.fluxPrealarmPct)} %`,
      highFluxTrip:`${fmt(s.powerPct,1)} / ${fmt(u.tripHighFluxPct)} %`,
      highLinearPower:`${fmt(s.peakLinearWcm)} / ${E.C.tripLinearWcm} W/cm`,
      rapidFluxRise:`${fmt(s.fluxRatePctS,1)} / +${fmt(u.tripFluxRatePctS,1)} %/s`,
      rapidFluxFall:`${fmt(s.fluxRatePctS,1)} / −${fmt(u.tripFluxRatePctS,1)} %/s`,
      risLowPressure:`${fmt(s.pressureBar,1)} / ${fmt(u.risLowPressureBar)} bar`,
      rBelowLimit:`${fmt(s.rods.R)} / IL ${fmt(s.rLimitPas)} pas`
    };
    $("signalCards").innerHTML=signalDefs.map(([id,title,description,severity])=>{
      const active=Boolean(s.signals[id]);
      return `<div class="signal ${active?(severity==="trip"?"trip":"active"):""}">
        <strong><span class="lamp"></span>${title}</strong><small>${description}</small><small>${details[id]}</small></div>`;
    }).join("");
    $("protectionState").textContent=s.tripAt!==null?"AAR engagé":s.tripDemandAt!==null?"Ordre AAR":s.risDemandAt!==null?"IS demandée":"Surveillance";
    $("mpFlow").textContent=fmt(s.risMpKgS);
    $("bpFlow").textContent=fmt(s.risBpKgS);
    $("accFlow").textContent=fmt(s.accumulatorKgS);
    $("risDelivered").textContent=fmt(s.risDeliveredKgS);
    $("risReserve").textContent=fmt(s.risTankRemainingKg/E.C.risWaterDensityKgM3,1);
    $("risSupplyStatus").textContent=!s.risEnabled ? "RIS indisponible"
      : model.controls.risPumpMode==="off"?"Pompes arrêtées manuellement · accumulateurs passifs"
      : model.controls.risSourceMode==="recirculation"?`Recirculation · puisard ${fmt(s.sumpKg/1000,1)} t à ${fmt(s.sumpTempC,1)} °C`
      : s.risTankRemainingKg<=0?"Réserve épuisée · sélectionner Recirculation dans Conduite manuelle → RIS"
      : s.risAt!==null&&s.pressureBar>=120 ? "Pression primaire ≥ 120 bar · pompes non débitantes"
      : "Injection directe · source à 20 °C";
    $("eventLog").innerHTML=s.events.slice(-16).reverse().map(e=>
      `<li class="${e.kind}"><time>${tLabel(e.time)}</time>${e.text}</li>`).join("") || "<li>En attente d'événement.</li>";
  }
  function renderAxial() {
    const s=model.state;
    $("axialBars").innerHTML=s.axialFlux32.map((x,i)=>
      `<span title="Maille ${i+1} : ${fmt(x,2)}" style="height:${Math.max(2,Math.min(100,x/1.7*100))}%"></span>`).join("");
    $("detectorValues").textContent=s.fluxDetectors6.map(v=>fmt(v,2)).join(" · ");
    $("plineValue").textContent=fmt(s.peakLinearWcm);
  }
  function drawCoreCharts() {
    if(activeView!=="synoptiques"||diagram!=="core")return;
    const s=model.state,dpr=window.devicePixelRatio||1;
    const profileCanvas=$("coreProfileChart"),pilotCanvas=$("corePilotChart");
    const setup=(canvas)=>{
      const rect=canvas.getBoundingClientRect();
      const w=Math.max(280,rect.width),h=Math.max(330,rect.height);
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
      const ctx=canvas.getContext("2d");
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.fillStyle="#fbfdff";ctx.fillRect(0,0,w,h);
      ctx.font="12px Arial";ctx.textBaseline="middle";
      return {ctx,w,h};
    };
    const profile=setup(profileCanvas);
    const {ctx:p,w:pw,h:ph}=profile;
    const left=55,right=pw-20,top=25,bottom=ph-88;
    const origin=left+0.48*(right-left),maxXenonDensity=2000,maxIodineRelative=3;
    const axialPower=z=>E.smoothAxialProfile(s.axialShape32,z);
    const axialConcentration=(values,z)=>{
      const nodes=values.length,position=Math.max(0,Math.min(nodes-1,z*nodes-0.5));
      const i=Math.floor(position),fraction=position-i;
      return values[i]*(1-fraction)+values[Math.min(nodes-1,i+1)]*fraction;
    };
    const xenonNominalWorth=model.controls.xenonEquilibriumWorthPcm;
    const axialXenon=z=>xenonNominalWorth
      *axialConcentration(s.xenon32,z)/E.C.activeFuelHeightM;
    const peak=Math.max(...s.axialShape32);
    const peakXenonDensity=xenonNominalWorth
      *Math.max(...s.xenon32)/E.C.activeFuelHeightM;
    const maxRelative=2;
    $("coreLinearReadout").textContent=
      `P(z) max ${fmt(peak,2)}${peak>2?" (hors échelle)":""} · PLIN ${fmt(s.peakLinearWcm)} W/cm`
      +(s.peakLinearWcm>E.C.tripLinearWcm?" (hors échelle)":"");
    p.strokeStyle="#dceaf0";p.lineWidth=1;
    for(let i=0;i<=6;i++){
      const y=bottom-i/6*(bottom-top);
      p.beginPath();p.moveTo(left,y);p.lineTo(right,y);p.stroke();
      p.fillStyle="#668294";p.textAlign="right";
      p.fillText(fmt(E.C.activeFuelHeightM*i/6,2),left-9,y);
      if(i<6){
        p.fillStyle="#7994a3";
        p.fillText(`T${i+1}`,left-9,y-(bottom-top)/12);
      }
    }
    for(let i=1;i<=4;i++){
      const x=origin-i/4*(origin-left);
      p.strokeStyle="#ece8f4";p.beginPath();p.moveTo(x,top);p.lineTo(x,bottom);p.stroke();
      p.fillStyle="#79668f";p.textAlign="center";
      p.fillText(`−${fmt(maxXenonDensity*i/4)}`,x,bottom+18);
      p.fillStyle="#b58225";
      p.fillText(fmt(maxIodineRelative*i/4,2),x,bottom+56);
    }
    for(let i=1;i<=4;i++){
      const x=origin+i/4*(right-origin);
      p.strokeStyle="#e5eef3";p.beginPath();p.moveTo(x,top);p.lineTo(x,bottom);p.stroke();
      p.fillStyle="#668294";p.textAlign="center";
      p.fillText(fmt(maxRelative*i/4,2),x,bottom+18);
    }
    // 32 valeurs SPIN : axe horizontal indépendant et fixe 0–435 W/cm.
    // L'histogramme reste derrière la courbe P(z), les dépassements sont écrêtés
    // uniquement au dessin ; la valeur réelle alimente toujours CC-PROTECT.
    const barHeight=(bottom-top)/E.C.axialZones;
    s.linearWcm32.forEach((value,i)=>{
      const width=Math.max(0,Math.min(E.C.tripLinearWcm,value))
        /E.C.tripLinearWcm*(right-origin);
      const y=bottom-(i+1)*barHeight;
      p.fillStyle="#d5e5f6";p.fillRect(origin,y+0.5,width,Math.max(1,barHeight-1));
      if(value>E.C.tripLinearWcm){
        p.fillStyle="#e45b53";p.fillRect(right-2,y+0.5,2,Math.max(1,barHeight-1));
      }
    });
    for(const value of [0,100,200,300,435]){
      p.fillStyle="#7895b5";p.textAlign=value===435?"right":"center";
      p.fillText(String(value),origin+value/E.C.tripLinearWcm*(right-origin),bottom+56);
    }
    p.textAlign="center";p.fillStyle="#7895b5";
    p.fillText("PLIN · W/cm (0–435)",(origin+right)/2,bottom+75);
    p.strokeStyle="#466174";p.lineWidth=2.2;
    p.beginPath();p.moveTo(origin,top);p.lineTo(origin,bottom);p.stroke();
    p.fillStyle="#668294";p.textAlign="center";p.fillText("0",origin,bottom+18);
    p.fillStyle="#79668f";p.textAlign="center";
    p.fillText("Xe · pcm/m",(left+origin)/2,bottom+36);
    p.fillStyle="#b58225";p.fillText("0",origin,bottom+56);
    p.fillText("I-135 · concentration relative",(left+origin)/2,bottom+75);
    p.fillStyle="#44677c";
    p.fillText("P(z) · relatif",(origin+right)/2,bottom+36);
    p.textAlign="left";
    p.beginPath();
    for(let i=0;i<=128;i++){
      const z=i/128,x=origin+Math.min(maxRelative,axialPower(z))/maxRelative*(right-origin);
      const y=bottom-z*(bottom-top);
      if(i===0)p.moveTo(x,y);else p.lineTo(x,y);
    }
    p.strokeStyle="#159ec3";p.lineWidth=3;p.stroke();
    p.beginPath();
    for(let i=0;i<=128;i++){
      const z=i/128,x=origin-Math.min(maxXenonDensity,axialXenon(z))
        /maxXenonDensity*(origin-left);
      const y=bottom-z*(bottom-top);
      if(i===0)p.moveTo(x,y);else p.lineTo(x,y);
    }
    p.strokeStyle="#9766b8";p.lineWidth=3;p.stroke();
    p.save();p.setLineDash([6,4]);p.beginPath();
    for(let i=0;i<=128;i++){
      const z=i/128,x=origin-Math.min(maxIodineRelative,axialConcentration(s.iodine32,z))
        /maxIodineRelative*(origin-left);
      const y=bottom-z*(bottom-top);
      if(i===0)p.moveTo(x,y);else p.lineTo(x,y);
    }
    p.strokeStyle="#c99232";p.lineWidth=2.5;p.stroke();p.restore();
    $("coreXenonReadout").textContent=`Xe total ${fmt(s.xenonWorthPcm)} pcm`
      +(peakXenonDensity>maxXenonDensity?" · maximum local hors échelle":"");
    const iodineMean=s.iodine32.reduce((sum,value)=>sum+value,0)/s.iodine32.length;
    $("coreIodineReadout").textContent=`I moyen ${fmt(iodineMean,2)} × nominal`
      +(Math.max(...s.iodine32)>maxIodineRelative?" · maximum local hors échelle":"");

    const pilot=setup(pilotCanvas);
    const {ctx:q,w:qw,h:qh}=pilot;
    const plotLeft=57,plotRight=qw-22,plotTop=26,plotBottom=qh-48;
    const windowS=Number($("coreTrailWindow").value)||300;
    const history=s.history.filter(point=>point.t>=s.time-windowS
      &&Number.isFinite(point.dpax)&&Number.isFinite(point.power));
    const trail=[...history];
    if(!trail.length||trail.at(-1).t<s.time-1e-6)
      trail.push({t:s.time,dpax:s.dpaxPctPn,power:s.powerPct});
    const xMin=Math.min(-10,Math.floor(Math.min(E.C.dpaxReferencePctPn,
      ...trail.map(point=>point.dpax))*1.15/5)*5);
    const xMax=Math.max(20,Math.ceil(Math.max(15,
      ...trail.map(point=>point.dpax))*1.15/5)*5);
    const maxPower=Math.max(110,Math.ceil(Math.max(s.powerPct,
      ...trail.map(point=>point.power))*1.05/10)*10);
    const xFor=value=>plotLeft+(value-xMin)/(xMax-xMin)*(plotRight-plotLeft);
    const yFor=value=>plotBottom-Math.max(0,Math.min(maxPower,value))
      /maxPower*(plotBottom-plotTop);
    q.strokeStyle="#dceaf0";q.lineWidth=1;
    for(let tick=Math.ceil(xMin/10)*10;tick<=xMax;tick+=10){
      const x=xFor(tick);
      q.beginPath();q.moveTo(x,plotTop);q.lineTo(x,plotBottom);q.stroke();
      q.fillStyle="#668294";q.textAlign="center";
      q.fillText(fmt(tick),x,plotBottom+18);
    }
    for(let i=0;i<=4;i++){
      const y=plotBottom-i/4*(plotBottom-plotTop);
      q.beginPath();q.moveTo(plotLeft,y);q.lineTo(plotRight,y);q.stroke();
      q.textAlign="right";q.fillText(`${fmt(i*maxPower/4)} %`,plotLeft-7,y);
    }
    // DPAX nul : axe des ordonnées du diagramme de pilotage.
    q.strokeStyle="#324f62";q.lineWidth=2.6;
    q.beginPath();q.moveTo(xFor(0),plotTop);q.lineTo(xFor(0),plotBottom);q.stroke();
    // Limite droite : (DPAX, P) = (0,0) → (15,15) → (6,100).
    q.strokeStyle="#d49324";q.lineWidth=2.2;
    q.beginPath();q.moveTo(xFor(0),yFor(0));
    q.lineTo(xFor(15),yFor(15));q.lineTo(xFor(6),yFor(100));q.stroke();
    // Référence DPAX : origine → (DPAX réf., 100 % PN).
    q.save();q.setLineDash([6,4]);q.strokeStyle="#7b65ac";q.lineWidth=2;
    q.beginPath();q.moveTo(xFor(0),yFor(0));
    q.lineTo(xFor(E.C.dpaxReferencePctPn),yFor(100));q.stroke();q.restore();
    const refX=xFor(E.C.dpaxReferencePctPn),refY=yFor(100);
    q.save();q.setLineDash([4,3]);q.strokeStyle="#a890c8";
    q.beginPath();q.moveTo(refX-8,refY);q.lineTo(refX+8,refY);
    q.moveTo(refX,refY-8);q.lineTo(refX,refY+8);q.stroke();q.restore();
    q.fillStyle="#44677c";q.textAlign="center";
    q.fillText("DPAX · % PN",(plotLeft+plotRight)/2,qh-10);
    q.save();q.translate(14,(plotTop+plotBottom)/2);q.rotate(-Math.PI/2);
    q.fillText("Puissance nucléaire · % PN",0,0);q.restore();
    q.textAlign="left";
    q.beginPath();
    for(let i=0;i<trail.length;i++){
      const point=trail[i],x=xFor(point.dpax),y=yFor(point.power);
      if(i===0)q.moveTo(x,y);else q.lineTo(x,y);
    }
    q.strokeStyle="#e45b53";q.lineWidth=2.6;q.stroke();
    const nowX=xFor(s.dpaxPctPn),nowY=yFor(s.powerPct);
    q.fillStyle="#fff";q.strokeStyle="#e45b53";q.lineWidth=3;
    q.beginPath();q.arc(nowX,nowY,6,0,2*Math.PI);q.fill();q.stroke();
    q.fillStyle="#ad4338";q.font="bold 12px Arial";
    const label=`${fmt(s.dpaxPctPn,2)} % PN · ${fmt(s.powerPct,1)} % PN`;
    q.textAlign=nowX>plotRight-140?"right":"left";
    q.fillText(label,nowX+(q.textAlign==="left"?10:-10),
      Math.max(plotTop+13,nowY-15));
    $("coreDpaxReadout").textContent=`DPAX ${fmt(s.dpaxPctPn,2)} % PN`;
    $("coreDpaxReadout").classList.toggle("alarm-blink",E.isDpaxRightExceeded(s));
  }
  function drawHistory() {
    if(activeView!=="graphiques")return;
    const canvas=$("historyChart"),rect=canvas.getBoundingClientRect();
    const dpr=window.devicePixelRatio||1,w=Math.max(300,rect.width),h=Math.max(220,rect.height);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const rodView=$("traceSet").value==="rods";
    const left=67,right=w-(rodView?75:18),top=30,bottom=h-31;
    ctx.fillStyle="#fbfdff";ctx.fillRect(0,0,w,h);
    const s=model.state,points=s.history,windowS=Number($("historyWindow").value)||300;
    const maxEnd=Math.max(windowS,Math.ceil(s.time));
    const oldest=points.length?points[0].t:0;
    const minEnd=Math.min(maxEnd,Math.max(windowS,Math.ceil(oldest+windowS)));
    const end=historyFollowing?maxEnd:Math.max(minEnd,Math.min(maxEnd,historyEndS??maxEnd));
    if(end>=maxEnd)historyFollowing=true;
    historyEndS=end;
    const start=end-windowS,span=windowS;
    const scrubber=$("historyScrubber");
    scrubber.min=String(minEnd);scrubber.max=String(maxEnd);scrubber.value=String(end);
    scrubber.disabled=minEnd>=maxEnd;
    scrubber.setAttribute("aria-valuetext",`De ${tLabel(start)} à ${tLabel(end)}`);
    $("historyLive").disabled=historyFollowing||scrubber.disabled;
    $("historyRangeLabel").textContent=`${tLabel(start)} – ${tLabel(end)}`;
    $("historyOldestLabel").textContent=`Données depuis ${tLabel(oldest)}`;
    $("historyNewestLabel").textContent=`Simulation : ${tLabel(s.time)}`;
    const gv=Number($("historyGv").value||selectedGv)-1;
    const line=(label,color,value,axis="left")=>({label,color,value,axis});
    const traces={
      powers:{unit:"% nominal",zero:true,fallbackPeak:100,series:[
        line("Cœur · % PN (fission)","#159ec3",p=>p.power),
        line("Thermique cœur · % PN","#a466c8",p=>p.thermalPower),
        line("Résiduelle · % PN","#d0a231",p=>p.residualPower),
        line("Réseau · % de 1 300 MWe","#f09a4b",p=>100*p.electric/E.C.nominalElectricMW)]},
      temperatures:{unit:"°C",fallbackRange:[280,350],series:[
        line("Branche froide","#2585c2",p=>p.cold),
        line("T moyenne","#55a579",p=>p.tavg),
        line("Branche chaude","#ec684b",p=>p.hot),
        line("T RIC · sortie cœur","#a466c8",p=>p.tric),
        line("Pressuriseur","#d0a231",p=>p.pzrTemp)]},
      secondaryTemperatures:{unit:"°C",fallbackRange:[240,300],series:[
        line(`Vapeur GV ${gv+1}`,"#159ec3",p=>p.gvTemp?.[gv]),
        line("Eau alimentaire ARE · 245 °C (hypothèse)","#f09a4b",()=>245)]},
      pressures:{unit:"bar",zero:true,fallbackPeak:155,series:[
        line("Circuit primaire","#ec684b",p=>p.pressure),
        line(`GV ${gv+1}`,"#2585c2",p=>p.gvPressure?.[gv])]},
      levels:{unit:"%",fixed:[0,100],series:[
        line("Pressuriseur","#a466c8",p=>p.pzrLevel),
        line(`GV ${gv+1}`,"#55a579",p=>p.gv?.[gv])]},
      rods:{unit:"pas extraits",fixed:[0,260],rightUnit:"pas de chevauchement extraits",rightFixed:[0,780],series:[
        line("R","#ec684b",p=>p.rods?.R),
        line("G1","#159ec3",p=>p.rods?.G1),
        line("G2","#55a579",p=>p.rods?.G2),
        line("N1","#d0a231",p=>p.rods?.N1),
        line("N2","#a466c8",p=>p.rods?.N2),
        line("SA · arrêt A","#768795",p=>p.rods?.SA),
        line("GCP · compteur","#122e45",p=>p.g3,"right")]},
      steam:{unit:"kg/s",zero:true,fallbackPeak:4*E.C.nominalSteamKgSPerGV,series:[
        line("Débit vapeur total · 4 GV","#159ec3",p=>p.steamTotal),
        line("Débit GCT-A · 4 GV","#ec684b",p=>p.steamGctA),
        line("Débit VPU · 4 GV","#55a579",p=>p.steamVpu)]},
      flows:{unit:"m³/h",zero:true,fallbackPeak:10,series:[
        line("Injection RIS · eau froide ≈ 1 000 kg/m³","#55a579",p=>p.ris*3600/E.C.risWaterDensityKgM3),
        line("Brèche · équivalent liquide chaud","#ec684b",p=>p.break*3600/(p.breakDensity||E.C.primaryDensityKgM3))]}
    };
    const chosen=traces[$("traceSet").value]||traces.powers;
    const visible=points.filter(p=>p.t>=start&&p.t<=end);
    let low=Infinity,high=-Infinity;
    for(const trace of chosen.series){
      if(trace.axis==="right")continue;
      for(const p of visible){
        const value=trace.value(p);
        if(Number.isFinite(value)){low=Math.min(low,value);high=Math.max(high,value);}
      }
    }
    let yMin,yMax;
    if(chosen.fixed) [yMin,yMax]=chosen.fixed;
    else if(chosen.zero){
      yMin=0;
      const peak=Math.max(0,Number.isFinite(high)?high:chosen.fallbackPeak||0);
      const step=10**Math.max(-1,Math.floor(Math.log10(Math.max(peak,1)))-1);
      yMax=Math.max(step,Math.ceil(peak*1.02/step)*step);
    } else {
      const minimum=Number.isFinite(low)?low:chosen.fallbackRange[0];
      const maximum=Number.isFinite(high)?high:chosen.fallbackRange[1];
      const padding=Math.max(2.5,(maximum-minimum)*0.08);
      const step=maximum-minimum<20?5:10;
      yMin=Math.floor((minimum-padding)/step)*step;
      yMax=Math.ceil((maximum+padding)/step)*step;
    }
    const axisLabel=v=>Number(v).toLocaleString("fr-FR",{maximumFractionDigits:1});
    ctx.fillStyle="#607b8b";ctx.font="11px Arial";
    ctx.fillText(chosen.unit,left,17);
    if(chosen.rightUnit){ctx.textAlign="right";ctx.fillText(chosen.rightUnit,right,17);ctx.textAlign="left";}
    for(let j=0;j<=4;j++){
      const y=top+j*(bottom-top)/4;
      ctx.strokeStyle="#dfebf1";ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
      ctx.fillStyle="#7890a0";ctx.textAlign="right";
      ctx.fillText(axisLabel(yMax-j*(yMax-yMin)/4),left-8,y+4);
      if(chosen.rightFixed)ctx.fillText(axisLabel(chosen.rightFixed[1]-j*(chosen.rightFixed[1]-chosen.rightFixed[0])/4),w-5,y+4);
      ctx.textAlign="left";
    }
    $("historyLegend").innerHTML=chosen.series.map(l=>
      `<span><i style="background:${l.color}"></i>${l.label}${l.axis==="right"?" · axe droit":""}</span>`).join("");
    for(const trace of chosen.series){
      const [minimum,maximum]=trace.axis==="right"?chosen.rightFixed:[yMin,yMax];
      ctx.beginPath();let started=false;
      for(const p of visible){
        const value=trace.value(p);
        if(!Number.isFinite(value)){started=false;continue;}
        const x=left+(p.t-start)/span*(right-left);
        const y=bottom-Math.max(0,Math.min(1,(value-minimum)/(maximum-minimum)))*(bottom-top);
        if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);
      }
      ctx.strokeStyle=trace.color;ctx.lineWidth=trace.axis==="right"?2.8:2.2;ctx.stroke();
    }
    ctx.fillStyle="#607b8b";ctx.font="11px Arial";
    ctx.fillText(tLabel(start),left,bottom+18);
    ctx.textAlign="right";ctx.fillText(tLabel(end),right,bottom+18);ctx.textAlign="left";
    const reactivity=$("reactivityChart"),rh=Math.max(105,reactivity.getBoundingClientRect().height);
    reactivity.width=Math.round(w*dpr);reactivity.height=Math.round(rh*dpr);
    const rc=reactivity.getContext("2d");rc.setTransform(dpr,0,0,dpr,0,0);
    rc.fillStyle="#fbfdff";rc.fillRect(0,0,w,rh);
    rc.strokeStyle="#dce8ee";rc.beginPath();rc.moveTo(left,rh/2);rc.lineTo(right,rh/2);rc.stroke();
    rc.fillStyle="#607b8b";rc.font="11px Arial";rc.fillText("Réactivité (pcm)",left,13);
    rc.beginPath();let started=false;
    for(const p of points){if(p.t<start||p.t>end)continue;
      const x=left+(p.t-start)/span*(right-left),y=rh/2-Math.max(-600,Math.min(600,p.reactivity||0))/600*(rh/2-13);
      if(!started){rc.moveTo(x,y);started=true;}else rc.lineTo(x,y);
    }
    rc.strokeStyle="#a466c8";rc.lineWidth=2;rc.stroke();
  }
  function drawLoadProgramChart(){
    if(activeView!=="transitoires")return;
    const canvas=$("loadProgramChart"),dpr=window.devicePixelRatio||1;
    const w=Math.max(360,canvas.getBoundingClientRect().width),h=canvas.getBoundingClientRect().height||340;
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle="#fbfdff";ctx.fillRect(0,0,w,h);
    const left=45,right=w-20,top=25,bottom=h-34;
    ctx.strokeStyle="#dfeaf0";ctx.lineWidth=1;
    for(let n=0;n<=5;n++){const y=bottom-n/5*(bottom-top);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
      ctx.fillStyle="#6b8594";ctx.font="11px Arial";ctx.fillText(`${n*20}%`,3,y+4);}
    const name=$("transientSelect").value,duration=E.TRANSIENTS[name].duration;
    ctx.beginPath();for(let i=0;i<=300;i++){const t=duration*i/300,p=E.transientDemand(name,t);
      const x=left+i/300*(right-left),y=bottom-Math.max(0,Math.min(110,p))/110*(bottom-top);
      if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
    ctx.strokeStyle="#159ec3";ctx.lineWidth=3;ctx.stroke();
    const u=model.controls,s=model.state;
    if(u.transient===name&&["run","finished","interrupted"].includes(u.transientPhase)){
      const elapsed=Math.max(0,u.transientElapsedS);
      const progress=E.TRANSIENTS[name].loop?elapsed%duration:Math.min(duration,elapsed);
      const x=left+progress/duration*(right-left);
      ctx.strokeStyle="#ec684b";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();}
    ctx.fillStyle="#6b8594";ctx.font="11px Arial";ctx.fillText("0",left,bottom+18);
    ctx.fillText(`${fmt(duration/60)} min`,right-42,bottom+18);
  }
  function renderTransientControls() {
    const s=model.state,u=model.controls,active=E.isTransientActive(model);
    const command=active?s.demandPct:u.demandPct;
    $("demandInput").value=command;
    $("demandInput").disabled=active;
    const limit=Number.isFinite(u.turbineLimitGraphPct)?u.turbineLimitGraphPct:null;
    $("demandValue").textContent=`${fmt(command,1)} %${limit===null?"":` · LIM. TURB. ${fmt(limit,1)} %`}`;
    $("demandInput").title=limit===null?"Demande de puissance turbine"
      :`Demande PTUR · plafond CC ${fmt(limit,1)} % · consigne admise ${fmt(E.turbineLoadTargetPct(model),1)} %`;
    $("startTransient").disabled=active;
    $("pauseTransient").disabled=!active||u.transientPaused;
    $("resumeTransient").disabled=!active||!u.transientPaused;
    $("interruptTransient").disabled=!active;
    const label=u.transient==="off"?"Retour à 100 %":E.TRANSIENTS[u.transient].label;
    $("transientState").textContent=u.transientPaused?`${label} · en pause`
      :u.transientPhase==="finished"?`${label} · terminé · PTUR manuelle`
      :u.transientPhase==="interrupted"?"Programme interrompu · PTUR manuelle"
      :u.transientPhase==="return"?"Retour à 100 %"
      :u.transientPhase==="approach"?"Raccordement au point initial"
      :u.transientPhase==="run"?label:"Aucun programme";
    $("programElapsed").textContent=tLabel(u.transientElapsedS||0);
  }
  function render() {
    const s=model.state,u=model.controls;
    certificate?.observe(model);
    const v=E.instrumentSnapshot(model,selectedGv);
    if(s.endState){running=false;if(pendingInitiator)cancelInitiator();}
    renderInitiatorCountdown();
    $("scenarioEnd").hidden=!s.endState;
    $("scenarioEnd").classList.toggle("safe",s.endState==="safe");
    $("scenarioEndTitle").textContent=s.endState==="safe"?"Cœur sain et sauf":"Cœur fondu";
    $("scenarioEndReason").textContent=s.endReason;
    $("runButton").disabled=Boolean(s.endState);
    const danger=s.endState?null:s.coreDamageWarning;
    $("coreDamageCountdown").hidden=!danger;
    $("coreDamageSeconds").textContent=danger?String(Math.max(1,Math.ceil(danger.remainingS))):"5";
    $("coreDamageReason").textContent=danger?danger.reason:"";
    $("simSpeed").disabled=Boolean(danger);
    $("auxiliarySprayValue").textContent=`${fmt(u.manualAuxiliarySprayM3h,1)} m³/h`;
    $("auxiliarySprayActual").textContent=`${fmt(s.auxiliarySprayM3h,1)} m³/h`;
    $("primaryPumpStatus").textContent=s.primaryPumpsStopped
      ?`${s.primaryPumpStopReason} à ${tLabel(s.primaryPumpStopAt)} · ralentissement ≈ 1 minute, puis thermosiphon`
      :"GMPP en marche · aucun arrêt sur AAR seul ou baisse de charge";
    $("boardPrimaryFlow").title=$("primaryPumpStatus").textContent;
    const grouped=u.allRodsTargetPas!==null;
    if(grouped){$("rManualInput").value=s.rods.R;$("rManualValue").textContent=`${fmt(s.rods.R)} pas extraits`;}
    $("allRodsStatus").textContent=grouped?`${u.allRodsTargetPas===0?"Descente":"Montée"} commandée vers ${u.allRodsTargetPas} pas · R et SA–SD : 72 pas/min · GCP en séquence`
      :"R, G1, G2, N1, N2 et SA à SD · manœuvre normale, hors ordre AAR";
    for(const id of ["allRodsDown","allRodsUp","allRodsRelease"])
      $(id).disabled=Boolean(s.endState||s.tripDemandAt!==null)||(id==="allRodsRelease"&&!grouped);
    const asgHighLevel=s.gv.filter(g=>g.levelPct>90+1e-9);
    $("asgOrderStatus").textContent=asgHighLevel.length
      ?`ASG arrêtée sur haut niveau · GV ${asgHighLevel.map(g=>g.index).join(", ")} · y compris en manuel`
      :u.asgManual?"Quatre trains commandés manuellement"
      :s.asgAt!==null?`Ordre ASG exécuté à ${tLabel(s.asgAt)}`
      :s.asgDemandAt!==null?"Ordre ASG reçu · démarrage après 5 s":"En attente d’un ordre CC-PROTECT ou manuel";
    $("asgOrderStatus").classList.toggle("alarm-blink",asgHighLevel.length>0);
    for(const tab of document.querySelectorAll(".diagram-tab"))
      tab.classList.toggle("diagram-alarm",tab.dataset.diagram==="core"?s.dpaxRightExceeded:
        tab.dataset.diagram==="pt"?v.alarms.pt:false);
    $("asgManual").checked=u.asgManual;
    for(const box of document.querySelectorAll("[data-asg-train]")){
      const i=Number(box.dataset.asgTrain),high=s.gv[i].levelPct>90+1e-9;
      const enabled=!high&&(u.asgManual?u.asgTrainEnabled[i]:s.gv[i].asgRunning);
      box.disabled=!u.asgManual||high;box.checked=enabled;
      box.title=high?"Arrêt ASG : niveau GE supérieur à 90 %":"Commande manuelle du train ASG";
      $(`asgTrainStatus${i}`).textContent=high?"HS · niveau haut":enabled?"ES":"HS";
    }
    $("risSource").value=u.risSourceMode;
    $("risManualStatus").textContent=`Pompes : ${u.risPumpMode==="off"?"arrêt manuel":u.risPumpMode==="on"?"marche manuelle":"sur demande IS"} · livré ${fmt(s.risDeliveredKgS,1)} kg/s`;
    $("risManualReserve").textContent=`PTR ${fmt(s.risTankRemainingKg/1000,1)} t · puisard ${fmt(s.sumpKg/1000,1)} t · ${fmt(s.sumpTempC,1)} °C`;
    $("connectRra").disabled=!v.rra.allowed||Boolean(s.endState);
    $("rraConditions").textContent=s.rraConnected?"RRA connecté":v.rra.allowed?"Connexion autorisée":v.rra.reasons.join(" · ");
    const rWorth=u.rodWorthPcm.R;
    const rPcmFromInitial=rWorth*(E.rodIntegral(s.rods.R)-E.rodIntegral(233));
    $("rodWorthStatus").textContent=`R : ${fmt(rWorth)} pcm intégrés (0–260 pas) · position ${fmt(s.rods.R,1)} pas · effet depuis le point initial à 233 pas : ${fmt(rPcmFromInitial,1)} pcm`;
    $("simClock").textContent=tLabel(s.time);
    $("runIndicator").textContent=running?"EN COURS":"EN PAUSE";
    $("runIndicator").classList.toggle("running",running);
    $("runButton").textContent=running?"Pause":"Démarrer";
    renderTransientControls();
    $("g3TargetValue").textContent=s.tripAt===null?fmt(s.g3Target):"—";
    $("g3ActualValue").textContent=s.tripAt===null?fmt(s.g3Count):"—";
    $("rActualValue").textContent=fmt(s.rods.R);
    $("rLimitValue").textContent=fmt(s.rLimitPas);
    $("tavgValue").textContent=fmt(s.tavgC,1);
    $("pzrLevelValue").textContent=fmt(s.pzrLevelPct,1);
    $("rcvFlowValue").textContent=`${fmt(v.chargeM3h,1)} m³/h`;
    $("rcvLetdownValue").textContent=`${fmt(v.letdownM3h,1)} m³/h`;
    $("chargeValue").textContent=`${fmt(regulationActive?s.rcvChargeKgS*3600/E.C.primaryDensityKgM3:u.rcvChargeM3h,1)} m³/h`;
    $("gcpCalibrationValue").textContent=`+${fmt(u.gcpCalibrationPct,1)} % PN`;
    $("sprayActualValue").textContent=
      `${fmt(s.sprayFlowM3h,2)} m³/h (${fmt(s.sprayFlowPct,2)} %)`;
    $("sprayDriveValue").textContent=`${fmt(s.sprayDriveBar,2)} bar`;
    $("gctaSaturationTemp").textContent=`${fmt(E.saturationTemperatureC(u.gctAOpeningPressureBar),1)} °C`;
    if(regulationActive){
      if(!u.rManualOverride){
        $("rManualInput").value=s.rods.R;
        $("rManualValue").textContent=`${fmt(s.rods.R)} pas extraits`;
      }
      for(let i=0;i<4;i++){
        const input=document.querySelector(`#gvFeedControls input[data-kind="manual"][data-gv="${i+1}"]`);
        if(input)input.value=s.gv[i].feedValvePct;
        const output=$(`gvManualOut${i}`);
        if(output)output.textContent=`${fmt(s.gv[i].feedValvePct,1)} %`;
      }
      $("heaterInput").value=s.heaterKW;
      $("heaterValue").textContent=`${fmt(s.heaterKW)} kW`;
      $("sprayInput").value=s.sprayPct;
      $("sprayValue").textContent=`${fmt(s.sprayPct,1)} %`;
      $("chargeInput").value=s.rcvChargeKgS*3600/E.C.primaryDensityKgM3;
    }
    for(let i=0;i<4;i++){
      const output=$(`gvSteamOut${i}`);
      if(output)output.textContent=`${fmt(s.gv[i].steamValvePct,1)} %`;
    }
    document.querySelectorAll("[data-regulated-control]").forEach(input=>{
      input.disabled=input.id==="rManualInput"&&u.allRodsTargetPas!==null
        ||regulationActive&&!(input.id==="rManualInput"&&u.rManualOverride);
    });
    renderManualExtras();
    document.querySelector(".manual-card").classList.toggle("regulated",regulationActive);
    document.querySelectorAll("[data-relief-stage]").forEach(input=>{
      input.checked=Boolean(u.manualReliefStages[Number(input.dataset.reliefStage)]);
    });
    $("reliefStatus").textContent=`Débit réalisé : ${fmt(s.reliefKgS,1)} kg/s · ${s.reliefStages.filter(Boolean).length}/3 étages ouverts · commande manuelle disponible avec CC actif`;
    $("manualModeStatus").textContent=`${regulationActive?"CC-RÉGUL actif · décalibrage et CB manuels":"Commandes manuelles"}${u.rManualOverride?" · R en manuel":""} · ${protectionActive?"protection active":"protection inactive"}`;
    $("toggleRegulationSynoptic").textContent=regulationActive?"Désactiver régulations":"Activer régulations";
    $("toggleRegulationSynoptic").setAttribute("aria-pressed",String(regulationActive));
    $("toggleProtectionSynoptic").textContent=protectionActive?"Désactiver protection":"Activer protection";
    $("toggleProtectionSynoptic").setAttribute("aria-pressed",String(protectionActive));
    $("protectionsEnabled").checked=protectionActive;
    const selectedProgramTitle=document.querySelector(".program-choice.active strong")?.textContent
      ||E.TRANSIENTS[$("transientSelect").value].label;
    if(u.transientPhase==="return")$("programTitle").textContent="Retour progressif à 100 %";
    else if(u.transientPhase==="approach"&&u.transient===$("transientSelect").value)
      $("programTitle").textContent=`Raccordement — ${selectedProgramTitle}`;
    else $("programTitle").textContent=selectedProgramTitle;
    $("programDemand").textContent=`${fmt(s.demandPct,1)} % PN`;
    $("programElectric").textContent=`${fmt(s.electricMW)} MWe`;
    $("transientReadout").innerHTML=[
      ["Puissance cœur",`${fmt(s.powerPct,1)} %`],["TMOY",`${fmt(s.tavgC,1)} °C`],
      ["Pression primaire",`${fmt(s.pressureBar,1)} bar`],["G3",s.tripAt===null?`${fmt(s.g3Count)} pas`:"— (AAR)"]
    ].map(([label,v])=>`<div class="detail-item"><span>${label}</span><strong>${v}</strong></div>`).join("");
    $("accidentStatus").innerHTML=[
      `Brèche : ${fmt(s.breakAreaCm2)} cm² · boucle ${s.breakLoop} ${s.breakBranch}`,
      `Éjection : ${s.ejectWorthPcm?`+${fmt(s.ejectWorthPcm)} pcm`:"aucune"}`,
      `Retrait R : ${s.withdrawalActive?"actif":"non"}`,
      `Tension : ${s.lossOfVoltage?"perdue":"présente"}`,
      `Couverture cœur : ${fmt(s.coveragePct,1)} % (indicateur)`
    ].map(x=>`<span>${x}</span>`).join("");
    renderBoard();renderInventoryBalance();renderSignals();renderAxial();updateSvg();drawCoreCharts();drawHistory();drawLoadProgramChart();
  }

  function bindNumber(id,callback) {
    bindNumericInputs($(id),(value)=>{callback(value);render();});
  }
  function bindNumericInputs(target,callback,selector=null) {
    const getInput=e=>selector
      ? (e.target.matches?.(selector)?e.target:null) : target;
    const readValue=input=>{
      if(!input||input.disabled||String(input.value).trim()==="")return null;
      const value=Number(input.value);
      if(!Number.isFinite(value))return null;
      const min=input.min!==""&&input.min!==undefined?Number(input.min):-Infinity;
      const max=input.max!==""&&input.max!==undefined?Number(input.max):Infinity;
      return Math.max(min,Math.min(max,value));
    };
    const apply=input=>{
      const value=readValue(input);if(value===null)return;
      if(value!==Number(input.value))input.value=String(value);
      callback(value,input);
    };
    for(const event of ["input","change"])
      target.addEventListener(event,e=>apply(getInput(e)));
    target.addEventListener("wheel",e=>{
      const input=getInput(e),value=readValue(input);
      if(value===null||!e.deltaY)return;
      e.preventDefault();
      const configuredStep=Number(input.step);
      const step=Number.isFinite(configuredStep)&&configuredStep>0?configuredStep:1;
      input.value=String(Number((value+(e.deltaY<0?step:-step)).toPrecision(12)));
      apply(input);
    },{passive:false});
  }
  function bindModelParameters() {
    $("asgAvailable").addEventListener("change",event=>{
      model.controls.asgAvailable=event.target.checked;render();
    });
    for(const [id,key] of NUMBER_PARAMETERS)
      bindNumber(id,value=>{
        model.controls[key]=value;
        if(key==="fxYUngraped"||key==="fxYGraped"||key==="xenonEquilibriumWorthPcm")
          E.refreshAxial(model);
        E.refreshReactivity(model);
      });
    bindNumericInputs($("rodWorthControls"),(value,input)=>{
      model.controls.rodWorthPcm[input.dataset.rod]=value;
      E.refreshReactivity(model);render();
    },"input[data-rod]");
    bindNumericInputs($("axialShapeControls"),(value,input)=>{
      model.controls.axialRodAbsorption[input.dataset.axialRod]=value;
      E.refreshAxial(model);render();
    },"input[data-axial-rod]");
  }
  function renderManualExtras() {
    const s=model.state,u=model.controls,mode=E.rcvInjectionMode(model),injecting=mode!=="off";
    $("rManualOverride").checked=u.rManualOverride;
    $("rManualInput").disabled=u.allRodsTargetPas!==null||regulationActive&&!u.rManualOverride;
    $("manualRodPanel").classList.toggle("manual-override-active",u.rManualOverride);
    for(let i=0;i<3;i++){
      const input=document.querySelector(`[data-rcv-orifice="${i}"]`);
      if(input)input.checked=u.rcvLetdownOrifices[i];
      $("rcvOrificeStatus"+i).textContent=u.rcvLetdownOrifices[i]?"ES":"HS";
    }
    const boron=$("rcvBoron");boron.disabled=injecting;
    if(injecting||document.activeElement!==boron)boron.value=E.rcvChargeBoronPpm(model);
    for(const [mode,button,counter] of [["dilution","rcvDilution","rcvDilutionLitres"],
      ["borication","rcvBorication","rcvBoricationLitres"]]){
      $(button).setAttribute("aria-pressed",String(E.rcvInjectionMode(model)===mode));
      $(button).disabled=u.rcvInjectionGraphMode!==null;
      $(button).title=u.rcvInjectionGraphMode!==null?"Commandé par CC-RÉGUL":"";
      $(counter).textContent=`${fmt(s.rcvInjectionLitres[mode],1)} L injectés`;
    }
  }
  function changeManualROverride(enabled) {
    // Suivre la position actuelle dans l'intégrateur R avant de lui rendre la main.
    if(!enabled&&editorReady.regul)dispatchEditor("regul",{
      type:"centurion-editor-tick",dt:0,signals:editorSignals(),rManualOverride:true});
    E.setRManualOverride(model,enabled);
    model.controls.rMode=regulationActive&&!enabled?"graph":"manual";
    $("rManualInput").value=model.controls.rManualPas;
    $("rManualValue").textContent=`${fmt(model.controls.rManualPas)} pas extraits`;
    sendEditorTick(0);render();
  }
  function bindManualExtras() {
    $("rManualOverride").addEventListener("change",e=>changeManualROverride(e.target.checked));
    document.querySelectorAll("[data-rcv-orifice]").forEach(input=>input.addEventListener("change",e=>{
      model.controls.rcvLetdownOrifices[Number(e.target.dataset.rcvOrifice)]=e.target.checked;
      model.state.rcvLetdownKgS=E.rcvLetdownM3h(model)*E.C.primaryDensityKgM3/3600;
      render();
    }));
    const applyBoron=()=>{
      const input=$("rcvBoron");
      if(input.disabled||input.value===""||!Number.isFinite(Number(input.value)))return;
      E.prepareRcvTank(model,0,input.value);render();
    };
    $("rcvBoron").addEventListener("input",applyBoron);
    $("rcvBoron").addEventListener("wheel",e=>{
      const input=$("rcvBoron");if(input.disabled||!e.deltaY)return;
      e.preventDefault();
      input.value=Math.max(0,Math.min(E.C.reaBoronPpm,
        Number(input.value)+(e.deltaY<0?50:-50)));
      applyBoron();
    },{passive:false});
    for(const [id,mode] of [["rcvDilution","dilution"],["rcvBorication","borication"]])
      $(id).addEventListener("click",()=>{
        E.setRcvInjection(model,model.controls.rcvInjectionMode===mode?"off":mode);
        $("rcvBoron").value=E.rcvChargeBoronPpm(model);
        running=true;render();
      });
  }
  function editorSignals() {
    return E.controlSignals(model);
  }
  const editorFrames={regul:"regulationEditor",protect:"protectionEditor"};
  function editorBridge(mode) {
    try{return $(editorFrames[mode]).contentWindow?.CenturionCC||null;}
    catch(_){return null;}
  }
  function dispatchEditor(mode,payload) {
    const bridge=editorBridge(mode);
    if(bridge)return bridge.receive(payload);
    $(editorFrames[mode]).contentWindow?.postMessage(payload,"*");
    return null;
  }
  function sendEditorTick(dt=0) {
    if(pendingCcStep)return;
    // Rafraîchissement d'affichage uniquement : le calcul des CC appartient
    // aux sous-pas physiques, jamais à la cadence de dessin du navigateur.
    const payload={type:"centurion-editor-tick",dt:0,displayOnly:true,signals:editorSignals(),
      rManualOverride:model.controls.rManualOverride||model.controls.allRodsTargetPas!==null};
    for(const mode of ["regul","protect"])
      if(editorReady[mode]){
        const response=dispatchEditor(mode,payload);
        if(response&&!running)applyEditorOutputs(response);
      }
  }
  function advanceControlledStep() {
    if(pendingCcStep)return false;
    const modes=[...(regulationActive?["regul"]:[]),...(protectionActive?["protect"]:[])]
      .filter(mode=>editorReady[mode]);
    E.step(model,0.1);certificate?.observe(model);carry-=0.1;
    if(!modes.length||model.state.endState)return true;
    const tick={id:++ccTickId,modes,responses:{}};
    pendingCcStep=tick;
    const payload={type:"centurion-editor-tick",dt:0.1,refresh:false,tickId:tick.id,
      signals:editorSignals(),
      rManualOverride:model.controls.rManualOverride||model.controls.allRodsTargetPas!==null};
    for(const mode of modes){
      const response=dispatchEditor(mode,payload);
      if(response)tick.responses[mode]=response;
    }
    if(modes.every(mode=>tick.responses[mode]))finishCcStep(tick);
    return true;
  }
  function finishCcStep(tick) {
    // Ordre déterministe : commandes de régulation, puis protections prioritaires.
    for(const mode of tick.modes)applyEditorOutputs(tick.responses[mode]);
    certificate?.observe(model);
    pendingCcStep=null;
  }
  function receiveCcStepOutput(message) {
    const tick=pendingCcStep;
    if(!tick||message.tickId!==tick.id||!tick.modes.includes(message.mode))return;
    tick.responses[message.mode]=message;
    if(tick.modes.every(mode=>tick.responses[mode])){
      finishCcStep(tick);
      // En mode fichier local, poursuivre dès la réponse des deux CC, sans
      // attendre l'image suivante ni avancer avec une commande périmée.
      advanceSimulationTime();
    }
  }
  function advanceSimulationTime() {
    let steps=0;
    while(running&&carry>=0.1&&steps<150&&!model.state.endState){
      if(!advanceControlledStep())break;
      steps++;
      if(model.state.coreDamageWarning&&speed!==1){
        speed=1;$("simSpeed").value="1";carry=0;lastPaint=0;break;
      }
    }
    if(steps===150)carry=Math.min(carry,1);
  }
  function connectEditor(mode,id) {
    if(pendingCcStep?.modes.includes(mode))pendingCcStep=null;
    editorReady[mode]=false;
    const response=dispatchEditor(mode,{type:"centurion-editor-connect"});
    if(response)handleEditorMessage(response);
  }
  function setRegulationActive(enabled,notifyEditor=true){
    regulationActive=Boolean(enabled);
    if(!regulationActive){
      const u=model.controls;
      u.rMode="manual";u.rManualPas=model.state.rods.R;
      u.gvManualFeedPct=model.state.gv.map(g=>g.feedValvePct);
      u.manualHeaterKW=model.state.heaterKW;
      u.manualSprayPct=model.state.sprayPct;
      u.rcvChargeM3h=model.state.rcvChargeKgS*3600/E.C.primaryDensityKgM3;
      u.g3GraphTarget=null;u.gvGraphFeedPct=[null,null,null,null];
      u.pressureGraphHeaterKW=null;u.pressureGraphSprayPct=null;
      u.nrefGraphPct=null;u.turbineLimitGraphPct=null;
      u.rcvChargeGraphM3h=null;
      E.setRcvGraphInjection(model,null,null);
      $("rManualInput").value=u.rManualPas;
    }
    if(notifyEditor&&editorReady.regul)
      dispatchEditor("regul",{type:"centurion-editor-enable",enabled:regulationActive,
        signals:editorSignals(),rManualOverride:model.controls.rManualOverride});
    sendEditorTick(0);
    render();
  }
  function setProtectionActive(enabled,notifyEditor=true){
    protectionActive=Boolean(enabled);
    model.controls.protectionGraphMode=true;
    model.controls.protectionsEnabled=protectionActive;
    if(!protectionActive)model.controls.protectionGraphFluxRatePctS=null;
    if(notifyEditor&&editorReady.protect)
      dispatchEditor("protect",{type:"centurion-editor-enable",enabled:protectionActive,
        signals:editorSignals()});
    sendEditorTick(0);
    render();
  }
  function applyEditorOutputs(message){
    const out=message.outputs||{},u=model.controls;
    if(message.mode==="regul"&&regulationActive&&message.enabled){
      if(u.rManualOverride)u.rMode="manual";
      else if(Number.isFinite(out.posg)){
        u.rMode="graph";u.rGraphPas=Math.max(0,Math.min(260,out.posg));
      }
      u.turbineLimitGraphPct=Number.isFinite(out.turbineLimitOut)
        ? Math.max(0,Math.min(100,out.turbineLimitOut)) : null;
      const actualDemand=E.turbineLoadTargetPct(model);
      const seenDemand=Math.max(0,Math.min(100,actualDemand+u.gcpCalibrationPct));
      u.g3GraphTarget=Number.isFinite(out.g3Out)
        ? out.g3Out+E.g3Target(seenDemand,u.campaign)
          -E.g3Target(seenDemand,"debut") : null;
      for(let i=0;i<4;i++)u.gvGraphFeedPct[i]=Number.isFinite(out[`gv${i+1}Out`])?out[`gv${i+1}Out`]:null;
      u.pressureGraphHeaterKW=Number.isFinite(out.pchauffOut)?out.pchauffOut:null;
      u.pressureGraphSprayPct=Number.isFinite(out.qaspOut)?Math.max(0,Math.min(100,out.qaspOut)):null;
      u.nrefGraphPct=Number.isFinite(out.nrefOut)?out.nrefOut:null;
      u.rcvChargeGraphM3h=Number.isFinite(out.qchargeOut)
        ? Math.max(E.C.rcvSealM3h,Math.min(E.C.rcvNominalM3h,out.qchargeOut)) : null;
      E.setRcvGraphInjection(model,out.boricationOut,out.dilutionOut);
    }
    if(message.mode==="protect"&&protectionActive&&message.enabled){
      u.protectionGraphFluxRatePctS=Number.isFinite(message.fluxRatePctS)?message.fluxRatePctS:null;
      if(out.aarOut>=.5)E.initiate(model,"trip",{source:"cc-protect"});
      if(out.risOut>=.5)E.initiate(model,"ris",{source:"cc-protect"});
      if(out.asgOut>=.5)E.initiate(model,"asg",{source:"cc-protect"});
    }
  }
  function handleEditorMessage(data) {
    if(data?.type==="centurion-editor-ready"){
      const mode=data.mode;
      if(!["regul","protect"].includes(mode))return;
      if(editorReady[mode])return;
      editorReady[mode]=true;
      dispatchEditor(mode,{type:"centurion-editor-enable",
        enabled:mode==="regul"?regulationActive:protectionActive,
        signals:editorSignals(),rManualOverride:model.controls.rManualOverride});
      sendEditorTick(0);
    }
    if(data?.type==="centurion-editor-enabled"){
      if(data.mode==="regul"&&regulationActive!==Boolean(data.enabled))
        setRegulationActive(data.enabled,false);
      if(data.mode==="protect"&&protectionActive!==Boolean(data.enabled))
        setProtectionActive(data.enabled,false);
    }
    if(data?.type==="centurion-editor-outputs"){
      if(data.tickId!==undefined)receiveCcStepOutput(data);
      else if(!running&&!pendingCcStep)applyEditorOutputs(data);
    }
  }
  function bindControls() {
    document.querySelectorAll(".model-tab").forEach(b=>b.addEventListener("click",()=>setModelPage(b.dataset.modelPage)));
    document.querySelectorAll(".model-detail-tab").forEach(b=>b.addEventListener("click",()=>setModelDetailPage(b.dataset.detailPage)));
    $("alarmRows").addEventListener("change",e=>{
      const input=e.target,values=alarmLimits[input.dataset.alarm];
      if(!values)return;
      const i=Number(input.dataset.limit),old=values[i],next=Number(input.value);
      const candidate=[...values];candidate[i]=next;
      const ordered=candidate.filter(v=>v!==null);
      if(!Number.isFinite(next)||ordered.some((v,j)=>j>0&&v<ordered[j-1])){
        input.value=old;$("alarmStatus").textContent="Ordre attendu : rouge bas ≤ orange bas ≤ orange haut ≤ rouge haut.";
        $("alarmStatus").classList.add("error");return;
      }
      values[i]=next;$("alarmStatus").textContent="Seuils appliqués à la surveillance.";
      $("alarmStatus").classList.remove("error");renderBoard();
    });
    $("resetAlarms").addEventListener("click",()=>{
      for(const a of alarmDefaults)alarmLimits[a.id]=[...a.limits];
      renderAlarmTable();renderBoard();$("alarmStatus").textContent="Seuils initiaux rétablis.";
    });
    document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>activateView(b.dataset.view)));
    document.querySelectorAll(".diagram-tab").forEach(b=>b.addEventListener("click",()=>setDiagram(b.dataset.diagram)));
    $("gvSelect").addEventListener("change",e=>setDiagram("gv",Number(e.target.value)));
    $("traceSet").addEventListener("change",drawHistory);
    $("historyGv").addEventListener("change",e=>{
      selectedGv=Number(e.target.value)||1;
      $("gvSelect").value=String(selectedGv);
      drawHistory();
    });
    $("historyWindow").addEventListener("change",drawHistory);
    $("coreTrailWindow").addEventListener("change",drawCoreCharts);
    $("ptTrailWindow").addEventListener("change",updateSvg);
    for(const [id,target] of [["allRodsDown",0],["allRodsUp",260],["allRodsRelease",null]])
      $(id).addEventListener("click",()=>{if(E.commandAllRods(model,target)){if(target!==null)running=true;sendEditorTick(0);render();}});
    $("auxiliarySprayInput").addEventListener("input",e=>{
      model.controls.manualAuxiliarySprayM3h=Number(e.target.value);render();
    });
    $("asgStart").addEventListener("click",()=>{
      model.controls.asgManual=false;E.initiate(model,"asg");render();
    });
    $("asgManual").addEventListener("change",e=>{
      model.controls.asgTrainEnabled=model.state.gv.map(g=>g.asgRunning&&g.levelPct<=90+1e-9);
      model.controls.asgManual=e.target.checked;render();
    });
    for(const box of document.querySelectorAll("[data-asg-train]"))
      box.addEventListener("change",e=>{
        const i=Number(e.target.dataset.asgTrain);
        model.controls.asgTrainEnabled[i]=e.target.checked&&model.state.gv[i].levelPct<=90+1e-9;
        render();
      });
    for(const [id,mode] of [["risPumpStart","on"],["risPumpStop","off"],["risPumpAuto","auto"]])
      $(id).addEventListener("click",()=>{E.setRisOperation(model,mode);render();});
    $("risSource").addEventListener("change",e=>{model.controls.risSourceMode=e.target.value;render();});
    $("connectRra").addEventListener("click",()=>{E.connectRra(model);render();});
    $("historyScrubber").addEventListener("input",e=>{
      historyEndS=Number(e.target.value);
      historyFollowing=historyEndS>=Number(e.target.max);
      drawHistory();
    });
    $("historyLive").addEventListener("click",()=>{historyFollowing=true;drawHistory();});
    $("diagramObject").addEventListener("load",()=>{
      try {svgDoc=$("diagramObject").contentDocument;} catch(_){svgDoc=null;}
      decorateSvg();updateSvg();
    });
    for(const [id,action] of [["diagramZoomOut","out"],["diagramZoomIn","in"],["diagramZoomFit","fit"]])
      $(id).addEventListener("click",()=>$("diagramObject").contentWindow?.postMessage({
        type:"centurion-svg-viewport-command",action},"*"));
    for(const [mode,id] of [["regul","regulationEditor"],["protect","protectionEditor"]])
      $(id).addEventListener("load",()=>connectEditor(mode,id));
    window.addEventListener("message",e=>{
      if(e.source===$("diagramObject").contentWindow&&e.data?.type==="centurion-svg-viewport"
        &&Number.isFinite(e.data.zoom))$("diagramZoomValue").textContent=`${fmt(100*e.data.zoom)} %`;
      if(e.data?.type==="centurion-svg-navigate") setDiagram(e.data.diagram,e.data.gv||selectedGv);
      if(e.data?.type==="centurion-svg-ready") updateSvg();
      handleEditorMessage(e.data);
    });
    $("runButton").addEventListener("click",()=>{if(model.state.endState)return;running=!running;render();});
    $("resetButton").addEventListener("click",()=>{cancelInitiator();running=false;pendingCcStep=null;model=E.make();
      historyFollowing=true;historyEndS=null;
      model.controls.protectionGraphMode=true;
      model.controls.protectionsEnabled=protectionActive;
      carry=0;syncInputs();render();
      const signals=editorSignals();
      for(const [mode,id] of [["regul","regulationEditor"],["protect","protectionEditor"]])
        if(editorReady[mode])dispatchEditor(mode,{type:"centurion-editor-reset",
          enabled:mode==="regul"?regulationActive:protectionActive,signals});
      sendEditorTick(0);
    });
    $("simSpeed").addEventListener("change",e=>{
      speed=model.state.coreDamageWarning?1:Number(e.target.value);e.target.value=String(speed);
    });
    $("demandInput").addEventListener("input",e=>{
      if(E.isTransientActive(model))return;
      model.controls.demandPct=Number(e.target.value);
      $("demandValue").textContent=`${e.target.value} %`;
    });
    $("campaignSelect").addEventListener("change",e=>{model.controls.campaign=e.target.value;render();});
    $("gcpCalibrationInput").addEventListener("input",e=>{
      model.controls.gcpCalibrationPct=Number(e.target.value);
      $("gcpCalibrationValue").textContent=`+${fmt(e.target.value,1)} % PN`;
      render();
    });
    $("rMode").addEventListener("change",e=>{model.controls.rMode=e.target.value;render();});
    $("rManualInput").addEventListener("input",e=>{
      if(regulationActive&&!model.controls.rManualOverride)return;
      model.controls.rManualPas=Number(e.target.value);
      model.controls.rMode="manual";running=true;
      $("rManualValue").textContent=`${e.target.value} pas extraits`;
      render();
    });
    $("chargeInput").addEventListener("input",e=>{model.controls.rcvChargeM3h=Number(e.target.value);
      $("chargeValue").textContent=`${e.target.value} m³/h`;});
    $("halfCycle").addEventListener("change",e=>{model.controls.halfCycle=e.target.value;render();});
    $("gvSetpoint").addEventListener("input",e=>{model.controls.gvLevelSetpointPct=Number(e.target.value);$("gvSetpointValue").textContent=`${e.target.value} %`;});
    $("gvFeedControls").addEventListener("input",e=>{
      const n=Number(e.target.dataset.gv)-1;if(n<0||n>3)return;
      if(e.target.dataset.kind==="steam"){
        model.controls.gvSteamValvePct[n]=Number(e.target.value);
      } else if(e.target.dataset.kind==="manual"){
        model.controls.gvManualFeedPct[n]=Number(e.target.value);
        const output=$(`gvManualOut${n}`);if(output)output.textContent=`${fmt(model.controls.gvManualFeedPct[n])} %`;
      }
    });
    $("heaterInput").addEventListener("input",e=>{model.controls.manualHeaterKW=Number(e.target.value);$("heaterValue").textContent=`${fmt(e.target.value)} kW`;});
    $("sprayInput").addEventListener("input",e=>{model.controls.manualSprayPct=Number(e.target.value);$("sprayValue").textContent=`${e.target.value} %`;});
    document.querySelectorAll("[data-relief-stage]").forEach(input=>input.addEventListener("change",e=>{
      model.controls.manualReliefStages[Number(e.target.dataset.reliefStage)]=e.target.checked;render();
    }));
    bindManualExtras();
    $("protectionsEnabled").addEventListener("change",e=>setProtectionActive(e.target.checked));
    $("toggleRegulationSynoptic").addEventListener("click",()=>setRegulationActive(!regulationActive));
    $("toggleProtectionSynoptic").addEventListener("click",()=>setProtectionActive(!protectionActive));
    $("risEnabled").addEventListener("change",e=>{model.controls.risEnabled=e.target.checked;render();});
    $("forceTrip").addEventListener("click",()=>{E.initiate(model,"trip");render();});
    $("forceRis").addEventListener("click",()=>{E.initiate(model,"ris");render();});
    bindModelParameters();
    for(const [id,key,i] of [["mpA","mpTrainEnabled",0],["mpB","mpTrainEnabled",1],
      ["bpA","bpTrainEnabled",0],["bpB","bpTrainEnabled",1]])
      $(id).addEventListener("change",e=>{model.controls[key][i]=e.target.checked;render();});
    $("cancelInitiator").addEventListener("click",cancelInitiator);
    $("startBreak").addEventListener("click",()=>scheduleInitiator("break",{areaCm2:$("breakArea").value,
      loop:$("breakLoop").value,branch:$("breakBranch").value},"Brèche primaire"));
    $("isolateBreak").addEventListener("click",()=>{if(pendingInitiator?.name==="break")cancelInitiator();
      E.initiate(model,"break",{areaCm2:0,
      loop:$("breakLoop").value,branch:$("breakBranch").value});render();});
    $("startEjection").addEventListener("click",()=>scheduleInitiator("ejection",{worthPcm:$("ejectionWorth").value},"Éjection de grappe"));
    $("startWithdrawal").addEventListener("click",()=>scheduleInitiator("withdrawal",{},"Retrait R intempestif"));
    $("startVoltage").addEventListener("click",()=>scheduleInitiator("voltage",{},"Perte des alimentations électriques"));
    document.querySelectorAll(".program-choice").forEach(button=>button.addEventListener("click",()=>{
      document.querySelectorAll(".program-choice").forEach(b=>b.classList.toggle("active",b===button));
      $("transientSelect").value=button.dataset.program;
      $("programTitle").textContent=button.querySelector("strong").textContent;
      drawLoadProgramChart();
    }));
    $("startTransient").addEventListener("click",()=>{E.startTransient(model,$("transientSelect").value);
      running=true;render();});
    $("stopTransient").addEventListener("click",()=>{E.startTransient(model,"off");
      running=true;render();});
    $("pauseTransient").addEventListener("click",()=>{E.pauseTransient(model);render();});
    $("resumeTransient").addEventListener("click",()=>{E.resumeTransient(model);running=true;render();});
    $("interruptTransient").addEventListener("click",()=>{E.interruptTransient(model);render();});
    window.addEventListener("resize",()=>{drawCoreCharts();drawHistory();drawLoadProgramChart();});
  }
  function syncInputs() {
    const u=model.controls;
    $("asgAvailable").checked=u.asgAvailable;
    $("demandInput").value=u.demandPct;
    $("campaignSelect").value=u.campaign;
    $("rMode").value=u.rMode;
    $("rManualInput").value=u.rManualPas;
    $("rManualValue").textContent=`${u.rManualPas} pas extraits`;
    $("gcpCalibrationInput").value=u.gcpCalibrationPct;
    $("gcpCalibrationValue").textContent=`+${fmt(u.gcpCalibrationPct,1)} % PN`;
    $("halfCycle").value=u.halfCycle;
    $("gvSetpoint").value=u.gvLevelSetpointPct;
    $("gvSetpointValue").textContent=`${u.gvLevelSetpointPct} %`;
    $("gvFeedControls").innerHTML=[1,2,3,4].map((n)=>`<div class="feed-block"><strong>GV ${n}</strong>
      <label>Vanne ARE <output id="gvManualOut${n-1}">${fmt(u.gvManualFeedPct[n-1],1)} %</output>
      <input type="range" data-regulated-control data-kind="manual" data-gv="${n}" min="0" max="100" step="0.1" value="${u.gvManualFeedPct[n-1]}"></label>
      <label>VVP${n}20VV · ouverture <output id="gvSteamOut${n-1}">${fmt(model.state.gv[n-1].steamValvePct,1)} %</output>
      <input type="range" data-kind="steam" data-gv="${n}" min="0" max="100" step="1" value="${u.gvSteamValvePct[n-1]}"></label></div>`).join("");
    $("heaterInput").value=u.manualHeaterKW;
    $("heaterValue").textContent=`${fmt(u.manualHeaterKW)} kW`;
    $("sprayInput").value=u.manualSprayPct;
    $("auxiliarySprayInput").value=u.manualAuxiliarySprayM3h;
    $("sprayValue").textContent=`${fmt(u.manualSprayPct,1)} %`;
    $("chargeInput").value=u.rcvChargeM3h;
    $("chargeValue").textContent=`${fmt(u.rcvChargeM3h,1)} m³/h`;
    $("rcvBoron").value=u.rcvTankBoronPpm;
    $("protectionsEnabled").checked=u.protectionsEnabled;
    $("risEnabled").checked=u.risEnabled;
    for(const [id,key] of NUMBER_PARAMETERS)
      $(id).value=u[key];
    for(const [id,key,i] of [["mpA","mpTrainEnabled",0],["mpB","mpTrainEnabled",1],
      ["bpA","bpTrainEnabled",0],["bpB","bpTrainEnabled",1]])$(id).checked=u[key][i];
    $("rodWorthControls").innerHTML=E.ROD_NAMES.map(name=>`<label>${name} · pcm
      <input type="number" data-rod="${name}" min="0" max="3000" step="25" value="${u.rodWorthPcm[name]}"></label>`).join("");
    $("axialShapeControls").innerHTML=Object.keys(E.AXIAL_ROD_ABSORPTION).map(name=>
      `<label>${name} · coefficient de forme<input type="number" data-axial-rod="${name}"
        min="0" max="1" step="0.001" value="${u.axialRodAbsorption[name]}"></label>`).join("");
  }
  function frame(now) {
    const elapsed=Math.min(.15,Math.max(0,(now-last)/1000));last=now;
    if(running){
      // Borner aussi le retard du raccordement local par messages.
      carry=Math.min(30,carry+elapsed*speed);
      advanceSimulationTime();
    }
    if(now-lastPaint>120){sendEditorTick(0);render();lastPaint=now;}
    requestAnimationFrame(frame);
  }
  model.controls.protectionGraphMode=true;
  model.controls.protectionsEnabled=protectionActive;
  renderAlarmTable();bindControls();syncInputs();render();
  for(const [mode,id] of [["regul","regulationEditor"],["protect","protectionEditor"]])connectEditor(mode,id);
  requestAnimationFrame(frame);
})();
