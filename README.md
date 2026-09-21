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

1. **Resolución**: se descarga la página de búsqueda de Fragrantica (a través de proxies
   CORS públicos, porque Fragrantica no envía cabeceras CORS) y se usa su buscador
   interno (Algolia) para encontrar la ficha del perfume; si la clave efímera de Algolia
   falla, se analizan los enlaces `/perfume/` del HTML como alternativa.
2. **Notas**: se descarga la ficha del perfume y se intenta obtener la pirámide completa
   (salida/corazón/fondo); si Fragrantica la protege (Cloudflare / límite de peticiones),
   se usan las notas principales visibles en la página.
3. **Enriquecimiento**: las notas se envían a Groq (`openai/gpt-oss-20b`, API compatible
   con OpenAI) que devuelve JSON con descripción, duración, proyección, notas y referencia.

### Límites y buen uso

- Pausa de ~1,2 s entre peticiones a Fragrantica y reintentos limitados (respeto de rate limits).
- Resultados cacheados en `localStorage` durante 24 h para no repetir consultas.
- Fragrantica está protegida por Cloudflare: en algún momento puede bloquear las peticiones
  del proxy; en ese caso el buscador informa del error y sigue funcionando la Sección 1.
- La cuota gratuita de Groq tiene límite de peticiones/minuto; si se agota, espera un momento
  y vuelve a intentarlo.

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
