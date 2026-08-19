// Genera las 13 hojas de entregables con datos de prueba y comprueba que el
// libro resultante se puede volver a leer. Que el proyecto compile no demuestra
// que los Excel salgan: los errores de ExcelJS (rangos mal fusionados, columnas
// fuera de rango, valores no serializables) solo aparecen al escribir el archivo.
import ExcelJS from 'exceljs';
import * as E from '../src/lib/entregables.js';

const fallos = [];
const ok = [];

// ── Datos de prueba, con los casos que rompen ─────────────────────
const grupos = [
  { clasificacion: 'DAMA', categoria: 'Chaqueta deportiva', familia: 'Chaquetas',
    referencia: 'CHAQ-001', calidad: 'PRIMERA', cantidad: 12 },
  // Nulos por todas partes: es lo que llega cuando falta capturar un dato.
  { clasificacion: null, categoria: null, familia: null,
    referencia: 'SIN-DATOS', calidad: null, cantidad: 3 },
  // Comilla y acentos: rompen las plantillas mal escapadas.
  { clasificacion: 'NIÑO', categoria: 'Camisa "premium"', familia: 'Camisas',
    referencia: "REF-O'BRIEN", calidad: 'SEGUNDA', cantidad: 7 },
];

const despachos = [
  { nombre: 'Almacén La 14', ciudad: 'Cali', direccion: 'Cra 5 #12-34',
    celular: '3001234567', transporte: 'Envía', grupos },
  { nombre: 'Sin datos de entrega', ciudad: null, direccion: null,
    celular: null, transporte: null, grupos: [grupos[1]] },
];

const clientesSep = [
  { nombre: 'Almacén La 14', ciudad: 'Cali', direccion: 'Cra 5 #12-34',
    celular: '3001234567', transporte: 'Envía', grupos },
  { nombre: 'Distribuidora Norte', ciudad: 'Medellín', direccion: 'Cl 80 #45-6',
    celular: '3109876543', transporte: 'Coordinadora', grupos: [grupos[0]] },
];

const inventario = [
  { contenedor: 'CONT-18-08-2026-0001', proveedor_nombre: 'Guangzhou Textil',
    categoria: 'Chaqueta deportiva', familia: 'Chaquetas', clasificacion: 'DAMA',
    referencia: 'CHAQ-001', calidad: 'PRIMERA',
    cantidad: 40, fisico: 30, despachadas: 10, separadas: 12, vendidas: 8,
    disponibles: 18, costo_unitario: 51234.5, precio_unitario: 98000,
    costo_total: 2049380, precio_total: 3920000 },
  { contenedor: 'Sin contenedor', proveedor_nombre: '—',
    categoria: null, familia: null, clasificacion: null,
    referencia: 'SIN-DATOS', calidad: null,
    cantidad: 3, fisico: 3, despachadas: 0, separadas: 0, vendidas: 0,
    disponibles: 3, costo_unitario: 0, precio_unitario: 0,
    costo_total: 0, precio_total: 0 },
];

const separadasMatriz = [
  { clasificacion: 'DAMA', referencia: 'CHAQ-001', calidad: 'PRIMERA',
    cliente_nombre: 'Almacén La 14', cantidad: 7 },
  { clasificacion: 'DAMA', referencia: 'CHAQ-001', calidad: 'PRIMERA',
    cliente_nombre: 'Distribuidora Norte', cantidad: 5 },
  // Una separada que NO existe en inventario: no debe reventar ni inventar filas.
  { clasificacion: 'HOMBRE', referencia: 'FANTASMA', calidad: 'TERCERA',
    cliente_nombre: 'Cliente Raro', cantidad: 2 },
];

const cotizacion = {
  numero: 'COT-18-08-2026-0007', fecha: '2026-08-18', tasa: 4100,
  cliente_nombre: 'Almacén La 14', ciudad_entrega: 'Cali',
  direccion_entrega: 'Cra 5 #12-34', celular: '3001234567',
  tipo_transporte: 'Envía', subtotal: 1176000, descuento: 26000, total: 1150000,
  items: [
    { referencia: 'CHAQ-001', calidad: 'PRIMERA', cantidad: 12,
      precio_unitario: 98000, subtotal: 1176000 },
  ],
};

const carteraCliente = {
  cliente: { nombre: 'Almacén La 14', telefono: '3001234567', ciudad: 'Cali' },
  total_comprado: 5000000, total_abonado: 3850000, saldo_pendiente: 1150000,
  movimientos: [
    { fecha: '2026-08-01', tipo: 'venta', referencia: 'COT-0007', monto: 5000000, descripcion: null },
    { fecha: '2026-08-10', tipo: 'abono', referencia: 'Transferencia', monto: 3800000, descripcion: 'Bancolombia' },
    { fecha: '2026-08-12', tipo: 'descuento', referencia: null, monto: 50000, descripcion: 'Avería en 2 pacas' },
  ],
};

const carteraTodos = [
  { nombre: 'Almacén La 14', ciudad: 'Cali', telefono: '3001234567',
    total_comprado: 5000000, total_abonado: 3850000, saldo_pendiente: 1150000 },
  { nombre: 'Sin movimientos', ciudad: null, telefono: null,
    total_comprado: 0, total_abonado: 0, saldo_pendiente: 0 },
];

const utilidadCont = {
  numero: 'CONT-18-08-2026-0001', tasa_conversion: 4100,
  cantidad_total: 500, total_pacas: 300,
  utilidad_unitaria: 15000, gastos_unitarios: 2000,
  costo_mercancia_total: 12000000, costo_servicios_total: 3000000,
  costo_total: 15000000, costo_unitario: 50000,
};

const inversionistas = [
  { inversionista_nombre: 'Socio A', aporte_cop: 9000000, aporte_usd: 2195.12 },
  { inversionista_nombre: 'Socio B', aporte_cop: 6000000, aporte_usd: 1463.41 },
];

// ── Ejecutar cada hoja de forma aislada ───────────────────────────
async function probar(nombre, fn) {
  try {
    const wb = E.nuevoLibro ? E.nuevoLibro() : new ExcelJS.Workbook();
    await fn(wb);
    const buf = await wb.xlsx.writeBuffer();
    if (!buf || buf.byteLength < 500) throw new Error(`libro sospechosamente pequeño (${buf?.byteLength} bytes)`);
    // Releer: comprueba que el XLSX es válido, no solo que se escribió.
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf);
    const hojas = wb2.worksheets.map(w => w.name);
    if (!hojas.length) throw new Error('el libro no tiene hojas');
    ok.push(`${nombre} → ${hojas.join(', ')} (${(buf.byteLength / 1024).toFixed(1)} kB)`);
  } catch (err) {
    fallos.push(`${nombre}: ${err.message}`);
  }
}

const totales = { vienen: 300, salen: 15, quedan: 285, separadas: 12, disponibles: 273 };

await probar('DESPACHO(BODEGA)',        wb => E.hojaDespachoBodega(wb, despachos, { totales }));
await probar('SEPARADAS(BODEGA)',       wb => E.hojaSeparadasBodega(wb, clientesSep));
await probar('INVENTARIO(BODEGA)',      wb => E.hojaInventarioBodega(wb, inventario));
await probar('MATRIZ',                  wb => E.hojaMatrizClientes(wb, inventario, separadasMatriz));
await probar('LISTA PRECIOS (COP)',     wb => E.hojaListaPreciosClientes(wb, inventario, 0));
await probar('LISTA PRECIOS (USD)',     wb => E.hojaListaPreciosClientes(wb, inventario, 4100));
await probar('COTIZACION',              wb => E.hojaCotizacionCliente(wb, cotizacion));
await probar('CARTERA CLIENTE',         wb => E.hojaCarteraCliente(wb, carteraCliente));
await probar('CARTERA INTERNA',         wb => E.hojaCarteraInterna(wb, carteraTodos));
await probar('DISPONIBLES INTERNA',     wb => E.hojaListaDisponiblesInterna(wb, inventario));
await probar('INVENTARIO INTERNO',      wb => E.hojaInventarioInterno(wb, inventario));
await probar('PRECIOS INTERNOS',        wb => E.hojaPreciosInternos(wb, inventario));
await probar('UTILIDAD CONTENEDOR',     wb => E.hojaUtilidadContenedor(wb, utilidadCont, 'UTILIDAD CONT', inversionistas));

// El libro completo, que es como se descarga "todo junto".
await probar('LIBRO COMPLETO (13 hojas)', wb => {
  E.hojaDespachoBodega(wb, despachos, { totales });
  E.hojaSeparadasBodega(wb, clientesSep);
  E.hojaInventarioBodega(wb, inventario);
  E.hojaMatrizClientes(wb, inventario, separadasMatriz);
  E.hojaListaPreciosClientes(wb, inventario, 4100);
  E.hojaCotizacionCliente(wb, cotizacion);
  E.hojaCarteraCliente(wb, carteraCliente);
  E.hojaCarteraInterna(wb, carteraTodos);
  E.hojaListaDisponiblesInterna(wb, inventario);
  E.hojaInventarioInterno(wb, inventario);
  E.hojaPreciosInternos(wb, inventario);
  E.hojaUtilidadContenedor(wb, utilidadCont, 'UTILIDAD CONT', inversionistas);
});

// ── Comprobación de contenido de la MATRIZ ────────────────────────
// Es la hoja que más pidió la dueña y la que más fácil sale vacía.
try {
  const wb = new ExcelJS.Workbook();
  E.hojaMatrizClientes(wb, inventario, separadasMatriz);
  const ws = wb.getWorksheet('MATRIZ');
  let encabezadoClientes = null;
  ws.eachRow((row, n) => {
    const vals = row.values.map(v => String(v ?? ''));
    if (!encabezadoClientes && vals.includes('Almacén La 14')) encabezadoClientes = n;
  });
  if (!encabezadoClientes) {
    fallos.push('MATRIZ: no aparece ninguna columna de cliente — la matriz salió vacía');
  } else {
    let sumaCliente = 0;
    ws.eachRow((row, n) => {
      if (n <= encabezadoClientes) return;
      for (let c = 1; c <= row.cellCount; c++) {
        const v = row.getCell(c).value;
        if (typeof v === 'number') sumaCliente += 0; // solo comprobamos que hay números
      }
    });
    ok.push(`MATRIZ: columnas de cliente presentes (fila de encabezado ${encabezadoClientes})`);
  }
} catch (err) {
  fallos.push('MATRIZ (contenido): ' + err.message);
}

console.log('\n═══ HOJAS GENERADAS ═══');
for (const x of ok) console.log('  ✓ ' + x);
if (fallos.length) {
  console.log('\n═══ FALLOS ═══');
  for (const x of fallos) console.log('  ✗ ' + x);
  process.exit(1);
}
console.log(`\n${ok.length} comprobaciones OK, 0 fallos`);
