/**
 * Sistema de Trazabilidad de Tickets - SENASA
 * Modificaciones para mejorar funcionalidad y diseño
 */

// Modificación 1: Ordenar tickets por fecha más reciente al cargar la página
function fetchAllTickets() {
    setLoading(true);
    
    // Mostrar overlay de carga
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
    
    // Llamadas a la API para cada tipo de ticket
    Promise.all([
        fetch(`${CONFIG.apiUrl}?tipo=nuevos`).then(res => res.json()),
        fetch(`${CONFIG.apiUrl}?tipo=en_curso`).then(res => res.json()),
        fetch(`${CONFIG.apiUrl}?tipo=espera`).then(res => res.json()),
        fetch(`${CONFIG.apiUrl}?tipo=resueltos`).then(res => res.json())
    ])
    .then(([nuevosData, cursoData, esperaData, resueltosData]) => {
        // Combinar todos los tickets con su categoría
        const allTickets = [
            ...(nuevosData.tickets || []).map(t => ({ ...t, category: 'nuevos' })),
            ...(cursoData.tickets || []).map(t => ({ ...t, category: 'curso' })),
            ...(esperaData.tickets || []).map(t => ({ ...t, category: 'espera' })),
            ...(resueltosData.tickets || []).map(t => ({ ...t, category: 'resueltos' }))
        ];
        
        // NUEVA FUNCIONALIDAD: Ordenar tickets por fecha más reciente
        allTickets.sort((a, b) => {
            const dateA = a.Ultima_modificacion ? moment(a.Ultima_modificacion, 'YYYY-MM-DD HH:mm:ss') : moment(0);
            const dateB = b.Ultima_modificacion ? moment(b.Ultima_modificacion, 'YYYY-MM-DD HH:mm:ss') : moment(0);
            return dateB.valueOf() - dateA.valueOf(); // Orden descendente (más reciente primero)
        });
        
        appState.allTickets = allTickets;
        
        // Actualizar contadores
        updateCounter('nuevos', nuevosData.tickets ? nuevosData.tickets.length : 0);
        updateCounter('espera', esperaData.tickets ? esperaData.tickets.length : 0);
        updateCounter('curso', cursoData.tickets ? cursoData.tickets.length : 0);
        updateCounter('resueltos', resueltosData.tickets ? resueltosData.tickets.length : 0);
        
        // Actualizar última actualización si está disponible
        const lastUpdate = nuevosData.last_update || cursoData.last_update || 
                          esperaData.last_update || resueltosData.last_update;
        
        if (lastUpdate) {
            appState.lastUpdate = lastUpdate;
            updateLastUpdateTime();
        }
        
        // NUEVA FUNCIONALIDAD: Mostrar automáticamente los tickets más recientes
        // Limitar a un número razonable para no sobrecargar la vista
        const recentTickets = allTickets.slice(0, CONFIG.maxResults);
        appState.searchResults = recentTickets;
        updateSearchResults(recentTickets);
        
        // Actualizar mensaje de búsqueda
        document.getElementById('searchStatus').textContent = 
            `Mostrando los ${recentTickets.length} tickets más recientes (de ${allTickets.length} en total). Utilice los filtros para refinar la búsqueda.`;
        
        // Actualizar contadores de resultados
        const totalResults = document.getElementById('totalResults');
        if (totalResults) totalResults.textContent = allTickets.length;
        
        // Ocultar overlay de carga
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        setLoading(false);
    })
    .catch(error => {
        console.error('Error al obtener tickets:', error);
        const searchStatus = document.getElementById('searchStatus');
        if (searchStatus) {
            searchStatus.textContent = 'Error al cargar tickets. Por favor, intenta recargar la página.';
            searchStatus.className = 'text-sm text-red-500 mt-1';
        }
        
        // Ocultar overlay de carga
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        setLoading(false);
    });
}

// Modificación 2: Función para formatear fechas correctamente
function formatFecha(fechaStr) {
    // Verificar si la fecha es válida y corregir fechas futuras
    try {
        const fecha = moment(fechaStr, 'YYYY-MM-DD HH:mm:ss');
        
        // Si la fecha está en el futuro (excepto por minutos), ajustarla al año actual
        const currentYear = moment().year();
        if (fecha.year() > currentYear + 1) {  // Permitir hasta un año en el futuro (para tickets planificados)
            fecha.year(currentYear);
        }
        
        // Formatear la fecha para mostrar
        return fecha.format('DD/MM/YYYY HH:mm:ss');
    } catch (e) {
        console.error('Error al formatear fecha:', e);
        return fechaStr || 'No disponible';
    }
}

// Modificación 3: Mejorar visualización de tickets (truncar títulos largos)
function updateSearchResults(results) {
    const resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) return;
    
    if (results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="col-span-1 md:col-span-2 flex flex-col items-center justify-center py-12">
                <i class="fas fa-search text-5xl text-gray-300 mb-4"></i>
                <h3 class="text-xl font-medium text-gray-600 mb-2">No se encontraron resultados</h3>
                <p class="text-gray-500">Intenta con otros términos o criterios de búsqueda</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    const limitedResults = results.slice(0, CONFIG.maxResults);
    
    limitedResults.forEach(ticket => {
        // Obtener ticket_id (priorizar el nuevo campo, con respaldo al campo ID)
        const ticketId = ticket.ticket_id || ticket.ID || 'Sin ID';
        
        // Determinar clase CSS según categoría
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
        }
        
        // Tiempo desde última actualización 
        let lastUpdateTime = '';
        if (ticket.Ultima_modificacion) {
            try {
                const lastUpdate = moment(ticket.Ultima_modificacion, 'YYYY-MM-DD HH:mm:ss');
                // Corregir fechas futuras
                const currentYear = moment().year();
                if (lastUpdate.year() > currentYear + 1) {
                    lastUpdate.year(currentYear);
                }
                lastUpdateTime = lastUpdate.fromNow();
            } catch (e) {
                lastUpdateTime = ticket.Ultima_modificacion;
            }
        }
        
        // NUEVO: Truncar título largo y agregar clase para tooltip
        const tituloCompleto = ticket.Título || 'Sin título';
        const tituloTruncado = tituloCompleto.length > 60 ? tituloCompleto.substring(0, 57) + '...' : tituloCompleto;
        
        html += `
            <div class="ticket-card ${statusClass}" onclick="showTicketDetails('${ticketId}', '${ticket.category}')">
                <div class="p-4">
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex-1">
                            <h3 class="font-medium text-blue-600 mb-1 truncate titulo-ticket" title="${tituloCompleto}">${tituloTruncado}</h3>
                            <div class="text-sm text-gray-600">#${ticketId}</div>
                        </div>
                        <div>
                            ${statusBadge}
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-1 text-sm mb-3">
                        <div>
                            <span class="text-gray-500">Entidad:</span>
                            <span class="font-medium">${ticket.Entidad || 'No especificada'}</span>
                        </div>
                        <div>
                            <span class="text-gray-500">Solicitante:</span>
                            <span class="font-medium">${ticket.Solicitante || 'No especificado'}</span>
                        </div>
                        <div>
                            <span class="text-gray-500">Asignado a:</span>
                            <span class="font-medium">${ticket.Asignado_a || 'Sin asignar'}</span>
                        </div>
                        <div>
                            <span class="text-gray-500">Actualizado:</span>
                            <span class="font-medium">${lastUpdateTime}</span>
                        </div>
                    </div>
                    
                    <div class="text-right">
                        <button class="text-blue-600 text-sm hover:text-blue-800">
                            <i class="fas fa-external-link-alt mr-1"></i>Ver detalles
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    if (results.length > CONFIG.maxResults) {
        html += `
            <div class="col-span-1 md:col-span-2 bg-blue-50 rounded-lg p-4 text-center mt-4">
                <p class="text-blue-700">
                    <i class="fas fa-info-circle mr-2"></i>
                    Mostrando ${CONFIG.maxResults} de ${results.length} resultados. Refina tu búsqueda para ver menos resultados.
                </p>
            </div>
        `;
    }
    
    resultsContainer.innerHTML = html;
    
    // Añadir efecto de entrada a las tarjetas
    const ticketCards = document.querySelectorAll('.ticket-card');
    ticketCards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        setTimeout(() => {
            card.style.transition = 'all 0.3s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 50 * index);
    });
}

// Modificación 4: Añadir filtros avanzados
function initFiltersAvanzados() {
    const filtersContainer = document.getElementById('advancedFilters');
    if (!filtersContainer) return;
    
    // Mostrar/ocultar filtros avanzados
    document.getElementById('toggleAdvancedFilters').addEventListener('click', function() {
        filtersContainer.classList.toggle('hidden');
        
        // Cambiar texto del botón
        if (filtersContainer.classList.contains('hidden')) {
            this.innerHTML = '<i class="fas fa-sliders-h mr-2"></i>Mostrar filtros avanzados';
        } else {
            this.innerHTML = '<i class="fas fa-chevron-up mr-2"></i>Ocultar filtros avanzados';
        }
    });
    
    // Eventos para campos de fecha
    const datePickers = document.querySelectorAll('.date-filter');
    datePickers.forEach(picker => {
        picker.addEventListener('change', handleQuickSearch);
    });
    
    // Eventos para filtros adicionales
    document.getElementById('filterPriority').addEventListener('change', handleQuickSearch);
    document.getElementById('filterCategory').addEventListener('change', handleQuickSearch);
    document.getElementById('filterAssigned').addEventListener('change', handleQuickSearch);
}

// Modificación 5: Función de búsqueda mejorada con filtros avanzados
function performSearchAdvanced(query, field) {
    setLoading(true);
    
    // Guardar búsqueda actual
    appState.currentSearch = { query, field };
    
    // Normalizar la consulta (minúsculas, sin tildes)
    const normalizedQuery = normalizeString(query);
    
    // Filtros avanzados
    const fromDate = document.getElementById('filterFromDate').value;
    const toDate = document.getElementById('filterToDate').value;
    const priority = document.getElementById('filterPriority').value;
    const category = document.getElementById('filterCategory').value;
    const assignedTo = document.getElementById('filterAssigned').value;
    
    // Filtrar tickets según el campo seleccionado y los filtros avanzados
    let results = [];
    
    // Primera fase: filtrar por texto
    if (field === 'all') {
        // Buscar en todos los campos
        results = appState.allTickets.filter(ticket => {
            return Object.entries(ticket).some(([key, value]) => {
                // Excluir la propiedad category que agregamos
                if (key === 'category') return false;
                
                // Verificar si el valor existe y es una cadena
                const stringValue = String(value || '');
                return normalizeString(stringValue).includes(normalizedQuery);
            });
        });
    } else {
        // Buscar en un campo específico
        results = appState.allTickets.filter(ticket => {
            if (ticket[field] === undefined) return false;
            
            const stringValue = String(ticket[field] || '');
            return normalizeString(stringValue).includes(normalizedQuery);
        });
    }
    
    // Segunda fase: aplicar filtros avanzados
    if (fromDate) {
        const fromDateObj = moment(fromDate);
        results = results.filter(ticket => {
            if (!ticket.Fecha_apertura) return false;
            const ticketDate = moment(ticket.Fecha_apertura, 'YYYY-MM-DD HH:mm:ss');
            return ticketDate.isSameOrAfter(fromDateObj, 'day');
        });
    }
    
    if (toDate) {
        const toDateObj = moment(toDate);
        results = results.filter(ticket => {
            if (!ticket.Fecha_apertura) return false;
            const ticketDate = moment(ticket.Fecha_apertura, 'YYYY-MM-DD HH:mm:ss');
            return ticketDate.isSameOrBefore(toDateObj, 'day');
        });
    }
    
    if (priority && priority !== 'all') {
        results = results.filter(ticket => 
            normalizeString(ticket.Prioridad || '').includes(normalizeString(priority))
        );
    }
    
    if (category && category !== 'all') {
        results = results.filter(ticket => 
            normalizeString(ticket.Categoria || '').includes(normalizeString(category))
        );
    }
    
    if (assignedTo && assignedTo !== 'all') {
        results = results.filter(ticket => {
            const assigned = ticket.Asignado_a || '';
            return assignedTo === 'unassigned' ? 
                ['', 'Sin asignar', 'No asignado'].includes(assigned) : 
                normalizeString(assigned).includes(normalizeString(assignedTo));
        });
    }
    
    // Actualizar estado y mostrar resultados
    appState.searchResults = results;
    updateSearchResults(results);
    
    // Actualizar contadores y mensaje
    const totalResults = document.getElementById('totalResults');
    if (totalResults) totalResults.textContent = results.length;
    
    const searchStatus = document.getElementById('searchStatus');
    if (searchStatus) {
        searchStatus.textContent = `Se encontraron ${results.length} tickets que coinciden con tu búsqueda.`;
        searchStatus.className = 'text-sm text-gray-500 mt-1';
    }
    
    // Restablecer estado de las tarjetas
    document.querySelectorAll('.stat-card').forEach(card => {
        card.classList.remove('ring-2', 'ring-blue-500');
    });
    
    setLoading(false);
}

// Modificación 6: Mejorar detalles de ticket (incluye nueva visualización de trazabilidad)
function showTicketDetails(ticketId, category) {
    const modalTitle = document.getElementById('ticketDetailsModalLabel');
    const modalBody = document.getElementById('ticketDetailsBody');
    
    if (!modalTitle || !modalBody) return;
    
    // Mostrar el modal
    const modal = document.getElementById('ticketDetailsModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    
    // Mostrar spinner de carga
    modalBody.innerHTML = `
        <div class="flex justify-center items-center p-10">
            <div class="loading-spinner"></div>
        </div>
    `;
    
    // Buscar el ticket en los tickets disponibles
    const ticket = appState.allTickets.find(t => 
        (t.ticket_id === ticketId || t.ID === ticketId) && t.category === category
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
    
    // Obtener el ticket_id efectivo (priorizar el campo específico)
    const effectiveTicketId = ticket.ticket_id || ticket.ID || 'Sin ID';
    
    modalTitle.textContent = `Ticket #${effectiveTicketId}`;
    
    // Determinar estado actual y badge según categoría
    let statusBadge = '';
    let progressPercentage = 0;
    
    switch (category) {
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
    
    // Formatear fechas si es posible (con corrección de años futuros)
    let fechaApertura = formatFecha(ticket.Fecha_apertura);
    let ultimaModificacion = formatFecha(ticket.Ultima_modificacion);
    
    // Determinar clases para los pasos según el estado actual
    const getStepClasses = (stepState) => {
        const states = {
            'nuevos': 1,
            'espera': 2,
            'curso': 3,
            'resueltos': 4
        };
        
        const currentState = states[category] || 0;
        const stepNumber = states[stepState] || 0;
        
        if (stepNumber === currentState) return 'step-active';
        if (stepNumber < currentState) return 'step-completed';
        return '';
    };
    
    // Comprobar si hay un técnico asignado para mostrar sección de contacto
    const nombreTecnico = ticket.Asignado_a || '';
    const tieneTecnicoAsignado = nombreTecnico && nombreTecnico !== 'No asignado';
    
    // Contacto con técnico
    let tecnicoContactoHtml = '';
    if (tieneTecnicoAsignado) {
        // Código de contacto con técnico existente...
        tecnicoContactoHtml = `
            <div class="bg-white rounded-lg shadow-sm mb-6">
                <div class="px-4 py-3 bg-blue-50 border-b border-blue-100 rounded-t-lg">
                    <h3 class="font-semibold text-blue-700"><i class="fas fa-headset mr-2"></i>Contacto con Técnico Asignado</h3>
                </div>
                <div class="p-4" id="tecnicoContactoContainer">
                    <div class="flex justify-center my-2">
                        <div class="loading-spinner"></div>
                    </div>
                    <p class="text-center text-gray-500">Cargando información del técnico...</p>
                </div>
            </div>
        `;
        
        // Aquí iría la lógica para cargar datos del técnico
    }
    
    // NUEVA VISUALIZACIÓN DE TRAZABILIDAD MEJORADA
    const trazabilidadHtml = `
        <div class="mb-8 bg-white rounded-lg p-6 shadow-sm">
            <h3 class="text-lg font-semibold mb-4"><i class="fas fa-route mr-2"></i>Trazabilidad del Ticket</h3>
            
            <div class="ticket-journey relative">
                <div class="journey-line"></div>
                <div class="journey-progress" style="width: ${progressPercentage}%;"></div>
                
                <div class="journey-steps">
                    <div class="journey-step ${getStepClasses('nuevos')}">
                        <div class="step-node">
                            <div class="step-icon">
                                <i class="fas fa-plus"></i>
                            </div>
                        </div>
                        <div class="step-info">
                            <div class="step-title">Nuevo</div>
                            <div class="step-desc">Ticket registrado</div>
                        </div>
                    </div>
                    
                    <div class="journey-step ${getStepClasses('espera')}">
                        <div class="step-node">
                            <div class="step-icon">
                                <i class="fas fa-clock"></i>
                            </div>
                        </div>
                        <div class="step-info">
                            <div class="step-title">En Espera</div>
                            <div class="step-desc">Pendiente de acción</div>
                        </div>
                    </div>
                    
                    <div class="journey-step ${getStepClasses('curso')}">
                        <div class="step-node">
                            <div class="step-icon">
                                <i class="fas fa-cogs"></i>
                            </div>
                        </div>
                        <div class="step-info">
                            <div class="step-title">En Curso</div>
                            <div class="step-desc">Trabajando en solución</div>
                        </div>
                    </div>
                    
                    <div class="journey-step ${getStepClasses('resueltos')}">
                        <div class="step-node">
                            <div class="step-icon">
                                <i class="fas fa-check"></i>
                            </div>
                        </div>
                        <div class="step-info">
                            <div class="step-title">Resuelto</div>
                            <div class="step-desc">Solución implementada</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="journey-details mt-5 pt-4 border-t border-gray-100">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="text-gray-600 font-medium">Fecha de apertura:</span> 
                        <span>${fechaApertura}</span>
                    </div>
                    <div>
                        <span class="text-gray-600 font-medium">Última actualización:</span> 
                        <span>${ultimaModificacion}</span>
                    </div>
                    <div>
                        <span class="text-gray-600 font-medium">Tiempo total:</span> 
                        <span>${ticket.Duracion || 'No disponible'}</span>
                    </div>
                    <div>
                        <span class="text-gray-600 font-medium">Estado actual:</span> 
                        <span>${statusBadge}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Resto del contenido del modal
    modalBody.innerHTML = `
        <div class="ticket-detail-header rounded-lg mb-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="md:col-span-2">
                    <h2 class="text-xl font-semibold mb-2">${ticket.Título || 'Sin título'}</h2>
                    <div class="flex flex-wrap items-center gap-3">
                        ${statusBadge}
                        <span class="text-gray-600 text-sm">
                            <i class="fas fa-hashtag"></i> ${effectiveTicketId}
                        </span>
                        ${ticket.ID_interno ? `
                        <span class="text-gray-600 text-sm">
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
        
        <!-- NUEVO COMPONENTE: Trazabilidad Mejorada -->
        ${trazabilidadHtml}
        
        <!-- Contacto con Técnico (si hay asignado) -->
        ${tieneTecnicoAsignado ? tecnicoContactoHtml : ''}
        
        <!-- Detalles del Ticket en tarjetas -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <!-- Información General -->
            <div class="bg-white rounded-lg shadow-sm">
                <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 rounded-t-lg">
                    <h3 class="font-semibold"><i class="fas fa-info-circle mr-2"></i>Información General</h3>
                </div>
                <div class="p-4">
                    <table class="w-full">
                        <tbody>
                            <tr class="border-b border-gray-100">
                                <td class="py-2 font-medium text-gray-600">Entidad:</td>
                                <td class="py-2">${ticket.Entidad || 'No especificada'}</td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-2 font-medium text-gray-600">Categoría:</td>
                                <td class="py-2">${ticket.Categoria || 'No especificada'}</td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-2 font-medium text-gray-600">Tipo:</td>
                                <td class="py-2">${ticket.Tipo || 'No especificado'}</td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-2 font-medium text-gray-600">Prioridad:</td>
                                <td class="py-2">${ticket.Prioridad || 'No especificada'}</td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-2 font-medium text-gray-600">Medio:</td>
                                <td class="py-2">${ticket.Medio || 'No especificado'}</td>
                            </tr>
                            <tr>
                                <td class="py-2 font-medium text-gray-600">Ubicación:</td>
                                <td class="py-2">${ticket.Ubicacion || 'No especificada'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Asignación -->
            <div class="bg-white rounded-lg shadow-sm">
                <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 rounded-t-lg">
                    <h3 class="font-semibold"><i class="fas fa-user mr-2"></i>Asignación</h3>
                </div>
                <div class="p-4">
                    <table class="w-full">
                        <tbody>
                            <tr class="border-b border-gray-100">
                                <td class="py-2 font-medium text-gray-600">Solicitante:</td>
                                <td class="py-2">${ticket.Solicitante || 'No especificado'}</td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-2 font-medium text-gray-600">Asignado a:</td>
                                <td class="py-2">
                                    ${ticket.Asignado_a || 'No asignado'}
                                    ${tieneTecnicoAsignado ? `
                                        <a href="#tecnicoContactoContainer" class="ml-2 text-blue-600 hover:text-blue-800">
                                            <i class="fas fa-id-card"></i> Ver contacto
                                        </a>` : 
                                        ''
                                    }
                                </td>
                            </tr>
                            <tr>
                                <td class="py-2 font-medium text-gray-600">Estado:</td>
                                <td class="py-2">${ticket.Estado || 'No especificado'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <!-- Tiempos -->
        <div class="bg-white rounded-lg shadow-sm mb-6">
            <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 rounded-t-lg">
                <h3 class="font-semibold"><i class="fas fa-clock mr-2"></i>Tiempos</h3>
            </div>
            <div class="p-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <table class="w-full">
                            <tbody>
                                <tr class="border-b border-gray-100">
                                    <td class="py-2 font-medium text-gray-600">Fecha Apertura:</td>
                                    <td class="py-2">${fechaApertura}</td>
                                </tr>
                                <tr>
                                    <td class="py-2 font-medium text-gray-600">Última Modificación:</td>
                                    <td class="py-2">${ultimaModificacion}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div>
                        <table class="w-full">
                            <tbody>
                                <tr class="border-b border-gray-100">
                                    <td class="py-2 font-medium text-gray-600">Tiempo Resolución:</td>
                                    <td class="py-2">${ticket.Tiempo_resolucion || 'No disponible'}</td>
                                </tr>
                                <tr class="border-b border-gray-100">
                                    <td class="py-2 font-medium text-gray-600">Duración:</td>
                                    <td class="py-2">${ticket.Duracion || 'No disponible'}</td>
                                </tr>
                                <tr class="border-b border-gray-100">
                                    <td class="py-2 font-medium text-gray-600">Tiempo Adicional:</td>
                                    <td class="py-2">${ticket.Tiempo_adicional || 'No asignado'}</td>
                                </tr>
                                <tr>
                                    <td class="py-2 font-medium text-gray-600">Delay:</td>
                                    <td class="py-2">${ticket.Delay || 'No disponible'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Botones de acción -->
        <div class="flex flex-wrap justify-end gap-3">
            <button class="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
                <i class="fas fa-print mr-2"></i>Imprimir
            </button>
            <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <i class="fas fa-external-link-alt mr-2"></i>Ver en sistema
            </button>
            ${tieneTecnicoAsignado ? 
                `<a href="/tecnicos?buscar=${encodeURIComponent(nombreTecnico)}" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    <i class="fas fa-phone-alt mr-2"></i>Contactar técnico
                </a>` : 
                ''
            }
        </div>
    `;
    
    // Animar entrada de los elementos
    setTimeout(() => {
        const elements = modalBody.querySelectorAll('.bg-white, .ticket-detail-header');
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
    
    // Cargar datos del técnico si está asignado
    if (tieneTecnicoAsignado) {
        setTimeout(() => {
            cargarDatosTecnico(nombreTecnico);
        }, 500);
    }
}

// Función para cargar datos del técnico (mantener la lógica existente)
function cargarDatosTecnico(nombreTecnico) {
    fetch(`/api/tecnicos/nombre/${encodeURIComponent(nombreTecnico)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Técnico no encontrado');
            }
            return response.json();
        })
        .then(data => {
            if (data.tecnico) {
                // Código existente para mostrar datos del técnico
            } else {
                // Mostrar mensaje si no hay datos
            }
        })
        .catch(error => {
            console.error('Error al obtener información del técnico:', error);
            // Mostrar mensaje de error
        });
}

// Modificación 7: Inicializar la aplicación con los nuevos componentes
function initApp() {
    // Configurar manejadores de eventos
    document.getElementById('searchForm').addEventListener('submit', handleSearch);
    document.getElementById('clearSearch').addEventListener('click', clearSearch);
    document.getElementById('searchQuery').addEventListener('input', handleQuickSearch);
    
    // Inicializar selector de campos de búsqueda
    actualizarSelectorCampos();
    
    // Inicializar filtros avanzados
    initFiltersAvanzados();
    
    // Establecer conexión Socket.io si está habilitado
    if (CONFIG.enableRealTimeUpdates) {
        initSocketConnection();
    }

    // Cargar datos iniciales
    fetchAllTickets();
    
    // Configurar actualización periódica (si no hay Socket.io)
    if (!CONFIG.enableRealTimeUpdates) {
        setInterval(fetchAllTickets, CONFIG.refreshInterval);
    }
    
    // Mostrar animación de carga inicial
    setLoading(true);
    
    // Configurar eventos para las tarjetas de estadísticas
    configureStatCards();
    
    // Configurar el formateador de fechas
    moment.locale('es');
}

// Sobrescribir el manejador de búsqueda para usar la búsqueda avanzada
function handleSearch(event) {
    event.preventDefault();
    
    const query = document.getElementById('searchQuery').value.trim();
    const field = document.getElementById('searchField').value;
    
    if (!query) {
        clearSearch();
        return;
    }
    
    performSearchAdvanced(query, field);
}

// Función para manejar la búsqueda rápida con filtros avanzados
function handleQuickSearch() {
    const query = document.getElementById('searchQuery').value.trim();
    
    // Si el usuario borra la búsqueda, limpiar resultados
    if (!query) {
        clearSearch();
        return;
    }
    
    // Debounce: realizar búsqueda sólo después de 300ms sin escritura
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
        const field = document.getElementById('searchField').value;
        performSearchAdvanced(query, field);
    }, 300);
}