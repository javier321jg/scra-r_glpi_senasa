import sqlite3
import os
import json
import logging
from datetime import datetime

# Configurar logging específico para la BD
db_logger = logging.getLogger('sqlite_db')

# Crear directorio para la base de datos si no existe
DB_DIR = 'basededatos'
if not os.path.exists(DB_DIR):
    try:
        os.makedirs(DB_DIR)
        db_logger.info(f"Directorio creado: {DB_DIR}")
    except Exception as e:
        db_logger.error(f"Error al crear directorio {DB_DIR}: {str(e)}")

# Ruta para la base de datos
DB_PATH = os.path.join(DB_DIR, 'tickets_data.db')

def init_db():
    """Inicializa la base de datos SQLite y crea las tablas con soporte para ticket_id"""
    try:
        # Asegurar que el directorio existe
        if not os.path.exists(DB_DIR):
            os.makedirs(DB_DIR)
            db_logger.info(f"Directorio creado: {DB_DIR}")
            
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Crear tabla para historial de actualizaciones
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS actualizaciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha_actualizacion TEXT,
            nuevos_count INTEGER,
            en_espera_count INTEGER,
            en_curso_count INTEGER,
            resueltos_count INTEGER
        )
        ''')
        
        # Definición común de columnas para todas las tablas de tickets
        common_columns = '''
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_interno TEXT,
            ticket_id TEXT,
            titulo TEXT,
            entidad TEXT,
            estado TEXT,
            fecha_apertura TEXT,
            ultima_modificacion TEXT,
            tiempo_resolucion TEXT,
            duracion TEXT,
            delay TEXT,
            solicitante TEXT,
            asignado_a TEXT,
            categoria TEXT,
            tiempo_adicional TEXT,
            tipo TEXT,
            medio TEXT,
            prioridad TEXT,
            ubicacion TEXT,
            fecha_registro TEXT
        '''
        
        # Tabla para tickets nuevos (valor=1)
        cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS tickets_nuevos (
            {common_columns}
        )
        ''')
        
        # Tabla para tickets en espera (valor=4)
        cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS tickets_espera (
            {common_columns}
        )
        ''')
        
        # Tabla para tickets en curso (valor=2)
        cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS tickets_curso (
            {common_columns}
        )
        ''')
        
        # Tabla para tickets resueltos (valor=5)
        cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS tickets_resueltos (
            {common_columns}
        )
        ''')
        
        # Verificar si las tablas necesitan actualización (agregar columna ticket_id)
        for tabla in ['tickets_nuevos', 'tickets_espera', 'tickets_curso', 'tickets_resueltos']:
            try:
                # Verificar si la columna ticket_id ya existe
                cursor.execute(f"PRAGMA table_info({tabla})")
                columns = [info[1] for info in cursor.fetchall()]
                
                # Agregar columnas faltantes si no existen
                if 'id_interno' not in columns:
                    cursor.execute(f"ALTER TABLE {tabla} ADD COLUMN id_interno TEXT")
                    db_logger.info(f"Columna 'id_interno' agregada a tabla {tabla}")
                    
                if 'ticket_id' not in columns:
                    cursor.execute(f"ALTER TABLE {tabla} ADD COLUMN ticket_id TEXT")
                    db_logger.info(f"Columna 'ticket_id' agregada a tabla {tabla}")
            except Exception as e:
                db_logger.error(f"Error al actualizar tabla {tabla}: {str(e)}")
        
        conn.commit()
        conn.close()
        db_logger.info(f"Base de datos inicializada correctamente en {DB_PATH}")
        return True
    except Exception as e:
        db_logger.error(f"Error al inicializar la base de datos: {str(e)}")
        return False


def guardar_tickets_en_db(data):
    """
    Guarda los tickets en la base de datos SQLite con soporte para ticket_id
    
    Args:
        data (dict): Diccionario con listas de tickets por categoría
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Registrar la actualización en historial
        cursor.execute('''
        INSERT INTO actualizaciones 
        (fecha_actualizacion, nuevos_count, en_espera_count, en_curso_count, resueltos_count) 
        VALUES (?, ?, ?, ?, ?)
        ''', (
            data.get('last_update', datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
            len(data.get('nuevos', [])),
            len(data.get('espera', [])),
            len(data.get('en_curso', [])),
            len(data.get('resueltos', []))
        ))
        
        # Fecha actual para el registro
        fecha_registro = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Mapeo de categorías de tickets a tablas
        categorias = {
            'nuevos': 'tickets_nuevos',
            'espera': 'tickets_espera',
            'en_curso': 'tickets_curso',
            'resueltos': 'tickets_resueltos'
        }
        
        # Para cada categoría, guardar tickets en su tabla correspondiente
        for categoria, tabla in categorias.items():
            if categoria in data and isinstance(data[categoria], list):
                # Primero limpiar registros antiguos
                cursor.execute(f"DELETE FROM {tabla}")
                
                for ticket in data[categoria]:
                    cursor.execute(f'''
                    INSERT INTO {tabla} (
                        id_interno, ticket_id, titulo, entidad, estado, fecha_apertura,
                        ultima_modificacion, tiempo_resolucion, duracion, delay,
                        solicitante, asignado_a, categoria, tiempo_adicional,
                        tipo, medio, prioridad, ubicacion, fecha_registro
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        ticket.get('ID_interno', ''),
                        ticket.get('ticket_id', ticket.get('ID', '')),  # Usar ticket_id o ID como respaldo
                        ticket.get('Título', ''),
                        ticket.get('Entidad', ''),
                        ticket.get('Estado', ''),
                        ticket.get('Fecha_apertura', ''),
                        ticket.get('Ultima_modificacion', ''),
                        ticket.get('Tiempo_resolucion', ''),
                        ticket.get('Duracion', ''),
                        ticket.get('Delay', ''),
                        ticket.get('Solicitante', ''),
                        ticket.get('Asignado_a', ''),
                        ticket.get('Categoria', ''),
                        ticket.get('Tiempo_adicional', ''),
                        ticket.get('Tipo', ''),
                        ticket.get('Medio', ''),
                        ticket.get('Prioridad', ''),
                        ticket.get('Ubicacion', ''),
                        fecha_registro
                    ))
        
        conn.commit()
        conn.close()
        db_logger.info(f"Tickets guardados en la base de datos {DB_PATH} correctamente")
        return True
    except Exception as e:
        db_logger.error(f"Error al guardar en base de datos: {str(e)}")
        return False
def get_tickets_from_db(categoria=None, limit=500):
    """
    Obtiene tickets desde la base de datos
    
    Args:
        categoria (str, optional): Categoría de tickets a obtener (nuevos, espera, en_curso, resueltos)
        limit (int, optional): Límite de registros a devolver
        
    Returns:
        list: Lista de tickets encontrados
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row  # Esto permite acceder a las columnas por nombre
        cursor = conn.cursor()
        
        if categoria == 'nuevos':
            cursor.execute("SELECT * FROM tickets_nuevos ORDER BY id DESC LIMIT ?", (limit,))
        elif categoria == 'espera':
            cursor.execute("SELECT * FROM tickets_espera ORDER BY id DESC LIMIT ?", (limit,))
        elif categoria == 'curso':
            cursor.execute("SELECT * FROM tickets_curso ORDER BY id DESC LIMIT ?", (limit,))
        elif categoria == 'resueltos':
            cursor.execute("SELECT * FROM tickets_resueltos ORDER BY id DESC LIMIT ?", (limit,))
        else:
            # Si no se especifica categoría, obtener los más recientes de todas las tablas
            cursor.execute("""
            SELECT 'nuevos' as tipo_ticket, * FROM tickets_nuevos
            UNION ALL
            SELECT 'espera' as tipo_ticket, * FROM tickets_espera
            UNION ALL
            SELECT 'en_curso' as tipo_ticket, * FROM tickets_curso
            UNION ALL
            SELECT 'resueltos' as tipo_ticket, * FROM tickets_resueltos
            ORDER BY fecha_registro DESC LIMIT ?
            """, (limit,))
        
        # Convertir los resultados a diccionarios
        resultados = []
        for row in cursor.fetchall():
            ticket_dict = {key: row[key] for key in row.keys()}
            resultados.append(ticket_dict)
        
        conn.close()
        return resultados
    except Exception as e:
        db_logger.error(f"Error al consultar tickets en la base de datos: {str(e)}")
        return []

def get_stats_from_db():
    """
    Obtiene estadísticas históricas de la base de datos
    
    Returns:
        dict: Estadísticas de tickets por día/semana/mes
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Obtener actualizaciones agrupadas por día
        cursor.execute("""
        SELECT 
            substr(fecha_actualizacion, 1, 10) as fecha,
            AVG(nuevos_count) as promedio_nuevos,
            AVG(en_espera_count) as promedio_espera,
            AVG(en_curso_count) as promedio_curso,
            AVG(resueltos_count) as promedio_resueltos,
            MAX(nuevos_count) as max_nuevos,
            MAX(en_espera_count) as max_espera,
            MAX(en_curso_count) as max_curso,
            MAX(resueltos_count) as max_resueltos,
            COUNT(*) as num_actualizaciones
        FROM actualizaciones
        GROUP BY substr(fecha_actualizacion, 1, 10)
        ORDER BY fecha DESC
        LIMIT 30
        """)
        
        resultados = []
        for row in cursor.fetchall():
            resultados.append({key: row[key] for key in row.keys()})
        
        conn.close()
        return resultados
    except Exception as e:
        db_logger.error(f"Error al obtener estadísticas de la base de datos: {str(e)}")
        return []

# Función para hacer copia de seguridad de la base de datos
def backup_database():
    """
    Crea una copia de seguridad de la base de datos
    
    Returns:
        str: Ruta del archivo de copia de seguridad o None si hay error
    """
    try:
        # Crear directorio de backups si no existe
        backup_dir = os.path.join(DB_DIR, 'backups')
        if not os.path.exists(backup_dir):
            os.makedirs(backup_dir)
            
        # Nombre de archivo con fecha y hora
        fecha_hora = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = os.path.join(backup_dir, f'tickets_data_backup_{fecha_hora}.db')
        
        # Conectar a la base de datos original
        conn = sqlite3.connect(DB_PATH)
        
        # Crear copia de seguridad
        backup_conn = sqlite3.connect(backup_file)
        conn.backup(backup_conn)
        
        # Cerrar conexiones
        backup_conn.close()
        conn.close()
        
        db_logger.info(f"Copia de seguridad creada: {backup_file}")
        return backup_file
    except Exception as e:
        db_logger.error(f"Error al crear copia de seguridad: {str(e)}")
        return None

# Si se ejecuta directamente, inicializar la BD
if __name__ == "__main__":
    # Configurar el logging básico si se ejecuta como script principal
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    print(f"Inicializando base de datos en {DB_PATH}...")
    if init_db():
        print("Base de datos inicializada correctamente.")
    else:
        print("Error al inicializar la base de datos.")