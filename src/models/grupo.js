const { ageInMonths, todayMexico, validId } = require('./expediente')

const GRUPOS = Object.freeze([
  { id: 1, nombre: 'Lactantes', rango: 'De 1 mes a menos de 1 año', min: 1, max: 11 },
  { id: 2, nombre: 'Maternal I', rango: 'De 1 a menos de 2 años', min: 12, max: 23 },
  { id: 3, nombre: 'Maternal II', rango: 'De 2 a menos de 3 años', min: 24, max: 35 },
  { id: 4, nombre: 'Preescolar', rango: 'De 3 a menos de 4 años', min: 36, max: 47 }
])

function grupoParaEdad(fechaNacimiento, hoy = todayMexico(), permanencia = false, fechaLimite = null) {
  const meses = ageInMonths(fechaNacimiento, hoy)
  if (meses === null || meses < 1) return null
  if (meses >= 48) return permanencia && fechaLimite && fechaLimite >= hoy ? 4 : null
  return GRUPOS.find(g => meses >= g.min && meses <= g.max)?.id || null
}

function fechaHoraMexico(fecha = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(fecha)
  const part = type => parts.find(p => p.type === type).value
  return { fecha: `${part('year')}-${part('month')}-${part('day')}`, hora: `${part('hour')}:${part('minute')}:${part('second')}` }
}

function enHorarioRecepcion(hora) {
  return typeof hora === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(hora) && hora >= '08:00:00' && hora <= '09:00:00'
}

const ARTICULOS = ['leche', 'panales', 'ropa', 'cobija']
const ESTADOS = ['si', 'no', 'no_aplica']

function validarRecepcion(body = {}) {
  const data = {
    revision_fisica: typeof body.revision_fisica === 'string' ? body.revision_fisica : '',
    observaciones_fisicas: typeof body.observaciones_fisicas === 'string' ? body.observaciones_fisicas.trim() : '',
    otros_articulos: typeof body.otros_articulos === 'string' ? body.otros_articulos.trim() : '',
    notas_articulos: typeof body.notas_articulos === 'string' ? body.notas_articulos.trim() : ''
  }
  if (!['sin_lesiones', 'con_observaciones'].includes(data.revision_fisica)) {
    return { error: 'Selecciona el resultado de la revisión física.' }
  }
  if (data.revision_fisica === 'con_observaciones' && !data.observaciones_fisicas) {
    return { error: 'Describe los golpes, raspaduras u otras observaciones encontradas.' }
  }
  if (data.observaciones_fisicas.length > 1000 || data.notas_articulos.length > 500 || data.otros_articulos.length > 255) {
    return { error: 'Revisa la longitud de las observaciones y los artículos.' }
  }
  for (const campo of ARTICULOS) {
    if (!ESTADOS.includes(body[campo])) return { error: `Indica si el menor trae ${campo === 'panales' ? 'pañales' : campo}.` }
    data[campo] = body[campo]
  }
  return { data, faltantes: ARTICULOS.filter(campo => data[campo] === 'no') }
}

module.exports = { GRUPOS, grupoParaEdad, fechaHoraMexico, enHorarioRecepcion, validarRecepcion, ARTICULOS, validId }
