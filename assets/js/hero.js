/* ═══════════════════════════════════════════════════════════════════
   UNREALESE — Hero
   1. Fundo WebGL: a própria arte da marca, com distorção/glow no cursor
   2. Parallax dos cartões flutuantes
   Degrada para a imagem estática se WebGL falhar ou movimento for
   reduzido. Tudo pausa fora da viewport / com a aba oculta.
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const hero   = document.getElementById('hero');
  const canvas = document.getElementById('bgCanvas');
  const image  = document.getElementById('bgImage');
  if (!hero) return;

  const reduced   = matchMedia('(prefers-reduced-motion: reduce)');
  const finePoint = matchMedia('(hover: hover) and (pointer: fine)');

  /* Sem cursor fino (celular/tablet) a arte se move sozinha: não há
     ponteiro para acionar a lente, então o liquid roda em loop. */
  const ambient = !finePoint.matches;

  /* Cursor normalizado (-1..1) e sua versão suavizada */
  const target = { x: 0, y: 0, p: 0 };   // p = presença do cursor
  const eased  = { x: 0, y: 0, p: 0 };

  /* ─────────────────────────────────────────────────────────────────
     Shaders
     ───────────────────────────────────────────────────────────────── */

  const VERT = `
    attribute vec2 aPos;
    void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  const FRAG = `
    precision mediump float;

    uniform sampler2D uTex;
    uniform vec2  uRes;      // tamanho do canvas em px
    uniform vec2  uTexRes;   // tamanho da textura em px
    uniform vec2  uMouse;    // -1..1, suavizado
    uniform float uTime;
    uniform float uHover;    // 0..1
    uniform float uAmbient;  // 1 no mobile: a seda se move sozinha

    /* Cores da marca UNREALESE */
    const vec3 BRAND_A = vec3(0.557, 0.204, 0.620);  // #8E349E
    const vec3 BRAND_B = vec3(0.894, 0.188, 0.188);  // #E43030

    /* Enquadramento "cover" — preserva a composição original da arte */
    vec2 coverUV(vec2 frag){
      float scale = max(uRes.x / uTexRes.x, uRes.y / uTexRes.y);
      vec2  size  = uTexRes * scale;
      return (frag - (uRes - size) * 0.5) / size;
    }

    void main(){
      vec2 frag = gl_FragCoord.xy;
      vec2 uv   = coverUV(frag);
      uv.y      = 1.0 - uv.y;

      /* Espaço radial com correção de proporção */
      vec2  asp  = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
      vec2  p    = (frag / uRes * 2.0 - 1.0) * asp;
      vec2  d    = p - uMouse * asp;
      float dist = length(d);
      vec2  dir  = d / max(dist, 1e-4);

      /* Lente suave sob o cursor — queda rápida para o efeito ficar local */
      float lens = exp(-dist * dist * 3.2) * uHover;

      /* Respiração contínua da seda — existe mesmo sem o mouse */
      float t = uTime * 0.075;
      vec2  flow = vec2(
        sin(uv.y * 5.2 + t * 1.7) + sin(uv.x * 3.1 - t * 1.1),
        sin(uv.x * 4.4 - t * 1.4) + sin(uv.y * 2.6 + t * 0.9)
      ) * 0.0022;

      /* Base do liquid no mobile (uAmbient = 1). Discreto de propósito:
         o grosso do movimento é a lente, que agora anda sozinha (ver
         "ambient" no frame()). Isto só impede que o resto da arte fique
         parado enquanto a lente passeia. */
      float at = uTime * 0.11;
      vec2  q  = vec2(
        sin(uv.x * 3.0 + at * 0.80) + sin(uv.y * 2.3 - at * 0.60),
        sin(uv.y * 2.7 - at * 0.70) + sin(uv.x * 3.4 + at * 0.50)
      );
      vec2 liquid = vec2(
        sin(uv.y * 4.1 + q.x * 1.6 + at * 0.90),
        sin(uv.x * 3.6 + q.y * 1.4 - at * 0.75)
      ) * 0.008 * uAmbient;

      /* Deslocamento: a arte é empurrada para longe do cursor */
      vec2 warp = dir * lens * 0.019;
      vec2 suv  = uv + flow + liquid - warp;

      /* Dispersão cromática proporcional à lente */
      float ca = lens * 0.0034;
      vec3 col = vec3(
        texture2D(uTex, suv + dir * ca).r,
        texture2D(uTex, suv).g,
        texture2D(uTex, suv - dir * ca).b
      );

      /* Glow: realça o que já é luminoso e tinge com o gradiente da marca */
      float lum   = dot(col, vec3(0.299, 0.587, 0.114));
      vec3  brand = mix(BRAND_A, BRAND_B, clamp(uv.x * 0.7 + 0.15, 0.0, 1.0));
      col += brand * lens * (0.045 + lum * 0.40);
      col *= 1.0 + lens * 0.13;

      /* Vinheta discreta — leve o bastante para não apagar o gradiente da base */
      col *= 1.0 - 0.09 * dot(p * 0.42, p * 0.42);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  /* ─────────────────────────────────────────────────────────────────
     WebGL
     ───────────────────────────────────────────────────────────────── */

  let gl = null, uni = null, texture = null;
  let running = false, visible = true, inView = true, rafId = 0;
  let elapsed = 0, prevStamp = 0, lastFrame = 0;

  function compile(type, src){
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
    return sh;
  }

  function initGL(){
    if (!canvas || !image) return false;

    const opts = { alpha: false, antialias: false, depth: false, stencil: false,
                   premultipliedAlpha: false, powerPreference: 'low-power',
                   preserveDrawingBuffer: false };
    gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) return false;

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);

    /* Triângulo de tela cheia (mais barato que um quad) */
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    /* Textura = a própria arte de fundo da UNREALESE */
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    uni = {
      res:    gl.getUniformLocation(prog, 'uRes'),
      texRes: gl.getUniformLocation(prog, 'uTexRes'),
      mouse:  gl.getUniformLocation(prog, 'uMouse'),
      time:   gl.getUniformLocation(prog, 'uTime'),
      hover:   gl.getUniformLocation(prog, 'uHover'),
      ambient: gl.getUniformLocation(prog, 'uAmbient'),
    };
    gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
    gl.uniform1f(uni.ambient, ambient ? 1.0 : 0.0);

    if (!upload()) return false;

    resize();
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    return true;
  }

  /* Envia (ou reenvia) a arte para a GPU — <picture> troca a fonte
     quando o viewport passa de paisagem para retrato */
  function upload(){
    if (!gl || !image.naturalWidth) return false;
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    } catch (e) {
      /* file:// deixa a imagem "tainted" — mantém o fundo estático */
      return false;
    }
    if (gl.getError() !== gl.NO_ERROR) return false;
    gl.uniform2f(uni.texRes, image.naturalWidth, image.naturalHeight);
    return true;
  }

  function onContextLost(e){
    e.preventDefault();
    stop();
    hero.classList.remove('is-gl');
  }

  /* Resolução adaptativa: nunca acima de 1.5× nem de ~2.6 Mpx */
  function resize(){
    if (!gl) return;
    const cssW = canvas.clientWidth  || hero.clientWidth;
    const cssH = canvas.clientHeight || hero.clientHeight;
    if (!cssW || !cssH) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cap = 2.6e6;
    if (cssW * cssH * dpr * dpr > cap) dpr = Math.sqrt(cap / (cssW * cssH));

    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width === w && canvas.height === h) return;

    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uni.res, w, h);
  }

  function frame(now){
    rafId = requestAnimationFrame(frame);

    /* Teto de ~60fps: evita trabalho dobrado em telas 120Hz+ */
    if (now - lastFrame < 15.5) return;

    /* Tempo acumulado: pausar e retomar não produz salto na animação */
    elapsed += Math.min(now - (prevStamp || now), 50);
    prevStamp = now;
    lastFrame = now;

    if (ambient){
      /* Mobile: sem dedo na tela, um cursor imaginário percorre a arte.
         É a MESMA lente do hover do desktop — deformação, aberração
         cromática e glow da marca — só que conduzida pelo relógio.
         Lissajous com frequências incomensuráveis (0.37 / 0.29): o
         caminho não fecha em ciclo curto, então não se lê como loop. */
      const t = elapsed * 0.001;
      eased.x = Math.sin(t * 0.37) * 0.72;
      eased.y = Math.sin(t * 0.29 + 1.1) * 0.62;
      eased.p += (1 - eased.p) * 0.02;   // acende suave ao carregar
    } else {
      eased.x += (target.x - eased.x) * 0.055;
      eased.y += (target.y - eased.y) * 0.055;
      eased.p += (target.p - eased.p) * 0.05;
    }

    gl.uniform2f(uni.mouse, eased.x, -eased.y);
    gl.uniform1f(uni.hover, eased.p);
    gl.uniform1f(uni.time, elapsed * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function start(){
    if (running || !gl) return;
    running = true;
    prevStamp = 0;
    lastFrame = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop(){
    running = false;
    cancelAnimationFrame(rafId);
  }

  function sync(){
    if (visible && inView) start(); else stop();
  }

  /* ─────────────────────────────────────────────────────────────────
     Variáveis CSS do parallax (fundo e bloco de conteúdo)
     ───────────────────────────────────────────────────────────────── */

  const pDom = { x: 0, y: 0 };
  let domRaf = 0;

  function paintDOM(){
    domRaf = 0;
    pDom.x += (target.x - pDom.x) * 0.075;
    pDom.y += (target.y - pDom.y) * 0.075;

    hero.style.setProperty('--mx', pDom.x.toFixed(4));
    hero.style.setProperty('--my', pDom.y.toFixed(4));

    /* Continua amortecendo até parar de fato */
    if (Math.abs(target.x - pDom.x) > 0.001 || Math.abs(target.y - pDom.y) > 0.001) {
      domRaf = requestAnimationFrame(paintDOM);
    }
  }

  function queueDOM(){
    if (!domRaf) domRaf = requestAnimationFrame(paintDOM);
  }

  /* ─────────────────────────────────────────────────────────────────
     Eventos
     ───────────────────────────────────────────────────────────────── */

  function onPointerMove(e){
    const r = hero.getBoundingClientRect();
    target.x = ((e.clientX - r.left) / r.width)  * 2 - 1;
    target.y = ((e.clientY - r.top)  / r.height) * 2 - 1;
    target.p = 1;
    queueDOM();
  }

  function onPointerLeave(){
    target.x = 0; target.y = 0; target.p = 0;
    queueDOM();
  }

  function bindPointer(){
    if (!finePoint.matches || reduced.matches) return;
    hero.addEventListener('pointermove', onPointerMove, { passive: true });
    hero.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('blur', onPointerLeave);
  }

  /* ─────────────────────────────────────────────────────────────────
     Boot
     ───────────────────────────────────────────────────────────────── */

  function boot(){
    bindPointer();

    /* Sem shader quando ele não traria nada:
       — movimento reduzido: preferência explícita do usuário
       — economia de dados / aparelho fraco
       Nesses casos a arte estática da marca permanece no lugar.
       O toque NÃO desiste mais: é justamente onde o liquid é contínuo. */
    const weak = (navigator.hardwareConcurrency || 8) <= 2;
    const save = navigator.connection && navigator.connection.saveData;
    if (reduced.matches || weak || save) return;

    if (!initGL()) return;
    hero.classList.add('is-gl');
    sync();

    /* <picture> troca a arte ao virar o dispositivo → reenvia a textura */
    image.addEventListener('load', () => { if (gl) upload(); });

    let resizeRaf = 0;
    const onResize = () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; resize(); });
    };
    if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(hero);
    else window.addEventListener('resize', onResize, { passive: true });

    document.addEventListener('visibilitychange', () => {
      visible = !document.hidden; sync();
    });

    if ('IntersectionObserver' in window){
      new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting; sync();
      }, { threshold: 0 }).observe(hero);
    }

    reduced.addEventListener?.('change', e => { if (e.matches) { stop(); hero.classList.remove('is-gl'); } });
  }

  /* A textura só pode ser enviada com a imagem já decodificada */
  if (image && !image.complete){
    image.addEventListener('load', boot, { once: true });
    image.addEventListener('error', () => bindPointer(), { once: true });
  } else {
    boot();
  }
})();
