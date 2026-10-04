(function () {
  var root = document.documentElement;
  var qs = new URLSearchParams(location.search);
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } } };

  function noTransitions(fn) {
    var s = document.createElement('style');
    s.textContent = '*,*::before,*::after{transition:none !important}';
    document.head.appendChild(s);
    fn();
    void document.body.offsetHeight;
    requestAnimationFrame(function () { s.remove(); });
  }
  function setTheme(t) {
    noTransitions(function () { root.setAttribute('data-theme', t); });
    document.querySelectorAll('[data-theme-btn]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.themeBtn === t)); });
    store.set('fd-board-theme', t);
  }
  function setRT(on) {
    noTransitions(function () { if (on) root.setAttribute('data-transparency', 'reduce'); else root.removeAttribute('data-transparency'); });
    var el = document.getElementById('rt-toggle');
    if (el) el.setAttribute('aria-checked', String(on));
  }
  document.querySelectorAll('[data-theme-btn]').forEach(function (b) { b.addEventListener('click', function () { setTheme(b.dataset.themeBtn); }); });
  var rt = document.getElementById('rt-toggle');
  if (rt) rt.addEventListener('click', function () { setRT(rt.getAttribute('aria-checked') !== 'true'); });
  var initial = qs.get('theme') || store.get('fd-board-theme') || 'dark';
  setTheme(initial === 'light' ? 'light' : 'dark');
  if (qs.get('rt') === '1') setRT(true);
  if (qs.get('full')) root.classList.add('shot-full'); /* full-page screenshot mode: aurora tiles down the page */
  if (qs.get('y')) { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, Number(qs.get('y'))); }

  /* pointer-tracking sheen on interactive glass */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) {
    document.addEventListener('pointermove', function (e) {
      var g = e.target.closest && e.target.closest('.fd-glass[data-interactive]');
      if (!g) return;
      var r = g.getBoundingClientRect();
      g.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      g.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* tab bar demo */
  document.querySelectorAll('.tabbar').forEach(function (bar) {
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      bar.querySelectorAll('button').forEach(function (x) { x.removeAttribute('aria-current'); });
      b.setAttribute('aria-current', 'page');
    });
  });

  /* spring demo */
  var SPRINGS = /*SPRINGS*/;
  document.querySelectorAll('.spring').forEach(function (card) {
    card.addEventListener('click', function () {
      var s = SPRINGS[card.dataset.spring];
      var ball = card.querySelector('.ball');
      var track = card.querySelector('.track');
      var dist = track.clientWidth - ball.offsetWidth - 10;
      var on = card.classList.contains('play');
      ball.style.transition = 'transform ' + (reduce ? 1 : s.durationMs) + 'ms ' + (reduce ? 'linear' : s.easing);
      ball.style.setProperty('--run', dist + 'px');
      card.classList.toggle('play', !on);
    });
  });
})();
