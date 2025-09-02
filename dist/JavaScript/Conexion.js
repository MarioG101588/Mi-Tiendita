// === CONFIGURACIÓN Y CONEXIÓN A FIREBASE ===
// Este módulo centraliza toda la lógica de conexión con Firebase
// y proporciona una instancia configurada y validada para el resto de la aplicación

// Importaciones de Firebase v11
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// === CONFIGURACIÓN REAL DESDE EL ARCHIVO TXT ===
const firebaseConfig = {
    apiKey: "AIzaSyCygT0WyAVlV_AvlOXSPyQht6KlpALPZ10",
    authDomain: "poss25.firebaseapp.com", 
    projectId: "poss25",
    storageBucket: "poss25.appspot.com",
    messagingSenderId: "797163205747",
    appId: "1:797163205747:web:7455fe43c4683c59aee606"
};

// Inicializar Firebase
let app = null;
let auth = null;
let db = null;

try {
    const existingApps = getApps();
    if (existingApps.length > 0) {
        app = existingApps[0];
    } else {
        app = initializeApp(firebaseConfig);
    }
    
    auth = getAuth(app);
    db = getFirestore(app);
    
    console.log('✅ Firebase inicializado correctamente');
} catch (error) {
    console.error('❌ Error inicializando Firebase:', error);
}

export { app, auth, db };