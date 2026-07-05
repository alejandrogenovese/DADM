# DADM 1.2.0 ✍️

**Texto enriquecido en el editor, documentación de la API con Swagger y correcciones importantes.**

## Lo destacado de esta versión

- ✍️ **Texto enriquecido**: en bloques de texto, callouts y celdas de tabla ahora podés dar **negrita, itálica, subrayado, tachado, código inline, tipografía y tamaño** desde una barra flotante que aparece al seleccionar. El formato viaja tal cual al **Word (.docx)** y a la vista imprimible.
- 🔒 **Seguro por diseño**: el contenido enriquecido se guarda como HTML inline y se **sanitiza siempre al mostrarlo** (whitelist de tags y atributos), sin dejar pasar scripts ni handlers.
- 📚 **API documentada con Swagger / OpenAPI 3**: UI navegable en `/api-docs` y especificación en `/api-docs.json`.

## Correcciones

- 🧱 **Agregar bloques y tablas volvía a funcionar mal**: tras borrar una tabla no se podían agregar nuevos bloques (ni subir imágenes ni cambiar el estilo de un callout). Era una regresión al reemplazar `eval`; ya está corregido.
- 👁️ **Vista previa y descarga de Word en ADR**: abrían con error por una función eliminada por accidente en un refactor. Restauradas.
- ↵ **Saltos de línea respetados**: las listas y referencias escritas una por línea ya no se fusionan en un párrafo corrido en el Word ni en la vista previa — cada línea del editor es una línea en el documento.

## Cómo correrlo

```bash
cp .env.example .env          # completar credenciales
docker compose up -d          # MongoDB en localhost:27017
npm install && npm start      # → http://localhost:8321
```

Documentación de la API en `http://localhost:8321/api-docs`.

## Próximos pasos

Identidad real con AD y permisos de admin, workflow de transición server-side, notificaciones de ventanas de comentarios y encadenado automático RFC → ADR.

Changelog completo en [`CHANGELOG.md`](CHANGELOG.md).
