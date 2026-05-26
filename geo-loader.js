// Lazy loader de librerías pesadas — evita bloquear el hilo principal en dispositivos de baja gama
// NOTA: Turf.js se carga como ESM desde index.html (script type="module")
// para evitar el EvalError de CSP que genera el bundle UMD (v6 y v7).
// Este loader solo gestiona toGeoJSON.
window._libsLoaded = false;
window._loadGeoLibs = function() {
  if (window._libsLoaded) return Promise.resolve();
  return new Promise(function(resolve) {
    // toGeoJSON
    if (typeof toGeoJSON === 'undefined') {
      var gs = document.createElement('script');
      gs.src = 'https://cdn.jsdelivr.net/npm/@tmcw/togeojson@5/dist/togeojson.umd.js';
      gs.onload = function() { window._libsLoaded = true; resolve(); };
      gs.onerror = function() { window._libsLoaded = true; resolve(); };
      document.head.appendChild(gs);
    } else {
      window._libsLoaded = true;
      resolve();
    }
  });
};
// Pre-cargar en background cuando el browser esté idle
if (window.requestIdleCallback) {
  requestIdleCallback(function() { window._loadGeoLibs(); }, { timeout: 5000 });
} else {
  setTimeout(function() { window._loadGeoLibs(); }, 3000);
}
