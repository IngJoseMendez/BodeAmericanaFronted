// ── EL DESGLOSE DEL ENTREGABLE Y LO QUE GUARDÓ EL SERVIDOR ────────
//
// OJO CON LOS VECINOS, que se parecen y no son lo mismo:
//   · tests/contenedor-costos.test.mjs prueba las PIEZAS sueltas
//     (costoServicioEfectivo, costoServicioAsignado, esServicioPropio) contra
//     el contrato del servidor.
//   · tests/reparto-inversionistas.test.mjs prueba la hoja de utilidad con un
//     reparto 60/40.
//   · esta prueba es el nivel de arriba: `desgloseCostos` entero, contra las
//     cifras REALES que el servidor dejó guardadas para el C626, y las dos
//     hojas que se le entregan a un inversionista.
//
// `desgloseCostos` existe para que el Excel del inversionista enseñe el mismo
// costo por paca que la pantalla de Contenedores. Si las dos cuentas se
// separaran, habría dos cifras con el mismo nombre y ninguna forma de saber
// cuál creer — y una de ellas iría firmada en un entregable.
//
// Así que aquí se comprueba contra lo que el SERVIDOR dejó guardado en
// `costo_total`, `costo_unitario`, `costo_mercancia_total` y
// `costo_servicios_total`, que es lo que calculó su propia `calcularCostos`.
// Los contenedores de prueba son los dos casos que de verdad hay en producción
// y las dos trampas que documenta el código del servidor.
import assert from 'node:assert/strict';
import { desgloseCostos } from '../src/lib/contenedor.js';

let hechas = 0;
const prueba = (nombre, fn) => { fn(); hechas++; console.log('  ✓ ' + nombre); };
const cerca = (a, b, tol = 0.01) => Math.abs(a - b) < tol;

console.log('El desglose de costos del contenedor');

// ── 1. El caso real: C626, el único con servicios ─────────────────
//
// Sale de producción tal cual. Y es el caso difícil a propósito: es un
// contenedor COMPARTIDO —205 pacas nuestras de 525— con ocho servicios de los
// que tres son propios y cinco se reparten, en dos monedas.
//
// La primera versión de esta prueba se escribió sin `cantidad_total` y dio
// 192.940.400 de servicios contra los 85.909.603,81 guardados: 107 millones de
// diferencia por una sola línea olvidada. Que el prorrateo esté en la prueba
// con su número real es justo lo que impide que el entregable lo pierda.
const C626 = {
  numero: 'C626', total_pacas: 205, cantidad_total: 525,
  tasa_conversion: 3300, moneda_base: 'USD',
  costo_mercancia_total: 131835000, costo_servicios_total: 85909603.81,
  costo_total: 217744603.81, costo_unitario: 1062168.7991, utilidad_unitaria: 150000,
  proveedores_mercancia: [
    { proveedor_nombre: 'DIAS', moneda: 'USD',
      detalles: [{ cantidad: 124, costo_unitario: 24620 / 124 }] },
    { proveedor_nombre: 'MIRTA', moneda: 'USD',
      detalles: [{ cantidad: 81, costo_unitario: 15330 / 81 }] },
  ],
  servicios: [
    { proveedor_nombre: 'Juan Carlos', tipo_servicio: 'transporte', costo: 4930, moneda: 'USD', propio: false },
    { proveedor_nombre: 'Cajas', tipo_servicio: 'almacenaje', costo: 679, moneda: 'USD', propio: false },
    { proveedor_nombre: 'Balletas', tipo_servicio: 'cargue', costo: 1269, moneda: 'USD', propio: false },
    { proveedor_nombre: 'Martin', tipo_servicio: 'transporte', costo: 205, moneda: 'USD', propio: true },
    { proveedor_nombre: 'Gilberto', tipo_servicio: 'almacenaje', costo: 505, moneda: 'USD', propio: true },
    { proveedor_nombre: 'Bodega', tipo_servicio: 'almacenaje', costo: 15000000, moneda: 'COP', propio: true },
    { proveedor_nombre: 'Nac', tipo_servicio: 'aduana', costo: 140000000, moneda: 'COP', propio: false },
    { proveedor_nombre: 'Col', tipo_servicio: 'transporte', costo: 12900000, moneda: 'COP', propio: false },
  ],
};

prueba('la mercancia da lo que el servidor guardo', () => {
  const d = desgloseCostos(C626);
  assert.ok(cerca(d.costoMercancia, C626.costo_mercancia_total, 1),
    `mercancia ${d.costoMercancia} contra ${C626.costo_mercancia_total}`);
});

prueba('los servicios dan lo que el servidor guardo', () => {
  const d = desgloseCostos(C626);
  assert.ok(cerca(d.costoServicios, C626.costo_servicios_total, 1),
    `servicios ${d.costoServicios} contra ${C626.costo_servicios_total}`);
});

prueba('el total y el costo por paca coinciden al peso', () => {
  const d = desgloseCostos(C626);
  assert.ok(cerca(d.costoTotal, C626.costo_total, 1),
    `total ${d.costoTotal} contra ${C626.costo_total}`);
  assert.ok(cerca(d.costoUnitario, C626.costo_unitario, 0.01),
    `unitario ${d.costoUnitario} contra ${C626.costo_unitario}`);
});

// ── 2. Un contenedor sin servicios, como los diez de la migracion ──
prueba('sin servicios, el total es solo la mercancia', () => {
  const d = desgloseCostos({
    numero: 'C526', total_pacas: 55, tasa_conversion: 1,
    costo_mercancia_total: 51579820.57, costo_servicios_total: 0,
    costo_total: 51579820.57, costo_unitario: 937814.9194,
    proveedores_mercancia: [{ proveedor_nombre: 'DIAS', moneda: 'COP',
      detalles: [{ cantidad: 55, costo_unitario: 937814.9194 }] }],
    servicios: [],
  });
  assert.equal(d.servicios.length, 0);
  assert.ok(cerca(d.costoTotal, 51579820.57, 1));
  assert.ok(cerca(d.costoUnitario, 937814.9194, 0.01));
});

// ── 3. LAS DOS TRAMPAS QUE DOCUMENTA EL SERVIDOR ──────────────────
//
// Son las que de verdad se pierden al rehacer esta cuenta, y cada una deja el
// costo por paca MAS BARATO de lo que es, que es el error caro: de ahí sale el
// `costo_base` de cada paca y con él el precio mínimo al que se cotiza.
prueba('un servicio PROPIO no se prorratea aunque el contenedor sea compartido', () => {
  // 100 unidades en el contenedor fisico, 50 nuestras. Un servicio compartido
  // de 1.000 nos cuesta 500; uno propio de 1.000 nos cuesta 1.000.
  const base = { total_pacas: 50, cantidad_total: 100, tasa_conversion: 1,
    proveedores_mercancia: [], servicios: [] };
  const compartido = desgloseCostos({ ...base,
    servicios: [{ proveedor_nombre: 'Flete', costo: 1000, moneda: 'COP', propio: false }] });
  const propio = desgloseCostos({ ...base,
    servicios: [{ proveedor_nombre: 'Su transporte', costo: 1000, moneda: 'COP', propio: true }] });
  assert.equal(compartido.costoServicios, 500);
  assert.equal(propio.costoServicios, 1000);
  // Y lo que suma cada paca NUESTRA: el propio se divide entre las nuestras.
  assert.equal(propio.servicios[0].porPaca, 20);
  assert.equal(compartido.servicios[0].porPaca, 10);
});

prueba('un servicio sin costo real usa su estimado', () => {
  const porCantidad = desgloseCostos({ total_pacas: 10, tasa_conversion: 1,
    proveedores_mercancia: [],
    servicios: [{ proveedor_nombre: 'Flete', costo: 0, moneda: 'COP',
      cantidad_estimada: 4, valor_unidad_estimado: 250 }] });
  assert.equal(porCantidad.costoServicios, 1000);
  const porFactura = desgloseCostos({ total_pacas: 10, tasa_conversion: 1,
    proveedores_mercancia: [],
    servicios: [{ proveedor_nombre: 'Flete', costo: 0, moneda: 'COP', factura_estimada: 800 }] });
  assert.equal(porFactura.costoServicios, 800);
  assert.equal(porFactura.servicios[0].estimado, true);
});

prueba('la moneda del servicio se convierte, la del proveedor tambien', () => {
  const d = desgloseCostos({ total_pacas: 2, tasa_conversion: 4000,
    proveedores_mercancia: [{ proveedor_nombre: 'X', moneda: 'USD',
      detalles: [{ cantidad: 2, costo_unitario: 100 }] }],
    servicios: [{ proveedor_nombre: 'Flete', costo: 50, moneda: 'USD', propio: true }] });
  assert.equal(d.costoMercancia, 800000);   // 200 US x 4000
  assert.equal(d.costoServicios, 200000);   // 50 US x 4000
  assert.equal(d.costoUnitario, 500000);
});

// ── 4. Lo que no puede reventar ───────────────────────────────────
prueba('un contenedor vacio no revienta ni divide por cero', () => {
  for (const nada of [{}, { servicios: [], proveedores_mercancia: [] },
    { total_pacas: 0, servicios: [{ costo: 100 }] }]) {
    const d = desgloseCostos(nada);
    assert.ok(Number.isFinite(d.costoTotal));
    assert.ok(Number.isFinite(d.costoUnitario));
    assert.equal(d.costoUnitario >= 0, true);
  }
});

prueba('la utilidad por paca llega al total y a inversion + utilidad', () => {
  const d = desgloseCostos(C626);
  assert.equal(d.utilidadUnitaria, 150000);
  assert.equal(d.utilidadTotal, 150000 * 205);
  assert.ok(cerca(d.inversionMasUtilidad, d.costoTotal + 150000 * 205, 1));
});

// ── 5. Y QUE LA HOJA SE PINTE CON ESAS CIFRAS ─────────────────────
//
// Que el desglose cuadre no sirve de nada si la hoja escribe otra cosa en la
// celda. Se genera el libro de verdad y se leen las celdas que lleva firmadas.
const { hojaCostosContenedor, hojaUtilidadContenedor, nuevoLibro } =
  await import('../src/lib/entregables.js');

const celdaPorEtiqueta = (ws, etiqueta) => {
  for (let f = 1; f <= ws.rowCount; f++) {
    if (String(ws.getCell(f, 1).value ?? '').trim() === etiqueta) return ws.getCell(f, 2).value;
  }
  return undefined;
};

prueba('la hoja de COSTOS escribe el total y el costo por paca del desglose', () => {
  const wb = nuevoLibro();
  const d = desgloseCostos(C626);
  const ws = hojaCostosContenedor(wb, C626, 'COSTOS C626', d);
  assert.ok(cerca(celdaPorEtiqueta(ws, 'GRAN TOTAL INVERSION'), d.costoTotal, 1));
  assert.ok(cerca(celdaPorEtiqueta(ws, 'COSTO POR PACA'), d.costoUnitario, 0.01));
  assert.equal(celdaPorEtiqueta(ws, 'CANTIDAD NOSOTROS'), 205);
  assert.equal(celdaPorEtiqueta(ws, 'VALOR DOLAR'), 3300);
  // Es compartido, asi que la hoja TIENE que decirlo: sin eso, los 85 millones
  // de servicios no se pueden explicar.
  assert.equal(celdaPorEtiqueta(ws, 'CANTIDAD TOTAL DEL CONTENEDOR'), 525);
});

prueba('la hoja de COSTOS trae una linea por proveedor y por servicio', () => {
  const wb = nuevoLibro();
  const d = desgloseCostos(C626);
  const ws = hojaCostosContenedor(wb, C626, 'COSTOS C626', d);
  const texto = [];
  for (let f = 1; f <= ws.rowCount; f++) texto.push(String(ws.getCell(f, 1).value ?? ''));
  for (const quien of ['DIAS', 'MIRTA', 'Juan Carlos', 'Cajas', 'Balletas',
    'Martin', 'Gilberto', 'Bodega', 'Nac', 'Col']) {
    assert.ok(texto.some((t) => t.includes(quien)), `falta ${quien} en la hoja`);
  }
  // Y los propios quedan marcados como tales en la columna del reparto.
  const repartos = [];
  for (let f = 1; f <= ws.rowCount; f++) repartos.push(String(ws.getCell(f, 6).value ?? ''));
  assert.equal(repartos.filter((t) => t === 'propio').length, 3);
  assert.equal(repartos.filter((t) => t === '205/525').length, 5);
});

prueba('sin aportes la hoja lo dice en vez de quedarse muda', () => {
  const wb = nuevoLibro();
  const ws = hojaUtilidadContenedor(wb, C626, 'UTILIDAD C626', []);
  let encontrado = false;
  for (let f = 1; f <= ws.rowCount; f++) {
    if (String(ws.getCell(f, 1).value ?? '').includes('Sin inversionistas')) encontrado = true;
  }
  assert.ok(encontrado, 'la hoja no avisa de que no hay inversionistas');
});

console.log('');
console.log(hechas + ' comprobaciones OK, 0 fallos');
