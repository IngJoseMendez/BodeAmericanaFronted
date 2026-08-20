import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, useToast } from '../components/common';
import {
  despachosApi, pacasApi, clientesApi, carteraApi,
  listaPreciosApi, cotizacionesApi, contenedoresApi, inversionistasApi,
} from '../services/api';
import { Download, Package2, Users, Lock, FileSpreadsheet, Loader2, LayoutGrid } from 'lucide-react';
import { parseMonto } from '../lib/money';
import { useAuth } from '../context/AuthContext';
import {
  nuevoLibro, descargar, int,
  hojaDespachoBodega, hojaSeparadasBodega, hojaInventarioBodega, hojaMatrizClientes,
  hojaListaPreciosClientes, hojaCotizacionCliente, hojaCarteraCliente,
  hojaCarteraInterna, hojaListaDisponiblesInterna, hojaInventarioInterno,
  hojaPreciosInternos, hojaUtilidadContenedor,
} from '../lib/entregables';

const norm = (s) => String(s ?? '').trim();

// Nombre de hoja válido en Excel: 31 caracteres y sin : \ / ? * [ ]
const nombreHoja = (base, usados) => {
  let limpio = norm(base).replace(/[*?:/\\[\]]/g, ' ').slice(0, 28) || 'Hoja';
  let n = 2, out = limpio;
  while (usados.has(out)) out = `${limpio.slice(0, 26)} ${n++}`;
  usados.add(out);
  return out;
};

export default function Entregables() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState(null);
  const [clienteSel, setClienteSel] = useState('');
  // Tasa opcional para publicar la lista de precios también en dólares.
  const [tasaLista, setTasaLista] = useState('');
  // Período de los Excel internos: todo / este mes / rango de fechas.
  const [periodo, setPeriodo] = useState('todo');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const { addToast } = useToast();
  // Los entregables internos llevan costos, márgenes y la cartera de TODOS los
  // clientes. La tarjeta decía "no sale de la oficina" pero no lo impedía: un
  // vendedor podía descargarlos igual. Ahora sólo los ve un administrador.
  const { tieneRol } = useAuth();
  const esAdmin = tieneRol('admin');

  useEffect(() => {
    (async () => {
      const [desp, inv, comp, cli, cart, lista, cont] = await Promise.allSettled([
        despachosApi.getAll(),
        pacasApi.getInventario(),
        pacasApi.getComprometidas({}),
        clientesApi.getAll(),
        carteraApi.getAll(),
        listaPreciosApi.getAll(),
        contenedoresApi.getAll(),
      ]);
      const val = (r, def = []) => (r.status === 'fulfilled' && r.value != null ? r.value : def);
      setDatos({
        despachos: val(desp), inventario: val(inv), comprometidas: val(comp),
        clientes: val(cli), cartera: val(cart), lista: val(lista), contenedores: val(cont),
      });
      setCargando(false);
    })();
  }, []);

  // ── Armado de datos por hoja ────────────────────────────────────

  const clientePorNombre = (nombre) =>
    (datos?.clientes || []).find(c => norm(c.nombre).toLowerCase() === norm(nombre).toLowerCase());

  // Despachos pendientes de salir, agrupados por referencia + calidad.
  const armarDespachos = async () => {
    const pendientes = (datos.despachos || []).filter(d => d.estado === 'en_proceso');
    const out = [];
    for (const d of pendientes) {
      let full = d;
      if (!d.items) { try { full = await despachosApi.getOne(d.id); } catch { continue; } }
      const grupos = new Map();
      for (const it of (full.items || [])) {
        const k = `${it.clasificacion}||${it.referencia}||${it.calidad}`;
        if (!grupos.has(k)) grupos.set(k, {
          clasificacion: it.clasificacion || '', categoria: it.categoria || '',
          referencia: it.referencia || '', calidad: it.calidad || '', cantidad: 0,
        });
        grupos.get(k).cantidad++;
      }
      const cli = clientePorNombre(full.cliente_nombre);
      out.push({
        nombre: full.destinatario || full.cliente_nombre || '',
        ciudad: full.ciudad_entrega || cli?.ciudad || '',
        direccion: full.direccion_entrega || cli?.direccion || '',
        celular: full.celular || cli?.telefono || '',
        transporte: full.tipo_transporte || '',
        grupos: [...grupos.values()],
      });
    }
    return out;
  };

  // Separadas agrupadas por cliente y luego por referencia + calidad.
  const armarSeparadas = () => {
    const sep = (datos.comprometidas || []).filter(r => r.estado !== 'despachada');
    const porCliente = new Map();
    for (const r of sep) {
      const nombre = norm(r.cliente_nombre) || 'Sin cliente asignado';
      if (!porCliente.has(nombre)) {
        const cli = clientePorNombre(nombre);
        porCliente.set(nombre, {
          nombre,
          ciudad: cli?.ciudad || '', direccion: cli?.direccion || '',
          celular: cli?.telefono || '', transporte: '',
          grupos: new Map(),
        });
      }
      const c = porCliente.get(nombre);
      const k = `${r.clasificacion}||${r.referencia}||${r.calidad}`;
      if (!c.grupos.has(k)) c.grupos.set(k, {
        clasificacion: r.clasificacion || '', categoria: r.categoria || '',
        referencia: r.referencia || '', calidad: r.calidad || '', cantidad: 0,
      });
      c.grupos.get(k).cantidad++;
    }
    return [...porCliente.values()]
      .map(c => ({ ...c, grupos: [...c.grupos.values()] }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  };

  const totalesBodega = () => {
    const inv = datos.inventario || [];
    const fisico = inv.reduce((s, r) => s + int(r.fisico), 0);
    const separadas = inv.reduce((s, r) => s + int(r.separadas), 0);
    const disponibles = inv.reduce((s, r) => s + int(r.disponibles), 0);
    const salen = (datos.despachos || [])
      .filter(d => d.estado === 'en_proceso')
      .reduce((s, d) => s + int(d.total_items ?? d.cantidad_items ?? 0), 0);
    return { vienen: fisico, salen, quedan: fisico - salen, separadas, disponibles };
  };

  // ── Generadores ─────────────────────────────────────────────────

  const conCarga = (clave, fn) => async () => {
    setGenerando(clave);
    try { await fn(); }
    catch (err) { addToast('No se pudo generar: ' + err.message, 'error'); }
    finally { setGenerando(null); }
  };

  const genBodega = async (wb) => {
    hojaDespachoBodega(wb, await armarDespachos(), { totales: totalesBodega() });
    hojaSeparadasBodega(wb, armarSeparadas());
    hojaInventarioBodega(wb, datos.inventario || []);
    hojaMatrizClientes(wb, datos.inventario || [], datos.comprometidas || []);
  };

  // Lo que se manda a TODOS los clientes por igual. La cartera y las
  // cotizaciones son de cada cliente y no pueden ir en un archivo común: se
  // descargan por cliente más abajo.
  const genClientes = async (wb) => {
    hojaListaPreciosClientes(wb, datos.lista || [], parseMonto(tasaLista));
  };

  // Paquete de UN cliente: solo lo suyo, listo para enviárselo.
  const genCliente = async (wb, cliente) => {
    const usados = new Set();
    try {
      const cots = await cotizacionesApi.getAll({ cliente_id: cliente.id });
      for (const c of (cots || []).slice(0, 20)) {
        try {
          const full = await cotizacionesApi.getOne(c.id);
          hojaCotizacionCliente(wb, full, nombreHoja(`COT ${full.numero || c.id}`, usados));
        } catch { /* omitir */ }
      }
    } catch { /* omitir */ }

    try {
      const data = await carteraApi.exportOne(cliente.id);
      hojaCarteraCliente(wb, data, nombreHoja('ESTADO DE CUENTA', usados));
    } catch { /* sin movimientos */ }

    hojaListaPreciosClientes(wb, datos.lista || [], parseMonto(tasaLista));
  };

  // Rango elegido para los internos. Cartera e inventario son una foto de HOY y
  // no dependen del rango; el rango filtra los contenedores que se incluyen.
  const rangoInternos = () => {
    if (periodo === 'todo') return null;
    if (periodo === 'mes') {
      const n = new Date();
      return { desde: new Date(n.getFullYear(), n.getMonth(), 1), hasta: n, etiqueta: 'este mes' };
    }
    if (!desde || !hasta) return null;
    return {
      desde: new Date(desde + 'T00:00:00'),
      hasta: new Date(hasta + 'T23:59:59'),
      etiqueta: `${desde} a ${hasta}`,
    };
  };

  const genInternos = async (wb) => {
    hojaCarteraInterna(wb, datos.cartera || []);
    hojaListaDisponiblesInterna(wb, datos.inventario || []);
    hojaInventarioInterno(wb, datos.inventario || []);

    const rango = rangoInternos();
    let finalizados = (datos.contenedores || []).filter(c => c.estado === 'finalizado');

    if (rango) {
      finalizados = finalizados.filter(c => {
        const f = new Date(c.fecha_llegada || c.updated_at || c.created_at);
        return !isNaN(f) && f >= rango.desde && f <= rango.hasta;
      });
    } else {
      // Sin rango se conserva el comportamiento anterior: el último finalizado.
      finalizados = finalizados.slice(0, 1);
    }

    if (finalizados.length === 0) {
      addToast(rango
        ? `Sin contenedores finalizados en ${rango.etiqueta}`
        : 'Sin contenedores finalizados', 'warning');
      return;
    }

    const usados = new Set(wb.worksheets.map(w => w.name));
    // Tope para no generar libros inmanejables; se avisa si se recorta.
    const incluidos = finalizados.slice(0, 12);
    for (const c of incluidos) {
      try {
        const full = await contenedoresApi.getOne(c.id);
        // Los aportes son opcionales: si el contenedor no tiene inversionistas
        // registrados la hoja lo dice, pero no deja de generarse.
        const aportes = await inversionistasApi
          .getAportes({ contenedor_id: c.id })
          .catch(() => []);
        hojaPreciosInternos(wb, full, nombreHoja(`PRECIOS ${full.numero || c.id}`, usados));
        hojaUtilidadContenedor(
          wb, full,
          nombreHoja(`UTILIDAD ${full.numero || c.id}`, usados),
          Array.isArray(aportes) ? aportes : []
        );
      } catch { /* omitir */ }
    }
    if (finalizados.length > incluidos.length) {
      addToast(`Se incluyeron los ${incluidos.length} contenedores más recientes de ${finalizados.length}`, 'warning');
    }
  };

  const grupos = [
    {
      id: 'bodega', titulo: 'Para la bodega', icon: Package2,
      color: 'text-emerald-600 bg-emerald-50',
      desc: 'Lo que tienen que alistar y lo que está apartado. Sin precios.',
      hojas: ['DESPACHO(BODEGA)', 'SEPARADAS(BODEGA)', 'INVENTARIO(BODEGA)', 'MATRIZ'],
      gen: genBodega, archivo: 'Entregables_Bodega',
    },
    {
      id: 'clientes', titulo: 'Para todos los clientes', icon: Users,
      color: 'text-secondary bg-secondary/10',
      desc: 'La lista de precios, que es la misma para todos y se puede difundir sin problema.',
      hojas: ['LISTADEPRECIOS(CLIENTES)'],
      gen: genClientes, archivo: 'Lista_de_Precios',
      nota: 'La cartera y las cotizaciones son de cada cliente: se descargan abajo, uno por uno.',
    },
    {
      id: 'internos', titulo: 'Internos', icon: Lock,
      color: 'text-warning bg-warning/10',
      desc: 'Costos, márgenes y utilidad del contenedor. No sale de la oficina.',
      hojas: ['CARTERA(INTERNA)', 'LISTADISPONIBLES(INTERNA)', 'INVENTARIO(INTERNO)', 'PRECIOSINTERNOS', 'UTILIDADCONT'],
      gen: genInternos, archivo: 'Entregables_Internos',
      soloAdmin: true,
    },
  ].filter(g => !g.soloAdmin || esAdmin);

  const descargarGrupo = (g) => conCarga(g.id, async () => {
    const wb = nuevoLibro();
    await g.gen(wb);
    await descargar(wb, g.archivo);
    addToast(`${g.titulo}: ${wb.worksheets.length} hoja(s) descargadas`, 'success');
  });

  const descargarCliente = conCarga('cliente', async () => {
    const cliente = (datos.clientes || []).find(c => String(c.id) === String(clienteSel));
    if (!cliente) return;
    const wb = nuevoLibro();
    await genCliente(wb, cliente);
    await descargar(wb, `Documentos_${cliente.nombre.replace(/\s+/g, '_')}`);
    addToast(`Documentos de ${cliente.nombre} descargados`, 'success');
  });

  const descargarTodo = conCarga('todo', async () => {
    const wb = nuevoLibro();
    for (const g of grupos) await g.gen(wb);
    await descargar(wb, 'Comercio_Global_Logistico');
    addToast(`Libro completo: ${wb.worksheets.length} hojas`, 'success');
  });

  return (
    <Layout title="Entregables" subtitle="Los Excel que se entregan a bodega, a clientes y los de uso interno">
      <div className="space-y-6">
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-primary">Descargar todo en un solo archivo</p>
              <p className="text-xs text-muted mt-0.5">
                Un libro con las {grupos.reduce((s, g) => s + g.hojas.length, 0)} hojas, igual que el Excel que ya usan.
                {!esAdmin && ' Las hojas internas (costos y márgenes) solo las descarga un administrador.'}
              </p>
            </div>
            <Button onClick={descargarTodo} disabled={cargando || generando}>
              {generando === 'todo'
                ? <><Loader2 size={16} className="mr-1 animate-spin" /> Generando…</>
                : <><FileSpreadsheet size={16} className="mr-1" /> Descargar todo</>}
            </Button>
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {grupos.map(g => (
            <Card key={g.id}>
              <CardBody className="flex flex-col h-full">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${g.color}`}>
                    <g.icon className="w-4 h-4" />
                  </div>
                  <h2 className="font-display font-bold text-primary">{g.titulo}</h2>
                </div>
                <p className="text-xs text-muted mb-3">{g.desc}</p>

                <ul className="space-y-1 mb-3">
                  {g.hojas.map(h => (
                    <li key={h} className="text-xs font-mono text-muted flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-border flex-shrink-0" />
                      {h}
                    </li>
                  ))}
                </ul>

                <div className="flex-1">
                  {g.nota && (
                    <p className="text-xs text-warning bg-warning/10 rounded-lg px-2.5 py-2 mb-3">
                      {g.nota}
                    </p>
                  )}
                </div>

                {/* Período: filtra qué contenedores entran en los internos */}
                {g.id === 'internos' && (
                  <div className="mb-3 space-y-2">
                    <label className="block text-xs font-semibold text-muted" htmlFor="periodo-int">
                      Período
                    </label>
                    <select
                      id="periodo-int"
                      value={periodo}
                      onChange={(e) => setPeriodo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    >
                      <option value="todo">Último contenedor (como está hoy)</option>
                      <option value="mes">Este mes</option>
                      <option value="rango">Rango de fechas…</option>
                    </select>

                    {periodo === 'rango' && (
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                          className="px-2 py-1.5 rounded-lg border border-border bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30" />
                        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
                          className="px-2 py-1.5 rounded-lg border border-border bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30" />
                      </div>
                    )}

                    <p className="text-[11px] text-muted">
                      Filtra los contenedores por fecha de llegada. Cartera e inventario son
                      una foto de hoy y no cambian con el período.
                    </p>
                  </div>
                )}

                {/* Tasa opcional: si se llena, la lista sale también en dólares */}
                {g.id === 'clientes' && (
                  <div className="mb-3">
                    <label className="block text-xs font-semibold text-muted mb-1" htmlFor="tasa-lista">
                      Tasa USD (opcional)
                    </label>
                    <input
                      id="tasa-lista"
                      type="text"
                      inputMode="decimal"
                      value={tasaLista}
                      onChange={(e) => setTasaLista(e.target.value)}
                      placeholder="Ej: 4.100"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    />
                    <p className="text-[11px] text-muted mt-1">
                      {parseMonto(tasaLista) > 0
                        ? <>Se agregan las columnas <b>Precio US$</b> y <b>Promo US$</b>.</>
                        : 'Déjalo vacío para la lista solo en pesos.'}
                    </p>
                  </div>
                )}

                <Button variant="outline" onClick={descargarGrupo(g)} disabled={cargando || generando}
                        className="w-full">
                  {generando === g.id
                    ? <><Loader2 size={15} className="mr-1 animate-spin" /> Generando…</>
                    : <><Download size={15} className="mr-1" /> Descargar</>}
                </Button>

                {/* La MATRIZ es la hoja de este grupo: aquí se baja como está y
                    desde aquí mismo se va a llenarla, que es lo que la dueña
                    pidió — no tener que buscar la pantalla en otro sitio. */}
                {g.id === 'bodega' && (
                  <>
                    <Link
                      to="/separacion-masiva"
                      className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-4 py-3 min-h-[44px] rounded-xl border border-border text-primary text-sm font-medium hover:bg-primary/5 transition-colors"
                    >
                      <LayoutGrid size={15} /> Llenar la matriz
                    </Link>
                    <p className="text-[11px] text-muted mt-1.5">
                      <b>Descargar</b> baja estas hojas —la MATRIZ incluida— tal como están hoy.
                      <b> Llenar la matriz</b> te lleva a la pantalla donde eliges referencia, calidad
                      y cantidad para cada cliente: al guardar quedan las pacas separadas y una
                      cotización por cliente.
                    </p>
                  </>
                )}
              </CardBody>
            </Card>
          ))}
        </div>

        {/* Documentos de UN cliente: nunca mezclados con los de otros */}
        <Card>
          <CardBody className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-primary">Documentos de un cliente</p>
              <p className="text-xs text-muted mt-0.5">
                Sus cotizaciones, su estado de cuenta y la lista de precios, en un archivo que solo
                contiene lo suyo. Es lo que se le puede enviar.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[15rem]">
                <label className="block text-xs font-semibold text-muted mb-1" htmlFor="ent-cliente">
                  Cliente
                </label>
                <select
                  id="ent-cliente"
                  value={clienteSel}
                  onChange={(e) => setClienteSel(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
                >
                  <option value="">Elige un cliente…</option>
                  {(datos?.clientes || []).map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <Button variant="outline" disabled={!clienteSel || generando} onClick={descargarCliente}>
                {generando === 'cliente'
                  ? <><Loader2 size={15} className="mr-1 animate-spin" /> Generando…</>
                  : <><Download size={15} className="mr-1" /> Descargar sus documentos</>}
              </Button>
            </div>

            <p className="text-xs text-muted">
              El estado de cuenta también se descarga desde <b>Cartera</b>, en la fila del cliente.
            </p>
          </CardBody>
        </Card>

        {cargando && (
          <p className="text-center text-sm text-muted py-4">Cargando datos…</p>
        )}

        <Card>
          <CardBody>
            <p className="text-xs font-bold text-muted uppercase tracking-widest mb-2">Qué lleva cada hoja</p>
            <ul className="text-sm text-muted space-y-1.5 max-w-3xl">
              <li><b className="text-primary">DESPACHO(BODEGA)</b> — despachos en proceso, agrupados por referencia y calidad, con destino, dirección, celular y transporte. Arriba los contadores de vienen / salen / quedan.</li>
              <li><b className="text-primary">SEPARADAS(BODEGA)</b> — lo apartado por cada cliente, con las mismas columnas.</li>
              <li><b className="text-primary">INVENTARIO(BODEGA)</b> — físico y disponible, sin costos ni precios.</li>
              <li><b className="text-primary">LISTADEPRECIOS(CLIENTES)</b> — referencia, calidad, precio y promoción. Es igual para todos, así que se puede difundir.</li>
              <li><b className="text-primary">Documentos de un cliente</b> — sus cotizaciones y su estado de cuenta, en un archivo que solo lleva lo suyo. Nunca se juntan varios clientes en el mismo libro.</li>
              <li><b className="text-primary">PRECIOSINTERNOS</b> — cómo se arma el precio: costo del contenedor + gastos unitarios + utilidad unitaria.</li>
              <li><b className="text-primary">UTILIDADCONT</b> — utilidad por paca × pacas del contenedor. Se toma del último contenedor finalizado.</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
