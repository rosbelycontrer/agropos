// npm run dev → abre la caja (3000) y la nube (4000) en una sola terminal,
// abre el navegador y reinicia el servidor solo cuando cambias algo en src/.
// Para apagar todo: Ctrl + C.
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CARPETA_SRC = path.join(RAIZ, 'src');
const URL_CAJA = 'http://localhost:3000';
const ABRIR_NAVEGADOR = !process.argv.includes('--sin-navegador');

const SERVIDORES = [
  { nombre: 'caja', color: '\x1b[32m', args: [] },
  { nombre: 'nube', color: '\x1b[36m', args: ['--nube'] },
];

let navegadorAbierto = false;
let apagando = false;

function abrirNavegador() {
  if (!ABRIR_NAVEGADOR || navegadorAbierto) return;
  navegadorAbierto = true;
  const comando = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', URL_CAJA]]
    : process.platform === 'darwin' ? ['open', [URL_CAJA]]
      : ['xdg-open', [URL_CAJA]];
  spawn(comando[0], comando[1], { stdio: 'ignore', detached: true }).unref();
}

function arrancar(s) {
  const hijo = spawn(process.execPath, ['src/server.js', ...s.args], {
    cwd: RAIZ,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  s.hijo = hijo;

  const etiqueta = `${s.color}[${s.nombre}]\x1b[0m `;
  const mostrar = (salida) => (trozo) => {
    for (const linea of trozo.toString().split(/\r?\n/)) {
      if (linea.trim()) salida.write(etiqueta + linea + '\n');
    }
    if (s.nombre === 'caja' && /listo/.test(trozo.toString())) abrirNavegador();
  };
  hijo.stdout.on('data', mostrar(process.stdout));
  hijo.stderr.on('data', mostrar(process.stderr));
  hijo.on('exit', (codigo) => {
    if (s.hijo !== hijo) return; // se reinició a propósito
    if (!apagando) console.log(`${etiqueta}se detuvo (código ${codigo}). Guarda un cambio en src/ para volver a arrancarlo.`);
  });
}

function reiniciarTodos(archivo) {
  console.log(`\n  Cambió ${path.relative(RAIZ, archivo)} → reiniciando...\n`);
  for (const s of SERVIDORES) {
    if (s.reiniciando) continue; // ya se está reiniciando
    const anterior = s.hijo;
    s.hijo = null;
    if (anterior && anterior.exitCode === null) {
      s.reiniciando = true;
      anterior.once('exit', () => { s.reiniciando = false; arrancar(s); });
      anterior.kill();
    } else {
      arrancar(s);
    }
  }
}

// Vigila src/ comparando el contenido de cada archivo: Windows a veces avisa
// "cambios" sin que nada cambie, y reiniciar borraría los pesos capturados.
const huellas = new Map();
const huella = (archivo) => {
  try {
    return crypto.createHash('sha1').update(fs.readFileSync(archivo)).digest('hex');
  } catch {
    return null; // archivo borrado o carpeta
  }
};
function recorrer(carpeta) {
  for (const e of fs.readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = path.join(carpeta, e.name);
    if (e.isDirectory()) recorrer(ruta);
    else huellas.set(ruta, huella(ruta));
  }
}
recorrer(CARPETA_SRC);

const esperas = new Map();
fs.watch(CARPETA_SRC, { recursive: true }, (_evento, nombre) => {
  if (!nombre || apagando) return;
  const archivo = path.join(CARPETA_SRC, nombre);
  clearTimeout(esperas.get(archivo));
  esperas.set(archivo, setTimeout(() => {
    esperas.delete(archivo);
    const nueva = huella(archivo);
    if (nueva === huellas.get(archivo)) return;
    huellas.set(archivo, nueva);
    reiniciarTodos(archivo);
  }, 150));
});

for (const s of SERVIDORES) arrancar(s);

console.log(`\n  AgroPOS en modo desarrollo: caja → http://localhost:${process.env.PUERTO_CAJA || 3000} · nube → http://localhost:${process.env.PUERTO_NUBE || 4000}`);
console.log('  Al guardar cambios en src/ el servidor se reinicia solo. Los de public/ solo requieren recargar la página (F5).');
console.log('  Para apagar todo: Ctrl + C\n');

function apagar() {
  if (apagando) return;
  apagando = true;
  console.log('\nApagando AgroPOS...');
  for (const s of SERVIDORES) if (s.hijo && s.hijo.exitCode === null) s.hijo.kill();
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
