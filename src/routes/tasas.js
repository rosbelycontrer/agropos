// Tasa del día (pesos por dólar y por bolívar).
const express = require('express');
const db = require('../db/database');
const tasas = require('../services/tasas');
const { soloAdmin } = require('../middleware/auth');
const { invalido } = require('../utils/errores');

const router = express.Router();

router.get('/', (req, res) => res.json(tasas.actual()));

router.get('/historial', (req, res) => {
  res.json(db.prepare('SELECT * FROM tasas_cambio ORDER BY id DESC LIMIT 30').all());
});

router.post('/', soloAdmin, (req, res) => {
  const usd = Number(req.body?.USD);
  const ves = Number(req.body?.VES);
  if (!(usd > 0) || !(ves > 0)) throw invalido('Las tasas deben ser números mayores que cero.');
  db.prepare('INSERT INTO tasas_cambio (usd, ves, usuario_nombre) VALUES (?, ?, ?)').run(usd, ves, req.usuario.nombre);
  res.status(201).json(tasas.actual());
});

module.exports = router;
