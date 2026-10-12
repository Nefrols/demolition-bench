import {Renderer} from './render.js';
import {PROFILES, SUITE_VERSION} from './engine/scenarios.js';
import {validReport, compatible, drawChart} from './reports.js';

const $=id=>document.getElementById(id), STORAGE='demolition-v2-reports';
let renderer, renderingError='', source='', baseSource='', prompt='', sourceName='solver.js', kind='arcology';
let replayData, frameIndex=0, playing=false, lastStep=0, busy=false, report=null, cancelTask=null, integrityOK=false, history=[];
function showError(message=''){const text=[renderingError,message].filter(Boolean).join('\n');$('error').hidden=!text;$('error').textContent=text;}
try{renderer=new Renderer($('scene'));}catch(e){renderingError=e.message;showError();}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3000);}
function seed(){const n=Number($('seed').value);if(!Number.isInteger(n)||n<0||n>0xffffffff)throw new Error('Seed: целое число от 0 до 4294967295.');return n;}
function setPlaying(value){playing=value;$('play').textContent=value?'Ⅱ':'▶';lastStep=performance.now();}
function setBusy(value,measuring=false){
  busy=value;for(const el of document.querySelectorAll('button,input,select'))if(el.id!=='cancel')el.disabled=value;
  $('export').disabled=value||!report;$('run').disabled=value||!integrityOK;
  $('drop-zone').setAttribute('aria-disabled',String(value));
  $('measure-overlay').hidden=!value;$('measure-overlay').querySelector('strong').textContent=measuring?'Измеряем только код':'Готовим предпросмотр';
  renderer?.pause(value);if(value){setPlaying(false);$('job-progress').value=0;}
}
async function sha256(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function read(file){const r=await fetch(file);if(!r.ok)throw new Error(`Не удалось загрузить ${file}`);return r;}
async function verifyIntegrity(){
  integrityOK=false;const manifest=await (await read('./manifest.json')).json();
  for(const [file,expected] of Object.entries(manifest.files))if(await sha256(await (await read(file)).arrayBuffer())!==expected)throw new Error(`Изменена фиксированная часть: ${file}. Нужна чистая копия стенда.`);
  integrityOK=true;$('integrity').textContent=`${manifest.version} · целостность проверена`;
}
function task(action){return new Promise((resolve,reject)=>{
  const worker=new Worker('./worker.js',{type:'module'});let timer;
  const close=()=>{clearTimeout(timer);worker.terminate();cancelTask=null;};
  cancelTask=()=>{close();reject(new Error('Выполнение остановлено. Баллы не начислены.'));};
  timer=setTimeout(()=>{close();reject(new Error('Превышен лимит времени. Результат не оценивается.'));},action==='replay'?60000:PROFILES[$('profile').value].timeout);
  worker.onerror=e=>{close();reject(new Error(e.message));};
  worker.onmessage=({data})=>{
    if(data.type==='progress'){$('progress').textContent=data.text;$('job-progress').max=data.total||1;$('job-progress').value=data.completed||0;return;}
    close();data.type==='error'?reject(new Error(data.message)):resolve(data.result);
  };
  try{worker.postMessage({source,action,kind,seed:seed(),profile:$('profile').value,repeats:Number($('repeats').value)});}catch(e){close();reject(e);}
});}
function updateStep(){
  const f=replayData.frames[frameIndex],wrong=f.missing.length+f.extra.length,failed=wrong||f.componentError||(!replayData.valid&&frameIndex===replayData.frames.length-1);
  $('step-label').textContent=`${frameIndex+1} / ${replayData.frames.length} · ${f.label}`;
  $('timeline').max=replayData.frames.length-1;$('timeline').value=frameIndex;
  $('match').textContent=failed?'✕ Ошибка решения':'✓ Результат совпадает';$('match').className=failed?'bad':'';
  const format=r=>`${r.detached.length.toLocaleString('ru-RU')} блоков · ${r.components.length/12} фрагм.`;
  $('reference-count').textContent=format(f.expected);$('candidate-count').textContent=format(f.actual);
  $('preview-stats').textContent=`Шаг: −${f.edit.remove.length} / +${f.edit.add.length} блоков · опоры −${f.edit.anchorOff.length} / +${f.edit.anchorOn.length}`;
  if(failed)showError(replayData.error||f.componentError);
}
function resetScene(){if(!replayData)return;setPlaying(false);frameIndex=0;renderer?.setWorld(replayData.world);renderer?.apply(replayData.frames[0]);updateStep();}
function advance(){if(!replayData||busy)return;if(frameIndex+1>=replayData.frames.length){setPlaying(false);return;}renderer?.apply(replayData.frames[++frameIndex]);updateStep();}
async function loadReplay(){
  setBusy(true);showError();$('progress').textContent='Вычисляем эталон и ответ модуля…';
  try{replayData=await task('replay');resetScene();document.querySelectorAll('[data-scene]').forEach(b=>b.classList.toggle('active',b.dataset.scene===kind));}
  catch(e){if(renderer)renderer.world=null;replayData=null;$('step-label').textContent='Модуль не выполнен';$('match').textContent='✕ Ошибка';showError(e.message);}
  finally{setBusy(false);}
}
function download(name,data,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function copy(withCode){
  const text=prompt+(withCode?'\n\n## Supplied starter solver.js\n\n```js\n'+baseSource+'\n```\n':'');
  try{await navigator.clipboard.writeText(text);$('copy-status').textContent=withCode?'Скопировано: полный промпт и стартовый код.':'Промпт скопирован. Приложите solver.js отдельно.';toast('Задание скопировано');}
  catch{$('copy-text').value=text;$('copy-dialog').showModal();$('copy-text').focus();$('copy-text').select();}
}
function clearReport(){report=null;$('score').textContent=$('speedup').textContent=$('correctness').textContent='—';$('score').className='';$('score-note').textContent='База = 0 · каждые 2× = +100';$('result-identity').textContent='Новый замер ещё не выполнен';$('report-label').textContent='Нет отчёта';$('result-summary').textContent='Запустите замер для выбранного решения.';$('result-rows').replaceChildren();$('export').disabled=true;drawChart($('chart'),$('chart-legend'),null);renderHistory();}
function renderHistory(){
  $('history').replaceChildren();
  for(const r of history){const b=document.createElement('button');b.className=r===report?'selected':'';b.disabled=busy;
    for(const [tag,text] of [['strong',r.modelName||r.candidate],['b',r.status==='valid'?`${r.score>0?'+':''}${r.score.toFixed(1)}`:'FAIL'],['small',`${r.profile} · seed ${r.seed} · ${r.repeats} серий`],['small',new Date(r.createdAt).toLocaleString('ru-RU')]]){const el=document.createElement(tag);el.textContent=text;b.append(el);}
    b.onclick=()=>{report=r;displayReport();};$('history').append(b);
  }
}
function saveReport(r){history=[r,...history].slice(0,20);try{localStorage.setItem(STORAGE,JSON.stringify(history));}catch{toast('История не сохранена: хранилище недоступно');}renderHistory();}
function chart(){const previous=history.find(r=>r!==report&&compatible(r,report));drawChart($('chart'),$('chart-legend'),report,$('chart-family').value,previous);}
function displayReport(){
  const valid=report.status==='valid';$('score').textContent=valid?`${report.score>0?'+':''}${report.score.toFixed(1)}`:'FAIL';$('score').className=valid&&report.score>=0?'good':'bad';
  $('speedup').textContent=valid?`${report.speedup.toFixed(2)}×`:'—';$('correctness').textContent=`${report.correctness.passed}/${report.correctness.total}`;
  $('score-note').textContent=valid?'База = 0 · каждые 2× = +100':'Нет баллов за неверный результат';
  $('result-identity').textContent=`${report.modelName||report.candidate} · ${report.profile} · seed ${report.seed}`;$('report-label').textContent=report.profile;
  $('result-summary').textContent=valid?`Все проверки и шаги пройдены. ${report.repeats} серий; время включает создание солвера.`:`Ошибка проверки: ${report.error?.message||'неверный результат'}`;
  $('result-rows').replaceChildren();for(const row of report.cases){const tr=document.createElement('tr');for(const v of [`${row.title} · ${row.scale}`,row.cells.toLocaleString('ru-RU'),`${row.baseline.totalMs.toFixed(2)} мс`,`${row.candidate.totalMs.toFixed(2)} мс`,`${row.speedup.toFixed(2)}×`]){const td=document.createElement('td');td.textContent=v;tr.append(td);}tr.lastChild.className=row.speedup>=1?'good':'bad';$('result-rows').append(tr);}
  $('noise-note').textContent=report.noisy?'Заметный разброс времени (>25%). Закройте фоновые задачи и повторите замер того же файла.':'Сравнивайте одинаковые профиль, seed, браузер и устройство. Импортированные отчёты не подтверждены сервером.';
  $('export').disabled=busy;chart();renderHistory();
}
async function loadFile(file){if(!file||busy)return;setBusy(true);try{source=await file.text();sourceName=file.name;$('source-info').textContent=`${file.name} · ${file.size.toLocaleString('ru-RU')} байт`;$('model-name').value=file.name.replace(/\.(m?js)$/i,'');$('candidate-title').textContent=$('model-name').value;clearReport();await loadReplay();}catch(e){showError(e.message);}finally{setBusy(false);}}
$('run').onclick=async()=>{
  clearReport();setBusy(true,true);showError();$('progress').textContent='Проверка целостности и модуля…';
  try{await verifyIntegrity();report=await task('bench');Object.assign(report,{candidate:sourceName,modelName:$('model-name').value||sourceName,candidateSHA256:await sha256(source),environment:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency},integrity:'verified'});saveReport(report);displayReport();}
  catch(e){clearReport();$('score-note').textContent='Прогон не завершён';showError(e.message);}finally{setBusy(false);}
};
$('cancel').onclick=()=>cancelTask?.();$('play').onclick=()=>{if(!replayData)return;if(frameIndex===replayData.frames.length-1)resetScene();setPlaying(!playing);};$('step').onclick=()=>{setPlaying(false);advance();};$('reset').onclick=resetScene;
$('timeline').oninput=()=>{if(!replayData||busy)return;setPlaying(false);frameIndex=Number($('timeline').value);renderer?.seek(replayData.world,replayData.frames,frameIndex);updateStep();};
if(renderer)renderer.onFrame=time=>{if(playing&&time-lastStep>1000){lastStep=time;advance();}};
document.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>{kind=b.dataset.scene;loadReplay();});
$('new-seed').onclick=()=>{$('seed').value=crypto.getRandomValues(new Uint32Array(1))[0];clearReport();loadReplay();};$('seed').onchange=()=>{clearReport();loadReplay();};
$('profile').onchange=()=>{const p=PROFILES[$('profile').value];$('repeats').value=p.repeats;$('profile-info').textContent=`${p.scales.length*4} нагрузок · 33 проверки · ${p.scales.join(' / ')}`;clearReport();};$('repeats').onchange=clearReport;
$('model-name').oninput=()=>{$('candidate-title').textContent=$('model-name').value||sourceName;};
$('candidate-input').onchange=async e=>{await loadFile(e.target.files[0]);e.target.value='';};
$('drop-zone').onkeydown=e=>{if(!busy&&(e.key==='Enter'||e.key===' ')){e.preventDefault();$('candidate-input').click();}};
$('drop-zone').ondragover=e=>{e.preventDefault();if(!busy)$('drop-zone').classList.add('dragging');};$('drop-zone').ondragleave=()=>$('drop-zone').classList.remove('dragging');$('drop-zone').ondrop=e=>{e.preventDefault();$('drop-zone').classList.remove('dragging');loadFile(e.dataTransfer.files[0]);};
$('download-solver').onclick=()=>download('solver.js',baseSource,'text/javascript');$('copy-prompt').onclick=()=>copy(true);$('copy-prompt-only').onclick=()=>copy(false);$('close-copy').onclick=()=>$('copy-dialog').close();
$('export').onclick=()=>{if(report)download(`demolition-v2-${report.profile}-${report.seed}.json`,JSON.stringify(report,null,2),'application/json');};$('chart-family').onchange=chart;
$('report-input').onchange=async e=>{try{const imported=[];for(const f of e.target.files){if(f.size>5e6)throw new Error('Отчёт слишком большой');const r=JSON.parse(await f.text());if(!validReport(r))throw new Error(`${f.name}: нужен корректный JSON-отчёт ${SUITE_VERSION}`);imported.push(r);}for(const r of imported)saveReport(r);if(imported.length){report=imported.at(-1);displayReport();}showError();}catch(err){showError(err.message);}finally{e.target.value='';}};
try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'[]');if(Array.isArray(saved))history=saved.filter(validReport).slice(0,20);}catch{}renderHistory();
try{setBusy(true);await verifyIntegrity();[baseSource,prompt]=await Promise.all(['./engine/baseline.js','./MODEL_PROMPT.md'].map(async f=>(await read(f)).text()));source=baseSource;await loadReplay();}
catch(e){$('integrity').textContent='Ошибка загрузки стенда';showError(e.message);setBusy(false);}
