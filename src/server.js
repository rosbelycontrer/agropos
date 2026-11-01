// Punto de entrada de AgroPOS.
//   npm start            → caja (tienda), puerto 3000, base datos/caja.db
//   npm run start:nube   → servidor en la nube, puerto 4000, base datos/nube.db
const path = require('path');
const express = require('express');
const config = require('./config');
const db = require('./db/database');
const bascula = require('./services/bascula');
const sync = require('./services/sync');
const { requiereSesion, soloAdmin } = require('./middleware/auth');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// ---------- API ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/estado', requiereSesion, require('./routes/estado'));
app.use('/api/productos', requiereSesion, require('./routes/productos'));
app.use('/api/clientes', requiereSesion, require('./routes/clientes'));
app.use('/api/tasas', requiereSesion, require('./routes/tasas'));
app.use('/api/bascula', requiereSesion, require('./routes/bascula'));
app.use('/api/ventas', requiereSesion, require('./routes/ventas'));
app.use('/api/recepciones', requiereSesion, require('./routes/recepciones'));
app.use('/api/configuracion', requiereSesion, require('./routes/configuracion'));
app.use('/api/reportes', requiereSesion, soloAdmin, require('./routes/reportes'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta de la API no encontrada.' }));

// ---------- Archivos de la página (todo local, sin CDN) ----------
const fontAwesome = path.join(config.RAIZ, 'node_modules', '@fortawesome', 'fontawesome-free');
app.use('/vendor/fontawesome/css', express.static(path.join(fontAwesome, 'css')));
app.use('/vendor/fontawesome/webfonts', express.static(path.join(fontAwesome, 'webfonts')));
app.get('/js/compartido/dinero.js', (req, res) => res.sendFile(path.join(__dirname, 'services', 'dinero.js')));
app.use(express.static(path.join(config.RAIZ, 'public')));

// ---------- Errores ----------
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Datos mal formados.' });
  const estado = err.estado || 500;
  if (estado >= 500) console.error(err);
  res.status(estado).json({ error: estado >= 500 ? 'Error interno del servidor: ' + err.message : err.message });
});

const servidor = app.listen(config.puerto, () => {
  console.log('');
  console.log(`  AgroPOS (${config.modo === 'nube' ? 'NUBE' : 'CAJA ' + config.cajaId}) listo`);
  console.log(`  Abre en Chrome:  http://localhost:${config.puerto}`);
  console.log(`  Base de datos:   ${config.rutaBD}`);
  if (config.modo === 'caja') console.log(`  Nube:            ${config.nubeUrl}`);
  console.log('  Para detener: Ctrl + C');
  console.log('');
  if (config.modo === 'caja') {
    bascula.iniciar();
    sync.iniciar();
  }
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`El puerto ${config.puerto} ya está en uso. ¿AgroPOS ya está abierto en otra ventana?`);
    process.exit(1);
  }
  throw e;
});

function cerrar() {
  bascula.detener();
  servidor.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
