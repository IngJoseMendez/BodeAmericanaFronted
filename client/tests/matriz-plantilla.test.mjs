import ExcelJS from 'exceljs';
import { hojaMatrizClientes } from '../src/lib/entregables.js';

// Encabezados EXACTOS de la plantilla de la operación (ejemplo matriz.xlsx)
const ESPERADO = ['COD','PROVE','REFERENCIA','CALIDAD','COSTO','PRECIO','PRECIO',
                  'INVENTARIO','FISICO','DESPACHOS','SEP','DISP'];

const inventario = [
  { contenedor: 'CONT-19-08-2026-0001', proveedor_nombre: 'Guangzhou Textil',
    referencia: 'CHAQ-001', calidad: 'PRIMERA', costo_unitario: 51234,
    precio_unitario: 98000, tiene_promocion: false,
    cantidad: 40, fisico: 30, despachadas: 10, separadas: 12, disponibles: 18 },
  { contenedor: 'CONT-19-08-2026-0001', proveedor_nombre: 'Guangzhou Textil',
    referencia: 'JEAN-002', calidad: 'SEGUNDA', costo_unitario: 22000,
    precio_unitario: 40000, tiene_promocion: true,
    cantidad: 25, fisico: 25, despachadas: 0, separadas: 5, disponibles: 20 },
];
const separadas = [
  ...Array.from({length:7},()=>({ referencia:'CHAQ-001', calidad:'PRIMERA', cliente_nombre:'MARIA', estado:'separada' })),
  ...Array.from({length:5},()=>({ referencia:'CHAQ-001', calidad:'PRIMERA', cliente_nombre:'JOSE',  estado:'separada' })),
  ...Array.from({length:5},()=>({ referencia:'JEAN-002', calidad:'SEGUNDA', cliente_nombre:'CAROLINA', estado:'separada' })),
  { referencia:'CHAQ-001', calidad:'PRIMERA', cliente_nombre:'MARIA', estado:'despachada' }, // no cuenta
];

let malos = 0;
const ok = (etiqueta, real, esp) => {
  const bien = JSON.stringify(real) === JSON.stringify(esp);
  if (!bien) malos++;
  console.log(`  ${bien?'✓':'✗'} ${etiqueta.padEnd(44)} ${JSON.stringify(real)}${bien?'':'  ← esperaba '+JSON.stringify(esp)}`);
};

const wb = new ExcelJS.Workbook();
const ws = hojaMatrizClientes(wb, inventario, separadas);
const v = (r,c) => { const x = ws.getCell(r,c).value; return x==null||x===''?'':x; };

console.log('\n── Cabecera igual que la plantilla ──────────────────────');
ok('A1 = INVENTARIO', v(1,1), 'INVENTARIO');
ok('C1 = MATRIZ', v(1,3), 'MATRIZ');
ok('D1 = FECHA', v(1,4), 'FECHA');
ok('sub-rótulo PROMO sobre la 6ª', v(3,6), 'PROMO');
ok('sub-rótulo ORIGINAL sobre la 7ª', v(3,7), 'ORIGINAL');
ok('encabezados de la fila 4', Array.from({length:12},(_,i)=>v(4,i+1)), ESPERADO);

console.log('\n── Una columna por cliente, en orden ────────────────────');
ok('clientes como columnas', [v(4,13), v(4,14), v(4,15)], ['CAROLINA','JOSE','MARIA']);

console.log('\n── Los datos del producto ───────────────────────────────');
ok('COD es el contenedor', v(5,1), 'CONT-19-08-2026-0001');
ok('PROVE', v(5,2), 'Guangzhou Textil');
ok('REFERENCIA', v(5,3), 'CHAQ-001');
ok('COSTO', v(5,5), 51234);
ok('sin promo: PROMO vacío', v(5,6), '');
ok('sin promo: ORIGINAL lleva el precio', v(5,7), 98000);
ok('con promo: PROMO lleva el precio', v(6,6), 40000);
ok('con promo: ORIGINAL vacío', v(6,7), '');
ok('INVENTARIO / FISICO / DESP / SEP / DISP',
   [v(5,8), v(5,9), v(5,10), v(5,11), v(5,12)], [40,30,10,12,18]);

console.log('\n── El cruce con los clientes ────────────────────────────');
ok('MARIA tiene 7 de CHAQ-001', v(5,15), 7);
ok('JOSE tiene 5 de CHAQ-001', v(5,14), 5);
ok('CAROLINA no tiene CHAQ-001', v(5,13), '');
ok('CAROLINA tiene 5 de JEAN-002', v(6,13), 5);
ok('lo ya despachado NO cuenta como separado', v(5,15), 7);

console.log('\n── Totales en la fila 3 ─────────────────────────────────');
ok('total INVENTARIO', v(3,8), 65);
ok('total FISICO', v(3,9), 55);
ok('total SEP', v(3,11), 17);
ok('total por cliente', [v(3,13), v(3,14), v(3,15)], [5,5,7]);

const buf = await wb.xlsx.writeBuffer();
const wb2 = new ExcelJS.Workbook();
await wb2.xlsx.load(buf);
ok('el archivo se puede volver a abrir', wb2.getWorksheet('MATRIZ') != null, true);

console.log(malos ? `\n${malos} DIFERENCIA(S) CON LA PLANTILLA` : '\nLa MATRIZ cuadra con la plantilla de la operación');
process.exit(malos ? 1 : 0);
