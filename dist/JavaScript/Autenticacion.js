import { 
    getAuth, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, updateDoc, collection, query, where, getDocs 
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { app } from "./Conexion.js";
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11.10.5/+esm";

const auth = getAuth(app);
const db = getFirestore(app);

/**
 * Inicia sesión y crea turno si no hay uno activo en Firestore.
 */
export async function iniciarSesion(email, password, recordar) {
    //console.log("📌 iniciarSesion() ejecutada");
    //console.log("✉️ Email recibido:", email);
    //console.log("🔑 Password recibido:", password ? "(oculto)" : "(vacío)");

    // 🚫 Validar campos vacíos y cortar de inmediato
    if (!email?.trim() || !password?.trim()) {
        //console.log("⚠️ Campos incompletos detectados → deteniendo flujo");
        await Swal.fire({
            icon: "warning",
            title: "Campos incompletos",
            text: "Por favor completa todos los campos."
        });
        //console.log("⛔ Retornando por campos vacíos y bloqueando flujo");
        throw new Error("Intento de inicio de sesión con campos vacíos"); // 🔒 Bloquea cualquier ejecución posterior
    }

    try {
        //console.log("🛠 Configurando persistencia de sesión...");
        await setPersistence(auth, browserLocalPersistence);

        //console.log("⏳ Mostrando modal de carga...");
        Swal.fire({
            title: 'Iniciando sesión...',
            text: 'Por favor, espere un momento.',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        //console.log("🚀 Intentando login con Firebase...");
        const userCredential = await signInWithEmailAndPassword(auth, email, password);

        if (!userCredential.user) {
            //console.log("❌ No se obtuvo usuario de Firebase");
            Swal.close();
            await Swal.fire("Error", "No se pudo autenticar el usuario.", "error");
            return false;
        }

        //console.log("✅ Usuario autenticado:", userCredential.user.uid);
        Swal.close();

        if (recordar) {
            //console.log("💾 Guardando credenciales en localStorage");
            localStorage.setItem("recordar", "true");
            localStorage.setItem("email", email);
            localStorage.setItem("password", password);
        } else {
            //console.log("🗑 Eliminando credenciales de localStorage");
            localStorage.removeItem("recordar");
            localStorage.removeItem("email");
            localStorage.removeItem("password");
        }

        //console.log("🔍 Buscando turno activo en Firestore...");
        const q = query(
            collection(db, "turnos"),
            where("usuario", "==", email),
            where("estado", "==", "activo")
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            //console.log("📂 Turno activo encontrado");
            const turnoExistente = querySnapshot.docs[0].data();
            localStorage.setItem("idTurno", turnoExistente.idTurno);
            await Swal.fire("Turno activo", turnoExistente.idTurno, "info");
            return true;
        }

        //console.log("🆕 Creando nuevo turno...");
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
        //console.log("✅ Turno creado:", idTurno);
        await Swal.fire("Éxito", "Turno iniciado correctamente", "success");
        return true;

    } catch (error) {
        //console.log("💥 Error durante el login:", error);
        Swal.close();
        await Swal.fire("Error al iniciar sesión", error.message, "error");
        return false;
    }
}

/**
 * Cierra sesión y termina el turno activo.
 */
export async function cerrarSesion() {
    //console.log("📌 cerrarSesion() ejecutada");
    try {
        const idTurno = localStorage.getItem("idTurno");
        if (idTurno) {
            //console.log("📝 Cerrando turno activo:", idTurno);
            const fechaFin = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
            await updateDoc(doc(db, "turnos", idTurno), {
                fechaFin,
                estado: "cerrado"
            });
            localStorage.removeItem("idTurno");
        }

        //console.log("🚪 Cerrando sesión de Firebase...");
        await signOut(auth);

        Swal.fire("Sesión cerrada", "Has cerrado sesión exitosamente.", "success");
    } catch (error) {
        //console.log("💥 Error al cerrar sesión:", error);
        Swal.fire("Error al cerrar sesión", error.message, "error");
    }
}
