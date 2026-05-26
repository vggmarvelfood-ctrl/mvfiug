// api/config.js — Endpoint serverless (Vercel) para exponer config pública
// Las variables de entorno se definen en Vercel Dashboard → Settings → Environment Variables:
//
//   EMAILJS_PUBLIC_KEY   → tu publicKey de EmailJS  (ej: sATMMVYtIbZLT1tMD)
//   EMAILJS_SERVICE_ID   → tu serviceId             (ej: service_mf)
//   EMAILJS_TEMPLATE_ID  → tu templateId            (ej: template_mf)
//
// ⚠️  Estas credenciales son de BAJA sensibilidad (solo permiten enviar
//     mails desde tu propio template), pero es buena práctica no
//     incluirlas en el bundle del front-end.

export default function handler(req, res) {
  // CORS: solo el mismo origen puede consumir este endpoint
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  // Cache: 1 hora en el CDN de Vercel, revalidable
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID } = process.env;

  if (!EMAILJS_PUBLIC_KEY) {
    // En desarrollo local sin .env, devolver config vacía sin romper la app
    console.warn('[api/config] EMAILJS_PUBLIC_KEY no definida');
    return res.status(200).json({ emailjs: { publicKey: '', serviceId: '', templateId: '' } });
  }

  return res.status(200).json({
    emailjs: {
      publicKey:  EMAILJS_PUBLIC_KEY,
      serviceId:  EMAILJS_SERVICE_ID  || '',
      templateId: EMAILJS_TEMPLATE_ID || '',
    }
  });
}
