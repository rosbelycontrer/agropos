// Reportes (solo administradores).
(function () {
  const $ = (id) => document.getElementById(id);
  const NOMBRE_FUENTE = { bascula: 'Báscula', simulador: 'Simulador', manual: 'Digitado (admin)' };

  function filtros() {
    const p = new URLSearchParams({ desde: $('rep-desde').value, hasta: $('rep-hasta').value });
    if ($('rep-caja').value) p.set('caja', $('rep-caja').value);
    return p;
  }

  const kpi = (etiqueta, valor, nota = '') =>
    `<div class="kpi"><div class="etiqueta">${etiqueta}</div><div class="valor">${valor}</div><div class="nota">${nota}</div></div>`;

  function tabla(titulo, columnas, filas) {
    return `
      <div class="panel-box">
        <div class="box-header"><span class="box-title">${titulo}</span></div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr>${columnas.map((c) => `<th class="${c.num ? 'num' : ''}">${c.t}</th>`).join('')}</tr></thead>
          <tbody>${filas.length ? filas.map((f) => `<tr>${columnas.map((c) => `<td class="${c.num ? 'num' : ''}">${c.v(f)}</td>`).join('')}</tr>`).join('')
            : `<tr><td colspan="${columnas.length}" class="empty">Sin datos en este período.</td></tr>`}</tbody>
        </table></div>
      </div>`;
  }

  async function ver() {
    try {
      const r = await Api.get('/reportes?' + filtros());
      const totalPagos = r.por_metodo.reduce((s, m) => s + m.monto_cop, 0) || 1;
      $('reporte').innerHTML = `
        <div class="kpis">
          ${kpi('Ventas', Formato.numero(r.resumen.ventas), `Total ${Formato.pesos(r.resumen.total)}`)}
          ${kpi('Ticket promedio', Formato.pesos(r.resumen.ticket_promedio), `IVA ${Formato.pesos(r.resumen.iva)}`)}
          ${kpi('Tiempo promedio de atención', Formato.duracion(r.atencion.promedio_seg),
            r.atencion.medidas ? `Mín ${Formato.duracion(r.atencion.minimo_seg)} · Máx ${Formato.duracion(r.atencion.maximo_seg)}` : 'Sin mediciones')}
          ${kpi('Pesados con báscula', r.pesaje.porcentaje_bascula + '%', `${r.pesaje.con_bascula} de ${r.pesaje.lineas_por_peso} productos por peso`)}
          ${kpi('Ventas sin conexión', Formato.numero(r.conexion.ventas_sin_conexion),
            `${r.conexion.porcentaje}% · ${Formato.pesos(r.conexion.total_sin_conexion)} · ${r.conexion.pendientes_sincronizar} por subir`)}
          ${kpi('Clientes que regresan', r.clientes.porcentaje_recurrentes + '%',
            `${r.clientes.recurrentes} de ${r.clientes.identificados} clientes · ${r.clientes.porcentaje_ventas_con_cliente}% de ventas con cédula`)}
        </div>
        <div class="reportes-grid">
          ${tabla('Ventas por moneda', [
            { t: 'Moneda', v: (f) => NOMBRE_MONEDA[f.moneda] || f.moneda },
            { t: 'Pagos', num: true, v: (f) => f.pagos },
            { t: 'Monto recibido', num: true, v: (f) => Formato.moneda(f.monto, f.moneda) },
            { t: 'En pesos', num: true, v: (f) => Formato.pesos(f.monto_cop) },
          ], r.por_moneda)}
          ${tabla('Ventas por método de pago', [
            { t: 'Método', v: (f) => METODOS[f.metodo]?.nombre || f.metodo },
            { t: 'Pagos', num: true, v: (f) => f.pagos },
            { t: 'En pesos', num: true, v: (f) => Formato.pesos(f.monto_cop) },
            { t: '%', num: true, v: (f) => `${Math.round((f.monto_cop / totalPagos) * 100)}%<div class="barra"><div style="width:${(f.monto_cop / totalPagos) * 100}%"></div></div>` },
          ], r.por_metodo)}
          ${tabla('Origen del peso', [
            { t: 'Origen', v: (f) => NOMBRE_FUENTE[f.fuente] || f.fuente },
            { t: 'Productos', num: true, v: (f) => f.lineas },
            { t: 'Kilos', num: true, v: (f) => Formato.kg(f.kg) },
          ], r.pesaje.detalle)}
          ${tabla('Productos más vendidos', [
            { t: 'Producto', v: (f) => UI.escapar(f.nombre) },
            { t: 'Cantidad', num: true, v: (f) => Formato.cantidad(f.cantidad, f.unidad) },
            { t: 'Total', num: true, v: (f) => Formato.pesos(f.total) },
          ], r.top_productos)}
          ${tabla('Ventas por día', [
            { t: 'Día', v: (f) => f.dia },
            { t: 'Ventas', num: true, v: (f) => f.ventas },
            { t: 'Total', num: true, v: (f) => Formato.pesos(f.total) },
          ], r.por_dia)}
          ${tabla('Por cajero y caja', [
            { t: 'Cajero', v: (f) => UI.escapar(f.cajero || '—') },
            { t: 'Ventas', num: true, v: (f) => f.ventas },
            { t: 'Total', num: true, v: (f) => Formato.pesos(f.total) },
            { t: 'Atención prom.', num: true, v: (f) => Formato.duracion(f.promedio_seg) },
          ], r.por_cajero)}
        </div>`;
      // En la nube se puede filtrar por caja.
      const selector = $('rep-caja');
      const actual = selector.value;
      if (App.estado?.modo === 'nube') {
        $('rep-caja-campo').classList.remove('oculto');
        selector.innerHTML = '<option value="">Todas</option>' + r.por_caja.map((c) =>
          `<option value="${UI.escapar(c.caja_id)}">${UI.escapar(c.caja_id)}</option>`).join('');
        selector.value = actual;
      }
    } catch (e) {
      UI.error(e);
    }
  }

  App.registrar('reportes', {
    iniciar() {
      if (!Sesion.esAdmin) return;
      const hoy = Formato.hoy();
      const hace7 = new Date(Date.now() - 6 * 86400000);
      $('rep-desde').value = `${hace7.getFullYear()}-${String(hace7.getMonth() + 1).padStart(2, '0')}-${String(hace7.getDate()).padStart(2, '0')}`;
      $('rep-hasta').value = hoy;
      $('btn-rep-ver').addEventListener('click', ver);
      document.querySelectorAll('[data-csv]').forEach((b) => b.addEventListener('click', () => {
        const p = filtros();
        p.set('tipo', b.dataset.csv);
        Api.descargar('/reportes/csv?' + p).catch(UI.error.bind(UI));
      }));
    },
    mostrar() {
      if (Sesion.esAdmin) ver();
    },
  });
})();
