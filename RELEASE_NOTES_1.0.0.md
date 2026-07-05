# DADM 1.0.0 🚀

**Primera versión estable del Data Architect Document Manager — Arquitectura Data, Banco Galicia.**

DADM es la herramienta con la que el equipo crea, versiona y publica sus **ADR** (Architecture Decision Records) y **RFC** (Request for Comments) con el formato oficial — sin plantillas de Word desalineadas ni decisiones dispersas.

## Lo destacado de esta versión

- 📝 **Editor guiado** de ADR/RFC: núcleo obligatorio + secciones y objetos del catálogo (texto, callouts, código, imágenes PNG/JPG, tablas tipadas).
- 📄 **Export al Word oficial** server-side (con imágenes embebidas) y vista imprimible para PDF — idéntico a la plantilla, siempre.
- ✅ **Workflow con validación** en cliente y servidor: no se sale de borrador sin lo mínimo requerido.
- ⚙️ **Catálogo editable por el equipo**: obligatoriedad de secciones y apartados nuevos, sin tocar código.
- 💬 **Revisión de RFC** con comentarios, resolución obligatoria e historial automático.
- 🗄️ **Todo en MongoDB** (documentos, configuración e imágenes), con credenciales fuera del código.
- 🎨 **UI renovada**: sidebar, tipografía IBM Plex y estados por color.

## Cómo correrlo

```bash
cp .env.example .env          # completar credenciales
docker compose up -d          # MongoDB en localhost:27017
npm install && npm start      # → http://localhost:8321
```

## Próximos pasos

Identidad real con AD y permisos de admin, workflow de transición server-side, notificaciones de ventanas de comentarios y encadenado automático RFC → ADR.

Changelog completo en [`CHANGELOG.md`](CHANGELOG.md).
