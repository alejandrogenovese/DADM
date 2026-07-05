// DADM — Renderer JSON → DOCX (módulo)
// renderDocx(doc, CATALOGOS) → Promise<Buffer>
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageNumber, ImageRun,
} = require("docx");

// Dimensiones de una imagen PNG (chunk IHDR) o JPEG (marcador SOF).
function dimensionesImagen(buf, mime) {
  if (mime === "image/png") return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  let o = 2;
  while (o < buf.length) {
    if (buf[o] !== 0xFF) { o++; continue; }
    const m = buf[o + 1];
    if (m >= 0xC0 && m <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(m)) {
      return { height: buf.readUInt16BE(o + 5), width: buf.readUInt16BE(o + 7) };
    }
    o += 2 + buf.readUInt16BE(o + 2);
  }
  return { width: 600, height: 400 };
}

const NARANJA = "E86A10", GRIS = "7F7F7F", AZUL_FILL = "DEEBF7",
      GRIS_FILL = "F2F2F2", NEGRO = "262626", ROJO_FILL = "FBE4E0", ROJO = "9C3325", CONTENT = 9026;
const border = { style: BorderStyle.SINGLE, size: 1, color: "BFBFBF" };
const borders = { top: border, bottom: border, left: border, right: border };
const margins = { top: 80, bottom: 80, left: 120, right: 120 };

const t = (text, o = {}) => new TextRun({ text, ...o });
const p = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [t(children)], ...o });
const vacio = () => p([t("")]);

function renderDocx(doc, CATALOGOS) {
  const etiqueta = (lista, codigo) => { const x = (CATALOGOS[lista] || []).find(e => e.codigo === codigo); return x ? x.etiqueta : codigo; };
  const secCat = doc.tipo === "adr" ? CATALOGOS.secciones_adr : CATALOGOS.secciones_rfc;
  const secEtiqueta = (s) => (s.codigo === "custom" || s.codigo === "anexo") ? s.titulo : ((secCat.find(d => d.codigo === s.codigo) || {}).etiqueta || s.titulo || s.codigo);

  function bloqueTexto(contenido, size = 22) {
    const out = [];
    contenido.split(/\n\n/).forEach(parr => {
      const lineas = parr.split("\n");
      let buffer = [];
      const flush = () => { if (buffer.length) { out.push(p([t(buffer.join(" "), { size })], { spacing: { after: 120 } })); buffer = []; } };
      lineas.forEach(l => {
        if (l.trimStart().startsWith("• ")) {
          flush();
          out.push(new Paragraph({ numbering: { reference: "bullets", level: 0 },
            children: [t(l.trimStart().slice(2), { size })], spacing: { after: 60 } }));
        } else buffer.push(l);
      });
      flush();
    });
    return out;
  }

  const caja = (children, fill) => new Table({
    width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [CONTENT],
    rows: [new TableRow({ children: [new TableCell({
      borders, margins, width: { size: CONTENT, type: WidthType.DXA },
      shading: { fill, type: ShadingType.CLEAR }, children })] })],
  });

  function bloqueCallout(b) {
    const estilos = {
      decision:    { fill: "FDEADA", color: "7A4510", pref: "DECISIÓN  /  " },
      advertencia: { fill: ROJO_FILL, color: ROJO,    pref: "⚠  " },
      cita:        { fill: AZUL_FILL, color: "1F4E79", pref: "" },
      info:        { fill: AZUL_FILL, color: "1F4E79", pref: "" },
    };
    const e = estilos[b.estilo || "info"];
    return [caja([p([t(e.pref, { bold: true, color: e.color, size: 20 }), t(b.contenido, { color: e.color, size: 20, italics: b.estilo === "cita" })])], e.fill), vacio()];
  }

  function tablaDocx(cols, filas, headerFill = GRIS_FILL) {
    const w = cols.map(() => Math.floor(CONTENT / cols.length));
    w[w.length - 1] += CONTENT - w.reduce((a, b) => a + b, 0);
    return new Table({
      width: { size: CONTENT, type: WidthType.DXA }, columnWidths: w,
      rows: [
        new TableRow({ tableHeader: true, children: cols.map((c, i) => new TableCell({
          borders, margins, width: { size: w[i], type: WidthType.DXA },
          shading: { fill: headerFill, type: ShadingType.CLEAR },
          children: [p([t(String(c), { bold: true, size: 18 })])] })) }),
        ...filas.map(f => new TableRow({ children: f.map((c, i) => new TableCell({
          borders, margins, width: { size: w[i], type: WidthType.DXA },
          children: [p([t(String(c ?? ""), { size: 18 })])] })) })),
      ],
    });
  }

  function renderBloque(b) {
    if (b.tipo === "texto") return bloqueTexto(b.contenido);
    if (b.tipo === "callout") return bloqueCallout(b);
    if (b.tipo === "codigo") return [caja([p([t(b.contenido, { font: "Consolas", size: 18 })])], "F5F5F5"), vacio()];
    if (b.tipo === "imagen") {
      if (b._imgBuffer) {
        const dims = dimensionesImagen(b._imgBuffer, b._imgMime);
        const maxAncho = 550;
        const escala = Math.min(1, maxAncho / dims.width);
        const out = [p([new ImageRun({ data: b._imgBuffer, type: b._imgMime === "image/png" ? "png" : "jpg", transformation: {
          width: Math.round(dims.width * escala), height: Math.round(dims.height * escala),
        } })], { alignment: AlignmentType.CENTER })];
        if (b.epigrafe) out.push(p([t(b.epigrafe, { color: GRIS, size: 18, italics: true })], { alignment: AlignmentType.CENTER }));
        out.push(vacio());
        return out;
      }
      return [caja([p([t(`🖼 Imagen no disponible${b.epigrafe ? " — " + b.epigrafe : ""}`, { color: GRIS, size: 18, italics: true })])], "FAFAF8"), vacio()];
    }
    if (b.tipo === "tabla_libre") return [tablaDocx(b.encabezados, b.filas), vacio()];
    if (b.tipo === "tabla_tipada") {
      const cols = Object.keys(b.filas[0] || {});
      return [tablaDocx(cols, b.filas.map(f => cols.map(c => f[c]))), vacio()];
    }
    return [];
  }

  const etiqueta_ap = (d) => ({ pendiente: "Pendiente", aprobado: "Aprobado", rechazado: "Rechazado" }[d] || d);
  const ch = [];
  const esAdr = doc.tipo === "adr";

  ch.push(new Paragraph({ spacing: { after: 60 },
    children: [t("BANCO GALICIA   ·   DATA & AI   ·   ARQUITECTURA DATA", { color: GRIS, size: 18 })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NARANJA, space: 4 } } }));
  ch.push(new Paragraph({ spacing: { before: 240, after: 40 },
    children: [t(esAdr ? "ARCHITECTURE DECISION RECORD" : "REQUEST FOR COMMENTS", { bold: true, color: NARANJA, size: 26 })] }));
  ch.push(new Paragraph({ spacing: { after: 40 }, children: [t(doc.id, { bold: true, size: 44, color: NEGRO })] }));
  ch.push(new Paragraph({ spacing: { after: 20 }, children: [t(doc.titulo, { bold: true, size: 30, color: NEGRO })] }));
  if (doc.descripcion_corta) ch.push(new Paragraph({ spacing: { after: 200 }, children: [t(doc.descripcion_corta, { size: 20, color: GRIS })] }));

  const estadoEt = etiqueta(esAdr ? "estados_adr" : "estados_rfc", doc.estado).toUpperCase();
  ch.push(caja([p([t(`ESTADO:  ${estadoEt}`, { bold: true, color: NARANJA, size: 22 })], { alignment: AlignmentType.CENTER })], "FDEADA"));
  ch.push(vacio());

  const LBL = 2700, VAL = CONTENT - LBL;
  const fRow = (label, valor) => new TableRow({ children: [
    new TableCell({ borders, margins, width: { size: LBL, type: WidthType.DXA },
      shading: { fill: GRIS_FILL, type: ShadingType.CLEAR }, children: [p([t(label, { bold: true, size: 20 })])] }),
    new TableCell({ borders, margins, width: { size: VAL, type: WidthType.DXA }, children: [p([t(valor || "—", { size: 20 })])] }),
  ]});
  const persona = (x) => [x.nombre, x.rol, x.equipo].filter(Boolean).join(" — ");
  const filasFicha = [
    fRow("Identificador", doc.id),
    fRow("Título", doc.titulo),
    fRow("Estado", etiqueta(esAdr ? "estados_adr" : "estados_rfc", doc.estado)),
  ];
  if (esAdr) {
    filasFicha.push(fRow("Ámbito", etiqueta("ambitos", doc.ambito)));
    filasFicha.push(fRow("Autor(es)", doc.autores.map(persona).join(" · ")));
    filasFicha.push(fRow("Decisores / Aprobado por", (doc.decisores || []).map(persona).join(" · ")));
  } else {
    filasFicha.push(fRow("Autor(es)", doc.autores.map(persona).join(" · ")));
    filasFicha.push(fRow("Sponsor / Reviewer principal", persona(doc.sponsor || {})));
    if (doc.ventana_comentarios) filasFicha.push(fRow("Ventana de comentarios", `${doc.ventana_comentarios.desde} — ${doc.ventana_comentarios.hasta}`));
    if (doc.fecha_esperada_decision) filasFicha.push(fRow("Fecha esperada de decisión", doc.fecha_esperada_decision));
    if (doc.stakeholders) filasFicha.push(fRow("Stakeholders convocados", doc.stakeholders.map(s => `${s.nombre} (${s.tipo_revision})`).join(" · ")));
  }
  filasFicha.push(fRow("Fecha de creación", doc.fecha_creacion));
  if (doc.fecha_actualizacion) filasFicha.push(fRow("Última actualización", doc.fecha_actualizacion));
  if (doc.version) filasFicha.push(fRow("Versión", "v" + doc.version));
  if (doc.nota_alcance) filasFicha.push(fRow("Nota de alcance", doc.nota_alcance));
  (doc.relaciones || []).forEach(r => filasFicha.push(fRow(etiqueta("tipos_relacion", r.tipo), r.destino + (r.nota ? " — " + r.nota : ""))));
  if (doc.tags) filasFicha.push(fRow("Tags", doc.tags.join(", ")));
  ch.push(new Table({ width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [LBL, VAL], rows: filasFicha }));
  ch.push(vacio());

  doc.cuerpo.forEach((sec, si) => {
    ch.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 100 },
      children: [t(`${si + 1}. ${secEtiqueta(sec)}`, { bold: true })] }));
    sec.bloques.forEach(b => renderBloque(b).forEach(x => ch.push(x)));
    (sec.subsecciones || []).forEach((sub, ui) => {
      ch.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 60 },
        children: [t(`${si + 1}.${ui + 1}  ${sub.titulo}`, { bold: true })] }));
      sub.bloques.forEach(b => renderBloque(b).forEach(x => ch.push(x)));
    });
  });

  let n = doc.cuerpo.length;
  if (esAdr && doc.workflow_aprobacion) {
    n += 1;
    ch.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 100 }, children: [t(`${n}. Aprobación`, { bold: true })] }));
    ch.push(tablaDocx(["Rol / Equipo", "Nombre", "Decisión", "Fecha"],
      doc.workflow_aprobacion.map(a => [a.decisor.equipo || "", a.decisor.nombre, etiqueta_ap(a.decision), a.fecha || ""])));
    ch.push(vacio());
  }
  if (!esAdr) {
    n += 1;
    ch.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 100 }, children: [t(`${n}. Comentarios Recibidos`, { bold: true })] }));
    const cs = doc.comentarios || [];
    ch.push(cs.length
      ? tablaDocx(["#", "Fecha", "Revisor", "Sección", "Tipo", "Comentario", "Resolución"],
          cs.map(c => [c.num, c.fecha, c.revisor, c.seccion || "", c.tipo, c.comentario, (c.resolucion || "pendiente") + (c.detalle_resolucion ? ": " + c.detalle_resolucion : "")]))
      : caja([p([t("Sin comentarios registrados a la fecha. Tabla gestionada por DADM durante la ventana de revisión.", { color: GRIS, size: 18, italics: true })])], "FAFAF8"));
    ch.push(vacio());
    if (doc.cierre) {
      n += 1;
      ch.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 100 }, children: [t(`${n}. Decisión y Próximos Pasos`, { bold: true })] }));
      ch.push(tablaDocx(["Campo", "Valor"], [
        ["Resolución", etiqueta("resoluciones_rfc", doc.cierre.resolucion)],
        ["Decidido por / Fecha", `${doc.cierre.decidido_por} — ${doc.cierre.fecha}`],
        ["Artefactos derivados", (doc.cierre.artefactos_derivados || []).join(" · ") || "—"],
        ["Observaciones", doc.cierre.observaciones || "—"],
      ]));
      ch.push(vacio());
    }
  }
  if (doc.historial) {
    n += 1;
    ch.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 100 }, children: [t(`${n}. Historial de Cambios`, { bold: true })] }));
    ch.push(tablaDocx(["Versión", "Fecha", "Autor", "Cambio"], doc.historial.map(h => [h.version, h.fecha, h.autor, h.cambio])));
  }

  const documento = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22, color: NEGRO } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 28, bold: true, font: "Arial", color: NEGRO },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 24, bold: true, font: "Arial", color: NEGRO },
          paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 1 } },
      ],
    },
    numbering: { config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•",
        alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]},
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
        children: [t(`${doc.id} · v${doc.version || "0.1"} — generado por DADM`, { color: GRIS, size: 16 })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [t("Arquitectura Data · Banco Galicia    —    Página ", { color: GRIS, size: 16 }),
          new TextRun({ children: [PageNumber.CURRENT], color: GRIS, size: 16 })] })] }) },
      children: ch,
    }],
  });

  return Packer.toBuffer(documento);
}

module.exports = { renderDocx };
