# DADM v1.0.0 — Data Architect Document Manager

Herramienta de gestión de documentos de arquitectura (ADR / RFC) de Arquitectura Data, Banco Galicia.
Los arquitectos completan los datos en el editor web y DADM genera el documento con el formato oficial.

## Qué hace

- **Documentos ADR y RFC** con núcleo obligatorio + secciones opcionales + subsecciones, según el formato vigente del equipo.
- **Objetos a demanda** en cualquier sección: simples (texto, callout con estilos, código, imagen PNG/JPG) y complejos (tabla libre, comparativa, matriz de riesgos, RACI, matriz de asignación, glosario, cronograma, stakeholders).
- **Configuración editable** (⚙): cambiar qué secciones son obligatorias/recomendadas/opcionales y agregar apartados nuevos al catálogo, sin tocar código. Se persiste en la base y aplica a los documentos nuevos.
- **Workflow con validación**: no se sale de borrador sin título, ficha completa y todas las secciones obligatorias según la configuración vigente. La validación corre en el cliente y también en el servidor.
- **IDs correlativos** asignados por el servidor (pisos configurables en `secuencia_inicial` para convivir con los documentos históricos).
- **Autenticación con usuarios y roles** (`architect` / `architect_lead`): sesión por cookie firmada (HMAC), contraseñas con hash `scrypt`, rate-limit de login y gestión de usuarios reservada al rol Architect Lead.
- **Importación de `.docx`** existentes como borrador editable (best-effort), incluyendo imágenes embebidas soportadas (PNG/JPG).
- **Export sin perder formato**: Word (.docx) generado server-side con `renderer.js` (idéntico a las plantillas oficiales) y vista imprimible para PDF desde el navegador.

## Almacenamiento

Todo se guarda en **MongoDB** (base `DADM`), sin base local. Colecciones separadas:

| Colección | Contenido |
|---|---|
| `documents` | Documentos ADR/RFC (`_id` = ID correlativo, ej. `ADR-009`) |
| `config` | Configuración/catálogo vigente (documento `clave: "catalogos"`) |
| `imagenes` | Imágenes PNG/JPG subidas (`_id` = UUID, binario) |
| `users` | Usuarios (`_id` = username), hash de contraseña y rol |

La conexión y las credenciales se configuran en un archivo `.env` (ver `.env.example`). Copiar y completar:

```bash
cp .env.example .env
```

Variables: `PORT`, `MONGO_URI`, `MONGO_DB` (app), `MONGO_ROOT_USERNAME` / `MONGO_ROOT_PASSWORD` (contenedor MongoDB) y `AUTH_SECRET` / `ADMIN_USER` / `ADMIN_PASS` (autenticación — ver abajo). El `.env` está en `.gitignore` y **no se commitea**. Los índices se crean solos al arrancar.

### Autenticación

Toda la API (salvo `/api/health`, `/api/login` y `/api/logout`) requiere sesión iniciada. Si no existe ningún usuario, al arrancar el servidor se crea automáticamente un **Architect Lead** inicial con `ADMIN_USER` / `ADMIN_PASS` (por defecto `admin` / `admin`), forzando el cambio de contraseña en el primer login. `AUTH_SECRET` firma el token de sesión (HMAC): definir un valor propio y largo en `.env` antes de usar en un entorno compartido.

Roles: `architect` (uso normal del editor) y `architect_lead` (además, gestión de usuarios, configuración del catálogo y borrado de documentos).

## Correr local

Levantar MongoDB (incluido en `docker-compose.yml`):

```bash
docker compose up -d          # → MongoDB en localhost:27017
```

Levantar la app (requiere Node ≥ 22.5):

```bash
npm install
npm start                     # → http://localhost:8321
```

Backup = `mongodump` de la base `DADM`.

## Estructura

```
server.js        API Express (solo MongoDB)
auth.js          autenticación: hash de contraseñas y token de sesión firmado
db/mongo.js      conexión y colecciones (documentos · config · imágenes · usuarios)
renderer.js      JSON → .docx con el formato oficial
importer.js      .docx → JSON del schema (importación best-effort)
schemas/         adr.schema.json · rfc.schema.json · catalogos.json (seed de configuración)
public/          editor web (single-file)
```

## API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/login` | Login (`{username, password}`) — setea cookie de sesión |
| POST | `/api/logout` | Cierra la sesión |
| GET | `/api/me` | Perfil de la sesión actual |
| POST | `/api/password` | Cambiar la propia contraseña |
| GET | `/api/usuarios` | Listar usuarios (admin) |
| POST | `/api/usuarios` | Crear usuario (admin) |
| PUT | `/api/usuarios/:username` | Editar usuario (admin) |
| DELETE | `/api/usuarios/:username` | Eliminar usuario (admin) |
| GET | `/api/config` | Catálogo/configuración vigente |
| PUT | `/api/config` | Guardar configuración (admin) |
| GET | `/api/documentos` | Listado |
| POST | `/api/documentos` | Crear (`{"tipo":"adr"|"rfc"}`) — asigna ID |
| POST | `/api/importar` | Importar `.docx` existente como borrador (`{tipo, data}`) |
| GET | `/api/documentos/:id` | Documento completo (JSON del schema) |
| PUT | `/api/documentos/:id` | Guardar — valida schema + obligatorias si no es borrador |
| DELETE | `/api/documentos/:id` | Eliminar (solo borradores, admin) |
| GET | `/api/documentos/:id/export.docx` | Word con formato oficial |
| POST | `/api/imagenes` | Subir PNG/JPG (`{"data":"data:image/png;base64,…"}`) — devuelve ID |
| GET | `/api/imagenes/:id` | Servir la imagen |
| DELETE | `/api/imagenes/:id` | Eliminar imagen |
| POST | `/api/imagenes/gc` | Borrar imágenes huérfanas sin referencia (admin) |
| GET | `/api/health` | Health-check público (pinguea Mongo) |

## Historial de versiones

Ver [`CHANGELOG.md`](CHANGELOG.md).

## Roadmap post-1.0

- Usuarios / integración AD: aprobaciones con identidad real y permisos de admin para ⚙.
- Workflow de transición server-side (hoy el cliente arma la transición y el server valida el resultado).
- Notificaciones de vencimiento de ventana de comentarios.
- Creación automática del ADR al cerrar un RFC aceptado (con relación `deriva_de`).
- Fuentes vendorizadas para operación 100% offline.
