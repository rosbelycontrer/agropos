// Prueba rápida del backend. Primero abre AgroPOS con "npm start" en otra ventana
// y luego ejecuta "npm run prueba". Revisa que todo responda como se espera.
const BASE = process.env.URL_PRUEBA || 'http://localhost:3000';
let fallos = 0;

function ok(condicion, mensaje, detalle) {
  console.log(`${condicion ? '  ✔' : '  ✘'} ${mensaje}${detalle !== undefined ? '  →  ' + detalle : ''}`);
  if (!condicion) fallos++;
}

async function api(ruta, { token, metodo = 'GET', cuerpo } = {}) {
  const resp = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const tipo = resp.headers.get('content-type') || '';
  const datos = tipo.includes('json') ? await resp.json() : await resp.text();
  return { estado: resp.status, datos };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarBascula(token, condicion) {
  for (let i = 0; i < 40; i++) {
    const { datos } = await api('/api/bascula', { token });
    if (condicion(datos)) return datos;
    await esperar(200);
  }
  return null;
}

async function pesar(token, kg) {
  // Espera a que el plato quede vacío y estable antes de borrar la tara.
  await api('/api/bascula/simular', { token, metodo: 'POST', cuerpo: { peso: 0 } });
  await esperarBascula(token, (b) => b.estable && Math.abs(b.bruto - b.cero) < 0.005);
  await api('/api/bascula/tara', { token, metodo: 'POST' });
  await api('/api/bascula/simular', { token, metodo: 'POST', cuerpo: { peso: kg } });
  await esperarBascula(token, (b) => b.estable && Math.abs(b.neto - kg) < 0.01);
  const captura = await api('/api/bascula/capturar', { token, metodo: 'POST' });
  await api('/api/bascula/simular', { token, metodo: 'POST', cuerpo: { peso: 0 } });
  return captura;
}

async function main() {
  console.log(`\nProbando AgroPOS en ${BASE}\n`);

  const malo = await api('/api/auth/login', { metodo: 'POST', cuerpo: { correo: 'admin@agropos.com', clave: 'mala' } });
  ok(malo.estado === 401, 'Contraseña incorrecta es rechazada');

  const login = await api('/api/auth/login', { metodo: 'POST', cuerpo: { correo: 'admin@agropos.com', clave: 'admin123' } });
  ok(login.estado === 200 && login.datos.token, 'Login de administrador', login.datos.usuario?.rol);
  const admin = login.datos.token;

  const cajeroLogin = await api('/api/auth/login', { metodo: 'POST', cuerpo: { correo: 'cajero@agropos.com', clave: 'cajero123' } });
  ok(cajeroLogin.estado === 200, 'Login de cajero', cajeroLogin.datos.usuario?.rol);
  const cajero = cajeroLogin.datos.token;

  ok((await api('/api/productos')).estado === 401, 'Sin sesión no se ven los productos');

  const estado = await api('/api/estado', { token: admin });
  ok(estado.estado === 200, 'Estado general', `báscula: ${estado.datos.bascula?.modo}, nube: ${estado.datos.nube?.conectada ? 'conectada' : 'sin conexión'}`);

  const tomate = (await api('/api/productos?buscar=tomate', { token: cajero })).datos[0];
  ok(tomate?.plu === '4664', 'Buscar producto por nombre', tomate?.nombre);
  const porPlu = (await api('/api/productos?buscar=7001', { token: cajero })).datos[0];
  ok(porPlu?.nombre?.startsWith('Huevo'), 'Buscar producto por PLU', porPlu?.nombre);

  const tasas = (await api('/api/tasas', { token: cajero })).datos;
  ok(tasas.USD > 0 && tasas.VES > 0, 'Tasa del día', `USD ${tasas.USD} · VES ${tasas.VES}`);

  const captura = await pesar(cajero, 1.25);
  ok(captura.estado === 200 && Math.abs(captura.datos.peso - 1.25) < 0.01, 'Báscula simulada: capturar 1,25 kg', captura.datos.peso ?? captura.datos.error);

  const cliente = (await api('/api/clientes/1090123456', { token: cajero })).datos;
  ok(cliente.puntos >= 0, 'Buscar cliente por cédula', `${cliente.nombre}, ${cliente.puntos} puntos`);

  const venta = await api('/api/ventas', {
    token: cajero,
    metodo: 'POST',
    cuerpo: {
      items: [{ producto_id: tomate.id, captura_id: captura.datos.id }, { producto_id: porPlu.id, cantidad: 6 }],
      cliente_cedula: '1090123456',
      puntos_redimir: 10,
      pagos: [{ metodo: 'efectivo', moneda: 'COP', monto: 50000 }],
      inicio_atencion: new Date(Date.now() - 95000).toISOString(),
    },
  });
  const v = venta.datos;
  ok(venta.estado === 201, 'Registrar venta en efectivo', v.numero || v.error);
  if (venta.estado === 201) {
    // 1,25 kg × 4.800 = 6.000 ; 6 huevos × 650 = 3.900 ; −10 puntos × $10 = 9.800
    ok(v.total_bruto === 9900 && v.total === 9800, 'Precio por kg × peso y descuento por puntos', `total ${v.total}`);
    ok(v.total % 50 === 0, 'Total redondeado al múltiplo de 50');
    ok(v.cambio_cop === 40200, 'Cambio calculado', `${v.cambio_cop} en ${v.desglose_cambio.map((d) => `${d.cantidad}×${d.valor}`).join(', ')}`);
    ok(v.items[0].fuente_peso === 'simulador', 'El peso viene de la báscula, no del cajero');
    ok(v.duracion_seg >= 90, 'Tiempo de atención guardado', `${v.duracion_seg} s`);
  }

  const reutilizar = await api('/api/ventas', {
    token: cajero, metodo: 'POST',
    cuerpo: { items: [{ producto_id: tomate.id, captura_id: captura.datos.id }], pagos: [{ metodo: 'efectivo', moneda: 'COP', monto: 50000 }] },
  });
  ok(reutilizar.estado === 400, 'No se puede reutilizar un peso ya vendido', reutilizar.datos.error);

  const manual = await api('/api/ventas', {
    token: cajero, metodo: 'POST',
    cuerpo: { items: [{ producto_id: tomate.id, peso_manual: 2 }], pagos: [{ metodo: 'efectivo', moneda: 'COP', monto: 50000 }] },
  });
  ok(manual.estado === 400, 'El cajero no puede digitar el peso', manual.datos.error);

  const captura2 = await pesar(cajero, 2);
  const enDolares = await api('/api/ventas', {
    token: cajero, metodo: 'POST',
    cuerpo: {
      items: [{ producto_id: tomate.id, captura_id: captura2.datos.id }],
      pagos: [{ metodo: 'efectivo', moneda: 'USD', monto: 5 }],
    },
  });
  // 2 kg × 4.800 = 9.600 ; cambio = 5 USD × tasa del día − 9.600 (usa la tasa guardada, que el admin puede cambiar)
  ok(enDolares.estado === 201 && enDolares.datos.total === 9600 && enDolares.datos.cambio_cop === 5 * tasas.USD - 9600,
    'Venta pagada en dólares', `total ${enDolares.datos.total}, cambio ${enDolares.datos.cambio_cop} COP`);

  const tarjetaDeMas = await api('/api/ventas', {
    token: cajero, metodo: 'POST',
    cuerpo: { items: [{ producto_id: porPlu.id, cantidad: 1 }], pagos: [{ metodo: 'tarjeta', moneda: 'COP', monto: 5000 }] },
  });
  ok(tarjetaDeMas.estado === 400, 'La tarjeta no puede pasarse del total', tarjetaDeMas.datos.error);

  ok((await api('/api/reportes', { token: cajero })).estado === 403, 'El cajero no ve reportes');
  const rep = await api('/api/reportes', { token: admin });
  ok(rep.estado === 200 && rep.datos.resumen.ventas >= 2, 'Reporte del día',
    `${rep.datos.resumen.ventas} ventas, atención ${rep.datos.atencion.promedio_seg} s, báscula ${rep.datos.pesaje.porcentaje_bascula}%`);

  const csv = await api('/api/reportes/csv?tipo=ventas', { token: admin });
  ok(csv.estado === 200 && csv.datos.includes('Número;Fecha'), 'Exportar CSV de ventas');

  const productoNuevo = await api('/api/productos', {
    token: admin, metodo: 'POST',
    cuerpo: { plu: 'T' + Date.now().toString().slice(-6), nombre: 'Producto de prueba', unidad: 'kg', precio: 1000, stock_minimo: 1 },
  });
  ok(productoNuevo.estado === 201, 'Crear producto (admin)', productoNuevo.datos.plu);
  const recepcion = await api('/api/recepciones', {
    token: admin, metodo: 'POST',
    cuerpo: { proveedor: 'Prueba', items: [{ producto_id: productoNuevo.datos.id, cantidad: 10 }] },
  });
  ok(recepcion.estado === 201, 'Recepción de mercancía por lote', recepcion.datos.lote);
  const actualizado = (await api(`/api/productos/${productoNuevo.datos.id}`, { token: admin })).datos;
  ok(actualizado.stock === 10, 'El lote sumó al stock', actualizado.stock);
  await api(`/api/productos/${productoNuevo.datos.id}`, { token: admin, metodo: 'PUT', cuerpo: { activo: false } });

  const sync = (await api('/api/estado', { token: admin })).datos.nube;
  console.log(`\n  Nube: ${sync.conectada ? 'conectada' : 'sin conexión'} · ventas pendientes por subir: ${sync.pendientes}`);
  console.log(fallos ? `\n${fallos} prueba(s) fallaron.\n` : '\nTodas las pruebas pasaron.\n');
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => {
  console.error('\nNo se pudo conectar con AgroPOS. ¿Está abierto con "npm start"?\n', e.message);
  process.exit(1);
});
