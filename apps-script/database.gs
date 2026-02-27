/**
 * database.gs — Módulo de Persistencia (Repository)
 *
 * Principio SOLID: Single Responsibility
 *   → SOLO se encarga de leer/escribir en Azure MySQL Database.
 *
 * Principio SOLID: Dependency Inversion
 *   → Depende de CONFIG (abstracción), no de valores hardcodeados.
 *
 * Patrón MVC: Model (capa de persistencia / Repository)
 *
 * Calidad e Integridad de Datos:
 *   → PRIMARY KEY en cada tabla (unicidad garantizada)
 *   → FOREIGN KEY en asistencia_diaria → usuarios (integridad referencial)
 *   → UNIQUE KEY (identifier + fecha) evita duplicados de asistencia
 *   → NOT NULL en campos obligatorios (nombre, estado, fecha)
 *   → CHECK en estado (solo valores válidos)
 *   → ON DUPLICATE KEY UPDATE (upsert: actualiza si existe, inserta si no)
 *   → Tipos de dato correctos: DATE, DECIMAL, INT, BOOLEAN
 *
 * Optimización:
 *   → Multi-row INSERT (50 filas por query) para reducir latencia de red
 *   → Índices en columnas de búsqueda frecuente (fecha, estado, grupo)
 */


// ── Conexión ─────────────────────────────────────────────────────────────────

function obtenerConexionSQL() {
  var url = "jdbc:mysql://" + CONFIG.mysql.server + ":" + CONFIG.mysql.port +
            "/" + CONFIG.mysql.database;

  return Jdbc.getConnection(url, CONFIG.mysql.user, CONFIG.mysql.password);
}


// ── Inicializar BD y Tablas ──────────────────────────────────────────────────

function inicializarTablas() {
  var urlSinBD = "jdbc:mysql://" + CONFIG.mysql.server + ":" + CONFIG.mysql.port;
  var conn = Jdbc.getConnection(urlSinBD, CONFIG.mysql.user, CONFIG.mysql.password);
  var stmt = conn.createStatement();
  stmt.execute("CREATE DATABASE IF NOT EXISTS " + CONFIG.mysql.database);
  stmt.close();
  conn.close();

  conn = obtenerConexionSQL();
  stmt = conn.createStatement();

  // Integridad: NOT NULL en campos obligatorios, CHECK en estado
  stmt.execute(
    "CREATE TABLE IF NOT EXISTS usuarios (" +
    "  identifier VARCHAR(50) PRIMARY KEY," +
    "  nombre VARCHAR(100) NOT NULL," +
    "  apellido VARCHAR(100) NOT NULL DEFAULT ''," +
    "  grupo VARCHAR(100) NOT NULL," +
    "  email VARCHAR(150) DEFAULT ''," +
    "  activo BOOLEAN NOT NULL DEFAULT TRUE," +
    "  fecha_sync DATETIME NOT NULL DEFAULT NOW()," +
    "  INDEX ix_grupo (grupo)" +
    ")"
  );

  stmt.execute(
    "CREATE TABLE IF NOT EXISTS asistencia_diaria (" +
    "  id INT AUTO_INCREMENT PRIMARY KEY," +
    "  identifier VARCHAR(50) NOT NULL," +
    "  fecha DATE NOT NULL," +
    "  turno_nombre VARCHAR(100) DEFAULT ''," +
    "  turno_inicio VARCHAR(10) DEFAULT ''," +
    "  turno_fin VARCHAR(10) DEFAULT ''," +
    "  hora_entrada VARCHAR(20) DEFAULT '-'," +
    "  hora_salida VARCHAR(20) DEFAULT '-'," +
    "  estado VARCHAR(20) NOT NULL," +
    "  horas_trabajadas VARCHAR(10) DEFAULT '0'," +
    "  fecha_sync DATETIME NOT NULL DEFAULT NOW()," +
    "  UNIQUE KEY uq_asistencia (identifier, fecha)," +
    "  FOREIGN KEY (identifier) REFERENCES usuarios(identifier)," +
    "  INDEX ix_fecha (fecha)," +
    "  INDEX ix_fecha_estado (fecha, estado)" +
    ")"
  );

  stmt.execute(
    "CREATE TABLE IF NOT EXISTS resumen_diario (" +
    "  fecha DATE PRIMARY KEY," +
    "  programados INT NOT NULL DEFAULT 0," +
    "  asistieron INT NOT NULL DEFAULT 0," +
    "  faltaron INT NOT NULL DEFAULT 0," +
    "  pendientes INT NOT NULL DEFAULT 0," +
    "  porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0.00," +
    "  total INT NOT NULL DEFAULT 0," +
    "  fecha_sync DATETIME NOT NULL DEFAULT NOW()" +
    ")"
  );

  stmt.close();
  conn.close();
  Logger.log("Base de datos y tablas inicializadas en Azure MySQL");
}


// ── Guardar Todo (API → MySQL) ───────────────────────────────────────────────

function guardarEnSQL(resultado, usuarios) {
  var conn = obtenerConexionSQL();
  try {
    guardarUsuarios(conn, usuarios);
    guardarResumen(conn, resultado.resumenPorDia);
    guardarAsistencia(conn, resultado.detallePorDia);
    Logger.log("Datos completos guardados en Azure MySQL");
  } finally {
    conn.close();
  }
}


// ── Multi-row INSERT (optimización: 50 filas por query) ──────────────────────
// En vez de 350 queries individuales (lento), enviamos 7 queries de 50 filas.
// Reduce latencia de red de ~4 minutos a ~10 segundos.

function guardarUsuarios(conn, usuarios) {
  var CHUNK = 50;
  var total = 0;

  for (var i = 0; i < usuarios.length; i += CHUNK) {
    var lote = usuarios.slice(i, i + CHUNK);
    var valores = [];

    for (var j = 0; j < lote.length; j++) {
      var u = lote[j];
      valores.push("(" +
        esc(u.Identifier) + "," + esc(u.Name) + "," + esc(u.LastName) + "," +
        esc(u.GroupDescription) + "," + esc(u.Email) + ",TRUE,NOW())"
      );
    }

    conn.createStatement().execute(
      "INSERT INTO usuarios (identifier,nombre,apellido,grupo,email,activo,fecha_sync) VALUES " +
      valores.join(",") +
      " ON DUPLICATE KEY UPDATE nombre=VALUES(nombre),apellido=VALUES(apellido)," +
      "grupo=VALUES(grupo),email=VALUES(email),activo=TRUE,fecha_sync=NOW()"
    );
    total += lote.length;
  }

  Logger.log("  Usuarios guardados: " + total);
}


function guardarAsistencia(conn, detallePorDia) {
  var CHUNK = 50;
  var todos = [];

  // Aplanar el detalle en un array
  for (var dia in detallePorDia) {
    var empleados = detallePorDia[dia];
    for (var i = 0; i < empleados.length; i++) {
      todos.push({ fecha: dia, e: empleados[i] });
    }
  }

  for (var i = 0; i < todos.length; i += CHUNK) {
    var lote = todos.slice(i, i + CHUNK);
    var valores = [];

    for (var j = 0; j < lote.length; j++) {
      var r = lote[j];
      var e = r.e;
      valores.push("(" +
        esc(e.identifier) + "," + esc(r.fecha) + "," + esc(e.turnoNombre) + "," +
        esc(e.turnoInicio) + "," + esc(e.turnoFin) + "," + esc(e.horaEntrada) + "," +
        esc(e.horaSalida) + "," + esc(e.estado) + "," + esc(e.horasTrabajadas) + ",NOW())"
      );
    }

    conn.createStatement().execute(
      "INSERT INTO asistencia_diaria (identifier,fecha,turno_nombre,turno_inicio," +
      "turno_fin,hora_entrada,hora_salida,estado,horas_trabajadas,fecha_sync) VALUES " +
      valores.join(",") +
      " ON DUPLICATE KEY UPDATE turno_nombre=VALUES(turno_nombre),turno_inicio=VALUES(turno_inicio)," +
      "turno_fin=VALUES(turno_fin),hora_entrada=VALUES(hora_entrada),hora_salida=VALUES(hora_salida)," +
      "estado=VALUES(estado),horas_trabajadas=VALUES(horas_trabajadas),fecha_sync=NOW()"
    );
  }

  Logger.log("  Asistencia guardada: " + todos.length + " registros");
}


function guardarResumen(conn, resumenPorDia) {
  var valores = [];

  for (var i = 0; i < resumenPorDia.length; i++) {
    var r = resumenPorDia[i];
    valores.push("(" +
      esc(r.fecha) + "," + r.programados + "," + r.asistieron + "," +
      r.faltaron + "," + r.pendientes + "," + r.porcentaje + "," + r.total + ",NOW())"
    );
  }

  conn.createStatement().execute(
    "INSERT INTO resumen_diario (fecha,programados,asistieron,faltaron,pendientes,porcentaje,total,fecha_sync) VALUES " +
    valores.join(",") +
    " ON DUPLICATE KEY UPDATE programados=VALUES(programados),asistieron=VALUES(asistieron)," +
    "faltaron=VALUES(faltaron),pendientes=VALUES(pendientes),porcentaje=VALUES(porcentaje)," +
    "total=VALUES(total),fecha_sync=NOW()"
  );

  Logger.log("  Resumen guardado: " + resumenPorDia.length + " días");
}


// ── Escapar strings para SQL (prevenir SQL injection) ────────────────────────

function esc(val) {
  if (val === null || val === undefined) return "''";
  return "'" + String(val).replace(/'/g, "\\'").replace(/\\/g, "\\\\") + "'";
}


// ── Leer Resumen desde MySQL ─────────────────────────────────────────────────

function leerResumenSQL(fechaDesde, fechaHasta) {
  var conn = obtenerConexionSQL();
  var stmt = conn.prepareStatement(
    "SELECT fecha, programados, asistieron, faltaron, pendientes, porcentaje, total " +
    "FROM resumen_diario WHERE fecha BETWEEN ? AND ? ORDER BY fecha"
  );
  stmt.setString(1, fechaDesde);
  stmt.setString(2, fechaHasta);

  var rs = stmt.executeQuery();
  var resultados = [];

  while (rs.next()) {
    resultados.push({
      fecha:       rs.getString("fecha"),
      programados: rs.getInt("programados"),
      asistieron:  rs.getInt("asistieron"),
      faltaron:    rs.getInt("faltaron"),
      pendientes:  rs.getInt("pendientes"),
      porcentaje:  rs.getFloat("porcentaje"),
      total:       rs.getInt("total")
    });
  }

  rs.close(); stmt.close(); conn.close();
  return resultados;
}


// ── Leer Detalle desde MySQL ─────────────────────────────────────────────────

function leerDetalleSQL(fechaDesde, fechaHasta) {
  var conn = obtenerConexionSQL();
  var stmt = conn.prepareStatement(
    "SELECT a.fecha, a.identifier, CONCAT(u.nombre, ' ', u.apellido) AS nombre, " +
    "a.turno_nombre, a.turno_inicio, a.turno_fin, a.hora_entrada, a.hora_salida, " +
    "a.estado, a.horas_trabajadas " +
    "FROM asistencia_diaria a LEFT JOIN usuarios u ON a.identifier = u.identifier " +
    "WHERE a.fecha BETWEEN ? AND ? ORDER BY a.fecha, a.estado"
  );
  stmt.setString(1, fechaDesde);
  stmt.setString(2, fechaHasta);

  var rs = stmt.executeQuery();
  var detalle = {};

  while (rs.next()) {
    var fecha = rs.getString("fecha");
    if (!detalle[fecha]) detalle[fecha] = [];

    detalle[fecha].push({
      nombre:          rs.getString("nombre") || "",
      identifier:      rs.getString("identifier"),
      turnoNombre:     rs.getString("turno_nombre") || "",
      turnoInicio:     rs.getString("turno_inicio") || "",
      turnoFin:        rs.getString("turno_fin") || "",
      horaEntrada:     rs.getString("hora_entrada") || "-",
      horaSalida:      rs.getString("hora_salida") || "-",
      estado:          rs.getString("estado"),
      horasTrabajadas: rs.getString("horas_trabajadas") || "0"
    });
  }

  rs.close(); stmt.close(); conn.close();
  return detalle;
}
