const TIPOS = ['actividad', 'comida', 'accidente']

function validarCuidado(body = {}) {
  const tipo = typeof body.tipo === 'string' ? body.tipo.trim() : ''
  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : ''
  const observaciones = typeof body.observaciones === 'string' ? body.observaciones.trim() : ''
  if (!TIPOS.includes(tipo)) return { error: 'Selecciona actividad, comida o accidente.' }
  if (!descripcion || descripcion.length > 500) {
    return { error: 'Describe lo ocurrido (máximo 500 caracteres).' }
  }
  if (observaciones.length > 2000) return { error: 'Las observaciones admiten hasta 2000 caracteres.' }
  return { data: { tipo, descripcion, observaciones } }
}

function validarInsumo(body = {}) {
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  const unidad = typeof body.unidad === 'string' ? body.unidad.trim() : ''
  const cantidad = typeof body.cantidad === 'string' ? body.cantidad.trim() : body.cantidad
  const minimo = typeof body.minimo === 'string' ? body.minimo.trim() : body.minimo
  if (!nombre || nombre.length > 100 || !unidad || unidad.length > 30) {
    return { error: 'Escribe un nombre y una unidad válidos para el insumo.' }
  }
  if (![cantidad, minimo].every(valor => /^\d+$/.test(String(valor ?? '')) && Number.isSafeInteger(Number(valor)) && Number(valor) <= 1000000)) {
    return { error: 'La existencia y la cantidad mínima deben ser números enteros de 0 a 1000000.' }
  }
  return { data: { nombre, unidad, cantidad: Number(cantidad), minimo: Number(minimo) } }
}

function avisosEdad(meses) {
  if (meses === null) return []
  if (meses < 6) return ['Menor de 6 meses: no ofrecer alimentos sólidos sin indicación de un profesional de salud.']
  if (meses < 12) return ['Menor de un año: no ofrecer miel y verificar que los alimentos tengan la textura adecuada.']
  if (meses < 48) return ['Menor de cuatro años: evitar nueces y uvas enteras, y otros alimentos que puedan provocar atragantamiento.']
  return ['Verificar que el alimento y su preparación sean adecuados para la edad.']
}

module.exports = { TIPOS, validarCuidado, validarInsumo, avisosEdad }
