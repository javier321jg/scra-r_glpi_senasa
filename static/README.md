# Static - Archivos Estaticos

Contenedor para archivos estaticos como CSS, JavaScript, imagenes, etc.

## Estructura

```
static/
├── css/              # Hojas de estilo
├── js/               # Scripts JavaScript (si existen)
├── images/           # Imagenes (si existen)
└── fonts/            # Fuentes personalizadas (si existen)
```

## CSS

Los archivos CSS contienen estilos para las plantillas HTML:

- Estilos globales
- Componentes reutilizables
- Responsive design
- Temas (si se usan)

## JavaScript

Scripts JavaScript adicionales para funcionalidades del lado del cliente.

## Configuracion

Para servir archivos estaticos desde Flask:

```python
app = Flask(__name__, static_folder='static')
```

Los archivos se acceden mediante:

```html
<link rel="stylesheet" href="/static/css/style.css">
<script src="/static/js/script.js"></script>
<img src="/static/images/logo.png">
```

---

Ver README.md principal para mas informacion.
