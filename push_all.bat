@echo off
setlocal
echo ==============================================================
echo Inciando Push a Ambos Repositorios (Backend y Frontend)
echo ==============================================================

set /p commit_msg="Introduce el mensaje del commit: "

if "%commit_msg%"=="" (
    set commit_msg="Update repos"
)

echo.
echo [1/2] Verificando e subiendo Backend (carpeta server/)...
cd server
git status -s >nul 2>&1
if errorlevel 1 (
   echo El repositorio server no existe o hay un problema con git.
) else (
   git add .
   git commit -m "%commit_msg%"
   git push origin main
   echo Push del backend completado.
)
cd ..

echo.
echo [2/2] Verificando e subiendo Frontend (carpeta raiz)...
git add .
git commit -m "%commit_msg%"
git push origin main
echo Push del frontend completado.

echo.
echo ==============================================================
echo Proceso finalizado correctamente.
echo ==============================================================
pause
