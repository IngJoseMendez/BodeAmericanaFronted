# Repositorios GitHub

## Backend (Servidor - Railway)
- **URL**: https://github.com/IngJoseMendez/BodeAmericana
- **Remote**: `server`
- **Branch**: `main`

## Frontend (Cliente - Vercel)  
- **URL**: https://github.com/IngJoseMendez/BodeAmericanaFronted
- **Remote**: `origin`
- **Branch**: `master` (hace push a `main`)

## Comandos para push

### Backend (servidor)
```bash
cd server
git push server main
```

### Frontend (cliente)
```bash
git push origin master:main --force
```

## Notas
- Frontend usa branch `master` local que hace push a `main` remota
- Sempre usar `--force` si hay conflictos
- Verificar en Vercel que el framework sea "Vite" y buildCommand "npm run build"