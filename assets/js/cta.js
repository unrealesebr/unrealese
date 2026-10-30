/* ═══════════════════════════════════════════════════════════════════
   UNREALESE — CTA de vidro
   Só isto: ler onde o cursor está sobre o botão e publicar em custom
   properties. Quem desenha é o CSS. Nada aqui toca a fotografia.
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const cta  = document.querySelector('.cta');
  const aura = document.querySelector('.cta__aura');
  if (!cta) return;

  const fine    = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  /* Sem cursor fino não há o que seguir; com movimento reduzido o
     visitante já pediu para nada se inclinar. O vidro, o aro e a aura
     continuam — eles são estado de hover, não movimento. */
  if (!fine.matches || reduced.matches) return;

  /* Limites da inclinação, em graus, e do deslocamento, em px */
  const TILT  = 7;
  const SHIFT = 8;

  let raf = 0, pend = null;

  function paint(){
    raf = 0;
    if (!pend) return;
    const { x, y, w, h } = pend;

    /* −1..1 a partir do centro */
    const nx = (x / w) * 2 - 1;
    const ny = (y / h) * 2 - 1;

    cta.style.setProperty('--x',  x + 'px');
    cta.style.setProperty('--y',  y + 'px');
    cta.style.setProperty('--ry', ( nx * TILT).toFixed(2) + 'deg');
    cta.style.setProperty('--rx', (-ny * TILT).toFixed(2) + 'deg');
    cta.style.setProperty('--tx', (nx * SHIFT).toFixed(1) + 'px');
    cta.style.setProperty('--ty', (ny * SHIFT).toFixed(1) + 'px');

    if (aura){
      /* A aura anda mais que o botão e incha quando o cursor se
         aproxima do centro — é o que dá a leitura de luz, e não de
         sombra colada atrás. */
      const dist = Math.hypot(nx, ny);
      aura.style.setProperty('--ax', (nx * SHIFT * 2.2).toFixed(1) + 'px');
      aura.style.setProperty('--ay', (ny * SHIFT * 2.2).toFixed(1) + 'px');
      aura.style.setProperty('--as', (1.45 - dist * 0.3).toFixed(3));
    }
  }

  function onMove(e){
    const r = cta.getBoundingClientRect();
    pend = { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    if (!raf) raf = requestAnimationFrame(paint);
  }

  /* O aro também entra por classe, e não só por :hover do CSS: assim
     ele acende exatamente junto da aura, no mesmo evento. */
  function onEnter(){
    cta.classList.add('is-live');
    aura?.classList.add('is-on');
  }

  function onLeave(){
    pend = null;
    if (raf){ cancelAnimationFrame(raf); raf = 0; }
    for (const p of ['--rx','--ry','--tx','--ty']) cta.style.removeProperty(p);
    cta.style.setProperty('--x', '50%');
    cta.style.setProperty('--y', '50%');
    cta.classList.remove('is-live');
    if (aura){
      aura.classList.remove('is-on');
      for (const p of ['--ax','--ay','--as']) aura.style.removeProperty(p);
    }
  }

  cta.addEventListener('pointerenter', onEnter,  { passive: true });
  cta.addEventListener('pointermove',  onMove,   { passive: true });
  cta.addEventListener('pointerleave', onLeave,  { passive: true });
  window.addEventListener('blur', onLeave);
})();
