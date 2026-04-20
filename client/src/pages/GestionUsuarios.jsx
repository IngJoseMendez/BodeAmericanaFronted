import { useState, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Modal, Badge, useToast, useConfirm } from '../components/common';
import { authApi } from '../services/api';
import { Plus, Edit2, Trash2, User, Shield, Users } from 'lucide-react';

export default function GestionUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const { addToast } = useToast();
  const confirm = useConfirm();

  const [formData, setFormData] = useState({
    usuario: '',
    password: '',
    nombre: '',
    rol: 'vendedor'
  });

  useEffect(() => {
    loadUsuarios();
  }, []);

  const loadUsuarios = async () => {
    try {
      setLoading(true);
      const data = await authApi.getUsers();
      setUsuarios(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditando(null);
    setFormData({ usuario: '', password: '', nombre: '', rol: 'vendedor' });
    setModalOpen(true);
  };

  const openEditModal = (user) => {
    setEditando(user);
    setFormData({ 
      usuario: user.username, 
      password: '', 
      nombre: user.nombre, 
      rol: user.rol 
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.usuario || !formData.nombre || !formData.rol) {
      addToast('Todos los campos son requeridos', 'error');
      return;
    }

    if (!editando && !formData.password) {
      addToast('Contraseña requerida', 'error');
      return;
    }

    if (formData.password && formData.password.length < 8) {
      addToast('Mínimo 8 caracteres en contraseña', 'error');
      return;
    }

    try {
      if (editando) {
        await authApi.updateUser(editando.id, { 
          rol: formData.rol,
          estado: formData.estado || editando.estado 
        });
        addToast('Usuario actualizado', 'success');
      } else {
        await authApi.createUser(formData);
        addToast('Usuario creado', 'success');
      }
      setModalOpen(false);
      loadUsuarios();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (user) => {
    const ok = await confirm({
      title: '¿Eliminar usuario?',
      message: `Se eliminará ${user.username}. Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    // Por ahora no hay delete endpoint, solo desactivamos
    try {
      await authApi.updateUser(user.id, { estado: user.estado === 'activo' ? 'inactivo' : 'activo' });
      addToast(`Usuario ${user.estado === 'activo' ? 'desactivado' : 'activado'}`, 'success');
      loadUsuarios();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const getRolBadge = (rol) => {
    if (rol === 'admin') {
      return <Badge variant="primary"><Shield size={12} className="mr-1" />Admin</Badge>;
    }
    return <Badge variant="secondary"><User size={12} className="mr-1" />Vendedor</Badge>;
  };

  const getEstadoBadge = (estado) => {
    if (estado === 'activo') {
      return <Badge variant="success">Activo</Badge>;
    }
    return <Badge variant="error">Inactivo</Badge>;
  };

  return (
    <Layout title="Gestión de Usuarios" subtitle="Administrar usuarios del sistema" actions={
      <Button onClick={openCreateModal}>
        <Plus size={18} className="mr-1" /> Nuevo Usuario
      </Button>
    }>
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : usuarios.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Users size={48} className="mx-auto mb-2 opacity-50" />
          <p>No hay usuarios del sistema</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {usuarios.map((user) => (
            <Card key={user.id} hover>
              <CardBody className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User size={24} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium text-primary">{user.nombre}</h3>
                    <p className="text-sm text-gray-500">@{user.username}</p>
                    <div className="flex gap-2 mt-1">
                      {getRolBadge(user.rol)}
                      {getEstadoBadge(user.estado)}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEditModal(user)}>
                    <Edit2 size={16} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(user)}>
                    <Trash2 size={16} />
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Usuario' : 'Nuevo Usuario'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
            <Input
              value={formData.usuario}
              onChange={(e) => setFormData({...formData, usuario: e.target.value})}
              placeholder="usuario"
              disabled={!!editando}
              required
            />
          </div>
          
          {!editando && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                placeholder="Mínimo 8 caracteres"
                required={!editando}
              />
              <p className="text-xs text-gray-500 mt-1">
                Mínimo 8 caracteres, mayúscula, minúscula, número y carácter especial
              </p>
            </div>
          )}
          
          {editando && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña (opcional)</label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                placeholder="Dejar vacío para mantener actual"
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
            <Input
              value={formData.nombre}
              onChange={(e) => setFormData({...formData, nombre: e.target.value})}
              placeholder="Nombre completo"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
            <select
              value={formData.rol}
              onChange={(e) => setFormData({...formData, rol: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="vendedor">Vendedor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          
          {editando && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select
                value={formData.estado || editando.estado}
                onChange={(e) => setFormData({...formData, estado: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
          )}
          
          <div className="flex gap-2 pt-4">
            <Button type="submit" className="flex-1">
              {editando ? 'Guardar Cambios' : 'Crear Usuario'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}