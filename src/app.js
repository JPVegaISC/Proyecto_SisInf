const express = require('express')
const path = require('node:path')
const session = require('express-session')
const cookieParser = require('cookie-parser')
const config = require('./config')
const { optionalWebAuth } = require('./middleware/auth')
const { attachCsrf } = require('./middleware/csrf')
const { flashForView } = require('./utils/flash')
const { initializeDatabase } = require('./database/iniciar')

const app = express()
app.disable('x-powered-by')
if (config.isProduction) app.set('trust proxy', 1)
app.set('views', path.join(__dirname, 'view'))
app.set('view engine', 'ejs')
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }))
app.use(express.json({ limit: '50kb' }))
app.use(express.urlencoded({ extended: false, limit: '50kb' }))
app.use(cookieParser())
app.use(session({
  name: 'guarderia_aux',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: config.isProduction, sameSite: 'lax', maxAge: 2 * 60 * 60 * 1000 }
}))
app.use(attachCsrf)
app.use(flashForView)
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  res.locals.salida = req.query.salio === '1'
  next()
})
app.use(optionalWebAuth)
app.use(require('./routes/router'))
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Recurso no encontrado.' })
  res.status(404).render('404', { titulo: 'Página no encontrada' })
})
app.use((err, req, res, next) => {
  console.error('Error:', err)
  if (res.headersSent) return next(err)
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Error interno del servidor.' })
  res.status(500).render('500', { titulo: 'Error del servidor' })
})
if (require.main === module) {
  initializeDatabase().then(() => {
    app.listen(config.port, '0.0.0.0', () => console.log(`Guardería: http://localhost:${config.port}`))
  }).catch(err => { console.error('Error al iniciar la base de datos:', err.message); process.exit(1) })
}
module.exports = app
