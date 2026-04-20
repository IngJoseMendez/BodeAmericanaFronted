# Bodega Americana - AGENTS

## Quick Start

```bash
# Database (must exist first)
CREATE DATABASE bodega_americana;

# Terminal 1 - Backend (port 3001)
cd server && npm run dev

# Terminal 2 - Frontend (port 5173)
npm run dev  # or cd client && npm run dev
```

Default admin: `admin` / `Admin@2024`

## Key Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Frontend (5173) - Vite proxies `/api` |
| `cd server && npm run dev` | Backend (3001) - nodemon |
| `npm run build` | Frontend production build |
| `npm run test` | Playwright tests |
| `npm run test:ui` | Playwright with UI |

## Important Architecture

- **Root `package.json` IS the client** - Don't be confused, there's no workspace config
- **Server uses CommonJS** (`require()`), frontend uses ESM (`import`)
- **Database auto-creates** on server start via `initDatabase()` - no migrations needed
- **JWT auth required** for most API routes

## Paca States (key validation)

Only `disponible` pacas can be sold. Backend rejects others.

| State | Color |
|-------|-------|
| disponible | `#2a9d8f` (teal) |
| separada | `#f4a261` (amber) |
| vendeur | `#e76f51` (terracotta) |

## CORS

Add `http://localhost:5173` to `ALLOWED_ORIGINS` in `server/.env`.

## API Routes

| Route | Description |
|-------|-------------|
| `/api/pacas` | Inventory CRUD |
| `/api/clientes` | Client CRUD |
| `/api/ventas` | Sales (multi-paca) |
| `/api/pagos` | Payments |
| `/api/cartera/:id` | Account status |
| `/api/dashboard/*` | Metrics |
| `/api/auth/*` | Login/register |

## Env Variables

```env
# server/.env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bodega_americana
DB_USER=postgres
DB_PASSWORD=tu_password
PORT=3001
JWT_SECRET=your-secret
ALLOWED_ORIGINS=http://localhost:5173
```

```env
# client/.env
VITE_API_URL=http://localhost:3001/api
```

## Testing

- **No lint/typecheck configured** - project lacks ESLint/TSC
- Playwright tests in `client/tests/`
- Jest backend tests exist but may be empty

## File Locations

- Server entry: `server/src/index.js`
- DB schema: `server/src/db/schema.sql` (auto-executes)
- Tailwind config: `tailwind.config.js` (root)
- Vite config: `vite.config.js` (root)