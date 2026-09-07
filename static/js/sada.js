/* ═══════════════════════════════════════════════════════════
   SADA — Simulation IA en temps reel (portage direct de la
   version Tkinter : meme physique, meme sequencement des modes)
   ═══════════════════════════════════════════════════════════ */

const COLORS = {
  cyan: '#00BFFF', green: '#00D68F', orange: '#FF6B00',
  red: '#FF3B55', purple: '#B06EFF', muted2: '#777777', gold: '#FF6B00'
};

let running = false;
let timerId = null;
let t = 0.0;
let injectFlag = false;
let lastMode = null;
let history = [];

const btnDemo = document.getElementById('btnDemo');
const btnReset = document.getElementById('btnReset');
const btnInject = document.getElementById('btnInject');
const statusPill = document.getElementById('statusPill');
const chartCanvas = document.getElementById('sadaChart');
const ctx = chartCanvas.getContext('2d');

const kpiEls = {
  temps: document.getElementById('kTemps'),
  desire: document.getElementById('kDesire'),
  mesure: document.getElementById('kMesure'),
  perturb: document.getElementById('kPerturb'),
  err_av: document.getElementById('kErrAv'),
  corr_ia: document.getElementById('kCorr'),
  err_ap: document.getElementById('kErrAp'),
  mode_k: document.getElementById('kMode'),
};

function resizeCanvas(){
  const rect = chartCanvas.getBoundingClientRect();
  chartCanvas.width = Math.max(300, rect.width) * devicePixelRatio;
  chartCanvas.height = Math.max(200, rect.height) * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  drawChart();
}
window.addEventListener('resize', resizeCanvas);

function fmt(v){
  if (typeof v !== 'number' || Number.isNaN(v)) return '--';
  return v.toFixed(6);
}

function highlightMode(modeKey){
  document.querySelectorAll('.mode-card').forEach(card => {
    const on = card.dataset.mode === modeKey;
    const color = getModeColor(card.dataset.mode);
    card.style.borderColor = on ? color : '#2C1800';
    card.style.borderWidth = on ? '3px' : '2px';
  });
}
function getModeColor(name){
  return {Nominal: COLORS.cyan, Positionnement: COLORS.green,
          Protection: COLORS.orange, Maintien: COLORS.red}[name] || COLORS.muted2;
}

function applyState(d){
  kpiEls.temps.textContent = d.temps.toFixed(1);
  kpiEls.desire.textContent = fmt(d.desire);
  kpiEls.mesure.textContent = fmt(d.mesure);
  kpiEls.perturb.textContent = fmt(d.perturb);
  kpiEls.err_av.textContent = fmt(d.err_av);
  kpiEls.corr_ia.textContent = fmt(d.corr_ia);
  kpiEls.err_ap.textContent = fmt(d.err_ap);
  kpiEls.mode_k.textContent = d.mode;

  kpiEls.err_ap.style.color = Math.abs(d.err_ap) < Math.abs(d.err_av) * 0.95 ? COLORS.green : COLORS.red;

  highlightMode(d.mode);

  history.push([d.temps, d.desire, d.mesure, d.corr_ia, d.err_av, d.err_ap, d.mode]);
  if (history.length > 500) history.shift();
  drawChart();
}

function demoStep(){
  if (!running) return;

  const V_GEO = 0.004, V_DEMO = 5.0, RATIO = V_GEO / V_DEMO;
  const desire = V_GEO * t;
  let mode, mesure, perturb, err_av, corr, err_ap;

  if (t < 10) {
    mode = 'Nominal';
    let micro = (Math.sin(t * 7.3) * 0.0003 + Math.cos(t * 11.1) * 0.0002) * RATIO;
    if (injectFlag) { micro += 5.0 / 1e6 * RATIO; injectFlag = false; }
    mesure = desire + micro; perturb = micro;
    err_av = micro; corr = 0; err_ap = micro;
  } else if (t < 20) {
    mode = 'Positionnement';
    perturb = (1000 * Math.sin(2 * Math.PI * t / 8) + 500 * Math.sin(2 * Math.PI * t / 5)) * RATIO / 1e6;
    if (injectFlag) { perturb += 5.0 / 1e6 * RATIO; injectFlag = false; }
    mesure = desire + perturb;
    err_av = desire - mesure;
    corr = Math.max(-500 * RATIO, Math.min(500 * RATIO, (25.0 * err_av + 8.0 * perturb) * RATIO));
    err_ap = desire - (mesure + corr);
  } else if (t < 23) {
    mode = 'Protection';
    perturb = 50000.0 * RATIO / 1e6;
    mesure = desire + perturb;
    err_av = desire - mesure; corr = 0; err_ap = err_av;
  } else if (t < 29) {
    mode = 'Maintien';
    mesure = 0.0; perturb = 0; err_av = 0; corr = 0; err_ap = 0;
  } else {
    mode = 'Maintien';
    const vel_catch = (desire + V_DEMO * 8) / 8;
    mesure = desire; perturb = 0; err_av = 0;
    corr = vel_catch; err_ap = 0;
    if (t >= 37) { t = -0.5; } // will become 0 after increment below
  }

  lastMode = mode;
  applyState({ temps: t, desire, mesure, perturb, err_av, corr_ia: corr, err_ap, mode });

  t += 0.5;
  timerId = setTimeout(demoStep, 500);
}

function toggleDemo(){
  running = !running;
  btnDemo.textContent = running ? 'Pause' : 'Demarrer simulation';
  btnDemo.classList.toggle('cyan', !running);
  btnDemo.classList.toggle('red', running);
  if (running) demoStep();
  else clearTimeout(timerId);
}

function resetSim(){
  running = false;
  clearTimeout(timerId);
  btnDemo.textContent = 'Demarrer simulation';
  btnDemo.classList.add('cyan'); btnDemo.classList.remove('red');
  t = 0.0; history = []; lastMode = null;
  Object.values(kpiEls).forEach(el => el.textContent = '--');
  document.querySelectorAll('.mode-card').forEach(card => {
    card.style.borderColor = '#2C1800'; card.style.borderWidth = '2px';
  });
  drawChart();
}

function injectAnomaly(){
  if (!running) toggleDemo();
  injectFlag = true;
}

btnDemo.addEventListener('click', toggleDemo);
btnReset.addEventListener('click', resetSim);
btnInject.addEventListener('click', injectAnomaly);

/* ── Chart drawing (canvas 2D, mirrors the Tkinter version) ── */
function drawChart(){
  const W = chartCanvas.width / devicePixelRatio;
  const H = chartCanvas.height / devicePixelRatio;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#020610';
  ctx.fillRect(0, 0, W, H);

  if (history.length === 0) {
    ctx.fillStyle = COLORS.muted2;
    ctx.font = '13px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText('Cliquez Demarrer simulation', W / 2, H / 2);
    return;
  }

  const pl = 60, pr = 14, pt = 20, pb = 28;
  const cw = W - pl - pr, ch = H - pt - pb, n = history.length;

  let vals = [];
  history.forEach(h => vals.push(h[1], h[2], h[3], h[4], h[5]));
  const sv = [...vals].sort((a, b) => a - b);
  const clip = Math.max(1, Math.floor(sv.length / 20));
  const tr = sv.length > clip * 2 ? sv.slice(clip, -clip) : sv;
  let mn = Math.min(...tr), mx = Math.max(...tr);
  const pad = (mx - mn) * 0.12 || 1e-6;
  mn -= pad; mx += pad;
  const span = mx !== mn ? mx - mn : 1e-9;

  const cx = i => pl + (i / Math.max(n - 1, 1)) * cw;
  const cy = v => pt + (1 - (Math.max(mn, Math.min(mx, v)) - mn) / span) * ch;

  // grid
  ctx.strokeStyle = '#0d1a2e';
  ctx.fillStyle = COLORS.muted2;
  ctx.font = '9px Segoe UI';
  ctx.textAlign = 'right';
  for (let k = 0; k < 5; k++) {
    const yg = pt + k * ch / 4;
    const val = mn + (mx - mn) * (1 - k / 4);
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(pl, yg); ctx.lineTo(W - pr, yg); ctx.stroke();
    ctx.fillText(val.toFixed(6), pl - 4, yg + 3);
  }
  ctx.setLineDash([]);
  if (mn <= 0 && 0 <= mx) {
    ctx.strokeStyle = '#1a3344';
    ctx.setLineDash([6, 3]);
    ctx.beginPath(); ctx.moveTo(pl, cy(0)); ctx.lineTo(W - pr, cy(0)); ctx.stroke();
    ctx.setLineDash([]);
  }

  // mode ticks
  const modeColors = { Nominal: COLORS.cyan, Positionnement: COLORS.green,
                        Protection: COLORS.orange, Maintien: COLORS.red };
  history.forEach((h, i) => {
    ctx.strokeStyle = modeColors[h[6]] || COLORS.muted2;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx(i), H - pb); ctx.lineTo(cx(i), H - pb + 7); ctx.stroke();
  });
  ctx.lineWidth = 1;

  // axes
  ctx.strokeStyle = '#1a2a3a';
  ctx.beginPath(); ctx.moveTo(pl, pt); ctx.lineTo(pl, H - pb); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pl, H - pb); ctx.lineTo(W - pr, H - pb); ctx.stroke();

  // series
  const series = [
    { idx: 1, color: COLORS.green, width: 1, dash: [6, 3] },
    { idx: 2, color: COLORS.orange, width: 2, dash: null },
    { idx: 4, color: COLORS.red, width: 1, dash: [4, 3] },
    { idx: 5, color: COLORS.purple, width: 1, dash: [4, 3] },
    { idx: 3, color: COLORS.cyan, width: 2, dash: [8, 2] },
  ];
  series.forEach(s => {
    if (n < 2) return;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    history.forEach((h, i) => {
      const x = cx(i), y = cy(h[s.idx]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // last-point marker
  const xi = cx(n - 1);
  ctx.strokeStyle = COLORS.gold;
  ctx.setLineDash([3, 2]);
  ctx.beginPath(); ctx.moveTo(xi, pt); ctx.lineTo(xi, H - pb); ctx.stroke();
  ctx.setLineDash([]);

  // x labels
  ctx.fillStyle = COLORS.muted2;
  ctx.font = '8px Segoe UI';
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(n / 8));
  for (let i = 0; i < n; i += step) {
    ctx.fillText(history[i][0].toFixed(0) + 's', cx(i), H - pb + 16);
  }

  // header readout
  const last = history[n - 1];
  ctx.fillStyle = modeColors[last[6]] || COLORS.muted2;
  ctx.font = 'bold 10px Segoe UI';
  ctx.textAlign = 'right';
  ctx.fillText(
    `Mode: ${last[6]}  |  t=${last[0].toFixed(1)}s  |  Desire=${last[1].toFixed(4)}deg  Mesure=${last[2].toFixed(4)}deg`,
    W - pr - 4, pt + 10
  );
}

resizeCanvas();
