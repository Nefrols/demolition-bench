import {Renderer} from './render.js';
import {RUN_LIMIT_MS} from './engine/scenarios.js';
const $=id=>document.getElementById(id);
let renderer,fullPrompt='',ready=false,job=null,revision=0,debounce,toastTimer,replayData,frame=0,playing=false,lastFrame=0;
try{renderer=new Renderer($('scene'));}catch{$('scene-hint').textContent='WebGL недоступен. Проверка кода работает.';}
function state(title,message='',kind=''){$('headline').textContent=title;$('status').textContent=message;$('result').className=kind;$('metrics').hidden=true;}
function stopJob(){if(job){clearTimeout(job.timer);job.worker.terminate();job=null;}playing=false;renderer?.pause(false);$('progress').hidden=true;$('cancel').hidden=true;}
function showReplay(data,animate=false){replayData=data;frame=0;renderer?.setWorld(data.world);renderer?.apply(data.frames[0]);playing=animate;lastFrame=performance.now();$('replay').disabled=!renderer;}
function showReport(report){
  if(report.status!=='valid'){state('Ошибка решения',report.error?.message||'Неверный результат.','bad');return;}
  const row=report.cases[0],fmt=n=>`${n.toFixed(2)} мс`;
  state(`${report.speedup.toFixed(2)}×`,report.noisy?'Ответ верный. Есть шум замера: небольшие различия не показательны.':'Ответ верный. Ускорение относительно базы.',report.speedup>=1?'good':'');
  $('metrics').hidden=false;$('score').textContent=`${report.score>0?'+':''}${report.score.toFixed(1)}`;$('baseline-time').textContent=fmt(row.baseline.totalMs);$('candidate-time').textContent=fmt(row.candidate.totalMs);
}
function start(source,action='evaluate'){
  stopJob();const ticket=revision,worker=new Worker('./worker.js',{type:'module'}),deadline=performance.now()+RUN_LIMIT_MS;
  const expire=()=>{if(ticket!==revision)return;stopJob();state('Лимит времени','Прогон остановлен через 120 секунд. Баллы не начислены.','bad');};
  job={worker,timer:setTimeout(expire,RUN_LIMIT_MS)};
  if(action==='evaluate'){renderer?.pause(true);$('replay').disabled=true;state('Проверяем…','Сначала точность ответа, затем скорость кода.');$('progress').hidden=false;$('progress').value=0;$('cancel').hidden=false;}
  worker.onmessage=({data})=>{
    if(ticket!==revision)return;
    if(performance.now()>=deadline){expire();return;}
    if(data.type==='progress'){$('status').textContent=data.text;$('progress').value=data.fraction||0;return;}
    stopJob();$('replay').disabled=!replayData||!renderer;
    if(data.type==='error'){state('Ошибка решения',data.message,'bad');return;}
    if(data.result.replay)showReplay(data.result.replay,action==='evaluate');
    if(data.result.report)showReport(data.result.report);
  };
  worker.onerror=e=>{if(ticket!==revision)return;stopJob();state('Ошибка решения',e.message,'bad');};
  worker.postMessage({source,action});
}
function unwrap(text){const s=text.trim(),match=s.match(/^```(?:javascript|js|mjs)?\s*\n([\s\S]*?)\n```\s*$/i);return match?match[1]:s;}
$('solver-code').addEventListener('input',()=>{
  revision++;clearTimeout(debounce);stopJob();$('replay').disabled=true;
  if(!ready)return;
  const source=unwrap($('solver-code').value);
  if(!source){state('Вставьте решение','Проверка начнётся автоматически.');$('replay').disabled=!replayData||!renderer;return;}
  state('Готовим проверку…');debounce=setTimeout(()=>start(source),400);
});
$('cancel').onclick=()=>{revision++;stopJob();$('replay').disabled=!replayData||!renderer;state('Остановлено','Вставьте код заново, чтобы повторить проверку.');};
$('replay').onclick=()=>{if(replayData)showReplay(replayData,true);};
if(renderer)renderer.onFrame=time=>{
  if(!playing||time-lastFrame<850)return;lastFrame=time;
  if(frame+1>=replayData.frames.length){playing=false;return;}renderer.apply(replayData.frames[++frame]);
};
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&job){revision++;stopJob();state('Замер прерван','Вкладка была скрыта. Вставьте код снова для достоверного замера.');}
});
$('copy-prompt').onclick=async()=>{
  try{await navigator.clipboard.writeText(fullPrompt);$('toast').textContent='Промпт со стартовым solver скопирован';$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2500);}
  catch{$('copy-text').value=fullPrompt;$('copy-dialog').showModal();$('copy-text').focus();$('copy-text').select();}
};
$('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();$('close-copy').onclick=()=>$('copy-dialog').close();
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
async function read(path){const r=await fetch(path);if(!r.ok)throw new Error(`Не удалось загрузить ${path}`);return r;}
async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
try{
  const manifest=await(await read('./manifest.json')).json();
  const contents=await Promise.all(Object.entries(manifest.files).map(async([file,hash])=>{const bytes=await(await read(file)).arrayBuffer();if(await digest(bytes)!==hash)throw new Error(`Не совпадает версия ${file}. Обновите страницу.`);return [file,new TextDecoder().decode(bytes)];}));
  const files=Object.fromEntries(contents);
  fullPrompt=files['MODEL_PROMPT.md']+'\n\n## Supplied starter solver.js\n\n```js\n'+files['engine/baseline.js']+'\n```\n';
  ready=true;$('copy-prompt').disabled=false;$('solver-code').disabled=false;$('integrity').textContent='2.1 · целостность проверена';
  $('solver-code').placeholder='export const apiVersion = 2;\n\nexport function createSolver(world) {\n  // Вставьте готовое решение модели\n}';
  start('', 'preview');
}catch(e){state('Не удалось загрузить стенд',e.message,'bad');$('integrity').textContent='Ошибка загрузки';}
