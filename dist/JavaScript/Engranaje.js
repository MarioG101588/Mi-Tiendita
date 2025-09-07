import { obtenerResumenTurno, renderizarResumenTurno } from "./ResumenTurno.js";
// JavaScript/main.js
// Este es el archivo principal que se encargará de importar las funciones de los otros archivos
// y manejar los eventos de la interfaz (botones, inputs, etc.).

// Importaciones de módulos locales
import { iniciarSesion, cerrarSesion as cerrarSesionAuth } from "./Autenticacion.js";
import { cargarInventario, ocultarInventario } from "./Inventario.js";
import { agregarAlCarrito, aumentarCantidad, disminuirCantidad, quitarDelCarrito, renderCarrito } from "./CarritoCompras.js";
import { realizarVenta } from "./VentasApp.js";
import { db } from './Conexion.js';
import { cargarDetalleCuenta } from "./Cuentas.js";

// IMPORTACIONES de Firebase para la funcionalidad de cuentas
import { collection, onSnapshot, query, doc, updateDoc, getDocs } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11.10.5/+esm";

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
            htmlContent += `<div class="alert alert-warning" style="cursor:pointer;" onclick="window.mostrarCuentasPendientes()">
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
        el.style.display = 'none';
    });
    document.getElementById('containerPendientes').style.display = 'block';
    
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
            const turnoInfo = cuenta.turno ? `Turno: ${cuenta.turno}` : 'Sin turno';
            const tipoClase = cuenta.tipo === 'En cuaderno' ? 'text-warning' : 'text-muted';
            
            htmlContent += `
                <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" 
                     onclick="mostrarDetalleCuenta('${cuenta.id}')" style="cursor: pointer;"> 
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
document.addEventListener("DOMContentLoaded", function () {
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

    if (localStorage.getItem("recordar") === "true") {
        emailInput.value = localStorage.getItem("email") || "";
        passwordInput.value = localStorage.getItem("password") || "";
        recordarCheckbox.checked = true;
    }

    loginButton.addEventListener('click', function() {
        loginForm.style.display = 'block';
        loginButton.style.display = 'none';
    });

    closeButton.addEventListener('click', function() {
        loginForm.style.display = 'none';
        loginButton.style.display = 'inline-block';
    });

    btnIniciarSesion.addEventListener("click", async function () {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const recordar = recordarCheckbox.checked;

        try {
            await iniciarSesion(email, password, recordar);
            container.style.display = 'none';
            loginForm.style.display = 'none';
            // Mostrar directamente cuentas activas
            document.querySelectorAll('.container, .container1, .container2, .container3').forEach(el => {
                el.style.display = 'none';
            });
            document.getElementById('container2').style.display = 'block';
            cargarCuentasAbiertas();
        } catch (error) {
            console.error("Fallo al iniciar sesión:", error);
        }
    });

    if (campoBusqueda1) {
        campoBusqueda1.addEventListener("input", function() {
            if (this.value.trim()) {
                cargarInventario(this.value);
            } else {
                ocultarInventario();
            }
        });
    }
});

// Función para cambiar entre contenedores (expuesta globalmente)
function mostrarContainer(idMostrar) {
    document.querySelectorAll('.container, .container1, .container2, .container3, .containerPendientes, .containerResumenTurno').forEach(el => {
        el.style.display = 'none';
    });
    document.getElementById(idMostrar).style.display = 'block';
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
        el.style.display = 'none';
    });
    document.getElementById('container').style.display = 'block';
    document.getElementById('loginButton').style.display = 'inline-block';
    document.getElementById('loginForm').style.display = 'none';
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