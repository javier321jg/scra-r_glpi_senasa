// Coloca este código en un archivo nuevo, por ejemplo: theme-handler.js

(function() {
    // Lista de elementos que necesitan estilos específicos cuando cambia el tema
    const themeElements = {
      inputs: '.search-input, .filter-dropdown, input[type="text"], input[type="email"], input[type="password"], select, textarea',
      cards: '.stat-card, .search-card, .results-card, .ticket-card, .modal-content, .trace-date-item',
      borders: '.results-header, .ticket-card, .modal-header, .modal-footer',
      text: '.ticket-info-label, .ticket-info-value, .ticket-property-label, .date-label, .date-value, .step-label'
    };
  
    // Función para aplicar el tema actual a elementos específicos
    function applyThemeToElements(isDarkMode) {
      const theme = isDarkMode ? 'dark' : 'light';
      
      // Actualizar inputs y controles de formulario
      document.querySelectorAll(themeElements.inputs).forEach(el => {
        if (isDarkMode) {
          el.style.backgroundColor = 'var(--card-bg-dark)';
          el.style.color = 'var(--text-primary-dark)';
          el.style.borderColor = '#4B5563';
        } else {
          el.style.backgroundColor = 'var(--card-bg-light)';
          el.style.color = 'var(--text-primary-light)';
          el.style.borderColor = '#e5e7eb';
        }
      });
      
      // Actualizar elementos de tarjetas
      document.querySelectorAll(themeElements.cards).forEach(el => {
        el.style.backgroundColor = isDarkMode ? 'var(--card-bg-dark)' : 'var(--card-bg-light)';
        el.style.color = isDarkMode ? 'var(--text-primary-dark)' : 'var(--text-primary-light)';
      });
      
      // Actualizar bordes
      document.querySelectorAll(themeElements.borders).forEach(el => {
        el.style.borderColor = isDarkMode ? '#374151' : '#f3f4f6';
      });
      
      // Actualizar textos específicos
      document.querySelectorAll(themeElements.text).forEach(el => {
        if (el.classList.contains('ticket-info-label') || el.classList.contains('ticket-property-label')) {
          el.style.color = isDarkMode ? 'var(--text-muted-dark)' : 'var(--text-muted-light)';
        } else {
          el.style.color = isDarkMode ? 'var(--text-primary-dark)' : 'var(--text-primary-light)';
        }
      });
      
      // Corregir contraste de botones secundarios
      document.querySelectorAll('.btn-secondary').forEach(el => {
        if (isDarkMode) {
          el.style.backgroundColor = '#374151';
          el.style.color = '#E5E7EB';
          el.style.borderColor = '#4B5563';
        } else {
          el.style.backgroundColor = '#f3f4f6';
          el.style.color = 'var(--text-secondary-light)';
          el.style.borderColor = '#e5e7eb';
        }
      });
      
      // Actualizar iconos de estado vacío
      document.querySelectorAll('.empty-state-icon').forEach(el => {
        el.style.color = isDarkMode ? '#374151' : '#e5e7eb';
      });
      
      // Ajustar overlay loading
      const loadingOverlay = document.querySelector('.loading-overlay');
      if (loadingOverlay) {
        loadingOverlay.style.backgroundColor = isDarkMode ? 'rgba(17, 24, 39, 0.8)' : 'rgba(255, 255, 255, 0.8)';
      }
  
      // Ajustar fondo de encabezados en modales
      document.querySelectorAll('.modal-header, .modal-footer').forEach(el => {
        el.style.backgroundColor = isDarkMode ? '#111827' : '#f9fafb';
      });
    }
  
    // Función mejorada para cambiar tema
    function toggleTheme() {
      const html = document.documentElement;
      const themeToggle = document.getElementById('theme-toggle');
      const isDarkMode = !html.classList.contains('dark-mode');
      
      if (isDarkMode) {
        // Cambiar a modo oscuro
        html.classList.remove('light-mode');
        html.classList.add('dark-mode');
        if (themeToggle) themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        localStorage.setItem('theme', 'dark');
      } else {
        // Cambiar a modo claro
        html.classList.remove('dark-mode');
        html.classList.add('light-mode');
        if (themeToggle) themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        localStorage.setItem('theme', 'light');
      }
      
      // Aplicar cambios específicos a elementos
      applyThemeToElements(isDarkMode);
      
      // Disparar evento personalizado para que otros componentes puedan reaccionar
      window.dispatchEvent(new CustomEvent('themeChanged', { 
        detail: { theme: isDarkMode ? 'dark' : 'light' } 
      }));
    }
  
    // Inicialización: aplicar tema guardado
    function initTheme() {
      const savedTheme = localStorage.getItem('theme');
      const html = document.documentElement;
      const isDarkMode = savedTheme === 'dark';
      
      if (isDarkMode) {
        html.classList.remove('light-mode');
        html.classList.add('dark-mode');
      } else {
        html.classList.remove('dark-mode');
        html.classList.add('light-mode');
      }
      
      // Configurar botón de cambio de tema
      const themeToggle = document.getElementById('theme-toggle');
      if (themeToggle) {
        themeToggle.innerHTML = isDarkMode ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        themeToggle.onclick = toggleTheme;
      }
      
      // Aplicar tema a elementos específicos
      applyThemeToElements(isDarkMode);
    }
  
    // Ejecutar inicialización cuando el DOM esté cargado
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initTheme);
    } else {
      initTheme();
    }
  
    // Exponer la función de cambio de tema globalmente
    window.toggleTheme = toggleTheme;
  })();