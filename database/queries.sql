-- ══════════════════════════════════════════════════════════════════════════════
-- SAASA - Consultas Útiles
-- Ejecutar desde SSMS o Azure Portal para verificar/analizar datos.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── Ver todos los usuarios sincronizados ─────────────────────────────────────

SELECT identifier, nombre, apellido, grupo, activo, fecha_sync
FROM usuarios
ORDER BY nombre;


-- ── Resumen de asistencia por día ────────────────────────────────────────────

SELECT
    fecha,
    programados,
    asistieron,
    faltaron,
    pendientes,
    CAST(porcentaje AS VARCHAR) + '%' AS porcentaje
FROM resumen_diario
ORDER BY fecha DESC;


-- ── Empleados que faltaron hoy ───────────────────────────────────────────────

SELECT u.nombre, u.apellido, a.turno_nombre, a.estado
FROM asistencia_diaria a
JOIN usuarios u ON a.identifier = u.identifier
WHERE a.fecha = CAST(GETDATE() AS DATE)
  AND a.estado = 'Faltó'
ORDER BY u.nombre;


-- ── Empleados con mejor asistencia (últimos 7 días) ─────────────────────────

SELECT
    u.nombre + ' ' + u.apellido AS empleado,
    COUNT(CASE WHEN a.estado = 'Asistió' THEN 1 END) AS dias_asistio,
    COUNT(CASE WHEN a.estado = 'Faltó' THEN 1 END) AS dias_falto,
    COUNT(*) AS dias_total
FROM asistencia_diaria a
JOIN usuarios u ON a.identifier = u.identifier
WHERE a.fecha >= DATEADD(DAY, -7, CAST(GETDATE() AS DATE))
  AND a.estado != 'Día Libre'
GROUP BY u.nombre, u.apellido
ORDER BY dias_asistio DESC;


-- ── Porcentaje promedio de asistencia por semana ─────────────────────────────

SELECT
    DATEPART(WEEK, fecha) AS semana,
    MIN(fecha) AS desde,
    MAX(fecha) AS hasta,
    AVG(porcentaje) AS porcentaje_promedio
FROM resumen_diario
GROUP BY DATEPART(WEEK, fecha)
ORDER BY semana DESC;
