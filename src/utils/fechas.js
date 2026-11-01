// Fechas en hora local con el mismo formato que usa SQLite: "AAAA-MM-DD HH:MM:SS".
const dos = (n) => String(n).padStart(2, '0');

function aTextoLocal(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ` +
    `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}

function hoy() {
  return aTextoLocal().slice(0, 10);
}

const esFechaDia = (t) => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t);

module.exports = { aTextoLocal, hoy, esFechaDia };
