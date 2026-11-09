const test = require('node:test')
const assert = require('node:assert/strict')
const registros = []
let duplicado = false
let encontrados = 1
const dbPath = require.resolve('../src/database/db')
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  execute: async (sql, params) => {
    registros.push({ sql, params })
    if (duplicado) throw Object.assign(new Error('Ya existe'), { code: 'ER_DUP_ENTRY' })
    if (sql.startsWith('UPDATE')) return [{ affectedRows: encontrados }]
    return [{ insertId: 7 }]
  }
} }
const insumos = require('../src/controllers/insumosController')
const request = () => ({ params: { id: '5' }, body: { nombre: 'Pañales', unidad: 'piezas', cantidad: '3', minimo: '5' }, usuario: { rol: 'administrador', id: 1 }, session: {} })
const response = () => ({ code: 200, redirectTo: '', rendered: '', status(c) { this.code = c; return this }, redirect(d) { this.redirectTo = d; return this }, render(v) { this.rendered = v; return this } })

test('registra una existencia con mínimo y responsable', async () => {
  registros.length = 0
  const req = request(), res = response()
  await insumos.crear(req, res, e => { throw e })
  assert.equal(res.redirectTo, '/insumos')
  assert.equal(req.session.flash.type, 'success')
  assert.deepEqual(registros[0].params, ['Pañales', 'piezas', 3, 5, 1])
})

test('permite actualizar cantidades sin crear otro insumo', async () => {
  registros.length = 0
  await insumos.actualizar(request(), response(), e => { throw e })
  assert.ok(registros[0].sql.startsWith('UPDATE'))
  assert.equal(registros[0].params[5], 5)
})

test('rechaza valores inválidos, duplicados e identificadores que no existen', async () => {
  const req = request()
  req.body.cantidad = '-1'
  registros.length = 0
  await insumos.crear(req, response(), e => { throw e })
  assert.equal(registros.length, 0)
  duplicado = true
  const duplicada = request()
  await insumos.crear(duplicada, response(), e => { throw e })
  assert.match(duplicada.session.flash.message, /Ya existe/)
  duplicado = false
  encontrados = 0
  const noExiste = response()
  await insumos.actualizar(request(), noExiste, e => { throw e })
  assert.equal(noExiste.code, 404)
  encontrados = 1
})
