// Panel de ventas: productos, báscula, carrito, cobro multimoneda y estado.
(function () {
  const $ = (id) => document.getElementById(id);

  const BILLETES = {
    COP: [2000, 5000, 10000, 20000, 50000, 100000],
    USD: [1, 5, 10, 20, 50, 100],
    VES: [50, 100, 200, 500, 1000],
  };

  const st = {
    productos: [],
    categorias: [],
    carrito: [],        // { producto, cantidad, captura_id, fuente }
    cliente: null,
    puntosRedimir: 0,
    reglas: { pesos_por_punto: 1000, valor_punto: 10 },
    metodo: 'efectivo',
    moneda: 'COP',
    pagos: [],          // pagos ya agregados (pagos mixtos)
    tasas: { USD: 0, VES: 0 },
    inicioAtencion: null,
    bascula: null,
    fuenteBascula: null,
    cobrando: false,
  };

  // ---------------- Productos ----------------
  async function cargarProductos() {
    st.productos = await Api.get('/productos');
    pintarProductos();
    pintarStockBajo();
  }

  function filtrarProductos() {
    const texto = $('buscar-producto').value.trim().toLowerCase();
    const cat = $('filtro-categoria').value;
    return st.productos.filter((p) =>
      (!cat || String(p.categoria_id) === cat) &&
      (!texto || p.nombre.toLowerCase().includes(texto) || p.plu.toLowerCase().startsWith(texto)));
  }

  function etiquetaStock(p) {
    if (p.stock <= 0) return '<span class="badge agotado">agotado</span>';
    if (p.stock_bajo) return '<span class="badge bajo">stock bajo</span>';
    return '';
  }

  function pintarProductos() {
    const lista = filtrarProductos();
    const cont = $('lista-productos');
    if (!lista.length) {
      cont.innerHTML = '<p class="empty">No hay productos con esa búsqueda.</p>';
      return;
    }
    cont.innerHTML = lista.map((p) => `
      <button class="product-card" data-id="${p.id}">
        <div class="product-info">
          <div class="product-img">${UI.escapar(p.emoji || '🛒')}</div>
          <div class="product-details">
            <div class="name">${UI.escapar(p.nombre)} ${etiquetaStock(p)}</div>
            <div class="price">${Formato.pesos(p.precio)} / ${p.unidad === 'kg' ? 'kg' : 'und'}</div>
            <div class="plu">PLU ${UI.escapar(p.plu)} · Stock ${Formato.cantidad(p.stock, p.unidad)}</div>
          </div>
        </div>
        <span class="btn-add">${p.unidad === 'kg' ? '<i class="fa-solid fa-scale-balanced"></i> Pesar' : '<i class="fa-solid fa-plus"></i> Agregar'}</span>
      </button>`).join('');
  }

  async function agregarProducto(producto) {
    if (!producto) return;
    try {
      if (producto.unidad === 'kg') {
        const captura = await Api.post('/bascula/capturar');
        st.carrito.push({ producto, cantidad: captura.peso, captura_id: captura.id, fuente: captura.fuente });
        UI.toast(`${producto.nombre}: ${Formato.kg(captura.peso)}`, 'success');
      } else {
        const linea = st.carrito.find((l) => l.producto.id === producto.id);
        if (linea) linea.cantidad += 1;
        else st.carrito.push({ producto, cantidad: 1, fuente: 'unidad' });
      }
      if (producto.stock <= 0) UI.toast(`Atención: ${producto.nombre} no tiene stock registrado.`, 'error');
      if (!st.inicioAtencion) st.inicioAtencion = new Date();
      pintarCarrito();
    } catch (e) {
      UI.error(e);
    }
  }

  // ---------------- Báscula ----------------
  function conectarBascula() {
    if (st.fuenteBascula) st.fuenteBascula.close();
    const fuente = new EventSource('/api/bascula/flujo?token=' + encodeURIComponent(Sesion.token));
    fuente.onmessage = (e) => pintarBascula(JSON.parse(e.data));
    fuente.onerror = () => pintarBascula({ ...(st.bascula || {}), conectada: false, error: 'Sin comunicación con el servidor' });
    st.fuenteBascula = fuente;
  }

  function pintarBascula(b) {
    st.bascula = b;
    const gauge = $('gauge');
    $('peso-valor').textContent = (b.neto ?? 0).toFixed(3);
    gauge.classList.toggle('desconectada', !b.conectada);
    gauge.classList.toggle('inestable', b.conectada && !b.estable);
    $('peso-estable').innerHTML = !b.conectada
      ? `<span class="error-texto"><i class="fa-solid fa-plug-circle-xmark"></i> ${UI.escapar(b.error || 'Desconectada')}</span>`
      : b.estable
        ? '<span class="ok"><i class="fa-solid fa-check"></i> Estable</span>'
        : '<span class="alerta"><i class="fa-solid fa-wave-square"></i> Estabilizando…</span>';
    $('peso-tara').textContent = b.tara > 0 ? `Tara: ${Formato.kg(b.tara)}` : '';
    const pill = $('pill-bascula');
    pill.className = 'pill ' + (b.conectada ? 'ok' : 'mal');
    pill.textContent = b.modo === 'simulador' ? 'Simulador' : b.conectada ? b.puerto : 'Desconectada';
    $('simulador').classList.toggle('oculto', b.modo !== 'simulador');
  }

  async function accionBascula(ruta, cuerpo) {
    try {
      pintarBascula(await Api.post('/bascula/' + ruta, cuerpo));
    } catch (e) {
      UI.error(e);
    }
  }

  // ---------------- Carrito y totales ----------------
  function totales() {
    const lineas = st.carrito.map((l) => ({ precio: l.producto.precio, cantidad: l.cantidad, iva: l.producto.iva }));
    return Dinero.calcularVenta(lineas, st.puntosRedimir * st.reglas.valor_punto);
  }

  function pintarCarrito() {
    const cont = $('carrito');
    $('titulo-carrito').textContent = `Carrito de venta (${st.carrito.length})`;
    if (!st.carrito.length) {
      cont.innerHTML = '<p class="empty">Toca un producto para agregarlo.<br>Los productos por kg se pesan en la báscula.</p>';
    } else {
      cont.innerHTML = st.carrito.map((l, i) => {
        const total = Math.round(l.producto.precio * l.cantidad);
        const spec = l.producto.unidad === 'kg'
          ? `${Formato.kg(l.cantidad)} × ${Formato.pesos(l.producto.precio)}/kg${l.fuente === 'simulador' ? ' · simulado' : ''}`
          : `${l.cantidad} × ${Formato.pesos(l.producto.precio)}`;
        const botonesCantidad = l.producto.unidad === 'und'
          ? `<button class="qty-btn" data-menos="${i}">−</button><button class="qty-btn" data-mas="${i}">+</button>` : '';
        return `
          <div class="cart-item">
            <div class="cart-item-details">
              <span>${UI.escapar(l.producto.emoji || '🛒')}</span>
              <div><div>${UI.escapar(l.producto.nombre)}</div><div class="cart-item-spec">${spec}</div></div>
            </div>
            <div class="cart-item-actions">
              ${botonesCantidad}
              <span class="num">${Formato.pesos(total)}</span>
              <button class="icon-btn borrar" data-quitar="${i}" title="Quitar"><i class="fa-solid fa-xmark"></i></button>
            </div>
          </div>`;
      }).join('');
    }
    pintarCobro();
  }

  function limiteRedimir(t) {
    if (!st.cliente || !st.reglas.valor_punto) return 0;
    return Math.min(st.cliente.puntos, Math.floor(t.total_bruto / st.reglas.valor_punto));
  }

  // Pagos que se enviarían ahora: los agregados + lo escrito en "Recibido".
  function pagosActuales(total) {
    const pagos = [...st.pagos];
    const escrito = Formato.leerNumero($('monto-recibido').value);
    if (escrito > 0) {
      pagos.push({ metodo: st.metodo, moneda: st.moneda, monto: escrito });
    } else if (st.metodo !== 'efectivo' && total > 0) {
      // Tarjeta, transferencia o pago digital: por defecto se cobra exactamente lo que falta.
      const falta = Dinero.calcularCobro(total, pagos, st.tasas).falta;
      if (falta > 0) pagos.push({ metodo: st.metodo, moneda: st.moneda, monto: montoEnMoneda(falta, st.moneda), automatico: true });
    }
    return pagos;
  }

  function montoEnMoneda(pesos, moneda) {
    return moneda === 'COP' ? pesos : Dinero.dePesos(pesos, moneda, st.tasas);
  }

  function pintarCobro() {
    const t = totales();
    $('carrito-total').textContent = Formato.pesos(t.total_bruto);
    $('res-bruto').textContent = Formato.pesos(t.total_bruto);
    $('res-descuento').textContent = '−' + Formato.pesos(t.descuento);
    $('linea-descuento').classList.toggle('oculto', !t.descuento);
    $('res-iva').textContent = Formato.pesos(t.iva);
    $('res-redondeo').textContent = (t.redondeo > 0 ? '+' : t.redondeo < 0 ? '−' : '') + Formato.pesos(Math.abs(t.redondeo));
    $('res-total').textContent = Formato.pesos(t.total);
    $('eq-cop').textContent = Formato.pesos(t.total);
    $('eq-usd').textContent = Formato.moneda(Dinero.dePesos(t.total, 'USD', st.tasas), 'USD');
    $('eq-ves').textContent = Formato.moneda(Dinero.dePesos(t.total, 'VES', st.tasas), 'VES');

    // Pagos agregados
    $('pagos-lista').innerHTML = st.pagos.map((p, i) => `
      <div class="pago-item">
        <span><i class="fa-solid ${METODOS[p.metodo].icono}"></i> ${METODOS[p.metodo].nombre} · ${Formato.moneda(p.monto, p.moneda)}
          ${p.moneda !== 'COP' ? `<span class="muted">(${Formato.pesos(Dinero.aPesos(p.monto, p.moneda, st.tasas))})</span>` : ''}</span>
        <button class="icon-btn borrar" data-quitar-pago="${i}"><i class="fa-solid fa-xmark"></i></button>
      </div>`).join('');

    // Falta / cambio
    const pagos = pagosActuales(t.total);
    const cobro = Dinero.calcularCobro(t.total, pagos, st.tasas);
    const caja = $('cambio');
    if (!st.carrito.length) {
      caja.innerHTML = '';
    } else if (cobro.errores.length && pagos.length) {
      caja.innerHTML = `<div class="cambio-box falta"><span class="error-texto">${UI.escapar(cobro.errores[0])}</span></div>`;
    } else if (!pagos.length || cobro.falta > 0) {
      const falta = pagos.length ? cobro.falta : t.total;
      caja.innerHTML = `
        <div class="cambio-box falta">
          <div>${pagos.length ? 'Falta por pagar' : 'Por cobrar'}</div>
          <div class="cambio-monto">${Formato.pesos(falta)}</div>
          ${st.moneda !== 'COP' ? `<div class="muted">≈ ${Formato.moneda(montoEnMoneda(falta, st.moneda), st.moneda)}</div>` : ''}
        </div>`;
    } else {
      caja.innerHTML = `
        <div class="cambio-box">
          <div>Cambio a entregar (en pesos)</div>
          <div class="cambio-monto">${Formato.pesos(cobro.cambio)}</div>
          <div class="desglose">${cobro.desglose.map((d) =>
            `<span class="${d.tipo}">${d.cantidad} × ${Formato.pesos(d.valor)}</span>`).join('') || '<span>Sin cambio</span>'}</div>
        </div>`;
    }
    $('btn-confirmar').disabled = !st.carrito.length || !cobro.completo || st.cobrando;
    pintarCliente(t);
  }

  function pintarMediosDePago() {
    $('metodos').innerHTML = Object.entries(METODOS).map(([clave, m]) => `
      <button class="pm-btn ${st.metodo === clave ? 'active' : ''}" data-metodo="${clave}">
        <i class="fa-solid ${m.icono}"></i><span>${m.nombre}</span></button>`).join('');
    $('monedas').innerHTML = Dinero.MONEDAS.map((m) =>
      `<button class="moneda-btn ${st.moneda === m ? 'active' : ''}" data-moneda="${m}">${m}</button>`).join('');
    $('billetes-rapidos').innerHTML =
      `<button class="btn chico contorno" data-exacto>Exacto</button>` +
      BILLETES[st.moneda].map((b) => `<button class="btn chico secundario" data-billete="${b}">+${Formato.moneda(b, st.moneda).replace(',00', '')}</button>`).join('') +
      `<button class="btn chico contorno" data-limpiar title="Borrar"><i class="fa-solid fa-delete-left"></i></button>`;
    $('monto-recibido').placeholder = `Recibido en ${NOMBRE_MONEDA[st.moneda]}`;
  }

  function agregarPagoEscrito() {
    const monto = Formato.leerNumero($('monto-recibido').value);
    if (!(monto > 0)) {
      UI.toast('Escribe el monto recibido.', 'error');
      return;
    }
    st.pagos.push({ metodo: st.metodo, moneda: st.moneda, monto });
    $('monto-recibido').value = '';
    pintarCobro();
  }

  // ---------------- Cliente y puntos ----------------
  async function buscarCliente() {
    const cedula = $('cedula').value.replace(/[.\s-]/g, '');
    if (!cedula) return;
    try {
      st.cliente = await Api.get('/clientes/' + encodeURIComponent(cedula));
      st.reglas = { pesos_por_punto: st.cliente.pesos_por_punto, valor_punto: st.cliente.valor_punto };
      st.puntosRedimir = 0;
      pintarCobro();
    } catch (e) {
      if (/no registrado/i.test(e.message)) Clientes.formulario({ cedula }, (nuevo) => { st.cliente = nuevo; st.puntosRedimir = 0; pintarCobro(); });
      else UI.error(e);
    }
  }

  function pintarCliente(t) {
    const cont = $('cliente-info');
    if (!st.cliente) {
      cont.innerHTML = '';
      return;
    }
    const maximo = limiteRedimir(t);
    if (st.puntosRedimir > maximo) st.puntosRedimir = maximo;
    const ganara = st.reglas.pesos_por_punto ? Math.floor(t.total / st.reglas.pesos_por_punto) : 0;
    const campoActivo = document.activeElement?.id === 'puntos-redimir';
    if (campoActivo) return; // no redibujar mientras escribe
    cont.innerHTML = `
      <div class="cliente-datos">
        <div><strong>${UI.escapar(st.cliente.nombre)}</strong><br>
          <span class="muted">CC ${UI.escapar(st.cliente.cedula)} · <span class="puntos">${Formato.numero(st.cliente.puntos)} pts</span>
          ${ganara ? ` · ganará ${ganara}` : ''}</span></div>
        <button class="icon-btn borrar" id="btn-quitar-cliente" title="Quitar cliente"><i class="fa-solid fa-xmark"></i></button>
      </div>
      ${maximo > 0 ? `
      <div class="cliente-datos">
        <span class="muted">Redimir puntos (máx. ${maximo} = ${Formato.pesos(maximo * st.reglas.valor_punto)})</span>
        <input class="input" id="puntos-redimir" type="number" min="0" max="${maximo}" value="${st.puntosRedimir || ''}" style="width:90px" placeholder="0">
      </div>` : ''}`;
  }

  // ---------------- Confirmar venta ----------------
  async function confirmar() {
    const t = totales();
    const pagos = pagosActuales(t.total).map(({ metodo, moneda, monto }) => ({ metodo, moneda, monto }));
    const cobro = Dinero.calcularCobro(t.total, pagos, st.tasas);
    if (!st.carrito.length || !cobro.completo) return;
    st.cobrando = true;
    $('btn-confirmar').disabled = true;
    try {
      const venta = await Api.post('/ventas', {
        items: st.carrito.map((l) => l.producto.unidad === 'kg'
          ? { producto_id: l.producto.id, captura_id: l.captura_id }
          : { producto_id: l.producto.id, cantidad: l.cantidad }),
        cliente_cedula: st.cliente?.cedula || null,
        puntos_redimir: st.puntosRedimir,
        pagos,
        inicio_atencion: st.inicioAtencion?.toISOString(),
      });
      limpiarVenta();
      mostrarVentaHecha(venta);
      cargarProductos();
      cargarUltimasVentas();
      App.actualizarEstado().catch(() => {});
    } catch (e) {
      UI.error(e);
    } finally {
      st.cobrando = false;
      pintarCobro();
    }
  }

  function mostrarVentaHecha(v) {
    const desglose = v.desglose_cambio.map((d) => `<span class="${d.tipo}">${d.cantidad} × ${Formato.pesos(d.valor)}</span>`).join('');
    UI.modal({
      titulo: `<i class="fa-regular fa-circle-check ok"></i> Venta ${UI.escapar(v.numero)} registrada`,
      html: `
        <div class="summary-line total" style="border:none;margin:0"><span>Total</span><span>${Formato.pesos(v.total)}</span></div>
        <div class="summary-line"><span>Recibido</span><span>${Formato.pesos(v.pagado_cop)}</span></div>
        <div class="cambio-box" style="margin-top:10px">
          <div>Cambio a entregar</div>
          <div class="cambio-monto">${Formato.pesos(v.cambio_cop)}</div>
          <div class="desglose">${desglose || '<span>Sin cambio</span>'}</div>
        </div>
        ${v.cliente_nombre ? `<p class="muted">${UI.escapar(v.cliente_nombre)}: +${v.puntos_ganados} puntos${v.puntos_redimidos ? `, −${v.puntos_redimidos} redimidos` : ''} · saldo ${v.cliente_puntos} pts</p>` : ''}
        ${v.sin_conexion ? '<p class="muted"><i class="fa-solid fa-cloud-arrow-up"></i> Guardada sin conexión: se subirá a la nube cuando vuelva internet.</p>' : ''}`,
      botones: [
        { texto: 'Cerrar', clase: 'secundario' },
        { texto: '<i class="fa-solid fa-print"></i> Imprimir recibo', accion: () => { abrirRecibo(v.id); return true; } },
      ],
    });
  }

  function abrirRecibo(id) {
    window.open(`/recibo.html?id=${id}`, 'recibo', 'width=420,height=700');
  }

  function limpiarVenta() {
    st.carrito = [];
    st.cliente = null;
    st.puntosRedimir = 0;
    st.pagos = [];
    st.metodo = 'efectivo';
    st.moneda = 'COP';
    st.inicioAtencion = null;
    $('cedula').value = '';
    $('monto-recibido').value = '';
    pintarMediosDePago();
    pintarCarrito();
  }

  // ---------------- Tasa del día ----------------
  async function cargarTasas() {
    st.tasas = await Api.get('/tasas');
    $('tasa-texto').textContent = st.tasas.USD
      ? `Tasa: 1 USD = ${Formato.pesos(st.tasas.USD)} · 1 Bs = ${Formato.pesos(st.tasas.VES)}`
      : 'Sin tasa del día';
    pintarCobro();
  }

  function editarTasa() {
    UI.modal({
      titulo: 'Tasa del día',
      html: `
        <div class="form-grid">
          <label class="campo">Pesos por 1 dólar (USD)<input class="input" name="USD" type="number" min="0" step="any" value="${st.tasas.USD || ''}"></label>
          <label class="campo">Pesos por 1 bolívar (VES)<input class="input" name="VES" type="number" min="0" step="any" value="${st.tasas.VES || ''}"></label>
          <p class="muted ancho">Última actualización: ${Formato.fecha(st.tasas.actualizado)} ${st.tasas.usuario ? '· ' + UI.escapar(st.tasas.usuario) : ''}</p>
        </div>`,
      botones: [
        { texto: 'Cancelar', clase: 'secundario' },
        {
          texto: 'Guardar tasa',
          accion: async (m) => {
            const d = UI.datosFormulario(m.el);
            await Api.post('/tasas', { USD: Number(d.USD), VES: Number(d.VES) });
            await cargarTasas();
            UI.toast('Tasa del día actualizada', 'success');
            return true;
          },
        },
      ],
    });
  }

  // ---------------- Columna de estado ----------------
  function itemEstado(ok, titulo, detalle, icono) {
    return `
      <div class="estado-item">
        <i class="fa-solid fa-circle ${ok ? 'ok' : 'alerta'}"></i>
        <div><div class="titulo"><i class="fa-solid ${icono}"></i> ${titulo}</div><div class="detalle">${detalle}</div></div>
      </div>`;
  }

  function pintarEstado(e) {
    const nube = e.nube || {};
    const b = e.bascula || st.bascula || {};
    $('estado-lista').innerHTML = [
      itemEstado(true, 'Caja ' + UI.escapar(e.caja_id || ''), 'Servidor local funcionando', 'fa-desktop'),
      itemEstado(nube.conectada, nube.conectada ? 'Nube conectada' : 'Sin conexión a la nube',
        (nube.pendientes ? `${nube.pendientes} venta(s) por subir` : 'Todo sincronizado') +
        (nube.error && !nube.conectada ? `<br>${UI.escapar(nube.error)}` : '') +
        (nube.ultimaSincronizacion ? `<br>Última subida: ${Formato.fecha(nube.ultimaSincronizacion)}` : ''), 'fa-cloud'),
      itemEstado(b.conectada, b.modo === 'simulador' ? 'Báscula: simulador' : `Báscula ${UI.escapar(b.puerto || '')}`,
        b.conectada ? 'Recibiendo peso' : UI.escapar(b.error || 'Desconectada'), 'fa-scale-balanced'),
      itemEstado(!e.inventario.stock_bajo, 'Inventario',
        `${e.inventario.productos} productos · ${e.inventario.stock_bajo} con stock bajo · ${e.inventario.agotados} agotados`, 'fa-boxes-stacked'),
    ].join('');
  }

  function pintarStockBajo() {
    const bajos = st.productos.filter((p) => p.stock_bajo).sort((a, b) => a.stock / (a.stock_minimo || 1) - b.stock / (b.stock_minimo || 1));
    $('n-stock-bajo').textContent = bajos.length;
    $('lista-stock-bajo').innerHTML = bajos.slice(0, 8).map((p) => `
      <div class="fila"><span>${UI.escapar(p.emoji || '')} ${UI.escapar(p.nombre)}</span>
        <span class="${p.stock <= 0 ? 'error-texto' : 'alerta'} num">${Formato.cantidad(p.stock, p.unidad)}</span></div>`).join('')
      || '<p class="empty">Todo el inventario está bien.</p>';
  }

  async function cargarUltimasVentas() {
    const ventas = await Api.get('/ventas?limite=6');
    $('ultimas-ventas').innerHTML = ventas.map((v) => `
      <div class="fila">
        <span>${UI.escapar(v.numero.split('-').pop())} · ${UI.escapar(String(v.creado_en).slice(11, 16))}
          ${v.sincronizada ? '' : '<i class="fa-solid fa-cloud-arrow-up alerta" title="Pendiente por subir"></i>'}</span>
        <span class="num">${Formato.pesos(v.total)}
          <button class="icon-btn" data-recibo="${v.id}" title="Reimprimir recibo"><i class="fa-solid fa-print"></i></button></span>
      </div>`).join('') || '<p class="empty">Aún no hay ventas.</p>';
  }

  // ---------------- Eventos ----------------
  function conectarEventos() {
    $('buscar-producto').addEventListener('input', pintarProductos);
    $('buscar-producto').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const texto = e.target.value.trim().toLowerCase();
        const lista = filtrarProductos();
        const exacto = st.productos.find((p) => p.plu.toLowerCase() === texto) || (lista.length === 1 ? lista[0] : null);
        if (exacto) {
          agregarProducto(exacto);
          e.target.value = '';
          pintarProductos();
        }
      } else if (e.key === 'Escape') {
        e.target.value = '';
        pintarProductos();
      }
    });
    $('filtro-categoria').addEventListener('change', pintarProductos);
    $('lista-productos').addEventListener('click', (e) => {
      const card = e.target.closest('[data-id]');
      if (card) agregarProducto(st.productos.find((p) => p.id === Number(card.dataset.id)));
    });

    $('btn-cero').addEventListener('click', () => accionBascula('cero'));
    $('btn-tara').addEventListener('click', () => accionBascula('tara'));
    $('simulador').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sim]');
      if (!b) return;
      const peso = b.dataset.sim === 'azar' ? Math.round((0.2 + Math.random() * 3.3) * 1000) / 1000 : Number(b.dataset.sim);
      accionBascula('simular', { peso });
    });

    $('carrito').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.quitar !== undefined) st.carrito.splice(Number(b.dataset.quitar), 1);
      if (b.dataset.mas !== undefined) st.carrito[Number(b.dataset.mas)].cantidad += 1;
      if (b.dataset.menos !== undefined) {
        const l = st.carrito[Number(b.dataset.menos)];
        if (l.cantidad > 1) l.cantidad -= 1;
      }
      if (!st.carrito.length) st.inicioAtencion = null;
      pintarCarrito();
    });
    $('btn-vaciar').addEventListener('click', async () => {
      if (st.carrito.length && (await UI.confirmar('Vaciar carrito', '¿Quitar todos los productos del carrito?'))) limpiarVenta();
    });

    $('btn-buscar-cliente').addEventListener('click', buscarCliente);
    $('cedula').addEventListener('keydown', (e) => { if (e.key === 'Enter') buscarCliente(); });
    $('cliente-info').addEventListener('click', (e) => {
      if (e.target.closest('#btn-quitar-cliente')) {
        st.cliente = null;
        st.puntosRedimir = 0;
        $('cedula').value = '';
        pintarCobro();
      }
    });
    $('cliente-info').addEventListener('input', (e) => {
      if (e.target.id !== 'puntos-redimir') return;
      const maximo = limiteRedimir(Dinero.calcularVenta(st.carrito.map((l) => ({ precio: l.producto.precio, cantidad: l.cantidad, iva: l.producto.iva })), 0));
      st.puntosRedimir = Math.max(0, Math.min(maximo, Math.floor(Number(e.target.value) || 0)));
      pintarCobro();
    });
    $('cliente-info').addEventListener('focusout', () => setTimeout(pintarCobro, 0));

    $('metodos').addEventListener('click', (e) => {
      const b = e.target.closest('[data-metodo]');
      if (!b) return;
      st.metodo = b.dataset.metodo;
      pintarMediosDePago();
      pintarCobro();
    });
    $('monedas').addEventListener('click', (e) => {
      const b = e.target.closest('[data-moneda]');
      if (!b) return;
      st.moneda = b.dataset.moneda;
      $('monto-recibido').value = '';
      pintarMediosDePago();
      pintarCobro();
    });
    $('billetes-rapidos').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const input = $('monto-recibido');
      if (b.dataset.limpiar !== undefined) {
        input.value = '';
      } else if (b.dataset.exacto !== undefined) {
        const t = totales();
        const falta = Dinero.calcularCobro(t.total, st.pagos, st.tasas).falta || (st.pagos.length ? 0 : t.total);
        const monto = st.moneda === 'COP' ? falta : Math.ceil((falta / Dinero.tasaDe(st.moneda, st.tasas)) * 100) / 100;
        input.value = monto ? Formato.numero(monto, st.moneda === 'COP' ? 0 : 2) : '';
      } else {
        const actual = Formato.leerNumero(input.value);
        input.value = Formato.numero(actual + Number(b.dataset.billete), st.moneda === 'COP' ? 0 : 2);
      }
      pintarCobro();
    });
    $('monto-recibido').addEventListener('input', pintarCobro);
    $('monto-recibido').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !$('btn-confirmar').disabled) confirmar();
    });
    $('btn-agregar-pago').addEventListener('click', agregarPagoEscrito);
    $('pagos-lista').addEventListener('click', (e) => {
      const b = e.target.closest('[data-quitar-pago]');
      if (b) {
        st.pagos.splice(Number(b.dataset.quitarPago), 1);
        pintarCobro();
      }
    });
    $('btn-confirmar').addEventListener('click', confirmar);
    $('btn-tasa').addEventListener('click', editarTasa);

    $('btn-sincronizar').addEventListener('click', async () => {
      try {
        const r = await Api.post('/estado/sincronizar');
        UI.toast(r.conectada ? `Sincronizado. Pendientes: ${r.pendientes}` : r.error || 'Sin conexión con la nube', r.conectada ? 'success' : 'error');
        App.actualizarEstado();
        cargarUltimasVentas();
      } catch (e) {
        UI.error(e);
      }
    });
    $('ultimas-ventas').addEventListener('click', (e) => {
      const b = e.target.closest('[data-recibo]');
      if (b) abrirRecibo(b.dataset.recibo);
    });

    document.addEventListener('keydown', (e) => {
      if (App.vistaActual !== 'ventas') return;
      if (e.key === 'F2') {
        e.preventDefault();
        $('buscar-producto').focus();
      }
    });
  }

  App.registrar('ventas', {
    async iniciar() {
      conectarEventos();
      pintarMediosDePago();
      st.categorias = await Api.get('/productos/categorias');
      $('filtro-categoria').innerHTML = '<option value="">Todas las categorías</option>' +
        st.categorias.map((c) => `<option value="${c.id}">${UI.escapar(c.emoji || '')} ${UI.escapar(c.nombre)}</option>`).join('');
      Api.get('/clientes/reglas').then((r) => { st.reglas = r; }).catch(() => {});
      await Promise.all([cargarProductos(), cargarTasas(), cargarUltimasVentas()]);
      pintarCarrito();
      conectarBascula();
      if (App.estado) pintarEstado(App.estado);
      setInterval(() => {
        cargarProductos().catch(() => {});
        cargarTasas().catch(() => {});
      }, 60000);
    },
    mostrar() {
      $('buscar-producto').focus();
    },
    pintarEstado,
    hayCarrito: () => st.carrito.length > 0,
    recargarProductos: () => cargarProductos(),
  });
})();
