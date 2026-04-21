(() => {
  'use strict';

  const COMMISSION = 0.07;
  const WHATSAPP_NUMBER = '50376528075';
  const RATE_ENDPOINT = 'https://api.yadio.io/rate/CUP/USD';
  const RATE_TTL_MS = 3 * 60 * 1000;
  const RETRY_MS = 8 * 1000;

  const el = {
    payUsd: document.getElementById('payUsd'),
    recvCup: document.getElementById('recvCup'),
    recvUsd: document.getElementById('recvUsd'),
    recvUsdHint: document.getElementById('recvUsdHint'),
    feeHint: document.getElementById('feeHint'),
    ratePill: document.getElementById('ratePill'),
    rateText: document.getElementById('rateText'),
    sumPay: document.getElementById('sumPay'),
    sumFee: document.getElementById('sumFee'),
    sumRecv: document.getElementById('sumRecv'),
    sumRecvUsd: document.getElementById('sumRecvUsd'),
    sumRecvRow: document.getElementById('sumRecvRow'),
    whatsappBtn: document.getElementById('whatsappBtn'),
    whatsappSaldoBtn: document.getElementById('whatsappSaldoBtn'),
    cubaPhone: document.getElementById('cubaPhone'),
    year: document.getElementById('year'),
    tabs: document.querySelectorAll('.tab'),
    panelEnvio: document.getElementById('panel-envio'),
    panelSaldo: document.getElementById('panel-saldo'),
    offers: document.querySelectorAll('.offer'),
  };

  el.year.textContent = new Date().getFullYear();

  /* ===== Tabs ===== */
  el.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      el.tabs.forEach(t => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      const which = tab.dataset.tab;
      el.panelEnvio.classList.toggle('hidden', which !== 'envio');
      el.panelSaldo.classList.toggle('hidden', which !== 'saldo');
    });
  });

  /* ===== Envío de dinero ===== */
  let rate = 0;
  let rateTimestamp = 0;
  let rateOk = false;
  let retryTimer = null;

  const fmtUsd = (n) => new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n || 0);

  const fmtCup = (n) => new Intl.NumberFormat('es-CU', {
    maximumFractionDigits: 0,
  }).format(Math.round(n || 0));

  const parseNum = (v) => {
    if (v == null) return 0;
    const cleaned = String(v).replace(/[^\d.,]/g, '').replace(/,/g, '');
    const n = parseFloat(cleaned);
    return isFinite(n) && n > 0 ? n : 0;
  };

  function setInputsEnabled(enabled) {
    [el.payUsd, el.recvCup].forEach((input) => {
      input.disabled = !enabled;
      input.style.opacity = enabled ? '1' : '0.55';
    });
  }

  async function fetchRate() {
    try {
      const res = await fetch(RATE_ENDPOINT, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const r = Number(data.rate);
      if (!isFinite(r) || r <= 0) throw new Error('Bad rate');
      rate = r;
      rateTimestamp = Date.now();
      rateOk = true;
      clearTimeout(retryTimer);
      setInputsEnabled(true);
      updateRatePill('ok');
      recomputeFromCurrent();
    } catch (err) {
      if (!rateOk) {
        updateRatePill('loading');
        setInputsEnabled(false);
      } else {
        updateRatePill('stale');
      }
      clearTimeout(retryTimer);
      retryTimer = setTimeout(fetchRate, RETRY_MS);
    }
  }

  function updateRatePill(state) {
    el.ratePill.classList.remove('stale', 'error', 'loading');
    if (state === 'loading') {
      el.ratePill.classList.add('loading');
      el.rateText.textContent = 'Calculando tasa…';
    } else if (state === 'stale') {
      el.ratePill.classList.add('stale');
      el.rateText.textContent = `1 USD = ${fmtCup(rate)} CUP · reintentando`;
    } else {
      el.rateText.textContent = `1 USD = ${fmtCup(rate)} CUP`;
    }
  }

  let lastRecvCup = 0;
  function updateSummary(payUsd, feeUsd, recvCup) {
    const netUsd = payUsd - feeUsd;
    el.sumPay.textContent  = `$${fmtUsd(payUsd)} USD`;
    el.sumFee.textContent  = `$${fmtUsd(feeUsd)} USD`;
    el.sumRecv.textContent = `${fmtCup(recvCup)} CUP`;
    el.sumRecvUsd.textContent = `≈ $${fmtUsd(netUsd)} USD`;

    if (recvCup > 0 && Math.round(recvCup) !== Math.round(lastRecvCup)) {
      el.sumRecvRow.classList.remove('flash');
      void el.sumRecvRow.offsetWidth;
      el.sumRecvRow.classList.add('flash');
    }
    lastRecvCup = recvCup;

    const canSend = rateOk && payUsd > 0.01;
    if (canSend) {
      el.whatsappBtn.removeAttribute('aria-disabled');
      el.whatsappBtn.href = buildEnvioUrl(payUsd, feeUsd, recvCup);
    } else {
      el.whatsappBtn.setAttribute('aria-disabled', 'true');
      el.whatsappBtn.href = '#';
    }
  }

  function buildEnvioUrl(payUsd, feeUsd, recvCup) {
    const netUsd = payUsd - feeUsd;
    const lines = [
      'Hola Forte, quiero hacer un envío a Cuba.',
      '',
      `Entrego en El Salvador: $${fmtUsd(payUsd)} USD (de los cuales $${fmtUsd(feeUsd)} son comisión).`,
      `Mi familiar recibe en Cuba: ${fmtCup(recvCup)} CUP (≈ $${fmtUsd(netUsd)} USD).`,
      `Tasa aplicada: 1 USD = ${fmtCup(rate)} CUP (El Toque).`,
      '',
      '¿Podemos coordinar?',
    ];
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  let editing = null;

  function updateUsdHint(net) {
    el.recvUsdHint.textContent = net > 0 ? `≈ $${fmtUsd(net)} USD` : '≈ $0.00 USD';
  }

  function updateFeeHint(fee) {
    el.feeHint.textContent = fee > 0
      ? `Incluye $${fmtUsd(fee)} de comisión (7%).`
      : 'Comisión 7% incluida.';
  }

  function recomputeFromCurrent() {
    if (!rateOk) return;
    if (editing === 'cup') return recomputeFromCup();
    return recomputeFromPay();
  }

  function recomputeFromPay() {
    if (!rateOk) return;
    const pay = parseNum(el.payUsd.value);
    const net = pay / (1 + COMMISSION);
    const fee = pay - net;
    const cup = net * rate;

    if (document.activeElement === el.payUsd) {
      el.recvCup.value = cup > 0 ? fmtCup(cup) : '';
    }
    el.recvUsd.value = net > 0 ? fmtUsd(net) : '';
    updateUsdHint(net);
    updateFeeHint(fee);
    updateSummary(pay, fee, cup);
  }

  function recomputeFromCup() {
    if (!rateOk) return;
    const cup = parseNum(el.recvCup.value);
    const net = cup / rate;
    const pay = net * (1 + COMMISSION);
    const fee = pay - net;

    el.payUsd.value  = pay > 0 ? fmtUsd(pay) : '';
    el.recvUsd.value = net > 0 ? fmtUsd(net) : '';
    updateUsdHint(net);
    updateFeeHint(fee);
    updateSummary(pay, fee, cup);
  }

  function bind(inputEl, kind, fn) {
    inputEl.addEventListener('focus', () => { editing = kind; });
    inputEl.addEventListener('blur',  () => { editing = null; });
    inputEl.addEventListener('input', fn);
  }

  bind(el.payUsd,  'pay', recomputeFromPay);
  bind(el.recvCup, 'cup', recomputeFromCup);

  el.whatsappBtn.addEventListener('click', (e) => {
    if (el.whatsappBtn.getAttribute('aria-disabled') === 'true') e.preventDefault();
  });

  setInputsEnabled(false);
  updateRatePill('loading');
  updateSummary(0, 0, 0);

  fetchRate();
  setInterval(fetchRate, RATE_TTL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (Date.now() - rateTimestamp) > RATE_TTL_MS) fetchRate();
  });

  /* ===== Saldo móvil ===== */
  let selectedOffer = null;

  function updateSaldoBtn() {
    const hasOffer = !!selectedOffer;
    if (hasOffer) {
      el.whatsappSaldoBtn.removeAttribute('aria-disabled');
      el.whatsappSaldoBtn.href = buildSaldoUrl();
    } else {
      el.whatsappSaldoBtn.setAttribute('aria-disabled', 'true');
      el.whatsappSaldoBtn.href = '#';
    }
  }

  function buildSaldoUrl() {
    const { cup, usd } = selectedOffer;
    const phone = (el.cubaPhone.value || '').replace(/\s+/g, '');
    const lines = [
      'Hola Forte, quiero una recarga de saldo móvil para Cuba.',
      '',
      `Paquete: ${cup} CUP por $${fmtUsd(parseFloat(usd))} USD.`,
      phone ? `Número a recargar: +53 ${phone}` : 'Número a recargar: te lo paso por aquí.',
      '',
      '¿Podemos coordinar?',
    ];
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  el.offers.forEach(btn => {
    btn.addEventListener('click', () => {
      el.offers.forEach(b => b.classList.toggle('selected', b === btn));
      selectedOffer = { cup: btn.dataset.cup, usd: btn.dataset.usd };
      updateSaldoBtn();
    });
  });

  el.cubaPhone.addEventListener('input', updateSaldoBtn);
  el.whatsappSaldoBtn.addEventListener('click', (e) => {
    if (el.whatsappSaldoBtn.getAttribute('aria-disabled') === 'true') e.preventDefault();
  });
})();
