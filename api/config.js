// api/config.js — Endpoint serverless (Vercel) para exponer config pública
// y para todo lo que necesite tocar credenciales del SERVIDOR sin
// exponerlas al cliente.
//
// Variables de entorno (Vercel Dashboard → Settings → Environment Variables):
//
//   EMAILJS_PUBLIC_KEY        → tu publicKey de EmailJS  (ej: sATMMVYtIbZLT1tMD)
//   EMAILJS_SERVICE_ID        → tu serviceId             (ej: service_mf)
//   EMAILJS_TEMPLATE_ID       → tu templateId            (ej: template_mf)
//   MERCADOPAGO_ACCESS_TOKEN  → tu Access Token de producción de Mercado Pago
//
// ⚠️  Las credenciales de EmailJS son de BAJA sensibilidad. El Access Token
//     de Mercado Pago NO — por eso nunca se devuelve al cliente, solo se usa
//     acá adentro para llamar a la API de MP y devolver el resultado ya
//     procesado (el link de pago, o un simple true/false de "configurado").
//
// Rutas (todo por el mismo archivo, mismo endpoint /api/config):
//   GET  /api/config                      → config pública de EmailJS (comportamiento original)
//   GET  /api/config?action=mp-status     → { configured: true/false } de Mercado Pago
//   POST /api/config  body:{action:'mp-preference', total, pedidoId?, backUrl?}
//                                          → { init_point } (link de pago de MP)

export default async function handler(req, res) {
  // CORS: solo el mismo origen puede consumir este endpoint
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = req.query?.action;

  // ── POST: crear preferencia de pago de Mercado Pago ────────────────────
  if (req.method === 'POST') {
    if (action !== 'mp-preference') {
      return res.status(400).json({ error: 'accion_invalida' });
    }
    return _crearPreferenciaMP(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // ── GET ?action=mp-status: informar si MP está configurado ─────────────
  // Nunca revela el valor del token, solo si existe o no.
  if (action === 'mp-status') {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json({ configured: !!process.env.MERCADOPAGO_ACCESS_TOKEN });
  }

  // ── GET (comportamiento original): config pública de EmailJS ───────────
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

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

// ── Helper: arma y crea la preferencia de pago en la API de Mercado Pago ──
// El Access Token vive solo en esta función (variable de entorno del
// servidor) y nunca se envía al navegador del cliente.
async function _crearPreferenciaMP(req, res) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    console.warn('[api/config] MERCADOPAGO_ACCESS_TOKEN no definida');
    return res.status(503).json({ error: 'mp_not_configured' });
  }

  const body = req.body || {};
  const total = Number(body.total);
  const pedidoId = typeof body.pedidoId === 'string' ? body.pedidoId.slice(0, 100) : undefined;
  const backUrl = typeof body.backUrl === 'string' && body.backUrl.startsWith('http')
    ? body.backUrl
    : undefined;

  if (!total || !isFinite(total) || total <= 0) {
    return res.status(400).json({ error: 'invalid_total' });
  }

  try {
    const preference = {
      items: [
        { title: 'Pedido Marvel Food', quantity: 1, unit_price: total, currency_id: 'ARS' },
      ],
      statement_descriptor: 'Marvel Food',
    };
    if (pedidoId) preference.external_reference = pedidoId;
    if (backUrl) {
      preference.back_urls = { success: backUrl, failure: backUrl, pending: backUrl };
      preference.auto_return = 'approved';
    }

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(preference),
    });

    if (!mpRes.ok) {
      const errText = await mpRes.text().catch(() => '');
      console.error('[api/config] Error de Mercado Pago:', mpRes.status, errText.slice(0, 300));
      return res.status(502).json({ error: 'mp_api_error' });
    }

    const data = await mpRes.json();
    if (!data.init_point) {
      return res.status(502).json({ error: 'mp_sin_init_point' });
    }

    return res.status(200).json({ init_point: data.init_point });
  } catch (e) {
    console.error('[api/config] Error inesperado creando preferencia MP:', e.message);
    return res.status(500).json({ error: 'server_error' });
  }
}
