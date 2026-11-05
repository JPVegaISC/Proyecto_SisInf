const test = require('node:test')
const assert = require('node:assert/strict')
const grupo = require('../src/models/grupo')
const originalHora = grupo.fechaHoraMexico
let hora = '08:30:00'
grupo.fechaHoraMexico = () => ({ fecha: '2026-11-05', hora })
const dbPath = require.resolve('../src/database/db')
const consultas = []
let duplicado = false
let encargadoId = 2
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  execute: async (sql, params) => {
    consultas.push({ sql, params })
    if (sql.includes('FROM menores m LEFT JOIN asignaciones_grupo')) return [[{
      id: 7, nombres: 'Elena', apellido_paterno: 'López', fecha_nacimiento: '2026-01-01',
      fecha_ingreso: '2026-09-01', permanencia_verano: 0, fecha_limite_permanencia: null,
      grupo_id: 1, grupo_nombre: 'Lactantes', encargado_id: encargadoId
    }]]
    if (sql.includes('INSERT INTO entradas')) {
      if (duplicado) throw Object.assign(new Error('duplicada'), { code: 'ER_DUP_ENTRY' })
      return [{ insertId: 4 }]
    }
    throw new Error('Consulta no simulada: ' + sql)
  }
} }
const recepcion = require('../src/controllers/recepcionController')
const datos = {
  revision_fisica: 'con_observaciones', observaciones_fisicas: 'Raspadura en la rodilla',
  leche: 'si', panales: 'no', ropa: 'no_aplica', cobija: 'si', otros_articulos: 'Mochila'
}
function request(rol = 'encargado') {
  return { params: { id: '7' }, body: datos, usuario: { id: rol === 'administrador' ? 1 : 2, rol }, session: {} }
}
function response() {
  return {
    code: 200, redirectTo: null, rendered: null,
    status(code) { this.code = code; return this },
    render(view) { this.rendered = view; return this },
    redirect(dest) { this.redirectTo = dest; return this }
  }
}

test('rechaza una entrada fuera del horario aunque el formulario envíe datos válidos', async () => {
  hora = '07:59:59'
  consultas.length = 0
  const req = request(), res = response()
  await recepcion.registrar(req, res, err => { throw err })
  assert.equal(consultas.length, 0)
  assert.equal(res.redirectTo, '/recepcion/7')
  assert.match(req.session.flash.message, /8:00 a 9:00/)
})

test('un encargado asignado registra la revisión y los artículos con hora del servidor', async () => {
  hora = '08:30:00'
  duplicado = false
  encargadoId = 2
  consultas.length = 0
  const req = request(), res = response()
  await recepcion.registrar(req, res, err => { throw err })
  assert.equal(res.redirectTo, '/recepcion/7')
  assert.equal(req.session.flash.type, 'success')
  assert.match(req.session.flash.message, /pañales/)
  const alta = consultas.find(c => c.sql.includes('INSERT INTO entradas'))
  assert.ok(alta)
  assert.equal(alta.params[2], '2026-11-05')
  assert.equal(alta.params[3], '08:30:00')
  assert.equal(alta.params[4], 'con_observaciones')
  assert.equal(alta.params[7], 'no')
})

test('no duplica entradas del mismo menor y día', async () => {
  duplicado = true
  const req = request('administrador'), res = response()
  await recepcion.registrar(req, res, err => { throw err })
  assert.equal(res.redirectTo, '/recepcion/7')
  assert.match(req.session.flash.message, /ya tiene una entrada/)
  duplicado = false
})

test('un encargado no puede registrar entradas de otro grupo', async () => {
  encargadoId = 9
  consultas.length = 0
  const req = request(), res = response()
  await recepcion.registrar(req, res, err => { throw err })
  assert.equal(res.code, 403)
  assert.equal(res.rendered, '403')
  assert.equal(consultas.filter(c => c.sql.includes('INSERT INTO entradas')).length, 0)
  encargadoId = 2
})

test.after(() => { grupo.fechaHoraMexico = originalHora })
