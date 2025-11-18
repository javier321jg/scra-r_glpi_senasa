// Estado global
let currentTickets = [];
let currentPage = 1;
const itemsPerPage = 10;

// Configuración del WebSocket
const socketOptions = {
  transports: ['websocket'],
  upgrade: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  autoConnect: true
};

// Conexión WebSocket
const socket = io(window.location.origin, socketOptions);

// Manejadores de eventos WebSocket
socket.on('connect', () => {
  console.log('[WebSocket] Conectado exitosamente');
  updateConnectionStatus('Conectado', 'bg-green-500');
});

socket.on('connect_error', (error) => {
  console.error('[WebSocket] Error de conexión:', error);
  updateConnectionStatus('Error de conexión', 'bg-red-500');
});

socket.on('disconnect', () => {
  console.log('[WebSocket] Desconectado');
  updateConnectionStatus('Desconectado', 'bg-red-500');
});

socket.on('tickets_update', (data) => {
  console.log('[WebSocket] Datos recibidos:', data);
  let ticketsArray = [];
  
  if (data.tickets) {
    ticketsArray = data.tickets;
  } else if (data.en_curso && data.espera) {
    ticketsArray = [...data.en_curso, ...data.espera];
  }
  
  if (ticketsArray.length > 0) {
    currentTickets = ticketsArray;
    updateDashboard(ticketsArray);
    updateTable(ticketsArray);
    if (data.last_update) {
      document.getElementById('lastUpdate').textContent = `Última actualización: ${data.last_update}`;
    }
  }
});

// Función de búsqueda mejorada
function enhancedSearch(searchTerm) {
  if (!searchTerm) return currentTickets;
  
  searchTerm = searchTerm.toLowerCase();
  return currentTickets.filter(ticket => {
    return Object.entries(ticket).some(([key, value]) => {
      if (typeof value === 'string' || typeof value === 'number') {
        return value.toString().toLowerCase().includes(searchTerm);
      }
      return false;
    });
  });
}

// Implementación del debounce para la búsqueda
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Búsqueda con debounce
const debouncedSearch = debounce((term) => {
  const filtered = enhancedSearch(term);
  updateTable(filtered);
}, 300);

// Actualizar estado de conexión
function updateConnectionStatus(text, className) {
  const statusElement = document.getElementById('connectionStatus');
  if (statusElement) {
    statusElement.textContent = text;
    statusElement.className = `connection-status ${className} text-white`;
  }
}

// Actualizar dashboard con animaciones
function updateDashboard(tickets) {
  const total = tickets.length;
  const inCourse = tickets.filter(t => t.Estado === 'En curso (asignada)').length;
  const waiting = tickets.filter(t => t.Estado === 'En espera').length;
  
  const totalTime = tickets.reduce((acc, ticket) => acc + (parseFloat(ticket.Tiempo_resolucion) || 0), 0);
  const avgTime = total > 0 ? Math.round(totalTime / total) : 0;

  // Actualizar valores con animaciones
  animateValue('totalTickets', total);
  animateValue('totalTicketsCard', total);
  animateValue('inCourseCard', inCourse);
  animateValue('waitingCard', waiting);
  animateValue('avgTimeCard', avgTime, 'h');

  // Añadir animación a las tarjetas
  ['totalTicketsCard', 'inCourseCard', 'waitingCard', 'avgTimeCard'].forEach(id => {
    const card = document.getElementById(id);
    card.classList.add('animate__animated', 'animate__pulse');
    setTimeout(() => card.classList.remove('animate__animated', 'animate__pulse'), 1000);
  });
}

// Animación de números
function animateValue(elementId, value, suffix = '') {
  const element = document.getElementById(elementId)?.querySelector('p') || 
                 document.getElementById(elementId);
  if (!element) return;

  const duration = 1000;
  const start = parseInt(element.textContent);
  const range = value - start;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const current = Math.floor(start + (range * progress));
    element.textContent = current + suffix;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// Función mejorada para formatear fechas
function formatDate(dateStr) {
  if (!dateStr) return '-';
  
  // Limpiamos el string de fecha de posibles caracteres no deseados
  dateStr = dateStr.trim().split('\n')[0].trim();
  
  // Intentamos diferentes formatos de fecha
  let date;
  
  // Patrón para fechas en formato "DD-MM-YYYY HH:mm"
  const pattern1 = /(\d{2})-(\d{2})-(\d{4})\s*(\d{2}):(\d{2})/;
  // Patrón para fechas en formato "YYYY-MM-DD HH:mm:ss"
  const pattern2 = /(\d{4})-(\d{2})-(\d{2})\s*(\d{2}):(\d{2}):(\d{2})/;
  
  if (pattern1.test(dateStr)) {
    // Convertir DD-MM-YYYY a YYYY-MM-DD para crear el objeto Date
    date = new Date(dateStr.replace(pattern1, '$3-$2-$1 $4:$5'));
  } else if (pattern2.test(dateStr)) {
    date = new Date(dateStr);
  } else {
    // Si no coincide con ningún patrón conocido, intentamos parsear directamente
    date = new Date(dateStr);
  }

  // Verificar si la fecha es válida
  if (isNaN(date.getTime())) {
    console.warn('Fecha inválida:', dateStr);
    return dateStr; // Retornamos el string original si no podemos parsearlo
  }

  // Formatear la fecha
  try {
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch (error) {
    console.error('Error al formatear fecha:', error);
    return dateStr;
  }
}

// Función para formatear el tiempo de resolución
function formatResolutionTime(timeStr) {
  if (!timeStr) return { date: '-', percent: 0 };
  
  // Limpiamos el string
  timeStr = timeStr.trim();
  
  // Extraer fecha y porcentaje
  const dateMatch = timeStr.match(/(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2})/);
  const percentMatch = timeStr.match(/(\d+)%/);
  
  return {
    date: dateMatch ? formatDate(dateMatch[1]) : '-',
    percent: percentMatch ? parseInt(percentMatch[1]) : 0
  };
}

// Función para obtener el color de la barra de progreso según el porcentaje
function getProgressColor(percent) {
  if (percent <= 25) return 'bg-red-500';
  if (percent <= 50) return 'bg-yellow-500';
  if (percent <= 75) return 'bg-blue-500';
  return 'bg-green-500';
}

// Actualizar tabla con animaciones
function updateTable(tickets) {
  const tbody = document.getElementById('ticketsTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTickets = tickets.slice(startIndex, endIndex);

  paginatedTickets.forEach((ticket, index) => {
    const row = document.createElement('tr');
    row.className = 'table-row hover:bg-gray-50 cursor-pointer animate__animated animate__fadeIn';
    row.style.animationDelay = `${index * 50}ms`;

    const { date: resolutionDate, percent: resolutionPercent } = formatResolutionTime(ticket.Tiempo_resolucion);
    const progressColor = getProgressColor(resolutionPercent);

    const cells = [
      { text: ticket.ID, class: 'text-gray-500' },
      { text: ticket.Título, class: 'text-gray-900 font-medium' },
      { text: ticket.Entidad, class: 'text-gray-500' },
      // Creamos el HTML personalizado para el estado
      { 
        html: getCustomStatusHTML(ticket.Estado),
        class: 'text-gray-500'
      },
      { text: formatDate(ticket.Fecha_apertura), class: 'text-gray-500' },
      { text: formatDate(ticket.Ultima_modificacion), class: 'text-gray-500' },
      { 
        html: `
          <div class="relative w-full min-w-[150px] p-2">
            <div class="flex justify-between mb-1 text-xs text-gray-600">
              <span>${resolutionDate}</span>
              <span class="font-semibold">${resolutionPercent}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2.5">
              <div class="${progressColor} h-2.5 rounded-full transition-all duration-500" 
                   style="width: ${resolutionPercent}%">
              </div>
            </div>
          </div>
        `,
        class: ''
      },
      { text: ticket.Duracion, class: 'text-gray-500' },
      { text: ticket.Delay, class: 'text-gray-500' },
      { text: ticket.Solicitante, class: 'text-gray-500' },
      { text: ticket.Asignado_a, class: 'text-gray-500' },
      { text: ticket.Categoria, class: 'text-gray-500' },
      { text: ticket.Tiempo_adicional, class: 'text-gray-500' },
      { text: ticket.Tipo, class: 'text-gray-500' },
      { text: ticket.Medio, class: 'text-gray-500' },
      { text: ticket.Prioridad, class: getPriorityClass(ticket.Prioridad) },
      { text: ticket.Ubicacion, class: 'text-gray-500' },
      { 
        text: '', 
        class: 'flex space-x-2',
        html: `
          <button class="p-1 text-blue-600 hover:text-blue-800" title="Ver detalles">
            <i class="fas fa-eye"></i>
          </button>
          <button class="p-1 text-green-600 hover:text-green-800" title="Editar">
            <i class="fas fa-edit"></i>
          </button>
        `
      }
    ];

    cells.forEach(cell => {
      const td = document.createElement('td');
      td.className = `px-4 py-3 whitespace-nowrap text-sm ${cell.class}`;
      if (cell.html) {
        td.innerHTML = cell.html;
      } else {
        td.textContent = cell.text || '-';
      }
      row.appendChild(td);
    });

    row.addEventListener('click', () => {
      window.location.href = `https://mda.senasa.gob.pe/front/ticket.form.php?id=${ticket.ID}`;
    });

    tbody.appendChild(row);
  });

  updatePagination(tickets.length);
}

// Función para generar el HTML del estado con el círculo de color y sin fondo
function getCustomStatusHTML(status) {
  if (status === 'En curso (asignada)') {
    return `<span class="flex items-center"><span class="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span><span class="text-orange-600">${status}</span></span>`;
  } else if (status === 'En espera') {
    return `<span class="flex items-center"><span class="inline-block w-2 h-2 rounded-full bg-orange-500 mr-2"></span><span class="text-orange-600">${status}</span></span>`;
  } else if (status === 'Resuelto') {
    return `<span class="flex items-center"><span class="inline-block w-2 h-2 rounded-full bg-green-600 mr-2"></span><span class="text-green-600">${status}</span></span>`;
  } else if (status === 'Pendiente') {
    return `<span class="flex items-center"><span class="inline-block w-2 h-2 rounded-full bg-red-500 mr-2"></span><span class="text-red-600">${status}</span></span>`;
  }
  return status;
}

// Clases para prioridades
function getPriorityClass(priority) {
  const classes = {
    'Alta': 'text-red-600 font-semibold',
    'Media': 'text-yellow-600',
    'Baja': 'text-green-600'
  };
  return classes[priority] || 'text-gray-500';
}

// Actualizar paginación
function updatePagination(totalItems) {
  document.getElementById('showing').textContent = 
    `${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, totalItems)}`;
  document.getElementById('total').textContent = totalItems;
  
  document.getElementById('prevPage').disabled = currentPage === 1;
  document.getElementById('nextPage').disabled = currentPage >= Math.ceil(totalItems / itemsPerPage);
}

// Exportar a CSV
function exportToCSV() {
  const headers = ['ID', 'Título', 'Estado', 'Prioridad', 'Fecha_apertura', 'Asignado_a'];
  const csvContent = [
    headers.join(','),
    ...currentTickets.map(ticket => headers.map(header => `"${ticket[header]}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `tickets_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Splash Screen
  setTimeout(() => {
    const splashScreen = document.getElementById('splashScreen');
    splashScreen.classList.add('animate__animated', 'animate__fadeOut');
    setTimeout(() => splashScreen.style.display = 'none', 1000);
  }, 2000);

  // Fecha actual
  const currentDate = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  document.getElementById('currentDate').textContent = currentDate;

  // Event listeners para filtros
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
  });

  ['filterPriority', 'filterEstado', 'filterCategoria'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', applyFilters);
  });

  // Event listeners para paginación
  document.getElementById('prevPage')?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      updateTable(currentTickets);
    }
  });

  document.getElementById('nextPage')?.addEventListener('click', () => {
    const maxPages = Math.ceil(currentTickets.length / itemsPerPage);
    if (currentPage < maxPages) {
      currentPage++;
      updateTable(currentTickets);
    }
  });

  // Event listeners para tarjetas de estadísticas
  ['totalTicketsCard', 'inCourseCard', 'waitingCard', 'avgTimeCard'].forEach((id, index) => {
    document.getElementById(id)?.addEventListener('click', () => {
      currentPage = 1;
      let filtered = currentTickets;
      switch(index) {
        case 1:
          filtered = currentTickets.filter(t => t.Estado === 'En curso (asignada)');
          break;
        case 2:
          filtered = currentTickets.filter(t => t.Estado === 'En espera');
          break;
      }
      updateTable(filtered);
    });
  });
});

// Aplicar filtros
function applyFilters() {
  const priority = document.getElementById('filterPriority')?.value;
  const estado = document.getElementById('filterEstado')?.value;
  const categoria = document.getElementById('filterCategoria')?.value;
  const searchTerm = document.getElementById('searchInput')?.value;
  
  let filtered = currentTickets;
  
  if (searchTerm) {
    filtered = enhancedSearch(searchTerm);
  }
  if (priority) {
    filtered = filtered.filter(t => t.Prioridad === priority);
  }
  if (estado) {
    filtered = filtered.filter(t => t.Estado === estado);
  }
  if (categoria) {
    filtered = filtered.filter(t => t.Categoria === categoria);
  }
  
  currentPage = 1;
  updateTable(filtered);
}

// Estilos adicionales para la barra de progreso
const styles = document.createElement('style');
styles.textContent = `
  .progress-bar-container {
    background: rgba(255, 255, 255, 0.9);
    border-radius: 0.5rem;
    padding: 0.75rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    transition: all 0.3s ease;
  }

  .progress-bar {
    background: #ddd;
    border-radius: 999px;
    height: 8px;
    overflow: hidden;
    position: relative;
  }

  .progress-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    transition: width 0.5s ease-out;
  }

  .progress-text {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    color: #64748b;
  }
`;
document.head.appendChild(styles);