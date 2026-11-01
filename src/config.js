// Configuración general. Los valores se pueden cambiar en el archivo .env
// (ver .env.ejemplo). Si no existe .env se usan los valores por defecto.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

function cargarEnv() {
  const archivo = path.join(RAIZ, '.env');
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#') || !limpia.includes('=')) continue;
    const i = limpia.indexOf('=');
    const clave = limpia.slice(0, i).trim();
    const valor = limpia.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[clave] === undefined) process.env[clave] = valor;
  }
}

cargarEnv();

const esNube = process.argv.includes('--nube') || process.env.MODO === 'nube';

module.exports = {
  RAIZ,
  modo: esNube ? 'nube' : 'caja',
  puerto: Number(esNube ? process.env.PUERTO_NUBE || 4000 : process.env.PUERTO_CAJA || 3000),
  rutaBD: esNube
    ? process.env.RUTA_BD_NUBE || path.join(RAIZ, 'datos', 'nube.db')
    : process.env.RUTA_BD_CAJA || path.join(RAIZ, 'datos', 'caja.db'),
  cajaId: process.env.CAJA_ID || 'CAJA-01',
  nubeUrl: (process.env.NUBE_URL || 'http://localhost:4000').replace(/\/+$/, ''),
  claveSync: process.env.CLAVE_SYNC || 'cambiar-esta-clave',
  intervaloSyncSeg: Number(process.env.INTERVALO_SYNC_SEG || 15),
};
