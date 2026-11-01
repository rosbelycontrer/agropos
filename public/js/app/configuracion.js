// Configuración (solo administradores): báscula, negocio, puntos, usuarios y tasas.
(function () {
  const $ = (id) => document.getElementById(id);

  function llenar(contenedor, datos) {
    contenedor.querySelectorAll('[name]').forEach((el) => {
      if (datos[el.name] !== undefined) el.value = datos[el.name];
    });
  }

  async function cargar() {
    const [bascula, negocio, usuarios, tasas] = await Promise.all([
      App.estado?.modo === 'caja' ? Api.get('/bascula/configuracion') : Promise.resolve(null),
      Api.get('/configuracion'),
      Api.get('/configuracion/usuarios'),
      Api.get('/tasas/historial'),
    ]);
    if (bascula) llenar($('form-bascula'), bascula);
    else $('form-bascula').closest('.panel-box').classList.add('oculto');
    llenar($('form-negocio'), negocio);
    pintarUsuarios(usuarios);
    $('tabla-tasas').innerHTML = tasas.map((t) => `
      <tr><td>${Formato.fecha(t.creado_en)}</td><td class="num">${Formato.pesos(t.usd)}</td>
      <td class="num">${Formato.numero(t.ves, 2)}</td><td>${UI.escapar(t.usuario_nombre || '')}</td></tr>`).join('');
  }

  function pintarUsuarios(usuarios) {
    $('tabla-usuarios').innerHTML = usuarios.map((u) => `
      <tr>
        <td>${UI.escapar(u.nombre)}</td>
        <td>${UI.escapar(u.correo)}</td>
        <td>${u.rol === 'admin' ? 'Administrador' : 'Cajero'}</td>
        <td>${u.activo ? '<span class="badge bien">activo</span>' : '<span class="badge gris">inactivo</span>'}</td>
        <td><button class="icon-btn" data-usuario='${UI.escapar(JSON.stringify(u))}' title="Editar"><i class="fa-solid fa-pen"></i></button></td>
      </tr>`).join('');
  }

  function formularioUsuario(u = {}) {
    const existe = Boolean(u.id);
    UI.modal({
      titulo: existe ? 'Editar usuario' : 'Nuevo usuario',
      html: `
        <div class="form-grid">
          <label class="campo ancho">Nombre <input class="input" name="nombre" value="${UI.escapar(u.nombre || '')}"></label>
          <label class="campo ancho">Correo <input class="input" name="correo" type="email" value="${UI.escapar(u.correo || '')}" ${existe ? 'disabled' : ''}></label>
          <label class="campo">Rol
            <select class="select" name="rol">
              <option value="cajero" ${u.rol !== 'admin' ? 'selected' : ''}>Cajero</option>
              <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Administrador</option>
            </select></label>
          <label class="campo">${existe ? 'Nueva contraseña (opcional)' : 'Contraseña'} <input class="input" name="clave" type="password" autocomplete="new-password"></label>
          ${existe ? `<label class="check ancho"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''}> Usuario activo</label>` : ''}
        </div>`,
      botones: [
        { texto: 'Cancelar', clase: 'secundario' },
        {
          texto: 'Guardar',
          accion: async (m) => {
            const d = UI.datosFormulario(m.el);
            if (existe) {
              if (!d.clave) delete d.clave;
              delete d.correo;
              await Api.put('/configuracion/usuarios/' + u.id, d);
            } else {
              await Api.post('/configuracion/usuarios', d);
            }
            UI.toast('Usuario guardado', 'success');
            pintarUsuarios(await Api.get('/configuracion/usuarios'));
            return true;
          },
        },
      ],
    });
  }

  App.registrar('configuracion', {
    iniciar() {
      if (!Sesion.esAdmin) return;
      $('btn-guardar-bascula').addEventListener('click', async () => {
        try {
          await Api.put('/bascula/configuracion', UI.datosFormulario($('form-bascula')));
          UI.toast('Báscula configurada. Reconectando…', 'success');
        } catch (e) {
          UI.error(e);
        }
      });
      $('btn-puertos').addEventListener('click', async () => {
        try {
          const puertos = await Api.get('/bascula/puertos');
          $('lista-puertos').innerHTML = puertos.map((p) => `<option value="${UI.escapar(p.ruta)}">${UI.escapar(p.descripcion)}</option>`).join('');
          UI.toast(puertos.length ? `Puertos encontrados: ${puertos.map((p) => p.ruta).join(', ')}` : 'No se encontró ningún puerto. ¿Está conectada la báscula?',
            puertos.length ? 'success' : 'error');
        } catch (e) {
          UI.error(e);
        }
      });
      $('btn-guardar-negocio').addEventListener('click', async () => {
        try {
          await Api.put('/configuracion', UI.datosFormulario($('form-negocio')));
          UI.toast('Datos guardados', 'success');
        } catch (e) {
          UI.error(e);
        }
      });
      $('btn-nuevo-usuario').addEventListener('click', () => formularioUsuario());
      $('tabla-usuarios').addEventListener('click', (e) => {
        const b = e.target.closest('[data-usuario]');
        if (b) formularioUsuario(JSON.parse(b.dataset.usuario));
      });
    },
    mostrar() {
      if (Sesion.esAdmin) cargar().catch(UI.error.bind(UI));
    },
  });
})();
