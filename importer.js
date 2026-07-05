// DADM — importación best-effort de .docx al modelo de documento.
// mammoth convierte el .docx a HTML semántico; acá lo mapeamos a secciones/bloques de DADM.
// Es una conversión aproximada: la ficha y los tipos finos (callouts, tablas tipadas, código)
// los completa el usuario en el editor.
const mammoth = require("mammoth");
const { parse } = require("node-html-parser");

// normaliza para comparar títulos: sin acentos, minúsculas, sin numeración de encabezado
function norm(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/^\s*\d+(\.\d+)*[.)]?\s*/, "").trim();
}
function limpiarTitulo(s) {
  return (s || "").replace(/^\s*\d+(\.\d+)*[.)]?\s*/, "").replace(/\s+/g, " ").trim();
}
function texto(el) {
  return (el.text || "").replace(/\s+/g, " ").trim();
}

// mapea un encabezado a una sección del catálogo (por etiqueta) o a una sección personalizada
function matchSeccion(titulo, tipo, catalogos) {
  const secs = tipo === "adr" ? catalogos.secciones_adr : catalogos.secciones_rfc;
  const t = norm(titulo);
  const found = secs.find(s => s.codigo !== "custom" && s.codigo !== "anexo" && norm(s.etiqueta) === t);
  return found ? { codigo: found.codigo, titulo: found.etiqueta } : { codigo: "custom", titulo: limpiarTitulo(titulo) };
}

function tablaLibre(tableEl) {
  const rows = tableEl.querySelectorAll("tr");
  if (!rows.length) return null;
  const grid = rows.map(tr => tr.querySelectorAll("th,td").map(td => texto(td)));
  const ncol = Math.max(...grid.map(r => r.length), 1);
  const pad = r => { const c = r.slice(); while (c.length < ncol) c.push(""); return c; };
  const encabezados = pad(grid[0]);
  const filas = grid.slice(1).map(pad);
  return { tipo: "tabla_libre", encabezados, filas: filas.length ? filas : [new Array(ncol).fill("")] };
}

// buffer(.docx), tipo, catalogos, onImage(base64,contentType)->Promise<id|null>
async function importarDocx(buffer, tipo, catalogos, onImage) {
  const capturadas = [];
  const result = await mammoth.convertToHtml({ buffer }, {
    convertImage: mammoth.images.imgElement(async (image) => {
      const b64 = await image.read("base64");
      const idx = capturadas.length;
      capturadas.push({ b64, contentType: image.contentType });
      return { src: `__DADM_IMG_${idx}__` };
    }),
  });
  const imgIds = [];
  for (const img of capturadas) imgIds.push(await onImage(img.b64, img.contentType));

  const root = parse(result.value);
  const blocks = root.childNodes.filter(n => n.nodeType === 1);

  let titulo = "";
  const cuerpo = [];
  let sec = null, sub = null, buf = [];

  const ensureSec = () => { if (!sec) { sec = { codigo: "custom", titulo: "Contenido importado", bloques: [] }; cuerpo.push(sec); } return sec; };
  const target = () => (sub ? sub.bloques : ensureSec().bloques);
  const flush = () => { if (buf.length) { target().push({ tipo: "texto", contenido: buf.join("\n\n") }); buf = []; } };

  blocks.forEach((el, i) => {
    const tag = (el.rawTagName || "").toLowerCase();
    if (tag === "h1") {
      const txt = texto(el);
      const m = matchSeccion(txt, tipo, catalogos);
      // primer encabezado que no coincide con una sección => título del documento
      if (i === 0 && !titulo && !cuerpo.length && m.codigo === "custom") { titulo = limpiarTitulo(txt); return; }
      flush(); sub = null;
      sec = { codigo: m.codigo, titulo: m.titulo, bloques: [] };
      cuerpo.push(sec);
    } else if (tag === "h2") {
      flush(); ensureSec();
      sub = { titulo: limpiarTitulo(texto(el)) || "Subsección", bloques: [] };
      sec.subsecciones = sec.subsecciones || [];
      sec.subsecciones.push(sub);
    } else if (tag === "p") {
      const imgs = el.querySelectorAll("img");
      if (imgs.length) {
        flush();
        imgs.forEach(im => {
          const mm = (im.getAttribute("src") || "").match(/__DADM_IMG_(\d+)__/);
          const rid = mm ? imgIds[+mm[1]] : null;
          if (rid) target().push({ tipo: "imagen", recurso: rid, epigrafe: "" });
        });
        const rest = texto(el);
        if (rest) buf.push(rest);
      } else {
        const t = texto(el);
        if (t) buf.push(t);
      }
    } else if (tag === "ul" || tag === "ol") {
      const items = el.querySelectorAll("li").map(li => "• " + texto(li)).filter(x => x !== "• ");
      if (items.length) buf.push(items.join("\n"));
    } else if (tag === "table") {
      flush();
      const tbl = tablaLibre(el);
      if (tbl) target().push(tbl);
    } else if (/^h[3-6]$/.test(tag)) {
      const t = texto(el);
      if (t) buf.push(t);
    }
  });
  flush();

  // el schema exige al menos un bloque por sección/subsección
  cuerpo.forEach(s => {
    (s.subsecciones || []).forEach(u => { if (!u.bloques.length) u.bloques.push({ tipo: "texto", contenido: "" }); });
    if (!s.bloques.length && !(s.subsecciones || []).length) s.bloques.push({ tipo: "texto", contenido: "" });
  });
  if (!cuerpo.length) cuerpo.push({ codigo: "custom", titulo: "Contenido importado", bloques: [{ tipo: "texto", contenido: "" }] });

  return { titulo, cuerpo, imagenes: imgIds.filter(Boolean).length };
}

module.exports = { importarDocx };
