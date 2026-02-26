/**
 * auth.gs — Módulo de Autenticación JWT
 *
 * Principio SOLID: Single Responsibility
 *   → SOLO se encarga de obtener un token JWT desde la API de Login.
 *   → No consulta asistencia, no filtra, no persiste.
 *
 * Flujo JWT:
 *   1. POST al endpoint de Login con User + Password
 *   2. La API responde con { token: "eyJhbG..." }
 *   3. Ese token se usa como Bearer en las siguientes peticiones
 *
 * ¿Qué es JWT?
 *   → JSON Web Token: un string firmado que demuestra que nos autenticamos.
 *   → Se envía en el header: Authorization: Bearer <token>
 */


var JWT_URL = "https://customerapi.geovictoria.com/api/v1/Login";


// ── Función Principal ────────────────────────────────────────────────────────

function obtenerTokenJWT() {
  try {
    var resp = UrlFetchApp.fetch(JWT_URL, {
      method:      "post",
      contentType: "application/json",
      payload:     JSON.stringify({
        User:     CONFIG.geovictoria.apiKey,
        Password: CONFIG.geovictoria.apiSecret
      }),
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
      Logger.log("JWT Error HTTP " + resp.getResponseCode() + ": " + resp.getContentText());
      return null;
    }

    var datos = JSON.parse(resp.getContentText());
    var token = datos.token || datos.Token;

    if (!token) {
      Logger.log("Respuesta sin token: " + resp.getContentText());
      return null;
    }

    Logger.log("Token JWT obtenido exitosamente");
    return token;

  } catch (e) {
    Logger.log("JWT Error: " + e.message);
    return null;
  }
}
