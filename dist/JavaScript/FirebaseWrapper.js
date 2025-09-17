// FirebaseWrapper.js
// Envoltorio para las funciones de Firestore con registro de métricas

import {
  getFirestore, doc, getDoc, setDoc, addDoc,
  updateDoc, deleteDoc, collection, query, where, getDocs,
  runTransaction, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { registrarOperacion } from "./FirebaseMetrics.js";

export const db = getFirestore();

// GET
export async function wrappedGetDoc(ref) {
  const snap = await getDoc(ref);
  const size = snap.exists() ? JSON.stringify(snap.data()).length / 1024 : 0;
  registrarOperacion("lectura", size);
  return snap;
}

export async function wrappedGetDocs(q) {
  const snap = await getDocs(q);
  let totalSize = 0;
  snap.forEach(doc => {
    totalSize += JSON.stringify(doc.data()).length / 1024;
  });
  registrarOperacion("lectura", totalSize);
  return snap;
}

// ADD
export async function wrappedAddDoc(colRef, data) {
  registrarOperacion("escritura", JSON.stringify(data).length / 1024);
  return addDoc(colRef, data);
}

export async function wrappedSetDoc(ref, data) {
  registrarOperacion("escritura", JSON.stringify(data).length / 1024);
  return setDoc(ref, data);
}

export async function wrappedUpdateDoc(ref, data) {
  registrarOperacion("escritura", JSON.stringify(data).length / 1024);
  return updateDoc(ref, data);
}

// DELETE
export async function wrappedDeleteDoc(ref) {
  // Estimar tamaño del documento a borrar (requiere leerlo primero para precisión)
  const snap = await getDoc(ref);
  const size = snap.exists() ? JSON.stringify(snap.data()).length / 1024 : 0;
  registrarOperacion("borrado", size);
  return deleteDoc(ref);
}

// Reexporta lo demás para usarlos normal
export {
  doc, collection, query, where
};

// TRANSACTION
export async function wrappedRunTransaction(db, updateFunction, options = {}) {
  // Estimar operaciones basadas en opciones (opcional: { lecturas: N, escrituras: M })
  const lecturasEstimadas = options.lecturas || 0;
  const escriturasEstimadas = options.escrituras || 0;
  const borradosEstimados = options.borrados || 0;
  
  // Registrar estimaciones antes de ejecutar
  if (lecturasEstimadas > 0) registrarOperacion("lectura", lecturasEstimadas * 1); // Estimar 1KB por lectura
  if (escriturasEstimadas > 0) registrarOperacion("escritura", escriturasEstimadas * 1);
  if (borradosEstimados > 0) registrarOperacion("borrado", borradosEstimados * 1);
  
  return runTransaction(db, updateFunction);
}

// ONSNAPSHOT
export function wrappedOnSnapshot(query, callback, options) {
  return onSnapshot(query, (snapshot) => {
    // Registrar cada snapshot como una lectura
    let totalSize = 0;
    snapshot.forEach(doc => {
      totalSize += JSON.stringify(doc.data()).length / 1024;
    });
    registrarOperacion("lectura", totalSize);
    
    // Ejecutar el callback original
    callback(snapshot);
  }, options);
}
