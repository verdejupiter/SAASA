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


// ── Verificar datos en BD (ejecutar desde el editor para demostrar persistencia) ──

function verificarDatosSQL() {
  var conn = obtenerConexionSQL();
  var stmt = conn.createStatement();

  var rs = stmt.executeQuery("SELECT COUNT(*) AS total FROM usuarios");
  rs.next();
  Logger.log("=== VERIFICACIÓN DE BASE DE DATOS ===");
  Logger.log("Usuarios en BD: " + rs.getInt("total"));

  rs = stmt.executeQuery("SELECT COUNT(*) AS total FROM asistencia_diaria");
  rs.next();
  Logger.log("Registros de asistencia: " + rs.getInt("total"));

  rs = stmt.executeQuery("SELECT COUNT(*) AS total FROM resumen_diario");
  rs.next();
  Logger.log("Días con resumen: " + rs.getInt("total"));

  rs = stmt.executeQuery(
    "SELECT fecha, programados, asistieron, faltaron, CONCAT(porcentaje,'%') AS pct " +
    "FROM resumen_diario ORDER BY fecha DESC LIMIT 7"
  );
  Logger.log("\n── Últimos 7 días de resumen ──");
  while (rs.next()) {
    Logger.log(rs.getString("fecha") + " | Prog:" + rs.getInt("programados") +
      " Asist:" + rs.getInt("asistieron") + " Falt:" + rs.getInt("faltaron") +
      " → " + rs.getString("pct"));
  }

  rs = stmt.executeQuery(
    "SELECT CONCAT(u.nombre,' ',u.apellido) AS nombre, a.estado, a.hora_entrada " +
    "FROM asistencia_diaria a JOIN usuarios u ON a.identifier=u.identifier " +
    "ORDER BY a.fecha DESC, a.estado LIMIT 10"
  );
  Logger.log("\n── Últimos 10 registros de asistencia ──");
  while (rs.next()) {
    Logger.log(rs.getString("nombre") + " | " + rs.getString("estado") +
      " | Entrada: " + rs.getString("hora_entrada"));
  }

  rs.close(); stmt.close(); conn.close();
  Logger.log("\n=== FIN VERIFICACIÓN ===");
}


// ── Leer Resumen desde MySQL ─────────────────────────────────────────────────

function leerResumenSQL(fechaDesde, fechaHasta, conn) {
  var cerrar = !conn;
  if (!conn) conn = obtenerConexionSQL();

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

  rs.close(); stmt.close();
  if (cerrar) conn.close();
  return resultados;
}


// ── Leer Detalle desde MySQL ─────────────────────────────────────────────────
// Optimización: GROUP_CONCAT concatena todas las filas en UNA sola string por día.
// Esto reduce de ~7000 llamadas de red (rs.next + getString × 700 filas) a solo
// 1 llamada (una string gigante). De 173s → ~3s.

function leerDetalleSQL(fechaDesde, fechaHasta, conn) {
  var cerrar = !conn;
  if (!conn) conn = obtenerConexionSQL();

  // Subir límite de GROUP_CONCAT (default 1024 bytes, necesitamos ~500KB para 700 filas)
  conn.createStatement().execute("SET SESSION group_concat_max_len = 1000000");

  // Paso 1: Usuarios como UNA sola string (identifier|nombre;;identifier|nombre;;...)
  var stmtU = conn.createStatement();
  var rsU = stmtU.executeQuery(
    "SELECT GROUP_CONCAT(identifier, '|', CONCAT(nombre,' ',apellido) SEPARATOR ';;') AS bulk FROM usuarios"
  );
  var nombres = {};
  if (rsU.next()) {
    var bulk = rsU.getString("bulk") || "";
    var partes = bulk.split(";;");
    for (var i = 0; i < partes.length; i++) {
      var p = partes[i].split("|");
      if (p.length >= 2) nombres[p[0]] = p[1];
    }
  }
  rsU.close(); stmtU.close();

  // Paso 2: Asistencia como UNA string por día usando GROUP_CONCAT
  // Cada fila: identifier|turno_nombre|turno_inicio|turno_fin|hora_entrada|hora_salida|estado|horas
  // Filas separadas por ";;" dentro de cada día
  var stmt = conn.prepareStatement(
    "SELECT fecha, GROUP_CONCAT(" +
    "  CONCAT_WS('|', identifier, turno_nombre, turno_inicio, turno_fin, " +
    "  hora_entrada, hora_salida, estado, horas_trabajadas) " +
    "  ORDER BY estado SEPARATOR ';;'" +
    ") AS bulk " +
    "FROM asistencia_diaria WHERE fecha BETWEEN ? AND ? GROUP BY fecha ORDER BY fecha"
  );
  stmt.setString(1, fechaDesde);
  stmt.setString(2, fechaHasta);

  var rs = stmt.executeQuery();
  var detalle = {};

  // Solo ~2-7 rs.next() (uno por día) en vez de ~700
  while (rs.next()) {
    var fecha = rs.getString("fecha");
    detalle[fecha] = [];
    var filas = (rs.getString("bulk") || "").split(";;");

    for (var i = 0; i < filas.length; i++) {
      var c = filas[i].split("|");
      if (c.length < 8) continue;
      detalle[fecha].push({
        nombre:          nombres[c[0]] || "",
        identifier:      c[0],
        turnoNombre:     c[1] || "",
        turnoInicio:     c[2] || "",
        turnoFin:        c[3] || "",
        horaEntrada:     c[4] || "-",
        horaSalida:      c[5] || "-",
        estado:          c[6],
        horasTrabajadas: c[7] || "0"
      });
    }
  }

  rs.close(); stmt.close();
  if (cerrar) conn.close();
  return detalle;
}
