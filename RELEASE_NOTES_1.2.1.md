# DADM 1.2.1 🛠️

**Release de endurecimiento: el backend responde de forma predecible ante errores y creaciones concurrentes.**

Sin cambios visibles para el usuario; mejora la robustez y la operación.

## Correcciones

- 🧯 **Errores del backend ya no cuelgan la request**: si MongoDB fallaba, las rutas `async` quedaban sin responder (Express 4 no captura los rechazos de promesa). Ahora un envoltorio deriva todo a un manejador de errores global que devuelve **500** (o el **4xx** que corresponda) de inmediato.
- 🔢 **Creación de documentos a prueba de concurrencia**: dos creaciones simultáneas podían chocar el mismo ID correlativo. Ahora se **reintenta recalculando el ID**, tanto al crear como al importar `.docx`.

## Cómo correrlo

```bash
cp .env.example .env          # completar credenciales
docker compose up -d          # MongoDB en localhost:27017
npm install && npm start      # → http://localhost:8321
```

Changelog completo en [`CHANGELOG.md`](CHANGELOG.md).
