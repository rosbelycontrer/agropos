// Ajustes del negocio guardados en la tabla "configuracion" (clave → valor).
const crypto = require('crypto');
const db = require('../db/database');

const POR_DEFECTO = {
  negocio_nombre: 'Fruver AgroPOS',
  negocio_nit: '900.000.000-0',
  negocio_direccion: 'Dirección del negocio',
  negocio_telefono: '',
  recibo_mensaje: '¡Gracias por su compra!',
  pesos_por_punto: '1000',   // 1 punto por cada $1.000 pagados
  valor_punto: '10',         // cada punto vale $10 al redimir
  bascula_modo: 'simulador', // simulador | serial
  bascula_puerto: 'COM3',
  bascula_baudios: '9600',
  bascula_bits_datos: '8',
  bascula_paridad: 'none',
  bascula_bits_parada: '1',
  bascula_comando: '',       // texto que pide el peso (algunas básculas lo necesitan, ej. "P")
  bascula_intervalo_ms: '300',
};

// Claves que solo usa el servidor y nunca se envían al navegador.
const PRIVADAS = ['secreto_token'];

const leer = db.prepare('SELECT valor FROM configuracion WHERE clave = ?');
const escribir = db.prepare(
  'INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor'
);

function obtener(clave) {
  const fila = leer.get(clave);
  return fila ? fila.valor : POR_DEFECTO[clave];
}

function obtenerNumero(clave) {
  return Number(obtener(clave)) || 0;
}

function obtenerTodo() {
  const todo = { ...POR_DEFECTO };
  for (const { clave, valor } of db.prepare('SELECT clave, valor FROM configuracion').all()) {
    if (!PRIVADAS.includes(clave)) todo[clave] = valor;
  }
  return todo;
}

function guardar(cambios) {
  const guardarTodo = db.transaction((obj) => {
    for (const [clave, valor] of Object.entries(obj)) {
      if (clave in POR_DEFECTO) escribir.run(clave, String(valor ?? ''));
    }
  });
  guardarTodo(cambios);
  return obtenerTodo();
}

function secretoToken() {
  let secreto = leer.get('secreto_token')?.valor;
  if (!secreto) {
    secreto = crypto.randomBytes(32).toString('hex');
    escribir.run('secreto_token', secreto);
  }
  return secreto;
}

module.exports = { obtener, obtenerNumero, obtenerTodo, guardar, secretoToken, POR_DEFECTO };
