// Protege las rutas: exige sesión iniciada y, si se pide, rol de administrador.
const db = require('../db/database');
const { verificarToken } = require('../services/tokens');

const buscarActivo = db.prepare('SELECT activo FROM usuarios WHERE id = ?');

function requiereSesion(req, res, next) {
  const cabecera = req.get('authorization') || '';
  // El flujo de la báscula (EventSource) no permite cabeceras, por eso se acepta ?token=
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : req.query.token;
  const usuario = verificarToken(token);
  if (!usuario || !buscarActivo.get(usuario.id)?.activo) {
    return res.status(401).json({ error: 'Sesión vencida o no válida. Inicia sesión de nuevo.' });
  }
  req.usuario = usuario;
  next();
}

function soloAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') {
    return res.status(403).json({ error: 'Esta acción es solo para administradores.' });
  }
  next();
}

module.exports = { requiereSesion, soloAdmin };
