# Changelog

Todas las modificaciones relevantes de DADM se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el versionado sigue [SemVer](https://semver.org/lang/es/).

## [1.3.0] — 2026-07-06

Funcionalidades de producto (búsqueda, versiones/diff, notificaciones, modo oscuro) y endurecimiento de seguridad HTTP.

### Added
- **Búsqueda y filtros en el listado de documentos**: por texto (ID/título), tipo (ADR/RFC) y estado, con contador y **paginación** client-side.
- **Versiones y diff**: en cada transición de estado se guarda un **snapshot del cuerpo** (nueva colección `versiones` en MongoDB). Desde el editor (botón «Versiones») se listan, se **comparan con la versión en edición** (diff línea a línea) y se puede **restaurar** el contenido de una versión al editor para revisarlo y guardarlo. Endpoints `GET /api/documentos/:id/versiones` y `/:id/versiones/:vid`; cascada de borrado.
- **Notificaciones in-app**: banner en el inicio con los RFC (no cerrados) cuya ventana de comentarios cierra en ≤ 3 días o ya venció. El listado expone `ventana_hasta` y `comentarios_pendientes`.
- **Modo oscuro**: toggle en la barra lateral, persistido en el navegador y respetando la preferencia del sistema; la vista imprimible se mantiene en blanco.
- **Documentación OpenAPI** actualizada con los endpoints de versiones y los nuevos campos del listado.

### Security
- **Cabeceras de seguridad con Helmet + Content-Security-Policy** adaptada al front (bloquea scripts/orígenes externos salvo Google Fonts; `frame-ancestors 'none'`, `object-src 'none'`, `nosniff`, etc.).
- **Cookie de sesión con `Secure`** cuando la conexión es HTTPS (auto-detección por `req.secure` / `x-forwarded-proto`, o forzado con `COOKIE_SECURE=true`).

## [1.2.1] — 2026-07-05

Endurecimiento del backend: manejo de errores robusto y creación de documentos a prueba de concurrencia.

### Fixed
- **Requests colgadas ante errores del backend**: los handlers `async` sin `try/catch` dejaban la request sin responder cuando MongoDB fallaba (Express 4 no captura los rechazos de promesa). Se agregó un envoltorio (`asyncSafe`) que deriva cualquier rechazo a un **manejador de errores global**, devolviendo 500 (o el código 4xx correspondiente) en lugar de colgarse.
- **Colisión de IDs en creación concurrente**: dos creaciones simultáneas podían calcular el mismo correlativo y chocar. La creación de documentos (`POST /api/documentos` y `POST /api/importar`) ahora **reintenta ante colisión** recalculando el ID.

## [1.2.0] — 2026-07-05

Documentación de la API con Swagger y edición de texto enriquecido en el editor,
más correcciones de regresiones en bloques, tablas y export.

### Added
- **Texto enriquecido** en bloques de texto, callouts y celdas de tabla: negrita, itálica, subrayado, tachado, código inline, tipografía y tamaño, mediante una barra flotante al seleccionar texto. El formato viaja al Word (.docx) y a la vista imprimible. El contenido se guarda como HTML inline y se **sanitiza siempre al mostrarlo** (whitelist de tags/atributos) para evitar XSS.
- **Documentación de la API (Swagger / OpenAPI 3)**: UI navegable en `/api-docs` y especificación cruda en `/api-docs.json` (`openapi.js`). Pública, con esquema de autenticación por cookie de sesión.

### Fixed
- **Bloques/tablas no se podían volver a agregar**: `agregarBloque` / `subirImagen` / `setEstilo` quedaban sin efecto porque `resolvePath` se enraizaba en `globalThis` (donde `doc` no existe). Regresión introducida al reemplazar `eval` por Sonar.
- **Vista previa y export de ADR rotos**: `abrirVista()` llamaba a `decisionRows()`, una función que un refactor había borrado sin querer, lanzando `ReferenceError` antes de renderizar (y bloqueando el botón de descarga de Word).
- **Saltos de línea colapsados en el Word y la vista previa**: cada línea del editor (separada por `\n` simple) se unía con espacios en un solo párrafo. Ahora cada línea visible es un salto real y la línea en blanco separa párrafos, alineado con lo que muestra el editor.

## [1.1.0] — 2026-07-05

### Added
- **Autenticación con usuarios y roles** (`architect` / `architect_lead`): sesión por cookie firmada (HMAC), contraseñas con hash `scrypt`, rate-limit de login y cambio de contraseña forzado en el primer ingreso (`auth.js`).
- **Gestión de usuarios** reservada al rol Architect Lead (alta, edición de rol, reseteo de contraseña y baja), con la garantía de que siempre quede al menos un Architect Lead.
- **Importación de `.docx`** existentes como borrador editable (best-effort, vía `mammoth`), incluyendo imágenes embebidas soportadas (PNG/JPG) (`importer.js`).

### Security
- Toda la API queda detrás de sesión salvo `/api/health`, `/api/login` y `/api/logout`. `AUTH_SECRET` firma el token de sesión.

## [1.0.0] — 2026-07-05

Primera versión estable de DADM. Editor de ADR/RFC con formato oficial,
persistencia centralizada en MongoDB y export a Word server-side.

### Added
- **Editor de documentos ADR y RFC** con núcleo obligatorio, secciones opcionales y subsecciones según el catálogo del equipo.
- **Objetos de contenido**: texto, callout (con estilos Info / Decisión / Advertencia / Cita), código, imagen (PNG/JPG), tabla libre y tablas tipadas (opciones evaluadas, comparativa, riesgos, glosario, RACI, cronograma, matriz de asignación, stakeholders).
- **Configuración editable del catálogo** (⚙): niveles obligatoria/recomendada/opcional por sección y alta de apartados nuevos, sin tocar código. Persistida en la base.
- **Workflow con validación de estados**, con reglas exigidas al salir de borrador (título, ficha completa, secciones obligatorias). Validación en cliente **y** servidor.
- **IDs correlativos** asignados por el servidor, con pisos configurables (`secuencia_inicial`).
- **Export a Word (.docx)** server-side con el formato oficial (`renderer.js`), con imágenes embebidas, y **vista imprimible** para PDF.
- **Comentarios de revisores en RFC** con resolución obligatoria antes de cerrar e historial de cambios autogenerado.
- **Persistencia en MongoDB** (base `DADM`) en colecciones separadas: `documents`, `config`, `imagenes`. Índices creados automáticamente al arrancar.
- **Configuración por `.env`** (`MONGO_URI`, `MONGO_DB`, `PORT`, credenciales del contenedor Mongo), con `.env.example` versionado y `.env` fuera de git.
- **Nuevo diseño de UI**: layout con sidebar, tipografía IBM Plex, chips de estado por color y paleta renovada.

### Changed
- Almacenamiento migrado de SQLite local a **MongoDB** como único backend.
- Bloque de imagen: ahora acepta **PNG y JPG** (antes solo PNG), detectando el tipo por firma del archivo.
- El botón **Guardar** del editor ahora **guarda y vuelve al inicio**.

### Removed
- Backend SQLite (`node:sqlite`) y almacenamiento en archivos locales (`data/`).
- Despliegue en Render (`render.yaml`) y todo lo asociado a filesystem efímero.
- Módulo de diagramas embebidos (draw.io) explorado durante el desarrollo, reemplazado por subida directa de imágenes.

### Security
- Credenciales y datos sensibles movidos a `.env` (excluido del control de versiones).

[1.3.0]: https://github.com/alejandrogenovese/DADM/releases/tag/v1.3.0
[1.2.1]: https://github.com/alejandrogenovese/DADM/releases/tag/v1.2.1
[1.2.0]: https://github.com/alejandrogenovese/DADM/releases/tag/v1.2.0
[1.1.0]: https://github.com/alejandrogenovese/DADM/releases/tag/v1.1.0
[1.0.0]: https://github.com/alejandrogenovese/DADM/releases/tag/v1.0.0
