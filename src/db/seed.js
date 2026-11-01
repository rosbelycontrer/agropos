// Datos de ejemplo que se cargan solo cuando la base de datos está vacía.
const { cifrarClave } = require('../services/claves');

const CATEGORIAS = [
  ['Frutas', '🍎'],
  ['Verduras', '🥬'],
  ['Tubérculos y plátano', '🥔'],
  ['Hierbas y aromáticas', '🌿'],
  ['Lácteos y charcutería', '🧀'],
  ['Granero', '🥚'],
];

// [plu, nombre, categoría, unidad, precio COP, iva %, stock, stock mínimo, emoji]
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

module.exports = function sembrar(db) {
  const cargar = db.transaction(() => {
    const insUsuario = db.prepare(
      'INSERT INTO usuarios (nombre, correo, clave_hash, rol) VALUES (?, ?, ?, ?)'
    );
    insUsuario.run('Administrador', 'admin@agropos.com', cifrarClave('admin123'), 'admin');
    insUsuario.run('Cajero Principal', 'cajero@agropos.com', cifrarClave('cajero123'), 'cajero');

    const insCategoria = db.prepare('INSERT INTO categorias (nombre, emoji) VALUES (?, ?)');
    const idCategoria = {};
    for (const [nombre, emoji] of CATEGORIAS) {
      idCategoria[nombre] = insCategoria.run(nombre, emoji).lastInsertRowid;
    }

    const insProducto = db.prepare(`
      INSERT INTO productos (plu, nombre, categoria_id, unidad, precio, iva, stock, stock_minimo, emoji)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const [plu, nombre, cat, unidad, precio, iva, stock, minimo, emoji] of PRODUCTOS) {
      insProducto.run(plu, nombre, idCategoria[cat], unidad, precio, iva, stock, minimo, emoji);
    }

    // Tasas de ejemplo: cámbialas desde la pantalla de cobro (tasa del día).
    db.prepare('INSERT INTO tasas_cambio (usd, ves, usuario_nombre) VALUES (?, ?, ?)')
      .run(3900, 15, 'Datos de ejemplo');

    const insCliente = db.prepare('INSERT INTO clientes (cedula, nombre, telefono, puntos) VALUES (?, ?, ?, ?)');
    insCliente.run('1090123456', 'María Fernanda Rojas', '3001234567', 120);
    insCliente.run('88234567', 'Carlos Andrés Peña', '3157654321', 40);

    const recepcion = db.prepare(
      'INSERT INTO recepciones (lote, proveedor, notas, usuario_nombre) VALUES (?, ?, ?, ?)'
    ).run('L-0001', 'Cenabastos Cúcuta', 'Inventario inicial', 'Administrador');
    const insItem = db.prepare(
      'INSERT INTO recepcion_items (recepcion_id, producto_id, cantidad, costo_unitario) VALUES (?, ?, ?, ?)'
    );
    for (const p of db.prepare('SELECT id, precio, stock FROM productos').all()) {
      insItem.run(recepcion.lastInsertRowid, p.id, p.stock, Math.round(p.precio * 0.7));
    }
  });
  cargar();
};
