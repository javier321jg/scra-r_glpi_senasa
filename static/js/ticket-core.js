/**
 * ticket-core.js
 * Core state management and data fetching for the SENASA Ticket Tracking System
 * 
 * This file handles:
 * - Configuration
 * - Application state management (AppState)
 * - Data fetching and processing
 * - WebSocket connections
 * - Data caching
 * - Utility functions for data manipulation
 */

// Global Configuration
const CONFIG = {
    // API Endpoints
    apiUrl: '/api/tickets/improved',
    statsUrl: '/api/tickets/stats',
    socketUrl: window.location.origin,
    
    // Timing and Intervals
    refreshInterval: 60000, // 1 minute
    retryDelay: 3000,
    updateBufferTime: 250, // 250ms buffer for updates
    idleReconnectDelay: 300000, // Reconnect after 5 minutes of inactivity
    
    // Cache Settings
    cacheExpirationTime: 1800000, // 30 minutes
    
    // Performance & Display
    maxResults: 50,
    
    // Feature Flags
    enableRealTimeUpdates: true,
    debugMode: false,
    
    // Error Handling
    maxRetries: 3,
    
    // App Version
    version: '2.1.0'
};

/**
 * Application State Manager - Manages the entire app state using Observer pattern
 */
class AppState {
    constructor() {
        // Core data
        this.allTickets = [];
        this.searchResults = [];
        this.currentSearch = {
            query: '',
            field: 'all',
            category: null
        };
        this.lastUpdate = null;
        
        // Connection state
        this.socket = null;
        this.isLoading = false;
        this.isOffline = false;
        this.connectionRetries = 0;
        
        // Observers for the reactive pattern
        this.observers = [];
        
        // Counters for ticket categories
        this.counters = {
            nuevos: 0,
            espera: 0,
            curso: 0,
            resueltos: 0
        };
        
        // Update management
        this.updateRequests = 0;
        this.lastUserActivity = Date.now();
        this.updateBuffer = [];
        this.bufferTimeout = null;
        
        // User activity tracking for managing connections
        this._setupUserActivityTracking();
        
        // Log initialization in debug mode
        if (CONFIG.debugMode) {
            console.log(`AppState initialized (v${CONFIG.version})`);
        }
    }
    
    /**
     * Subscribes an observer to receive state updates
     * @param {Object} observer - An object with an update method
     * @returns {boolean} - Success of subscription
     */
    subscribe(observer) {
        if (typeof observer.update === 'function') {
            this.observers.push(observer);
            return true;
        }
        return false;
    }
    
    /**
     * Notifies all observers about a state change
     * @param {Object} data - The data to notify observers with
     */
    notify(data) {
        this.observers.forEach(observer => observer.update(data));
    }
    
    /**
     * Updates counters for different ticket categories
     * @param {Object} newCounters - The new counter values
     */
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
    
    /**
     * Buffer ticket updates to avoid excessive UI updates
     * @param {Array} tickets - The tickets to update
     */
    bufferTicketsUpdate(tickets) {
        this.updateBuffer.push(tickets);
        
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
        }
        
        this.bufferTimeout = setTimeout(() => {
            // Process all accumulated updates
            if (this.updateBuffer.length > 0) {
                const mergedTickets = this.updateBuffer.reduce((all, current) => {
                    // Merge by unique ID (ticket_id)
                    const result = [...all];
                    current.forEach(ticket => {
                        const existingIndex = result.findIndex(t => t.ticket_id === ticket.ticket_id);
                        if (existingIndex >= 0) {
                            result[existingIndex] = ticket; // Update existing
                        } else {
                            result.push(ticket); // Add new
                        }
                    });
                    return result;
                }, []);
                
                this.updateBuffer = [];
                this._processTicketsUpdate(mergedTickets);
            }
        }, CONFIG.updateBufferTime);
    }
    
    /**
     * Process ticket updates internally
     * @param {Array} tickets - The tickets to process
     * @private
     */
    _processTicketsUpdate(tickets) {
        const oldTickets = [...this.allTickets];
        this.allTickets = tickets;
        
        // Calculate differences for optimized rendering
        const added = tickets.filter(t => !oldTickets.some(old => old.ticket_id === t.ticket_id));
        const removed = oldTickets.filter(t => !tickets.some(newT => newT.ticket_id === t.ticket_id));
        const updated = tickets.filter(t => {
            const oldVersion = oldTickets.find(old => old.ticket_id === t.ticket_id);
            return oldVersion && JSON.stringify(oldVersion) !== JSON.stringify(t);
        });
        
        // Notify observers about the ticket changes
        this.notify({
            type: 'tickets',
            data: {
                all: tickets,
                added: added,
                removed: removed,
                updated: updated
            }
        });
        
        // Update search results if there's an active search
        if (this.currentSearch.query || this.currentSearch.category) {
            this.performSearch(
                this.currentSearch.query, 
                this.currentSearch.field,
                this.currentSearch.category
            );
        }
    }
    
    /**
     * Setup user activity tracking to manage connections
     * @private
     */
    _setupUserActivityTracking() {
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        const activityHandler = () => {
            this.lastUserActivity = Date.now();
            
            // If we're offline but we have connectivity, try to reconnect
            if (this.isOffline && navigator.onLine) {
                this.checkNetworkStatus();
            }
        };
        
        events.forEach(event => {
            window.addEventListener(event, activityHandler, { passive: true });
        });
        
        // Check for inactivity every minute
        setInterval(() => {
            const inactive = Date.now() - this.lastUserActivity > CONFIG.idleReconnectDelay;
            
            // If user has been inactive for a long time and returns, refresh data
            if (inactive && CONFIG.enableRealTimeUpdates && this.socket && this.socket.connected) {
                // Only reconnect if there's recent activity after inactivity
                const justActive = Date.now() - this.lastUserActivity < 5000;
                if (justActive) {
                    if (CONFIG.debugMode) {
                        console.log('Reactivation detected after inactivity, refreshing data...');
                    }
                    this.fetchAllTickets();
                }
            }
        }, 60000);
    }
    
    /**
     * Set the loading state and notify observers
     * @param {boolean} isLoading - Whether the app is loading
     */
    setLoading(isLoading) {
        if (this.isLoading !== isLoading) {
            this.isLoading = isLoading;
            this.notify({ type: 'loading', isLoading });
        }
    }
    
    /**
     * Set the offline state and notify observers
     * @param {boolean} isOffline - Whether the app is offline
     */
    setOffline(isOffline) {
        if (this.isOffline !== isOffline) {
            this.isOffline = isOffline;
            this.notify({ type: 'connection', isOffline });
        }
    }
    
    /**
     * Perform a search on tickets
     * @param {string} query - The search query
     * @param {string} field - The field to search in
     * @param {string|null} category - Optional category filter
     * @returns {Array} - The search results
     */
    performSearch(query, field, category = null) {
        this.currentSearch = { query, field, category };
        
        // Notify search start
        this.notify({ type: 'searchStart', query, field, category });
        
        // Normalize query
        const normalizedQuery = normalizeString(query);
        
        // Filter tickets
        let results = [];
        
        // First apply category filter if specified
        let baseTickets = this.allTickets;
        if (category) {
            baseTickets = this.allTickets.filter(ticket => 
                ticket.category === category
            );
        }
        
        // Then apply search filters
        if (normalizedQuery) {
            if (field === 'all') {
                results = baseTickets.filter(ticket => {
                    return Object.entries(ticket).some(([key, value]) => {
                        if (key === 'category') return false;
                        const stringValue = String(value || '');
                        return normalizeString(stringValue).includes(normalizedQuery);
                    });
                });
            } else {
                results = baseTickets.filter(ticket => {
                    if (ticket[field] === undefined) return false;
                    const stringValue = String(ticket[field] || '');
                    return normalizeString(stringValue).includes(normalizedQuery);
                });
            }
        } else {
            // If no query but only category filter
            results = baseTickets;
        }
        
        // Store results and notify
        this.searchResults = results;
        this.notify({ type: 'searchResults', results, category });
        
        return results;
    }
    
    /**
     * Clear the current search
     */
    clearSearch() {
        this.currentSearch = { query: '', field: 'all', category: null };
        this.searchResults = [];
        this.notify({ type: 'searchCleared' });
    }
    
    /**
     * Fetch all tickets from the API with improved error handling
     */
    fetchAllTickets() {
        this.setLoading(true);
        
        // If we're offline, load from cache
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
                // Check if we got a valid data structure
                if (!data || (typeof data !== 'object')) {
                    throw new Error('Datos inválidos recibidos de la API');
                }
                
                // Save in cache for offline use
                saveCachedData(data);
                
                // Set last update timestamp
                this.lastUpdate = data.last_update || new Date().toISOString();
                this.notify({ type: 'lastUpdate', timestamp: this.lastUpdate });
                
                // Process tickets - handle both formats
                if (data.tickets && Array.isArray(data.tickets)) {
                    // New format with unified tickets array
                    this._processIncomingTickets(data);
                } else if (data.nuevos || data.en_curso || data.espera || data.resueltos) {
                    // Old format with separate categories
                    this._processIncomingTickets(data);
                } else {
                    console.error('Formato de datos desconocido:', data);
                }
                
                // Reset retry counter on success
                this.connectionRetries = 0;
            })
            .catch(error => {
                console.error('Error fetching tickets:', error);
                
                // Increment retry counter
                this.connectionRetries++;
                
                // Try to load from cache if too many failures
                if (this.connectionRetries >= CONFIG.maxRetries) {
                    this.handleOfflineData();
                }
                
                this.notify({ 
                    type: 'error', 
                    context: 'fetch', 
                    message: `Error loading tickets: ${error.message}`,
                    retryCount: this.connectionRetries
                });
            })
            .finally(() => {
                if (CONFIG.debugMode) {
                    const fetchTime = Date.now() - updateTimestamp;
                    console.log(`Fetch completed in ${fetchTime}ms`);
                }
                this.setLoading(false);
            });
    }
    
    /**
     * Handle loading data when offline
     */
    handleOfflineData() {
        try {
            const cachedData = localStorage.getItem('tickets_cache');
            if (cachedData) {
                const data = JSON.parse(cachedData);
                
                // Check if cache has expired
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
            console.error('Error loading cached data:', error);
            this.notify({ 
                type: 'error', 
                context: 'offlineData', 
                message: `Error loading cached data: ${error.message}`
            });
        } finally {
            this.setLoading(false);
        }
    }
    
    /**
     * Process incoming ticket data with support for both old and new API formats
     * @param {Object} data - The data from the API
     * @private
     */
    _processIncomingTickets(data) {
        let allTickets = [];
        
        // Handle different response formats
        if (data.tickets && Array.isArray(data.tickets)) {
            // Improved endpoint format with unified tickets array
            allTickets = data.tickets.map(t => {
                const category = t.category || detectTicketCategory(t);
                return { ...t, category };
            });
        } else {
            // Legacy format with separate categories
            const categories = {
                nuevos: 'nuevos',
                en_curso: 'curso',
                espera: 'espera',
                resueltos: 'resueltos'
            };
            
            for (const [key, category] of Object.entries(categories)) {
                if (data[key] && Array.isArray(data[key])) {
                    allTickets = [...allTickets, ...data[key].map(t => ({ ...t, category }))];
                }
            }
        }
        
        // Sort by most recent date
        allTickets.sort((a, b) => {
            let dateA = parseTicketDate(a.Ultima_modificacion) || parseTicketDate(a.Fecha_apertura);
            let dateB = parseTicketDate(b.Ultima_modificacion) || parseTicketDate(b.Fecha_apertura);
            
            if (!dateA) dateA = new Date(0);
            if (!dateB) dateB = new Date(0);
            
            return dateB.getTime() - dateA.getTime();
        });
        
        // Update tickets with change detection
        this.bufferTicketsUpdate(allTickets);
        
        // Update counters
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
    
    /**
     * Initialize WebSocket connection with improved compatibility
     * @returns {boolean} - Success of initialization
     */
    initSocketConnection() {
        try {
            // Ensure Socket.io is available
            if (typeof io !== 'function') {
                console.error('Socket.io no está disponible');
                CONFIG.enableRealTimeUpdates = false;
                return false;
            }
            
            // Initialize Socket.io connection
            this.socket = io(CONFIG.socketUrl, {
                reconnectionAttempts: 5,
                timeout: 10000,
                transports: ['websocket', 'polling']
            });
            
            // Connection established
            this.socket.on('connect', () => {
                if (CONFIG.debugMode) {
                    console.log('WebSocket connection established');
                }
                this.setOffline(false);
                this.notify({ type: 'socketConnected' });
            });
            
            // Receive ticket updates
            this.socket.on('tickets_update', (data) => {
                if (CONFIG.debugMode) {
                    console.log('Updating data from WebSocket');
                }
                
                // Verify data is valid
                if (!data || typeof data !== 'object') {
                    console.error('Datos inválidos recibidos del WebSocket');
                    return;
                }
                
                // Save in cache for offline use
                saveCachedData(data);
                
                // Update timestamp
                this.lastUpdate = data.last_update || new Date().toISOString();
                this.notify({ type: 'lastUpdate', timestamp: this.lastUpdate });
                
                // Process tickets
                this._processIncomingTickets(data);
            });
            
            // Handle disconnection
            this.socket.on('disconnect', () => {
                if (CONFIG.debugMode) {
                    console.log('WebSocket connection disconnected');
                }
                this.notify({ type: 'socketDisconnected' });
            });
            
            // Handle connection errors
            this.socket.on('connect_error', (error) => {
                console.error('Error connecting to WebSocket, falling back to polling:', error);
                this.notify({ type: 'socketError' });
                
                if (this.connectionRetries < CONFIG.maxRetries) {
                    this.connectionRetries++;
                    setTimeout(() => {
                        if (navigator.onLine) this.socket.connect();
                    }, CONFIG.retryDelay * this.connectionRetries);
                } else {
                    CONFIG.enableRealTimeUpdates = false;
                    this.setOffline(true);
                    
                    // Use interval only if we're not offline
                    if (navigator.onLine) {
                        setInterval(() => {
                            if (navigator.onLine) {
                                this.fetchAllTickets();
                            }
                        }, CONFIG.refreshInterval);
                    }
                }
            });
            
            // Manual reconnection control
            setInterval(() => {
                if (this.socket && !this.socket.connected && navigator.onLine) {
                    if (CONFIG.debugMode) {
                        console.log('Attempting scheduled reconnection...');
                    }
                    this.socket.connect();
                }
            }, CONFIG.refreshInterval);
            
            return true;
        } catch (error) {
            console.error('Error initializing Socket.io:', error);
            this.notify({ 
                type: 'error', 
                context: 'socket', 
                message: `Connection error: ${error.message}`
            });
            
            CONFIG.enableRealTimeUpdates = false;
            return false;
        }
    }
    
    /**
     * Check network status and handle online/offline states
     */
    checkNetworkStatus() {
        if (navigator.onLine) {
            this.handleOnlineStatus();
        } else {
            this.handleOfflineStatus();
        }
    }
    
    /**
     * Handle online status
     */
    handleOnlineStatus() {
        this.setOffline(false);
        
        // Try to recover data if we were offline
        this.fetchAllTickets();
        
        // Try to reconnect WebSocket if configured
        if (CONFIG.enableRealTimeUpdates && this.socket && !this.socket.connected) {
            this.socket.connect();
        }
    }
    
    /**
     * Handle offline status
     */
    handleOfflineStatus() {
        this.setOffline(true);
        
        // Load data from localStorage
        this.handleOfflineData();
    }
}

/**
 * Advanced Cache Manager with memory constraints
 */
class CacheManager {
    constructor() {
        this.store = {};
        this.memoryLimit = 50 * 1024 * 1024; // 50MB approximate limit
        this.currentSize = 0;
    }
    
    /**
     * Set a value in the cache
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - Time to live in ms, default 1 hour
     * @returns {boolean} - Success of operation
     */
    set(key, value, ttl = 3600000) {
        try {
            const serialized = JSON.stringify(value);
            const size = serialized.length * 2; // Approximate size in bytes
            
            // Check if we exceed the memory limit
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
            console.error(`Error saving to cache: ${key}`, e);
            return false;
        }
    }
    
    /**
     * Get a value from the cache
     * @param {string} key - Cache key
     * @returns {any|null} - Cached value or null if not found/expired
     */
    get(key) {
        const entry = this.store[key];
        if (!entry) return null;
        
        // Check expiration
        if (entry.expires < Date.now()) {
            this._removeEntry(key);
            return null;
        }
        
        // Update last access time
        entry.lastAccessed = Date.now();
        return entry.value;
    }
    
    /**
     * Remove an entry from the cache
     * @param {string} key - Cache key
     * @returns {boolean} - Success of operation
     * @private
     */
    _removeEntry(key) {
        if (this.store[key]) {
            this.currentSize -= this.store[key].size;
            delete this.store[key];
            return true;
        }
        return false;
    }
    
    /**
     * Evict old entries to free memory
     * @private
     */
    _evictOldEntries() {
        // First remove expired entries
        Object.keys(this.store).forEach(key => {
            if (this.store[key].expires < Date.now()) {
                this._removeEntry(key);
            }
        });
        
        // If we still need to free space, remove least recently used entries
        if (this.currentSize > this.memoryLimit * 0.9) {
            const entries = Object.keys(this.store)
                .map(key => ({ key, lastAccessed: this.store[key].lastAccessed }))
                .sort((a, b) => a.lastAccessed - b.lastAccessed);
            
            // Remove the oldest 20%
            const toRemove = Math.ceil(entries.length * 0.2);
            entries.slice(0, toRemove).forEach(entry => {
                this._removeEntry(entry.key);
            });
        }
    }
    
    /**
     * Clear the entire cache
     */
    clear() {
        this.store = {};
        this.currentSize = 0;
    }
}

// Create global instance of app state and cache
const appState = new AppState();
const memoryCache = new CacheManager();

/**
 * ===============================================
 * UTILITY FUNCTIONS
 * ===============================================
 */

/**
 * Fetch with retry capability
 * @param {Function} fetchFn - Function that returns a fetch promise
 * @param {number} retries - Number of retries
 * @returns {Promise} - Fetch promise with retry
 */
function fetchWithRetry(fetchFn, retries = CONFIG.maxRetries) {
    return new Promise(async (resolve, reject) => {
        let lastError;
        
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const result = await fetchFn();
                return resolve(result);
            } catch (error) {
                if (CONFIG.debugMode) {
                    console.log(`Retrying request: ${retries - attempt - 1} attempts remaining`);
                }
                lastError = error;
                
                // Apply exponential delay between retries
                const delay = CONFIG.retryDelay * Math.pow(2, attempt);
                await new Promise(r => setTimeout(r, delay));
            }
        }
        
        reject(lastError || new Error('Request error after multiple retries'));
    });
}

/**
 * Normalize a string for case-insensitive comparison
 * @param {string} str - String to normalize
 * @returns {string} - Normalized string
 */
function normalizeString(str) {
    if (!str) return '';
    return String(str).toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Parse a ticket date
 * @param {string} dateStr - Date string to parse
 * @returns {Date|null} - Parsed date or null
 */
function parseTicketDate(dateStr) {
    if (!dateStr) return null;
    
    try {
        // Try various date formats
        const formats = [
            'YYYY-MM-DD HH:mm:ss',
            'YYYY-MM-DD HH:mm',
            'DD/MM/YYYY HH:mm:ss',
            'DD/MM/YYYY HH:mm',
            'DD-MM-YYYY HH:mm:ss',
            'DD-MM-YYYY HH:mm'
        ];
        
        let parsedDate = null;
        
        for (const format of formats) {
            parsedDate = moment(dateStr, format, true);
            if (parsedDate.isValid()) break;
        }
        
        // If can't parse with known formats, try automatic parse
        if (!parsedDate || !parsedDate.isValid()) {
            parsedDate = moment(dateStr);
        }
        
        // If still not valid, return null
        if (!parsedDate || !parsedDate.isValid()) return null;
        
        // Fix future dates (if year is greater than current + 1)
        const currentYear = moment().year();
        if (parsedDate.year() > currentYear + 1) {
            parsedDate.year(currentYear);
        }
        
        return parsedDate.toDate();
    } catch (e) {
        console.error('Error parsing date:', e);
        return null;
    }
}

/**
 * Format a date string for display
 * @param {string} dateStr - Date string to format
 * @returns {string} - Formatted date
 */
function formatFecha(dateStr) {
    if (!dateStr) return 'No disponible';
    
    const parsedDate = parseTicketDate(dateStr);
    if (!parsedDate) return dateStr;
    
    return moment(parsedDate).format('DD-MM-YYYY HH:mm');
}

/**
 * Format a date as relative time
 * @param {string} dateStr - Date string
 * @returns {string} - Relative time
 */
function formatTimeAgo(dateStr) {
    if (!dateStr) return 'No disponible';
    
    const parsedDate = parseTicketDate(dateStr);
    if (!parsedDate) return dateStr;
    
    return moment(parsedDate).fromNow();
}

/**
 * Detect ticket category from its state
 * @param {Object} ticket - Ticket object
 * @returns {string} - Category
 */
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
    
    return 'nuevos'; // Default category
}

/**
 * Save data to cache for offline use
 * @param {Object} data - Data to cache
 */
function saveCachedData(data) {
    try {
        const serializedData = JSON.stringify({
            ...data,
            cacheSavedAt: new Date().toISOString()
        });
        localStorage.setItem('tickets_cache', serializedData);
        
        // Also save a backup for important updates
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
        console.error('Error saving data to cache:', error);
        
        // If it's a space error, try to clean up
        if (error.name === 'QuotaExceededError') {
            try {
                // Remove non-critical data
                const keysToPreserve = ['tickets_cache', 'tickets_cache_backup'];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!keysToPreserve.includes(key)) {
                        localStorage.removeItem(key);
                    }
                }
                
                // Try to save again with less data
                const trimmedData = { ...data };
                if (trimmedData.resueltos && trimmedData.resueltos.length > 50) {
                    trimmedData.resueltos = trimmedData.resueltos.slice(0, 50);
                }
                localStorage.setItem('tickets_cache', JSON.stringify(trimmedData));
            } catch (e) {
                console.error('Error trying to free space:', e);
            }
        }
    }
}

/**
 * Get the area name in readable format
 * @param {string} areaCode - Area code
 * @returns {string} - Area name
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
 * Open a ticket in the system (adapted for the SENASA system)
 * @param {string} ticketId - The ticket ID to open
 */
function openTicketInSystem(ticketId) {
    if (!ticketId) return;
    
    // Base URL of SENASA system
    const baseUrl = 'https://mda.senasa.gob.pe/front/ticket.form.php?id=';
    
    // Open in new tab
    window.open(`${baseUrl}${ticketId}`, '_blank');
}

/**
 * Show technician contact modal (global function)
 * @param {string} nombreTecnico - Name of the technician to show
 */
function showTechContactModal(nombreTecnico) {
    if (!nombreTecnico) return;
    
    // Get modal elements
    const modal = document.getElementById('techContactModal');
    const modalTitle = document.getElementById('techContactModalTitle');
    const viewMode = document.getElementById('techContactViewMode');
    
    if (!modal || !modalTitle || !viewMode) {
        console.error("Error: Elementos del modal de técnico no encontrados");
        return;
    }
    
    // Show modal
    modal.classList.add('open');
    
    // Update title
    modalTitle.textContent = `Contacto: ${nombreTecnico}`;
    
    // Show loading indicator
    viewMode.innerHTML = `
        <div class="flex justify-center my-4">
            <div class="loading-spinner"></div>
        </div>
        <p class="text-center text-gray-500">Cargando información del técnico...</p>
    `;
    
    // Get technician data from API
    fetch(`/api/tecnicos/nombre/${encodeURIComponent(nombreTecnico)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Técnico no encontrado');
            }
            return response.json();
        })
        .then(data => {
            if (data.tecnico) {
                // Render the technician info
                renderTechnicianInfo(data.tecnico, viewMode);
                
                // Also prepare the edit form with this data
                fillEditForm(data.tecnico);
            } else {
                viewMode.innerHTML = `
                    <div class="bg-yellow-50 dark:bg-yellow-900 border-l-4 border-yellow-400 p-4">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <i class="fas fa-exclamation-triangle text-yellow-400"></i>
                            </div>
                            <div class="ml-3">
                                <p class="text-sm text-yellow-700 dark:text-yellow-200">
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
            viewMode.innerHTML = `
                <div class="bg-red-50 dark:bg-red-900 border-l-4 border-red-400 p-4">
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <i class="fas fa-exclamation-circle text-red-400"></i>
                        </div>
                        <div class="ml-3">
                            <p class="text-sm text-red-700 dark:text-red-200">
                                Error al cargar la información de contacto: ${error.message}
                            </p>
                            <p class="text-sm text-red-600 dark:text-red-300 mt-2">
                                <button class="px-3 py-1 bg-white dark:bg-gray-700 text-red-600 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-800" onclick="showTechContactModal('${nombreTecnico}')">
                                    <i class="fas fa-sync-alt mr-1"></i> Reintentar
                                </button>
                            </p>
                        </div>
                    </div>
                </div>
            `;
        });
}

// Export functions to global scope for legacy compatibility
window.appState = appState;
window.memoryCache = memoryCache;
window.formatFecha = formatFecha;
window.formatTimeAgo = formatTimeAgo;
window.detectTicketCategory = detectTicketCategory;
window.parseTicketDate = parseTicketDate;
window.normalizeString = normalizeString;
window.getAreaName = getAreaName;
window.openTicketInSystem = openTicketInSystem;
window.showTechContactModal = showTechContactModal;