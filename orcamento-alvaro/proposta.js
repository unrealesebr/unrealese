/* ═══════════════════════════════════════════════════════════════════
   UNREALESE — Proposta / Verti Gestão de Obras
   Script local da página. Não toca em nada do site principal.

   Duas coisas: revelar as peças conforme cruzam a dobra e fazer os
   números contarem até o valor quando a peça deles aparece.

   O valor final já está escrito no HTML. O script só o substitui
   enquanto anima e o devolve no fim — assim, sem JS, em navegador
   antigo ou com o usuário pedindo menos movimento, a página mostra os
   números corretos de saída.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var calm = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
  var temIO = "IntersectionObserver" in window;

  /* ── Contagem ────────────────────────────────────────────────────── */

  var fmt = {};
  function formata(v, dec) {
    if (!fmt[dec]) {
      fmt[dec] = new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec
      });
    }
    return fmt[dec].format(v);
  }

  function conta(el) {
    if (el.dataset.contou) return;
    el.dataset.contou = "1";

    var alvo = parseFloat(el.dataset.to);
    var dec  = parseInt(el.dataset.dec || "0", 10);
    if (isNaN(alvo)) return;

    /* Quanto maior o número, mais tempo ele merece: 2.499,90 contando
       no mesmo tempo que "4" passaria batido. */
    var dur = alvo >= 1000 ? 1500 : (alvo >= 50 ? 1100 : 850);
    var t0  = null;

    function passo(now) {
      if (t0 === null) t0 = now;
      var p = Math.min((now - t0) / dur, 1);
      /* easeOutExpo: arranca rápido e assenta devagar no valor final */
      var e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = formata(alvo * e, dec);
      if (p < 1) requestAnimationFrame(passo);
      else el.textContent = formata(alvo, dec);
    }
    requestAnimationFrame(passo);
  }

  /* ── Entrada das peças ───────────────────────────────────────────── */

  var pecas = document.querySelectorAll(".reveal");
  var nums  = document.querySelectorAll(".num");

  if (calm || !temIO) {
    for (var i = 0; i < pecas.length; i++) pecas[i].classList.add("is-in");
    return;   /* os números ficam com o valor que já está no HTML */
  }

  document.body.classList.add("has-reveal");

  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].isIntersecting) continue;
      var alvo = entries[i].target;
      alvo.classList.add("is-in");

      /* Os números esperam a peça assentar antes de começar a correr */
      var dentro = alvo.querySelectorAll(".num");
      if (dentro.length) {
        (function (lista) {
          setTimeout(function () {
            for (var k = 0; k < lista.length; k++) conta(lista[k]);
          }, 260);
        })(dentro);
      }

      io.unobserve(alvo);   // entra uma vez só
    }
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });

  for (var j = 0; j < pecas.length; j++) io.observe(pecas[j]);

  /* Rede de segurança: um número que não esteja dentro de uma .reveal
     nunca receberia a chamada acima. */
  var solto = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].isIntersecting) continue;
      conta(entries[i].target);
      solto.unobserve(entries[i].target);
    }
  }, { threshold: 0.3 });

  for (var n = 0; n < nums.length; n++) {
    if (!nums[n].closest(".reveal")) solto.observe(nums[n]);
  }
})();
