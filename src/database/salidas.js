async function createSalidasTables(db) {
  const [campos] = await db.query("SHOW COLUMNS FROM menores LIKE 'estado'")
  if (!campos.length) {
    await db.query("ALTER TABLE menores ADD COLUMN estado ENUM('activo','baja') NOT NULL DEFAULT 'activo'")
  }
  const [fechas] = await db.query("SHOW COLUMNS FROM menores LIKE 'fecha_baja'")
  if (!fechas.length) await db.query('ALTER TABLE menores ADD COLUMN fecha_baja DATETIME NULL')

  await db.query(`CREATE TABLE IF NOT EXISTS avisos_recogida (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    menor_id INT UNSIGNED NOT NULL,
    fecha DATE NOT NULL,
    contacto_id INT UNSIGNED NULL,
    nombre_avisado VARCHAR(150) NOT NULL,
    registrado_por INT UNSIGNED NULL,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_aviso_menor_fecha (menor_id, fecha),
    CONSTRAINT fk_aviso_menor FOREIGN KEY (menor_id) REFERENCES menores(id),
    CONSTRAINT fk_aviso_contacto FOREIGN KEY (contacto_id) REFERENCES contactos_menor(id) ON DELETE SET NULL,
    CONSTRAINT fk_aviso_usuario FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  await db.query(`CREATE TABLE IF NOT EXISTS salidas (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    menor_id INT UNSIGNED NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    contacto_id INT UNSIGNED NULL,
    nombre_recoge VARCHAR(150) NOT NULL,
    retraso TINYINT(1) NOT NULL DEFAULT 0,
    observaciones VARCHAR(500) NULL,
    registrado_por INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_salida_menor_fecha (menor_id, fecha),
    KEY idx_salida_fecha (fecha),
    CONSTRAINT fk_salida_menor FOREIGN KEY (menor_id) REFERENCES menores(id),
    CONSTRAINT fk_salida_contacto FOREIGN KEY (contacto_id) REFERENCES contactos_menor(id) ON DELETE SET NULL,
    CONSTRAINT fk_salida_usuario FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  await db.query(`CREATE TABLE IF NOT EXISTS movimientos_menor (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    menor_id INT UNSIGNED NOT NULL,
    tipo ENUM('baja','reinscripcion') NOT NULL,
    motivo VARCHAR(500) NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    registrado_por INT UNSIGNED NULL,
    KEY idx_mov_menor (menor_id, fecha),
    CONSTRAINT fk_mov_menor FOREIGN KEY (menor_id) REFERENCES menores(id),
    CONSTRAINT fk_mov_admin FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
}

module.exports = { createSalidasTables }
