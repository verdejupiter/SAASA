# SAASA - Control de Asistencia

**Servicios Aeroportuarios Andinos S.A.**

Aplicación web de control de asistencia que consume APIs de GeoVictoria, almacena datos en Azure Database for MySQL y muestra un dashboard interactivo. Desplegada como Google Apps Script Web App.

---

## 1. Flujo del Sistema

```
┌──────────────────────────────────────────────────────────────────┐
│  BOTÓN "Sincronizar API"                                         │
│                                                                  │
│  1. oauth.gs  → API GeoVictoria (OAuth 1.0) → Lista de usuarios │
│  2. auth.gs   → API GeoVictoria (JWT Login)  → Token Bearer     │
│  3. api.gs    → API AttendanceBook (lotes 50) → Datos crudos    │
│  4. data.gs   → Procesar y clasificar estados                    │
│  5. database.gs → INSERT en Azure MySQL (multi-row, 50/query)   │
│  6. database.gs → SELECT desde Azure MySQL → Dashboard          │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  BOTÓN "Cargar desde BD"                                         │
│                                                                  │
│  1. database.gs → SELECT desde Azure MySQL → Dashboard           │
│     (No llama a ninguna API, carga instantánea)                  │
└──────────────────────────────────────────────────────────────────┘

El dashboard SIEMPRE muestra datos desde la base de datos.
"Sincronizar API" actualiza la BD y luego lee de ella.
"Cargar desde BD" lee directamente (rápido, sin llamar APIs).
```

---

## 2. Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                     GOOGLE APPS SCRIPT                           │
│                                                                  │
│  ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌────────────┐  │
│  │  app.gs   │   │ oauth.gs  │   │ auth.gs  │   │   api.gs   │  │
│  │ Controller│   │ OAuth 1.0 │   │ JWT Login│   │ Attendance │  │
│  │ + CONFIG  │   │ HMAC-SHA1 │   │          │   │ Lotes: 50  │  │
│  └─────┬─────┘   └─────┬─────┘   └────┬─────┘   └─────┬──────┘  │
│        │               │              │               │          │
│        │         ┌─────▼──────────────▼───────────────▼───────┐  │
│        │         │              data.gs                        │  │
│        │         │  Procesamiento + Clasificación de estados   │  │
│        │         └──────────────────┬─────────────────────────┘  │
│        │                           │                             │
│        │         ┌─────────────────▼─────────────────────────┐  │
│        │         │           database.gs                      │  │
│        │         │  Persistencia Azure MySQL via JDBC          │  │
│        │         │  Multi-row INSERT (50 filas/query)          │  │
│        │         │  Integridad: PK, FK, UNIQUE, NOT NULL      │  │
│        │         └────────────────────────────────────────────┘  │
│        │                                                         │
│  ┌─────▼───────────────────────────────────────────────────────┐ │
│  │                  index.html (Frontend SPA)                   │ │
│  │  Tailwind CSS + Chart.js + google.script.run                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌───────────────────────┐      ┌───────────────────────────────┐
│   API GeoVictoria     │      │   Azure Database for MySQL    │
│                       │      │                               │
│ OAuth 1.0 → Usuarios  │      │ Servidor: saasa-mysql         │
│ JWT → Asistencia      │      │ BD: saasa_asistencia          │
│                       │      │ Tablas:                       │
│ ~350 usuarios activos │      │  - usuarios (350 registros)   │
│ ~700 registros/2 días │      │  - asistencia_diaria (~700)   │
└───────────────────────┘      │  - resumen_diario (por día)   │
                               └───────────────────────────────┘
```

---

## 3. Tecnologías

| Capa          | Tecnología                       | Justificación                                       |
|---------------|----------------------------------|-----------------------------------------------------|
| Backend       | Google Apps Script (JavaScript)  | Requerido por la prueba técnica                     |
| Frontend      | HTML5 + Tailwind CSS + Chart.js  | Diseño moderno, responsive, gráficos interactivos   |
| Base de datos | Azure Database for MySQL         | BD relacional SQL, conexión JDBC nativa desde Apps Script |
| Auth APIs     | OAuth 1.0 (HMAC-SHA1) + JWT     | Requerido por GeoVictoria                           |
| Deploy        | Apps Script Web App              | Deploy de prueba + producción según documento        |
| Control       | Git + GitHub                     | Versionamiento y entrega del código                 |

---

## 4. Estructura de Archivos

```
SAASA/
├── README.md                    ← Este archivo
├── .gitignore                   ← Excluye credenciales
├── .clasp.json.example          ← Template de configuración CLASP
│
├── apps-script/                 ← Código fuente (se sube a Apps Script via CLASP)
│   ├── appsscript.json          ← Manifiesto (permisos: JDBC, External Requests)
│   ├── app.gs                   ← Controller: CONFIG + doGet() + orquestador
│   ├── oauth.gs                 ← Servicio: OAuth 1.0 HMAC-SHA1 (API Usuarios)
│   ├── auth.gs                  ← Servicio: JWT Login (obtiene token Bearer)
│   ├── api.gs                   ← Servicio: AttendanceBook (lotes de 50 usuarios)
│   ├── data.gs                  ← Modelo: procesamiento y clasificación de estados
│   ├── database.gs              ← Repositorio: Azure MySQL via JDBC
│   └── index.html               ← Vista: Dashboard SPA (Tailwind + Chart.js)
│
├── database/                    ← Scripts SQL para Azure MySQL
│   ├── schema.sql               ← CREATE TABLE (ejecutar 1 sola vez)
│   └── queries.sql              ← Consultas útiles para verificación
│
└── docs/                        ← Documentación de referencia
    ├── ANEXOS PARA PRUEBA.pdf
    ├── Documento Técnico Desarrollo Web - SAASA.pdf
    └── API GEOVICTORIA.pdf
```

---

## 5. Base de Datos — Azure MySQL

### 5.1 Conexión desde Apps Script

```javascript
// database.gs — Conexión JDBC nativa (no requiere librerías externas)
var url = "jdbc:mysql://saasa-mysql.mysql.database.azure.com:3306/saasa_asistencia";
var conn = Jdbc.getConnection(url, CONFIG.mysql.user, CONFIG.mysql.password);
```

### 5.2 Esquema de Tablas

```sql
-- ═══ Tabla: usuarios ═══
-- Almacena los ~350 usuarios activos del grupo "PROYECTO SILLAS_LIMA"
-- Integridad: PRIMARY KEY (identifier), NOT NULL en campos obligatorios

CREATE TABLE usuarios (
    identifier      VARCHAR(50)  PRIMARY KEY,         -- ID único de GeoVictoria
    nombre          VARCHAR(100) NOT NULL,             -- Nombre del empleado
    apellido        VARCHAR(100) NOT NULL DEFAULT '',  -- Apellido del empleado
    grupo           VARCHAR(100) NOT NULL,             -- Grupo asignado
    email           VARCHAR(150) DEFAULT '',           -- Email del empleado
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,-- Estado activo/inactivo
    fecha_sync      DATETIME     NOT NULL DEFAULT NOW(),
    INDEX ix_grupo (grupo)                             -- Índice para búsquedas por grupo
);


-- ═══ Tabla: asistencia_diaria ═══
-- Detalle de asistencia por empleado por día (~350 registros/día)
-- Integridad: FOREIGN KEY → usuarios, UNIQUE (identifier+fecha) evita duplicados

CREATE TABLE asistencia_diaria (
    id               INT          AUTO_INCREMENT PRIMARY KEY,
    identifier       VARCHAR(50)  NOT NULL,
    fecha            DATE         NOT NULL,
    turno_nombre     VARCHAR(100) DEFAULT '',
    turno_inicio     VARCHAR(10)  DEFAULT '',
    turno_fin        VARCHAR(10)  DEFAULT '',
    hora_entrada     VARCHAR(20)  DEFAULT '-',
    hora_salida      VARCHAR(20)  DEFAULT '-',
    estado           VARCHAR(20)  NOT NULL,            -- Asistió|Faltó|Pendiente|Día Libre|Sin salida
    horas_trabajadas VARCHAR(10)  DEFAULT '0',
    fecha_sync       DATETIME     NOT NULL DEFAULT NOW(),

    UNIQUE KEY  uq_asistencia (identifier, fecha),     -- Evita duplicados
    FOREIGN KEY (identifier) REFERENCES usuarios(identifier),  -- Integridad referencial
    INDEX ix_fecha (fecha),
    INDEX ix_fecha_estado (fecha, estado)
);


-- ═══ Tabla: resumen_diario ═══
-- Métricas agregadas por día para carga rápida del dashboard
-- Fórmula: porcentaje = (asistieron / programados) × 100

CREATE TABLE resumen_diario (
    fecha           DATE          PRIMARY KEY,
    programados     INT           NOT NULL DEFAULT 0,
    asistieron      INT           NOT NULL DEFAULT 0,
    faltaron        INT           NOT NULL DEFAULT 0,
    pendientes      INT           NOT NULL DEFAULT 0,
    porcentaje      DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
    total           INT           NOT NULL DEFAULT 0,
    fecha_sync      DATETIME      NOT NULL DEFAULT NOW()
);
```

### 5.3 Principios de Calidad e Integridad de Datos

| Principio                | Implementación                                                   |
|--------------------------|------------------------------------------------------------------|
| **Unicidad**             | PRIMARY KEY en cada tabla, UNIQUE KEY (identifier + fecha)       |
| **Integridad referencial** | FOREIGN KEY asistencia_diaria → usuarios                       |
| **No duplicados**        | ON DUPLICATE KEY UPDATE (upsert: actualiza si existe, inserta si no) |
| **Campos obligatorios**  | NOT NULL en nombre, estado, fecha, grupo                         |
| **Tipos correctos**      | DATE, DECIMAL(5,2), INT, BOOLEAN, DATETIME                      |
| **Rendimiento**          | Índices en fecha, estado, grupo para consultas frecuentes        |
| **Optimización INSERT**  | Multi-row INSERT (50 filas por query) reduce latencia de red     |

### 5.4 Verificar datos desde Apps Script

```javascript
// Ejecutar verificarDatosSQL() desde el editor de Apps Script
// Muestra en los Logs:
//   Usuarios en BD: 350
//   Registros de asistencia: 700
//   Días con resumen: 2
//   Últimos 7 días de resumen con porcentajes
```

### 5.5 Verificar datos desde Azure Cloud Shell

```bash
# Portal Azure → icono >_ (Cloud Shell) → Bash
mysql -h saasa-mysql.mysql.database.azure.com -u saasa_admin -p saasa_asistencia

# Ya dentro de MySQL:
SELECT COUNT(*) AS total_usuarios FROM usuarios;
SELECT * FROM resumen_diario ORDER BY fecha DESC;
SELECT COUNT(*) AS registros FROM asistencia_diaria;
```

---

## 6. Conexiones API (GeoVictoria)

### 6.1 OAuth 1.0 — Lista de Usuarios (`oauth.gs`)

```javascript
// Firma HMAC-SHA1 generada manualmente (sin librerías externas)
// 1. Genera nonce aleatorio + timestamp
// 2. Construye Base String = POST&URL&params (RFC 5849)
// 3. Firma con HMAC-SHA1(consumerSecret + "&", baseString)
// 4. Envía en header Authorization: OAuth oauth_consumer_key=...,oauth_signature=...
```

| Campo            | Valor                                           |
|------------------|-------------------------------------------------|
| URL              | `https://apiv3.geovictoria.com/api/User/List`   |
| Método           | POST                                            |
| Autenticación    | OAuth 1.0 con firma HMAC-SHA1                   |
| Filtros          | Grupo: `PROYECTO SILLAS_LIMA`, Activo: `1`      |
| Resultado        | ~350 usuarios filtrados de ~5,567 totales        |

### 6.2 JWT — Asistencia (`auth.gs` + `api.gs`)

```javascript
// 1. auth.gs → POST Login con apiKey + apiSecret → recibe token JWT
// 2. api.gs  → POST AttendanceBook con Bearer token + UserIds (máx 50)
// 3. Se dividen 350 usuarios en 7 lotes de 50 para no exceder el límite
```

| Campo            | Valor                                                        |
|------------------|--------------------------------------------------------------|
| Login URL        | `https://customerapi.geovictoria.com/api/v1/Login`           |
| Asistencia URL   | `https://customerapi.geovictoria.com/api/v1/AttendanceBook`  |
| Formato fechas   | `yyyyMMddHHmmss` (14 dígitos, sin separadores)               |
| Límite           | Máximo 50 UserIds por petición                               |

---

## 7. Lógica de Clasificación de Estados (`data.gs`)

```
¿Turno = "Break"?
    │
    SÍ ──→ "Día Libre" (no cuenta en métricas)
    │
    NO ──→ ¿Tiene marca de entrada O salida?
              │
              SÍ ──→ ¿Tiene ambas marcas?
              │         │
              │         SÍ ──→ "Asistió"
              │         NO ──→ "Sin salida"
              │
              NO ──→ ¿El turno ya pasó?
                        │
                        SÍ ──→ "Faltó"
                        NO ──→ "Pendiente"

Fórmula:  % Asistencia = (Asistieron / Programados) × 100
          Programados = Total - Día Libre
```

---

## 8. Principios de Código Limpio

### 8.1 SOLID

| Principio                     | Aplicación                                                              |
|-------------------------------|-------------------------------------------------------------------------|
| **S — Single Responsibility** | Cada .gs tiene UNA responsabilidad: oauth.gs solo OAuth, auth.gs solo JWT, api.gs solo consulta, data.gs solo procesa, database.gs solo persiste |
| **O — Open/Closed**          | CONFIG centralizado: cambias credenciales sin tocar módulos internos    |
| **D — Dependency Inversion** | Módulos dependen de CONFIG (abstracción), no de valores hardcodeados    |

### 8.2 Clean Code

| Práctica                       | Implementación                                                         |
|--------------------------------|------------------------------------------------------------------------|
| **Nombres descriptivos**       | `obtenerUsuarios()`, `clasificarEstado()`, `guardarAsistencia()`       |
| **Funciones pequeñas**         | Cada función hace UNA cosa: `generarNonce()`, `generarFirma()`         |
| **DRY**                        | CONFIG centralizado, funciones reutilizables (`dividirEnLotes`)        |
| **Sin magic numbers**          | Constantes con nombre: `maxUsuariosPorPeticion = 50`                   |
| **Manejo de errores**          | try/catch en HTTP, validaciones, logging descriptivo                   |

### 8.3 Patrones de Diseño

| Patrón       | Dónde                                                                     |
|--------------|---------------------------------------------------------------------------|
| **MVC**      | Model (data.gs + database.gs) / View (index.html) / Controller (app.gs)  |
| **Facade**   | `obtenerDatosDashboard()` orquesta todo el flujo en una sola función      |
| **Repository** | `database.gs` encapsula todo el acceso a BD                             |
| **Strategy** | `clasificarEstado()` encapsula la lógica de decisión                      |

---

## 9. Funcionalidades del Dashboard

### Requeridas (según Anexos)
- [x] Indicadores: Programados, Asistieron, Faltas, Pendientes, % Asistencia
- [x] Tabs por día con porcentaje
- [x] Tabla detallada: Nombre, Turno, Entrada, Salida, Horas, Estado
- [x] Filtro por rango de fechas (desde/hasta)
- [x] Buscador por nombre de empleado
- [x] Gráfico de torta (Chart.js doughnut)
- [x] Barra de progreso con semáforo (verde >= 80%, amarillo >= 60%, rojo < 60%)

### Extras (valor agregado)
- [x] Dos modos: Sincronizar API (actualiza BD) y Cargar desde BD (instantáneo)
- [x] Exportar CSV
- [x] Ordenamiento por prioridad (Faltó primero = más urgente)
- [x] Diseño responsive (Tailwind CSS)
- [x] Animaciones en contadores
- [x] Fuente de datos visible (API → MySQL o MySQL directo)

---

## 10. Configuración para Replicar

### 10.1 Variables de configuración (`app.gs`)

```javascript
var CONFIG = {
  geovictoria: {
    apiKey:    "tu_api_key",
    apiSecret: "tu_api_secret"
  },
  mysql: {
    server:   "tu-servidor.mysql.database.azure.com",
    database: "saasa_asistencia",
    user:     "tu_usuario",
    password: "tu_contraseña",
    port:     "3306"
  }
};
```

### 10.2 Pasos para replicar

1. Crear proyecto en script.google.com
2. Copiar todos los .gs + index.html
3. Configurar credenciales en CONFIG
4. Crear Azure Database for MySQL y ejecutar `database/schema.sql`
5. Permitir acceso público en redes del servidor MySQL (Azure Portal)
6. Ejecutar `inicializarTablas()` desde Apps Script para verificar conexión
7. Deploy → Nueva implementación → Aplicación Web

### 10.3 Desarrollo local con CLASP

```bash
npm install -g @google/clasp
clasp login
clasp clone <scriptId>
clasp push --force     # sube cambios al proyecto Apps Script
clasp open             # abre el editor web
```

---

## 11. Azure Database for MySQL — Paso a Paso

### 11.1 Crear el servidor (5 min)

1. Portal Azure → Crear recurso → "Azure Database for MySQL" → Servidor flexible
2. Configurar:
   - Nombre: `saasa-mysql`
   - Región: East US
   - Tipo de carga: **Para proyectos de desarrollo o hobby** (~$17/mes)
   - Admin: `saasa_admin`
   - Contraseña: (tu contraseña)
3. Revisar + Crear

### 11.2 Configurar redes (para que Apps Script se conecte)

1. Servidor MySQL → **Redes** (Networking)
2. Método de conectividad: **Acceso público**
3. Marcar: **"Permitir el acceso público desde cualquier servicio de Azure"**
4. Agregar regla: `0.0.0.0` a `255.255.255.255` (Google Apps Script usa IPs dinámicas)
5. Guardar

### 11.3 Desactivar SSL obligatorio

1. Servidor MySQL → **Parámetros del servidor**
2. Buscar: `require_secure_transport`
3. Cambiar a **OFF** → Guardar

### 11.4 Crear la base de datos

1. Servidor MySQL → **Bases de datos** → + Agregar
2. Nombre: `saasa_asistencia` → Guardar

### 11.5 Crear tablas

Desde Apps Script, ejecutar `inicializarTablas()` (crea las 3 tablas automáticamente).

O copiar y ejecutar `database/schema.sql` desde Azure Cloud Shell o MySQL Workbench.

### 11.6 Verificar datos

**Desde Apps Script:**
- Ejecutar `verificarDatosSQL()` → ver Registro de ejecución (logs)

**Desde Azure Cloud Shell:**
```bash
mysql -h saasa-mysql.mysql.database.azure.com -u saasa_admin -p saasa_asistencia
SELECT * FROM resumen_diario;
```

---

## 12. Checklist de Evaluación

| Criterio                                    | Estado |
|---------------------------------------------|--------|
| Integración con APIs externas (GeoVictoria) | OK     |
| OAuth 1.0 con firma HMAC-SHA1              | OK     |
| JWT Bearer Token para asistencia            | OK     |
| Persistencia en BD SQL (Azure MySQL)        | OK     |
| Dashboard siempre lee desde BD              | OK     |
| Código desacoplado (SOLID, MVC)             | OK     |
| Variables de configuración centralizadas    | OK     |
| Comentarios descriptivos en español         | OK     |
| Integridad de datos (PK, FK, UNIQUE, NOT NULL) | OK  |
| Multi-row INSERT optimizado (50 filas/query)| OK     |
| Interfaz moderna y responsive               | OK     |
| Gráficos y semáforos visuales               | OK     |
| Filtro por fechas + buscador                | OK     |
| Exportar CSV                                | OK     |
| Replicable en otros entornos                | OK     |

---

## 13. Autor

Desarrollado como prueba técnica para SAASA — Servicios Aeroportuarios Andinos S.A.
