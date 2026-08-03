// api/config.js — Endpoint serverless (Vercel) para exponer config pública
// y para todo lo que necesite tocar credenciales del SERVIDOR sin
// exponerlas al cliente.
//
// Variables de entorno (Vercel Dashboard → Settings → Environment Variables):
//
//   EMAILJS_PUBLIC_KEY               → tu publicKey de EmailJS
//   EMAILJS_SERVICE_ID               → tu serviceId
//   EMAILJS_TEMPLATE_ID              → tu templateId
//   MERCADOPAGO_ACCESS_TOKEN_CENTRO    → token de MP de la sucursal Centro (Pellegrini)
//   MERCADOPAGO_ACCESS_TOKEN_NORTE     → token de MP de la sucursal Norte (Alberdi)
//   MERCADOPAGO_ACCESS_TOKEN_SUR       → token de MP de la sucursal Sur
//   MERCADOPAGO_ACCESS_TOKEN_FUNES     → token de MP de la sucursal Funes
//   MERCADOPAGO_ACCESS_TOKEN_CAFFERATA → token de MP de la sucursal Cafferata
//
// ⚠️  Las credenciales de EmailJS son de BAJA sensibilidad. Los Access Tokens
//     de Mercado Pago NO — por eso nunca se devuelven al cliente, solo se
//     usan acá adentro para llamar a la API de MP y devolver el resultado ya
//     procesado (el link de pago, o un simple true/false de "configurado").
//     Cada sucursal tiene su propia variable porque cada una cobra con una
//     cuenta de Mercado Pago distinta.
//
// Rutas (todo por el mismo archivo, mismo endpoint /api/config):
//   GET  /api/config                                       → config pública de EmailJS (comportamiento original)
//   GET  /api/config?action=mp-status&sucursalId=Centro     → { configured: true/false } de esa sucursal
//   POST /api/config  body:{action:'mp-preference', total, sucursalId, pedidoId?, backUrl?}
//                                                           → { init_point } (link de pago de MP de esa sucursal)

// Sucursales válidas — mismo enum que la regla de Firestore
// (pedidoValido()/ordenValida() en firestore.rules). Whitelist para no
// permitir que alguien arme nombres de variable de entorno arbitrarios
// por query string.
const SUCURSALES_VALIDAS = ['Centro', 'Norte', 'Sur', 'Funes', 'Cafferata'];

function _tokenDeSucursal(sucursalId) {
  if (!SUCURSALES_VALIDAS.includes(sucursalId)) return null;
  return process.env['MERCADOPAGO_ACCESS_TOKEN_' + sucursalId.toUpperCase()] || null;
}

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

  // ── GET ?action=mp-status: informar si MP está configurado para una
  // sucursal puntual ──────────────────────────────────────────────────
  // Nunca revela el valor del token, solo si existe o no.
  if (action === 'mp-status') {
    const sucursalId = req.query?.sucursalId;
    if (!SUCURSALES_VALIDAS.includes(sucursalId)) {
      return res.status(400).json({ error: 'sucursal_invalida' });
    }
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json({ configured: !!_tokenDeSucursal(sucursalId) });
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
  const body = req.body || {};
  const sucursalId = body.sucursalId;
  if (!SUCURSALES_VALIDAS.includes(sucursalId)) {
    return res.status(400).json({ error: 'sucursal_invalida' });
  }

  const token = _tokenDeSucursal(sucursalId);
  if (!token) {
    console.warn('[api/config] MERCADOPAGO_ACCESS_TOKEN_' + sucursalId.toUpperCase() + ' no definida');
    return res.status(503).json({ error: 'mp_not_configured' });
  }

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
        { title: 'Pedido Marvel Food - ' + sucursalId, quantity: 1, unit_price: total, currency_id: 'ARS' },
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
