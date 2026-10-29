const db = require('../database/db')
const { setFlash } = require('../utils/flash')
const { normalizeExpediente, contactsToFields, ageLabel, todayMexico, validId, folio } = require('../models/expediente')

const selectMenor = `SELECT id, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, sexo, fecha_ingreso,
  alergias, restricciones_alimentarias, cuidados_especiales, observaciones, permanencia_verano,
  fecha_limite_permanencia, identificaciones_extra, registrado_por, actualizado_por, created_at, updated_at
  FROM menores WHERE id = ?`
const selectContactos = `SELECT id, tipo, nombre, parentesco, telefono, correo, puede_recoger, posicion,
  identificacion_entregada, fecha_entrega_identificacion
  FROM contactos_menor WHERE menor_id = ? ORDER BY FIELD(tipo, 'madre','padre','tutor','autorizado'), posicion`

async function buscarExpediente(id) {
  const [menores] = await db.execute(selectMenor, [id])
  if (!menores.length) return null
  const [contactos] = await db.execute(selectContactos, [id])
  const pendientes = contactos.filter(c => c.puede_recoger && !c.identificacion_entregada).length
  return {
    ...menores[0], contactos, folio: folio(id), edad: ageLabel(menores[0].fecha_nacimiento),
    credenciales_pendientes: pendientes,
    total_identificaciones_pendientes: pendientes + Number(menores[0].identificaciones_extra || 0)
  }
}

function valoresMenor(data) {
  return [data.nombres, data.apellido_paterno, data.apellido_materno || null,
    data.fecha_nacimiento, data.sexo, data.fecha_ingreso || null,
    data.alergias || null, data.restricciones_alimentarias || null,
    data.cuidados_especiales || null, data.observaciones || null,
    data.permanencia_verano ? 1 : 0, data.fecha_limite_permanencia || null, data.identificaciones_extra]
}

async function guardarContactos(conexion, menorId, contactos) {
  // Se actualizan por tipo y posición para no cambiar el ID de los contactos existentes.
  for (const c of contactos) {
    await conexion.execute(`INSERT INTO contactos_menor
      (menor_id, tipo, posicion, nombre, parentesco, telefono, correo, puede_recoger,
       identificacion_entregada, fecha_entrega_identificacion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, IF(?, CURDATE(), NULL))
      ON DUPLICATE KEY UPDATE
        fecha_entrega_identificacion = IF(nombre = VALUES(nombre) AND VALUES(identificacion_entregada) = 1,
          IF(identificacion_entregada = 1, fecha_entrega_identificacion, CURDATE()), NULL),
        identificacion_entregada = IF(nombre = VALUES(nombre), VALUES(identificacion_entregada), 0),
        nombre = VALUES(nombre), parentesco = VALUES(parentesco), telefono = VALUES(telefono),
        correo = VALUES(correo), puede_recoger = VALUES(puede_recoger)`,
    [menorId, c.tipo, c.posicion, c.nombre, c.parentesco, c.telefono, c.correo,
      c.puede_recoger ? 1 : 0, c.identificacion_entregada ? 1 : 0, c.identificacion_entregada ? 1 : 0])
  }
  const posiciones = new Set(contactos.map(c => `${c.tipo}-${c.posicion}`))
  const [actuales] = await conexion.execute('SELECT id, tipo, posicion FROM contactos_menor WHERE menor_id = ?', [menorId])
  for (const c of actuales) {
    if (!posiciones.has(`${c.tipo}-${c.posicion}`)) {
      await conexion.execute('DELETE FROM contactos_menor WHERE id = ? AND menor_id = ?', [c.id, menorId])
    }
  }
}

function mostrarFormulario(res, form, error, id = null) {
  return res.status(error ? 422 : 200).render('expediente-form', {
    titulo: id ? 'Editar expediente' : 'Nuevo expediente', editando: id ? { id } : null,
    form, today: todayMexico(), error
  })
}

exports.list = async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
    const escaped = q.replace(/[!%_]/g, char => '!' + char)
    const patron = `%${escaped}%`
    const where = q ? `WHERE nombres LIKE ? ESCAPE '!' OR apellido_paterno LIKE ? ESCAPE '!'
      OR apellido_materno LIKE ? ESCAPE '!' OR CAST(id AS CHAR) = ?` : ''
    const params = q ? [patron, patron, patron, q] : []
    const [filas] = await db.execute(`SELECT id, nombres, apellido_paterno, apellido_materno, fecha_nacimiento
      FROM menores ${where} ORDER BY id DESC LIMIT 200`, params)
    res.render('expedientes', {
      titulo: 'Expedientes', menores: filas.map(m => ({ ...m, folio: folio(m.id), edad: ageLabel(m.fecha_nacimiento) })),
      q, canWrite: req.usuario.rol === 'administrador'
    })
  } catch (err) { next(err) }
}

exports.newForm = (req, res) => mostrarFormulario(res, {}, null)

exports.create = async (req, res, next) => {
  const resultado = normalizeExpediente(req.body)
  if (resultado.error) return mostrarFormulario(res, req.body, resultado.error)
  let conexion
  try {
    conexion = await db.getConnection()
    await conexion.beginTransaction()
    const [creado] = await conexion.execute(`INSERT INTO menores
      (nombres, apellido_paterno, apellido_materno, fecha_nacimiento, sexo, fecha_ingreso,
       alergias, restricciones_alimentarias, cuidados_especiales, observaciones,
       permanencia_verano, fecha_limite_permanencia, identificaciones_extra, registrado_por, actualizado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...valoresMenor(resultado.data), req.usuario.id, req.usuario.id])
    await guardarContactos(conexion, creado.insertId, resultado.contactos)
    await conexion.commit()
    setFlash(req, 'success', `Expediente ${folio(creado.insertId)} registrado.`)
    res.redirect(`/expedientes/${creado.insertId}`)
  } catch (err) {
    if (conexion) { try { await conexion.rollback() } catch {} }
    next(err)
  } finally { if (conexion) conexion.release() }
}

exports.show = async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(404).render('404', { titulo: 'Página no encontrada' })
  try {
    const expediente = await buscarExpediente(Number(req.params.id))
    if (!expediente) return res.status(404).render('404', { titulo: 'Página no encontrada' })
    res.render('expediente-detalle', {
      titulo: expediente.folio, expediente, canWrite: req.usuario.rol === 'administrador'
    })
  } catch (err) { next(err) }
}

exports.editForm = async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(404).render('404', { titulo: 'Página no encontrada' })
  try {
    const expediente = await buscarExpediente(Number(req.params.id))
    if (!expediente) return res.status(404).render('404', { titulo: 'Página no encontrada' })
    mostrarFormulario(res, { ...expediente, ...contactsToFields(expediente.contactos) }, null, expediente.id)
  } catch (err) { next(err) }
}

exports.update = async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(404).render('404', { titulo: 'Página no encontrada' })
  const id = Number(req.params.id)
  const resultado = normalizeExpediente(req.body, todayMexico(), true)
  if (resultado.error) return mostrarFormulario(res, req.body, resultado.error, id)
  let conexion
  try {
    conexion = await db.getConnection()
    await conexion.beginTransaction()
    const [filas] = await conexion.execute('SELECT id FROM menores WHERE id = ? FOR UPDATE', [id])
    if (!filas.length) {
      await conexion.rollback()
      return res.status(404).render('404', { titulo: 'Página no encontrada' })
    }
    await conexion.execute(`UPDATE menores SET nombres = ?, apellido_paterno = ?, apellido_materno = ?,
      fecha_nacimiento = ?, sexo = ?, fecha_ingreso = ?, alergias = ?, restricciones_alimentarias = ?,
      cuidados_especiales = ?, observaciones = ?, permanencia_verano = ?, fecha_limite_permanencia = ?,
      identificaciones_extra = ?, actualizado_por = ? WHERE id = ?`,
    [...valoresMenor(resultado.data), req.usuario.id, id])
    await guardarContactos(conexion, id, resultado.contactos)
    await conexion.commit()
    setFlash(req, 'success', 'Expediente actualizado.')
    res.redirect(`/expedientes/${id}`)
  } catch (err) {
    if (conexion) { try { await conexion.rollback() } catch {} }
    next(err)
  } finally { if (conexion) conexion.release() }
}

exports.apiList = async (req, res, next) => {
  try {
    const [filas] = await db.execute('SELECT id, nombres, apellido_paterno, apellido_materno, fecha_nacimiento FROM menores ORDER BY id DESC LIMIT 200')
    res.json({ expedientes: filas.map(m => ({ ...m, folio: folio(m.id) })) })
  } catch (err) { next(err) }
}

exports.apiShow = async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'Expediente no encontrado.' })
  try {
    const expediente = await buscarExpediente(Number(req.params.id))
    if (!expediente) return res.status(404).json({ error: 'Expediente no encontrado.' })
    res.json({ expediente })
  } catch (err) { next(err) }
}
