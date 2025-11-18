# API - Web Scraper y DataManager

Este modulo contiene la logica del web scraper que extrae informacion de tickets y el DataManager que gestiona los datos en tiempo real.

## Contenido

- **api.py** - Scraper, DataManager y funciones principales

## Funcionalidades

### Web Scraper

- Extrae datos de tickets desde una fuente externa
- Procesa y normaliza los datos
- Almacena en SQLite y Redis
- Emite actualizaciones en tiempo real via Socket.IO

### DataManager

- Gestor centralizado de datos
- Manejo de buffer de datos crudos
- Cola de cambios pendientes
- Tracking de sesiones de clientes
- Deteccion de cambios mediante hash

## Uso

El scraper se inicia automaticamente cuando arranca la aplicacion Flask:

```python
from api.api import background_scraping, data_manager

# El scraper se ejecuta en un thread separado
# Los datos se actualizan automaticamente
```

## Configuracion

Las credenciales y configuracion del scraper se cargan desde variables de entorno:

```env
SCRAPER_ENABLED=True
SCRAPER_INTERVAL_SECONDS=300  # 5 minutos
```

## Flujo de Datos

```
Scraper (thread)
    |
    v
Raw Data Queue (DataManager)
    |
    v
SQLite DB + Redis Cache
    |
    v
Socket.IO emit tickets_update
    |
    v
Frontend (React) recibe actualizaciones
```

## Logging

Los logs del scraper se guardan en `scraper.log`

```bash
tail -f scraper.log
```

## Dependencias

- Selenium (para web scraping)
- BeautifulSoup (para parsing HTML)
- Redis (para cache)
- SQLite (base de datos)

---

Ver README.md principal para mas informacion.
