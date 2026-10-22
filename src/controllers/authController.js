const bcrypt = require('bcryptjs')
const db = require('../database/db')
const auth = require('../middleware/auth')
const { setFlash } = require('../utils/flash')

async function findValidUser(email, password) {
  if (!email || !password) return null
  const [rows] = await db.execute(
    'SELECT id, nombre, email, password, rol, activo, token_version FROM usuarios WHERE email = ?',
    [email.trim().toLowerCase()]
  )
  const user = rows[0]
  if (!user || !user.activo) return null
  if (!await bcrypt.compare(password, user.password)) return null
  return user
}
const publicUser = u => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol })

exports.loginView = (req, res) => res.render('login', { titulo: 'Iniciar sesión' })
exports.loginWeb = async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email : ''
    const password = typeof req.body.password === 'string' ? req.body.password : ''
    const usuario = await findValidUser(email, password)
    if (!usuario) {
      setFlash(req, 'danger', 'Correo o contraseña incorrectos, o usuario inactivo.')
      return res.redirect('/login')
    }
    // Regenerar sesión auxiliar (flash y CSRF); el JWT es el único medio de autenticación.
    req.session.regenerate(err => {
      if (err) return next(err)
      res.cookie(auth.COOKIE_NAME, auth.createToken(usuario), auth.tokenCookieOptions())
      res.redirect('/')
    })
  } catch (err) { next(err) }
}
exports.logoutWeb = async (req, res, next) => {
  try {
    // Revocar inmediatamente JWTs previos, incluso si se guardó uno para las pruebas.
    await db.execute('UPDATE usuarios SET token_version = token_version + 1 WHERE id = ?', [req.usuario.id])
    auth.clearToken(res)
    req.session.destroy(err => {
      if (err) return next(err)
      res.redirect('/login?salio=1')
    })
  } catch (err) { next(err) }
}
exports.settingsView = (req, res) => res.render('configuracion', { titulo: 'Configuración' })
exports.tokenView = (req, res) => {
  res.set('Cache-Control', 'no-store')
  res.render('mi-token', { titulo: 'Información de acceso', token: req.cookies[auth.COOKIE_NAME] })
}
exports.apiLogin = async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email : ''
    const password = typeof req.body.password === 'string' ? req.body.password : ''
    const usuario = await findValidUser(email, password)
    if (!usuario) return res.status(401).json({ error: 'Credenciales incorrectas o cuenta inactiva.' })
    res.set('Cache-Control', 'no-store')
    res.json({ token: auth.createToken(usuario), token_type: 'Bearer', expires_in: auth.TOKEN_SECONDS, usuario: publicUser(usuario) })
  } catch (err) { next(err) }
}
exports.apiMe = (req, res) => res.json({ usuario: publicUser(req.usuario) })
