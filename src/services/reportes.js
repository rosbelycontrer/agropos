// Indicadores del negocio para un rango de fechas y exportación a CSV.
const db = require('../db/database');
const { hoy, esFechaDia } = require('../utils/fechas');
const { invalido } = require('../utils/errores');

function filtro({ desde, hasta, caja }) {
  desde = desde || hoy();
  hasta = hasta || hoy();
  if (!esFechaDia(desde) || !esFechaDia(hasta)) throw invalido('Las fechas deben tener el formato AAAA-MM-DD.');
  const params = { desde, hasta };
  let donde = "v.creado_en >= @desde AND v.creado_en < date(@hasta, '+1 day')";
  if (caja) {
    donde += ' AND v.caja_id = @caja';
    params.caja = caja;
  }
  return { donde, params, desde, hasta, caja: caja || null };
}

const porcentaje = (parte, total) => (total ? Math.round((parte / total) * 1000) / 10 : 0);

function generar(opciones = {}) {
  const { donde, params, desde, hasta, caja } = filtro(opciones);
  const uno = (sql) => db.prepare(sql).get(params);
  const varios = (sql) => db.prepare(sql).all(params);

  const resumen = uno(`
    SELECT COUNT(*) AS ventas, COALESCE(SUM(total), 0) AS total, COALESCE(AVG(total), 0) AS ticket_promedio,
      COALESCE(SUM(iva), 0) AS iva, COALESCE(SUM(descuento_puntos), 0) AS descuento_puntos,
      COALESCE(SUM(redondeo), 0) AS redondeo, COALESCE(SUM(cambio_cop), 0) AS cambio_entregado
    FROM ventas v WHERE ${donde}`);
  resumen.ticket_promedio = Math.round(resumen.ticket_promedio);

  const atencion = uno(`
    SELECT COUNT(*) AS medidas, AVG(duracion_seg) AS promedio_seg, MIN(duracion_seg) AS minimo_seg, MAX(duracion_seg) AS maximo_seg
    FROM ventas v WHERE ${donde} AND duracion_seg IS NOT NULL`);
  atencion.promedio_seg = atencion.promedio_seg === null ? null : Math.round(atencion.promedio_seg);

  const fuentes = varios(`
    SELECT i.fuente_peso AS fuente, COUNT(*) AS lineas, SUM(i.cantidad) AS kg
    FROM venta_items i JOIN ventas v ON v.id = i.venta_id
    WHERE ${donde} AND i.unidad = 'kg' GROUP BY i.fuente_peso`);
  const lineasPeso = fuentes.reduce((s, f) => s + f.lineas, 0);
  const conBascula = fuentes.filter((f) => f.fuente === 'bascula' || f.fuente === 'simulador')
    .reduce((s, f) => s + f.lineas, 0);
  const pesaje = {
    lineas_por_peso: lineasPeso,
    con_bascula: conBascula,
    porcentaje_bascula: porcentaje(conBascula, lineasPeso),
    detalle: fuentes,
  };

  const conexion = uno(`
    SELECT COALESCE(SUM(sin_conexion), 0) AS ventas_sin_conexion,
      COALESCE(SUM(CASE WHEN sin_conexion = 1 THEN total END), 0) AS total_sin_conexion,
      COALESCE(SUM(CASE WHEN sincronizada = 0 THEN 1 ELSE 0 END), 0) AS pendientes_sincronizar
    FROM ventas v WHERE ${donde}`);
  conexion.porcentaje = porcentaje(conexion.ventas_sin_conexion, resumen.ventas);

  // Cliente que regresa: compró en el período y tiene 2 o más compras hasta la fecha final.
  const clientes = uno(`
    WITH c AS (
      SELECT cliente_cedula AS cedula, COUNT(*) AS compras FROM ventas v
      WHERE ${donde} AND cliente_cedula IS NOT NULL GROUP BY cliente_cedula
    )
    SELECT COUNT(*) AS identificados,
      COALESCE(SUM(CASE WHEN (SELECT COUNT(*) FROM ventas v2 WHERE v2.cliente_cedula = c.cedula
        AND v2.creado_en < date(@hasta, '+1 day')) >= 2 THEN 1 ELSE 0 END), 0) AS recurrentes,
      COALESCE(SUM(compras), 0) AS ventas_con_cliente
    FROM c`);
  clientes.porcentaje_recurrentes = porcentaje(clientes.recurrentes, clientes.identificados);
  clientes.porcentaje_ventas_con_cliente = porcentaje(clientes.ventas_con_cliente, resumen.ventas);

  const porMoneda = varios(`
    SELECT p.moneda, COUNT(*) AS pagos, SUM(p.monto) AS monto, SUM(p.monto_cop) AS monto_cop
    FROM pagos p JOIN ventas v ON v.id = p.venta_id WHERE ${donde}
    GROUP BY p.moneda ORDER BY monto_cop DESC`);
  const porMetodo = varios(`
    SELECT p.metodo, COUNT(*) AS pagos, SUM(p.monto_cop) AS monto_cop
    FROM pagos p JOIN ventas v ON v.id = p.venta_id WHERE ${donde}
    GROUP BY p.metodo ORDER BY monto_cop DESC`);

  const porDia = varios(`
    SELECT date(v.creado_en) AS dia, COUNT(*) AS ventas, SUM(total) AS total
    FROM ventas v WHERE ${donde} GROUP BY dia ORDER BY dia`);
  const porCaja = varios(`
    SELECT caja_id, COUNT(*) AS ventas, SUM(total) AS total FROM ventas v WHERE ${donde} GROUP BY caja_id ORDER BY caja_id`);
  const porCajero = varios(`
    SELECT usuario_nombre AS cajero, COUNT(*) AS ventas, SUM(total) AS total, ROUND(AVG(duracion_seg)) AS promedio_seg
    FROM ventas v WHERE ${donde} GROUP BY usuario_nombre ORDER BY total DESC`);
  const topProductos = varios(`
    SELECT i.plu, i.nombre, i.unidad, SUM(i.cantidad) AS cantidad, SUM(i.total) AS total
    FROM venta_items i JOIN ventas v ON v.id = i.venta_id WHERE ${donde}
    GROUP BY i.plu, i.nombre, i.unidad ORDER BY total DESC LIMIT 10`);

  return {
    desde, hasta, caja,
    resumen, atencion, pesaje, conexion, clientes,
    por_moneda: porMoneda, por_metodo: porMetodo, por_dia: porDia,
    por_caja: porCaja, por_cajero: porCajero, top_productos: topProductos,
  };
}

// ---------- CSV (separado por ";" y con coma decimal, como lo abre Excel en español) ----------
function celda(valor) {
  if (valor === null || valor === undefined) return '';
  let texto = typeof valor === 'number' ? String(valor).replace('.', ',') : String(valor);
  if (/[";\n\r]/.test(texto)) texto = '"' + texto.replace(/"/g, '""') + '"';
  return texto;
}

function aCsv(columnas, filas) {
  const lineas = [columnas.map((c) => celda(c.titulo)).join(';')];
  for (const f of filas) lineas.push(columnas.map((c) => celda(f[c.campo])).join(';'));
  return '﻿' + lineas.join('\r\n') + '\r\n';
}

const COLUMNAS = {
  ventas: [
    ['numero', 'Número'], ['creado_en', 'Fecha'], ['caja_id', 'Caja'], ['usuario_nombre', 'Cajero'],
    ['cliente_cedula', 'Cédula cliente'], ['cliente_nombre', 'Cliente'], ['total_bruto', 'Total productos'],
    ['descuento_puntos', 'Descuento puntos'], ['redondeo', 'Redondeo'], ['iva', 'IVA'], ['total', 'Total'],
    ['pagado_cop', 'Pagado (COP)'], ['cambio_cop', 'Cambio'], ['metodos', 'Métodos'], ['monedas', 'Monedas'],
    ['duracion_seg', 'Atención (seg)'], ['sin_conexion', 'Sin conexión'], ['sincronizada', 'Sincronizada'],
  ],
  items: [
    ['numero', 'Venta'], ['creado_en', 'Fecha'], ['caja_id', 'Caja'], ['plu', 'PLU'], ['nombre', 'Producto'],
    ['unidad', 'Unidad'], ['cantidad', 'Cantidad'], ['precio_unitario', 'Precio'], ['total', 'Total'],
    ['fuente_peso', 'Origen del peso'],
  ],
  pagos: [
    ['numero', 'Venta'], ['creado_en', 'Fecha'], ['caja_id', 'Caja'], ['metodo', 'Método'], ['moneda', 'Moneda'],
    ['monto', 'Monto'], ['tasa', 'Tasa'], ['monto_cop', 'Monto (COP)'],
  ],
};

function exportarCsv(tipo, opciones = {}) {
  const { donde, params, desde, hasta } = filtro(opciones);
  let filas;
  if (tipo === 'ventas') {
    filas = db.prepare(`
      SELECT v.*,
        (SELECT group_concat(DISTINCT metodo) FROM pagos WHERE venta_id = v.id) AS metodos,
        (SELECT group_concat(DISTINCT moneda) FROM pagos WHERE venta_id = v.id) AS monedas
      FROM ventas v WHERE ${donde} ORDER BY v.id`).all(params);
    filas.forEach((f) => {
      f.sin_conexion = f.sin_conexion ? 'Sí' : 'No';
      f.sincronizada = f.sincronizada ? 'Sí' : 'No';
    });
  } else if (tipo === 'items') {
    filas = db.prepare(`
      SELECT v.numero, v.creado_en, v.caja_id, i.* FROM venta_items i JOIN ventas v ON v.id = i.venta_id
      WHERE ${donde} ORDER BY v.id, i.id`).all(params);
  } else if (tipo === 'pagos') {
    filas = db.prepare(`
      SELECT v.numero, v.creado_en, v.caja_id, p.* FROM pagos p JOIN ventas v ON v.id = p.venta_id
      WHERE ${donde} ORDER BY v.id, p.id`).all(params);
  } else if (tipo === 'resumen') {
    return { nombre: `resumen_${desde}_${hasta}.csv`, contenido: resumenCsv(generar(opciones)) };
  } else {
    throw invalido('Tipo de reporte no válido. Usa: resumen, ventas, items o pagos.');
  }
  const columnas = COLUMNAS[tipo].map(([campo, titulo]) => ({ campo, titulo }));
  return { nombre: `${tipo}_${desde}_${hasta}.csv`, contenido: aCsv(columnas, filas) };
}

function resumenCsv(r) {
  const filas = [
    ['Período', `${r.desde} a ${r.hasta}`],
    ['Ventas', r.resumen.ventas],
    ['Total vendido (COP)', r.resumen.total],
    ['Ticket promedio (COP)', r.resumen.ticket_promedio],
    ['Tiempo promedio de atención (seg)', r.atencion.promedio_seg],
    ['% productos por peso pesados con báscula', r.pesaje.porcentaje_bascula],
    ['Ventas sin conexión', r.conexion.ventas_sin_conexion],
    ['% ventas sin conexión', r.conexion.porcentaje],
    ['Clientes identificados', r.clientes.identificados],
    ['Clientes que regresan', r.clientes.recurrentes],
    ['% clientes que regresan', r.clientes.porcentaje_recurrentes],
    ...r.por_moneda.map((m) => [`Pagos en ${m.moneda} (monto original)`, m.monto]),
    ...r.por_moneda.map((m) => [`Pagos en ${m.moneda} (en COP)`, m.monto_cop]),
    ...r.por_metodo.map((m) => [`Método ${m.metodo} (COP)`, m.monto_cop]),
  ].map(([indicador, valor]) => ({ indicador, valor }));
  return aCsv([{ campo: 'indicador', titulo: 'Indicador' }, { campo: 'valor', titulo: 'Valor' }], filas);
}

module.exports = { generar, exportarCsv };
