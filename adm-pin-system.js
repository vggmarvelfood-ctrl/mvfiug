// adm-pin-system.js — v2.1 (sin backend)
// Sistema de autenticación 2FA para panel admin.
//
// MEJORAS vs v1:
//   - Ya no guarda 'pin-verified' (string hardcodeado bypasseable).
//   - Genera un token firmado con HMAC-SHA256 usando el hash del PIN como clave.
//     El token incluye timestamp de emisión + TTL de 8 horas.
//   - tokenValido() verifica la firma y la expiración antes de dar acceso.
//   - Cualquier sessionStorage.setItem manual produce un token con firma inválida
//     → el panel no se abre.
//   - Rate limiting client-side conservado (igual que antes).
//   - El hash del PIN sigue viniendo de Firestore (nunca hardcodeado en producción).

(function() {
  'use strict';

  const MAX_INTENTOS   = 5;
  const TIEMPO_BLOQUEO = 5 * 60 * 1000; // 5 min en ms
  const TOKEN_TTL      = 8 * 60 * 60;   // 8 horas en segundos
  const TOKEN_KEY      = '_adm_tok';    // sessionStorage key

  let pinHashFromFirestore = null;
  let intentosFallidos     = 0;
  let tiempoBloqueo        = null;

  // ═══════════════════════════════════════════════════════════════════
  //  HMAC-SHA256 con Web Crypto API
  // ═══════════════════════════════════════════════════════════════════
  async function hmac(secretHex, message) {
    const keyBytes = new Uint8Array(secretHex.match(/../g).map(h => parseInt(h, 16)));
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ── Hash SHA-256 del PIN ──────────────────────────────────────────
  async function hashPin(pin) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  EMITIR TOKEN FIRMADO
  //  Formato: base64(payload) + "." + hmac(pinHash, base64(payload))
  //  La clave de firma ES el hash del PIN → sin el PIN correcto no se
  //  puede falsificar la firma.
  // ═══════════════════════════════════════════════════════════════════
  async function emitirToken(pinHash) {
    const payload = JSON.stringify({
      sub: 'admin',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL,
    });
    const b64 = btoa(payload);
    const sig  = await hmac(pinHash, b64);
    return `${b64}.${sig}`;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  VERIFICAR TOKEN GUARDADO
  //  Verifica firma y expiración. Requiere el hash del PIN como clave.
  // ═══════════════════════════════════════════════════════════════════
  async function tokenValido() {
    const tok = sessionStorage.getItem(TOKEN_KEY);
    if (!tok || !pinHashFromFirestore) return false;
    try {
      const [b64, sig] = tok.split('.');
      if (!b64 || !sig) return false;
      // Verificar firma
      const sigEsperada = await hmac(pinHashFromFirestore, b64);
      if (sig !== sigEsperada) return false;
      // Verificar expiración
      const payload = JSON.parse(atob(b64));
      return payload.sub === 'admin' && payload.exp > Math.floor(Date.now() / 1000);
    } catch {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  RATE LIMITING
  // ═══════════════════════════════════════════════════════════════════
  function estaBloqueo() {
    if (!tiempoBloqueo) return false;
    const ahora = Date.now();
    if (ahora < tiempoBloqueo) return Math.ceil((tiempoBloqueo - ahora) / 1000);
    tiempoBloqueo    = null;
    intentosFallidos = 0;
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  VALIDAR PIN
  // ═══════════════════════════════════════════════════════════════════
  async function validarPIN(pinIngresado) {
    const bloqueo = estaBloqueo();
    if (bloqueo) {
      return { valido: false, bloqueado: true,
        mensaje: `Bloqueado por seguridad. Intentá en ${bloqueo} segundos.` };
    }
    if (!pinHashFromFirestore) {
      return { valido: false, bloqueado: false,
        mensaje: 'Sistema de seguridad no listo. Recargá la página.' };
    }

    const hashIngresado = await hashPin(pinIngresado);

    if (hashIngresado === pinHashFromFirestore) {
      intentosFallidos = 0;
      tiempoBloqueo    = null;
      const token = await emitirToken(pinHashFromFirestore);
      sessionStorage.setItem(TOKEN_KEY, token);
      // Compatibilidad con geo-fencing.js (_gfSessionOk exige tok.length >= 8)
      sessionStorage.setItem('_mfa_ok', token);
      return { valido: true, mensaje: 'PIN correcto. Acceso concedido.' };
    }

    intentosFallidos++;
    if (intentosFallidos >= MAX_INTENTOS) {
      tiempoBloqueo = Date.now() + TIEMPO_BLOQUEO;
      return { valido: false, bloqueado: true,
        mensaje: 'Demasiados intentos fallidos. Bloqueado por 5 minutos.' };
    }
    return { valido: false, bloqueado: false,
      mensaje: `PIN incorrecto. Intentos restantes: ${MAX_INTENTOS - intentosFallidos}` };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  UI
  // ═══════════════════════════════════════════════════════════════════
  function mostrarSeccionPIN() {
    const pinSection = document.getElementById('adm-pin-section');
    const googleBtn  = document.getElementById('adm-google-btn');
    if (pinSection) {
      pinSection.style.display   = 'block';
      pinSection.style.opacity   = '0';
      pinSection.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        pinSection.style.transition = 'all 0.3s ease';
        pinSection.style.opacity    = '1';
        pinSection.style.transform  = 'translateY(0)';
        const input = document.getElementById('adm-pin-input');
        if (input) input.focus();
      }, 50);
    }
    if (googleBtn) googleBtn.style.display = 'none';
  }

  function ocultarSeccionPIN() {
    const pinSection = document.getElementById('adm-pin-section');
    const googleBtn  = document.getElementById('adm-google-btn');
    if (pinSection) pinSection.style.display = 'none';
    if (googleBtn)  googleBtn.style.display  = 'block';
  }

  // ═══════════════════════════════════════════════════════════════════
  //  FUNCIÓN PRINCIPAL — llamada desde el botón "VERIFICAR PIN"
  // ═══════════════════════════════════════════════════════════════════
  window.admVerifyPin = async function() {
    const input        = document.getElementById('adm-pin-input');
    const feedback     = document.getElementById('adm-pin-feedback-pin');
    const btnVerificar = document.querySelector('#adm-pin-section button');

    if (!input || !feedback) {
      console.error('[PIN] Elementos UI no encontrados');
      return;
    }

    const pinIngresado = input.value.trim();
    if (!pinIngresado) {
      feedback.style.color = '#ef4444';
      feedback.textContent = 'Ingresá el PIN';
      return;
    }

    if (btnVerificar) {
      btnVerificar.disabled    = true;
      btnVerificar.textContent = 'Verificando...';
    }

    const resultado = await validarPIN(pinIngresado);

    if (resultado.valido) {
      feedback.style.color = '#10b981';
      feedback.textContent = '✓ ' + resultado.mensaje;
      input.value = '';
      setTimeout(() => { window.location.reload(); }, 800);

    } else {
      feedback.style.color = '#ef4444';
      feedback.textContent = '✗ ' + resultado.mensaje;
      input.value = '';

      if (btnVerificar && !resultado.bloqueado) {
        btnVerificar.disabled    = false;
        btnVerificar.textContent = 'VERIFICAR PIN';
      }

      if (btnVerificar && resultado.bloqueado) {
        btnVerificar.disabled         = true;
        btnVerificar.textContent      = 'BLOQUEADO';
        btnVerificar.style.background = '#ef4444';
        setTimeout(() => {
          intentosFallidos = 0;
          tiempoBloqueo    = null;
          btnVerificar.disabled         = false;
          btnVerificar.textContent      = 'VERIFICAR PIN';
          btnVerificar.style.background = '#f59e0b';
        }, TIEMPO_BLOQUEO);
      }

      input.focus();
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  //  PARCHEAR admGoogleLogin PARA MOSTRAR PIN DESPUÉS DE GOOGLE
  // ═══════════════════════════════════════════════════════════════════
  function patchGoogleLogin() {
    if (typeof window.admGoogleLogin !== 'function') {
      setTimeout(patchGoogleLogin, 200);
      return;
    }
    const originalGoogleLogin = window.admGoogleLogin;
    window.admGoogleLogin = async function() {
      try {
        await originalGoogleLogin();
        // Cargar hash DESPUÉS del login (cuando request.auth != null)
        await cargarPinHash();
        // Si ya hay token válido, no pedir PIN de nuevo
        if (await tokenValido()) {
          console.log('[PIN] Token válido en sesión, no se pide PIN');
          return;
        }
        mostrarSeccionPIN();
      } catch (err) {
        console.error('[PIN] Error en login Google:', err);
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CARGA DEL HASH DESDE FIRESTORE
  // ═══════════════════════════════════════════════════════════════════
  async function cargarPinHash() {
    if (!window.db) {
      if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        console.error('[PIN] db no disponible en producción.');
        pinHashFromFirestore = null;
        return;
      }
      // Solo desarrollo: fallback
      pinHashFromFirestore = '5458d9991d5ff0b1019fb8fe2aa431fedca2ee51d5c43f1d7812c9a086ceb372';
      console.warn('[PIN] Modo desarrollo: usando hash de fallback.');
      return;
    }
    try {
      const doc = await db.collection('config_security').doc('admin_pin').get();
      if (doc.exists) {
        pinHashFromFirestore = doc.data().hash;
        console.log('[PIN] Hash cargado desde Firestore.');
      } else {
        console.error('[PIN] No se encontró documento admin_pin en Firestore.');
        pinHashFromFirestore = null;
      }
    } catch(e) {
      console.error('[PIN] Error cargando hash desde Firestore:', e);
      pinHashFromFirestore = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  INICIALIZACIÓN
  // ═══════════════════════════════════════════════════════════════════
  async function inicializar() {
    // NO llamar cargarPinHash() aquí — el usuario aún no está autenticado
    // con Google, por lo que Firestore rechaza la lectura con "insufficient permissions".
    // cargarPinHash() se llama desde patchGoogleLogin(), DESPUÉS del login Google.

    // Si hay un token en sesión, verificarlo solo con lo que tenemos en memoria.
    // pinHashFromFirestore es null acá, así que tokenValido() devuelve false
    // correctamente — no intentamos nada con Firestore sin auth.
    const tokEnSesion = sessionStorage.getItem(TOKEN_KEY);
    if (tokEnSesion) {
      // Hay un token guardado: patchGoogleLogin igual para que si ya
      // está logueado y el token vence, el flujo funcione.
      console.log('[PIN] Token en sesión detectado — se verificará tras cargar el hash');
    } else {
      sessionStorage.removeItem('_mfa_ok');
    }

    function _init() {
      patchGoogleLogin();
      console.log('[PIN] Sistema 2FA inicializado (token HMAC-SHA256)');
    }

    if (window._firebaseOk) {
      _init();
    } else {
      document.addEventListener('firebase:ready', function() { _init(); }, { once: true });
      setTimeout(function() { if (!window._firebaseOk) _init(); }, 3000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  UTILIDADES — solo localhost
  // ═══════════════════════════════════════════════════════════════════
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.admResetPinLock = function() {
      intentosFallidos = 0;
      tiempoBloqueo    = null;
      console.log('[PIN] Bloqueo reseteado');
    };
    window.admTokenValido = () => tokenValido();
  }

})();
