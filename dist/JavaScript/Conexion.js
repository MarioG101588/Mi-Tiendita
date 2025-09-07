// JavaScript/Conexion.js
// Configuración y conexión a Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
// Importa todo lo necesario de Firestore
import {
    getFirestore, 
    collection,
    increment, 
    doc, 
    addDoc, 
    setDoc, 
    getDoc, 
    updateDoc,
    arrayUnion, 
    runTransaction, 
    serverTimestamp,
    deleteDoc,
    connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCygT0WyAVlV_AvlOXSPyQht6KlpALPZ10",
    authDomain: "poss25.firebaseapp.com",
    projectId: "poss25",
    storageBucket: "poss25.appspot.com",
    messagingSenderId: "797163205747",
    appId: "1:797163205747:web:7455fe43c4683c59aee606"
};

// Inicializar Firebase y exportar instancias
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Configuración para desarrollo local - MODO DIAGNÓSTICO
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    console.log('🔧 Modo desarrollo detectado - Firebase OAuth warnings visibles para diagnóstico');
    
    // Para desarrollo local, configuramos la auth
    try {
        auth.settings = {
            appVerificationDisabledForTesting: true
        };
    } catch (error) {
        console.log('ℹ️ Emuladores ya configurados:', error.message);
    }
}

// Exporta las funciones de Firestore para usarlas en otros módulos
export { 
    collection, 
    doc,
    increment, 
    addDoc, 
    setDoc, 
    getDoc, 
    updateDoc,
    arrayUnion, 
    runTransaction, 
    serverTimestamp,
    deleteDoc,
    connectFirestoreEmulator
};