import { Renderer } from './render.js';

const $ = id => document.getElementById(id);
let renderer, renderingError = '';
const showError = message => { const text = [renderingError,message].filter(Boolean).join('\n'); $('error').hidden = !text; $('error').textContent = text; };
try { renderer = new Renderer($('scene')); }
catch (e) { renderingError = e.message; showError(); }

let source = '', sourceName = 'solver.js', baseSource = '', kind = 'bridge';
let replayData, frameIndex = 0, playing = false, lastStep = 0, busy = false, report = null;
let cancelTask = null, integrityOK = false;

function getSeed() {
  const n = Number($('seed').value);
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new Error('Seed должен быть целым числом от 0 до 4294967295.');
  return n;
}
function setPlaying(value) { playing = value; $('play').textContent = value ? 'Ⅱ' : '▶'; lastStep = performance.now(); }
function setBusy(value, measuring = false) {
  busy = value;
  for (const el of document.querySelectorAll('button,input')) if (el.id !== 'cancel') el.disabled = value;
  $('export').disabled = value || !report;
  $('run').disabled = value || !integrityOK;
  $('measure-overlay').hidden = !value;
  $('measure-overlay').querySelector('strong').textContent = measuring ? 'Измеряем только код' : 'Проверяем модуль';
  $('measure-overlay').querySelector('small').textContent = measuring ? 'Отрисовка остановлена на время замера' : 'Вычисления идут в отдельном Worker';
  renderer?.pause(value);
  if (value) setPlaying(false);
}
async function sha256(value) {
  const data = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(x => x.toString(16).padStart(2,'0')).join('');
}
async function verifyIntegrity() {
  const manifest = await (await fetch('./manifest.json')).json();
  for (const [file, expected] of Object.entries(manifest.files)) {
    const response = await fetch(file);
    if (!response.ok || await sha256(await response.arrayBuffer()) !== expected) throw new Error(`Изменена фиксированная часть стенда: ${file}. Используйте чистую копию.`);
  }
  integrityOK = true;
  $('integrity').textContent = 'Стенд v1.0 · целостность проверена';
  return manifest;
}
function task(action) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js', { type: 'module' });
    let timer;
    const close = () => { clearTimeout(timer); worker.terminate(); cancelTask = null; };
    cancelTask = () => { close(); reject(new Error('Выполнение остановлено. Баллы не начислены.')); };
    timer = setTimeout(() => { close(); reject(new Error('Превышен лимит 90 секунд. Модуль остановлен, результат не оценивается.')); }, 90000);
    worker.onerror = e => { close(); reject(new Error(e.message)); };
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') { $('progress').textContent = data.text; return; }
      close();
      if (data.type === 'error') reject(new Error(data.message));
      else resolve(data.result);
    };
    try { worker.postMessage({ source, action, kind, seed: getSeed(), repeats: 5 }); }
    catch (e) { close(); reject(e); }
  });
}
function updateStepUI() {
  const frame = replayData.frames[frameIndex];
  $('step-label').textContent = `${String(frameIndex).padStart(2,'0')} / ${replayData.frames.length-1} · ${frame.label}`;
  $('timeline').max = replayData.frames.length-1;
  $('timeline').value = frameIndex;
  const wrong = frame.missing.length + frame.extra.length;
  $('match').textContent = wrong ? `Ошибка: ${wrong} блоков` : '✓ Результат совпадает';
  $('match').className = `match ${wrong ? 'bad' : ''}`;
  if (!replayData.valid && frameIndex === replayData.frames.length-1) {
    $('match').textContent = '✕ Ошибка решения'; showError(replayData.error);
  }
}
function resetScene() {
  if (!replayData) return;
  setPlaying(false); frameIndex = 0; renderer?.setWorld(replayData.world); renderer?.apply(replayData.frames[0]); updateStepUI();
}
function advance() {
  if (!replayData || busy) return;
  if (frameIndex + 1 >= replayData.frames.length) { setPlaying(false); return; }
  frameIndex++; renderer?.apply(replayData.frames[frameIndex]); updateStepUI();
}
async function loadReplay() {
  setBusy(true); showError('');
  $('progress').textContent = 'Готовим конструкцию и последовательность повреждений…';
  try {
    replayData = await task('replay'); resetScene();
    document.querySelectorAll('[data-scene]').forEach(b => b.classList.toggle('active',b.dataset.scene===kind));
  } catch (e) { if (renderer) renderer.world = null; replayData = null; $('step-label').textContent = 'Не удалось выполнить модуль'; $('match').textContent = '✕ Ошибка'; showError(e.message); }
  finally { setBusy(false); }
}
function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
function displayReport() {
  const valid = report.status === 'valid';
  $('score').textContent = valid ? (report.score > 0 ? '+' : '') + report.score.toFixed(1) : 'FAIL';
  $('score').className = valid ? (report.score >= 0 ? 'good' : 'bad') : 'bad';
  $('score-note').textContent = valid ? `${report.speedup.toFixed(2)}× относительно базы` : 'Нет баллов за неверный результат';
  $('result-summary').textContent = valid ? `Все граничные тесты и каждый шаг замеров пройдены. Seed ${report.seed}; ${report.repeats} серий.` : `Ошибка проверки: ${report.error?.message || 'неверный результат'}`;
  const tbody = $('result-rows'); tbody.replaceChildren();
  for (const row of report.cases) {
    const tr = document.createElement('tr');
    for (const value of [row.title,`${row.baseline.totalMs.toFixed(2)} мс`,`${row.candidate.totalMs.toFixed(2)} мс`,`${row.speedup.toFixed(2)}×`]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
    tr.lastChild.className = row.speedup >= 1 ? 'good' : 'bad'; tbody.append(tr);
  }
  if (!report.cases.length) { const tr = tbody.insertRow(); const td = tr.insertCell(); td.colSpan = 4; td.textContent = 'Решение не прошло проверку корректности.'; }
  $('noise-note').textContent = 'Небольшие различия могут быть шумом. Сравнивайте в одном браузере и на одном устройстве.';
}

$('run').addEventListener('click', async () => {
  setBusy(true,true); showError(''); $('progress').textContent = 'Проверка модуля…';
  try {
    await verifyIntegrity();
    report = await task('bench');
    report.candidate = sourceName;
    report.candidateSHA256 = await sha256(source);
    report.environment = { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency };
    report.integrity = 'verified'; displayReport();
  } catch (e) { report = null; $('score').textContent = '—'; $('score-note').textContent = 'Прогон не завершён'; showError(e.message); }
  finally { setBusy(false); }
});
$('cancel').addEventListener('click', () => cancelTask?.());
$('play').addEventListener('click', () => { if (!replayData) return; if (frameIndex === replayData.frames.length-1) resetScene(); setPlaying(!playing); });
$('step').addEventListener('click', () => { setPlaying(false); advance(); });
$('reset').addEventListener('click', resetScene);
if (renderer) renderer.onFrame = time => { if (playing && time-lastStep>1150) { lastStep=time; advance(); } };
document.querySelectorAll('[data-scene]').forEach(b => b.addEventListener('click', () => { kind=b.dataset.scene; loadReplay(); }));
$('new-seed').addEventListener('click', () => { $('seed').value = crypto.getRandomValues(new Uint32Array(1))[0]; loadReplay(); });
$('seed').addEventListener('change', () => { try { getSeed(); loadReplay(); } catch (e) { showError(e.message); } });
$('candidate-input').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  source = await file.text(); sourceName = file.name; report = null;
  $('score').textContent = '—'; $('score').className = ''; $('score-note').textContent = 'Базовый алгоритм = 0';
  $('candidate-file').textContent = file.name;
  $('source-info').textContent = `${file.name} · ${file.size.toLocaleString('ru-RU')} байт · вычисляется в отдельном Worker`;
  $('result-rows').replaceChildren(); $('result-summary').textContent = 'Новый модуль загружен. Запустите независимый замер.';
  await loadReplay(); e.target.value='';
});
$('download-solver').addEventListener('click', () => download('solver.js',baseSource,'text/javascript'));
$('export').addEventListener('click', () => { if (report) download(`demolition-${report.seed}-${report.candidate.replace(/[^a-zA-Z0-9_.-]/g,'_')}.json`,JSON.stringify(report,null,2),'application/json'); });

try {
  setBusy(true);
  await verifyIntegrity();
  source = await (await fetch('./solver.js')).text();
  baseSource = await (await fetch('./engine/baseline.js')).text();
  $('candidate-file').textContent = source === baseSource ? 'solver.js · копия базы' : 'solver.js · рабочий модуль';
  await loadReplay();
} catch (e) { $('integrity').textContent = 'Ошибка целостности'; showError(e.message); setBusy(false); }
