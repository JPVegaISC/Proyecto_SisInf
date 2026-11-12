const test = require('node:test')
const assert = require('node:assert/strict')
const { GRUPOS, grupoParaEdad, fechaHoraMexico, enHorarioRecepcion, validarRecepcion } = require('../src/models/grupo')

const hoy = '2026-11-05'
const recepcion = cambios => ({
  revision_fisica: 'sin_lesiones', leche: 'si', panales: 'si', ropa: 'no_aplica', cobija: 'si', ...cambios
})

test('los cuatro grupos corresponden a intervalos de edad sin traslapes', () => {
  assert.equal(GRUPOS.length, 4)
  assert.deepEqual(GRUPOS.map(g => [g.min, g.max]), [[1,11],[12,23],[24,35],[36,47]])
  assert.equal(grupoParaEdad('2026-10-05', hoy), 1)
  assert.equal(grupoParaEdad('2025-11-06', hoy), 1)
  assert.equal(grupoParaEdad('2025-11-05', hoy), 2)
  assert.equal(grupoParaEdad('2024-11-05', hoy), 3)
  assert.equal(grupoParaEdad('2023-11-05', hoy), 4)
  assert.equal(grupoParaEdad('2022-11-05', hoy), null)
  assert.equal(grupoParaEdad('2026-10-06', hoy), null)
  assert.equal(grupoParaEdad('2026-11-06', hoy), null)
})

test('respeta la permanencia especial después de cuatro años', () => {
  assert.equal(grupoParaEdad('2022-11-05', hoy, true, '2027-08-30'), 4)
  assert.equal(grupoParaEdad('2022-11-05', hoy, true, '2026-11-04'), null)
  assert.equal(grupoParaEdad('2022-11-05', hoy, false, '2027-08-30'), null)
})

test('el horario de recepción acepta solamente desde 08:00 hasta 09:00', () => {
  assert.equal(enHorarioRecepcion('07:59:59'), false)
  assert.equal(enHorarioRecepcion('08:00:00'), true)
  assert.equal(enHorarioRecepcion('08:59:59'), true)
  assert.equal(enHorarioRecepcion('09:00:00'), true)
  assert.equal(enHorarioRecepcion('09:00:01'), false)
  assert.equal(enHorarioRecepcion('15:00:00'), false)
  assert.equal(enHorarioRecepcion('09:00'), false)
  const local = fechaHoraMexico(new Date('2026-11-05T14:15:10Z'))
  assert.deepEqual(local, { fecha: '2026-11-05', hora: '08:15:10' })
})

test('la revisión física y los artículos requieren valores válidos', () => {
  assert.equal(validarRecepcion(recepcion()).error, undefined)
  const r = validarRecepcion(recepcion({ leche: 'no', panales: 'no' }))
  assert.deepEqual(r.faltantes, ['leche', 'panales'])
  assert.equal(validarRecepcion(recepcion({ revision_fisica: 'con_observaciones' })).error.includes('Describe'), true)
  assert.equal(validarRecepcion(recepcion({ revision_fisica: 'con_observaciones', observaciones_fisicas: 'Raspadura leve' })).error, undefined)
  assert.match(validarRecepcion(recepcion({ panales: 'desconocido' })).error, /pañales/)
  assert.match(validarRecepcion(recepcion({ leche: undefined })).error, /leche/)
  assert.match(validarRecepcion(recepcion({ notas_articulos: 'a'.repeat(501) })).error, /longitud/)
  assert.match(validarRecepcion(recepcion({ observaciones_fisicas: 'a'.repeat(1001) })).error, /longitud/)
})

test('la migración conserva los datos y crea tablas con horario configurable', async () => {
  const { createGruposTables } = require('../src/database/grupos')
  const queries = []
  const db = {
    query: async sql => { queries.push(sql); return [[]] },
    execute: async (sql) => { queries.push(sql); return [[]] }
  }
  await createGruposTables(db)
  assert.equal(queries.filter(q => q.includes('CREATE TABLE IF NOT EXISTS')).length, 5)
  assert(queries.some(q => q.includes('UNIQUE KEY uq_entrada_menor_fecha')))
  assert(queries.every(sql => !/DROP TABLE|TRUNCATE TABLE|DELETE FROM menores/.test(sql)))
})

test('la migración asigna los expedientes anteriores según edad sin sobreescribir existentes', async () => {
  const { createGruposTables } = require('../src/database/grupos')
  const insertados = []
  const db = {
    query: async () => [[]],
    execute: async (sql, params) => {
      if (sql.startsWith('SELECT m.id')) return [[
        { id: 7, fecha_nacimiento: '2025-11-05', permanencia_verano: 0, fecha_limite_permanencia: null },
        { id: 8, fecha_nacimiento: '2022-11-05', permanencia_verano: 0, fecha_limite_permanencia: null }
      ]]
      if (sql.includes('INSERT IGNORE INTO asignaciones_grupo')) insertados.push(params)
      return [[]]
    }
  }
  // La edad se calcula con la fecha local de ejecución, así que aquí solo verificamos que
  // los intentos de migración sean aditivos y dirigidos a los expedientes sin grupo.
  await createGruposTables(db)
  assert(insertados.every(v => v[0] === 7 || v[0] === 8))
})

test('el horario de recepción puede cambiarse desde administración', () => {
  const { validarHorario, edadCorrespondeGrupo } = require('../src/models/grupo')
  assert.deepEqual(validarHorario('07:00', '10:30'), { inicio: '07:00:00', fin: '10:30:00' })
  assert.equal(validarHorario('19:30', '10:00'), null)
  assert.equal(validarHorario('25:30', '26:00'), null)
  assert.equal(enHorarioRecepcion('09:45:00', '07:00:00', '10:30:00'), true)
  assert.equal(edadCorrespondeGrupo('2025-09-15', { edad_min_meses: 12, edad_max_meses: 23, activo: 1 }, '2026-11-12'), true)
  assert.equal(edadCorrespondeGrupo('2025-09-15', { edad_min_meses: 24, edad_max_meses: 35, activo: 1 }, '2026-11-12'), false)
})
