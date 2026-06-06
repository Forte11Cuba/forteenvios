(() => {
  'use strict';

  const COMMISSION = 0.07;
  const COMMISSION_USD_CASH = 0.10;
  const WHATSAPP_NUMBER = '50376528075';
  const RATE_ENDPOINT = 'https://api.yadio.io/rate/CUP/USD';
  const RATE_TTL_MS = 3 * 60 * 1000;
  const RETRY_MS = 8 * 1000;

  const el = {
    payUsd:          document.getElementById('payUsd'),
    recvCup:         document.getElementById('recvCup'),
    recvCupLabel:    document.getElementById('recvCupLabel'),
    recvCupCurrency: document.getElementById('recvCupCurrency'),
    recvUsd:         document.getElementById('recvUsd'),
    recvUsdHint:     document.getElementById('recvUsdHint'),
    feeHint:         document.getElementById('feeHint'),
    ratePill:        document.getElementById('ratePill'),
    rateText:        document.getElementById('rateText'),
    sumPay:          document.getElementById('sumPay'),
    sumFeeLabel:     document.getElementById('sumFeeLabel'),
    sumFee:          document.getElementById('sumFee'),
    sumMensajeriaRow:document.getElementById('sumMensajeriaRow'),
    sumMensajeria:   document.getElementById('sumMensajeria'),
    sumRecvUsdRow:   document.getElementById('sumRecvUsdRow'),
    sumRecvUsd:      document.getElementById('sumRecvUsd'),
    sumRecvRow:      document.getElementById('sumRecvRow'),
    sumRecvLabel:    document.getElementById('sumRecvLabel'),
    sumRecv:         document.getElementById('sumRecv'),
    whatsappBtn:     document.getElementById('whatsappBtn'),
    whatsappSaldoBtn:document.getElementById('whatsappSaldoBtn'),
    cubaPhone:       document.getElementById('cubaPhone'),
    year:            document.getElementById('year'),
    tabs:            document.querySelectorAll('.tab'),
    panelEnvio:      document.getElementById('panel-envio'),
    panelSaldo:      document.getElementById('panel-saldo'),
    offers:          document.querySelectorAll('.offer'),
    dtoggleBtns:      document.querySelectorAll('.dtoggle'),
    ctoggleBtns:      document.querySelectorAll('.ctoggle'),
    municipioSelect:  document.getElementById('municipioSelect'),
    efectivoOptions:  document.getElementById('efectivo-options'),
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

  /* ===== Rate ===== */
  let rate = 0;
  let rateTimestamp = 0;
  let rateOk = false;
  let retryTimer = null;

  const fmtUsd = (n) => new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n || 0);

  const fmtCup = (n) => new Intl.NumberFormat('es-CU', {
    maximumFractionDigits: 0,
  }).format(Math.ceil(n || 0));

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

  /* ===== Delivery mode state ===== */
  let deliveryMode = 'transferencia'; // 'transferencia' | 'efectivo'
  let efectivoCurrency = 'cup';       // 'cup' | 'usd'
  let selectedMunicipio = null;       // { name, cost } or null

  const isEfectivoUsd = () => deliveryMode === 'efectivo' && efectivoCurrency === 'usd';

  function getCommission() {
    return isEfectivoUsd() ? COMMISSION_USD_CASH : COMMISSION;
  }

  function getMensajeria() {
    return (deliveryMode === 'efectivo' && selectedMunicipio) ? selectedMunicipio.cost : 0;
  }

  function updateRecvFieldUI() {
    if (isEfectivoUsd()) {
      el.recvCupLabel.textContent = 'Recibe en efectivo';
      el.recvCupCurrency.textContent = 'USD';
      el.recvCup.placeholder = '0.00';
    } else {
      el.recvCupLabel.textContent = 'Recibe en Cuba';
      el.recvCupCurrency.textContent = 'CUP';
      el.recvCup.placeholder = '0';
    }
  }

  /* ===== Delivery toggle ===== */
  el.dtoggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      deliveryMode = btn.dataset.mode;
      el.dtoggleBtns.forEach(b => b.classList.toggle('active', b === btn));
      el.efectivoOptions.classList.toggle('hidden', deliveryMode !== 'efectivo');
      el.municipioSelect.value = '';
      selectedMunicipio = null;
      updateRecvFieldUI();
      el.recvCup.value = '';
      el.payUsd.value = '';
      recomputeFromPay();
    });
  });

  /* ===== Currency toggle (CUP / USD) ===== */
  el.ctoggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      efectivoCurrency = btn.dataset.currency;
      el.ctoggleBtns.forEach(b => b.classList.toggle('active', b === btn));
      updateRecvFieldUI();
      recomputeFromPay();
    });
  });

  /* ===== Municipio select ===== */
  el.municipioSelect.addEventListener('change', () => {
    const val = el.municipioSelect.value;
    if (val) {
      const [name, cost] = val.split('|');
      selectedMunicipio = { name, cost: Number(cost) };
    } else {
      selectedMunicipio = null;
    }
    recomputeFromCurrent();
  });

  /* ===== Summary ===== */
  let lastRecvValue = 0;

  function updateSummary(payUsd, feeUsd, mensajeriaUsd, recvCup, recvUsdCash) {
    const usdMode = isEfectivoUsd();
    const netUsd = payUsd - feeUsd - mensajeriaUsd;

    el.sumPay.textContent = `$${fmtUsd(payUsd)} USD`;

    const pct = usdMode ? '10' : '7';
    el.sumFeeLabel.textContent = `Comisión (${pct}%)`;
    el.sumFee.textContent = `$${fmtUsd(feeUsd)} USD`;

    if (mensajeriaUsd > 0) {
      el.sumMensajeriaRow.style.display = '';
      el.sumMensajeria.textContent = `$${fmtUsd(mensajeriaUsd)} USD`;
    } else {
      el.sumMensajeriaRow.style.display = 'none';
    }

    if (usdMode) {
      const cupEquiv = (recvUsdCash || 0) * rate;
      el.sumRecvUsd.textContent = recvUsdCash > 0 ? `≈ ${fmtCup(cupEquiv)} CUP` : '≈ 0 CUP';
      el.sumRecvLabel.textContent = 'Recibe en efectivo';
      const val = recvUsdCash || 0;
      el.sumRecv.textContent = `$${fmtUsd(val)} USD`;
      if (val > 0 && Math.round(val * 100) !== Math.round(lastRecvValue * 100)) {
        el.sumRecvRow.classList.remove('flash');
        void el.sumRecvRow.offsetWidth;
        el.sumRecvRow.classList.add('flash');
      }
      lastRecvValue = val;
    } else {
      el.sumRecvUsd.textContent = netUsd > 0 ? `≈ $${fmtUsd(netUsd)} USD` : '≈ $0.00 USD';
      el.sumRecvLabel.textContent = 'Recibe en Cuba';
      const cup = recvCup || 0;
      el.sumRecv.textContent = `${fmtCup(cup)} CUP`;
      if (cup > 0 && Math.round(cup) !== Math.round(lastRecvValue)) {
        el.sumRecvRow.classList.remove('flash');
        void el.sumRecvRow.offsetWidth;
        el.sumRecvRow.classList.add('flash');
      }
      lastRecvValue = cup;
    }

    const canSend = rateOk && payUsd > 0.01
      && (deliveryMode === 'transferencia' || selectedMunicipio !== null);

    if (canSend) {
      el.whatsappBtn.removeAttribute('aria-disabled');
      el.whatsappBtn.href = buildEnvioUrl(payUsd, feeUsd, mensajeriaUsd, recvCup, recvUsdCash);
    } else {
      el.whatsappBtn.setAttribute('aria-disabled', 'true');
      el.whatsappBtn.href = '#';
    }
  }

  function buildEnvioUrl(payUsd, feeUsd, mensajeriaUsd, recvCup, recvUsdCash) {
    const lines = ['Hola Forte, quiero hacer un envío a Cuba.', ''];

    if (deliveryMode === 'transferencia') {
      const netUsd = payUsd - feeUsd;
      lines.push('Modalidad: Transferencia a tarjeta (Bandec / BPA / Metro).');
      lines.push(`Yo envío: $${fmtUsd(payUsd)} USD (comisión $${fmtUsd(feeUsd)} – 7%).`);
      lines.push(`Mi familiar recibe: ${fmtCup(recvCup)} CUP (≈ $${fmtUsd(netUsd)} USD).`);
      lines.push(`Tasa: 1 USD = ${fmtCup(rate)} CUP (El Toque).`);
    } else if (efectivoCurrency === 'cup') {
      const netUsd = payUsd - feeUsd - mensajeriaUsd;
      lines.push('Modalidad: Efectivo en CUP en La Habana.');
      lines.push(`Municipio: ${selectedMunicipio.name} (mensajería $${fmtUsd(mensajeriaUsd)} USD).`);
      lines.push(`Yo envío: $${fmtUsd(payUsd)} USD total (comisión $${fmtUsd(feeUsd)} – 7%, mensajería $${fmtUsd(mensajeriaUsd)}).`);
      lines.push(`Mi familiar recibe: ${fmtCup(recvCup)} CUP en efectivo (≈ $${fmtUsd(netUsd)} USD).`);
      lines.push(`Tasa: 1 USD = ${fmtCup(rate)} CUP (El Toque).`);
    } else {
      lines.push('Modalidad: Efectivo en USD en La Habana.');
      lines.push(`Municipio: ${selectedMunicipio.name} (mensajería $${fmtUsd(mensajeriaUsd)} USD).`);
      lines.push(`Yo envío: $${fmtUsd(payUsd)} USD total (comisión $${fmtUsd(feeUsd)} – 10%, mensajería $${fmtUsd(mensajeriaUsd)}).`);
      lines.push(`Mi familiar recibe: $${fmtUsd(recvUsdCash)} USD en efectivo.`);
    }

    lines.push('', '¿Podemos coordinar?');
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  let editing = null;

  function updateUsdHint(net) {
    if (isEfectivoUsd()) {
      const cup = net * rate;
      el.recvUsdHint.textContent = cup > 0 ? `≈ ${fmtCup(cup)} CUP` : '≈ 0 CUP';
    } else {
      el.recvUsdHint.textContent = net > 0 ? `≈ $${fmtUsd(net)} USD` : '≈ $0.00 USD';
    }
  }

  function updateFeeHint(fee) {
    const pct = Math.round(getCommission() * 100);
    el.feeHint.textContent = fee > 0
      ? `Incluye $${fmtUsd(fee)} de comisión (${pct}%).`
      : `Comisión ${pct}% incluida.`;
  }

  function recomputeFromCurrent() {
    if (!rateOk) return;
    if (editing === 'cup') return recomputeFromCup();
    return recomputeFromPay();
  }

  function recomputeFromPay() {
    if (!rateOk) return;
    const pay = parseNum(el.payUsd.value);
    const comm = getCommission();
    const mensajeria = getMensajeria();

    const payable = Math.max(pay - mensajeria, 0);
    const net = Math.round(payable / (1 + comm) * 100) / 100;
    const fee = payable - net;

    el.recvUsd.value = net > 0 ? fmtUsd(net) : '';
    updateUsdHint(net);
    updateFeeHint(fee);

    if (isEfectivoUsd()) {
      if (editing !== 'cup') {
        el.recvCup.value = net > 0 ? fmtUsd(net) : '';
      }
      updateSummary(pay, fee, mensajeria, null, net);
    } else {
      const cup = net * rate;
      if (editing !== 'cup') {
        el.recvCup.value = cup > 0 ? fmtCup(cup) : '';
      }
      updateSummary(pay, fee, mensajeria, cup, null);
    }
  }

  function recomputeFromCup() {
    if (!rateOk) return;
    const comm = getCommission();
    const mensajeria = getMensajeria();
    let pay, net, fee, cup, recvUsdCash;

    if (isEfectivoUsd()) {
      recvUsdCash = parseNum(el.recvCup.value);
      net = recvUsdCash;
      const payable = net * (1 + comm);
      pay = payable + mensajeria;
      fee = payable - net;
      cup = null;
    } else {
      cup = parseNum(el.recvCup.value);
      net = cup / rate;
      const payable = net * (1 + comm);
      pay = payable + mensajeria;
      fee = payable - net;
      recvUsdCash = null;
    }

    el.payUsd.value = pay > 0 ? fmtUsd(pay) : '';
    el.recvUsd.value = net > 0 ? fmtUsd(net) : '';
    updateUsdHint(net);
    updateFeeHint(fee);
    updateSummary(pay, fee, mensajeria, cup, recvUsdCash);
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
  updateSummary(0, 0, 0, 0, null);

  fetchRate();
  setInterval(fetchRate, RATE_TTL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (Date.now() - rateTimestamp) > RATE_TTL_MS) fetchRate();
  });

  /* ===== Saldo móvil ===== */
  let selectedOffer = null;

  function updateSaldoBtn() {
    if (selectedOffer) {
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
