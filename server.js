// DADM v1.0.0 — Data Architect Document Manager
// API: configuración (catálogo editable) + documentos + imágenes + export Word server-side.
// Único almacenamiento: MongoDB (base DADM). No hay base local.
const fs = require("fs");
const path = require("path");

// carga variables de entorno desde .env si existe (credenciales fuera del código)
try { process.loadEnvFile(path.join(__dirname, ".env")); } catch { /* sin .env: se usan defaults / env del sistema */ }

const express = require("express");
const crypto = require("crypto");
const { Binary } = require("mongodb");
const Ajv = require("ajv/dist/2020");
const { renderDocx } = require("./renderer");
const { conectarMongo, documentos, config, imagenes } = require("./db/mongo");

const PORT = process.env.PORT || 8321;

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

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- configuración ----------
app.get("/api/config", async (req, res) => res.json(await getConfig()));
app.put("/api/config", async (req, res) => {
  const c = req.body;
  if (!c || !c.secciones_adr || !c.secciones_rfc) return res.status(400).json({ error: "Configuración inválida" });
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
  const max = rows.reduce((m, r) => Math.max(m, parseInt(r._id.split("-")[1], 10) || 0), piso - 1);
  return tipo === "adr" ? `ADR-${String(max + 1).padStart(3, "0")}` : `RFC-${String(max + 1).padStart(4, "0")}`;
}

app.post("/api/documentos", async (req, res) => {
  const { tipo } = req.body;
  if (!["adr", "rfc"].includes(tipo)) return res.status(400).json({ error: "tipo debe ser adr o rfc" });
  const id = await nextId(tipo);
  const hoy = new Date().toISOString().slice(0, 10);
  const esqueleto = { id, tipo, titulo: "", estado: "borrador", autores: [], fecha_creacion: hoy, version: "0.1",
    historial: [{ version: "0.1", fecha: hoy, autor: "dadm", cambio: "Creación del documento" }],
    cuerpo: [] };
  await documentos().insertOne({ _id: id, tipo, ...esqueleto, creado: hoy, actualizado: hoy });
  res.status(201).json(esqueleto);
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

app.delete("/api/documentos/:id", async (req, res) => {
  const row = await documentos().findOne({ _id: req.params.id }, { projection: { estado: 1 } });
  if (!row) return res.status(404).json({ error: "No existe" });
  if (row.estado !== "borrador") return res.status(409).json({ error: "Solo se pueden eliminar borradores" });
  await documentos().deleteOne({ _id: req.params.id });
  res.json({ ok: true });
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

conectarMongo()
  .then(seedConfig)
  .then(() => app.listen(PORT, () => console.log(`DADM v1.0.0 escuchando en http://localhost:${PORT}`)))
  .catch(err => { console.error("No se pudo conectar a MongoDB:", err.message); process.exit(1); });
