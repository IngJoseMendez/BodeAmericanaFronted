// Genera la hoja general de despacho y la de conteo con las MISMAS funciones
// que usa la pantalla, y las imprime como texto para compararlas contra
// `Despacho Bodega.xlsx` sin abrir Excel.
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { hojaDespachoGeneral, hojaConteoBodega } from '../src/lib/entregables.js';

const DESPACHOS = [
  { nombre: 'HECTOR CALDERON', ciudad: 'NEIVA', direccion: 'CRA 5 # 12-30', celular: '3001112233',
    tipo_transporte: 'TRANSPORTADORA', transportadora: 'ENVIA', fletes: 'CONTADO',
    grupos: [
      { referencia: 'JEANS MUJER', calidad: 'ESPECIAL', costo: 891569, precio: 1300000, cantidad: 1 },
      { referencia: 'MIXTA HOMBRE INVIERNO', calidad: 'SUPREME', costo: 786615, precio: 1000000, cantidad: 3 },
      { referencia: 'POLAR', calidad: 'ESPECIAL', costo: 753615, precio: 1200000, cantidad: 2 },
    ] },
  { nombre: 'FARID GASPAR', ciudad: 'CALI', direccion: 'CALLE 9 # 4-55', celular: '3009998877',
    tipo_transporte: 'TRANSPORTADORA', transportadora: 'INTERRAPIDISIMO', fletes: 'CONTRAENTREGA',
    grupos: [{ referencia: 'INTIMA', calidad: 'SUPREME', costo: 1182615, precio: 1300000, cantidad: 3 }] },
  { nombre: 'DENNIS ORTEGA', ciudad: '', direccion: '', celular: '',
    tipo_transporte: 'RECOGIDA', transportadora: '', fletes: '',
    grupos: [{ referencia: 'BLAZER', calidad: 'PREMIUM', costo: 1178569, precio: 1700000, cantidad: 1 }] },
];
const SEPARADAS = [
  { nombre: 'MACKY', grupos: [
    { referencia: 'MIXTA HOMBRE INVIERNO', calidad: 'PREMIUM', costo: 1073228, precio: 1700000, cantidad: 2 },
    { referencia: 'POLAR', calidad: 'PREMIUM', costo: 1116615, precio: 1700000, cantidad: 1 }] },
  { nombre: 'ADRIANA', grupos: [
    { referencia: 'CAMISA LENADORA', calidad: 'PREMIUM', costo: 1073228, precio: 1700000, cantidad: 1 }] },
];

const wb = new ExcelJS.Workbook();
hojaDespachoGeneral(wb, DESPACHOS, SEPARADAS, {
  titulo: 'OCT14D144', fecha: '14/10/2026', numero: 'D144',
  totales: { vienen: 0, salen: 6, quedan: 0, separadas: 3, disponibles: 200 },
});
const inv = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
hojaConteoBodega(wb, inv);

const texto = (v) => {
  if (v == null || v === '') return '';
  if (typeof v === 'object' && v.formula) return `=${v.formula}`;
  if (typeof v === 'number') return v.toLocaleString('es-CO');
  return String(v);
};
for (const nombre of wb.worksheets.map((w) => w.name)) {
  const ws = wb.getWorksheet(nombre);
  console.log(`\n${'='.repeat(110)}\n[${nombre}]`);
  const n = nombre === 'CONTEO(BODEGA)' ? 8 : ws.rowCount;
  ws.eachRow((row, i) => {
    if (i > n && nombre === 'CONTEO(BODEGA)') return;
    const c = [];
    for (let k = 1; k <= 12; k++) c.push(texto(row.getCell(k).value).slice(0, 13).padEnd(13));
    console.log(`${String(i).padStart(3)} | ${c.join('|').replace(/(\|\s+)+$/, '')}`);
  });
  if (nombre === 'CONTEO(BODEGA)') {
    const u = ws.getRow(ws.rowCount);
    console.log(` ...  (${ws.rowCount - 3} productos)`);
    console.log(`${String(ws.rowCount).padStart(3)} | ${texto(u.getCell(1).value)} | | ${texto(u.getCell(3).value)}`);
  }
}
