// Utilidades compartidas por todas las páginas: sesión, API, formatos y ventanas.

// ---------- Sesión ----------
const Sesion = {
  CLAVE: 'agropos_sesion',

  guardar(datos, recordar) {
    const texto = JSON.stringify(datos);
    (recordar ? localStorage : sessionStorage).setItem(this.CLAVE, texto);
    (recordar ? sessionStorage : localStorage).removeItem(this.CLAVE);
  },

  obtener() {
    try {
      const texto = sessionStorage.getItem(this.CLAVE) || localStorage.getItem(this.CLAVE);
      return texto ? JSON.parse(texto) : null;
    } catch {
      return null;
    }
  },

  cerrar() {
    sessionStorage.removeItem(this.CLAVE);
    localStorage.removeItem(this.CLAVE);
  },

  get token() { return this.obtener()?.token; },
  get usuario() { return this.obtener()?.usuario; },
  get esAdmin() { return this.usuario?.rol === 'admin'; },
};

// ---------- API ----------
const Api = {
  async pedir(ruta, { metodo = 'GET', cuerpo } = {}) {
    let resp;
    try {
      resp = await fetch('/api' + ruta, {
        method: metodo,
        headers: {
          'Content-Type': 'application/json',
          ...(Sesion.token ? { Authorization: 'Bearer ' + Sesion.token } : {}),
        },
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      });
    } catch {
      throw new Error('No hay conexión con el servidor de AgroPOS. ¿Está abierto?');
    }
    const datos = await resp.json().catch(() => ({}));
    if (resp.status === 401 && !ruta.startsWith('/auth/login')) {
      Sesion.cerrar();
      location.href = '/index.html?vencida=1';
      throw new Error(datos.error || 'Sesión vencida');
    }
    if (!resp.ok) throw new Error(datos.error || `Error ${resp.status}`);
    return datos;
  },

  get(ruta) { return this.pedir(ruta); },
  post(ruta, cuerpo) { return this.pedir(ruta, { metodo: 'POST', cuerpo: cuerpo || {} }); },
  put(ruta, cuerpo) { return this.pedir(ruta, { metodo: 'PUT', cuerpo }); },

  // Descarga un archivo (CSV) que requiere sesión.
  async descargar(ruta) {
    const resp = await fetch('/api' + ruta, { headers: { Authorization: 'Bearer ' + Sesion.token } });
    if (!resp.ok) {
      const datos = await resp.json().catch(() => ({}));
      throw new Error(datos.error || 'No se pudo descargar');
    }
    const nombre = /filename="([^"]+)"/.exec(resp.headers.get('content-disposition') || '')?.[1] || 'reporte.csv';
    const url = URL.createObjectURL(await resp.blob());
    const enlace = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

// ---------- Formatos ----------
const Formato = {
  pesos(valor) {
    return '$' + Math.round(Number(valor) || 0).toLocaleString('es-CO');
  },
  moneda(valor, moneda) {
    if (moneda === 'COP') return this.pesos(valor);
    const num = (Number(valor) || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return moneda === 'USD' ? `US$${num}` : `Bs ${num}`;
  },
  kg(valor) {
    return (Number(valor) || 0).toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' kg';
  },
  numero(valor, decimales = 0) {
    return (Number(valor) || 0).toLocaleString('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  },
  cantidad(valor, unidad) {
    return unidad === 'kg' ? this.kg(valor) : `${this.numero(valor)} und`;
  },
  duracion(segundos) {
    if (segundos === null || segundos === undefined) return '—';
    const s = Math.round(segundos);
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
  },
  fecha(texto) {
    if (!texto) return '—';
    const d = new Date(texto.replace(' ', 'T'));
    return isNaN(d) ? texto : d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  },
  hoy() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  // Convierte "12.500,50" o "12500.5" en número.
  leerNumero(texto) {
    let t = String(texto ?? '').trim().replace(/[^\d.,-]/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : 0;
  },
};

const METODOS = {
  efectivo: { nombre: 'Efectivo', icono: 'fa-money-bill-wave' },
  tarjeta: { nombre: 'Tarjeta', icono: 'fa-credit-card' },
  transferencia: { nombre: 'Transferencia', icono: 'fa-building-columns' },
  digital: { nombre: 'Pago digital', icono: 'fa-mobile-screen' },
};

const NOMBRE_MONEDA = { COP: 'Pesos (COP)', USD: 'Dólares (USD)', VES: 'Bolívares (VES)' };

// ---------- Interfaz ----------
const UI = {
  escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  toast(mensaje, tipo = 'info') {
    let el = document.getElementById('toast');
    if (!el) {
      el = Object.assign(document.createElement('div'), { id: 'toast', className: 'toast' });
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = mensaje;
    el.className = `toast visible ${tipo}`;
    clearTimeout(this._timerToast);
    this._timerToast = setTimeout(() => el.classList.remove('visible'), tipo === 'error' ? 5000 : 3000);
  },

  error(e) {
    this.toast(e?.message || String(e), 'error');
  },

  // Abre una ventana emergente. "botones" = [{ texto, clase, accion(modal) → true para cerrar }]
  modal({ titulo, html, botones = [], ancho = false, alAbrir }) {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `
      <div class="modal ${ancho ? 'ancho' : ''}" role="dialog" aria-modal="true">
        <div class="modal-cabecera"><span>${titulo}</span>
          <button class="icon-btn" data-cerrar title="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-cuerpo">${html}</div>
        ${botones.length ? '<div class="modal-pie"></div>' : ''}
      </div>`;
    const cerrar = () => {
      fondo.remove();
      document.removeEventListener('keydown', teclas);
    };
    const teclas = (e) => { if (e.key === 'Escape') cerrar(); };
    const modal = { el: fondo.querySelector('.modal'), cerrar };
    fondo.querySelector('[data-cerrar]').onclick = cerrar;
    fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(); });
    document.addEventListener('keydown', teclas);
    const pie = fondo.querySelector('.modal-pie');
    for (const b of botones) {
      const btn = document.createElement('button');
      btn.className = `btn ${b.clase || ''}`;
      btn.innerHTML = b.texto;
      btn.onclick = async () => {
        if (!b.accion) return cerrar();
        btn.disabled = true;
        try {
          if (await b.accion(modal)) cerrar();
        } catch (e) {
          UI.error(e);
        } finally {
          btn.disabled = false;
        }
      };
      pie.appendChild(btn);
    }
    document.body.appendChild(fondo);
    const primero = fondo.querySelector('input, select, textarea');
    if (primero) primero.focus();
    if (alAbrir) alAbrir(modal);
    return modal;
  },

  confirmar(titulo, mensaje) {
    return new Promise((resolver) => {
      const m = UI.modal({
        titulo,
        html: `<p>${mensaje}</p>`,
        botones: [
          { texto: 'Cancelar', clase: 'secundario', accion: () => { resolver(false); return true; } },
          { texto: 'Aceptar', accion: () => { resolver(true); return true; } },
        ],
      });
      m.el.closest('.modal-fondo').querySelector('[data-cerrar]').addEventListener('click', () => resolver(false));
    });
  },

  // Lee los campos con atributo name de un contenedor.
  datosFormulario(contenedor) {
    const datos = {};
    contenedor.querySelectorAll('[name]').forEach((el) => {
      datos[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return datos;
  },

  reloj(el) {
    const pintar = () => {
      el.textContent = new Date().toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    pintar();
    setInterval(pintar, 15000);
  },
};
