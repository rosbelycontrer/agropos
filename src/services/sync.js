// Modo sin internet: cada caja guarda sus ventas en su propio SQLite y este
// servicio las sube a la nube cuando hay conexión. Cada venta tiene un uuid,
// así que si se envía dos veces la nube no la duplica.
const db = require('../db/database');
const config = require('../config');
const { aTextoLocal } = require('../utils/fechas');

const LOTE = 50;
const ESPERA_MS = 5000;

const estado = {
  activo: false,
  nubeUrl: config.nubeUrl,
  conectada: false,
  ultimoIntento: null,
  ultimaSincronizacion: null,
  error: null,
};

let timer = null;
let enCurso = false;
let repetir = false;

const cabeceras = {
  'Content-Type': 'application/json',
  'X-Clave-Sync': config.claveSync,
  'X-Caja-Id': config.cajaId,
};

const contarPendientes = db.prepare('SELECT COUNT(*) AS n FROM ventas WHERE sincronizada = 0');
const leerPendientes = db.prepare('SELECT * FROM ventas WHERE sincronizada = 0 ORDER BY id LIMIT ?');
const leerItems = db.prepare('SELECT plu, nombre, unidad, cantidad, precio_unitario, iva, total, fuente_peso FROM venta_items WHERE venta_id = ?');
const leerPagos = db.prepare('SELECT metodo, moneda, monto, tasa, monto_cop FROM pagos WHERE venta_id = ?');
const leerCliente = db.prepare('SELECT cedula, nombre, telefono FROM clientes WHERE id = ?');
const marcar = db.prepare('UPDATE ventas SET sincronizada = 1, sincronizada_en = ? WHERE uuid = ?');

async function pedir(ruta, opciones = {}) {
  const resp = await fetch(config.nubeUrl + ruta, {
    ...opciones,
    headers: cabeceras,
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  const cuerpo = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(cuerpo.error || `La nube respondió ${resp.status}`);
  return cuerpo;
}

function prepararVenta(v) {
  const { id, cliente_id, usuario_id, sincronizada, sincronizada_en, ...datos } = v;
  return {
    ...datos,
    cliente: cliente_id ? leerCliente.get(cliente_id) : null,
    items: leerItems.all(id),
    pagos: leerPagos.all(id),
  };
}

async function sincronizar() {
  if (enCurso) {
    repetir = true;
    return;
  }
  enCurso = true;
  estado.ultimoIntento = new Date().toISOString();
  let respondio = false;
  try {
    await pedir('/api/sync/ping');
    respondio = true;
    estado.conectada = true;
    estado.error = null;
    let pendientes = leerPendientes.all(LOTE);
    while (pendientes.length) {
      const respuesta = await pedir('/api/sync/ventas', {
        method: 'POST',
        body: JSON.stringify({ caja_id: config.cajaId, ventas: pendientes.map(prepararVenta) }),
      });
      const ahora = aTextoLocal();
      db.transaction(() => {
        for (const uuid of respuesta.aceptadas || []) marcar.run(ahora, uuid);
      })();
      estado.ultimaSincronizacion = new Date().toISOString();
      if ((respuesta.aceptadas || []).length < pendientes.length) {
        throw new Error('La nube rechazó algunas ventas: ' + (respuesta.errores || []).join('; '));
      }
      pendientes = leerPendientes.all(LOTE);
    }
  } catch (e) {
    // Si el ping respondió, "conectada" sigue en true aunque falle la subida.
    if (!respondio) estado.conectada = false;
    estado.error = traducirError(e);
  } finally {
    enCurso = false;
    if (repetir) {
      repetir = false;
      setImmediate(sincronizar);
    }
  }
}

function traducirError(e) {
  if (e.name === 'TimeoutError') return 'La nube no responde (tiempo agotado).';
  const codigo = e.cause?.code;
  if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ENETUNREACH'].includes(codigo)) {
    return 'Sin conexión con la nube.';
  }
  return e.message;
}

function iniciar() {
  if (config.modo !== 'caja' || timer) return;
  estado.activo = true;
  sincronizar();
  timer = setInterval(sincronizar, Math.max(5, config.intervaloSyncSeg) * 1000);
}

function resumen() {
  return { ...estado, pendientes: contarPendientes.get().n };
}

module.exports = { iniciar, sincronizar, resumen, estado };
