// Inventario: lista de productos, crear/editar (admin) y recepción de mercancía por lotes.
(function () {
  const $ = (id) => document.getElementById(id);
  let productos = [];
  let categorias = [];

  async function cargar() {
    const inactivos = Sesion.esAdmin && $('inv-inactivos').checked;
    productos = await Api.get('/productos' + (inactivos ? '?todos=1' : ''));
    pintarTabla();
  }

  function pintarTabla() {
    const texto = $('inv-buscar').value.trim().toLowerCase();
    const soloBajo = $('inv-solo-bajo').checked;
    const lista = productos.filter((p) =>
      (!texto || p.nombre.toLowerCase().includes(texto) || p.plu.toLowerCase().startsWith(texto)) &&
      (!soloBajo || p.stock_bajo));
    $('tabla-inventario').innerHTML = lista.map((p) => {
      const estado = !p.activo ? '<span class="badge gris">inactivo</span>'
        : p.stock <= 0 ? '<span class="badge agotado">agotado</span>'
          : p.stock_bajo ? '<span class="badge bajo">stock bajo</span>'
            : '<span class="badge bien">ok</span>';
      return `
        <tr>
          <td>${UI.escapar(p.plu)}</td>
          <td>${UI.escapar(p.emoji || '')} ${UI.escapar(p.nombre)}</td>
          <td>${UI.escapar(p.categoria || '—')}</td>
          <td class="num">${Formato.pesos(p.precio)}/${p.unidad}</td>
          <td class="num">${p.iva}%</td>
          <td class="num">${Formato.cantidad(p.stock, p.unidad)}</td>
          <td class="num">${Formato.cantidad(p.stock_minimo, p.unidad)}</td>
          <td>${estado}</td>
          <td class="${Sesion.esAdmin ? '' : 'oculto'}"><button class="icon-btn" data-editar="${p.id}" title="Editar"><i class="fa-solid fa-pen"></i></button></td>
        </tr>`;
    }).join('') || '<tr><td colspan="9" class="empty">No hay productos.</td></tr>';
  }

  function formularioProducto(p = {}) {
    const nuevo = !p.id;
    const opcionesCat = categorias.map((c) =>
      `<option value="${c.id}" ${c.id === p.categoria_id ? 'selected' : ''}>${UI.escapar(c.nombre)}</option>`).join('');
    UI.modal({
      titulo: nuevo ? 'Nuevo producto' : `Editar ${UI.escapar(p.nombre)}`,
      html: `
        <div class="form-grid">
          <label class="campo">PLU (código) <input class="input" name="plu" value="${UI.escapar(p.plu || '')}" maxlength="20"></label>
          <label class="campo">Emoji <input class="input" name="emoji" value="${UI.escapar(p.emoji || '')}" maxlength="4"></label>
          <label class="campo ancho">Nombre <input class="input" name="nombre" value="${UI.escapar(p.nombre || '')}"></label>
          <label class="campo">Categoría <select class="select" name="categoria_id"><option value="">Sin categoría</option>${opcionesCat}</select></label>
          <label class="campo">Se vende por
            <select class="select" name="unidad">
              <option value="kg" ${p.unidad !== 'und' ? 'selected' : ''}>Peso (kg, con báscula)</option>
              <option value="und" ${p.unidad === 'und' ? 'selected' : ''}>Unidad</option>
            </select></label>
          <label class="campo">Precio (COP, IVA incluido) <input class="input" name="precio" type="number" min="0" value="${p.precio ?? ''}"></label>
          <label class="campo">IVA
            <select class="select" name="iva">${[0, 5, 19].map((v) => `<option value="${v}" ${Number(p.iva || 0) === v ? 'selected' : ''}>${v}%</option>`).join('')}</select></label>
          ${nuevo ? '<label class="campo">Stock inicial <input class="input" name="stock" type="number" min="0" step="any" value="0"></label>' : ''}
          <label class="campo">Stock mínimo (alerta) <input class="input" name="stock_minimo" type="number" min="0" step="any" value="${p.stock_minimo ?? 0}"></label>
          ${nuevo ? '' : `<label class="check ancho"><input type="checkbox" name="activo" ${p.activo ? 'checked' : ''}> Producto activo (se muestra en ventas)</label>
          <p class="muted ancho">Stock actual: ${Formato.cantidad(p.stock, p.unidad)}. El stock sube con la recepción de mercancía y baja con cada venta.</p>`}
        </div>`,
      botones: [
        { texto: 'Cancelar', clase: 'secundario' },
        {
          texto: 'Guardar',
          accion: async (m) => {
            const d = UI.datosFormulario(m.el);
            if (nuevo) await Api.post('/productos', d);
            else await Api.put('/productos/' + p.id, d);
            UI.toast('Producto guardado', 'success');
            await cargar();
            App.vistas.ventas?.recargarProductos?.();
            return true;
          },
        },
      ],
    });
  }

  // ---------- Recepción de mercancía ----------
  async function cargarRecepciones() {
    const lista = await Api.get('/recepciones?limite=15');
    $('lista-recepciones').innerHTML = lista.map((r) => `
      <div class="lote-card">
        <div class="lote-title">Lote ${UI.escapar(r.lote)} · ${Formato.fecha(r.creado_en)}</div>
        <div>${UI.escapar(r.proveedor || 'Sin proveedor')} · ${UI.escapar(r.usuario_nombre || '')}</div>
        ${r.items.slice(0, 6).map((i) => `<div>– ${UI.escapar(i.nombre)}: ${Formato.cantidad(i.cantidad, i.unidad)}${i.vence ? ` (vence ${i.vence})` : ''}</div>`).join('')}
        ${r.items.length > 6 ? `<div>… y ${r.items.length - 6} más</div>` : ''}
      </div>`).join('') || '<p class="empty">No hay recepciones.</p>';
  }

  function renglonLote() {
    const opciones = productos.filter((p) => p.activo).map((p) =>
      `<option value="${p.id}">${UI.escapar(p.plu)} · ${UI.escapar(p.nombre)} (${p.unidad})</option>`).join('');
    return `
      <div class="renglon-lote">
        <select class="select" data-campo="producto_id"><option value="">Producto…</option>${opciones}</select>
        <input class="input" data-campo="cantidad" type="number" min="0" step="any" placeholder="Cantidad">
        <input class="input" data-campo="costo_unitario" type="number" min="0" step="any" placeholder="Costo">
        <input class="input" data-campo="vence" type="date" title="Vence">
        <button class="icon-btn borrar" data-quitar-renglon title="Quitar"><i class="fa-solid fa-xmark"></i></button>
      </div>`;
  }

  function nuevaRecepcion() {
    UI.modal({
      titulo: 'Nuevo lote de mercancía',
      ancho: true,
      html: `
        <div class="form-grid" style="margin-bottom:12px">
          <label class="campo">Proveedor <input class="input" name="proveedor" placeholder="Ej: Cenabastos"></label>
          <label class="campo">Notas <input class="input" name="notas" placeholder="Factura, placa, etc."></label>
        </div>
        <div class="muted" style="margin-bottom:6px">Producto · Cantidad (kg o und) · Costo por kg/und · Vencimiento</div>
        <div id="renglones">${renglonLote()}${renglonLote()}${renglonLote()}</div>
        <button class="btn chico secundario" id="btn-mas-renglon"><i class="fa-solid fa-plus"></i> Otro producto</button>`,
      alAbrir: (m) => {
        m.el.querySelector('#btn-mas-renglon').onclick = () => m.el.querySelector('#renglones').insertAdjacentHTML('beforeend', renglonLote());
        m.el.querySelector('#renglones').addEventListener('click', (e) => {
          if (e.target.closest('[data-quitar-renglon]')) e.target.closest('.renglon-lote').remove();
        });
      },
      botones: [
        { texto: 'Cancelar', clase: 'secundario' },
        {
          texto: '<i class="fa-solid fa-check"></i> Registrar lote',
          accion: async (m) => {
            const items = [...m.el.querySelectorAll('.renglon-lote')].map((r) => {
              const d = {};
              r.querySelectorAll('[data-campo]').forEach((el) => { d[el.dataset.campo] = el.value; });
              return d;
            }).filter((d) => d.producto_id && d.cantidad);
            const cabecera = UI.datosFormulario(m.el.querySelector('.form-grid'));
            const r = await Api.post('/recepciones', { ...cabecera, items });
            UI.toast(`Lote ${r.lote} registrado: ${r.items.length} producto(s)`, 'success');
            await Promise.all([cargar(), cargarRecepciones()]);
            App.vistas.ventas?.recargarProductos?.();
            return true;
          },
        },
      ],
    });
  }

  App.registrar('inventario', {
    async iniciar() {
      categorias = await Api.get('/productos/categorias');
      $('inv-buscar').addEventListener('input', pintarTabla);
      $('inv-solo-bajo').addEventListener('change', pintarTabla);
      $('inv-inactivos').addEventListener('change', cargar);
      $('btn-nuevo-producto').addEventListener('click', () => formularioProducto());
      $('btn-nueva-recepcion').addEventListener('click', nuevaRecepcion);
      $('tabla-inventario').addEventListener('click', (e) => {
        const b = e.target.closest('[data-editar]');
        if (b) formularioProducto(productos.find((p) => p.id === Number(b.dataset.editar)));
      });
    },
    async mostrar() {
      try {
        await Promise.all([cargar(), cargarRecepciones()]);
      } catch (e) {
        UI.error(e);
      }
    },
  });
})();
