const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const E=require('../centurion-engine.js');

const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'centurion-app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'centurion.html'),'utf8');

function canvas() {
  const strokes=[],arcs=[],labels=[],rects=[],operations=[];
  let pathPoints=[],dash=[];
  const ctx={strokes,arcs,
    setTransform(){},fillRect(x,y,w,h){const rect={color:this.fillStyle,x,y,w,h};rects.push(rect);operations.push(rect);},
    fillText(label){labels.push(String(label));},save(){},restore(){},
    setLineDash(value){dash=[...value];},translate(){},rotate(){},fill(){},
    beginPath(){pathPoints=[];},
    moveTo(x,y){pathPoints.push([x,y]);},
    lineTo(x,y){pathPoints.push([x,y]);},
    arc(x,y,r){arcs.push({x,y,r});},
    stroke(){const stroke={color:this.strokeStyle,width:this.lineWidth,dash:[...dash],points:[...pathPoints]};strokes.push(stroke);operations.push(stroke);}
  };
  return {strokes,arcs,labels,rects,operations,getBoundingClientRect(){return {width:620,height:480};},
    getContext(){return ctx;}};
}

test('synoptique Cœur : deux courbes, trace rouge limitée à la durée choisie et curseur actuel',()=>{
  assert.ok(html.indexOf('data-diagram="rcp"')<html.indexOf('data-diagram="core"'));
  assert.ok(html.indexOf('data-diagram="core"')<html.indexOf('data-diagram="pzr"'));
  for(const id of ['coreProfileChart','corePilotChart','coreTrailWindow','coreXenonReadout','coreIodineReadout'])
    assert.match(html,new RegExp(`id="${id}"`));
  const profile=canvas(),pilot=canvas(),model=E.make(),state=model.state;
  state.time=3600;
  state.history=[
    {t:0,dpax:-1,power:100},
    {t:1200,dpax:-3,power:75},
    {t:3300,dpax:-2,power:40},
    {t:3599,dpax:-1.5,power:30}
  ];
  state.powerPct=30;state.dpaxPctPn=-1.4;
  const elements={coreProfileChart:profile,corePilotChart:pilot,
    coreTrailWindow:{value:'300'},coreLinearReadout:{textContent:''},
    coreXenonReadout:{textContent:''},coreIodineReadout:{textContent:''},coreDpaxReadout:{textContent:'',
      classList:{toggle:(name,yes)=>{elements.coreDpaxReadout.blink=Boolean(yes);}}}};
  const source=app.slice(app.indexOf('  function drawCoreCharts()'),
    app.indexOf('  function drawHistory()'));
  assert.match(source,/function drawCoreCharts/);
  const context=vm.createContext({window:{devicePixelRatio:1},E,
    model,$:(id)=>elements[id],
    fmt:(value,d=0)=>Number(value).toFixed(d)});
  vm.runInContext(`let activeView='synoptiques',diagram='core';${source}
    globalThis.draw=drawCoreCharts;`,context);
  context.draw();
  const shortTrail=pilot.strokes.findLast(s=>s.color==='#e45b53'&&s.points.length>1);
  assert.equal(shortTrail.points.length,3);
  assert.equal(pilot.arcs.at(-1).r,6);
  assert.match(elements.coreDpaxReadout.textContent,/−?1.40|\-1.40/);
  assert.equal(elements.coreDpaxReadout.blink,false);
  assert.ok(profile.strokes.some(s=>s.color==='#159ec3'&&s.points.length>64));
  const xenon=profile.strokes.find(s=>s.color==='#9766b8'&&s.points.length>64);
  assert.ok(xenon,'profil xénon axial');
  const zero=profile.strokes.find(s=>s.color==='#466174');
  assert.ok(xenon.points.every(point=>point[0]<zero.points[0][0]));
  const iodine=profile.strokes.find(s=>s.color==='#c99232'&&s.points.length>64);
  assert.ok(iodine.points.every(point=>point[0]<zero.points[0][0]));
  assert.ok(iodine.dash.length>0,'iode en pointillé sur sa propre échelle');
  assert.match(elements.coreIodineReadout.textContent,/1.00.*nominal/);
  assert.match(elements.coreXenonReadout.textContent,/−3000|−3 000|-3000/);
  assert.ok(profile.labels.includes('−2000'),'borne Xe en pcm/m');
  assert.ok(profile.labels.includes('2.00'), 'borne P(z) fixée à 2');
  assert.match(elements.coreLinearReadout.textContent,/P\(z\) max/);
  assert.ok(profile.labels.includes('P(z) · relatif'));
  assert.ok(profile.labels.includes('PLIN · W/cm (0–435)'));
  assert.ok(profile.labels.includes('435'));
  const bars=profile.rects.filter(rect=>rect.color==='#d5e5f6');
  assert.equal(bars.length,32);
  const extent=600-zero.points[0][0];
  bars.forEach((bar,i)=>assert.ok(Math.abs(bar.w-extent*state.linearWcm32[i]/435)<1e-8));
  const powerCurve=profile.strokes.find(stroke=>stroke.color==='#159ec3');
  assert.ok(profile.operations.indexOf(bars.at(-1))<profile.operations.indexOf(powerCurve));
  state.linearWcm32.fill(600);state.peakLinearWcm=600;context.draw();
  assert.ok(profile.rects.filter(rect=>rect.color==='#d5e5f6').slice(-32)
    .every(rect=>Math.abs(rect.w-extent)<1e-9));
  assert.match(elements.coreLinearReadout.textContent,/600.*hors échelle/);
  assert.equal(state.peakLinearWcm,600,'aucun écrêtage de la valeur physique/protection');
  assert.ok(profile.labels.includes('Xe · pcm/m'));
  const axis=pilot.strokes.find(s=>s.color==='#324f62');
  const rightLimit=pilot.strokes.find(s=>s.color==='#d49324');
  const reference=pilot.strokes.find(s=>s.color==='#7b65ac');
  assert.equal(axis.points.length,2);
  assert.ok(axis.width>=2);
  assert.equal(rightLimit.points.length,3);
  assert.equal(reference.points.length,2);
  assert.equal(rightLimit.points[0][0],axis.points[0][0]);
  assert.ok(rightLimit.points[1][0]>rightLimit.points[2][0]);
  assert.ok(rightLimit.points[2][0]>axis.points[0][0]);
  assert.ok(Math.abs((rightLimit.points[1][0]-rightLimit.points[0][0])
    /(rightLimit.points[2][0]-rightLimit.points[0][0])-15/6)<1e-9);
  assert.ok(Math.abs((rightLimit.points[0][1]-rightLimit.points[1][1])
    /(rightLimit.points[0][1]-rightLimit.points[2][1])-15/100)<1e-9);
  assert.ok(reference.points[1][0]<axis.points[0][0]);
  state.powerPct=100;state.dpaxPctPn=6.01;context.draw();
  assert.equal(elements.coreDpaxReadout.blink,true);
  state.dpaxPctPn=6;context.draw();
  assert.equal(elements.coreDpaxReadout.blink,false);
  elements.coreTrailWindow.value='3600';
  context.draw();
  const longTrail=pilot.strokes.findLast(s=>s.color==='#e45b53'&&s.points.length>1);
  assert.equal(longTrail.points.length,5);
  model.controls.xenonEquilibriumWorthPcm=4000;E.refreshReactivity(model);context.draw();
  const adjustedXenon=profile.strokes.findLast(s=>s.color==='#9766b8'&&s.points.length>64);
  const origin=zero.points[0][0];
  for(let i=0;i<xenon.points.length;i++)assert.ok(Math.abs(
    (origin-adjustedXenon.points[i][0])/(origin-xenon.points[i][0])-4/3)<1e-9);
  assert.match(elements.coreXenonReadout.textContent,/-4000/);
  model.controls.xenonEquilibriumWorthPcm=0;E.refreshReactivity(model);context.draw();
  const noXenon=profile.strokes.findLast(s=>s.color==='#9766b8'&&s.points.length>64);
  assert.ok(noXenon.points.every(point=>point[0]===origin));
});
