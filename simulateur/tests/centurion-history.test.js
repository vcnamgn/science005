const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../centurion-engine.js');

const app = fs.readFileSync(path.join(__dirname, '../centurion-app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../centurion.html'), 'utf8');

function canvas(height) {
  const strokes = [];
  const labels = [];
  let currentPath = [];
  const context = {
    strokes, labels,
    setTransform() {}, clearRect() {}, fillRect() {},
    fillText(text) { labels.push(String(text)); },
    beginPath() { currentPath = []; },
    moveTo(x, y) { currentPath.push([x,y]); },
    lineTo(x, y) { currentPath.push([x,y]); },
    stroke() { strokes.push({color: this.strokeStyle,
      xs: currentPath.map(([x])=>x), ys: currentPath.map(([,y])=>y)}); }
  };
  return {
    strokes, labels,
    getBoundingClientRect: () => ({width: 800, height}),
    getContext: () => context
  };
}

function point(t) {
  return {t, power: 100, thermalPower:100,residualPower:0,electric: 1300, cold: 288.4,tavg: 306.5,
    hot: 324.6,tric: 326.9,pzrTemp: 344.79,
    reactivity: 0, pressure: 155, gvPressure: [65,65,65,65],
    gv: [55,55,55,55],gvTemp: [280.9,280.9,280.9,280.9],
    pzrLevel: 42,rods:{R:220,G1:260,G2:260,N1:260,N2:260,SA:260},
    r: 220,g3:780,ris:0,break:0,breakDensity:720,
    steamTotal:2200,steamGctA:80,steamVpu:2120};
}

function chartHarness() {
  const main = canvas(350), reactivity = canvas(140);
  const state = {time: 7200, history: Array.from({length: 73}, (_, i) => point(i * 100))};
  const slider = {min: '300', max: '300', value: '300', disabled: true,
    setAttribute(name, value) { this[name] = value; }};
  const elements = {historyChart: main, reactivityChart: reactivity,
    historyWindow: {value: '300'}, historyScrubber: slider,
    historyLive: {disabled: true}, historyRangeLabel: {textContent: ''},
    historyOldestLabel: {textContent: ''}, historyNewestLabel: {textContent: ''},
    historyLegend: {innerHTML: ''}, traceSet: {value: 'powers'},
    historyGv: {value: '1'}};
  const context = vm.createContext({window: {devicePixelRatio: 1},
    model: {state}, E, $: id => elements[id]});
  const timeLabel = app.slice(app.indexOf('  const tLabel='), app.indexOf('  const names='));
  const drawHistory = app.slice(app.indexOf('  function drawHistory()'),
    app.indexOf('  function drawLoadProgramChart()'));
  assert.ok(timeLabel && drawHistory.includes('historyScrubber'));
  vm.runInContext(`${timeLabel}\nlet activeView='graphiques', selectedGv=1;
    let historyFollowing=true, historyEndS=null;
    ${drawHistory}
    globalThis.chart={draw:drawHistory,
      seek(end){historyEndS=end;historyFollowing=end>=Number($("historyScrubber").max);drawHistory();},
      live(){historyFollowing=true;drawHistory();},
      reset(){historyFollowing=true;historyEndS=null;drawHistory();}};`, context);
  return {state, elements, main, reactivity, chart: context.chart};
}

test('quatre échelles et navigation synchronisée des mesures et de la réactivité', () => {
  for (const seconds of [300, 1800, 3600, 14400])
    assert.match(html, new RegExp(`<option value="${seconds}">`));
  const {state, elements, main, reactivity, chart} = chartHarness();
  elements.historyWindow.value = '14400';
  chart.draw();
  assert.equal(elements.historyRangeLabel.textContent, '00:00:00 – 04:00:00');
  assert.equal(elements.historyScrubber.disabled, true);

  elements.historyWindow.value = '300';
  chart.draw();
  assert.equal(elements.historyScrubber.min, '300');
  assert.equal(elements.historyScrubber.max, '7200');
  assert.equal(elements.historyRangeLabel.textContent, '01:55:00 – 02:00:00');
  chart.seek(3600);
  assert.equal(elements.historyRangeLabel.textContent, '00:55:00 – 01:00:00');
  assert.equal(elements.historyLive.disabled, false);
  const powerLine = main.strokes.findLast(stroke => stroke.color === '#159ec3');
  const reactivityLine = reactivity.strokes.findLast(stroke => stroke.color === '#a466c8');
  assert.equal(powerLine.xs.length, 4);
  assert.deepEqual(powerLine.xs, reactivityLine.xs);

  state.time = 7500;
  state.history.push(point(7300), point(7400), point(7500));
  chart.draw();
  assert.equal(elements.historyRangeLabel.textContent, '00:55:00 – 01:00:00');
  chart.live();
  assert.equal(elements.historyRangeLabel.textContent, '02:00:00 – 02:05:00');
  assert.equal(elements.historyLive.disabled, true);

  state.time = 18000;
  state.history = Array.from({length: 181}, (_, i) => point(i * 100));
  elements.historyWindow.value = '14400';
  chart.draw();
  assert.equal(elements.historyScrubber.disabled, false);
  chart.seek(14400);
  assert.equal(elements.historyRangeLabel.textContent, '00:00:00 – 04:00:00');

  state.time = 0;
  state.history = [];
  elements.historyWindow.value = '300';
  chart.reset();
  assert.equal(elements.historyRangeLabel.textContent, '00:00:00 – 00:05:00');
  assert.equal(elements.historyScrubber.disabled, true);
});

test('les axes affichent les valeurs physiques et les groupes utilisent deux échelles', () => {
  const {state, elements, main, chart} = chartHarness();
  chart.draw();
  assert.match(elements.historyLegend.innerHTML, /Cœur · % PN/);
  assert.ok(main.labels.includes('% nominal'));
  assert.ok(main.labels.includes('110'), 'la borne de puissance suit 100 % avec une marge');
  state.history.at(-1).power = 135;
  main.labels.length = 0;
  chart.draw();
  assert.ok(main.labels.includes('140'), 'la borne supérieure suit un dépassement de 130 %');
  elements.traceSet.value = 'temperatures';
  main.labels.length = 0;
  chart.draw();
  assert.ok(main.labels.includes('°C'));
  assert.match(elements.historyLegend.innerHTML, /Branche froide.*T moyenne.*Branche chaude.*T RIC.*Pressuriseur/);
  assert.doesNotMatch(elements.historyLegend.innerHTML, /TCRA|crayon/i);
  elements.traceSet.value = 'pressures';
  main.labels.length = 0;
  chart.draw();
  assert.ok(main.labels.includes('bar'));
  assert.ok(main.labels.includes('160'));
  assert.match(elements.historyLegend.innerHTML, /Circuit primaire.*GV 1/);
  elements.traceSet.value = 'levels';
  chart.draw();
  assert.match(elements.historyLegend.innerHTML, /Pressuriseur.*GV 1/);
  assert.doesNotMatch(elements.historyLegend.innerHTML, /RGL/);
  elements.traceSet.value = 'rods';
  main.labels.length = 0;
  chart.draw();
  assert.ok(main.labels.includes('pas extraits'));
  assert.ok(main.labels.includes('pas de chevauchement extraits'));
  assert.ok(main.labels.includes('780'));
  assert.match(elements.historyLegend.innerHTML, /R.*G1.*G2.*N1.*N2.*SA.*GCP.*axe droit/);
  elements.traceSet.value = 'flows';
  main.labels.length = 0;
  chart.draw();
  assert.ok(main.labels.includes('m³/h'));
  elements.traceSet.value = 'steam';
  main.labels.length = 0;
  chart.draw();
  assert.ok(main.labels.includes('kg/s'));
  assert.match(elements.historyLegend.innerHTML,/Débit vapeur total.*Débit GCT-A.*Débit VPU/);
  for(const color of ['#159ec3','#ec684b','#55a579'])
    assert.ok(main.strokes.findLast(stroke=>stroke.color===color).xs.length>0);
  elements.traceSet.value = 'secondaryTemperatures';
  elements.historyGv.value = '2';
  chart.draw();
  assert.match(elements.historyLegend.innerHTML, /Vapeur GV 2.*Eau alimentaire ARE/);
});

test('quatre heures de températures primaires se tracent sans débordement de pile', () => {
  const {state,elements,chart} = chartHarness();
  state.time = 14400;
  state.history = Array.from({length:14401},(_,t)=>point(t));
  elements.historyWindow.value = '14400';
  elements.traceSet.value = 'temperatures';
  assert.doesNotThrow(()=>chart.draw());
});

test('l’échantillon conserve les mesures nécessaires aux courbes', () => {
  const model = E.make();
  E.step(model, 0.1);
  const p = model.state.history.at(-1);
  assert.ok(p);
  for (const key of ['cold','hot','tric','pzrTemp','pzrLevel','gvPressure','gvTemp','rods','breakDensity',
    'steamTotal','steamGctA','steamVpu','thermalPower','residualPower'])
    assert.ok(p[key] !== undefined, key);
  assert.equal(p.rods.R, model.state.rods.R);
  assert.equal(p.gvPressure[0], model.state.gv[0].pressureBar);
  assert.equal(p.pzrLevel, model.state.pzrLevelPct);
  assert.ok(Math.abs(p.steamTotal-p.steamGctA-p.steamVpu)<1e-9);
});

test('historique après AAR : courbes de fission, thermique totale et résiduelle distinctes',()=>{
  const model=E.make();E.initiate(model,'trip');E.advance(model,60);
  const point=model.state.history.at(-1);
  assert.ok(point.residualPower>2&&point.residualPower<4);
  assert.ok(Math.abs(point.thermalPower-point.power-point.residualPower)<1e-8);
  const h=chartHarness();h.state.time=model.state.time;h.state.history=model.state.history;
  h.chart.draw();
  assert.match(h.elements.historyLegend.innerHTML,/fission.*Thermique cœur.*Résiduelle/);
  const residual=h.main.strokes.findLast(stroke=>stroke.color==='#d0a231');
  const thermal=h.main.strokes.findLast(stroke=>stroke.color==='#a466c8');
  assert.ok(residual&&thermal&&residual.ys.length>1);
  assert.equal(residual.ys.length,thermal.ys.length);
});

test('historique vapeur : un GCT-A débitant est distinct du VPU et inclus dans le total',()=>{
  const m=E.make();m.controls.protectionsEnabled=false;
  m.controls.gctAOpeningPressureBar=60; // Maintenir le rejet pendant la fenêtre échantillonnée.
  m.state.gv[1].tempC=E.C.gctATempC+1;
  m.state.gv[1].pressureBar=E.saturationPressureBar(m.state.gv[1].tempC);
  E.advance(m,2);
  const point=m.state.history.at(-1);
  assert.ok(point.steamGctA>0);
  assert.ok(point.steamVpu>0);
  assert.ok(Math.abs(point.steamTotal-point.steamGctA-point.steamVpu)<1e-9);
});

test('les mesures restent disponibles au-delà de quatre heures avec une limite de huit heures', () => {
  const afterFourHours = E.make();
  afterFourHours.state.history = Array.from({length: 14400}, (_, i) => ({t: i}));
  E.step(afterFourHours, 0.1);
  assert.equal(afterFourHours.state.history.length, 14401);

  const full = E.make();
  full.state.history = Array.from({length: 28800}, (_, i) => ({t: i}));
  E.step(full, 0.1);
  assert.equal(full.state.history.length, 28800);
  assert.equal(full.state.history[0].t, 1);
});
