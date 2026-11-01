// Borra las bases de datos locales para empezar de cero con los datos de ejemplo.
// ¡Cuidado! Se pierden todas las ventas. Cierra AgroPOS antes de ejecutarlo.
const fs = require('fs');
const path = require('path');

const carpeta = path.join(__dirname, '..', 'datos');
if (!fs.existsSync(carpeta)) {
  console.log('No hay bases de datos para borrar.');
  process.exit(0);
}
for (const archivo of fs.readdirSync(carpeta)) {
  if (/\.db(-wal|-shm)?$/.test(archivo)) {
    fs.unlinkSync(path.join(carpeta, archivo));
    console.log('Borrado:', archivo);
  }
}
console.log('Listo. La próxima vez que abras AgroPOS se cargarán los datos de ejemplo.');
