/**
 * database.gs — Módulo de Persistencia (Repository)
 *
 * Principio SOLID: Single Responsibility
 *   → SOLO se encarga de leer/escribir en Azure MySQL Database.
 *
 * Principio SOLID: Dependency Inversion
 *   → Depende de CONFIG (abstracción), no de valores hardcodeados.
 *   → Si cambias de MySQL a otro motor, solo modificas este archivo.
 *
 * Patrón MVC: Model (capa de persistencia / Repository)
 *
 * Tecnología: JDBC nativo de Apps Script con MySQL
 *   → Apps Script soporta jdbc:mysql:// para conexiones externas.
 *   → Azure Database for MySQL es compatible.
 */


// ── Conexión ─────────────────────────────────────────────────────────────────

function obtenerConexionSQL() {
  var url = "jdbc:mysql://" + CONFIG.mysql.server + ":" + CONFIG.mysql.port +
            "/" + CONFIG.mysql.database +
            "?useSSL=true&requireSSL=true";

  return Jdbc.getConnection(url, CONFIG.mysql.user, CONFIG.mysql.password);
}


// ── Inicializar BD y Tablas (ejecutar una sola vez) ──────────────────────────

function inicializarTablas() {
  // Primero conectar sin BD para crearla
  var urlSinBD = "jdbc:mysql://" + CONFIG.mysql.server + ":" + CONFIG.mysql.port +
                 "?useSSL=true&requireSSL=true";
  var conn = Jdbc.getConnection(urlSinBD, CONFIG.mysql.user, CONFIG.mysql.password);
  var stmt = conn.createStatement();

  stmt.execute("CREATE DATABASE IF NOT EXISTS " + CONFIG.mysql.database);
  stmt.close();
  conn.close();

  // Ahora conectar a la BD y crear tablas
  conn = obtenerConexionSQL();
  stmt = conn.createStatement();

  stmt.execute(
    "CREATE TABLE IF NOT EXISTS usuarios (" +
    "  identifier VARCHAR(50) PRIMARY KEY," +
    "  nombre VARCHAR(100) NOT NULL," +
    "  apellido VARCHAR(100)," +
    "  grupo VARCHAR(100)," +
    "  email VARCHAR(150)," +
    "  activo BOOLEAN DEFAULT TRUE," +
    "  fecha_sync DATETIME DEFAULT NOW()" +
    ")"
  );

  stmt.execute(
    "CREATE TABLE IF NOT EXISTS asistencia_diaria (" +
    "  id INT AUTO_INCREMENT PRIMARY KEY," +
    "  identifier VARCHAR(50) NOT NULL," +
    "  fecha DATE NOT NULL," +
    "  turno_nombre VARCHAR(100)," +
    "  turno_inicio VARCHAR(10)," +
    "  turno_fin VARCHAR(10)," +
    "  hora_entrada VARCHAR(20)," +
    "  hora_salida VARCHAR(20)," +
    "  estado VARCHAR(20) NOT NULL," +
    "  horas_trabajadas VARCHAR(10)," +
    "  fecha_sync DATETIME DEFAULT NOW()," +
    "  UNIQUE KEY uq_asistencia (identifier, fecha)," +
    "  FOREIGN KEY (identifier) REFERENCES usuarios(identifier)" +
    ")"
  );

  stmt.execute(
    "CREATE TABLE IF NOT EXISTS resumen_diario (" +
    "  fecha DATE PRIMARY KEY," +
    "  programados INT DEFAULT 0," +
    "  asistieron INT DEFAULT 0," +
    "  faltaron INT DEFAULT 0," +
    "  pendientes INT DEFAULT 0," +
    "  porcentaje DECIMAL(5,2) DEFAULT 0," +
    "  total INT DEFAULT 0," +
    "  fecha_sync DATETIME DEFAULT NOW()" +
    ")"
  );

  stmt.close();
  conn.close();
  Logger.log("Base de datos y tablas inicializadas en Azure MySQL");
}


// ── Guardar Datos ────────────────────────────────────────────────────────────

function guardarEnSQL(resultado, usuarios) {
  var conn = obtenerConexionSQL();

  try {
    guardarUsuarios(conn, usuarios);
    guardarAsistencia(conn, resultado.detallePorDia);
    guardarResumen(conn, resultado.resumenPorDia);
    Logger.log("Datos guardados en Azure MySQL");
  } finally {
    conn.close();
  }
}


// ── Guardar Usuarios (INSERT ... ON DUPLICATE KEY UPDATE) ────────────────────

function guardarUsuarios(conn, usuarios) {
  var sql = "INSERT INTO usuarios (identifier, nombre, apellido, grupo, email, activo, fecha_sync) " +
            "VALUES (?, ?, ?, ?, ?, TRUE, NOW()) " +
            "ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), apellido=VALUES(apellido), " +
            "grupo=VALUES(grupo), email=VALUES(email), activo=TRUE, fecha_sync=NOW()";

  var stmt = conn.prepareStatement(sql);

  for (var i = 0; i < usuarios.length; i++) {
    var u = usuarios[i];
    stmt.setString(1, u.Identifier || "");
    stmt.setString(2, u.Name || "");
    stmt.setString(3, u.LastName || "");
    stmt.setString(4, u.GroupDescription || "");
    stmt.setString(5, u.Email || "");
    stmt.addBatch();
  }

  stmt.executeBatch();
  stmt.close();
}


// ── Guardar Asistencia Diaria ────────────────────────────────────────────────

function guardarAsistencia(conn, detallePorDia) {
  var sql = "INSERT INTO asistencia_diaria (identifier, fecha, turno_nombre, turno_inicio, " +
            "turno_fin, hora_entrada, hora_salida, estado, horas_trabajadas, fecha_sync) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW()) " +
            "ON DUPLICATE KEY UPDATE turno_nombre=VALUES(turno_nombre), turno_inicio=VALUES(turno_inicio), " +
            "turno_fin=VALUES(turno_fin), hora_entrada=VALUES(hora_entrada), hora_salida=VALUES(hora_salida), " +
            "estado=VALUES(estado), horas_trabajadas=VALUES(horas_trabajadas), fecha_sync=NOW()";

  var stmt = conn.prepareStatement(sql);

  for (var dia in detallePorDia) {
    var empleados = detallePorDia[dia];
    for (var i = 0; i < empleados.length; i++) {
      var e = empleados[i];
      stmt.setString(1, e.identifier);
      stmt.setString(2, dia);
      stmt.setString(3, e.turnoNombre);
      stmt.setString(4, e.turnoInicio);
      stmt.setString(5, e.turnoFin);
      stmt.setString(6, e.horaEntrada);
      stmt.setString(7, e.horaSalida);
      stmt.setString(8, e.estado);
      stmt.setString(9, e.horasTrabajadas);
      stmt.addBatch();
    }
  }

  stmt.executeBatch();
  stmt.close();
}


// ── Guardar Resumen Diario ───────────────────────────────────────────────────

function guardarResumen(conn, resumenPorDia) {
  var sql = "INSERT INTO resumen_diario (fecha, programados, asistieron, faltaron, " +
            "pendientes, porcentaje, total, fecha_sync) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, NOW()) " +
            "ON DUPLICATE KEY UPDATE programados=VALUES(programados), asistieron=VALUES(asistieron), " +
            "faltaron=VALUES(faltaron), pendientes=VALUES(pendientes), porcentaje=VALUES(porcentaje), " +
            "total=VALUES(total), fecha_sync=NOW()";

  var stmt = conn.prepareStatement(sql);

  for (var i = 0; i < resumenPorDia.length; i++) {
    var r = resumenPorDia[i];
    stmt.setString(1, r.fecha);
    stmt.setInt(2, r.programados);
    stmt.setInt(3, r.asistieron);
    stmt.setInt(4, r.faltaron);
    stmt.setInt(5, r.pendientes);
    stmt.setFloat(6, r.porcentaje);
    stmt.setInt(7, r.total);
    stmt.addBatch();
  }

  stmt.executeBatch();
  stmt.close();
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
