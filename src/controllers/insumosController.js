const db = require('../database/db')
const { setFlash } = require('../utils/flash')
const { validId } = require('../models/expediente')
const { validarInsumo } = require('../models/cuidados')

function avisar(req, res, tipo, mensaje) {
  setFlash(req, tipo, mensaje)
  return res.redirect('/insumos')
}

exports.list = async (req, res, next) => {
  try {
    const [insumos] = await db.execute(`SELECT i.id, i.nombre, i.unidad, i.cantidad, i.minimo,
      i.updated_at, u.nombre AS actualizado_nombre
      FROM insumos i LEFT JOIN usuarios u ON u.id = i.actualizado_por
      ORDER BY (i.cantidad <= i.minimo) DESC, i.nombre`)
    const alertas = insumos.filter(i => Number(i.cantidad) <= Number(i.minimo)).length
    res.render('insumos', { titulo: 'Control de insumos', insumos, alertas,
      admin: req.usuario.rol === 'administrador' })
  } catch (err) { next(err) }
}

exports.crear = async (req, res, next) => {
  const resultado = validarInsumo(req.body)
  if (resultado.error) return avisar(req, res, 'warning', resultado.error)
  try {
    const d = resultado.data
    await db.execute('INSERT INTO insumos (nombre, unidad, cantidad, minimo, actualizado_por) VALUES (?, ?, ?, ?, ?)',
      [d.nombre, d.unidad, d.cantidad, d.minimo, req.usuario.id])
    return avisar(req, res, 'success', 'Insumo registrado.')
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return avisar(req, res, 'warning', 'Ya existe un insumo con ese nombre.')
    next(err)
  }
}

exports.actualizar = async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(404).render('404', { titulo: 'Página no encontrada' })
  const resultado = validarInsumo(req.body)
  if (resultado.error) return avisar(req, res, 'warning', resultado.error)
  try {
    const d = resultado.data
    const [respuesta] = await db.execute(`UPDATE insumos SET nombre = ?, unidad = ?, cantidad = ?,
      minimo = ?, actualizado_por = ? WHERE id = ?`,
    [d.nombre, d.unidad, d.cantidad, d.minimo, req.usuario.id, Number(req.params.id)])
    if (!respuesta.affectedRows) return res.status(404).render('404', { titulo: 'Página no encontrada' })
    return avisar(req, res, 'success', 'Existencia y cantidad mínima actualizadas.')
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return avisar(req, res, 'warning', 'Ya existe un insumo con ese nombre.')
    next(err)
  }
}
