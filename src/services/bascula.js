// Lectura de la báscula por puerto serie (RS-232 o USB) o con un simulador.
//
// - El peso llega en tiempo real y se reparte al navegador con eventos (SSE).
// - CERO y TARA se aplican en el programa (sirven con cualquier báscula).
// - Para agregar un producto por peso, el navegador pide una "captura": el servidor
//   guarda el peso estable y le entrega un id. La venta usa ese id, así el cajero
//   nunca digita el peso.
const EventEmitter = require('events');
const crypto = require('crypto');
const configuracion = require('./configuracion');
const { ErrorHttp } = require('../utils/errores');

const VENTANA_ESTABILIDAD_MS = 1200;
const TOLERANCIA_ESTABLE_KG = 0.005;
const PESO_MINIMO_KG = 0.005;
const PESO_MAXIMO_SIMULADOR_KG = 60;
const VIDA_CAPTURA_MS = 4 * 3600 * 1000;
const REINTENTO_MS = 5000;

const redondear3 = (n) => Math.round(n * 1000) / 1000;

class Bascula extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    this.estado = {
      modo: 'apagada', // simulador | serial | apagada
      conectada: false,
      puerto: null,
      bruto: 0,
      cero: 0,
      tara: 0,
      neto: 0,
      estable: false,
      error: null,
      actualizado: null,
    };
    this.lecturas = [];
    this.capturas = new Map();
    this.buffer = '';
    this.puertoSerie = null;
    this.timers = {};
    this.simObjetivo = 0;
    this.simActual = 0;
    this.limpieza = setInterval(() => this._limpiarCapturas(), 10 * 60 * 1000);
    this.limpieza.unref();
  }

  iniciar() {
    this.detener();
    this.cfg = configuracion.obtenerTodo();
    Object.assign(this.estado, { cero: 0, tara: 0, bruto: 0, neto: 0, estable: false, error: null });
    this.lecturas = [];
    if (this.cfg.bascula_modo === 'serial') this._iniciarSerial();
    else this._iniciarSimulador();
  }

  detener() {
    for (const t of Object.values(this.timers)) clearInterval(t);
    this.timers = {};
    if (this.puertoSerie) {
      const p = this.puertoSerie;
      this.puertoSerie = null;
      p.removeAllListeners();
      p.on('error', () => {});
      if (p.isOpen) p.close(() => {});
    }
    this.estado.conectada = false;
  }

  // ---------- Simulador ----------
  _iniciarSimulador() {
    Object.assign(this.estado, { modo: 'simulador', conectada: true, puerto: null, error: null });
    this.simObjetivo = 0;
    this.simActual = 0;
    this.timers.simulador = setInterval(() => {
      const diferencia = this.simObjetivo - this.simActual;
      if (Math.abs(diferencia) > 0.003) {
        // Se acerca al peso objetivo con un pequeño temblor, como una báscula real.
        this.simActual += diferencia * 0.55 + (Math.random() - 0.5) * 0.006;
      } else {
        this.simActual = this.simObjetivo;
      }
      this._nuevaLectura(this.simActual, null);
    }, 200);
  }

  simular(peso) {
    if (this.estado.modo !== 'simulador') {
      throw new ErrorHttp(400, 'El simulador solo funciona cuando la báscula está en modo simulador.');
    }
    const valor = Number(peso);
    if (!Number.isFinite(valor) || valor < 0 || valor > PESO_MAXIMO_SIMULADOR_KG) {
      throw new ErrorHttp(400, `El peso simulado debe estar entre 0 y ${PESO_MAXIMO_SIMULADOR_KG} kg.`);
    }
    this.simObjetivo = valor;
    return this.resumen();
  }

  // ---------- Puerto serie ----------
  _iniciarSerial() {
    const cfg = this.cfg;
    Object.assign(this.estado, { modo: 'serial', conectada: false, puerto: cfg.bascula_puerto });
    let SerialPort;
    try {
      ({ SerialPort } = require('serialport'));
    } catch (e) {
      this._error('No se pudo cargar el módulo serialport: ' + e.message);
      return;
    }
    const puerto = new SerialPort({
      path: cfg.bascula_puerto,
      baudRate: Number(cfg.bascula_baudios) || 9600,
      dataBits: Number(cfg.bascula_bits_datos) || 8,
      parity: cfg.bascula_paridad || 'none',
      stopBits: Number(cfg.bascula_bits_parada) || 1,
      autoOpen: false,
    });
    this.puertoSerie = puerto;
    this.buffer = '';

    puerto.on('open', () => {
      Object.assign(this.estado, { conectada: true, error: null });
      console.log(`Báscula conectada en ${cfg.bascula_puerto}`);
      this._emitir();
      const comando = cfg.bascula_comando;
      if (comando) {
        const cada = Math.max(100, Number(cfg.bascula_intervalo_ms) || 300);
        this.timers.sondeo = setInterval(() => {
          if (puerto.isOpen) puerto.write(comando.replace(/\\r/g, '\r').replace(/\\n/g, '\n'));
        }, cada);
      }
    });
    puerto.on('data', (trozo) => {
      this.buffer += trozo.toString('latin1');
      const lineas = this.buffer.split(/[\r\n]+/);
      this.buffer = lineas.pop();
      if (this.buffer.length > 256) this.buffer = '';
      for (const linea of lineas) this._procesarLinea(linea);
    });
    puerto.on('error', (err) => this._error(`Báscula (${cfg.bascula_puerto}): ${err.message}`));
    puerto.on('close', () => {
      this.estado.conectada = false;
      this._error(`Báscula desconectada de ${cfg.bascula_puerto}`);
      this._programarReconexion();
    });
    puerto.open((err) => {
      if (err) {
        this._error(`No se pudo abrir ${cfg.bascula_puerto}: ${err.message}`);
        this._programarReconexion();
      }
    });
  }

  _programarReconexion() {
    if (this.timers.reconexion || this.estado.modo !== 'serial') return;
    this.timers.reconexion = setTimeout(() => {
      delete this.timers.reconexion;
      if (this.estado.modo === 'serial' && !this.estado.conectada) this.iniciar();
    }, REINTENTO_MS);
  }

  // Interpreta líneas típicas: "ST,GS,+  1.234kg", "  1.234 kg", "US,NT,-0.002 kg", "1234 g".
  _procesarLinea(linea) {
    const texto = linea.replace(/[\x00-\x1f\x7f]/g, ' ').trim();
    if (!texto) return;
    let m = texto.match(/([-+]?)\s*(\d+(?:[.,]\d+)?)\s*(kg|g|lb)\b/i);
    if (!m) {
      const numeros = [...texto.matchAll(/([-+]?)\s*(\d+(?:[.,]\d+)?)/g)];
      m = numeros[numeros.length - 1];
    }
    if (!m) return;
    let valor = parseFloat(m[2].replace(',', '.'));
    if (m[1] === '-') valor = -valor;
    const unidad = (m[3] || 'kg').toLowerCase();
    if (unidad === 'g') valor /= 1000;
    if (unidad === 'lb') valor *= 0.45359237;

    let estableEquipo = null;
    if (/\b(US|MO|INESTABLE)\b/i.test(texto)) estableEquipo = false;
    else if (/\bST\b/i.test(texto)) estableEquipo = true;
    this._nuevaLectura(valor, estableEquipo);
  }

  _nuevaLectura(bruto, estableEquipo) {
    const ahora = Date.now();
    this.lecturas.push({ v: bruto, t: ahora });
    this.lecturas = this.lecturas.filter((l) => ahora - l.t <= VENTANA_ESTABILIDAD_MS);
    const valores = this.lecturas.map((l) => l.v);
    const rango = Math.max(...valores) - Math.min(...valores);
    const quieto = this.lecturas.length >= 2 && rango <= TOLERANCIA_ESTABLE_KG;

    this.estado.bruto = redondear3(bruto);
    this.estado.neto = redondear3(bruto - this.estado.cero - this.estado.tara);
    this.estado.estable = estableEquipo === null ? quieto : estableEquipo && quieto;
    this.estado.actualizado = new Date().toISOString();
    this._emitir();
  }

  _error(mensaje) {
    this.estado.error = mensaje;
    console.warn(mensaje);
    this._emitir();
  }

  _emitir() {
    this.emit('lectura', this.resumen());
  }

  resumen() {
    const { modo, conectada, puerto, bruto, cero, tara, neto, estable, error, actualizado } = this.estado;
    return { modo, conectada, puerto, bruto, cero, tara, neto, estable, error, actualizado };
  }

  _exigirConexion() {
    if (!this.estado.conectada) throw new ErrorHttp(409, 'La báscula no está conectada.');
  }

  // CERO: la lectura actual pasa a ser el cero (plato vacío) y se quita la tara.
  hacerCero() {
    this._exigirConexion();
    this.estado.cero = this.estado.bruto;
    this.estado.tara = 0;
    this.estado.neto = 0;
    this._emitir();
    return this.resumen();
  }

  // TARA: descuenta el peso del recipiente. Con el plato vacío, borra la tara.
  hacerTara() {
    this._exigirConexion();
    const carga = this.estado.bruto - this.estado.cero;
    this.estado.tara = carga > PESO_MINIMO_KG ? redondear3(carga) : 0;
    this.estado.neto = redondear3(this.estado.bruto - this.estado.cero - this.estado.tara);
    this._emitir();
    return this.resumen();
  }

  capturar() {
    this._exigirConexion();
    if (!this.estado.estable) throw new ErrorHttp(409, 'Espera a que el peso esté estable.');
    const peso = this.estado.neto;
    if (peso < PESO_MINIMO_KG) throw new ErrorHttp(409, 'No hay peso en la báscula.');
    const captura = {
      id: crypto.randomUUID(),
      peso: redondear3(peso),
      fuente: this.estado.modo === 'serial' ? 'bascula' : 'simulador',
      creada: Date.now(),
    };
    this.capturas.set(captura.id, captura);
    return captura;
  }

  obtenerCaptura(id) {
    const c = this.capturas.get(id);
    if (!c || Date.now() - c.creada > VIDA_CAPTURA_MS) return null;
    return c;
  }

  consumirCapturas(ids) {
    for (const id of ids) this.capturas.delete(id);
  }

  _limpiarCapturas() {
    const ahora = Date.now();
    for (const [id, c] of this.capturas) {
      if (ahora - c.creada > VIDA_CAPTURA_MS) this.capturas.delete(id);
    }
  }

  async listarPuertos() {
    try {
      const { SerialPort } = require('serialport');
      const puertos = await SerialPort.list();
      return puertos.map((p) => ({
        ruta: p.path,
        descripcion: [p.manufacturer, p.friendlyName].filter(Boolean).join(' · ') || p.path,
      }));
    } catch (e) {
      throw new ErrorHttp(500, 'No se pudieron listar los puertos: ' + e.message);
    }
  }
}

module.exports = new Bascula();
