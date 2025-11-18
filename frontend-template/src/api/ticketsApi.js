// api/ticketsApi.js - Endpoints de Tickets

import api from './index';

export const ticketsApi = {
    /**
     * Obtener todos los tickets
     * @returns {Promise} - Datos de todos los tickets
     */
    getAll: () => api.get('/api/tickets'),

    /**
     * Obtener tickets mejorados (optimizado con Redis)
     * @returns {Promise} - Datos de tickets optimizados
     */
    getImproved: () => api.get('/api/tickets/improved'),

    /**
     * Obtener tickets por tipo
     * @param {string} type - Tipo: 'nuevos', 'espera', 'en_curso', 'resueltos'
     * @returns {Promise} - Tickets del tipo especificado
     */
    getByType: (type) => api.get('/api/tickets', { params: { tipo: type } }),

    /**
     * Obtener estadísticas de tickets
     * @returns {Promise} - Estadísticas históricas
     */
    getStats: () => api.get('/api/tickets/stats'),

    /**
     * Filtrar tickets
     * @param {object} filters - Filtros a aplicar
     * @returns {Promise} - Tickets filtrados
     */
    filter: (filters) => api.get('/api/tickets', { params: filters })
};
