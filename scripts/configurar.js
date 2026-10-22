const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const file = path.resolve(__dirname, '../.env')
if (fs.existsSync(file)) {
  console.log('Ya existe .env. No lo modifico para conservar tus contraseñas y datos.')
  process.exit(0)
}
const random = (bytes) => crypto.randomBytes(bytes).toString('base64url')
const password = random(18)
const lines = [
  '# Configuración LOCAL de desarrollo. No subir a GitHub.',
  'NODE_ENV=development',
  'APP_PORT=3010',
  'MYSQL_PORT=3309',
  'DB_HOST=mysql',
  'DB_PORT=3306',
  'DB_DATABASE=guarderia',
  'DB_USER=guarderia_app',
  `DB_PASSWORD=${random(24)}`,
  `MYSQL_ROOT_PASSWORD=${random(24)}`,
  `JWT_SECRET=${random(48)}`,
  `SESSION_SECRET=${random(48)}`,
  'ADMIN_NAME=Administrador General',
  'ADMIN_EMAIL=admin@guarderia.local',
  `ADMIN_PASSWORD=${password}`,
  ''
]
fs.writeFileSync(file, lines.join('\n'), { flag: 'wx', mode: 0o600 })
console.log('\nConfiguración local creada: .env')
console.log('Cuenta inicial de administrador:')
console.log('Correo: admin@guarderia.local')
console.log('Contraseña: ' + password)
console.log('\nGUARDA esta contraseña para iniciar sesión. No subas el archivo .env a GitHub.')
console.log('Siguiente paso: docker compose up --build -d')
