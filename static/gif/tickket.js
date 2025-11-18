/**
 * Sistema de Trazabilidad de Tickets - SENASA
 * Versión mejorada con manejo de errores y soporte offline
 */

// Configuración
const CONFIG = {
  apiUrl: '/api/tickets/improved', // Cambiado a la ruta mejorada
  statsUrl: '/api/tickets/stats',
  socketUrl: window.location.origin,
  refreshInterval: 60000, // 1 minuto
  maxResults: 50,
  enableRealTimeUpdates: true,
  maxRetries: 3, // Número máximo de reintentos de conexión
  retryDelay: 3000 // Tiempo entre reintentos (3 segundos)
};

// Estado de la aplicación
let appState = {
  allTickets: [],
  searchResults: [],
  currentSearch: {
      query: '',
      field: 'all'
  },
  lastUpdate: null,
  socket: null,
  isLoading: false,
  isOffline: false, // Nuevo estado para rastrear si estamos offline
  connectionRetries: 0, // Contador de reintentos
  counters: {
      nuevos: 0,
      espera: 0,
      curso: 0,
      resueltos: 0
  }
};

// Inicialización cuando el DOM está listo
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

/**
* Inicializa la aplicación
*/
function initApp() {
  // Configurar manejadores de eventos
  document.getElementById('searchForm').addEventListener('submit', handleSearch);
  document.getElementById('clearSearch').addEventListener('click', clearSearch);
  document.getElementById('searchQuery').addEventListener('input', handleQuickSearch);
  
  // Inicializar selector de campos de búsqueda
  actualizarSelectorCampos();
  
  // Inicializar modal de contacto del técnico
  initializeTechContactModal();
  
  // Comprobar estado de la conexión
  checkNetworkStatus();
  
  // Escuchar eventos de conexión
  window.addEventListener('online', handleOnlineStatus);
  window.addEventListener('offline', handleOfflineStatus);
  
  // Establecer conexión Socket.io si está habilitado
  if (CONFIG.enableRealTimeUpdates && navigator.onLine) {
      initSocketConnection();
  }

  // Cargar datos iniciales
  fetchAllTickets();
  
  // Configurar actualización periódica (si no hay Socket.io)
  if (!CONFIG.enableRealTimeUpdates) {
      setInterval(() => {
          if (navigator.onLine) {
              fetchAllTickets();
          }
      }, CONFIG.refreshInterval);
  }
  
  // Mostrar animación de carga inicial
  setLoading(true);
  
  // Configurar eventos para las tarjetas de estadísticas
  configureStatCards();
}

/**
* Verifica el estado de la conexión
*/
function checkNetworkStatus() {
  if (navigator.onLine) {
      handleOnlineStatus();
  } else {
      handleOfflineStatus();
  }
}

/**
* Manejador para cuando la conexión está disponible
*/
function handleOnlineStatus() {
  appState.isOffline = false;
  document.getElementById('connectionStatus').className = 'connection-status bg-green-500 text-white';
  document.getElementById('connectionStatus').innerHTML = '<i class="fas fa-wifi mr-1"></i> Conectado';
  
  // Intentar recuperar datos si estuvimos offline
  fetchAllTickets();
}

/**
* Manejador para cuando la conexión se pierde
*/
function handleOfflineStatus() {
  appState.isOffline = true;
  document.getElementById('connectionStatus').className = 'connection-status bg-red-500 text-white';
  document.getElementById('connectionStatus').innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Sin conexión';
  
  // Cargar datos desde localStorage si hay disponibles
  loadCachedData();
}

/**
* Carga datos almacenados en caché cuando no hay conexión
*/
function loadCachedData() {
  try {
      const cachedData = localStorage.getItem('tickets_cache');
      if (cachedData) {
          const data = JSON.parse(cachedData);
          processTicketsData(data);
          document.getElementById('searchStatus').textContent = 
              `Mostrando datos guardados en caché (${formatFecha(data.last_update || '')})`;
      } else {
          document.getElementById('searchStatus').textContent = 
              'No hay conexión y no se encontraron datos en caché. Conéctese a Internet para cargar tickets.';
      }
  } catch (error) {
      console.error('Error al cargar datos en caché:', error);
  }
}

/**
* Guarda datos en caché para uso offline
* @param {Object} data - Datos de tickets para guardar
*/
function saveCachedData(data) {
  try {
      localStorage.setItem('tickets_cache', JSON.stringify(data));
  } catch (error) {
      console.error('Error al guardar datos en caché:', error);
  }
}

/**
* Configura los eventos para las tarjetas de estadísticas
*/
function configureStatCards() {
  // Añadir eventos de clic a las tarjetas
  document.getElementById('nuevosCard').addEventListener('click', () => filterByCategory('nuevos'));
  document.getElementById('esperaCard').addEventListener('click', () => filterByCategory('espera'));
  document.getElementById('cursoCard').addEventListener('click', () => filterByCategory('curso'));
  document.getElementById('resueltosCard').addEventListener('click', () => filterByCategory('resueltos'));
  
  // Añadir efectos de hover con animaciones
  const statCards = document.querySelectorAll('.stat-card');
  statCards.forEach(card => {
      card.addEventListener('mouseenter', () => {
          const counter = card.querySelector('p');
          if (counter) {
              counter.classList.add('animate__animated', 'animate__heartBeat');
          }
      });
      
      card.addEventListener('mouseleave', () => {
          const counter = card.querySelector('p');
          if (counter) {
              counter.classList.remove('animate__animated', 'animate__heartBeat');
          }
      });
  });
}

/**
* Filtra la lista de tickets por categoría al hacer clic en una tarjeta
* @param {string} category - Categoría a filtrar
*/
function filterByCategory(category) {
  const field = 'category';
  const query = category;
  
  document.getElementById('searchField').value = 'all';
  document.getElementById('searchQuery').value = '';
  
  // Buscar todos los tickets de la categoría
  const results = appState.allTickets.filter(ticket => ticket.category === category);
  
  // Actualizar UI
  appState.searchResults = results;
  updateSearchResults(results);
  
  // Actualizar texto de búsqueda y contadores
  document.getElementById('searchStatus').textContent = 
      `Mostrando tickets en estado: ${getCategoryLabel(category)} (${results.length})`;
  document.getElementById('totalResults').textContent = results.length;
  
  // Añadir clase activa a la tarjeta seleccionada
  document.querySelectorAll('.stat-card').forEach(card => {
      card.classList.remove('ring-2', 'ring-blue-500');
  });
  
  document.getElementById(`${category}Card`).classList.add('ring-2', 'ring-blue-500');
}

/**
* Actualiza el selector de campos para incluir ticket_id
*/
function actualizarSelectorCampos() {
  const searchField = document.getElementById('searchField');
  if (searchField) {
      // Asegurarse de que ticket_id esté como opción
      const options = searchField.options;
      let hasTicketIdOption = false;
      
      for (let i = 0; i < options.length; i++) {
          if (options[i].value === 'ticket_id') {
              hasTicketIdOption = true;
              break;
          }
      }
      
      if (!hasTicketIdOption) {
          // Agregar opción ticket_id si no existe
          const newOption = document.createElement('option');
          newOption.value = 'ticket_id';
          newOption.textContent = 'ID de Ticket';
          
          // Insertar después de la opción "ID"
          let idOptionIndex = -1;
          for (let i = 0; i < options.length; i++) {
              if (options[i].value === 'ID') {
                  idOptionIndex = i;
                  break;
              }
          }
          
          if (idOptionIndex >= 0) {
              // Insertar después de la opción ID
              const nextOption = options[idOptionIndex + 1];
              searchField.insertBefore(newOption, nextOption);
          } else {
              // Agregar al final si no se encuentra la opción ID
              searchField.appendChild(newOption);
          }
      }
  }
}

/**
* Inicializa la conexión WebSocket para actualizaciones en tiempo real
*/
function initSocketConnection() {
  try {
      appState.socket = io(CONFIG.socketUrl, {
          reconnectionAttempts: 5,
          timeout: 10000
      });

      appState.socket.on('connect', () => {
          console.log('Conexión WebSocket establecida');
          document.getElementById('connectionStatus').className = 'connection-status bg-green-500 text-white';
          document.getElementById('connectionStatus').innerHTML = '<i class="fas fa-wifi mr-1"></i> Conectado';
      });

      appState.socket.on('tickets_update', (data) => {
          console.log('Actualizando datos desde WebSocket');
          processTicketsData(data);
      });

      appState.socket.on('disconnect', () => {
          console.log('Conexión WebSocket desconectada');
          document.getElementById('connectionStatus').className = 'connection-status bg-yellow-500 text-white';
          document.getElementById('connectionStatus').innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Reconectando';
      });

      appState.socket.on('connect_error', () => {
          console.error('Error al conectar a WebSocket, volviendo a modo de polling');
          document.getElementById('connectionStatus').className = 'connection-status bg-yellow-500 text-white';
          document.getElementById('connectionStatus').innerHTML = '<i class="fas fa-sync-alt mr-1"></i> Reconectando';
          
          CONFIG.enableRealTimeUpdates = false;
          // Usar setInterval solo si no estamos offline
          if (!appState.isOffline) {
              setInterval(() => {
                  if (navigator.onLine) {
                      fetchAllTickets();
                  }
              }, CONFIG.refreshInterval);
          }
      });
  } catch (error) {
      console.error('Error al inicializar Socket.io:', error);
      document.getElementById('connectionStatus').className = 'connection-status bg-red-500 text-white';
      document.getElementById('connectionStatus').innerHTML = '<i class="fas fa-times-circle mr-1"></i> Error de conexión';
      
      CONFIG.enableRealTimeUpdates = false;
      if (!appState.isOffline) {
          setInterval(() => {
              if (navigator.onLine) {
                  fetchAllTickets();
              }
          }, CONFIG.refreshInterval);
      }
  }
}

/**
* FUNCIÓN MEJORADA: Formatea fechas y corrige fechas futuras
* @param {string} fechaStr - Fecha en formato string
* @returns {string} Fecha formateada
*/
function formatFecha(fechaStr) {
  if (!fechaStr) return 'No disponible';
  
  try {
      // Intentar diversos formatos de fecha
      let fecha;
      const formatos = [
          'YYYY-MM-DD HH:mm:ss',
          'YYYY-MM-DD HH:mm',
          'DD/MM/YYYY HH:mm:ss',
          'DD/MM/YYYY HH:mm',
          'DD-MM-YYYY HH:mm:ss',
          'DD-MM-YYYY HH:mm'
      ];
      
      for (const formato of formatos) {
          fecha = moment(fechaStr, formato, true);
          if (fecha.isValid()) break;
      }
      
      // Si no se pudo parsear con los formatos conocidos, intentar con parse automático
      if (!fecha.isValid()) {
          fecha = moment(fechaStr);
      }
      
      // Si todavía no es válida, retornar el string original
      if (!fecha.isValid()) return fechaStr;
      
      // Corregir fechas futuras (si el año es mayor al actual + 1)
      const currentYear = moment().year();
      if (fecha.year() > currentYear + 1) {
          fecha.year(currentYear);
      }
      
      // Formatear a formato estándar DD-MM-YYYY HH:MM
      return fecha.format('DD-MM-YYYY HH:mm');
  } catch (e) {
      console.error('Error al formatear fecha:', e);
      return fechaStr || 'No disponible';
  }
}

/**
* Función para reintento de peticiones fallidas
* @param {Function} fetchFn - Función de fetch a reintentar
* @param {number} retries - Número de reintentos restantes
* @returns {Promise} Resultado de la petición
*/
async function fetchWithRetry(fetchFn, retries = CONFIG.maxRetries) {
  try {
      return await fetchFn();
  } catch (error) {
      if (retries > 0) {
          console.log(`Reintentando petición: ${retries} intentos restantes`);
          await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
          return fetchWithRetry(fetchFn, retries - 1);
      }
      throw error;
  }
}

/**
* FUNCIÓN MEJORADA: Obtiene todos los tickets desde la base de datos local
*/
function fetchAllTicketsFromLocal() {
  setLoading(true);
  
  try {
      const cachedData = localStorage.getItem('tickets_cache');
      if (cachedData) {
          const data = JSON.parse(cachedData);
          processTicketsData(data);
          setLoading(false);
          document.getElementById('searchStatus').textContent = 
              `Mostrando datos guardados en caché (${formatFecha(data.last_update || '')})`;
          
          document.getElementById('connectionStatus').className = 'connection-status bg-yellow-500 text-white';
          document.getElementById('connectionStatus').innerHTML = '<i class="fas fa-database mr-1"></i> Usando caché';
      } else {
          setLoading(false);
          document.getElementById('searchStatus').textContent = 
              'No hay datos disponibles. Conéctese a Internet para cargar tickets.';
              
          document.getElementById('connectionStatus').className = 'connection-status bg-red-500 text-white';
          document.getElementById('connectionStatus').innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Sin datos';
      }
  } catch (error) {
      console.error('Error al cargar tickets desde caché:', error);
      setLoading(false);
      document.getElementById('searchStatus').textContent = 
          'Error al cargar datos locales. Conéctese a Internet para intentarlo nuevamente.';
  }
}

/**
* FUNCIÓN MEJORADA: Obtiene todos los tickets desde el API
*/
function fetchAllTickets() {
  // Si estamos offline, cargar desde caché local
  if (appState.isOffline || !navigator.onLine) {
      fetchAllTicketsFromLocal();
      return;
  }
  
  setLoading(true);
  
  // Mostrar overlay de carga
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');
  
  // Función para ejecutar fetch con un solo endpoint
  const fetchTickets = async () => {
      try {
          // Usar el endpoint mejorado que combina todos los tickets
          const response = await fetchWithRetry(() => fetch(CONFIG.apiUrl));
          
          if (!response.ok) {
              throw new Error(`Error HTTP: ${response.status}`);
          }
          
          const data = await response.json();
          
          // Si hay error en los datos, mostrar mensaje
          if (data.error) {
              throw new Error(data.error);
          }
          
          // Guardar en caché para uso offline
          saveCachedData(data);
          
          // Procesar datos
          processTicketsData(data);
          
          // Restablecer contador de reintentos
          appState.connectionRetries = 0;
          
          // Ocultar overlay de carga
          if (loadingOverlay) loadingOverlay.classList.add('hidden');
          setLoading(false);
          
          return data;
      } catch (error) {
          console.error('Error al obtener tickets:', error);
          
          // Incrementar contador de reintentos
          appState.connectionRetries++;
          
          // Después de varios intentos, cargar desde local
          if (appState.connectionRetries >= CONFIG.maxRetries) {
              fetchAllTicketsFromLocal();
          }
          
          const searchStatus = document.getElementById('searchStatus');
          if (searchStatus) {
              searchStatus.textContent = `Error al cargar tickets: ${error.message}. Reintentando...`;
              searchStatus.className = 'text-sm text-red-500 mt-1';
          }
          
          // Ocultar overlay de carga
          if (loadingOverlay) loadingOverlay.classList.add('hidden');
          setLoading(false);
          
          throw error;
      }
  };
  
  // Ejecutar fetch y manejar resultado
  fetchTickets()
      .catch(error => {
          console.error('Error final al obtener tickets:', error);
          // Ya se han mostrado mensajes de error en la función
      });
}

/**
* Procesa los datos de tickets recibidos
* @param {Object} data - Datos recibidos
*/
function processTicketsData(data) {
  if (!data) return;
  
  // Extraer los tickets según la estructura
  let allTickets = [];
  
  // Manejar diferentes formatos de respuesta
  if (data.tickets) {
      // Formato del endpoint mejorado
      allTickets = data.tickets.map(t => {
          const category = detectTicketCategory(t);
          return { ...t, category };
      });
  } else {
      // Formato antiguo con categorías separadas
      const categorias = {
          nuevos: 'nuevos',
          en_curso: 'curso',
          espera: 'espera',
          resueltos: 'resueltos'
      };
      
      for (const [key, category] of Object.entries(categorias)) {
          if (data[key] && Array.isArray(data[key])) {
              allTickets = [...allTickets, ...data[key].map(t => ({ ...t, category }))];
          }
      }
  }
  
  // Ordenar por fecha más reciente con mejor manejo de fechas
  allTickets.sort((a, b) => {
      // Intentar primero con Ultima_modificacion, luego con fecha_apertura
      let dateA = null;
      let dateB = null;
      
      // Prioridad 1: Última modificación
      if (a.Ultima_modificacion) {
          dateA = moment(a.Ultima_modificacion);
          if (!dateA.isValid()) dateA = null;
      }
      if (b.Ultima_modificacion) {
          dateB = moment(b.Ultima_modificacion);
          if (!dateB.isValid()) dateB = null;
      }
      
      // Prioridad 2: Fecha de apertura
      if (!dateA && a.Fecha_apertura) {
          dateA = moment(a.Fecha_apertura);
          if (!dateA.isValid()) dateA = null;
      }
      if (!dateB && b.Fecha_apertura) {
          dateB = moment(b.Fecha_apertura);
          if (!dateB.isValid()) dateB = null;
      }
      
      // Si no hay fechas válidas en alguno, usar momento 0
      if (!dateA) dateA = moment(0);
      if (!dateB) dateB = moment(0);
      
      // Orden descendente (más reciente primero)
      return dateB.valueOf() - dateA.valueOf();
  });
  
  appState.allTickets = allTickets;
  
  // Actualizar contadores según la categoría
  const countByCategory = {
      nuevos: 0,
      espera: 0,
      curso: 0,
      resueltos: 0
  };
  
  // Contar tickets por categoría
  allTickets.forEach(ticket => {
      const category = ticket.category || detectTicketCategory(ticket);
      if (countByCategory[category] !== undefined) {
          countByCategory[category]++;
      }
  });
  
  // Actualizar los contadores en la UI
  updateCounter('nuevos', countByCategory.nuevos);
  updateCounter('espera', countByCategory.espera);
  updateCounter('curso', countByCategory.curso);
  updateCounter('resueltos', countByCategory.resueltos);
  
  // Actualizar última actualización si está disponible
  const lastUpdate = data.last_update || new Date().toISOString();
  if (lastUpdate) {
      appState.lastUpdate = lastUpdate;
      updateLastUpdateTime();
  }
  
  // Si hay búsqueda activa, refrescar resultados
  if (appState.currentSearch.query) {
      performSearch(appState.currentSearch.query, appState.currentSearch.field);
  } else {
      // Mostrar los tickets más recientes
      appState.searchResults = allTickets;
      updateSearchResults(allTickets.slice(0, CONFIG.maxResults));
      
      // Actualizar contadores
      const searchStatus = document.getElementById('searchStatus');
      if (searchStatus) {
          searchStatus.textContent = `Base de datos actualizada con ${allTickets.length} tickets. Mostrando los ${Math.min(CONFIG.maxResults, allTickets.length)} más recientes.`;
          searchStatus.className = 'text-sm text-gray-500 mt-1';
      }
      
      const totalResults = document.getElementById('totalResults');
      if (totalResults) {
          totalResults.textContent = allTickets.length;
      }
  }
}

/**
* Detecta la categoría de un ticket basado en su estado
* @param {Object} ticket - Ticket a categorizar
* @returns {string} - Categoría del ticket
*/
function detectTicketCategory(ticket) {
  const estado = (ticket.Estado || '').toLowerCase();
  
  if (estado.includes('nuevo') || estado === 'new') {
      return 'nuevos';
  } else if (estado.includes('espera') || estado === 'waiting' || estado.includes('stand by')) {
      return 'espera';
  } else if (estado.includes('curso') || estado.includes('progreso') || estado.includes('in progress')) {
      return 'curso';
  } else if (estado.includes('resuelto') || estado.includes('resolved') || estado.includes('cerrado') || estado.includes('closed')) {
      return 'resueltos';
  }
  
  // Si no se puede determinar, asignar una categoría por defecto
  return 'nuevos';
}

/**
* Maneja el envío del formulario de búsqueda
* @param {Event} event - Evento de formulario
*/
function handleSearch(event) {
  event.preventDefault();
  
  const query = document.getElementById('searchQuery').value.trim();
  const field = document.getElementById('searchField').value;
  
  if (!query) {
      clearSearch();
      return;
  }
  
  performSearch(query, field);
}

/**
* Maneja la búsqueda rápida mientras el usuario escribe
*/
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
      performSearch(query, field);
  }, 300);
}

/**
* Actualiza el contador para una categoría específica
* @param {string} category - Categoría de tickets
* @param {number} count - Número de tickets
*/
function updateCounter(category, count) {
  const counterElement = document.getElementById(`counter-${category}`);
  if (counterElement) {
      // Animación simple de conteo
      const currentCount = parseInt(counterElement.textContent, 10) || 0;
      const targetCount = count || 0;
      
      if (currentCount !== targetCount) {
          animateCounter(counterElement, currentCount, targetCount);
      }
      
      // Actualizar estado
      appState.counters[category] = targetCount;
  }
  
  // Actualizar contador total
  const totalCount = Object.values(appState.counters).reduce((sum, val) => sum + val, 0);
  const totalElements = document.querySelectorAll('#totalTickets, #totalResults');
  totalElements.forEach(el => {
      if (el) el.textContent = totalCount;
  });
}

/**
* Anima el cambio de un contador
* @param {HTMLElement} element - Elemento del contador
* @param {number} start - Valor inicial
* @param {number} end - Valor final
*/
function animateCounter(element, start, end) {
  const duration = 1000; // ms
  const frameDuration = 16; // ms por frame (aprox. 60fps)
  const totalFrames = Math.round(duration / frameDuration);
  let frame = 0;
  
  // Cancelar animación previa si existe
  if (element._animationId) {
      cancelAnimationFrame(element._animationId);
  }
  
  // Función de animación
  const animate = () => {
      frame++;
      const progress = frame / totalFrames;
      const currentValue = Math.round(start + (end - start) * progress);
      
      element.textContent = currentValue;
      
      if (frame < totalFrames) {
          element._animationId = requestAnimationFrame(animate);
      } else {
          element.textContent = end;
          element._animationId = null;
      }
  };
  
  element._animationId = requestAnimationFrame(animate);
}

/**
* Realiza la búsqueda en los tickets
* @param {string} query - Término de búsqueda
* @param {string} field - Campo donde buscar (o "all" para todos)
*/
function performSearch(query, field) {
  setLoading(true);
  
  // Guardar búsqueda actual
  appState.currentSearch = { query, field };
  
  // Normalizar la consulta (minúsculas, sin tildes)
  const normalizedQuery = normalizeString(query);
  
  // Filtrar tickets según el campo seleccionado
  let results = [];
  
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

/**
* FUNCIÓN MEJORADA: Actualiza la visualización de resultados de búsqueda con formato de fecha correcto
* @param {Array} results - Resultados de búsqueda
*/
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
          default:
              statusClass = 'status-new'; 
              statusBadge = '<span class="ticket-badge bg-info"><i class="fas fa-ticket-alt mr-1"></i>Ticket</span>';
      }
      
      // MEJORA: Tiempo desde última actualización con formato mejorado
      let lastUpdateTime = '';
      if (ticket.Ultima_modificacion) {
          try {
              const lastUpdate = moment(ticket.Ultima_modificacion);
              if (lastUpdate.isValid()) {
                  // Corregir fechas futuras
                  const currentYear = moment().year();
                  if (lastUpdate.year() > currentYear + 1) {
                      lastUpdate.year(currentYear);
                  }
                  lastUpdateTime = lastUpdate.fromNow();
              } else {
                  lastUpdateTime = formatFecha(ticket.Ultima_modificacion);
              }
          } catch (e) {
              lastUpdateTime = formatFecha(ticket.Ultima_modificacion);
          }
      }
      
      // Truncar título largo
      const tituloCompleto = ticket.Título || ticket.titulo || 'Sin título';
      const tituloTruncado = tituloCompleto.length > 60 ? tituloCompleto.substring(0, 57) + '...' : tituloCompleto;
      
      html += `
          <div class="ticket-card ${statusClass}" onclick="showTicketDetails('${ticketId}', '${ticket.category}')">
              <div class="p-4">
                  <div class="flex justify-between items-start mb-3">
                      <div class="flex-1">
                          <h3 class="font-medium text-blue-600 mb-1 truncate" title="${tituloCompleto}">${tituloTruncado}</h3>
                          <div class="text-sm text-gray-600">#${ticketId}</div>
                      </div>
                      <div>
                          ${statusBadge}
                      </div>
                  </div>
                  
                  <div class="grid grid-cols-2 gap-1 text-sm mb-3">
                      <div>
                          <span class="text-gray-500">Entidad:</span>
                          <span class="font-medium">${ticket.Entidad || ticket.entidad || 'No especificada'}</span>
                      </div>
                      <div>
                          <span class="text-gray-500">Solicitante:</span>
                          <span class="font-medium">${ticket.Solicitante || ticket.solicitante || 'No especificado'}</span>
                      </div>
                      <div>
                          <span class="text-gray-500">Asignado a:</span>
                          <span class="font-medium">${ticket.Asignado_a || ticket.asignado_a || 'Sin asignar'}</span>
                      </div>
                      <div>
                          <span class="text-gray-500">Actualizado:</span>
                          <span class="font-medium">${lastUpdateTime || 'No disponible'}</span>
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

/**
* Determina la clase CSS para cada nodo de trazabilidad según el estado actual
* @param {string} nodeCategory - Categoría del nodo a evaluar
* @param {string} currentCategory - Categoría actual del ticket
* @returns {string} - Clase CSS para el nodo
*/
function getTraceNodeClass(nodeCategory, currentCategory) {
  const states = {
      'nuevos': 1,
      'espera': 2,
      'curso': 3,
      'resueltos': 4
  };
  
  const currentState = states[currentCategory] || 0;
  const nodeState = states[nodeCategory] || 0;
  
  if (nodeState === currentState) return 'step-active';
  if (nodeState < currentState) return 'step-completed';
  return '';
}

/**
* FUNCIÓN MEJORADA: Muestra los detalles completos de un ticket en un modal con fechas formateadas
* @param {string} ticketId - ID del ticket
* @param {string} category - Categoría del ticket
*/
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
      (t.ticket_id === ticketId || t.ID === ticketId) && 
      (t.category === category || !category)
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
  
  // Si se encontró el ticket pero no tiene categoría, detectarla
  const effectiveCategory = category || ticket.category || detectTicketCategory(ticket);
  
  // Obtener el ticket_id efectivo (priorizar el campo específico)
  const effectiveTicketId = ticket.ticket_id || ticket.ID || 'Sin ID';
  
  modalTitle.textContent = `Ticket #${effectiveTicketId}`;
  
  // Determinar estado actual y badge según categoría
  let statusBadge = '';
  let progressPercentage = 0;
  
  switch (effectiveCategory) {
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
  
  // MEJORA: Formatear fechas con la función mejorada
  let fechaApertura = formatFecha(ticket.Fecha_apertura || ticket.fecha_apertura);
  let ultimaModificacion = formatFecha(ticket.Ultima_modificacion || ticket.ultima_modificacion);
  
  // NUEVA VISUALIZACIÓN DE TRAZABILIDAD MEJORADA
  const trazabilidadHtml = `
  <div class="traceability-container">
    <div class="shine-effect"></div>
    <h3 class="traceability-title text-lg font-semibold">
      <i class="fas fa-route"></i>
      Trazabilidad del Ticket
    </h3>
    
    <div class="trace-timeline">
      <div class="trace-line">
        <div class="trace-progress" style="width: ${progressPercentage}%;"></div>
      </div>
      
      <div class="trace-steps">
        <!-- Paso: Nuevo -->
        <div class="trace-step ${getTraceNodeClass('nuevos', effectiveCategory)}">
          <div class="step-icon-container">
            <div class="step-indicator">
              <i class="fas fa-plus-circle"></i>
            </div>
            <div class="step-pulse"></div>
            <div class="step-info">
              Ticket creado y pendiente de asignación
            </div>
          </div>
          <div class="step-label">Nuevo</div>
        </div>
        
        <!-- Paso: En Espera -->
        <div class="trace-step ${getTraceNodeClass('espera', effectiveCategory)}">
          <div class="step-icon-container">
            <div class="step-indicator">
              <i class="fas fa-hourglass-half"></i>
            </div>
            <div class="step-pulse"></div>
            <div class="step-info">
              Ticket en espera de información o acción
            </div>
          </div>
          <div class="step-label">En Espera</div>
        </div>
        
        <!-- Paso: En Curso -->
        <div class="trace-step ${getTraceNodeClass('curso', effectiveCategory)}">
          <div class="step-icon-container">
            <div class="step-indicator">
              <i class="fas fa-cogs"></i>
            </div>
            <div class="step-pulse"></div>
            <div class="step-info">
              Técnico trabajando en la solución
            </div>
          </div>
          <div class="step-label">En Curso</div>
        </div>
        
        <!-- Paso: Resuelto -->
        <div class="trace-step ${getTraceNodeClass('resueltos', effectiveCategory)}">
          <div class="step-icon-container">
            <div class="step-indicator">
              <i class="fas fa-check-circle"></i>
            </div>
            <div class="step-pulse"></div>
            <div class="step-info">
              Ticket resuelto y cerrado
            </div>
          </div>
          <div class="step-label">Resuelto</div>
        </div>
      </div>
    </div>
    
    <div class="trace-dates-info">
      <div class="trace-date-item">
        <span class="date-label">
          <i class="far fa-calendar-plus text-blue-500 mr-1"></i>
          Fecha de Apertura:
        </span>
        <span class="date-value">${fechaApertura}</span>
      </div>
      <div class="trace-date-item">
        <span class="date-label">
          <i class="far fa-calendar-check text-green-500 mr-1"></i>
          Última Actualización:
        </span>
        <span class="date-value">${ultimaModificacion}</span>
      </div>
    </div>
  </div>`;
  
  // Comprobar si hay un técnico asignado para mostrar sección de contacto
  const nombreTecnico = ticket.Asignado_a || ticket.asignado_a || '';
  const tieneTecnicoAsignado = nombreTecnico && nombreTecnico !== 'No asignado' && nombreTecnico !== 'Sin asignar';
  
  // Mostrar información simplificada del técnico asignado
  let tecnicoContactoHtml = '';
  if (tieneTecnicoAsignado) {
      tecnicoContactoHtml = `
          <div class="bg-white rounded-lg shadow-sm mb-6 ticket-detail-animate">
              <div class="px-4 py-3 bg-blue-50 border-b border-blue-100 rounded-t-lg flex justify-between items-center">
                  <h3 class="font-semibold text-blue-700"><i class="fas fa-headset mr-2"></i>Técnico Asignado</h3>
                  <button onclick="showTechContactModal('${nombreTecnico}')" class="px-3 py-1 bg-blue-600 text-white rounded-full hover:bg-blue-700 text-sm">
                      <i class="fas fa-address-card mr-1"></i> Ver Contacto
                  </button>
              </div>
              <div class="p-4">
                  <div class="flex items-center">
                      <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mr-3">
                          <i class="fas fa-user"></i>
                      </div>
                      <div>
                          <h4 class="font-medium">${nombreTecnico}</h4>
                          <p class="text-sm text-gray-500">Haz clic en "Ver Contacto" para obtener información detallada</p>
                      </div>
                  </div>
              </div>
          </div>
      `;
  }
  
  // Extraer título con manejo de diferentes formatos
  const ticketTitulo = ticket.Título || ticket.titulo || 'Sin título';
  
  modalBody.innerHTML = `
      <div class="ticket-detail-header rounded-lg mb-6 ticket-detail-animate">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="md:col-span-2">
                  <h2 class="text-xl font-semibold mb-2">${ticketTitulo}</h2>
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
          <div class="bg-white rounded-lg shadow-sm ticket-detail-animate">
              <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 rounded-t-lg">
                  <h3 class="font-semibold"><i class="fas fa-info-circle mr-2"></i>Información General</h3>
              </div>
              <div class="p-4">
                  <table class="w-full">
                      <tbody>
                          <tr class="border-b border-gray-100">
                              <td class="py-2 font-medium text-gray-600">Entidad:</td>
                              <td class="py-2">${ticket.Entidad || ticket.entidad || 'No especificada'}</td>
                          </tr>
                          <tr class="border-b border-gray-100">
                              <td class="py-2 font-medium text-gray-600">Categoría:</td>
                              <td class="py-2">${ticket.Categoria || ticket.categoria || 'No especificada'}</td>
                          </tr>
                          <tr class="border-b border-gray-100">
                              <td class="py-2 font-medium text-gray-600">Tipo:</td>
                              <td class="py-2">${ticket.Tipo || ticket.tipo || 'No especificado'}</td>
                          </tr>
                          <tr class="border-b border-gray-100">
                              <td class="py-2 font-medium text-gray-600">Prioridad:</td>
                              <td class="py-2">${ticket.Prioridad || ticket.prioridad || 'No especificada'}</td>
                          </tr>
                          <tr class="border-b border-gray-100">
                              <td class="py-2 font-medium text-gray-600">Medio:</td>
                              <td class="py-2">${ticket.Medio || ticket.medio || 'No especificado'}</td>
                          </tr>
                          <tr>
                              <td class="py-2 font-medium text-gray-600">Ubicación:</td>
                              <td class="py-2">${ticket.Ubicacion || ticket.ubicacion || 'No especificada'}</td>
                          </tr>
                      </tbody>
                  </table>
              </div>
          </div>
          
          <!-- Asignación -->
          <div class="bg-white rounded-lg shadow-sm ticket-detail-animate">
              <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 rounded-t-lg">
                  <h3 class="font-semibold"><i class="fas fa-user mr-2"></i>Asignación</h3>
              </div>
              <div class="p-4">
                  <table class="w-full">
                      <tbody>
                          <tr class="border-b border-gray-100">
                              <td class="py-2 font-medium text-gray-600">Solicitante:</td>
                              <td class="py-2">${ticket.Solicitante || ticket.solicitante || 'No especificado'}</td>
                          </tr>
                          <tr class="border-b border-gray-100">
                              <td class="py-2 font-medium text-gray-600">Asignado a:</td>
                              <td class="py-2">
                                  ${ticket.Asignado_a || ticket.asignado_a || 'No asignado'}
                                  ${tieneTecnicoAsignado ? `
                                      <a href="javascript:void(0)" onclick="showTechContactModal('${nombreTecnico}')" class="ml-2 text-blue-600 hover:text-blue-800">
                                          <i class="fas fa-id-card"></i> Ver contacto
                                      </a>` : 
                                      ''
                                  }
                              </td>
                          </tr>
                          <tr>
                              <td class="py-2 font-medium text-gray-600">Estado:</td>
                              <td class="py-2">${ticket.Estado || ticket.estado || 'No especificado'}</td>
                          </tr>
                      </tbody>
                  </table>
              </div>
          </div>
      </div>
      
      <!-- Tiempos -->
      <div class="bg-white rounded-lg shadow-sm mb-6 ticket-detail-animate">
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
                                  <td class="py-2">${ticket.Tiempo_resolucion || ticket.tiempo_resolucion || 'No disponible'}</td>
                              </tr>
                              <tr class="border-b border-gray-100">
                                  <td class="py-2 font-medium text-gray-600">Duración:</td>
                                  <td class="py-2">${ticket.Duracion || ticket.duracion || 'No disponible'}</td>
                              </tr>
                              <tr class="border-b border-gray-100">
                                  <td class="py-2 font-medium text-gray-600">Tiempo Adicional:</td>
                                  <td class="py-2">${ticket.Tiempo_adicional || ticket.tiempo_adicional || 'No asignado'}</td>
                              </tr>
                              <tr>
                                  <td class="py-2 font-medium text-gray-600">Delay:</td>
                                  <td class="py-2">${ticket.Delay || ticket.delay || 'No disponible'}</td>
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
              `<button onclick="showTechContactModal('${nombreTecnico}')" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                  <i class="fas fa-phone-alt mr-2"></i>Contactar técnico
              </button>` : 
              ''
          }
      </div>
  `;
  
  // Animar entrada de los elementos
  setTimeout(() => {
      const elements = modalBody.querySelectorAll('.ticket-detail-animate');
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
}

/**
* Limpia la búsqueda actual
*/
function clearSearch() {
  // Limpiar formulario
  document.getElementById('searchQuery').value = '';
  document.getElementById('searchField').value = 'all';
  
  // Limpiar estado
  appState.currentSearch = { query: '', field: 'all' };
  appState.searchResults = [];
  
  // Actualizar UI mostrando los tickets más recientes
  const recentTickets = appState.allTickets.slice(0, CONFIG.maxResults);
  updateSearchResults(recentTickets);
  
  // Actualizar mensaje de búsqueda
  document.getElementById('searchStatus').textContent = 
      `Base de datos cargada con ${appState.allTickets.length} tickets. Mostrando los ${Math.min(CONFIG.maxResults, appState.allTickets.length)} más recientes.`;
  document.getElementById('searchStatus').className = 'text-sm text-gray-500 mt-1';
  document.getElementById('totalResults').textContent = appState.allTickets.length;
  
  // Restablecer estado de las tarjetas
  document.querySelectorAll('.stat-card').forEach(card => {
      card.classList.remove('ring-2', 'ring-blue-500');
  });
}

/**
* FUNCIÓN MEJORADA: Actualiza el tiempo de última actualización con formato correcto
*/
function updateLastUpdateTime() {
  const lastUpdateElement = document.getElementById('lastUpdate');
  if (lastUpdateElement && appState.lastUpdate) {
      try {
          const lastUpdate = moment(appState.lastUpdate);
          if (lastUpdate.isValid()) {
              lastUpdateElement.textContent = `Última actualización: ${lastUpdate.format('DD-MM-YYYY HH:mm:ss')} (${lastUpdate.fromNow()})`;
          } else {
              lastUpdateElement.textContent = `Última actualización: ${formatFecha(appState.lastUpdate)}`;
          }
      } catch (e) {
          lastUpdateElement.textContent = `Última actualización: ${appState.lastUpdate}`;
      }
  }
}

/**
* Controla la visualización del indicador de carga
* @param {boolean} isLoading - Estado de carga
*/
function setLoading(isLoading) {
  appState.isLoading = isLoading;
  const loadingElement = document.getElementById('loading');
  
  if (loadingElement) {
      loadingElement.style.display = isLoading ? 'block' : 'none';
  }
}

/**
* Normaliza un string para búsqueda (minúsculas, sin acentos)
* @param {string} str - Cadena a normalizar
* @returns {string} Cadena normalizada
*/
function normalizeString(str) {
  if (!str) return '';
  return String(str).toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
}

/**
* Obtiene la etiqueta según la categoría
* @param {string} category - Categoría del ticket
* @returns {string} Etiqueta para mostrar
*/
function getCategoryLabel(category) {
  switch (category) {
      case 'nuevos': return 'Nuevo';
      case 'espera': return 'En Espera';
      case 'curso': return 'En Curso';
      case 'resueltos': return 'Resuelto';
      default: return 'Desconocido';
  }
}

/**
* Muestra el modal de contacto del técnico con opción de edición
* @param {string} nombreTecnico - Nombre del técnico a buscar
*/
function showTechContactModal(nombreTecnico) {
// Obtenemos referencias al modal y sus componentes
const modal = document.getElementById('techContactModal');
const modalTitle = document.getElementById('techContactModalTitle');
const viewMode = document.getElementById('techContactViewMode');
const editMode = document.getElementById('techContactEditMode');

if (!modal || !modalTitle || !viewMode || !editMode) {
  console.error('No se encontraron elementos del modal de contacto');
  return;
}

// Mostrar el modal
modal.classList.remove('hidden');
modal.classList.add('flex');

// Asegurarse de que estamos en modo visualización
viewMode.classList.remove('hidden');
editMode.classList.add('hidden');

// Actualizar el título
modalTitle.textContent = `Contacto: ${nombreTecnico}`;

// Mostrar cargando
viewMode.innerHTML = `
  <div class="flex justify-center my-2">
    <div class="loading-spinner"></div>
  </div>
  <p class="text-center text-gray-500">Cargando información del técnico...</p>
`;

// Cargar los datos del técnico
fetch(`/api/tecnicos/nombre/${encodeURIComponent(nombreTecnico)}`)
  .then(response => {
    if (!response.ok) {
      throw new Error('Técnico no encontrado');
    }
    return response.json();
  })
  .then(data => {
    if (data.tecnico) {
      const tecnico = data.tecnico;
      
      // Almacenar los datos del técnico para la edición
      window.currentTechData = tecnico;
      
      // Generar avatar
      let avatarHtml = '';
      if (tecnico.foto && tecnico.foto.trim() !== '') {
        avatarHtml = `<img src="${tecnico.foto}" alt="${tecnico.nombre}" class="w-20 h-20 rounded-full border-2 border-white">`;
      } else {
        // Generar iniciales
        const iniciales = tecnico.nombre ? tecnico.nombre.split(' ').map(n => n.charAt(0)).slice(0, 2).join('') : '';
        avatarHtml = `
          <div class="w-20 h-20 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xl">
            ${iniciales}
          </div>
        `;
      }
      
      // Mostrar información de contacto
      viewMode.innerHTML = `
        <div class="flex flex-col items-center mb-4">
          ${avatarHtml}
          <h4 class="font-bold text-lg mt-2">${tecnico.nombre || 'Sin nombre'}</h4>
          <p class="text-gray-600">${tecnico.cargo || 'Técnico de Soporte'}</p>
          <div class="mt-1">
            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${tecnico.estado === 'disponible' ? 'bg-green-100 text-green-800' : tecnico.estado === 'ocupado' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
              <span class="w-2 h-2 mr-1 rounded-full ${tecnico.estado === 'disponible' ? 'bg-green-500' : tecnico.estado === 'ocupado' ? 'bg-yellow-500' : 'bg-red-500'}"></span>
              ${tecnico.estado ? tecnico.estado.charAt(0).toUpperCase() + tecnico.estado.slice(1) : 'Desconocido'}
            </span>
          </div>
        </div>
        
        <div class="space-y-3 mt-4">
          ${tecnico.email ? `
            <div class="flex items-center">
              <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-2">
                <i class="fas fa-envelope"></i>
              </div>
              <div>
                <span class="text-sm text-gray-500">Email:</span>
                <span class="font-medium block">${tecnico.email}</span>
              </div>
            </div>
          ` : ''}
          
          ${tecnico.telefono ? `
            <div class="flex items-center">
              <div class="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mr-2">
                <i class="fas fa-phone-alt"></i>
              </div>
              <div>
                <span class="text-sm text-gray-500">Teléfono:</span>
                <span class="font-medium block">${tecnico.telefono}</span>
              </div>
            </div>
          ` : ''}
          
          ${tecnico.anexo ? `
            <div class="flex items-center">
              <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-2">
                <i class="fas fa-phone"></i>
              </div>
              <div>
                <span class="text-sm text-gray-500">Anexo:</span>
                <span class="font-medium block">${tecnico.anexo}</span>
              </div>
            </div>
          ` : ''}
          
          ${tecnico.whatsapp ? `
            <div class="flex items-center">
              <div class="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center mr-2">
                <i class="fab fa-whatsapp"></i>
              </div>
              <div>
                <span class="text-sm text-gray-500">WhatsApp:</span>
                <span class="font-medium block">${tecnico.whatsapp}</span>
              </div>
            </div>
          ` : ''}
          
          ${tecnico.especialidades && tecnico.especialidades.length > 0 ? `
            <div class="flex items-center">
              <div class="w-8 h-8 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center mr-2">
                <i class="fas fa-star"></i>
              </div>
              <div>
                <span class="text-sm text-gray-500">Especialidades:</span>
                <div class="font-medium flex flex-wrap gap-1 mt-1">
                  ${tecnico.especialidades.map(esp => 
                    `<span class="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs">${esp}</span>`
                  ).join('')}
                </div>
              </div>
            </div>
          ` : ''}
        </div>
        
        <div class="flex flex-wrap justify-center gap-2 mt-6">
          ${tecnico.email ? `
            <a href="mailto:${tecnico.email}" class="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition action-btn">
              <i class="fas fa-envelope mr-1"></i> Email
            </a>
          ` : ''}
          
          ${tecnico.telefono ? `
            <a href="tel:${tecnico.telefono.replace(/\D/g, '')}" class="inline-flex items-center px-3 py-1 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition action-btn">
              <i class="fas fa-phone mr-1"></i> Llamar
            </a>
          ` : ''}
          
          ${tecnico.whatsapp ? `
            <a href="https://wa.me/${tecnico.whatsapp.replace(/\D/g, '')}" target="_blank" class="inline-flex items-center px-3 py-1 bg-green-600 text-white rounded-full hover:bg-green-700 transition action-btn">
              <i class="fab fa-whatsapp mr-1"></i> WhatsApp
            </a>
          ` : ''}
        </div>
      `;
      
      // Preparar el formulario de edición con los datos actuales
      fillEditForm(tecnico);
      
    } else {
      // Si no hay datos del técnico, mostrar mensaje de error
      viewMode.innerHTML = `
        <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div class="flex">
            <div class="flex-shrink-0">
              <i class="fas fa-exclamation-triangle text-yellow-400"></i>
            </div>
            <div class="ml-3">
              <p class="text-sm text-yellow-700">
                No se encontró información de contacto para el técnico "${nombreTecnico}".
              </p>
            </div>
          </div>
        </div>
      `;
    }
  })
  .catch(error => {
    console.error('Error al obtener información del técnico:', error);
    
    // Mostrar mensaje de error
    viewMode.innerHTML = `
      <div class="bg-red-50 border-l-4 border-red-400 p-4">
        <div class="flex">
          <div class="flex-shrink-0">
            <i class="fas fa-exclamation-circle text-red-400"></i>
          </div>
          <div class="ml-3">
            <p class="text-sm text-red-700">
              Error al cargar la información de contacto. Por favor intente nuevamente.
            </p>
          </div>
        </div>
      </div>
    `;
  });
}

/**
* Llena el formulario de edición con los datos del técnico
* @param {Object} tecnico - Datos del técnico
*/
function fillEditForm(tecnico) {
// Referencias a los elementos del formulario
const elements = {
  id: document.getElementById('editTechId'),
  nombre: document.getElementById('editTechNombre'),
  cargo: document.getElementById('editTechCargo'),
  area: document.getElementById('editTechArea'),
  email: document.getElementById('editTechEmail'),
  telefono: document.getElementById('editTechTelefono'),
  anexo: document.getElementById('editTechAnexo'),
  whatsapp: document.getElementById('editTechWhatsapp'),
  especialidades: document.getElementById('editTechEspecialidades'),
  estado: document.getElementById('editTechEstado'),
  foto: document.getElementById('editTechFoto')
};

// Verificar que todos los elementos existen
for (const key in elements) {
  if (!elements[key]) {
    console.error(`Elemento no encontrado: editTech${key.charAt(0).toUpperCase() + key.slice(1)}`);
    return;
  }
}

// Llenar el formulario con los datos del técnico
elements.id.value = tecnico.id || '';
elements.nombre.value = tecnico.nombre || '';
elements.cargo.value = tecnico.cargo || '';
elements.area.value = tecnico.area || 'sistemas';
elements.email.value = tecnico.email || '';
elements.telefono.value = tecnico.telefono || '';
elements.anexo.value = tecnico.anexo || '';
elements.whatsapp.value = tecnico.whatsapp || '';

// Procesamiento de especialidades
if (tecnico.especialidades && Array.isArray(tecnico.especialidades)) {
  elements.especialidades.value = tecnico.especialidades.join(', ');
} else {
  try {
    const especialidades = JSON.parse(tecnico.especialidades || '[]');
    elements.especialidades.value = especialidades.join(', ');
  } catch (e) {
    elements.especialidades.value = '';
  }
}

elements.estado.value = tecnico.estado || 'disponible';
elements.foto.value = tecnico.foto || '';
}

/**
* Actualiza los datos del técnico desde el formulario de edición
* @param {Event} event - Evento de formulario
*/
function updateTechDataFromModal(event) {
event.preventDefault();

const techId = document.getElementById('editTechId').value;

// Referencia al botón de submit para actualizar su estado
const submitButton = document.querySelector('#techEditForm button[type="submit"]');
if (submitButton) {
  submitButton.textContent = 'Guardando...';
  submitButton.disabled = true;
}

// Recopilar datos del formulario
const formData = {
  nombre: document.getElementById('editTechNombre').value,
  cargo: document.getElementById('editTechCargo').value,
  area: document.getElementById('editTechArea').value,
  email: document.getElementById('editTechEmail').value,
  telefono: document.getElementById('editTechTelefono').value,
  anexo: document.getElementById('editTechAnexo').value,
  whatsapp: document.getElementById('editTechWhatsapp').value,
  especialidades: document.getElementById('editTechEspecialidades').value
    .split(',')
    .map(item => item.trim())
    .filter(item => item !== ''),
  estado: document.getElementById('editTechEstado').value,
  foto: document.getElementById('editTechFoto').value
};

// Enviar los datos actualizados al servidor
fetch(`/api/tecnicos/${techId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(formData)
})
  .then(response => {
    if (!response.ok) {
      throw new Error('Error al actualizar técnico');
    }
    return response.json();
  })
  .then(data => {
    if (data.success) {
      // Volver al modo visualización y mostrar los datos actualizados
      toggleEditMode(false);
      
      // Actualizar la visualización con los nuevos datos
      // Refrescar toda la vista del técnico
      showTechContactModal(formData.nombre);
      
      // Mostrar mensaje de éxito
      alert('Técnico actualizado correctamente');
    } else {
      throw new Error(data.message || 'Error al actualizar técnico');
    }
  })
  .catch(error => {
    console.error('Error:', error);
    alert('Error al actualizar técnico. Por favor, intenta nuevamente.');
  })
  .finally(() => {
    if (submitButton) {
      submitButton.textContent = 'Guardar Cambios';
      submitButton.disabled = false;
    }
  });
}

/**
* Cambia entre el modo visualización y edición
* @param {boolean} [show] - Opcional: forzar mostrar/ocultar modo edición
*/
function toggleEditMode(show) {
const viewMode = document.getElementById('techContactViewMode');
const editMode = document.getElementById('techContactEditMode');
const toggleButton = document.getElementById('toggleEditMode');

if (!viewMode || !editMode || !toggleButton) return;

// Determinar el estado al que debe cambiar
const showEditMode = show !== undefined ? show : viewMode.classList.contains('hidden') === false;

if (showEditMode) {
  // Cambiar a modo edición
  viewMode.classList.add('hidden');
  editMode.classList.remove('hidden');
  toggleButton.innerHTML = '<i class="fas fa-eye text-xl"></i>';
} else {
  // Cambiar a modo visualización
  viewMode.classList.remove('hidden');
  editMode.classList.add('hidden');
  toggleButton.innerHTML = '<i class="fas fa-edit text-xl"></i>';
}
}

/**
* Inicializa el modal de contacto del técnico
*/
function initializeTechContactModal() {
const modal = document.getElementById('techContactModal');
const closeModalBtn = document.getElementById('closeTechModal');
const toggleEditBtn = document.getElementById('toggleEditMode');
const cancelEditBtn = document.getElementById('cancelEditButton');
const techEditForm = document.getElementById('techEditForm');

if (!modal) {
  console.error('No se encontró el modal de contacto');
  return;
}

// Cerrar modal al hacer clic en el botón de cierre
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', function() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  });
}

// Cerrar modal al hacer clic fuera del contenido
modal.addEventListener('click', function(event) {
  if (event.target === modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
});

// Cambiar entre modo visualización y edición
if (toggleEditBtn) {
  toggleEditBtn.addEventListener('click', function() {
    toggleEditMode();
  });
}

// Cancelar edición y volver a modo visualización
if (cancelEditBtn) {
  cancelEditBtn.addEventListener('click', function() {
    toggleEditMode(false);
  });
}

// Manejar envío del formulario de edición
if (techEditForm) {
  techEditForm.addEventListener('submit', updateTechDataFromModal);
}

// Cerrar modal con la tecla ESC
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
});
}

// Función para exportar datos a CSV
function exportToCSV() {
  const results = appState.searchResults.length > 0 ? appState.searchResults : appState.allTickets;
  
  if (results.length === 0) {
      alert('No hay datos para exportar');
      return;
  }
  
  // Obtener todas las columnas únicas
  const allColumns = new Set();
  results.forEach(ticket => {
      Object.keys(ticket).forEach(key => {
          if (key !== 'category') { // Excluir la categoría que agregamos
              allColumns.add(key);
          }
      });
  });
  
  // Convertir a array y ordenar las columnas
  const columns = Array.from(allColumns).sort();
  
  // Crear encabezado CSV
  let csv = columns.map(col => `"${col}"`).join(',') + '\n';
  
  // Agregar filas
  results.forEach(ticket => {
      const row = columns.map(col => {
          const value = ticket[col] === undefined ? '' : ticket[col];
          return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',');
      csv += row + '\n';
  });
  
  // Crear blob y descargar
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', 'tickets_export_' + new Date().toISOString().slice(0, 10) + '.csv');
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Exportamos las funciones que necesitamos acceder globalmente
window.showTicketDetails = showTicketDetails;
window.exportToCSV = exportToCSV;
window.showTechContactModal = showTechContactModal;
window.toggleEditMode = toggleEditMode;