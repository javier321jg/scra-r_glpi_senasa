# Base de Datos - SQLite

Almacenamiento persistente de todos los datos de tickets y tecnicos.

## Estructura

- **tickets_data.db** - Archivo de base de datos SQLite

## Tablas Principales

### actualizaciones

Registro historico de cada actualizacion de tickets:

```sql
CREATE TABLE actualizaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_actualizacion TEXT,
    nuevos_count INTEGER,
    en_espera_count INTEGER,
    en_curso_count INTEGER,
    resueltos_count INTEGER
);
```

### tickets_nuevos, tickets_espera, tickets_curso, tickets_resueltos

Cada tabla contiene tickets en su respectivo estado:

```sql
CREATE TABLE tickets_XXX (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_interno TEXT,
    ticket_id TEXT,
    titulo TEXT,
    descripcion TEXT,
    fecha_apertura TEXT,
    fecha_resolucion TEXT,
    asignado_a TEXT,
    estado TEXT,
    prioridad TEXT,
    categoria TEXT
);
```

### tecnicos

Informacion de tecnicos del sistema:

```sql
CREATE TABLE tecnicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE,
    cargo TEXT,
    area TEXT,
    email TEXT,
    telefono TEXT,
    anexo TEXT,
    whatsapp TEXT,
    especialidades TEXT,
    foto TEXT,
    estado TEXT,
    fecha_registro TEXT
);
```

## Inicializacion

Para inicializar la base de datos:

```bash
python init_tecnicos.py
```

## Respaldo

Para hacer backup de la BD:

```bash
cp basededatos/tickets_data.db basededatos/tickets_data.db.backup
```

## Restauracion

Para restaurar desde backup:

```bash
cp basededatos/tickets_data.db.backup basededatos/tickets_data.db
```

## Mantenimiento

### Ver estructura

```bash
sqlite3 basededatos/tickets_data.db
sqlite> .tables       # Ver tabla disponibles
sqlite> .schema       # Ver estructura completa
sqlite> .quit         # Salir
```

### Limpiar datos

```bash
rm basededatos/tickets_data.db
python init_tecnicos.py
```

### Verificar integridad

```bash
sqlite3 basededatos/tickets_data.db "PRAGMA integrity_check;"
```

---

Ver README.md principal para mas informacion.
