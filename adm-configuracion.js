// 
// adm-configuracion.js — Tab "Configuración" del panel admin v2
// Gestiona desde Firestore sin tocar código:
// · Teléfonos WhatsApp por sucursal (con preview de link y toggle)
// · Horarios de apertura/cierre por sucursal
// · Mensaje personalizado de bienvenida / banner
// · Tiempo estimado de entrega y mínimo por sucursal
// · Toggle delivery / retiro habilitado
// · Mensaje de cierre temporal (vacaciones, etc.)
// 

const CFG_DOC = 'config_general';
const SUCURSALES_CFG = ['Centro', 'Norte', 'Sur', 'Funes', 'Cafferata'];

// Teléfonos hardcodeados en app.js — se usan como fallback si Firestore está vacío
const DEFAULT_TELEFONOS = {
 Centro:    { numero: '5493413890000', activo: true },
 Norte:     { numero: '5493417034333', activo: true },
 Sur:       { numero: '5493413244444', activo: true },
 Funes:     { numero: '5493413116060', activo: true },
 Cafferata: { numero: '5493413244444', activo: true },
};

// Helper: formatear número para mostrar legible 
function _fmtTel(raw) {
 // "5493413315885" → "341 331-5885"
 const s = String(raw || '').replace(/\D/g, '');
 if (s.startsWith('549') && s.length >= 12) {
 const local = s.slice(3);
 return local.slice(0, 3) + ' ' + local.slice(3, 6) + '-' + local.slice(6);
 }
 return s;
}

// Helper: normalizar número a formato internacional 549XXXXXXXXXX 
function _normTel(raw) {
 let s = String(raw || '').replace(/\D/g, '');
 if (!s) return '';
 if (!s.startsWith('549')) {
 // Si empieza con 0, quitar el 0
 if (s.startsWith('0')) s = s.slice(1);
 // Si empieza con 15, quitar
 if (s.startsWith('15')) s = s.slice(2);
 s = '549' + s;
 }
 return s;
}

// Cargar y renderizar el tab 
window.admCargarConfiguracion = async function () {
 const cont = document.getElementById('adm-tab-configuracion');
 if (!cont) return;
 cont.innerHTML = `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">
 <div style="width:28px;height:28px;border:3px solid #333;border-top-color:var(--primary);
 border-radius:50%;animation:cfgSpin .7s linear infinite;margin:0 auto 10px;"></div>
 Cargando configuración...
 </div>
 <style>@keyframes cfgSpin{to{transform:rotate(360deg)}}</style>`;

 let cfg = {};
 try {
 const snap = await window.db.collection('config_menu').doc(CFG_DOC).get();
 if (snap.exists) cfg = snap.data() || {};
 } catch (e) {
 cont.innerHTML = `<div style="padding:20px;color:#ef4444;font-size:13px;">Error al cargar: ${e.message}</div>`;
 return;
 }

 const defaultHorarios = {
 Centro: { m_start: '11:30', m_end: '18:00', n_start: '19:00', n_end: '23:30' },
 Norte: { m_start: '11:30', m_end: '18:00', n_start: '19:00', n_end: '23:30' },
 Sur: { m_start: '11:30', m_end: '18:00', n_start: '19:00', n_end: '23:00' },
 Funes: { m_start: '11:30', m_end: '18:00', n_start: '19:00', n_end: '23:00' },
 Cafferata: { m_start: '11:30', m_end: '18:00', n_start: '19:00', n_end: '23:00' },
 };

 const horarios = cfg.horarios || defaultHorarios;
 const general = cfg.general || {};
 const telefonos = cfg.telefonos || DEFAULT_TELEFONOS;

 // Helpers 
 const inp = (id, val, type = 'time', ph = '') =>
 `<input id="${id}" type="${type}" value="${val || ''}" placeholder="${ph}"
 style="width:100%;padding:9px 10px;background:var(--bg);border:1px solid var(--border);
 border-radius:8px;color:var(--white);font-size:13px;outline:none;box-sizing:border-box;">`;

 const toggle = (id, checked, onchange) =>
 `<label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;">
 <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} onchange="${onchange}"
 style="opacity:0;width:0;height:0;">
 <span style="position:absolute;inset:0;background:${checked ? '#10b981' : '#333'};border-radius:12px;transition:.3s;"></span>
 <span style="position:absolute;top:2px;left:${checked ? '22px' : '2px'};width:20px;height:20px;
 background:#fff;border-radius:50%;transition:.3s;box-shadow:0 1px 4px rgba(0,0,0,.4);"></span>
 </label>`;

 // Sección teléfonos 
 const telefonosHtml = SUCURSALES_CFG.map(suc => {
 const t = telefonos[suc] || DEFAULT_TELEFONOS[suc] || {};
 const num = t.numero || '5493413345885';
 const activo = t.activo !== false;
 return `
 <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;
 padding:12px 14px;margin-bottom:8px;">
 <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
 <div style="font-size:12px;font-weight:800;color:var(--white);display:flex;align-items:center;gap:8px;">
 <span style="width:7px;height:7px;border-radius:50%;background:${activo ? '#25d366' : '#6b7280'};
 box-shadow:0 0 5px ${activo ? '#25d366' : 'transparent'};display:inline-block;"
 id="cfg-tel-dot-${suc}"></span>
 ${suc.toUpperCase()}
 </div>
 <div style="display:flex;align-items:center;gap:8px;">
 <span style="font-size:10px;color:${activo ? '#25d366' : '#6b7280'};font-weight:700;"
 id="cfg-tel-lbl-${suc}">${activo ? 'ACTIVO' : 'INACTIVO'}</span>
 ${toggle(`cfg-tel-activo-${suc}`, activo, `admCfgToggleTel('${suc}',this.checked)`)}
 </div>
 </div>

 <div style="display:flex;gap:8px;align-items:center;">
 <!-- Input número -->
 <div style="flex:1;">
 <input id="cfg-tel-num-${suc}" type="tel"
 value="${num}" placeholder="5493412345678"
 oninput="admCfgPreviewTel('${suc}')"
 style="width:100%;padding:9px 10px;background:var(--surface);
 border:1px solid rgba(37,211,102,.3);border-radius:8px;
 color:#25d366;font-size:13px;font-family:monospace;font-weight:700;
 outline:none;box-sizing:border-box;letter-spacing:.5px;">
 <div id="cfg-tel-preview-${suc}"
 style="font-size:10px;color:#6b7280;margin-top:4px;font-family:monospace;">
 wa.me/${num}
 </div>
 </div>
 <!-- Botón probar en WA -->
 <button onclick="admCfgProbarWsp('${suc}')"
 title="Abrir WhatsApp con este número"
 style="flex-shrink:0;width:40px;height:40px;border-radius:10px;border:1px solid rgba(37,211,102,.4);
 background:rgba(37,211,102,.08);cursor:pointer;display:flex;align-items:center;
 justify-content:center;font-size:18px;transition:background .2s;"
 onmouseover="this.style.background='rgba(37,211,102,.2)'"
 onmouseout="this.style.background='rgba(37,211,102,.08)'">

 </button>
 </div>
 </div>`;
 }).join('');

 // Sección horarios 
 const horariosHtml = SUCURSALES_CFG.map(suc => {
 const h = horarios[suc] || defaultHorarios[suc] || {};
 const cerrado = h.cerrado === true;
 return `
 <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;
 padding:16px;margin-bottom:12px;">
 <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
 <div style="font-size:13px;font-weight:800;color:var(--white);
 display:flex;align-items:center;gap:8px;">
 <span style="width:8px;height:8px;border-radius:50%;
 background:${cerrado ? '#ef4444' : '#10b981'};
 box-shadow:0 0 6px ${cerrado ? '#ef4444' : '#10b981'};
 display:inline-block;" id="cfg-dot-${suc}"></span>
 ${suc.toUpperCase()}
 </div>
 <div style="display:flex;align-items:center;gap:10px;">
 <span style="font-size:11px;color:${cerrado ? '#ef4444' : '#10b981'};font-weight:700;"
 id="cfg-estado-label-${suc}">${cerrado ? 'CERRADO' : 'ABIERTO'}</span>
 ${toggle(`cfg-cerrado-${suc}`, cerrado, `admCfgToggleCerrado('${suc}',this.checked)`)}
 </div>
 </div>

 <div style="margin-bottom:10px;">
 <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;
 letter-spacing:.5px;margin-bottom:6px;"> Turno Mediodía</div>
 <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
 <div>
 <div style="font-size:10px;color:#6b7280;margin-bottom:3px;">Abre</div>
 ${inp(`cfg-${suc}-m_start`, h.m_start || '11:30')}
 </div>
 <div>
 <div style="font-size:10px;color:#6b7280;margin-bottom:3px;">Cierra</div>
 ${inp(`cfg-${suc}-m_end`, h.m_end || '18:00')}
 </div>
 </div>
 </div>

 <div style="margin-bottom:14px;">
 <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;
 letter-spacing:.5px;margin-bottom:6px;"> Turno Noche</div>
 <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
 <div>
 <div style="font-size:10px;color:#6b7280;margin-bottom:3px;">Abre</div>
 ${inp(`cfg-${suc}-n_start`, h.n_start || '19:00')}
 </div>
 <div>
 <div style="font-size:10px;color:#6b7280;margin-bottom:3px;">Cierra</div>
 ${inp(`cfg-${suc}-n_end`, h.n_end || '23:30')}
 </div>
 </div>
 </div>

 <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
 <div>
 <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;
 letter-spacing:.5px;margin-bottom:4px;">⏱ Tiempo est. (min)</div>
 <input id="cfg-${suc}-tiempo" type="number" min="10" max="120" step="5"
 value="${h.tiempoEst || 45}" placeholder="45"
 style="width:100%;padding:9px;background:var(--bg);border:1px solid var(--border);
 border-radius:8px;color:var(--white);font-size:13px;outline:none;box-sizing:border-box;">
 </div>
 <div>
 <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;
 letter-spacing:.5px;margin-bottom:4px;"> Mínimo pedido $</div>
 <input id="cfg-${suc}-minimo" type="number" min="0" step="100"
 value="${h.minimoPedido || 0}" placeholder="0"
 style="width:100%;padding:9px;background:var(--bg);border:1px solid var(--border);
 border-radius:8px;color:var(--white);font-size:13px;outline:none;box-sizing:border-box;">
 </div>
 </div>

 <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
 <div style="display:flex;align-items:center;justify-content:space-between;
 background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;">
 <span style="font-size:12px;color:#9ca3af;font-weight:700;"> Delivery</span>
 ${toggle(`cfg-${suc}-delivery`, h.delivery !== false, `admCfgToggles('${suc}')`)}
 </div>
 <div style="display:flex;align-items:center;justify-content:space-between;
 background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;">
 <span style="font-size:12px;color:#9ca3af;font-weight:700;"> Retiro</span>
 ${toggle(`cfg-${suc}-retiro`, h.retiro !== false, `admCfgToggles('${suc}')`)}
 </div>
 </div>
 </div>`;
 }).join('');

 // HTML completo del tab 
 cont.innerHTML = `
 <style>@keyframes cfgSpin{to{transform:rotate(360deg)}}</style>
 <div style="padding:20px;padding-bottom:100px;">

 <!-- Header -->
 <h3 style="color:var(--primary);font-weight:800;font-size:16px;margin-bottom:4px;">
 CONFIGURACIÓN GENERAL
 </h3>
 <p style="color:#9ca3af;font-size:12px;margin-bottom:24px;">
 Todos los cambios se guardan en Firestore y se aplican en tiempo real sin tocar el código.
 </p>

 <!-- SECCIÓN: TELÉFONOS WHATSAPP -->
 <div style="background:var(--surface);border:1px solid rgba(37,211,102,.25);border-radius:14px;
 padding:16px;margin-bottom:20px;">

 <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
 <div style="font-size:12px;color:#25d366;font-weight:800;text-transform:uppercase;
 letter-spacing:.5px;display:flex;align-items:center;gap:6px;">
 TELÉFONOS WHATSAPP
 </div>
 <button onclick="admCfgProbarTodosWsp()"
 style="font-size:10px;font-weight:700;padding:5px 10px;border-radius:6px;cursor:pointer;
 background:rgba(37,211,102,.1);border:1px solid rgba(37,211,102,.3);color:#25d366;">
 Probar todos ↗
 </button>
 </div>
 <p style="color:#6b7280;font-size:11px;margin-bottom:14px;">
 Número en formato internacional sin +. Ej: <span style="font-family:monospace;color:#25d366;">5493412345678</span>
 (549 + código de área sin 0 + número sin 15).
 El toggle desactiva el botón de WA en esa sucursal sin borrar el número.
 </p>

 ${telefonosHtml}
 </div>

 <!-- SECCIÓN: MENSAJE GLOBAL -->
 <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;
 padding:16px;margin-bottom:20px;">
 <div style="font-size:12px;color:#9ca3af;font-weight:700;text-transform:uppercase;
 letter-spacing:.5px;margin-bottom:12px;"> Mensaje Global (aparece arriba del menú)</div>

 <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
 <span style="font-size:12px;color:var(--white);font-weight:700;">Activar mensaje</span>
 ${toggle('cfg-msg-activo', general.mensajeActivo === true, "admCfgToggleMsg(this.checked)")}
 </div>
 <div style="margin-bottom:8px;">
 <div style="font-size:10px;color:#9ca3af;margin-bottom:4px;">TEXTO DEL MENSAJE</div>
 <input id="cfg-msg-texto" type="text" maxlength="120"
 value="${general.mensajeTexto || ''}"
 placeholder="Ej: ¡Estamos de fiesta! 10% off en todos los combos hoy "
 style="width:100%;padding:9px;background:var(--bg);border:1px solid var(--border);
 border-radius:8px;color:var(--white);font-size:13px;outline:none;box-sizing:border-box;">
 </div>
 <div>
 <div style="font-size:10px;color:#9ca3af;margin-bottom:4px;">COLOR DEL BANNER</div>
 <div style="display:flex;gap:8px;flex-wrap:wrap;">
 ${['#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#ec4899'].map(c =>
 `<div onclick="admCfgSelectColor('${c}')"
 style="width:28px;height:28px;border-radius:6px;background:${c};cursor:pointer;
 border:2px solid ${(general.mensajeColor||'#f59e0b')===c ? '#fff' : 'transparent'};
 transition:border-color .2s;" data-color="${c}"></div>`
 ).join('')}
 </div>
 <input type="hidden" id="cfg-msg-color" value="${general.mensajeColor || '#f59e0b'}">
 </div>
 </div>

     <!-- SECCIÓN: MENSAJE WHATSAPP CLIENTE -->
    <div style="background:var(--surface);border:1px solid rgba(37,211,102,.25);border-radius:14px;
      padding:16px;margin-bottom:20px;">
      <div style="font-size:12px;color:#25d366;font-weight:700;text-transform:uppercase;
        letter-spacing:.5px;margin-bottom:12px;"> Mensaje de Confirmación al Cliente (WhatsApp)</div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div>
          <span style="font-size:12px;color:var(--white);font-weight:700;display:block;">
            Enviar mensaje al completar el pedido
          </span>
          <span style="font-size:10px;color:#6b7280;display:block;margin-top:2px;">
            Si está desactivado, el pedido se guarda pero NO abre WhatsApp.
          </span>
        </div>
        ${toggle('cfg-wsp-cliente-activo', general.wspClienteActivo !== false, "admCfgToggleWspCliente(this.checked)")}
      </div>

      <!-- Preview del mensaje -->
      <div id="cfg-wsp-preview"
        style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px;
        font-size:11px;color:#9ca3af;font-family:monospace;line-height:1.7;white-space:pre-wrap;
        opacity:${general.wspClienteActivo !== false ? '1' : '0.4'};transition:opacity .3s;">*NUEVO PEDIDO | MARVEL FOOD*
---------------------------
*Sucursal:* San Martin 1808, Rosario Sur
*Horario Est.:* 20:14 a 20:29 hs
*Teléfono:* 3413 24-4444
*Cliente:* NOMBRE APELLIDO
*Tipo:* Retiro
---------------------------
*Pago:* Tarjeta
---------------------------
*1x Vision Veggie* ($6.800)
---------------------------
*Subtotal:* $6.800

*TOTAL FINAL: $6.800*</div>
    </div>

    <!-- SECCIÓN: CIERRE TEMPORAL -->
 <div style="background:var(--surface);border:1px solid rgba(239,68,68,.3);border-radius:14px;
 padding:16px;margin-bottom:20px;">
 <div style="font-size:12px;color:#ef4444;font-weight:700;text-transform:uppercase;
 letter-spacing:.5px;margin-bottom:12px;"> Cierre Temporal (vacaciones / fuerza mayor)</div>
 <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
 <span style="font-size:12px;color:var(--white);font-weight:700;">Cerrar TODAS las sucursales</span>
 ${toggle('cfg-cierre-global', general.cierreGlobal === true, "admCfgToggleCierreGlobal(this.checked)")}
 </div>
 <div>
 <div style="font-size:10px;color:#9ca3af;margin-bottom:4px;">MENSAJE PARA EL CLIENTE</div>
 <input id="cfg-cierre-msg" type="text" maxlength="120"
 value="${general.cierreMensaje || ''}"
 placeholder="Ej: Estamos de vacaciones, volvemos el lunes "
 style="width:100%;padding:9px;background:var(--bg);border:1px solid rgba(239,68,68,.3);
 border-radius:8px;color:var(--white);font-size:13px;outline:none;box-sizing:border-box;">
 </div>
 </div>

 <!-- SECCIÓN: HORARIOS -->
 <div style="font-size:12px;color:#9ca3af;font-weight:700;text-transform:uppercase;
 letter-spacing:.5px;margin-bottom:6px;"> Horarios por Sucursal</div>
 <p style="color:#6b7280;font-size:11px;margin-bottom:16px;">
 Activá el toggle rojo para marcar una sucursal como cerrada temporalmente.
 </p>
 ${horariosHtml}

 <!-- Botón guardar global -->
 <button onclick="admGuardarConfiguracion()"
 style="width:100%;padding:14px;background:var(--primary);color:#000;border:none;
 border-radius:12px;font-weight:800;font-size:15px;cursor:pointer;
 margin-top:8px;letter-spacing:.5px;transition:opacity .2s;"
 onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
 GUARDAR TODA LA CONFIGURACIÓN
 </button>
 <div id="cfg-feedback" style="margin-top:10px;text-align:center;font-size:12px;font-weight:700;
 min-height:20px;"></div>
 </div>`;
};

// Helpers visuales de teléfono 
window.admCfgPreviewTel = function (suc) {
 const inp = document.getElementById(`cfg-tel-num-${suc}`);
 const prev = document.getElementById(`cfg-tel-preview-${suc}`);
 if (!inp || !prev) return;
 const norm = _normTel(inp.value);
 if (norm) {
 inp.style.borderColor = 'rgba(37,211,102,.5)';
 inp.style.color = '#25d366';
 prev.textContent = `wa.me/${norm}`;
 prev.style.color = '#25d366';
 } else {
 inp.style.borderColor = 'rgba(239,68,68,.4)';
 inp.style.color = '#ef4444';
 prev.textContent = 'Número inválido';
 prev.style.color = '#ef4444';
 }
};

window.admCfgToggleTel = function (suc, activo) {
 const dot = document.getElementById(`cfg-tel-dot-${suc}`);
 const lbl = document.getElementById(`cfg-tel-lbl-${suc}`);
 if (dot) { dot.style.background = activo ? '#25d366' : '#6b7280'; dot.style.boxShadow = activo ? '0 0 5px #25d366' : 'none'; }
 if (lbl) { lbl.style.color = activo ? '#25d366' : '#6b7280'; lbl.textContent = activo ? 'ACTIVO' : 'INACTIVO'; }
 // actualizar el span del toggle visualmente
 const chk = document.getElementById(`cfg-tel-activo-${suc}`);
 if (chk) {
 const sp = chk.nextElementSibling;
 const dp = sp && sp.nextElementSibling;
 if (sp) sp.style.background = activo ? '#10b981' : '#333';
 if (dp) dp.style.left = activo ? '22px' : '2px';
 }
};

// Probar un número en WhatsApp 
window.admCfgProbarWsp = function (suc) {
 const inp = document.getElementById(`cfg-tel-num-${suc}`);
 const num = _normTel(inp ? inp.value : '');
 if (!num) { alert('Ingresá un número válido primero'); return; }
 const msg = encodeURIComponent(`Hola, soy el admin de Marvel Food (${suc}). ¡Probando el número! `);
 window.open(`https://wa.me/${num}?text=${msg}`, '_blank');
};

window.admCfgProbarTodosWsp = function () {
 SUCURSALES_CFG.forEach(suc => {
 const inp = document.getElementById(`cfg-tel-num-${suc}`);
 if (inp && inp.value) admCfgPreviewTel(suc);
 });
 alert('Revisá los previews actualizados. Usá el botón de cada sucursal para abrir WhatsApp.');
};

// Toggles visuales varios 
window.admCfgToggleCerrado = function (suc, cerrado) {
 const dot = document.getElementById(`cfg-dot-${suc}`);
 const label = document.getElementById(`cfg-estado-label-${suc}`);
 if (dot) { dot.style.background = cerrado ? '#ef4444' : '#10b981'; dot.style.boxShadow = `0 0 6px ${cerrado ? '#ef4444' : '#10b981'}`; }
 if (label) { label.style.color = cerrado ? '#ef4444' : '#10b981'; label.textContent = cerrado ? 'CERRADO' : 'ABIERTO'; }
 const chk = document.getElementById(`cfg-cerrado-${suc}`);
 if (chk) {
 const span = chk.nextElementSibling;
 const dot2 = span && span.nextElementSibling;
 if (span) span.style.background = cerrado ? '#10b981' : '#333';
 if (dot2) dot2.style.left = cerrado ? '22px' : '2px';
 }
};

window.admCfgToggles = function () {};

window.admCfgToggleMsg = function (activo) {
 const chk = document.getElementById('cfg-msg-activo');
 if (chk) {
 const span = chk.nextElementSibling;
 const dot = span && span.nextElementSibling;
 if (span) span.style.background = activo ? '#10b981' : '#333';
 if (dot) dot.style.left = activo ? '22px' : '2px';
 }
};

window.admCfgToggleCierreGlobal = function (activo) {
 const chk = document.getElementById('cfg-cierre-global');
 if (chk) {
 const span = chk.nextElementSibling;
 const dot = span && span.nextElementSibling;
 if (span) span.style.background = activo ? '#ef4444' : '#333';
 if (dot) dot.style.left = activo ? '22px' : '2px';
 }
};

window.admCfgToggleWspCliente = function (activo) {
  const chk = document.getElementById('cfg-wsp-cliente-activo');
  if (chk) {
    const span = chk.nextElementSibling;
    const dot = span && span.nextElementSibling;
    if (span) span.style.background = activo ? '#25d366' : '#333';
    if (dot) dot.style.left = activo ? '22px' : '2px';
  }
  const preview = document.getElementById('cfg-wsp-preview');
  if (preview) preview.style.opacity = activo ? '1' : '0.4';
};

window.admCfgSelectColor = function (color) {
 document.getElementById('cfg-msg-color').value = color;
 document.querySelectorAll('[data-color]').forEach(el => {
 el.style.borderColor = el.dataset.color === color ? '#fff' : 'transparent';
 });
};

// Guardar toda la configuración en Firestore 
window.admGuardarConfiguracion = async function () {
 const fb = document.getElementById('cfg-feedback');
 if (fb) { fb.style.color = '#9ca3af'; fb.textContent = 'Guardando...'; }

 try {
 // Teléfonos
 const telefonos = {};
 SUCURSALES_CFG.forEach(suc => {
 const raw = document.getElementById(`cfg-tel-num-${suc}`)?.value || '';
 const activo = document.getElementById(`cfg-tel-activo-${suc}`)?.checked !== false;
 const numero = _normTel(raw) || DEFAULT_TELEFONOS[suc].numero;
 telefonos[suc] = { numero, activo };
 });

 // Horarios
 const horarios = {};
 SUCURSALES_CFG.forEach(suc => {
 const g = id => document.getElementById(id);
 horarios[suc] = {
 m_start: g(`cfg-${suc}-m_start`)?.value || '11:30',
 m_end: g(`cfg-${suc}-m_end`)?.value || '18:00',
 n_start: g(`cfg-${suc}-n_start`)?.value || '19:00',
 n_end: g(`cfg-${suc}-n_end`)?.value || '23:30',
 tiempoEst: parseInt(g(`cfg-${suc}-tiempo`)?.value) || 45,
 minimoPedido: parseInt(g(`cfg-${suc}-minimo`)?.value) || 0,
 delivery: g(`cfg-${suc}-delivery`)?.checked !== false,
 retiro: g(`cfg-${suc}-retiro`)?.checked !== false,
 cerrado: g(`cfg-cerrado-${suc}`)?.checked === true,
 };
 });

 // General
 const general = {
 mensajeActivo: document.getElementById('cfg-msg-activo')?.checked === true,
 mensajeTexto: document.getElementById('cfg-msg-texto')?.value.trim() || '',
 mensajeColor: document.getElementById('cfg-msg-color')?.value || '#f59e0b',
 cierreGlobal: document.getElementById('cfg-cierre-global')?.checked === true,
 cierreMensaje: document.getElementById('cfg-cierre-msg')?.value.trim() || '',
 };

 await window.db.collection('config_menu').doc(CFG_DOC).set(
 { telefonos, horarios, general },
 { merge: true }
 );

 // Aplicar teléfonos en SUC_MAP en memoria (sin recargar)
 if (window.SUC_MAP) {
 SUCURSALES_CFG.forEach(suc => {
 if (window.SUC_MAP[suc]) {
 window.SUC_MAP[suc].wsp = telefonos[suc].numero;
 window.SUC_MAP[suc].wspOff = !telefonos[suc].activo;
 }
 });
 }

 // Actualizar horarios en memoria
 if (window.HORARIOS_SUCURSALES) {
 SUCURSALES_CFG.forEach(suc => { window.HORARIOS_SUCURSALES[suc] = horarios[suc]; });
 }

 // Aplicar config en vivo (mensajes/cierre)
 if (typeof window._admAplicarConfigEnVivo === 'function') {
 window._admAplicarConfigEnVivo({ horarios, general, telefonos });
 }

 if (fb) { fb.style.color = '#10b981'; fb.textContent = ' Configuración guardada correctamente'; }
 setTimeout(() => { if (fb) fb.textContent = ''; }, 4000);

 } catch (e) {
 if (fb) { fb.style.color = '#ef4444'; fb.textContent = 'Error: ' + e.message; }
 console.error('[Config] Error guardando:', e);
 }
};

// Cargar config al inicio del storefront 
window.cargarConfigGeneral = async function () {
 if (!window.db) return;
 try {
 const snap = await window.db.collection('config_menu').doc(CFG_DOC).get();
 if (!snap.exists) return;
 const cfg = snap.data() || {};

 // Aplicar teléfonos en SUC_MAP
 if (cfg.telefonos && window.SUC_MAP) {
 SUCURSALES_CFG.forEach(suc => {
 if (cfg.telefonos[suc] && window.SUC_MAP[suc]) {
 window.SUC_MAP[suc].wsp = cfg.telefonos[suc].numero;
 window.SUC_MAP[suc].wspOff = !cfg.telefonos[suc].activo;
 }
 });
 }

 // Aplicar horarios en memoria
 if (cfg.horarios && window.HORARIOS_SUCURSALES) {
 Object.assign(window.HORARIOS_SUCURSALES, cfg.horarios);
 }

 // Aplicar cierre global
 const gen = cfg.general || {};
 if (gen.cierreGlobal) _mostrarCierreGlobal(gen.cierreMensaje);
 if (gen.mensajeActivo && gen.mensajeTexto) _mostrarMensajeGlobal(gen.mensajeTexto, gen.mensajeColor);
 window._cfgWspClienteActivo = gen.wspClienteActivo !== false;

 } catch (e) {
 console.warn('[Config] Error cargando config general:', e.message);
 }
};

// Banners en storefront 
function _mostrarCierreGlobal(msg) {
 const el = document.getElementById('cfg-cierre-banner');
 if (el) { el.style.display = 'flex'; const t = el.querySelector('#cfg-cierre-msg-txt'); if (t) t.textContent = msg || 'Cerrado temporalmente'; return; }
 const div = document.createElement('div');
 div.id = 'cfg-cierre-banner';
 div.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(10,10,10,.97);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;';
 div.innerHTML = `<div style="font-size:52px;margin-bottom:16px;"></div>
 <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:10px;">Cerrado</div>
 <div id="cfg-cierre-msg-txt" style="font-size:15px;color:#9ca3af;max-width:300px;line-height:1.6;">${msg || 'Volvemos pronto'}</div>`;
 document.body.appendChild(div);
}

function _mostrarMensajeGlobal(texto, color) {
 let el = document.getElementById('cfg-msg-banner');
 if (!el) {
 el = document.createElement('div');
 el.id = 'cfg-msg-banner';
 el.style.cssText = 'width:100%;text-align:center;padding:10px 16px;font-size:13px;font-weight:700;color:#000;position:sticky;top:0;z-index:100;box-sizing:border-box;cursor:default;letter-spacing:.3px;';
 const main = document.querySelector('.main-content') || document.body;
 main.insertBefore(el, main.firstChild);
 }
 el.style.background = color || '#f59e0b';
 el.textContent = texto;
 el.style.display = 'block';
}

// Aplicar en vivo desde admin sin recargar 
window._admAplicarConfigEnVivo = function ({ general, telefonos }) {
 const gen = general || {};

 // Flag WhatsApp cliente (propagado a app.js vía window global)
 window._cfgWspClienteActivo = gen.wspClienteActivo !== false;

 // Teléfonos en SUC_MAP en memoria
 if (telefonos && window.SUC_MAP) {
 SUCURSALES_CFG.forEach(suc => {
 if (telefonos[suc] && window.SUC_MAP[suc]) {
 window.SUC_MAP[suc].wsp = telefonos[suc].numero;
 window.SUC_MAP[suc].wspOff = !telefonos[suc].activo;
 }
 });
 }

 // Mensaje global
 if (gen.mensajeActivo && gen.mensajeTexto) {
 _mostrarMensajeGlobal(gen.mensajeTexto, gen.mensajeColor);
 } else {
 const el = document.getElementById('cfg-msg-banner');
 if (el) el.style.display = 'none';
 }

 // Cierre global
 if (gen.cierreGlobal) {
 _mostrarCierreGlobal(gen.cierreMensaje);
 } else {
 const el = document.getElementById('cfg-cierre-banner');
 if (el) el.style.display = 'none';
 }

 if (typeof window.actualizarEstadoLocal === 'function') {
 window.actualizarEstadoLocal();
 }
};
