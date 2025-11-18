#!/bin/bash

# Script de instalacion automatica para SENASA Ticket Tracking System
# Uso: bash setup.sh

set -e  # Salir si hay error

echo "=========================================="
echo "SENASA Ticket Tracking System - Setup"
echo "=========================================="
echo ""

# Verificar que estamos en la carpeta correcta
if [ ! -f "requirements.txt" ]; then
    echo "ERROR: Este script debe ejecutarse desde la raiz del proyecto"
    echo "Uso: cd /ruta/a/scra-r_glpi_senasa && bash setup.sh"
    exit 1
fi

# 1. Crear archivo .env
echo "[1/5] Creando archivo .env..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "✓ Archivo .env creado"
    echo "  IMPORTANTE: Edita .env con tus datos reales:"
    echo "  - ADMIN_PASSWORD"
    echo "  - SMTP_USER y SMTP_PASSWORD"
    echo "  - EMAIL_TO"
    echo ""
    read -p "Presiona Enter cuando hayas editado .env..."
else
    echo "✓ Archivo .env ya existe"
fi

# 2. Crear entorno virtual
echo ""
echo "[2/5] Creando entorno virtual..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "✓ Entorno virtual creado"
else
    echo "✓ Entorno virtual ya existe"
fi

# 3. Activar entorno virtual
echo ""
echo "[3/5] Activando entorno virtual..."
source venv/bin/activate
echo "✓ Entorno virtual activado"

# 4. Instalar dependencias
echo ""
echo "[4/5] Instalando dependencias Python..."
pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt > /dev/null 2>&1
echo "✓ Dependencias instaladas"

# 5. Inicializar base de datos
echo ""
echo "[5/5] Inicializando base de datos..."
python init_tecnicos.py
echo "✓ Base de datos inicializada"

echo ""
echo "=========================================="
echo "SETUP COMPLETADO!"
echo "=========================================="
echo ""
echo "PROXIMOS PASOS:"
echo ""
echo "1. Asegurate que Redis esta corriendo:"
echo "   redis-server"
echo "   O en Docker:"
echo "   docker run -d -p 6379:6379 redis:latest"
echo ""
echo "2. Inicia el backend:"
echo "   source venv/bin/activate"
echo "   python app.py"
echo ""
echo "3. En otra terminal, inicia el frontend (opcional):"
echo "   cd frontend-template"
echo "   npm install"
echo "   npm run dev"
echo ""
echo "=========================================="
