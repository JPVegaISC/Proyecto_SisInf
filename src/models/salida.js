function enHorarioSalida(hora) {
  return /^\d{2}:\d{2}:\d{2}$/.test(hora || '') && hora >= '15:00:00'
}
function esRetraso(hora) {
  return /^\d{2}:\d{2}:\d{2}$/.test(hora || '') && hora > '16:00:00'
}
function validarContacto(id) {
  return /^\d+$/.test(String(id || '')) && Number(id) > 0 && Number.isSafeInteger(Number(id))
}
function validarObservaciones(valor) {
  return typeof valor === 'string' && valor.trim().length <= 500
}
module.exports = { enHorarioSalida, esRetraso, validarContacto, validarObservaciones }
