/* =========================================================================
   Arqui — el asistente de DADM (estilo "Clippy")
   -------------------------------------------------------------------------
   Módulo autocontenido: se carga DESPUÉS del script principal de index.html
   y se engancha envolviendo funciones globales existentes (renderHome,
   mostrarEditor, irHome, guardar). Lee el estado global (doc, dirty,
   USUARIO) sin modificar la lógica del editor.

   Qué hace:
   - Saluda una vez por sesión y explica qué es DADM.
   - En el home, avisa si hay RFC con la ventana de comentarios por cerrar.
   - En un RFC, si detecta lenguaje de decisión ("decidimos", "vamos a usar",
     "migramos"...) ofrece crear un ADR derivado (relación deriva_de).
   - Si hay cambios sin guardar hace rato, ofrece guardar.
   - Easter eggs: tocarlo le cambia la cara; escribir SELECT * lo pone
     en modo query; 7 toques seguidos revelan su número de serie.
   - "No mostrar más" lo silencia (persistido); se vuelve a activar desde
     el botón de la barra lateral.
   ========================================================================= */
(function(){
  "use strict";

  const LS_OFF = "dadm_arqui_off";
  const SS_HOLA = "dadm_arqui_hola";
  const SS_SNOOZE = "dadm_arqui_snooze";      // ids de doc donde ya ofreció el ADR
  const SS_AVISOS = "dadm_arqui_avisos";      // ya avisó de ventanas RFC en esta sesión
  const SIN_GUARDAR_MS = 5 * 60 * 1000;       // 5 minutos con cambios sin guardar

  // lenguaje de decisión (con límites que funcionan con acentos)
  const RE_DECISION = /(?:^|[^\p{L}])(decidimos|decidí|decidieron|vamos a (?:usar|adoptar|migrar|pasar|reemplazar|implementar)|elegimos|optamos por|adoptamos|migramos|nos quedamos con|descartamos|definimos usar)(?=[^\p{L}]|$)/iu;
  const RE_SELECT = /select\s+\*/i;

  // ---------- almacenamiento seguro ----------
  const store = {
    get(s, k){ try{ return s.getItem(k); }catch(e){ return null; } },
    set(s, k, v){ try{ s.setItem(k, v); }catch(e){ /* sin storage: no persiste */ } },
    del(s, k){ try{ s.removeItem(k); }catch(e){ /* idem */ } },
  };
  const LS = (()=>{ try{ return window.localStorage; }catch(e){ return null; } })();
  const SS = (()=>{ try{ return window.sessionStorage; }catch(e){ return null; } })();
  const apagado = () => store.get(LS, LS_OFF) === "1";
  const snoozed = () => { try{ return JSON.parse(store.get(SS, SS_SNOOZE) || "[]"); }catch(e){ return []; } };
  const snooze = id => { const s = snoozed(); if(!s.includes(id)){ s.push(id); store.set(SS, SS_SNOOZE, JSON.stringify(s)); } };

  // acceso defensivo al estado global del script principal
  const g = {
    doc(){ try{ return typeof doc !== "undefined" ? doc : null; }catch(e){ return null; } },
    dirty(){ try{ return typeof dirty !== "undefined" && dirty; }catch(e){ return false; } },
    usuario(){ try{ return typeof USUARIO !== "undefined" ? USUARIO : null; }catch(e){ return null; } },
  };
  const escH = s => String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");

  // ---------- SVG del personaje (mismo diseño que el canvas "Arqui · personaje DADM") ----------
  const SVG = `
<svg viewBox="60 10 300 400" aria-hidden="true" focusable="false">
 <g class="bob">
  <rect x="164" y="336" width="22" height="40" fill="#6E6760"/>
  <rect x="214" y="336" width="22" height="40" fill="#6E6760"/>
  <rect x="150" y="370" width="46" height="18" rx="9" fill="#121212"/>
  <rect x="204" y="370" width="46" height="18" rx="9" fill="#121212"/>
  <path d="M132 252 Q98 262 94 298" stroke="#121212" stroke-width="9" fill="none" stroke-linecap="round"/>
  <g transform="rotate(-30 94 306)">
   <rect x="86" y="262" width="14" height="56" fill="#F2C14E" stroke="#121212" stroke-width="3"/>
   <path d="M86 318 L93 336 L100 318 Z" fill="#E9D3B0" stroke="#121212" stroke-width="3"/>
   <rect x="86" y="254" width="14" height="9" fill="var(--orange)" stroke="#121212" stroke-width="3"/>
  </g>
  <circle cx="94" cy="306" r="13" fill="#E3DDD5" stroke="#121212" stroke-width="3"/>
  <path d="M268 252 Q306 238 312 204" stroke="#121212" stroke-width="9" fill="none" stroke-linecap="round"/>
  <circle cx="314" cy="194" r="13" fill="#E3DDD5" stroke="#121212" stroke-width="3"/>
  <rect x="130" y="222" width="140" height="120" rx="24" fill="#E3DDD5" stroke="#121212" stroke-width="4"/>
  <rect x="152" y="238" width="96" height="80" rx="10" fill="#121212"/>
  <rect x="160" y="246" width="80" height="18" rx="4" fill="#F2C14E"/>
  <rect x="160" y="269" width="80" height="18" rx="4" fill="#C9C3BC"/>
  <rect x="160" y="292" width="80" height="18" rx="4" fill="#A86B3C"/>
  <text x="166" y="259" font-family="monospace" font-size="11" font-weight="700" fill="#121212">GOLD</text>
  <text x="166" y="282" font-family="monospace" font-size="11" font-weight="700" fill="#121212">SILVER</text>
  <text x="166" y="305" font-family="monospace" font-size="11" font-weight="700" fill="#121212">BRONZE</text>
  <text x="200" y="333" text-anchor="middle" font-family="monospace" font-size="11" font-weight="700" letter-spacing="1" fill="#6E6760">ARQ-23.10</text>
  <polygon points="269,240 264,248.7 254,248.7 249,240 254,231.3 264,231.3" fill="var(--orange)" stroke="#121212" stroke-width="2"/>
  <rect x="186" y="206" width="28" height="18" fill="#6E6760"/>
  <rect x="100" y="128" width="22" height="40" fill="var(--orange)" stroke="#121212" stroke-width="3"/>
  <ellipse cx="111" cy="168" rx="11" ry="4" fill="var(--orange)" stroke="#121212" stroke-width="3"/>
  <ellipse cx="111" cy="128" rx="11" ry="4" fill="#FF8A3D" stroke="#121212" stroke-width="3"/>
  <rect x="278" y="128" width="22" height="40" fill="var(--orange)" stroke="#121212" stroke-width="3"/>
  <ellipse cx="289" cy="168" rx="11" ry="4" fill="var(--orange)" stroke="#121212" stroke-width="3"/>
  <ellipse cx="289" cy="128" rx="11" ry="4" fill="#FF8A3D" stroke="#121212" stroke-width="3"/>
  <line x1="200" y1="88" x2="200" y2="58" stroke="#121212" stroke-width="5"/>
  <line x1="200" y1="52" x2="174" y2="34" stroke="#121212" stroke-width="3"/>
  <line x1="200" y1="52" x2="228" y2="28" stroke="#121212" stroke-width="3"/>
  <line x1="174" y1="34" x2="228" y2="28" stroke="#121212" stroke-width="2" stroke-dasharray="4 4"/>
  <circle cx="174" cy="34" r="7" fill="#F5F2EE" stroke="#121212" stroke-width="3"/>
  <circle cx="228" cy="28" r="7" fill="#F5F2EE" stroke="#121212" stroke-width="3"/>
  <circle class="pulse" cx="200" cy="52" r="10" fill="var(--orange)" stroke="#121212" stroke-width="3"/>
  <rect x="118" y="88" width="164" height="122" rx="32" fill="#E3DDD5" stroke="#121212" stroke-width="4"/>
  <rect x="136" y="106" width="128" height="86" rx="18" fill="#121212"/>
  <g class="face face-0">
   <rect x="164" y="124" width="20" height="28" rx="10" fill="var(--orange)"/>
   <rect x="216" y="124" width="20" height="28" rx="10" fill="var(--orange)"/>
   <path d="M180 166 Q200 180 220 166" stroke="var(--orange)" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>
  <g class="face face-1">
   <rect x="164" y="124" width="20" height="28" rx="10" fill="var(--orange)"/>
   <path d="M214 142 Q226 128 238 142" stroke="var(--orange)" stroke-width="6" fill="none" stroke-linecap="round"/>
   <path d="M176 164 Q200 186 224 164" stroke="var(--orange)" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>
  <g class="face face-2">
   <text x="200" y="160" text-anchor="middle" font-family="monospace" font-size="30" font-weight="700" fill="var(--orange)">¿ADR?</text>
  </g>
  <g class="face face-3">
   <text x="200" y="145" text-anchor="middle" font-family="monospace" font-size="20" font-weight="700" fill="var(--orange)">SELECT *</text>
   <text x="200" y="172" text-anchor="middle" font-family="monospace" font-size="16" font-weight="700" fill="var(--orange)">FROM futuro</text>
  </g>
 </g>
</svg>`;

  const FACE = { normal:0, guino:1, adr:2, select:3 };

  // ---------- DOM ----------
  const root = document.createElement("div");
  root.id = "arqui";
  root.className = "oculto";
  root.dataset.face = "0";
  root.innerHTML = `
    <div class="arqui-bubble oculto" role="status" aria-live="polite">
      <button type="button" class="ab-close" aria-label="Cerrar el mensaje de Arqui">✕</button>
      <div class="ab-msg"></div>
      <div class="ab-acts"></div>
    </div>
    <button type="button" class="arqui-bot" aria-label="Arqui, el asistente de DADM. Tocalo para pedirle ayuda">${SVG}</button>`;
  document.body.appendChild(root);

  const bubble = root.querySelector(".arqui-bubble");
  const msgEl = root.querySelector(".ab-msg");
  const actsEl = root.querySelector(".ab-acts");
  const bot = root.querySelector(".arqui-bot");

  let mensajeActual = null;   // id del mensaje visible (para no pisar uno importante)
  let toques = 0, toquesTimer = null;
  let dirtyDesde = 0, avisoGuardarDado = false;

  function setFace(f){ root.dataset.face = String(f); }
  function hop(){
    root.classList.remove("hablando");
    void root.offsetWidth;            // reinicia la animación
    root.classList.add("hablando");
    setTimeout(()=>root.classList.remove("hablando"), 1100);
  }

  /**
   * Muestra un globo.
   * @param {object} m  { id, html, face, acciones:[{txt, fn, estilo:"primary"|"link"}], prioridad }
   */
  function decir(m){
    if(apagado()) return;
    if(mensajeActual && mensajeActual.prioridad > (m.prioridad||0)) return; // no pisar algo más importante
    mensajeActual = m;
    msgEl.innerHTML = m.html;
    actsEl.innerHTML = "";
    (m.acciones||[]).forEach(a=>{
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ab-btn" + (a.estilo ? " " + a.estilo : "");
      b.textContent = a.txt;
      b.addEventListener("click", ()=>{ callar(); a.fn && a.fn(); });
      actsEl.appendChild(b);
    });
    actsEl.classList.toggle("oculto", !(m.acciones||[]).length);
    bubble.classList.remove("oculto");
    root.classList.remove("minimo");
    setFace(m.face ?? FACE.normal);
    hop();
  }
  function callar(){
    bubble.classList.add("oculto");
    mensajeActual = null;
    setFace(FACE.normal);
  }

  // ---------- visibilidad ----------
  function enApp(){
    const shell = document.querySelector(".shell");
    const vista = document.getElementById("vista");
    return shell && !shell.classList.contains("oculto") && !(vista && !vista.classList.contains("oculto"));
  }
  function actualizarVisibilidad(){
    const ver = enApp() && !apagado();
    root.classList.toggle("oculto", !ver);
    const b = document.getElementById("btn-arqui");
    if(b){
      b.classList.toggle("apagado", apagado());
      b.title = apagado() ? "Arqui está silenciado: tocá para volver a llamarlo" : "Pedirle ayuda a Arqui";
      const sp = b.querySelector("span"); if(sp) sp.textContent = apagado() ? "Arqui (silenciado)" : "Arqui";
    }
  }

  function apagar(){
    store.set(LS, LS_OFF, "1");
    callar();
    actualizarVisibilidad();
  }
  function encender(){
    store.del(LS, LS_OFF);
    actualizarVisibilidad();
    decir({
      id:"vuelta", face:FACE.guino,
      html:"¡Volví! Te aviso cuando vea una decisión sin documentar. Don’t Ask, <b>Document More</b>.",
    });
  }

  // entrada en la navegación lateral para pedirle ayuda o volver a llamarlo
  function montarBotonLateral(){
    const nav = document.querySelector(".sidebar .nav");
    if(!nav || document.getElementById("btn-arqui")) return;
    const b = document.createElement("button");
    b.id = "btn-arqui";
    b.type = "button";
    b.className = "nav-btn";
    b.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1"/><path d="M9 13h.01"/><path d="M15 13h.01"/><path d="M9.5 16.5c1.5 1 3.5 1 5 0"/></svg><span>Arqui</span>`;
    b.addEventListener("click", ()=>{ apagado() ? encender() : menuAyuda(); });
    nav.appendChild(b);
    actualizarVisibilidad();
  }

  // ---------- menú contextual (al tocarlo) ----------
  function menuAyuda(){
    const d = g.doc();
    const enEditor = !!d && !document.getElementById("editor")?.classList.contains("oculto");
    const acciones = [];
    if(enEditor){
      if(d.tipo === "rfc") acciones.push({ txt:"Crear un ADR a partir de este RFC", estilo:"primary", fn:()=>crearAdrDesde(d) });
      if(g.dirty()) acciones.push({ txt:"Guardar ahora", fn:()=>guardarAhora() });
      acciones.push({ txt:"¿ADR o RFC? ¿Cuál uso?", fn:explicarTipos });
    } else {
      acciones.push({ txt:"Nuevo ADR", estilo:"primary", fn:()=>window.nuevoDoc && window.nuevoDoc("adr") });
      acciones.push({ txt:"Nuevo RFC", fn:()=>window.nuevoDoc && window.nuevoDoc("rfc") });
      acciones.push({ txt:"¿ADR o RFC? ¿Cuál uso?", fn:explicarTipos });
    }
    acciones.push({ txt:"No mostrar más (no te lo recomiendo)", estilo:"link", fn:apagar });
    decir({
      id:"menu", face:FACE.guino,
      html: enEditor
        ? `Estás en <code>${escH(d.id)}</code>. ¿En qué te doy una mano?`
        : "¿Qué vamos a documentar hoy?",
      acciones,
    });
  }

  function explicarTipos(){
    decir({
      id:"tipos", face:FACE.adr,
      html:"<b>RFC</b>: proponés algo y abrís una ventana de comentarios para que el equipo opine.<br><b>ADR</b>: dejás asentada una decisión ya tomada, con contexto, alternativas y consecuencias. Si un RFC termina en decisión, el ADR <i>deriva de</i> ese RFC.",
      acciones:[{ txt:"Entendido", estilo:"primary" }],
    });
  }

  // ---------- acciones ----------
  async function guardarAhora(){
    if(typeof window.guardar !== "function") return;
    const ok = await window.guardar(false);
    if(ok) decir({ id:"guardado", face:FACE.guino, html:"Listo, guardado. 💾" });
  }

  async function crearAdrDesde(origen){
    if(!origen || typeof window.nuevoDoc !== "function") return;
    const idOrigen = origen.id, tituloOrigen = (origen.titulo||"").trim();
    if(g.dirty() && typeof window.guardar === "function"){
      const ok = await window.guardar(true);
      if(!ok){ decir({ id:"err", html:"No pude guardar el RFC antes de crear el ADR. Guardalo y probá de nuevo." }); return; }
    }
    await window.nuevoDoc("adr");
    const nuevo = g.doc();
    if(!nuevo || nuevo.tipo !== "adr") return;
    if(tituloOrigen && !nuevo.titulo) nuevo.titulo = tituloOrigen;
    nuevo.relaciones = (nuevo.relaciones ? nuevo.relaciones + " · " : "") + "deriva_de: " + idOrigen;
    try{ dirty = true; }catch(e){ /* sin acceso a dirty */ }
    if(typeof window.renderTodo === "function") window.renderTodo();
    if(typeof window.guardar === "function") await window.guardar(true);
    decir({
      id:"adr-creado", face:FACE.guino,
      html:`Armé <code>${escH(nuevo.id)}</code> vinculado a <code>${escH(idOrigen)}</code>. Contá el contexto, las alternativas que descartaron y por qué.`,
    });
  }

  // ---------- disparadores ----------
  function saludoInicial(){
    if(store.get(SS, SS_HOLA)) return;
    store.set(SS, SS_HOLA, "1");
    const u = g.usuario();
    const nombre = u ? (u.nombre || u.username || "").split(" ")[0] : "";
    decir({
      id:"hola", face:FACE.guino,
      html:`¡Hola${nombre ? ", " + escH(nombre) : ""}! Soy <b>Arqui</b>. Te voy a avisar cuando estés por decidir algo sin dejarlo escrito.`,
      acciones:[
        { txt:"Dale", estilo:"primary" },
        { txt:"No mostrar más (no te lo recomiendo)", estilo:"link", fn:apagar },
      ],
    });
  }

  function revisarAvisosRfc(){
    if(store.get(SS, SS_AVISOS)) return false;
    const items = document.querySelectorAll("#avisos-home .av-item");
    if(!items.length) return false;
    store.set(SS, SS_AVISOS, "1");
    const vencidos = document.querySelectorAll("#avisos-home .av-item.venc").length;
    const primero = items[0];
    decir({
      id:"avisos", face:FACE.adr, prioridad:1,
      html: vencidos
        ? `Hay <b>${items.length}</b> RFC con la ventana de comentarios cerrando, y <b>${vencidos}</b> ya venció. ¿Lo cerramos con un ADR?`
        : `Hay <b>${items.length}</b> RFC con la ventana de comentarios por cerrar en los próximos días.`,
      acciones:[
        { txt:"Ver el primero", estilo:"primary", fn:()=>primero.click() },
        { txt:"Después" },
      ],
    });
    return true;
  }

  function revisarDecision(texto){
    const d = g.doc();
    if(!d || d.tipo !== "rfc" || snoozed().includes(d.id)) return;
    if(!RE_DECISION.test(texto)) return;
    snooze(d.id);
    decir({
      id:"decision", face:FACE.adr, prioridad:2,
      html:"Parece que estás tomando una decisión de arquitectura sin un ADR. ¿Te ayudo a escribirlo?",
      acciones:[
        { txt:"Sí, armemos el ADR", estilo:"primary", fn:()=>crearAdrDesde(d) },
        { txt:"No, lo documento después" },
        { txt:"No mostrar más (no te lo recomiendo)", estilo:"link", fn:apagar },
      ],
    });
  }

  // texto editado: contenteditable, input o textarea
  let debounce = null;
  function onEditorInput(ev){
    const t = ev.target;
    const texto = (t && (t.isContentEditable ? t.textContent : t.value)) || "";
    if(RE_SELECT.test(texto) && root.dataset.face !== String(FACE.select) && !mensajeActual){
      setFace(FACE.select); hop();
      setTimeout(()=>{ if(!mensajeActual) setFace(FACE.normal); }, 4000);
    }
    clearTimeout(debounce);
    debounce = setTimeout(()=>revisarDecision(texto), 900);
  }

  function tick(){
    actualizarVisibilidad();
    const d = g.doc();
    if(d && g.dirty()){
      if(!dirtyDesde) dirtyDesde = Date.now();
      if(!avisoGuardarDado && Date.now() - dirtyDesde > SIN_GUARDAR_MS){
        avisoGuardarDado = true;
        decir({
          id:"guardar", face:FACE.normal, prioridad:1,
          html:"Hace un rato que tenés cambios sin guardar. Si se duerme el servidor, se pierden.",
          acciones:[ { txt:"Guardar ahora", estilo:"primary", fn:guardarAhora }, { txt:"Ya lo hago" } ],
        });
      }
    } else {
      dirtyDesde = 0; avisoGuardarDado = false;
    }
  }

  // ---------- tocarlo ----------
  bot.addEventListener("click", ()=>{
    toques++;
    clearTimeout(toquesTimer);
    toquesTimer = setTimeout(()=>{ toques = 0; }, 1500);
    if(toques >= 7){
      toques = 0;
      decir({ id:"serie", face:FACE.select, html:"Número de serie <code>ARQ-23.10</code>: me ensamblaron para el CAFE de Arquitectura Data. Bronze abajo, gold arriba, siempre." });
      return;
    }
    if(!bubble.classList.contains("oculto")){
      // con el globo abierto, tocarlo cambia la cara (easter egg de la ficha)
      setFace((Number(root.dataset.face) + 1) % 4); hop();
      return;
    }
    menuAyuda();
  });
  root.querySelector(".ab-close").addEventListener("click", callar);
  document.addEventListener("keydown", e=>{ if(e.key === "Escape" && !bubble.classList.contains("oculto") && root.contains(document.activeElement)) callar(); });

  // ---------- enganches con el flujo de DADM ----------
  function envolver(nombre, despues){
    const orig = window[nombre];
    if(typeof orig !== "function") return;
    window[nombre] = function(){
      const r = orig.apply(this, arguments);
      Promise.resolve(r).then(()=>{ try{ despues(r); }catch(e){ console.warn("Arqui:", e); } });
      return r;
    };
  }
  envolver("renderHome", ()=>{
    montarBotonLateral();
    actualizarVisibilidad();
    if(!revisarAvisosRfc()) saludoInicial();
  });
  envolver("mostrarEditor", ()=>{
    actualizarVisibilidad();
    if(mensajeActual && ["hola","avisos","menu"].includes(mensajeActual.id)) callar();
    root.classList.add("minimo");
  });
  envolver("irHome", ()=>{ root.classList.remove("minimo"); });
  envolver("abrirVista", actualizarVisibilidad);

  const ed = document.getElementById("editor");
  if(ed) ed.addEventListener("input", onEditorInput);

  setInterval(tick, 5000);
  actualizarVisibilidad();

  // API mínima por consola / para futuras integraciones
  window.Arqui = { decir, callar, apagar, encender, menu: menuAyuda };
})();
