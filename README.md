# 🧴 Dashboard de Perfumes

Dashboard web interactivo en español con dos secciones:

1. **Mis Perfumes Favoritos** — tabla principal con 6 perfumes de la colección
   (notas de salida/corazón/fondo, descripción, duración, proyección y recomendación de uso),
   con filtros por familia olfativa y ocasión. Funciona 100 % estático, sin claves ni servicios externos.
2. **Buscador de Perfumes** — escribe el nombre de cualquier perfume: se consulta
   **Fragrantica** para extraer sus notas y se envían a la API gratuita de **Groq**
   (`openai/gpt-oss-20b`) para generar la descripción, la duración, la proyección y una
   **referencia conocida cercana** (a qué perfume famoso se parece).

---

## Estructura del proyecto

```
├── index.html                  # Página principal (ambas secciones)
├── css/styles.css              # Estilos (responsive, interfaz en español)
├── js/data.js                  # Datos estáticos de los 6 perfumes favoritos
├── js/app.js                   # Tabla + filtros (Sección 1)
├── js/buscador.js              # Buscador: Fragrantica + Groq (Sección 2)
├── js/config.js.example        # Plantilla de la clave de Groq
├── scripts/generar-config.js   # Genera js/config.js desde .env (desarrollo local)
├── .env.example                # Plantilla de la variable de entorno
├── .github/workflows/deploy.yml# Despliegue en GitHub Pages
└── README.md
```

> ⚠️ `.env` y `js/config.js` están **ignorados por git**: la clave nunca se sube al repositorio.

---

## 1. Configurar la clave de Groq (`GROQ_API_KEY`)

La clave se obtiene gratis en [console.groq.com/keys](https://console.groq.com/keys).

### En local (desarrollo)

```bash
# 1. Copia la plantilla y añade tu clave
cp .env.example .env
#    edita .env → GROQ_API_KEY=gsk_tu_clave_real

# 2. Genera js/config.js a partir de .env (requiere Node.js)
node scripts/generar-config.js

# 3. Sirve la carpeta con cualquier servidor estático, por ejemplo:
npx serve .
```

Alternativa sin Node: copia `js/config.js.example` a `js/config.js` y escribe tu clave a mano.

> Aunque el buscador no funcione abriendo `index.html` con doble clic (`file://`),
> la Sección 1 sí. Para el buscador usa un servidor local (`npx serve .`) o el despliegue.

### En producción (GitHub Pages, vía GitHub Secrets)

1. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
2. Nombre: `GROQ_API_KEY`, valor: tu clave de Groq.
3. El workflow `.github/workflows/deploy.yml` genera `js/config.js` en el momento del
   despliegue **sin guardar la clave en el repositorio**.

> ⚠️ **Aviso de seguridad**: GitHub Pages sirve solo contenido estático, por lo que la clave
> acaba incrustada en el JavaScript público del sitio y cualquier visitante puede verla.
> Usa una clave de Groq con cuota gratuita, ro­tala si la compartes, y valora actualizar a un
> backend/proxy serverless si el sitio va a tener tráfico real. La app también permite
> que cada visitante introduzca **su propia clave** (se guarda solo en su navegador, en
> `localStorage`), de modo que puedes desplegar sin clave embebida.

---

## 2. Desplegar en GitHub Pages

Con el workflow incluido (recomendado):

1. Sube este repositorio a GitHub.
2. Añade el secreto `GROQ_API_KEY` (paso anterior).
3. En **Settings → Pages**: Source = **GitHub Actions**.
4. Haz push a `main` (o ejecuta el workflow a mano en la pestaña *Actions*).
5. En unos segundos el sitio estará en `https://<usuario>.github.io/<repositorio>/`.

O manualmente, desde la rama que quieras publicar:
**Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.

---

## 3. Cómo funciona el buscador

El buscador funciona en **dos modos**:

### Modo A — Solo IA (por defecto, cero configuración)

El nombre del perfume se envía a Groq (`openai/gpt-oss-20b`), que genera las notas
de salida/corazón/fondo, la descripción, la duración, la proyección y la referencia
conocida a partir de su conocimiento perfumístico. Las notas se etiquetan como
**«inferidas por IA»**.

### Modo B — Con pasarela de Fragrantica (notas reales, opcional)

Fragrantica no envía cabeceras CORS y su Cloudflare desafía las peticiones que salen
de IPs de datacenter (proxies CORS públicos, GitHub Actions, etc.), por lo que el
navegador no puede descargarla directamente. La solución es una **pasarela personal
gratuita con Google Apps Script** (5 minutos, sin tarjeta):

1. Entra en [script.google.com](https://script.google.com) → **Nuevo proyecto**.
2. Pega este código y guárdalo (`Ctrl+S`):

   ```javascript
   function doPost(e) {
     try {
       var p = JSON.parse(e.postData.contents);
       var url = p.url;
       var permitida = /^https:\/\/([a-z0-9-]+\.)?fragrantica\.[a-z.]+/i.test(url)
         || /^https:\/\/[A-Z0-9]+-dsn\.algolia\.net\//i.test(url);
       if (!url || !permitida) {
         return salida('URL no permitida. Solo fragrantica/algolia.', 400);
       }
       var opts = {
         method: (p.method || 'GET').toLowerCase(),
         muteHttpExceptions: true,
         followRedirects: true,
         headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0' }
       };
       if (p.headers) {
         var h = JSON.parse(JSON.stringify(p.headers));
         for (var k in h) opts.headers[k] = h[k];
       }
       if (p.body) opts.payload = p.body;
       var r = UrlFetchApp.fetch(url, opts);
       return salida(r.getContentText(), r.getResponseCode());
     } catch (err) {
       return salida('Error en la pasarela: ' + err.message, 500);
     }
   }

   function salida(texto, codigo) {
     // Apps Script añade Access-Control-Allow-Origin: * en apps web
     return ContentService.createTextOutput(texto)
       .setMimeType(ContentService.MimeType.TEXT);
   }
   ```

3. **Implementar → Nueva implementación** → tipo: **Aplicación web** ·
   ejecutar como: **Yo** · quién tiene acceso: **Cualquier usuario** · Implementar.
4. Copia la URL de la aplicación web (termina en `/exec`).
5. En el dashboard, pulsa **«Configurar pasarela de Fragrantica»** y pega la URL
   (se guarda solo en tu navegador, en `localStorage`).

Con la pasarela activa, cada búsqueda hace esto (siempre respetando pausas de ~1 s):

1. La pasarela descarga la página de búsqueda de Fragrantica (sus IPs de Google
   pasan el Cloudflare del sitio) y se extrae la **clave efímera** de su buscador
   interno (Algolia, válida ~5 min).
2. La consulta a Algolia va también por la pasarela (la clave está ligada a la IP
   que la generó) y devuelve la ficha exacta: nombre, casa, año y URL.
3. La pasarela descarga la ficha del perfume: se extraen las **notas principales**
   y, si Fragrantica lo permite, la **pirámide completa** (salida/corazón/fondo)
   desde su endpoint interno.
4. Groq redacta la descripción, duración, proyección y referencia usando las
   **notas reales** (etiquetadas como «Notas extraídas de Fragrantica»).

### Límites y buen uso

- Pausa de ~1 s entre peticiones y resultados cacheados en `localStorage` 24 h
  (no se repiten consultas).
- La pasarela de Apps Script tiene cuota gratuita de ~20.000 peticiones/día:
  de sobra para uso personal.
- Si la pasarela falla (cuota, cambios en Fragrantica), el buscador avisa y
  genera la ficha en Modo A (solo IA) automáticamente.
- La cuota gratuita de Groq tiene límite de peticiones/minuto; si se agota,
  espera un momento y reintenta.

---

## 4. Desarrollo local rápido

```bash
npx serve .          # o: python -m http.server, php -S localhost:8000, etc.
```

La Sección 1 no necesita nada más. Para la Sección 2 recuerda configurar la clave (paso 1).

## 5. Pruebas

Pruebas automatizadas de la interfaz (jsdom) con HTML real capturado de Fragrantica:

```bash
cd .test && npm install && node e2e.test.js
```
