import time
import threading
from datetime import datetime
from flask import Flask, jsonify
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
from selenium.webdriver.chrome.options import Options

app = Flask(__name__)

# Cache de tickets
tickets_cache = {"espera": [], "en_curso": [], "last_update": None}
scraping_lock = threading.Lock()

def crear_driver():
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")

    return webdriver.Chrome(options=chrome_options)

def hacer_login(driver):
    try:
        driver.get("https://mda.senasa.gob.pe/index.php?noAUTO=1")

        usuario = "practicante_inf_001"
        password = "12Nikoes"

        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.ID, "login_name"))
        ).send_keys(usuario)

        driver.find_element(By.ID, "login_password").send_keys(password)

        login_button = WebDriverWait(driver, 15).until(
            EC.element_to_be_clickable((By.XPATH, "//button[@type='submit']"))
        )
        driver.execute_script("arguments[0].click();", login_button)

        time.sleep(5)
        return "login.php" not in driver.current_url
    except Exception as e:
        return False

def obtener_tickets(driver, valor):
    try:
        url = (
            "https://mda.senasa.gob.pe/front/ticket.php?"
            f"criteria%5B0%5D%5Bfield%5D=12&criteria%5B0%5D%5Bsearchtype%5D=equals&"
            f"criteria%5B0%5D%5Bvalue%5D={valor}&reset=reset"
        )
        driver.get(url)

        dropdown = WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, ".search-limit-dropdown"))
        )
        Select(dropdown).select_by_value("500")

        WebDriverWait(driver, 20).until(
            lambda d: len(d.find_elements(By.CSS_SELECTOR, "table.search-results tbody tr")) > 20
        )

        soup = BeautifulSoup(driver.page_source, "html.parser")
        tabla = soup.find("table", class_="search-results")

        tickets = []
        if tabla:
            for fila in tabla.find("tbody").find_all("tr"):
                celdas = fila.find_all("td")
                if len(celdas) < 20:
                    continue
                tickets.append({
                    "ID": celdas[1].text.strip(),
                    "Título": celdas[2].get("title", "").strip() or celdas[2].text.strip(),
                    "Entidad": celdas[3].text.strip(),
                    "Estado": celdas[4].text.strip(),
                    "Fecha_apertura": celdas[5].text.strip(),
                    "Ultima_modificacion": celdas[6].text.strip(),
                })
        return tickets
    except Exception as e:
        return []

def background_scraping():
    while True:
        try:
            with scraping_lock:
                driver = crear_driver()
                if hacer_login(driver):
                    tickets_cache["espera"] = obtener_tickets(driver, 4)
                    tickets_cache["en_curso"] = obtener_tickets(driver, 2)
                    tickets_cache["last_update"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                driver.quit()
        except Exception as e:
            pass
        time.sleep(30)

# API para obtener los tickets
@app.route('/api/tickets', methods=['GET'])
def get_tickets():
    return jsonify(tickets_cache)

if __name__ == "__main__":
    threading.Thread(target=background_scraping, daemon=True).start()
    app.run(host='0.0.0.0', port=5000)
