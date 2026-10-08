const fs=require('node:fs'),path=require('node:path');
const H=require('../../centurion-history'),E=require('../../centurion-engine');
const html=fs.readFileSync(path.join(__dirname,'../../centurion.html'),'utf8');
function surface(state){
  const ids=new Map(),copied=[];
  const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,v]));
  function register(text){
    for(const m of text.matchAll(/<([a-z][\w-]*)\b[^>]*>/g)){
      const a=attrs(m[0]);if(!a.id)continue;
      const listeners={},strokes=[],labels=[];let inner='',current=[];
      const context=new Proxy({strokes,labels,measureText:t=>({width:String(t).length*6}),
        clearRect(){strokes.length=0;labels.length=0;},beginPath(){current=[];},
        moveTo(x,y){current.push([x,y]);},lineTo(x,y){current.push([x,y]);},
        fillText(text,x,y){labels.push({text:String(text),color:this.fillStyle,x,y});},
        stroke(){strokes.push({color:this.strokeStyle,path:current.slice()});}},
        {get:(o,k)=>o[k]||(()=>{})});
      const node={id:a.id,value:a.value||'',checked:/\bchecked\b/.test(m[0]),disabled:/\bdisabled\b/.test(m[0]),
        hidden:/\bhidden\b/.test(m[0]),textContent:'',style:{},attrs:a,context,
        classList:{toggle(){}},setAttribute(k,v){a[k]=String(v);},
        addEventListener(name,fn){(listeners[name]??=[]).push(fn);},
        fire(name,extra={}){return Promise.all((listeners[name]||[]).map(fn=>fn({target:node,preventDefault(){},...extra})));},
        getBoundingClientRect(){return {left:0,width:parseFloat(node.style.width)||1000,height:node.id==='historyChart'?430:190};},
        getContext:()=>context,
        get innerHTML(){return inner;},set innerHTML(v){inner=String(v);register(inner);},
        focus(){document.activeElement=node;},select(){node.selected=true;}};
      ids.set(a.id,node);
    }
    for(const [,id,body] of text.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){
      const options=[...body.matchAll(/<option\b[^>]*>/g)],option=options.find(o=>/\bselected\b/.test(o[0]))||options[0];
      if(option&&ids.has(id))ids.get(id).value=attrs(option[0]).value;
    }
  }
  const document={activeElement:null};register(html);
  const model=E.make();model.state=state;
  const chart=H.create({E,$:id=>ids.get(id),document,getModel:()=>model,
    clipboard:{async writeText(text){copied.push(text);}}});
  return {chart,state,document,copied,get:id=>ids.get(id),async set(id,value,event='change'){
    const el=ids.get(id);el.value=value;await el.fire(event);},async add(id){ids.get('historyVariable').value=id;await ids.get('historyAdd').fire('click');}};
}
module.exports={surface};
