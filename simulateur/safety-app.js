(function () {
  "use strict";
  const E = window.SafetyEngine;
  if (!E) throw new Error("safety-engine.js manquant");
  const $ = id => document.getElementById(id);
  const fmt = (value, decimals = 0) => Number(value).toLocaleString("fr-FR", {
    maximumFractionDigits: decimals, minimumFractionDigits: decimals
  });
  const timeLabel = seconds => {
    const n = Math.floor(seconds);
    return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  };
  let model = E.make("normal");
  let running = false, speed = 20, last = performance.now(), remainder = 0, lastRender = -1;

  function addRods() {
    $("safetyRods").innerHTML = E.P.rodInitial.map((position, i) => `
      <div class="safety-rod" id="safetyRod${i}">
        <div class="safety-rod-head"><span>Groupe ${"ABCD"[i]}</span><span id="safetyRodValue${i}">${fmt(position, 0)} %</span></div>
        <input id="safetyRodTarget${i}" type="range" min="0" max="100" step="1" value="${position}" aria-label="Consigne groupe ${"ABCD"[i]}">
        <small>Valeur intégrale indicative : ${fmt(E.P.rodWorthPcm[i])} pcm</small>
      </div>`).join("");
    for (let i = 0; i < 4; i++) {
      $(`safetyRodTarget${i}`).addEventListener("input", ev => E.setRodTarget(model, i, ev.target.value));
    }
  }

  function syncControls() {
    const c = model.settings;
    $("safetyBreak").value = c.breakAreaCm2;
    $("safetyEccs").checked = c.eccs;
    $("safetyTripAvailable").checked = c.trip;
    $("safetyStuck").value = c.stuckBank;
    $("safetyBoration").value = c.boration;
    $("safetyIsolate").disabled = c.breakAreaCm2 === 0;
    $("safetyIsolate").textContent = model.state.breakIsolated ? "Rouvrir la brèche" : "Isoler la brèche";
    for (let i = 0; i < 4; i++) $(`safetyRodTarget${i}`).value = model.state.targets[i];
  }

  function loadScenario(key) {
    running = false;
    model = E.make(key);
    remainder = 0;
    lastRender = -1;
    syncControls();
    render();
  }

  function setMetric(id, value, status) {
    $(id).textContent = value;
    $(id).parentElement.classList.toggle("is-warn", status === "warn");
    $(id).parentElement.classList.toggle("is-danger", status === "danger");
  }

  function renderChart() {
    const canvas = $("safetyChart");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(300, Math.round(rect.width));
    const h = Math.max(200, Math.round(rect.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const left = 40, top = 20, right = w - 18, bottom = h - 27;
    const points = model.state.samples;
    const first = Math.max(0, model.state.time - 900);
    const span = Math.max(30, model.state.time - first);
    ctx.strokeStyle = "#dce7ea"; ctx.lineWidth = 1;
    ctx.font = "10px Segoe UI, sans-serif"; ctx.fillStyle = "#67818a";
    for (let i = 0; i <= 4; i++) {
      const y = top + i * (bottom - top) / 4;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      ctx.fillText(`${100 - i * 25}%`, 4, y + 3);
    }
    const traces = [
      { key: "p", color: "#18789a", norm: x => x / 180 },
      { key: "cover", color: "#128e6c", norm: x => x / 100 },
      { key: "power", color: "#b68021", norm: x => x / 150 },
      { key: "fuel", color: "#bf493d", norm: x => (x - 200) / 1600 }
    ];
    for (const trace of traces) {
      ctx.beginPath(); let begun = false;
      for (const point of points) {
        if (point.t < first) continue;
        const x = left + ((point.t - first) / span) * (right - left);
        const y = bottom - Math.max(0, Math.min(1, trace.norm(point[trace.key]))) * (bottom - top);
        if (!begun) { ctx.moveTo(x, y); begun = true; } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = trace.color; ctx.lineWidth = 2.1; ctx.stroke();
    }
    $("safetyChartRange").textContent = `${fmt(first)}–${fmt(model.state.time)} s`;
  }

  function render() {
    const s = model.state;
    $("safetyClock").textContent = timeLabel(s.time);
    $("safetyRunState").textContent = running ? "EN COURS" : "EN PAUSE";
    $("safetyRun").textContent = running ? "Pause" : "Démarrer";
    setMetric("safetyPressure", fmt(s.pressureBar, 1), s.pressureBar < 50 ? "danger" : s.pressureBar < 130 ? "warn" : "");
    setMetric("safetyMass", fmt(100 * s.massKg / E.P.mass0, 1), s.massKg / E.P.mass0 < .7 ? "danger" : s.massKg / E.P.mass0 < .9 ? "warn" : "");
    setMetric("safetyCoverage", fmt(100 * s.coverage, 1), s.coverage < .8 ? "danger" : s.coverage < .99 ? "warn" : "");
    setMetric("safetyFuel", fmt(s.fuelC), s.fuelC >= 1200 ? "danger" : s.fuelC >= 1000 ? "warn" : "");
    $("safetyFuelPeak").textContent = fmt(s.peakFuelC);
    setMetric("safetyBoron", fmt(s.boronPpm), "");
    setMetric("safetyReactivity", `${s.reactivityPcm >= 0 ? "+" : ""}${fmt(s.reactivityPcm)}`, s.reactivityPcm > 300 ? "danger" : s.reactivityPcm > 0 ? "warn" : "");
    $("safetyBreakFlow").textContent = `${fmt(s.breakKgS)} kg/s`;
    $("safetyHP").textContent = `${fmt(s.injectionHP)} kg/s`;
    $("safetyLP").textContent = `${fmt(s.injectionLP)} kg/s`;
    $("safetyAcc").textContent = `${fmt(s.accumulatorKgS)} kg/s`;
    $("safetyCirc").textContent = `${fmt(100 * s.circulation)} %`;
    $("safetySG").textContent = `${fmt(s.sgMW)} MW`;
    $("safetyProtection").textContent = s.eccsAt !== null ? "Injection de secours en service"
      : s.tripAt !== null ? "Arrêt automatique engagé"
      : s.tripDemandAt !== null ? "Ordre d'arrêt en attente du délai"
      : "Protection en attente";
    $("safetyProtection").classList.toggle("active", s.eccsAt !== null || s.tripAt !== null);
    const indicators = E.assessment(s).filter(item => model.settings.breakAreaCm2 > 0 || item.label !== "Arrêt demandé");
    $("safetyAssessment").innerHTML = indicators.map(item => `<div class="${item.pending ? "wait" : item.ok ? "ok" : "fail"}"><span>${item.label}</span><strong>${item.pending ? "EN ATTENTE" : item.ok ? "OUI" : "NON"}</strong></div>`).join("");
    $("safetyEvents").innerHTML = s.events.slice(-12).reverse().map(item => `<li class="${item.kind}"><time>${timeLabel(item.time)}</time><span>${item.text}</span></li>`).join("");
    for (let i = 0; i < 4; i++) {
      $(`safetyRodValue${i}`).textContent = `${fmt(s.rods[i], 1)} %`;
      $(`safetyRod${i}`).classList.toggle("locked", model.settings.stuckBank === i);
    }
    $("safetyIsolate").textContent = s.breakIsolated ? "Rouvrir la brèche" : "Isoler la brèche";
    renderChart();
  }

  function exportDossier() {
    const dossier = {
      titre: "SimuREP Sûreté — dossier de scénario pédagogique",
      date: new Date().toISOString(),
      avertissement: "Modèle réduit non validé. Aucune utilisation pour la sûreté d'une installation réelle.",
      scenario: model.settings, hypotheses: E.P,
      indicateurs: E.assessment(model.state),
      etatFinal: Object.fromEntries(Object.entries(model.state).filter(([key]) =>
        !["samples", "events", "precursors", "boronInventory"].includes(key))),
      evenements: model.state.events, trajectoire: model.state.samples
    };
    const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `simurep-surete-${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  for (const [key, value] of Object.entries(E.SCENARIOS)) {
    const option = document.createElement("option");
    option.value = key; option.textContent = value.label;
    $("safetyScenario").append(option);
  }
  addRods();
  $("safetyScenario").addEventListener("change", event => loadScenario(event.target.value));
  document.querySelector('[data-view="safety"]').addEventListener("click", () => requestAnimationFrame(renderChart));
  $("safetySpeed").addEventListener("change", event => { speed = Number(event.target.value); });
  $("safetyRun").addEventListener("click", () => { running = !running; render(); });
  $("safetyReset").addEventListener("click", () => loadScenario($("safetyScenario").value));
  $("safetyTrip").addEventListener("click", () => {
    if (model.state.tripDemandAt === null) {
      model.state.tripDemandAt = model.state.time;
      model.state.events.push({ time: model.state.time, kind: "action", text: "Ordre manuel d'arrêt du réacteur" });
    }
    render();
  });
  $("safetyIsolate").addEventListener("click", () => {
    E.setSetting(model, "isolate", !model.state.breakIsolated); render();
  });
  $("safetyExport").addEventListener("click", exportDossier);
  $("safetyBreak").addEventListener("change", event => {
    E.setSetting(model, "breakAreaCm2", event.target.value); syncControls(); render();
  });
  $("safetyEccs").addEventListener("change", event => { E.setSetting(model, "eccs", event.target.checked); render(); });
  $("safetyTripAvailable").addEventListener("change", event => { E.setSetting(model, "trip", event.target.checked); render(); });
  $("safetyStuck").addEventListener("change", event => { E.setSetting(model, "stuckBank", event.target.value); render(); });
  $("safetyBoration").addEventListener("change", event => { E.setSetting(model, "boration", event.target.value); render(); });
  window.addEventListener("resize", renderChart);

  function frame(now) {
    const elapsed = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (running) {
      remainder += elapsed * speed;
      let loops = 0;
      while (remainder >= .02 && loops < 600 && model.state.time < 1800) {
        E.step(model, .02); remainder -= .02; loops++;
      }
      if (model.state.time >= 1800) running = false;
    }
    if (model.state.time !== lastRender && (now - (frame.lastPaint || 0) > 100 || !running)) {
      render(); lastRender = model.state.time; frame.lastPaint = now;
    }
    requestAnimationFrame(frame);
  }
  syncControls(); render(); requestAnimationFrame(frame);
})();
