// Registro de ventas. Todos los cálculos se repiten aquí en el servidor
// (no se confía en los totales que manda el navegador).
const crypto = require('crypto');
const db = require('../db/database');
const config = require('../config');
const bascula = require('./bascula');
const sync = require('./sync');
const tasas = require('./tasas');
const configuracion = require('./configuracion');
const Dinero = require('./dinero');
const { invalido, noEncontrado } = require('../utils/errores');
const { aTextoLocal } = require('../utils/fechas');

const MAX_DURACION_SEG = 4 * 3600;

const q = {
  producto: db.prepare('SELECT * FROM productos WHERE id = ? AND activo = 1'),
  cliente: db.prepare('SELECT * FROM clientes WHERE cedula = ?'),
  insVenta: db.prepare(`
    INSERT INTO ventas (uuid, numero, caja_id, usuario_id, usuario_nombre, cliente_id, cliente_cedula, cliente_nombre,
      total_bruto, subtotal, iva, descuento_puntos, redondeo, total, pagado_cop, cambio_cop, tasa_usd, tasa_ves,
      puntos_ganados, puntos_redimidos, inicio_atencion, fin_atencion, duracion_seg, sin_conexion, creado_en)
    VALUES (@uuid, '', @caja_id, @usuario_id, @usuario_nombre, @cliente_id, @cliente_cedula, @cliente_nombre,
      @total_bruto, @subtotal, @iva, @descuento_puntos, @redondeo, @total, @pagado_cop, @cambio_cop, @tasa_usd, @tasa_ves,
      @puntos_ganados, @puntos_redimidos, @inicio_atencion, @fin_atencion, @duracion_seg, @sin_conexion, @creado_en)`),
  numerar: db.prepare('UPDATE ventas SET numero = ? WHERE id = ?'),
  insItem: db.prepare(`
    INSERT INTO venta_items (venta_id, producto_id, plu, nombre, unidad, cantidad, precio_unitario, iva, total, fuente_peso)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  insPago: db.prepare('INSERT INTO pagos (venta_id, metodo, moneda, monto, tasa, monto_cop) VALUES (?, ?, ?, ?, ?, ?)'),
  descontar: db.prepare("UPDATE productos SET stock = stock - ?, actualizado_en = datetime('now','localtime') WHERE id = ?"),
  puntos: db.prepare('UPDATE clientes SET puntos = puntos + ? WHERE id = ?'),
  venta: db.prepare('SELECT * FROM ventas WHERE id = ?'),
  items: db.prepare('SELECT * FROM venta_items WHERE venta_id = ? ORDER BY id'),
  pagos: db.prepare('SELECT * FROM pagos WHERE venta_id = ? ORDER BY id'),
};

// Convierte cada renglón del carrito en una línea con peso o cantidad confiable.
function resolverLineas(items, usuario) {
  if (!Array.isArray(items) || items.length === 0) throw invalido('El carrito está vacío.');
  const capturasUsadas = new Set();
  const lineas = items.map((item, i) => {
    const producto = q.producto.get(Number(item.producto_id));
    if (!producto) throw invalido(`Producto no encontrado (renglón ${i + 1}).`);

    let cantidad;
    let fuente;
    if (producto.unidad === 'und') {
      cantidad = Number(item.cantidad);
      if (!Number.isInteger(cantidad) || cantidad < 1) throw invalido(`Cantidad no válida para ${producto.nombre}.`);
      fuente = 'unidad';
    } else if (item.captura_id) {
      if (capturasUsadas.has(item.captura_id)) throw invalido('Un mismo peso no se puede usar dos veces.');
      const captura = bascula.obtenerCaptura(item.captura_id);
      if (!captura) throw invalido(`El peso de ${producto.nombre} venció. Vuelve a pesarlo.`);
      capturasUsadas.add(item.captura_id);
      cantidad = captura.peso;
      fuente = captura.fuente;
    } else if (item.peso_manual !== undefined) {
      // Solo un administrador puede digitar un peso (por ejemplo, si la báscula se daña).
      if (usuario.rol !== 'admin') throw invalido('El cajero no puede digitar el peso: usa la báscula.');
      cantidad = Math.round(Number(item.peso_manual) * 1000) / 1000;
      if (!(cantidad > 0)) throw invalido(`Peso no válido para ${producto.nombre}.`);
      fuente = 'manual';
    } else {
      throw invalido(`Falta el peso de ${producto.nombre}.`);
    }
    return { producto, cantidad, fuente, precio: producto.precio, iva: producto.iva };
  });
  return { lineas, capturas: [...capturasUsadas] };
}

function crear(datos, usuario) {
  const { lineas, capturas } = resolverLineas(datos.items, usuario);
  const tasasHoy = tasas.actual();

  // Cliente y puntos
  let cliente = null;
  if (datos.cliente_cedula) {
    cliente = q.cliente.get(String(datos.cliente_cedula).replace(/[.\s-]/g, ''));
    if (!cliente) throw invalido('El cliente no está registrado.');
  }
  const valorPunto = configuracion.obtenerNumero('valor_punto');
  const pesosPorPunto = configuracion.obtenerNumero('pesos_por_punto');
  const puntosRedimidos = Math.floor(Number(datos.puntos_redimir) || 0);
  if (puntosRedimidos < 0) throw invalido('Los puntos a redimir no pueden ser negativos.');
  if (puntosRedimidos > 0) {
    if (!cliente) throw invalido('Para redimir puntos hay que identificar al cliente.');
    if (puntosRedimidos > cliente.puntos) throw invalido(`El cliente solo tiene ${cliente.puntos} puntos.`);
  }

  const totales = Dinero.calcularVenta(lineas, puntosRedimidos * valorPunto);
  if (puntosRedimidos * valorPunto > totales.total_bruto) {
    throw invalido('Los puntos a redimir superan el valor de la compra.');
  }
  const cobro = Dinero.calcularCobro(totales.total, datos.pagos, tasasHoy);
  if (cobro.errores.length) throw invalido(cobro.errores[0]);
  if (cobro.falta > 0) throw invalido(`Falta por pagar $${cobro.falta.toLocaleString('es-CO')}.`);

  const puntosGanados = cliente && pesosPorPunto > 0 ? Math.floor(totales.total / pesosPorPunto) : 0;

  // Tiempo de atención (desde el primer producto hasta el cobro)
  const fin = new Date();
  const inicio = datos.inicio_atencion ? new Date(datos.inicio_atencion) : null;
  let duracion = inicio && !isNaN(inicio) ? Math.round((fin - inicio) / 1000) : null;
  if (duracion !== null && (duracion < 0 || duracion > MAX_DURACION_SEG)) duracion = null;

  const guardar = db.transaction(() => {
    const info = q.insVenta.run({
      uuid: crypto.randomUUID(),
      caja_id: config.cajaId,
      usuario_id: usuario.id,
      usuario_nombre: usuario.nombre,
      cliente_id: cliente?.id ?? null,
      cliente_cedula: cliente?.cedula ?? null,
      cliente_nombre: cliente?.nombre ?? null,
      total_bruto: totales.total_bruto,
      subtotal: totales.subtotal,
      iva: totales.iva,
      descuento_puntos: totales.descuento,
      redondeo: totales.redondeo,
      total: totales.total,
      pagado_cop: cobro.pagado_cop,
      cambio_cop: cobro.cambio,
      tasa_usd: tasasHoy.USD || null,
      tasa_ves: tasasHoy.VES || null,
      puntos_ganados: puntosGanados,
      puntos_redimidos: puntosRedimidos,
      inicio_atencion: duracion !== null ? aTextoLocal(inicio) : null,
      fin_atencion: aTextoLocal(fin),
      duracion_seg: duracion,
      sin_conexion: sync.estado.conectada ? 0 : 1,
      creado_en: aTextoLocal(fin),
    });
    const ventaId = info.lastInsertRowid;
    q.numerar.run(`${config.cajaId}-${String(ventaId).padStart(6, '0')}`, ventaId);

    totales.lineas.forEach((l) => {
      q.insItem.run(ventaId, l.producto.id, l.producto.plu, l.producto.nombre, l.producto.unidad,
        l.cantidad, l.precio, l.iva, l.total, l.fuente);
      q.descontar.run(l.cantidad, l.producto.id);
    });
    for (const p of cobro.pagos) {
      q.insPago.run(ventaId, p.metodo, p.moneda, p.monto, p.tasa, p.monto_cop);
    }
    if (cliente) q.puntos.run(puntosGanados - puntosRedimidos, cliente.id);
    return ventaId;
  });

  const ventaId = guardar();
  bascula.consumirCapturas(capturas);
  setImmediate(sync.sincronizar); // intenta subirla de una vez si hay internet
  return obtener(ventaId);
}

function obtener(id) {
  const venta = q.venta.get(Number(id));
  if (!venta) throw noEncontrado('Venta no encontrada.');
  const cliente = venta.cliente_cedula ? q.cliente.get(venta.cliente_cedula) : null;
  return {
    ...venta,
    items: q.items.all(venta.id),
    pagos: q.pagos.all(venta.id),
    desglose_cambio: Dinero.desglosar(venta.cambio_cop),
    cliente_puntos: cliente ? cliente.puntos : null,
  };
}

function listar({ desde, hasta, limite = 50 }) {
  const condiciones = [];
  const params = {};
  if (desde) { condiciones.push('creado_en >= @desde'); params.desde = desde; }
  if (hasta) { condiciones.push("creado_en < date(@hasta, '+1 day')"); params.hasta = hasta; }
  params.limite = Math.min(500, Math.max(1, Number(limite) || 50));
  const donde = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';
  return db.prepare(`
    SELECT id, numero, caja_id, usuario_nombre, cliente_nombre, total, cambio_cop, sin_conexion, sincronizada, creado_en,
      (SELECT group_concat(DISTINCT metodo) FROM pagos WHERE venta_id = ventas.id) AS metodos
    FROM ventas ${donde} ORDER BY id DESC LIMIT @limite`).all(params);
}

module.exports = { crear, obtener, listar };
