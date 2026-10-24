// Genera la hoja INVENTARIO(INTERNO) DE VERDAD —con la misma funcion que usa
// la pantalla— sobre los datos reales de produccion, y la imprime como texto
// para poder mirarla sin abrir Excel.
//
//   node informacion/actualizacion/q-inv.js   (en el repo del backend, deja inv-prod.json)
//   node client/tests/inventario-interno.check.mjs <ruta a inv-prod.json>
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { hojaInventarioInterno, porReferencia } from '../src/lib/entregables.js';

const ruta = process.argv[2];
if (!ruta || !fs.existsSync(ruta)) {
  console.error('Falta el JSON del inventario. Ej: node client/tests/inventario-interno.check.mjs ../BodeAmericana/informacion/actualizacion/inv-prod.json');
  process.exit(1);
}
const filas = JSON.parse(fs.readFileSync(ruta, 'utf8'));

const wb = new ExcelJS.Workbook();
hojaInventarioInterno(wb, filas);
const ws = wb.getWorksheet('INVENTARIO(INTERNO)');

const texto = (v) => {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return v.toLocaleString('es-CO');
  return String(v);
};

const anchos = [12, 30, 14, 13, 13, 13, 16, 16];
ws.eachRow((row, n) => {
  const celdas = [];
  for (let i = 1; i <= 8; i++) celdas.push(texto(row.getCell(i).value).slice(0, anchos[i - 1]).padEnd(anchos[i - 1]));
  console.log(`${String(n).padStart(4)} | ${celdas.join(' | ')}`);
});

// Lo que de verdad hay que comprobar: que el orden sea alfabetico y que los
// totales de abajo sean la suma de las columnas de arriba.
const orden = [...filas].sort(porReferencia).map((f) => `${f.referencia} · ${f.calidad || ''}`);
const copia = [...orden].sort((a, b) => a.localeCompare(b, 'es'));
console.log('\nel orden es alfabetico:', JSON.stringify(orden) === JSON.stringify(copia) ? 'SI' : 'revisar (los acentos y mayusculas se comparan aparte)');

// La hoja termina en TOTAL y una nota. Sumar hasta rowCount metia la propia
// fila TOTAL en la suma y daba el doble: 412 disponibles de 206 que hay.
const filaTotal = ws.rowCount - 1;
const tot = ws.getRow(filaTotal);
let ct = 0, pt = 0, disp = 0;
for (let n = 3; n < filaTotal; n++) {
  const r = ws.getRow(n);
  if (typeof r.getCell(1).value !== 'number') continue;
  disp += r.getCell(1).value;
  ct += Number(r.getCell(7).value) || 0;
  pt += Number(r.getCell(8).value) || 0;
}
console.log(`sumando las filas:  ${disp} disp · costo ${ct.toLocaleString('es-CO')} · precio ${pt.toLocaleString('es-CO')}`);
console.log(`la fila TOTAL dice: ${tot.getCell(1).value} disp · costo ${Number(tot.getCell(7).value).toLocaleString('es-CO')} · precio ${Number(tot.getCell(8).value).toLocaleString('es-CO')}`);
const cuadra = tot.getCell(1).value === disp
  && Math.round(Number(tot.getCell(7).value)) === Math.round(ct)
  && Math.round(Number(tot.getCell(8).value)) === Math.round(pt);
console.log('los totales cuadran:', cuadra ? 'SI' : 'NO');

const vistos = new Set(), repes = [];
for (let n = 3; n < filaTotal; n++) {
  const r = ws.getRow(n);
  const k = `${r.getCell(2).value}|${r.getCell(3).value}`;
  if (vistos.has(k)) repes.push(k); else vistos.add(k);
}
console.log('productos repetidos en la hoja:', repes.length ? repes.join(', ') : 'ninguno');
console.log(`filas de producto: ${vistos.size}  (la consulta trae ${filas.length}, agrupadas por contenedor)`);

const conPromo = filas.filter((f) => f.precio_promocion != null || f.tiene_promocion);
console.log(`\nlineas con promocion: ${conPromo.length} (su PRECIO TOTAL se valora con la promo, no con el de lista)`);
process.exit(cuadra && !repes.length ? 0 : 1);
