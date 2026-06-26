// app.js — Lógica principal: carrito, pedidos, menú, cupones, opiniones
let cuponAplicado = null;
let codigoInternoAplicado = null; // { nombre, tipo:'interno'|'promo', descuento:100|pct|0 }

// ═══════════════════════════════════════════════════════════════════
//  CODIGOS DE DESCUENTO — Solo desde Firebase (colección config_menu)
//  NO hay base hardcodeada en el frontend. Todos los códigos internos
//  y promocionales se gestionan exclusivamente desde el panel admin.
//  Estructura en Firestore (config_menu → codigos_descuento):
//    _master_activo: bool
//    internos: { "COD": { nombre, descPct, activo } }
//    promos:   { "COD": { titulo, descPct, soloEfectivo, activo } }
// ═══════════════════════════════════════════════════════════════════
window._codDescOverrides = {};

window._codDescMasterActivo = false; // default OFF

async function cargarCodigosDescuentoOverrides() {
 if (!window.db) return;
 try {
 const snap = await db.collection('config_menu').doc('codigos_descuento').get();
 if (snap.exists) {
 const data = snap.data() || {};
 window._codDescOverrides = data;
 // Apply master switch
 const activo = data._master_activo === true;
 window._codDescMasterActivo = activo;
 const box = document.getElementById('box-cod-descuento');
 if (box) box.style.display = activo ? 'block' : 'none';
 }
 } catch(e) {}
}
cargarCodigosDescuentoOverrides();

window.admToggleMasterCodigos = async (nuevoEstado) => {
 const desc = document.getElementById('adm-cod-master-desc');
 const card = document.getElementById('adm-cod-master-card');
 try {
 await db.collection('config_menu').doc('codigos_descuento').set(
 { _master_activo: nuevoEstado }, { merge: true }
 );
 window._codDescMasterActivo = nuevoEstado;
 if (!window._codDescOverrides) window._codDescOverrides = {};
 window._codDescOverrides._master_activo = nuevoEstado;
 // Update card style
 if (card) card.style.border = nuevoEstado ? '2px solid #10b981' : '2px solid var(--border)';
 if (desc) desc.textContent = nuevoEstado
 ? 'Activo — los clientes pueden ingresar un codigo en el checkout'
 : 'Desactivado — el campo de codigo no aparece para los clientes';
 // Mantener el toggle en el estado correcto (no dejar que se revierta)
 const toggleEl = document.getElementById('adm-cod-master-toggle');
 if (toggleEl) toggleEl.checked = nuevoEstado;
 // Reflect on storefront
 const box = document.getElementById('box-cod-descuento');
 if (box) box.style.display = nuevoEstado ? 'block' : 'none';
 } catch(e) {
 // Revertir el toggle UI si falló
 const toggleEl = document.getElementById('adm-cod-master-toggle');
 if (toggleEl) toggleEl.checked = !nuevoEstado;
 alert('Error: ' + e.message);
 }
};

function resolverCodigos() {
 // Todos los códigos vienen exclusivamente de Firebase (window._codDescOverrides).
 // No existe base hardcodeada — el admin gestiona todo desde el panel.
 const ov = window._codDescOverrides || {};
 const internos = ov.internos ? { ...ov.internos } : {};
 const promos   = ov.promos   ? { ...ov.promos }   : {};
 return { internos, promos };
}

window.aplicarCodigoDescuento = function() {
 const input = document.getElementById('cod-descuento-inp');
 const feedback = document.getElementById('cod-descuento-feedback');
 const codigo = (input?.value || '').trim().toUpperCase();
 if (!codigo) return;

 const { internos, promos } = resolverCodigos();
 const fb = (msg, ok) => {
 feedback.style.display = 'block';
 feedback.style.background = ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
 feedback.style.border = ok ? '1px solid #10b981' : '1px solid #ef4444';
 feedback.style.color = ok ? '#10b981' : '#ef4444';
 feedback.innerHTML = msg;
 };

 // Primero buscar en internos
 if (internos[codigo]) {
 const cod = internos[codigo];
 if (!cod.activo) return fb('Código deshabilitado', false);
 codigoInternoAplicado = { codigo, nombre: cod.nombre, tipo: 'interno', descPct: cod.descPct };
 cuponAplicado = { id: codigo, titulo: `Uso interno — ${cod.nombre}`, tipo: 'porcentaje', valor: cod.descPct / 100 };
 fb(`Uso interno autorizado: <strong>${cod.nombre}</strong>`, true);
 renderCartItems();
 return;
 }

 // Luego buscar en promos
 if (promos[codigo]) {
 const cod = promos[codigo];
 if (!cod.activo) return fb('Código deshabilitado', false);
 if (cod.soloEfectivo) {
 const metodo = document.getElementById('p-metodo')?.value;
 if (metodo !== 'Efectivo') return fb('Este código es válido solo pagando en Efectivo.', false);
 }
 codigoInternoAplicado = { codigo, nombre: cod.titulo, tipo: 'promo', descPct: cod.descPct };
 cuponAplicado = { id: codigo, titulo: cod.titulo, tipo: 'porcentaje', valor: cod.descPct / 100 };
 fb(`Código aplicado: <strong>${cod.titulo}</strong>`, true);
 renderCartItems();
 return;
 }

 fb('Código inválido o no reconocido', false);
};


window.aplicarCuponDesdeRegalos = (cuponId) => {
 // Buscar el cupón en CUPONES_DEL_DIA por código
 const especial = Object.values(CUPONES_DEL_DIA).find(c => c && c.code === cuponId);
 if (!especial) return alert("Este cupón ya no está disponible.");

 // Si ya hay uno aplicado con el mismo código, avisar
 if (cuponAplicado && cuponAplicado.id === cuponId) {
 return alert("Este cupón ya está aplicado a tu pedido.");
 }

 // Mapear tipo al sistema de carrito
 let tipoCarro = "regalo";
 let valorCarro = 0;
 if (especial.tipo === "porcentaje") { tipoCarro = "porcentaje"; valorCarro = especial.valor / 100; }
 else if (especial.tipo === "regalo_veggie") { tipoCarro = "porcentaje_veggie"; valorCarro = especial.valor / 100; }
 else if (especial.tipo === "descuento_efectivo") { tipoCarro = "efectivo"; valorCarro = especial.valor; }

 cuponAplicado = { id: especial.code, titulo: especial.titulo, desc: especial.desc, valor: valorCarro, tipo: tipoCarro };

 mostrarInfo("¡ÉXITO!", `<p style="color:var(--text-light); font-size:14px;">Cupón <strong style="color:var(--primary);">"${especial.titulo}"</strong> aplicado a tu pedido.</p>`);

 if (typeof renderCartItems === "function") renderCartItems();

 // Ir al inicio
 const navInicio = document.querySelector('.nav-item[onclick*="tab-inicio"]') || document.querySelector('.nav-item');
 if (navInicio) switchTab('tab-inicio', navInicio);
};

 const CALENDARIO_MARVEL = {
 0: { n: "DOMINGO CHISBURGER", img: "https://i.ibb.co/MkC0Czcj/Cheese-1.jpg" },
 1: { n: "LUNES CAPITÁN AMÉRICA", img: "https://i.ibb.co/5hNX8tBj/Capitan-America.png" },
 2: { n: "MARTES PETER PARKER", img: "https://i.ibb.co/hJ8F2Cz7/Peter-3.jpg" },
 3: { n: "MIÉRCOLES IRON MAN", img: "https://i.ibb.co/9kR57Dqt/Ironman-9.jpg" },
 4: { n: "JUEVES STACKER", img: "https://i.ibb.co/gLyNRYd1/Stacker-2.jpg" },
 5: { n: "VIERNES LOKI", img: "https://i.ibb.co/N2XJ7FKz/Loki-7.jpg" },
 6: { n: "SÁBADO BLACK PANTHER", img: "https://i.ibb.co/LzzZcJDR/Black-Phanter-1.jpg" }
 };

 const PROMOS_DATA = [
 {
 id: 'promo-martes-iron',
 n: "MARTES MARVEL (Iron + papas)",
 d: "Solo por hoy: Iron Man + Papas chicas. ¡No te lo pierdas!",
 pOriginal: 15500,
 p: 12000,
 img: "https://i.ibb.co/bfwDNHq/TV-promo-efectivo-martes.jpg",
 cat: "Promos",
 diaVenta: 2,
 ings: [] 
 },
 {
 id: 'promo-martes-black',
 n: "MARTES MARVEL (Black panther + papas)",
 d: "Solo por hoy: Black panther + Papas chicas. ¡No te lo pierdas!",
 pOriginal: 14700,
 p: 11000,
 img: "https://i.ibb.co/bfwDNHq/TV-promo-efectivo-martes.jpg",
 cat: "Promos",
 diaVenta: 2,
 ings: [] 
 }, 
 {
 id: 'promo-compartir-hulk',
 n: "Compartir Hulk",
 d: "Elegí tu opción entre veggie o carne: 2 Burgers Hulk + papas grandes.",
 pOriginal: 30300,
 p: 27300,
 img: "https://i.ibb.co/ZzmPkFFY/Hulk-x2-papas.png",
 cat: "Promos",
 diaVenta: null,
 ings: [] 
 },
 {
 id: 'promo-compartir-capitan',
 n: "Compartir Capitán América",
 d: "Elegí tu opción entre veggie o carne: 2 Burgers Cap. América + papas grandes.",
 pOriginal: 26300,
 p: 23700,
 img: "https://i.ibb.co/nqckgRfQ/Capitan-x2-papas.png", 
 cat: "Promos",
 diaVenta: null,
 ings: [] 
 },
 {
 id: 'promo-compartir-iron',
 n: "Compartir Iron Man",
 d: "Elegí tu opción entre veggie o carne: 2 Burgers Iron Man + papas grandes.",
 pOriginal: 26300,
 p: 23700,
 img: "https://i.ibb.co/VcKrxQt7/Iron-x2-papas.png", 
 cat: "Promos",
 diaVenta: null,
 ings: [] 
 },
 {
 id: 'promo-compartir-peter',
 n: "Compartir Peter Parker",
 d: "Elegí tu opción entre veggie o carne: 2 Burgers Peter Parker + papas grandes.",
 pOriginal: 23300,
 p: 21000,
 img: "https://i.ibb.co/XkMDCmTJ/Peter-x2-papas.png", 
 cat: "Promos",
 diaVenta: null,
 ings: [] 
 }
];

const SUC_MAP = {
 Centro: { n: "PELLEGRINI 1149, Rosario Centro", wsp: "5493413890000", mapImg: "https://i.ibb.co/Mxp9b7Tp/mapas-2026-estetica-nueva-1-Centro.png", locs: {
  "PELLEGRINI":          2300,
  "Rosario Centro":      2300,
  "Fuera de zona":       2500
 } },
 Norte: { n: "Rondeau 2430, Rosario Norte", wsp: "5493417034333", mapImg: "https://i.ibb.co/dsxs1vQF/mapas-2026-estetica-nueva-2-Centro.png", locs: {
  "NORTE 1":             2300,
  "NORTE 2":             2300,
  "NORTE 3":             2300,
  "NORTE 4":             2300,
  "NORTE | ZONA BAIGORRIA": 2300,
  "Rosario Norte":       2300,
  "Granadero Baigorria": 2300
 } },
 Sur: { n: "San Martin 1808, Rosario Sur", wsp: "5493413244444", mapImg: "https://i.ibb.co/LKX8S4F/mapas-2026-estetica-nueva-3-Centro.png", locs: {
  "ZONA SUR":            2800,
  "GALVEZ 1":            3300,
  "GALVEZ 2":            3300,
  "GALVEZ 3":            3300,
  "GALVEZ 4":            3300,
  "Rosario Sur":         2800,
  "Villa Gdor. Galvez":  3300,
  "VGG":                 3300
 } },
 Funes: { n: "RN9 972, Funes", wsp: "5493413116060", mapImg: "https://i.ibb.co/VpPXMSLb/mapas-2026-estetica-nueva-5-Centro.png", locs: {
  "FUNES 1":             2300,
  "FUNES 2":             2300,
  "FUNES 3":             2300,
  "FUNES 5":             2300,
  "FUNES 4":             4300,
  "FUNES 6 | FISHERTON": 3600,
  "FUNES 7 | FISHERTON": 3500,
  "FUN 8 | FISHERTON":   3600,
  "funes 9 | FISHERTON": 3500,
  "FUNES 10 | FISHERTON":3500,
  "Funes Centro":        2300,
  "Funes Norte":         2300,
  "Funes Sur":           2300,
  "Funes Este":          2500,
  "Funes Oeste":         2500,
  "Fisherton":           3500,
  "B.P. Kentucky":       4300,
  "B.P. Palos Verdes":   4300,
  "B.P. Fisherton":      3600,
  "B.P. Vida / Lagoon":  4000
 } },
 Cafferata: { n: "Cafferata y Urquiza, Rosario", wsp: "5493413244444", mapImg: "https://i.ibb.co/MDZxyKgy/mapas-2026-estetica-nueva-6-Cafferata.png", locs: {
  "cafferata1":                          2300,
  "cafferata 3":                         2300,
  "cafferata 4":                         2300,
  "cafferata 6":                         2300,
  "cafferata 7":                         2300,
  "cafferata alto rosario / puerto norte": 2500,
  "Rosario (Zona Cafferata)":            2300,
  "Alto Rosario / Puerto Norte":         2500
 } }
 };

let menuOverrides = {}; // precios/disponibilidad dinámicos desde Firebase

// ZONA_INFO_UI: mapa de sucursal → label y dirección para mostrar en UI
const ZONA_INFO_UI = {
 Centro: { label: "Rosario Centro", direccion: "Pellegrini 1149, Rosario" },
 Norte:  { label: "Rosario Norte",  direccion: "Rondeau 2430, Rosario" },
 Sur:    { label: "Rosario Sur",    direccion: "San Martín 1808, Rosario" },
 Funes:  { label: "Funes",          direccion: "RN9 972, Funes" },
 Cafferata: { label: "Cafferata",   direccion: "Cafferata y Urquiza, Rosario" }
};

const MENU = [
  {
    cat: "Hamburguesas",
    items: [
      { id: 1, n: "Black Panther", p: 9900, d: "Medallón Marvel, cebolla caramelizada, roquefort, panceta, mayonesa y honey mustard.", img: "https://i.ibb.co/pB5HmKcH/Black-Phanter-4.jpg", ings: ["Cebolla caramelizada", "Roquefort", "Panceta", "Honey mustard"] },
      { id: 2, n: "Capitán América", p: 10800, d: "Medallón Marvel, muzzarella, jamón, tomate, lechuga, huevo frito y mayonesa.", img: "https://i.ibb.co/2YqP8ZsG/Capit-n-Am-rica-1.jpg", ings: ["Muzzarella", "Jamón", "Huevo frito", "Lechuga", "Tomate"] },
      { id: 3, n: "Capitana Marvel", p: 13300, d: "2 medallones Marvel, lechuga, cebolla, pepino, cheddar y salsa Marvel.", img: "https://i.ibb.co/YV106Zd/Cap-Marvel-1.jpg", ings: ["Lechuga", "Cebolla", "Pepino", "Cheddar", "Salsa Marvel"] },
      { id: 4, n: "Dr Strange", p: 12900, d: "2 medallones Marvel, extra cheddar, panceta, lechuga, tomate y mayonesa.", img: "https://i.ibb.co/HDJ8x89R/Dr-Strange-3.jpg", ings: ["Cheddar", "Panceta", "Lechuga", "Tomate"] },
      { id: 5, n: "Hulk Burger", p: 12900, d: "2 medallones Marvel, cheddar, panceta, BBQ y cebolla caramelizada.", img: "https://i.ibb.co/mrvsKzmn/Hulk-4.jpg", ings: ["Cheddar", "Panceta", "BBQ", "Cebolla caramelizada"] },
      { id: 6, n: "Iron Man", p: 10800, d: "Medallón Marvel, cebolla caramelizada, BBQ, cheddar y panceta.", img: "https://i.ibb.co/9kR57Dqt/Ironman-9.jpg", ings: ["Cebolla caramelizada", "BBQ", "Cheddar", "Panceta"] },
      { id: 7, n: "Loki", p: 10200, d: "Medallón Marvel, panceta, lechuga, provolone, cheddar picante, mayonesa y cebolla.", img: "https://i.ibb.co/N2XJ7FKz/Loki-7.jpg", ings: ["Panceta", "Provolone", "Cheddar picante", "Lechuga", "Cebolla"] },
      { id: 8, n: "Natasha", p: 9100, d: "Medallón Marvel y cheddar.", img: "https://i.ibb.co/wND2yZMC/Natasha-6.jpg", ings: ["Cheddar"] },
      { id: 9, n: "Peter Parker", p: 9100, d: "Medallón Marvel, cebolla caramelizada, cheddar y ketchup.", img: "https://i.ibb.co/hJ8F2Cz7/Peter-3.jpg", ings: ["Cebolla caramelizada", "Cheddar", "Ketchup"] },
      { id: 10, n: "Thanos", p: 18800, d: "4 medallones Marvel, cheddar, cebolla caramelizada, panceta y salsa especial.", img: "https://i.ibb.co/pBmFm18N/Thanos-6.jpg", ings: ["Cheddar", "Cebolla caramelizada", "Panceta", "Salsa especial"] },
      { id: 11, n: "Vision", p: 9600, d: "Medallón Marvel, lechuga, tomate, muzarella, panceta y aderezo de albahaca.", img: "https://i.ibb.co/4RQG77sj/Visi-n-1.jpg", ings: ["Lechuga", "Tomate", "Muzarella", "Panceta", "Aderezo de albahaca"] },
      { id: 12, n: "Wanda", p: 9100, d: "Medallón Marvel, lechuga, tomate, muzarella, cebolla morada y palta.", img: "https://i.ibb.co/qL7nFvtY/Wanda-1.jpg", ings: ["Lechuga", "Tomate", "Muzarella", "Cebolla morada", "Palta"] },
      { id: 13, n: "Wolverine", p: 16700, d: "3 medallones Marvel, cheddar, panceta, mayonesa y batatas rock fritas.", img: "https://i.ibb.co/rKMLXVhD/Wolverine.png", ings: ["Cheddar", "Panceta", "Batatas rock"] }
    ]
  },
  {
    cat: "Hamburguesas Veggie",
    items: [
      { id: 14, n: "Vegan Valkyria", p: 6800, d: "Medallón de lentejas, mayonesa vegana, lechuga, tomate, cebolla morada y pepino. Opción: Choclo y Arroz o Remolacha y Semillas.", img: "https://i.ibb.co/N6nbNCFs/valikyria.png", ings: ["Lentejas", "Mayo vegana", "Lechuga", "Tomate", "Cebolla morada", "Pepino"] },
      { id: 30, n: "Black Panther Veggie", p: 6800, d: "Cebolla caramelizada, roquefort, mayonesa y honey mustard. Opción: Choclo y Arroz o Remolacha y Semillas.", img: "https://i.ibb.co/4nbNZ5Pg/Black-Panther.png", ings: ["Cebolla caramelizada", "Roquefort", "Mayonesa", "Honey mustard"] },
      { id: 31, n: "Capitán América Veggie", p: 6800, d: "Muzzarella, tomate, lechuga, huevo frito y mayonesa. Opción: Choclo y Arroz o Remolacha y Semillas.", img: "https://i.ibb.co/rGV81zLX/Capi-veggie.png", ings: ["Muzzarella", "Tomate", "Lechuga", "Huevo frito", "Mayonesa"] },
      { id: 32, n: "Capitana Marvel Veggie", p: 6800, d: "Lechuga, cebolla, pepino, cheddar y salsa Marvel. Opción: Choclo y Arroz o Remolacha y Semillas.", img: "https://i.ibb.co/fzVQzxgW/capi-marvel-gaga.png", ings: ["Lechuga", "Cebolla", "Pepino", "Cheddar", "Salsa Marvel"] },
      { id: 33, n: "Dr Strange Veggie", p: 6800, d: "Extra cheddar, lechuga, tomate y mayonesa. Opción: Choclo y Arroz o Remolacha y Semillas.", img: "https://i.ibb.co/G4NBqTrn/Dr-strange.png", ings: ["Extra cheddar", "Lechuga", "Tomate", "Mayonesa"] },
      { id: 34, n: "Hulk Veggie", p: 6800, d: "Cheddar, BBQ y cebolla caramelizada. Opción: Choclo y Arroz o Remolacha y Semillas.", img: "https://i.ibb.co/1GR38SQw/Iron-man.png", ings: ["Cheddar", "BBQ", "Cebolla caramelizada"] },
      { id: 35, n: "Iron Man Veggie", p: 6800, d: "Cebolla caramelizada, BBQ y cheddar. Opción: Choclo y Arroz o Remolacha y Semillas.", img: "https://i.ibb.co/1GR38SQw/Iron-man.png", ings: ["Cebolla caramelizada", "BBQ", "Cheddar"] },
      { id: 36, n: "Loki Veggie", p: 6800, d: "Lechuga, provolone, cheddar picante, mayonesa y cebolla. Opción: Choclo y Arroz o Remolacha y Semillas.", img: "https://i.ibb.co/xSZw4Rbg/Loki.png", ings: ["Lechuga", "Provolone", "Cheddar picante", "Mayonesa", "Cebolla"] },
      { id: 37, n: "Natasha Veggie", p: 6800, d: "Cheddar. Opción: Choclo y Arroz o Remolacha y Semillas.", img: "https://i.ibb.co/mrK9yk4x/Natasha-veggie.png", ings: ["Cheddar"] },
      { id: 38, n: "Peter Parker Veggie", p: 6800, d: "Cebolla caramelizada, cheddar y ketchup. Opción: Choclo y Arroz o Remolacha y Semillas.", img: "https://i.ibb.co/b5xZFfFX/Peter-veggie.png", ings: ["Cebolla caramelizada", "Cheddar", "Ketchup"] },
      { id: 39, n: "Vision Veggie", p: 6800, d: "Lechuga, tomate, muzarella y aderezo de albahaca. Opción: Choclo y Arroz o Remolacha y Semillas.", img: "https://i.ibb.co/67CFDgxV/vision-veggie-rappi.png", ings: ["Lechuga", "Tomate", "Muzarella", "Aderezo de albahaca"] },
      { id: 40, n: "Wanda Veggie", p: 6800, d: "Lechuga, tomate, muzarella, cebolla morada y palta. Opción: Choclo y Arroz o Remolacha y Semillas.", img: "https://i.ibb.co/4w6QvhMz/Wanda.png", ings: ["Lechuga", "Tomate", "Muzarella", "Cebolla morada", "Palta"] }
    ]
  },
  {
    cat: "Hamburguesas Smash",
    items: [
      { id: 15, n: "Big Marvel", p: 9700, d: "Doble medallón smash 180gr, doble cheddar, lechuga, pepinos, cebolla y salsa Marvel en pan de papa.", img: "https://i.ibb.co/CpbtZ5JN/Big-Marvel-2.jpg", ings: ["Cheddar", "Lechuga", "Pepinos", "Cebolla", "Salsa Marvel"] },
      { id: 16, n: "Chis Burger", p: 9300, d: "Doble medallón smash 180gr, extra cheddar y aderezo a elección en pan de papa.", img: "https://i.ibb.co/xrNhmwB/Cheese-2.jpg", ings: ["Extra Cheddar", "Aderezo a elección"] },
      { id: 17, n: "Perfekta Smash", p: 9500, d: "Doble medallón smash 180gr, doble cheddar, lechuga, tomate y salsa Marvel en pan de papa.", img: "https://i.ibb.co/yHn0xtm/Perfekta-2.jpg", ings: ["Lechuga", "Tomate", "Cheddar", "Salsa Marvel"] },
      { id: 18, n: "Stacker", p: 10200, d: "Doble medallón smash 180gr, extra cheddar, panceta y salsa Marvel en pan de papa.", img: "https://i.ibb.co/PZcGwdpx/Stacker-1.jpg", ings: ["Extra Cheddar", "Panceta", "Salsa Marvel"] }
    ]
  },
  {
    cat: "Acompañamientos y Extras",
    items: [
      { id: 19, n: "Sándwich Libertad", p: 6000, d: "Sándwich tostado con jamón, queso, lechuga, tomate y mayonesa.", img: "https://i.ibb.co/QqCz7g2/Libertad-1.jpg", ings: ["Jamón", "Queso", "Lechuga", "Tomate"] },
      { id: 20, n: "Nuggets (10 unidades)", p: 8400, d: "10 unidades de Nuggets clásicos.", img: "https://i.ibb.co/WNj8CzDj/Nuggets-2.jpg", ings: [] },
      { id: 21, n: "Combo Nuggets", p: 12600, d: "10 Nuggets acompañados con papas chicas.", img: "https://i.ibb.co/21dhfds8/Aros-de-cebolla-3.jpg", ings: ["Papas"] },
      { id: 22, n: "Aros de cebolla (10 unidades)", p: 6700, d: "10 unidades de Aros de cebolla.", img: "https://i.ibb.co/21dhfds8/Aros-de-cebolla-3.jpg", ings: [] },
      { id: 23, n: "Combo Aros", p: 8900, d: "10 Aros acompañados con papas chicas.", img: "https://i.ibb.co/21dhfds8/Aros-de-cebolla-3.jpg", ings: ["Papas"] },
      { id: 24, n: "Papas Chicas", p: 6200, d: "Papas clásicas peso 180gr.", img: "https://i.ibb.co/9kTJXzVs/Papas.png", ings: [] },
      { id: 25, n: "Papas Chicas con Cheddar", p: 7200, d: "Papas clásicas con salsa cheddar peso 180gr.", img: "https://i.ibb.co/8gPmfwg2/Papas-cheddar.png", ings: [] },
      { id: 26, n: "Papas Grandes", p: 7300, d: "Papas clásicas peso 250gr.", img: "https://i.ibb.co/9kTJXzVs/Papas.png", ings: [] },
      { id: 27, n: "Papas Cheddar Grandes", p: 8500, d: "papas grandes con cheddar 250gr + 1 dip cheddar.", img: "https://i.ibb.co/8gPmfwg2/Papas-cheddar.png", ings: [] },
      { id: 28, n: "Marvel Box", p: 17000, d: "Box con 6 nuggets, 6 aros de cebolla acompañada de papas completas con panceta, verdeo, cheddar y bbq.", img: "https://i.ibb.co/xqLrKdV9/DSC-6847.jpg", ings: ["Cheddar", "Panceta", "Verdeo", "BBQ", "AROS DE CEBOLLA 6", "NUGGETS 6"] }
    ]
  },
  {
    cat: "Ensaladas",
    items: [
      { id: 29, n: "Ensalada Kang", p: 9500, d: "Tomate cherry, cebolla morada, salsa kang, lechuga, pollo, jamón, queso y huevo.", img: "https://i.ibb.co/TM2GDnzT/Ensalada.png", ings: ["Pollo", "Huevo", "Jamón", "Queso", "Salsa Kang"] }
    ]
  }
];

const EXTRAS_GLOBALES = [
  { id: "701", n: "Extra Cheddar feta", p: 900, tipo: "burger" }, 
  { id: "700", n: "Extra Medallon", p: 2100, tipo: "burger" },
  { id: "713", n: "Panceta", p: 900, tipo: "papas" },
  { id: "710", n: "Verdeo", p: 900, tipo: "papas" },
  { id: "711", n: "Cheddar", p: 900, tipo: "papas" },
  { id: "300", n: "Sumar Bebida", p: 3300, tipo: "promo" } // Actualizado según precio Pepsi 500cc (3300)
];


 let carrito = [];
 let tProd = null;
 let isDelivery = true;
 let coordenadasGPS = null;

// NUEVO: Horarios por sucursal mapeados con los IDs (Centro = Pellegrini)
const HORARIOS_SUCURSALES = {
 Centro: { m_start: "11:30", m_end: "18:00", n_start: "19:00", n_end: "23:30" },
 Norte: { m_start: "11:30", m_end: "18:00", n_start: "19:00", n_end: "23:30" },
 Sur: { m_start: "11:30", m_end: "18:00", n_start: "19:00", n_end: "23:00" },
 Funes: { m_start: "11:30", m_end: "18:00", n_start: "19:00", n_end: "23:00" },
 Cafferata: { m_start: "11:30", m_end: "18:00", n_start: "19:00", n_end: "23:00" }
};

// NUEVO: Función para evaluar la hora real y renderizar el cartel
window.actualizarEstadoLocal = () => {
 const sucId = document.getElementById('main-sucursal').value;
 const banner = document.getElementById('store-status-banner');
 
 if (!banner) return;
 
 // Sin sucursal: banner vacío
 if (!sucId) { banner.innerHTML = ''; return; }

 const h = HORARIOS_SUCURSALES[sucId];
 const now = new Date();
 const currentMinutes = now.getHours() * 60 + now.getMinutes();
 
 // Función rápida para convertir "HH:MM" a minutos para comparar fácil
 const parseTime = (t) => {
 const parts = t.split(':');
 return parseInt(parts[0]) * 60 + parseInt(parts[1]);
 };

 const m_start = parseTime(h.m_start);
 const m_end = parseTime(h.m_end);
 const n_start = parseTime(h.n_start);
 const n_end = parseTime(h.n_end);

 // Verificamos si los minutos actuales entran en el turno mediodía o noche
 const isOpen = (currentMinutes >= m_start && currentMinutes <= m_end) || 
 (currentMinutes >= n_start && currentMinutes <= n_end);

 // Imprimimos el cartel según el estado
 if (isOpen) {
 banner.innerHTML = `
 <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981; border-radius: 12px; padding: 12px; margin: 0 20px 15px; text-align: center;"><span style="color: #10b981; font-weight: 800; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 6px;"><span style="display:inline-block; width:10px; height:10px; background:#10b981; border-radius:50%; box-shadow: 0 0 8px #10b981;"></span> ABIERTO AHORA
 </span><div style="color: var(--text-light); font-size: 12px; margin-top: 6px;"> Horarios: ${h.m_start} a ${h.m_end} hs / ${h.n_start} a ${h.n_end} hs
 </div></div>`;
 } else {
 banner.innerHTML = `
 <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 12px; padding: 12px; margin: 0 20px 15px; text-align: center;"><span style="color: #ef4444; font-weight: 800; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 6px;"><span style="display:inline-block; width:10px; height:10px; background:#ef4444; border-radius:50%;"></span> CERRADO
 </span><div style="color: var(--text-light); font-size: 12px; margin-top: 6px;"> Horarios: ${h.m_start} a ${h.m_end} hs / ${h.n_start} a ${h.n_end} hs
 </div></div>`;
 }
};

// 1. DEFINICIÓN DE LA FUNCIÓN DEL SLIDER
function inicializarHeroSlider() {
 const heroSlider = document.querySelector('.hero-slider');
 if (!heroSlider) return;

 let autoSlideInterval;

 const startAutoSlide = () => {
 clearInterval(autoSlideInterval);
 autoSlideInterval = setInterval(() => {
 const slideWidth = heroSlider.clientWidth;
 const maxScroll = heroSlider.scrollWidth - slideWidth;
 
 // Si llegamos al final, vuelve al inicio, si no, avanza
 if (heroSlider.scrollLeft >= maxScroll - 10) {
 heroSlider.scrollTo({ left: 0, behavior: 'smooth' });
 } else {
 heroSlider.scrollBy({ left: slideWidth, behavior: 'smooth' });
 }
 }, 4000);
 };

 startAutoSlide();

 // Pausa al tocar para que el usuario pueda hacer click en "Pedir Ahora" sin que se mueva
 heroSlider.addEventListener('touchstart', () => clearInterval(autoSlideInterval), { passive: true });
 heroSlider.addEventListener('touchend', () => setTimeout(startAutoSlide, 2000), { passive: true });

 // Scroll vertical libre en el slider: si el gesto es más vertical que horizontal, dejar pasar al documento
 let _hsTouchStartX = 0, _hsTouchStartY = 0;
 heroSlider.addEventListener('touchstart', function(e) {
 if (e.touches.length === 1) {
 _hsTouchStartX = e.touches[0].clientX;
 _hsTouchStartY = e.touches[0].clientY;
 }
 }, { passive: true });
 heroSlider.addEventListener('touchmove', function(e) {
 if (e.touches.length !== 1) return;
 const dx = Math.abs(e.touches[0].clientX - _hsTouchStartX);
 const dy = Math.abs(e.touches[0].clientY - _hsTouchStartY);
 // Si el movimiento vertical supera al horizontal → permitir scroll de página
 if (dy > dx) {
 heroSlider.style.overflowX = 'hidden';
 } else {
 heroSlider.style.overflowX = 'auto';
 }
 }, { passive: true });
 heroSlider.addEventListener('touchend', function() {
 heroSlider.style.overflowX = 'auto';
 }, { passive: true });
}

// Helper: esperar a que Firebase esté disponible (usa evento o polling breve) 
function _esperarDB(fn) {
 if (window.db) { fn(); return; }
 // Si Firebase dispara el evento personalizado, ejecutar
 function onReady() {
 document.removeEventListener('firebase:ready', onReady);
 fn();
 }
 document.addEventListener('firebase:ready', onReady);
 // Fallback de seguridad: si en 3s no llegó el evento, ejecutar igual
 setTimeout(function() {
 document.removeEventListener('firebase:ready', onReady);
 if (window.db) fn();
 else { console.warn('[_esperarDB] Firebase no disponible después de 3s'); fn(); }
 }, 3000);
}

// 2. BLOQUE DE INICIO ÚNICO
document.addEventListener('DOMContentLoaded', () => {
 if (window.__IS_ADMIN__) return;

 // Cargar overrides del menú — esperar a que Firebase esté listo
 _esperarDB(function() {
 if (typeof cargarMenuOverrides === 'function') cargarMenuOverrides();
 });

 // Cargar config general (horarios, mensajes) desde Firestore
 _esperarDB(function() {
  if (typeof cargarConfigGeneral === 'function') cargarConfigGeneral();
 });

 // Restaurar carrito persistente
 if (typeof restaurarCarrito === 'function') restaurarCarrito();

 // Reanudar seguimiento si hay pedido activo
 try {
 const lastPedido = localStorage.getItem('mf_last_pedido');
 if (lastPedido) {
 const p = JSON.parse(lastPedido);
 if (p && p.id && typeof iniciarSeguimiento === 'function') iniciarSeguimiento(p.id);
 }
 } catch(e) {}

 // Iniciar Slider
 inicializarHeroSlider();

 // Renderizar Menú y Datos
 if (typeof renderMenu === 'function') renderMenu();
 if (typeof renderCenaHoy === 'function') renderCenaHoy();
 if (typeof renderZonas === 'function') renderZonas();

 // Mostrar botón de reorden en carrito si hay historial
 if (typeof mostrarBannerReorden === 'function') mostrarBannerReorden();

 actualizarEstadoLocal();
 // Guardar referencia para poder limpiar el interval si fuera necesario
 // (evita acumular intervalos si DOMContentLoaded se dispara más de una vez)
 if (!window._storeStatusInterval) {
 window._storeStatusInterval = setInterval(actualizarEstadoLocal, 3000);
 }
});

// ---------------------------------------


 // OPTIMIZACIÓN: header cacheado fuera del scroll 
 (function() {
 const _header = document.querySelector('.top-header');
 if (!_header) return;
 window.addEventListener('scroll', () => {
 if (window.scrollY > 50) _header.classList.add('scrolled');
 else _header.classList.remove('scrolled');
 }, { passive: true });
 })();

 window.scrollToMenu = () => {
 const menu = document.getElementById('menu-container');
 const y = menu.getBoundingClientRect().top + window.scrollY - 60;
 window.scrollTo({top: y, behavior: 'smooth'});
 };

 // currentUser ya no se usa en el perfil (cupones son directos)
 let currentUser = {};

 window.obtenerUbicacion = () => {
 const statusText = document.getElementById('loc-status');
 statusText.innerText = "Obteniendo ubicación...";
 
 if (navigator.geolocation) {
 navigator.geolocation.getCurrentPosition(
 (position) => {
 coordenadasGPS = `${position.coords.latitude},${position.coords.longitude}`;
 statusText.innerText = "Ubicación guardada con éxito";
 statusText.parentElement.style.background = "rgba(16, 185, 129, 0.2)";
 statusText.parentElement.style.border = "1px solid #10b981";
 statusText.style.color = "#10b981";
 },
 (error) => {
 statusText.innerText = "Error de permisos o GPS";
 alert("No pudimos obtener tu ubicación. Por favor, asegúrate de tener el GPS encendido y darle permisos al navegador.");
 },
 { enableHighAccuracy: true }
 );
 } else {
 alert("Tu navegador no soporta geolocalización.");
 }
 };

 window.setGeneralDelivery = (isDel) => {
 isDelivery = isDel;
 const btnDel = document.getElementById('btn-tipo-del');
 const btnRet = document.getElementById('btn-tipo-ret');
 const boxEnvio = document.getElementById('box-envio-checkout');
 if (btnDel) btnDel.classList.toggle('active', isDelivery);
 if (btnRet) btnRet.classList.toggle('active', !isDelivery);
 if (boxEnvio) boxEnvio.style.display = isDelivery ? 'block' : 'none';
 // Si es retiro, ocultar zona detectada y resetear bloqueo
 if (!isDel) { _checkoutFueraDeCoberturaActivo = false; const zb = document.getElementById('zona-detectada-box'); if(zb) zb.style.display='none'; }
 renderCartItems();
 validarDatosEnvio();
 };

window.cambiarSucursalPrincipal = () => {
 const suc = document.getElementById('main-sucursal').value;

 // Pre-cargar dirección guardada si coincide la sucursal
 try {
 const saved = JSON.parse(localStorage.getItem('mf_saved_addr') || 'null');
 if (saved && saved.sucId === suc) {
 setTimeout(() => {
 if (saved.loc) { const el = document.getElementById('c-loc'); if(el) el.value = saved.loc; }
 if (saved.dir) { const el = document.getElementById('c-dir'); if(el) el.value = saved.dir; }
 if (saved.piso) { const el = document.getElementById('c-piso'); if(el) el.value = saved.piso; }
 if (saved.depto) { const el = document.getElementById('c-depto'); if(el) el.value = saved.depto; }
 renderCartItems();
 }, 50);
 }
 } catch(e) {}

 renderCartItems();
 actualizarEstadoLocal();
 validarDatosEnvio && validarDatosEnvio();
};

// BATCH RENDERING — carga progresiva del catálogo 
// Renderiza los primeros 12 items de inmediato y carga el resto de forma
// incremental usando IntersectionObserver cuando el usuario hace scroll.
// Esto evita generar +40 nodos DOM de golpe en dispositivos de bajos recursos.
const _BATCH_SIZE = 12;
let _batchQueue = []; // [{grid: DOMElement, html: string}, ...]
let _batchObs = null; // IntersectionObserver activo

function _buildCardHtml(p, precioFinal, agotado) {
 // Bug fix: usar &#39; en lugar de \' para escapar comillas simples en atributos HTML.
 // \' no es entidad HTML valida -> puede romper JSON en Safari/FF. &#39; si lo es.
 const _safeJson = JSON.stringify({...p, p: precioFinal})
 .replace(/&/g, '&amp;').replace(/'/g, '&#39;');
 const onClickAttr = agotado ? '' : `onclick='openModal(${_safeJson})'`;
 // width + height: el navegador calcula el aspect-ratio antes del CSS -> menos CLS.
 const _imgSrc = (p.img && p.img !== 'undefined') ? p.img : '';
 const _imgHtml = _imgSrc
   ? `<img class="p-img" src="${_imgSrc}" alt="${p.n}" width="200" height="200" loading="lazy" decoding="async" onerror="this.style.display='none'">`
   : `<div class="p-img p-img--placeholder" aria-hidden="true"></div>`;
 return `<div class="card-p${agotado ? ' agotado' : ''}" ${onClickAttr}>${agotado ? '<div class="agotado-badge">Agotado</div>' : ''}<div class="p-img-wrapper">${_imgHtml}</div><div class="p-txt"><div><h3>${p.n}</h3><p>${p.d}</p></div><div class="p-action-row"><span class="p-price">$${precioFinal.toLocaleString()}</span><button class="add-btn">+</button></div></div></div>`;
}

function _renderNextBatch() {
 if (_batchQueue.length === 0) {
 // Cola vacía → desconectar observer y ocultar sentinel
 if (_batchObs) { _batchObs.disconnect(); _batchObs = null; }
 const sentinel = document.getElementById('menu-load-sentinel');
 if (sentinel) sentinel.style.display = 'none';
 return;
 }

 // Tomar el próximo lote y volcarlo al DOM usando DocumentFragment
 const batch = _batchQueue.splice(0, _BATCH_SIZE);
 batch.forEach(({ grid, html }) => {
 const tmp = document.createElement('div');
 tmp.innerHTML = html;
 while (tmp.firstChild) grid.appendChild(tmp.firstChild);
 });

 // Si se agotó la cola, limpiar observer y sentinel
 if (_batchQueue.length === 0) {
 if (_batchObs) { _batchObs.disconnect(); _batchObs = null; }
 const sentinel = document.getElementById('menu-load-sentinel');
 if (sentinel) sentinel.style.display = 'none';
 }
}

function renderMenu() {
 const cats = document.getElementById('cat-list');
 const menu = document.getElementById('menu-container');
 cats.innerHTML = ''; menu.innerHTML = '';

 // Reiniciar cola y observer al re-renderizar (ej: cuando llegan overrides de Firebase)
 _batchQueue = [];
 if (_batchObs) { _batchObs.disconnect(); _batchObs = null; }

 MENU.forEach((c, idx) => {
 // Botón de categoría 
 const btn = document.createElement('button');
 btn.className = `cat-tag ${idx === 0 ? 'active' : ''}`;
 btn.innerText = c.cat;
 btn.onclick = () => {
 document.querySelector('.cat-tag.active').classList.remove('active');
 btn.classList.add('active');
 const element = document.getElementById(`sec-${idx}`);
 const y = element.getBoundingClientRect().top + window.scrollY - 140;
 window.scrollTo({ top: y, behavior: 'smooth' });
 };
 cats.appendChild(btn);

 // Sección de categoría (header + grid vacío) 
 const sec = document.createElement('div');
 sec.id = `sec-${idx}`;
 const h3 = document.createElement('h3');
 h3.className = 'cat-title';
 h3.textContent = c.cat;
 sec.appendChild(h3);

 const grid = document.createElement('div');
 grid.className = 'menu-grid';
 sec.appendChild(grid);
 menu.appendChild(sec);

 // Encolar cada item (no se inserta en DOM todavía) 
 c.items.forEach(p => {
 p.cat = c.cat; // para que el modal sepa qué extras mostrar
 const precioFinal = (menuOverrides[p.id] && menuOverrides[p.id].precio)
 ? menuOverrides[p.id].precio : p.p;
 const agotado = !!(menuOverrides[p.id] && menuOverrides[p.id].agotado === true);
 _batchQueue.push({ grid, html: _buildCardHtml(p, precioFinal, agotado) });
 });
 });

 // Sentinel: div invisible al final del catálogo para detectar scroll 
 let sentinel = document.getElementById('menu-load-sentinel');
 if (!sentinel) {
 sentinel = document.createElement('div');
 sentinel.id = 'menu-load-sentinel';
 sentinel.style.cssText = 'height:2px;width:100%;margin:0;padding:0;';
 menu.after(sentinel);
 }
 sentinel.style.display = 'block';

 // Primer lote: renderizar de inmediato (sin esperar scroll) 
 _renderNextBatch();

 // Observer: cargar siguiente lote cuando el sentinel es visible 
 if ('IntersectionObserver' in window && _batchQueue.length > 0) {
 _batchObs = new IntersectionObserver(entries => {
 if (entries[0].isIntersecting) _renderNextBatch();
 }, { rootMargin: '300px' }); // 300px de antelación para carga suave
 _batchObs.observe(sentinel);
 } else {
 // Fallback para navegadores sin IntersectionObserver
 while (_batchQueue.length > 0) _renderNextBatch();
 }
}
 
 
window.openModal = (p) => {
 // Inicializamos el producto temporal con los campos necesarios
 tProd = { ...p, cant: 1, sin: [], con: [], obs: "" };
 
 // Seteamos textos e imagen
 document.getElementById('m-title').innerText = p.n;
 document.getElementById('m-desc').innerText = p.d;
 document.getElementById('m-img').style.backgroundImage = (p.img && p.img !== 'undefined') ? `url('${p.img}')` : 'none';
 document.getElementById('m-qty').innerText = "1";
 document.getElementById('m-obs').value = "";

 // 1. LÓGICA DE INGREDIENTES A QUITAR
 const ingList = document.getElementById('m-list-ings');
 const secIngs = document.getElementById('m-sec-ings');
 
 if(p.ings && p.ings.length > 0) {
 secIngs.style.display = 'block'; 
 ingList.innerHTML = p.ings.map(i => `
 <label class="custom-check"><span>Sin ${i}</span><input type="checkbox" onchange="toggleSin('${i}')"><div class="check-box"></div></label> `).join('');
 } else {
 secIngs.style.display = 'none'; 
 }

 // 2. LÓGICA FILTRADA DE EXTRAS
 let extrasParaMostrar = [];
 
 // Convertimos a minúsculas para comparar fácilmente
 const nombreProd = p.n.toLowerCase();
 const categoriaProd = (p.cat || "").toLowerCase();

 if (categoriaProd.includes("hamburguesas")) {
 // Extras para Hamburguesas
 extrasParaMostrar = EXTRAS_GLOBALES.filter(e => e.tipo === "burger");
 } else if (nombreProd.includes("papas") || categoriaProd.includes("papas")) {
 // Extras para Papas
 extrasParaMostrar = EXTRAS_GLOBALES.filter(e => e.tipo === "papas");
 } else if (nombreProd.includes("promo") || categoriaProd.includes("promo")) {
 // NUEVO: Extras para la Promo (Bebida)
 extrasParaMostrar = EXTRAS_GLOBALES.filter(e => e.tipo === "promo");
 }

 const extSec = document.getElementById('m-sec-extras');
 const extList = document.getElementById('m-list-extras');

 if (extrasParaMostrar.length > 0) {
 extSec.style.display = 'block'; 
 extList.innerHTML = extrasParaMostrar.map(e => `
 <label class="custom-check"><span>${e.n} (+$${e.p})</span><input type="checkbox" onchange="toggleExt('${e.id}')"><div class="check-box"></div></label> `).join('');
 } else {
 extSec.style.display = 'none'; 
 extList.innerHTML = "";
 }

 updateModalBtn();
 document.getElementById('m-prod').style.display = 'flex';
};


window.toggleSin = (i) => { const idx = tProd.sin.indexOf(i); if(idx > -1) tProd.sin.splice(idx,1); else tProd.sin.push(i); };
 
 
window.toggleExt = (id) => { 
 const ex = EXTRAS_GLOBALES.find(x => x.id === id);
 const idx = tProd.con.findIndex(x => x.id === id);
 if(idx > -1) tProd.con.splice(idx,1); else tProd.con.push(ex);
 updateModalBtn();
};
 
 
 window.updateMQty = (v) => { tProd.cant = Math.max(1, tProd.cant + v); document.getElementById('m-qty').innerText = tProd.cant; updateModalBtn(); };
 function updateModalBtn() {
 let u = tProd.p; tProd.con.forEach(e => u += e.p);
 document.getElementById('m-btn-add').innerText = `Agregar • $${(u * tProd.cant).toLocaleString()}`;
 }

 window.closeModal = () => document.getElementById('m-prod').style.display = 'none';
 
 window.confirmAdd = () => {
 tProd.obs = document.getElementById('m-obs').value;
 let u = tProd.p; tProd.con.forEach(e => u += e.p);
 carrito.push({ ...tProd, totalItem: u * tProd.cant });
 guardarCarritoPersistente();
 updateCartUI(); renderCartItems(); closeModal();
 const t = document.getElementById('toast');
 t.classList.add('show'); setTimeout(() => { t.classList.remove('show'); }, 2000);
 };

 window.toggleCart = () => {
 const cv = document.getElementById('cart-view');
 cv.classList.toggle('open');
 document.dispatchEvent(new CustomEvent('cart:toggle'));

 // EmailJS: carga diferida 
 // Se descarga el script SOLO cuando el usuario abre el carrito por
 // primera vez. Esto libera ~20 KB del hilo principal durante la carga
 // inicial de la página y evita bloquear el First Contentful Paint.
 if (cv.classList.contains('open') && !window._ejsLoaded) {
 window._ejsLoaded = true; // flag para no cargar dos veces
 const _ejsScript = document.createElement('script');
 _ejsScript.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
 _ejsScript.onload = () => {
 if (window.emailjs) emailjs.init({ publicKey: 'sATMMVYtIbZLT1tMD' });
 };
 _ejsScript.onerror = () => { window._ejsLoaded = false; }; // permitir reintento
 document.head.appendChild(_ejsScript);
 }
 };
 function updateCartUI() { document.getElementById('cart-badge').innerText = carrito.reduce((s,i)=>s+i.cant,0); }
 window.toggleVuelto = () => document.getElementById('vuelto-box').style.display = (document.getElementById('p-metodo').value === 'Efectivo') ? 'block' : 'none';

// actualizarTotales: eliminada (código muerto — usaba cart/item.q/cart-count incorrectos)

// obtenerHorarioEstimado — función unificada definida más abajo como window.obtenerHorarioEstimado
// Se usa un wrapper local para las llamadas internas previas a la definición canónica.
function obtenerHorarioEstimado(esEnvio) {
 if (typeof window.obtenerHorarioEstimado === 'function') {
   return window.obtenerHorarioEstimado(esEnvio);
 }
 // Fallback mínimo si aún no se definió la versión canónica
 const ahora = new Date();
 const min15 = new Date(ahora.getTime() + 15 * 60000);
 const min30 = new Date(ahora.getTime() + 30 * 60000);
 const f = (d) => `${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
 return esEnvio ? "Próximo turno disponible" : `${f(min15)} a ${f(min30)} hs`;
}

function renderCartItems() {
 const list = document.getElementById('cart-items-list');
 let subtotal = 0;
 
 if (carrito.length === 0) {
 list.innerHTML = `<div style="text-align:center; color:var(--text-light); margin-top:40px;">Tu pedido está vacío.</div>`;
 } else {
 // Render productos
 let itemsHtml = carrito.map((i, idx) => {
 subtotal += i.totalItem;
 return `
 <div style="background:var(--surface); border-radius:12px; padding:15px; margin-bottom:15px; border:1px solid var(--border);"> <div style="display:flex; justify-content:space-between; font-weight:800; font-size:15px; color:var(--white);"> <span>${i.cant}x ${i.n}</span> <span>$${i.totalItem.toLocaleString()}</span> </div> ${i.con && i.con.length ? `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);">${i.con.map(x=>`<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-light);margin-top:3px;"><span>+ ${x.n}</span><span style="color:var(--primary);">+$${(x.p*i.cant).toLocaleString()}</span></div>`).join('')}</div>` : ''}
 ${i.sin && i.sin.length ? `<div style="margin-top:4px;font-size:11px;color:#9ca3af;">Sin: ${i.sin.join(', ')}</div>` : ''}
 ${i.obs ? `<div style="margin-top:4px;font-size:11px;color:#9ca3af;font-style:italic;">"${i.obs}"</div>` : ''}
 <div style="text-align:right; margin-top:10px;"><span onclick="delItem(${idx})" style="color:#ef4444; font-size:12px; font-weight:800; cursor:pointer;">ELIMINAR</span></div> </div> `;
 }).join('');

 // UPSELL: "¿Combinás con...?"
 const upsellHtml = _buildUpsellSection();
 list.innerHTML = itemsHtml + upsellHtml;
 }

 // Mostrar resumen de dirección si hay datos
 const sucId = document.getElementById('main-sucursal').value;
 const dirVal = (document.getElementById('c-dir')?.value || '').trim();
 const locVal = (document.getElementById('c-loc')?.value || '').trim();
 const resumenDirBox = document.getElementById('cart-address-summary');
 if (resumenDirBox) {
 if (isDelivery && (dirVal || locVal) && sucId) {
 const sucInfo = typeof ZONA_INFO_UI !== 'undefined' && ZONA_INFO_UI[sucId];
 resumenDirBox.innerHTML = `
 <div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.3);border-radius:12px;padding:12px 14px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px;"> <span style="font-size:20px;flex-shrink:0;margin-top:2px;"></span> <div style="flex:1;min-width:0;"> <div style="font-size:10px;font-weight:800;color:#f59e0b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">DIRECCIÓN DE ENVÍO</div> <div style="font-size:13px;font-weight:700;color:#fff;">${dirVal || '—'}</div> <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${locVal || 'Sin localidad'} · Sucursal: ${sucInfo ? sucInfo.label : sucId}</div> </div> </div>`;
 resumenDirBox.style.display = 'block';
 } else if (!isDelivery && sucId) {
 const sucInfo = typeof ZONA_INFO_UI !== 'undefined' && ZONA_INFO_UI[sucId];
 resumenDirBox.innerHTML = `
 <div style="background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:12px 14px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px;"> <span style="font-size:20px;flex-shrink:0;margin-top:2px;"></span> <div style="flex:1;min-width:0;"> <div style="font-size:10px;font-weight:800;color:#10b981;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">RETIRÁS EN LOCAL</div> <div style="font-size:13px;font-weight:700;color:#fff;">${sucInfo ? sucInfo.label : sucId}</div> <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${sucInfo ? sucInfo.direccion : ''}</div> </div> </div>`;
 resumenDirBox.style.display = 'block';
 } else {
 resumenDirBox.style.display = 'none';
 }
 }

 // El costo de envío: usar precio detectado por zona si existe
 let costoEnvio = isDelivery ? (_checkoutEnvioPrecio || 0) : 0;

 // --- NUEVA SECCIÓN DE HORARIO ESTIMADO ---
 const horarioTexto = obtenerHorarioEstimado(isDelivery);
 const resHorario = document.getElementById('res-horario');
 if (resHorario) {
 resHorario.innerText = horarioTexto;
 }
 // -----------------------------------------





 let montoDescuento = 0;
 let detalleDescuentoHtml = "";

 if (cuponAplicado) {
 if (cuponAplicado.tipo === "porcentaje") {
 montoDescuento = Math.round(subtotal * cuponAplicado.valor);
 detalleDescuentoHtml = `
 <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #10b981; font-weight: 600;"><span> ${cuponAplicado.titulo}</span><span>-$${montoDescuento.toLocaleString()}</span></div>`;
 } else if (cuponAplicado.tipo === "efectivo") {
 montoDescuento = cuponAplicado.valor;
 detalleDescuentoHtml = `
 <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #10b981; font-weight: 600;"><span> ${cuponAplicado.titulo}</span><span>-$${montoDescuento.toLocaleString()}</span></div>`;
 } else if (cuponAplicado.tipo === "porcentaje_veggie") {
 // Descuento solo en ítems veggie del carrito
 const subtotalVeggie = carrito.filter(i => i.cat && i.cat.toLowerCase().includes('veggie')).reduce((a,i) => a + i.totalItem, 0);
 montoDescuento = Math.round(subtotalVeggie * cuponAplicado.valor);
 detalleDescuentoHtml = `
 <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #10b981; font-weight: 600;"><span> ${cuponAplicado.titulo}</span><span>-$${montoDescuento.toLocaleString()}</span></div>`;
 } else if (cuponAplicado.tipo === "regalo" || cuponAplicado.tipo === "regalo_papas" || cuponAplicado.tipo === "regalo_libre") {
 detalleDescuentoHtml = `
 <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #10b981; font-weight: 600;"><span> ${cuponAplicado.titulo}</span><span>¡INCLUIDO!</span></div>`;
 }
 }

 let totalFinal = subtotal + costoEnvio - montoDescuento;

 document.getElementById('res-sub').innerText = `$${subtotal.toLocaleString()}`;
 const envioLabel = isDelivery
 ? (costoEnvio > 0 ? `$${costoEnvio.toLocaleString('es-AR')}` : 'A confirmar')
 : 'Gratis';
 document.getElementById('res-envio').innerText = envioLabel;
 
 const totalBox = document.getElementById('res-total').parentElement;
 const descuentoPrevio = document.getElementById('detalle-descuento-ui');
 if (descuentoPrevio) descuentoPrevio.remove();
 
 if (detalleDescuentoHtml) {
 const divDesc = document.createElement('div');
 divDesc.id = "detalle-descuento-ui";
 divDesc.innerHTML = detalleDescuentoHtml;
 totalBox.parentNode.insertBefore(divDesc, totalBox);
 }

 document.getElementById('res-total').innerText = `$${Math.max(0, totalFinal).toLocaleString()}`;
 // Sincronizar con paso 2
 const _s2 = document.getElementById('res-sub2');
 const _t2 = document.getElementById('res-total2');
 if (_s2) _s2.textContent = `$${subtotal.toLocaleString()}`;
 if (_t2) _t2.textContent = `$${Math.max(0, totalFinal).toLocaleString()}`;
}

 window.delItem = (i) => { carrito.splice(i,1); guardarCarritoPersistente(); updateCartUI(); renderCartItems(); };

// =======================================================
// UPSELL: "¿Combinás con...?" — sección dentro del carrito
// =======================================================
function _buildUpsellSection() {
 if (!carrito.length || typeof MENU === 'undefined') return '';

 // IDs ya en el carrito
 const idsEnCarrito = new Set(carrito.map(i => i.id));

 // Candidatos: todos los ítems del menú no en carrito
 const todos = [];
 for (const cat of MENU) {
 for (const item of cat.items) {
 if (!idsEnCarrito.has(item.id)) {
 todos.push({ ...item, _cat: cat.cat });
 }
 }
 }
 if (!todos.length) return '';

 // Prioridades: papas > hamburguesas > resto
 const esPapas = i => i.n.toLowerCase().includes('papa') || i.n.toLowerCase().includes('batata');
 const esHamburguesa = i => i._cat.toLowerCase().includes('hambur');
 const esMasVendido = i => [1,5,6,2,24,26,28].includes(i.id); // IDs best-sellers hardcoded
 
 const prioAlta = todos.filter(esPapas);
 const prioMedia = todos.filter(i => !esPapas(i) && (esHamburguesa(i) || esMasVendido(i)));
 const resto = todos.filter(i => !esPapas(i) && !esHamburguesa(i) && !esMasVendido(i));

 // Siempre incluir al menos 1 papa si hay, 1 hamburguesa si hay
 const picks = [];
 const _rnd = arr => arr[Math.floor(Math.random() * arr.length)];
 
 if (prioAlta.length) picks.push(_rnd(prioAlta));
 if (prioMedia.length && picks.length < 3) {
 const hb = _rnd(prioMedia);
 if (!picks.find(p => p.id === hb.id)) picks.push(hb);
 }
 // Rellenar con resto random hasta 3
 const mezclado = [...prioMedia, ...resto].sort(() => Math.random() - .5);
 for (const c of mezclado) {
 if (picks.length >= 3) break;
 if (!picks.find(p => p.id === c.id)) picks.push(c);
 }

 if (!picks.length) return '';

 const frases = [
 ' Otros también pidieron',
 ' Los más elegidos para combinar',
 ' Completá tu pedido con',
 ' ¿Te faltó algo?',
 ];
 const frase = frases[Math.floor(Math.random() * frases.length)];

 const cardsHtml = picks.map(item => {
 const precio = item.p;
 const imgHtml = item.img
 ? `<img src="${item.img}" alt="${item.n}" loading="lazy" style="width:100%;height:72px;object-fit:cover;display:block;">`
 : `<div style="width:100%;height:72px;background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:28px;"></div>`;
 return `<div class="upsell-card">
 ${imgHtml}
 <div class="upsell-card-body">
 <div class="upsell-card-name">${item.n}</div>
 <div class="upsell-card-price">$${precio.toLocaleString('es-AR')}</div>
 </div>
 <button class="upsell-card-btn" onclick="upsellAdd(${item.id})">+ Agregar</button>
 </div>`;
 }).join('');

 return `<div class="upsell-section" style="margin-top:4px;padding-top:16px;border-top:1px dashed var(--border);">
 <div class="upsell-title">${frase}</div>
 <div class="upsell-scroll">${cardsHtml}</div>
 </div>`;
}

// Agregar producto desde upsell (abre el modal con el item pre-cargado)
window.upsellAdd = function(productId) {
 let found = null;
 if (typeof MENU !== 'undefined') {
 for (const cat of MENU) {
 for (const item of cat.items) {
 if (item.id === productId) { found = item; break; }
 }
 if (found) break;
 }
 }
 if (!found) return;
 // Cerrar el carrito antes de abrir el modal para que quede visible
 const cv = document.getElementById('cart-view');
 if (cv && cv.classList.contains('open')) cv.classList.remove('open');
 // Usar openModal si existe, sino agregar directamente al carrito
 if (typeof openModal === 'function') {
 openModal(found);
 } else {
 carrito.push({ id: found.id, n: found.n, p: found.p, cant: 1, con: [], sin: [], obs: '', totalItem: found.p, img: found.img || '' });
 guardarCarritoPersistente();
 updateCartUI();
 renderCartItems();
 const t = document.getElementById('toast');
 if (t) { t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); }
 }
};

window.procesarPedido = async () => {
 if (carrito.length === 0) return alert("Agregá productos a tu pedido primero.");

 const sucId = document.getElementById('main-sucursal').value;
 if(!sucId) return alert("Seleccioná tu sucursal en el menú principal.");

 // Bloquear si el local está cerrado
 if (sucId && typeof HORARIOS_SUCURSALES !== 'undefined') {
 const hh = HORARIOS_SUCURSALES[sucId];
 if (hh) {
 const _now = new Date();
 const _cur = _now.getHours() * 60 + _now.getMinutes();
 const _pt = t => { const p = t.split(':'); return parseInt(p[0])*60+parseInt(p[1]); };
 const _open = (_cur >= _pt(hh.m_start) && _cur <= _pt(hh.m_end)) ||
 (_cur >= _pt(hh.n_start) && _cur <= _pt(hh.n_end));
 if (!_open) {
 return alert(`El local está cerrado en este momento.\nHorarios: ${hh.m_start} a ${hh.m_end} hs / ${hh.n_start} a ${hh.n_end} hs`);
 }
 }
 }

 const nombre = document.getElementById('c-nombre').value;
 const tel = document.getElementById('c-tel').value;
 if(!nombre || !tel) return alert("Completá tu nombre y WhatsApp.");

 const loc = (document.getElementById('c-loc')?.value || '').trim();
 const dir = document.getElementById('c-dir').value;
 if(isDelivery && !dir) return alert("Completá la dirección (calle y número) para el envío.");
 if(isDelivery && !loc) return alert("Completá la localidad (Rosario, Funes, Gálvez...) para el envío.");
 // Validación de formato (refuerzo server-side aunque el botón ya lo controla)
 if(isDelivery && dir && !validarDireccion(dir.trim())) return alert('La dirección debe tener el formato "Calle Número" (ej: Pellegrini 1149)');
 if(tel && !validarTelefono(tel.trim())) return alert('El teléfono no es válido. Ingresá un número de WhatsApp argentino (ej: 3416107498)');

 const pago = document.getElementById('p-metodo').value;
 const vuelto = parseFloat(document.getElementById('p-vuelto').value) || 0;

 // --- NUEVO: Obtener el horario estimado antes de armar la orden ---
 const horarioEstimadoFinal = obtenerHorarioEstimado(isDelivery);

 // Calcular Subtotal correctamente
 let sub = carrito.reduce((s, i) => s + i.totalItem, 0);
 let envio = isDelivery ? (_checkoutEnvioPrecio || 0) : 0; // Precio detectado por zona
 
 let montoDescuento = 0;
 let detalleCupon = "Ninguno";

 if (cuponAplicado) {
 detalleCupon = cuponAplicado.titulo;
 // Bug fix: manejar todos los tipos de cupón (antes solo "porcentaje" se calculaba)
 if (cuponAplicado.tipo === "porcentaje") {
 montoDescuento = Math.round(sub * cuponAplicado.valor);
 } else if (cuponAplicado.tipo === "efectivo" || cuponAplicado.tipo === "descuento_efectivo") {
 montoDescuento = cuponAplicado.valor || 0;
 } else if (cuponAplicado.tipo === "porcentaje_veggie") {
 // Solo aplica sobre ítems veggie (nombre incluye VEGGIE/VEGE/CHOCLO/VEGAN)
 const subVeggie = carrito
 .filter(i => /VEGGIE|VEGE|CHOCLO|VEGAN/i.test(i.n))
 .reduce((a, i) => a + i.totalItem, 0);
 montoDescuento = Math.round(subVeggie * (cuponAplicado.valor || 0));
 }
 // regalo_papas / regalo_libre / regalo → sin descuento numérico; el regalo se acuerda en local
 }

 let total = Math.max(0, sub + envio - montoDescuento);

 if (pago === 'Efectivo' && vuelto > 0 && vuelto < total) {
 return alert(`El monto a abonar debe ser mayor al total ($${total}).`);
 }

 const ordenDatos = {
 cliente: nombre.toUpperCase(), 
 tel, 
 sucursal: SUC_MAP[sucId].n,
 sucursalId: sucId,                    // FIX: ID corto ("Centro"|"Norte"|"Sur"|"Funes")
 tipo: isDelivery ? 'Delivery' : 'Retiro',
 horarioEstimado: horarioEstimadoFinal,
 loc: isDelivery ? loc : 'N/A', 
 dir: isDelivery ? dir : 'N/A', 
 gps: (typeof coordenadasGPS !== 'undefined' && coordenadasGPS) || 'No provisto',
 piso: isDelivery ? `${document.getElementById('c-piso').value} ${document.getElementById('c-depto').value}` : '',
 obs: '',                               // FIX: campo presente desde el inicio (editable desde admin)
 // uid: se sobreescribe justo antes del .add() con _ensureAnonAuth().
 // Valor provisional null por si la función todavía no está disponible.
 uid: (window._firebaseAuth && window._firebaseAuth.currentUser)
   ? window._firebaseAuth.currentUser.uid
   : null,
 // FIX: mapeo explícito — elimina campo 'img' (~80 chars/ítem innecesarios en Firestore)
 // y garantiza que nunca lleguen campos undefined/circulares al documento.
 items: carrito.map(i => ({
   id: i.id,
   // FIX v20: jid = codigo JARVIS real (distinto del 'id' que es posicion en el menu).
   // El autocomplete lo usa para cargar el producto correcto en JARVIS.
   jid: _buscarCodigoJarvis(i.n),
   n: i.n,
   cant: i.cant,
   p: i.p,
   totalItem: i.totalItem,
   sin: Array.isArray(i.sin) ? i.sin : [],
   con: Array.isArray(i.con) ? i.con.map(x => ({ id: x.id || '', n: x.n || '', p: x.p || 0 })) : [],
   obs: i.obs || ''
 })),
 subtotal: sub,
 envio: envio,
 descuento: montoDescuento,
 cuponUsado: detalleCupon,
 // FIX: persistir código interno para trazabilidad en el panel admin
 codigoInterno: codigoInternoAplicado
   ? { codigo: codigoInternoAplicado.codigo, nombre: codigoInternoAplicado.nombre, tipo: codigoInternoAplicado.tipo }
   : null,
 total: total, 
 pago,
 vuelto: (pago === 'Efectivo' && vuelto > 0) ? vuelto : 0,
 estado: "Pendiente", 
 // FIX SEGURIDAD: ts usa serverTimestamp() — la regla ahora valida "d.ts is timestamp"
 // en vez de "d.ts == request.time" que rechazaba pedidos con latencia de red alta.
 ts: firebase.firestore.FieldValue.serverTimestamp(),
 fecha: firebase.firestore.FieldValue.serverTimestamp(),
 fechaISO: new Date().toISOString()    // FIX: string legible para exports/webhooks sin .toDate()
 };

 try {
 document.body.style.cursor = 'wait'; 

 // AUTH ANÓNIMO: asegurar uid antes de escribir en Firestore.
 // Crea sesión anónima si no hay ninguna activa; reutiliza la existente si la hay.
 // La regla de Firestore valida d.uid == request.auth.uid — sin uid el create es rechazado.
 if (typeof window._ensureAnonAuth === 'function') {
   let _anonUser = null;
   let _anonError = null;
   try {
     _anonUser = await window._ensureAnonAuth();
   } catch(e) {
     _anonError = e;
   }

   if (_anonUser) {
     ordenDatos.uid = _anonUser.uid;
   } else {
     // Sin uid Firebase rechazaría el create (regla d.uid == request.auth.uid).
     // Mostramos toast accionable y abortamos — el carrito no se toca.
     document.body.style.cursor = 'default';
     console.warn('[Auth] _ensureAnonAuth sin resultado:', _anonError?.message || 'null');

     const _toastEl = document.getElementById('toast');
     if (_toastEl) {
       _toastEl.innerText = '\u26a0\ufe0f Error de conexión. Revisá tu red y volvé a intentar.';
       _toastEl.classList.add('show');
       setTimeout(() => _toastEl.classList.remove('show'), 5000);
     } else {
       alert('\u26a0\ufe0f Error de conexión. Revisá tu red y volvé a intentar.');
     }
     return; // ← aborta antes del .add(); el carrito queda intacto
   }
 }

 // FIX: Ya no usamos JSON.parse/JSON.stringify porque pierde serverTimestamp()
 // y el mapeo explícito de items en ordenDatos ya garantiza datos limpios.
 // Solo hacemos una copia shallow para no mutar el objeto original.
 const _pedidoLimpio = { ...ordenDatos };

 const docRef = await db.collection("pedidos_v2").add(_pedidoLimpio);
 const pedidoId = docRef.id;


 // Guardar pedidoId para seguimiento en tiempo real
 // Guardar dirección para pre-cargar la próxima vez
 if (isDelivery) {
 try {
 const _savedAddr = {
 loc: document.getElementById('c-loc').value,
 dir: document.getElementById('c-dir').value,
 piso: document.getElementById('c-piso').value,
 depto: document.getElementById('c-depto').value,
 sucId: sucId
 };
 localStorage.setItem('mf_saved_addr', JSON.stringify(_savedAddr));
 } catch(e) {}
 }

 localStorage.setItem('mf_last_pedido', JSON.stringify({
 id: pedidoId,
 cliente: nombre.toUpperCase(),
 sucursal: SUC_MAP[sucId].n,
 total: total,
 items: carrito,
 fecha: new Date().toISOString()
 }));

 // Tarea 5: pedir permiso push y guardar token FCM en el pedido
 (async function() {
 try {
 if ('Notification' in window && 'serviceWorker' in navigator && window._fcmGetToken) {
 const perm = await Notification.requestPermission();
 if (perm === 'granted') {
 const token = await window._fcmGetToken();
 if (token) {
 await db.collection('pedidos_v2').doc(pedidoId).update({ fcmToken: token });
 }
 }
 }
 } catch(e) { console.warn('[FCM] token save error:', e); }
 })();

 // Guardar historial para reorden
 let historial = JSON.parse(localStorage.getItem('mf_historial') || '[]');
 historial.unshift({ items: carrito, fecha: new Date().toISOString(), total });
 historial = historial.slice(0, 5); // max 5 pedidos
 localStorage.setItem('mf_historial', JSON.stringify(historial));

 // Capturar snapshot del carrito ANTES de vaciarlo (lo usa el mensaje de WhatsApp)
 const carritoSnapshot = carrito.slice();

 // Auditoría de ventas en colección 'orders'
 // Movido DESPUÉS de carritoSnapshot para evitar "Cannot access before initialization"
 (async function _registrarOrdenAuditoria() {
 try {
 if (!window.db) return;
 await db.collection(
 (window.CONFIG?.collections?.orders) || 'orders'
 ).add({
 pedidoId,
 sucursal: ordenDatos.sucursal,
 sucursalId: ordenDatos.sucursalId,
 tipo: ordenDatos.tipo,
 total: total,
 subtotal: sub,
 descuento: montoDescuento,
 pago: pago,
 itemCount: carritoSnapshot.length,
 gps: ordenDatos.gps,
 productos: carritoSnapshot.map(i => ({ n: i.n, cant: i.cant, precio: i.p })),
 zona: (typeof _wsSucursalDetectada !== 'undefined' ? _wsSucursalDetectada : null),
 fecha: firebase.firestore.FieldValue.serverTimestamp(),
 fechaISO: new Date().toISOString(),
 });
 } catch(e) {
 console.warn('[Auditoría] No se pudo registrar en orders:', e.message);
 }
 })();

 // Limpiar cupón y carrito persistente
 cuponAplicado = null;
 carrito = [];
 localStorage.removeItem('mf_carrito');
 localStorage.removeItem('mf_cupon');
 localStorage.removeItem('mf_sesion_checkout');
 updateCartUI();
 renderCartItems();
 // Cerrar el carrito y resetear al paso 1
 const _cartView = document.getElementById('cart-view');
 if (_cartView) _cartView.classList.remove('open');
 // Ocultar banner de carrito guardado
 const _restoreBanner = document.getElementById('cart-restore-banner');
 if (_restoreBanner) _restoreBanner.style.display = 'none';
 // Resetear al paso 1
 volverAlCarrito && volverAlCarrito();
 // Resetear datos de geofencing checkout
 _checkoutSucursalDetectada = null;
 _checkoutLat = null; _checkoutLng = null;
 _checkoutFueraDeCoberturaActivo = false;
 _checkoutEnvioPrecio = 0;
 const zb = document.getElementById('zona-detectada-box');
 if (zb) zb.style.display = 'none';

 // Iniciar seguimiento
 iniciarSeguimiento(pedidoId);

 // Notificar sistema externo (webhook / sonido) con el nuevo pedido
 if (typeof _integNotificar === 'function') {
 _integNotificar('nuevo_pedido', { ...ordenDatos, id: pedidoId });
 }

 // FIX: usar carritoSnapshot (capturado ANTES del vaciado) y sucursalId en lugar
 // del array ya vacío que se estaba pasando. Antes siempre llegaba [] a stats.
 registrarVentaStats(carritoSnapshot, total, sucId);

 // --- Generar Mensaje de WhatsApp ---
 let t = `*NUEVO PEDIDO | MARVEL FOOD*%0A---------------------------%0A`;

 // Bloque 1: datos del local y cliente
 t += `*Sucursal:* ${ordenDatos.sucursal}%0A`;
 t += `*Horario Est.:* ${horarioEstimadoFinal}%0A`;
 t += `*Teléfono:* ${tel}%0A`;
 t += `*Cliente:* ${ordenDatos.cliente}%0A`;
 t += `*Tipo:* ${ordenDatos.tipo}%0A`;

 if (isDelivery) {
 t += `*Dirección:* ${dir}${ordenDatos.piso ? ' ' + ordenDatos.piso.trim() : ''}%0A`;
 t += `*Localidad:* ${loc || 'Rosario'}%0A`;
 t += `*Sucursal asignada:* ${ordenDatos.sucursal}%0A`;
 if (ordenDatos.gps !== 'No provisto') t += `*Ubicación GPS:* http://maps.google.com/maps?q=${ordenDatos.gps}%0A`;
 }

 t += `---------------------------%0A`;

 // Bloque 2: pago y cupón
 t += `*Pago:* ${pago}%0A`;
 if (pago === 'Efectivo' && vuelto > 0) {
 // FIX: era (vuelto - total) que daba negativo. El vuelto que devuelve el local
 // es lo que le sobra al cliente: lo que abona (vuelto) menos lo que debe (total).
 t += `*Abona con:* $${vuelto.toLocaleString('es-AR')} (Vuelto: $${(vuelto - total).toLocaleString('es-AR')})%0A`;
 }
 // Bug fix: usar detalleCupon (capturado antes de nullificar cuponAplicado)
 if (detalleCupon && detalleCupon !== 'Ninguno') {
 t += `*Cupón aplicado:* ${detalleCupon}%0A`;
 }
 // Código interno / promo
 if (window.codigoInternoAplicado) {
 t += `*Código:* ${window.codigoInternoAplicado.codigo} — ${window.codigoInternoAplicado.nombre}%0A`;
 }

 t += `---------------------------%0A`;

 // Bloque 3: items (usa carritoSnapshot para evitar el array ya vaciado)
 carritoSnapshot.forEach(i => {
 t += `*${i.cant}x ${i.n}* ($${(i.totalItem||0).toLocaleString('es-AR')})%0A`;
 if(i.sin && i.sin.length) t += ` _Sin: ${i.sin.join(', ')}_%0A`;
 if(i.con && i.con.length) t += ` _Extras: ${i.con.map(x=>x.n+' +$'+(x.p||0).toLocaleString('es-AR')).join(', ')}_%0A`;
 if(i.obs) t += ` _Nota: ${i.obs}_%0A`;
 });

 t += `---------------------------%0A`;

 // Bloque 4: totales
 t += `*Subtotal:* $${sub.toLocaleString('es-AR')}%0A`;
 if(envio > 0) t += `*Envío:* $${envio.toLocaleString('es-AR')}%0A`;
 if(montoDescuento > 0) t += `*Descuento (${detalleCupon}):* -$${montoDescuento.toLocaleString('es-AR')}%0A`;
 t += `%0A*TOTAL FINAL: $${total.toLocaleString('es-AR')}*%0A`;

 document.body.style.cursor = 'default';

 // MERCADO PAGO 
 if (pago === 'Mercado Pago') {
 mostrarSucesoPedido('mercadopago', `https://wa.me/${SUC_MAP[sucId].wsp}?text=${t}`, total);
 } else {
 // Efectivo / Tarjeta → pantalla verde → WhatsApp
 // Respetar flag wspClienteActivo (configurable desde el panel de Configuración)
 const _wspClienteActivo = window._cfgWspClienteActivo !== false;
 const _waUrl = (SUC_MAP[sucId].wspOff || !_wspClienteActivo) ? null : `https://wa.me/${SUC_MAP[sucId].wsp}?text=${t}`;
 mostrarSucesoPedido('whatsapp', _waUrl, total);
 }

 } catch (e) {
    document.body.style.cursor = 'default';
    console.error("Error en Firebase:", e);
    // MEJORA 1: Si hay error de red, guardar en cola offline
    if (!navigator.onLine || (e.code && e.code === 'unavailable') || (e.message && e.message.toLowerCase().includes('network'))) {
      try {
        const pedidoOffline = { ...ordenDatos, fechaISO: new Date().toISOString(), _offline: true };
        delete pedidoOffline.fecha;
        pedidosPendientes.push(pedidoOffline);
        guardarPedidosPendientes();
        alert("⚠️ Sin conexión. Tu pedido fue guardado y se enviará automáticamente cuando vuelva la red.");
      } catch(e2) {
        alert("Error al guardar el pedido: " + e.message);
      }
    } else {
      alert("Error al guardar el pedido: " + e.message);
    }
  }
};

// ═══════════════════════════════════════════════════════════════════
//  MEJORA 1 — Cola de pedidos offline
//  Evita pérdida de pedidos cuando no hay conexión a internet
// ═══════════════════════════════════════════════════════════════════

let pedidosPendientes = [];

function cargarPedidosPendientes() {
  try {
    const saved = localStorage.getItem('mf_pending_orders');
    if (saved) pedidosPendientes = JSON.parse(saved);
  } catch(e) {}
}

function guardarPedidosPendientes() {
  try {
    localStorage.setItem('mf_pending_orders', JSON.stringify(pedidosPendientes));
  } catch(e) {}
}

async function reintentarPedidosPendientes() {
  if (!window.db || pedidosPendientes.length === 0) return;
  const pendientes = [...pedidosPendientes];
  pedidosPendientes = [];
  guardarPedidosPendientes();
  let enviados = 0;
  for (const pedido of pendientes) {
    try {
      const pedidoFinal = { ...pedido, fecha: firebase.firestore.FieldValue.serverTimestamp() };
      delete pedidoFinal._offline;
      await db.collection("pedidos_v2").add(pedidoFinal);
      enviados++;
    } catch(e) {
      pedidosPendientes.push(pedido);
      guardarPedidosPendientes();
    }
  }
  if (enviados > 0) {
    console.log(`[Offline] ${enviados} pedido(s) sincronizado(s).`);
    try {
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#10b981;color:#fff;padding:12px 20px;border-radius:30px;font-weight:700;font-size:13px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.4);';
      toast.textContent = `✅ ${enviados} pedido(s) offline sincronizado(s)`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    } catch(e) {}
  }
}

window.addEventListener('online', reintentarPedidosPendientes);
window.addEventListener('load', () => {
  cargarPedidosPendientes();
  reintentarPedidosPendientes();
});

// 
// FLUJO DE CARRITO EN 2 PASOS
// 

// Variables de geofencing para checkout
let _checkoutLat = null, _checkoutLng = null;
let _checkoutSucursalDetectada = null;
let _checkoutFueraDeCoberturaActivo = false;
let _checkoutEnvioPrecio = 0; // precio de envío detectado según zona

// Paso 1 → Paso 2: ir a pagar
window.irAPagar = function() {
 if (carrito.length === 0) return;
 const step1 = document.getElementById('cart-step-1');
 const step2 = document.getElementById('cart-step-2');
 const title = document.getElementById('cart-title');
 const backBtn = document.getElementById('cart-step2-back');
 if (step1) step1.style.display = 'none';
 if (step2) step2.style.display = step2.dataset.display || 'flex';
 if (title) title.textContent = 'COMPLETAR PEDIDO';
 if (backBtn) backBtn.style.display = 'flex';
 // Sincronizar totales en paso 2
 _sincronizarTotales();
 // Intentar detectar zona si ya hay datos guardados
 const savedAddr = _loadSavedAddr();
 if (savedAddr) {
 const locEl = document.getElementById('c-loc');
 const dirEl = document.getElementById('c-dir');
 if (locEl && !locEl.value && savedAddr.loc) locEl.value = savedAddr.loc;
 if (dirEl && !dirEl.value && savedAddr.dir) dirEl.value = savedAddr.dir;
 }
 validarDatosEnvio();
};

// Paso 2 → Paso 1: volver al carrito
window.volverAlCarrito = function() {
 const step1 = document.getElementById('cart-step-1');
 const step2 = document.getElementById('cart-step-2');
 const title = document.getElementById('cart-title');
 const backBtn = document.getElementById('cart-step2-back');
 if (step1) step1.style.display = 'flex';
 if (step2) step2.style.display = 'none';
 if (title) title.textContent = 'TU ORDEN';
 if (backBtn) backBtn.style.display = 'none';
};

// Al cerrar el carrito, resetear al paso 1
// Usamos evento en lugar de monkeypatching para no encadenar redefiniciones de toggleCart
document.addEventListener('cart:toggle', () => {
 const cv = document.getElementById('cart-view');
 if (cv && !cv.classList.contains('open')) {
 setTimeout(() => { volverAlCarrito(); }, 300);
 }
});

// Sincronizar totales del paso 1 al paso 2
function _sincronizarTotales() {
 const sub1 = document.getElementById('res-sub');
 const tot1 = document.getElementById('res-total');
 const sub2 = document.getElementById('res-sub2');
 const tot2 = document.getElementById('res-total2');
 if (sub1 && sub2) sub2.textContent = sub1.textContent;
 if (tot1 && tot2) tot2.textContent = tot1.textContent;
}

// Cargar dirección guardada
function _loadSavedAddr() {
 try { return JSON.parse(localStorage.getItem('mf_saved_addr') || 'null'); } catch(e) { return null; }
}

// GPS en el checkout (paso 2)
window.obtenerUbicacionCheckout = async function() {
 const statusEl = document.getElementById('loc-status');
 if (!navigator.geolocation) {
 if (statusEl) statusEl.textContent = 'GPS no disponible';
 return;
 }
 if (statusEl) statusEl.textContent = 'Obteniendo ubicación...';
 navigator.geolocation.getCurrentPosition(async (pos) => {
 _checkoutLat = pos.coords.latitude;
 _checkoutLng = pos.coords.longitude;
 if (statusEl) statusEl.textContent = 'OK Ubicación GPS obtenida';
 // También llamar a la función original para compatibilidad (guarda coordenadasGPS)
 if (typeof obtenerUbicacion === 'function') obtenerUbicacion();
 // Detectar sucursal
 await _detectarZonaCheckout(_checkoutLat, _checkoutLng);
 validarDatosEnvio();
 }, (err) => {
 console.warn('[GPS checkout]', err);
 if (statusEl) statusEl.textContent = 'No se pudo obtener ubicación';
 // Fallback: mostrar selector manual de sucursal en el checkout
 _checkoutFueraDeCoberturaActivo = true;
 _mostrarZonaBox(null, null, 0);
 const t = document.getElementById('toast');
 if (t) {
   t.innerText = 'No se pudo detectar tu zona. Seleccioná la sucursal manualmente.';
   t.classList.add('show');
   setTimeout(() => { t.classList.remove('show'); t.innerText = '¡Agregado al pedido!'; }, 4000);
 }
 });
};

// Detectar zona desde texto (cuando cambia c-dir o c-loc)
let _detectarZonaTimeout = null;
window.detectarZonaDesdeTexto = function() {
 renderCartItems();
 clearTimeout(_detectarZonaTimeout);
 _detectarZonaTimeout = setTimeout(async () => {
 const dir = (document.getElementById('c-dir')?.value || '').trim();
 const loc = (document.getElementById('c-loc')?.value || '').trim();
 if (!dir && !loc) {
 _checkoutSucursalDetectada = null;
 _checkoutEnvioPrecio = 0;
 _mostrarZonaBox(null, null);
 validarDatosEnvio();
 return;
 }
 // Intentar geocodificar si hay función disponible
 if (typeof _geocodificar === 'function' && (dir || loc)) {
 try {
 const geo = await _geocodificar(dir, loc);
 if (geo && geo.lat && geo.lng) {
 _checkoutLat = geo.lat;
 _checkoutLng = geo.lng;
 await _detectarZonaCheckout(geo.lat, geo.lng);
 return;
 }
 } catch(e) {}
 }
 // Fallback: detectar sucursal por localidad usando texto (SIEMPRE actualizar)
 const sucPorLoc = (typeof _sucursalPorLocalidad === 'function') ? _sucursalPorLocalidad(loc || dir) : null;
 if (sucPorLoc) {
 _checkoutSucursalDetectada = sucPorLoc;
 _checkoutFueraDeCoberturaActivo = false;
 // Asignar precio de envío por defecto de la sucursal detectada
 _checkoutEnvioPrecio = _getPrecioEnvioPorSucursal(sucPorLoc, loc);
 _mostrarZonaBox(sucPorLoc, '(por localidad)', _checkoutEnvioPrecio);
 // Siempre sincronizar con main-sucursal
 const sel = document.getElementById('main-sucursal');
 if (sel) sel.value = sucPorLoc;
 } else {
 _checkoutSucursalDetectada = null;
 _checkoutEnvioPrecio = 0;
 _mostrarZonaBox(null, null);
 }
 validarDatosEnvio();
 }, 700);
};

// Obtener precio de envío por sucursal + localidad desde SUC_MAP
function _getPrecioEnvioPorSucursal(sucursal, localidad) {
 if (!sucursal || typeof SUC_MAP === 'undefined') return 0;
 const suc = SUC_MAP[sucursal];
 if (!suc || !suc.locs) return 0;
 // Buscar coincidencia de localidad en locs
 const locNorm = (localidad || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
 if (!locNorm) { return Object.values(suc.locs)[0] || 0; }
 // 1) Coincidencia exacta (normalizada)
 for (const [locKey, precio] of Object.entries(suc.locs)) {
   const keyNorm = locKey.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
   if (keyNorm === locNorm) return precio;
 }
 // 2) Coincidencia de la zona dentro de la key (e.g. "GALVEZ 1" matchea "galvez 1")
 for (const [locKey, precio] of Object.entries(suc.locs)) {
   const keyNorm = locKey.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
   if (keyNorm.includes(locNorm) || locNorm.includes(keyNorm)) return precio;
 }
 // 3) Fallback: primer precio de la sucursal
 return Object.values(suc.locs)[0] || 0;
}

// Detectar zona usando turf geofencing con coordenadas
async function _detectarZonaCheckout(lat, lng) {
 if (!lat || !lng) return;
 try {
 const resultado = await window.determinarSucursal(lat, lng);
 if (resultado && resultado.sucursal) {
 _checkoutSucursalDetectada = resultado.sucursal;
 _checkoutFueraDeCoberturaActivo = false;
 // Precio: del campo precio de Firebase primero, sino buscar en SUC_MAP por zona
 let precio = resultado.precio || 0;
 if (!precio) precio = _getPrecioEnvioPorSucursal(resultado.sucursal, resultado.zona || '');
 _checkoutEnvioPrecio = precio;
 _mostrarZonaBox(resultado.sucursal, resultado.zona ? `zona: ${resultado.zona}` : '', precio);
 // Siempre sincronizar con el selector de sucursal
 const sel = document.getElementById('main-sucursal');
 if (sel) sel.value = resultado.sucursal;
 } else {
 _checkoutSucursalDetectada = null;
 _checkoutEnvioPrecio = 0;
 _checkoutFueraDeCoberturaActivo = true;
 _mostrarZonaBox(null, null, 0);
 }
 } catch(e) {
 console.warn('[detectarZona]', e.message || e);
 // Error inesperado: exponer el selector manual para no bloquear la venta
 _checkoutFueraDeCoberturaActivo = true;
 _mostrarZonaBox(null, null, 0);
 }
 renderCartItems();
 validarDatosEnvio();
}

// Mostrar/ocultar indicador de zona detectada
function _mostrarZonaBox(sucursal, detalle, precio) {
 const box = document.getElementById('zona-detectada-box');
 if (!box) return;
 if (!sucursal) {
 if (_checkoutFueraDeCoberturaActivo) {
 box.style.display = 'block';
 box.style.background = 'rgba(239,68,68,0.12)';
 box.style.border = '1px solid rgba(239,68,68,0.4)';
 box.style.color = '#ef4444';
 box.innerHTML = '(!) Lo sentimos, no llegamos a tu zona. Podes seleccionar <b>TakeAway</b> o cambiar la direccion.' + _buildZonaOverride('');
 } else {
 box.style.display = 'none';
 }
 return;
 }
 const NOMBRES = { Centro: 'Rosario Centro', Norte: 'Rosario Norte / Baigorria', Sur: 'Rosario Sur / VGG', Funes: 'Funes - Fisherton' };
 box.style.display = 'block';
 box.style.background = 'rgba(16,185,129,0.1)';
 box.style.border = '1px solid rgba(16,185,129,0.35)';
 box.style.color = '#10b981';
 const precioHtml = precio ? `<span class="zona-precio-badge">Envio: $${precio.toLocaleString('es-AR')}</span>` : '';
 box.innerHTML = `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">Sucursal detectada: <b>${NOMBRES[sucursal] || sucursal}</b>${detalle ? ' <span style="opacity:.7;font-weight:500;font-size:11px;">' + detalle + '</span>' : ''}${precioHtml}</div>` + _buildZonaOverride(sucursal);
}

// Construye el selector de corrección manual de sucursal
function _buildZonaOverride(sucursalActual) {
 return `<div id="zona-override-row" style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
  <span style="font-size:11px;color:#9ca3af;font-weight:700;white-space:nowrap;">Corregir sucursal:</span>
  <select id="zona-override-sel" onchange="aplicarZonaOverride(this.value)"
    style="flex:1;min-width:150px;padding:6px 10px;background:#1a1a1a;border:1px solid #3a3a3a;border-radius:8px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;outline:none;">
    <option value="">-- Sin cambios --</option>
    <option value="Centro" ${sucursalActual==='Centro'?'selected':''}>Rosario Centro (Pellegrini 1149)</option>
    <option value="Norte" ${sucursalActual==='Norte'?'selected':''}>Rosario Norte (Rondeau 2430)</option>
    <option value="Sur" ${sucursalActual==='Sur'?'selected':''}>Rosario Sur (San Martin 1808)</option>
    <option value="Funes" ${sucursalActual==='Funes'?'selected':''}>Funes (RN9 972)</option>
  </select>
 </div>`;
}

// Aplicar corrección manual de zona
window.aplicarZonaOverride = function(sucursal) {
 if (!sucursal) return;
 _checkoutSucursalDetectada = sucursal;
 // Sincronizar también el selector principal de sucursal del carrito
 const sel = document.getElementById('main-sucursal');
 if (sel) { sel.value = sucursal; if (typeof cambiarSucursalPrincipal === 'function') cambiarSucursalPrincipal(); }
 // Actualizar box con la nueva sucursal
 _mostrarZonaBox(sucursal, '(ajustado manualmente)', null);
 if (typeof validarDatosEnvio === 'function') validarDatosEnvio();
 const t = document.getElementById('toast');
 if (t) { t.innerText = 'Sucursal cambiada a ' + sucursal; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
};

// Validar datos y habilitar/deshabilitar botón final
// ── Validadores de formato (checkout) ─────────────────────────────────────
function validarDireccion(dir) {
  // Formato esperado: "Calle Número" (ej: "Pellegrini 1149")
  const regex = /^[A-Za-záéíóúñÑ\s]+ \d+$/;
  return regex.test(dir.trim());
}

function validarTelefono(tel) {
  // Teléfono argentino: solo dígitos, 8-14 chars
  const soloDigitos = tel.replace(/\D/g, '');
  const regex = /^(54|9)?(341|342|343|332|336|337|338|339|351|352|353|354|355|356|358|359|361|362|363|364|365|366|367|368|369|371|372|373|374|375|376|377|378|379|381|382|383|384|385|386|387|388|389|391|392|393|394|395|396|397|398|399)\d{6,8}$/;
  return regex.test(soloDigitos);
}

window.validarDatosEnvio = function() {
  const btn = document.getElementById('btn-final-enviar');
  const hint = document.getElementById('btn-enviar-hint');
  if (!btn) return;

  const nombre = (document.getElementById('c-nombre')?.value || '').trim();
  const tel = (document.getElementById('c-tel')?.value || '').trim();
  const esEntrega = isDelivery;

  const razones = [];

  // Nombre: al menos dos palabras
  const palabras = nombre.split(/\s+/).filter(p => p.length > 0);
  if (!nombre || palabras.length < 2) razones.push('nombre completo (al menos dos palabras)');

  // Teléfono: validar formato argentino
  if (!tel) razones.push('WhatsApp');
  else if (!validarTelefono(tel)) razones.push('WhatsApp válido (ej: 3416107498)');

  if (esEntrega) {
    const dir = (document.getElementById('c-dir')?.value || '').trim();
    const loc = (document.getElementById('c-loc')?.value || '').trim();

    if (!dir) razones.push('dirección');
    else if (!validarDireccion(dir)) razones.push('dirección en formato "Calle Número"');

    if (!loc) razones.push('localidad');
    if (!_checkoutSucursalDetectada && !document.getElementById('main-sucursal')?.value) razones.push('zona de cobertura');
    if (_checkoutFueraDeCoberturaActivo) razones.push('zona sin cobertura');
  }

  if (razones.length === 0) {
    btn.disabled = false;
    btn.style.background = 'var(--primary)';
    btn.style.color = '#000';
    btn.style.cursor = 'pointer';
    if (hint) hint.textContent = '';
  } else {
    btn.disabled = true;
    btn.style.background = '#333';
    btn.style.color = '#666';
    btn.style.cursor = 'not-allowed';
    if (hint) hint.textContent = 'Completá: ' + razones.join(', ');
  }
};

// 
// PANTALLA DE ÉXITO — se muestra al finalizar un pedido
// 
async function mostrarSucesoPedido(tipo, waUrl, total) {
 let overlay = document.getElementById('pedido-exito-overlay');
 if (!overlay) {
 overlay = document.createElement('div');
 overlay.id = 'pedido-exito-overlay';
 overlay.innerHTML = `
 <div id="peo-card"> <div id="peo-check"></div> <div id="peo-title">¡Tu Pedido ya fue enviado al local!</div> <div id="peo-sub">Recibiras una notificacion de confirmación!</div> <div id="peo-msg">¡Gracias por preferirnos!</div> <div id="peo-redirect-msg"></div> <div id="peo-spinner"></div> </div>`;
 document.body.appendChild(overlay);
 }
 overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;background:linear-gradient(135deg,#064e3b 0%,#065f46 50%,#047857 100%);display:flex;align-items:center;justify-content:center;padding:24px;';
 const card = document.getElementById('peo-card');
 card.style.cssText = 'text-align:center;max-width:380px;width:100%;';
 document.getElementById('peo-check').style.cssText = 'font-size:80px;display:block;margin:0 auto 16px;color:#bbf7d0;';
 document.getElementById('peo-title').style.cssText = 'font-size:26px;font-weight:800;color:#fff;margin-bottom:8px;';
 document.getElementById('peo-sub').style.cssText = 'font-size:16px;color:rgba(255,255,255,.85);margin-bottom:6px;';
 document.getElementById('peo-msg').style.cssText = 'font-size:17px;font-weight:700;color:#d1fae5;margin-bottom:24px;';
 const redirMsg = document.getElementById('peo-redirect-msg');
 const spinner = document.getElementById('peo-spinner');
 redirMsg.style.cssText = 'color:rgba(255,255,255,.8);font-size:13px;margin-bottom:14px;';
 spinner.style.cssText = 'width:26px;height:26px;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:peoSpin 1s linear infinite;margin:0 auto;';

 if (tipo === 'mercadopago') {
 redirMsg.innerHTML = 'Generando link de Mercado Pago...';
 try {
 const mpSnap = await window.db.collection('config_menu').doc('mercadopago').get();
 if (!mpSnap.exists || !mpSnap.data()?.accessToken) throw new Error('no_token');
 const mpToken = mpSnap.data().accessToken;
 const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + mpToken },
 body: JSON.stringify({
 items: [{ title: 'Pedido Marvel Food', quantity: 1, unit_price: total, currency_id: 'ARS' }],
 back_urls: { success: waUrl, failure: waUrl, pending: waUrl },
 auto_return: 'approved',
 statement_descriptor: 'Marvel Food'
 })
 });
 if (!prefRes.ok) throw new Error('mp_api_' + prefRes.status);
 const prefData = await prefRes.json();
 redirMsg.innerHTML = 'Link generado · Abriendo Mercado Pago...';
 spinner.style.display = 'none';
 setTimeout(() => _peoCerrarYRedirigir(overlay, prefData.init_point), 7800);
 } catch(err) {
 console.warn('[MP]', err.message);
 redirMsg.innerHTML = 'No se pudo generar el link MP.<br><span style="font-size:12px;">Pedido guardado. Redirigiendo al WhatsApp...</span>';
 spinner.style.display = 'none';
 setTimeout(() => _peoCerrarYRedirigir(overlay, waUrl), 7500);
 }
 } else {
 redirMsg.innerHTML = 'Redirigiendo a WhatsApp...';
 setTimeout(() => _peoCerrarYRedirigir(overlay, waUrl), 7200);
 }
}

function _peoCerrarYRedirigir(overlay, url) {
 overlay.style.transition = 'opacity .3s';
 overlay.style.opacity = '0';
 setTimeout(() => { overlay.style.display = 'none'; window.location.href = url; }, 300);
}

 window.switchTab = (tabId, element) => {
 document.querySelectorAll('.tab-page').forEach(page => page.classList.add('hidden'));
 const tabEl = document.getElementById(tabId);
 if (tabEl) tabEl.classList.remove('hidden');
 
 document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
 if (element) element.classList.add('active');

 if(tabId === 'tab-perfil') actualizarVistasPerfil();
 if(tabId === 'tab-promos') renderPromosCatalog();
 if(tabId === 'tab-pedidos') renderHistorialPedidos();
 if(tabId === 'tab-opiniones') cargarOpinionesPub();
 if(tabId === 'tab-zonas') renderZonasCards();
 // tab-ayuda now has its own nav button — no redirect needed.

 window.scrollTo(0,0);
 };

// RENDER DE LA PESTAÑA CUPONES 
const ICONOS_CUPON = {
 porcentaje: '',
 regalo_papas: '',
 regalo_veggie: '',
 descuento_efectivo: '',
 regalo_libre: ''
};

function valorTexto(c) {
 if (c.tipo === 'porcentaje') return `${c.valor}% OFF`;
 if (c.tipo === 'descuento_efectivo') return `$${c.valor.toLocaleString()} OFF`;
 if (c.tipo === 'regalo_veggie') return `${c.valor}% en Veggies`;
 return 'GRATIS';
}

function renderTarjetaCupon(c, esHoy) {
 const icono = ICONOS_CUPON[c.tipo] || '';
 const usado = c.usado === true;
 if (esHoy) {
 return `
 <div style="background:linear-gradient(135deg,rgba(245,158,11,0.15),rgba(245,158,11,0.04)); border:2px solid var(--primary); border-radius:16px; padding:18px; position:relative; overflow:hidden; margin-bottom:12px;"><div style="position:absolute;top:0;right:0;background:var(--primary);color:black;font-size:9px;font-weight:800;padding:4px 12px;border-radius:0 14px 0 10px;">${c.horario === 'noche' ? 'ESTA NOCHE' : c.horario === 'mediodía' ? 'AL MEDIODÍA' : 'HOY TODO EL DÍA'}</div><div style="display:flex;align-items:center;gap:14px;margin-top:10px;"><span style="font-size:40px;">${icono}</span><div style="flex:1;"><h4 style="color:var(--primary);font-weight:800;font-size:16px;margin:0 0 3px;">${c.titulo}</h4><p style="color:var(--text-light);font-size:12px;margin:0 0 10px;">${c.desc}</p><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="background:rgba(245,158,11,0.2);border:1px dashed var(--primary);color:var(--primary);font-size:11px;font-weight:800;padding:3px 10px;border-radius:6px;letter-spacing:1px;">${c.code}</span><span style="background:var(--primary);color:black;font-size:11px;font-weight:800;padding:3px 10px;border-radius:6px;">${valorTexto(c)}</span></div></div></div><button onclick="window.aplicarCuponDesdeRegalos('${c.code}')"
 style="background:var(--primary);border:none;color:black;padding:13px;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;width:100%;margin-top:14px;text-transform:uppercase;letter-spacing:1px;"> USAR ESTE CUPÓN
 </button></div>`;
 } else {
 return `
 <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px;display:flex;align-items:center;gap:12px;margin-bottom:10px;opacity:0.55;"><span style="font-size:28px;">${icono}</span><div style="flex:1;"><h4 style="color:var(--text-light);font-weight:700;font-size:13px;margin:0 0 2px;">${c.titulo}</h4><p style="color:var(--text-light);font-size:11px;margin:0;opacity:0.7;">${c.desc}</p></div><span style="color:var(--border);font-size:10px;font-weight:700;white-space:nowrap;">${c.dia}</span></div>`;
 }
}

function actualizarVistasPerfil() {
 const diaHoy = new Date().getDay();
 const hora = new Date().getHours();
 const DIAS = ["DOM","LUN","MAR","MIÉ","JUE","VIE","SÁB"];

 // Cupón del día 
 const boxHoy = document.getElementById('cupon-del-dia-box');
 const cuponHoy = obtenerCuponDelDia();
 if (boxHoy) {
 if (cuponHoy) {
 boxHoy.innerHTML = renderTarjetaCupon(cuponHoy, true);
 } else {
 // ver si existe para hoy pero fuera de horario
 const c = CUPONES_DEL_DIA[diaHoy];
 if (c && c.horario === 'mediodía') {
 boxHoy.innerHTML = `
 <div style="background:var(--surface);border:1px dashed var(--border);border-radius:14px;padding:18px;text-align:center;margin-bottom:12px;"><span style="font-size:32px;"></span><p style="color:var(--text-light);font-size:13px;margin:8px 0 0;">El cupón de hoy estará disponible<br><strong style="color:var(--primary);">de 11:00 a 16:00 hs</strong></p></div>`;
 } else if (c && c.horario === 'noche') {
 boxHoy.innerHTML = `
 <div style="background:var(--surface);border:1px dashed var(--border);border-radius:14px;padding:18px;text-align:center;margin-bottom:12px;"><span style="font-size:32px;"></span><p style="color:var(--text-light);font-size:13px;margin:8px 0 0;">El cupón de hoy estará disponible<br><strong style="color:var(--primary);">de 20:00 a 23:59 hs</strong></p></div>`;
 } else {
 boxHoy.innerHTML = `
 <div style="background:var(--surface);border:1px dashed var(--border);border-radius:14px;padding:18px;text-align:center;margin-bottom:12px;"><span style="font-size:32px;"></span><p style="color:var(--text-light);font-size:13px;margin:8px 0 0;">Hoy no hay cupón activo.<br>¡Volvé otro día!</p></div>`;
 }
 }
 }

 // Resto de la semana 
 const boxSemana = document.getElementById('cupones-semana-box');
 if (boxSemana) {
 const otrosDias = Object.entries(CUPONES_DEL_DIA)
 .filter(([d, c]) => parseInt(d) !== diaHoy && c !== null)
 .map(([d, c]) => ({ ...c, dia: DIAS[parseInt(d)] }));

 if (otrosDias.length > 0) {
 boxSemana.innerHTML = `
 <p style="color:var(--text-light);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">PRÓXIMOS CUPONES</p> ${otrosDias.map(c => renderTarjetaCupon(c, false)).join('')}`;
 } else {
 boxSemana.innerHTML = '';
 }
 }
}
// =============================================
// CUPONES DEL DÍA — EDITÁ AQUÍ DIRECTAMENTE
// =============================================
//
// Cada entrada es un día de la semana (0=Dom, 1=Lun ... 6=Sáb).
// Si el día no tiene cupón, poné: null
//
// Tipos disponibles:
// "porcentaje" → descuento % sobre el total (valor: número, ej: 10)
// "regalo_papas" → papas gratis con burger (valor: 0)
// "regalo_veggie" → % descuento solo en Veggies (valor: número, ej: 15)
// "descuento_efectivo"→ monto fijo de descuento (valor: número, ej: 2000)
// "regalo_libre" → regalo personalizado (valor: 0)
//
// "horario" puede ser:
// "mediodía" → activo de 11:00 a 16:00 hs
// "noche" → activo de 20:00 a 23:59 hs
// "siempre" → activo todo el día
//
// "code" es el código interno, sin espacios.
//
const CUPONES_DEL_DIA = {
 0: { titulo: "DOMINGO NOCHE", desc: "Dip de cheddar gratis con la compra de papas", code: "CHEESEDIP", tipo: "regalo_libre", valor: 0, horario: "noche" }, // Domingo
 1: { titulo: "LUNES DE BURGER", desc: "10% OFF en toda la carta", code: "LUNES10", tipo: "porcentaje", valor: 10, horario: "mediodía" }, // Lunes
 2: { titulo: "MARTES COMPAÑERO", desc: "Papas chicas de regalo con tu burger", code: "PAPASGRATIS",tipo: "regalo_papas", valor: 0, horario: "mediodía" }, // Martes
 3: { titulo: "MIÉRCOLES VEGGIE", desc: "15% OFF en hamburguesas Veggie", code: "VEGGIE15", tipo: "regalo_veggie", valor: 15, horario: "mediodía" }, // Miércoles
 4: { titulo: "JUEVES EFECTIVO", desc: "$2000 de descuento pagando en efectivo al mediodía",code: "JUEVES2K", tipo: "descuento_efectivo", valor: 2000, horario: "mediodía" }, // Jueves
 5: { titulo: "VIERNES NOCHE", desc: "Dip de cheddar gratis con la compra de papas", code: "VIERNESDIP", tipo: "regalo_libre", valor: 0, horario: "noche" }, // Viernes
 6: { titulo: "SÁBADO NOCHE", desc: "Dip de cheddar gratis con la compra de papas", code: "SABADODIP", tipo: "regalo_libre", valor: 0, horario: "noche" }, // Sábado
};

// Función auxiliar para determinar el cupón activo del día
function obtenerCuponDelDia() {
 const ahora = new Date();
 const dia = ahora.getDay();
 const hora = ahora.getHours();
 const cupon = CUPONES_DEL_DIA[dia];
 if (!cupon) return null;
 if (cupon.horario === "mediodía" && !(hora >= 11 && hora <= 16)) return null;
 if (cupon.horario === "noche" && !(hora >= 20 && hora <= 23)) return null;
 return cupon;
}

// Al cargar la página, verificamos si ya había una sesión


 function renderPromosCatalog() {
 const container = document.getElementById('promos-container');
 const bannerMartes = document.getElementById('martes-banner');
 if (!container) return;

 const _hoyDate = new Date();
 const _diaSemana = _hoyDate.getDay();
 const _MESES_ES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
 const hoy = _diaSemana;

 if (hoy === 2) {
 if (bannerMartes) {
  bannerMartes.classList.remove('hidden');
  const _titEl = document.getElementById('martes-banner-titulo');
  if (_titEl) _titEl.textContent = 'MARTES DE ' + _MESES_ES[_hoyDate.getMonth()];
 }
 } else {
 if (bannerMartes) bannerMartes.classList.add('hidden');
 }

 const _hoyStr = _hoyDate.toISOString().slice(0,10); // 'YYYY-MM-DD'
 const promosVisibles = PROMOS_DATA.filter(item => {
 if (item._oculta) return false;
 // Validar rango de fechas si existe
 if (item.fechaDesde && _hoyStr < item.fechaDesde) return false;
 if (item.fechaHasta && _hoyStr > item.fechaHasta) return false;
 return item.diaVenta === null || item.diaVenta === undefined || item.diaVenta === hoy;
 });

 if (promosVisibles.length === 0) {
 container.innerHTML = `<p style="color:var(--text-light); text-align:center; grid-column: 1/-1;">Hoy no hay promociones especiales activas.</p>`;
 return;
 }

 // Bug fix: usar &#39; + &amp; igual que _buildCardHtml para evitar HTML inválido en Safari/FF.
 container.innerHTML = promosVisibles.map(item => {
 const _safeJson = JSON.stringify(item).replace(/&/g, '&amp;').replace(/'/g, '&#39;');
 return `<div class="promo-card"><div class="badge-promo">${item.diaVenta === 2 ? 'SOLO POR HOY' : 'PROMO'}</div>${(item.img && item.img !== 'undefined') ? `<img src="${item.img}" width="400" height="140" style="width:100%; height:140px; object-fit:cover; border-radius:10px; margin-bottom:10px;" loading="lazy" decoding="async" onerror="this.style.display='none'">` : ''}<h3 style="font-size:16px; font-weight:800;">${item.n}</h3><p style="font-size:12px; color:var(--text-light); margin: 5px 0;">${item.d}</p><div class="price-container"><span class="old-price">$${item.pOriginal.toLocaleString()}</span><span class="new-price">$${item.p.toLocaleString()}</span></div><button class="btn-action" onclick='openModal(${_safeJson})' style="margin-top:12px; padding:10px; font-size:13px;"> AGREGAR PROMO</button></div>`;
 }).join('');
 }

 function renderCenaHoy() {
 const container = document.getElementById('cena-hoy-container');
 const hoy = new Date().getDay();
 const burgerDelDia = CALENDARIO_MARVEL[hoy];

 const opciones = [
 {
 ...burgerDelDia,
 id: `PROMO-DIA-NORMAL-${hoy}`,
 n: `PROMO ${burgerDelDia.n} + Papas chicas`,
 pOriginal: 15300,
 p: 14300,
 badge: "OPCIÓN CARNE",
 ings: [] // CORRECCIÓN
 },
 {
 ...burgerDelDia,
 id: `PROMO-DIA-VEGGIE-${hoy}`,
 n: `PROMO ${burgerDelDia.n} VEGGIE + Papas chicas`,
 pOriginal: 13000,
 p: 11600,
 badge: "OPCIÓN VEGGIE",
 ings: [] // CORRECCIÓN
 }
 ];

 // Bug fix: escapar & y ' igual que _buildCardHtml para evitar HTML inválido en Safari/FF.
 container.innerHTML = `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">${opciones.map(item => {
 const _safeJson = JSON.stringify(item).replace(/&/g, '&amp;').replace(/'/g, '&#39;');
 return `<div class="promo-card" style="padding: 10px;"><div class="badge-promo" style="font-size: 8px;">${item.badge}</div><h3 style="font-size: 14px; margin-top: 25px; min-height: 40px;">${item.n}</h3><div class="price-container" style="flex-direction: column; align-items: flex-start; gap: 2px;"><span class="old-price" style="font-size: 12px;">$${item.pOriginal.toLocaleString()}</span><span class="new-price" style="font-size: 16px;">$${item.p.toLocaleString()}</span></div><button class="btn-action" onclick='openModal(${_safeJson})' style="margin-top:10px; padding:8px; font-size:11px; width: 100%;"> AGREGAR</button></div>`;
 }).join('')}</div>`;
 }

 // Render automático del tab Locales: botones por sucursal con precios y botón ver mapa
 function renderZonasCards() {
 const container = document.getElementById('zonas-cards-container');
 if (!container || container._rendered) return;
 container._rendered = true;
 let html = '';
 for (const key in SUC_MAP) {
 const suc = SUC_MAP[key];
 const mapaBtnHtml = suc.mapImg
 ? `<button onclick="abrirZonaMapa('${key}')"
 style="width:100%;margin-top:14px;padding:13px;border-radius:10px;border:none;
 background:var(--primary);color:var(--dark);font-weight:800;font-size:13px;
 text-transform:uppercase;letter-spacing:0.8px;cursor:pointer;
 display:flex;align-items:center;justify-content:center;gap:8px;
 box-shadow:0 3px 10px rgba(245,158,11,0.3);transition:all 0.2s;"> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Ver mapa de cobertura
 </button>`
 : '';
 html += `
 <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;
 padding:18px;margin-bottom:16px;box-shadow:var(--shadow-card);"> <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;"> <div style="width:36px;height:36px;border-radius:8px;background:rgba(245,158,11,0.12);
 display:flex;align-items:center;justify-content:center;flex-shrink:0;"> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> </div> <div> <div style="font-weight:800;font-size:14px;color:var(--white);text-transform:uppercase;">${suc.n.split(',')[0]}</div> <div style="font-size:11px;color:var(--text-light);margin-top:1px;">${suc.n.includes(',') ? suc.n.split(',').slice(1).join(',').trim() : ''}</div> </div> </div> ${mapaBtnHtml}
 </div>`;
 }
 container.innerHTML = html;
 }
 window.verZona = () => {}; // mantener compatibilidad si algo lo llama

 // Abrir modal de mapa de zona
 window.abrirZonaMapa = function(sucKey) {
 const suc = SUC_MAP[sucKey];
 if (!suc) return;
 document.getElementById('zona-modal-titulo').textContent = suc.n.split(',')[0];
 document.getElementById('zona-modal-subtitulo').textContent = suc.n;
 document.getElementById('zona-modal-precios').innerHTML = '';
 const img = document.getElementById('zona-modal-img');
 const noImg = document.getElementById('zona-modal-no-img');
 if (suc.mapImg) {
 img.src = suc.mapImg;
 img.style.display = 'block';
 noImg.style.display = 'none';
 } else {
 img.style.display = 'none';
 noImg.style.display = 'flex';
 }
 document.getElementById('zona-mapa-modal').style.display = 'block';
 document.body.style.overflow = 'hidden';
 };

 window.cerrarZonaMapa = function() {
 document.getElementById('zona-mapa-modal').style.display = 'none';
 document.body.style.overflow = '';
 };



 // Función del botón de la barra de direcciones
 window.verMapaRangos = () => {
 const sucId = document.getElementById('main-sucursal').value;
 if(!sucId) return mostrarInfo('Atención', '<p style="color: var(--text-light);">Primero seleccioná una sucursal en la barra superior para ver sus zonas de entrega.</p>');
 
 const data = SUC_MAP[sucId];
 let html = `<div style="margin-bottom:15px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 15px;">`;
 for(let l in data.locs) { 
 html += `<div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid var(--border); padding-bottom:8px;"><span style="color: var(--text-light);">${l}</span><b style="color: var(--white);">$${data.locs[l]}</b></div>`; 
 }
 html += `</div>`;
 if(data.mapImg) html += `<img src="${data.mapImg}" width="600" height="400" loading="lazy" decoding="async" style="width:100%; border-radius:12px; border:1px solid var(--border); box-shadow: var(--shadow-card);">`;
 
 mostrarInfo(`Cobertura ${data.n}`, html);
 };

 // Función que renderiza la pestaña ZONAS automáticamente
 function renderZonas() {
 const container = document.getElementById('zonas-container');
 if (!container) return;
 
 let html = '';
 for (const key in SUC_MAP) {
 const suc = SUC_MAP[key];
 
 html += `
 <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px; box-shadow: var(--shadow);"><h3 style="color: var(--primary); font-weight: 800; font-size: 16px; margin-bottom: 15px; text-transform: uppercase;">${suc.n}</h3> ${suc.mapImg ? `<img src="${suc.mapImg}" width="600" height="400" loading="lazy" decoding="async" style="width: 100%; border-radius: 10px; border: 1px solid var(--border); object-fit: cover;">` : ''}
 </div>`;
 }
 container.innerHTML = html;
 }

// Configuración de rangos de envío (Formato 24hs)
const RANGOS_ENVIO = [
 { start: "12:00", end: "12:45" },
 { start: "13:30", end: "14:15" },
 { start: "14:15", end: "15:00" },
 { start: "15:45", end: "16:30" },
 { start: "20:15", end: "21:00" },
 { start: "21:00", end: "21:45" },
 { start: "21:45", end: "22:30" },
 { start: "22:30", end: "23:15" },
 { start: "23:15", end: "00:00" }
];

window.obtenerHorarioEstimado = (esDelivery) => {
 const ahora = new Date();
 const ahoraMinutos = ahora.getHours() * 60 + ahora.getMinutes();

 if (!esDelivery) {
 // Lógica para Retiro (15 a 30 min)
 const minTime = new Date(ahora.getTime() + 15 * 60000);
 const maxTime = new Date(ahora.getTime() + 30 * 60000);
 const format = (d) => d.getHours() + ":" + d.getMinutes().toString().padStart(2, '0');
 return `${format(minTime)} a ${format(maxTime)} hs`;
 }

 // Lógica para Envío por rangos
 const margenGracia = 10; // 10 minutos de tolerancia antes de saltar al siguiente

 for (const rango of RANGOS_ENVIO) {
 const [hStart, mStart] = rango.start.split(':').map(Number);
 // Si el rango es 00:00, lo tratamos como 24:00 para la comparación
 const startTotalMinutos = (hStart === 0 ? 24 : hStart) * 60 + mStart;

 // Si la hora actual es menor al inicio del rango + 10 min de gracia, asignamos este
 if (ahoraMinutos <= (startTotalMinutos + margenGracia)) {
 return `${rango.start} a ${rango.end} hs`;
 }
 }

 return "Próximo turno disponible";
};


// 
// ADMIN — detección por URL hash #admin
// Abrí: https://tu-sitio.vercel.app/#admin
// 



// 
// NUEVAS FUNCIONALIDADES — Marvel Food
// 
// ═══════════════════════════════════════════════════════════════════
//  1. MENU OVERRIDES (precios/disponibilidad desde Firebase)
//
//  Mejoras v2:
//  · Las 3 consultas corren en PARALELO (Promise.allSettled) → más rápido
//    y un fallo de permisos en una no bloquea a las otras dos.
//  · Guard anti-doble-init: el onSnapshot se registra solo una vez aunque
//    cargarMenuOverrides sea llamada múltiples veces.
//  · Tras aplicar promos/cupones se refresca la UI de inmediato
//    (renderPromosCatalog + actualizarVistasPerfil) sin esperar interacción.
//  · Fallback por timeout: si Firebase tarda más de 6s renderizamos con
//    los datos hardcodeados para que el cliente nunca vea el menú vacío.
//  · Logs diagnósticos con prefijo [MenuOverrides] fáciles de filtrar.
// ═══════════════════════════════════════════════════════════════════

let _menuOverridesListenerActivo = false; // guard anti-doble-suscripción

// ── Helper: aplica overrides de promos al array PROMOS_DATA ──────────────
function _aplicarPromosOverride(ov) {
  if (!ov || typeof ov !== 'object') return;
  const CAMPOS_PROMO = ['p', 'pOriginal', 'diaVenta', 'n', 'd', 'img'];

  // 1. Actualizar promos base existentes
  PROMOS_DATA.forEach(p => {
    const over = ov[p.id];
    if (!over) return;
    CAMPOS_PROMO.forEach(campo => {
      if (over[campo] !== undefined) p[campo] = over[campo];
    });
    if (over.activo === false) p._oculta = true;
    else delete p._oculta; // reactivar si el admin la volvió a encender
  });

  // 2. Agregar promos custom creadas solo en Firebase (no están en PROMOS_DATA)
  Object.keys(ov).forEach(key => {
    const over = ov[key];
    if (!over || !over._custom || over.activo === false) return;
    if (PROMOS_DATA.find(p => p.id === key)) return; // no duplicar
    PROMOS_DATA.push({ ...over, id: key });
  });
}

// ── Helper: aplica overrides de cupones a CUPONES_DEL_DIA ────────────────
function _aplicarCuponesOverride(ov) {
  if (!ov || typeof ov !== 'object') return;
  [0, 1, 2, 3, 4, 5, 6].forEach(dia => {
    if (!ov[dia]) return;
    if (ov[dia].activo === false) {
      CUPONES_DEL_DIA[dia] = null;
    } else {
      CUPONES_DEL_DIA[dia] = { ...CUPONES_DEL_DIA[dia], ...ov[dia] };
    }
  });
}

// ── Función principal ─────────────────────────────────────────────────────
async function cargarMenuOverrides() {
  if (!window.db) {
    console.warn('[MenuOverrides] db no disponible, saltando.');
    return;
  }

  // ── Fallback por timeout ──────────────────────────────────────────────
  // Si Firebase tarda más de 6s, renderizamos con datos hardcodeados
  // para que el cliente nunca vea el menú o las promos en blanco.
  const _fallbackTimer = setTimeout(() => {
    console.warn('[MenuOverrides] Timeout 6s — renderizando con datos base.');
    if (typeof renderMenu === 'function') renderMenu();
    if (typeof renderPromosCatalog === 'function') renderPromosCatalog();
  }, 6000);

  // ── 1. onSnapshot de precios/disponibilidad (se registra UNA SOLA VEZ) ─
  if (!_menuOverridesListenerActivo) {
    try {
      db.collection('config_menu').doc('overrides')
        .onSnapshot(
          snap => {
            menuOverrides = snap.exists ? snap.data() : {};
            console.log('[MenuOverrides] overrides actualizado:', Object.keys(menuOverrides).length, 'entradas');
            if (typeof renderMenu === 'function') renderMenu();
          },
          err => {
            // Fallo de permisos u otro error: el menú igual se renderiza
            console.warn('[MenuOverrides] onSnapshot error (overrides):', err.code || err.message);
            menuOverrides = {};
            if (typeof renderMenu === 'function') renderMenu();
          }
        );
      _menuOverridesListenerActivo = true;
    } catch (e) {
      console.warn('[MenuOverrides] No se pudo registrar listener de overrides:', e.message);
      menuOverrides = {};
      if (typeof renderMenu === 'function') renderMenu();
    }
  }

  // ── 2. Cargar promos y cupones EN PARALELO ────────────────────────────
  // Promise.allSettled garantiza que un fallo de permisos en una consulta
  // no cancela la otra ni detiene el flujo de la app.
  const [resultPromos, resultCupones] = await Promise.allSettled([
    db.collection('config_menu').doc('promos_override').get(),
    db.collection('config_menu').doc('cupones_override').get(),
  ]);

  clearTimeout(_fallbackTimer); // Firebase respondió → cancelar fallback

  // ── 3. Aplicar overrides de promos ───────────────────────────────────
  if (resultPromos.status === 'fulfilled') {
    const snap = resultPromos.value;
    if (snap.exists) {
      _aplicarPromosOverride(snap.data());
      console.log('[MenuOverrides] promos_override cargado ✓');
    } else {
      console.log('[MenuOverrides] promos_override: documento vacío, usando datos base.');
    }
  } else {
    // Permisos insuficientes u error de red: PROMOS_DATA hardcodeado
    // permanece intacto → el cliente sigue viendo las promos base.
    console.warn('[MenuOverrides] promos_override no disponible:', resultPromos.reason?.code || resultPromos.reason?.message);
  }

  // ── 4. Aplicar overrides de cupones ──────────────────────────────────
  if (resultCupones.status === 'fulfilled') {
    const snap = resultCupones.value;
    if (snap.exists) {
      _aplicarCuponesOverride(snap.data());
      console.log('[MenuOverrides] cupones_override cargado ✓');
    } else {
      console.log('[MenuOverrides] cupones_override: documento vacío, usando datos base.');
    }
  } else {
    console.warn('[MenuOverrides] cupones_override no disponible:', resultCupones.reason?.code || resultCupones.reason?.message);
  }

  // ── 5. Refrescar UI de promos y cupones ──────────────────────────────
  // renderMenu() solo actualiza la carta de productos. Necesitamos también:
  //   · renderPromosCatalog() → panel de Promos (tab-promos)
  //   · actualizarVistasPerfil() → cupon-del-dia-box y cupones-semana-box
  try {
    if (typeof renderPromosCatalog === 'function') renderPromosCatalog();
  } catch (e) {
    console.warn('[MenuOverrides] renderPromosCatalog falló:', e.message);
  }
  try {
    if (typeof actualizarVistasPerfil === 'function') actualizarVistasPerfil();
  } catch (e) {
    console.warn('[MenuOverrides] actualizarVistasPerfil falló:', e.message);
  }
}

// 2. CARRITO PERSISTENTE 
function guardarCarritoPersistente() {
 try {
   localStorage.setItem('mf_carrito', JSON.stringify(carrito));
   // Persistir también el cupón activo
   if (typeof cuponAplicado !== 'undefined') {
     if (cuponAplicado) localStorage.setItem('mf_cupon', JSON.stringify(cuponAplicado));
     else localStorage.removeItem('mf_cupon');
   }
   // Guardar contexto de sesión para no perder delivery/sucursal al recargar
   const sesion = {
     isDelivery: typeof isDelivery !== 'undefined' ? isDelivery : true,
     sucursal: typeof _checkoutSucursalDetectada !== 'undefined' ? _checkoutSucursalDetectada : null,
     envioPrecio: typeof _checkoutEnvioPrecio !== 'undefined' ? _checkoutEnvioPrecio : 0,
   };
   localStorage.setItem('mf_sesion_checkout', JSON.stringify(sesion));
 } catch(e) {}
}

function restaurarCarrito() {
 try {
 const saved = localStorage.getItem('mf_carrito');
 if (!saved) return;
 const items = JSON.parse(saved);
 if (!items || !items.length) return;
 carrito = items;
 updateCartUI();
 renderCartItems();
 // Banner de restauración
 const banner = document.getElementById('cart-restore-banner');
 if (banner) {
 banner.style.display = 'block';
 const _subTotal = items.reduce((s,i) => s + (i.totalItem||0), 0);
 banner.innerHTML = `
 <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;"> <div> <div style="font-size:12px;color:var(--text-light);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Carrito sin confirmar</div> <div style="font-size:14px;color:var(--white);font-weight:600;">${items.length} producto${items.length!==1?'s':''} · <span style="color:var(--primary);font-weight:800;">$${_subTotal.toLocaleString('es-AR')}</span></div> </div> <div style="display:flex;gap:8px;flex-shrink:0;"> <button onclick="limpiarCarritoBanner()" style="background:transparent;border:1px solid var(--border);color:var(--text-light);padding:7px 12px;border-radius:8px;font-size:11px;cursor:pointer;">Limpiar</button> <button onclick="toggleCart();document.getElementById('cart-restore-banner').style.display='none'" style="background:var(--primary);border:none;color:#000;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;">Retomar</button> </div> </div>`;
 }
 } catch(e) { localStorage.removeItem('mf_carrito'); }
 // Restaurar cupón activo
 try {
 const savedCupon = localStorage.getItem('mf_cupon');
 if (savedCupon && typeof cuponAplicado !== 'undefined') {
   cuponAplicado = JSON.parse(savedCupon);
   console.log('[Carrito] Cupón restaurado:', cuponAplicado.id);
 }
 } catch(e) { localStorage.removeItem('mf_cupon'); }
 // Restaurar contexto de sesión (isDelivery, sucursal, precio envío)
 try {
 const savedSesion = localStorage.getItem('mf_sesion_checkout');
 if (savedSesion) {
   const sesion = JSON.parse(savedSesion);
   if (typeof isDelivery !== 'undefined' && sesion.isDelivery !== undefined) isDelivery = sesion.isDelivery;
   if (typeof _checkoutSucursalDetectada !== 'undefined' && sesion.sucursal) _checkoutSucursalDetectada = sesion.sucursal;
   if (typeof _checkoutEnvioPrecio !== 'undefined' && sesion.envioPrecio) _checkoutEnvioPrecio = sesion.envioPrecio;
 }
 } catch(e) { localStorage.removeItem('mf_sesion_checkout'); }
}

window.limpiarCarritoBanner = () => {
 carrito = [];
 localStorage.removeItem('mf_carrito');
 updateCartUI();
 renderCartItems();
 const banner = document.getElementById('cart-restore-banner');
 if (banner) banner.style.display = 'none';
};

// 3. REORDEN — el banner ya no va en el carrito, sino en tab-pedidos 
function mostrarBannerReorden() {
 // No-op: el historial ahora vive en la pestaña "Pedidos"
 renderHistorialPedidos();
}

window.reordenarUltimo = () => {
 try {
 const historial = JSON.parse(localStorage.getItem('mf_historial') || '[]');
 if (!historial.length) return;
 const ultimo = historial[0];
 carrito = [...ultimo.items];
 guardarCarritoPersistente();
 updateCartUI();
 renderCartItems();
 toggleCart();
 const t = document.getElementById('toast');
 if (t) { t.innerText = 'Pedido anterior restaurado'; t.classList.add('show'); setTimeout(() => { t.classList.remove('show'); t.innerText='¡Agregado al pedido!'; }, 2500); }
 } catch(e) { alert("No se pudo restaurar el pedido."); }
};

// RENDER DE HISTORIAL DE PEDIDOS 
function renderHistorialPedidos() {
 renderPedidoEnCurso();
 const lista = document.getElementById('historial-pedidos-lista');
 if (!lista) return;
 try {
 const historial = JSON.parse(localStorage.getItem('mf_historial') || '[]');
 if (!historial.length) {
 lista.innerHTML = `
 <div style="text-align:center;padding:60px 20px;"><div style="font-size:56px;margin-bottom:16px;"></div><p style="color:var(--text-light);font-size:15px;font-weight:600;">Todavía no hiciste ningún pedido</p><p style="color:var(--text-light);font-size:13px;margin-top:6px;opacity:0.7;">Cuando hagas tu primera orden, aparecerá acá</p></div>`;
 return;
 }
 lista.innerHTML = historial.map((p, idx) => {
 const fecha = p.fecha ? new Date(p.fecha).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
 const items = (p.items || []).map(i => `${i.cant}x ${i.n}`).join(', ');
 return `
 <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;margin-bottom:12px;position:relative;overflow:hidden;"><div style="position:absolute;top:0;left:0;width:4px;height:100%;background:var(--primary);border-radius:4px 0 0 4px;"></div><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;padding-left:8px;"><div><div style="font-size:11px;color:var(--text-light);font-weight:700;text-transform:uppercase;letter-spacing:.5px;">${fecha}</div><div style="font-size:16px;font-weight:800;color:var(--primary);margin-top:2px;">$${(p.total||0).toLocaleString('es-AR')}</div></div><div style="background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:4px 10px;font-size:11px;font-weight:800;color:var(--primary);"> ${(p.items||[]).reduce((s,i)=>s+i.cant,0)} item${(p.items||[]).reduce((s,i)=>s+i.cant,0)!==1?'s':''}
 </div></div><div style="font-size:12px;color:var(--text-light);line-height:1.5;padding-left:8px;margin-bottom:10px;">${items}</div><button onclick="reordenarDesdeHistorial(${idx})"
 style="width:100%;padding:10px;background:transparent;border:1px solid var(--primary);color:var(--primary);border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;transition:.2s;"
 onmouseover="this.style.background='rgba(245,158,11,0.1)'" onmouseout="this.style.background='transparent'"> Repetir este pedido
 </button></div>`;
 }).join('');
 } catch(e) {
 lista.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:40px;">Error cargando historial</p>';
 }
}

window.reordenarDesdeHistorial = (idx) => {
 try {
 const historial = JSON.parse(localStorage.getItem('mf_historial') || '[]');
 if (!historial[idx]) return;
 carrito = [...historial[idx].items];
 guardarCarritoPersistente();
 updateCartUI();
 renderCartItems();
 toggleCart();
 const nav = document.querySelector('.nav-item[onclick*="tab-inicio"]');
 if (nav) switchTab('tab-inicio', nav);
 const t = document.getElementById('toast');
 if (t) { t.innerText = 'Pedido restaurado al carrito'; t.classList.add('show'); setTimeout(() => { t.classList.remove('show'); t.innerText='¡Agregado al pedido!'; }, 2500); }
 } catch(e) { alert("No se pudo restaurar el pedido."); }
};

window.limpiarHistorialPedidos = () => {
 if (!confirm('¿Borrar todo el historial de pedidos?')) return;
 localStorage.removeItem('mf_historial');
 renderHistorialPedidos();
};

// 4. SEGUIMIENTO EN TIEMPO REAL 
let trackingUnsubscribe = null;

const TRACKING_ESTADOS = [
 { key: 'Pendiente', label: 'Pedido recibido', emoji: '' },
 { key: 'Aceptado', label: 'En preparación', emoji: '' },
 { key: 'Listo', label: 'Listo para envío', emoji: '' },
 { key: 'Entregado', label: 'Entregado', emoji: '' },
 { key: 'Cancelado', label: 'Pedido anulado', emoji: '' }
];

function iniciarSeguimiento(pedidoId) {
 if (window.__IS_ADMIN__) return; // no mostrar en admin
 if (window._cfgTrackingActivo === false) return; // tracking desactivado desde el admin
 if (trackingUnsubscribe) trackingUnsubscribe();
 trackingUnsubscribe = db.collection("pedidos_v2").doc(pedidoId)
 .onSnapshot(snap => {
 if (!snap.exists) {
 // Pedido eliminado
 cerrarTracking();
 localStorage.removeItem('mf_last_pedido');
 return;
 }
 const p = snap.data();
 actualizarTrackingUI(p, pedidoId);
 });
}

function actualizarTrackingUI(p, pedidoId) {
 const bar = document.getElementById('tracking-bar');
 if (!bar) return;
 // Si el tracking fue desactivado desde el admin, limpiar y no mostrar
 if (window._cfgTrackingActivo === false) { bar.innerHTML = ''; return; }

 if (p.estado === 'Entregado') {
 // Mostrar modal de OPINIÓN PÚBLICA si no se envió aún para este pedido
 const yaOpino = localStorage.getItem('mf_opinion_' + pedidoId);
 if (!yaOpino) {
 const fechaPedido = p.fecha ? (p.fecha.toDate ? p.fecha.toDate() : new Date(p.fecha)) : null;
 const minutosDesde = fechaPedido ? (Date.now() - fechaPedido.getTime()) / 60000 : 999;
 if (minutosDesde < 30) {
 // Verificar campo 'visible' en config de Firebase antes de abrir
 setTimeout(async () => {
 try {
 const cfgSnap = await window.db.collection('config_menu').doc('opiniones_config').get();
 const visible = cfgSnap.exists ? (cfgSnap.data()?.visible !== false) : true;
 if (visible && typeof abrirModalOpinion === 'function') {
 abrirModalOpinion();
 localStorage.setItem('mf_opinion_' + pedidoId, '1');
 }
 } catch(e) {
 // Si falla la config, mostrar igual
 if (typeof abrirModalOpinion === 'function') {
 abrirModalOpinion();
 localStorage.setItem('mf_opinion_' + pedidoId, '1');
 }
 }
 }, 2000);
 }
 }
 // Limpiar tracking después de 5 min
 setTimeout(() => {
 bar.innerHTML = '';
 localStorage.removeItem('mf_last_pedido');
 }, 120000); // 2 minutos
 }

 const idxActual = TRACKING_ESTADOS.findIndex(e => e.key === p.estado);
 const pasos = TRACKING_ESTADOS.map((e, i) => {
 let cls = i < idxActual ? 'done' : i === idxActual ? 'active' : '';
 return `<span class="tracking-step ${cls}">${e.emoji} ${e.label}</span>`;
 }).join('');

 // Si está cancelado, limpiar la pill
 if (p.estado === 'Cancelado') {
 bar.innerHTML = '';
 localStorage.removeItem('mf_last_pedido');
 if (trackingUnsubscribe) { trackingUnsubscribe(); trackingUnsubscribe = null; }
 renderPedidoEnCurso();
 return;
 }

 bar.innerHTML = `
 <div class="tracking-pill" onclick="abrirTrackingModal('${pedidoId}')"> <div class="tracking-dot"></div> <div style="flex:1;min-width:0;"> <div style="font-size:11px;font-weight:700;color:var(--primary);margin-bottom:4px;">TU PEDIDO · ${p.cliente}</div> <div class="tracking-steps" style="flex-wrap:wrap;">${pasos}</div> </div> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;opacity:.5"><polyline points="9 18 15 12 9 6"></polyline></svg> <button class="pill-close" onclick="event.stopPropagation();cerrarPillTemporal()" title="Minimizar"></button> </div>`;
 renderPedidoEnCurso();

 // Actualizar modal si está abierto
 if (document.getElementById('tracking-modal').classList.contains('open')) {
 renderTrackingModal(p);
 }
}

window.abrirTrackingModal = (pedidoId) => {
 const lastRaw = localStorage.getItem('mf_last_pedido');
 if (!lastRaw) return;
 const last = JSON.parse(lastRaw);
 db.collection("pedidos_v2").doc(pedidoId).get().then(snap => {
 if (!snap.exists) return;
 renderTrackingModal(snap.data());
 document.getElementById('tracking-modal').classList.add('open');
 });
};

function renderTrackingModal(p) {
 const idxActual = TRACKING_ESTADOS.findIndex(e => e.key === p.estado);

 document.getElementById('tracking-cliente').innerText = `Cliente: ${p.cliente} · ${p.tel}`;
 document.getElementById('tracking-sucursal').innerText = `${p.sucursal} · ${p.tipo} · ${p.horarioEstimado || ''}`;

 const progHtml = TRACKING_ESTADOS.map((e, i) => {
 const isDone = i < idxActual;
 const isActive = i === idxActual;
 const cirCls = isDone ? 'done' : isActive ? 'active' : '';
 const linCls = isDone ? 'done' : '';
 return `
 <div class="tp-item"><div class="tp-line-col"><div class="tp-circle ${cirCls}">${isDone ? '' : e.emoji}</div> ${i < TRACKING_ESTADOS.length - 1 ? `<div class="tp-vline ${linCls}"></div>` : ''}
 </div><div class="tp-content"><div class="tp-title" style="color:${isActive?'var(--primary)':isDone?'#10b981':'var(--text-light)'}">${e.label}</div> ${isActive ? `<div class="tp-time">En curso...</div>` : isDone ? `<div class="tp-time" style="color:#10b981">Completado</div>` : ''}
 </div></div>`;
 }).join('');

 document.getElementById('tracking-progress').innerHTML = progHtml;
 // Mostrar/ocultar el label ANULADO debajo del botón CERRAR
 const anuladoLabel = document.getElementById('tracking-anulado-label');
 if (anuladoLabel) {
 anuladoLabel.style.display = p.estado === 'Cancelado' ? 'block' : 'none';
 }

 const itemsHtml = (p.items || []).map(i => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dashed var(--border);font-size:13px;"><span style="color:var(--text-light);">${i.cant}x ${i.n}</span><span style="color:var(--white);font-weight:600;">$${(i.totalItem||0).toLocaleString('es-AR')}</span></div>`
 ).join('');
 document.getElementById('tracking-items').innerHTML = itemsHtml;
 document.getElementById('tracking-total').innerText = `Total: $${(p.total||0).toLocaleString('es-AR')}`;

 // Botón cancelar: solo si el pedido está Pendiente
 const cancelContainer = document.getElementById('tracking-cancel-container');
 if (cancelContainer) {
 const lastRaw = localStorage.getItem('mf_last_pedido');
 const pedidoId = lastRaw ? JSON.parse(lastRaw).id : null;
 const estadosCancelablesModal = ['Pendiente', 'Aceptado', 'Listo'];
 if (estadosCancelablesModal.includes(p.estado) && pedidoId) {
 const msgCancelModal = p.estado === 'Pendiente'
 ? 'Solo podés anular mientras el pedido no fue procesado'
 : p.estado === 'Aceptado'
 ? 'El pedido ya está en preparación'
 : 'El pedido está listo para envío';
 cancelContainer.innerHTML = `
 <button class="btn-cancelar-pedido" onclick="cancelarPedido('${pedidoId}')"> ANULAR PEDIDO
 </button> <p style="font-size:11px;color:var(--text-light);text-align:center;margin-top:6px;"> ${msgCancelModal}
 </p>`;
 } else if (p.estado === 'Cancelado') {
 cancelContainer.innerHTML = `
 <div style="text-align:center;padding:12px;background:rgba(239,68,68,0.1);border-radius:10px;border:1px solid rgba(239,68,68,0.3);"> <span style="color:#ef4444;font-weight:800;font-size:14px;"> Pedido cancelado</span> </div>`;
 } else {
 cancelContainer.innerHTML = '';
 }
 }
}

window.cerrarTracking = () => {
 document.getElementById('tracking-modal').classList.remove('open');
};

// Cierra la pill temporalmente (reaparece si hay actualización)
window.cerrarPillTemporal = () => {
 const bar = document.getElementById('tracking-bar');
 if (bar) bar.innerHTML = '';
};

// Cancela el pedido en Firebase
window.cancelarPedido = async (pedidoId) => {
 // Paso 1: pedir motivo de cancelacion
 const motivo = prompt('¿Por qué querés anular tu pedido?\nBreve descripción del motivo (obligatorio):');
 if (motivo === null) return;
 if (!motivo.trim()) {
 alert('Por favor ingresá un motivo para poder anular el pedido.');
 return;
 }
 if (!confirm('¿Confirmás que querés anular tu pedido? Esta acción no se puede deshacer.')) return;
 try {
 await db.collection('pedidos_v2').doc(pedidoId).update({
 estado: 'Cancelado',
 motivoCancelacion: motivo.trim()
 });
 cerrarTracking();
 const bar = document.getElementById('tracking-bar');
 if (bar) bar.innerHTML = '';
 localStorage.removeItem('mf_last_pedido');
 if (trackingUnsubscribe) { trackingUnsubscribe(); trackingUnsubscribe = null; }
 renderPedidoEnCurso();
 // Toast
 const t = document.getElementById('toast');
 if (t) { t.innerText = 'Pedido anulado'; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); }
 // Paso 2: invitar a dejar una opinión tras cancelar
 if (!localStorage.getItem('mf_opinion_' + pedidoId) && typeof abrirModalOpinion === 'function') {
 setTimeout(() => { abrirModalOpinion(pedidoId); localStorage.setItem('mf_opinion_' + pedidoId, '1'); }, 1500);
 }
 } catch(e) {
 alert('No se pudo cancelar el pedido. Comunicate con el local directamente.');
 }
};

// Muestra el pedido en curso en el tab-pedidos
function renderPedidoEnCurso() {
 const container = document.getElementById('pedido-en-curso-container');
 if (!container) return;
 const lastRaw = localStorage.getItem('mf_last_pedido');
 if (!lastRaw) { container.innerHTML = ''; return; }
 const last = JSON.parse(lastRaw);
 if (!last || !last.id || !window.db) { container.innerHTML = ''; return; }

 db.collection('pedidos_v2').doc(last.id).get().then(snap => {
 if (!snap.exists) { container.innerHTML = ''; return; }
 const p = snap.data();
 const estado = p.estado || 'Pendiente';
 if (estado === 'Entregado') {
 const yaReseno = localStorage.getItem('mf_opinion_' + last.id);
 if (!yaReseno) {
 container.innerHTML = `
 <div style="background:var(--surface);border:1px solid rgba(16,185,129,0.4);border-radius:16px;padding:20px;margin-bottom:16px;text-align:center;"> <div style="font-size:32px;margin-bottom:8px;color:#10b981;font-weight:800;">Pedido entregado</div> <p style="color:var(--text-light);font-size:13px;margin-bottom:16px;">Tu pedido fue entregado. Contanos como estuvo!</p> <button onclick="if(typeof abrirModalOpinion==='function'){abrirModalOpinion('${last.id}');localStorage.setItem('mf_opinion_${last.id}','1');}"
 style="width:100%;padding:14px;border-radius:12px;border:none;background:var(--primary);color:#000;font-weight:800;font-size:15px;cursor:pointer;"> Dejar mi opinión
 </button> </div>`;
 } else {
 container.innerHTML = '';
 }
 return;
 }

 const fecha = p.fecha ? (p.fecha.toDate ? p.fecha.toDate() : new Date(p.fecha)) : new Date();
 const horaStr = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
 const items = (p.items || []).map(i => `${i.cant}x ${i.n}`).join(', ');

 const estadosCancelablesPEC = ['Pendiente', 'Aceptado', 'Listo'];
 const puedeCancelar = estadosCancelablesPEC.includes(estado);
 const esCancelado = estado === 'Cancelado';

 container.innerHTML = `
 <div class="pedido-en-curso-card"> <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;"> <div style="font-size:13px;font-weight:800;color:var(--white);">PEDIDO EN CURSO</div> <span class="pec-estado ${estado}">${estado === 'Pendiente' ? ' ' : estado === 'Aceptado' ? ' ' : estado === 'Listo' ? ' ' : estado === 'Cancelado' ? ' ' : ' '}${estado}</span> </div> <div style="font-size:12px;color:var(--text-light);margin-bottom:4px;">Hora: ${horaStr} · ${p.sucursal || ''} · ${p.tipo || ''}</div> <div style="font-size:13px;color:var(--white);margin-bottom:12px;line-height:1.5;">${items}</div> <div style="font-size:16px;font-weight:800;color:var(--primary);margin-bottom:12px;">Total: $${(p.total||0).toLocaleString('es-AR')}</div> <div style="display:flex;gap:8px;"> <button onclick="abrirTrackingModal('${last.id}')"
 style="flex:1;padding:11px;border-radius:10px;background:var(--primary);border:none;color:#000;font-weight:800;font-size:13px;cursor:pointer;"> Ver detalle
 </button> ${puedeCancelar ? `
 <button onclick="cancelarPedido('${last.id}')"
 style="flex:1;padding:11px;border-radius:10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.4);color:#ef4444;font-weight:800;font-size:13px;cursor:pointer;"> ANULAR
 </button>` : ''}
 </div> ${esCancelado ? '<p style="text-align:center;color:#ef4444;font-size:12px;margin-top:8px;">Este pedido fue anulado</p>' : ''}
 </div>`;
 }).catch(() => { container.innerHTML = ''; });
}

// 5. SISTEMA DE RESEÑAS — usa el modal de opinión unificado

// 6. ESTADÍSTICAS DE VENTAS 
async function registrarVentaStats(items, total, sucursalId) {
 try {
 const hoy = new Date();
 const key = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
 const hora = hoy.getHours();
 // FIX: el doc del día es compartido por TODAS las sucursales.
 // Antes se guardaba { sucursal: string } a nivel raíz y el último pedido
 // pisaba el campo, mezclando datos de distintas sucursales.
 // Ahora cada venta lleva su sucursalId dentro del objeto, sin campo raíz.
 const ref = db.collection("stats_ventas").doc(key);
 await ref.set({
 fecha: key,
 ventas: firebase.firestore.FieldValue.arrayUnion({
 hora,
 total,
 sucursalId,                            // FIX: dentro del objeto, no a nivel raíz
 items: items.map(i => ({ id: i.id, n: i.n, cant: i.cant, precio: i.totalItem })),
 ts: Date.now()
 })
 }, { merge: true });
 } catch(e) { console.warn("Stats:", e); }
}


// Abrir/cerrar panel admin 
function abrirAdmin() {
  // CODE-SPLITTING: cargar Leaflet + adm-pin-system solo la primera vez que
  // se abre el panel admin. Para clientes regulares nunca se descargan (~180 KB).
  const _show = () => {
    const root = document.getElementById('admin-root');
    if (root) {
      root.classList.add('visible');
      root.style.display = 'block';
    }
    const heroSection = document.querySelector('.hero-slider');
    const menuSection = document.getElementById('menu-container');
    const bottomNav   = document.querySelector('.bottom-nav');
    if (heroSection) heroSection.style.display = 'none';
    if (menuSection) menuSection.style.display = 'none';
    if (bottomNav)   bottomNav.style.display   = 'none';
    document.title = 'Marvel Food | Admin';
    console.log('[Admin] Panel abierto');
  };

  if (typeof window._loadAdminAssets === 'function') {
    window._loadAdminAssets().then(_show);
  } else {
    _show();
  }
}

function cerrarAdmin() {
 const root = document.getElementById('admin-root');
 if (root) {
 root.classList.remove('visible');
 root.style.display = 'none';
 }
 const heroSection = document.querySelector('.hero-slider');
 const menuSection = document.getElementById('menu-container');
 const bottomNav = document.querySelector('.bottom-nav');
 if (heroSection) heroSection.style.display = 'flex';
 if (menuSection) menuSection.style.display = 'block';
 if (bottomNav) bottomNav.style.display = 'flex';
 document.title = 'Marvel Food | Tienda Online';
 window.location.hash = '';
}

window.addEventListener('DOMContentLoaded', function() {
 if (window.location.hash === '#admin' ||
 window.location.pathname.replace(/\/$/, '').endsWith('/admin')) {
 // Ocultar pantalla de bienvenida si está visible
 const ws = document.getElementById('welcome-screen');
 if (ws) ws.style.display = 'none';
 sessionStorage.setItem('mf_welcome_done', '1');
 abrirAdmin();
 }
});

window.addEventListener('hashchange', function() {
 if (window.location.hash === '#admin') {
 const ws = document.getElementById('welcome-screen');
 if (ws) ws.style.display = 'none';
 sessionStorage.setItem('mf_welcome_done', '1');
 abrirAdmin();
 }
});

// Admin Auth — Google Auth único factor
// PIN eliminado: el hash SHA-256 hardcodeado en el bundle era crackeable
// offline en segundos (espacio de búsqueda ~10^6). El acceso real lo
// controla firebase-config.js → _verificarRolConClaims() que verifica
// custom claims o el campo rol:'admin' en Firestore/usuarios/{uid}.
// _mfa_ok se setea aquí para que el heartbeat de más abajo lo detecte.
function admCheckPin() {
 const pf = document.getElementById('adm-pin-feedback');
 if (pf) { pf.textContent = 'Iniciando sesión con Google...'; pf.style.color = '#10b981'; }
 // Marcar sesión ANTES del popup para que el heartbeat no la invalide
 // mientras el popup de Google está abierto.
 sessionStorage.setItem('_mfa_ok', 'google-auth');
 if (typeof admGoogleLogin === 'function') {
   admGoogleLogin();
 } else {
   if (pf) { pf.textContent = 'Error: Firebase no cargó. Recargá la página.'; pf.style.color = '#ef4444'; }
   sessionStorage.removeItem('_mfa_ok');
 }
}


function admLogout() {
 sessionStorage.removeItem('_mfa_ok');
 if (confirm('¿Salir del panel admin?')) {
 cerrarAdmin();
 document.getElementById('adm-app').style.display = 'none';
 document.getElementById('adm-login-screen').style.display = 'flex';
 // FIX: el input correcto es 'adm-pin-input', no 'adm-pin' (que no existe en el DOM)
 const _pinInp = document.getElementById('adm-pin-input');
 if (_pinInp) _pinInp.value = '';
 // Cerrar sesión de Google si está activa
 if (typeof admGoogleLogout === 'function') admGoogleLogout();
 }
}

// ESTADO GLOBAL 
let admPedidos = [];
let admFiltroEst = 'Todos'; // filtro de estado/tipo
let admEditId = null;
let admUnsubscribe = null;

function admNumero(docId) { return docId.slice(-6).toUpperCase(); }

// FECHA 
function admFechaHoy() {
 const hoy = new Date();
 const yyyy = hoy.getFullYear();
 const mm = String(hoy.getMonth() + 1).padStart(2, '0');
 const dd = String(hoy.getDate()).padStart(2, '0');
 const el = document.getElementById('adm-fecha-filtro');
 if (el) { el.value = `${yyyy}-${mm}-${dd}`; }
}

function admGetFechaFiltro() {
 const val = document.getElementById('adm-fecha-filtro')?.value;
 if (!val) return null;
 const [y, m, d] = val.split('-').map(Number);
 const inicio = new Date(y, m - 1, d, 0, 0, 0);
 const fin = new Date(y, m - 1, d, 23, 59, 59);
 return { inicio, fin };
}

// LISTENER FIREBASE 
let _admModoHistorial = false; // true = sin filtro de fecha, carga todo

function admIniciar() {
 if (admUnsubscribe) admUnsubscribe();

 const rango = _admModoHistorial ? null : admGetFechaFiltro();
 const btnTodo = document.getElementById('btn-todo-historial');

 let query;
 if (rango) {
 // Consulta con rango de fecha
 // FIX: segunda cláusula era ">=rango.inicio" duplicado — debe ser "<=rango.fin"
 query = db.collection("pedidos_v2")
 .where("fecha", ">=", rango.inicio)
 .where("fecha", "<=", rango.fin);
 } else if (_admModoHistorial) {
 // Todo el historial — sin límite de fecha, limit alto
 query = db.collection("pedidos_v2").orderBy("fecha", "desc").limit(2000);
 if (btnTodo) { btnTodo.style.background='rgba(99,102,241,0.4)'; btnTodo.style.color='#fff'; btnTodo.textContent='Historial completo'; }
 } else {
 // Sin fecha seleccionada — carga del día
 query = db.collection("pedidos_v2").orderBy("fecha", "desc").limit(500);
 }

 const procesar = snap => {
 admPedidos = [];
 snap.forEach(doc => admPedidos.push({ id: doc.id, ...doc.data() }));
        // Ordenar por fecha desc en memoria (evita índice compuesto con where+orderBy)
        admPedidos.sort((a, b) => {
          const fa = a.fecha ? (a.fecha.toMillis ? a.fecha.toMillis() : new Date(a.fecha).getTime()) : 0;
          const fb = b.fecha ? (b.fecha.toMillis ? b.fecha.toMillis() : new Date(b.fecha).getTime()) : 0;
          return fb - fa;
        });
 // Detectar pedidos nuevos y notificar sistema externo
 if (typeof _integProcesarSnapshot === 'function') _integProcesarSnapshot(admPedidos);
 admRenderPedidos();
 admActualizarStats();
 const el = document.getElementById('adm-last-update');
 if (el) {
 const txt = _admModoHistorial ? `Historial: ${admPedidos.length} pedidos` : new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
 el.innerText = txt;
 }
 };

 admUnsubscribe = query.onSnapshot(procesar, err => {
 console.warn('Query con fecha falló, usando fallback:', err.message);
 admUnsubscribe = db.collection("pedidos_v2")
 .orderBy("fecha", "desc").limit(500)
 .onSnapshot(procesar, err2 => {
   console.error('[admIniciar] Fallback también falló:', err2.message);
 });
 });
}

window.admVerTodoHistorial = function() {
 // Toggle modo historial
 _admModoHistorial = !_admModoHistorial;
 const btnTodo = document.getElementById('btn-todo-historial');
 const fechaInp = document.getElementById('adm-fecha-filtro');
 if (_admModoHistorial) {
 if (fechaInp) fechaInp.value = ''; // limpiar filtro fecha
 if (btnTodo) { btnTodo.style.background='rgba(99,102,241,0.4)'; btnTodo.style.color='#fff'; btnTodo.textContent='Historial activo'; }
 } else {
 if (btnTodo) { btnTodo.style.background='rgba(99,102,241,0.15)'; btnTodo.style.color='#a5b4fc'; btnTodo.textContent='Todo'; }
 admFechaHoy(); // volver a hoy
 }
 admIniciar();
};

function admAplicarFiltros() {
 if (_admModoHistorial) _admModoHistorial = false; // salir de modo historial al filtrar por fecha
 const btnTodo = document.getElementById('btn-todo-historial');
 if (btnTodo) { btnTodo.style.background='rgba(99,102,241,0.15)'; btnTodo.style.color='#a5b4fc'; btnTodo.textContent='Todo'; }
 admIniciar();
}

// STATS 
function admActualizarStats() {
 const lista = admPedidosFiltrados();
 const g = id => document.getElementById(id);
 if (!g('adm-s-pend')) return;
 g('adm-s-pend').innerText = admPedidos.filter(p => p.estado === 'Pendiente').length;
 g('adm-s-acep').innerText = admPedidos.filter(p => p.estado === 'Aceptado').length;
 g('adm-s-list').innerText = admPedidos.filter(p => p.estado === 'Listo').length;
 g('adm-s-total').innerText = admPedidos.length;
 const _pedValidosStat = window._filtrarPedidosParaMetricas ? window._filtrarPedidosParaMetricas(admPedidos) : admPedidos;
 g('adm-s-cash').innerText = '$' + _pedValidosStat.reduce((a, p) => a + (p.total || 0), 0).toLocaleString('es-AR');
}

// FILTROS 
function admFiltroEstado(f, btn) {
 admFiltroEst = f;
 document.querySelectorAll('.adm-filter-btn[data-f]').forEach(b => b.classList.remove('active'));
 if (btn) btn.classList.add('active');
 admRenderPedidos();
}

// MEJORA 5 — Exportación de pedidos a CSV
window.admExportarCSV = function() {
  const lista = admPedidosFiltrados();
  if (!lista.length) return alert('No hay pedidos para exportar.');
  let csv = 'Pedido,Cliente,Tel,Fecha,Sucursal,Tipo,Estado,Total,Items\n';
  lista.forEach(p => {
    const items = (p.items || []).map(i => `${i.cant}x ${i.n}`).join(' | ');
    const cliente = (p.cliente || '').replace(/,/g, ' ');
    const tel = (p.tel || '').replace(/,/g, ' ');
    const sucursal = (p.sucursal || '').replace(/,/g, ' ');
    csv += `${admNumero(p.id)},${cliente},${tel},${admFmt(p.fecha)},${sucursal},${p.tipo||''},${p.estado||''},${p.total||0},"${items}"\n`;
  });
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `pedidos_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

function admPedidosFiltrados() {
 let lista = [...admPedidos];

 // Filtro sucursal
 // sucursalId es el ID corto exacto ("Centro","Norte","Sur","Funes","Cafferata").
 // Fallback para pedidos históricos sin sucursalId: mapear por fragmento de dirección.
 const _SUC_FALLBACK = {
   Centro: ['PELLEGRINI','Pellegrini','pellegrini'],
   Norte: ['Rondeau','rondeau'],
   Sur: ['San Martin','san martin','Martin','VGG','Sur'],
   Funes: ['Funes','funes','RN9'],
   Cafferata: ['Cafferata','cafferata'],
 };
 const sucVal = document.getElementById('adm-suc-filtro')?.value || '';
 if (sucVal) {
   lista = lista.filter(p => {
     if (p.sucursalId) return p.sucursalId === sucVal;
     // fallback para pedidos históricos
     const dir = p.sucursal || '';
     return (_SUC_FALLBACK[sucVal] || []).some(kw => dir.includes(kw));
   });
 }

 // Filtro estado/tipo
 if (admFiltroEst !== 'Todos') {
 lista = lista.filter(p => p.estado === admFiltroEst || p.tipo === admFiltroEst);
 }

 return lista;
}

// RENDER 
function admRenderPedidos() {
 const cont = document.getElementById('adm-orders');
 if (!cont) return;
 // Auto-actualizar dashboard si está visible
 const dashTab = document.getElementById('adm-tab-dashboard');
 if (dashTab && dashTab.style.display !== 'none') {
 setTimeout(admCargarDashboard, 100);
 }
 // Auto-actualizar codigos si está visible (para usos del día)
 const codsTab = document.getElementById('adm-tab-codigos');
 if (codsTab && codsTab.style.display !== 'none') {
 setTimeout(admCargarCodigos, 150);
 }
 const lista = admPedidosFiltrados();

 if (!lista.length) {
 cont.innerHTML = '<div class="adm-empty"><span></span>No hay pedidos para este filtro.</div>';
 return;
 }

 // Agrupar por sucursal — usar sucursalId para el key y mostrar nombre legible
 const _NOMBRE_SUC = {
   Centro: 'Centro — Pellegrini 1149',
   Norte: 'Norte — Rondeau 2430',
   Sur: 'Sur / VGG — San Martin 1808',
   Funes: 'Funes — RN9 972',
   Cafferata: 'Cafferata — Cafferata y Urquiza',
 };
 const grupos = {};
 lista.forEach(p => {
   // Usar sucursalId como clave si existe; sino derivar desde la dirección para pedidos históricos
   let key = p.sucursalId || '';
   if (!key) {
     const dir = p.sucursal || '';
     if (dir.includes('PELLEGRINI') || dir.includes('Pellegrini')) key = 'Centro';
     else if (dir.includes('Rondeau')) key = 'Norte';
     else if (dir.includes('Martin') || dir.includes('VGG')) key = 'Sur';
     else if (dir.includes('Funes') || dir.includes('RN9')) key = 'Funes';
     else if (dir.includes('Cafferata')) key = 'Cafferata';
     else key = dir || 'Sin sucursal';
   }
   if (!grupos[key]) grupos[key] = [];
   grupos[key].push(p);
 });

 let html = '';
 for (const [suc, pedidos] of Object.entries(grupos)) {
 const totalSuc = pedidos.reduce((a, p) => a + (p.total || 0), 0);
 const sucLabel = _NOMBRE_SUC[suc] || suc;
 html += `
 <div class="adm-suc-header"><div><span style="font-weight:800;font-size:14px;color:var(--primary);">${sucLabel}</span><span style="color:#9ca3af;font-size:11px;margin-left:10px;">${pedidos.length} pedido${pedidos.length !== 1 ? 's' : ''}</span></div><span style="font-weight:800;color:#10b981;font-size:13px;">$${totalSuc.toLocaleString('es-AR')}</span></div>`;
 html += pedidos.map(p => admRenderCard(p)).join('');
 }
 cont.innerHTML = html;
}

function admFmt(ts) {
 if (!ts) return '—';
 const d = ts.toDate ? ts.toDate() : new Date(ts);
 return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function admRenderCard(p) {
 const esDel = p.tipo === 'Delivery';
 const num = admNumero(p.id);
 const res = (p.items || []).map(i => `${i.cant}x ${i.n}`).join(', ');

 // FIX: strings deben coincidir EXACTAMENTE con SUC_MAP[x].n para que el
 // filtro "MOVER A" funcione correctamente (antes 'RN9 972,Funes ' tenía
 // coma sin espacio y trailing space, causando que Funes nunca se filtrara).
 const SUCURSALES_OPTS = [
 'PELLEGRINI 1149, Rosario Centro',
 'Rondeau 2430, Rosario Norte',
 'San Martin 1808, Rosario Sur',
 'RN9 972, Funes'
 ];
 const otrosSuc = SUCURSALES_OPTS.filter(s => s !== p.sucursal);
 const moverOpts = otrosSuc.map(s => {
 const label = s.includes('PELLEGRINI') ? 'Centro' : s.includes('Rondeau') ? 'Norte' : s.includes('Martin') ? 'Sur' : 'Funes';
 return `<option value="${s}">→ ${label}</option>`;
 }).join('');

 const btnEstado = p.estado === 'Pendiente'
 ? `<button class="adm-btn bv" onclick="admCambiarEstado('${p.id}','Aceptado')">Aceptar</button>`
 : p.estado === 'Aceptado'
 ? `<button class="adm-btn bl" onclick="admCambiarEstado('${p.id}','Listo')">Listo</button>`
 : p.estado === 'Listo'
 ? `<button class="adm-btn be" onclick="admCambiarEstado('${p.id}','Entregado')">Entregado</button>`
 : '';

 return `
 <div class="adm-card e-${p.estado}" id="admc-${p.id}"><div class="adm-card-hdr" onclick="admToggle('${p.id}')"><div style="flex:1;min-width:0;"><div class="adm-num">#${num} · ${admFmt(p.fecha)} · ${esDel ? 'Delivery' : 'Retiro'}</div><div class="adm-cliente">${p.cliente || '—'}</div><div class="adm-resumen">${res}</div><div style="font-size:11px;color:#60a5fa;font-weight:700;margin-top:3px;letter-spacing:.3px;">${p.tel ? 'Tel: ' + p.tel : ''}</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;"><span class="adm-badge e-${p.estado}">${p.estado}</span><span style="font-weight:800;font-size:15px;color:var(--primary)">$${(p.total || 0).toLocaleString('es-AR')}</span></div></div><div class="adm-card-body" id="admb-${p.id}"><div style="padding-top:12px;"><div class="adm-irow"><span class="l">Teléfono</span><span class="v">${p.tel || '—'}</span></div><div class="adm-irow"><span class="l">Sucursal</span><span class="v">${p.sucursal || '—'}</span></div> ${esDel ? `
 <div class="adm-irow"><span class="l">Dirección</span><span class="v">${p.dir || '—'} ${p.piso || ''}</span></div><div class="adm-irow"><span class="l">Localidad</span><span class="v">${p.loc || '—'}</span></div><div class="adm-irow"><span class="l">Franja horaria</span><span class="v" style="color:var(--primary)"> ${p.horarioEstimado || '—'}</span></div> ` : `
 <div class="adm-irow"><span class="l">Hora retiro</span><span class="v" style="color:var(--primary)"> ${p.horarioEstimado || '—'}</span></div> `}
 <div class="adm-irow"><span class="l">Pago</span><span class="v">${p.pago || '—'}</span></div> ${p.cuponUsado && p.cuponUsado !== 'Ninguno' ? `<div class="adm-irow"><span class="l">Cupón</span><span class="v" style="color:#10b981">${p.cuponUsado}</span></div>` : ''}
 ${p.codigoInterno ? `<div class="adm-irow"><span class="l">Código</span><span class="v" style="color:#a78bfa;font-family:monospace;font-weight:800;">${p.codigoInterno.codigo} <span style="font-family:sans-serif;font-weight:400;color:#9ca3af;">— ${p.codigoInterno.nombre}</span></span></div>` : ''}
 ${p.gps && p.gps !== 'No provisto' ? `<div class="adm-irow"><span class="l">GPS</span><span class="v"><a href="http://maps.google.com/maps?q=${p.gps}" target="_blank" style="color:#3b82f6">Ver mapa</a></span></div>` : ''}
 ${p.obs ? `<div class="adm-irow"><span class="l">Obs.</span><span class="v">${p.obs}</span></div>` : ''}

 <div style="margin:10px 0 4px;font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;">Productos</div> ${(p.items || []).map(i => `
 <div class="adm-item"><div style="flex:1;"><div class="in">${i.cant}x ${i.n}</div> ${i.sin && i.sin.length ? `<div class="ix">Sin: ${i.sin.join(', ')}</div>` : ''}
 ${i.con && i.con.length ? `<div class="ix" style="color:#f59e0b;">Extras: ${i.con.map(x => x.n+' +$'+((x.p||0)*i.cant).toLocaleString('es-AR')).join(' · ')}</div>` : ''}
 ${i.obs ? `<div class="ix"> ${i.obs}</div>` : ''}
 </div><span class="ip">$${(i.totalItem || 0).toLocaleString('es-AR')}</span></div>`).join('')}

 <div style="background:#111;border-radius:9px;padding:10px 12px;margin:10px 0;"><div class="adm-irow"><span class="l">Subtotal</span><span class="v">$${(p.subtotal || 0).toLocaleString('es-AR')}</span></div> ${p.envio ? `<div class="adm-irow"><span class="l">Envío</span><span class="v">$${(p.envio || 0).toLocaleString('es-AR')}</span></div>` : ''}
 ${p.descuento ? `<div class="adm-irow"><span class="l">Descuento</span><span class="v" style="color:#10b981">-$${p.descuento.toLocaleString('es-AR')}</span></div>` : ''}
 <div class="adm-irow" style="border-top:1px solid #333;margin-top:5px;padding-top:7px;"><span style="font-weight:800;font-size:14px;">TOTAL</span><span style="font-weight:800;font-size:18px;color:var(--primary)">$${(p.total || 0).toLocaleString('es-AR')}</span></div></div><!-- Acciones principales --><div class="adm-actions"> ${btnEstado}
 <button class="adm-btn bw" onclick="admWhatsapp('${p.id}')">WA</button><button class="adm-btn bc" onclick="admEditar('${p.id}')">Editar</button><button class="adm-btn bp" onclick="admImprimir('${p.id}')">Imprimir</button><button class="adm-btn" onclick="admEliminar('${p.id}')" style="background:#ef4444;color:#fff;border:1px solid #ef4444;font-weight:800;">Eliminar</button></div><!-- Mover a sucursal --><div style="display:flex;align-items:center;gap:8px;margin-top:8px;"><span style="color:#9ca3af;font-size:11px;font-weight:700;white-space:nowrap;">MOVER A:</span><select id="adm-mover-${p.id}" class="adm-date-inp" style="flex:1;"><option value="">Seleccioná sucursal...</option> ${moverOpts}
 </select><button onclick="admMover('${p.id}')" style="background:rgba(59,130,246,.2);border:1px solid #3b82f6;color:#3b82f6;padding:7px 12px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap;">↗ MOVER</button></div></div></div></div>`;
}

function admToggle(id) {
 const b = document.getElementById('admb-' + id);
 if (b) b.classList.toggle('open');
}

// CAMBIAR ESTADO 
async function admCambiarEstado(id, estado) {
 try {
 await db.collection("pedidos_v2").doc(id).update({ estado });
 // Notificar sistema externo con el pedido actualizado
 const p = admPedidos.find(x => x.id === id);
 if (p) _integNotificar('estado_cambiado', { ...p, estado });
 // Tarea 4: auto-imprimir al Aceptar si está configurado
 if (estado === 'Aceptado') {
 const cfg = _integGetConfig();
 if (cfg.autoImprimir) {
 setTimeout(() => admImprimir(id), 400);
 }
 }
 }
 catch (e) { alert("Error: " + e.message); }
}

// Tarea 4: cancelar pedido con motivo (admin) + WhatsApp al cliente
async function admCancelarConMotivo(id) {
 const p = admPedidos.find(x => x.id === id);
 const nombre = p ? p.cliente : id;
 const motivo = prompt('Motivo del rechazo/cancelación del pedido de ' + nombre + ':');
 if (motivo === null) return; // Admin presionó cancelar
 if (!motivo.trim()) {
 alert('Ingresá un motivo para poder cancelar el pedido.');
 return;
 }
 try {
 await db.collection("pedidos_v2").doc(id).update({
 estado: 'Cancelado',
 motivoCancelacion: motivo.trim(),
 canceladoPor: 'admin'
 });
 // Notificar al sistema externo
 if (p) _integNotificar('estado_cambiado', { ...p, estado: 'Cancelado', motivoCancelacion: motivo.trim() });
 // Enviar WhatsApp al cliente informando la cancelación y el motivo
 if (p && p.tel) {
 const tel = p.tel.replace(/\D/g, '');
 const num = tel.startsWith('54') ? tel : '549' + tel;
 const msgWa = '*¡Hola ' + (p.cliente || '') + '! MARVEL FOOD*%0A'
 + 'Tu pedido *#' + admNumero(id) + '* fue *CANCELADO*.%0A'
 + '*Motivo:* ' + encodeURIComponent(motivo.trim()) + '%0A%0A'
 + 'Disculpá los inconvenientes. Podés contactarnos para más info.';
 window.open('https://wa.me/' + num + '?text=' + msgWa, '_blank');
 }
 } catch(e) { alert('Error al cancelar: ' + e.message); }
}
window.admCancelarConMotivo = admCancelarConMotivo;

// ELIMINAR PEDIDO 
async function admEliminar(id) {
 const p = admPedidos.find(x => x.id === id);
 const nombre = p ? p.cliente : id;
 if (!confirm(`¿Eliminar el pedido de ${nombre}? Esta acción no se puede deshacer.`)) return;
 try {
 await db.collection("pedidos_v2").doc(id).delete();
 } catch (e) { alert("Error al eliminar: " + e.message); }
}

// LIMPIAR DÍA 
async function admLimpiarDia() {
 const rango = admGetFechaFiltro();
 const sucVal = document.getElementById('adm-suc-filtro')?.value || '';

 let msg = '¿Eliminar TODOS los pedidos';
 if (rango) {
 const d = document.getElementById('adm-fecha-filtro').value;
 msg += ` del día ${d}`;
 }
 if (sucVal) msg += ` de sucursal ${sucVal}`;
 msg += '? Esta acción no se puede deshacer.';

 if (!confirm(msg)) return;

 const lista = admPedidosFiltrados();
 if (!lista.length) return alert('No hay pedidos para eliminar con el filtro actual.');

 try {
 // Firebase permite máx 500 ops por batch
 const batch = db.batch();
 lista.forEach(p => {
 batch.delete(db.collection("pedidos_v2").doc(p.id));
 });
 await batch.commit();
 alert(`OK: ${lista.length} pedido${lista.length !== 1 ? 's' : ''} eliminado${lista.length !== 1 ? 's' : ''}.`);
 } catch (e) { alert("Error: " + e.message); }
}

// ARCHIVADO AUTOMÁTICO DE PEDIDOS VIEJOS ────────────────────────────────────
// Se ejecuta silenciosamente cada vez que el admin abre el panel.
// Mueve a `pedidos_archivo` los pedidos Entregado/Cancelado con más de
// DIAS_RETENTION días.
//
// NOTA: se consulta solo por `fecha` (índice simple ya existente) y se filtra
// el estado en memoria. Esto evita el índice compuesto (estado + fecha) que
// Firestore requeriría si se combinaran ambos .where() en la query.
(function _registrarArchivarViejos() {
  const DIAS_RETENTION   = 7;
  const ESTADOS_FINALES  = new Set(['Entregado', 'Cancelado']);
  const BATCH_MAX        = 400;
  let _archivandoEnCurso = false;

  window.admArchivarViejos = async function(silencioso) {
    if (!window.db || _archivandoEnCurso) return;
    _archivandoEnCurso = true;

    const corte = new Date(Date.now() - DIAS_RETENTION * 864e5);
    let totalMovidos = 0;

    try {
      // Un solo .where sobre `fecha` — usa el índice simple existente.
      // El filtro por estado se aplica en JS para evitar índice compuesto.
      const snap = await db.collection('pedidos_v2')
        .where('fecha', '<', corte)
        .limit(BATCH_MAX)
        .get();

      if (!snap.empty) {
        const batch = db.batch();
        let enBatch = 0;

        snap.forEach(docSnap => {
          const datos = docSnap.data();
          if (!ESTADOS_FINALES.has(datos.estado)) return; // ignorar Pendiente/En camino/etc.

          const dstRef = db.collection('pedidos_archivo').doc(docSnap.id);
          batch.set(dstRef, {
            ...datos,
            _archivedAt:   firebase.firestore.FieldValue.serverTimestamp(),
            _archivedFrom: 'pedidos_v2',
          });
          batch.delete(db.collection('pedidos_v2').doc(docSnap.id));
          enBatch++;
        });

        if (enBatch > 0) {
          await batch.commit();
          totalMovidos += enBatch;
          console.log(`[Archivado] ${enBatch} pedidos archivados.`);
        }
      }

      if (totalMovidos > 0 && !silencioso) {
        const t = document.getElementById('toast');
        if (t) {
          t.innerText = `🗂 ${totalMovidos} pedido(s) viejos archivados automáticamente.`;
          t.classList.add('show');
          setTimeout(() => t.classList.remove('show'), 4000);
        }
      }
    } catch(e) {
      console.warn('[Archivado] Error al archivar pedidos:', e.message);
    } finally {
      _archivandoEnCurso = false;
    }
  };
})();

// MOVER SUCURSAL 
async function admMover(id) {
 const sel = document.getElementById('adm-mover-' + id);
 if (!sel || !sel.value) return alert('Seleccioná una sucursal destino.');
 const nuevaSuc = sel.value;
 const p = admPedidos.find(x => x.id === id);
 if (!p) return;
 if (!confirm(`¿Mover el pedido de ${p.cliente} a "${nuevaSuc}"?`)) return;
 try {
 await db.collection("pedidos_v2").doc(id).update({ sucursal: nuevaSuc });
 sel.value = '';
 } catch (e) { alert("Error: " + e.message); }
}

// 
// SISTEMA DE INTEGRACIÓN EXTERNA 
// Conecta cada evento del sistema de pedidos con un servicio
// externo (POS, KDS, pantalla de cocina, Zapier, n8n, etc.)
// Configuración persistida en localStorage para sobrevivir recargas.
// 

// Configuración persistida 
const _INTEG_KEY = 'mf_integ_config_v1';

function _integGetConfig() {
 try { return JSON.parse(localStorage.getItem(_INTEG_KEY) || '{}'); } catch { return {}; }
}
function _integSaveConfig(cfg) {
 try { localStorage.setItem(_INTEG_KEY, JSON.stringify(cfg)); } catch(e) {}
}

// Notificador principal 
// evento: 'nuevo_pedido' | 'estado_cambiado' | 'pedido_editado'
// payload: objeto con los datos del pedido + evento
async function _integNotificar(evento, pedido) {
 const cfg = _integGetConfig();
 if (!cfg.habilitado) return;

 const payload = {
 evento,
 source: 'marvel_food',
 timestamp: new Date().toISOString(),
 pedido_id: pedido.id,
 numero: pedido.id ? pedido.id.slice(-6).toUpperCase() : '—',
 cliente: pedido.cliente || '',
 tel: pedido.tel || '',
 sucursal: pedido.sucursal || '',
 tipo: pedido.tipo || '',
 estado: pedido.estado || '',
 total: pedido.total || 0,
 subtotal: pedido.subtotal || 0,
 envio: pedido.envio || 0,
 descuento: pedido.descuento || 0,
 pago: pedido.pago || '',
 vuelto: pedido.vuelto || 0,
 horario: pedido.horarioEstimado || '',
 dir: pedido.dir || '',
 loc: pedido.loc || '',
 piso: pedido.piso || '',
 gps: pedido.gps || '',
 items: pedido.items || [],
 cupon: pedido.cuponUsado || 'Ninguno',
 codigoInterno: pedido.codigoInterno || null,
 obs: pedido.obs || ''
 };

 // Webhook HTTP 
 if (cfg.webhookUrl) {
 try {
 const headers = { 'Content-Type': 'application/json' };
 if (cfg.webhookSecret) headers['X-Marvel-Secret'] = cfg.webhookSecret;
 const resp = await fetch(cfg.webhookUrl, {
 method: 'POST',
 headers,
 body: JSON.stringify(payload),
 signal: AbortSignal.timeout(8000)
 });
 _integLog(` Webhook [${evento}] → ${resp.status}`);
 } catch (err) {
 _integLog(` Webhook error [${evento}]: ${err.message}`);
 }
 }

 // Auto-imprimir al Aceptar 
 if (cfg.autoImprimir && evento === 'estado_cambiado' && pedido.estado === 'Aceptado') {
 setTimeout(() => admImprimir(pedido.id), 400);
 }

 // Auto-WhatsApp al Aceptar 
 if (cfg.autoWsp && evento === 'estado_cambiado' && pedido.estado === 'Aceptado') {
 setTimeout(() => admWhatsapp(pedido.id), 800);
 }

 // Sistema Propio: enviar tambien al endpoint propio si configurado 
 if (cfg.propioUrl && (!cfg.propioSoloNuevos || evento === 'nuevo_pedido')) {
 try {
 const propioHeaders = { 'Content-Type': 'application/json' };
 const authHeader = cfg.propioAuthHeader || 'X-Marvel-Secret';
 if (cfg.propioSecret) {
 propioHeaders[authHeader] = authHeader === 'Authorization'
 ? 'Bearer ' + cfg.propioSecret
 : cfg.propioSecret;
 }
 const propioResp = await fetch(cfg.propioUrl, {
 method: 'POST',
 headers: propioHeaders,
 body: JSON.stringify(payload),
 signal: AbortSignal.timeout(8000)
 });
 _integLog('Sistema propio [' + evento + '] -> ' + propioResp.status);
 } catch (propioErr) {
 _integLog('Sistema propio error [' + evento + ']: ' + propioErr.message);
 }
 }

 // Notificacion de sonido 
 if (cfg.sonido && evento === 'nuevo_pedido') {
 try {
 const ctx = new (window.AudioContext || window.webkitAudioContext)();
 [523.25, 659.25, 783.99].forEach((freq, i) => {
 const osc = ctx.createOscillator();
 const gain = ctx.createGain();
 osc.connect(gain); gain.connect(ctx.destination);
 osc.frequency.value = freq;
 osc.type = 'sine';
 gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
 gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4);
 osc.start(ctx.currentTime + i * 0.15);
 osc.stop(ctx.currentTime + i * 0.15 + 0.4);
 });
 } catch(e) {}
 }
}

// Log circular para diagnóstico 
const _integLogs = [];
function _integLog(msg) {
 _integLogs.unshift(`[${new Date().toLocaleTimeString('es-AR')}] ${msg}`);
 if (_integLogs.length > 50) _integLogs.pop();
 const el = document.getElementById('integ-log-body');
 if (el) el.innerHTML = _integLogs.map(l => `<div style="font-size:11px;padding:3px 0;border-bottom:1px solid #222;color:${l.includes('')?'#ef4444':l.includes('')?'#10b981':'#9ca3af'}">${l}</div>`).join('');
}

// Detector de pedidos NUEVOS en el snapshot 
// Compara el snapshot anterior con el nuevo para disparar 'nuevo_pedido'
let _integPedidosConocidos = new Set();
function _integProcesarSnapshot(pedidos) {
 const cfg = _integGetConfig();
 if (!cfg.habilitado) { _integPedidosConocidos = new Set(pedidos.map(p => p.id)); return; }
 pedidos.forEach(p => {
 if (!_integPedidosConocidos.has(p.id)) {
 _integNotificar('nuevo_pedido', p);
 // Tarea 3: mostrar toast visual de nuevo pedido en admin
 _admMostrarToastNuevoPedido(p);
 }
 });
 _integPedidosConocidos = new Set(pedidos.map(p => p.id));
}

// Tarea 3: Toast flotante con acciones rápidas para nuevo pedido
function _admMostrarToastNuevoPedido(p) {
 const num = admNumero(p.id);
 const cliente = p.cliente || 'Sin nombre';
 const toastId = 'adm-toast-' + p.id;
 if (document.getElementById(toastId)) return; // ya mostrado

 // Crear contenedor de toasts si no existe
 let wrapper = document.getElementById('adm-toasts-wrapper');
 if (!wrapper) {
 wrapper = document.createElement('div');
 wrapper.id = 'adm-toasts-wrapper';
 wrapper.style.cssText = 'position:fixed;top:80px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:10px;max-width:320px;';
 document.body.appendChild(wrapper);
 }

 const toast = document.createElement('div');
 toast.id = toastId;
 toast.style.cssText = 'background:#1a1a2e;border:2px solid #f59e0b;border-radius:14px;padding:14px 16px;box-shadow:0 8px 32px rgba(0,0,0,0.6);animation:admToastIn 0.3s ease;';
 toast.innerHTML = `
 <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;"> <div> <div style="font-size:10px;font-weight:800;color:#f59e0b;letter-spacing:1px;margin-bottom:2px;"> NUEVO PEDIDO</div> <div style="font-size:14px;font-weight:800;color:#fff;">Orden #${num}</div> <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${cliente}</div> </div> <button onclick="this.closest('#${toastId}').remove()" style="background:none;border:none;color:#6b7280;font-size:18px;cursor:pointer;padding:0;line-height:1;">&times;</button> </div> <div style="display:flex;gap:6px;"> <button onclick="admCambiarEstado('${p.id}','Aceptado');document.getElementById('${toastId}')?.remove();"
 style="flex:1;padding:8px 4px;border-radius:8px;background:#10b981;border:none;color:#fff;font-weight:800;font-size:11px;cursor:pointer;"> Aceptar
 </button> <button onclick="admCancelarConMotivo('${p.id}');document.getElementById('${toastId}')?.remove();"
 style="flex:1;padding:8px 4px;border-radius:8px;background:#ef4444;border:none;color:#fff;font-weight:800;font-size:11px;cursor:pointer;"> Cancelar
 </button> <button onclick="admMoverDesdeToast('${p.id}');document.getElementById('${toastId}')?.remove();"
 style="flex:1;padding:8px 4px;border-radius:8px;background:rgba(59,130,246,0.2);border:1px solid #3b82f6;color:#3b82f6;font-weight:800;font-size:11px;cursor:pointer;"> ↗ Sucursal
 </button> </div> `;
 wrapper.prepend(toast);

 // Auto-cerrar tras 30 segundos
 setTimeout(() => { if (toast.parentNode) toast.remove(); }, 30000);
}

// Abre el select de mover dentro del card del pedido y hace scroll hasta él
function admMoverDesdeToast(id) {
 const sel = document.getElementById('adm-mover-' + id);
 if (sel) {
 sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
 sel.focus();
 } else {
 alert('Buscá el pedido en la lista para moverlo de sucursal.');
 }
}

// CSS de animación para los toasts
(function() {
 if (document.getElementById('adm-toast-style')) return;
 const s = document.createElement('style');
 s.id = 'adm-toast-style';
 s.textContent = '@keyframes admToastIn { from { opacity:0; transform:translateX(60px); } to { opacity:1; transform:translateX(0); } }';
 document.head.appendChild(s);
})();

// Exponer para que admIniciar lo llame 
window._integProcesarSnapshot = _integProcesarSnapshot;

// UI: Tab "Integración" del panel admin 
function _integRenderTab() {
 const cfg = _integGetConfig();
 const el = document.getElementById('adm-tab-integracion');
 if (!el) return;
 el.innerHTML = `
 <div style="padding:20px;"> <h3 style="color:var(--primary);font-weight:800;font-size:16px;margin-bottom:4px;">INTEGRACIÓN EXTERNA</h3> <p style="color:#9ca3af;font-size:12px;margin-bottom:14px;">Conectá Marvel Food con sistemas externos: POS, KDS, Zapier, n8n, o tu propio sistema de gestión.</p> <!-- Sub-tabs --> <div style="display:flex;gap:8px;margin-bottom:18px;border-bottom:1px solid var(--border);padding-bottom:14px;"> <button id="integ-tab-webhook" onclick="integSwitchSubTab('webhook')"
 style="flex:1;padding:9px;border-radius:10px;border:1px solid var(--primary);background:rgba(245,158,11,.15);color:var(--primary);font-weight:800;font-size:12px;cursor:pointer;"> Webhook / API
 </button> <button id="integ-tab-propio" onclick="integSwitchSubTab('propio')"
 style="flex:1;padding:9px;border-radius:10px;border:1px solid var(--border);background:transparent;color:#9ca3af;font-weight:800;font-size:12px;cursor:pointer;"> Sistema Propio
 </button> </div> <!-- Contenido Webhook --> <div id="integ-panel-webhook"> <!-- Estado --> <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:16px;"> <div> <div style="font-weight:800;color:var(--white);font-size:14px;">Sistema de integración</div> <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Activa/desactiva todas las notificaciones externas</div> </div> <label style="position:relative;display:inline-block;width:48px;height:26px;cursor:pointer;"> <input type="checkbox" id="integ-habilitado" ${cfg.habilitado ? 'checked' : ''} onchange="_integGuardar()" style="opacity:0;width:0;height:0;"> <span style="position:absolute;inset:0;background:${cfg.habilitado?'#10b981':'#333'};border-radius:13px;transition:.3s;"></span> <span style="position:absolute;top:3px;left:${cfg.habilitado?'25px':'3px'};width:20px;height:20px;background:#fff;border-radius:50%;transition:.3s;"></span> </label> </div> <!-- Webhook --> <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;"> <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:10px;"> Webhook HTTP</div> <div style="font-size:10px;color:#6b7280;margin-bottom:8px;">Cada pedido nuevo y cambio de estado enviará un POST con JSON al URL configurado.</div> <input id="integ-webhook-url" type="url" placeholder="https://hooks.zapier.com/hooks/catch/..." value="${cfg.webhookUrl||''}"
 style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--white);font-size:12px;margin-bottom:8px;outline:none;"> <input id="integ-webhook-secret" type="text" placeholder="Clave secreta (opcional, header X-Marvel-Secret)" value="${cfg.webhookSecret||''}"
 style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--white);font-size:12px;margin-bottom:10px;outline:none;"> <button onclick="_integTestWebhook()" style="background:rgba(59,130,246,.2);border:1px solid #3b82f6;color:#3b82f6;padding:8px 16px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;width:100%;"> PROBAR WEBHOOK AHORA
 </button> </div> <!-- Opciones de automatización --> <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;"> <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:12px;"> Automatizaciones</div> ${[
 ['integ-auto-imprimir', 'autoImprimir', ' Imprimir ticket automáticamente al Aceptar'],
 ['integ-auto-wsp', 'autoWsp', ' Enviar WhatsApp al cliente al Aceptar'],
 ['integ-sonido', 'sonido', ' Sonido de alerta en pedidos nuevos'],
 ].map(([id, key, label]) => `
 <label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;"> <input type="checkbox" id="${id}" ${cfg[key]?'checked':''} onchange="_integGuardar()" style="width:16px;height:16px;accent-color:var(--primary);"> <span style="font-size:13px;color:var(--white);">${label}</span> </label>`).join('')}
 </div> <!-- Botón guardar --> <button onclick="_integGuardar(true)" style="width:100%;padding:14px;border-radius:12px;border:none;background:var(--primary);color:#000;font-weight:800;font-size:14px;cursor:pointer;margin-bottom:12px;"> GUARDAR CONFIGURACIÓN
 </button> <!-- Payload de ejemplo --> <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;"> <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:8px;"> Formato del payload JSON</div> <pre style="font-size:10px;color:#10b981;background:#0a0a0a;padding:10px;border-radius:8px;overflow-x:auto;line-height:1.5;">${JSON.stringify({
 evento: "nuevo_pedido | estado_cambiado | pedido_editado",
 source: "marvel_food",
 timestamp: "2025-01-15T20:30:00.000Z",
 pedido_id: "abc123xyz",
 numero: "X1Y2Z3",
 cliente: "NOMBRE DEL CLIENTE",
 tel: "3415000000",
 sucursal: "PELLEGRINI 1149, Rosario Centro",
 tipo: "Delivery | Retiro",
 estado: "Pendiente | Aceptado | Listo | Entregado",
 total: 15000,
 items: [{ n: "HULK BURGER", cant: 2, totalItem: 10000 }],
 horario: "21:00 a 21:30",
 pago: "Efectivo | Mercado Pago | Tarjeta"
 }, null, 2)}</pre> </div> <!-- Log --> <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;"> <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"> <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;">Log de actividad</div> <button onclick="_integLogs.length=0;_integLog('Log limpiado')" style="background:transparent;border:1px solid #333;color:#9ca3af;padding:3px 8px;border-radius:6px;font-size:10px;cursor:pointer;">Limpiar</button> </div> <div id="integ-log-body" style="max-height:160px;overflow-y:auto;"> <div style="font-size:11px;color:#6b7280;">Sin actividad aún...</div> </div> </div> </div><!-- /integ-panel-webhook --> <!-- Panel Sistema Propio --> <div id="integ-panel-propio" style="display:none;"> <div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.3);border-radius:14px;padding:16px;margin-bottom:16px;"> <div style="font-size:13px;font-weight:800;color:#a78bfa;margin-bottom:6px;">VINCULACION CON TU SISTEMA PROPIO</div> <p style="font-size:12px;color:#9ca3af;line-height:1.5;margin:0;">Si tenes un sistema de gestión desarrollado desde cero, podes recibir los pedidos automaticamente via endpoint HTTP. Tu sistema expone una ruta y Marvel Food la llama con cada pedido nuevo.</p> </div> <!-- Como funciona --> <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;"> <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:12px;">Como funciona</div> <div style="display:flex;flex-direction:column;gap:12px;"> <div style="display:flex;gap:12px;align-items:flex-start;"> <div style="width:26px;height:26px;border-radius:50%;background:rgba(139,92,246,0.2);border:1px solid #a78bfa;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#a78bfa;flex-shrink:0;">1</div> <div><div style="font-size:13px;font-weight:700;color:var(--white);">Tu sistema expone un endpoint</div><div style="font-size:11px;color:#9ca3af;margin-top:2px;">Creá una ruta POST en tu servidor que reciba JSON. Ej: <code style="color:#a78bfa;background:#111;padding:1px 5px;border-radius:3px;">https://tu-sistema.com/api/pedidos/nuevo</code></div></div> </div> <div style="display:flex;gap:12px;align-items:flex-start;"> <div style="width:26px;height:26px;border-radius:50%;background:rgba(139,92,246,0.2);border:1px solid #a78bfa;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#a78bfa;flex-shrink:0;">2</div> <div><div style="font-size:13px;font-weight:700;color:var(--white);">Configuras el URL aqui</div><div style="font-size:11px;color:#9ca3af;margin-top:2px;">Marvel Food llamara a ese endpoint con cada evento: nuevo pedido, cambio de estado, edicion.</div></div> </div> <div style="display:flex;gap:12px;align-items:flex-start;"> <div style="width:26px;height:26px;border-radius:50%;background:rgba(139,92,246,0.2);border:1px solid #a78bfa;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#a78bfa;flex-shrink:0;">3</div> <div><div style="font-size:13px;font-weight:700;color:var(--white);">Tu sistema procesa el JSON</div><div style="font-size:11px;color:#9ca3af;margin-top:2px;">Recibis el payload completo con todos los datos del pedido y los cargás en tu base de datos o pantalla de cocina.</div></div> </div> </div> </div> <!-- Config endpoint propio --> <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;"> <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Configuracion del endpoint</div> <label style="display:block;font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">URL DE TU SISTEMA</label> <input id="propio-url" type="url" placeholder="https://mi-sistema.com/api/pedidos/nuevo" value="${cfg.propioUrl||''}"
 style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--white);font-size:12px;margin-bottom:10px;outline:none;"> <label style="display:block;font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">CLAVE DE AUTENTICACION (opcional)</label> <input id="propio-secret" type="text" placeholder="Bearer token o API key de tu sistema" value="${cfg.propioSecret||''}"
 style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--white);font-size:12px;margin-bottom:10px;outline:none;"> <label style="display:block;font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">HEADER DE AUTENTICACION</label> <select id="propio-auth-header" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--white);font-size:12px;margin-bottom:10px;outline:none;"> <option value="X-Marvel-Secret" ${(cfg.propioAuthHeader||'X-Marvel-Secret')==='X-Marvel-Secret'?'selected':''}>X-Marvel-Secret (default)</option> <option value="Authorization" ${cfg.propioAuthHeader==='Authorization'?'selected':''}>Authorization: Bearer</option> <option value="X-API-Key" ${cfg.propioAuthHeader==='X-API-Key'?'selected':''}>X-API-Key</option> <option value="X-Token" ${cfg.propioAuthHeader==='X-Token'?'selected':''}>X-Token</option> </select> <div style="display:flex;gap:8px;"> <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;padding:8px;background:var(--bg);border-radius:8px;border:1px solid var(--border);"> <input type="checkbox" id="propio-solo-nuevos" ${cfg.propioSoloNuevos?'checked':''} style="accent-color:#a78bfa;width:16px;height:16px;"> <span style="font-size:12px;color:var(--white);">Solo pedidos nuevos</span> </label> <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;padding:8px;background:var(--bg);border-radius:8px;border:1px solid var(--border);"> <input type="checkbox" id="propio-estados" ${!cfg.propioSoloNuevos?'checked':''} style="accent-color:#a78bfa;width:16px;height:16px;"> <span style="font-size:12px;color:var(--white);">Incluir cambios de estado</span> </label> </div> </div> <!-- Boton guardar + test --> <div style="display:flex;gap:8px;margin-bottom:12px;"> <button onclick="_integGuardarPropio()" style="flex:1;padding:13px;border-radius:10px;border:none;background:#a78bfa;color:#000;font-weight:800;font-size:13px;cursor:pointer;"> Guardar
 </button> <button onclick="_integTestPropio()" style="flex:1;padding:13px;border-radius:10px;background:rgba(139,92,246,.15);border:1px solid #a78bfa;color:#a78bfa;font-weight:800;font-size:13px;cursor:pointer;"> Probar conexion
 </button> </div> <!-- Payload de ejemplo para sistema propio --> <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;"> <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Estructura JSON que recibe tu sistema</div> <pre style="font-size:10px;color:#a78bfa;background:#0a0a0a;padding:10px;border-radius:8px;overflow-x:auto;line-height:1.6;">${_propioPayloadEjemplo()}</pre> </div> <!-- Codigo de ejemplo para recibir el pedido --> <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;"> <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Ejemplo: recibir pedido en Node.js / Express</div> <pre style="font-size:10px;color:#10b981;background:#0a0a0a;padding:10px;border-radius:8px;overflow-x:auto;line-height:1.6;">${_propioEjemploNode()}</pre> </div> <!-- Código de ejemplo PHP --> <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;"> <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Ejemplo: recibir pedido en PHP</div> <pre style="font-size:10px;color:#60a5fa;background:#0a0a0a;padding:10px;border-radius:8px;overflow-x:auto;line-height:1.6;">${_propioEjemploPHP()}</pre> </div> </div><!-- /integ-panel-propio --> </div>`;
}


// Sub-tab switcher de integración 
window.integSwitchSubTab = function(tab) {
 const panelWebhook = document.getElementById('integ-panel-webhook');
 const panelPropio = document.getElementById('integ-panel-propio');
 const btnWebhook = document.getElementById('integ-tab-webhook');
 const btnPropio = document.getElementById('integ-tab-propio');
 if (!panelWebhook || !panelPropio) return;

 const selStyle = 'border:1px solid var(--primary);background:rgba(245,158,11,.15);color:var(--primary);';
 const defStyle = 'border:1px solid var(--border);background:transparent;color:#9ca3af;';

 if (tab === 'webhook') {
 panelWebhook.style.display = 'block';
 panelPropio.style.display = 'none';
 if (btnWebhook) btnWebhook.style.cssText += selStyle;
 if (btnPropio) btnPropio.style.cssText += defStyle;
 } else {
 panelWebhook.style.display = 'none';
 panelPropio.style.display = 'block';
 if (btnWebhook) btnWebhook.style.cssText += defStyle;
 if (btnPropio) btnPropio.style.cssText += selStyle;
 }
};

// Payload de ejemplo para sistema propio 
function _propioPayloadEjemplo() {
 return JSON.stringify({
 evento: "nuevo_pedido",
 source: "marvel_food",
 timestamp: "2025-01-15T20:30:00.000Z",
 pedido_id: "Kx9aB2mZ",
 numero: "B2MZ",
 cliente: "JUAN PEREZ",
 tel: "3415001234",
 sucursal: "PELLEGRINI 1149, Rosario Centro",
 tipo: "Delivery",
 estado: "Pendiente",
 dir: "Laprida 1200",
 loc: "Rosario",
 piso: "2B",
 gps: "-32.9442,-60.6505",
 horario: "21:00 a 21:30",
 pago: "Efectivo",
 total: 18500,
 subtotal: 16000,
 envio: 2500,
 descuento: 0,
 items: [
 { n: "HULK BURGER", cant: 1, totalItem: 10000 },
 { n: "PAPAS GRANDES", cant: 1, totalItem: 4000 },
 { n: "PEPSI 500CC", cant: 1, totalItem: 2000 }
 ],
 cupon: "Ninguno",
 obs: "Sin cebolla en la burger"
 }, null, 2);
}

function _propioEjemploNode() {
 return `// Express.js — recibir pedido de Marvel Food
const express = require('express');
const app = express();
app.use(express.json());

app.post('/api/pedidos/nuevo', (req, res) => {
 // Verificar autenticacion
 const secret = req.headers['x-marvel-secret'];
 if (secret !== process.env.MARVEL_SECRET) {
 return res.status(401).json({ error: 'No autorizado' });
 }
 
 const pedido = req.body;
 
 if (pedido.evento === 'nuevo_pedido') {
 // Guardar en tu base de datos
 db.pedidos.insert({
 id: pedido.pedido_id,
 cliente: pedido.cliente,
 items: pedido.items,
 total: pedido.total,
 estado: pedido.estado,
 tipo: pedido.tipo,
 dir: pedido.dir,
 sucursal: pedido.sucursal,
 hora: pedido.horario
 });
 console.log('Pedido nuevo:', pedido.numero);
 }
 
 if (pedido.evento === 'estado_cambiado') {
 db.pedidos.update({ id: pedido.pedido_id },
 { estado: pedido.estado });
 }
 
 res.json({ ok: true, recibido: pedido.numero });
});

app.listen(3000);`;
}

function _propioEjemploPHP() {
 return `<?php
// recibir_pedido.php — Marvel Food webhook handler

// Verificar autenticacion
$secret = $_SERVER['HTTP_X_MARVEL_SECRET'] ?? '';
if ($secret !== getenv('MARVEL_SECRET')) {
 http_response_code(401);
 die(json_encode(['error' => 'No autorizado']));
}

// Leer JSON del body
$pedido = json_decode(file_get_contents('php://input'), true);
if (!$pedido) { http_response_code(400); die(); }

$evento = $pedido['evento'];

if ($evento === 'nuevo_pedido') {
 // Insertar en tu DB
 $pdo->prepare("
 INSERT INTO pedidos (id, cliente, total, estado, tipo, sucursal)
 VALUES (?, ?, ?, ?, ?, ?)
 ")->execute([
 $pedido['pedido_id'],
 $pedido['cliente'],
 $pedido['total'],
 $pedido['estado'],
 $pedido['tipo'],
 $pedido['sucursal']
 ]);

 // Guardar items
 foreach ($pedido['items'] as $item) {
 $pdo->prepare("
 INSERT INTO pedido_items (pedido_id, nombre, cant, precio)
 VALUES (?, ?, ?, ?)
 ")->execute([
 $pedido['pedido_id'],
 $item['n'], $item['cant'], $item['totalItem']
 ]);
 }
}

if ($evento === 'estado_cambiado') {
 $pdo->prepare("UPDATE pedidos SET estado=? WHERE id=?")
 ->execute([$pedido['estado'], $pedido['pedido_id']]);
}

echo json_encode(['ok' => true]);`;
}

// Guardar config sistema propio 
window._integGuardarPropio = function() {
 const cfg = _integGetConfig();
 cfg.propioUrl = document.getElementById('propio-url')?.value.trim() || '';
 cfg.propioSecret = document.getElementById('propio-secret')?.value.trim() || '';
 cfg.propioAuthHeader = document.getElementById('propio-auth-header')?.value || 'X-Marvel-Secret';
 cfg.propioSoloNuevos = document.getElementById('propio-solo-nuevos')?.checked || false;
 _integSaveConfig(cfg);
 _integLog('Config sistema propio guardada');
 // Toast visual
 const btn = document.querySelector('#integ-panel-propio button[onclick="_integGuardarPropio()"]');
 if (btn) {
 const orig = btn.innerText;
 btn.innerText = 'Guardado!';
 btn.style.background = '#10b981';
 setTimeout(() => { btn.innerText = orig; btn.style.background = '#a78bfa'; }, 1500);
 }
};

// Probar conexion sistema propio 
window._integTestPropio = async function() {
 const url = document.getElementById('propio-url')?.value.trim();
 if (!url) return alert('Ingresa primero la URL de tu sistema.');
 _integLog('Probando conexion con sistema propio...');
 try {
 const secret = document.getElementById('propio-secret')?.value.trim();
 const authHeader = document.getElementById('propio-auth-header')?.value || 'X-Marvel-Secret';
 const headers = { 'Content-Type': 'application/json' };
 if (secret) headers[authHeader] = authHeader === 'Authorization' ? 'Bearer ' + secret : secret;
 const resp = await fetch(url, {
 method: 'POST',
 headers,
 body: JSON.stringify({
 evento: 'test',
 source: 'marvel_food',
 timestamp: new Date().toISOString(),
 mensaje: 'Prueba de conexion desde Marvel Food — Sistema Propio'
 }),
 signal: AbortSignal.timeout(8000)
 });
 _integLog('Conexion OK: HTTP ' + resp.status);
 alert('Conexion exitosa! Tu sistema respondio con HTTP ' + resp.status);
 } catch(err) {
 _integLog('Error de conexion: ' + err.message);
 alert('No se pudo conectar: ' + err.message + '\n\nVerifica que:\n- La URL sea correcta\n- Tu servidor este corriendo\n- CORS este habilitado en tu API');
 }
};

// MEJORA 3 — _integNotificar ya está definida arriba; esta línea obsoleta fue eliminada.
// (La línea "const _origIntegNotificar = window._integNotificar || function(){};" 
//  creaba una referencia circular porque _integNotificar aún no existía en ese punto.)

window._integGuardar = function(mostrarToast) {
 const cfg = {
 habilitado: document.getElementById('integ-habilitado')?.checked || false,
 webhookUrl: document.getElementById('integ-webhook-url')?.value.trim() || '',
 webhookSecret: document.getElementById('integ-webhook-secret')?.value.trim() || '',
 autoImprimir: document.getElementById('integ-auto-imprimir')?.checked || false,
 autoWsp: document.getElementById('integ-auto-wsp')?.checked || false,
 sonido: document.getElementById('integ-sonido')?.checked || false,
 };
 _integSaveConfig(cfg);
 _integRenderTab(); // Re-render para actualizar colores del toggle
 if (mostrarToast) _integLog(' Configuración guardada');
};

window._integTestWebhook = async function() {
 const url = document.getElementById('integ-webhook-url')?.value.trim();
 if (!url) return alert('Ingresá una URL de webhook primero.');
 _integLog(' Probando webhook...');
 try {
 const secret = document.getElementById('integ-webhook-secret')?.value.trim();
 const headers = { 'Content-Type': 'application/json' };
 if (secret) headers['X-Marvel-Secret'] = secret;
 const resp = await fetch(url, {
 method: 'POST',
 headers,
 body: JSON.stringify({
 evento: 'test',
 source: 'marvel_food',
 timestamp: new Date().toISOString(),
 mensaje: 'Prueba de integración desde Marvel Food Admin'
 }),
 signal: AbortSignal.timeout(8000)
 });
 _integLog(` Webhook respondió: HTTP ${resp.status}`);
 } catch(err) {
 _integLog(` Error: ${err.message}`);
 }
};

// INIT: cargar config al abrir el admin 
document.addEventListener('firebase:ready', () => {
 const cfg = _integGetConfig();
 if (cfg.sonido === undefined) {
 // Primera vez: activar sonido por defecto
 _integSaveConfig({ ...cfg, sonido: true });
 }
});

// 
// WHATSAPP 
function admWhatsapp(id) {
 const p = admPedidos.find(x => x.id === id);
 if (!p || !p.tel) return alert("No hay teléfono disponible.");
 const tel = p.tel.replace(/\D/g, '');
 const num = tel.startsWith('54') ? tel : '549' + tel;
 const esDel = p.tipo === 'Delivery';
 let msg = `*¡Hola ${p.cliente}! MARVEL FOOD*%0A`;
 msg += `Tu pedido *#${admNumero(p.id)}* fue *ACEPTADO* %0A`;
 msg += esDel
 ? `*Franja de entrega:* ${p.horarioEstimado || '—'}%0A${p.dir || ''} ${p.piso || ''}`
 : `*Podés retirarlo a las:* ${p.horarioEstimado || '—'}`;
 msg += `%0A*Total:* $${(p.total || 0).toLocaleString('es-AR')} (${p.pago})%0A%0A¡Gracias por elegirnos! `;
 window.open(`https://wa.me/${num}?text=${msg}`, '_blank');
}

// EDICIÓN 
function admEditar(id) {
 const p = admPedidos.find(x => x.id === id);
 if (!p) return;
 admEditId = id;
 document.getElementById('adm-e-cliente').value = p.cliente || '';
 document.getElementById('adm-e-tel').value = p.tel || '';
 document.getElementById('adm-e-dir').value = p.dir || '';
 document.getElementById('adm-e-envio').value = p.envio || 0;
 document.getElementById('adm-e-desc').value = p.descuento || 0;
 document.getElementById('adm-e-obs').value = p.obs || '';
 document.getElementById('adm-e-dir-block').style.display = p.tipo === 'Delivery' ? 'block' : 'none';
 // Resaltar el campo de envío si es delivery y el costo no fue asignado
 const envioInp = document.getElementById('adm-e-envio');
 if (envioInp) {
 const sinEnvio = p.tipo === 'Delivery' && (!p.envio || p.envio === 0);
 envioInp.style.border = sinEnvio ? '2px solid #f59e0b' : '';
 envioInp.style.background = sinEnvio ? 'rgba(245,158,11,0.08)' : '';
 // Hint visual
 const hint = document.getElementById('adm-e-envio-hint');
 if (hint) hint.style.display = sinEnvio ? 'block' : 'none';
 }
 // Seleccionar sucursal actual
 const selSuc = document.getElementById('adm-e-sucursal');
 if (selSuc) selSuc.value = p.sucursal || '';

 document.getElementById('adm-e-items').innerHTML = (p.items || []).map((item, idx) => `
 <div class="adm-edit-item" id="adm-ei-${idx}"><input type="number" min="1" value="${parseInt(item.cant) || 1}" onchange="admRecalc()" id="adm-eq-${idx}"><div style="flex:1;"><div class="eil">${item.n}</div><div class="eip">$${Math.round((item.totalItem || 0) / item.cant).toLocaleString('es-AR')} c/u</div></div><button class="adm-del-item" onclick="admDelItem(${idx})">×</button></div>`).join('');

 admRecalc();
 document.getElementById('adm-modal-edit').classList.add('open');
}

function admDelItem(idx) {
 const el = document.getElementById('adm-ei-' + idx);
 if (el) { el.remove(); admRecalc(); }
}

function admRecalc() {
 const p = admPedidos.find(x => x.id === admEditId);
 if (!p) return;
 let sub = 0;
 (p.items || []).forEach((item, idx) => {
 const row = document.getElementById('adm-ei-' + idx);
 if (!row) return;
 const cant = parseInt(row.querySelector('input').value) || 0;
 sub += ((item.totalItem || 0) / item.cant) * cant;
 });
 const env = parseFloat(document.getElementById('adm-e-envio').value) || 0;
 const desc = parseFloat(document.getElementById('adm-e-desc').value) || 0;
 const tot = document.getElementById('adm-e-total');
 if (tot) tot.innerText = '$' + Math.max(0, sub + env - desc).toLocaleString('es-AR');
}

async function admGuardar() {
 const p = admPedidos.find(x => x.id === admEditId);
 if (!p) return;
 const nuevosItems = [];
 (p.items || []).forEach((item, idx) => {
 const row = document.getElementById('adm-ei-' + idx);
 if (!row) return;
 const cant = parseInt(row.querySelector('input').value) || 1;
 const pu = (item.totalItem || 0) / item.cant;
 nuevosItems.push({ ...item, cant, totalItem: Math.round(pu * cant) });
 });
 const sub = nuevosItems.reduce((a, i) => a + i.totalItem, 0);
 const env = parseFloat(document.getElementById('adm-e-envio').value) || 0;
 const desc = parseFloat(document.getElementById('adm-e-desc').value) || 0;
 const tot = Math.max(0, sub + env - desc);
 const sucursal = document.getElementById('adm-e-sucursal')?.value || p.sucursal;
 try {
 await db.collection("pedidos_v2").doc(admEditId).update({
 cliente: document.getElementById('adm-e-cliente').value.toUpperCase().trim(),
 tel: document.getElementById('adm-e-tel').value.trim(),
 dir: document.getElementById('adm-e-dir').value.trim(),
 obs: document.getElementById('adm-e-obs').value.trim(),
 sucursal,
 items: nuevosItems, subtotal: sub, envio: env, descuento: desc, total: tot,
 editadoPor: 'admin',
 fechaEdicion: firebase.firestore.FieldValue.serverTimestamp()
 });
 admCloseModal();
 // Notificar sistema externo con el pedido editado
 const pActualizado = admPedidos.find(x => x.id === admEditId) || {};
 _integNotificar('pedido_editado', { ...pActualizado, id: admEditId });
 } catch (e) { alert("Error al guardar: " + e.message); }
}

function admCloseModal() {
 const m = document.getElementById('adm-modal-edit');
 if (m) m.classList.remove('open');
 admEditId = null;
}

document.addEventListener('DOMContentLoaded', function() {
 const m = document.getElementById('adm-modal-edit');
 if (m) m.addEventListener('click', function(e) { if (e.target === this) admCloseModal(); });
});

// MAPA DE CÓDIGOS OFICIALES (scope global — usado al guardar pedidos en Firestore)
const _CODIGOS_JARVIS = {
// Hamburguesas carne (códigos 1-20) 
'HULK BURGER':1, 'HULK':1,
'NATASHA':2,
'CAPITAN AMERICA':3, 'CAPITÁN AMÉRICA':3,
'IRON MAN':4,
'PETER PARKER':5,
'BLACK PANTHER':7,
'DOCTOR STRANGE':8, 'DR STRANGE':8, 'DR. STRANGE':8,
'WOLVERINE':10,
'CAPITANA MARVEL':11,
'THANOS':12,
'LOKI':13,
'WANDA':15,
'VISION':16,
// Smash (17-20) 
'CHIS BURGER':17, 'CHISS BURGER':17,
'PERFEKTA':18, 'PERFEKTA SMASH':18,
'BIG MARVEL':19,
'STACKER':20, 'STAKER BURGER':20, 'STACKER BURGER':20,
// Veggie remolacha (21-40) 
'HULK SIMPLE VEGE':21, 'HULK VEGGIE':21,
'NATASHA VEGGIE':22, 'NATASHA VEGE':22,
'CAPITAN AMERICA VEGGIE':23,'CAPITÁN AMÉRICA VEGGIE':23,'CAPITAN AMERICA VEGE':23,
'IRON MAN VEGGIE':24, 'IRON MAN VEGE':24,
'PETER PARKER VEGGIE':25, 'PETER PARKER VEGE':25,
'BLACK PANTHER VEGGIE':27, 'BLACK PANTHER VEGE':27,
'DOCTOR STRANGE S VEGE':28, 'DR STRANGE VEGGIE':28,
'CAP MARVEL VEGE SIMPLE':31,'CAPITANA MARVEL VEGGIE':31,
'LOKI VEGGIE':33, 'LOKI VEGE':33,
'WANDA VEGGIE':35, 'WANDA VEGE':35,
'VISION VEGGIE':36, 'VISION VEGGE':36,
'STAKER VEGE':40,
// Veggie choclo (41-61) 
'HULK SIMPLE CHOCLO':41,
'NATASHA CHOCLO':42,
'CAPITAN AMERICA CHOCLO':43,
'IRON MAN CHOCLO':44,
'PETER PARKER CHOCLO':45,
'BLACK PANTHER CHOCLO':47,
'DOCTOR STRANGE S CHOCLO':48,
'CAP MARVEL CHOCLO SIMPLE':51,
'LOKI CHOCLO':53,
'WANDA CHOCLO':55,
'VISION CHOCLO':56,
'VALKYRIA VEGAN':60, 'VEGAN VALKYRIA':60,
'VALKYRIA CHOCLO':61,
// Sándwiches / otros 
'SÁNDWICH LIBERTAD':67, 'SANDWICH LIBERTAD':67, 'LIBERTAD':67,
'MENU INFANTIL':70,
// Papas (200-205) 
'PAPAS CHICAS':200,
'PAPAS CHICAS CON CHEDDAR':201, 'PAPA CHICA CHEDDAR':201,
'PAPAS CHICAS COMPLETAS':202,
'PAPAS GRANDES':203,
'PAPAS CHEDDAR GRANDES':204, 'PAPA GRANDE CHEDDAR':204,
'PAPAS GR COMPLETAS':205,
// Acompañamientos (206-211) 
'AROS DE CEBOLLA (10 UNIDADES)':206, 'AROS DE CEBOLLA 10':206,
'COMBO AROS':207, 'COMBO AROS DE CEBOLLA':207,
'NUGGETS (10 UNIDADES)':208,'NUGGETS X10':208,
'COMBO NUGGETS':209,
'MARVEL BOX':210,
'ENSALADA KANG':211, 'ENSALADA KANG SALAD':211,
// Bebidas (300-358) 
'PEPSI LATA 360':300, 'PEPSI 500CC':301, 'PEPSI 1500CC':302,
'PEPSI BLACK LATA 360':303, 'PEPSI BLACK 1500CC':304,
'SEVEN UP LATA 360':305, 'SEVEN UP 500CC':306, 'SEVEN UP 1500CC':307,
'MIRINDA LATA 360':308, 'MIRINDA 500CC':309, 'MIRINDA 1500CC':310,
'PASO DLT LATA 360':311, 'PASO DLT 1500CC':312,
'AWAFRUT NARANJA 500CC':313,'AWAFRUT MANZANA 500CC':314,'AWAFRUT POMELO 500CC':315,
'AGUA 500CC':316, 'AGUA 1500CC':317,
'STELLA 473CC':350, 'ANDES RUBIA 473CC':351,'ANDES ROJA 473CC':352,
'ANDES IPA 473CC':353, 'QUILMES 473CC':354, 'BUDWEISER 473CC':355,
'BRAHMA LATA':356, 'STELLA SIN ALCOHOL':358,
// Extras (700-715) 
'EXTRA CARNE':700, 'EXTRA MEDALLON':700,
'EXTRA CHEDDAR':711, 'EXTRA CHEDDAR FETA':701,
'EXTRA PANCETA':710,
'EXTRA DIP VERDEO':710, 'EXTRA DIP CHEDDAR':711,
'EXTRA DIP BARBACOA':712, 'EXTRA DIP PANCETA':713,
'EXTRA CARNE SMASH':714,
'EXTRA MEDALLÓN VEGGIE':715,'EXTRA MEDALLON VEGGIE':715,
// Promos del día (403-440) 
'PROMO LUNES CAPITÁN AMÉRICA':403, 'PROMO LUNES CAPITAN AMERICA':403, 'MARVEL LUNES CAP AMERICA':403,
'PROMO MARTES PETER PARKER':405, 'MARVEL MARTES PETER':405,
'PROMO MIÉRCOLES IRON MAN':404, 'MARVEL MIERC IRON':404,
'PROMO JUEVES STACKER':420, 'MARVEL JUEVES STACKER':420,
'PROMO VIERNES LOKI':413, 'MARVEL VIERNES LOKI':413,
'PROMO SÁBADO BLACK PANTHER':407, 'MARVEL SAB BLACK P':407,
'PROMO DOMINGO CHISBURGER':417, 'MARVEL DOM CHISS':417,
// Promos compartir (501-525) 
'COMPARTIR HULK':501, 'COMPARTI HULK':501,
'COMPARTIR CAPITÁN AMÉRICA':503, 'COMPARTIR CAPITAN AMERICA':503, 'COMPARTI CAPITAN A':503,
'COMPARTIR IRON MAN':504, 'COMPARTI IRON MAN':504,
'COMPARTIR PETER PARKER':505, 'COMPARTI PETER PARKER':505,
   // MEJORA 4 — Códigos agregados (Veggie Choclo completos + variantes faltantes)
   // Veggie choclo variantes adicionales
   'HULK CHOCLO':41, 'HULK VEGGIE CHOCLO':41,
   'NATASHA VEGGIE CHOCLO':42,
   'CAPITAN AMERICA VEGGIE CHOCLO':43, 'CAP AMERICA CHOCLO':43,
   'IRON MAN VEGGIE CHOCLO':44,
   'PETER PARKER VEGGIE CHOCLO':45,
   'BLACK PANTHER VEGGIE CHOCLO':47, 'BLACK PANTHER CHOCLO':47,
   'DOCTOR STRANGE CHOCLO':48, 'DR STRANGE CHOCLO':48,
   'CAPITANA MARVEL CHOCLO':51, 'CAP MARVEL CHOCLO':51,
   'LOKI VEGGIE CHOCLO':53,
   'WANDA VEGGIE CHOCLO':55,
   'VISION VEGGIE CHOCLO':56,
   // Sándwiches y extras adicionales
   'CHEESE BURGER':17, 'CHISBURGER':17, 'CHEESEBURGER':17,
   'GALVEZ':67, 'SANDWICH GALVEZ':67,
   'MENU KIDS':70, 'KIDS':70,
   // Promos compartir adicionales
   'COMPARTI IRON':504,
   'COMPARTIR BLACK PANTHER':507, 'COMPARTI BLACK PANTHER':507,
   'COMPARTIR LOKI':513, 'COMPARTI LOKI':513,
   'COMPARTIR WANDA':515, 'COMPARTI WANDA':515,
};

// Busca código: primero exacto, luego el match MÁS LARGO (evita que "HULK" matchee "HULK VEGGIE")
function _buscarCodigoJarvis(nombre) {
const key = nombre.toUpperCase().trim();
// 1. Coincidencia exacta
if (_CODIGOS_JARVIS[key] !== undefined) return String(_CODIGOS_JARVIS[key]).padStart(5,'0');
// 2. El nombre del producto CONTIENE alguna key — tomar la key más larga que haga match
const keys = Object.keys(_CODIGOS_JARVIS).sort((a,b) => b.length - a.length);
for (const k of keys) {
if (key.includes(k)) return String(_CODIGOS_JARVIS[k]).padStart(5,'0');
}
// 3. Alguna key CONTIENE el nombre del producto
for (const k of keys) {
if (k.includes(key)) return String(_CODIGOS_JARVIS[k]).padStart(5,'0');
}
return '?????';
}

// IMPRIMIR 
// IMPRIMIR 
function admImprimir(id) {
 const p = admPedidos.find(x => x.id === id);
 if (!p) return;

 const num = admNumero(p.id);
 const fd = p.fecha ? (p.fecha.toDate ? p.fecha.toDate() : new Date(p.fecha)) : new Date();
 const fecha = fd.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' });
 const esDel = p.tipo === 'Delivery';
 const SEP = '_________________________________________________________';
 const items = (p.items || []);

 // MAPA DE CÓDIGOS OFICIALES 
 const CODIGOS_PROD = {
 // Hamburguesas carne (códigos 1-20) 
 'HULK BURGER':1, 'HULK':1,
 'NATASHA':2,
 'CAPITAN AMERICA':3, 'CAPITÁN AMÉRICA':3,
 'IRON MAN':4,
 'PETER PARKER':5,
 'BLACK PANTHER':7,
 'DOCTOR STRANGE':8, 'DR STRANGE':8, 'DR. STRANGE':8,
 'WOLVERINE':10,
 'CAPITANA MARVEL':11,
 'THANOS':12,
 'LOKI':13,
 'WANDA':15,
 'VISION':16,
 // Smash (17-20) 
 'CHIS BURGER':17, 'CHISS BURGER':17,
 'PERFEKTA':18, 'PERFEKTA SMASH':18,
 'BIG MARVEL':19,
 'STACKER':20, 'STAKER BURGER':20, 'STACKER BURGER':20,
 // Veggie remolacha (21-40) 
 'HULK SIMPLE VEGE':21, 'HULK VEGGIE':21,
 'NATASHA VEGGIE':22, 'NATASHA VEGE':22,
 'CAPITAN AMERICA VEGGIE':23,'CAPITÁN AMÉRICA VEGGIE':23,'CAPITAN AMERICA VEGE':23,
 'IRON MAN VEGGIE':24, 'IRON MAN VEGE':24,
 'PETER PARKER VEGGIE':25, 'PETER PARKER VEGE':25,
 'BLACK PANTHER VEGGIE':27, 'BLACK PANTHER VEGE':27,
 'DOCTOR STRANGE S VEGE':28, 'DR STRANGE VEGGIE':28,
 'CAP MARVEL VEGE SIMPLE':31,'CAPITANA MARVEL VEGGIE':31,
 'LOKI VEGGIE':33, 'LOKI VEGE':33,
 'WANDA VEGGIE':35, 'WANDA VEGE':35,
 'VISION VEGGIE':36, 'VISION VEGGE':36,
 'STAKER VEGE':40,
 // Veggie choclo (41-61) 
 'HULK SIMPLE CHOCLO':41,
 'NATASHA CHOCLO':42,
 'CAPITAN AMERICA CHOCLO':43,
 'IRON MAN CHOCLO':44,
 'PETER PARKER CHOCLO':45,
 'BLACK PANTHER CHOCLO':47,
 'DOCTOR STRANGE S CHOCLO':48,
 'CAP MARVEL CHOCLO SIMPLE':51,
 'LOKI CHOCLO':53,
 'WANDA CHOCLO':55,
 'VISION CHOCLO':56,
 'VALKYRIA VEGAN':60, 'VEGAN VALKYRIA':60,
 'VALKYRIA CHOCLO':61,
 // Sándwiches / otros 
 'SÁNDWICH LIBERTAD':67, 'SANDWICH LIBERTAD':67, 'LIBERTAD':67,
 'MENU INFANTIL':70,
 // Papas (200-205) 
 'PAPAS CHICAS':200,
 'PAPAS CHICAS CON CHEDDAR':201, 'PAPA CHICA CHEDDAR':201,
 'PAPAS CHICAS COMPLETAS':202,
 'PAPAS GRANDES':203,
 'PAPAS CHEDDAR GRANDES':204, 'PAPA GRANDE CHEDDAR':204,
 'PAPAS GR COMPLETAS':205,
 // Acompañamientos (206-211) 
 'AROS DE CEBOLLA (10 UNIDADES)':206, 'AROS DE CEBOLLA 10':206,
 'COMBO AROS':207, 'COMBO AROS DE CEBOLLA':207,
 'NUGGETS (10 UNIDADES)':208,'NUGGETS X10':208,
 'COMBO NUGGETS':209,
 'MARVEL BOX':210,
 'ENSALADA KANG':211, 'ENSALADA KANG SALAD':211,
 // Bebidas (300-358) 
 'PEPSI LATA 360':300, 'PEPSI 500CC':301, 'PEPSI 1500CC':302,
 'PEPSI BLACK LATA 360':303, 'PEPSI BLACK 1500CC':304,
 'SEVEN UP LATA 360':305, 'SEVEN UP 500CC':306, 'SEVEN UP 1500CC':307,
 'MIRINDA LATA 360':308, 'MIRINDA 500CC':309, 'MIRINDA 1500CC':310,
 'PASO DLT LATA 360':311, 'PASO DLT 1500CC':312,
 'AWAFRUT NARANJA 500CC':313,'AWAFRUT MANZANA 500CC':314,'AWAFRUT POMELO 500CC':315,
 'AGUA 500CC':316, 'AGUA 1500CC':317,
 'STELLA 473CC':350, 'ANDES RUBIA 473CC':351,'ANDES ROJA 473CC':352,
 'ANDES IPA 473CC':353, 'QUILMES 473CC':354, 'BUDWEISER 473CC':355,
 'BRAHMA LATA':356, 'STELLA SIN ALCOHOL':358,
 // Extras (700-715) 
 'EXTRA CARNE':700, 'EXTRA MEDALLON':700,
 'EXTRA CHEDDAR':711, 'EXTRA CHEDDAR FETA':701,
 'EXTRA PANCETA':710,
 'EXTRA DIP VERDEO':710, 'EXTRA DIP CHEDDAR':711,
 'EXTRA DIP BARBACOA':712, 'EXTRA DIP PANCETA':713,
 'EXTRA CARNE SMASH':714,
 'EXTRA MEDALLÓN VEGGIE':715,'EXTRA MEDALLON VEGGIE':715,
 // Promos del día (403-440) 
 'PROMO LUNES CAPITÁN AMÉRICA':403, 'PROMO LUNES CAPITAN AMERICA':403, 'MARVEL LUNES CAP AMERICA':403,
 'PROMO MARTES PETER PARKER':405, 'MARVEL MARTES PETER':405,
 'PROMO MIÉRCOLES IRON MAN':404, 'MARVEL MIERC IRON':404,
 'PROMO JUEVES STACKER':420, 'MARVEL JUEVES STACKER':420,
 'PROMO VIERNES LOKI':413, 'MARVEL VIERNES LOKI':413,
 'PROMO SÁBADO BLACK PANTHER':407, 'MARVEL SAB BLACK P':407,
 'PROMO DOMINGO CHISBURGER':417, 'MARVEL DOM CHISS':417,
 // Promos compartir (501-525) 
 'COMPARTIR HULK':501, 'COMPARTI HULK':501,
 'COMPARTIR CAPITÁN AMÉRICA':503, 'COMPARTIR CAPITAN AMERICA':503, 'COMPARTI CAPITAN A':503,
 'COMPARTIR IRON MAN':504, 'COMPARTI IRON MAN':504,
 'COMPARTIR PETER PARKER':505, 'COMPARTI PETER PARKER':505,
    // MEJORA 4 — Códigos agregados (Veggie Choclo completos + variantes faltantes)
    // Veggie choclo variantes adicionales
    'HULK CHOCLO':41, 'HULK VEGGIE CHOCLO':41,
    'NATASHA VEGGIE CHOCLO':42,
    'CAPITAN AMERICA VEGGIE CHOCLO':43, 'CAP AMERICA CHOCLO':43,
    'IRON MAN VEGGIE CHOCLO':44,
    'PETER PARKER VEGGIE CHOCLO':45,
    'BLACK PANTHER VEGGIE CHOCLO':47, 'BLACK PANTHER CHOCLO':47,
    'DOCTOR STRANGE CHOCLO':48, 'DR STRANGE CHOCLO':48,
    'CAPITANA MARVEL CHOCLO':51, 'CAP MARVEL CHOCLO':51,
    'LOKI VEGGIE CHOCLO':53,
    'WANDA VEGGIE CHOCLO':55,
    'VISION VEGGIE CHOCLO':56,
    // Sándwiches y extras adicionales
    'CHEESE BURGER':17, 'CHISBURGER':17, 'CHEESEBURGER':17,
    'GALVEZ':67, 'SANDWICH GALVEZ':67,
    'MENU KIDS':70, 'KIDS':70,
    // Promos compartir adicionales
    'COMPARTI IRON':504,
    'COMPARTIR BLACK PANTHER':507, 'COMPARTI BLACK PANTHER':507,
    'COMPARTIR LOKI':513, 'COMPARTI LOKI':513,
    'COMPARTIR WANDA':515, 'COMPARTI WANDA':515,
 };

 // Busca código: primero exacto, luego el match MÁS LARGO (evita que "HULK" matchee "HULK VEGGIE")
 function buscarCodigo(nombre) {
 const key = nombre.toUpperCase().trim();
 // 1. Coincidencia exacta
 if (CODIGOS_PROD[key] !== undefined) return String(CODIGOS_PROD[key]).padStart(5,'0');
 // 2. El nombre del producto CONTIENE alguna key — tomar la key más larga que haga match
 const keys = Object.keys(CODIGOS_PROD).sort((a,b) => b.length - a.length);
 for (const k of keys) {
 if (key.includes(k)) return String(CODIGOS_PROD[k]).padStart(5,'0');
 }
 // 3. Alguna key CONTIENE el nombre del producto
 for (const k of keys) {
 if (k.includes(key)) return String(CODIGOS_PROD[k]).padStart(5,'0');
 }
 return '?????';
 }

 // Conteo de hamburguesas (excluye acompañamientos)
 const totalBurgers = items
 .filter(i => !['PAPAS','BEBIDA','GASEOSA','AGUA','JUGO','DIP','AROS','NUGGETS','SANDWICH','ENSALADA','COMBO','EXTRA','BEBIDA','LATA','CC']
 .some(k => i.n.toUpperCase().includes(k)))
 .reduce((a, i) => a + i.cant, 0);

 // Dirección
 const dirCliente = esDel
 ? `Domicilio:${(p.dir||'').trim()}${p.piso&&p.piso.trim()?' '+p.piso.trim():''}\nCP - Zona: ${p.loc||''}`
 : `Modalidad: RETIRO EN LOCAL`;

 // Filas tabla cliente — cada extra genera su propio <tr>
  const filasCliente = items.map((i) => {
 const cod = buscarCodigo(i.n);
 const cant = String(i.cant).padStart(2, '0');

 // Precio base = totalItem − suma de todos los extras × cantidad
 const extrasTotal = (i.con || []).reduce((sum, x) => sum + ((x.p || 0) * i.cant), 0);
 const precioBase = ((i.totalItem || 0) - extrasTotal).toFixed(2);

 // Descripción principal: mantiene obs y sin, pero NO los extras
 const desc = i.n.toUpperCase()
 + (i.sin && i.sin.length ? ' (Sin: ' + i.sin.join(', ') + ')' : '')
 + (i.obs ? ' [' + i.obs + ']' : '');

 // Fila del producto principal
 let filas = `<tr><td>${cod}</td><td class="td-desc">${desc}</td><td class="td-c">${cant}</td><td class="td-r">${precioBase}</td></tr>`;

 // Una fila independiente por cada extra
 (i.con || []).forEach(x => {
 const xCod = buscarCodigo(x.n || '');
 const xDesc = (x.n || '').toUpperCase();
 const xPrec = ((x.p || 0) * i.cant).toFixed(2);
 filas += `<tr><td>${xCod}</td><td class="td-desc">${xDesc}</td><td class="td-c">${cant}</td><td class="td-r">${xPrec}</td></tr>`;
 });

 return filas;
 }).join('');

 // Filas tabla cocina — sin precios; cada extra genera su propio <tr>
  const filasCocina = items.map((i) => {
 const cod = buscarCodigo(i.n);
 const cant = String(i.cant).padStart(2, '0');

 const sinStr = (i.sin && i.sin.length) ? ' <strong>(Sin: ' + i.sin.join(', ') + ')</strong>' : '';
 const obsStr = i.obs ? ' [' + i.obs + ']' : '';
 const desc = '<strong>' + i.n.toUpperCase() + '</strong>' + sinStr + obsStr;

 // Fila del producto principal (sin extras en la descripción)
 let filas = `<tr><td>${cod}</td><td class="td-desc">${desc}</td><td class="td-c">${cant}</td></tr>`;

 // Una fila independiente por cada extra
 (i.con || []).forEach(x => {
 const xCod = buscarCodigo(x.n || '');
 const xDesc = '<strong>' + (x.n || '').toUpperCase() + '</strong>';
 filas += `<tr><td>${xCod}</td><td class="td-desc">${xDesc}</td><td class="td-c">${cant}</td></tr>`;
 });

 return filas;
 }).join('');

 // Totales cliente
 const totalesCliente = `
 <tr><td colspan="3" class="td-r"> Sub total :${(p.subtotal||0).toFixed(2)}</td></tr> ${esDel ? `<tr><td colspan="3" class="td-r"> Envío : ${(p.envio||0).toFixed(2)}</td></tr>` : ''}
 ${p.descuento ? `<tr><td colspan="3" class="td-r"> Descuento : -${Number(p.descuento).toFixed(2)}${p.cuponUsado?' ('+p.cuponUsado+')':''}</td></tr>` : ''}
 ${p.codigoInterno ? `<tr><td colspan="3" class="td-r"> Cod: ${p.codigoInterno.codigo} (${p.codigoInterno.nombre})</td></tr>` : ''}
 <tr><td colspan="3" class="td-r"><strong> Total :${(p.total||0).toFixed(2)}</strong></td></tr>`;

 const codigoBarras = `${num}${String(totalBurgers).padStart(2,'0')}${String(items.length).padStart(2,'0')}`;

 const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Tickets Pedido ${num}</title><style> * { margin:0; padding:0; box-sizing:border-box; }
 body { font-family:'Courier New',Courier,monospace; font-size:11px; color:#000; background:#fff; }
 @page { size:80mm auto; margin:4mm 3mm; }
 .ticket { width:100%; max-width:76mm; padding:0; page-break-after:always; }
 .ticket:last-child { page-break-after:avoid; }
 .sep { font-size:10px; letter-spacing:0; line-height:1.2; overflow:hidden; white-space:nowrap; }
 .header-row { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:3px; }
 .logo-text { text-align:right; line-height:1.1; }
 .logo-marvel { font-family:Arial,sans-serif; font-size:14px; font-weight:900; letter-spacing:1px; }
 .logo-food { font-family:Arial,sans-serif; font-size:10px; font-weight:700; font-style:italic; }
 .info { line-height:1.5; margin:2px 0; }
 table { width:100%; border-collapse:collapse; margin:2px 0; }
 th { text-align:left; font-weight:bold; padding:0 2px; }
 td { padding:1px 2px; vertical-align:top; }
 .td-desc { width:55%; word-break:break-word; }
 .td-c { text-align:center; white-space:nowrap; }
 .td-r { text-align:right; white-space:nowrap; }
 .totales { text-align:right; margin:3px 0; line-height:1.6; }
 .total-final { font-weight:bold; }
 .barcode { text-align:center; font-size:13px; font-weight:bold; letter-spacing:3px; margin:5px 0 2px; }
 .footer { text-align:center; font-size:10px; margin-top:6px; }
 .badge { font-size:10px; font-weight:bold; }
</style></head><body><!-- TICKET CLIENTE --><div class="ticket"><div class="header-row"><strong>Ticket Cliente</strong><div class="logo-text"><div class="logo-marvel">MARVEL</div><div class="logo-food">Food</div></div></div><div class="sep">${SEP}</div><div class="info"><strong>Fecha : ${fecha} &nbsp;&nbsp; Número : ${num}</strong><br> Pedido para : ${p.cliente||'—'}<br> Teléfono : ${p.tel||'—'}<br> ${esDel
 ? `Domicilio:${(p.dir||'').trim()}${p.piso&&p.piso.trim()?' '+p.piso.trim():''}<br>CP - Zona: ${p.loc||''}`
 : `Modalidad: RETIRO EN LOCAL`}
 ${p.horarioEstimado ? `<br>Horario : ${p.horarioEstimado}` : ''}
 </div><div class="sep">${SEP}</div><table><thead><tr><th>Código</th><th class="td-desc">Descripción</th><th class="td-c">Cant.</th><th class="td-r">Precio</th></tr></thead><tbody><tr><td colspan="4"><div class="sep">${SEP}</div></td></tr> ${filasCliente}
 <tr><td colspan="4"><div class="sep">${SEP}</div></td></tr> ${totalesCliente}
 </tbody></table><div class="sep">${SEP}</div><div class="info">Pago : ${p.pago||'—'}${p.pago==='Efectivo'&&p.vuelto?`<br>Abona con: $${p.vuelto}`:''}</div><div class="footer">¡Gracias por elegirnos! </div><div class="sep">${SEP}</div></div><!-- TICKET COCINA --><div class="ticket"><div class="header-row"><strong>Ticket Interno</strong><span class="badge">${esDel ? 'ENVÍO' : 'RETIRO'}</span></div><div class="sep">${SEP}</div><div class="info"> Fecha : ${fecha} &nbsp;&nbsp; Número : ${num}<br> Cocción: ${p.horarioEstimado||'—'}<br> Pedido para : ${p.cliente||'—'}<br> Teléfono : ${p.tel||'—'}<br> ${esDel
 ? `Domicilio : ${(p.dir||'').trim()}${p.piso&&p.piso.trim()?' '+p.piso.trim():''}<br>CP - Zona: ${p.loc||''}`
 : `Retira en local`}
 </div><div class="sep">${SEP}</div><table><thead><tr><th>Código</th><th class="td-desc">Descripción</th><th class="td-c">Cantidad</th></tr></thead><tbody><tr><td colspan="3"><div class="sep">${SEP}</div></td></tr> ${filasCocina}
 </tbody></table><div class="sep">${SEP}</div><div style="text-align:right;"> Total hamburguesas: ${String(totalBurgers).padStart(2,'0')}</div><div class="barcode">${codigoBarras}</div><div class="sep">${SEP}</div></div><script>window.onload=function(){window.print();setTimeout(function(){window.close();},1000);};<\/script></body></html>`;

 const win = window.open('', '_blank', 'width=340,height=600,scrollbars=yes');
 if (win) {
 win.document.write(html);
 win.document.close();
 } else {
 // Fallback si el popup fue bloqueado: usar Blob URL (evita problemas de encoding con srcdoc)
 // Bug fix: html.replace(/"/g,"'") rompía si los nombres de productos tenían comillas simples
 try {
 const blob = new Blob([html], { type: 'text/html' });
 const blobUrl = URL.createObjectURL(blob);
 const printArea = document.getElementById('adm-print-area');
 if (printArea) {
 const ifr = document.createElement('iframe');
 ifr.style.cssText = 'width:100%;height:100vh;border:none;';
 ifr.onload = () => { ifr.contentWindow.print(); URL.revokeObjectURL(blobUrl); };
 ifr.src = blobUrl;
 printArea.innerHTML = '';
 printArea.appendChild(ifr);
 }
 } catch(blobErr) {
 alert(' El navegador bloqueó la ventana emergente. Habilitá los popups para este sitio y volvé a intentarlo.');
 }
 }
}


// ADMIN TABS + DASHBOARD + MENU + RESENAS 

function admSwitchTab(tab, btn) {
 if (tab === 'integracion') { _integRenderTab(); }
 if (tab === 'mercadopago') { admCargarMercadoPago(); }

 // Tabs normales (display:block) 
 const BLOCK_TABS = ['pedidos','dashboard','menu','resenas','promos','cupones','integracion','codigos','mercadopago','configuracion'];
 BLOCK_TABS.forEach(t => {
 const el = document.getElementById('adm-tab-' + t);
 if (el) el.style.display = t === tab ? 'block' : 'none';
 });

 // Tab Mapa: usa display:flex en lugar de block 
 const mapaEl = document.getElementById('adm-tab-mapa');
 if (mapaEl) mapaEl.style.display = tab === 'mapa' ? 'flex' : 'none';

 document.querySelectorAll('.adm-tab').forEach(b => b.classList.remove('active'));
 if (btn) btn.classList.add('active');

 // Cargar datos de cada tab
 if (tab === 'dashboard') setTimeout(admCargarDashboard, 50);
 if (tab === 'menu') setTimeout(admCargarMenuGestion, 50);
 if (tab === 'resenas') setTimeout(admCargarResenas, 50);
 if (tab === 'promos') setTimeout(admCargarPromos, 50);
 if (tab === 'cupones') setTimeout(admCargarCupones, 50);
 if (tab === 'codigos') setTimeout(admCargarCodigos, 300);
 if (tab === 'integracion') setTimeout(_integRenderTab, 50);

 // Lazy init del mapa (solo primera vez que se abre la tab) 
 if (tab === 'configuracion') setTimeout(admCargarConfiguracion, 50);
 if (tab === 'mapa') {
 setTimeout(gfInitLazy, 80);
 }
}

// 
// ADMIN — MERCADO PAGO
// 
async function admCargarMercadoPago() {
 const inp = document.getElementById('adm-mp-token-inp');
 const dot = document.getElementById('adm-mp-status-dot');
 const txt = document.getElementById('adm-mp-status-txt');
 const sub = document.getElementById('adm-mp-status-sub');
 if (!inp) return;
 try {
 const snap = await window.db.collection('config_menu').doc('mercadopago').get();
 // Cargar estado del toggle activo/inactivo
 const mpActivo = snap.exists ? (snap.data()?.mpActivo !== false) : false;
 window._mpActivo = mpActivo;
 const toggleEl = document.getElementById('adm-mp-master-toggle');
 const toggleDesc = document.getElementById('adm-mp-toggle-desc');
 if (toggleEl) toggleEl.checked = mpActivo;
 if (toggleDesc) toggleDesc.textContent = mpActivo
   ? 'Activado — los clientes ven la opción Mercado Pago'
   : 'Desactivado — la opción no aparece para los clientes';
 _syncMpOptionVisibility();
 if (snap.exists && snap.data()?.accessToken) {
 const tk = snap.data().accessToken;
 // Mostrar solo los últimos 6 chars del token
 inp.value = '•'.repeat(20) + tk.slice(-6);
 inp.dataset.saved = '1';
 if (dot) { dot.style.background = '#10b981'; }
 if (txt) txt.textContent = 'Mercado Pago activo ';
 if (sub) sub.textContent = 'Los pagos online están habilitados para los clientes';
 } else {
 if (dot) dot.style.background = '#6b7280';
 if (txt) txt.textContent = 'No configurado';
 if (sub) sub.textContent = 'Ingresá tu Access Token para activar los pagos online';
 }
 } catch(e) { console.warn('[MP Admin]', e); }
}

window.admMpToggleToken = function() {
 const inp = document.getElementById('adm-mp-token-inp');
 const btn = document.getElementById('adm-mp-eye-btn');
 if (!inp) return;
 if (inp.type === 'password') {
 inp.type = 'text';
 if (inp.dataset.saved === '1') { inp.value = ''; inp.dataset.saved = '0'; inp.placeholder = 'Pegá el nuevo Access Token...'; }
 if (btn) btn.textContent = 'Ocultar';
 } else {
 inp.type = 'password';
 if (btn) btn.textContent = 'Ver';
 }
};

window.admMpGuardar = async function() {
 const inp = document.getElementById('adm-mp-token-inp');
 const fb = document.getElementById('adm-mp-feedback');
 if (!inp || !fb) return;
 const token = inp.value.trim();
 if (!token || token.includes('•')) {
 fb.style.display = 'block';
 fb.style.background = 'rgba(239,68,68,0.15)';
 fb.style.border = '1px solid #ef4444';
 fb.style.color = '#ef4444';
 fb.textContent = 'Pegá un Access Token válido primero.';
 return;
 }
 fb.style.display = 'block';
 fb.style.background = 'rgba(245,158,11,0.1)';
 fb.style.border = '1px solid var(--primary)';
 fb.style.color = 'var(--primary)';
 fb.textContent = 'Guardando...';
 try {
 await window.db.collection('config_menu').doc('mercadopago').set({ accessToken: token }, { merge: true });
 inp.value = '•'.repeat(20) + token.slice(-6);
 inp.dataset.saved = '1';
 inp.type = 'password';
 const btn = document.getElementById('adm-mp-eye-btn');
 if (btn) btn.textContent = 'Ver';
 fb.style.background = 'rgba(16,185,129,0.15)';
 fb.style.border = '1px solid #10b981';
 fb.style.color = '#10b981';
 fb.textContent = ' Access Token guardado. Mercado Pago está activo.';
 const dot = document.getElementById('adm-mp-status-dot');
 const txt = document.getElementById('adm-mp-status-txt');
 const sub = document.getElementById('adm-mp-status-sub');
 if (dot) dot.style.background = '#10b981';
 if (txt) txt.textContent = 'Mercado Pago activo ';
 if (sub) sub.textContent = 'Los pagos online están habilitados para los clientes';
 setTimeout(() => { fb.style.display = 'none'; }, 4000);
 } catch(e) {
 fb.style.background = 'rgba(239,68,68,0.15)';
 fb.style.border = '1px solid #ef4444';
 fb.style.color = '#ef4444';
 fb.textContent = 'Error al guardar: ' + e.message;
 }
};

// ── MERCADO PAGO — TOGGLE ACTIVO / INACTIVO ──────────────────────────────────
// Sincroniza la visibilidad de la opción MP en el select del checkout
function _syncMpOptionVisibility() {
 const opt = document.querySelector('#p-metodo option[value="Mercado Pago"]');
 if (!opt) return;
 const activo = window._mpActivo === true;
 opt.disabled = !activo;
 opt.style.display = activo ? '' : 'none';
 // Si estaba seleccionado y se desactiva, resetear a Efectivo
 const sel = document.getElementById('p-metodo');
 if (sel && sel.value === 'Mercado Pago' && !activo) sel.value = 'Efectivo';
}

// Función llamada desde el toggle del admin
window.admMpToggleActivo = async function(checked) {
 const desc = document.getElementById('adm-mp-toggle-desc');
 try {
   await window.db.collection('config_menu').doc('mercadopago').set({ mpActivo: checked }, { merge: true });
   window._mpActivo = checked;
   _syncMpOptionVisibility();
   if (desc) desc.textContent = checked
     ? 'Activado — los clientes ven la opción Mercado Pago'
     : 'Desactivado — la opción no aparece para los clientes';
 } catch(e) {
   console.error('[MP Toggle]', e);
   // Revertir el toggle si falla
   const toggleEl = document.getElementById('adm-mp-master-toggle');
   if (toggleEl) toggleEl.checked = !checked;
 }
};

// Cargar estado MP al iniciar la app (para el checkout de clientes)
(function _initMpStatus() {
 function _load() {
   if (!window.db) { setTimeout(_load, 800); return; }
   window.db.collection('config_menu').doc('mercadopago').get().then(snap => {
     window._mpActivo = snap.exists ? (snap.data()?.mpActivo !== false) : false;
     // Solo mostrar MP si está explícitamente activado Y tiene token
     if (!snap.exists || !snap.data()?.accessToken) window._mpActivo = false;
     _syncMpOptionVisibility();
   }).catch(() => {
     window._mpActivo = false;
     _syncMpOptionVisibility();
   });
 }
 if (document.readyState === 'loading') {
   document.addEventListener('DOMContentLoaded', _load);
 } else { _load(); }
 document.addEventListener('firebase:ready', _load, { once: true });
})();

// GESTIÓN DE PROMOS (CRUD COMPLETO) 
let admPromosData = [];
let admPromoEditando = null; // null = nueva promo

async function admCargarPromos() {
 const cont = document.getElementById('adm-promos-lista');
 if (!cont) return;
 cont.innerHTML = '<p style="color:#9ca3af;padding:20px;text-align:center;">Cargando promos...</p>';

 // Cargar overrides desde Firestore
 let ovPromos = {};
 try {
 const snap = await db.collection('config_menu').doc('promos_override').get();
 if (snap.exists) ovPromos = snap.data();
 } catch(e) { console.warn('promos_override:', e); }

 // Construir lista: base + extras creadas en Firestore
 admPromosData = PROMOS_DATA.map(p => ({
 ...p,
 ...(ovPromos[p.id] || {}),
 _base: true
 }));

 // Promos extra creadas solo en Firestore (no están en PROMOS_DATA)
 Object.keys(ovPromos).forEach(key => {
 if (!admPromosData.find(p => p.id === key) && ovPromos[key]._custom) {
 admPromosData.push({ ...ovPromos[key], id: key, _base: false });
 }
 });

 admRenderPromos();
}

function admRenderPromos() {
 const cont = document.getElementById('adm-promos-lista');
 if (!cont) return;
 const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

 let html = `
 <!-- Botón nueva promo --><button onclick="admAbrirFormPromo(null)"
 style="width:100%;margin-bottom:16px;padding:12px;background:rgba(245,158,11,.12);border:2px dashed var(--primary);color:var(--primary);border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;"> AGREGAR NUEVA PROMO
 </button><!-- Formulario inline (oculto por defecto) --><div id="adm-promo-form" style="display:none;background:#111;border:1px solid var(--primary);border-radius:14px;padding:16px;margin-bottom:18px;">
<div style="font-size:13px;font-weight:800;color:var(--primary);margin-bottom:12px;" id="adm-promo-form-title">NUEVA PROMO</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">

  <!-- Nombre -->
  <div style="grid-column:1/-1;">
    <div style="font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">NOMBRE DE LA PROMO *</div>
    <input id="pf-nombre" type="text" placeholder="Ej: Compartir Hulk"
      style="width:100%;padding:9px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:13px;outline:none;box-sizing:border-box;">
  </div>

  <!-- Descripción -->
  <div style="grid-column:1/-1;">
    <div style="font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">DESCRIPCIÓN</div>
    <input id="pf-desc" type="text" placeholder="Descripción breve para el cliente"
      style="width:100%;padding:9px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:13px;outline:none;box-sizing:border-box;">
  </div>

  <!-- Precio original -->
  <div>
    <div style="font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">PRECIO ORIGINAL $</div>
    <input id="pf-porig" type="number" placeholder="15500"
      style="width:100%;padding:9px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:13px;outline:none;box-sizing:border-box;">
  </div>

  <!-- Precio promo -->
  <div>
    <div style="font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">PRECIO PROMO $</div>
    <input id="pf-precio" type="number" placeholder="12000"
      style="width:100%;padding:9px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:13px;outline:none;box-sizing:border-box;">
  </div>

  <!-- Código de promo -->
  <div>
    <div style="font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">CÓDIGO (opcional)</div>
    <input id="pf-codigo" type="text" placeholder="Ej: HULK50" maxlength="20"
      oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'')"
      style="width:100%;padding:9px;background:var(--bg);border:1px solid rgba(139,92,246,.4);border-radius:8px;color:#a78bfa;font-size:13px;outline:none;font-family:monospace;font-weight:700;letter-spacing:.5px;box-sizing:border-box;">
    <div style="font-size:9px;color:#6b7280;margin-top:3px;">Aparece en comanda y en la tarjeta</div>
  </div>

  <!-- Medio de pago -->
  <div>
    <div style="font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">MEDIO DE PAGO</div>
    <select id="pf-metodo-pago"
      style="width:100%;padding:9px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:13px;outline:none;box-sizing:border-box;">
      <option value="todos">Todos los medios</option>
      <option value="efectivo">Solo Efectivo</option>
      <option value="mp">Solo Mercado Pago</option>
      <option value="transferencia">Solo Transferencia</option>
    </select>
  </div>

  <!-- Segunda unidad -->
  <div style="grid-column:1/-1;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2);border-radius:8px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;">
    <div>
      <div style="font-size:12px;font-weight:700;color:#10b981;">50% en la 2da unidad</div>
      <div style="font-size:10px;color:#6b7280;margin-top:2px;">El cliente paga la mitad al agregar una segunda vez este producto</div>
    </div>
    <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;">
      <input type="checkbox" id="pf-segunda-unidad" style="opacity:0;width:0;height:0;"
        onchange="const s=this.nextElementSibling;const d=s.nextElementSibling;s.style.background=this.checked?'#10b981':'#333';d.style.left=this.checked?'22px':'2px';">
      <span style="position:absolute;inset:0;background:#333;border-radius:12px;transition:.3s;"></span>
      <span style="position:absolute;top:2px;left:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:.3s;box-shadow:0 1px 4px rgba(0,0,0,.4);"></span>
    </label>
  </div>

  <!-- Imagen -->
  <div style="grid-column:1/-1;">
    <div style="font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">URL DE IMAGEN</div>
    <input id="pf-img" type="url" placeholder="https://i.ibb.co/..."
      oninput="admPreviewPromoImg()"
      style="width:100%;padding:9px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:12px;outline:none;box-sizing:border-box;">
    <img id="pf-img-preview" src="" loading="lazy" decoding="async"
      style="display:none;width:100%;height:100px;object-fit:cover;border-radius:8px;margin-top:6px;border:1px solid var(--border);">
  </div>

  <!-- Día de venta -->
  <div>
    <div style="font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">DÍA DE VENTA</div>
    <select id="pf-dia"
      style="width:100%;padding:9px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:13px;outline:none;box-sizing:border-box;">
      <option value="null">Todos los días</option>
      ${DIAS.map((d,i) => `<option value=\"${i}\">${d}</option>`).join('')}
    </select>
  </div>

  <!-- Rango de fechas -->
  <div style="grid-column:1/-1;">
    <div style="font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:6px;">VÁLIDA ENTRE FECHAS (opcional)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div>
        <div style="font-size:9px;color:#6b7280;margin-bottom:3px;">DESDE</div>
        <input id="pf-fecha-desde" type="date"
          style="width:100%;padding:9px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:12px;outline:none;box-sizing:border-box;color-scheme:dark;">
      </div>
      <div>
        <div style="font-size:9px;color:#6b7280;margin-bottom:3px;">HASTA</div>
        <input id="pf-fecha-hasta" type="date"
          style="width:100%;padding:9px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:12px;outline:none;box-sizing:border-box;color-scheme:dark;">
      </div>
    </div>
    <div style="font-size:9px;color:#6b7280;margin-top:4px;">Sin fechas = disponible siempre. Con fechas = solo visible en ese rango.</div>
  </div>

</div>

<!-- Botones -->
<div style="display:flex;gap:8px;margin-top:4px;">
  <button onclick="admGuardarFormPromo()"
    style="flex:1;padding:10px;background:var(--primary);color:#000;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">
    GUARDAR
  </button>
  <button onclick="admCerrarFormPromo()"
    style="padding:10px 16px;background:rgba(255,255,255,.05);border:1px solid var(--border);color:#9ca3af;border-radius:8px;font-size:13px;cursor:pointer;">
    Cancelar
  </button>
</div>
<div id="pf-error" style="color:#ef4444;font-size:11px;margin-top:6px;text-align:center;"></div></div><!-- Lista de promos --><div id="adm-promos-cards">`;

 admPromosData.forEach(p => {
 const activo = p.activo !== false;
 const diaLabel = p.diaVenta !== null && p.diaVenta !== undefined ? DIAS[p.diaVenta] : 'Todos los días';
 const descuento = p.pOriginal > p.p ? Math.round((1 - p.p / p.pOriginal) * 100) : 0;
 html += `
 <div style="background:var(--surface);border:1px solid ${activo ? 'var(--border)' : '#ef444444'};border-radius:12px;margin-bottom:10px;overflow:hidden;"><div style="display:flex;gap:10px;padding:12px;">${(p.img && p.img !== 'undefined') ? `<img src="${p.img}" loading="lazy" decoding="async" width="60" height="60" style="width:60px;height:60px;object-fit:cover;border-radius:8px;flex-shrink:0;background:#333;" onerror="this.style.display='none'">` : `<div style="width:60px;height:60px;border-radius:8px;flex-shrink:0;background:#333;font-size:20px;display:flex;align-items:center;justify-content:center;"></div>`}<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:800;color:${activo ? 'var(--white)' : '#666'};margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.n}</div><div style="font-size:10px;color:#9ca3af;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.d || ''}</div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-size:11px;color:#9ca3af;text-decoration:line-through;">$${(p.pOriginal||0).toLocaleString('es-AR')}</span><span style="font-size:14px;font-weight:800;color:#10b981;">$${(p.p||0).toLocaleString('es-AR')}</span> ${descuento > 0 ? `<span style="background:rgba(16,185,129,.15);color:#10b981;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;">-${descuento}%</span>` : ''}
 <span style="background:rgba(245,158,11,.12);color:var(--primary);font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;"> ${diaLabel}</span>
 ${p.codigoPromo ? `<span style="background:rgba(139,92,246,.18);color:#a78bfa;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;font-family:monospace;">${p.codigoPromo}</span>` : ""}
 ${p.segundaUnidad ? `<span style="background:rgba(16,185,129,.12);color:#10b981;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;">50% 2da ud.</span>` : ""}
 ${p.metodoPago && p.metodoPago !== "todos" ? `<span style="background:rgba(59,130,246,.12);color:#60a5fa;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;">${p.metodoPago==="efectivo"?" Efectivo":p.metodoPago==="mp"?" MP":p.metodoPago}</span>` : ""}
 ${(p.fechaDesde || p.fechaHasta) ? `<span style="background:rgba(245,158,11,.1);color:var(--primary);font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;"> ${p.fechaDesde||"?"} → ${p.fechaHasta||"?"}</span>` : ""}</div></div><div style="display:flex;flex-direction:column;align-items:center;gap:4px;"><label class="adm-toggle" title="${activo ? 'Desactivar' : 'Activar'}"><input type="checkbox" ${activo ? 'checked' : ''} onchange="admTogglePromo('${p.id}')"><span class="adm-toggle-slider"></span></label><span style="font-size:9px;color:${activo ? '#10b981' : '#ef4444'};font-weight:700;">${activo ? 'ON' : 'OFF'}</span></div></div><div style="display:flex;gap:0;border-top:1px solid var(--border);"><button onclick="admAbrirFormPromo('${p.id}')"
 style="flex:1;padding:8px;background:transparent;border:none;border-right:1px solid var(--border);color:var(--primary);font-size:12px;font-weight:700;cursor:pointer;"> Editar
 </button> ${!p._base ? `
 <button onclick="admEliminarPromo('${p.id}')"
 style="flex:1;padding:8px;background:transparent;border:none;color:#ef4444;font-size:12px;font-weight:700;cursor:pointer;"> Eliminar
 </button>` : `
 <button onclick="admResetPromo('${p.id}')"
 style="flex:1;padding:8px;background:transparent;border:none;color:#9ca3af;font-size:12px;cursor:pointer;"
 title="Restaurar valores originales"> ↺ Restaurar
 </button>`}
 </div></div>`;
 });

 html += `</div>`; // /adm-promos-cards
 cont.innerHTML = html;
}

window.admPreviewPromoImg = () => {
 const url = document.getElementById('pf-img')?.value || '';
 const img = document.getElementById('pf-img-preview');
 if (!img) return;
 if (url.startsWith('http')) {
 img.src = url; img.style.display = 'block';
 } else {
 img.style.display = 'none';
 }
};

window.admAbrirFormPromo = (id) => {
 admPromoEditando = id;
 const form = document.getElementById('adm-promo-form');
 const title = document.getElementById('adm-promo-form-title');
 const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
 if (!form) return;

 if (id) {
 // Editar existente
 const p = admPromosData.find(x => x.id === id);
 if (!p) return;
 title.innerText = 'EDITANDO: ' + p.n;
 document.getElementById('pf-nombre').value = p.n || '';
 document.getElementById('pf-desc').value = p.d || '';
 document.getElementById('pf-porig').value = p.pOriginal || '';
 document.getElementById('pf-precio').value = p.p || '';
 document.getElementById('pf-img').value = p.img || '';
 document.getElementById('pf-dia').value = p.diaVenta !== null && p.diaVenta !== undefined ? p.diaVenta : 'null';
 admPreviewPromoImg();
 // Nuevos campos
 const _pfCod=document.getElementById('pf-codigo'); if(_pfCod)_pfCod.value=p.codigoPromo||'';
 const _pfMet=document.getElementById('pf-metodo-pago'); if(_pfMet)_pfMet.value=p.metodoPago||'todos';
 const _pfSeg=document.getElementById('pf-segunda-unidad'); if(_pfSeg){_pfSeg.checked=p.segundaUnidad===true;const sp=_pfSeg.nextElementSibling,dp=sp&&sp.nextElementSibling;if(sp)sp.style.background=_pfSeg.checked?'#10b981':'#333';if(dp)dp.style.left=_pfSeg.checked?'22px':'2px';}
 const _pfDesde=document.getElementById('pf-fecha-desde'); if(_pfDesde)_pfDesde.value=p.fechaDesde||'';
 const _pfHasta=document.getElementById('pf-fecha-hasta'); if(_pfHasta)_pfHasta.value=p.fechaHasta||'';
 } else {
 // Nueva promo
 title.innerText = 'NUEVA PROMO';
 ['pf-nombre','pf-desc','pf-porig','pf-precio','pf-img','pf-codigo','pf-fecha-desde','pf-fecha-hasta'].forEach(id => {
 const el = document.getElementById(id); if (el) el.value = '';
 });
 document.getElementById('pf-dia').value = 'null';
 const _pfMet=document.getElementById('pf-metodo-pago'); if(_pfMet)_pfMet.value='todos';
 const _pfSeg=document.getElementById('pf-segunda-unidad'); if(_pfSeg){_pfSeg.checked=false;const sp=_pfSeg.nextElementSibling,dp=sp&&sp.nextElementSibling;if(sp)sp.style.background='#333';if(dp)dp.style.left='2px';}
 const prev = document.getElementById('pf-img-preview');
 if (prev) prev.style.display = 'none';
 }
 document.getElementById('pf-error').innerText = '';
 form.style.display = 'block';
 form.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.admCerrarFormPromo = () => {
 const form = document.getElementById('adm-promo-form');
 if (form) form.style.display = 'none';
 admPromoEditando = null;
};

window.admGuardarFormPromo = async () => {
 const nombre = document.getElementById('pf-nombre')?.value.trim();
 const desc = document.getElementById('pf-desc')?.value.trim();
 const pOrig = parseInt(document.getElementById('pf-porig')?.value);
 const precio = parseInt(document.getElementById('pf-precio')?.value);
 const img = document.getElementById('pf-img')?.value.trim();
 const diaRaw = document.getElementById('pf-dia')?.value;
 const dia = diaRaw === 'null' ? null : parseInt(diaRaw);
 const codigoPromo   = (document.getElementById('pf-codigo')?.value || '').trim().toUpperCase();
 const metodoPago    = document.getElementById('pf-metodo-pago')?.value || 'todos';
 const segundaUnidad = document.getElementById('pf-segunda-unidad')?.checked === true;
 const fechaDesde    = document.getElementById('pf-fecha-desde')?.value || null;
 const fechaHasta    = document.getElementById('pf-fecha-hasta')?.value || null;
 const errEl = document.getElementById('pf-error');

 if (!nombre) { errEl.innerText = 'El nombre es obligatorio.'; return; }
 if (!pOrig || !precio) { errEl.innerText = 'Los precios son obligatorios.'; return; }
 if (precio > pOrig) { errEl.innerText = 'El precio promo no puede ser mayor al original.'; return; }
 errEl.innerText = '';

 let ov = {};
 try { const s = await db.collection('config_menu').doc('promos_override').get(); if (s.exists) ov = s.data(); } catch(e) {}

 const isNueva = !admPromoEditando;
 const id = admPromoEditando || ('custom-' + Date.now());

 ov[id] = {
 n: nombre, d: desc, pOriginal: pOrig, p: precio,
 img: img || '', diaVenta: dia, cat: 'Promos', ings: [],
 activo: true,
 codigoPromo: codigoPromo || null,
 metodoPago: metodoPago || 'todos',
 segundaUnidad: segundaUnidad || false,
 fechaDesde: fechaDesde || null,
 fechaHasta: fechaHasta || null,
 ...(isNueva ? { _custom: true } : {})
 };

 try {
 await db.collection('config_menu').doc('promos_override').set(ov, { merge: false });

 // Actualizar PROMOS_DATA en memoria si es edición de promo base
 if (admPromoEditando) {
 const idx = PROMOS_DATA.findIndex(p => p.id === admPromoEditando);
 if (idx >= 0) {
 PROMOS_DATA[idx] = { ...PROMOS_DATA[idx], n: nombre, d: desc, pOriginal: pOrig, p: precio, img: img || '', diaVenta: dia };
 }
 }

 admCerrarFormPromo();
 await admCargarPromos();
 } catch(e) { errEl.innerText = 'Error al guardar: ' + e.message; }
};

window.admTogglePromo = async (id) => {
 let ov = {};
 try { const s = await db.collection('config_menu').doc('promos_override').get(); if (s.exists) ov = s.data(); } catch(e) {}
 const cur = ov[id] || {};
 const nuevoActivo = cur.activo === false ? true : false;
 ov[id] = { ...cur, activo: nuevoActivo };
 try {
 await db.collection('config_menu').doc('promos_override').set(ov, { merge: false });
 await admCargarPromos();
 } catch(e) { alert('Error: ' + e.message); }
};

window.admEliminarPromo = async (id) => {
 if (!confirm('¿Eliminar esta promo permanentemente?')) return;
 let ov = {};
 try { const s = await db.collection('config_menu').doc('promos_override').get(); if (s.exists) ov = s.data(); } catch(e) {}
 delete ov[id];
 try {
 await db.collection('config_menu').doc('promos_override').set(ov, { merge: false });
 await admCargarPromos();
 } catch(e) { alert('Error: ' + e.message); }
};

window.admResetPromo = async (id) => {
 if (!confirm('¿Restaurar esta promo a sus valores originales?')) return;
 let ov = {};
 try { const s = await db.collection('config_menu').doc('promos_override').get(); if (s.exists) ov = s.data(); } catch(e) {}
 delete ov[id];
 try {
 await db.collection('config_menu').doc('promos_override').set(ov, { merge: false });
 // Restaurar en memoria
 const base = PROMOS_DATA.find(p => p.id === id);
 if (base) { /* ya está en PROMOS_DATA original */ }
 await admCargarPromos();
 } catch(e) { alert('Error: ' + e.message); }
};

// GESTIÓN DE CUPONES 
const DIAS_SEMANA = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const TIPOS_CUPON = [
 { v: 'porcentaje', l: '% Descuento sobre total' },
 { v: 'regalo_papas', l: 'Papas gratis con burger' },
 { v: 'regalo_veggie', l: '% Descuento en Veggies' },
 { v: 'descuento_efectivo', l: 'Monto fijo de descuento ($)' },
 { v: 'regalo_libre', l: 'Regalo personalizado (desc. libre)' },
];

async function admCargarCupones() {
 const cont = document.getElementById('adm-cupones-lista');
 if (!cont) return;
 cont.innerHTML = '<p style="color:#9ca3af;padding:20px;text-align:center;">Cargando...</p>';
 let ovCupones = {};
 try {
 const snap = await db.collection('config_menu').doc('cupones_override').get();
 if (snap.exists) ovCupones = snap.data();
 } catch(e) {}
 admRenderCupones(ovCupones);
}

function admRenderCupones(ov) {
 const cont = document.getElementById('adm-cupones-lista');
 if (!cont) return;
 cont.innerHTML = [0,1,2,3,4,5,6].map(dia => {
 const base = CUPONES_DEL_DIA[dia] || {};
 const over = ov[dia] || {};
 const c = { ...base, ...over };
 const titulo = c.titulo || '';
 const desc = c.desc || '';
 const code = c.code || '';
 const tipo = c.tipo || 'porcentaje';
 const valor = c.valor !== undefined ? c.valor : 0;
 const horario = c.horario || 'siempre';
 const activo = over.activo !== false; // default true
 return `
 <div style="background:var(--surface);border:1px solid ${activo ? 'var(--border)' : '#ef444455'};border-radius:12px;padding:14px;margin-bottom:10px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><div style="font-size:13px;font-weight:800;color:var(--primary);">${DIAS_SEMANA[dia]}</div><div style="display:flex;align-items:center;gap:6px;"><span id="cup-label-${dia}" style="font-size:10px;color:${activo?'#10b981':'#ef4444'};font-weight:700;">${activo?'ACTIVO':'INACTIVO'}</span><label class="adm-toggle"><input type="checkbox" id="cup-toggle-${dia}" ${activo?'checked':''} onchange="admToggleCupon(${dia})"><span class="adm-toggle-slider"></span></label></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;"><div><div style="font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">TÍTULO</div><input id="cup-titulo-${dia}" type="text" value="${titulo}" placeholder="Ej: LUNES DE BURGER"
 style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:12px;outline:none;"></div><div><div style="font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">CÓDIGO</div><input id="cup-code-${dia}" type="text" value="${code}" placeholder="SIN ESPACIOS"
 style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:12px;outline:none;text-transform:uppercase;"></div></div><div style="margin-bottom:8px;"><div style="font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">DESCRIPCIÓN</div><input id="cup-desc-${dia}" type="text" value="${desc}" placeholder="Descripción visible al cliente"
 style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:12px;outline:none;"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;"><div><div style="font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">TIPO</div><select id="cup-tipo-${dia}" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:11px;outline:none;"> ${TIPOS_CUPON.map(t => `<option value="${t.v}" ${tipo===t.v?'selected':''}>${t.l}</option>`).join('')}
 </select></div><div><div style="font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">VALOR (% o $)</div><input id="cup-valor-${dia}" type="number" value="${valor}" placeholder="0"
 style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:13px;outline:none;"></div></div><div style="margin-bottom:10px;"><div style="font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:4px;">HORARIO ACTIVO</div><select id="cup-horario-${dia}" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:12px;outline:none;"><option value="siempre" ${horario==='siempre'?'selected':''}>Todo el día</option><option value="mediodía" ${horario==='mediodía'?'selected':''}>Solo mediodía (11-16hs)</option><option value="noche" ${horario==='noche'?'selected':''}>Solo noche (20-23hs)</option></select></div><button onclick="admGuardarCupon(${dia})"
 style="width:100%;background:rgba(245,158,11,.15);border:1px solid var(--primary);color:var(--primary);padding:8px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;"> Guardar cupón del ${DIAS_SEMANA[dia]}
 </button><div id="cup-feedback-${dia}" style="font-size:11px;color:#10b981;text-align:center;height:16px;margin-top:4px;"></div></div>`;
 }).join('');
}

window.admToggleCupon = async (dia) => {
 // Leer el estado ACTUAL del checkbox en el DOM (no releer de Firestore para evitar race condition)
 const checkboxEl = document.getElementById('cup-toggle-' + dia);
 const nuevoActivo = checkboxEl ? checkboxEl.checked : true;
 let ov = {};
 try { const s = await db.collection('config_menu').doc('cupones_override').get(); if(s.exists) ov = s.data()||{}; } catch(e) {}
 const cur = ov[dia] || {};
 const upd = {}; upd[dia] = { ...cur, activo: nuevoActivo };
 try {
 await db.collection('config_menu').doc('cupones_override').set(upd, { merge: true });
 // Actualizar visual sin re-renderizar todo
 const labelEl = document.getElementById('cup-label-' + dia);
 if (labelEl) {
 labelEl.innerText = nuevoActivo ? 'Activo' : 'Inactivo';
 labelEl.style.color = nuevoActivo ? '#10b981' : '#ef4444';
 }
 const cardEl = document.getElementById('cup-card-' + dia);
 if (cardEl) cardEl.style.opacity = nuevoActivo ? '1' : '0.5';
 const fb = document.getElementById('cup-feedback-' + dia);
 if (fb) { fb.innerText = nuevoActivo ? 'Cupón activado' : 'Cupón desactivado'; setTimeout(() => { if(fb) fb.innerText = ''; }, 2000); }
 } catch(e) {
 // Revertir checkbox en caso de error
 if (checkboxEl) checkboxEl.checked = !nuevoActivo;
 alert('Error: ' + e.message);
 }
};

window.admGuardarCupon = async (dia) => {
 const get = id => document.getElementById(id)?.value || '';
 const titulo = get(`cup-titulo-${dia}`).trim();
 const code = get(`cup-code-${dia}`).trim().toUpperCase().replace(/\s/g,'');
 const desc = get(`cup-desc-${dia}`).trim();
 const tipo = get(`cup-tipo-${dia}`);
 const valor = parseFloat(get(`cup-valor-${dia}`)) || 0;
 const horario = get(`cup-horario-${dia}`);
 if (!titulo || !code) return alert('Título y Código son obligatorios.');
 // Leer activo actual
 let ov = {};
 try { const s = await db.collection('config_menu').doc('cupones_override').get(); if(s.exists) ov = s.data(); } catch(e) {}
 const curActivo = (ov[dia] || {}).activo !== false;
 const upd = {}; upd[dia] = { titulo, code, desc, tipo, valor, horario, activo: curActivo };
 try {
 await db.collection('config_menu').doc('cupones_override').set(upd, { merge: true });
 // Actualizar en memoria
 CUPONES_DEL_DIA[dia] = { titulo, code, desc, tipo, valor, horario };
 const fb = document.getElementById(`cup-feedback-${dia}`);
 if (fb) { fb.innerText = ' Guardado'; setTimeout(() => { fb.innerText = ''; }, 2000); }
 } catch(e) { alert('Error: ' + e.message); }
};

// 
// ADMIN — GESTIÓN DE CÓDIGOS DE DESCUENTO
// 
async function admCargarCodigos() {
 const listaInt = document.getElementById('adm-codigos-internos-lista');
 const listaPro = document.getElementById('adm-codigos-promos-lista');
 if (!listaInt || !listaPro) return;
 listaInt.innerHTML = '<p style="color:#9ca3af;font-size:12px;text-align:center;padding:10px;">Cargando...</p>';
 listaPro.innerHTML = '<p style="color:#9ca3af;font-size:12px;text-align:center;padding:10px;">Cargando...</p>';
 
 let ov = {};
 try {
 const snap = await db.collection('config_menu').doc('codigos_descuento').get();
 if (snap.exists) ov = snap.data() || {};
 window._codDescOverrides = ov;
 } catch(e) {}

 // Sync master toggle UI
 const masterActivo = ov._master_activo === true;
 window._codDescMasterActivo = masterActivo;
 const toggle = document.getElementById('adm-cod-master-toggle');
 const desc = document.getElementById('adm-cod-master-desc');
 const card = document.getElementById('adm-cod-master-card');
 if (toggle) toggle.checked = masterActivo;
 if (card) card.style.border = masterActivo ? '2px solid #10b981' : '2px solid var(--border)';
 if (desc) desc.textContent = masterActivo
 ? 'Activo — los clientes pueden ingresar un código en el checkout'
 : 'Desactivado — el campo de código no aparece para los clientes';

 // Migrar posibles claves erróneas 'interno'/'promo' (bug anterior) hacia 'internos'/'promos'
 if (ov.interno && !ov.internos) ov.internos = ov.interno;
 if (ov.promo && !ov.promos) ov.promos = ov.promo;
 // Solo datos de Firebase — sin base hardcodeada
 const internos = ov.internos ? { ...ov.internos } : {};
 const promos   = ov.promos   ? { ...ov.promos }   : {};

 // Render internos + totales consumidos
 const pedHoy = admPedidos || [];
 listaInt.innerHTML = Object.entries(internos).map(([cod, dat]) => {
 const activo = dat.activo !== false;
 const usos = pedHoy.filter(p => p.cuponUsado && p.cuponUsado.includes(dat.nombre)).length;
 const totalConsumido = pedHoy.filter(p => p.cuponUsado && p.cuponUsado.includes(dat.nombre)).reduce((s,p) => s + (p.subtotal||0), 0);
 return `
 <div style="background:var(--bg);border:1px solid ${activo?'rgba(16,185,129,0.3)':'var(--border)'};border-radius:10px;padding:12px;margin-bottom:8px;"> <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;"> <div> <div style="font-size:13px;font-weight:800;color:var(--white);">${dat.nombre}</div> <div style="font-size:10px;color:#9ca3af;font-weight:700;letter-spacing:1px;margin-top:1px;">CÓDIGO: <span style="color:var(--primary);">${cod}</span></div> </div> <div style="text-align:right;"> <div style="font-size:11px;color:${activo?'#10b981':'#ef4444'};font-weight:700;">${activo?'ACTIVO':'INACTIVO'}</div> <label class="adm-toggle" style="margin-top:4px;"><input type="checkbox" ${activo?'checked':''} onchange="admToggleCodigo('interno','${cod}',this.checked)"><span class="adm-toggle-slider"></span></label> </div> </div> <div style="display:flex;gap:8px;font-size:11px;"> <span style="background:rgba(16,185,129,0.15);color:#10b981;padding:3px 9px;border-radius:6px;font-weight:700;">100% OFF productos</span> <span style="background:rgba(255,255,255,0.07);color:#9ca3af;padding:3px 9px;border-radius:6px;">Usos hoy: ${usos}</span> ${totalConsumido > 0 ? `<span style="background:rgba(245,158,11,0.1);color:var(--primary);padding:3px 9px;border-radius:6px;font-weight:700;">Consumido: $${totalConsumido.toLocaleString('es-AR')}</span>` : ''}
 </div> </div>`;
 }).join('') || '<p style="color:#9ca3af;text-align:center;font-size:12px;padding:10px;">Sin entradas</p>';

 // Render promos
 listaPro.innerHTML = Object.entries(promos).map(([cod, dat]) => {
 const activo = dat.activo !== false;
 const usos = pedHoy.filter(p => p.cuponUsado && p.cuponUsado === dat.titulo).length;
 return `
 <div style="background:var(--bg);border:1px solid ${activo?'rgba(245,158,11,0.3)':'var(--border)'};border-radius:10px;padding:12px;margin-bottom:8px;"> <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;"> <div> <div style="font-size:13px;font-weight:800;color:var(--white);">${dat.titulo}</div> <div style="font-size:10px;color:#9ca3af;font-weight:700;letter-spacing:1px;margin-top:1px;">CÓDIGO: <span style="color:var(--primary);">${cod}</span></div> </div> <div style="text-align:right;"> <div style="font-size:11px;color:${activo?'#10b981':'#ef4444'};font-weight:700;">${activo?'ACTIVO':'INACTIVO'}</div> <label class="adm-toggle" style="margin-top:4px;"><input type="checkbox" ${activo?'checked':''} onchange="admToggleCodigo('promo','${cod}',this.checked)"><span class="adm-toggle-slider"></span></label> </div> </div> <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;"> <span style="background:rgba(245,158,11,0.15);color:var(--primary);padding:3px 9px;border-radius:6px;font-weight:700;">${dat.descPct}% OFF</span> ${dat.soloEfectivo ? '<span style="background:rgba(59,130,246,0.15);color:#3b82f6;padding:3px 9px;border-radius:6px;">Solo Efectivo</span>' : ''}
 <span style="background:rgba(255,255,255,0.07);color:#9ca3af;padding:3px 9px;border-radius:6px;">Usos hoy: ${usos}</span> </div> </div>`;
 }).join('') || '<p style="color:#9ca3af;text-align:center;font-size:12px;padding:10px;">Sin entradas</p>';
}

window.admToggleCodigo = async (tipo, cod, nuevoActivo) => {
 // Mapear 'interno' -> 'internos' y 'promo' -> 'promos' para coincidir con Firestore
 const key = tipo === 'interno' ? 'internos' : 'promos';
 let ov = {};
 try { const s = await db.collection('config_menu').doc('codigos_descuento').get(); if(s.exists) ov = s.data()||{}; } catch(e) {}
 if (!ov[key]) ov[key] = {};
 if (!ov[key][cod]) ov[key][cod] = {};
 ov[key][cod].activo = nuevoActivo;
 try {
 await db.collection('config_menu').doc('codigos_descuento').set(ov, { merge: true });
 window._codDescOverrides = ov;
 // Pequeño delay para asegurar que Firestore procesó el write antes de releer
 setTimeout(() => admCargarCodigos(), 400);
 } catch(e) {
 alert('Error: ' + e.message);
 // Revertir UI en caso de error
 admCargarCodigos();
 }
};

window.admAgregarCodigoInterno = async () => {
 const nombre = prompt('Nombre de la persona:');
 if (!nombre || !nombre.trim()) return;
 const cod = nombre.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');
 if (!cod) return alert('Nombre inválido.');
 let ov = {};
 try { const s = await db.collection('config_menu').doc('codigos_descuento').get(); if(s.exists) ov = s.data()||{}; } catch(e) {}
 if (!ov.internos) ov.internos = {};
 ov.internos[cod] = { nombre: nombre.trim(), tipo: 'interno', descPct: 100, activo: true };
 try {
 await db.collection('config_menu').doc('codigos_descuento').set(ov, { merge: true });
 window._codDescOverrides = ov;
 admCargarCodigos();
 } catch(e) { alert('Error: ' + e.message); }
};

window.admAgregarCodigoPromo = async () => {
 const titulo = prompt('Título del código (visible al cliente):');
 if (!titulo || !titulo.trim()) return;
 const cod = prompt('Código (sin espacios, se convierte a mayúsculas):');
 if (!cod || !cod.trim()) return;
 const pct = parseInt(prompt('Porcentaje de descuento (ej: 10):') || '0');
 if (isNaN(pct) || pct <= 0) return alert('Porcentaje inválido.');
 const soloEfectivo = confirm('¿Válido SOLO pagando en Efectivo?');
 const codClean = cod.trim().toUpperCase().replace(/\s+/g,'');
 let ov = {};
 try { const s = await db.collection('config_menu').doc('codigos_descuento').get(); if(s.exists) ov = s.data()||{}; } catch(e) {}
 if (!ov.promos) ov.promos = {};
 ov.promos[codClean] = { titulo: titulo.trim(), tipo: 'promo_pct', descPct: pct, soloEfectivo, activo: true };
 try {
 await db.collection('config_menu').doc('codigos_descuento').set(ov, { merge: true });
 window._codDescOverrides = ov;
 admCargarCodigos();
 } catch(e) { alert('Error: ' + e.message); }
};


async function admCargarDashboard() {
 // FIX: usar _filtrarPedidosParaMetricas para excluir Anulado/Cancelado.
 // Antes se usaba admPedidos directamente y los cancelados inflaban totales.
 const p = typeof _filtrarPedidosParaMetricas === 'function'
   ? _filtrarPedidosParaMetricas(admPedidos)
   : admPedidos;
 const g = id => document.getElementById(id);
 const cash = p.reduce((a,x) => a+(x.total||0), 0);
 if(g('dash-total')) g('dash-total').innerText = p.length;
 if(g('dash-cash')) g('dash-cash').innerText = '$'+cash.toLocaleString('es-AR');
 if(g('dash-ticket')) g('dash-ticket').innerText = '$'+(p.length?Math.round(cash/p.length):0).toLocaleString('es-AR');
 if(g('dash-tipos')) g('dash-tipos').innerText = p.filter(x=>x.tipo==='Delivery').length+' / '+p.filter(x=>x.tipo==='Retiro').length;

 // Ventas por hora
 const ph = {};
 p.forEach(x => { if(!x.fecha) return; const d=x.fecha.toDate?x.fecha.toDate():new Date(x.fecha); ph[d.getHours()]=(ph[d.getHours()]||0)+(x.total||0); });
 const mx = Math.max(...Object.values(ph),1);
 if(g('dash-chart-horas')) g('dash-chart-horas').innerHTML = Array.from({length:24},(_,h) => {
 const v=ph[h]||0; const pct=Math.round(v/mx*100);
 return '<div style="flex:1;height:'+Math.max(pct,2)+'%;background:'+(v>0?'var(--primary)':'#2a2a2a')+';border-radius:3px 3px 0 0;min-width:6px;" title="'+h+'hs"></div>';
 }).join('');

 // Top productos
 const pc = {};
 p.forEach(x => (x.items||[]).forEach(i => { pc[i.n]=(pc[i.n]||{cant:0,tot:0}); pc[i.n].cant+=i.cant; pc[i.n].tot+=(i.totalItem||0); }));
 const top = Object.entries(pc).sort((a,b)=>b[1].cant-a[1].cant).slice(0,8);
 const mc = top.length?top[0][1].cant:1;
 if(g('dash-top-prods')) g('dash-top-prods').innerHTML = top.map(([n,d],i) => '<div style="margin-bottom:8px;"><div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:var(--white);">'+(i+1)+'. '+n+'</span><span style="color:#9ca3af;">'+d.cant+' ud</span></div><div style="height:6px;background:#333;border-radius:3px;margin-top:3px;"><div style="height:100%;width:'+Math.round(d.cant/mc*100)+'%;background:var(--primary);border-radius:3px;"></div></div></div>'
 ).join('') || '<p style="color:#9ca3af;font-size:13px;">Sin datos.</p>';

 // Zonas
 const zn = {};
 p.forEach(x => { const z=x.loc||'Retiro'; zn[z]=(zn[z]||0)+1; });
 const mz = Math.max(...Object.values(zn),1);
 if(g('dash-zonas')) g('dash-zonas').innerHTML = Object.entries(zn).sort((a,b)=>b[1]-a[1]).map(([z,n]) => '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;"><div style="width:100px;font-size:12px;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+z+'</div><div style="flex:1;height:14px;background:#333;border-radius:4px;overflow:hidden;"><div style="height:100%;width:'+Math.round(n/mz*100)+'%;background:#3b82f6;border-radius:4px;"></div></div><span style="font-size:11px;color:#9ca3af;width:20px;">'+n+'</span></div>'
 ).join('') || '<p style="color:#9ca3af;font-size:13px;">Sin datos.</p>';
}

async function admCargarMenuGestion() {
 const lista = document.getElementById('adm-menu-lista');
 if(!lista) return;
 let ov = {};
 try { const s=await db.collection("config_menu").doc("overrides").get(); if(s.exists) ov=s.data(); } catch(e) {}
 lista.innerHTML = '';
 MENU.forEach(cat => {
 const h = document.createElement('div');
 h.style.cssText='font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin:12px 0 6px;';
 h.innerText = cat.cat; lista.appendChild(h);
 cat.items.forEach(item => {
 const o = ov[item.id]||{}; const agotado=o.agotado===true; const precio=o.precio||item.p;
 const row = document.createElement('div'); row.className='adm-menu-row';
 row.innerHTML = '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+item.n+'</div><div style="font-size:11px;color:#9ca3af;">Base: $'+item.p.toLocaleString('es-AR')+'</div></div>'
 +'<input class="adm-price-inp" type="number" value="'+precio+'" id="price-'+item.id+'">'
 +'<div style="display:flex;flex-direction:column;align-items:center;gap:2px;"><label class="adm-toggle"><input type="checkbox" '+(agotado?'':'checked')+' onchange="admToggleProducto('+item.id+')" id="tog-'+item.id+'"><span class="adm-toggle-slider"></span></label><span style="font-size:9px;color:'+(agotado?'#ef4444':'#10b981')+';" id="lbl-tog-'+item.id+'">'+(agotado?'Agotado':'Activo')+'</span></div>'
 +'<button onclick="admGuardarPrecio('+item.id+')" style="background:rgba(245,158,11,.15);border:1px solid var(--primary);color:var(--primary);padding:6px 10px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">Guardar</button>';
 lista.appendChild(row);
 });
 });
}

window.admToggleProducto = async (id) => {
 const tog = document.getElementById('tog-'+id);
 const agotado = !tog.checked;
 const upd = {}; upd[id] = { agotado };
 try {
 await db.collection("config_menu").doc("overrides").set(upd,{merge:true});
 const lbl = document.getElementById('lbl-tog-'+id);
 if (lbl) { lbl.innerText = agotado?'Agotado':'Activo'; lbl.style.color = agotado?'#ef4444':'#10b981'; }
 }
 catch(e) { alert("Error: "+e.message); }
};

window.admGuardarPrecio = async (id) => {
 const inp = document.getElementById('price-'+id);
 if (!inp) return;
 const precio = parseInt(inp.value);
 if(!precio||precio<1) return alert("Precio invalido (debe ser mayor a 0).");
 const upd={}; upd[id]={precio};
 try {
 await db.collection("config_menu").doc("overrides").set(upd,{merge:true});
 // Feedback visual en el input
 inp.style.borderColor = '#10b981';
 setTimeout(() => { inp.style.borderColor = ''; }, 1500);
 } catch(e) { alert("Error: "+e.message); }
};

let _admResTabActual = 'pedidos';
function admResTab(tab) {
 _admResTabActual = tab;
 const btnPed = document.getElementById('adm-res-tab-ped');
 const btnPub = document.getElementById('adm-res-tab-pub');
 if (btnPed) {
 const selStyle = 'border:1px solid var(--primary);background:rgba(245,158,11,.15);color:var(--primary);';
 const defStyle = 'border:1px solid var(--border);background:transparent;color:#9ca3af;';
 btnPed.style.cssText += tab === 'pedidos' ? selStyle : defStyle;
 btnPub.style.cssText += tab === 'publicas' ? selStyle : defStyle;
 }
 admCargarResenas();
}

async function admCargarResenas() {
 const g = id => document.getElementById(id);
 const col = _admResTabActual === 'publicas' ? 'opiniones' : 'resenas';
 const campoEst = _admResTabActual === 'publicas' ? 'estrellas' : 'puntuacion';
 if (g('adm-resenas-lista')) g('adm-resenas-lista').innerHTML = '<p style="color:#9ca3af;padding:20px;text-align:center;">Cargando reseñas...</p>';

 // Cargar y renderizar toggle de visibilidad del modal de opiniones
 try {
 const cfgSnap = await window.db.collection('config_menu').doc('opiniones_config').get();
 const visibleActual = cfgSnap.exists ? (cfgSnap.data()?.visible !== false) : true;
 const toggleBox = document.getElementById('adm-op-visible-toggle');
 if (toggleBox) {
 toggleBox.innerHTML = `
 <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:16px;"> <div> <div style="font-weight:800;color:var(--white);font-size:13px;"> Modal Opinión automático</div> <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Se abre cuando el pedido llega a "Entregado"</div> </div> <label style="position:relative;display:inline-block;width:48px;height:26px;cursor:pointer;"> <input type="checkbox" id="op-vis-chk" ${visibleActual?'checked':''} onchange="admToggleOpinionVisible(this.checked)"
 style="opacity:0;width:0;height:0;"> <span id="op-vis-track" style="position:absolute;inset:0;background:${visibleActual?'#10b981':'#333'};border-radius:13px;transition:.3s;"></span> <span id="op-vis-thumb" style="position:absolute;top:3px;left:${visibleActual?'25px':'3px'};width:20px;height:20px;background:#fff;border-radius:50%;transition:.3s;"></span> </label> </div>`;
 }
 } catch(e) { /* silenciar error de config */ }
 try {
 // Sin orderBy para evitar requerir índice compuesto — ordenamos en cliente
 let snap;
 try {
 snap = await db.collection(col).orderBy("fecha","desc").limit(200).get();
 } catch(idxErr) {
 // Índice no existe — fallback sin ordenar
 snap = await db.collection(col).limit(200).get();
 }
 const rs = [];
 snap.forEach(d => rs.push({id:d.id,...d.data()}));
 // Ordenar en cliente por fecha desc
 rs.sort((a,b) => {
 const fa = a.fecha ? (a.fecha.toDate ? a.fecha.toDate() : new Date(a.fecha)) : new Date(0);
 const fb = b.fecha ? (b.fecha.toDate ? b.fecha.toDate() : new Date(b.fecha)) : new Date(0);
 return fb - fa;
 });
 const prom = rs.length?(rs.reduce((a,r)=>a+(r[campoEst]||0),0)/rs.length).toFixed(1):null;
 if(g('res-promedio')) g('res-promedio').innerText = prom ? prom : '--';
 if(g('res-count')) g('res-count').innerText = rs.length + ' reseñas';

 const dist={1:0,2:0,3:0,4:0,5:0};
 rs.forEach(r=>{if(r[campoEst])dist[r[campoEst]]++;});
 const md=Math.max(...Object.values(dist),1);
 if(g('res-dist')) g('res-dist').innerHTML=[5,4,3,2,1].map(s=> '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
 '<span style="font-size:10px;color:#f59e0b;width:18px;">'+s+'</span>' +
 '<div style="flex:1;height:8px;background:#333;border-radius:4px;"><div style="height:100%;width:'+Math.round(dist[s]/md*100)+'%;background:var(--primary);border-radius:4px;"></div></div>' +
 '<span style="font-size:10px;color:#9ca3af;width:16px;">'+dist[s]+'</span></div>'
 ).join('');

 if(g('adm-resenas-lista')) {
 if (!rs.length) {
 g('adm-resenas-lista').innerHTML='<div style="text-align:center;padding:40px;color:#9ca3af;">Aún no hay reseñas.</div>';
 return;
 }
 g('adm-resenas-lista').innerHTML = rs.map(r => {
 const f = r.fecha?(r.fecha.toDate?r.fecha.toDate():new Date(r.fecha)).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}):'--';
 const est = r[campoEst] || 0;
 const stars = ''.repeat(est) + ''.repeat(5-est);
 const nombre = r.nombre || r.cliente || 'Anónimo';
 return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;"><div><div style="font-weight:800;color:var(--white);font-size:13px;">${nombre}</div><div style="color:#f59e0b;font-size:16px;letter-spacing:1px;">${stars}</div>${r.tel ? `<div style="font-size:11px;color:#60a5fa;font-weight:700;margin-top:3px;">Tel: ${r.tel}</div>` : ""}</div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;"><span style="font-size:11px;color:#9ca3af;">${f}</span><button onclick="admEliminarOpinion('${r.id}','${col}')" style="background:rgba(239,68,68,.15);border:1px solid #ef4444;color:#ef4444;padding:4px 10px;border-radius:7px;font-size:11px;font-weight:800;cursor:pointer;">Eliminar</button></div></div> ${r.comentario?`<p style="color:#d1d5db;font-size:13px;line-height:1.4;margin:0;padding-top:8px;border-top:1px solid var(--border);">"${r.comentario}"</p>`:''}
 </div>`;
 }).join('');
 }
 } catch(e) {
 const esPermisos = e.message && (e.message.includes('permission') || e.message.includes('index') || e.message.includes('índice'));
 const msgExtra = esPermisos
 ? '<br><small style="color:#6b7280;font-size:11px;">Revisá las reglas de Firestore o creá el índice requerido en la consola de Firebase.</small>'
 : '';
 if(g('adm-resenas-lista')) g('adm-resenas-lista').innerHTML=`<div style="padding:20px;text-align:center;"><div style="color:#ef4444;font-weight:700;margin-bottom:8px;">${e.message}</div>${msgExtra}<button onclick="admCargarResenas()" style="margin-top:12px;background:rgba(245,158,11,.15);border:1px solid var(--primary);color:var(--primary);padding:8px 16px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">Reintentar</button></div>`;
 }
}

async function admEliminarOpinion(id, coleccion) {
 if (!confirm('¿Eliminar esta reseña? No se puede deshacer.')) return;
 try {
 await db.collection(coleccion).doc(id).delete();
 admCargarResenas();
 } catch(e) { alert('Error al eliminar: ' + e.message); }
}

// Activar / desactivar modal de opinión automático desde admin
window.admToggleOpinionVisible = async (visible) => {
 try {
 await window.db.collection('config_menu').doc('opiniones_config').set({ visible }, { merge: true });
 const track = document.getElementById('op-vis-track');
 const thumb = document.getElementById('op-vis-thumb');
 if (track) track.style.background = visible ? '#10b981' : '#333';
 if (thumb) thumb.style.left = visible ? '25px' : '3px';
 } catch(e) { alert('Error al guardar config: ' + e.message); }
};


// 
// SECURITY — Admin entry gate, anti-tamper, discount guard
// 

// 1. Admin panel only accessible via secret URL hash #mfadmin
(function _adminGate() {
 function checkHash() {
 const adminRoot = document.getElementById('admin-root');
 if (!adminRoot) return;
 if (window.location.hash === '#mfadmin') {
 adminRoot.style.display = 'block';
 } else {
 adminRoot.style.display = 'none';
 }
 }
 window.addEventListener('hashchange', checkHash);
 document.addEventListener('DOMContentLoaded', checkHash);
 checkHash();
})();

// 2. Session heartbeat — invalidate admin if tab loses token mid-session
setInterval(() => {
 const app = document.getElementById('adm-app');
 if (app && app.style.display !== 'none') {
 if (!sessionStorage.getItem('_mfa_ok')) {
 if (typeof admLogout === 'function') admLogout();
 }
 }
}, 5000);

// 3. Discount integrity guard — all discount values are capped & validated server-side on submit
// Client-side: prevent manipulation of cuponAplicado via console
(function _discountGuard() {
 const MAX_DISCOUNT_PCT = 1.0; // 100%
 const origProc = window.procesarPedido;
 window.procesarPedido = async function() {
 // Re-validate cuponAplicado before submitting
 if (window.cuponAplicado) {
 const c = window.cuponAplicado;
 // Cap percentage descuents
 if (c.tipo === 'porcentaje' || c.tipo === 'porcentaje_veggie') {
 if (typeof c.valor !== 'number' || c.valor < 0 || c.valor > MAX_DISCOUNT_PCT) {
 console.warn('[SEC] Invalid discount value clamped');
 window.cuponAplicado = null;
 }
 }
 // Validate internal codes are still active
 if (c.tipo === 'porcentaje' && c.valor === 1) {
 const { internos } = resolverCodigos();
 const cod = window.codigoInternoAplicado;
 if (!cod || !internos[cod.codigo] || internos[cod.codigo].activo === false) {
 window.cuponAplicado = null;
 window.codigoInternoAplicado = null;
 alert('Código de descuento ya no es válido.');
 return;
 }
 }
 }
 return origProc.apply(this, arguments);
 };
})();

// 4. DevTools detection — warn but don't block (avoid false positives on legit users)
// Log suspicious activity to Firebase
// SOLO para admins — evita escrituras a Firestore desde clientes públicos
// que generan 400 Bad Request en el canal de escritura.
(function _devtoolsTrap() {
 if (!window.__IS_ADMIN__) return; // clientes normales no loguean DevTools
 let _devOpen = false;
 const _threshold = 160;
 setInterval(() => {
 const widthDiff = window.outerWidth - window.innerWidth > _threshold;
 const heightDiff = window.outerHeight - window.innerHeight > _threshold;
 if ((widthDiff || heightDiff) && !_devOpen) {
 _devOpen = true;
 try {
 if (window.db) {
 window.db.collection('_sec_log').add({
 ev: 'devtools_open',
 ua: navigator.userAgent.slice(0, 120),
 t: firebase.firestore.FieldValue.serverTimestamp()
 });
 }
 } catch(e) {}
 } else if (!widthDiff && !heightDiff) {
 _devOpen = false;
 }
 }, 2000);
})();

// 5. Prevent right-click inspect on admin panel only
document.getElementById('admin-root') && document.getElementById('admin-root').addEventListener('contextmenu', e => e.preventDefault());

 
// ═══════════════════════════════════════════════════════════════════
//  MEJORA 2 — Rate Limiting para envío de pedidos y acciones críticas
//  Evita que bots o usuarios malintencionados saturen Firebase/EmailJS
//  con solicitudes masivas desde el mismo dispositivo.
// ═══════════════════════════════════════════════════════════════════

(function _rateLimiter() {
  'use strict';

  /**
   * Límites configurables por acción:
   *   maxHits    — máximo de intentos en la ventana de tiempo
   *   windowMs   — ventana de tiempo en milisegundos
   */
  const RATE_LIMITS = {
    procesarPedido:   { maxHits: 5,  windowMs: 2 * 60 * 1000 },  // 5 pedidos / 2 min
    aplicarCodDesc:   { maxHits: 10, windowMs: 5 * 60 * 1000 },  // 10 intentos / 5 min
    enviarOpinion:    { maxHits: 3,  windowMs: 5 * 60 * 1000 },  // 3 opiniones / 5 min
  };

  const RL_KEY = 'mf_rl_state';

  function _getState() {
    try { return JSON.parse(localStorage.getItem(RL_KEY) || '{}'); }
    catch (_) { return {}; }
  }
  function _saveState(s) {
    try { localStorage.setItem(RL_KEY, JSON.stringify(s)); } catch (_) {}
  }

  /**
   * Registra un intento y devuelve true si está dentro del límite,
   * false si el límite fue superado.
   */
  window._rlCheck = function(action) {
    const limit = RATE_LIMITS[action];
    if (!limit) return true; // acción no controlada → permitir

    const now = Date.now();
    const state = _getState();
    if (!state[action]) state[action] = [];

    // Filtrar hits fuera de la ventana
    state[action] = state[action].filter(ts => now - ts < limit.windowMs);

    if (state[action].length >= limit.maxHits) {
      const restMs  = limit.windowMs - (now - state[action][0]);
      const restMin = Math.ceil(restMs / 60000);
      console.warn(`[RateLimit] Acción "${action}" bloqueada. Intentá en ${restMin} min.`);
      _saveState(state);
      return false; // BLOQUEADO
    }

    state[action].push(now);
    _saveState(state);
    return true; // PERMITIDO
  };

  // ── Parche para procesarPedido ──────────────────────────────────
  if (typeof window.procesarPedido === 'function') {
    const _origProcesar = window.procesarPedido;
    window.procesarPedido = async function() {
      if (!window._rlCheck('procesarPedido')) {
        alert('Demasiados pedidos en poco tiempo. Esperá unos minutos antes de intentar de nuevo.');
        return;
      }
      return _origProcesar.apply(this, arguments);
    };
  }

  // ── Parche para aplicarCodigoDescuento ─────────────────────────
  if (typeof window.aplicarCodigoDescuento === 'function') {
    const _origCod = window.aplicarCodigoDescuento;
    window.aplicarCodigoDescuento = function() {
      if (!window._rlCheck('aplicarCodDesc')) {
        const fb = document.getElementById('cod-descuento-feedback');
        if (fb) {
          fb.style.display = 'block';
          fb.style.background = 'rgba(239,68,68,0.15)';
          fb.style.border = '1px solid #ef4444';
          fb.style.color = '#ef4444';
          fb.innerHTML = 'Demasiados intentos. Esperá unos minutos.';
        }
        return;
      }
      return _origCod.apply(this, arguments);
    };
  }

  // ── Parche para enviarOpinion ──────────────────────────────────
  if (typeof window.enviarOpinion === 'function') {
    const _origOp = window.enviarOpinion;
    window.enviarOpinion = async function() {
      if (!window._rlCheck('enviarOpinion')) {
        alert('Ya enviaste varias opiniones recientemente. Intentá más tarde.');
        return;
      }
      return _origOp.apply(this, arguments);
    };
  }

})();

// ═══════════════════════════════════════════════════════════════════
//  MEJORA 3 — Totales del Dashboard excluyen pedidos cancelados/anulados
//  Aplica sobre la función de cálculo de métricas existente.
// ═══════════════════════════════════════════════════════════════════

(function _patchDashboardTotales() {
  'use strict';

  /**
   * Estados que NO deben contabilizarse en métricas de ventas.
   * Ajustá esta lista según los estados reales de tu Firestore.
   */
  const ESTADOS_EXCLUIDOS = new Set([
    'Anulado', 'anulado', 'ANULADO',
    'Cancelado', 'cancelado', 'CANCELADO',
  ]);

  /**
   * Filtra un array de documentos de pedidos para excluir los anulados/cancelados.
   * Expuesto globalmente para ser usado por admCargarDashboard y otras funciones.
   */
  window._filtrarPedidosParaMetricas = function(docs) {
    return docs.filter(d => {
      const data = typeof d.data === 'function' ? d.data() : d;
      return !ESTADOS_EXCLUIDOS.has(data.estado);
    });
  };

  /**
   * Calcula el recaudado total de un array de docs ya filtrados.
   * Normaliza el campo "total" que puede venir como número, string o ausente.
   */
  window._calcularRecaudado = function(docs) {
    return docs.reduce((acc, d) => {
      const data = typeof d.data === 'function' ? d.data() : d;
      const t = parseFloat(data.total) || 0;
      return acc + t;
    }, 0);
  };

})();

// ═══════════════════════════════════════════════════════════════════
//  MEJORA 6 — Detección automática de pagos con Regex
//  Parsea comprobantes de Tarjeta o mensajes de clientes para
//  detectar montos y referencias de pago, y actualizar el pedido.
//  En producción esto debería moverse a una Firebase Cloud Function.
// ═══════════════════════════════════════════════════════════════════

(function _pagoDetector() {
  'use strict';

  /**
   * Patrones Regex para detectar información de pago en texto libre.
   * Cubre formatos comunes de comprobantes argentinos:
   *   - Mercado Pago: "Pagaste $12.500"
   *   - Tarjeta: "Transferiste $12500 a Marvel Food"
   *   - Efectivo: "Pago en efectivo $12500"
   *   - Número de operación: "Operación: 1234567890"
   */
  const PATRONES_PAGO = [
    // Monto con $ — formatos: $12.500 / $12500 / $ 12.500,00
    {
      nombre: 'monto',
      regex: /\$\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/g,
      extractor: match => parseFloat(match[1].replace(/\./g, '').replace(',', '.'))
    },
    // Número de operación / comprobante
    {
      nombre: 'operacion',
      regex: /(?:operaci[oó]n|comprobante|n[uú]mero|nro\.?|#)\s*:?\s*(\d{6,20})/gi,
      extractor: match => match[1]
    },
    // CVU / alias Mercado Pago
    {
      nombre: 'cvu',
      regex: /CVU[:\s]+(\d{22})/gi,
      extractor: match => match[1]
    },
    // Detección de "Mercado Pago" como medio de pago
    {
      nombre: 'medio',
      regex: /(mercado\s*pago|Tarjeta|efectivo|débito|crédito)/gi,
      extractor: match => match[1].toLowerCase().replace(/\s+/g, '_')
    },
  ];

  /**
   * Parsea un texto de comprobante y extrae los datos de pago.
   * @param {string} texto — Texto del mensaje o comprobante del cliente
   * @returns {{ monto: number|null, operacion: string|null, medio: string|null }}
   */
  window.parsearComprobantePago = function(texto) {
    if (!texto || typeof texto !== 'string') return {};
    const resultado = {};

    for (const patron of PATRONES_PAGO) {
      const regex = new RegExp(patron.regex.source, patron.regex.flags);
      let match;
      while ((match = regex.exec(texto)) !== null) {
        const valor = patron.extractor(match);
        if (valor !== null && valor !== undefined) {
          // Para monto, quedarnos con el más grande (evitar centavos sueltos)
          if (patron.nombre === 'monto') {
            if (!resultado.monto || valor > resultado.monto) {
              resultado.monto = valor;
            }
          } else {
            resultado[patron.nombre] = valor;
          }
        }
      }
    }

    return resultado;
  };

  /**
   * Dado el ID de un pedido y un texto de comprobante,
   * actualiza el estado del pedido en Firestore si se detecta un pago.
   * Pensado para ser llamado desde el panel admin al pegar un comprobante.
   *
   * @param {string} pedidoId
   * @param {string} textoComprobante
   */
  window.procesarComprobanteEnAdmin = async function(pedidoId, textoComprobante) {
    if (!pedidoId || !textoComprobante) return null;
    if (!window.db) return null;

    const datos = window.parsearComprobantePago(textoComprobante);
    if (!datos.monto && !datos.operacion) {
      return { ok: false, msg: 'No se detectó información de pago en el texto.' };
    }

    try {
      await window.db.collection('pedidos_v2').doc(pedidoId).update({
        pago_detectado: {
          monto: datos.monto || null,
          operacion: datos.operacion || null,
          medio: datos.medio || null,
          cvu: datos.cvu || null,
          ts: new Date().toISOString(),
          texto_original: textoComprobante.slice(0, 500),
        },
        pago_confirmado: !!datos.monto,
      });
      return { ok: true, datos };
    } catch(e) {
      console.error('[PagoDetector] Error actualizando Firestore:', e);
      return { ok: false, msg: e.message };
    }
  };

})();

// ── Validación en tiempo real: teléfono y dirección ───────────────────────
// Solo dígitos en el campo de teléfono + re-validar formulario al escribir
(function _checkoutRealTimeValidation() {
  function _bindCheckoutInputs() {
    const cTel = document.getElementById('c-tel');
    const cDir = document.getElementById('c-dir');
    const cNombre = document.getElementById('c-nombre');

    if (cTel && !cTel._rvBound) {
      cTel._rvBound = true;
      cTel.addEventListener('input', function() {
        // Permitir solo dígitos
        this.value = this.value.replace(/\D/g, '');
        if (typeof validarDatosEnvio === 'function') validarDatosEnvio();
      });
    }
    if (cDir && !cDir._rvBound) {
      cDir._rvBound = true;
      cDir.addEventListener('input', function() {
        if (typeof validarDatosEnvio === 'function') validarDatosEnvio();
      });
    }
    if (cNombre && !cNombre._rvBound) {
      cNombre._rvBound = true;
      cNombre.addEventListener('input', function() {
        if (typeof validarDatosEnvio === 'function') validarDatosEnvio();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bindCheckoutInputs);
  } else {
    _bindCheckoutInputs();
  }

  // Re-bindear cuando se abra el carrito (los inputs pueden crearse dinámicamente)
  document.addEventListener('cart:toggle', function() {
    setTimeout(_bindCheckoutInputs, 300);
  });
})();
