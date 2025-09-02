// === IMPORTACIONES REQUERIDAS ===
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import { app } from "./Conexion.js";

// === INICIALIZACIÓN DE SERVICIOS ===
const auth = getAuth(app);

// === ESTADO INTERNO DEL MÓDULO ===
let currentUser = null;
let authStateListeners = new Set();
let authReadyPromise = null;
let authReady = false; // CORREGIDO: Cambiar nombre de variable

// === CONSTANTES DE CONFIGURACIÓN ===
const STORAGE_KEYS = {
    REMEMBER_EMAIL: 'pos_remember_email',
    REMEMBER_FLAG: 'pos_remember_credentials',
    TURNO_ID: 'pos_current_turno_id',
    USER_DATA: 'pos_user_data'
};

const ERRORES_AUTH = {
    USER_NOT_FOUND: 'auth/user-not-found',
    WRONG_PASSWORD: 'auth/wrong-password', 
    TOO_MANY_REQUESTS: 'auth/too-many-requests',
    NETWORK_ERROR: 'auth/network-request-failed',
    INVALID_EMAIL: 'auth/invalid-email',
    USER_DISABLED: 'auth/user-disabled',
    WEAK_PASSWORD: 'auth/weak-password',
    EMAIL_ALREADY_IN_USE: 'auth/email-already-in-use'
};

const MENSAJES_ERROR = {
    [ERRORES_AUTH.USER_NOT_FOUND]: 'Usuario no encontrado',
    [ERRORES_AUTH.WRONG_PASSWORD]: 'Contraseña incorrecta',
    [ERRORES_AUTH.TOO_MANY_REQUESTS]: 'Demasiados intentos fallidos. Intenta más tarde',
    [ERRORES_AUTH.NETWORK_ERROR]: 'Error de conexión. Verifica tu internet',
    [ERRORES_AUTH.INVALID_EMAIL]: 'Formato de email inválido',
    [ERRORES_AUTH.USER_DISABLED]: 'Esta cuenta ha sido deshabilitada',
    [ERRORES_AUTH.WEAK_PASSWORD]: 'La contraseña debe tener al menos 6 caracteres',
    [ERRORES_AUTH.EMAIL_ALREADY_IN_USE]: 'Este email ya está registrado'
};

// === FUNCIONES DE VALIDACIÓN ===
function validarEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validarPassword(password) {
    return password && password.length >= 6;
}

// === FUNCIONES PRINCIPALES ===

/**
 * Inicializa el sistema de autenticación
 * @returns {Promise<Object>} Resultado de la inicialización
 */
export function inicializarAuth() {
    if (authReadyPromise) return authReadyPromise;
    
    authReadyPromise = new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            currentUser = user;
            
            if (!authReady) {
                authReady = true; // CORREGIDO: Usar variable corregida
                console.log('🔐 Sistema de autenticación inicializado');
                resolve({
                    success: true,
                    user: user,
                    message: 'Autenticación inicializada'
                });
            }
            
            // Notificar a todos los listeners
            authStateListeners.forEach(listener => {
                try {
                    listener(user);
                } catch (error) {
                    console.error('Error en listener de auth:', error);
                }
            });
        });
        
        // Timeout de seguridad
        setTimeout(() => {
            if (!authReady) {
                authReady = true; // CORREGIDO: Usar variable corregida
                console.warn('⚠️ Timeout en inicialización de auth');
                resolve({
                    success: false,
                    message: 'Timeout en inicialización'
                });
            }
        }, 10000);
    });
    
    return authReadyPromise;
}

/**
 * Inicia sesión con email y contraseña
 * @param {string} email - Email del usuario
 * @param {string} password - Contraseña del usuario
 * @param {boolean} recordar - Si debe recordar las credenciales
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function iniciarSesion(email, password, recordar = false) {
    try {
        // Validar parámetros
        if (!validarEmail(email)) {
            throw {
                code: ERRORES_AUTH.INVALID_EMAIL,
                message: MENSAJES_ERROR[ERRORES_AUTH.INVALID_EMAIL]
            };
        }
        
        if (!validarPassword(password)) {
            throw {
                code: ERRORES_AUTH.WEAK_PASSWORD,
                message: 'La contraseña es requerida'
            };
        }
        
        console.log('🔐 Iniciando sesión...');
        
        // Intentar iniciar sesión
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Gestionar credenciales recordadas
        if (recordar) {
            localStorage.setItem(STORAGE_KEYS.REMEMBER_EMAIL, email);
            localStorage.setItem(STORAGE_KEYS.REMEMBER_FLAG, 'true');
        } else {
            localStorage.removeItem(STORAGE_KEYS.REMEMBER_EMAIL);
            localStorage.removeItem(STORAGE_KEYS.REMEMBER_FLAG);
        }
        
        // Generar ID de turno
        const turnoId = `turno_${Date.now()}_${user.uid.substring(0, 8)}`;
        localStorage.setItem(STORAGE_KEYS.TURNO_ID, turnoId);
        
        // Guardar datos del usuario
        const userData = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            lastLogin: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
        
        currentUser = user;
        
        console.log('✅ Sesión iniciada correctamente');
        
        return {
            success: true,
            user: {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName
            },
            turnoId,
            message: 'Sesión iniciada correctamente'
        };
        
    } catch (error) {
        console.error('❌ Error iniciando sesión:', error);
        
        const errorCode = error.code || 'unknown';
        const errorMessage = MENSAJES_ERROR[errorCode] || error.message || 'Error desconocido al iniciar sesión';
        
        throw {
            code: errorCode,
            message: errorMessage,
            originalError: error
        };
    }
}

/**
 * Cierra la sesión actual
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function cerrarSesion() {
    try {
        console.log('🔐 Cerrando sesión...');
        
        await signOut(auth);
        
        // Limpiar datos locales (excepto credenciales recordadas)
        const recordarCredenciales = localStorage.getItem(STORAGE_KEYS.REMEMBER_FLAG) === 'true';
        
        localStorage.removeItem(STORAGE_KEYS.TURNO_ID);
        localStorage.removeItem(STORAGE_KEYS.USER_DATA);
        
        if (!recordarCredenciales) {
            localStorage.removeItem(STORAGE_KEYS.REMEMBER_EMAIL);
        }
        
        currentUser = null;
        
        console.log('✅ Sesión cerrada correctamente');
        
        return {
            success: true,
            message: 'Sesión cerrada correctamente'
        };
        
    } catch (error) {
        console.error('❌ Error cerrando sesión:', error);
        
        throw {
            code: 'auth/signout-error',
            message: 'Error al cerrar sesión',
            originalError: error
        };
    }
}

/**
 * Observa cambios en el estado de autenticación
 * @param {Function} callback - Función a ejecutar cuando cambie el estado
 * @returns {Function} Función para cancelar la observación
 */
export function observarSesion(callback) {
    if (typeof callback !== 'function') {
        throw new Error('El callback debe ser una función');
    }
    
    authStateListeners.add(callback);
    
    // Si ya está inicializado, llamar callback inmediatamente
    if (authReady) {
        setTimeout(() => callback(currentUser), 0);
    }
    
    // Retornar función para desuscribirse
    return () => {
        authStateListeners.delete(callback);
    };
}

/**
 * Obtiene el usuario currente
 * @returns {Object|null} Usuario actual o null
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * Obtiene el ID del turno actual
 * @returns {string|null} ID del turno actual
 */
export function getCurrentTurnoId() {
    return localStorage.getItem(STORAGE_KEYS.TURNO_ID);
}

/**
 * Verifica si hay un usuario autenticado
 * @returns {boolean} True si hay usuario autenticado
 */
export function estaAutenticado() {
    return !!currentUser;
}

/**
 * Obtiene las credenciales recordadas
 * @returns {Object} Credenciales recordadas
 */
export function getRememberedCredentials() {
    const recordar = localStorage.getItem(STORAGE_KEYS.REMEMBER_FLAG) === 'true';
    const email = recordar ? localStorage.getItem(STORAGE_KEYS.REMEMBER_EMAIL) : '';
    
    return {
        recordar,
        email: email || ''
    };
}

/**
 * Espera a que la autenticación esté lista
 * @returns {Promise<boolean>} True cuando esté lista
 */
export function esperarAuth() {
    if (authReady) return Promise.resolve(true);
    return inicializarAuth().then(() => true);
}

// === INICIALIZACIÓN AUTOMÁTICA ===
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        inicializarAuth();
    });
}

// === EXPORTACIONES DE CONSTANTES ===
export { ERRORES_AUTH, MENSAJES_ERROR };