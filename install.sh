#!/bin/bash

# Script de instalación y configuración para desplegar la aplicación en Docker
# Este script configura el entorno y despliega la aplicación en Docker

# Colores para los mensajes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Iniciando la instalación de la aplicación Senasa Tickets ===${NC}"

# Verificar si Docker está instalado
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker no está instalado. Por favor, instale Docker antes de continuar.${NC}"
    echo "Para instalar Docker, visite: https://docs.docker.com/get-docker/"
    exit 1
fi

# Verificar si Docker Compose está instalado
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Docker Compose no está instalado. Por favor, instale Docker Compose antes de continuar.${NC}"
    echo "Para instalar Docker Compose, visite: https://docs.docker.com/compose/install/"
    exit 1
fi

echo -e "${GREEN}Docker y Docker Compose están correctamente instalados.${NC}"

# Crear directorios necesarios si no existen
echo -e "${YELLOW}Creando directorios necesarios...${NC}"
mkdir -p basededatos logs static templates gif api

# Verificar si existen archivos esenciales
if [ ! -f "app.py" ]; then
    echo -e "${RED}Error: No se encontró el archivo app.py.${NC}"
    echo "Por favor, asegúrese de que el script se ejecuta en el directorio correcto."
    exit 1
fi

# Generar un SECRET_KEY aleatorio para mayor seguridad
echo -e "${YELLOW}Generando una clave secreta aleatoria...${NC}"
SECRET_KEY=$(openssl rand -hex 32)
echo "SECRET_KEY=$SECRET_KEY" > .env

echo -e "${GREEN}Clave secreta generada y guardada en archivo .env${NC}"

# Construir la imagen Docker
echo -e "${YELLOW}Construyendo la imagen Docker. Esto puede tardar varios minutos...${NC}"
docker-compose build --no-cache

if [ $? -ne 0 ]; then
    echo -e "${RED}Error al construir la imagen Docker.${NC}"
    exit 1
fi

echo -e "${GREEN}Imagen Docker construida correctamente.${NC}"

# Iniciar contenedores en modo detached
echo -e "${YELLOW}Iniciando la aplicación en modo detached...${NC}"
docker-compose up -d

if [ $? -ne 0 ]; then
    echo -e "${RED}Error al iniciar los contenedores.${NC}"
    exit 1
fi

echo -e "${GREEN}Contenedores iniciados correctamente.${NC}"

# Verificar si la aplicación está funcionando
echo -e "${YELLOW}Verificando si la aplicación está en funcionamiento...${NC}"
sleep 10

if curl -s http://localhost:5000 > /dev/null; then
    echo -e "${GREEN}La aplicación está en funcionamiento correctamente.${NC}"
else
    echo -e "${RED}No se pudo acceder a la aplicación. Verifique los logs:${NC}"
    docker-compose logs app
fi

echo -e "${GREEN}=== Instalación completada ===${NC}"
echo -e "Puede acceder a la aplicación en: ${YELLOW}http://localhost:5000${NC}"
echo -e "Contraseña predeterminada: ${YELLOW}senasa2025${NC}"
echo -e "Puede ver los logs con: ${YELLOW}docker-compose logs -f app${NC}"
echo -e "Para detener la aplicación: ${YELLOW}docker-compose down${NC}"