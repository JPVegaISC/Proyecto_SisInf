// Pruebas con una base simulada: no necesitan Docker ni MySQL.
// Se ejecutan con npm test después de instalar dependencias.
process.env.NODE_ENV = 'test'
process.env.DB_HOST = 'localhost'
process.env.DB_USER = 'prueba'
process.env.DB_PASSWORD = 'prueba'
process.env.DB_DATABASE = 'prueba'
process.env.JWT_SECRET = 'test_jwt_secret_con_al_menos_32_caracteres_2026'
process.env.SESSION_SECRET = 'test_session_secret_con_al_menos_32_caracteres_2026'
process.env.ADMIN_PASSWORD = 'prueba_admin_password_2026'
const test = require('node:test')
const assert = require('node:assert/strict')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../src/database/db')
const app = require('../src/app')
const admin = {
  id: 1, nombre: 'Administración', email: 'admin@guarderia.local',
  password: bcrypt.hashSync('Prueba123456', 4), rol: 'administrador', activo: 1, token_version: 0
}
const encargado = {
  id: 2, nombre: 'Encargado', email: 'encargado@guarderia.local',
  password: bcrypt.hashSync('Prueba123456', 4), rol: 'encargado', activo: 1, token_version: 0
}
const usuarios = [admin, encargado]
const all = () => usuarios.map(u => ({ ...u }))

db.execute = async (sql, params = []) => {
  if (sql.includes('FROM usuarios WHERE email = ?')) return [all().filter(u => u.email === params[0])]
  if (sql.includes('FROM usuarios WHERE id = ?')) return [all().filter(u => u.id === params[0])]
  if (sql.includes('SELECT id, nombre, email, rol, activo FROM usuarios ORDER BY id')) return [all()]
  if (sql.includes('SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1')) return [[{ total: usuarios.filter(u => u.activo).length }]]
  if (sql.includes('UPDATE usuarios SET token_version = token_version + 1 WHERE id = ?')) {
    const u = usuarios.find(u => u.id === params[0])
    u.token_version += 1
    return [{ affectedRows: 1 }]
  }
  throw new Error('Consulta simulada no implementada: ' + sql)
}

let server
let base
const raw = (route, options = {}) => fetch(base + route, { redirect: 'manual', ...options })
const cookieValue = (response, name) => {
  const header = response.headers.getSetCookie().find(c => c.startsWith(name + '='))
  return header?.split(';')[0]
}

test.before(async () => {
  server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  base = `http://127.0.0.1:${server.address().port}`
})
test.after(() => new Promise(resolve => server.close(resolve)))

test('Login por API genera JWT y valida permisos/revocación', async () => {
  const response = await raw('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password: 'Prueba123456' })
  })
  assert.equal(response.status, 200)
  const { token, token_type, usuario } = await response.json()
  assert.equal(token_type, 'Bearer')
  assert.equal(usuario.rol, 'administrador')
  const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'sistema-guarderia', audience: 'guarderia-web' })
  assert.equal(claims.sub, '1')
  const headers = { Authorization: 'Bearer ' + token }
  const perfil = await raw('/api/auth/me', { headers })
  assert.equal(perfil.status, 200)
  assert.equal((await perfil.json()).usuario.nombre, admin.nombre)
  assert.equal((await raw('/api/usuarios', { headers })).status, 200)
  assert.equal((await raw('/api/auth/me')).status, 401)
  assert.equal((await raw('/api/auth/me', { headers: { Authorization: 'Bearer invalido' } })).status, 401)

  const otherLogin = await raw('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: encargado.email, password: 'Prueba123456' })
  })
  const other = await otherLogin.json()
  assert.equal((await raw('/api/usuarios', { headers: { Authorization: 'Bearer ' + other.token } })).status, 403)
  encargado.token_version += 1
  assert.equal((await raw('/api/auth/me', { headers: { Authorization: 'Bearer ' + other.token } })).status, 401)
  encargado.activo = 0
  const blocked = await raw('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: encargado.email, password: 'Prueba123456' })
  })
  assert.equal(blocked.status, 401)
})

test('Login web mantiene el JWT en Configuración y logout lo revoca', async () => {
  assert.equal((await raw('/')).status, 302)
  const page = await raw('/login')
  assert.equal(page.status, 200)
  const sessionCookie = cookieValue(page, 'guarderia_aux')
  assert.ok(sessionCookie)
  const html = await page.text()
  const csrf = html.match(/name="_csrf" value="([a-f0-9]+)"/)[1]
  const login = await raw('/login', {
    method: 'POST', headers: { Cookie: sessionCookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrf, email: admin.email, password: 'Prueba123456' })
  })
  assert.equal(login.status, 302)
  assert.equal(login.headers.get('location'), '/')
  const jwtCookie = cookieValue(login, 'guarderia_token')
  assert.ok(jwtCookie)
  assert.match(login.headers.getSetCookie().find(c => c.startsWith('guarderia_token=')), /httponly/i)
  const updatedSession = cookieValue(login, 'guarderia_aux') || sessionCookie
  const allCookies = jwtCookie + '; ' + updatedSession
  const dashboard = await raw('/', { headers: { Cookie: allCookies } })
  assert.equal(dashboard.status, 200)
  const dashboardHtml = await dashboard.text()
  assert.match(dashboardHtml, /Bienvenido a la guardería/)
  assert.doesNotMatch(dashboardHtml, /Mi token JWT|Visitas totales|Autenticación con JWT/)
  const optionsPage = await raw('/configuracion', { headers: { Cookie: allCookies } })
  assert.equal(optionsPage.status, 200)
  assert.match(await optionsPage.text(), /Información de acceso/)
  const tokenPage = await raw('/configuracion/acceso', { headers: { Cookie: allCookies } })
  assert.equal(tokenPage.status, 200)
  const tokenHtml = await tokenPage.text()
  assert.match(tokenHtml, /Mostrar token y opciones de prueba/)
  assert.match(tokenHtml, /<details class="technical-details">/)
  const token = decodeURIComponent(jwtCookie.split('=')[1])
  assert.ok(tokenHtml.includes(token))

  const oldRoute = await raw('/mi-token', { headers: { Cookie: allCookies } })
  assert.equal(oldRoute.status, 302)
  assert.equal(oldRoute.headers.get('location'), '/configuracion/acceso')
  const form = tokenHtml.match(/action="\/logout" method="POST">\s*<input type="hidden" name="_csrf" value="([a-f0-9]+)"/)
  assert.ok(form)
  const logout = await raw('/logout', {
    method: 'POST', headers: { Cookie: allCookies, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: form[1] })
  })
  assert.equal(logout.status, 302)
  assert.equal((await raw('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })).status, 401)
})
