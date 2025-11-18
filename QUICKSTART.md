# QUICKSTART - Inicio Rapido

Sigue estos pasos para tener el proyecto funcionando en 5 minutos.

---

## OPCION 1: AUTOMATICA (Recomendado)

### Linux / macOS

```bash
# 1. Clona el repositorio
git clone https://github.com/javier321jg/scra-r_glpi_senasa.git
cd scra-r_glpi_senasa

# 2. Ejecuta el script de setup
bash setup.sh

# Cuando te pida, edita el archivo .env con tus datos:
# - ADMIN_PASSWORD
# - SMTP_USER y SMTP_PASSWORD
# - EMAIL_TO
```

### Windows

```bash
# 1. Clona el repositorio
git clone https://github.com/javier321jg/scra-r_glpi_senasa.git
cd scra-r_glpi_senasa

# 2. Ejecuta el script de setup
setup.bat

# Cuando te pida, edita el archivo .env con tus datos
```

---

## OPCION 2: MANUAL (Paso a paso)

```bash
# 1. Clonar repositorio
git clone https://github.com/javier321jg/scra-r_glpi_senasa.git
cd scra-r_glpi_senasa

# 2. Crear y activar entorno virtual
python3 -m venv venv

# Linux/macOS
source venv/bin/activate

# Windows
venv\Scripts\activate

# 3. Crear archivo .env
cp .env.example .env

# 4. EDITAR .env CON TUS DATOS (importante!)
# Abre .env y cambia:
# - ADMIN_PASSWORD=tu_contrasena
# - SMTP_USER=tu_email@senasa.gob.pe
# - SMTP_PASSWORD=tu_contrasena_smtp
# - EMAIL_TO=destino@example.com

# 5. Instalar dependencias
pip install -r requirements.txt

# 6. Inicializar BD
python init_tecnicos.py

# 7. Iniciar Redis (en otra terminal)
redis-server
# O con Docker:
docker run -d -p 6379:6379 redis:latest

# 8. Iniciar Backend (en la primera terminal)
python app.py

# 9. Abrir en navegador
# Backend: http://localhost:5000
# Frontend: http://localhost:3000 (opcional)
```

---

## ARCHIVO .env - EJEMPLO

Abre `.env` y pon tus datos en estas lineas:

```env
# Tu contrasena de admin
ADMIN_PASSWORD=MiContrasenaSuperSegura123!

# Datos de tu email SMTP
SMTP_SERVER=mail.senasa.gob.pe
SMTP_USER=tu_email@senasa.gob.pe
SMTP_PASSWORD=tu_contrasena_smtp

# Donde recibir reportes
EMAIL_TO=destino@example.com

# Cambiar en produccion
FLASK_SECRET_KEY=una_clave_muy_larga_y_aleatoria_aqui

# Redis (local por defecto)
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## VERIFICAR QUE FUNCIONA

Abre otra terminal y prueba:

```bash
# Obtener tickets
curl http://localhost:5000/api/tickets

# Ranking de tecnicos (BI)
curl http://localhost:5000/api/tecnicos/ranking

# Pronostico de picos (BI)
curl http://localhost:5000/api/analytics/picos
```

---

## FRONTEND (Opcional)

Si quieres el Frontend React:

```bash
# En otra terminal
cd frontend-template
npm install
npm run dev

# Abre en navegador
# http://localhost:3000
```

---

## PROBLEMAS COMUNES

### Error: Module not found

```bash
# Asegurate que el venv esta activado
source venv/bin/activate
# O en Windows:
venv\Scripts\activate

# Reinstala dependencias
pip install -r requirements.txt
```

### Error: Redis no esta disponible

```bash
# Inicia Redis
redis-server

# O en Docker
docker run -d -p 6379:6379 redis:latest
```

### Puerto 5000 en uso

```bash
# Mata el proceso
lsof -i :5000
kill -9 <PID>

# O cambia el puerto en app.py
# Busca: app.run(port=5000)
# Cambia a: app.run(port=5001)
```

---

## DOCUMENTACION COMPLETA

Para documentacion detallada, lee:

- **INSTALL.md** - Guia completa de instalacion
- **README.md** - Guia principal del proyecto
- **FRONTEND_STRUCTURE.md** - Arquitectura de React

---

## RESUMEN - LAS 3 TERMINALES

```
Terminal 1 - Backend:
$ python app.py
http://localhost:5000

Terminal 2 - Redis:
$ redis-server
O: docker run -d -p 6379:6379 redis:latest

Terminal 3 - Frontend (opcional):
$ cd frontend-template && npm run dev
http://localhost:3000
```

---

LISTO! Ya tienes SENASA corriendo!
