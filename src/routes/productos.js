// Productos y categorías: búsqueda por nombre o PLU, crear y editar (admin).
const express = require('express');
const db = require('../db/database');
const { soloAdmin } = require('../middleware/auth');
const { invalido, noEncontrado } = require('../utils/errores');

const router = express.Router();

const SELECT = `
  SELECT p.*, c.nombre AS categoria, (p.stock <= p.stock_minimo) AS stock_bajo
  FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id`;

router.get('/categorias', (req, res) => {
  res.json(db.prepare('SELECT * FROM categorias ORDER BY nombre').all());
});

router.get('/', (req, res) => {
  const condiciones = [];
  const params = {};
  if (req.query.todos !== '1') condiciones.push('p.activo = 1');
  if (req.query.buscar) {
    condiciones.push('(p.nombre LIKE @texto OR p.plu LIKE @inicio)');
    params.texto = `%${req.query.buscar}%`;
    params.inicio = `${req.query.buscar}%`;
  }
  if (req.query.categoria) {
    condiciones.push('p.categoria_id = @categoria');
    params.categoria = Number(req.query.categoria);
  }
  if (req.query.stock_bajo === '1') condiciones.push('p.stock <= p.stock_minimo');
  const donde = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';
  res.json(db.prepare(`${SELECT} ${donde} ORDER BY c.nombre, p.nombre`).all(params));
});

router.get('/:id', (req, res) => {
  const producto = db.prepare(`${SELECT} WHERE p.id = ?`).get(Number(req.params.id));
  if (!producto) throw noEncontrado('Producto no encontrado.');
  res.json(producto);
});

function validar(body, parcial = false) {
  const datos = {};
  const campos = ['plu', 'nombre', 'categoria_id', 'unidad', 'precio', 'iva', 'stock_minimo', 'emoji', 'activo'];
  if (!parcial) campos.push('stock');
  for (const c of campos) if (body[c] !== undefined) datos[c] = body[c];

  if (!parcial || datos.plu !== undefined) {
    datos.plu = String(datos.plu || '').trim();
    if (!/^[0-9A-Za-z-]{1,20}$/.test(datos.plu)) throw invalido('El PLU es obligatorio (solo letras, números o guion).');
  }
  if (!parcial || datos.nombre !== undefined) {
    datos.nombre = String(datos.nombre || '').trim();
    if (!datos.nombre) throw invalido('El nombre es obligatorio.');
  }
  if (!parcial || datos.unidad !== undefined) {
    if (!['kg', 'und'].includes(datos.unidad)) throw invalido('La unidad debe ser "kg" o "und".');
  }
  if (!parcial || datos.precio !== undefined) {
    datos.precio = Number(datos.precio);
    if (!(datos.precio >= 0)) throw invalido('El precio no es válido.');
  }
  for (const c of ['iva', 'stock', 'stock_minimo']) {
    if (datos[c] !== undefined) {
      datos[c] = Number(datos[c]);
      if (!(datos[c] >= 0)) throw invalido(`El valor de ${c} no es válido.`);
    }
  }
  if (datos.categoria_id !== undefined) datos.categoria_id = datos.categoria_id ? Number(datos.categoria_id) : null;
  if (datos.activo !== undefined) datos.activo = datos.activo ? 1 : 0;
  return datos;
}

function manejarDuplicado(e) {
  if (String(e.code).startsWith('SQLITE_CONSTRAINT') && /plu/i.test(e.message)) {
    throw invalido('Ya existe un producto con ese PLU.');
  }
  throw e;
}

router.post('/', soloAdmin, (req, res) => {
  const d = validar(req.body || {});
  try {
    const info = db.prepare(`
      INSERT INTO productos (plu, nombre, categoria_id, unidad, precio, iva, stock, stock_minimo, emoji)
      VALUES (@plu, @nombre, @categoria_id, @unidad, @precio, @iva, @stock, @stock_minimo, @emoji)`).run({
      categoria_id: null, iva: 0, stock: 0, stock_minimo: 0, emoji: null, ...d,
    });
    res.status(201).json(db.prepare(`${SELECT} WHERE p.id = ?`).get(info.lastInsertRowid));
  } catch (e) {
    manejarDuplicado(e);
  }
});

// El stock no se edita aquí: sube con la recepción de mercancía y baja con las ventas.
router.put('/:id', soloAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM productos WHERE id = ?').get(id)) throw noEncontrado('Producto no encontrado.');
  const d = validar(req.body || {}, true);
  const campos = Object.keys(d);
  if (!campos.length) throw invalido('No hay cambios para guardar.');
  try {
    db.prepare(`UPDATE productos SET ${campos.map((c) => `${c} = @${c}`).join(', ')},
      actualizado_en = datetime('now','localtime') WHERE id = @id`).run({ ...d, id });
  } catch (e) {
    manejarDuplicado(e);
  }
  res.json(db.prepare(`${SELECT} WHERE p.id = ?`).get(id));
});

module.exports = router;
