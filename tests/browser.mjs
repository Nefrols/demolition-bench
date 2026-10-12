import {chromium} from 'playwright';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),artifact=name=>fileURLToPath(new URL('artifacts/'+name,root));
await mkdir(new URL('artifacts/',root),{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--use-angle=swiftshader','--enable-webgl']});
const context=await browser.newContext({viewport:{width:1440,height:1080},deviceScaleFactor:1,permissions:['clipboard-read','clipboard-write']});
context.setDefaultTimeout(60000);
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const ready=()=>page.waitForFunction(()=>!document.querySelector('#run').disabled);
const upload=async(name,source)=>{await page.locator('#candidate-input').setInputFiles({name,mimeType:'text/javascript',buffer:Buffer.from(source)});await ready();};
try{
  await page.goto(process.env.BENCH_URL||'http://127.0.0.1:4173/',{waitUntil:'networkidle'});await ready();
  assert.match(await page.locator('#match').textContent(),/совпадает/);assert.equal(await page.locator('#error').isVisible(),false);
  await page.locator('#copy-prompt').click();const copied=await page.evaluate(()=>navigator.clipboard.readText());assert.match(copied,/ONE submission attempt/);assert.match(copied,/export const apiVersion = 2/);assert.match(copied,/surfaceFaces/);assert.match(copied,/function visit/);
  await page.locator('#copy-prompt-only').click();assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).includes('function visit'),false);
  const downloadSolver=page.waitForEvent('download');await page.locator('#download-solver').click();assert.match(await readFile(await (await downloadSolver).path(),'utf8'),/apiVersion = 2/);
  await page.screenshot({path:artifact('v2-desktop.png'),fullPage:true});
  await page.locator('#step').click();assert.equal(await page.locator('#timeline').inputValue(),'1');
  for(const family of ['viaduct','islands','labyrinth','arcology']){await page.locator(`[data-scene="${family}"]`).click();await ready();assert.equal(await page.locator('#error').isVisible(),false);}
  await page.locator('#timeline').fill('12');await page.locator('#timeline').dispatchEvent('input');assert.match(await page.locator('#step-label').textContent(),/^13 /);await page.locator('#reset').click();assert.equal(await page.locator('#timeline').inputValue(),'0');
  await page.locator('#profile').selectOption('quick');await page.locator('#run').click();await page.waitForFunction(()=>!document.querySelector('#export').disabled,null,{timeout:180000});
  assert.match(await page.locator('#result-summary').textContent(),/пройдены/);assert.equal(await page.locator('#result-rows tr').count(),8);assert.equal(await page.locator('#chart svg polyline').count(),2);assert.equal(await page.locator('#history button').count(),1);
  const exported=page.waitForEvent('download');await page.locator('#export').click();const result=JSON.parse(await readFile(await (await exported).path(),'utf8'));assert.equal(result.status,'valid');assert.equal(result.schema,2);assert.equal(result.candidateSHA256.length,64);
  const previous={...result,modelName:'Previous same environment'};
  await page.locator('#report-input').setInputFiles({name:'previous.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(previous))});await page.waitForFunction(()=>document.querySelectorAll('#history button').length===2);assert.equal(await page.locator('#chart svg polyline').count(),3);
  await page.locator('#chart-family').selectOption('labyrinth');assert.equal(await page.locator('#chart svg circle').count(),6);
  await page.screenshot({path:artifact('v2-results.png'),fullPage:true});
  await page.locator('#report-input').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schema":1}')});await page.waitForFunction(()=>!document.querySelector('#error').hidden);assert.match(await page.locator('#error').textContent(),/JSON/);
  await upload('v1.js','export function createSolver(){return {step(){return new Uint32Array()}}}');assert.match(await page.locator('#error').textContent(),/API V2/);assert.equal(await page.locator('#score').textContent(),'—');
  const base=await readFile(new URL('solver.js',root),'utf8');
  const wrongStats=base.replace('export function createSolver','function original')+'\nexport function createSolver(w){const s=original(w);return {step(e){const r=s.step(e);if(r.components.length)r.components[5]++;return r;}}}';
  await upload('wrong-stats.js',wrongStats);await page.locator('#timeline').fill(await page.locator('#timeline').getAttribute('max'));await page.locator('#timeline').dispatchEvent('input');assert.match(await page.locator('#error').textContent(),/field 5/);await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#score').textContent==='FAIL');assert.match(await page.locator('#result-summary').textContent(),/Ошибка/);
  await page.locator('#candidate-input').setInputFiles({name:'hang.js',mimeType:'text/javascript',buffer:Buffer.from('export const apiVersion=2; while(true){}')});await page.locator('#cancel').waitFor({state:'visible'});await page.locator('#cancel').click();await ready();assert.match(await page.locator('#error').textContent(),/остановлено/);
  await page.locator('#drop-zone').evaluate((el,source)=>{const data=new DataTransfer();data.items.add(new File([source],'dropped.js',{type:'text/javascript'}));el.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}));},base);await ready();assert.match(await page.locator('#source-info').textContent(),/dropped.js/);assert.equal(await page.locator('#error').isVisible(),false);
  await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#timeline').value)>=2);await page.locator('#play').click();await page.locator('#reset').click();
  for(const width of [700,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:artifact(`v2-mobile-${width}.png`),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  console.log('V2 UI scenarios passed; checking persistence and archive.');
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});await ready();assert.equal(await page.locator('#history button').count(),3);
  await page.locator('#history button').nth(1).click();assert.match(await page.locator('#result-identity').textContent(),/Previous/);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('blocked');}}}));await page.locator('#copy-prompt').click();assert.equal(await page.locator('#copy-dialog').isVisible(),true);assert.match(await page.locator('#copy-text').inputValue(),/apiVersion = 2/);await page.locator('#close-copy').click();
  const legacyURL=new URL('./v1/',page.url()).href;await page.goto(legacyURL,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#match').textContent.includes('совпадает'));assert.equal(await page.locator('#error').isVisible(),false);
  assert.deepEqual(errors,[]);console.log('Browser V2 passed: clipboard, download, upload/drop, replay/seek, benchmark, chart/history/import/export, wrong stats, API1 rejection, hung import cancellation, persistence, mobile, V1 archive.');
}finally{await browser.close();}
