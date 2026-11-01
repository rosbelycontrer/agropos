// Página de inicio de sesión.
(function () {
  if (Sesion.token) {
    location.href = '/app.html';
    return;
  }

  const form = document.getElementById('login-form');
  const error = document.getElementById('login-error');
  const boton = document.getElementById('btn-login');

  UI.reloj(document.getElementById('reloj'));
  if (new URLSearchParams(location.search).has('vencida')) {
    error.textContent = 'Tu sesión terminó. Vuelve a entrar.';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const { correo, clave, recordar } = UI.datosFormulario(form);
    if (!correo.trim() || !clave) {
      error.textContent = 'Escribe el correo y la contraseña.';
      return;
    }
    boton.disabled = true;
    boton.textContent = 'ENTRANDO...';
    try {
      const datos = await Api.post('/auth/login', { correo, clave });
      Sesion.guardar(datos, recordar);
      location.href = '/app.html';
    } catch (err) {
      error.textContent = err.message;
      boton.disabled = false;
      boton.textContent = 'INICIAR SESIÓN';
    }
  });
})();
