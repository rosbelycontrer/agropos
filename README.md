# AgroPOS — Punto de venta para fruver

Sistema de punto de venta para un fruver en Cúcuta (Colombia): báscula por puerto serie,
cobro en pesos, dólares y bolívares, puntos para clientes, inventario por lotes, reportes
y **funciona sin internet** (sube las ventas a la nube cuando vuelve la conexión).

- **Backend:** Node.js + Express
- **Base de datos:** SQLite (better-sqlite3), un archivo por caja en `datos/`
- **Frontend:** HTML, CSS y JavaScript sin frameworks. Sin CDN: los íconos se sirven desde el propio equipo.
- **Báscula:** paquete `serialport` (RS-232 o USB) + simulador para probar sin báscula.

---

## 1. Instalar (una sola vez)

1. **Instala Node.js**: entra a <https://nodejs.org>, descarga la versión **LTS** y
   ejecuta el instalador (Siguiente → Siguiente → Instalar).
2. **Instala AgroPOS**: haz doble clic en **`INICIAR-CAJA.bat`**. La primera vez descarga
   las librerías (necesita internet unos minutos). Después ya no necesita internet.

> Si prefieres la terminal: abre una en esta carpeta y escribe `npm install`.

## 2. Abrir AgroPOS

**Con un solo comando (recomendado para desarrollar):**

```
npm run dev
```

Abre la caja (<http://localhost:3000>) y la nube (<http://localhost:4000>) en la misma terminal,
abre el navegador solo, y reinicia el servidor cada vez que guardas un cambio en `src/`.
Si cambias algo en `public/`, solo recarga la página (F5). Para apagar todo: `Ctrl + C`.
(Si no quieres que se abra el navegador: `npm run dev -- --sin-navegador`.)

**Otras formas:**

- Doble clic en **`INICIAR-CAJA.bat`** → se abre Chrome en <http://localhost:3000>.
  (En terminal: `npm start`, solo la caja.)
- **No cierres la ventana negra** mientras usas AgroPOS: ese es el servidor.
  Para apagarlo, ciérrala o presiona `Ctrl + C`.

Usuarios de ejemplo:

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@agropos.com | admin123 |
| Cajero | cajero@agropos.com | cajero123 |

Clientes de ejemplo (cédulas): `1090123456` (120 puntos) y `88234567` (40 puntos).

## 3. Servidor en la nube (modo sin internet)

Cada caja guarda sus ventas en su propio archivo `datos/caja.db`. Cada 15 segundos intenta
subir las ventas pendientes al servidor de la nube, que es **este mismo proyecto** ejecutado con:

```
npm run start:nube        (o doble clic en INICIAR-NUBE.bat)
```

La nube abre en el puerto 4000 y guarda todo en `datos/nube.db`. Allí se ven los reportes
de todas las cajas juntas (se puede filtrar por caja).

Para probarlo en un solo computador: abre `INICIAR-CAJA.bat` y `INICIAR-NUBE.bat` a la vez.
Si cierras la nube, las ventas se marcan como "sin conexión" y quedan pendientes; al volver
a abrirla se suben solas.

Para varias cajas o una nube real, copia `.env.ejemplo` como `.env` y cambia:
`CAJA_ID` (distinto en cada caja), `NUBE_URL` (dirección del servidor) y `CLAVE_SYNC`
(la misma en cajas y nube).

## 4. Conectar la báscula

1. Conecta la báscula (cable RS-232 o USB) y enciéndela.
2. Entra como administrador → **Configuración** → **Báscula**.
3. Modo: **Báscula real**. Toca el botón del enchufe para ver los puertos (ej. `COM3`).
4. Pon la velocidad, bits y paridad que dice el manual de la báscula (lo más común: 9600, 8, ninguna, 1).
5. Si la báscula solo manda el peso cuando se le pide, escribe el comando (ej. `P` o `W\r`).
6. **Guardar y reconectar**. En el panel de ventas debe verse el peso en vivo.

Se reconocen los formatos más comunes: `ST,GS,+  1.234kg`, `1.234 kg`, `1234 g`, `2.50 lb`.
`ST` = estable, `US` = inestable. CERO y TARA se hacen en el programa.

**El cajero no digita el peso:** al tocar un producto por kg, el servidor toma el peso estable
de la báscula y lo guarda. Solo un administrador puede registrar un peso a mano
(por la API, para cuando la báscula falla) y queda marcado en los reportes.

## 5. Cómo se usa (cajero)

1. Busca el producto por nombre o PLU (tecla **F2**). Con **Enter** se agrega el PLU exacto.
2. Productos por kg: pon el producto en la báscula, espera "Estable" y tócalo. Precio = precio/kg × peso.
   Productos por unidad: tócalo y usa + / −.
3. (Opcional) Escribe la cédula del cliente para sumar puntos o redimirlos. Si no existe, se registra ahí mismo.
4. Elige método (efectivo, tarjeta, transferencia, pago digital) y moneda (COP, USD, VES).
5. Escribe lo que entrega el cliente o usa los botones de billetes. Para pagos mixtos usa **+**.
6. Se muestra el cambio en pesos y en qué billetes y monedas darlo. **Confirmar pago** → imprimir recibo.

Reglas de dinero:
- Precios con IVA incluido (frutas y verduras frescas: 0 %).
- **Redondeo comercial:** el total en pesos se ajusta al múltiplo de $50 más cercano.
- Tarjeta, transferencia y pago digital no dan cambio; el cambio siempre se entrega en pesos.
- Tasa del día (pesos por dólar y por bolívar): la cambia el administrador en la zona de cobro.
- Puntos: 1 punto por cada $1.000 pagados; 1 punto = $10 al redimir (se cambia en Configuración).

## 6. Probar el backend

Con AgroPOS abierto (`npm start`), en otra terminal:

```
npm run prueba
```

Hace login, pesa con el simulador, registra ventas en pesos y dólares, verifica el redondeo,
el cambio, que el cajero no pueda digitar el peso, reportes, CSV, productos y lotes.
Ojo: las ventas de prueba quedan guardadas. Para empezar de cero: cierra AgroPOS y ejecuta
`npm run reiniciar-bd`.

## 7. Estructura

```
├── INICIAR-CAJA.bat / INICIAR-NUBE.bat   Doble clic para abrir
├── package.json
├── .env.ejemplo                 Ajustes (caja, nube, clave de sincronización)
├── src/
│   ├── server.js                Arranque (caja o nube)
│   ├── config.js
│   ├── db/                      schema.sql, database.js, seed.js (datos de ejemplo)
│   ├── middleware/auth.js       Sesión y roles
│   ├── routes/                  API: auth, productos, clientes, tasas, bascula, ventas,
│   │                            recepciones, reportes, configuracion, estado, sync
│   ├── services/                bascula, ventas, dinero, sync, reportes, claves, tokens…
│   └── utils/
├── public/                      Páginas: index.html (login), app.html (panel), recibo.html
├── scripts/                     prueba.js, reiniciar-bd.js
└── datos/                       Bases de datos SQLite (se crean solas)
```

## 8. API (resumen)

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/auth/login` | Iniciar sesión → token |
| GET | `/api/estado` | Nube, báscula e inventario |
| GET | `/api/productos?buscar=` | Buscar por nombre o PLU |
| POST/PUT | `/api/productos` | Crear / editar (admin) |
| GET | `/api/bascula/flujo` | Peso en tiempo real (SSE) |
| POST | `/api/bascula/cero` · `/tara` · `/capturar` · `/simular` | Báscula |
| GET/POST | `/api/tasas` | Tasa del día |
| GET/POST/PUT | `/api/clientes/:cedula` | Fidelización |
| POST | `/api/ventas` | Registrar venta |
| GET | `/api/ventas/:id` | Venta y recibo |
| GET/POST | `/api/recepciones` | Lotes de mercancía |
| GET | `/api/reportes` · `/api/reportes/csv?tipo=` | Reportes (admin) |
| POST | `/api/sync/ventas` | Solo nube: recibe ventas de las cajas |

La versión anterior (solo diseño, sin servidor) quedó guardada en `_version-anterior/`.
