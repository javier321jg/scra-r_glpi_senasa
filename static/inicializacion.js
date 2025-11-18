// inicializacion.js
document.addEventListener('DOMContentLoaded', function() {
    // Mostrar loaders para todos los gráficos
    const loaders = ['estadoChartLoader', 'tendenciaChartLoader', 'techChartLoader', 'timeChartLoader'];
    loaders.forEach(id => {
      const loader = document.getElementById(id);
      if (loader) loader.classList.remove('hidden');
    });
    
    // Verificar que Chart.js esté disponible
    function checkChartJs() {
      console.log("Verificando Chart.js...");
      if (typeof Chart === 'undefined') {
        console.warn("Chart.js no disponible, reintentando...");
        setTimeout(checkChartJs, 100);
        return;
      }
      
      // Chart.js está disponible, inicializar
      console.log("Chart.js disponible, iniciando...");
      try {
        if (typeof ChartDataLabels !== 'undefined') {
          Chart.register(ChartDataLabels);
          console.log("Plugin ChartDataLabels registrado");
        }
        
        // Crear gráficos mínimos para probar que el rendering funciona
        inicializarGraficosVacios();
        
        console.log("Gráficos vacíos inicializados");
      } catch (error) {
        console.error("Error al inicializar Chart.js:", error);
      }
    }
    
    // Crear gráficos vacíos para verificar que el rendering funciona
    function inicializarGraficosVacios() {
      try {
        // Gráfico de estado
        const estadoCtx = document.getElementById('estadoChart')?.getContext('2d');
        if (estadoCtx) {
          window.estadoChart = new Chart(estadoCtx, {
            type: 'doughnut',
            data: {
              labels: ['Cargando...'],
              datasets: [{
                data: [1],
                backgroundColor: ['#e2e8f0']
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: '65%',
              plugins: { legend: { display: false } }
            }
          });
          console.log("Gráfico de estado inicializado");
        }
        
        // Gráfico de tendencia
        const tendenciaCtx = document.getElementById('tendenciaChart')?.getContext('2d');
        if (tendenciaCtx) {
          window.tendenciaChart = new Chart(tendenciaCtx, {
            type: 'line',
            data: {
              labels: ['Cargando...'],
              datasets: [{
                data: [0],
                borderColor: '#4f46e5',
                borderWidth: 2
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } }
            }
          });
          console.log("Gráfico de tendencia inicializado");
        }
        
        // Gráfico de técnicos
        const techCtx = document.getElementById('technicianChart')?.getContext('2d');
        if (techCtx) {
          window.technicianChart = new Chart(techCtx, {
            type: 'bar',
            data: {
              labels: ['Cargando...'],
              datasets: [{
                data: [0],
                backgroundColor: '#4f46e5'
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } }
            }
          });
          console.log("Gráfico de técnicos inicializado");
        }
        
        // Gráfico de tiempo por estado
        const timeCtx = document.getElementById('avgTimeStateChart')?.getContext('2d');
        if (timeCtx) {
          window.avgTimeStateChart = new Chart(timeCtx, {
            type: 'radar',
            data: {
              labels: ['Cargando...'],
              datasets: [{
                data: [0],
                backgroundColor: 'rgba(79, 70, 229, 0.2)',
                borderColor: '#4f46e5'
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } }
            }
          });
          console.log("Gráfico de tiempo por estado inicializado");
        }
        
        // Ocultar loaders después de unos segundos
        setTimeout(() => {
          loaders.forEach(id => {
            const loader = document.getElementById(id);
            if (loader) {
              loader.style.opacity = 0;
              setTimeout(() => loader.classList.add('hidden'), 500);
            }
          });
        }, 1500);
        
      } catch (error) {
        console.error("Error al inicializar gráficos vacíos:", error);
      }
    }
    
    // Iniciar verificación después de un breve retraso
    setTimeout(checkChartJs, 100);
  });