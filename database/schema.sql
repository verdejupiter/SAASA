-- ══════════════════════════════════════════════════════════════════════════════
-- SAASA - Control de Asistencia
-- Esquema de Base de Datos para Azure Database for MySQL
--
-- Ejecutar este script UNA sola vez al crear la base de datos.
-- Se puede ejecutar desde:
--   - Azure Portal → Editor de consultas (Cloud Shell)
--   - MySQL Workbench
--   - Apps Script → función inicializarTablas() en database.gs
-- ══════════════════════════════════════════════════════════════════════════════


-- ── Crear base de datos ──────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS saasa_asistencia;
USE saasa_asistencia;


-- ── Tabla: usuarios ──────────────────────────────────────────────────────────
-- Almacena los usuarios activos obtenidos de la API GeoVictoria (OAuth 1.0).

CREATE TABLE IF NOT EXISTS usuarios (
    identifier      VARCHAR(50)  PRIMARY KEY,        -- ID único de GeoVictoria
    nombre          VARCHAR(100) NOT NULL,            -- Nombre del empleado
    apellido        VARCHAR(100),                     -- Apellido del empleado
    grupo           VARCHAR(100),                     -- Grupo: "PROYECTO SILLAS_LIMA"
    email           VARCHAR(150),                     -- Email del empleado
    activo          BOOLEAN      DEFAULT TRUE,        -- true = activo
    fecha_sync      DATETIME     DEFAULT NOW()        -- Última sincronización
);


-- ── Tabla: asistencia_diaria ─────────────────────────────────────────────────
-- Detalle de asistencia por empleado por día.
-- Estados posibles: Asistió | Faltó | Pendiente | Día Libre | Sin salida

CREATE TABLE IF NOT EXISTS asistencia_diaria (
    id               INT          AUTO_INCREMENT PRIMARY KEY,
    identifier       VARCHAR(50)  NOT NULL,           -- FK → usuarios.identifier
    fecha            DATE         NOT NULL,            -- Fecha del registro
    turno_nombre     VARCHAR(100),                     -- Nombre del turno asignado
    turno_inicio     VARCHAR(10),                      -- Hora programada de entrada
    turno_fin        VARCHAR(10),                      -- Hora programada de salida
    hora_entrada     VARCHAR(20),                      -- Hora real de entrada (marca)
    hora_salida      VARCHAR(20),                      -- Hora real de salida (marca)
    estado           VARCHAR(20)  NOT NULL,            -- Estado clasificado
    horas_trabajadas VARCHAR(10),                      -- Horas trabajadas del día
    fecha_sync       DATETIME     DEFAULT NOW(),       -- Última sincronización

    UNIQUE KEY uq_asistencia (identifier, fecha),
    FOREIGN KEY (identifier) REFERENCES usuarios(identifier)
);


-- ── Tabla: resumen_diario ────────────────────────────────────────────────────
-- Métricas agregadas por día para carga rápida del dashboard.
-- Fórmula: porcentaje = (asistieron / programados) × 100

CREATE TABLE IF NOT EXISTS resumen_diario (
    fecha           DATE          PRIMARY KEY,         -- Fecha del resumen
    programados     INT           DEFAULT 0,           -- Empleados con turno (no Break)
    asistieron      INT           DEFAULT 0,           -- Empleados que marcaron
    faltaron        INT           DEFAULT 0,           -- Sin marcas y turno pasado
    pendientes      INT           DEFAULT 0,           -- Turno aún no inicia
    porcentaje      DECIMAL(5,2)  DEFAULT 0,           -- % de asistencia del día
    total           INT           DEFAULT 0,           -- Total empleados (inc. libres)
    fecha_sync      DATETIME      DEFAULT NOW()        -- Última sincronización
);


-- ── Índices para consultas frecuentes ────────────────────────────────────────

CREATE INDEX ix_asistencia_fecha    ON asistencia_diaria (fecha);
CREATE INDEX ix_asistencia_estado   ON asistencia_diaria (fecha, estado);
CREATE INDEX ix_usuarios_grupo      ON usuarios (grupo);
