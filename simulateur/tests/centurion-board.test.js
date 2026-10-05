const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const E=require('../centurion-engine.js');

test('tableau de bord : vapeur totale = GCT-A + VPU, DPAX et clignotements réversibles',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../centurion-app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../centurion.html'),'utf8');
  const elements=Object.fromEntries([...html.matchAll(/id="(board\w+|plantState)"/g)].map(([,id])=>{
    const classes=new Set(),tag={textContent:''},attributes={};
    return [id,{textContent:'',classes,classList:{toggle:(name,yes)=>yes?classes.add(name):classes.delete(name)},
      setAttribute:(name,value)=>{attributes[name]=value;},attributes,
      parentElement:{querySelector:()=>tag},tag}];
  }));
  const model=E.make(),s=model.state,g=s.gv[0];
  Object.assign(g,{steamKgS:400,dumpKgS:100,turbineSteamKgS:300});
  s.dpaxPctPn=-6.25;s.rods.R=180;
  const ctx=vm.createContext({E,model,selectedGv:1,$:id=>elements[id],
    fmt:(v,d=0)=>Number(v).toFixed(d),document:{querySelectorAll:()=>[]},renderAlarms:()=>{}});
  vm.runInContext(app.slice(app.indexOf('  function renderBoard()'),app.indexOf('  function renderAlarms('))
    +'globalThis.draw=renderBoard;',ctx);
  ctx.draw();
  assert.equal(elements.plantState.textContent,'RP');
  assert.equal(elements.plantState.attributes['data-state'],'RP');
  assert.equal(elements.boardSteam.textContent,'400 kg/s');
  assert.equal(elements.boardGcta.textContent,'100.0 kg/s');
  assert.equal(elements.boardVpu.textContent,'300 kg/s');
  assert.equal(elements.boardDpax.textContent,'-6.25 % PN');
  assert.ok(!elements.boardDpax.classes.has('alarm-blink'));
  assert.ok(elements.boardGcta.classes.has('alarm-blink'));
  assert.ok(elements.boardR.classes.has('alarm-blink'));
  g.dumpKgS=0;s.rods.R=200;ctx.draw();
  assert.ok(!elements.boardGcta.classes.has('alarm-blink'));
  assert.ok(!elements.boardR.classes.has('alarm-blink'));
  s.powerPct=50;s.dpaxPctPn=E.dpaxRightLimit(50)+0.01;ctx.draw();
  assert.ok(elements.boardDpax.classes.has('alarm-blink'));
  s.dpaxPctPn=E.dpaxRightLimit(50);ctx.draw();
  assert.ok(!elements.boardDpax.classes.has('alarm-blink'));
  ctx.selectedGv=3;ctx.draw();
  assert.equal(elements.boardGcta.tag.textContent,'GCT-A320KM');
  assert.equal(elements.boardVpu.tag.textContent,'VPU3');
  ctx.selectedGv=1;g.levelPct=100;
  model.controls.asgManual=true;model.controls.asgTrainEnabled[0]=true;ctx.draw();
  assert.match(elements.boardAsg.title,/arrêtée sur haut niveau.*aussi en manuel/);
  g.levelPct=50;
  model.controls.asgManual=false;s.asgAt=0;g.asgRunning=false;g.asgKgS=1;ctx.draw();
  assert.match(elements.boardAsg.title,/débit résiduel en décroissance/);
  g.asgKgS=0;ctx.draw();assert.match(elements.boardAsg.title,/arrêtée.*reprise sous 10/);
  s.tripAt=0;s.rods.R=0;ctx.draw();
  assert.equal(elements.plantState.textContent,'CIA');
  assert.ok(!elements.boardR.classes.has('alarm-blink'));
});
