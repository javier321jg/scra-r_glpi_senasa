/**
 * socket-connector.js
 * Improved WebSocket connection management with Redis support
 * 
 * This file provides:
 * - Enhanced WebSocket connection management
 * - Automatic retries and fallbacks
 * - Redis channel subscriptions
 * - Offline detection and recovery
 */

/**
 * Socket connector with improved reliability
 */
class SocketConnector {
    constructor(options = {}) {
        this.options = {
            url: window.location.origin,
            reconnectionAttempts: 5,
            reconnectionDelay: 3000,
            maxReconnectionDelay: 30000,
            timeout: 10000,
            autoConnect: true,
            ...options
        };
        
        this.socket = null;
        this.retries = 0;
        this.connected = false;
        this.connecting = false;
        this.listeners = {};
        this.reconnectTimer = null;
        this.healthCheckTimer = null;
        this.online = navigator.onLine;
        
        // Bind methods
        this._onConnect = this._onConnect.bind(this);
        this._onDisconnect = this._onDisconnect.bind(this);
        this._onError = this._onError.bind(this);
        this._onMessage = this._onMessage.bind(this);
        this._onOnline = this._onOnline.bind(this);
        this._onOffline = this._onOffline.bind(this);
        
        // Set up network detection
        window.addEventListener('online', this._onOnline);
        window.addEventListener('offline', this._onOffline);
        
        // Auto connect if enabled
        if (this.options.autoConnect) {
            this.connect();
        }
    }
    
    /**
     * Connect to the WebSocket server
     */
    connect() {
        if (this.connected || this.connecting) return;
        
        this.connecting = true;
        
        try {
            // Create socket instance
            this.socket = io(this.options.url, {
                reconnectionAttempts: this.options.reconnectionAttempts,
                timeout: this.options.timeout,
                transports: ['websocket', 'polling']
            });
            
            // Set up event handlers
            this.socket.on('connect', this._onConnect);
            this.socket.on('disconnect', this._onDisconnect);
            this.socket.on('connect_error', this._onError);
            this.socket.on('error', this._onError);
            
            // Set up message handlers
            this.socket.on('tickets_update', data => this._onMessage('tickets_update', data));
            this.socket.on('processing_update', data => this._onMessage('processing_update', data));
            
            // Redis specific handlers
            this.socket.on('tickets:updates', data => this._onMessage('redis_update', data));
            this.socket.on('tickets:raw', data => this._onMessage('redis_raw', data));
            
            // Start health check timer
            this._startHealthCheck();
        } catch (error) {
            console.error('Error creating socket connection:', error);
            this.connecting = false;
            this._scheduleReconnect();
        }
    }
    
    /**
     * Disconnect from the WebSocket server
     */
    disconnect() {
        if (!this.socket) return;
        
        try {
            // Clear timers
            clearTimeout(this.reconnectTimer);
            clearInterval(this.healthCheckTimer);
            
            // Remove event listeners
            this.socket.off('connect', this._onConnect);
            this.socket.off('disconnect', this._onDisconnect);
            this.socket.off('connect_error', this._onError);
            this.socket.off('error', this._onError);
            
            // Disconnect socket
            this.socket.disconnect();
            this.socket = null;
            
            // Update state
            this.connected = false;
            this.connecting = false;
            
            // Emit state change
            this._emitEvent('disconnected', { reason: 'manual' });
        } catch (error) {
            console.error('Error disconnecting socket:', error);
        }
    }
    
    /**
     * Add event listener
     * @param {string} eventName - Event name
     * @param {Function} callback - Event callback
     */
    on(eventName, callback) {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        
        this.listeners[eventName].push(callback);
    }
    
    /**
     * Remove event listener
     * @param {string} eventName - Event name
     * @param {Function} callback - Event callback
     */
    off(eventName, callback) {
        if (!this.listeners[eventName]) return;
        
        this.listeners[eventName] = this.listeners[eventName].filter(cb => cb !== callback);
    }
    
    /**
     * Emit event to listeners
     * @param {string} eventName - Event name
     * @param {Object} data - Event data
     * @private
     */
    _emitEvent(eventName, data) {
        if (!this.listeners[eventName]) return;
        
        this.listeners[eventName].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in ${eventName} listener:`, error);
            }
        });
    }
    
    /**
     * Handle socket connection
     * @private
     */
    _onConnect() {
        this.connected = true;
        this.connecting = false;
        this.retries = 0;
        
        console.log('Socket connected');
        
        // Start health check
        this._startHealthCheck();
        
        // Emit connected event
        this._emitEvent('connected', { timestamp: new Date() });
    }
    
    /**
     * Handle socket disconnection
     * @param {string} reason - Disconnection reason
     * @private
     */
    _onDisconnect(reason) {
        this.connected = false;
        this.connecting = false;
        
        console.log(`Socket disconnected: ${reason}`);
        
        // Emit disconnected event
        this._emitEvent('disconnected', { reason });
        
        // Schedule reconnect if not manual
        if (reason !== 'io client disconnect') {
            this._scheduleReconnect();
        }
    }
    
    /**
     * Handle connection error
     * @param {Error} error - Error object
     * @private
     */
    _onError(error) {
        this.connecting = false;
        console.error('Socket connection error:', error);
        
        // Emit error event
        this._emitEvent('error', { error });
        
        // Schedule reconnect
        this._scheduleReconnect();
    }
    
    /**
     * Handle incoming message
     * @param {string} channel - Message channel
     * @param {Object} data - Message data
     * @private
     */
    _onMessage(channel, data) {
        // Emit channel specific event
        this._emitEvent(channel, data);
        
        // Also emit generic message event
        this._emitEvent('message', { channel, data });
    }
    
    /**
     * Handle online event
     * @private
     */
    _onOnline() {
        this.online = true;
        
        console.log('Browser online, attempting to reconnect socket');
        
        // Emit online event
        this._emitEvent('online', { timestamp: new Date() });
        
        // Try to reconnect immediately
        if (!this.connected && !this.connecting) {
            this.connect();
        }
    }
    
    /**
     * Handle offline event
     * @private
     */
    _onOffline() {
        this.online = false;
        
        console.log('Browser offline, socket connections will be paused');
        
        // Emit offline event
        this._emitEvent('offline', { timestamp: new Date() });
    }
    
    /**
     * Schedule reconnection attempt
     * @private
     */
    _scheduleReconnect() {
        // Clear existing timer
        clearTimeout(this.reconnectTimer);
        
        // Don't reconnect if not online
        if (!this.online) {
            console.log('Not scheduling reconnect while offline');
            return;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
            this.options.reconnectionDelay * Math.pow(1.5, this.retries),
            this.options.maxReconnectionDelay
        );
        
        this.retries++;
        
        // Schedule reconnect
        console.log(`Scheduling socket reconnect in ${delay}ms (attempt ${this.retries})`);
        
        this.reconnectTimer = setTimeout(() => {
            if (!this.connected && !this.connecting) {
                this.connect();
            }
        }, delay);
    }
    
    /**
     * Start health check timer
     * @private
     */
    _startHealthCheck() {
        // Clear existing timer
        clearInterval(this.healthCheckTimer);
        
        // Set up new timer
        this.healthCheckTimer = setInterval(() => {
            if (!this.socket) return;
            
            // Check if socket is actually connected
            if (this.connected && this.socket.disconnected) {
                console.warn('Socket reports connected but is actually disconnected, reconnecting');
                this.disconnect();
                this.connect();
            }
            
            // Ping server to keep connection alive
            if (this.connected) {
                try {
                    this.socket.emit('ping', { timestamp: Date.now() });
                } catch (error) {
                    console.error('Error pinging server:', error);
                }
            }
        }, 30000); // Check every 30 seconds
    }
    
    /**
     * Manually trigger a reconnection
     */
    reconnect() {
        if (this.connected) {
            this.disconnect();
        }
        
        // Reset retries
        this.retries = 0;
        
        // Connect immediately
        setTimeout(() => {
            this.connect();
        }, 100);
    }
    
    /**
     * Get current connection state
     * @returns {Object} - Connection state
     */
    getState() {
        return {
            connected: this.connected,
            connecting: this.connecting,
            online: this.online,
            retries: this.retries
        };
    }
    
    /**
     * Check if a channel is available
     * @param {string} channel - Channel name to check
     * @returns {boolean} - Whether the channel is available
     */
    isChannelAvailable(channel) {
        if (!this.socket || !this.connected) return false;
        
        // Check if this channel has any server-side handlers
        try {
            return this.socket.hasListeners(channel);
        } catch (error) {
            // If error, assume channel is not available
            return false;
        }
    }
}

// Create global instance for use throughout the app
window.socketConnector = new SocketConnector();