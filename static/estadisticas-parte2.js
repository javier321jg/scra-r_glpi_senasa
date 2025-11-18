/**
 * SENASA - Estadísticas de Tickets
 * Parte 2: Gráficos y visualizaciones principales
 */

/**
 * Actualiza el gráfico de distribución por estado
 */
function updateEstadoChart(tickets) {
    const estados = ['En curso (asignada)', 'En espera', 'Resuelto', 'Pendiente'];
    const counts = estados.map(estado => tickets.filter(t => t.Estado === estado).length);
    const total = counts.reduce((sum, value) => sum + value, 0);
    
    // Actualizar porcentajes en números
    if (total > 0) {
      document.getElementById('enCursoPorcentaje').textContent = `${Math.round(counts[0] / total * 100)}%`;
      document.getElementById('enEsperaPorcentaje').textContent = `${Math.round(counts[1] / total * 100)}%`;
      document.getElementById('resueltoPorcentaje').textContent = `${Math.round(counts[2] / total * 100)}%`;
      document.getElementById('pendientePorcentaje').textContent = `${Math.round(counts[3] / total * 100)}%`;
    }
    
    const ctx = document.getElementById('estadoChart').getContext('2d');
    
    const backgroundColors = [
      'rgba(251, 191, 36, 0.8)',
      'rgba(249, 115, 22, 0.8)',
      'rgba(16, 185, 129, 0.8)',
      'rgba(59, 130, 246, 0.8)'
    ];
    
    if (estadoChart) {
      estadoChart.data.datasets[0].data = counts;
      estadoChart.update();
    } else {
      estadoChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: estados,
          datasets: [{
            data: counts,
            backgroundColor: backgroundColors,
            borderColor: 'white',
            borderWidth: 2,
            hoverOffset: 15
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: { 
              position: 'bottom',
              labels: {
                boxWidth: 12,
                padding: 15
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.formattedValue;
                  const percentage = Math.round(context.raw / context.dataset.data.reduce((a, b) => a + b, 0) * 100);
                  return `${label}: ${value} (${percentage}%)`;
                }
              }
            },
            datalabels: {
              formatter: (value, ctx) => {
                const sum = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = Math.round((value / sum) * 100);
                return percentage > 5 ? `${percentage}%` : '';
              },
              color: '#fff',
              font: {
                weight: 'bold',
                size: 11
              }
            }
          },
          animation: {
            animateScale: true,
            animateRotate: true,
            duration: ANIMATION_DURATION
          }
        }
      });
    }
  }
  
  /**
   * Obtiene el número de semana de una fecha
   */
  function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }
  
  /**
   * Actualiza el gráfico de tendencia temporal
   */
  function updateTendenciaChart(tickets) {
    // Determinar el nivel de agrupación según el selector
    const period = document.getElementById('trendPeriod')?.value || 'month';
    
    let groupingFunction;
    let labelFormat;
    
    switch (period) {
      case 'week':
        groupingFunction = dateObj => {
          const year = dateObj.getFullYear();
          const weekNumber = getWeekNumber(dateObj);
          return `S${weekNumber}-${year}`;
        };
        labelFormat = 'Semana';
        break;
      case 'day':
        groupingFunction = dateObj => {
          return dateObj.toISOString().split('T')[0];
        };
        labelFormat = 'Día';
        break;
      case 'month':
      default:
        groupingFunction = dateObj => {
          return `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getFullYear()}`;
        };
        labelFormat = 'Mes';
        break;
    }
    
    // Agrupar tickets por período
    const periodCounts = {};
    
    tickets.forEach(ticket => {
      const dateObj = parseDate(ticket.Fecha_apertura);
      const periodKey = groupingFunction(dateObj);
      
      periodCounts[periodKey] = (periodCounts[periodKey] || 0) + 1;
    });
    
    // Ordenar cronológicamente
    const sortedLabels = Object.keys(periodCounts).sort((a, b) => {
      if (period === 'day') {
        return new Date(a) - new Date(b);
      } else if (period === 'week') {
        const [weekA, yearA] = a.substring(1).split('-').map(Number);
        const [weekB, yearB] = b.substring(1).split('-').map(Number);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
      } else {
        const [mA, yA] = a.split('-').map(Number);
        const [mB, yB] = b.split('-').map(Number);
        return yA !== yB ? yA - yB : mA - mB;
      }
    });
    
    const data = sortedLabels.map(label => periodCounts[label]);
    
    // Mantener solo los últimos 12 períodos si hay muchos
    const maxPeriods = 12;
    let displayLabels = sortedLabels;
    let displayData = data;
    
    if (sortedLabels.length > maxPeriods) {
      displayLabels = sortedLabels.slice(-maxPeriods);
      displayData = data.slice(-maxPeriods);
    }
    
    // Dar formato a las etiquetas según el período
    const formattedLabels = displayLabels.map(label => {
      if (period === 'day') {
        const date = new Date(label);
        return `${date.getDate()}/${date.getMonth() + 1}`;
      } else if (period === 'week') {
        return `Sem ${label.substring(1).split('-')[0]}`;
      } else {
        const [month, year] = label.split('-');
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${monthNames[parseInt(month) - 1]} ${year}`;
      }
    });
    
    const ctx = document.getElementById('tendenciaChart').getContext('2d');
    
    if (tendenciaChart) {
      tendenciaChart.data.labels = formattedLabels;
      tendenciaChart.data.datasets[0].data = displayData;
      tendenciaChart.options.scales.x.title.text = labelFormat;
      tendenciaChart.update();
    } else {
      tendenciaChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: formattedLabels,
          datasets: [{
            label: 'Tickets',
            data: displayData,
            fill: {
              target: 'origin',
              above: 'rgba(59, 130, 246, 0.1)'
            },
            borderColor: CHART_COLORS.blue[1],
            borderWidth: 3,
            pointBackgroundColor: CHART_COLORS.blue[1],
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              padding: 10,
              bodyFont: {
                size: 14
              },
              titleFont: {
                size: 16
              },
              callbacks: {
                title: function(tooltipItems) {
                  return tooltipItems[0].label;
                },
                label: function(context) {
                  return `Tickets: ${context.formattedValue}`;
                }
              }
            },
            datalabels: {
              align: 'top',
              offset: 0,
              formatter: (value) => value,
              color: CHART_COLORS.blue[1],
              font: {
                weight: 'bold'
              },
              display: function(context) {
                // Mostrar solo algunos valores para evitar sobrecarga
                return context.dataIndex % 2 === 0;
              }
            }
          },
          scales: {
            x: { 
              grid: {
                display: false
              },
              title: {
                display: true,
                text: labelFormat,
                padding: 10,
                color: '#64748b',
                font: {
                  size: 12,
                  weight: 'bold'
                }
              }
            },
            y: { 
              beginAtZero: true,
              grid: {
                color: 'rgba(0, 0, 0, 0.05)'
              },
              title: {
                display: true,
                text: 'Cantidad de Tickets',
                padding: 10,
                color: '#64748b',
                font: {
                  size: 12,
                  weight: 'bold'
                }
              },
              ticks: {
                precision: 0,
                stepSize: 1
              }
            }
          },
          animation: {
            duration: ANIMATION_DURATION
          },
          elements: {
            line: {
              tension: 0.3
            }
          },
          interaction: {
            mode: 'index',
            intersect: false
          }
        }
      });
    }
    
    // Actualizar gráfica al cambiar período
    document.getElementById('trendPeriod')?.addEventListener('change', function() {
      updateTendenciaChart(filteredTickets);
    });
  }
  
  /**
   * Actualiza el gráfico de tickets por técnico
   */
  function updateTechnicianChart(tickets) {
    const counts = {};
    tickets.forEach(ticket => {
      const tecnico = ticket.Asignado_a || 'Sin asignar';
      counts[tecnico] = (counts[tecnico] || 0) + 1;
    });
    
    // Ordenar por cantidad de tickets (descendente)
    const sortedTechnicians = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    
    // Limitar a 10 técnicos máximo para mejor visualización
    const maxTechnicians = 10;
    const topTechnicians = sortedTechnicians.slice(0, maxTechnicians);
    
    const labels = topTechnicians;
    const dataPoints = topTechnicians.map(tech => counts[tech]);
    
    // Colores dinámicos (uno para cada técnico)
    const backgroundColors = topTechnicians.map((_, i) => COLOR_PALETTE[i % COLOR_PALETTE.length]);
    
    const ctx = document.getElementById('technicianChart').getContext('2d');
    const chartType = document.getElementById('techGraphView')?.value || 'bar';
    
    // Configuraciones específicas según tipo de gráfico
    let chartConfig = {
      type: chartType === 'horizontalBar' ? 'bar' : chartType,
      data: {
        labels: labels,
        datasets: [{
          label: 'Tickets por Técnico',
          data: dataPoints,
          backgroundColor: backgroundColors,
          borderColor: backgroundColors.map(color => color.replace('0.7', '1')),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: chartType === 'horizontalBar' ? 'y' : 'x',
        plugins: {
          legend: { 
            display: chartType === 'polarArea',
            position: 'right'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.formattedValue;
                return `${label}: ${value} tickets`;
              }
            }
          },
          datalabels: {
            color: function(context) {
              return context.chart.config.type === 'polarArea' ? '#fff' : '#000';
            },
            font: {
              weight: 'bold',
              size: 11
            },
            formatter: function(value, context) {
              return value;
            },
            display: function(context) {
              return context.dataset.data[context.dataIndex] > 0;
            }
          }
        },
        scales: chartType !== 'polarArea' ? {
          x: {
            grid: {
              display: false
            },
            ticks: {
              autoSkip: true,
              maxRotation: 30,
              minRotation: 0
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0, 0, 0, 0.05)'
            },
            ticks: {
              precision: 0,
              stepSize: 1
            }
          }
        } : {},
        animation: {
          duration: ANIMATION_DURATION
        }
      }
    };
    
    // Si el gráfico existe, actualizarlo (incluso cambiando el tipo)
    if (technicianChart) {
      technicianChart.destroy();
    }
    
    technicianChart = new Chart(ctx, chartConfig);
    
    // Actualizar gráfica al cambiar tipo
    document.getElementById('techGraphView')?.addEventListener('change', function() {
      updateTechnicianChart(filteredTickets);
    });
  }
  
  /**
   * Actualiza el gráfico de tiempo promedio por estado
   */
  function updateAvgTimeStateChart(tickets) {
    const estados = ['En curso (asignada)', 'En espera', 'Resuelto', 'Pendiente'];
    
    // Calcular tiempo promedio por estado
    const stateDurations = {};
    const stateCounts = {};
    
    estados.forEach(estado => {
      stateDurations[estado] = 0;
      stateCounts[estado] = 0;
    });
    
    tickets.forEach(ticket => {
      const estado = ticket.Estado;
      const duration = parseFloat(ticket.Duracion) || 0;
      
      if (estados.includes(estado)) {
        stateDurations[estado] += duration;
        stateCounts[estado]++;
      }
    });
    
    // Calcular promedios
    const avgTimes = estados.map(estado => 
      stateCounts[estado] > 0 ? (stateDurations[estado] / stateCounts[estado]).toFixed(1) : 0
    );
    
    const ctx = document.getElementById('avgTimeStateChart').getContext('2d');
    
    // Colores por estado
    const backgroundColors = [
      'rgba(251, 191, 36, 0.8)',
      'rgba(249, 115, 22, 0.8)',
      'rgba(16, 185, 129, 0.8)',
      'rgba(59, 130, 246, 0.8)'
    ];
    
    if (avgTimeStateChart) {
      avgTimeStateChart.data.datasets[0].data = avgTimes;
      avgTimeStateChart.update();
    } else {
      avgTimeStateChart = new Chart(ctx, {
        type: 'radar',
        data: {
          labels: estados,
          datasets: [{
            label: 'Tiempo Promedio (horas)',
            data: avgTimes,
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            borderColor: CHART_COLORS.blue[1],
            borderWidth: 2,
            pointBackgroundColor: CHART_COLORS.blue[1],
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return `${context.formattedValue} horas`;
                }
              }
            },
            datalabels: {
              formatter: (value) => `${value}h`,
              color: '#4b5563',
              font: {
                weight: 'bold',
                size: 11
              },
              anchor: 'end',
              align: 'end',
              offset: 10
            }
          },
          scales: {
            r: {
              angleLines: {
                color: 'rgba(0, 0, 0, 0.1)'
              },
              grid: {
                color: 'rgba(0, 0, 0, 0.05)'
              },
              ticks: {
                backdropColor: 'transparent',
                precision: 0
              },
              pointLabels: {
                font: {
                  size: 12
                }
              },
              suggestedMin: 0
            }
          },
          animation: {
            duration: ANIMATION_DURATION
          }
        }
      });
    }
  }
  
  /**
   * Genera datos para el mapa de calor de actividad
   */
  function generateHeatmapData(tickets) {
    // Definir los técnicos a mostrar (limitamos a 5 para mejor visualización)
    const techCounts = {};
    tickets.forEach(ticket => {
      const tecnico = ticket.Asignado_a || 'Sin asignar';
      techCounts[tecnico] = (techCounts[tecnico] || 0) + 1;
    });
    
    // Ordenar por cantidad de tickets (descendente)
    const topTechnicians = Object.keys(techCounts)
      .sort((a, b) => techCounts[b] - techCounts[a])
      .slice(0, 5);
    
    // Inicializar datos del mapa de calor
    heatmapData = {};
    topTechnicians.forEach(tech => {
      heatmapData[tech] = {};
      // Inicializar todos los meses con cero
      for (let month = 1; month <= 12; month++) {
        const monthKey = month.toString().padStart(2, '0');
        heatmapData[tech][monthKey] = 0;
      }
    });
    
    // Contar tickets por técnico y mes
    tickets.forEach(ticket => {
      const tecnico = ticket.Asignado_a || 'Sin asignar';
      if (topTechnicians.includes(tecnico)) {
        const dateObj = parseDate(ticket.Fecha_apertura);
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        heatmapData[tecnico][month] = (heatmapData[tecnico][month] || 0) + 1;
      }
    });
  }
  
  /**
   * Actualiza la visualización del mapa de calor
   */
  function updateHeatmap() {
    if (!heatmapData) return;
    
    const container = document.getElementById('heatmapRows');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Para cada técnico, crear una fila en el mapa de calor
    Object.keys(heatmapData).forEach(tecnico => {
      const row = document.createElement('div');
      row.className = 'flex items-center mb-1';
      
      // Nombre del técnico (truncado si es necesario)
      const techName = document.createElement('div');
      techName.className = 'w-32 truncate pr-2 text-xs text-gray-600';
      techName.textContent = tecnico;
      
      // Contenedor de celdas
      const cellsContainer = document.createElement('div');
      cellsContainer.className = 'flex space-x-1';
      
      // Crear celdas para cada mes
      for (let month = 1; month <= 12; month++) {
        const monthKey = month.toString().padStart(2, '0');
        const count = heatmapData[tecnico][monthKey] || 0;
        
        const cell = document.createElement('div');
        cell.className = 'w-6 h-6 rounded transition-all duration-300 flex items-center justify-center text-xs';
        
        // Color según la cantidad
        if (count === 0) {
          cell.className += ' bg-gray-100 text-gray-400';
        } else if (count <= 5) {
          cell.className += ' bg-blue-100 text-blue-800';
        } else if (count <= 10) {
          cell.className += ' bg-blue-200 text-blue-800';
        } else if (count <= 15) {
          cell.className += ' bg-blue-300 text-blue-800';
        } else if (count <= 20) {
          cell.className += ' bg-blue-400 text-white';
        } else {
          cell.className += ' bg-blue-500 text-white';
        }
        
        // Añadir tooltip
        cell.setAttribute('data-tooltip', `${tecnico}: ${count} tickets en ${formatMonth(monthKey)}`);
        cell.className += ' tooltip';
        
        // Mostrar número solo si hay tickets
        cell.textContent = count > 0 ? count : '';
        
        cellsContainer.appendChild(cell);
      }
      
      row.appendChild(techName);
      row.appendChild(cellsContainer);
      container.appendChild(row);
    });
  }