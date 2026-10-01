/* ═══════════════════════════════════════════════════════════════════
   UNREALESE — Proposta / fundo líquido

   Pega a arte já carregada no <img> e a redesenha num canvas WebGL,
   ondulando continuamente. É o mesmo princípio do shader da home, com
   duas diferenças: a amplitude ambiente é bem maior (lá o movimento
   sozinho é discreto de propósito, porque o protagonista é a lente do
   cursor) e a dispersão cromática existe o tempo todo, não só sob o
   ponteiro — é ela que mantém a iridescência viva.

   Progressivo: sem WebGL, sem a imagem decodificada ou com o usuário
   pedindo menos movimento, o canvas nunca aparece e a página fica com
   a animação CSS do <img>, que já funciona sozinha.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var img    = document.querySelector(".bg__img");
  var canvas = document.getElementById("bgCanvas");
  var bg     = document.querySelector(".bg");
  if (!img || !canvas || !bg) return;

  if (matchMedia("(prefers-reduced-motion:reduce)").matches) return;

  /* Enquadramento: precisa bater com o object-position do CSS, senão a
     arte "pula" no instante em que o canvas entra no lugar da imagem.
     Com a arte em 2,37:1 a caixa acompanha a proporção dela, então o
     enquadramento é o centro nos dois eixos. */
  function focusY() { return 0.5; }

  var VERT = [
    "attribute vec2 aPos;",
    "void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }"
  ].join("\n");

  var FRAG = [
    "precision mediump float;",

    "uniform sampler2D uTex;",
    "uniform vec2  uRes;      // canvas em px",
    "uniform vec2  uTexRes;   // textura em px",
    "uniform vec2  uFocus;    // equivalente ao object-position",
    "uniform vec2  uMouse;    // -1..1, suavizado",
    "uniform float uTime;",
    "uniform float uHover;    // 0..1",

    /* Enquadramento "cover", respeitando o foco. gl_FragCoord cresce
       para cima, então o frag é convertido para o eixo da tela antes
       da conta — assim uFocus usa a mesma orientação do CSS. */
    "vec2 coverUV(vec2 frag){",
    "  float scale = max(uRes.x / uTexRes.x, uRes.y / uTexRes.y);",
    "  vec2  size  = uTexRes * scale;",
    "  vec2  top   = vec2(frag.x, uRes.y - frag.y);",
    "  return (top - (uRes - size) * uFocus) / size;",
    "}",

    "void main(){",
    "  vec2 frag = gl_FragCoord.xy;",
    "  vec2 uv   = coverUV(frag);",

    "  vec2  asp  = vec2(uRes.x / max(uRes.y, 1.0), 1.0);",
    "  vec2  p    = (frag / uRes * 2.0 - 1.0) * asp;",
    "  vec2  d    = p - uMouse * asp;",
    "  float dist = length(d);",
    "  vec2  dir  = d / max(dist, 1e-4);",

    /* Lente sob o cursor: queda rápida para o efeito ficar local */
    "  float lens = exp(-dist * dist * 2.6) * uHover;",

    /* Ondulação em duas camadas — a segunda é alimentada pela primeira
       (domain warping). É daí que vem a sensação de tecido, em vez do
       vaivém regular que uma onda só produziria. */
    "  float t = uTime * 0.085;",
    "  vec2  q = vec2(",
    "    sin(uv.x * 2.6 + t * 0.90) + sin(uv.y * 1.9 - t * 0.70),",
    "    sin(uv.y * 2.2 - t * 0.80) + sin(uv.x * 3.0 + t * 0.60)",
    "  );",
    "  vec2  r = vec2(",
    "    sin(uv.y * 3.4 + q.x * 1.75 + t * 1.10),",
    "    sin(uv.x * 3.0 + q.y * 1.55 - t * 0.95)",
    "  );",
    "  vec2  s = vec2(",
    "    sin(uv.x * 1.6 + r.y * 0.9 - t * 0.55),",
    "    cos(uv.y * 1.4 + r.x * 0.8 + t * 0.48)",
    "  );",

    /* Amplitude do movimento sozinho. A da home é 0.008; aqui a arte
       precisa respirar à vista desarmada, sem ninguém mexer o mouse. */
    "  vec2 liquid = (r * 0.019 + s * 0.011);",

    "  vec2 warp = dir * lens * 0.022;",
    "  vec2 suv  = uv + liquid - warp;",

    /* Dispersão contínua: um fio de separação RGB acompanhando a onda,
       reforçado sob o cursor. */
    "  vec2  cdir = normalize(vec2(r.y, -r.x) + 1e-4);",
    "  float ca   = 0.0016 + lens * 0.0034;",
    "  vec3  col  = vec3(",
    "    texture2D(uTex, suv + cdir * ca).r,",
    "    texture2D(uTex, suv).g,",
    "    texture2D(uTex, suv - cdir * ca).b",
    "  );",

    /* A crista da onda acende de leve: dá volume ao movimento */
    "  float crest = 0.5 + 0.5 * sin(uv.y * 3.4 + q.x * 1.75 + t * 1.10);",
    "  float lum   = dot(col, vec3(0.299, 0.587, 0.114));",
    "  col *= 1.0 + crest * lum * 0.16;",
    "  col *= 1.0 + lens * 0.14;",

    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  var gl = null, uni = null, tex = null, raf = 0, started = 0;
  var mouse = { x: 0, y: 0, p: 0 };
  var eased = { x: 0, y: 0, p: 0 };

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
    return sh;
  }

  function init() {
    var opts = { alpha: false, antialias: false, depth: false,
                 stencil: false, powerPreference: "low-power" };
    gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
    if (!gl) return false;

    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    /* Sem mipmap e com CLAMP: a arte não tem lado potência de dois. */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    uni = {
      res:    gl.getUniformLocation(prog, "uRes"),
      texRes: gl.getUniformLocation(prog, "uTexRes"),
      focus:  gl.getUniformLocation(prog, "uFocus"),
      mouse:  gl.getUniformLocation(prog, "uMouse"),
      time:   gl.getUniformLocation(prog, "uTime"),
      hover:  gl.getUniformLocation(prog, "uHover")
    };
    gl.uniform1i(gl.getUniformLocation(prog, "uTex"), 0);

    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault();
      stop();
      bg.classList.remove("is-gl");
    }, false);

    return true;
  }

  function upload() {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return false;

    var max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    var src = img;

    /* GPU modesta: reduz antes de subir, em vez de falhar no upload. */
    if (w > max || h > max) {
      var k = Math.min(max / w, max / h);
      var c = document.createElement("canvas");
      c.width  = Math.max(1, Math.floor(w * k));
      c.height = Math.max(1, Math.floor(h * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      src = c; w = c.width; h = c.height;
    }

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    gl.uniform2f(uni.texRes, w, h);
    return true;
  }

  function resize() {
    var cw = canvas.clientWidth  || bg.clientWidth;
    var ch = canvas.clientHeight || bg.clientHeight;
    if (!cw || !ch) return;

    /* Teto de pixels: a arte cobre a tela inteira e o custo é por
       fragmento, então em telas densas o DPR é limitado. */
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cap = 2.6e6;
    if (cw * ch * dpr * dpr > cap) dpr = Math.sqrt(cap / (cw * ch));

    var w = Math.max(1, Math.round(cw * dpr));
    var h = Math.max(1, Math.round(ch * dpr));
    if (canvas.width === w && canvas.height === h) return;

    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uni.res, w, h);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!started) started = now;

    resize();
    gl.uniform2f(uni.focus, 0.5, focusY());

    /* Suavização do ponteiro: o alvo é perseguido, nunca saltado. */
    eased.x += (mouse.x - eased.x) * 0.055;
    eased.y += (mouse.y - eased.y) * 0.055;
    eased.p += (mouse.p - eased.p) * 0.05;

    gl.uniform2f(uni.mouse, eased.x, -eased.y);
    gl.uniform1f(uni.hover, eased.p);
    gl.uniform1f(uni.time, (now - started) * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function start() { if (!raf) raf = requestAnimationFrame(frame); }
  function stop()  { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  function onMove(e) {
    var r = bg.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width)  * 2 - 1;
    mouse.y = ((e.clientY - r.top)  / r.height) * 2 - 1;
    mouse.p = 1;
  }

  function boot() {
    if (!init() || !upload()) return;

    resize();
    bg.classList.add("is-gl");
    start();

    window.addEventListener("resize", resize, { passive: true });

    if (matchMedia("(hover:hover) and (pointer:fine)").matches) {
      window.addEventListener("pointermove", onMove, { passive: true });
      bg.addEventListener("pointerleave", function () { mouse.p = 0; });
      document.addEventListener("pointerleave", function () { mouse.p = 0; });
    }

    /* Fora da tela ou aba escondida: não há o que desenhar. */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) start(); else stop();
      }, { threshold: 0 }).observe(bg);
    }
  }

  if (img.complete && img.naturalWidth) boot();
  else img.addEventListener("load", boot, { once: true });
})();
