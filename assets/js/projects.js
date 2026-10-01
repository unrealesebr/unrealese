/* ═══════════════════════════════════════════════════════════════════
   UNREALESE — Painel de projetos
   Abre pelo roda-teto, sobrepõe a hero sem alterá-la.
   As imagens só são baixadas na primeira abertura, então o painel
   não pesa nada no carregamento inicial.
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const sheet  = document.getElementById('projects');
  const opener = document.getElementById('openProjects');
  if (!sheet || !opener) return;

  const panel = sheet.querySelector('.sheet__panel');
  const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';

  let loaded = false;
  let lastFocus = null;

  /* ── Carrega as imagens uma única vez ───────────────────────────── */
  function loadImages(){
    if (loaded) return;
    loaded = true;
    sheet.querySelectorAll('img[data-src]').forEach(img => {
      img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
      if (img.dataset.srcset) img.srcset = img.dataset.srcset;
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
      img.removeAttribute('data-srcset');
      /* Já em cache: o evento load não dispara de novo */
      if (img.complete && img.naturalWidth) img.classList.add('is-loaded');
    });
  }

  /* ── Abrir / fechar ─────────────────────────────────────────────── */

  function open(){
    lastFocus = document.activeElement;
    loadImages();

    sheet.hidden = false;
    document.body.classList.add('is-locked');
    /* fora da árvore de acessibilidade enquanto o painel está aberto */
    document.getElementById('hero')?.setAttribute('aria-hidden', 'true');
    document.getElementById('topbar')?.setAttribute('aria-hidden', 'true');

    /* Força o recálculo depois de sair do display:none — sem isso o
       navegador pode pular a transição de entrada. */
    void panel.offsetHeight;
    sheet.classList.add('is-open');

    const first = panel.querySelector(FOCUSABLE);
    (first || panel).focus({ preventScroll: true });

    document.addEventListener('keydown', onKey);
  }

  function close(){
    sheet.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('is-locked');
    document.getElementById('hero')?.removeAttribute('aria-hidden');
    document.getElementById('topbar')?.removeAttribute('aria-hidden');

    /* transitionend borbulha: só o do próprio painel encerra a saída,
       senão a transição de um filho cortaria a animação pela metade. */
    const done = e => {
      if (e && e.target !== panel) return;
      sheet.hidden = true;
      panel.removeEventListener('transitionend', done);
      clearTimeout(timer);
    };
    panel.addEventListener('transitionend', done);
    /* Rede de segurança: nunca fica preso se a transição não ocorrer */
    const timer = setTimeout(done, 650);

    if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
  }

  /* ── Teclado: Esc fecha, Tab circula dentro do painel ───────────── */
  function onKey(e){
    if (e.key === 'Escape'){ e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;

    const items = Array.from(panel.querySelectorAll(FOCUSABLE))
      .filter(el => el.offsetParent !== null);
    if (!items.length) return;

    const first = items[0];
    const last  = items[items.length - 1];

    if (e.shiftKey && document.activeElement === first){
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last){
      e.preventDefault(); first.focus();
    }
  }

  /* ── Ligações ───────────────────────────────────────────────────── */

  opener.addEventListener('click', open);

  sheet.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) close();
  });

  /* O painel precisa poder receber foco quando não há nada focável */
  panel.tabIndex = -1;
})();
