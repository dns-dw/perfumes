/* ============================================================
   Sección 2 — Buscador de Perfumes
   ------------------------------------------------------------
   Flujo:
   1. Resolver el perfume en Fragrantica (búsqueda).
   2. Extraer sus notas (pirámide salida/corazón/fondo).
   3. Enviar las notas a Groq (openai/gpt-oss-20b) para generar
      descripción, duración, proyección y referencia conocida.

   Todo ocurre en el navegador. Las peticiones a Fragrantica se
   hacen a través de proxies CORS públicos (Fragrantica no envía
   cabeceras CORS) y con pausas entre peticiones para respetar
   sus rate limits. Los resultados se cachean en localStorage.
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Configuración ---------- */

  const FRAG_BASE = "https://www.fragrantica.es";
  const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
  const GROQ_MODELO = "openai/gpt-oss-20b";

  const PAUSA_ENTRE_PETICIONES_MS = 1200; // respeto de rate limits
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

  // Proxies CORS públicos, en orden de preferencia.
  const PROXIES = [
    function (url) { return "https://corsproxy.io/?url=" + encodeURIComponent(url); },
    function (url) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(url); },
    function (url) { return "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(url); }
  ];

  /* ---------- Elementos ---------- */

  const form = document.getElementById("form-buscador");
  const input = document.getElementById("input-perfume");
  const btnBuscar = document.getElementById("btn-buscar");
  const estado = document.getElementById("estado-busqueda");
  const resultado = document.getElementById("resultado");
  const btnConfigClave = document.getElementById("btn-config-clave");

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

  async function pausaRespetuosa() {
    const espera = PAUSA_ENTRE_PETICIONES_MS - (Date.now() - ultimaPeticion);
    if (espera > 0) await dormir(espera);
    ultimaPeticion = Date.now();
  }

  // Petición a través de proxies CORS, probando en orden.
  async function fetchConProxy(url, options) {
    const errores = [];
    for (const hacerUrl of PROXIES) {
      try {
        const resp = await fetch(hacerUrl(url), options);
        if (resp.ok) return resp;
        errores.push(resp.status);
      } catch (e) {
        errores.push(e.message);
      }
    }
    throw new Error("No se pudo contactar con Fragrantica a través de los proxies CORS (" + errores.join(", ") + ").");
  }

  function mostrarEstado(html, esError) {
    estado.hidden = false;
    estado.classList.toggle("error", !!esError);
    estado.innerHTML = html;
  }

  function paso(num, total, texto) {
    return '<span class="paso">[' + num + "/" + total + "] " + escapar(texto) + "</span>";
  }

  /* ---------- Clave de Groq ---------- */

  function obtenerClaveGroq() {
    return (
      window.GROQ_API_KEY ||
      localStorage.getItem("GROQ_API_KEY") ||
      ""
    ).trim();
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

  btnConfigClave.addEventListener("click", pedirClaveGroq);

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

  /* ---------- Paso 1: resolver el perfume en Fragrantica ---------- */

  async function buscarEnFragrantica(nombre) {
    const urlBusqueda = FRAG_BASE + "/buscar/?query=" + encodeURIComponent(nombre);

    await pausaRespetuosa();
    const resp = await fetchConProxy(urlBusqueda);
    const html = await resp.text();

    // Estrategia A: búsqueda con Algolia (la usa el buscador actual de Fragrantica).
    try {
      return await buscarConAlgolia(html, nombre);
    } catch (e) {
      // Estrategia B: parsear enlaces /perfume/ del HTML de búsqueda.
      return buscarEnEnlaces(html, nombre);
    }
  }

  async function buscarConAlgolia(htmlBusqueda, nombre) {
    const appId = (htmlBusqueda.match(/"algoliaAppId":"([A-Z0-9]+)"/) || [])[1];
    const b64 = (htmlBusqueda.match(/let toAbby = "([A-Za-z0-9+/=]+)"/) || [])[1];
    if (!appId || !b64) throw new Error("sin credenciales Algolia");

    let clave;
    try {
      clave = atob(b64).slice(0, 64); // la clave es la primera parte del valor decodificado
    } catch (e) {
      throw new Error("clave Algolia inválida");
    }

    const cuerpo = JSON.stringify({
      query: nombre,
      hitsPerPage: 5,
      attributesToRetrieve: ["naslov", "dizajner", "godina", "id", "slug"]
    });

    const resp = await fetch(
      "https://" + appId + "-dsn.algolia.net/1/indexes/fragrantica_perfumes/query",
      {
        method: "POST",
        headers: {
          "X-Algolia-Application-Id": appId,
          "X-Algolia-API-Key": clave,
          "Content-Type": "application/json"
        },
        body: cuerpo
      }
    );
    if (!resp.ok) throw new Error("Algolia respondió " + resp.status);

    const datos = await resp.json();
    const hits = (datos.hits || []).filter(function (h) { return h.slug; });
    if (!hits.length) throw new Error("sin resultados en Algolia");

    return hits.map(function (h) {
      return {
        nombre: h.naslov,
        casa: h.dizajner || "",
        ano: h.godina ? String(h.godina) : "",
        url: FRAG_BASE + "/perfume/" + h.slug,
        id: h.id
      };
    });
  }

  function buscarEnEnlaces(html, nombre) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const vistos = {};
    const candidatos = [];

    doc.querySelectorAll('a[href*="/perfume/"]').forEach(function (a) {
      const href = a.getAttribute("href");
      if (!href || vistos[href]) return;
      vistos[href] = true;
      const partes = href.split("/");
      const slug = partes[partes.length - 1] || "";
      const m = slug.match(/-(\d+)\.html$/);
      candidatos.push({
        nombre: a.textContent.trim() || slug.replace(/[-_]/g, " ").replace(/\.html$/, ""),
        casa: "",
        ano: "",
        url: href.charAt(0) === "/" ? FRAG_BASE + href : href,
        id: m ? m[1] : null
      });
    });

    if (!candidatos.length) throw new Error("No se encontró el perfume en Fragrantica.");

    // Ordenar por parecido con el nombre buscado.
    const tokens = nombre.toLowerCase().split(/\s+/).filter(Boolean);
    candidatos.sort(function (a, b) {
      return puntuacion(b, tokens) - puntuacion(a, tokens);
    });

    return candidatos.slice(0, 5);
  }

  function puntuacion(c, tokens) {
    const texto = (c.nombre + " " + c.url).toLowerCase();
    return tokens.reduce(function (acc, t) {
      return acc + (texto.indexOf(t) !== -1 ? 1 : 0);
    }, 0);
  }

  /* ---------- Paso 2: extraer notas de la ficha ---------- */

  async function extraerNotas(ficha) {
    await pausaRespetuosa();
    const resp = await fetchConProxy(ficha.url);
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    const notas = {
      salida: [],
      corazon: [],
      fondo: [],
      principales: []
    };

    // Pirámide completa (salida / corazón / fondo) vía ajax.php.
    const piramide = await intentarPiramideAjax(html, ficha);
    if (piramide) {
      notas.salida = piramide.salida || [];
      notas.corazon = piramide.corazon || [];
      notas.fondo = piramide.fondo || [];
    }

    // Notas principales (renderizadas en el HTML, disponibles siempre).
    doc.querySelectorAll("#pyramid a.pyramid-note-link, pyramid-level-new a").forEach(function (a) {
      const span = a.querySelector(".pyramid-note-label");
      const img = a.querySelector("img");
      const nota = (span ? span.textContent : img ? img.alt : a.textContent).trim();
      if (nota && notas.principales.indexOf(nota) === -1) notas.principales.push(nota);
    });

    return notas;
  }

  async function intentarPiramideAjax(html, ficha) {
    try {
      const token = (html.match(/pyramidRequestToken = "([a-f0-9]+)"/) || [])[1];
      let id = ficha.id;
      if (!id) {
        const m = html.match(/perfume_id="?(\d+)"?/) || ficha.url.match(/-(\d+)\.html$/);
        id = m ? m[1] : null;
      }
      if (!token || !id) return null;

      const formData = new FormData();
      formData.append("perfume_id", id);
      formData.append("pyramid_token", token);
      formData.append("action", "pyramid");

      await pausaRespetuosa();
      const resp = await fetchConProxy(
        FRAG_BASE + "/ajax.php?pyramid&" + Date.now(),
        { method: "POST", body: formData }
      );
      const datos = await resp.json();

      // El formato exacto puede variar; buscamos de forma tolerante.
      const texto = JSON.stringify(datos).toLowerCase();
      const clavesSalida = /salida|top/;
      const clavesCorazon = /coraz|heart|middle/;
      const clavesFondo = /fondo|base/;

      const salida = [], corazon = [], fondo = [];

      function recorrer(obj, ruta) {
        if (Array.isArray(obj)) {
          if (!obj.length) return;
          if (typeof obj[0] === "string" || typeof obj[0] === "number") {
            const lista = obj.map(String);
            if (clavesSalida.test(ruta)) salida.push.apply(salida, lista);
            else if (clavesCorazon.test(ruta)) corazon.push.apply(corazon, lista);
            else if (clavesFondo.test(ruta)) fondo.push.apply(fondo, lista);
          } else {
            obj.forEach(function (o) { recorrer(o, ruta); });
          }
        } else if (obj && typeof obj === "object") {
          Object.keys(obj).forEach(function (k) {
            recorrer(obj[k], ruta + " " + k);
          });
        }
      }
      recorrer(datos, "");

      if (salida.length || corazon.length || fondo.length) {
        return { salida: salida, corazon: corazon, fondo: fondo };
      }
      return null;
    } catch (e) {
      // Cloudflare/429 u otro error: seguimos con las notas principales.
      return null;
    }
  }

  /* ---------- Paso 3: enriquecer con Groq ---------- */

  async function consultarGroq(clave, nombre, ficha, notas) {
    const notasDisponibles =
      (notas.salida.length || notas.corazon.length || notas.fondo.length)
        ? {
            salida: notas.salida,
            corazon: notas.corazon,
            fondo: notas.fondo
          }
        : { principales: notas.principales };

    const sistema =
      "Eres un experto perfumista. Responde ÚNICAMENTE con un objeto JSON válido con estas claves: " +
      '"descripcion" (texto de 2 o 3 frases en español), "duracion" (rango en horas, p. ej. "6-8 h"), ' +
      '"proyeccion" (corta: suave, moderada o fuerte, con una breve nota), ' +
      '"salida", "corazon", "fondo" (arrays de notas en español: si te las damos, corrige/completa; si no, ' +
      "infierlas lo mejor posible a partir de las notas principales y del nombre), y " +
      '"referencia" (la referencia conocida más cercana: a qué perfume famoso se parece, en formato ' +
      '"Similar a X" o "Cruce entre X e Y", en español). ' +
      "Reglas: cítricos frescos -> uso de día, oficina y calor; especiados intensos -> noche, salidas y frío; " +
      "bases limpias de ámbar y almizcle -> uso versátil. Sin texto fuera del JSON.";

    const usuario =
      "Perfume: " + nombre +
      (ficha && ficha.casa ? "\nCasa: " + ficha.casa : "") +
      (ficha && ficha.ano ? "\nAño: " + ficha.ano : "") +
      "\nNotas conocidas: " + JSON.stringify(notasDisponibles);

    const resp = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + clave,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODELO,
        messages: [
          { role: "system", content: sistema },
          { role: "user", content: usuario }
        ],
        temperature: 0.4,
        response_format: { type: "json_object" }
      })
    });

    if (!resp.ok) {
      const detalle = await resp.text().catch(function () { return ""; });
      if (resp.status === 401 || resp.status === 403) {
        throw new Error("La clave de Groq no es válida o no tiene permisos. Revisa GROQ_API_KEY.");
      }
      throw new Error("Groq respondió con error " + resp.status + ". " + detalle.slice(0, 200));
    }

    const datos = await resp.json();
    const contenido = datos.choices[0].message.content;
    return JSON.parse(contenido.replace(/```json|```/g, "").trim());
  }

  /* ---------- Renderizado del resultado ---------- */

  function renderResultado(nombreBuscado, ficha, ia) {
    const fichaFinal = ficha || { nombre: nombreBuscado, casa: "", ano: "", url: "" };

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
        '<p class="resultado-fuente">Ficha: <a href="' + escapar(fichaFinal.url) + '" target="_blank" rel="noopener">Fragrantica</a>' +
        (ia.notas_inferidas ? " · notas inferidas por IA (Fragrantica limitó la pirámide completa)" : "") + "</p>" +
      "</div>";

    resultado.hidden = false;
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
      // Caché
      const cacheado = leerCache(nombre);
      if (cacheado) {
        mostrarEstado("✅ Resultado recuperado de la caché local (búsqueda reciente).");
        renderResultado(nombre, cacheado.ficha, cacheado.ia);
        return;
      }

      mostrarEstado(
        paso(1, 4, "Buscando «" + nombre + "» en Fragrantica…")
      );

      const candidatos = await buscarEnFragrantica(nombre);
      const ficha = candidatos[0];

      if (candidatos.length > 1) {
        mostrarEstado(
          paso(1, 4, "Buscando en Fragrantica…") +
          paso(2, 4, "Varias coincidencias; se usa la más parecida: " + ficha.nombre)
        );
      } else {
        mostrarEstado(
          paso(1, 4, "Encontrado: " + ficha.nombre) +
          paso(2, 4, "Extrayendo notas de la ficha…")
        );
      }

      const notas = await extraerNotas(ficha);

      if (!notas.salida.length && !notas.corazon.length && !notas.fondo.length && !notas.principales.length) {
        mostrarEstado(
          paso(1, 4, "Encontrado: " + ficha.nombre) +
          paso(2, 4, "Fragrantica no devolvió notas (posible límite de peticiones); se inferirán con IA."),
          false
        );
      }

      let clave = obtenerClaveGroq();
      if (!clave) {
        mostrarEstado(
          paso(1, 4, "Encontrado: " + ficha.nombre) +
          paso(2, 4, "Notas extraídas.") +
          '<span class="paso">[3/4] Se necesita la clave de Groq para continuar.</span>',
          false
        );
        clave = pedirClaveGroq();
        if (!clave) {
          mostrarEstado("⚠️ Búsqueda cancelada: sin clave de Groq no se puede generar la descripción. Las notas extraídas fueron: " +
            (notas.salida.concat(notas.corazon, notas.fondo, notas.principales).join(", ") || "no disponibles"), true);
          return;
        }
      }

      mostrarEstado(
        paso(1, 4, "Encontrado: " + ficha.nombre) +
        paso(2, 4, "Notas extraídas.") +
        paso(3, 4, "Generando descripción, duración, proyección y referencia con Groq…")
      );

      const ia = await consultarGroq(clave, nombre, ficha, notas);
      ia.notas_inferidas = !(notas.salida.length || notas.corazon.length || notas.fondo.length);

      guardarCache(nombre, { ficha: ficha, ia: ia });

      mostrarEstado(
        paso(1, 4, "Encontrado: " + ficha.nombre) +
        paso(2, 4, "Notas extraídas.") +
        paso(3, 4, "IA completada.") +
        paso(4, 4, "✅ Listo.")
      );

      renderResultado(nombre, ficha, ia);
    } catch (err) {
      mostrarEstado("❌ " + err.message, true);
    } finally {
      btnBuscar.disabled = false;
    }
  });
})();
