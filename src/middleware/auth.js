const jwt = require('jsonwebtoken')
const db = require('../database/db')
const config = require('../config')
const { setFlash } = require('../utils/flash')
const COOKIE_NAME = 'guarderia_token'
const TOKEN_SECONDS = 2 * 60 * 60
const VALID_ROLES = ['administrador', 'encargado', 'enfermeria']

function createToken(usuario) {
  return jwt.sign(
    { rol: usuario.rol, ver: Number(usuario.token_version) },
    config.jwtSecret,
    { algorithm: 'HS256', subject: String(usuario.id), issuer: 'sistema-guarderia', audience: 'guarderia-web', expiresIn: TOKEN_SECONDS }
  )
}
function tokenCookieOptions() {
  return { httpOnly: true, secure: config.isProduction, sameSite: 'lax', path: '/', maxAge: TOKEN_SECONDS * 1000 }
}
function clearToken(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: config.isProduction, sameSite: 'lax', path: '/' })
}
async function resolveToken(token) {
  if (!token || typeof token !== 'string') return null
  let claims
  try {
    claims = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'], issuer: 'sistema-guarderia', audience: 'guarderia-web'
    })
  } catch { return null }
  if (!/^\d+$/.test(String(claims.sub || ''))) return null
  const [rows] = await db.execute(
    'SELECT id, nombre, email, rol, activo, token_version FROM usuarios WHERE id = ?',
    [Number(claims.sub)]
  )
  const usuario = rows[0]
  if (!usuario || !usuario.activo || !VALID_ROLES.includes(usuario.rol)) return null
  if (Number(usuario.token_version) !== claims.ver || usuario.rol !== claims.rol) return null
  return usuario
}
async function optionalWebAuth(req, res, next) {
  try {
    req.usuario = await resolveToken(req.cookies[COOKIE_NAME])
    res.locals.usuario = req.usuario
    next()
  } catch (err) { next(err) }
}
function requireWebAuth(req, res, next) {
  if (!req.usuario) {
    clearToken(res)
    setFlash(req, 'warning', 'Inicia sesión para acceder al sistema.')
    return res.redirect('/login')
  }
  next()
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return res.redirect('/login')
    if (!roles.includes(req.usuario.rol)) return res.status(403).render('403', { titulo: 'Acceso restringido' })
    next()
  }
}
async function requireBearer(req, res, next) {
  const value = req.headers.authorization || ''
  if (!value.startsWith('Bearer ')) return res.status(401).json({ error: 'Token Bearer requerido.' })
  try {
    req.usuario = await resolveToken(value.slice(7).trim())
    if (!req.usuario) return res.status(401).json({ error: 'Token inválido, caducado o revocado.' })
    next()
  } catch (err) { next(err) }
}
function requireApiRole(...roles) {
  return (req, res, next) => roles.includes(req.usuario.rol)
    ? next()
    : res.status(403).json({ error: 'Tu rol no permite esta operación.' })
}
module.exports = {
  COOKIE_NAME, TOKEN_SECONDS, VALID_ROLES, createToken, tokenCookieOptions,
  clearToken, resolveToken, optionalWebAuth, requireWebAuth, requireRole,
  requireBearer, requireApiRole
}
