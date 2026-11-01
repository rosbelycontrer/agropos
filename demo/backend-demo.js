// AgroPOS DEMO: simula el servidor dentro del navegador para poder probar la
// aplicación desde un enlace, sin instalar nada. Intercepta fetch('/api/...')
// y responde igual que el backend real (src/), guardando los datos en este navegador.
(function () {
  // ---------- Almacenamiento seguro (algunos navegadores lo bloquean) ----------
  function memoria() {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      clear: () => m.clear(),
      key: (i) => [...m.keys()][i] ?? null,
      get length() { return m.size; },
    };
  }
  for (const nombre of ['localStorage', 'sessionStorage']) {
    try {
      window[nombre].setItem('__prueba', '1');
      window[nombre].removeItem('__prueba');
    } catch {
      try { Object.defineProperty(window, nombre, { value: memoria(), configurable: true }); } catch { /* sin almacenamiento */ }
    }
  }

  const CLAVE_BD = 'agropos_demo_bd_v1';
  const dos = (n) => String(n).padStart(2, '0');
  const textoLocal = (d = new Date()) =>
    `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
  const hoy = () => textoLocal().slice(0, 10);
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'v-' + Date.now() + '-' + Math.random().toString(16).slice(2));

  class ErrorDemo extends Error {
    constructor(estado, mensaje) { super(mensaje); this.estado = estado; }
  }
  const invalido = (m) => new ErrorDemo(400, m);
  const noEncontrado = (m) => new ErrorDemo(404, m);

  // ---------- Datos de ejemplo (los mismos de src/db/seed.js) ----------
  const CATEGORIAS = [['Frutas', '🍎'], ['Verduras', '🥬'], ['Tubérculos y plátano', '🥔'],
    ['Hierbas y aromáticas', '🌿'], ['Lácteos y charcutería', '🧀'], ['Granero', '🥚']];
  const PRODUCTOS = [
    ['4011', 'Banano criollo', 'Frutas', 'kg', 3000, 0, 60, 10, '🍌'],
    ['4046', 'Aguacate hass', 'Frutas', 'kg', 9000, 0, 25, 5, '🥑'],
    ['4048', 'Limón tahití', 'Frutas', 'kg', 4500, 0, 30, 8, '🍋'],
    ['4051', 'Mango tommy', 'Frutas', 'kg', 5500, 0, 40, 8, '🥭'],
    ['4012', 'Naranja valencia', 'Frutas', 'kg', 3200, 0, 80, 15, '🍊'],
    ['4394', 'Papaya maradol', 'Frutas', 'kg', 3800, 0, 35, 8, '🍈'],
    ['4430', 'Piña oro miel', 'Frutas', 'kg', 3500, 0, 30, 6, '🍍'],
    ['4323', 'Fresa', 'Frutas', 'kg', 12000, 0, 4, 5, '🍓'],
    ['4299', 'Guayaba pera', 'Frutas', 'kg', 4200, 0, 20, 5, '🍐'],
    ['4312', 'Maracuyá', 'Frutas', 'kg', 6000, 0, 18, 5, '🟡'],
    ['4664', 'Tomate chonto', 'Verduras', 'kg', 4800, 0, 70, 15, '🍅'],
    ['4665', 'Cebolla cabezona blanca', 'Verduras', 'kg', 3500, 0, 50, 10, '🧅'],
    ['4068', 'Cebolla junca', 'Verduras', 'kg', 4000, 0, 3, 5, '🌱'],
    ['4562', 'Zanahoria', 'Verduras', 'kg', 2800, 0, 45, 10, '🥕'],
    ['4065', 'Pimentón', 'Verduras', 'kg', 7000, 0, 15, 4, '🫑'],
    ['4072', 'Papa pastusa', 'Tubérculos y plátano', 'kg', 3200, 0, 120, 25, '🥔'],
    ['4073', 'Papa criolla', 'Tubérculos y plátano', 'kg', 5200, 0, 30, 8, '🥔'],
    ['4074', 'Yuca', 'Tubérculos y plátano', 'kg', 2600, 0, 55, 10, '🥖'],
    ['4235', 'Plátano hartón verde', 'Tubérculos y plátano', 'kg', 3600, 0, 65, 12, '🍌'],
    ['5001', 'Cilantro (manojo)', 'Hierbas y aromáticas', 'und', 1000, 0, 40, 10, '🌿'],
    ['5002', 'Perejil (manojo)', 'Hierbas y aromáticas', 'und', 1000, 0, 25, 8, '🌿'],
    ['6001', 'Queso costeño', 'Lácteos y charcutería', 'kg', 26000, 0, 12, 3, '🧀'],
    ['6002', 'Jamón de cerdo', 'Lácteos y charcutería', 'kg', 32000, 19, 8, 2, '🍖'],
    ['7001', 'Huevo AA (unidad)', 'Granero', 'und', 650, 0, 300, 60, '🥚'],
    ['7002', 'Panela (500 g)', 'Granero', 'und', 3500, 5, 40, 10, '🟫'],
  ];
  const CONFIG_INICIAL = {
    negocio_nombre: 'Fruver AgroPOS', negocio_nit: '900.000.000-0', negocio_direccion: 'Cúcuta, Norte de Santander',
    negocio_telefono: '', recibo_mensaje: '¡Gracias por su compra!', pesos_por_punto: '1000', valor_punto: '10',
    bascula_modo: 'simulador', bascula_puerto: 'COM3', bascula_baudios: '9600', bascula_bits_datos: '8',
    bascula_paridad: 'none', bascula_bits_parada: '1', bascula_comando: '', bascula_intervalo_ms: '300',
  };
  const CAJA = 'DEMO-01';

  function crearBD() {
    const bd = {
      seq: {}, usuarios: [], categorias: [], productos: [], clientes: [], tasas: [],
      ventas: [], recepciones: [], config: { ...CONFIG_INICIAL }, enLinea: true,
    };
    const ahora = textoLocal();
    bd.usuarios.push({ id: 1, nombre: 'Administrador', correo: 'admin@agropos.com', clave: 'admin123', rol: 'admin', activo: 1, creado_en: ahora });
    bd.usuarios.push({ id: 2, nombre: 'Cajero Principal', correo: 'cajero@agropos.com', clave: 'cajero123', rol: 'cajero', activo: 1, creado_en: ahora });
    bd.seq.usuarios = 2;
    CATEGORIAS.forEach(([nombre, emoji], i) => bd.categorias.push({ id: i + 1, nombre, emoji }));
    PRODUCTOS.forEach(([plu, nombre, cat, unidad, precio, iva, stock, minimo, emoji], i) => {
      bd.productos.push({
        id: i + 1, plu, nombre, categoria_id: bd.categorias.find((c) => c.nombre === cat).id, unidad, precio, iva,
        stock, stock_minimo: minimo, emoji, activo: 1, creado_en: ahora, actualizado_en: ahora,
      });
    });
    bd.seq.productos = PRODUCTOS.length;
    bd.tasas.push({ id: 1, usd: 3900, ves: 15, usuario_nombre: 'Datos de ejemplo', creado_en: ahora });
    bd.seq.tasas = 1;
    bd.clientes.push({ id: 1, cedula: '1090123456', nombre: 'María Fernanda Rojas', telefono: '3001234567', puntos: 120, creado_en: ahora });
    bd.clientes.push({ id: 2, cedula: '88234567', nombre: 'Carlos Andrés Peña', telefono: '3157654321', puntos: 40, creado_en: ahora });
    bd.clientes.push({ id: 3, cedula: '1093456789', nombre: 'Luz Marina Contreras', telefono: '3209876543', puntos: 65, creado_en: ahora });
    bd.seq.clientes = 3;
    bd.recepciones.push({
      id: 1, lote: 'L-0001', proveedor: 'Cenabastos Cúcuta', notas: 'Inventario inicial', usuario_nombre: 'Administrador', creado_en: ahora,
      items: bd.productos.map((p) => ({ producto_id: p.id, cantidad: p.stock, costo_unitario: Math.round(p.precio * 0.7), vence: null })),
    });
    bd.seq.recepciones = 1;
    bd.seq.ventas = 0;
    ventasDeEjemplo(bd);
    return bd;
  }

  // Ventas de los últimos 7 días para que los reportes muestren algo desde el inicio.
  function ventasDeEjemplo(bd) {
    let semilla = 20261020;
    const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
    const elegir = (lista) => lista[Math.floor(azar() * lista.length)];
    const tasas = { USD: 3900, VES: 15 };
    for (let dia = 6; dia >= 0; dia--) {
      const cuantas = 4 + Math.floor(azar() * 5);
      const horas = Array.from({ length: cuantas }, () => 7 + azar() * 11).sort((a, b) => a - b);
      for (const hora of horas) {
        const fecha = new Date();
        fecha.setDate(fecha.getDate() - dia);
        fecha.setHours(Math.floor(hora), Math.floor((hora % 1) * 60), Math.floor(azar() * 60));
        if (fecha > new Date()) continue;
        const lineas = [];
        const n = 1 + Math.floor(azar() * 4);
        for (let i = 0; i < n; i++) {
          const p = elegir(bd.productos);
          if (lineas.some((l) => l.producto.id === p.id)) continue;
          const cantidad = p.unidad === 'kg' ? r3(0.3 + azar() * 2.7) : 1 + Math.floor(azar() * 6);
          const fuente = p.unidad === 'und' ? 'unidad' : azar() < 0.06 ? 'manual' : 'bascula';
          lineas.push({ producto: p, cantidad, fuente, precio: p.precio, iva: p.iva });
        }
        const cliente = azar() < 0.4 ? elegir(bd.clientes) : null;
        const totales = Dinero.calcularVenta(lineas, 0);
        const forma = azar();
        let pagos;
        if (forma < 0.5) {
          const billetes = [5000, 10000, 20000, 50000, 100000];
          const entregado = billetes.find((b) => b >= totales.total) || Math.ceil(totales.total / 50000) * 50000;
          pagos = [{ metodo: 'efectivo', moneda: 'COP', monto: azar() < 0.3 ? totales.total : entregado }];
        } else if (forma < 0.62) {
          pagos = [{ metodo: 'efectivo', moneda: 'USD', monto: Math.max(1, Math.ceil(totales.total / tasas.USD)) }];
        } else if (forma < 0.72) {
          pagos = [{ metodo: 'efectivo', moneda: 'VES', monto: Math.ceil(totales.total / tasas.VES / 10) * 10 }];
        } else {
          const metodo = elegir(['tarjeta', 'transferencia', 'digital']);
          pagos = [{ metodo, moneda: 'COP', monto: totales.total }];
        }
        const cobro = Dinero.calcularCobro(totales.total, pagos, tasas);
        if (!cobro.completo) continue;
        const duracion = 35 + Math.floor(azar() * 200);
        const id = ++bd.seq.ventas;
        const creado = textoLocal(fecha);
        bd.ventas.push({
          id, uuid: uuid(), numero: `${CAJA}-${String(id).padStart(6, '0')}`, caja_id: CAJA,
          usuario_id: 2, usuario_nombre: 'Cajero Principal',
          cliente_id: cliente?.id ?? null, cliente_cedula: cliente?.cedula ?? null, cliente_nombre: cliente?.nombre ?? null,
          total_bruto: totales.total_bruto, subtotal: totales.subtotal, iva: totales.iva, descuento_puntos: 0,
          redondeo: totales.redondeo, total: totales.total, pagado_cop: cobro.pagado_cop, cambio_cop: cobro.cambio,
          tasa_usd: tasas.USD, tasa_ves: tasas.VES,
          puntos_ganados: cliente ? Math.floor(totales.total / 1000) : 0, puntos_redimidos: 0,
          inicio_atencion: textoLocal(new Date(fecha - duracion * 1000)), fin_atencion: creado, duracion_seg: duracion,
          sin_conexion: azar() < 0.12 ? 1 : 0, sincronizada: 1, sincronizada_en: creado, creado_en: creado, ejemplo: true,
          items: totales.lineas.map((l) => ({
            producto_id: l.producto.id, plu: l.producto.plu, nombre: l.producto.nombre, unidad: l.producto.unidad,
            cantidad: l.cantidad, precio_unitario: l.precio, iva: l.iva, total: l.total, fuente_peso: l.fuente,
          })),
          pagos: cobro.pagos,
        });
      }
    }
  }

  // ---------- Carga y guardado ----------
  let bd;
  try {
    bd = JSON.parse(localStorage.getItem(CLAVE_BD) || 'null');
  } catch { bd = null; }
  if (!bd || !bd.usuarios) bd = crearBD();
  function guardar() {
    try { localStorage.setItem(CLAVE_BD, JSON.stringify(bd)); } catch { /* sin almacenamiento */ }
  }
  guardar();

  const siguienteId = (tabla) => (bd.seq[tabla] = (bd.seq[tabla] || 0) + 1);

  // ---------- Báscula simulada (misma lógica que src/services/bascula.js) ----------
  const bascula = {
    estado: { modo: 'simulador', conectada: true, puerto: null, bruto: 0, cero: 0, tara: 0, neto: 0, estable: false, error: null, actualizado: null },
    objetivo: 0, actual: 0, lecturas: [], oyentes: new Set(), capturas: new Map(),
    resumen() { return { ...this.estado }; },
    emitir() { const r = this.resumen(); this.oyentes.forEach((f) => f(r)); },
    tic() {
      const dif = this.objetivo - this.actual;
      if (Math.abs(dif) > 0.003) this.actual += dif * 0.55 + (Math.random() - 0.5) * 0.006;
      else this.actual = this.objetivo;
      const ahora = Date.now();
      this.lecturas.push({ v: this.actual, t: ahora });
      this.lecturas = this.lecturas.filter((l) => ahora - l.t <= 1200);
      const valores = this.lecturas.map((l) => l.v);
      const rango = Math.max(...valores) - Math.min(...valores);
      const e = this.estado;
      e.bruto = r3(this.actual);
      e.neto = r3(this.actual - e.cero - e.tara);
      e.estable = this.lecturas.length >= 2 && rango <= 0.005;
      e.actualizado = new Date().toISOString();
      this.emitir();
    },
    simular(peso) {
      const v = Number(peso);
      if (!Number.isFinite(v) || v < 0 || v > 60) throw invalido('El peso simulado debe estar entre 0 y 60 kg.');
      this.objetivo = v;
      return this.resumen();
    },
    cero() { const e = this.estado; e.cero = e.bruto; e.tara = 0; e.neto = 0; this.emitir(); return this.resumen(); },
    tara() {
      const e = this.estado;
      const carga = e.bruto - e.cero;
      e.tara = carga > 0.005 ? r3(carga) : 0;
      e.neto = r3(e.bruto - e.cero - e.tara);
      this.emitir();
      return this.resumen();
    },
    capturar() {
      const e = this.estado;
      if (!e.estable) throw new ErrorDemo(409, 'Espera a que el peso esté estable.');
      if (e.neto < 0.005) throw new ErrorDemo(409, 'No hay peso en la báscula. Usa los botones del simulador para poner un peso.');
      const c = { id: uuid(), peso: r3(e.neto), fuente: 'simulador', creada: Date.now() };
      this.capturas.set(c.id, c);
      return c;
    },
  };
  setInterval(() => bascula.tic(), 200);

  // El panel escucha la báscula con EventSource: aquí se reemplaza por la báscula simulada.
  window.EventSource = class {
    constructor() {
      this.onmessage = null;
      this.onerror = null;
      this._oyente = (d) => this.onmessage && this.onmessage({ data: JSON.stringify(d) });
      bascula.oyentes.add(this._oyente);
      setTimeout(() => this._oyente(bascula.resumen()), 0);
    }
    close() { bascula.oyentes.delete(this._oyente); }
  };

  // ---------- Sincronización simulada con la nube ----------
  const estadoNube = { ultimaSincronizacion: null };
  function sincronizar() {
    if (!bd.enLinea) return;
    let cambios = false;
    for (const v of bd.ventas) {
      if (!v.sincronizada) { v.sincronizada = 1; v.sincronizada_en = textoLocal(); cambios = true; }
    }
    estadoNube.ultimaSincronizacion = new Date().toISOString();
    if (cambios) guardar();
  }
  setInterval(sincronizar, 15000);
  const resumenNube = () => ({
    activo: true, nubeUrl: 'nube de demostración', conectada: bd.enLinea,
    ultimoIntento: new Date().toISOString(), ultimaSincronizacion: estadoNube.ultimaSincronizacion,
    error: bd.enLinea ? null : 'Sin conexión con la nube (simulado).',
    pendientes: bd.ventas.filter((v) => !v.sincronizada).length,
  });

  // ---------- Utilidades de negocio ----------
  const cat = (id) => bd.categorias.find((c) => c.id === id);
  const vistaProducto = (p) => ({ ...p, categoria: cat(p.categoria_id)?.nombre || null, stock_bajo: p.stock <= p.stock_minimo ? 1 : 0 });
  const limpiarCedula = (v) => String(v || '').replace(/[.\s-]/g, '');
  const num = (clave) => Number(bd.config[clave]) || 0;
  const reglas = () => ({ pesos_por_punto: num('pesos_por_punto'), valor_punto: num('valor_punto') });
  const tasaActual = () => {
    const t = bd.tasas[bd.tasas.length - 1];
    return t ? { USD: t.usd, VES: t.ves, actualizado: t.creado_en, usuario: t.usuario_nombre } : { USD: 0, VES: 0, actualizado: null, usuario: null };
  };
  const comprasDe = (cedula) => bd.ventas.filter((v) => v.cliente_cedula === cedula);
  const vistaCliente = (c) => {
    const compras = comprasDe(c.cedula);
    return { ...c, compras: compras.length, ultima_compra: compras.length ? compras[compras.length - 1].creado_en : null };
  };

  function exigirAdmin(u) {
    if (u.rol !== 'admin') throw new ErrorDemo(403, 'Esta acción es solo para administradores.');
  }

  function validarProducto(body, parcial) {
    const d = {};
    const campos = ['plu', 'nombre', 'categoria_id', 'unidad', 'precio', 'iva', 'stock_minimo', 'emoji', 'activo'];
    if (!parcial) campos.push('stock');
    for (const c of campos) if (body[c] !== undefined) d[c] = body[c];
    if (!parcial || d.plu !== undefined) {
      d.plu = String(d.plu || '').trim();
      if (!/^[0-9A-Za-z-]{1,20}$/.test(d.plu)) throw invalido('El PLU es obligatorio (solo letras, números o guion).');
    }
    if (!parcial || d.nombre !== undefined) {
      d.nombre = String(d.nombre || '').trim();
      if (!d.nombre) throw invalido('El nombre es obligatorio.');
    }
    if ((!parcial || d.unidad !== undefined) && !['kg', 'und'].includes(d.unidad)) throw invalido('La unidad debe ser "kg" o "und".');
    if (!parcial || d.precio !== undefined) {
      d.precio = Number(d.precio);
      if (!(d.precio >= 0)) throw invalido('El precio no es válido.');
    }
    for (const c of ['iva', 'stock', 'stock_minimo']) {
      if (d[c] !== undefined) {
        d[c] = Number(d[c]);
        if (!(d[c] >= 0)) throw invalido(`El valor de ${c} no es válido.`);
      }
    }
    if (d.categoria_id !== undefined) d.categoria_id = d.categoria_id ? Number(d.categoria_id) : null;
    if (d.activo !== undefined) d.activo = d.activo ? 1 : 0;
    return d;
  }

  function validarCliente(body) {
    const cedula = limpiarCedula(body.cedula);
    const nombre = String(body.nombre || '').trim();
    const telefono = String(body.telefono || '').trim() || null;
    if (!/^[0-9A-Za-z]{5,15}$/.test(cedula)) throw invalido('La cédula debe tener entre 5 y 15 dígitos.');
    if (!nombre) throw invalido('El nombre del cliente es obligatorio.');
    return { cedula, nombre, telefono };
  }

  // ---------- Ventas (misma lógica que src/services/ventas.js) ----------
  function crearVenta(datos, usuario) {
    const items = datos.items;
    if (!Array.isArray(items) || !items.length) throw invalido('El carrito está vacío.');
    const usadas = new Set();
    const lineas = items.map((item, i) => {
      const producto = bd.productos.find((p) => p.id === Number(item.producto_id) && p.activo);
      if (!producto) throw invalido(`Producto no encontrado (renglón ${i + 1}).`);
      let cantidad;
      let fuente;
      if (producto.unidad === 'und') {
        cantidad = Number(item.cantidad);
        if (!Number.isInteger(cantidad) || cantidad < 1) throw invalido(`Cantidad no válida para ${producto.nombre}.`);
        fuente = 'unidad';
      } else if (item.captura_id) {
        if (usadas.has(item.captura_id)) throw invalido('Un mismo peso no se puede usar dos veces.');
        const c = bascula.capturas.get(item.captura_id);
        if (!c) throw invalido(`El peso de ${producto.nombre} venció. Vuelve a pesarlo.`);
        usadas.add(item.captura_id);
        cantidad = c.peso;
        fuente = c.fuente;
      } else {
        throw invalido(`Falta el peso de ${producto.nombre}.`);
      }
      return { producto, cantidad, fuente, precio: producto.precio, iva: producto.iva };
    });

    const tasas = tasaActual();
    let cliente = null;
    if (datos.cliente_cedula) {
      cliente = bd.clientes.find((c) => c.cedula === limpiarCedula(datos.cliente_cedula));
      if (!cliente) throw invalido('El cliente no está registrado.');
    }
    const { valor_punto: valorPunto, pesos_por_punto: pesosPorPunto } = reglas();
    const redimir = Math.floor(Number(datos.puntos_redimir) || 0);
    if (redimir < 0) throw invalido('Los puntos a redimir no pueden ser negativos.');
    if (redimir > 0 && !cliente) throw invalido('Para redimir puntos hay que identificar al cliente.');
    if (cliente && redimir > cliente.puntos) throw invalido(`El cliente solo tiene ${cliente.puntos} puntos.`);
    const totales = Dinero.calcularVenta(lineas, redimir * valorPunto);
    if (redimir * valorPunto > totales.total_bruto) throw invalido('Los puntos a redimir superan el valor de la compra.');
    const cobro = Dinero.calcularCobro(totales.total, datos.pagos, tasas);
    if (cobro.errores.length) throw invalido(cobro.errores[0]);
    if (cobro.falta > 0) throw invalido(`Falta por pagar $${cobro.falta.toLocaleString('es-CO')}.`);
    const ganados = cliente && pesosPorPunto > 0 ? Math.floor(totales.total / pesosPorPunto) : 0;

    const fin = new Date();
    const inicio = datos.inicio_atencion ? new Date(datos.inicio_atencion) : null;
    let duracion = inicio && !isNaN(inicio) ? Math.round((fin - inicio) / 1000) : null;
    if (duracion !== null && (duracion < 0 || duracion > 4 * 3600)) duracion = null;

    const id = siguienteId('ventas');
    const venta = {
      id, uuid: uuid(), numero: `${CAJA}-${String(id).padStart(6, '0')}`, caja_id: CAJA,
      usuario_id: usuario.id, usuario_nombre: usuario.nombre,
      cliente_id: cliente?.id ?? null, cliente_cedula: cliente?.cedula ?? null, cliente_nombre: cliente?.nombre ?? null,
      total_bruto: totales.total_bruto, subtotal: totales.subtotal, iva: totales.iva, descuento_puntos: totales.descuento,
      redondeo: totales.redondeo, total: totales.total, pagado_cop: cobro.pagado_cop, cambio_cop: cobro.cambio,
      tasa_usd: tasas.USD || null, tasa_ves: tasas.VES || null, puntos_ganados: ganados, puntos_redimidos: redimir,
      inicio_atencion: duracion !== null ? textoLocal(inicio) : null, fin_atencion: textoLocal(fin), duracion_seg: duracion,
      sin_conexion: bd.enLinea ? 0 : 1, sincronizada: 0, sincronizada_en: null, creado_en: textoLocal(fin),
      items: totales.lineas.map((l) => ({
        producto_id: l.producto.id, plu: l.producto.plu, nombre: l.producto.nombre, unidad: l.producto.unidad,
        cantidad: l.cantidad, precio_unitario: l.precio, iva: l.iva, total: l.total, fuente_peso: l.fuente,
      })),
      pagos: cobro.pagos,
    };
    bd.ventas.push(venta);
    for (const l of totales.lineas) {
      l.producto.stock = r3(l.producto.stock - l.cantidad);
      l.producto.actualizado_en = textoLocal();
    }
    if (cliente) cliente.puntos += ganados - redimir;
    usadas.forEach((u) => bascula.capturas.delete(u));
    guardar();
    setTimeout(sincronizar, 1500);
    return obtenerVenta(id);
  }

  function obtenerVenta(id) {
    const v = bd.ventas.find((x) => x.id === Number(id));
    if (!v) throw noEncontrado('Venta no encontrada.');
    const cliente = v.cliente_cedula ? bd.clientes.find((c) => c.cedula === v.cliente_cedula) : null;
    return { ...v, desglose_cambio: Dinero.desglosar(v.cambio_cop), cliente_puntos: cliente ? cliente.puntos : null };
  }

  // ---------- Reportes (misma lógica que src/services/reportes.js) ----------
  const porcentaje = (parte, total) => (total ? Math.round((parte / total) * 1000) / 10 : 0);
  const sumar = (lista, f) => lista.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  function agrupar(lista, clave, armar) {
    const mapa = new Map();
    for (const x of lista) {
      const k = clave(x);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(x);
    }
    return [...mapa.entries()].map(([k, grupo]) => armar(k, grupo));
  }

  function generarReporte(q) {
    const desde = q.desde || hoy();
    const hasta = q.hasta || hoy();
    const vs = bd.ventas.filter((v) => {
      const d = v.creado_en.slice(0, 10);
      return d >= desde && d <= hasta && (!q.caja || v.caja_id === q.caja);
    });
    const n = vs.length;
    const total = sumar(vs, (v) => v.total);
    const duraciones = vs.map((v) => v.duracion_seg).filter((d) => d !== null && d !== undefined);
    const items = vs.flatMap((v) => v.items);
    const pagos = vs.flatMap((v) => v.pagos);
    const porPeso = items.filter((i) => i.unidad === 'kg');
    const fuentes = agrupar(porPeso, (i) => i.fuente_peso, (fuente, g) => ({ fuente, lineas: g.length, kg: sumar(g, (i) => i.cantidad) }));
    const conBascula = sumar(fuentes.filter((f) => f.fuente === 'bascula' || f.fuente === 'simulador'), (f) => f.lineas);
    const sinConexion = vs.filter((v) => v.sin_conexion);
    const cedulas = agrupar(vs.filter((v) => v.cliente_cedula), (v) => v.cliente_cedula, (cedula, g) => ({ cedula, compras: g.length }));
    const recurrentes = cedulas.filter((c) =>
      bd.ventas.filter((v) => v.cliente_cedula === c.cedula && v.creado_en.slice(0, 10) <= hasta).length >= 2).length;
    const ventasConCliente = sumar(cedulas, (c) => c.compras);
    const ordenar = (lista, campo) => lista.sort((a, b) => b[campo] - a[campo]);

    return {
      desde, hasta, caja: q.caja || null,
      resumen: {
        ventas: n, total, ticket_promedio: n ? Math.round(total / n) : 0, iva: sumar(vs, (v) => v.iva),
        descuento_puntos: sumar(vs, (v) => v.descuento_puntos), redondeo: sumar(vs, (v) => v.redondeo),
        cambio_entregado: sumar(vs, (v) => v.cambio_cop),
      },
      atencion: {
        medidas: duraciones.length,
        promedio_seg: duraciones.length ? Math.round(sumar(duraciones, (d) => d) / duraciones.length) : null,
        minimo_seg: duraciones.length ? Math.min(...duraciones) : null,
        maximo_seg: duraciones.length ? Math.max(...duraciones) : null,
      },
      pesaje: { lineas_por_peso: porPeso.length, con_bascula: conBascula, porcentaje_bascula: porcentaje(conBascula, porPeso.length), detalle: fuentes },
      conexion: {
        ventas_sin_conexion: sinConexion.length, total_sin_conexion: sumar(sinConexion, (v) => v.total),
        pendientes_sincronizar: vs.filter((v) => !v.sincronizada).length, porcentaje: porcentaje(sinConexion.length, n),
      },
      clientes: {
        identificados: cedulas.length, recurrentes, ventas_con_cliente: ventasConCliente,
        porcentaje_recurrentes: porcentaje(recurrentes, cedulas.length), porcentaje_ventas_con_cliente: porcentaje(ventasConCliente, n),
      },
      por_moneda: ordenar(agrupar(pagos, (p) => p.moneda, (moneda, g) => ({
        moneda, pagos: g.length, monto: sumar(g, (p) => p.monto), monto_cop: sumar(g, (p) => p.monto_cop) })), 'monto_cop'),
      por_metodo: ordenar(agrupar(pagos, (p) => p.metodo, (metodo, g) => ({
        metodo, pagos: g.length, monto_cop: sumar(g, (p) => p.monto_cop) })), 'monto_cop'),
      por_dia: agrupar(vs, (v) => v.creado_en.slice(0, 10), (dia, g) => ({ dia, ventas: g.length, total: sumar(g, (v) => v.total) }))
        .sort((a, b) => a.dia.localeCompare(b.dia)),
      por_caja: agrupar(vs, (v) => v.caja_id, (caja_id, g) => ({ caja_id, ventas: g.length, total: sumar(g, (v) => v.total) })),
      por_cajero: ordenar(agrupar(vs, (v) => v.usuario_nombre, (cajero, g) => {
        const d = g.map((v) => v.duracion_seg).filter((x) => x !== null && x !== undefined);
        return { cajero, ventas: g.length, total: sumar(g, (v) => v.total), promedio_seg: d.length ? Math.round(sumar(d, (x) => x) / d.length) : null };
      }), 'total'),
      top_productos: ordenar(agrupar(items, (i) => i.plu, (plu, g) => ({
        plu, nombre: g[0].nombre, unidad: g[0].unidad, cantidad: sumar(g, (i) => i.cantidad), total: sumar(g, (i) => i.total) })), 'total').slice(0, 10),
    };
  }

  // ---------- Rutas de la API ----------
  const PUBLICAS = ['negocio_nombre', 'negocio_nit', 'negocio_direccion', 'negocio_telefono', 'recibo_mensaje', 'pesos_por_punto', 'valor_punto'];
  const CAMPOS_BASCULA = ['bascula_modo', 'bascula_puerto', 'bascula_baudios', 'bascula_bits_datos', 'bascula_paridad',
    'bascula_bits_parada', 'bascula_comando', 'bascula_intervalo_ms'];
  const elegirCampos = (obj, campos) => Object.fromEntries(campos.map((c) => [c, obj[c]]));
  const vistaUsuario = ({ clave, ...u }) => u;

  function manejar(metodo, partes, q, cuerpo, usuario) {
    const [recurso, a, b] = partes;
    const ruta = `${metodo} ${recurso}${a ? '/' + (/^\d+$/.test(a) || recurso === 'clientes' ? ':x' : a) : ''}${b ? '/' + (/^\d+$/.test(b) ? ':y' : b) : ''}`;
    const body = cuerpo || {};

    if (ruta === 'POST auth/login') {
      const correo = String(body.correo || '').trim().toLowerCase();
      const u = bd.usuarios.find((x) => x.correo.toLowerCase() === correo && x.activo);
      if (!correo || !body.clave) throw invalido('Escribe el correo y la contraseña.');
      if (!u || u.clave !== String(body.clave)) throw new ErrorDemo(401, 'Correo o contraseña incorrectos.');
      const datos = { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol };
      return { estado: 200, datos: { token: 'demo-' + u.id, usuario: datos } };
    }
    if (!usuario) throw new ErrorDemo(401, 'Sesión vencida o no válida. Inicia sesión de nuevo.');

    switch (ruta) {
      case 'GET auth/yo': return vistaUsuario(usuario);

      case 'GET estado': {
        const activos = bd.productos.filter((p) => p.activo);
        return {
          modo: 'caja', caja_id: CAJA, hora_servidor: new Date().toISOString(), nube: resumenNube(), bascula: bascula.resumen(),
          inventario: {
            productos: activos.length, stock_bajo: activos.filter((p) => p.stock <= p.stock_minimo).length,
            agotados: activos.filter((p) => p.stock <= 0).length,
          },
        };
      }
      case 'POST estado/sincronizar': sincronizar(); return resumenNube();

      case 'GET productos/categorias': return [...bd.categorias].sort((x, y) => x.nombre.localeCompare(y.nombre));
      case 'GET productos': {
        const texto = String(q.buscar || '').toLowerCase();
        return bd.productos
          .filter((p) => (q.todos === '1' || p.activo) &&
            (!texto || p.nombre.toLowerCase().includes(texto) || p.plu.toLowerCase().startsWith(texto)) &&
            (!q.categoria || p.categoria_id === Number(q.categoria)) &&
            (q.stock_bajo !== '1' || p.stock <= p.stock_minimo))
          .map(vistaProducto)
          .sort((x, y) => (x.categoria || '').localeCompare(y.categoria || '') || x.nombre.localeCompare(y.nombre));
      }
      case 'GET productos/:x': {
        const p = bd.productos.find((x) => x.id === Number(a));
        if (!p) throw noEncontrado('Producto no encontrado.');
        return vistaProducto(p);
      }
      case 'POST productos': {
        exigirAdmin(usuario);
        const d = validarProducto(body, false);
        if (bd.productos.some((p) => p.plu === d.plu)) throw invalido('Ya existe un producto con ese PLU.');
        const p = { categoria_id: null, iva: 0, stock: 0, stock_minimo: 0, emoji: null, ...d, id: siguienteId('productos'), activo: 1,
          creado_en: textoLocal(), actualizado_en: textoLocal() };
        bd.productos.push(p);
        guardar();
        return { estado: 201, datos: vistaProducto(p) };
      }
      case 'PUT productos/:x': {
        exigirAdmin(usuario);
        const p = bd.productos.find((x) => x.id === Number(a));
        if (!p) throw noEncontrado('Producto no encontrado.');
        const d = validarProducto(body, true);
        if (d.plu && bd.productos.some((x) => x.plu === d.plu && x.id !== p.id)) throw invalido('Ya existe un producto con ese PLU.');
        Object.assign(p, d, { actualizado_en: textoLocal() });
        guardar();
        return vistaProducto(p);
      }

      case 'GET clientes': {
        const texto = String(q.buscar || '').toLowerCase();
        return bd.clientes.filter((c) => c.cedula.includes(texto) || c.nombre.toLowerCase().includes(texto))
          .map(vistaCliente).sort((x, y) => x.nombre.localeCompare(y.nombre));
      }
      case 'GET clientes/:x': {
        if (a === 'reglas') return reglas();
        const c = bd.clientes.find((x) => x.cedula === limpiarCedula(decodeURIComponent(a)));
        if (!c) throw noEncontrado('Cliente no registrado.');
        return { ...vistaCliente(c), ...reglas() };
      }
      case 'POST clientes': {
        const d = validarCliente(body);
        if (bd.clientes.some((c) => c.cedula === d.cedula)) throw invalido('Ya hay un cliente con esa cédula.');
        const c = { id: siguienteId('clientes'), ...d, puntos: 0, creado_en: textoLocal() };
        bd.clientes.push(c);
        guardar();
        return { estado: 201, datos: { ...vistaCliente(c), ...reglas() } };
      }
      case 'PUT clientes/:x': {
        const c = bd.clientes.find((x) => x.cedula === limpiarCedula(decodeURIComponent(a)));
        if (!c) throw noEncontrado('Cliente no registrado.');
        const d = validarCliente({ ...body, cedula: c.cedula });
        c.nombre = d.nombre;
        c.telefono = d.telefono;
        guardar();
        return { ...vistaCliente(c), ...reglas() };
      }

      case 'GET tasas': return tasaActual();
      case 'GET tasas/historial': return [...bd.tasas].reverse().slice(0, 30);
      case 'POST tasas': {
        exigirAdmin(usuario);
        const usd = Number(body.USD);
        const ves = Number(body.VES);
        if (!(usd > 0) || !(ves > 0)) throw invalido('Las tasas deben ser números mayores que cero.');
        bd.tasas.push({ id: siguienteId('tasas'), usd, ves, usuario_nombre: usuario.nombre, creado_en: textoLocal() });
        guardar();
        return { estado: 201, datos: tasaActual() };
      }

      case 'GET bascula': return bascula.resumen();
      case 'POST bascula/cero': return bascula.cero();
      case 'POST bascula/tara': return bascula.tara();
      case 'POST bascula/capturar': return bascula.capturar();
      case 'POST bascula/simular': return bascula.simular(body.peso);
      case 'GET bascula/configuracion': exigirAdmin(usuario); return elegirCampos(bd.config, CAMPOS_BASCULA);
      case 'PUT bascula/configuracion':
        exigirAdmin(usuario);
        if (body.bascula_modo === 'serial') {
          throw invalido('En esta demo solo funciona el simulador. Instala AgroPOS en el computador para conectar una báscula real.');
        }
        for (const c of CAMPOS_BASCULA) if (body[c] !== undefined) bd.config[c] = String(body[c]);
        guardar();
        return bascula.resumen();
      case 'GET bascula/puertos':
        throw invalido('Desde el navegador no se pueden ver los puertos. En AgroPOS instalado este botón lista los puertos COM.');

      case 'POST ventas': return { estado: 201, datos: crearVenta(body, usuario) };
      case 'GET ventas': {
        const limite = Math.min(500, Math.max(1, Number(q.limite) || 50));
        return [...bd.ventas].reverse()
          .filter((v) => (!q.desde || v.creado_en >= q.desde) && (!q.hasta || v.creado_en.slice(0, 10) <= q.hasta))
          .slice(0, limite)
          .map((v) => ({ ...v, metodos: [...new Set(v.pagos.map((p) => p.metodo))].join(',') }));
      }
      case 'GET ventas/:x': return obtenerVenta(a);

      case 'GET recepciones': {
        const limite = Math.min(100, Number(q.limite) || 20);
        return [...bd.recepciones].reverse().slice(0, limite).map((r) => ({
          ...r,
          items: r.items.map((i) => {
            const p = bd.productos.find((x) => x.id === i.producto_id) || {};
            return { ...i, nombre: p.nombre, plu: p.plu, unidad: p.unidad, emoji: p.emoji };
          }),
        }));
      }
      case 'POST recepciones': {
        exigirAdmin(usuario);
        const lista = body.items;
        if (!Array.isArray(lista) || !lista.length) throw invalido('Agrega al menos un producto al lote.');
        const limpios = lista.map((it, i) => {
          const cantidad = Number(it.cantidad);
          const p = bd.productos.find((x) => x.id === Number(it.producto_id));
          if (!p) throw invalido(`Producto no válido en el renglón ${i + 1}.`);
          if (!(cantidad > 0)) throw invalido(`Cantidad no válida en el renglón ${i + 1}.`);
          const costo = it.costo_unitario === '' || it.costo_unitario == null ? null : Number(it.costo_unitario);
          return { producto_id: p.id, cantidad, costo_unitario: costo, vence: /^\d{4}-\d{2}-\d{2}$/.test(it.vence || '') ? it.vence : null };
        });
        const id = siguienteId('recepciones');
        const r = { id, lote: `L-${String(id).padStart(4, '0')}`, proveedor: body.proveedor || null, notas: body.notas || null,
          usuario_nombre: usuario.nombre, creado_en: textoLocal(), items: limpios };
        for (const it of limpios) {
          const p = bd.productos.find((x) => x.id === it.producto_id);
          p.stock = r3(p.stock + it.cantidad);
        }
        bd.recepciones.push(r);
        guardar();
        return { estado: 201, datos: r };
      }

      case 'GET configuracion': return elegirCampos(bd.config, PUBLICAS);
      case 'PUT configuracion':
        exigirAdmin(usuario);
        for (const c of PUBLICAS) if (body[c] !== undefined) bd.config[c] = String(body[c]);
        guardar();
        return elegirCampos(bd.config, PUBLICAS);
      case 'GET configuracion/usuarios': exigirAdmin(usuario); return bd.usuarios.map(vistaUsuario);
      case 'POST configuracion/usuarios': {
        exigirAdmin(usuario);
        const { nombre, correo, clave, rol } = body;
        if (!String(nombre || '').trim()) throw invalido('El nombre es obligatorio.');
        if (!/^\S+@\S+\.\S+$/.test(String(correo || ''))) throw invalido('El correo no es válido.');
        if (String(clave || '').length < 6) throw invalido('La contraseña debe tener al menos 6 caracteres.');
        if (!['admin', 'cajero'].includes(rol)) throw invalido('El rol debe ser admin o cajero.');
        if (bd.usuarios.some((u) => u.correo.toLowerCase() === correo.toLowerCase())) throw invalido('Ese correo ya está registrado.');
        const u = { id: siguienteId('usuarios'), nombre: nombre.trim(), correo: correo.trim().toLowerCase(), clave, rol, activo: 1, creado_en: textoLocal() };
        bd.usuarios.push(u);
        guardar();
        return { estado: 201, datos: vistaUsuario(u) };
      }
      case 'PUT configuracion/usuarios/:y': {
        exigirAdmin(usuario);
        const u = bd.usuarios.find((x) => x.id === Number(b));
        if (!u) throw noEncontrado('Usuario no encontrado.');
        if (u.id === usuario.id && (body.activo === false || body.rol === 'cajero')) {
          throw invalido('No puedes desactivarte ni quitarte el rol de administrador a ti mismo.');
        }
        if (body.clave !== undefined && String(body.clave).length < 6) throw invalido('La contraseña debe tener al menos 6 caracteres.');
        if (body.nombre?.trim()) u.nombre = body.nombre.trim();
        if (['admin', 'cajero'].includes(body.rol)) u.rol = body.rol;
        if (body.activo !== undefined) u.activo = body.activo ? 1 : 0;
        if (body.clave) u.clave = body.clave;
        guardar();
        return vistaUsuario(u);
      }

      case 'GET reportes': exigirAdmin(usuario); return generarReporte(q);
      case 'GET reportes/csv':
        exigirAdmin(usuario);
        throw invalido('Esta demo no puede descargar archivos. En AgroPOS instalado este botón descarga el CSV para Excel.');
    }
    throw noEncontrado('Ruta de la API no encontrada.');
  }

  // ---------- fetch('/api/...') → servidor simulado ----------
  const fetchOriginal = window.fetch.bind(window);
  const responder = (estado, datos) =>
    new Response(JSON.stringify(datos), { status: estado, headers: { 'Content-Type': 'application/json' } });

  window.fetch = async function (entrada, opciones = {}) {
    const url = typeof entrada === 'string' ? entrada : entrada.url;
    if (!url.startsWith('/api/')) return fetchOriginal(entrada, opciones);
    const u = new URL(url, 'https://demo.agropos');
    const partes = u.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
    const q = Object.fromEntries(u.searchParams.entries());
    const metodo = (opciones.method || 'GET').toUpperCase();
    const cabeceras = opciones.headers || {};
    const token = String(cabeceras.Authorization || cabeceras.authorization || '').replace('Bearer ', '');
    const usuario = bd.usuarios.find((x) => 'demo-' + x.id === token && x.activo) || null;
    await new Promise((r) => setTimeout(r, 40));
    try {
      const cuerpo = opciones.body ? JSON.parse(opciones.body) : undefined;
      const resultado = manejar(metodo, partes, q, cuerpo, usuario);
      if (resultado && resultado.estado && 'datos' in resultado) return responder(resultado.estado, resultado.datos);
      return responder(200, resultado);
    } catch (e) {
      return responder(e.estado || 500, { error: e.estado ? e.message : 'Error interno: ' + e.message });
    }
  };

  // ---------- Controles propios de la demo ----------
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pesos = (v) => '$' + Math.round(Number(v) || 0).toLocaleString('es-CO');

  window.Demo = {
    iniciado: false,

    ir(pantalla) {
      const login = document.getElementById('pantalla-login');
      const app = document.getElementById('pantalla-app');
      if (pantalla === 'app') {
        login.hidden = true;
        app.hidden = false;
        if (!this.iniciado) {
          this.iniciado = true;
          App.iniciar();
        }
      } else {
        app.hidden = true;
        login.hidden = false;
        if (this.iniciado) location.reload();
      }
    },

    // El recibo se muestra en una ventana dentro de la página.
    recibo(id) {
      let v;
      try { v = obtenerVenta(id); } catch (e) { UI.error(e); return; }
      const n = bd.config;
      const fila = (izq, der, clase = '') => `<div class="r-fila ${clase}"><span>${izq}</span><span>${der}</span></div>`;
      const kg = (x) => Number(x).toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' kg';
      const moneda = (m, mon) => (mon === 'COP' ? pesos(m)
        : (mon === 'USD' ? 'US$' : 'Bs ') + Number(m).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      const metodo = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', digital: 'Pago digital' };
      const html = `
        <div class="recibo-demo">
          <div class="r-centro r-negrita r-grande">${esc(n.negocio_nombre)}</div>
          <div class="r-centro">NIT ${esc(n.negocio_nit)}</div>
          <div class="r-centro">${esc(n.negocio_direccion)}</div>
          <div class="r-sep"></div>
          ${fila('Recibo', esc(v.numero))}${fila('Fecha', esc(v.creado_en))}${fila('Cajero', esc(v.usuario_nombre))}
          ${v.cliente_nombre ? fila('Cliente', esc(v.cliente_nombre)) + fila('C.C.', esc(v.cliente_cedula)) : ''}
          <div class="r-sep"></div>
          ${v.items.map((i) => `<div>${esc(i.nombre)}</div>${fila(i.unidad === 'kg'
            ? `&nbsp;&nbsp;${kg(i.cantidad)} x ${pesos(i.precio_unitario)}/kg`
            : `&nbsp;&nbsp;${i.cantidad} x ${pesos(i.precio_unitario)}`, pesos(i.total))}`).join('')}
          <div class="r-sep"></div>
          ${fila('Total productos', pesos(v.total_bruto))}
          ${v.descuento_puntos ? fila(`Descuento (${v.puntos_redimidos} pts)`, '-' + pesos(v.descuento_puntos)) : ''}
          ${v.redondeo ? fila('Redondeo', (v.redondeo > 0 ? '+' : '-') + pesos(Math.abs(v.redondeo))) : ''}
          ${fila('TOTAL', pesos(v.total), 'r-negrita r-grande')}
          ${fila('IVA incluido', pesos(v.iva), 'r-chico')}
          <div class="r-sep"></div>
          ${v.pagos.map((p) => fila(`${metodo[p.metodo]} ${p.moneda}`, moneda(p.monto, p.moneda))).join('')}
          ${fila('Cambio', pesos(v.cambio_cop), 'r-negrita')}
          ${v.cliente_nombre ? `<div class="r-sep"></div>${fila('Puntos ganados', '+' + v.puntos_ganados)}${v.cliente_puntos !== null ? fila('Saldo de puntos', v.cliente_puntos) : ''}` : ''}
          <div class="r-sep"></div>
          <div class="r-centro">${esc(n.recibo_mensaje)}</div>
        </div>
        <p class="muted" style="margin-top:10px;text-align:center">En AgroPOS instalado este recibo se imprime en la impresora térmica de 80 mm.</p>`;
      UI.modal({ titulo: 'Recibo ' + esc(v.numero), html, botones: [{ texto: 'Cerrar', clase: 'secundario' }] });
    },

    pintarControl() {
      const cont = document.getElementById('demo-control');
      if (!cont) return;
      cont.innerHTML = `
        <span class="demo-etiqueta">DEMO</span>
        <button class="demo-btn ${bd.enLinea ? 'en-linea' : 'sin-linea'}" id="demo-internet" title="Simula que se cae o vuelve el internet">
          <i class="fa-solid ${bd.enLinea ? 'fa-wifi' : 'fa-plane'}"></i> ${bd.enLinea ? 'Con internet' : 'Sin internet'}
        </button>
        <button class="demo-btn" id="demo-reiniciar" title="Borra lo que hiciste y vuelve a los datos de ejemplo">
          <i class="fa-solid fa-rotate-left"></i> Reiniciar
        </button>`;
      cont.querySelector('#demo-internet').onclick = () => {
        bd.enLinea = !bd.enLinea;
        guardar();
        if (bd.enLinea) sincronizar();
        this.pintarControl();
        UI.toast(bd.enLinea ? 'Volvió el internet: las ventas pendientes se suben a la nube.' : 'Sin internet: las ventas se guardan en la caja y quedan pendientes.', bd.enLinea ? 'success' : 'info');
        if (window.App && App.estado) App.actualizarEstado().catch(() => {});
      };
      cont.querySelector('#demo-reiniciar').onclick = async () => {
        if (!(await UI.confirmar('Reiniciar demo', 'Se borran las ventas, productos y clientes que creaste y vuelven los datos de ejemplo. ¿Continuar?'))) return;
        try { localStorage.removeItem(CLAVE_BD); sessionStorage.clear(); localStorage.removeItem('agropos_sesion'); } catch { /* nada */ }
        bd = crearBD();
        guardar();
        location.reload();
      };
    },
  };
})();
