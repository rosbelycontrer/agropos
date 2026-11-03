# Memoria del proyecto AgroPOS

Historial de decisiones y cambios. Lo más reciente va arriba en el registro.

## Estado actual

- **Fase:** sistema completo v1.0. Backend probado: `npm run prueba` pasa 26/26 y la sincronización caja → nube funciona.
- **Siguiente:** el usuario prueba la nueva pantalla de ventas con el teclado (F12, Enter, Esc) y la impresora (el rediseño ya está en GitHub) y, si quiere, republicar la demo (`npm run demo`).
- **GitHub:** https://github.com/rosbelycontrer/agropos (público, rama `main`). Para subir cambios: `git add -A`, `git commit -m "..."`, `git push`.
- **Stack:** Node.js + Express 5, SQLite con better-sqlite3, HTML/CSS/JS sin frameworks, `serialport` para la báscula. Sin CDN (Font Awesome se sirve desde `node_modules`).
- **Cómo se abre:** `npm run dev` (caja + nube juntas, abre el navegador y reinicia solo al cambiar `src/`). También doble clic en `INICIAR-CAJA.bat` (puerto 3000) y, para la nube, `INICIAR-NUBE.bat` (puerto 4000). O `npm start` / `npm run start:nube`.
- **Usuarios de ejemplo:** `admin@agropos.com` / `admin123` (admin) y `cajero@agropos.com` / `cajero123` (cajero).
- **Entorno:** Windows 11, Node.js 24.19.0 y npm 11.17 (instalado con winget). npm 11 bloquea los scripts de instalación: `better-sqlite3` y `@serialport/bindings-cpp` quedaron autorizados en `allowScripts` de `package.json` (si se reinstala y falla, correr `npm rebuild`).

## Decisiones tomadas

- Carpetas: `src/routes`, `src/services`, `src/db`, `src/middleware`, `src/utils`, `public/`, `scripts/`. Bases en `datos/caja.db` y `datos/nube.db` (se crean y se llenan con datos de ejemplo solas).
- La versión anterior (solo diseño) se movió a `_version-anterior/` (no se borró).
- Contraseñas cifradas con `scrypt` (incluido en Node). Sesión con token firmado HMAC, 12 h. Roles `admin` y `cajero`.
- Báscula: el servidor lee el puerto serie o simula. CERO y TARA en software. Para vender por kg el navegador pide una "captura" (`POST /api/bascula/capturar`) y la venta usa ese id → el cajero nunca digita el peso. Solo admin puede mandar `peso_manual` (queda como fuente "manual").
- Cálculos de dinero en un solo archivo `src/services/dinero.js`, usado por servidor y navegador (`/js/compartido/dinero.js`).
- Precios con IVA incluido; IVA por producto (frutas/verduras 0 %).
- Redondeo comercial del total al múltiplo de $50. El cambio siempre en pesos, con desglose en billetes/monedas. Tarjeta/transferencia/digital no dan cambio. Se permiten pagos mixtos.
- Tasas de ejemplo: 1 USD = 3.900 COP, 1 Bs (VES) = 15 COP. Solo el admin cambia la tasa del día.
- Puntos: 1 punto por cada $1.000 pagados, 1 punto = $10 al redimir (editable en Configuración).
- Se permite vender aunque el stock quede negativo (se avisa al cajero), para no frenar la caja si el inventario está desfasado.
- Sincronización: cada venta tiene `uuid`; la caja sube pendientes cada 15 s a `POST /api/sync/ventas` con `CLAVE_SYNC`. La nube no duplica. `sin_conexion = 1` si la nube no respondía al vender.
- Tiempo de atención = desde el primer producto agregado hasta confirmar el pago.
- Cliente "que regresa" = compró en el período y tiene 2 o más compras hasta la fecha final.
- CSV con `;` y coma decimal (para Excel en español).

## Pendientes / ideas

- Probar todo cuando Node.js esté instalado (`npm run prueba`) y probar con una báscula real.
- La nube no baja productos, clientes ni puntos a las cajas (solo recibe ventas). Idea: sincronización en ambos sentidos.
- En la nube el inventario no se descuenta (cada caja lleva su stock).
- Pantalla para que el admin registre un peso manual (hoy solo por API).
- Recuperar contraseña; anular/devolver ventas; cierre de caja.

## Registro de cambios

### 2026-11-02
- Decisión: AgroPOS es un **prototipo para fruvers de Colombia y Venezuela**, no para una ciudad en específico. Quitadas las menciones a Cúcuta en README, `package.json`, datos de ejemplo (dirección "Dirección del negocio", proveedor "Proveedor de ejemplo") y demo. Descripción del repositorio en GitHub actualizada.
- La base `datos/caja.db` ya existente conserva la dirección vieja: se cambia en Configuración → Negocio.

### 2026-11-01 (subida del rediseño)
- `scripts/prueba.js`: antes de pesar hace CERO con el plato vacío (antes solo TARA). Fallaban 4 pruebas porque la báscula simulada quedó con cero = 0,5 kg (se presionó CERO con peso encima). No era un error del rediseño. 26/26 otra vez.
- Subido a GitHub el rediseño de la pantalla de ventas.

### 2026-11-01 (rediseño de la pantalla de ventas)
- Pantalla de ventas más simple, sin scroll a 1366 × 768 (solo interfaz; no se tocó `dinero.js` ni el backend):
  - Izquierda: productos. Derecha: báscula compacta, carrito y botón grande **COBRAR (F12)** con el total (con carrito vacío solo avisa).
  - Barra superior: nombre de la caja, indicadores Nube / Báscula / Inventario (verde, amarillo, rojo; clic = detalle de estado con botón de sincronizar), desplegable **Stock bajo** y panel lateral **Últimas ventas** (reimprimir).
  - **Ventana de cobro** (modal fijo en `app.html`, mismos `id` de antes): se abre con COBRAR/F12, foco en "Recibido", Esc o X la cierran, Enter confirma. Botón **Finalizar e imprimir**: guarda, abre `recibo.html?imprimir=1`, vacía el carrito, actualiza ventas y stock y vuelve al buscador. Se quitó la ventana de "venta registrada" (ahora es un aviso corto).
  - La ventana del recibo se abre vacía en el mismo clic/Enter (para que el navegador no la bloquee) y `recibo.js` la cierra sola después de imprimir.
- Archivos: `public/app.html`, `public/css/app.css`, `public/css/base.css` (`[hidden]`), `public/js/app/ventas.js`, `public/js/app/principal.js`, `public/js/recibo.js`, `scripts/construir-demo.js`, `README.md`.
- Probado en Chrome sin ventana (1366 × 768 y 1366 × 657): ventas en COP, USD, VES, mixta y tarjeta con el simulador; totales y cambio iguales a `dinero.js`, stock y últimas ventas bien. F12/Enter/Esc se simularon dentro de la página porque Chrome sin ventana no deja pasar F12: falta probarlos con el teclado real.

### 2026-11-01
- Sesión de GitHub iniciada (`gh auth login`, cuenta `rosbelycontrer`). Autor de los commits: `rosbelycontrer` con el correo privado noreply de GitHub.
- Creado el repositorio público https://github.com/rosbelycontrer/agropos y subido el proyecto (decisión del usuario: público, para que el profesor lo vea con el enlace).

### 2026-10-31
- Revisión completa: `npm run prueba` 26/26 y pantallas probadas en el navegador (venta por kg, cobro con cambio, Inventario, Clientes, Reportes, Configuración): todo funciona.
- `scripts/prueba.js`: la prueba de pago en dólares usaba la tasa fija 3.900; ahora usa la tasa guardada (el admin la había cambiado a 3.200).
- `scripts/dev.js`: ya no usa `node --watch-path`. En Windows reiniciaba los servidores sin cambios reales y eso borraba los pesos capturados ("el peso venció"). Ahora vigila `src/` y reinicia solo si cambia el contenido de un archivo. El mensaje inicial muestra los puertos reales.
- Instalados Git 2.56 y GitHub CLI 2.103 (winget). Creado el repositorio git (rama `main`) para subirlo a GitHub.

### 2026-10-20
- Demo en línea para ver y usar AgroPOS sin instalar: https://claude.ai/artifact/NPtQjfpnWEtwSAGedwT1eE (privada; se comparte desde el menú Compartir).
  - `demo/backend-demo.js` simula el servidor en el navegador (intercepta `fetch('/api/...')` y `EventSource`), con báscula simulada, botón "Con/Sin internet" y "Reiniciar". Incluye ventas de ejemplo de 7 días.
  - `npm run demo` (`scripts/construir-demo.js`) arma `demo/agropos-demo.html` con las pantallas reales de `public/`. Tras cambiar `public/`, volver a correrlo y republicar.
  - Limitaciones de la demo: sin báscula real, sin imprimir (el recibo se ve en ventana), sin descargar CSV; los datos quedan solo en el navegador de cada persona.

### 2026-09-25 (noche, 3)
- Error "npm no se reconoce" en la terminal de VS Code: VS Code se abrió antes de instalar Node → hay que cerrarlo y abrirlo de nuevo.
- Cambiada la política de PowerShell del usuario a `RemoteSigned` (CurrentUser) para que `npm` (npm.ps1) no quede bloqueado.

### 2026-09-25 (noche, 2)
- Nuevo `npm run dev` (`scripts/dev.js`): arranca caja y nube en una sola terminal con `node --watch-path=src`, etiqueta la salida `[caja]`/`[nube]`, abre el navegador y `Ctrl + C` apaga todo. Opción `--sin-navegador`.
- Servidores apagados para que el usuario lo pruebe.

### 2026-09-25 (noche)
- Instalado Node.js 24.19.0 con winget y las dependencias con `npm install` (autorizados los scripts de better-sqlite3 y serialport).
- Backend probado: 26/26 pruebas ok; la nube recibió las ventas pendientes.
- Corregido `scripts/prueba.js`: esperaba poco antes de TARA (restaba el peso anterior). Ahora espera a que el plato quede vacío y valida el total de la venta en dólares.

### 2026-09-25 (tarde)
- Nuevo sistema completo según el pedido del usuario:
  - Backend Express: login, productos/categorías, clientes y puntos, tasas, báscula (serial + simulador + SSE), ventas, recepciones por lote, reportes + CSV, configuración y usuarios, estado, sincronización caja → nube.
  - Base SQLite (`src/db/schema.sql`) con datos de ejemplo: 25 productos de fruver con PLU, 6 categorías, admin, cajero, 2 clientes, tasa y lote inicial.
  - Frontend en `public/`: login, panel de 4 columnas (productos · báscula y carrito · cobro multimoneda · estado e inventario), inventario, clientes, reportes, configuración y recibo imprimible de 80 mm.
  - `scripts/prueba.js` (prueba automática del backend) y `scripts/reiniciar-bd.js`.
  - `INICIAR-CAJA.bat` e `INICIAR-NUBE.bat` para abrir con doble clic. README reescrito.
- Movidos `frontend/`, `backend/` y `database/` a `_version-anterior/`.

### 2026-09-25
- Creado `CLAUDE.md` y esta `MEMORIA.md` para mantener el contexto entre sesiones.
- Estructura inicial del proyecto a partir del prototipo `AgroPOS.html` (solo frontend con datos simulados).
