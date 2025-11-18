/**
 * ticket-utilities.js
 * Utility functions and helpers for the SENASA Ticket Tracking System
 * 
 * This file provides:
 * - Redis helpers
 * - Date/time formatting utilities
 * - Data transformation helpers
 * - Performance optimizations
 */

/**
 * Check if Redis is available and functioning
 * @async
 * @returns {Promise<boolean>} - Whether Redis is available
 */
async function checkRedisAvailability() {
    try {
        // Try to fetch status via API endpoint
        const response = await fetch('/api/system/redis-status');
        if (!response.ok) return false;
        
        const data = await response.json();
        return data.status === 'available';
    } catch (error) {
        console.error('Error checking Redis availability:', error);
        return false;
    }
}

/**
 * Optimize data before sending to server
 * @param {Object} data - Data to optimize
 * @returns {Object} - Optimized data
 */
function optimizeData(data) {
    // Create a shallow copy to avoid modifying original
    const optimized = { ...data };
    
    // Remove any circular references
    const seen = new WeakSet();
    const stringifyReplacer = (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return '[Circular]';
            }
            seen.add(value);
        }
        return value;
    };
    
    // Test for circular references and simplify
    try {
        JSON.stringify(optimized, stringifyReplacer);
    } catch (e) {
        console.error('Error optimizing data, simplifying:', e);
        // If error, create a simplified version
        return {
            nuevos: data.nuevos?.map(simplifyTicket) || [],
            en_curso: data.en_curso?.map(simplifyTicket) || [],
            espera: data.espera?.map(simplifyTicket) || [],
            resueltos: data.resueltos?.map(simplifyTicket) || [],
            last_update: data.last_update
        };
    }
    
    return optimized;
}

/**
 * Simplify a ticket object for storage
 * @param {Object} ticket - Ticket to simplify
 * @returns {Object} - Simplified ticket
 */
function simplifyTicket(ticket) {
    // Extract only essential fields
    const {
        ticket_id, ID, Título, Estado, Entidad, 
        Solicitante, Asignado_a, Categoria, 
        Fecha_apertura, Ultima_modificacion, Prioridad
    } = ticket;
    
    return {
        ticket_id: ticket_id || ID,
        ID: ID || ticket_id,
        Título, Estado, Entidad, Solicitante, 
        Asignado_a, Categoria, Fecha_apertura, 
        Ultima_modificacion, Prioridad
    };
}

/**
 * Calculate statistics from ticket data
 * @param {Object} data - Ticket data
 * @returns {Object} - Calculated statistics
 */
function calculateStats(data) {
    // Calculate basic counts
    const stats = {
        total: 0,
        byCategory: {
            nuevos: data.nuevos?.length || 0,
            espera: data.espera?.length || 0,
            en_curso: data.en_curso?.length || 0,
            resueltos: data.resueltos?.length || 0
        },
        byEntity: {},
        byTechnician: {},
        averageResolutionTime: null
    };
    
    // Calculate total
    stats.total = stats.byCategory.nuevos + 
                 stats.byCategory.espera + 
                 stats.byCategory.en_curso + 
                 stats.byCategory.resueltos;
    
    // Process all tickets into one array for further analysis
    const allTickets = [
        ...(data.nuevos || []),
        ...(data.en_curso || []),
        ...(data.espera || []),
        ...(data.resueltos || [])
    ];
    
    // Count by entity
    allTickets.forEach(ticket => {
        const entity = ticket.Entidad || 'Desconocida';
        stats.byEntity[entity] = (stats.byEntity[entity] || 0) + 1;
        
        const tech = ticket.Asignado_a || 'Sin asignar';
        stats.byTechnician[tech] = (stats.byTechnician[tech] || 0) + 1;
    });
    
    // Calculate average resolution time for resolved tickets
    const resolvedTickets = data.resueltos || [];
    if (resolvedTickets.length > 0) {
        let totalTime = 0;
        let validTimeTickets = 0;
        
        resolvedTickets.forEach(ticket => {
            // Only consider tickets with both dates
            if (ticket.Fecha_apertura && ticket.Ultima_modificacion) {
                try {
                    const startDate = new Date(ticket.Fecha_apertura);
                    const endDate = new Date(ticket.Ultima_modificacion);
                    
                    // Check if dates are valid
                    if (!isNaN(startDate) && !isNaN(endDate)) {
                        const timeDiff = endDate - startDate;
                        totalTime += timeDiff;
                        validTimeTickets++;
                    }
                } catch (e) {
                    // Skip if date parsing fails
                }
            }
        });
        
        if (validTimeTickets > 0) {
            // Calculate average in milliseconds then convert to hours
            const avgMs = totalTime / validTimeTickets;
            stats.averageResolutionTime = avgMs / (1000 * 60 * 60); // Convert to hours
        }
    }
    
    return stats;
}

/**
 * Generate a hash for a value
 * @param {any} value - Value to hash
 * @returns {string} - Hash string
 */
function generateHash(value) {
    try {
        // Simple hash function for client-side use
        if (typeof value === 'object') {
            value = JSON.stringify(value);
        } else {
            value = String(value);
        }
        
        let hash = 0;
        for (let i = 0; i < value.length; i++) {
            const char = value.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        return hash.toString(16);
    } catch (e) {
        console.error('Error generating hash:', e);
        return Math.random().toString(36).substring(2);
    }
}

/**
 * Sort tickets by update time (newest first)
 * @param {Array} tickets - Tickets to sort
 * @returns {Array} - Sorted tickets
 */
function sortTicketsByUpdateTime(tickets) {
    return [...tickets].sort((a, b) => {
        // Get update times
        const timeA = a.Ultima_modificacion ? new Date(a.Ultima_modificacion).getTime() : 0;
        const timeB = b.Ultima_modificacion ? new Date(b.Ultima_modificacion).getTime() : 0;
        
        // Sort in descending order (newest first)
        return timeB - timeA;
    });
}

/**
 * Group tickets by a property
 * @param {Array} tickets - Tickets to group
 * @param {string} property - Property to group by
 * @returns {Object} - Grouped tickets
 */
function groupTicketsBy(tickets, property) {
    return tickets.reduce((groups, ticket) => {
        const value = ticket[property] || 'Desconocido';
        groups[value] = groups[value] || [];
        groups[value].push(ticket);
        return groups;
    }, {});
}

/**
 * Get color code for ticket state
 * @param {string} state - Ticket state/category
 * @returns {string} - CSS color
 */
function getStateColor(state) {
    switch (state) {
        case 'nuevos':
            return '#0ea5e9'; // Blue
        case 'espera':
            return '#f59e0b'; // Amber
        case 'curso':
        case 'en_curso':
            return '#3b82f6'; // Blue
        case 'resueltos':
            return '#10b981'; // Green
        default:
            return '#6b7280'; // Gray
    }
}

/**
 * Measure function execution time
 * @param {Function} fn - Function to measure
 * @param {...any} args - Arguments to pass to function
 * @returns {any} - Function result
 */
function measurePerformance(fn, ...args) {
    const start = performance.now();
    const result = fn(...args);
    const end = performance.now();
    
    console.log(`${fn.name || 'Function'} execution time: ${end - start}ms`);
    return result;
}

// Export utilities to global scope for legacy compatibility
window.checkRedisAvailability = checkRedisAvailability;
window.optimizeData = optimizeData;
window.simplifyTicket = simplifyTicket;
window.calculateStats = calculateStats;
window.generateHash = generateHash;
window.sortTicketsByUpdateTime = sortTicketsByUpdateTime;
window.groupTicketsBy = groupTicketsBy;
window.getStateColor = getStateColor;
window.measurePerformance = measurePerformance;