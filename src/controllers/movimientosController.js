const db = require('../database/db')
const { setFlash } = require('../utils/flash')
const { validId, ageInMonths, todayMexico } = require('../models/expediente')
const { grupoParaEdad, fechaHoraMexico } = require('../models/grupo')

function notFound(res) { return res.status(404).render('404', { titulo: 'Página no encontrada' }) }
function avisar(req, res, tipo, mensaje, destino) { setFlash(req, tipo, mensaje); return res.redirect(destino) }

exports.cambiarEstado = async (req, res, next) => {
  if (!validId(req.params.id)) return notFound(res)
  const id = Number(req.params.id)
  const destino = `/expedientes/${id}`
  const accion = req.body.accion
  const motivo = typeof req.body.motivo === 'string' ? req.body.motivo.trim() : ''
  if (!['baja', 'reinscripcion'].includes(accion)) return avisar(req, res, 'warning', 'Movimiento no válido.', destino)
  if (motivo.length < 5 || motivo.length > 500) return avisar(req, res, 'warning', 'Escribe un motivo de 5 a 500 caracteres.', destino)
  let conexion
  try {
    conexion = await db.getConnection()
    await conexion.beginTransaction()
    const [[menor]] = await conexion.execute(`SELECT id, estado, fecha_nacimiento, permanencia_verano,
      fecha_limite_permanencia FROM menores WHERE id = ? FOR UPDATE`, [id])
    if (!menor) { await conexion.rollback(); return notFound(res) }
    if (accion === 'baja' && menor.estado !== 'activo') { await conexion.rollback(); return avisar(req, res, 'warning', 'El menor ya está dado de baja.', destino) }
    if (accion === 'reinscripcion') {
      if (menor.estado !== 'baja') { await conexion.rollback(); return avisar(req, res, 'warning', 'El expediente ya está activo.', destino) }
      const edad = ageInMonths(menor.fecha_nacimiento, todayMexico())
      if (edad === null || edad < 1 || edad >= 48) { await conexion.rollback(); return avisar(req, res, 'warning', 'Para reinscribir, el menor debe tener entre un mes y menos de cuatro años.', destino) }
      const grupo = grupoParaEdad(menor.fecha_nacimiento)
      const [[asignacion]] = await conexion.execute('SELECT grupo_id FROM asignaciones_grupo WHERE menor_id = ? FOR UPDATE', [id])
      if (!asignacion && grupo) {
        await conexion.execute('INSERT INTO asignaciones_grupo (menor_id, grupo_id, asignado_por) VALUES (?, ?, ?)', [id, grupo, req.usuario.id])
        await conexion.execute(`INSERT INTO movimientos_grupo
          (menor_id, grupo_anterior, grupo_nuevo, cambiado_por, motivo) VALUES (?, NULL, ?, ?, ?)`,
        [id, grupo, req.usuario.id, 'Asignación por reinscripción'])
      }
    }
    const ahora = fechaHoraMexico()
    const fechaMovimiento = `${ahora.fecha} ${ahora.hora}`
    await conexion.execute('UPDATE menores SET estado = ?, fecha_baja = ? WHERE id = ?',
      [accion === 'baja' ? 'baja' : 'activo', accion === 'baja' ? fechaMovimiento : null, id])
    await conexion.execute(`INSERT INTO movimientos_menor (menor_id, tipo, motivo, fecha, registrado_por)
      VALUES (?, ?, ?, ?, ?)`, [id, accion, motivo, fechaMovimiento, req.usuario.id])
    await conexion.commit()
    return avisar(req, res, 'success', accion === 'baja' ? 'Menor dado de baja; su expediente e historial se conservaron.' : 'Menor reinscrito; conserva su historial anterior.', destino)
  } catch (error) { if (conexion) await conexion.rollback().catch(() => {}); next(error) }
  finally { if (conexion) conexion.release() }
}
