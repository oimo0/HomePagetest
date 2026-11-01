import { buildContourPaths, buildFlowTexture } from './contour-flow.mjs';

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
  // Hold the assembled logo longer, then gradually split it in two phases.
  // Both phases are tied to scroll progress, so reversing scroll reforms the logo.
  const drift = smooth(.23, .74, p);
  const spread = smooth(.37, .86, p);
  const reveal = smooth(.78, .96, p);
  document.documentElement.style.setProperty('--scroll-progress', p.toFixed(4));
  light.style.opacity = (reveal * .4).toFixed(3);
  introduction.style.opacity = reveal.toFixed(3);
  introduction.style.transform = `translateY(${(1 - reveal) * 36}px)`;
  introduction.style.pointerEvents = reveal > .85 ? 'auto' : 'none';
  heroWords.style.opacity = (1 - smooth(.16, .43, p)).toFixed(3);
  invite.style.opacity = (1 - smooth(.08, .34, p)).toFixed(3);
  progressFill.style.width = (p * 100).toFixed(2) + '%';
  staticLogo.style.opacity = stage.classList.contains('particles-ready') ? '0' : (1 - drift).toFixed(3);
  stage.classList.toggle('intro-active', reveal > .7);
  header.classList.remove('is-light');
  return { p, drift, spread, reveal };
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
in vec4 aFlow; // row, start index, path length, intensity
uniform sampler2D uPathTexture;
uniform float uTime;
uniform float uGather;
uniform float uDrift;
uniform float uSpread;
uniform vec2 uScale;
uniform vec2 uMouse;
uniform float uDpr;
out float vAlpha;
out float vTone;
out float vSpread;
out float vSpark;
out float vMoving;
void main() {
  float gather = smoothstep(0.0,1.0,uGather);
  float drift = smoothstep(0.0,1.0,uDrift + (aSeed-.5)*.18);
  float spread = smoothstep(0.0,1.0,uSpread + (aSeed-.5)*.22);
  vec2 logo = aTarget*uScale;
  float wave = logo.x*11.0 + logo.y*8.0-uTime*1.15;
  vec2 tinyFlow = vec2(cos(wave),sin(wave))*uScale*.0034;
  vec2 alive = logo+tinyFlow;
  if (aFlow.z>=2.0) {
    // Looping paths follow the original logo and its inward contours,
    // with no teleporting between strokes.
    float pace=5.7+aFlow.w*3.0+aSeed*1.0;
    float phase=mod(aFlow.y+uTime*pace,aFlow.z);
    int first=int(floor(phase));
    int second=(first+1)%int(aFlow.z);
    int row=int(aFlow.x);
    vec2 p0=texelFetch(uPathTexture,ivec2(first,row),0).xy;
    vec2 p1=texelFetch(uPathTexture,ivec2(second,row),0).xy;
    alive=mix(p0,p1,fract(phase))*uScale+tinyFlow*.10;
  }
  vec2 roaming=aOrigin+vec2(sin(uTime*.25+aSeed*31.0),
                            cos(uTime*.30+aSeed*17.0))*.052;
  vec2 assembled=mix(roaming,alive,gather);
  vec2 peeling=mix(assembled,alive*vec2(.65,.94),drift);
  vec2 edges=vec2(aSide.x+sin(uTime*.26+aSeed*11.0)*.017,
                  aSide.y+sin(uTime*.42+aSeed*22.0)*.064);
  vec2 pos=mix(peeling,edges,drift*spread);
  pos+=uMouse*.014*(1.0-spread);
  gl_Position=vec4(pos,0.0,1.0);
  vMoving=step(2.0,aFlow.z)*aFlow.w*gather;
  float shimmer=pow(max(0.0,sin(logo.x*8.0+logo.y*4.0-uTime*.8)),13.0);
  vSpark=shimmer*.29*gather;
  gl_PointSize=aSize*uDpr*mix(1.07,1.24,spread)*(1.0+vMoving*.20+vSpark*.24);
  vAlpha=mix(.86,.93,spread)*(.83+.17*sin(aSeed*99.0+uTime*.7));
  vTone=aSeed;
  vSpread=spread;
}`;
const fragmentSource = `#version 300 es
precision highp float;
in float vAlpha;
in float vTone;
in float vSpread;
in float vSpark;
in float vMoving;
out vec4 outColor;
void main() {
  float d=length(gl_PointCoord-vec2(.5));
  float halo=1.0-smoothstep(.08,.5,d);
  float core=1.0-smoothstep(.02,.17,d);
  if(halo<.015)discard;
  vec3 color=mix(vec3(.18,.52,1.0),vec3(.81,.95,1.0),vTone);
  color=mix(color,vec3(.47,.76,1.0),vSpread*.11);
  color=mix(color,vec3(.94,.985,1.0),min(1.0,vMoving*.28+vSpark*.42));
  float opacity=min(1.0,halo*.68+core*.62+vMoving*.07+vSpark*.14)*vAlpha;
  outColor=vec4(color,opacity);
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
  return {list,pixels};
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
    const paths = buildContourPaths(mask.pixels,600,600,3);
    const pathMap = buildFlowTexture(paths,Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE)));
    const pathTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,pathTexture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,pathMap.textureWidth,pathMap.textureHeight,0,gl.RGBA,gl.FLOAT,pathMap.pixels);
    if(gl.getError()!==gl.NO_ERROR)throw Error('Unable to upload circulation paths');
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program,'uPathTexture'),0);
    const count = window.innerWidth < 650 ? 16000 : 30000;
    const data = {
      aTarget:new Float32Array(count*2),
      aOrigin:new Float32Array(count*2),
      aSide:new Float32Array(count*2),
      aSeed:new Float32Array(count),
      aSize:new Float32Array(count),
      aFlow:new Float32Array(count*4)
    };
    const rand=Math.random;
    const selectTrack=()=>{
      const n=rand()*pathMap.totalWeight;
      return pathMap.tracks.find(t=>n<t.cumulative)||pathMap.tracks[pathMap.tracks.length-1];
    };
    for(let i=0;i<count;i++){
      const seed=rand(),angle=rand()*Math.PI*2;
      const radius=.32+Math.sqrt(rand())*1.2;
      if(rand()<.48){
        const track=selectTrack(), sample=Math.floor(rand()*track.length);
        const off=(track.row*pathMap.textureWidth+sample)*4;
        data.aTarget[i*2]=pathMap.pixels[off];
        data.aTarget[i*2+1]=pathMap.pixels[off+1];
        data.aFlow[i*4]=track.row;
        data.aFlow[i*4+1]=sample;
        data.aFlow[i*4+2]=track.length;
        data.aFlow[i*4+3]=track.strength;
      } else {
        const [x,y]=mask.list[Math.floor(rand()*mask.list.length)];
        data.aTarget[i*2]=(x-293)/196+(rand()-.5)*.008;
        data.aTarget[i*2+1]=(300-y)/196+(rand()-.5)*.008;
      }
      data.aOrigin[i*2]=Math.cos(angle)*radius*1.25;
      data.aOrigin[i*2+1]=Math.sin(angle)*radius;
      const side=rand()<.5?-1:1;
      data.aSide[i*2]=side*(.72+rand()*.28);
      data.aSide[i*2+1]=(rand()*2-1)*.92;
      data.aSeed[i]=seed;
      data.aSize[i]=1.35+rand()*2.0+(rand()>.965?1.5:0);
    }
    gl.useProgram(program);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    for (const [name,values] of Object.entries(data)) {
      const buffer=gl.createBuffer(), location=gl.getAttribLocation(program,name);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location,name==='aFlow'?4:((name==='aSeed'||name==='aSize')?1:2),gl.FLOAT,false,0,0);
    }
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
    const uniform = {};
    for (const key of ['uTime','uGather','uDrift','uSpread','uScale','uMouse','uDpr']) uniform[key]=gl.getUniformLocation(program,key);
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
      if (reducedMotion.matches) return;
      frameRequested=true;
      requestAnimationFrame(render);
      if (document.hidden) return;
      if (now-last < (width<650 ? 20 : 14)) return;
      last=now;
      const rect=story.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) return;
      const gather=smooth(0,1,clamp((now-animationStart)/3400));
      const sizePx=Math.min(width*.8,height*.74,690);
      mouse.x+=(pointer.x-mouse.x)*.04;mouse.y+=(pointer.y-mouse.y)*.04;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D,pathTexture);
      gl.useProgram(program);gl.bindVertexArray(vao);
      gl.uniform1f(uniform.uTime,(now-start)/1000);
      gl.uniform1f(uniform.uGather,gather);
      gl.uniform1f(uniform.uDrift,scrollState.drift);
      gl.uniform1f(uniform.uSpread,scrollState.spread);
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
