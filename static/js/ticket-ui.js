/**
 * ticket-ui.js
 * User interface controller and DOM manipulation for the SENASA Ticket Tracking System
 * 
 * This file handles:
 * - UI rendering and DOM updates
 * - Event handling
 * - Animations and transitions
 * - Modals and notifications
 * - User interactions
 */

/**
 * UI Controller - Handles all UI-related functionality
 */
class UIController {
    constructor(appState) {
        this.appState = appState;
        
        // Cache of frequently accessed DOM elements
        this.elements = {};
        
        // UI state tracking
        this.uiState = {
            scrollPosition: 0,
            activeTab: 'all',
            selectedTicketId: null,
            lastRenderedQuery: '',
            renderedTickets: new Set(), // Tickets currently in DOM
            updatingTickets: new Set(), // Tickets being updated
            animations: {}, // Animation states
            isDarkMode: window.matchMedia('(prefers-color-scheme: dark)').matches
        };
        
        // Register observer for state updates from appState
        this.appState.subscribe({
            update: (data) => this.handleStateUpdate(data)
        });
    }
    
    /**
     * Initialize the UI Controller
     */
    init() {
        // Cache DOM elements for better performance
        this._cacheElements();
        
        // Set up event listeners
        this._setupEventListeners();
        
        // Set up connection handling
        this._setupConnectionHandling();
        
        // Set up animations
        this._setupAnimations();
        
        // Initialize notification system
        this._initNotifications();
        
        // Set up theme detector (light/dark mode)
        this._setupThemeDetector();
        
        if (CONFIG.debugMode) {
            console.log('UIController initialized');
        }
    }
    
    /**
     * Cache frequently accessed DOM elements
     * @private
     */
    _cacheElements() {
        // Main interface elements
        const elementsToCache = [
            'searchForm', 'searchQuery', 'searchField', 'clearSearch', 
            'searchStatus', 'searchResults', 'totalResults', 'loading', 'emptyState',
            'connectionStatus', 'lastUpdate', 'ticketDetailsModal', 'totalTickets',
            'counter-nuevos', 'counter-espera', 'counter-curso', 'counter-resueltos',
            'nuevosCard', 'esperaCard', 'cursoCard', 'resueltosCard',
            'closeModal', 'ticketDetailsBody', 'techContactModal', 'closeTechModal',
            'toggleEditMode', 'techContactViewMode', 'techContactEditMode',
            'viewModeButtons', 'editModeButtons'
        ];
        
        elementsToCache.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                this.elements[id] = element;
            } else if (CONFIG.debugMode) {
                console.warn(`Element not found: ${id}`);
            }
        });
        
        if (CONFIG.debugMode) {
            console.log('DOM elements cached');
        }
    }
    
    /**
     * Set up event listeners for user interactions
     * @private
     */
    _setupEventListeners() {
        // Search form
        if (this.elements.searchForm) {
            this.elements.searchForm.addEventListener('submit', (e) => this.handleSearch(e));
        }
        
        // Clear search button
        if (this.elements.clearSearch) {
            this.elements.clearSearch.addEventListener('click', () => this.handleClearSearch());
        }
        
        // Search input for quick search
        if (this.elements.searchQuery) {
            this.elements.searchQuery.addEventListener('input', () => this.handleQuickSearch());
        }
        
        // Set up category filter cards
        this._setupStatCards();
        
        // Save scroll position before updates
        window.addEventListener('scroll', () => this.saveScrollPosition(), { passive: true });
        
        // Add global event delegation for ticket and action buttons
        document.addEventListener('click', (e) => this.handleGlobalClick(e));
        
        // Set up modal close buttons
        this._setupModalEvents();
        
        if (CONFIG.debugMode) {
            console.log('Event listeners configured');
        }
    }
    
    /**
     * Set up modal event listeners
     * @private
     */
    _setupModalEvents() {
        // Ticket details modal
        if (this.elements.closeModal) {
            this.elements.closeModal.addEventListener('click', () => {
                if (this.elements.ticketDetailsModal) {
                    this.elements.ticketDetailsModal.classList.remove('open');
                }
            });
        }
        
        // Tech contact modal
        if (this.elements.closeTechModal) {
            this.elements.closeTechModal.addEventListener('click', () => {
                if (this.elements.techContactModal) {
                    this.elements.techContactModal.classList.remove('open');
                }
            });
        }
        
        // Modal backdrop click close
        const modals = document.querySelectorAll('.modal-backdrop');
        modals.forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('open');
                }
            });
        });
        
        // Toggle edit mode button
        if (this.elements.toggleEditMode) {
            this.elements.toggleEditMode.addEventListener('click', () => this.toggleTechEditMode());
        }
        
        // Edit/View mode buttons
        document.getElementById('cancelEditButton')?.addEventListener('click', () => this.toggleTechEditMode());
        document.getElementById('saveEditButton')?.addEventListener('click', () => this.saveTechEditForm());
        document.getElementById('closeTechModalBtn')?.addEventListener('click', () => {
            if (this.elements.techContactModal) {
                this.elements.techContactModal.classList.remove('open');
            }
        });
    }
    
    /**
     * Set up the status card click handlers
     * @private
     */
    _setupStatCards() {
        const statCards = {
            'nuevosCard': 'nuevos',
            'esperaCard': 'espera',
            'cursoCard': 'curso',
            'resueltosCard': 'resueltos'
        };
        
        // Set up click events for stat cards
        Object.entries(statCards).forEach(([elementId, category]) => {
            const element = this.elements[elementId];
            if (element) {
                element.addEventListener('click', () => this.filterByCategory(category));
            }
        });
    }
    
    /**
     * Set up connection handling
     * @private
     */
    _setupConnectionHandling() {
        // Listen for connection events
        window.addEventListener('online', () => {
            this.appState.handleOnlineStatus();
        });
        
        window.addEventListener('offline', () => {
            this.appState.handleOfflineStatus();
        });
    }
    
    /**
     * Set up global animations
     * @private
     */
    _setupAnimations() {
        // Set animation duration CSS variable based on config
        document.documentElement.style.setProperty('--transition-normal', '300ms');
    }
    
    /**
     * Initialize notification system
     * @private
     */
    _initNotifications() {
        // Create notification container if it doesn't exist
        let notificationContainer = document.getElementById('notification-container');
        if (!notificationContainer) {
            notificationContainer = document.createElement('div');
            notificationContainer.id = 'notification-container';
            notificationContainer.className = 'fixed bottom-4 right-4 z-50 flex flex-col-reverse items-end gap-2';
            document.body.appendChild(notificationContainer);
        }
    }
    
    /**
     * Set up theme detector for dark/light mode
     * @private
     */
    _setupThemeDetector() {
        // Check for saved preference
        const savedTheme = localStorage.getItem('theme');
        
        if (savedTheme === 'dark') {
            this.uiState.isDarkMode = true;
            document.documentElement.classList.add('dark-mode');
            document.documentElement.classList.remove('light-mode');
        } else if (savedTheme === 'light') {
            this.uiState.isDarkMode = false;
            document.documentElement.classList.add('light-mode');
            document.documentElement.classList.remove('dark-mode');
        } else {
            // Use system preference if no saved preference
            this.uiState.isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
            
            // Listen for changes
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
                this.uiState.isDarkMode = e.matches;
                this._applyTheme();
            });
        }
        
        // Apply initial theme
        this._applyTheme();
        
        // Set up theme toggle button
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                this.uiState.isDarkMode = !this.uiState.isDarkMode;
                this._applyTheme();
                localStorage.setItem('theme', this.uiState.isDarkMode ? 'dark' : 'light');
            });
            
            // Update icon based on current theme
            themeToggle.innerHTML = this.uiState.isDarkMode 
                ? '<i class="fas fa-sun"></i>' 
                : '<i class="fas fa-moon"></i>';
        }
    }
    
    /**
     * Apply theme based on dark/light mode
     * @private
     */
    _applyTheme() {
        if (this.uiState.isDarkMode) {
            document.documentElement.classList.add('dark-mode');
            document.documentElement.classList.remove('light-mode');
            
            // Update theme toggle icon if it exists
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) {
                themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            }
        } else {
            document.documentElement.classList.remove('dark-mode');
            document.documentElement.classList.add('light-mode');
            
            // Update theme toggle icon if it exists
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) {
                themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
            }
        }
    }
    
    /**
     * Save current scroll position
     */
    saveScrollPosition() {
        this.uiState.scrollPosition = window.scrollY;
    }
    
    /**
     * Restore saved scroll position
     */
    restoreScrollPosition() {
        window.scrollTo({
            top: this.uiState.scrollPosition,
            behavior: 'auto'
        });
    }
    
    /**
     * Handle a global click event using event delegation
     * @param {Event} e - Click event
     */
    handleGlobalClick(e) {
        // Find clicked element or parent with data attributes
        let target = e.target;
        while (target && target !== document) {
            // Check for ticket cards
            if (target.classList.contains('ticket-card')) {
                e.preventDefault();
                const ticketId = target.getAttribute('data-ticket-id');
                const category = target.getAttribute('data-category');
                this.showTicketDetails(ticketId, category);
                return;
            }
            
            // Check for action buttons with data-action
            const action = target.getAttribute('data-action');
            if (action) {
                e.preventDefault();
                
                switch (action) {
                    case 'showDetails':
                        const ticketId = target.closest('.ticket-card')?.getAttribute('data-ticket-id');
                        const category = target.closest('.ticket-card')?.getAttribute('data-category');
                        if (ticketId) this.showTicketDetails(ticketId, category);
                        break;
                    
                    case 'exportCsv':
                        this.exportToCSV();
                        break;
                        
                    case 'toggleEditMode':
                        this.toggleTechEditMode();
                        break;
                        
                    case 'printTicket':
                        this.printTicketDetails();
                        break;
                        
                    case 'closeModal':
                        const modal = target.closest('.modal-backdrop');
                        if (modal) modal.classList.remove('open');
                        break;
                        
                    case 'refreshData':
                        this.appState.fetchAllTickets();
                        break;
                }
                
                return;
            }
            
            target = target.parentElement;
        }
    }
    
    /**
     * ============================================
     * STATE UPDATE HANDLERS
     * ============================================
     */
    
    /**
     * Handle state updates from AppState
     * @param {Object} data - Update data
     */
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
                this.updateSearchResults(data.results, data.category);
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
    
    /**
     * Update loading state UI
     * @param {boolean} isLoading - If the app is in loading state
     */
    updateLoadingState(isLoading) {
        const loadingElement = this.elements.loading;
        if (!loadingElement) return;
        
        if (isLoading) {
            loadingElement.classList.remove('hidden');
        } else {
            loadingElement.classList.add('hidden');
        }
    }
    
    /**
     * Update connection status UI
     * @param {boolean} isOffline - If the app is offline
     */
    updateConnectionStatus(isOffline) {
        const statusElement = this.elements.connectionStatus;
        if (!statusElement) return;
        
        // Remove all status classes
        statusElement.classList.remove('online', 'offline', 'connecting');
        
        if (isOffline) {
            statusElement.classList.add('offline');
            statusElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Sin conexión</span>';
        } else {
            statusElement.classList.add('online');
            statusElement.innerHTML = '<i class="fas fa-wifi"></i><span>Conectado</span>';
        }
    }
    
    /**
     * Process ticket updates
     * @param {Object} ticketsData - Ticket update data
     */
    processTicketsUpdate(ticketsData) {
        const { all, added, removed, updated } = ticketsData;
        
        // Update global ticket count
        const totalElement = document.getElementById('totalTickets');
        if (totalElement) {
            totalElement.textContent = all.length;
        }
        
        // If there's an active search, don't update the results
        if (this.appState.currentSearch.query || this.appState.currentSearch.category) {
            return; // Search results are updated separately
        }
        
        // Get tickets to show (most recent ones)
        const ticketsToShow = all.slice(0, CONFIG.maxResults);
        
        // Update the main container with optimized DOM operations
        this.updateTicketsContainer(ticketsToShow, added, removed, updated);
        
        // Update status message
        if (this.elements.searchStatus) {
            this.elements.searchStatus.textContent = 
                `Base de datos actualizada con ${all.length} tickets. Mostrando los ${Math.min(CONFIG.maxResults, all.length)} más recientes.`;
            this.elements.searchStatus.className = 'text-sm text-gray-500 mt-1';
        }
        
        // Update total counter
        if (this.elements.totalResults) {
            this.elements.totalResults.textContent = all.length;
        }
        
        // Show/hide empty state
        this.toggleEmptyState(all.length === 0);
    }
    
    /**
     * Update the tickets container with optimized DOM operations
     * @param {Array} tickets - Tickets to display
     * @param {Array} added - Newly added tickets
     * @param {Array} removed - Removed tickets
     * @param {Array} updated - Updated tickets
     */
    updateTicketsContainer(tickets, added, removed, updated) {
        const container = this.elements.searchResults;
        if (!container) return;
        
        // Get currently rendered ticket IDs
        const currentTicketElements = container.querySelectorAll('.ticket-card');
        const renderedTicketIds = new Set();
        currentTicketElements.forEach(el => {
            const ticketId = el.getAttribute('data-ticket-id');
            if (ticketId) renderedTicketIds.add(ticketId);
        });
        
        // 1. Remove tickets that should no longer be shown
        const ticketsToRemove = [...currentTicketElements].filter(el => {
            const ticketId = el.getAttribute('data-ticket-id');
            return !tickets.some(t => (t.ticket_id === ticketId || t.ID === ticketId));
        });
        
        // Remove with animation
        ticketsToRemove.forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-20px)';
            setTimeout(() => el.remove(), 300);
        });
        
        // 2. Find tickets to add (not currently rendered)
        const ticketsToAdd = tickets.filter(t => 
            !renderedTicketIds.has(t.ticket_id) && !renderedTicketIds.has(t.ID)
        );
        
        // 3. Find tickets to update (already rendered)
        const ticketsToUpdate = tickets.filter(t => 
            renderedTicketIds.has(t.ticket_id) || renderedTicketIds.has(t.ID)
        );
        
        // First update existing
        ticketsToUpdate.forEach(ticket => {
            const effectiveTicketId = ticket.ticket_id || ticket.ID;
            const existingElement = container.querySelector(`.ticket-card[data-ticket-id="${effectiveTicketId}"]`);
            
            if (existingElement) {
                // Skip if already updating
                if (this.uiState.updatingTickets.has(effectiveTicketId)) {
                    return;
                }
                
                this.uiState.updatingTickets.add(effectiveTicketId);
                
                // Update content
                this.updateTicketCardContent(existingElement, ticket);
                
                // Update position if needed
                const currentIndex = Array.from(container.children).indexOf(existingElement);
                const newIndex = tickets.findIndex(t => (t.ticket_id === effectiveTicketId || t.ID === effectiveTicketId));
                
                if (currentIndex !== newIndex && newIndex >= 0) {
                    // Move with animation
                    this.moveTicketCard(existingElement, container, newIndex);
                }
                
                setTimeout(() => {
                    this.uiState.updatingTickets.delete(effectiveTicketId);
                }, 300);
            }
        });
        
        // Then add new ones with animation
        if (ticketsToAdd.length > 0) {
            const fragment = document.createDocumentFragment();
            
            ticketsToAdd.forEach(ticket => {
                const ticketElement = this.createTicketElement(ticket);
                
                // Set up for entry animation
                ticketElement.style.opacity = '0';
                ticketElement.style.transform = 'translateY(20px)';
                
                fragment.appendChild(ticketElement);
            });
            
            // Add to DOM
            container.appendChild(fragment);
            
            // Animate entry
            setTimeout(() => {
                const newElements = container.querySelectorAll('.ticket-card[style*="opacity: 0"]');
                newElements.forEach((el, idx) => {
                    setTimeout(() => {
                        el.style.transition = 'all 300ms ease-out';
                        el.style.opacity = '1';
                        el.style.transform = 'translateY(0)';
                    }, 50 * idx); // Stagger animation
                });
            }, 10);
        }
    }
    
    /**
     * Create a ticket card element
     * @param {Object} ticket - Ticket data
     * @returns {HTMLElement} - Ticket card element
     */
    createTicketElement(ticket) {
        // Get effective ticket ID
        const ticketId = ticket.ticket_id || ticket.ID || 'Sin ID';
        
        // Determine CSS class based on category
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
        
        // Format time since last update
        let lastUpdateTime = formatTimeAgo(ticket.Ultima_modificacion);
        
        // Truncate long title
        const tituloCompleto = ticket.Título || ticket.titulo || 'Sin título';
        const tituloTruncado = tituloCompleto.length > 60 ? tituloCompleto.substring(0, 57) + '...' : tituloCompleto;
        
        // Create element
        const ticketElement = document.createElement('div');
        ticketElement.className = `ticket-card ${statusClass}`;
        ticketElement.setAttribute('data-ticket-id', ticketId);
        ticketElement.setAttribute('data-category', ticket.category);
        
        // Inner HTML
        ticketElement.innerHTML = `
            <div class="p-4">
                <div class="ticket-card-header">
                    <div class="flex-1">
                        <h3 class="font-medium text-blue-600 mb-1 truncate" title="${tituloCompleto}">${tituloTruncado}</h3>
                        <div class="text-sm text-gray-600">#${ticketId}</div>
                    </div>
                    <div>
                        ${statusBadge}
                    </div>
                </div>
                
                <div class="ticket-card-body grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
                    <div class="ticket-info-grid">
                        <span class="ticket-info-label">Entidad:</span>
                        <span class="ticket-info-value">${ticket.Entidad || ticket.entidad || 'No especificada'}</span>
                    </div>
                    <div class="ticket-info-grid">
                        <span class="ticket-info-label">Solicitante:</span>
                        <span class="ticket-info-value">${ticket.Solicitante || ticket.solicitante || 'No especificado'}</span>
                    </div>
                    <div class="ticket-info-grid">
                        <span class="ticket-info-label">Asignado a:</span>
                        <span class="ticket-info-value">${ticket.Asignado_a || ticket.asignado_a || 'Sin asignar'}</span>
                    </div>
                    <div class="ticket-info-grid">
                        <span class="ticket-info-label">Actualizado:</span>
                        <span class="ticket-info-value">${lastUpdateTime || 'No disponible'}</span>
                    </div>
                </div>
                
                <div class="ticket-card-footer">
                    <button class="btn-details">
                        <i class="fas fa-external-link-alt mr-1"></i>Ver detalles
                    </button>
                </div>
            </div>
        `;
        
        return ticketElement;
    }
    
    /**
     * Update content of an existing ticket card
     * @param {HTMLElement} element - Ticket card element
     * @param {Object} ticket - Updated ticket data
     */
    updateTicketCardContent(element, ticket) {
        // Update title if changed
        const titleElement = element.querySelector('h3');
        if (titleElement) {
            const tituloCompleto = ticket.Título || ticket.titulo || 'Sin título';
            const tituloTruncado = tituloCompleto.length > 60 ? tituloCompleto.substring(0, 57) + '...' : tituloCompleto;
            titleElement.textContent = tituloTruncado;
            titleElement.setAttribute('title', tituloCompleto);
        }
        
        // Update category/status if changed
        const oldCategory = element.getAttribute('data-category');
        const newCategory = ticket.category;
        
        if (oldCategory !== newCategory) {
            // Update status class
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
            
            // Update badge
            const badgeContainer = element.querySelector('.ticket-card-header > div:last-child');
            if (badgeContainer) {
                badgeContainer.innerHTML = statusBadge;
            }
            
            // Highlight status change
            element.classList.add('highlight-update');
            setTimeout(() => {
                element.classList.remove('highlight-update');
            }, 2000);
        }
        
        // Update info fields
        const infoFields = [
            { selector: 'Entidad', key: 'Entidad', fallback: 'entidad', defaultValue: 'No especificada' },
            { selector: 'Solicitante', key: 'Solicitante', fallback: 'solicitante', defaultValue: 'No especificado' },
            { selector: 'Asignado a', key: 'Asignado_a', fallback: 'asignado_a', defaultValue: 'Sin asignar' }
        ];
        
        infoFields.forEach(field => {
            const fieldElement = element.querySelector(`.ticket-info-grid:has(.ticket-info-label:contains("${field.selector}")) .ticket-info-value`);
            if (fieldElement) {
                fieldElement.textContent = ticket[field.key] || ticket[field.fallback] || field.defaultValue;
            } else {
                // Fallback for browsers that don't support :has()
                const labels = element.querySelectorAll('.ticket-info-label');
                labels.forEach(label => {
                    if (label.textContent.includes(field.selector)) {
                        const valueElement = label.nextElementSibling;
                        if (valueElement && valueElement.classList.contains('ticket-info-value')) {
                            valueElement.textContent = ticket[field.key] || ticket[field.fallback] || field.defaultValue;
                        }
                    }
                });
            }
        });
        
        // Update time since last update
        const updateTimeElement = element.querySelector(`.ticket-info-grid:has(.ticket-info-label:contains("Actualizado:")) .ticket-info-value`);
        if (updateTimeElement) {
            const newTime = formatTimeAgo(ticket.Ultima_modificacion);
            updateTimeElement.textContent = newTime || 'No disponible';
        } else {
            // Fallback for browsers that don't support :has()
            const labels = element.querySelectorAll('.ticket-info-label');
            labels.forEach(label => {
                if (label.textContent.includes('Actualizado:')) {
                    const valueElement = label.nextElementSibling;
                    if (valueElement && valueElement.classList.contains('ticket-info-value')) {
                        const newTime = formatTimeAgo(ticket.Ultima_modificacion);
                        valueElement.textContent = newTime || 'No disponible';
                    }
                }
            });
        }
    }
    
    /**
     * Move a ticket card to a new position with animation
     * @param {HTMLElement} element - Ticket element to move
     * @param {HTMLElement} container - Parent container
     * @param {number} newIndex - New position index
     */
    moveTicketCard(element, container, newIndex) {
        // Store original position
        const rect = element.getBoundingClientRect();
        
        // Mark for animation
        element.style.transition = 'none';
        element.style.position = 'relative';
        element.style.zIndex = '10';
        
        requestAnimationFrame(() => {
            // Calculate movement
            const targetElement = container.children[newIndex] || null;
            
            if (targetElement) {
                // Move before target element
                container.insertBefore(element, targetElement);
            } else {
                // Move to end
                container.appendChild(element);
            }
            
            // Force reflow to enable animation
            void element.offsetWidth;
            
            // Apply animation
            element.style.transition = 'all 300ms ease-out';
            element.style.position = '';
            element.style.zIndex = '';
        });
    }
    
    /**
     * Update counter displays with animation
     * @param {Object} counters - Counter values
     */
    updateCounters(counters) {
        // Update counters with animation
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
        
        // Update total counters
        const totalCount = Object.values(counters).reduce((sum, val) => sum + val, 0);
        
        if (this.elements.totalTickets) {
            this.elements.totalTickets.textContent = totalCount;
        }
        
        if (this.elements.totalResults) {
            this.elements.totalResults.textContent = totalCount;
        }
    }
    
    /**
     * Animate a counter from one value to another
     * @param {HTMLElement} element - Counter element
     * @param {number} start - Starting value
     * @param {number} end - Ending value
     */
    animateCounter(element, start, end) {
        // Cancel previous animation if exists
        if (element._animationId) {
            cancelAnimationFrame(element._animationId);
        }
        
        // Animation variables
        const duration = 1000; // ms
        const startTime = performance.now();
        
        // Animation function with easing
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Use cubic ease-out curve
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            // Calculate current value
            const currentValue = Math.round(start + (end - start) * easeProgress);
            
            // Update element
            element.textContent = currentValue;
            
            // Continue animation if not finished
            if (progress < 1) {
                element._animationId = requestAnimationFrame(animate);
            } else {
                element.textContent = end;
                element._animationId = null;
                
                // Add visual effect when finished
                element.classList.add('counter-updated');
                setTimeout(() => {
                    element.classList.remove('counter-updated');
                }, 500);
            }
        };
        
        // Start animation
        element._animationId = requestAnimationFrame(animate);
    }
    
    /**
     * Update the last update time display
     * @param {string} timestamp - Update timestamp
     */
    updateLastUpdateTime(timestamp) {
        const lastUpdateElement = this.elements.lastUpdate;
        if (lastUpdateElement && timestamp) {
            try {
                const formattedDate = moment(timestamp).format('DD-MM-YYYY HH:mm:ss');
                const timeAgo = moment(timestamp).fromNow();
                
                lastUpdateElement.innerHTML = `
                    <i class="fas fa-history"></i>
                    <span>Última actualización: ${formattedDate} (${timeAgo})</span>
                `;
                
                // Visual update effect
                lastUpdateElement.classList.add('last-update-flash');
                setTimeout(() => {
                    lastUpdateElement.classList.remove('last-update-flash');
                }, 1000);
            } catch (e) {
                lastUpdateElement.innerHTML = `
                    <i class="fas fa-history"></i>
                    <span>Última actualización: ${timestamp}</span>
                `;
            }
        }
    }
    
    /**
     * Update search results display
     * @param {Array} results - Search results
     * @param {string|null} category - Filter category
     */
    updateSearchResults(results, category) {
        const resultsContainer = this.elements.searchResults;
        if (!resultsContainer) return;
        
        // Clear the container
        resultsContainer.innerHTML = '';
        
        // Show/hide empty state based on results
        this.toggleEmptyState(results.length === 0);
        
        if (results.length === 0) {
            // Empty message is handled by toggleEmptyState
            
            // Update status message
            if (this.elements.searchStatus) {
                let message = 'No se encontraron resultados para tu búsqueda';
                if (category) {
                    const categoryNames = {
                        'nuevos': 'Nuevos',
                        'espera': 'En Espera',
                        'curso': 'En Curso',
                        'resueltos': 'Resueltos'
                    };
                    message = `No se encontraron tickets en estado: ${categoryNames[category] || category}`;
                }
                this.elements.searchStatus.textContent = message;
            }
            return;
        }
        
        // Update status message
        if (this.elements.searchStatus) {
            if (category && !this.appState.currentSearch.query) {
                const categoryNames = {
                    'nuevos': 'Nuevos',
                    'espera': 'En Espera',
                    'curso': 'En Curso',
                    'resueltos': 'Resueltos'
                };
                this.elements.searchStatus.textContent = `Mostrando tickets en estado: ${categoryNames[category] || category} (${results.length})`;
            } else {
                this.elements.searchStatus.textContent = `Se encontraron ${results.length} tickets que coinciden con tu búsqueda.`;
            }
        }
        
        // Update counter
        if (this.elements.totalResults) {
            this.elements.totalResults.textContent = results.length;
        }
        
        // Create and add ticket elements with animation
        const fragment = document.createDocumentFragment();
        
        results.forEach((ticket, index) => {
            const ticketElement = this.createTicketElement(ticket);
            
            // Set up for animated entry
            ticketElement.style.opacity = '0';
            ticketElement.style.transform = 'translateY(20px)';
            
            fragment.appendChild(ticketElement);
        });
        
        // Add all at once
        resultsContainer.appendChild(fragment);
        
        // Animate entries
        setTimeout(() => {
            const tickets = resultsContainer.querySelectorAll('.ticket-card');
            tickets.forEach((el, index) => {
                setTimeout(() => {
                    el.style.transition = 'all 300ms ease-out';
                    el.style.opacity = '1';
                    el.style.transform = 'translateY(0)';
                }, 30 * index); // Stagger animation
            });
        }, 50);
        
        // Restore scroll
        requestAnimationFrame(() => {
            this.restoreScrollPosition();
        });
    }
    
    /**
     * Toggle empty state display
     * @param {boolean} isEmpty - Whether results are empty
     */
    toggleEmptyState(isEmpty) {
        const emptyState = this.elements.emptyState;
        if (!emptyState) return;
        
        if (isEmpty) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
        }
    }
    
    /**
     * Clear search results and reset display
     */
    clearSearchResults() {
        // Show most recent tickets (up to limit)
        const recentTickets = this.appState.allTickets.slice(0, CONFIG.maxResults);
        
        // Update results
        this.updateTicketsContainer(recentTickets, [], [], []);
        
        // Update message and counters
        if (this.elements.searchStatus) {
            this.elements.searchStatus.textContent = `Base de datos cargada con ${this.appState.allTickets.length} tickets. Mostrando los ${Math.min(CONFIG.maxResults, this.appState.allTickets.length)} más recientes.`;
            this.elements.searchStatus.className = 'text-sm text-gray-500 mt-1';
        }
        
        if (this.elements.totalResults) {
            this.elements.totalResults.textContent = this.appState.allTickets.length;
        }
        
        // Reset stat card state
        document.querySelectorAll('.stat-card').forEach(card => {
            card.classList.remove('ring-2', 'ring-primary');
        });
        
        // Clear search fields
        if (this.elements.searchQuery) {
            this.elements.searchQuery.value = '';
        }
        
        if (this.elements.searchField) {
            this.elements.searchField.value = 'all';
        }
        
        // Hide empty state if needed
        this.toggleEmptyState(false);
    }
    
    /**
     * Show error messages to the user
     * @param {Object} errorData - Error information
     */
    showError(errorData) {
        const { context, message, retryCount } = errorData;
        console.error(`Error (${context}): ${message}`);
        
        // Update message in UI
        if (this.elements.searchStatus) {
            this.elements.searchStatus.textContent = message;
            this.elements.searchStatus.className = 'text-sm text-red-500 mt-1';
        }
        
        // Show floating notification for important errors
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
    
    /**
     * Handle WebSocket connection state
     * @param {boolean} isConnected - If WebSocket is connected
     */
    handleSocketConnection(isConnected) {
        const statusElement = this.elements.connectionStatus;
        if (statusElement) {
            statusElement.classList.remove('online', 'offline', 'connecting');
            
            if (isConnected) {
                statusElement.classList.add('online');
                statusElement.innerHTML = '<i class="fas fa-wifi"></i><span>Conectado (Tiempo real)</span>';
                
                // Show subtle notification
                this.showNotification({
                    title: 'Conexión establecida',
                    message: 'Recibiendo actualizaciones en tiempo real',
                    type: 'success',
                    duration: 3000
                });
            } else {
                statusElement.classList.add('connecting');
                statusElement.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i><span>Reconectando</span>';
            }
        }
    }
    
    /**
     * Handle offline data loaded from cache
     * @param {Object} data - Offline data info
     */
    handleOfflineData(data) {
        const { isExpired, timestamp } = data;
        
        // Show message in UI
        if (this.elements.searchStatus) {
            if (isExpired) {
                this.elements.searchStatus.textContent = `Mostrando datos en caché (${formatFecha(timestamp)}) - Los datos podrían estar desactualizados`;
                this.elements.searchStatus.className = 'text-sm text-orange-500 mt-1';
            } else {
                this.elements.searchStatus.textContent = `Mostrando datos en caché (${formatFecha(timestamp)})`;
                this.elements.searchStatus.className = 'text-sm text-gray-500 mt-1';
            }
        }
        
        // Show notification if data is very outdated
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
    
    /**
     * Handle case when no offline data is available
     */
    handleNoOfflineData() {
        // Show message in UI
        if (this.elements.searchStatus) {
            this.elements.searchStatus.textContent = 'No hay datos disponibles. Conéctese a Internet para cargar tickets.';
            this.elements.searchStatus.className = 'text-sm text-red-500 mt-1';
        }
        
        // Show notification
        this.showNotification({
            title: 'Sin datos disponibles',
            message: 'No se encontraron datos en caché. Conéctese a Internet para cargar tickets.',
            type: 'error',
            duration: 0  // No auto-close
        });
        
        // Show empty state
        this.toggleEmptyState(true);
    }
    
    /**
     * ============================================
     * EVENT HANDLERS
     * ============================================
     */
    
    /**
     * Handle search form submission
     * @param {Event} event - Form submit event
     */
    handleSearch(event) {
        event.preventDefault();
        
        const query = this.elements.searchQuery.value.trim();
        const field = this.elements.searchField.value;
        
        if (!query) {
            this.handleClearSearch();
            return;
        }
        
        // Clear any active category filter
        this.appState.performSearch(query, field, null);
        
        // Reset any active category card highlight
        document.querySelectorAll('.stat-card').forEach(card => {
            card.classList.remove('ring-2', 'ring-primary');
        });
        
        // Show clear button
        if (this.elements.clearSearch) {
            this.elements.clearSearch.style.display = 'block';
        }
    }
    
    /**
     * Handle clearing the search
     */
    handleClearSearch() {
        this.appState.clearSearch();
        
        // Hide clear button
        if (this.elements.clearSearch) {
            this.elements.clearSearch.style.display = 'none';
        }
    }
    
    /**
     * Handle quick search on input
     */
    handleQuickSearch() {
        const query = this.elements.searchQuery.value.trim();
        
        // Toggle clear button
        if (this.elements.clearSearch) {
            this.elements.clearSearch.style.display = query ? 'block' : 'none';
        }
        
        // If search is cleared, reset results
        if (!query) {
            this.handleClearSearch();
            return;
        }
        
        // Debounce: search only after 300ms of no typing
        clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(() => {
            const field = this.elements.searchField.value;
            this.appState.performSearch(query, field, null);
            
            // Reset any active category card highlight
            document.querySelectorAll('.stat-card').forEach(card => {
                card.classList.remove('ring-2', 'ring-primary');
            });
        }, 300);
    }
    
    /**
     * Filter tickets by category
     * @param {string} category - Category to filter by
     */
    filterByCategory(category) {
        // Search all tickets of the category
        this.appState.performSearch('', 'all', category);
        
        // Reset search input
        if (this.elements.searchQuery) {
            this.elements.searchQuery.value = '';
        }
        
        if (this.elements.searchField) {
            this.elements.searchField.value = 'all';
        }
        
        // Hide clear button
        if (this.elements.clearSearch) {
            this.elements.clearSearch.style.display = 'none';
        }
        
        // Highlight active category card
        document.querySelectorAll('.stat-card').forEach(card => {
            card.classList.remove('ring-2', 'ring-primary');
        });
        
        const categoryCard = this.elements[`${category}Card`];
        if (categoryCard) {
            categoryCard.classList.add('ring-2', 'ring-primary');
        }
    }
    
    /**
     * ============================================
     * TICKET DETAILS & MODALS
     * ============================================
     */
    
    /**
     * Show ticket details in modal
     * @param {string} ticketId - Ticket ID
     * @param {string} category - Ticket category
     */
    showTicketDetails(ticketId, category) {
        const modal = document.getElementById('ticketDetailsModal');
        const modalTitle = document.getElementById('ticketDetailsModalLabel');
        const modalBody = document.getElementById('ticketDetailsBody');
        
        if (!modal || !modalTitle || !modalBody) return;
        
        // Show modal
        modal.classList.add('open');
        
        // Show loading spinner
        modalBody.innerHTML = `
            <div class="flex justify-center items-center p-10">
                <div class="loading-spinner"></div>
            </div>
        `;
        
        // Try to find ticket in cache
        const cachedKey = `ticket_details_${ticketId}`;
        const cachedTicket = memoryCache.get(cachedKey);
        
        if (cachedTicket) {
            this.renderTicketDetails(cachedTicket, category, modalTitle, modalBody);
            return;
        }
        
        // Find in app state
        const ticket = this.appState.allTickets.find(t => 
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
        
        // Save in memory cache for future queries
        memoryCache.set(cachedKey, ticket, 300000); // 5 minutes TTL
        
        // Render details
        this.renderTicketDetails(ticket, category, modalTitle, modalBody);
    }
    
    /**
     * Render ticket details in modal
     * @param {Object} ticket - Ticket data
     * @param {string} category - Ticket category
     * @param {HTMLElement} modalTitle - Modal title element
     * @param {HTMLElement} modalBody - Modal body element
     */
    renderTicketDetails(ticket, category, modalTitle, modalBody) {
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
        
        const nombreTecnico = ticket.Asignado_a || ticket.asignado_a || '';
        const tieneTecnicoAsignado = nombreTecnico && nombreTecnico !== 'No asignado' && nombreTecnico !== 'Sin asignar';
        
        let tecnicoContactoHtml = '';
        if (tieneTecnicoAsignado) {
            tecnicoContactoHtml = `
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm mb-6 ticket-detail-animate">
                    <div class="px-4 py-3 bg-blue-50 dark:bg-blue-900 border-b border-blue-100 dark:border-blue-800 rounded-t-lg flex justify-between items-center">
                        <h3 class="font-semibold text-blue-700 dark:text-blue-300"><i class="fas fa-headset mr-2"></i>Técnico Asignado</h3>
                        <button onclick="showTechContactModal('${nombreTecnico}')" class="px-3 py-1 bg-blue-600 text-white rounded-full hover:bg-blue-700 text-sm">
                            <i class="fas fa-address-card mr-1"></i> Ver Contacto
                        </button>
                    </div>
                    <div class="p-4">
                        <div class="flex items-center">
                            <div class="w-10 h-10 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-300 mr-3">
                                <i class="fas fa-user"></i>
                            </div>
                            <div>
                                <h4 class="font-medium">${nombreTecnico}</h4>
                                <p class="text-sm text-gray-500 dark:text-gray-400">Haz clic en "Ver Contacto" para obtener información detallada</p>
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
                            <span class="text-gray-600 dark:text-gray-300 text-sm">
                                <i class="fas fa-hashtag"></i> ${effectiveTicketId}
                            </span>
                            ${ticket.ID_interno ? `
                            <span class="text-gray-600 dark:text-gray-300 text-sm">
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
            
            <!-- Trazabilidad -->
            <div class="traceability-container ticket-detail-animate">
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
                        <div class="trace-step ${this.getTraceNodeClass('nuevos', effectiveCategory)}">
                            <div class="step-icon-container">
                                <div class="step-indicator">
                                    <i class="fas fa-plus-circle"></i>
                                </div>
                                <div class="step-pulse"></div>
                            </div>
                            <div class="step-label">Nuevo</div>
                        </div>
                        
                        <!-- Paso: En Espera -->
                        <div class="trace-step ${this.getTraceNodeClass('espera', effectiveCategory)}">
                            <div class="step-icon-container">
                                <div class="step-indicator">
                                    <i class="fas fa-hourglass-half"></i>
                                </div>
                                <div class="step-pulse"></div>
                            </div>
                            <div class="step-label">En Espera</div>
                        </div>
                        
                        <!-- Paso: En Curso -->
                        <div class="trace-step ${this.getTraceNodeClass('curso', effectiveCategory)}">
                            <div class="step-icon-container">
                                <div class="step-indicator">
                                    <i class="fas fa-cogs"></i>
                                </div>
                                <div class="step-pulse"></div>
                            </div>
                            <div class="step-label">En Curso</div>
                        </div>
                        
                        <!-- Paso: Resuelto -->
                        <div class="trace-step ${this.getTraceNodeClass('resueltos', effectiveCategory)}">
                            <div class="step-icon-container">
                                <div class="step-indicator">
                                    <i class="fas fa-check-circle"></i>
                                </div>
                                <div class="step-pulse"></div>
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
            </div>
            
            <!-- Contacto con Técnico (si hay asignado) -->
            ${tieneTecnicoAsignado ? tecnicoContactoHtml : ''}
            
            <!-- Detalles del Ticket en tarjetas -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <!-- Información General -->
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm ticket-detail-animate">
                    <div class="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-100 dark:border-gray-600 rounded-t-lg">
                        <h3 class="font-semibold"><i class="fas fa-info-circle mr-2"></i>Información General</h3>
                    </div>
                    <div class="p-4">
                        <table class="w-full">
                            <tbody>
                                <tr class="border-b border-gray-100 dark:border-gray-700">
                                    <td class="py-2 font-medium text-gray-600 dark:text-gray-300">Entidad:</td>
                                    <td class="py-2">${ticket.Entidad || ticket.entidad || 'No especificada'}</td>
                                </tr>
                                <tr class="border-b border-gray-100 dark:border-gray-700">
                                    <td class="py-2 font-medium text-gray-600 dark:text-gray-300">Categoría:</td>
                                    <td class="py-2">${ticket.Categoria || ticket.categoria || 'No especificada'}</td>
                                </tr>
                                <tr class="border-b border-gray-100 dark:border-gray-700">
                                    <td class="py-2 font-medium text-gray-600 dark:text-gray-300">Tipo:</td>
                                    <td class="py-2">${ticket.Tipo || ticket.tipo || 'No especificado'}</td>
                                </tr>
                                <tr class="border-b border-gray-100 dark:border-gray-700">
                                    <td class="py-2 font-medium text-gray-600 dark:text-gray-300">Prioridad:</td>
                                    <td class="py-2">${ticket.Prioridad || ticket.prioridad || 'No especificada'}</td>
                                </tr>
                                <tr class="border-b border-gray-100 dark:border-gray-700">
                                    <td class="py-2 font-medium text-gray-600 dark:text-gray-300">Medio:</td>
                                    <td class="py-2">${ticket.Medio || ticket.medio || 'No especificado'}</td>
                                </tr>
                                <tr>
                                    <td class="py-2 font-medium text-gray-600 dark:text-gray-300">Ubicación:</td>
                                    <td class="py-2">${ticket.Ubicacion || ticket.ubicacion || 'No especificada'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Asignación -->
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm ticket-detail-animate">
                    <div class="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-100 dark:border-gray-600 rounded-t-lg">
                        <h3 class="font-semibold"><i class="fas fa-user mr-2"></i>Asignación</h3>
                    </div>
                    <div class="p-4">
                        <table class="w-full">
                            <tbody>
                                <tr class="border-b border-gray-100 dark:border-gray-700">
                                    <td class="py-2 font-medium text-gray-600 dark:text-gray-300">Solicitante:</td>
                                    <td class="py-2">${ticket.Solicitante || ticket.solicitante || 'No especificado'}</td>
                                </tr>
                                <tr class="border-b border-gray-100 dark:border-gray-700">
                                    <td class="py-2 font-medium text-gray-600 dark:text-gray-300">Asignado a:</td>
                                    <td class="py-2">
                                        ${ticket.Asignado_a || ticket.asignado_a || 'No asignado'}
                                        ${tieneTecnicoAsignado ? `
                                          <a href="javascript:void(0)" onclick="showTechContactModal('${nombreTecnico}')" class="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                                            <i class="fas fa-id-card"></i> Ver contacto
                                          </a>` : 
                                          ''
                                        }
                                    </td>
                                </tr>
                                <tr>
                                    <td class="py-2 font-medium text-gray-600 dark:text-gray-300">Estado:</td>
                                    <td class="py-2">${ticket.Estado || ticket.estado || 'No especificado'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <!-- Tiempos -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm mb-6 ticket-detail-animate">
                <div class="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-100 dark:border-gray-600 rounded-t-lg">
                    <h3 class="font-semibold"><i class="fas fa-clock mr-2"></i>Tiempos</h3>
                </div>
                <div class="p-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <table class="w-full">
                                <tbody>
                                    <tr class="border-b border-gray-100 dark:border-gray-700">
                                        <td class="py-2 font-medium text-gray-600 dark:text-gray-300">Fecha Apertura:</td>
                                        <td class="py-2">${fechaApertura}</td>
                                    </tr>
                                    <tr>
                                        <td class="py-2 font-medium text-gray-600 dark:text-gray-300">Última Modificación:</td>
                                        <td class="py-2">${ultimaModificacion}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div>
                            <table class="w-full">
                                <tbody>
                                    <tr class="border-b border-gray-100 dark:border-gray-700">
                                        <td class="py-2 font-medium text-gray-600 dark:text-gray-300">Tiempo Resolución:</td>
                                        <td class="py-2">${ticket.Tiempo_resolucion || ticket.tiempo_resolucion || 'No disponible'}</td>
                                    </tr>
                                    <tr class="border-b border-gray-100 dark:border-gray-700">
                                        <td class="py-2 font-medium text-gray-600 dark:text-gray-300">Duración:</td>
                                        <td class="py-2">${ticket.Duracion || ticket.duracion || 'No disponible'}</td>
                                    </tr>
                                    <tr class="border-b border-gray-100 dark:border-gray-700">
                                        <td class="py-2 font-medium text-gray-600 dark:text-gray-300">Tiempo Adicional:</td>
                                        <td class="py-2">${ticket.Tiempo_adicional || ticket.tiempo_adicional || 'No asignado'}</td>
                                    </tr>
                                    <tr>
                                        <td class="py-2 font-medium text-gray-600 dark:text-gray-300">Delay:</td>
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
                <button class="btn btn-secondary" data-action="printTicket">
                    <i class="fas fa-print mr-2"></i>Imprimir
                </button>
                <button class="btn btn-primary" onclick="openTicketInSystem('${effectiveTicketId}')">
                    <i class="fas fa-external-link-alt mr-2"></i>Ver en sistema
                </button>
                ${tieneTecnicoAsignado ? 
                  `<button onclick="showTechContactModal('${nombreTecnico}')" class="btn btn-primary bg-green-600 hover:bg-green-700">
                    <i class="fas fa-phone-alt mr-2"></i>Contactar técnico
                  </button>` : 
                  ''
                }
            </div>
        `;
        
        // Animate entry of elements
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
     * Get CSS class for a trace node based on current status
     * @param {string} nodeCategory - Node category to check
     * @param {string} currentCategory - Current ticket category
     * @returns {string} - CSS class name
     */
    getTraceNodeClass(nodeCategory, currentCategory) {
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
     * Toggle edit mode for technician
     */
    toggleTechEditMode() {
        if (!this.elements.techContactViewMode || !this.elements.techContactEditMode) {
            console.error("Error: elementos de vista/edición no encontrados");
            return;
        }
        
        const viewMode = this.elements.techContactViewMode;
        const editMode = this.elements.techContactEditMode;
        const viewButtons = document.getElementById('viewModeButtons');
        const editButtons = document.getElementById('editModeButtons');
        
        if (!viewButtons || !editButtons) {
            console.error("Error: botones de modo vista/edición no encontrados");
            return;
        }
        
        // Toggle visibility
        if (viewMode.classList.contains('hidden')) {
            // Switch to view mode
            viewMode.classList.remove('hidden');
            editMode.classList.add('hidden');
            viewButtons.classList.remove('hidden');
            editButtons.classList.add('hidden');
        } else {
            // Switch to edit mode
            viewMode.classList.add('hidden');
            editMode.classList.remove('hidden');
            viewButtons.classList.add('hidden');
            editButtons.classList.remove('hidden');
        }
    }
    
    /**
     * Save technician edit form
     */
    saveTechEditForm() {
        // Get form data
        const form = document.getElementById('techEditForm');
        if (!form) {
            this.showNotification({
                title: 'Error',
                message: 'Formulario no encontrado',
                type: 'error'
            });
            return;
        }
        
        // Get required fields
        const id = document.getElementById('editTechId')?.value;
        const nombre = document.getElementById('editTechNombre')?.value;
        const email = document.getElementById('editTechEmail')?.value;
        
        // Validate required fields
        if (!nombre || !email) {
            this.showNotification({
                title: 'Error de validación',
                message: 'Nombre y email son campos requeridos',
                type: 'error',
                duration: 3000
            });
            return;
        }
        
        // Collect all form data
        const formData = {
            id: id,
            nombre: nombre,
            cargo: document.getElementById('editTechCargo')?.value || '',
            area: document.getElementById('editTechArea')?.value || '',
            email: email,
            telefono: document.getElementById('editTechTelefono')?.value || '',
            anexo: document.getElementById('editTechAnexo')?.value || '',
            whatsapp: document.getElementById('editTechWhatsapp')?.value || '',
            estado: document.getElementById('editTechEstado')?.value || 'disponible',
            foto: document.getElementById('editTechFoto')?.value || '',
            especialidades: document.getElementById('editTechEspecialidades')?.value.split(',').map(s => s.trim())
        };
        
        // Show processing notification
        const notification = this.showNotification({
            title: 'Procesando',
            message: 'Guardando información del técnico...',
            type: 'info',
            duration: 0
        });
        
        // Send API request
        fetch(`/api/tecnicos/${formData.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Close processing notification
            this.closeNotification(notification);
            
            if (data.success) {
                // Show success notification
                this.showNotification({
                    title: 'Información actualizada',
                    message: 'Los datos del técnico se han guardado correctamente',
                    type: 'success',
                    duration: 3000
                });
                
                // Update cache
                memoryCache.set(`tecnico_${formData.nombre}`, formData, 300000);
                
                // Update view and toggle back to view mode
                this.renderTechnicianInfo(formData, this.elements.techContactViewMode);
                this.toggleTechEditMode();
            } else {
                throw new Error(data.error || 'Error al actualizar técnico');
            }
        })
        .catch(error => {
            // Close processing notification
            this.closeNotification(notification);
            
            // Show error notification
            this.showNotification({
                title: 'Error',
                message: `Error al guardar: ${error.message}`,
                type: 'error',
                duration: 5000
            });
        });
    }
    
    /**
     * Render technician information in the modal
     * @param {Object} tecnico - Technician data
     * @param {HTMLElement} container - Container where to render
     */
    renderTechnicianInfo(tecnico, container) {
        if (!container) return;
        
        // Generate avatar
        let avatarHtml = '';
        if (tecnico.foto && tecnico.foto.trim() !== '') {
            avatarHtml = `<img src="${tecnico.foto}" alt="${tecnico.nombre}" class="w-20 h-20 rounded-full border-2 border-white" loading="lazy">`;
        } else {
            // Generate initials
            const iniciales = tecnico.nombre ? tecnico.nombre.split(' ').map(n => n.charAt(0)).slice(0, 2).join('') : '';
            avatarHtml = `
                <div class="w-20 h-20 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xl">
                    ${iniciales}
                </div>
            `;
        }
        
        // Determine status color
        let estadoClass, estadoIcon;
        switch (tecnico.estado) {
            case 'disponible':
                estadoClass = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
                estadoIcon = 'bg-green-500';
                break;
            case 'ocupado':
                estadoClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
                estadoIcon = 'bg-yellow-500';
                break;
            default:
                estadoClass = 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
                estadoIcon = 'bg-red-500';
        }
        
        // Process specialties
        let especialidades = [];
        if (tecnico.especialidades) {
            if (Array.isArray(tecnico.especialidades)) {
                especialidades = tecnico.especialidades;
            } else if (typeof tecnico.especialidades === 'string') {
                especialidades = tecnico.especialidades.split(',').map(item => item.trim());
            } else {
                try {
                    especialidades = JSON.parse(tecnico.especialidades || '[]');
                } catch (e) {
                    console.error("Error parsing especialidades:", e);
                    // If not valid JSON, default to empty array
                    especialidades = [];
                }
            }
        }
        
        // Show contact information with entry animation
        container.innerHTML = `
            <div class="opacity-0 transform translate-y-4 transition-all duration-500" id="tech-profile">
                <div class="flex flex-col items-center mb-4">
                    ${avatarHtml}
                    <h4 class="font-bold text-lg mt-2">${tecnico.nombre || 'Sin nombre'}</h4>
                    <p class="text-gray-600 dark:text-gray-300">${tecnico.cargo || 'Técnico de Soporte'}</p>
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
                            <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex items-center justify-center mr-2">
                                <i class="fas fa-envelope"></i>
                            </div>
                            <div>
                                <span class="text-sm text-gray-500 dark:text-gray-400">Email:</span>
                                <span class="font-medium block">
                                    <a href="mailto:${tecnico.email}" class="text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100 hover:underline">${tecnico.email}</a>
                                </span>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${tecnico.telefono ? `
                        <div class="flex items-center">
                            <div class="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 flex items-center justify-center mr-2">
                                <i class="fas fa-phone-alt"></i>
                            </div>
                            <div>
                                <span class="text-sm text-gray-500 dark:text-gray-400">Teléfono:</span>
                                <span class="font-medium block">
                                    <a href="tel:${tecnico.telefono.replace(/\D/g, '')}" class="text-purple-600 hover:text-purple-800 dark:text-purple-300 dark:hover:text-purple-100 hover:underline">${tecnico.telefono}</a>
                                </span>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${tecnico.anexo ? `
                        <div class="flex items-center">
                            <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 flex items-center justify-center mr-2">
                                <i class="fas fa-phone"></i>
                            </div>
                            <div>
                                <span class="text-sm text-gray-500 dark:text-gray-400">Anexo:</span>
                                <span class="font-medium block">${tecnico.anexo}</span>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${tecnico.whatsapp ? `
                        <div class="flex items-center">
                            <div class="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300 flex items-center justify-center mr-2">
                                <i class="fab fa-whatsapp"></i>
                            </div>
                            <div>
                                <span class="text-sm text-gray-500 dark:text-gray-400">WhatsApp:</span>
                                <span class="font-medium block">
                                    <a href="https://wa.me/${tecnico.whatsapp.replace(/\D/g, '')}" target="_blank" class="text-green-600 hover:text-green-800 dark:text-green-300 dark:hover:text-green-100 hover:underline">${tecnico.whatsapp}</a>
                                </span>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${especialidades.length > 0 ? `
                        <div class="flex items-center">
                            <div class="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-300 flex items-center justify-center mr-2">
                                <i class="fas fa-star"></i>
                            </div>
                            <div>
                                <span class="text-sm text-gray-500 dark:text-gray-400">Especialidades:</span>
                                <div class="font-medium flex flex-wrap gap-1 mt-1">
                                    ${especialidades.map(esp => 
                                        `<span class="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded-full text-xs">${esp}</span>`
                                    ).join('')}
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${tecnico.area ? `
                        <div class="flex items-center">
                            <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex items-center justify-center mr-2">
                                <i class="fas fa-sitemap"></i>
                            </div>
                            <div>
                                <span class="text-sm text-gray-500 dark:text-gray-400">Área:</span>
                                <span class="font-medium block">${getAreaName(tecnico.area)}</span>
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                <div class="flex flex-wrap justify-center gap-2 mt-6">
                    ${tecnico.email ? `
                        <a href="mailto:${tecnico.email}" class="btn btn-primary">
                            <i class="fas fa-envelope mr-1"></i> Email
                        </a>
                    ` : ''}
                    
                    ${tecnico.telefono ? `
                        <a href="tel:${tecnico.telefono.replace(/\D/g, '')}" class="btn btn-primary" style="background-color: #8B5CF6;">
                            <i class="fas fa-phone mr-1"></i> Llamar
                        </a>
                    ` : ''}
                    
                    ${tecnico.whatsapp ? `
                        <a href="https://wa.me/${tecnico.whatsapp.replace(/\D/g, '')}" target="_blank" class="btn btn-primary" style="background-color: #10B981;">
                            <i class="fab fa-whatsapp mr-1"></i> WhatsApp
                        </a>
                    ` : ''}
                </div>
            </div>
        `;
        
        // Activate entry animation
        setTimeout(() => {
            const techProfile = document.getElementById('tech-profile');
            if (techProfile) {
                techProfile.classList.remove('opacity-0', 'translate-y-4');
            }
        }, 50);
    }
    
    /**
     * Fill technician edit form with data
     * @param {Object} tecnico - Technician data
     */
    fillEditForm(tecnico) {
        // Form element references
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
        
        // Fill form with technician data
        if (elements.id) elements.id.value = tecnico.id || '';
        if (elements.nombre) elements.nombre.value = tecnico.nombre || '';
        if (elements.cargo) elements.cargo.value = tecnico.cargo || '';
        if (elements.area) elements.area.value = tecnico.area || 'sistemas';
        if (elements.email) elements.email.value = tecnico.email || '';
        if (elements.telefono) elements.telefono.value = tecnico.telefono || '';
        if (elements.anexo) elements.anexo.value = tecnico.anexo || '';
        if (elements.whatsapp) elements.whatsapp.value = tecnico.whatsapp || '';
        
        // Process specialties
        if (elements.especialidades) {
            const especialidades = this._getEspecialidades(tecnico);
            elements.especialidades.value = especialidades.join(', ');
        }
        
        if (elements.estado) elements.estado.value = tecnico.estado || 'disponible';
        if (elements.foto) elements.foto.value = tecnico.foto || '';
    }
    
    /**
     * Helper to extract especialidades from technician data
     * @param {Object} tecnico - Technician data
     * @returns {Array} - Array of especialidades
     * @private
     */
    _getEspecialidades(tecnico) {
        if (!tecnico.especialidades) return [];
        
        if (Array.isArray(tecnico.especialidades)) {
            return tecnico.especialidades;
        } else if (typeof tecnico.especialidades === 'string') {
            return tecnico.especialidades.split(',').map(s => s.trim());
        } else {
            try {
                return JSON.parse(tecnico.especialidades || '[]');
            } catch (e) {
                return [];
            }
        }
    }
    
    /**
     * Print ticket details
     */
    printTicketDetails() {
        const modalBody = document.getElementById('ticketDetailsBody');
        if (!modalBody) return;
        
        // Create print window
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            this.showNotification({
                title: 'Error de impresión',
                message: 'Por favor permita las ventanas emergentes para imprimir el documento',
                type: 'error',
                duration: 5000
            });
            return;
        }
        
        // Prepare content with proper styling
        const printContent = `
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Detalles del Ticket</title>
                <style>
                    body {
                        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        padding: 20px;
                        max-width: 900px;
                        margin: 0 auto;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 20px;
                        padding-bottom: 20px;
                        border-bottom: 1px solid #ddd;
                    }
                    .header img {
                        max-height: 60px;
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
                    .status-new { background-color: #4361EE; }
                    .status-waiting { background-color: #FFAA00; }
                    .status-inprogress { background-color: #007F5F; }
                    .status-resolved { background-color: #02C39A; }
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
                    .card {
                        border: 1px solid #ddd;
                        border-radius: 8px;
                        margin-bottom: 20px;
                        overflow: hidden;
                    }
                    .card-header {
                        background-color: #f3f4f6;
                        padding: 10px 15px;
                        border-bottom: 1px solid #ddd;
                        font-weight: bold;
                    }
                    .card-body {
                        padding: 15px;
                    }
                    .timeline {
                        margin: 30px 0;
                        position: relative;
                    }
                    .timeline::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 50%;
                        width: 2px;
                        height: 100%;
                        background: #ddd;
                        transform: translateX(-50%);
                    }
                    .timeline-item {
                        position: relative;
                        padding-left: 60px;
                        margin-bottom: 20px;
                    }
                    .timeline-item::before {
                        content: '';
                        position: absolute;
                        left: 50%;
                        top: 0;
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        background: #007F5F;
                        transform: translateX(-50%);
                    }
                    .footer {
                        margin-top: 30px;
                        text-align: center;
                        font-size: 12px;
                        color: #666;
                        border-top: 1px solid #ddd;
                        padding-top: 20px;
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
                    <img
                        src="https://www.gob.pe/rails/active_storage/representations/redirect/eyJfcmFpbHMiOnsiZGF0YSI6MTQ1MDAsInB1ciI6ImJsb2JfaWQifX0=--d56e8d89845af7a460ccbe0d65ed319826301586/eyJfcmFpbHMiOnsiZGF0YSI6eyJmb3JtYXQiOiJwbmciLCJyZXNpemVfdG9fbGltaXQiOltudWxsLDQ4XX0sInB1ciI6InZhcmlhdGlvbiJ9fQ==--830247c4bafe7cadca50817d8559bf1a09e3aa28/Sin%20ti%CC%81tulo-1-01%20(1).png"
                        alt="SENASA Logo">
                    <h1>Detalle del Ticket</h1>
                </div>
                
                <div class="content">
                    ${modalBody.innerHTML}
                </div>
                
                <div class="footer">
                    <p>Documento generado el ${new Date().toLocaleString()} - Sistema de Trazabilidad de Tickets SENASA</p>
                </div>
                
                <script>
                    window.onload = function() {
                        setTimeout(function() {
                            window.print();
                            window.close();
                        }, 500);
                    };
                </script>
            </body>
            </html>
        `;
        
        printWindow.document.open();
        printWindow.document.write(printContent);
        printWindow.document.close();
        
        // Give time for styles to load
        setTimeout(() => {
            if (printWindow.document.readyState === 'complete') {
                printWindow.focus();
                printWindow.print();
                printWindow.onafterprint = () => {
                    printWindow.close();
                };
            }
        }, 1000);
    }
    
    /**
     * ==============================================
     * NOTIFICATION SYSTEM
     * ==============================================
     */
    
    /**
     * Show a notification to the user
     * @param {Object} options - Notification options
     * @returns {HTMLElement} - The notification element
     */
    showNotification(options) {
        const { title, message, type = 'info', duration = 5000, action = null } = options;
        
        // Get or create notification container
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.className = 'fixed bottom-4 right-4 z-50 flex flex-col-reverse items-end space-y-reverse space-y-2';
            document.body.appendChild(container);
        }
        
        // Create notification element
        const notificationElement = document.createElement('div');
        notificationElement.className = `notification ${type}`;
        
        // Determine icon based on type
        let iconClass;
        switch (type) {
            case 'success': iconClass = 'fas fa-check-circle'; break;
            case 'warning': iconClass = 'fas fa-exclamation-triangle'; break;
            case 'error': iconClass = 'fas fa-times-circle'; break;
            default: iconClass = 'fas fa-info-circle'; // info
        }
        
        // Build action button if provided
        let actionHtml = '';
        if (action) {
            actionHtml = `
                <div class="mt-2">
                    <button class="px-3 py-1 bg-white border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50 notification-action">
                        ${action.label}
                    </button>
                </div>
            `;
        }
        
        // Set content
        notificationElement.innerHTML = `
            <div class="notification-icon ${type}">
                <i class="${iconClass}"></i>
            </div>
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-message">${message}</div>
                ${actionHtml}
            </div>
            <button class="notification-close">
                <i class="fas fa-times"></i>
            </button>
            ${duration > 0 ? `<div class="notification-progress" style="width: 100%;"></div>` : ''}
        `;
        
        // Add to container
        container.appendChild(notificationElement);
        
        // Set up event handlers
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
        
        // Show with animation
        requestAnimationFrame(() => {
            notificationElement.classList.add('show');
            
            // Set up progress bar animation if duration > 0
            if (duration > 0) {
                const progressBar = notificationElement.querySelector('.notification-progress');
                if (progressBar) {
                    progressBar.style.transition = `width ${duration}ms linear`;
                    
                    // Start progress animation in next frame
                    requestAnimationFrame(() => {
                        progressBar.style.width = '0%';
                    });
                }
                
                // Auto-close after duration
                setTimeout(() => {
                    if (notificationElement.parentNode) {
                        this.closeNotification(notificationElement);
                    }
                }, duration);
            }
        });
        
        return notificationElement;
    }
    
    /**
     * Close a notification with animation
     * @param {HTMLElement} element - The notification element
     */
    closeNotification(element) {
        // Animate exit
        element.classList.remove('show');
        
        // Remove after animation completes
        setTimeout(() => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        }, 300);
    }
    
    /**
     * ==============================================
     * DATA EXPORT FUNCTIONALITY
     * ==============================================
     */
    
    /**
     * Export tickets to CSV
     */
    exportToCSV() {
        // Show loading notification
        const notification = this.showNotification({
            title: 'Exportando datos',
            message: 'Preparando archivo CSV, espere un momento...',
            type: 'info',
            duration: 0
        });
        
        // Use setTimeout to avoid blocking UI
        setTimeout(() => {
            try {
                // Determine which data to export
                const results = this.appState.searchResults.length > 0 
                    ? this.appState.searchResults 
                    : this.appState.allTickets;
                
                if (results.length === 0) {
                    this.showNotification({
                        title: 'Exportación cancelada',
                        message: 'No hay datos disponibles para exportar',
                        type: 'warning',
                        duration: 5000
                    });
                    
                    if (notification && notification.parentNode) {
                        this.closeNotification(notification);
                    }
                    
                    return;
                }
                
                // Process in batches for large datasets
                const processInBatches = (data, processCallback, finalCallback, batchSize = 100) => {
                    let index = 0;
                    
                    function processNextBatch() {
                        const batch = data.slice(index, index + batchSize);
                        index += batchSize;
                        
                        if (batch.length > 0) {
                            processCallback(batch);
                            
                            // Update progress
                            const progress = Math.min(100, Math.round(index / data.length * 100));
                            if (notification) {
                                const progressBar = notification.querySelector('.notification-progress');
                                if (progressBar) {
                                    progressBar.style.width = `${progress}%`;
                                }
                            }
                            
                            // Process next batch asynchronously
                            setTimeout(processNextBatch, 0);
                        } else {
                            finalCallback();
                        }
                    }
                    
                    processNextBatch();
                };
                
                // Add progress bar to notification
                if (notification) {
                    const contentEl = notification.querySelector('.notification-message');
                    if (contentEl) {
                        contentEl.innerHTML = `
                            <div class="mb-1">Procesando ${results.length} registros...</div>
                            <div class="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                                <div class="notification-progress bg-blue-600 h-2.5 rounded-full" style="width: 0%"></div>
                            </div>
                        `;
                    }
                }
                
                // Get all unique columns
                const allColumns = new Set();
                
                processInBatches(
                    results,
                    (batch) => {
                        // Collect columns
                        batch.forEach(ticket => {
                            Object.keys(ticket).forEach(key => {
                                if (key !== 'category') { // Exclude custom category
                                    allColumns.add(key);
                                }
                            });
                        });
                    },
                    () => {
                        // Convert to array and sort columns
                        const columns = Array.from(allColumns).sort();
                        
                        // Create CSV header
                        let csv = columns.map(col => `"${col}"`).join(',') + '\n';
                        
                        // Generate CSV in batches
                        let csvChunks = [];
                        
                        processInBatches(
                            results,
                            (batch) => {
                                let chunkCsv = '';
                                
                                // Add rows from current batch
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
                                // Join all chunks
                                csv += csvChunks.join('');
                                
                                // Create blob and download
                                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                
                                link.setAttribute('href', url);
                                link.setAttribute('download', 'tickets_export_' + new Date().toISOString().slice(0, 10) + '.csv');
                                link.style.visibility = 'hidden';
                                
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                
                                // Free memory
                                URL.revokeObjectURL(url);
                                csvChunks = null;
                                
                                // Show success notification
                                this.showNotification({
                                    title: 'Exportación completada',
                                    message: `Se han exportado ${results.length} registros exitosamente.`,
                                    type: 'success',
                                    duration: 5000
                                });
                                
                                // Close progress notification
                                if (notification && notification.parentNode) {
                                    this.closeNotification(notification);
                                }
                            }
                        );
                    }
                );
            } catch (error) {
                console.error('Error en exportación:', error);
                
                this.showNotification({
                    title: 'Error de exportación',
                    message: `No se pudo completar la exportación: ${error.message}`,
                    type: 'error',
                    duration: 5000
                });
                
                // Cerrar notificación de progreso
                if (notification && notification.parentNode) {
                    this.closeNotification(notification);
                }
            }
        }, 100);
    }
}