/* Certificat pédagogique local : instantanés du moteur, SVG et copie de l'interface. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.CenturionCertificate=api;
})(typeof window!=="undefined"?window:globalThis,function(){
  "use strict";
  const VERSION="20261007-certificat";
  const clone=value=>JSON.parse(JSON.stringify(value));
  const fmt=(value,d=0)=>Number(value).toLocaleString("fr-FR",{minimumFractionDigits:d,maximumFractionDigits:d});
  function duration(seconds){
    const n=Math.max(0,Math.floor(Number(seconds)||0));
    return [Math.floor(n/3600),Math.floor(n%3600/60),n%60].map(v=>String(v).padStart(2,"0")).join(":");
  }
  function certificateSummary(model,artist){
    const s=model.state;
    if(!["safe","melted"].includes(s.endState))throw new Error("Le certificat est disponible à la fin du scénario.");
    return {artist:String(artist||"").trim().slice(0,80)||"Anonyme",safe:s.endState==="safe",
      stamp:s.endState==="safe"?"VALIDÉ":"ÉCHEC FATAL",duration:duration(s.time),reason:s.endReason||"",
      filename:`Centurion-${s.endState}-${String(artist||"Anonyme").trim().normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").slice(0,55)||"Anonyme"}.png`};
  }
  function pdfBytes(jpeg,width,height){
    // Une page A4 contenant l'image JPEG ; aucun texte ni police à embarquer.
    if(!(jpeg instanceof Uint8Array)||jpeg[0]!==255||jpeg[1]!==216||width<=0||height<=0)
      throw new Error("Image JPEG invalide pour le PDF.");
    const chunks=[],offsets=[0],encoder=new TextEncoder();let length=0;
    const add=data=>{const bytes=typeof data==="string"?encoder.encode(data):data;chunks.push(bytes);length+=bytes.length;};
    const object=(id,body)=>{offsets[id]=length;add(`${id} 0 obj\n${body}\nendobj\n`);};
    const scale=Math.min(549.92/width,796.53/height),w=width*scale,h=height*scale;
    const content=`q\n${w.toFixed(3)} 0 0 ${h.toFixed(3)} ${((595.28-w)/2).toFixed(3)} ${((841.89-h)/2).toFixed(3)} cm\n/Im0 Do\nQ\n`;
    add("%PDF-1.4\n");
    object(1,"<< /Type /Catalog /Pages 2 0 R >>");
    object(2,"<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    object(3,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>");
    object(4,`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
    offsets[5]=length;
    add(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    add(jpeg);add("\nendstream\nendobj\n");
    const xref=length;add("xref\n0 6\n0000000000 65535 f \n");
    for(let i=1;i<=5;i++)add(String(offsets[i]).padStart(10,"0")+" 00000 n \n");
    add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const result=new Uint8Array(length);let position=0;
    for(const chunk of chunks){result.set(chunk,position);position+=chunk.length;}return result;
  }
  function ptTrail(model){
    const s=model.state,points=(s.history||[]).filter(p=>p.t>=s.time-14400);
    const stride=Math.max(1,Math.ceil(points.length/1200));
    return points.filter((_,i)=>i%stride===0).map(p=>({t:p.t,tavg:p.tavg,pressure:p.pressure}))
      .concat({t:s.time,tavg:s.tavgC,pressure:s.pressureBar});
  }
  function createArchive(E){
    let current=null,records=new Map(),seen={},minimum=Infinity;
    function record(model,key,label,diagram){
      const s=model.state;
      records.set(key,{key,label,diagram,time:s.time,snapshot:clone(E.instrumentSnapshot(model)),
        core:{shape:[...s.axialShape32],linear:[...s.linearWcm32],power:s.powerPct,
          dpax:s.dpaxPctPn,peak:s.peakLinearWcm,height:E.C.activeFuelHeightM}});
    }
    function observe(model){
      const s=model.state;
      if(current!==model){current=model;records=new Map();seen={};minimum=s.primaryMassKg;
        record(model,"initial","Inventaire initial","inventory");}
      if(seen.end)return;
      if(s.tripDemandAt!==null&&!seen.aar){
        seen.aar=true;
        const plin=Boolean(s.signals.highLinearPower);
        record(model,"aar",plin?"AAR · PLIN élevée":"Ordre AAR",plin?"core":"pzr");
      }
      if(s.risDemandAt!==null&&!seen.is){seen.is=true;record(model,"is","Injection de sécurité","inventory");}
      if(s.reliefKgS>.1&&!seen.relief){seen.relief=true;record(model,"relief","Ouverture des soupapes","pzr");}
      if(s.coreDamageWarning&&!seen.warning){seen.warning=true;
        record(model,"warning",s.peakLinearWcm>590?"Alerte · PLIN > 590 W/cm":"Alerte · dénoyage cœur",
          s.peakLinearWcm>590?"core":"inventory");}
      // Une seule case remplaçable pour la baisse d'inventaire : mémoire bornée.
      if(s.primaryMassKg<minimum*.9){minimum=s.primaryMassKg;record(model,"minimum","Baisse d’inventaire","inventory");}
      if(s.endState&&!seen.end){seen.end=true;record(model,"final","Inventaire final","inventory");}
    }
    function getRecords(){return clone([...records.values()]);}
    return {observe,getRecords};
  }
  function coreSvg(record,E){
    const c=record.core,w=780,h=570,left=94,right=712,top=66,bottom=490;
    const xP=p=>left+Math.max(0,Math.min(2,p))/2*(right-left);
    const xL=p=>left+Math.max(0,Math.min(435,p))/435*(right-left);
    const y=z=>bottom-z*(bottom-top);
    const bars=c.linear.map((p,i)=>`<rect x="${left}" y="${y((i+1)/32)}" width="${xL(p)-left}" height="${(bottom-top)/32}" fill="#b9dce9" stroke="#fff" stroke-width="1"/>`).join("");
    const path=Array.from({length:161},(_,i)=>{const z=i/160;return `${i?"L":"M"}${xP(E.smoothAxialProfile(c.shape,z)).toFixed(2)} ${y(z).toFixed(2)}`;}).join(" ");
    const grid=[0,.5,1,1.5,2].map(p=>`<path d="M${xP(p)} ${top}V${bottom}" stroke="#dce7ef"/><text x="${xP(p)}" y="${top-15}" text-anchor="middle">${fmt(p,1)}</text>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="white"/><g font-family="Arial,sans-serif" fill="#244459" font-size="17">
      <text x="${left}" y="25" font-size="23" font-weight="bold">Cœur · P(z) et PLIN calculée</text>
      ${grid}${bars}<path d="${path}" fill="none" stroke="#058abd" stroke-width="5"/>
      <path d="M${left} ${top}V${bottom}H${right}" fill="none" stroke="#244459" stroke-width="2"/>
      <text x="${right}" y="25" text-anchor="end">P(z) · 0–2</text>
      ${[0,1,2,3,4].map(z=>`<text x="${left-10}" y="${y(z/c.height)+6}" text-anchor="end">${fmt(z,1)} m</text>`).join("")}
      ${[0,100,200,300,435].map(p=>`<text x="${xL(p)}" y="${bottom+25}" text-anchor="middle">${p}</text>`).join("")}
      <text x="${right}" y="${bottom+50}" text-anchor="end">PLIN · W/cm · limite 435</text>
      <text x="${left}" y="${h-12}" font-weight="bold">PN ${fmt(c.power,1)} % · DPAX ${fmt(c.dpax,2)} % · PLIN max ${fmt(c.peak)} W/cm</text>
      </g></svg>`;
  }
  function loadImage(url){
    return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);
      image.onerror=()=>reject(new Error("Impossible de lire une image du certificat."));image.src=url;});
  }
  async function rasterize(svg,width=1400){
    const image=await loadImage("data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg));
    const canvas=document.createElement("canvas");canvas.width=width;
    canvas.height=Math.round(width*image.naturalHeight/image.naturalWidth);
    const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas;
  }
  function captureSvg(file,snapshot){
    return new Promise((resolve,reject)=>{
      const object=document.createElement("object"),requestId=`certificate-${Date.now()}-${Math.random()}`;
      object.type="image/svg+xml";object.className="certificate-offscreen";object.setAttribute("aria-hidden","true");
      object.data=file+"?v="+VERSION;let timeout;
      const cleanup=()=>{clearTimeout(timeout);window.removeEventListener("message",receive);object.remove();};
      const request=()=>object.contentWindow?.postMessage({type:"centurion-svg-capture-request",requestId,snapshot},"*");
      function receive(event){
        if(event.source!==object.contentWindow)return;
        if(event.data?.type==="centurion-svg-ready")request();
        if(event.data?.type==="centurion-svg-capture-result"&&event.data.requestId===requestId){
          const svg=event.data.svg;cleanup();resolve(svg);}
      }
      window.addEventListener("message",receive);object.addEventListener("load",request);
      timeout=setTimeout(()=>{cleanup();reject(new Error("Le synoptique n’a pas répondu. Réessayez après son chargement."));},12000);
      document.body.append(object);
    });
  }
  function fit(ctx,image,x,y,w,h){
    const ratio=Math.min(w/image.width,h/image.height),iw=image.width*ratio,ih=image.height*ratio;
    ctx.drawImage(image,x+(w-iw)/2,y+(h-ih)/2,iw,ih);
  }
  function wrap(ctx,text,x,y,width,lineHeight){
    let line="";
    for(const word of String(text).split(/\s+/)){
      const next=line?line+" "+word:word;
      if(line&&ctx.measureText(next).width>width){ctx.fillText(line,x,y);y+=lineHeight;line=word;}else line=next;
    }
    if(line)ctx.fillText(line,x,y);return y;
  }
  function compose(summary,screen,thumbnails,created){
    const canvas=document.createElement("canvas"),w=1800,pad=48,cols=3,gap=22;
    const shotHeight=Math.round(screen.height*(w-2*pad)/screen.width);
    const thumbW=(w-2*pad-gap*(cols-1))/cols,thumbH=345,rows=Math.ceil(thumbnails.length/cols);
    const footerY=325+shotHeight+rows*(thumbH+gap)+35;
    canvas.width=w;canvas.height=footerY+135;
    const ctx=canvas.getContext("2d");ctx.fillStyle="#eef5f8";ctx.fillRect(0,0,w,canvas.height);
    ctx.fillStyle="#142e43";ctx.fillRect(0,0,w,260);
    ctx.fillStyle="#62d5e5";ctx.font="bold 27px Arial";ctx.fillText("CENTURION · CERTIFICAT DE SIMULATION",pad,55);
    ctx.fillStyle="#fff";ctx.font="bold 66px Arial";
    while(ctx.measureText(summary.artist).width>w-550){const size=Number(/(\d+)px/.exec(ctx.font)[1]);ctx.font=`bold ${size-1}px Arial`;}
    ctx.fillText(summary.artist,pad,145);
    ctx.font="bold 34px Arial";ctx.fillText("DURÉE SIMULÉE  "+summary.duration,pad,212);
    ctx.save();ctx.translate(w-255,133);ctx.rotate(-.1);ctx.strokeStyle=summary.safe?"#6aeeae":"#ffaaa4";
    ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=6;ctx.strokeRect(-170,-65,340,130);
    ctx.font="bold 41px Arial";ctx.textAlign="center";ctx.fillText(summary.stamp,0,14);ctx.restore();
    ctx.fillStyle="#244459";ctx.font="bold 23px Arial";
    ctx.fillText("État final · Diagramme P–T · trace des 4 dernières heures",pad,300);
    ctx.fillStyle="white";ctx.fillRect(pad-1,324,w-2*pad+2,shotHeight+2);
    ctx.drawImage(screen,pad,325,w-2*pad,shotHeight);
    const startY=350+shotHeight;
    thumbnails.forEach((thumb,i)=>{
      const x=pad+(i%cols)*(thumbW+gap),y=startY+Math.floor(i/cols)*(thumbH+gap);
      ctx.fillStyle="white";ctx.fillRect(x,y,thumbW,thumbH);
      fit(ctx,thumb.image,x+10,y+10,thumbW-20,245);
      ctx.fillStyle="#244459";ctx.font="bold 22px Arial";ctx.fillText(thumb.record.label,x+16,y+282);
      ctx.font="19px Arial";const v=thumb.record.snapshot;
      ctx.fillText(`${duration(thumb.record.time)} · ${fmt(v.pressure,1)} bar · ${fmt(v.tavgC,1)} °C`,x+16,y+312);
      ctx.fillStyle="#567182";ctx.font="17px Arial";
      ctx.fillText(`Eau CPP : ${fmt(v.primaryMassKg/1000,1)} t`,x+16,y+335);
    });
    ctx.fillStyle="#244459";ctx.font="bold 25px Arial";
    const reasonEnd=wrap(ctx,summary.reason,pad,footerY,w-2*pad,31);
    ctx.fillStyle="#59717f";ctx.font="19px Arial";
    ctx.fillText(`Généré le ${created.toLocaleString("fr-FR")} · Simulateur pédagogique CENTURION`,pad,reasonEnd+43);
    return canvas;
  }
  function create({E,getModel,svgFiles,ptCurves,prepare}){
    const archive=createArchive(E),$=id=>document.getElementById(id);
    let capture=null,capturedModel=null,busy=false,result=null;
    const status=text=>{$("certificateStatus").textContent=text;};
    function observe(model){archive.observe(model);if(capturedModel&&capturedModel!==model){capture=null;capturedModel=null;result=null;}}
    function outputs(enabled){for(const id of ["certificateDownload","certificatePrint"])$(id).disabled=!enabled;}
    function open(){
      if(!getModel().state.endState)return;
      $("certificateDialog").showModal();$("certificateArtist").focus();
      status("Choisissez le nom à afficher, puis générez le certificat.");
    }
    async function generate(){
      if(busy)return;busy=true;$("certificateGenerate").disabled=true;$("certificateArtist").disabled=true;outputs(false);
      try{
        const model=getModel(),summary=certificateSummary(model,$("certificateArtist").value);
        const ensureCurrent=()=>{if(getModel()!==model)throw new Error("La partie a été réinitialisée pendant la création du certificat.");};
        observe(model);
        if(!capture||capturedModel!==model){
          status("Préparation du diagramme P–T et des événements…");prepare();
          const snapshot={...E.instrumentSnapshot(model),ptHistory:ptTrail(model),ptCurves};
          const pt=await rasterize(await captureSvg(svgFiles.pt,snapshot),1800);
          ensureCurrent();
          const records=archive.getRecords();
          const selected=[records.find(r=>r.key==="initial"),records.find(r=>r.key==="final"),
            ...records.filter(r=>["aar","is","relief","warning"].includes(r.key))].filter(Boolean).slice(0,6);
          const thumbnails=[];
          for(const record of selected){
            const svg=record.diagram==="core"?coreSvg(record,E):await captureSvg(svgFiles[record.diagram],record.snapshot);
            thumbnails.push({record,image:await rasterize(svg,900)});
          }
          ensureCurrent();
          if(typeof window.html2canvas!=="function")throw new Error("Le module de copie d’écran n’a pas été chargé. Rechargez la page.");
          status("Copie de l’interface complète…");
          const screen=await window.html2canvas(document.body,{backgroundColor:"#f2f7fa",scale:1.5,logging:false,
            scrollX:0,scrollY:0,
            ignoreElements:el=>["certificateDialog","scenarioEnd","coreDamageCountdown"].includes(el.id)
              ||el.classList?.contains("certificate-offscreen"),
            onclone:doc=>{
              const object=doc.getElementById("diagramObject"),image=doc.createElement("img");
              image.id=object.id;image.className="certificate-diagram-image";image.src=pt.toDataURL("image/png");
              image.style.cssText="width:100%;height:"+object.getBoundingClientRect().height+"px;object-fit:contain;display:block";
              object.replaceWith(image);
              // html2canvas ne respecte pas toujours les <details> fermés ni
              // le dessin natif des glissières : figer leur apparence visible.
              doc.querySelectorAll("details:not([open]) > :not(summary)").forEach(el=>el.remove());
              doc.querySelectorAll("summary").forEach(el=>{el.style.listStyle="none";el.style.display="block";});
              doc.querySelectorAll('input[type="range"]').forEach(input=>{
                const min=Number(input.min)||0,max=Number(input.max)||100;
                const pct=Math.max(0,Math.min(100,100*(Number(input.value)-min)/(max-min)));
                const bar=doc.createElement("div"),track=doc.createElement("div"),fill=doc.createElement("div"),knob=doc.createElement("div");
                bar.style.cssText="position:relative;width:100%;height:16px;margin:3px 0";
                track.style.cssText="position:absolute;top:5px;left:0;width:100%;height:6px;background:#d3e0e6;border-radius:3px";
                fill.style.cssText=`width:${pct}%;height:100%;background:${input.disabled?"#9aadb7":"#16a2bc"};border-radius:3px`;
                knob.style.cssText=`position:absolute;left:${pct}%;top:0;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:${input.disabled?"#9aadb7":"#16a2bc"}`;
                track.append(fill);bar.append(track,knob);input.replaceWith(bar);
              });
              // Les animations d'alarme restent visibles, sans dépendre de leur phase.
              const style=doc.createElement("style");style.textContent="*{animation:none!important;transition:none!important}";doc.head.append(style);
            }});
          ensureCurrent();capture={screen,thumbnails,created:new Date()};capturedModel=model;
        }
        result=compose(summary,capture.screen,capture.thumbnails,capture.created);
        $("certificatePreview").src=result.toDataURL("image/png");$("certificatePreview").hidden=false;
        outputs(true);status("Certificat prêt · téléchargement PNG ou PDF.");
      }catch(error){status("Création impossible : "+error.message);}
      finally{busy=false;$("certificateGenerate").disabled=false;$("certificateArtist").disabled=false;}
    }
    $("openCertificate").addEventListener("click",open);
    $("certificateClose").addEventListener("click",()=>$("certificateDialog").close());
    $("certificateGenerate").addEventListener("click",generate);
    $("certificateArtist").addEventListener("input",()=>{outputs(false);status("Regénérez pour appliquer ce nom.");});
    $("certificateDownload").addEventListener("click",()=>{
      if(!result)return;const link=document.createElement("a");link.download=certificateSummary(getModel(),$("certificateArtist").value).filename;
      link.href=result.toDataURL("image/png");link.click();
    });
    $("certificatePrint").addEventListener("click",()=>{
      if(!result)return;
      const binary=atob(result.toDataURL("image/jpeg",.95).split(",")[1]),jpeg=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)jpeg[i]=binary.charCodeAt(i);
      const blob=new Blob([pdfBytes(jpeg,result.width,result.height)],{type:"application/pdf"});
      const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;
      link.download=certificateSummary(getModel(),$("certificateArtist").value).filename.replace(/\.png$/,".pdf");
      link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    });
    return {observe};
  }
  return {duration,certificateSummary,pdfBytes,ptTrail,createArchive,coreSvg,create};
});
