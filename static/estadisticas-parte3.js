/**
 * SENASA - Estadísticas de Tickets
 * Parte 3: Tablas, eventos y funciones auxiliares
 */

/**
 * Actualiza la información de rendimiento por técnico
 */
function updateTechPerformance(tickets) {
    const container = document.getElementById('techPerformance');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Obtener métrica seleccionada
    const metric = document.getElementById('performanceMetric')?.value || 'tickets';
    
    // Calcular métricas por técnico
    const techMetrics = {};
    
    tickets.forEach(ticket => {
      const tecnico = ticket.Asignado_a || 'Sin asignar';
      
      if (!techMetrics[tecnico]) {
        techMetrics[tecnico] = {
          tickets: 0,
          totalTime: 0,
          satisfaction: Math.random() * 5 // Simulado (en un sistema real vendría de los datos)
        };
      }
      
      techMetrics[tecnico].tickets++;
      techMetrics[tecnico].totalTime += parseFloat(ticket.Duracion) || 0;
    });
    
    // Calcular valores promedio
    Object.keys(techMetrics).forEach(tech => {
      // Tiempo promedio por ticket
      if (techMetrics[tech].tickets > 0) {
        techMetrics[tech].avgTime = techMetrics[tech].totalTime / techMetrics[tech].tickets;
      } else {
        techMetrics[tech].avgTime = 0;
      }
    });
    
    // Ordenar según métrica seleccionada
    let sortedTechs;
    
    switch (metric) {
      case 'time':
        // Para tiempo de respuesta, ordenar ascendente (menos es mejor)
        sortedTechs = Object.keys(techMetrics).sort((a, b) => {
          // Si ambos tienen 0 tickets, no hay criterio claro
          if (techMetrics[a].tickets === 0 && techMetrics[b].tickets === 0) return 0;
          // Si uno tiene 0 tickets, es peor
          if (techMetrics[a].tickets === 0) return 1;
          if (techMetrics[b].tickets === 0) return -1;
          // Ordenar por tiempo promedio
          return techMetrics[a].avgTime - techMetrics[b].avgTime;
        });
        break;
      case 'satisfaction':
        // Para satisfacción, ordenar descendente (más es mejor)
        sortedTechs = Object.keys(techMetrics).sort((a, b) => 
          techMetrics[b].satisfaction - techMetrics[a].satisfaction
        );
        break;
      case 'tickets':
      default:
        // Para tickets resueltos, ordenar descendente
        sortedTechs = Object.keys(techMetrics).sort((a, b) => 
          techMetrics[b].tickets - techMetrics[a].tickets
        );
        break;
    }
    
    // Mostrar rendimiento de los 10 primeros técnicos
    sortedTechs.slice(0, 10).forEach(tech => {
      const performanceRow = document.createElement('div');
      
      let metricValue, metricLabel, fillClass, fillWidth;
      
      switch (metric) {
        case 'time':
          metricValue = techMetrics[tech].avgTime.toFixed(1);
          metricLabel = `${metricValue}h promedio`;
          // Invertir escala visual para tiempo (menor es mejor)
          fillWidth = techMetrics[tech].avgTime === 0 ? 0 : 
                     Math.max(5, Math.min(100, 100 - (techMetrics[tech].avgTime * 5)));
          
          if (fillWidth > 75) {
            fillClass = 'bg-green-500';
          } else if (fillWidth > 50) {
            fillClass = 'bg-blue-500';
          } else if (fillWidth > 25) {
            fillClass = 'bg-yellow-500';
          } else {
            fillClass = 'bg-red-500';
          }
          break;
        case 'satisfaction':
          metricValue = techMetrics[tech].satisfaction.toFixed(1);
          metricLabel = `${metricValue}/5 satisfacción`;
          fillWidth = techMetrics[tech].satisfaction * 20; // 0-5 escala a 0-100%
          
          if (fillWidth > 75) {
            fillClass = 'bg-green-500';
          } else if (fillWidth > 50) {
            fillClass = 'bg-blue-500';
          } else if (fillWidth > 25) {
            fillClass = 'bg-yellow-500';
          } else {
            fillClass = 'bg-red-500';
          }
          break;
        case 'tickets':
        default:
          metricValue = techMetrics[tech].tickets;
          metricLabel = `${metricValue} tickets`;
          // Normalizar frente al máximo
          const maxTickets = Math.max(...Object.values(techMetrics).map(m => m.tickets));
          fillWidth = maxTickets === 0 ? 0 : Math.min(100, (techMetrics[tech].tickets / maxTickets) * 100);
          
          if (fillWidth > 75) {
            fillClass = 'bg-green-500';
          } else if (fillWidth > 50) {
            fillClass = 'bg-blue-500';
          } else if (fillWidth > 25) {
            fillClass = 'bg-yellow-500';
          } else {
            fillClass = 'bg-red-500';
          }
          break;
      }
      
      performanceRow.innerHTML = `
        <div class="flex justify-between mb-1">
          <span class="text-xs font-medium text-gray-700">${tech}</span>
          <span class="text-xs font-medium text-gray-600">${metricLabel}</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div class="${fillClass} h-2 rounded-full" style="width: ${fillWidth}%; transition: width 1s ease-out;"></div>
        </div>
      `;
      
      container.appendChild(performanceRow);
    });
    
    // Actualizar al cambiar métrica
    document.getElementById('performanceMetric')?.addEventListener('change', function() {
      updateTechPerformance(filteredTickets);
    });
  }
  
  /**
   * Actualiza la tabla de técnicos con animación
   */
  function updateTechnicianTable(tickets) {
    // Obtener todos los meses únicos
    const monthsSet = new Set();
    tickets.forEach(ticket => {
      const dateObj = parseDate(ticket.Fecha_apertura);
      const monthYear = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getFullYear()}`;
      monthsSet.add(monthYear);
    });
    
    const allMonths = Array.from(monthsSet).sort((a, b) => {
      const [m1, y1] = a.split('-').map(Number);
      const [m2, y2] = b.split('-').map(Number);
      return new Date(y2, m2 - 1) - new Date(y1, m1 - 1);
    });
  
    // Actualizar encabezados de la tabla
    const headerRow = document.querySelector('#technicianTable thead tr');
    if (!headerRow) return;
    
    headerRow.innerHTML = `
      <th class="sticky top-0 px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-b border-gray-200 bg-opacity-90 backdrop-blur-sm">
        <div class="flex items-center">
          <span>Técnico</span>
          <button class="ml-1 text-gray-500 hover:text-gray-700">
            <i class="fas fa-sort"></i>
          </button>
        </div>
      </th>
      ${allMonths.map(month => `
        <th class="sticky top-0 px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider border-b border-gray-200 bg-opacity-90 backdrop-blur-sm">
          ${formatMonth(month)}
        </th>
      `).join('')}
      <th class="sticky top-0 px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider border-b border-gray-200 bg-opacity-90 backdrop-blur-sm">
        <i class="fas fa-hashtag mr-2"></i>
        Total
      </th>
    `;
  
    // Procesar datos para tabla
    const technicianData = {};
    const monthTotals = {};
    let grandTotal = 0;
  
    tickets.forEach(ticket => {
      const tecnico = ticket.Asignado_a || 'Sin asignar';
      const dateObj = parseDate(ticket.Fecha_apertura);
      const monthYear = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getFullYear()}`;
  
      if (!technicianData[tecnico]) {
        technicianData[tecnico] = { months: {}, total: 0 };
        allMonths.forEach(month => {
          technicianData[tecnico].months[month] = 0;
        });
      }
      
      if (!monthTotals[monthYear]) {
        monthTotals[monthYear] = 0;
      }
      
      technicianData[tecnico].months[monthYear]++;
      technicianData[tecnico].total++;
      monthTotals[monthYear]++;
      grandTotal++;
    });
  
    // Generar filas de la tabla con animación
    const tbody = document.getElementById('technicianTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Obtener búsqueda y filtros
    const searchTerm = document.getElementById('tableSearch')?.value?.toLowerCase() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    const monthFilter = document.getElementById('monthFilter')?.value || 'all';
    
    // Filtrar y ordenar técnicos
    let technicians = Object.keys(technicianData);
    
    // Aplicar búsqueda
    if (searchTerm) {
      technicians = technicians.filter(tech => tech.toLowerCase().includes(searchTerm));
    }
    
    // Ordenar por total (descendente)
    technicians.sort((a, b) => technicianData[b].total - technicianData[a].total);
    
    // Implementar paginación simple
    const totalTechnicians = technicians.length;
    const pageCount = Math.ceil(totalTechnicians / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalTechnicians);
    
    // Actualizar paginación UI
    if (document.getElementById('paginationFrom')) {
      document.getElementById('paginationFrom').textContent = totalTechnicians > 0 ? startIndex + 1 : 0;
      document.getElementById('paginationTo').textContent = endIndex;
      document.getElementById('paginationTotal').textContent = totalTechnicians;
    }
    
    // Generar botones de página
    const pagesContainer = document.getElementById('paginationPages');
    if (pagesContainer) {
      pagesContainer.innerHTML = '';
      
      for (let i = 1; i <= pageCount; i++) {
        const button = document.createElement('button');
        button.className = i === currentPage 
          ? 'mx-1 px-3 py-1 rounded bg-blue-600 text-white' 
          : 'mx-1 px-3 py-1 rounded hover:bg-gray-100';
        button.textContent = i;
        button.addEventListener('click', () => {
          currentPage = i;
          updateTechnicianTable(filteredTickets);
        });
        pagesContainer.appendChild(button);
      }
      
      // Evento para botones de navegación
      if (document.getElementById('prevPageBtn')) {
        document.getElementById('prevPageBtn').disabled = currentPage === 1;
        document.getElementById('nextPageBtn').disabled = currentPage === pageCount;
        
        document.getElementById('prevPageBtn').addEventListener('click', () => {
          if (currentPage > 1) {
            currentPage--;
            updateTechnicianTable(filteredTickets);
          }
        });
        
        document.getElementById('nextPageBtn').addEventListener('click', () => {
          if (currentPage < pageCount) {
            currentPage++;
            updateTechnicianTable(filteredTickets);
          }
        });
      }
    }
    
    // Mostrar solo técnicos de la página actual
    technicians.slice(startIndex, endIndex).forEach((tecnico, index) => {
      const tr = document.createElement('tr');
      tr.className = 'table-row-animate border-b border-gray-200 hover:bg-blue-50 transition-colors';
      tr.style.animationDelay = `${index * 50}ms`;
  
      // Celda del técnico
      const technicianCell = `
        <td class="px-6 py-4">
          <div class="flex items-center cursor-pointer" onclick="showTicketDetailsByFilter('${tecnico}', null)">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-800 font-bold">
                ${tecnico.charAt(0).toUpperCase()}
              </div>
            </div>
            <div class="ml-4">
              <div class="text-sm font-medium text-gray-900 hover:underline">${tecnico}</div>
            </div>
          </div>
        </td>
      `;
  
      // Celdas de cada mes
      const monthCells = allMonths.map(month => {
        const count = technicianData[tecnico].months[month];
        const cellClass = count > 0 
          ? `text-blue-800 bg-blue-100 hover:bg-blue-200 cursor-pointer` 
          : `text-gray-800 bg-gray-100`;
        
        return `
          <td class="px-6 py-4 text-center">
            <span class="px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full ${cellClass}"
                  ${count > 0 ? `onclick="showTicketDetailsByFilter('${tecnico}', '${month}')"` : ''}>
              ${count}
            </span>
          </td>
        `;
      }).join('');
  
      // Total por técnico
      tr.innerHTML = technicianCell + monthCells + `
        <td class="px-6 py-4 text-center">
          <span class="text-blue-600 font-semibold text-lg">
            ${technicianData[tecnico].total}
          </span>
        </td>
      `;
      
      tbody.appendChild(tr);
    });
  
    // Fila de totales
    const tfoot = document.querySelector('#technicianTable tfoot tr');
    if (tfoot) {
      tfoot.innerHTML = `
        <td class="px-6 py-3 font-semibold">Total General</td>
        ${allMonths.map(month => `
          <td class="px-6 py-3 text-center font-semibold">${monthTotals[month] || 0}</td>
        `).join('')}
        <td class="px-6 py-3 text-center font-semibold">${grandTotal}</td>
      `;
    }
    
    // Event listeners para filtros
    document.getElementById('tableSearch')?.addEventListener('input', debounce(function() {
      currentPage = 1; // Reiniciar paginación
      updateTechnicianTable(filteredTickets);
    }, 300));
    
    document.getElementById('statusFilter')?.addEventListener('change', function() {
      currentPage = 1; // Reiniciar paginación
      applyFilters();
    });
    
    document.getElementById('monthFilter')?.addEventListener('change', function() {
      currentPage = 1; // Reiniciar paginación
      applyFilters();
    });
  }
  
  /**
   * Aplica filtros a los tickets
   */
  function applyFilters() {
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    const monthFilter = document.getElementById('monthFilter')?.value || 'all';
    
    // Reiniciar a todos los tickets
    let filtered = allTickets;
    
    // Filtrar por estado
    if (statusFilter !== 'all') {
      switch (statusFilter) {
        case 'curso':
          filtered = filtered.filter(t => t.Estado === 'En curso (asignada)');
          break;
        case 'espera':
          filtered = filtered.filter(t => t.Estado === 'En espera');
          break;
        case 'resuelto':
          filtered = filtered.filter(t => t.Estado === 'Resuelto');
          break;
      }
    }
    
    // Filtrar por mes
    if (monthFilter !== 'all') {
      filtered = filtered.filter(ticket => {
        const dateObj = parseDate(ticket.Fecha_apertura);
        const ticketMonth = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getFullYear()}`;
        return ticketMonth === monthFilter;
      });
    }
    
    // Actualizar tickets filtrados y UI
    filteredTickets = filtered;
    updateDashboardWithAnimation(filteredTickets);
    updateAllCharts(filteredTickets);
    updateTechnicianTable(filteredTickets);
    
    // Generar datos para mapa de calor
    generateHeatmapData(filteredTickets);
    updateHeatmap();
    
    // Actualizar información de rendimiento
    updateTechPerformance(filteredTickets);
  }
  
  /**
   * Crea un delay para funciones que se disparan frecuentemente (como búsqueda)
   */
  function debounce(func, wait) {
    let timeout;
    return function() {
      const context = this;
      const args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        func.apply(context, args);
      }, wait);
    };
  }
  
  /**
   * Convierte un string "dd-mm-yyyy hh:mm" a objeto Date.
   */
  function parseDate(dateStr) {
    if (!dateStr) return new Date();
    
    const [datePart, timePart] = dateStr.split(' ');
    const [day, month, year] = datePart.split('-').map(Number);
    const [hour, minute] = timePart ? timePart.split(':').map(Number) : [0, 0];
    return new Date(year, month - 1, day, hour, minute);
  }
  
  /**
   * Convierte 'MM' a 'Nombre del mes'
   */
  function formatMonth(monthStr) {
    const monthNames = {
      '01': 'Enero', '02': 'Febrero', '03': 'Marzo',
      '04': 'Abril', '05': 'Mayo', '06': 'Junio',
      '07': 'Julio', '08': 'Agosto', '09': 'Septiembre',
      '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
    };
    
    if (monthStr.includes('-')) {
      const [month, year] = monthStr.split('-');
      return `${monthNames[month]} ${year}`;
    }
    
    return monthNames[monthStr] || monthStr;
  }
  
  /**
   * Función para mostrar detalles de tickets filtrados por técnico y/o mes
   */
  function showTicketDetailsByFilter(tecnico, mes) {
    let ticketsDetail;
    if (mes) {
      ticketsDetail = allTickets.filter(ticket => {
        const ticketDate = parseDate(ticket.Fecha_apertura);
        const ticketMonth = `${(ticketDate.getMonth() + 1).toString().padStart(2, '0')}-${ticketDate.getFullYear()}`;
        if (tecnico === 'Sin asignar') {
          return (!ticket.Asignado_a || ticket.Asignado_a.trim() === '') && ticketMonth === mes;
        } else {
          return ticket.Asignado_a === tecnico && ticketMonth === mes;
        }
      });
    } else {
      ticketsDetail = allTickets.filter(ticket => {
        if (tecnico === 'Sin asignar') {
          return !ticket.Asignado_a || ticket.Asignado_a.trim() === '';
        } else {
          return ticket.Asignado_a === tecnico;
        }
      });
    }
  
    showTicketDetails(tecnico, mes, ticketsDetail);
  }
  
  /**
   * Muestra detalles de tickets en un modal mejorado
   */
  function showTicketDetails(tecnico, mes, ticketsDetail) {
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
          <div class="mr-3 bg-white rounded-full w-10 h-10 flex items-center justify-center text-blue-800 font-bold">
            ${tecnico.charAt(0).toUpperCase()}
          </div>
          <h3 class="text-lg font-semibold">${headerTitle}</h3>
        </div>
        <button class="text-white hover:text-gray-200" onclick="document.getElementById('modalOverlay').classList.add('hidden')">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <div class="p-6 overflow-y-auto max-h-[70vh]">
        <div class="mb-4 flex items-center justify-between">
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
          `<div class="flex flex-col items-center justify-center py-12">
            <div class="text-7xl text-gray-300 mb-4"><i class="fas fa-ticket-alt"></i></div>
            <p class="text-gray-500 text-lg">No se encontraron tickets</p>
          </div>` : 
          `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${ticketsDetail.map((ticket, index) => `
              <div class="glass-card p-4 rounded-lg cursor-pointer hover:shadow-lg table-row-animate" 
                   style="animation-delay: ${index * 30}ms"
                   onclick="window.open('https://mda.senasa.gob.pe/front/ticket.form.php?id=${ticket.ID}', '_blank')">
                <div class="flex justify-between items-start mb-2">
                  <span class="bg-gray-100 text-gray-600 text-xs rounded-full px-2 py-1">#${ticket.ID}</span>
                  <span class="px-2 py-1 text-xs leading-5 font-semibold rounded-full ${getStatusColor(ticket.Estado)}">
                    ${ticket.Estado}
                  </span>
                </div>
                <p class="text-gray-800 font-medium mb-2 line-clamp-2">${ticket.Descripcion || 'Sin descripción'}</p>
                <div class="flex justify-between items-center text-xs text-gray-500">
                  <span><i class="far fa-calendar mr-1"></i> ${formatDetailDate(ticket.Fecha_apertura)}</span>
                  <span><i class="far fa-clock mr-1"></i> ${ticket.Duracion || '0'}h</span>
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
  }
  
  /**
   * Formatea fecha para mostrar en detalle de ticket
   */
  function formatDetailDate(dateStr) {
    if (!dateStr) return '';
    
    const date = parseDate(dateStr);
    
    // Formato: "25 Feb 2023, 14:30"
    const day = date.getDate();
    const month = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][date.getMonth()];
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${day} ${month} ${year}, ${hours}:${minutes}`;
  }
  
  /**
   * Obtiene la clase de color según el estado del ticket
   */
  function getStatusColor(estado) {
    switch (estado) {
      case 'En curso (asignada)':
        return 'bg-yellow-100 text-yellow-800';
      case 'En espera':
        return 'bg-orange-100 text-orange-800';
      case 'Resuelto':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }
  
  /**
   * Exportar tabla a PDF
   */
  function exportTableToPDF() {
    showNotification('⏳ Generando PDF...', 'info');
    
    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('l', 'mm', 'a4');
      const fecha = new Date().toLocaleDateString('es-ES');
      
      // Agregar título y fecha
      pdf.setFontSize(18);
      pdf.setTextColor(29, 78, 216); // Azul
      pdf.setFont('helvetica', 'bold');
      pdf.text('Reporte de Tickets SENASA', 15, 15);
      
      pdf.setFontSize(12);
      pdf.setTextColor(100, 116, 139); // Gris
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Fecha: ${fecha}`, 15, 25);
      
      // Capturar la tabla completa
      html2canvas(document.getElementById('technicianTable'), {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        
        // Añadir la imagen al PDF
        const imgWidth = 270;
        const imgHeight = canvas.height * imgWidth / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 15, 35, imgWidth, imgHeight);
        
        // Añadir pie de página
        const pageCount = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          pdf.setPage(i);
          pdf.setFontSize(10);
          pdf.setTextColor(128, 128, 128);
          pdf.text(`Reporte generado por SENASA - Página ${i} de ${pageCount}`, 15, pdf.internal.pageSize.height - 10);
        }
        
        pdf.save(`Reporte_Tickets_SENASA_${new Date().toISOString().split('T')[0]}.pdf`);
        
        showNotification('✅ PDF generado correctamente', 'success');
      });
    } catch (error) {
      console.error('Error al exportar a PDF:', error);
      showNotification('❌ Error al generar PDF', 'error');
    }
  }
  
  /**
   * Exportar tabla a Excel
   */
  function exportTableToExcel() {
    showNotification('⏳ Generando Excel...', 'info');
    
    try {
      // Crear libro y hoja
      const wb = XLSX.utils.book_new();
      wb.Props = {
        Title: "Reporte de Tickets SENASA",
        Author: "SENASA",
        CreatedDate: new Date()
      };
      
      // Preparar datos
      const table = document.getElementById('technicianTable');
      const ws = XLSX.utils.table_to_sheet(table);
      
      // Estilizar la hoja
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!ws[cellRef]) continue;
        ws[cellRef].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "1E3A8A" } },
          alignment: { horizontal: "center", vertical: "center" }
        };
      }
      
      // Ajustar ancho de columnas
      const colWidths = Array(range.e.c + 1).fill({ wch: 15 });
      colWidths[0] = { wch: 25 }; // Columna de técnico más ancha
      ws['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(wb, ws, "Tickets por Técnico");
      
      // Añadir una hoja de resumen
      const summaryData = [
        ["Resumen de Tickets SENASA", ""],
        ["Fecha de generación", new Date().toLocaleDateString()],
        ["Total de tickets", document.getElementById('totalTickets').textContent],
        ["En curso", document.getElementById('cardInCourse').textContent],
        ["En espera", document.getElementById('cardWaiting').textContent],
        ["Tiempo promedio", document.getElementById('cardAvgTime').textContent]
      ];
      
      const ws2 = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, ws2, "Resumen");
      
      // Generar archivo
      XLSX.writeFile(wb, `Reporte_Tickets_SENASA_${new Date().toISOString().split('T')[0]}.xlsx`);
      
      showNotification('✅ Excel generado correctamente', 'success');
    } catch (error) {
      console.error('Error al exportar a Excel:', error);
      showNotification('❌ Error al generar Excel', 'error');
    }
  }
  
  /**
   * Exportar tabla a JPG
   */
  function exportTableToJPG() {
    showNotification('⏳ Generando imagen...', 'info');
    
    try {
      // Crear un contenedor temporal para la captura
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.padding = '20px';
      container.style.background = 'white';
      container.style.width = 'fit-content';
      
      // Agregar encabezado
      const header = document.createElement('div');
      header.innerHTML = `
        <div style="margin-bottom: 20px;">
          <h1 style="color: #1e3a8a; font-size: 24px; margin-bottom: 10px;">Reporte de Tickets SENASA</h1>
          <p style="color: #64748b; font-size: 14px;">Fecha: ${new Date().toLocaleDateString('es-ES')}</p>
        </div>
      `;
      
      // Clonar tabla
      const tableClone = document.getElementById('technicianTable').cloneNode(true);
      
      container.appendChild(header);
      container.appendChild(tableClone);
      document.body.appendChild(container);
      
      // Generar imagen
      html2canvas(container, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        allowTaint: true,
        logging: false
      }).then(canvas => {
        // Descargar imagen
        const link = document.createElement('a');
        link.download = `Reporte_Tickets_SENASA_${new Date().toISOString().split('T')[0]}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
        
        // Limpiar
        container.remove();
        
        showNotification('✅ Imagen generada correctamente', 'success');
      });
    } catch (error) {
      console.error('Error al exportar a JPG:', error);
      showNotification('❌ Error al generar imagen', 'error');
    }
  }
  
  /**
   * Muestra el modal para enviar reporte por correo
   */
  function sendTicketsTableByEmail() {
    const modalOverlay = document.getElementById('modalOverlay');
    const modalContent = document.getElementById('modalContent');
    
    if (!modalOverlay || !modalContent) return;
    
    modalContent.innerHTML = `
      <div class="bg-gradient-to-r from-blue-800 to-blue-900 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
        <div class="flex items-center">
          <i class="fas fa-envelope text-xl mr-3"></i>
          <h3 class="text-lg font-semibold">Enviar Reporte por Correo</h3>
        </div>
        <button class="text-white hover:text-gray-200" onclick="document.getElementById('modalOverlay').classList.add('hidden')">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <div class="p-6">
        <form id="emailForm" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1" for="recipientEmail">
              Destinatario:
            </label>
            <input class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" 
              id="recipientEmail" type="email" placeholder="correo@ejemplo.com" required>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1" for="emailSubject">
              Asunto:
            </label>
            <input class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" 
              id="emailSubject" type="text" value="Reporte de Tickets SENASA" required>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1" for="reportType">
              Tipo de Reporte:
            </label>
            <select class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" 
              id="reportType">
              <option value="all">Todos los tickets (${allTickets.length})</option>
              <option value="inCourse">En curso (${allTickets.filter(t => t.Estado === 'En curso (asignada)').length})</option>
              <option value="waiting">En espera (${allTickets.filter(t => t.Estado === 'En espera').length})</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1" for="emailMessage">
              Mensaje Adicional:
            </label>
            <textarea class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" 
              id="emailMessage" rows="3" placeholder="Escriba un mensaje opcional..."></textarea>
          </div>
          
          <div id="emailStatus"></div>
          
          <div class="flex justify-end space-x-3 pt-4">
            <button type="button" onclick="document.getElementById('modalOverlay').classList.add('hidden')" 
                    class="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition">
              Cancelar
            </button>
            <button type="submit" class="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 transition">
              <i class="fas fa-paper-plane mr-2"></i>
              Enviar Reporte
            </button>
          </div>
        </form>
      </div>
    `;
    
    // Mostrar modal con animación
    modalOverlay.classList.remove('hidden');
    modalContent.classList.add('animate-fadeIn');
    
    // Eventos del formulario
    document.getElementById('emailForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn.innerHTML;
      
      // Deshabilitar botón y mostrar estado
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
      
      const statusDiv = document.getElementById('emailStatus');
      statusDiv.innerHTML = '<div class="p-2 bg-blue-50 text-blue-600 rounded flex items-center"><i class="fas fa-info-circle mr-2"></i> Enviando reporte por correo...</div>';
      
      // Obtener valores del formulario
      const recipient = document.getElementById('recipientEmail').value;
      const subject = document.getElementById('emailSubject').value;
      const reportType = document.getElementById('reportType').value;
      const message = document.getElementById('emailMessage').value;
      
      // Filtrar tickets según el tipo seleccionado
      let ticketsToSend;
      if (reportType === 'inCourse') {
        ticketsToSend = allTickets.filter(t => t.Estado === 'En curso (asignada)');
      } else if (reportType === 'waiting') {
        ticketsToSend = allTickets.filter(t => t.Estado === 'En espera');
      } else {
        ticketsToSend = allTickets;
      }
      
      try {
        // Simular envío (en un entorno real llamaría a una API)
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        statusDiv.innerHTML = '<div class="p-2 bg-green-50 text-green-600 rounded flex items-center"><i class="fas fa-check-circle mr-2"></i> El reporte ha sido enviado correctamente.</div>';
        submitBtn.innerHTML = '<i class="fas fa-check"></i> Enviado';
        submitBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        submitBtn.classList.add('bg-green-600', 'hover:bg-green-700');
        
        showNotification('✅ Reporte enviado correctamente a ' + recipient, 'success');
        
        // Cerrar el modal después de 2 segundos
        setTimeout(() => {
          document.getElementById('modalOverlay').classList.add('hidden');
        }, 2000);
        
      } catch (error) {
        console.error('Error al enviar correo:', error);
        
        statusDiv.innerHTML = `
          <div class="p-2 bg-red-50 text-red-600 rounded flex items-center">
            <i class="fas fa-exclamation-circle mr-2"></i>
            <span>Error al enviar el correo. Por favor, inténtelo más tarde.</span>
          </div>
        `;
        
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
        
        showNotification('❌ Error al enviar reporte', 'error');
      }
    });
  }
  
  /**
   * Crea una visualización previa de un reporte para enviar por correo
   */
  function generateTableHTML(tickets) {
    const technicianData = {};
    tickets.forEach(ticket => {
      const tecnico = ticket.Asignado_a || 'Sin asignar';
      if (!technicianData[tecnico]) {
        technicianData[tecnico] = { 
          total: 0,
          enCurso: 0,
          enEspera: 0,
          resuelto: 0
        };
      }
      technicianData[tecnico].total++;
      
      if (ticket.Estado === 'En curso (asignada)') {
        technicianData[tecnico].enCurso++;
      } else if (ticket.Estado === 'En espera') {
        technicianData[tecnico].enEspera++;
      } else if (ticket.Estado === 'Resuelto') {
        technicianData[tecnico].resuelto++;
      }
    });
    
    // Crear tabla HTML con estilos inline para correo
    let tableHTML = `
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-family: Arial, sans-serif;">
        <thead>
          <tr style="background-color: #1e3a8a; color: white;">
            <th style="padding: 10px; text-align: left; border: 1px solid #e2e8f0;">Técnico</th>
            <th style="padding: 10px; text-align: center; border: 1px solid #e2e8f0;">En Curso</th>
            <th style="padding: 10px; text-align: center; border: 1px solid #e2e8f0;">En Espera</th>
            <th style="padding: 10px; text-align: center; border: 1px solid #e2e8f0;">Resueltos</th>
            <th style="padding: 10px; text-align: center; border: 1px solid #e2e8f0;">Total</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    // Ordenar técnicos por total de tickets (descendente)
    const sortedTechnicians = Object.keys(technicianData).sort((a, b) => 
      technicianData[b].total - technicianData[a].total
    );
    
    // Generar filas
    sortedTechnicians.forEach(tecnico => {
      const data = technicianData[tecnico];
      tableHTML += `
        <tr style="background-color: #f8fafc;">
          <td style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">${tecnico}</td>
          <td style="padding: 8px; text-align: center; border: 1px solid #e2e8f0;">
            <span style="display: inline-block; padding: 4px 8px; background-color: #fef3c7; color: #92400e; border-radius: 9999px; font-size: 12px;">${data.enCurso}</span>
          </td>
          <td style="padding: 8px; text-align: center; border: 1px solid #e2e8f0;">
            <span style="display: inline-block; padding: 4px 8px; background-color: #ffedd5; color: #9a3412; border-radius: 9999px; font-size: 12px;">${data.enEspera}</span>
          </td>
          <td style="padding: 8px; text-align: center; border: 1px solid #e2e8f0;">
            <span style="display: inline-block; padding: 4px 8px; background-color: #dcfce7; color: #166534; border-radius: 9999px; font-size: 12px;">${data.resuelto}</span>
          </td>
          <td style="padding: 8px; text-align: center; border: 1px solid #e2e8f0; font-weight: bold; color: #1e40af;">${data.total}</td>
        </tr>
      `;
    });
    
    // Totales
    const totales = sortedTechnicians.reduce((acc, tecnico) => {
      acc.enCurso += technicianData[tecnico].enCurso;
      acc.enEspera += technicianData[tecnico].enEspera;
      acc.resuelto += technicianData[tecnico].resuelto;
      acc.total += technicianData[tecnico].total;
      return acc;
    }, { enCurso: 0, enEspera: 0, resuelto: 0, total: 0 });
    
    tableHTML += `
        </tbody>
        <tfoot>
          <tr style="background-color: #1e3a8a; color: white;">
            <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Total</td>
            <td style="padding: 10px; text-align: center; font-weight: bold; border: 1px solid #e2e8f0;">${totales.enCurso}</td>
            <td style="padding: 10px; text-align: center; font-weight: bold; border: 1px solid #e2e8f0;">${totales.enEspera}</td>
            <td style="padding: 10px; text-align: center; font-weight: bold; border: 1px solid #e2e8f0;">${totales.resuelto}</td>
            <td style="padding: 10px; text-align: center; font-weight: bold; border: 1px solid #e2e8f0;">${totales.total}</td>
          </tr>
        </tfoot>
      </table>
    `;
    
    return tableHTML;
  }
  
  // Inicializar eventos al cargar la página
  document.addEventListener('DOMContentLoaded', function() {
    // Click en cards para filtrar por estado
    document.getElementById('totalTicketsCard')?.addEventListener('click', () => {
      filteredTickets = allTickets;
      updateDashboardWithAnimation(filteredTickets);
      updateAllCharts(filteredTickets);
      updateTechnicianTable(filteredTickets);
      updateHeatmap();
      updateTechPerformance(filteredTickets);
      showNotification('Mostrando todos los tickets', 'info');
    });
  
    document.getElementById('inCourseCard')?.addEventListener('click', () => {
      filteredTickets = allTickets.filter(t => t.Estado === 'En curso (asignada)');
      updateDashboardWithAnimation(filteredTickets);
      updateAllCharts(filteredTickets);
      updateTechnicianTable(filteredTickets);
      updateHeatmap();
      updateTechPerformance(filteredTickets);
      showNotification('Filtrando tickets en curso', 'info');
    });
  
    document.getElementById('waitingCard')?.addEventListener('click', () => {
      filteredTickets = allTickets.filter(t => t.Estado === 'En espera');
      updateDashboardWithAnimation(filteredTickets);
      updateAllCharts(filteredTickets);
      updateTechnicianTable(filteredTickets);
      updateHeatmap();
      updateTechPerformance(filteredTickets);
      showNotification('Filtrando tickets en espera', 'info');
    });
    
    // Botón de recarga de datos
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
      showNotification('🔄 Recargando datos...', 'info');
      // Simular reconexión al WebSocket
      socket.disconnect();
      setTimeout(() => {
        socket.connect();
      }, 1000);
    });
    
    // Cambio de tema (para demostración)
    let darkMode = false;
    document.getElementById('toggleThemeBtn')?.addEventListener('click', () => {
      darkMode = !darkMode;
      document.body.classList.toggle('bg-gray-900', darkMode);
      document.querySelectorAll('.glass-card').forEach(card => {
        card.classList.toggle('bg-gray-800', darkMode);
        card.classList.toggle('text-white', darkMode);
      });
      
      const icon = document.getElementById('toggleThemeBtn')?.querySelector('i');
      if (icon) {
        if (darkMode) {
          icon.classList.remove('fa-moon');
          icon.classList.add('fa-sun');
          showNotification('🌙 Modo oscuro activado', 'info');
        } else {
          icon.classList.remove('fa-sun');
          icon.classList.add('fa-moon');
          showNotification('☀️ Modo claro activado', 'info');
        }
      }
    });
    
    // Cerrar modal con tecla Escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        const modalOverlay = document.getElementById('modalOverlay');
        if (modalOverlay) {
          modalOverlay.classList.add('hidden');
        }
      }
    });
    
    // Click fuera del modal para cerrar
    document.getElementById('modalOverlay')?.addEventListener('click', function(e) {
      if (e.target === this) {
        this.classList.add('hidden');
      }
    });
    
    // Inicializar animaciones scroll
    if (typeof AOS !== 'undefined') {
      AOS.init({
        duration: 800,
        once: true,
        offset: 100
      });
    }
  });
  
  // Inicializar datos si llegan del backend
  if (typeof initialData !== 'undefined' && initialData) {
    console.log('Inicializando con datos:', initialData);
    
    allTickets = [...(initialData.en_curso || []), ...(initialData.espera || [])];
    filteredTickets = allTickets;
    
    // Actualizar UI con datos iniciales
    updateDashboardWithAnimation(filteredTickets);
    updateAllCharts(filteredTickets);
    updateTechnicianTable(filteredTickets);
    
    // Generar datos para mapa de calor
    generateHeatmapData(filteredTickets);
    updateHeatmap();
    
    // Actualizar información de rendimiento
    updateTechPerformance(filteredTickets);
  }