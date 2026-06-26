// ============================================================
//  adm-secciones.js — Control de visibilidad de secciones v1
//  Permite activar/desactivar desde el admin las pestañas del
//  storefront: Inicio, Promos, Pedidos, Cupones, Opiniones, Locales
//  Persiste en Firestore: config_menu / config_general → secciones
// ============================================================

const SECCIONES_DOC  = 'config_general';
const SECCIONES_COL  = 'config_menu';

// Definición de secciones manejables
// tabId    → id del tab-page en el HTML
// navSel   → selector del botón en .bottom-nav
// label    → nombre visible en el admin
// icono    → emoji decorativo
// esencial → si es true, no se puede desactivar (Inicio siempre visible)
const SECCIONES_DEF = [
  {
    key:      'inicio',
    tabId:    'tab-inicio',
    navSel:   '.nav-item[onclick*="tab-inicio"]',
    label:    'Inicio',
    icono:    '🏠',
    esencial: true,
  },
  {
    key:      'promos',
    tabId:    'tab-promos',
    navSel:   '.nav-item[onclick*="tab-promos"]',
    label:    'Promos',
    icono:    '🏷️',
    esencial: false,
  },
  {
    key:      'pedidos',
    tabId:    'tab-pedidos',
    navSel:   '#nav-pedidos',
    label:    'Pedidos',
    icono:    '📋',
    esencial: false,
  },
  {
    key:      'cupones',
    tabId:    'tab-perfil',
    navSel:   '.nav-item[onclick*="tab-perfil"]',
    label:    'Cupones',
    icono:    '🎁',
    esencial: false,
  },
  {
    key:      'opiniones',
    tabId:    'tab-opiniones',
    navSel:   '.nav-item[onclick*="tab-opiniones"]',
    label:    'Opiniones',
    icono:    '⭐',
    esencial: false,
  },
  {
    key:      'locales',
    tabId:    'tab-zonas',
    navSel:   '.nav-item[onclick*="tab-zonas"]',
    label:    'Locales',
    icono:    '📍',
    esencial: false,
  },
];

// ── Defaults: todas activas ───────────────────────────────────
function _seccionesDefault() {
  const d = {};
  SECCIONES_DEF.forEach(s => { d[s.key] = true; });
  return d;
}

// ── Leer secciones de Firestore ───────────────────────────────
async function _leerSecciones() {
  try {
    const snap = await window.db.collection(SECCIONES_COL).doc(SECCIONES_DOC).get();
    if (snap.exists) {
      const data = snap.data() || {};
      return Object.assign(_seccionesDefault(), data.secciones || {});
    }
  } catch (e) {
    console.warn('[Secciones] Error leyendo config:', e.message);
  }
  return _seccionesDefault();
}

// ── Guardar secciones en Firestore ────────────────────────────
async function _guardarSecciones(secciones) {
  await window.db.collection(SECCIONES_COL).doc(SECCIONES_DOC).set(
    { secciones },
    { merge: true }
  );
}

// ── Aplicar visibilidad en el storefront ─────────────────────
// Oculta/muestra tanto el tab-page como el botón de nav
window.aplicarVisibilidadSecciones = function(secciones) {
  if (!secciones) return;

  SECCIONES_DEF.forEach(({ key, tabId, navSel, esencial }) => {
    const visible = esencial ? true : (secciones[key] !== false);

    // Tab page
    const tab = document.getElementById(tabId);
    if (tab) {
      tab.setAttribute('data-sec-visible', visible ? '1' : '0');
      // Solo ocultar si NO está activo en este momento
      if (!visible && tab.classList.contains('tab-page') && !tab.classList.contains('hidden') === false) {
        // ya está hidden, nada que hacer
      }
    }

    // Botón de nav
    const nav = document.querySelector(navSel);
    if (nav) {
      nav.style.display = visible ? '' : 'none';
    }

    // Widget de resumen de opiniones en tab-inicio
    if (key === 'opiniones') {
      const resumen = document.getElementById('section-resumen-opiniones');
      if (resumen) resumen.style.display = visible ? '' : 'none';
    }
  });

  // Si el tab activo quedó oculto → redirigir a inicio
  const tabActivo = document.querySelector('.tab-page:not(.hidden)');
  if (tabActivo) {
    const secDef = SECCIONES_DEF.find(s => s.tabId === tabActivo.id);
    if (secDef && secciones[secDef.key] === false) {
      const navInicio = document.querySelector('.nav-item[onclick*="tab-inicio"]');
      if (typeof switchTab === 'function' && navInicio) {
        switchTab('tab-inicio', navInicio);
      }
    }
  }

  // Guardar en memoria para acceso rápido
  window._seccionesActivas = secciones;
};

// ── Cargar y aplicar al iniciar el storefront ─────────────────
window.cargarVisibilidadSecciones = async function() {
  if (!window.db) return;
  const secciones = await _leerSecciones();
  window.aplicarVisibilidadSecciones(secciones);
};

// ── Renderizar bloque en el tab Configuración del admin ───────
window.renderSeccionesAdmin = async function(containerEl) {
  if (!containerEl) return;

  const secciones = await _leerSecciones();

  // Helper toggle igual al usado en adm-configuracion.js
  const mkToggle = (id, checked, onchange) =>
    `<label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;">
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} onchange="${onchange}"
        style="opacity:0;width:0;height:0;">
      <span id="${id}-track" style="position:absolute;inset:0;background:${checked ? '#10b981' : '#374151'};
        border-radius:12px;transition:.3s;"></span>
      <span id="${id}-thumb" style="position:absolute;top:2px;left:${checked ? '22px' : '2px'};width:20px;height:20px;
        background:#fff;border-radius:50%;transition:.3s;box-shadow:0 1px 4px rgba(0,0,0,.4);"></span>
    </label>`;

  const filas = SECCIONES_DEF.map(({ key, label, icono, esencial }) => {
    const activo = esencial ? true : (secciones[key] !== false);
    const id = `sec-toggle-${key}`;
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;
                  padding:13px 14px;background:var(--bg);border:1px solid var(--border);
                  border-radius:10px;" id="sec-row-${key}">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:18px;line-height:1;">${icono}</span>
          <div>
            <div style="font-size:13px;font-weight:800;color:var(--white);">${label}</div>
            <div style="font-size:10px;color:${activo ? '#10b981' : '#6b7280'};font-weight:700;
                        margin-top:1px;" id="sec-lbl-${key}">
              ${esencial ? 'SIEMPRE VISIBLE' : (activo ? 'VISIBLE' : 'OCULTO')}
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${esencial
            ? `<span style="font-size:10px;color:#4b5563;padding:3px 8px;border:1px solid #333;
                           border-radius:20px;font-weight:700;">NO EDITABLE</span>`
            : mkToggle(id, activo, `admSeccionToggle('${key}', this.checked)`)}
        </div>
      </div>`;
  }).join('');

  containerEl.innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;font-weight:800;color:#6b7280;text-transform:uppercase;
                  letter-spacing:.8px;margin-bottom:10px;">
        Secciones de navegación
      </div>
      <p style="font-size:12px;color:#6b7280;margin:0 0 14px;">
        Activá o desactivá las pestañas que ven tus clientes en tiempo real.
        Los cambios aplican al guardar la configuración.
      </p>
      <div style="display:flex;flex-direction:column;gap:8px;" id="secciones-lista">
        ${filas}
      </div>
    </div>`;
};

// ── Toggle desde la UI (actualiza visual instantáneo) ─────────
window.admSeccionToggle = function(key, checked) {
  // Track + thumb
  const track = document.getElementById(`sec-toggle-${key}-track`);
  const thumb = document.getElementById(`sec-toggle-${key}-thumb`);
  const lbl   = document.getElementById(`sec-lbl-${key}`);
  if (track) track.style.background = checked ? '#10b981' : '#374151';
  if (thumb) thumb.style.left = checked ? '22px' : '2px';
  if (lbl)   { lbl.textContent = checked ? 'VISIBLE' : 'OCULTO'; lbl.style.color = checked ? '#10b981' : '#6b7280'; }
};

// ── Recolectar valores actuales de los toggles ────────────────
window.admSeccionesGetValues = function() {
  const result = {};
  SECCIONES_DEF.forEach(({ key, esencial }) => {
    if (esencial) { result[key] = true; return; }
    const cb = document.getElementById(`sec-toggle-${key}`);
    result[key] = cb ? cb.checked : true;
  });
  return result;
};
