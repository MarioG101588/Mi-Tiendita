// FirebaseMetrics.js
// Contador simple de consumo de Firebase en el turno

let metrics = {
  lecturas: 0,
  escrituras: 0,
  borrados: 0,
  almacenamiento: 0, // en KB
  transferencia: 0,  // en KB
};

// Registrar operación
export function registrarOperacion(tipo, size = 1) {
  if (tipo === "lectura") {
    metrics.lecturas++;
    metrics.transferencia += size; // Estimar transferencia basada en tamaño leído
  }
  if (tipo === "escritura") {
    metrics.escrituras++;
    metrics.almacenamiento += size;
    metrics.transferencia += size;
  }
  if (tipo === "borrado") {
    metrics.borrados++;
    metrics.almacenamiento -= size; // Restar almacenamiento estimado en borrados
    if (metrics.almacenamiento < 0) metrics.almacenamiento = 0; // Evitar negativos
  }
}

// Obtener resumen actual
export function obtenerResumenFirebase() {
  return { ...metrics };
}

// Resetear métricas (cuando inicia nuevo turno)
export function resetFirebaseMetrics() {
  metrics = {
    lecturas: 0,
    escrituras: 0,
    borrados: 0,
    almacenamiento: 0,
    transferencia: 0,
  };
}
