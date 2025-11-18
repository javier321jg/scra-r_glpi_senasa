#!/usr/bin/env python3
"""
Script de inicialización para la base de datos de técnicos.
Este script configura la tabla de técnicos y extrae los técnicos únicos de los tickets existentes.
"""

import os
import sys
import logging
import sqlite3
from datetime import datetime

# Añadir el directorio actual al path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("init_tecnicos.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('init_tecnicos')

# Importar funciones para BD de técnicos
try:
    from db_tecnicos import init_tecnicos_db, extraer_tecnicos_de_tickets, get_all_tecnicos
    logger.info("Módulos importados correctamente")
except ImportError as e:
    logger.error(f"Error al importar módulos: {str(e)}")
    sys.exit(1)

def inicializar_bd_tecnicos():
    """Inicializa la base de datos de técnicos y extrae técnicos de tickets"""
    logger.info("Iniciando inicialización de base de datos de técnicos")
    
    # Inicializar BD
    if not init_tecnicos_db():
        logger.error("Error al inicializar la base de datos de técnicos")
        return False
    
    logger.info("Base de datos de técnicos inicializada correctamente")
    
    # Extraer técnicos de los tickets
    if not extraer_tecnicos_de_tickets():
        logger.error("Error al extraer técnicos de tickets")
        return False
    
    logger.info("Técnicos extraídos de tickets correctamente")
    
    # Mostrar técnicos extraídos
    tecnicos = get_all_tecnicos()
    logger.info(f"Se encontraron {len(tecnicos)} técnicos:")
    for tecnico in tecnicos:
        logger.info(f"  - {tecnico['nombre']} ({tecnico['email']})")
    
    return True

def agregar_datos_de_ejemplo():
    """Agrega algunos datos de ejemplo para técnicos frecuentes"""
    try:
        # Conectar a la BD
        DB_DIR = 'basededatos'
        DB_PATH = os.path.join(DB_DIR, 'tickets_data.db')
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Datos de ejemplo para técnicos comunes
        tecnicos_ejemplo = [
            {
                "nombre": "JUAREZ SEVILLA IVAN",
                "cargo": "Especialista en Infraestructura",
                "area": "infraestructura",
                "email": "ijuarez@senasa.gob.pe",
                "telefono": "+51 912 345 678",
                "anexo": "1234",
                "whatsapp": "+51 912 345 678",
                "especialidades": '["Servidores", "Cloud", "Virtualización"]',
                "foto": "https://randomuser.me/api/portraits/men/1.jpg",
                "estado": "disponible"
            },
            {
                "nombre": "RODRIGUEZ PEREZ MARIA",
                "cargo": "Analista de Sistemas",
                "area": "sistemas",
                "email": "mrodriguez@senasa.gob.pe",
                "telefono": "+51 923 456 789",
                "anexo": "1235",
                "whatsapp": "+51 923 456 789",
                "especialidades": '["Desarrollo", "Base de Datos", "API"]',
                "foto": "https://randomuser.me/api/portraits/women/2.jpg",
                "estado": "ocupado"
            },
            {
                "nombre": "MENDOZA ROJAS CARLOS",
                "cargo": "Técnico en Redes",
                "area": "redes",
                "email": "cmendoza@senasa.gob.pe",
                "telefono": "+51 934 567 890",
                "anexo": "1236",
                "whatsapp": "+51 934 567 890",
                "especialidades": '["LAN/WAN", "Switching", "Routing"]',
                "foto": "https://randomuser.me/api/portraits/men/3.jpg",
                "estado": "disponible"
            }
        ]
        
        for tecnico in tecnicos_ejemplo:
            # Verificar si ya existe
            cursor.execute("SELECT id FROM tecnicos WHERE nombre = ?", (tecnico["nombre"],))
            result = cursor.fetchone()
            
            if result:
                # Actualizar técnico existente
                logger.info(f"Actualizando técnico: {tecnico['nombre']}")
                
                cursor.execute('''
                UPDATE tecnicos SET
                    cargo = ?,
                    area = ?,
                    email = ?,
                    telefono = ?,
                    anexo = ?,
                    whatsapp = ?,
                    especialidades = ?,
                    foto = ?,
                    estado = ?
                WHERE nombre = ?
                ''', (
                    tecnico["cargo"],
                    tecnico["area"],
                    tecnico["email"],
                    tecnico["telefono"],
                    tecnico["anexo"],
                    tecnico["whatsapp"],
                    tecnico["especialidades"],
                    tecnico["foto"],
                    tecnico["estado"],
                    tecnico["nombre"]
                ))
            else:
                # Insertar nuevo técnico
                logger.info(f"Agregando técnico de ejemplo: {tecnico['nombre']}")
                
                cursor.execute('''
                INSERT INTO tecnicos (
                    nombre, cargo, area, email, telefono, anexo, whatsapp, 
                    especialidades, foto, estado, fecha_registro
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    tecnico["nombre"],
                    tecnico["cargo"],
                    tecnico["area"],
                    tecnico["email"],
                    tecnico["telefono"],
                    tecnico["anexo"],
                    tecnico["whatsapp"],
                    tecnico["especialidades"],
                    tecnico["foto"],
                    tecnico["estado"],
                    datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                ))
        
        conn.commit()
        conn.close()
        logger.info("Datos de ejemplo agregados correctamente")
        return True
    except Exception as e:
        logger.error(f"Error al agregar datos de ejemplo: {str(e)}")
        return False

if __name__ == "__main__":
    logger.info("=== INICIALIZACIÓN DE BD DE TÉCNICOS ===")
    
    # Inicializar BD y extraer técnicos
    if not inicializar_bd_tecnicos():
        logger.error("Error en la inicialización de la BD de técnicos")
        sys.exit(1)
    
    # Agregar datos de ejemplo
    if not agregar_datos_de_ejemplo():
        logger.error("Error al agregar datos de ejemplo")
        sys.exit(1)
    
    logger.info("Inicialización completada con éxito")
    sys.exit(0)