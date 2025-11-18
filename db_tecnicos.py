import sqlite3
import os
import logging
from datetime import datetime

# Configurar logging específico para la BD de técnicos
tecnicos_logger = logging.getLogger('tecnicos_db')

# Ruta para la base de datos
DB_DIR = 'basededatos'
DB_PATH = os.path.join(DB_DIR, 'tickets_data.db')

def init_tecnicos_db():
    """Inicializa la tabla de técnicos en la base de datos SQLite"""
    try:
        # Asegurar que el directorio existe
        if not os.path.exists(DB_DIR):
            os.makedirs(DB_DIR)
            tecnicos_logger.info(f"Directorio creado: {DB_DIR}")
            
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Crear tabla para técnicos
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS tecnicos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT UNIQUE,
            cargo TEXT,
            area TEXT,
            email TEXT,
            telefono TEXT,
            anexo TEXT,
            whatsapp TEXT,
            especialidades TEXT,
            foto TEXT,
            estado TEXT,
            fecha_registro TEXT
        )
        ''')
        
        conn.commit()
        conn.close()
        tecnicos_logger.info(f"Tabla de técnicos inicializada correctamente en {DB_PATH}")
        return True
    except Exception as e:
        tecnicos_logger.error(f"Error al inicializar tabla de técnicos: {str(e)}")
        return False

def extraer_tecnicos_de_tickets():
    """Extrae técnicos únicos de todos los tickets y los guarda en la tabla de técnicos"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Obtener todos los técnicos asignados de todas las tablas de tickets
        tecnicos_unicos = set()
        
        for tabla in ['tickets_nuevos', 'tickets_espera', 'tickets_curso', 'tickets_resueltos']:
            cursor.execute(f"SELECT DISTINCT Asignado_a FROM {tabla} WHERE Asignado_a IS NOT NULL AND Asignado_a != ''")
            for row in cursor.fetchall():
                nombre_tecnico = row['Asignado_a']
                if nombre_tecnico and nombre_tecnico.strip():
                    tecnicos_unicos.add(nombre_tecnico.strip())
        
        # Fecha actual para el registro
        fecha_registro = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Para cada técnico, verificar si ya existe en la tabla de técnicos
        for nombre_tecnico in tecnicos_unicos:
            cursor.execute("SELECT id FROM tecnicos WHERE nombre = ?", (nombre_tecnico,))
            exists = cursor.fetchone()
            
            if not exists:
                # Determinar área basada en el nombre (esto es temporal, en producción debe ajustarse)
                area = asignar_area_por_nombre(nombre_tecnico)
                
                cursor.execute('''
                INSERT INTO tecnicos (
                    nombre, cargo, area, email, telefono, anexo, whatsapp, 
                    especialidades, foto, estado, fecha_registro
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    nombre_tecnico,
                    "Técnico de Soporte",  # Valor por defecto
                    area,
                    "",  # Email (vacío por defecto, se llenará en la web)
                    "",  # Teléfono (vacío por defecto)
                    "",  # Anexo (vacío por defecto)
                    "",  # WhatsApp (vacío por defecto)
                    "[]",  # Especialidades (lista vacía por defecto)
                    "",  # Foto (vacía por defecto)
                    "disponible",  # Estado por defecto
                    fecha_registro
                ))
        
        conn.commit()
        conn.close()
        tecnicos_logger.info("Técnicos extraídos y actualizados correctamente")
        return True
    except Exception as e:
        tecnicos_logger.error(f"Error al extraer técnicos de tickets: {str(e)}")
        return False

def asignar_area_por_nombre(nombre):
    """Asigna un área basada en el nombre del técnico (lógica temporal)"""
    nombre_lower = nombre.lower()
    
    if "red" in nombre_lower or "cisco" in nombre_lower or "conectividad" in nombre_lower:
        return "redes"
    elif "serv" in nombre_lower or "infra" in nombre_lower:
        return "infraestructura"
    elif "dev" in nombre_lower or "desarr" in nombre_lower or "program" in nombre_lower:
        return "software"
    elif "help" in nombre_lower or "soporte" in nombre_lower or "tecnico" in nombre_lower:
        return "help_desk"
    else:
        return "sistemas"  # Valor por defecto

def get_all_tecnicos():
    """Obtiene todos los técnicos de la base de datos"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM tecnicos ORDER BY nombre")
        
        tecnicos = []
        for row in cursor.fetchall():
            tecnico = dict(row)
            
            # Convertir especialidades de texto a lista
            if tecnico['especialidades'] and tecnico['especialidades'] != '[]':
                import json
                try:
                    tecnico['especialidades'] = json.loads(tecnico['especialidades'])
                except:
                    tecnico['especialidades'] = []
            else:
                tecnico['especialidades'] = []
                
            tecnicos.append(tecnico)
        
        conn.close()
        return tecnicos
    except Exception as e:
        tecnicos_logger.error(f"Error al obtener técnicos: {str(e)}")
        return []

def get_tecnico_by_nombre(nombre):
    """Obtiene un técnico por su nombre"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM tecnicos WHERE nombre = ?", (nombre,))
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            return None
        
        tecnico = dict(row)
        
        # Convertir especialidades de texto a lista
        if tecnico['especialidades'] and tecnico['especialidades'] != '[]':
            import json
            try:
                tecnico['especialidades'] = json.loads(tecnico['especialidades'])
            except:
                tecnico['especialidades'] = []
        else:
            tecnico['especialidades'] = []
        
        conn.close()
        return tecnico
    except Exception as e:
        tecnicos_logger.error(f"Error al obtener técnico por nombre: {str(e)}")
        return None

def update_tecnico(id, datos):
    """Actualiza los datos de un técnico"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Convertir especialidades de lista a texto JSON si existe
        if 'especialidades' in datos and isinstance(datos['especialidades'], list):
            import json
            datos['especialidades'] = json.dumps(datos['especialidades'])
        
        # Construir query de actualización dinámicamente
        campos = []
        valores = []
        
        for campo, valor in datos.items():
            campos.append(f"{campo} = ?")
            valores.append(valor)
        
        # Añadir ID al final de valores
        valores.append(id)
        
        query = f"UPDATE tecnicos SET {', '.join(campos)} WHERE id = ?"
        cursor.execute(query, valores)
        
        conn.commit()
        conn.close()
        
        tecnicos_logger.info(f"Técnico ID {id} actualizado correctamente")
        return True
    except Exception as e:
        tecnicos_logger.error(f"Error al actualizar técnico: {str(e)}")
        return False

def search_tecnicos(query, area=None):
    """Busca técnicos por nombre, cargo o especialidades"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        sql_query = "SELECT * FROM tecnicos WHERE 1=1"
        params = []
        
        # Filtrar por área si se especifica
        if area and area != 'all':
            sql_query += " AND area = ?"
            params.append(area)
        
        # Filtrar por texto si se especifica
        if query and query.strip():
            sql_query += " AND (nombre LIKE ? OR cargo LIKE ? OR especialidades LIKE ?)"
            search_param = f"%{query}%"
            params.extend([search_param, search_param, search_param])
        
        sql_query += " ORDER BY nombre"
        
        cursor.execute(sql_query, params)
        
        tecnicos = []
        for row in cursor.fetchall():
            tecnico = dict(row)
            
            # Convertir especialidades de texto a lista
            if tecnico['especialidades'] and tecnico['especialidades'] != '[]':
                import json
                try:
                    tecnico['especialidades'] = json.loads(tecnico['especialidades'])
                except:
                    tecnico['especialidades'] = []
            else:
                tecnico['especialidades'] = []
                
            tecnicos.append(tecnico)
        
        conn.close()
        return tecnicos
    except Exception as e:
        tecnicos_logger.error(f"Error al buscar técnicos: {str(e)}")
        return []

def get_tecnicos_ranking_bi():
    """
    Obtiene ranking de rendimiento de técnicos con métricas de BI.

    Calcula para cada técnico:
    - Número de tickets activos (en_curso)
    - TTR (Tiempo Promedio de Resolución)
    - Tickets asignados en las últimas 24 horas
    - Rendimiento promedio (basado en resolución rápida)

    Returns:
        list: Lista de técnicos ordenados por rendimiento (descendente)
    """
    try:
        from db_sqlite import get_tickets_from_db

        tecnicos_logger.info("Generando ranking de rendimiento de técnicos...")

        # Obtener todos los técnicos
        all_tecnicos = get_all_tecnicos()

        if not all_tecnicos:
            return []

        ranking_data = []

        for tecnico in all_tecnicos:
            nombre_tecnico = tecnico['nombre']

            # Contar tickets activos (en curso)
            tickets_en_curso = get_tickets_from_db('curso')
            active_tickets = [t for t in tickets_en_curso
                            if t.get('Asignado_a') == nombre_tecnico or
                               t.get('asignado_a') == nombre_tecnico]
            active_count = len(active_tickets)

            # Contar tickets asignados hoy (últimas 24 horas)
            from datetime import datetime, timedelta
            today_start = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

            # Obtener tickets resueltos para calcular TTR
            resolved_tickets = get_tickets_from_db('resueltos')
            tech_resolved = [t for t in resolved_tickets
                           if t.get('Asignado_a') == nombre_tecnico or
                              t.get('asignado_a') == nombre_tecnico]
            resolved_count = len(tech_resolved)

            # Calcular TTR (simplificado: promedio de días para resolver)
            ttr_days = 0.0
            if tech_resolved and resolved_count > 0:
                ttr_values = []
                for ticket in tech_resolved:
                    # Intentar calcular días entre fechas si existen
                    try:
                        fecha_apertura = ticket.get('Fecha_apertura') or ticket.get('fecha_apertura')
                        fecha_resolucion = ticket.get('Fecha_resolucion') or ticket.get('fecha_resolucion')

                        if fecha_apertura and fecha_resolucion:
                            f_apertura = datetime.strptime(str(fecha_apertura), "%Y-%m-%d %H:%M:%S" if ' ' in str(fecha_apertura) else "%Y-%m-%d")
                            f_resolucion = datetime.strptime(str(fecha_resolucion), "%Y-%m-%d %H:%M:%S" if ' ' in str(fecha_resolucion) else "%Y-%m-%d")
                            days = (f_resolucion - f_apertura).days
                            ttr_values.append(max(0.1, days))  # Mínimo 0.1 días
                    except:
                        pass

                if ttr_values:
                    ttr_days = sum(ttr_values) / len(ttr_values)

            # Calcular puntuación de rendimiento
            # Basado en: tickets resueltos, TTR bajo, y actividad actual
            performance_score = 0.0

            if resolved_count > 0:
                performance_score += min(50, resolved_count)  # Máx 50 puntos por resoluciones

            if ttr_days > 0:
                # Puntuación inversa: TTR bajo = más puntos
                ttr_score = max(0, 25 - (ttr_days * 2.5))  # Máx 25 puntos
                performance_score += ttr_score

            # Penalizar por muchos tickets activos (saturación)
            if active_count > 0:
                activity_score = max(0, 25 - active_count)
                performance_score += activity_score

            ranking_data.append({
                "nombre": nombre_tecnico,
                "area": tecnico.get('area', 'sistemas'),
                "cargo": tecnico.get('cargo', 'Técnico'),
                "email": tecnico.get('email', ''),
                "tickets_activos": active_count,
                "tickets_resueltos": resolved_count,
                "ttr_promedio_dias": round(ttr_days, 2),
                "performance_score": round(performance_score, 2),
                "estado": tecnico.get('estado', 'disponible')
            })

        # Ordenar por performance_score descendente
        ranking_data.sort(key=lambda x: x['performance_score'], reverse=True)

        # Añadir ranking (posición)
        for idx, tecnico in enumerate(ranking_data, 1):
            tecnico['ranking'] = idx

        tecnicos_logger.info(f"Ranking generado con {len(ranking_data)} técnicos")
        return ranking_data

    except Exception as e:
        tecnicos_logger.error(f"Error al generar ranking de técnicos: {str(e)}")
        import traceback
        tecnicos_logger.error(traceback.format_exc())
        return []

# Si se ejecuta directamente, inicializar la BD y poblar con técnicos
if __name__ == "__main__":
    # Configurar el logging básico
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    print("Inicializando base de datos de técnicos...")
    if init_tecnicos_db():
        print("Tabla de técnicos inicializada correctamente.")
        
        print("Extrayendo técnicos de tickets...")
        if extraer_tecnicos_de_tickets():
            print("Técnicos extraídos y guardados correctamente.")
            
            # Mostrar técnicos
            tecnicos = get_all_tecnicos()
            print(f"Total de técnicos: {len(tecnicos)}")
            for tecnico in tecnicos:
                print(f"- {tecnico['nombre']} ({tecnico['area']})")
        else:
            print("Error al extraer técnicos de tickets.")
    else:
        print("Error al inicializar la base de datos de técnicos.")