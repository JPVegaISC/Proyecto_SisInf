const bcrypt = require('bcryptjs')
const db = require('./db')
const config = require('../config')

async function initializeDatabase() {
  // Reconfirmar estructura requerida, incluso si la base fue creada sin el script de init.
  const [rows] = await db.execute('SELECT COUNT(*) AS total FROM usuarios')
  if (Number(rows[0].total) !== 0) return
  const hash = await bcrypt.hash(config.adminPassword, 12)
  await db.execute(
    'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
    [config.adminName, config.adminEmail.toLowerCase(), hash, 'administrador']
  )
  console.log(`Cuenta inicial del administrador creada: ${config.adminEmail}`)
}
module.exports = { initializeDatabase }
