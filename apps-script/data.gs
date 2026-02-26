/**
 * data.gs — Módulo de Procesamiento de Datos (Model)
 *
 * Principio SOLID: Single Responsibility
 *   → SOLO transforma datos crudos de la API en datos limpios para el dashboard.
 *   → No hace peticiones HTTP, no toca la BD.
 *
 * Patrón MVC: Model
 *   → Contiene la lógica de negocio (clasificación de estados).
 *
 * Lógica de Clasificación (Anexo 2 del documento técnico):
 *   Día Libre → turno contiene "Break"
 *   Asistió   → tiene marca de entrada O salida
 *   Sin salida→ tiene entrada pero NO salida
 *   Faltó     → sin marcas y turno ya pasó
 *   Pendiente → turno aún no empieza
 *
 * Fórmula: %Asistencia = (Asistieron / Programados) × 100
 */


// ── Función Principal ────────────────────────────────────────────────────────

function procesarDatos(usersData) {
  var detallePorDia = {};

  for (var u = 0; u < usersData.length; u++) {
    var user = usersData[u];
    if (!user.PlannedInterval) continue;

    for (var p = 0; p < user.PlannedInterval.length; p++) {
      var interval = user.PlannedInterval[p];
      var fecha = formatearFechaAPI(interval.Date);

      if (!detallePorDia[fecha]) detallePorDia[fecha] = [];

      // Extraer turno
      var turno       = (interval.Shifts && interval.Shifts[0]) || null;
      var turnoNombre = turno ? turno.ShiftDisplay : "Sin turno";
      var turnoInicio = turno ? (turno.StartTime || "") : "";
      var turnoFin    = turno ? (turno.ExitTime || "") : "";

      // Extraer marcaciones reales (Punches)
      var marcaEntrada = null, marcaSalida = null;
      if (interval.Punches) {
        for (var m = 0; m < interval.Punches.length; m++) {
          if (interval.Punches[m].Type === "Ingreso") marcaEntrada = interval.Punches[m];
          if (interval.Punches[m].Type === "Salida")  marcaSalida  = interval.Punches[m];
        }
      }

      detallePorDia[fecha].push({
        nombre:          (user.Name || "") + " " + (user.LastName || ""),
        identifier:      user.Identifier || "",
        turnoNombre:     formatearTurno(turnoNombre, turnoInicio, turnoFin),
        turnoInicio:     turnoInicio,
        turnoFin:        turnoFin,
        horaEntrada:     marcaEntrada ? extraerHoraAPI(marcaEntrada.Date) : "-",
        horaSalida:      marcaSalida  ? extraerHoraAPI(marcaSalida.Date)  : "-",
        estado:          clasificarEstado(turnoNombre, marcaEntrada, marcaSalida, interval),
        horasTrabajadas: interval.WorkedHours || "0"
      });
    }
  }

  // Generar resumen agregado por día
  var resumenPorDia = generarResumen(detallePorDia);

  return { resumenPorDia: resumenPorDia, detallePorDia: detallePorDia };
}


// ── Resumen por Día ──────────────────────────────────────────────────────────

function generarResumen(detallePorDia) {
  var resumen = [];

  for (var dia in detallePorDia) {
    var empleados = detallePorDia[dia];
    var prog = 0, asist = 0, falt = 0, pend = 0;

    for (var i = 0; i < empleados.length; i++) {
      var est = empleados[i].estado;
      if (est === "Día Libre") continue;
      prog++;
      if (est === "Asistió" || est === "Sin salida") asist++;
      else if (est === "Faltó")     falt++;
      else if (est === "Pendiente") pend++;
    }

    resumen.push({
      fecha:       dia,
      programados: prog,
      asistieron:  asist,
      faltaron:    falt,
      pendientes:  pend,
      porcentaje:  prog > 0 ? Math.round((asist / prog) * 100) : 0,
      total:       empleados.length
    });
  }

  return resumen.sort(function(a, b) { return a.fecha.localeCompare(b.fecha); });
}


// ── Clasificación de Estado ──────────────────────────────────────────────────
// Patrón Strategy: encapsula la lógica de decisión en una función pura

function clasificarEstado(turnoNombre, marcaEntrada, marcaSalida, interval) {
  // 1. ¿Es día libre?
  if (!turnoNombre || turnoNombre === "Sin turno" ||
      turnoNombre.toLowerCase().indexOf("break") !== -1) {
    return "Día Libre";
  }

  // 2. ¿Tiene marcaciones? → Asistió o Sin salida
  if (marcaEntrada || marcaSalida) {
    return (marcaEntrada && !marcaSalida) ? "Sin salida" : "Asistió";
  }

  // 3. ¿Marcado como ausente por la API?
  if (interval.Absent === "True" || interval.Absent === true) {
    return "Faltó";
  }

  // 4. ¿El turno ya pasó? → Faltó. ¿No empezó? → Pendiente
  if (interval.Shifts && interval.Shifts[0] && interval.Shifts[0].Begins) {
    try {
      var turnoDate = parsearFechaAPI(interval.Shifts[0].Begins);
      if (new Date() > turnoDate) return "Faltó";
    } catch (e) { /* si falla el parseo, queda pendiente */ }
  }

  return "Pendiente";
}


// ── Funciones de Formateo ────────────────────────────────────────────────────
// Principio: funciones pequeñas, un solo propósito, nombres descriptivos

/** "20260225000000" → "2026-02-25" */
function formatearFechaAPI(fechaAPI) {
  if (!fechaAPI || fechaAPI.length < 8) return fechaAPI;
  var s = String(fechaAPI);
  return s.substring(0, 4) + "-" + s.substring(4, 6) + "-" + s.substring(6, 8);
}

/** "20260224192000" → "19:20" */
function extraerHoraAPI(fechaAPI) {
  if (!fechaAPI) return "-";
  var s = String(fechaAPI);
  if (s.length >= 12) return s.substring(8, 10) + ":" + s.substring(10, 12);
  var match = s.match(/(\d{2}:\d{2})/);
  return match ? match[1] : s;
}

/** "20260224193000" → Date object */
function parsearFechaAPI(fechaAPI) {
  var s = String(fechaAPI);
  return new Date(
    parseInt(s.substring(0, 4)),  parseInt(s.substring(4, 6)) - 1,
    parseInt(s.substring(6, 8)),  parseInt(s.substring(8, 10)),
    parseInt(s.substring(10, 12))
  );
}

/** Limpia el nombre del turno para mostrar "HH:MM - HH:MM" */
function formatearTurno(nombre, inicio, fin) {
  if (nombre && nombre.toLowerCase().indexOf("break") !== -1) return "Día Libre";
  if (inicio && fin && inicio !== "00:00" && fin !== "00:00") return inicio + " - " + fin;
  if (nombre && nombre.indexOf("hrs") !== -1 && inicio && fin) return inicio + " - " + fin;
  return nombre || "Sin turno";
}
