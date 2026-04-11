const API_BASE = import.meta.env.VITE_API_URL || '/api';

const handleResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(error.error || 'Error en la solicitud');
  }
  return response.json();
};

export const api = {
  async get(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`);
    return handleResponse(response);
  },

  async post(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async put(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async delete(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
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
  create(data) {
    return api.post('/pagos', data);
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
};

export const authApi = {
  login(credentials) {
    return api.post('/auth/login', credentials);
  },
  verificar() {
    return api.get('/auth/verificar');
  },
  cambiarPassword(data) {
    return api.post('/auth/cambiar-password', data);
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
  downloadCSV() {
    return api.get('/reportes/mensual/csv');
  },
  downloadJSON() {
    return api.get('/reportes/mensual/json');
  },
};