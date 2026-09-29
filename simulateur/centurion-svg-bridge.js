/* Exécuté dans chaque SVG chargé par <object>, y compris depuis file://. */
(function () {
  "use strict";
  const root=document.documentElement;
  const file=decodeURIComponent(location.pathname).toUpperCase();
  const kind=file.includes("RCPGRAPPES")?"rods":file.includes("RCPPZR")?"pzr":
    file.includes("RCPGV")?"gv":"rcp";
  const fmt=(value,d=0)=>Number(value).toLocaleString("fr-FR",{
    minimumFractionDigits:d,maximumFractionDigits:d});
  const set=(id,value)=>{const e=document.getElementById(id);if(e)e.textContent=value;};
  let gv=1;

  function destination(label){
    const name=label.replace(/\s+/g," ").trim().toUpperCase();
    const match=/^GV\s*([1-4])$/.exec(name);
    if(match)return {diagram:"gv",gv:Number(match[1])};
    if(name==="PZR"||name==="PRESSURISEUR")return {diagram:"pzr"};
    if(name==="GRAPPES"||name==="POSITION DES GRAPPES")return {diagram:"rods"};
    if(name==="RCP")return {diagram:"rcp"};
    return null;
  }
  function arrowGroup(text){
    let node=text;
    for(let i=0;i<5&&node;i++,node=node.parentElement){
      if(node.localName==="g" && (/^renvoi-/i.test(node.id||"") ||
        node.querySelector('polygon[fill="#b79af7"],path[fill="#b79af7"],path[style*="#b79af7"]')))return node;
    }
    return text;
  }
  function navigate(target){
    if(window.parent && window.parent!==window)
      window.parent.postMessage({type:"centurion-svg-navigate",...target},"*");
    else {
      const files={rcp:"synoptique-RCP-1300.svg",gv:"synoptique-RCPGV-1300.svg",
        pzr:"synoptique-RCPPZR-1300.svg",rods:"synoptique-RCPGRAPPES-1300.svg"};
      if(files[target.diagram])location.href=files[target.diagram];
    }
  }
  function bindArrows(){
    const purple='polygon[fill="#b79af7"],path[fill="#b79af7"],path[style*="#b79af7"]';
    const grayShape=shape=>{shape.style.fill="#b9c1c8";shape.style.stroke="#737e88";};
    const grayArrow=(node,text)=>{
      if(node!==text){node.querySelectorAll(purple).forEach(grayShape);return;}
      const r=text.getBoundingClientRect(),cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;
      for(const shape of root.querySelectorAll(purple)){
        const b=shape.getBoundingClientRect();
        if(cx>=b.left-3&&cx<=b.right+3&&cy>=b.top-3&&cy<=b.bottom+3)grayShape(shape);
      }
    };
    const seen=new Set();
    for(const text of root.querySelectorAll("text")){
      const label=text.textContent.trim();
      const target=destination(label);
      const node=arrowGroup(text);
      if(target){
        if(seen.has(node))continue;
        seen.add(node);node.style.cursor="pointer";
        node.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();
          navigate(destination(text.textContent)||target);});
      } else if(/^(RCV|RIS(?: MP| BP)? ?[1-4]?|RRA ?[1-4]?|ASG|ARE)$/i.test(label)){
        grayArrow(node,text);
        node.style.cursor="default";
      }
    }
    if(kind==="rcp"){
      const arrow=document.getElementById("path45220");
      if(arrow){arrow.style.cursor="pointer";arrow.addEventListener("click",()=>navigate({diagram:"rods"}));}
    }
  }
  function gvLabels(number){
    gv=number;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const node=walker.currentNode;
      if(!node.parentElement||!["text","tspan"].includes(node.parentElement.localName))continue;
      if(node._centurionBase===undefined)node._centurionBase=node.nodeValue;
      node.nodeValue=node._centurionBase.replace(/GV1/g,`GV${number}`)
        .replace(/\b(ARE|ASG|VDA|VVP)1(?=\d{2}[A-Z]{2}\b)/g,`$1${number}`)
        .replace(/\b1(?=\d{2}(?:MN|MP|KM|VD|VL|VV)\b)/g,String(number));
    }
    const title=document.getElementById("titre-GV1-pedagogique")?.querySelector("text");
    if(title)title.textContent=`GÉNÉRATEUR DE VAPEUR ${number}`;
    const others=[1,2,3,4].filter(n=>n!==number);
    ["renvoi-GV2","renvoi-GV3","renvoi-GV4"].forEach((id,i)=>{
      const label=document.getElementById(id)?.querySelector("text");
      if(label)label.textContent=`GV${others[i]}`;
    });
    root.setAttribute("data-loop",String(number));
  }
  function updateGv(data){
    gvLabels(Number(data.gv)||1);
    const unit=data.gvState;
    if(!unit)return;
    set("text4024",fmt(unit.pressureBar,1));
    set("text4716",fmt(unit.feedKgS*3.6));
    set("text5592","245"); // Température ARE fixe, commune au tableau de bord.
    set("text2666",fmt(unit.levelPct,1));
    set("text5672",fmt(unit.levelWidePct,1));
    set("gv-level-height",`${fmt(unit.levelMetres,2)} m`);
    set("vvp-opening-value",fmt(unit.steamValvePct,1));
    set("text2890",`${fmt(unit.gctAValvePct,1)} %`);
    set("text5934",fmt(unit.dumpKgS,1));
    const gauge=(id,bottom,height,pct)=>{
      const fill=document.getElementById(id);
      const h=height*Math.max(0,Math.min(100,Number(pct)||0))/100;
      if(fill){fill.setAttribute("y",String(bottom-h));fill.setAttribute("height",String(h));}
    };
    gauge("gv-gauge-wide-fill",923.97,450.92,unit.levelWidePct);
    const narrowHeight=450.92*(17-12.5)/17, narrowBottom=473.05+narrowHeight;
    gauge("gv-gauge-narrow-fill",narrowBottom,narrowHeight,unit.levelPct);
    const setpoint=Math.max(0,Math.min(100,Number(data.gvSetpoint)||0));
    const y=narrowBottom-narrowHeight*setpoint/100;
    const ref=document.getElementById("gv-level-reference");
    if(ref){ref.setAttribute("y1",String(y));ref.setAttribute("y2",String(y));}
    const note=document.getElementById("gv-level-reference-label");
    if(note){note.setAttribute("y",String(y-7));note.textContent=`NREF ${fmt(setpoint)} % GE`;}
  }
  function updateRods(data){
    set("puissance-electrique",`${fmt(data.power,1)} %`);
    set("compteur-g3",data.tripAt===null?fmt(data.g3):"—");
    for(const [name,p] of Object.entries(data.rods||{})){
      set(`position-${name}`,fmt(p));
      const group=document.getElementById(`groupe-${name}`);
      if(group)group.setAttribute("data-position-pas-extraits",Number(p).toFixed(1));
      const fill=document.getElementById(`remplissage-${name}`);
      if(fill)fill.setAttribute("height",String(Math.max(0,360*(260-p)/260)));
    }
    const y=383+360*(260-data.rLimit)/260;
    const line=document.getElementById("limite-R");
    if(line)line.setAttribute("d",`M146.5 ${y.toFixed(2)}H233.5`);
    const label=document.getElementById("valeur-limite-R");
    if(label){label.setAttribute("y",String(y-11));label.textContent=`IL ${fmt(data.rLimit)}`;}
    const power=Math.max(0,Math.min(100,Number(data.power)||0));
    const actualPower=Math.max(0,Math.min(100,Number(data.power)||0));
    const g3=Math.max(200,Math.min(780,Number(data.g3)||200));
    const point=document.getElementById("point-g3");
    const px=118+(g3-200)*512/580,py=1095-1.35*actualPower;
    if(point){point.setAttribute("cx",px.toFixed(1));point.setAttribute("cy",py.toFixed(1));
      point.style.visibility=data.tripAt===null?"visible":"hidden";}
    const pointLabel=document.getElementById("libelle-point-g3");
    if(pointLabel){pointLabel.style.visibility=data.tripAt===null?"visible":"hidden";
      pointLabel.setAttribute("x",String(px-12));
      pointLabel.setAttribute("y",String(py-11));pointLabel.textContent=`${fmt(actualPower,1)} % / ${fmt(g3)}`;}
    const il1=202-.16*power,il2=211-.13*power,ix=135+4.85*power;
    for(const [suffix,limit] of [["premiere",il1],["seconde",il2]]){
      const iy=1380-(limit-180)*2.4;
      const circle=document.getElementById(`point-il-${suffix}`);
      const note=document.getElementById(`libelle-il-${suffix}`);
      if(circle){circle.setAttribute("cx",ix.toFixed(1));circle.setAttribute("cy",iy.toFixed(1));}
      if(note){note.setAttribute("x",String(ix-5));note.setAttribute("y",String(iy-7));
        note.textContent=fmt(limit);}
    }
  }
  function updatePzr(data){
    set("valeur-003MN",fmt(data.pzrLevel,1));
    set("valeur-003MN-9",fmt(data.pzrTempC,1));
    set("valeur-002MP",fmt(data.pressure,1));
    const level=Math.max(0,Math.min(100,data.pzrLevel));
    const y=970-640*level/100;
    const water=document.getElementById("niveau-eau-graphique");
    if(water){water.setAttribute("y",String(y));water.setAttribute("height",String(640*level/100));}
    const line=document.getElementById("path1020");
    if(line)line.setAttribute("d",`M605 ${y}H945`);
    const gauge=document.getElementById("jauge-remplissage");
    if(gauge){gauge.setAttribute("y",String(y));gauge.setAttribute("height",String(970-y));}
    const nref=Math.max(0,Math.min(100,Number(data.nref)||0));
    const nrefY=970-640*nref/100;
    const dotted=document.getElementById("path1028");
    if(dotted)dotted.setAttribute("d",`M606 ${nrefY}H945`);
    const nrefLabel=document.getElementById("libelle-nref");
    if(nrefLabel){nrefLabel.setAttribute("y",String(nrefY-7));
      nrefLabel.textContent=`NREF ${fmt(nref,1)} %`;}
    set("text1090",fmt(data.sprayPct||0));
    set("text1099",fmt(data.sprayPct||0));
    set("valeur-004KM",fmt(data.heaterKW||0));
    for(const id of ["vanne-201VP","vanne-202VP"]){
      const valve=document.getElementById(id)?.querySelector(".valve");
      if(valve)valve.style.fill=(data.sprayPct||0)>0?"#49cde0":"#f4f9fe";
    }
    for(let i=0;i<3;i++){
      const valve=document.getElementById(`soupape-${i+1}`)?.querySelector(".valve");
      if(valve)valve.style.fill=data.reliefStages?.[i]?"#ff9478":"#f4f9fe";
    }
  }
  function updateRcp(data){
    set("text5478",fmt(data.power,1));
    set("text6746",fmt(data.sprayPct||0));
    set("text6746-0",fmt(data.sprayPct||0));
    set("text6206",fmt(data.boron));
    set("text5358",fmt(data.pressure,1));
    set("text5358-9",fmt(data.pzrLevel,1));
    set("text5558",fmt(data.tavgC,1));
    set("text5618",fmt(data.hotC,1));
    set("text6126",fmt(data.tRicC,1));
    const nominalLoopFlow=17588/4;
    const loopSensors=[
      ["text5238","text5298","text5418"],
      ["text5946","text6006","text5886"],
      ["text5698","text5762","text5826"],
      ["text5118","text5178","text5058"]
    ];
    (data.loops||[]).forEach((loop,i)=>{
      const ids=loopSensors[i];if(!ids)return;
      set(ids[0],fmt(loop.hotC,1));set(ids[1],fmt(loop.coldC,1));
      set(ids[2],fmt(100*loop.flowKgS/nominalLoopFlow));
    });
    set("valeur-debit-vapeur",fmt(data.steamKgS*3.6));
    set("valeur-puissance-turbine",fmt(data.turbinePct));
    set("valeur-puissance-thermique",fmt(data.thermalMW));
    set("valeur-puissance-reseau",fmt(data.electricMW));
    set("valeur-debit-vapeur-2",fmt(data.rods.R));
    set("valeur-puissance-turbine-4",data.tripAt===null?fmt(data.g3):"—");
    set("valeur-puissance-turbine-4-9",fmt(data.rods.SA));
    const gvValues=[
      ["text5358-0","text5358-9-0"],
      ["text5358-0-7","text5358-9-0-6"],
      ["gv3-pressure-value-part10","gv3-level-value-part10"],
      ["gv4-pressure-value-part10","gv4-level-value-part10"]
    ];
    (data.gvAll||[]).forEach((unit,i)=>{
      if(gvValues[i]){
        set(gvValues[i][0],fmt(unit.pressureBar,1));
        set(gvValues[i][1],fmt(unit.levelPct,1));
      }
    });
    const risM3h=(Number(data.risDelivered)||0)*3.6/(4*0.72);
    for(const id of ["text5418-4","ris2-flow-value-part10", "ris3-flow-value-part10", "ris4-flow-value-part10"])
      set(id,fmt(risM3h));
    for(const id of ["text45237-6","text45245-5","text45245-5-6"])set(id,"pas");
  }
  window.addEventListener("message",event=>{
    const data=event.data;
    if(!data||data.type!=="centurion-state")return;
    if(kind==="gv")updateGv(data);
    else if(kind==="rods")updateRods(data);
    else if(kind==="pzr")updatePzr(data);
    else updateRcp(data);
  });
  bindArrows();
  if(window.parent&&window.parent!==window)
    window.parent.postMessage({type:"centurion-svg-ready",kind},"*");
})();
