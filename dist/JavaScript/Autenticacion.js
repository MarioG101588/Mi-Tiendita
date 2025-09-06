// JavaScript/autenticacion.js
import { 
    getAuth, signInWithEmailAndPassword, signOut 
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs 
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { app } from "./Conexion.js";
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11.10.5/+esm";

const auth = getAuth(app);
const db = getFirestore(app);

/**
 * Inicia sesión y crea turno si no hay uno activo en Firestore.
 */
export async function iniciarSesion(email, password, recordar) {
    if (!email || !password) {
        Swal.fire("Campos incompletos", "Por favor completa todos los campos.", "warning");
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
        Swal.fire({
            title: 'Iniciando sesión...',
            text: 'Por favor, espere un momento.',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        // Autenticación en Firebase
        await signInWithEmailAndPassword(auth, email, password);
        Swal.close();

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
            Swal.fire("Turno activo", turnoExistente.idTurno, "info");
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

        Swal.fire("Éxito", "Turno iniciado correctamente", "success");

    } catch (error) {
        Swal.fire("Error al iniciar sesión", error.message, "error");
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

        Swal.fire("Sesión cerrada", "Has cerrado sesión exitosamente.", "success");

    } catch (error) {
        Swal.fire("Error al cerrar sesión", error.message, "error");
    }
}
