/**
 * estadisticas-visuals.js - Visualizaciones para el dashboard de estadísticas
 * 
 * Este archivo contiene las funcionalidades específicas de visualización:
 * - Gráficos con Chart.js
 * - Tablas de datos
 * - Visualización de KPIs
 * - Exportación de datos
 * - Ventanas modales
 */

// Variables globales para gráficos
let charts = {
    estado: null,
    tendencia: null,
    technician: null,
    category: null,
    timeByTechnician: null
  };
  
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
  
  // Configuración global de Chart.js
  if (window.Chart) {
    Chart.defaults.font.family = "'Poppins', sans-serif";
    Chart.defaults.color = '#64748b';
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(17, 24, 39, 0.9)';
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.cornerRadius = 6;
    Chart.defaults.plugins.tooltip.titleFont = { weight: 'bold', size: 13 };
    Chart.defaults.plugins.legend.labels.padding = 15;
  }
  
  /**
   * Actualiza los KPIs y tarjetas de resumen
   */
  function updateDashboard() {
    // Contar tickets por estado
    const totalTickets = filteredTickets.length;
    
    // CORRECCIÓN: Mejora en la identificación de tickets "En Curso"
    const inCourse = filteredTickets.filter(t => {
      const estado = (t.Estado || '').toLowerCase();
      return estado.includes('curso') || estado.includes('progres') || estado.includes('process');
    }).length;
    
    const waiting = filteredTickets.filter(t => {
      const estado = (t.Estado || '').toLowerCase();
      return estado.includes('espera') || estado.includes('waiting') || estado.includes('stand by');
    }).length;
    
    const resolved = filteredTickets.filter(t => {
      const estado = (t.Estado || '').toLowerCase();
      return estado.includes('resuelto') || estado.includes('resolved') || estado.includes('cerrado') || estado.includes('closed');
    }).length;
    
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
    // CORRECCIÓN: Asegurar que los números se vean bien
    const totalTicketsElement = document.getElementById('totalTickets');
    if (totalTicketsElement) totalTicketsElement.textContent = totalTickets.toString();
    
    const cardTotalTicketsElement = document.getElementById('cardTotalTickets');
    if (cardTotalTicketsElement) cardTotalTicketsElement.textContent = totalTickets.toString();
    
    const cardInCourseElement = document.getElementById('cardInCourse');
    if (cardInCourseElement) cardInCourseElement.textContent = inCourse.toString();
    
    const cardWaitingElement = document.getElementById('cardWaiting');
    if (cardWaitingElement) cardWaitingElement.textContent = waiting.toString();
    
    const cardAvgTimeElement = document.getElementById('cardAvgTime');
    if (cardAvgTimeElement) cardAvgTimeElement.textContent = `${avgTime}h`;
    
    // Actualizar porcentajes
    const inCoursePercentElement = document.getElementById('inCoursePercent');
    if (inCoursePercentElement) inCoursePercentElement.textContent = `${inCoursePercent}%`;
    
    const waitingPercentElement = document.getElementById('waitingPercent');
    if (waitingPercentElement) waitingPercentElement.textContent = `${waitingPercent}%`;
    
    // Actualizar barras de progreso
    const inCourseProgressBar = document.querySelector('#inCourseCard .progress-bar');
    if (inCourseProgressBar) inCourseProgressBar.style.width = `${inCoursePercent}%`;
    
    const waitingProgressBar = document.querySelector('#waitingCard .progress-bar');
    if (waitingProgressBar) waitingProgressBar.style.width = `${waitingPercent}%`;
    
    // Indicadores de tendencia (simulados para este ejemplo)
    const ticketsTrendElement = document.getElementById('ticketsTrend');
    if (ticketsTrendElement) ticketsTrendElement.textContent = '+5%';
    
    const avgTimeTrendElement = document.getElementById('avgTimeTrend');
    if (avgTimeTrendElement) avgTimeTrendElement.textContent = '-2%';
    
    // Actualizar ancho de las barras de progreso para los indicadores de tendencia
    const totalTicketsProgressBar = document.querySelector('#totalTicketsCard .progress-bar');
    if (totalTicketsProgressBar) totalTicketsProgressBar.style.width = '75%';
    
    const avgTimeProgressBar = document.querySelector('#avgTimeCard .progress-bar');
    if (avgTimeProgressBar) avgTimeProgressBar.style.width = '60%';
  }
  
  /**
   * Actualiza todos los gráficos del dashboard
   */
  function updateCharts() {
    if (window.Chart) {
      updateEstadoChart();
      updateTendenciaChart();
      updateTechnicianChart();
      updateCategoryChart();
      updateTimeByTechnicianChart();
    } else {
      console.warn('Chart.js no está disponible, no se pueden actualizar los gráficos');
    }
  }
  
  /**
   * Actualiza el gráfico de distribución por estado
   */
  function updateEstadoChart() {
    // Contar tickets por estado
    const estados = {
      'Nuevos': filteredTickets.filter(t => {
        const estado = (t.Estado || '').toLowerCase();
        return estado.includes('nuevo') || estado.includes('new');
      }).length,
      
      'En curso': filteredTickets.filter(t => {
        const estado = (t.Estado || '').toLowerCase();
        return estado.includes('curso') || estado.includes('progres') || estado.includes('process');
      }).length,
      
      'En espera': filteredTickets.filter(t => {
        const estado = (t.Estado || '').toLowerCase();
        return estado.includes('espera') || estado.includes('waiting') || estado.includes('stand by');
      }).length,
      
      'Resueltos': filteredTickets.filter(t => {
        const estado = (t.Estado || '').toLowerCase();
        return estado.includes('resuelto') || estado.includes('resolved') || 
               estado.includes('cerrado') || estado.includes('closed');
      }).length,
      
      'Otros': filteredTickets.filter(t => {
        const estado = (t.Estado || '').toLowerCase();
        return !estado.includes('nuevo') && !estado.includes('new') && 
               !estado.includes('curso') && !estado.includes('progres') && !estado.includes('process') &&
               !estado.includes('espera') && !estado.includes('waiting') && !estado.includes('stand by') &&
               !estado.includes('resuelto') && !estado.includes('resolved') &&
               !estado.includes('cerrado') && !estado.includes('closed');
      }).length
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
    
    // CORRECCIÓN: Ordenar técnicos alfabéticamente en vez de por cantidad
    const sortedTechs = Object.keys(techData).sort((a, b) => 
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
    
    // Limitar a los 10 técnicos
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
    
    // CORRECCIÓN: Ordenar técnicos alfabéticamente
    const sortedTechs = Object.keys(techData).sort((a, b) => 
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
    
    // Limitar a los 5 técnicos
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
   * CORRECCIÓN: Mejora en la visualización de números y ordenamiento alfabético
   */
  function updateTechnicianTable() {
    // Obtener meses únicos
    const allMonths = getUniqueMonths(filteredTickets);
    
    // Obtener datos de técnicos
    const technicianData = getTechnicianStats(filteredTickets);
    
    // Actualizar encabezados de la tabla
    const headerRow = document.querySelector('#technicianTable thead tr');
    if (headerRow) {
      let headerHtml = `
        <th class="text-left">
          <div class="flex items-center">
            <i class="fas fa-user-shield mr-2"></i>
            TÉCNICO
          </div>
        </th>
      `;
      
      // Añadir encabezados para cada mes
      allMonths.forEach(month => {
        headerHtml += `
          <th class="text-center">
            <div class="flex items-center justify-center">
              <i class="far fa-calendar mr-2"></i>
              ${formatMonth(month).toUpperCase()}
            </div>
          </th>
        `;
      });
      
      // Añadir encabezado para el total
      headerHtml += `
        <th class="text-center">
          <div class="flex items-center justify-center">
            <i class="fas fa-hashtag mr-2"></i>
            TOTAL
          </div>
        </th>
      `;
      
      headerRow.innerHTML = headerHtml;
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
      
      // CORRECCIÓN: Ordenar técnicos alfabéticamente en lugar de por total de tickets
      const sortedTechs = Object.keys(technicianData).sort((a, b) => 
        a.localeCompare(b, 'es', { sensitivity: 'base' })
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
          
          // CORRECCIÓN: Mejorar visualización de números con estilos ajustados
          // Colores para diferentes rangos de valores
          if (count === 0) {
            badgeClass = 'bg-gray-100 text-gray-700';        // 0 = gris
          } else if (count <= 4) {
            badgeClass = 'bg-green-100 text-green-700';      // 1-4 = verde
          } else if (count <= 20) {
            badgeClass = 'bg-yellow-100 text-yellow-700';    // 5-20 = amarillo
          } else {
            badgeClass = 'bg-red-100 text-red-700';          // 21+ = rojo
          }
          
          // CORRECCIÓN: Aumentar tamaño de los círculos y mejorar el formato de números
          tdMonth.innerHTML = `
            <span class="inline-flex items-center justify-center w-10 h-10 rounded-full ${badgeClass} text-base font-semibold ${count > 0 ? 'cursor-pointer hover:opacity-80' : ''}" 
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
        
        // CORRECCIÓN: Mejorar tamaño y visualización del total
        tdTotal.innerHTML = `
          <span class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white text-base font-semibold cursor-pointer hover:bg-blue-700" 
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
      let footerHtml = `
        <td class="py-3 px-6 font-semibold">
          <div class="flex items-center">
            <i class="fas fa-calculator mr-2"></i>
            Total General
          </div>
        </td>
      `;
      
      // Añadir totales por mes
      allMonths.forEach(month => {
        const monthTotal = monthTotals[month] || 0;
        footerHtml += `
          <td class="text-center py-3 px-6 font-semibold">${monthTotal}</td>
        `;
      });
      
      // Añadir total general
      footerHtml += `
        <td class="text-center py-3 px-6 font-semibold">${grandTotal}</td>
      `;
      
      tfoot.innerHTML = footerHtml;
    }
  }
  
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
    
    // Crear el modal directamente (sin usar template)
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    
    modal.innerHTML = `
      <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl flex flex-col">
        <div class="bg-blue-900 text-white px-6 py-4 rounded-t-lg flex justify-between items-center">
          <h3 class="text-lg font-semibold">
            ${mes ? `Tickets de ${tecnico} - ${formatMonth(mes)}` : `Tickets de ${tecnico}`}
          </h3>
          <button class="text-white hover:text-gray-200" id="closeModalBtn">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="p-6 overflow-y-auto max-h-[70vh]" id="modalContent">
          ${ticketsDetail.length === 0 ? `
            <div class="py-8 text-center text-gray-500">
              <i class="fas fa-search text-3xl mb-3"></i>
              <p>No se encontraron tickets para los criterios seleccionados</p>
            </div>
          ` : `
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
                    
                    if (estado.toLowerCase().includes('nuevo') || estado.toLowerCase().includes('new')) {
                      statusClass = 'badge-new';
                    } else if (estado.toLowerCase().includes('curso') || estado.toLowerCase().includes('progress')) {
                      statusClass = 'badge-progress';
                    } else if (estado.toLowerCase().includes('espera') || estado.toLowerCase().includes('waiting')) {
                      statusClass = 'badge-waiting';
                    } else if (estado.toLowerCase().includes('resuelto') || estado.toLowerCase().includes('resolved')) {
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
          `}
        </div>
        
        <div class="bg-gray-100 px-6 py-4 rounded-b-lg flex justify-end">
          <button class="bg-blue-900 text-white px-4 py-2 rounded hover:bg-blue-800" id="closeModalBtnBottom">
            Cerrar
          </button>
        </div>
      </div>
    `;
    
    // Añadir el modal al DOM
    document.body.appendChild(modal);
    
    // Configurar botones de cierre
    modal.querySelector('#closeModalBtn').addEventListener('click', () => {
      modal.remove();
    });
    
    modal.querySelector('#closeModalBtnBottom').addEventListener('click', () => {
      modal.remove();
    });
    
    // Cerrar al hacer clic fuera del contenido
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        modal.remove();
      }
    });
    
    // Añadir event listeners para las filas de tickets
    modal.querySelectorAll('tr[data-ticket-id]').forEach(row => {
      row.addEventListener('click', () => {
        const ticketId = row.getAttribute('data-ticket-id');
        if (ticketId) {
          window.open(`https://mda.senasa.gob.pe/front/ticket.form.php?id=${ticketId}`, '_blank');
        }
      });
    });
  }
  
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
          ticketsToSend = filteredTickets.filter(t => {
            const estado = (t.Estado || '').toLowerCase();
            return estado.includes('curso') || estado.includes('progres') || estado.includes('process');
          });
          reportLabel = 'En Curso';
          break;
        case 'espera':
          ticketsToSend = filteredTickets.filter(t => {
            const estado = (t.Estado || '').toLowerCase();
            return estado.includes('espera') || estado.includes('waiting') || estado.includes('stand by');
          });
          reportLabel = 'En Espera';
          break;
        case 'nuevos':
          ticketsToSend = filteredTickets.filter(t => {
            const estado = (t.Estado || '').toLowerCase();
            return estado.includes('nuevo') || estado.includes('new');
          });
          reportLabel = 'Nuevos';
          break;
        case 'resueltos':
          ticketsToSend = filteredTickets.filter(t => {
            const estado = (t.Estado || '').toLowerCase();
            return estado.includes('resuelto') || estado.includes('resolved') || 
                  estado.includes('cerrado') || estado.includes('closed');
          });
          reportLabel = 'Resueltos';
          break;
        default:
          ticketsToSend = filteredTickets;
          reportLabel = 'Todos';
          break;
      }
      
      // Generar HTML para el correo
      const technicianData = getTechnicianStats(ticketsToSend);
      
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
      
      // CORRECCIÓN: Ordenar técnicos alfabéticamente
      const sortedTechs = Object.keys(technicianData).sort((a, b) => 
        a.localeCompare(b, 'es', { sensitivity: 'base' })
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
      const totalTickets = ticketsToSend.length;
      let totalTime = 0;
      let ticketsWithTime = 0;
      
      ticketsToSend.forEach(ticket => {
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
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
          <div style="background-color: #1e3a8a; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Reporte de Tickets SENASA</h1>
            <p style="margin: 10px 0 0 0;">Estado: ${reportLabel} | Fecha: ${new Date().toLocaleDateString('es-ES')}</p>
          </div>
          
          <div style="padding: 20px; background-color: #f8fafc;">
            ${message ? `<p style="margin-bottom: 20px;">${message}</p>` : ''}
            
            <div style="background-color: white; padding: 20px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
              <h2 style="color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-top: 0;">
                Resumen de Tickets ${reportLabel}
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
      
      // Enviar el correo (simulación)
      // En producción, conectar esto a tu endpoint de correo
      fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: recipient,
          subject: subject,
          html: emailHtml
        })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Error en el servidor');
        }
        return response.json();
      })
      .then(data => {
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