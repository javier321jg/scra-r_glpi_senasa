@echo off
setlocal

echo === Iniciando la instalacion de la aplicacion Senasa Tickets ===

REM Verificar si Docker está instalado
where docker >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Docker no esta instalado. Por favor, instale Docker antes de continuar.
    echo Para instalar Docker, visite: https://docs.docker.com/get-docker/
    exit /b 1
)

REM Verificar si Docker Compose está instalado
where docker-compose >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Docker Compose no esta instalado. Por favor, instale Docker Compose antes de continuar.
    echo Para instalar Docker Compose, visite: https://docs.docker.com/compose/install/
    exit /b 1
)

echo Docker y Docker Compose estan correctamente instalados.

REM Crear directorios necesarios si no existen
echo Creando directorios necesarios...
if not exist basededatos mkdir basededatos
if not exist logs mkdir logs
if not exist static mkdir static
if not exist templates mkdir templates
if not exist gif mkdir gif
if not exist api mkdir api

REM Verificar si existen archivos esenciales
if not exist app.py (
    echo ERROR: No se encontro el archivo app.py.
    echo Por favor, asegurese de que el script se ejecuta en el directorio correcto.
    exit /b 1
)

REM Generar un SECRET_KEY aleatorio para mayor seguridad
echo Generando una clave secreta aleatoria...
set SECRET_KEY=
for /L %%i in (1,1,32) do call :append_random_char
(
echo SECRET_KEY=%SECRET_KEY%
) > .env

echo Clave secreta generada y guardada en archivo .env

REM Construir la imagen Docker
echo Construyendo la imagen Docker. Esto puede tardar varios minutos...
docker-compose build --no-cache

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Error al construir la imagen Docker.
    exit /b 1
)

echo Imagen Docker construida correctamente.

REM Iniciar contenedores en modo detached
echo Iniciando la aplicacion en modo detached...
docker-compose up -d

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Error al iniciar los contenedores.
    exit /b 1
)

echo Contenedores iniciados correctamente.

REM Verificar si la aplicación está funcionando
echo Verificando si la aplicacion esta en funcionamiento...
timeout /t 10 /nobreak > nul

curl -s http://localhost:5000 > nul
if %ERRORLEVEL% EQU 0 (
    echo La aplicacion esta en funcionamiento correctamente.
) else (
    echo No se pudo acceder a la aplicacion. Verifique los logs:
    docker-compose logs app
)

echo === Instalacion completada ===
echo Puede acceder a la aplicacion en: http://localhost:5000
echo Contrasena predeterminada: senasa2025
echo Puede ver los logs con: docker-compose logs -f app
echo Para detener la aplicacion: docker-compose down

exit /b 0

:append_random_char
set chars=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz
set /a random_index=%random% %% 62
set SECRET_KEY=%SECRET_KEY%%chars:~%random_index%,1%
goto :eof