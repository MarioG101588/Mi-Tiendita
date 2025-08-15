// JavaScript/Conexion.js
// Configuración y conexión a Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
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
    deleteDoc // <--- ¡Asegúrate de importar deleteDoc aquí!
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
    deleteDoc // <--- Y exporta deleteDoc aquí
};