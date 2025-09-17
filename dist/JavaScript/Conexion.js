// JavaScript/Conexion.js
// Configuración y conexión a Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";



const firebaseConfig = {
    apiKey: "AIzaSyCygT0WyAVlV_AvlOXSPyQht6KlpALPZ10",
    authDomain: "poss25.firebaseapp.com",
    projectId: "poss25",
    storageBucket: "poss25.appspot.com",
    messagingSenderId: "797163205747",
    appId: "1:797163205747:web:7455fe43c4683c59aee606"
};

// Inicializar
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ============================
// Wrappers para monitoreo
// ============================
export async function wrappedAddDoc(ref, data) {
  console.log("📥 addDoc:", ref.path, data);
  return await addDoc(ref, data);
}

export async function wrappedSetDoc(ref, data, options) {
  console.log("✏️ setDoc:", ref.path, data, options);
  return await setDoc(ref, data, options);
}

export async function wrappedGetDocs(q) {
  console.log("🔎 getDocs:", q);
  return await getDocs(q);
}

// 🔹 Exportar helpers Firestore (si los usas en otros módulos)
export {
  collection,
  doc,
  query,
  orderBy,
  limit,
  serverTimestamp
};