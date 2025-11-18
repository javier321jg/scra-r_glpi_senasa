"""
Módulo de autenticación para la aplicación SENASA.
Este módulo maneja la autenticación y gestión de contraseñas.
"""
import hashlib
import os
import json
import logging
from functools import wraps
from flask import session, redirect, url_for, request

# Configurar logging
logger = logging.getLogger(__name__)

# Archivo de configuración para almacenar la contraseña hasheada
CONFIG_FILE = 'auth_config.json'

# Contraseña por defecto (senasa2025)
DEFAULT_PASSWORD_HASH = '93b5f762385f19cb861d4b0fb3e9f05dd328aa4b9e5ba6bbf4df8f35da78d8be'

def init_auth():
    """Inicializa el sistema de autenticación, cargando o creando configuración"""
    try:
        if not os.path.exists(CONFIG_FILE):
            # Crear archivo de configuración con contraseña por defecto
            config = {
                'password_hash': DEFAULT_PASSWORD_HASH,
                'last_changed': None
            }
            with open(CONFIG_FILE, 'w') as f:
                json.dump(config, f)
            logger.info("Archivo de configuración de autenticación creado con éxito")
        else:
            # Verificar que el archivo es válido
            try:
                with open(CONFIG_FILE, 'r') as f:
                    config = json.load(f)
                if 'password_hash' not in config:
                    config['password_hash'] = DEFAULT_PASSWORD_HASH
                    with open(CONFIG_FILE, 'w') as f:
                        json.dump(config, f)
                    logger.warning("Archivo de configuración reparado - faltaba hash de contraseña")
            except Exception as e:
                logger.error(f"Error al leer archivo de configuración: {str(e)}")
                # Crear archivo nuevo si hay error
                config = {
                    'password_hash': DEFAULT_PASSWORD_HASH,
                    'last_changed': None
                }
                with open(CONFIG_FILE, 'w') as f:
                    json.dump(config, f)
                logger.warning("Archivo de configuración recreado debido a errores")
        
        return True
    except Exception as e:
        logger.error(f"Error al inicializar autenticación: {str(e)}")
        return False

def verify_password(password):
    """Verifica si la contraseña proporcionada es correcta"""
    try:
        # Obtener hash almacenado
        stored_hash = get_password_hash()
        
        # Calcular hash de la contraseña proporcionada
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        
        # Comparar hashes
        return password_hash == stored_hash
    except Exception as e:
        logger.error(f"Error al verificar contraseña: {str(e)}")
        # En caso de error, usar la contraseña por defecto
        return hashlib.sha256(password.encode()).hexdigest() == DEFAULT_PASSWORD_HASH

def get_password_hash():
    """Obtiene el hash de contraseña almacenado"""
    try:
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
        return config.get('password_hash', DEFAULT_PASSWORD_HASH)
    except Exception as e:
        logger.error(f"Error al obtener hash de contraseña: {str(e)}")
        return DEFAULT_PASSWORD_HASH

def change_password(current_password, new_password):
    """Cambia la contraseña del sistema"""
    try:
        # Verificar contraseña actual
        if not verify_password(current_password):
            return False, "La contraseña actual es incorrecta"
        
        # Verificar requisitos de nueva contraseña
        if len(new_password) < 8:
            return False, "La nueva contraseña debe tener al menos 8 caracteres"
        
        # Generar hash de nueva contraseña
        new_hash = hashlib.sha256(new_password.encode()).hexdigest()
        
        # Guardar nueva contraseña
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
        
        config['password_hash'] = new_hash
        config['last_changed'] = {
            'date': str(datetime.now()),
            'ip': request.remote_addr
        }
        
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f)
        
        logger.info("Contraseña cambiada exitosamente")
        return True, "Contraseña cambiada exitosamente"
    except Exception as e:
        logger.error(f"Error al cambiar contraseña: {str(e)}")
        return False, f"Error al cambiar contraseña: {str(e)}"

def login_required(f):
    """Decorador para proteger rutas que requieren autenticación"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'authenticated' not in session or not session['authenticated']:
            # Guardar URL original para redirigir después del login
            session['next_url'] = request.path
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# Importar datetime solo si se necesita (para mejorar la eficiencia)
from datetime import datetime