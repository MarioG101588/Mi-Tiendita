// === IMPORTACIONES REQUERIDAS ===
import { 
    getFirestore, 
    collection, 
    addDoc, 
    serverTimestamp,
    doc,
    getDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { app } from "./Conexion.js";
import { actualizarStock, verificarDisponibilidad } from "./Inventario.js";
import { getCurrentUser, getCurrentTurnoId } from "./Autenticacion.js";

// === INICIALIZACIÓN DE SERVICIOS ===
const db = getFirestore(app);

// === ESTADO INTERNO DEL MÓDULO ===
let ventasEnProceso = new Map(); // Ventas que están siendo procesadas
let estadisticasVentas = {
    totalVentas: 0,
    montoTotalDia: 0,
    ventasExitosas: 0,
    ventasFallidas: 0
};

// === CONSTANTES DE CONFIGURACIÓN ===
const TIPOS_PAGO = {
    EFECTIVO: 'efectivo',
    TARJETA: 'tarjeta',
    TRANSFERENCIA: 'transferencia',
    CUENTA: 'cuenta'
};

const ESTADOS_VENTA = {
    PENDIENTE: 'pendiente',
    COMPLETADA: 'completada',
    CANCELADA: 'cancelada',
    ERROR: 'error'
};

const IVA_PORCENTAJE = 0.19; // 19% de IVA

// === FUNCIONES DE VALIDACIÓN ===
function validarItemsVenta(items) {
    const errores = [];
    
    if (!Array.isArray(items) || items.length === 0) {
        errores.push({ 
            field: 'items', 
            message: 'La venta debe contener al menos un producto' 
        });
        return errores;
    }
    
    items.forEach((item, index) => {
        if (!item.id) {
            errores.push({ 
                field: `items[${index}].id`, 
                message: `Producto en posición ${index + 1} no tiene ID válido` 
            });
        }
        
        if (!item.nombre?.trim()) {
            errores.push({ 
                field: `items[${index}].nombre`, 
                message: `Producto en posición ${index + 1} no tiene nombre` 
            });
        }
        
        if (typeof item.cantidad !== 'number' || item.cantidad <= 0) {
            errores.push({ 
                field: `items[${index}].cantidad`, 
                message: `Cantidad inválida para producto ${item.nombre || index + 1}` 
            });
        }
        
        if (typeof item.precio !== 'number' || item.precio < 0) {
            errores.push({ 
                field: `items[${index}].precio`, 
                message: `Precio inválido para producto ${item.nombre || index + 1}` 
            });
        }
    });
    
    return errores;
}

function validarDatosVenta(datosVenta) {
    const errores = [];
    
    if (!datosVenta.tipoPago || !Object.values(TIPOS_PAGO).includes(datosVenta.tipoPago)) {
        errores.push({ 
            field: 'tipoPago', 
            message: 'Tipo de pago inválido' 
        });
    }
    
    if (typeof datosVenta.total !== 'number' || datosVenta.total <= 0) {
        errores.push({ 
            field: 'total', 
            message: 'Total de la venta inválido' 
        });
    }
    
    if (datosVenta.tipoPago === TIPOS_PAGO.CUENTA && !datosVenta.clienteId?.trim()) {
        errores.push({ 
            field: 'clienteId', 
            message: 'Cliente requerido para venta a cuenta' 
        });
    }
    
    if (datosVenta.descuento && (typeof datosVenta.descuento !== 'number' || datosVenta.descuento < 0)) {
        errores.push({ 
            field: 'descuento', 
            message: 'Descuento inválido' 
        });
    }
    
    return errores;
}

// === FUNCIONES DE CÁLCULO ===
function calcularSubtotal(items) {
    return items.reduce((total, item) => {
        return total + (item.precio * item.cantidad);
    }, 0);
}

function calcularIVA(subtotal) {
    return subtotal * IVA_PORCENTAJE;
}

function calcularTotal(subtotal, iva, descuento = 0) {
    return Math.max(0, subtotal + iva - descuento);
}

function calcularResumenVenta(items, descuento = 0) {
    const subtotal = calcularSubtotal(items);
    const iva = calcularIVA(subtotal);
    const total = calcularTotal(subtotal, iva, descuento);
    
    return {
        subtotal: Math.round(subtotal * 100) / 100,
        iva: Math.round(iva * 100) / 100,
        descuento: Math.round(descuento * 100) / 100,
        total: Math.round(total * 100) / 100,
        cantidadItems: items.reduce((sum, item) => sum + item.cantidad, 0)
    };
}

// === FUNCIONES DE VERIFICACIÓN DE STOCK ===
async function verificarStockCompleto(items) {
    const verificaciones = [];
    
    for (const item of items) {
        try {
            const disponibilidad = await verificarDisponibilidad(item.id, item.cantidad);
            verificaciones.push({
                productId: item.id,
                nombre: item.nombre,
                solicitado: item.cantidad,
                ...disponibilidad
            });
        } catch (error) {
            verificaciones.push({
                productId: item.id,
                nombre: item.nombre,
                solicitado: item.cantidad,
                disponible: false,
                motivo: 'Error verificando disponibilidad',
                cantidadDisponible: 0,
                error: error.message
            });
        }
    }
    
    return verificaciones;
}

function analizarDisponibilidad(verificaciones) {
    const productosNoDisponibles = verificaciones.filter(v => !v.disponible);
    const stockInsuficiente = verificaciones.filter(v => 
        v.disponible === false && v.motivo === 'Stock insuficiente'
    );
    
    return {
        todoDisponible: productosNoDisponibles.length === 0,
        productosNoDisponibles,
        stockInsuficiente,
        resumen: `${verificaciones.length - productosNoDisponibles.length}/${verificaciones.length} productos disponibles`
    };
}

// === FUNCIÓN PRINCIPAL DE PROCESAMIENTO DE VENTAS ===
export async function procesarVenta(items, tipoPago, opciones = {}) {
    const ventaId = `venta_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
    try {
        // 1. Validaciones iniciales
        const erroresItems = validarItemsVenta(items);
        if (erroresItems.length > 0) {
            throw {
                code: 'validation/invalid-items',
                message: 'Items de venta inválidos',
                errors: erroresItems
            };
        }
        
        const datosVenta = {
            tipoPago,
            total: opciones.total || 0,
            clienteId: opciones.clienteId,
            descuento: opciones.descuento || 0,
            observaciones: opciones.observaciones || ''
        };
        
        const erroresVenta = validarDatosVenta(datosVenta);
        if (erroresVenta.length > 0) {
            throw {
                code: 'validation/invalid-sale-data',
                message: 'Datos de venta inválidos',
                errors: erroresVenta
            };
        }
        
        // 2. Marcar venta como en proceso
        ventasEnProceso.set(ventaId, {
            estado: ESTADOS_VENTA.PENDIENTE,
            items,
            timestamp: Date.now()
        });
        
        console.log(`🛒 Iniciando procesamiento de venta: ${ventaId}`);
        
        // 3. Verificar disponibilidad de stock
        const verificacionesStock = await verificarStockCompleto(items);
        const analisisStock = analizarDisponibilidad(verificacionesStock);
        
        if (!analisisStock.todoDisponible) {
            ventasEnProceso.delete(ventaId);
            throw {
                code: 'inventory/insufficient-stock',
                message: 'Stock insuficiente para completar la venta',
                stockInsuficiente: analisisStock.productosNoDisponibles,
                verificaciones: verificacionesStock
            };
        }
        
        // 4. Calcular totales
        const resumen = calcularResumenVenta(items, datosVenta.descuento);
        
        // Verificar que el total calculado coincide con el proporcionado
        if (datosVenta.total > 0 && Math.abs(datosVenta.total - resumen.total) > 0.01) {
            console.warn(`⚠️ Diferencia en totales: Calculado ${resumen.total}, Proporcionado ${datosVenta.total}`);
        }
        
        // 5. Obtener información del usuario y turno actual
        const usuario = getCurrentUser();
        const turnoId = getCurrentTurnoId();
        
        if (!usuario) {
            ventasEnProceso.delete(ventaId);
            throw {
                code: 'auth/user-required',
                message: 'Usuario no autenticado'
            };
        }
        
        if (!turnoId) {
            ventasEnProceso.delete(ventaId);
            throw {
                code: 'auth/turno-required',
                message: 'No hay turno activo'
            };
        }
        
        // 6. Preparar datos completos de la venta
        const ventaCompleta = {
            ventaId,
            items: items.map(item => ({
                productId: item.id,
                nombre: item.nombre,
                cantidad: item.cantidad,
                precio: item.precio,
                subtotal: item.precio * item.cantidad
            })),
            resumen,
            tipoPago: datosVenta.tipoPago,
            clienteId: datosVenta.clienteId || null,
            observaciones: datosVenta.observaciones,
            usuario: usuario.email,
            turnoId,
            estado: ESTADOS_VENTA.COMPLETADA,
            fechaCreacion: serverTimestamp(),
            timestamp: Date.now()
        };
        
        // 7. Procesar según tipo de pago
        let resultadoPago;
        switch (tipoPago) {
            case TIPOS_PAGO.CUENTA:
                resultadoPago = await procesarVentaCuenta(ventaCompleta);
                break;
            case TIPOS_PAGO.EFECTIVO:
            case TIPOS_PAGO.TARJETA:
            case TIPOS_PAGO.TRANSFERENCIA:
                resultadoPago = await procesarVentaDirecta(ventaCompleta);
                break;
            default:
                throw {
                    code: 'validation/invalid-payment-type',
                    message: 'Tipo de pago no soportado'
                };
        }
        
        // 8. Actualizar stock de productos
        const actualizacionesStock = [];
        for (const item of items) {
            try {
                const resultado = await actualizarStock(item.id, item.cantidad);
                actualizacionesStock.push(resultado);
            } catch (error) {
                console.error(`❌ Error actualizando stock de ${item.id}:`, error);
                // En caso de error crítico, aquí deberías implementar rollback
                actualizacionesStock.push({
                    success: false,
                    productId: item.id,
                    error: error.message
                });
            }
        }
        
        // 9. Actualizar estadísticas
        estadisticasVentas.totalVentas++;
        estadisticasVentas.montoTotalDia += resumen.total;
        estadisticasVentas.ventasExitosas++;
        
        // 10. Limpiar estado de proceso
        ventasEnProceso.delete(ventaId);
        
        console.log(`✅ Venta procesada exitosamente: ${ventaId}`);
        
        return {
            success: true,
            ventaId,
            resumen,
            resultadoPago,
            actualizacionesStock,
            verificacionesStock,
            message: 'Venta procesada correctamente'
        };
        
    } catch (error) {
        // Limpiar estado en caso de error
        ventasEnProceso.delete(ventaId);
        estadisticasVentas.ventasFallidas++;
        
        console.error(`❌ Error procesando venta ${ventaId}:`, error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'sales/processing-error',
            message: 'Error procesando la venta',
            originalError: error
        };
    }
}

// === FUNCIONES ESPECIALIZADAS POR TIPO DE PAGO ===
async function procesarVentaDirecta(ventaCompleta) {
    try {
        // Guardar venta directamente en Firebase
        const ventaRef = await addDoc(collection(db, "ventas"), ventaCompleta);
        
        console.log(`💰 Venta directa registrada: ${ventaRef.id}`);
        
        return {
            tipo: 'venta_directa',
            documentId: ventaRef.id,
            estado: ESTADOS_VENTA.COMPLETADA,
            pagada: true
        };
        
    } catch (error) {
        console.error('❌ Error en venta directa:', error);
        throw {
            code: 'sales/direct-payment-error',
            message: 'Error procesando venta directa',
            originalError: error
        };
    }
}

async function procesarVentaCuenta(ventaCompleta) {
    try {
        // Para ventas a cuenta, necesitamos más información del cliente
        if (!ventaCompleta.clienteId) {
            throw {
                code: 'validation/client-required',
                message: 'Cliente requerido para venta a cuenta'
            };
        }
        
        // Verificar que el cliente existe
        const clienteRef = doc(db, "clientes", ventaCompleta.clienteId);
        const clienteSnap = await getDoc(clienteRef);
        
        if (!clienteSnap.exists()) {
            throw {
                code: 'client/not-found',
                message: 'Cliente no encontrado'
            };
        }
        
        const clienteData = clienteSnap.data();
        
        // Agregar información del cliente a la venta
        const ventaConCliente = {
            ...ventaCompleta,
            clienteInfo: {
                id: ventaCompleta.clienteId,
                nombre: clienteData.nombre,
                telefono: clienteData.telefono,
                email: clienteData.email
            },
            estado: ESTADOS_VENTA.PENDIENTE, // Las ventas a cuenta inician como pendientes
            pagada: false
        };
        
        // Guardar venta a cuenta
        const ventaRef = await addDoc(collection(db, "ventas"), ventaConCliente);
        
        // Actualizar cuenta del cliente
        const nuevoSaldo = (clienteData.saldoPendiente || 0) + ventaCompleta.resumen.total;
        await updateDoc(clienteRef, {
            saldoPendiente: nuevoSaldo,
            ultimaCompra: serverTimestamp(),
            totalCompras: (clienteData.totalCompras || 0) + ventaCompleta.resumen.total
        });
        
        console.log(`🏪 Venta a cuenta registrada: ${ventaRef.id} - Cliente: ${clienteData.nombre}`);
        
        return {
            tipo: 'venta_cuenta',
            documentId: ventaRef.id,
            estado: ESTADOS_VENTA.PENDIENTE,
            pagada: false,
            clienteInfo: ventaConCliente.clienteInfo,
            nuevoSaldoCliente: nuevoSaldo
        };
        
    } catch (error) {
        console.error('❌ Error en venta a cuenta:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'sales/account-payment-error',
            message: 'Error procesando venta a cuenta',
            originalError: error
        };
    }
}

// === FUNCIONES DE GESTIÓN DE VENTAS ===
export async function cancelarVenta(ventaId, motivo = '') {
    try {
        if (!ventaId) {
            throw {
                code: 'validation/venta-id-required',
                message: 'ID de venta requerido'
            };
        }
        
        // Buscar la venta
        const ventaRef = doc(db, "ventas", ventaId);
        const ventaSnap = await getDoc(ventaRef);
        
        if (!ventaSnap.exists()) {
            throw {
                code: 'sales/not-found',
                message: 'Venta no encontrada'
            };
        }
        
        const ventaData = ventaSnap.data();
        
        if (ventaData.estado === ESTADOS_VENTA.CANCELADA) {
            throw {
                code: 'sales/already-cancelled',
                message: 'La venta ya está cancelada'
            };
        }
        
        // Actualizar estado de la venta
        await updateDoc(ventaRef, {
            estado: ESTADOS_VENTA.CANCELADA,
            motivoCancelacion: motivo,
            fechaCancelacion: serverTimestamp(),
            canceladaPor: getCurrentUser()?.email
        });
        
        // Si era una venta a cuenta, revertir el saldo del cliente
        if (ventaData.tipoPago === TIPOS_PAGO.CUENTA && ventaData.clienteId) {
            const clienteRef = doc(db, "clientes", ventaData.clienteId);
            const clienteSnap = await getDoc(clienteRef);
            
            if (clienteSnap.exists()) {
                const clienteData = clienteSnap.data();
                const nuevoSaldo = Math.max(0, (clienteData.saldoPendiente || 0) - ventaData.resumen.total);
                
                await updateDoc(clienteRef, {
                    saldoPendiente: nuevoSaldo
                });
            }
        }
        
        // TODO: Implementar reversión de stock si es necesario
        
        console.log(`🚫 Venta cancelada: ${ventaId}`);
        
        return {
            success: true,
            ventaId,
            message: 'Venta cancelada correctamente'
        };
        
    } catch (error) {
        console.error('❌ Error cancelando venta:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'sales/cancellation-error',
            message: 'Error al cancelar la venta',
            originalError: error
        };
    }
}

export async function obtenerVenta(ventaId) {
    try {
        const ventaRef = doc(db, "ventas", ventaId);
        const ventaSnap = await getDoc(ventaRef);
        
        if (!ventaSnap.exists()) {
            return null;
        }
        
        return {
            id: ventaSnap.id,
            ...ventaSnap.data()
        };
        
    } catch (error) {
        console.error('❌ Error obteniendo venta:', error);
        throw {
            code: 'sales/fetch-error',
            message: 'Error al obtener la venta',
            originalError: error
        };
    }
}

// === FUNCIONES DE ESTADÍSTICAS ===
export function obtenerEstadisticasVentas() {
    return { ...estadisticasVentas };
}

export function resetearEstadisticasVentas() {
    estadisticasVentas = {
        totalVentas: 0,
        montoTotalDia: 0,
        ventasExitosas: 0,
        ventasFallidas: 0
    };
    console.log('📊 Estadísticas de ventas reseteadas');
}

export function obtenerVentasEnProceso() {
    return Array.from(ventasEnProceso.entries()).map(([id, data]) => ({
        ventaId: id,
        ...data
    }));
}

// === FUNCIONES DE UTILIDAD ===
export function calcularCambio(totalVenta, montoRecibido) {
    const cambio = montoRecibido - totalVenta;
    return {
        cambio: Math.round(cambio * 100) / 100,
        esValido: cambio >= 0,
        montoRecibido,
        totalVenta
    };
}

export function formatearMoneda(monto, moneda = 'COP') {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: moneda
    }).format(monto);
}

// === EXPORTACIONES DE CONSTANTES ===
export { TIPOS_PAGO, ESTADOS_VENTA };

// === FUNCIONES DE COMPATIBILIDAD ===
// Para mantener compatibilidad con código existente
export async function finalizarVenta(carrito, tipoPago = TIPOS_PAGO.EFECTIVO, opciones = {}) {
    console.warn('⚠️ finalizarVenta() está deprecada, usa procesarVenta()');
    
    try {
        // Convertir formato de carrito al formato esperado por procesarVenta
        const items = Array.isArray(carrito) ? carrito : Object.values(carrito || {});
        return await procesarVenta(items, tipoPago, opciones);
    } catch (error) {
        console.error('❌ Error en finalizarVenta:', error);
        throw error;
    }
}

// === LOGGING DE DEBUG (SOLO EN DESARROLLO) ===
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.group('💰 Sales Module Debug Info');
    console.log('DB instance:', db);
    console.log('Tipos de pago:', TIPOS_PAGO);
    console.log('Estados de venta:', ESTADOS_VENTA);
    console.log('IVA porcentaje:', IVA_PORCENTAJE);
    console.groupEnd();
}