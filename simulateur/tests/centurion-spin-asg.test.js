const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../centurion-engine.js');
const close=(actual,expected,tol=1e-8)=>assert.ok(Math.abs(actual-expected)<tol,`${actual} != ${expected}`);
const rods=(inserted=[])=>Object.fromEntries(E.ROD_NAMES.map(name=>[name,inserted.includes(name)?0:260]));

test('Fxy : zones non grappées à 1,4, toutes les colonnes DDC et prolongement au pied',()=>{
  assert.deepEqual(E.spinFxy32(rods()),Array(32).fill(1.4));
  const configurations=[['G1'],['R'],['R','G1'],['G1','G2'],['R','G1','G2'],['G1','G2','N1'],['G1','G2','N1','N2']];
  const expected=[
    [1.597,1.632,1.688,1.667,1.675,2.021,2.500],
    [1.583,1.596,1.650,1.706,1.704,1.965,2.500],
    [1.570,1.559,1.612,1.746,1.732,1.908,2.500],
    [1.557,1.523,1.574,1.785,1.760,1.852,2.200]];
  configurations.forEach((names,column)=>{
    const values=E.spinFxy32(rods(names));
    for(const [i,z] of [0,19,20,31].entries())close(values[z],expected[i][column]);
    close(values[0],values[1]);
  });
  close(E.spinFxy32(rods(['G2']))[16],2.5,'1e-8');
  close(E.spinFxy32(rods(['SA']))[31],2.2);
});

test('Fxy : interpolation de la pointe, correction en puissance et coefficient de table',()=>{
  const position=260*(1-0.5/32),values=E.spinFxy32({...rods(),G1:position});
  close(values[31],(1.4+1.557)/2);
  assert.ok(values.slice(0,31).every(value=>value===1.4));
  const low=E.spinFxy32(rods(['G1','G2']),1.4,1.1,.5);
  close(low[16],1.667*1.1*1.15);
  close(E.spinFxy32(rods(),1.4,1.1,0)[16],1.4*1.3);
});

test('SPIN : PLIN maximum, FΔH intégral et enthalpie du canal chaud cohérents avec les 32 cotes',()=>{
  const m=E.make(),s=m.state;
  assert.equal(m.controls.fxYUngraped,1.4);assert.equal(m.controls.fxYGraped,1);
  close(s.dnbr,1.65);assert.ok(s.peakLinearWcm>360&&s.peakLinearWcm<380);
  Object.assign(s.rods,rods(['G1','G2']));E.refreshAxial(m);
  let integral=0;
  s.axialShape32.forEach((value,i)=>{
    close(s.linearWcm32[i],170.23*s.thermalPowerMW/3817*value*s.fxy32[i]);
    integral+=value*s.fxy32[i]/32;
  });
  close(s.fDeltaH,integral);
  close(s.peakLinearWcm,Math.max(...s.linearWcm32));
  close(s.hotChannelOutletEnthalpyKJkg,6*(s.coldC+(s.hotC-s.coldC)*integral));
  close(s.coreOutletEnthalpyKJkg,6*(s.coldC+(s.hotC-s.coldC)/.93));
  assert.ok(s.hotChannelTemp32.every((v,i,a)=>i===0||v>a[i-1]));
  close(s.dnbr,Math.min(...s.dnbr32));
});

test('SPIN : Fxy pénalise PLIN et DNBR sans changer la réactivité, les grappes ou le DPAX',()=>{
  const m=E.make(),s=m.state;
  Object.assign(s.rods,rods());for(let i=0;i<20;i++)E.refreshAxial(m);
  E.refreshReactivity(m);
  const before={plin:s.peakLinearWcm,dnbr:s.dnbr,dpax:s.dpaxPctPn,rho:s.reactivityPcm,rods:{...s.rods}};
  m.controls.fxYUngraped=1.6;E.refreshAxial(m);E.refreshReactivity(m);
  close(s.peakLinearWcm,before.plin*1.6/1.4);
  assert.ok(s.dnbr<before.dnbr);close(s.fDeltaH,1.6);
  close(s.dpaxPctPn,before.dpax,1e-5);close(s.reactivityPcm,before.rho);
  assert.deepEqual(s.rods,before.rods);
  const reference=s.dnbr;s.coreFlowFraction=.1;E.refreshAxial(m);
  assert.ok(s.dnbr<reference,'perte de débit pénalise la marge locale');
});

test('ASG : démarrage sur ordre explicite, avec ARE arrêtée et coupure haut niveau en CIA',()=>{
  const nominal=E.make();E.advance(nominal,10);
  assert.equal(nominal.state.totalAsgKgS,0);assert.equal(nominal.state.asgAt,null);
  for(const initiator of ['trip','voltage']){
    const m=E.make();E.initiate(m,initiator);E.initiate(m,'asg',{source:'cc-protect'});E.advance(m,4);
    assert.equal(m.state.totalAsgKgS,0);
    E.advance(m,26);const s=m.state;
    assert.ok(s.asgAt!==null&&s.asgAt>=5&&s.asgAt<6);
    assert.ok(s.gv.every(g=>g.asgKgS>35&&g.asgCoolingMW>0));
    close(s.totalFeedKgS,s.gv.reduce((sum,g)=>sum+g.feedKgS+g.asgKgS,0));
    close(s.totalAsgKgS,s.gv.reduce((sum,g)=>sum+g.asgKgS,0));
    assert.ok(s.gv.every(g=>g.feedKgS<15));
    const dt=.1,water=s.gv.map(g=>g.waterKg),temps=s.gv.map(g=>g.tempC);
    E.step(m,dt);
    s.gv.forEach((g,i)=>{
      close(g.waterKg-water[i],(g.feedKgS+g.asgKgS-g.steamKgS)*dt);
      close((g.tempC-temps[i])*g.thermalCapacityJk/1e6,
        (g.heatMW-g.steamKgS*g.steamLatentJkg/1e6-g.areCoolingMW-g.asgCoolingMW)*dt);
    });
    assert.equal(s.events.filter(e=>e.text.startsWith('ASG démarrée')).length,1);
  }
  const m=E.make();E.initiate(m,'trip');E.initiate(m,'asg');E.advance(m,6);
  m.state.gv[0].waterKg=1.2*E.C.gvNominalWaterKg;
  m.state.gv[1].waterKg=.8*E.C.gvNominalWaterKg;
  for(const g of m.state.gv){g.pressureBar=65;g.asgKgS=60;}
  E.step(m,.1);assert.ok(m.state.gv[0].asgKgS<m.state.gv[1].asgKgS);
  assert.equal(m.state.gv[0].asgRunning,false);assert.equal(m.state.gv[1].asgRunning,true);
});

test('ASG : loi de pression, disponibilité et inventaire GV alimenté',()=>{
  for(const [p,q] of [[80,127],[60,140],[40,152],[30,157]])close(E.asgFlowKgS(p)*3.6,q);
  close(E.asgFlowKgS(65)*3.6,136.75);
  const off=E.make();off.controls.asgAvailable=false;E.initiate(off,'voltage');E.advance(off,20);
  assert.equal(off.state.totalAsgKgS,0);assert.equal(off.state.asgAt,null);
  const on=E.make();E.initiate(on,'voltage');E.initiate(on,'asg');E.advance(on,20);
  assert.ok(on.state.gv.every((g,i)=>g.waterKg>off.state.gv[i].waterKg+(g.asgType==='MPS'?250:450)));
});
