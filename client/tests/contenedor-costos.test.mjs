// Las cuentas de un contenedor, y sobre todo el pacto con el servidor.
//
// Estas fórmulas existen dos veces: aquí (lo que se VE en la pantalla) y en
// src/routes/contenedores.js del backend (lo que se GUARDA, y de ahí el
// costo_base de cada paca al finalizar). Cuando dejaron de coincidir, la
// pantalla enseñó durante meses un total distinto del que quedaba guardado sin
// que nada lo delatara: una estimación con la factura tecleada a mano y sin
// valor por unidad valía su importe aquí y CERO allá.
//
// Cada caso de abajo está también en tests/costos-contenedor.test.js del
// backend. Si uno cambia, el otro tiene que cambiar con él.
import {
  costoServicioEfectivo, costoProveedorEfectivo, costoServicioAsignado,
  esServicioPropio, vieneDeEstimacion, hayEstimadoProveedor, etiquetaEstado,
} from '../src/lib/contenedor.js';

let malos = 0;
const grupo = (t) => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 52 - t.length)));
function comprobar(etiqueta, real, esperado) {
  const bien = Object.is(real, esperado) ||
    (typeof real === 'number' && typeof esperado === 'number' && Math.abs(real - esperado) < 1e-9);
  if (!bien) malos++;
  console.log(`  ${bien ? '✓' : '✗'} ${etiqueta.padEnd(46)} ${JSON.stringify(real)}${bien ? '' : '  ← esperaba ' + JSON.stringify(esperado)}`);
}

grupo('Costo de un servicio, en su propia moneda');
comprobar('factura real manda sobre todo lo demás',
  costoServicioEfectivo({ costo: '900000', cantidad_estimada: '2', valor_unidad_estimado: '100', factura_estimada: '5' }), 900000);
comprobar('sin factura real: cantidad × valor',
  costoServicioEfectivo({ costo: '0', cantidad_estimada: '2', valor_unidad_estimado: '300' }), 600);
comprobar('la casilla única escribe cantidad 1',
  costoServicioEfectivo({ costo: '', cantidad_estimada: '1', valor_unidad_estimado: '1500', factura_estimada: '1500' }), 1500);
comprobar('valor suelto sin cantidad',
  costoServicioEfectivo({ costo: '', cantidad_estimada: '', valor_unidad_estimado: '450000' }), 450000);
// El caso que estaba roto en el servidor: estimaciones viejas donde se tecleaba
// la factura y el valor por unidad salía de dividir.
comprobar('SOLO factura estimada (registro viejo)',
  costoServicioEfectivo({ costo: '0', factura_estimada: '450000' }), 450000);
comprobar('cantidad sin valor cae a la factura',
  costoServicioEfectivo({ costo: '', cantidad_estimada: '2', valor_unidad_estimado: '', factura_estimada: '450000' }), 450000);
comprobar('servicio vacío vale 0, no NaN',
  costoServicioEfectivo({}), 0);

grupo('Costo de un proveedor, en su propia moneda');
comprobar('líneas reales mandan',
  costoProveedorEfectivo({
    detalles: [{ cantidad: '100', costo_unitario: '35' }, { cantidad: '20', costo_unitario: '40' }],
    cantidad_estimada: '999', valor_unidad_estimado: '999',
  }), 4300);
comprobar('sin líneas: cantidad × valor estimado',
  costoProveedorEfectivo({ detalles: [], cantidad_estimada: '120', valor_unidad_estimado: '31' }), 3720);
comprobar('SOLO factura estimada (registro viejo)',
  costoProveedorEfectivo({ detalles: [], factura_estimada: '3720' }), 3720);
comprobar('líneas sin costo caen a lo estimado',
  costoProveedorEfectivo({ detalles: [{ cantidad: '10', costo_unitario: '0' }], cantidad_estimada: '10', valor_unidad_estimado: '5' }), 50);
comprobar('proveedor vacío vale 0, no NaN',
  costoProveedorEfectivo({}), 0);

grupo('Reparto de un servicio: propio vs. compartido');
// Contenedor físico de 500 unidades, 300 nuestras.
comprobar('compartido: solo la parte proporcional',
  costoServicioAsignado(5000000, { propio: false, base: 500, propias: 300 }), 3000000);
comprobar('propio: se asume entero',
  costoServicioAsignado(1200000, { propio: true, base: 500, propias: 300 }), 1200000);
comprobar('sin compartir da igual la marca',
  costoServicioAsignado(900000, { propio: true, base: 300, propias: 300 }),
  costoServicioAsignado(900000, { propio: false, base: 300, propias: 300 }));
comprobar('sin base conocida no se reparte',
  costoServicioAsignado(900000, { propio: false, base: 0, propias: 300 }), 900000);
comprobar('sin unidades propias no entra nada',
  costoServicioAsignado(900000, { propio: false, base: 500, propias: 0 }), 0);

grupo('La marca "propio" viaja por JSON');
// "false" es una cadena verdadera en JavaScript: con `!!sv.propio` un servicio
// compartido se habría cargado entero y el costo por paca saldría inflado.
comprobar('booleano true',            esServicioPropio({ propio: true }), true);
comprobar('booleano false',           esServicioPropio({ propio: false }), false);
comprobar('cadena "true"',            esServicioPropio({ propio: 'true' }), true);
comprobar('cadena "false" NO es propio', esServicioPropio({ propio: 'false' }), false);
comprobar('ausente = compartido',     esServicioPropio({}), false);
comprobar('null = compartido',        esServicioPropio({ propio: null }), false);

grupo('De dónde viene el contenedor');
comprobar('origen explícito manda',
  vieneDeEstimacion({ origen: 'estimacion', estado: 'finalizado' }), true);
comprobar('origen directo, aunque tenga estimados',
  vieneDeEstimacion({ origen: 'directo', proveedores_mercancia: [{ cantidad_estimada: 5 }] }), false);
comprobar('estimación viva sin columna todavía',
  vieneDeEstimacion({ estado: 'estimacion' }), true);
// Contenedores guardados antes de que existiera `origen`, mientras el servidor
// no haya rellenado el histórico.
comprobar('sin origen: se deduce de los estimados',
  vieneDeEstimacion({ estado: 'borrador', proveedores_mercancia: [{ cantidad_estimada: 120 }] }), true);
comprobar('sin origen y sin estimados: directo',
  vieneDeEstimacion({ estado: 'borrador', proveedores_mercancia: [{ detalles: [] }] }), false);
comprobar('contenedor vacío no revienta',
  vieneDeEstimacion({}), false);
comprobar('proveedor con valor por unidad cuenta',
  hayEstimadoProveedor({ valor_unidad_estimado: '285.5' }), true);
comprobar('proveedor en ceros no cuenta',
  hayEstimadoProveedor({ cantidad_estimada: 0, valor_unidad_estimado: 0, factura_estimada: '' }), false);

grupo('El estado en palabras');
// El Excel rotulaba "Borrador" tanto una estimación como una revisión.
comprobar('estimación', etiquetaEstado('estimacion'), 'Estimación');
comprobar('revisión',   etiquetaEstado('revision'),   'En revisión');
comprobar('finalizado', etiquetaEstado('finalizado'), 'Finalizado');
comprobar('desconocido se devuelve tal cual', etiquetaEstado('otro'), 'otro');
comprobar('sin estado', etiquetaEstado(undefined), '—');

grupo('El contenedor entero, como lo cuenta el servidor');
{
  // Mismo caso que "Servicio PROPIO en contenedor compartido" del backend:
  // 300 unidades nuestras de un contenedor de 500, tasa 4.000.
  //   mercancía: 300 × 100.000 COP        = 30.000.000
  //   flete compartido 5.000.000 /500×300 =  3.000.000
  //   transporte propio                   =  1.200.000
  const tasa = 4000, propias = 300, base = 500;
  const provs = [{ moneda: 'COP', detalles: [{ cantidad: 300, costo_unitario: 100000 }] }];
  const srvs = [
    { moneda: 'COP', costo: 5000000, propio: false },
    { moneda: 'COP', costo: 1200000, propio: true },
  ];
  const mercancia = provs.reduce((s, p) =>
    s + costoProveedorEfectivo(p) * (p.moneda === 'USD' ? tasa : 1), 0);
  const servicios = srvs.reduce((s, sv) => {
    const cop = costoServicioEfectivo(sv) * ((sv.moneda || 'COP') === 'USD' ? tasa : 1);
    return s + costoServicioAsignado(cop, { propio: esServicioPropio(sv), base, propias });
  }, 0);
  comprobar('costo mercancía', mercancia, 30000000);
  comprobar('costo servicios', servicios, 4200000);
  comprobar('costo total', mercancia + servicios, 34200000);
  comprobar('costo por unidad', (mercancia + servicios) / propias, 114000);
}

console.log(malos
  ? `\n✗ ${malos} comprobación(es) fallida(s)`
  : '\n✓ TODAS LAS PRUEBAS DE COSTOS DE CONTENEDOR PASARON');
process.exit(malos ? 1 : 0);
