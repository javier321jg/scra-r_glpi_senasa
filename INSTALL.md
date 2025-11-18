# Guia de Instalacion - SENASA Ticket Tracking System

Sigue este tutorial paso a paso para clonar el repositorio y ejecutar el proyecto.

---

## PASO 1: CLONAR EL REPOSITORIO

### Opcion A: Clonar desde GitHub (recomendado)

```bash
# Navega a la carpeta donde quieres el proyecto
cd ~/Proyectos

# Clona el repositorio
git clone https://github.com/javier321jg/scra-r_glpi_senasa.git

# Entra a la carpeta del proyecto
cd scra-r_glpi_senasa

# Asegúrate de estar en la rama correcta
git checkout claude/modernize-senasa-headless-01PXrL1Cn2LS6LvtVEyJR763
```

### Opcion B: Si ya tienes los archivos

```bash
# Solo entra a la carpeta
cd /ruta/a/scra-r_glpi_senasa
```

---

## PASO 2: CREAR ARCHIVO .env

### A. Copiar el archivo de ejemplo

```bash
# Copia el archivo .env.example a .env
cp .env.example .env
```

### B. Editar el archivo .env con tus datos

Abre el archivo `.env` en tu editor preferido:

```bash
# En Linux/macOS
nano .env

# En Windows (Bloc de notas)
notepad .env
```

### C. Cambiar estos valores IMPORTANTES

Busca estas lineas y cambialas con tus datos reales:

```env
# 1. CAMBIAR CONTRASENA DE ADMIN
ADMIN_PASSWORD=CAMBIAR_A_UNA_CONTRASENA_SEGURA

# 2. CAMBIAR DATOS DE SMTP (Email)
SMTP_SERVER=mail.senasa.gob.pe         # O tu servidor SMTP
SMTP_USER=tu_email_real@senasa.gob.pe  # Tu email
SMTP_PASSWORD=tu_contrasena_real       # Tu contrasena de email

# 3. CAMBIAR DESTINATARIO DE REPORTES
EMAIL_TO=destino_real@example.com      # Email donde recibir reportes

# 4. CAMBIAR CLAVE SECRETA (produccion)
FLASK_SECRET_KEY=una_clave_muy_larga_y_segura_aqui
```

### Ejemplo de .env lleno:

```env
FLASK_SECRET_KEY=my_super_secret_key_12345
ADMIN_PASSWORD=MiContrasenaMuySeguiraAqui123!

SMTP_SERVER=mail.senasa.gob.pe
SMTP_PORT=587
SMTP_USER=juan.perez@senasa.gob.pe
SMTP_PASSWORD=miContrasenaSMTP123

EMAIL_TO=reportes@empresa.com
EMAIL_CC=
EMAIL_SUBJECT=Reporte Diario de Tickets - SENASA
EMAIL_MESSAGE=Hola, adjunto el reporte diario de tickets en curso.

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=

ENABLE_SCHEDULE=True
SCHEDULE_TIMES=08:00,16:00
INCLUDE_WEEKENDS=True

SCRAPER_ENABLED=True
SCRAPER_INTERVAL_SECONDS=300

DB_PATH=basededatos/tickets_data.db

FLASK_ENV=development
DEBUG=False
LOG_LEVEL=INFO
```

---

## PASO 3: INSTALAR DEPENDENCIAS PYTHON

### A. Crear entorno virtual (recomendado)

```bash
# Crear entorno virtual
python3 -m venv venv

# Activar entorno (Linux/macOS)
source venv/bin/activate

# Activar entorno (Windows)
venv\Scripts\activate
```

### B. Instalar las dependencias

```bash
# Instalar todas las dependencias del archivo requirements.txt
pip install -r requirements.txt

# Si hay error, actualiza pip primero
pip install --upgrade pip
pip install -r requirements.txt
```

---

## PASO 4: INICIALIZAR LA BASE DE DATOS

```bash
# Ejecutar el script de inicializacion
python init_tecnicos.py

# Deberias ver un mensaje como:
# Inicializando base de datos de tecnicos...
# Tabla de tecnicos inicializada correctamente.
```

---

## PASO 5: INICIAR REDIS (requerido)

Redis es necesario para el cache y Socket.IO.

### Opcion A: Redis local (si esta instalado)

```bash
# Iniciar Redis
redis-server

# Deberias ver:
# * Ready to accept connections
```

### Opcion B: Redis con Docker (recomendado)

```bash
# Instalar Docker primero desde https://docker.com

# Iniciar Redis en Docker
docker run -d -p 6379:6379 redis:latest

# Ver que esta corriendo
docker ps
```

### Opcion C: Usar Redis en la nube

```bash
# Puedes usar un servicio como Redis Cloud
# Luego cambiar en .env:
REDIS_HOST=tu-host-redis-cloud.com
REDIS_PORT=tu-puerto
REDIS_PASSWORD=tu-contrasena
```

---

## PASO 6: INICIAR EL BACKEND

En una terminal (con venv activado):

```bash
# Asegurate de estar en la carpeta del proyecto
cd /ruta/a/scra-r_glpi_senasa

# Ejecuta la aplicacion
python app.py
```

### Deberias ver algo como:

```
 * Serving Flask app 'app'
 * Debug mode: off
 * Running on http://127.0.0.1:5000
 * Socket.IO server started
```

Si ves este mensaje, EL BACKEND ESTA CORRIENDO!

El API estara disponible en: **http://localhost:5000**

---

## PASO 7: PRUEBA EL BACKEND (opcional)

En otra terminal, prueba que funciona:

```bash
# Obtener todos los tickets
curl http://localhost:5000/api/tickets

# Obtener ranking de tecnicos (BI)
curl http://localhost:5000/api/tecnicos/ranking

# Obtener pronostico de picos (BI)
curl http://localhost:5000/api/analytics/picos

# Ver estado de Redis
curl http://localhost:5000/api/system/redis-status
```

---

## PASO 8: INICIAR EL FRONTEND (opcional)

Si quieres usar el frontend React:

En otra terminal:

```bash
# Entra a la carpeta frontend
cd frontend-template

# Instala dependencias Node
npm install

# Inicia el servidor de desarrollo
npm run dev
```

Deberias ver:
```
Local:   http://localhost:3000
```

Abre http://localhost:3000 en tu navegador.

---

## RESUMEN FINAL

Deberia tener 3 terminales abiertas:

```
Terminal 1: Backend Flask
$ python app.py
Corriendo en: http://localhost:5000

Terminal 2: Redis
$ redis-server
O: docker run -d -p 6379:6379 redis:latest

Terminal 3: Frontend React (opcional)
$ cd frontend-template && npm run dev
Corriendo en: http://localhost:3000
```

---

## TROUBLESHOOTING

### Error: ModuleNotFoundError: No module named 'flask'

**Solucion:**
```bash
# Asegurate que el venv esta activado
source venv/bin/activate

# Reinstala las dependencias
pip install -r requirements.txt
```

### Error: Could not connect to Redis

**Solucion:**
```bash
# Verifica que Redis esta corriendo
redis-cli ping

# Si no funciona, inicia Redis
redis-server

# O con Docker
docker run -d -p 6379:6379 redis:latest
```

### Error: Port 5000 already in use

**Solucion:**
```bash
# Mata el proceso en puerto 5000 (Linux/macOS)
lsof -i :5000
kill -9 <PID>

# O cambia el puerto en app.py
# Busca la linea: app.run(port=5000)
# Y cambiala a: app.run(port=5001)
```

### Error: .env not found

**Solucion:**
```bash
# Copia el archivo de ejemplo
cp .env.example .env

# Edita con tus datos
nano .env
```

---

## DOCUMENTACION ADICIONAL

Despues de tener todo funcionando, lee:

1. **README.md** - Guia principal completa
2. **FRONTEND_STRUCTURE.md** - Estructura del frontend React
3. **MODERNIZATION_SUMMARY.md** - Cambios tecnicos
4. **api/README.md** - Documentacion del API
5. **basededatos/README.md** - Info de la BD

---

## COMANDOS RAPIDOS

```bash
# Activar entorno virtual
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Inicializar BD
python init_tecnicos.py

# Iniciar Redis (Docker)
docker run -d -p 6379:6379 redis:latest

# Iniciar Backend
python app.py

# Iniciar Frontend
cd frontend-template && npm install && npm run dev

# Ver logs en tiempo real
tail -f app.log

# Probar API
curl http://localhost:5000/api/tickets
```

---

**LISTO! Tu proyecto SENASA esta funcionando!**

Proximos pasos:
1. Accede a http://localhost:5000 (Backend)
2. Accede a http://localhost:3000 (Frontend)
3. Prueba los endpoints
4. Explora la documentacion
5. Desarrolla tus features

---

Cualquier duda, consulta el README.md o la seccion Troubleshooting.
