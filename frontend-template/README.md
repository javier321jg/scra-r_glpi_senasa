# SENASA Ticket Tracking System - Frontend (React + Vite)

## Descripcion

Este es el frontend de la aplicacion SENASA de seguimiento de tickets, construido con React 18 y Vite. Se conecta a una API Headless Flask y utiliza WebSockets para actualizaciones en tiempo real.

## Requisitos

- Node.js 16+
- npm o pnpm
- Backend Flask corriendo en `http://localhost:5000`

## Instalacion

```bash
# Clonar/copiar el proyecto
cd frontend-template

# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env.local
```

## Desarrollo

```bash
# Iniciar servidor de desarrollo
npm run dev

# La aplicacion estara disponible en http://localhost:3000
```

## Build para Produccion

```bash
# Crear build optimizado
npm run build

# Vista previa del build
npm run preview
```

## Estructura del Proyecto

Ver `/FRONTEND_STRUCTURE.md` para una descripcion detallada de la estructura.

## Conexion con Backend

El frontend se conecta automaticamente al backend especificado en `VITE_API_URL`:

- Endpoints REST: Para datos estaticos
- WebSockets: Para actualizaciones en tiempo real de tickets

### Configuracion

Editar `.env.local` para cambiar:
```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

## Estructura de APIs

### Tickets API
```javascript
import { ticketsApi } from './api/ticketsApi';

// Obtener todos los tickets
const tickets = await ticketsApi.getAll();

// Obtener tickets mejorados (desde Redis)
const tickets = await ticketsApi.getImproved();

// Obtener por tipo
const newTickets = await ticketsApi.getByType('nuevos');
```

### Technicians API
```javascript
import { techniciansApi } from './api/techniciansApi';

// Obtener todos los tecnicos
const techs = await techniciansApi.getAll();

// Obtener ranking
const ranking = await techniciansApi.getRanking();
```

### Analytics API
```javascript
import { analyticsApi } from './api/analyticsApi';

// Obtener pronostico de picos
const forecast = await analyticsApi.getPicos();
```

## Custom Hooks

### useTickets
Gestiona tickets con actualizaciones en tiempo real:
```javascript
const { tickets, loading, error, refetch } = useTickets();
```

### useTechnicians
Gestiona tecnicos y ranking:
```javascript
const { technicians, ranking, loading } = useTechnicians();
```

### useAnalytics
Obtiene datos de BI/Analytics:
```javascript
const { forecast, trends, metrics } = useAnalytics();
```

## Componentes Principales

- Dashboard: Vista principal con estadisticas
- TicketsTable: Tabla de tickets con filtrado
- TechnicianList: Lista de tecnicos con ranking
- ForecastChart: Grafico de pronostico de picos
- StatCards: Tarjetas de estadisticas

## Actualizaciones en Tiempo Real

El frontend se suscribe a eventos WebSocket del backend:

```javascript
import webSocketService from './api/websocket';

// Conectar
webSocketService.connect();

// Escuchar actualizaciones
webSocketService.onTicketsUpdate((data) => {
    console.log('Nuevos datos:', data);
});
```

## Testing

```bash
# Ejecutar tests
npm run test

# Coverage
npm run test:coverage
```

## Variables de Entorno

```env
# Backend
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000

# App Config
VITE_APP_NAME=SENASA Tickets
VITE_LOG_LEVEL=info

# Intervalos (ms)
VITE_REFETCH_INTERVAL=5000
VITE_STATS_INTERVAL=30000
```

## Troubleshooting

### Conexion a Backend fallida
- Verificar que el backend esta corriendo en el puerto 5000
- Revisar las variables `VITE_API_URL` y `VITE_SOCKET_URL`

### WebSocket no conecta
- Verificar CORS habilitado en Flask
- Revisar console.log para mensajes de error

### Datos no se actualizan
- Verificar que Redis esta corriendo
- Revisar que `socketio.emit()` se ejecuta en el backend

## Documentacion Adicional

- [Guia Completa de Estructura](../FRONTEND_STRUCTURE.md)
- [Documentacion de Vite](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [Socket.IO Client](https://socket.io/docs/v4/client-api/)

## Contribuir

1. Crear feature branch: `git checkout -b feature/nueva-feature`
2. Commit cambios: `git commit -am 'Add nueva-feature'`
3. Push al branch: `git push origin feature/nueva-feature`
4. Crear Pull Request

## Licencia

MIT

## Contacto

Para soporte, contactar al equipo de desarrollo SENASA.
