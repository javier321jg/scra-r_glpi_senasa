// Script para el sistema de visualización de tickets
document.addEventListener('DOMContentLoaded', function() {
    // Configuraciones iniciales
    const apiBaseUrl = '/api/tickets/improved';
    let currentTicketsData = {};
    
    // Elementos DOM
    const searchResults = document.getElementById('searchResults');
    const searchStatus = document.getElementById('searchStatus');
    const searchQuery = document.getElementById('searchQuery');
    const searchField = document.getElementById('searchField');
    const totalResultsElements = document.querySelectorAll('#totalResults');
    const lastUpdateElement = document.getElementById('last-update');
    const loadingElement = document.getElementById('loading');
    
    // Contadores de estadísticas
    const counters = {
        nuevos: document.getElementById('counter-nuevos'),
        espera: document.getElementById('counter-espera'),
        curso: document.getElementById('counter-curso'),
        resueltos: document.getElementById('counter-resueltos')
    };
    
    // Socket.io para actualizaciones en tiempo real
    const socket = io();
    
    // Manejadores de eventos de Socket.io
    socket.on('connect', function() {
        updateConnectionStatus(true);
        console.log('Conectado al servidor');
    });
    
    socket.on('disconnect', function() {
        updateConnectionStatus(false);
        console.log('Desconectado del servidor');
    });
    
    socket.on('tickets_update', function(data) {
        console.log('Recibida actualización de tickets');
        processTicketsUpdate(data);
    });
    
    // Función para actualizar el estado de conexión
    function updateConnectionStatus(connected) {
        const connectionStatus = document.getElementById('connectionStatus');
        if (connectionStatus) {
            if (connected) {
                connectionStatus.classList.remove('bg-red-500');
                connectionStatus.classList.add('bg-green-500');
                connectionStatus.textContent = 'Conectado';
            } else {
                connectionStatus.classList.remove('bg-green-500');
                connectionStatus.classList.add('bg-red-500');
                connectionStatus.textContent = 'Desconectado';
            }
        }
    }
    
    // Función para procesar actualización de tickets
    function processTicketsUpdate(data) {
        if (!data) return;
        
        // Actualizar contadores
        if (data.counts) {
            if (counters.nuevos) counters.nuevos.textContent = data.counts.nuevos || 0;
            if (counters.espera) counters.espera.textContent = data.counts.espera || 0;
            if (counters.curso) counters.curso.textContent = data.counts.en_curso || 0;
            if (counters.resueltos) counters.resueltos.textContent = data.counts.resueltos || 0;
        }
        
        // Actualizar total de resultados
        totalResultsElements.forEach(el => {
            const total = (data.tickets ? data.tickets.length : 0);
            el.textContent = total;
        });
        
        // Actualizar última fecha de actualización
        if (lastUpdateElement && data.last_update) {
            lastUpdateElement.textContent = `Última actualización: ${data.last_update}`;
        }
        
        // Guardar datos para referencia futura
        currentTicketsData = data;
        
        // Renderizar tickets si se están mostrando resultados
        if (searchResults) {
            renderTickets(data.tickets || []);
        }
    }
    
    // Función para renderizar tickets en la interfaz
    function renderTickets(tickets, filter = '') {
        if (!searchResults) return;
        
        // Mostrar indicador de carga
        if (loadingElement) loadingElement.style.display = 'block';
        
        // Limpiar resultados anteriores
        searchResults.innerHTML = '';
        
        // Filtrar tickets si hay un término de búsqueda
        let filteredTickets = tickets;
        if (filter && filter.trim() !== '') {
            const filterLower = filter.toLowerCase();
            const searchIn = searchField.value || 'all';
            
            filteredTickets = tickets.filter(ticket => {
                if (searchIn === 'all') {
                    // Buscar en todos los campos
                    return Object.values(ticket).some(val => 
                        val && val.toString().toLowerCase().includes(filterLower)
                    );
                } else {
                    // Buscar en campo específico
                    return ticket[searchIn] && 
                           ticket[searchIn].toString().toLowerCase().includes(filterLower);
                }
            });
        }
        
        // Actualizar status de búsqueda
        if (searchStatus) {
            if (filteredTickets.length === 0) {
                searchStatus.textContent = filter 
                    ? `No se encontraron tickets para "${filter}"`
                    : 'No hay tickets disponibles';
            } else {
                searchStatus.textContent = filter 
                    ? `Se encontraron ${filteredTickets.length} tickets para "${filter}"`
                    : `Mostrando ${filteredTickets.length} tickets`;
            }
        }
        
        // Actualizar contador de resultados
        totalResultsElements.forEach(el => {
            el.textContent = filteredTickets.length;
        });
        
        // Renderizar cada ticket
        filteredTickets.forEach(ticket => {
            const ticketCard = createTicketCard(ticket);
            searchResults.appendChild(ticketCard);
        });
        
        // Ocultar indicador de carga
        if (loadingElement) loadingElement.style.display = 'none';
    }
    
    // Función para crear una tarjeta de ticket
    function createTicketCard(ticket) {
        // Determinar el estado para aplicar estilos
        let statusClass = '';
        let statusBadge = '';
        
        switch ((ticket.Estado || '').toLowerCase()) {
            case 'nuevo':
                statusClass = 'status-new';
                statusBadge = '<span class="ticket-badge bg-info"><i class="fas fa-plus-circle"></i> Nuevo</span>';
                break;
            case 'en espera':
                statusClass = 'status-waiting';
                statusBadge = '<span class="ticket-badge bg-warning"><i class="fas fa-clock"></i> En Espera</span>';
                break;
            case 'en curso':
            case 'procesando':
                statusClass = 'status-inprogress';
                statusBadge = '<span class="ticket-badge bg-primary"><i class="fas fa-cogs"></i> En Curso</span>';
                break;
            case 'resuelto':
                statusClass = 'status-resolved';
                statusBadge = '<span class="ticket-badge bg-success"><i class="fas fa-check-circle"></i> Resuelto</span>';
                break;
            default:
                statusClass = 'status-new';
                statusBadge = '<span class="ticket-badge bg-info"><i class="fas fa-ticket-alt"></i> Ticket</span>';
        }
        
        // Formatear el título para mostrar correctamente
        const title = ticket.Título || ticket.titulo || 'Sin información';
        
        // Crear elemento de tarjeta de ticket
        const ticketDiv = document.createElement('div');
        ticketDiv.className = `ticket-card p-4 ${statusClass} animate-fade-in-up`;
        ticketDiv.setAttribute('data-id', ticket.ID || ticket.ticket_id || '');
        
        // Construir el contenido HTML de la tarjeta
        ticketDiv.innerHTML = `
            <div class="ticket-card-header">
                <div class="flex-1">
                    <div class="ticket-title">
                        ${title}
                        <div class="ticket-title-tooltip">${title}</div>
                    </div>
                </div>
                <div>
                    ${statusBadge}
                </div>
            </div>
            
            <div class="ticket-card-body">
                <div class="ticket-info-grid mt-3">
                    <div class="ticket-info-label">ID:</div>
                    <div class="ticket-info-value">${ticket.ID || ticket.ticket_id || 'N/A'}</div>
                    
                    <div class="ticket-info-label">Solicitante:</div>
                    <div class="ticket-info-value">${ticket.Solicitante || 'No especificado'}</div>
                    
                    <div class="ticket-info-label">Asignado a:</div>
                    <div class="ticket-info-value">${ticket.Asignado_a || 'No asignado'}</div>
                    
                    <div class="ticket-info-label">Fecha Apertura:</div>
                    <div class="ticket-info-value">${ticket.Fecha_apertura || ticket.fecha_apertura || 'No disponible'}</div>
                    
                    <div class="ticket-info-label">Última Actualización:</div>
                    <div class="ticket-info-value">${ticket.Ultima_modificacion || ticket.ultima_modificacion || 'No disponible'}</div>
                </div>
            </div>
            
            <div class="ticket-card-footer">
                <button class="btn-details view-details" data-id="${ticket.ID || ticket.ticket_id || ''}">
                    Ver detalles <i class="fas fa-chevron-right ml-1"></i>
                </button>
            </div>
        `;
        
        // Agregar listener para ver detalles
        const detailsButton = ticketDiv.querySelector('.view-details');
        if (detailsButton) {
            detailsButton.addEventListener('click', function() {
                const ticketId = this.getAttribute('data-id');
                showTicketDetails(ticketId);
            });
        }
        
        return ticketDiv;
    }
    
    // Función para mostrar detalles del ticket
    function showTicketDetails(ticketId) {
        if (!ticketId) return;
        
        // Buscar el ticket en los datos actuales
        const ticket = currentTicketsData.tickets?.find(t => 
            (t.ID === ticketId || t.ticket_id === ticketId)
        );
        
        if (!ticket) {
            console.error(`No se encontró el ticket con ID: ${ticketId}`);
            return;
        }
        
        // Mostrar el modal
        const modal = document.getElementById('ticketDetailsModal');
        const modalLabel = document.getElementById('ticketDetailsModalLabel');
        const modalBody = document.getElementById('ticketDetailsBody');
        
        if (modal && modalLabel && modalBody) {
            modalLabel.textContent = `Detalles del Ticket #${ticketId}`;
            
            // Construir el contenido del modal
            modalBody.innerHTML = `
                <div class="ticket-detail-animate show">
                    <h4 class="text-xl font-bold mb-4 text-blue-700">
                        ${ticket.Título || ticket.titulo || 'Sin información'}
                    </h4>
                    
                    <div class="data-grid mb-6">
                        <div class="data-label">ID:</div>
                        <div class="data-value">${ticket.ID || ticket.ticket_id || 'N/A'}</div>
                        
                        <div class="data-label">Estado:</div>
                        <div class="data-value">${ticket.Estado || 'No especificado'}</div>
                        
                        <div class="data-label">Solicitante:</div>
                        <div class="data-value">${ticket.Solicitante || 'No especificado'}</div>
                        
                        <div class="data-label">Asignado a:</div>
                        <div class="data-value">${ticket.Asignado_a || 'No asignado'}</div>
                        
                        <div class="data-label">Entidad:</div>
                        <div class="data-value">${ticket.Entidad || 'No especificado'}</div>
                        
                        <div class="data-label">Categoría:</div>
                        <div class="data-value">${ticket.Categoria || 'No especificado'}</div>
                        
                        <div class="data-label">Tipo:</div>
                        <div class="data-value">${ticket.Tipo || 'No especificado'}</div>
                        
                        <div class="data-label">Prioridad:</div>
                        <div class="data-value">${ticket.Prioridad || 'Normal'}</div>
                        
                        <div class="data-label">Fecha Apertura:</div>
                        <div class="data-value">${ticket.Fecha_apertura || ticket.fecha_apertura || 'No disponible'}</div>
                        
                        <div class="data-label">Última Modificación:</div>
                        <div class="data-value">${ticket.Ultima_modificacion || ticket.ultima_modificacion || 'No disponible'}</div>
                        
                        <div class="data-label">Tiempo de Resolución:</div>
                        <div class="data-value">${ticket.Tiempo_resolucion || 'No disponible'}</div>
                        
                        <div class="data-label">Duración:</div>
                        <div class="data-value">${ticket.Duracion || 'No disponible'}</div>
                    </div>
                    
                    <!-- Sección de trazabilidad -->
                    <div class="traceability-container mt-6">
                        <h3 class="traceability-title">
                            <i class="fas fa-project-diagram"></i> Trazabilidad del Ticket
                        </h3>
                        
                        <div class="trace-timeline">
                            <div class="trace-line">
                                <div class="trace-progress" style="width: ${getProgressPercentage(ticket.Estado)}%"></div>
                            </div>
                            
                            <div class="trace-steps">
                                <div class="trace-step ${ticket.Estado === 'Nuevo' ? 'step-active' : (isCompletedStep(ticket.Estado, 'Nuevo') ? 'step-completed' : '')}">
                                    <div class="step-icon-container">
                                        <div class="step-indicator">
                                            <i class="fas fa-plus-circle"></i>
                                        </div>
                                        <div class="step-info">Ticket creado el ${ticket.Fecha_apertura || 'N/A'}</div>
                                    </div>
                                    <div class="step-label">Nuevo</div>
                                </div>
                                
                                <div class="trace-step ${ticket.Estado === 'En espera' ? 'step-active' : (isCompletedStep(ticket.Estado, 'En espera') ? 'step-completed' : '')}">
                                    <div class="step-icon-container">
                                        <div class="step-indicator">
                                            <i class="fas fa-clock"></i>
                                        </div>
                                        <div class="step-info">Esperando acción o respuesta</div>
                                    </div>
                                    <div class="step-label">En Espera</div>
                                </div>
                                
                                <div class="trace-step ${ticket.Estado === 'En curso' ? 'step-active' : (isCompletedStep(ticket.Estado, 'En curso') ? 'step-completed' : '')}">
                                    <div class="step-icon-container">
                                        <div class="step-indicator">
                                            <i class="fas fa-cogs"></i>
                                        </div>
                                        <div class="step-info">Trabajando en la resolución</div>
                                    </div>
                                    <div class="step-label">En Curso</div>
                                </div>
                                
                                <div class="trace-step ${ticket.Estado === 'Resuelto' ? 'step-active' : ''}">
                                    <div class="step-icon-container">
                                        <div class="step-indicator">
                                            <i class="fas fa-check-circle"></i>
                                        </div>
                                        <div class="step-info">Problema solucionado</div>
                                    </div>
                                    <div class="step-label">Resuelto</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="trace-dates-info">
                            <div class="trace-date-item">
                                <div class="date-label">Fecha de Apertura</div>
                                <div class="date-value">${ticket.Fecha_apertura || 'No disponible'}</div>
                            </div>
                            <div class="trace-date-item">
                                <div class="date-label">Última Actualización</div>
                                <div class="date-value">${ticket.Ultima_modificacion || 'No disponible'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Mostrar el modal
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }
    
    // Función para determinar el porcentaje de progreso del ticket
    function getProgressPercentage(estado) {
        switch ((estado || '').toLowerCase()) {
            case 'nuevo': return 25;
            case 'en espera': return 50;
            case 'en curso': case 'procesando': return 75;
            case 'resuelto': return 100;
            default: return 10;
        }
    }
    
    // Función para determinar si un paso se completó
    function isCompletedStep(estadoActual, estadoEvaluar) {
        const estados = ['Nuevo', 'En espera', 'En curso', 'Resuelto'];
        const indexActual = estados.findIndex(e => e.toLowerCase() === (estadoActual || '').toLowerCase());
        const indexEvaluar = estados.findIndex(e => e.toLowerCase() === estadoEvaluar.toLowerCase());
        
        return indexActual > indexEvaluar;
    }
    
    // Configurar eventos del formulario de búsqueda
    if (document.getElementById('searchForm')) {
        document.getElementById('searchForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const query = searchQuery.value;
            searchTickets(query);
        });
    }
    
    if (document.getElementById('clearSearch')) {
        document.getElementById('clearSearch').addEventListener('click', function() {
            searchQuery.value = '';
            searchTickets('');
        });
    }
    
    // Función para buscar tickets
    function searchTickets(query) {
        if (currentTicketsData.tickets) {
            renderTickets(currentTicketsData.tickets, query);
        } else {
            // Si no hay datos cargados, obtenerlos primero
            fetchTickets(query);
        }
    }
    
    // Función para obtener tickets del servidor
    function fetchTickets(query = '') {
        // Mostrar indicador de carga
        if (loadingElement) loadingElement.style.display = 'block';
        
        // Construir URL de la API
        const url = `${apiBaseUrl}`;
        
        // Obtener datos
        fetch(url)
            .then(response => response.json())
            .then(data => {
                processTicketsUpdate(data);
                if (query) {
                    renderTickets(data.tickets || [], query);
                }
            })
            .catch(error => {
                console.error('Error obteniendo tickets:', error);
                if (searchStatus) {
                    searchStatus.textContent = 'Error al obtener tickets. Intente nuevamente.';
                }
            })
            .finally(() => {
                // Ocultar indicador de carga
                if (loadingElement) loadingElement.style.display = 'none';
            });
    }
    
    // Inicializar datos al cargar la página
    fetchTickets();
    
    // Actualizar cada 60 segundos
    setInterval(fetchTickets, 60000);
    
    // Event listeners para cerrar modales
    document.querySelectorAll('#closeModal, #closeTechModal').forEach(button => {
        button.addEventListener('click', function() {
            const modalId = this.id === 'closeModal' ? 'ticketDetailsModal' : 'techContactModal';
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        });
    });
    
    // Función para exportar a CSV
    window.exportToCSV = function() {
        if (!currentTicketsData.tickets || currentTicketsData.tickets.length === 0) {
            alert('No hay datos para exportar');
            return;
        }
        
        try {
            const tickets = currentTicketsData.tickets;
            let csv = 'ID,Título,Estado,Solicitante,Asignado a,Fecha Apertura,Última Modificación\n';
            
            for (const ticket of tickets) {
                csv += `"${ticket.ID || ''}","${ticket.Título || ''}","${ticket.Estado || ''}","${ticket.Solicitante || ''}","${ticket.Asignado_a || ''}","${ticket.Fecha_apertura || ''}","${ticket.Ultima_modificacion || ''}"\n`;
            }
            
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `tickets_export_${new Date().toISOString().slice(0,10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Error exportando a CSV:', error);
            alert('Error al exportar datos. Intente nuevamente.');
        }
    };
});