import time
import os
import json
import logging
import pandas as pd
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from webdriver_manager.chrome import ChromeDriverManager
from selenium.common.exceptions import (
    TimeoutException, 
    NoSuchElementException, 
    ElementNotInteractableException,
    StaleElementReferenceException
)

# Configuración de directorios
base_dir = "china_scraper_data"
if not os.path.exists(base_dir):
    os.makedirs(base_dir)

extract_dir = os.path.join(base_dir, "extracted_data")
if not os.path.exists(extract_dir):
    os.makedirs(extract_dir)

log_dir = os.path.join(base_dir, "logs")
if not os.path.exists(log_dir):
    os.makedirs(log_dir)

screenshot_dir = os.path.join(base_dir, "extraction_screenshots")
if not os.path.exists(screenshot_dir):
    os.makedirs(screenshot_dir)

# Configurar logging
log_file = os.path.join(log_dir, f"direct_extractor_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("direct_extractor")

class DirectExtractor:
    def __init__(self):
        self.driver = None
        self.timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        self.output_files = {
            "excel": os.path.join(extract_dir, f"china_data_{self.timestamp}.xlsx"),
            "csv": os.path.join(extract_dir, f"china_data_{self.timestamp}.csv"),
            "json": os.path.join(extract_dir, f"china_data_{self.timestamp}.json")
        }
        self.all_data = []
        self.current_page = 1
        self.max_pages = 100  # Valor predeterminado, se puede ajustar
    
    def take_screenshot(self, name):
        """Toma una captura de pantalla y la guarda con un nombre específico"""
        if not self.driver:
            return None
            
        filename = os.path.join(screenshot_dir, f"{name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
        try:
            self.driver.save_screenshot(filename)
            logger.info(f"Captura de pantalla guardada: {filename}")
            return filename
        except Exception as e:
            logger.error(f"Error al tomar captura de pantalla: {e}")
            return None
    
    def initialize_browser(self):
        """Inicializa el navegador Chrome"""
        try:
            logger.info("Inicializando navegador Chrome")
            
            chrome_options = Options()
            chrome_options.add_argument("--window-size=1920,1080")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-infobars")
            
            self.driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
            self.driver.maximize_window()
            logger.info("Navegador Chrome iniciado correctamente")
            self.take_screenshot("browser_start")
            
            return True
        except Exception as e:
            logger.error(f"Error al iniciar navegador: {e}")
            return False
    
    def wait_for_element(self, by, value, timeout=20, screenshot_name=None):
        """Espera a que un elemento esté presente y toma una captura si se solicita"""
        logger.info(f"Esperando elemento: {by}={value}")
        try:
            element = WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((by, value))
            )
            if screenshot_name:
                self.take_screenshot(screenshot_name)
            return element
        except TimeoutException:
            logger.error(f"Timeout esperando elemento: {by}={value}")
            self.take_screenshot(f"error_timeout_{screenshot_name}")
            return None
    
    def safe_click(self, element, element_name):
        """Intenta hacer clic de manera segura usando diferentes métodos"""
        logger.info(f"Intentando hacer clic en: {element_name}")
        
        methods = [
            lambda: element.click(),  # Método estándar
            lambda: ActionChains(self.driver).move_to_element(element).click().perform(),  # ActionChains
            lambda: self.driver.execute_script("arguments[0].click();", element)  # JavaScript
        ]
        
        for i, method in enumerate(methods):
            try:
                method()
                logger.info(f"Clic exitoso en {element_name} con método {i+1}")
                return True
            except Exception as e:
                logger.warning(f"Método {i+1} falló para clic en {element_name}: {str(e)}")
                time.sleep(1)
        
        logger.error(f"Todos los métodos de clic fallaron para {element_name}")
        self.take_screenshot(f"click_error_{element_name}")
        return False
    
    def navigate_to_page(self):
        """Navega a la página principal"""
        try:
            url = "https://scintl.chinaport.gov.cn/aprwebserver/pages/apr/public/html/companyList.html"
            logger.info(f"Navegando a: {url}")
            self.driver.get(url)
            
            # Esperar a que la página cargue
            time.sleep(5)
            self.take_screenshot("page_loaded")
            
            # Esperar a que el contenedor principal cargue
            main_container = self.wait_for_element(By.ID, "dataListDiv", timeout=30, screenshot_name="main_container")
            if not main_container:
                logger.error("No se pudo cargar el contenedor principal")
                return False
            
            logger.info("Página cargada correctamente")
            return True
        except Exception as e:
            logger.error(f"Error en navegación: {e}")
            return False
    
    def apply_specific_filters(self):
        """Aplica los filtros específicos que se muestran en la imagen"""
        try:
            logger.info("Aplicando filtros específicos")
            self.take_screenshot("before_filters")
            
            # 1. Seleccionar tipo: "动物及动物产品 Animal and animal products"
            try:
                # Esperar a que el selector sea clickeable
                type_select = self.wait_for_element(By.CSS_SELECTOR, "select[name='prodCategoryType']", 
                                                 screenshot_name="type_select")
                if type_select:
                    select = Select(type_select)
                    options = select.options
                    
                    # Imprimir todas las opciones disponibles para diagnóstico
                    logger.info("Opciones disponibles para prodCategoryType:")
                    for i, option in enumerate(options):
                        logger.info(f"  {i}: {option.text} (value: {option.get_attribute('value')})")
                    
                    # Intentar varias estrategias para seleccionar "Animal and animal products"
                    try:
                        # Intento 1: Por texto visible
                        select.select_by_visible_text("动物及动物产品 Animal and animal products")
                        logger.info("Seleccionado por texto visible: 动物及动物产品 Animal and animal products")
                    except:
                        try:
                            # Intento 2: Por valor (si es 01 para Animal)
                            select.select_by_value("01")
                            logger.info("Seleccionado por valor: 01")
                        except:
                            try:
                                # Intento 3: Por índice (asumiendo que es la primera opción real)
                                if len(options) > 1:
                                    select.select_by_index(1)
                                    logger.info(f"Seleccionado por índice: 1 ({options[1].text})")
                                else:
                                    logger.warning("No hay suficientes opciones para seleccionar por índice")
                            except Exception as e:
                                logger.error(f"Todos los métodos de selección fallaron: {e}")
                    
                    time.sleep(3)  # Esperar a que la selección surta efecto
                    self.take_screenshot("after_type_selection")
                else:
                    logger.error("No se encontró el selector de tipo")
            except Exception as e:
                logger.error(f"Error al seleccionar tipo: {e}")
            
            # 2. Seleccionar país/región (primer elemento después de "-- Select --")
            try:
                country_select = self.wait_for_element(By.CSS_SELECTOR, "select[name='countryCode']", 
                                                    screenshot_name="country_select")
                if country_select:
                    select = Select(country_select)
                    options = select.options
                    
                    # Imprimir todas las opciones disponibles para diagnóstico
                    logger.info("Opciones disponibles para countryCode:")
                    for i, option in enumerate(options):
                        logger.info(f"  {i}: {option.text} (value: {option.get_attribute('value')})")
                    
                    # Seleccionar la primera opción que no sea "-- Select --"
                    for i, option in enumerate(options):
                        if i > 0 and option.text.strip() != "" and "select" not in option.text.lower():
                            select.select_by_index(i)
                            logger.info(f"Seleccionado país por índice: {i} ({option.text})")
                            break
                    
                    time.sleep(3)  # Esperar a que la selección surta efecto
                    self.take_screenshot("after_country_selection")
                else:
                    logger.error("No se encontró el selector de país")
            except Exception as e:
                logger.error(f"Error al seleccionar país: {e}")
            
            # 3. Seleccionar estado de registro como "Normal"
            try:
                status_select = self.wait_for_element(By.CSS_SELECTOR, "select[name='regState']", 
                                                   screenshot_name="status_select")
                if status_select:
                    select = Select(status_select)
                    try:
                        select.select_by_visible_text("正常 (有效) Normal")
                        logger.info("Seleccionado estado: 正常 (有效) Normal")
                    except:
                        try:
                            # Intentar seleccionar por valor
                            select.select_by_value("1")  # Asumiendo que 1 es para Normal
                            logger.info("Seleccionado estado por valor: 1")
                        except:
                            try:
                                # Intentar seleccionar la primera opción no vacía
                                options = select.options
                                for i, option in enumerate(options):
                                    if option.text.strip() != "":
                                        select.select_by_index(i)
                                        logger.info(f"Seleccionado estado por índice: {i} ({option.text})")
                                        break
                            except Exception as e:
                                logger.error(f"Todos los métodos de selección de estado fallaron: {e}")
                    
                    time.sleep(3)  # Esperar a que la selección surta efecto
                    self.take_screenshot("after_status_selection")
                else:
                    logger.error("No se encontró el selector de estado")
            except Exception as e:
                logger.error(f"Error al seleccionar estado: {e}")
            
            # 4. Hacer clic en el botón de búsqueda
            try:
                # Intentar encontrar el botón por id
                search_button = self.driver.find_element(By.ID, "search_btn")
                logger.info("Botón de búsqueda encontrado por ID")
            except:
                try:
                    # Intentar encontrar el botón por texto
                    search_button = self.driver.find_element(By.XPATH, "//button[contains(text(), 'Query') or contains(text(), '查询')]")
                    logger.info("Botón de búsqueda encontrado por texto")
                except:
                    try:
                        # Intentar encontrar todos los botones y seleccionar el adecuado
                        buttons = self.driver.find_elements(By.TAG_NAME, "button")
                        logger.info(f"Encontrados {len(buttons)} botones")
                        
                        search_button = None
                        for button in buttons:
                            try:
                                button_text = button.text.strip()
                                button_class = button.get_attribute("class")
                                logger.info(f"Botón: texto='{button_text}', clase='{button_class}'")
                                
                                # Identificar el botón de búsqueda
                                if (button_text and ("query" in button_text.lower() or "search" in button_text.lower() or "查询" in button_text)) or \
                                   (button_class and ("search" in button_class.lower() or "query" in button_class.lower())):
                                    search_button = button
                                    logger.info(f"Botón de búsqueda identificado: {button_text}")
                                    break
                            except:
                                continue
                        
                        if not search_button:
                            # Si no se encontró un botón específico, usar el primer botón azul
                            for button in buttons:
                                if button.is_displayed():
                                    search_button = button
                                    logger.info("Usando el primer botón visible como botón de búsqueda")
                                    break
                    except:
                        logger.error("No se pudo encontrar el botón de búsqueda por ningún método")
                        return False
            
            if search_button:
                success = self.safe_click(search_button, "search_button")
                if success:
                    logger.info("Se hizo clic en el botón de búsqueda")
                    time.sleep(5)  # Esperar a que se carguen los resultados
                    self.take_screenshot("after_search")
                else:
                    logger.error("No se pudo hacer clic en el botón de búsqueda")
                    return False
            else:
                logger.error("No se encontró el botón de búsqueda")
                return False
            
            # Verificar si la tabla de resultados está presente
            try:
                results_table = self.wait_for_element(By.ID, "dataList", timeout=20, screenshot_name="results_table")
                if results_table:
                    logger.info("Tabla de resultados encontrada")
                    return True
                else:
                    logger.error("No se encontró la tabla de resultados después de la búsqueda")
                    return False
            except:
                logger.error("Error al verificar la tabla de resultados")
                return False
            
        except Exception as e:
            logger.error(f"Error general al aplicar filtros: {e}")
            return False
    
    def extract_table_data(self):
        """Extrae los datos de la tabla actual"""
        logger.info("Extrayendo datos de la tabla actual")
        self.take_screenshot("table_before_extraction")
        
        rows_data = []
        
        try:
            # Esperar a que la tabla esté presente
            table = self.wait_for_element(By.ID, "dataList", screenshot_name="table_loaded")
            if not table:
                logger.error("No se pudo encontrar la tabla")
                return []
            
            # Obtener todas las filas de la tabla
            rows = self.driver.find_elements(By.CSS_SELECTOR, "#dataList tbody tr")
            logger.info(f"Encontradas {len(rows)} filas en la tabla")
            
            for idx, row in enumerate(rows):
                try:
                    # Extraer celdas de cada fila
                    cells = row.find_elements(By.TAG_NAME, "td")
                    row_data = []
                    
                    for cell in cells:
                        try:
                            text = cell.text.strip()
                            row_data.append(text)
                        except StaleElementReferenceException:
                            logger.warning(f"Elemento obsoleto al extraer texto de celda en fila {idx+1}")
                            row_data.append("ERROR_STALE")
                    
                    if row_data and len(row_data) > 1:  # Solo agregar si hay datos reales
                        rows_data.append(row_data)
                except Exception as e:
                    logger.error(f"Error al extraer fila {idx+1}: {str(e)}")
                    continue
            
            logger.info(f"Extracción completa: {len(rows_data)} filas con datos válidos")
            return rows_data
        except Exception as e:
            logger.error(f"Error al extraer datos de la tabla: {str(e)}")
            self.take_screenshot("table_extraction_error")
            return []
    
    def go_to_next_page(self):
        """Navega a la siguiente página de resultados"""
        logger.info(f"Intentando navegar a la página {self.current_page + 1}")
        
        # Buscar botón de siguiente página
        next_button = None
        next_selectors = [
            (By.CSS_SELECTOR, "a.page-next"),
            (By.XPATH, "//a[contains(@class, 'next')]"),
            (By.XPATH, "//a[contains(text(), '>')]"),
            (By.XPATH, "//a[contains(text(), '下一页') or contains(text(), 'Next')]"),
            (By.CSS_SELECTOR, ".pagination li:last-child a")
        ]
        
        for by, selector in next_selectors:
            try:
                elements = self.driver.find_elements(by, selector)
                if elements:
                    next_button = elements[0]
                    break
            except:
                pass
        
        if not next_button:
            logger.error("No se encontró botón para la siguiente página")
            return False
        
        # Verificar si el botón está deshabilitado
        try:
            disabled = next_button.get_attribute("class") and "disabled" in next_button.get_attribute("class")
            if disabled:
                logger.warning("Botón siguiente está deshabilitado, finalizando paginación")
                return False
        except:
            logger.warning("No se pudo verificar si el botón siguiente está deshabilitado")
        
        # Hacer clic en el botón siguiente
        success = self.safe_click(next_button, "next_button")
        if not success:
            logger.error("No se pudo hacer clic en el botón siguiente")
            return False
        
        logger.info("Se hizo clic en el botón siguiente")
        time.sleep(5)  # Esperar a que se cargue la página
        self.take_screenshot(f"page_{self.current_page + 1}_loaded")
        
        # Esperar a que la tabla se actualice
        try:
            # Esperar a que aparezcan filas en la tabla
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "#dataList tbody tr"))
            )
            logger.info("Tabla actualizada detectada")
        except:
            logger.warning("No se pudo verificar la actualización de la tabla")
            # Verificar si la tabla sigue existiendo
            if not self.driver.find_elements(By.ID, "dataList"):
                logger.error("La tabla ha desaparecido después de hacer clic en siguiente")
                return False
        
        # Incrementar página actual
        self.current_page += 1
        return True
    
    def extract_all_pages(self):
        """Extrae datos de todas las páginas de resultados"""
        logger.info(f"Iniciando extracción de datos (máximo {self.max_pages} páginas)")
        
        # Extraer datos de la primera página
        page_data = self.extract_table_data()
        if page_data:
            self.all_data.extend(page_data)
            logger.info(f"Extraídas {len(page_data)} filas de la página 1")
        else:
            logger.error("No se pudieron extraer datos de la primera página")
            return False
        
        # Extraer datos de las páginas restantes
        error_count = 0
        max_errors = 3
        
        while self.current_page < self.max_pages and error_count < max_errors:
            # Ir a la siguiente página
            if not self.go_to_next_page():
                logger.info("No se pudo avanzar a la siguiente página, finalizando extracción")
                break
            
            # Extraer datos de esta página
            page_data = self.extract_table_data()
            
            if page_data:
                self.all_data.extend(page_data)
                logger.info(f"Extraídas {len(page_data)} filas de la página {self.current_page}")
                error_count = 0  # Reiniciar contador de errores
            else:
                logger.warning(f"No se obtuvieron datos de la página {self.current_page}")
                error_count += 1
                
                if error_count >= max_errors:
                    logger.error(f"Demasiados errores consecutivos ({max_errors}), deteniendo extracción")
                    break
        
        logger.info(f"Extracción completada. Total de páginas: {self.current_page}")
        logger.info(f"Total de filas extraídas: {len(self.all_data)}")
        
        return len(self.all_data) > 0
    
    def save_extracted_data(self):
        """Guarda los datos extraídos en varios formatos"""
        if not self.all_data:
            logger.error("No hay datos para guardar")
            return False
        
        try:
            # Determinar número de columnas
            num_columns = max(len(row) for row in self.all_data) if self.all_data else 0
            logger.info(f"Número máximo de columnas: {num_columns}")
            
            # Definir encabezados según el número de columnas
            default_columns = [
                "序号 (Serial No.)",
                "国家或地区 (Country/Region)",
                "省/州 (Province/State)",
                "产品种类 (Product category)",
                "产品名称 (Product name)",
                "拉丁学名 (Scientific name)",
                "境外官方注册号 (Overseas registration No.)",
                "中方注册号 (Chinese registration No.)",
                "企业名称(英文) (Enterprise name - English)",
                "企业名称(本国语言) (Enterprise name - Local)",
                "注册生效日期 (Registration start date)",
                "注册失效日期 (Registration end date)",
                "注册状态 (Registration status)",
                "操作 (Operation)"
            ]
            
            # Ajustar columnas según el número real
            if num_columns <= len(default_columns):
                columns = default_columns[:num_columns]
            else:
                columns = default_columns + [f"Columna_{i+1}" for i in range(len(default_columns), num_columns)]
            
            # Crear DataFrame
            df = pd.DataFrame(self.all_data, columns=columns)
            
            # Guardar como Excel
            df.to_excel(self.output_files["excel"], index=False)
            logger.info(f"Datos guardados como Excel: {self.output_files['excel']}")
            
            # Guardar como CSV
            df.to_csv(self.output_files["csv"], index=False, encoding='utf-8-sig')
            logger.info(f"Datos guardados como CSV: {self.output_files['csv']}")
            
            # Guardar como JSON
            df.to_json(self.output_files["json"], orient="records", force_ascii=False)
            logger.info(f"Datos guardados como JSON: {self.output_files['json']}")
            
            return True
        except Exception as e:
            logger.error(f"Error al guardar datos: {e}")
            return False
    
    def run_extraction(self, max_pages=None):
        """Ejecuta el proceso completo de extracción"""
        logger.info("Iniciando proceso de extracción de datos")
        
        if max_pages:
            self.max_pages = max_pages
            logger.info(f"Límite de páginas establecido: {self.max_pages}")
        
        try:
            # Inicializar navegador
            if not self.initialize_browser():
                logger.error("No se pudo inicializar el navegador")
                return False
            
            # Navegar a la página
            if not self.navigate_to_page():
                logger.error("Error en navegación a la página")
                return False
            
            # Aplicar filtros específicos
            if not self.apply_specific_filters():
                logger.error("Error al aplicar filtros")
                return False
            
            # Extraer datos de todas las páginas
            if not self.extract_all_pages():
                logger.error("Error en extracción de datos")
                return False
            
            # Guardar datos extraídos
            if not self.save_extracted_data():
                logger.error("Error al guardar datos extraídos")
                return False
            
            # Cerrar navegador
            if self.driver:
                self.driver.quit()
                logger.info("Navegador cerrado")
            
            logger.info("Proceso de extracción completado exitosamente")
            return True
            
        except Exception as e:
            logger.critical(f"Error crítico durante la extracción: {e}")
            
            # Cerrar navegador
            if self.driver:
                self.take_screenshot("critical_error")
                
                try:
                    self.driver.quit()
                except:
                    pass
            
            return False

# Función principal
if __name__ == "__main__":
    try:
        print("\n" + "="*50)
        print("EXTRACTOR DIRECTO PARA PÁGINA WEB CHINA")
        print("="*50)
        print("\nEste script aplicará filtros específicos y extraerá datos automáticamente.")
        
        # Solicitar número máximo de páginas
        max_pages = 100
        try:
            pages_input = input("\n¿Cuántas páginas deseas extraer como máximo? (Enter para 100): ")
            if pages_input.strip():
                max_pages = int(pages_input)
                print(f"Se extraerán máximo {max_pages} páginas")
        except:
            print("Entrada inválida, se usará el valor predeterminado de 100 páginas")
        
        # Ejecutar la extracción
        print("\nIniciando extracción de datos...")
        extractor = DirectExtractor()
        success = extractor.run_extraction(max_pages)
        
        if success:
            print("\n" + "="*50)
            print("EXTRACCIÓN COMPLETADA EXITOSAMENTE")
            print("="*50)
            print(f"Se extrajeron {len(extractor.all_data)} filas en {extractor.current_page} páginas")
            print(f"Archivo Excel: {extractor.output_files['excel']}")
            print(f"Archivo CSV: {extractor.output_files['csv']}")
            print(f"Archivo JSON: {extractor.output_files['json']}")
            print(f"Archivo de log: {log_file}")
            print(f"Capturas de pantalla: {screenshot_dir}")
        else:
            print("\n" + "="*50)
            print("LA EXTRACCIÓN FALLÓ")
            print("="*50)
            print("Revise el archivo de log para más detalles.")
            print(f"Archivo de log: {log_file}")
        
    except KeyboardInterrupt:
        print("\nPrograma interrumpido por el usuario")
    except Exception as e:
        print(f"\nError general: {e}")
    
    input("\nPresione Enter para salir...")