/**
 * estadisticas-base.js - Funciones base para el dashboard de estadísticas
 * 
 * Este archivo contiene las funcionalidades principales:
 * - Inicialización de conexiones
 * - Manejo de eventos
 * - Procesamiento de datos
 * - Utilidades generales
 */

// Variables globales
let allTickets = [];
let filteredTickets = [];
let ticketsByMonth = {};
let ticketsByTechnician = {};

// Conexión WebSocket mediante Socket.IO
const socket = io(window.location.origin, { 
  transports: ['websocket'], 
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

// ======== Inicialización ========

document.addEventListener('DOMContentLoaded', function() {
  // Inicializar interfaces interactivas
  initializeFilterListeners();
  initializeExportMenu();
  initializeDataRefresh();
  
  // Solicitar datos iniciales
  fetchInitialData();
});

// ======== Event Listeners ========

// Eventos Socket.IO
socket.on('connect', function() {
  console.log('🔌 Conectado al WebSocket');
  updateConnectionStatus('Conectado', 'bg-green-500');
});

socket.on('disconnect', function() {
  console.warn('🔌 Desconectado del WebSocket');
  updateConnectionStatus('Desconectado', 'bg-red-500');
});

socket.on('connect_error', function(error) {
  console.error('🔌 Error de conexión:', error);
  updateConnectionStatus('Error de conexión', 'bg-red-500');
});

socket.on('tickets_update', function(data) {
  handleTicketsUpdate(data);
});

/**
 * Procesa los datos de tickets recibidos a través del WebSocket
 */
function handleTicketsUpdate(data) {
  console.log('📊 Datos recibidos:', data);
  
  // Extraer y normalizar todos los tickets
  allTickets = [];
  
  // Procesar tickets por categoría
  if (data.tickets && Array.isArray(data.tickets)) {
    // Formato unificado
    allTickets = data.tickets;
  } else {
    // Formato antiguo por categorías
    if (data.nuevos && Array.isArray(data.nuevos)) allTickets = allTickets.concat(data.nuevos);
    if (data.en_curso && Array.isArray(data.en_curso)) allTickets = allTickets.concat(data.en_curso);
    if (data.espera && Array.isArray(data.espera)) allTickets = allTickets.concat(data.espera);
    if (data.resueltos && Array.isArray(data.resueltos)) allTickets = allTickets.concat(data.resueltos);
  }
  
  // Mostrar timestamp de actualización
  if (data.last_update) {
    const lastUpdateEl = document.getElementById('lastUpdate');
    if (lastUpdateEl) {
      const span = lastUpdateEl.querySelector('span') || lastUpdateEl;
      span.textContent = formatDateTime(data.last_update);
    }
  }
  
  // Inicializar con todos los tickets
  filteredTickets = allTickets;
  
  // Actualizar la interfaz
  updateDashboard();
  updateCharts();
  updateTechnicianTable();
  
  // Llenar selector de técnicos
  populateTechnicianFilter();
  
  // Mostrar notificación de actualización
  showToast('Datos actualizados correctamente', 'success');
}

/**
 * Inicializa los listeners para los filtros
 */
function initializeFilterListeners() {
  // Listeners para filtros
  const filters = ['categoryFilter', 'timeFilter', 'technicianFilter'];
  
  filters.forEach(filterId => {
    const element = document.getElementById(filterId);
    if (element) {
      element.addEventListener('change', () => {
        // Aplicar filtros seleccionados
        filteredTickets = getFilteredTickets();
        
        // Actualizar visualizaciones
        updateDashboard();
        updateCharts();
        updateTechnicianTable();
      });
    }
  });
  
  // Listeners para cards
  document.getElementById('totalTicketsCard')?.addEventListener('click', () => {
    if (document.getElementById('categoryFilter')) {
      document.getElementById('categoryFilter').value = 'all';
      filteredTickets = getFilteredTickets();
      updateDashboard();
      updateCharts();
      updateTechnicianTable();
    }
  });
  
  document.getElementById('inCourseCard')?.addEventListener('click', () => {
    if (document.getElementById('categoryFilter')) {
      document.getElementById('categoryFilter').value = 'en_curso';
      filteredTickets = getFilteredTickets();
      updateDashboard();
      updateCharts();
      updateTechnicianTable();
    }
  });
  
  document.getElementById('waitingCard')?.addEventListener('click', () => {
    if (document.getElementById('categoryFilter')) {
      document.getElementById('categoryFilter').value = 'espera';
      filteredTickets = getFilteredTickets();
      updateDashboard();
      updateCharts();
      updateTechnicianTable();
    }
  });
}

/**
 * Inicializa el menú de exportación
 */
function initializeExportMenu() {
  const exportBtn = document.getElementById('exportBtn');
  const exportMenu = document.getElementById('exportMenu');
  
  if (exportBtn && exportMenu) {
    exportBtn.addEventListener('click', () => {
      exportMenu.classList.toggle('hidden');
    });
    
    // Cerrar el menú al hacer clic fuera de él
    document.addEventListener('click', (event) => {
      if (!exportBtn.contains(event.target) && !exportMenu.contains(event.target)) {
        exportMenu.classList.add('hidden');
      }
    });
  }
}

/**
 * Inicializa el botón de actualización de datos
 */
function initializeDataRefresh() {
  const refreshBtn = document.getElementById('refreshBtn');
  
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchInitialData();
      
      // Mostrar efecto de actualización
      refreshBtn.classList.add('animate-spin');
      setTimeout(() => {
        refreshBtn.classList.remove('animate-spin');
      }, 1000);
    });
  }
}

/**
 * Busca tickets de la base de datos si no se reciben por WebSocket
 */
function fetchInitialData() {
  // Mostrar indicadores de carga
  updateLoadingState(true);
  
  // Intentar obtener datos del endpoint mejorado
  fetch('/api/tickets/improved')
    .then(response => {
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      handleTicketsUpdate(data);
      updateLoadingState(false);
    })
    .catch(error => {
      console.error('Error al obtener datos iniciales:', error);
      showToast('Error al cargar datos. Intente nuevamente.', 'error');
      updateLoadingState(false);
      
      // Intentar obtener datos del endpoint estándar como respaldo
      fetch('/api/tickets')
        .then(response => response.json())
        .then(data => {
          handleTicketsUpdate(data);
        })
        .catch(fallbackError => {
          console.error('Error en endpoint de respaldo:', fallbackError);
        });
    });
}

/**
 * Filtra los tickets según los criterios seleccionados
 * @returns {Array} Tickets filtrados
 */
function getFilteredTickets() {
  // Obtener valores de los filtros
  const categoryFilter = document.getElementById('categoryFilter')?.value || 'all';
  const timeFilter = document.getElementById('timeFilter')?.value || 'all';
  const technicianFilter = document.getElementById('technicianFilter')?.value || 'all';
  
  // Aplicar filtros
  return allTickets.filter(ticket => {
    // Filtro por categoría
    if (categoryFilter !== 'all') {
      // CORRECCIÓN: Manejo mejorado para detectar tickets "En Curso"
      if (categoryFilter === 'en_curso') {
        // Verificar explícitamente diferentes variantes de "En curso"
        const estado = (ticket.Estado || '').toLowerCase();
        if (!estado.includes('curso') && !estado.includes('progres') && !estado.includes('process')) {
          return false;
        }
      } else {
        const category = ticket.category || detectTicketCategory(ticket);
        if (category !== categoryFilter) return false;
      }
    }
    
    // Filtro por tiempo
    if (timeFilter !== 'all') {
      const ticketDate = parseTicketDate(ticket.Fecha_apertura);
      if (!isDateInTimeRange(ticketDate, timeFilter)) return false;
    }
    
    // Filtro por técnico
    if (technicianFilter !== 'all') {
      const technician = ticket.Asignado_a || 'Sin asignar';
      if (technicianFilter === 'unassigned') {
        if (technician !== 'Sin asignar') return false;
      } else {
        if (technician !== technicianFilter) return false;
      }
    }
    
    return true;
  });
}

/**
 * Determina la categoría de un ticket basado en su estado
 * @param {Object} ticket - El ticket a analizar
 * @returns {String} La categoría del ticket
 */
function detectTicketCategory(ticket) {
  const estado = (ticket.Estado || '').toLowerCase();
  
  if (estado.includes('nuevo') || estado === 'new') {
    return 'nuevos';
  } else if (estado.includes('espera') || estado === 'waiting' || estado.includes('stand by')) {
    return 'espera';
  } else if (estado.includes('curso') || estado.includes('progres') || estado.includes('in process')) {
    return 'en_curso';
  } else if (estado.includes('resuelto') || estado.includes('resolved') || 
            estado.includes('cerrado') || estado.includes('closed')) {
    return 'resueltos';
  }
  
  // Por defecto
  return 'nuevos';
}

/**
 * Comprueba si una fecha está dentro del rango de tiempo especificado
 * @param {Date} date - Fecha a comprobar
 * @param {String} timeRange - Rango de tiempo ('today', 'week', 'month', etc.)
 * @returns {Boolean} Verdadero si la fecha está en el rango
 */
function isDateInTimeRange(date, timeRange) {
  if (!date) return false;
  
  const now = new Date();
  
  switch(timeRange) {
    case 'today':
      return date.toDateString() === now.toDateString();
      
    case 'week':
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      return date >= weekStart;
      
    case 'month':
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      
    case 'quarter':
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const ticketQuarter = Math.floor(date.getMonth() / 3);
      return ticketQuarter === currentQuarter && date.getFullYear() === now.getFullYear();
      
    default:
      return true;
  }
}

/**
 * Obtiene una lista de técnicos únicos a partir de los tickets
 * @returns {Array} Lista de técnicos
 */
function getUniqueTechnicians() {
  const technicians = new Set();
  
  allTickets.forEach(ticket => {
    const tech = ticket.Asignado_a || 'Sin asignar';
    technicians.add(tech);
  });
  
  return Array.from(technicians).sort();
}

/**
 * Rellena el filtro de técnicos con los técnicos disponibles
 */
function populateTechnicianFilter() {
  const techSelect = document.getElementById('technicianFilter');
  if (!techSelect) return;
  
  // Guardar valor actual
  const currentValue = techSelect.value;
  
  // Obtener técnicos únicos
  const technicians = getUniqueTechnicians();
  
  // Limpiar opciones existentes, pero mantener la primera opción "Todos los técnicos"
  const firstOption = techSelect.options[0];
  techSelect.innerHTML = '';
  techSelect.appendChild(firstOption);
  
  // Añadir opción para "Sin asignar"
  const unassignedOption = document.createElement('option');
  unassignedOption.value = 'unassigned';
  unassignedOption.textContent = 'Sin asignar';
  techSelect.appendChild(unassignedOption);
  
  // Añadir técnicos
  technicians.forEach(tech => {
    if (tech !== 'Sin asignar') { // Ya añadimos esta opción arriba
      const option = document.createElement('option');
      option.value = tech;
      option.textContent = tech;
      techSelect.appendChild(option);
    }
  });
  
  // Restaurar valor anterior si existía
  if (technicians.includes(currentValue) || currentValue === 'all' || currentValue === 'unassigned') {
    techSelect.value = currentValue;
  }
}

/**
 * Actualiza el estado de conexión en la UI
 * @param {String} text - Texto a mostrar
 * @param {String} bgClass - Clase CSS para el color de fondo
 */
function updateConnectionStatus(text, bgClass) {
  const statusEl = document.getElementById('connectionStatus');
  if (statusEl) {
    statusEl.innerHTML = `
      <i class="fas fa-${bgClass.includes('green') ? 'plug' : 'plug-circle-exclamation'} mr-2"></i>
      <span>${text}</span>
    `;
    statusEl.className = `bg-gray-700 text-white px-4 py-2 rounded-lg shadow-md flex items-center ${bgClass}`;
  }
}

/**
 * Muestra u oculta los indicadores de carga
 * @param {Boolean} isLoading - Si se está cargando o no
 */
function updateLoadingState(isLoading) {
  const tableBody = document.getElementById('technicianTableBody');
  
  if (isLoading) {
    // Mostrar spinner en la tabla
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-8 text-gray-500">
            <i class="fas fa-spinner fa-spin text-blue-500 text-2xl mb-2"></i>
            <p>Cargando datos...</p>
          </td>
        </tr>
      `;
    }
    
    // Mostrar esqueletos en las tarjetas
    document.querySelectorAll('.card-shadow [id^="card"]').forEach(el => {
      el.classList.add('skeleton');
      el.dataset.originalText = el.textContent;
      el.textContent = '\u00A0'; // Espacio no rompible
    });
  } else {
    // Restaurar texto original en las tarjetas
    document.querySelectorAll('.card-shadow [id^="card"].skeleton').forEach(el => {
      el.classList.remove('skeleton');
      if (el.dataset.originalText) {
        el.textContent = el.dataset.originalText;
      }
    });
  }
}

/**
 * Muestra un overlay de carga
 * @param {String} message - Mensaje a mostrar
 */
function showLoadingOverlay(message) {
  // Cerrar overlay existente si lo hay
  hideLoadingOverlay();
  
  const overlay = document.createElement('div');
  overlay.id = 'loadingOverlay';
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  overlay.innerHTML = `
    <div class="bg-white p-6 rounded-lg shadow-xl text-center">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div>
      <p class="mt-4 text-gray-700">${message}</p>
    </div>
  `;
  
  document.body.appendChild(overlay);
}

/**
 * Oculta el overlay de carga
 */
function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.remove();
  }
}

/**
 * Muestra una notificación tipo toast
 * @param {String} message - Mensaje a mostrar
 * @param {String} type - Tipo de notificación ('success', 'error', 'info')
 */
function showToast(message, type = 'info') {
  // Cerrar toast existente si lo hay
  const existingToast = document.getElementById('toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  // Definir clases según el tipo
  let bgColor, icon;
  switch(type) {
    case 'success':
      bgColor = 'bg-green-500';
      icon = 'fas fa-check-circle';
      break;
    case 'error':
      bgColor = 'bg-red-500';
      icon = 'fas fa-exclamation-circle';
      break;
    default:
      bgColor = 'bg-blue-500';
      icon = 'fas fa-info-circle';
      break;
  }
  
  // Crear el toast
  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = `fixed bottom-4 right-4 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center z-50`;
  toast.style.animation = 'slideIn 0.3s ease-out forwards';
  toast.innerHTML = `
    <i class="${icon} mr-2"></i>
    <span>${message}</span>
    <button class="ml-4 text-white hover:text-gray-200">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  // Añadir listener para cerrar
  toast.querySelector('button').addEventListener('click', () => {
    toast.remove();
  });
  
  // Añadir al DOM
  document.body.appendChild(toast);
  
  // Auto cerrar después de 5 segundos
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.style.animation = 'fadeOut 0.3s ease-in forwards';
      setTimeout(() => {
        if (document.body.contains(toast)) {
          toast.remove();
        }
      }, 300);
    }
  }, 5000);
  
  // Añadir estilos de animación si no existen
  if (!document.getElementById('toastAnimations')) {
    const style = document.createElement('style');
    style.id = 'toastAnimations';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Parsea una fecha de ticket en varios formatos posibles
 * @param {String} dateStr - Cadena de fecha a parsear
 * @returns {Date|null} Objeto Date o null si no se pudo parsear
 */
function parseTicketDate(dateStr) {
  if (!dateStr) return null;
  
  // Formatos comunes de fecha en el sistema
  const formats = [
    // "dd-mm-yyyy hh:mm"
    {
      regex: /^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/,
      handler: (match) => new Date(
        parseInt(match[3]),                 // year
        parseInt(match[2]) - 1,             // month (0-11)
        parseInt(match[1]),                 // day
        parseInt(match[4] || '0'),          // hour
        parseInt(match[5] || '0'),          // minute
        parseInt(match[6] || '0')           // second
      )
    },
    // "dd/mm/yyyy hh:mm"
    {
      regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/,
      handler: (match) => new Date(
        parseInt(match[3]),                 // year
        parseInt(match[2]) - 1,             // month (0-11)
        parseInt(match[1]),                 // day
        parseInt(match[4] || '0'),          // hour
        parseInt(match[5] || '0'),          // minute
        parseInt(match[6] || '0')           // second
      )
    },
    // "yyyy-mm-dd hh:mm"
    {
      regex: /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/,
      handler: (match) => new Date(
        parseInt(match[1]),                 // year
        parseInt(match[2]) - 1,             // month (0-11)
        parseInt(match[3]),                 // day
        parseInt(match[4] || '0'),          // hour
        parseInt(match[5] || '0'),          // minute
        parseInt(match[6] || '0')           // second
      )
    },
    // "dd-mm-yyyy"
    {
      regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
      handler: (match) => new Date(
        parseInt(match[3]),                 // year
        parseInt(match[2]) - 1,             // month (0-11)
        parseInt(match[1])                  // day
      )
    },
    // "dd/mm/yyyy"
    {
      regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      handler: (match) => new Date(
        parseInt(match[3]),                 // year
        parseInt(match[2]) - 1,             // month (0-11)
        parseInt(match[1])                  // day
      )
    }
  ];
  
  // Probar cada formato
  for (const format of formats) {
    const match = dateStr.match(format.regex);
    if (match) {
      try {
        const date = format.handler(match);
        if (!isNaN(date.getTime())) {
          return date;
        }
      } catch (e) {
        console.warn('Error parsing date:', e);
      }
    }
  }
  
  // Intentar con Date.parse como último recurso
  try {
    const timestamp = Date.parse(dateStr);
    if (!isNaN(timestamp)) {
      return new Date(timestamp);
    }
  } catch (e) {
    console.warn('Error parsing date with Date.parse:', e);
  }
  
  // Si no se pudo parsear, devolver null
  return null;
}

/**
 * Formatea una fecha en formato "dd/mm/yyyy hh:mm"
 * @param {String|Date} date - Fecha a formatear
 * @returns {String} Fecha formateada
 */
function formatDateTime(date) {
  if (!date) return '--';
  
  // Si es string, intentar convertir a Date
  if (typeof date === 'string') {
    const parsedDate = parseTicketDate(date);
    if (!parsedDate) return date; // Devolver original si no se pudo parsear
    date = parsedDate;
  }
  
  // Formatear la fecha
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Convierte formato 'MM-YYYY' a nombre del mes
 * @param {String} monthYear - Mes en formato 'MM-YYYY'
 * @returns {String} Nombre del mes
 */
function formatMonth(monthYear) {
  if (!monthYear) return '';
  
  const [month, year] = monthYear.split('-');
  
  const months = {
    '01': 'Enero',
    '02': 'Febrero',
    '03': 'Marzo',
    '04': 'Abril',
    '05': 'Mayo',
    '06': 'Junio',
    '07': 'Julio',
    '08': 'Agosto',
    '09': 'Septiembre',
    '10': 'Octubre',
    '11': 'Noviembre',
    '12': 'Diciembre'
  };
  
  return `${months[month] || month} ${year}`;
}

/**
 * Obtiene estadísticas por técnico a partir de los tickets
 * @param {Array} tickets - Lista de tickets
 * @returns {Object} Datos agrupados por técnico
 */
function getTechnicianStats(tickets) {
  const stats = {};
  
  tickets.forEach(ticket => {
    const technician = ticket.Asignado_a || 'Sin asignar';
    const dateObj = parseTicketDate(ticket.Fecha_apertura);
    
    if (!dateObj) return;
    
    const monthYear = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getFullYear()}`;
    
    if (!stats[technician]) {
      stats[technician] = { 
        total: 0, 
        months: {},
        avgTime: 0,
        totalTime: 0
      };
    }
    
    // Incrementar conteo total
    stats[technician].total++;
    
    // Incrementar conteo por mes
    if (!stats[technician].months[monthYear]) {
      stats[technician].months[monthYear] = 0;
    }
    stats[technician].months[monthYear]++;
    
    // Sumar tiempo de resolución si está disponible
    if (ticket.Duracion) {
      const duration = parseFloat(ticket.Duracion);
      if (!isNaN(duration)) {
        stats[technician].totalTime += duration;
      }
    }
  });
  
  // Calcular tiempo promedio
  Object.keys(stats).forEach(tech => {
    if (stats[tech].total > 0) {
      stats[tech].avgTime = stats[tech].totalTime / stats[tech].total;
    }
  });
  
  return stats;
}

/**
 * Obtiene estadísticas por categoría a partir de los tickets
 * @param {Array} tickets - Lista de tickets
 * @returns {Object} Datos agrupados por categoría
 */
function getCategoryStats(tickets) {
  const categories = {};
  
  tickets.forEach(ticket => {
    let category = '';
    
    // Intentar obtener la categoría del ticket
    if (ticket.category) {
      category = ticket.category;
    } else if (ticket.Categoria) {
      category = ticket.Categoria;
    } else {
      category = 'Sin categoría';
    }
    
    if (!categories[category]) {
      categories[category] = 0;
    }
    
    categories[category]++;
  });
  
  return categories;
}

/**
 * Obtiene los meses únicos presentes en los tickets
 * @param {Array} tickets - Lista de tickets
 * @returns {Array} Lista de meses ordenados cronológicamente
 */
function getUniqueMonths(tickets) {
  const monthsSet = new Set();
  
  tickets.forEach(ticket => {
    const dateObj = parseTicketDate(ticket.Fecha_apertura);
    if (dateObj) {
      const monthYear = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getFullYear()}`;
      monthsSet.add(monthYear);
    }
  });
  
  // Ordenar cronológicamente (más reciente primero)
  return Array.from(monthsSet).sort((a, b) => {
    const [m1, y1] = a.split('-').map(Number);
    const [m2, y2] = b.split('-').map(Number);
    return (y2 - y1) || (m2 - m1);
  });
}