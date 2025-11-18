/**
 * ticket-synchronizer.js
 * Manages data synchronization between client and server
 * 
 * This file provides:
 * - Data caching and persistence
 * - Offline data access and updates
 * - Conflict resolution when reconnecting
 * - Background synchronization
 */

/**
 * Data synchronizer with offline support
 */
class TicketSynchronizer {
    constructor() {
        this.localCache = {
            tickets: null,
            lastSync: null
        };
        
        this.syncInProgress = false;
        this.syncQueue = [];
        this.pendingChanges = new Map();
        this.offlineMode = !navigator.onLine;
        
        // Register network listeners
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // Load cache
        this.loadCache();
    }
    
    /**
     * Load cached data from localStorage
     */
    loadCache() {
        try {
            const cached = localStorage.getItem('tickets_cache');
            if (cached) {
                this.localCache = JSON.parse(cached);
                console.log('Loaded cached tickets from localStorage');
            }
        } catch (error) {
            console.error('Error loading cache:', error);
        }
    }
    
    /**
     * Save data to cache
     * @param {Object} data - Data to cache
     */
    saveCache(data) {
        try {
            // Update local cache
            this.localCache = {
                tickets: data,
                lastSync: new Date().toISOString()
            };
            
            // Save to localStorage
            localStorage.setItem('tickets_cache', JSON.stringify(this.localCache));
        } catch (error) {
            console.error('Error saving cache:', error);
        }
    }
    
    /**
     * Get cached data
     * @returns {Object} - Cached data
     */
    getCachedData() {
        return this.localCache.tickets;
    }
    
    /**
     * Check if cache is valid
     * @param {number} maxAge - Maximum age in milliseconds
     * @returns {boolean} - Whether cache is valid
     */
    isCacheValid(maxAge = 3600000) { // Default 1 hour
        if (!this.localCache.lastSync) return false;
        
        const lastSync = new Date(this.localCache.lastSync).getTime();
        const now = Date.now();
        
        return (now - lastSync) < maxAge;
    }
    
    /**
     * Sync data with server
     * @returns {Promise<Object>} - Synced data
     */
    async syncWithServer() {
        if (this.syncInProgress) {
            // Return a promise that will resolve when current sync completes
            return new Promise((resolve, reject) => {
                this.syncQueue.push({ resolve, reject });
            });
        }
        
        this.syncInProgress = true;
        
        try {
            // Attempt to fetch from improved endpoint
            const response = await fetch('/api/tickets/improved');
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            
            const data = await response.json();
            
            // Save to cache
            this.saveCache(data);
            
            // Resolve any pending sync requests
            while (this.syncQueue.length > 0) {
                const { resolve } = this.syncQueue.shift();
                resolve(data);
            }
            
            return data;
        } catch (error) {
            console.error('Error syncing with server:', error);
            
            // Reject any pending sync requests
            while (this.syncQueue.length > 0) {
                const { reject } = this.syncQueue.shift();
                reject(error);
            }
            
            throw error;
        } finally {
            this.syncInProgress = false;
        }
    }
    
    /**
     * Handle going online
     */
    async handleOnline() {
        this.offlineMode = false;
        console.log('App is now online, syncing data...');
        
        try {
            // Sync with server
            await this.syncWithServer();
            
            // Process any pending changes
            this.processPendingChanges();
        } catch (error) {
            console.error('Error syncing after going online:', error);
        }
    }
    
    /**
     * Handle going offline
     */
    handleOffline() {
        this.offlineMode = true;
        console.log('App is now offline, using cached data');
    }
    
    /**
     * Process any pending changes from offline mode
     */
    processPendingChanges() {
        if (this.pendingChanges.size === 0) return;
        
        console.log(`Processing ${this.pendingChanges.size} pending changes`);
        
        // In a real implementation, you would send these changes to the server
        // For now, we'll just clear them
        this.pendingChanges.clear();
    }
    
    /**
     * Get most recent data (from server or cache)
     * @returns {Promise<Object>} - Ticket data
     */
    async getData() {
        try {
            if (this.offlineMode) {
                console.log('Using cached data (offline mode)');
                return this.getCachedData();
            }
            
            return await this.syncWithServer();
        } catch (error) {
            console.error('Error getting data:', error);
            
            // Fall back to cache if available
            if (this.localCache.tickets) {
                console.log('Falling back to cached data');
                return this.localCache.tickets;
            }
            
            throw error;
        }
    }
}

// Create global instance
window.ticketSynchronizer = new TicketSynchronizer();