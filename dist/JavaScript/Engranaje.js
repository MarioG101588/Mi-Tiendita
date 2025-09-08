import { obtenerResumenTurno, renderizarResumenTurno } from "./ResumenTurno.js";
import { formatearPrecio } from "./FormateoPrecios.js";
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
import { configurarDesarrollo, mostrarInfoEntorno } from "./config-desarrollo.js";

// IMPORTACIONES de Firebase para la funcionalidad de cuentas
import { collection, onSnapshot, query, doc, updateDoc, getDocs } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { 
    mostrarPersonalizado, 
    cerrarModal, 
    mostrarConfirmacion, 
    mostrarCargando, 
    mostrarExito, 
    mostrarError,
    mostrarAdvertencia 
} from "./SweetAlertManager.js";

// Configurar entorno de desarrollo
configurarDesarrollo();
mostrarInfoEntorno();

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
        console.log('📊 Total documentos encontrados:', querySnapshot.size);
        
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
                console.log('✅ ACTIVA:', clienteId, '- Turno:', cuenta.turno, '- Tipo:', cuenta.tipo);
            } else {
                pendientes.push({ ...cuenta, id: clienteId });
                console.log('🟡 PENDIENTE:', clienteId, '- Turno:', cuenta.turno, '- Tipo:', cuenta.tipo);
            }
        }
        
        console.log('📊 RESUMEN - Activas:', activas.length, 'Pendientes:', pendientes.length);
        
        // Mostrar nota si hay pendientes
        if (pendientes.length > 0) {
            htmlContent += `
                <div class="alert alert-warning text-center p-4 mb-3 alert-clickable" onclick="window.mostrarCuentasPendientes()">
                    <h5>📋 Cuentas Pendientes</h5>
                    <p class="mb-2">Hay <strong>${pendientes.length}</strong> cuenta(s) pendiente(s) de turnos anteriores.</p>
                    <small class="text-muted">👆 Haz clic aquí para revisarlas</small>
                </div>
            `;
            console.log('🟡 Agregado HTML de pendientes mejorado');
        }
        
        // Actualizar variable global para consistencia
        window._cuentasPendientes = pendientes;
        if (activas.length === 0) {
            htmlContent += `
                <div class="alert alert-info text-center p-4 mb-3">
                    <h4>✨ ¡Turno Limpio!</h4>
                    <p class="mb-2">No hay cuentas activas en este turno actual.</p>
                    <small class="text-muted">Turno: ${idTurno}</small>
                </div>
            `;
            console.log('ℹ️ Agregado mensaje mejorado: No hay cuentas activas');
        } else {
            htmlContent += '<div class="list-group">';
            console.log('📋 Generando lista para', activas.length, 'cuentas activas');
            activas.forEach((cuenta) => {
                const totalFormateado = formatearPrecio(cuenta.total);
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
            console.log('✅ Lista de activas generada');
        }
        
        console.log('📝 HTML final length:', htmlContent.length);
        console.log('📝 HTML preview (primeros 200 chars):', htmlContent.substring(0, 200));
        console.log('🎯 Container encontrado:', !!container);
        console.log('🎯 Container ID:', container?.id);
        
        container.innerHTML = htmlContent;
        console.log('✅ innerHTML asignado - contenido actualizado');
        
        // Verificar que realmente se asignó
        setTimeout(() => {
            console.log('🔍 Verificación post-asignación - container.innerHTML length:', container.innerHTML.length);
        }, 100);
    });
}
// Mostrar cuentas pendientes en containerPendientes
window.mostrarCuentasPendientes = function() {
    console.log('🔵 Mostrando cuentas pendientes...');
    
    // FORZAR ocultación de TODOS los containers específicamente
    const todosLosContainers = ['container', 'container1', 'container2', 'container3', 'containerPendientes', 'containerResumenTurno'];
    
    todosLosContainers.forEach(containerId => {
        const elemento = document.getElementById(containerId);
        if (elemento) {
            // Remover todas las clases de visibilidad
            elemento.classList.remove('js-visible', 'd-block', 'container-visible', 'd-block-force');
            // Agregar todas las clases de ocultación
            elemento.classList.add('js-hidden', 'd-none');
            console.log(`🔍 ${containerId} ocultado - clases:`, elemento.className);
        }
    });
    
    // MOSTRAR específicamente containerPendientes con máxima prioridad
    const containerPendientes = document.getElementById('containerPendientes');
    if (containerPendientes) {
        containerPendientes.classList.remove('js-hidden', 'd-none');
        containerPendientes.classList.add('js-visible', 'd-block', 'container-visible');
        console.log('✅ Container pendientes mostrado');
        console.log('🔍 Clases finales containerPendientes:', containerPendientes.className);
    }
    
    const container = document.getElementById('cuentasPendientesTurno');
    if (!container) {
        console.error("🔴 Contenedor cuentasPendientesTurno no encontrado");
        mostrarError('Error', 'No se encontró el contenedor de cuentas pendientes');
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
            const totalFormateado = formatearPrecio(cuenta.total || 0);
            const turnoInfo = cuenta.turno ? convertirIdTurnoAFecha(cuenta.turno) : 'Sin fecha';
            const tipoClase = cuenta.tipo === 'En cuaderno' ? 'text-warning' : 'text-muted';
            
            htmlContent += `
                <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" 
                     onclick="mostrarDetalleCuenta('${cuenta.id}')" class="cuenta-row-clickable"> 
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
        console.log('✅ Event listener del loginButton configurado');
        loginButton.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('🔵 LoginButton clickeado - mostrando formulario');
            
            if (loginForm) {
                loginForm.classList.remove('js-hidden', 'd-none');
                loginForm.classList.add('js-visible', 'd-block');
                console.log('✅ Formulario mostrado');
            }
            
            loginButton.classList.add('js-hidden');
            console.log('✅ Botón ocultado');
        });
    } else {
        console.error('🔴 No se encontró loginButton');
    }

    if (closeButton) {
        closeButton.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('🔵 CloseButton clickeado - ocultando formulario');
            
            if (loginForm) {
                loginForm.classList.add('js-hidden', 'd-none');
                loginForm.classList.remove('js-visible', 'd-block');
                console.log('✅ Formulario ocultado');
            }
            
            if (loginButton) {
                loginButton.classList.remove('js-hidden');
                loginButton.classList.add('js-inline-block');
                console.log('✅ Botón mostrado');
            }
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
                
                // Solo ejecutar esto si el login fue exitoso
                console.log('✅ Login exitoso, redirigiendo...');
                
                if (container) {
                    container.classList.add('js-hidden');
                    container.classList.remove('js-visible');
                }
                if (loginForm) {
                    loginForm.classList.add('js-hidden', 'd-none');
                    loginForm.classList.remove('js-visible', 'd-block');
                }
                
                mostrarContainer('container2');
                
                // Actualizar UI con información del usuario
                const usuarioActualElement = document.getElementById('usuarioActual');
                if (usuarioActualElement) {
                    usuarioActualElement.textContent = email;
                }
                
                cargarCuentasAbiertas();
            } catch (error) {
                console.error("🔴 Fallo al iniciar sesión:", error);
                // NO redirigir si hay error - el usuario se queda en la pantalla de login
                console.log('🔴 Login falló, manteniendo pantalla de login');
                // El error ya fue mostrado por la función iniciarSesion
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
            mostrarPersonalizado({
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
    console.log('🔵 mostrarContainer llamado con:', idMostrar);
    
    // Verificar que el elemento existe
    const elementoDestino = document.getElementById(idMostrar);
    if (!elementoDestino) {
        console.error('🔴 ERROR: No se encontró el elemento con ID:', idMostrar);
        return;
    }
    
    console.log('✅ Elemento encontrado:', elementoDestino);
    
    // OCULTAR TODOS los containers - usando solo clases CSS
    document.querySelectorAll('.container, .container1, .container2, .container3, .containerPendientes, .containerResumenTurno').forEach(el => {
        el.classList.add('js-hidden', 'd-none');
        el.classList.remove('js-visible', 'd-block', 'container-visible');
    });
    
    // MOSTRAR el container destino - usando solo clases CSS
    elementoDestino.classList.remove('js-hidden', 'd-none');
    elementoDestino.classList.add('js-visible', 'd-block', 'container-visible');
    
    console.log('✅ Container mostrado:', idMostrar);
    console.log('🔍 Clases finales:', elementoDestino.className);
    
    if (idMostrar === "container1") {
        console.log('🔵 Inicializando container1...');
        ocultarInventario();
        renderCarrito();
    }
    if (idMostrar === "container2") {
        console.log('🔵 Inicializando container2 - cargando cuentas abiertas...');
        try {
            cargarCuentasAbiertas();
            console.log('✅ cargarCuentasAbiertas() ejecutado');
        } catch (error) {
            console.error('🔴 ERROR en cargarCuentasAbiertas():', error);
        }
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
    console.log('🔵 Iniciando proceso de cierre de sesión...');
    
    const confirmacion = await mostrarConfirmacion(
        '¿Cerrar Sesión?',
        '¿Estás seguro de que deseas cerrar la sesión actual?',
        'Sí, cerrar',
        'Cancelar'
    );
    
    if (confirmacion.isConfirmed) {
        mostrarCargando('Cerrando sesión...');
        
        try {
            await cerrarSesionAuth(); // Se llama a la función importada de Autenticacion.js
            
            // Oculta todos los containers y muestra el de inicio
            document.querySelectorAll('.container, .container1, .container2, .container3, .containerPendientes, .containerResumenTurno').forEach(el => {
                el.classList.add('js-hidden', 'd-none');
                el.classList.remove('js-visible', 'd-block', 'container-visible');
            });
            
            const containerInicio = document.getElementById('container');
            containerInicio.classList.remove('js-hidden', 'd-none');
            containerInicio.classList.add('js-visible', 'd-block', 'container-visible');
            
            // FORZAR VISIBILIDAD del formulario de login
            const loginButton = document.getElementById('loginButton');
            const loginForm = document.getElementById('loginForm');
            
            if (loginButton) {
                loginButton.classList.remove('js-hidden');
                loginButton.classList.add('js-inline-block', 'js-visibility-visible');
            }
            
            if (loginForm) {
                loginForm.classList.add('js-hidden', 'd-none');
                loginForm.classList.remove('js-visible', 'd-block');
            }
            
            cerrarModal();
            mostrarExito('Sesión cerrada correctamente');
            
            console.log('✅ Sesión cerrada exitosamente');
        } catch (error) {
            cerrarModal();
            mostrarError('Error al cerrar sesión', error.message);
            console.error('🔴 Error cerrando sesión:', error);
        }
    }
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
    const totalFormateado = formatearPrecio(total);
    
    // Obtener template del HTML
    const template = document.getElementById('modalMediosPagoTemplate');
    const modalHTML = template ? template.innerHTML : '';

    const { value: medioPago } = await mostrarPersonalizado({
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
                cerrarModal();
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