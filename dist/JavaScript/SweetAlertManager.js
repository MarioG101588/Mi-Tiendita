// JavaScript/SweetAlertManager.js
// Módulo centralizado para manejo de SweetAlert2 y supresión de errores

import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11.10.5/+esm";

/**
 * Configuración inicial - MODO DIAGNÓSTICO
 */
function configurarSweetAlert() {
    // console.log('🔵 SweetAlertManager: Configurando en modo diagnóstico');
    
    // TEMPORALMENTE: Solo interceptar addEventListener problemático
    const originalAddEventListener = window.addEventListener;
    window.addEventListener = function(type, listener, options) {
        if (type === 'unload' || type === 'beforeunload') {
            // console.log('🟡 SweetAlertManager: Bloqueando evento', type);
            return; // Bloquear solo estos eventos problemáticos
        }
        return originalAddEventListener.call(this, type, listener, options);
    };
    
    // console.log('✅ SweetAlertManager: Configuración completada');
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
 * Muestra un modal con input NUMÉRICO optimizado para móviles
 * @param {string} titulo - Título del modal
 * @param {string} placeholder - Placeholder del input
 */
export function mostrarInputNumerico(titulo, placeholder = 'Ingrese un número') {
    return Swal.fire({
        title: titulo,
        html: `
            <input 
                type="number" 
                id="swal-numeric-input" 
                class="swal2-input" 
                placeholder="${placeholder}"
                inputmode="numeric"
                pattern="[0-9]*"
                min="1"
                max="99"
                style="font-size: 1.5rem; text-align: center; padding: 15px; -webkit-appearance: none; -moz-appearance: textfield;"
                autofocus
                autocomplete="off"
                enterkeyhint="done"
            >
        `,
        showCancelButton: true,
        confirmButtonText: 'Aceptar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#007bff',
        cancelButtonColor: '#6c757d',
        focusConfirm: false,
        didOpen: () => {
            // Enfocar el input y seleccionar todo el contenido (si lo hay) para móviles
            const input = document.getElementById('swal-numeric-input');
            if (input) {
                // Delay pequeño para asegurar que se renderice completamente
                setTimeout(() => {
                    input.focus();
                    input.select(); // Selecciona cualquier contenido existente
                }, 100);
            }
        },
        preConfirm: () => {
            const input = document.getElementById('swal-numeric-input');
            const value = input.value.trim();
            
            if (!value || isNaN(value) || parseInt(value) < 1) {
                Swal.showValidationMessage('Ingrese un número válido mayor a 0');
                return false;
            }
            
            return parseInt(value);
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
                    <option value="Pago en efectivo">Pago en efectivo</option>
                    <option value="Consumo en el local" selected>Consumo en el local</option>
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

            // console.log('🔍 [FORMULARIO VENTA] - Valores capturados:');
            // console.log('   👤 Cliente:', cliente);
            // console.log('   📝 Clase de Venta:', claseVenta);
            // console.log('   🎯 Select element value:', document.getElementById('swal-select-clase-venta').value);
            // console.log('   🎯 Select element selectedIndex:', document.getElementById('swal-select-clase-venta').selectedIndex);

            if ((claseVenta === 'En cuaderno' || claseVenta === 'Consumo en el local') && !cliente) {
                Swal.showValidationMessage('El nombre del cliente es obligatorio para esta opción');
                return false;
            }
            
            // console.log('✅ [FORMULARIO VENTA] - Datos válidos, retornando:', { cliente, claseVenta });
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
        // console.log(`🔵 SweetAlertManager: ${mensaje}`);
    }
}

/**
 * Muestra modal para procesar abono parcial
 * @param {string} clienteNombre - Nombre del cliente
 * @param {number} saldoActual - Saldo actual de la cuenta
 * @returns {Promise<{monto: number, medioPago: string} | null>}
 */
export async function mostrarModalAbono(clienteNombre, saldoActual) {
    const { value: formValues } = await Swal.fire({
        title: `💰 Abono Parcial`,
        html: `
            <div class="text-start">
                <div class="mb-3 p-3 bg-light rounded">
                    <h6 class="mb-1">Cliente: <strong>${clienteNombre}</strong></h6>
                    <h6 class="mb-0 text-primary">Saldo actual: <strong>$${saldoActual.toLocaleString('es-CO')}</strong></h6>
                </div>
                
                <div class="mb-3">
                    <label for="swal-monto-abono" class="form-label">Monto del abono:</label>
                    <input type="number" 
                           id="swal-monto-abono" 
                           class="form-control" 
                           placeholder="Ingrese el monto"
                           min="1" 
                           max="${saldoActual}"
                           inputmode="numeric">
                    <div class="form-text">Máximo: $${saldoActual.toLocaleString('es-CO')}</div>
                </div>
                
                <div class="mb-3">
                    <label for="swal-medio-pago" class="form-label">Medio de pago:</label>
                    <select id="swal-medio-pago" class="form-select">
                        <option value="">Seleccione el medio de pago</option>
                        <option value="Efectivo">💵 Efectivo</option>
                        <option value="Nequi">📱 Nequi</option>
                        <option value="Daviplata">💳 Daviplata</option>
                    </select>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '💰 Procesar Abono',
        cancelButtonText: '❌ Cancelar',
        confirmButtonColor: '#28a745',
        cancelButtonColor: '#dc3545',
        focusConfirm: false,
        width: '500px',
        preConfirm: () => {
            const monto = parseFloat(document.getElementById('swal-monto-abono').value);
            const medioPago = document.getElementById('swal-medio-pago').value;
            
            // Validaciones
            if (!monto || monto <= 0) {
                Swal.showValidationMessage('Debe ingresar un monto válido');
                return false;
            }
            
            if (monto > saldoActual) {
                Swal.showValidationMessage(`El abono no puede ser mayor al saldo actual ($${saldoActual.toLocaleString('es-CO')})`);
                return false;
            }
            
            if (!medioPago) {
                Swal.showValidationMessage('Debe seleccionar un medio de pago');
                return false;
            }
            
            return { monto, medioPago };
        }
    });
    
    return formValues || null;
}

/**
 * Muestra modal con la lista de clientes que tienen abonos
 * @param {Array} clientesConAbonos - Array de clientes con historial de abonos
 */
export async function mostrarModalClientesConAbonos(clientesConAbonos) {
    if (clientesConAbonos.length === 0) {
        return mostrarInfo('Sin historial', 'No hay clientes con historial de abonos');
    }

    const listaClientes = clientesConAbonos.map(cliente => `
        <div class="cliente-abono-item" onclick="window.verHistorialCliente('${cliente.id}', '${cliente.nombre}')" 
             style="cursor: pointer; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 8px; background: #f8f9fa; transition: all 0.2s;">
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <h6 class="mb-1 text-primary">${cliente.nombre}</h6>
                    <small class="text-muted">
                        ${cliente.totalAbonos} abono(s) • Último: ${cliente.ultimoAbono.fecha}
                    </small>
                </div>
                <div class="text-success fw-bold">
                    ${cliente.ultimoAbono.monto.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}
                </div>
            </div>
        </div>
    `).join('');

    return Swal.fire({
        title: '📊 Historial de Abonos',
        html: `
            <div style="max-height: 400px; overflow-y: auto;">
                <p class="text-muted mb-3">Selecciona un cliente para ver su historial completo:</p>
                ${listaClientes}
            </div>
            <style>
                .cliente-abono-item:hover {
                    background: #e3f2fd !important;
                    border-color: #2196f3 !important;
                    transform: translateY(-1px);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
            </style>
        `,
        confirmButtonText: '✅ Cerrar',
        confirmButtonColor: '#007bff',
        width: '600px'
    });
}

/**
 * Muestra el historial detallado de abonos de un cliente específico
 * @param {Array} abonos - Array de abonos del cliente
 * @param {string} nombreCliente - Nombre del cliente
 */
export async function mostrarModalHistorialCliente(abonos, nombreCliente) {
    // Ordenar abonos del más reciente al más antiguo
    const abonosOrdenados = [...abonos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    const totalAbonado = abonos.reduce((sum, abono) => sum + abono.monto, 0);
    
    const listaAbonos = abonosOrdenados.map((abono, index) => `
        <div class="abono-detalle" style="padding: 12px; margin: 8px 0; border-left: 4px solid #28a745; background: #f8f9fa; border-radius: 4px;">
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <h6 class="mb-1 text-success">Abono #${abonosOrdenados.length - index}</h6>
                    <div class="small text-muted">
                        <div><strong>📅 Fecha:</strong> ${abono.fecha}</div>
                        <div><strong>💳 Medio:</strong> ${abono.medioPago}</div>
                        <div><strong>🎯 Turno:</strong> ${abono.turno}</div>
                        ${abono.saldoAnterior ? `<div><strong>💰 Saldo anterior:</strong> ${abono.saldoAnterior.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</div>` : ''}
                        ${abono.saldoRestante !== undefined ? `<div><strong>💸 Saldo restante:</strong> ${abono.saldoRestante.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</div>` : ''}
                    </div>
                </div>
                <div class="text-success fw-bold fs-5">
                    ${abono.monto.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}
                </div>
            </div>
        </div>
    `).join('');

    return Swal.fire({
        title: `📈 Historial de ${nombreCliente}`,
        html: `
            <div class="mb-3 p-3 bg-primary text-white rounded">
                <h5 class="mb-0">💎 Total Abonado: ${totalAbonado.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</h5>
                <small>${abonos.length} abono(s) registrado(s)</small>
            </div>
            <div style="max-height: 400px; overflow-y: auto;">
                ${listaAbonos}
            </div>
        `,
        confirmButtonText: '⬅️ Volver a la lista',
        confirmButtonColor: '#007bff',
        width: '700px'
    }).then((result) => {
        if (result.isConfirmed) {
            // Volver a mostrar la lista de clientes
            window.mostrarHistorialAbonosGeneral();
        }
    });
}
