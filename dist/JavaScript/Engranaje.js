// JavaScript/Engranaje.js
// Archivo principal que maneja la lógica de cuentas activas y navegación

// Importaciones de módulos locales
import { obtenerResumenTurno, renderizarResumenTurno } from "./ResumenTurno.js";
import { formatearPrecio } from "./FormateoPrecios.js";
import { iniciarSesion, cerrarSesion as cerrarSesionAuth, verificarSesionAutomatica } from "./Autenticacion.js";
import { cargarInventario, ocultarInventario } from "./Inventario.js";
import { agregarAlCarrito, aumentarCantidad, disminuirCantidad, quitarDelCarrito, renderCarrito } from "./CarritoCompras.js";
import { realizarVenta } from "./VentasApp.js";
import { db } from './Conexion.js';
import { cargarDetalleCuenta } from "./Cuentas.js";
import { renderizarModuloCompras } from "./ComprasUI.js";
// IMPORTACIONES de Firebase
import { collection, onSnapshot, query, doc, updateDoc, getDocs } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { mostrarPersonalizado, cerrarModal, mostrarConfirmacion, mostrarCargando, mostrarExito, mostrarError, mostrarAdvertencia, mostrarInputNumerico} from "./SweetAlertManager.js";
import { wrappedGetDocs, wrappedUpdateDoc, wrappedOnSnapshot, wrappedDeleteDoc} from "./FirebaseWrapper.js";

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
window.agregarAlCarrito = function(id, precioVenta, cantidad = 1) {
    agregarAlCarrito(id, precioVenta, cantidad);
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
let debounceTimer = null;

function cargarCuentasAbiertas() {
    const q = query(collection(db, "cuentasActivas"));
    const container = document.getElementById('cuentasActivasTurno');
    const idTurno = localStorage.getItem("idTurno");
    const timestamp = new Date().toISOString().slice(-13, -5); // HH:MM:SS.mmm
    
    // console.log('🚀 [INICIAR CARGA CUENTAS] - Función cargarCuentasAbiertas iniciada - TIMESTAMP:', timestamp);
    // console.log('🆔 [TURNO DESDE localStorage] - Valor:', idTurno);
    // console.log('📅 [FORMATO TURNO] - Tipo:', typeof idTurno, '- Longitud:', idTurno?.length);
    if (!container) {
        console.error("El contenedor para las cuentas activas no fue encontrado.");
        return;
    }
    wrappedOnSnapshot(q, async (querySnapshot) => {
        // Debounce para evitar actualizaciones muy frecuentes
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        
        debounceTimer = setTimeout(async () => {
        const execTimestamp = new Date().toISOString().slice(-13, -5);
        // console.log('🔄 [CARGAR CUENTAS ABIERTAS] - Ejecutándose... TIMESTAMP:', execTimestamp);
        // console.log('🆔 [TURNO ACTUAL] - localStorage:', idTurno);
        // console.log('📊 [TOTAL DOCUMENTOS] - Encontrados:', querySnapshot.size);
        
        let htmlContent = '';
        let pendientes = [];
        let activas = [];
        
        // Clasificar cuentas
        for (const docSnap of querySnapshot.docs) {
            const cuenta = docSnap.data();
            const clienteId = docSnap.id;
            
            // Filtrar el documento especial de historial de abonos
            if (clienteId === 'historial_abonos') {
                continue;
            }
            
            // console.log('👤 [PROCESANDO CUENTA]', clienteId, ':', {
            //     turnoEnCuenta: cuenta.turno,
            //     turnoActual: idTurno,
            //     tipoActual: cuenta.tipo,
            //     total: cuenta.total
            // });
            
            // Comparación de turnos
            const esTurnoAnterior = cuenta.turno && cuenta.turno !== idTurno;
            const noEsEnCuaderno = cuenta.tipo !== 'En cuaderno';
            
            // console.log('🔍 [COMPARACIÓN]', clienteId, ':', {
            //     turnoEnCuenta: cuenta.turno,
            //     turnoActual: idTurno,
            //     sonTurnosDiferentes: esTurnoAnterior,
            //     tipoActual: cuenta.tipo,
            //     noEsEnCuaderno: noEsEnCuaderno,
            //     DEBE_CONVERTIRSE: esTurnoAnterior && noEsEnCuaderno
            // });
            
            // 🚨 DETECCIÓN ESPECÍFICA PARA DEBUGGING (COMENTADO PARA PRODUCCIÓN)
            // if (clienteId === 'prueba3' && cuenta.tipo === 'En cuaderno') {
            //     console.error('🚨 [DETECTIVE] prueba3 YA ESTÁ EN CUADERNO - ¿QUIÉN LO CONVIRTIÓ?');
            //     console.error('🔍 [DETECTIVE] Datos de la cuenta:', {
            //         cliente: clienteId,
            //         tipoActual: cuenta.tipo,
            //         turnoEnCuenta: cuenta.turno,
            //         turnoActual: idTurno,
            //         timestamp: execTimestamp,
            //         stackTrace: new Error().stack
            //     });
            // }
            
            // Lógica corregida: solo actualizar cuentas de turnos anteriores
            if (esTurnoAnterior && noEsEnCuaderno) {
                // console.log('⚠️ [CONVERSIÓN AUTOMÁTICA] TIMESTAMP:', execTimestamp, '-', clienteId, '- DE:', cuenta.tipo, '→ A: "En cuaderno"');
                // console.log('🔍 [CONVERSIÓN - DETALLES]', clienteId, ':', {
                //     turnoEnCuenta: cuenta.turno,
                //     turnoActual: idTurno,
                //     tipoOriginal: cuenta.tipo,
                //     ejecutor: 'cargarCuentasAbiertas',
                //     timestamp: execTimestamp
                // });
                try {
                    await wrappedUpdateDoc(doc(collection(db, "cuentasActivas"), clienteId), { tipo: 'En cuaderno' });
                    cuenta.tipo = 'En cuaderno';
                    // console.log('✅ [CONVERSIÓN EXITOSA] TIMESTAMP:', execTimestamp, '-', clienteId, '- Actualizada en Firebase');
                } catch (error) {
                    console.error('❌ [ERROR CONVERSIÓN] TIMESTAMP:', execTimestamp, '-', clienteId, '- Error:', error);
                }
            } else {
                // console.log('🟢 [SIN CAMBIOS] TIMESTAMP:', execTimestamp, '-', clienteId, '- Mantiene tipo:', cuenta.tipo);
            }
            
            // Clasificar cuentas: las del turno actual van a activas, el resto a pendientes
            if (cuenta.turno === idTurno && cuenta.tipo !== 'En cuaderno') {
                activas.push({ ...cuenta, id: clienteId });
                // console.log('✅ ACTIVA:', clienteId, '- Turno:', cuenta.turno, '- Tipo:', cuenta.tipo);
            } else {
                pendientes.push({ ...cuenta, id: clienteId });
                // console.log('🟡 PENDIENTE:', clienteId, '- Turno:', cuenta.turno, '- Tipo:', cuenta.tipo);
            }
        }
        
        // console.log('📊 RESUMEN - Activas:', activas.length, 'Pendientes:', pendientes.length);
        
        // Mostrar nota si hay pendientes
        if (pendientes.length > 0) {
            htmlContent += `
                <div class="alert alert-warning text-center p-4 mb-3 alert-clickable" onclick="window.mostrarCuentasPendientes()">
                    <h5>📋 Cuentas Pendientes Hay <strong>${pendientes.length}</strong></h5>
                    <small class="text-muted">👆 Toca aquí para revisarlas</small>
                </div>
            `;
            // console.log('🟡 Agregado HTML de pendientes mejorado');
        }
        
        // Actualizar variable global para consistencia
        window._cuentasPendientes = pendientes;
        if (activas.length === 0) {
            htmlContent += `
                <div class="alert alert-info text-center p-4 mb-3">
                    <p class="mb-2">Aun No hay clientes en el local .</p>
                    <small class="text-muted">Paciencia...</small>
                </div>
            `;
            // console.log('ℹ️ Agregado mensaje mejorado: No hay cuentas activas');
        } else {
            htmlContent += '<div class="list-group">';
            // console.log('📋 Generando lista para', activas.length, 'cuentas activas');
            activas.forEach((cuenta) => {
                const totalFormateado = formatearPrecio(cuenta.total);
                
                // Usar SIEMPRE el campo cliente de la base de datos
                const nombreMostrar = cuenta.cliente || cuenta.id;
                // console.log('📄 Mostrando cliente:', cuenta.id, '→', nombreMostrar);
                
                htmlContent += `
                    <div class="list-group-item d-flex justify-content-between align-items-center" 
                         onclick="mostrarDetalleCuenta('${cuenta.id}')"> 
                         <div>
                            <h6 class="mb-0">${nombreMostrar}</h6>
                            <small class="text-muted">${cuenta.tipo}</small>
                        </div>
                        <span class="badge bg-success rounded-pill fs-6">
                            ${totalFormateado}
                        </span>
                    </div>
                `;
            });
            htmlContent += '</div>';
            // console.log('✅ Lista de activas generada');
        }
        
        // console.log('📝 HTML final length:', htmlContent.length);
        // console.log('📝 HTML preview (primeros 200 chars):', htmlContent.substring(0, 200));
        // console.log('🎯 Container encontrado:', !!container);
        // console.log('🎯 Container ID:', container?.id);
        
        container.innerHTML = htmlContent;
        // console.log('✅ innerHTML asignado - contenido actualizado');
        
        // Verificar que realmente se asignó
        setTimeout(() => {
            // console.log('🔍 Verificación post-asignación - container.innerHTML length:', container.innerHTML.length);
        }, 100);
        
        }, 300); // Debounce de 300ms
    });
}
// Mostrar cuentas pendientes en containerPendientes
window.mostrarCuentasPendientes = function() {
    // console.log('🔵 Mostrando cuentas pendientes...');
    
    // FORZAR ocultación de TODOS los containers específicamente
    const todosLosContainers = ['container', 'container1', 'container2', 'container3', 'containerPendientes', 'containerResumenTurno'];
    
    todosLosContainers.forEach(containerId => {
        const elemento = document.getElementById(containerId);
        if (elemento) {
            // Remover todas las clases de visibilidad
            elemento.classList.remove('js-visible', 'd-block', 'container-visible', 'd-block-force');
            // Agregar todas las clases de ocultación
            elemento.classList.add('js-hidden', 'd-none');
            // console.log(`🔍 ${containerId} ocultado - clases:`, elemento.className);
        }
    });
    
    // MOSTRAR específicamente containerPendientes con máxima prioridad
    const containerPendientes = document.getElementById('containerPendientes');
    if (containerPendientes) {
        containerPendientes.classList.remove('js-hidden', 'd-none');
        containerPendientes.classList.add('js-visible', 'd-block', 'container-visible');
        // console.log('✅ Container pendientes mostrado');
        // console.log('🔍 Clases finales containerPendientes:', containerPendientes.className);
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
                <br><!--<small>Incluye cuentas "En cuaderno" y de turnos anteriores</small>-->
            </div>
            <div class="list-group">
        `;
        
        pendientes.forEach((cuenta) => {
            const totalFormateado = formatearPrecio(cuenta.total || 0);
            const turnoInfo = cuenta.turno ? convertirIdTurnoAFecha(cuenta.turno) : 'Sin fecha';
            const tipoClase = cuenta.tipo === 'En cuaderno' ? 'text-warning' : 'text-muted';
            
            // Usar SIEMPRE el campo cliente de la base de datos
            const nombreMostrar = cuenta.cliente || cuenta.id || 'Cliente sin nombre';
            // console.log('📄 Mostrando cliente (pendientes):', cuenta.id, '→', nombreMostrar);
            
            htmlContent += `
                <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" 
                     onclick="mostrarDetalleCuenta('${cuenta.id}')" class="cuenta-row-clickable"> 
                     <div>
                        <h6 class="mb-1">${nombreMostrar}</h6>
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
    // console.log("🔄 Verificando sesión automáticamente...");
    
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

    // Configurar eventos del buscador SIEMPRE - NUEVO MODAL INTUITIVO
    if (campoBusqueda1) {
        // Convertir el campo de búsqueda en solo lectura y hacer que abra el modal
        campoBusqueda1.readOnly = true;
        campoBusqueda1.placeholder = "🔍 Toca aquí para buscar productos...";
        campoBusqueda1.style.cursor = "pointer";
        
        // Remover eventos antiguos y agregar el nuevo
        campoBusqueda1.removeEventListener("input", cargarInventario);
        
        // SOLO evento click - evitar duplicación con focus
        campoBusqueda1.addEventListener("click", function(e) {
            e.preventDefault(); // Prevenir comportamiento por defecto
            e.stopPropagation(); // Evitar propagación
            
            // FORZAR BLUR inmediato para evitar focus pegado
            this.blur();
            
            // Pequeño delay para asegurar que el blur se aplique
            setTimeout(() => {
                abrirModalBusquedaCarrito();
            }, 50);
        });
        
        // Evento adicional para prevenir focus accidental
        campoBusqueda1.addEventListener("focus", function(e) {
            this.blur(); // Quitar focus inmediatamente
        });
        
        // console.log("✅ Nuevo sistema de búsqueda modal configurado");
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
        // console.log('✅ Event listener del loginButton configurado');
        loginButton.addEventListener('click', function(e) {
            e.preventDefault();
            // console.log('🔵 LoginButton clickeado - mostrando formulario');
            
            if (loginForm) {
                loginForm.classList.remove('js-hidden', 'd-none');
                loginForm.classList.add('js-visible', 'd-block');
                // console.log('✅ Formulario mostrado');
            }
            
            loginButton.classList.add('js-hidden');
            // console.log('✅ Botón ocultado');
        });
    } else {
        console.error('🔴 No se encontró loginButton');
    }

    if (closeButton) {
        closeButton.addEventListener('click', function(e) {
            e.preventDefault();
            // console.log('🔵 CloseButton clickeado - ocultando formulario');
            
            if (loginForm) {
                loginForm.classList.add('js-hidden', 'd-none');
                loginForm.classList.remove('js-visible', 'd-block');
                // console.log('✅ Formulario ocultado');
            }
            
            if (loginButton) {
                loginButton.classList.remove('js-hidden');
                loginButton.classList.add('js-inline-block');
                // console.log('✅ Botón mostrado');
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
                // console.log('✅ Login exitoso, redirigiendo...');
                
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
                
                // cargarCuentasAbiertas(); // 🚫 COMENTADO - evitar múltiples listeners
            } catch (error) {
                console.error("🔴 Fallo al iniciar sesión:", error);
                // NO redirigir si hay error - el usuario se queda en la pantalla de login
                // console.log('🔴 Login falló, manteniendo pantalla de login');
                // El error ya fue mostrado por la función iniciarSesion
            }
        });
    }
    
    // VERIFICACIÓN AUTOMÁTICA DE SESIÓN (DESPUÉS DE CONFIGURAR EVENTOS)
    try {
        const estadoSesion = await verificarSesionAutomatica();
        
        if (estadoSesion.autenticado && estadoSesion.turnoActivo) {
            // Usuario autenticado con turno activo - ir directo a container2
            // console.log("✅ Sesión y turno activos - redirigiendo a cuentas");
            mostrarContainer('container2');
            
            // Actualizar UI con información del usuario
            const usuarioActualElement = document.getElementById('usuarioActual');
            if (usuarioActualElement) {
                usuarioActualElement.textContent = estadoSesion.usuario;
            }
            
            // cargarCuentasAbiertas(); // 🚫 COMENTADO - evitar múltiples listeners
            
        } else if (estadoSesion.autenticado && !estadoSesion.turnoActivo) {
            // Usuario autenticado pero sin turno activo - mostrar aviso y login
            // console.log("⚠️ Usuario autenticado pero sin turno activo");
            mostrarPersonalizado({
                icon: 'info',
                title: 'Sesión Recuperada',
                text: 'Tu sesión está activa, pero necesitas iniciar un nuevo turno',
                confirmButtonText: 'Iniciar Turno'
            });
            mostrarContainer('container');
            
        } else {
            // No autenticado - mostrar login
            // console.log("❌ No hay sesión activa - mostrar login");
            mostrarContainer('container');
        }
        
    } catch (error) {
        console.error("Error al verificar sesión automática:", error);
        mostrarContainer('container');
    }
});

// Función para cambiar entre contenedores (expuesta globalmente)
function mostrarContainer(idMostrar) {
    // console.log('🔵 mostrarContainer llamado con:', idMostrar);
    
    // Verificar que el elemento existe
    const elementoDestino = document.getElementById(idMostrar);
    if (!elementoDestino) {
        console.error('🔴 ERROR: No se encontró el elemento con ID:', idMostrar);
        return;
    }
    
    // console.log('✅ Elemento encontrado:', elementoDestino);
    
    // OCULTAR TODOS los containers - usando solo clases CSS
    document.querySelectorAll('.container, .container1, .container2, .container3, .containerPendientes, .containerResumenTurno, .containerCompras').forEach(el => {
        el.classList.add('js-hidden', 'd-none');
        el.classList.remove('js-visible', 'd-block', 'container-visible');
    });
    
    // MOSTRAR el container destino - usando solo clases CSS
    elementoDestino.classList.remove('js-hidden', 'd-none');
    elementoDestino.classList.add('js-visible', 'd-block', 'container-visible');
    
    // console.log('✅ Container mostrado:', idMostrar);
    // console.log('🔍 Clases finales:', elementoDestino.className);
    
    if (idMostrar === "container1") {
        // console.log('🔵 Inicializando container1...');
        ocultarInventario();
        renderCarrito();
    }
    if (idMostrar === "container2") {
        // console.log('🔵 Inicializando container2 - cargando cuentas abiertas...');
        try {
            cargarCuentasAbiertas();
            // console.log('✅ cargarCuentasAbiertas() ejecutado');
        } catch (error) {
            console.error('🔴 ERROR en cargarCuentasAbiertas():', error);
        }
    }
    if (idMostrar === "containerPendientes") {
        // Si no hay cuentas pendientes cargadas, ir primero a cargar las cuentas activas
        if (!window._cuentasPendientes || window._cuentasPendientes.length === 0) {
            // console.log("No hay cuentas pendientes cargadas, cargando primero las cuentas activas...");
            // 🚫 COMENTADO - evitar múltiples listeners
            // cargarCuentasAbiertas(); 
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
    if (idMostrar === "containerCompras") {
        // Mostrar módulo de compras
        renderizarModuloCompras('comprasContent');
    }
};

// Función para cerrar sesión (expuesta globalmente)
async function cerrarSesion() {
    // console.log('🔵 Iniciando proceso de cierre de sesión...');
    
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
            document.querySelectorAll('.container, .container1, .container2, .container3, .containerPendientes, .containerResumenTurno, .containerCompras').forEach(el => {
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
            
            // console.log('✅ Sesión cerrada exitosamente');
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

// Variable para prevenir apertura múltiple
let modalBusquedaAbierto = false;

// **FUNCIÓN PARA ABRIR MODAL DE BÚSQUEDA INTUITIVO PARA EL CARRITO**
window.abrirModalBusquedaCarrito = async function() {
    // Prevenir apertura múltiple
    if (modalBusquedaAbierto) {
        // console.log('🛑 Modal ya está abierto, ignorando nueva apertura');
        return;
    }
    
    try {
        modalBusquedaAbierto = true;
        await mostrarModalBusquedaCarrito();
    } catch (error) {
        mostrarError(`Error al abrir búsqueda de productos: ${error.message}`);
        console.error("Error abrirModalBusquedaCarrito:", error);
    } finally {
        modalBusquedaAbierto = false;
    }
};

// **FUNCIÓN PARA MOSTRAR MODAL DE BÚSQUEDA PARA CARRITO**
async function mostrarModalBusquedaCarrito() {
    // Generar ID único para evitar conflictos entre modales
    const modalId = 'searchProductoCarrito_' + Date.now();
    const resultadosId = 'resultadosProductosCarrito_' + Date.now();
    
    const resultado = await mostrarPersonalizado({
        title: '🛒 Buscar Productos para Carrito',
        html: `
            <div class="text-start mb-3">
                <p class="text-muted small">Escriba el nombre del producto que desea agregar al carrito</p>
            </div>
            <input type="text" id="${modalId}" class="swal2-input" placeholder="Escriba el nombre del producto..." style="font-size: 1.1rem;">
            <div id="${resultadosId}" class="mt-3" style="max-height: 400px; overflow-y: auto;">
                <p class="text-muted">Escriba para buscar productos...</p>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Cerrar',
        cancelButtonText: 'Cancelar',
        allowOutsideClick: false,
        width: '600px',
        didOpen: () => {
            const input = document.getElementById(modalId);
            const resultados = document.getElementById(resultadosId);
            
            if (input && resultados) {
                // Listener para búsqueda en tiempo real - función nueva cada vez
                const buscarHandler = async (e) => {
                    await buscarProductosParaCarrito(e.target.value, resultados);
                };
                
                input.addEventListener('input', buscarHandler);
                
                // Enfocar el campo de búsqueda
                input.focus();
            }
        },
        willClose: () => {
            // Limpiar cualquier referencia al cerrar
            const input = document.getElementById(modalId);
            if (input) {
                input.removeEventListener('input', buscarProductosParaCarrito);
            }
            // Resetear flag de modal abierto
            modalBusquedaAbierto = false;
        }
    });
}

// **FUNCIÓN PARA BUSCAR PRODUCTOS PARA EL CARRITO**
async function buscarProductosParaCarrito(termino, resultadosDiv) {
    if (!termino.trim()) {
        resultadosDiv.innerHTML = '<p class="text-muted">Escriba para buscar productos...</p>';
        return;
    }

    try {
        resultadosDiv.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"></div><br>Buscando...</div>';
        const inventarioRef = collection(db, "inventario");
        const snapshot = await wrappedGetDocs(inventarioRef);

        const productos = [];
        const terminoLower = termino.toLowerCase();
        snapshot.forEach(doc => {
            const nombreProducto = doc.id.toLowerCase();
            if (nombreProducto.includes(terminoLower)) {
                const data = doc.data();
                productos.push({
                    id: doc.id,
                    nombre: doc.id,
                    precio: data.precioVenta || 0,
                    cantidad: data.cantidad || 0
                });
            }
        });

        if (productos.length === 0) {
            resultadosDiv.innerHTML = '<p class="text-warning">No se encontraron productos con ese nombre.</p>';
            return;
        }

        let html = '<div class="list-group">';
        productos.forEach(producto => {
            const precio = formatearPrecio(producto.precio);
            
            // <-- CAMBIO PRINCIPAL: Se ajusta la estructura para incluir el botón de eliminar -->
            html += `
                <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" 
                     onclick="window.seleccionarProductoParaCarrito('${producto.id}', ${producto.precio})"
                     style="cursor: pointer; min-height: 60px; border-left: 3px solid #28a745; padding: 8px 12px;">
                    
                    <div class="flex-grow-1">
                        <div class="fw-bold" style="color: #333; font-size: 1rem;">${producto.nombre}</div>
                        <small class="text-muted" style="font-size: 0.85rem;">Stock: ${producto.cantidad} disponibles</small>
                    </div>

                    <div class="text-end me-2">
                        <div class="fw-bold" style="color: #fff; background: #28a745; padding: 4px 8px; border-radius: 4px; font-size: 1rem;">${precio}</div>
                    </div>
                    
                    <button class="btn btn-eliminar-busqueda" 
                            onclick="window.eliminarProductoDesdeBuscador('${producto.id}', event)">
                        🗑️
                    </button>
                </div>
            `;
        });
        html += '</div>';

        resultadosDiv.innerHTML = html;

    } catch (error) {
        resultadosDiv.innerHTML = '<p class="text-danger">Error al buscar productos.</p>';
        console.error('Error buscando productos para carrito:', error);
    }
}
// **FUNCIÓN PARA SELECCIONAR PRODUCTO Y AGREGARLO AL CARRITO**
window.seleccionarProductoParaCarrito = async function(nombreProducto, precioVenta) {
    try {
        // PASO 1: Mostrar input numérico para cantidad
        const { value: cantidad } = await mostrarInputNumerico(`Cantidad para ${nombreProducto}`, 'Ingrese la cantidad');
        
        if (!cantidad || cantidad <= 0) {
            // Usuario canceló o ingresó cantidad inválida
            modalBusquedaAbierto = false;
            cerrarModal();
            return;
        }
        
        // PASO 2: Agregar el producto al carrito con la cantidad especificada
        window.agregarAlCarrito(nombreProducto, precioVenta, cantidad);
        
        // PASO 3: Resetear flag de modal y cerrar
        modalBusquedaAbierto = false;
        cerrarModal();
        
        // PASO 4: Limpiar el campo de búsqueda para el próximo uso
        const campoBusqueda1 = document.getElementById("campoBusqueda1");
        if (campoBusqueda1) {
            campoBusqueda1.blur(); // Quitar focus del campo
        }
        
    } catch (error) {
        modalBusquedaAbierto = false; // Resetear en caso de error
        mostrarError(`Error al agregar producto al carrito: ${error.message}`);
        console.error("Error seleccionarProductoParaCarrito:", error);
    }
};

// Exportar funciones globales para que puedan ser accedidas desde el HTML
window.cerrarSesion = cerrarSesion;
window.mostrarContainer = mostrarContainer;
window.mostrarDetalleCuenta = mostrarDetalleCuenta;

// Funciones globales para historial de abonos
window.mostrarHistorialAbonosGeneral = async function() {
    try {
        mostrarCargando('Cargando historial de abonos...');
        
        // Importar funciones necesarias
        const { obtenerClientesConAbonos } = await import('./Abonos.js');
        const { mostrarModalClientesConAbonos } = await import('./SweetAlertManager.js');
        
        const clientesConAbonos = await obtenerClientesConAbonos();
        
        cerrarModal();
        await mostrarModalClientesConAbonos(clientesConAbonos);
        
    } catch (error) {
        cerrarModal();
        mostrarError('Error al cargar historial de abonos', error.message);
        console.error('Error en mostrarHistorialAbonosGeneral:', error);
    }
};

window.verHistorialCliente = async function(clienteId, nombreCliente) {
    try {
        mostrarCargando('Cargando historial del cliente...');
        
        // Importar funciones necesarias
        const { obtenerHistorialAbono } = await import('./Abonos.js');
        const { mostrarModalHistorialCliente } = await import('./SweetAlertManager.js');
        
        const historialAbonos = await obtenerHistorialAbono(clienteId);
        
        cerrarModal();
        await mostrarModalHistorialCliente(historialAbonos, nombreCliente);
        
    } catch (error) {
        cerrarModal();
        mostrarError('Error al cargar historial del cliente', error.message);
        console.error('Error en verHistorialCliente:', error);
    }
};
/**
 * Elimina un producto del inventario directamente desde el buscador, con confirmación.
 * @param {string} productoId - El nombre (ID) del producto a eliminar.
 * @param {Event} event - El objeto del evento click para detener la propagación.
 */
window.eliminarProductoDesdeBuscador = async function(productoId, event) {
    // Detiene el evento para que no se active el clic del elemento padre (que agrega al carrito)
    event.stopPropagation();

    // Pide confirmación al usuario para evitar borrados accidentales
    const confirmacion = await mostrarConfirmacion(
        '¿Eliminar Producto?',
        `¿Estás seguro de que deseas eliminar "${productoId}" del inventario de forma permanente? Esta acción no se puede deshacer.`,
        'Sí, eliminar',
        'Cancelar'
    );

    if (confirmacion.isConfirmed) {
        mostrarCargando('Eliminando producto...');
        try {
            const productoRef = doc(db, "inventario", productoId);
            await wrappedDeleteDoc(productoRef); // Usa tu wrapper para borrar
            
            mostrarExito('¡Producto Eliminado!', `"${productoId}" ha sido borrado del inventario.`);

            // Refresca la lista de búsqueda para que el producto ya no aparezca
            const inputBusqueda = document.querySelector('.swal2-input');
            if (inputBusqueda && inputBusqueda.value) {
                const resultadosDiv = inputBusqueda.nextElementSibling;
                await buscarProductosParaCarrito(inputBusqueda.value, resultadosDiv);
            }

        } catch (error) {
            console.error("Error al eliminar producto desde buscador:", error);
            mostrarError("Error", "No se pudo eliminar el producto.");
        }
    }
};