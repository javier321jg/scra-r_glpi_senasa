# ticket_middleware.py
import logging
import sqlite3
from datetime import datetime
import os
from flask import jsonify

# Configuración de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("ticket_middleware.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('ticket_middleware')

# Ruta para la base de datos
DB_DIR = 'basededatos'
DB_PATH = os.path.join(DB_DIR, 'tickets_data.db')

def format_date(date_str):
    """
    Formatea la fecha correctamente según el formato esperado
    """
    try:
        # Intentar varios formatos posibles
        formats_to_try = [
            "%Y-%m-%d %H:%M:%S",
            "%d/%m/%Y %H:%M:%S",
            "%d-%m-%Y %H:%M:%S",
            "%Y-%m-%d %H:%M"
        ]
        
        for fmt in formats_to_try:
            try:
                # Intentar parsear la fecha con el formato actual
                dt = datetime.strptime(date_str, fmt)
                # Convertir a formato estándar para el frontend
                return dt.strftime("%d-%m-%Y %H:%M")
            except ValueError:
                continue
        
        # Si ninguno funciona, devolver la fecha original
        return date_str
    except Exception as e:
        logger.error(f"Error al formatear fecha '{date_str}': {str(e)}")
        return date_str

def get_tickets_with_processing(categoria=None, limit=500, sort_by_date=True):
    """
    Obtiene tickets desde la base de datos con procesamiento adicional
    
    Args:
        categoria (str, optional): Categoría de tickets a obtener (nuevos, espera, curso, resueltos)
        limit (int, optional): Límite de registros a devolver
        sort_by_date (bool, optional): Si es True, ordena por fecha más reciente
        
    Returns:
        list: Lista de tickets procesados
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Determinar la orden de ordenamiento
        order_by = "fecha_apertura DESC, ultima_modificacion DESC" if sort_by_date else "id DESC"
        
        if categoria == 'nuevos':
            cursor.execute(f"SELECT * FROM tickets_nuevos ORDER BY {order_by} LIMIT ?", (limit,))
        elif categoria == 'espera':
            cursor.execute(f"SELECT * FROM tickets_espera ORDER BY {order_by} LIMIT ?", (limit,))
        elif categoria == 'curso':
            cursor.execute(f"SELECT * FROM tickets_curso ORDER BY {order_by} LIMIT ?", (limit,))
        elif categoria == 'resueltos':
            cursor.execute(f"SELECT * FROM tickets_resueltos ORDER BY {order_by} LIMIT ?", (limit,))
        else:
            # Si no se especifica categoría, obtener los más recientes de todas las tablas
            cursor.execute(f"""
            SELECT 'nuevos' as tipo_ticket, * FROM tickets_nuevos
            UNION ALL
            SELECT 'espera' as tipo_ticket, * FROM tickets_espera
            UNION ALL
            SELECT 'curso' as tipo_ticket, * FROM tickets_curso
            UNION ALL
            SELECT 'resueltos' as tipo_ticket, * FROM tickets_resueltos
            ORDER BY fecha_apertura DESC, ultima_modificacion DESC LIMIT ?
            """, (limit,))
        
        # Procesar los resultados
        resultados = []
        for row in cursor.fetchall():
            # Convertir a diccionario
            ticket_dict = {key: row[key] for key in row.keys()}
            
            # Asegurar consistencia de campos entre API y frontend
            if 'titulo' in ticket_dict and 'Título' not in ticket_dict:
                ticket_dict['Título'] = ticket_dict['titulo']
            if 'ticket_id' in ticket_dict and 'ID' not in ticket_dict:
                ticket_dict['ID'] = ticket_dict['ticket_id']
            
            resultados.append(ticket_dict)
        
        conn.close()
        return resultados
    except Exception as e:
        logger.error(f"Error al consultar tickets en la base de datos: {str(e)}")
        return []

def register_improved_routes(app):
    """
    Registra rutas mejoradas en la aplicación Flask
    """
    @app.route('/api/tickets/improved', methods=['GET'])
    def get_improved_tickets():
        from flask import request
        tipo = request.args.get('tipo', None)
        
        # Mapear 'en_curso' a 'curso' para la base de datos
        if tipo == 'en_curso':
            db_tipo = 'curso'
        else:
            db_tipo = tipo
            
        tickets = get_tickets_with_processing(db_tipo, sort_by_date=True)
        
        # Contar tickets por categoría
        categorias = ['nuevos', 'espera', 'curso', 'resueltos']
        counts = {}
        
        for cat in categorias:
            cat_tickets = get_tickets_with_processing(cat, limit=1000)
            counts[cat if cat != 'curso' else 'en_curso'] = len(cat_tickets)
        
        response = {
            "tickets": tickets,
            "counts": counts,
            "last_update": datetime.now().strftime("%d-%m-%Y %H:%M:%S")
        }
        
        return jsonify(response)
    
    logger.info("Rutas mejoradas registradas en la aplicación Flask")
    return True