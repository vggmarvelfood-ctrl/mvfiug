// api/stats-venta.js — Registra estadísticas de venta usando Admin SDK
//
// ¿Por qué existe este endpoint?
// Las reglas de Firestore exigen request.auth != null para crear docs en
// stats_ventas, pero el flujo de pedido del cliente es completamente anónimo.
// El Admin SDK (server-side) ignora las reglas de seguridad, lo que permite
// escribir stats sin relajar las reglas ni exponer credenciales al cliente.
//
// Requiere las mismas env vars que api/pedido.js:
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fecha, hora, total, sucursalId, items, ts } = req.body || {};

  // Validación mínima
  if (!fecha || typeof total !== 'number' || total <= 0 || !sucursalId) {
    return res.status(400).json({ error: 'Payload inválido' });
  }

  const SUCURSALES_VALIDAS = ['Centro', 'Norte', 'Sur', 'Funes', 'Cafferata'];
  if (!SUCURSALES_VALIDAS.includes(sucursalId)) {
    return res.status(400).json({ error: 'sucursalId inválido' });
  }

  let db;
  try {
    db = getAdminDb();
  } catch (e) {
    // Admin SDK no configurado (dev local sin env vars) — responder 503 para que
    // el front-end ignore silenciosamente el error sin romper el flujo del pedido.
    console.warn('[api/stats-venta] Admin SDK no disponible:', e.message);
    return res.status(503).json({ error: 'Admin SDK no configurado' });
  }

  try {
    const ref = db.collection('stats_ventas').doc(fecha);
    await ref.set({
      fecha,
      ventas: FieldValue.arrayUnion({
        hora: hora || new Date().getHours(),
        total,
        sucursalId,
        items: Array.isArray(items) ? items : [],
        ts: ts || Date.now(),
      })
    }, { merge: true });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[api/stats-venta] Error:', e.message);
    return res.status(500).json({ error: 'Error interno' });
  }
}
