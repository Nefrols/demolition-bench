// V2 baseline: dense storage + active IDs + reusable traversal buffers.
// Real edits trigger a global reachability pass. All work lives inside the API.
export const apiVersion = 2;

export function createSolver({ nx, ny, nz, solid, anchors }) {
  const plane = nx * nz, count = plane * ny;
  const cells = solid, fixed = anchors;
  const active = new Uint32Array(count), slot = new Int32Array(count).fill(-1);
  const boundary = new Uint8Array(count), seen = new Uint32Array(count);
  const queue = new Uint32Array(count), detached = new Uint32Array(count);
  // Six directional boundary bits eliminate coordinate division in traversal.
  for (let y=0;y<ny;y++) for(let z=0;z<nz;z++) for(let x=0;x<nx;x++) {
    const id=x+nx*(z+nz*y);
    boundary[id]=(x>0?1:0)|(x+1<nx?2:0)|(z>0?4:0)|(z+1<nz?8:0)|(y>0?16:0)|(y+1<ny?32:0);
  }
  let live=0, epoch=0, initialized=false;
  for(let id=0;id<count;id++) if(cells[id]) {slot[id]=live;active[live++]=id;}
  let componentBuffer = new Uint32Array(12*256);
  const empty = new Uint32Array();
  function erase(id) {
    if(!cells[id]) return false;
    const at=slot[id], last=active[--live]; active[at]=last;slot[last]=at;
    slot[id]=-1;cells[id]=0;fixed[id]=0;return true;
  }
  function visit(id, stamp, tail) {
    const mask=boundary[id];let n;
    if(mask&1){n=id-1;if(cells[n]&&seen[n]!==stamp){seen[n]=stamp;queue[tail++]=n;}}
    if(mask&2){n=id+1;if(cells[n]&&seen[n]!==stamp){seen[n]=stamp;queue[tail++]=n;}}
    if(mask&4){n=id-nx;if(cells[n]&&seen[n]!==stamp){seen[n]=stamp;queue[tail++]=n;}}
    if(mask&8){n=id+nx;if(cells[n]&&seen[n]!==stamp){seen[n]=stamp;queue[tail++]=n;}}
    if(mask&16){n=id-plane;if(cells[n]&&seen[n]!==stamp){seen[n]=stamp;queue[tail++]=n;}}
    if(mask&32){n=id+plane;if(cells[n]&&seen[n]!==stamp){seen[n]=stamp;queue[tail++]=n;}}
    return tail;
  }
  return {
    step({remove,add,anchorOff,anchorOn}) {
      let changed=!initialized; initialized=true;
      // Transaction order is part of the contract: remove, add, off, on.
      for(const id of remove) if(erase(id)) changed=true;
      for(const id of add) if(!cells[id]) {cells[id]=1;fixed[id]=0;slot[id]=live;active[live++]=id;changed=true;}
      for(const id of anchorOff) if(fixed[id]) {fixed[id]=0;changed=true;}
      for(const id of anchorOn) if(cells[id]&&!fixed[id]) {fixed[id]=1;changed=true;}
      if(!changed) return {detached:empty,components:empty};
      epoch=(epoch+1)>>>0;if(!epoch){seen.fill(0);epoch=1;}
      let head=0,tail=0;
      for(let i=0;i<live;i++){const id=active[i];if(fixed[id]){seen[id]=epoch;queue[tail++]=id;}}
      while(head<tail) tail=visit(queue[head++],epoch,tail);
      let nDetached=0,nComponents=0,at=0;
      while(at<live) {
        const seed=active[at];
        if(seen[seed]===epoch){at++;continue;}
        head=0;tail=1;queue[0]=seed;seen[seed]=epoch;
        let minId=seed,sx=0,sy=0,sz=0,surface=0;
        let x0=nx,y0=ny,z0=nz,x1=0,y1=0,z1=0;
        while(head<tail) {
          const id=queue[head++],mask=boundary[id];
          const x=id%nx,y=Math.floor(id/plane),z=Math.floor(id/nx)%nz;
          if(id<minId)minId=id;
          sx+=x;sy+=y;sz+=z;
          if(x<x0)x0=x;if(y<y0)y0=y;if(z<z0)z0=z;
          if(x>x1)x1=x;if(y>y1)y1=y;if(z>z1)z1=z;
          surface+=6-((mask&1)&&cells[id-1]?1:0)-((mask&2)&&cells[id+1]?1:0)
            -((mask&4)&&cells[id-nx]?1:0)-((mask&8)&&cells[id+nx]?1:0)
            -((mask&16)&&cells[id-plane]?1:0)-((mask&32)&&cells[id+plane]?1:0);
          tail=visit(id,epoch,tail);
        }
        if((nComponents+1)*12>componentBuffer.length){const grown=new Uint32Array(componentBuffer.length*2);grown.set(componentBuffer);componentBuffer=grown;}
        componentBuffer.set([minId,tail,sx,sy,sz,surface,x0,y0,z0,x1,y1,z1],nComponents++*12);
        // Components have no occupied face-neighbors outside themselves.
        for(let j=0;j<tail;j++){const id=queue[j];detached[nDetached++]=id;erase(id);}
      }
      return {detached:detached.subarray(0,nDetached),components:componentBuffer.subarray(0,nComponents*12)};
    }
  };
}
