const db = require('../database/db')
const { setFlash } = require('../utils/flash')
const { folio, ageLabel, ageInMonths } = require('../models/expediente')
const { fechaHoraMexico, validId } = require('../models/grupo')
const { validarCuidado, avisosEdad } = require('../models/cuidados')

function notFound(res) { return res.status(404).render('404', { titulo: 'Página no encontrada' }) }
function forbidden(res) { return res.status(403).render('403', { titulo: 'Acceso restringido' }) }
function avisar(req, res, tipo, mensaje, destino) {
  setFlash(req, tipo, mensaje)
  return res.redirect(destino)
}
function puedeAtender(usuario, menor) {
  return usuario.rol === 'administrador' ||
    (Number(menor.encargado_id) === Number(usuario.id) && menor.encargado_id !== null)
}
async function buscarMenor(id) {
  const [[menor]] = await db.execute(`SELECT m.id, m.nombres, m.apellido_paterno, m.apellido_materno,
    m.fecha_nacimiento, m.fecha_ingreso, m.alergias, m.restricciones_alimentarias,
    m.cuidados_especiales, m.estado, g.nombre AS grupo_nombre, g.encargado_id,
    g.id AS grupo_id
    FROM menores m LEFT JOIN asignaciones_grupo a ON a.menor_id = m.id
    LEFT JOIN grupos g ON g.id = a.grupo_id WHERE m.id = ?`, [id])
  return menor
}

exports.list = async (req, res, next) => {
  try {
    const hoy = fechaHoraMexico().fecha
    const admin = req.usuario.rol === 'administrador'
    const [menores] = await db.execute(`SELECT m.id, m.nombres, m.apellido_paterno,
      m.apellido_materno, g.nombre AS grupo_nombre, e.id AS entrada_id,
      COUNT(c.id) AS cantidad_registros
      FROM menores m JOIN asignaciones_grupo a ON a.menor_id = m.id
      JOIN grupos g ON g.id = a.grupo_id
      LEFT JOIN entradas e ON e.menor_id = m.id AND e.fecha = ?
      LEFT JOIN cuidados_diarios c ON c.menor_id = m.id AND c.fecha = ?
      ${admin ? "WHERE m.estado = 'activo'" : "WHERE g.encargado_id = ? AND m.estado = 'activo'"}
      GROUP BY m.id, m.nombres, m.apellido_paterno, m.apellido_materno,
        g.nombre, e.id ORDER BY g.id, m.apellido_paterno, m.nombres`,
    admin ? [hoy, hoy] : [hoy, hoy, req.usuario.id])
    const [[alertas]] = await db.execute('SELECT COUNT(*) AS total FROM insumos WHERE cantidad <= minimo')
    res.render('cuidados', { titulo: 'Cuidados diarios', fecha: hoy,
      menores: menores.map(m => ({ ...m, folio: folio(m.id) })),
      alertas: Number(alertas.total), admin })
  } catch (err) { next(err) }
}

exports.show = async (req, res, next) => {
  if (!validId(req.params.id)) return notFound(res)
  try {
    const menor = await buscarMenor(Number(req.params.id))
    if (!menor) return notFound(res)
    if (!puedeAtender(req.usuario, menor)) return forbidden(res)
    const ahora = fechaHoraMexico()
    const [[entrada]] = await db.execute('SELECT id, hora FROM entradas WHERE menor_id = ? AND fecha = ?', [menor.id, ahora.fecha])
    const [registros] = await db.execute(`SELECT c.id, c.fecha, c.hora, c.tipo, c.descripcion,
      c.observaciones, u.nombre AS registrado_nombre
      FROM cuidados_diarios c LEFT JOIN usuarios u ON u.id = c.registrado_por
      WHERE c.menor_id = ? ORDER BY c.fecha DESC, c.hora DESC, c.id DESC LIMIT 150`, [menor.id])
    res.render('cuidado-detalle', { titulo: 'Bitácora del menor',
      menor: { ...menor, folio: folio(menor.id), edad: ageLabel(menor.fecha_nacimiento) },
      fecha: ahora.fecha, hora: ahora.hora, entrada: entrada || null, registros,
      avisosEdad: avisosEdad(ageInMonths(menor.fecha_nacimiento, ahora.fecha)) })
  } catch (err) { next(err) }
}

exports.registrar = async (req, res, next) => {
  if (!validId(req.params.id)) return notFound(res)
  const id = Number(req.params.id)
  const destino = `/cuidados/${id}`
  const resultado = validarCuidado(req.body)
  if (resultado.error) return avisar(req, res, 'warning', resultado.error, destino)
  let conexion
  try {
    conexion = await db.getConnection()
    await conexion.beginTransaction()
    // Comprobar la asignación al guardar, no solo al abrir el formulario.
    const [[menor]] = await conexion.execute(`SELECT m.id, m.estado, g.encargado_id
      FROM menores m LEFT JOIN asignaciones_grupo a ON a.menor_id = m.id
      LEFT JOIN grupos g ON g.id = a.grupo_id WHERE m.id = ? FOR UPDATE`, [id])
    if (!menor) { await conexion.rollback(); return notFound(res) }
    if (!puedeAtender(req.usuario, menor)) { await conexion.rollback(); return forbidden(res) }
    if (menor.estado !== 'activo') { await conexion.rollback(); return avisar(req, res, 'warning', 'El expediente dado de baja no admite registros nuevos.', destino) }
    const ahora = fechaHoraMexico()
    const [[entrada]] = await conexion.execute(
      'SELECT id FROM entradas WHERE menor_id = ? AND fecha = ? FOR UPDATE', [id, ahora.fecha])
    const d = resultado.data
    await conexion.execute(`INSERT INTO cuidados_diarios
      (menor_id, entrada_id, fecha, hora, tipo, descripcion, observaciones, registrado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, entrada ? entrada.id : null, ahora.fecha, ahora.hora, d.tipo, d.descripcion, d.observaciones || null, req.usuario.id])
    await conexion.commit()
    return avisar(req, res, 'success', 'Registro guardado en la bitácora.', destino)
  } catch (err) {
    if (conexion) { try { await conexion.rollback() } catch {} }
    next(err)
  } finally { if (conexion) conexion.release() }
}
