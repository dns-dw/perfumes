#!/usr/bin/env node
/* Genera js/config.js a partir del archivo .env (ignorado por git).
   Uso: node scripts/generar-config.js
   Esto permite leer GROQ_API_KEY desde .env en desarrollo local,
   sin exponerla en el repositorio. */

const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const rutaEnv = path.join(raiz, ".env");
const rutaSalida = path.join(raiz, "js", "config.js");

if (!fs.existsSync(rutaEnv)) {
  console.error("No se encontró .env. Copia .env.example a .env y añade tu GROQ_API_KEY.");
  process.exit(1);
}

const env = fs.readFileSync(rutaEnv, "utf8");
const match = env.match(/^\s*GROQ_API_KEY\s*=\s*(.+)\s*$/m);
if (!match || !match[1]) {
  console.error("No se encontró GROQ_API_KEY en .env.");
  process.exit(1);
}

const clave = match[1].trim().replace(/^["']|["']$/g, "");
const contenido =
  "// Generado automáticamente desde .env — NO subas este archivo a git.\n" +
  'window.GROQ_API_KEY = "' + clave + '";\n';

fs.writeFileSync(rutaSalida, contenido, "utf8");
console.log("✅ js/config.js generado a partir de .env");
