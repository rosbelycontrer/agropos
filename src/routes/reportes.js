// Reportes (solo administradores) y descarga en CSV.
const express = require('express');
const reportes = require('../services/reportes');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(reportes.generar(req.query));
});

router.get('/csv', (req, res) => {
  const { nombre, contenido } = reportes.exportarCsv(req.query.tipo || 'ventas', req.query);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${nombre}"`,
  });
  res.send(contenido);
});

module.exports = router;
