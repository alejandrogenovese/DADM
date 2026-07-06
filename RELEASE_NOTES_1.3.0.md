# DADM 1.3.0 🧭

**Búsqueda, historial de versiones con diff, notificaciones, modo oscuro — y más seguridad HTTP.**

## Lo destacado de esta versión

- 🔎 **Búsqueda y filtros** en el listado: por ID/título, tipo y estado, con paginación.
- 🕘 **Versiones y diff**: cada transición de estado guarda un snapshot del cuerpo. Desde «Versiones» los comparás con lo que estás editando (diff línea a línea) y podés **restaurar** el contenido de una versión anterior.
- ⏰ **Notificaciones in-app**: aviso en el inicio de los RFC cuya ventana de comentarios cierra pronto o ya venció.
- 🌗 **Modo oscuro** con toggle, que recuerda tu preferencia y respeta la del sistema.

## Seguridad

- 🛡️ **Helmet + Content-Security-Policy**: se bloquean scripts y orígenes externos (salvo las fuentes de Google) y el embebido en frames.
- 🔒 **Cookie de sesión `Secure`** automática sobre HTTPS (o forzada con `COOKIE_SECURE=true`).

## Notas de actualización

- Nueva colección **`versiones`** en MongoDB (se crea sola, con su índice).
- Nueva dependencia **`helmet`** (`npm install`).
- Documentación de la API (`/api-docs`) actualizada con los endpoints de versiones.

## Cómo correrlo

```bash
cp .env.example .env          # completar credenciales
docker compose up -d          # MongoDB en localhost:27017
npm install && npm start      # → http://localhost:8321
```

Changelog completo en [`CHANGELOG.md`](CHANGELOG.md).
