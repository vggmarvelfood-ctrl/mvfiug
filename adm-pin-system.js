// adm-pin-system.js
// Sistema de autenticación de 2 factores para panel admin
// Uso: Cargar este script DESPUÉS de firebase-config.js y ANTES de app.js

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  //  CONFIGURACIÓN
  // ═══════════════════════════════════════════════════════════════════
  
  // PIN almacenado como SHA-256 en Firestore → colección 'config_security' / doc 'admin_pin' / campo 'hash'
  // Para generar el hash de tu PIN, ejecutá en consola del navegador (una vez):
  //   const pin = 'TU_PIN_AQUI';
  //   const data = new TextEncoder().encode(pin);
  //   const buf = await crypto.subtle.digest('SHA-256', data);
  //   console.log(Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''));
  // Luego guardá ese hex en Firestore: config_security → admin_pin → hash: "el_hex"
  let pinHashFromFirestore = null;

  const MAX_INTENTOS = 3;
  const TIEMPO_BLOQUEO = 5 * 60 * 1000;

  // ═══════════════════════════════════════════════════════════════════
  //  ESTADO INTERNO
  // ═══════════════════════════════════════════════════════════════════
  
  let intentosFallidos = 0;
  let tiempoBloqueo = null;

  // ═══════════════════════════════════════════════════════════════════
  //  FUNCIONES DE VALIDACIÓN
  // ═══════════════════════════════════════════════════════════════════

  function estaBloqueo() {
    if (!tiempoBloqueo) return false;
    const ahora = Date.now();
    if (ahora < tiempoBloqueo) {
      const segundosRestantes = Math.ceil((tiempoBloqueo - ahora) / 1000);
      return segundosRestantes;
    }
    tiempoBloqueo = null;
    intentosFallidos = 0;
    return false;
  }

  async function validarPIN(pinIngresado) {
    const bloqueo = estaBloqueo();
    if (bloqueo) {
      return {
        valido: false,
        mensaje: `Bloqueado por seguridad. Intentá de nuevo en ${bloqueo} segundos.`,
        bloqueado: true
      };
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(pinIngresado);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (hashHex === pinHashFromFirestore) {
      intentosFallidos = 0;
      tiempoBloqueo = null;
      return { valido: true, mensaje: 'PIN correcto. Acceso concedido.' };
    }

    intentosFallidos++;
    
    if (intentosFallidos >= MAX_INTENTOS) {
      tiempoBloqueo = Date.now() + TIEMPO_BLOQUEO;
      return {
        valido: false,
        mensaje: `Demasiados intentos fallidos. Bloqueado por 5 minutos.`,
        bloqueado: true
      };
    }

    return {
      valido: false,
      mensaje: `PIN incorrecto. Intentos restantes: ${MAX_INTENTOS - intentosFallidos}`,
      bloqueado: false
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  UI - MOSTRAR/OCULTAR SECCIÓN PIN
  // ═══════════════════════════════════════════════════════════════════

  function mostrarSeccionPIN() {
    const pinSection = document.getElementById('adm-pin-section');
    const googleBtn = document.getElementById('adm-google-btn');
    
    if (pinSection) {
      pinSection.style.display = 'block';
      pinSection.style.opacity = '0';
      pinSection.style.transform = 'translateY(-10px)';
      
      setTimeout(() => {
        pinSection.style.transition = 'all 0.3s ease';
        pinSection.style.opacity = '1';
        pinSection.style.transform = 'translateY(0)';
        const input = document.getElementById('adm-pin-input');
        if (input) input.focus();
      }, 50);
    }
    
    if (googleBtn) googleBtn.style.display = 'none';
  }

  function ocultarSeccionPIN() {
    const pinSection = document.getElementById('adm-pin-section');
    const googleBtn = document.getElementById('adm-google-btn');
    if (pinSection) pinSection.style.display = 'none';
    if (googleBtn) googleBtn.style.display = 'block';
  }

  // ═══════════════════════════════════════════════════════════════════
  //  FUNCIÓN PRINCIPAL DE VERIFICACIÓN
  // ═══════════════════════════════════════════════════════════════════

  window.admVerifyPin = async function() {
    const input = document.getElementById('adm-pin-input');
    // Usar adm-pin-feedback-pin (dentro de #adm-pin-section),
    // no adm-pin-feedback (elemento de login general usado por admCheckPin).
    const feedback = document.getElementById('adm-pin-feedback-pin');
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
      btnVerificar.disabled = true;
      btnVerificar.textContent = 'Verificando...';
    }

    const resultado = await validarPIN(pinIngresado);
    
    if (resultado.valido) {
      feedback.style.color = '#10b981';
      feedback.textContent = '✓ ' + resultado.mensaje;
      // BUGFIX: geo-fencing.js (_gfSessionOk) exige tok.length >= 8
      // 'pin-verified' (12 chars) pasa la validación correctamente
      sessionStorage.setItem('_mfa_ok', 'pin-verified');
      input.value = '';
      setTimeout(() => { window.location.reload(); }, 800);
      
    } else {
      feedback.style.color = '#ef4444';
      feedback.textContent = '✗ ' + resultado.mensaje;
      input.value = '';
      
      if (btnVerificar && !resultado.bloqueado) {
        btnVerificar.disabled = false;
        btnVerificar.textContent = 'VERIFICAR PIN';
      }
      
      if (btnVerificar && resultado.bloqueado) {
        btnVerificar.disabled = true;
        btnVerificar.textContent = 'BLOQUEADO';
        btnVerificar.style.background = '#ef4444';
        setTimeout(() => {
          btnVerificar.disabled = false;
          btnVerificar.textContent = 'VERIFICAR PIN';
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
        // ✅ FIX: cargar el hash DESPUÉS del login Google, cuando request.auth != null.
        // Antes se cargaba en inicializar() (antes de autenticarse) → permission-denied.
        await cargarPinHash();
        mostrarSeccionPIN();
      } catch (err) {
        console.error('[PIN] Error en login Google:', err);
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  INICIALIZACIÓN
  // ═══════════════════════════════════════════════════════════════════

  async function cargarPinHash() {
    if (!window.db) {
      // En producción: si db no está disponible, mostrar error y no hacer fallback
      if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        console.error('[PIN] db no disponible en producción. Sistema PIN no inicializado.');
        pinHashFromFirestore = null;
        return;
      }
      // Solo en desarrollo: usar hash de fallback
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

  async function inicializar() {
    if (sessionStorage.getItem('_mfa_ok')) {
      console.log('[PIN] Sesión PIN válida detectada');
      return;
    }

    // Esperar a que Firebase esté listo
    function _init() {
      patchGoogleLogin();
      console.log('[PIN] Sistema de autenticación 2FA inicializado');
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
  //  UTILIDADES DE DESARROLLO — solo disponibles en localhost
  // ═══════════════════════════════════════════════════════════════════

  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.admResetPinLock = function() {
      intentosFallidos = 0;
      tiempoBloqueo = null;
      console.log('[PIN] Bloqueo reseteado');
    };
  }

})();
