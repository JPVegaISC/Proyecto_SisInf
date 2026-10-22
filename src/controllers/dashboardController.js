const db = require('../database/db')

exports.show = async (req, res, next) => {
  try {
    // En el primer módulo solo existen cuentas del personal.
    // No mostrar estadísticas ficticias sobre menores o actividades.
    let personalActivo = null
    if (req.usuario.rol === 'administrador') {
      const [[fila]] = await db.execute('SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1')
      personalActivo = Number(fila.total)
    }
    res.render('index', { titulo: 'Inicio', personalActivo })
  } catch (error) {
    next(error)
  }
}
