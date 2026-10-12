import {emptyEdit} from './oracle.js';
export const SUITE_VERSION='demolition-2.0.0';
export const FAMILIES=['arcology','viaduct','islands','labyrinth'];
export const TITLES={arcology:'Аркология',viaduct:'Транспортный узел',islands:'Островные опоры',labyrinth:'Пористый монолит'};
export const SCALES={S:[32,24,32],M:[64,48,64],L:[112,80,96],XL:[160,112,128],preview:[46,40,40]};
export const PROFILES={
  quick:{title:'Разведка',scales:['S','M'],cycles:8,repeats:3,timeout:180000},
  standard:{title:'Основной',scales:['S','M','L'],cycles:16,repeats:5,timeout:600000},
  stress:{title:'Стресс',scales:['M','L','XL'],cycles:24,repeats:5,timeout:1200000}
};
export function random(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)|0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function makeWorld(nx,ny,nz,predicate,anchorPredicate=(x,y)=>y===0){
  const solid=new Uint8Array(nx*ny*nz),anchors=new Uint8Array(solid.length);
  for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const id=x+nx*(z+nz*y);if(predicate(x,y,z)){solid[id]=1;anchors[id]=+!!anchorPredicate(x,y,z);}}
  return {nx,ny,nz,solid,anchors};
}
export function select(w,fn){const ids=[];for(let y=0;y<w.ny;y++)for(let z=0;z<w.nz;z++)for(let x=0;x<w.nx;x++)if(fn(x,y,z))ids.push(x+w.nx*(z+w.nz*y));return Uint32Array.from(ids);}
export function edit(values={}){const e=emptyEdit();for(const k of Object.keys(e))if(values[k])e[k]=Uint32Array.from(values[k]);return e;}
export function makeScenario(family,seed=314159,scale='S',cycles=8){
  const dims=SCALES[scale];if(!dims||!FAMILIES.includes(family))throw new Error('Unknown scenario');
  const [nx,ny,nz]=dims,rnd=random(seed^Math.imul(FAMILIES.indexOf(family)+1,0x9E3779B1));
  const heights=Array.from({length:Math.ceil(nx/16)*Math.ceil(nz/16)},()=>Math.floor(ny*(.55+rnd()*.4)));
  let predicate;
  if(family==='arcology')predicate=(x,y,z)=>{
    const lx=x%16,lz=z%16,h=heights[Math.floor(x/16)+Math.ceil(nx/16)*Math.floor(z/16)];
    const inside=lx>=2&&lx<=13&&lz>=2&&lz<=13;
    const wall=lx===2||lx===13||lz===2||lz===13;
    const corner=(lx<4||lx>11)&&(lz<4||lz>11);
    const window=y%8>=3&&y%8<=5&&((lx%5>=2&&lx%5<=3)||(lz%5>=2&&lz%5<=3));
    const tower=inside&&y<h&&((wall&&!window)||corner||y%8<2||y===h-1);
    const skyway=(y===Math.floor(ny*.34)||y===Math.floor(ny*.34)+1)&&((lx>=6&&lx<=8)||(lz>=6&&lz<=8));
    return tower||skyway;
  };
  else if(family==='viaduct')predicate=(x,y,z)=>{
    const deck=Math.floor(ny*.52),lane=z%16,pi=x%14;
    return (lane>=3&&lane<=12&&y>=deck&&y<=deck+1)
      ||(pi>=4&&pi<=6&&lane>=6&&lane<=9&&y<=deck)
      ||((lane===3||lane===12)&&y>deck&&y<=deck+6&&(y===deck+6||x%7===0||(y-deck)===x%6))
      ||(x%28>=12&&x%28<=15&&y===deck);
  };
  else if(family==='islands')predicate=(x,y,z)=>{
    const lx=x%10,lz=z%10,h=Math.floor(ny*.72)-Math.floor(x/10)%3;
    return (lx>=4&&lx<=5&&lz>=4&&lz<=5&&y<h)
      ||(lx>=1&&lx<=8&&lz>=1&&lz<=8&&(y===h||y===h-1))
      ||(lx>=2&&lx<=7&&lz>=2&&lz<=7&&y===0);
  };
  else predicate=(x,y,z)=>{
    if(x<2||x>=nx-2||z<2||z>=nz-2||y>=ny-3)return false;
    const channel=(x%11>=3&&x%11<=7&&y%9>=3&&y%9<=6)||(z%13>=4&&z%13<=9&&y%9>=3&&y%9<=6);
    return !channel;
  };
  const world=makeWorld(nx,ny,nz,predicate),occupied=[],roots=[];
  for(let id=0;id<world.solid.length;id++){if(world.solid[id])occupied.push(id);if(world.anchors[id])roots.push(id);}
  const events=[];const push=(label,phase,values)=>events.push({label,phase,edit:edit(values)});
  push('Исходная конструкция','init',{});
  for(let i=0;i<cycles;i++){
    const center=occupied[Math.floor(rnd()*occupied.length)];
    const cx=center%nx,cy=Math.floor(center/(nx*nz)),cz=Math.floor(center/nx)%nz,r=1.6+rnd()*(scale==='preview'?2:3.5);
    const cut=select(world,(x,y,z)=>(x-cx)**2+(y-cy)**2+(z-cz)**2<r*r);
    push(`Точечный подрыв ${i+1}`,'damage',{remove:cut});
    const restore=Array.from(cut).filter(id=>world.solid[id]);
    push(`Восстановление сектора ${i+1}`,'repair',{add:restore,anchorOn:restore.filter(id=>world.anchors[id])});
  }
  const roof=select(world,(x,y,z)=>y===Math.floor(ny*.5)&&predicate(x,y,z));
  push('Перенос закреплений на верхний ярус','anchors',{anchorOff:roots,anchorOn:roof});
  push('Восстановление несущего каркаса','rebuild',{add:occupied,anchorOn:roots,anchorOff:roof});
  const partition=select(world,(x,y)=>x===Math.floor(nx/2)&&y>0);
  push('Разрез несущей структуры','split',{remove:partition});
  push('Снятие опор левого сектора','anchors',{anchorOff:roots.filter(id=>id%nx<nx/2)});
  push('Сборка нового соединения','rebuild',{add:occupied,anchorOn:roots});
  const floating=select(world,(x,y,z)=>y===ny-1&&x%3===0&&z%3===0);
  push('Множество независимых фрагментов','fragments',{add:floating});
  push('Повторное закрепление фрагментов','anchors',{add:floating,anchorOn:floating});
  push('Освобождение фрагментов','fragments',{anchorOff:floating});
  push('Полное отключение опор','collapse',{anchorOff:roots});
  push('Повторная сборка объекта','rebuild',{add:occupied,anchorOn:roots});
  push('Транзакция без изменений','idle',{});
  return {id:`${family}-${scale}`,family,title:TITLES[family],scale,world,events};
}
export function edgeCases(seed){
  const cases=[],add=(id,world,batches)=>cases.push({id,title:id,world,events:batches.map(e=>({label:id,phase:'test',edit:edit(e)}))});
  add('empty',makeWorld(3,3,3,()=>false),[{}, {remove:[0,0]}, {add:[13]}, {add:[13],anchorOn:[13]}, {anchorOff:[13]}]);
  add('transaction-order',makeWorld(1,1,1,()=>true),[{remove:[0,0],add:[0,0]}, {add:[0],anchorOff:[0],anchorOn:[0]}, {anchorOff:[0]}]);
  add('chain',makeWorld(1,9,1,()=>true),[{}, {remove:[3]}, {add:[3,4,5,6,7,8]}, {anchorOff:[0],anchorOn:[8]}, {remove:[4]}, {add:[4],anchorOn:[0]}, {}]);
  add('diagonal',makeWorld(3,3,3,(x,y,z)=>x===y&&y===z),[{}, {add:[13],anchorOn:[13]}, {add:[26]}]);
  add('row-boundary',makeWorld(3,2,2,(x,y,z)=>(x===2&&z===0&&y===0)||(x===0&&z===1)),[{}, {add:[5]}, {anchorOff:[2]}]);
  add('multiple-paths',makeWorld(7,6,1,(x,y)=>x===0||x===6||y===5),[{remove:[7]}, {remove:[13]}, {add:[7,13,14,20,21,27,28,34,35,36,37,38,39,40,41]}, {anchorOn:[41]}, {}]);
  add('surface-cavity',makeWorld(5,5,5,(x,y,z)=>!(x===2&&y===2&&z===2),()=>false),[{}, {add:[0,1,5,6],anchorOn:[0]}, {anchorOff:[0]}]);
  add('single-voxel',makeWorld(1,1,1,()=>true),[{}, {anchorOff:[0]}, {anchorOn:[0]}, {add:[0],anchorOn:[0]}, {remove:[0]}]);
  const snake=makeWorld(129,129,1,(x,y)=>y%2===0||x===(Math.floor(y/2)%2===0?128:0),(x,y)=>x===0&&y===0);
  add('long-snake',snake,[{}, {remove:[1]}, {add:[1],anchorOn:[2]}, {}]);
  const rnd=random(seed);
  for(let k=0;k<24;k++){
    const nx=2+Math.floor(rnd()*11),ny=2+Math.floor(rnd()*11),nz=1+Math.floor(rnd()*11);
    const w=makeWorld(nx,ny,nz,()=>rnd()<.72,()=>rnd()<.06),batches=[{}];
    for(let i=0;i<24;i++){
      const ids=()=>Array.from({length:1+Math.floor(rnd()*18)},()=>Math.floor(rnd()*w.solid.length));
      batches.push({remove:ids(),add:ids(),anchorOff:ids(),anchorOn:ids()});
    }
    add(`random-${k}`,w,batches);
  }
  return cases;
}
