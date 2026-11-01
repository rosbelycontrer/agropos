-- Esquema de la base de datos de AgroPOS (SQLite).
-- Se usa igual en cada caja y en el servidor de la nube.
-- Montos en pesos colombianos (COP). Precios con IVA incluido.

CREATE TABLE IF NOT EXISTS usuarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL,
  correo      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  clave_hash  TEXT NOT NULL,
  rol         TEXT NOT NULL CHECK (rol IN ('admin', 'cajero')),
  activo      INTEGER NOT NULL DEFAULT 1,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS categorias (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre  TEXT NOT NULL UNIQUE,
  emoji   TEXT
);

CREATE TABLE IF NOT EXISTS productos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  plu             TEXT NOT NULL UNIQUE,
  nombre          TEXT NOT NULL,
  categoria_id    INTEGER REFERENCES categorias(id),
  unidad          TEXT NOT NULL CHECK (unidad IN ('kg', 'und')),  -- kg: se pesa · und: por unidad
  precio          REAL NOT NULL CHECK (precio >= 0),              -- COP por kg o por unidad
  iva             REAL NOT NULL DEFAULT 0,                         -- porcentaje (0, 5, 19)
  stock           REAL NOT NULL DEFAULT 0,
  stock_minimo    REAL NOT NULL DEFAULT 0,
  emoji           TEXT,
  activo          INTEGER NOT NULL DEFAULT 1,
  creado_en       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  actualizado_en  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS clientes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cedula     TEXT NOT NULL UNIQUE,
  nombre     TEXT NOT NULL,
  telefono   TEXT,
  puntos     INTEGER NOT NULL DEFAULT 0,
  creado_en  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Tasa del día: cuántos pesos vale 1 dólar y 1 bolívar.
CREATE TABLE IF NOT EXISTS tasas_cambio (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  usd             REAL NOT NULL CHECK (usd > 0),
  ves             REAL NOT NULL CHECK (ves > 0),
  usuario_nombre  TEXT,
  creado_en       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS ventas (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid              TEXT NOT NULL UNIQUE,         -- identificador global (evita duplicados al sincronizar)
  numero            TEXT NOT NULL,                -- número del recibo, ej. CAJA-01-000001
  caja_id           TEXT NOT NULL,
  usuario_id        INTEGER,
  usuario_nombre    TEXT,
  cliente_id        INTEGER,
  cliente_cedula    TEXT,
  cliente_nombre    TEXT,
  total_bruto       REAL NOT NULL,                -- suma de los productos (IVA incluido)
  subtotal          REAL NOT NULL,                -- sin IVA
  iva               REAL NOT NULL,
  descuento_puntos  REAL NOT NULL DEFAULT 0,
  redondeo          REAL NOT NULL DEFAULT 0,      -- ajuste al múltiplo de 50
  total             REAL NOT NULL,                -- lo que paga el cliente en COP
  pagado_cop        REAL NOT NULL,
  cambio_cop        REAL NOT NULL DEFAULT 0,
  tasa_usd          REAL,
  tasa_ves          REAL,
  puntos_ganados    INTEGER NOT NULL DEFAULT 0,
  puntos_redimidos  INTEGER NOT NULL DEFAULT 0,
  inicio_atencion   TEXT,
  fin_atencion      TEXT,
  duracion_seg      INTEGER,
  sin_conexion      INTEGER NOT NULL DEFAULT 0,   -- 1 = se hizo sin conexión con la nube
  sincronizada      INTEGER NOT NULL DEFAULT 0,   -- 1 = ya se subió a la nube
  sincronizada_en   TEXT,
  creado_en         TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS venta_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id         INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id      INTEGER,
  plu              TEXT NOT NULL,
  nombre           TEXT NOT NULL,
  unidad           TEXT NOT NULL,
  cantidad         REAL NOT NULL,       -- kg o unidades
  precio_unitario  REAL NOT NULL,       -- COP por kg o por unidad
  iva              REAL NOT NULL DEFAULT 0,
  total            REAL NOT NULL,
  fuente_peso      TEXT NOT NULL CHECK (fuente_peso IN ('bascula', 'simulador', 'manual', 'unidad'))
);

CREATE TABLE IF NOT EXISTS pagos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id   INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  metodo     TEXT NOT NULL CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia', 'digital')),
  moneda     TEXT NOT NULL CHECK (moneda IN ('COP', 'USD', 'VES')),
  monto      REAL NOT NULL,             -- en la moneda original
  tasa       REAL NOT NULL,             -- pesos por 1 unidad de la moneda
  monto_cop  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS recepciones (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  lote            TEXT NOT NULL UNIQUE,
  proveedor       TEXT,
  notas           TEXT,
  usuario_nombre  TEXT,
  creado_en       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS recepcion_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  recepcion_id    INTEGER NOT NULL REFERENCES recepciones(id) ON DELETE CASCADE,
  producto_id     INTEGER NOT NULL REFERENCES productos(id),
  cantidad        REAL NOT NULL CHECK (cantidad > 0),
  costo_unitario  REAL,
  vence           TEXT
);

CREATE TABLE IF NOT EXISTS configuracion (
  clave  TEXT PRIMARY KEY,
  valor  TEXT
);

CREATE INDEX IF NOT EXISTS idx_ventas_fecha       ON ventas(creado_en);
CREATE INDEX IF NOT EXISTS idx_ventas_sync        ON ventas(sincronizada);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente     ON ventas(cliente_cedula);
CREATE INDEX IF NOT EXISTS idx_items_venta        ON venta_items(venta_id);
CREATE INDEX IF NOT EXISTS idx_pagos_venta        ON pagos(venta_id);
CREATE INDEX IF NOT EXISTS idx_productos_nombre   ON productos(nombre);
