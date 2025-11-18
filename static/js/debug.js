// debug.js - Añadir a la página HTML temporal para diagnóstico
document.addEventListener('DOMContentLoaded', function() {
    // Interceptar eventos socket.io para verificar datos
    if (typeof io !== 'undefined') {
        console.log('Socket.io detectado - agregando interceptor de eventos');
        
        // Esperar a que se establezca la conexión socket
        setTimeout(function() {
            // Verificar si el socket existe
            if (window.socket) {
                console.log('Interceptando eventos del socket existente');
                
                // Guardar la función original
                const originalOn = window.socket.on;
                
                // Interceptar la función 'on'
                window.socket.on = function(event, callback) {
                    if (event === 'tickets_update') {
                        // Modificar el callback para loguear datos
                        return originalOn.call(this, event, function(data) {
                            console.log('SOCKET EVENT tickets_update recibido:', data);
                            
                            // Verificar estructura de datos
                            if (data) {
                                console.log('Estructura de datos recibidos:', Object.keys(data));
                                console.log('Conteo de tickets:',
                                    'nuevos:', data.nuevos ? data.nuevos.length : 0,
                                    'curso:', data.curso ? data.curso.length : 0,
                                    'espera:', data.espera ? data.espera.length : 0,
                                    'resueltos:', data.resueltos ? data.resueltos.length : 0);
                            }
                            
                            // Verificar si appState actualiza los contadores
                            setTimeout(function() {
                                const counterNuevos = document.getElementById('counter-nuevos');
                                const counterEspera = document.getElementById('counter-espera');
                                const counterCurso = document.getElementById('counter-curso');
                                const counterResueltos = document.getElementById('counter-resueltos');
                                
                                console.log('Contadores UI:',
                                    'nuevos:', counterNuevos ? counterNuevos.textContent : 'no encontrado',
                                    'espera:', counterEspera ? counterEspera.textContent : 'no encontrado',
                                    'curso:', counterCurso ? counterCurso.textContent : 'no encontrado',
                                    'resueltos:', counterResueltos ? counterResueltos.textContent : 'no encontrado');
                            }, 1000);
                            
                            // Llamar al callback original
                            callback(data);
                        });
                    }
                    return originalOn.apply(this, arguments);
                };
            } else {
                console.error('Socket no encontrado en window.socket');
                
                // Verificar si existe en el módulo ticket-core.js
                const appState = window.appState;
                if (appState) {
                    console.log('appState encontrado, verificando estructura');
                    console.log('appState properties:', Object.keys(appState));
                    
                    if (appState.allTickets) {
                        console.log('Tickets en appState:', appState.allTickets.length);
                    }
                    
                    if (appState.counters) {
                        console.log('Contadores en appState:', appState.counters);
                    }
                }
            }
        }, 2000);
    } else {
        console.error('Socket.io no está definido');
    }

    // Imprimir contadores actuales y estado DOM
    console.log('Estado inicial DOM:');
    const counterElements = ['counter-nuevos', 'counter-espera', 'counter-curso', 'counter-resueltos'];
    counterElements.forEach(id => {
        const el = document.getElementById(id);
        console.log(`${id}: ${el ? el.textContent : 'no encontrado'}`);
    });
    
    // Comprobar carga de scripts
    const scripts = document.querySelectorAll('script');
    console.log('Scripts cargados:', Array.from(scripts).map(s => s.src || 'inline script'));
});

// Forzar actualización de contadores después de 5s si siguen en 0
setTimeout(function() {
    const counterNuevos = document.getElementById('counter-nuevos');
    const counterEspera = document.getElementById('counter-espera');
    const counterCurso = document.getElementById('counter-curso');
    const counterResueltos = document.getElementById('counter-resueltos');
    
    if (counterNuevos && counterNuevos.textContent === '0' &&
        counterEspera && counterEspera.textContent === '0' &&
        counterCurso && counterCurso.textContent === '0' &&
        counterResueltos && counterResueltos.textContent === '0') {
        
        console.log('FORZANDO ACTUALIZACIÓN de contadores:');
        fetch('/api/tickets/improved')
            .then(response => response.json())
            .then(data => {
                console.log('Datos obtenidos directamente de API:', data);
                
                // Intento de actualización forzada
                if (data.nuevos) counterNuevos.textContent = data.nuevos.length.toString();
                if (data.espera) counterEspera.textContent = data.espera.length.toString();
                if (data.curso || data.en_curso) counterCurso.textContent = (data.curso ? data.curso.length : (data.en_curso ? data.en_curso.length : 0)).toString();
                if (data.resueltos) counterResueltos.textContent = data.resueltos.length.toString();
                
                console.log('Contadores actualizados forzosamente');
            })
            .catch(err => console.error('Error al obtener datos:', err));
    }
}, 5000);