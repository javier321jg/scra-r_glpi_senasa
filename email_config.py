# email_config.py - Manejo de configuración de correo

import os
import json
import logging
import smtplib
import traceback
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from datetime import datetime
from flask import jsonify, request, render_template
import threading
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Configurar logging
logger = logging.getLogger(__name__)

# Archivo para almacenar la configuración
CONFIG_FILE = 'email_config.json'
HISTORY_FILE = 'email_history.json'

# Configuración predeterminada desde variables de entorno
DEFAULT_CONFIG = {
    'server': os.getenv('SMTP_SERVER', 'mail.senasa.gob.pe'),
    'port': int(os.getenv('SMTP_PORT', 587)),
    'user': os.getenv('SMTP_USER', 'PRACTICANTE_INF_001@senasa.gob.pe'),
    'password': os.getenv('SMTP_PASSWORD', ''),
    'to': os.getenv('EMAIL_TO', 'dar321ser@gmail.com'),
    'cc': os.getenv('EMAIL_CC', ''),
    'subject': os.getenv('EMAIL_SUBJECT', 'Reporte de Tickets - SENASA'),
    'message': os.getenv('EMAIL_MESSAGE', 'Adjunto encontrará el reporte diario de tickets en curso.'),
    'enableSchedule': os.getenv('ENABLE_SCHEDULE', 'True').lower() == 'true',
    'scheduleTime': '08:00',  # Mantener para compatibilidad con versiones anteriores
    'scheduleTimes': [t.strip() for t in os.getenv('SCHEDULE_TIMES', '08:00,16:00').split(',')],
    'includeWeekends': os.getenv('INCLUDE_WEEKENDS', 'True').lower() == 'true'
}

# Variable global para la tarea programada
scheduled_task = None

def load_config():
    """Cargar configuración desde archivo."""
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        return DEFAULT_CONFIG
    except Exception as e:
        logger.error(f"Error al cargar configuración: {str(e)}")
        return DEFAULT_CONFIG

def save_config(config):
    """Guardar configuración en archivo."""
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=4)
        return True
    except Exception as e:
        logger.error(f"Error al guardar configuración: {str(e)}")
        return False

def load_history():
    """Cargar historial de envíos."""
    try:
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, 'r') as f:
                return json.load(f)
        return []
    except Exception as e:
        logger.error(f"Error al cargar historial: {str(e)}")
        return []

def save_history(history):
    """Guardar historial de envíos."""
    try:
        with open(HISTORY_FILE, 'w') as f:
            json.dump(history, f, indent=4)
        return True
    except Exception as e:
        logger.error(f"Error al guardar historial: {str(e)}")
        return False

def add_history_entry(recipients, success, error=None):
    """Añadir una entrada al historial."""
    history = load_history()
    entry = {
        'date': datetime.now().strftime('%d/%m/%Y %H:%M'),
        'recipients': recipients,
        'success': success
    }
    
    if error and not success:
        entry['error'] = error
    
    history.insert(0, entry)
    if len(history) > 50:  # Mantener solo las últimas 50 entradas
        history = history[:50]
    
    save_history(history)
    return history

def send_email(config, is_test=False, capture_function=None):
    """
    Enviar un correo electrónico usando la configuración proporcionada.
    
    Args:
        config: Diccionario con la configuración
        is_test: Indica si es un correo de prueba
        capture_function: Función para capturar la pantalla del dashboard
        
    Returns:
        tuple: (éxito, mensaje)
    """
    try:
        # Validar configuración básica
        if not config.get('server') or not config.get('user') or not config.get('to'):
            return False, "Configuración incompleta"
        
        # Preparar destinatarios
        to_list = [email.strip() for email in config['to'].split(',') if email.strip()]
        cc_list = []
        if config.get('cc'):
            cc_list = [email.strip() for email in config['cc'].split(',') if email.strip()]
            
        if not to_list:
            return False, "No hay destinatarios válidos"
            
        # Crear mensaje (importante usar 'alternative' primero)
        msg = MIMEMultipart('alternative')
        
        # Asunto con fecha
        subject = config.get('subject', 'Reporte de Tickets - SENASA')
        if not is_test and '[REPORTE]' not in subject:
            subject = f"[REPORTE {datetime.now().strftime('%d/%m/%Y')}] {subject}"
        elif is_test and '[PRUEBA]' not in subject:
            subject = f"[PRUEBA] {subject}"
            
        msg['Subject'] = subject
        msg['From'] = config['user']
        msg['To'] = ', '.join(to_list)
        if cc_list:
            msg['Cc'] = ', '.join(cc_list)
        
        # Contenido del mensaje
        message_text = config.get('message', 'Reporte de tickets en curso.')
        if is_test:
            message_text += "\n\nEste es un correo de prueba enviado desde la configuración."
        
        # Capturar imagen si existe la función
        screenshot_path = None
        
        if capture_function:
            logger.info("Intentando capturar pantalla para correo...")
            screenshot_path = capture_function()
            logger.info(f"Captura generada: {screenshot_path}")
        else:
            logger.warning("No se proporcionó función de captura")
        
        # Versión texto plano
        plain_text = f"""Reporte de Tickets - SENASA
Fecha: {datetime.now().strftime('%d de %B de %Y')}

{message_text}

Este es un mensaje automático del sistema de seguimiento de tickets.
Por favor no responda a este correo."""

        msg.attach(MIMEText(plain_text, 'plain'))
        
        # Crear el HTML base
        html_content = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 800px; margin: 0 auto; padding: 20px; }}
                .header {{ text-align: center; border-bottom: 2px solid #1e4674; padding-bottom: 15px; margin-bottom: 20px; }}
                .header h2 {{ color: #1e4674; margin: 0; }}
                .header p {{ color: #666; font-size: 14px; }}
                .content {{ margin-bottom: 25px; }}
                .image-container {{ margin: 20px 0; text-align: center; }}
                .image-container img {{ max-width: 100%; border: 1px solid #ddd; }}
                .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #777; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>Reporte de Tickets - SENASA</h2>
                    <p>Fecha: {datetime.now().strftime('%d de %B de %Y')}</p>
                </div>
                
                <div class="content">
"""
        # Reemplazar saltos de línea fuera de la f-string
        message_html = message_text.replace('\n', '<br>')
        html_content += f"""
            {message_html}
        </div>
        """
        
        # Verificar y procesar la imagen
        if screenshot_path and os.path.exists(screenshot_path):
            try:
                # Crear una parte relacionada para la imagen
                html_content += f"""
                <div class="image-container">
                    <img src="cid:image1" alt="Reporte de Tickets">
                </div>
                """
                html_final = html_content + """
                <div class="footer">
                    <p>Este es un mensaje automático del sistema de seguimiento de tickets.</p>
                    <p>Por favor no responda a este correo.</p>
                </div>
            </div>
        </body>
        </html>
                """
                
                # Crear la versión HTML del mensaje
                html_part = MIMEText(html_final, 'html')
                msg.attach(html_part)
                
                # Convertir el mensaje a una estructura mixta
                msg_root = MIMEMultipart('related')
                
                # Copiar los encabezados
                msg_root['Subject'] = msg['Subject']
                msg_root['From'] = msg['From']
                msg_root['To'] = msg['To']
                if 'Cc' in msg:
                    msg_root['Cc'] = msg['Cc']
                
                # Adjuntar la parte alternativa
                msg_root.attach(msg)
                
                # Adjuntar la imagen con Content-ID
                with open(screenshot_path, 'rb') as img:
                    img_part = MIMEApplication(img.read())
                    img_part.add_header('Content-ID', '<image1>')
                    img_part.add_header('Content-Disposition', 'inline')
                    msg_root.attach(img_part)
                
                # Usar el mensaje root
                msg = msg_root
                
                logger.info("Imagen incrustada correctamente en el HTML")
            except Exception as img_err:
                logger.error(f"Error al incrustar imagen: {str(img_err)}")
                traceback.print_exc()
                
                # Completar el HTML sin la imagen
                html_content += """
                <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #ffc107; color: #666;">
                    <p>No se pudo cargar la imagen del reporte.</p>
                </div>
                """
                html_final = html_content + """
                <div class="footer">
                    <p>Este es un mensaje automático del sistema de seguimiento de tickets.</p>
                    <p>Por favor no responda a este correo.</p>
                </div>
            </div>
        </body>
        </html>
                """
                html_part = MIMEText(html_final, 'html')
                msg.attach(html_part)
        else:
            # HTML sin imagen
            html_content += """
            <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #ffc107; color: #666;">
                <p>No hay captura disponible para este reporte.</p>
            </div>
            """
            html_final = html_content + """
            <div class="footer">
                <p>Este es un mensaje automático del sistema de seguimiento de tickets.</p>
                <p>Por favor no responda a este correo.</p>
            </div>
        </div>
    </body>
    </html>
            """
            html_part = MIMEText(html_final, 'html')
            msg.attach(html_part)
            
            if screenshot_path:
                logger.error(f"La ruta de imagen existe pero el archivo no: {screenshot_path}")
            else:
                logger.warning("No se capturó ninguna imagen para incrustar")
        
        # Enviar correo
        logger.info(f"Conectando al servidor SMTP: {config['server']}:{config['port']}")
        with smtplib.SMTP(config['server'], int(config['port'])) as server:
            server.starttls()
            logger.info(f"Iniciando sesión como: {config['user']}")
            server.login(config['user'], config['password'])
            all_recipients = to_list + cc_list
            logger.info(f"Enviando correo a: {', '.join(all_recipients)}")
            server.send_message(msg)
            
        # Registrar en historial
        recipients_str = ', '.join(to_list)
        add_history_entry(recipients_str, True)
        
        logger.info(f"Correo enviado exitosamente a {recipients_str}")
        return True, "Correo enviado correctamente"
        
    except smtplib.SMTPAuthenticationError:
        error_msg = "Error de autenticación. Revise usuario y contraseña."
        logger.error(error_msg)
        add_history_entry(config.get('to', ''), False, error_msg)
        return False, error_msg
    
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error al enviar correo: {error_msg}")
        traceback.print_exc()  # Imprimir traza completa para diagnóstico
        add_history_entry(config.get('to', ''), False, error_msg)
        return False, error_msg

def process_tickets_for_template(tickets, fecha_actual, hora_actual):
    """
    Procesa los tickets para generar los datos necesarios para la plantilla.
    
    Args:
        tickets: Lista de tickets en curso
        fecha_actual: Fecha actual formateada
        hora_actual: Hora actual formateada
        
    Returns:
        dict: Datos para la plantilla
    """
    from datetime import datetime
    import logging
    
    logger = logging.getLogger(__name__)
    logger.info(f"Procesando {len(tickets)} tickets para la plantilla")
    
    # Función para parsear fechas
    def parse_date(date_str):
        if not date_str:
            return datetime.now()
        
        try:
            # Intentar diferentes formatos
            formats = [
                '%d-%m-%Y %H:%M:%S',
                '%d-%m-%Y %H:%M',
                '%d/%m/%Y %H:%M:%S',
                '%d/%m/%Y %H:%M',
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%d %H:%M'
            ]
            
            for fmt in formats:
                try:
                    return datetime.strptime(date_str, fmt)
                except ValueError:
                    continue
                    
            # Si no coincide con ningún formato, usar la fecha actual
            return datetime.now()
        except Exception as e:
            logger.error(f"Error al parsear fecha '{date_str}': {str(e)}")
            return datetime.now()
    
    # Función para formatear meses
    def format_month(month_year):
        month, year = month_year.split('-')
        months = {
            '01': 'Enero', '02': 'Febrero', '03': 'Marzo',
            '04': 'Abril', '05': 'Mayo', '06': 'Junio',
            '07': 'Julio', '08': 'Agosto', '09': 'Septiembre',
            '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
        }
        return f"{months[month]} {year}"
    
    # Obtener todos los meses únicos
    months_set = set()
    
    # Contar cuántos tickets tienen fecha de apertura
    ticketsConFecha = 0
    
    for ticket in tickets:
        try:
            # Intentar diferentes campos de fecha
            fechaValida = None
            
            # Comprobar varias posibilidades de nombres de campo para fecha
            posiblesFechas = [
                ticket.get('Fecha_apertura'),
                ticket.get('fecha_apertura'),
                ticket.get('ultima_modificacion'),
                ticket.get('Ultima_modificacion'),
                ticket.get('fecha_registro')
            ]
            
            for fecha in posiblesFechas:
                if fecha and isinstance(fecha, str) and fecha.strip():
                    try:
                        fechaParsed = parse_date(fecha)
                        if fechaParsed and not isinstance(fechaParsed, str):
                            fechaValida = fechaParsed
                            ticketsConFecha += 1
                            break
                    except Exception:
                        # Continuar con el siguiente campo
                        continue
            
            # Si encontramos una fecha válida, añadir el mes a los meses únicos
            if fechaValida:
                monthYear = f"{(fechaValida.month):02d}-{fechaValida.year}"
                months_set.add(monthYear)
            else:
                # Si no encontramos fecha, usar el mes actual
                ahora = datetime.now()
                currentMonth = f"{(ahora.month):02d}-{ahora.year}"
                months_set.add(currentMonth)
        except Exception as e:
            logger.error(f"Error procesando fecha de ticket: {str(e)}")
    
    logger.info(f"Tickets con fecha válida: {ticketsConFecha} de {len(tickets)}")
    
    # Ordenar meses (más reciente primero)
    all_months = sorted(list(months_set), key=lambda x: tuple(map(int, x.split('-'))), reverse=True)
    
    # Estructuras para contar tickets por técnico y mes
    technician_data = {}
    month_totals = {}
    grand_total = 0
    
    for ticket in tickets:
        try:
            # Buscar valor de técnico en varios posibles campos
            tecnico = 'Sin asignar'
            
            # Comprobar varias posibilidades de nombres de campo
            posiblesAsignados = [
                ticket.get('Asignado_a'),
                ticket.get('asignado_a'),
                ticket.get('Asignado'),
                ticket.get('asignado'),
                ticket.get('responsable'),
                ticket.get('Responsable'),
                ticket.get('tecnico'),
                ticket.get('Tecnico')
            ]
            
            for asignado in posiblesAsignados:
                if asignado and isinstance(asignado, str) and asignado.strip():
                    tecnico = asignado.strip()
                    break
            
            # Buscar fecha válida
            fechaApertura = datetime.now()
            posiblesFechas = [
                ticket.get('Fecha_apertura'),
                ticket.get('fecha_apertura'),
                ticket.get('ultima_modificacion'),
                ticket.get('Ultima_modificacion'),
                ticket.get('fecha_registro')
            ]
            
            for fecha in posiblesFechas:
                if fecha and isinstance(fecha, str) and fecha.strip():
                    try:
                        fechaParsed = parse_date(fecha)
                        if fechaParsed and not isinstance(fechaParsed, str):
                            fechaApertura = fechaParsed
                            break
                    except Exception:
                        # Continuar con el siguiente campo
                        continue
            
            monthYear = f"{(fechaApertura.month):02d}-{fechaApertura.year}"
            
            # Inicializar
            if tecnico not in technician_data:
                technician_data[tecnico] = {'months': {}, 'total': 0, 'nombre': tecnico}
                for m in all_months:
                    technician_data[tecnico]['months'][m] = 0
                    
            if monthYear not in month_totals:
                month_totals[monthYear] = 0
            
            # Contar
            technician_data[tecnico]['months'][monthYear] += 1
            technician_data[tecnico]['total'] += 1
            month_totals[monthYear] += 1
            grand_total += 1
        except Exception as e:
            logger.error(f"Error procesando ticket: {str(e)}")
    
    # Convertir a lista para la plantilla - ordenados alfabéticamente
    technicians_list = list(technician_data.values())
    technicians_list.sort(key=lambda x: x['nombre'])
    
    # Formatear meses para mostrar
    formatted_months = [format_month(m) for m in all_months]
    
    # Determinar el mes más reciente
    ultimo_mes = formatted_months[0] if formatted_months else "N/A"
    
    # Preparar datos para la plantilla
    template_data = {
        'fecha_actual': fecha_actual,
        'hora_actual': hora_actual,
        'total_tickets': grand_total,
        'total_tecnicos': len(technicians_list),
        'ultimo_mes': ultimo_mes,
        'months': formatted_months,
        'all_months': all_months,  # Para referencias internas
        'technicians': technicians_list,
        'month_totals': month_totals,
        'grand_total': grand_total
    }
    
    return template_data

def send_html_report(config, tickets_en_curso=None, is_test=False):
    """
    Enviar un correo electrónico con el reporte de tickets en curso como HTML.
    
    Args:
        config: Diccionario con la configuración
        tickets_en_curso: Lista de tickets en curso (si es None, se obtienen de la BD)
        is_test: Indica si es un correo de prueba
        
    Returns:
        tuple: (éxito, mensaje)
    """
    try:
        from datetime import datetime
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        from flask import render_template
        import logging
        
        logger = logging.getLogger(__name__)
        
        # Importar funciones desde la app principal
        from db_sqlite import get_tickets_from_db
        
        # Validar configuración básica
        if not config.get('server') or not config.get('user') or not config.get('to'):
            return False, "Configuración incompleta"
        
        # Preparar destinatarios
        to_list = [email.strip() for email in config['to'].split(',') if email.strip()]
        cc_list = []
        if config.get('cc'):
            cc_list = [email.strip() for email in config['cc'].split(',') if email.strip()]
            
        if not to_list:
            return False, "No hay destinatarios válidos"
        
        # Obtener tickets en curso si no se proporcionaron
        if tickets_en_curso is None:
            # Obtener tickets de la tabla tickets_curso SIN filtrado adicional
            tickets_en_curso = get_tickets_from_db('curso')

        logger.info(f"Procesando reporte HTML con {len(tickets_en_curso)} tickets en curso")

        # Obtener la fecha actual
        fecha_actual = datetime.now().strftime('%d/%m/%Y')
        hora_actual = datetime.now().strftime('%H:%M')

        # Preparar datos para la plantilla de correo
        template_data = process_tickets_for_template(tickets_en_curso, fecha_actual, hora_actual)

        # ===================================
        # INTEGRACIÓN DE INTELIGENCIA DE NEGOCIO (BI)
        # ===================================
        try:
            from analytics import get_picos_forecast
            from db_tecnicos import get_tecnicos_ranking_bi

            logger.info("Integrando datos de BI en el reporte...")

            # Obtener pronóstico de picos
            try:
                forecast_data = get_picos_forecast()
                if forecast_data.get('status') == 'success':
                    template_data['forecast'] = forecast_data.get('forecast', [])
                    template_data['forecast_summary'] = forecast_data.get('summary', {})
                    logger.info("Pronóstico de picos incluido en el reporte")
                else:
                    logger.warning(f"Pronóstico no disponible: {forecast_data.get('message')}")
                    template_data['forecast'] = []
            except Exception as forecast_err:
                logger.warning(f"Error al obtener pronóstico: {str(forecast_err)}")
                template_data['forecast'] = []

            # Obtener ranking de técnicos
            try:
                ranking_data = get_tecnicos_ranking_bi()
                if ranking_data:
                    template_data['technician_ranking'] = ranking_data[:5]  # Top 5 técnicos
                    logger.info(f"Ranking de {len(ranking_data)} técnicos incluido en el reporte")
                else:
                    logger.warning("No hay datos de ranking disponibles")
                    template_data['technician_ranking'] = []
            except Exception as ranking_err:
                logger.warning(f"Error al obtener ranking: {str(ranking_err)}")
                template_data['technician_ranking'] = []

        except ImportError:
            logger.warning("Módulos de BI (analytics, db_tecnicos) no disponibles para el reporte")
            template_data['forecast'] = []
            template_data['technician_ranking'] = []

        # ===================================
        # FIN INTEGRACIÓN DE BI
        # ===================================
        
        # Crear mensaje (importante usar 'alternative' para contenido HTML)
        msg = MIMEMultipart('alternative')
        
        # Asunto con fecha
        subject = config.get('subject', 'Reporte de Tickets - SENASA')
        if not is_test and '[REPORTE]' not in subject:
            subject = f"[REPORTE {fecha_actual}] {subject}"
        elif is_test and '[PRUEBA]' not in subject:
            subject = f"[PRUEBA] {subject}"
            
        msg['Subject'] = subject
        msg['From'] = config['user']
        msg['To'] = ', '.join(to_list)
        if cc_list:
            msg['Cc'] = ', '.join(cc_list)
        
        # Contenido personalizado del mensaje
        message_text = config.get('message', 'Reporte de tickets en curso.')
        if is_test:
            message_text += "\n\nEste es un correo de prueba enviado desde la configuración."
        
        # Versión texto plano
        plain_text = f"""Reporte de Tickets en Curso - SENASA
Fecha: {fecha_actual}

{message_text}

Total de tickets en curso: {template_data['total_tickets']}
Técnicos asignados: {template_data['total_tecnicos']}

Este es un mensaje automático del sistema de seguimiento de tickets.
Por favor no responda a este correo."""

        msg.attach(MIMEText(plain_text, 'plain'))
        
        # Renderizar la plantilla HTML con los datos de tickets
        try:
            # Usar Flask para renderizar la plantilla
            from flask import current_app
            
            # Renderizar la plantilla HTML con los datos
            html_content = current_app.jinja_env.get_template('email_tickets_report.html').render(**template_data)
            
            # Añadir la parte HTML al mensaje
            msg.attach(MIMEText(html_content, 'html'))
            logger.info("Plantilla HTML renderizada correctamente")
        except Exception as e:
            logger.error(f"Error al renderizar plantilla HTML: {str(e)}")
            import traceback
            traceback.print_exc()
            # Si falla la renderización de la plantilla, usar un HTML básico
            basic_html = f"""
            <html>
            <body>
                <h1>Reporte de Tickets en Curso - SENASA</h1>
                <p>Fecha: {fecha_actual}</p>
                <p>{message_text}</p>
                <p>Total de tickets en curso: <strong>{template_data['total_tickets']}</strong></p>
                <p>Técnicos asignados: <strong>{template_data['total_tecnicos']}</strong></p>
                <p>Error al generar la tabla detallada: {str(e)}</p>
                <hr>
                <p style="font-size: 12px; color: #666;">Este es un mensaje automático del sistema de seguimiento de tickets.<br>
                Por favor no responda a este correo.</p>
            </body>
            </html>
            """
            msg.attach(MIMEText(basic_html, 'html'))
        
        # Enviar correo
        logger.info(f"Intentando conectar al servidor SMTP: {config['server']}:{config['port']}")
        with smtplib.SMTP(config['server'], int(config['port'])) as server:
            server.starttls()
            logger.info(f"Iniciando sesión como: {config['user']}")
            server.login(config['user'], config['password'])
            all_recipients = to_list + cc_list
            logger.info(f"Enviando correo a: {', '.join(all_recipients)}")
            server.send_message(msg)
            logger.info("Correo enviado exitosamente")
            
        # Registrar en historial
        recipients_str = ', '.join(to_list)
        add_history_entry(recipients_str, True)
        
        return True, "Correo con reporte HTML enviado correctamente"
        
    except smtplib.SMTPAuthenticationError:
        error_msg = "Error de autenticación. Revise usuario y contraseña."
        add_history_entry(config.get('to', ''), False, error_msg)
        return False, error_msg
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        error_msg = str(e)
        add_history_entry(config.get('to', ''), False, error_msg)
        return False, error_msg

def setup_scheduled_task(app, scheduler, capture_function=None):
    """
    Configurar tareas programadas para envío de reportes.
    
    Args:
        app: Aplicación Flask
        scheduler: Instancia de BackgroundScheduler
        capture_function: Función para capturar la pantalla
    """
    global scheduled_task
    scheduled_tasks = []
    
    # Cancelar tareas anteriores si existen
    if scheduled_task:
        scheduler.remove_job(scheduled_task.id)
    else:
        # Buscar y eliminar todas las tareas relacionadas con reportes
        for job in scheduler.get_jobs():
            if job.id.startswith('daily_report'):
                scheduler.remove_job(job.id)
    
    config = load_config()
    
    # Verificar si está habilitada la programación
    if not config.get('enableSchedule', True):
        logger.info("Programación de envío de reportes deshabilitada")
        return None
    
    # Función que se ejecutará con la tarea programada (para envío de imagen)
    def send_scheduled_report():
        with app.app_context():
            logger.info("Ejecutando envío programado de reporte")
            current_config = load_config()  # Cargar configuración actual
            success, message = send_email(current_config, is_test=False, capture_function=capture_function)
            if success:
                logger.info("Reporte programado enviado correctamente")
            else:
                logger.error(f"Error al enviar reporte programado: {message}")
    
    # Función que se ejecutará con la tarea programada (para envío HTML)
    def send_scheduled_html_report():
        with app.app_context():
            logger.info("Ejecutando envío programado de reporte HTML")
            
            try:
                # Cargar configuración actual
                current_config = load_config()
                
                # Obtener tickets en curso
                from db_sqlite import get_tickets_from_db
                tickets_en_curso = get_tickets_from_db('curso')
                
                # Enviar reporte HTML
                success, message = send_html_report(current_config, tickets_en_curso=tickets_en_curso, is_test=False)
                
                if success:
                    logger.info("Reporte HTML programado enviado correctamente")
                else:
                    logger.error(f"Error al enviar reporte HTML programado: {message}")
                    
            except Exception as e:
                logger.error(f"Error en la tarea programada de reporte HTML: {str(e)}")
                traceback.print_exc()
    
    # Configurar días (con o sin fines de semana)
    # En APScheduler, los días van de 0-6 (lunes a domingo)
    days = '0-6'  # Todos los días por defecto
    if not config.get('includeWeekends', True):
        days = '0-4'  # Lunes a viernes
    
    # Usar el nuevo campo scheduleTimes si existe
    schedule_times = config.get('scheduleTimes', [])
    
    # Si no hay horarios múltiples, usar el horario único tradicional
    if not schedule_times:
        time_parts = config.get('scheduleTime', '08:00').split(':')
        hour = int(time_parts[0])
        minute = int(time_parts[1]) if len(time_parts) > 1 else 0
        
        # Programar la tarea con el horario único
        from apscheduler.triggers.cron import CronTrigger
        trigger = CronTrigger(hour=hour, minute=minute, day_of_week=days)
        job = scheduler.add_job(
            send_scheduled_html_report,  # Usar la función para HTML
            trigger=trigger,
            id='daily_report',
            replace_existing=True
        )
        scheduled_tasks.append(job)
        logger.info(f"Envío de reportes HTML programado para las {hour:02d}:{minute:02d}, días: {days}")
    else:
        # Programar múltiples tareas con los diferentes horarios
        from apscheduler.triggers.cron import CronTrigger
        for i, schedule_time in enumerate(schedule_times):
            time_parts = schedule_time.split(':')
            hour = int(time_parts[0])
            minute = int(time_parts[1]) if len(time_parts) > 1 else 0
            
            trigger = CronTrigger(hour=hour, minute=minute, day_of_week=days)
            job = scheduler.add_job(
                send_scheduled_html_report,  # Usar la función para HTML
                trigger=trigger,
                id=f'daily_report_{i}',
                replace_existing=True
            )
            scheduled_tasks.append(job)
            logger.info(f"Envío de reportes HTML programado para las {hour:02d}:{minute:02d}, días: {days}")
    
    # Actualizar la variable global para mantener referencia a la primera tarea (compatibilidad)
    if scheduled_tasks:
        scheduled_task = scheduled_tasks[0]
    
    return scheduled_tasks

def register_routes(app, scheduler, capture_function=None):
    """
    Registrar rutas para la configuración de correo en la aplicación Flask.
    
    Args:
        app: Aplicación Flask
        scheduler: Instancia de BackgroundScheduler
        capture_function: Función para capturar la pantalla
    """
    
    # Inicializar configuración de correo y programación
    try:
        # Asegurarse de que los archivos existan
        if not os.path.exists(CONFIG_FILE):
            save_config(DEFAULT_CONFIG)
            
        if not os.path.exists(HISTORY_FILE):
            save_history([])
            
        # Configurar tarea programada
        setup_scheduled_task(app, scheduler, capture_function)
        
        logger.info("Configuración de correo inicializada")
    except Exception as e:
        logger.error(f"Error al inicializar configuración de correo: {str(e)}")
        traceback.print_exc()
    
    @app.route('/config-email')
    def config_email_page():
        """Página de configuración de correo."""
        return render_template('email_config.html')
    
    @app.route('/api/generate-preview', methods=['GET'])
    def generate_preview_api():
        """API para generar una previsualización del reporte."""
        try:
            # Si no hay función de captura, mostrar error
            if not capture_function:
                logger.error("Función de captura no disponible para previsualización")
                return jsonify({
                    'success': False,
                    'error': 'Función de captura no disponible'
                })
            
            # Generar captura de pantalla
            logger.info("Generando captura para previsualización...")
            screenshot_path = capture_function()
            
            if not screenshot_path or not os.path.exists(screenshot_path):
                logger.error(f"No se pudo generar la previsualización: {screenshot_path}")
                return jsonify({
                    'success': False,
                    'error': 'No se pudo generar la previsualización'
                })
            
            # Obtener la URL relativa de la imagen
            # Suponiendo que está en la carpeta static
            image_url = '/' + os.path.join(
                'static', 
                os.path.basename(screenshot_path)
            ).replace('\\', '/')
            
            logger.info(f"Previsualización generada: {image_url}")
            return jsonify({
                'success': True,
                'message': 'Previsualización generada correctamente',
                'image_url': image_url,
                'timestamp': datetime.now().strftime('%d/%m/%Y %H:%M:%S')
            })
        except Exception as e:
            logger.error(f"Error al generar previsualización: {str(e)}")
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            })
    
    @app.route('/api/email-config', methods=['GET'])
    def get_email_config():
        """API para obtener la configuración de correo."""
        try:
            config = load_config()
            
            # No devolver la contraseña por seguridad
            if 'password' in config:
                config['password'] = ''
            
            # Obtener historial reciente
            history = load_history()[:10]  # Mostrar solo los 10 más recientes
            
            return jsonify({
                'success': True,
                'config': config,
                'history': history
            })
        except Exception as e:
            logger.error(f"Error al obtener configuración: {str(e)}")
            return jsonify({
                'success': False,
                'error': str(e)
            })
    
    @app.route('/api/email-config', methods=['POST'])
    def save_email_config_api():
        """API para guardar la configuración de correo."""
        try:
            config = request.get_json()
            
            # Validar campos requeridos
            required_fields = ['server', 'port', 'user', 'to']
            for field in required_fields:
                if not config.get(field):
                    return jsonify({
                        'success': False,
                        'error': f'El campo {field} es requerido'
                    })
            
            # Si no viene contraseña y hay configuración existente, mantener la anterior
            if not config.get('password'):
                existing_config = load_config()
                config['password'] = existing_config.get('password', '')
            
            # Guardar configuración
            success = save_config(config)
            if not success:
                return jsonify({
                    'success': False,
                    'error': 'Error al guardar la configuración'
                })
            
            # Actualizar tarea programada
            setup_scheduled_task(app, scheduler, capture_function)
            
            # Obtener historial reciente
            history = load_history()[:10]
            
            return jsonify({
                'success': True,
                'message': 'Configuración guardada correctamente',
                'history': history
            })
        except Exception as e:
            logger.error(f"Error al guardar configuración: {str(e)}")
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            })
    
    @app.route('/api/send-test-email', methods=['POST'])
    def send_test_email_api():
        """API para enviar un correo de prueba."""
        try:
            logger.info("Recibida solicitud para enviar correo de prueba")
            config = request.get_json()
            
            # Validar campos requeridos
            required_fields = ['server', 'port', 'user', 'password', 'to']
            for field in required_fields:
                if not config.get(field):
                    logger.error(f"Campo requerido faltante: {field}")
                    return jsonify({
                        'success': False,
                        'error': f'El campo {field} es requerido'
                    })
            
            # Enviar correo de prueba con función de captura
            logger.info("Enviando correo de prueba con captura...")
            success, message = send_email(config, is_test=True, capture_function=capture_function)
            
            if success:
                # Obtener historial actualizado
                history = load_history()[:10]
                
                return jsonify({
                    'success': True,
                    'message': 'Correo de prueba enviado correctamente',
                    'history': history
                })
            else:
                return jsonify({
                    'success': False,
                    'error': message
                })
        except Exception as e:
            logger.error(f"Error al enviar correo de prueba: {str(e)}")
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            })
    
    @app.route('/api/send-manual-report', methods=['POST'])
    def send_manual_report_api():
        """API para enviar un reporte manualmente."""
        try:
            data = request.get_json() or {}
            config = load_config()
            
            # Si se especifican destinatarios temporales
            if 'to' in data and data['to']:
                config['to'] = data['to']
            
            # Enviar reporte
            success, message = send_email(config, is_test=False, capture_function=capture_function)
            
            if success:
                return jsonify({
                    'success': True,
                    'message': 'Reporte enviado correctamente'
                })
            else:
                return jsonify({
                    'success': False,
                    'error': message
                })
        except Exception as e:
            logger.error(f"Error al enviar reporte manual: {str(e)}")
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            })
    
    @app.route('/api/send-html-report', methods=['POST'])
    def send_html_report_api():
        """API para enviar reporte de tickets en curso como HTML."""
        try:
            data = request.get_json() or {}
            
            # Cargar configuración
            config = load_config()
            
            # Si se especifican destinatarios temporales
            if 'to' in data and data['to']:
                config['to'] = data['to']
                
            logger.info(f"Recibida solicitud para enviar reporte HTML a: {config['to']}")
            
            # Obtener tickets en curso - SIN FILTRADO ADICIONAL
            # Ya están filtrados por la base de datos al estar en la tabla tickets_curso
            from db_sqlite import get_tickets_from_db
            tickets_en_curso = get_tickets_from_db('curso')
            
            logger.info(f"Enviando reporte HTML con {len(tickets_en_curso)} tickets en curso")
            
            # Enviar reporte HTML
            success, message = send_html_report(config, tickets_en_curso=tickets_en_curso, is_test=data.get('test', False))
            
            if success:
                return jsonify({
                    'success': True,
                    'message': 'Reporte HTML enviado correctamente'
                })
            else:
                return jsonify({
                    'success': False,
                    'error': message
                })
        except Exception as e:
            logger.error(f"Error al enviar reporte HTML: {str(e)}")
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            })
            
    @app.route('/render-tickets-html', methods=['GET'])
    def render_tickets_html():
        """Renderiza el reporte HTML de tickets para previsualización."""
        try:
            # Obtener tickets en curso
            from db_sqlite import get_tickets_from_db
            tickets_en_curso = get_tickets_from_db('curso')
            
            # Procesar tickets para la plantilla
            fecha_actual = datetime.now().strftime('%d/%m/%Y')
            hora_actual = datetime.now().strftime('%H:%M')
            
            template_data = process_tickets_for_template(tickets_en_curso, fecha_actual, hora_actual)
            
            # Renderizar la plantilla HTML
            return render_template('email_tickets_report.html', **template_data)
        except Exception as e:
            logger.error(f"Error al renderizar HTML de tickets: {str(e)}")
            traceback.print_exc()
            return f"<h1>Error</h1><p>{str(e)}</p>"

# Función auxiliar para enviado manual desde código
def send_manual_email_with_capture(capture_function=None, to_email=None):
    """
    Enviar un correo manualmente con la configuración guardada.
    
    Args:
        capture_function: Función para capturar la pantalla
        to_email: Destinatario específico (opcional)
        
    Returns:
        tuple: (éxito, mensaje)
    """
    config = load_config()
    
    # Sobrescribir destinatario si se proporciona
    if to_email:
        config['to'] = to_email
        
    return send_email(config, is_test=False, capture_function=capture_function)