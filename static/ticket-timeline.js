/**
 * SENASA - Sistema de Trazabilidad de Tickets
 * Funciones para formateo de fechas y visualización de línea de tiempo
 */

/**
 * Formatea una fecha en varios formatos de entrada a un formato estándar DD/MM/YYYY HH:mm:ss
 * @param {string} dateStr - String de fecha en cualquier formato
 * @returns {string} - Fecha formateada
 */
function formatDateStandard(dateStr) {
  if (!dateStr) return '-';
  
  // Limpiamos el string de fecha de posibles caracteres no deseados
  dateStr = dateStr.trim().split('\n')[0].trim();
  
  // Intentamos diferentes formatos de fecha
  let date;
  
  // Patrón para fechas en formato "DD-MM-YYYY HH:mm"
  const patternDMY = /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\s*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?/;
  // Patrón para fechas en formato "YYYY-MM-DD HH:mm:ss"
  const patternYMD = /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?/;
  
  if (patternDMY.test(dateStr)) {
    // Extraer componentes de la fecha
    const matches = dateStr.match(patternDMY);
    const day = matches[1].padStart(2, '0');
    const month = matches[2].padStart(2, '0');
    const year = matches[3];
    const hours = (matches[4] || '00').padStart(2, '0');
    const minutes = (matches[5] || '00').padStart(2, '0');
    const seconds = (matches[6] || '00').padStart(2, '0');
    
    // Crear objeto Date (formato YYYY-MM-DD)
    date = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}`);
  } else if (patternYMD.test(dateStr)) {
    // Extraer componentes de la fecha
    const matches = dateStr.match(patternYMD);
    const year = matches[1];
    const month = matches[2].padStart(2, '0');
    const day = matches[3].padStart(2, '0');
    const hours = (matches[4] || '00').padStart(2, '0');
    const minutes = (matches[5] || '00').padStart(2, '0');
    const seconds = (matches[6] || '00').padStart(2, '0');
    
    // Crear objeto Date
    date = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}`);
  } else if (!isNaN(Date.parse(dateStr))) {
    // Intentar parsear directamente si es un formato reconocido por JS
    date = new Date(dateStr);
  } else if (!isNaN(dateStr) && dateStr.length >= 10) {
    // Intentar parsear como timestamp (en milisegundos)
    date = new Date(parseInt(dateStr));
  } else {
    console.warn('Formato de fecha no reconocido:', dateStr);
    return dateStr; // Devolver el string original si no podemos parsearlo
  }

  // Verificar si la fecha es válida
  if (isNaN(date.getTime())) {
    console.warn('Fecha inválida:', dateStr);
    return dateStr; // Devolver el string original si no es válida
  }

  // Formatear la fecha como DD/MM/YYYY HH:mm:ss
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Formatea una fecha para mostrar en la línea de tiempo (formato corto)
 * @param {string} dateStr - String de fecha en cualquier formato
 * @returns {string} - Fecha formateada en formato corto
 */
function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  
  // Usar la función principal para normalizar la fecha
  const date = parseAnyDate(dateStr);
  
  // Verificar si la fecha es válida
  if (!date || isNaN(date.getTime())) {
    return '-';
  }
  
  // Formatear como "DD MMM, HH:mm"
  const day = date.getDate().toString().padStart(2, '0');
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const month = monthNames[date.getMonth()];
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  return `${day} ${month}, ${hours}:${minutes}`;
}

/**
 * Parsea cualquier formato de fecha y devuelve un objeto Date
 * @param {string} dateStr - String de fecha en cualquier formato
 * @returns {Date|null} - Objeto Date o null si no es válida
 */
function parseAnyDate(dateStr) {
  if (!dateStr) return null;
  
  // Limpiamos el string de fecha
  dateStr = dateStr.trim().split('\n')[0].trim();
  
  // Patrones de fecha
  const patternDMY = /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\s*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?/;
  const patternYMD = /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?/;
  
  let date;
  
  if (patternDMY.test(dateStr)) {
    const matches = dateStr.match(patternDMY);
    const day = matches[1].padStart(2, '0');
    const month = matches[2].padStart(2, '0');
    const year = matches[3];
    const hours = (matches[4] || '00').padStart(2, '0');
    const minutes = (matches[5] || '00').padStart(2, '0');
    const seconds = (matches[6] || '00').padStart(2, '0');
    
    date = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}`);
  } else if (patternYMD.test(dateStr)) {
    const matches = dateStr.match(patternYMD);
    const year = matches[1];
    const month = matches[2].padStart(2, '0');
    const day = matches[3].padStart(2, '0');
    const hours = (matches[4] || '00').padStart(2, '0');
    const minutes = (matches[5] || '00').padStart(2, '0');
    const seconds = (matches[6] || '00').padStart(2, '0');
    
    date = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}`);
  } else if (!isNaN(Date.parse(dateStr))) {
    date = new Date(dateStr);
  } else if (!isNaN(dateStr) && dateStr.length >= 10) {
    date = new Date(parseInt(dateStr));
  } else {
    return null;
  }
  
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Genera el HTML para la línea de tiempo de un ticket
 * @param {Object} ticket - Objeto con datos del ticket
 * @returns {string} - HTML de la línea de tiempo
 */
function generateTicketTimeline(ticket) {
  // Estados posibles en orden cronológico
  const estados = [
    { id: 'nuevo', label: 'Nuevo', icon: 'fa-plus-circle' },
    { id: 'asignado', label: 'Asignado', icon: 'fa-user-check' },
    { id: 'en_curso', label: 'En Curso', icon: 'fa-tasks' },
    { id: 'en_espera', label: 'En Espera', icon: 'fa-hourglass-half' },
    { id: 'resuelto', label: 'Resuelto', icon: 'fa-check-circle' }
  ];
  
  // Determinar el estado actual del ticket
  let estadoActual;
  switch (ticket.Estado) {
    case 'Pendiente':
      estadoActual = ticket.Asignado_a ? 'asignado' : 'nuevo';
      break;
    case 'En curso (asignada)':
      estadoActual = 'en_curso';
      break;
    case 'En espera':
      estadoActual = 'en_espera';
      break;
    case 'Resuelto':
      estadoActual = 'resuelto';
      break;
    default:
      estadoActual = 'nuevo';
  }
  
  // Encontrar el índice del estado actual
  const estadoActualIndex = estados.findIndex(e => e.id === estadoActual);
  
  // Calcular el porcentaje de progreso
  const totalEstados = estados.length - 1; // -1 porque contamos intervalos, no puntos
  const progresoActual = Math.max(0, estadoActualIndex);
  const porcentajeProgreso = Math.round((progresoActual / totalEstados) * 100);
  
  // Generar HTML para la línea de tiempo
  let timelineHTML = `
    <div class="ticket-timeline-container mt-4 mb-6">
      <div class="timeline-progress-container">
        <div class="timeline-progress-bar" style="width: ${porcentajeProgreso}%"></div>
      </div>
      <div class="timeline-steps">
  `;
  
  // Generar pasos de la línea de tiempo
  estados.forEach((estado, index) => {
    // Determinar la clase del paso según el estado actual
    let stepClass = '';
    if (index < estadoActualIndex) {
      stepClass = 'completed'; // Estados anteriores
    } else if (index === estadoActualIndex) {
      stepClass = 'current'; // Estado actual
    } else {
      stepClass = 'pending'; // Estados futuros
    }
    
    // Fecha para este estado (simulada, en un sistema real vendría de los datos)
    let fechaEstado = '-';
    if (index === 0) {
      // Para el estado 'nuevo', usamos la fecha de apertura
      fechaEstado = formatDateShort(ticket.Fecha_apertura);
    } else if (index === estadoActualIndex) {
      // Para el estado actual, podríamos usar una fecha de última actualización
      fechaEstado = formatDateShort(ticket.Fecha_actualizacion || ticket.Fecha_apertura);
    } else if (index === estados.length - 1 && estadoActual === 'resuelto') {
      // Si está resuelto, usamos la fecha de resolución
      fechaEstado = formatDateShort(ticket.Fecha_resolucion || ticket.Fecha_actualizacion || ticket.Fecha_apertura);
    }
    
    // Generar HTML para este paso
    timelineHTML += `
      <div class="timeline-step ${stepClass}" data-step="${estado.id}">
        <div class="step-icon">
          <i class="fas ${estado.icon}"></i>
        </div>
        <div class="step-label">${estado.label}</div>
        <div class="step-date">${fechaEstado}</div>
      </div>
    `;
  });
  
  timelineHTML += `
      </div>
    </div>
  `;
  
  return timelineHTML;
}

/**
 * Actualiza la función showTicketDetails para incluir la línea de tiempo
 * @param {string} tecnico - Nombre del técnico
 * @param {string} mes - Mes seleccionado (opcional)
 * @param {Array} ticketsDetail - Array de tickets a mostrar
 */
function showTicketDetailsEnhanced(tecnico, mes, ticketsDetail) {
  // Título del modal
  const headerTitle = mes
    ? `Tickets de ${tecnico} (${formatMonth(mes)})`
    : `Tickets de ${tecnico}`;

  const modalOverlay = document.getElementById('modalOverlay');
  const modalContent = document.getElementById('modalContent');
  
  if (!modalOverlay || !modalContent) return;
  
  modalContent.innerHTML = `
    <div class="bg-gradient-to-r from-blue-800 to-blue-900 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
      <div class="flex items-center">
        <div class="mr-3 bg-white rounded-full w-10 h-10 flex items-center justify-center text-blue-800 font-bold animate__animated animate__fadeIn">
          ${tecnico.charAt(0).toUpperCase()}
        </div>
        <h3 class="text-lg font-semibold animate__animated animate__fadeIn">${headerTitle}</h3>
      </div>
      <button class="text-white hover:text-gray-200" onclick="document.getElementById('modalOverlay').classList.add('hidden')">
        <i class="fas fa-times"></i>
      </button>
    </div>
    
    <div class="p-6 overflow-y-auto max-h-[70vh]">
      <div class="mb-4 flex items-center justify-between animate__animated animate__fadeInDown">
        <span class="text-gray-600 font-medium">Total: ${ticketsDetail.length} tickets</span>
        <div class="flex space-x-2">
          <select id="modalStatusFilter" class="rounded-md border border-gray-300 px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500">
            <option value="all">Todos los estados</option>
            <option value="En curso (asignada)">En Curso</option>
            <option value="En espera">En Espera</option>
            <option value="Resuelto">Resueltos</option>
          </select>
          <button class="px-3 py-1 bg-blue-100 text-blue-800 rounded-md text-sm flex items-center">
            <i class="fas fa-sort-amount-down mr-1"></i>
            <span>Fecha</span>
          </button>
        </div>
      </div>
      
      ${ticketsDetail.length === 0 ? 
        `<div class="flex flex-col items-center justify-center py-12 animate__animated animate__fadeIn">
          <div class="text-7xl text-gray-300 mb-4"><i class="fas fa-ticket-alt"></i></div>
          <p class="text-gray-500 text-lg">No se encontraron tickets</p>
        </div>` : 
        `<div class="grid grid-cols-1 gap-6">
          ${ticketsDetail.map((ticket, index) => `
            <div class="glass-card p-4 rounded-lg hover:shadow-lg animate__animated animate__fadeInUp" 
                 style="animation-delay: ${index * 100}ms">
              <div class="flex justify-between items-start mb-2">
                <span class="bg-gray-100 text-gray-600 text-xs rounded-full px-2 py-1">#${ticket.ID}</span>
                <span class="px-2 py-1 text-xs leading-5 font-semibold rounded-full ${getStatusColor(ticket.Estado)}">
                  ${ticket.Estado}
                </span>
              </div>
              <p class="text-gray-800 font-medium mb-2">${ticket.Descripcion || 'Sin descripción'}</p>
              <div class="flex justify-between items-center text-xs text-gray-500 mb-3">
                <span><i class="far fa-calendar mr-1"></i> ${formatDateStandard(ticket.Fecha_apertura)}</span>
                <span><i class="far fa-clock mr-1"></i> ${ticket.Duracion || '0'}h</span>
              </div>
              
              <!-- Línea de tiempo del ticket -->
              ${generateTicketTimeline(ticket)}
              
              <div class="flex justify-end mt-2">
                <button class="bg-blue-50 text-blue-600 px-3 py-1 rounded text-sm hover:bg-blue-100 transition"
                        onclick="window.open('https://mda.senasa.gob.pe/front/ticket.form.php?id=${ticket.ID}', '_blank')">
                  <i class="fas fa-external-link-alt mr-1"></i> Ver detalles
                </button>
              </div>
            </div>
          `).join('')}
        </div>`
      }
    </div>
    
    <div class="bg-gray-50 px-6 py-4 rounded-b-xl flex justify-end">
      <button class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition" 
              onclick="document.getElementById('modalOverlay').classList.add('hidden')">
        Cerrar
      </button>
    </div>
  `;
  
  // Mostrar modal con animación
  modalOverlay.classList.remove('hidden');
  modalContent.classList.add('animate-fadeIn');
  
  // Agregar evento para filtrar por estado en el modal
  document.getElementById('modalStatusFilter')?.addEventListener('change', function() {
    const selectedStatus = this.value;
    const ticketCards = modalContent.querySelectorAll('.glass-card');
    
    ticketCards.forEach(card => {
      const status = card.querySelector('.rounded-full').textContent.trim();
      if (selectedStatus === 'all' || status === selectedStatus) {
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
      }
    });
  });
  
  // Iniciar animaciones de la línea de tiempo después de que el modal esté visible
  setTimeout(() => {
    const progressBars = document.querySelectorAll('.timeline-progress-bar');
    progressBars.forEach(bar => {
      bar.classList.add('animate');
    });
    
    const currentSteps = document.querySelectorAll('.timeline-step.current');
    currentSteps.forEach(step => {
      step.classList.add('pulse');
    });
  }, 300);
}

/**
 * Versión mejorada de processTicketsData que utiliza las nuevas funciones de formateo
 * @param {Object} data - Datos recibidos del socket
 */
function processTicketsDataEnhanced(data) {
  // Combinar todos los tickets con su categoría
  const allTickets = [
    ...(data.nuevos || []).map(t => ({ 
      ...t, 
      category: 'nuevos',
      Fecha_apertura_formatted: formatDateStandard(t.Fecha_apertura),
      Fecha_actualizacion_formatted: formatDateStandard(t.Fecha_actualizacion)
    })),
    ...(data.en_curso || []).map(t => ({ 
      ...t, 
      category: 'curso',
      Fecha_apertura_formatted: formatDateStandard(t.Fecha_apertura),
      Fecha_actualizacion_formatted: formatDateStandard(t.Fecha_actualizacion)
    })),
    ...(data.espera || []).map(t => ({ 
      ...t, 
      category: 'espera',
      Fecha_apertura_formatted: formatDateStandard(t.Fecha_apertura),
      Fecha_actualizacion_formatted: formatDateStandard(t.Fecha_actualizacion)
    })),
    ...(data.resueltos || []).map(t => ({ 
      ...t, 
      category: 'resueltos',
      Fecha_apertura_formatted: formatDateStandard(t.Fecha_apertura),
      Fecha_actualizacion_formatted: formatDateStandard(t.Fecha_actualizacion),
      Fecha_resolucion_formatted: formatDateStandard(t.Fecha_resolucion)
    }))
  ];
  
  appState.allTickets = allTickets;
  
  // Actualizar contadores
  updateCounter('nuevos', data.nuevos ? data.nuevos.length : 0);
  updateCounter('espera', data.espera ? data.espera.length : 0);
  updateCounter('curso', data.en_curso ? data.en_curso.length : 0);
  updateCounter('resueltos', data.resueltos ? data.resueltos.length : 0);
  
  // Actualizar última actualización
  if (data.last_update) {
    appState.lastUpdate = data.last_update;
    updateLastUpdateTime();
  }
  
  // Si hay búsqueda activa, refrescar resultados
  if (appState.currentSearch.query) {
    performSearch(appState.currentSearch.query, appState.currentSearch.field);
  } else {
    // Actualizar contadores
    const searchStatus = document.getElementById('searchStatus');
    if (searchStatus) {
      searchStatus.textContent = `Base de datos actualizada con ${allTickets.length} tickets. Ingresa un término de búsqueda para filtrar.`;
    }
    
    const totalResults = document.getElementById('totalResults');
    if (totalResults) {
      totalResults.textContent = allTickets.length;
    }
  }
}

// Estilos CSS para la línea de tiempo
const ticketTimelineStyles = `
/* Estilos para la línea de tiempo de tickets */
.ticket-timeline-container {
  position: relative;
  padding: 20px 0;
  margin: 20px 0;
}

.timeline-progress-container {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 4px;
  background-color: #e5e7eb;
  transform: translateY(-50%);
  z-index: 1;
}

.timeline-progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #2563eb);
  width: 0;
  transition: width 0.8s ease-in-out;
  z-index: 2;
}

.timeline-progress-bar.animate {
  width: var(--progress-width);
}

.timeline-steps {
  display: flex;
  justify-content: space-between;
  position: relative;
  z-index: 3;
}

.timeline-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  transition: all 0.3s ease;
}

.step-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: #fff;
  border: 2px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  color: #9ca3af;
  font-size: 14px;
  transition: all 0.3s ease;
  position: relative;
  z-index: 4;
}

.step-label {
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  margin-bottom: 4px;
  text-align: center;
  transition: all 0.3s ease;
}

.step-date {
  font-size: 11px;
  color: #9ca3af;
  text-align: center;
}

/* Estados de los pasos */
.timeline-step.completed .step-icon {
  background-color: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.timeline-step.completed .step-label {
  color: #3b82f6;
  font-weight: 600;
}

.timeline-step.current .step-icon {
  background-color: #fff;
  border-color: #3b82f6;
  border-width: 3px;
  color: #3b82f6;
  transform: scale(1.2);
}

.timeline-step.current .step-label {
  color: #1e40af;
  font-weight: 600;
}

/* Efecto de pulso para el paso actual */
.timeline-step.current.pulse .step-icon::after {
  content: '';
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid #3b82f6;
  animation: pulse 2s infinite;
  box-sizing: border-box;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  70% {
    transform: scale(1.5);
    opacity: 0;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

/* Responsive */
@media (max-width: 768px) {
  .timeline-steps {
    flex-direction: column;
    align-items: flex-start;
    padding-left: 16px;
  }
  
  .timeline-step {
    flex-direction: row;
    margin-bottom: 16px;
    width: 100%;
  }
  
  .timeline-progress-container {
    top: 0;
    bottom: 0;
    left: 16px;
    width: 4px;
    height: auto;
    transform: none;
  }
  
  .timeline-progress-bar {
    top: 0;
    left: 0;
    width: 100% !important;
    height: var(--progress-height);
  }
  
  .step-icon {
    margin-right: 12px;
    margin-bottom: 0;
  }
  
  .step-label, .step-date {
    text-align: left;
  }
  
  .step-date {
    margin-left: 8px;
    color: #6b7280;
  }
}

/* Animaciones */
.animate__animated {
  animation-duration: 0.5s;
}

.animate__fadeIn {
  animation-name: fadeIn;
}

.animate__fadeInUp {
  animation-name: fadeInUp;
}

.animate__fadeInDown {
  animation-name: fadeInDown;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translate3d(0, 20px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translate3d(0, -20px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}
`;

// Agregar estilos al cargar la página
document.addEventListener('DOMContentLoaded', function() {
  // Crear elemento de estilo y agregar los estilos CSS
  const styleElement = document.createElement('style');
  styleElement.textContent = ticketTimelineStyles;
  document.head.appendChild(styleElement);
  
  // Reemplazar funciones originales con las mejoradas
  if (typeof window.showTicketDetails === 'function') {
    window.originalShowTicketDetails = window.showTicketDetails;
    window.showTicketDetails = showTicketDetailsEnhanced;
  }
  
  if (typeof window.processTicketsData === 'function') {
    window.originalProcessTicketsData = window.processTicketsData;
    window.processTicketsData = processTicketsDataEnhanced;
  }