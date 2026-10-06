const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {svgSurface}=require('./svg-surface');

// Vraie fonction de capture et vrai bridge SVG. Seuls le chargement de
// l'iframe, les messages et les minuteries sont pilotés pour simuler une course.
function certificateCaptureSurface(){
  const listeners=new Set(),timeouts=new Map(),intervals=new Map(),frames=[],ui=new Map();
  let timerId=0;
  const emit=(source,data)=>{for(const receive of [...listeners])receive({source,data});};
  const document={
    getElementById(id){
      if(!ui.has(id)){
        const handlers=new Map(),attributes=new Map();
        ui.set(id,{value:'Artiste',disabled:false,hidden:false,textContent:'',open:false,
          addEventListener(name,fn){handlers.set(name,fn);},
          fire(name){return handlers.get(name)?.();},
          setAttribute(name,value){attributes.set(name,value);},getAttribute:name=>attributes.get(name),
          removeAttribute:name=>attributes.delete(name),showModal(){this.open=true;},close(){this.open=false;},focus(){}});
      }
      return ui.get(id);
    },
    createElement(tag){
      const events=new Map();
      const frame={tag,src:'',removed:false,ready:false,contentWindow:null,requests:[],
        setAttribute(){},addEventListener(name,fn){events.set(name,fn);},
        removeEventListener(name,fn){if(events.get(name)===fn)events.delete(name);},
        fire(name){events.get(name)?.();},remove(){frame.removed=true;},
        get eventCount(){return events.size;}};
      return frame;
    },
    body:{append(frame){
      frames.push(frame);frame.surface=svgSurface(frame.src.split('/').at(-1));
      frame.contentWindow={postMessage(request){
        frame.requests.push(request);
        if(!frame.ready)return;
        frame.surface.receive(request);emit(frame.contentWindow,frame.surface.messages.at(-1));
      }};
      // Chargement signalé avant l'installation du bridge ; ready est manqué.
      frame.fire('load');
    }}
  };
  const window={addEventListener(name,fn){if(name==='message')listeners.add(fn);},
    removeEventListener(name,fn){if(name==='message')listeners.delete(fn);}};
  const context=vm.createContext({window,document,AbortController,
    setTimeout(fn){const id=++timerId;timeouts.set(id,fn);return id;},clearTimeout:id=>timeouts.delete(id),
    setInterval(fn){const id=++timerId;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id)});
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../centurion-certificate.js'),'utf8'),context);
  return {api:window.CenturionCertificate,frames,emit,get:id=>document.getElementById(id),
    retry(){for(const callback of [...intervals.values()])callback();},
    expire(){for(const callback of [...timeouts.values()])callback();},
    get pending(){return {listeners:listeners.size,timeouts:timeouts.size,intervals:intervals.size,
      frames:frames.filter(frame=>!frame.removed).length};}};
}
module.exports={certificateCaptureSurface};
