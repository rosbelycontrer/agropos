// Báscula: peso en tiempo real, CERO, TARA, captura del peso y simulador.
const express = require('express');
const bascula = require('../services/bascula');
const configuracion = require('../services/configuracion');
const { soloAdmin } = require('../middleware/auth');
const { invalido } = require('../utils/errores');

const router = express.Router();

router.get('/', (req, res) => res.json(bascula.resumen()));

// Flujo en tiempo real (Server-Sent Events): el navegador recibe cada lectura.
router.get('/flujo', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const enviar = (datos) => res.write(`data: ${JSON.stringify(datos)}\n\n`);
  enviar(bascula.resumen());
  bascula.on('lectura', enviar);
  const latido = setInterval(() => res.write(': latido\n\n'), 15000);
  req.on('close', () => {
    bascula.off('lectura', enviar);
    clearInterval(latido);
  });
});

router.post('/cero', (req, res) => res.json(bascula.hacerCero()));
router.post('/tara', (req, res) => res.json(bascula.hacerTara()));
router.post('/capturar', (req, res) => res.json(bascula.capturar()));

// Solo para pruebas: "pone" un peso en la báscula simulada.
router.post('/simular', (req, res) => res.json(bascula.simular(req.body?.peso)));

const CAMPOS = ['bascula_modo', 'bascula_puerto', 'bascula_baudios', 'bascula_bits_datos',
  'bascula_paridad', 'bascula_bits_parada', 'bascula_comando', 'bascula_intervalo_ms'];

router.get('/configuracion', soloAdmin, (req, res) => {
  const todo = configuracion.obtenerTodo();
  res.json(Object.fromEntries(CAMPOS.map((c) => [c, todo[c]])));
});

router.put('/configuracion', soloAdmin, (req, res) => {
  const cambios = Object.fromEntries(Object.entries(req.body || {}).filter(([c]) => CAMPOS.includes(c)));
  if (cambios.bascula_modo && !['simulador', 'serial'].includes(cambios.bascula_modo)) {
    throw invalido('El modo debe ser "simulador" o "serial".');
  }
  if (cambios.bascula_paridad && !['none', 'even', 'odd'].includes(cambios.bascula_paridad)) {
    throw invalido('La paridad debe ser none, even u odd.');
  }
  configuracion.guardar(cambios);
  bascula.iniciar(); // reconecta con los nuevos datos
  res.json(bascula.resumen());
});

router.get('/puertos', soloAdmin, async (req, res) => {
  res.json(await bascula.listarPuertos());
});

module.exports = router;
