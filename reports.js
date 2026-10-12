import {SUITE_VERSION,PROFILES,FAMILIES,SCALES} from './engine/scenarios.js';
const finite=x=>typeof x==='number'&&Number.isFinite(x),positive=x=>finite(x)&&x>0;
export function validReport(r){
  if(!r||r.schema!==2||r.suite!==SUITE_VERSION||!Object.hasOwn(PROFILES,r.profile)||!['valid','invalid'].includes(r.status)||!Number.isInteger(r.seed)||r.seed<0||r.seed>0xffffffff||!Number.isInteger(r.repeats)||r.repeats<3||r.repeats>15||!Array.isArray(r.cases)||r.cases.length>12||!r.correctness||!Number.isInteger(r.correctness.passed)||r.correctness.passed<0||r.correctness.total!==33||r.correctness.passed>33||typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt))||typeof r.candidate!=='string')return false;
  if(r.modelName!==undefined&&typeof r.modelName!=='string')return false;
  const ids=new Set();
  for(const c of r.cases){if(!c||!FAMILIES.includes(c.family)||!PROFILES[r.profile].scales.includes(c.scale)||typeof c.title!=='string'||!positive(c.cells)||c.cells!==SCALES[c.scale].reduce((a,b)=>a*b)||!positive(c.baseline?.totalMs)||!positive(c.candidate?.totalMs)||!positive(c.speedup))return false;const key=c.family+c.scale;if(ids.has(key))return false;ids.add(key);if(Math.abs(c.speedup-c.baseline.totalMs/Math.max(c.candidate.totalMs,.0001))>1e-6*c.speedup)return false;}
  if(r.status==='valid'){if(r.correctness.passed!==33||r.cases.length!==PROFILES[r.profile].scales.length*4||!positive(r.speedup)||!finite(r.score))return false;const speed=Math.exp(r.cases.reduce((s,c)=>s+Math.log(c.speedup),0)/r.cases.length);return Math.abs(r.speedup-speed)<1e-6*speed&&Math.abs(r.score-100*Math.log2(speed))<1e-5;}
  return r.score===null&&r.speedup===null;
}
export function compatible(a,b){return !!a&&!!b&&a.status==='valid'&&b.status==='valid'&&a.suite===b.suite&&a.profile===b.profile&&a.seed===b.seed&&a.repeats===b.repeats&&JSON.stringify(a.environment)===JSON.stringify(b.environment);}
export function drawChart(container,legend,report,family='all',previous=null){
  container.replaceChildren();legend.replaceChildren();if(!report||report.status!=='valid'){const p=document.createElement('p');p.textContent='График появится после корректного замера.';container.append(p);return;}
  const scales=PROFILES[report.profile].scales,colors=['#f2c17b','#86dfc7','#bda3ff'];
  const average=(r,scale,key)=>{const rows=r.cases.filter(c=>c.scale===scale&&(family==='all'||c.family===family));return rows.length?Math.exp(rows.reduce((s,c)=>s+Math.log(c[key].totalMs),0)/rows.length):null;};
  const series=[{label:'База',values:scales.map(s=>average(report,s,'baseline'))},{label:report.modelName||report.candidate,values:scales.map(s=>average(report,s,'candidate'))}];
  if(previous)series.push({label:`Ранее: ${previous.modelName||previous.candidate}`,values:scales.map(s=>average(previous,s,'candidate'))});
  const values=series.flatMap(s=>s.values).filter(positive),logs=values.map(Math.log10),lo=Math.floor(Math.min(...logs)),hi=Math.max(lo+1,Math.ceil(Math.max(...logs)));
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 550 260');svg.setAttribute('role','img');svg.setAttribute('aria-label','Время вычислений по масштабу в миллисекундах');
  const add=(tag,attrs,text)=>{const e=document.createElementNS(svg.namespaceURI,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);return e;};
  const x=i=>65+i*440/Math.max(1,scales.length-1),y=v=>220-(Math.log10(v)-lo)/(hi-lo)*195;
  for(let n=lo;n<=hi;n++){const v=10**n;add('line',{x1:65,y1:y(v),x2:505,y2:y(v),stroke:'#34454b'});add('text',{x:55,y:y(v)+4,'text-anchor':'end',fill:'#96aaa9','font-size':10},`${v>=1?v:v.toFixed(-n)} мс`);}
  scales.forEach((s,i)=>add('text',{x:x(i),y:244,'text-anchor':'middle',fill:'#96aaa9','font-size':12},s));
  series.forEach((s,k)=>{add('polyline',{points:s.values.map((v,i)=>`${x(i)},${y(v)}`).join(' '),fill:'none',stroke:colors[k],'stroke-width':2});s.values.forEach((v,i)=>{const c=add('circle',{cx:x(i),cy:y(v),r:4,fill:colors[k]});const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=`${s.label} / ${scales[i]}: ${v.toFixed(3)} мс`;c.append(title);});const span=document.createElement('span'),mark=document.createElement('i');mark.style.background=colors[k];span.append(mark,document.createTextNode(s.label));legend.append(span);});
  container.append(svg);if(family==='all'){const span=document.createElement('span');span.textContent='Все семейства: геометрическое среднее времени';legend.append(span);}
}
