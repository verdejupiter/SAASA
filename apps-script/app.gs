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
  azure: {
    server:   "saasa-server.database.windows.net",
    database: "saasa-bd",
    user:     "saasa_admin",
    password: "ANGELICA2026%",
    port:     "1433"
  }
};


// ── Entry Point: Sirve la aplicación web ─────────────────────────────────────

function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("SAASA - Control de Asistencia")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


// ── Función Principal del Dashboard (llamada desde index.html) ───────────────
// Patrón Facade: una sola función expuesta al frontend que orquesta todo

function obtenerDatosDashboard(fechaDesde, fechaHasta) {
  try {
    Logger.log("=== DASHBOARD: " + fechaDesde + " al " + fechaHasta + " ===");

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
    resultado.error = false;
    resultado.totalUsuarios = usuarios.length;
    resultado.fechaActualizacion = Utilities.formatDate(
      new Date(), "America/Lima", "dd/MM/yyyy HH:mm"
    );

    // Paso 5 → Persistir en Azure SQL (database.gs)
    try {
      guardarEnSQL(resultado, usuarios);
      resultado.fuenteDatos = "API GeoVictoria → Azure SQL";
    } catch (e) {
      Logger.log("Aviso: sin persistencia SQL: " + e.message);
      resultado.fuenteDatos = "API GeoVictoria (sin persistencia)";
    }

    return resultado;

  } catch (e) {
    Logger.log("Error: " + e.message);
    return { error: true, mensaje: e.message };
  }
}


// ── Carga desde Azure SQL (sin llamar a GeoVictoria) ─────────────────────────

function obtenerDatosDesdeSQL(fechaDesde, fechaHasta) {
  try {
    var resumenes = leerResumenSQL(fechaDesde, fechaHasta);
    if (!resumenes || resumenes.length === 0) {
      return { error: true, mensaje: "No hay datos guardados para ese rango" };
    }
    return {
      error: false,
      resumenPorDia: resumenes,
      detallePorDia: leerDetalleSQL(fechaDesde, fechaHasta),
      fechaActualizacion: "Datos desde Azure SQL (caché)",
      fuenteDatos: "Azure SQL Database"
    };
  } catch (e) {
    return { error: true, mensaje: e.message };
  }
}
