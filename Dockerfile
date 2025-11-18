FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    curl \
    unzip \
    xvfb \
    libxi6 \
    libnss3 \
    libnspr4 \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-liberation \
    libu2f-udev \
    libvulkan1 \
    xdg-utils \
    wkhtmltopdf \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Instalar Google Chrome
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Obtener chromedriver compatible con la versión de Chrome
RUN CHROME_VERSION=$(google-chrome --version | awk '{print $3}' | cut -d. -f1) \
    && CHROMEDRIVER_VERSION=$(curl -s "https://chromedriver.storage.googleapis.com/LATEST_RELEASE_$CHROME_VERSION") \
    && wget -q "https://chromedriver.storage.googleapis.com/$CHROMEDRIVER_VERSION/chromedriver_linux64.zip" \
    && unzip chromedriver_linux64.zip \
    && mv chromedriver /usr/bin/chromedriver \
    && chmod +x /usr/bin/chromedriver \
    && rm chromedriver_linux64.zip

# Configurar estructura de directorios
RUN mkdir -p /app/templates /app/static /app/basededatos /app/logs /app/api /app/gif

# Copiar requirements.txt primero para aprovechar la caché de Docker
COPY requirements.txt .

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install undetected-chromedriver==3.5.5 gevent gevent-websocket \
    && pip install playwright==1.51.0 \
    && playwright install chromium

# Copiar el código de la aplicación
COPY . .

# Asegurar que los directorios de datos tengan permisos adecuados
RUN chmod -R 755 /app/basededatos /app/logs /app/static

# Configuración para Chrome y Playwright
ENV DISPLAY=:99
ENV PYTHONUNBUFFERED=1
ENV UC_DRIVER_EXECUTABLE_PATH=/usr/bin/chromedriver
ENV UC_CHROME_BINARY=/usr/bin/google-chrome-stable
ENV UC_NO_SANDBOX=true
ENV UC_HEADLESS=true

# Exponer puerto para la aplicación Flask
EXPOSE 5000

# Comando para ejecutar la aplicación
CMD ["python", "app.py"]