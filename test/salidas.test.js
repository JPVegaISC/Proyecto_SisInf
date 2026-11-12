const test = require('node:test')
const assert = require('node:assert/strict')
const { enHorarioSalida, esRetraso, validarContacto, validarObservaciones } = require('../src/models/salida')
const { createSalidasTables } = require('../src/database/salidas')

test('las salidas empiezan a las 15 y generan retraso después de las 16', () => {
  assert.equal(enHorarioSalida('14:59:59'), false)
  assert.equal(enHorarioSalida('15:00:00'), true)
  assert.equal(enHorarioSalida('16:10:00'), true)
  assert.equal(esRetraso('16:00:00'), false)
  assert.equal(esRetraso('16:00:01'), true)
  assert.equal(esRetraso('15:20:00'), false)
})

test('requiere contacto válido y observaciones cortas', () => {
  assert.equal(validarContacto('25'), true)
  assert.equal(validarContacto('0'), false)
  assert.equal(validarContacto('invitado'), false)
  assert.equal(validarObservaciones('Todo bien'), true)
  assert.equal(validarObservaciones('a'.repeat(501)), false)
})

test('las migraciones de salidas conservan tablas previas e historial', async () => {
  const sql = []
  const db = { query: async q => { sql.push(q); return [[]] } }
  await createSalidasTables(db)
  assert.equal(sql.filter(q => q.includes('CREATE TABLE IF NOT EXISTS')).length, 3)
  assert(sql.some(q => q.includes('UNIQUE KEY uq_salida_menor_fecha')))
  assert(sql.some(q => q.includes('CREATE TABLE IF NOT EXISTS movimientos_menor')))
  assert(sql.every(q => !/DROP TABLE|TRUNCATE TABLE|DELETE FROM menores/i.test(q)))
})
