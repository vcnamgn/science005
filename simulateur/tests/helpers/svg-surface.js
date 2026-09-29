const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Surface SVG minimale pour exercer le bridge avec le vrai dessin et ses tspan PDF.
function svgSurface(filename) {
  const file=path.resolve(__dirname,'../../synoptiques',filename);
  const source=fs.readFileSync(file,'utf8');
  const ids=new Map();
  const textLeaf=value=>({nodeValue:value,parentElement:null});
  const elements=(node)=>[node,...(node.children||[]).filter(n=>n.localName).flatMap(elements)];
  const leaves=(node)=>(node.children||[]).flatMap(n=>n.localName?leaves(n):[n]);
  const element=(name,attributes)=>({
    localName:name.split(':').pop(),attributes,children:[],parentElement:null,style:{},
    get id(){return this.attributes.id||'';},
    get textContent(){return leaves(this).map(n=>n.nodeValue).join('');},
    set textContent(value){const n=textLeaf(String(value));n.parentElement=this;this.children=[n];},
    setAttribute(key,value){this.attributes[key]=String(value);},
    getAttribute(key){return this.attributes[key];},
    querySelectorAll(selector){return selector==='text'?elements(this).slice(1).filter(n=>n.localName==='text'):[];},
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
    addEventListener(){},
    getBoundingClientRect(){return {left:0,right:0,top:0,bottom:0};}
  });
  const stack=[];let root;
  for(const match of source.matchAll(/<\/?([\w:-]+)\b([^>]*?)>|([^<]+)/g)) {
    if(match[3]!==undefined){
      if(stack.length){const n=textLeaf(match[3]);n.parentElement=stack.at(-1);stack.at(-1).children.push(n);}
    } else if(match[0].startsWith('</'))stack.pop();
    else {
      const attributes=Object.fromEntries([...match[2].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(a=>[a[1],a[2]]));
      const n=element(match[1],attributes);
      if(n.id)ids.set(n.id,n);
      if(stack.length){n.parentElement=stack.at(-1);stack.at(-1).children.push(n);}else root=n;
      if(!match[0].endsWith('/>'))stack.push(n);
    }
  }
  let onMessage;
  const context=vm.createContext({
    document:{documentElement:root,getElementById:id=>ids.get(id)||null,
      createTreeWalker:()=>{const all=leaves(root);let i=0;return {currentNode:null,nextNode(){this.currentNode=all[i++];return Boolean(this.currentNode);}};}},
    location:{pathname:file},NodeFilter:{SHOW_TEXT:4},
    window:{parent:{postMessage(){}},addEventListener(name,fn){if(name==='message')onMessage=fn;}}
  });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../centurion-svg-bridge.js'),'utf8'),context);
  const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const serialize=node=>node.localName
    ? `<${node.localName}${Object.entries(node.attributes).map(([k,v])=>` ${k}="${v.replaceAll('"','&quot;')}"`).join('')}>${node.children.map(serialize).join('')}</${node.localName}>`
    : escape(node.nodeValue);
  return {get:id=>ids.get(id),update:data=>onMessage({data:{type:'centurion-state',...data}}),serialize:()=>serialize(root)};
}
module.exports={svgSurface};
