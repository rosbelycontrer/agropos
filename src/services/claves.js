// Cifrado de contraseñas con scrypt (incluido en Node, no requiere instalar nada).
// Se guarda "scrypt$sal$hash": nunca la contraseña original.
const crypto = require('crypto');

const LARGO = 64;

function cifrarClave(clave) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(clave), sal, LARGO);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

function verificarClave(clave, guardada) {
  const [algoritmo, salHex, hashHex] = String(guardada || '').split('$');
  if (algoritmo !== 'scrypt' || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = crypto.scryptSync(String(clave), Buffer.from(salHex, 'hex'), esperado.length);
  return crypto.timingSafeEqual(esperado, calculado);
}

module.exports = { cifrarClave, verificarClave };
