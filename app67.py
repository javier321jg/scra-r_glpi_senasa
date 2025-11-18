import requests
from bs4 import BeautifulSoup
import random
import time
import json
from datetime import datetime

class FalabellaScraperSigiloso:
    def __init__(self):
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
        ]
        
        self.headers = {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'es-PE,es;q=0.8',
            'Connection': 'keep-alive',
            'Referer': 'https://www.falabella.com.pe/',
            'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        }
        self.productos_totales = 0
        self.paginas_procesadas = 0

    def get_random_headers(self):
        headers = self.headers.copy()
        headers['User-Agent'] = random.choice(self.user_agents)
        return headers

    def extraer_productos_pagina(self, url, pagina=1):
        try:
            params = {
                'page': pagina,
                'orderBy': 'MOST_VISITED',
                'facetSelected': 'true'
            }
            
            time.sleep(random.uniform(2, 3))
            response = requests.get(
                url,
                headers=self.get_random_headers(),
                params=params
            )
            
            soup = BeautifulSoup(response.text, 'html.parser')
            productos_pagina = []
            
            product_containers = soup.find_all(['div', 'a'], {'data-pod': 'catalyst-pod'})
            
            for container in product_containers:
                try:
                    # Extraer marca y nombre
                    marca = container.find('b', class_=lambda x: x and 'pod-title' in x)
                    nombre = container.find('b', id=lambda x: x and 'displaySubTitle' in str(x))
                    
                    # Extraer precios
                    precios_div = container.find('div', class_='prices')
                    cmr_price_text = "0"
                    internet_price_text = "0"
                    normal_price_text = "0"
                    
                    if precios_div:
                        precios_list = precios_div.find('ol', class_='pod-prices')
                        if precios_list:
                            # Precio CMR
                            precio_cmr = precios_list.find('li', {'data-cmr-price': True})
                            cmr_price_text = precio_cmr['data-cmr-price'] if precio_cmr else "0"
                            
                            # Precio Internet
                            precio_internet = precios_list.find('li', {'data-internet-price': True})
                            internet_price_text = precio_internet['data-internet-price'] if precio_internet else "0"
                            
                            # Precio Normal
                            precio_normal = precios_list.find('li', {'data-normal-price': True})
                            normal_price_text = precio_normal['data-normal-price'] if precio_normal else internet_price_text
                    
                    # Extraer descuento
                    discount_badge = container.find('span', class_=lambda x: x and 'discount-badge-item' in str(x))
                    
                    # Extraer rating
                    rating_div = container.find('div', {'data-rating': True})
                    
                    # Extraer imagen
                    img = container.find('img')
                    img_url = img['src'] if img else ""
                    
                    producto = {
                        'marca': marca.get_text(strip=True) if marca else "Sin marca",
                        'nombre': nombre.get_text(strip=True) if nombre else "Sin nombre",
                        'precio_cmr': cmr_price_text,
                        'precio_internet': internet_price_text,
                        'precio_normal': normal_price_text,
                        'descuento': discount_badge.get_text(strip=True) if discount_badge else "0%",
                        'rating': rating_div.get('data-rating') if rating_div else "0",
                        'imagen_url': img_url,
                        'pagina': pagina
                    }
                    
                    # Calcular ahorro real
                    try:
                        precio_orig = float(producto['precio_normal'].replace(',', ''))
                        precio_oferta = float(producto['precio_cmr'].replace(',', ''))
                        if precio_orig > precio_oferta:
                            ahorro = precio_orig - precio_oferta
                            porcentaje = (ahorro / precio_orig) * 100
                            producto['ahorro_real'] = round(ahorro, 2)
                            producto['porcentaje_ahorro_real'] = round(porcentaje, 2)
                    except:
                        producto['ahorro_real'] = 0
                        producto['porcentaje_ahorro_real'] = 0
                    
                    productos_pagina.append(producto)
                    
                    print(f"\nProducto {self.productos_totales + 1}:")
                    print(f"Marca: {producto['marca']}")
                    print(f"Nombre: {producto['nombre']}")
                    print(f"Precio CMR: S/ {producto['precio_cmr']}")
                    print(f"Precio Internet: S/ {producto['precio_internet']}")
                    print(f"Precio Normal: S/ {producto['precio_normal']}")
                    print(f"Descuento: {producto['descuento']}")
                    if producto.get('ahorro_real', 0) > 0:
                        print(f"Ahorro real: S/ {producto['ahorro_real']} ({producto['porcentaje_ahorro_real']}%)")
                    print("-" * 40)
                    
                    self.productos_totales += 1
                    
                except Exception as e:
                    print(f"Error procesando producto: {e}")
                    continue
            
            return productos_pagina
            
        except Exception as e:
            print(f"Error en página {pagina}: {e}")
            return []

    def obtener_total_paginas(self, url):
        try:
            response = requests.get(url, headers=self.get_random_headers())
            soup = BeautifulSoup(response.text, 'html.parser')
            
            pagination = soup.find('div', class_='jsx-1389196899 jsx-3093776880 pagination')
            if pagination:
                # Buscar el último número en los botones de página
                buttons = pagination.find_all('button', class_='pagination-button-mkp')
                paginas = []
                for btn in buttons:
                    if btn.text.isdigit():
                        paginas.append(int(btn.text))
                
                if paginas:
                    return max(paginas)
            
            print("No se detectó paginación, usando valor por defecto")
            return 16
            
        except Exception as e:
            print(f"Error detectando páginas: {e}")
            return 1

    def extraer_productos(self, categoria='electrohogar'):
        urls = {
            'electrohogar': 'https://www.falabella.com.pe/falabella-pe/category/cat40712/Electrohogar',
            'tecnologia': 'https://www.falabella.com.pe/falabella-pe/category/cat2028/Tecnologia',
            'muebles': 'https://www.falabella.com.pe/falabella-pe/category/cat2010/Muebles'
        }
        
        url = urls.get(categoria, urls['electrohogar'])
        todos_productos = []
        
        total_paginas = self.obtener_total_paginas(url)
        print(f"\nTotal de páginas detectadas: {total_paginas}")
        
        for pagina in range(1, total_paginas + 1):
            productos_pagina = self.extraer_productos_pagina(url, pagina)
            todos_productos.extend(productos_pagina)
            self.paginas_procesadas += 1
            
            print(f"\nProgreso: {self.paginas_procesadas}/{total_paginas} páginas")
            print(f"Productos extraídos hasta ahora: {self.productos_totales}")
            
            if pagina < total_paginas:
                time.sleep(random.uniform(3, 5))
        
        self.guardar_resultados(todos_productos, categoria)
        return todos_productos

    def guardar_resultados(self, productos, categoria):
        # Ordenar productos por ahorro real
        productos_ordenados = sorted(
            productos,
            key=lambda x: x.get('porcentaje_ahorro_real', 0),
            reverse=True
        )
        
        filename = f"ofertas_{categoria}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        data = {
            'metadata': {
                'total_productos': self.productos_totales,
                'total_paginas': self.paginas_procesadas,
                'fecha_extraccion': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                'categoria': categoria
            },
            'productos': productos_ordenados
        }
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"\nResultados guardados en {filename}")

if __name__ == "__main__":
    scraper = FalabellaScraperSigiloso()
    print("Iniciando scraping...")
    productos = scraper.extraer_productos('electrohogar')
    
    print("\nRESUMEN FINAL:")
    print(f"Total de páginas procesadas: {scraper.paginas_procesadas}")
    print(f"Total de productos extraídos: {scraper.productos_totales}")
    
    # Mostrar mejores ofertas
    mejores_ofertas = [p for p in productos if p.get('porcentaje_ahorro_real', 0) > 0]
    if mejores_ofertas:
        print("\nMEJORES OFERTAS ENCONTRADAS:")
        for oferta in mejores_ofertas[:5]:
            print(f"\n{oferta['marca']} - {oferta['nombre']}")
            print(f"Precio Original: S/ {oferta['precio_normal']}")
            print(f"Precio Oferta: S/ {oferta['precio_cmr']}")
            print(f"Ahorro real: S/ {oferta['ahorro_real']} ({oferta['porcentaje_ahorro_real']}%)")