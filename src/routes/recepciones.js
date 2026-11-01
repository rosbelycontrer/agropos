// Recepción de mercancía por lotes: suma al stock de cada producto.
const express = require('express');
const db = require('../db/database');
const { soloAdmin } = require('../middleware/auth');
const { invalido } = require('../utils/errores');

const router = express.Router();

const itemsDe = db.prepare(`
  SELECT ri.*, p.nombre, p.plu, p.unidad, p.emoji FROM recepcion_items ri
  JOIN productos p ON p.id = ri.producto_id WHERE ri.recepcion_id = ? ORDER BY ri.id`);

router.get('/', (req, res) => {
  const limite = Math.min(100, Number(req.query.limite) || 20);
  const recepciones = db.prepare('SELECT * FROM recepciones ORDER BY id DESC LIMIT ?').all(limite);
  res.json(recepciones.map((r) => ({ ...r, items: itemsDe.all(r.id) })));
});

router.post('/', soloAdmin, (req, res) => {
  const { proveedor, notas, items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) throw invalido('Agrega al menos un producto al lote.');

  const existe = db.prepare('SELECT id FROM productos WHERE id = ?');
  const limpios = items.map((it, i) => {
    const cantidad = Number(it.cantidad);
    if (!existe.get(Number(it.producto_id))) throw invalido(`Producto no válido en el renglón ${i + 1}.`);
    if (!(cantidad > 0)) throw invalido(`Cantidad no válida en el renglón ${i + 1}.`);
    const costo = it.costo_unitario === '' || it.costo_unitario == null ? null : Number(it.costo_unitario);
    if (costo !== null && !(costo >= 0)) throw invalido(`Costo no válido en el renglón ${i + 1}.`);
    const vence = it.vence && /^\d{4}-\d{2}-\d{2}$/.test(it.vence) ? it.vence : null;
    return { producto_id: Number(it.producto_id), cantidad, costo, vence };
  });

  const registrar = db.transaction(() => {
    const info = db.prepare('INSERT INTO recepciones (lote, proveedor, notas, usuario_nombre) VALUES (?, ?, ?, ?)')
      .run(`TEMP-${Date.now()}`, proveedor || null, notas || null, req.usuario.nombre);
    const id = info.lastInsertRowid;
    const lote = `L-${String(id).padStart(4, '0')}`;
    db.prepare('UPDATE recepciones SET lote = ? WHERE id = ?').run(lote, id);
    const insItem = db.prepare(
      'INSERT INTO recepcion_items (recepcion_id, producto_id, cantidad, costo_unitario, vence) VALUES (?, ?, ?, ?, ?)'
    );
    const sumar = db.prepare(
      "UPDATE productos SET stock = stock + ?, actualizado_en = datetime('now','localtime') WHERE id = ?"
    );
    for (const it of limpios) {
      insItem.run(id, it.producto_id, it.cantidad, it.costo, it.vence);
      sumar.run(it.cantidad, it.producto_id);
    }
    return id;
  });

  const id = registrar();
  const recepcion = db.prepare('SELECT * FROM recepciones WHERE id = ?').get(id);
  res.status(201).json({ ...recepcion, items: itemsDe.all(id) });
});

module.exports = router;
