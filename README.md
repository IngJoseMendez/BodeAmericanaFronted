# Bodega Americana - Sistema de Gestión

Aplicación web completa para la gestión de una distribuidora de pacas de ropa americana.

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js 18+
- PostgreSQL 14+

### 1. Base de Datos

```sql
-- Crear base de datos
CREATE DATABASE bodega_americana;

-- Ejecutar schema
\i server/src/db/schema.sql
```

### 2. Configurar Variables de Entorno

Edita `server/.env` con tus credenciales:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bodega_americana
DB_USER=postgres
DB_PASSWORD=tu_password
PORT=3001
```

### 3. Iniciar Aplicación

```bash
# Terminal 1 - Backend
cd server && npm run dev

# Terminal 2 - Frontend
cd client && npm run dev
```

Abre http://localhost:5173

## 📁 Estructura

```
bodega-americana/
├── client/          # React + Vite + Tailwind
│   ├── src/
│   │   ├── components/   # Componentes UI
│   │   ├── pages/       # Páginas del dashboard
│   │   ├── services/    # API calls
│   │   └── types/       # Constantes
├── server/          # Express + PostgreSQL
│   └── src/
│       ├── config/     # DB config
│       ├── routes/    # API endpoints
│       └── db/       # Schema SQL
└── SPEC.md         # Especificación completa
```

## 🎨 Características

- **Dashboard** con métricas en tiempo real
- **CRUD completo** de pacas, clientes, ventas
- **Gestión de cartera** con movimientos
- **Reportes** por fecha y ganancias
- **UI moderna** con Tailwind CSS
- **Diseño responsive**

## 📋 Módulos

| Módulo | Descripción |
|--------|-------------|
| Inventario | CRUD de pacas con estados |
| Clientes | CRUD con límite de crédito |
| Ventas | Multiple selección de pacas |
| Cartera | Estado de cuenta por cliente |
| Reportes | Ventas, ganancias, deudores |

## 🔧API Endpoints

- `GET /api/pacas` - Listar pacas
- `GET /api/clientes` - Listar clientes
- `POST /api/ventas` - Crear venta
- `POST /api/pagos` - Registrar abono
- `GET /api/cartera/:id` - Estado de cuenta
- `GET /api/dashboard/metricas` - Métricas