/* Extensions visibles des chaînes PZR fournies ; aucun régulateur dans le moteur physique. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.CenturionPzrCommands=api;
})(typeof window!=="undefined"?window:globalThis,function(){
  "use strict";
  function upgrade(model){
    const nodes=model.nodes,links=model.links;
    const parent=(node,port=0)=>nodes.find(n=>n.id===links.find(l=>l.to===node?.id&&(l.toPort||0)===port)?.from);
    const reaches=(from,to,seen=new Set())=>from===to||(!seen.has(from)&&
      (seen.add(from),links.filter(l=>l.from===from).some(l=>reaches(l.to,to,seen))));
    let counter=Math.max(model.nodeCounter||0,...nodes.map(n=>Number(n.id.replace(/^N/,""))||0));
    const add=(type,label,params,x,y)=>{
      const node={id:`N${++counter}`,type,label,params,x,y};nodes.push(node);return node;
    };
    const insert=(source,type,label,params)=>{
      const children=links.filter(l=>l.from===source.id);
      // Libérer une colonne pour le relais sans déplacer les autres chaînes.
      const downstream=new Set();
      for(const node of nodes)if(node.id!==source.id&&reaches(source.id,node.id))downstream.add(node.id);
      for(const node of nodes)if(downstream.has(node.id))node.x+=270;
      const relay=add(type,label,params,source.x+270,source.y+120);
      for(const link of children)link.from=relay.id;
      links.push({from:source.id,to:relay.id,toPort:0});return relay;
    };
    const nref=nodes.find(n=>n.type==="nrefOut");
    const levelCurve=parent(nref),charge=nodes.find(n=>n.type==="qchargeOut");
    const knownLevel=levelCurve?.type==="curve"&&levelCurve.params?.curveRole==="nref"
      &&charge&&reaches(nref.id,charge.id)
      &&nodes.some(n=>n.type==="pi"&&n.label==="PI niveau"&&reaches(nref.id,n.id)&&reaches(n.id,charge.id));
    if(knownLevel&&!nodes.some(n=>n.type==="rci"&&n.params.setpoint==="level"))
      insert(levelCurve,"rci","RCI · niveau PZR",{setpoint:"level"});
    // Ajouter l'action seulement aux chaînes de niveau fournies, jamais aux canevas vides.
    if(knownLevel&&!nodes.some(n=>n.type==="rcvLetdownCloseOut")){
      const x=Math.min(...nodes.map(n=>n.x)),y=Math.max(...nodes.map(n=>n.y))+190;
      const measure=add("mn1Signal","MN1 · niveau PZR",{},x,y);
      const relay=add("thresholdRelay","Niveau bas · 15 / 17 %",{closeBelow:15,reopenAbove:17},x+280,y);
      const output=add("rcvLetdownCloseOut","Fermer orifices RCV",{},x+560,y);
      links.push({from:measure.id,to:relay.id,toPort:0},{from:relay.id,to:output.id,toPort:0});
    }
    const error=nodes.find(n=>n.type==="sum"&&parent(n,0)?.type==="mp1Signal"
      &&parent(n,1)?.type==="constant"&&Number(parent(n,1).params.value)===155
      &&parent(n,1).label==="PREF"
      &&nodes.some(out=>out.type==="pid"&&out.label==="PID pression"&&reaches(n.id,out.id))
      &&nodes.some(out=>out.type==="pchauffOut"&&reaches(n.id,out.id))
      &&nodes.some(out=>out.type==="qaspOut"&&reaches(n.id,out.id)));
    if(error&&!nodes.some(n=>n.type==="rci"&&n.params.setpoint==="pressure"))
      insert(parent(error,1),"rci","RCI · pression primaire",{setpoint:"pressure"});
    // Chaîne fournie : partager la même limite entre la correction PI et
    // la commande totale. La capacité pompe est une mesure, pas une régulation.
    const demand=parent(charge),limit=demand?.type==="limit"?demand:null;
    const sum=parent(limit),pi=parent(sum,0),base=parent(sum,1);
    if(limit&&Number(limit.params.min)===0&&sum?.type==="sum"
      &&Number(sum.params.a)===1&&Number(sum.params.b)===1
      &&pi?.type==="pi"&&pi.label==="PI niveau"&&base?.type==="qdecSignal"){
      if(Number(pi.params.max)===15)pi.params.max=60;
      pi.params.externalLimits="oui";pi.params.trackingTimeS=10;
      const x=pi.x,y=pi.y;
      const capacity=add("qchargeCapacitySignal","Capacité pompe RCV",{},x-810,y+280);
      limit.x=x-540;limit.y=y+280;
      base.x=x-540;base.y=y+140;
      const lower=add("gain","Correction minimale",{k:-1,outputUnit:"m³/h"},x-270,y+140);
      const upper=add("sum","Correction disponible",{a:1,b:-1},x-270,y+280);
      const actual=add("minimum","Débit réalisable",{},x+550,y);
      sum.x=x+280;sum.y=y;charge.x=x+820;charge.y=y;
      for(let i=links.length-1;i>=0;i--)if(links[i].to===limit.id||links[i].to===charge.id)links.splice(i,1);
      links.push({from:capacity.id,to:limit.id,toPort:0},
        {from:base.id,to:lower.id,toPort:0},{from:lower.id,to:pi.id,toPort:1},
        {from:limit.id,to:upper.id,toPort:0},{from:base.id,to:upper.id,toPort:1},
        {from:upper.id,to:pi.id,toPort:2},
        {from:sum.id,to:actual.id,toPort:0},{from:limit.id,to:actual.id,toPort:1},
        {from:actual.id,to:charge.id,toPort:0});
    }
    model.nodeCounter=counter;return model;
  }
  function selectReference(node,signals,automatic){
    const pressure=node.params.setpoint==="pressure";
    const value=signals?.[pressure?"pressureSetpointSignal":"pzrLevelSetpointSignal"];
    const manual=signals?.[pressure?"pressureSetpointManualSignal":"pzrLevelSetpointManualSignal"]?.[0]>=.5;
    return manual&&Number.isFinite(value?.[0])?{value:value[0],unit:value[1]}:automatic;
  }
  function limitedPi(params,state,error,lower,upper,dt,advance){
    const min=Math.min(Number(params.min),Number(params.max));
    const max=Math.max(Number(params.min),Number(params.max));
    const proportional=(Number(params.kp)||0)*error,ki=Number(params.ki)||0;
    if(![min,max,proportional,ki,lower,upper].every(Number.isFinite)||lower>upper)return null;
    const clamp=(value,a,b)=>Math.max(a,Math.min(b,value));
    if(!Number.isFinite(state.integral))state.integral=0;
    const availableMin=Math.max(min,lower),availableMax=Math.min(max,upper);
    if(advance&&dt>0){
      const increment=ki*error*dt/60;
      const candidate=proportional+state.integral+increment;
      // Intégrer seulement dans le sens qui ne creuse pas la saturation.
      if((increment>0&&candidate<=availableMax)||(increment<0&&candidate>=availableMin))
        state.integral+=increment;
      const raw=proportional+state.integral;
      const actual=clamp(clamp(raw,min,max),lower,upper);
      const tau=Math.max(.01,Number(params.trackingTimeS)||10);
      // Le suivi exponentiel vide aussi une intégrale déjà accumulée quand
      // la décharge ou la contre-pression réduit la capacité disponible.
      state.integral+=(actual-raw)*(-Math.expm1(-dt/tau));
    }
    const raw=proportional+state.integral;
    // Si la pompe ne couvre même plus la base, l'intervalle est vide : le PI
    // garde sa borne configurée et le MIN aval impose la capacité physique.
    return availableMin<=availableMax?clamp(raw,availableMin,availableMax):clamp(raw,min,max);
  }
  return {upgrade,selectReference,limitedPi};
});
