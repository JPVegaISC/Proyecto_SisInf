const bcrypt = require('bcryptjs')
const db = require('../database/db')
const { VALID_ROLES } = require('../middleware/auth')
const { setFlash } = require('../utils/flash')
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0
const go = (req, res, type, message, path = '/usuarios') => {
  setFlash(req, type, message)
  res.redirect(path)
}

exports.list = async (req, res, next) => {
  try {
    const [usuarios] = await db.execute(
      'SELECT id, nombre, email, rol, activo, created_at FROM usuarios ORDER BY id DESC'
    )
    res.render('usuarios', { titulo: 'Personal registrado', usuarios })
  } catch (err) { next(err) }
}
exports.newForm = (req, res) => res.render('usuario-form', { titulo: 'Agregar usuario', editando: null })
exports.editForm = async (req, res, next) => {
  if (!validId(req.params.id)) return go(req, res, 'danger', 'ID de usuario inválido.')
  try {
    const [rows] = await db.execute('SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?', [Number(req.params.id)])
    if (!rows[0]) return go(req, res, 'danger', 'No se encontró al usuario.')
    res.render('usuario-form', { titulo: 'Editar usuario', editando: rows[0] })
  } catch (err) { next(err) }
}
function extract(body) {
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const rol = typeof body.rol === 'string' ? body.rol : ''
  return { nombre, email, password, rol }
}
function validate(data, creating) {
  if (!data.nombre || data.nombre.length > 100 || !EMAIL_REGEX.test(data.email) || data.email.length > 150) return 'Revisa el nombre y el correo.'
  if (!VALID_ROLES.includes(data.rol)) return 'Selecciona un rol válido.'
  if ((creating || data.password) && (data.password.length < 8 || data.password.length > 72)) return 'La contraseña debe tener entre 8 y 72 caracteres.'
  return null
}
exports.create = async (req, res, next) => {
  const data = extract(req.body)
  const error = validate(data, true)
  if (error) return go(req, res, 'warning', error, '/usuarios/nuevo')
  try {
    const hash = await bcrypt.hash(data.password, 12)
    await db.execute(
      'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
      [data.nombre, data.email, hash, data.rol]
    )
    go(req, res, 'success', 'Usuario registrado con su rol.')
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return go(req, res, 'warning', 'El correo ya está registrado.', '/usuarios/nuevo')
    next(err)
  }
}
exports.update = async (req, res, next) => {
  const id = Number(req.params.id)
  if (!validId(id)) return go(req, res, 'danger', 'ID de usuario inválido.')
  const data = extract(req.body)
  const error = validate(data, false)
  if (error) return go(req, res, 'warning', error, `/usuarios/${id}/editar`)
  try {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const [rows] = await connection.execute('SELECT id, rol, activo FROM usuarios WHERE id = ? FOR UPDATE', [id])
      if (!rows[0]) { await connection.rollback(); return go(req, res, 'danger', 'Usuario no encontrado.') }
      const original = rows[0]
      if (id === req.usuario.id && data.rol !== 'administrador') {
        await connection.rollback()
        return go(req, res, 'warning', 'No puedes quitarte tu rol de administrador.', `/usuarios/${id}/editar`)
      }
      if (original.rol === 'administrador' && data.rol !== 'administrador' && original.activo) {
        const [[count]] = await connection.execute("SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'administrador' AND activo = 1")
        if (count.total <= 1) {
          await connection.rollback()
          return go(req, res, 'warning', 'Debe permanecer al menos un administrador activo.', `/usuarios/${id}/editar`)
        }
      }
      const campos = ['nombre = ?', 'email = ?', 'rol = ?', 'token_version = token_version + 1']
      const values = [data.nombre, data.email, data.rol]
      if (data.password) {
        campos.push('password = ?')
        values.push(await bcrypt.hash(data.password, 12))
      }
      values.push(id)
      await connection.execute(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`, values)
      await connection.commit()
      go(req, res, 'success', 'Datos y permisos actualizados. Los tokens anteriores quedaron revocados.')
    } catch (err) {
      await connection.rollback()
      if (err.code === 'ER_DUP_ENTRY') return go(req, res, 'warning', 'El correo ya está registrado.', `/usuarios/${id}/editar`)
      next(err)
    } finally { connection.release() }
  } catch (err) { next(err) }
}
exports.toggleActive = async (req, res, next) => {
  const id = Number(req.params.id)
  if (!validId(id)) return go(req, res, 'danger', 'ID de usuario inválido.')
  if (id === req.usuario.id) return go(req, res, 'warning', 'No puedes desactivar tu propia cuenta.')
  try {
    const [result] = await db.execute('UPDATE usuarios SET activo = NOT activo, token_version = token_version + 1 WHERE id = ? AND rol <> ?', [id, 'administrador'])
    if (!result.affectedRows) return go(req, res, 'warning', 'No se encontró al usuario o es administrador. Para modificar administradores utiliza la edición.')
    go(req, res, 'success', 'Estado de la cuenta modificado. Tokens anteriores revocados.')
  } catch (err) { next(err) }
}
exports.apiList = async (req, res, next) => {
  try {
    const [usuarios] = await db.execute('SELECT id, nombre, email, rol, activo FROM usuarios ORDER BY id')
    res.json({ usuarios })
  } catch (err) { next(err) }
}
