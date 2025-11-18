@echo off
REM Script de instalacion automatica para Windows
REM SENASA Ticket Tracking System

setlocal enabledelayedexpansion

echo.
echo ==========================================
echo SENASA Ticket Tracking System - Setup
echo ==========================================
echo.

REM Verificar que estamos en la carpeta correcta
if not exist "requirements.txt" (
    echo ERROR: Este script debe ejecutarse desde la raiz del proyecto
    echo Uso: cd C:\ruta\a\scra-r_glpi_senasa ^&^& setup.bat
    pause
    exit /b 1
)

REM 1. Crear archivo .env
echo [1/5] Creando archivo .env...
if not exist ".env" (
    copy .env.example .env
    echo ✓ Archivo .env creado
    echo.
    echo IMPORTANTE: Edita .env con tus datos reales:
    echo - ADMIN_PASSWORD
    echo - SMTP_USER y SMTP_PASSWORD
    echo - EMAIL_TO
    echo.
    pause
) else (
    echo ✓ Archivo .env ya existe
)

REM 2. Crear entorno virtual
echo.
echo [2/5] Creando entorno virtual...
if not exist "venv" (
    python -m venv venv
    echo ✓ Entorno virtual creado
) else (
    echo ✓ Entorno virtual ya existe
)

REM 3. Activar entorno virtual
echo.
echo [3/5] Activando entorno virtual...
call venv\Scripts\activate.bat
echo ✓ Entorno virtual activado

REM 4. Instalar dependencias
echo.
echo [4/5] Instalando dependencias Python...
python -m pip install --upgrade pip >nul 2>&1
pip install -r requirements.txt >nul 2>&1
echo ✓ Dependencias instaladas

REM 5. Inicializar base de datos
echo.
echo [5/5] Inicializando base de datos...
python init_tecnicos.py
echo ✓ Base de datos inicializada

echo.
echo ==========================================
echo SETUP COMPLETADO!
echo ==========================================
echo.
echo PROXIMOS PASOS:
echo.
echo 1. Asegurate que Redis esta corriendo:
echo    - Instala Redis desde https://github.com/microsoftarchive/redis/releases
echo    - O usa Docker:
echo      docker run -d -p 6379:6379 redis:latest
echo.
echo 2. Inicia el backend:
echo    - Abre una terminal en la carpeta del proyecto
echo    - Ejecuta: venv\Scripts\activate.bat
echo    - Luego: python app.py
echo.
echo 3. En otra terminal, inicia el frontend (opcional):
echo    - cd frontend-template
echo    - npm install
echo    - npm run dev
echo.
echo ==========================================
echo.
pause
