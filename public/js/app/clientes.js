// Clientes y fidelización (también lo usa el panel de ventas para registrar).
const Clientes = (function () {
  const $ = (id) => document.getElementById(id);
  let temporizador = null;

  async function cargar() {
    const texto = $('cli-buscar').value.trim();
    const lista = await Api.get('/clientes?buscar=' + encodeURIComponent(texto));
    $('tabla-clientes').innerHTML = lista.map((c) => `
      <tr>
        <td>${UI.escapar(c.cedula)}</td>
        <td>${UI.escapar(c.nombre)}</td>
        <td>${UI.escapar(c.telefono || '—')}</td>
        <td class="num puntos">${Formato.numero(c.puntos)}</td>
        <td class="num">${c.compras}</td>
        <td>${Formato.fecha(c.creado_en)}</td>
        <td><button class="icon-btn" data-editar="${UI.escapar(c.cedula)}" title="Editar"><i class="fa-solid fa-pen"></i></button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="empty">No hay clientes.</td></tr>';
  }

  async function pintarReglas() {
    const r = await Api.get('/clientes/reglas');
    $('reglas-puntos').textContent =
      `El cliente gana 1 punto por cada ${Formato.pesos(r.pesos_por_punto)} pagados. Cada punto vale ${Formato.pesos(r.valor_punto)} al redimir.`;
  }

  // Formulario para registrar o editar. "alGuardar" recibe el cliente guardado.
  function formulario(c = {}, alGuardar) {
    const existe = Boolean(c.id);
    UI.modal({
      titulo: existe ? 'Editar cliente' : 'Registrar cliente',
      html: `
        <div class="form-grid">
          <label class="campo">Cédula <input class="input" name="cedula" value="${UI.escapar(c.cedula || '')}" ${existe ? 'disabled' : ''} inputmode="numeric"></label>
          <label class="campo">Teléfono <input class="input" name="telefono" value="${UI.escapar(c.telefono || '')}" inputmode="tel"></label>
          <label class="campo ancho">Nombre completo <input class="input" name="nombre" value="${UI.escapar(c.nombre || '')}"></label>
          ${existe ? `<p class="muted ancho">Puntos: ${Formato.numero(c.puntos)} · Compras: ${c.compras}</p>` : '<p class="muted ancho">El cliente empieza con 0 puntos y los acumula con cada compra.</p>'}
        </div>`,
      alAbrir: (m) => { if (!existe && c.cedula) m.el.querySelector('[name="nombre"]').focus(); },
      botones: [
        { texto: 'Cancelar', clase: 'secundario' },
        {
          texto: 'Guardar',
          accion: async (m) => {
            const d = UI.datosFormulario(m.el);
            const guardado = existe
              ? await Api.put('/clientes/' + encodeURIComponent(c.cedula), d)
              : await Api.post('/clientes', d);
            UI.toast(existe ? 'Cliente actualizado' : `Cliente ${guardado.nombre} registrado`, 'success');
            if (App.vistaActual === 'clientes') cargar();
            alGuardar?.(guardado);
            return true;
          },
        },
      ],
    });
  }

  App.registrar('clientes', {
    iniciar() {
      $('cli-buscar').addEventListener('input', () => {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => cargar().catch(UI.error.bind(UI)), 250);
      });
      $('btn-nuevo-cliente').addEventListener('click', () => formulario());
      $('tabla-clientes').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-editar]');
        if (!b) return;
        try {
          formulario(await Api.get('/clientes/' + encodeURIComponent(b.dataset.editar)));
        } catch (err) {
          UI.error(err);
        }
      });
    },
    async mostrar() {
      try {
        await Promise.all([cargar(), pintarReglas()]);
      } catch (e) {
        UI.error(e);
      }
    },
  });

  return { formulario };
})();
