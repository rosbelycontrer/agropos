// Datos del negocio (para el recibo), reglas de puntos y usuarios.
const express = require('express');
const db = require('../db/database');
const configuracion = require('../services/configuracion');
const { cifrarClave } = require('../services/claves');
const { soloAdmin } = require('../middleware/auth');
const { invalido, noEncontrado } = require('../utils/errores');

const router = express.Router();

const PUBLICAS = ['negocio_nombre', 'negocio_nit', 'negocio_direccion', 'negocio_telefono',
  'recibo_mensaje', 'pesos_por_punto', 'valor_punto'];

const soloPublicas = (todo) => Object.fromEntries(PUBLICAS.map((c) => [c, todo[c]]));

// Cualquier usuario con sesión la necesita para el recibo.
router.get('/', (req, res) => res.json(soloPublicas(configuracion.obtenerTodo())));

router.put('/', soloAdmin, (req, res) => {
  const cambios = Object.fromEntries(Object.entries(req.body || {}).filter(([c]) => PUBLICAS.includes(c)));
  for (const c of ['pesos_por_punto', 'valor_punto']) {
    if (cambios[c] !== undefined && !(Number(cambios[c]) >= 0)) throw invalido(`El valor de ${c} no es válido.`);
  }
  res.json(soloPublicas(configuracion.guardar(cambios)));
});

// ---------- Usuarios ----------
router.get('/usuarios', soloAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, nombre, correo, rol, activo, creado_en FROM usuarios ORDER BY nombre').all());
});

router.post('/usuarios', soloAdmin, (req, res) => {
  const { nombre, correo, clave, rol } = req.body || {};
  if (!String(nombre || '').trim()) throw invalido('El nombre es obligatorio.');
  if (!/^\S+@\S+\.\S+$/.test(String(correo || ''))) throw invalido('El correo no es válido.');
  if (String(clave || '').length < 6) throw invalido('La contraseña debe tener al menos 6 caracteres.');
  if (!['admin', 'cajero'].includes(rol)) throw invalido('El rol debe ser admin o cajero.');
  if (db.prepare('SELECT id FROM usuarios WHERE correo = ?').get(correo)) throw invalido('Ese correo ya está registrado.');
  const info = db.prepare('INSERT INTO usuarios (nombre, correo, clave_hash, rol) VALUES (?, ?, ?, ?)')
    .run(nombre.trim(), correo.trim().toLowerCase(), cifrarClave(clave), rol);
  res.status(201).json(db.prepare('SELECT id, nombre, correo, rol, activo FROM usuarios WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/usuarios/:id', soloAdmin, (req, res) => {
  const id = Number(req.params.id);
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!usuario) throw noEncontrado('Usuario no encontrado.');
  const { nombre, rol, activo, clave } = req.body || {};
  if (id === req.usuario.id && (activo === false || rol === 'cajero')) {
    throw invalido('No puedes desactivarte ni quitarte el rol de administrador a ti mismo.');
  }
  if (rol !== undefined && !['admin', 'cajero'].includes(rol)) throw invalido('El rol debe ser admin o cajero.');
  if (clave !== undefined && String(clave).length < 6) throw invalido('La contraseña debe tener al menos 6 caracteres.');
  db.prepare('UPDATE usuarios SET nombre = ?, rol = ?, activo = ?, clave_hash = ? WHERE id = ?').run(
    nombre?.trim() || usuario.nombre,
    rol || usuario.rol,
    activo === undefined ? usuario.activo : activo ? 1 : 0,
    clave ? cifrarClave(clave) : usuario.clave_hash,
    id
  );
  res.json(db.prepare('SELECT id, nombre, correo, rol, activo FROM usuarios WHERE id = ?').get(id));
});

module.exports = router;
