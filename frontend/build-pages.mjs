// Compone las páginas HTML de Mundo Pets desde partials y estampa el hash de cada
// asset en el query `?v=` (cache-busting automático).
//
// Fuente:   frontend/src/pages/*.html  +  frontend/partials/*.html
// Salida:   frontend/*.html           (archivos servidos por Express)
//
// Uso: node build-pages.mjs   (o `npm run build` dentro de frontend/)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const FRONTEND = path.dirname(fileURLToPath(import.meta.url));

function leerPartial(name) {
  return fs.readFileSync(path.join(FRONTEND, 'partials', name), 'utf8').replace(/\r?\n$/, '');
}

function hash(rel) {
  const buf = fs.readFileSync(path.join(FRONTEND, rel));
  return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
}

const VERSIONES = {
  V_CSS: hash('dist/tailwind.css'),
  V_JS: hash('script.js'),
  V_ADMIN: hash('admin.js'),
  V_CATALOGO: hash('catalogo.js'),
  V_ALPINE: hash('vendor/alpine.min.js')
};

const SWEETALERT = '  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>\n';
const NOINDEX = `  <meta name="robots" content="noindex, nofollow" />\n${SWEETALERT}`;

const OG_INDEX = [
  '  <meta name="description" content="Mundo Pets — pet shop y servicios para el cuidado de tu mascota: alimentos, medicamentos, peluquería y guardería." />',
  '  <meta property="og:type" content="website" />',
  '  <meta property="og:site_name" content="Mundo Pets" />',
  '  <meta property="og:title" content="Mundo Pets — Cuidado profesional para tu mascota" />',
  '  <meta property="og:description" content="Catálogo, agenda de servicios y compra en línea." />',
  '  <meta property="og:image" content="/img/mundopets_mejorada.webp" />',
  '  <meta name="twitter:card" content="summary_large_image" />',
  '  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"PetStore","name":"Mundo Pets","description":"Pet shop y servicios para el cuidado de tu mascota","image":"/img/mundopets_mejorada.webp","telephone":"+573017810651","sameAs":["https://www.instagram.com/official_mundopets","https://www.tiktok.com/@mundo.pets91"]},{"@type":"WebSite","name":"Mundo Pets"}]}</script>',
  ''
].join('\n');

const OG_CATALOGO = [
  '  <meta name="description" content="Catálogo de productos y servicios de Mundo Pets: alimentos, medicamentos, peluquería y guardería para tu mascota." />',
  '  <meta property="og:type" content="website" />',
  '  <meta property="og:site_name" content="Mundo Pets" />',
  '  <meta property="og:title" content="Catálogo — Mundo Pets" />',
  '  <meta property="og:description" content="Explora productos y servicios para el cuidado de tu mascota." />',
  '  <meta property="og:image" content="/img/mundopets_mejorada.webp" />',
  '  <meta name="twitter:card" content="summary_large_image" />',
  ''
].join('\n');

const PAGES = [
  { file: 'index.html', title: 'Mundo Pets', head: OG_INDEX },
  { file: 'catalogo.html', title: 'Catálogo - Mundo Pets', head: OG_CATALOGO },
  { file: 'login.html', title: 'Login - Mundo Pets', head: NOINDEX },
  { file: 'register.html', title: 'Registro - Mundo Pets', head: NOINDEX },
  { file: 'dashboard.html', title: 'Dashboard - Mundo Pets', head: NOINDEX },
  { file: 'admin.html', title: 'Panel Admin - Mundo Pets', head: NOINDEX }
];

const headTpl = leerPartial('head.html');
const contact = leerPartial('contact.html');

for (const page of PAGES) {
  const tpl = fs.readFileSync(path.join(FRONTEND, 'src', 'pages', page.file), 'utf8');
  const head = headTpl
    .replace('{{TITLE}}', page.title)
    .replace('{{PAGE_HEAD}}', page.head)
    .replace('{{V_CSS}}', VERSIONES.V_CSS);

  const out = tpl
    .replace('{{HEAD}}', head)
    .replace('{{CONTACT}}', contact)
    .replace(/\{\{V_CSS\}\}/g, VERSIONES.V_CSS)
    .replace(/\{\{V_JS\}\}/g, VERSIONES.V_JS)
    .replace(/\{\{V_ADMIN\}\}/g, VERSIONES.V_ADMIN)
    .replace(/\{\{V_CATALOGO\}\}/g, VERSIONES.V_CATALOGO)
    .replace(/\{\{V_ALPINE\}\}/g, VERSIONES.V_ALPINE);

  if (/\{\{/.test(out)) {
    console.error(`ERROR: quedaron placeholders sin resolver en ${page.file}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(FRONTEND, page.file), out, 'utf8');
  console.log(`página generada: ${page.file}`);
}

console.log('versiones:', VERSIONES);
