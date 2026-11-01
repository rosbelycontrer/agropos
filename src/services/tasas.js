// Tasa del día: cuántos pesos vale 1 dólar (USD) y 1 bolívar (VES).
const db = require('../db/database');

const ultima = db.prepare('SELECT * FROM tasas_cambio ORDER BY id DESC LIMIT 1');

function actual() {
  const fila = ultima.get();
  return fila
    ? { USD: fila.usd, VES: fila.ves, actualizado: fila.creado_en, usuario: fila.usuario_nombre }
    : { USD: 0, VES: 0, actualizado: null, usuario: null };
}

module.exports = { actual };
