// Fidelización: clientes identificados por cédula y sus puntos.
const express = require('express');
const db = require('../db/database');
const configuracion = require('../services/configuracion');
const { invalido, noEncontrado } = require('../utils/errores');

const router = express.Router();

const porCedula = db.prepare(`
  SELECT c.*, (SELECT COUNT(*) FROM ventas v WHERE v.cliente_cedula = c.cedula) AS compras,
    (SELECT MAX(creado_en) FROM ventas v WHERE v.cliente_cedula = c.cedula) AS ultima_compra
  FROM clientes c WHERE c.cedula = ?`);

const limpiarCedula = (v) => String(v || '').replace(/[.\s-]/g, '');

function reglasPuntos() {
  return {
    pesos_por_punto: configuracion.obtenerNumero('pesos_por_punto'),
    valor_punto: configuracion.obtenerNumero('valor_punto'),
  };
}

router.get('/', (req, res) => {
  const texto = `%${req.query.buscar || ''}%`;
  res.json(db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM ventas v WHERE v.cliente_cedula = c.cedula) AS compras
    FROM clientes c WHERE c.cedula LIKE ? OR c.nombre LIKE ? ORDER BY c.nombre LIMIT 100`).all(texto, texto));
});

router.get('/reglas', (req, res) => res.json(reglasPuntos()));

router.get('/:cedula', (req, res) => {
  const cliente = porCedula.get(limpiarCedula(req.params.cedula));
  if (!cliente) throw noEncontrado('Cliente no registrado.');
  res.json({ ...cliente, ...reglasPuntos() });
});

function validar(body) {
  const cedula = limpiarCedula(body.cedula);
  const nombre = String(body.nombre || '').trim();
  const telefono = String(body.telefono || '').trim() || null;
  if (!/^[0-9A-Za-z]{5,15}$/.test(cedula)) throw invalido('La cédula debe tener entre 5 y 15 dígitos.');
  if (!nombre) throw invalido('El nombre del cliente es obligatorio.');
  return { cedula, nombre, telefono };
}

router.post('/', (req, res) => {
  const d = validar(req.body || {});
  if (porCedula.get(d.cedula)) throw invalido('Ya hay un cliente con esa cédula.');
  db.prepare('INSERT INTO clientes (cedula, nombre, telefono) VALUES (@cedula, @nombre, @telefono)').run(d);
  res.status(201).json({ ...porCedula.get(d.cedula), ...reglasPuntos() });
});

router.put('/:cedula', (req, res) => {
  const cedula = limpiarCedula(req.params.cedula);
  if (!porCedula.get(cedula)) throw noEncontrado('Cliente no registrado.');
  const d = validar({ ...req.body, cedula });
  db.prepare('UPDATE clientes SET nombre = @nombre, telefono = @telefono WHERE cedula = @cedula').run(d);
  res.json({ ...porCedula.get(cedula), ...reglasPuntos() });
});

module.exports = router;
