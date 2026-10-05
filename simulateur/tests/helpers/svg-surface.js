const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercer le bridge réel sur les vrais dessins, sans navigateur ni dépendance DOM.
function svgSurface(filename) {
  const file=path.resolve(__dirname,'../../synoptiques',filename);
  const source=fs.readFileSync(file,'utf8');
  const ids=new Map(),messages=[];
  const decode=value=>value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,code)=>
    code[0]==='#'?String.fromCodePoint(code[1]==='x'?parseInt(code.slice(2),16):Number(code.slice(1)))
    : ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[code]);
  const textLeaf=value=>({nodeValue:value,parentElement:null});
  const elements=node=>[node,...(node.children||[]).filter(n=>n.localName).flatMap(elements)];
  const leaves=node=>(node.children||[]).flatMap(n=>n.localName?leaves(n):[n]);
  function matches(node,selector){
    const tag=/^[\w-]+/.exec(selector)?.[0];
    if(tag&&node.localName!==tag)return false;
    return [...selector.matchAll(/\[([\w:-]+)(?:(\*=|=)"([^"]*)")?\]/g)].every(([,key,op,value])=>
      key in node.attributes&&(!op||(op==='='?node.getAttribute(key)===value:node.getAttribute(key).includes(value))));
  }
  const element=(name,attributes)=>({
    qualifiedName:name,localName:name.split(':').pop(),attributes,children:[],parentElement:null,
    style:Object.fromEntries((attributes.style||'').split(';').filter(s=>s.includes(':')).map(s=>{
      const colon=s.indexOf(':');return [s.slice(0,colon).trim(),s.slice(colon+1).trim()];})),
    listeners:{},
    get id(){return this.attributes.id||'';},
    get textContent(){return leaves(this).map(n=>n.nodeValue).join('');},
    set textContent(value){const n=textLeaf(String(value));n.parentElement=this;this.children=[n];},
    setAttribute(key,value){this.attributes[key]=String(value);},
    getAttribute(key){return this.attributes[key]??null;},
    hasAttribute(key){return key in this.attributes;},
    querySelectorAll(selector){return elements(this).slice(1).filter(n=>selector.split(',').some(s=>matches(n,s.trim())));},
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
    addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);},
    getBoundingClientRect(){return {left:0,right:0,top:0,bottom:0};}
  });
  const stack=[];let root;
  for(const match of source.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<\/?([\w:-]+)\b([^>]*?)>|([^<]+)/g)) {
    if(match[3]!==undefined){
      if(stack.length){const n=textLeaf(decode(match[3]));n.parentElement=stack.at(-1);stack.at(-1).children.push(n);}
    } else if(match[0].startsWith('</'))stack.pop();
    else {
      const attributes=Object.fromEntries([...match[2].matchAll(/([\w:-]+)\s*=\s*"([^\"]*)"/g)].map(a=>[a[1],decode(a[2])]));
      const n=element(match[1],attributes);
      if(n.id)ids.set(n.id,n);
      if(stack.length){n.parentElement=stack.at(-1);stack.at(-1).children.push(n);}else root=n;
      if(!match[0].endsWith('/>'))stack.push(n);
    }
  }
  let onMessage;
  const parent={postMessage(message){messages.push(message);}};
  const context=vm.createContext({
    document:{documentElement:root,getElementById:id=>ids.get(id)||null,
      createTreeWalker:()=>{const all=leaves(root);let i=0;return {currentNode:null,nextNode(){this.currentNode=all[i++];return Boolean(this.currentNode);}};}},
    location:{pathname:file},NodeFilter:{SHOW_TEXT:4},
    window:{parent,addEventListener(name,fn){if(name==='message')onMessage=fn;}}
  });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../centurion-svg-bridge.js'),'utf8'),context);
  const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  function serialize(node){
    if(!node.localName)return escape(node.nodeValue);
    const attributes={...node.attributes};
    const styles=Object.entries(node.style).filter(([,v])=>v!=='').map(([k,v])=>`${k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}:${v}`).join(';');
    if(styles)attributes.style=styles;
    return `<${node.qualifiedName}${Object.entries(attributes).map(([k,v])=>` ${k}="${escape(v)}"`).join('')}>${node.children.map(serialize).join('')}</${node.qualifiedName}>`;
  }
  return {get:id=>ids.get(id),root,messages,
    update:data=>onMessage({source:parent,data:{type:'centurion-state',...data}}),
    click(id,key){let node=ids.get(id),stopped=false;
      const event={type:key?'keydown':'click',key,preventDefault(){},stopPropagation(){stopped=true;}};
      while(node&&!stopped){for(const fn of node.listeners[event.type]||[])fn(event);node=node.parentElement;}},
    serialize:()=>serialize(root)};
}
module.exports={svgSurface};
