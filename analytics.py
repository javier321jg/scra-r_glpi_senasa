# analytics.py - Módulo de Inteligencia de Negocio (BI)

import logging
import json
import os
from datetime import datetime, timedelta
from db_sqlite import get_tickets_from_db
import redis

# Configurar logging
analytics_logger = logging.getLogger('analytics')
analytics_logger.setLevel(logging.INFO)

# Redis para almacenar resultados de BI
try:
    redis_client = redis.Redis(
        host=os.getenv('REDIS_HOST', 'localhost'),
        port=int(os.getenv('REDIS_PORT', 6379)),
        db=int(os.getenv('REDIS_DB', 0)),
        password=os.getenv('REDIS_PASSWORD', None) or None,
        socket_timeout=5,
        socket_connect_timeout=5
    )
    redis_client.ping()
    REDIS_AVAILABLE = True
except Exception as e:
    REDIS_AVAILABLE = False
    analytics_logger.warning(f"Redis no disponible para analytics: {str(e)}")


def get_picos_forecast():
    """
    Predice los picos de volumen de tickets para la próxima semana.

    Utiliza datos históricos de tickets para calcular patrones semanales
    y predecir el volumen esperado para los próximos 7 días.

    Returns:
        dict: Diccionario con predicción de picos por día y hora
    """
    try:
        analytics_logger.info("Generando predicción de picos de tickets...")

        # Intentar obtener datos procesados desde Redis (caché)
        if REDIS_AVAILABLE:
            try:
                cached_forecast = redis_client.get('analytics:forecast')
                if cached_forecast:
                    forecast_data = json.loads(cached_forecast)
                    # Validar si el caché tiene menos de 1 hora
                    cache_time = datetime.fromisoformat(forecast_data.get('generated_at', ''))
                    if datetime.now() - cache_time < timedelta(hours=1):
                        analytics_logger.info("Usando pronóstico en caché")
                        return forecast_data
            except Exception as e:
                analytics_logger.warning(f"Error al leer caché de pronóstico: {str(e)}")

        # Obtener tickets históricos de la BD
        try:
            import pandas as pd
            from sklearn.linear_model import LinearRegression
            import numpy as np
        except ImportError as imp_err:
            analytics_logger.warning(f"Pandas o Scikit-learn no disponibles: {str(imp_err)}")
            return {
                "status": "unavailable",
                "message": "Pandas y Scikit-learn son requeridos para el análisis",
                "generated_at": datetime.now().isoformat()
            }

        # Obtener todos los tickets (nuevos, espera, en curso, resueltos)
        all_tickets = []
        for ticket_type in ['nuevos', 'espera', 'curso', 'resueltos']:
            try:
                tickets = get_tickets_from_db(ticket_type)
                all_tickets.extend(tickets)
            except Exception as e:
                analytics_logger.warning(f"Error al obtener tickets de tipo {ticket_type}: {str(e)}")

        if not all_tickets:
            return {
                "status": "insufficient_data",
                "message": "No hay datos suficientes para generar predicción",
                "generated_at": datetime.now().isoformat()
            }

        # Procesar datos con Pandas
        df = pd.DataFrame(all_tickets)

        # Buscar columna de fecha de apertura (puede variar el nombre)
        date_column = None
        for col in ['Fecha_apertura', 'fecha_apertura', 'fecha_creacion', 'created_date']:
            if col in df.columns:
                date_column = col
                break

        if not date_column:
            analytics_logger.warning("No se encontró columna de fecha en los tickets")
            return {
                "status": "error",
                "message": "No se encontró información de fechas en los tickets",
                "generated_at": datetime.now().isoformat()
            }

        # Convertir a datetime
        df[date_column] = pd.to_datetime(df[date_column], errors='coerce')
        df = df.dropna(subset=[date_column])

        # Agrupar por día de la semana y hora
        df['dayofweek'] = df[date_column].dt.dayofweek
        df['hour'] = df[date_column].dt.hour
        df['date'] = df[date_column].dt.date

        # Contar tickets por día y hora
        daily_hourly_counts = df.groupby(['dayofweek', 'hour']).size().reset_index(name='count')
        daily_counts = df.groupby('dayofweek').size().reset_index(name='daily_total')

        # Crear predicción simple: promedio móvil de los últimos 7 días
        dates = df['date'].value_counts().sort_index()
        if len(dates) > 1:
            moving_avg = dates.rolling(window=7, min_periods=1).mean()
        else:
            moving_avg = dates

        # Proyectar los próximos 7 días
        forecast_days = []
        day_names = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

        for day_offset in range(7):
            future_date = datetime.now() + timedelta(days=day_offset)
            day_of_week = future_date.weekday()

            # Obtener valor promedio para este día de la semana
            day_data = daily_counts[daily_counts['dayofweek'] == day_of_week]
            daily_avg = day_data['daily_total'].mean() if not day_data.empty else dates.mean()

            # Obtener patrón horario para este día
            hourly_pattern = daily_hourly_counts[daily_hourly_counts['dayofweek'] == day_of_week]

            peak_hours = []
            if not hourly_pattern.empty:
                # Identificar horas pico (> que el promedio)
                avg_hourly = hourly_pattern['count'].mean()
                peak_hours = hourly_pattern[hourly_pattern['count'] > avg_hourly]['hour'].tolist()

            forecast_days.append({
                "date": future_date.strftime("%Y-%m-%d"),
                "day_name": day_names[day_of_week],
                "predicted_tickets": round(daily_avg, 1),
                "peak_hours": peak_hours,
                "confidence": 0.75
            })

        forecast_result = {
            "status": "success",
            "forecast": forecast_days,
            "summary": {
                "total_tickets_analyzed": len(df),
                "date_range": {
                    "start": df[date_column].min().strftime("%Y-%m-%d"),
                    "end": df[date_column].max().strftime("%Y-%m-%d")
                },
                "average_daily_tickets": round(dates.mean(), 1),
                "busiest_day": day_names[dates.idxmax().weekday()] if len(dates) > 0 else "N/A"
            },
            "generated_at": datetime.now().isoformat()
        }

        # Almacenar en Redis para caché
        if REDIS_AVAILABLE:
            try:
                redis_client.setex(
                    'analytics:forecast',
                    3600,  # 1 hora TTL
                    json.dumps(forecast_result)
                )
                analytics_logger.info("Pronóstico almacenado en caché")
            except Exception as e:
                analytics_logger.warning(f"Error al almacenar pronóstico en caché: {str(e)}")

        return forecast_result

    except Exception as e:
        analytics_logger.error(f"Error en get_picos_forecast: {str(e)}")
        return {
            "status": "error",
            "message": str(e),
            "generated_at": datetime.now().isoformat()
        }


def get_tickets_trend():
    """
    Calcula la tendencia de tickets en los últimos 30 días.

    Returns:
        dict: Información de tendencia por período
    """
    try:
        analytics_logger.info("Generando análisis de tendencia...")

        import pandas as pd

        all_tickets = []
        for ticket_type in ['nuevos', 'espera', 'curso', 'resueltos']:
            try:
                tickets = get_tickets_from_db(ticket_type)
                all_tickets.extend(tickets)
            except Exception as e:
                analytics_logger.warning(f"Error al obtener tickets: {str(e)}")

        if not all_tickets:
            return {
                "status": "insufficient_data",
                "message": "No hay datos para análisis de tendencia"
            }

        df = pd.DataFrame(all_tickets)

        # Buscar columna de fecha
        date_column = None
        for col in ['Fecha_apertura', 'fecha_apertura', 'fecha_creacion']:
            if col in df.columns:
                date_column = col
                break

        if not date_column:
            return {"status": "error", "message": "No se encontró información de fechas"}

        df[date_column] = pd.to_datetime(df[date_column], errors='coerce')

        # Filtrar últimos 30 días
        thirty_days_ago = datetime.now() - timedelta(days=30)
        df_recent = df[df[date_column] >= thirty_days_ago]

        if df_recent.empty:
            return {
                "status": "insufficient_data",
                "message": "No hay datos en los últimos 30 días"
            }

        # Agrupar por semana
        df_recent['week'] = df_recent[date_column].dt.isocalendar().week
        weekly_counts = df_recent.groupby('week').size()

        return {
            "status": "success",
            "trend": weekly_counts.to_dict(),
            "period": "last_30_days",
            "generated_at": datetime.now().isoformat()
        }

    except Exception as e:
        analytics_logger.error(f"Error en get_tickets_trend: {str(e)}")
        return {"status": "error", "message": str(e)}


if __name__ == "__main__":
    # Prueba del módulo
    logging.basicConfig(level=logging.INFO)

    forecast = get_picos_forecast()
    print("Pronóstico de Picos:")
    print(json.dumps(forecast, indent=2, ensure_ascii=False))

    trend = get_tickets_trend()
    print("\nTendencia:")
    print(json.dumps(trend, indent=2, ensure_ascii=False))
