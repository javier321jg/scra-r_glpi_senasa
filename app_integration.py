import sys
import logging
import os

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("integration.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('app_integration')

# Agregar el directorio actual al path para importar nuestros módulos
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

def integrate_with_main_app(app):
    """
    Integrar nuestras mejoras con la aplicación Flask principal
    
    Args:
        app: La instancia de la aplicación Flask
    """
    try:
        # Importar el middleware de tickets
        from ticket_middleware import register_improved_routes, get_tickets_with_processing
        
        # Registrar las rutas mejoradas
        register_improved_routes(app)
        
        # Modificar la ruta de index para usar el nuevo JavaScript
        @app.context_processor
        def inject_improved_script():
            """Inyectar la bandera para usar el script mejorado"""
            return {
                'use_improved_script': True,
                'version': '1.1.0'  # Para forzar recarga de recursos en caché
            }
        
        # Crear directorio para JS si no existe
        js_dir = os.path.join(app.static_folder, 'js')
        if not os.path.exists(js_dir):
            os.makedirs(js_dir)
            logger.info(f"Directorio creado: {js_dir}")
        
        # Escribir el archivo JS mejorado
        ticket_display_path = os.path.join(js_dir, 'ticket-display.js')
        try:
            # Verificar si debemos sobrescribir el archivo
            should_write = True
            if os.path.exists(ticket_display_path):
                # Si existe y es reciente (menos de 1 día), no sobrescribir
                file_mod_time = os.path.getmtime(ticket_display_path)
                import time
                current_time = time.time()
                if current_time - file_mod_time < 86400:  # 86400 segundos = 1 día
                    should_write = False
                    logger.info(f"Usando archivo existente: {ticket_display_path}")
            
            if should_write:
                # Crear el contenido del script
                with open('script-content.txt', 'r') as f:
                    script_content = f.read()
                
                # Escribir el archivo
                with open(ticket_display_path, 'w', encoding='utf-8') as f:
                    f.write(script_content)
                logger.info(f"Script de visualización creado: {ticket_display_path}")
        except Exception as e:
            logger.error(f"Error al escribir archivo JS: {str(e)}")
        
        # Log de éxito
        logger.info("Integración de mejoras completada correctamente")
        return True
    except Exception as e:
        logger.error(f"Error al integrar mejoras: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    # Para pruebas
    print("Este módulo debe ser importado por la aplicación principal.")