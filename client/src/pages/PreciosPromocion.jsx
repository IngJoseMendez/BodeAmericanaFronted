import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, useToast, useConfirm } from '../components/common';
import { preciosPromocionApi } from '../services/api';
import { useCatalog } from '../context/CatalogContext';
import { Plus, Trash2, Edit2, Percent } from 'lucide-react';

const formatCurrency = (v) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

const isActive = (row) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const inicio = new Date(row.fecha_inicio);
  const fin    = new Date(row.fecha_fin);
  return row.activo && inicio <= now && fin >= now;
};

const emptyForm = { referencia: '', calidad: '', precio_promocional: '', fecha_inicio: '', fecha_fin: '', activo: true };

export default function PreciosPromocion() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const { categorias: referencias, calidades, temporadas } = useCatalog();
  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm]             = useState(emptyForm);
  const [filtroCat, setFiltroCat]   = useState('');
  const [saving, setSaving]         = useState(false);

  const { addToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    preciosPromocionApi.getAll()
      .then(setPromos)
      .catch(() => addToast('Error cargando promociones', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const reload = async () => {
    const p = await preciosPromocionApi.getAll();
    setPromos(p);
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
      precio_promocional: p.precio_promocional,
      fecha_inicio: p.fecha_inicio?.slice(0, 10) || '',
      fecha_fin: p.fecha_fin?.slice(0, 10) || '',
      activo: p.activo,
    });
    setModalOpen(true);
  };

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
                      <th className="text-right px-5 py-3 text-muted font-medium">Precio Promo</th>
                      <th className="text-center px-5 py-3 text-muted font-medium">Inicio</th>
                      <th className="text-center px-5 py-3 text-muted font-medium">Fin</th>
                      <th className="text-center px-5 py-3 text-muted font-medium">Estado</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {promos.map((p) => {
                      const activa = isActive(p);
                      return (
                        <tr key={p.id} className="border-b border-border/50 hover:bg-primary/3 transition-colors">
                          <td className="px-5 py-3 font-medium font-mono">{p.referencia}</td>
                          <td className="px-5 py-3 capitalize">{p.calidad}</td>
                          <td className="px-5 py-3 text-right font-mono font-semibold text-primary">{formatCurrency(p.precio_promocional)}</td>
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
                <label className="block text-sm font-medium text-primary mb-1">Referencia *</label>
                <select
                  value={form.referencia}
                  onChange={(e) => setForm({ ...form, referencia: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
                  required
                >
                  <option value="">Seleccionar...</option>
                  {referencias
                    .filter(r => !filtroCat || r.temporada_nombre === filtroCat)
                    .map((r) => (
                      <option key={r.id} value={r.nombre}>{r.nombre}</option>
                    ))}
                </select>
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
