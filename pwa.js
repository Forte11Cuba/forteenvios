(() => {
  'use strict';

  // sw.js vive en la raíz del sitio, junto a este archivo (funciona desde cualquier subcarpeta)
  const base = document.currentScript ? document.currentScript.src : location.href;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(new URL('sw.js', base)).catch(() => {});
    });
  }

  /* ===== Aviso "Instalar app" ===== */
  const DISMISS_KEY = 'forte-install-dismissed';
  const DISMISS_DAYS = 30;
  const SHOW_DELAY_MS = 6000;

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (isStandalone) return;

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function recentlyDismissed() {
    try {
      const t = Number(localStorage.getItem(DISMISS_KEY));
      return t > 0 && (Date.now() - t) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
    } catch (e) {
      return false;
    }
  }

  function rememberDismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
  }

  const iconSrc = new URL('icons/icon-192.png', base).href;

  function showBanner({ text, actionLabel, onAction }) {
    if (recentlyDismissed() || document.getElementById('installBanner')) return;

    const bar = document.createElement('div');
    bar.id = 'installBanner';
    bar.className = 'install-banner';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Instalar Forte Envíos');

    const img = document.createElement('img');
    img.src = iconSrc;
    img.alt = '';
    img.className = 'install-icon';

    const msg = document.createElement('div');
    msg.className = 'install-text';
    const title = document.createElement('strong');
    title.textContent = 'Instala Forte Envíos';
    const sub = document.createElement('span');
    sub.textContent = text;
    msg.append(title, sub);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'install-close';
    close.setAttribute('aria-label', 'Cerrar');
    close.textContent = '×';

    const hide = () => {
      bar.remove();
      document.body.classList.remove('has-install-banner');
    };
    close.addEventListener('click', () => { rememberDismiss(); hide(); });

    bar.append(img, msg);
    if (actionLabel) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'install-action';
      btn.textContent = actionLabel;
      btn.addEventListener('click', async () => {
        hide();
        await onAction();
      });
      bar.append(btn);
    }
    bar.append(close);

    document.body.appendChild(bar);
    document.body.classList.add('has-install-banner');
  }

  // Android / Chrome / Edge: el navegador permite lanzar su propio diálogo de instalación
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(() => showBanner({
      text: 'Tenla a mano en tu teléfono, como una app.',
      actionLabel: 'Instalar',
      onAction: async () => {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome !== 'accepted') rememberDismiss();
        deferredPrompt = null;
      },
    }), SHOW_DELAY_MS);
  });

  window.addEventListener('appinstalled', () => {
    const bar = document.getElementById('installBanner');
    if (bar) bar.remove();
    document.body.classList.remove('has-install-banner');
  });

  // iPhone / iPad: no hay diálogo automático, se explica cómo añadirla
  if (isIos) {
    setTimeout(() => showBanner({
      text: 'Toca Compartir y luego «Añadir a pantalla de inicio».',
    }), SHOW_DELAY_MS);
  }
})();
