// JavaScript/SweetAlertManager.js
// Módulo centralizado para manejo de SweetAlert2 y supresión de errores

import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11.10.5/+esm";

/**
 * Configuración inicial - MODO DIAGNÓSTICO
 */
function configurarSweetAlert() {
    console.log('🔵 SweetAlertManager: Configurando en modo diagnóstico');
    
    // TEMPORALMENTE: Solo interceptar addEventListener problemático
    const originalAddEventListener = window.addEventListener;
    window.addEventListener = function(type, listener, options) {
        if (type === 'unload' || type === 'beforeunload') {
            console.log('🟡 SweetAlertManager: Bloqueando evento', type);
            return; // Bloquear solo estos eventos problemáticos
        }
        return originalAddEventListener.call(this, type, listener, options);
    };
    
    console.log('✅ SweetAlertManager: Configuración completada');
}

// Ejecutar configuración inmediatamente
configurarSweetAlert();

/**
 * Muestra un modal de carga
 * @param {string} mensaje - Mensaje a mostrar durante la carga
 */
export function mostrarCargando(mensaje = 'Cargando...') {
    return Swal.fire({
        title: mensaje,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
}

/**
 * Muestra un modal de éxito
 * @param {string} titulo - Título del modal
 * @param {string} mensaje - Mensaje del modal
 */
export function mostrarExito(titulo, mensaje = '') {
    return Swal.fire({
        icon: 'success',
        title: titulo,
        text: mensaje,
        confirmButtonColor: '#28a745'
    });
}

/**
 * Muestra un modal de error
 * @param {string} titulo - Título del modal
 * @param {string} mensaje - Mensaje del modal
 */
export function mostrarError(titulo, mensaje = '') {
    return Swal.fire({
        icon: 'error',
        title: titulo,
        text: mensaje,
        confirmButtonColor: '#dc3545'
    });
}

/**
 * Muestra un modal de advertencia
 * @param {string} titulo - Título del modal
 * @param {string} mensaje - Mensaje del modal
 */
export function mostrarAdvertencia(titulo, mensaje = '') {
    return Swal.fire({
        icon: 'warning',
        title: titulo,
        text: mensaje,
        confirmButtonColor: '#ffc107'
    });
}

/**
 * Muestra un modal de información
 * @param {string} titulo - Título del modal
 * @param {string} mensaje - Mensaje del modal
 */
export function mostrarInfo(titulo, mensaje = '') {
    return Swal.fire({
        icon: 'info',
        title: titulo,
        text: mensaje,
        confirmButtonColor: '#17a2b8'
    });
}

/**
 * Muestra un modal de confirmación
 * @param {string} titulo - Título del modal
 * @param {string} mensaje - Mensaje del modal
 * @param {string} textoConfirmar - Texto del botón confirmar
 * @param {string} textoCancelar - Texto del botón cancelar
 */
export function mostrarConfirmacion(titulo, mensaje = '', textoConfirmar = 'Sí', textoCancelar = 'No') {
    return Swal.fire({
        icon: 'question',
        title: titulo,
        text: mensaje,
        showCancelButton: true,
        confirmButtonText: textoConfirmar,
        cancelButtonText: textoCancelar,
        confirmButtonColor: '#007bff',
        cancelButtonColor: '#6c757d'
    });
}

/**
 * Muestra un modal con input de texto
 * @param {string} titulo - Título del modal
 * @param {string} placeholder - Placeholder del input
 * @param {string} valorInicial - Valor inicial del input
 */
export function mostrarInput(titulo, placeholder = '', valorInicial = '') {
    return Swal.fire({
        title: titulo,
        input: 'text',
        inputPlaceholder: placeholder,
        inputValue: valorInicial,
        showCancelButton: true,
        confirmButtonText: 'Aceptar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#007bff',
        cancelButtonColor: '#6c757d',
        inputValidator: (value) => {
            if (!value) {
                return 'Este campo es requerido';
            }
        }
    });
}

/**
 * Muestra un formulario de venta con opciones de cliente y clase de venta
 */
export function mostrarFormularioVenta() {
    return Swal.fire({
        title: 'Finalizar Venta',
        html: `
            <div style="padding: 10px 0;">
                <input id="swal-input-cliente" 
                       class="swal2-input" 
                       placeholder="Nombre del Cliente (opcional)"
                       style="margin-bottom: 15px;">
                <select id="swal-select-clase-venta" 
                        class="swal2-select"
                        style="margin-bottom: 10px;">
                    <option value="Pago en efectivo" selected>Pago en efectivo</option>
                    <option value="Consumo en el local">Consumo en el local</option>
                    <option value="En cuaderno">En cuaderno</option>
                </select>
            </div>
        `,
        focusConfirm: false,
        width: '90%',
        padding: '20px',
        preConfirm: () => {
            const claseVenta = document.getElementById('swal-select-clase-venta').value;
            const cliente = document.getElementById('swal-input-cliente').value.trim();

            if ((claseVenta === 'En cuaderno' || claseVenta === 'Consumo en el local') && !cliente) {
                Swal.showValidationMessage('El nombre del cliente es obligatorio para esta opción');
                return false;
            }
            return { cliente, claseVenta };
        },
        confirmButtonText: 'Confirmar Venta',
        showCancelButton: true,
        cancelButtonText: 'Cancelar'
    });
}

/**
 * Muestra un modal personalizado con las opciones específicas
 * @param {Object} options - Opciones del modal personalizado
 */
export function mostrarPersonalizado(options) {
    return Swal.fire(options);
}

/**
 * Muestra un modal con select
 * @param {string} titulo - Título del modal
 * @param {Object} opciones - Objeto con opciones {value: 'text'}
 * @param {string} valorInicial - Valor inicial seleccionado
 */
export function mostrarSelect(titulo, opciones, valorInicial = '') {
    return Swal.fire({
        title: titulo,
        input: 'select',
        inputOptions: opciones,
        inputValue: valorInicial,
        showCancelButton: true,
        confirmButtonText: 'Aceptar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#007bff',
        cancelButtonColor: '#6c757d'
    });
}

/**
 * Muestra un modal específico para medios de pago
 * @param {number} total - Total de la venta
 * @param {string} htmlContent - HTML de los botones de pago
 */
export function mostrarMedioPago(total, htmlContent) {
    return Swal.fire({
        title: 'Seleccionar Medio de Pago',
        html: htmlContent,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        allowOutsideClick: false
    });
}

/**
 * Muestra validación específica
 * @param {string} mensaje - Mensaje de validación
 */
export function mostrarValidacion(mensaje) {
    Swal.showValidationMessage(mensaje);
}

/**
 * Cierra cualquier modal abierto
 */
export function cerrarModal() {
    Swal.close();
}

/**
 * Muestra loading en modal abierto
 */
export function mostrarLoading() {
    Swal.showLoading();
}

/**
 * Oculta loading en modal abierto
 */
export function ocultarLoading() {
    Swal.hideLoading();
}

/**
 * Función de logging para desarrollo
 * @param {string} mensaje - Mensaje a logear
 * @param {string} tipo - Tipo de log (info, warn, error)
 */
export function log(mensaje, tipo = 'info') {
    if (tipo === 'error') {
        console.error(`🔴 SweetAlertManager: ${mensaje}`);
    } else if (tipo === 'warn') {
        console.warn(`🟡 SweetAlertManager: ${mensaje}`);
    } else {
        console.log(`🔵 SweetAlertManager: ${mensaje}`);
    }
}
