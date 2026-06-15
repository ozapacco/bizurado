@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Bizurado

echo ============================================
echo            BIZURADO - iniciando
echo ============================================
echo.

rem Primeira vez: instala dependencias se faltarem.
if not exist "node_modules" (
  echo Instalando dependencias pela primeira vez... pode demorar alguns minutos.
  call npm install
  echo.
)

rem Primeira vez (ou apos atualizacao de codigo): compila o app.
if not exist ".next" (
  echo Compilando o app... aguarde cerca de um minuto.
  call npm run build
  echo.
)

rem Libera a porta 3000 caso uma instancia antiga do Bizurado ainda esteja rodando.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr LISTENING ^| findstr ":3000"') do taskkill /F /PID %%p >nul 2>&1

echo Abrindo http://localhost:3000 no navegador...
echo Para PARAR o sistema, feche esta janela (ou pressione Ctrl+C).
echo.

rem Abre o navegador alguns segundos depois, quando o servidor ja subiu.
start "" cmd /c "timeout /t 5 >nul & start http://localhost:3000"

rem Liga o servidor (bloqueia esta janela enquanto roda).
call npm run start
