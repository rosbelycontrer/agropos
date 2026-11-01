// Solo en la nube (npm run start:nube): recibe las ventas que suben las cajas.
const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const config = require('../config');

const router = express.Router();

function claveCorrecta(req) {
  const recibida = Buffer.from(String(req.get('x-clave-sync') || ''));
  const esperada = Buffer.from(config.claveSync);
  return recibida.length === esperada.length && crypto.timingSafeEqual(recibida, esperada);
}

router.use((req, res, next) => {
  if (config.modo !== 'nube') return res.status(404).json({ error: 'Este equipo no es el servidor de la nube.' });
  if (!claveCorrecta(req)) return res.status(401).json({ error: 'Clave de sincronización incorrecta.' });
  next();
});

router.get('/ping', (req, res) => res.json({ ok: true, modo: config.modo }));

const q = {
  existe: db.prepare('SELECT id FROM ventas WHERE uuid = ?'),
  cliente: db.prepare('SELECT * FROM clientes WHERE cedula = ?'),
  insCliente: db.prepare('INSERT INTO clientes (cedula, nombre, telefono) VALUES (?, ?, ?)'),
  puntos: db.prepare('UPDATE clientes SET puntos = MAX(0, puntos + ?) WHERE id = ?'),
  producto: db.prepare('SELECT id FROM productos WHERE plu = ?'),
  insVenta: db.prepare(`
    INSERT INTO ventas (uuid, numero, caja_id, usuario_nombre, cliente_id, cliente_cedula, cliente_nombre,
      total_bruto, subtotal, iva, descuento_puntos, redondeo, total, pagado_cop, cambio_cop, tasa_usd, tasa_ves,
      puntos_ganados, puntos_redimidos, inicio_atencion, fin_atencion, duracion_seg, sin_conexion,
      sincronizada, sincronizada_en, creado_en)
    VALUES (@uuid, @numero, @caja_id, @usuario_nombre, @cliente_id, @cliente_cedula, @cliente_nombre,
      @total_bruto, @subtotal, @iva, @descuento_puntos, @redondeo, @total, @pagado_cop, @cambio_cop, @tasa_usd, @tasa_ves,
      @puntos_ganados, @puntos_redimidos, @inicio_atencion, @fin_atencion, @duracion_seg, @sin_conexion,
      1, datetime('now','localtime'), @creado_en)`),
  insItem: db.prepare(`
    INSERT INTO venta_items (venta_id, producto_id, plu, nombre, unidad, cantidad, precio_unitario, iva, total, fuente_peso)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  insPago: db.prepare('INSERT INTO pagos (venta_id, metodo, moneda, monto, tasa, monto_cop) VALUES (?, ?, ?, ?, ?, ?)'),
};

const CAMPOS = ['uuid', 'numero', 'caja_id', 'usuario_nombre', 'cliente_cedula', 'cliente_nombre', 'total_bruto',
  'subtotal', 'iva', 'descuento_puntos', 'redondeo', 'total', 'pagado_cop', 'cambio_cop', 'tasa_usd', 'tasa_ves',
  'puntos_ganados', 'puntos_redimidos', 'inicio_atencion', 'fin_atencion', 'duracion_seg', 'sin_conexion', 'creado_en'];

const guardarVenta = db.transaction((v) => {
  if (q.existe.get(v.uuid)) return; // ya había llegado antes
  let clienteId = null;
  if (v.cliente?.cedula) {
    let cliente = q.cliente.get(v.cliente.cedula);
    if (!cliente) {
      clienteId = q.insCliente.run(v.cliente.cedula, v.cliente.nombre || 'Sin nombre', v.cliente.telefono || null).lastInsertRowid;
    } else {
      clienteId = cliente.id;
    }
    q.puntos.run((v.puntos_ganados || 0) - (v.puntos_redimidos || 0), clienteId);
  }
  const datos = Object.fromEntries(CAMPOS.map((c) => [c, v[c] ?? null]));
  const ventaId = q.insVenta.run({ ...datos, cliente_id: clienteId }).lastInsertRowid;
  for (const i of v.items || []) {
    q.insItem.run(ventaId, q.producto.get(i.plu)?.id ?? null, i.plu, i.nombre, i.unidad, i.cantidad,
      i.precio_unitario, i.iva, i.total, i.fuente_peso);
  }
  for (const p of v.pagos || []) q.insPago.run(ventaId, p.metodo, p.moneda, p.monto, p.tasa, p.monto_cop);
});

router.post('/ventas', (req, res) => {
  const ventas = Array.isArray(req.body?.ventas) ? req.body.ventas : [];
  const aceptadas = [];
  const errores = [];
  for (const v of ventas) {
    try {
      if (!v.uuid) throw new Error('venta sin uuid');
      guardarVenta(v);
      aceptadas.push(v.uuid);
    } catch (e) {
      errores.push(`${v.numero || v.uuid}: ${e.message}`);
    }
  }
  if (aceptadas.length) console.log(`Nube: ${aceptadas.length} venta(s) recibidas de ${req.body.caja_id}`);
  res.json({ aceptadas, errores });
});

module.exports = router;
