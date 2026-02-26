# SAASA - Control de Asistencia

**Servicios Aeroportuarios Andinos S.A.**
Aplicación web de control de asistencia integrada con GeoVictoria, desplegada en Google Apps Script con persistencia en Azure SQL Database.

---

## 1. Objetivo

Desarrollar una app web que permita:
- Obtener usuarios desde la API GeoVictoria (OAuth 1.0)
- Extraer registros de asistencia por rango de fechas (JWT)
- Almacenar la información en Azure SQL Database
- Mostrar un dashboard visual con métricas diarias de asistencia
- Código replicable en otros entornos Apps Script

---

## 2. Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    GOOGLE APPS SCRIPT                    │
│                                                         │
│  ┌─────────────┐   ┌─────────────┐   ┌──────────────┐  │
│  │   app.gs     │   │  oauth.gs   │   │   auth.gs    │  │
│  │  (Entry      │   │  (OAuth 1.0 │   │  (JWT Login) │  │
│  │   Point +    │   │   HMAC-SHA1)│   │              │  │
│  │   Config)    │   └──────┬──────┘   └──────┬───────┘  │
│  └──────┬───────┘          │                 │          │
│         │           ┌──────▼─────────────────▼───────┐  │
│         │           │          api.gs                 │  │
│         │           │  (Consulta AttendanceBook API)  │  │
│         │           │  - Lotes de 50 usuarios max     │  │
│         │           └──────────────┬──────────────────┘  │
│         │                          │                     │
│         │           ┌──────────────▼──────────────────┐  │
│         │           │         data.gs                  │  │
│         │           │  (Procesamiento + Clasificación) │  │
│         │           │  - Asistió/Faltó/Pendiente/Libre│  │
│         │           └──────────────┬──────────────────┘  │
│         │                          │                     │
│         │           ┌──────────────▼──────────────────┐  │
│         │           │       database.gs                │  │
│         │           │  (Persistencia Azure SQL)        │  │
│         │           │  - JDBC nativo Apps Script       │  │
│         │           └─────────────────────────────────┘  │
│         │                                                │
│  ┌──────▼────────────────────────────────────────────┐   │
│  │              index.html (Frontend SPA)             │   │
│  │  - Tailwind CSS (CDN) + Chart.js                  │   │
│  │  - google.script.run ↔ Backend                    │   │
│  └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
            │                              │
            ▼                              ▼
┌───────────────────────┐    ┌──────────────────────────┐
│   API GeoVictoria     │    │   Azure SQL Database     │
│                       │    │                          │
│ OAuth 1.0 → Usuarios  │    │ - usuarios               │
│ JWT → Asistencia      │    │ - asistencia_diaria      │
│                       │    │ - resumen_diario         │
└───────────────────────┘    └──────────────────────────┘
```

---

## 3. Tecnologías

| Capa       | Tecnología                          | Justificación                                    |
|------------|-------------------------------------|--------------------------------------------------|
| Backend    | Google Apps Script (JavaScript)     | Requerido por la prueba técnica                  |
| Frontend   | HTML5 + Tailwind CSS + Chart.js     | Diseño moderno, responsive, gráficos interactivos|
| Base datos | Azure SQL Database (SQL Server)     | BD relacional, JDBC nativo desde Apps Script     |
| Auth APIs  | OAuth 1.0 (HMAC-SHA1) + JWT        | Requerido por GeoVictoria                        |
| Deploy     | Apps Script Web App                 | Deploy de prueba + producción según documento    |
| Control    | Git + GitHub                        | Versionamiento y entrega del código              |

---

## 4. Estructura de Archivos

```
SAASA/
├── README.md                  ← Este archivo
├── .gitignore                 ← Excluye credenciales y PDFs
├── .clasp.json.example        ← Template de configuración CLASP
│
├── apps-script/               ← Código fuente del proyecto
│   ├── appsscript.json        ← Manifiesto (permisos, timezone)
│   ├── app.gs                 ← Entry point: CONFIG + doGet() + orquestador
│   ├── oauth.gs               ← Módulo OAuth 1.0 (API Usuarios)
│   ├── auth.gs                ← Módulo JWT (Login → Token)
│   ├── api.gs                 ← Módulo Asistencia (AttendanceBook)
│   ├── data.gs                ← Procesamiento y clasificación de datos
│   ├── database.gs            ← Persistencia Azure SQL via JDBC
│   └── index.html             ← Frontend SPA (dashboard completo)
│
└── docs/                      ← Referencia (no se sube a GitHub)
    ├── ANEXOS PARA PRUEBA.pdf
    ├── Documento Técnico.pdf
    └── API GEOVICTORIA.pdf
```

---

## 5. Principios de Código Limpio Aplicados

### 5.1 SOLID

| Principio                  | Aplicación en el proyecto                                        |
|----------------------------|------------------------------------------------------------------|
| **S - Single Responsibility** | Cada archivo .gs tiene UNA sola responsabilidad: oauth.gs solo autentica OAuth, auth.gs solo maneja JWT, api.gs solo consulta asistencia, data.gs solo procesa datos, database.gs solo persiste |
| **O - Open/Closed**          | CONFIG centralizado permite cambiar credenciales/URLs sin modificar módulos internos |
| **D - Dependency Inversion** | Los módulos dependen de CONFIG (abstracción), no de valores hardcodeados |

### 5.2 Clean Code (Robert C. Martin)

| Práctica                     | Implementación                                                  |
|------------------------------|------------------------------------------------------------------|
| **Nombres descriptivos**     | `obtenerUsuarios()`, `generarFirma()`, `clasificarEstado()` — nombres en español que revelan intención |
| **Funciones pequeñas**       | Cada función hace UNA cosa: `generarNonce()`, `obtenerTimestamp()`, `extraerToken()` |
| **DRY (Don't Repeat Yourself)** | CONFIG centralizado, funciones reutilizables (`dividirEnLotes`, `formatearFechaAPI`) |
| **Separación de concerns**   | Backend (lógica) separado del Frontend (presentación) via `google.script.run` |
| **Manejo de errores**        | Try/catch en peticiones HTTP, validaciones de respuesta, logging descriptivo |
| **Sin magic numbers**        | Constantes con nombre: `ASISTENCIA_CONFIG.maxUsuariosPorPeticion = 50`, `HTTP_STATUS.OK = 200` |

### 5.3 Patrones de Diseño

| Patrón           | Dónde se aplica                                                    |
|------------------|--------------------------------------------------------------------|
| **MVC**          | Model (data.gs + database.gs) / View (index.html) / Controller (Codigo.gs) |
| **Module**       | Cada .gs es un módulo independiente con responsabilidad clara      |
| **Facade**       | `obtenerDatosDashboard()` es la fachada que orquesta todo el flujo |
| **Strategy**     | Clasificación de estados (`clasificarEstado`) encapsula la lógica de decisión |

---

## 6. Conexiones API (GeoVictoria)

### 6.1 API OAuth 1.0 — Lista de Usuarios

| Campo            | Valor                                           |
|------------------|-------------------------------------------------|
| URL              | `https://apiv3.geovictoria.com/api/User/List`   |
| Método           | POST                                            |
| Autenticación    | OAuth 1.0 con firma HMAC-SHA1                   |
| Consumer Key     | `abd882`                                        |
| Consumer Secret  | `84891b1b`                                      |
| Filtros          | Grupo: `PROYECTO SILLAS_LIMA`, Activo: `1`      |

### 6.2 API JWT — Asistencia (AttendanceBook)

| Campo            | Valor                                                        |
|------------------|--------------------------------------------------------------|
| Login URL        | `https://customerapi.geovictoria.com/api/v1/Login`           |
| Asistencia URL   | `https://customerapi.geovictoria.com/api/v1/AttendanceBook`  |
| Método           | POST                                                         |
| Autenticación    | Bearer Token JWT (obtenido del Login)                        |
| Formato fechas   | `yyyyMMddHHmmss` (14 dígitos, sin guiones)                   |
| Límite           | Máximo 50 UserIds por petición (se hacen lotes)              |
| Body             | `{ StartDate, EndDate, UserIds: "id1,id2,..." }`            |

---

## 7. Base de Datos — Azure SQL

### 7.1 Conexión desde Apps Script

```javascript
// database.gs usa JDBC nativo de Apps Script
var conn = Jdbc.getConnection(
  "jdbc:sqlserver://SERVIDOR.database.windows.net:1433;database=saasa_asistencia;encrypt=true;trustServerCertificate=false;",
  "usuario",
  "contraseña"
);
```

### 7.2 Esquema de Tablas

```sql
-- Usuarios activos del grupo
CREATE TABLE usuarios (
    identifier      VARCHAR(50) PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    apellido        VARCHAR(100),
    grupo           VARCHAR(100),
    email           VARCHAR(150),
    activo          BIT DEFAULT 1,
    fecha_sync      DATETIME DEFAULT GETDATE()
);

-- Detalle de asistencia por persona por día
CREATE TABLE asistencia_diaria (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    identifier      VARCHAR(50) NOT NULL,
    fecha           DATE NOT NULL,
    turno_nombre    VARCHAR(100),
    turno_inicio    VARCHAR(10),
    turno_fin       VARCHAR(10),
    hora_entrada    VARCHAR(20),
    hora_salida     VARCHAR(20),
    estado          VARCHAR(20) NOT NULL,  -- Asistió|Faltó|Pendiente|Día Libre|Sin salida
    horas_trabajadas VARCHAR(10),
    fecha_sync      DATETIME DEFAULT GETDATE(),
    CONSTRAINT UQ_asistencia UNIQUE (identifier, fecha),
    FOREIGN KEY (identifier) REFERENCES usuarios(identifier)
);

-- Resumen agregado por día (para carga rápida del dashboard)
CREATE TABLE resumen_diario (
    fecha           DATE PRIMARY KEY,
    programados     INT DEFAULT 0,
    asistieron      INT DEFAULT 0,
    faltaron        INT DEFAULT 0,
    pendientes      INT DEFAULT 0,
    porcentaje      DECIMAL(5,2) DEFAULT 0,
    total           INT DEFAULT 0,
    fecha_sync      DATETIME DEFAULT GETDATE()
);
```

---

## 8. Lógica de Clasificación (Anexo 2)

```
┌─────────────────────────────────────────────────┐
│            ¿Turno = "Break"?                     │
│                  │                               │
│          SÍ ─────┴───── NO                       │
│          │               │                       │
│     "Día Libre"    ¿Tiene marca                  │
│     (no contar     entrada O salida?             │
│      en métricas)        │                       │
│                   SÍ ────┴──── NO                │
│                   │             │                 │
│              ¿Tiene ambas?   ¿Turno ya pasó?     │
│               │      │        │        │         │
│             SÍ      NO      SÍ       NO         │
│              │       │       │        │          │
│         "Asistió" "Sin    "Faltó" "Pendiente"    │
│                   salida"                        │
└─────────────────────────────────────────────────┘

Fórmula: %Asistencia = (Asistieron / Programados) × 100
```

---

## 9. Funcionalidades del Dashboard (Frontend)

### Requeridas (Anexos)
- [x] Indicadores numéricos: Programados, Asistieron, Faltas, Pendientes, %Asistencia
- [x] Tabs por día con porcentaje
- [x] Tabla detallada: Nombre, Turno, Entrada, Salida, Horas, Estado
- [x] Filtro por rango de fechas (desde/hasta)
- [x] Buscador por nombre de empleado
- [x] Gráfico de torta (Chart.js)
- [x] Barra de progreso con semáforo (verde ≥80%, amarillo ≥60%, rojo <60%)

### Extras (valor agregado)
- [x] Exportar CSV
- [x] Ordenamiento por prioridad de estado (Faltó primero)
- [x] Diseño responsive (Tailwind CSS)
- [x] Animaciones en contadores
- [x] Fecha de última actualización visible

---

## 10. Flujo de Datos Completo

```
1. Usuario abre el dashboard (index.html)
2. Frontend llama: google.script.run.obtenerDatosDashboard(desde, hasta)
3. app.gs orquesta:
   a. oauth.gs   → obtenerUsuarios()       → API OAuth 1.0 → usuarios filtrados
   b. auth.gs    → obtenerTokenJWT()        → API Login     → token Bearer
   c. api.gs     → obtenerAsistencia()      → API Attendance → datos crudos (lotes de 50)
   d. data.gs    → procesarDatos()          → clasificación  → datos limpios
   e. database.gs → guardarEnSQL()           → Azure SQL      → persistencia
4. Retorna JSON al frontend
5. Frontend renderiza: cards, gráficos, tabla
```

---

## 11. Configuración para Replicar

### 11.1 Variables de configuración (app.gs)

```javascript
var CONFIG = {
  geovictoria: {
    apiKey: "abd882",
    apiSecret: "84891b1b"
  },
  azure: {
    server: "tu-servidor.database.windows.net",
    database: "saasa_asistencia",
    user: "tu-usuario",
    password: "tu-contraseña",
    port: "1433"
  }
};
```

### 11.2 Pasos para replicar

1. Crear proyecto en Google Apps Script (script.google.com)
2. Copiar todos los archivos .gs y el index.html
3. Configurar credenciales en `CONFIG` (app.gs)
4. Crear Azure SQL Database y ejecutar el script de tablas
5. Permitir IP de Google en el firewall de Azure SQL
6. Deploy → "Nueva implementación" → "Aplicación Web"

### 11.3 Desarrollo local con CLASP (opcional)

```bash
npm install -g @google/clasp
clasp login
clasp clone <scriptId>    # o clasp create
clasp push                # sube cambios al proyecto
clasp open                # abre en el editor web
```

---

## 12. Checklist de Evaluación (del Documento Técnico)

| Criterio                                    | Estado |
|---------------------------------------------|--------|
| Correcta integración con APIs externas      | ✅      |
| Manejo de OAuth 1.0 (HMAC-SHA1)            | ✅      |
| Manejo de JWT (Bearer Token)               | ✅      |
| Persistencia en BD SQL (Azure)             | ✅      |
| Código desacoplado y reutilizable          | ✅      |
| Variables de configuración centralizadas   | ✅      |
| Estructura clara con comentarios           | ✅      |
| Manejo de errores                          | ✅      |
| Interfaz moderna y usable                  | ✅      |
| Métricas: programados/asistentes/faltas    | ✅      |
| Filtro por rango de fechas                 | ✅      |
| Elementos visuales (gráficos, semáforos)   | ✅      |
| Replicable en otros entornos               | ✅      |

---

## 13. Guía Paso a Paso: Azure SQL Database

### 13.1 Crear la Base de Datos (5-10 min)

1. Ir a [portal.azure.com](https://portal.azure.com) → Crear cuenta si no tienes (hay $200 USD gratis)
2. **Crear recurso** → Buscar "SQL Database" → **Crear**
3. Configurar:
   - **Suscripción**: Tu suscripción (Free Trial si es nueva)
   - **Grupo de recursos**: Crear nuevo → `rg-saasa`
   - **Nombre de BD**: `saasa_asistencia`
   - **Servidor**: Crear nuevo →
     - Nombre: `saasa-server` (será `saasa-server.database.windows.net`)
     - Ubicación: `East US` (o la más cercana)
     - Autenticación: **SQL Authentication**
     - Admin login: `saasa_admin`
     - Password: (elegir una segura)
   - **Plan**: Seleccionar **Basic** ($4.90/mes) o **Free** si disponible
4. **Revisar + Crear** → **Crear**

### 13.2 Configurar Firewall (para que Apps Script y SSMS se conecten)

1. Azure Portal → Tu SQL Server → **Redes** (Networking)
2. Activar: **"Permitir que los servicios y recursos de Azure accedan a este servidor"** → SÍ
3. **Agregar tu IP actual** (clic en "Agregar IP del cliente") → para poder entrar desde SSMS
4. **Guardar**

### 13.3 Crear las Tablas

Opción A — **Desde Azure Portal** (rápido):
1. Azure Portal → Tu SQL Database → **Editor de consultas** (preview)
2. Login con `saasa_admin` + tu password
3. Copiar y ejecutar el contenido de `database/schema.sql`

Opción B — **Desde SSMS** (recomendado):
1. Abrir SQL Server Management Studio
2. Conectar:
   - Servidor: `saasa-server.database.windows.net`
   - Autenticación: SQL Server Authentication
   - Login: `saasa_admin`
   - Password: tu contraseña
3. Click derecho en `saasa_asistencia` → **Nueva consulta**
4. Abrir y ejecutar `database/schema.sql`

Opción C — **Desde Apps Script** (automático):
- Ejecutar la función `inicializarTablas()` de `database.gs` una sola vez

### 13.4 Actualizar CONFIG en app.gs

```javascript
var CONFIG = {
  geovictoria: {
    apiKey:    "abd882",
    apiSecret: "84891b1b"
  },
  azure: {
    server:   "saasa-server.database.windows.net",  // ← tu servidor
    database: "saasa_asistencia",
    user:     "saasa_admin",                         // ← tu usuario
    password: "TuPasswordSegura123!",                // ← tu contraseña
    port:     "1433"
  }
};
```

### 13.5 Verificar con SSMS

Una vez que la app esté funcionando, puedes ver los datos desde SSMS:

```sql
-- Ver usuarios sincronizados
SELECT * FROM usuarios;

-- Ver asistencia de hoy
SELECT * FROM asistencia_diaria WHERE fecha = CAST(GETDATE() AS DATE);

-- Ver resumen con porcentaje
SELECT fecha, programados, asistieron, faltaron, pendientes,
       CAST(porcentaje AS VARCHAR) + '%' AS porcentaje
FROM resumen_diario ORDER BY fecha DESC;

-- Empleados que faltaron hoy
SELECT u.nombre, u.apellido, a.turno_nombre, a.estado
FROM asistencia_diaria a
JOIN usuarios u ON a.identifier = u.identifier
WHERE a.fecha = CAST(GETDATE() AS DATE) AND a.estado = 'Faltó';
```

---

## 14. Estructura Final del Repositorio

```
SAASA/
├── .gitignore                 ← Excluye credenciales y .clasp.json
├── .clasp.json.example        ← Template CLASP (para quien clone el repo)
├── README.md                  ← Este documento
│
├── apps-script/               ← Código fuente (se sube a Apps Script)
│   ├── appsscript.json        ← Manifiesto (permisos, timezone)
│   ├── app.gs                 ← Controlador: CONFIG + doGet() + orquestador
│   ├── oauth.gs               ← Servicio: OAuth 1.0 HMAC-SHA1 (usuarios)
│   ├── auth.gs                ← Servicio: JWT Login (token)
│   ├── api.gs                 ← Servicio: AttendanceBook (lotes de 50)
│   ├── data.gs                ← Modelo: procesamiento y clasificación
│   ├── database.gs            ← Repositorio: Azure SQL via JDBC
│   └── index.html             ← Vista: Dashboard SPA (Tailwind + Chart.js)
│
├── database/                  ← Scripts SQL para Azure
│   ├── schema.sql             ← Creación de tablas (ejecutar 1 sola vez)
│   └── queries.sql            ← Consultas útiles para SSMS / verificación
│
└── docs/                      ← Documentación de referencia
    ├── ANEXOS PARA PRUEBA.pdf
    ├── Documento Técnico Desarrollo Web - SAASA.pdf
    └── API GEOVICTORIA.pdf
```

---

## 15. Autor

Desarrollado como prueba técnica para SAASA - Servicios Aeroportuarios Andinos S.A.
