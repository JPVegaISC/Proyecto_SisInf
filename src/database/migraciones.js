async function agregarColumnaSiFalta(db, tabla, columna, definicion) {
  const [filas] = await db.query(`SHOW COLUMNS FROM ${tabla} LIKE ?`, [columna])
  if (filas.length === 0) await db.query(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`)
}

async function createExpedientesTables(db) {
  // Estas tablas se crean sin borrar los datos del Sprint 1.
  await db.query(`
    CREATE TABLE IF NOT EXISTS menores (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      nombres VARCHAR(100) NOT NULL,
      apellido_paterno VARCHAR(80) NOT NULL,
      apellido_materno VARCHAR(80) NULL,
      fecha_nacimiento DATE NOT NULL,
      sexo ENUM('femenino','masculino','no_especificado') NOT NULL DEFAULT 'no_especificado',
      fecha_ingreso DATE NULL,
      alergias TEXT NULL,
      restricciones_alimentarias TEXT NULL,
      cuidados_especiales TEXT NULL,
      observaciones TEXT NULL,
      permanencia_verano TINYINT(1) NOT NULL DEFAULT 0,
      fecha_limite_permanencia DATE NULL,
      identificaciones_extra TINYINT UNSIGNED NOT NULL DEFAULT 0,
      registrado_por INT UNSIGNED NULL,
      actualizado_por INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_menores_nombre (apellido_paterno, nombres),
      CONSTRAINT fk_menor_registro FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
      CONSTRAINT fk_menor_actualizacion FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS contactos_menor (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      menor_id INT UNSIGNED NOT NULL,
      tipo ENUM('madre','padre','tutor','autorizado') NOT NULL,
      nombre VARCHAR(150) NOT NULL,
      parentesco VARCHAR(60) NOT NULL,
      telefono VARCHAR(20) NOT NULL,
      correo VARCHAR(150) NULL,
      puede_recoger TINYINT(1) NOT NULL DEFAULT 0,
      posicion TINYINT UNSIGNED NOT NULL DEFAULT 1,
      identificacion_entregada TINYINT(1) NOT NULL DEFAULT 0,
      fecha_entrega_identificacion DATE NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_contacto_posicion (menor_id, tipo, posicion),
      KEY idx_contactos_menor (menor_id),
      CONSTRAINT fk_contactos_menor FOREIGN KEY (menor_id) REFERENCES menores(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Si se había usado una versión anterior del módulo 2, completar columnas faltantes.
  await agregarColumnaSiFalta(db, 'menores', 'permanencia_verano', 'TINYINT(1) NOT NULL DEFAULT 0')
  await agregarColumnaSiFalta(db, 'menores', 'fecha_limite_permanencia', 'DATE NULL')
  await agregarColumnaSiFalta(db, 'menores', 'identificaciones_extra', 'TINYINT UNSIGNED NOT NULL DEFAULT 0')
  await agregarColumnaSiFalta(db, 'contactos_menor', 'identificacion_entregada', 'TINYINT(1) NOT NULL DEFAULT 0')
  await agregarColumnaSiFalta(db, 'contactos_menor', 'fecha_entrega_identificacion', 'DATE NULL')
}

module.exports = { createExpedientesTables }
