const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getToken = () => localStorage.getItem('token');

const handleResponse = async (response) => {
  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Sesión expirada');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(error.error || 'Error en la solicitud');
  }
  return response.json();
};

const getHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const api = {
  async get(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  async post(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async put(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async delete(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  async patch(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },
};

export const pacasApi = {
  getAll(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/pacas${query ? `?${query}` : ''}`);
  },
  getOne(id) {
    return api.get(`/pacas/${id}`);
  },
  getResumen() {
    return api.get('/pacas/resumen');
  },
  create(data) {
    return api.post('/pacas', data);
  },
  createBulk(data) {
    return api.post('/pacas/bulk', data);
  },
  update(id, data) {
    return api.put(`/pacas/${id}`, data);
  },
  delete(id) {
    return api.delete(`/pacas/${id}`);
  },
  getByType(data) {
    return api.post('/pacas/vender-tipo', data);
  },
};

export const clientesApi = {
  getAll(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/clientes${query ? `?${query}` : ''}`);
  },
  getOne(id) {
    return api.get(`/clientes/${id}`);
  },
  create(data) {
    return api.post('/clientes', data);
  },
  update(id, data) {
    return api.put(`/clientes/${id}`, data);
  },
  delete(id) {
    return api.delete(`/clientes/${id}`);
  },
};

export const ventasApi = {
  getAll(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/ventas${query ? `?${query}` : ''}`);
  },
  getOne(id) {
    return api.get(`/ventas/${id}`);
  },
  create(data) {
    return api.post('/ventas', data);
  },
  delete(id) {
    return api.delete(`/ventas/${id}`);
  },
  getReporte(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/ventas/reporte${query ? `?${query}` : ''}`);
  },
};

export const pagosApi = {
  getAll(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/pagos${query ? `?${query}` : ''}`);
  },
  getOne(id) {
    return api.get(`/pagos/${id}`);
  },
  create(data) {
    return api.post('/pagos', data);
  },
  update(id, data) {
    return api.put(`/pagos/${id}`, data);
  },
  delete(id) {
    return api.delete(`/pagos/${id}`);
  },
};


export const carteraApi = {
  getAll() {
    return api.get('/cartera');
  },
  getOne(clienteId) {
    return api.get(`/cartera/${clienteId}`);
  },
  getDeudores() {
    return api.get('/cartera/deudores');
  },
  exportOne(clienteId) {
    return api.get(`/cartera/exportar/${clienteId}`);
  },
};

export const dashboardApi = {
  getMetricas() {
    return api.get('/dashboard/metricas');
  },
  getVentasDiarias(dias = 30) {
    return api.get(`/dashboard/metricas/ventas-diarias?dias=${dias}`);
  },
  getVentasMensuales(anio) {
    const query = anio ? `?anio=${anio}` : '';
    return api.get(`/dashboard/metricas/ventas-mensuales${query}`);
  },
  getTopClientes(limite = 10) {
    return api.get(`/dashboard/metricas/top-clientes?limite=${limite}`);
  },
  getTiposMasVendidos(limite = 10) {
    return api.get(`/dashboard/metricas/tipos-mas-vendidos?limite=${limite}`);
  },
  getGanancias(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/dashboard/metricas/ganancias${query ? `?${query}` : ''}`);
  },
  getAlertas() {
    return api.get('/dashboard/metricas/alertas');
  },
  getPacasVendidas(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/dashboard/ventas/pacas-vendidas${query ? `?${query}` : ''}`);
  },
  getGanancia(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/dashboard/ventas/ganancia${query ? `?${query}` : ''}`);
  },
  getResumenGeneral() {
    return api.get('/dashboard/metricas/resumen-general');
  },
};

export const lotesApi = {
  getAll() {
    return api.get('/lotes');
  },
  getOne(id) {
    return api.get(`/lotes/${id}`);
  },
  getPacas(id) {
    return api.get(`/lotes/${id}/pacas`);
  },
  create(data) {
    return api.post('/lotes', data);
  },
  update(id, data) {
    return api.put(`/lotes/${id}`, data);
  },
  delete(id) {
    return api.delete(`/lotes/${id}`);
  },
  getRentabilidad() {
    return api.get('/lotes/rentabilidad/resumen');
  },
  agregarPacas(loteId, pacas) {
    return api.post(`/lotes/${loteId}/pacas`, { pacas });
  },
  asignarPacas(loteId, pacaIds) {
    return api.post(`/lotes/${loteId}/asignar`, { pacaIds });
  },
  desasignarPaca(loteId, pacaId) {
    return api.delete(`/lotes/${loteId}/pacas/${pacaId}`);
  },
  getPacasSinLote() {
    return api.get('/lotes/sin-lote');
  },
};

export const authApi = {
  login(credentials) {
    return api.post('/auth/login', credentials);
  },
  registro(data) {
    return api.post('/auth/registro', data);
  },
  verificar() {
    return api.get('/auth/verificar');
  },
  cambiarPassword(data) {
    return api.post('/auth/cambiar-password', data);
  },
  createUser(data) {
    return api.post('/auth/crear-usuario', data);
  },
  getUsers() {
    return api.get('/auth/usuarios');
  },
  updateUser(id, data) {
    return api.patch(`/auth/usuarios/${id}`, data);
  },
};

export const facturasApi = {
  getFactura(id) {
    return api.get(`/ventas/${id}/factura/json`);
  },
};

export const reportesApi = {
  getMensual() {
    return api.get('/reportes/mensual');
  },
  getMesActual() {
    return api.get('/reportes/mes-actual');
  },
  getCustom(fecha_inicio, fecha_fin) {
    return api.get(`/reportes/custom?fecha_inicio=${fecha_inicio}&fecha_fin=${fecha_fin}`);
  },
  downloadCSV() {
    return api.get('/reportes/mensual/csv');
  },
  downloadJSON() {
    return api.get('/reportes/mensual/json');
  },
};

export const catalogoApi = {
  getAll(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/catalogo${query ? `?${query}` : ''}`);
  },
  getResumen() {
    return api.get('/catalogo/resumen');
  },
};

export const pedidosApi = {
  getAll(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/pedidos${query ? `?${query}` : ''}`);
  },
  getOne(id) {
    return api.get(`/pedidos/${id}`);
  },
  create(data) {
    return api.post('/pedidos', data);
  },
  actualizar(id, data) {
    return api.patch(`/pedidos/${id}`, data);
  },
  delete(id) {
    return api.delete(`/pedidos/${id}`);
  },
};

export const clienteApi = {
  getCartera() {
    return api.get('/cartera/mi-cartera');
  },
  getMisPedidos(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/pedidos${query ? `?${query}` : ''}`);
  },
  getHistorial() {
    return api.get('/ventas/mi-historial');
  },
};

export const analyticsApi = {
  getRotacion() {
    return api.get('/analytics/rotacion');
  },
  getClientesScore(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/analytics/clientes-score${query ? `?${query}` : ''}`);
  },
  getLotes() {
    return api.get('/analytics/lotes');
  },
  getVentas(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/analytics/ventas${query ? `?${query}` : ''}`);
  },
  getPredicciones() {
    return api.get('/analytics/predicciones');
  },
  getRecomendaciones() {
    return api.get('/analytics/recomendaciones');
  },
  getDashboard() {
    return api.get('/analytics/dashboard');
  },
  getQueComprar() {
    return api.get('/analytics/que-comprar');
  },
  getRiesgoCartera() {
    return api.get('/analytics/riesgo-cartera');
  },
  getFlujoCaja(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/analytics/flujo-caja${query ? `?${query}` : ''}`);
  },
  getContenedores() {
    return api.get('/analytics/contenedores');
  },
};

export const tiposPacaApi = {
  getTipos() { return api.get('/tipos-paca/tipos'); },
  createTipo(data) { return api.post('/tipos-paca/tipos', data); },
  deleteTipo(id) { return api.delete(`/tipos-paca/tipos/${id}`); },
  getCategorias() { return api.get('/tipos-paca/categorias'); },
  createCategoria(data) { return api.post('/tipos-paca/categorias', data); },
  deleteCategoria(id) { return api.delete(`/tipos-paca/categorias/${id}`); },
};

export const cotizacionesApi = {

  getAll(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/cotizaciones${query ? `?${query}` : ''}`);
  },
  getOne(id) {
    return api.get(`/cotizaciones/${id}`);
  },
  create(data) {
    return api.post('/cotizaciones', data);
  },
  update(id, data) {
    return api.put(`/cotizaciones/${id}`, data);
  },
  updateEstado(id, estado) {
    return api.patch(`/cotizaciones/${id}/estado`, { estado });
  },
  delete(id) {
    return api.delete(`/cotizaciones/${id}`);
  },
  convertirAVenta(id, vendedorId) {
    return api.post(`/cotizaciones/${id}/convertir`, { vendedor_id: vendedorId });
  },
};

export const reservasApi = {
  getAll(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/reservas${query ? `?${query}` : ''}`);
  },
  getByCliente(clienteId) {
    return api.get(`/reservas/cliente/${clienteId}`);
  },
  create(data) {
    return api.post('/reservas', data);
  },
  cancelar(id) {
    return api.put(`/reservas/${id}/cancelar`);
  },
  convertir(id) {
    return api.put(`/reservas/${id}/convertir`);
  },
  expirar() {
    return api.put('/reservas/expirar');
  },
  delete(id) {
    return api.delete(`/reservas/${id}`);
  },
};

export const contenedoresApi = {
  getAll(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`/contenedores${query ? `?${query}` : ''}`);
  },
  getOne(id) {
    return api.get(`/contenedores/${id}`);
  },
  create(data) {
    return api.post('/contenedores', data);
  },
  update(id, data) {
    return api.put(`/contenedores/${id}`, data);
  },
  finalizar(id, data) {
    return api.post(`/contenedores/${id}/finalizar`, data);
  },
  delete(id) {
    return api.delete(`/contenedores/${id}`);
  },
};