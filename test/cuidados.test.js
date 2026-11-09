const test = require('node:test')
const assert = require('node:assert/strict')
const { validarCuidado, validarInsumo, avisosEdad } = require('../src/models/cuidados')
const { createCuidadosTables } = require('../src/database/cuidados')

test('acepta actividades, comidas y accidentes con descripción', () => {
  for (const tipo of ['actividad', 'comida', 'accidente']) {
    const resultado = validarCuidado({ tipo, descripcion: 'Registro de prueba', observaciones: 'Sin novedades' })
    assert.deepEqual(resultado.data, { tipo, descripcion: 'Registro de prueba', observaciones: 'Sin novedades' })
  }
})

test('no guarda cuidados incompletos o con tipos no permitidos', () => {
  assert.ok(validarCuidado({ tipo: 'medicamento', descripcion: 'ejemplo' }).error)
  assert.ok(validarCuidado({ tipo: 'comida', descripcion: '   ' }).error)
  assert.ok(validarCuidado({ tipo: 'actividad', descripcion: 'x'.repeat(501) }).error)
  assert.ok(validarCuidado({ tipo: 'accidente', descripcion: 'Caída', observaciones: 'x'.repeat(2001) }).error)
})

test('valida cantidades de inventario e identifica valores al mínimo', () => {
  assert.equal(validarInsumo({ nombre: 'Pañales', unidad: 'piezas', cantidad: '5', minimo: '5' }).data.cantidad, 5)
  for (const cantidad of ['-1', '1.5', 'tres', '', '1000001']) {
    assert.ok(validarInsumo({ nombre: 'Pañales', unidad: 'piezas', cantidad, minimo: '5' }).error)
  }
  assert.ok(validarInsumo({ nombre: '', unidad: 'piezas', cantidad: 0, minimo: 0 }).error)
  assert.ok(validarInsumo({ nombre: 'Leche', unidad: '', cantidad: 0, minimo: 0 }).error)
  assert.equal(avisosEdad(5).length, 1)
  assert.equal(avisosEdad(9).length, 1)
  assert.equal(avisosEdad(24).length, 1)
})

test('crea las tablas sin borrar expedientes ni entradas existentes', async () => {
  const consultas = []
  await createCuidadosTables({ query: async sql => { consultas.push(sql); return [[]] } })
  assert.equal(consultas.length, 2)
  assert.ok(consultas.every(sql => sql.includes('CREATE TABLE IF NOT EXISTS')))
  assert.ok(consultas.some(sql => sql.includes('FOREIGN KEY (entrada_id) REFERENCES entradas(id)')))
  assert.ok(consultas.some(sql => sql.includes('UNIQUE KEY uq_insumos_nombre')))
  assert.ok(consultas.every(sql => !/DROP|TRUNCATE/i.test(sql)))
})
