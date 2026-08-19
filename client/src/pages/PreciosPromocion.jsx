import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, useToast, useConfirm } from '../components/common';
import { preciosPromocionApi, preciosApi } from '../services/api';
import { useCatalog } from '../context/CatalogContext';
import { Plus, Trash2, Edit2, Percent, AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react';
import { hoy, formatFecha, entreFechas } from '../lib/fecha';
import { formatCOP } from '../lib/money';

const formatCurrency = formatCOP;

const formatDate = formatFecha;

// La vigencia se compara por día, no por instante: antes `new Date('2026-08-25')`
// se leía como medianoche UTC y la promoción se apagaba el 24 por la tarde.
const isActive = (row) => row.activo && entreFechas(hoy(), row.fecha_inicio, row.fecha_fin);

const emptyForm = { referencia: '', calidad: '', clasificacion: '', precio_promocional: '', fecha_inicio: '', fecha_fin: '', activo: true };

// Comparación tolerante: los nombres vienen de tablas distintas y difieren en
// mayúsculas y acentos según quién los haya dado de alta.
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export default function PreciosPromocion() {
  const [promos, setPromos] = useState([]);
  const [precios, setPrecios] = useState([]);
  const [loading, setLoading] = useState(true);
  const { categorias: referencias, calidades, temporadas, tipos: clasificaciones } = useCatalog();
  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm]             = useState(emptyForm);
  const [filtroCat, setFiltroCat]   = useState('');
  const [saving, setSaving]         = useState(false);

  const { addToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    Promise.allSettled([preciosPromocionApi.getAll(), preciosApi.getAll()])
      .then(([pr, px]) => {
        if (pr.status === 'fulfilled') setPromos(pr.value || []);
        else addToast('Error cargando promociones', 'error');
        // El precio normal es informativo: si falla, la pantalla sigue siendo usable.
        if (px.status === 'fulfilled') setPrecios(px.value || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const reload = async () => {
    const p = await preciosPromocionApi.getAll();
    setPromos(p);
  };

  // El precio normal vive en la tabla de Precios, indexado por CATEGORÍA + calidad,
  // mientras que la promoción va por REFERENCIA + calidad. El puente entre ambos es
  // la temporada de la referencia — la misma regla que aplica Cotizaciones al cotizar.
  const precioNormalDe = (referencia, calidad) => {
    if (!referencia || !calidad) return null;
    const ref = referencias.find(r => norm(r.nombre) === norm(referencia));
    const categoria = ref?.temporada_nombre;
    if (!categoria) return null;
    const fila = precios.find(
      p => norm(p.categoria) === norm(categoria) && norm(p.calidad) === norm(calidad)
    );
    const valor = parseFloat(fila?.precio);
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  };

  const comparar = (referencia, calidad, promo) => {
    const normal = precioNormalDe(referencia, calidad);
    const p = parseFloat(promo);
    if (normal == null || !Number.isFinite(p) || p <= 0) return { normal, diff: null, pct: null };
    const diff = p - normal;
    return { normal, diff, pct: (diff / normal) * 100 };
  };

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setFiltroCat('');
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditTarget(p);
    setFiltroCat('');
    setForm({
      referencia: p.referencia,
      calidad: p.calidad,
      clasificacion: p.clasificacion || '',
      precio_promocional: p.precio_promocional,
      fecha_inicio: p.fecha_inicio?.slice(0, 10) || '',
      fecha_fin: p.fecha_fin?.slice(0, 10) || '',
      activo: p.activo,
    });
    setModalOpen(true);
  };

  // El filtro por categoría no debe esconder referencias: se compara sin acentos ni
  // mayúsculas, y las que no tienen temporada asignada se siguen mostrando —antes
  // desaparecían y el campo quedaba sin opciones que elegir.
  const referenciasVisibles = referencias.filter(
    r => !filtroCat || !r.temporada_nombre || norm(r.temporada_nombre) === norm(filtroCat)
  );

  const previa = comparar(form.referencia, form.calidad, form.precio_promocional);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.referencia || !form.calidad || !form.precio_promocional || !form.fecha_inicio || !form.fecha_fin) {
      addToast('Todos los campos son requeridos', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await preciosPromocionApi.update(editTarget.id, form);
        addToast('Promoción actualizada', 'success');
      } else {
        await preciosPromocionApi.create(form);
        addToast('Promoción creada', 'success');
      }
      setModalOpen(false);
      await reload();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p) => {
    const ok = await confirm({ title: 'Eliminar promoción', message: `¿Eliminar la promoción "${p.referencia} / ${p.calidad}"?` });
    if (!ok) return;
    try {
      await preciosPromocionApi.delete(p.id);
      addToast('Promoción eliminada', 'success');
      await reload();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-display font-bold text-primary">Precios de Promoción</h1>
            <p className="text-sm text-muted mt-1">Precios especiales por referencia y calidad con vigencia por fechas. Se aplican automáticamente en cotizaciones.</p>
          </div>
          <Button variant="secondary" icon={Plus} onClick={openCreate}>Agregar Promoción</Button>
        </div>

        <Card>
          <CardBody className="p-0">
            {loading ? (
              <p className="text-center text-muted py-10">Cargando...</p>
            ) : promos.length === 0 ? (
              <div className="text-center py-14">
                <Percent size={40} className="mx-auto text-muted/40 mb-3" />
                <p className="text-muted">No hay promociones configuradas</p>
                <Button variant="ghost" size="sm" className="mt-3" onClick={openCreate}>Agregar la primera</Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-5 py-3 text-muted font-medium">Referencia</th>
                      <th className="text-left px-5 py-3 text-muted font-medium">Calidad</th>
                      <th className="text-left px-5 py-3 text-muted font-medium">Clasificación</th>
                      <th className="text-right px-5 py-3 text-muted font-medium">Precio normal</th>
                      <th className="text-right px-5 py-3 text-muted font-medium">Precio Promo</th>
                      <th className="text-right px-5 py-3 text-muted font-medium">Descuento</th>
                      <th className="text-center px-5 py-3 text-muted font-medium">Inicio</th>
                      <th className="text-center px-5 py-3 text-muted font-medium">Fin</th>
                      <th className="text-center px-5 py-3 text-muted font-medium">Estado</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {promos.map((p) => {
                      const activa = isActive(p);
                      const { normal, diff, pct } = comparar(p.referencia, p.calidad, p.precio_promocional);
                      return (
                        <tr key={p.id} className="border-b border-border/50 hover:bg-primary/3 transition-colors">
                          <td className="px-5 py-3 font-medium font-mono">{p.referencia}</td>
                          <td className="px-5 py-3 capitalize">{p.calidad}</td>
                          <td className="px-5 py-3 capitalize text-sm">{p.clasificacion || <span className="text-muted text-xs">Todas</span>}</td>
                          <td className="px-5 py-3 text-right font-mono text-muted">
                            {normal != null ? (
                              <span className="line-through">{formatCurrency(normal)}</span>
                            ) : (
                              <span className="text-xs" title="No hay precio preestablecido para la categoría y calidad de esta referencia">Sin precio base</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right font-mono font-semibold text-primary">{formatCurrency(p.precio_promocional)}</td>
                          <td className="px-5 py-3 text-right font-mono text-xs">
                            {diff == null ? (
                              <span className="text-muted">—</span>
                            ) : diff < 0 ? (
                              <span className="inline-flex items-center gap-1 text-green-600 font-semibold">
                                <ArrowDown size={12} />
                                {formatCurrency(Math.abs(diff))} ({Math.abs(pct).toFixed(1)}%)
                              </span>
                            ) : diff > 0 ? (
                              <span className="inline-flex items-center gap-1 text-amber-600 font-semibold" title="La promoción es MÁS CARA que el precio normal">
                                <ArrowUp size={12} />
                                +{formatCurrency(diff)} ({pct.toFixed(1)}%)
                              </span>
                            ) : (
                              <span className="text-muted">Igual</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-center text-muted">{formatDate(p.fecha_inicio)}</td>
                          <td className="px-5 py-3 text-center text-muted">{formatDate(p.fecha_fin)}</td>
                          <td className="px-5 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${activa ? 'bg-green-500' : 'bg-gray-400'}`} />
                              {activa ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-secondary/10 text-muted hover:text-secondary transition-colors">
                                <Edit2 size={15} />
                              </button>
                              <button onClick={() => handleDelete(p)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted hover:text-red-500 transition-colors">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-primary">
              {editTarget ? 'Editar Promoción' : 'Nueva Promoción'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Filtrar por Categoría</label>
                <select
                  value={filtroCat}
                  onChange={(e) => { setFiltroCat(e.target.value); setForm(f => ({ ...f, referencia: '' })); }}
                  className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30 text-sm"
                >
                  <option value="">Todas las categorías</option>
                  {temporadas.map((t) => (
                    <option key={t.id} value={t.nombre}>{t.nombre.charAt(0).toUpperCase() + t.nombre.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-1" htmlFor="promo-referencia">Referencia *</label>
                <select
                  id="promo-referencia"
                  value={form.referencia}
                  onChange={(e) => setForm({ ...form, referencia: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:opacity-60"
                  required
                  disabled={referencias.length === 0}
                >
                  <option value="">
                    {referencias.length === 0 ? 'No hay referencias cargadas' : 'Seleccionar...'}
                  </option>
                  {referenciasVisibles.map((r) => (
                    <option key={r.id} value={r.nombre}>{r.nombre}</option>
                  ))}
                </select>

                {referencias.length === 0 && (
                  <p className="mt-1.5 text-xs text-amber-600 flex items-start gap-1.5">
                    <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                    <span>No se cargaron las referencias. Créalas en <b>Productos</b> o recarga la página.</span>
                  </p>
                )}
                {referencias.length > 0 && referenciasVisibles.length === 0 && (
                  <p className="mt-1.5 text-xs text-amber-600 flex items-start gap-1.5">
                    <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                    <span>Ninguna referencia pertenece a esa categoría. Cambia el filtro a «Todas las categorías».</span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Calidad *</label>
                <select
                  value={form.calidad}
                  onChange={(e) => setForm({ ...form, calidad: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
                  required
                >
                  <option value="">Seleccionar...</option>
                  {calidades.map((q) => (
                    <option key={q.id} value={q.nombre}>{q.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-1" htmlFor="promo-clasificacion">
                  Clasificación
                </label>
                <select
                  id="promo-clasificacion"
                  value={form.clasificacion}
                  onChange={(e) => setForm({ ...form, clasificacion: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
                >
                  <option value="">Todas las clasificaciones</option>
                  {clasificaciones.map((t) => (
                    <option key={t.id} value={t.nombre}>{t.nombre}</option>
                  ))}
                </select>
                <p className="text-xs text-muted mt-1">
                  Déjalo en «Todas» para que aplique a hombre, mujer y niño por igual.
                  Si eliges una, la promoción solo aplica a esa y manda sobre la general.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-primary mb-1">Precio Promocional *</label>
                <input
                  type="number"
                  value={form.precio_promocional}
                  onChange={(e) => setForm({ ...form, precio_promocional: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  required
                />

                {/* Comparación en vivo: qué precio tiene hoy y en qué queda con la promoción */}
                {form.referencia && form.calidad && (
                  <div className="mt-2 rounded-xl border border-border bg-primary/3 px-3 py-2.5 text-sm">
                    {previa.normal == null ? (
                      <p className="text-xs text-muted flex items-start gap-1.5">
                        <AlertTriangle size={13} className="flex-shrink-0 mt-0.5 text-amber-600" />
                        <span>Esta referencia no tiene precio normal configurado en <b>Precios</b>, así que no se puede mostrar el descuento.</span>
                      </p>
                    ) : (
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="text-muted text-xs">
                          Precio normal hoy:{' '}
                          <b className="font-mono text-primary">{formatCurrency(previa.normal)}</b>
                        </span>
                        {previa.diff == null ? (
                          <span className="text-xs text-muted">Escribe el precio promocional</span>
                        ) : previa.diff < 0 ? (
                          <span className="inline-flex items-center gap-1 text-green-600 font-semibold text-xs">
                            <ArrowDown size={13} />
                            Baja {formatCurrency(Math.abs(previa.diff))} ({Math.abs(previa.pct).toFixed(1)}%)
                          </span>
                        ) : previa.diff > 0 ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 font-semibold text-xs">
                            <ArrowUp size={13} />
                            Sube {formatCurrency(previa.diff)} ({previa.pct.toFixed(1)}%) — ¿es correcto?
                          </span>
                        ) : (
                          <span className="text-xs text-muted">Igual al precio normal</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-primary mb-1">Fecha Inicio *</label>
                  <input
                    type="date"
                    value={form.fecha_inicio}
                    onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-primary mb-1">Fecha Fin *</label>
                  <input
                    type="date"
                    value={form.fecha_fin}
                    onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    required
                  />
                </div>
              </div>
              {editTarget && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="activo"
                    checked={form.activo}
                    onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="activo" className="text-sm text-primary">Promoción activa</label>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="secondary" disabled={saving}>
                  {saving ? 'Guardando...' : editTarget ? 'Actualizar' : 'Crear'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
