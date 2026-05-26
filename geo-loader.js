// Lazy loader de librerías pesadas — evita bloquear el hilo principal en dispositivos de baja gama
window._libsLoaded = false;
window._loadGeoLibs = function() {
  if (window._libsLoaded) return Promise.resolve();
  return new Promise(function(resolve) {
    var loaded = 0;
    var needed = 2;
    function check() { if (++loaded >= needed) { window._libsLoaded = true; resolve(); } }
    // Turf.js v6
    if (typeof turf === 'undefined') {
      var ts = document.createElement('script');
      ts.src = 'https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js';
      ts.onload = check; ts.onerror = check;
      document.head.appendChild(ts);
    } else { check(); }
    // toGeoJSON
    if (typeof toGeoJSON === 'undefined') {
      var gs = document.createElement('script');
      gs.src = 'https://cdn.jsdelivr.net/npm/@tmcw/togeojson@5/dist/togeojson.umd.js';
      gs.onload = check; gs.onerror = check;
      document.head.appendChild(gs);
    } else { check(); }
  });
};
// Pre-cargar libs en background cuando el browser esté idle
if (window.requestIdleCallback) {
  requestIdleCallback(function() { window._loadGeoLibs(); }, { timeout: 5000 });
} else {
  setTimeout(function() { window._loadGeoLibs(); }, 3000);
}
