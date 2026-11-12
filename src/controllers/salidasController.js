const db = require('../database/db')
const { fechaHoraMexico, validId } = require('../models/grupo')
const { folio, ageLabel } = require('../models/expediente')
const { enHorarioSalida, esRetraso, validarContacto, validarObservaciones } = require('../models/salida')
const { setFlash } = require('../utils/flash')

function fallo(req, res, mensaje, destino = '/salidas') {
  setFlash(req, 'warning', mensaje)
  return res.redirect(destino)
}
function exito(req, res, mensaje, destino = '/salidas') {
  setFlash(req, 'success', mensaje)
  return res.redirect(destino)
}
function noEncontrado(res) { return res.status(404).render('404', { titulo: 'Página no encontrada' }) }

exports.list = async (req, res, next) => {
  try {
    const hoy = fechaHoraMexico()
    const [menores] = await db.execute(`SELECT m.id, m.nombres, m.apellido_paterno, m.apellido_materno,
      m.fecha_nacimiento, g.nombre AS grupo, e.id AS entrada_id, s.id AS salida_id, s.hora AS hora_salida,
      s.retraso, a.nombre_avisado
      FROM menores m JOIN asignaciones_grupo ag ON ag.menor_id = m.id
      JOIN grupos g ON g.id = ag.grupo_id
      LEFT JOIN entradas e ON e.menor_id = m.id AND e.fecha = ?
      LEFT JOIN salidas s ON s.menor_id = m.id AND s.fecha = ?
      LEFT JOIN avisos_recogida a ON a.menor_id = m.id AND a.fecha = ?
      WHERE m.estado = 'activo' ORDER BY g.id, m.apellido_paterno, m.nombres`,
    [hoy.fecha, hoy.fecha, hoy.fecha])
    const [recientes] = await db.execute(`SELECT s.fecha, s.hora, s.nombre_recoge, s.retraso,
      m.id AS menor_id, m.nombres, m.apellido_paterno FROM salidas s JOIN menores m ON m.id = s.menor_id
      ORDER BY s.id DESC LIMIT 30`)
    res.render('salidas', { titulo: 'Salidas', fecha: hoy.fecha, hora: hoy.hora,
      menores: menores.map(m => ({ ...m, folio: folio(m.id), edad: ageLabel(m.fecha_nacimiento) })), recientes })
  } catch (error) { next(error) }
}

exports.form = async (req, res, next) => {
  if (!validId(req.params.id)) return noEncontrado(res)
  try {
    const id = Number(req.params.id)
    const [[menor]] = await db.execute(`SELECT m.id, m.nombres, m.apellido_paterno, m.apellido_materno,
      m.fecha_nacimiento, m.estado, g.nombre AS grupo FROM menores m
      LEFT JOIN asignaciones_grupo ag ON ag.menor_id = m.id
      LEFT JOIN grupos g ON g.id = ag.grupo_id WHERE m.id = ?`, [id])
    if (!menor) return noEncontrado(res)
    const hoy = fechaHoraMexico()
    const [[entrada]] = await db.execute('SELECT id, hora FROM entradas WHERE menor_id = ? AND fecha = ?', [id, hoy.fecha])
    const [[aviso]] = await db.execute('SELECT id, contacto_id, nombre_avisado FROM avisos_recogida WHERE menor_id = ? AND fecha = ?', [id, hoy.fecha])
    const [[salida]] = await db.execute('SELECT id, fecha, hora, nombre_recoge, retraso, observaciones FROM salidas WHERE menor_id = ? AND fecha = ?', [id, hoy.fecha])
    const [contactos] = await db.execute(`SELECT id, nombre, parentesco, identificacion_entregada
      FROM contactos_menor WHERE menor_id = ? AND puede_recoger = 1 ORDER BY FIELD(tipo,'madre','padre','tutor','autorizado'), posicion`, [id])
    const [[totales]] = await db.execute('SELECT COUNT(*) AS retrasos FROM salidas WHERE menor_id = ? AND retraso = 1', [id])
    const [historial] = await db.execute(`SELECT s.fecha, s.hora, s.nombre_recoge, s.retraso, s.observaciones,
      u.nombre AS responsable FROM salidas s LEFT JOIN usuarios u ON u.id = s.registrado_por
      WHERE s.menor_id = ? ORDER BY s.id DESC LIMIT 30`, [id])
    res.render('salida-form', { titulo: 'Salida del menor', fecha: hoy.fecha, hora: hoy.hora,
      menor: { ...menor, folio: folio(id), edad: ageLabel(menor.fecha_nacimiento) },
      entrada, aviso, salida, contactos, retrasos: Number(totales.retrasos), historial,
      horarioPermitido: enHorarioSalida(hoy.hora), retrasoAhora: esRetraso(hoy.hora) })
  } catch (error) { next(error) }
}

exports.avisar = async (req, res, next) => {
  if (!validId(req.params.id)) return noEncontrado(res)
  const id = Number(req.params.id)
  const destino = `/salidas/${id}`
  if (!validarContacto(req.body.contacto_id)) return fallo(req, res, 'Selecciona una persona autorizada.', destino)
  let conexion
  try {
    conexion = await db.getConnection()
    await conexion.beginTransaction()
    const [[menor]] = await conexion.execute('SELECT id, estado FROM menores WHERE id = ? FOR UPDATE', [id])
    if (!menor) { await conexion.rollback(); return noEncontrado(res) }
    if (menor.estado !== 'activo') { await conexion.rollback(); return fallo(req, res, 'No puedes cambiar avisos de menores dados de baja.', destino) }
    const hoy = fechaHoraMexico()
    const [[salida]] = await conexion.execute('SELECT id FROM salidas WHERE menor_id = ? AND fecha = ?', [id, hoy.fecha])
    if (salida) { await conexion.rollback(); return fallo(req, res, 'La salida de hoy ya está registrada.', destino) }
    const [[contacto]] = await conexion.execute(`SELECT id, nombre FROM contactos_menor
      WHERE id = ? AND menor_id = ? AND puede_recoger = 1`, [Number(req.body.contacto_id), id])
    if (!contacto) { await conexion.rollback(); return fallo(req, res, 'La persona seleccionada no está autorizada para recoger a este menor.', destino) }
    await conexion.execute(`INSERT INTO avisos_recogida (menor_id, fecha, contacto_id, nombre_avisado, registrado_por)
      VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE contacto_id = VALUES(contacto_id),
      nombre_avisado = VALUES(nombre_avisado), registrado_por = VALUES(registrado_por)`,
    [id, hoy.fecha, contacto.id, contacto.nombre, req.usuario.id])
    await conexion.commit()
    return exito(req, res, 'Persona avisada para la recogida de hoy.', destino)
  } catch (error) { if (conexion) await conexion.rollback().catch(() => {}); next(error) }
  finally { if (conexion) conexion.release() }
}

exports.registrar = async (req, res, next) => {
  if (!validId(req.params.id)) return noEncontrado(res)
  const id = Number(req.params.id)
  const destino = `/salidas/${id}`
  if (!validarContacto(req.body.contacto_id)) return fallo(req, res, 'Selecciona quién recogió al menor.', destino)
  if (!validarObservaciones(req.body.observaciones || '')) return fallo(req, res, 'Las observaciones no pueden superar 500 caracteres.', destino)
  const horaActual = fechaHoraMexico()
  if (!enHorarioSalida(horaActual.hora)) return fallo(req, res, 'La salida se registra desde las 15:00 h. Después de las 16:00 h se genera un reporte por retraso.', destino)
  let conexion
  try {
    conexion = await db.getConnection()
    await conexion.beginTransaction()
    const [[menor]] = await conexion.execute('SELECT id, estado FROM menores WHERE id = ? FOR UPDATE', [id])
    if (!menor) { await conexion.rollback(); return noEncontrado(res) }
    if (menor.estado !== 'activo') { await conexion.rollback(); return fallo(req, res, 'El expediente está dado de baja.', destino) }
    const ahora = fechaHoraMexico()
    if (!enHorarioSalida(ahora.hora)) { await conexion.rollback(); return fallo(req, res, 'Aún no es horario de salida.', destino) }
    const [[entrada]] = await conexion.execute('SELECT id FROM entradas WHERE menor_id = ? AND fecha = ?', [id, ahora.fecha])
    if (!entrada) { await conexion.rollback(); return fallo(req, res, 'Primero registra la entrada del menor de hoy.', destino) }
    const [[anuncio]] = await conexion.execute('SELECT contacto_id FROM avisos_recogida WHERE menor_id = ? AND fecha = ? FOR UPDATE', [id, ahora.fecha])
    if (!anuncio || Number(anuncio.contacto_id) !== Number(req.body.contacto_id)) {
      await conexion.rollback()
      return fallo(req, res, 'La persona que recoge debe coincidir con la avisada previamente.', destino)
    }
    const [[contacto]] = await conexion.execute(`SELECT id, nombre FROM contactos_menor
      WHERE id = ? AND menor_id = ? AND puede_recoger = 1`, [Number(req.body.contacto_id), id])
    if (!contacto) { await conexion.rollback(); return fallo(req, res, 'La persona ya no está autorizada en el expediente.', destino) }
    const retraso = esRetraso(ahora.hora) ? 1 : 0
    await conexion.execute(`INSERT INTO salidas
      (menor_id, fecha, hora, contacto_id, nombre_recoge, retraso, observaciones, registrado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, ahora.fecha, ahora.hora, contacto.id, contacto.nombre, retraso, String(req.body.observaciones || '').trim() || null, req.usuario.id])
    const [[totales]] = await conexion.execute('SELECT COUNT(*) AS total FROM salidas WHERE menor_id = ? AND retraso = 1', [id])
    await conexion.commit()
    const cantidad = Number(totales.total)
    const mensaje = retraso
      ? `Salida registrada con retraso. Total de reportes: ${cantidad}.${cantidad >= 3 ? ' Aviso a administración: se alcanzaron tres reportes.' : ''}`
      : 'Salida registrada correctamente con persona autorizada y avisada.'
    return exito(req, res, mensaje, destino)
  } catch (error) {
    if (conexion) await conexion.rollback().catch(() => {})
    if (error.code === 'ER_DUP_ENTRY') return fallo(req, res, 'Ya se registró la salida de hoy.', destino)
    next(error)
  } finally { if (conexion) conexion.release() }
}
