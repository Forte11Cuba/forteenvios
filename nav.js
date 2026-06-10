(() => {
  'use strict';

  const burger = document.getElementById('navBurger');
  const nav = document.getElementById('siteNav');
  if (!burger || !nav) return;

  function setOpen(open) {
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  }

  burger.addEventListener('click', () => setOpen(!nav.classList.contains('open')));

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setOpen(false));
  });

  document.addEventListener('click', (e) => {
    if (nav.classList.contains('open') && !nav.contains(e.target) && !burger.contains(e.target)) {
      setOpen(false);
    }
  });
})();
