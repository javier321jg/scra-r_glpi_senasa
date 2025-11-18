/**
 * SENASA - Estadísticas de Tickets
 * Parte 1: Funciones principales y gráficos
 */

// Registrar plugin de Chart.js para etiquetas de datos
Chart.register(ChartDataLabels);

// Variables globales
let allTickets = [];
let filteredTickets = [];
let currentPage = 1;
let rowsPerPage = 10;
let estadoChart, tendenciaChart, technicianChart;
let miniCharts = {};
let avgTimeStateChart, heatmapData;
const ANIMATION_DURATION = 800;

// Paletas de colores
const CHART_COLORS = {
  blue: ['rgba(59, 130, 246, 0.7)', 'rgba(59, 130, 246, 1)'],
  yellow: ['rgba(251, 191, 36, 0.7)', 'rgba(251, 191, 36, 1)'],
  orange: ['rgba(249, 115, 22, 0.7)', 'rgba(249, 115, 22, 1)'],
  green: ['rgba(16, 185, 129, 0.7)', 'rgba(16, 185, 129, 1)'],
  purple: ['rgba(139, 92, 246, 0.7)', 'rgba(139, 92, 246, 1)'],
  red: ['rgba(239, 68, 68, 0.7)', 'rgba(239, 68, 68, 1)'],
  gray: ['rgba(156, 163, 175, 0.7)', 'rgba(156, 163, 175, 1)']
};

// Paleta completa para gráficos con múltiples colores
const COLOR_PALETTE = [
  'rgba(59, 130, 246, 0.7)',
  'rgba(16, 185, 129, 0.7)',
  'rgba(251, 191, 36, 0.7)',
  'rgba(249, 115, 22, 0.7)',
  'rgba(139, 92, 246, 0.7)',
  'rgba(239, 68, 68, 0.7)',
  'rgba(14, 165, 233, 0.7)',
  'rgba(20, 184, 166, 0.7)',
  'rgba(168, 85, 247, 0.7)',
  'rgba(236, 72, 153, 0.7)',
  'rgba(234, 179, 8, 0.7)'
];

// Conexión WebSocket mediante Socket.IO
const socket = io(window.location.origin, { 
  transports: ['websocket'], 
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

// ======== Eventos de Socket.IO ========
socket.on('connect', () => {
  console.log('✅ Conectado a WebSocket');
  updateConnectionStatus('Conectado', 'bg-green-500');
  showNotification('✅ Conexión establecida', 'success');
});

socket.on('connect_error', (error) => {
  console.error('❌ Error de conexión:', error);
  updateConnectionStatus('Error de conexión', 'bg-red-500');
  showNotification('❌ Error de conexión al servidor', 'error');
});

socket.on('disconnect', () => {
  console.log('🔌 Desconectado del WebSocket');
  updateConnectionStatus('Desconectado', 'bg-red-500');
  showNotification('🔌 Conexión perdida', 'warning');
});

/**
 * Al recibir 'tickets_update', guardamos los datos en allTickets,
 * actualizamos la interfaz y las gráficas con animaciones.
 */
socket.on('tickets_update', (data) => {
  console.log('📊 Datos recibidos:', data);
  
  // Mostrar notificación de actualización
  showNotification('📊 Datos actualizados', 'info');
  
  // Almacenar tickets
  allTickets = [...(data.en_curso || []), ...(data.espera || [])];
  
  if (data.last_update) {
    const lastUpdateEl = document.getElementById('lastUpdate');
    lastUpdateEl.innerHTML = `<i class="fas fa-sync-alt mr-2"></i> Actualizado: ${data.last_update}`;
    lastUpdateEl.classList.add('pulse');
    setTimeout(() => lastUpdateEl.classList.remove('pulse'), 2000);
  }
  
  // Aplicar filtros actuales
  filteredTickets = allTickets;
  
  // Actualizar UI con animaciones
  updateDashboardWithAnimation(filteredTickets);
  updateAllCharts(filteredTickets);
  updateTechnicianTable(filteredTickets);
  
  // Generar datos para mapa de calor
  generateHeatmapData(filteredTickets);
  updateHeatmap();
  
  // Actualizar información de rendimiento
  updateTechPerformance(filteredTickets);
});

// ======== Funciones de UI y UX ========

/**
 * Actualiza el estado de conexión con animación y estilo
 */
function updateConnectionStatus(text, bgClass) {
  const statusEl = document.getElementById('connectionStatus');
  if (statusEl) {
    statusEl.innerHTML = `<i class="fas fa-wifi mr-2"></i><span>${text}</span>`;
    statusEl.className = `fixed bottom-4 right-4 text-white px-3 py-2 rounded-lg shadow-lg flex items-center z-50 transition-all ${bgClass}`;
    
    // Aplicar animación pulsante brevemente
    statusEl.classList.add('pulse');
    setTimeout(() => statusEl.classList.remove('pulse'), 2000);
  }
}

/**
 * Muestra una notificación emergente
 * @param {string} message - Mensaje a mostrar
 * @param {string} type - Tipo de notificación: 'success', 'error', 'warning', 'info'
 */
function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  
  // Configurar estilos según tipo
  let icon, color, bgColor, borderColor;
  
  switch (type) {
    case 'success':
      icon = 'fas fa-check-circle';
      color = 'text-green-500';
      bgColor = 'bg-green-50';
      borderColor = 'border-green-500';
      break;
    case 'error':
      icon = 'fas fa-times-circle';
      color = 'text-red-500';
      bgColor = 'bg-red-50';
      borderColor = 'border-red-500';
      break;
    case 'warning':
      icon = 'fas fa-exclamation-triangle';
      color = 'text-yellow-500';
      bgColor = 'bg-yellow-50';
      borderColor = 'border-yellow-500';
      break;
    case 'info':
    default:
      icon = 'fas fa-info-circle';
      color = 'text-blue-500';
      bgColor = 'bg-blue-50';
      borderColor = 'border-blue-500';
      break;
  }
  
  // Construir contenido
  notification.innerHTML = `
    <div class="flex items-center">
      <i class="${icon} text-lg ${color} mr-3"></i>
      <div>
        <p class="text-gray-800 font-medium">${message}</p>
      </div>
      <button class="ml-auto text-gray-400 hover:text-gray-500" onclick="this.parentElement.parentElement.classList.add('translate-x-full')">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;
  
  // Aplicar estilos
  notification.className = `fixed bottom-20 right-4 max-w-xs ${bgColor} rounded-lg shadow-lg p-4 ${borderColor} border-l-4 transform transition-all duration-500`;
  
  // Mostrar notificación con animación
  notification.classList.remove('hidden', 'translate-x-full');
  
  // Ocultar después de 4 segundos
  setTimeout(() => {
    notification.classList.add('translate-x-full');
  }, 4000);
}

/**
 * Actualiza el panel de control con animación de conteo
 */
function updateDashboardWithAnimation(tickets) {
  // Recuperar valores actuales para animar desde ellos
  const currentTotal = parseInt(document.getElementById('totalTickets').textContent) || 0;
  const currentInCourse = parseInt(document.getElementById('cardInCourse').textContent) || 0;
  const currentWaiting = parseInt(document.getElementById('cardWaiting').textContent) || 0;
  const currentAvgTime = parseFloat(document.getElementById('cardAvgTime').textContent) || 0;
  
  // Calcular nuevos valores
  const newTotal = tickets.length;
  const inCourse = tickets.filter(t => t.Estado === 'En curso (asignada)').length;
  const waiting = tickets.filter(t => t.Estado === 'En espera').length;
  const totalDuration = tickets.reduce((sum, t) => sum + (parseFloat(t.Duracion) || 0), 0);
  const avgTime = tickets.length > 0 ? (totalDuration / tickets.length).toFixed(1) : 0;
  
  // Animar contadores
  animateCounter('totalTickets', currentTotal, newTotal);
  animateCounter('cardTotalTickets', currentTotal, newTotal);
  animateCounter('cardInCourse', currentInCourse, inCourse);
  animateCounter('cardWaiting', currentWaiting, waiting);
  animateCounter('cardAvgTime', currentAvgTime, avgTime, true);
  
  // Actualizar tendencias en tarjetas
  updateTrends(newTotal, inCourse, waiting, avgTime);
  
  // Actualizar mini gráficos en tarjetas
  updateMiniCharts(tickets);
}

/**
 * Anima un contador desde un valor inicial hasta uno final
 */
function animateCounter(elementId, startValue, endValue, isTime = false) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  element.classList.add('count-animation');
  
  // Si los valores son iguales, solo actualizar con formato
  if (startValue === endValue) {
    element.textContent = isTime ? `${endValue}h` : endValue.toString();
    setTimeout(() => element.classList.remove('count-animation'), 500);
    return;
  }
  
  // Para valores pequeños, animación rápida
  const duration = Math.min(1000, Math.abs(endValue - startValue) * 50);
  const startTime = performance.now();
  
  function updateCounter(currentTime) {
    const elapsedTime = currentTime - startTime;
    const progress = Math.min(elapsedTime / duration, 1);
    
    // Función de ease-out para desaceleración al final
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    
    const currentValue = startValue + (endValue - startValue) * easedProgress;
    element.textContent = isTime ? `${currentValue.toFixed(1)}h` : Math.round(currentValue).toString();
    
    if (progress < 1) {
      requestAnimationFrame(updateCounter);
    } else {
      element.textContent = isTime ? `${endValue}h` : endValue.toString();
      element.classList.remove('count-animation');
    }
  }
  
  requestAnimationFrame(updateCounter);
}

/**
 * Actualiza indicadores de tendencia en las tarjetas
 */
function updateTrends(totalTickets, inCourse, waiting, avgTime) {
  // En un sistema real, estas tendencias se calcularían con datos históricos
  // Aquí simulamos algunos valores para demostración
  
  // Tendencia para total de tickets (simulada)
  const totalTrend = Math.floor(Math.random() * 8) - 3; // Entre -3% y +5%
  updateTrendIndicator('totalTicketsTrend', totalTrend);
  
  // Tendencia para tickets en curso (simulada)
  const inCourseTrend = Math.floor(Math.random() * 6) - 2; // Entre -2% y +4%
  updateTrendIndicator('inCourseTrend', inCourseTrend);
  
  // Tendencia para tickets en espera (simulada)
  const waitingTrend = Math.floor(Math.random() * 5) - 3; // Entre -3% y +2%
  updateTrendIndicator('waitingTrend', waitingTrend);
  
  // Tendencia para tiempo promedio (simulada)
  const timeTrend = Math.floor(Math.random() * 4) - 2; // Entre -2% y +2%
  updateTrendIndicator('avgTimeTrend', timeTrend);
}

/**
 * Actualiza un indicador de tendencia con color e icono
 */
function updateTrendIndicator(elementId, trendValue) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  let iconClass, colorClass;
  
  if (trendValue > 0) {
    iconClass = 'fas fa-arrow-up';
    colorClass = elementId === 'waitingTrend' || elementId === 'avgTimeTrend' 
      ? 'text-red-500' : 'text-green-500';
  } else if (trendValue < 0) {
    iconClass = 'fas fa-arrow-down';
    colorClass = elementId === 'waitingTrend' || elementId === 'avgTimeTrend'
      ? 'text-green-500' : 'text-red-500';
  } else {
    iconClass = 'fas fa-minus';
    colorClass = 'text-gray-500';
  }
  
  // Actualizar contenido con animación
  element.innerHTML = `<i class="${iconClass}"></i> ${Math.abs(trendValue)}%`;
  element.className = `ml-2 text-sm ${colorClass}`;
}

/**
 * Actualiza mini gráficos en las tarjetas
 */
function updateMiniCharts(tickets) {
  updateTotalTicketsMiniChart(tickets);
  updateInCourseMiniChart(tickets);
  updateWaitingMiniChart(tickets);
  updateAvgTimeMiniChart(tickets);
}

/**
 * Actualiza el mini gráfico de total de tickets
 */
function updateTotalTicketsMiniChart(tickets) {
  const ctx = document.getElementById('totalTicketsMiniChart').getContext('2d');
  
  // Agrupar tickets por mes (últimos 6 meses)
  const monthCounts = {};
  const today = new Date();
  
  // Inicializar últimos 6 meses
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today);
    d.setMonth(today.getMonth() - i);
    const monthYear = `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
    monthCounts[monthYear] = 0;
  }
  
  // Contar tickets por mes
  tickets.forEach(ticket => {
    const dateObj = parseDate(ticket.Fecha_apertura);
    const monthYear = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getFullYear()}`;
    
    if (monthCounts.hasOwnProperty(monthYear)) {
      monthCounts[monthYear]++;
    }
  });
  
  const labels = Object.keys(monthCounts);
  const data = Object.values(monthCounts);
  
  // Si ya existe el gráfico, actualizarlo
  if (miniCharts.totalTickets) {
    miniCharts.totalTickets.data.labels = labels;
    miniCharts.totalTickets.data.datasets[0].data = data;
    miniCharts.totalTickets.update();
  } else {
    // Crear nuevo gráfico
    miniCharts.totalTickets = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          borderColor: CHART_COLORS.blue[1],
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        },
        animation: {
          duration: ANIMATION_DURATION
        },
        elements: {
          line: {
            tension: 0.4
          }
        }
      }
    });
  }
}

/**
 * Actualiza el mini gráfico de tickets en curso
 */
function updateInCourseMiniChart(tickets) {
  const ctx = document.getElementById('inCourseMiniChart').getContext('2d');
  
  // Agrupar tickets en curso por mes (últimos 6 meses)
  const monthCounts = {};
  const today = new Date();
  
  // Inicializar últimos 6 meses
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today);
    d.setMonth(today.getMonth() - i);
    const monthYear = `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
    monthCounts[monthYear] = 0;
  }
  
  // Contar tickets en curso por mes
  tickets.filter(t => t.Estado === 'En curso (asignada)').forEach(ticket => {
    const dateObj = parseDate(ticket.Fecha_apertura);
    const monthYear = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getFullYear()}`;
    
    if (monthCounts.hasOwnProperty(monthYear)) {
      monthCounts[monthYear]++;
    }
  });
  
  const labels = Object.keys(monthCounts);
  const data = Object.values(monthCounts);
  
  // Si ya existe el gráfico, actualizarlo
  if (miniCharts.inCourse) {
    miniCharts.inCourse.data.labels = labels;
    miniCharts.inCourse.data.datasets[0].data = data;
    miniCharts.inCourse.update();
  } else {
    // Crear nuevo gráfico
    miniCharts.inCourse = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          borderColor: CHART_COLORS.yellow[1],
          backgroundColor: 'rgba(251, 191, 36, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        },
        animation: {
          duration: ANIMATION_DURATION
        },
        elements: {
          line: {
            tension: 0.4
          }
        }
      }
    });
  }
}

/**
 * Actualiza el mini gráfico de tickets en espera
 */
function updateWaitingMiniChart(tickets) {
  const ctx = document.getElementById('waitingMiniChart').getContext('2d');
  
  // Agrupar tickets en espera por mes (últimos 6 meses)
  const monthCounts = {};
  const today = new Date();
  
  // Inicializar últimos 6 meses
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today);
    d.setMonth(today.getMonth() - i);
    const monthYear = `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
    monthCounts[monthYear] = 0;
  }
  
  // Contar tickets en espera por mes
  tickets.filter(t => t.Estado === 'En espera').forEach(ticket => {
    const dateObj = parseDate(ticket.Fecha_apertura);
    const monthYear = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getFullYear()}`;
    
    if (monthCounts.hasOwnProperty(monthYear)) {
      monthCounts[monthYear]++;
    }
  });
  
  const labels = Object.keys(monthCounts);
  const data = Object.values(monthCounts);
  
  // Si ya existe el gráfico, actualizarlo
  if (miniCharts.waiting) {
    miniCharts.waiting.data.labels = labels;
    miniCharts.waiting.data.datasets[0].data = data;
    miniCharts.waiting.update();
  } else {
    // Crear nuevo gráfico
    miniCharts.waiting = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          borderColor: CHART_COLORS.orange[1],
          backgroundColor: 'rgba(249, 115, 22, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        },
        animation: {
          duration: ANIMATION_DURATION
        },
        elements: {
          line: {
            tension: 0.4
          }
        }
      }
    });
  }
}

/**
 * Actualiza el mini gráfico de tiempo promedio
 */
function updateAvgTimeMiniChart(tickets) {
  const ctx = document.getElementById('avgTimeMiniChart').getContext('2d');
  
  // Calcular tiempo promedio por mes (últimos 6 meses)
  const monthAvgTimes = {};
  const monthTicketCounts = {};
  const today = new Date();
  
  // Inicializar últimos 6 meses
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today);
    d.setMonth(today.getMonth() - i);
    const monthYear = `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
    monthAvgTimes[monthYear] = 0;
    monthTicketCounts[monthYear] = 0;
  }
  
  // Calcular sumas por mes
  tickets.forEach(ticket => {
    const dateObj = parseDate(ticket.Fecha_apertura);
    const monthYear = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getFullYear()}`;
    const duration = parseFloat(ticket.Duracion) || 0;
    
    if (monthAvgTimes.hasOwnProperty(monthYear)) {
      monthAvgTimes[monthYear] += duration;
      monthTicketCounts[monthYear]++;
    }
  });
  
  // Calcular promedios
  const labels = Object.keys(monthAvgTimes);
  const data = labels.map(month => 
    monthTicketCounts[month] > 0 ? 
    (monthAvgTimes[month] / monthTicketCounts[month]).toFixed(1) : 0
  );
  
  // Si ya existe el gráfico, actualizarlo
  if (miniCharts.avgTime) {
    miniCharts.avgTime.data.labels = labels;
    miniCharts.avgTime.data.datasets[0].data = data;
    miniCharts.avgTime.update();
  } else {
    // Crear nuevo gráfico
    miniCharts.avgTime = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          borderColor: CHART_COLORS.green[1],
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        },
        animation: {
          duration: ANIMATION_DURATION
        },
        elements: {
          line: {
            tension: 0.4
          }
        }
      }
    });
  }
}

/**
 * Actualiza todos los gráficos de la página
 */
function updateAllCharts(tickets) {
  updateEstadoChart(tickets);
  updateTendenciaChart(tickets);
  updateTechnicianChart(tickets);
  updateAvgTimeStateChart(tickets);
}