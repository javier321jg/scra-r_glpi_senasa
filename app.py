import sys
import logging
# IMPORTANTE: monkey patching al inicio, antes de otros imports
from gevent import monkey
monkey.patch_all()

sys.setrecursionlimit(5000)

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("app.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Importar otros módulos después del monkey patching
import ssl
import requests
import base64
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, request, send_from_directory, session, redirect, url_for
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from api.api import background_scraping, data_manager
import threading
import os
import traceback
import uuid
from apscheduler.schedulers.background import BackgroundScheduler
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import time
import json
from functools import wraps  # Añadido para el decorador login_required

# Función de log para diagnóstico
def log_data_structure(data, prefix=""):
    """Log detallado de la estructura de datos"""
    if not data:
        logger.info(f"{prefix} - Datos vacíos")
        return
    
    # Log de la estructura general
    logger.info(f"{prefix} - Estructura de datos: {type(data)}")
    logger.info(f"{prefix} - Claves disponibles: {list(data.keys()) if isinstance(data, dict) else 'No es diccionario'}")
    
    # Log de conteos por categoría si existen
    for category in ['nuevos', 'espera', 'en_curso', 'curso', 'resueltos']:
        if isinstance(data, dict) and category in data:
            count = len(data[category]) if isinstance(data[category], list) else "No es lista"
            logger.info(f"{prefix} - Categoría {category}: {count} tickets")

# IMPORTANTE: Definir la función redis_listener antes de usarla
def redis_listener():
    """Escucha mensajes de Redis y los reenvía a clientes por Socket.io"""
    logger.info("Iniciando listener de Redis")
    try:
        for message in redis_pubsub.listen():
            try:
                if message['type'] == 'message':
                    channel = message['channel'].decode('utf-8')
                    logger.info(f"Mensaje recibido en canal: {channel}")
                    
                    data = json.loads(message['data'].decode('utf-8'))
                    logger.info(f"Datos recibidos en canal {channel}: {data.keys() if isinstance(data, dict) else 'No es diccionario'}")
                    
                    if channel == 'tickets:updates' and data.get('status') == 'updated':
                        # Si hay una actualización, obtener los datos más recientes
                        latest_data = redis_client.get('tickets:latest')
                        if latest_data:
                            try:
                                logger.info(f"Datos crudos de Redis (primeros 100 bytes): {latest_data[:100]}...")
                                tickets_data = json.loads(latest_data)
                                log_data_structure(tickets_data, "REDIS_DATOS")
                                
                                # Actualizar el caché global
                                global tickets_cache
                                tickets_cache = tickets_data
                                
                                # Verificar categorías y conteos
                                logger.info(f"Enviando actualizaciones - Estructura: nuevos:{len(tickets_data.get('nuevos', []))}, "
                                        f"curso/en_curso:{len(tickets_data.get('curso', []) or tickets_data.get('en_curso', []))}, "
                                        f"espera:{len(tickets_data.get('espera', []))}, "
                                        f"resueltos:{len(tickets_data.get('resueltos', []))}")
                                
                                # Emitir a todos los clientes
                                socketio.emit('tickets_update', tickets_data)
                                logger.info("Datos actualizados emitidos a clientes desde Redis")
                            except Exception as e:
                                logger.error(f"Error procesando datos de Redis: {str(e)}")
                                logger.error(traceback.format_exc())
                    
                    elif channel == 'tickets:raw':
                        # Notificar que se están procesando datos
                        socketio.emit('processing_update', {
                            'status': 'processing',
                            'timestamp': datetime.now().isoformat()
                        })
                        logger.info("Notificación de procesamiento emitida a clientes")
            except Exception as e:
                logger.error(f"Error en listener de Redis: {str(e)}")
                logger.error(traceback.format_exc())
    except Exception as e:
        logger.error(f"Error fatal en redis_listener: {str(e)}")
        logger.error(traceback.format_exc())

# Redis para intermediación con timeouts para evitar bloqueos
try:
    import redis
    redis_client = redis.Redis(
        host='localhost', 
        port=6379, 
        db=0,
        socket_timeout=5,  # Timeout para operaciones de socket
        socket_connect_timeout=5,  # Timeout para conexión
        health_check_interval=30  # Verificar conexión cada 30 segundos
    )
    # Verificar conexión
    redis_client.ping()
    REDIS_AVAILABLE = True
    logger.info("Conexión a Redis establecida correctamente")
except Exception as e:
    REDIS_AVAILABLE = False
    logger.error(f"Error al conectar con Redis: {str(e)}")

# Importar funciones de base de datos SQLite
from db_sqlite import init_db, guardar_tickets_en_db, get_tickets_from_db, get_stats_from_db

# Importar módulo de configuración de correo
import email_config

# ==== IMPORTS PARA ENVÍO SMTP (NUEVO) ====
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
# ========================================

# Importar funciones de db_tecnicos
try:
    from db_tecnicos import (
        init_tecnicos_db, 
        extraer_tecnicos_de_tickets, 
        get_all_tecnicos, 
        get_tecnico_by_nombre,
        update_tecnico,
        search_tecnicos
    )
    logger.info("Módulos de db_tecnicos importados correctamente")
except ImportError as e:
    logger.error(f"Error al importar funciones de db_tecnicos: {str(e)}")

# Clase para manejar problemas de compatibilidad con exchangelib
try:
    from exchangelib.errors import ErrorAuthenticationFailed as AuthenticationError
    from exchangelib.errors import EWSError, ConnectionError, ErrorTimeoutExpired
    logger.info("Importaciones de exchangelib correctas")
except ImportError as e:
    logger.error(f"Error en importación de exchangelib: {str(e)}")
    # Define clases de error para manejar la compatibilidad
    class AuthenticationError(Exception):
        pass
    class EWSError(Exception):
        pass
    class ConnectionError(Exception):
        pass
    class TransportError(Exception):
        pass
    class ErrorTimeoutExpired(Exception):
        pass

app = Flask(__name__,
            template_folder='templates',
            static_folder='static')
CORS(app)

# Añadir clave secreta para sesiones
app.secret_key = 'senasa_sistema_tickets_2025'  # Cambia esto por una clave segura en producción

socketio = SocketIO(app,
                    cors_allowed_origins="*",
                    async_mode='gevent',
                    logger=False,
                    engineio_logger=False)

# Cache para tickets
tickets_cache = {"tickets": [], "last_update": None}

# Inicializar la base de datos SQLite al arrancar la aplicación
if not init_db():
    logger.error("Error al inicializar la base de datos SQLite")
else:
    logger.info("Base de datos SQLite inicializada correctamente")

# Crear un contexto SSL personalizado
def create_custom_ssl_context():
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.maximum_version = ssl.TLSVersion.TLSv1_2
    return context

# Subclase personalizada de requests.Session compatible con exchangelib
class CustomSession(requests.Session):
    def __init__(self):
        super().__init__()
        self.session_id = str(uuid.uuid4())
        adapter = requests.adapters.HTTPAdapter()
        adapter.init_poolmanager(connections=1,
                                 maxsize=1,
                                 ssl_context=create_custom_ssl_context())
        self.mount("https://", adapter)

# Actualizar el protocolo de exchangelib
try:
    from exchangelib.protocol import BaseProtocol
    BaseProtocol.SESSION_POOLSIZE = 1
    BaseProtocol.SESSION_POOLSIZE_PER_DOMAIN = 1
    BaseProtocol.get_session = lambda self: CustomSession()
    logger.info("Configuración de exchangelib aplicada correctamente")
except ImportError as e:
    logger.error(f"Error al configurar exchangelib: {str(e)}")

# Configurar Redis PubSub para WebSockets
redis_pubsub = None
redis_listener_thread = None

if REDIS_AVAILABLE:
    try:
        redis_pubsub = redis_client.pubsub()
        redis_pubsub.subscribe(['tickets:updates', 'tickets:raw'])
        
        # Iniciar thread de escucha como daemon (terminará cuando el programa principal termine)
        redis_listener_thread = threading.Thread(target=redis_listener, daemon=True)
        redis_listener_thread.start()
        logger.info("Thread de listener Redis iniciado")
        logger.info("PUNTO DE CONTROL 1 - Después de iniciar Redis listener")
    except Exception as e:
        logger.error(f"Error configurando Redis PubSub: {str(e)}")
        logger.error(traceback.format_exc())

# Decorador para proteger rutas que requieren autenticación
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

################################
# RUTAS PRINCIPALES DE LA APP
################################

@app.route('/')
def index():
    template_path = os.path.join(app.template_folder, 'index.html')
    if not os.path.exists(template_path):
        logger.error(f"Template index.html no encontrado en {template_path}")
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        password = request.form.get('password')
        # Configura aquí tu contraseña de administrador (usa hashing en producción)
        if password == 'admin123':  # Cambia esto por una contraseña segura
            session['logged_in'] = True
            next_page = request.args.get('next')
            if next_page and next_page.startswith('/'):
                return redirect(next_page)
            return redirect(url_for('index'))
        else:
            error = 'Contraseña incorrecta. Por favor, intente nuevamente.'
    
    return render_template('login.html', error=error, now=datetime.now())

@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    session['message'] = 'Ha cerrado sesión correctamente.'
    return redirect(url_for('login'))

@app.route('/estadisticas')
@login_required
def estadisticas():
    template_path = os.path.join(app.template_folder, 'estadisticas.html')
    if not os.path.exists(template_path):
        logger.error(f"Template estadisticas.html no encontrado en {template_path}")
    return render_template('estadisticas.html')

@app.route('/gif/<path:filename>')
def serve_gif(filename):
    root_dir = os.path.dirname(os.path.abspath(__file__))
    return send_from_directory(os.path.join(root_dir, 'gif'), filename)

################################
# API PARA CONSULTAR TICKETS
################################

@app.route('/api/tickets', methods=['GET'])
def get_tickets():
    # Obtener tipo de tickets solicitados
    tipo = request.args.get('tipo', None)
    
    # Primero intentar obtener de Redis para mejores tiempos de respuesta
    if REDIS_AVAILABLE:
        try:
            tickets_data = redis_client.get('tickets:latest')
            if tickets_data:
                latest_data = json.loads(tickets_data)
                
                # Si se especifica un tipo, filtrar los datos
                if tipo in ['nuevos', 'espera', 'en_curso', 'resueltos']:
                    # Mapear 'en_curso' a 'curso' para la base de datos
                    db_key = tipo
                    if tipo == 'en_curso':
                        db_key = 'en_curso'  # Ya está en formato correcto en Redis
                    
                    return jsonify({
                        "tickets": latest_data.get(db_key, []),
                        "last_update": latest_data.get('last_update', datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                    })
                
                # Si no hay tipo específico, devolver todos los datos
                return jsonify(latest_data)
        except Exception as e:
            logger.error(f"Error obteniendo datos de Redis: {str(e)}")
    
    # Si no hay Redis o falla, usar el enfoque tradicional
    if tipo in ['nuevos', 'espera', 'en_curso', 'resueltos']:
        # Mapear 'en_curso' a 'curso' para la base de datos
        if tipo == 'en_curso':
            db_tipo = 'curso'
        else:
            db_tipo = tipo
            
        tickets = get_tickets_from_db(db_tipo)
        return jsonify({
            "tickets": tickets,
            "last_update": tickets_cache.get('last_update', datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        })
    
    # Si no hay tipo específico, devolver el caché actual
    return jsonify(tickets_cache)

@app.route('/api/tickets/improved', methods=['GET'])
def get_tickets_improved():
    """Endpoint optimizado para obtener tickets con Redis"""
    if REDIS_AVAILABLE:
        try:
            tickets_data = redis_client.get('tickets:latest')
            if tickets_data:
                logger.info(f"Datos obtenidos de Redis para /api/tickets/improved (tamaño: {len(tickets_data)} bytes)")
                json_data = json.loads(tickets_data)
                log_data_structure(json_data, "API_ENDPOINT")
                return jsonify(json_data)
            else:
                logger.warning("No se encontraron datos en Redis para /api/tickets/improved")
        except Exception as e:
            logger.error(f"Error obteniendo datos mejorados de Redis: {str(e)}")
            logger.error(traceback.format_exc())
    
    # Fallback a data_manager si Redis no está disponible
    logger.info("Usando fallback a data_manager para /api/tickets/improved")
    current_data = data_manager.get_current_data()
    log_data_structure(current_data, "DATA_MANAGER")
    return jsonify(current_data)

@app.route('/api/tickets/stats', methods=['GET'])
def get_tickets_stats():
    """Endpoint para obtener estadísticas históricas de los tickets"""
    stats = get_stats_from_db()
    return jsonify({
        "stats": stats,
        "last_update": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })

@app.route('/api/system/redis-status', methods=['GET'])
def get_redis_status():
    """Endpoint para verificar el estado de Redis"""
    try:
        if REDIS_AVAILABLE:
            # Verificar que Redis esté respondiendo
            ping_result = redis_client.ping()
            
            # Verificar que tickets:latest exista
            has_data = redis_client.exists('tickets:latest')
            
            return jsonify({
                "status": "available",
                "ping": ping_result,
                "has_data": bool(has_data),
                "timestamp": datetime.now().isoformat()
            })
        else:
            return jsonify({
                "status": "unavailable",
                "reason": "Redis no está habilitado",
                "timestamp": datetime.now().isoformat()
            })
    except Exception as e:
        logger.error(f"Error verificando estado de Redis: {str(e)}")
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

################################
# API PARA ENVIAR CORREOS (exchangelib)
################################
@app.route('/api/send-email', methods=['POST'])
def send_email():
    try:
        try:
            from exchangelib import Credentials, Account, Message, Mailbox, Configuration, DELEGATE
        except ImportError as imp_err:
            logger.error(f"Error al importar exchangelib: {str(imp_err)}")
            return jsonify({'error': f'Dependencia faltante: exchangelib, {str(imp_err)}'}), 500

        data = request.get_json()
        logger.info(f"Recibida solicitud para enviar correo a: {data.get('to', 'desconocido')}")

        required_fields = ['to', 'subject', 'html']
        for field in required_fields:
            if field not in data:
                logger.error(f"Campo requerido faltante: {field}")
                return jsonify({'error': f'Campo requerido: {field}'}), 400

        EMAIL_USER = 'PRACTICANTE_INF_001@senasa.gob.pe'
        EMAIL_PASSWORD = '-------'  # Asegúrate de que esta sea la contraseña correcta
        EMAIL_SERVER = 'mail.senasa.gob.pe'

        try:
            # Configurar credenciales
            credentials = Credentials(
                username=EMAIL_USER,
                password=EMAIL_PASSWORD
            )

            # Configurar conexión
            config = Configuration(
                server=EMAIL_SERVER,
                credentials=credentials
            )

            # Intentar establecer la conexión a la cuenta
            try:
                account = Account(
                    primary_smtp_address=EMAIL_USER,
                    config=config,
                    autodiscover=False,
                    access_type=DELEGATE
                )
            except AuthenticationError as auth_err:
                logger.error(f"Error de autenticación: {str(auth_err)}")
                return jsonify({
                    'error': 'Error de autenticación en el servidor de correo. Verifique las credenciales.',
                    'details': str(auth_err)
                }), 401
            except ConnectionError as conn_err:
                logger.error(f"Error de conexión: {str(conn_err)}")
                return jsonify({
                    'error': 'No se pudo conectar al servidor de correo. Verifique la configuración del servidor.',
                    'details': str(conn_err)
                }), 503
            except Exception as acc_err:
                logger.error(f"Error al acceder a la cuenta de correo: {str(acc_err)}")
                return jsonify({
                    'error': 'Error al acceder a la cuenta de correo',
                    'details': str(acc_err)
                }), 500

            # Crear y enviar el mensaje
            try:
                # NOTA: En algunas versiones de exchangelib, 'body_type' no es válido.
                message = Message(
                    account=account,
                    subject=data['subject'],
                    body=data['html'],
                    to_recipients=[Mailbox(email_address=data['to'])]
                )

                message.send()
                
                logger.info(f"Correo enviado a: {data['to']}, Asunto: {data['subject']}")
                return jsonify({'success': True, 'message': 'Correo enviado correctamente'}), 200
                
            except ErrorTimeoutExpired as timeout_err:
                logger.error(f"Tiempo de espera agotado: {str(timeout_err)}")
                return jsonify({
                    'error': 'Tiempo de espera agotado al enviar el correo. El servidor de correo está tardando demasiado en responder.',
                    'details': str(timeout_err)
                }), 504
            except EWSError as ews_err:
                logger.error(f"Error del servidor de Exchange: {str(ews_err)}")
                return jsonify({
                    'error': 'Error en el servidor de correo',
                    'details': str(ews_err)
                }), 502
            except Exception as send_err:
                logger.error(f"Error al enviar el mensaje: {str(send_err)}")
                return jsonify({
                    'error': 'Error al enviar el mensaje',
                    'details': str(send_err)
                }), 500
                
        except Exception as config_err:
            logger.error(f"Error de configuración: {str(config_err)}")
            return jsonify({
                'error': 'Error de configuración del cliente de correo',
                'details': str(config_err)
            }), 500

    except ImportError as imp_err:
        logger.error(f"Error de importación: {str(imp_err)}")
        return jsonify({
            'error': 'Dependencia faltante: exchangelib',
            'details': str(imp_err)
        }), 500
    except Exception as e:
        traceback.print_exc()
        logger.error(f"Error general al enviar correo: {str(e)}")
        return jsonify({'error': str(e)}), 500

################################
# SOCKET.IO EVENTS
################################

@socketio.on('connect')
def handle_connect():
    logger.info('Cliente conectado')
    client_id = request.sid if hasattr(request, 'sid') else 'unknown'
    logger.info(f'ID del cliente: {client_id}')
    
    # Obtener datos de Redis si está disponible
    if REDIS_AVAILABLE:
        try:
            tickets_data = redis_client.get('tickets:latest')
            if tickets_data:
                logger.info(f"Enviando datos de Redis a cliente {client_id} (tamaño: {len(tickets_data)} bytes)")
                latest_data = json.loads(tickets_data)
                log_data_structure(latest_data, f"CONN_{client_id}")
                emit('tickets_update', latest_data)
                logger.info(f"Datos enviados a cliente {client_id}")
                return
            else:
                logger.warning(f"No hay datos en Redis para cliente {client_id}")
        except Exception as e:
            logger.error(f"Error obteniendo datos de Redis para cliente nuevo {client_id}: {str(e)}")
            logger.error(traceback.format_exc())
    
    # Fallback a cache estándar
    logger.info(f"Usando caché estándar para cliente {client_id}")
    log_data_structure(tickets_cache, f"CACHE_{client_id}")
    emit('tickets_update', tickets_cache)
    
    # Registrar con gestor de datos para actualizaciones
    from api.api import handle_client_connect
    handle_client_connect()

@socketio.on('disconnect')
def handle_disconnect():
    logger.info('Cliente desconectado')
    from api.api import handle_client_disconnect
    handle_client_disconnect()

def emit_update(data):
    """Compatibilidad con el sistema antiguo"""
    global tickets_cache
    
    # Validación de datos para evitar errores en frontend
    if not data:
        logger.error("emit_update recibió datos vacíos")
        return
    
    logger.info("emit_update - Datos recibidos con claves: " + str(list(data.keys())))
    
    # Asegurar que cada categoría es una lista
    for category in ['nuevos', 'en_curso', 'espera', 'resueltos']:
        if category in data and not isinstance(data[category], list):
            logger.warning(f"Categoría {category} no es una lista, convirtiendo")
            data[category] = []
    
    # Añadir conteos antes de procesar
    logger.info(f"emit_update - ANTES: nuevos:{len(data.get('nuevos', []))}, "
               f"en_curso:{len(data.get('en_curso', []))}, "
               f"espera:{len(data.get('espera', []))}, "
               f"resueltos:{len(data.get('resueltos', []))}")
            
    # Validar cada ticket
    for category in ['nuevos', 'en_curso', 'espera', 'resueltos']:
        if category in data and isinstance(data[category], list):
            # Filtrar tickets sin ID y añadir campos por defecto donde falten
            valid_tickets = []
            invalid_count = 0
            for ticket in data[category]:
                if ticket and (ticket.get('ticket_id') or ticket.get('ID')):
                    # Asegurar campos críticos para evitar errores en UI
                    if not ticket.get('Título'):
                        ticket['Título'] = 'Sin título'
                    if not ticket.get('Entidad'):
                        ticket['Entidad'] = 'SENASA'
                    if not ticket.get('Estado'):
                        ticket['Estado'] = 'Desconocido'
                    valid_tickets.append(ticket)
                else:
                    invalid_count += 1
            
            if invalid_count > 0:
                logger.warning(f"Se filtraron {invalid_count} tickets inválidos de la categoría {category}")
            
            data[category] = valid_tickets
    
    # Añadir categoría 'curso' si existe 'en_curso' para compatibilidad con frontend
    if 'en_curso' in data and 'curso' not in data:
        logger.info("Añadiendo categoría 'curso' para compatibilidad con frontend")
        data['curso'] = data['en_curso']
    
    # Añadir conteos después de procesar
    logger.info(f"emit_update - DESPUÉS: nuevos:{len(data.get('nuevos', []))}, "
               f"en_curso:{len(data.get('en_curso', []))}, "
               f"curso:{len(data.get('curso', []))}, "
               f"espera:{len(data.get('espera', []))}, "
               f"resueltos:{len(data.get('resueltos', []))}")
    
    tickets_cache = data
    
    # Almacenar en Redis para consultas rápidas
    if REDIS_AVAILABLE:
        try:
            json_data = json.dumps(data)
            logger.info(f"Guardando en Redis - Tamaño de datos: {len(json_data)} bytes")
            redis_client.set('tickets:latest', json_data)
            
            # Verificar que se guardó correctamente
            verification = redis_client.get('tickets:latest')
            if verification:
                logger.info(f"Verificación Redis: datos guardados correctamente (tamaño: {len(verification)} bytes)")
            else:
                logger.error("Verificación Redis: ¡datos no encontrados después de guardar!")
                
            # Publicar actualización para que otros clientes se enteren
            redis_client.publish('tickets:updates', json.dumps({'status': 'updated'}))
            logger.info("Notificación de actualización publicada en Redis")
        except Exception as e:
            logger.error(f"Error almacenando datos en Redis: {str(e)}")
            logger.error(traceback.format_exc())
    
    # Hacer una copia para evitar problemas de referencia
    emission_data = data.copy()
    
    logger.info(f"Emitiendo actualización a clientes - Total: {sum(len(emission_data.get(cat, [])) for cat in ['nuevos', 'en_curso', 'curso', 'espera', 'resueltos'])}")
    socketio.emit('tickets_update', emission_data)

################################
# FUNCIONES PARA REPORTES
################################

def capture_dashboard_screenshot():
    """Captura una imagen del dashboard de tickets en curso."""
    try:
        logger.debug("Iniciando captura de pantalla automática")
        chrome_options = Options()
        chrome_options.add_argument('--headless')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--window-size=1280,1600')  # Aumentar altura
        
        driver = webdriver.Chrome(options=chrome_options)
        url = 'http://localhost:5000/estadisticas_en_curso'
        driver.get(url)
        
        # Esperar a que se carguen los datos
        time.sleep(5)
        
        # Ajustar para capturar todo el contenido
        height = driver.execute_script("return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)")
        driver.set_window_size(1280, height+100)  # Añadir altura extra
        
        # Guardar imagen
        filename = f"tickets-report-{datetime.now().strftime('%Y-%m-%d')}.jpg"
        file_path = os.path.join(app.static_folder, filename)
        driver.save_screenshot(file_path)
        
        driver.quit()
        logger.info(f"Captura de pantalla guardada en: {file_path}")
        return file_path
    except Exception as e:
        logger.error(f"Error al capturar pantalla: {str(e)}")
        return None

################################
# RUTAS PARA VISTAS DE REPORTES
################################

@app.route('/estadisticas_en_curso')
@login_required
def estadisticas_en_curso():
    logger.info("Acceso a página de estadísticas en curso")
    return render_template('estadisticas_en_curso.html')

@app.route('/email_tickets_report')
@login_required
def email_tickets_report():
    """
    Ruta para visualizar el template del reporte de tickets.
    """
    # Obtener tickets en curso directamente de la base de datos
    tickets_en_curso = get_tickets_from_db('curso')
    
    logger.info(f"Generando previsualizacion de reporte con {len(tickets_en_curso)} tickets en curso")
    return render_template(
        'email_tickets_report.html',
        tickets=tickets_en_curso,
        fecha_actual=datetime.now().strftime('%d/%m/%Y %H:%M'),
        current_month=datetime.now().strftime('%m-%Y')
    )

@app.route('/estadisticas/historico')
@login_required
def estadisticas_historico():
    """Vista para mostrar estadísticas históricas desde la base de datos SQLite"""
    stats = get_stats_from_db()
    return render_template(
        'estadisticas_historico.html',
        stats=stats,
        last_update=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    )

@app.errorhandler(404)
def page_not_found(e):
    logger.error(f"404 Error: {str(e)}")
    return render_template('404.html'), 404

@app.route('/estadisticas/<filtro>')
@login_required
def estadisticas_filtradas(filtro):
    """
    Obtiene estadísticas filtradas por tipo de ticket (en_espera, en_curso, nuevos, resueltos)
    """
    # Mapear el filtro al nombre de categoría en la base de datos
    if filtro == 'en_espera':
        db_filtro = 'espera'
    elif filtro == 'en_curso':
        db_filtro = 'curso'
    elif filtro == 'nuevos':
        db_filtro = 'nuevos'
    elif filtro == 'resueltos':
        db_filtro = 'resueltos'
    else:
        db_filtro = None
    
    # Obtener tickets de la base de datos según el filtro
    if db_filtro:
        tickets = get_tickets_from_db(db_filtro)
    else:
        # Si no hay filtro específico, obtener todos los tickets (limitado a 1000)
        tickets = get_tickets_from_db(limit=1000)
    
    logger.info(f"Acceso a estadísticas filtradas: {filtro} - {len(tickets)} tickets")
    return render_template(
        'estadisticas_filtradas.html',
        tickets=tickets,
        filtro=filtro,
        last_update=tickets_cache.get('last_update', 'Desconocida')
    )

################################
# RUTAS PARA GESTIÓN DE TÉCNICOS
################################

@app.route('/tecnicos')
@login_required
def tecnicos_view():
    """Vista principal de técnicos"""
    logger.info("Accediendo a la vista de técnicos")
    return render_template('tecnicos.html')

@app.route('/api/tecnicos', methods=['GET'])
def get_tecnicos():
    """Endpoint para obtener técnicos con filtros opcionales"""
    try:
        # Obtener parámetros de búsqueda
        query = request.args.get('q', None)
        area = request.args.get('area', None)
        
        # Si hay parámetros de búsqueda, filtrar técnicos
        if query or (area and area != 'all'):
            tecnicos = search_tecnicos(query, area)
        else:
            # Si no hay parámetros, obtener todos los técnicos
            tecnicos = get_all_tecnicos()
        
        return jsonify({
            "tecnicos": tecnicos,
            "total": len(tecnicos),
            "last_update": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
    except Exception as e:
        logger.error(f"Error al obtener técnicos: {str(e)}")
        return jsonify({
            "error": "Error al obtener técnicos",
            "details": str(e)
        }), 500

@app.route('/api/tecnicos/<int:tecnico_id>', methods=['PUT'])
def update_tecnico_info(tecnico_id):
    """Endpoint para actualizar información de técnico"""
    try:
        data = request.get_json()
        
        # Validar campos requeridos
        required_fields = ['nombre', 'email']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    "error": f"Campo requerido: {field}"
                }), 400
        
        # Actualizar técnico
        if update_tecnico(tecnico_id, data):
            return jsonify({
                "success": True,
                "message": "Técnico actualizado correctamente"
            })
        else:
            return jsonify({
                "error": "Error al actualizar técnico"
            }), 500
    except Exception as e:
        logger.error(f"Error al actualizar técnico: {str(e)}")
        return jsonify({
            "error": "Error al actualizar técnico",
            "details": str(e)
        }), 500

@app.route('/api/tecnicos/refresh', methods=['POST'])
def refresh_tecnicos():
    """Endpoint para refrescar la lista de técnicos desde los tickets"""
    try:
        if extraer_tecnicos_de_tickets():
            return jsonify({
                "success": True,
                "message": "Técnicos actualizados correctamente"
            })
        else:
            return jsonify({
                "error": "Error al actualizar técnicos"
            }), 500
    except Exception as e:
        logger.error(f"Error al refrescar técnicos: {str(e)}")
        return jsonify({
            "error": "Error al refrescar técnicos",
            "details": str(e)
        }), 500

@app.route('/api/tecnicos/nombre/<string:nombre>', methods=['GET'])
def get_tecnico_info(nombre):
    """Endpoint para obtener información de un técnico por nombre"""
    try:
        tecnico = get_tecnico_by_nombre(nombre)
        
        if tecnico:
            return jsonify({
                "tecnico": tecnico
            })
        else:
            return jsonify({
                "error": "Técnico no encontrado"
            }), 404
    except Exception as e:
        logger.error(f"Error al obtener técnico: {str(e)}")
        return jsonify({
            "error": "Error al obtener técnico",
            "details": str(e)
        }), 500

################################
# MANEJO DE ERRORES
################################

@app.errorhandler(Exception)
def handle_exception(e):
    logger.error(f"Error no controlado: {str(e)}")
    traceback.print_exc()
    return jsonify({
        'error': 'Error interno del servidor',
        'details': str(e)
    }), 500

# Inicialización de base de datos de técnicos al arrancar
def initialize_tecnicos_db():
    """Inicializa la base de datos de técnicos al arrancar la aplicación"""
    try:
        # Si existe el módulo db_tecnicos, intentar inicializar la base de datos
        if init_tecnicos_db():
            logger.info("Base de datos de técnicos inicializada correctamente")
            
            # Intentar poblar con técnicos de los tickets
            if extraer_tecnicos_de_tickets():
                logger.info("Técnicos extraídos y guardados correctamente")
            else:
                logger.error("Error al extraer técnicos de tickets")
        else:
            logger.error("Error al inicializar la base de datos de técnicos")
    except Exception as e:
        logger.error(f"Error al inicializar base de datos de técnicos: {str(e)}")

################################
# INICIO DEL SERVIDOR
################################

if __name__ == '__main__':
    try:
        logger.info("Iniciando aplicación")
        
        if not os.path.exists('templates'):
            logger.error("Error: Carpeta 'templates' no encontrada. Creándola...")
            os.makedirs('templates')

        if not os.path.exists('static'):
            logger.error("Error: Carpeta 'static' no encontrada. Creándola...")
            os.makedirs('static')
            
        # Crear directorios para JS mejorado
        static_js_dir = os.path.join('static', 'js')
        if not os.path.exists(static_js_dir):
            os.makedirs(static_js_dir)
            logger.info(f"Directorio creado: {static_js_dir}")

        # Inicializar base de datos de técnicos
        initialize_tecnicos_db()

        # Iniciar la tarea de scraping en segundo plano
        logger.info("Iniciando hilo de scraping en segundo plano")
        scraping_thread = threading.Thread(
            target=background_scraping,
            args=(emit_update,),
            daemon=True
        )
        scraping_thread.start()

        # Iniciar planificador de correos
        logger.info("Iniciando scheduler de correos")
        email_scheduler = BackgroundScheduler()
        email_scheduler.start()
        
        # Registrar rutas de configuración de correo
        email_config.register_routes(app, email_scheduler, capture_dashboard_screenshot)

        logger.info("About to start the Socket.IO server")
        socketio.run(app,
                     host='0.0.0.0',
                     port=5000,
                     debug=True,
                     use_reloader=False)
    except Exception as e:
        traceback.print_exc()
        logger.error(f"Error al iniciar el servidor: {str(e)}")
        sys.exit(1)