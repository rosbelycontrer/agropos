// Recibo imprimible de una venta: recibo.html?id=123
(async function () {
  const cont = document.getElementById('recibo');
  const id = new URLSearchParams(location.search).get('id');
  if (!Sesion.token || !id) {
    cont.textContent = 'No se encontró la venta o no hay sesión iniciada.';
    return;
  }
  try {
    const [v, negocio] = await Promise.all([Api.get('/ventas/' + encodeURIComponent(id)), Api.get('/configuracion')]);
    const e = UI.escapar;
    const fila = (izq, der, clase = '') => `<div class="fila ${clase}"><span>${izq}</span><span>${der}</span></div>`;
    const ORIGEN = { bascula: '', simulador: ' (sim)', manual: ' (dig)', unidad: '' };

    cont.innerHTML = `
      <div class="centro">
        <div class="negrita grande">${e(negocio.negocio_nombre)}</div>
        <div>NIT ${e(negocio.negocio_nit)}</div>
        <div>${e(negocio.negocio_direccion)}</div>
        ${negocio.negocio_telefono ? `<div>Tel. ${e(negocio.negocio_telefono)}</div>` : ''}
      </div>
      <div class="separador"></div>
      ${fila('Recibo', e(v.numero))}
      ${fila('Fecha', e(v.creado_en))}
      ${fila('Cajero', e(v.usuario_nombre || ''))}
      ${v.cliente_nombre ? fila('Cliente', e(v.cliente_nombre)) + fila('C.C.', e(v.cliente_cedula)) : ''}
      <div class="separador"></div>
      ${v.items.map((i) => `
        <div class="item">
          <div>${e(i.nombre)}</div>
          ${fila(`<span class="detalle">${i.unidad === 'kg'
            ? `${Formato.kg(i.cantidad)} x ${Formato.pesos(i.precio_unitario)}/kg${ORIGEN[i.fuente_peso] || ''}`
            : `${i.cantidad} x ${Formato.pesos(i.precio_unitario)}`}</span>`, Formato.pesos(i.total))}
        </div>`).join('')}
      <div class="separador"></div>
      ${fila('Total productos', Formato.pesos(v.total_bruto))}
      ${v.descuento_puntos ? fila(`Descuento (${v.puntos_redimidos} pts)`, '-' + Formato.pesos(v.descuento_puntos)) : ''}
      ${v.redondeo ? fila('Redondeo', (v.redondeo > 0 ? '+' : '-') + Formato.pesos(Math.abs(v.redondeo))) : ''}
      ${fila('TOTAL', Formato.pesos(v.total), 'negrita grande')}
      ${fila('Base', Formato.pesos(v.subtotal), 'chico')}
      ${fila('IVA incluido', Formato.pesos(v.iva), 'chico')}
      <div class="separador"></div>
      ${v.pagos.map((p) => fila(
        `${METODOS[p.metodo]?.nombre || p.metodo} ${p.moneda}`,
        Formato.moneda(p.monto, p.moneda) + (p.moneda !== 'COP' ? `<br><span class="chico">(${Formato.pesos(p.monto_cop)} a ${Formato.pesos(p.tasa)})</span>` : ''))).join('')}
      ${fila('Cambio', Formato.pesos(v.cambio_cop), 'negrita')}
      ${v.tasa_usd ? `<div class="chico centro">Tasa: 1 USD = ${Formato.pesos(v.tasa_usd)} · 1 Bs = ${Formato.pesos(v.tasa_ves)}</div>` : ''}
      ${v.cliente_nombre ? `<div class="separador"></div>
        ${fila('Puntos ganados', '+' + v.puntos_ganados)}
        ${v.puntos_redimidos ? fila('Puntos redimidos', '-' + v.puntos_redimidos) : ''}
        ${v.cliente_puntos !== null ? fila('Saldo de puntos', Formato.numero(v.cliente_puntos)) : ''}` : ''}
      <div class="separador"></div>
      <div class="centro">${e(negocio.recibo_mensaje)}</div>
      <div class="centro chico">AgroPOS · ${e(v.caja_id)}</div>`;

    document.title = 'Recibo ' + v.numero;
    if (new URLSearchParams(location.search).has('imprimir')) {
      // Al terminar de imprimir (o cancelar) se cierra sola y el vendedor vuelve a la caja.
      window.addEventListener('afterprint', () => window.close());
      window.print();
    }
  } catch (err) {
    cont.textContent = err.message;
  }
})();
