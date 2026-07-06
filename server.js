// DADM v1.2.1 — Data Architect Document Manager
// API: configuración (catálogo editable) + documentos + imágenes + export Word server-side.
// Único almacenamiento: MongoDB (base DADM). No hay base local.
const fs = require("node:fs");
const path = require("node:path");

// carga variables de entorno desde .env si existe (credenciales fuera del código)
try { process.loadEnvFile(path.join(__dirname, ".env")); } catch { /* sin .env: se usan defaults / env del sistema */ }

const express = require("express");
const crypto = require("node:crypto");
const { Binary } = require("mongodb");
const Ajv = require("ajv/dist/2020");
const swaggerUi = require("swagger-ui-express");
const { renderDocx } = require("./renderer");
const { importarDocx } = require("./importer");
const { openapi } = require("./openapi");
const { conectarMongo, documentos, config, imagenes, usuarios, pingMongo } = require("./db/mongo");
const { hashPassword, verifyPassword, signToken, verifyToken, parseCookies, TTL_S } = require("./auth");

const PORT = process.env.PORT || 8321;
const ROLES = new Set(["architect", "architect_lead"]);

// validadores de schema
const ajv = new Ajv({ strict: false, validateFormats: false });
const validadores = {
  adr: ajv.compile(JSON.parse(fs.readFileSync(path.join(__dirname, "schemas", "adr.schema.json"), "utf8"))),
  rfc: ajv.compile(JSON.parse(fs.readFileSync(path.join(__dirname, "schemas", "rfc.schema.json"), "utf8"))),
};

// seed de configuración desde schemas/catalogos.json si no existe
async function seedConfig() {
  const existe = await config().findOne({ clave: "catalogos" });
  if (!existe) {
    const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "schemas", "catalogos.json"), "utf8"));
    await config().insertOne({ clave: "catalogos", valor: seed });
    console.log("Configuración inicial cargada desde schemas/catalogos.json");
  }
}
const getConfig = async () => (await config().findOne({ clave: "catalogos" })).valor;

// seed del Architect Lead inicial si no hay usuarios
async function seedAdmin() {
  if (await usuarios().countDocuments() > 0) return;
  const u = process.env.ADMIN_USER || "admin";
  const p = process.env.ADMIN_PASS || "admin";
  await usuarios().insertOne({ _id: u, nombre: "Administrador", role: "architect_lead", passwordHash: hashPassword(p), mustChangePassword: true, creado: new Date().toISOString() });
  console.log(`Usuario Architect Lead inicial creado: "${u}" — deberá cambiar la contraseña en el primer login.`);
}

// avisos de configuración insegura al arrancar
function avisarSeguridad() {
  if (!process.env.AUTH_SECRET) console.warn("⚠  AUTH_SECRET no está definido: se usa un secreto por defecto (INSEGURO). Definilo en .env.");
  if ((process.env.ADMIN_PASS || "admin") === "admin") console.warn("⚠  ADMIN_PASS por defecto ('admin'): se fuerza el cambio en el primer login. Cambiala en .env.");
}

const app = express();

// Envuelve automáticamente los handlers async: un rechazo de promesa se deriva a next(err)
// en vez de dejar la request colgada (Express 4 no lo hace solo). Se preservan los
// error-handlers (arity 4) y los valores que no son función (arrays de middleware, etc.).
const asyncSafe = fn => (typeof fn !== "function" || fn.length === 4)
  ? fn
  : (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
["get", "post", "put", "delete", "patch", "use"].forEach(m => {
  const original = app[m].bind(app);
  app[m] = (...args) => original(...args.map(asyncSafe));
});

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- documentación de la API (Swagger / OpenAPI) ----------
// Pública: montada antes de requireAuth. El JSON crudo queda en /api-docs.json.
app.get("/api-docs.json", (req, res) => res.json(openapi));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: "DADM API" }));

// ---------- autenticación ----------
const cookieSesion = (token, maxAge) => `dadm_token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

// resuelve req.user (o null) desde la cookie firmada, para todas las requests
app.use((req, res, next) => {
  const token = parseCookies(req).dadm_token;
  req.user = token ? verifyToken(token) : null;
  next();
});
const requireAuth = (req, res, next) => req.user ? next() : res.status(401).json({ error: "No autenticado" });
const requireAdmin = (req, res, next) =>
  (req.user?.role === "architect_lead") ? next() : res.status(403).json({ error: "Requiere rol Architect Lead" });

// health-check público (monitoreo): pinguea Mongo sin requerir sesión
app.get("/api/health", async (req, res) => {
  try { await pingMongo(); res.json({ ok: true, mongo: "up" }); }
  catch { res.status(503).json({ ok: false, mongo: "down" }); }
});

// rate-limit de login por IP (en memoria): frena fuerza bruta
const loginFails = new Map();
const LOGIN_MAX = 8, LOGIN_WINDOW_MS = 15 * 60 * 1000, LOGIN_BLOCK_MS = 10 * 60 * 1000;
const loginBloqueado = ip => { const e = loginFails.get(ip); return !!(e?.until && e.until > Date.now()); };
function loginFallo(ip) {
  const now = Date.now();
  let e = loginFails.get(ip);
  if (!e || (e.first && now - e.first > LOGIN_WINDOW_MS)) e = { count: 0, first: now };
  e.count++;
  if (e.count >= LOGIN_MAX) e.until = now + LOGIN_BLOCK_MS;
  loginFails.set(ip, e);
}

const perfilDe = u => ({ username: u._id, role: u.role, nombre: u.nombre || u._id, mustChangePassword: !!u.mustChangePassword });

app.post("/api/login", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "?";
  if (loginBloqueado(ip)) return res.status(429).json({ error: "Demasiados intentos fallidos. Esperá unos minutos e intentá de nuevo." });
  const { username, password } = req.body || {};
  const u = username ? await usuarios().findOne({ _id: username }) : null;
  if (!u || !verifyPassword(password || "", u.passwordHash)) { loginFallo(ip); return res.status(401).json({ error: "Usuario o contraseña incorrectos" }); }
  loginFails.delete(ip);
  const perfil = perfilDe(u);
  res.setHeader("Set-Cookie", cookieSesion(signToken(perfil), TTL_S));
  res.json(perfil);
});
app.post("/api/logout", (req, res) => {
  res.setHeader("Set-Cookie", cookieSesion("", 0));
  res.json({ ok: true });
});
app.get("/api/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "No autenticado" });
  res.json({ username: req.user.username, role: req.user.role, nombre: req.user.nombre, mustChangePassword: !!req.user.mustChangePassword });
});

// de acá en más, toda la API requiere sesión
app.use("/api", requireAuth);

// cambio de la propia contraseña (cualquier usuario autenticado)
app.post("/api/password", async (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!nueva || String(nueva).length < 6) return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres" });
  const u = await usuarios().findOne({ _id: req.user.username });
  if (!u || !verifyPassword(actual || "", u.passwordHash)) return res.status(401).json({ error: "La contraseña actual no es correcta" });
  await usuarios().updateOne({ _id: u._id }, { $set: { passwordHash: hashPassword(nueva), mustChangePassword: false } });
  const perfil = { ...perfilDe(u), mustChangePassword: false };
  res.setHeader("Set-Cookie", cookieSesion(signToken(perfil), TTL_S)); // token fresco sin el flag
  res.json({ ok: true });
});

// ---------- usuarios (solo Architect Lead) ----------
app.get("/api/usuarios", requireAdmin, async (req, res) => {
  const us = await usuarios().find({}, { projection: { passwordHash: 0 } }).sort({ _id: 1 }).toArray();
  res.json(us.map(u => ({ username: u._id, nombre: u.nombre, role: u.role })));
});
app.post("/api/usuarios", requireAdmin, async (req, res) => {
  const { username, nombre, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Usuario y contraseña son obligatorios" });
  if (!ROLES.has(role)) return res.status(400).json({ error: "Rol inválido" });
  if (await usuarios().findOne({ _id: username })) return res.status(409).json({ error: "Ya existe un usuario con ese nombre" });
  await usuarios().insertOne({ _id: username, nombre: nombre || "", role, passwordHash: hashPassword(password), mustChangePassword: true, creado: new Date().toISOString() });
  res.status(201).json({ ok: true });
});
app.put("/api/usuarios/:username", requireAdmin, async (req, res) => {
  const u = await usuarios().findOne({ _id: req.params.username });
  if (!u) return res.status(404).json({ error: "No existe" });
  const { nombre, role, password } = req.body || {};
  const set = {};
  if (nombre !== undefined) set.nombre = nombre;
  if (password) { set.passwordHash = hashPassword(password); set.mustChangePassword = true; }
  if (role !== undefined) {
    if (!ROLES.has(role)) return res.status(400).json({ error: "Rol inválido" });
    if (u.role === "architect_lead" && role !== "architect_lead" && await usuarios().countDocuments({ role: "architect_lead" }) <= 1)
      return res.status(409).json({ error: "Debe quedar al menos un Architect Lead" });
    set.role = role;
  }
  await usuarios().updateOne({ _id: req.params.username }, { $set: set });
  res.json({ ok: true });
});
app.delete("/api/usuarios/:username", requireAdmin, async (req, res) => {
  if (req.params.username === req.user.username) return res.status(409).json({ error: "No podés eliminar tu propio usuario" });
  const u = await usuarios().findOne({ _id: req.params.username });
  if (!u) return res.status(404).json({ error: "No existe" });
  if (u.role === "architect_lead" && await usuarios().countDocuments({ role: "architect_lead" }) <= 1)
    return res.status(409).json({ error: "Debe quedar al menos un Architect Lead" });
  await usuarios().deleteOne({ _id: req.params.username });
  res.json({ ok: true });
});

// ---------- configuración ----------
app.get("/api/config", async (req, res) => res.json(await getConfig()));
app.put("/api/config", requireAdmin, async (req, res) => {
  const c = req.body;
  if (!c?.secciones_adr || !c.secciones_rfc) return res.status(400).json({ error: "Configuración inválida" });
  await config().updateOne({ clave: "catalogos" }, { $set: { valor: c } }, { upsert: true });
  res.json({ ok: true });
});

// ---------- documentos ----------
app.get("/api/documentos", async (req, res) => {
  const docs = await documentos().find({}).sort({ _id: 1 }).toArray();
  res.json(docs.map(d => ({ id: d._id, tipo: d.tipo, titulo: d.titulo, estado: d.estado, version: d.version, actualizado: d.actualizado })));
});

// correlativo: máximo sufijo numérico existente + 1 (pisos configurables para convivir con los docs históricos)
async function nextId(tipo) {
  const cfg = await getConfig();
  const piso = (cfg.secuencia_inicial || { adr: 9, rfc: 7 })[tipo];
  const rows = await documentos().find({ tipo }, { projection: { _id: 1 } }).toArray();
  const max = rows.reduce((m, r) => Math.max(m, Number.parseInt(r._id.split("-")[1], 10) || 0), piso - 1);
  return tipo === "adr" ? `ADR-${String(max + 1).padStart(3, "0")}` : `RFC-${String(max + 1).padStart(4, "0")}`;
}

// Inserta un documento nuevo con correlativo, reintentando ante colisión de _id
// (dos creaciones simultáneas podrían calcular el mismo id): recomputa y reintenta.
// `construir(id)` devuelve el documento a insertar (incluido `_id`). Devuelve el id asignado.
async function crearDocumentoNuevo(tipo, construir) {
  for (let intento = 0; ; intento++) {
    const id = await nextId(tipo);
    try {
      await documentos().insertOne(construir(id));
      return id;
    } catch (e) {
      if (e?.code === 11000 && intento < 4) continue; // duplicate key → reintenta
      throw e;
    }
  }
}

app.post("/api/documentos", async (req, res) => {
  const { tipo } = req.body;
  if (!["adr", "rfc"].includes(tipo)) return res.status(400).json({ error: "tipo debe ser adr o rfc" });
  const hoy = new Date().toISOString().slice(0, 10);
  let esqueleto;
  await crearDocumentoNuevo(tipo, (id) => {
    esqueleto = { id, tipo, titulo: "", estado: "borrador", autores: [], fecha_creacion: hoy, version: "0.1",
      historial: [{ version: "0.1", fecha: hoy, autor: req.user.nombre || req.user.username, cambio: "Creación del documento" }],
      cuerpo: [] };
    return { _id: id, tipo, ...esqueleto, creado: hoy, actualizado: hoy };
  });
  res.status(201).json(esqueleto);
});

// importar un .docx existente como borrador editable (best-effort)
app.post("/api/importar", async (req, res) => {
  const { tipo, data } = req.body || {};
  if (!["adr", "rfc"].includes(tipo)) return res.status(400).json({ error: "tipo debe ser adr o rfc" });
  if (!data) return res.status(400).json({ error: "Falta 'data' (.docx en base64)" });
  const base64 = data.includes(",") ? data.split(",")[1] : data;
  const buffer = Buffer.from(base64, "base64");
  try {
    const cfg = await getConfig();
    // persiste cada imagen embebida que sea PNG/JPG; ignora formatos no soportados (EMF/WMF)
    const onImage = async (b64) => {
      const buf = Buffer.from(b64, "base64");
      const mime = tipoImagen(buf);
      if (!mime) return null;
      const imgId = crypto.randomUUID();
      await imagenes().insertOne({ _id: imgId, data: new Binary(buf), mime, creado: new Date().toISOString() });
      return imgId;
    };
    const { titulo, cuerpo } = await importarDocx(buffer, tipo, cfg, onImage);
    const hoy = new Date().toISOString().slice(0, 10);
    const id = await crearDocumentoNuevo(tipo, (id) => {
      const docu = { id, tipo, titulo: titulo || "", estado: "borrador", autores: [], fecha_creacion: hoy, version: "0.1",
        historial: [{ version: "0.1", fecha: hoy, autor: req.user.nombre || req.user.username, cambio: "Importado desde .docx" }],
        cuerpo };
      return { _id: id, ...docu, creado: hoy, actualizado: hoy };
    });
    res.status(201).json({ id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo importar el .docx", detalle: e.message });
  }
});

app.get("/api/documentos/:id", async (req, res) => {
  const row = await documentos().findOne({ _id: req.params.id });
  if (!row) return res.status(404).json({ error: "No existe" });
  res.json(sinCamposInternos(row));
});

// el documento guardado es el JSON del schema; se le agregan _id/creado/actualizado para Mongo
function sinCamposInternos(row) {
  const { _id, creado, actualizado, ...doc } = row;
  return doc;
}

app.put("/api/documentos/:id", async (req, res) => {
  const row = await documentos().findOne({ _id: req.params.id }, { projection: { tipo: 1, creado: 1 } });
  if (!row) return res.status(404).json({ error: "No existe" });
  const docu = req.body;
  if (docu.id !== req.params.id || docu.tipo !== row.tipo) return res.status(400).json({ error: "id/tipo no coinciden" });

  // validación de schema — el borrador puede estar incompleto en ficha, pero la estructura debe ser válida
  const valido = validadores[row.tipo](docu);
  if (!valido && docu.estado !== "borrador") {
    return res.status(422).json({ error: "El documento no valida contra el schema", detalles: validadores[row.tipo].errors.slice(0, 5) });
  }

  // secciones obligatorias según configuración vigente: exigidas al salir de borrador
  if (docu.estado !== "borrador") {
    const cfg = await getConfig();
    const secciones = row.tipo === "adr" ? cfg.secciones_adr : cfg.secciones_rfc;
    const faltan = secciones.filter(d => d.obligatoria && !(
      d.cfg ? docu.cuerpo.some(s => s.titulo === d.etiqueta)
            : docu.cuerpo.some(s => s.codigo === d.codigo)
    )).map(d => d.etiqueta);
    if (faltan.length) return res.status(422).json({ error: "Faltan secciones obligatorias según la configuración vigente", faltan });
  }

  docu.fecha_actualizacion = new Date().toISOString().slice(0, 10);
  await documentos().replaceOne({ _id: req.params.id },
    { _id: req.params.id, ...docu, creado: row.creado, actualizado: docu.fecha_actualizacion });
  res.json({ ok: true, fecha_actualizacion: docu.fecha_actualizacion });
});

// ids de imágenes referenciadas por un documento (bloques tipo "imagen")
function idsImagenes(docu) {
  const ids = [];
  const rec = bs => (bs || []).forEach(b => { if (b.tipo === "imagen" && b.recurso) ids.push(b.recurso); });
  (docu.cuerpo || []).forEach(s => { rec(s.bloques); (s.subsecciones || []).forEach(u => rec(u.bloques)); });
  return ids;
}

app.delete("/api/documentos/:id", requireAdmin, async (req, res) => {
  const row = await documentos().findOne({ _id: req.params.id });
  if (!row) return res.status(404).json({ error: "No existe" });
  if (row.estado !== "borrador") return res.status(409).json({ error: "Solo se pueden eliminar borradores" });
  const ids = idsImagenes(row);
  if (ids.length) await imagenes().deleteMany({ _id: { $in: ids } }); // cascada: borra sus imágenes
  await documentos().deleteOne({ _id: req.params.id });
  res.json({ ok: true, imagenesEliminadas: ids.length });
});

// ---------- imágenes (subidas como PNG/JPG, referenciadas desde bloques tipo "imagen") ----------
function tipoImagen(buf) {
  if (buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (buf.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  return null;
}

app.post("/api/imagenes", async (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: "Falta 'data' (imagen PNG/JPG en base64)" });
  const base64 = data.includes(",") ? data.split(",")[1] : data;
  const buf = Buffer.from(base64, "base64");
  const mime = tipoImagen(buf);
  if (!mime) return res.status(400).json({ error: "El archivo debe ser PNG o JPG" });
  const id = crypto.randomUUID();
  await imagenes().insertOne({ _id: id, data: new Binary(buf), mime, creado: new Date().toISOString() });
  res.status(201).json({ id });
});

app.get("/api/imagenes/:id", async (req, res) => {
  const img = await imagenes().findOne({ _id: req.params.id });
  if (!img) return res.status(404).end();
  res.setHeader("Content-Type", img.mime || "image/png");
  res.send(img.data.buffer);
});

app.delete("/api/imagenes/:id", async (req, res) => {
  const r = await imagenes().deleteOne({ _id: req.params.id });
  if (!r.deletedCount) return res.status(404).json({ error: "No existe" });
  res.json({ ok: true });
});

// GC de imágenes huérfanas: no referenciadas por ningún documento y con >1 h de antigüedad
app.post("/api/imagenes/gc", requireAdmin, async (req, res) => {
  const docs = await documentos().find({}, { projection: { cuerpo: 1 } }).toArray();
  const usadas = new Set();
  docs.forEach(d => idsImagenes(d).forEach(id => usadas.add(id)));
  const hace1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const huerfanas = await imagenes().find({ _id: { $nin: [...usadas] }, creado: { $lt: hace1h } }, { projection: { _id: 1 } }).toArray();
  const ids = huerfanas.map(x => x._id);
  if (ids.length) await imagenes().deleteMany({ _id: { $in: ids } });
  res.json({ eliminadas: ids.length });
});

// ---------- export Word ----------
// Adjunta el binario de cada imagen referenciada (bloque tipo "imagen") para que el .docx la embeba como imagen real.
async function adjuntarImagenes(docu) {
  const bloques = [];
  const recolectar = bs => (bs || []).forEach(b => { if (b.tipo === "imagen" && b.recurso) bloques.push(b); });
  (docu.cuerpo || []).forEach(s => { recolectar(s.bloques); (s.subsecciones || []).forEach(u => recolectar(u.bloques)); });
  for (const b of bloques) {
    const img = await imagenes().findOne({ _id: b.recurso });
    if (img) { b._imgBuffer = img.data.buffer; b._imgMime = img.mime || "image/png"; }
  }
}

app.get("/api/documentos/:id/export.docx", async (req, res) => {
  const row = await documentos().findOne({ _id: req.params.id });
  if (!row) return res.status(404).json({ error: "No existe" });
  try {
    const docu = sinCamposInternos(row);
    await adjuntarImagenes(docu);
    const buf = await renderDocx(docu, await getConfig());
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${req.params.id}.docx"`);
    res.send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error generando el documento", detalle: e.message });
  }
});

// Manejador de errores global: los rechazos async capturados por asyncSafe terminan acá,
// devolviendo 500 en vez de dejar la request colgada.
app.use((err, req, res, next) => {
  console.error("Error no controlado:", err);
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;               // respeta 4xx (ej: JSON malformado = 400)
  res.status(status).json({ error: status < 500 ? err.message : "Error interno del servidor" });
});

conectarMongo()
  .then(seedConfig)
  .then(seedAdmin)
  .then(() => { avisarSeguridad(); app.listen(PORT, () => console.log(`DADM v1.2.1 escuchando en http://localhost:${PORT}`)); })
  .catch(err => { console.error("No se pudo conectar a MongoDB:", err.message); process.exit(1); });
