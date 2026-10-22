# Guía de entrega y comprobación

**Proyecto:** Sistema web para guardería infantil  
**Materia:** Sistemas de Información  
**Docente:** Tarsicio Ramos Lemus  
**Fecha de entrega:** jueves 22 de octubre de 2026

## Objetivo

Implementar el módulo de acceso y administración de usuarios, considerando inicio/cierre de sesión, almacenamiento protegido de contraseñas, token de autenticación y tres roles de personal.

## Historias y requerimientos contemplados

| ID | Actividad implementada | Cómo comprobarla |
|---|---|---|
| HU-01 | El personal inicia sesión | Entrar con credenciales válidas y observar el panel; intentar contraseña incorrecta |
| HU-02 | El administrador crea usuarios y asigna roles | Crear dos cuentas: una de encargado y una de enfermería; comprobar que no acceden a `/usuarios` |
| RF-01 | Inicio y cierre de sesión | Entrar, navegar y salir; comprobar que ya no se puede entrar al panel |
| RF-02 | Contraseña cifrada mediante hash y JWT | Ver el JWT en `Configuración → Información de acceso`; probar `/api/auth/me` con Bearer; comprobar que `usuarios.password` no está en texto plano |
| RF-03 | Permisos de administrador, encargado y enfermería | Acceder al listado de usuarios como administrador y luego como encargado/enfermería |
| RNF-01 | Contraseñas seguras y permisos | Revisar `bcrypt.hash`; probar que el rol se valida en rutas del servidor |
| RNF-04 | Validación de formularios | Intentar datos incompletos o correos duplicados |
| RNF-06 | Node.js con base persistente | Reiniciar servicios y observar que los usuarios siguen registrados |

## Demostración propuesta

1. Iniciar los dos servicios desde Docker Desktop con `docker compose up --build -d`.
2. Mostrar la pantalla de inicio de sesión y entrar con el administrador.
3. Ir a **Configuración → Información de acceso**, desplegar los detalles y enseñar que existe un token firmado (oculta su texto completo para las capturas).
4. Desde PowerShell, enviar un JWT a `/api/auth/me` y recibir el usuario y rol (código HTTP 200).
5. Crear un usuario `encargado` desde **Personal y roles**.
6. Cerrar sesión, acceder como encargado e intentar entrar directamente a `http://localhost:3010/usuarios` (debe responder HTTP 403).
7. Cerrar sesión con ese encargado, iniciar como administrador, desactivarlo y verificar que ya no puede iniciar sesión.
8. Revisar MySQL: ejecutar en la terminal integrada de Docker o con cualquier cliente conectado al puerto 3309:

```sql
USE guarderia;
SELECT id, nombre, email, rol, activo, LEFT(password, 7) AS inicio_hash FROM usuarios;
```

La columna `inicio_hash` debe mostrar el comienzo de un hash bcrypt (como `$2b$12$`), no la contraseña real.

9. Reiniciar con `docker compose down` y `docker compose up -d` para demostrar persistencia.

## Evidencias sugeridas

- Docker Desktop con los servicios `app` y `mysql` de `proyecto_sisinf` activos.
- Pantalla de login y dashboard.
- Registro de usuario con rol asignado y tabla de usuarios.
- Pantalla de **Información de acceso** con el token oculto o parcialmente tapado.
- Terminal con respuesta `200` del perfil y una respuesta `403` al intentar acceder a usuarios con un token de encargado.
- Tabla MySQL donde se vea el hash bcrypt (sin mostrar datos privados).

**Nota:** los expedientes infantiles, grupos, registros médicos y salidas **no pertenecen al Sprint 1**.
