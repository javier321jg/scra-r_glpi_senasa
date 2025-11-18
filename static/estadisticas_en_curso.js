/********************************************
 * estadisticas_en_curso.js
 * Muestra SOLO los tickets con estado "En curso (asignada)"
 * en la tabla "Técnico vs. Meses + Total".
 ********************************************/

// ===================== Variables Globales =====================
let allTickets = [];

// ===================== 1) Funciones Auxiliares =====================
/**
 * Convierte "dd-mm-yyyy hh:mm" a objeto Date.
 */
function parseDate(dateStr) {
  const [datePart, timePart] = dateStr.split(' ');
  const [day, month, year] = datePart.split('-').map(Number);
  const [hour, minute] = timePart ? timePart.split(':').map(Number) : [0, 0];
  return new Date(year, month - 1, day, hour, minute);
}

/**
 * Convierte "MM-YYYY" a nombre de mes (Enero, Febrero, etc.).
 */
function formatMonth(monthYear) {
  const [month, year] = monthYear.split('-');
  const months = {
    '01': 'Enero', '02': 'Febrero', '03': 'Marzo',
    '04': 'Abril', '05': 'Mayo',    '06': 'Junio',
    '07': 'Julio', '08': 'Agosto',  '09': 'Septiembre',
    '10': 'Octubre','11': 'Noviembre','12': 'Diciembre'
  };
  return months[month];
}

// ===================== 2) Conexión WebSocket =====================
const socket = io(window.location.origin, { transports: ['websocket'], reconnection: true });

socket.on('connect', () => {
  console.log('Conectado a WebSocket - En Curso');
});

socket.on('connect_error', (error) => {
  console.error('Error de conexión:', error);
});

socket.on('disconnect', () => {
  console.log('Desconectado del WebSocket - En Curso');
});

/**
 * Al recibir 'tickets_update', combinamos data.en_curso y data.espera,
 * y filtramos SOLO tickets con Estado === 'En curso (asignada)'.
 */
socket.on('tickets_update', (data) => {
  console.log('Datos recibidos (En Curso):', data);

  // Combina en_curso y espera (ajusta según cómo tu servidor mande los tickets)
  const combinedTickets = [
    ...(data.en_curso || []),
    ...(data.espera || [])
  ];

  // Filtrar SOLO "En curso (asignada)"
  allTickets = combinedTickets.filter(t => t.Estado === 'En curso (asignada)');

  // Actualizar la tabla
  updateTechnicianTable(allTickets);

  // Mostrar la última actualización (si tu servidor la envía)
  if (data.last_update) {
    const lastUpdateEl = document.getElementById('lastUpdate');
    if (lastUpdateEl) {
      lastUpdateEl.textContent = `Última actualización: ${data.last_update}`;
    }
  }
});

// ===================== 3) Función para generar la tabla =====================
function updateTechnicianTable(tickets) {
  // 1) Obtener todos los meses únicos
  const monthsSet = new Set();
  tickets.forEach(ticket => {
    const dateObj = parseDate(ticket.Fecha_apertura);
    const monthYear = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getFullYear()}`;
    monthsSet.add(monthYear);
  });

  // Ordenar meses (más reciente primero)
  const allMonths = Array.from(monthsSet).sort((a, b) => {
    const [m1, y1] = a.split('-').map(Number);
    const [m2, y2] = b.split('-').map(Number);
    return new Date(y2, m2 - 1) - new Date(y1, m1 - 1);
  });

  // Estructuras para contar tickets por técnico y mes
  const technicianData = {};
  const monthTotals = {};
  let grandTotal = 0;

  tickets.forEach(ticket => {
    const tecnico = ticket.Asignado_a || 'Sin asignar';
    const dateObj = parseDate(ticket.Fecha_apertura);
    const monthYear = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getFullYear()}`;

    // Inicializar
    if (!technicianData[tecnico]) {
      technicianData[tecnico] = { months: {}, total: 0 };
      allMonths.forEach(m => {
        technicianData[tecnico].months[m] = 0;
      });
    }
    if (!monthTotals[monthYear]) {
      monthTotals[monthYear] = 0;
    }

    // Contar
    technicianData[tecnico].months[monthYear]++;
    technicianData[tecnico].total++;
    monthTotals[monthYear]++;
    grandTotal++;
  });

  // 2) Llenar THEAD
  const headerRow = document.querySelector('#technicianTable thead tr');
  headerRow.innerHTML = `
    <th class="px-6 py-3 text-left">Técnico</th>
    ${allMonths.map(month => `
      <th class="px-6 py-3 text-center">${formatMonth(month)}</th>
    `).join('')}
    <th class="px-6 py-3 text-center">Total</th>
  `;

  // 3) Llenar TBODY
  const tbody = document.getElementById('technicianTableBody');
  tbody.innerHTML = '';
  Object.entries(technicianData).forEach(([tecnico, data]) => {
    const tr = document.createElement('tr');
    tr.className = 'custom-row';

    let rowHTML = `<td class="px-6 py-4">${tecnico}</td>`;
    allMonths.forEach(month => {
      const count = data.months[month];
      rowHTML += `<td class="px-6 py-4 text-center">${count}</td>`;
    });
    rowHTML += `<td class="px-6 py-4 text-center font-semibold text-blue-600">${data.total}</td>`;

    tr.innerHTML = rowHTML;
    tbody.appendChild(tr);
  });

  // 4) Llenar TFOOT
  const tfoot = document.createElement('tfoot');
  tfoot.className = 'bg-blue-900 text-white';
  const monthTotalsRow = allMonths.map(month => `
    <td class="px-6 py-3 text-center font-semibold">${monthTotals[month] || 0}</td>
  `).join('');

  tfoot.innerHTML = `
    <tr>
      <td class="px-6 py-3 font-semibold">Total General</td>
      ${monthTotalsRow}
      <td class="px-6 py-3 text-center font-semibold">${grandTotal}</td>
    </tr>
  `;
  const existingTfoot = document.querySelector('#technicianTable tfoot');
  if (existingTfoot) {
    existingTfoot.replaceWith(tfoot);
  } else {
    document.getElementById('technicianTable').appendChild(tfoot);
  }
}

// ===================== (Opcional) Exportar Excel/PDF/JPG =====================
document.getElementById('excelBtn').addEventListener('click', () => {
  console.log("Exportar a Excel (En Curso) - si quieres, agrega tu función");
});
document.getElementById('pdfBtn').addEventListener('click', () => {
  console.log("Exportar a PDF (En Curso) - si quieres, agrega tu función");
});
document.getElementById('jpgBtn').addEventListener('click', () => {
  console.log("Exportar a JPG (En Curso) - si quieres, agrega tu función");
});
