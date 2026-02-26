/**
 * api.gs — Módulo de Consulta de Asistencia
 *
 * Principio SOLID: Single Responsibility
 *   → SOLO se encarga de consultar la API AttendanceBook.
 *   → No procesa datos, no clasifica, no persiste.
 *
 * Restricción de la API:
 *   → Máximo 50 UserIds por petición.
 *   → Solución: dividir en lotes y concatenar resultados.
 *
 * Formato de fechas requerido por la API:
 *   → "yyyyMMddHHmmss" (14 dígitos, sin guiones)
 *   → Ejemplo: "20260225000000" = 25/Feb/2026 00:00:00
 */


var ASISTENCIA_URL = "https://customerapi.geovictoria.com/api/v1/AttendanceBook";
var MAX_POR_LOTE   = 50;


// ── Función Principal ────────────────────────────────────────────────────────

function obtenerAsistencia(token, usuarios, fechaDesde, fechaHasta) {
  var ids   = usuarios.map(function(u) { return u.Identifier; });
  var lotes = dividirEnLotes(ids, MAX_POR_LOTE);

  // "2026-02-25" → "20260225000000"
  var startDate = fechaDesde.replace(/-/g, "") + "000000";
  var endDate   = fechaHasta.replace(/-/g, "") + "235959";

  Logger.log("Usuarios: " + ids.length + " | Lotes: " + lotes.length);

  var resultado = [];

  for (var i = 0; i < lotes.length; i++) {
    Logger.log("Lote " + (i + 1) + "/" + lotes.length);

    var datos = consultarLote(token, lotes[i], startDate, endDate);

    if (datos && datos.Users)        resultado = resultado.concat(datos.Users);
    else if (Array.isArray(datos))   resultado = resultado.concat(datos);

    // Pausa entre lotes para no saturar la API
    if (i < lotes.length - 1) Utilities.sleep(500);
  }

  Logger.log("Total usuarios con datos: " + resultado.length);
  return resultado;
}


// ── Petición por Lote ────────────────────────────────────────────────────────

function consultarLote(token, ids, startDate, endDate) {
  try {
    var resp = UrlFetchApp.fetch(ASISTENCIA_URL, {
      method:      "post",
      contentType: "application/json",
      headers:     { "Authorization": "Bearer " + token },
      payload:     JSON.stringify({
        StartDate: startDate,
        EndDate:   endDate,
        UserIds:   ids.join(",")
      }),
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
      Logger.log("  Error HTTP " + resp.getResponseCode());
      return null;
    }

    return JSON.parse(resp.getContentText());
  } catch (e) {
    Logger.log("  Excepción: " + e.message);
    return null;
  }
}


// ── Utilidad: Dividir array en lotes ─────────────────────────────────────────
// Principio DRY: función reutilizable para cualquier paginación

function dividirEnLotes(arr, max) {
  var lotes = [];
  for (var i = 0; i < arr.length; i += max) {
    lotes.push(arr.slice(i, i + max));
  }
  return lotes;
}
