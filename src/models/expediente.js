const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[0-9+().\s-]{7,20}$/
const AGE_MIN_MONTHS = 1
const AGE_MAX_MONTHS = 48

const text = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
const notes = value => typeof value === 'string' ? value.trim() : ''
const checked = value => value === '1' || value === 'on'
const validId = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0

function todayMexico() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date())
  const get = type => parts.find(p => p.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d) return null
  return { y, m, d }
}

function ageInMonths(birth, today = todayMexico()) {
  const b = parseDate(birth)
  const t = parseDate(today)
  if (!b || !t || birth > today) return null
  return (t.y - b.y) * 12 + (t.m - b.m) - (t.d < b.d ? 1 : 0)
}

function ageLabel(date, today = todayMexico()) {
  const months = ageInMonths(date, today)
  if (months === null) return 'Edad no disponible'
  const years = Math.floor(months / 12)
  const rest = months % 12
  return years ? `${years} ${years === 1 ? 'año' : 'años'}${rest ? ` y ${rest} ${rest === 1 ? 'mes' : 'meses'}` : ''}`
    : `${months} ${months === 1 ? 'mes' : 'meses'}`
}

function normalizeExpediente(body = {}, today = todayMexico(), editando = false) {
  const data = {
    nombres: text(body.nombres), apellido_paterno: text(body.apellido_paterno),
    apellido_materno: text(body.apellido_materno), fecha_nacimiento: text(body.fecha_nacimiento),
    fecha_ingreso: text(body.fecha_ingreso), sexo: text(body.sexo) || 'no_especificado',
    alergias: notes(body.alergias), restricciones_alimentarias: notes(body.restricciones_alimentarias),
    cuidados_especiales: notes(body.cuidados_especiales), observaciones: notes(body.observaciones),
    permanencia_verano: checked(body.permanencia_verano),
    fecha_limite_permanencia: text(body.fecha_limite_permanencia),
    identificaciones_extra: Number(body.identificaciones_extra || 0)
  }

  if (!data.nombres || data.nombres.length > 100 || !data.apellido_paterno || data.apellido_paterno.length > 80 || data.apellido_materno.length > 80) {
    return { error: 'Escribe los nombres y el primer apellido del menor. Revisa también su longitud.' }
  }
  if (!['femenino','masculino','no_especificado'].includes(data.sexo)) return { error: 'Selecciona un sexo válido.' }
  const meses = ageInMonths(data.fecha_nacimiento, today)
  if (meses === null) return { error: 'La fecha de nacimiento es inválida o está en el futuro.' }
  if (meses < AGE_MIN_MONTHS) return { error: 'Para ingresar a la guardería debe tener al menos un mes cumplido.' }
  if (meses >= AGE_MAX_MONTHS) {
    if (!editando || !data.permanencia_verano) {
      return { error: 'La admisión es desde un mes hasta antes de cumplir 4 años. La permanencia hasta verano solo aplica a menores ya inscritos.' }
    }
    if (!parseDate(data.fecha_limite_permanencia) || data.fecha_limite_permanencia < today) {
      return { error: 'Registra una fecha límite vigente para la permanencia hasta verano.' }
    }
  } else if (data.permanencia_verano || data.fecha_limite_permanencia) {
    return { error: 'La excepción de permanencia se usa únicamente al actualizar un menor que ya cumplió 4 años.' }
  }
  if (data.fecha_ingreso && (!parseDate(data.fecha_ingreso) || data.fecha_ingreso < data.fecha_nacimiento)) {
    return { error: 'La fecha de ingreso debe ser válida y no puede ser anterior al nacimiento.' }
  }
  if (!Number.isInteger(data.identificaciones_extra) || data.identificaciones_extra < 0 || data.identificaciones_extra > 10) {
    return { error: 'Las identificaciones adicionales deben ser un número de 0 a 10.' }
  }
  for (const key of ['alergias','restricciones_alimentarias','cuidados_especiales','observaciones']) {
    if (data[key].length > 2000) return { error: 'Los campos de cuidados y observaciones admiten hasta 2000 caracteres.' }
  }

  const contactos = []
  function agregarContacto(tipo, posicion, requiereParentesco, nombreEtiqueta, obligado = false) {
    const prefix = ['madre','padre'].includes(tipo) ? tipo : `${tipo}_${posicion}`
    const nombre = text(body[`${prefix}_nombre`])
    const telefono = text(body[`${prefix}_telefono`])
    const parentesco = requiereParentesco ? text(body[`${prefix}_parentesco`]) : (tipo === 'madre' ? 'Madre' : 'Padre')
    const correo = text(body[`${prefix}_correo`]).toLowerCase()
    const puede_recoger = tipo === 'autorizado' ? Boolean(nombre || telefono || parentesco) : checked(body[`${prefix}_recoge`])
    const identificacion_entregada = checked(body[`${prefix}_identificacion`])
    const tieneDatos = nombre || telefono || (requiereParentesco && parentesco) || correo || identificacion_entregada || (tipo !== 'autorizado' && puede_recoger)
    if (!tieneDatos && !obligado) return null
    if (!nombre || nombre.length > 150 || !PHONE.test(telefono) || (requiereParentesco && (!parentesco || parentesco.length > 60))) {
      return `Completa correctamente el nombre, parentesco y teléfono de ${nombreEtiqueta}.`
    }
    if (correo && (correo.length > 150 || !EMAIL.test(correo))) return `El correo de ${nombreEtiqueta} es inválido.`
    if (identificacion_entregada && !puede_recoger) return `Para entregar una identificación a ${nombreEtiqueta}, primero debe estar autorizado para recoger.`
    contactos.push({ tipo, posicion, nombre, parentesco, telefono, correo: correo || null, puede_recoger, identificacion_entregada })
    return null
  }

  for (const tipo of ['madre', 'padre']) {
    const error = agregarContacto(tipo, 1, false, tipo === 'madre' ? 'la madre' : 'el padre')
    if (error) return { error }
  }
  if (!contactos.some(c => c.tipo === 'madre' || c.tipo === 'padre')) {
    return { error: 'Registra al menos un padre o una madre con su teléfono.' }
  }
  for (let i = 1; i <= 4; i++) {
    const error = agregarContacto('tutor', i, true, `tutor adicional ${i}`)
    if (error) return { error }
  }
  for (let i = 1; i <= 4; i++) {
    const error = agregarContacto('autorizado', i, true, `persona autorizada ${i}`)
    if (error) return { error }
  }
  if (!contactos.some(c => c.puede_recoger)) return { error: 'Autoriza al menos a una persona para recoger al menor.' }
  return { data, contactos }
}

function contactsToFields(contactos) {
  const fields = {}
  for (const contacto of contactos) {
    const prefix = ['madre','padre'].includes(contacto.tipo) ? contacto.tipo : `${contacto.tipo}_${contacto.posicion}`
    fields[`${prefix}_nombre`] = contacto.nombre
    fields[`${prefix}_telefono`] = contacto.telefono
    fields[`${prefix}_parentesco`] = contacto.parentesco
    fields[`${prefix}_correo`] = contacto.correo || ''
    if (contacto.puede_recoger) fields[`${prefix}_recoge`] = '1'
    if (contacto.identificacion_entregada) fields[`${prefix}_identificacion`] = '1'
  }
  return fields
}

function folio(id) { return `GDR-${String(id).padStart(6, '0')}` }

module.exports = { normalizeExpediente, contactsToFields, ageInMonths, ageLabel, parseDate, todayMexico, validId, folio, AGE_MIN_MONTHS, AGE_MAX_MONTHS }
