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
  const names={rcp:"RCP · quatre boucles",pzr:"Pressuriseur",rods:"Position des grappes",gv:"Générateur de vapeur"};
  const svgFiles={rcp:"synoptiques/synoptique-RCP-1300.svg",pzr:"synoptiques/synoptique-RCPPZR-1300.svg",
    rods:"synoptiques/synoptique-RCPGRAPPES-1300.svg",gv:"synoptiques/synoptique-RCPGV-1300.svg"};
  const signalDefs=[
    ["voltageLoss","Manque de tension","AAR immédiat · GMPP et ARE ralentissent","trip"],
    ["lowPressure","Pression primaire basse","AAR sous le seuil d’étude","trip"],
    ["highFluxAlarm","Puissance ≥ 102 %","Préalarme de puissance nucléaire","warn"],
    ["highFluxTrip","Haut flux nucléaire","AAR par haut flux de puissance","trip"],
    ["rapidFluxRise","Flux en hausse rapide","AAR par variation positive","trip"],
    ["rapidFluxFall","Flux en baisse rapide","AAR par variation négative","trip"],
    ["risLowPressure","Pression d’IS basse","Demande d’injection de sécurité","warn"],
    ["rBelowLimit","R sous son IL","Surveillance de la position du groupe R","warn"]
  ];
  let model=E.make(),running=false,speed=20,last=performance.now(),carry=0;
  let diagram="rcp",selectedGv=1,activeView="synoptiques",svgDoc=null;
  let regulationActive=false,protectionActive=true;
  const alarmDefaults=[
    {id:"boardPower",tag:"POW1",unit:"% PN",limits:[null,null,102,109],value:s=>s.powerPct},
    {id:"boardPressure",tag:"002MP",unit:"bar",limits:[130,150,160,165],value:s=>s.pressureBar},
    {id:"boardPzrLevel",tag:"003MN",unit:"%",limits:[15,20,70,80],value:s=>s.pzrLevelPct},
    {id:"boardHot",tag:"101MT",unit:"°C",limits:[null,null,335,345],value:(s,g,l)=>l.hotC},
    {id:"boardCold",tag:"102MT",unit:"°C",limits:[null,null,300,310],value:(s,g,l)=>l.coldC},
    {id:"boardGvPressure",tag:"104MP",unit:"bar",limits:[null,null,85,90],value:(s,g)=>g.pressureBar},
    {id:"boardGvLevel",tag:"105MN",unit:"%",limits:[15,25,75,85],value:(s,g)=>g.levelPct},
    {id:"boardPline",tag:"PLIN",unit:"W/cm",limits:[null,null,360,379],value:s=>s.peakLinearWcm},
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
    if(name==="graphiques") drawHistory();
    if(name==="transitoires") drawLoadProgramChart();
  }
  function setDiagram(name,gv=selectedGv) {
    if(!svgFiles[name]) return;
    selectedGv=Number(gv)||1;
    $("gvSelect").value=String(selectedGv);
    const changed=diagram!==name;
    diagram=name;
    document.querySelectorAll(".diagram-tab").forEach(b=>b.classList.toggle("active",b.dataset.diagram===name));
    $("gvSelect").disabled=name!=="gv";
    if(changed) {
      svgDoc=null;
      $("diagramObject").data=svgFiles[name];
    } else {
      decorateSvg();
      updateSvg();
    }
    renderBoard();
    if(activeView!=="synoptiques") activateView("synoptiques");
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
  function setSvgText(id,value) {
    const node=svgDoc?.getElementById(id);
    if(node) node.textContent=value;
  }
  function updateSvg() {
    const s=model.state;
    if(svgDoc && diagram==="rods") {
      setSvgText("puissance-electrique",`${fmt(s.powerPct,1)} %`);
      setSvgText("compteur-g3",s.tripAt===null?fmt(s.g3Count):"—");
      for(const name of E.ROD_NAMES) {
        const p=s.rods[name];
        setSvgText(`position-${name}`,fmt(p));
        const g=svgDoc.getElementById(`groupe-${name}`);
        if(g) g.setAttribute("data-position-pas-extraits",p.toFixed(1));
        const fill=svgDoc.getElementById(`remplissage-${name}`);
        if(fill) fill.setAttribute("height",String(Math.max(0,360*(260-p)/260)));
      }
      const y=383+360*(260-s.rLimitPas)/260;
      const line=svgDoc.getElementById("limite-R");
      if(line) line.setAttribute("d",`M146.5 ${y.toFixed(2)}H233.5`);
      const label=svgDoc.getElementById("valeur-limite-R");
      if(label){label.setAttribute("y",String(y-11));label.textContent=`IL ${fmt(s.rLimitPas)}`;}
    }
    try { $("diagramObject").contentWindow?.postMessage({type:"centurion-state",
      diagram,gv:selectedGv,power:s.powerPct,demand:s.demandPct,pressure:s.pressureBar,
      pzrLevel:s.pzrLevelPct,nref:s.nrefPct,sprayPct:s.sprayPct,
      heaterKW:s.heaterKW,
      pzrTempC:344.79+0.23*(s.pressureBar-155),
      hotC:s.hotC,coldC:s.coldC,tRicC:s.tRicC,
      boron:s.boronPpm,g3:s.g3Count,rods:s.rods,
      steamKgS:s.totalSteamKgS,turbinePct:s.turbinePct,thermalMW:s.thermalPowerMW,
      electricMW:s.electricMW,tripAt:s.tripAt,reliefStages:s.reliefStages,reliefKgS:s.reliefKgS,
      rLimit:s.rLimitPas,halfCycle:model.controls.halfCycle,
      gvState:s.gv[selectedGv-1],gvAll:s.gv,gvSetpoint:model.controls.gvLevelSetpointPct,
      loops:s.loops,tavgC:s.tavgC,
      risDelivered:s.risDeliveredKgS},"*"); } catch(_) {}
  }
  function renderBoard() {
    const s=model.state,g=s.gv[selectedGv-1],l=s.loops[selectedGv-1];
    const show=(id,value)=>{$(id).textContent=value;};
    show("boardPower",`${fmt(s.powerPct,1)} %`);
    show("boardPressure",`${fmt(s.pressureBar,1)} bar`);
    show("boardPzrLevel",`${fmt(s.pzrLevelPct,1)} %`);
    show("boardHot",`${fmt(l.hotC,1)} °C`);
    show("boardCold",`${fmt(l.coldC,1)} °C`);
    show("boardGvPressure",`${fmt(g.pressureBar,1)} bar`);
    show("boardGvLevel",`${fmt(g.levelPct,1)} %`);
    show("boardFeed",`${fmt(g.feedKgS)} kg/s`);
    show("boardSteam",`${fmt(g.steamKgS)} kg/s`);
    show("boardElectric",`${fmt(s.electricMW)} MWe`);
    show("boardGvTemp",`${fmt(g.tempC,1)} °C`);
    show("boardFeedTemp","245 °C");
    show("boardReactivity",`${fmt(s.reactivityPcm,1)} pcm`);
    show("boardTavg",`${fmt(s.tavgC,1)} °C`);
    show("boardTref",`${fmt(s.trefC,1)} °C`);
    show("boardNref",`${fmt(s.nrefPct,1)} %`);
    show("boardThermal",`${fmt(s.thermalPowerMW)} MWth`);
    show("boardPline",`${fmt(s.peakLinearWcm)} W/cm`);
    show("boardDnBr",fmt(s.dnbr,2));
    show("boardBoron",`${fmt(s.boronPpm)} ppm`);
    show("boardTurbine",`${fmt(s.turbinePct,1)} %`);
    show("boardPzrTemp",`${fmt(344.79+.23*(s.pressureBar-155),1)} °C`);
    show("boardFuel",`${fmt(s.fuelC)} °C`);
    show("boardSubcool",`${fmt(s.subcoolingC,1)} °C`);
    show("boardGvPower",`${fmt(s.totalGvMW)} MWth`);
    show("boardPrimaryFlow",`${fmt(s.coreFlowFraction*100)} %`);
    show("boardCharge",`${fmt(s.rcvChargeKgS*3600/E.C.primaryDensityKgM3,1)} m³/h`);
    show("boardImmersion",`${fmt(Math.min(100,s.pzrLevelPct/15*100))} %`);
    show("boardRelief",`${fmt(s.reliefKgS,1)} kg/s · ${s.reliefStages.filter(Boolean).length}/3`);
    show("boardR",`${fmt(s.rods.R)} pas`);
    show("boardG3",s.tripAt===null?`${fmt(s.g3Count)} pas`:"— (AAR)");
    show("boardAreValve",`${fmt(g.feedValvePct)} %`);
    show("boardHeater",`${fmt(s.heaterKW)} kW`);
    show("boardSpray",`${fmt(s.sprayFlowM3h,2)} m³/h`);
    show("boardLetdown",`${fmt(s.rcvLetdownKgS*3600/E.C.primaryDensityKgM3,1)} m³/h`);
    const n=selectedGv;
    for(const [id,label] of [["boardGvPressure",`${n}04MP`],["boardGvLevel",`${n}05MN`],
      ["boardFeed",`ARE${n}01MD`],["boardSteam",`VAP${n}`],
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
  function renderSignals() {
    const s=model.state,u=model.controls;
    const details={
      voltageLoss:s.lossOfVoltage?"Tension absente":"Tension présente",
      lowPressure:`${fmt(s.pressureBar,1)} / ${fmt(u.tripLowPressureBar)} bar`,
      highFluxAlarm:`${fmt(s.powerPct,1)} / ${fmt(u.fluxPrealarmPct)} %`,
      highFluxTrip:`${fmt(s.powerPct,1)} / ${fmt(u.tripHighFluxPct)} %`,
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
  function drawHistory() {
    if(activeView!=="graphiques")return;
    const canvas=$("historyChart"),rect=canvas.getBoundingClientRect();
    const dpr=window.devicePixelRatio||1,w=Math.max(300,rect.width),h=Math.max(220,rect.height);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const left=42,right=w-18,top=18,bottom=h-31;
    ctx.fillStyle="#fbfdff";ctx.fillRect(0,0,w,h);
    ctx.strokeStyle="#dfebf1";ctx.lineWidth=1;
    for(let j=0;j<=4;j++){
      const y=top+j*(bottom-top)/4;
      ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
      ctx.fillStyle="#7890a0";ctx.font="11px Arial";ctx.fillText(`${100-j*25}%`,3,y+4);
    }
    const s=model.state,points=s.history,end=s.time,start=Math.max(0,end-300),span=Math.max(30,end-start);
    const traces={
      powers:[["Puissance cœur / 130 % PN","#159ec3",p=>p.power/130],["Réseau / 1 300 MWe","#f09a4b",p=>p.electric/1300]],
      temperatures:[["TMOY / 360 °C","#159ec3",p=>p.tavg/360],["TCRA / 1 200 °C","#ec684b",p=>p.fuel/1200]],
      pressures:[["Pression primaire / 180 bar","#ec684b",p=>p.pressure/180]],
      levels:[["Niveau GV / 100 %","#55a579",p=>p.gv[selectedGv-1]/100],["RGL001MM / 260 pas","#a466c8",p=>p.r/260]],
      flows:[["RIS / 600 kg/s","#55a579",p=>p.ris/600],["Brèche / 600 kg/s","#ec684b",p=>p.break/600]]
    };
    const chosen=traces[$("traceSet").value]||traces.powers;
    $("historyLegend").innerHTML=chosen.map(([label,color])=>`<span><i style="background:${color}"></i>${label}</span>`).join("");
    for(const [,color,norm] of chosen){
      ctx.beginPath();let started=false;
      for(const p of points){if(p.t<start)continue;
        const x=left+(p.t-start)/span*(right-left);
        const y=bottom-Math.max(0,Math.min(1,norm(p)))*(bottom-top);
        if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);
      }
      ctx.strokeStyle=color;ctx.lineWidth=2.2;ctx.stroke();
    }
    ctx.fillStyle="#607b8b";ctx.font="11px Arial";
    ctx.fillText(`${fmt(start)} s`,left,bottom+18);ctx.fillText(`${fmt(end)} s`,right-48,bottom+18);
    const reactivity=$("reactivityChart"),rh=Math.max(105,reactivity.getBoundingClientRect().height);
    reactivity.width=Math.round(w*dpr);reactivity.height=Math.round(rh*dpr);
    const rc=reactivity.getContext("2d");rc.setTransform(dpr,0,0,dpr,0,0);
    rc.fillStyle="#fbfdff";rc.fillRect(0,0,w,rh);
    rc.strokeStyle="#dce8ee";rc.beginPath();rc.moveTo(left,rh/2);rc.lineTo(right,rh/2);rc.stroke();
    rc.fillStyle="#607b8b";rc.font="11px Arial";rc.fillText("Réactivité (pcm)",left,13);
    rc.beginPath();let started=false;
    for(const p of points){if(p.t<start)continue;
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
    if(u.transient===name&&u.transientPhase==="run"){
      const elapsed=Math.max(0,s.time-u.transientStartS);
      const x=left+Math.min(1,elapsed/duration)*(right-left);
      ctx.strokeStyle="#ec684b";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();}
    ctx.fillStyle="#6b8594";ctx.font="11px Arial";ctx.fillText("0",left,bottom+18);
    ctx.fillText(`${fmt(duration/60)} min`,right-42,bottom+18);
  }
  function render() {
    const s=model.state,u=model.controls;
    const rWorth=u.rodWorthPcm.R;
    const rPcmFromInitial=rWorth*(E.rodIntegral(s.rods.R)-E.rodIntegral(220));
    $("rodWorthStatus").textContent=`R : ${fmt(rWorth)} pcm intégrés (0–260 pas) · position ${fmt(s.rods.R,1)} pas · effet depuis le point initial à 220 pas : ${fmt(rPcmFromInitial,1)} pcm`;
    $("simClock").textContent=tLabel(s.time);
    $("runIndicator").textContent=running?"EN COURS":"EN PAUSE";
    $("runIndicator").classList.toggle("running",running);
    $("runButton").textContent=running?"Pause":"Démarrer";
    $("demandValue").textContent=`${fmt(s.demandPct)} %`;
    $("g3TargetValue").textContent=s.tripAt===null?fmt(s.g3Target):"—";
    $("g3ActualValue").textContent=s.tripAt===null?fmt(s.g3Count):"—";
    $("rActualValue").textContent=fmt(s.rods.R);
    $("rLimitValue").textContent=fmt(s.rLimitPas);
    $("tavgValue").textContent=fmt(s.tavgC,1);
    $("pzrLevelValue").textContent=fmt(s.pzrLevelPct,1);
    $("rcvFlowValue").textContent=`${fmt(s.rcvChargeKgS*3600/E.C.primaryDensityKgM3,1)} m³/h`;
    $("rcvLetdownValue").textContent=`${fmt(s.rcvLetdownKgS*3600/E.C.primaryDensityKgM3,1)} m³/h`;
    $("chargeValue").textContent=`${fmt(regulationActive?s.rcvChargeKgS*3600/E.C.primaryDensityKgM3:u.rcvChargeM3h,1)} m³/h`;
    $("gcpCalibrationValue").textContent=`+${fmt(u.gcpCalibrationPct,1)} % PN`;
    $("sprayActualValue").textContent=
      `${fmt(s.sprayFlowM3h,2)} m³/h (${fmt(s.sprayFlowPct,2)} %)`;
    $("sprayDriveValue").textContent=`${fmt(s.sprayDriveBar,2)} bar`;
    if(regulationActive){
      $("rManualInput").value=s.rods.R;
      $("rManualValue").textContent=`${fmt(s.rods.R)} pas extraits`;
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
    document.querySelectorAll("[data-regulated-control]").forEach(input=>{input.disabled=regulationActive;});
    document.querySelector(".manual-card").classList.toggle("regulated",regulationActive);
    document.querySelectorAll("[data-relief-stage]").forEach(input=>{
      input.checked=Boolean(u.manualReliefStages[Number(input.dataset.reliefStage)]);
    });
    $("manualModeStatus").textContent=`${regulationActive?"CC-RÉGUL actif · décalibrage et CB manuels":"Commandes manuelles"} · ${protectionActive?"protection active":"protection inactive"}`;
    $("toggleRegulationSynoptic").textContent=regulationActive?"Désactiver régulations":"Activer régulations";
    $("toggleRegulationSynoptic").setAttribute("aria-pressed",String(regulationActive));
    $("toggleProtectionSynoptic").textContent=protectionActive?"Désactiver protection":"Activer protection";
    $("toggleProtectionSynoptic").setAttribute("aria-pressed",String(protectionActive));
    $("protectionsEnabled").checked=protectionActive;
    $("transientState").textContent=u.transientPhase==="return"?"Retour à 100 %"
      :u.transientPhase==="approach"?"Raccordement au point initial"
      :u.transient==="off"?"Aucun programme":E.TRANSIENTS[u.transient].label;
    const selectedProgramTitle=document.querySelector(".program-choice.active strong")?.textContent
      ||E.TRANSIENTS[$("transientSelect").value].label;
    if(u.transientPhase==="return")$("programTitle").textContent="Retour progressif à 100 %";
    else if(u.transientPhase==="approach"&&u.transient===$("transientSelect").value)
      $("programTitle").textContent=`Raccordement — ${selectedProgramTitle}`;
    else $("programTitle").textContent=selectedProgramTitle;
    $("programDemand").textContent=`${fmt(s.demandPct,1)} % PN`;
    $("programElapsed").textContent=tLabel(u.transientPhase==="run"?s.time-u.transientStartS:0);
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
    renderBoard();renderSignals();renderAxial();updateSvg();drawHistory();drawLoadProgramChart();
  }

  function bindNumber(id,callback) {
    $(id).addEventListener("change",e=>{callback(Number(e.target.value));render();});
  }
  function editorSignals() {
    const s=model.state,g=s.gv,u=model.controls;
    const values={
      ptur:[s.turbinePct,"%"],pdem:[s.demandPct,"%"],pow1:[s.powerPct,"% PN"],
      mt1Signal:[s.hotC,"°C"],mt2Signal:[s.coldC,"°C"],
      mp1Signal:[s.pressureBar,"bar abs."],mn1Signal:[s.pzrLevelPct,"%"],
      pow2Signal:[s.electricMW,"MWe"],mt3Signal:[g[0].tempC,"°C"],
      mt4Signal:[245,"°C"],md1Signal:[s.totalSteamKgS/1000,"t/s"],
      mp2Signal:[g[0].pressureBar,"bar abs."],
      pthcSignal:[100*s.thermalPowerMW/E.C.nominalThermalMW,"% PN"],
      pgvSignal:[100*s.totalGvMW/E.C.nominalThermalMW,"% PN"],
      tmoy:[s.tavgC,"°C"],tpzrSignal:[344.79+.23*(s.pressureBar-155),"°C"],
      reacSignal:[s.reactivityPcm,"pcm"],tfuelSignal:[s.fuelC,"°C"],
      plinSignal:[s.peakLinearWcm,"W/cm"],
      qpriSignal:[100*s.coreFlowFraction,"% nominal"],
      qchaSignal:[s.rcvChargeKgS*3600/E.C.primaryDensityKgM3,"m³/h"],
      qdecSignal:[s.rcvLetdownKgS*3600/E.C.primaryDensityKgM3,"m³/h"],
      nrefSignal:[s.nrefPct,"%"],imchSignal:[100,"%"],qsvpSignal:[s.reliefKgS,"kg/s"],
      posgSignal:[s.rods.R,"pas extraits"],
      posgInternalPct:[100*(260-s.rods.R)/260,"% insertion"],
      gcpPowerSignal:[Math.min(100,s.demandPct+u.gcpCalibrationPct),"% PN"],
      gvSetpointSignal:[u.gvLevelSetpointPct,"%"],
      g3CountSignal:[s.g3Count,"pas"],voltageSignal:[s.lossOfVoltage?1:0,"TOR"],
      fluxRateSignal:[s.fluxRatePctS,"% PN/s"]
    };
    for(let i=0;i<4;i++){
      values[`gv${i+1}LevelSignal`]=[g[i].levelPct,"%"];
      values[`gv${i+1}SteamSignal`]=[g[i].steamKgS,"kg/s"];
    }
    return values;
  }
  function sendEditorTick(dt=0) {
    const payload={type:"centurion-editor-tick",dt,signals:editorSignals()};
    for(const [mode,id] of [["regul","regulationEditor"],["protect","protectionEditor"]])
      if(editorReady[mode])$(id).contentWindow?.postMessage(payload,"*");
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
      u.nrefGraphPct=null;
      u.rcvChargeGraphM3h=null;
      $("rManualInput").value=u.rManualPas;
    }
    if(notifyEditor&&editorReady.regul)
      $("regulationEditor").contentWindow.postMessage({type:"centurion-editor-enable",enabled:regulationActive},"*");
    render();
  }
  function setProtectionActive(enabled,notifyEditor=true){
    protectionActive=Boolean(enabled);
    model.controls.protectionGraphMode=true;
    model.controls.protectionsEnabled=protectionActive;
    if(!protectionActive)model.controls.protectionGraphFluxRatePctS=null;
    if(notifyEditor&&editorReady.protect)
      $("protectionEditor").contentWindow.postMessage({type:"centurion-editor-enable",enabled:protectionActive},"*");
    render();
  }
  function applyEditorOutputs(message){
    const out=message.outputs||{},u=model.controls;
    if(message.mode==="regul"&&regulationActive&&message.enabled){
      if(Number.isFinite(out.posg)){
        u.rMode="graph";u.rGraphPas=Math.max(0,Math.min(260,out.posg));
      }
      const actualDemand=Math.max(0,Math.min(100,model.state.demandPct));
      const seenDemand=Math.max(0,Math.min(100,actualDemand+u.gcpCalibrationPct));
      u.g3GraphTarget=Number.isFinite(out.g3Out)
        ? out.g3Out+E.g3Target(seenDemand,u.campaign)
          -E.g3Target(seenDemand,"debut") : null;
      for(let i=0;i<4;i++)u.gvGraphFeedPct[i]=Number.isFinite(out[`gv${i+1}Out`])?out[`gv${i+1}Out`]:null;
      u.pressureGraphHeaterKW=Number.isFinite(out.pchauffOut)?out.pchauffOut:null;
      u.pressureGraphSprayPct=Number.isFinite(out.qaspOut)?Math.max(0,Math.min(100,out.qaspOut)):null;
      u.nrefGraphPct=Number.isFinite(out.nrefOut)?out.nrefOut:null;
      u.rcvChargeGraphM3h=Number.isFinite(out.qchargeOut)?Math.max(0,Math.min(30,out.qchargeOut)):null;
    }
    if(message.mode==="protect"&&protectionActive&&message.enabled){
      u.protectionGraphFluxRatePctS=Number.isFinite(message.fluxRatePctS)?message.fluxRatePctS:null;
      if(out.aarOut>=.5)E.initiate(model,"trip",{source:"cc-protect"});
      if(out.risOut>=.5)E.initiate(model,"ris",{source:"cc-protect"});
    }
  }
  function bindControls() {
    document.querySelectorAll(".model-tab").forEach(b=>b.addEventListener("click",()=>setModelPage(b.dataset.modelPage)));
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
    $("diagramObject").addEventListener("load",()=>{
      try {svgDoc=$("diagramObject").contentDocument;} catch(_){svgDoc=null;}
      decorateSvg();updateSvg();
    });
    window.addEventListener("message",e=>{
      if(e.data?.type==="centurion-svg-navigate") setDiagram(e.data.diagram,e.data.gv||selectedGv);
      if(e.data?.type==="centurion-svg-ready") updateSvg();
      if(e.data?.type==="centurion-editor-ready"){
        const mode=e.data.mode;
        if(!["regul","protect"].includes(mode))return;
        editorReady[mode]=true;
        const frame=$(mode==="regul"?"regulationEditor":"protectionEditor");
        frame.contentWindow.postMessage({type:"centurion-editor-enable",
          enabled:mode==="regul"?regulationActive:protectionActive},"*");
        sendEditorTick(0);
      }
      if(e.data?.type==="centurion-editor-enabled"){
        if(e.data.mode==="regul"&&regulationActive!==Boolean(e.data.enabled))
          setRegulationActive(e.data.enabled,false);
        if(e.data.mode==="protect"&&protectionActive!==Boolean(e.data.enabled))
          setProtectionActive(e.data.enabled,false);
      }
      if(e.data?.type==="centurion-editor-outputs")applyEditorOutputs(e.data);
    });
    $("runButton").addEventListener("click",()=>{running=!running;render();});
    $("resetButton").addEventListener("click",()=>{running=false;model=E.make();
      model.controls.protectionGraphMode=true;
      model.controls.protectionsEnabled=protectionActive;
      carry=0;syncInputs();render();
      const signals=editorSignals();
      for(const [mode,id] of [["regul","regulationEditor"],["protect","protectionEditor"]])
        if(editorReady[mode])$(id).contentWindow.postMessage({type:"centurion-editor-reset",
          enabled:mode==="regul"?regulationActive:protectionActive,signals},"*");
      sendEditorTick(0);
    });
    $("simSpeed").addEventListener("change",e=>{speed=Number(e.target.value);});
    $("demandInput").addEventListener("input",e=>{model.controls.demandPct=Number(e.target.value);$("demandValue").textContent=`${e.target.value} %`;});
    $("campaignSelect").addEventListener("change",e=>{model.controls.campaign=e.target.value;render();});
    $("gcpCalibrationInput").addEventListener("input",e=>{
      model.controls.gcpCalibrationPct=Number(e.target.value);
      $("gcpCalibrationValue").textContent=`+${fmt(e.target.value,1)} % PN`;
      render();
    });
    $("rMode").addEventListener("change",e=>{model.controls.rMode=e.target.value;render();});
    $("rManualInput").addEventListener("input",e=>{
      model.controls.rManualPas=Number(e.target.value);
      if(!regulationActive){model.controls.rMode="manual";running=true;}
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
    $("rcvBoron").addEventListener("change",e=>{
      E.prepareRcvTank(model,0,e.target.value);render();
    });
    $("protectionsEnabled").addEventListener("change",e=>setProtectionActive(e.target.checked));
    $("toggleRegulationSynoptic").addEventListener("click",()=>setRegulationActive(!regulationActive));
    $("toggleProtectionSynoptic").addEventListener("click",()=>setProtectionActive(!protectionActive));
    $("risEnabled").addEventListener("change",e=>{model.controls.risEnabled=e.target.checked;render();});
    $("forceTrip").addEventListener("click",()=>{E.initiate(model,"trip");render();});
    $("forceRis").addEventListener("click",()=>{E.initiate(model,"ris");render();});
    for(const [id,key] of [["tripPressure","tripLowPressureBar"],["risPressure","risLowPressureBar"],
      ["fluxAlarm","fluxPrealarmPct"],["fluxTrip","tripHighFluxPct"],["fluxRateTrip","tripFluxRatePctS"],
      ["risBoron","risBoronPpm"],["mpScale","risMpScale"],["bpScale","risBpScale"],
      ["fxyUngraped","fxYUngraped"],["fxyGraped","fxYGraped"],["xenonScale","timeScaleXenon"]])
      bindNumber(id,v=>{model.controls[key]=v;});
    for(const [id,key,i] of [["mpA","mpTrainEnabled",0],["mpB","mpTrainEnabled",1],
      ["bpA","bpTrainEnabled",0],["bpB","bpTrainEnabled",1]])
      $(id).addEventListener("change",e=>{model.controls[key][i]=e.target.checked;render();});
    $("startBreak").addEventListener("click",()=>{E.initiate(model,"break",{areaCm2:$("breakArea").value,
      loop:$("breakLoop").value,branch:$("breakBranch").value});render();});
    $("isolateBreak").addEventListener("click",()=>{E.initiate(model,"break",{areaCm2:0,
      loop:$("breakLoop").value,branch:$("breakBranch").value});render();});
    $("startEjection").addEventListener("click",()=>{E.initiate(model,"ejection",{worthPcm:$("ejectionWorth").value});render();});
    $("startWithdrawal").addEventListener("click",()=>{E.initiate(model,"withdrawal");render();});
    $("startVoltage").addEventListener("click",()=>{E.initiate(model,"voltage");render();});
    document.querySelectorAll(".program-choice").forEach(button=>button.addEventListener("click",()=>{
      document.querySelectorAll(".program-choice").forEach(b=>b.classList.toggle("active",b===button));
      $("transientSelect").value=button.dataset.program;
      $("programTitle").textContent=button.querySelector("strong").textContent;
      drawLoadProgramChart();
    }));
    $("startTransient").addEventListener("click",()=>{E.startTransient(model,$("transientSelect").value);
      running=true;render();});
    $("stopTransient").addEventListener("click",()=>{E.startTransient(model,"off");
      $("demandInput").value=100;running=true;render();});
    $("rodWorthControls").addEventListener("input",e=>{
      const name=e.target.dataset.rod;if(!name)return;
      if(e.target.value==="")return;
      const value=Number(e.target.value);
      if(!Number.isFinite(value))return;
      model.controls.rodWorthPcm[name]=Math.max(0,Math.min(3000,value));render();
    });
    window.addEventListener("resize",()=>{drawHistory();drawLoadProgramChart();});
  }
  function syncInputs() {
    const u=model.controls;
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
    $("sprayValue").textContent=`${fmt(u.manualSprayPct,1)} %`;
    $("chargeInput").value=u.rcvChargeM3h;
    $("chargeValue").textContent=`${fmt(u.rcvChargeM3h,1)} m³/h`;
    $("rcvBoron").value=u.rcvTankBoronPpm;
    $("protectionsEnabled").checked=u.protectionsEnabled;
    $("risEnabled").checked=u.risEnabled;
    for(const [id,key] of [["tripPressure","tripLowPressureBar"],["risPressure","risLowPressureBar"],
      ["fluxAlarm","fluxPrealarmPct"],["fluxTrip","tripHighFluxPct"],["fluxRateTrip","tripFluxRatePctS"],
      ["risBoron","risBoronPpm"],["mpScale","risMpScale"],["bpScale","risBpScale"],
      ["fxyUngraped","fxYUngraped"],["fxyGraped","fxYGraped"],["xenonScale","timeScaleXenon"]])
      $(id).value=u[key];
    for(const [id,key,i] of [["mpA","mpTrainEnabled",0],["mpB","mpTrainEnabled",1],
      ["bpA","bpTrainEnabled",0],["bpB","bpTrainEnabled",1]])$(id).checked=u[key][i];
    $("rodWorthControls").innerHTML=E.ROD_NAMES.map(name=>`<label>${name} · pcm
      <input type="number" data-rod="${name}" min="0" max="3000" step="25" value="${u.rodWorthPcm[name]}"></label>`).join("");
  }
  function frame(now) {
    const elapsed=Math.min(.15,Math.max(0,(now-last)/1000));last=now;
    if(running){
      carry+=elapsed*speed;
      let steps=0;
      while(carry>=0.1 && steps<150){E.step(model,0.1);carry-=0.1;steps++;}
      if(steps===150)carry=Math.min(carry,1);
      if(steps)sendEditorTick(steps*.1);
    }
    if(now-lastPaint>120){render();lastPaint=now;}
    requestAnimationFrame(frame);
  }
  model.controls.protectionGraphMode=true;
  renderAlarmTable();bindControls();syncInputs();render();requestAnimationFrame(frame);
})();
