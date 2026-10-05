const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const E=require('../centurion-engine.js');
const app=fs.readFileSync(path.join(__dirname,'../centurion-app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../centurion.html'),'utf8');
const close=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

function element(attrs={},dataset={}) {
  return Object.assign({value:'',min:'',max:'',step:'1',disabled:false,dataset,events:{},
    addEventListener(name,fn){this.events[name]=fn;},
    matches(selector){return selector==='input[data-rod]'?Boolean(this.dataset.rod)
      :selector==='input[data-axial-rod]'?Boolean(this.dataset.axialRod):false;}
  },attrs);
}
function setup() {
  const elements={rodWorthControls:element(),axialShapeControls:element()};
  for(const match of html.matchAll(/<input\b[^>]*>/g)) {
    const attrs=Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)]
      .map(([,name,value])=>[name,value]));
    if(attrs.id)elements[attrs.id]=element(attrs);
  }
  const model=E.make(),ctx=vm.createContext({E,model,$:id=>elements[id],render:()=>{}});
  const fields=app.slice(app.indexOf('  const NUMBER_PARAMETERS='),app.indexOf('  let model='));
  const handlers=app.slice(app.indexOf('  function bindNumber('),app.indexOf('  function renderManualExtras()'));
  vm.runInContext(fields+handlers+'globalThis.fields=NUMBER_PARAMETERS;bindModelParameters();',ctx);
  for(const [id,key] of ctx.fields)elements[id].value=String(model.controls[key]);
  const fire=(container,input,event='input',deltaY)=>{
    let prevented=false;
    container.events[event]({target:input,deltaY,preventDefault(){prevented=true;}});
    return prevented;
  };
  return {model,elements,fields:ctx.fields,fire};
}

test('coefficients modérateur et Doppler : valeurs courantes dans la cinétique, valeurs initiales conservées',()=>{
  const m=E.make(),s=m.state,u=m.controls;
  assert.equal(u.coolantWorthPcmC,-30);assert.equal(u.dopplerWorthPcmC,-2.6);
  u.protectionsEnabled=false;s.tavgC=E.C.primaryMeanC-2;s.fuelC=E.C.fuelC+10;
  u.coolantWorthPcmC=-40;u.dopplerWorthPcmC=-2;
  E.step(m,.1);
  close(s.reactivityParts.temp,80);close(s.reactivityParts.doppler,-20);
  close(s.reactivityPcm,60);assert.ok(s.powerPct>100);
  const power=s.powerPct,time=s.time;
  u.coolantWorthPcmC=0;u.dopplerWorthPcmC=-3;E.refreshReactivity(m);
  close(s.reactivityParts.temp,0);
  close(s.reactivityParts.doppler,-3*(s.fuelC-E.C.fuelC));
  assert.equal(s.powerPct,power);assert.equal(s.time,time);
  assert.equal(E.make().controls.coolantWorthPcmC,-30);
  assert.equal(E.make().controls.dopplerWorthPcmC,-2.6);
});

test('tous les paramètres numériques fixes : saisie, molette dans les deux sens et changement sans perte de focus',()=>{
  const {model,elements,fields,fire}=setup();
  for(const [id,key] of fields) {
    const input=elements[id],step=Number(input.step),value=model.controls[key]+step;
    input.value=String(value);fire(input,input);
    close(model.controls[key],value);
    assert.equal(fire(input,input,'wheel',-1),true);close(model.controls[key],value+step);
    assert.equal(fire(input,input,'wheel',1),true);close(model.controls[key],value);
    input.value=String(value-step);fire(input,input,'change');close(model.controls[key],value-step);
  }
  assert.equal(model.state.time,0);
});

test('les neuf poids de groupes modifiés par la molette actualisent réellement la réactivité en pause',()=>{
  const {model,elements,fire}=setup();
  for(const name of E.ROD_NAMES)model.state.rods[name]=130;
  E.refreshReactivity(model);
  for(const name of E.ROD_NAMES) {
    const input=element({value:String(model.controls.rodWorthPcm[name]),min:'0',max:'3000',step:'25'},{rod:name});
    const before=model.state.reactivityParts.rod,old=model.controls.rodWorthPcm[name];
    fire(elements.rodWorthControls,input,'wheel',-1);
    close(model.controls.rodWorthPcm[name],old+25);
    const baseline=name==='R'?233:260;
    close(model.state.reactivityParts.rod-before,25*(E.rodIntegral(130)-E.rodIntegral(baseline)));
    fire(elements.rodWorthControls,input,'wheel',1);
    close(model.controls.rodWorthPcm[name],old);close(model.state.reactivityParts.rod,before);
  }
  assert.equal(model.state.time,0);
});

test('champs des deux coefficients : bilan en pause actualisé à la saisie et à la molette',()=>{
  const {model,elements,fire}=setup(),s=model.state;
  s.tavgC=E.C.primaryMeanC-2;s.fuelC=E.C.fuelC+10;
  elements.moderatorCoefficient.value='-40';fire(elements.moderatorCoefficient,elements.moderatorCoefficient);
  close(s.reactivityParts.temp,80);
  fire(elements.dopplerCoefficient,elements.dopplerCoefficient,'wheel',1);
  close(s.reactivityParts.doppler,-27);close(s.reactivityPcm,53);
  assert.equal(s.time,0);assert.equal(s.powerPct,100);
});

test('coefficients axiaux et Fxy : profil et PLIN recalculés immédiatement en pause',()=>{
  const {model,elements,fire}=setup();
  for(const name of Object.keys(E.AXIAL_ROD_ABSORPTION))model.state.rods[name]=130;
  E.refreshAxial(model);
  for(const name of Object.keys(E.AXIAL_ROD_ABSORPTION)) {
    const before=[...model.state.axialShape32],old=model.controls.axialRodAbsorption[name];
    const input=element({value:String(old),min:'0',max:'1',step:'.001'},{axialRod:name});
    fire(elements.axialShapeControls,input,'wheel',-1);
    close(model.controls.axialRodAbsorption[name],old+.001);
    assert.ok(model.state.axialShape32.some((v,i)=>Math.abs(v-before[i])>1e-10),name);
  }
  for(const [id,key,grapped] of [['fxyGraped','fxYGraped',true],['fxyUngraped','fxYUngraped',false]]) {
    Object.keys(model.state.rods).forEach(name=>{model.state.rods[name]=grapped?0:260;});
    E.refreshAxial(model);
    // Converger le profil après le changement de positions avant d'isoler Fxy.
    for(let i=0;i<20;i++)E.refreshAxial(model);
    const pline=model.state.peakLinearWcm,old=model.controls[key];
    fire(elements[id],elements[id],'wheel',-1);
    close(model.state.peakLinearWcm,pline*(old+.01)/old,1e-3);
  }
  assert.equal(model.state.time,0);
});

test('champs numériques : bornes cohérentes, décimales, valeurs vides et champs désactivés',()=>{
  const {model,elements,fire}=setup(),input=elements.fxyUngraped;
  input.value='2.49';fire(input,input);fire(input,input,'wheel',-1);
  assert.equal(input.value,'2.5');assert.equal(model.controls.fxYUngraped,2.5);
  fire(input,input,'wheel',-1);assert.equal(input.value,'2.5');
  input.value='0';fire(input,input);assert.equal(input.value,'1');
  assert.equal(model.controls.fxYUngraped,1);
  for(const value of ['', 'abc', 'Infinity']) {
    input.value=value;fire(input,input);assert.equal(model.controls.fxYUngraped,1);
    assert.equal(fire(input,input,'wheel',-1),false);
  }
  input.value='1.5';input.disabled=true;fire(input,input);
  assert.equal(fire(input,input,'wheel',-1),false);assert.equal(model.controls.fxYUngraped,1);
  assert.equal(fire(elements.rodWorthControls,element(),'wheel',-1),false);
});

test('poids du xénon : calage nominal équilibré, excès non compensé et application réelle à la cinétique',()=>{
  for(const worth of [0,1500,3000,5000,10000]) {
    const model=E.make(),s=model.state,u=model.controls;
    u.xenonEquilibriumWorthPcm=worth;u.protectionsEnabled=false;
    E.refreshAxial(model);E.refreshReactivity(model);
    close(s.xenonWorthPcm,-worth);close(s.reactivityParts.coreReference,worth);
    close(s.reactivityPcm,0);
    s.xenon32.fill(1.1);E.refreshAxial(model);E.refreshReactivity(model);
    close(s.xenonWorthPcm,-1.1*worth);close(s.reactivityPcm,-.1*worth);
    E.step(model,.1);close(s.reactivityParts.xenon,-1.1*worth);
    if(worth>0)assert.ok(s.powerPct<100);
    else close(s.powerPct,100);
  }
  assert.equal(E.make().controls.xenonEquilibriumWorthPcm,3000);
});

test('poids du xénon : réglage immédiat à la molette sans effacer l’iode ni le xénon',()=>{
  const {model,elements,fire}=setup(),s=model.state,input=elements.xenonWorth;
  s.xenon32.fill(1.2);E.refreshAxial(model);E.refreshReactivity(model);
  const iodine=[...s.iodine32],xenon=[...s.xenon32];
  input.value='4000';fire(input,input);
  close(s.xenonWorthPcm,-4800);close(s.reactivityPcm,-800);
  fire(input,input,'wheel',-1);close(s.xenonWorthPcm,-4920);close(s.reactivityPcm,-820);
  assert.deepEqual(s.iodine32,iodine);assert.deepEqual(s.xenon32,xenon);
  assert.equal(s.time,0);
  input.value='0';fire(input,input);close(s.xenonWorthPcm,0);close(s.reactivityPcm,0);
  fire(input,input,'wheel',1);assert.equal(input.value,'0');
});

test('poids nul : le profil xénon ne déforme plus la forme axiale ; poids non nul : effet présent',()=>{
  const models=[E.make(),E.make()];
  for(const [j,model] of models.entries()) {
    model.controls.xenonEquilibriumWorthPcm=0;
    model.state.xenon32=model.state.xenon32.map((_,i)=>i<16?(j?.3:1.7):(j?1.7:.3));
    E.refreshAxial(model);
  }
  models[0].state.axialShape32.forEach((value,i)=>close(value,models[1].state.axialShape32[i]));
  models[1].controls.xenonEquilibriumWorthPcm=4000;E.refreshAxial(models[1]);
  assert.ok(Math.abs(models[0].state.dpaxPctPn-models[1].state.dpaxPctPn)>1);
});

test('calage xénon : le mode axial reste positif sur toute la plage de poids, même sans xénon',()=>{
  for(const worth of [0,1500,3000,6000,10000])for(const profile of [[0,0],[0,2],[2,0],[4,4]]) {
    const model=E.make(),s=model.state;
    model.controls.xenonEquilibriumWorthPcm=worth;s.coreFlowFraction=.1;
    s.xenon32=s.xenon32.map((_,i)=>profile[i<16?0:1]);
    E.refreshAxial(model);
    assert.ok(s.axialShape32.every(value=>Number.isFinite(value)&&value>0),`${worth} / ${profile}`);
    close(s.axialShape32.reduce((sum,value)=>sum+value,0)/32,1);
    assert.ok(Math.abs(s.dpaxPctPn)<=s.powerPct);
  }
});
