/* ASRO Homepage Concept — shader-powered particle logo, no runtime dependencies.
   The mask is generated from assets/asro-logo.svg (vectorized from ASRO's supplied logo).
   Scroll is reversible; effects are optional for reduced-motion and non-WebGL devices. */
const story = document.getElementById('story');
const stage = document.getElementById('stage');
const canvas = document.getElementById('particles');
const introduction = document.getElementById('introduction');
const light = document.getElementById('stage-light');
const heroWords = document.getElementById('hero-words');
const invite = document.getElementById('scroll-invite');
const header = document.getElementById('header');
const progressFill = document.getElementById('progress-fill');
const staticLogo = document.getElementById('static-logo');
const replay = document.getElementById('replay');
const menu = document.getElementById('menu-toggle');
const mobileNav = document.getElementById('mobile-nav');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); };

function updateScroll() {
  const maxScroll = Math.max(1, story.offsetHeight - window.innerHeight);
  const p = reducedMotion.matches ? 0 : clamp(-story.getBoundingClientRect().top / maxScroll);
  const scatter = smooth(.19, .73, p);
  const reveal = smooth(.63, .91, p);
  document.documentElement.style.setProperty('--scroll-progress', p.toFixed(4));
  light.style.opacity = reveal.toFixed(3);
  introduction.style.opacity = reveal.toFixed(3);
  introduction.style.transform = `translateY(${(1 - reveal) * 36}px)`;
  introduction.style.pointerEvents = reveal > .85 ? 'auto' : 'none';
  heroWords.style.opacity = (1 - smooth(.07, .34, p)).toFixed(3);
  invite.style.opacity = (1 - smooth(.02, .25, p)).toFixed(3);
  progressFill.style.width = (p * 100).toFixed(2) + '%';
  staticLogo.style.opacity = stage.classList.contains('particles-ready') ? '0' : (1 - scatter).toFixed(3);
  stage.classList.toggle('intro-active', reveal > .65);
  header.classList.toggle('is-light', reveal > .6 || story.getBoundingClientRect().bottom <= window.innerHeight * .3);
  return { p, scatter, reveal };
}

let scrollState = updateScroll();
let scrollScheduled = false;
window.addEventListener('scroll', () => {
  if (!scrollScheduled) {
    scrollScheduled = true;
    requestAnimationFrame(() => { scrollState = updateScroll(); scrollScheduled = false; });
  }
}, { passive: true });
window.addEventListener('resize', () => { scrollState = updateScroll(); }, { passive: true });

function closeMenu() {
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'メニューを開く');
  mobileNav.hidden = true;
  document.body.classList.remove('menu-open');
}
menu.addEventListener('click', () => {
  const next = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(next));
  menu.setAttribute('aria-label', next ? 'メニューを閉じる' : 'メニューを開く');
  mobileNav.hidden = !next;
  document.body.classList.toggle('menu-open', next);
});
mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
replay.addEventListener('click', () => {
  window.scrollTo({ top: story.offsetTop, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  animationStart = performance.now();
});

let animationStart = performance.now();
const vertexSource = `#version 300 es
precision highp float;
in vec2 aTarget;
in vec2 aOrigin;
in vec2 aSide;
in float aSeed;
in float aSize;
uniform float uTime;
uniform float uGather;
uniform float uScatter;
uniform float uIntro;
uniform vec2 uScale;
uniform vec2 uMouse;
uniform float uDpr;
out float vAlpha;
out float vTone;
void main() {
  float gather = uGather*uGather*(3.0-2.0*uGather);
  float scatter = uScatter*uScatter*(3.0-2.0*uScatter);
  vec2 target = aTarget*uScale;
  // Tiny idle vibrations keep the assembled logo alive.
  vec2 shimmer = vec2(sin(uTime*.8+aSeed*43.0), cos(uTime*.67+aSeed*38.0)) * .0022;
  vec2 traveling = aOrigin + vec2(sin(uTime*.25+aSeed*31.0),cos(uTime*.3+aSeed*17.0))*.045;
  vec2 assembled = mix(traveling,target+shimmer,gather);
  vec2 edges = vec2(aSide.x,aSide.y + sin(uTime*.35+aSeed*22.0)*.045);
  vec2 position = mix(assembled,edges,scatter);
  position += uMouse * .016 * (1.0-scatter);
  gl_Position = vec4(position,0.0,1.0);
  gl_PointSize = aSize * uDpr * mix(1.0,.82,scatter);
  vAlpha = mix(.87,.62,scatter) * (.7 + .3*sin(aSeed*99.0+uTime*.8));
  vTone = aSeed;
}`;
const fragmentSource = `#version 300 es
precision highp float;
in float vAlpha;
in float vTone;
uniform float uIntro;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord-vec2(.5));
  float halo = 1.0-smoothstep(.06,.5,d);
  if (halo < .015) discard;
  vec3 bright = mix(vec3(.23,.60,1.0),vec3(.83,.95,1.0),vTone);
  vec3 dark = mix(vec3(.04,.28,.64),vec3(.23,.50,.83),vTone);
  vec3 color = mix(bright,dark,uIntro);
  outColor = vec4(color,halo*vAlpha);
}`;

function shader(gl, type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const details = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile failed: ' + details);
  }
  return sh;
}
function createProgram(gl) {
  const program = gl.createProgram();
  const vs = shader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = shader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vs); gl.attachShader(program, fs);
  gl.linkProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  return program;
}
async function loadLogoMask() {
  const image = new Image();
  image.decoding = 'async';
  image.src = './assets/asro-logo.svg';
  await image.decode();
  const buffer = document.createElement('canvas');
  buffer.width = buffer.height = 600;
  const context = buffer.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, 600, 600);
  const pixels = context.getImageData(0, 0, 600, 600).data;
  const list = [];
  // Uniform sampling across actual logo pixels, preserving cut-outs and typography.
  for (let y = 102; y < 499; y += 2) {
    for (let x = 93; x < 494; x += 2) {
      if (pixels[(y*600+x)*4+3] > 140) list.push([x,y]);
    }
  }
  if (list.length < 300) throw new Error('Logo mask was empty.');
  return list;
}

async function startParticles() {
  if (reducedMotion.matches) return;
  let gl;
  try { gl = canvas.getContext('webgl2', { alpha:true, antialias:false, depth:false, premultipliedAlpha:false, powerPreference:'high-performance' }); }
  catch (_) { return; }
  if (!gl) return;
  try {
    const mask = await loadLogoMask();
    const program = createProgram(gl);
    const count = window.innerWidth < 650 ? 10500 : 20500;
    const data = {
      aTarget: new Float32Array(count*2),
      aOrigin: new Float32Array(count*2),
      aSide: new Float32Array(count*2),
      aSeed: new Float32Array(count),
      aSize: new Float32Array(count)
    };
    const rand = Math.random;
    for (let i=0;i<count;i++) {
      const [x,y] = mask[Math.floor(rand()*mask.length)];
      const seed = rand(), angle = rand()*Math.PI*2;
      const radius = .32 + Math.sqrt(rand())*1.2;
      data.aTarget[2*i] = (x-293)/196 + (rand()-.5)*.008;
      data.aTarget[2*i+1] = (300-y)/196 + (rand()-.5)*.008;
      data.aOrigin[2*i] = Math.cos(angle)*radius*1.25;
      data.aOrigin[2*i+1] = Math.sin(angle)*radius;
      const side = (rand()<.5 ? -1 : 1);
      data.aSide[2*i] = side * (.76 + rand()*.22);
      data.aSide[2*i+1] = (rand()*2-1)*.99;
      data.aSeed[i] = seed;
      data.aSize[i] = .85 + rand()*1.65 + (rand()>.97?1.6:0);
    }
    gl.useProgram(program);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    for (const [name,values] of Object.entries(data)) {
      const buffer=gl.createBuffer(), location=gl.getAttribLocation(program,name);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, name==='aSeed'||name==='aSize'?1:2,gl.FLOAT,false,0,0);
    }
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    const uniform = {};
    for (const key of ['uTime','uGather','uScatter','uIntro','uScale','uMouse','uDpr']) uniform[key]=gl.getUniformLocation(program,key);
    let width=0,height=0,ratio=1;
    const pointer={x:0,y:0},mouse={x:0,y:0};
    window.addEventListener('pointermove', e => {
      pointer.x=e.clientX/window.innerWidth*2-1;
      pointer.y=1-e.clientY/window.innerHeight*2;
    }, {passive:true});
    function resize() {
      const box=stage.getBoundingClientRect();
      width=Math.round(box.width); height=Math.round(box.height);
      ratio=Math.min(window.devicePixelRatio||1,1.8);
      canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
      gl.viewport(0,0,canvas.width,canvas.height);
    }
    resize();
    window.addEventListener('resize',resize,{passive:true});
    gl.clearColor(0,0,0,0);
    const start=performance.now();
    let last=0;
    let frameRequested=false;
    function render(now) {
      frameRequested=false;
      if (document.hidden || reducedMotion.matches) return;
      frameRequested=true;
      requestAnimationFrame(render);
      if (now-last < (width<650 ? 20 : 14)) return;
      last=now;
      const rect=story.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) return;
      const gather=smooth(0,1,clamp((now-animationStart)/2900));
      const sizePx=Math.min(width*.78,height*.7,625);
      mouse.x+=(pointer.x-mouse.x)*.04;mouse.y+=(pointer.y-mouse.y)*.04;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);gl.bindVertexArray(vao);
      gl.uniform1f(uniform.uTime,(now-start)/1000);
      gl.uniform1f(uniform.uGather,gather);
      gl.uniform1f(uniform.uScatter,scrollState.scatter);
      gl.uniform1f(uniform.uIntro,scrollState.reveal);
      gl.uniform2f(uniform.uScale,sizePx/width,sizePx/height);
      gl.uniform2f(uniform.uMouse,mouse.x,mouse.y);
      gl.uniform1f(uniform.uDpr,ratio);
      gl.drawArrays(gl.POINTS,0,count);
      gl.bindVertexArray(null);
    }
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      stage.classList.remove('particles-ready');
    });
    stage.classList.add('particles-ready');
    scrollState = updateScroll();
    animationStart=performance.now();
    requestAnimationFrame(render);
  } catch (err) {
    // Never block access to the site if graphics are unavailable.
    console.warn('Particle rendering unavailable, displaying static ASRO logo.',err);
    stage.classList.remove('particles-ready');
  }
}
startParticles();
