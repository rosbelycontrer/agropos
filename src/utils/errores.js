// Error con código HTTP para responder mensajes claros al frontend.
class ErrorHttp extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

const noEncontrado = (msg = 'No encontrado') => new ErrorHttp(404, msg);
const invalido = (msg) => new ErrorHttp(400, msg);

module.exports = { ErrorHttp, noEncontrado, invalido };
