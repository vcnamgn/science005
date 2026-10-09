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
    model.nodeCounter=counter;return model;
  }
  function selectReference(node,signals,automatic){
    const pressure=node.params.setpoint==="pressure";
    const value=signals?.[pressure?"pressureSetpointSignal":"pzrLevelSetpointSignal"];
    const manual=signals?.[pressure?"pressureSetpointManualSignal":"pzrLevelSetpointManualSignal"]?.[0]>=.5;
    return manual&&Number.isFinite(value?.[0])?{value:value[0],unit:value[1]}:automatic;
  }
  return {upgrade,selectReference};
});
