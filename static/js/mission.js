/* ═══════════════════════════════════════════════════════════
   Mission Power Budget Planner — appelle l'API Flask (qui execute
   la meme mecanique orbitale que la version Tkinter) et trace le
   graphique d'energie cumulee.
   ═══════════════════════════════════════════════════════════ */

const M = {
  cyan: '#00BFFF', green: '#00D68F', orange: '#FF6B00',
  muted2: '#777777', purple: '#B06EFF', gold: '#FF6B00'
};

const pClass = document.getElementById('pClass');
const pGeom = document.getElementById('pGeom');
const lblGeom = document.getElementById('lblGeom');
const pAlt = document.getElementById('pAlt');
const pIncl = document.getElementById('pIncl');
const pYears = document.getElementById('pYears');
const pDegrad = document.getElementById('pDegrad');
const btnSimulate = document.getElementById('btnSimulate');
const missionCanvas = document.getElementById('missionChart');
const mctx = missionCanvas.getContext('2d');

let lastResult = null;

function onClassChange(){
  const isLeo = pClass.value === 'leo';
  pAlt.disabled = !isLeo;
  pGeom.disabled = !isLeo;
  lblGeom.style.color = isLeo ? '#777777' : '#444444';
  pIncl.disabled = !(isLeo && pGeom.value === 'custom');
}
pClass.addEventListener('change', onClassChange);
pGeom.addEventListener('change', onClassChange);

function resizeMissionCanvas(){
  const rect = missionCanvas.getBoundingClientRect();
  // Si le canvas est caché (onglet inactif), sa taille est 0x0 : on ne
  // redimensionne pas dans ce cas pour eviter de figer le canvas en basse
  // resolution. Le ResizeObserver se redeclenchera automatiquement des
  // que le conteneur redevient visible avec sa vraie taille.
  if (rect.width < 10 || rect.height < 10) return;

  missionCanvas.width = Math.round(rect.width * devicePixelRatio);
  missionCanvas.height = Math.round(rect.height * devicePixelRatio);
  mctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  redraw();
}
window.addEventListener('resize', resizeMissionCanvas);

// Redimensionne le canvas des qu'il redevient visible (ex: changement
// d'onglet), pas seulement au resize de la fenetre — corrige le flou
// du graphique quand le panneau Mission etait cache au chargement.
const missionResizeObserver = new ResizeObserver(() => resizeMissionCanvas());
missionResizeObserver.observe(missionCanvas.parentElement);

async function runSimulation(){
  const payload = {
    orbit_class: pClass.value,
    leo_geometry: pGeom.value,
    alt: parseFloat(pAlt.value) || 600,
    incl: parseFloat(pIncl.value) || 97.5,
    years: parseFloat(pYears.value) || 5,
    degrad: parseFloat(pDegrad.value) || 2.5,
  };
  try {
    const res = await fetch('/api/mission/simulate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.ok) return;
    lastResult = data.result;

    document.getElementById('mEAi').textContent = Math.round(lastResult.total_ai_kwh).toLocaleString('fr-FR');
    document.getElementById('mENoai').textContent = Math.round(lastResult.total_noai_kwh).toLocaleString('fr-FR');
    document.getElementById('mGain').textContent = '+' + lastResult.gain_pct;
    document.getElementById('mEcl').textContent = lastResult.max_eclipse_pct;
    document.getElementById('mErr').textContent = lastResult.uncorrected_err_deg;
    document.getElementById('mPeriod').textContent = Math.round(lastResult.period_minutes);

    redraw();
  } catch (err) {
    console.error('Erreur simulation mission:', err);
  }
}
btnSimulate.addEventListener('click', runSimulation);

function redraw(){
  const W = missionCanvas.width / devicePixelRatio;
  const H = missionCanvas.height / devicePixelRatio;
  mctx.clearRect(0, 0, W, H);

  if (!lastResult) {
    mctx.fillStyle = M.muted2;
    mctx.font = '13px Segoe UI';
    mctx.textAlign = 'center';
    mctx.fillText('Lancez une simulation', W / 2, H / 2);
    return;
  }

  const cumAi = lastResult.cum_ai;
  const cumNoai = lastResult.cum_noai;
  const days = lastResult.days;
  const n = cumAi.length;

  const pl = 58, pr = 16, pt = 20, pb = 28;
  const cw = W - pl - pr, ch = H - pt - pb;
  const allVals = cumAi.concat(cumNoai);
  const maxVal = Math.max(...allVals, 1);
  const minVal = 0;

  const cx = i => pl + (i / Math.max(n - 1, 1)) * cw;
  const cy = v => (H - pb) - ((v - minVal) / (maxVal - minVal)) * ch;

  // grid
  mctx.strokeStyle = '#1E1E1E';
  mctx.fillStyle = M.muted2;
  mctx.font = '8px Segoe UI';
  mctx.textAlign = 'right';
  for (let k = 0; k < 5; k++) {
    const yg = pt + k * ch / 4;
    mctx.setLineDash([4, 6]);
    mctx.beginPath(); mctx.moveTo(pl, yg); mctx.lineTo(W - pr, yg); mctx.stroke();
    const val = maxVal * (1 - k / 4);
    mctx.fillText(Math.round(val).toLocaleString('fr-FR'), pl - 6, yg + 3);
  }
  mctx.setLineDash([]);

  mctx.strokeStyle = '#2A2A2A';
  mctx.beginPath(); mctx.moveTo(pl, pt); mctx.lineTo(pl, H - pb); mctx.stroke();
  mctx.beginPath(); mctx.moveTo(pl, H - pb); mctx.lineTo(W - pr, H - pb); mctx.stroke();

  // x labels (year markers)
  mctx.fillStyle = M.muted2;
  mctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(n / 6));
  for (let i = 0; i < n; i += step) {
    mctx.fillText('A' + Math.floor(days[i] / 365), cx(i), H - pb + 12);
  }

  function drawLine(data, color, dashed){
    if (data.length < 2) return;
    mctx.strokeStyle = color;
    mctx.lineWidth = 2;
    mctx.setLineDash(dashed ? [7, 4] : []);
    mctx.beginPath();
    data.forEach((v, i) => {
      const x = cx(i), y = cy(v);
      if (i === 0) mctx.moveTo(x, y); else mctx.lineTo(x, y);
    });
    mctx.stroke();
    mctx.setLineDash([]);
  }
  drawLine(cumAi, M.green, false);
  drawLine(cumNoai, M.muted2, true);

  // legend
  const legend = [['Avec correction IA', M.green, false], ['Sans correction (pointage libre)', M.muted2, true]];
  mctx.textAlign = 'left';
  mctx.font = '9px Segoe UI';
  legend.forEach((l, idx) => {
    const lx = pl + 10, ly = pt + 4 + idx * 14;
    mctx.strokeStyle = l[1];
    mctx.setLineDash(l[2] ? [6, 3] : []);
    mctx.lineWidth = 2;
    mctx.beginPath(); mctx.moveTo(lx, ly); mctx.lineTo(lx + 16, ly); mctx.stroke();
    mctx.setLineDash([]);
    mctx.fillStyle = M.muted2;
    mctx.fillText(l[0], lx + 22, ly + 3);
  });
}

onClassChange();
runSimulation();
