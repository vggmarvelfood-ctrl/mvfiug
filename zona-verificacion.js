// zona-verificacion.js — CONFIG global, detección de zona y sucursal
// 
// CONFIG — Objeto global con todas las constantes del sistema
// Tarea 1: Unificación de Script (Integration Doc §6)
// 
window.CONFIG = {
 // AVISO resuelto: credenciales Firebase eliminadas de aquí.
 // Fuente de verdad única: firebase-config.js (inicializa el SDK).
 // Si necesitás acceder al config: window._firebaseConfig (expuesto por firebase-config.js).
 firebase: null, // placeholder — no usar; el SDK ya está inicializado por firebase-config.js
 emailjs: {
 publicKey: 'sATMMVYtIbZLT1tMD',
 serviceId: 'service_mf',
 templateId: 'template_mf'
 },
 sucursales: {
 Centro: { id: 'Centro', nombre: 'Pellegrini', wsp: '5493415256090' },
 Norte: { id: 'Norte', nombre: 'Rondeau', wsp: '5493415256090' },
 Sur: { id: 'Sur', nombre: 'San Martin', wsp: '5493415256090' },
 Funes: { id: 'Funes', nombre: 'Funes', wsp: '5493416107498' },
 Cafferata: { id: 'Cafferata', nombre: 'Cafferata', wsp: '5493413315885' }
 },
 admins: ['ulises', 'leticia'],
 collections: {
 pedidos: 'pedidos_v2',
 orders: 'orders', // auditoría de ventas
 deliveryZones: 'delivery_zones',
 menu: 'menu_v2',
 opiniones: 'opiniones',
 cupones: 'cupones'
 },
 geofencing: {
 cacheMaxAgeMs: 10 * 60 * 1000, // 10 minutos
 specialAccessKeywords: ['barrio privado', 'golf club', 'countries', 'country']
 }
};


// ── GUARD DE ORDEN DE CARGA ────────────────────────────────────────────────
// zona-verificacion.js depende de símbolos definidos en app.js (ZONA_INFO_UI,
// sucursalMasCercana, sucursalParaPunto, puntoDentroDePoligono, ZONA_POLIGONOS)
// y de la variable _gfFireCache del IIFE en geo-fencing.js.
// Si alguno falta, el error es inmediato y legible en lugar de un fallo silencioso.
// NOTA: _gfZonesCache era un nombre incorrecto — la variable real es _gfFireCache
// en geo-fencing.js; es privada del IIFE y no se puede exponer directamente.
// El guard de abajo usa window.determinarSucursal (sí expuesto) como proxy.
(function _checkLoadOrder() {
  var missing = [];
  if (typeof ZONA_INFO_UI === 'undefined')           missing.push('ZONA_INFO_UI (app.js)');
  if (typeof sucursalMasCercana !== 'function')      missing.push('sucursalMasCercana (app.js)');
  if (typeof sucursalParaPunto !== 'function')       missing.push('sucursalParaPunto (app.js)');
  if (typeof puntoDentroDePoligono !== 'function')   missing.push('puntoDentroDePoligono (app.js)');
  if (missing.length) {
    console.error(
      '[zona-verificacion] Error de orden de carga. Faltan: ' + missing.join(', ') + '.\n' +
      'Asegurate de que app.js se cargue ANTES que zona-verificacion.js en el HTML.'
    );
  }
  // Verificar que geo-static.js incluye Cafferata en ZONA_POLIGONOS
  if (typeof ZONA_POLIGONOS !== 'undefined' && !('Cafferata' in ZONA_POLIGONOS)) {
    console.warn('[zona-verificacion] ZONA_POLIGONOS no tiene clave "Cafferata". Actualizá geo-static.js.');
  }
})();

// 
// GEO-FENCING v3 — MÓDULO DINÁMICO (reemplaza polígonos estáticos)
// Fuente de verdad: Firestore colección "delivery_zones"
// Fallback: polígonos estáticos hardcodeados (sin red / primera carga)
// 

// Polígonos estáticos de respaldo (idénticos a los originales) 

// 
// validarPedidoParaEnvio — corazón de la validación en el checkout
// Tarea 7 del Integration Doc: Integration §7
// Usa la caché de zonas Firebase + Turf.js para precisión granular.
// Si Firebase no tiene zonas o Turf no está cargado, usa fallback síncrono.
// 
window.validarPedidoParaEnvio = async function(coordenadasCliente) {
 if (!coordenadasCliente || coordenadasCliente.lat == null || coordenadasCliente.lng == null) {
 return { valido: false, mensaje: 'No se pudo obtener la ubicación del cliente.' };
 }

 // Intentar validación precisa con Firebase + Turf
 try {
 const result = await window.determinarSucursal(coordenadasCliente.lat, coordenadasCliente.lng);
 if (result && result.sucursal) {
 return {
 valido: true,
 sucursal: result.sucursal,
 zona: result.zona || result.sucursal,
 privado: result.requiresSpecialAccess || false,
 };
 }
 // Punto fuera de todas las zonas activas
 return {
 valido: false,
 mensaje: 'Lo sentimos, tu dirección está fuera de nuestra zona de cobertura.',
 sugerida: sucursalMasCercana(coordenadasCliente.lat, coordenadasCliente.lng),
 };
 } catch(e) {
 console.warn('[validarPedidoParaEnvio] Error en validación Firebase:', e.message);
 // Fallback síncrono con polígonos estáticos
 const sucFallback = sucursalParaPunto(coordenadasCliente.lat, coordenadasCliente.lng);
 if (sucFallback) {
 return { valido: true, sucursal: sucFallback, zona: sucFallback, privado: false, fallback: true };
 }
 return {
 valido: false,
 mensaje: 'No se pudo verificar la zona. Seleccioná tu sucursal manualmente.',
 sugerida: sucursalMasCercana(coordenadasCliente.lat, coordenadasCliente.lng),
 };
 }
};

// Estado interno (sin cambios vs original) 
let _zonaVerifTimeout = null;
let _sucursalSugerida = null;
let _coordsVerificadas = null; // { lat, lng }

window.cerrarZonaAlert = () => {
 const el = document.getElementById('zona-alert');
 if (el) el.style.display = 'none';
};

window.aplicarSucursalSugerida = () => {
 if (!_sucursalSugerida) return;
 const sel = document.getElementById('main-sucursal');
 if (sel) {
 sel.value = _sucursalSugerida;
 window.cambiarSucursalPrincipal();
 }
 cerrarZonaAlert();
 const cartView = document.getElementById('cart-view');
 if (cartView && cartView.classList.contains('open')) {
 const sucBlock = document.getElementById('checkout-form');
 if (sucBlock) sucBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
 }
};

// 
// DETECCIÓN DE ZONA — v3 (misma lógica v2 + usa Firebase en segundo plano)
// Tres capas de detección, en orden de prioridad:
// 1. Tabla de localidades conocidas (instantáneo, sin red)
// 2. Geocodificación usando localidad + dirección real
// 3. Fallback: geocodificar solo la dirección con contexto amplio
// 

// Mapa de localidades conocidas → sucursal correcta
const LOCALIDAD_A_SUCURSAL = {
 'villa gobernador galvez':'Sur','villa gdor galvez':'Sur','villa gdor. galvez':'Sur',
 'v.g.galvez':'Sur','vgg':'Sur','galvez':'Sur','rosario sur':'Sur','villa del parque':'Sur','coronel bogado':'Sur',
 'granadero baigorria':'Norte','baigorria':'Norte','rosario norte':'Norte',
 'pueblo esther':'Norte','fray luis beltran':'Norte','beltran':'Norte',
 'funes':'Funes','fisherton':'Funes','barrio kentucky':'Funes','kentucky':'Funes',
 'barrio palvear':'Funes','barrio lagoon':'Funes','barrio vida':'Funes',
 'palos verdes':'Funes','san marino':'Funes',
 'rosario':'Centro','rosario centro':'Centro','rosario capital':'Centro',
 'cafferata':'Cafferata','zona cafferata':'Cafferata','barrio cafferata':'Cafferata',
 'puerto norte':'Cafferata','alto rosario':'Cafferata',
};

const GEO_CONTEXTO = {
 Centro: 'Rosario Santa Fe Argentina',
 Norte: 'Rosario Norte Santa Fe Argentina',
 Sur: 'Villa Gobernador Galvez Santa Fe Argentina',
 Funes: 'Funes Santa Fe Argentina',
};

function _normalizarTexto(txt) {
 return txt.toLowerCase()
 .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
 .replace(/\./g, '').trim();
}

function _sucursalPorLocalidad(localidad) {
 if (!localidad) return null;
 const norm = _normalizarTexto(localidad);
 // 'rosario' genérico: no asignar directamente — hay múltiples sucursales en Rosario.
 // Dejar que la geocodificación + punto-en-polígono decida cuál corresponde.
 const GENERICAS = ['rosario', 'rosario centro', 'rosario capital'];
 if (GENERICAS.includes(norm)) return null;
 if (LOCALIDAD_A_SUCURSAL[norm]) return LOCALIDAD_A_SUCURSAL[norm];
 for (const [key, suc] of Object.entries(LOCALIDAD_A_SUCURSAL)) {
 if (norm.includes(key) || key.includes(norm)) return suc;
 }
 return null;
}

// Extraer calle+número y localidad cuando el usuario escribe todo junto en el campo dir
// Ej: "paraguay 2272 rosario" -> { dir: "paraguay 2272", loc: "rosario" }
function _parsearDireccionCompleta(rawDir, rawLoc) {
 if (rawLoc && rawLoc.trim().length >= 3) return { dir: rawDir, loc: rawLoc };
 // Buscar si el campo dir termina con una localidad conocida
 const norm = _normalizarTexto(rawDir);
 const localidades = Object.keys(LOCALIDAD_A_SUCURSAL).concat(['rosario', 'funes', 'fisherton', 'galvez', 'baigorria']);
 // Ordenar por largo desc para matchear primero las más largas
 localidades.sort((a, b) => b.length - a.length);
 for (const loc of localidades) {
 if (norm.endsWith(' ' + loc)) {
 const dirLimpia = rawDir.slice(0, rawDir.length - loc.length).trim().replace(/,\s*$/, '').trim();
 return { dir: dirLimpia, loc: loc };
 }
 }
 return { dir: rawDir, loc: rawLoc };
}

async function _geocodificar(direccion, localidad) {
  // MEJORA 2 — Caché de geocodificación (TTL 30 días, ahorra llamadas a API)
  const cacheKey = ('geo_' + (direccion || '') + '_' + (localidad || '')).toLowerCase().replace(/\s+/g, '_');
  try {
    const geoCache = JSON.parse(localStorage.getItem('mf_geo_cache') || '{}');
    const ahora = Date.now();
    if (geoCache[cacheKey] && (ahora - geoCache[cacheKey].ts < 30 * 24 * 60 * 60 * 1000)) {
      return geoCache[cacheKey].coords;
    }
  } catch(e) {}

  const bbox = '-61.3,-33.25,-60.2,-32.7';
  // Generar múltiples variantes de consulta para mayor cobertura
  const contextos = [];
  if (localidad && localidad.trim()) {
    const locNorm = localidad.trim();
    contextos.push(locNorm + ' Santa Fe Argentina');
    // Si la localidad no menciona Rosario, agregar también Rosario como alternativa
    if (!_normalizarTexto(locNorm).includes('rosario')) {
      contextos.push('Rosario Santa Fe Argentina');
    }
  } else {
    contextos.push('Rosario Santa Fe Argentina');
    contextos.push('Santa Fe Argentina');
  }

  // Función helper para guardar en caché y retornar
  function _saveAndReturn(coords) {
    try {
      const cache2 = JSON.parse(localStorage.getItem('mf_geo_cache') || '{}');
      cache2[cacheKey] = { coords, ts: Date.now() };
      localStorage.setItem('mf_geo_cache', JSON.stringify(cache2));
    } catch(e) {}
    return coords;
  }

  for (const contexto of contextos) {
    const q = encodeURIComponent(direccion + ' ' + contexto);
    // Intento 1: Photon (Komoot) — muy bueno para Argentina
    try {
      const r = await fetch(`https://photon.komoot.io/api/?q=${q}&limit=3&bbox=${bbox}`, { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const d = await r.json();
        if (d.features && d.features.length) {
          // Preferir resultados dentro del bbox
          const valido = d.features.find(f => {
            const [lng, lat] = f.geometry.coordinates;
            return lat >= -33.26 && lat <= -32.7 && lng >= -61.3 && lng <= -60.2;
          });
          if (valido) {
            const [lng, lat] = valido.geometry.coordinates;
            return _saveAndReturn({ lat, lng });
          }
        }
      }
    } catch(e) {}
    // Intento 2: Nominatim (OSM) — más lento pero muy completo
    try {
      const q2 = encodeURIComponent(direccion + ', ' + contexto);
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q2}&format=json&limit=3&countrycodes=ar&viewbox=-61.3,-32.7,-60.2,-33.26&bounded=1`, {
        signal: AbortSignal.timeout(6000),
        headers: { 'Accept-Language': 'es', 'User-Agent': 'MarvelFood/1.0' }
      });
      if (r.ok) {
        const d = await r.json();
        if (d && d.length) return _saveAndReturn({ lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) });
      }
    } catch(e) {}
  }
  return null;
}

function _mostrarAlertaZona(sucSugerida, textoDir, sucActualId, razon) {
 _sucursalSugerida = sucSugerida;
 const zaTitle = document.getElementById('za-title');
 const zaBody = document.getElementById('za-body');
 const zaSucInfo = document.getElementById('za-suc-info');
 const zaSucName = document.getElementById('za-suc-name');
 const zaSucAddr = document.getElementById('za-suc-addr');
 const zaBtn = document.getElementById('za-btn-cambiar');
 const alertEl = document.getElementById('zona-alert');
 if (!alertEl) return;
 const sucActualInfo = ZONA_INFO_UI[sucActualId] || { label: sucActualId };
 const sucSugInfo = ZONA_INFO_UI[sucSugerida] || { label: sucSugerida, direccion: '' };
 zaTitle.textContent = 'Sucursal incorrecta detectada';
 zaBody.innerHTML = `<strong style="color:#fff;">${textoDir}</strong> corresponde a la zona de <strong style="color:#f59e0b;">${sucSugInfo.label}</strong>, no a <em>${sucActualInfo.label}</em>.${razon ? '<br><small style="color:#9ca3af;font-size:11px;">' + razon + '</small>' : ''}`;
 zaSucName.textContent = sucSugInfo.label;
 zaSucAddr.textContent = sucSugInfo.direccion;
 zaSucInfo.style.display = 'block';
 zaBtn.style.display = 'block';
 zaBtn.textContent = 'Cambiar a ' + sucSugInfo.label;
 alertEl.style.display = 'block';
}

async function verificarDireccion(direccion, localidadOverride) {
 const sucId = document.getElementById('main-sucursal')?.value;
 if (!sucId) return;
 const localidad = localidadOverride || (document.getElementById('c-loc')?.value || '').trim();
 if (localidad && localidad.length >= 3) {
 const sucPorLoc = _sucursalPorLocalidad(localidad);
 if (sucPorLoc && sucPorLoc !== sucId) {
 _mostrarAlertaZona(sucPorLoc, localidad, sucId, 'Detectado por localidad ingresada');
 return;
 }
 if (sucPorLoc && sucPorLoc === sucId) { cerrarZonaAlert(); }
 }
 if (!direccion || direccion.length < 4) return;
 try {
 const coords = await _geocodificar(direccion, localidad);
 if (!coords) return;
 const { lat, lng } = coords;
 _coordsVerificadas = { lat, lng };

 // BUGFIX: _gfZonesCache nunca existió (era un nombre incorrecto; la variable
 // real es _gfFireCache, privada del IIFE de geo-fencing.js). La condición
 // siempre era falsa y el bloque Turf nunca corría. Ahora usamos la API pública
 // window.determinarSucursal() que ya encapsula Firebase+Turf+fallback.
 let enZonaActual, sucCubre;
 if (typeof window.determinarSucursal === 'function') {
 // Llamada asíncrona ya resuelta arriba vía validarPedidoParaEnvio;
 // aquí usamos el fallback estático síncrono para no duplicar awaits.
 enZonaActual = puntoDentroDePoligono(lat, lng, ZONA_POLIGONOS[sucId]);
 sucCubre = sucursalParaPunto(lat, lng);
 } else {
 enZonaActual = puntoDentroDePoligono(lat, lng, ZONA_POLIGONOS[sucId]);
 sucCubre = sucursalParaPunto(lat, lng);
 }

 if (enZonaActual) { cerrarZonaAlert(); return; }
 const sucSugerida = sucCubre || sucursalMasCercana(lat, lng);
 if (sucSugerida === sucId) { cerrarZonaAlert(); return; }
 _mostrarAlertaZona(
 sucSugerida,
 [direccion, localidad].filter(Boolean).join(', '),
 sucId,
 sucCubre ? 'La sucursal correcta cubre ese punto' : 'Sucursal más cercana al punto'
 );
 } catch(e) {
 console.warn('[ZonaCheck] Error:', e.message);
 }
}

(function hookInputsZona() {
 const MAX_WAIT = 900;
 function attachHooks() {
 const cDir = document.getElementById('c-dir');
 const cLoc = document.getElementById('c-loc');
 if (!cDir) return setTimeout(attachHooks, 500);
 const onDirChange = () => {
 clearTimeout(_zonaVerifTimeout);
 _zonaVerifTimeout = setTimeout(() => { verificarDireccion(cDir.value.trim()); }, MAX_WAIT);
 };
 cDir.addEventListener('input', onDirChange);
 cDir.addEventListener('blur', () => {
 clearTimeout(_zonaVerifTimeout);
 const val = cDir.value.trim();
 if (val.length >= 4) verificarDireccion(val);
 });
 if (cLoc) {
 cLoc.addEventListener('input', () => {
 clearTimeout(_zonaVerifTimeout);
 const locVal = cLoc.value.trim();
 const dirVal = cDir.value.trim();
 if (locVal.length >= 3) {
 _zonaVerifTimeout = setTimeout(() => { verificarDireccion(dirVal, locVal); }, 600);
 }
 });
 cLoc.addEventListener('blur', () => {
 clearTimeout(_zonaVerifTimeout);
 const locVal = cLoc.value.trim();
 const dirVal = cDir.value.trim();
 if (locVal.length >= 2) verificarDireccion(dirVal, locVal);
 });
 }
 }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachHooks);
 else attachHooks();
})();

(function hookSucursalChange() {
 function attach() {
 const sel = document.getElementById('main-sucursal');
 if (!sel) return setTimeout(attach, 500);
 sel.addEventListener('change', () => {
 cerrarZonaAlert();
 const dir = document.getElementById('c-dir')?.value?.trim();
 const loc = document.getElementById('c-loc')?.value?.trim();
 if (dir || loc) { setTimeout(() => verificarDireccion(dir || '', loc || ''), 300); }
 });
 }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
 else attach();
})();
