// === POLYFILLS COMPATIBILIDAD MÓVIL (Android WebView / Chrome < 103) ===
// AbortSignal.timeout — no existe en Chrome < 103
if (typeof AbortSignal !== 'undefined' && !AbortSignal.timeout) {
  AbortSignal.timeout = function(ms) {
    var ctrl = new AbortController();
    setTimeout(function() { ctrl.abort(new DOMException('TimeoutError','TimeoutError')); }, ms);
    return ctrl.signal;
  };
}
// Array.at — no existe en Chrome < 92
if (!Array.prototype.at) {
  Array.prototype.at = function(i) { return i < 0 ? this[this.length + i] : this[i]; };
}
// Object.hasOwn — no existe en Chrome < 93
if (!Object.hasOwn) {
  Object.hasOwn = function(o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
}
// Detectar soporte de backdrop-filter y añadir clase al <html>
(function() {
  var testEl = document.createElement('div');
  var supported = typeof testEl.style.backdropFilter !== 'undefined' ||
                  typeof testEl.style.webkitBackdropFilter !== 'undefined';
  if (!supported) {
    document.documentElement.classList.add('no-backdrop-filter');
  }
})();
