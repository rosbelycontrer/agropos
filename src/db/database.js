// Abre (o crea) la base de datos SQLite y carga datos de ejemplo la primera vez.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

fs.mkdirSync(path.dirname(config.rutaBD), { recursive: true });

const db = new Database(config.rutaBD);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const hayUsuarios = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n > 0;
if (!hayUsuarios) {
  require('./seed')(db);
  console.log('Base de datos nueva: se cargaron los datos de ejemplo.');
}

module.exports = db;
