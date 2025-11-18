import time
import json
import pandas as pd
import urllib.parse
import os
import csv
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from webdriver_manager.chrome import ChromeDriverManager

# Configuración para Visual Studio
def setup_chrome_driver():
    """Configura y devuelve el driver de Chrome adaptado para Windows/Visual Studio"""
    chrome_options = Options()
    # Comentar la siguiente línea para ver el navegador en acción (no headless)
    # chrome_options.add_argument('--headless')
    chrome_options.add_argument('--start-maximized')
    chrome_options.add_argument('--disable-notifications')
    chrome_options.add_argument("--disable-web-security")
    chrome_options.add_argument("--ignore-certificate-errors")
    chrome_options.add_argument("--window-size=1920,1080")
    
    # Usar webdriver_manager para gestionar el driver
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=chrome_options)

def guardar_datos_formato_tabular(data, filename_base):
    """
    Guarda los datos en un formato tabular bien organizado
    """
    # 1. Guardar como CSV bien formateado con encabezados claros
    csv_file = f"{filename_base}.csv"
    try:
        with open(csv_file, 'w', newline='', encoding='utf-8') as f:
            # Definir encabezados legibles
            headers = [
                'Núm. de Serie', 'País/Región', 'Provincia/Estado', 
                'Categoría de Producto', 'Nombre del Producto', 'Nombre Científico',
                'Núm. de Registro Oficial', 'Núm. de Registro China', 
                'Nombre de Empresa (EN)', 'Nombre de Empresa (Local)',
                'Fecha de Inicio', 'Fecha de Fin', 'Estado de Registro',
                'Página', 'Fila en Página'
            ]
            
            # Si hay detalles, añadir encabezado
            if data and 'detail_data' in data[0]:
                headers.append('Datos de Detalle')
            
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writeheader()
            
            # Mapear las claves originales a los nuevos encabezados
            key_mapping = {
                'serial_no': 'Núm. de Serie',
                'country_region': 'País/Región',
                'province_state': 'Provincia/Estado',
                'product_category': 'Categoría de Producto',
                'product_name': 'Nombre del Producto',
                'scientific_name': 'Nombre Científico',
                'overseas_official_reg_no': 'Núm. de Registro Oficial',
                'china_reg_no': 'Núm. de Registro China',
                'enterprise_name_en': 'Nombre de Empresa (EN)',
                'enterprise_name_local': 'Nombre de Empresa (Local)',
                'start_time': 'Fecha de Inicio',
                'end_time': 'Fecha de Fin',
                'registration_status': 'Estado de Registro',
                'page': 'Página',
                'row_in_page': 'Fila en Página',
                'detail_data': 'Datos de Detalle'
            }
            
            # Escribir los datos mapeados
            for item in data:
                row = {}
                for key, value in item.items():
                    if key in key_mapping:
                        row[key_mapping[key]] = value
                writer.writerow(row)
                
        print(f"Datos guardados en formato CSV tabular: {csv_file}")
    except Exception as e:
        print(f"Error al guardar CSV tabular: {str(e)}")
    
    # 2. Guardar como Excel con formato mejorado
    try:
        excel_file = f"{filename_base}.xlsx"
        
        # Convertir a DataFrame con nombres de columnas legibles
        df_data = []
        for item in data:
            row = {}
            for key, value in item.items():
                if key in key_mapping:
                    row[key_mapping[key]] = value
            df_data.append(row)
            
        df = pd.DataFrame(df_data)
        
        # Guardar como Excel con formato
        df.to_excel(excel_file, index=False, engine='openpyxl')
        print(f"Datos guardados en formato Excel tabular: {excel_file}")
    except Exception as e:
        print(f"Error al guardar Excel tabular: {str(e)}")
        print("Instala openpyxl si es necesario: pip install openpyxl")
    
    # 3. Guardar JSON para preservar datos originales
    try:
        json_file = f"{filename_base}.json"
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Datos guardados en formato JSON original: {json_file}")
    except Exception as e:
        print(f"Error al guardar JSON: {str(e)}")
    
    return csv_file, excel_file, json_file

def extraer_datos_de_manera_estructurada(driver, current_page):
    """
    Extrae datos de la página actual de manera más estructurada
    """
    # Extraer filas con JS simple pero robusto
    page_data = driver.execute_script("""
        var results = [];
        var rows = document.querySelectorAll('table tbody tr');
        
        console.log("Procesando " + rows.length + " filas");
        
        for (var i = 0; i < rows.length; i++) {
            try {
                var cells = rows[i].querySelectorAll('td');
                if (cells.length >= 13) {
                    var result = {
                        "serial_no": cells[0].textContent.trim(),
                        "country_region": cells[1].textContent.trim(),
                        "province_state": cells[2].textContent.trim(),
                        "product_category": cells[3].textContent.trim(),
                        "product_name": cells[4].textContent.trim(),
                        "scientific_name": cells[5].textContent.trim(),
                        "overseas_official_reg_no": cells[6].textContent.trim(),
                        "china_reg_no": cells[7].textContent.trim(),
                        "enterprise_name_en": cells[8].textContent.trim(),
                        "enterprise_name_local": cells[9].textContent.trim(),
                        "start_time": cells[10].textContent.trim(),
                        "end_time": cells[11].textContent.trim(),
                        "registration_status": cells[12].textContent.trim(),
                        "page": arguments[0],
                        "row_in_page": i + 1
                    };
                    
                    // Intentar extraer detalles si hay un enlace
                    if (cells.length > 13) {
                        var detailLink = cells[13].querySelector('a');
                        if (detailLink && detailLink.getAttribute("onclick")) {
                            var onclick = detailLink.getAttribute("onclick");
                            if (onclick.includes("openComInfo")) {
                                var startIdx = onclick.indexOf('`') + 1;
                                var endIdx = onclick.lastIndexOf('`');
                                if (startIdx > 0 && endIdx > startIdx) {
                                    result["detail_data_encoded"] = onclick.substring(startIdx, endIdx);
                                }
                            }
                        }
                    }
                    
                    results.push(result);
                }
            } catch(e) {
                console.error("Error en fila " + i + ": " + e.message);
            }
        }
        
        return results;
    """, current_page)
    
    # Procesar datos de detail_data_encoded (si existen) de forma más limpia
    if page_data:
        for item in page_data:
            if 'detail_data_encoded' in item:
                try:
                    # Decodificar y estructurar los datos de detalle
                    encoded_data = item['detail_data_encoded']
                    decoded_data = urllib.parse.unquote(encoded_data)
                    
                    # Intentar formatear los datos de detalle como JSON
                    try:
                        # Si es un JSON válido
                        detail_obj = json.loads(decoded_data)
                        # Guardar una versión limpia y formateada
                        item['detail_data'] = json.dumps(detail_obj, ensure_ascii=False, indent=2)
                    except:
                        # Si no es JSON, solo decodificar
                        item['detail_data'] = decoded_data
                    
                    # Eliminar la versión codificada
                    del item['detail_data_encoded']
                except:
                    # Si hay error, mantener los datos tal cual
                    item['detail_data'] = item.get('detail_data_encoded', '')
                    if 'detail_data_encoded' in item:
                        del item['detail_data_encoded']
    
    return page_data

def scrape_peru_mangos_all_pages():
    """
    Scraper mejorado para extraer datos de mangos de Perú.
    Enfocado en obtener datos en formato tabular bien organizado.
    """
    # URL de la página
    url = 'https://scintl.chinaport.gov.cn/aprwebserver/pages/apr/public/html/companyList.html'
    
    print('Iniciando scraper mejorado para mangos de Perú...')
    
    # Iniciar el navegador
    driver = setup_chrome_driver()
    driver.set_page_load_timeout(60)  # Timeout más largo
    
    all_results = []
    try:
        # Navegar a la URL
        print('Navegando a la página...')
        driver.get(url)
        
        # Cerrar diálogo inicial si existe
        try:
            WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.ID, "confirmBtn"))
            ).click()
            print('Diálogo de tips cerrado')
        except:
            print('No se encontró diálogo de tips')
        
        # Esperar al formulario
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "dec_query_form"))
        )
        print('Formulario de búsqueda cargado')
        
        # Seleccionar país (Perú)
        try:
            # Primero seleccionar el país usando el select subyacente
            driver.execute_script("""
                var select = document.getElementById('countryCode');
                for (var i = 0; i < select.options.length; i++) {
                    if (select.options[i].text.includes('Peru')) {
                        select.selectedIndex = i;
                        select.dispatchEvent(new Event('change'));
                        break;
                    }
                }
            """)
            print('País (Perú) seleccionado')
            
            # Seleccionar tipo de producto (Fresh fruits)
            driver.execute_script("""
                var select = document.getElementById('prodTypeCode');
                for (var i = 0; i < select.options.length; i++) {
                    if (select.options[i].text.includes('Fresh fruits')) {
                        select.selectedIndex = i;
                        select.dispatchEvent(new Event('change'));
                        break;
                    }
                }
            """)
            print('Tipo de producto (Fresh fruits) seleccionado')
            
            # Ingresar nombre de producto (mango)
            driver.execute_script("document.getElementById('prodName').value = 'mango';")
            print('Nombre de producto (mango) ingresado')
            
            # Hacer clic en el botón de búsqueda
            time.sleep(1)
            driver.execute_script("document.getElementById('queryBtn').click();")
            print('Búsqueda iniciada')
            
            # Esperar a que se carguen los resultados iniciales (puede tomar más tiempo)
            time.sleep(8)
            
            # ----- ESPECÍFICAMENTE CAMBIAR A 500 RESULTADOS POR PÁGINA -----
            print('Intentando cambiar a 500 resultados por página...')
            
            # Método 1: Usando la estructura HTML exacta que proporcionaste
            try:
                # Encontrar el botón de dropdown con el texto "500"
                dropdown_btn = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.XPATH, "//button[contains(@class, 'dropdown-toggle')][.//span[contains(@class, 'page-size')]]"))
                )
                
                print("Botón de selección de página encontrado")
                # Hacer scroll hasta el botón para asegurarse de que es visible
                driver.execute_script("arguments[0].scrollIntoView(true);", dropdown_btn)
                time.sleep(1)
                
                # Hacer clic en el botón para abrir el dropdown
                ActionChains(driver).move_to_element(dropdown_btn).click().perform()
                print("Dropdown abierto")
                time.sleep(2)
                
                # Ahora buscar la opción "500" en el menú desplegado
                option_500 = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.XPATH, "//a[text()='500']"))
                )
                
                # Hacer clic en la opción 500
                ActionChains(driver).move_to_element(option_500).click().perform()
                print("Opción 500 seleccionada")
                
                # Esperar a que se recargue la página con 500 resultados
                time.sleep(8)
                
                # Verificar si el cambio se aplicó
                page_size_text = driver.execute_script("""
                    var pageSizeSpan = document.querySelector('.page-size');
                    return pageSizeSpan ? pageSizeSpan.textContent.trim() : null;
                """)
                print(f"Tamaño de página configurado a: {page_size_text}")
                
                if page_size_text == '500':
                    print("¡ÉXITO! Configurado correctamente a 500 resultados por página")
                else:
                    print("El cambio a 500 resultados por página no parece haberse aplicado")
                    
                    # Intento adicional: método 2 forzado con JavaScript
                    print("Intentando método alternativo...")
                    driver.execute_script("""
                        // Forzar la selección de 500 resultados
                        // 1. Modificar el span directamente
                        var pageSizeSpan = document.querySelector('.page-size');
                        if (pageSizeSpan) {
                            pageSizeSpan.textContent = '500';
                        }
                        
                        // 2. Intentar cambiar el parámetro directamente (si hay alguna variable global)
                        if (typeof pageSize !== 'undefined') {
                            pageSize = 500;
                        }
                        
                        // 3. Buscar un evento para recargar la tabla y forzar el valor
                        try {
                            // Buscar el input o select oculto y modificarlo
                            var pageSizeInput = document.querySelector('input[name="pageSize"], select[name="pageSize"]');
                            if (pageSizeInput) {
                                if (pageSizeInput.tagName === 'SELECT') {
                                    for (var i = 0; i < pageSizeInput.options.length; i++) {
                                        if (pageSizeInput.options[i].value === '500') {
                                            pageSizeInput.selectedIndex = i;
                                            break;
                                        }
                                    }
                                } else {
                                    pageSizeInput.value = '500';
                                }
                                
                                // Disparar eventos
                                pageSizeInput.dispatchEvent(new Event('change', { bubbles: true }));
                                
                                // Si hay un botón de refresh, hacer clic en él
                                var refreshBtn = document.querySelector('button.btn-refresh');
                                if (refreshBtn) {
                                    refreshBtn.click();
                                }
                            }
                        } catch (e) {
                            console.error('Error en intento alternativo:', e);
                        }
                    """)
                    
                    print("Método alternativo aplicado, esperando resultados...")
                    time.sleep(8)
                    
                    # Verificar otra vez
                    page_size_text = driver.execute_script("""
                        var pageSizeSpan = document.querySelector('.page-size');
                        return pageSizeSpan ? pageSizeSpan.textContent.trim() : null;
                    """)
                    print(f"Tamaño de página final: {page_size_text}")
            
            except Exception as e:
                print(f"Error al intentar cambiar a 500 resultados por página: {str(e)}")
                print("Continuando con la configuración por defecto")
            
            # Extracción simple página por página
            # Extraer número total de páginas considerando el HTML proporcionado
            try:
                # Usar el selector específico para encontrar el último número de página
                last_page_element = driver.find_element(By.XPATH, "//li[contains(@class, 'page-item')][not(contains(@class, 'page-next'))][not(contains(@class, 'page-last-separator'))][last()]/a")
                max_pages = int(last_page_element.text.strip())
                print(f"Total de páginas detectado: {max_pages}")
            except:
                max_pages = 41  # Valor por defecto
                print(f"No se pudo detectar el total de páginas, usando valor por defecto: {max_pages}")
            
            # Verificar cuántos registros hay por página
            try:
                rows = driver.find_elements(By.XPATH, "//table/tbody/tr")
                print(f"Número de filas detectadas en la primera página: {len(rows)}")
                
                # Si son menos de 30, algo no funcionó con el cambio a 500
                if len(rows) < 30:
                    print("ADVERTENCIA: Parece que la configuración a 500 registros por página NO funcionó")
                elif len(rows) >= 400:
                    print("CONFIRMADO: La configuración a 500 registros por página funcionó correctamente")
                else:
                    print(f"Se detectaron {len(rows)} filas por página - puede ser que la configuración a 500 funcionó parcialmente")
            except:
                print("No se pudo verificar el número de filas en la página")
            
            current_page = 1
            while current_page <= max_pages:
                print(f"\nProcesando página {current_page} de {max_pages}...")
                
                # Extraer datos de la página actual con el formato mejorado
                try:
                    # Esperar a que la tabla se cargue
                    WebDriverWait(driver, 10).until(
                        EC.presence_of_all_elements_located((By.XPATH, "//table/tbody/tr"))
                    )
                    
                    # Tomar captura de pantalla para diagnóstico (solo primera página)
                    if current_page == 1:
                        screenshot_path = os.path.join(os.getcwd(), f"pagina_{current_page}.png")
                        driver.save_screenshot(screenshot_path)
                        print(f"Se guardó captura de pantalla en: {screenshot_path}")
                    
                    # Extraer datos de manera más estructurada
                    page_data = extraer_datos_de_manera_estructurada(driver, current_page)
                    
                    # Añadir a resultados globales
                    if page_data:
                        all_results.extend(page_data)
                        print(f"Extraídos {len(page_data)} registros de la página {current_page}")
                    else:
                        print(f"No se encontraron datos en la página {current_page}")
                    
                    # Guardar periódicamente en formato tabular mejorado
                    if len(all_results) % 1000 == 0:
                        incremental_file_base = f'peru_mangos_incremental_{len(all_results)}'
                        guardar_datos_formato_tabular(all_results, incremental_file_base)
                    
                    # Navegar a la siguiente página si no es la última
                    if current_page < max_pages:
                        next_page = current_page + 1
                        print(f"Navegando a la página {next_page}...")
                        
                        # Método para navegar a la siguiente página usando el botón SIGUIENTE
                        try:
                            # Usar el botón siguiente (›) basado en el HTML proporcionado
                            next_button = WebDriverWait(driver, 10).until(
                                EC.element_to_be_clickable((By.XPATH, "//li[contains(@class, 'page-next')]/a"))
                            )
                            driver.execute_script("arguments[0].scrollIntoView(true);", next_button)
                            time.sleep(1)
                            driver.execute_script("arguments[0].click();", next_button)
                            print(f"Navegado a la siguiente página usando botón 'siguiente'")
                            
                            # Esperar a que cargue la nueva página
                            time.sleep(5)
                            current_page += 1
                        except Exception as nav_e:
                            print(f"Error al navegar con botón siguiente: {str(nav_e)}")
                            
                            # Intentar con enlace numérico si está visible
                            try:
                                # Solo para páginas 2-5 según el HTML proporcionado
                                if next_page <= 5 or next_page == max_pages:
                                    next_page_link = WebDriverWait(driver, 10).until(
                                        EC.element_to_be_clickable((By.XPATH, f"//li[contains(@class, 'page-item')]/a[text()='{next_page}']"))
                                    )
                                    driver.execute_script("arguments[0].click();", next_page_link)
                                    print(f"Navegado a página {next_page} usando enlace numérico")
                                    
                                    # Esperar a que cargue la nueva página
                                    time.sleep(5)
                                    current_page = next_page
                                else:
                                    print("No se puede navegar a esta página por número, intentando método alternativo")
                                    raise Exception("Página fuera de rango visible")
                            except:
                                print("No se pudo navegar a la siguiente página. Intentando recargar.")
                                
                                # Último recurso: recargar la página y manipular directamente
                                try:
                                    driver.refresh()
                                    time.sleep(8)
                                    # Forzar cambio de página con JavaScript
                                    driver.execute_script(f"""
                                        // Intentar cambiar de página directamente
                                        var pageLinks = document.querySelectorAll('.page-link');
                                        for (var i = 0; i < pageLinks.length; i++) {{
                                            if (pageLinks[i].textContent.trim() === '{next_page}' || 
                                                pageLinks[i].textContent.trim() === '›') {{
                                                pageLinks[i].click();
                                                return true;
                                            }}
                                        }}
                                        return false;
                                    """)
                                    print("Intento de navegación con JavaScript")
                                    time.sleep(5)
                                    current_page = next_page
                                except:
                                    print("Todos los métodos de navegación fallaron. Terminando.")
                                    break
                    else:
                        print("Se ha llegado a la última página. Extracción completa.")
                        break
                
                except Exception as e:
                    print(f"Error al procesar la página {current_page}: {str(e)}")
                    
                    # Si falla, intentar pasar a la siguiente página
                    current_page += 1
            
        except Exception as e:
            print(f"Error durante la configuración o búsqueda: {str(e)}")
        
        print(f"\nProceso completado. Total de registros extraídos: {len(all_results)}")
        
        # Guardar los resultados finales en un formato tabular mejorado
        if all_results:
            # Usar función para guardar en formato tabular
            csv_file, excel_file, json_file = guardar_datos_formato_tabular(all_results, 'peru_mangos_completo')
            
            print("\n===== ARCHIVOS GENERADOS =====")
            print(f"1. CSV Tabular: {csv_file}")
            print(f"2. Excel: {excel_file}")
            print(f"3. JSON: {json_file}")
            print(f"Ubicación: {os.getcwd()}")
            print("==============================\n")
            
            # Generar una vista previa de los datos
            print("\n===== VISTA PREVIA DE DATOS =====")
            try:
                df = pd.DataFrame(all_results)
                print(df.head(5).to_string())
                print("===============================\n")
            except:
                print("No se pudo generar vista previa de datos")
        else:
            print("No se encontraron resultados para guardar")
    
    except Exception as e:
        print(f"Error general durante el scraping: {str(e)}")
        
        # Guardar resultados parciales si hay alguno
        if all_results:
            try:
                # Guardar en formato tabular
                csv_file, excel_file, json_file = guardar_datos_formato_tabular(all_results, 'peru_mangos_parcial')
                print(f'Guardados {len(all_results)} resultados parciales en formato tabular')
                print(f'Archivos guardados en: {os.getcwd()}')
            except:
                print("Error al guardar resultados parciales")
    
    finally:
        # Cerrar el navegador
        driver.quit()
        print('Navegador cerrado, scraping completado.')
    
    return all_results

# Ejecutar el scraper si se ejecuta directamente
if __name__ == "__main__":
    scrape_peru_mangos_all_pages()