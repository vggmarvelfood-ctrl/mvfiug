// api/build-info.js — Expone el timestamp del último deploy
// Vercel inyecta VERCEL_DEPLOYMENT_ID en cada deploy; lo usamos como
// "versión" sin necesidad de tocarlo manualmente en cada release.
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  // Cache corto: 5 minutos en el CDN. El SW lo compara con su versión en caché.
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  const deployId = process.env.VERCEL_DEPLOYMENT_ID
    || process.env.VERCEL_GIT_COMMIT_SHA
    || String(Date.now()); // fallback para dev local

  return res.status(200).json({ deployId });
}
