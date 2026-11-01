// Controlador del panel: sesión, navegación entre vistas y estado general.
const App = {
  vistas: {},     // cada módulo se registra aquí: { iniciar(), mostrar() }
  estado: null,   // último /api/estado
  vistaActual: null,

  registrar(nombre, modulo) {
    this.vistas[nombre] = modulo;
  },

  async iniciar() {
    if (!Sesion.token) {
      location.href = '/index.html';
      return;
    }
    const usuario = Sesion.usuario;
    document.getElementById('usuario-nombre').textContent = `${usuario.nombre} (${usuario.rol === 'admin' ? 'Administrador' : 'Cajero'})`;
    if (!Sesion.esAdmin) document.querySelectorAll('.solo-admin').forEach((el) => el.classList.add('oculto'));
    UI.reloj(document.getElementById('reloj'));

    document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => this.mostrar(b.dataset.vista)));
    document.getElementById('btn-salir').addEventListener('click', () => this.salir());

    try {
      await this.actualizarEstado();
    } catch (e) {
      UI.error(e);
    }
    const esNube = this.estado?.modo === 'nube';
    document.getElementById('etiqueta-caja').textContent = esNube ? 'NUBE' : this.estado?.caja_id || '';
    if (esNube) {
      // En la nube no se vende: solo se consultan reportes consolidados.
      document.querySelectorAll('[data-vista="ventas"]').forEach((el) => el.classList.add('oculto'));
      document.getElementById('pill-nube').classList.add('oculto');
    }

    for (const [nombre, modulo] of Object.entries(this.vistas)) {
      if (esNube && nombre === 'ventas') continue;
      try {
        await modulo.iniciar?.();
      } catch (e) {
        UI.error(e);
      }
    }
    this.mostrar(esNube ? (Sesion.esAdmin ? 'reportes' : 'inventario') : 'ventas');
    setInterval(() => this.actualizarEstado().catch(() => this.pintarSinServidor()), 5000);
  },

  mostrar(nombre) {
    if (!this.vistas[nombre]) return;
    this.vistaActual = nombre;
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'vista-' + nombre));
    document.querySelectorAll('[data-vista]').forEach((b) => b.classList.toggle('active', b.dataset.vista === nombre));
    this.vistas[nombre].mostrar?.();
  },

  async actualizarEstado() {
    this.estado = await Api.get('/estado');
    const pill = document.getElementById('pill-nube');
    const nube = this.estado.nube;
    if (nube) {
      pill.className = 'pill ' + (nube.conectada ? 'ok' : 'mal');
      pill.innerHTML = nube.conectada
        ? '<i class="fa-solid fa-cloud"></i> En línea'
        : `<i class="fa-solid fa-cloud-arrow-up"></i> Sin conexión${nube.pendientes ? ` · ${nube.pendientes} por subir` : ''}`;
    }
    this.vistas.ventas?.pintarEstado?.(this.estado);
  },

  pintarSinServidor() {
    const pill = document.getElementById('pill-nube');
    pill.className = 'pill mal';
    pill.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Servidor local detenido';
  },

  async salir() {
    if (this.vistas.ventas?.hayCarrito?.() && !(await UI.confirmar('Cerrar sesión', 'Hay productos en el carrito. ¿Salir de todas formas?'))) return;
    Sesion.cerrar();
    location.href = '/index.html';
  },
};
