const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getToken = () => localStorage.getItem('token');

/**
 * Serializa parámetros descartando los vacíos.
 * `new URLSearchParams({buscar: undefined})` produce literalmente
 * "buscar=undefined", y el servidor filtraba por esa palabra.
 */
export const qs = (params = {}) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.append(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
};

// Una red colgada dejaba la pantalla en "Cargando…" para siempre.
const TIMEOUT_MS = 30000;

const handleResponse = async (response, endpoint = '') => {
  if (response.status === 401) {
    // En el login un 401 significa "contraseña incorrecta", no "sesión
    // expirada": recargar aquí borraba el mensaje de error antes de leerlo.
    if (!/\/(login|auth\/login)/.test(endpoint)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      throw new Error('Sesión expirada');
    }
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(error.error || 'Error en la solicitud');
  }
  return response.json();
};

/** fetch con límite de tiempo; distingue "se cayó la red" de "el servidor dijo que no". */
const pedir = async (endpoint, opciones = {}) => {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, { ...opciones, signal: ctrl.signal });
    return await handleResponse(response, endpoint);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('El servidor no respondió a tiempo. Revisa tu conexión e inténtalo de nuevo.');
    }
    if (err instanceof TypeError) {
      throw new Error('No hay conexión con el servidor.');
    }
    throw err;
  } finally {
    clearTimeout(reloj);
  }
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
  get(endpoint) {
    return pedir(endpoint, { headers: getHeaders() });
  },

  post(endpoint, data) {
    return pedir(endpoint, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) });
  },

  put(endpoint, data) {
    return pedir(endpoint, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) });
  },

  delete(endpoint) {
    return pedir(endpoint, { method: 'DELETE', headers: getHeaders() });
  },

  patch(endpoint, data) {
    return pedir(endpoint, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(data) });
  },
};

export const pacasApi = {
  getAll(params = {}) {
    return api.get(`/pacas${qs(params)}`);
  },
  getOne(id) {
    return api.get(`/pacas/${id}`);
  },
  getResumen() {
    return api.get('/pacas/resumen');
  },
  getDisponibilidad(params = {}) {
    return api.get(`/pacas/disponibilidad${qs(params)}`);
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
  getInventario(params = {}) {
    return api.get(`/pacas/inventario${qs(params)}`);
  },
  getComprometidas(params = {}) {
    return api.get(`/pacas/comprometidas${qs(params)}`);
  },
};

export const clientesApi = {
  getAll(params = {}) {
    return api.get(`/clientes${qs(params)}`);
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
    return api.get(`/ventas${qs(params)}`);
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
    return api.get(`/ventas/reporte${qs(params)}`);
  },
};

export const pagosApi = {
  getAll(params = {}) {
    return api.get(`/pagos${qs(params)}`);
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
  // Carga histórica (legacy): un registro o un arreglo de { cliente_id, tipo, fecha, monto, cuenta_id?, referencia? }
  importarLegacy(registros) {
    return api.post('/cartera/legacy', registros);
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
    return api.get(`/dashboard/metricas/ganancias${qs(params)}`);
  },
  getAlertas() {
    return api.get('/dashboard/metricas/alertas');
  },
  getPacasVendidas(params = {}) {
    return api.get(`/dashboard/ventas/pacas-vendidas${qs(params)}`);
  },
  getGanancia(params = {}) {
    return api.get(`/dashboard/ventas/ganancia${qs(params)}`);
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
    return api.get(`/catalogo${qs(params)}`);
  },
  getResumen() {
    return api.get('/catalogo/resumen');
  },
};

export const pedidosApi = {
  getAll(params = {}) {
    return api.get(`/pedidos${qs(params)}`);
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
    return api.get(`/pedidos${qs(params)}`);
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
    return api.get(`/analytics/clientes-score${qs(params)}`);
  },
  getLotes() {
    return api.get('/analytics/lotes');
  },
  getVentas(params = {}) {
    return api.get(`/analytics/ventas${qs(params)}`);
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
    return api.get(`/analytics/flujo-caja${qs(params)}`);
  },
  getContenedores() {
    return api.get('/analytics/contenedores');
  },
};

export const tiposPacaApi = {
  getTipos() { return api.get('/tipos-paca/tipos'); },
  createTipo(data) { return api.post('/tipos-paca/tipos', data); },
  updateTipo(id, data) { return api.put(`/tipos-paca/tipos/${id}`, data); },
  deleteTipo(id) { return api.delete(`/tipos-paca/tipos/${id}`); },
  getCategorias() { return api.get('/tipos-paca/categorias'); },
  createCategoria(data) { return api.post('/tipos-paca/categorias', data); },
  updateCategoria(id, data) { return api.put(`/tipos-paca/categorias/${id}`, data); },
  deleteCategoria(id) { return api.delete(`/tipos-paca/categorias/${id}`); },
  getCalidades() { return api.get('/tipos-paca/calidades'); },
  createCalidad(data) { return api.post('/tipos-paca/calidades', data); },
  updateCalidad(id, data) { return api.put(`/tipos-paca/calidades/${id}`, data); },
  deleteCalidad(id) { return api.delete(`/tipos-paca/calidades/${id}`); },
  getTemporadas() { return api.get('/tipos-paca/temporadas'); },
  getFamilias() { return api.get('/tipos-paca/familias'); },
  createFamilia(data) { return api.post('/tipos-paca/familias', data); },
  updateFamilia(id, data) { return api.put(`/tipos-paca/familias/${id}`, data); },
  deleteFamilia(id) { return api.delete(`/tipos-paca/familias/${id}`); },
  createTemporada(data) { return api.post('/tipos-paca/temporadas', data); },
  updateTemporada(id, data) { return api.put(`/tipos-paca/temporadas/${id}`, data); },
  deleteTemporada(id) { return api.delete(`/tipos-paca/temporadas/${id}`); },
};

export const cotizacionesApi = {

  getAll(params = {}) {
    return api.get(`/cotizaciones${qs(params)}`);
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
  convertirAVenta(id, vendedorId, extra = {}) {
    return api.post(`/cotizaciones/${id}/convertir`, { vendedor_id: vendedorId, ...extra });
  },
  crearDespacho(id, paca_ids) {
    return api.post(`/cotizaciones/${id}/despacho`, paca_ids?.length ? { paca_ids } : {});
  },
};

export const reservasApi = {
  getAll(params = {}) {
    return api.get(`/reservas${qs(params)}`);
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
    return api.get(`/contenedores${qs(params)}`);
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
  revisar(id, data) {
    return api.post(`/contenedores/${id}/revisar`, data);
  },
  finalizar(id, data) {
    return api.post(`/contenedores/${id}/finalizar`, data);
  },
  convertirNormal(id) {
    return api.post(`/contenedores/${id}/convertir-normal`);
  },
  delete(id) {
    return api.delete(`/contenedores/${id}`);
  },
};

export const cuentasPagarApi = {
  getAll(params = {}) {
    return api.get(`/cuentas-pagar${qs(params)}`);
  },
  getOne(id) { return api.get(`/cuentas-pagar/${id}`); },
  create(data) { return api.post('/cuentas-pagar', data); },
  update(id, data) { return api.put(`/cuentas-pagar/${id}`, data); },
  registrarAbono(id, data) { return api.post(`/cuentas-pagar/${id}/abonos`, data); },
  delete(id) { return api.delete(`/cuentas-pagar/${id}`); },
};

export const despachosApi = {
  getAll(params = {}) {
    return api.get(`/despachos${qs(params)}`);
  },
  getOne(id) { return api.get(`/despachos/${id}`); },
  confirmar(id, body = {}) { return api.post(`/despachos/${id}/confirmar`, body); },
  anular(id) { return api.delete(`/despachos/${id}`); },
};

export const pacasInventarioApi = {
  getInventario() { return api.get('/pacas/inventario'); },
};

export const preciosApi = {
  getAll() { return api.get('/precios'); },
  buscar({ categoria, calidad }) {
    return api.get(`/precios/buscar?categoria=${encodeURIComponent(categoria)}&calidad=${encodeURIComponent(calidad)}`);
  },
  create(data) { return api.post('/precios', data); },
  update(id, data) { return api.put(`/precios/${id}`, data); },
  delete(id) { return api.delete(`/precios/${id}`); },
};

export const cuentasApi = {
  getAll(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/cuentas${q ? '?' + q : ''}`);
  },
  create(data) { return api.post('/cuentas', data); },
  update(id, data) { return api.put(`/cuentas/${id}`, data); },
  delete(id) { return api.delete(`/cuentas/${id}`); },
};

export const bancosApi = {
  getAll(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/bancos${q ? '?' + q : ''}`);
  },
  create(data) { return api.post('/bancos', data); },
  update(id, data) { return api.put(`/bancos/${id}`, data); },
  delete(id) { return api.delete(`/bancos/${id}`); },
};

export const transportesApi = {
  getAll(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/transportes${q ? '?' + q : ''}`);
  },
  create(data) { return api.post('/transportes', data); },
  update(id, data) { return api.put(`/transportes/${id}`, data); },
  delete(id) { return api.delete(`/transportes/${id}`); },
};

export const inversionistasApi = {
  getAll(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/inversionistas${q ? '?' + q : ''}`);
  },
  create(data) { return api.post('/inversionistas', data); },
  update(id, data) { return api.put(`/inversionistas/${id}`, data); },
  delete(id) { return api.delete(`/inversionistas/${id}`); },

  getAportes(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/inversionistas/aportes${q ? '?' + q : ''}`);
  },
  crearAporte(data) { return api.post('/inversionistas/aportes', data); },
  actualizarAporte(id, data) { return api.put(`/inversionistas/aportes/${id}`, data); },
  eliminarAporte(id) { return api.delete(`/inversionistas/aportes/${id}`); },
};

export const gastosApi = {
  getAll(params = {}) { const q = new URLSearchParams(params).toString(); return api.get(`/gastos${q ? '?' + q : ''}`); },
  getReporte(params = {}) { const q = new URLSearchParams(params).toString(); return api.get(`/gastos/reporte${q ? '?' + q : ''}`); },
  create(data) { return api.post('/gastos', data); },
  update(id, data) { return api.put(`/gastos/${id}`, data); },
  delete(id) { return api.delete(`/gastos/${id}`); },
};

export const historicoApi = {
  importar(payload) { return api.post('/historico/importar', payload); },
  getAll(params = {}) { const q = new URLSearchParams(params).toString(); return api.get(`/historico${q ? '?' + q : ''}`); },
  getReporte(params = {}) { const q = new URLSearchParams(params).toString(); return api.get(`/historico/reporte${q ? '?' + q : ''}`); },
  getAnios() { return api.get('/historico/anios'); },
  deleteLote(lote) { return api.delete(`/historico/lote/${lote}`); },
};

export const listaPreciosApi = {
  getAll(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/lista-precios${q ? '?' + q : ''}`);
  },
};

export const auditoriaApi = {
  getAll(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/auditoria${q ? '?' + q : ''}`);
  },
};

export const preciosPromocionApi = {
  getAll(params = {}) {
    return api.get(`/precios-promocion${qs(params)}`);
  },
  getActiva({ referencia, calidad, clasificacion }) {
    const q = new URLSearchParams({ referencia, calidad });
    // Opcional: si se envía, gana la promoción específica de esa clasificación.
    if (clasificacion) q.set('clasificacion', clasificacion);
    return api.get(`/precios-promocion/activa?${q.toString()}`);
  },
  create(data) { return api.post('/precios-promocion', data); },
  update(id, data) { return api.put(`/precios-promocion/${id}`, data); },
  delete(id) { return api.delete(`/precios-promocion/${id}`); },
};