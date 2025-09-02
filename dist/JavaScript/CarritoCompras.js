// === IMPORTACIONES REQUERIDAS ===
import { buscarProductoPorId, verificarDisponibilidad } from "./Inventario.js";

// === ESTADO INTERNO DEL MÓDULO ===
let carritoInterno = new Map(); // Usar Map para mejor performance
let carritoId = null;
let configuracionCarrito = {
    aplicarIVA: true,
    porcentajeIVA: 0.19,
    aplicarDescuentos: true,
    maxItemsPorProducto: 1000,
    persistirEnLocalStorage: true
};

// === CONSTANTES ===
const EVENTOS_CARRITO = {
    ITEM_AGREGADO: 'item_agregado',
    ITEM_ACTUALIZADO: 'item_actualizado', 
    ITEM_ELIMINADO: 'item_eliminado',
    CARRITO_VACIADO: 'carrito_vaciado',
    TOTAL_ACTUALIZADO: 'total_actualizado'
};

const STORAGE_KEY = 'pos_carrito_actual';

// === FUNCIONES DE VALIDACIÓN ===
function validarProductoParaCarrito(producto) {
    const errores = [];
    
    if (!producto) {
        errores.push({ field: 'producto', message: 'Producto requerido' });
        return errores;
    }
    
    if (!producto.id) {
        errores.push({ field: 'id', message: 'ID del producto requerido' });
    }
    
    if (!producto.nombre?.trim()) {
        errores.push({ field: 'nombre', message: 'Nombre del producto requerido' });
    }
    
    if (typeof producto.precio !== 'number' || producto.precio < 0) {
        errores.push({ field: 'precio', message: 'Precio inválido' });
    }
    
    return errores;
}

function validarCantidad(cantidad) {
    if (typeof cantidad !== 'number' || cantidad <= 0) {
        return { valid: false, message: 'La cantidad debe ser un número positivo' };
    }
    
    if (!Number.isInteger(cantidad)) {
        return { valid: false, message: 'La cantidad debe ser un número entero' };
    }
    
    if (cantidad > configuracionCarrito.maxItemsPorProducto) {
        return { 
            valid: false, 
            message: `Cantidad máxima permitida: ${configuracionCarrito.maxItemsPorProducto}` 
        };
    }
    
    return { valid: true };
}

// === FUNCIONES DE CÁLCULO ===
function calcularSubtotalItem(precio, cantidad) {
    return Math.round(precio * cantidad * 100) / 100;
}

function calcularTotalesCarrito() {
    let subtotal = 0;
    let cantidadTotal = 0;
    
    carritoInterno.forEach(item => {
        subtotal += calcularSubtotalItem(item.precio, item.cantidad);
        cantidadTotal += item.cantidad;
    });
    
    const iva = configuracionCarrito.aplicarIVA ? 
        Math.round(subtotal * configuracionCarrito.porcentajeIVA * 100) / 100 : 0;
    
    const total = Math.round((subtotal + iva) * 100) / 100;
    
    return {
        subtotal,
        iva,
        total,
        cantidadTotal,
        cantidadItems: carritoInterno.size
    };
}

// === FUNCIONES DE PERSISTENCIA ===
function guardarEnLocalStorage() {
    if (!configuracionCarrito.persistirEnLocalStorage) return;
    
    try {
        const carritoData = {
            id: carritoId,
            items: Array.from(carritoInterno.entries()).map(([id, item]) => [id, item]),
            timestamp: Date.now(),
            version: '1.0'
        };
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(carritoData));
        console.log('💾 Carrito guardado en localStorage');
    } catch (error) {
        console.error('❌ Error guardando carrito en localStorage:', error);
    }
}

function cargarDesdeLocalStorage() {
    if (!configuracionCarrito.persistirEnLocalStorage) return false;
    
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return false;
        
        const carritoData = JSON.parse(stored);
        
        // Verificar versión y validez
        if (!carritoData.version || !carritoData.items) {
            console.warn('⚠️ Formato de carrito en localStorage obsoleto');
            return false;
        }
        
        // Verificar que no sea demasiado antiguo (24 horas)
        const horasTranscurridas = (Date.now() - carritoData.timestamp) / (1000 * 60 * 60);
        if (horasTranscurridas > 24) {
            console.warn('⚠️ Carrito en localStorage demasiado antiguo, se descarta');
            localStorage.removeItem(STORAGE_KEY);
            return false;
        }
        
        // Restaurar datos
        carritoId = carritoData.id;
        carritoInterno.clear();
        
        carritoData.items.forEach(([id, item]) => {
            carritoInterno.set(id, item);
        });
        
        console.log('📦 Carrito restaurado desde localStorage');
        return true;
        
    } catch (error) {
        console.error('❌ Error cargando carrito desde localStorage:', error);
        localStorage.removeItem(STORAGE_KEY);
        return false;
    }
}

function limpiarLocalStorage() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        console.log('🗑️ Carrito eliminado de localStorage');
    } catch (error) {
        console.error('❌ Error limpiando localStorage:', error);
    }
}

// === FUNCIONES PRINCIPALES DEL CARRITO ===

/**
 * Inicializa el carrito
 * @param {Object} config - Configuración opcional
 * @returns {Object} Estado inicial del carrito
 */
export function inicializarCarrito(config = {}) {
    // Aplicar configuración personalizada
    configuracionCarrito = { ...configuracionCarrito, ...config };
    
    // Generar ID único para el carrito
    carritoId = `carrito_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
    // Intentar cargar carrito previo
    const cargado = cargarDesdeLocalStorage();
    
    if (!cargado) {
        carritoInterno.clear();
    }
    
    console.log('🛒 Carrito inicializado:', carritoId);
    
    return obtenerEstadoCarrito();
}

/**
 * Agrega un producto al carrito
 * @param {string} productId - ID del producto
 * @param {number} cantidad - Cantidad a agregar
 * @param {Object} opciones - Opciones adicionales
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function agregarAlCarrito(productId, cantidad = 1, opciones = {}) {
    try {
        // Validar cantidad
        const validacionCantidad = validarCantidad(cantidad);
        if (!validacionCantidad.valid) {
            throw {
                code: 'validation/invalid-quantity',
                message: validacionCantidad.message
            };
        }
        
        // Obtener información del producto
        const producto = await buscarProductoPorId(productId);
        if (!producto) {
            throw {
                code: 'product/not-found',
                message: 'Producto no encontrado'
            };
        }
        
        // Validar producto
        const erroresProducto = validarProductoParaCarrito(producto);
        if (erroresProducto.length > 0) {
            throw {
                code: 'validation/invalid-product',
                message: 'Producto inválido',
                errors: erroresProducto
            };
        }
        
        // Verificar disponibilidad si no se fuerza
        if (!opciones.forzarAgregar) {
            const cantidadExistente = carritoInterno.has(productId) ? 
                carritoInterno.get(productId).cantidad : 0;
            
            const cantidadTotal = cantidadExistente + cantidad;
            
            const disponibilidad = await verificarDisponibilidad(productId, cantidadTotal);
            if (!disponibilidad.disponible) {
                throw {
                    code: 'inventory/insufficient-stock',
                    message: `Stock insuficiente. Disponible: ${disponibilidad.cantidadDisponible}, En carrito: ${cantidadExistente}, Solicitado: ${cantidad}`,
                    disponibilidad
                };
            }
        }
        
        // Agregar o actualizar item en el carrito
        let itemAnterior = null;
        if (carritoInterno.has(productId)) {
            itemAnterior = { ...carritoInterno.get(productId) };
            const item = carritoInterno.get(productId);
            item.cantidad += cantidad;
            item.subtotal = calcularSubtotalItem(item.precio, item.cantidad);
            item.fechaActualizacion = new Date().toISOString();
        } else {
            const nuevoItem = {
                id: producto.id,
                nombre: producto.nombre,
                precio: producto.precio,
                cantidad: cantidad,
                subtotal: calcularSubtotalItem(producto.precio, cantidad),
                categoria: producto.categoria || 'Sin categoría',
                fechaAgregado: new Date().toISOString(),
                fechaActualizacion: new Date().toISOString()
            };
            carritoInterno.set(productId, nuevoItem);
        }
        
        // Guardar en localStorage
        guardarEnLocalStorage();
        
        // Calcular nuevos totales
        const totales = calcularTotalesCarrito();
        
        const resultado = {
            success: true,
            action: itemAnterior ? 'actualizado' : 'agregado',
            item: { ...carritoInterno.get(productId) },
            itemAnterior,
            cantidadAgregada: cantidad,
            totales,
            message: `${producto.nombre} ${itemAnterior ? 'actualizado en' : 'agregado al'} carrito`
        };
        
        console.log(`✅ Producto ${resultado.action}: ${producto.nombre} (${cantidad})`);
        
        // Emitir evento si hay listeners
        emitirEvento(itemAnterior ? EVENTOS_CARRITO.ITEM_ACTUALIZADO : EVENTOS_CARRITO.ITEM_AGREGADO, resultado);
        
        return resultado;
        
    } catch (error) {
        console.error('❌ Error agregando al carrito:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'cart/add-error',
            message: 'Error al agregar producto al carrito',
            originalError: error
        };
    }
}

/**
 * Actualiza la cantidad de un producto en el carrito
 * @param {string} productId - ID del producto
 * @param {number} nuevaCantidad - Nueva cantidad
 * @param {Object} opciones - Opciones adicionales
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function actualizarCantidad(productId, nuevaCantidad, opciones = {}) {
    try {
        if (!carritoInterno.has(productId)) {
            throw {
                code: 'cart/item-not-found',
                message: 'Producto no está en el carrito'
            };
        }
        
        // Si la nueva cantidad es 0, eliminar el item
        if (nuevaCantidad === 0) {
            return await eliminarDelCarrito(productId);
        }
        
        // Validar nueva cantidad
        const validacionCantidad = validarCantidad(nuevaCantidad);
        if (!validacionCantidad.valid) {
            throw {
                code: 'validation/invalid-quantity',
                message: validacionCantidad.message
            };
        }
        
        const itemAnterior = { ...carritoInterno.get(productId) };
        
        // Verificar disponibilidad si no se fuerza
        if (!opciones.forzarActualizar) {
            const disponibilidad = await verificarDisponibilidad(productId, nuevaCantidad);
            if (!disponibilidad.disponible) {
                throw {
                    code: 'inventory/insufficient-stock',
                    message: `Stock insuficiente. Disponible: ${disponibilidad.cantidadDisponible}, Solicitado: ${nuevaCantidad}`,
                    disponibilidad
                };
            }
        }
        
        // Actualizar item
        const item = carritoInterno.get(productId);
        item.cantidad = nuevaCantidad;
        item.subtotal = calcularSubtotalItem(item.precio, nuevaCantidad);
        item.fechaActualizacion = new Date().toISOString();
        
        // Guardar en localStorage
        guardarEnLocalStorage();
        
        // Calcular nuevos totales
        const totales = calcularTotalesCarrito();
        
        const resultado = {
            success: true,
            action: 'cantidad_actualizada',
            item: { ...item },
            itemAnterior,
            cantidadAnterior: itemAnterior.cantidad,
            nuevaCantidad,
            diferencia: nuevaCantidad - itemAnterior.cantidad,
            totales,
            message: `Cantidad de ${item.nombre} actualizada`
        };
        
        console.log(`✅ Cantidad actualizada: ${item.nombre} (${itemAnterior.cantidad} → ${nuevaCantidad})`);
        
        // Emitir evento
        emitirEvento(EVENTOS_CARRITO.ITEM_ACTUALIZADO, resultado);
        
        return resultado;
        
    } catch (error) {
        console.error('❌ Error actualizando cantidad:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'cart/update-error',
            message: 'Error al actualizar cantidad en el carrito',
            originalError: error
        };
    }
}

/**
 * Elimina un producto del carrito
 * @param {string} productId - ID del producto
 * @returns {Object} Resultado de la operación
 */
export function eliminarDelCarrito(productId) {
    try {
        if (!carritoInterno.has(productId)) {
            throw {
                code: 'cart/item-not-found',
                message: 'Producto no está en el carrito'
            };
        }
        
        const itemEliminado = { ...carritoInterno.get(productId) };
        carritoInterno.delete(productId);
        
        // Guardar en localStorage
        guardarEnLocalStorage();
        
        // Calcular nuevos totales
        const totales = calcularTotalesCarrito();
        
        const resultado = {
            success: true,
            action: 'eliminado',
            itemEliminado,
            totales,
            message: `${itemEliminado.nombre} eliminado del carrito`
        };
        
        console.log(`🗑️ Producto eliminado del carrito: ${itemEliminado.nombre}`);
        
        // Emitir evento
        emitirEvento(EVENTOS_CARRITO.ITEM_ELIMINADO, resultado);
        
        return resultado;
        
    } catch (error) {
        console.error('❌ Error eliminando del carrito:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'cart/remove-error',
            message: 'Error al eliminar producto del carrito',
            originalError: error
        };
    }
}

/**
 * Vacía completamente el carrito
 * @returns {Object} Resultado de la operación
 */
export function vaciarCarrito() {
    try {
        const itemsAnteriores = Array.from(carritoInterno.values());
        const totalesAnteriores = calcularTotalesCarrito();
        
        carritoInterno.clear();
        limpiarLocalStorage();
        
        const resultado = {
            success: true,
            action: 'vaciado',
            itemsEliminados: itemsAnteriores,
            totalesAnteriores,
            cantidadItemsEliminados: itemsAnteriores.length,
            message: 'Carrito vaciado completamente'
        };
        
        console.log('🗑️ Carrito vaciado completamente');
        
        // Emitir evento
        emitirEvento(EVENTOS_CARRITO.CARRITO_VACIADO, resultado);
        
        return resultado;
        
    } catch (error) {
        console.error('❌ Error vaciando carrito:', error);
        throw {
            code: 'cart/clear-error',
            message: 'Error al vaciar el carrito',
            originalError: error
        };
    }
}

// === FUNCIONES DE CONSULTA ===

/**
 * Obtiene el estado completo del carrito
 * @returns {Object} Estado del carrito
 */
export function obtenerEstadoCarrito() {
    const items = Array.from(carritoInterno.values());
    const totales = calcularTotalesCarrito();
    
    return {
        id: carritoId,
        items,
        totales,
        estaVacio: items.length === 0,
        configuracion: { ...configuracionCarrito },
        timestamp: Date.now()
    };
}

/**
 * Obtiene un item específico del carrito
 * @param {string} productId - ID del producto
 * @returns {Object|null} Item del carrito o null si no existe
 */
export function obtenerItemCarrito(productId) {
    if (!carritoInterno.has(productId)) {
        return null;
    }
    
    return { ...carritoInterno.get(productId) };
}

/**
 * Verifica si un producto está en el carrito
 * @param {string} productId - ID del producto
 * @returns {boolean} True si está en el carrito
 */
export function estaEnCarrito(productId) {
    return carritoInterno.has(productId);
}

/**
 * Obtiene la cantidad de un producto en el carrito
 * @param {string} productId - ID del producto
 * @returns {number} Cantidad del producto (0 si no está)
 */
export function obtenerCantidadEnCarrito(productId) {
    if (!carritoInterno.has(productId)) {
        return 0;
    }
    
    return carritoInterno.get(productId).cantidad;
}

/**
 * Obtiene solo los items del carrito (array)
 * @returns {Array} Array de items
 */
export function obtenerItemsCarrito() {
    return Array.from(carritoInterno.values());
}

/**
 * Obtiene solo los totales del carrito
 * @returns {Object} Totales calculados
 */
export function obtenerTotalesCarrito() {
    return calcularTotalesCarrito();
}

// === FUNCIONES DE VALIDACIÓN Y VERIFICACIÓN ===

/**
 * Valida todo el carrito antes de procesar venta
 * @returns {Promise<Object>} Resultado de la validación
 */
export async function validarCarritoCompleto() {
    try {
        const items = obtenerItemsCarrito();
        
        if (items.length === 0) {
            return {
                valido: false,
                errores: ['El carrito está vacío'],
                warnings: []
            };
        }
        
        const errores = [];
        const warnings = [];
        const verificacionesStock = [];
        
        // Verificar cada item
        for (const item of items) {
            // Validar estructura del item
            const erroresItem = validarProductoParaCarrito(item);
            if (erroresItem.length > 0) {
                errores.push(`Producto ${item.nombre || item.id}: ${erroresItem.map(e => e.message).join(', ')}`);
                continue;
            }
            
            // Verificar stock
            try {
                const disponibilidad = await verificarDisponibilidad(item.id, item.cantidad);
                verificacionesStock.push({
                    productId: item.id,
                    nombre: item.nombre,
                    ...disponibilidad
                });
                
                if (!disponibilidad.disponible) {
                    errores.push(`${item.nombre}: Stock insuficiente (disponible: ${disponibilidad.cantidadDisponible}, en carrito: ${item.cantidad})`);
                } else if (disponibilidad.cantidadDisponible < item.cantidad * 2) {
                    warnings.push(`${item.nombre}: Stock bajo (disponible: ${disponibilidad.cantidadDisponible})`);
                }
            } catch (error) {
                errores.push(`${item.nombre}: Error verificando stock - ${error.message}`);
            }
        }
        
        return {
            valido: errores.length === 0,
            errores,
            warnings,
            verificacionesStock,
            resumenValidacion: `${items.length} items validados, ${errores.length} errores, ${warnings.length} advertencias`
        };
        
    } catch (error) {
        console.error('❌ Error validando carrito:', error);
        return {
            valido: false,
            errores: ['Error interno validando el carrito'],
            warnings: [],
            error: error.message
        };
    }
}

// === SISTEMA DE EVENTOS ===
const eventListeners = new Map();

/**
 * Suscribe a eventos del carrito
 * @param {string} evento - Nombre del evento
 * @param {Function} callback - Función a ejecutar
 * @returns {Function} Función para desuscribirse
 */
export function suscribirEventoCarrito(evento, callback) {
    if (!eventListeners.has(evento)) {
        eventListeners.set(evento, new Set());
    }
    
    eventListeners.get(evento).add(callback);
    
    // Retornar función para desuscribirse
    return () => {
        const listeners = eventListeners.get(evento);
        if (listeners) {
            listeners.delete(callback);
        }
    };
}

function emitirEvento(evento, data) {
    const listeners = eventListeners.get(evento);
    if (listeners) {
        listeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`❌ Error en listener de evento ${evento}:`, error);
            }
        });
    }
}

// === FUNCIONES DE UTILIDAD ===

/**
 * Aplica un descuento al total del carrito
 * @param {number} descuento - Monto del descuento
 * @param {string} tipo - Tipo de descuento ('monto' o 'porcentaje')
 * @returns {Object} Totales con descuento aplicado
 */
export function aplicarDescuento(descuento, tipo = 'monto') {
    const totalesBase = calcularTotalesCarrito();
    
    let montoDescuento = 0;
    if (tipo === 'porcentaje') {
        montoDescuento = Math.round(totalesBase.subtotal * (descuento / 100) * 100) / 100;
    } else {
        montoDescuento = Math.round(descuento * 100) / 100;
    }
    
    const totalConDescuento = Math.max(0, totalesBase.total - montoDescuento);
    
    return {
        ...totalesBase,
        descuento: montoDescuento,
        tipoDescuento: tipo,
        totalConDescuento,
        porcentajeDescuento: tipo === 'porcentaje' ? descuento : 
            Math.round((montoDescuento / totalesBase.subtotal) * 100 * 100) / 100
    };
}

/**
 * Exporta el carrito en formato para procesamiento de ventas
 * @returns {Object} Carrito en formato de venta
 */
export function exportarParaVenta() {
    const estado = obtenerEstadoCarrito();
    
    return {
        items: estado.items.map(item => ({
            id: item.id,
            nombre: item.nombre,
            precio: item.precio,
            cantidad: item.cantidad,
            subtotal: item.subtotal
        })),
        totales: estado.totales,
        metadata: {
            carritoId: estado.id,
            fechaExportacion: new Date().toISOString(),
            cantidadItems: estado.totales.cantidadItems
        }
    };
}

// === FUNCIONES DE COMPATIBILIDAD ===
// Para mantener compatibilidad con código existente

export function renderCarrito() {
    console.warn('⚠️ renderCarrito() está deprecada. Use las nuevas APIs de estado y eventos.');
    return obtenerEstadoCarrito();
}

// Exportar el carrito como propiedad global para compatibilidad
if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'carrito', {
        get: () => {
            console.warn('⚠️ window.carrito está deprecado. Use las nuevas APIs del módulo CarritoCompras.');
            return obtenerItemsCarrito();
        }
    });
}

// === INICIALIZACIÓN AUTOMÁTICA ===
// Inicializar carrito automáticamente cuando se carga el módulo
if (typeof document !== 'undefined') {
    // Solo en el navegador
    inicializarCarrito();
}

// === EXPORTACIONES DE CONSTANTES ===
export { EVENTOS_CARRITO };

// === LOGGING DE DEBUG (SOLO EN DESARROLLO) ===
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.group('🛒 Shopping Cart Module Debug Info');
    console.log('Carrito ID:', carritoId);
    console.log('Configuración:', configuracionCarrito);
    console.log('Eventos disponibles:', EVENTOS_CARRITO);
    console.log('Storage key:', STORAGE_KEY);
    console.groupEnd();
}