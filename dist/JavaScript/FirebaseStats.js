// FirebaseStats.js
import {
  collection,
  wrappedAddDoc,
  wrappedGetDocs,
} from "./FirebaseWrapper.js"; // usamos el wrapper con métricas
import { db } from "./Conexion.js";
import {
  obtenerResumenFirebase,
  resetFirebaseMetrics,
} from "./FirebaseMetrics.js"; // 👈 corregido, antes importabas mal desde FirebaseStats.js

/**
 * Guardar métricas del turno en Firestore
 * @param {string} turnoId - ID único del turno
 */
export async function guardarConsumoTurno(turnoId) {
  const metrics = obtenerResumenFirebase();
  try {
    await wrappedAddDoc(collection(db, "firebaseStats"), {
      turnoId,
      fecha: new Date().toLocaleString(),
      ...metrics,
    });
  } catch (err) {
    console.error("Error guardando métricas Firebase:", err);
  }
}

/**
 * Obtener acumulado histórico de consumo
 * @returns {Promise<object>}
 */
export async function obtenerConsumoHistorico() {
  let acumulado = {
    lecturas: 0,
    escrituras: 0,
    borrados: 0,
    almacenamientoNeto: 0, // Nuevo: almacenamiento neto (escrituras - borrados)
    transferencia: 0,
  };

  try {
    const snap = await wrappedGetDocs(collection(db, "firebaseStats"));
    snap.forEach((doc) => {
      const d = doc.data();
      acumulado.lecturas += d.lecturas || 0;
      acumulado.escrituras += d.escrituras || 0;
      acumulado.borrados += d.borrados || 0;
      acumulado.almacenamientoNeto += (d.escrituras || 0) - (d.borrados || 0); // Neto por turno
      acumulado.transferencia += parseInt(d.transferencia) || 0;
    });
  } catch (err) {
    console.error("Error obteniendo histórico Firebase:", err);
  }

  return acumulado;
}

/**
 * Resetear contadores al iniciar turno nuevo
 */
export function iniciarNuevoTurno() {
  resetFirebaseMetrics();
}
