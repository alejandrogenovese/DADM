# DADM v0.1 — Data Architect Document Manager

Herramienta de gestión de documentos de arquitectura (ADR / RFC) de Arquitectura Data, Banco Galicia.
Los arquitectos completan los datos en el editor web y DADM genera el documento con el formato oficial.

## Qué hace

- **Documentos ADR y RFC** con núcleo obligatorio + secciones opcionales + subsecciones, según el formato vigente del equipo.
- **Objetos a demanda** en cualquier sección: simples (texto, callout, código, imagen) y complejos (tabla libre, comparativa, matriz de riesgos, RACI, matriz de asignación, glosario, cronograma, stakeholders).
- **Configuración editable** (⚙): cambiar qué secciones son obligatorias/recomendadas/opcionales y agregar apartados nuevos al catálogo, sin tocar código. Se persiste en la base y aplica a los documentos nuevos.
- **Workflow con validación**: no se sale de borrador sin título, ficha completa y todas las secciones obligatorias según la configuración vigente. La validación corre en el cliente y también en el servidor.
- **IDs correlativos** asignados por el servidor (pisos configurables en `secuencia_inicial` para convivir con los documentos históricos).
- **Export sin perder formato**: Word (.docx) generado server-side con `renderer.js` (idéntico a las plantillas oficiales) y vista imprimible para PDF desde el navegador.

## Probar en Render

El repo incluye `render.yaml` (Blueprint). Pasos:

1. Pushear este contenido a la raíz de `github.com/alejandrogenovese/DADM`.
2. En Render: **New → Blueprint** → conectar el repo → deploy. (O **New → Web Service** manual: runtime Node, build `npm install`, start `node server.js`.)
3. Listo: `https://dadm.onrender.com` (o el nombre que asigne).

Notas del plan free:
- **Filesystem efímero**: la base SQLite se reinicia con cada deploy/restart. Sirve para probar la herramienta, no como storage definitivo. Para persistir, plan pago + disco (bloque comentado en `render.yaml`) o correrlo en el NUC.
- El servicio se duerme tras ~15 min sin tráfico; el primer request luego tarda ~30-60 s.

## Correr en el NUC

```bash
cd dadm-app
docker compose up -d --build
# → http://<ip-del-nuc>:8321
```

Los datos quedan en `./data/dadm.db` (volumen). Backup = copiar ese archivo.

Sin Docker (requiere Node ≥ 22.5):

```bash
npm install
npm start
```

Nota: SQLite necesita un filesystem local para `DATA_DIR` (disco del NUC, no un share de red).

## Estructura

```
server.js        API Express + SQLite (node:sqlite, sin dependencias nativas)
renderer.js      JSON → .docx con el formato oficial
schemas/         adr.schema.json · rfc.schema.json · catalogos.json (seed de configuración)
public/          editor web (single-file)
data/            base SQLite (se crea sola)
```

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/config` | Catálogo/configuración vigente |
| PUT | `/api/config` | Guardar configuración (admin) |
| GET | `/api/documentos` | Listado |
| POST | `/api/documentos` | Crear (`{"tipo":"adr"|"rfc"}`) — asigna ID |
| GET | `/api/documentos/:id` | Documento completo (JSON del schema) |
| PUT | `/api/documentos/:id` | Guardar — valida schema + obligatorias si no es borrador |
| DELETE | `/api/documentos/:id` | Eliminar (solo borradores) |
| GET | `/api/documentos/:id/export.docx` | Word con formato oficial |

## Pendiente para v0.2

- Usuarios / integración AD: aprobaciones con identidad real y permisos de admin para ⚙.
- Workflow de transición server-side (hoy el cliente arma la transición y el server valida el resultado).
- Notificaciones de vencimiento de ventana de comentarios.
- Creación automática del ADR al cerrar un RFC aceptado (con relación `deriva_de`).
