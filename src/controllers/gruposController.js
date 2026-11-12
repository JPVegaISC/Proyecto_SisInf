const db = require('../database/db')
const { setFlash } = require('../utils/flash')
const { GRUPOS, grupoParaEdad, edadCorrespondeGrupo, validId } = require('../models/grupo')
const { folio, ageLabel, ageInMonths } = require('../models/expediente')

function notFound(res) { return res.status(404).render('404', { titulo: 'Página no encontrada' }) }
function forbidden(res) { return res.status(403).render('403', { titulo: 'Acceso restringido' }) }
function aviso(req, res, tipo, texto, destino = '/grupos') {
  setFlash(req, tipo, texto)
  res.redirect(destino)
}
async function buscarGrupo(id) {
  const [rows] = await db.execute(`SELECT g.id, g.nombre, g.edad_min_meses, g.edad_max_meses,
    g.encargado_id, g.activo, u.nombre AS encargado_nombre, u.activo AS encargado_activo,
    u.rol AS encargado_rol FROM grupos g
    LEFT JOIN usuarios u ON u.id = g.encargado_id WHERE g.id = ?`, [id])
  return rows[0]
}

exports.list = async (req, res, next) => {
  try {
    const esAdmin = req.usuario.rol === 'administrador'
    const params = esAdmin ? [] : [req.usuario.id]
    const [grupos] = await db.execute(`SELECT g.id, g.nombre, g.edad_min_meses, g.edad_max_meses, g.activo,
      u.nombre AS encargado_nombre, COUNT(a.menor_id) AS menores
      FROM grupos g LEFT JOIN usuarios u ON u.id = g.encargado_id
      LEFT JOIN asignaciones_grupo a ON a.grupo_id = g.id
      ${esAdmin ? 'WHERE g.activo = 1' : 'WHERE g.encargado_id = ? AND g.activo = 1'}
      GROUP BY g.id, g.nombre, g.edad_min_meses, g.edad_max_meses, u.nombre ORDER BY g.id`, params)
    res.render('grupos', { titulo: 'Grupos', grupos, esAdmin, rangos: GRUPOS })
  } catch (err) { next(err) }
}

exports.show = async (req, res, next) => {
  if (!validId(req.params.id)) return notFound(res)
  try {
    const grupo = await buscarGrupo(Number(req.params.id))
    if (!grupo) return notFound(res)
    const esAdmin = req.usuario.rol === 'administrador'
    if (!esAdmin && Number(grupo.encargado_id) !== Number(req.usuario.id)) return forbidden(res)
    const [menores] = await db.execute(`SELECT m.id, m.nombres, m.apellido_paterno, m.apellido_materno,
      m.fecha_nacimiento, m.permanencia_verano, m.fecha_limite_permanencia, m.estado,
      e.id AS entrada_id, e.hora AS hora_entrada, e.revision_fisica,
      e.leche, e.panales, e.ropa, e.cobija
      FROM asignaciones_grupo a JOIN menores m ON m.id = a.menor_id
      LEFT JOIN entradas e ON e.menor_id = m.id AND e.fecha = ?
      WHERE a.grupo_id = ? ORDER BY m.apellido_paterno, m.nombres`,
    [require('../models/expediente').todayMexico(), grupo.id])
    const [encargados] = esAdmin
      ? await db.execute("SELECT id, nombre FROM usuarios WHERE rol = 'encargado' AND activo = 1 ORDER BY nombre")
      : [[]]
    res.render('grupo-detalle', {
      titulo: grupo.nombre, grupo, esAdmin, encargados,
      menores: menores.map(m => ({ ...m, folio: folio(m.id), edad: ageLabel(m.fecha_nacimiento),
        grupoCorrecto: edadCorrespondeGrupo(m.fecha_nacimiento, grupo, undefined, Boolean(m.permanencia_verano), m.fecha_limite_permanencia) }))
    })
  } catch (err) { next(err) }
}

exports.asignarEncargado = async (req, res, next) => {
  const id = Number(req.params.id)
  if (!validId(req.params.id)) return notFound(res)
  const destino = `/grupos/${id}`
  const valor = typeof req.body.encargado_id === 'string' ? req.body.encargado_id.trim() : ''
  if (valor && !validId(valor)) return aviso(req, res, 'warning', 'Selecciona un encargado válido.', destino)
  try {
    const grupo = await buscarGrupo(id)
    if (!grupo || !grupo.activo) return notFound(res)
    if (valor) {
      const [usuarios] = await db.execute("SELECT id FROM usuarios WHERE id = ? AND rol = 'encargado' AND activo = 1", [Number(valor)])
      if (!usuarios.length) return aviso(req, res, 'warning', 'El usuario debe ser un encargado activo.', destino)
    }
    await db.execute('UPDATE grupos SET encargado_id = ? WHERE id = ?', [valor ? Number(valor) : null, id])
    aviso(req, res, 'success', valor ? 'Encargado asignado al grupo.' : 'El grupo quedó sin encargado.', destino)
  } catch (err) { next(err) }
}

async function buscarMenor(id) {
  const [rows] = await db.execute(`SELECT m.id, m.nombres, m.apellido_paterno, m.apellido_materno,
    m.fecha_nacimiento, m.permanencia_verano, m.fecha_limite_permanencia, m.estado,
    a.grupo_id AS grupo_actual FROM menores m
    LEFT JOIN asignaciones_grupo a ON a.menor_id = m.id WHERE m.id = ?`, [id])
  return rows[0]
}

exports.cambioForm = async (req, res, next) => {
  if (!validId(req.params.id)) return notFound(res)
  try {
    const menor = await buscarMenor(Number(req.params.id))
    if (!menor) return notFound(res)
    const grupoSugerido = grupoParaEdad(menor.fecha_nacimiento, undefined,
      Boolean(menor.permanencia_verano), menor.fecha_limite_permanencia)
    const [movimientos] = await db.execute(`SELECT mg.fecha, mg.motivo, ga.nombre AS anterior,
      gn.nombre AS nuevo, u.nombre AS administrador FROM movimientos_grupo mg
      LEFT JOIN grupos ga ON ga.id = mg.grupo_anterior
      JOIN grupos gn ON gn.id = mg.grupo_nuevo
      LEFT JOIN usuarios u ON u.id = mg.cambiado_por
      WHERE mg.menor_id = ? ORDER BY mg.id DESC LIMIT 30`, [menor.id])
    const [gruposDisponibles] = await db.execute('SELECT id, nombre, edad_min_meses, edad_max_meses, activo FROM grupos WHERE activo = 1 ORDER BY id')
    res.render('grupo-cambio', {
      titulo: 'Cambiar grupo', menor: { ...menor, folio: folio(menor.id), edad: ageLabel(menor.fecha_nacimiento) },
      grupos: gruposDisponibles, grupoSugerido, edadMeses: ageInMonths(menor.fecha_nacimiento), movimientos
    })
  } catch (err) { next(err) }
}

exports.cambiarGrupo = async (req, res, next) => {
  if (!validId(req.params.id)) return notFound(res)
  const id = Number(req.params.id)
  const destino = `/grupos/menores/${id}/cambiar`
  const nuevo = Number(req.body.grupo_id)
  const motivo = typeof req.body.motivo === 'string' ? req.body.motivo.trim() : ''
  if (!validId(String(req.body.grupo_id || ''))) return aviso(req, res, 'warning', 'Selecciona un grupo válido.', destino)
  if (motivo.length < 5 || motivo.length > 255) return aviso(req, res, 'warning', 'Explica el motivo del movimiento (5 a 255 caracteres).', destino)
  let conexion
  try {
    conexion = await db.getConnection()
    await conexion.beginTransaction()
    const [filas] = await conexion.execute(`SELECT id, fecha_nacimiento, permanencia_verano, fecha_limite_permanencia, estado
      FROM menores WHERE id = ? FOR UPDATE`, [id])
    if (!filas.length) { await conexion.rollback(); return notFound(res) }
    const menor = filas[0]
    if (menor.estado !== 'activo') { await conexion.rollback(); return aviso(req, res, 'warning', 'El expediente dado de baja está bloqueado.', destino) }
    const [[grupoDestino]] = await conexion.execute('SELECT id, edad_min_meses, edad_max_meses, activo FROM grupos WHERE id = ?', [nuevo])
    if (!edadCorrespondeGrupo(menor.fecha_nacimiento, grupoDestino, undefined,
      Boolean(menor.permanencia_verano), menor.fecha_limite_permanencia)) {
      await conexion.rollback()
      return aviso(req, res, 'warning', 'La edad del menor no corresponde al grupo elegido. Revisa su expediente.', destino)
    }
    const [anteriores] = await conexion.execute('SELECT grupo_id FROM asignaciones_grupo WHERE menor_id = ? FOR UPDATE', [id])
    const anterior = anteriores.length ? anteriores[0].grupo_id : null
    if (anterior === nuevo) {
      await conexion.rollback()
      return aviso(req, res, 'warning', 'El menor ya pertenece a ese grupo.', destino)
    }
    if (anterior === null) {
      await conexion.execute('INSERT INTO asignaciones_grupo (menor_id, grupo_id, asignado_por) VALUES (?, ?, ?)', [id, nuevo, req.usuario.id])
    } else {
      await conexion.execute('UPDATE asignaciones_grupo SET grupo_id = ?, asignado_por = ? WHERE menor_id = ?', [nuevo, req.usuario.id, id])
    }
    await conexion.execute(`INSERT INTO movimientos_grupo
      (menor_id, grupo_anterior, grupo_nuevo, cambiado_por, motivo) VALUES (?, ?, ?, ?, ?)`,
    [id, anterior, nuevo, req.usuario.id, motivo])
    await conexion.commit()
    aviso(req, res, 'success', 'Cambio de grupo guardado con fecha y responsable.', `/grupos/${nuevo}`)
  } catch (err) {
    if (conexion) { try { await conexion.rollback() } catch {} }
    next(err)
  } finally { if (conexion) conexion.release() }
}

exports.crearGrupo = async (req, res, next) => {
  const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : ''
  const rango = GRUPOS.find(g => g.id === Number(req.body.rango_id))
  if (nombre.length < 3 || nombre.length > 80 || !rango) return aviso(req, res, 'warning', 'Escribe un nombre de 3 a 80 caracteres y elige un rango de edad.')
  let conexion
  try {
    conexion = await db.getConnection()
    await conexion.beginTransaction()
    const [repetidos] = await conexion.execute('SELECT id FROM grupos WHERE nombre = ? AND activo = 1', [nombre])
    if (repetidos.length) { await conexion.rollback(); return aviso(req, res, 'warning', 'Ya existe un grupo activo con ese nombre.') }
    const [[ultimo]] = await conexion.execute('SELECT id FROM grupos ORDER BY id DESC LIMIT 1 FOR UPDATE')
    const id = Number(ultimo?.id || 0) + 1
    if (id > 255) { await conexion.rollback(); return aviso(req, res, 'warning', 'Se alcanzó el límite de grupos disponibles.') }
    await conexion.execute(`INSERT INTO grupos (id, nombre, edad_min_meses, edad_max_meses, activo)
      VALUES (?, ?, ?, ?, 1)`, [id, nombre, rango.min, rango.max])
    await conexion.commit()
    return aviso(req, res, 'success', 'Grupo creado. Ya puedes asignarle encargado y menores.', `/grupos/${id}`)
  } catch (error) {
    if (conexion) await conexion.rollback().catch(() => {})
    if (error.code === 'ER_DUP_ENTRY') return aviso(req, res, 'warning', 'No se pudo crear el grupo; intenta de nuevo.')
    next(error)
  } finally { if (conexion) conexion.release() }
}

exports.desactivarGrupo = async (req, res, next) => {
  if (!validId(req.params.id)) return notFound(res)
  const id = Number(req.params.id)
  if (id <= 4) return aviso(req, res, 'warning', 'Los cuatro grupos principales no se pueden desactivar.', `/grupos/${id}`)
  try {
    const [[grupo]] = await db.execute('SELECT id, activo FROM grupos WHERE id = ?', [id])
    if (!grupo || !grupo.activo) return notFound(res)
    const [[total]] = await db.execute('SELECT COUNT(*) AS cantidad FROM asignaciones_grupo WHERE grupo_id = ?', [id])
    if (Number(total.cantidad) > 0) return aviso(req, res, 'warning', 'Mueve a los menores de este grupo antes de desactivarlo.', `/grupos/${id}`)
    await db.execute('UPDATE grupos SET activo = 0, encargado_id = NULL WHERE id = ?', [id])
    return aviso(req, res, 'success', 'Grupo desactivado. Se conserva su historial.')
  } catch (error) { next(error) }
}
