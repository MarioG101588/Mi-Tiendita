import { obtenerResumenTurno, renderizarResumenTurno } from "./ResumenTurno.js";
// JavaScript/main.js
// Este es el archivo principal que se encargará de importar las funciones de los otros archivos
// y manejar los eventos de la interfaz (botones, inputs, etc.).

// Importaciones de módulos locales
import { iniciarSesion, cerrarSesion as cerrarSesionAuth, verificarSesionAutomatica } from "./Autenticacion.js";
import { cargarInventario, ocultarInventario } from "./Inventario.js";
import { agregarAlCarrito, aumentarCantidad, disminuirCantidad, quitarDelCarrito, renderCarrito } from "./CarritoCompras.js";
import { realizarVenta } from "./VentasApp.js";
import { db } from './Conexion.js';
import { cargarDetalleCuenta } from "./Cuentas.js";

// IMPORTACIONES de Firebase para la funcionalidad de cuentas
import { collection, onSnapshot, query, doc, updateDoc, getDocs } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11.10.5/+esm";

// **FUNCIÓN UTILITARIA PARA CONVERTIR idTurno A FECHA LEGIBLE**
function convertirIdTurnoAFecha(idTurno) {
    if (!idTurno || idTurno === 'Sin turno') return 'Sin fecha';
    
    try {
        // Formato esperado: "2025-9-7_10-18" 
        const partes = idTurno.split('_')[0]; // Tomar solo la parte de fecha: "2025-9-7"
        const [año, mes, dia] = partes.split('-');
        
        // Crear objeto Date
        const fecha = new Date(parseInt(año), parseInt(mes) - 1, parseInt(dia));
        
        // Formatear a español
        const opciones = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        
        return fecha.toLocaleDateString('es-ES', opciones);
    } catch (error) {
        console.error('Error al convertir idTurno a fecha:', error);
        return 'Fecha inválida';
    }
}

// Exportar funciones del carrito al ámbito global
// Redefinir agregarAlCarrito para limpiar buscador y ocultar inventario tras agregar
window.agregarAlCarrito = function(id, precioVenta) {
    agregarAlCarrito(id, precioVenta);
    // Limpiar buscador y ocultar inventario
    const campoBusqueda1 = document.getElementById("campoBusqueda1");
    if (campoBusqueda1) campoBusqueda1.value = "";
    ocultarInventario();
};
window.aumentarCantidad = aumentarCantidad;
window.disminuirCantidad = disminuirCantidad;
window.quitarDelCarrito = quitarDelCarrito;
window.renderCarrito = renderCarrito;
window.realizarVenta = () => realizarVenta(window.carrito);

// **FUNCIÓN PARA CARGAR CUENTAS ABIERTAS**
function cargarCuentasAbiertas() {
    const q = query(collection(db, "cuentasActivas"));
    const container = document.getElementById('cuentasActivasTurno');
    const idTurno = localStorage.getItem("idTurno");
    if (!container) {
        console.error("El contenedor para las cuentas activas no fue encontrado.");
        return;
    }
    onSnapshot(q, async (querySnapshot) => {
        console.log('cargarCuentasAbiertas ejecutándose...');
        console.log('ID Turno actual:', idTurno);
        let htmlContent = '';
        let pendientes = [];
        let activas = [];
        // Clasificar cuentas
        for (const docSnap of querySnapshot.docs) {
            const cuenta = docSnap.data();
            const clienteId = docSnap.id;
            console.log('Procesando cuenta:', clienteId, 'Turno de cuenta:', cuenta.turno, 'Tipo:', cuenta.tipo);
            
            // Lógica corregida: solo actualizar cuentas de turnos anteriores
            if (cuenta.turno && cuenta.turno !== idTurno && cuenta.tipo !== 'En cuaderno') {
                console.log('Actualizando cuenta', clienteId, 'de', cuenta.tipo, 'a "En cuaderno" (turno anterior)');
                try {
                    await updateDoc(doc(collection(db, "cuentasActivas"), clienteId), { tipo: 'En cuaderno' });
                    cuenta.tipo = 'En cuaderno';
                    console.log('Cuenta actualizada exitosamente');
                } catch (error) {
                    console.error('Error al actualizar cuenta:', error);
                }
            }
            
            // Clasificar cuentas: las del turno actual van a activas, el resto a pendientes
            if (cuenta.turno === idTurno && cuenta.tipo !== 'En cuaderno') {
                activas.push({ ...cuenta, id: clienteId });
            } else {
                pendientes.push({ ...cuenta, id: clienteId });
            }
        }
        // Mostrar nota si hay pendientes
        if (pendientes.length > 0) {
            htmlContent += `<div class="alert alert-warning cuenta-pendiente-alert" onclick="window.mostrarCuentasPendientes()">
                📋 Aquí hay <b>${pendientes.length}</b> cuenta(s) pendiente(s). Haz clic para verlas.
            </div>`;
        }
        
        // Actualizar variable global para consistencia
        window._cuentasPendientes = pendientes;
        if (activas.length === 0) {
            htmlContent += "<p>No hay cuentas activas en este momento.</p>";
        } else {
            htmlContent += '<div class="list-group">';
            activas.forEach((cuenta) => {
                const totalFormateado = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(cuenta.total);
                htmlContent += `
                    <div class="list-group-item d-flex justify-content-between align-items-center" 
                         onclick="mostrarDetalleCuenta('${cuenta.id}')"> 
                         <div>
                            <h6 class="mb-0">${cuenta.cliente}</h6>
                            <small class="text-muted">${cuenta.tipo}</small>
                        </div>
                        <span class="badge bg-success rounded-pill fs-6">
                            ${totalFormateado}
                        </span>
                    </div>
                `;
            });
            htmlContent += '</div>';
        }
        container.innerHTML = htmlContent;
    });
}
// Mostrar cuentas pendientes en containerPendientes
window.mostrarCuentasPendientes = function() {
    document.querySelectorAll('.container, .container1, .container2, .container3, .containerPendientes').forEach(el => {
        el.classList.add('d-none');
    });
    document.getElementById('containerPendientes').classList.remove('d-none');
    
    const container = document.getElementById('cuentasPendientesTurno');
    if (!container) {
        console.error("Contenedor cuentasPendientesTurno no encontrado");
        return;
    }
    
    const pendientes = window._cuentasPendientes || [];
    let htmlContent = '';
    
    if (pendientes.length === 0) {
        htmlContent = `
            <div class="alert alert-info text-center">
                <i class="fas fa-info-circle"></i> No hay cuentas pendientes por cobrar.
                <br><small>Las cuentas "En cuaderno" y de turnos anteriores aparecerán aquí.</small>
                <br><br><button class="btn btn-primary" onclick="mostrarContainer('container2')">
                    Ir a Cuentas Activas para actualizar
                </button>
            </div>
        `;
    } else {
        htmlContent = `
            <div class="alert alert-warning">
                <strong>📋 ${pendientes.length} cuenta(s) pendiente(s) encontrada(s)</strong>
                <br><small>Incluye cuentas "En cuaderno" y de turnos anteriores</small>
            </div>
            <div class="list-group">
        `;
        
        pendientes.forEach((cuenta) => {
            const totalFormateado = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(cuenta.total || 0);
            const turnoInfo = cuenta.turno ? convertirIdTurnoAFecha(cuenta.turno) : 'Sin fecha';
            const tipoClase = cuenta.tipo === 'En cuaderno' ? 'text-warning' : 'text-muted';
            
            htmlContent += `
                <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" 
                     onclick="mostrarDetalleCuenta('${cuenta.id}')" class="cuenta-item"> 
                     <div>
                        <h6 class="mb-1">${cuenta.cliente || 'Cliente sin nombre'}</h6>
                        <p class="mb-1 ${tipoClase}"><strong>${cuenta.tipo || 'Sin tipo'}</strong></p>
                        <small class="text-muted">${turnoInfo}</small>
                    </div>
                    <span class="badge bg-success rounded-pill fs-6">
                        ${totalFormateado}
                    </span>
                </div>
            `;
        });
        htmlContent += '</div>';
    }
    container.innerHTML = htmlContent;
};

// Evento que se dispara cuando el DOM está completamente cargado
document.addEventListener("DOMContentLoaded", async function () {
    console.log("🔄 Verificando sesión automáticamente...");
    
    // CONFIGURACIÓN DE ELEMENTOS DE INTERFAZ (SIEMPRE SE EJECUTA)
    const emailInput = document.getElementById("emailinicio");
    const passwordInput = document.getElementById("passwordinicio");
    const recordarCheckbox = document.getElementById("recordarDatos");
    const btnIniciarSesion = document.getElementById("btnIniciarSesion");
    const container = document.getElementById("container");
    const container1 = document.getElementById("container1");
    const loginForm = document.getElementById("loginForm");
    const loginButton = document.getElementById("loginButton");
    const closeButton = document.getElementById("closeButton");
    const campoBusqueda1 = document.getElementById("campoBusqueda1");

    // Configurar eventos del buscador SIEMPRE
    if (campoBusqueda1) {
        campoBusqueda1.addEventListener("input", function() {
            if (this.value.trim()) {
                cargarInventario(this.value);
            } else {
                ocultarInventario();
            }
        });
        console.log("✅ Evento del buscador configurado");
    } else {
        console.warn("⚠️ Campo de búsqueda no encontrado");
    }

    // Cargar datos guardados
    if (localStorage.getItem("recordar") === "true") {
        if (emailInput) emailInput.value = localStorage.getItem("email") || "";
        if (passwordInput) passwordInput.value = localStorage.getItem("password") || "";
        if (recordarCheckbox) recordarCheckbox.checked = true;
    }

    // Eventos del formulario de login
    if (loginButton) {
        loginButton.addEventListener('click', function() {
            if (loginForm) loginForm.classList.remove('d-none');
            loginButton.classList.add('d-none');
        });
    }

    if (closeButton) {
        closeButton.addEventListener('click', function() {
            if (loginForm) loginForm.classList.add('d-none');
            if (loginButton) loginButton.classList.remove('d-none');
        });
    }

    // Evento de inicio de sesión
    if (btnIniciarSesion) {
        btnIniciarSesion.addEventListener("click", async function () {
            const email = emailInput?.value.trim();
            const password = passwordInput?.value.trim();
            const recordar = recordarCheckbox?.checked;

            try {
                await iniciarSesion(email, password, recordar);
                if (container) container.classList.add('d-none');
                if (loginForm) loginForm.classList.add('d-none');
                
                mostrarContainer('container2');
                
                // Actualizar UI con información del usuario
                const usuarioActualElement = document.getElementById('usuarioActual');
                if (usuarioActualElement) {
                    usuarioActualElement.textContent = email;
                }
                
                cargarCuentasAbiertas();
            } catch (error) {
                console.error("Fallo al iniciar sesión:", error);
            }
        });
    }
    
    // VERIFICACIÓN AUTOMÁTICA DE SESIÓN (DESPUÉS DE CONFIGURAR EVENTOS)
    try {
        const estadoSesion = await verificarSesionAutomatica();
        
        if (estadoSesion.autenticado && estadoSesion.turnoActivo) {
            // Usuario autenticado con turno activo - ir directo a container2
            console.log("✅ Sesión y turno activos - redirigiendo a cuentas");
            mostrarContainer('container2');
            
            // Actualizar UI con información del usuario
            const usuarioActualElement = document.getElementById('usuarioActual');
            if (usuarioActualElement) {
                usuarioActualElement.textContent = estadoSesion.usuario;
            }
            
            cargarCuentasAbiertas();
            
        } else if (estadoSesion.autenticado && !estadoSesion.turnoActivo) {
            // Usuario autenticado pero sin turno activo - mostrar aviso y login
            console.log("⚠️ Usuario autenticado pero sin turno activo");
            Swal.fire({
                icon: 'info',
                title: 'Sesión Recuperada',
                text: 'Tu sesión está activa, pero necesitas iniciar un nuevo turno',
                confirmButtonText: 'Iniciar Turno'
            });
            mostrarContainer('container');
            
        } else {
            // No autenticado - mostrar login
            console.log("❌ No hay sesión activa - mostrar login");
            mostrarContainer('container');
        }
        
    } catch (error) {
        console.error("Error al verificar sesión automática:", error);
        mostrarContainer('container');
    }
});

// Función para cambiar entre contenedores (expuesta globalmente)
function mostrarContainer(idMostrar) {
    document.querySelectorAll('.container, .container1, .container2, .container3, .containerPendientes, .containerResumenTurno').forEach(el => {
        el.classList.add('d-none');
    });
    document.getElementById(idMostrar).classList.remove('d-none');
    if (idMostrar === "container1") {
        ocultarInventario();
        renderCarrito();
    }
    if (idMostrar === "container2") {
        cargarCuentasAbiertas();
    }
    if (idMostrar === "containerPendientes") {
        // Si no hay cuentas pendientes cargadas, ir primero a cargar las cuentas activas
        if (!window._cuentasPendientes || window._cuentasPendientes.length === 0) {
            console.log("No hay cuentas pendientes cargadas, cargando primero las cuentas activas...");
            // Forzar carga de cuentas activas para actualizar pendientes
            cargarCuentasAbiertas();
            // Esperar un momento y luego mostrar pendientes
            setTimeout(() => {
                window.mostrarCuentasPendientes();
            }, 1000);
        } else {
            window.mostrarCuentasPendientes();
        }
    }
    if (idMostrar === "containerResumenTurno") {
        // Mostrar resumen del turno en curso
        const idTurno = localStorage.getItem("idTurno");
        if (idTurno) {
            obtenerResumenTurno(idTurno).then(resumen => {
                renderizarResumenTurno(resumen, 'resumenTurnoContent');
            });
        }
    }
};

// Función para cerrar sesión (expuesta globalmente)
async function cerrarSesion() {
    await cerrarSesionAuth(); // Se llama a la función importada de Autenticacion.js
    // Oculta todos los containers y muestra el de inicio
    document.querySelectorAll('.container, .container1, .container2, .container3').forEach(el => {
        el.classList.add('d-none');
    });
    document.getElementById('container').classList.remove('d-none');
    document.getElementById('loginButton').classList.remove('d-none');
    document.getElementById('loginForm').classList.add('d-none');
};

// Función para mostrar el detalle de una cuenta (expuesta globalmente)
function mostrarDetalleCuenta(clienteId) {
    mostrarContainer('container3');
    cargarDetalleCuenta(clienteId);
};

/**
 * Muestra el modal unificado de selección de medio de pago
 * @param {number} total - El total a mostrar en el modal
 * @returns {Promise<string|null>} El medio de pago seleccionado o null si se canceló
 */
export async function mostrarModalMedioPago(total) {
    const totalFormateado = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(total);
    
    // Obtener template del HTML
    const template = document.getElementById('modalMediosPagoTemplate');
    const modalHTML = template ? template.innerHTML : '';

    const { value: medioPago } = await Swal.fire({
        title: '💳 Seleccionar Medio de Pago',
        text: `Total a pagar: ${totalFormateado}`,
        html: modalHTML,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        allowOutsideClick: false,
        didOpen: () => {
            // Función temporal para manejar la selección
            window.seleccionarMedioPagoModal = (pago) => {
                Swal.close();
                window.medioPagoSeleccionadoModal = pago;
            };
        },
        willClose: () => {
            // Limpiar función temporal
            delete window.seleccionarMedioPagoModal;
        }
    });

    const medioPagoFinal = window.medioPagoSeleccionadoModal;
    delete window.medioPagoSeleccionadoModal;
    
    return medioPagoFinal;
}

// Exportar funciones globales para que puedan ser accedidas desde el HTML
window.cerrarSesion = cerrarSesion;
window.mostrarContainer = mostrarContainer;
window.mostrarDetalleCuenta = mostrarDetalleCuenta;