@echo off
title Dotin - Iniciar Todo
echo ==============================================
echo       Lanzando DOTIN (Servidor + Cliente)
echo ==============================================

echo Iniciando Servidor Rust...
start "Dotin Servidor (Rust)" cmd /c "cd server && cargo run"

echo Iniciando Cliente Three.js...
start "Dotin Cliente (Vite/Three.js)" cmd /c "cd client && npm run dev"

timeout /t 3 >nul
echo Abriendo juego en el navegador...
start http://localhost:5173

echo ==============================================
echo ¡Listo! Los servidores estan en ejecucion.
echo ==============================================
