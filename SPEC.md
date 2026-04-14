# Bodega Americana - Sistema de Gestión

## 1. PROJECT OVERVIEW

**Project Name:** Bodega Americana  
**Type:** Full-stack Inventory & Sales Management Web Application  
**Core Functionality:** Control de inventario de pacas de ropa americana, gestión de clientes, ventas, y cartera  
**Target Users:** Dueños y empleados de distribuidores de ropa americana (pacas)

---

## 2. AESTHETIC DIRECTION

**Conceptual Direction:** Industrial-Modern con personalidad warmth

Un diseño que refleja la naturaleza del negocio de ropaamericana: auténtico, robusto pero con un toque moderno. Usaremos:

- **Palette:** 
  - Primary: `#1a1a2e` (deep navy/black)
  - Secondary: `#f4a261` (warm amber/sand)
  - Accent: `#e76f51` (terracotta)
  - Success: `#2a9d8f` (teal)
  - Background: `#fefae0` (cream/ivory)
  - Surface: `#ffffff`
  - Text: `#1a1a2e`

- **Typography:**
  - Display: "DM Serif Display" (headings)
  - Body: "Plus Jakarta Sans" (UI/forms)

- **Style:**
  - Bordes sutiles redondeados
  - Sombras suaves y bien definidas
  - Iconografía minimalista
  - Espaciado generoso
  - Micro-interacciones smoothness

---

## 3. UI/UX SPECIFICATION

### Layout Structure

- **Sidebar Navigation**: Fija a la izquierda (240px desktop, collapsible en mobile)
- **Main Content**: Área principal con padding de 24px
- **Header**: Título de página + acciones rápidas (24px height)
- **Dashboard**: Grid de métricas + tablas de datos

### Responsive Breakpoints

- Mobile: < 768px (sidebar como drawer)
- Tablet: 768px - 1024px
- Desktop: > 1024px

### Components

| Component | States | Behavior |
|----------|--------|----------|
| Button Primary | default, hover, active, disabled | Scale 0.98, shadow lift |
| Button Secondary | default, hover, active, disabled | Background change |
| Input | default, focus, error, disabled | Border accent, ring |
| Select | default, open, focused | Animated dropdown |
| Table | default, hover row | Background tint |
| Card | default, hover | Subtle shadow lift |
| Badge | success/warning/error/info | Solid colors |
| Modal | enter, exit | Scale + fade |

### Status Colors

- **Disponible**: `#2a9d8f` (teal - green)
- **Separada**: `#f4a261` (amber - yellow)
- **Vendida**: `#e76f51` (terracotta - red)
- **Activo**: `#2a9d8f` (teal)
- **Inactivo**: `#6b7280` (gray)
- **Contado**: `#2a9d8f` (teal)
- **Crédito**: `#f4a261` (amber)

---

## 4. DATABASE SCHEMA

### Tablas Principales

```sql
-- Pacas (inventory)
CREATE TABLE pacas (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(36) UNIQUE NOT NULL,
  tipo VARCHAR(50) NOT NULL, -- premium, jeans, mixta, etc.
  categoria VARCHAR(20) NOT NULL, -- hombre, mujer, niño, unisex
  peso DECIMAL(10,2) NOT NULL, -- en kilogramos
  costo_base DECIMAL(10,2) NOT NULL,
  precio_venta DECIMAL(10,2) NOT NULL,
  estado VARCHAR(20) DEFAULT 'disponible', -- disponible, separada, vendida
  fecha_ingreso DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clientes
CREATE TABLE clientes (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(36) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  telefono VARCHAR(20),
  direccion TEXT,
  ciudad VARCHAR(50),
  tipo_cliente VARCHAR(20) NOT NULL, -- mayorista, minorista
  limite_credito DECIMAL(10,2) DEFAULT 0,
  estado VARCHAR(20) DEFAULT 'activo', -- activo, inactivo
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ventas
CREATE TABLE ventas (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(36) UNIQUE NOT NULL,
  cliente_id INTEGER REFERENCES clientes(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo_pago VARCHAR(20) NOT NULL, -- contado, credito
  total DECIMAL(10,2) NOT NULL,
  estado VARCHAR(20) DEFAULT 'completada',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Detalle de ventas (pacas vendidas)
CREATE TABLE venta_detalles (
  id SERIAL PRIMARY KEY,
  venta_id INTEGER REFERENCES ventas(id) ON DELETE CASCADE,
  paca_id INTEGER REFERENCES pacas(id),
  precio_unitario DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Movimientos de cartera
CREATE TABLE movimientos (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(36) UNIQUE NOT NULL,
  cliente_id INTEGER REFERENCES clientes(id),
  tipo VARCHAR(20) NOT NULL, -- venta, abono
  monto DECIMAL(10,2) NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  metodo_pago VARCHAR(20), -- efectivo, transferencia, etc.
  referencia VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_pacas_estado ON pacas(estado);
CREATE INDEX idx_pacas_tipo ON pacas(tipo);
CREATE INDEX idx_ventas_fecha ON ventas(fecha);
CREATE INDEX idx_ventas_cliente ON ventas(cliente_id);
CREATE INDEX idx_movimientos_cliente ON movimientos(cliente_id);
```

---

## 5. API ENDPOINTS

### Pacas
- `GET /api/pacas` - Listar todas (con filtros)
- `GET /api/pacas/:id` - Obtener una
- `POST /api/pacas` - Crear
- `PUT /api/pacas/:id` - Actualizar
- `DELETE /api/pacas/:id` - Eliminar

### Clientes
- `GET /api/clientes` - Listar todos
- `GET /api/clientes/:id` - Obtener uno
- `POST /api/clientes` - Crear
- `PUT /api/clientes/:id` - Actualizar
- `DELETE /api/clientes/:id` - Eliminar

### Ventas
- `GET /api/ventas` - Listar ventas
- `GET /api/ventas/:id` - Obtener venta con detalles
- `POST /api/ventas` - Crear venta
- `GET /api/ventas/reporte` - Reporte de ventas

### Pagos
- `GET /api/pagos` - Listar pagos
- `POST /api/pagos` - Registrar pago

### Cartera
- `GET /api/cartera/:clienteId` - Estado de cuenta
- `GET /api/cartera` - resumen de todos

### Dashboard
- `GET /api/dashboard/metricas` - Métricas principales

---

## 6. FOLDER STRUCTURE

```
bodega-americana/
├── client/                    # React Frontend
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/        # Button, Input, Card, etc.
│   │   │   ├── layout/       # Sidebar, Header, Layout
│   │   │   ├── pacas/        # Paca components
│   │   │   ├── clientes/     # Cliente components
│   │   │   ├── ventas/       # Venta components
│   │   │   ├── cartera/      # Cartera components
│   │   │   └── reportes/    # Reporte components
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/        # API calls
│   │   ├── context/
│   │   ├── types/
│   │   └── utils/
│   ├── package.json
│   └── tailwind.config.js
├── server/                    # Express Backend
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── db/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   └── index.js
│   ├── package.json
│   └── .env.example
├── SPEC.md
└── README.md
```

---

## 7. ACCEPTANCE CRITERIA

- [ ] CRUD completo de pacas con validaciones
- [ ] CRUD completo de clientes
- [ ] Crear ventas con selección de múltiples pacas
- [ ] Validación: no vender paca ya vendida
- [ ] Cálculo automático de totales
- [ ] Registro automático en cartera al vender
- [ ] Registro de abonos y actualización de cartera
- [ ] Dashboard con métricas
- [ ] Reportes funcionales
- [ ] UI responsive y funcional
- [ ] Colores de estado visibles
- [ ] Sin duplicidad de datos
- [ ] Manejo de errores claro

---

## 8. TECHNICAL STACK

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Backend:** Node.js + Express
- **Database:** PostgreSQL + node-postgres (pg)
- **Architecture:** MVC
- **API:** REST JSON
- **Validation:** Zod (backend), native (frontend)