// DADM v0.1 — Data Architect Document Manager
// API: configuración (catálogo editable) + documentos + export Word server-side
const express = require("express");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const Ajv = require("ajv/dist/2020");
const { renderDocx } = require("./renderer");

const PORT = process.env.PORT || 8321;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "dadm.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS documentos (
    id TEXT PRIMARY KEY, tipo TEXT NOT NULL, json TEXT NOT NULL,
    creado TEXT NOT NULL, actualizado TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, json TEXT NOT NULL);
`);

// seed de configuración desde schemas/catalogos.json si no existe
const getConfigRow = () => db.prepare("SELECT json FROM config WHERE clave='catalogos'").get();
if (!getConfigRow()) {
  const seed = fs.readFileSync(path.join(__dirname, "schemas", "catalogos.json"), "utf8");
  db.prepare("INSERT INTO config (clave, json) VALUES ('catalogos', ?)").run(seed);
  console.log("Configuración inicial cargada desde schemas/catalogos.json");
}
const getConfig = () => JSON.parse(getConfigRow().json);

// validadores de schema
const ajv = new Ajv({ strict: false, validateFormats: false });
const validadores = {
  adr: ajv.compile(JSON.parse(fs.readFileSync(path.join(__dirname, "schemas", "adr.schema.json"), "utf8"))),
  rfc: ajv.compile(JSON.parse(fs.readFileSync(path.join(__dirname, "schemas", "rfc.schema.json"), "utf8"))),
};

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- configuración ----------
app.get("/api/config", (req, res) => res.json(getConfig()));
app.put("/api/config", (req, res) => {
  const c = req.body;
  if (!c || !c.secciones_adr || !c.secciones_rfc) return res.status(400).json({ error: "Configuración inválida" });
  db.prepare("UPDATE config SET json=? WHERE clave='catalogos'").run(JSON.stringify(c));
  res.json({ ok: true });
});

// ---------- documentos ----------
app.get("/api/documentos", (req, res) => {
  const rows = db.prepare("SELECT id, tipo, json, actualizado FROM documentos ORDER BY id").all();
  res.json(rows.map(r => {
    const j = JSON.parse(r.json);
    return { id: r.id, tipo: r.tipo, titulo: j.titulo, estado: j.estado, version: j.version, actualizado: r.actualizado };
  }));
});

// correlativo: máximo sufijo numérico existente + 1 (pisos configurables para convivir con los docs históricos)
function nextId(tipo) {
  const cfg = getConfig();
  const piso = (cfg.secuencia_inicial || { adr: 9, rfc: 7 })[tipo];
  const rows = db.prepare("SELECT id FROM documentos WHERE tipo=?").all(tipo);
  const max = rows.reduce((m, r) => Math.max(m, parseInt(r.id.split("-")[1], 10) || 0), piso - 1);
  return tipo === "adr" ? `ADR-${String(max + 1).padStart(3, "0")}` : `RFC-${String(max + 1).padStart(4, "0")}`;
}

app.post("/api/documentos", (req, res) => {
  const { tipo } = req.body;
  if (!["adr", "rfc"].includes(tipo)) return res.status(400).json({ error: "tipo debe ser adr o rfc" });
  const id = nextId(tipo);
  const hoy = new Date().toISOString().slice(0, 10);
  const esqueleto = { id, tipo, titulo: "", estado: "borrador", autores: [], fecha_creacion: hoy, version: "0.1",
    historial: [{ version: "0.1", fecha: hoy, autor: "dadm", cambio: "Creación del documento" }],
    cuerpo: [] };
  db.prepare("INSERT INTO documentos (id, tipo, json, creado, actualizado) VALUES (?,?,?,?,?)")
    .run(id, tipo, JSON.stringify(esqueleto), hoy, hoy);
  res.status(201).json(esqueleto);
});

app.get("/api/documentos/:id", (req, res) => {
  const row = db.prepare("SELECT json FROM documentos WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "No existe" });
  res.json(JSON.parse(row.json));
});

app.put("/api/documentos/:id", (req, res) => {
  const row = db.prepare("SELECT tipo FROM documentos WHERE id=?").get(req.params.id);
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
    const cfg = getConfig();
    const secciones = row.tipo === "adr" ? cfg.secciones_adr : cfg.secciones_rfc;
    const faltan = secciones.filter(d => d.obligatoria && !(
      d.cfg ? docu.cuerpo.some(s => s.titulo === d.etiqueta)
            : docu.cuerpo.some(s => s.codigo === d.codigo)
    )).map(d => d.etiqueta);
    if (faltan.length) return res.status(422).json({ error: "Faltan secciones obligatorias según la configuración vigente", faltan });
  }

  docu.fecha_actualizacion = new Date().toISOString().slice(0, 10);
  db.prepare("UPDATE documentos SET json=?, actualizado=? WHERE id=?")
    .run(JSON.stringify(docu), docu.fecha_actualizacion, req.params.id);
  res.json({ ok: true, fecha_actualizacion: docu.fecha_actualizacion });
});

app.delete("/api/documentos/:id", (req, res) => {
  const row = db.prepare("SELECT json FROM documentos WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "No existe" });
  if (JSON.parse(row.json).estado !== "borrador") return res.status(409).json({ error: "Solo se pueden eliminar borradores" });
  db.prepare("DELETE FROM documentos WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- export Word ----------
app.get("/api/documentos/:id/export.docx", async (req, res) => {
  const row = db.prepare("SELECT json FROM documentos WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "No existe" });
  try {
    const buf = await renderDocx(JSON.parse(row.json), getConfig());
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${req.params.id}.docx"`);
    res.send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error generando el documento", detalle: e.message });
  }
});

app.listen(PORT, () => console.log(`DADM v0.1 escuchando en http://localhost:${PORT}`));
