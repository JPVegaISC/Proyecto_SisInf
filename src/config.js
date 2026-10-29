const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true })

const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_DATABASE', 'JWT_SECRET', 'SESSION_SECRET', 'ADMIN_PASSWORD']
for (const key of required) {
  if (!process.env[key] || /^(CAMBIAR_|GENERAR_)/.test(process.env[key])) {
    throw new Error(`Falta ${key}. Ejecuta node scripts/configurar.js y verifica .env.`)
  }
}
if (process.env.JWT_SECRET.length < 32 || process.env.SESSION_SECRET.length < 32) {
  throw new Error('JWT_SECRET y SESSION_SECRET deben tener al menos 32 caracteres.')
}
if (process.env.ADMIN_PASSWORD.length < 12) {
  throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres.')
}
module.exports = {
  port: Number(process.env.PORT || 3000),
  isProduction: process.env.NODE_ENV === 'production',
  jwtSecret: process.env.JWT_SECRET,
  sessionSecret: process.env.SESSION_SECRET,
  adminName: process.env.ADMIN_NAME || 'Administrador General',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@guarderia.local',
  adminPassword: process.env.ADMIN_PASSWORD,
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: 'local',
    dateStrings: true
  }
}
