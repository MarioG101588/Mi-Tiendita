import {getAuth,  signInWithEmailAndPassword, signOut, setPersistence, onAuthStateChanged, browserLocalPersistence} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {getFirestore,serverTimestamp, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { app } from "./Conexion.js"; // Asegúrate que la ruta a tu archivo de conexión sea correcta.
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11.10.5/+esm";

const auth = getAuth(app);
const db = getFirestore(app);

// Configurar persistencia
setPersistence(auth, browserLocalPersistence).catch(console.error);

/**
 * Observador de sesión: actualiza la UI y limpia localStorage al cerrar sesión.
 */
export function observarSesion(callback) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      // Usuario no autenticado: limpiar turno y actualizar UI
      localStorage.removeItem("idTurno");
      document.querySelectorAll('.container, .container1, .container2, .container3, .container4, .container5, .container6')
        .forEach(el => el.style.display = 'none');
      if (document.getElementById('container')) {
        document.getElementById('container').style.display = 'block';
      }
      if (document.getElementById('loginButton')) {
        document.getElementById('loginButton').style.display = 'inline-block';
      }
      if (document.getElementById('loginForm')) {
        document.getElementById('loginForm').style.display = 'none';
      }
    }
    if (callback) callback(user);
  });
}

/**
 * Inicia sesión, verifica el estado del usuario en Firebase y crea un turno si es necesario.
 * Las notificaciones se manejan exclusivamente con SweetAlert2.
 * @param {string} email - Correo electrónico del usuario.
 * @param {string} password - Contraseña del usuario.
 * @param {boolean} recordar - Opción para guardar las credenciales.
 * @returns {Promise<string|null>} - Retorna el idTurno si el inicio de sesión fue exitoso, de lo contrario null.
 */
export async function iniciarSesion(email, password, recordar) {
    if (!email?.trim() || !password?.trim()) {
        await Swal.fire({
            icon: "warning",
            title: "Campos incompletos",
            text: "Por favor, ingresa tu correo y contraseña."
        });
        return null;
    }

    Swal.fire({
        title: 'Iniciando sesión...',
        text: 'Por favor, espera un momento.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        await setPersistence(auth, browserLocalPersistence);
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const user = cred.user;

        if (!user.emailVerified) {
            await signOut(auth);
            Swal.close();
            await Swal.fire({
                icon: 'error',
                title: 'Verificación requerida',
                text: 'Tu cuenta de correo no ha sido verificada. Por favor, revisa tu bandeja de entrada.'
            });
            return null;
        }

const usuarioRef = doc(db, "usuarios", email);
    const usuarioSnap = await getDoc(usuarioRef);

    if (usuarioSnap.exists()) {
        const data = usuarioSnap.data();
        if (data.sesionActiva) {
            await Swal.fire({
                icon: 'error',
                title: 'Sesión activa',
                text: 'Este usuario ya tiene una sesión activa en otro dispositivo.'
            });
            return null;
        }
    }        
        const { nombre, role } = usuarioSnap.data();
        const usuarioConcatenado = `${nombre}${role}`;

        if (recordar) {
            localStorage.setItem("recordar", "true");
            localStorage.setItem("email", email);
        } else {
            localStorage.removeItem("recordar");
            localStorage.removeItem("email");
        }

        // Buscar turno activo
        const q = query(
            collection(db, "turnos"),
            where("usuario", "==", email),
            where("estado", "==", "Activo")
        );
        const querySnapshot = await getDocs(q);
        
        let idTurno;

if (!querySnapshot.empty) {
    // Guarda el ID real del documento, no el campo interno
    idTurno = querySnapshot.docs[0].id;
    await Swal.fire({
        icon: 'info',
        title: 'Turno ya Activo',
        text: `Se encontró el turno Activo: ${idTurno}`
    });
} else {
    idTurno = `${usuarioConcatenado}_${Date.now()}`;
    const fechaInicio = serverTimestamp();
    await setDoc(doc(db, "turnos", idTurno), {
        idTurno,
        usuario: email,
        fechaInicio,
        fechaFin: null,
        estado: "Activo"
    });
    await Swal.fire({
        icon: 'success',
        title: '¡Bienvenido!',
        text: 'Turno iniciado correctamente.'
    });
    const sesionToken = Date.now().toString() + Math.random().toString(36).substring(2);
    await updateDoc(usuarioRef, {
        sesionActiva: true,
        sesionToken
    });
}
localStorage.setItem("idTurno", idTurno);
        Swal.close();
        return idTurno;

    } catch (error) {
        Swal.close();
        let tituloError = "Error al iniciar sesión";
        let mensajeError = "Ocurrió un error inesperado. Por favor, inténtalo de nuevo.";
        await Swal.fire(tituloError, mensajeError, "error");
        return null;
    }
}

/**
 * Cierra la sesión del usuario en Firebase y finaliza el turno Activo en Firestore.
 * El cierre global lo ejecuta el listener de sesión (onAuthStateChanged).
 */
export async function cerrarSesionConConfirmacion() {
    const confirmacion = await Swal.fire({
        title: "¿Cerrar sesión?",
        text: "Esto cerrará el turno actual y finalizará la sesión en todos los dispositivos.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sí, cerrar sesión",
        cancelButtonText: "Cancelar"
    });

   if (!confirmacion.isConfirmed) {
        return false;
    }

    const idTurno = localStorage.getItem("idTurno");
    const email = auth.currentUser?.email;

    if (idTurno && email) {
        try {
            const fechaFin = serverTimestamp();
            const turnoRef = doc(db, "turnos", idTurno);
            const usuarioRef = doc(db, "usuarios", email);

            // 1. Actualiza el turno
            await updateDoc(turnoRef, {
                fechaFin,
                estado: "Cerrado"
            });

            // 2. Actualiza el usuario
            await updateDoc(usuarioRef, {
                sesionActiva: false,
                sesionToken: ""
            });

            // 3. SOLO DESPUÉS de que todo se haya actualizado, cierra la sesión
            await signOut(auth);
            return true;

        } catch (error) {
            console.error("Error al cerrar sesión y actualizar datos:", error);
            await Swal.fire('Error', 'No se pudo finalizar el turno correctamente.', 'error');
            // Si hay un error, no cierres la sesión para que el usuario pueda reintentar
            return false;
        }
    } else {
        // Si no hay turno o email, simplemente cierra la sesión
        await signOut(auth);
        return true;
    }
}