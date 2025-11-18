// hooks/useTickets.js - Hook personalizado para gestionar tickets

import { useState, useEffect, useCallback } from 'react';
import { ticketsApi } from '../api/ticketsApi';
import webSocketService from '../api/websocket';

/**
 * Hook que gestiona los tickets con actualización en tiempo real vía WebSocket
 * @returns {object} - { tickets, loading, error, refetch }
 */
export const useTickets = () => {
    const [tickets, setTickets] = useState({
        nuevos: [],
        espera: [],
        en_curso: [],
        resueltos: [],
        lastUpdate: null
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [connected, setConnected] = useState(false);

    // Obtener tickets iniciales
    useEffect(() => {
        fetchTickets();

        // Conectar WebSocket para actualizaciones en tiempo real
        webSocketService.connect();
        setConnected(webSocketService.isConnected());

        // Listener para actualizaciones en tiempo real
        const handleUpdate = (data) => {
            console.log('📡 Actualización de tickets recibida');
            setTickets(data);
        };

        webSocketService.onTicketsUpdate(handleUpdate);

        // Cleanup
        return () => {
            webSocketService.off('tickets_update');
        };
    }, []);

    /**
     * Obtener tickets desde el servidor
     */
    const fetchTickets = useCallback(async () => {
        setLoading(true);
        try {
            const response = await ticketsApi.getImproved();
            setTickets(response.data);
            setError(null);
        } catch (err) {
            console.error('Error fetching tickets:', err);
            setError(err.message || 'Error al obtener tickets');
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Obtener tickets de un tipo específico
     * @param {string} type - Tipo de ticket
     */
    const fetchByType = useCallback(async (type) => {
        setLoading(true);
        try {
            const response = await ticketsApi.getByType(type);
            setError(null);
            return response.data.tickets;
        } catch (err) {
            setError(err.message);
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Obtener estadísticas
     */
    const fetchStats = useCallback(async () => {
        try {
            const response = await ticketsApi.getStats();
            return response.data.stats;
        } catch (err) {
            console.error('Error fetching stats:', err);
            return [];
        }
    }, []);

    return {
        tickets,
        loading,
        error,
        connected,
        refetch: fetchTickets,
        fetchByType,
        fetchStats
    };
};
