import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,args:['--use-angle=swiftshader','--enable-webgl']});
const page = await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
  await page.goto(process.env.BENCH_URL || 'http://127.0.0.1:4173',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#match').textContent.includes('совпадает'));
  assert.equal(await page.locator('#error').isVisible(),false);
  await page.screenshot({path:new URL('../artifacts/desktop.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
  await page.locator('#step').click();
  await page.waitForFunction(()=>document.querySelector('#timeline').value===1);
  for(const scene of ['tower','lattice','bridge']) {
    await page.locator(`[data-scene="${scene}"]`).click();
    await page.waitForFunction(()=>!document.querySelector('#run').disabled);
    assert.equal(await page.locator('#error').isVisible(),false);
  }
  await page.locator('#run').click();
  await page.waitForFunction(()=>!document.querySelector('#export').disabled,null,{timeout:90000});
  assert.match(await page.locator('#result-summary').textContent(),/пройдены/);
  assert.equal(await page.locator('#result-rows tr').count(),3);
  await page.screenshot({path:new URL('../artifacts/results.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#export').click();
  const download=await downloadPromise;
  const downloaded=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(downloaded.status,'valid');assert.equal(downloaded.cases.length,3);assert.equal(downloaded.candidateSHA256.length,64);
  const bad=Buffer.from('export function createSolver(){return {step(){return new Uint32Array()}}}');
  await page.locator('#candidate-input').setInputFiles({name:'wrong.js',mimeType:'text/javascript',buffer:bad});
  await page.waitForFunction(()=>!document.querySelector('#run').disabled);
  await page.locator('#run').click();
  await page.waitForFunction(()=>document.querySelector('#score').textContent==='FAIL');
  assert.match(await page.locator('#result-summary').textContent(),/Ошибка/);
  const hang=Buffer.from('export function createSolver(){while(true){}}');
  await page.locator('#candidate-input').setInputFiles({name:'hang.js',mimeType:'text/javascript',buffer:hang});
  await page.locator('#cancel').waitFor({state:'visible'});
  await page.locator('#cancel').click();
  await page.waitForFunction(()=>!document.querySelector('#run').disabled);
  assert.match(await page.locator('#error').textContent(),/остановлено/);
  await page.locator('#candidate-input').setInputFiles(new URL('../solver.js',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'));
  await page.waitForFunction(()=>!document.querySelector('#run').disabled);
  await page.locator('#play').click();
  await page.waitForFunction(()=>document.querySelector('#timeline').value>=2);
  await page.locator('#play').click();
  await page.locator('#reset').click();
  assert.equal(await page.locator('#timeline').evaluate(el=>el.value),0);
  await page.setViewportSize({width:700,height:1000});
  await page.screenshot({path:new URL('../artifacts/narrow.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed: rendering, scene selection, replay, benchmark, export, invalid candidate, cancel hung module, restore, resize.');
} finally { await browser.close(); }
