// SISTEMA BÁSICO DE DIAGNÓSTICO DE ERRORES 
// Captura errores críticos antes del colapso del navegador
// y los almacena en localStorage para diagnóstico
(function _errorLogger() {
 var LOG_KEY = 'mf_error_log';
 var MAX_LOGS = 20;

 window._logError = function(tipo, mensaje, stack) {
 try {
 var logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
 logs.unshift({
 tipo: tipo || 'unknown',
 msg: (mensaje || '').slice(0, 300),
 stack: (stack || '').slice(0, 500),
 ua: navigator.userAgent.slice(0, 100),
 ts: new Date().toISOString(),
 mem: (window.performance && window.performance.memory)
 ? Math.round(window.performance.memory.usedJSHeapSize / 1048576) + 'MB'
 : 'N/A'
 });
 logs = logs.slice(0, MAX_LOGS);
 localStorage.setItem(LOG_KEY, JSON.stringify(logs));
 } catch(e) {}
 };

 window.addEventListener('error', function(e) {
 window._logError('js_error', e.message, e.error ? e.error.stack : e.filename + ':' + e.lineno);
 });

 window.addEventListener('unhandledrejection', function(e) {
 var msg = e.reason ? (e.reason.message || String(e.reason)) : 'Promise rejected';
 window._logError('promise_rejection', msg, e.reason && e.reason.stack ? e.reason.stack : '');
 });

 window.mf_getLogs = function() {
 return JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
 };
 window.mf_clearLogs = function() {
 localStorage.removeItem(LOG_KEY);
 console.log('Logs limpiados');
 };
})();

// Detector de conexión en tiempo real 
(function() {
 function setBanner(isOffline) {
 var b = document.getElementById('offline-banner');
 if (b) b.classList.toggle('show', isOffline);
 }
 window.addEventListener('online', function() { setBanner(false); });
 window.addEventListener('offline', function() { setBanner(true); });
 if (!navigator.onLine) setBanner(true);

 // BARRERA ANTI-PANTALLA-BLANCA: si el splash sigue visible a los 12s, ocultarlo
 var _splashSafetyTimer = setTimeout(function() {
 try {
 var splash = document.getElementById('app-splash');
 if (splash && splash.style.display !== 'none') {
 splash.classList.add('hide');
 setTimeout(function() { splash.style.display = 'none'; }, 600);
 }
 } catch(e) {}
 }, 12000);
 window.addEventListener('load', function() { clearTimeout(_splashSafetyTimer); });
})();

// ═══════════════════════════════════════════════════════════════════
//  Diagnósticos extendidos: red, memoria y timing
// ═══════════════════════════════════════════════════════════════════

(function _extendedDiagnostics() {
  'use strict';

  window.addEventListener('load', function() {
    setTimeout(function() {
      try {
        var perf = window.performance;
        if (!perf) return;

        var nav = perf.getEntriesByType('navigation')[0];
        var metrics = {
          ts: new Date().toISOString(),
          domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
          loadComplete:     nav ? Math.round(nav.loadEventEnd) : null,
          jsHeapMB: (perf.memory)
            ? Math.round(perf.memory.usedJSHeapSize / 1048576)
            : null,
          jsHeapLimitMB: (perf.memory)
            ? Math.round(perf.memory.jsHeapSizeLimit / 1048576)
            : null,
          connection: navigator.connection ? {
            effectiveType: navigator.connection.effectiveType,
            downlink:      navigator.connection.downlink,
            rtt:           navigator.connection.rtt,
            saveData:      navigator.connection.saveData,
          } : null,
          ua: navigator.userAgent.slice(0, 120),
        };

        var existing = [];
        try { existing = JSON.parse(localStorage.getItem('mf_perf_log') || '[]'); } catch(_) {}
        existing.unshift(metrics);
        existing = existing.slice(0, 10);
        localStorage.setItem('mf_perf_log', JSON.stringify(existing));
      } catch(e) {}
    }, 2000);
  });

  window.mf_getPerfLogs = function() {
    try { return JSON.parse(localStorage.getItem('mf_perf_log') || '[]'); }
    catch(_) { return []; }
  };

  (function detectSlowConnection() {
    var conn = navigator.connection;
    if (!conn) return;
    var isSlow = conn.saveData || conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g';
    if (isSlow) {
      document.documentElement.classList.add('slow-connection');
      console.log('[Diagnostics] Conexión lenta detectada. Modo ahorro activado.');
    }
  })();

})();

// ═══════════════════════════════════════════════════════════════════
//  Reporte remoto de errores críticos
//  Antes los errores solo quedaban en localStorage del cliente
//  (mf_getLogs()) — para verlos había que pedirle al cliente que abra
//  la consola. Ahora también se mandan a Firestore (colección
//  'client_errors') para tener visibilidad real sin depender de eso.
//  Tope de 5 por sesión para no gastar cuota si algo entra en loop de error.
// ═══════════════════════════════════════════════════════════════════
(function _remoteErrorReporting() {
  'use strict';
  var MAX_POR_SESION = 5;
  var _cola = [];

  function _contador() {
    try { return parseInt(sessionStorage.getItem('mf_err_reported') || '0', 10); }
    catch(e) { return 0; }
  }
  function _incrementarContador() {
    try { sessionStorage.setItem('mf_err_reported', String(_contador() + 1)); } catch(e) {}
  }

  function _enviar(tipo, mensaje, stack) {
    if (_contador() >= MAX_POR_SESION) return;
    if (!window.db || typeof firebase === 'undefined') { _cola.push([tipo, mensaje, stack]); return; }
    _incrementarContador();
    try {
      window.db.collection('client_errors').add({
        tipo: tipo || 'unknown',
        msg: (mensaje || '').slice(0, 300),
        stack: (stack || '').slice(0, 500),
        url: location.pathname,
        ua: navigator.userAgent.slice(0, 120),
        ts: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function() {});
    } catch(e) {}
  }

  // Si el error ocurre antes de que Firebase esté listo, se encola y
  // se manda apenas se dispara el evento 'firebase:ready' (ya lo emite
  // firebase-config.js al terminar de inicializar).
  document.addEventListener('firebase:ready', function() {
    var pendientes = _cola.splice(0, _cola.length);
    pendientes.forEach(function(args) { _enviar(args[0], args[1], args[2]); });
  }, { once: true });

  // Enganchar con el logger local que ya existe (_errorLogger, arriba en
  // este mismo archivo) sin cambiar su comportamiento — solo se le suma
  // el envío a Firestore.
  var _origLogError = window._logError;
  window._logError = function(tipo, mensaje, stack) {
    if (typeof _origLogError === 'function') _origLogError(tipo, mensaje, stack);
    _enviar(tipo, mensaje, stack);
  };
})();
