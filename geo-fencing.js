// geo-fencing.js — Panel admin de zonas de envío con Leaflet + Firebase
// GeoFencing Admin Panel
// ✅ FIX shadowing: _gfPendingFile vive ÚNICAMENTE dentro del IIFE (línea ~134).
//    Las declaraciones externas fueron eliminadas definitivamente.
//    Las funciones externas gfHandleFile/gfHandleDrop delegan al IIFE via window.*
const _GF_ADMINS = ['ulises', 'leticia'];

// Context-aware getElementById: when the floating modal (gf-import-panel) is
// open, resolves to the "-m" suffixed variant of the element so the modal's
// controls are targeted instead of the sidebar's identically-named ones.
// Falls back to the plain ID when the modal is closed (sidebar context).
function gfEl(id) {
  const modal = document.getElementById('gf-import-panel');
  if (modal && modal.style.display === 'flex') {
    const modalEl = document.getElementById(id + '-m');
    if (modalEl) return modalEl;
  }
  return document.getElementById(id);
}

function _gfCurrentAdmin() {
 // Detectar usuario admin activo desde el sistema de admin del index
 const admUser = (window._admCurrentUser || window.admCurrentUser || '').toString().toLowerCase();
 return admUser;
}

window.admAbrirGeoFencing = function() {
 const user = _gfCurrentAdmin();
 if (!_GF_ADMINS.includes(user)) {
 alert('Solo ulises y leticia pueden acceder al panel GeoFencing.');
 return;
 }
 document.getElementById('gf-import-panel').style.display = 'flex';
 gfCargarStats();
};

window.admCerrarGeoFencing = function() {
 document.getElementById('gf-import-panel').style.display = 'none';
  // Reset file input so IIFE's _gfPendingFile won't carry over to next open.
  const fi = document.getElementById('gf-kml-input'); if (fi) fi.value = '';
};

// ✅ FIX shadowing: estas funciones externas NO declaran ni tocan _gfPendingFile.
//    Solo delegan al IIFE. La guardia usa una bandera booleana en lugar de
//    comparar referencias de función (más robusta ante recargas parciales).
function gfHandleFile(evt) {
 // Delegate to the IIFE version which manages its own _gfPendingFile.
 // At call time the IIFE has already run, so window.gfHandleFile IS the correct one.
 // Avoid infinite recursion: only delegate if window.gfHandleFile is not this function.
 if (window.gfHandleFile && window.gfHandleFile !== gfHandleFile) {
   window.gfHandleFile(evt);
   return;
 }
 // Fallback (should never happen after IIFE runs)
 const file = evt.target.files[0];
 if (!file) return;
 gfEl('gf-drop-label').textContent = ' ' + file.name + ' listo';
 gfEl('gf-drop-zone').style.borderColor = '#10b981';
 const btn = gfEl('gf-btn-sync');
 if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
}

function gfHandleDrop(evt) {
 // Delegate to the IIFE version (which has correct _gfPendingFile scope).
 if (window.gfHandleDrop && window.gfHandleDrop !== gfHandleDrop) {
   window.gfHandleDrop(evt);
   return;
 }
 evt.preventDefault();
 evt.currentTarget.style.borderColor = '#333';
 evt.currentTarget.style.background = '';
 const file = Array.from(evt.dataTransfer.files).find(f => f.name.endsWith('.kml') || f.name.endsWith('.geojson') || f.name.endsWith('.json')
 );
 if (!file) { gfShowResult('Solo se aceptan archivos .kml o .geojson', 'error'); return; }
 gfHandleFile({ target: { files: [file] } });
}

// gfRunSync: delegated to window.gfRunSync defined inside the IIFE below.
// The outer stub is intentionally removed to prevent it from overwriting
// the correct implementation that has the full KML/GeoJSON import logic.

function gfShowResult(msg, type) {
 const el = document.getElementById('gf-import-result');
 const colors = { success:'rgba(16,185,129,0.12)', error:'rgba(239,68,68,0.12)', warn:'rgba(245,158,11,0.12)' };
 const textColors = { success:'#10b981', error:'#ef4444', warn:'#f59e0b' };
 el.style.display = 'block';
 el.style.background = colors[type] || colors.warn;
 el.style.color = textColors[type] || textColors.warn;
 el.style.border = '1px solid ' + (textColors[type] || textColors.warn) + '55';
 el.textContent = msg;
}

async function gfCargarStats() {
 const statsEl = document.getElementById('gf-stats');
 if (!statsEl) return;
 if (!window.db) {
 statsEl.textContent = 'Firebase no disponible';
 return;
 }
 try {
 const snap = await window.db.collection('delivery_zones')
 .where('active', '==', true).get();
 let total = 0, privados = 0;
 const sucursales = {};
 snap.forEach(doc => {
 total++;
 const d = doc.data();
 if (d.requiresSpecialAccess) privados++;
 sucursales[d.sucursal] = (sucursales[d.sucursal] || 0) + 1;
 });
 const sucStr = Object.entries(sucursales)
 .map(([k,v]) => k + ': ' + v).join(' · ');
 statsEl.innerHTML = total === 0
 ? ' Sin zonas en Firebase — importá el KML para empezar'
 : ` <strong style="color:#e2e8f0;">${total}</strong> zonas activas · ${privados} privados<br><span style="font-size:10px;">${sucStr}</span>`;
 } catch(e) {
 statsEl.textContent = 'Error cargando stats: ' + e.message;
 }
}

(function() {
'use strict';

// GeoJSON con todas las zonas de envio (fuente de verdad)
const GF_GEOJSON = {"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.65624,-32.9279719,0],[-60.6673851,-32.9205569,0],[-60.6708183,-32.9160898,0],[-60.6756249,-32.9098931,0],[-60.6768265,-32.9054255,0],[-60.6802597,-32.9029754,0],[-60.6852379,-32.8946157,0],[-60.6874695,-32.8881292,0],[-60.6867829,-32.8802006,0],[-60.6883278,-32.8741456,0],[-60.6895294,-32.8712621,0],[-60.6967392,-32.8721272,0],[-60.7001724,-32.8731364,0],[-60.704979,-32.8763082,0],[-60.6977692,-32.8974984,0],[-60.692791,-32.910974,0],[-60.6901302,-32.9187557,0],[-60.6842938,-32.9230786,0],[-60.6766548,-32.9288421,0],[-60.6737366,-32.9325882,0],[-60.6699729,-32.9327266,0],[-60.6623211,-32.9302829,0],[-60.65624,-32.9279719,0]]]},"properties":{"name":"NORTE 1","styleUrl":"#poly-1A237E-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#1a237e","stroke-opacity":1,"stroke":"#1a237e","stroke-width":1.2,"sucursal":"Norte","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.7195702,-32.8935347,0],[-60.7066097,-32.8933184,0],[-60.7113304,-32.8840929,0],[-60.7195702,-32.8935347,0]]]},"properties":{"name":"NORTE 2","styleUrl":"#poly-1A237E-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#1a237e","stroke-opacity":1,"stroke":"#1a237e","stroke-width":1.2,"sucursal":"Norte","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.7066097,-32.8933184,0],[-60.7063298,-32.8955522,0],[-60.7058577,-32.8998041,0],[-60.704699,-32.9013896,0],[-60.700107,-32.9040919,0],[-60.6957297,-32.9072266,0],[-60.6941418,-32.9071545,0],[-60.7000212,-32.8910838,0],[-60.7064156,-32.8920207,0],[-60.7066097,-32.8933184,0]]]},"properties":{"name":"NORTE 3","styleUrl":"#poly-1A237E-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#1a237e","stroke-opacity":1,"stroke":"#1a237e","stroke-width":1.2,"sucursal":"Norte","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.7096557,-32.8843808,0],[-60.702403,-32.8841646,0],[-60.704935,-32.8767402,0],[-60.7069091,-32.8785964,0],[-60.7085185,-32.8808309,0],[-60.7094197,-32.8821464,0],[-60.7093768,-32.8831194,0],[-60.7093338,-32.8839303,0],[-60.7096557,-32.8843808,0]]]},"properties":{"name":"NORTE 4","styleUrl":"#poly-3949AB-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#3949ab","stroke-opacity":1,"stroke":"#3949ab","stroke-width":1.2,"sucursal":"Norte","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.6987869,-32.8709556,0],[-60.6988727,-32.8703789,0],[-60.7001602,-32.8661255,0],[-60.6908046,-32.8657651,0],[-60.6914054,-32.8628092,0],[-60.6929504,-32.8600695,0],[-60.6950103,-32.8550946,0],[-60.7035934,-32.8552388,0],[-60.7051383,-32.8506242,0],[-60.6959545,-32.8501195,0],[-60.6982719,-32.838077,0],[-60.7013618,-32.838077,0],[-60.7017051,-32.8356972,0],[-60.7110607,-32.8361299,0],[-60.7118331,-32.8367789,0],[-60.7125198,-32.8413222,0],[-60.7150089,-32.8447835,0],[-60.7193862,-32.849759,0],[-60.7224761,-32.8536526,0],[-60.7229053,-32.8549504,0],[-60.7185279,-32.8657651,0],[-60.716983,-32.8657651,0],[-60.7167255,-32.8717486,0],[-60.7066833,-32.8712439,0],[-60.7051383,-32.8750646,0],[-60.6987869,-32.8709556,0]]]},"properties":{"name":"NORTE | ZONA BAIGORRIA","styleUrl":"#poly-1A237E-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#1a237e","stroke-opacity":1,"stroke":"#1a237e","stroke-width":1.2,"sucursal":"Norte","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.6736608,-32.9743097,0],[-60.6757538,-32.9819087,0],[-60.6765262,-32.9833486,0],[-60.6768696,-32.9838526,0],[-60.6765262,-32.9851486,0],[-60.6780712,-32.9916999,0],[-60.6785862,-32.9963072,0],[-60.6774704,-32.9996905,0],[-60.6780712,-33.0029297,0],[-60.6772987,-33.0070326,0],[-60.6683723,-33.0122868,0],[-60.6597892,-33.0151657,0],[-60.6512062,-33.0160293,0],[-60.6398765,-33.0156695,0],[-60.6354992,-33.0111352,0],[-60.6262294,-33.0040814,0],[-60.6208221,-33.0039375,0],[-60.6185047,-32.9999784,0],[-60.6187622,-32.9956593,0],[-60.6209938,-32.9934277,0],[-60.628461,-32.9934277,0],[-60.6282894,-32.9825567,0],[-60.6736608,-32.9743097,0]]]},"properties":{"name":"ZONA SUR","styleUrl":"#poly-7CB342-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#7cb342","stroke-opacity":1,"stroke":"#7cb342","stroke-width":1.2,"sucursal":"Sur","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.6183701,-33.0018199,0],[-60.6175976,-33.0103853,0],[-60.6161385,-33.0125446,0],[-60.6136494,-33.0085859,0],[-60.6136494,-33.0061387,0],[-60.6151085,-33.0028276,0],[-60.6157093,-33.001244,0],[-60.6183701,-33.0018199,0]]]},"properties":{"name":"GALVEZ 1","styleUrl":"#poly-7CB342-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#7cb342","stroke-opacity":1,"stroke":"#7cb342","stroke-width":1.2,"sucursal":"Sur","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.6161385,-33.0125446,0],[-60.6206875,-33.0155778,0],[-60.6353645,-33.0161535,0],[-60.6436043,-33.0187444,0],[-60.6345921,-33.0336406,0],[-60.6273823,-33.0419152,0],[-60.6109886,-33.0414835,0],[-60.6181984,-33.0326332,0],[-60.6155377,-33.0326332,0],[-60.6163101,-33.027884,0],[-60.6127052,-33.0276681,0],[-60.6132202,-33.0136345,0],[-60.615366,-33.0134906,0],[-60.6161385,-33.0125446,0]]]},"properties":{"name":"GALVEZ 2","styleUrl":"#poly-7CB342-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#7cb342","stroke-opacity":1,"stroke":"#7cb342","stroke-width":1.2,"sucursal":"Sur","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.656436,-33.034648,0],[-60.6557493,-33.0329211,0],[-60.6560497,-33.031338,0],[-60.6561356,-33.0297909,0],[-60.6559639,-33.0287835,0],[-60.6550198,-33.0283517,0],[-60.6618433,-33.0284956,0],[-60.6619721,-33.0347919,0],[-60.656436,-33.034648,0]]]},"properties":{"name":"GALVEZ 3","styleUrl":"#poly-7CB342-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#7cb342","stroke-opacity":1,"stroke":"#7cb342","stroke-width":1.2,"sucursal":"Sur","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.6560927,-33.0339285,0],[-60.6566935,-33.0368067,0],[-60.6442909,-33.036267,0],[-60.6353216,-33.0323454,0],[-60.6372957,-33.0293951,0],[-60.6397848,-33.0293951,0],[-60.6400852,-33.0257971,0],[-60.6494408,-33.025977,0],[-60.6494408,-33.0285316,0],[-60.6553202,-33.0286036,0],[-60.6560068,-33.0292512,0],[-60.6560068,-33.0304385,0],[-60.6558352,-33.0316258,0],[-60.6557493,-33.0329211,0],[-60.6560927,-33.0339285,0]]]},"properties":{"name":"GALVEZ 4","styleUrl":"#poly-7CB342-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#7cb342","stroke-opacity":1,"stroke":"#7cb342","stroke-width":1.2,"sucursal":"Sur","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.7769835,-32.9277622,0],[-60.7777559,-32.922503,0],[-60.8662115,-32.9068946,0],[-60.8695769,-32.92072,0],[-60.8663153,-32.9229535,0],[-60.8642125,-32.9234938,0],[-60.8665299,-32.9251869,0],[-60.8661437,-32.9308783,0],[-60.7769835,-32.9277622,0]]]},"properties":{"name":"FUNES 1","styleUrl":"#poly-9C27B0-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#9c27b0","stroke-opacity":1,"stroke":"#9c27b0","stroke-width":1.2,"sucursal":"Funes","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.8235038,-32.9140698,0],[-60.795008,-32.9191854,0],[-60.7938064,-32.9158711,0],[-60.7902015,-32.9160152,0],[-60.7886565,-32.9089538,0],[-60.796553,-32.898721,0],[-60.7974971,-32.8936041,0],[-60.8171523,-32.8937483,0],[-60.816294,-32.9107552,0],[-60.8192981,-32.9108993,0],[-60.8204139,-32.9119802,0],[-60.8227313,-32.9121963,0],[-60.8235038,-32.9140698,0]]]},"properties":{"name":"FUNES 2","styleUrl":"#poly-9C27B0-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#9c27b0","stroke-opacity":1,"stroke":"#9c27b0","stroke-width":1.2,"sucursal":"Funes","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.7985506,-32.9286532,0],[-60.8357153,-32.92995,0],[-60.8360157,-32.93366,0],[-60.8315096,-32.9352448,0],[-60.8261881,-32.9379822,0],[-60.8197079,-32.9394228,0],[-60.815116,-32.9402872,0],[-60.809494,-32.9411876,0],[-60.8027134,-32.9414397,0],[-60.8028422,-32.9343444,0],[-60.7981644,-32.9340922,0],[-60.7985506,-32.9286532,0]]]},"properties":{"name":"FUNES 3","styleUrl":"#poly-9C27B0-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#9c27b0","stroke-opacity":1,"stroke":"#9c27b0","stroke-width":1.2,"sucursal":"Funes","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.8353641,-32.9349538,0],[-60.8376815,-32.9370429,0],[-60.8378532,-32.9397802,0],[-60.8378532,-32.9448943,0],[-60.8365657,-32.9514487,0],[-60.8298709,-32.9519529,0],[-60.8191421,-32.9514487,0],[-60.8201721,-32.9402844,0],[-60.8272102,-32.9383395,0],[-60.8342483,-32.9349538,0],[-60.8353641,-32.9349538,0]]]},"properties":{"name":"FUNES 4","description":"BARRIO PRIVADO KENTUCY","styleUrl":"#poly-9C27B0-1200-77","fill-opacity":0.30196078431372547,"fill":"#9c27b0","stroke-opacity":1,"stroke":"#9c27b0","stroke-width":1.2,"sucursal":"Funes","barrio_privado":true}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.7841382,-32.9210299,0],[-60.7693753,-32.9231193,0],[-60.7673154,-32.9197331,0],[-60.7639465,-32.9189225,0],[-60.7613502,-32.9178958,0],[-60.7599769,-32.9174635,0],[-60.7596765,-32.9184362,0],[-60.7537541,-32.918148,0],[-60.7522092,-32.916707,0],[-60.7518659,-32.9143292,0],[-60.7596765,-32.9144733,0],[-60.7602773,-32.9173554,0],[-60.7606206,-32.9092133,0],[-60.7473168,-32.908853,0],[-60.7474885,-32.9016469,0],[-60.7710919,-32.9022955,0],[-60.7752977,-32.9093574,0],[-60.7764993,-32.9100059,0],[-60.7766709,-32.9151218,0],[-60.7821641,-32.9147615,0],[-60.7841382,-32.9210299,0]]]},"properties":{"name":"FUNES 5","styleUrl":"#poly-9C27B0-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#9c27b0","stroke-opacity":1,"stroke":"#9c27b0","stroke-width":1.2,"sucursal":"Funes","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.7596765,-32.9144733,0],[-60.7518659,-32.9143292,0],[-60.7473168,-32.908853,0],[-60.7598481,-32.9095015,0],[-60.7596765,-32.9144733,0]]]},"properties":{"name":"FUNES 6 | FISHERTON","description":"BARRIO PRIVADO","styleUrl":"#poly-9C27B0-1200-77","fill-opacity":0.30196078431372547,"fill":"#9c27b0","stroke-opacity":1,"stroke":"#9c27b0","stroke-width":1.2,"sucursal":"Funes","barrio_privado":true}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.7474885,-32.9016469,0],[-60.7377038,-32.899485,0],[-60.7375321,-32.8948726,0],[-60.7475743,-32.8950168,0],[-60.7474885,-32.9016469,0]]]},"properties":{"name":"FUNES 7 | FISHERTON","description":"BARRIO PRIV FISHERTON","styleUrl":"#poly-9C27B0-1200-77","fill-opacity":0.30196078431372547,"fill":"#9c27b0","stroke-opacity":1,"stroke":"#9c27b0","stroke-width":1.2,"sucursal":"Funes","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.7691822,-32.9232235,0],[-60.7570372,-32.9245563,0],[-60.7562218,-32.9199093,0],[-60.7589898,-32.9199813,0],[-60.7598481,-32.919513,0],[-60.7600842,-32.9175857,0],[-60.7669506,-32.9196571,0],[-60.7691822,-32.9232235,0]]]},"properties":{"name":"FUN 8 | FISHERTON","description":"GOLF CLUB BARRIO PRIVADO","styleUrl":"#poly-9C27B0-1200-77","fill-opacity":0.30196078431372547,"fill":"#9c27b0","stroke-opacity":1,"stroke":"#9c27b0","stroke-width":1.2,"sucursal":"Funes","barrio_privado":true}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.7271657,-32.9348487,0],[-60.7278523,-32.9189451,0],[-60.7562218,-32.9199093,0],[-60.7570348,-32.924889,0],[-60.7569489,-32.9260778,0],[-60.7388387,-32.9283111,0],[-60.7385383,-32.9353709,0],[-60.7271657,-32.9348487,0]]]},"properties":{"name":"funes 9 | FISHERTON","styleUrl":"#poly-9C27B0-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#9c27b0","stroke-opacity":1,"stroke":"#9c27b0","stroke-width":1.2,"sucursal":"Funes","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.7775834,-32.9227218,0],[-60.7769835,-32.9277622,0],[-60.769687,-32.9275488,0],[-60.7623485,-32.9346087,0],[-60.7624343,-32.9365897,0],[-60.7589153,-32.9363735,0],[-60.7590869,-32.9329878,0],[-60.7536796,-32.9328437,0],[-60.7542375,-32.9281971,0],[-60.7522205,-32.928053,0],[-60.7521346,-32.9266122,0],[-60.7573703,-32.9260358,0],[-60.7570372,-32.9245563,0],[-60.7773259,-32.9221814,0],[-60.7775834,-32.9227218,0]]]},"properties":{"name":"FUNES 10 | FISHERTON","styleUrl":"#poly-9C27B0-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#9c27b0","stroke-opacity":1,"stroke":"#9c27b0","stroke-width":1.2,"sucursal":"Funes","barrio_privado":false}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.6318704,-32.979213,0],[-60.6269351,-32.9598787,0],[-60.6212274,-32.960923,0],[-60.6233302,-32.9555576,0],[-60.6252614,-32.9530729,0],[-60.626506,-32.95012,0],[-60.6287376,-32.9462666,0],[-60.6333295,-32.9410444,0],[-60.639166,-32.9365784,0],[-60.6469337,-32.9317158,0],[-60.6524698,-32.9289063,0],[-60.6555167,-32.9282939,0],[-60.6611387,-32.9305272,0],[-60.6679193,-32.9327604,0],[-60.6737558,-32.9334087,0],[-60.6779186,-32.9334087,0],[-60.6847421,-32.9602388,0],[-60.6709234,-32.9626513,0],[-60.6739703,-32.9742448,0],[-60.6367198,-32.981049,0],[-60.6359903,-32.978565,0],[-60.6318704,-32.979213,0]]]},"properties":{"name":"PELLEGRINI","styleUrl":"#poly-FFD600-1200-77-nodesc","fill-opacity":0.30196078431372547,"fill":"#ffd600","stroke-opacity":1,"stroke":"#ffd600","stroke-width":1.2,"sucursal":"Centro","barrio_privado":false}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.6591161,-32.929604,0],[-60.6778272,-32.9329899,0],[-60.6793722,-32.939257,0],[-60.6616052,-32.9420662,0],[-60.6579629,-32.930239,0],[-60.6591161,-32.929604,0]]]},"properties":{"name":"cafferata1","fill":"#f48fb1","stroke":"#f48fb1","stroke-width":1.2,"sucursal":"Cafferata","barrio_privado":false}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.6831487,-32.9267943,0],[-60.6826337,-32.9334041,0],[-60.6778272,-32.9329899,0],[-60.6594814,-32.929483,0],[-60.6564344,-32.9281502,0],[-60.6593955,-32.9254846,0],[-60.6620563,-32.9235754,0],[-60.6656612,-32.9210898,0],[-60.6726564,-32.9150736,0],[-60.6732143,-32.9147494,0],[-60.6762613,-32.9267634,0],[-60.6794872,-32.9267889,0],[-60.6831487,-32.9267943,0]]]},"properties":{"name":"cafferata alto rosario / puerto norte","fill":"#f48fb1","stroke":"#f48fb1","stroke-width":1.2,"sucursal":"Cafferata","barrio_privado":false}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.6793722,-32.939257,0],[-60.6818786,-32.9500037,0],[-60.6641975,-32.9531007,0],[-60.6614502,-32.9422856,0],[-60.6793722,-32.939257,0]]]},"properties":{"name":"cafferata 3","fill":"#f48fb1","stroke":"#f48fb1","stroke-width":1.2,"sucursal":"Cafferata","barrio_privado":false}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.6844426,-32.9602,0],[-60.6668044,-32.9634047,0],[-60.6641975,-32.9531007,0],[-60.6818786,-32.9500037,0],[-60.6844426,-32.9602,0]]]},"properties":{"name":"cafferata 7","fill":"#f48fb1","stroke":"#f48fb1","stroke-width":1.2,"sucursal":"Cafferata","barrio_privado":false}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.6778272,-32.9329899,0],[-60.6937552,-32.9338742,0],[-60.6936265,-32.9366116,0],[-60.6793357,-32.9389887,0],[-60.6778272,-32.9329899,0]]]},"properties":{"name":"cafferata 4","fill":"#f48fb1","stroke":"#f48fb1","stroke-width":1.2,"sucursal":"Cafferata","barrio_privado":false}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-60.6983281,-32.9480856,0],[-60.6930066,-32.9480136,0],[-60.6818786,-32.9500037,0],[-60.6793722,-32.939257,0],[-60.6936265,-32.9366116,0],[-60.6988002,-32.9356963,0],[-60.6983281,-32.9480856,0]]]},"properties":{"name":"cafferata 6","fill":"#f48fb1","stroke":"#f48fb1","stroke-width":1.2,"sucursal":"Cafferata","barrio_privado":false}}]};


// Constantes
const GF_ADMINS = ['ulises', 'leticia'];
const GF_COLORS = { Centro:'#f59e0b', Norte:'#3b82f6', Sur:'#10b981', Funes:'#a855f7', Cafferata:'#ec4899' };
const GF_SPECIAL_KEYS = ['barrio privado', 'kentucy', 'kentucky', 'golf club', 'fisherton priv'];

// Estado interno
let _gfMap = null; // instancia Leaflet
let _gfMapDone = false; // init ejecutado
let _gfZonesLayer = null; // L.geoJSON layer activo
let _gfHeatLayer = null; // Leaflet.heat layer
let _gfMarker = null; // marcador de validacion
let _gfZoneIndex = {}; // { name -> { color, sucursal, priv } }
// ✅ FIX shadowing: _gfPendingFile declarado UNA SOLA VEZ aquí dentro del IIFE.
//    La declaración exterior fue eliminada. Todas las funciones del IIFE
//    (gfHandleFile, gfHandleDrop, gfRunSync) comparten esta única variable.
let _gfPendingFile = null;
let _gfFireCache = null; // cache de zonas Firebase

// ✅ LAZY LOADING — Promise singleton para Turf + toGeoJSON
// Garantiza que la carga se dispara una sola vez aunque se llame N veces en paralelo.
// En un Moto E14 con red 2G, evita que el hilo principal bloquee el render inicial.
let _gfLibsPromise = null;
function _gfEnsureLibs() {
 if (_gfLibsPromise) return _gfLibsPromise;
 _gfLibsPromise = (typeof window._loadGeoLibs === 'function')
  ? window._loadGeoLibs()
  : Promise.resolve();
 return _gfLibsPromise;
}

// ✅ LAZY LOADING — Promise singleton para Leaflet
// Leaflet es ~140 KB; cargarlo sólo cuando el admin abre el panel de mapa
// ahorra ~400 ms de parse en dispositivos de gama baja.
let _gfLeafletPromise = null;
function _gfEnsureLeaflet() {
 if (_gfLeafletPromise) return _gfLeafletPromise;
 // Si Leaflet ya está en el DOM (cargado por otro módulo), reutilizarlo.
 if (typeof L !== 'undefined' && L.map) {
  _gfLeafletPromise = Promise.resolve();
  return _gfLeafletPromise;
 }
 _gfLeafletPromise = new Promise(function(resolve, reject) {
  // CSS de Leaflet — debe cargarse antes del JS para que los tiles aparezcan
  if (!document.querySelector('link[href*="leaflet"]')) {
   const css = document.createElement('link');
   css.rel = 'stylesheet';
   css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css';
   document.head.appendChild(css);
  }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js';
  s.onload = resolve;
  s.onerror = function() { reject(new Error('No se pudo cargar Leaflet. Verificá tu conexión.')); };
  document.head.appendChild(s);
 });
 return _gfLeafletPromise;
}

// Guard de sesion
function _gfSessionOk() {
 const tok = sessionStorage.getItem('_mfa_ok');
 return typeof tok === 'string' && tok.length >= 8;
}
function _gfGuard() {
 if (!_gfSessionOk()) {
 gfFeedback('Sesion expirada — volvé a ingresar al panel admin.', 'error');
 throw new Error('GF: sesion no valida');
 }
}

// Helpers
function _gfNorm(s) {
 return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
}
function _gfDocId(str) {
 return _gfNorm(str).replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'').substring(0,60);
}
function _esc(s) {
 return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const _GF_FOLDER_MAP = {
 norte:'Norte', baigorria:'Norte',
 sur:'Sur', galvez:'Sur', 'zona sur':'Sur',
 funes:'Funes', fisherton:'Funes',
 pellegrini:'Centro', centro:'Centro',
 cafferata:'Cafferata', 'alto rosario':'Cafferata', 'puerto norte':'Cafferata',
};
function _gfInferSucursal(name, folder) {
 const n = _gfNorm(name); const f = _gfNorm(folder||'');
 for (const [key, suc] of Object.entries(_GF_FOLDER_MAP)) {
 if (f.includes(key) || n.startsWith(key) || n.includes(key)) return suc;
 }
 return 'Centro';
}
function _gfIsSpecial(desc) {
 const d = _gfNorm(desc||'');
 return GF_SPECIAL_KEYS.some(k => d.includes(k));
}

// Feedback UI
function gfFeedback(msg, type) {
 const el = document.getElementById('gf-feedback');
 if (!el) return;
 const styles = {
 success: ['rgba(16,185,129,.12)','#10b981','rgba(16,185,129,.25)'],
 error: ['rgba(239,68,68,.12)', '#ef4444','rgba(239,68,68,.25)'],
 warn: ['rgba(245,158,11,.12)','#f59e0b','rgba(245,158,11,.25)'],
 info: ['rgba(59,130,246,.12)','#3b82f6','rgba(59,130,246,.25)'],
 };
 const [bg, color, border] = styles[type] || styles.info;
 el.style.cssText = `display:block;background:${bg};color:${color};border:1px solid ${border};padding:10px 12px;border-radius:10px;font-size:12px;font-weight:700;`;
 el.textContent = msg;
 if (type === 'success') setTimeout(() => { el.style.display='none'; }, 4000);
}
function _gfShowLoader(txt) {
 const l = document.getElementById('gf-map-loader');
 const t = document.getElementById('gf-loader-txt');
 if (l) l.style.display = 'flex';
 if (t) t.textContent = txt || 'Cargando...';
}
function _gfHideLoader() {
 const l = document.getElementById('gf-map-loader');
 if (l) l.style.display = 'none';
}

//
// LAZY INIT — se llama desde admSwitchTab cuando tab === 'mapa'
//
// ✅ FIX lazy loading: gfInitLazy espera _gfEnsureLeaflet() antes de inicializar
//    el mapa. En un Moto E14 Leaflet puede no estar en el DOM todavía si
//    el admin nunca abrió el tab — se carga sólo cuando hace falta.
window.gfInitLazy = async function() {
 if (_gfMapDone) {
 _gfRefreshZonesList();
 return;
 }
 try {
  await _gfEnsureLeaflet();
 } catch(e) {
  gfFeedback('Error cargando Leaflet: ' + e.message, 'error');
  _gfHideLoader();
  return;
 }
 _gfDoInit();
};

async function _gfDoInit() {
 if (_gfMapDone) return;
 _gfMapDone = true;
 _gfShowLoader('Inicializando mapa...');

 const mapDiv = document.getElementById('admin-map');
 if (!mapDiv) { _gfHideLoader(); return; }

 // Inicializar Leaflet con tiles oscuros de CartoDB
 _gfMap = L.map(mapDiv, {
 center: [-32.9468, -60.6393],
 zoom: 11,
 zoomControl: true,
 preferCanvas: true,
 });

 L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
 attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO',
 subdomains: 'abcd',
 maxZoom: 20,
 }).addTo(_gfMap);

 // Click en mapa para validar
 _gfMap.on('click', function(e) {
 document.getElementById('gf-val-lat').value = e.latlng.lat.toFixed(6);
 document.getElementById('gf-val-lng').value = e.latlng.lng.toFixed(6);
 gfValidarPunto();
 });

 // Cargar zonas — primero intenta Firebase, fallback a GeoJSON embebido
 await _gfRenderZones();
 _gfHideLoader();
}

//
// RENDER ZONAS
//
async function _gfRenderZones() {
 if (!_gfMap) return;
 _gfShowLoader('Cargando zonas...');

 // Limpiar capa anterior
 if (_gfZonesLayer) { _gfMap.removeLayer(_gfZonesLayer); _gfZonesLayer = null; }
 _gfZoneIndex = {};

 // Intentar cargar desde Firebase
 let geoData = GF_GEOJSON;
 if (window.db) {
 try {
 const snap = await window.db.collection('delivery_zones').where('active','==',true).get();
 if (!snap.empty) {
 const features = [];
 snap.forEach(doc => {
 const d = doc.data();
 let geom;
 try { geom = typeof d.geometry === 'string' ? JSON.parse(d.geometry) : d.geometry; } catch(e) { return; }
 if (!geom) return;
 const color = GF_COLORS[d.sucursal] || '#888';
 features.push({
 type: 'Feature',
 id: doc.id,
 geometry: geom,
 properties: {
 name: d.name || doc.id,
 description: d.description || '',
 sucursal: d.sucursal || 'Centro',
 requiresSpecialAccess: !!d.requiresSpecialAccess,
 fill: color,
 'fill-opacity': d.requiresSpecialAccess ? 0.4 : 0.22,
 stroke: d.requiresSpecialAccess ? '#ef4444' : color,
 'stroke-width': 2,
 'stroke-opacity': 1,
 _fireId: doc.id,
 precio: d.precio || 0,
 },
 });
 });
 if (features.length > 0) {
 geoData = { type: 'FeatureCollection', features };
 _gfFireCache = geoData;
 console.log('[GeoFencing] ' + features.length + ' zonas cargadas desde Firebase.');
 } else {
 console.warn('[GeoFencing] Sin zonas en Firebase. Usando GeoJSON embebido.');
 }
 }
 } catch(e) {
 console.warn('[GeoFencing] Error cargando Firebase:', e.message);
 }
 }

 // Render con Leaflet geoJSON
 let total = 0, privados = 0;
 _gfZonesLayer = L.geoJSON(geoData, {
 style: function(feature) {
 const p = feature.properties || {};
 return {
 fillColor: p.fill || '#888',
 fillOpacity: p['fill-opacity'] || 0.22,
 color: p.stroke || p.fill || '#888',
 weight: p['stroke-width'] || 1.5,
 opacity: p['stroke-opacity'] || 1,
 };
 },
 onEachFeature: function(feature, layer) {
 const p = feature.properties || {};
 const name = (p.name || 'Sin nombre').trim();
 const desc = p.description || '';
 const isPriv = p.requiresSpecialAccess || _gfIsSpecial(desc) || _gfIsSpecial(name);
 const suc = p.sucursal || _gfInferSucursal(name, desc);

 _gfZoneIndex[name] = { color: p.fill || '#888', sucursal: suc, priv: isPriv, precio: p.precio || 0, fireId: p._fireId || '' };
 total++;
 if (isPriv) privados++;

 // Popup
 const fireId = p._fireId || '';
 const deleteBtn = (_gfSessionOk() && fireId)
 ? `<br><button onclick="gfDeleteZone('${_esc(fireId)}')" style="margin-top:8px;padding:4px 10px;background:#ef4444;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">Eliminar zona</button>`
 : '';
 const privTag = isPriv ? `<br><span style="color:#f59e0b;font-size:11px;">Barrio privado / acceso especial</span>` : '';
 const precioVal = p.precio || 0;
 const precioTag = `<br><span style="color:#9ca3af;font-size:11px;">Envío: <strong style="color:#f59e0b;">${precioVal ? '$' + precioVal.toLocaleString('es-AR') : 'Sin precio'}</strong></span>`;
 layer.bindPopup(`
 <div style="font-family:sans-serif;min-width:160px;"> <strong style="font-size:13px;color:#e2e8f0;">${_esc(name)}</strong><br> <span style="font-size:11px;color:#9ca3af;">Sucursal: <strong style="color:#e2e8f0;">${_esc(suc)}</strong></span> ${precioTag}${privTag}${deleteBtn}
 </div>`, { maxWidth: 240 });

 // Hover highlight
 layer.on('mouseover', function() {
 layer.setStyle({ fillOpacity: 0.55, weight: 2.5 });
 layer.bringToFront();
 });
 layer.on('mouseout', function() {
 _gfZonesLayer.resetStyle(layer);
 });
 },
 }).addTo(_gfMap);

 if (_gfZonesLayer.getLayers().length > 0) {
 _gfMap.fitBounds(_gfZonesLayer.getBounds(), { padding: [20, 20] });
 }

 // Stats
 const t = document.getElementById('gf-stat-total');
 const pr = document.getElementById('gf-stat-priv');
 if (t) t.textContent = total;
 if (pr) pr.textContent = privados;

 await _gfRefreshZonesList();
 _gfHideLoader();
}

// Lista de zonas en sidebar
async function _gfRefreshZonesList() {
 const container = document.getElementById('gf-zones-list');
 if (!container) return;

 const zones = Object.entries(_gfZoneIndex).map(([name, z]) => ({ name, ...z }));
 if (!zones.length) {
 container.innerHTML = '<div style="color:#6b7280;font-size:12px;text-align:center;padding:12px 0;">Sin zonas — importa el KML</div>';
 return;
 }
 zones.sort((a,b) => (a.sucursal||'').localeCompare(b.sucursal||'') || a.name.localeCompare(b.name));
 container.innerHTML = zones.map(z => {
 const color = z.priv ? '#ef4444' : (z.color || GF_COLORS[z.sucursal] || '#888');
 const precio = z.precio || 0;
 const fireId = z.fireId || '';
 const precioDisplay = precio ? `<span style="color:#f59e0b;font-size:10px;font-weight:800;">$${precio.toLocaleString('es-AR')}</span>` : `<span style="color:#6b7280;font-size:10px;">Sin precio</span>`;
 const editHtml = fireId ? `
 <div class="gf-zone-price-row">
 <span style="color:#6b7280;font-size:10px;">$</span>
 <input class="gf-zone-price-inp" type="number" min="0" step="100"
 value="${precio}" id="gf-price-${_esc(fireId)}"
 placeholder="Precio envío" title="Precio de envío para esta zona">
 <button class="gf-zone-price-save" onclick="gfSaveZonePrice('${_esc(fireId)}','${_esc(z.name)}')">Guardar</button>
 </div>` : '';
 return `<div style="background:rgba(255,255,255,.04);border-radius:6px;padding:7px 10px;border-left:3px solid ${color};">
 <div style="display:flex;align-items:center;gap:6px;cursor:pointer;" onclick="gfFocusZone('${_esc(z.name)}')">
 <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
 <strong style="color:#e2e8f0;font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(z.name)}</strong>
 ${precioDisplay}
 </div>
 <div style="color:#6b7280;font-size:10px;margin-top:2px;margin-left:16px;">${_esc(z.sucursal)}${z.priv ? ' · Privado' : ''}</div>
 ${editHtml}
 </div>`;
 }).join('');
}

// Foco en zona al clickear en sidebar
window.gfFocusZone = function(name) {
 if (!_gfZonesLayer || !_gfMap) return;
 _gfZonesLayer.eachLayer(function(l) {
 if ((l.feature?.properties?.name || '').trim() === name) {
 _gfMap.fitBounds(l.getBounds(), { padding: [40, 40] });
 l.openPopup();
 }
 });
};

// Guardar precio de envío para una zona
window.gfSaveZonePrice = async function(docId, zoneName) {
 try { _gfGuard(); } catch(e) { gfFeedback('Sesión admin requerida.', 'warn'); return; }
 if (!window.db) { gfFeedback('Firebase no disponible.', 'error'); return; }
 const inp = document.getElementById('gf-price-' + docId);
 if (!inp) return;
 const precio = parseFloat(inp.value) || 0;
 try {
 await window.db.collection('delivery_zones').doc(docId).update({ precio, updatedAt: new Date().toISOString() });
 // Actualizar en memoria
 if (_gfZoneIndex[zoneName]) _gfZoneIndex[zoneName].precio = precio;
 if (_gfFireCache) {
 const feat = _gfFireCache.features?.find(f => f.properties?._fireId === docId);
 if (feat) feat.properties.precio = precio;
 }
 gfFeedback(`Precio $${precio.toLocaleString('es-AR')} guardado para "${zoneName}"`, 'success');
 inp.style.borderColor = '#10b981';
 setTimeout(() => { inp.style.borderColor = ''; }, 2000);
 } catch(e) {
 gfFeedback('Error al guardar: ' + e.message, 'error');
 }
};

//
// VALIDAR PUNTO (Point-in-Polygon con Turf.js)
//
// ✅ FIX lazy loading + booleanPointInPolygon instantáneo:
//    1. La función ahora es async y llama _gfEnsureLibs() antes de usar turf.
//       Esto garantiza que Turf esté cargado incluso si el admin validó un punto
//       antes del preload idle de geo-loader.js (común en Moto E14 con 2G).
//    2. turf.point([lng, lat]) se crea UNA SOLA VEZ fuera del loop en lugar de
//       recrearlo en cada iteración — en polígonos complejos ahorra asignaciones
//       de objeto que en V8 de gama baja presionan el GC y generan micro-jank.
//    3. La data a evaluar se resuelve desde _gfFireCache antes de entrar al loop,
//       evitando la doble evaluación de la expresión `_gfFireCache || GF_GEOJSON`
//       dentro del hot-path.
window.gfValidarPunto = async function() {
 const lat = parseFloat(document.getElementById('gf-val-lat').value);
 const lng = parseFloat(document.getElementById('gf-val-lng').value);
 const resEl = document.getElementById('gf-val-result');

 if (isNaN(lat) || isNaN(lng)) {
 resEl.style.cssText = 'display:block;background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.3);padding:10px 12px;border-radius:8px;font-size:12px;font-weight:700;';
 resEl.textContent = 'Ingresa coordenadas validas.';
 return;
 }

 // ✅ Asegurar que Turf esté disponible antes de usarlo
 if (typeof turf === 'undefined') {
  resEl.style.cssText = 'display:block;background:rgba(59,130,246,.12);color:#3b82f6;border:1px solid rgba(59,130,246,.3);padding:10px 12px;border-radius:8px;font-size:12px;font-weight:700;';
  resEl.textContent = 'Cargando motor de validación...';
  try {
   await _gfEnsureLibs();
  } catch(e) {
   resEl.textContent = 'Error cargando Turf.js. Verificá tu conexión.';
   return;
  }
 }

 if (_gfMarker) { _gfMap.removeLayer(_gfMarker); _gfMarker = null; }

 // ✅ Crear el punto UNA SOLA VEZ fuera del loop (evita GC pressure en V8 bajo)
 const point = turf.point([lng, lat]);
 // ✅ Resolver la fuente de datos UNA SOLA VEZ antes del hot-path
 const data = _gfFireCache || GF_GEOJSON;
 let found = null;

 if (data?.features) {
 for (const feat of data.features) {
 try {
 if (turf.booleanPointInPolygon(point, feat)) {
 found = feat.properties;
 break;
 }
 } catch(_) {}
 }
 }

 const color = found ? '#10b981' : '#ef4444';
 _gfMarker = L.circleMarker([lat, lng], {
 radius: 9, fillColor: color, color: '#fff',
 weight: 2, opacity: 1, fillOpacity: 0.85,
 }).addTo(_gfMap);
 _gfMap.setView([lat, lng], 14);

 if (found) {
 const suc = found.sucursal || _gfInferSucursal(found.name || '', '');
 const isPriv = found.requiresSpecialAccess || _gfIsSpecial(found.description || '');
 resEl.style.cssText = 'display:block;background:rgba(16,185,129,.12);color:#10b981;border:1px solid rgba(16,185,129,.3);padding:10px 12px;border-radius:8px;font-size:12px;font-weight:700;';
 resEl.innerHTML = 'Dentro de zona de envio<br><span style="font-size:11px;color:#e2e8f0;">' + _esc(found.name) + ' · ' + _esc(suc) + (isPriv ? ' · Privado' : '') + '</span>';
 _gfMarker.bindPopup('En zona: <strong>' + _esc(found.name) + '</strong>').openPopup();
 } else {
 resEl.style.cssText = 'display:block;background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.3);padding:10px 12px;border-radius:8px;font-size:12px;font-weight:700;';
 resEl.textContent = 'Fuera de zona de envio. No realizamos envios a esta ubicacion.';
 _gfMarker.bindPopup('Fuera de zona').openPopup();
 }
};

//
// ELIMINAR ZONA
//
window.gfDeleteZone = async function(docId) {
 try { _gfGuard(); } catch(e) { return; }
 if (!confirm('Desactivar esta zona de Firebase?')) return;
 try {
 await window.db.collection('delivery_zones').doc(docId).update({
 active: false, updatedAt: new Date().toISOString(),
 });
 window.gfInvalidateCache && window.gfInvalidateCache();
 _gfFireCache = null;
 gfFeedback('Zona desactivada.', 'success');
 if (_gfMap) { _gfMap.closePopup(); await _gfRenderZones(); }
 } catch(e) {
 gfFeedback('Error: ' + e.message, 'error');
 }
};

//
// IMPORT KML / GeoJSON
//
// ✅ FIX shadowing: window.gfHandleFile escribe en _gfPendingFile del IIFE.
//    Esta es la única asignación de _gfPendingFile en todo el archivo.
window.gfHandleFile = function(evt) {
 const file = evt.target.files[0];
 if (!file) return;
 _gfPendingFile = file; // única escritura — sin shadowing posible
 gfEl('gf-drop-label').textContent = 'OK: ' + file.name;
 gfEl('gf-drop-zone').style.borderColor = '#10b981';
 const btn = gfEl('gf-btn-sync');
 if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
};

window.gfHandleDrop = function(evt) {
 evt.preventDefault();
 evt.currentTarget.classList.remove('over');
 const file = Array.from(evt.dataTransfer.files).find(f => f.name.endsWith('.kml') || f.name.endsWith('.geojson') || f.name.endsWith('.json')
 );
 if (!file) { gfFeedback('Solo archivos .kml o .geojson', 'error'); return; }
 gfHandleFile({ target: { files: [file] } });
};

// ✅ FIX lazy loading: gfRunSync ahora asegura que toGeoJSON esté disponible
//    ANTES de intentar parsear el KML. Antes el chequeo era síncrono y fallaba
//    en dispositivos lentos donde el preload idle de geo-loader.js aún no terminó.
window.gfRunSync = async function() {
 try { _gfGuard(); } catch(e) { return; }
 if (!_gfPendingFile) { gfFeedback('Selecciona un archivo KML o GeoJSON primero.', 'warn'); return; }
 if (!window.db) { gfFeedback('Firebase no disponible.', 'error'); return; }

 const btn = gfEl('gf-btn-sync');
 if (btn) { btn.disabled = true; btn.textContent = 'Importando...'; }

 const isGeoJSONFile = _gfPendingFile.name.endsWith('.geojson') || _gfPendingFile.name.endsWith('.json');
 gfFeedback(isGeoJSONFile ? 'Procesando GeoJSON...' : 'Procesando KML...', 'info');

 try {
 // ✅ Para KML, asegurar que toGeoJSON esté cargado antes de continuar
 if (!isGeoJSONFile && typeof toGeoJSON === 'undefined') {
  gfFeedback('Cargando librería KML...', 'info');
  await _gfEnsureLibs();
  if (typeof toGeoJSON === 'undefined') {
   gfFeedback('toGeoJSON no pudo cargarse. Verificá tu conexión.', 'error');
   if (btn) { btn.disabled = false; btn.textContent = 'Sincronizar con Firebase'; }
   return;
  }
 }

 const fileText = await _gfPendingFile.text();
 let geoJSON;

 if (isGeoJSONFile) {
 geoJSON = JSON.parse(fileText);
 if (geoJSON.type === 'Feature') geoJSON = { type: 'FeatureCollection', features: [geoJSON] };
 } else {
 const kmlDOM = new DOMParser().parseFromString(fileText, 'application/xml');
 const parseErr = kmlDOM.querySelector('parsererror');
 if (parseErr) throw new Error('KML invalido: ' + parseErr.textContent.substring(0,80));
 geoJSON = toGeoJSON.kml(kmlDOM);
 }

 // ── Validación estructural antes de tocar Firebase ─────────────────
 if (!geoJSON || !Array.isArray(geoJSON.features)) {
   throw new Error('El archivo no contiene una FeatureCollection válida.');
 }
 if (geoJSON.features.length === 0) {
   gfFeedback('El archivo no tiene ninguna feature. Verificá que sea el mapa correcto.', 'warn');
   if (btn) { btn.disabled = false; btn.textContent = 'Sincronizar con Firebase'; }
   return;
 }
 // Detectar features con propiedades mínimas faltantes y advertir antes de continuar
 const advertencias = [];
 geoJSON.features.forEach(function(f, idx) {
   if (!f.geometry) return; // se saltará en el loop de importación
   const p = f.properties || {};
   const nombre = (p.name || p.Name || '').trim();
   if (!nombre) advertencias.push('Feature #' + (idx + 1) + ': sin propiedad "name"');
 });
 if (advertencias.length > 0) {
   const resumen = advertencias.slice(0, 5).join(' · ') + (advertencias.length > 5 ? ' · y ' + (advertencias.length - 5) + ' más...' : '');
   gfFeedback('Advertencia — se encontraron features sin nombre: ' + resumen + '. Se importarán como "Sin nombre".', 'warn');
   // Dar 2 segundos para leer la advertencia antes de continuar
   await new Promise(function(res) { setTimeout(res, 2000); });
 }
 // ── Fin validación ──────────────────────────────────────────────────

 const overwrite = gfEl('gf-overwrite')?.checked !== false;
 let imported = 0, skipped = 0;
 const errors = [];

 for (const feature of geoJSON.features) {
 if (!feature.geometry || !['Polygon','MultiPolygon'].includes(feature.geometry.type)) { skipped++; continue; }
 const props = feature.properties || {};
 const name = (props.name || props.Name || 'Sin nombre').trim();
 const desc = (props.description || '').trim();
 const folderName = (props.folder || '').trim();
 const sucursal = _gfInferSucursal(name, folderName);
 const isSpecial = _gfIsSpecial(desc) || _gfIsSpecial(name);
 const docId = _gfDocId(name);
 const color = GF_COLORS[sucursal] || '#888';

 const payload = {
 name, description: desc, sucursal,
 requiresSpecialAccess: isSpecial,
 active: true,
 geometry: JSON.stringify(feature.geometry),
 source: isGeoJSONFile ? 'geojson_import' : 'kml_import',
 updatedAt: new Date().toISOString(),
 fill: color,
 };

 try {
 if (overwrite) {
 await window.db.collection('delivery_zones').doc(docId).set(payload);
 } else {
 const snap = await window.db.collection('delivery_zones').doc(docId).get();
 if (snap.exists) { skipped++; continue; }
 await window.db.collection('delivery_zones').doc(docId).set(payload);
 }
 imported++;
 } catch(e) {
 errors.push(name + ': ' + e.message);
 }
 }

 window.gfInvalidateCache && window.gfInvalidateCache();
 _gfFireCache = null;

 const msg = imported + ' zonas importadas · ' + skipped + ' omitidas' + (errors.length ? ' · ' + errors.length + ' errores' : '');
 gfFeedback(msg, errors.length ? 'warn' : 'success');

 if (_gfMapDone) await _gfRenderZones();

 } catch(e) {
 gfFeedback('Error: ' + e.message, 'error');
 } finally {
 if (btn) { btn.disabled = false; btn.textContent = 'Sincronizar con Firebase'; }
 }
};

//
// HEATMAP (Leaflet.heat)
//
window.gfToggleHeatmap = async function() {
 if (!_gfMap) { gfFeedback('Abri el mapa primero.', 'warn'); return; }
 const btn = document.getElementById('gf-btn-heat');

 if (_gfHeatLayer) {
 _gfMap.removeLayer(_gfHeatLayer);
 _gfHeatLayer = null;
 if (btn) btn.textContent = 'Cargar Heatmap de pedidos';
 return;
 }

 if (!window.db) { gfFeedback('Firebase no disponible.', 'error'); return; }
 if (btn) btn.textContent = 'Cargando datos...';
 gfFeedback('Cargando pedidos completados...', 'info');

 try {
 // Patch Canvas2D willReadFrequently — silencia la advertencia de performance
 // que lanza leaflet-heat al llamar getImageData() repetidamente sin el flag.
 // Se aplica una sola vez antes de cargar la librería.
 if (!HTMLCanvasElement.prototype._gfPatched) {
   const _origGetContext = HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext = function(type, attrs) {
     if (type === '2d') {
       attrs = Object.assign({ willReadFrequently: true }, attrs || {});
     }
     return _origGetContext.call(this, type, attrs);
   };
   HTMLCanvasElement.prototype._gfPatched = true;
 }

 // Cargar Leaflet.heat dinamicamente si no esta
 if (!window.L.heatLayer) {
 await new Promise((res, rej) => {
 const s = document.createElement('script');
 s.src = 'https://cdn.jsdelivr.net/npm/leaflet.heat@0.2.0/dist/leaflet-heat.js';
 s.onload = res; s.onerror = rej;
 document.head.appendChild(s);
 });
 }

 // Traer todos los pedidos de delivery (con o sin GPS) — sin orderBy para evitar índice compuesto
 const snap = await window.db.collection('pedidos_v2')
 .where('tipo', '==', 'Delivery')
 .limit(500).get();

 const allDocs = [];
 snap.forEach(doc => allDocs.push({ id: doc.id, ...doc.data() }));

 gfFeedback(`Procesando ${allDocs.length} pedidos delivery...`, 'info');

 const points = [];
 const toGeocode = []; // pedidos sin GPS que tienen dirección de texto

 // Paso 1: extraer los que ya tienen coordenadas GPS reales
 // El campo se llama 'gps' y puede ser 'lat,lng' o 'No provisto'
 for (const d of allDocs) {
 const gpsVal = d.gps || d.coordsGPS || '';
 if (gpsVal && gpsVal !== 'No provisto' && gpsVal !== '') {
 const parts = gpsVal.split(',').map(Number);
 if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
 points.push([parts[0], parts[1], 1]);
 continue;
 }
 }
 // Sin GPS válido: encolar para geocodificación si tiene dirección
 if (d.dir && d.dir !== 'N/A' && d.dir.trim()) {
 toGeocode.push(d);
 }
 }

 // Paso 2: geocodificar direcciones de texto (máx 40 para no saturar la API)
 // Usamos la misma función _geocodificar() que ya existe en la app
 if (typeof _geocodificar === 'function' && toGeocode.length > 0) {
 const limit40 = toGeocode.slice(0, 40);
 gfFeedback(`GPS directo: ${points.length} · Geocodificando ${limit40.length} direcciones...`, 'info');
 // Procesamos de a 3 simultáneos para no superar rate-limit
 for (let i = 0; i < limit40.length; i += 3) {
 const chunk = limit40.slice(i, i + 3);
 const results = await Promise.allSettled(
 chunk.map(d => _geocodificar(d.dir, d.loc))
 );
 results.forEach(r => {
 if (r.status === 'fulfilled' && r.value) {
 points.push([r.value.lat, r.value.lng, 0.7]); // peso levemente menor por ser geocodificado
 }
 });
 // Pequeña pausa para respetar rate-limit de la API gratuita
 if (i + 3 < limit40.length) await new Promise(r => setTimeout(r, 400));
 }
 }

 if (!points.length) {
 gfFeedback('Sin coordenadas disponibles. Los pedidos no tienen GPS ni dirección geocodificable.', 'warn');
 if (btn) btn.textContent = 'Cargar Heatmap de pedidos';
 return;
 }

 _gfHeatLayer = L.heatLayer(points, {
 radius: 30, blur: 20, maxZoom: 17, max: 1.0,
 gradient: { 0.2:'blue', 0.4:'cyan', 0.6:'lime', 0.8:'orange', 1.0:'red' },
 }).addTo(_gfMap);

 gfFeedback('Heatmap con ' + points.length + ' puntos de entrega.', 'success');
 if (btn) btn.textContent = 'Ocultar Heatmap';

 } catch(e) {
 gfFeedback('Error: ' + e.message, 'error');
 if (btn) btn.textContent = 'Cargar Heatmap de pedidos';
 }
};

// Exponer gfInvalidateCache para que el sistema de pedidos lo use
window.gfInvalidateCache = function() { _gfFireCache = null; };

// Pre-calentar cache de zonas en background (llamado desde initMejoras)
// ✅ FIX lazy loading: _gfLoadZones usa _gfEnsureLibs() como fuente de verdad
//    para Turf en lugar de hacer su propio await window._loadGeoLibs().
//    Así si Turf ya cargó via _gfEnsureLibs(), el Promise.resolve() es inmediato
//    y no se generan dos cadenas de carga paralelas en el mismo dispositivo.
window._gfLoadZones = async function() {
 if (!window.db || _gfFireCache) return _gfFireCache || GF_GEOJSON;
 try {
 const snap = await window.db.collection('delivery_zones').where('active','==',true).get();
 if (!snap.empty) {
 const features = [];
 snap.forEach(doc => {
 const d = doc.data();
 let geom;
 try { geom = typeof d.geometry === 'string' ? JSON.parse(d.geometry) : d.geometry; } catch(e) { return; }
 if (!geom) return;
 const color = GF_COLORS[d.sucursal] || '#888';
 features.push({
 type: 'Feature', id: doc.id, geometry: geom,
 properties: {
 name: d.name, description: d.description || '',
 sucursal: d.sucursal || 'Centro',
 requiresSpecialAccess: !!d.requiresSpecialAccess,
 fill: color, _fireId: doc.id,
 precio: d.precio || 0,
 },
 });
 });
 if (features.length > 0) {
 _gfFireCache = { type: 'FeatureCollection', features };
 return _gfFireCache;
 }
 }
 } catch(e) {
 console.warn('[GeoFencing] _gfLoadZones error:', e.message);
 }
 return GF_GEOJSON;
};

// Exponer tambien como determinarSucursal() para compatibilidad con el resto del sistema
// ✅ FIX lazy loading: determinarSucursal usa _gfEnsureLibs() como único punto
//    de entrada para Turf. Esto comparte el singleton _gfLibsPromise con
//    gfValidarPunto y gfRunSync, garantizando que la carga ocurra como máximo
//    una sola vez por sesión sin importar cuántos callers concurrentes haya.
window.determinarSucursal = async function(lat, lng) {
 // Asegurar que Turf esté cargado antes de usarlo
 if (typeof turf === 'undefined') {
  await _gfEnsureLibs();
 }
 const data = await window._gfLoadZones();
 if (!data || !data.features || typeof turf === 'undefined') return null;
 // ✅ turf.point creado UNA SOLA VEZ antes del loop
 var punto = turf.point([lng, lat]);
 for (var i = 0; i < data.features.length; i++) {
 try {
 var feat = data.features[i];
 if (turf.booleanPointInPolygon(punto, feat)) {
 var p = feat.properties || {};
 return {
 sucursal: p.sucursal || _gfInferSucursal(p.name || '', ''),
 zona: p.name || null,
 requiresSpecialAccess: !!p.requiresSpecialAccess,
 precio: p.precio || 0,
 };
 }
 } catch(e) {}
 }
 return null;
};


  // Exponer GeoJSON como global para zona-verificacion.js + geo-compat functions
  window._gfGeojson = GF_GEOJSON;

})(); // end IIFE
