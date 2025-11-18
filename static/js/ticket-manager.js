/**
 * Sistema de Trazabilidad de Tickets - SENASA
 * Versión optimizada con mejoras de rendimiento y experiencia de usuario
 */

// Configuración
const CONFIG = {
    apiUrl: '/api/tickets/improved',
    statsUrl: '/api/tickets/stats',
    socketUrl: window.location.origin,
    refreshInterval: 60000, // 1 minuto
    maxResults: 50,
    enableRealTimeUpdates: true,
    maxRetries: 3,
    retryDelay: 3000,
    cacheExpirationTime: 1800000, // 30 minutos
    updateBufferTime: 250, // 250ms para agrupar actualizaciones
    animationDuration: 300, // duración de animaciones en ms
    idleReconnectDelay: 300000, // Reconectar después de 5 minutos de inactividad
    uiVersion: '1.0' // Para control de versiones de UI
};

// Estado de la aplicación - Patrón de diseño Observer
class AppState {
    constructor() {
        this.allTickets = [];
        this.searchResults = [];
        this.currentSearch = {
            query: '',
            field: 'all'
        };
        this.lastUpdate = null;
        this.socket = null;
        this.isLoading = false;
        this.isOffline = false;
        this.connectionRetries = 0;
        this.observers = [];
        this.counters = {
            nuevos: 0,
            espera: 0,
            curso: 0,
            resueltos: 0
        };
        this.updateRequests = 0;
        this.lastUserActivity = Date.now();
        this.updateBuffer = [];
        this.bufferTimeout = null;
        
        // Configurar listener de actividad del usuario
        this._setupUserActivityTracking();
    }
    
    // Suscribir un observador para actualizaciones de estado
    subscribe(observer) {
        if (typeof observer.update === 'function') {
            this.observers.push(observer);
            return true;
        }
        return false;
    }
    
    // Notificar a todos los observadores sobre cambios
    notify(data) {
        this.observers.forEach(observer => observer.update(data));
    }
    
    // Actualizar contadores y notificar
    updateCounters(newCounters) {
        let hasChanged = false;
        
        Object.keys(newCounters).forEach(key => {
            if (this.counters[key] !== newCounters[key]) {
                this.counters[key] = newCounters[key];
                hasChanged = true;
            }
        });
        
        if (hasChanged) {
            this.notify({ type: 'counters', data: this.counters });
        }
    }
    
    // Actualizar tickets con manejo de buffer para evitar actualizaciones frecuentes
    bufferTicketsUpdate(tickets) {
        this.updateBuffer.push(tickets);
        
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
        }
        
        this.bufferTimeout = setTimeout(() => {
            // Procesar todas las actualizaciones acumuladas
            if (this.updateBuffer.length > 0) {
                const mergedTickets = this.updateBuffer.reduce((all, current) => {
                    // Merge by unique ID (ticket_id)
                    const result = [...all];
                    current.forEach(ticket => {
                        const existingIndex = result.findIndex(t => t.ticket_id === ticket.ticket_id);
                        if (existingIndex >= 0) {
                            result[existingIndex] = ticket; // Actualizar existente
                        } else {
                            result.push(ticket); // Agregar nuevo
                        }
                    });
                    return result;
                }, []);
                
                this.updateBuffer = [];
                this._processTicketsUpdate(mergedTickets);
            }
        }, CONFIG.updateBufferTime);
    }
    
    // Procesar la actualización de tickets internamente
    _processTicketsUpdate(tickets) {
        const oldTickets = [...this.allTickets];
        this.allTickets = tickets;
        
        // Calcular diferencias
        const added = tickets.filter(t => !oldTickets.some(old => old.ticket_id === t.ticket_id));
        const removed = oldTickets.filter(t => !tickets.some(newT => newT.ticket_id === t.ticket_id));
        const updated = tickets.filter(t => {
            const oldVersion = oldTickets.find(old => old.ticket_id === t.ticket_id);
            return oldVersion && JSON.stringify(oldVersion) !== JSON.stringify(t);
        });
        
        this.notify({
            type: 'tickets',
            data: {
                all: tickets,
                added: added,
                removed: removed,
                updated: updated
            }
        });
        
        // Actualizar resultados de búsqueda si hay una búsqueda activa
        if (this.currentSearch.query) {
            this.performSearch(this.currentSearch.query, this.currentSearch.field);
        }
    }
    
    // Monitorear actividad del usuario para gestionar conexiones
    _setupUserActivityTracking() {
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        const activityHandler = () => {
            this.lastUserActivity = Date.now();
            
            // Si estamos en modo offline pero hay conectividad, intentar reconectar
            if (this.isOffline && navigator.onLine) {
                this.checkNetworkStatus();
            }
        };
        
        events.forEach(event => {
            window.addEventListener(event, activityHandler, { passive: true });
        });
        
        // Verificar inactividad cada minuto
        setInterval(() => {
            const inactive = Date.now() - this.lastUserActivity > CONFIG.idleReconnectDelay;
            
            // Si el usuario ha estado inactivo mucho tiempo y vuelve, refrescar datos
            if (inactive && CONFIG.enableRealTimeUpdates && this.socket && this.socket.connected) {
                // Reconectar solo si hay actividad reciente después de inactividad
                const justActive = Date.now() - this.lastUserActivity < 5000;
                if (justActive) {
                    console.log('Reactivación detectada después de inactividad, actualizando datos...');
                    this.fetchAllTickets();
                }
            }
        }, 60000);
    }
    
    // Métodos para interfaz pública
    setLoading(isLoading) {
        if (this.isLoading !== isLoading) {
            this.isLoading = isLoading;
            this.notify({ type: 'loading', isLoading });
        }
    }
    
    setOffline(isOffline) {
        if (this.isOffline !== isOffline) {
            this.isOffline = isOffline;
            this.notify({ type: 'connection', isOffline });
        }
    }
    
    performSearch(query, field) {
        this.currentSearch = { query, field };
        
        // Notificar inicio de búsqueda
        this.notify({ type: 'searchStart', query, field });
        
        // Normalizar consulta
        const normalizedQuery = normalizeString(query);
        
        // Filtrar tickets según el campo
        let results = [];
        
        if (field === 'all') {
            results = this.allTickets.filter(ticket => {
                return Object.entries(ticket).some(([key, value]) => {
                    if (key === 'category') return false;
                    const stringValue = String(value || '');
                    return normalizeString(stringValue).includes(normalizedQuery);
                });
            });
        } else {
            results = this.allTickets.filter(ticket => {
                if (ticket[field] === undefined) return false;
                const stringValue = String(ticket[field] || '');
                return normalizeString(stringValue).includes(normalizedQuery);
            });
        }
        
        this.searchResults = results;
        this.notify({ type: 'searchResults', results });
        
        return results;
    }
    
    clearSearch() {
        this.currentSearch = { query: '', field: 'all' };
        this.searchResults = [];
        this.notify({ type: 'searchCleared' });
    }
    
    fetchAllTickets() {
        this.setLoading(true);
        
        // Si estamos offline, cargar desde caché
        if (!navigator.onLine) {
            this.handleOfflineData();
            return;
        }
        
        const updateTimestamp = Date.now();
        
        fetchWithRetry(() => fetch(CONFIG.apiUrl))
            .then(response => {
                if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
                return response.json();
            })
            .then(data => {
                // Guardar en caché para uso offline
                saveCachedData(data);
                
                // Establecer última actualización
                this.lastUpdate = data.last_update || new Date().toISOString();
                this.notify({ type: 'lastUpdate', timestamp: this.lastUpdate });
                
                // Procesar tickets
                this._processIncomingTickets(data);
                
                // Restablecer contador de reintentos
                this.connectionRetries = 0;
            })
            .catch(error => {
                console.error('Error al obtener tickets:', error);
                
                // Incrementar contador de reintentos
                this.connectionRetries++;
                
                // Intentar cargar desde caché si hay demasiados fallos
                if (this.connectionRetries >= CONFIG.maxRetries) {
                    this.handleOfflineData();
                }
                
                this.notify({ 
                    type: 'error', 
                    context: 'fetch', 
                    message: `Error al cargar tickets: ${error.message}`,
                    retryCount: this.connectionRetries
                });
            })
            .finally(() => {
                const fetchTime = Date.now() - updateTimestamp;
                console.log(`Fetch completado en ${fetchTime}ms`);
                this.setLoading(false);
            });
    }
    
    handleOfflineData() {
        try {
            const cachedData = localStorage.getItem('tickets_cache');
            if (cachedData) {
                const data = JSON.parse(cachedData);
                
                // Verificar si el caché ha expirado
                const cacheTimestamp = new Date(data.last_update || Date.now()).getTime();
                const isExpired = Date.now() - cacheTimestamp > CONFIG.cacheExpirationTime;
                
                this._processIncomingTickets(data);
                
                this.notify({ 
                    type: 'offlineData', 
                    isExpired,
                    timestamp: data.last_update
                });
            } else {
                this.notify({ type: 'noOfflineData' });
            }
        } catch (error) {
            console.error('Error al cargar datos en caché:', error);
            this.notify({ 
                type: 'error', 
                context: 'offlineData', 
                message: `Error al cargar datos en caché: ${error.message}`
            });
        } finally {
            this.setLoading(false);
        }
    }
    
    _processIncomingTickets(data) {
        let allTickets = [];
        
        // Manejar diferentes formatos de respuesta
        if (data.tickets) {
            // Formato del endpoint mejorado
            allTickets = data.tickets.map(t => {
                const category = detectTicketCategory(t);
                return { ...t, category };
            });
        } else {
            // Formato antiguo con categorías separadas
            const categorias = {
                nuevos: 'nuevos',
                en_curso: 'curso',
                espera: 'espera',
                resueltos: 'resueltos'
            };
            
            for (const [key, category] of Object.entries(categorias)) {
                if (data[key] && Array.isArray(data[key])) {
                    allTickets = [...allTickets, ...data[key].map(t => ({ ...t, category }))];
                }
            }
        }
        
        // Ordenar por fecha más reciente
        allTickets.sort((a, b) => {
            let dateA = parseTicketDate(a.Ultima_modificacion) || parseTicketDate(a.Fecha_apertura);
            let dateB = parseTicketDate(b.Ultima_modificacion) || parseTicketDate(b.Fecha_apertura);
            
            if (!dateA) dateA = new Date(0);
            if (!dateB) dateB = new Date(0);
            
            return dateB.getTime() - dateA.getTime();
        });
        
        // Actualizar tickets con detección de cambios
        this.bufferTicketsUpdate(allTickets);
        
        // Actualizar contadores
        const countByCategory = {
            nuevos: 0,
            espera: 0,
            curso: 0,
            resueltos: 0
        };
        
        allTickets.forEach(ticket => {
            const category = ticket.category || detectTicketCategory(ticket);
            if (countByCategory[category] !== undefined) {
                countByCategory[category]++;
            }
        });
        
        this.updateCounters(countByCategory);
    }
    
    // Métodos para WebSockets
    initSocketConnection() {
        try {
            this.socket = io(CONFIG.socketUrl, {
                reconnectionAttempts: 5,
                timeout: 10000,
                transports: ['websocket', 'polling']
            });
            
            this.socket.on('connect', () => {
                console.log('Conexión WebSocket establecida');
                this.setOffline(false);
                this.notify({ type: 'socketConnected' });
            });
            
            this.socket.on('tickets_update', (data) => {
                console.log('Actualizando datos desde WebSocket');
                
                // Guardar en caché para uso offline
                saveCachedData(data);
                
                // Actualizar timestamp
                this.lastUpdate = data.last_update || new Date().toISOString();
                this.notify({ type: 'lastUpdate', timestamp: this.lastUpdate });
                
                // Procesar tickets
                this._processIncomingTickets(data);
            });
            
            this.socket.on('disconnect', () => {
                console.log('Conexión WebSocket desconectada');
                this.notify({ type: 'socketDisconnected' });
            });
            
            this.socket.on('connect_error', () => {
                console.error('Error al conectar a WebSocket, volviendo a modo de polling');
                this.notify({ type: 'socketError' });
                
                if (this.connectionRetries < CONFIG.maxRetries) {
                    this.connectionRetries++;
                    setTimeout(() => {
                        if (navigator.onLine) this.socket.connect();
                    }, CONFIG.retryDelay * this.connectionRetries);
                } else {
                    CONFIG.enableRealTimeUpdates = false;
                    this.setOffline(true);
                    
                    // Usar intervalo solo si no estamos offline
                    if (navigator.onLine) {
                        setInterval(() => {
                            if (navigator.onLine) {
                                this.fetchAllTickets();
                            }
                        }, CONFIG.refreshInterval);
                    }
                }
            });
            
            // Control de reconexión manual
            setInterval(() => {
                if (!this.socket.connected && navigator.onLine) {
                    console.log('Intentando reconexión programada...');
                    this.socket.connect();
                }
            }, CONFIG.refreshInterval);
            
            return true;
        } catch (error) {
            console.error('Error al inicializar Socket.io:', error);
            this.notify({ 
                type: 'error', 
                context: 'socket', 
                message: `Error de conexión: ${error.message}`
            });
            
            CONFIG.enableRealTimeUpdates = false;
            return false;
        }
    }
    
    checkNetworkStatus() {
        if (navigator.onLine) {
            this.handleOnlineStatus();
        } else {
            this.handleOfflineStatus();
        }
    }
    
    handleOnlineStatus() {
        this.setOffline(false);
        
        // Intentar recuperar datos si estuvimos offline
        this.fetchAllTickets();
        
        // Intentar reconectar WebSocket si está configurado
        if (CONFIG.enableRealTimeUpdates && this.socket && !this.socket.connected) {
            this.socket.connect();
        }
    }
    
    handleOfflineStatus() {
        this.setOffline(true);
        
        // Cargar datos desde localStorage
        this.handleOfflineData();
    }
}

// Crear instancia global del estado
const appState = new AppState();

// Funciones utilitarias
function fetchWithRetry(fetchFn, retries = CONFIG.maxRetries) {
    return new Promise(async (resolve, reject) => {
        let lastError;
        
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const result = await fetchFn();
                return resolve(result);
            } catch (error) {
                console.log(`Reintentando petición: ${retries - attempt - 1} intentos restantes`);
                lastError = error;
                
                // Aplicar delay exponencial entre reintentos
                const delay = CONFIG.retryDelay * Math.pow(2, attempt);
                await new Promise(r => setTimeout(r, delay));
            }
        }
        
        reject(lastError || new Error('Error en la petición después de varios reintentos'));
    });
}

function normalizeString(str) {
    if (!str) return '';
    return String(str).toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function parseTicketDate(dateStr) {
    if (!dateStr) return null;
    
    try {
        // Intentar diversos formatos de fecha
        const formatos = [
            'YYYY-MM-DD HH:mm:ss',
            'YYYY-MM-DD HH:mm',
            'DD/MM/YYYY HH:mm:ss',
            'DD/MM/YYYY HH:mm',
            'DD-MM-YYYY HH:mm:ss',
            'DD-MM-YYYY HH:mm'
        ];
        
        let parsedDate = null;
        
        for (const formato of formatos) {
            parsedDate = moment(dateStr, formato, true);
            if (parsedDate.isValid()) break;
        }
        
        // Si no se pudo parsear con los formatos conocidos, intentar con parse automático
        if (!parsedDate || !parsedDate.isValid()) {
            parsedDate = moment(dateStr);
        }
        
        // Si todavía no es válida, retornar null
        if (!parsedDate || !parsedDate.isValid()) return null;
        
        // Corregir fechas futuras (si el año es mayor al actual + 1)
        const currentYear = moment().year();
        if (parsedDate.year() > currentYear + 1) {
            parsedDate.year(currentYear);
        }
        
        return parsedDate.toDate();
    } catch (e) {
        console.error('Error al parsear fecha:', e);
        return null;
    }
}

function formatFecha(fechaStr) {
    if (!fechaStr) return 'No disponible';
    
    const parsedDate = parseTicketDate(fechaStr);
    if (!parsedDate) return fechaStr;
    
    return moment(parsedDate).format('DD-MM-YYYY HH:mm');
}

function formatTimeAgo(fechaStr) {
    if (!fechaStr) return 'No disponible';
    
    const parsedDate = parseTicketDate(fechaStr);
    if (!parsedDate) return fechaStr;
    
    return moment(parsedDate).fromNow();
}

function detectTicketCategory(ticket) {
    const estado = (ticket.Estado || '').toLowerCase();
    
    if (estado.includes('nuevo') || estado === 'new') {
        return 'nuevos';
    } else if (estado.includes('espera') || estado === 'waiting' || estado.includes('stand by')) {
        return 'espera';
    } else if (estado.includes('curso') || estado.includes('progreso') || estado.includes('in progress')) {
        return 'curso';
    } else if (estado.includes('resuelto') || estado.includes('resolved') || estado.includes('cerrado') || estado.includes('closed')) {
        return 'resueltos';
    }
    
    return 'nuevos';
}

function saveCachedData(data) {
    try {
        const serializedData = JSON.stringify({
            ...data,
            cacheSavedAt: new Date().toISOString()
        });
        localStorage.setItem('tickets_cache', serializedData);
        
        // También guardamos un backup si es una actualización grande
        const numTickets = 
            (data.tickets ? data.tickets.length : 0) || 
            (data.nuevos ? data.nuevos.length : 0) + 
            (data.en_curso ? data.en_curso.length : 0) + 
            (data.espera ? data.espera.length : 0) + 
            (data.resueltos ? data.resueltos.length : 0);
        
        if (numTickets > 10) {
            localStorage.setItem('tickets_cache_backup', serializedData);
        }
    } catch (error) {
        console.error('Error al guardar datos en caché:', error);
        
        // Si es error de espacio, intentar limpiar otros datos
        if (error.name === 'QuotaExceededError') {
            try {
                // Eliminar datos que no sean críticos
                const keysToPreserve = ['tickets_cache', 'tickets_cache_backup'];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!keysToPreserve.includes(key)) {
                        localStorage.removeItem(key);
                    }
                }
                
                // Intentar guardar de nuevo con menos datos
                const trimmedData = { ...data };
                if (trimmedData.resueltos && trimmedData.resueltos.length > 50) {
                    trimmedData.resueltos = trimmedData.resueltos.slice(0, 50);
                }
                localStorage.setItem('tickets_cache', JSON.stringify(trimmedData));
            } catch (e) {
                console.error('Error al intentar liberar espacio:', e);
            }
        }
    }
}

// Gestión de caché avanzada
class CacheManager {
    constructor() {
        this.store = {};
        this.memoryLimit = 50 * 1024 * 1024; // 50MB límite aproximado
        this.currentSize = 0;
    }
    
    set(key, value, ttl = 3600000) { // ttl en ms, default 1 hora
        try {
            const serialized = JSON.stringify(value);
            const size = serialized.length * 2; // Aproximación de tamaño en bytes
            
            // Comprobar si excedemos el límite de memoria
            if (this.currentSize + size > this.memoryLimit) {
                this._evictOldEntries();
            }
            
            this.store[key] = {
                value,
                expires: Date.now() + ttl,
                size,
                lastAccessed: Date.now()
            };
            
            this.currentSize += size;
            return true;
        } catch (e) {
            console.error(`Error al guardar en caché: ${key}`, e);
            return false;
        }
    }
    
    get(key) {
        const entry = this.store[key];
        if (!entry) return null;
        
        // Verificar expiración
        if (entry.expires < Date.now()) {
            this._removeEntry(key);
            return null;
        }
        
        // Actualizar tiempo de último acceso
        entry.lastAccessed = Date.now();
        return entry.value;
    }
    
    _removeEntry(key) {
        if (this.store[key]) {
            this.currentSize -= this.store[key].size;
            delete this.store[key];
            return true;
        }
        return false;
    }
    
    _evictOldEntries() {
        // Eliminar entradas expiradas primero
        Object.keys(this.store).forEach(key => {
            if (this.store[key].expires < Date.now()) {
                this._removeEntry(key);
            }
        });
        
        // Si aún necesitamos liberar espacio, eliminar las menos usadas recientemente
        if (this.currentSize > this.memoryLimit * 0.9) {
            const entries = Object.keys(this.store)
                .map(key => ({ key, lastAccessed: this.store[key].lastAccessed }))
                .sort((a, b) => a.lastAccessed - b.lastAccessed);
            
            // Eliminar el 20% más antiguo
            const toRemove = Math.ceil(entries.length * 0.2);
            entries.slice(0, toRemove).forEach(entry => {
                this._removeEntry(entry.key);
            });
        }
    }
    
    clear() {
        this.store = {};
        this.currentSize = 0;
    }
}

// Instancia global de caché
const memoryCache = new CacheManager();

// Componentes de la UI
class UIController {
    constructor(appState) {
        this.appState = appState;
        
        // Cache de elementos DOM frecuentemente accedidos
        this.elements = {};
        
        // Mantener estado de UI
        this.uiState = {
            scrollPosition: 0,
            activeTab: 'all',
            selectedTicketId: null,
            lastRenderedQuery: '',
            renderedTickets: new Set(), // Tickets actualmente en el DOM
            updatingTickets: new Set(), // Tickets en proceso de actualización
            animations: {} // Estado de animaciones en curso
        };
        
        // Registrar observador para actualizaciones de estado
        this.appState.subscribe({
            update: (data) => this.handleStateUpdate(data)
        });
    }
    
    init() {
        // Inicializar cache de elementos DOM
        this._cacheElements();
        
        // Configurar manejadores de eventos
        this._setupEventListeners();
        
        // Configurar gestión de conexión
        this._setupConnectionHandling();
        
        // Configurar animaciones globales de UI
        this._setupAnimations();
        
        // Inicializar sistema de notificaciones
        this._initNotifications();
        
        console.log('UIController inicializado');
    }
    
    _cacheElements() {
        // Elementos principales
        const elementsToCache = [
            'searchForm', 'searchQuery', 'searchField', 'clearSearch', 
            'searchStatus', 'searchResults', 'totalResults', 'loading',
            'connectionStatus', 'lastUpdate', 'ticketDetailsModal',
            'counter-nuevos', 'counter-espera', 'counter-curso', 'counter-resueltos',
            'nuevosCard', 'esperaCard', 'cursoCard', 'resueltosCard'
        ];
        
        elementsToCache.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });
        
        console.log('Elementos DOM cacheados');
    }
    
    _setupEventListeners() {
        // Formulario de búsqueda
        if (this.elements.searchForm) {
            this.elements.searchForm.addEventListener('submit', this.handleSearch.bind(this));
        }
        
        // Botón limpiar búsqueda
        if (this.elements.clearSearch) {
            this.elements.clearSearch.addEventListener('click', this.handleClearSearch.bind(this));
        }
        
        // Input de búsqueda para búsqueda rápida
        if (this.elements.searchQuery) {
            this.elements.searchQuery.addEventListener('input', this.handleQuickSearch.bind(this));
        }
        
        // Tarjetas de estadísticas
        this._setupStatCards();
        
        // Guardado de scroll y estado antes de actualizaciones
        window.addEventListener('scroll', this.saveScrollPosition.bind(this), { passive: true });
        
        console.log('Event listeners configurados');
    }
    
    _setupStatCards() {
        const statCards = {
            'nuevosCard': 'nuevos',
            'esperaCard': 'espera',
            'cursoCard': 'curso',
            'resueltosCard': 'resueltos'
        };
        
        // Configurar clics en tarjetas de estadísticas
        Object.entries(statCards).forEach(([elementId, category]) => {
            const element = this.elements[elementId];
            if (element) {
                element.addEventListener('click', () => this.filterByCategory(category));
                
                // Agregar efectos de hover con animaciones
                element.addEventListener('mouseenter', () => {
                    const counter = element.querySelector('p');
                    if (counter) {
                        counter.classList.add('animate-pulse');
                    }
                });
                
                element.addEventListener('mouseleave', () => {
                    const counter = element.querySelector('p');
                    if (counter) {
                        counter.classList.remove('animate-pulse');
                    }
                });
            }
        });
    }
    
    _setupConnectionHandling() {
        // Escuchar eventos de conexión
        window.addEventListener('online', () => {
            this.appState.handleOnlineStatus();
        });
        
        window.addEventListener('offline', () => {
            this.appState.handleOfflineStatus();
        });
    }
    
    _setupAnimations() {
        // Configurar animaciones globales
        document.documentElement.style.setProperty('--transition-duration', `${CONFIG.animationDuration}ms`);
    }
    
    _initNotifications() {
        // Crear contenedor para notificaciones si no existe
        let notificationContainer = document.getElementById('notification-container');
        if (!notificationContainer) {
            notificationContainer = document.createElement('div');
            notificationContainer.id = 'notification-container';
            notificationContainer.className = 'fixed bottom-4 right-4 z-50 flex flex-col-reverse items-end space-y-reverse space-y-2';
            document.body.appendChild(notificationContainer);
        }
    }
    
    saveScrollPosition() {
        this.uiState.scrollPosition = window.scrollY;
    }
    
    restoreScrollPosition() {
        window.scrollTo({
            top: this.uiState.scrollPosition,
            behavior: 'auto'
        });
    }
    
    // --- Handlers para actualizaciones de estado ---
    
    handleStateUpdate(data) {
        switch (data.type) {
            case 'loading':
                this.updateLoadingState(data.isLoading);
                break;
            case 'connection':
                this.updateConnectionStatus(data.isOffline);
                break;
            case 'tickets':
                this.processTicketsUpdate(data.data);
                break;
            case 'counters':
                this.updateCounters(data.data);
                break;
            case 'lastUpdate':
                this.updateLastUpdateTime(data.timestamp);
                break;
            case 'searchResults':
                this.updateSearchResults(data.results);
                break;
            case 'searchCleared':
                this.clearSearchResults();
                break;
            case 'error':
                this.showError(data);
                break;
            case 'socketConnected':
                this.handleSocketConnection(true);
                break;
            case 'socketDisconnected':
            case 'socketError':
                this.handleSocketConnection(false);
                break;
            case 'offlineData':
                this.handleOfflineData(data);
                break;
            case 'noOfflineData':
                this.handleNoOfflineData();
                break;
        }
    }
    
    updateLoadingState(isLoading) {
        const loadingElement = this.elements.loading;
        if (loadingElement) {
            if (isLoading) {
                loadingElement.classList.remove('hidden');
                loadingElement.classList.add('flex');
            } else {
                // Usar transición para ocultar
                loadingElement.classList.add('opacity-0');
                setTimeout(() => {
                    loadingElement.classList.add('hidden');
                    loadingElement.classList.remove('flex', 'opacity-0');
                }, 300);
            }
        }
    }
    
    updateConnectionStatus(isOffline) {
        const statusElement = this.elements.connectionStatus;
        if (statusElement) {
            if (isOffline) {
                statusElement.className = 'connection-status bg-red-500 text-white';
                statusElement.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Sin conexión';
            } else {
                statusElement.className = 'connection-status bg-green-500 text-white';
                statusElement.innerHTML = '<i class="fas fa-wifi mr-1"></i> Conectado';
            }
        }
    }
    
    processTicketsUpdate(ticketsData) {
        const { all, added, removed, updated } = ticketsData;
        
        // Si hay una búsqueda activa, actualizar solo los resultados filtrados
        if (this.appState.currentSearch.query) {
            return; // La búsqueda se actualiza separadamente
        }
        
        // Obtener los tickets a mostrar (los más recientes)
        const ticketsToShow = all.slice(0, CONFIG.maxResults);
        
        // Actualizar contenedor principal optimizando DOM
        this.updateTicketsContainer(ticketsToShow, added, removed, updated);
        
        // Actualizar mensaje de estado
        if (this.elements.searchStatus) {
            this.elements.searchStatus.textContent = 
                `Base de datos actualizada con ${all.length} tickets. Mostrando los ${Math.min(CONFIG.maxResults, all.length)} más recientes.`;
            this.elements.searchStatus.className = 'text-sm text-gray-500 mt-1';
        }
        
        // Actualizar contador total
        if (this.elements.totalResults) {
            this.elements.totalResults.textContent = all.length;
        }
    }
    
    updateTicketsContainer(tickets, added, removed, updated) {
        const container = this.elements.searchResults;
        if (!container) return;
        
        // Obtener IDs de tickets actualmente renderizados
        const currentTicketElements = container.querySelectorAll('.ticket-card');
        const renderedTicketIds = new Set();
        currentTicketElements.forEach(el => {
            const ticketId = el.getAttribute('data-ticket-id');
            if (ticketId) renderedTicketIds.add(ticketId);
        });
        
        // 1. Eliminar tickets que ya no deben mostrarse
        const ticketsToRemove = [...currentTicketElements].filter(el => {
            const ticketId = el.getAttribute('data-ticket-id');
            return !tickets.some(t => (t.ticket_id === ticketId || t.ID === ticketId));
        });
        
        // Eliminar con animación
        ticketsToRemove.forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-20px)';
            setTimeout(() => el.remove(), CONFIG.animationDuration);
        });
        
        // 2. Agregar nuevos tickets
        const ticketsToAdd = tickets.filter(t => 
            !renderedTicketIds.has(t.ticket_id) && !renderedTicketIds.has(t.ID)
        );
        
        // 3. Actualizar tickets existentes
        const ticketsToUpdate = tickets.filter(t => 
            renderedTicketIds.has(t.ticket_id) || renderedTicketIds.has(t.ID)
        );
        
        // Primero actualizar existentes
        ticketsToUpdate.forEach(ticket => {
            const effectiveTicketId = ticket.ticket_id || ticket.ID;
            const existingElement = container.querySelector(`.ticket-card[data-ticket-id="${effectiveTicketId}"]`);
            
            if (existingElement) {
                // Verificar si el ticket está en proceso de actualización
                if (this.uiState.updatingTickets.has(effectiveTicketId)) {
                    return; // Evitar múltiples actualizaciones simultáneas
                }
                
                this.uiState.updatingTickets.add(effectiveTicketId);
                
                // Actualizar solo contenido, no toda la tarjeta
                this.updateTicketCardContent(existingElement, ticket);
                
                // Actualizar posición si es necesario
                const currentIndex = Array.from(container.children).indexOf(existingElement);
                const newIndex = tickets.findIndex(t => (t.ticket_id === effectiveTicketId || t.ID === effectiveTicketId));
                
                if (currentIndex !== newIndex && newIndex >= 0) {
                    // Mover con animación
                    this.moveTicketCard(existingElement, container, newIndex);
                }
                
                setTimeout(() => {
                    this.uiState.updatingTickets.delete(effectiveTicketId);
                }, CONFIG.animationDuration);
            }
        });
        
        // Luego agregar nuevos con animación
        if (ticketsToAdd.length > 0) {
            let fragment = document.createDocumentFragment();
            
            ticketsToAdd.forEach((ticket, index) => {
                const ticketElement = this.createTicketElement(ticket);
                
                // Configurar para animación de entrada
                ticketElement.style.opacity = '0';
                ticketElement.style.transform = 'translateY(20px)';
                
                fragment.appendChild(ticketElement);
            });
            
            // Agregar al DOM
            container.appendChild(fragment);
            
            // Animar entrada
            setTimeout(() => {
                const newElements = container.querySelectorAll('.ticket-card[style*="opacity: 0"]');
                newElements.forEach((el, idx) => {
                    setTimeout(() => {
                        el.style.transition = `all ${CONFIG.animationDuration}ms ease`;
                        el.style.opacity = '1';
                        el.style.transform = 'translateY(0)';
                    }, 50 * idx);
                });
            }, 10);
        }
        
        // Si el contenedor está vacío después de procesar, mostrar mensaje
        if (container.children.length === 0) {
            container.innerHTML = `
                <div class="col-span-1 md:col-span-2 flex flex-col items-center justify-center py-12">
                    <i class="fas fa-search text-5xl text-gray-300 mb-4"></i>
                    <h3 class="text-xl font-medium text-gray-600 mb-2">No se encontraron resultados</h3>
                    <p class="text-gray-500">Intenta con otros términos o criterios de búsqueda</p>
                </div>
            `;
        }
    }
    
    createTicketElement(ticket) {
        // Obtener ticket_id efectivo
        const ticketId = ticket.ticket_id || ticket.ID || 'Sin ID';
        
        // Determinar clase CSS según categoría
        let statusClass = '';
        let statusBadge = '';
        
        switch (ticket.category) {
            case 'nuevos': 
                statusClass = 'status-new'; 
                statusBadge = '<span class="ticket-badge bg-info"><i class="fas fa-plus-circle mr-1"></i>Nuevo</span>';
                break;
            case 'espera': 
                statusClass = 'status-waiting'; 
                statusBadge = '<span class="ticket-badge bg-warning"><i class="fas fa-clock mr-1"></i>En Espera</span>';
                break;
            case 'curso': 
                statusClass = 'status-inprogress'; 
                statusBadge = '<span class="ticket-badge bg-primary"><i class="fas fa-cogs mr-1"></i>En Curso</span>';
                break;
            case 'resueltos': 
                statusClass = 'status-resolved'; 
                statusBadge = '<span class="ticket-badge bg-success"><i class="fas fa-check-circle mr-1"></i>Resuelto</span>';
                break;
            default:
                statusClass = 'status-new'; 
                statusBadge = '<span class="ticket-badge bg-info"><i class="fas fa-ticket-alt mr-1"></i>Ticket</span>';
        }
        
        // Formatear tiempo desde última actualización
        let lastUpdateTime = formatTimeAgo(ticket.Ultima_modificacion);
        
        // Truncar título largo
        const tituloCompleto = ticket.Título || ticket.titulo || 'Sin título';
        const tituloTruncado = tituloCompleto.length > 60 ? tituloCompleto.substring(0, 57) + '...' : tituloCompleto;
        
        // Crear elemento
        const ticketElement = document.createElement('div');
        ticketElement.className = `ticket-card ${statusClass}`;
        ticketElement.setAttribute('data-ticket-id', ticketId);
        ticketElement.setAttribute('data-category', ticket.category);
        
        // Usar delegación de eventos para evitar múltiples event listeners
        ticketElement.setAttribute('data-action', 'showDetails');
        
        // HTML interior
        ticketElement.innerHTML = `
            <div class="p-4">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex-1">
                        <h3 class="font-medium text-blue-600 mb-1 truncate" title="${tituloCompleto}">${tituloTruncado}</h3>
                        <div class="text-sm text-gray-600">#${ticketId}</div>
                    </div>
                    <div>
                        ${statusBadge}
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-1 text-sm mb-3">
                    <div>
                        <span class="text-gray-500">Entidad:</span>
                        <span class="font-medium">${ticket.Entidad || ticket.entidad || 'No especificada'}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">Solicitante:</span>
                        <span class="font-medium">${ticket.Solicitante || ticket.solicitante || 'No especificado'}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">Asignado a:</span>
                        <span class="font-medium">${ticket.Asignado_a || ticket.asignado_a || 'Sin asignar'}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">Actualizado:</span>
                        <span class="font-medium">${lastUpdateTime || 'No disponible'}</span>
                    </div>
                </div>
                
                <div class="text-right">
                    <button class="text-blue-600 text-sm hover:text-blue-800">
                        <i class="fas fa-external-link-alt mr-1"></i>Ver detalles
                    </button>
                </div>
            </div>
        `;
        
        return ticketElement;
    }
    
    updateTicketCardContent(element, ticket) {
        // Actualizar solo contenido que puede cambiar
        const titleElement = element.querySelector('h3');
        if (titleElement) {
            const tituloCompleto = ticket.Título || ticket.titulo || 'Sin título';
            const tituloTruncado = tituloCompleto.length > 60 ? tituloCompleto.substring(0, 57) + '...' : tituloCompleto;
            titleElement.textContent = tituloTruncado;
            titleElement.setAttribute('title', tituloCompleto);
        }
        
        // Actualizar categoría/estado
        const oldCategory = element.getAttribute('data-category');
        const newCategory = ticket.category;
        
        if (oldCategory !== newCategory) {
            // Actualizar clase de estado
            element.classList.remove('status-new', 'status-waiting', 'status-inprogress', 'status-resolved');
            
            let statusClass = '';
            let statusBadge = '';
            
            switch (newCategory) {
                case 'nuevos': 
                    statusClass = 'status-new'; 
                    statusBadge = '<span class="ticket-badge bg-info"><i class="fas fa-plus-circle mr-1"></i>Nuevo</span>';
                    break;
                case 'espera': 
                    statusClass = 'status-waiting'; 
                    statusBadge = '<span class="ticket-badge bg-warning"><i class="fas fa-clock mr-1"></i>En Espera</span>';
                    break;
                case 'curso': 
                    statusClass = 'status-inprogress'; 
                    statusBadge = '<span class="ticket-badge bg-primary"><i class="fas fa-cogs mr-1"></i>En Curso</span>';
                    break;
                case 'resueltos': 
                    statusClass = 'status-resolved'; 
                    statusBadge = '<span class="ticket-badge bg-success"><i class="fas fa-check-circle mr-1"></i>Resuelto</span>';
                    break;
            }
            
            element.classList.add(statusClass);
            element.setAttribute('data-category', newCategory);
            
            // Actualizar badge
            const badgeContainer = element.querySelector('.flex.justify-between > div:last-child');
            if (badgeContainer) {
                badgeContainer.innerHTML = statusBadge;
            }
            
            // Destacar cambio de estado
            element.classList.add('highlight-update');
            setTimeout(() => {
                element.classList.remove('highlight-update');
            }, 2000);
        }
        
        // Actualizar campos de información
        const infoFields = [
            { key: 'Entidad', fallback: 'entidad', defaultValue: 'No especificada' },
            { key: 'Solicitante', fallback: 'solicitante', defaultValue: 'No especificado' },
            { key: 'Asignado_a', fallback: 'asignado_a', defaultValue: 'Sin asignar' }
        ];
        
        infoFields.forEach(field => {
            const fieldElement = element.querySelector(`div.grid.grid-cols-2 > div:has(span:contains("${field.key}")) > span.font-medium`);
            if (fieldElement) {
                const value = ticket[field.key] || ticket[field.fallback] || field.defaultValue;
                
                // Destacar si hay cambio
                if (fieldElement.textContent !== value) {
                    fieldElement.innerHTML = `<span class="fade-update">${value}</span>`;
                } else {
                    fieldElement.textContent = value;
                }
            }
        });
        
        // Actualizar tiempo desde última actualización
        const updateTimeElement = element.querySelector(`div.grid.grid-cols-2 > div:has(span:contains("Actualizado")) > span.font-medium`);
        if (updateTimeElement) {
            const newTime = formatTimeAgo(ticket.Ultima_modificacion);
            updateTimeElement.textContent = newTime || 'No disponible';
        }
    }
    
    moveTicketCard(element, container, newIndex) {
        // Almacenar posición original
        const rect = element.getBoundingClientRect();
        
        // Marcar para animación
        element.style.transition = 'none';
        element.style.position = 'relative';
        element.style.zIndex = '10';
        
        requestAnimationFrame(() => {
            // Calcular el movimiento
            const targetElement = container.children[newIndex] || null;
            
            if (targetElement) {
                // Mover antes del elemento objetivo
                container.insertBefore(element, targetElement);
            } else {
                // Mover al final
                container.appendChild(element);
            }
            
            // Forzar reflow para que la animación funcione
            void element.offsetWidth;
            
            // Aplicar animación
            element.style.transition = `all ${CONFIG.animationDuration}ms ease`;
            element.style.position = '';
            element.style.zIndex = '';
        });
    }
    
    updateCounters(counters) {
        // Actualizar contadores con animación
        Object.entries(counters).forEach(([category, count]) => {
            const counterElement = this.elements[`counter-${category}`];
            if (counterElement) {
                const currentCount = parseInt(counterElement.textContent, 10) || 0;
                const targetCount = count || 0;
                
                if (currentCount !== targetCount) {
                    this.animateCounter(counterElement, currentCount, targetCount);
                }
            }
        });
        
        // Actualizar contador total
        const totalCount = Object.values(counters).reduce((sum, val) => sum + val, 0);
        const totalElements = document.querySelectorAll('#totalTickets, #totalResults');
        totalElements.forEach(el => {
            if (el) el.textContent = totalCount;
        });
    }
    
    animateCounter(element, start, end) {
        // Cancelar animación previa si existe
        if (element._animationId) {
            cancelAnimationFrame(element._animationId);
        }
        
        // Variables para la animación
        const duration = 1000; // ms
        const startTime = performance.now();
        
        // Función de animación con curva de aceleración/desaceleración
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Usar curva de ease-out-cubic: t => 1 - Math.pow(1 - t, 3)
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            // Calcular valor actual
            const currentValue = Math.round(start + (end - start) * easeProgress);
            
            // Actualizar elemento
            element.textContent = currentValue;
            
            // Continuar animación si no ha terminado
            if (progress < 1) {
                element._animationId = requestAnimationFrame(animate);
            } else {
                element.textContent = end;
                element._animationId = null;
                
                // Agregar efecto visual al finalizar
                element.classList.add('counter-updated');
                setTimeout(() => {
                    element.classList.remove('counter-updated');
                }, 500);
            }
        };
        
        // Iniciar animación
        element._animationId = requestAnimationFrame(animate);
    }
    
    updateLastUpdateTime(timestamp) {
        const lastUpdateElement = this.elements.lastUpdate;
        if (lastUpdateElement && timestamp) {
            try {
                const formattedDate = moment(timestamp).format('DD-MM-YYYY HH:mm:ss');
                const timeAgo = moment(timestamp).fromNow();
                
                lastUpdateElement.innerHTML = `
                    <span class="mr-1"><i class="fas fa-history"></i></span>
                    Última actualización: ${formattedDate} <span class="text-gray-500">(${timeAgo})</span>
                `;
                
                // Efecto visual de actualización
                lastUpdateElement.classList.add('last-update-flash');
                setTimeout(() => {
                    lastUpdateElement.classList.remove('last-update-flash');
                }, 1000);
            } catch (e) {
                lastUpdateElement.textContent = `Última actualización: ${timestamp}`;
            }
        }
    }
    
    // FUNCIONES MODIFICADAS: updateSearchResults y clearSearchResults
    updateSearchResults(results) {
        const resultsContainer = this.elements.searchResults;
        if (!resultsContainer) return;
        
        // Vaciar completamente el contenedor antes de actualizar
        resultsContainer.innerHTML = '';
        
        if (results.length === 0) {
            // Mostrar mensaje de no resultados
            resultsContainer.innerHTML = `
                <div class="col-span-1 md:col-span-2 flex flex-col items-center justify-center py-12">
                    <i class="fas fa-search text-5xl text-gray-300 mb-4"></i>
                    <h3 class="text-xl font-medium text-gray-600 mb-2">No se encontraron resultados</h3>
                    <p class="text-gray-500">Intenta con otros términos o criterios de búsqueda</p>
                </div>
            `;
            
            // Actualizar mensaje de estado
            if (this.elements.searchStatus) {
                this.elements.searchStatus.textContent = 'No se encontraron resultados';
            }
            return;
        }
        
        // Actualizar mensaje de estado
        if (this.elements.searchStatus) {
            this.elements.searchStatus.textContent = `Se encontraron ${results.length} tickets que coinciden con tu búsqueda.`;
        }
        
        // Actualizar contador
        if (this.elements.totalResults) {
            this.elements.totalResults.textContent = results.length;
        }
        
        // Crear y añadir elementos de ticket
        results.forEach(ticket => {
            const ticketElement = this.createTicketElement(ticket);
            resultsContainer.appendChild(ticketElement);
        });
        
        // Restaurar scroll
        requestAnimationFrame(() => {
            this.restoreScrollPosition();
        });
    }
    
    clearSearchResults() {
        // Mostrar los tickets más recientes (hasta el límite)
        const recentTickets = this.appState.allTickets.slice(0, CONFIG.maxResults);
        
        // Actualizar resultados
        this.updateTicketsContainer(recentTickets, [], [], []);
        
        // Actualizar mensaje y contadores
        if (this.elements.searchStatus) {
            this.elements.searchStatus.textContent = `Base de datos cargada con ${this.appState.allTickets.length} tickets. Mostrando los ${Math.min(CONFIG.maxResults, this.appState.allTickets.length)} más recientes.`;
            this.elements.searchStatus.className = 'text-sm text-gray-500 mt-1';
        }
        
        if (this.elements.totalResults) {
            this.elements.totalResults.textContent = this.appState.allTickets.length;
        }
        
        // Restablecer estado de las tarjetas
        document.querySelectorAll('.stat-card').forEach(card => {
            card.classList.remove('ring-2', 'ring-blue-500');
        });
        
        // Limpiar campos de búsqueda
        if (this.elements.searchQuery) {
            this.elements.searchQuery.value = '';
        }
        
        if (this.elements.searchField) {
            this.elements.searchField.value = 'all';
        }
    }
    
    showError(errorData) {
        const { context, message, retryCount } = errorData;
        console.error(`Error (${context}): ${message}`);
        
        // Actualizar mensaje en la UI
        if (this.elements.searchStatus) {
            this.elements.searchStatus.textContent = message;
            this.elements.searchStatus.className = 'text-sm text-red-500 mt-1';
        }
        
        // Mostrar notificación flotante para errores importantes
        if (context === 'fetch' || context === 'socket') {
            this.showNotification({
                title: `Error de ${context === 'fetch' ? 'conexión' : 'WebSocket'}`,
                message: message,
                type: 'error',
                duration: 5000,
                action: retryCount < CONFIG.maxRetries ? {
                    label: 'Reintentar',
                    callback: () => this.appState.fetchAllTickets()
                } : null
            });
        }
    }
    
    handleSocketConnection(isConnected) {
        const statusElement = this.elements.connectionStatus;
        if (statusElement) {
            if (isConnected) {
                statusElement.className = 'connection-status bg-green-500 text-white';
                statusElement.innerHTML = '<i class="fas fa-wifi mr-1"></i> Conectado (Tiempo real)';
                
                // Mostrar notificación sutil
                this.showNotification({
                    title: 'Conexión establecida',
                    message: 'Recibiendo actualizaciones en tiempo real',
                    type: 'success',
                    duration: 3000
                });
            } else {
                statusElement.className = 'connection-status bg-yellow-500 text-white';
                statusElement.innerHTML = '<i class="fas fa-sync-alt mr-1"></i> Reconectando';
            }
        }
    }
    
    handleOfflineData(data) {
        const { isExpired, timestamp } = data;
        
        // Mostrar mensaje en la UI
        if (this.elements.searchStatus) {
            if (isExpired) {
                this.elements.searchStatus.textContent = `Mostrando datos en caché (${formatFecha(timestamp)}) - Los datos podrían estar desactualizados`;
                this.elements.searchStatus.className = 'text-sm text-orange-500 mt-1';
            } else {
                this.elements.searchStatus.textContent = `Mostrando datos en caché (${formatFecha(timestamp)})`;
                this.elements.searchStatus.className = 'text-sm text-gray-500 mt-1';
            }
        }
        
        // Mostrar notificación si los datos están muy desactualizados
        if (isExpired) {
            this.showNotification({
                title: 'Datos potencialmente desactualizados',
                message: 'Trabajando con datos en caché debido a problemas de conexión',
                type: 'warning',
                duration: 5000,
                action: {
                    label: 'Intentar actualizar',
                    callback: () => this.appState.fetchAllTickets()
                }
            });
        }
    }
    
    handleNoOfflineData() {
        // Mostrar mensaje en la UI
        if (this.elements.searchStatus) {
            this.elements.searchStatus.textContent = 'No hay datos disponibles. Conéctese a Internet para cargar tickets.';
            this.elements.searchStatus.className = 'text-sm text-red-500 mt-1';
        }
        
        // Mostrar notificación
        this.showNotification({
            title: 'Sin datos disponibles',
            message: 'No se encontraron datos en caché. Conéctese a Internet para cargar tickets.',
            type: 'error',
            duration: 0  // No autoclose
        });
    }
    
    // --- Manejadores de eventos ---
    
    handleSearch(event) {
        event.preventDefault();
        
        const query = this.elements.searchQuery.value.trim();
        const field = this.elements.searchField.value;
        
        if (!query) {
            this.handleClearSearch();
            return;
        }
        
        this.appState.performSearch(query, field);
    }
    
    handleClearSearch() {
        this.appState.clearSearch();
    }
    
    handleQuickSearch() {
        const query = this.elements.searchQuery.value.trim();
        
        // Si el usuario borra la búsqueda, limpiar resultados
        if (!query) {
            this.handleClearSearch();
            return;
        }
        
        // Debounce: realizar búsqueda sólo después de 300ms sin escritura
        clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(() => {
            const field = this.elements.searchField.value;
            this.appState.performSearch(query, field);
        }, 300);
    }
    
    filterByCategory(category) {
        // Buscar todos los tickets de la categoría
        const results = this.appState.allTickets.filter(ticket => ticket.category === category);
        
        // Actualizar UI directamente
        this.updateTicketsContainer(results, [], [], []);
        
        // Limpiar campos de búsqueda
        if (this.elements.searchQuery) {
            this.elements.searchQuery.value = '';
        }
        
        if (this.elements.searchField) {
            this.elements.searchField.value = 'all';
        }
        
        // Actualizar texto de búsqueda y contadores
        let categoryLabel = '';
        switch (category) {
            case 'nuevos': categoryLabel = 'Nuevo'; break;
            case 'espera': categoryLabel = 'En Espera'; break;
            case 'curso': categoryLabel = 'En Curso'; break;
            case 'resueltos': categoryLabel = 'Resuelto'; break;
            default: categoryLabel = 'Desconocido';
        }
        
        if (this.elements.searchStatus) {
            this.elements.searchStatus.textContent = `Mostrando tickets en estado: ${categoryLabel} (${results.length})`;
            this.elements.searchStatus.className = 'text-sm text-gray-500 mt-1';
        }
        
        if (this.elements.totalResults) {
            this.elements.totalResults.textContent = results.length;
        }
        
        // Agregar clase activa a la tarjeta seleccionada
        document.querySelectorAll('.stat-card').forEach(card => {
            card.classList.remove('ring-2', 'ring-blue-500');
        });
        
        const categoryCard = this.elements[`${category}Card`];
        if (categoryCard) {
            categoryCard.classList.add('ring-2', 'ring-blue-500');
        }
    }
    
    showTicketDetails(ticketId, category) {
        // Esta función se llama mediante delegación de eventos
        showTicketDetails(ticketId, category);
    }
    
    showNotification(options) {
        const { title, message, type = 'info', duration = 5000, action = null } = options;
        
        // Crear contenedor para notificaciones si no existe
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.className = 'fixed bottom-4 right-4 z-50 flex flex-col-reverse items-end space-y-reverse space-y-2';
            document.body.appendChild(container);
        }
        
        // Crear notificación
        const notificationElement = document.createElement('div');
        
        // Determinar color según tipo
        let bgColor, iconClass;
        switch (type) {
            case 'success':
                bgColor = 'bg-green-50 border-green-500 text-green-800';
                iconClass = 'fas fa-check-circle text-green-500';
                break;
            case 'warning':
                bgColor = 'bg-yellow-50 border-yellow-500 text-yellow-800';
                iconClass = 'fas fa-exclamation-triangle text-yellow-500';
                break;
            case 'error':
                bgColor = 'bg-red-50 border-red-500 text-red-800';
                iconClass = 'fas fa-times-circle text-red-500';
                break;
            default: // info
                bgColor = 'bg-blue-50 border-blue-500 text-blue-800';
                iconClass = 'fas fa-info-circle text-blue-500';
        }
        
        // Configurar elemento
        notificationElement.className = `max-w-sm w-full border-l-4 rounded shadow-lg ${bgColor} p-4 mb-2 transform translate-x-full opacity-0 transition duration-300 ease-in-out`;
        
        // Construir contenido
        let actionHtml = '';
        if (action) {
            actionHtml = `
                <div class="mt-2">
                    <button class="bg-white border border-gray-300 rounded px-3 py-1 text-sm font-medium hover:bg-gray-50 notification-action">
                        ${action.label}
                    </button>
                </div>
            `;
        }
        
        notificationElement.innerHTML = `
            <div class="flex items-start">
                <div class="flex-shrink-0">
                    <i class="${iconClass} text-lg"></i>
                </div>
                <div class="ml-3 flex-1">
                    <div class="font-medium">${title}</div>
                    <div class="mt-1 text-sm">${message}</div>
                    ${actionHtml}
                </div>
                <button class="ml-3 flex-shrink-0 text-gray-400 hover:text-gray-600 notification-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        // Agregar al contenedor
        container.prepend(notificationElement);
        
        // Configurar event listeners
        const closeButton = notificationElement.querySelector('.notification-close');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.closeNotification(notificationElement);
            });
        }
        
        const actionButton = notificationElement.querySelector('.notification-action');
        if (actionButton && action) {
            actionButton.addEventListener('click', () => {
                if (typeof action.callback === 'function') {
                    action.callback();
                }
                this.closeNotification(notificationElement);
            });
        }
        
        // Animar entrada
        requestAnimationFrame(() => {
            notificationElement.classList.remove('translate-x-full', 'opacity-0');
        });
        
        // Configurar autoclose
        if (duration > 0) {
            setTimeout(() => {
                if (notificationElement.parentNode) {
                    this.closeNotification(notificationElement);
                }
            }, duration);
        }
        
        return notificationElement;
    }
    
    closeNotification(element) {
        // Animar salida
        element.classList.add('translate-x-full', 'opacity-0');
        
        // Eliminar después de la animación
        setTimeout(() => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        }, 300);
    }
}

// Inicialización cuando el DOM está listo
document.addEventListener('DOMContentLoaded', () => {
    // Crear gestores principales
    const uiController = new UIController(appState);
    
    // Agregar delegación de eventos global para evitar múltiples listeners
    document.addEventListener('click', (event) => {
        // Encontrar elemento con data-action
        let target = event.target;
        while (target && target !== document) {
            const action = target.getAttribute('data-action');
            if (action) {
                // Prevenir comportamiento por defecto
                event.preventDefault();
                
                // Ejecutar acción correspondiente
                switch (action) {
                    case 'showDetails':
                        const ticketId = target.getAttribute('data-ticket-id');
                        const category = target.getAttribute('data-category');
                        showTicketDetails(ticketId, category);
                        break;
                        
                    // Otras acciones pueden agregarse aquí
                }
                
                break;
            }
            target = target.parentElement;
        }
    });
    
    // Inicializar la UI
    uiController.init();
    
    // Comprobar estado de la conexión
    appState.checkNetworkStatus();
    
    // Establecer conexión WebSocket si está habilitado
    if (CONFIG.enableRealTimeUpdates && navigator.onLine) {
        appState.initSocketConnection();
    }
  
    // Cargar datos iniciales
    appState.fetchAllTickets();
    
    // Configurar actualización periódica (si no hay Socket.io)
    if (!CONFIG.enableRealTimeUpdates) {
        setInterval(() => {
            if (navigator.onLine) {
                appState.fetchAllTickets();
            }
        }, CONFIG.refreshInterval);
    }
    
    // Exponer funciones globales necesarias
    window.showTicketDetails = showTicketDetails;
    window.showTechContactModal = showTechContactModal;
    window.toggleEditMode = toggleEditMode;
    window.exportToCSV = exportToCSV;
});

/**
 * FUNCIÓN MEJORADA: Muestra los detalles completos de un ticket con trazabilidad
 * @param {string} ticketId - ID del ticket
 * @param {string} category - Categoría del ticket
 */
function showTicketDetails(ticketId, category) {
    const modalTitle = document.getElementById('ticketDetailsModalLabel');
    const modalBody = document.getElementById('ticketDetailsBody');
    
    if (!modalTitle || !modalBody) return;
    
    // Mostrar el modal
    const modal = document.getElementById('ticketDetailsModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        // Aplicar animación de entrada
        const modalContent = modal.querySelector('.modal-animate');
        if (modalContent) {
            modalContent.style.opacity = '0';
            modalContent.style.transform = 'scale(0.95)';
            
            requestAnimationFrame(() => {
                modalContent.style.transition = 'opacity 300ms ease-out, transform 300ms ease-out';
                modalContent.style.opacity = '1';
                modalContent.style.transform = 'scale(1)';
            });
        }
    }
    
    // Mostrar spinner de carga
    modalBody.innerHTML = `
        <div class="flex justify-center items-center p-10">
            <div class="loading-spinner"></div>
        </div>
    `;
    
    // Buscar el ticket en memoria o caché
    const cachedKey = `ticket_details_${ticketId}`;
    const cachedTicket = memoryCache.get(cachedKey);
    
    if (cachedTicket) {
        renderTicketDetails(cachedTicket, category, modalTitle, modalBody);
        return;
    }
    
    // Buscar en los tickets disponibles en el estado global
    const ticket = appState.allTickets.find(t => 
        (t.ticket_id === ticketId || t.ID === ticketId) && 
        (t.category === category || !category)
    );
    
    if (!ticket) {
        modalBody.innerHTML = `
            <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
                <div class="flex items-center">
                    <i class="fas fa-exclamation-circle mr-3 text-xl"></i>
                    <p>No se pudo encontrar información para el ticket #${ticketId}.</p>
                </div>
            </div>
        `;
        modalTitle.textContent = `Ticket #${ticketId}`;
        return;
    }
    
    // Guardar en memoria caché para futuras consultas
    memoryCache.set(cachedKey, ticket, 300000); // 5 minutos de TTL
    
    // Renderizar detalles
    renderTicketDetails(ticket, category, modalTitle, modalBody);
}

/**
 * Renderiza los detalles del ticket en el modal
 */
function renderTicketDetails(ticket, category, modalTitle, modalBody) {
    const effectiveCategory = category || ticket.category || detectTicketCategory(ticket);
    const effectiveTicketId = ticket.ticket_id || ticket.ID || 'Sin ID';
    
    modalTitle.textContent = `Ticket #${effectiveTicketId}`;
    
    let statusBadge = '';
    let progressPercentage = 0;
    
    switch (effectiveCategory) {
        case 'nuevos': 
            statusBadge = '<span class="ticket-badge bg-info"><i class="fas fa-plus-circle mr-1"></i>Nuevo</span>';
            progressPercentage = 25;
            break;
        case 'espera': 
            statusBadge = '<span class="ticket-badge bg-warning"><i class="fas fa-clock mr-1"></i>En Espera</span>';
            progressPercentage = 50;
            break;
        case 'curso': 
            statusBadge = '<span class="ticket-badge bg-primary"><i class="fas fa-cogs mr-1"></i>En Curso</span>';
            progressPercentage = 75;
            break;
        case 'resueltos': 
            statusBadge = '<span class="ticket-badge bg-success"><i class="fas fa-check-circle mr-1"></i>Resuelto</span>';
            progressPercentage = 100;
            break;
    }
    
    let fechaApertura = formatFecha(ticket.Fecha_apertura || ticket.fecha_apertura);
    let ultimaModificacion = formatFecha(ticket.Ultima_modificacion || ticket.ultima_modificacion);
    
    const trazabilidadHtml = `
    <div class="traceability-container ticket-detail-animate">
        <div class="shine-effect"></div>
        <h3 class="traceability-title text-lg font-semibold">
            <i class="fas fa-route"></i>
            Trazabilidad del Ticket
        </h3>
        
        <div class="trace-timeline">
            <div class="trace-line">
                <div class="trace-progress" style="width: ${progressPercentage}%;"></div>
            </div>
            
            <div class="trace-steps">
                <!-- Paso: Nuevo -->
                <div class="trace-step ${getTraceNodeClass('nuevos', effectiveCategory)}">
                    <div class="step-icon-container">
                        <div class="step-indicator">
                            <i class="fas fa-plus-circle"></i>
                        </div>
                        <div class="step-pulse"></div>
                        <div class="step-info">
                            Ticket creado y pendiente de asignación
                        </div>
                    </div>
                    <div class="step-label">Nuevo</div>
                </div>
                
                <!-- Paso: En Espera -->
                <div class="trace-step ${getTraceNodeClass('espera', effectiveCategory)}">
                    <div class="step-icon-container">
                        <div class="step-indicator">
                            <i class="fas fa-hourglass-half"></i>
                        </div>
                        <div class="step-pulse"></div>
                        <div class="step-info">
                            Ticket en espera de información o acción
                        </div>
                    </div>
                    <div class="step-label">En Espera</div>
                </div>
                
                <!-- Paso: En Curso -->
                <div class="trace-step ${getTraceNodeClass('curso', effectiveCategory)}">
                    <div class="step-icon-container">
                        <div class="step-indicator">
                            <i class="fas fa-cogs"></i>
                        </div>
                        <div class="step-pulse"></div>
                        <div class="step-info">
                            Técnico trabajando en la solución
                        </div>
                    </div>
                    <div class="step-label">En Curso</div>
                </div>
                
                <!-- Paso: Resuelto -->
                <div class="trace-step ${getTraceNodeClass('resueltos', effectiveCategory)}">
                    <div class="step-icon-container">
                        <div class="step-indicator">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <div class="step-pulse"></div>
                        <div class="step-info">
                            Ticket resuelto y cerrado
                        </div>
                    </div>
                    <div class="step-label">Resuelto</div>
                </div>
            </div>
        </div>
        
        <div class="trace-dates-info">
            <div class="trace-date-item">
                <span class="date-label">
                    <i class="far fa-calendar-plus text-blue-500 mr-1"></i>
                    Fecha de Apertura:
                </span>
                <span class="date-value">${fechaApertura}</span>
            </div>
            <div class="trace-date-item">
                <span class="date-label">
                    <i class="far fa-calendar-check text-green-500 mr-1"></i>
                    Última Actualización:
                </span>
                <span class="date-value">${ultimaModificacion}</span>
            </div>
        </div>
    </div>`;
    
    const nombreTecnico = ticket.Asignado_a || ticket.asignado_a || '';
    const tieneTecnicoAsignado = nombreTecnico && nombreTecnico !== 'No asignado' && nombreTecnico !== 'Sin asignar';
    
    let tecnicoContactoHtml = '';
    if (tieneTecnicoAsignado) {
        tecnicoContactoHtml = `
            <div class="bg-white rounded-lg shadow-sm mb-6 ticket-detail-animate">
                <div class="px-4 py-3 bg-blue-50 border-b border-blue-100 rounded-t-lg flex justify-between items-center">
                    <h3 class="font-semibold text-blue-700"><i class="fas fa-headset mr-2"></i>Técnico Asignado</h3>
                    <button onclick="showTechContactModal('${nombreTecnico}')" class="px-3 py-1 bg-blue-600 text-white rounded-full hover:bg-blue-700 text-sm">
                        <i class="fas fa-address-card mr-1"></i> Ver Contacto
                    </button>
                </div>
                <div class="p-4">
                    <div class="flex items-center">
                        <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mr-3">
                            <i class="fas fa-user"></i>
                        </div>
                        <div>
                            <h4 class="font-medium">${nombreTecnico}</h4>
                            <p class="text-sm text-gray-500">Haz clic en "Ver Contacto" para obtener información detallada</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    const ticketTitulo = ticket.Título || ticket.titulo || 'Sin título';
    
    modalBody.innerHTML = `
        <div class="ticket-detail-header rounded-lg mb-6 ticket-detail-animate">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="md:col-span-2">
                    <h2 class="text-xl font-semibold mb-2">${ticketTitulo}</h2>
                    <div class="flex flex-wrap items-center gap-3">
                        ${statusBadge}
                        <span class="text-gray-600 text-sm">
                            <i class="fas fa-hashtag"></i> ${effectiveTicketId}
                        </span>
                        ${ticket.ID_interno ? `
                        <span class="text-gray-600 text-sm">
                            <i class="fas fa-database"></i> ID Interno: ${ticket.ID_interno}
                        </span>
                        ` : ''}
                    </div>
                </div>
                <div class="text-right">
                    <div class="ticket-property">
                        <span class="ticket-property-label">Fecha de Apertura:</span>
                        <span>${fechaApertura}</span>
                    </div>
                    <div class="ticket-property">
                        <span class="ticket-property-label">Última Actualización:</span>
                        <span>${ultimaModificacion}</span>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- COMPONENTE: Trazabilidad Mejorada -->
        ${trazabilidadHtml}
        
        <!-- Contacto con Técnico (si hay asignado) -->
        ${tieneTecnicoAsignado ? tecnicoContactoHtml : ''}
        
        <!-- Detalles del Ticket en tarjetas -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <!-- Información General -->
            <div class="bg-white rounded-lg shadow-sm ticket-detail-animate">
                <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 rounded-t-lg">
                    <h3 class="font-semibold"><i class="fas fa-info-circle mr-2"></i>Información General</h3>
                </div>
                <div class="p-4">
                    <table class="w-full">
                        <tbody>
                            <tr class="border-b border-gray-100">
                                <td class="py-2 font-medium text-gray-600">Entidad:</td>
                                <td class="py-2">${ticket.Entidad || ticket.entidad || 'No especificada'}</td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-2 font-medium text-gray-600">Categoría:</td>
                                <td class="py-2">${ticket.Categoria || ticket.categoria || 'No especificada'}</td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-2 font-medium text-gray-600">Tipo:</td>
                                <td class="py-2">${ticket.Tipo || ticket.tipo || 'No especificado'}</td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-2 font-medium text-gray-600">Prioridad:</td>
                                <td class="py-2">${ticket.Prioridad || ticket.prioridad || 'No especificada'}</td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-2 font-medium text-gray-600">Medio:</td>
                                <td class="py-2">${ticket.Medio || ticket.medio || 'No especificado'}</td>
                            </tr>
                            <tr>
                                <td class="py-2 font-medium text-gray-600">Ubicación:</td>
                                <td class="py-2">${ticket.Ubicacion || ticket.ubicacion || 'No especificada'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Asignación -->
            <div class="bg-white rounded-lg shadow-sm ticket-detail-animate">
                <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 rounded-t-lg">
                    <h3 class="font-semibold"><i class="fas fa-user mr-2"></i>Asignación</h3>
                </div>
                <div class="p-4">
                    <table class="w-full">
                        <tbody>
                            <tr class="border-b border-gray-100">
                                <td class="py-2 font-medium text-gray-600">Solicitante:</td>
                                <td class="py-2">${ticket.Solicitante || ticket.solicitante || 'No especificado'}</td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-2 font-medium text-gray-600">Asignado a:</td>
                                <td class="py-2">
                                    ${ticket.Asignado_a || ticket.asignado_a || 'No asignado'}
                                    ${tieneTecnicoAsignado ? `
                                      <a href="javascript:void(0)" onclick="showTechContactModal('${nombreTecnico}')" class="ml-2 text-blue-600 hover:text-blue-800">
                                        <i class="fas fa-id-card"></i> Ver contacto
                                      </a>` : 
                                      ''
                                    }
                                </td>
                            </tr>
                            <tr>
                                <td class="py-2 font-medium text-gray-600">Estado:</td>
                                <td class="py-2">${ticket.Estado || ticket.estado || 'No especificado'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <!-- Tiempos -->
        <div class="bg-white rounded-lg shadow-sm mb-6 ticket-detail-animate">
            <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 rounded-t-lg">
                <h3 class="font-semibold"><i class="fas fa-clock mr-2"></i>Tiempos</h3>
            </div>
            <div class="p-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <table class="w-full">
                            <tbody>
                                <tr class="border-b border-gray-100">
                                    <td class="py-2 font-medium text-gray-600">Fecha Apertura:</td>
                                    <td class="py-2">${fechaApertura}</td>
                                </tr>
                                <tr>
                                    <td class="py-2 font-medium text-gray-600">Última Modificación:</td>
                                    <td class="py-2">${ultimaModificacion}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div>
                        <table class="w-full">
                            <tbody>
                                <tr class="border-b border-gray-100">
                                    <td class="py-2 font-medium text-gray-600">Tiempo Resolución:</td>
                                    <td class="py-2">${ticket.Tiempo_resolucion || ticket.tiempo_resolucion || 'No disponible'}</td>
                                </tr>
                                <tr class="border-b border-gray-100">
                                    <td class="py-2 font-medium text-gray-600">Duración:</td>
                                    <td class="py-2">${ticket.Duracion || ticket.duracion || 'No disponible'}</td>
                                </tr>
                                <tr class="border-b border-gray-100">
                                    <td class="py-2 font-medium text-gray-600">Tiempo Adicional:</td>
                                    <td class="py-2">${ticket.Tiempo_adicional || ticket.tiempo_adicional || 'No asignado'}</td>
                                </tr>
                                <tr>
                                    <td class="py-2 font-medium text-gray-600">Delay:</td>
                                    <td class="py-2">${ticket.Delay || ticket.delay || 'No disponible'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Botones de acción -->
        <div class="flex flex-wrap justify-end gap-3">
            <button class="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300" onclick="printTicketDetails()">
                <i class="fas fa-print mr-2"></i>Imprimir
            </button>
            <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700" onclick="openTicketInSystem('${effectiveTicketId}')">
                <i class="fas fa-external-link-alt mr-2"></i>Ver en sistema
            </button>
            ${tieneTecnicoAsignado ? 
              `<button onclick="showTechContactModal('${nombreTecnico}')" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                <i class="fas fa-phone-alt mr-2"></i>Contactar técnico
              </button>` : 
              ''
            }
        </div>
    `;
    
    // Animar entrada de los elementos
    setTimeout(() => {
        const elements = modalBody.querySelectorAll('.ticket-detail-animate');
        elements.forEach((el, index) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            el.style.transition = 'all 0.3s ease';
            
            setTimeout(() => {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            }, 100 * (index + 1));
        });
    }, 100);
}

/**
 * Determina la clase CSS para cada nodo de trazabilidad según el estado actual
 * @param {string} nodeCategory - Categoría del nodo a evaluar
 * @param {string} currentCategory - Categoría actual del ticket
 * @returns {string} - Clase CSS para el nodo
 */
function getTraceNodeClass(nodeCategory, currentCategory) {
    const states = {
        'nuevos': 1,
        'espera': 2,
        'curso': 3,
        'resueltos': 4
    };
    
    const currentState = states[currentCategory] || 0;
    const nodeState = states[nodeCategory] || 0;
    
    if (nodeState === currentState) return 'step-active';
    if (nodeState < currentState) return 'step-completed';
    return '';
}

/**
 * Muestra el modal de contacto del técnico con opción de edición
 * @param {string} nombreTecnico - Nombre del técnico a buscar
 */
function showTechContactModal(nombreTecnico) {
    // Obtenemos referencias al modal y sus componentes
    const modal = document.getElementById('techContactModal');
    const modalTitle = document.getElementById('techContactModalTitle');
    const viewMode = document.getElementById('techContactViewMode');
    const editMode = document.getElementById('techContactEditMode');

    if (!modal || !modalTitle || !viewMode || !editMode) {
        console.error('No se encontraron elementos del modal de contacto');
        return;
    }

    // Mostrar el modal con animación
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Animar entrada del contenido
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.style.opacity = '0';
        modalContent.style.transform = 'scale(0.95)';

        requestAnimationFrame(() => {
            modalContent.style.transition = 'opacity 300ms ease-out, transform 300ms ease-out';
            modalContent.style.opacity = '1';
            modalContent.style.transform = 'scale(1)';
        });
    }

    // Asegurarse de que estamos en modo visualización
    viewMode.classList.remove('hidden');
    editMode.classList.add('hidden');

    // Actualizar el título
    modalTitle.textContent = `Contacto: ${nombreTecnico}`;

    // Mostrar cargando
    viewMode.innerHTML = `
        <div class="flex justify-center my-2">
            <div class="loading-spinner"></div>
        </div>
        <p class="text-center text-gray-500">Cargando información del técnico...</p>
    `;

    // --- AGREGADO: Configurar cierre del modal ---
    const closeButton = document.querySelector('#closeTechModal');
    if (closeButton) {
        // Eliminar event listeners previos para evitar duplicados
        closeButton.replaceWith(closeButton.cloneNode(true));

        // Obtener referencia al nuevo botón
        const newCloseButton = document.querySelector('#closeTechModal');

        // Agregar event listener
        newCloseButton.addEventListener('click', function() {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        });
    }

    // Manejador para cerrar con ESC
    const escapeHandler = function(e) {
        if (e.key === 'Escape') {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);

    // Manejador para cerrar con clic fuera del modal
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    });
    // --- FIN DE CONFIGURACIÓN DE CIERRE ---
    
    // Verificar caché primero
    const cacheKey = `tecnico_${nombreTecnico}`;
    const cachedData = memoryCache.get(cacheKey);
    
    if (cachedData) {
        renderTechnicianInfo(cachedData, viewMode);
        fillEditForm(cachedData);
        return;
    }

    // Cargar los datos del técnico con manejo de errores mejorado
    fetchWithRetry(() => 
        fetch(`/api/tecnicos/nombre/${encodeURIComponent(nombreTecnico)}`)
    )
        .then(response => {
            if (!response.ok) {
                throw new Error('Técnico no encontrado');
            }
            return response.json();
        })
        .then(data => {
            if (data.tecnico) {
                const tecnico = data.tecnico;
                
                // Guardar en caché
                memoryCache.set(cacheKey, tecnico, 300000); // 5 minutos
                
                // Renderizar información
                renderTechnicianInfo(tecnico, viewMode);
                
                // Preparar el formulario de edición con los datos actuales
                fillEditForm(tecnico);
            } else {
                // Si no hay datos del técnico, mostrar mensaje de error
                viewMode.innerHTML = `
                    <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <i class="fas fa-exclamation-triangle text-yellow-400"></i>
                            </div>
                            <div class="ml-3">
                                <p class="text-sm text-yellow-700">
                                    No se encontró información de contacto para el técnico "${nombreTecnico}".
                                </p>
                            </div>
                        </div>
                    </div>
                `;
            }
        })
        .catch(error => {
            console.error('Error al obtener información del técnico:', error);
            
            // Mostrar mensaje de error mejorado
            viewMode.innerHTML = `
                <div class="bg-red-50 border-l-4 border-red-400 p-4">
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <i class="fas fa-exclamation-circle text-red-400"></i>
                        </div>
                        <div class="ml-3">
                            <p class="text-sm text-red-700">
                                Error al cargar la información de contacto: ${error.message}
                            </p>
                            <p class="text-sm text-red-600 mt-2">
                                <button class="px-3 py-1 bg-white text-red-600 border border-red-300 rounded hover:bg-red-50" onclick="showTechContactModal('${nombreTecnico}')">
                                    <i class="fas fa-sync-alt mr-1"></i> Reintentar
                                </button>
                            </p>
                        </div>
                    </div>
                </div>
            `;
        });
}

/**
 * Renderiza la información del técnico en el modal
 * @param {Object} tecnico - Datos del técnico
 * @param {HTMLElement} container - Contenedor donde renderizar
 */
function renderTechnicianInfo(tecnico, container) {
    // Generar avatar
    let avatarHtml = '';
    if (tecnico.foto && tecnico.foto.trim() !== '') {
        avatarHtml = `<img src="${tecnico.foto}" alt="${tecnico.nombre}" class="w-20 h-20 rounded-full border-2 border-white" loading="lazy">`;
    } else {
        // Generar iniciales
        const iniciales = tecnico.nombre ? tecnico.nombre.split(' ').map(n => n.charAt(0)).slice(0, 2).join('') : '';
        avatarHtml = `
            <div class="w-20 h-20 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xl">
                ${iniciales}
            </div>
        `;
    }
    
    // Determinar color de estado
    let estadoClass, estadoIcon;
    switch (tecnico.estado) {
        case 'disponible':
            estadoClass = 'bg-green-100 text-green-800';
            estadoIcon = 'bg-green-500';
            break;
        case 'ocupado':
            estadoClass = 'bg-yellow-100 text-yellow-800';
            estadoIcon = 'bg-yellow-500';
            break;
        default:
            estadoClass = 'bg-red-100 text-red-800';
            estadoIcon = 'bg-red-500';
    }
    
    // Procesar especialidades
    let especialidades = [];
    if (tecnico.especialidades) {
        if (Array.isArray(tecnico.especialidades)) {
            especialidades = tecnico.especialidades;
        } else {
            try {
                especialidades = JSON.parse(tecnico.especialidades || '[]');
            } catch (e) {
                // Si no es un formato JSON válido, intentar dividirlo por comas
                especialidades = tecnico.especialidades.split(',').map(item => item.trim());
            }
        }
    }
    
    // Mostrar información de contacto con animación de entrada
    container.innerHTML = `
        <div class="opacity-0 transform translate-y-4 transition-all duration-500" id="tech-profile">
            <div class="flex flex-col items-center mb-4">
                ${avatarHtml}
                <h4 class="font-bold text-lg mt-2">${tecnico.nombre || 'Sin nombre'}</h4>
                <p class="text-gray-600">${tecnico.cargo || 'Técnico de Soporte'}</p>
                <div class="mt-1">
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${estadoClass}">
                        <span class="w-2 h-2 mr-1 rounded-full ${estadoIcon}"></span>
                        ${tecnico.estado ? tecnico.estado.charAt(0).toUpperCase() + tecnico.estado.slice(1) : 'Desconocido'}
                    </span>
                </div>
            </div>
            
            <div class="space-y-3 mt-4">
                ${tecnico.email ? `
                    <div class="flex items-center">
                        <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-2">
                            <i class="fas fa-envelope"></i>
                        </div>
                        <div>
                            <span class="text-sm text-gray-500">Email:</span>
                            <span class="font-medium block">
                                <a href="mailto:${tecnico.email}" class="text-blue-600 hover:text-blue-800 hover:underline">${tecnico.email}</a>
                            </span>
                        </div>
                    </div>
                ` : ''}
                
                ${tecnico.telefono ? `
                    <div class="flex items-center">
                        <div class="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mr-2">
                            <i class="fas fa-phone-alt"></i>
                        </div>
                        <div>
                            <span class="text-sm text-gray-500">Teléfono:</span>
                            <span class="font-medium block">
                                <a href="tel:${tecnico.telefono.replace(/\D/g, '')}" class="text-purple-600 hover:text-purple-800 hover:underline">${tecnico.telefono}</a>
                            </span>
                        </div>
                    </div>
                ` : ''}
                
                ${tecnico.anexo ? `
                    <div class="flex items-center">
                        <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-2">
                            <i class="fas fa-phone"></i>
                        </div>
                        <div>
                            <span class="text-sm text-gray-500">Anexo:</span>
                            <span class="font-medium block">${tecnico.anexo}</span>
                        </div>
                    </div>
                ` : ''}
                
                ${tecnico.whatsapp ? `
                    <div class="flex items-center">
                        <div class="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center mr-2">
                            <i class="fab fa-whatsapp"></i>
                        </div>
                        <div>
                            <span class="text-sm text-gray-500">WhatsApp:</span>
                            <span class="font-medium block">
                                <a href="https://wa.me/${tecnico.whatsapp.replace(/\D/g, '')}" target="_blank" class="text-green-600 hover:text-green-800 hover:underline">${tecnico.whatsapp}</a>
                            </span>
                        </div>
                    </div>
                ` : ''}
                
                ${especialidades.length > 0 ? `
                    <div class="flex items-center">
                        <div class="w-8 h-8 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center mr-2">
                            <i class="fas fa-star"></i>
                        </div>
                        <div>
                            <span class="text-sm text-gray-500">Especialidades:</span>
                            <div class="font-medium flex flex-wrap gap-1 mt-1">
                                ${especialidades.map(esp => 
                                    `<span class="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs">${esp}</span>`
                                ).join('')}
                            </div>
                        </div>
                    </div>
                ` : ''}
                
                ${tecnico.area ? `
                    <div class="flex items-center">
                        <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-2">
                            <i class="fas fa-sitemap"></i>
                        </div>
                        <div>
                            <span class="text-sm text-gray-500">Área:</span>
                            <span class="font-medium block">${getAreaName(tecnico.area)}</span>
                        </div>
                    </div>
                ` : ''}
            </div>
            
            <div class="flex flex-wrap justify-center gap-2 mt-6">
                ${tecnico.email ? `
                    <a href="mailto:${tecnico.email}" class="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition action-btn">
                        <i class="fas fa-envelope mr-1"></i> Email
                    </a>
                ` : ''}
                
                ${tecnico.telefono ? `
                    <a href="tel:${tecnico.telefono.replace(/\D/g, '')}" class="inline-flex items-center px-3 py-1 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition action-btn">
                        <i class="fas fa-phone mr-1"></i> Llamar
                    </a>
                ` : ''}
                
                ${tecnico.whatsapp ? `
                    <a href="https://wa.me/${tecnico.whatsapp.replace(/\D/g, '')}" target="_blank" class="inline-flex items-center px-3 py-1 bg-green-600 text-white rounded-full hover:bg-green-700 transition action-btn">
                        <i class="fab fa-whatsapp mr-1"></i> WhatsApp
                    </a>
                ` : ''}
            </div>
        </div>
    `;
    
    // Activar animación de entrada
    setTimeout(() => {
        const techProfile = document.getElementById('tech-profile');
        if (techProfile) {
            techProfile.classList.remove('opacity-0', 'translate-y-4');
        }
    }, 50);
}

/**
 * Obtiene el nombre legible de un área
 * @param {string} areaCode - Código del área
 * @returns {string} Nombre del área
 */
function getAreaName(areaCode) {
    const areas = {
        'infraestructura': 'Infraestructura',
        'software': 'Software',
        'redes': 'Redes',
        'help_desk': 'Help Desk',
        'sistemas': 'Sistemas'
    };
    
    return areas[areaCode] || areaCode;
}

/**
 * Llena el formulario de edición con los datos del técnico
 * @param {Object} tecnico - Datos del técnico
 */
function fillEditForm(tecnico) {
    // Referencias a los elementos del formulario
    const elements = {
        id: document.getElementById('editTechId'),
        nombre: document.getElementById('editTechNombre'),
        cargo: document.getElementById('editTechCargo'),
        area: document.getElementById('editTechArea'),
        email: document.getElementById('editTechEmail'),
        telefono: document.getElementById('editTechTelefono'),
        anexo: document.getElementById('editTechAnexo'),
        whatsapp: document.getElementById('editTechWhatsapp'),
        especialidades: document.getElementById('editTechEspecialidades'),
        estado: document.getElementById('editTechEstado'),
        foto: document.getElementById('editTechFoto')
    };

    // Verificar que todos los elementos existen
    for (const key in elements) {
        if (!elements[key]) {
            console.error(`Elemento no encontrado: editTech${key.charAt(0).toUpperCase() + key.slice(1)}`);
            return;
        }
    }

    // Llenar el formulario con los datos del técnico
    elements.id.value = tecnico.id || '';
    elements.nombre.value = tecnico.nombre || '';
    elements.cargo.value = tecnico.cargo || '';
    elements.area.value = tecnico.area || 'sistemas';
    elements.email.value = tecnico.email || '';
    elements.telefono.value = tecnico.telefono || '';
    elements.anexo.value = tecnico.anexo || '';
    elements.whatsapp.value = tecnico.whatsapp || '';

    // Procesamiento de especialidades
    if (tecnico.especialidades) {
        if (Array.isArray(tecnico.especialidades)) {
            elements.especialidades.value = tecnico.especialidades.join(', ');
        } else {
            try {
                const especialidades = JSON.parse(tecnico.especialidades || '[]');
                elements.especialidades.value = especialidades.join(', ');
            } catch (e) {
                // Si no es un JSON válido, usar el valor tal cual
                elements.especialidades.value = tecnico.especialidades;
            }
        }
    } else {
        elements.especialidades.value = '';
    }

    elements.estado.value = tecnico.estado || 'disponible';
    elements.foto.value = tecnico.foto || '';
}

/**
 * Imprime los detalles del ticket
 */
function printTicketDetails() {
    // Guardar el contenido actual
    const originalContent = document.body.innerHTML;
    
    // Preparar vista de impresión
    const modalBody = document.getElementById('ticketDetailsBody');
    if (!modalBody) return;
    
    const printContent = `
        <html>
        <head>
            <title>Detalles del Ticket</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    padding: 20px;
                }
                .header {
                    text-align: center;
                    margin-bottom: 20px;
                    padding-bottom: 20px;
                    border-bottom: 1px solid #ddd;
                }
                .header img {
                    max-height: 50px;
                }
                .ticket-title {
                    font-size: 18px;
                    font-weight: bold;
                    margin: 20px 0 10px;
                }
                .ticket-status {
                    display: inline-block;
                    padding: 4px 10px;
                    border-radius: 15px;
                    font-size: 12px;
                    font-weight: bold;
                    color: white;
                    margin-bottom: 15px;
                }
                .status-new { background-color: #3b82f6; }
                .status-waiting { background-color: #f59e0b; }
                .status-inprogress { background-color: #8b5cf6; }
                .status-resolved { background-color: #10b981; }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                }
                table, th, td {
                    border: 1px solid #ddd;
                }
                th, td {
                    padding: 10px;
                    text-align: left;
                }
                th {
                    background-color: #f3f4f6;
                }
                .footer {
                    margin-top: 30px;
                    text-align: center;
                    font-size: 12px;
                    color: #666;
                }
                @media print {
                    body { 
                        margin: 0;
                        padding: 15px;
                    }
                    .no-print {
                        display: none;
                    }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <img src="https://www.gob.pe/rails/active_storage/representations/redirect/eyJfcmFpbHMiOnsiZGF0YSI6MTQ1MDAsInB1ciI6ImJsb2JfaWQifX0=--d56e8d89845af7a460ccbe0d65ed319826301586/eyJfcmFpbHMiOnsiZGF0YSI6eyJmb3JtYXQiOiJwbmciLCJyZXNpemVfdG9fbGltaXQiOltudWxsLDQ4XX0sInB1ciI6InZhcmlhdGlvbiJ9fQ==--830247c4bafe7cadca50817d8559bf1a09e3aa28/Sin%20ti%CC%81tulo-1-01%20(1).png" alt="SENASA Logo">
                <h1>Detalle del Ticket</h1>
            </div>
            
            <div class="content">
                ${modalBody.innerHTML}
            </div>
            
            <div class="footer">
                <p>Documento generado el ${new Date().toLocaleString()} - Sistema de Trazabilidad de Tickets SENASA</p>
            </div>
        </body>
        </html>
    `;
    
    // Abrir ventana de impresión
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Por favor permita las ventanas emergentes para imprimir el documento');
        return;
    }
    
    printWindow.document.open();
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Trigger print cuando se haya cargado
    printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
        printWindow.onafterprint = function() {
            printWindow.close();
        };
    };
}

/**
 * Abre el ticket en el sistema origen
 * @param {string} ticketId - ID del ticket
 */
function openTicketInSystem(ticketId) {
    // URL base del sistema SENASA
    const baseUrl = 'https://mda.senasa.gob.pe/front/ticket.php?id=';
    
    // Abrir en nueva pestaña
    window.open(`${baseUrl}${ticketId}`, '_blank');
}

/**
 * Gestiona la exportación a CSV con optimización de memoria
 */
function exportToCSV() {
    // Mostrar indicador de carga antes de comenzar el procesamiento
    const notification = showNotification({
        title: 'Exportando datos',
        message: 'Preparando archivo CSV, espere un momento...',
        type: 'info',
        duration: 0
    });
    
    // Usar setTimeout para evitar bloquear la UI
    setTimeout(() => {
        try {
            // Determinar qué datos exportar (búsqueda activa o todos)
            const results = appState.searchResults.length > 0 ? appState.searchResults : appState.allTickets;
            
            if (results.length === 0) {
                showNotification({
                    title: 'Exportación cancelada',
                    message: 'No hay datos disponibles para exportar',
                    type: 'warning',
                    duration: 5000
                });
                
                if (notification && notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                
                return;
            }
            
            // Procesar por lotes para grandes conjuntos de datos
            const processInBatches = (data, processCallback, finalCallback, batchSize = 100) => {
                let index = 0;
                
                function processNextBatch() {
                    const batch = data.slice(index, index + batchSize);
                    index += batchSize;
                    
                    if (batch.length > 0) {
                        processCallback(batch);
                        
                        // Actualizar progreso
                        const progress = Math.min(100, Math.round(index / data.length * 100));
                        if (notification) {
                            const progressElement = notification.querySelector('.notification-progress');
                            if (progressElement) {
                                progressElement.style.width = `${progress}%`;
                                progressElement.textContent = `${progress}%`;
                            }
                        }
                        
                        // Procesar siguiente lote asincrónicamente
                        setTimeout(processNextBatch, 0);
                    } else {
                        finalCallback();
                    }
                }
                
                processNextBatch();
            };
            
            // Actualizar mensaje con barra de progreso
            if (notification) {
                notification.querySelector('.mt-1').innerHTML = `
                    <div class="relative pt-1">
                        <div class="overflow-hidden h-2 mb-2 text-xs flex rounded bg-blue-200">
                            <div class="notification-progress shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500" style="width: 0%">0%</div>
                        </div>
                        <span class="text-xs text-gray-600">Procesando ${results.length} registros...</span>
                    </div>
                `;
            }
            
            // Obtener todas las columnas únicas
            const allColumns = new Set();
            
            processInBatches(
                results,
                (batch) => {
                    // Recopilar columnas
                    batch.forEach(ticket => {
                        Object.keys(ticket).forEach(key => {
                            if (key !== 'category') { // Excluir la categoría que agregamos
                                allColumns.add(key);
                            }
                        });
                    });
                },
                () => {
                    // Convertir a array y ordenar las columnas
                    const columns = Array.from(allColumns).sort();
                    
                    // Crear encabezado CSV
                    let csv = columns.map(col => `"${col}"`).join(',') + '\n';
                    
                    // Generar CSV por lotes
                    let csvChunks = [];
                    
                    processInBatches(
                        results,
                        (batch) => {
                            let chunkCsv = '';
                            
                            // Agregar filas del lote actual
                            batch.forEach(ticket => {
                                const row = columns.map(col => {
                                    const value = ticket[col] === undefined ? '' : ticket[col];
                                    return `"${String(value).replace(/"/g, '""')}"`;
                                }).join(',');
                                chunkCsv += row + '\n';
                            });
                            
                            csvChunks.push(chunkCsv);
                        },
                        () => {
                            // Unir todos los chunks
                            csv += csvChunks.join('');
                            
                            // Crear blob y descargar
                            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            
                            link.setAttribute('href', url);
                            link.setAttribute('download', 'tickets_export_' + new Date().toISOString().slice(0, 10) + '.csv');
                            link.style.visibility = 'hidden';
                            
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            
                            // Liberar memoria
                            URL.revokeObjectURL(url);
                            csvChunks = null;
                            
                            // Mostrar notificación de éxito
                            showNotification({
                                title: 'Exportación completada',
                                message: `Se han exportado ${results.length} registros exitosamente.`,
                                type: 'success',
                                duration: 5000
                            });
                            
                            // Cerrar notificación de progreso
                            if (notification && notification.parentNode) {
                                notification.parentNode.removeChild(notification);
                            }
                        }
                    );
                }
            );
        } catch (error) {
            console.error('Error en exportación:', error);
            
            showNotification({
                title: 'Error de exportación',
                message: `No se pudo completar la exportación: ${error.message}`,
                type: 'error',
                duration: 5000
            });
            
            // Cerrar notificación de progreso
            if (notification && notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }
    }, 100);
}

/**
 * Muestra una notificación en la interfaz
 * @param {Object} options - Opciones de notificación
 * @returns {HTMLElement} Elemento de notificación
 */
function showNotification(options) {
    const { title, message, type = 'info', duration = 5000, action = null } = options;
    
    // Crear contenedor para notificaciones si no existe
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'fixed bottom-4 right-4 z-50 flex flex-col-reverse items-end space-y-reverse space-y-2';
        document.body.appendChild(container);
    }
    
    // Crear notificación
    const notificationElement = document.createElement('div');
    
    // Determinar color según tipo
    let bgColor, iconClass;
    switch (type) {
        case 'success':
            bgColor = 'bg-green-50 border-green-500 text-green-800';
            iconClass = 'fas fa-check-circle text-green-500';
            break;
        case 'warning':
            bgColor = 'bg-yellow-50 border-yellow-500 text-yellow-800';
            iconClass = 'fas fa-exclamation-triangle text-yellow-500';
            break;
        case 'error':
            bgColor = 'bg-red-50 border-red-500 text-red-800';
            iconClass = 'fas fa-times-circle text-red-500';
            break;
        default: // info
            bgColor = 'bg-blue-50 border-blue-500 text-blue-800';
            iconClass = 'fas fa-info-circle text-blue-500';
    }
    
    // Configurar elemento
    notificationElement.className = `max-w-sm w-full border-l-4 rounded shadow-lg ${bgColor} p-4 mb-2 transform translate-x-full opacity-0 transition duration-300 ease-in-out`;
    
    // Construir contenido
    let actionHtml = '';
    if (action) {
        actionHtml = `
            <div class="mt-2">
                <button class="bg-white border border-gray-300 rounded px-3 py-1 text-sm font-medium hover:bg-gray-50 notification-action">
                    ${action.label}
                </button>
            </div>
        `;
    }
    
    notificationElement.innerHTML = `
        <div class="flex items-start">
            <div class="flex-shrink-0">
                <i class="${iconClass} text-lg"></i>
            </div>
            <div class="ml-3 flex-1">
                <div class="font-medium">${title}</div>
                <div class="mt-1 text-sm">${message}</div>
                ${actionHtml}
            </div>
            <button class="ml-3 flex-shrink-0 text-gray-400 hover:text-gray-600 notification-close">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    // Agregar al contenedor
    container.prepend(notificationElement);
    
    // Configurar event listeners
    const closeButton = notificationElement.querySelector('.notification-close');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            closeNotification(notificationElement);
        });
    }
    
    const actionButton = notificationElement.querySelector('.notification-action');
    if (actionButton && action) {
        actionButton.addEventListener('click', () => {
            if (typeof action.callback === 'function') {
                action.callback();
            }
            closeNotification(notificationElement);
        });
    }
    
    // Animar entrada
    requestAnimationFrame(() => {
        notificationElement.classList.remove('translate-x-full', 'opacity-0');
    });
    
    // Configurar autoclose
    if (duration > 0) {
        setTimeout(() => {
            if (notificationElement.parentNode) {
                closeNotification(notificationElement);
            }
        }, duration);
    }
    
    return notificationElement;
}

/**
 * Cierra una notificación con animación
 * @param {HTMLElement} element - Elemento de notificación
 */
function closeNotification(element) {
    // Animar salida
    element.classList.add('translate-x-full', 'opacity-0');
    
    // Eliminar después de la animación
    setTimeout(() => {
        if (element.parentNode) {
            element.parentNode.removeChild(element);
        }
    }, 300);
}
