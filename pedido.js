// api/pedido.js — Rate limiting para envíos de pedidos
//
// Estrategia: ventana deslizante por IP almacenada en Firestore.
// Límite: 5 pedidos por IP cada 10 minutos.
//
// IMPORTANTE: este endpoint es un PROXY de validación, no el que guarda el pedido.
// El flujo es:
//   1. El front-end llama a POST /api/pedido con el payload del pedido.
//   2. Este endpoint valida el rate limit.
//   3. Si pasa, guarda en Firestore (colección pedidos_v2) y responde 201.
//   4. Si excede el límite, responde 429.
//
// Requiere estas env vars en Vercel:
//   FIREBASE_PROJECT_ID       → marvel-food-fa570
//   FIREBASE_CLIENT_EMAIL     → cuenta de servicio (Firebase Console → IAM)
//   FIREBASE_PRIVATE_KEY      → clave privada de la cuenta de servicio
//
// Para obtener estas credenciales:
//   Firebase Console → Project Settings → Service accounts → Generate new private key

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Inicializar Firebase Admin SDK una sola vez (hot-reload safe)
function getAdminDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      })
    });
  }
  return getFirestore();
}

// Configuración del rate limiter
const RATE_LIMIT = {
  maxRequests: 5,        // pedidos máximos por ventana
  windowMs: 10 * 60000, // ventana de 10 minutos
};

/**
 * Verifica y actualiza el rate limit para una IP dada.
 * Usa un documento Firestore con contador y timestamp de inicio de ventana.
 * Retorna { allowed: bool, remaining: int, resetMs: int }
 */
async function checkRateLimit(db, ip) {
  const ref = db.collection('_rate_limits').doc('pedido_' + ip.replace(/[.:]/g, '_'));
  const now = Date.now();

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;

    // Si no existe o la ventana expiró, crear nueva ventana
    if (!data || now - data.windowStart > RATE_LIMIT.windowMs) {
      tx.set(ref, {
        count: 1,
        windowStart: now,
        lastRequest: now,
        ip,
        // Auto-borrar este documento 1 hora después (TTL via Cloud Firestore TTL policy)
        // Configurar en Firebase Console → Firestore → TTL → campo "expireAt"
        expireAt: new Date(now + 60 * 60000),
      });
      return { allowed: true, remaining: RATE_LIMIT.maxRequests - 1, resetMs: now + RATE_LIMIT.windowMs };
    }

    // Ventana activa
    if (data.count >= RATE_LIMIT.maxRequests) {
      const resetMs = data.windowStart + RATE_LIMIT.windowMs;
      return { allowed: false, remaining: 0, resetMs };
    }

    tx.update(ref, {
      count: FieldValue.increment(1),
      lastRequest: now,
    });
    return {
      allowed: true,
      remaining: RATE_LIMIT.maxRequests - data.count - 1,
      resetMs: data.windowStart + RATE_LIMIT.windowMs,
    };
  });

  return result;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Obtener IP real (Vercel pone la IP en x-forwarded-for)
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  let db;
  try {
    db = getAdminDb();
  } catch (e) {
    console.error('[/api/pedido] Firebase Admin init error:', e.message);
    // Si el Admin SDK no está configurado (env vars faltantes), dejar pasar
    // para no romper la app en dev sin credenciales de servicio.
    return res.status(503).json({ error: 'Rate limiter no disponible. Configurá las env vars del Admin SDK.' });
  }

  // Verificar rate limit
  let limitResult;
  try {
    limitResult = await checkRateLimit(db, ip);
  } catch (e) {
    console.error('[/api/pedido] Rate limit check error:', e.message);
    // En caso de error en el rate limiter, dejar pasar para no romper la app
    limitResult = { allowed: true, remaining: -1, resetMs: 0 };
  }

  // Cabeceras estándar de rate limiting
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT.maxRequests));
  res.setHeader('X-RateLimit-Remaining', String(limitResult.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(limitResult.resetMs / 1000)));

  if (!limitResult.allowed) {
    const waitSecs = Math.ceil((limitResult.resetMs - Date.now()) / 1000);
    return res.status(429).json({
      error: 'Demasiados pedidos. Esperá unos minutos e intentá de nuevo.',
      retryAfterSeconds: waitSecs,
    });
  }

  // Rate limit OK — guardar pedido en Firestore
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Payload inválido' });
    }

    const docRef = await db.collection('pedidos_v2').add({
      ...payload,
      _serverTimestamp: FieldValue.serverTimestamp(),
      _clientIpHash: ip.split('.').slice(0, 2).join('.') + '.x.x', // anonimizar IP
    });

    return res.status(201).json({ id: docRef.id, ok: true });
  } catch (e) {
    console.error('[/api/pedido] Error guardando pedido:', e.message);
    return res.status(500).json({ error: 'Error interno al guardar el pedido.' });
  }
}
