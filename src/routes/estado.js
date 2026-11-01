// Estado general para el panel: conexión con la nube, báscula e inventario.
const express = require('express');
const db = require('../db/database');
const config = require('../config');
const bascula = require('../services/bascula');
const sync = require('../services/sync');

const router = express.Router();

router.get('/', (req, res) => {
  const inventario = db.prepare(`
    SELECT COUNT(*) AS productos,
      COALESCE(SUM(CASE WHEN stock <= stock_minimo THEN 1 ELSE 0 END), 0) AS stock_bajo,
      COALESCE(SUM(CASE WHEN stock <= 0 THEN 1 ELSE 0 END), 0) AS agotados
    FROM productos WHERE activo = 1`).get();
  res.json({
    modo: config.modo,
    caja_id: config.modo === 'caja' ? config.cajaId : null,
    hora_servidor: new Date().toISOString(),
    nube: config.modo === 'caja' ? sync.resumen() : null,
    bascula: config.modo === 'caja' ? bascula.resumen() : null,
    inventario,
  });
});

// Forzar la subida de ventas pendientes ahora mismo.
router.post('/sincronizar', async (req, res) => {
  if (config.modo === 'caja') await sync.sincronizar();
  res.json(sync.resumen());
});

module.exports = router;
