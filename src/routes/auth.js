// Inicio de sesión con correo y contraseña.
const express = require('express');
const db = require('../db/database');
const { verificarClave } = require('../services/claves');
const { crearToken } = require('../services/tokens');
const { requiereSesion } = require('../middleware/auth');

const router = express.Router();
const buscar = db.prepare('SELECT * FROM usuarios WHERE correo = ? AND activo = 1');

// Freno sencillo contra adivinar contraseñas: 5 intentos fallidos → espera 1 minuto.
const intentos = new Map();

router.post('/login', (req, res) => {
  const correo = String(req.body?.correo || '').trim().toLowerCase();
  const clave = String(req.body?.clave || '');
  if (!correo || !clave) return res.status(400).json({ error: 'Escribe el correo y la contraseña.' });

  const registro = intentos.get(correo);
  if (registro && registro.fallos >= 5 && Date.now() - registro.ultimo < 60000) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera un minuto.' });
  }

  const usuario = buscar.get(correo);
  if (!usuario || !verificarClave(clave, usuario.clave_hash)) {
    intentos.set(correo, { fallos: (registro?.fallos || 0) + 1, ultimo: Date.now() });
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }
  intentos.delete(correo);
  const datos = { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol };
  res.json({ token: crearToken(datos), usuario: datos });
});

router.get('/yo', requiereSesion, (req, res) => {
  const { id, nombre, correo, rol } = req.usuario;
  res.json({ id, nombre, correo, rol });
});

module.exports = router;
