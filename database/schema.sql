-- ══════════════════════════════════════════════════════════════════════════════
-- SAASA - Control de Asistencia
-- Esquema de Base de Datos para Azure SQL Database
--
-- Ejecutar este script UNA sola vez al crear la base de datos.
-- Se puede ejecutar desde:
--   - Azure Portal → Editor de consultas
--   - SQL Server Management Studio (SSMS)
--   - Apps Script → función inicializarTablas() en database.gs
-- ══════════════════════════════════════════════════════════════════════════════


-- ── Tabla: usuarios ──────────────────────────────────────────────────────────
-- Almacena los usuarios activos obtenidos de la API GeoVictoria (OAuth 1.0).
-- Se sincronizan cada vez que se consulta el dashboard.

CREATE TABLE usuarios (
    identifier      VARCHAR(50)  PRIMARY KEY,       -- ID único de GeoVictoria
    nombre          VARCHAR(100) NOT NULL,           -- Nombre del empleado
    apellido        VARCHAR(100),                    -- Apellido del empleado
    grupo           VARCHAR(100),                    -- Grupo: "PROYECTO SILLAS_LIMA"
    email           VARCHAR(150),                    -- Email del empleado
    activo          BIT          DEFAULT 1,          -- 1 = activo, 0 = inactivo
    fecha_sync      DATETIME     DEFAULT GETDATE()   -- Última sincronización
);


-- ── Tabla: asistencia_diaria ─────────────────────────────────────────────────
-- Detalle de asistencia por empleado por día.
-- Fuente: API AttendanceBook de GeoVictoria (JWT).
-- Estados posibles: Asistió | Faltó | Pendiente | Día Libre | Sin salida

CREATE TABLE asistencia_diaria (
    id               INT          IDENTITY(1,1) PRIMARY KEY,
    identifier       VARCHAR(50)  NOT NULL,          -- FK → usuarios.identifier
    fecha            DATE         NOT NULL,           -- Fecha del registro
    turno_nombre     VARCHAR(100),                    -- Nombre del turno asignado
    turno_inicio     VARCHAR(10),                     -- Hora programada de entrada
    turno_fin        VARCHAR(10),                     -- Hora programada de salida
    hora_entrada     VARCHAR(20),                     -- Hora real de entrada (marca)
    hora_salida      VARCHAR(20),                     -- Hora real de salida (marca)
    estado           VARCHAR(20)  NOT NULL,           -- Estado clasificado
    horas_trabajadas VARCHAR(10),                     -- Horas trabajadas del día
    fecha_sync       DATETIME     DEFAULT GETDATE(),  -- Última sincronización

    CONSTRAINT UQ_asistencia UNIQUE (identifier, fecha),
    FOREIGN KEY (identifier) REFERENCES usuarios(identifier)
);


-- ── Tabla: resumen_diario ────────────────────────────────────────────────────
-- Métricas agregadas por día para carga rápida del dashboard.
-- Fórmula: porcentaje = (asistieron / programados) × 100

CREATE TABLE resumen_diario (
    fecha           DATE          PRIMARY KEY,        -- Fecha del resumen
    programados     INT           DEFAULT 0,          -- Empleados con turno (no Break)
    asistieron      INT           DEFAULT 0,          -- Empleados que marcaron
    faltaron        INT           DEFAULT 0,          -- Sin marcas y turno pasado
    pendientes      INT           DEFAULT 0,          -- Turno aún no inicia
    porcentaje      DECIMAL(5,2)  DEFAULT 0,          -- % de asistencia del día
    total           INT           DEFAULT 0,          -- Total empleados (inc. libres)
    fecha_sync      DATETIME      DEFAULT GETDATE()   -- Última sincronización
);


-- ── Índices para consultas frecuentes ────────────────────────────────────────

CREATE INDEX IX_asistencia_fecha    ON asistencia_diaria (fecha);
CREATE INDEX IX_asistencia_estado   ON asistencia_diaria (fecha, estado);
CREATE INDEX IX_usuarios_grupo      ON usuarios (grupo);
