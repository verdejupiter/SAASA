/**
 * oauth.gs — Módulo de Autenticación OAuth 1.0
 *
 * Principio SOLID: Single Responsibility
 *   → SOLO se encarga de autenticar con OAuth 1.0 y obtener usuarios.
 *
 * Flujo OAuth 1.0 con firma HMAC-SHA1:
 *   1. Generar parámetros OAuth (timestamp, nonce)
 *   2. Construir la "base string" (método + URL + params ordenados)
 *   3. Firmar con HMAC-SHA1 usando el consumer secret
 *   4. Enviar petición con header Authorization: OAuth ...
 *   5. La API verifica la firma y devuelve los usuarios
 *
 * ¿Por qué OAuth 1.0 y no 2.0?
 *   → La API de Usuarios de GeoVictoria lo requiere así.
 *   → OAuth 1.0 firma cada petición (más seguro sin HTTPS).
 */


// ── Configuración ────────────────────────────────────────────────────────────

var OAUTH_CONFIG = {
  url:             "https://apiv3.geovictoria.com/api/User/List",
  consumerKey:     CONFIG.geovictoria.apiKey,
  consumerSecret:  CONFIG.geovictoria.apiSecret,
  signatureMethod: "HMAC-SHA1",
  version:         "1.0"
};

var FILTRO_USUARIOS = { grupo: "PROYECTO SILLAS_LIMA", activo: 1 };


// ── Función Principal ────────────────────────────────────────────────────────
// Principio: una función, un propósito → obtener usuarios filtrados

function obtenerUsuarios() {
  var params = generarParametrosOAuth();
  var firma  = generarFirma(params);
  var header = construirHeaderAuth(params, firma);
  var datos  = realizarPeticionUsuarios(header);

  return datos ? filtrarUsuarios(datos) : [];
}


// ── Generación de Parámetros OAuth ───────────────────────────────────────────

function generarParametrosOAuth() {
  return {
    oauth_consumer_key:     OAUTH_CONFIG.consumerKey,
    oauth_nonce:            generarNonce(),
    oauth_signature_method: OAUTH_CONFIG.signatureMethod,
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_version:          OAUTH_CONFIG.version
  };
}

/** Genera un nonce aleatorio de 32 caracteres (requerido por OAuth 1.0) */
function generarNonce() {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var nonce = "";
  for (var i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}


// ── Firma HMAC-SHA1 ──────────────────────────────────────────────────────────
// La firma garantiza que la petición no fue alterada en tránsito.
// Se firma: MÉTODO + URL + parámetros ordenados alfabéticamente.

function generarFirma(params) {
  // Base string: "POST&URL_encoded&params_encoded"
  var paramsStr = Object.keys(params).sort()
    .map(function(k) { return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]); })
    .join("&");

  var baseString = "POST&" + encodeURIComponent(OAUTH_CONFIG.url) +
                   "&"     + encodeURIComponent(paramsStr);

  // Clave: consumer_secret + "&" (sin token secret en OAuth 1.0 de una pata)
  var firmaBytes = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_1,
    baseString,
    OAUTH_CONFIG.consumerSecret + "&"
  );

  return Utilities.base64Encode(firmaBytes);
}


// ── Header Authorization ─────────────────────────────────────────────────────

function construirHeaderAuth(params, firma) {
  var partes = Object.keys(params).sort()
    .map(function(k) { return k + '="' + encodeURIComponent(params[k]) + '"'; });

  partes.push('oauth_signature="' + encodeURIComponent(firma) + '"');
  return "OAuth " + partes.join(", ");
}


// ── Petición HTTP ────────────────────────────────────────────────────────────

function realizarPeticionUsuarios(headerAuth) {
  try {
    var resp = UrlFetchApp.fetch(OAUTH_CONFIG.url, {
      method:  "post",
      headers: { "Authorization": headerAuth, "Content-Type": "application/json" },
      payload: JSON.stringify({}),
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
      Logger.log("Error OAuth HTTP " + resp.getResponseCode());
      return null;
    }

    var datos = JSON.parse(resp.getContentText());
    Logger.log("Usuarios recibidos de API: " + (datos.length || 0));
    return datos;
  } catch (e) {
    Logger.log("Error OAuth: " + e.message);
    return null;
  }
}


// ── Filtrado ─────────────────────────────────────────────────────────────────
// Filtra por grupo "PROYECTO SILLAS_LIMA" y solo activos (Enabled = 1)

function filtrarUsuarios(usuarios) {
  if (!Array.isArray(usuarios)) return [];

  var filtrados = usuarios.filter(function(u) {
    return u.GroupDescription === FILTRO_USUARIOS.grupo &&
           u.Enabled === FILTRO_USUARIOS.activo;
  });

  Logger.log("Usuarios filtrados: " + filtrados.length);
  return filtrados;
}
