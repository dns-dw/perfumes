/* ============================================================
   Sección 2 — Buscador de Perfumes
   ------------------------------------------------------------
   Dos modos de funcionamiento:

   A) SIN PASARELA (por defecto, cero configuración extra):
      El nombre del perfume se envía directamente a Groq
      (openai/gpt-oss-20b), que genera las notas, la descripción,
      la duración, la proyección y la referencia conocida a partir
      de su conocimiento. Las notas se etiquetan como "inferidas".

   B) CON PASARELA FRAGRANTICA (opcional, máxima fidelidad):
      El usuario despliega una mini-pasarela gratuita
      (Google Apps Script, código en el README) y pega su URL en
      la configuración del buscador. Entonces:
      1. La pasarela descarga la página de búsqueda de Fragrantica
         (sus IPs de Google pasan el Cloudflare del sitio) y se
         extrae la clave efímera de su buscador interno (Algolia).
      2. La consulta a Algolia también va por la pasarela (la clave
         está ligada a la IP que la generó).
      3. La pasarela descarga la ficha del perfume: se extraen las
         notas principales y, si es posible, la pirámide completa
         (salida/corazón/fondo) desde ajax.php.
      4. Groq redacta descripción, duración, proyección y
         referencia usando las notas REALES.

   ¿Por qué la pasarela? Fragrantica no envía cabeceras CORS y su
   Cloudflare desafía las peticiones que salen de IPs de
   datacenter (proxies CORS públicos, GitHub Actions, etc.), por
   lo que el navegador no puede descargarla directamente.

   En ambos modos se respeta rate limiting (pausas entre llamadas)
   y se cachean los resultados 24 h en localStorage.
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Configuración ---------- */

  const FRAG = "https://www.fragrantica.es";
  const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
  const GROQ_MODELO = "openai/gpt-oss-20b";
  const ALGOLIA_APP_ID = "FGVI612DFZ";
  const ALGOLIA_INDICE = "fragrantica_perfumes";

  const PAUSA_MS = 1000;              // pausa entre peticiones (rate limits)
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  /* ---------- Elementos ---------- */

  const form = document.getElementById("form-buscador");
  const input = document.getElementById("input-perfume");
  const btnBuscar = document.getElementById("btn-buscar");
  const estado = document.getElementById("estado-busqueda");
  const resultado = document.getElementById("resultado");
  const btnConfigClave = document.getElementById("btn-config-clave");
  const btnConfigPasarela = document.getElementById("btn-config-pasarela");

  let ultimaPeticion = 0;

  /* ---------- Utilidades ---------- */

  function escapar(texto) {
    const div = document.createElement("div");
    div.textContent = texto == null ? "" : String(texto);
    return div.innerHTML;
  }

  function dormir(ms) {
    return new Promise(function (res) { setTimeout(res, ms); });
  }

  async function pausa() {
    const espera = PAUSA_MS - (Date.now() - ultimaPeticion);
    if (espera > 0) await dormir(espera);
    ultimaPeticion = Date.now();
  }

  function mostrarEstado(html, esError) {
    estado.hidden = false;
    estado.classList.toggle("error", !!esError);
    estado.innerHTML = html;
  }

  function paso(num, total, texto) {
    return '<span class="paso">[' + num + "/" + total + "] " + escapar(texto) + "</span>";
  }

  /* ---------- Configuración: clave Groq y pasarela ---------- */

  function obtenerClaveGroq() {
    return (window.GROQ_API_KEY || localStorage.getItem("GROQ_API_KEY") || "").trim();
  }

  function pedirClaveGroq() {
    const clave = prompt(
      "Introduce tu clave de API de Groq (GROQ_API_KEY).\nSe guardará solo en tu navegador (localStorage)."
    );
    if (clave && clave.trim()) {
      localStorage.setItem("GROQ_API_KEY", clave.trim());
      return clave.trim();
    }
    return "";
  }

  function obtenerPasarela() {
    return (localStorage.getItem("PASARELA_URL") || "").trim().replace(/\/+$/, "");
  }

  function pedirPasarela() {
    const actual = obtenerPasarela();
    const url = prompt(
      "URL de tu pasarela de Fragrantica (opcional).\n" +
      "Despliega el Google Apps Script del README y pega aquí su URL web app.\n" +
      "Déjalo vacío para usar solo la IA (notas inferidas)." +
      (actual ? "\n\nActual: " + actual : ""),
      actual
    );
    if (url === null) return obtenerPasarela();
    const limpia = url.trim().replace(/\/+$/, "");
    if (limpia) localStorage.setItem("PASARELA_URL", limpia);
    else localStorage.removeItem("PASARELA_URL");
    return limpia;
  }

  btnConfigClave.addEventListener("click", pedirClaveGroq);
  btnConfigPasarela.addEventListener("click", pedirPasarela);

  /* ---------- Pasarela (Apps Script) ----------
     Enviamos siempre como texto plano (petición "simple": evita el
     preflight CORS, que Apps Script no gestiona). */

  async function viaPasarela(destino, opciones) {
    const base = obtenerPasarela();
    if (!base) throw new Error("Pasarela no configurada");
    const payload = JSON.stringify(Object.assign({ url: destino }, opciones || {}));
    const resp = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: payload
    });
    if (!resp.ok) throw new Error("La pasarela respondió con error " + resp.status);
    return resp.text();
  }

  /* ---------- Cache local ---------- */

  function leerCache(nombre) {
    try {
      const item = JSON.parse(localStorage.getItem("busqueda:" + nombre.toLowerCase()));
      if (item && Date.now() - item.ts < CACHE_TTL_MS) return item.datos;
    } catch (e) { /* caché inválido */ }
    return null;
  }

  function guardarCache(nombre, datos) {
    try {
      localStorage.setItem("busqueda:" + nombre.toLowerCase(), JSON.stringify({ ts: Date.now(), datos: datos }));
    } catch (e) { /* almacenamiento lleno */ }
  }

  /* ---------- Modo B: datos reales vía pasarela ---------- */

  async function resolverEnFragrantica(nombre) {
    const htmlBusqueda = await viaPasarela(FRAG + "/buscar/?query=" + encodeURIComponent(nombre));
    const appId = (htmlBusqueda.match(/"algoliaAppId":"([A-Z0-9]+)"/) || [])[1] || ALGOLIA_APP_ID;
    const apiKey = (htmlBusqueda.match(/let toAbby = "([A-Za-z0-9+/=]+)"/) || [])[1];
    if (!apiKey) throw new Error("Fragrantica no devolvió clave de búsqueda (¿Cloudflare bloqueó la pasarela?)");

    await pausa();
    const cuerpo = JSON.stringify({
      query: nombre,
      hitsPerPage: 5,
      attributesToRetrieve: ["naslov", "dizajner", "godina", "id", "slug", "spol"]
    });
    // La clave está ligada a la IP que la generó: Algolia también va por la pasarela.
    const respAlgolia = await viaPasarela(
      "https://" + appId + "-dsn.algolia.net/1/indexes/" + ALGOLIA_INDICE + "/query",
      {
        method: "POST",
        headers: { "X-Algolia-Application-Id": appId, "X-Algolia-API-Key": apiKey, "Content-Type": "application/json" },
        body: cuerpo
      }
    );
    const datos = JSON.parse(respAlgolia);
    const hits = (datos.hits || []).filter(function (h) { return h.slug; });
    if (!hits.length) throw new Error("Fragrantica no encontró «" + nombre + "».");

    return hits.map(function (h) {
      return {
        nombre: h.naslov,
        casa: h.dizajner || "",
        ano: h.godina ? String(h.godina) : "",
        id: h.id,
        url: FRAG + "/perfume/" + h.slug + ".html"
      };
    });
  }

  async function extraerNotas(ficha) {
    const notas = { salida: [], corazon: [], fondo: [], principales: [] };

    await pausa();
    const html = await viaPasarela(ficha.url);
    const doc = new DOMParser().parseFromString(html, "text/html");

    doc.querySelectorAll("#pyramid a.pyramid-note-link, pyramid-level-new a").forEach(function (a) {
      const span = a.querySelector(".pyramid-note-label");
      const img = a.querySelector("img");
      const nota = (span ? span.textContent : img ? img.alt : a.textContent).trim();
      if (nota && notas.principales.indexOf(nota) === -1) notas.principales.push(nota);
    });

    // Pirámide completa (salida/corazón/fondo) vía ajax.php.
    const piramide = await intentarPiramideAjax(html, ficha);
    if (piramide) {
      notas.salida = piramide.salida;
      notas.corazon = piramide.corazon;
      notas.fondo = piramide.fondo;
    }
    return notas;
  }

  async function intentarPiramideAjax(html, ficha) {
    try {
      const token = (html.match(/pyramidRequestToken = "([a-f0-9]+)"/) || [])[1];
      let id = ficha.id;
      if (!id) {
        const m = html.match(/perfume_id="?(\d+)"?/) || ficha.url.match(/-(\d+)\.html/);
        id = m ? m[1] : null;
      }
      if (!token || !id) return null;

      await pausa();
      const cuerpo = "perfume_id=" + encodeURIComponent(id) +
        "&pyramid_token=" + encodeURIComponent(token) +
        "&action=pyramid";
      const texto = await viaPasarela(FRAG + "/ajax.php?pyramid&" + Date.now(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: cuerpo
      });
      const datos = JSON.parse(texto);

      const salida = [], corazon = [], fondo = [];
      const rxS = /salida|top/i, rxC = /coraz|heart|middle/i, rxF = /fondo|base/i;
      (function recorrer(obj, ruta) {
        if (Array.isArray(obj)) {
          if (obj.length && (typeof obj[0] === "string" || typeof obj[0] === "number")) {
            const lista = obj.map(String);
            if (rxS.test(ruta)) salida.push.apply(salida, lista);
            else if (rxC.test(ruta)) corazon.push.apply(corazon, lista);
            else if (rxF.test(ruta)) fondo.push.apply(fondo, lista);
          } else {
            obj.forEach(function (o) { recorrer(o, ruta); });
          }
        } else if (obj && typeof obj === "object") {
          Object.keys(obj).forEach(function (k) { recorrer(obj[k], ruta + " " + k); });
        }
      })(datos, "");

      if (salida.length || corazon.length || fondo.length) {
        return { salida: salida, corazon: corazon, fondo: fondo };
      }
      return null;
    } catch (e) {
      return null; // seguimos con las notas principales
    }
  }

  /* ---------- Groq ---------- */

  function construirPrompt(nombre, ficha, notas) {
    const conNotasReales = notas && (notas.salida.length || notas.corazon.length || notas.fondo.length || notas.principales.length);

    const sistema =
      "Eres un experto perfumista. Responde ÚNICAMENTE con un objeto JSON válido con estas claves: " +
      '"descripcion" (2 o 3 frases en español), "duracion" (rango en horas, p. ej. "6-8 h"), ' +
      '"proyeccion" (corta: suave, moderada o fuerte, con una breve nota), ' +
      '"salida", "corazon", "fondo" (arrays de notas en español), y ' +
      '"referencia" (la referencia conocida más cercana: a qué perfume famoso se parece, en formato ' +
      '"Similar a X" o "Cruce entre X e Y"). ' +
      "Reglas de uso: cítricos frescos -> día, oficina y calor; especiados intensos -> noche, salidas y frío; " +
      "bases limpias de ámbar y almizcle -> uso versátil. Sin texto fuera del JSON.";

    let usuario = "Perfume: " + nombre;
    if (ficha) {
      if (ficha.casa) usuario += "\nCasa: " + ficha.casa;
      if (ficha.ano) usuario += "\nAño: " + ficha.ano;
    }
    if (conNotasReales) {
      usuario += "\nNotas reales extraídas de Fragrantica: " + JSON.stringify({
        salida: notas.salida, corazon: notas.corazon, fondo: notas.fondo, principales: notas.principales
      });
    } else {
      usuario += "\nNo tenemos notas verificadas; infiere las notas de salida, corazón y fondo " +
        "según tu conocimiento de este perfume. Sé fiel a la pirámide olfativa realmente publicada por su casa.";
    }
    return { sistema: sistema, usuario: usuario };
  }

  async function consultarGroq(clave, nombre, ficha, notas) {
    const p = construirPrompt(nombre, ficha, notas);
    const resp = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + clave,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODELO,
        messages: [
          { role: "system", content: p.sistema },
          { role: "user", content: p.usuario }
        ],
        temperature: 0.4,
        response_format: { type: "json_object" }
      })
    });

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        throw new Error("La clave de Groq no es válida o no tiene permisos. Revisa GROQ_API_KEY.");
      }
      const detalle = await resp.text().catch(function () { return ""; });
      throw new Error("Groq respondió con error " + resp.status + ". " + detalle.slice(0, 200));
    }

    const datos = await resp.json();
    return JSON.parse(datos.choices[0].message.content.replace(/```json|```/g, "").trim());
  }

  /* ---------- Renderizado del resultado ---------- */

  function renderResultado(nombreBuscado, ficha, ia, origenNotas) {
    const fichaFinal = ficha || { nombre: nombreBuscado, casa: "", ano: "", url: "" };
    const notasDeFragrantica = origenNotas === "fragrantica";

    function lista(arr) {
      if (!arr || !arr.length) return '<span class="pastilla">—</span>';
      return arr.map(function (n) { return '<span class="pastilla">' + escapar(n) + "</span>"; }).join("");
    }

    resultado.innerHTML =
      '<div class="resultado-cabecera">' +
        "<h3>" + escapar(fichaFinal.nombre) + "</h3>" +
        "<p>" + [fichaFinal.casa, fichaFinal.ano].filter(Boolean).map(escapar).join(" · ") + "</p>" +
      "</div>" +
      '<div class="resultado-cuerpo">' +
        '<div class="bloque-notas">' +
          '<div class="nota-bloque"><h4>Notas de salida</h4>' + lista(ia.salida) + "</div>" +
          '<div class="nota-bloque"><h4>Notas de corazón</h4>' + lista(ia.corazon) + "</div>" +
          '<div class="nota-bloque"><h4>Notas de fondo</h4>' + lista(ia.fondo) + "</div>" +
        "</div>" +
        '<div class="detalle-item"><h4>Descripción</h4><p>' + escapar(ia.descripcion) + "</p></div>" +
        '<div class="bloque-detalle">' +
          '<div class="detalle-item"><h4>Duración estimada</h4><p>' + escapar(ia.duracion) + "</p></div>" +
          '<div class="detalle-item"><h4>Proyección</h4><p>' + escapar(ia.proyeccion) + "</p></div>" +
        "</div>" +
        '<div class="referencia"><h4>🔗 Referencia conocida cercana</h4><p>' + escapar(ia.referencia) + "</p></div>" +
        '<p class="resultado-fuente">' +
          (notasDeFragrantica
            ? 'Notas extraídas de <a href="' + escapar(fichaFinal.url) + '" target="_blank" rel="noopener">Fragrantica</a>'
            : 'Notas inferidas por IA · <a href="#" id="enlace-pasarela">configura la pasarela</a> para notas reales de Fragrantica') +
        "</p>" +
      "</div>";

    resultado.hidden = false;
    const enlace = document.getElementById("enlace-pasarela");
    if (enlace) enlace.addEventListener("click", function (e) { e.preventDefault(); pedirPasarela(); });
    resultado.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- Orquestación ---------- */

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const nombre = input.value.trim();
    if (!nombre) return;

    resultado.hidden = true;
    btnBuscar.disabled = true;

    try {
      const cacheado = leerCache(nombre);
      if (cacheado) {
        mostrarEstado("✅ Resultado recuperado de la caché local (búsqueda reciente).");
        renderResultado(nombre, cacheado.ficha, cacheado.ia, cacheado.origen);
        return;
      }

      let clave = obtenerClaveGroq();
      if (!clave) {
        mostrarEstado('<span class="paso">Se necesita la clave de Groq para generar la ficha.</span>', false);
        clave = pedirClaveGroq();
        if (!clave) {
          mostrarEstado("⚠️ Búsqueda cancelada: sin clave de Groq no se puede generar la ficha del perfume.", true);
          return;
        }
      }

      const conPasarela = !!obtenerPasarela();
      let ficha = null;
      let notas = { salida: [], corazon: [], fondo: [], principales: [] };
      let origen = "ia";

      if (conPasarela) {
        mostrarEstado(
          paso(1, 4, "Buscando «" + nombre + "» en Fragrantica (vía pasarela)…")
        );
        try {
          const candidatos = await resolverEnFragrantica(nombre);
          ficha = candidatos[0];
          mostrarEstado(
            paso(1, 4, "Encontrado en Fragrantica: " + ficha.nombre + (candidatos.length > 1 ? " (mejor coincidencia de " + candidatos.length + ")" : "")) +
            paso(2, 4, "Extrayendo notas de la ficha…")
          );
          notas = await extraerNotas(ficha);
          origen = "fragrantica";
        } catch (errPasarela) {
          mostrarEstado(
            '<span class="paso">⚠️ La pasarela no funcionó (' + escapar(errPasarela.message) +
            '); se generará la ficha solo con IA.</span>'
          );
          ficha = null;
          notas = { salida: [], corazon: [], fondo: [], principales: [] };
          origen = "ia";
          await dormir(300);
        }
      } else {
        mostrarEstado(
          paso(1, 3, "Generando la ficha de «" + nombre + "» con IA…") +
          '<span class="paso">Sin pasarela configurada: las notas se infieren. ' +
          'Usa «Configurar pasarela» para notas reales de Fragrantica.</span>'
        );
      }

      mostrarEstado(
        (origen === "fragrantica"
          ? paso(1, 4, "Encontrado: " + ficha.nombre) + paso(2, 4, "Notas extraídas de Fragrantica.")
          : paso(1, 3, "Consultando conocimiento perfumístico…")) +
        (origen === "fragrantica"
          ? paso(3, 4, "Generando descripción, duración, proyección y referencia con Groq…")
          : paso(2, 3, "Generando descripción, duración, proyección y referencia con Groq…"))
      );

      const ia = await consultarGroq(clave, nombre, ficha, notas);
      guardarCache(nombre, { ficha: ficha, ia: ia, origen: origen });

      mostrarEstado(
        (origen === "fragrantica"
          ? paso(1, 4, "Encontrado: " + ficha.nombre) + paso(2, 4, "Notas extraídas.") + paso(3, 4, "IA completada.")
          : paso(1, 3, "IA completada.")) +
        paso(origen === "fragrantica" ? 4 : 3, origen === "fragrantica" ? 4 : 3, "✅ Listo.")
      );

      renderResultado(nombre, ficha, ia, origen);
    } catch (err) {
      mostrarEstado("❌ " + err.message, true);
    } finally {
      btnBuscar.disabled = false;
    }
  });
})();
