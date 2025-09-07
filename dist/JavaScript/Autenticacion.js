// JavaScript/autenticacion.js
import { 
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs 
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { app } from "./Conexion.js";
import { 
    mostrarAdvertencia, 
    mostrarCargando, 
    mostrarExito, 
    mostrarError, 
    mostrarInfo,
    cerrarModal 
} from "./SweetAlertManager.js";

const auth = getAuth(app);
const db = getFirestore(app);

/**
 * Verifica automáticamente si hay una sesión activa y un turno activo
 */
export function verificarSesionAutomatica() {
    console.log('🔵 verificarSesionAutomatica: Iniciando verificación...');
    
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            console.log('🔵 onAuthStateChanged disparado, user:', user ? user.email : 'null');
            
            if (user) {
                console.log("✅ Usuario autenticado encontrado:", user.email);
                
                try {
                    // Buscar turno activo del usuario
                    const q = query(
                        collection(db, "turnos"),
                        where("usuario", "==", user.email),
                        where("estado", "==", "activo")
                    );
                    console.log('🔵 Buscando turno activo para:', user.email);
                    
                    const querySnapshot = await getDocs(q);
                    console.log('🔵 Resultado query turnos:', querySnapshot.size, 'documentos');
                    
                    if (!querySnapshot.empty) {
                        // Turno activo encontrado
                        const turnoActivo = querySnapshot.docs[0].data();
                        localStorage.setItem("idTurno", turnoActivo.idTurno);
                        localStorage.setItem("usuarioActual", user.email);
                        
                        console.log("✅ Turno activo encontrado:", turnoActivo.idTurno);
                        console.log("✅ Datos guardados en localStorage");
                        
                        resolve({ 
                            autenticado: true, 
                            turnoActivo: true, 
                            usuario: user.email, 
                            turno: turnoActivo.idTurno 
                        });
                    } else {
                        // Usuario autenticado pero sin turno activo
                        console.log("Usuario autenticado pero sin turno activo");
                        resolve({ 
                            autenticado: true, 
                            turnoActivo: false, 
                            usuario: user.email, 
                            turno: null 
                        });
                    }
                } catch (error) {
                    console.error("Error al verificar turno:", error);
                    resolve({ 
                        autenticado: true, 
                        turnoActivo: false, 
                        usuario: user.email, 
                        turno: null 
                    });
                }
            } else {
                console.log("No hay usuario autenticado");
                // Limpiar datos locales
                localStorage.removeItem("idTurno");
                localStorage.removeItem("usuarioActual");
                resolve({ 
                    autenticado: false, 
                    turnoActivo: false, 
                    usuario: null, 
                    turno: null 
                });
            }
        });
    });
}

/**
 * Inicia sesión y crea turno si no hay uno activo en Firestore.
 */
export async function iniciarSesion(email, password, recordar) {
    if (!email || !password) {
        mostrarAdvertencia("Campos incompletos", "Por favor completa todos los campos.");
        return;
    }

    // Guardar datos si el usuario marcó "recordar"
    if (recordar) {
        localStorage.setItem("recordar", "true");
        localStorage.setItem("email", email);
        localStorage.setItem("password", password);
    } else {
        localStorage.removeItem("recordar");
        localStorage.removeItem("email");
        localStorage.removeItem("password");
    }

    try {
        mostrarCargando("Iniciando sesión...");

        // Autenticación en Firebase
        await signInWithEmailAndPassword(auth, email, password);
        cerrarModal();

        // Buscar en Firestore si el usuario ya tiene un turno activo
        const q = query(
            collection(db, "turnos"),
            where("usuario", "==", email),
            where("estado", "==", "activo")
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // Si existe un turno activo, usarlo y no crear otro
            const turnoExistente = querySnapshot.docs[0].data();
            localStorage.setItem("idTurno", turnoExistente.idTurno);
            mostrarInfo("Turno activo", turnoExistente.idTurno);
            return;
        }

        // Si no hay turno activo, crear uno nuevo
        const fecha = new Date();
        const idTurno = `${fecha.getFullYear()}-${fecha.getMonth() + 1}-${fecha.getDate()}_${fecha.getHours()}-${fecha.getMinutes()}`;
        const fechaInicio = fecha.toLocaleString("es-CO", { timeZone: "America/Bogota" });

        await setDoc(doc(db, "turnos", idTurno), {
            idTurno,
            usuario: email,
            fechaInicio,
            fechaFin: null,
            estado: "activo"
        });

        localStorage.setItem("idTurno", idTurno);

        mostrarExito("Éxito", "Turno iniciado correctamente");

    } catch (error) {
        mostrarError("Error al iniciar sesión", error.message);
    }
}

/**
 * Cierra sesión y termina el turno activo.
 */
export async function cerrarSesion() {
    try {
        const idTurno = localStorage.getItem("idTurno");
        if (idTurno) {
            const fechaFin = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
            await updateDoc(doc(db, "turnos", idTurno), {
                fechaFin,
                estado: "cerrado"
            });
            localStorage.removeItem("idTurno");
        }

        await signOut(auth);

        mostrarExito("Sesión cerrada", "Has cerrado sesión exitosamente.");

    } catch (error) {
        mostrarError("Error al cerrar sesión", error.message);
    }
}
