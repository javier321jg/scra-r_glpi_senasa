# Templates - Plantillas HTML

Plantillas Jinja2 que se utilizan en la aplicacion para renderizar paginas HTML.

## Archivos

### login.html

Pagina de autenticacion del sistema. Permite al usuario ingresar con una contrasena.

**Rutas que la usan:**
- GET/POST `/login` - Formulario y procesamiento de login

**Variables de contexto:**
- `error` - Mensaje de error si la autenticacion falla
- `now` - Fecha y hora actual

### email_tickets_report.html

Plantilla para generar reportes de tickets en email. Incluye:
- Informacion de tickets en curso
- Datos de BI (pronostico de picos, ranking de tecnicos)
- Estadisticas generales
- Tabla de tickets con detalles

**Rutas que la usan:**
- GET `/email_tickets_report` - Vista previa del reporte
- POST `/api/send-email` - Generacion del email con datos BI

**Variables de contexto:**
- `tickets` - Lista de tickets
- `fecha_actual` - Fecha actual
- `current_month` - Mes/ano actual
- `forecast` - Datos de pronostico de picos (BI)
- `forecast_summary` - Resumen del pronostico
- `technician_ranking` - Top 5 tecnicos por rendimiento

**Datos BI integrados:**
- Prediccion de picos para proximo periodo
- Ranking de rendimiento de tecnicos
- Metricas de TTR y performance score

### 404.html

Pagina de error cuando se solicita una ruta no existente.

**Rutas que la usan:**
- 404 - Error not found

---

## Integracion con Backend

Las plantillas se renderizen usando Flask:

```python
from flask import render_template

# Renderizar plantilla
return render_template('login.html', error=error, now=datetime.now())
```

## Datos de BI en Email

El email_tickets_report.html incluye datos de Inteligencia de Negocio:

```python
# En email_config.py
from analytics import get_picos_forecast
from db_tecnicos import get_tecnicos_ranking_bi

forecast = get_picos_forecast()       # Prediccion de picos
ranking = get_tecnicos_ranking_bi()   # Ranking de tecnicos

# Pasar al template
template_data['forecast'] = forecast.get('forecast', [])
template_data['technician_ranking'] = ranking[:5]
```

---

Ver README.md principal para mas informacion.
