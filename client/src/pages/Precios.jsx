import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, useToast, useConfirm } from '../components/common';
import { preciosApi, tiposPacaApi } from '../services/api';
import { Plus, Trash2, Edit2, Tag } from 'lucide-react';

function PrecioInput({ value, onChange, required }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');

  const fmt = (v) =>
    v ? new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v) : '';

  const handleFocus = () => {
    setRaw(value ? String(value) : '');
    setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseFloat(raw.replace(/\./g, '').replace(',', '.')) || '';
    onChange(parsed);
  };

  const handleChange = (e) => {
    const v = e.target.value.replace(/[^0-9]/g, '');
    setRaw(v);
    const parsed = parseFloat(v) || '';
    onChange(parsed);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={focused ? (raw ? new Intl.NumberFormat('es-CO').format(raw) : '') : fmt(value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      placeholder="Ej: 520.000"
      required={required}
      className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
    />
  );
}

const formatCurrency = (v) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

const emptyForm = { categoria: '', calidad: '', precio: '' };

export default function Precios() {
  const [precios, setPrecios]       = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [calidades, setCalidades]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm]             = useState(emptyForm);
  const [saving, setSaving]         = useState(false);

  const { addToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    Promise.all([
      preciosApi.getAll(),
      tiposPacaApi.getTemporadas(),
      tiposPacaApi.getCalidades(),
    ]).then(([p, c, q]) => {
      setPrecios(p);
      setCategorias(c);
      setCalidades(q);
    }).catch(() => addToast('Error cargando datos', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const reload = async () => {
    const p = await preciosApi.getAll();
    setPrecios(p);
  };

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditTarget(p);
    setForm({ categoria: p.categoria, calidad: p.calidad, precio: p.precio });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.categoria || !form.calidad || !form.precio) {
      addToast('Todos los campos son requeridos', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await preciosApi.update(editTarget.id, form);
        addToast('Precio actualizado', 'success');
      } else {
        await preciosApi.create(form);
        addToast('Precio guardado', 'success');
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
    const ok = await confirm({ title: 'Eliminar precio', message: `¿Eliminar el precio de ${p.categoria} / ${p.calidad}?` });
    if (!ok) return;
    try {
      await preciosApi.delete(p.id);
      addToast('Precio eliminado', 'success');
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
            <h1 className="text-2xl font-display font-bold text-primary">Precios Preestablecidos</h1>
            <p className="text-sm text-muted mt-1">Define precios por combinación de categoría y calidad. Se autocompletarán al finalizar un contenedor.</p>
          </div>
          <Button variant="secondary" icon={Plus} onClick={openCreate}>Agregar Precio</Button>
        </div>

        <Card>
          <CardBody className="p-0">
            {loading ? (
              <p className="text-center text-muted py-10">Cargando...</p>
            ) : precios.length === 0 ? (
              <div className="text-center py-14">
                <Tag size={40} className="mx-auto text-muted/40 mb-3" />
                <p className="text-muted">No hay precios configurados</p>
                <Button variant="ghost" size="sm" className="mt-3" onClick={openCreate}>Agregar el primero</Button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-5 py-3 text-muted font-medium">Categoría</th>
                    <th className="text-left px-5 py-3 text-muted font-medium">Calidad</th>
                    <th className="text-right px-5 py-3 text-muted font-medium">Precio</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {precios.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-primary/3 transition-colors">
                      <td className="px-5 py-3 font-medium capitalize">{p.categoria}</td>
                      <td className="px-5 py-3 capitalize">{p.calidad}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-primary">{formatCurrency(p.precio)}</td>
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
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-primary">
              {editTarget ? 'Editar Precio' : 'Nuevo Precio Preestablecido'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Categoría *</label>
                <select
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
                  required
                >
                  <option value="">Seleccionar...</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.nombre}>{c.nombre}</option>
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
                <label className="block text-sm font-medium text-primary mb-1">Precio *</label>
                <PrecioInput
                  value={form.precio}
                  onChange={(v) => setForm({ ...form, precio: v })}
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="secondary" disabled={saving}>
                  {saving ? 'Guardando...' : editTarget ? 'Actualizar' : 'Guardar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
