// Cálculos de dinero compartidos por el servidor (Node) y el navegador.
// El servidor lo publica en /js/compartido/dinero.js para que ambos calculen igual.
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Dinero = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  const MULTIPLO = 50;

  // Billetes y monedas colombianos en circulación.
  const DENOMINACIONES = [
    { valor: 100000, tipo: 'billete' },
    { valor: 50000, tipo: 'billete' },
    { valor: 20000, tipo: 'billete' },
    { valor: 10000, tipo: 'billete' },
    { valor: 5000, tipo: 'billete' },
    { valor: 2000, tipo: 'billete' },
    { valor: 1000, tipo: 'moneda' },
    { valor: 500, tipo: 'moneda' },
    { valor: 200, tipo: 'moneda' },
    { valor: 100, tipo: 'moneda' },
    { valor: 50, tipo: 'moneda' },
  ];

  const MONEDAS = ['COP', 'USD', 'VES'];
  const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'digital'];

  // Redondeo comercial: al múltiplo de 50 más cercano.
  function redondearComercial(valor) {
    return Math.round(Number(valor) / MULTIPLO) * MULTIPLO;
  }

  function desglosar(monto) {
    let resto = redondearComercial(monto);
    const partes = [];
    for (const d of DENOMINACIONES) {
      const cantidad = Math.floor(resto / d.valor);
      if (cantidad > 0) {
        partes.push({ valor: d.valor, tipo: d.tipo, cantidad });
        resto -= cantidad * d.valor;
      }
    }
    return partes;
  }

  // tasas = { USD: pesos por dólar, VES: pesos por bolívar }
  function tasaDe(moneda, tasas) {
    if (moneda === 'COP') return 1;
    const tasa = Number(tasas && tasas[moneda]);
    return tasa > 0 ? tasa : 0;
  }

  function aPesos(monto, moneda, tasas) {
    return Math.round(Number(monto) * tasaDe(moneda, tasas));
  }

  function dePesos(pesos, moneda, tasas) {
    const tasa = tasaDe(moneda, tasas);
    if (!tasa) return 0;
    return Math.round((Number(pesos) / tasa) * 100) / 100;
  }

  // lineas: [{ precio, cantidad, iva }] → totales de la venta.
  function calcularVenta(lineas, descuento) {
    let totalBruto = 0;
    let iva = 0;
    const detalle = lineas.map(function (l) {
      const total = Math.round(Number(l.precio) * Number(l.cantidad));
      const ivaLinea = Number(l.iva) > 0 ? total - total / (1 + Number(l.iva) / 100) : 0;
      totalBruto += total;
      iva += ivaLinea;
      return Object.assign({}, l, { total: total });
    });
    const desc = Math.min(Math.max(0, Math.round(Number(descuento) || 0)), totalBruto);
    const aPagar = totalBruto - desc;
    if (totalBruto > 0) iva = iva * (aPagar / totalBruto);
    const total = redondearComercial(aPagar);
    const ivaRedondeado = Math.round(iva);
    return {
      lineas: detalle,
      total_bruto: totalBruto,
      descuento: desc,
      subtotal: aPagar - ivaRedondeado,
      iva: ivaRedondeado,
      redondeo: total - aPagar,
      total: total,
    };
  }

  // pagos: [{ metodo, moneda, monto }] → cuánto se pagó, cuánto falta y el cambio.
  function calcularCobro(total, pagos, tasas) {
    const errores = [];
    let pagado = 0;
    let efectivo = 0;
    let otros = 0;
    const detalle = (pagos || []).map(function (p) {
      const tasa = tasaDe(p.moneda, tasas);
      if (MONEDAS.indexOf(p.moneda) < 0) errores.push('Moneda no válida: ' + p.moneda);
      else if (!tasa) errores.push('Falta la tasa del día para ' + p.moneda);
      if (METODOS.indexOf(p.metodo) < 0) errores.push('Método de pago no válido: ' + p.metodo);
      const monto = Number(p.monto);
      if (!(monto > 0)) errores.push('Cada pago debe tener un monto mayor que cero');
      const cop = Math.round((monto || 0) * tasa);
      pagado += cop;
      if (p.metodo === 'efectivo') efectivo += cop;
      else otros += cop;
      return { metodo: p.metodo, moneda: p.moneda, monto: monto, tasa: tasa, monto_cop: cop };
    });

    const diferencia = redondearComercial(pagado - total);
    const falta = diferencia < 0 ? -diferencia : 0;
    const cambio = diferencia > 0 ? diferencia : 0;
    // Se tolera la diferencia de redondeo al convertir (ej. el total en centavos de dólar).
    if (redondearComercial(otros - total) > 0) {
      errores.push('Tarjeta, transferencia y pago digital no pueden superar el total (no dan cambio).');
    }
    if (cambio > efectivo) {
      errores.push('El cambio no puede ser mayor que el efectivo recibido.');
    }
    return {
      pagos: detalle,
      pagado_cop: pagado,
      falta: falta,
      cambio: cambio,
      desglose: desglosar(cambio),
      completo: falta === 0 && errores.length === 0 && detalle.length > 0,
      errores: errores,
    };
  }

  return {
    MULTIPLO: MULTIPLO,
    DENOMINACIONES: DENOMINACIONES,
    MONEDAS: MONEDAS,
    METODOS: METODOS,
    redondearComercial: redondearComercial,
    desglosar: desglosar,
    tasaDe: tasaDe,
    aPesos: aPesos,
    dePesos: dePesos,
    calcularVenta: calcularVenta,
    calcularCobro: calcularCobro,
  };
});
