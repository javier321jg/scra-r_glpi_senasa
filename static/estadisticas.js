/**
 * Dashboard de Estadísticas de Tickets
 * 
 * Este script gestiona la visualización de estadísticas de tickets,
 * incluyendo gráficos, tablas y funcionalidades interactivas.
 */

// Variables globales
let allTickets = [];
let filteredTickets = [];
let ticketsByMonth = {};
let ticketsByTechnician = {};
let charts = {
  estado: null,
  tendencia: null,
  technician: null,
  category: null,
  timeByTechnician: null
};

// Configuración global de Chart.js
Chart.defaults.font.family = "'Poppins', sans-serif";
Chart.defaults.color = '#64748b';
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(17, 24, 39, 0.9)';
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.cornerRadius = 6;
Chart.defaults.plugins.tooltip.titleFont = { weight: 'bold', size: 13 };
Chart.defaults.plugins.legend.labels.padding = 15;

// Paleta de colores para gráficos
const CHART_COLORS = {
  new: '#3b82f6',       // blue-500
  inProgress: '#eab308', // yellow-500
  waiting: '#f97316',    // orange-500
  resolved: '#22c55e',   // green-500
  gray: '#94a3b8',       // gray-400
  accent: '#818cf8',     // indigo-400
  highlight: '#ec4899',  // pink-500
  warning: '#ef4444',    // red-500
};

// Conexión WebSocket mediante Socket.IO
const socket = io(window.location.origin, { 
  transports: ['websocket'], 
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

// ======== Event Listeners ========

// Eventos Socket.IO
socket.on('connect', handleSocketConnect);
socket.on('disconnect', handleSocketDisconnect);
socket.on('connect_error', handleSocketError);
socket.on('tickets_update', handleTicketsUpdate);

// Eventos DOM
document.addEventListener('DOMContentLoaded', function() {
  // Inicializar interfaces interactivas
  initializeFilterListeners();
  initializeExportMenu();
  initializeDataRefresh();
  
  // Solicitar datos iniciales si es necesario
  fetchInitialData();
});

// ======== Socket Handlers ========

/**
 * Maneja la conexión exitosa del WebSocket
 */
function handleSocketConnect() {
  console.log('🔌 Conectado al WebSocket');
  updateConnectionStatus('Conectado', 'bg-green-500');
}

/**
 * Maneja la desconexión del WebSocket
 */
function handleSocketDisconnect() {
  console.warn('🔌 Desconectado del WebSocket');
  updateConnectionStatus('Desconectado', 'bg-red-500');
}

/**
 * Maneja errores de conexión del WebSocket
 * @param {Error} error - El error que ocurrió
 */
function handleSocketError(error) {
  console.error('🔌 Error de conexión:', error);
  updateConnectionStatus('Error de conexión', 'bg-red-500');
}

/**
 * Procesa los datos de tickets recibidos a través del WebSocket
 * @param {Object} data - Datos de tickets recibidos
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

// ======== Manipulación de Datos ========

/**
 * Busca tickets de la base de datos si no se reciben por WebSocket
 */
function fetchInitialData() {
  // Si ya tenemos datos, no es necesario
  if (allTickets.length > 0) return;
  
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
        .catch(error => {
          console.error('Error en endpoint de respaldo:', error);
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
      const category = ticket.category || detectTicketCategory(ticket);
      if (category !== categoryFilter) return false;
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
  } else if (estado.includes('curso') || estado.includes('progreso') || estado.includes('in progress')) {
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

// ======== Actualización de la UI ========

/**
 * Actualiza los KPIs y tarjetas de resumen
 */
function updateDashboard() {
  // Contar tickets por estado
  const totalTickets = filteredTickets.length;
  const inCourse = filteredTickets.filter(t => t.Estado?.includes('curso') || t.Estado?.includes('progress')).length;
  const waiting = filteredTickets.filter(t => t.Estado?.includes('espera') || t.Estado?.includes('waiting')).length;
  const resolved = filteredTickets.filter(t => t.Estado?.includes('resuelto') || t.Estado?.includes('resolved')).length;
  
  // Calcular porcentajes
  const inCoursePercent = totalTickets > 0 ? Math.round((inCourse / totalTickets) * 100) : 0;
  const waitingPercent = totalTickets > 0 ? Math.round((waiting / totalTickets) * 100) : 0;
  
  // Calcular tiempos promedio
  let totalDuration = 0;
  let ticketsWithDuration = 0;
  
  filteredTickets.forEach(ticket => {
    if (ticket.Duracion) {
      const duration = parseFloat(ticket.Duracion);
      if (!isNaN(duration)) {
        totalDuration += duration;
        ticketsWithDuration++;
      }
    }
  });
  
  const avgTime = ticketsWithDuration > 0 ? (totalDuration / ticketsWithDuration).toFixed(1) : 0;
  
  // Actualizar elementos en el DOM
  document.getElementById('totalTickets').textContent = totalTickets;
  document.getElementById('cardTotalTickets').textContent = totalTickets;
  document.getElementById('cardInCourse').textContent = inCourse;
  document.getElementById('cardWaiting').textContent = waiting;
  document.getElementById('cardAvgTime').textContent = `${avgTime}h`;
  
  // Actualizar porcentajes
  document.getElementById('inCoursePercent').textContent = `${inCoursePercent}%`;
  document.getElementById('waitingPercent').textContent = `${waitingPercent}%`;
  
  // Actualizar barras de progreso
  document.querySelector('#inCourseCard .progress-bar').style.width = `${inCoursePercent}%`;
  document.querySelector('#waitingCard .progress-bar').style.width = `${waitingPercent}%`;
  
  // Indicadores de tendencia (simulados para este ejemplo)
  document.getElementById('ticketsTrend').textContent = '+5%';
  document.getElementById('avgTimeTrend').textContent = '-2%';
  
  // Actualizar ancho de las barras de progreso para los indicadores de tendencia
  document.querySelector('#totalTicketsCard .progress-bar').style.width = '75%';
  document.querySelector('#avgTimeCard .progress-bar').style.width = '60%';
}

/**
 * Actualiza todos los gráficos del dashboard
 */
function updateCharts() {
  updateEstadoChart();
  updateTendenciaChart();
  updateTechnicianChart();
  updateCategoryChart();
  updateTimeByTechnicianChart();
}

/**
 * Actualiza el gráfico de distribución por estado
 */
function updateEstadoChart() {
  // Contar tickets por estado
  const estados = {
    'Nuevos': filteredTickets.filter(t => t.Estado?.includes('nuevo') || t.Estado?.includes('new')).length,
    'En curso': filteredTickets.filter(t => t.Estado?.includes('curso') || t.Estado?.includes('progress')).length,
    'En espera': filteredTickets.filter(t => t.Estado?.includes('espera') || t.Estado?.includes('waiting')).length,
    'Resueltos': filteredTickets.filter(t => t.Estado?.includes('resuelto') || t.Estado?.includes('resolved')).length,
    'Otros': filteredTickets.filter(t => 
      !t.Estado?.includes('nuevo') && !t.Estado?.includes('new') && 
      !t.Estado?.includes('curso') && !t.Estado?.includes('progress') &&
      !t.Estado?.includes('espera') && !t.Estado?.includes('waiting') &&
      !t.Estado?.includes('resuelto') && !t.Estado?.includes('resolved')
    ).length
  };
  
  const labels = Object.keys(estados);
  const data = Object.values(estados);
  const colors = [
    CHART_COLORS.new,
    CHART_COLORS.inProgress,
    CHART_COLORS.waiting,
    CHART_COLORS.resolved,
    CHART_COLORS.gray
  ];
  
  const ctx = document.getElementById('estadoChart')?.getContext('2d');
  if (!ctx) return;
  
  // Destruir gráfico anterior si existe
  if (charts.estado) {
    charts.estado.destroy();
  }
  
  // Crear nuevo gráfico
  charts.estado = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 20,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.raw;
              const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
              return `${context.label}: ${value} (${percentage})`;
            }
          }
        }
      },
      animation: {
        animateRotate: true,
        animateScale: true
      }
    }
  });
}

/**
 * Actualiza el gráfico de tendencia temporal
 */
function updateTendenciaChart() {
  // Agrupar tickets por mes
  const monthCounts = {};
  
  filteredTickets.forEach(ticket => {
    const dateObj = parseTicketDate(ticket.Fecha_apertura);
    if (!dateObj) return;
    
    const monthYear = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getFullYear()}`;
    monthCounts[monthYear] = (monthCounts[monthYear] || 0) + 1;
  });
  
  // Ordenar cronológicamente (más antiguo primero)
  const labels = Object.keys(monthCounts).sort((a, b) => {
    const [m1, y1] = a.split('-').map(Number);
    const [m2, y2] = b.split('-').map(Number);
    return (y1 - y2) || (m1 - m2);
  });
  
  const data = labels.map(label => monthCounts[label]);
  
  const ctx = document.getElementById('tendenciaChart')?.getContext('2d');
  if (!ctx) return;
  
  // Destruir gráfico anterior si existe
  if (charts.tendencia) {
    charts.tendencia.destroy();
  }
  
  // Crear nuevo gráfico
  charts.tendencia = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.map(formatMonth),
      datasets: [{
        label: 'Tickets',
        data: data,
        fill: {
          target: 'origin',
          above: 'rgba(59, 130, 246, 0.1)'
        },
        borderColor: CHART_COLORS.new,
        borderWidth: 3,
        tension: 0.3,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: CHART_COLORS.new,
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: {
            display: false
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          },
          ticks: {
            precision: 0
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          displayColors: false
        }
      }
    }
  });
}

/**
 * Actualiza el gráfico de tickets por técnico
 */
function updateTechnicianChart() {
  // Obtener datos de técnicos
  const techData = getTechnicianStats(filteredTickets);
  
  // Ordenar técnicos por total de tickets (descendente)
  const sortedTechs = Object.keys(techData).sort((a, b) => 
    techData[b].total - techData[a].total
  );
  
  // Limitar a los 10 técnicos con más tickets
  const topTechs = sortedTechs.slice(0, 10);
  const labels = topTechs;
  const data = topTechs.map(tech => techData[tech].total);
  
  const ctx = document.getElementById('technicianChart')?.getContext('2d');
  if (!ctx) return;
  
  // Destruir gráfico anterior si existe
  if (charts.technician) {
    charts.technician.destroy();
  }
  
  // Generar colores dinámicos
  const colors = data.map((_, index) => {
    const hue = (210 + index * 20) % 360;
    return `hsla(${hue}, 70%, 60%, 0.8)`;
  });
  
  // Crear nuevo gráfico
  charts.technician = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Tickets Asignados',
        data: data,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.8', '1')),
        borderWidth: 1,
        borderRadius: 6,
        maxBarThickness: 50
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          },
          ticks: {
            precision: 0
          }
        },
        y: {
          grid: {
            display: false
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `Tickets: ${context.raw}`;
            }
          }
        }
      }
    }
  });
}

/**
 * Actualiza el gráfico de tickets por categoría
 */
function updateCategoryChart() {
  // Obtener datos de categorías
  const categoryData = getCategoryStats(filteredTickets);
  
  const labels = Object.keys(categoryData);
  const data = Object.values(categoryData);
  
  const ctx = document.getElementById('categoryChart')?.getContext('2d');
  if (!ctx) return;
  
  // Destruir gráfico anterior si existe
  if (charts.category) {
    charts.category.destroy();
  }
  
  // Generar colores dinámicos
  const colors = [
    CHART_COLORS.new,
    CHART_COLORS.inProgress,
    CHART_COLORS.waiting,
    CHART_COLORS.resolved,
    CHART_COLORS.accent,
    CHART_COLORS.highlight,
    CHART_COLORS.gray
  ];
  
  // Crear nuevo gráfico
  charts.category = new Chart(ctx, {
    type: 'polarArea',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors.slice(0, data.length),
        borderWidth: 1,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          ticks: {
            display: false
          }
        }
      },
      plugins: {
        legend: {
          position: 'right',
          labels: {
            padding: 15
          }
        }
      }
    }
  });
}

/**
 * Actualiza el gráfico de tiempo promedio por técnico
 */
function updateTimeByTechnicianChart() {
  // Obtener datos de técnicos
  const techData = getTechnicianStats(filteredTickets);
  
  // Ordenar técnicos por tiempo promedio (descendente)
  const sortedTechs = Object.keys(techData).sort((a, b) => 
    techData[b].avgTime - techData[a].avgTime
  );
  
  // Limitar a los 5 técnicos con más tiempo promedio
  const topTechs = sortedTechs.slice(0, 5);
  const labels = topTechs;
  const data = topTechs.map(tech => techData[tech].avgTime.toFixed(1));
  
  const ctx = document.getElementById('timeByTechnicianChart')?.getContext('2d');
  if (!ctx) return;
  
  // Destruir gráfico anterior si existe
  if (charts.timeByTechnician) {
    charts.timeByTechnician.destroy();
  }
  
  // Crear nuevo gráfico
  charts.timeByTechnician = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Horas Promedio',
        data: data,
        backgroundColor: 'rgba(14, 165, 233, 0.7)',
        borderColor: 'rgb(14, 165, 233)',
        borderWidth: 1,
        borderRadius: 6,
        maxBarThickness: 40
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          },
          title: {
            display: true,
            text: 'Horas',
            font: {
              size: 12
            }
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.raw} horas promedio`;
            }
          }
        }
      }
    }
  });
}

/**
 * Actualiza la tabla de tickets por técnico
 */
function updateTechnicianTable() {
  // Obtener meses únicos
  const allMonths = getUniqueMonths(filteredTickets);
  
  // Obtener datos de técnicos
  const technicianData = getTechnicianStats(filteredTickets);
  
  // Actualizar encabezados de la tabla
  const headerRow = document.querySelector('#technicianTable thead tr');
  if (headerRow) {
    headerRow.innerHTML = `
      <th class="text-left">
        <div class="flex items-center">
          <i class="fas fa-user-shield mr-2"></i>
          Técnico
        </div>
      </th>
      ${allMonths.map(month => `
        <th class="text-center">
          <div class="flex items-center justify-center">
            <i class="far fa-calendar mr-2"></i>
            ${formatMonth(month)}
          </div>
        </th>
      `).join('')}
      <th class="text-center">
        <div class="flex items-center justify-center">
          <i class="fas fa-hashtag mr-2"></i>
          Total
        </div>
      </th>
    `;
  }
  
  // Inicializar conteo de totales por mes
  const monthTotals = {};
  allMonths.forEach(month => {
    monthTotals[month] = 0;
  });
  
  // Calcular totales por mes
  Object.values(technicianData).forEach(techData => {
    Object.entries(techData.months).forEach(([month, count]) => {
      if (monthTotals[month] !== undefined) {
        monthTotals[month] += count;
      }
    });
  });
  
  // Calcular total general
  const grandTotal = Object.values(technicianData).reduce((sum, tech) => sum + tech.total, 0);
  
  // Llenar cuerpo de la tabla
  const tbody = document.getElementById('technicianTableBody');
  if (tbody) {
    tbody.innerHTML = '';
    
    if (Object.keys(technicianData).length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${allMonths.length + 2}" class="text-center py-8 text-gray-500">
            No hay datos disponibles para los filtros seleccionados
          </td>
        </tr>
      `;
      return;
    }
    
    // Ordenar técnicos por total de tickets (descendente)
    const sortedTechs = Object.keys(technicianData).sort((a, b) => 
      technicianData[b].total - technicianData[a].total
    );
    
    sortedTechs.forEach(tecnico => {
      const data = technicianData[tecnico];
      
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-blue-50 transition-colors';
      
      // Celda del nombre del técnico
      const tdTech = document.createElement('td');
      tdTech.className = 'py-3 px-6';
      tdTech.innerHTML = `
        <div class="flex items-center cursor-pointer" data-technician="${tecnico}">
          <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mr-3">
            <i class="fas fa-user"></i>
          </div>
          <div class="font-medium text-gray-800 hover:text-blue-600 transition-colors">
            ${tecnico}
          </div>
        </div>
      `;
      tdTech.querySelector('[data-technician]').addEventListener('click', () => {
        showTicketDetailsByFilter(tecnico, null);
      });
      tr.appendChild(tdTech);
      
      // Celdas para cada mes
      allMonths.forEach(month => {
        const count = data.months[month] || 0;
        
        const tdMonth = document.createElement('td');
        tdMonth.className = 'text-center py-3 px-6';
        
        // Definir color según la cantidad
        let badgeClass;
        if (count === 0) {
          badgeClass = 'bg-gray-100 text-gray-700';
        } else if (count <= 5) {
          badgeClass = 'bg-green-100 text-green-700';
        } else if (count <= 10) {
          badgeClass = 'bg-blue-100 text-blue-700';
        } else if (count <= 15) {
          badgeClass = 'bg-yellow-100 text-yellow-700';
        } else {
          badgeClass = 'bg-red-100 text-red-700';
        }
        
        tdMonth.innerHTML = `
          <span class="inline-flex items-center justify-center w-10 h-6 rounded-full ${badgeClass} text-sm font-medium ${count > 0 ? 'cursor-pointer hover:opacity-80' : ''}" 
                ${count > 0 ? `data-technician="${tecnico}" data-month="${month}"` : ''}>
            ${count}
          </span>
        `;
        
        if (count > 0) {
          tdMonth.querySelector('[data-technician]').addEventListener('click', () => {
            showTicketDetailsByFilter(tecnico, month);
          });
        }
        
        tr.appendChild(tdMonth);
      });
      
      // Celda del total
      const tdTotal = document.createElement('td');
      tdTotal.className = 'text-center py-3 px-6';
      tdTotal.innerHTML = `
        <span class="inline-flex items-center justify-center min-w-[2.5rem] h-7 rounded-full bg-blue-600 text-white text-sm font-medium cursor-pointer hover:bg-blue-700" 
              data-technician="${tecnico}">
          ${data.total}
        </span>
      `;
      tdTotal.querySelector('[data-technician]').addEventListener('click', () => {
        showTicketDetailsByFilter(tecnico, null);
      });
      tr.appendChild(tdTotal);
      
      tbody.appendChild(tr);
    });
  }
  
  // Actualizar fila de totales
  const tfoot = document.querySelector('#technicianTable tfoot tr');
  if (tfoot) {
    tfoot.innerHTML = `
      <td class="py-3 px-6 font-semibold">
        <div class="flex items-center">
          <i class="fas fa-calculator mr-2"></i>
          Total General
        </div>
      </td>
      ${allMonths.map(month => `
        <td class="text-center py-3 px-6 font-semibold">${monthTotals[month] || 0}</td>
      `).join('')}
      <td class="text-center py-3 px-6 font-semibold">${grandTotal}</td>
    `;
  }
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

// ======== Inicialización de Interacciones ========

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
        filteredTickets = getFilteredTickets();
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

// ======== Funciones para Detalles de Tickets ========

/**
 * Muestra un modal con los detalles de tickets filtrados por técnico y/o mes
 * @param {String} tecnico - Nombre del técnico
 * @param {String} mes - Mes en formato 'MM-YYYY'
 */
function showTicketDetailsByFilter(tecnico, mes) {
  // Filtrar tickets según los parámetros
  let ticketsDetail;
  
  if (mes) {
    // Filtrar por técnico y mes
    ticketsDetail = filteredTickets.filter(ticket => {
      const ticketDate = parseTicketDate(ticket.Fecha_apertura);
      if (!ticketDate) return false;
      
      const ticketMonth = `${(ticketDate.getMonth() + 1).toString().padStart(2, '0')}-${ticketDate.getFullYear()}`;
      
      if (tecnico === 'Sin asignar') {
        return (!ticket.Asignado_a || ticket.Asignado_a.trim() === '') && ticketMonth === mes;
      } else {
        return ticket.Asignado_a === tecnico && ticketMonth === mes;
      }
    });
  } else {
    // Filtrar solo por técnico
    ticketsDetail = filteredTickets.filter(ticket => {
      if (tecnico === 'Sin asignar') {
        return !ticket.Asignado_a || ticket.Asignado_a.trim() === '';
      } else {
        return ticket.Asignado_a === tecnico;
      }
    });
  }
  
  // Clonar el template del modal
  const modalTemplate = document.getElementById('modalTemplate');
  if (!modalTemplate) return;
  
  const modalElement = document.importNode(modalTemplate.content, true);
  const modalNode = modalElement.querySelector('.fixed');
  
  // Configurar título del modal
  const modalTitle = modalElement.querySelector('h3');
  modalTitle.textContent = mes
    ? `Tickets de ${tecnico} - ${formatMonth(mes)}`
    : `Tickets de ${tecnico}`;
  
  // Generar contenido HTML de la tabla de tickets
  const modalContent = modalElement.querySelector('#modalContent');
  
  if (ticketsDetail.length === 0) {
    modalContent.innerHTML = `
      <div class="py-8 text-center text-gray-500">
        <i class="fas fa-search text-3xl mb-3"></i>
        <p>No se encontraron tickets para los criterios seleccionados</p>
      </div>
    `;
  } else {
    modalContent.innerHTML = `
      <div class="mb-4 bg-blue-50 p-4 rounded-lg">
        <div class="flex justify-between flex-wrap gap-2">
          <div>
            <span class="text-xs text-gray-500">Técnico:</span>
            <span class="ml-1 font-medium">${tecnico}</span>
          </div>
          ${mes ? `
          <div>
            <span class="text-xs text-gray-500">Periodo:</span>
            <span class="ml-1 font-medium">${formatMonth(mes)}</span>
          </div>
          ` : ''}
          <div>
            <span class="text-xs text-gray-500">Total tickets:</span>
            <span class="ml-1 font-medium">${ticketsDetail.length}</span>
          </div>
        </div>
      </div>
      
      <div class="rounded-lg border border-gray-200 overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Título</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duración</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            ${ticketsDetail.map(ticket => {
              // Determinar clase para el estado
              let statusClass = '';
              const estado = ticket.Estado || '';
              
              if (estado.includes('nuevo') || estado.includes('new')) {
                statusClass = 'badge-new';
              } else if (estado.includes('curso') || estado.includes('progress')) {
                statusClass = 'badge-progress';
              } else if (estado.includes('espera') || estado.includes('waiting')) {
                statusClass = 'badge-waiting';
              } else if (estado.includes('resuelto') || estado.includes('resolved')) {
                statusClass = 'badge-resolved';
              }
              
              return `
                <tr class="hover:bg-gray-50 cursor-pointer" data-ticket-id="${ticket.ID || ''}">
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">${ticket.ID || ''}</td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">${ticket.Fecha_apertura || ''}</td>
                  <td class="px-4 py-3 whitespace-nowrap">
                    <span class="badge ${statusClass}">${ticket.Estado || ''}</span>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-900 max-w-md truncate">${ticket.Título || ticket.Descripcion || ''}</td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">${ticket.Duracion ? ticket.Duracion + 'h' : '0h'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    
    // Añadir event listeners para las filas de tickets
    modalContent.querySelectorAll('tr[data-ticket-id]').forEach(row => {
      row.addEventListener('click', () => {
        const ticketId = row.getAttribute('data-ticket-id');
        if (ticketId) {
          window.open(`https://mda.senasa.gob.pe/front/ticket.form.php?id=${ticketId}`, '_blank');
        }
      });
    });
  }
  
  // Configurar botones de cierre
  modalElement.getElementById('closeModalBtn')?.addEventListener('click', () => {
    modalNode.remove();
  });
  
  modalElement.getElementById('closeModalBtnBottom')?.addEventListener('click', () => {
    modalNode.remove();
  });
  
  // Añadir el modal al DOM
  document.body.appendChild(modalNode);
  
  // Añadir listener para cerrar al hacer clic fuera del contenido
  modalNode.addEventListener('click', (event) => {
    if (event.target === modalNode) {
      modalNode.remove();
    }
  });
}

// ======== Funciones de Exportación ========

/**
 * Exporta la tabla a Excel
 */
async function exportTableToExcel() {
  try {
    showLoadingOverlay('Generando archivo Excel...');
    
    // Crear nuevo libro de trabajo
    const wb = XLSX.utils.book_new();
    wb.Props = {
      Title: "Reporte de Tickets SENASA",
      Subject: "Tickets por Técnico",
      Author: "SENASA",
      CreatedDate: new Date()
    };
    
    // Preparar los datos de la tabla
    const table = document.getElementById('technicianTable');
    const ws = XLSX.utils.table_to_sheet(table);
    
    // Ajustar ancho de columnas
    const wscols = Array(table.rows[0].cells.length).fill({ wch: 15 });
    ws['!cols'] = wscols;
    
    // Añadir la hoja al libro
    XLSX.utils.book_append_sheet(wb, ws, "Tickets por Técnico");
    
    // Crear segunda hoja con datos detallados
    const detailsWs = XLSX.utils.json_to_sheet(filteredTickets.map(ticket => ({
      ID: ticket.ID || '',
      Título: ticket.Título || '',
      Estado: ticket.Estado || '',
      Fecha_apertura: ticket.Fecha_apertura || '',
      Última_modificación: ticket.Ultima_modificacion || '',
      Duración: ticket.Duracion || '',
      Técnico: ticket.Asignado_a || 'Sin asignar',
      Categoría: ticket.Categoria || '',
      Prioridad: ticket.Prioridad || ''
    })));
    
    // Añadir la hoja de detalles
    XLSX.utils.book_append_sheet(wb, detailsWs, "Detalle de Tickets");
    
    // Generar archivo
    XLSX.writeFile(wb, `Reporte_Tickets_SENASA_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    hideLoadingOverlay();
    showToast('Archivo Excel generado correctamente', 'success');
  } catch (error) {
    console.error('Error al exportar a Excel:', error);
    hideLoadingOverlay();
    showToast('Error al generar el archivo Excel', 'error');
  }
}

/**
 * Exporta la tabla a PDF
 */
async function exportTableToPDF() {
  try {
    showLoadingOverlay('Generando archivo PDF...');
    
    const { jsPDF } = window.jspdf;
    // Creamos el PDF en orientación horizontal (landscape) y tamaño A4
    const pdf = new jsPDF('l', 'mm', 'a4');
    const fecha = new Date().toLocaleDateString('es-ES');
    
    // Añadir título y fecha
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Reporte de Tickets SENASA', 15, 15);
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Fecha: ${fecha}`, 15, 25);
    
    // Crear un contenedor temporal para la tabla
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.innerHTML = `
      <div style="background-color: white; padding: 20px; width: 1000px;">
        <h2 style="font-size: 18px; margin-bottom: 10px;">Reporte de Tickets por Técnico</h2>
        <p style="margin-bottom: 20px;">Fecha: ${fecha}</p>
        ${document.getElementById('technicianTable').outerHTML}
      </div>
    `;
    document.body.appendChild(container);
    
    // Capturar la tabla con html2canvas
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    
    // Eliminar el contenedor temporal
    container.remove();
    
    // Añadir la imagen al PDF
    const imgData = canvas.toDataURL('image/png');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth() - 30;
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 15, 35, pdfWidth, pdfHeight);
    
    // Añadir pie de página
    pdf.setFontSize(10);
    pdf.text('Sistema de Seguimiento de Tickets - SENASA', 15, pdf.internal.pageSize.getHeight() - 10);
    
    // Guardar el archivo PDF
    pdf.save(`Reporte_Tickets_SENASA_${new Date().toISOString().split('T')[0]}.pdf`);
    
    hideLoadingOverlay();
    showToast('Archivo PDF generado correctamente', 'success');
  } catch (error) {
    console.error('Error al exportar a PDF:', error);
    hideLoadingOverlay();
    showToast('Error al generar el archivo PDF', 'error');
  }
}

/**
 * Exporta la tabla a JPG
 */
async function exportTableToJPG() {
  try {
    showLoadingOverlay('Generando imagen JPG...');
    
    // Crear un contenedor temporal con estilo y la tabla
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.backgroundColor = 'white';
    container.style.padding = '30px';
    container.style.boxSizing = 'border-box';
    container.style.width = '1200px';
    
    // Añadir contenido con estilo
    container.innerHTML = `
      <div style="font-family: Arial, sans-serif;">
        <div style="display: flex; align-items: center; margin-bottom: 20px;">
          <img src="https://www.gob.pe/rails/active_storage/representations/redirect/eyJfcmFpbHMiOnsiZGF0YSI6MTQ1MDAsInB1ciI6ImJsb2JfaWQifX0=--d56e8d89845af7a460ccbe0d65ed319826301586/eyJfcmFpbHMiOnsiZGF0YSI6eyJmb3JtYXQiOiJwbmciLCJyZXNpemVfdG9fbGltaXQiOltudWxsLDQ4XX0sInB1ciI6InZhcmlhdGlvbiJ9fQ==--830247c4bafe7cadca50817d8559bf1a09e3aa28/Sin%20ti%CC%81tulo-1-01%20(1).png" 
               alt="SENASA Logo" 
               style="height: 60px; margin-right: 20px; background-color: white; padding: 5px; border-radius: 50%;">
          <div>
            <h1 style="font-size: 24px; margin: 0; color: #1e3a8a;">Reporte de Tickets SENASA</h1>
            <p style="margin: 5px 0 0 0; color: #64748b;">Fecha: ${new Date().toLocaleDateString('es-ES')}</p>
          </div>
        </div>
        
        <div style="margin-bottom: 20px; padding: 15px; background-color: #f8fafc; border-radius: 8px; display: flex; justify-content: space-between;">
          <div>
            <span style="font-size: 14px; color: #64748b;">Total de tickets:</span>
            <span style="font-weight: bold; margin-left: 5px;">${filteredTickets.length}</span>
          </div>
          <div>
            <span style="font-size: 14px; color: #64748b;">Última actualización:</span>
            <span style="font-weight: bold; margin-left: 5px;">${document.getElementById('lastUpdate')?.textContent || 'No disponible'}</span>
          </div>
        </div>
        
        ${document.getElementById('technicianTable').outerHTML}
        
        <p style="margin-top: 20px; font-size: 12px; color: #64748b; text-align: center;">
          Este reporte fue generado automáticamente desde el Sistema de Seguimiento de Tickets SENASA
        </p>
      </div>
    `;
    
    document.body.appendChild(container);
    
    // Mejorar estilos de la tabla exportada
    const table = container.querySelector('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.marginBottom = '20px';
    
    const cells = table.querySelectorAll('th, td');
    cells.forEach(cell => {
      cell.style.border = '1px solid #e2e8f0';
      cell.style.padding = '10px';
      cell.style.textAlign = cell.tagName === 'TH' ? 'center' : '';
    });
    
    const headers = table.querySelectorAll('th');
    headers.forEach(header => {
      header.style.backgroundColor = '#1e3a8a';
      header.style.color = 'white';
      header.style.fontWeight = 'bold';
    });
    
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach((row, index) => {
      row.style.backgroundColor = index % 2 === 0 ? 'white' : '#f8fafc';
    });
    
    const footer = table.querySelector('tfoot');
    if (footer) {
      const footerCells = footer.querySelectorAll('td');
      footerCells.forEach(cell => {
        cell.style.backgroundColor = '#e2e8f0';
        cell.style.fontWeight = 'bold';
      });
    }
    
    // Capturar la imagen
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    
    // Eliminar el contenedor temporal
    container.remove();
    
    // Convertir y descargar
    const link = document.createElement('a');
    link.download = `Reporte_Tickets_SENASA_${new Date().toISOString().split('T')[0]}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.9);
    link.click();
    
    hideLoadingOverlay();
    showToast('Imagen JPG generada correctamente', 'success');
  } catch (error) {
    console.error('Error al exportar a JPG:', error);
    hideLoadingOverlay();
    showToast('Error al generar la imagen JPG', 'error');
  }
}

/**
 * Función para enviar el reporte por correo electrónico
 */
function sendTicketsTableByEmail() {
  // Crear modal para el correo
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md">
      <div class="bg-blue-900 text-white px-6 py-4 rounded-t-lg flex justify-between items-center">
        <h3 class="text-lg font-semibold">Enviar Reporte por Correo</h3>
        <button class="text-white hover:text-gray-200" id="closeEmailModal">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="p-6">
        <form id="emailForm">
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="recipientEmail">
              Destinatario:
            </label>
            <input class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  id="recipientEmail" type="email" placeholder="correo@ejemplo.com" required>
          </div>
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="emailSubject">
              Asunto:
            </label>
            <input class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  id="emailSubject" type="text" value="Reporte de Tickets SENASA" required>
          </div>
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="reportType">
              Tipo de Reporte:
            </label>
            <select class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  id="reportType">
              <option value="all">Todos los tickets</option>
              <option value="en_curso">En curso</option>
              <option value="espera">En espera</option>
              <option value="nuevos">Nuevos</option>
              <option value="resueltos">Resueltos</option>
            </select>
          </div>
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="emailMessage">
              Mensaje:
            </label>
            <textarea class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    id="emailMessage" rows="3" placeholder="Mensaje opcional..."></textarea>
          </div>
          <div id="emailStatus" class="mb-4"></div>
          <div class="flex justify-end space-x-2">
            <button type="button" id="cancelEmailBtn" class="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400">
              Cancelar
            </button>
            <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
              <i class="fas fa-paper-plane mr-2"></i> Enviar
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Añadir listeners para los botones
  modal.querySelector('#closeEmailModal').addEventListener('click', () => {
    modal.remove();
  });
  
  modal.querySelector('#cancelEmailBtn').addEventListener('click', () => {
    modal.remove();
  });
  
  // Manejar envío del formulario
  modal.querySelector('#emailForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enviando...';
    
    const statusDiv = document.getElementById('emailStatus');
    statusDiv.innerHTML = '<div class="text-blue-500"><i class="fas fa-info-circle mr-2"></i>Enviando correo...</div>';
    
    const recipient = document.getElementById('recipientEmail').value;
    const subject = document.getElementById('emailSubject').value;
    const reportType = document.getElementById('reportType').value;
    const message = document.getElementById('emailMessage').value;
    
    // Filtrar tickets según el tipo de reporte
    let ticketsToSend;
    let reportLabel;
    
    switch(reportType) {
      case 'en_curso':
        ticketsToSend = filteredTickets.filter(t => t.Estado?.includes('curso') || t.Estado?.includes('progress'));
        reportLabel = 'En Curso';
        break;
      case 'espera':
        ticketsToSend = filteredTickets.filter(t => t.Estado?.includes('espera') || t.Estado?.includes('waiting'));
        reportLabel = 'En Espera';
        break;
      case 'nuevos':
        ticketsToSend = filteredTickets.filter(t => t.Estado?.includes('nuevo') || t.Estado?.includes('new'));
        reportLabel = 'Nuevos';
        break;
      case 'resueltos':
        ticketsToSend = filteredTickets.filter(t => t.Estado?.includes('resuelto') || t.Estado?.includes('resolved'));
        reportLabel = 'Resueltos';
        break;
      default:
        ticketsToSend = filteredTickets;
        reportLabel = 'Todos';
        break;
    }
    
    // Generar HTML para el correo
    const emailHtml = generateEmailHtml(ticketsToSend, reportLabel, message);
    
    // Enviar el correo
    sendEmail(recipient, subject, emailHtml)
      .then(response => {
        statusDiv.innerHTML = '<div class="text-green-500"><i class="fas fa-check-circle mr-2"></i>Correo enviado correctamente</div>';
        submitBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Enviado';
        
        // Cerrar el modal después de un breve retraso
        setTimeout(() => {
          modal.remove();
          showToast('Correo enviado correctamente', 'success');
        }, 1500);
      })
      .catch(error => {
        statusDiv.innerHTML = `
          <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4">
            <p class="font-bold">Error</p>
            <p>${error.message || 'Error al enviar el correo'}</p>
          </div>
        `;
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      });
  });
}

/**
 * Envía un correo a través del endpoint de la API
 * @param {String} recipient - Destinatario
 * @param {String} subject - Asunto
 * @param {String} htmlBody - Cuerpo HTML del correo
 * @returns {Promise} Promise con la respuesta del servidor
 */
async function sendEmail(recipient, subject, htmlBody) {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: recipient,
        subject: subject,
        html: htmlBody
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al enviar el correo');
    }
    
    return result;
  } catch (error) {
    console.error('Error al enviar correo:', error);
    throw error;
  }
}

/**
 * Genera el HTML para el cuerpo del correo
 * @param {Array} tickets - Tickets a incluir
 * @param {String} reportType - Tipo de reporte
 * @param {String} message - Mensaje adicional
 * @returns {String} HTML del correo
 */
function generateEmailHtml(tickets, reportType, message) {
  // Obtener datos de técnicos
  const technicianData = getTechnicianStats(tickets);
  
  // Crear tabla de técnicos para el correo
  let technicianTableHtml = `
    <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-family: Arial, sans-serif;">
      <thead>
        <tr style="background-color: #1e3a8a; color: white;">
          <th style="padding: 10px; text-align: left; border: 1px solid #e2e8f0;">Técnico</th>
          <th style="padding: 10px; text-align: center; border: 1px solid #e2e8f0;">Total Tickets</th>
          <th style="padding: 10px; text-align: center; border: 1px solid #e2e8f0;">Tiempo Promedio (h)</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  // Ordenar técnicos por total de tickets (descendente)
  const sortedTechs = Object.keys(technicianData).sort((a, b) => 
    technicianData[b].total - technicianData[a].total
  );
  
  // Añadir fila para cada técnico
  sortedTechs.forEach(tecnico => {
    const data = technicianData[tecnico];
    const avgTime = data.avgTime.toFixed(1);
    
    technicianTableHtml += `
      <tr style="background-color: #f8fafc;">
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${tecnico}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #e2e8f0;">${data.total}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #e2e8f0;">${avgTime}</td>
      </tr>
    `;
  });
  
  // Añadir fila de total
  const totalTickets = tickets.length;
  let totalTime = 0;
  let ticketsWithTime = 0;
  
  tickets.forEach(ticket => {
    if (ticket.Duracion) {
      const duration = parseFloat(ticket.Duracion);
      if (!isNaN(duration)) {
        totalTime += duration;
        ticketsWithTime++;
      }
    }
  });
  
  const avgTime = ticketsWithTime > 0 ? (totalTime / ticketsWithTime).toFixed(1) : '0.0';
  
  technicianTableHtml += `
      </tbody>
      <tfoot>
        <tr style="background-color: #1e3a8a; color: white;">
          <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0;">Total General</td>
          <td style="padding: 8px; text-align: center; font-weight: bold; border: 1px solid #e2e8f0;">${totalTickets}</td>
          <td style="padding: 8px; text-align: center; font-weight: bold; border: 1px solid #e2e8f0;">${avgTime}</td>
        </tr>
      </tfoot>
    </table>
  `;
  
  // Generar el HTML completo
  return `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <div style="background-color: #1e3a8a; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">Reporte de Tickets SENASA</h1>
        <p style="margin: 10px 0 0 0;">Estado: ${reportType} | Fecha: ${new Date().toLocaleDateString('es-ES')}</p>
      </div>
      
      <div style="padding: 20px; background-color: #f8fafc;">
        ${message ? `<p style="margin-bottom: 20px;">${message}</p>` : ''}
        
        <div style="background-color: white; padding: 20px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
          <h2 style="color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-top: 0;">
            Resumen de Tickets ${reportType}
          </h2>
          
          <div style="margin: 20px 0; padding: 15px; background-color: #f0f9ff; border-radius: 5px; border-left: 4px solid #3b82f6;">
            <div style="display: flex; justify-content: space-between; flex-wrap: wrap;">
              <div style="margin-bottom: 10px; min-width: 200px;">
                <span style="color: #64748b; font-size: 14px;">Total de tickets:</span>
                <span style="font-weight: bold; margin-left: 5px;">${totalTickets}</span>
              </div>
              <div style="margin-bottom: 10px; min-width: 200px;">
                <span style="color: #64748b; font-size: 14px;">Tiempo promedio:</span>
                <span style="font-weight: bold; margin-left: 5px;">${avgTime} horas</span>
              </div>
              <div style="margin-bottom: 10px; min-width: 200px;">
                <span style="color: #64748b; font-size: 14px;">Técnicos asignados:</span>
                <span style="font-weight: bold; margin-left: 5px;">${sortedTechs.length}</span>
              </div>
            </div>
          </div>
          
          ${technicianTableHtml}
          
          <p style="margin-top: 30px; font-size: 12px; color: #64748b;">
            Este reporte fue generado automáticamente desde el sistema de Tickets SENASA.
            Para más detalles, acceda al sistema.
          </p>
        </div>
      </div>
      
      <div style="background-color: #1e3a8a; color: white; padding: 15px; text-align: center; font-size: 12px;">
        © ${new Date().getFullYear()} SENASA - Servicio Nacional de Sanidad Agraria
      </div>
    </div>
  `;
}

// ======== Funciones de Utilidad ========

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
          <td colspan="3" class="text-center py-8 text-gray-500">
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