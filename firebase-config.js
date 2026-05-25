// Firebase Modular 10.7.1 — inicialización y wrappers de compatibilidad
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
 getFirestore, collection, doc,
 getDoc, getDocs, addDoc, updateDoc, deleteDoc, setDoc,
 onSnapshot, query, where, orderBy, limit,
 serverTimestamp, arrayUnion, arrayRemove, increment,
 writeBatch  // ✅ FIX: importar writeBatch aquí en lugar de con import() dinámico en commit()
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
 getAuth, signInWithPopup, GoogleAuthProvider,
 onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const _fbConfig = {
 apiKey: "AIzaSyAeRlE9S5pnEUuhxRXoOX6lMX4Ryky0uSI",
 authDomain: "marvel-food-fa570.firebaseapp.com",
 projectId: "marvel-food-fa570",
 storageBucket: "marvel-food-fa570.firebasestorage.app",
 messagingSenderId: "351263580699",
 appId: "1:351263580699:web:9ba99708a021e5eabecebe",
 measurementId: "G-Z7X80SVSX6"
};

// Parchear DocumentSnapshot para que .exists sea una PROPIEDAD (igual que compat)
// En v9 modular .exists() es un método; el resto de la app lo usa como propiedad.
// ✅ FIX: ahora cubre también cada doc dentro de un QuerySnapshot (snap.docs[i].exists)
function _patchSnap(snap) {
 // Parchear DocumentSnapshot individual (no tiene .query; los QuerySnapshot sí)
 if (snap && typeof snap.exists === 'function' && !snap.query) {
  try {
   const _orig = snap.exists.bind(snap);
   Object.defineProperty(snap, 'exists', { get: () => _orig(), configurable: true });
  } catch(_) {}
 }
 // Parchear cada QueryDocumentSnapshot dentro de un QuerySnapshot
 // Sin esto, snap.docs[i].exists seguía siendo un método no una propiedad
 if (snap && snap.docs) {
  snap.docs.forEach(d => {
   if (typeof d.exists === 'function') {
    try {
     const _o = d.exists.bind(d);
     Object.defineProperty(d, 'exists', { get: () => _o(), configurable: true });
    } catch(_) {}
   }
  });
 }
 return snap;
}

// Query builder: soporta encadenamiento .where().orderBy().limit()
// ✅ FIX: onSnapshot ahora aplica _patchSnap al QuerySnapshot
function _qb(colRef, constraints) {
 return {
  where: (f, op, v) => _qb(colRef, [...constraints, where(f, op, v)]),
  orderBy: (f, dir) => _qb(colRef, [...constraints, orderBy(f, dir || 'asc')]),
  limit: (n) => _qb(colRef, [...constraints, limit(n)]),
  onSnapshot: (fn, errFn) => onSnapshot(query(colRef, ...constraints), snap => fn(_patchSnap(snap)), errFn),
  get: () => getDocs(query(colRef, ...constraints))
 };
}

// Wrapper de documento (reemplaza doc().get(), doc().update(), etc.)
// ✅ FIX: _ref expone la DocumentReference nativa para que _batchCompat.delete()
//    pueda pasarla a writeBatch.delete() correctamente. Sin esto, batch.delete()
//    recibía el objeto wrapper en lugar del DocumentReference real, causando
//    "Provided document reference is from a different Firestore instance".
function _docCompat(rawDb, colPath, id) {
 const ref = doc(rawDb, colPath, id);
 return {
  _ref: ref,   // ← referencia nativa — usada por _batchCompat
  get: () => getDoc(ref).then(_patchSnap),
  update: (data) => updateDoc(ref, data),
  set: (data, opts) => setDoc(ref, data, opts || {}),
  delete: () => deleteDoc(ref),
  onSnapshot: (fn, errFn) => onSnapshot(ref, snap => fn(_patchSnap(snap)), errFn)
 };
}

// Wrapper de colección (reemplaza db.collection('x').add(), .doc(), etc.)
// ✅ FIX: onSnapshot ahora aplica _patchSnap al QuerySnapshot
function _colCompat(rawDb, colPath) {
 const colRef = collection(rawDb, colPath);
 return {
  add: (data) => addDoc(colRef, data),
  doc: (id) => _docCompat(rawDb, colPath, id),
  where: (f, op, v) => _qb(colRef, [where(f, op, v)]),
  orderBy: (f, dir) => _qb(colRef, [orderBy(f, dir || 'asc')]),
  limit: (n) => _qb(colRef, [limit(n)]),
  onSnapshot: (fn, errFn) => onSnapshot(colRef, snap => fn(_patchSnap(snap)), errFn),
  get: () => getDocs(colRef)
 };
}

try {
 const _app = initializeApp(_fbConfig);
 const _rawDb = getFirestore(_app);
 // Exponer config para que window.CONFIG (zona-verificacion.js) no necesite duplicarla
 window._firebaseConfig = _fbConfig;

 // window.db: API idéntica a compat — ninguna llamada existente cambia
 // batch() añadido: admLimpiarDia lo necesita para borrado masivo atómico
 // ✅ FIX 1: `this` roto — las arrow functions en un objeto literal no tienen
 //    contexto propio; `return this` devolvía undefined en strict mode rompiendo
 //    el encadenamiento batch.delete(r1).delete(r2). Ahora se usa `batchObj`.
 // ✅ FIX 2: import() dinámico eliminado — writeBatch ya se importa al inicio.
 // ⚠️  LIMITACIÓN CONOCIDA: los chunks se ejecutan secuencialmente y cada uno
 //    es atómico, pero NO hay rollback entre chunks si uno falla a mitad de lote.
 function _batchCompat(rawDb) {
  const ops = [];
  const batchObj = {
   delete: (colOrRef) => {
    // Acepta tanto el resultado de db.collection().doc() como una ref directa
    const ref = colOrRef._ref || colOrRef;
    ops.push({ type: 'delete', ref });
    return batchObj;  // ✅ referencia explícita al objeto, no `this`
   },
   set: (colOrRef, data, opts) => {
    ops.push({ type: 'set', ref: colOrRef._ref || colOrRef, data, opts });
    return batchObj;  // ✅
   },
   update: (colOrRef, data) => {
    ops.push({ type: 'update', ref: colOrRef._ref || colOrRef, data });
    return batchObj;  // ✅
   },
   commit: async () => {
    // ✅ writeBatch ya está importado estáticamente arriba — sin import() dinámico
    const CHUNK = 499;
    for (let i = 0; i < ops.length; i += CHUNK) {
     const b = writeBatch(rawDb);
     ops.slice(i, i + CHUNK).forEach(op => {
      if (op.type === 'delete') b.delete(op.ref);
      else if (op.type === 'set') b.set(op.ref, op.data, op.opts || {});
      else if (op.type === 'update') b.update(op.ref, op.data);
     });
     await b.commit();
    }
   }
  };
  return batchObj;
 }

 window.db = {
  collection: (path) => _colCompat(_rawDb, path),
  batch: () => _batchCompat(_rawDb)
 };

 // Compatibilidad con firebase.firestore.FieldValue.serverTimestamp()
 window.firebase = {
  firestore: {
   FieldValue: { serverTimestamp: () => serverTimestamp(), arrayUnion: (...items) => arrayUnion(...items), arrayRemove: (...items) => arrayRemove(...items), increment: (n) => increment(n) }
  }
 };

 // Avisar al resto de la app que la DB está lista
 document.dispatchEvent(new CustomEvent('firebase:ready', { detail: { db: window.db } }));
 window._firebaseOk = true;

 // ── FIREBASE AUTH (Google) ──────────────────────────────────────────────
 const _auth = getAuth(_app);
 const _googleProvider = new GoogleAuthProvider();

 // Login con Google — signInWithPopup (el COOP warning es inofensivo; el redirect
 // activa bounce-tracking mitigation en Chrome y bloquea el acceso completamente)
 window.admGoogleLogin = async function() {
  const btn = document.getElementById('adm-google-btn');
  const pf  = document.getElementById('adm-pin-feedback');
  if (btn) { btn.disabled = true; btn.textContent = 'Conectando...'; }
  try {
   const result = await signInWithPopup(_auth, _googleProvider);
   
   // No llamar _verificarRol aquí: adm-pin-system.js mostrará el PIN dialog
  } catch (err) {
   console.error('[Auth] Error login:', err);
   if (err.code === 'auth/unauthorized-domain') {
    alert('⚠️ Dominio no autorizado en Firebase.\nFirebase Console → Authentication → Settings → Authorized domains\nAgregá: ' + window.location.hostname);
   } else if (err.code === 'auth/popup-blocked') {
    if (pf) { pf.textContent = 'El popup fue bloqueado. Habilitá popups para este sitio.'; pf.style.color='#ef4444'; }
   } else if (err.code !== 'auth/popup-closed-by-user') {
    alert('Error al iniciar sesión: ' + err.message);
   }
  } finally {
   if (btn) { btn.disabled = false; btn.textContent = 'Ingresar con Google'; }
  }
 };

 // Cerrar sesión Google
 window.admGoogleLogout = async function() {
  try { await signOut(_auth); } catch(e) {}
 };

 // ✅ FIX: onAuthStateChanged ahora llama a _verificarRolConClaims(user) directamente
 // en lugar de la función local _verificarRol(uid) que no verificaba custom claims.
 // La referencia se resuelve en tiempo de ejecución del callback, no en la
 // declaración, por lo que apunta siempre a la versión más reciente expuesta
 // en window._verificarRol (que es _verificarRolConClaims, definida más abajo).
 onAuthStateChanged(_auth, (user) => {
  if (user && sessionStorage.getItem('_mfa_ok')) {
   window._verificarRol(user);  // ✅ pasa el objeto user completo, no solo uid
  }
 });

 // Tarea 5: Firebase Cloud Messaging (FCM) — inicialización modular
 // VAPID_KEY: reemplazá con tu clave pública de FCM (Firebase Console > Project Settings > Cloud Messaging)
 const FCM_VAPID_KEY = 'BGnKQaPH1M8Yr1Q0jBXMZhwcgBXmHEQLKGJP0TjclgfOmnRWc3gQIZmGSGNf6SgO0h-Ade2k260AyXJJDp1vIQE';

 async function fcmInit() {
  try {
   const { getMessaging, getToken, onMessage } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js');
   const messaging = getMessaging(_app);
   window._fcmMessaging = messaging;

   // Escuchar mensajes con app abierta (foreground)
   onMessage(messaging, (payload) => {
    const n = payload.notification || {};
    const t = document.getElementById('toast');
    if (t) {
     t.innerText = (n.title || '') + (n.body ? ': ' + n.body : '');
     t.classList.add('show');
     setTimeout(() => t.classList.remove('show'), 5000);
    }
   });

   // ── _fcmGetToken con Exponential Backoff + Jitter ──────────────────
   // Reemplaza la versión anterior que tenía un único timeout de 8 s sin reintentos.
   //
   // Estrategia:
   //   • Hasta MAX_ATTEMPTS intentos, con espera entre cada uno de:
   //       delay = BASE_MS * 2^intento  +  jitter aleatorio (evita colisiones)
   //   • Errores clasificados en tres categorías:
   //       'permission_denied' → el usuario denegó notificaciones; abandonar de inmediato.
   //       'sw_timeout'        → el SW no estuvo listo en STEP_TIMEOUT_MS; reintentar.
   //       'token_error'       → Firestore/FCM rechazó; reintentar con backoff.
   //   • Cada sub-espera (controllerchange, ready, statechange) tiene su propio timeout
   //     controlado por Promise.race o setTimeout, nunca colgando indefinidamente.
   //
   const MAX_ATTEMPTS    = 4;       // intentos totales (1 inicial + 3 reintentos)
   const BASE_MS         = 1500;    // delay base en ms para el primer reintento
   const MAX_DELAY_MS    = 30000;   // techo del backoff (30 s)
   const STEP_TIMEOUT_MS = 10000;   // timeout por sub-paso (controller, ready, statechange)

   // Pequeño helper: jitter uniforme entre [0, cap]
   function _jitter(cap) {
    return Math.floor(Math.random() * cap);
   }

   // Calcula el delay para el intento `n` (base-2 exponential + jitter ±25 %)
   function _backoffDelay(n) {
    const exp    = BASE_MS * Math.pow(2, n);            // 1.5 s, 3 s, 6 s, 12 s…
    const capped = Math.min(exp, MAX_DELAY_MS);         // techo en 30 s
    const jitter = _jitter(Math.floor(capped * 0.25)); // hasta ±25 % aleatorio
    return capped + jitter;
   }

   // Espera a que haya un SW controlando la página, con timeout propio.
   // Devuelve true si logró controller, false si agotó el tiempo.
   function _waitForController(timeoutMs) {
    if (navigator.serviceWorker.controller) return Promise.resolve(true);
    return new Promise((resolve) => {
     const timer = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', handler);
      resolve(false); // timeout → 'sw_timeout', se reintentará
     }, timeoutMs);
     function handler() {
      clearTimeout(timer);
      resolve(true);
     }
     navigator.serviceWorker.addEventListener('controllerchange', handler, { once: true });
    });
   }

   // Espera a que el SW registrado alcance el estado 'activated', con timeout propio.
   // Devuelve true si activó, false si agotó el tiempo.
   function _waitForActivation(sw, timeoutMs) {
    if (!sw || sw.state === 'activated') return Promise.resolve(true);
    return new Promise((resolve) => {
     const timer = setTimeout(() => {
      sw.removeEventListener('statechange', handler);
      resolve(false); // timeout → 'sw_timeout', se reintentará
     }, timeoutMs);
     function handler(e) {
      if (e.target.state === 'activated') {
       clearTimeout(timer);
       sw.removeEventListener('statechange', handler);
       resolve(true);
      }
     }
     sw.addEventListener('statechange', handler);
    });
   }

   // Un único intento de obtener el token. Lanza un Error con .reason clasificado:
   //   'permission_denied' | 'sw_timeout' | 'token_error'
   async function _attemptGetToken() {
    // 1. Esperar controller (necesario para subscribe())
    const hasController = await _waitForController(STEP_TIMEOUT_MS);
    if (!hasController) {
     const err = new Error('[FCM] SW controller timeout');
     err.reason = 'sw_timeout';
     throw err;
    }

    // 2. Esperar que navigator.serviceWorker.ready resuelva, con su propio timeout.
    //    Usamos Promise.race para que el timeout y .ready compitan de forma justa,
    //    independientemente del tiempo que tomó el paso anterior.
    let reg;
    try {
     reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, rej) =>
       setTimeout(() => {
        const e = new Error('[FCM] SW ready timeout');
        e.reason = 'sw_timeout';
        rej(e);
       }, STEP_TIMEOUT_MS)
      ),
     ]);
    } catch (e) {
     if (!e.reason) e.reason = 'sw_timeout';
     throw e;
    }

    // 3. Asegurarse de que el SW esté activado (no solo registrado)
    const sw = reg.active || reg.installing || reg.waiting;
    if (sw && sw.state !== 'activated') {
     const activated = await _waitForActivation(sw, STEP_TIMEOUT_MS);
     if (!activated) {
      const err = new Error('[FCM] SW activation timeout');
      err.reason = 'sw_timeout';
      throw err;
     }
    }

    // 4. Solicitar el token FCM — aquí puede fallar por permiso o por error de red
    try {
     const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: reg,
     });
     return token || null;
    } catch (e) {
     // El usuario denegó notificaciones: no tiene sentido reintentar
     if (
      e.code === 'messaging/permission-blocked' ||
      e.code === 'messaging/permission-default' ||
      (e.message && e.message.includes('permission'))
     ) {
      e.reason = 'permission_denied';
     } else {
      e.reason = 'token_error';
     }
     throw e;
    }
   }

   window._fcmGetToken = async function() {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
     try {
      const token = await _attemptGetToken();
      if (attempt > 0) {
       console.log(`[FCM] Token obtenido en el intento ${attempt + 1}.`);
      }
      return token;
     } catch (err) {
      const reason = err.reason || 'token_error';
      const isLast = attempt === MAX_ATTEMPTS - 1;

      // 'permission_denied' es definitivo — no reintentar nunca
      if (reason === 'permission_denied') {
       console.warn('[FCM] Permiso de notificaciones denegado. No se reintentará.', err.message);
       return null;
      }

      if (isLast) {
       console.warn(`[FCM] Se agotaron los ${MAX_ATTEMPTS} intentos. Último error (${reason}):`, err.message);
       return null;
      }

      const delay = _backoffDelay(attempt);
      console.warn(
       `[FCM] Intento ${attempt + 1}/${MAX_ATTEMPTS} fallido (${reason}). ` +
       `Reintentando en ${Math.round(delay / 1000)}s…`
      );
      await new Promise(res => setTimeout(res, delay));
     }
    }
    return null; // nunca debería llegar aquí, pero satisface el flujo de control
   };

  } catch(e) {
   console.warn('[FCM] init error:', e);
  }
 }

 // Inicializar FCM si el browser lo soporta — con delay para no bloquear carga
 if ('serviceWorker' in navigator && 'PushManager' in window) {
  setTimeout(function() {
   try { fcmInit(); } catch(e) { console.warn('[FCM] Error init:', e); }
  }, 3000);
 }

 // ═══════════════════════════════════════════════════════════════════
 //  Custom Claims + Route Guard robusto
 //  NOTA: estas funciones están DENTRO del try para acceder a _rawDb y _auth
 // ═══════════════════════════════════════════════════════════════════

 function _concederAccesoAdmin() {
  if (!sessionStorage.getItem('_mfa_ok')) {
   console.warn('[Auth] Google OK pero PIN no verificado. Acceso denegado.');
   return;
  }
  window.__IS_ADMIN__ = true;
  const loginScreen = document.getElementById('adm-login-screen');
  const adminApp    = document.getElementById('adm-app');
  if (loginScreen) loginScreen.style.display = 'none';
  if (adminApp)    adminApp.style.display = 'block';
  if (typeof admFechaHoy === 'function') admFechaHoy();
  if (typeof admIniciar === 'function') admIniciar();
  else if (typeof admInit === 'function') admInit();
  setTimeout(() => {
   const firstTab = document.querySelector('.adm-tab');
   if (typeof admSwitchTab === 'function' && firstTab) admSwitchTab('pedidos', firstTab);
  }, 150);
 }

 /**
  * Verifica el rol admin: primero por custom claim del token,
  * con fallback a la colección "usuarios" en Firestore.
  * _rawDb y _auth están disponibles porque esta función vive dentro del try.
  */
 async function _verificarRolConClaims(user) {
  try {
   const tokenResult = await user.getIdTokenResult(true);
   const claims = tokenResult.claims || {};

   if (claims.admin === true) {
    console.log('[Auth] Custom claim admin=true verificado. UID:', user.uid);
    _concederAccesoAdmin();
    return;
   }

   // Fallback: verificar rol en Firestore
   const snap = await getDoc(doc(_rawDb, 'usuarios', user.uid));
   if (snap.exists() && snap.data().rol === 'admin') {
    console.log('[Auth] Rol admin verificado vía Firestore. UID:', user.uid);
    _concederAccesoAdmin();
   } else {
    alert(
     'Acceso denegado: no tenés permisos de administrador.\n' +
     'UID para configurar: ' + user.uid
    );
    await signOut(_auth);
   }
  } catch (err) {
   console.error('[Auth] Error verificando rol:', err);
   alert('Error al verificar permisos: ' + err.message);
  }
 }

 /**
  * Route Guard: si se pierde la sesión mientras el panel de app está abierto,
  * vuelve al login. NO oculta admin-root completo porque contiene la pantalla
  * de login que el usuario necesita ver para autenticarse.
  */
 function _routeGuard() {
  const adminRoot = document.getElementById('admin-root');
  if (!adminRoot) return;
  onAuthStateChanged(_auth, (user) => {
   if (!user) {
    // Solo actuar si el usuario estaba dentro del panel de app (no en el login)
    const adminApp   = document.getElementById('adm-app');
    const loginScreen = document.getElementById('adm-login-screen');
    const appVisible  = adminApp && adminApp.style.display !== 'none';
    if (appVisible) {
     console.warn('[RouteGuard] Sesión perdida. Volviendo al login admin.');
     adminApp.style.display = 'none';
     if (loginScreen) loginScreen.style.display = 'block';
     sessionStorage.removeItem('_mfa_ok');
     window.__IS_ADMIN__ = false;
    }
    // Si el usuario ve el login screen no hay nada que ocultar
   }
  });
 }

 // Exponer auth y funciones al scope global
 window._firebaseAuth = _auth;
 window._verificarRol = _verificarRolConClaims;

 // Ejecutar RouteGuard al cargar
 if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _routeGuard);
 } else {
  _routeGuard();
 }

} catch(e) {
 console.error('[Firebase] Error de inicialización modular:', e);
 window.db = null;
 window.firebase = { firestore: { FieldValue: { serverTimestamp: () => null, arrayUnion: (...i) => i, arrayRemove: (...i) => i, increment: (n) => n } } };
}
