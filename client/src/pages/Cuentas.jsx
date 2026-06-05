import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Modal, useToast, useConfirm } from '../components/common';
import { cuentasApi } from '../services/api';
import { Wallet, Plus, Trash2, Pencil } from 'lucide-react';

const TIPOS = [
  { value: 'banco', label: 'Banco' },
  { value: 'caja', label: 'Caja' },
  { value: 'efectivo', label: 'Efectivo' },
];

export default function Cuentas() {
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nombre: '', tipo: 'banco' });
  const { addToast } = useToast();
  const confirm = useConfirm();

  const load = async () => {
    try {
      setLoading(true);
      const data = await cuentasApi.getAll({ todas: 'true' });
      setCuentas(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditando(null); setForm({ nombre: '', tipo: 'banco' }); setModalOpen(true); };
  const openEdit = (c) => { setEditando(c); setForm({ nombre: c.nombre, tipo: c.tipo }); setModalOpen(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) { addToast('Nombre requerido', 'error'); return; }
    try {
      if (editando) await cuentasApi.update(editando.id, form);
      else await cuentasApi.create(form);
      addToast(editando ? 'Cuenta actualizada' : 'Cuenta creada', 'success');
      setModalOpen(false);
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (c) => {
    const ok = await confirm({ title: '¿Desactivar cuenta?', message: `Se desactivará "${c.nombre}".`, confirmText: 'Desactivar', variant: 'danger' });
    if (!ok) return;
    try {
      await cuentasApi.delete(c.id);
      addToast('Cuenta desactivada', 'success');
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display text-primary flex items-center gap-2">
              <Wallet className="w-6 h-6" /> Cuentas
            </h1>
            <p className="text-sm text-muted">Bancos / cajas usados al registrar abonos</p>
          </div>
          <Button onClick={openCreate}><Plus size={16} /> Nueva cuenta</Button>
        </div>

        <Card>
          <CardBody>
            {loading ? (
              <p className="text-center text-muted py-8">Cargando...</p>
            ) : cuentas.length === 0 ? (
              <p className="text-center text-muted py-8">Sin cuentas registradas</p>
            ) : (
              <div className="space-y-2">
                {cuentas.map(c => (
                  <div key={c.id} className={`flex items-center justify-between p-3 rounded-xl border border-border ${!c.activo ? 'opacity-50' : ''}`}>
                    <div>
                      <span className="font-medium">{c.nombre}</span>
                      <span className="ml-2 text-xs uppercase text-muted">{c.tipo}</span>
                      {!c.activo && <span className="ml-2 text-xs text-red-500">(inactiva)</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(c)} className="p-2 text-muted hover:text-primary"><Pencil size={16} /></button>
                      {c.activo && <button onClick={() => handleDelete(c)} className="p-2 text-muted hover:text-red-500"><Trash2 size={16} /></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar cuenta' : 'Nueva cuenta'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Bancolombia, Caja principal" required />
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Tipo</label>
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit">{editando ? 'Guardar' : 'Crear'}</Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
