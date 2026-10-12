// Fixed presentation layer. No connectivity decisions or benchmark timing here.
const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aOffset;
layout(location=3) in vec3 aColor;
layout(location=4) in vec3 aScale;
uniform mat4 uVP;
out vec3 vWorld; out vec3 vNormal; out vec3 vColor;
void main(){vWorld=aPos*aScale+aOffset;vNormal=aNormal;vColor=aColor;gl_Position=uVP*vec4(vWorld,1.);}`;
const FS = `#version 300 es
precision highp float;
in vec3 vWorld;in vec3 vNormal;in vec3 vColor;
uniform vec3 uEye;uniform float uGround;
out vec4 color;
void main(){
  vec3 sun=normalize(vec3(-.5,.9,.6));
  float light=.49+.56*max(dot(vNormal,sun),0.);
  vec3 col=vColor*light;
  if(uGround>.5){
    vec2 uv=vWorld.xz/4.;
    vec2 width=max(fwidth(uv),vec2(.0001));
    vec2 edge=abs(fract(uv-.5)-.5)/width;
    float line=1.-clamp(min(edge.x,edge.y),0.,1.);
    col=mix(col,vec3(.29,.37,.37),line*.32);
    float shadow=exp(-dot(vWorld.xz/vec2(35.,20.),vWorld.xz/vec2(35.,20.)));
    col*=1.-shadow*.19;
  }
  float fog=1.-exp(-length(vWorld-uEye)*.003);
  col=mix(col,vec3(.105,.147,.164),fog*.6);
  color=vec4(col,1.);
}`;

function shader(gl, type, source) {
  const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}
function multiply(a, b) {
  const m = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) m[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return m;
}
const normal = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
function lookAt(eye, target) {
  const z = normal(eye.map((v, i) => v - target[i])), x = normal(cross([0,1,0], z)), y = cross(z, x);
  const dot = a => -a.reduce((s, v, i) => s + v * eye[i], 0);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,dot(x),dot(y),dot(z),1]);
}
function perspective(aspect) {
  const f = 1 / Math.tan(Math.PI / 8), near = .2, far = 700;
  return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);
}

function cube() {
  const out = [];
  const faces = [
    [[1,0,0],[[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]]],
    [[-1,0,0],[[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]]],
    [[0,1,0],[[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]]],
    [[0,-1,0],[[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]]],
    [[0,0,1],[[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]]],
    [[0,0,-1],[[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]]]
  ];
  for (const [n, vertices] of faces) for (const i of [0,1,2,0,2,3]) out.push(...vertices[i], ...n);
  return new Float32Array(out);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('Для 3D-просмотра нужен WebGL 2. CLI-бенчмарк работает без видеокарты.');
    const program = this.program = gl.createProgram();
    gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, FS)); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    this.uVP = gl.getUniformLocation(program, 'uVP'); this.uEye = gl.getUniformLocation(program, 'uEye'); this.uGround = gl.getUniformLocation(program, 'uGround');
    this.geometry = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.geometry); gl.bufferData(gl.ARRAY_BUFFER, cube(), gl.STATIC_DRAW);
    this.ground = this.makeBatch(); this.upload(this.ground, new Float32Array([0,-.68,0,.15,.195,.21,240,.3,240]));
    this.states = [0,1].map(() => ({ static: this.makeBatch(), dynamic: this.makeBatch(), falling: [], ghosts: [] }));
    this.yaw = .76; this.pitch = .48; this.paused = false;
    let dragging = false, px = 0, py = 0;
    canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; dragging = true; px = e.clientX; py = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!dragging) return; this.yaw -= (e.clientX - px) * .007; this.pitch = Math.max(.15, Math.min(1.3, this.pitch + (e.clientY - py) * .007)); px = e.clientX; py = e.clientY; });
    for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event, () => dragging = false);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.tick = this.tick.bind(this); this.raf = requestAnimationFrame(this.tick);
  }
  makeBatch() {
    const gl = this.gl, vao = gl.createVertexArray(), buffer = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.geometry);
    for (let i = 0; i < 2; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i,3,gl.FLOAT,false,24,i*12); }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (let i = 2; i < 5; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i,3,gl.FLOAT,false,36,(i-2)*12); gl.vertexAttribDivisor(i,1); }
    return { vao, buffer, count: 0 };
  }
  upload(batch, data) { const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER,batch.buffer); gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW); batch.count = data.length / 9; }
  pause(value) { this.paused = value; cancelAnimationFrame(this.raf); if (!value) this.raf = requestAnimationFrame(this.tick); }
  setWorld(world) {
    this.world = world;
    for (const s of this.states) { s.solid = world.solid.slice(); s.falling = []; s.ghosts = []; this.rebuild(s); }
  }
  position(id) {
    const { nx, nz } = this.world;
    return [id % nx - (nx - 1) / 2, Math.floor(id / (nx*nz)), Math.floor(id / nx) % nz - (nz - 1) / 2];
  }
  rebuild(s) {
    const { nx, ny, nz, anchors } = this.world, plane = nx*nz, data = [];
    for (let i = 0; i < s.solid.length; i++) {
      if (!s.solid[i]) continue;
      const x = i % nx, y = Math.floor(i / plane), z = Math.floor(i / nx) % nz;
      if (x && x < nx-1 && y && y < ny-1 && z && z < nz-1 && s.solid[i-1] && s.solid[i+1] && s.solid[i-nx] && s.solid[i+nx] && s.solid[i-plane] && s.solid[i+plane]) continue;
      const c = anchors[i] ? [.93,.67,.32] : (y % 9 < 2 ? [.69,.73,.69] : [.51,.60,.61]);
      const shade = .92 + ((i*37 % 19)/19)*.12;
      data.push(...this.position(i),...c.map(v => v*shade),.96,.96,.96);
    }
    this.upload(s.static, Float32Array.from(data));
  }
  apply(frame) {
    const now = performance.now() / 1000;
    for (let k = 0; k < 2; k++) {
      const s = this.states[k], detached = k ? frame.actual : frame.expected;
      for (const id of frame.removed) s.solid[id] = 0;
      const errorIds = new Set(k ? frame.extra : []);
      for (const id of detached) if (s.solid[id]) {
        const p = this.position(id);
        s.falling.push({ p, born: now, error: errorIds.has(id) }); s.solid[id] = 0;
      }
      s.ghosts = k ? frame.missing : [];
      this.rebuild(s);
    }
  }
  draw(batch) { if (!batch.count) return; const gl = this.gl; gl.bindVertexArray(batch.vao); gl.drawArraysInstanced(gl.TRIANGLES,0,36,batch.count); }
  tick(time) {
    if (this.paused) return;
    this.onFrame?.(time);
    const gl = this.gl, canvas = this.canvas, dpr = Math.min(devicePixelRatio || 1,1.5);
    const w = Math.max(2, Math.floor(canvas.clientWidth*dpr)), h = Math.max(2, Math.floor(canvas.clientHeight*dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.clearColor(.105,.147,.164,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.useProgram(this.program);
    if (this.world) {
      const { nx, ny, nz } = this.world;
      const distance = Math.max(nx,ny,nz)*1.78, target = [0,ny*.33,0];
      const eye = [Math.sin(this.yaw)*Math.cos(this.pitch)*distance,target[1]+Math.sin(this.pitch)*distance,Math.cos(this.yaw)*Math.cos(this.pitch)*distance];
      gl.uniform3fv(this.uEye,eye);
      for (let k = 0; k < 2; k++) {
        const left = k ? Math.floor(w/2) : 0, width = k ? w-left : Math.floor(w/2);
        gl.viewport(left,0,width,h); gl.uniformMatrix4fv(this.uVP,false,multiply(perspective(width/h),lookAt(eye,target)));
        gl.uniform1f(this.uGround,1); this.draw(this.ground); gl.uniform1f(this.uGround,0);
        const s = this.states[k]; this.draw(s.static);
        const dynamic = [], now = time/1000;
        s.falling = s.falling.filter(p => now-p.born < 3.0);
        for (const f of s.falling) {
          const age = now-f.born, drop = 15*age*age, p = f.p;
          const shrink = Math.max(0,Math.min(1,(3-age)*2));
          const y = Math.max(-.15,p[1]-drop);
          dynamic.push(p[0],y,p[2],...(f.error ? [1,.23,.35] : [.87,.47,.27]),.94*shrink,.94*shrink,.94*shrink);
        }
        for (const id of s.ghosts) dynamic.push(...this.position(id),1,.2,.36,1.025,1.025,1.025);
        this.upload(s.dynamic,Float32Array.from(dynamic)); this.draw(s.dynamic);
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  }
}
