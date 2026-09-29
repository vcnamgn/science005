const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../centurion-engine.js');
const {svgSurface} = require('./helpers/svg-surface');

test('GV1 à GV4 puis retour : tous les repères, y compris les numéros dans un tspan séparé', () => {
  const surface=svgSurface('synoptique-RCPGV-1300.svg');
  const model=E.make();
  for(const n of [1,2,3,4,1]) {
    surface.update({gv:n,gvState:model.state.gv[n-1],gvSetpoint:55});
    for(const [id,label] of [
      ['text2706',`${n}05MN`],['text5712',`${n}06MN`],['text4064',`${n}04MP`],
      ['text4376',`VVP${n}20VV`],['text3058',`VVP${n}40VV`],['text3144',`VVP${n}41VV`],
      ['text2952',`VDA${n}20VV`],['text4354',`VDA${n}10VV`],['text5974',`VDA${n}20KM`],
      ['vvp-opening-tag',`VVP${n}20KM`],['text1716',`ASG${n}10VD`],['text2772',`ASG${n}11VD`],
      ['text1790',`ARE${n}30VL`],['text2794',`ARE${n}40VL`],['text4756',`ARE${n}01MD`],
      ['text5136',`ASG${n}01MD`],['text5632',`ARE${n}02MT`]])
      assert.equal(surface.get(id).textContent,label);
    assert.equal(surface.get('text3188').textContent,'GCT-A');
  }
});

test('jauges GV : même surface réelle pour GL et GE, NREF indépendant', () => {
  const surface=svgSurface('synoptique-RCPGV-1300.svg');
  const gv=E.make().state.gv[0];
  surface.update({gv:1,gvState:gv,gvSetpoint:65});
  const wide=surface.get('gv-gauge-wide-fill').attributes;
  const narrow=surface.get('gv-gauge-narrow-fill').attributes;
  assert.ok(Math.abs(Number(wide.y)-Number(narrow.y))<1e-7);
  assert.match(surface.get('text2666').textContent,/55,0/);
  assert.match(surface.get('text5672').textContent,/88,1/);
  const ref=surface.get('gv-level-reference').attributes;
  assert.ok(Number(ref.y1)<Number(narrow.y));
  assert.match(surface.get('gv-level-reference-label').textContent,/NREF 65 % GE/);
  Object.assign(gv,E.gvLevels(10*E.C.gvKgPerMetre));
  surface.update({gv:1,gvState:gv,gvSetpoint:65});
  assert.equal(Number(surface.get('gv-gauge-narrow-fill').attributes.height),0);
  assert.ok(Number(surface.get('gv-gauge-wide-fill').attributes.height)>0);
});

test('mesures KM : ouverture VVP et débit GCT-A en kg/s actualisés pour chaque GV', () => {
  const surface=svgSurface('synoptique-RCPGV-1300.svg');
  for(const gv of E.make().state.gv){
    const n=gv.index;
    gv.steamValvePct=57.5;gv.gctAValvePct=13.2;gv.dumpKgS=25*n+0.4;
    surface.update({gv:n,gvState:gv,gvSetpoint:55});
    assert.equal(surface.get('vvp-opening-value').textContent,'57,5');
    assert.equal(surface.get('text5934').textContent,`${25*n},4`);
    assert.equal(surface.get('text5954').textContent,'kg/s');
    assert.equal(surface.get('text2890').textContent,'13,2 %');
    assert.equal(surface.get('text5974').textContent,`VDA${n}20KM`);
    assert.equal(surface.get('vvp-opening-tag').textContent,`VVP${n}20KM`);
  }
});
