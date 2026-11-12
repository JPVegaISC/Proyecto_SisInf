const { grupoParaEdad } = require('../models/grupo')

async function createGruposTables(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS grupos (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    edad_min_meses TINYINT UNSIGNED NOT NULL,
    edad_max_meses TINYINT UNSIGNED NOT NULL,
    encargado_id INT UNSIGNED NULL,
    CONSTRAINT fk_grupo_encargado FOREIGN KEY (encargado_id) REFERENCES usuarios(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  await db.query(`INSERT IGNORE INTO grupos (id, nombre, edad_min_meses, edad_max_meses) VALUES
    (1, 'Lactantes', 1, 11), (2, 'Maternal I', 12, 23),
    (3, 'Maternal II', 24, 35), (4, 'Preescolar', 36, 47)
   `)

  const [activos] = await db.query("SHOW COLUMNS FROM grupos LIKE 'activo'")
  if (!activos.length) await db.query('ALTER TABLE grupos ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1')
  await db.query(`CREATE TABLE IF NOT EXISTS horario_recepcion (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    inicio TIME NOT NULL DEFAULT '08:00:00',
    fin TIME NOT NULL DEFAULT '09:00:00',
    modificado_por INT UNSIGNED NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_horario_admin FOREIGN KEY (modificado_por) REFERENCES usuarios(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  await db.query("INSERT IGNORE INTO horario_recepcion (id, inicio, fin) VALUES (1, '08:00:00', '09:00:00')")

  await db.query(`CREATE TABLE IF NOT EXISTS asignaciones_grupo (
    menor_id INT UNSIGNED NOT NULL PRIMARY KEY,
    grupo_id TINYINT UNSIGNED NOT NULL,
    asignado_por INT UNSIGNED NULL,
    fecha_asignacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_asignacion_menor FOREIGN KEY (menor_id) REFERENCES menores(id) ON DELETE CASCADE,
    CONSTRAINT fk_asignacion_grupo FOREIGN KEY (grupo_id) REFERENCES grupos(id),
    CONSTRAINT fk_asignacion_usuario FOREIGN KEY (asignado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
    KEY idx_asignaciones_grupo (grupo_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  await db.query(`CREATE TABLE IF NOT EXISTS movimientos_grupo (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    menor_id INT UNSIGNED NOT NULL,
    grupo_anterior TINYINT UNSIGNED NULL,
    grupo_nuevo TINYINT UNSIGNED NOT NULL,
    cambiado_por INT UNSIGNED NULL,
    motivo VARCHAR(255) NOT NULL,
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_movimientos_menor_fecha (menor_id, fecha),
    CONSTRAINT fk_movimiento_menor FOREIGN KEY (menor_id) REFERENCES menores(id) ON DELETE CASCADE,
    CONSTRAINT fk_movimiento_anterior FOREIGN KEY (grupo_anterior) REFERENCES grupos(id),
    CONSTRAINT fk_movimiento_nuevo FOREIGN KEY (grupo_nuevo) REFERENCES grupos(id),
    CONSTRAINT fk_movimiento_usuario FOREIGN KEY (cambiado_por) REFERENCES usuarios(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  await db.query(`CREATE TABLE IF NOT EXISTS entradas (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    menor_id INT UNSIGNED NOT NULL,
    grupo_id TINYINT UNSIGNED NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    revision_fisica ENUM('sin_lesiones', 'con_observaciones') NOT NULL,
    observaciones_fisicas TEXT NULL,
    leche ENUM('si','no','no_aplica') NOT NULL,
    panales ENUM('si','no','no_aplica') NOT NULL,
    ropa ENUM('si','no','no_aplica') NOT NULL,
    cobija ENUM('si','no','no_aplica') NOT NULL,
    otros_articulos VARCHAR(255) NULL,
    notas_articulos VARCHAR(500) NULL,
    registrado_por INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_entrada_menor_fecha (menor_id, fecha),
    KEY idx_entrada_fecha (fecha),
    CONSTRAINT fk_entrada_menor FOREIGN KEY (menor_id) REFERENCES menores(id),
    CONSTRAINT fk_entrada_grupo FOREIGN KEY (grupo_id) REFERENCES grupos(id),
    CONSTRAINT fk_entrada_usuario FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  // Asignar sin perder expedientes previos ni modificar los movimientos manuales.
  const [pendientes] = await db.execute(`SELECT m.id, m.fecha_nacimiento, m.permanencia_verano,
    m.fecha_limite_permanencia FROM menores m LEFT JOIN asignaciones_grupo a ON a.menor_id = m.id
    WHERE a.menor_id IS NULL`)
  for (const menor of pendientes) {
    const grupo = grupoParaEdad(menor.fecha_nacimiento, undefined,
      Boolean(menor.permanencia_verano), menor.fecha_limite_permanencia)
    if (grupo) {
      await db.execute('INSERT IGNORE INTO asignaciones_grupo (menor_id, grupo_id) VALUES (?, ?)', [menor.id, grupo])
    }
  }
}

module.exports = { createGruposTables }
