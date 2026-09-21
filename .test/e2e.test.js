/* Prueba de extremo a extremo con jsdom.
   - Sección 1: renderizado de la tabla, filtros y búsqueda de texto.
   - Sección 2: buscador con HTML real capturado de Fragrantica y Groq simulado. */

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
  window.scrollIntoView = () => {};
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

/* ================= Sección 1 ================= */
console.log("\n[Sección 1] Tabla de favoritos");

{
  const window = crearDom();
  const document = window.document;
  const filas = document.querySelectorAll("#tbody-perfumes tr");
  afirmar(filas.length === 6, "La tabla muestra las 6 filas de perfumes");
  afirmar(filas[0].textContent.includes("Prada L'Homme"), "Primera fila: Prada L'Homme");
  afirmar(filas[5].textContent.includes("Hawas Fire"), "Última fila: Hawas Fire");
  afirmar(filas[0].textContent.includes("neroli") && filas[0].textContent.includes("pachulí"),
    "Prada L'Homme contiene sus notas de salida y fondo");

  // Filtro por familia: cítrica → Turathi Blue (cítricos de salida), L'Immensité y Hawas Fire
  const btnCitrica = document.querySelector('#filtro-familia [data-familia="cítrica"]');
  btnCitrica.click();
  const citricos = [...document.querySelectorAll("#tbody-perfumes td.col-perfume")].map((td) => td.textContent).join(" ");
  afirmar(citricos.includes("Turathi Blue") && citricos.includes("L'Immensité") && citricos.includes("Hawas Fire") &&
    !citricos.includes("Starwalker"),
    "Filtro familia 'cítrica' muestra Turathi Blue, L'Immensité y Hawas Fire");

  // Filtro por ocasión: noche (con cítrica activa → solo Turathi Blue tiene ambas etiquetas)
  document.querySelector('#filtro-ocasion [data-ocasion="noche"]').click();
  const citricaNoche = [...document.querySelectorAll("#tbody-perfumes td.col-perfume")].map((td) => td.textContent).join(" ");
  afirmar(citricaNoche.includes("Turathi Blue") && !citricaNoche.includes("L'Immensité"),
    "Cítrica + noche → solo Turathi Blue");

  // Reset y filtro noche solo
  document.querySelector('#filtro-familia [data-familia="todas"]').click();
  document.querySelector('#filtro-ocasion [data-ocasion="noche"]').click();
  const noche = [...document.querySelectorAll("#tbody-perfumes td.col-perfume")].map((td) => td.textContent).join(" ");
  afirmar(noche.includes("Turathi Blue") && noche.includes("No Limit"), "Filtro ocasión 'noche' muestra Turathi Blue y No Limit");

  // Búsqueda de texto
  document.querySelector('#filtro-ocasion [data-ocasion="todas"]').click();
  const input = document.getElementById("buscar-tabla");
  input.value = "ambroxan";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  const salida = [...document.querySelectorAll("#tbody-perfumes td.col-perfume")].map((td) => td.textContent).join(" ");
  afirmar(salida.includes("L'Immensité") && !salida.includes("Starwalker"), "Búsqueda 'ambroxan' filtra a L'Immensité");
}

/* ================= Sección 2 ================= */
console.log("\n[Sección 2] Buscador de perfumes");

const fragSearch = fs.readFileSync(path.join(__dirname, "frag_search.html"), "utf8"); // página /buscar/?query= real
const fragPerfume = fs.readFileSync(path.join(__dirname, "perf.html"), "utf8");       // ficha real de Turathi Blue

const respuestaJson = (obj) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(obj),
  text: () => Promise.resolve(JSON.stringify(obj))
});
const respuestaHtml = (texto) => ({
  ok: true,
  status: 200,
  text: () => Promise.resolve(texto),
  json: () => Promise.resolve(JSON.parse(texto))
});

async function probarBuscador() {
  const window = crearDom();
  const document = window.document;
  window.localStorage.setItem("GROQ_API_KEY", "clave-de-prueba");

  const llamadas = { algolia: 0, piramide: 0, groq: 0, fragrantica: 0 };

  window.fetch = (url, options = {}) => {
    const u = decodeURIComponent(String(url)); // las peticiones a Fragrantica van dentro de un proxy CORS
    if (u.includes("algolia.net")) {
      llamadas.algolia++;
      // Simula la clave efímera inválida → debe pasar al plan B (enlaces)
      return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ status: 403 }) });
    }
    if (u.includes("api.groq.com")) {
      llamadas.groq++;
      const body = JSON.parse(options.body);
      if (!options.headers.Authorization.includes("clave-de-prueba")) throw new Error("clave no enviada");
      if (body.model !== "openai/gpt-oss-20b") throw new Error("modelo incorrecto: " + body.model);
      if (body.response_format?.type !== "json_object") throw new Error("falta response_format json");
      return Promise.resolve(respuestaJson({
        choices: [{
          message: {
            content: JSON.stringify({
              descripcion: "Un cítrico especiado intenso y moderno.",
              duracion: "7-9 h",
              proyeccion: "Fuerte las primeras horas",
              salida: ["cítricos"],
              corazon: ["notas amaderadas", "ámbar"],
              fondo: ["almizcle", "especias", "pachulí"],
              referencia: "Similar a Bleu de Chanel con más especias"
            })
          }
        }]
      }));
    }
    if (u.includes("ajax.php?pyramid")) {
      llamadas.piramide++;
      return Promise.resolve(respuestaJson({
        ok: true,
        top: ["cítricos"],
        middle: ["notas amaderadas", "ámbar"],
        base: ["almizcle", "especias", "pachulí"]
      }));
    }
    if (u.includes("fragrantica.es/buscar/")) {
      llamadas.fragrantica++;
      return Promise.resolve(respuestaHtml(fragSearch));
    }
    if (u.includes("fragrantica.es/perfume/")) {
      llamadas.fragrantica++;
      return Promise.resolve(respuestaHtml(fragPerfume));
    }
    return Promise.reject(new Error("URL inesperada: " + u));
  };

  const input = document.getElementById("input-perfume");
  input.value = "Afnan Turathi Blue";
  document.getElementById("form-buscador").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  // Esperar a que termine (botón se rehabilita al finalizar)
  await new Promise((res, rej) => {
    let intentos = 0;
    const t = setInterval(() => {
      intentos++;
      if (!document.getElementById("btn-buscar").disabled) { clearInterval(t); res(); }
      else if (intentos > 600) { clearInterval(t); rej(new Error("timeout esperando la búsqueda")); }
    }, 50);
  });

  const r = document.getElementById("resultado");
  afirmar(!r.hidden, "El resultado se muestra");
  const texto = r.textContent;
  afirmar(texto.includes("Referencia conocida cercana"), "Sección de referencia visible");
  afirmar(texto.includes("Similar a Bleu de Chanel"), "Referencia conocida renderizada");
  afirmar(texto.includes("7-9 h"), "Duración renderizada");
  afirmar(texto.includes("cítricos"), "Notas renderizadas");
  afirmar(llamadas.groq === 1, "Groq se llamó 1 vez con la clave y el modelo correctos");
  afirmar(llamadas.algolia >= 1, "Se intentó Algolia (clave efímera)");
  afirmar(llamadas.fragrantica >= 2, "Se consultó Fragrantica (búsqueda + ficha)");
  afirmar(!document.getElementById("estado-busqueda").classList.contains("error"),
    "No hay error en el estado");

  // Segunda búsqueda: debe venir de caché (sin llamadas nuevas a Groq)
  input.value = "Afnan Turathi Blue";
  document.getElementById("form-buscador").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((res) => {
    let intentos = 0;
    const t = setInterval(() => {
      intentos++;
      if (!document.getElementById("btn-buscar").disabled || intentos > 600) { clearInterval(t); res(); }
    }, 50);
  });
  afirmar(llamadas.groq === 1, "La segunda búsqueda usa la caché local");
  afirmar(document.getElementById("estado-busqueda").textContent.includes("caché"),
    "El estado indica que vino de caché");
}

probarBuscador()
  .then(() => {
    console.log(fallos === 0 ? "\n🎉 TODAS LAS PRUEBAS PASARON" : "\n💥 " + fallos + " prueba(s) fallaron");
    process.exit(fallos === 0 ? 0 : 1);
  })
  .catch((e) => { console.error("Error en la prueba:", e); process.exit(1); });
