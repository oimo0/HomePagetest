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
in vec2 aFlowTarget;
in vec2 aOrigin;
in vec2 aSide;
in float aSeed;
in float aSize;
in float aMotion;
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
  float gather = smoothstep(0.0, 1.0, uGather);
  // Stagger each particle just enough to make the breakup and reassembly organic.
  float drift = smoothstep(0.0, 1.0, uDrift + (aSeed - 0.5) * 0.18);
  float spread = smoothstep(0.0, 1.0, uSpread + (aSeed - 0.5) * 0.22);
  vec2 logoPosition = aTarget * uScale;
  // Each flow target is ALSO a real point inside the supplied logo.
  // About 56% of particles travel clearly between two points; the rest
  // hold the edges, keeping the symbol and wordmark recognizable.
  float loop = .5 + .5 * sin(uTime * (1.9 + aSeed * .85) + aSeed * 6.283185);
  loop = smoothstep(0.0, 1.0, loop);
  vec2 flowing = mix(logoPosition, aFlowTarget * uScale, loop * aMotion);

  // Gentle coordinated waves bring every particle to life. The moving
  // flow layer is much more noticeable than the earlier tiny shimmer.
  float wave = logoPosition.y * 15.0 + logoPosition.x * 6.0 - uTime * 1.65;
  vec2 current = vec2(
    sin(logoPosition.y * 13.0 - uTime * 1.55 + sin(wave) * .38),
    cos(logoPosition.x * 12.0 + uTime * 1.25 + cos(wave) * .30)
  ) * (uScale * .014);
  float orbitPhase = uTime * (1.25 + aSeed * .5) + aSeed * 31.416;
  vec2 orbit = vec2(cos(orbitPhase), sin(orbitPhase)) *
               (uScale * (.004 + aSeed * .008));
  vec2 aliveLogo = flowing + current + orbit;
  vec2 roaming = aOrigin + vec2(sin(uTime * .25 + aSeed * 31.0),
                                cos(uTime * .3 + aSeed * 17.0)) * .052;
  vec2 assembled = mix(roaming, aliveLogo, gather);
  vec2 peeling = mix(assembled, aliveLogo * vec2(.65, .94), drift);
  vec2 edges = vec2(aSide.x + sin(uTime * .26 + aSeed * 11.0) * .017,
                    aSide.y + sin(uTime * .42 + aSeed * 22.0) * .064);
  vec2 position = mix(peeling, edges, drift * spread);
  position += uMouse * .014 * (1.0 - spread);
  gl_Position = vec4(position, 0.0, 1.0);
  // A traveling highlight and individual twinkles give the logo an
  // unmistakably living texture without changing its overall silhouette.
  float lightBand = pow(
    max(0.0, sin(logoPosition.x * 13.0 + logoPosition.y * 6.0 - uTime * 1.6)),
    12.0
  );
  float twinkle = pow(max(0.0, sin(uTime * (1.4 + aSeed) + aSeed * 127.0)), 18.0);
  float activeGlow = (lightBand * .75 + twinkle * .64) * gather;
  // Moving dots are visibly more luminous than the anchored silhouette.
  float movingGlow = aMotion * (.22 + .55 *
      pow(max(0.0, sin(uTime * 2.8 + aSeed * 43.0)), 9.0));
  vSpark = activeGlow + movingGlow * gather;
  vMoving = aMotion * gather;
  gl_PointSize = aSize * uDpr * mix(1.08, 1.25, spread) *
                 (1.0 + activeGlow * .32 + aMotion * .18);
  vAlpha = mix(.88, .94, spread) * (.76 + .24 * sin(aSeed * 99.0 + uTime * .8));
  vTone = aSeed;
  vSpread = spread;
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
  float d = length(gl_PointCoord - vec2(.5));
  float halo = 1.0 - smoothstep(.10, .5, d);
  float core = 1.0 - smoothstep(.04, .19, d);
  if (halo < .015) discard;
  vec3 color = mix(vec3(.18,.52,1.0),vec3(.81,.95,1.0),vTone);
  color = mix(color, vec3(.42,.72,1.0),vSpread * .12);
  color = mix(color, vec3(.94,.98,1.0), min(1.0, vSpark * .72 + vMoving * .17));
  float opacity = min(1.0, halo * .68 + core * .62 + vSpark * .27 + vMoving * .08) * vAlpha;
  outColor = vec4(color, opacity);
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
    const count = window.innerWidth < 650 ? 16000 : 30000;
    const data = {
      aTarget: new Float32Array(count*2),
      aFlowTarget: new Float32Array(count*2),
      aOrigin: new Float32Array(count*2),
      aSide: new Float32Array(count*2),
      aSeed: new Float32Array(count),
      aSize: new Float32Array(count),
      aMotion: new Float32Array(count)
    };
    const rand = Math.random;
    // Validate intermediate positions so a moving particle never cuts
    // across the background between separate logo strokes or letters.
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskCanvas.height = 600;
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently:true });
    const logoImage = new Image();
    logoImage.src = './assets/asro-logo.svg';
    await logoImage.decode();
    maskCtx.drawImage(logoImage, 0, 0, 600, 600);
    const alpha = maskCtx.getImageData(0, 0, 600, 600).data;
    const inside = (x,y) => {
      x=Math.round(x);y=Math.round(y);
      return x>=0 && x<600 && y>=0 && y<600 && alpha[(y*600+x)*4+3]>170;
    };
    const chooseFlow = (x,y) => {
      for(let attempt=0;attempt<25;attempt++) {
        const angle=rand()*Math.PI*2, dist=19+rand()*65;
        const tx=x+Math.cos(angle)*dist, ty=y+Math.sin(angle)*dist;
        if(inside(tx,ty) &&
           inside(x+(tx-x)*.2,y+(ty-y)*.2) &&
           inside(x+(tx-x)*.4,y+(ty-y)*.4) &&
           inside(x+(tx-x)*.6,y+(ty-y)*.6) &&
           inside(x+(tx-x)*.8,y+(ty-y)*.8)) return [tx,ty];
      }
      return null;
    };
    for (let i=0;i<count;i++) {
      const [x,y] = mask[Math.floor(rand()*mask.length)];
      const seed = rand(), angle = rand()*Math.PI*2;
      const radius = .32 + Math.sqrt(rand())*1.2;
      data.aTarget[2*i] = (x-293)/196 + (rand()-.5)*.008;
      data.aTarget[2*i+1] = (300-y)/196 + (rand()-.5)*.008;
      // 56% are traveling particles; the remainder preserve the edges.
      const other = rand()<.56 ? chooseFlow(x,y) : null;
      data.aFlowTarget[2*i] = other ? (other[0]-293)/196 : data.aTarget[2*i];
      data.aFlowTarget[2*i+1] = other ? (300-other[1])/196 : data.aTarget[2*i+1];
      data.aMotion[i] = other ? .82+rand()*.18 : 0;
      data.aOrigin[2*i] = Math.cos(angle)*radius*1.25;
      data.aOrigin[2*i+1] = Math.sin(angle)*radius;
      const side = (rand()<.5 ? -1 : 1);
      data.aSide[2*i] = side * (.72 + rand()*.28);
      data.aSide[2*i+1] = (rand()*2-1)*.92;
      data.aSeed[i] = seed;
      data.aSize[i] = 1.35 + rand()*2.0 + (rand()>.965?1.5:0);
    }
    gl.useProgram(program);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    for (const [name,values] of Object.entries(data)) {
      const buffer=gl.createBuffer(), location=gl.getAttribLocation(program,name);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, ['aSeed','aSize','aMotion'].includes(name)?1:2,gl.FLOAT,false,0,0);
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
