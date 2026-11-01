// Token de sesión firmado (similar a JWT) usando solo el módulo crypto de Node.
const crypto = require('crypto');
const { secretoToken } = require('./configuracion');

const DURACION_HORAS = 12;

const b64 = (texto) => Buffer.from(texto).toString('base64url');
const firmar = (datos) => crypto.createHmac('sha256', secretoToken()).update(datos).digest('base64url');

function crearToken(usuario) {
  const carga = {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
    rol: usuario.rol,
    exp: Date.now() + DURACION_HORAS * 3600 * 1000,
  };
  const datos = b64(JSON.stringify(carga));
  return `${datos}.${firmar(datos)}`;
}

function verificarToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [datos, firma] = token.split('.');
  const esperada = firmar(datos);
  if (!firma || firma.length !== esperada.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
  try {
    const carga = JSON.parse(Buffer.from(datos, 'base64url').toString());
    return carga.exp > Date.now() ? carga : null;
  } catch {
    return null;
  }
}

module.exports = { crearToken, verificarToken };
