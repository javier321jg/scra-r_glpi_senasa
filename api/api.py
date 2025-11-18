import time
import threading
import traceback
import os
import signal
import psutil
import gc
import json
import hashlib
import redis
import logging
from datetime import datetime, timedelta
from collections import defaultdict, deque
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException, NoSuchElementException, InvalidSessionIdException
import random

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("scraper.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('scraper')

# Intentar importar geckodriver_autoinstaller pero continuar sin él si falla
try:
    import geckodriver_autoinstaller
    USE_AUTOINSTALLER = True
    logger.info("Geckodriver autoinstaller importado correctamente")
except ImportError:
    USE_AUTOINSTALLER = False
    logger.warning("Geckodriver autoinstaller no disponible, usando ruta manual")

# Importar las funciones de SQLite
from db_sqlite import init_db, guardar_tickets_en_db, get_tickets_from_db

# Configurar cliente Redis
try:
    redis_client = redis.Redis(host='localhost', port=6379, db=0)
    # Verificar conexión
    redis_client.ping()
    REDIS_AVAILABLE = True
    logger.info("Conexión a Redis establecida correctamente")
except Exception as e:
    REDIS_AVAILABLE = False
    logger.error(f"Error al conectar con Redis: {str(e)}")

# Variable para controlar si un cliente está conectado
client_connected = threading.Event()
client_connected.set()

# Estructura mejorada para gestión de datos
class DataManager:
    """Gestiona los datos y su transmisión eficiente a los clientes"""

    def __init__(self, max_history=50):
        self.data_lock = threading.RLock()
        self.current_data = {
            "espera": [],
            "en_curso": [],
            "nuevos": [],
            "resueltos": [],
            "last_update": None
        }
        self.data_history = deque(maxlen=max_history)  # Historial limitado para memoria
        self.client_sessions = {}  # Seguimiento de sesiones de clientes
        self.changes_queue = deque(maxlen=100)  # Cola de cambios pendientes
        self.data_hash = None  # Para detectar cambios reales
        self.raw_queue = deque(maxlen=100)  # Cola para datos crudos
        
        # NUEVO: Estado anterior para tracking de cambios
        self.previous_data = {
            "espera": [],
            "en_curso": [],
            "nuevos": [],
            "resueltos": []
        }

        # Iniciar thread procesador
        self.processor_running = True
        self.processor_thread = threading.Thread(target=self._process_queue, daemon=True)
        self.processor_thread.start()
        logger.info("Thread procesador de datos iniciado")
    
    def _process_queue(self):
        """Procesa la cola de datos crudos en un hilo separado"""
        while self.processor_running:
            try:
                if self.raw_queue:
                    # Procesar siguiente lote de datos
                    current_data = self.raw_queue.popleft()
                    
                    # Emitir notificación de que estamos procesando datos
                    if REDIS_AVAILABLE:
                        redis_client.publish('tickets:raw', json.dumps({'status': 'updating'}))
                    
                    # Organizar los datos
                    processed_data = self._organize_tickets(current_data)
                    
                    # NUEVO: Track changes for daily stats ANTES de actualizar estado interno
                    self.track_daily_changes(processed_data)
                    
                    # Actualizar estado interno
                    self.update_data(processed_data)
                    
                    # Guardar en Redis (más rápido que la BD)
                    if REDIS_AVAILABLE:
                        redis_client.set('tickets:latest', json.dumps(processed_data))
                        # Publicar notificación de actualización
                        redis_client.publish('tickets:updates', json.dumps({
                            'status': 'updated',
                            'timestamp': processed_data.get('last_update', datetime.now().isoformat())
                        }))
                    
                    # Actualizar BD en segundo plano
                    threading.Thread(
                        target=guardar_tickets_en_db,
                        args=(processed_data,),
                        daemon=True
                    ).start()
            except Exception as e:
                logger.error(f"Error en procesador de cola: {str(e)}")
            
            # Pequeña pausa para evitar CPU 100%
            time.sleep(0.1)
    
    def track_daily_changes(self, new_data):
        """NUEVO: Detecta cambios de estado para contadores diarios"""
        if not REDIS_AVAILABLE:
            return
        
        try:
            today = datetime.now().strftime('%Y-%m-%d')
            
            # Crear mapas de tickets por ID para comparación eficiente
            old_tickets = {}
            new_tickets = {}
            
            # Mapear tickets anteriores
            for category in ['espera', 'en_curso', 'nuevos', 'resueltos']:
                for ticket in self.previous_data.get(category, []):
                    ticket_id = ticket.get('ticket_id') or ticket.get('ID')
                    if ticket_id:
                        old_tickets[ticket_id] = {
                            'estado': ticket.get('Estado', ''),
                            'tecnico': ticket.get('Asignado_a', ''),
                            'category': category
                        }
            
            # Mapear tickets nuevos
            for category in ['espera', 'en_curso', 'nuevos', 'resueltos']:
                for ticket in new_data.get(category, []):
                    ticket_id = ticket.get('ticket_id') or ticket.get('ID')
                    if ticket_id:
                        new_tickets[ticket_id] = {
                            'estado': ticket.get('Estado', ''),
                            'tecnico': ticket.get('Asignado_a', ''),
                            'category': category
                        }
            
            # Detectar cambios de estado
            for ticket_id, new_info in new_tickets.items():
                old_info = old_tickets.get(ticket_id)
                
                if old_info:
                    old_category = old_info['category']
                    new_category = new_info['category']
                    new_tecnico = new_info['tecnico']
                    
                    # DERIVACIÓN: Nuevo → En Curso (asignación a técnico)
                    if (old_category == 'nuevos' and new_category == 'en_curso' 
                        and new_tecnico and new_tecnico.strip() != ''):
                        self.increment_daily_counter(today, new_tecnico, 'assignments')
                        logger.info(f"Derivación detectada: Ticket {ticket_id} → {new_tecnico}")
                    
                    # RESOLUCIÓN: Cualquier estado → Resuelto
                    if (old_category != 'resueltos' and new_category == 'resueltos' 
                        and new_tecnico and new_tecnico.strip() != ''):
                        self.increment_daily_counter(today, new_tecnico, 'resolutions')
                        logger.info(f"Resolución detectada: Ticket {ticket_id} → {new_tecnico}")
            
            # Actualizar estado anterior para próxima comparación
            self.previous_data = new_data.copy()
            
        except Exception as e:
            logger.error(f"Error en track_daily_changes: {str(e)}")
    
    def increment_daily_counter(self, date, tecnico, counter_type):
        """NUEVO: Incrementa contadores diarios en Redis"""
        if not REDIS_AVAILABLE or not tecnico or tecnico.strip() == '':
            return
        
        try:
            # Limpiar nombre del técnico para usar como key
            clean_tecnico = tecnico.strip().replace(' ', '_')
            
            # Crear key de Redis
            redis_key = f"daily_{counter_type}:{date}:{clean_tecnico}"
            
            # Incrementar contador
            current_value = redis_client.incr(redis_key)
            
            # Establecer TTL de 25 horas para auto-limpieza
            redis_client.expire(redis_key, 25 * 60 * 60)
            
            logger.debug(f"Contador incrementado: {redis_key} = {current_value}")
            
        except Exception as e:
            logger.error(f"Error incrementando contador diario: {str(e)}")
    
    def get_daily_stats(self, date=None):
        """NUEVO: Obtiene estadísticas diarias desde Redis"""
        if not REDIS_AVAILABLE:
            return {}
        
        if not date:
            date = datetime.now().strftime('%Y-%m-%d')
        
        try:
            stats = {
                'assignments': {},  # derivaciones
                'resolutions': {}   # resoluciones
            }
            
            # Buscar todas las keys de assignments del día
            assignment_pattern = f"daily_assignments:{date}:*"
            assignment_keys = redis_client.keys(assignment_pattern)
            
            for key in assignment_keys:
                key_str = key.decode('utf-8')
                tecnico = key_str.split(':')[-1].replace('_', ' ')
                count = int(redis_client.get(key) or 0)
                stats['assignments'][tecnico] = count
            
            # Buscar todas las keys de resolutions del día
            resolution_pattern = f"daily_resolutions:{date}:*"
            resolution_keys = redis_client.keys(resolution_pattern)
            
            for key in resolution_keys:
                key_str = key.decode('utf-8')
                tecnico = key_str.split(':')[-1].replace('_', ' ')
                count = int(redis_client.get(key) or 0)
                stats['resolutions'][tecnico] = count
            
            logger.debug(f"Estadísticas diarias para {date}: {stats}")
            return stats
            
        except Exception as e:
            logger.error(f"Error obteniendo estadísticas diarias: {str(e)}")
            return {}
    
    def _organize_tickets(self, data):
        """Organiza los tickets en un formato adecuado para la BD y clientes"""
        result = {
            "espera": [],
            "en_curso": [],
            "nuevos": [],
            "resueltos": [],
            "last_update": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        
        # Procesar tickets según sus categorías
        if "espera" in data and isinstance(data["espera"], list):
            result["espera"] = data["espera"]
        
        if "en_curso" in data and isinstance(data["en_curso"], list):
            result["en_curso"] = data["en_curso"]
        
        if "nuevos" in data and isinstance(data["nuevos"], list):
            result["nuevos"] = data["nuevos"]
        
        if "resueltos" in data and isinstance(data["resueltos"], list):
            result["resueltos"] = data["resueltos"]
        
        # Asegurar que cada ticket tenga sus campos básicos
        for category in ["espera", "en_curso", "nuevos", "resueltos"]:
            for ticket in result[category]:
                if not ticket.get('Título'):
                    ticket['Título'] = 'Sin título'
                if not ticket.get('Entidad'):
                    ticket['Entidad'] = 'SENASA'
                if not ticket.get('Estado'):
                    ticket['Estado'] = category
        
        return result
    
    def add_raw_data(self, data):
        """Añade datos crudos a la cola para procesamiento asíncrono"""
        self.raw_queue.append(data)
        return True
        
    def update_data(self, new_data):
        """Actualiza los datos y detecta cambios reales"""
        with self.data_lock:
            # Calcular hash de los nuevos datos para comparación
            new_hash = self._calculate_data_hash(new_data)
            
            # Si no hay cambios reales, no procesar
            if new_hash == self.data_hash:
                logger.debug("No hay cambios reales en los datos")
                return False
                
            # Detectar diferencias y generar delta
            delta = self._generate_delta(self.current_data, new_data)
            
            # Actualizar datos actuales y añadir al historial
            timestamp = datetime.now()
            history_entry = {
                "timestamp": timestamp,
                "data": new_data.copy(),
                "delta": delta,
                "hash": new_hash
            }
            self.data_history.append(history_entry)
            
            # Actualizar el estado actual
            self.current_data = new_data.copy()
            self.data_hash = new_hash
            
            # Añadir a la cola de cambios
            self.changes_queue.append({
                "timestamp": timestamp,
                "delta": delta
            })
            
            return True

    def _calculate_data_hash(self, data):
        """Calcula un hash de los datos para detectar cambios reales"""
        # Excluir last_update del hash para evitar falsos cambios
        data_copy = {k: v for k, v in data.items() if k != 'last_update'}
        # Usar un string JSON ordenado para consistencia
        data_str = json.dumps(data_copy, sort_keys=True)
        return hashlib.md5(data_str.encode()).hexdigest()

    def _generate_delta(self, old_data, new_data):
        """Genera un delta entre dos conjuntos de datos"""
        delta = {
            "added": defaultdict(list),
            "removed": defaultdict(list),
            "changed": defaultdict(list),
            "timestamp": datetime.now().isoformat()
        }
        
        # Para cada categoría, detectar cambios
        for cat in ["espera", "en_curso", "nuevos", "resueltos"]:
            # Mapear por ticket_id para comparación rápida
            old_tickets = {t.get("ticket_id", t.get("ID", "")): t for t in old_data.get(cat, [])}
            new_tickets = {t.get("ticket_id", t.get("ID", "")): t for t in new_data.get(cat, [])}
            
            # Encontrar tickets añadidos
            for tid, ticket in new_tickets.items():
                if tid not in old_tickets:
                    delta["added"][cat].append(ticket)
                elif ticket != old_tickets[tid]:  # Si cambió algún detalle
                    delta["changed"][cat].append(ticket)
            
            # Encontrar tickets eliminados
            for tid, ticket in old_tickets.items():
                if tid not in new_tickets:
                    delta["removed"][cat].append(ticket)
        
        return delta

    def register_client(self, client_id):
        """Registra un nuevo cliente y su estado"""
        with self.data_lock:
            self.client_sessions[client_id] = {
                "last_update": datetime.now(),
                "last_data_hash": None
            }
            logger.info(f"Cliente registrado: {client_id}")

    def unregister_client(self, client_id):
        """Elimina un cliente"""
        with self.data_lock:
            if client_id in self.client_sessions:
                del self.client_sessions[client_id]
                logger.info(f"Cliente eliminado: {client_id}")

    def get_updates_for_client(self, client_id):
        """Obtiene actualizaciones relevantes para un cliente específico"""
        with self.data_lock:
            if client_id not in self.client_sessions:
                # Si es un cliente nuevo, enviar todos los datos actuales
                self.register_client(client_id)
                self.client_sessions[client_id]["last_data_hash"] = self.data_hash
                return {"type": "full", "data": self.current_data}
            
            # Cliente existente, verificar si necesita updates
            client_info = self.client_sessions[client_id]
            
            # Si el hash es el mismo, no hay cambios que enviar
            if client_info["last_data_hash"] == self.data_hash:
                return {"type": "no_changes"}
            
            # Actualizar estado del cliente
            client_info["last_update"] = datetime.now()
            client_info["last_data_hash"] = self.data_hash
            
            # Enviar datos completos
            return {"type": "full", "data": self.current_data}

    def cleanup_inactive_clients(self, max_inactive_minutes=30):
        """Limpia clientes inactivos"""
        with self.data_lock:
            now = datetime.now()
            inactive = []
            
            for client_id, info in self.client_sessions.items():
                if now - info["last_update"] > timedelta(minutes=max_inactive_minutes):
                    inactive.append(client_id)
            
            for client_id in inactive:
                self.unregister_client(client_id)
            
            if inactive:
                logger.info(f"Eliminados {len(inactive)} clientes inactivos")
    
    def get_current_data(self):
        """Retorna una copia del estado actual de los datos"""
        with self.data_lock:
            return self.current_data.copy()
    
    def shutdown(self):
        """Detiene el thread procesador"""
        self.processor_running = False
        if self.processor_thread.is_alive():
            self.processor_thread.join(timeout=1.0)
            logger.info("Thread procesador detenido")

# Inicializar el gestor de datos global
data_manager = DataManager()

# Constantes optimizadas para mejor estabilidad
MAX_REINTENTOS = 3
TIEMPO_ESPERA_BASE = 30
TIEMPO_ESPERA_LOGIN = 10
TIEMPO_ESPERA_ELEMENTO = 30
TIEMPO_ESPERA_PAGINA = 5
URL_BASE = "https://mda.senasa.gob.pe"
DRIVER_MAX_AGE_MINUTES = 120
HEARTBEAT_INTERVAL = 10
MAX_CRITICAL_FAILURES = 2

# Ruta al geckodriver
GECKODRIVER_PATH = os.path.join(os.getcwd(), "geckodriver.exe")  # Para Windows

# Clase para gestionar pool de drivers Firefox
class FirefoxDriverPool:
    """Gestiona instancia de Firefox para resistencia a fallos"""

    def __init__(self, pool_size=1, max_age_hours=12):
        self.pool_size = 1  # Forzar a 1 navegador
        self.max_age_hours = max_age_hours
        self.drivers = []
        self.current_index = 0
        self.lock = threading.Lock()
        self.last_rotation = datetime.now()
        
    def initialize(self):
        """Inicializa el pool con una instancia de Firefox"""
        logger.info("Inicializando instancia única de Firefox")
        # Matar cualquier proceso previo
        kill_firefox_processes()
        time.sleep(5)  # Esperar más tiempo para limpieza
        self._add_driver()

    def _add_driver(self):
        """Añade un nuevo driver al pool"""
        driver = crear_driver_firefox()
        if driver:
            self.drivers.append({
                "driver": driver,
                "created_at": datetime.now(),
                "requests": 0,
                "health_score": 100,
                "login_status": False
            })
            logger.info(f"Añadido nuevo driver Firefox al pool (total: {len(self.drivers)})")

    def get_driver(self):
        """Obtiene el driver actual rotando si es necesario"""
        with self.lock:
            if not self.drivers:
                self._add_driver()
                
            # Verificar si el driver actual necesita rotación
            if self.current_index >= len(self.drivers):
                self.current_index = 0
                
            current = self.drivers[self.current_index]
            age = datetime.now() - current["created_at"]
            
            # Rotar si el driver es viejo o tiene muchas peticiones
            if age > timedelta(hours=self.max_age_hours) or current["requests"] > 500 or current["health_score"] < 50:
                self._rotate_driver()
                
            # Incrementar contador
            self.drivers[self.current_index]["requests"] += 1
            
            # Verificar si el driver necesita login
            driver = self.drivers[self.current_index]["driver"]
            if not self.drivers[self.current_index]["login_status"]:
                try:
                    if hacer_login(driver):
                        self.drivers[self.current_index]["login_status"] = True
                    else:
                        self._rotate_driver()
                        return self.get_driver()  # Intentar con otro driver
                except Exception as e:
                    logger.error(f"Error en login durante get_driver: {str(e)}")
                    self._rotate_driver()
                    return self.get_driver()
                
            return driver

    def _rotate_driver(self):
        """Reemplaza un driver por uno nuevo"""
        try:
            # Cerrar el driver actual
            if self.current_index < len(self.drivers):
                old_driver = self.drivers[self.current_index]["driver"]
                try:
                    old_driver.quit()
                except:
                    pass
            
                # Reemplazar con uno nuevo
                self.drivers[self.current_index] = {
                    "driver": crear_driver_firefox(),
                    "created_at": datetime.now(),
                    "requests": 0,
                    "health_score": 100,
                    "login_status": False
                }
                
                logger.info(f"Driver Firefox rotado en posición {self.current_index}")
            else:
                # Añadir driver si el índice está fuera del rango
                self._add_driver()
                self.current_index = len(self.drivers) - 1
            
            # Actualizar timestamp de última rotación
            self.last_rotation = datetime.now()
            
        except Exception as e:
            logger.error(f"Error al rotar driver: {str(e)}")
            
            # Si el pool está vacío o hay un error crítico, reconstruir
            if not self.drivers or len(self.drivers) <= self.current_index:
                self.drivers = []
                self._add_driver()
                self.current_index = 0
            else:
                # Eliminar el driver problemático
                self.drivers.pop(self.current_index, None)
                # Añadir uno nuevo
                self._add_driver()

    def report_success(self):
        """Reportar operación exitosa para métricas"""
        if self.drivers and self.current_index < len(self.drivers):
            self.drivers[self.current_index]["health_score"] = min(100, self.drivers[self.current_index]["health_score"] + 1)

    def report_failure(self, is_critical=False):
        """Reportar fallo para métricas y posible rotación"""
        if not self.drivers or self.current_index >= len(self.drivers):
            return
            
        penalty = 25 if is_critical else 5
        self.drivers[self.current_index]["health_score"] -= penalty
        
        # Si la salud es muy baja, rotar inmediatamente
        if self.drivers[self.current_index]["health_score"] <= 0:
            logger.warning("Driver Firefox con salud crítica, rotando inmediatamente")
            self._rotate_driver()

    def close_all(self):
        """Cierra todos los drivers"""
        for driver_info in self.drivers:
            try:
                driver_info["driver"].quit()
            except:
                pass
        self.drivers = []
        
    def health_check(self):
        """Realiza una verificación de salud de todos los drivers"""
        with self.lock:
            for i, driver_info in enumerate(self.drivers):
                try:
                    # Verificar que el driver responde
                    driver_info["driver"].current_url
                except Exception as e:
                    logger.warning(f"Driver {i} no responde: {str(e)}")
                    # Preservar el índice actual
                    old_index = self.current_index
                    self.current_index = i
                    self._rotate_driver()
                    self.current_index = old_index

firefox_pool = None

def is_critical_error(error_str):
    """Identifica errores críticos que requieren recrear el driver inmediatamente"""
    critical_patterns = [
        "InvalidSessionId",
        "session deleted because of page crash",
        "not reachable",
        "No connection could be made",
        "Cannot find context",
        "TypeError: browsingContext is null",
        "Unable to connect to host",
        "Connection refused",
        "timeout"
    ]
    return any(pattern in str(error_str) for pattern in critical_patterns)

def kill_firefox_processes():
    """Mata procesos de Firefox huérfanos"""
    try:
        # Primero, terminar procesos específicos
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                if proc.info and proc.info.get('name'):
                    name = proc.info['name'].lower()
                    if ('firefox' in name or 'geckodriver' in name):
                        if proc.pid != os.getpid():
                            try:
                                proc.kill()
                                logger.info(f"Proceso terminado: {name} (PID {proc.pid})")
                            except (psutil.NoSuchProcess, psutil.AccessDenied):
                                pass
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        # Liberar puertos usando net_connections
        try:
            for port in range(4444, 4450):  # Rango común para geckodriver
                for conn in psutil.net_connections():
                    if conn.laddr and conn.laddr.port == port:
                        try:
                            process = psutil.Process(conn.pid)
                            process.kill()
                            logger.info(f"Terminado proceso usando puerto {port}: PID {conn.pid}")
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass
        except Exception as e:
            logger.warning(f"Error liberando puertos: {str(e)}")
        
        # Comandos de sistema como respaldo
        if os.name == 'nt':
            os.system("taskkill /f /im firefox.exe /t >nul 2>&1")
            os.system("taskkill /f /im geckodriver.exe /t >nul 2>&1")
        else:
            os.system("pkill -9 -f firefox")
            os.system("pkill -9 -f geckodriver")
            
    except Exception as e:
        logger.error(f"Error al intentar matar procesos: {str(e)}")

def crear_driver_firefox():
    """Crea un driver de Firefox con opciones optimizadas"""
    global USE_AUTOINSTALLER

    for intento in range(MAX_REINTENTOS):
        try:
            # Verificar si usar autoinstaller o ruta manual
            if USE_AUTOINSTALLER:
                try:
                    geckodriver_autoinstaller.install()
                except Exception as e:
                    logger.warning(f"Error con autoinstaller, usando ruta manual: {str(e)}")
                    USE_AUTOINSTALLER = False
            
            # Matar procesos Firefox existentes en primer intento
            kill_firefox_processes()
            time.sleep(5)  # Esperar más tiempo para limpieza completa
            
            # Configurar opciones con configuración más estable
            options = FirefoxOptions()
            options.headless = True
            
            # Configuraciones críticas adicionales
            options.set_preference("browser.cache.disk.enable", False)
            options.set_preference("browser.cache.memory.enable", False)
            options.set_preference("browser.cache.offline.enable", False)
            options.set_preference("network.http.use-cache", False)
            options.set_preference("permissions.default.image", 2)  # No cargar imágenes
            
            # Desactivar más elementos para estabilidad
            options.set_preference("app.update.auto", False)
            options.set_preference("app.update.enabled", False)
            options.set_preference("browser.tabs.remote.autostart", False)
            options.set_preference("browser.tabs.remote.autostart.2", False)
            options.set_preference("browser.sessionstore.resume_from_crash", False)
            
            # Más rendimiento
            options.set_preference("dom.ipc.processCount", 1)
            options.set_preference("javascript.options.mem.high_water_mark", 32)
            
            # Evitar detección de automatización
            options.set_preference("dom.webdriver.enabled", False)
            options.set_preference("useAutomationExtension", False)
            
            # User agent realista
            options.set_preference("general.useragent.override", 
                               "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0")
            
            # Crear servicio con la ruta explícita
            if os.path.exists(GECKODRIVER_PATH):
                logger.info(f"Usando geckodriver desde ruta manual: {GECKODRIVER_PATH}")
                service = FirefoxService(
                    executable_path=GECKODRIVER_PATH, 
                    log_output=os.devnull,
                    port=4444  # Especificar puerto fijo
                )
            else:
                logger.error(f"¡Geckodriver no encontrado en {GECKODRIVER_PATH}!")
                return None
            
            # Crear el driver
            driver = webdriver.Firefox(options=options, service=service)
            
            # Verificar inmediatamente la conexión
            driver.current_url  # Esta línea puede fallar si hay problemas de conexión
            
            # Configurar timeouts
            driver.set_page_load_timeout(60)
            driver.set_script_timeout(30)
            
            logger.info("Driver Firefox creado exitosamente")
            return driver
            
        except Exception as e:
            logger.error(f"Error al crear driver Firefox (intento {intento+1}/{MAX_REINTENTOS}): {str(e)}")
            # Limpiar después de un fallo
            kill_firefox_processes()
            if intento < MAX_REINTENTOS - 1:
                time.sleep(10)  # Esperar más tiempo entre intentos

    logger.error("No se pudo crear un driver Firefox después de varios intentos")
    return None

def verificar_driver(driver):
    """Verificación completa del driver"""
    if not driver:
        return False

    try:
        # Múltiples pruebas para asegurar que el driver funciona
        driver.current_url
        driver.execute_script("return 1")
        driver.get_window_size()
        return True
    except Exception as e:
        logger.warning(f"Driver inválido: {str(e)}")
        try:
            driver.quit()
        except:
            pass
        return False

def verificar_login_exitoso(driver):
    """Verifica si el login fue exitoso de manera robusta"""
    try:
        # Verificar URL (método principal)
        if "login.php" in driver.current_url:
            return False

        # Verificar elementos que solo aparecen después del login
        elementos_logueado = driver.find_elements(By.CSS_SELECTOR, ".navbar-nav, .user-menu, .sidebar-menu")
        if elementos_logueado:
            return True
            
        # Verificar si hay mensaje de error de login
        errores = driver.find_elements(By.CSS_SELECTOR, ".error, .alert-danger")
        if errores and any("incorrect" in e.text.lower() or "invalid" in e.text.lower() for e in errores):
            return False
            
        # Verificar por título de página post-login
        if "Dashboard" in driver.title or "Panel" in driver.title:
            return True
            
        return False
    except:
        return False

def monitor_firefox_health():
    """Monitorea y mantiene la salud del pool de Firefox"""
    global firefox_pool

    if not firefox_pool:
        logger.error("No hay pool de Firefox para monitorear")
        return
        
    while True:
        try:
            # Verificar uso de memoria
            process = psutil.Process(os.getpid())
            memory_percent = process.memory_percent()
            
            if memory_percent > 80:
                logger.warning(f"Uso de memoria alto: {memory_percent}%")
                gc.collect()
                
                # Si el uso es extremo, realizar limpieza más agresiva
                if memory_percent > 90:
                    logger.error("Uso de memoria crítico, realizando limpieza")
                    kill_firefox_processes()
                    time.sleep(5)
                    
                    # Reconstruir el pool completamente si la memoria es crítica
                    if memory_percent > 95:
                        with firefox_pool.lock:
                            firefox_pool.close_all()
                            firefox_pool.drivers = []
                            # Recrear gradualmente
                            firefox_pool._add_driver()
                            firefox_pool.current_index = 0
            
            # Realizar health check del pool
            firefox_pool.health_check()
            
            # Verificar tiempos de rotación
            if datetime.now() - firefox_pool.last_rotation > timedelta(hours=4):
                logger.info("Rotación proactiva de drivers por tiempo")
                with firefox_pool.lock:
                    # Rotar al menos un driver
                    firefox_pool._rotate_driver()
            
            # Verificar procesos zombies del sistema
            zombie_count = 0
            for proc in psutil.process_iter(['status']):
                try:
                    if proc.info['status'] == psutil.STATUS_ZOMBIE:
                        zombie_count += 1
                except:
                    pass
            
            if zombie_count > 5:
                logger.warning(f"Detectados {zombie_count} procesos zombie")
                kill_firefox_processes()
            
            # Limpiar clientes inactivos
            data_manager.cleanup_inactive_clients()
            
        except Exception as e:
            logger.error(f"Error en monitor de salud: {str(e)}")
        
        time.sleep(300)  # Verificar cada 5 minutos

def ensure_valid_driver():
    """Asegura tener un driver válido de Firefox"""
    global firefox_pool

    if not firefox_pool:
        logger.info("Inicializando pool de Firefox")
        firefox_pool = FirefoxDriverPool(pool_size=1)  # Usar siempre 1 solo navegador
        firefox_pool.initialize()
        
        # Iniciar monitor de salud
        threading.Thread(
            target=monitor_firefox_health,
            daemon=True
        ).start()

    try:
        driver = firefox_pool.get_driver()
        
        # Verificar si el driver está operativo
        try:
            driver.current_url  # Simple verificación
            return driver
            
        except Exception as e:
            logger.warning(f"Driver inválido durante verificación: {str(e)}")
            firefox_pool.report_failure(is_critical=True)
            # Intentar obtener otro driver
            time.sleep(3)
            return firefox_pool.get_driver()
            
    except Exception as e:
        logger.error(f"Error en ensure_valid_driver: {str(e)}")
        time.sleep(10)  # Esperar antes de reintentar
        # Intentar reconstruir el pool si hay un error severo
        try:
            firefox_pool.close_all()
            firefox_pool = FirefoxDriverPool(pool_size=1)
            firefox_pool.initialize()
        except:
            pass
        return None

def hacer_login(driver):
    """Realiza login con mejor manejo de errores"""
    if not verificar_driver(driver):
        logger.error("Driver inválido antes de iniciar login")
        return False

    for intento in range(MAX_REINTENTOS):
        try:
            driver.delete_all_cookies()
            
            try:
                # En Firefox podemos limpiar el almacenamiento local
                driver.execute_script("window.localStorage.clear();")
                driver.execute_script("window.sessionStorage.clear();")
            except:
                pass
                
            # Cargar página de login con parámetro de no caché
            timestamp = int(time.time())
            driver.get(f"{URL_BASE}/index.php?noAUTO=1&nocache={timestamp}")
            time.sleep(TIEMPO_ESPERA_PAGINA)
            
            # Verificar si ya estamos logueados
            if verificar_login_exitoso(driver):
                logger.info("Ya estaba logueado en el sistema")
                return True
                
            # Buscar formulario de login
            try:
                # Usar esperas explícitas para mejor compatibilidad
                campo_usuario = WebDriverWait(driver, TIEMPO_ESPERA_ELEMENTO).until(
                    EC.element_to_be_clickable((By.ID, "login_name"))
                )
                campo_usuario.clear()
                campo_usuario.send_keys("practicante_inf_001")
                
                campo_password = WebDriverWait(driver, TIEMPO_ESPERA_ELEMENTO).until(
                    EC.element_to_be_clickable((By.ID, "login_password"))
                )
                campo_password.clear()
                campo_password.send_keys(",")
                
                # Buscar y hacer clic en el botón con espera explícita
                login_button = WebDriverWait(driver, TIEMPO_ESPERA_ELEMENTO).until(
                    EC.element_to_be_clickable((By.XPATH, "//button[@type='submit']"))
                )
                
                # En Firefox, a veces es mejor usar click() directo
                try:
                    login_button.click()
                except:
                    # Si falla, intentar con JavaScript
                    driver.execute_script("arguments[0].click();", login_button)
                
                time.sleep(TIEMPO_ESPERA_LOGIN)
                
                # Verificar login exitoso
                if verificar_login_exitoso(driver):
                    logger.info("Login exitoso")
                    return True
                
            except Exception as e:
                logger.error(f"Error en formulario de login: {str(e)}")
                
            if intento < MAX_REINTENTOS - 1:
                time.sleep(5)
                continue
                
        except Exception as e:
            logger.error(f"Error en login (intento {intento+1}/{MAX_REINTENTOS}): {str(e)}")
            if intento < MAX_REINTENTOS - 1:
                time.sleep(5)
                continue

    return False

def driver_heartbeat(interval=HEARTBEAT_INTERVAL):
    """Mantiene el pool de drivers activo con verificaciones periódicas"""
    global firefox_pool

    if not firefox_pool:
        logger.error("No hay pool de Firefox para hacer heartbeat")
        return
        
    while True:
        try:
            # Realizar health check periódico
            if firefox_pool:
                firefox_pool.health_check()
                logger.debug("Heartbeat de drivers completado")
            
            time.sleep(interval)
        except Exception as e:
            logger.error(f"Error en thread de heartbeat: {str(e)}")
            time.sleep(interval)

def obtener_tickets(driver, valor, max_intentos=MAX_REINTENTOS):
    """Obtiene tickets con mejor manejo de errores - ACTUALIZADO PARA NUEVA ESTRUCTURA DE TABLA"""
    global firefox_pool

    # Obtener driver del pool
    driver = ensure_valid_driver()
    if not driver:
        logger.error(f"No se pudo obtener un driver válido para valor {valor}")
        return {"error": "Driver inválido", "tickets": []}

    for intento in range(max_intentos):
        try:
            url = (
                f"{URL_BASE}/front/ticket.php?"
                "criteria%5B0%5D%5Bfield%5D=12&"
                "criteria%5B0%5D%5Bsearchtype%5D=equals&"
                f"criteria%5B0%5D%5Bvalue%5D={valor}&reset=reset"
            )
            
            driver.get(url)
            time.sleep(TIEMPO_ESPERA_PAGINA)
            
            # Verificar si necesitamos login
            if "login.php" in driver.current_url:
                logger.warning("Sesión expirada, reintentando login...")
                if hacer_login(driver):
                    driver.get(url)
                    time.sleep(TIEMPO_ESPERA_PAGINA)
                else:
                    firefox_pool.report_failure(is_critical=True)
                    if intento < max_intentos - 1:
                        driver = ensure_valid_driver()
                        if not driver:
                            return {"error": "No se pudo renovar la sesión", "tickets": []}
                        continue
                    return {"error": "No se pudo renovar la sesión", "tickets": []}
            
            # Seleccionar mostrar más registros
            try:
                dropdown = WebDriverWait(driver, TIEMPO_ESPERA_ELEMENTO).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, ".search-limit-dropdown"))
                )
                select = Select(dropdown)
                options = [opt.get_attribute('value') for opt in select.options]
                logger.info(f"Opciones disponibles en dropdown: {options}")
                
                # Seleccionar la opción de 500 registros si está disponible
                if "500" in options:
                    select.select_by_value("500")
                    time.sleep(3)
            except Exception as e:
                logger.warning(f"Error con dropdown: {str(e)}")
            
            # Esperar a que se cargue la tabla
            try:
                WebDriverWait(driver, TIEMPO_ESPERA_ELEMENTO).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "table.search-results tbody tr"))
                )
            except TimeoutException:
                page_source = driver.page_source
                if "No se encontraron elementos" in page_source:
                    logger.info(f"No se encontraron tickets para valor {valor}")
                    firefox_pool.report_success()
                    return {"tickets": []}
                if intento < max_intentos - 1:
                    time.sleep(3)
                    continue
                raise
            
            time.sleep(3)  # Tiempo para carga dinámica
            
            # Parsear resultados
            page_source = driver.page_source
            soup = BeautifulSoup(page_source, "html.parser")
            tabla = soup.find("table", class_="search-results")
            
            tickets = []
            if tabla and tabla.find("tbody"):
                for fila in tabla.find("tbody").find_all("tr"):
                    celdas = fila.find_all("td")
                    if len(celdas) < 20:
                        continue
                    
                    # Extraer datos de manera segura - NUEVA ESTRUCTURA
                    ticket_data = {}
                    try:
                        # Columna 0: Checkbox (ignorar)
                        # Columna 1: ID
                        ticket_data["ID"] = celdas[1].get_text(strip=True) if len(celdas) > 1 else ""
                        ticket_data["ticket_id"] = ticket_data["ID"]
                        
                        # Columna 2: Título
                        if len(celdas) > 2:
                            titulo_celda = celdas[2]
                            enlace_titulo = titulo_celda.find('a')
                            if enlace_titulo:
                                ticket_data["Título"] = enlace_titulo.text.strip()
                            else:
                                ticket_data["Título"] = titulo_celda.get_text(strip=True)
                        else:
                            ticket_data["Título"] = "Sin título"
                        
                        # MAPEO ACTUALIZADO SEGÚN NUEVA ESTRUCTURA HTML
                        ticket_data["Entidad"] = celdas[3].text.strip() if len(celdas) > 3 else ""
                        ticket_data["Estado"] = celdas[4].text.strip() if len(celdas) > 4 else ""
                        ticket_data["Fecha_apertura"] = celdas[5].text.strip() if len(celdas) > 5 else ""
                        ticket_data["Tiempo_resolucion"] = celdas[6].text.strip() if len(celdas) > 6 else ""
                        ticket_data["Duracion"] = celdas[7].text.strip() if len(celdas) > 7 else ""
                        ticket_data["Delay"] = celdas[8].text.strip() if len(celdas) > 8 else ""
                        ticket_data["Solicitante"] = celdas[9].text.strip() if len(celdas) > 9 else ""
                        ticket_data["Asignado_a"] = celdas[10].text.strip() if len(celdas) > 10 else ""  # ← CORREGIDO: Índice 10
                        ticket_data["Grupo_tecnico"] = celdas[11].text.strip() if len(celdas) > 11 else ""
                        ticket_data["Categoria"] = celdas[12].text.strip() if len(celdas) > 12 else ""
                        ticket_data["Soluciones"] = celdas[13].text.strip() if len(celdas) > 13 else ""
                        ticket_data["Tiempo_cierre"] = celdas[14].text.strip() if len(celdas) > 14 else ""
                        ticket_data["Tipo"] = celdas[15].text.strip() if len(celdas) > 15 else ""
                        ticket_data["Medio"] = celdas[16].text.strip() if len(celdas) > 16 else ""
                        ticket_data["Prioridad"] = celdas[17].text.strip() if len(celdas) > 17 else ""
                        ticket_data["Ubicacion"] = celdas[18].text.strip() if len(celdas) > 18 else ""
                        ticket_data["Tiempo_adicional"] = celdas[19].text.strip() if len(celdas) > 19 else ""
                        ticket_data["Ultima_modificacion"] = celdas[20].text.strip() if len(celdas) > 20 else ""
                        
                        tickets.append(ticket_data)
                    except Exception as e:
                        logger.warning(f"Error parseando ticket: {str(e)}")
                        continue
            
            # Reportar éxito al pool
            firefox_pool.report_success()
            return {"tickets": tickets}
            
        except Exception as e:
            error_str = str(e)
            logger.error(f"Error obteniendo tickets (intento {intento+1}/{max_intentos}): {error_str}")
            
            # Reportar fallo al pool
            if firefox_pool:
                firefox_pool.report_failure(is_critical=is_critical_error(error_str))
            
            if is_critical_error(error_str):
                # Obtener nuevo driver para el siguiente intento
                driver = ensure_valid_driver()
                if not driver and intento < max_intentos - 1:
                    time.sleep(10)  # Esperar más tiempo en caso de error crítico
                    continue
            
            if intento < max_intentos - 1:
                time.sleep(5)
                continue

    return {"error": "Error obteniendo tickets", "tickets": []}

def background_scraping(emit_callback=None):
    """Función principal de scraping mejorada con soporte para deltas y compatible con la app existente"""
    logger.info("Iniciando scraping en segundo plano con Firefox...")

    if not init_db():
        logger.error("No se pudo inicializar la base de datos SQLite")

    # Inicializar pool de Firefox con un solo navegador
    global firefox_pool, data_manager, client_connected
    firefox_pool = FirefoxDriverPool(pool_size=1)  # Forzar a 1 navegador
    firefox_pool.initialize()

    fallos_consecutivos = 0
    fallos_criticos = 0

    # Iniciar thread de heartbeat solamente
    heartbeat_thread = threading.Thread(target=driver_heartbeat, daemon=True)
    heartbeat_thread.start()

    # Asegurar que el data_manager está inicializado
    if not data_manager:
        data_manager = DataManager()

    while True:
        try:
            # Verificar si hay clientes conectados - compatible con ambos métodos
            if not client_connected.is_set():
                logger.info("No hay clientes conectados, modo de mantenimiento...")
                # Realizar un scraping menos frecuente para mantener datos frescos
                time.sleep(60)  # 1 minuto entre intentos sin clientes
                continue
            
            driver = ensure_valid_driver()
            if not driver:
                logger.error("No se pudo obtener un driver válido")
                fallos_consecutivos += 1
                fallos_criticos += 1
                
                if fallos_criticos >= MAX_CRITICAL_FAILURES:
                    logger.warning("Demasiados fallos críticos, realizando limpieza profunda")
                    kill_firefox_processes()
                    time.sleep(30)
                    fallos_criticos = 0
                
                time.sleep(TIEMPO_ESPERA_BASE * min(fallos_consecutivos, 3))
                continue
            
            # Inicializar estructura de datos para datos crudos
            data = {
                "espera": [],
                "en_curso": [],
                "nuevos": [],
                "resueltos": [],
                "last_update": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            
            # Procesar cada categoría secuencialmente con una sola instancia
            categorias = [
                ("nuevos", 1),
                ("en_curso", 2),
                ("espera", 4),
                ("resueltos", 5)
            ]
            
            for categoria, valor in categorias:
                try:
                    datos = obtener_tickets(driver, valor)
                    if "error" in datos:
                        logger.error(f"Error en tickets {categoria}: {datos['error']}")
                        if is_critical_error(datos['error']):
                            fallos_criticos += 1
                            driver = ensure_valid_driver()
                            if not driver:
                                break
                    else:
                        data[categoria] = datos.get("tickets", [])
                        fallos_criticos = 0
                        
                    # Pequeña pausa entre categorías para estabilidad
                    time.sleep(2)
                        
                except Exception as e:
                    logger.error(f"Error procesando {categoria}: {str(e)}")
                    if is_critical_error(str(e)):
                        fallos_criticos += 1
                        driver = ensure_valid_driver()
                        if not driver:
                            break
            
            # Procesar resultados
            total_tickets = sum(len(data[cat]) for cat in data if cat != "last_update")
            if total_tickets > 0:
                logger.info(f"Datos scrappeados: Espera: {len(data['espera'])}, "
                          f"En Curso: {len(data['en_curso'])}, "
                          f"Nuevos: {len(data['nuevos'])}, "
                          f"Resueltos: {len(data['resueltos'])}")
                
                # Enviar datos a la cola de procesamiento en vez de actualizar directamente
                # Así separamos el scraping del procesamiento/organización
                data_manager.add_raw_data(data)
                
                # Almacenar en Redis para consulta rápida (datos crudos)
                if REDIS_AVAILABLE:
                    try:
                        redis_client.set('tickets:raw', json.dumps(data))
                    except Exception as e:
                        logger.error(f"Error almacenando datos crudos en Redis: {str(e)}")
                
                fallos_consecutivos = 0
            else:
                logger.error("No se obtuvieron tickets en ninguna categoría")
                fallos_consecutivos += 1
            
        except Exception as e:
            logger.error(f"Error en background scraping: {str(e)}")
            fallos_consecutivos += 1
            if is_critical_error(str(e)):
                fallos_criticos += 1
            # No reiniciar el pool completo aquí, solo reportar el fallo
            if firefox_pool:
                firefox_pool.report_failure(is_critical=True)
        
        finally:
            try:
                if fallos_consecutivos > 5 or fallos_criticos > 0:
                    kill_firefox_processes()
            except:
                pass
        
        # Calcular tiempo de espera adaptativo
        wait_time = TIEMPO_ESPERA_BASE
        if fallos_consecutivos > 3:
            wait_time *= 2
        if fallos_consecutivos > 5:
            wait_time *= 3
        if fallos_criticos > 0:
            wait_time *= 2
        
        logger.info(f"Esperando {wait_time}s (fallos: {fallos_consecutivos}, críticos: {fallos_criticos})")
        time.sleep(wait_time)

def handle_client_connect():
    """Maneja conexión de cliente (compatible con app existente)"""
    logger.info("Cliente conectado - Estableciendo bandera de cliente conectado")
    client_connected.set()

    # También registramos un cliente genérico en el nuevo sistema para mantener compatibilidad
    client_id = f"generic_{int(time.time())}"
    data_manager.register_client(client_id)

def handle_client_disconnect():
    """Maneja desconexión de cliente (compatible con app existente)"""
    logger.info("Cliente desconectado - Limpiando estado del driver")
    # No desactivamos client_connected aquí para mantener el scraping continuo

    # Hacemos limpieza general de clientes inactivos
    data_manager.cleanup_inactive_clients(max_inactive_minutes=5)

    # Health check del pool
    if firefox_pool:
        logger.info("Cliente desconectado - Realizando health check del pool")
        firefox_pool.health_check()

# Para pruebas directas
if __name__ == "__main__":
    def test_callback(data):
        logger.info(f"Callback recibido con {len(data['espera'])} tickets en espera, "
              f"{len(data['en_curso'])} tickets en curso, "
              f"{len(data['nuevos'])} tickets nuevos, "
              f"{len(data['resueltos'])} tickets resueltos")

    # Iniciar scraping en hilo separado
    scraping_thread = threading.Thread(
        target=background_scraping, 
        args=(test_callback,),
        daemon=True
    )
    scraping_thread.start()

    # Mantener programa ejecutándose
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Programa detenido por el usuario")
        if firefox_pool:
            firefox_pool.close_all()
        if data_manager:
            data_manager.shutdown()
        kill_firefox_processes()
