/**
 * database.gs — Módulo de Persistencia (Repository)
 *
 * Principio SOLID: Single Responsibility
 *   → SOLO se encarga de leer/escribir en Azure SQL Database.
 *   → No procesa datos, no llama APIs externas.
 *
 * Principio SOLID: Dependency Inversion
 *   → Depende de CONFIG (abstracción), no de valores hardcodeados.
 *   → Si cambias de Azure SQL a otro motor, solo modificas este archivo.
 *
 * Patrón MVC: Model (capa de persistencia / Repository)
 *
 * Tecnología: JDBC nativo de Apps Script
 *   → Apps Script incluye el driver para SQL Server.
 *   → Azure SQL Database es compatible con SQL Server.
 *
 * Nota: Debes permitir las IPs de Google en el firewall de Azure SQL.
 *   → Azure Portal → SQL Database → Firewall → Allow Azure services = ON
 */


// ── Conexión ─────────────────────────────────────────────────────────────────

function obtenerConexionSQL() {
  var url = "jdbc:sqlserver://" + CONFIG.azure.server + ":" + CONFIG.azure.port +
            ";databaseName=" + CONFIG.azure.database +
            ";encrypt=true;trustServerCertificate=true;loginTimeout=30";

  return Jdbc.getConnection(url, CONFIG.azure.user, CONFIG.azure.password);
}


// ── Inicializar Tablas (ejecutar una sola vez) ───────────────────────────────

function inicializarTablas() {
  var conn = obtenerConexionSQL();
  var stmt = conn.createStatement();

  stmt.execute(
    "IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'usuarios') " +
    "CREATE TABLE usuarios (" +
    "  identifier VARCHAR(50) PRIMARY KEY," +
    "  nombre VARCHAR(100) NOT NULL," +
    "  apellido VARCHAR(100)," +
    "  grupo VARCHAR(100)," +
    "  email VARCHAR(150)," +
    "  activo BIT DEFAULT 1," +
    "  fecha_sync DATETIME DEFAULT GETDATE()" +
    ")"
  );

  stmt.execute(
    "IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'asistencia_diaria') " +
    "CREATE TABLE asistencia_diaria (" +
    "  id INT IDENTITY(1,1) PRIMARY KEY," +
    "  identifier VARCHAR(50) NOT NULL," +
    "  fecha DATE NOT NULL," +
    "  turno_nombre VARCHAR(100)," +
    "  turno_inicio VARCHAR(10)," +
    "  turno_fin VARCHAR(10)," +
    "  hora_entrada VARCHAR(20)," +
    "  hora_salida VARCHAR(20)," +
    "  estado VARCHAR(20) NOT NULL," +
    "  horas_trabajadas VARCHAR(10)," +
    "  fecha_sync DATETIME DEFAULT GETDATE()," +
    "  CONSTRAINT UQ_asistencia UNIQUE (identifier, fecha)" +
    ")"
  );

  stmt.execute(
    "IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'resumen_diario') " +
    "CREATE TABLE resumen_diario (" +
    "  fecha DATE PRIMARY KEY," +
    "  programados INT DEFAULT 0," +
    "  asistieron INT DEFAULT 0," +
    "  faltaron INT DEFAULT 0," +
    "  pendientes INT DEFAULT 0," +
    "  porcentaje DECIMAL(5,2) DEFAULT 0," +
    "  total INT DEFAULT 0," +
    "  fecha_sync DATETIME DEFAULT GETDATE()" +
    ")"
  );

  stmt.close();
  conn.close();
  Logger.log("Tablas inicializadas en Azure SQL");
}


// ── Guardar Datos ────────────────────────────────────────────────────────────

function guardarEnSQL(resultado, usuarios) {
  var conn = obtenerConexionSQL();

  try {
    guardarUsuarios(conn, usuarios);
    guardarAsistencia(conn, resultado.detallePorDia);
    guardarResumen(conn, resultado.resumenPorDia);
    Logger.log("Datos guardados en Azure SQL");
  } finally {
    conn.close();  // Siempre cerrar la conexión (Clean Code: manejo de recursos)
  }
}


// ── Guardar Usuarios ─────────────────────────────────────────────────────────

function guardarUsuarios(conn, usuarios) {
  var sql = "MERGE INTO usuarios AS t " +
            "USING (SELECT ? AS identifier, ? AS nombre, ? AS apellido, ? AS grupo, ? AS email) AS s " +
            "ON t.identifier = s.identifier " +
            "WHEN MATCHED THEN UPDATE SET nombre=s.nombre, apellido=s.apellido, grupo=s.grupo, email=s.email, activo=1, fecha_sync=GETDATE() " +
            "WHEN NOT MATCHED THEN INSERT (identifier,nombre,apellido,grupo,email) VALUES (s.identifier,s.nombre,s.apellido,s.grupo,s.email);";

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
  var sql = "MERGE INTO asistencia_diaria AS t " +
            "USING (SELECT ? AS identifier, ? AS fecha, ? AS turno_nombre, ? AS turno_inicio, " +
            "? AS turno_fin, ? AS hora_entrada, ? AS hora_salida, ? AS estado, ? AS horas_trabajadas) AS s " +
            "ON t.identifier = s.identifier AND t.fecha = s.fecha " +
            "WHEN MATCHED THEN UPDATE SET turno_nombre=s.turno_nombre, turno_inicio=s.turno_inicio, " +
            "turno_fin=s.turno_fin, hora_entrada=s.hora_entrada, hora_salida=s.hora_salida, " +
            "estado=s.estado, horas_trabajadas=s.horas_trabajadas, fecha_sync=GETDATE() " +
            "WHEN NOT MATCHED THEN INSERT (identifier,fecha,turno_nombre,turno_inicio,turno_fin," +
            "hora_entrada,hora_salida,estado,horas_trabajadas) " +
            "VALUES (s.identifier,s.fecha,s.turno_nombre,s.turno_inicio,s.turno_fin," +
            "s.hora_entrada,s.hora_salida,s.estado,s.horas_trabajadas);";

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
  var sql = "MERGE INTO resumen_diario AS t " +
            "USING (SELECT ? AS fecha, ? AS programados, ? AS asistieron, ? AS faltaron, " +
            "? AS pendientes, ? AS porcentaje, ? AS total) AS s " +
            "ON t.fecha = s.fecha " +
            "WHEN MATCHED THEN UPDATE SET programados=s.programados, asistieron=s.asistieron, " +
            "faltaron=s.faltaron, pendientes=s.pendientes, porcentaje=s.porcentaje, " +
            "total=s.total, fecha_sync=GETDATE() " +
            "WHEN NOT MATCHED THEN INSERT (fecha,programados,asistieron,faltaron,pendientes,porcentaje,total) " +
            "VALUES (s.fecha,s.programados,s.asistieron,s.faltaron,s.pendientes,s.porcentaje,s.total);";

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


// ── Leer Resumen desde SQL ───────────────────────────────────────────────────

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


// ── Leer Detalle desde SQL ───────────────────────────────────────────────────

function leerDetalleSQL(fechaDesde, fechaHasta) {
  var conn = obtenerConexionSQL();
  var stmt = conn.prepareStatement(
    "SELECT a.fecha, a.identifier, u.nombre + ' ' + u.apellido AS nombre, " +
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
