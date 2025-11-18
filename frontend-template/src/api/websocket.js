// api/websocket.js - Servicio de WebSocket con Socket.IO

import io from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

class WebSocketService {
    constructor() {
        this.socket = null;
        this.connected = false;
    }

    /**
     * Conectar al servidor WebSocket
     */
    connect() {
        if (this.socket) return;

        this.socket = io(SOCKET_URL, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
            transports: ['websocket', 'polling']
        });

        // Eventos de conexión
        this.socket.on('connect', () => {
            console.log('✅ Conectado al servidor WebSocket');
            this.connected = true;
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Desconectado del servidor WebSocket');
            this.connected = false;
        });

        this.socket.on('error', (error) => {
            console.error('⚠️ Error de WebSocket:', error);
        });
    }

    /**
     * Escuchar actualizaciones de tickets
     * @param {function} callback - Función a ejecutar cuando haya cambios
     */
    onTicketsUpdate(callback) {
        if (!this.socket) this.connect();
        this.socket.on('tickets_update', callback);
    }

    /**
     * Escuchar notificaciones de procesamiento
     * @param {function} callback - Función a ejecutar
     */
    onProcessingUpdate(callback) {
        if (!this.socket) this.connect();
        this.socket.on('processing_update', callback);
    }

    /**
     * Desuscribirse de un evento
     * @param {string} eventName - Nombre del evento
     */
    off(eventName) {
        if (this.socket) {
            this.socket.off(eventName);
        }
    }

    /**
     * Desconectar del servidor
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.connected = false;
        }
    }

    /**
     * Verificar si está conectado
     * @returns {boolean}
     */
    isConnected() {
        return this.connected && this.socket?.connected;
    }
}

export default new WebSocketService();
