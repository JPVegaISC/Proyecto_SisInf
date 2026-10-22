const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
function scan(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (item.name === 'node_modules' || item.name === '.git') continue
    const file = path.join(directory, item.name)
    if (item.isDirectory()) scan(file)
    else if (item.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
      if (result.status !== 0) {
        console.error('Error de sintaxis en ' + path.relative(root, file))
        console.error(result.stderr)
        process.exitCode = 1
      } else console.log('OK ' + path.relative(root, file))
    }
  }
}
scan(path.join(root, 'src'))
scan(path.join(root, 'scripts'))
scan(path.join(root, 'test'))
if (!process.exitCode) console.log('\nTodos los archivos JS pasaron la verificación de sintaxis.')
