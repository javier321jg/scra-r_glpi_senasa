# Frontend React/Vite - Estructura del Proyecto

## 📋 Descripción General

Este documento describe la estructura recomendada para el frontend React (Vite) que consume la API Headless del sistema SENASA de seguimiento de tickets.

**Características Principales:**
- SPA (Single Page Application) con React + Vite
- Comunicación en tiempo real con WebSockets (Socket.IO)
- API REST para datos estáticos
- UI con Shadcn/UI y componentes reutilizables
- Estado global con Context API o Zustand

---

## 📁 Estructura de Directorios

```
frontend/
├── src/
│   ├── api/                      # Lógica de fetching y APIs
│   │   ├── index.js              # Configuración de axios/fetch
│   │   ├── ticketsApi.js         # Endpoints de tickets
│   │   ├── techniciansApi.js     # Endpoints de técnicos
│   │   ├── analyticsApi.js       # Endpoints de BI/Analytics
│   │   └── websocket.js          # Configuración de Socket.IO
│   │
│   ├── components/               # Componentes reutilizables
│   │   ├── dashboard/
│   │   │   ├── Dashboard.jsx     # Componente principal del dashboard
│   │   │   ├── StatCards.jsx     # Tarjetas de estadísticas
│   │   │   ├── TicketsTable.jsx  # Tabla de tickets
│   │   │   └── ChartsSection.jsx # Sección de gráficos
│   │   │
│   │   ├── technicians/
│   │   │   ├── TechnicianList.jsx
│   │   │   ├── TechnicianCard.jsx
│   │   │   ├── RankingTable.jsx  # Ranking de rendimiento
│   │   │   └── TechnicianSearch.jsx
│   │   │
│   │   ├── analytics/
│   │   │   ├── ForecastChart.jsx    # Gráfico de pronóstico de picos
│   │   │   ├── TrendChart.jsx       # Gráfico de tendencias
│   │   │   ├── PerformanceMetrics.jsx
│   │   │   └── AnalyticsPanel.jsx
│   │   │
│   │   ├── common/
│   │   │   ├── Header.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Navigation.jsx
│   │   │   ├── LoadingSpinner.jsx
│   │   │   └── ErrorBoundary.jsx
│   │   │
│   │   └── ui/
│   │       ├── Card.jsx           # Componentes Shadcn/UI
│   │       ├── Button.jsx
│   │       ├── Table.jsx
│   │       ├── Dialog.jsx
│   │       └── Toast.jsx
│   │
│   ├── hooks/                    # Custom React hooks
│   │   ├── useTickets.js         # Hook para tickets con WebSockets
│   │   ├── useTechnicians.js     # Hook para técnicos
│   │   ├── useAnalytics.js       # Hook para datos de BI
│   │   ├── useWebSocket.js       # Hook personalizado para Socket.IO
│   │   └── useAuth.js            # Hook para autenticación
│   │
│   ├── context/                 # Context API para estado global
│   │   ├── TicketsContext.jsx
│   │   ├── AuthContext.jsx
│   │   ├── ThemeContext.jsx
│   │   └── NotificationContext.jsx
│   │
│   ├── pages/                   # Páginas/vistas principales
│   │   ├── Dashboard.jsx        # Vista principal
│   │   ├── Tickets.jsx          # Vista de tickets
│   │   ├── Technicians.jsx      # Vista de técnicos
│   │   ├── Analytics.jsx        # Vista de análisis/BI
│   │   ├── Login.jsx            # Vista de login
│   │   ├── Settings.jsx         # Vista de configuración
│   │   └── NotFound.jsx         # Página 404
│   │
│   ├── utils/                   # Utilidades y helpers
│   │   ├── constants.js         # Constantes globales
│   │   ├── formatters.js        # Funciones de formato
│   │   ├── validators.js        # Validadores
│   │   ├── dateUtils.js         # Utilidades de fecha
│   │   └── logger.js            # Logging
│   │
│   ├── styles/                  # Estilos globales
│   │   ├── globals.css
│   │   ├── variables.css        # Variables CSS
│   │   └── animations.css
│   │
│   ├── App.jsx                  # Componente raíz
│   ├── main.jsx                 # Punto de entrada
│   └── index.css                # Estilos principales
│
├── public/                      # Archivos estáticos
│   ├── images/
│   ├── icons/
│   └── logo.svg
│
├── .env.example                 # Plantilla de variables de entorno
├── vite.config.js              # Configuración de Vite
├── package.json
├── tailwind.config.js          # Configuración de Tailwind (si se usa)
└── README.md
```

---

## 🔌 Conexión con APIs Backend

### 1. Configuración de Axios/Fetch (api/index.js)

```javascript
import axios from 'axios';

const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Interceptor para agregar token si existe
api.interceptors.request.use(config => {
    const token = localStorage.getItem('auth_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;
```

### 2. Endpoints de Tickets (api/ticketsApi.js)

```javascript
import api from './index';

export const ticketsApi = {
    // Obtener todos los tickets
    getAll: () => api.get('/api/tickets'),

    // Obtener tickets mejorados (optimizado)
    getImproved: () => api.get('/api/tickets/improved'),

    // Obtener tickets por tipo
    getByType: (type) => api.get('/api/tickets', { params: { tipo: type } }),

    // Obtener estadísticas
    getStats: () => api.get('/api/tickets/stats'),

    // Filtrar tickets
    filter: (filters) => api.get('/api/tickets', { params: filters })
};
```

### 3. Endpoints de Técnicos (api/techniciansApi.js)

```javascript
import api from './index';

export const techniciansApi = {
    // Obtener todos los técnicos
    getAll: () => api.get('/api/tecnicos'),

    // Obtener ranking de rendimiento
    getRanking: () => api.get('/api/tecnicos/ranking'),

    // Buscar técnicos
    search: (query, area) => api.get('/api/tecnicos', {
        params: { q: query, area: area }
    }),

    // Obtener técnico por nombre
    getByName: (nombre) => api.get(`/api/tecnicos/nombre/${nombre}`),

    // Actualizar técnico
    update: (id, data) => api.put(`/api/tecnicos/${id}`, data),

    // Refrescar lista desde tickets
    refresh: () => api.post('/api/tecnicos/refresh')
};
```

### 4. Endpoints de Analytics/BI (api/analyticsApi.js)

```javascript
import api from './index';

export const analyticsApi = {
    // Obtener pronóstico de picos
    getPicos: () => api.get('/api/analytics/picos'),

    // Obtener métricas de rendimiento
    getMetrics: () => api.get('/api/analytics/metrics'),

    // Obtener tendencias
    getTrends: () => api.get('/api/analytics/trends')
};
```

### 5. WebSocket en Tiempo Real (api/websocket.js)

```javascript
import io from 'socket.io-client';

const SOCKET_URL = process.env.VITE_SOCKET_URL || 'http://localhost:5000';

class WebSocketService {
    constructor() {
        this.socket = null;
    }

    connect() {
        this.socket = io(SOCKET_URL, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5
        });

        // Eventos de conexión
        this.socket.on('connect', () => {
            console.log('✅ Conectado al servidor WebSocket');
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Desconectado del servidor WebSocket');
        });

        this.socket.on('error', (error) => {
            console.error('⚠️ Error de WebSocket:', error);
        });
    }

    // Escuchar actualizaciones de tickets
    onTicketsUpdate(callback) {
        this.socket.on('tickets_update', callback);
    }

    // Escuchar notificaciones de procesamiento
    onProcessingUpdate(callback) {
        this.socket.on('processing_update', callback);
    }

    // Desuscribirse
    off(eventName) {
        this.socket.off(eventName);
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

export default new WebSocketService();
```

---

## 🎣 Custom Hooks

### useTickets Hook

```javascript
import { useState, useEffect, useCallback } from 'react';
import { ticketsApi } from '../api/ticketsApi';
import webSocketService from '../api/websocket';

export const useTickets = () => {
    const [tickets, setTickets] = useState({
        nuevos: [],
        espera: [],
        en_curso: [],
        resueltos: [],
        lastUpdate: null
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Obtener tickets iniciales
    useEffect(() => {
        fetchTickets();

        // Conectar WebSocket para actualizaciones en tiempo real
        webSocketService.connect();
        webSocketService.onTicketsUpdate(handleTicketsUpdate);

        return () => {
            webSocketService.disconnect();
        };
    }, []);

    const fetchTickets = useCallback(async () => {
        setLoading(true);
        try {
            const response = await ticketsApi.getImproved();
            setTickets(response.data);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleTicketsUpdate = (data) => {
        setTickets(data);
    };

    return { tickets, loading, error, refetch: fetchTickets };
};
```

### useTechnicians Hook

```javascript
import { useState, useEffect, useCallback } from 'react';
import { techniciansApi } from '../api/techniciansApi';

export const useTechnicians = () => {
    const [technicians, setTechnicians] = useState([]);
    const [ranking, setRanking] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchTechnicians();
        fetchRanking();
    }, []);

    const fetchTechnicians = useCallback(async () => {
        setLoading(true);
        try {
            const response = await techniciansApi.getAll();
            setTechnicians(response.data.tecnicos);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchRanking = useCallback(async () => {
        try {
            const response = await techniciansApi.getRanking();
            setRanking(response.data.ranking);
        } catch (err) {
            console.error('Error fetching ranking:', err);
        }
    }, []);

    return { technicians, ranking, loading, error, refetch: fetchTechnicians };
};
```

---

## 🎨 Componentes Principales

### StatCards Component

Muestra tarjetas con estadísticas generales:
- Total de tickets por estado
- Técnicos disponibles
- TTR promedio
- Tasa de resolución

### TicketsTable Component

Tabla interactiva con:
- Filtrado por tipo/estado
- Búsqueda
- Paginación
- Sorting
- Actualización en tiempo real

### RankingTable Component

Tabla de ranking de técnicos con:
- Posición
- Nombre y área
- Tickets activos
- TTR promedio
- Puntuación de rendimiento

### ForecastChart Component

Gráfico de predicción de picos:
- Línea de pronóstico para 7 días
- Zonas de confianza
- Horas pico destacadas
- Comparación con histórico

---

## 📊 Estado Global (Context API)

### TicketsContext

```javascript
import { createContext, useState, useCallback } from 'react';

export const TicketsContext = createContext();

export const TicketsProvider = ({ children }) => {
    const [tickets, setTickets] = useState({});
    const [filters, setFilters] = useState({
        type: 'all',
        search: '',
        technician: ''
    });

    const updateTickets = useCallback((newTickets) => {
        setTickets(newTickets);
    }, []);

    const updateFilters = useCallback((newFilters) => {
        setFilters(prev => ({ ...prev, ...newFilters }));
    }, []);

    return (
        <TicketsContext.Provider value={{
            tickets,
            filters,
            updateTickets,
            updateFilters
        }}>
            {children}
        </TicketsContext.Provider>
    );
};
```

---

## 🔧 Configuración de Vite (vite.config.js)

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
```

---

## 🚀 Variables de Entorno (.env)

```
# Backend API
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000

# Configuración de aplicación
VITE_APP_NAME=SENASA Tickets
VITE_APP_VERSION=2.0
VITE_LOG_LEVEL=info
```

---

## 📦 Dependencias Recomendadas

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.6.0",
    "socket.io-client": "^4.7.0",
    "@shadcn/ui": "latest",
    "recharts": "^2.10.0",
    "react-router-dom": "^6.20.0",
    "zustand": "^4.4.0",
    "date-fns": "^2.30.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0",
    "tailwindcss": "^3.3.0"
  }
}
```

---

## 🔄 Flujo de Datos en Tiempo Real

```
┌──────────────────┐
│   React App      │
└────────┬─────────┘
         │
    ┌────┴──────────────────────────────────┐
    │                                       │
┌───▼──────┐                        ┌──────▼──────┐
│  REST    │                        │ WebSockets  │
│  API GET │                        │ Socket.IO   │
└───┬──────┘                        └──────┬──────┘
    │                                      │
    │       ┌──────────────────────────────┘
    │       │
┌───▼───────▼──────────────────────────────┐
│        Flask Backend                     │
│  ┌─────────────────────────────────────┐ │
│  │  /api/tickets (GET)                 │ │
│  │  /api/tickets/improved (GET)        │ │
│  │  /api/tecnicos (GET)                │ │
│  │  /api/analytics/picos (GET)         │ │
│  │  /api/tecnicos/ranking (GET)        │ │
│  │                                     │ │
│  │  Socket.IO Events:                  │ │
│  │  - tickets_update                   │ │
│  │  - processing_update                │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
         │
    ┌────┴────────────────────┐
    │                         │
┌───▼────────┐         ┌──────▼──────┐
│   Redis    │         │   SQLite    │
│  (Caché)   │         │   (BD)      │
└────────────┘         └─────────────┘
```

---

## 🎯 Ejemplo de Flujo Principal

1. **Carga Inicial:**
   - App se conecta al backend
   - Fetch inicial de tickets, técnicos, analíticas
   - Conexión WebSocket se establece

2. **Tiempo Real:**
   - Los datos se actualizan automáticamente vía WebSocket
   - Los gráficos se refrescan con los nuevos datos
   - Las tablas se actualizan sin recargar la página

3. **Interacción del Usuario:**
   - Filtros se aplican localmente primero
   - Se puede hacer click para ver detalles
   - Búsqueda se ejecuta en tiempo real

---

## 📝 Checklist de Implementación

- [ ] Configuración base de Vite + React
- [ ] Estructura de carpetas
- [ ] Configuración de APIs (axios/fetch)
- [ ] WebSocket Socket.IO integrado
- [ ] Custom hooks implementados
- [ ] Componentes principales
- [ ] Context API para estado global
- [ ] Componentes Shadcn/UI integrados
- [ ] Gráficos con Recharts
- [ ] Tablas interactivas
- [ ] Filtrado y búsqueda
- [ ] Autenticación (si es necesaria)
- [ ] Manejo de errores y loading states
- [ ] Responsive design
- [ ] Testing con Vitest/Jest
- [ ] Build y optimización

---

## 📚 Referencias Útiles

- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [Socket.IO Client](https://socket.io/docs/v4/client-api/)
- [Shadcn/UI](https://ui.shadcn.com/)
- [Recharts](https://recharts.org/)
- [Tailwind CSS](https://tailwindcss.com/)

---

**Última actualización:** Noviembre 2025
**Versión:** 2.0 (Headless API + React SPA)
