import {chromium} from 'playwright';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),artifact=name=>fileURLToPath(new URL('artifacts/'+name,root));
await mkdir(new URL('artifacts/',root),{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--use-angle=swiftshader','--enable-webgl']});
const context=await browser.newContext({viewport:{width:1440,height:960},permissions:['clipboard-read','clipboard-write']});
context.setDefaultTimeout(30000);
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const baseline=await readFile(new URL('solver.js',root),'utf8');
const valid=()=>page.waitForFunction(()=>document.querySelector('#headline').textContent.includes('×'));
try{
  await page.goto(process.env.BENCH_URL||'http://127.0.0.1:4184/dist/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!document.querySelector('#replay').disabled);
  assert.equal(await page.locator('input[type=file],select,#history,#seed,#profile').count(),0);
  await page.locator('#copy-prompt').click();const prompt=await page.evaluate(()=>navigator.clipboard.readText());assert.match(prompt,/ONE submission attempt/);assert.match(prompt,/function visit/);assert.match(prompt,/18,432/);assert.match(prompt,/120-second/);assert.doesNotMatch(prompt,/2.3 million/);
  const canvas=page.locator('#scene'),before=await canvas.screenshot();const rect=await canvas.boundingBox();
  await page.mouse.move(rect.x+rect.width*.6,rect.y+rect.height*.65);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.8,rect.y+rect.height*.67,{steps:10});await page.mouse.up();await page.waitForTimeout(100);
  assert.notDeepEqual(await canvas.screenshot(),before,'Mouse drag rotates the scene');
  await page.screenshot({path:artifact('minimal-ready.png'),fullPage:true});
  const started=Date.now();await page.locator('#solver-code').fill('```js\n'+baseline+'\n```');await valid();
  console.log(`Paste-to-result baseline: ${Date.now()-started} ms`);
  assert.equal(await page.locator('#metrics').isVisible(),true);assert.match(await page.locator('#baseline-time').textContent(),/мс/);assert.equal(await page.locator('#cancel').isVisible(),false);
  await page.screenshot({path:artifact('minimal-result.png'),fullPage:true});
  await page.locator('#help').click();assert.equal(await page.locator('#help-dialog').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#help-dialog').isVisible(),false);
  const wrong=baseline.replace('export function createSolver','function original')+'\nexport function createSolver(w){const s=original(w);return {step(e){const r=s.step(e);if(r.components.length)r.components[5]++;return r;}}}';
  await page.locator('#solver-code').fill(wrong);await page.waitForFunction(()=>document.querySelector('#headline').textContent==='Ошибка решения');assert.equal(await page.locator('#metrics').isVisible(),false);assert.match(await page.locator('#status').textContent(),/field 5/);
  await page.locator('#solver-code').fill('export const apiVersion=2; while(true){}');await page.locator('#cancel').waitFor({state:'visible'});
  await page.locator('#solver-code').fill(baseline);await valid();
  await page.locator('#solver-code').fill('export const apiVersion=2; export function createSolver(){while(true){}}');await page.locator('#cancel').waitFor({state:'visible'});await page.locator('#cancel').click();assert.equal(await page.locator('#headline').textContent(),'Остановлено');
  await page.locator('#solver-code').fill('export function createSolver(){}');await page.waitForFunction(()=>document.querySelector('#headline').textContent==='Ошибка решения');assert.match(await page.locator('#status').textContent(),/API V2/);
  await page.locator('#solver-code').fill('export !!!');await page.waitForFunction(()=>document.querySelector('#headline').textContent==='Ошибка решения');
  await page.locator('#solver-code').fill('');assert.equal(await page.locator('#headline').textContent(),'Вставьте решение');
  // Exercise the actual browser watchdog without waiting two real minutes.
  await page.clock.install();await page.locator('#solver-code').fill('export const apiVersion=2; while(true){}');await page.clock.runFor(600);await page.locator('#cancel').waitFor({state:'visible'});await page.clock.fastForward(120001);assert.equal(await page.locator('#headline').textContent(),'Лимит времени');assert.equal(await page.locator('#cancel').isVisible(),false);await page.clock.resume();
  await page.locator('#solver-code').fill(baseline);await valid();
  for(const width of [800,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:artifact(`minimal-${width}.png`),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!document.querySelector('#replay').disabled);assert.equal(await page.locator('#solver-code').inputValue(),'');assert.equal(await page.locator('#metrics').isVisible(),false);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('blocked');}}}));await page.locator('#copy-prompt').click();assert.equal(await page.locator('#copy-dialog').isVisible(),true);assert.match(await page.locator('#copy-text').inputValue(),/function visit/);await page.locator('#close-copy').click();
  assert.deepEqual(errors,[]);console.log('Minimal browser flow passed: combined prompt, paste/autocheck, rotation, results, errors, replacement/cancel, 120s watchdog, Help, mobile, no persistence.');
}finally{await browser.close();}
