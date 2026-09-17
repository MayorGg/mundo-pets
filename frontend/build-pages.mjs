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
  V_ALPINE: hash('vendor/alpine.min.js')
};

const SWEETALERT = '  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>\n';

const PAGES = [
  { file: 'index.html', title: 'Mundo Pets', pageHead: '' },
  { file: 'login.html', title: 'Login - Mundo Pets', pageHead: SWEETALERT },
  { file: 'register.html', title: 'Registro - Mundo Pets', pageHead: SWEETALERT },
  { file: 'dashboard.html', title: 'Dashboard - Mundo Pets', pageHead: SWEETALERT },
  { file: 'admin.html', title: 'Panel Admin - Mundo Pets', pageHead: SWEETALERT }
];

const headTpl = leerPartial('head.html');
const contact = leerPartial('contact.html');

for (const page of PAGES) {
  const tpl = fs.readFileSync(path.join(FRONTEND, 'src', 'pages', page.file), 'utf8');
  const head = headTpl
    .replace('{{TITLE}}', page.title)
    .replace('{{PAGE_HEAD}}', page.pageHead)
    .replace('{{V_CSS}}', VERSIONES.V_CSS);

  const out = tpl
    .replace('{{HEAD}}', head)
    .replace('{{CONTACT}}', contact)
    .replace(/\{\{V_CSS\}\}/g, VERSIONES.V_CSS)
    .replace(/\{\{V_JS\}\}/g, VERSIONES.V_JS)
    .replace(/\{\{V_ADMIN\}\}/g, VERSIONES.V_ADMIN)
    .replace(/\{\{V_ALPINE\}\}/g, VERSIONES.V_ALPINE);

  if (/\{\{/.test(out)) {
    console.error(`ERROR: quedaron placeholders sin resolver en ${page.file}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(FRONTEND, page.file), out, 'utf8');
  console.log(`página generada: ${page.file}`);
}

console.log('versiones:', VERSIONES);
