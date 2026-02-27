/**
 * app.gs — Controlador Principal
 *
 * Principio SOLID: Single Responsibility
 *   → Este archivo SOLO orquesta el flujo y define la configuración.
 *   → No hace peticiones HTTP, no procesa datos, no toca la BD.
 *
 * Patrón MVC: Controller
 *   → Recibe la petición del frontend (google.script.run)
 *   → Coordina los módulos (oauth, auth, api, data, database)
 *   → Retorna el resultado al frontend
 *
 * Principio DRY: CONFIG centralizado
 *   → Todas las credenciales en UN solo lugar.
 *   → Para replicar en otro entorno, solo cambias CONFIG.
 */


// ── Configuración Centralizada ───────────────────────────────────────────────
// Principio Open/Closed: cambias valores aquí sin tocar los módulos internos

var CONFIG = {
  geovictoria: {
    apiKey:    "abd882",
    apiSecret: "84891b1b"
  },
  mysql: {
    server:   "saasa-mysql.mysql.database.azure.com",
    database: "saasa_asistencia",
    user:     "saasa_admin",
    password: "ANGELICA2026%",
    port:     "3306"
  }
};


// ── Entry Point: Sirve la aplicación web ─────────────────────────────────────

function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("SAASA - Control de Asistencia")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


// ── Sincronizar: API → BD → Dashboard ────────────────────────────────────────
// Patrón Facade: una sola función expuesta al frontend que orquesta todo
// Flujo: GeoVictoria API → procesar → guardar en Azure MySQL → leer de BD → mostrar
// El dashboard SIEMPRE muestra datos desde la BD (única fuente de verdad)

function obtenerDatosDashboard(fechaDesde, fechaHasta) {
  try {
    Logger.log("=== SINCRONIZAR API → BD: " + fechaDesde + " al " + fechaHasta + " ===");

    // Paso 1 → Usuarios activos del grupo (OAuth 1.0)
    var usuarios = obtenerUsuarios();
    if (!usuarios || usuarios.length === 0) {
      return { error: true, mensaje: "No se encontraron usuarios activos" };
    }

    // Paso 2 → Token JWT para la API de asistencia
    var token = obtenerTokenJWT();
    if (!token) {
      return { error: true, mensaje: "No se pudo obtener token JWT" };
    }

    // Paso 3 → Datos de asistencia (en lotes de 50)
    var datosAPI = obtenerAsistencia(token, usuarios, fechaDesde, fechaHasta);
    if (!datosAPI || datosAPI.length === 0) {
      return { error: true, mensaje: "No se obtuvieron datos de asistencia" };
    }

    // Paso 4 → Procesar y clasificar (data.gs)
    var resultado = procesarDatos(datosAPI);
    resultado.totalUsuarios = usuarios.length;

    // Paso 5 → Persistir en Azure MySQL (database.gs)
    guardarEnSQL(resultado, usuarios);
    Logger.log("Datos guardados en Azure MySQL. Leyendo desde BD...");

    // Paso 6 → Leer desde BD (única fuente de verdad para el dashboard)
    var conn = obtenerConexionSQL();
    var desdeBD = {
      error: false,
      resumenPorDia:      leerResumenSQL(fechaDesde, fechaHasta, conn),
      detallePorDia:      leerDetalleSQL(fechaDesde, fechaHasta, conn),
      totalUsuarios:      usuarios.length,
      fechaActualizacion: Utilities.formatDate(new Date(), "America/Lima", "dd/MM/yyyy HH:mm"),
      fuenteDatos:        "API GeoVictoria → Azure MySQL → Dashboard"
    };
    conn.close();

    return desdeBD;

  } catch (e) {
    Logger.log("Error: " + e.message);
    return { error: true, mensaje: e.message };
  }
}


// ── Carga desde Azure MySQL (sin llamar a GeoVictoria) ───────────────────────
// Optimización: UNA sola conexión JDBC para ambas consultas (resumen + detalle)

function obtenerDatosDesdeSQL(fechaDesde, fechaHasta) {
  try {
    var t0 = new Date().getTime();
    var conn = obtenerConexionSQL();
    Logger.log("Conexión JDBC: " + (new Date().getTime() - t0) + "ms");

    var t1 = new Date().getTime();
    var resumenes = leerResumenSQL(fechaDesde, fechaHasta, conn);
    Logger.log("Query resumen: " + (new Date().getTime() - t1) + "ms → " + resumenes.length + " días");

    if (!resumenes || resumenes.length === 0) {
      conn.close();
      return { error: true, mensaje: "No hay datos guardados para ese rango" };
    }

    var t2 = new Date().getTime();
    var detalle = leerDetalleSQL(fechaDesde, fechaHasta, conn);
    Logger.log("Query detalle: " + (new Date().getTime() - t2) + "ms");

    conn.close();
    Logger.log("TOTAL carga BD: " + (new Date().getTime() - t0) + "ms");

    return {
      error: false,
      resumenPorDia: resumenes,
      detallePorDia: detalle,
      fechaActualizacion: Utilities.formatDate(new Date(), "America/Lima", "dd/MM/yyyy HH:mm"),
      fuenteDatos: "Azure MySQL Database"
    };
  } catch (e) {
    return { error: true, mensaje: e.message };
  }
}
