# 🚀 PLAN DE EVOLUCIÓN - Bodega Americana

## FASE 1: Fundamentos (Semana 1)
### 1.1 Refactor Backend
**Objetivo**: Estructura limpia sin romper funcionalidad

```
server/src/
├── controllers/    # Lógica de negocio (actual rutas)
├── services/       # Lógica reusable
├── repositories/  # Acceso a BD
├── middleware/     # Auth, errores, validación
├── utils/          # Helpers
└── index.js
```

**Por qué primero**: Mantiene compatibilidad mientras mejora estructura

### 1.2 Extender Base de Datos
```sql
-- Extensiones sin borrar
ALTER TABLE pacas ADD COLUMN IF NOT EXISTS lote_id INTEGER REFERENCES lotes(id);
ALTER TABLE pacas ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS dias_mora INTEGER DEFAULT 0;

-- Nueva tabla lotes
CREATE TABLE lotes (...);

-- Índices para rendimiento
CREATE INDEX idx_ventas_fecha ON ventas(fecha);
CREATE INDEX idx_movimientos_fecha ON movimientos(fecha);
```

---

## FASE 2: Sistema de Ganancias (Semana 1-2)
### 2.1 Lógica de Ganancias
```javascript
// Ganancia por paca = precio_venta - costo_base
// Ganancia por venta = SUM(precio_unitario) - SUM(costo_base)
// Ganancia por cliente = SUM(venta) - SUM(abonos)
```

### 2.2 Dashboard Avanzado
- Gráficos: ventas por día/semana/mes
- Top 10 clientes por venta
- Tipos de paca más vendidos
- Alertas configurables

---

## FASE 3: Lógica de Negocio (Semana 2)
### 3.1 Validaciones
- ✅ Bloquear venta si saldo + nueva_venta > límite_credito
- ✅ Detectar morosidad: última venta > 30 días sin abono
- ✅ Alertar si paca sin vender > 60 días

### 3.2 Sistema de Lotes
```
lote → pacas (1:N)
métrica: rentabilidad_por_lote
```

---

## FASE 4: Mejoras UX (Semana 2-3)
### 4.1 Frontend
- Búsqueda en tiempo real (debounce 300ms)
- Paginación server-side
- Skeleton loaders
- Toast notifications

### 4.2 Facturación
```javascript
// Endpoint: GET /api/ventas/:id/factura
// Retorna: PDF con datos de venta + cliente
```

---

## FASE 5: Analítica y Auth (Semana 3)
### 5.1 Métricas
- Frecuencia de compra por cliente
- Ventas por período
-ABC de clientes (20/80)

### 5.2 Autenticación
- Login básico con JWT
- Roles: admin, vendedor
- Middleware de protección

---

## 📦 ORDEN DE IMPLEMENTACIÓN

| # | Módulo | Dependencias | Riesgo |
|---|-------|-------------|--------|
| 1 | Refactor Backend | Ninguno | Bajo |
| 2 | DB Extensiones | Ninguno | Bajo |
| 3 | Ganancias | DB Extensiones | Bajo |
| 4 | Dashboard | Ganancias | Medio |
| 5 | Lógica Negocio | Ganancias | Medio |
| 6 | Lotes | DB Extensiones | Bajo |
| 7 | PDF | Ninguno | Bajo |
| 8 | Frontend UX | Ninguno | Medio |
| 9 | Analítica | Ganancias | Bajo |
| 10 | Auth | Ninguno | Alto |

---

## ⚠️ REGLAS DE COMPATIBILIDAD

1. **Nunca DROP COLUMN** - Usar ADD COLUMN
2. **Siempre agregar IF NOT EXISTS**
3. **Mantener endpoints actuales** - Agregar nuevos, no reemplazar
4. **Versionar API** - /api/v1/...
5. **Features flags** - Para toggle sin deploy

---

## 🎯 CRITERIOS DE ÉXITO

- [ ] Tests pasan sin cambio
- [ ] Endpoints legacy funcionan
- [ ] DB migra sin pérdida de datos
- [ ] Frontend no recompila (solo refresh)