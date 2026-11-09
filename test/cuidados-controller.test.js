const test = require('node:test')
const assert = require('node:assert/strict')
const grupo = require('../src/models/grupo')
const originalHora = grupo.fechaHoraMexico
grupo.fechaHoraMexico = () => ({ fecha: '2026-11-12', hora: '10:33:40' })

let encargadoId = 2
let tieneEntrada = true
const consultas = []
let rollbacks = 0
let commits = 0
let releases = 0
const conexion = {
  beginTransaction: async () => {},
  rollback: async () => { rollbacks++ },
  commit: async () => { commits++ },
  release: () => { releases++ },
  execute: async (sql, params) => {
    consultas.push({ sql, params })
    if (sql.includes('FROM menores m LEFT JOIN asignaciones_grupo')) return [[{ id: 9, encargado_id: encargadoId }]]
    if (sql.includes('FROM entradas WHERE menor_id')) return [tieneEntrada ? [{ id: 81 }] : []]
    if (sql.includes('INSERT INTO cuidados_diarios')) return [{ insertId: 45 }]
    throw new Error('Consulta no simulada: ' + sql)
  }
}
const dbPath = require.resolve('../src/database/db')
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getConnection: async () => conexion } }
const cuidados = require('../src/controllers/cuidadosController')
const pedir = (rol = 'encargado') => ({
  params: { id: '9' }, body: { tipo: 'comida', descripcion: 'Purè de calabaza', observaciones: 'Comió bien' },
  usuario: { id: rol === 'administrador' ? 1 : 2, rol }, session: {}
})
const responder = () => ({
  code: 200, redirectTo: '', rendered: '',
  status(code) { this.code = code; return this },
  render(view) { this.rendered = view; return this },
  redirect(dest) { this.redirectTo = dest; return this }
})

test('guarda el cuidado con la fecha, hora y entrada del servidor', async () => {
  consultas.length = 0
  const req = pedir(), res = responder()
  await cuidados.registrar(req, res, err => { throw err })
  assert.equal(res.redirectTo, '/cuidados/9')
  assert.equal(req.session.flash.type, 'success')
  const alta = consultas.find(q => q.sql.includes('INSERT INTO cuidados_diarios'))
  assert.ok(alta)
  assert.deepEqual(alta.params.slice(0, 5), [9, 81, '2026-11-12', '10:33:40', 'comida'])
  assert.equal(alta.params[7], 2)
  assert.equal(commits, 1)
})

test('impide registrar a un encargado fuera de su grupo', async () => {
  encargadoId = 4
  consultas.length = 0
  const res = responder()
  await cuidados.registrar(pedir(), res, err => { throw err })
  assert.equal(res.code, 403)
  assert.equal(consultas.filter(q => q.sql.includes('INSERT')).length, 0)
  assert.ok(rollbacks > 0)
  encargadoId = 2
})

test('permite registrar con fecha del servidor aunque no haya entrada del día', async () => {
  tieneEntrada = false
  consultas.length = 0
  const req = pedir(), res = responder()
  await cuidados.registrar(req, res, err => { throw err })
  assert.equal(res.redirectTo, '/cuidados/9')
  assert.equal(req.session.flash.type, 'success')
  const alta = consultas.find(q => q.sql.includes('INSERT INTO cuidados_diarios'))
  assert.equal(alta.params[1], null)
  assert.equal(alta.params[2], '2026-11-12')
  tieneEntrada = true
})

test('administración puede registrar y no se guardan formularios incompletos', async () => {
  const req = pedir('administrador'), res = responder()
  encargadoId = null
  await cuidados.registrar(req, res, err => { throw err })
  assert.equal(req.session.flash.type, 'success')
  const mala = pedir()
  mala.body.descripcion = ''
  consultas.length = 0
  await cuidados.registrar(mala, responder(), err => { throw err })
  assert.equal(consultas.length, 0)
  assert.ok(releases >= 4)
  encargadoId = 2
})

test.after(() => { grupo.fechaHoraMexico = originalHora })
