const crypto = require('node:crypto')

function attachCsrf(req, res, next) {
  if (!req.session.formToken) req.session.formToken = crypto.randomBytes(24).toString('hex')
  res.locals.csrfToken = req.session.formToken
  next()
}
function verifyCsrf(req, res, next) {
  const expected = req.session.formToken
  const provided = req.body && req.body._csrf
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return res.status(403).send('Formulario caducado o no autorizado. Recarga la página e inténtalo de nuevo.')
  }
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).send('Formulario caducado o no autorizado. Recarga la página e inténtalo de nuevo.')
  }
  next()
}
module.exports = { attachCsrf, verifyCsrf }
