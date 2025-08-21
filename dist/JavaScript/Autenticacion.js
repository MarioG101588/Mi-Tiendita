import {getAuth, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {getFirestore,serverTimestamp, doc, setDoc, updateDoc, collection, query, where, getDocs} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { app } from "./Conexion.js"; // Asegúrate que la ruta a tu archivo de conexión sea correcta.
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11.10.5/+esm";

const auth = getAuth(app);
const db = getFirestore(app);

/**
 * Inicia sesión, verifica el estado del usuario en Firebase y crea un turno si es necesario.
 * Las notificaciones se manejan exclusivamente con SweetAlert2.
 * @param {string} email - Correo electrónico del usuario.
 * @param {string} password - Contraseña del usuario.
 * @param {boolean} recordar - Opción para guardar las credenciales.
 * @returns {Promise<boolean>} - Retorna true si el inicio de sesión fue exitoso, de lo contrario false.
 */
export async function iniciarSesion(email, password, recordar) {
    // 1. Validación inicial de campos
    if (!email?.trim() || !password?.trim()) {
        await Swal.fire({
            icon: "warning",
            title: "Campos incompletos",
            text: "Por favor, ingresa tu correo y contraseña."
        });
        return false; // Detiene la ejecución si los campos están vacíos
    }

    // 2. Modal de carga mientras se procesa la solicitud
    Swal.fire({
        title: 'Iniciando sesión...',
        text: 'Por favor, espera un momento.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        // 3. Configuración de persistencia de la sesión
        await setPersistence(auth, browserLocalPersistence);

        // 4. Intento de autenticación con Firebase
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 5. VERIFICACIÓN CRÍTICA: El usuario debe tener el email confirmado
        if (!user.emailVerified) {
            await signOut(auth); // Cerramos la sesión inmediatamente
            Swal.close(); // Cerramos el modal de carga
            await Swal.fire({
                icon: 'error',
                title: 'Verificación requerida',
                text: 'Tu cuenta de correo no ha sido verificada. Por favor, revisa tu bandeja de entrada y confirma tu cuenta antes de iniciar sesión.',
            });
            return false; // Bloqueamos el acceso
        }

        // Si el usuario está verificado, procedemos a gestionar el turno
        Swal.close();

        // 6. Manejo de la opción "Recordar"
        if (recordar) {
            localStorage.setItem("recordar", "true");
            localStorage.setItem("email", email);
            //localStorage.setItem("password", password);
        } else {
            localStorage.removeItem("recordar");
            localStorage.removeItem("email");
            //localStorage.removeItem("password");
        }

        // 7. Búsqueda de un turno activo en Firestore
        const q = query(
            collection(db, "turnos"),
            where("usuario", "==", email),
            where("estado", "==", "activo")
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const turnoExistente = querySnapshot.docs[0].data();
            localStorage.setItem("idTurno", turnoExistente.idTurno);
            await Swal.fire({
                icon: 'info',
                title: 'Turno ya activo',
                text: `Se encontró el turno activo: ${turnoExistente.idTurno}`
            });
        } else {
            // 8. Creación de un nuevo turno si no hay uno activo
            const idTurno = `${email}_${Date.now()}`; // ✅ más seguro que fecha formateada
            const fechaInicio = serverTimestamp();    // ✅ sin parámetros

            await setDoc(doc(db, "turnos", idTurno), {
                idTurno,
                usuario: email,
                fechaInicio,
                fechaFin: null,
                estado: "activo"
            });

            localStorage.setItem("idTurno", idTurno);
            await Swal.fire({
                icon: 'success',
                title: '¡Bienvenido!',
                text: 'Turno iniciado correctamente.'
            });
        }

        return true; // Inicio de sesión exitoso

    } catch (error) {
        Swal.close(); // Cierra el modal de carga en caso de error
        
        // 9. Manejo de errores específicos de Firebase Auth
        let tituloError = "Error al iniciar sesión";
        let mensajeError = "Ocurrió un error inesperado. Por favor, inténtalo de nuevo.";

        switch (error.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                tituloError = "Credenciales incorrectas";
                mensajeError = "El correo electrónico o la contraseña no son correctos. Por favor, verifica tus datos.";
                break;
            case 'auth/too-many-requests':
                tituloError = "Demasiados intentos";
                mensajeError = "El acceso a esta cuenta ha sido temporalmente deshabilitado debido a muchos intentos fallidos. Puedes restaurarlo restableciendo tu contraseña o intentarlo más tarde.";
                break;
            case 'auth/network-request-failed':
                tituloError = "Error de red";
                mensajeError = "No se pudo conectar con el servidor. Revisa tu conexión a internet.";
                break;
            default:
                // Para otros errores, se puede mostrar el mensaje genérico o el de Firebase
                mensajeError = error.message;
                console.error("Error no controlado en login:", error);
                break;
        }

        await Swal.fire(tituloError, mensajeError, "error");
        return false; // Inicio de sesión fallido
    }
}

/**
 * Cierra la sesión del usuario en Firebase y finaliza el turno activo en Firestore.
 */
export async function cerrarSesionConConfirmacion() {
    const confirmacion = await Swal.fire({
        title: "¿Cerrar sesión?",
        text: "Esto cerrará el turno actual y no podrás modificarlo después. ¿Deseas continuar?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sí, cerrar sesión",
        cancelButtonText: "Cancelar"
    });
    if (!confirmacion.isConfirmed) {
        return false; // El usuario canceló la acción
    }
    const idTurno = localStorage.getItem("idTurno");
    if (idTurno) {
        const fechaFin = serverTimestamp();   // ✅ sin parámetros
        await updateDoc(doc(db, "turnos", idTurno), {
            fechaFin,
            estado: "cerrado"
        });
        localStorage.removeItem("idTurno");
    }

    await signOut(auth);

    await Swal.fire({
        icon: 'success',
        title: 'Sesión cerrada',
        text: 'Has cerrado sesión exitosamente.'
    });
    return true;

}