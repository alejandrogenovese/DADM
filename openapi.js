// DADM — Especificación OpenAPI 3.0 de la API HTTP.
// Se sirve como JSON en /api-docs.json y como UI navegable en /api-docs (Swagger UI).
// La autenticación es por cookie de sesión firmada (dadm_token), emitida por POST /api/login.
const { version } = require("./package.json");

// Componentes reutilizables ------------------------------------------------
const cookieAuth = { cookieAuth: { type: "apiKey", in: "cookie", name: "dadm_token" } };

const Error = {
  type: "object",
  properties: { error: { type: "string", description: "Mensaje de error" } },
};

const Perfil = {
  type: "object",
  properties: {
    username: { type: "string", example: "admin" },
    role: { type: "string", enum: ["architect", "architect_lead"] },
    nombre: { type: "string", example: "Administrador" },
    mustChangePassword: { type: "boolean" },
  },
};

const Usuario = {
  type: "object",
  properties: {
    username: { type: "string" },
    nombre: { type: "string" },
    role: { type: "string", enum: ["architect", "architect_lead"] },
  },
};

const DocumentoResumen = {
  type: "object",
  properties: {
    id: { type: "string", example: "ADR-010" },
    tipo: { type: "string", enum: ["adr", "rfc"] },
    titulo: { type: "string" },
    estado: { type: "string", example: "borrador" },
    version: { type: "string", example: "0.1" },
    actualizado: { type: "string", format: "date", example: "2026-07-05" },
  },
};

const Documento = {
  type: "object",
  description: "Documento completo según el schema ADR/RFC (schemas/*.schema.json).",
  properties: {
    id: { type: "string", example: "ADR-010" },
    tipo: { type: "string", enum: ["adr", "rfc"] },
    titulo: { type: "string" },
    estado: { type: "string", example: "borrador" },
    autores: { type: "array", items: { type: "string" } },
    fecha_creacion: { type: "string", format: "date" },
    version: { type: "string", example: "0.1" },
    historial: {
      type: "array",
      items: {
        type: "object",
        properties: {
          version: { type: "string" },
          fecha: { type: "string", format: "date" },
          autor: { type: "string" },
          cambio: { type: "string" },
        },
      },
    },
    cuerpo: { type: "array", items: { type: "object" }, description: "Secciones y bloques del documento." },
  },
};

// Respuestas de error reutilizables
const errRef = { schema: { $ref: "#/components/schemas/Error" } };
const r400 = { description: "Solicitud inválida", content: { "application/json": errRef } };
const r401 = { description: "No autenticado", content: { "application/json": errRef } };
const r403 = { description: "Requiere rol Architect Lead", content: { "application/json": errRef } };
const r404 = { description: "No existe", content: { "application/json": errRef } };
const r409 = { description: "Conflicto", content: { "application/json": errRef } };

const okJson = (schema, description = "OK") => ({ description, content: { "application/json": { schema } } });

// Paths --------------------------------------------------------------------
const openapi = {
  openapi: "3.0.3",
  info: {
    title: "DADM API",
    version,
    description:
      "Data Architect Document Manager — API de configuración, documentos (ADR/RFC), imágenes y export a Word.\n\n" +
      "La autenticación es por cookie de sesión (`dadm_token`) emitida por `POST /api/login`. " +
      "Desde Swagger UI, autenticate ejecutando el login y el navegador enviará la cookie automáticamente en las siguientes llamadas.",
  },
  servers: [{ url: "/", description: "Servidor actual" }],
  tags: [
    { name: "Autenticación", description: "Login, logout, sesión y cambio de contraseña" },
    { name: "Usuarios", description: "Gestión de usuarios (solo Architect Lead)" },
    { name: "Configuración", description: "Catálogo editable de secciones" },
    { name: "Documentos", description: "ADR y RFC" },
    { name: "Imágenes", description: "Subida y consulta de imágenes embebidas" },
    { name: "Sistema", description: "Health-check" },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["Sistema"],
        summary: "Health-check público",
        description: "Pinguea MongoDB. No requiere sesión.",
        security: [],
        responses: {
          200: okJson({ type: "object", properties: { ok: { type: "boolean" }, mongo: { type: "string", example: "up" } } }),
          503: { description: "Mongo caído", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, mongo: { type: "string", example: "down" } } } } } },
        },
      },
    },
    "/api/login": {
      post: {
        tags: ["Autenticación"],
        summary: "Iniciar sesión",
        description: "Devuelve el perfil y setea la cookie de sesión `dadm_token`.",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["username", "password"], properties: { username: { type: "string" }, password: { type: "string", format: "password" } } } } },
        },
        responses: {
          200: okJson({ $ref: "#/components/schemas/Perfil" }, "Sesión iniciada"),
          401: r401,
          429: { description: "Demasiados intentos fallidos", content: { "application/json": errRef } },
        },
      },
    },
    "/api/logout": {
      post: {
        tags: ["Autenticación"],
        summary: "Cerrar sesión",
        security: [],
        responses: { 200: okJson({ type: "object", properties: { ok: { type: "boolean" } } }) },
      },
    },
    "/api/me": {
      get: {
        tags: ["Autenticación"],
        summary: "Perfil de la sesión actual",
        responses: { 200: okJson({ $ref: "#/components/schemas/Perfil" }), 401: r401 },
      },
    },
    "/api/password": {
      post: {
        tags: ["Autenticación"],
        summary: "Cambiar la propia contraseña",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["actual", "nueva"], properties: { actual: { type: "string", format: "password" }, nueva: { type: "string", format: "password", minLength: 6 } } } } },
        },
        responses: { 200: okJson({ type: "object", properties: { ok: { type: "boolean" } } }), 400: r400, 401: r401 },
      },
    },
    "/api/usuarios": {
      get: {
        tags: ["Usuarios"],
        summary: "Listar usuarios",
        responses: { 200: okJson({ type: "array", items: { $ref: "#/components/schemas/Usuario" } }), 401: r401, 403: r403 },
      },
      post: {
        tags: ["Usuarios"],
        summary: "Crear usuario",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["username", "password", "role"], properties: { username: { type: "string" }, nombre: { type: "string" }, password: { type: "string", format: "password" }, role: { type: "string", enum: ["architect", "architect_lead"] } } } } },
        },
        responses: { 201: okJson({ type: "object", properties: { ok: { type: "boolean" } } }, "Creado"), 400: r400, 401: r401, 403: r403, 409: r409 },
      },
    },
    "/api/usuarios/{username}": {
      parameters: [{ name: "username", in: "path", required: true, schema: { type: "string" } }],
      put: {
        tags: ["Usuarios"],
        summary: "Actualizar usuario",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { nombre: { type: "string" }, role: { type: "string", enum: ["architect", "architect_lead"] }, password: { type: "string", format: "password" } } } } },
        },
        responses: { 200: okJson({ type: "object", properties: { ok: { type: "boolean" } } }), 400: r400, 401: r401, 403: r403, 404: r404, 409: r409 },
      },
      delete: {
        tags: ["Usuarios"],
        summary: "Eliminar usuario",
        responses: { 200: okJson({ type: "object", properties: { ok: { type: "boolean" } } }), 401: r401, 403: r403, 404: r404, 409: r409 },
      },
    },
    "/api/config": {
      get: {
        tags: ["Configuración"],
        summary: "Obtener el catálogo de configuración",
        responses: { 200: okJson({ type: "object", description: "Catálogo de secciones ADR/RFC y secuencias." }), 401: r401 },
      },
      put: {
        tags: ["Configuración"],
        summary: "Reemplazar el catálogo (solo Architect Lead)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["secciones_adr", "secciones_rfc"] } } } },
        responses: { 200: okJson({ type: "object", properties: { ok: { type: "boolean" } } }), 400: r400, 401: r401, 403: r403 },
      },
    },
    "/api/documentos": {
      get: {
        tags: ["Documentos"],
        summary: "Listar documentos",
        responses: { 200: okJson({ type: "array", items: { $ref: "#/components/schemas/DocumentoResumen" } }), 401: r401 },
      },
      post: {
        tags: ["Documentos"],
        summary: "Crear un documento vacío",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["tipo"], properties: { tipo: { type: "string", enum: ["adr", "rfc"] } } } } } },
        responses: { 201: okJson({ $ref: "#/components/schemas/Documento" }, "Creado"), 400: r400, 401: r401 },
      },
    },
    "/api/importar": {
      post: {
        tags: ["Documentos"],
        summary: "Importar un .docx como borrador",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["tipo", "data"], properties: { tipo: { type: "string", enum: ["adr", "rfc"] }, data: { type: "string", description: ".docx en base64 (con o sin data URI)" } } } } } },
        responses: { 201: okJson({ type: "object", properties: { id: { type: "string" } } }, "Importado"), 400: r400, 401: r401, 500: { description: "Error al importar", content: { "application/json": errRef } } },
      },
    },
    "/api/documentos/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: "ADR-010" }],
      get: {
        tags: ["Documentos"],
        summary: "Obtener un documento",
        responses: { 200: okJson({ $ref: "#/components/schemas/Documento" }), 401: r401, 404: r404 },
      },
      put: {
        tags: ["Documentos"],
        summary: "Guardar un documento",
        description: "Valida contra el schema. Al salir de 'borrador' exige las secciones obligatorias de la configuración vigente.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Documento" } } } },
        responses: {
          200: okJson({ type: "object", properties: { ok: { type: "boolean" }, fecha_actualizacion: { type: "string", format: "date" } } }),
          400: r400, 401: r401, 404: r404,
          422: { description: "No valida contra el schema o faltan secciones obligatorias", content: { "application/json": errRef } },
        },
      },
      delete: {
        tags: ["Documentos"],
        summary: "Eliminar un borrador (solo Architect Lead)",
        responses: { 200: okJson({ type: "object", properties: { ok: { type: "boolean" }, imagenesEliminadas: { type: "integer" } } }), 401: r401, 403: r403, 404: r404, 409: r409 },
      },
    },
    "/api/documentos/{id}/export.docx": {
      get: {
        tags: ["Documentos"],
        summary: "Exportar el documento a Word (.docx)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: "ADR-010" }],
        responses: {
          200: { description: "Archivo .docx", content: { "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { schema: { type: "string", format: "binary" } } } },
          401: r401, 404: r404, 500: { description: "Error generando el documento", content: { "application/json": errRef } },
        },
      },
    },
    "/api/imagenes": {
      post: {
        tags: ["Imágenes"],
        summary: "Subir una imagen PNG/JPG",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["data"], properties: { data: { type: "string", description: "Imagen PNG/JPG en base64 (con o sin data URI)" } } } } } },
        responses: { 201: okJson({ type: "object", properties: { id: { type: "string" } } }, "Subida"), 400: r400, 401: r401 },
      },
    },
    "/api/imagenes/gc": {
      post: {
        tags: ["Imágenes"],
        summary: "Recolectar imágenes huérfanas (solo Architect Lead)",
        description: "Elimina imágenes no referenciadas con más de 1 h de antigüedad.",
        responses: { 200: okJson({ type: "object", properties: { eliminadas: { type: "integer" } } }), 401: r401, 403: r403 },
      },
    },
    "/api/imagenes/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      get: {
        tags: ["Imágenes"],
        summary: "Obtener el binario de una imagen",
        responses: { 200: { description: "Imagen", content: { "image/png": { schema: { type: "string", format: "binary" } }, "image/jpeg": { schema: { type: "string", format: "binary" } } } }, 401: r401, 404: r404 },
      },
      delete: {
        tags: ["Imágenes"],
        summary: "Eliminar una imagen",
        responses: { 200: okJson({ type: "object", properties: { ok: { type: "boolean" } } }), 401: r401, 404: r404 },
      },
    },
  },
  components: {
    securitySchemes: cookieAuth,
    schemas: { Error, Perfil, Usuario, DocumentoResumen, Documento },
  },
  // por defecto todo requiere la cookie de sesión; los endpoints públicos la sobrescriben con security: []
  security: [{ cookieAuth: [] }],
};

module.exports = { openapi };
