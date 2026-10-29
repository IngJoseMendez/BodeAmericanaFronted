// ── LA VENTANA DE FILAS NO PUEDE TOCAR NI UN PESO ─────────────────
//
// La ficha de cartera de MARTA BOTERO tiene 2.215 movimientos (1.592 compras y
// 623 abonos, medido en producción). Pintarlos todos congelaba la tableta, así
// que al renderizar se corta a una ventana de 100 filas ampliable.
//
// EL PELIGRO. Esa ventana es un recorte de PINTADO. Si alguien, buscando
// «limpiar», mueve el `.slice()` desde el sitio donde se pinta hasta el
// `useMemo` que arma la lista, el recorte deja de ser visual y pasa a ser de
// datos: el total del pie diría «100 compras» de un cliente que tiene 1.592, y
// el saldo que la dueña le cobra a una persona real saldría mal. No reventaría
// nada, no habría error en consola: simplemente el número sería otro. Es
// exactamente la clase de bug que no se ve hasta que alguien reclama.
//
// Por eso esto se comprueba en el código y no a ojo:
//
//   1. Las listas de las que salen los totales (`comprasFiltradas`,
//      `abonosFiltrados`) se declaran SIN slice.
//   2. El slice aparece sólo pegado a un `.map(`, que es pintar.
//   3. El pie de «hay más» recibe como total la longitud de la lista COMPLETA,
//      no la de la ventana: si recibiera la ventana diría «100 de 100» y nadie
//      se enteraría de que faltan 1.492.
//   4. El total en pesos se suma sobre la lista completa.
import fs from 'node:fs';
import path from 'node:path';

const RUTA = path.join(process.cwd(), 'src', 'pages', 'Cartera.jsx');
const texto = fs.readFileSync(RUTA, 'utf8');

let fallos = 0;
const ok = (cond, msg) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) fallos++;
};

/** El cuerpo de un useMemo por el nombre de la const que lo recibe. */
function cuerpoDelMemo(nombre) {
  const i = texto.indexOf('const ' + nombre + ' = useMemo(');
  if (i < 0) return null;
  // Hasta el cierre del useMemo: la primera línea que sea exactamente `);`
  const resto = texto.slice(i);
  const fin = resto.search(/\n\s*\);/);
  return fin < 0 ? resto : resto.slice(0, fin);
}

console.log('La ventana de filas de la ficha de cartera');

// ── 1. Las listas que alimentan los totales, sin recortar ─────────
for (const nombre of ['comprasFiltradas', 'abonosFiltrados']) {
  const cuerpo = cuerpoDelMemo(nombre);
  ok(cuerpo !== null, nombre + ' sigue existiendo como useMemo');
  if (cuerpo) {
    ok(!/\.slice\s*\(/.test(cuerpo),
       nombre + ' se arma SIN slice (si no, el total mentiría)');
    ok(/detalleCliente\?\.movimientos/.test(cuerpo),
       nombre + ' parte de los movimientos completos del cliente');
  }
}

// ── 2. El recorte sólo donde se pinta ─────────────────────────────
for (const [lista, contador] of [['comprasFiltradas', 'comprasVisibles'],
                                 ['abonosFiltrados', 'abonosVisibles']]) {
  const usos = [...texto.matchAll(
    new RegExp(lista.replace('$', '\\$') + '\\.slice\\(0,\\s*' + contador + '\\)([^\\n]*)', 'g'))];
  ok(usos.length === 1, lista + ' se recorta en un solo sitio (hay ' + usos.length + ')');
  if (usos.length === 1) {
    ok(usos[0][1].includes('.map('),
       'ese recorte va pegado a un .map(), es decir: al pintar');
  }
}

// ── 3. El aviso dice el total DE VERDAD ───────────────────────────
for (const [lista, contador] of [['comprasFiltradas', 'comprasVisibles'],
                                 ['abonosFiltrados', 'abonosVisibles']]) {
  ok(texto.includes('total={' + lista + '.length}'),
     'el aviso de «hay más» recibe el total completo de ' + lista);
  ok(texto.includes('mostradas={Math.min(' + contador + ', ' + lista + '.length)}'),
     'y como «mostradas» el mínimo entre la ventana y lo que hay');
}

// ── 4. El total en pesos, sobre la lista completa ─────────────────
const totalCompras = cuerpoDelMemo('totalCompras');
ok(totalCompras !== null, 'totalCompras sigue siendo un useMemo');
if (totalCompras) {
  ok(/comprasFiltradas\.reduce/.test(totalCompras),
     'totalCompras suma sobre comprasFiltradas, no sobre la ventana');
  ok(!/comprasVisibles/.test(totalCompras),
     'totalCompras no conoce la ventana');
}

// ── 5. Lo que se exporta y se cuenta sigue siendo todo ────────────
ok(/\{\(detalleCliente\.movimientos \|\| \[\]\)\.filter\(m => m\.tipo === 'venta'\)\.length\}/.test(texto),
   'el contador de la pestaña Compras cuenta los movimientos completos');
ok(!/data\.movimientos\.slice/.test(texto) && !/movimientos\.slice\(0/.test(texto),
   'el Excel y el PDF del estado de cuenta no reciben una lista recortada');

// ── 6. La ventana se reinicia al cambiar de ficha o de búsqueda ───
ok(/\}, \[clienteFichaId, detalleBusqueda\]\);/.test(texto),
   'la ventana se reinicia al cambiar de cliente y al cambiar la búsqueda');

console.log('');
if (fallos) {
  console.error('FALLOS: ' + fallos);
  process.exit(1);
}
console.log('La ventana recorta el pintado y nada más');
