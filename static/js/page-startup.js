/**
 * page-startup.js
 * Código de inicialización para resolver problemas de carga después de F5
 * Este script debe cargarse antes que todos los demás
 */

// Prevenir la actualización automática de datos hasta que estemos listos
window.SENASA_DATA_LOADING = true;

// Precargar datos del localStorage antes de que se inicie el resto de la aplicación
(function() {
    try {
        // Intentar cargar caché precargado
        const cachedData = localStorage.getItem('senasa_tickets_cache');
        
        if (cachedData) {
            const parsedData = JSON.parse(cachedData);
            
            // Exponer los datos en una variable global para que estén disponibles inmediatamente
            window.SENASA_PRELOADED_DATA = parsedData;
            
            console.log('Datos precargados desde localStorage');
            
            // También crear un objeto placeholder de appState para prevenir errores
            // durante la carga inicial
            window.appState = {
                allTickets: [],
                searchResults: [],
                currentSearch: { query: '', field: 'all', category: null },
                observers: [],
                subscribe: function(observer) {
                    if (typeof observer.update === 'function') {
                        this.observers.push(observer);
                        return true;
                    }
                    return false;
                },
                notify: function(data) {
                    this.observers.forEach(observer => observer.update(data));
                }
            };
        }
    } catch (error) {
        console.error('Error precargando datos:', error);
    }
    
    // Crear elementos funcionales temporales para evitar errores durante la carga
    // Estos elementos serán reemplazados cuando la aplicación real inicie
    document.addEventListener('DOMContentLoaded', function() {
        // Verificar si existen elementos clave y crearlos si no
        const elementsToCreate = [
            { id: 'loading', className: 'hidden' },
            { id: 'emptyState', className: 'hidden' },
            { id: 'searchResults', className: '' }
        ];
        
        elementsToCreate.forEach(element => {
            if (!document.getElementById(element.id)) {
                const el = document.createElement('div');
                el.id = element.id;
                el.className = element.className;
                document.body.appendChild(el);
            }
        });
    });
})();

// Función de utilidad que evita cargas inconsistentes en la interfaz
function stabilizePageLoad() {
    // Prevenir que se muestre contenido parcial durante carga
    document.body.style.visibility = 'hidden';

    // Se ejecuta cuando el DOM está listo
    document.addEventListener('DOMContentLoaded', function() {
        // Preparar el DOM antes de mostrar
        const counterElements = {
            'nuevos': document.getElementById('counter-nuevos'),
            'espera': document.getElementById('counter-espera'),
            'curso': document.getElementById('counter-curso'),
            'resueltos': document.getElementById('counter-resueltos')
        };
        
        // Prellenar contadores desde datos locales
        if (window.SENASA_PRELOADED_DATA) {
            const preloadedData = window.SENASA_PRELOADED_DATA;
            
            // Actualizar los contadores iniciales con datos precargados
            for (const category in counterElements) {
                const element = counterElements[category];
                if (element) {
                    let count = 0;
                    
                    // Mapear las categorías correctamente
                    const mappedCategory = category === 'curso' ? 'en_curso' : category;
                    
                    if (preloadedData[mappedCategory] && Array.isArray(preloadedData[mappedCategory])) {
                        count = preloadedData[mappedCategory].length;
                    }
                    
                    element.textContent = count;
                }
            }
            
            // Actualizar contador total
            const totalElement = document.getElementById('totalTickets');
            if (totalElement) {
                let total = 0;
                ['nuevos', 'en_curso', 'espera', 'resueltos'].forEach(cat => {
                    if (preloadedData[cat] && Array.isArray(preloadedData[cat])) {
                        total += preloadedData[cat].length;
                    }
                });
                totalElement.textContent = total;
            }
            
            // Actualizar timestamp de última actualización
            const lastUpdateElement = document.getElementById('lastUpdate');
            if (lastUpdateElement && preloadedData.last_update) {
                const fecha = new Date(preloadedData.last_update);
                const formatoFecha = fecha.toLocaleString('es-ES');
                
                // Actualizar contenido del elemento
                lastUpdateElement.innerHTML = `
                    <i class="fas fa-history"></i>
                    <span>Última actualización: ${formatoFecha}</span>
                `;
            }
        }
        
        // Cuando se cargue completamente la página, mostrar contenido
        window.addEventListener('load', function() {
            setTimeout(function() {
                document.body.style.visibility = 'visible';
                window.SENASA_DATA_LOADING = false;
                
                // Aplicar fade-in para una experiencia más suave
                document.body.style.opacity = '0';
                document.body.style.transition = 'opacity 300ms ease-out';
                
                setTimeout(function() {
                    document.body.style.opacity = '1';
                }, 50);
            }, 200);
        });
    });
}

// Iniciar estabilización de carga
stabilizePageLoad();