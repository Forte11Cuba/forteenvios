(() => {
  'use strict';

  const COMMISSION = 0.07;
  const COMMISSION_USD = 0.10;
  const TRANSFER_USD_FEE = 3;
  const MIN_SEND_USD = 1;
  const WHATSAPP_NUMBER = '50376528075';
  const RATE_ENDPOINT = 'https://api.yadio.io/rate/CUP/USD';
  const RATE_TTL_MS = 3 * 60 * 1000;
  const RATE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
  const RETRY_MS = 8 * 1000;

  // Única fuente de precios de mensajería: llena los <select> y la lista del FAQ.
  // `soloUsd`: la provincia solo recibe efectivo en USD; `comisionUsd`: comisión propia del USD.
  const ENTREGA_EFECTIVO = [
    { provincia: 'La Habana', municipios: [
    ['Centro Habana', 5],
    ['La Habana Vieja', 5],
    ['Plaza de la Revolución', 5],
    ['Playa', 5],
    ['Arroyo Naranjo', 5],
    ['Boyeros', 5],
    ['Diez de Octubre', 5],
    ['Marianao', 5],
    ['Cerro', 5],
    ['La Lisa', 5],
    ['San Miguel del Padrón', 5],
    ['Cotorro', 6],
    ['Guanabacoa', 7],
    ['La Habana del Este', 7],
    ['Regla', 6],
    ] },
    { provincia: 'Las Tunas', nota: 'por ahora solo el municipio cabecera, solo en USD', soloUsd: true, comisionUsd: 0.15, municipios: [
      ['Las Tunas', 1],
    ] },
  ];

  const el = {
    payUsd:          document.getElementById('payUsd'),
    recvCup:         document.getElementById('recvCup'),
    recvCupCurrency: document.getElementById('recvCupCurrency'),
    ratePill:        document.getElementById('ratePill'),
    rateText:        document.getElementById('rateText'),
    sumPay:          document.getElementById('sumPay'),
    sumFeeLabel:     document.getElementById('sumFeeLabel'),
    sumFee:          document.getElementById('sumFee'),
    sumMensajeriaRow:document.getElementById('sumMensajeriaRow'),
    sumMensajeria:   document.getElementById('sumMensajeria'),
    sumRecvRow:      document.getElementById('sumRecvRow'),
    sumRecv:         document.getElementById('sumRecv'),
    envioHint:       document.getElementById('envioHint'),
    whatsappBtn:     document.getElementById('whatsappBtn'),
    whatsappSaldoBtn:document.getElementById('whatsappSaldoBtn'),
    saldoHint:       document.getElementById('saldoHint'),
    promoNote:       document.getElementById('promoNote'),
    cubaPhone:       document.getElementById('cubaPhone'),
    year:            document.getElementById('year'),
    tabs:            document.querySelectorAll('.tab'),
    panelEnvio:      document.getElementById('panel-envio'),
    panelSaldo:      document.getElementById('panel-saldo'),
    offers:          document.querySelectorAll('.offer'),
    dtoggleBtns:        document.querySelectorAll('.dtoggle'),
    ctoggleBtns:        document.querySelectorAll('#efectivo-options .ctoggle'),
    transferCtoggleBtns:document.querySelectorAll('#transferencia-options .ctoggle'),
    provinciaSelect:    document.getElementById('provinciaSelect'),
    municipioSelect:    document.getElementById('municipioSelect'),
    mensajeriaList:     document.getElementById('mensajeriaList'),
    efectivoOptions:    document.getElementById('efectivo-options'),
    transferOptions:    document.getElementById('transferencia-options'),
    transferNote:       document.getElementById('transferNote'),
    sumMensajeriaLabel: document.getElementById('sumMensajeriaLabel'),
  };

  el.year.textContent = new Date().getFullYear();

  const setPressed = (btns, active) => btns.forEach(b => {
    b.classList.toggle('active', b === active);
    b.setAttribute('aria-pressed', b === active ? 'true' : 'false');
  });

  function setHint(node, text) {
    node.textContent = text || '';
    node.hidden = !text;
  }

  function setBtn(btn, href) {
    if (href) {
      btn.removeAttribute('aria-disabled');
      btn.href = href;
    } else {
      btn.setAttribute('aria-disabled', 'true');
      btn.href = '#';
    }
  }

  const waUrl = (lines) =>
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;

  /* ===== Tabs ===== */
  function selectTab(tab) {
    el.tabs.forEach(t => {
      t.classList.toggle('active', t === tab);
      t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      t.tabIndex = t === tab ? 0 : -1;
    });
    const which = tab.dataset.tab;
    el.panelEnvio.classList.toggle('hidden', which !== 'envio');
    el.panelSaldo.classList.toggle('hidden', which !== 'saldo');
  }

  el.tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      const next = el.tabs[(i + step + el.tabs.length) % el.tabs.length];
      selectTab(next);
      next.focus();
    });
  });

  /* ===== Provincias ===== */
  ENTREGA_EFECTIVO.forEach(({ provincia }, i) => {
    el.provinciaSelect.add(new Option(provincia, String(i)));
  });

  // FAQ: una entrada por provincia, con los municipios agrupados por precio
  if (el.mensajeriaList) {
    ENTREGA_EFECTIVO.forEach(({ provincia, nota, municipios }) => {
      const li = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = provincia;
      li.append(title);
      if (nota) li.append(` (${nota})`);

      const byCost = new Map();
      municipios.forEach(([name, cost]) => {
        if (!byCost.has(cost)) byCost.set(cost, []);
        byCost.get(cost).push(name);
      });
      const ul = document.createElement('ul');
      [...byCost.keys()].sort((a, b) => a - b).forEach(cost => {
        const item = document.createElement('li');
        const strong = document.createElement('strong');
        strong.textContent = `$${cost} USD:`;
        item.append(strong, ' ' + byCost.get(cost).join(', '));
        ul.appendChild(item);
      });
      li.append(ul);
      el.mensajeriaList.appendChild(li);
    });
  }

  /* ===== Rate ===== */
  let rate = 0;
  let rateTimestamp = 0;
  let rateOk = false;
  let rateOld = false;
  let retryTimer = null;

  const fmtUsd = (n) => new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n || 0);

  const fmtCup = (n) => new Intl.NumberFormat('es-CU', {
    maximumFractionDigits: 0,
  }).format(Math.ceil((n || 0) - 1e-6) || 0); // "|| 0" evita mostrar "-0"

  const floor2 = (n) => Math.floor(n * 100 + 1e-6) / 100;
  const ceil2  = (n) => Math.ceil(n * 100 - 1e-6) / 100;

  // thousandsDot: acepta "10.000" como diez mil (solo para montos en CUP)
  const parseNum = (v, thousandsDot = false) => {
    if (v == null) return 0;
    let s = String(v).replace(/[^\d.,]/g, '');
    if (thousandsDot && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s.replace(/,/g, ''));
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
      const ts = Number(data.timestamp);
      rate = Math.ceil(r); // en Cuba no se manejan centavos: 489.2 → 490, y se calcula con esa misma tasa
      rateTimestamp = Date.now();
      rateOld = isFinite(ts) && ts > 0 && (Date.now() - ts) > RATE_MAX_AGE_MS;
      rateOk = true;
      clearTimeout(retryTimer);
      setInputsEnabled(true);
      updateRatePill(rateOld ? 'old' : 'ok');
      recompute();
    } catch (err) {
      if (!rateOk) {
        updateRatePill('error');
        setInputsEnabled(false);
        showRateUnavailable();
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
    } else if (state === 'error') {
      el.ratePill.classList.add('error');
      el.rateText.textContent = 'Tasa no disponible · reintentando';
    } else if (state === 'stale') {
      el.ratePill.classList.add('stale');
      el.rateText.textContent = `1 USD = ${fmtCup(rate)} CUP · reintentando`;
    } else if (state === 'old') {
      el.ratePill.classList.add('stale');
      el.rateText.textContent = `1 USD = ${fmtCup(rate)} CUP · por confirmar`;
    } else {
      el.rateText.textContent = `1 USD = ${fmtCup(rate)} CUP`;
    }
  }

  // Sin tasa no se puede calcular, pero el cliente aún puede escribirnos
  function showRateUnavailable() {
    setHint(el.envioHint, 'No pudimos cargar la tasa de hoy. Escríbenos por WhatsApp y te confirmamos el monto.');
    setBtn(el.whatsappBtn, waUrl([
      'Hola Forte, quiero hacer un envío a Cuba.',
      '',
      '¿Me confirmas la tasa de hoy?',
    ]));
  }

  /* ===== Delivery mode state ===== */
  let deliveryMode = 'transferencia'; // 'transferencia' | 'efectivo'
  let transferCurrency = 'cup';       // 'cup' | 'usd'
  let efectivoCurrency = 'cup';       // 'cup' | 'usd'
  let selectedProvincia = null;       // entrada de ENTREGA_EFECTIVO o null
  let selectedMunicipio = null;       // { provincia, name, cost } or null

  // Campo que escribió el cliente por última vez; el otro se calcula a partir de él
  let lastEdited = 'pay';             // 'pay' | 'cup'

  // Moneda a recibir según la modalidad activa
  const getCurrency = () => deliveryMode === 'efectivo' ? efectivoCurrency : transferCurrency;
  const isUsd = () => getCurrency() === 'usd';

  function getCommission() {
    // Solo el efectivo en USD lleva 10% (o la de su provincia); el resto (incl. Clásica USD) va al 7%
    if (deliveryMode !== 'efectivo' || efectivoCurrency !== 'usd') return COMMISSION;
    return selectedProvincia?.comisionUsd ?? COMMISSION_USD;
  }

  // Costo fijo en USD que paga el remitente: mensajería (efectivo) o servicio (transferencia USD)
  function getFixedFee() {
    if (deliveryMode === 'efectivo') return selectedMunicipio ? selectedMunicipio.cost : 0;
    return transferCurrency === 'usd' ? TRANSFER_USD_FEE : 0;
  }

  function updateRecvFieldUI() {
    if (isUsd()) {
      el.recvCupCurrency.textContent = 'USD';
      el.recvCup.placeholder = '0.00';
    } else {
      el.recvCupCurrency.textContent = 'CUP';
      el.recvCup.placeholder = '0';
    }
  }

  function updateTransferNote() {
    el.transferNote.textContent = transferCurrency === 'usd'
      ? 'Tarjeta: Clásica'
      : 'Tarjetas: BANDEC, Metropolitano o BPA';
  }

  // Si cambia la moneda a recibir, el número del campo "Recibes" ya no significa
  // lo mismo: se conserva lo que entrega el cliente y se recalcula desde ahí.
  function changeState(mutate) {
    const prevCurrency = getCurrency();
    mutate();
    if (getCurrency() !== prevCurrency) lastEdited = 'pay';
    updateTransferNote();
    updateRecvFieldUI();
    recompute();
  }

  /* ===== Delivery toggle ===== */
  el.dtoggleBtns.forEach(btn => {
    btn.addEventListener('click', () => changeState(() => {
      deliveryMode = btn.dataset.mode;
      setPressed(el.dtoggleBtns, btn);
      el.efectivoOptions.classList.toggle('hidden', deliveryMode !== 'efectivo');
      el.transferOptions.classList.toggle('hidden', deliveryMode !== 'transferencia');
    }));
  });

  /* ===== Currency toggle · Efectivo (CUP / USD) ===== */
  el.ctoggleBtns.forEach(btn => {
    btn.addEventListener('click', () => changeState(() => {
      efectivoCurrency = btn.dataset.currency;
      setPressed(el.ctoggleBtns, btn);
    }));
  });

  /* ===== Currency toggle · Transferencia (CUP / USD) ===== */
  el.transferCtoggleBtns.forEach(btn => {
    btn.addEventListener('click', () => changeState(() => {
      transferCurrency = btn.dataset.currency;
      setPressed(el.transferCtoggleBtns, btn);
    }));
  });

  /* ===== Provincia / Municipio ===== */
  function fillMunicipios() {
    el.municipioSelect.length = 1;
    el.municipioSelect.disabled = !selectedProvincia;
    if (!selectedProvincia) return;
    selectedProvincia.municipios.forEach(([name, cost], i) => {
      el.municipioSelect.add(new Option(`${name} ($${cost})`, String(i)));
    });
    // Con un solo municipio no hace falta que el cliente lo elija
    if (selectedProvincia.municipios.length === 1) el.municipioSelect.value = '0';
  }

  function readMunicipio() {
    const m = selectedProvincia?.municipios[el.municipioSelect.value];
    selectedMunicipio = m ? { provincia: selectedProvincia.provincia, name: m[0], cost: m[1] } : null;
  }

  // Provincias que solo reciben USD: se fuerza USD y se desactiva CUP
  function syncEfectivoCurrency() {
    const soloUsd = !!selectedProvincia?.soloUsd;
    el.ctoggleBtns.forEach(b => { b.disabled = soloUsd && b.dataset.currency === 'cup'; });
    if (soloUsd && efectivoCurrency !== 'usd') {
      efectivoCurrency = 'usd';
      setPressed(el.ctoggleBtns, [...el.ctoggleBtns].find(b => b.dataset.currency === 'usd'));
    }
  }

  el.provinciaSelect.addEventListener('change', () => changeState(() => {
    selectedProvincia = ENTREGA_EFECTIVO[el.provinciaSelect.value] || null;
    fillMunicipios();
    readMunicipio();
    syncEfectivoCurrency();
  }));

  el.municipioSelect.addEventListener('change', () => {
    readMunicipio();
    recompute();
  });

  /* ===== Summary ===== */
  let lastRecvValue = 0;

  function getHint(calc) {
    const { pay, fixed, net } = calc;
    if (pay <= 0) return '';
    if (deliveryMode === 'efectivo' && !selectedMunicipio) return (selectedProvincia ? 'Elige el municipio de entrega para continuar.' : 'Elige la provincia y el municipio de entrega para continuar.');
    if (fixed > 0 && pay <= fixed) {
      const what = deliveryMode === 'efectivo' ? 'la mensajería' : 'el costo de servicio';
      return `El monto no alcanza para cubrir ${what} ($${fmtUsd(fixed)} USD).`;
    }
    if (net < MIN_SEND_USD) return `El monto mínimo a enviar es $${fmtUsd(MIN_SEND_USD)} USD.`;
    return '';
  }

  function updateSummary(calc) {
    const { pay, fee, fixed, recv } = calc;
    const usdMode = isUsd();

    el.sumPay.textContent = `$${fmtUsd(pay)} USD`;

    const pct = Math.round(getCommission() * 100);
    el.sumFeeLabel.textContent = `Comisión (${pct}% sobre lo recibido)`;
    el.sumFee.textContent = `$${fmtUsd(fee)} USD`;

    if (fixed > 0) {
      el.sumMensajeriaRow.style.display = '';
      el.sumMensajeriaLabel.textContent = deliveryMode === 'efectivo'
        ? `Mensajería en ${selectedMunicipio.provincia}`
        : 'Costo de servicio';
      el.sumMensajeria.textContent = `$${fmtUsd(fixed)} USD`;
    } else {
      el.sumMensajeriaRow.style.display = 'none';
    }

    el.sumRecv.textContent = usdMode ? `$${fmtUsd(recv)} USD` : `${fmtCup(recv)} CUP`;

    const flashKey = usdMode ? Math.round(recv * 100) : Math.round(recv);
    if (recv > 0 && flashKey !== lastRecvValue) {
      el.sumRecvRow.classList.remove('flash');
      void el.sumRecvRow.offsetWidth;
      el.sumRecvRow.classList.add('flash');
    }
    lastRecvValue = flashKey;

    const hint = getHint(calc);
    setHint(el.envioHint, hint);

    const canSend = rateOk && recv > 0 && !hint;
    setBtn(el.whatsappBtn, canSend ? buildEnvioUrl(calc) : null);
  }

  function buildEnvioUrl({ pay, fee, fixed, net, recv }) {
    const lines = ['Hola Forte, quiero hacer un envío a Cuba.', ''];
    const pct = Math.round(getCommission() * 100);
    const tasa = `Tasa: 1 USD = ${fmtCup(rate)} CUP (El Toque).`;

    if (deliveryMode === 'transferencia' && transferCurrency === 'cup') {
      lines.push('Modalidad: Transferencia a tarjeta CUP (Bandec / Metropolitano / BPA).');
      lines.push(`Yo entrego en El Salvador: $${fmtUsd(pay)} USD (comisión $${fmtUsd(fee)} – ${pct}%).`);
      lines.push(`Mi familiar recibe: ${fmtCup(recv)} CUP (≈ $${fmtUsd(net)} USD).`);
      lines.push(tasa);
    } else if (deliveryMode === 'transferencia') {
      lines.push('Modalidad: Transferencia a Tarjeta Clásica.');
      lines.push(`Yo entrego en El Salvador: $${fmtUsd(pay)} USD total (comisión $${fmtUsd(fee)} – ${pct}%, servicio $${fmtUsd(fixed)}).`);
      lines.push(`Mi familiar recibe: $${fmtUsd(recv)} USD en su Tarjeta Clásica.`);
    } else if (efectivoCurrency === 'cup') {
      lines.push(`Modalidad: Efectivo en CUP en ${selectedMunicipio.provincia}.`);
      lines.push(`Municipio: ${selectedMunicipio.name} (mensajería $${fmtUsd(fixed)} USD).`);
      lines.push(`Yo entrego en El Salvador: $${fmtUsd(pay)} USD total (comisión $${fmtUsd(fee)} – ${pct}%, mensajería $${fmtUsd(fixed)}).`);
      lines.push(`Mi familiar recibe: ${fmtCup(recv)} CUP en efectivo (≈ $${fmtUsd(net)} USD).`);
      lines.push(tasa);
    } else {
      lines.push(`Modalidad: Efectivo en USD en ${selectedMunicipio.provincia}.`);
      lines.push(`Municipio: ${selectedMunicipio.name} (mensajería $${fmtUsd(fixed)} USD).`);
      lines.push(`Yo entrego en El Salvador: $${fmtUsd(pay)} USD total (comisión $${fmtUsd(fee)} – ${pct}%, mensajería $${fmtUsd(fixed)}).`);
      lines.push(`Mi familiar recibe: $${fmtUsd(recv)} USD en billetes.`);
    }

    lines.push('', '¿Podemos coordinar?');
    return waUrl(lines);
  }

  /* ===== Cálculo =====
     La comisión se cobra sobre lo enviado (neto): pago = neto × (1 + comisión) + costo fijo.
     Los CUP se redondean hacia arriba (en Cuba no se manejan centavos). */
  function calcFromPay() {
    const pay = parseNum(el.payUsd.value);
    const comm = getCommission();
    const fixed = getFixedFee();
    const payable = Math.max(pay - fixed, 0);

    if (isUsd()) {
      const net = floor2(payable / (1 + comm));
      return { pay, fee: payable - net, fixed, net, recv: net };
    }
    const net = payable / (1 + comm);
    return { pay, fee: payable - net, fixed, net, recv: Math.ceil(net * rate - 1e-6) };
  }

  function calcFromCup() {
    const comm = getCommission();
    const fixed = getFixedFee();
    let net, recv;

    if (isUsd()) {
      recv = floor2(parseNum(el.recvCup.value));
      net = recv;
    } else {
      recv = Math.ceil(parseNum(el.recvCup.value, true));
      net = recv / rate;
    }
    if (recv <= 0) return { pay: 0, fee: 0, fixed, net: 0, recv: 0 };

    const payable = ceil2(net * (1 + comm));
    return { pay: payable + fixed, fee: payable - net, fixed, net, recv };
  }

  function recompute() {
    if (!rateOk) return;
    let calc;
    if (lastEdited === 'cup') {
      calc = calcFromCup();
      if (document.activeElement !== el.payUsd) {
        el.payUsd.value = calc.pay > 0 ? fmtUsd(calc.pay) : '';
      }
    } else {
      calc = calcFromPay();
      if (document.activeElement !== el.recvCup) {
        el.recvCup.value = calc.recv > 0 ? (isUsd() ? fmtUsd(calc.recv) : fmtCup(calc.recv)) : '';
      }
    }
    updateSummary(calc);
  }

  el.payUsd.addEventListener('input',  () => { lastEdited = 'pay'; recompute(); });
  el.recvCup.addEventListener('input', () => { lastEdited = 'cup'; recompute(); });

  el.whatsappBtn.addEventListener('click', (e) => {
    if (el.whatsappBtn.getAttribute('aria-disabled') === 'true') e.preventDefault();
  });

  setInputsEnabled(false);
  updateRatePill('loading');
  updateTransferNote();
  updateRecvFieldUI();
  updateSummary({ pay: 0, fee: 0, fixed: 0, net: 0, recv: 0 });

  fetchRate();
  setInterval(fetchRate, RATE_TTL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (Date.now() - rateTimestamp) > RATE_TTL_MS) fetchRate();
  });

  /* ===== Recargas: saldo móvil y Nauta Plus ===== */
  let selectedOffer = null;

  // Móviles cubanos: 8 dígitos (los antiguos empiezan por 5, los nuevos por 63)
  const getPhone = () => (el.cubaPhone.value || '').replace(/\D/g, '');
  const phoneValid = (p) => p === '' || /^\d{8}$/.test(p);

  // Mientras se escribe, solo se avisa si el número ya tiene más de 8 dígitos;
  // si está incompleto, se avisa al salir del campo.
  let phoneTouched = false;

  function updateSaldoBtn() {
    const phone = getPhone();
    const ok = phoneValid(phone);
    const clearlyWrong = phone.length > 8;
    const showHint = !ok && (clearlyWrong || phoneTouched);
    setHint(el.saldoHint, showHint ? 'El número debe tener 8 dígitos.' : '');
    setBtn(el.whatsappSaldoBtn, selectedOffer && ok ? buildSaldoUrl(phone) : null);
  }

  function buildSaldoUrl(phone) {
    const { cup, usd, promo, nauta } = selectedOffer;
    const numero = phone ? `Número a recargar: +53 ${phone}` : 'Número a recargar: te lo paso por aquí.';
    if (nauta) {
      return waUrl([
        'Hola Forte, quiero una recarga Nauta Plus para Cuba.',
        '',
        `Plan: ${nauta} días de internet ilimitado por $${fmtUsd(parseFloat(usd))} USD.`,
        numero,
        '',
        '¿Podemos coordinar?',
      ]);
    }
    if (promo) {
      return waUrl([
        'Hola Forte, quiero la recarga en promoción de ETECSA.',
        '',
        `Precio: $${fmtUsd(parseFloat(usd))} USD.`,
        numero,
        '',
        '¿Hay una promoción activa ahora? ¿Qué incluye?',
      ]);
    }
    return waUrl([
      'Hola Forte, quiero una recarga de saldo móvil para Cuba.',
      '',
      `Paquete: ${cup} CUP por $${fmtUsd(parseFloat(usd))} USD.`,
      numero,
      '',
      '¿Podemos coordinar?',
    ]);
  }

  el.offers.forEach(btn => {
    btn.addEventListener('click', () => {
      el.offers.forEach(b => b.classList.toggle('selected', b === btn));
      selectedOffer = {
        cup: btn.dataset.cup,
        usd: btn.dataset.usd,
        promo: btn.dataset.promo === '1',
        nauta: btn.dataset.nauta,
      };
      el.promoNote.hidden = !selectedOffer.promo;
      updateSaldoBtn();
    });
  });

  // La nube de la promo se cierra al tocar fuera de la opción o con Escape
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.offer[data-promo]')) el.promoNote.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') el.promoNote.hidden = true;
  });

  el.cubaPhone.addEventListener('input', () => {
    el.cubaPhone.value = el.cubaPhone.value.replace(/[^\d ]/g, '');
    phoneTouched = false;
    updateSaldoBtn();
  });
  el.cubaPhone.addEventListener('blur', () => {
    phoneTouched = getPhone() !== '';
    updateSaldoBtn();
  });
  el.whatsappSaldoBtn.addEventListener('click', (e) => {
    if (el.whatsappSaldoBtn.getAttribute('aria-disabled') === 'true') e.preventDefault();
  });
})();
