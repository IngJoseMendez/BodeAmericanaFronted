// ── LO QUE YA REPARTÍ ───────────────────────────────────────────────────────
//
// LA PREGUNTA QUE NO SE PODÍA HACER. La Matriz enseñaba UNA ronda a la vez: se
// abría, se repartía y se cerraba. Pero la pregunta que se hace después es la
// contraria y es acumulada: «de todo lo que repartí este mes, cuántos
// deportivos salieron, de qué calidad, y a quién». Con cuatro rondas en un mes
// eso eran cuatro pantallas y una suma de cabeza.
//
// SE LEE POR FAMILIA, NO POR REFERENCIA. «Cuántos deportivos» no es una
// referencia: son tres («deportivo», «deportivo invierno», «deportivo plus
// size»). Y «cuántas blusas» son siete. La familia se deduce de la primera
// palabra del nombre —la regla entera, con sus trampas medidas, está en
// lib/familias.js— porque la tabla que debería tenerla está vacía: en
// producción hay 1 familia asignada de 112 referencias.
//
// TRES NIVELES, Y NO MÁS. La familia se abre en sus referencias, y cada
// referencia en sus clientes. Al abrir la familia se ve además, de un golpe, a
// qué personas fue toda la familia: es la mitad de la pregunta y pedir dos
// clics para leerla la escondería.
//
// LAS COLUMNAS SON LAS CALIDADES QUE DE VERDAD SALIERON en el rango, ordenadas
// por volumen. No la lista de las diez que existen: ocho columnas en cero no
// informan de nada y en tableta empujan el total fuera de la pantalla.
import { useEffect, useMemo, useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, EmptyState, TableSkeleton, useToast } from '../components/common';
import { matrizApi } from '../services/api';
import { construirFamilias } from '../lib/familias';
import { formatFecha } from '../lib/fecha';
import { descargarExcel } from '../lib/descargar';
import { mensajeDeError } from '../lib/errores';
import ExcelJS from 'exceljs';
import {
  LayoutGrid, Search, X, Download, ChevronRight, ChevronDown, Users, Calendar,
} from 'lucide-react';

// ── LOS RANGOS, CALCULADOS EN HORA LOCAL ────────────────────────────────────
//
// `toISOString()` convierte a UTC, así que a las 7 p.m. en Colombia devuelve la
// fecha de mañana: el rango «este mes» empezaría el día 2 y el día 1 se
// quedaría fuera sin que nada avise. Es la misma trampa que ya está escrita en
// lib/precios.js y en el `hoyCO()` del servidor.
const diaISO = (d) => [
  d.getFullYear(),
  String(d.getMonth() + 1).padStart(2, '0'),
  String(d.getDate()).padStart(2, '0'),
].join('-');

const RANGOS = [
  {
    clave: 'mes', label: 'Este mes',
    calcular: () => {
      const h = new Date();
      return { desde: diaISO(new Date(h.getFullYear(), h.getMonth(), 1)), hasta: diaISO(h) };
    },
  },
  {
    clave: 'mes-pasado', label: 'Mes pasado',
    calcular: () => {
      const h = new Date();
      return {
        desde: diaISO(new Date(h.getFullYear(), h.getMonth() - 1, 1)),
        // Día 0 del mes actual = último día del anterior.
        hasta: diaISO(new Date(h.getFullYear(), h.getMonth(), 0)),
      };
    },
  },
  {
    clave: 'tres-meses', label: 'Últimos 3 meses',
    calcular: () => {
      const h = new Date();
      return { desde: diaISO(new Date(h.getFullYear(), h.getMonth() - 2, 1)), hasta: diaISO(h) };
    },
  },
  { clave: 'todo', label: 'Todo', calcular: () => ({ desde: '', hasta: '' }) },
];

const normalizar = (t) => String(t ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ROTULO_SIN_CALIDAD = 'Sin calidad';

export default function MatrizRepartido() {
  const [rango, setRango] = useState('mes');
  const [desde, setDesde] = useState(RANGOS[0].calcular().desde);
  const [hasta, setHasta] = useState(RANGOS[0].calcular().hasta);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [abiertas, setAbiertas] = useState(() => new Set());
  const [abiertasRef, setAbiertasRef] = useState(() => new Set());
  const [exportando, setExportando] = useState(false);
  const { addToast } = useToast();

  const elegirRango = (clave) => {
    const r = RANGOS.find((x) => x.clave === clave);
    if (!r) return;
    const { desde: d, hasta: h } = r.calcular();
    setRango(clave);
    setDesde(d);
    setHasta(h);
  };

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        setCargando(true);
        const r = await matrizApi.getRepartido({
          ...(desde ? { desde } : {}),
          ...(hasta ? { hasta } : {}),
        });
        if (vigente) setDatos(r);
      } catch (err) {
        if (vigente) addToast(mensajeDeError(err, 'consultar lo repartido'), 'error');
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => { vigente = false; };
  }, [desde, hasta]);

  // useMemo y no `datos?.filas || []` a secas: con `datos` en null ese `|| []`
  // crea un arreglo NUEVO en cada render, y entonces el useMemo de la matriz
  // -que lo lleva como dependencia- se recalcularia entero cada vez.
  const filas = useMemo(() => datos?.filas || [], [datos]);
  const repartos = useMemo(() => datos?.repartos || [], [datos]);

  // ── LA MATRIZ ─────────────────────────────────────────────────────────────
  //
  // Se arma de una pasada sobre las filas crudas. La familia la decide
  // `construirFamilias` con TODAS las referencias del rango —repetidas a
  // propósito: así la etiqueta que se lee es la forma que de verdad se usa más—.
  const matriz = useMemo(() => {
    const { claveDe, etiquetaDe } = construirFamilias(filas.map((f) => f.referencia));

    const calidades = new Map(); // calidad -> total
    const familias = new Map();  // clave -> { etiqueta, total, porCalidad, clientes, referencias }

    for (const f of filas) {
      const calidad = f.calidad || '';
      const n = Number(f.repartidas) || 0;
      calidades.set(calidad, (calidades.get(calidad) || 0) + n);

      const clave = claveDe(f.referencia) || '';
      let fam = familias.get(clave);
      if (!fam) {
        fam = {
          clave, etiqueta: etiquetaDe(clave) || '—',
          total: 0, porCalidad: new Map(), clientes: new Map(), referencias: new Map(),
        };
        familias.set(clave, fam);
      }
      fam.total += n;
      fam.porCalidad.set(calidad, (fam.porCalidad.get(calidad) || 0) + n);
      fam.clientes.set(f.cliente_nombre, (fam.clientes.get(f.cliente_nombre) || 0) + n);

      let ref = fam.referencias.get(f.referencia);
      if (!ref) {
        ref = { referencia: f.referencia, total: 0, porCalidad: new Map(), clientes: [] };
        fam.referencias.set(f.referencia, ref);
      }
      ref.total += n;
      ref.porCalidad.set(calidad, (ref.porCalidad.get(calidad) || 0) + n);
      ref.clientes.push({
        cliente_id: f.cliente_id, nombre: f.cliente_nombre, ciudad: f.cliente_ciudad,
        calidad, repartidas: n, veces: Number(f.veces) || 0,
        primera: f.primera, ultima: f.ultima,
      });
    }

    // Las calidades por volumen: lo que más salió, primero. La lista de las
    // diez que existen dejaría ocho columnas en cero.
    const columnas = [...calidades.entries()]
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'es'))
      .map(([calidad, total]) => ({ calidad, total }));

    const lista = [...familias.values()]
      .map((fam) => ({
        ...fam,
        clientesOrdenados: [...fam.clientes.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')),
        referenciasOrdenadas: [...fam.referencias.values()]
          .map((r) => ({
            ...r,
            clientes: [...r.clientes].sort(
              (a, b) => b.repartidas - a.repartidas || a.nombre.localeCompare(b.nombre, 'es')
            ),
          }))
          .sort((a, b) => b.total - a.total || a.referencia.localeCompare(b.referencia, 'es')),
      }))
      .sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta, 'es'));

    const total = lista.reduce((s, f) => s + f.total, 0);
    const clientesDistintos = new Set(filas.map((f) => f.cliente_id)).size;

    return { columnas, familias: lista, total, clientesDistintos };
  }, [filas]);

  // La búsqueda mira la familia, sus referencias y sus clientes: se busca por
  // «blusa», por «blusa vestido» y por «JOHAN» con la misma caja.
  const visibles = useMemo(() => {
    const q = normalizar(busqueda).split(/\s+/).filter(Boolean);
    if (!q.length) return matriz.familias;
    return matriz.familias.filter((fam) => {
      const heno = normalizar([
        fam.etiqueta,
        ...fam.referenciasOrdenadas.map((r) => r.referencia),
        ...fam.clientesOrdenados.map(([nombre]) => nombre),
      ].join(' '));
      return q.every((t) => heno.includes(t));
    });
  }, [matriz.familias, busqueda]);

  const alternar = (conjunto, poner, clave) => {
    const siguiente = new Set(conjunto);
    if (siguiente.has(clave)) siguiente.delete(clave); else siguiente.add(clave);
    poner(siguiente);
  };

  const exportar = async () => {
    try {
      setExportando(true);
      const wb = new ExcelJS.Workbook();

      // Hoja 1: la matriz, como se ve.
      const resumen = wb.addWorksheet('Por familia');
      resumen.columns = [
        { header: 'Familia', key: 'familia', width: 24 },
        ...matriz.columnas.map((c) => ({
          header: c.calidad || ROTULO_SIN_CALIDAD, key: `c_${c.calidad}`, width: 13,
        })),
        { header: 'TOTAL', key: 'total', width: 10 },
        { header: 'Clientes', key: 'clientes', width: 10 },
      ];
      for (const fam of matriz.familias) {
        resumen.addRow({
          familia: fam.etiqueta,
          ...Object.fromEntries(matriz.columnas.map((c) => [`c_${c.calidad}`, fam.porCalidad.get(c.calidad) || 0])),
          total: fam.total,
          clientes: fam.clientesOrdenados.length,
        });
      }
      resumen.getRow(1).font = { bold: true };

      // Hoja 2: el detalle línea por línea, que es lo que se revisa cuando una
      // cifra de la primera hoja no cuadra con lo que alguien recuerda.
      const detalle = wb.addWorksheet('Detalle');
      detalle.columns = [
        { header: 'Familia', key: 'familia', width: 20 },
        { header: 'Referencia', key: 'referencia', width: 28 },
        { header: 'Calidad', key: 'calidad', width: 14 },
        { header: 'Cliente', key: 'cliente', width: 26 },
        { header: 'Unidades', key: 'unidades', width: 10 },
        { header: 'Veces', key: 'veces', width: 8 },
        { header: 'Primera', key: 'primera', width: 12 },
        { header: 'Última', key: 'ultima', width: 12 },
      ];
      for (const fam of matriz.familias) {
        for (const ref of fam.referenciasOrdenadas) {
          for (const cl of ref.clientes) {
            detalle.addRow({
              familia: fam.etiqueta, referencia: ref.referencia,
              calidad: cl.calidad || ROTULO_SIN_CALIDAD, cliente: cl.nombre,
              unidades: cl.repartidas, veces: cl.veces,
              primera: cl.primera || '', ultima: cl.ultima || '',
            });
          }
        }
      }
      detalle.getRow(1).font = { bold: true };

      const buffer = await wb.xlsx.writeBuffer();
      const sufijo = desde || hasta ? `${desde || 'inicio'}_${hasta || 'hoy'}` : 'todo';
      descargarExcel(buffer, `Repartido_${sufijo}`);
    } catch (err) {
      addToast(mensajeDeError(err, 'generar el Excel'), 'error');
    } finally {
      setExportando(false);
    }
  };

  const rangoReal = datos?.real;
  const celda = 'px-3 py-2 text-sm tabular-nums text-right';

  return (
    <Layout
      title="Lo repartido"
      subtitle={cargando ? undefined
        : `${matriz.total.toLocaleString('es-CO')} unidades · ${repartos.length} ronda(s) · ${matriz.clientesDistintos} cliente(s)`}
    >
      <div className="space-y-5">
        {/* ── EL RANGO, Y QUÉ RONDAS ESTÁ JUNTANDO ───────────────────────
            «15 deportivos» sin saber si salen de una ronda o de cinco es la
            mitad de la respuesta, y juntar varias rondas en una sola vista es
            justo lo que esta pantalla existe para hacer. */}
        <Card>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Calendar className="w-4 h-4 text-muted flex-shrink-0" aria-hidden="true" />
              {RANGOS.map((r) => (
                <Button
                  key={r.clave}
                  variant={rango === r.clave ? 'secondary' : 'ghost'}
                  size="sm"
                  className={rango === r.clave ? '' : 'border border-border'}
                  aria-pressed={rango === r.clave}
                  onClick={() => elegirRango(r.clave)}
                >
                  {r.label}
                </Button>
              ))}
              <div className="flex items-center gap-2 ml-auto">
                <input type="date" value={desde} aria-label="Desde"
                  onChange={(e) => { setDesde(e.target.value); setRango('propio'); }}
                  className="px-3 py-2 rounded-xl border border-border bg-surface text-sm min-h-11" />
                <span className="text-xs text-muted">a</span>
                <input type="date" value={hasta} aria-label="Hasta"
                  onChange={(e) => { setHasta(e.target.value); setRango('propio'); }}
                  className="px-3 py-2 rounded-xl border border-border bg-surface text-sm min-h-11" />
              </div>
            </div>

            {!cargando && (
              <p className="text-xs text-muted leading-relaxed">
                {repartos.length === 0 ? (
                  'No hay ninguna ronda con mercancía repartida en este rango.'
                ) : (
                  <>
                    Juntando <b className="text-primary">{repartos.length} ronda(s)</b>
                    {/* El rango REAL, no el pedido: si se pide el mes y las
                        rondas son del 25, decir «del 1 al 30» invita a creer
                        que hubo reparto el día 2. */}
                    {rangoReal?.desde && (
                      <> · {rangoReal.desde === rangoReal.hasta
                        ? formatFecha(rangoReal.desde)
                        : <>del {formatFecha(rangoReal.desde)} al {formatFecha(rangoReal.hasta)}</>}</>
                    )}
                    {': '}
                    {repartos.map((r, i) => (
                      <span key={r.id}>
                        {i > 0 && ' · '}
                        <span className="text-primary">{r.numero || `#${r.id}`}</span>
                        {' '}({r.repartidas})
                      </span>
                    ))}
                  </>
                )}
              </p>
            )}
          </CardBody>
        </Card>

        {/* Buscador + Excel */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" aria-hidden="true" />
            <input
              type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              aria-label="Buscar familia, referencia o cliente"
              placeholder="Buscar: blusa, deportivo, un cliente…"
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-border bg-surface text-sm min-h-11 focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
            {busqueda && (
              <button type="button" onClick={() => setBusqueda('')}
                aria-label="Limpiar la búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted hover:text-primary hover:bg-primary/5">
                <X size={15} />
              </button>
            )}
          </div>
          <Button variant="ghost" size="sm" icon={Download} className="border border-border"
            disabled={exportando || !matriz.familias.length} onClick={exportar}>
            {exportando ? 'Generando…' : 'Excel'}
          </Button>
          {/* De vuelta a repartir: esta pantalla se mira DESPUÉS de una ronda, y
              casi siempre para decidir la siguiente.

              ES UN BOTÓN Y NO UN ENLACE DE TEXTO, y eso cambió al quitar
              «Repartido» del menú lateral: desde que la única puerta de entrada
              es el botón de la Matriz, ésta es también la única salida, y en
              tableta un texto de 12 px sin altura propia no es un blanco que se
              pueda tocar. Lleva `min-h-11` (44 px) como el de ida. */}
          <Link to="/separacion-masiva"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs font-semibold text-primary hover:bg-primary/5 transition-colors min-h-11">
            <LayoutGrid size={14} aria-hidden="true" /> Ir a la Matriz
          </Link>
        </div>

        <Card padding={false}>
          {cargando ? (
            <div className="p-4"><TableSkeleton rows={6} /></div>
          ) : !matriz.familias.length ? (
            <EmptyState
              icon={LayoutGrid}
              title="Todavía no hay nada repartido en este rango"
              description="Cambia el rango de fechas, o reparte una ronda en la Matriz y aquí quedará la foto de lo que salió."
            />
          ) : !visibles.length ? (
            <EmptyState
              icon={Search}
              title={`Nada que coincida con «${busqueda}»`}
              description="Se busca por familia, por referencia y por cliente."
              action={{ label: 'Limpiar', onClick: () => setBusqueda('') }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-border bg-primary/[0.03]">
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold text-muted uppercase tracking-wide">
                      Familia
                    </th>
                    {matriz.columnas.map((c) => (
                      <th key={c.calidad}
                        className="px-3 py-2.5 text-right text-[11px] font-bold text-muted uppercase tracking-wide whitespace-nowrap">
                        {c.calidad || ROTULO_SIN_CALIDAD}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold text-primary uppercase tracking-wide">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((fam) => {
                    const abierta = abiertas.has(fam.clave);
                    return (
                      <Fragment key={fam.clave || '—'}>
                        {/* La fila entera abre y cierra: una flecha de 15 px en
                            tableta y sin ratón hay que acertarla. */}
                        <tr
                          onClick={() => alternar(abiertas, setAbiertas, fam.clave)}
                          className={`border-b border-border/40 cursor-pointer transition-colors ${abierta ? 'bg-secondary/5' : 'hover:bg-primary/[0.02]'}`}
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <button type="button"
                                onClick={(e) => { e.stopPropagation(); alternar(abiertas, setAbiertas, fam.clave); }}
                                aria-expanded={abierta}
                                aria-label={`${abierta ? 'Cerrar' : 'Ver el detalle de'} ${fam.etiqueta}`}
                                className="p-1 rounded-lg text-muted hover:text-secondary hover:bg-secondary/10">
                                {abierta ? <ChevronDown size={15} className="text-secondary" /> : <ChevronRight size={15} />}
                              </button>
                              <span className="font-semibold text-sm text-primary capitalize">{fam.etiqueta}</span>
                              <span className="text-[11px] text-muted">
                                {fam.referenciasOrdenadas.length} ref.
                              </span>
                              <span className="text-[11px] text-muted inline-flex items-center gap-1">
                                <Users size={11} aria-hidden="true" />
                                {fam.clientesOrdenados.length}
                              </span>
                            </div>
                          </td>
                          {matriz.columnas.map((c) => {
                            const n = fam.porCalidad.get(c.calidad) || 0;
                            return (
                              <td key={c.calidad} className={`${celda} ${n ? 'text-primary font-medium' : 'text-muted/40'}`}>
                                {n || '·'}
                              </td>
                            );
                          })}
                          <td className={`${celda} font-bold text-primary`}>{fam.total}</td>
                        </tr>

                        {abierta && (
                          <>
                            {/* ── A QUÉ PERSONAS FUE TODA LA FAMILIA ────────
                                Es la mitad de la pregunta («cuántos deportivos
                                y a qué personas»), así que se lee al abrir la
                                familia y no dos clics más adentro. */}
                            <tr className="bg-secondary/[0.03]">
                              <td colSpan={matriz.columnas.length + 2} className="px-3 pt-3 pb-1">
                                <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1.5">
                                  Se lo llevaron
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {fam.clientesOrdenados.map(([nombre, n]) => (
                                    <span key={nombre}
                                      className="inline-flex items-center gap-1.5 text-xs bg-surface border border-border rounded-full px-2.5 py-1">
                                      <span className="text-primary">{nombre}</span>
                                      <b className="tabular-nums text-secondary">{n}</b>
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>

                            {fam.referenciasOrdenadas.map((ref) => {
                              const claveRef = `${fam.clave}|${ref.referencia}`;
                              const abiertaRef = abiertasRef.has(claveRef);
                              return (
                                <Fragment key={claveRef}>
                                  <tr
                                    onClick={() => alternar(abiertasRef, setAbiertasRef, claveRef)}
                                    className="border-b border-border/30 bg-secondary/[0.03] cursor-pointer hover:bg-secondary/[0.06] transition-colors"
                                  >
                                    <td className="px-3 py-2 pl-10">
                                      <div className="flex items-center gap-2">
                                        <button type="button"
                                          onClick={(e) => { e.stopPropagation(); alternar(abiertasRef, setAbiertasRef, claveRef); }}
                                          aria-expanded={abiertaRef}
                                          aria-label={`${abiertaRef ? 'Cerrar' : 'Ver quién se llevó'} ${ref.referencia}`}
                                          className="p-1 rounded-lg text-muted hover:text-secondary hover:bg-secondary/10">
                                          {abiertaRef ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                        </button>
                                        <span className="text-sm text-primary capitalize">{ref.referencia}</span>
                                      </div>
                                    </td>
                                    {matriz.columnas.map((c) => {
                                      const n = ref.porCalidad.get(c.calidad) || 0;
                                      return (
                                        <td key={c.calidad} className={`${celda} ${n ? 'text-primary' : 'text-muted/30'}`}>
                                          {n || '·'}
                                        </td>
                                      );
                                    })}
                                    <td className={`${celda} font-semibold text-primary`}>{ref.total}</td>
                                  </tr>

                                  {abiertaRef && ref.clientes.map((cl, i) => (
                                    <tr key={`${claveRef}|${cl.cliente_id}|${cl.calidad}|${i}`}
                                      className="border-b border-border/20 bg-primary/[0.015]">
                                      <td className="px-3 py-1.5 pl-20">
                                        <span className="text-xs text-primary">{cl.nombre}</span>
                                        {cl.ciudad && <span className="text-[11px] text-muted"> · {cl.ciudad}</span>}
                                        {/* Cuántas veces y cuándo: no es lo
                                            mismo llevarse 10 de una vez que 10
                                            en cuatro rondas, y al mirar un mes
                                            entero esa diferencia se pierde. */}
                                        {cl.veces > 1 && (
                                          <span className="text-[11px] text-muted"> · {cl.veces} veces</span>
                                        )}
                                        {cl.ultima && (
                                          <span className="text-[11px] text-muted/70"> · {formatFecha(cl.ultima)}</span>
                                        )}
                                      </td>
                                      {matriz.columnas.map((c) => (
                                        <td key={c.calidad} className={`${celda} text-xs ${c.calidad === cl.calidad ? 'text-primary' : 'text-muted/20'}`}>
                                          {c.calidad === cl.calidad ? cl.repartidas : '·'}
                                        </td>
                                      ))}
                                      <td className={`${celda} text-xs font-medium text-primary`}>{cl.repartidas}</td>
                                    </tr>
                                  ))}
                                </Fragment>
                              );
                            })}
                          </>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  {/* El total de LO QUE SE ESTÁ VIENDO. Con la búsqueda puesta
                      no es el del rango, y decir que sí lo es sería enseñar un
                      número que no es el que dice ser. */}
                  <tr className="border-t-2 border-border bg-primary/[0.03]">
                    <td className="px-3 py-2.5 text-xs font-bold text-primary uppercase tracking-wide">
                      {busqueda ? 'Total de lo filtrado' : 'Total'}
                    </td>
                    {matriz.columnas.map((c) => {
                      const n = visibles.reduce((s, f) => s + (f.porCalidad.get(c.calidad) || 0), 0);
                      return (
                        <td key={c.calidad} className={`${celda} font-bold ${n ? 'text-primary' : 'text-muted/40'}`}>
                          {n || '·'}
                        </td>
                      );
                    })}
                    <td className={`${celda} font-bold text-secondary`}>
                      {visibles.reduce((s, f) => s + f.total, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        {/* Qué NO cuenta esta pantalla. Decirlo evita la conclusión falsa de
            que a un cliente no se le ha dado nada cuando lo que pasa es que se
            le separó por fuera de la Matriz. */}
        {!cargando && (
          <p className="text-[11px] text-muted leading-relaxed px-1">
            Aquí sale lo repartido <b>desde la Matriz</b>. Lo que se separó una por una desde
            Inventario o se cotizó a mano no pasa por estas rondas, así que no se cuenta.
          </p>
        )}
      </div>
    </Layout>
  );
}
