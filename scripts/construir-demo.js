// Arma demo/agropos-demo.html: una sola página con las pantallas reales de public/
// y el servidor simulado de demo/backend-demo.js, para compartir AgroPOS con un enlace.
//   npm run demo
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = (ruta) => fs.readFileSync(path.join(RAIZ, ruta), 'utf8');

// Cambia un texto y avisa si ya no existe (por si el código original cambió).
function reemplazar(texto, buscar, poner, archivo, todas = false) {
  if (!texto.includes(buscar)) throw new Error(`No se encontró en ${archivo}: ${buscar}`);
  return todas ? texto.split(buscar).join(poner) : texto.replace(buscar, poner);
}

function cuerpoHtml(archivo) {
  const html = leer(archivo);
  const inicio = html.indexOf('>', html.indexOf('<body')) + 1;
  const fin = html.indexOf('<script', inicio);
  return html.slice(inicio, fin).trim();
}

// ---------- HTML de las dos pantallas ----------
let login = cuerpoHtml('public/index.html');
login = reemplazar(login, 'id="reloj"', 'id="reloj-login"', 'index.html');
login = reemplazar(login, 'name="correo" class="form-control"', 'name="correo" class="form-control" value="admin@agropos.com"', 'index.html');
login = reemplazar(login, 'name="clave" class="form-control"', 'name="clave" class="form-control" value="admin123"', 'index.html');
const app = cuerpoHtml('public/app.html');

// ---------- JavaScript ----------
let comun = leer('public/js/comun.js');
comun = reemplazar(comun, "location.href = '/index.html?vencida=1';", "Demo.ir('login');", 'comun.js');

let loginJs = leer('public/js/login.js');
loginJs = reemplazar(loginJs, "location.href = '/app.html';", "Demo.ir('app');", 'login.js', true);
loginJs = reemplazar(loginJs, "getElementById('reloj')", "getElementById('reloj-login')", 'login.js');

let principal = leer('public/js/app/principal.js');
principal = reemplazar(principal, "location.href = '/index.html';", "Demo.ir('login');", 'principal.js', true);

let ventas = leer('public/js/app/ventas.js');
ventas = reemplazar(ventas, "window.open(`/recibo.html?id=${id}`, 'recibo', 'width=420,height=700');", 'Demo.recibo(id);', 'ventas.js');
ventas = reemplazar(ventas, '<i class="fa-solid fa-print"></i> Imprimir recibo', '<i class="fa-solid fa-receipt"></i> Ver recibo', 'ventas.js');

const scripts = [
  leer('src/services/dinero.js'),
  comun,
  leer('demo/backend-demo.js'),
  principal,
  ventas,
  leer('public/js/app/inventario.js'),
  leer('public/js/app/clientes.js'),
  leer('public/js/app/reportes.js'),
  leer('public/js/app/configuracion.js'),
  loginJs,
  'Demo.pintarControl();',
];

// ---------- CSS ----------
const css = [
  leer('public/css/base.css'),
  leer('public/css/login.css'),
  leer('public/css/app.css'),
  leer('demo/demo.css'),
].join('\n');

const pagina = `<title>AgroPOS</title>
<meta name="description" content="Demo de AgroPOS, punto de venta para fruver con báscula, cobro multimoneda y puntos.">
<script>window.FontAwesomeConfig = { autoReplaceSvg: 'nest' };</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/js/all.min.js"></script>
<style>
${css}
</style>

<div id="pantalla-login" class="login-page">
${login}
</div>

<div id="pantalla-app" class="app-page" hidden>
${app}
</div>

<div id="demo-control" class="demo-control"></div>

${scripts.map((s) => `<script>\n${s}\n</script>`).join('\n')}
`;

fs.writeFileSync(path.join(RAIZ, 'demo', 'agropos-demo.html'), pagina);
console.log(`Listo: demo/agropos-demo.html (${Math.round(pagina.length / 1024)} KB)`);
