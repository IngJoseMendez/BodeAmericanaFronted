import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, useToast } from '../components/common';
import {
  despachosApi, pacasApi, clientesApi, carteraApi,
  listaPreciosApi, cotizacionesApi, contenedoresApi,
} from '../services/api';
import { Download, Package2, Users, Lock, FileSpreadsheet, Loader2 } from 'lucide-react';
import {
  nuevoLibro, descargar, int,
  hojaDespachoBodega, hojaSeparadasBodega, hojaInventarioBodega,
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
  const { addToast } = useToast();

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
  };

  const genClientes = async (wb) => {
    hojaListaPreciosClientes(wb, datos.lista || []);
    const usados = new Set(wb.worksheets.map(w => w.name));

    // Una hoja de cartera por cliente con saldo pendiente
    const conSaldo = (datos.cartera || []).filter(c => parseFloat(c.saldo_pendiente) > 0);
    for (const c of conSaldo.slice(0, 40)) {
      try {
        const data = await carteraApi.exportOne(c.id);
        hojaCarteraCliente(wb, data, nombreHoja(`CART ${c.nombre}`, usados));
      } catch { /* cliente sin datos exportables */ }
    }

    // Cotizaciones pendientes
    try {
      const cots = await cotizacionesApi.getAll({ estado: 'pendiente' });
      for (const c of (cots || []).slice(0, 20)) {
        try {
          const full = await cotizacionesApi.getOne(c.id);
          hojaCotizacionCliente(wb, full, nombreHoja(`COT ${full.numero || c.id}`, usados));
        } catch { /* omitir */ }
      }
    } catch { /* omitir */ }
  };

  const genInternos = async (wb) => {
    hojaCarteraInterna(wb, datos.cartera || []);
    hojaListaDisponiblesInterna(wb, datos.inventario || []);
    hojaInventarioInterno(wb, datos.inventario || []);

    // Último contenedor finalizado: precios internos y utilidad
    const finalizados = (datos.contenedores || []).filter(c => c.estado === 'finalizado');
    if (finalizados.length) {
      try {
        const full = await contenedoresApi.getOne(finalizados[0].id);
        hojaPreciosInternos(wb, full);
        hojaUtilidadContenedor(wb, full);
      } catch { /* omitir */ }
    }
  };

  const grupos = [
    {
      id: 'bodega', titulo: 'Para la bodega', icon: Package2,
      color: 'text-emerald-600 bg-emerald-50',
      desc: 'Lo que tienen que alistar y lo que está apartado. Sin precios.',
      hojas: ['DESPACHO(BODEGA)', 'SEPARADAS(BODEGA)', 'INVENTARIO(BODEGA)'],
      gen: genBodega, archivo: 'Entregables_Bodega',
    },
    {
      id: 'clientes', titulo: 'Para clientes', icon: Users,
      color: 'text-secondary bg-secondary/10',
      desc: 'Lista de precios, cotizaciones pendientes y el estado de cuenta de cada cliente con saldo.',
      hojas: ['LISTADEPRECIOS(CLIENTES)', 'COTIZACION(CLIENTES)', 'CARTERA(CLIENTES)'],
      gen: genClientes, archivo: 'Entregables_Clientes',
    },
    {
      id: 'internos', titulo: 'Internos', icon: Lock,
      color: 'text-warning bg-warning/10',
      desc: 'Costos, márgenes y utilidad del contenedor. No sale de la oficina.',
      hojas: ['CARTERA(INTERNA)', 'LISTADISPONIBLES(INTERNA)', 'INVENTARIO(INTERNO)', 'PRECIOSINTERNOS', 'UTILIDADCONT'],
      gen: genInternos, archivo: 'Entregables_Internos',
    },
  ];

  const descargarGrupo = (g) => conCarga(g.id, async () => {
    const wb = nuevoLibro();
    await g.gen(wb);
    await descargar(wb, g.archivo);
    addToast(`${g.titulo}: ${wb.worksheets.length} hoja(s) descargadas`, 'success');
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

                <ul className="space-y-1 mb-4 flex-1">
                  {g.hojas.map(h => (
                    <li key={h} className="text-xs font-mono text-muted flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-border flex-shrink-0" />
                      {h}
                    </li>
                  ))}
                </ul>

                <Button variant="outline" onClick={descargarGrupo(g)} disabled={cargando || generando}
                        className="w-full">
                  {generando === g.id
                    ? <><Loader2 size={15} className="mr-1 animate-spin" /> Generando…</>
                    : <><Download size={15} className="mr-1" /> Descargar</>}
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>

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
              <li><b className="text-primary">CARTERA(CLIENTES)</b> — una hoja por cliente con saldo: qué compró, a qué precio, cuánto abonó y su saldo.</li>
              <li><b className="text-primary">PRECIOSINTERNOS</b> — cómo se arma el precio: costo del contenedor + gastos unitarios + utilidad unitaria.</li>
              <li><b className="text-primary">UTILIDADCONT</b> — utilidad por paca × pacas del contenedor. Se toma del último contenedor finalizado.</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
