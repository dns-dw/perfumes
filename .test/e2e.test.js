/* Prueba de extremo a extremo con jsdom.
   - Sección 1: renderizado de la tabla, filtros y búsqueda de texto.
   - Sección 2a: buscador SIN pasarela (solo IA, notas inferidas).
   - Sección 2b: buscador CON pasarela (Fragrantica real simulado + notas reales). */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const raiz = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(raiz, "index.html"), "utf8");

let fallos = 0;
function afirmar(cond, msg) {
  if (cond) console.log("  ✅ " + msg);
  else { fallos++; console.error("  ❌ " + msg); }
}

function crearDom() {
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  // En el navegador, las declaraciones top-level de scripts clásicos comparten
  // el ámbito léxico global; en jsdom cada eval() es independiente, así que
  // concatenamos los archivos en un único eval (mismo orden de carga).
  const codigo = ["js/data.js", "js/app.js", "js/buscador.js"]
    .map((f) => fs.readFileSync(path.join(raiz, f), "utf8"))
    .join("\n;\n");
  window.eval(codigo);
  return window;
}

function esperarBusqueda(window) {
  return new Promise((res, rej) => {
    let intentos = 0;
    const t = setInterval(() => {
      intentos++;
      if (!window.document.getElementById("btn-buscar").disabled) { clearInterval(t); res(); }
      else if (intentos > 800) { clearInterval(t); rej(new Error("timeout esperando la búsqueda")); }
    }, 50);
  });
}

function respuestaJson(obj) {
  return {
    ok: true, status: 200,
    json: () => Promise.resolve(obj),
    text: () => Promise.resolve(typeof obj === "string" ? obj : JSON.stringify(obj))
  };
}

const IA_FICHA = {
  descripcion: "Un cítrico especiado intenso y moderno.",
  duracion: "7-9 h",
  proyeccion: "Fuerte las primeras horas",
  salida: ["cítricos"],
  corazon: ["notas amaderadas", "ámbar"],
  fondo: ["almizcle", "especias", "pachulí"],
  referencia: "Similar a Bleu de Chanel con más especias"
};

function mockGroq(window, llamadas) {
  return (url, options = {}) => {
    if (String(url).includes("api.groq.com")) {
      llamadas.groq++;
      const body = JSON.parse(options.body);
      if (!options.headers.Authorization.includes("clave-de-prueba")) throw new Error("clave Groq no enviada");
      if (body.model !== "openai/gpt-oss-20b") throw new Error("modelo incorrecto: " + body.model);
      if (body.response_format?.type !== "json_object") throw new Error("falta response_format json");
      return Promise.resolve(respuestaJson({ choices: [{ message: { content: JSON.stringify(IA_FICHA) } }] }));
    }
    return null; // lo gestiona otro mock
  };
}

/* ================= Sección 1 ================= */
console.log("\n[Sección 1] Tabla de favoritos");

{
  const window = crearDom();
  const document = window.document;
  const filas = document.querySelectorAll("#tbody-perfumes tr");
  afirmar(filas.length === 6, "La tabla muestra las 6 filas de perfumes");
  afirmar(filas[0].textContent.includes("Prada L'Homme"), "Primera fila: Prada L'Homme");
  afirmar(filas[0].textContent.includes("neroli") && filas[0].textContent.includes("pachulí"),
    "Prada L'Homme contiene sus notas de salida y fondo");

  document.querySelector('#filtro-familia [data-familia="cítrica"]').click();
  const citricos = [...document.querySelectorAll("#tbody-perfumes td.col-perfume")].map((td) => td.textContent).join(" ");
  afirmar(citricos.includes("Turathi Blue") && citricos.includes("L'Immensité") && citricos.includes("Hawas Fire"),
    "Filtro familia 'cítrica' muestra Turathi Blue, L'Immensité y Hawas Fire");

  document.querySelector('#filtro-ocasion [data-ocasion="noche"]').click();
  const nocheCitrica = [...document.querySelectorAll("#tbody-perfumes td.col-perfume")].map((td) => td.textContent).join(" ");
  afirmar(nocheCitrica.includes("Turathi Blue") && !nocheCitrica.includes("L'Immensité"),
    "Cítrica + noche → solo Turathi Blue");

  document.querySelector('#filtro-familia [data-familia="todas"]').click();
  document.querySelector('#filtro-ocasion [data-ocasion="noche"]').click();
  const noche = [...document.querySelectorAll("#tbody-perfumes td.col-perfume")].map((td) => td.textContent).join(" ");
  afirmar(noche.includes("Turathi Blue") && noche.includes("No Limit"), "Filtro ocasión 'noche' muestra Turathi Blue y No Limit");

  document.querySelector('#filtro-ocasion [data-ocasion="todas"]').click();
  const input = document.getElementById("buscar-tabla");
  input.value = "ambroxan";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  const salida = [...document.querySelectorAll("#tbody-perfumes td.col-perfume")].map((td) => td.textContent).join(" ");
  afirmar(salida.includes("L'Immensité") && !salida.includes("Starwalker"), "Búsqueda 'ambroxan' filtra a L'Immensité");
}

/* ================= Sección 2a: sin pasarela ================= */
console.log("\n[Sección 2a] Buscador SIN pasarela (solo IA)");

async function probarSinPasarela() {
  const window = crearDom();
  const document = window.document;
  window.localStorage.setItem("GROQ_API_KEY", "clave-de-prueba"); // sin PASARELA_URL

  const llamadas = { groq: 0 };
  const mockBase = mockGroq(window, llamadas);
  window.fetch = (url, options) => {
    const r = mockBase(url, options);
    if (r) return r;
    return Promise.reject(new Error("No se esperaban otras llamadas en modo IA: " + url));
  };

  const input = document.getElementById("input-perfume");
  input.value = "Boss Bottled Elixir";
  document.getElementById("form-buscador").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await esperarBusqueda(window);

  const r = document.getElementById("resultado");
  afirmar(!r.hidden, "El resultado se muestra");
  const texto = r.textContent;
  afirmar(texto.includes("Referencia conocida cercana"), "Sección de referencia visible");
  afirmar(texto.includes("Similar a Bleu de Chanel"), "Referencia conocida renderizada");
  afirmar(texto.includes("7-9 h"), "Duración renderizada");
  afirmar(texto.includes("Notas inferidas por IA"), "Se indica que las notas son inferidas");
  afirmar(texto.includes("configura la pasarela"), "Se ofrece el enlace a la pasarela");
  afirmar(llamadas.groq === 1, "Groq se llamó 1 vez (clave y modelo correctos)");
  afirmar(!document.getElementById("estado-busqueda").classList.contains("error"), "Sin errores");
}

/* ================= Sección 2b: con pasarela ================= */
console.log("\n[Sección 2b] Buscador CON pasarela (Fragrantica real)");

async function probarConPasarela() {
  const window = crearDom();
  const document = window.document;
  window.localStorage.setItem("GROQ_API_KEY", "clave-de-prueba");
  const PASARELA = "https://pasarela.test/exec";
  window.localStorage.setItem("PASARELA_URL", PASARELA);

  const fragSearch = fs.readFileSync(path.join(__dirname, "frag_search.html"), "utf8"); // /buscar/ real
  const fragPerfume = fs.readFileSync(path.join(__dirname, "perf.html"), "utf8");       // ficha real
  const llamadas = { groq: 0, buscar: 0, algolia: 0, ficha: 0, piramide: 0 };

  const HITS = {
    hits: [{
      naslov: "Boss Bottled Elixir", dizajner: "Hugo Boss", godina: "2023",
      id: "84074", slug: "Hugo-Boss/Boss-Bottled-Elixir", spol: "male"
    }]
  };
  const PIRAMIDE = { top: ["cítricos"], middle: ["notas amaderadas", "ámbar"], base: ["almizcle", "especias", "pachulí"] };

  const mockBase = mockGroq(window, llamadas);
  window.fetch = (url, options = {}) => {
    const u = String(url);
    const r = mockBase(url, options);
    if (r) return r;

    if (u === PASARELA) {
      const peticion = JSON.parse(options.body);
      const destino = decodeURIComponent(peticion.url);
      if (destino.includes("fragrantica.es/buscar/")) { llamadas.buscar++; return Promise.resolve(respuestaJson(fragSearch)); }
      if (destino.includes("algolia.net")) {
        llamadas.algolia++;
        if (!peticion.headers["X-Algolia-API-Key"].includes("MT")) throw new Error("la clave no viaja a Algolia"); // clave real en b64
        return Promise.resolve(respuestaJson(HITS));
      }
      if (destino.includes("ajax.php?pyramid")) { llamadas.piramide++; return Promise.resolve(respuestaJson(PIRAMIDE)); }
      if (destino.includes("fragrantica.es/perfume/")) { llamadas.ficha++; return Promise.resolve(respuestaJson(fragPerfume)); }
      return Promise.reject(new Error("destino inesperado en pasarela: " + destino));
    }
    return Promise.reject(new Error("URL inesperada: " + u));
  };

  const input = document.getElementById("input-perfume");
  input.value = "Boss Bottled Elixir";
  document.getElementById("form-buscador").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await esperarBusqueda(window);

  const r = document.getElementById("resultado");
  const texto = r.textContent;
  afirmar(!r.hidden, "El resultado se muestra");
  afirmar(texto.includes("Boss Bottled Elixir"), "Ficha resuelta por Algolia (nombre real)");
  afirmar(texto.includes("Hugo Boss"), "Casa real de la ficha");
  afirmar(texto.includes("Notas extraídas de"), "Se indica que las notas vienen de Fragrantica");
  afirmar(!texto.includes("inferidas por IA"), "No aparece la etiqueta de notas inferidas");
  afirmar(texto.includes("Similar a Bleu de Chanel"), "Referencia conocida renderizada");
  afirmar(llamadas.buscar === 1 && llamadas.algolia === 1, "Pasarela: búsqueda + Algolia");
  afirmar(llamadas.ficha === 1 && llamadas.piramide === 1, "Pasarela: ficha + pirámide ajax");
  afirmar(llamadas.groq === 1, "Groq enriquece las notas reales");
  afirmar(!document.getElementById("estado-busqueda").classList.contains("error"), "Sin errores");

  // Segunda búsqueda: caché
  input.value = "Boss Bottled Elixir";
  document.getElementById("form-buscador").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await esperarBusqueda(window);
  afirmar(llamadas.groq === 1 && llamadas.buscar === 1, "La segunda búsqueda usa la caché local");
  afirmar(document.getElementById("estado-busqueda").textContent.includes("caché"),
    "El estado indica que vino de caché");
}

probarSinPasarela()
  .then(probarConPasarela)
  .then(() => {
    console.log(fallos === 0 ? "\n🎉 TODAS LAS PRUEBAS PASARON" : "\n💥 " + fallos + " prueba(s) fallaron");
    process.exit(fallos === 0 ? 0 : 1);
  })
  .catch((e) => { console.error("Error en la prueba:", e); process.exit(1); });
