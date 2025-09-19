// Carrito interno de productos (memoria temporal)
let carritoComprasInternas = [];

export function agregarProductoAlCarrito(producto) {
    carritoComprasInternas.push(producto);
}

export function obtenerCarritoCompras() {
    return [...carritoComprasInternas];
}

export function eliminarProductoDelCarrito(idx) {
    carritoComprasInternas.splice(idx, 1);
}

export function limpiarCarritoCompras() {
    carritoComprasInternas = [];
}

export function validarProductoCarrito(producto) {
    // Validación básica
    if (!producto.nombre || !producto.presentacion || !producto.unidades || !producto.precioPresentacion || !producto.cantidad || !producto.precioVenta) {
        return false;
    }
    return true;
}

export function actualizarProductoEnCarrito(idx, productoActualizado) {
    if (idx >= 0 && idx < carritoComprasInternas.length) {
        carritoComprasInternas[idx] = productoActualizado;
    }
}

// ComprasService.js
// Servicio de persistencia para el módulo de compras
import { db } from './Conexion.js';
import { collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { wrappedAddDoc, wrappedSetDoc, wrappedGetDocs, wrappedGetDoc, wrappedUpdateDoc } from './FirebaseWrapper.js';
import { registrarOperacion } from './FirebaseMetrics.js';

/**
 * Guardar compra en Firestore en la colección 'compras'
 * compra: { productos: [{nombre, precio, cantidad}], proveedor, metodoPago, total, creditoInfo?, timestamp }
 */
export async function guardarCompraEnBD(compra) {
    try {
        const colRef = collection(db, 'compras');
        const data = { ...compra, createdAt: serverTimestamp() };
        const res = await wrappedAddDoc(colRef, data);
        registrarOperacion('write', 1);
        return res.id || null;
    } catch (error) {
        console.error('Error guardarCompraEnBD:', error);
        throw error;
    }
}

/**
 * Guarda una compra a crédito en la colección 'ComprasCredito'
 * creditoInfo: { dias, fechaVencimiento, estado: 'pendiente', cuotaInicial? }
 */
export async function guardarCompraCredito(compra, creditoInfo) {
    try {
        const colRef = collection(db, 'ComprasCredito');
        const data = { ...compra, creditoInfo: { ...creditoInfo, estado: 'pendiente' }, createdAt: serverTimestamp() };
        const res = await wrappedAddDoc(colRef, data);
        registrarOperacion('write', 1);
        return res.id || null;
    } catch (error) {
        console.error('Error guardarCompraCredito:', error);
        throw error;
    }
}

export function calcularFechaVencimientoCompra(dias) {
    const hoy = new Date();
    hoy.setDate(hoy.getDate() + Number(dias || 0));
    return hoy.toISOString();
}

export async function cargarComprasRecientesDesdeBD(limitCount = 50) {
    try {
        const colRef = collection(db, 'compras');
        const snapshot = await wrappedGetDocs(colRef);
        const resultados = [];
        snapshot.forEach(doc => resultados.push({ id: doc.id, ...doc.data() }));
        registrarOperacion('read', snapshot.size || resultados.length);
        return resultados;
    } catch (error) {
        console.error('Error cargarComprasRecientesDesdeBD:', error);
        throw error;
    }
}

export async function obtenerDatosProductoDesdeInventario(nombreProducto) {
    try {
        const docRef = doc(collection(db, 'inventario'), nombreProducto);
        const snap = await getDoc(docRef);
        registrarOperacion('read', 1);
        if (!snap.exists()) return null;
        return snap.data();
    } catch (error) {
        console.error('Error obtenerDatosProductoDesdeInventario:', error);
        throw error;
    }
}

export async function actualizarInventarioProducto(nombreProducto, cambios) {
    try {
        const ref = doc(collection(db, 'inventario'), nombreProducto);
        await wrappedUpdateDoc(ref, cambios);
        registrarOperacion('write', 1);
        return true;
    } catch (error) {
        console.error('Error actualizarInventarioProducto:', error);
        throw error;
    }
}

// ---------- Funciones para proveedores ----------
export async function guardarProveedor(proveedorId, datos) {
    try {
        const ref = doc(collection(db, 'proveedores'), proveedorId || datos.nombre);
        await wrappedSetDoc(ref, { ...datos, actualizado: serverTimestamp() }, { merge: true });
        registrarOperacion('write', 1);
        return true;
    } catch (error) {
        console.error('Error guardarProveedor:', error);
        throw error;
    }
}

export async function obtenerProveedor(proveedorId) {
    try {
        const ref = doc(collection(db, 'proveedores'), proveedorId);
        const snap = await wrappedGetDoc(ref);
        registrarOperacion('read', 1);
        if (!snap.exists()) return null;
        return snap.data();
    } catch (error) {
        console.error('Error obtenerProveedor:', error);
        throw error;
    }
}

export async function buscarProveedores(termino) {
    try {
        const snapshot = await wrappedGetDocs(collection(db, 'proveedores'));
        const resultados = [];
        const lower = (termino || '').toLowerCase();
        snapshot.forEach(d => {
            const data = d.data();
            if (!termino || d.id.toLowerCase().includes(lower) || (data.nombre && data.nombre.toLowerCase().includes(lower))) {
                resultados.push({ id: d.id, ...data });
            }
        });
        registrarOperacion('read', snapshot.size || resultados.length);
        return resultados;
    } catch (error) {
        console.error('Error buscarProveedores:', error);
        throw error;
    }
}
