const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeExpediente, ageInMonths, ageLabel, parseDate, contactsToFields, folio, validId
} = require('../src/models/expediente')

const hoy = '2026-10-28'
const completo = datos => ({
  nombres: 'María José', apellido_paterno: 'López', apellido_materno: 'García',
  fecha_nacimiento: '2024-04-10', sexo: 'femenino',
  madre_nombre: 'Elena García', madre_telefono: '445 123 4567', madre_recoge: '1',
  ...datos
})

test('revisa fechas correctas y fechas que no existen', () => {
  assert.deepEqual(parseDate('2024-02-29'), { y: 2024, m: 2, d: 29 })
  assert.equal(parseDate('2023-02-29'), null)
  assert.equal(parseDate('2024-04-31'), null)
  assert.equal(parseDate('2024-13-01'), null)
})

test('calcula meses y años cumplidos', () => {
  assert.equal(ageInMonths('2024-04-10', hoy), 30)
  assert.equal(ageLabel('2024-04-10', hoy), '2 años y 6 meses')
  assert.equal(ageInMonths('2026-10-29', hoy), null)
})

test('acepta al menor desde un mes cumplido', () => {
  assert.equal(normalizeExpediente(completo({ fecha_nacimiento: '2026-09-28' }), hoy).error, undefined)
  assert.match(normalizeExpediente(completo({ fecha_nacimiento: '2026-09-29' }), hoy).error, /al menos un mes/)
  assert.match(normalizeExpediente(completo({ fecha_nacimiento: hoy }), hoy).error, /al menos un mes/)
})

test('rechaza inscripciones desde los 4 años', () => {
  assert.equal(normalizeExpediente(completo({ fecha_nacimiento: '2022-10-29' }), hoy).error, undefined)
  assert.match(normalizeExpediente(completo({ fecha_nacimiento: '2022-10-28' }), hoy).error, /4 años/)
  assert.match(normalizeExpediente(completo({ fecha_nacimiento: '2020-01-01' }), hoy).error, /4 años/)
  assert.match(normalizeExpediente(completo({ fecha_nacimiento: '2022-10-28', permanencia_verano: '1', fecha_limite_permanencia: '2027-08-31' }), hoy).error, /4 años/)
})

test('permite la permanencia especial solo al actualizar y con fecha vigente', () => {
  const mayor = completo({ fecha_nacimiento: '2022-10-28', permanencia_verano: '1', fecha_limite_permanencia: '2027-08-31' })
  assert.equal(normalizeExpediente(mayor, hoy, true).error, undefined)
  assert.match(normalizeExpediente({ ...mayor, fecha_limite_permanencia: '2026-10-27' }, hoy, true).error, /vigente/)
  assert.match(normalizeExpediente({ ...mayor, permanencia_verano: '' }, hoy, true).error, /4 años/)
  assert.match(normalizeExpediente(completo({ permanencia_verano: '1', fecha_limite_permanencia: '2027-08-31' }), hoy, true).error, /únicamente/)
})

test('no guarda datos incompletos ni fechas inválidas', () => {
  assert.match(normalizeExpediente(completo({ nombres: '' }), hoy).error, /nombres/)
  assert.match(normalizeExpediente(completo({ madre_nombre: '', madre_telefono: '', madre_recoge: '' }), hoy).error, /padre o una madre/)
  assert.match(normalizeExpediente(completo({ madre_recoge: '' }), hoy).error, /al menos a una persona/)
  assert.match(normalizeExpediente(completo({ fecha_nacimiento: '2026-10-29' }), hoy).error, /futuro/)
  assert.match(normalizeExpediente(completo({ fecha_ingreso: '2020-01-01' }), hoy).error, /ingreso/)
})

test('valida teléfono, correo, sexo y textos', () => {
  assert.match(normalizeExpediente(completo({ madre_telefono: '22' }), hoy).error, /teléfono/)
  assert.match(normalizeExpediente(completo({ madre_correo: 'no-valido' }), hoy).error, /correo/)
  assert.match(normalizeExpediente(completo({ sexo: 'otro' }), hoy).error, /sexo/)
  assert.match(normalizeExpediente(completo({ cuidados_especiales: 'a'.repeat(2001) }), hoy).error, /2000/)
})

test('guarda familiares, cuatro tutores y otros autorizados', () => {
  const extra = {}
  for (let i = 1; i <= 4; i++) {
    extra[`tutor_${i}_nombre`] = `Tutor ${i}`
    extra[`tutor_${i}_parentesco`] = 'Tía'
    extra[`tutor_${i}_telefono`] = '445 111 2222'
    extra[`tutor_${i}_recoge`] = '1'
    extra[`autorizado_${i}_nombre`] = `Recoge ${i}`
    extra[`autorizado_${i}_parentesco`] = 'Familiar'
    extra[`autorizado_${i}_telefono`] = '445 222 3333'
  }
  const resultado = normalizeExpediente(completo(extra), hoy)
  assert.equal(resultado.error, undefined)
  assert.equal(resultado.contactos.length, 9)
  assert.equal(resultado.contactos.filter(c => c.tipo === 'tutor').length, 4)
  assert.equal(resultado.contactos.filter(c => c.tipo === 'autorizado').length, 4)
})

test('rechaza datos incompletos de un tutor y una persona autorizada', () => {
  assert.match(normalizeExpediente(completo({ tutor_1_nombre: 'José' }), hoy).error, /tutor adicional 1/)
  assert.match(normalizeExpediente(completo({ autorizado_1_nombre: 'Luisa' }), hoy).error, /persona autorizada 1/)
  assert.match(normalizeExpediente(completo({ tutor_2_recoge: '1' }), hoy).error, /tutor adicional 2/)
})

test('controla entrega de identificaciones y solicitudes adicionales', () => {
  const r = normalizeExpediente(completo({
    madre_identificacion: '1', identificaciones_extra: '2', alergias: 'Penicilina',
    restricciones_alimentarias: 'No nueces'
  }), hoy)
  assert.equal(r.error, undefined)
  assert.equal(r.contactos[0].identificacion_entregada, true)
  assert.equal(r.data.identificaciones_extra, 2)
  assert.equal(r.data.alergias, 'Penicilina')
  assert.equal(contactsToFields(r.contactos).madre_identificacion, '1')
  assert.match(normalizeExpediente(completo({ identificaciones_extra: '11' }), hoy).error, /0 a 10/)
  assert.match(normalizeExpediente(completo({ madre_recoge: '', madre_identificacion: '1', padre_nombre: 'Pablo', padre_telefono: '445 000 2222', padre_recoge: '1' }), hoy).error, /autorizado para recoger/)
})

test('mantiene folio y evita identificadores inválidos', () => {
  assert.equal(folio(9), 'GDR-000009')
  assert.equal(validId('0'), false)
  assert.equal(validId('1 OR 1=1'), false)
  assert.equal(validId('19'), true)
  const resultado = normalizeExpediente(completo({ nombres: '  María   José  ' }), hoy)
  assert.equal(resultado.data.nombres, 'María José')
})

test('la migración es aditiva y permite volver a iniciarse', async () => {
  const { createExpedientesTables } = require('../src/database/migraciones')
  const consultas = []
  const fake = { query: async (sql, params) => {
    consultas.push(sql)
    if (sql.startsWith('SHOW COLUMNS')) return [[]]
    return [[]]
  } }
  await createExpedientesTables(fake)
  assert.equal(consultas.filter(q => q.includes('CREATE TABLE IF NOT EXISTS')).length, 2)
  assert.equal(consultas.filter(q => q.includes('ALTER TABLE')).length, 5)
  assert(consultas.every(sql => !/DROP TABLE|TRUNCATE TABLE/.test(sql)))
  const segundo = []
  await createExpedientesTables({ query: async sql => {
    segundo.push(sql)
    if (sql.startsWith('SHOW COLUMNS')) return [[{ Field: 'existe' }]]
    return [[]]
  } })
  assert.equal(segundo.filter(q => q.includes('ALTER TABLE')).length, 0)
})
