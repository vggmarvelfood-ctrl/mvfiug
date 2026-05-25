// build-env.js — script de build para inyectar variables de entorno en index.html
// Vercel ejecuta este script antes del deploy (definido en vercel.json → buildCommand)
// Las variables vienen de Vercel → Settings → Environment Variables

const fs = require('fs');

const vars = {
  '@FB_API_KEY@':            process.env.FB_API_KEY            || '',
  '@FB_MESSAGING_SENDER_ID@': process.env.FB_MESSAGING_SENDER_ID || '',
  '@FB_APP_ID@':             process.env.FB_APP_ID             || '',
  '@RECAPTCHA_SITE_KEY@':    process.env.RECAPTCHA_SITE_KEY    || '',
};

let html = fs.readFileSync('./index.html', 'utf8');

let replaced = 0;
for (const [placeholder, value] of Object.entries(vars)) {
  if (html.includes(placeholder)) {
    html = html.replaceAll(placeholder, value);
    replaced++;
  }
}

fs.writeFileSync('./index.html', html, 'utf8');
console.log(`[build-env] ${replaced} variables de entorno inyectadas en index.html`);

if (!vars['@FB_API_KEY@']) {
  console.warn('[build-env] ⚠️  FB_API_KEY está vacía — Firebase no va a funcionar en producción.');
  console.warn('[build-env]    Agregá las variables en Vercel → Settings → Environment Variables');
}
