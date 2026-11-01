// Ventas: registrar, consultar y datos para el recibo.
const express = require('express');
const ventas = require('../services/ventas');

const router = express.Router();

router.post('/', (req, res) => {
  res.status(201).json(ventas.crear(req.body || {}, req.usuario));
});

router.get('/', (req, res) => {
  res.json(ventas.listar(req.query));
});

router.get('/:id', (req, res) => {
  res.json(ventas.obtener(req.params.id));
});

module.exports = router;
