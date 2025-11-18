/**
 * robust-cache.js
 * Sistema de caché de tickets avanzado para el Sistema de Trazabilidad de SENASA
 * Este sistema garantiza que los datos permanezcan consistentes entre actualizaciones
 * y proporciona un fallback cuando la API o el scraping fallan
 * 
 * VERSIÓN MEJORADA: Soporte para recargas de página (F5)
 */

class RobustCacheSystem {
    constructor(storageKey = 'senasa_tickets_cache') {
        this.storageKey = storageKey;
        this.memoryCache = {
            tickets: {},        // Organizado por ID para búsqueda rápida
            categories: {       // Mapeo de tickets por categoría
                nuevos: new Set(),
                espera: new Set(),
                curso: new Set(),
                resueltos: new Set()
            },
            counters: {         // Contadores actuales
                nuevos: 0,
                espera: 0, 
                curso: 0,
                resueltos: 0
            },
            lastUpdate: null,   // Última actualización exitosa
            activeVersions: {}, // Control de versiones por ticket ID
            ticketList: [],     // Lista completa de tickets para búsqueda rápida
        };
        
        // Intentar usar datos precargados para acelerar el inicio
        if (window.SENASA_PRELOADED_DATA) {
            this._processPreloadedData(window.SENASA_PRELOADED_DATA);
            console.log('Datos precargados procesados en caché');
        } else {
            // Carga inicial desde localStorage si no hay datos precargados
            this.loadFromStorage();
        }
        
        // Automatizar guardado periódico
        setInterval(() => this.saveToStorage(), 15000); // Cada 15 segundos
        
        // Suscribirse a eventos de visibilidad para asegurar datos actualizados
        if (typeof document !== 'undefined' && document.addEventListener) {
            document.addEventListener('visibilitychange', this._handleVisibilityChange.bind(this));
        }
        
        // Agregar soporte para recargas de página
        if (typeof window !== 'undefined') {
            // Guardar caché antes de descargar página para asegurar datos actualizados
            window.addEventListener('beforeunload', () => this.saveToStorage());
        }
    }
    
    /**
     * Maneja cambios de visibilidad de la página
     * @private
     */
    _handleVisibilityChange() {
        if (document.visibilityState === 'visible') {
            // Recién se hizo visible la página - validar caché
            this._validateCache();
        } else if (document.visibilityState === 'hidden') {
            // La página está oculta - guardar caché para preservar datos
            this.saveToStorage();
        }
    }
    
    /**
     * Valida la integridad del caché y reconstruye si es necesario
     * @private
     */
    _validateCache() {
        // Verificar si hay inconsistencias en el caché
        let hasInconsistencies = false;
        
        // 1. Verificar que todos los IDs en categorías existan en tickets
        for (const category in this.memoryCache.categories) {
            for (const ticketId of this.memoryCache.categories[category]) {
                if (!this.memoryCache.tickets[ticketId]) {
                    hasInconsistencies = true;
                    break;
                }
            }
            if (hasInconsistencies) break;
        }
        
        // 2. Verificar que los contadores coincidan con el número de tickets
        if (!hasInconsistencies) {
            for (const category in this.memoryCache.counters) {
                const expectedCount = this.memoryCache.categories[category].size;
                if (this.memoryCache.counters[category] !== expectedCount) {
                    hasInconsistencies = true;
                    break;
                }
            }
        }
        
        // Si hay inconsistencias, reconstruir caché
        if (hasInconsistencies) {
            console.warn('Inconsistencias detectadas en el caché, reconstruyendo');
            this.rebuildCategoryMaps();
        }
    }
    
    /**
     * Procesa datos precargados (optimización para inicio)
     * @param {Object} preloadedData - Datos precargados desde localStorage
     * @private
     */
    _processPreloadedData(preloadedData) {
        try {
            // Convertir datos precargados al formato esperado por el caché
            if (preloadedData && preloadedData.last_update) {
                this.memoryCache.lastUpdate = preloadedData.last_update;
                
                // Procesar categorías de tickets
                const categoryMap = {
                    'nuevos': 'nuevos',
                    'en_curso': 'curso',
                    'espera': 'espera',
                    'resueltos': 'resueltos'
                };
                
                // Para cada categoría en los datos precargados
                for (const sourceCategory in categoryMap) {
                    const targetCategory = categoryMap[sourceCategory];
                    
                    if (preloadedData[sourceCategory] && Array.isArray(preloadedData[sourceCategory])) {
                        // Procesar tickets de esta categoría
                        preloadedData[sourceCategory].forEach(ticket => {
                            const ticketId = ticket.ticket_id || ticket.ID;
                            if (!ticketId) return; // Ignorar tickets sin ID
                            
                            // Asignar categoría
                            ticket.category = targetCategory;
                            ticket._lastUpdated = preloadedData.last_update;
                            
                            // Guardar en caché
                            this.memoryCache.tickets[ticketId] = ticket;
                            
                            // Actualizar versión activa
                            this.memoryCache.activeVersions[ticketId] = 1;
                        });
                    }
                }
                
                // Reconstruir mapas de categorías y contadores
                this.rebuildCategoryMaps();
            }
        } catch (error) {
            console.error('Error procesando datos precargados:', error);
            // Si hay error, intentar cargar desde localStorage como respaldo
            this.loadFromStorage();
        }
    }
    
    /**
     * Carga el caché desde localStorage
     */
    loadFromStorage() {
        try {
            const storedData = localStorage.getItem(this.storageKey);
            if (storedData) {
                const parsedData = JSON.parse(storedData);
                
                // Validación básica antes de cargar
                if (parsedData && 
                    parsedData.tickets && 
                    parsedData.lastUpdate) {
                    
                    // Reconstruir el caché
                    this.memoryCache.tickets = parsedData.tickets;
                    this.memoryCache.lastUpdate = parsedData.lastUpdate;
                    
                    // Reconstruir las categorías
                    this.rebuildCategoryMaps();
                    
                    console.log(`Caché cargado desde localStorage: ${Object.keys(this.memoryCache.tickets).length} tickets`);
                } else {
                    console.warn('Datos guardados inválidos o incompletos en localStorage');
                }
            } else {
                console.log('No se encontraron datos en localStorage');
            }
        } catch (error) {
            console.error('Error al cargar caché:', error);
            // Si hay error al cargar, inicializar un caché vacío
            this.memoryCache = {
                tickets: {},
                categories: {
                    nuevos: new Set(),
                    espera: new Set(),
                    curso: new Set(),
                    resueltos: new Set()
                },
                counters: {
                    nuevos: 0,
                    espera: 0,
                    curso: 0,
                    resueltos: 0
                },
                lastUpdate: null,
                activeVersions: {},
                ticketList: []
            };
        }
    }
    
    /**
     * Guarda el caché en localStorage
     */
    saveToStorage() {
        try {
            if (!this.memoryCache.lastUpdate) {
                // No guardar si no hay datos válidos
                return;
            }
            
            // Preparar datos para almacenamiento
            const dataToStore = {
                tickets: this.memoryCache.tickets,
                lastUpdate: this.memoryCache.lastUpdate,
                counters: this.memoryCache.counters
            };
            
            localStorage.setItem(this.storageKey, JSON.stringify(dataToStore));
            
            // También guardar en el formato esperado por la aplicación original
            // para hacerlo compatible con el sistema de precarga
            const compatibilityData = this.getFormattedDataForUI();
            localStorage.setItem('senasa_tickets_cache', JSON.stringify(compatibilityData));
        } catch (error) {
            console.error('Error al guardar caché:', error);
            
            // Si el error es por límite de almacenamiento, purgar datos antiguos
            if (error.name === 'QuotaExceededError') {
                this.purgeOldTickets();
                // Intentar guardar de nuevo con caché reducido
                this.saveToStorage();
            }
        }
    }
    
    /**
     * Reconstruye las estructuras de categoría y contadores
     */
    rebuildCategoryMaps() {
        // Reiniciar todas las categorías
        for (const category in this.memoryCache.categories) {
            this.memoryCache.categories[category] = new Set();
        }
        
        // Reiniciar contadores
        for (const category in this.memoryCache.counters) {
            this.memoryCache.counters[category] = 0;
        }
        
        // Reconstruir lista completa de tickets
        this.memoryCache.ticketList = [];
        
        // Procesar todos los tickets
        for (const ticketId in this.memoryCache.tickets) {
            const ticket = this.memoryCache.tickets[ticketId];
            
            // Categorizar y contar
            if (ticket.category) {
                if (this.memoryCache.categories[ticket.category]) {
                    this.memoryCache.categories[ticket.category].add(ticketId);
                    this.memoryCache.counters[ticket.category]++;
                }
            }
            
            // Añadir a la lista principal
            this.memoryCache.ticketList.push(ticket);
        }
        
        // Ordenar por fecha de actualización (más reciente primero)
        this.memoryCache.ticketList.sort((a, b) => {
            const dateA = this.parseTicketDate(a.Ultima_modificacion) || 
                         this.parseTicketDate(a.Fecha_apertura) || new Date(0);
            const dateB = this.parseTicketDate(b.Ultima_modificacion) || 
                         this.parseTicketDate(b.Fecha_apertura) || new Date(0);
            return dateB - dateA;
        });
    }
    
    /**
     * Analiza una fecha de ticket
     */
    parseTicketDate(dateStr) {
        if (!dateStr) return null;
        
        try {
            // Si tenemos Moment.js disponible
            if (typeof moment !== 'undefined') {
                // Intentar varios formatos conocidos
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
                
                // Si no es válido con formatos conocidos, intentar automático
                if (!parsedDate || !parsedDate.isValid()) {
                    parsedDate = moment(dateStr);
                }
                
                // Si aún no es válido, retornar null
                if (!parsedDate || !parsedDate.isValid()) return null;
                
                return parsedDate.toDate();
            } else {
                // Fallback a Date estándar si no hay Moment
                return new Date(dateStr);
            }
        } catch (e) {
            console.error('Error parsing date:', e);
            return null;
        }
    }
    
    /**
     * Elimina los tickets más antiguos para reducir el tamaño del caché
     */
    purgeOldTickets() {
        // Ordenar tickets por fecha
        const ticketsArray = Object.values(this.memoryCache.tickets);
        ticketsArray.sort((a, b) => {
            const dateA = this.parseTicketDate(a.Ultima_modificacion) || 
                         this.parseTicketDate(a.Fecha_apertura) || new Date(0);
            const dateB = this.parseTicketDate(b.Ultima_modificacion) || 
                         this.parseTicketDate(b.Fecha_apertura) || new Date(0);
            return dateA - dateB; // Más antiguos primero
        });
        
        // Mantener solo el 50% más reciente
        const keepCount = Math.floor(ticketsArray.length / 2);
        const ticketsToRemove = ticketsArray.slice(0, ticketsArray.length - keepCount);
        
        // Eliminar tickets antiguos
        ticketsToRemove.forEach(ticket => {
            const ticketId = ticket.ticket_id || ticket.ID;
            delete this.memoryCache.tickets[ticketId];
        });
        
        // Reconstruir categorías
        this.rebuildCategoryMaps();
        
        console.log(`Purga de caché: se eliminaron ${ticketsToRemove.length} tickets antiguos`);
    }
    
    /**
     * Actualiza el caché con nuevos datos
     * Esta función es clave para mantener consistencia
     */
    updateCache(newData) {
        if (!newData) return false;
        
        let hasChanges = false;
        const now = new Date();
        
        // Caso 1: Datos completos desde el backend
        if (newData.nuevos || newData.en_curso || newData.espera || newData.resueltos) {
            // Mapeamos la estructura de respuesta del backend
            const categoryMap = {
                'nuevos': 'nuevos',
                'en_curso': 'curso', 
                'espera': 'espera',
                'resueltos': 'resueltos'
            };
            
            // Para cada categoría en la respuesta
            for (const backendCategory in categoryMap) {
                if (newData[backendCategory] && Array.isArray(newData[backendCategory])) {
                    const category = categoryMap[backendCategory];
                    
                    // Procesar tickets de esta categoría
                    newData[backendCategory].forEach(ticket => {
                        const ticketId = ticket.ticket_id || ticket.ID;
                        if (!ticketId) return; // Ignorar tickets sin ID
                        
                        // Asignar categoría y aplicar timestamp
                        ticket.category = category;
                        ticket._lastUpdated = now.toISOString();
                        
                        // Verificar si es un ticket nuevo o actualizado
                        if (!this.memoryCache.tickets[ticketId]) {
                            hasChanges = true;
                        } else {
                            // Verificar si hay cambios comparando campos clave
                            const oldTicket = this.memoryCache.tickets[ticketId];
                            if (oldTicket.category !== category || 
                                oldTicket.Estado !== ticket.Estado ||
                                oldTicket.Asignado_a !== ticket.Asignado_a) {
                                hasChanges = true;
                            }
                        }
                        
                        // Actualizar en caché
                        this.memoryCache.tickets[ticketId] = ticket;
                        
                        // Actualizar versión activa
                        this.memoryCache.activeVersions[ticketId] = (this.memoryCache.activeVersions[ticketId] || 0) + 1;
                    });
                }
            }
        }
        // Caso 2: Lista plana de tickets
        else if (newData.tickets && Array.isArray(newData.tickets)) {
            newData.tickets.forEach(ticket => {
                const ticketId = ticket.ticket_id || ticket.ID;
                if (!ticketId) return; // Ignorar tickets sin ID
                
                // Asegurarnos que tiene categoría
                if (!ticket.category) {
                    ticket.category = this.detectTicketCategory(ticket);
                }
                
                ticket._lastUpdated = now.toISOString();
                
                // Verificar si es un ticket nuevo o actualizado
                if (!this.memoryCache.tickets[ticketId]) {
                    hasChanges = true;
                } else {
                    // Verificar si hay cambios comparando campos clave
                    const oldTicket = this.memoryCache.tickets[ticketId];
                    if (oldTicket.category !== ticket.category || 
                        oldTicket.Estado !== ticket.Estado ||
                        oldTicket.Asignado_a !== ticket.Asignado_a) {
                        hasChanges = true;
                    }
                }
                
                // Actualizar en caché
                this.memoryCache.tickets[ticketId] = ticket;
                
                // Actualizar versión activa
                this.memoryCache.activeVersions[ticketId] = (this.memoryCache.activeVersions[ticketId] || 0) + 1;
            });
        }
        // Caso 3: Actualización individual de ticket
        else if (newData.ticket_id || newData.ID) {
            const ticketId = newData.ticket_id || newData.ID;
            
            // Asegurarnos que tiene categoría
            if (!newData.category) {
                newData.category = this.detectTicketCategory(newData);
            }
            
            newData._lastUpdated = now.toISOString();
            
            // Verificar si es un ticket nuevo o actualizado
            if (!this.memoryCache.tickets[ticketId]) {
                hasChanges = true;
            } else {
                // Verificar si hay cambios comparando campos clave
                const oldTicket = this.memoryCache.tickets[ticketId];
                if (oldTicket.category !== newData.category || 
                    oldTicket.Estado !== newData.Estado ||
                    oldTicket.Asignado_a !== newData.Asignado_a) {
                    hasChanges = true;
                }
            }
            
            // Actualizar en caché
            this.memoryCache.tickets[ticketId] = newData;
            
            // Actualizar versión activa
            this.memoryCache.activeVersions[ticketId] = (this.memoryCache.activeVersions[ticketId] || 0) + 1;
        }
        
        // Si last_update está definido en newData, siempre actualízalo
        if (newData.last_update) {
            this.memoryCache.lastUpdate = newData.last_update;
            hasChanges = true;
        }
        
        if (hasChanges) {
            // Actualizar timestamp si no se actualizó antes
            if (!this.memoryCache.lastUpdate) {
                this.memoryCache.lastUpdate = now.toISOString();
            }
            
            // Reconstruir las categorías
            this.rebuildCategoryMaps();
            
            // Guardar en localStorage
            this.saveToStorage();
        }
        
        return hasChanges;
    }
    
    /**
     * Detecta la categoría de un ticket a partir de su estado
     */
    detectTicketCategory(ticket) {
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
        
        return 'nuevos'; // Categoría por defecto
    }
    
    /**
     * Obtiene todos los tickets del caché
     */
    getAllTickets() {
        return [...this.memoryCache.ticketList];
    }
    
    /**
     * Obtiene tickets de una categoría específica
     */
    getTicketsByCategory(category) {
        if (!this.memoryCache.categories[category]) {
            return [];
        }
        
        // Convertir conjunto de IDs a array de tickets
        return Array.from(this.memoryCache.categories[category])
            .map(id => this.memoryCache.tickets[id])
            .filter(Boolean); // Eliminar valores null/undefined
    }
    
    /**
     * Obtiene un ticket específico por ID
     */
    getTicketById(ticketId) {
        return this.memoryCache.tickets[ticketId] || null;
    }
    
    /**
     * Obtiene los conteos actuales por categoría
     */
    getCounters() {
        return {...this.memoryCache.counters};
    }
    
    /**
     * Obtiene la fecha de última actualización
     */
    getLastUpdate() {
        return this.memoryCache.lastUpdate;
    }
    
    /**
     * Busca tickets por texto en diferentes campos
     */
    searchTickets(query, fields = null) {
        if (!query) return this.getAllTickets();
        
        const normalizedQuery = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        return this.memoryCache.ticketList.filter(ticket => {
            // Si se especifican campos, buscar solo en esos campos
            if (fields && fields.length > 0) {
                return fields.some(field => {
                    const value = ticket[field];
                    if (!value) return false;
                    
                    const normalizedValue = String(value).toLowerCase()
                        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    
                    return normalizedValue.includes(normalizedQuery);
                });
            }
            
            // Si no se especifican campos, buscar en todos los campos de texto
            return Object.entries(ticket).some(([key, value]) => {
                // Ignorar campos no relevantes para búsqueda
                if (key === "category" || key === "_lastUpdated" || 
                    key === "version" || !value) {
                    return false;
                }
                
                const normalizedValue = String(value).toLowerCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                
                return normalizedValue.includes(normalizedQuery);
            });
        });
    }
    
    /**
     * Obtiene un formato consistente para la UI
     */
    getFormattedDataForUI() {
        return {
            nuevos: this.getTicketsByCategory('nuevos'),
            en_curso: this.getTicketsByCategory('curso'),
            espera: this.getTicketsByCategory('espera'),
            resueltos: this.getTicketsByCategory('resueltos'),
            last_update: this.getLastUpdate()
        };
    }
    
    /**
     * Verifica si el caché tiene datos válidos
     */
    hasValidData() {
        return this.memoryCache.lastUpdate && Object.keys(this.memoryCache.tickets).length > 0;
    }
    
    /**
     * Reinicia el caché a un estado vacío
     */
    clearCache() {
        this.memoryCache = {
            tickets: {},
            categories: {
                nuevos: new Set(),
                espera: new Set(),
                curso: new Set(),
                resueltos: new Set()
            },
            counters: {
                nuevos: 0,
                espera: 0, 
                curso: 0,
                resueltos: 0
            },
            lastUpdate: null,
            activeVersions: {},
            ticketList: []
        };
        
        try {
            localStorage.removeItem(this.storageKey);
        } catch (e) {
            console.error('Error al limpiar caché de localStorage:', e);
        }
    }
}

// Crear instancia global del caché
// Si ya existe una instancia del caché (por ejemplo, por precarga), usarla
window.robustCache = window.robustCache || new RobustCacheSystem();

// Exponer para uso global
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RobustCacheSystem,
        robustCache: window.robustCache
    };
}