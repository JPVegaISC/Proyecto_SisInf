const db = require('../database/db')
const { setFlash } = require('../utils/flash')
const { folio, ageLabel } = require('../models/expediente')
const { fechaHoraMexico, enHorarioRecepcion, validarRecepcion, edadCorrespondeGrupo, validarHorario, validId, ARTICULOS } = require('../models/grupo')

function notFound(res) { return res.status(404).render('404', { titulo: 'Página no encontrada' }) }
function forbidden(res) { return res.status(403).render('403', { titulo: 'Acceso restringido' }) }
function aviso(req, res, tipo, mensaje, destino = '/recepcion') {
  setFlash(req, tipo, mensaje)
  res.redirect(destino)
}
async function buscarMenor(id) {
  const [filas] = await db.execute(`SELECT m.id, m.nombres, m.apellido_paterno, m.apellido_materno,
    m.fecha_nacimiento, m.fecha_ingreso, m.permanencia_verano, m.fecha_limite_permanencia,
    m.alergias, m.cuidados_especiales, m.estado, g.id AS grupo_id, g.nombre AS grupo_nombre, g.encargado_id,
    g.edad_min_meses, g.edad_max_meses, g.activo
    FROM menores m LEFT JOIN asignaciones_grupo ag ON ag.menor_id = m.id
    LEFT JOIN grupos g ON g.id = ag.grupo_id WHERE m.id = ?`, [id])
  return filas[0]
}
async function leerHorario() {
  const [[horario]] = await db.execute('SELECT inicio, fin FROM horario_recepcion WHERE id = 1')
  return horario || { inicio: '08:00:00', fin: '09:00:00' }
}
function puedeAtender(usuario, menor) {
  return usuario.rol === 'administrador' || (menor.grupo_id && Number(menor.encargado_id) === Number(usuario.id))
}

exports.list = async (req, res, next) => {
  try {
    const ahora = fechaHoraMexico()
    const admin = req.usuario.rol === 'administrador'
    const horario = await leerHorario()
    const fechaConsulta = admin && /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha || '')
      ? req.query.fecha : ahora.fecha
    const [menores] = await db.execute(`SELECT m.id, m.nombres, m.apellido_paterno, m.apellido_materno,
      m.fecha_nacimiento, g.id AS grupo_id, g.nombre AS grupo_nombre, e.id AS entrada_id,
      e.hora, e.revision_fisica, e.leche, e.panales, e.ropa, e.cobija
      FROM asignaciones_grupo ag JOIN menores m ON m.id = ag.menor_id
      JOIN grupos g ON g.id = ag.grupo_id
      LEFT JOIN entradas e ON e.menor_id = m.id AND e.fecha = ?
      ${admin ? "WHERE m.estado = 'activo'" : "WHERE g.encargado_id = ? AND m.estado = 'activo'"}
      ORDER BY g.id, m.apellido_paterno, m.nombres`, admin ? [fechaConsulta] : [fechaConsulta, req.usuario.id])
    const [entradas] = await db.execute(`SELECT e.fecha, e.hora, e.revision_fisica, m.id AS menor_id,
      m.nombres, m.apellido_paterno, g.nombre AS grupo_nombre FROM entradas e
      JOIN menores m ON m.id = e.menor_id JOIN grupos g ON g.id = e.grupo_id
      ${admin ? 'WHERE e.fecha = ?' : 'WHERE e.fecha = ? AND g.encargado_id = ?'}
      ORDER BY e.hora DESC`, admin ? [fechaConsulta] : [fechaConsulta, req.usuario.id])
    res.render('recepcion', {
      titulo: 'Recepción', fecha: fechaConsulta, hoy: ahora.fecha, hora: ahora.hora, horario,
      horarioAbierto: enHorarioRecepcion(ahora.hora, horario.inicio, horario.fin), admin, entradas,
      menores: menores.map(m => ({ ...m, folio: folio(m.id), edad: ageLabel(m.fecha_nacimiento) }))
    })
  } catch (err) { next(err) }
}

exports.form = async (req, res, next) => {
  if (!validId(req.params.id)) return notFound(res)
  try {
    const menor = await buscarMenor(Number(req.params.id))
    if (!menor) return notFound(res)
    if (!puedeAtender(req.usuario, menor)) return forbidden(res)
    const ahora = fechaHoraMexico()
    const horario = await leerHorario()
    let [historial] = await db.execute(`SELECT fecha, hora, revision_fisica, observaciones_fisicas,
      leche, panales, ropa, cobija, otros_articulos, notas_articulos
      FROM entradas WHERE menor_id = ? ORDER BY fecha DESC LIMIT 15`, [menor.id])
    const fechaConsultada = req.usuario.rol === 'administrador' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha || '')
      ? req.query.fecha : null
    if (fechaConsultada && !historial.some(e => e.fecha === fechaConsultada)) {
      const [extras] = await db.execute(`SELECT fecha, hora, revision_fisica, observaciones_fisicas,
        leche, panales, ropa, cobija, otros_articulos, notas_articulos
        FROM entradas WHERE menor_id = ? AND fecha = ?`, [menor.id, fechaConsultada])
      historial = [...extras, ...historial]
    }
    res.render('recepcion-form', {
      titulo: 'Entrada del menor', menor: { ...menor, folio: folio(menor.id), edad: ageLabel(menor.fecha_nacimiento) },
      fecha: ahora.fecha, hora: ahora.hora, horarioAbierto: enHorarioRecepcion(ahora.hora, horario.inicio, horario.fin), horario,
      hoyRegistrado: historial.some(e => e.fecha === ahora.fecha),
      grupoCorrecto: edadCorrespondeGrupo(menor.fecha_nacimiento, menor, ahora.fecha,
        Boolean(menor.permanencia_verano), menor.fecha_limite_permanencia),
      historial, articulos: ARTICULOS
    })
  } catch (err) { next(err) }
}

exports.registrar = async (req, res, next) => {
  if (!validId(req.params.id)) return notFound(res)
  const id = Number(req.params.id)
  const destino = `/recepcion/${id}`
  const ahora = fechaHoraMexico()
  const resultado = validarRecepcion(req.body)
  if (resultado.error) return aviso(req, res, 'warning', resultado.error, destino)
  try {
    const menor = await buscarMenor(id)
    if (!menor) return notFound(res)
    if (!puedeAtender(req.usuario, menor)) return forbidden(res)
    if (menor.estado !== 'activo') return aviso(req, res, 'warning', 'El expediente está dado de baja y no admite entradas nuevas.', destino)
    const horario = await leerHorario()
    if (!enHorarioRecepcion(ahora.hora, horario.inicio, horario.fin)) {
      return aviso(req, res, 'warning', `El horario permitido es ${horario.inicio.slice(0,5)} a ${horario.fin.slice(0,5)} h.`, destino)
    }
    if (!menor.grupo_id) return aviso(req, res, 'warning', 'Administración debe asignar un grupo antes del ingreso.', destino)
    if (!edadCorrespondeGrupo(menor.fecha_nacimiento, menor, ahora.fecha,
      Boolean(menor.permanencia_verano), menor.fecha_limite_permanencia)) {
      return aviso(req, res, 'warning', 'El grupo no corresponde a la edad vigente. Administración debe revisar la asignación.', destino)
    }
    if (menor.fecha_ingreso && menor.fecha_ingreso > ahora.fecha) {
      return aviso(req, res, 'warning', 'La fecha de ingreso del menor todavía no ha llegado.', destino)
    }
    const d = resultado.data
    await db.execute(`INSERT INTO entradas
      (menor_id, grupo_id, fecha, hora, revision_fisica, observaciones_fisicas,
       leche, panales, ropa, cobija, otros_articulos, notas_articulos, registrado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, menor.grupo_id, ahora.fecha, ahora.hora,
      d.revision_fisica, d.observaciones_fisicas || null, d.leche, d.panales, d.ropa, d.cobija,
      d.otros_articulos || null, d.notas_articulos || null, req.usuario.id])
    const faltantes = resultado.faltantes.map(a => a === 'panales' ? 'pañales' : a)
    const mensaje = faltantes.length
      ? `Entrada registrada. Artículos faltantes: ${faltantes.join(', ')}.`
      : 'Entrada registrada con revisión física y artículos personales.'
    aviso(req, res, 'success', mensaje, destino)
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return aviso(req, res, 'warning', 'Este menor ya tiene una entrada registrada hoy.', destino)
    next(err)
  }
}

exports.actualizarHorario = async (req, res, next) => {
  const horario = validarHorario(req.body.inicio, req.body.fin)
  if (!horario) return aviso(req, res, 'warning', 'El horario debe tener inicio y fin válidos, con la entrada antes de la salida.')
  try {
    await db.execute('UPDATE horario_recepcion SET inicio = ?, fin = ?, modificado_por = ? WHERE id = 1',
      [horario.inicio, horario.fin, req.usuario.id])
    return aviso(req, res, 'success', 'Horario de recepción actualizado para todo el personal.')
  } catch (error) { next(error) }
}
