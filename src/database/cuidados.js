async function createCuidadosTables(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS cuidados_diarios (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    menor_id INT UNSIGNED NOT NULL,
    entrada_id INT UNSIGNED NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    tipo ENUM('actividad', 'comida', 'accidente') NOT NULL,
    descripcion VARCHAR(500) NOT NULL,
    observaciones TEXT NULL,
    registrado_por INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_cuidados_menor_fecha (menor_id, fecha, hora),
    KEY idx_cuidados_fecha (fecha),
    CONSTRAINT fk_cuidados_menor FOREIGN KEY (menor_id) REFERENCES menores(id),
    CONSTRAINT fk_cuidados_entrada FOREIGN KEY (entrada_id) REFERENCES entradas(id),
    CONSTRAINT fk_cuidados_usuario FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  await db.query(`CREATE TABLE IF NOT EXISTS insumos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    unidad VARCHAR(30) NOT NULL,
    cantidad INT UNSIGNED NOT NULL DEFAULT 0,
    minimo INT UNSIGNED NOT NULL DEFAULT 0,
    actualizado_por INT UNSIGNED NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_insumos_nombre (nombre),
    CONSTRAINT fk_insumos_usuario FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
}

module.exports = { createCuidadosTables }
