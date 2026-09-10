import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Select, Badge, Modal, useToast, useConfirm } from '../components/common';
import { clientesApi, matrizApi } from '../services/api';
import { CLIENTE_TIPOS, CLIENTE_ESTADOS } from '../types';
import { Plus, Search, Edit2, Trash2, Users, Phone, MapPin, CreditCard, Download, Truck } from 'lucide-react';
import ExcelJS from 'exceljs';
import { hoy, formatFechaCorta } from '../lib/fecha';
import { formatCOP, formatNumero } from '../lib/money';
import { descargarExcel } from '../lib/descargar';

// ── LO QUE LE QUEDÓ FALTANDO A CADA CLIENTE ──────────────────────────────────
//
// Esta pantalla es una rejilla de tarjetas y puede tener CIENTOS. La única forma
// honesta de enseñar aquí el faltante es UNA sola petición agregada al montar,
// que se indexa por cliente_id en un Map en memoria. Una petición por tarjeta
// sería un N+1 que pone de rodillas al servidor cada vez que alguien abre
// Clientes, y encima dejaría la rejilla parpadeando mientras llegan doscientas
// respuestas sueltas. Por eso el endpoint se diseñó agregado y por eso aquí no
// se pide nada dentro del map() de las tarjetas.
//
// Los dos textos que se pintan («Le faltaron 7 pacas» y el desglose del title)
// se precalculan AQUÍ, una sola vez, y no en el render de la tarjeta. Si se
// armaran al pintar, cada tecla del buscador volvería a recorrer y a formatear
// las fechas de todos los faltantes de todos los clientes: es exactamente la
// trampa silenciosa que la Matriz evita guardando sus textos ya hechos.
//
// Y la decisión de producto que manda sobre todas las demás: si la petición
// falla, esto devuelve null y la tarjeta NO pinta absolutamente nada. Nunca un
// cero. «Le faltaron 0» sobre una consulta que reventó le estaría diciendo a la
// dueña que no le debe mercancía a nadie, que es justo la mentira que este
// módulo entero existe para impedir. El silencio no miente; un cero sí.
function indexarFaltantes(respuesta) {
  // El endpoint devuelve un OBJETO { generado_en, total_clientes, total_unidades,
  // faltantes: [...] } y no un arreglo pelado, rompiendo a propósito la
  // convención del resto del repo: un [] no distingue «no le falta nada a nadie»
  // de «me quedé sin datos». Si lo que llega no tiene esa forma se trata como
  // fallo y no como lista vacía, que es la lectura conservadora y la correcta.
  const lista = respuesta && Array.isArray(respuesta.faltantes) ? respuesta.faltantes : null;
  if (!lista) return null;

  // Primero se agrupa en crudo por cliente; los textos se arman después, cuando
  // ya se sabe cuántas líneas y cuántas pacas tiene cada uno.
  const porCliente = new Map();
  for (const f of lista) {
    const id = Number(f?.cliente_id);
    const unidades = Number(f?.cantidad_abierta) || 0;
    // Una fila sin cliente o sin unidades abiertas no es un faltante vivo: ya se
    // completó o se anuló, y sumarla inflaría la cifra que ella usa para decidir
    // a quién llama primero.
    if (!Number.isFinite(id) || id <= 0 || unidades <= 0) continue;
    if (!porCliente.has(id)) porCliente.set(id, { unidades: 0, lineas: [] });
    const acc = porCliente.get(id);
    acc.unidades += unidades;
    acc.lineas.push({
      unidades,
      referencia: String(f?.referencia || '').trim() || 'Sin referencia',
      calidad: String(f?.calidad || '').trim(),
      desde: f?.created_at || null,
      repartos: Number(f?.veces_aplazado) || 1,
    });
  }

  const indice = new Map();
  for (const [id, acc] of porCliente) {
    // Se ordena por unidades descendente para que el desglose empiece por lo que
    // más pesa; el empate lo rompe la fecha más vieja, porque una paca de hace
    // tres meses hace más daño comercial que ocho de ayer.
    acc.lineas.sort((a, b) => (b.unidades - a.unidades) || (new Date(a.desde || 0) - new Date(b.desde || 0)));

    // El title se topa a seis líneas de detalle. Un tooltip de veinte renglones
    // no se lee: se cierra. Lo que no cabe se anuncia y se manda a la pantalla
    // que sí puede con ello, que es /faltantes.
    const TOPE = 6;
    const visibles = acc.lineas.slice(0, TOPE);
    const sobran = acc.lineas.length - visibles.length;
    const renglones = visibles.map(l => {
      const producto = l.calidad ? `${l.referencia} / ${l.calidad}` : l.referencia;
      const fecha = l.desde ? ` — desde el ${formatFechaCorta(l.desde)}` : '';
      // «N repartos de espera» sólo cuando de verdad ha esperado más de uno: en
      // el caso normal ese fragmento sería ruido repetido en cada renglón.
      const espera = l.repartos > 1 ? `, ${l.repartos} repartos de espera` : '';
      return `· ${formatNumero(l.unidades)} de ${producto}${fecha}${espera}`;
    });
    if (sobran > 0) renglones.push(`…y ${sobran} más. Míralo completo en Faltantes.`);

    indice.set(id, {
      unidades: acc.unidades,
      // Singular y plural de verdad: «Le faltó 1 paca» y no «Le faltaron 1
      // pacas». Es el tipo de detalle que hace que la frase se lea como algo
      // escrito por una persona y no por una plantilla.
      corto: acc.unidades === 1
        ? 'Le faltó 1 paca'
        : `Le faltaron ${formatNumero(acc.unidades)} pacas`,
      detalle: [
        'Le quedaron faltando, de repartos anteriores:',
        ...renglones,
        acc.unidades === 1
          ? 'Es 1 paca. Pulsa para verla en Faltantes.'
          : `Son ${formatNumero(acc.unidades)} pacas. Pulsa para verlas en Faltantes.`,
      ].join('\n'),
    });
  }
  return indice;
}

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [formData, setFormData] = useState({
    nombre: '', telefono: '', direccion: '', ciudad: '', tipo_cliente: 'mayorista', clasificacion_pago: 'contado', limite_credito: '', descuento: '0', estado: 'activo',
    crear_usuario: false, username: '', password: '', saldo_inicial: '',
    // Destino habitual de envío: la mercancía muchas veces no va al cliente
    // sino a una bodega o a una transportadora. Los cuatro son opcionales.
    destino_nombre: '', destino_direccion: '', destino_ciudad: '', destino_celular: ''
  });
  const [error, setError] = useState('');
  // Map<cliente_id, { unidades, corto, detalle }> — o null mientras no haya
  // llegado o si la consulta falló. El null es significativo y no un detalle de
  // implementación: es lo que apaga la línea entera en todas las tarjetas.
  const [faltantesPorCliente, setFaltantesPorCliente] = useState(null);
  const { addToast } = useToast();
  const confirm = useConfirm();

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    loadClientes();
  }, [filtroTipo, filtroEstado, debouncedSearch]);

  // Los faltantes se piden UNA vez al montar y NO se vuelven a pedir cuando
  // cambian los filtros ni el buscador. Dos motivos, los dos de peso: lo que le
  // quedó faltando a un cliente no depende de si la lista está filtrada por
  // «activo» ni de lo que se esté tecleando, y colgarlo del mismo efecto que
  // loadClientes lo convertiría en una petición por pulsación, que es el mismo
  // N+1 que se está evitando pero por la puerta de atrás.
  //
  // Si falla NO se avisa por toast y NO se pinta nada. Aquí el faltante es
  // información secundaria: la dueña entró a Clientes a buscar un teléfono o a
  // corregir una dirección, y un error rojo por un dato de adorno la asusta sin
  // darle nada que hacer. La pantalla que sí tiene que gritar cuando esto falla
  // es /faltantes, que es donde se va a consultar a propósito.
  useEffect(() => {
    let vivo = true;
    matrizApi.getFaltantes({ estado: 'abierto' })
      .then(res => { if (vivo) setFaltantesPorCliente(indexarFaltantes(res)); })
      .catch(() => { if (vivo) setFaltantesPorCliente(null); });
    // El desmontaje corta el setState tardío: esta pantalla se abandona rápido
    // (se entra, se busca un cliente y se sale) y una respuesta que llega con la
    // pantalla ya cerrada dejaría un aviso de React en la consola.
    return () => { vivo = false; };
  }, []);

  const loadClientes = async () => {
    try {
      const params = {};
      if (filtroTipo) params.tipo_cliente = filtroTipo;
      if (filtroEstado) params.estado = filtroEstado;
      if (debouncedSearch) params.buscar = debouncedSearch;
      const data = await clientesApi.getAll(params);
      setClientes(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        nombre: formData.nombre,
        telefono: formData.telefono,
        direccion: formData.direccion,
        ciudad: formData.ciudad,
        tipo_cliente: formData.tipo_cliente,
        clasificacion_pago: formData.clasificacion_pago,
        limite_credito: parseFloat(formData.limite_credito) || 0,
        descuento: parseFloat(formData.descuento) || 0,
        estado: formData.estado,
        saldo_inicial: parseFloat(formData.saldo_inicial) || 0,
        // Destino de entrega: se manda null cuando queda vacío (y no ''), para
        // que quien lo lea distinga "no tiene destino" de "tiene uno en blanco"
        // y pueda caer en los datos del propio cliente.
        destino_nombre:    formData.destino_nombre?.trim()    || null,
        destino_direccion: formData.destino_direccion?.trim() || null,
        destino_ciudad:    formData.destino_ciudad?.trim()    || null,
        destino_celular:   formData.destino_celular?.trim()   || null,
      };
      
      if (!editando && formData.crear_usuario) {
        payload.crear_usuario = true;
        payload.username = formData.username;
        payload.password = formData.password;
      }
      
      if (editando) {
        await clientesApi.update(editando.id, payload);
        addToast(`Cliente "${formData.nombre}" actualizado`, 'success');
      } else {
        const result = await clientesApi.create(payload);
        if (result.usuario_creado) {
          addToast(`Cliente creado con usuario: ${formData.username}`, 'success');
        } else {
          addToast(`Cliente "${formData.nombre}" creado`, 'success');
        }
      }
      
      setModalOpen(false);
      resetForm();
      loadClientes();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleEdit = (cliente) => {
    setEditando(cliente);
    setFormData({
      nombre: cliente.nombre,
      telefono: cliente.telefono || '',
      direccion: cliente.direccion || '',
      ciudad: cliente.ciudad || '',
      tipo_cliente: cliente.tipo_cliente,
      clasificacion_pago: cliente.clasificacion_pago || 'contado',
      limite_credito: cliente.limite_credito || '',
      descuento: cliente.descuento != null ? String(cliente.descuento) : '0',
      estado: cliente.estado,
      saldo_inicial: cliente.saldo_inicial || '',
      crear_usuario: false,
      username: '',
      password: '',
      destino_nombre: cliente.destino_nombre || '',
      destino_direccion: cliente.destino_direccion || '',
      destino_ciudad: cliente.destino_ciudad || '',
      destino_celular: cliente.destino_celular || ''
    });
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: '¿Eliminar cliente?',
      message: 'Se eliminará el cliente y todos sus datos asociados. Esta acción no se puede deshacer.',
      confirmText: 'Sí, eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await clientesApi.delete(id);
      addToast('Cliente eliminado', 'success');
      loadClientes();
    } catch (err) {
      addToast('Error al eliminar: ' + err.message, 'error');
    }
  };

  const resetForm = () => {
    setEditando(null);
    setFormData({
      nombre: '', telefono: '', direccion: '', ciudad: '', tipo_cliente: 'mayorista', clasificacion_pago: 'contado',
      limite_credito: '', descuento: '0', estado: 'activo', crear_usuario: false, username: '', password: '', saldo_inicial: '',
      destino_nombre: '', destino_direccion: '', destino_ciudad: '', destino_celular: ''
    });
  };

  const formatCurrency = formatCOP;

  const exportarExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Clientes');
    ws.columns = [
      { header: 'Nombre',          key: 'nombre',    width: 28 },
      { header: 'Teléfono',        key: 'telefono',  width: 16 },
      { header: 'Ciudad',          key: 'ciudad',    width: 18 },
      { header: 'Tipo',            key: 'tipo',      width: 14 },
      { header: 'Estado',          key: 'estado',    width: 12 },
      { header: 'Límite Crédito',  key: 'limite',    width: 18 },
      { header: 'Descuento ($/u)', key: 'descuento', width: 14 },
      { header: 'Fecha Registro',  key: 'fecha',     width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    clientes.forEach(c => {
      ws.addRow({
        nombre:    c.nombre,
        telefono:  c.telefono || '—',
        ciudad:    c.ciudad || '—',
        tipo:      c.tipo_cliente,
        estado:    c.estado,
        limite:    parseFloat(c.limite_credito) || 0,
        descuento: parseFloat(c.descuento) || 0,
        fecha:     c.created_at ? new Date(c.created_at).toLocaleDateString('es-CO') : '—',
      });
    });
    ws.getColumn('limite').numFmt = '#,##0.00';
    const buffer = await wb.xlsx.writeBuffer();
    descargarExcel(buffer, `clientes-${hoy()}.xlsx`);
  };

  return (
    <Layout title="Clientes" subtitle={`${clientes.length} clientes registrados`}>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" aria-hidden="true" />
            {/* El placeholder desaparece al escribir: sin aria-label el lector de
                pantalla anunciaba solo "campo de texto". */}
            <input
              id="clientes-buscar"
              type="text"
              aria-label="Buscar clientes por nombre, teléfono o ciudad"
              placeholder="Buscar clientes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadClientes()}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              aria-label="Filtrar clientes por estado"
              className="px-4 py-3 rounded-xl border border-border bg-surface"
            >
              <option value="">Todos los estados</option>
              {CLIENTE_ESTADOS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <button type="button" onClick={exportarExcel}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border text-sm font-medium text-muted hover:text-primary hover:bg-primary/5 transition-colors">
              <Download size={15} aria-hidden="true" /> Excel
            </button>
            <Button onClick={() => { resetForm(); setModalOpen(true); }} variant="secondary">
              <Plus size={16} /> Nuevo Cliente
            </Button>
          </div>
        </div>

        {error && (
          <div role="alert" className="p-4 bg-accent/10 text-accent rounded-xl text-sm border border-accent/20">{error}</div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardBody className="space-y-3">
                  <div className="h-5 w-3/4 bg-primary/8 rounded" />
                  <div className="h-4 w-1/2 bg-primary/8 rounded" />
                </CardBody>
              </Card>
            ))}
          </div>
        ) : clientes.length === 0 ? (
          <Card>
            <CardBody className="flex flex-col items-center gap-4 py-12">
              <Users className="w-12 h-12 text-muted/30" aria-hidden="true" />
              {/* Antes decía siempre "No hay clientes": buscando algo que no
                  existe parecía que se habían borrado todos los clientes. */}
              {debouncedSearch || filtroEstado ? (
                <>
                  <p className="text-muted text-center">
                    Ningún cliente coincide{debouncedSearch ? ` con "${debouncedSearch}"` : ''}
                    {filtroEstado ? ` en estado "${filtroEstado}"` : ''}
                  </p>
                  <Button onClick={() => { setSearch(''); setFiltroEstado(''); }} variant="ghost">
                    Quitar filtros
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted text-center">No hay clientes</p>
                  <Button onClick={() => { resetForm(); setModalOpen(true); }} variant="ghost">
                    Agregar cliente
                  </Button>
                </>
              )}
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* El retardo de entrada se topa a las 12 primeras tarjetas: con
                `index * 50ms` sin techo, en una lista de 200 clientes las últimas
                tardaban 10 segundos en aparecer. Y `animationFillMode: 'both'`
                evita el parpadeo: sin él la tarjeta se pintaba visible durante la
                espera y al arrancar saltaba de golpe al fotograma inicial. */}
            {clientes.map((cliente, index) => (
              <Card
                key={cliente.id}
                hover
                className="animate-fade-in-up"
                style={{ animationDelay: `${Math.min(index, 12) * 40}ms`, animationFillMode: 'both' }}
              >
                <CardBody>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-display text-lg text-primary">{cliente.nombre}</h3>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cliente.clasificacion_pago === 'credito' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {cliente.clasificacion_pago === 'credito' ? 'Crédito' : 'Contado'}
                          </span>
                          {parseFloat(cliente.descuento) > 0 && (
                            <span className="text-xs bg-secondary/15 text-secondary px-2 py-0.5 rounded-full font-semibold">
                              -{formatCurrency(cliente.descuento)}/u
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge variant={cliente.estado} size="sm">{cliente.estado}</Badge>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    {cliente.telefono && (
                      <div className="flex items-center gap-2 text-muted">
                        <Phone className="w-4 h-4" />
                        <span>{cliente.telefono}</span>
                      </div>
                    )}
                    {cliente.ciudad && (
                      <div className="flex items-center gap-2 text-muted">
                        <MapPin className="w-4 h-4" />
                        <span>{cliente.ciudad}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted">
                      <CreditCard className="w-4 h-4" />
                      <span>Límite: {formatCurrency(cliente.limite_credito)}</span>
                    </div>

                    {/* EL FALTANTE — UNA LÍNEA, Y SÓLO SI LA HAY.
                        Punto ámbar de 6px + texto ámbar semibold. El punto es lo
                        que hace que se note al barrer doscientas tarjetas sin
                        leer ninguna; el texto es lo que lo explica cuando ya se
                        paró en una. Va aquí abajo, después del límite de crédito,
                        porque teléfono, ciudad y límite son datos fijos del
                        cliente y esto es un hecho de operación: mezclarlo entre
                        ellos lo convertiría en una ficha más.

                        Es un enlace y no un adorno: el gesto natural al leer «le
                        faltaron 7» es querer saber QUÉ le faltó, y esa respuesta
                        vive en /faltantes filtrado por este cliente.

                        Sin faltante no se pinta NADA — ni un cero, ni un guion,
                        ni un hueco reservado. Las tarjetas de los clientes a los
                        que no se les debe nada tienen que quedar exactamente
                        como estaban, o la línea deja de significar algo por
                        aparecer en todas. */}
                    {(() => {
                      // Number() y no cliente.id a pelo: el índice se construye
                      // con claves numéricas, y el día que este listado llegue
                      // con los id en texto (pasa en cuanto alguien cambia el
                      // driver o mete un JSON.parse por el medio) el Map fallaría
                      // en TODAS las tarjetas a la vez y en silencio, que es la
                      // peor forma de perder este dato: nadie ve un error, sólo
                      // deja de haber faltantes.
                      const faltante = faltantesPorCliente?.get(Number(cliente.id));
                      if (!faltante) return null;
                      return (
                        <div>
                          <Link
                            to={`/faltantes?cliente_id=${cliente.id}`}
                            title={faltante.detalle}
                            className="inline-flex items-center gap-1.5 align-middle font-semibold text-warning hover:underline underline-offset-2"
                          >
                            {/* align-middle en el inline-flex: sin él la caja del
                                punto empuja la altura de la línea y la tarjeta
                                crece unos píxeles sólo para los clientes con
                                faltante, que descuadra la rejilla. */}
                            <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" aria-hidden="true" />
                            {faltante.corto}
                          </Link>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Botones de solo icono: sin aria-label el lector de pantalla
                      decía "botón" en los dos y no se distinguía editar de borrar. */}
                  <div className="flex justify-end gap-1 mt-4 pt-3 border-t border-border/50">
                    <button type="button" onClick={() => handleEdit(cliente)} className="p-2 rounded-lg text-muted hover:text-primary hover:bg-primary/5 transition-all" title="Editar cliente" aria-label={`Editar a ${cliente.nombre}`}>
                      <Edit2 size={16} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => handleDelete(cliente.id)} className="p-2 rounded-lg text-muted hover:text-accent hover:bg-accent/5 transition-all" title="Eliminar cliente" aria-label={`Eliminar a ${cliente.nombre}`}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Cliente' : 'Nuevo Cliente'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div role="alert" className="p-4 bg-accent/10 text-accent rounded-xl text-sm border border-accent/20">{error}</div>}
          
          <Input
            label="Nombre"
            value={formData.nombre}
            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            placeholder="Nombre completo"
            required
          />
          
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Teléfono"
              value={formData.telefono}
              onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
              placeholder="5512345678"
            />
            <Input
              label="Ciudad"
              value={formData.ciudad}
              onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
              placeholder="Ciudad"
            />
          </div>
          
          <Input
            label="Dirección"
            value={formData.direccion}
            onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
            placeholder="Dirección completa"
          />

          {/* Datos de entrega — bloque aparte a propósito: NO son datos del
              cliente sino de a dónde va la mercancía, que muchas veces no es el
              cliente mismo. Va enmarcado y con su propio título para que nadie
              confunda el celular de la transportadora con el del cliente. */}
          <div className="rounded-xl border border-border bg-primary/[0.02] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-secondary" aria-hidden="true" />
              <p className="text-xs font-bold text-muted uppercase tracking-widest">Datos de entrega</p>
              <span className="text-[10px] font-semibold text-muted/70 border border-border rounded-full px-2 py-0.5">Opcional</span>
            </div>
            <p className="text-xs text-muted">
              A dónde se manda la mercancía de este cliente habitualmente. No siempre va al
              cliente: muchas veces va a una bodega o a una transportadora.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Nombre de quien recibe"
                value={formData.destino_nombre}
                onChange={(e) => setFormData({ ...formData, destino_nombre: e.target.value })}
                placeholder="Bodega, transportadora o persona"
              />
              <Input
                label="Ciudad de entrega"
                value={formData.destino_ciudad}
                onChange={(e) => setFormData({ ...formData, destino_ciudad: e.target.value })}
                placeholder="Ciudad del destino"
              />
              <div className="md:col-span-2">
                <Input
                  label="Dirección de entrega"
                  value={formData.destino_direccion}
                  onChange={(e) => setFormData({ ...formData, destino_direccion: e.target.value })}
                  placeholder="Dirección completa del destino"
                />
              </div>
              <Input
                label="Celular de entrega"
                value={formData.destino_celular}
                onChange={(e) => setFormData({ ...formData, destino_celular: e.target.value })}
                placeholder="Celular de quien recibe"
              />
            </div>

            <p className="text-xs text-muted flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-muted/70" aria-hidden="true" />
              <span>
                Si dejas esto vacío se usarán los datos del propio cliente (nombre, dirección,
                ciudad y teléfono de arriba).
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Forma de pago"
              value={formData.clasificacion_pago}
              onChange={(e) => setFormData({ ...formData, clasificacion_pago: e.target.value })}
              options={[
                { value: 'contado', label: 'Contado (paga todo)' },
                { value: 'credito', label: 'Crédito (se le fía)' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Límite de Crédito"
              type="number"
              value={formData.limite_credito}
              onChange={(e) => setFormData({ ...formData, limite_credito: e.target.value })}
              placeholder="$0.00"
            />
            <div className="space-y-1">
              <Input
                label="Descuento por unidad ($)"
                type="number"
                min="0"
                step="500"
                value={formData.descuento}
                onChange={(e) => setFormData({ ...formData, descuento: e.target.value })}
                placeholder="0"
              />
              <p className="text-xs text-muted">En pesos por unidad; se aplica en cotizaciones (no a pacas en promoción)</p>
            </div>
          </div>
          
          {!editando && (
            <div className="p-4 bg-secondary/10 rounded-xl border border-secondary/20 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.crear_usuario}
                  onChange={(e) => setFormData({ ...formData, crear_usuario: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-secondary focus:ring-secondary"
                />
                <span className="text-sm font-medium text-primary">Crear usuario para login</span>
              </label>
              
              {formData.crear_usuario && (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Usuario"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Username"
                  />
                  <Input
                    label="Contraseña"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Cliente@2024"
                  />
                </div>
              )}
            </div>
          )}
          
          {/* Saldo inicial - mostrar siempre (crear y editar) */}
          <div className="space-y-2">
            <Input
              label="Saldo Deuda Inicial"
              type="number"
              value={formData.saldo_inicial}
              onChange={(e) => setFormData({ ...formData, saldo_inicial: e.target.value })}
              placeholder="0.00"
            />
            <p className="text-xs text-muted">
              Deuda que el cliente tenía antes de usar el sistema. Se suma al saldo pendiente en cartera.
            </p>
          </div>

          {/* Estado solo al editar */}
          {editando && (
            <Select
              label="Estado"
              value={formData.estado}
              onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
              options={CLIENTE_ESTADOS.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
            />
          )}
          
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="secondary">{editando ? 'Actualizar' : 'Crear Cliente'}</Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}