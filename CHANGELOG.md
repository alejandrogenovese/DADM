# Changelog

Todas las modificaciones relevantes de DADM se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el versionado sigue [SemVer](https://semver.org/lang/es/).

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

[1.0.0]: https://github.com/alejandrogenovese/DADM/releases/tag/v1.0.0
