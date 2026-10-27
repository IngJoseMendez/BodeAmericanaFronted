// ── EL FLUJO DE VENTA, SIN TENER QUE IR A BUSCARLO ────────────────
//
// Una venta son tres pasos: se cotiza, se despacha, sale de la bodega. El
// sistema los tenía en tres pantallas y obligaba a recorrerlas a mano: crear la
// cotización, ir a Cotizaciones, pulsarla, convertirla, ir a Despachos,
// buscarla, confirmar la salida. Siete gestos para una cosa que es una sola, y
// se pagan varias veces al día.
//
// POR QUÉ NO ES UN ASISTENTE QUE TE LLEVE DE PANTALLA EN PANTALLA
//
// Era la idea más obvia y tiene dos problemas que se ven al tercer uso:
//
//   1. EL FLUJO NO SIEMPRE ES SEGUIDO. Una cotización se queda días esperando
//      el sí del cliente. Un asistente que asume «cotizas y despachas ahora»
//      pelea con la realidad la mayoría de las veces, y entonces la gente
//      aprende a cerrarlo sin leerlo.
//   2. TE PIERDE EL SITIO. Si al crear una cotización la pantalla salta a
//      Despachos, se pierde la lista que se venía trabajando. En la Matriz, con
//      quince clientes seguidos, eso es peor que el problema que resuelve.
//
// Así que no se mueve a nadie: SE TRAE EL PASO SIGUIENTE A DONDE ESTÁ. Al
// terminar una acción, en lugar de cerrar y dejar a la usuaria mirando una
// lista, el mismo sitio enseña qué se acaba de hacer y cuál es el paso que
// sigue, con un botón. Tres pulsaciones sin moverse, y «Después» siempre a la
// vista. Es el patrón de toda la industria para esto -el objeto recién creado
// aparece con su siguiente acción encima- y no cuesta la navegación.
//
// LO MISMO SIRVE PARA UNA Y PARA QUINCE. `cotizaciones` es siempre un arreglo:
// con una, es la venta de mostrador; con quince, es el reparto de la Matriz.
// El lote usa los endpoints de lote que ya existen, en una transacción.
//
// LO QUE FALLA SE DICE Y NO SE ESCONDE. En un lote, que a un cliente le falte
// una paca no puede tumbar a los otros catorce: se avanza con los que pudieron
// y se nombra a los que no, con su motivo. Media tanda avanzada y silenciosa es
// peor que ninguna.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Loader2, AlertTriangle, Truck, FileText, PackageCheck } from 'lucide-react';
import { cotizacionesApi, despachosApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatCOP } from '../../lib/money';
import { hoy } from '../../lib/fecha';

const PASOS = [
  { id: 'cotizacion', titulo: 'Cotización', icono: FileText },
  { id: 'despacho',   titulo: 'Despacho',   icono: Truck },
  { id: 'salida',     titulo: 'Salió',      icono: PackageCheck },
];

/** El recorrido, con el paso de ahora marcado. */
function Pasos({ actual }) {
  const iActual = PASOS.findIndex((p) => p.id === actual);
  return (
    <ol className="flex items-center gap-1" aria-label="Pasos de la venta">
      {PASOS.map((p, i) => {
        const hecho = i < iActual;
        const aqui = i === iActual;
        const Icono = hecho ? Check : p.icono;
        return (
          <li key={p.id} className="flex items-center gap-1">
            <div
              aria-current={aqui ? 'step' : undefined}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold ${
                hecho ? 'bg-success/15 text-success'
                  : aqui ? 'bg-secondary text-white'
                    : 'bg-primary/5 text-muted'
              }`}
            >
              <Icono size={13} aria-hidden="true" />
              {p.titulo}
            </div>
            {i < PASOS.length - 1 && (
              <ChevronRight size={14} className="text-muted/50 flex-shrink-0" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

const sumar = (lista, campo) => lista.reduce((s, x) => s + (Number(x[campo]) || 0), 0);

/**
 * @param cotizaciones [{ id, numero, cliente, unidades, total }]
 * @param onCerrar     cerrar el panel
 * @param onCambio     avisar al padre de que recargue su lista
 */
export function FlujoVenta({ cotizaciones = [], onCerrar, onCambio }) {
  const { usuario } = useAuth();
  const [paso, setPaso] = useState('cotizacion');
  const [despachos, setDespachos] = useState([]);
  const [salida, setSalida] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  // Lo que no se pudo: [{ quien, motivo }]. Se enseña siempre, incluso cuando
  // el resto avanzó.
  const [fallidas, setFallidas] = useState([]);

  const varias = cotizaciones.length > 1;
  const unidades = sumar(cotizaciones, 'unidades');
  const total = sumar(cotizaciones, 'total');

  // ── Paso 1 → 2: aprobar y crear el despacho ───────────────────
  //
  // Una por una y no en lote, a propósito: `/cotizaciones/:id/convertir` ya
  // existe y es atómico por cotización. Un endpoint de lote nuevo tendría que
  // decidir si quince despachos son todo-o-nada, y no lo son: que a un cliente
  // le falte una paca no es razón para no despachar a los otros catorce.
  const crearDespachos = async () => {
    setTrabajando(true);
    setFallidas([]);
    const hechos = [];
    const malos = [];
    for (const c of cotizaciones) {
      try {
        const r = await cotizacionesApi.convertirAVenta(c.id, usuario?.id);
        hechos.push({
          id: r.despacho_id,
          numero: r.despacho_numero,
          cliente: c.cliente,
          unidades: r.pacas_vendidas ?? c.unidades,
        });
      } catch (err) {
        malos.push({ quien: c.cliente || c.numero, motivo: err.message || 'no se pudo' });
      }
    }
    setDespachos(hechos);
    setFallidas(malos);
    setTrabajando(false);
    onCambio?.();
    // Si no salió ninguno, no se avanza: no hay nada que despachar.
    if (hechos.length) setPaso('despacho');
  };

  // ── Paso 2 → 3: confirmar la salida ───────────────────────────
  const confirmarSalida = async () => {
    setTrabajando(true);
    setFallidas([]);
    try {
      if (despachos.length === 1) {
        // Sin `paca_ids`: sale todo lo que esté pendiente de ese despacho.
        const r = await despachosApi.confirmar(despachos[0].id, { fecha_salida: hoy() });
        setSalida({ unidades: r.pacas_despachadas, cuantos: 1 });
      } else {
        const r = await despachosApi.confirmarLote(despachos.map((d) => ({ id: d.id })), hoy());
        setSalida({ unidades: r.unidades, cuantos: r.despachos?.length || despachos.length });
      }
      setPaso('salida');
      onCambio?.();
    } catch (err) {
      setFallidas([{ quien: 'la salida', motivo: err.message || 'no se pudo confirmar' }]);
    } finally {
      setTrabajando(false);
    }
  };

  const Boton = ({ children, onClick, primario = false, ...rest }) => (
    <button type="button" onClick={onClick} disabled={trabajando} {...rest}
      className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
        primario ? 'bg-secondary text-white hover:bg-secondary/85'
          : 'border border-border text-muted hover:text-primary hover:bg-primary/5'
      }`}>
      {children}
    </button>
  );

  return (
    <div className="space-y-4">
      <Pasos actual={paso} />

      {/* ── Lo que se acaba de hacer ─────────────────────────── */}
      {paso === 'cotizacion' && (
        <div className="rounded-xl border border-success/30 bg-success/5 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-success">
            <Check size={16} aria-hidden="true" />
            {varias ? `${cotizaciones.length} cotizaciones creadas` : `Cotización ${cotizaciones[0]?.numero || ''} creada`}
          </p>
          <p className="mt-1 text-xs text-muted">
            {varias
              ? `${unidades} unidad(es) apartadas · ${formatCOP(total)}`
              : `${cotizaciones[0]?.cliente || ''} · ${unidades} unidad(es) · ${formatCOP(total)}`}
          </p>
          <p className="mt-2 text-xs text-muted leading-snug">
            La mercancía queda <strong className="text-primary">apartada</strong> para
            {varias ? ' estos clientes' : ' este cliente'}. El siguiente paso la vende y
            crea el despacho; si todavía no está confirmada, déjalo para después y la
            cotización te espera donde está.
          </p>
        </div>
      )}

      {paso === 'despacho' && (
        <div className="rounded-xl border border-success/30 bg-success/5 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-success">
            <Check size={16} aria-hidden="true" />
            {despachos.length > 1
              ? `${despachos.length} despachos creados`
              : `Despacho ${despachos[0]?.numero || ''} creado`}
          </p>
          <p className="mt-1 text-xs text-muted">
            {sumar(despachos, 'unidades')} unidad(es) vendidas · la deuda ya está en la cartera
          </p>
          <p className="mt-2 text-xs text-muted leading-snug">
            Falta que la mercancía <strong className="text-primary">salga de la bodega</strong>.
            Si todavía no ha salido, déjalo para después: el despacho queda pendiente y la
            salida se confirma cuando de verdad salga.
          </p>
        </div>
      )}

      {paso === 'salida' && (
        <div className="rounded-xl border border-success/30 bg-success/5 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-success">
            <PackageCheck size={16} aria-hidden="true" />
            Salió de bodega · {salida?.unidades} unidad(es)
          </p>
          <p className="mt-1 text-xs text-muted">
            en {salida?.cuantos} despacho(s), con fecha de hoy
          </p>
          {/* El Excel de bodega se baja del despacho, que es donde vive. No se
              genera aquí para no tener dos sitios armando el mismo papel. */}
          <p className="mt-2 text-xs text-muted leading-snug">
            El Excel para la bodega lo descargas abriendo el despacho.
          </p>
        </div>
      )}

      {/* ── Lo que no se pudo ────────────────────────────────── */}
      {fallidas.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/[0.07] p-3">
          <p className="flex items-center gap-2 text-xs font-bold text-warning">
            <AlertTriangle size={14} aria-hidden="true" />
            {fallidas.length === 1 ? 'Esto no se pudo:' : `${fallidas.length} no se pudieron:`}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-warning">
            {fallidas.map((f, i) => <li key={i}>· {f.quien}: {f.motivo}</li>)}
          </ul>
          {despachos.length > 0 && (
            <p className="mt-1.5 text-[11px] text-muted">
              Los demás sí avanzaron. Lo que falló se queda como cotización y se puede
              reintentar desde Cotizaciones.
            </p>
          )}
        </div>
      )}

      {/* ── Qué sigue ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {paso === 'cotizacion' && (
          <>
            <Boton onClick={onCerrar}>Después</Boton>
            <Boton primario onClick={crearDespachos}
              title="Vende la mercancía apartada y crea el despacho">
              {trabajando ? <Loader2 size={15} className="animate-spin" /> : <Truck size={15} />}
              {trabajando ? 'Creando…' : (varias ? `Vender y despachar las ${cotizaciones.length}` : 'Vender y crear despacho')}
            </Boton>
          </>
        )}

        {paso === 'despacho' && (
          <>
            <Boton onClick={onCerrar}>Después</Boton>
            {despachos.length === 1 && (
              <Link to={`/despachos?focus=${despachos[0].id}`}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-primary hover:bg-primary/5">
                Ver el despacho
              </Link>
            )}
            <Boton primario onClick={confirmarSalida}
              title="Registra que la mercancía salió físicamente de la bodega">
              {trabajando ? <Loader2 size={15} className="animate-spin" /> : <PackageCheck size={15} />}
              {trabajando ? 'Confirmando…' : 'Confirmar salida'}
            </Boton>
          </>
        )}

        {paso === 'salida' && (
          <>
            {despachos.length === 1 ? (
              <Link to={`/despachos?focus=${despachos[0].id}`}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-primary hover:bg-primary/5">
                Abrir el despacho
              </Link>
            ) : (
              <Link to="/despachos"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-primary hover:bg-primary/5">
                Ver los despachos
              </Link>
            )}
            <Boton primario onClick={onCerrar}>Listo</Boton>
          </>
        )}
      </div>
    </div>
  );
}
