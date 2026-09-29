const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const E = require('../safety-engine.js');

const run = (name, seconds, dt = .02) => {
  const model = E.make(name);
  E.advance(model, seconds, dt);
  return model;
};

test('état nominal conservatif et stationnaire', () => {
  const s = run('normal', 300).state;
  assert.ok(Math.abs(s.pressureBar - 155) < .01);
  assert.ok(Math.abs(s.massKg - E.P.mass0) < .01);
  assert.ok(Math.abs(s.boronPpm - 1200) < .01);
  assert.ok(Math.abs(s.fissionMW - E.P.nominalMW) < .01);
  assert.equal(s.tripAt, null);
});

test('brèche : perte de masse, arrêt et injection', () => {
  const s = run('medium', 180).state;
  assert.ok(s.pressureBar < 100);
  assert.ok(s.massKg < E.P.mass0);
  assert.ok(s.tripAt !== null && s.eccsAt !== null);
  assert.ok(s.neutron < .05);
  assert.ok(s.boronPpm > E.P.boronInitialPpm);
});

test('injection disponible améliore la couverture à 900 s', () => {
  const protectedCase = run('medium', 900).state;
  const failedCase = run('noEccs', 900).state;
  assert.ok(protectedCase.coverage > .8);
  assert.ok(failedCase.coverage < .1);
  assert.ok(failedCase.peakFuelC > 1200);
  assert.ok(protectedCase.peakFuelC < 1200);
});

test('groupe bloqué ne suit pas la chute des grappes', () => {
  const s = run('stuckRod', 180).state;
  assert.equal(s.rods[3], E.P.rodInitial[3]);
  assert.ok(s.rods[0] < .1 && s.rods[1] < .1 && s.rods[2] < .1);
});

test('le bore obéit au bilan : borication et dilution', () => {
  const borate = E.make('normal');
  const dilute = E.make('normal');
  E.setSetting(borate, 'boration', 'borate');
  E.setSetting(dilute, 'boration', 'dilute');
  E.advance(borate, 300); E.advance(dilute, 300);
  assert.ok(borate.state.boronPpm > 1200);
  assert.ok(dilute.state.boronPpm < 1200);
  assert.ok(Math.abs(borate.state.massKg - E.P.mass0) < .01);
});

test('variation du pas : résultat proche', () => {
  const a = run('medium', 180, .02).state;
  const b = run('medium', 180, .01).state;
  assert.ok(Math.abs(a.pressureBar - b.pressureBar) < .1);
  assert.ok(Math.abs(a.fuelC - b.fuelC) < .1);
  assert.ok(Math.abs(a.massKg - b.massKg) < 20);
});

test('tous les scénarios restent numériques sur 30 min', () => {
  for (const key of Object.keys(E.SCENARIOS)) {
    const s = run(key, 1800).state;
    for (const [name, value] of Object.entries(s)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key}.${name}`);
    }
    assert.ok(s.massKg >= .2 * E.P.mass0);
    assert.ok(s.pressureBar >= 1);
  }
});

test('l’intégration HTML référence tous les éléments requis et garde un JavaScript valide', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'simulateur-rep.html'), 'utf8');
  assert.match(html, /data-view="safety"/);
  assert.match(html, /id="view-safety"/);
  for (const file of ['safety.css', 'safety-engine.js', 'safety-app.js', 'synoptique-rep-edit_v0.2.svg']) {
    assert.ok(fs.existsSync(path.join(root, file)));
    assert.ok(html.includes(file));
  }
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(inline.length, 1);
  new vm.Script(inline[0][1]);
  new vm.Script(fs.readFileSync(path.join(root, 'safety-app.js'), 'utf8'));
});
