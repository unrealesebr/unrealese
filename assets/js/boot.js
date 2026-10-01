/* ═══════════════════════════════════════════════════════════════════
   UNREALESE — Abertura e trilha

   Sobre o áudio, duas decisões que valem explicação:

   1) A cortina abre sozinha e a trilha tenta subir no mesmo instante.
      Navegadores só liberam áudio após um gesto do visitante, então
      esse start automático passa para quem já ouviu o som deste site
      antes. Se o navegador recusar, a trilha fica armada e entra no
      primeiro toque em qualquer lugar da página, sem pedir nada.

   2) A trilha toca por Web Audio, não pelo <audio>. MP3 carrega atraso
      e preenchimento do codificador nas pontas, então <audio loop>
      sempre deixa uma falha audível na emenda. Decodificado em buffer,
      o loop é perfeito — e o trecho foi cortado em 32 compassos
      exatos a 126 BPM justamente para a volta cair no tempo.
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  /* ── Ajustes rápidos ────────────────────────────────────────────── */
  const INTRO_EVERY_LOAD = true;   // false → abertura só 1× por sessão
  const INTRO_MS         = 1850;   // duração da cortina antes de abrir
  const VOLUME           = 0.16;   // trilha "baixa"
  const TRACK            = 'assets/audio/hero.mp3';
  const LOOP_HEAD        = 0.026;  // pula o atraso do codificador MP3

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const store = {
    get(k){ try { return localStorage.getItem(k); } catch { return null; } },
    set(k,v){ try { localStorage.setItem(k,v); } catch {} },
    ses(k){ try { return sessionStorage.getItem(k); } catch { return null; } },
    sesSet(k,v){ try { sessionStorage.setItem(k,v); } catch {} },
  };

  /* ═══ Trilha ═════════════════════════════════════════════════════ */

  const KEY = 'unrealese:sound';
  const btn = document.getElementById('soundToggle');

  const track = {
    ctx: null, buf: null, src: null, gain: null,
    pending: null, failed: false, on: false, inHero: true,

    async prepare(){
      if (this.buf || this.failed) return !this.failed;
      if (!this.pending){
        this.pending = (async () => {
          const Ctor = window.AudioContext || window.webkitAudioContext;
          if (!Ctor) throw new Error('sem Web Audio');
          this.ctx = this.ctx || new Ctor();
          const res = await fetch(TRACK);
          if (!res.ok) throw new Error('trilha ausente');
          const bytes = await res.arrayBuffer();
          this.buf = await this.ctx.decodeAudioData(bytes);
        })().catch(err => { this.failed = true; hideToggle(); throw err; });
      }
      try { await this.pending; return true; } catch { return false; }
    },

    async start(){
      const ok = await this.prepare();
      if (!ok) return false;
      if (this.ctx.state === 'suspended'){
        try { await this.ctx.resume(); } catch {}
      }
      if (this.ctx.state !== 'running') return false;

      this.stopNode();
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.connect(this.ctx.destination);

      const s = this.ctx.createBufferSource();
      s.buffer   = this.buf;
      s.loop     = true;
      s.loopStart = LOOP_HEAD;                 /* corta o silêncio inicial */
      s.loopEnd   = this.buf.duration;
      s.connect(g);
      s.start(0, LOOP_HEAD);

      this.src = s; this.gain = g; this.on = true;
      this.ramp(VOLUME, 1.6);
      reflect(true);
      return true;
    },

    ramp(to, secs){
      if (!this.gain) return;
      const now = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(this.gain.gain.value, now);
      this.gain.gain.linearRampToValueAtTime(to, now + secs);
    },

    stopNode(){
      if (!this.src) return;
      try { this.src.stop(); } catch {}
      try { this.src.disconnect(); } catch {}
      this.src = null;
    },

    stop(){
      this.on = false;
      reflect(false);
      if (!this.gain) return;
      this.ramp(0, 0.6);
      const node = this.src, g = this.gain;
      this.src = null; this.gain = null;
      setTimeout(() => {
        try { node && node.stop(); } catch {}
        try { g && g.disconnect(); } catch {}
      }, 700);
    },

    /* Pausa sem perder o ponto da música */
    suspend(){ if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); },
    resume(){ if (this.on && this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  };

  function reflect(on){
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Desativar som' : 'Ativar som');
  }
  function hideToggle(){ if (btn) btn.hidden = true; }

  if (btn){
    btn.hidden = false;
    reflect(false);
    btn.addEventListener('click', async () => {
      if (track.on){ store.set(KEY, 'off'); track.stop(); }
      else { store.set(KEY, 'on'); await track.start(); }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) track.suspend(); else track.resume();
  });

  /* "Enquanto estiver na hero": fora dela, a trilha silencia */
  const hero = document.getElementById('hero');
  if (hero && 'IntersectionObserver' in window){
    new IntersectionObserver(([e]) => {
      track.inHero = e.isIntersecting;
      if (!track.on) return;
      if (track.inHero) track.resume(); else track.suspend();
    }, { threshold: 0 }).observe(hero);
  }

  /* ═══ Abertura ═══════════════════════════════════════════════════ */

  const intro = document.getElementById('intro');
  const body  = document.body;
  let done = false;

  /* Tenta subir a trilha sozinha. Navegadores só liberam áudio depois
     de algum gesto do visitante, mas há dois casos em que o start
     automático passa: quem já ouviu o som deste site antes (o Chrome
     guarda esse histórico) e quem já clicou em algo nesta aba. Quando
     o navegador recusa, a trilha fica armada e entra sozinha no
     primeiro toque em qualquer lugar — sem pedir nada a ninguém. */
  async function autoStart(){
    if (store.get(KEY) === 'off') return;

    if (await track.start()){ store.set(KEY, 'on'); return; }

    const kick = async () => {
      if (store.get(KEY) === 'off') return detach();
      if (await track.start()){ store.set(KEY, 'on'); detach(); }
    };
    function detach(){
      document.removeEventListener('pointerdown', kick);
      document.removeEventListener('keydown', kick);
      document.removeEventListener('touchstart', kick);
    }
    document.addEventListener('pointerdown', kick);
    document.addEventListener('keydown', kick);
    document.addEventListener('touchstart', kick, { passive: true });
  }

  function reveal(){
    if (done) return;
    done = true;

    body.classList.remove('is-intro');       // solta as animações da hero
    autoStart();                             // trilha entra com a página
    if (!intro) return;

    intro.classList.add('is-out');
    const finish = e => {
      if (e && e.target !== intro) return;
      intro.classList.add('is-done');
      intro.removeEventListener('transitionend', finish);
      clearTimeout(t);
    };
    intro.addEventListener('transitionend', finish);
    const t = setTimeout(finish, 1100);
  }

  function skip(){
    body.classList.remove('is-intro');
    intro?.classList.add('is-done');
    done = true;
  }

  const seen = store.ses('unrealese:intro') === '1';

  if (!intro || reduced.matches || (!INTRO_EVERY_LOAD && seen)){
    skip();
    autoStart();
  } else {
    store.sesSet('unrealese:intro', '1');

    /* A marca só começa a se montar com as imagens já decodificadas */
    const imgs = Array.from(intro.querySelectorAll('img'));
    const ready = Promise.all(imgs.map(img =>
      img.complete && img.naturalWidth
        ? Promise.resolve()
        : new Promise(res => {
            img.addEventListener('load', res, { once: true });
            img.addEventListener('error', res, { once: true });
          })
    ));
    const guard = new Promise(res => setTimeout(res, 1600));

    Promise.race([ready, guard]).then(() => {
      intro.classList.add('is-ready');
      /* Baixa e decodifica a trilha enquanto a marca se monta, para
         ela já estar pronta no instante em que a cortina sobe */
      track.prepare();
      setTimeout(reveal, INTRO_MS);
    });

    /* Quem não quer esperar, pula */
    intro.addEventListener('click', reveal);
    document.addEventListener('keydown', reveal, { once: true });
  }
})();
