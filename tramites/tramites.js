(() => {
  'use strict';

  // Número de WhatsApp al que llegan las solicitudes de documentos (Rocío, Cuba).
  // Cámbialo aquí si las solicitudes deben ir a otro número.
  const WA_NUMBER = '5355262079';
  const GREETING = 'Hola Rocío, quiero solicitar estos documentos de Cuba:';
  const SV_FEE_PER_DOC = 15; // costo de traslado a El Salvador, por documento

  const rows       = Array.from(document.querySelectorAll('.tramite-row[data-price]'));
  const itemsEl    = document.getElementById('tramiteItems');
  const emptyEl    = document.getElementById('tramiteEmpty');
  const deliveryEl = document.getElementById('tramiteDelivery');
  const muniWrap   = document.getElementById('tramiteMunicipioWrap');
  const muniSelect = document.getElementById('tramiteMunicipio');
  const msgRow     = document.getElementById('tramiteMsgRow');
  const msgLabel   = document.getElementById('tramiteMsgLabel');
  const msgEl      = document.getElementById('tramiteMsg');
  const totalRow   = document.getElementById('tramiteTotalRow');
  const totalEl    = document.getElementById('tramiteTotal');
  const deliveryNote = document.getElementById('tramiteDeliveryNote');
  const waBtn      = document.getElementById('tramiteWaBtn');

  if (!rows.length || !waBtn) return;

  const fmt = (n) => '$' + new Intl.NumberFormat('en-US').format(Math.round(n));

  const state = rows.map((row) => ({
    row,
    name:  row.dataset.name,
    price: Number(row.dataset.price),
    qty:   0,
    qtyEl: row.querySelector('.t-qty'),
  }));

  let place = null;            // null (sin entrega) | 'sv' (El Salvador) | 'cuba'
  let municipio = null;        // { name, cost } | null

  const dtoggles = Array.from(deliveryEl.querySelectorAll('.dtoggle'));

  function getDeliveryCost(count) {
    if (place === 'sv') return SV_FEE_PER_DOC * count;
    if (place === 'cuba' && municipio) return municipio.cost;
    return 0;
  }

  function docWord(n) {
    return n === 1 ? 'documento' : 'documentos';
  }

  function buildUrl(docsTotal, count, deliveryCost, total) {
    const lines = [GREETING, ''];
    state.forEach((it) => {
      if (it.qty > 0) lines.push(`• ${it.name} ×${it.qty} — ${fmt(it.qty * it.price)}`);
    });
    lines.push('');
    lines.push(`Documentos: ${fmt(docsTotal)}`);
    if (place === 'cuba' && municipio) {
      lines.push(`Entrega en Cuba: ${municipio.name} (mensajería ${fmt(deliveryCost)}).`);
    } else if (place === 'sv') {
      lines.push(`Traslado a El Salvador: ${fmt(deliveryCost)} ($15 × ${count} ${docWord(count)}).`);
    } else {
      lines.push('Entrega: a coordinar por WhatsApp.');
    }
    lines.push(`Total a pagar: ${fmt(total)} USD.`);
    lines.push('', '¿Podemos coordinar?');
    return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  function render() {
    let docsTotal = 0;
    let count = 0;
    itemsEl.innerHTML = '';

    state.forEach((it) => {
      it.qtyEl.textContent = it.qty;
      it.row.classList.toggle('active', it.qty > 0);
      if (it.qty > 0) {
        const sub = it.qty * it.price;
        docsTotal += sub;
        count += it.qty;
        const li = document.createElement('li');
        const left = document.createElement('span');
        left.innerHTML = `${it.name} <strong>×${it.qty}</strong>`;
        const right = document.createElement('span');
        right.textContent = fmt(sub);
        li.append(left, right);
        itemsEl.appendChild(li);
      }
    });

    const has = count > 0;
    const deliveryCost = getDeliveryCost(count);
    const total = docsTotal + deliveryCost;

    emptyEl.hidden = has;
    deliveryEl.hidden = !has;
    totalRow.hidden = !has;

    // Línea de costo de entrega: $15/doc en El Salvador, o mensajería en Cuba
    let showMsg = false;
    if (has && place === 'sv') {
      showMsg = true;
      msgLabel.textContent = `Traslado a El Salvador ($15 × ${count})`;
    } else if (has && place === 'cuba' && municipio) {
      showMsg = true;
      msgLabel.textContent = 'Mensajería en Cuba';
    }
    msgRow.hidden = !showMsg;
    if (showMsg) msgEl.textContent = fmt(deliveryCost);

    // Nota de entrega (dinámica)
    if (has && place === null) {
      deliveryNote.hidden = false;
      deliveryNote.textContent = 'Entrega opcional: si no eliges una opción, coordinamos la entrega contigo por WhatsApp.';
    } else if (has && place === 'sv') {
      deliveryNote.hidden = false;
      deliveryNote.textContent = 'Entrega en El Salvador: $15 USD por documento. Coordinamos en San Salvador según el próximo viaje disponible.';
    } else {
      deliveryNote.hidden = true;
    }

    totalEl.textContent = fmt(total);

    // El botón se habilita salvo que se elija "En Cuba" sin municipio
    const ready = has && !(place === 'cuba' && !municipio);
    if (ready) {
      waBtn.removeAttribute('aria-disabled');
      waBtn.href = buildUrl(docsTotal, count, deliveryCost, total);
    } else {
      waBtn.setAttribute('aria-disabled', 'true');
      waBtn.href = '#';
    }
  }

  // Steppers
  state.forEach((it) => {
    it.row.querySelector('.t-plus').addEventListener('click', () => {
      it.qty += 1;
      render();
    });
    it.row.querySelector('.t-minus').addEventListener('click', () => {
      if (it.qty > 0) it.qty -= 1;
      render();
    });
  });

  // Toggle de lugar de entrega: clic activa; clic en el activo lo desactiva
  dtoggles.forEach((btn) => {
    btn.addEventListener('click', () => {
      const clicked = btn.dataset.place;
      place = (place === clicked) ? null : clicked;
      dtoggles.forEach((b) => b.classList.toggle('active', b.dataset.place === place));
      muniWrap.hidden = place !== 'cuba';
      if (place !== 'cuba') {
        municipio = null;
        muniSelect.value = '';
      }
      render();
    });
  });

  // Selección de municipio
  muniSelect.addEventListener('change', () => {
    const val = muniSelect.value;
    if (val) {
      const [name, cost] = val.split('|');
      municipio = { name, cost: Number(cost) };
    } else {
      municipio = null;
    }
    render();
  });

  waBtn.addEventListener('click', (e) => {
    if (waBtn.getAttribute('aria-disabled') === 'true') e.preventDefault();
  });

  render();
})();
