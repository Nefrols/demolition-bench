// Independent V2 oracle: union-find, then per-component integer reductions.
export const STRIDE=12;
export const emptyEdit=()=>({remove:new Uint32Array(),add:new Uint32Array(),anchorOff:new Uint32Array(),anchorOn:new Uint32Array()});
export function cloneEdit(edit){return Object.fromEntries(['remove','add','anchorOff','anchorOn'].map(k=>[k,edit[k].slice()]));}
export function cloneWorld(w){return {nx:w.nx,ny:w.ny,nz:w.nz,solid:w.solid.slice(),anchors:w.anchors.slice()};}
export function applyEdit(w,e){
  for(const id of e.remove){w.solid[id]=0;w.anchors[id]=0;}
  for(const id of e.add)if(!w.solid[id]){w.solid[id]=1;w.anchors[id]=0;}
  for(const id of e.anchorOff)w.anchors[id]=0;
  for(const id of e.anchorOn)if(w.solid[id])w.anchors[id]=1;
}
export function referenceStep(w,edit){
  applyEdit(w,edit);
  const {nx,ny,nz,solid,anchors}=w,plane=nx*nz,n=solid.length;
  const parent=new Int32Array(n).fill(-1),size=new Uint32Array(n);
  function root(a){while(parent[a]!==a){parent[a]=parent[parent[a]];a=parent[a];}return a;}
  function join(a,b){a=root(a);b=root(b);if(a===b)return;if(size[a]<size[b])[a,b]=[b,a];parent[b]=a;size[a]+=size[b];}
  for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
    const i=x+nx*(z+nz*y);if(!solid[i])continue;parent[i]=i;size[i]=1;
    if(x&&solid[i-1])join(i,i-1);if(z&&solid[i-nx])join(i,i-nx);if(y&&solid[i-plane])join(i,i-plane);
  }
  const supported=new Uint8Array(n);
  for(let i=0;i<n;i++)if(solid[i]&&anchors[i])supported[root(i)]=1;
  const groups=new Map(),ids=[];
  for(let i=0;i<n;i++){
    if(!solid[i])continue;const r=root(i);if(supported[r])continue;
    const x=i%nx,y=Math.floor(i/plane),z=Math.floor(i/nx)%nz;
    let rec=groups.get(r);
    if(!rec){rec=[i,0,0,0,0,0,x,y,z,x,y,z];groups.set(r,rec);}
    ids.push(i);rec[1]++;rec[2]+=x;rec[3]+=y;rec[4]+=z;
    rec[5]+=6-(x>0&&solid[i-1]?1:0)-(x+1<nx&&solid[i+1]?1:0)-(z>0&&solid[i-nx]?1:0)-(z+1<nz&&solid[i+nx]?1:0)-(y>0&&solid[i-plane]?1:0)-(y+1<ny&&solid[i+plane]?1:0);
    rec[6]=Math.min(rec[6],x);rec[7]=Math.min(rec[7],y);rec[8]=Math.min(rec[8],z);
    rec[9]=Math.max(rec[9],x);rec[10]=Math.max(rec[10],y);rec[11]=Math.max(rec[11],z);
  }
  const records=[...groups.values()].sort((a,b)=>a[0]-b[0]);
  for(const id of ids){solid[id]=0;anchors[id]=0;}
  return {detached:Uint32Array.from(ids),components:Uint32Array.from(records.flat())};
}
export function prepareScenario(s){
  const w=cloneWorld(s.world);
  return {...s,frames:s.events.map(e=>({...e,edit:cloneEdit(e.edit),expected:referenceStep(w,e.edit)}))};
}
export function checkResult(result,expected,count){
  if(!result||!(result.detached instanceof Uint32Array)||!(result.components instanceof Uint32Array))throw new Error('V2: step() должен вернуть {detached: Uint32Array, components: Uint32Array}');
  if(result.detached.length>count||result.components.length>count*STRIDE||result.components.length%STRIDE)throw new Error('Invalid result length');
  const actual=result.detached.slice().sort(),target=expected.detached;
  for(let i=0;i<actual.length;i++){if(actual[i]>=count)throw new Error(`Out-of-range voxel: ${actual[i]}`);if(i&&actual[i]===actual[i-1])throw new Error(`Duplicate voxel: ${actual[i]}`);}
  let a=0,b=0;const extra=[],missing=[];
  while(a<actual.length||b<target.length){
    if(a<actual.length&&b<target.length&&actual[a]===target[b]){a++;b++;}
    else if(b>=target.length||(a<actual.length&&actual[a]<target[b]))extra.push(actual[a++]);else missing.push(target[b++]);
  }
  let componentError='';
  if(result.components.length!==expected.components.length)componentError='Wrong number of component records';
  else {
    const offsets=Array.from({length:result.components.length/STRIDE},(_,i)=>i*STRIDE).sort((a,b)=>result.components[a]-result.components[b]);
    outer:for(let i=0;i<offsets.length;i++)for(let k=0;k<STRIDE;k++)if(result.components[offsets[i]+k]!==expected.components[i*STRIDE+k]){componentError=`Component ${expected.components[i*STRIDE]}, field ${k}: expected ${expected.components[i*STRIDE+k]}, got ${result.components[offsets[i]+k]}`;break outer;}
  }
  return {ok:!extra.length&&!missing.length&&!componentError,extra,missing,componentError};
}
