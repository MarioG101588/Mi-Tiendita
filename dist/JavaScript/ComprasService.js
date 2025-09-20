// ComprasService.js
// Servicio de persistencia para el módulo de compras
import { db } from './Conexion.js';
// Se añaden las funciones necesarias para realizar la consulta del turno activo
import { collection, doc, getDoc, writeBatch, addDoc, setDoc, getDocs, updateDoc, serverTimestamp, query, where, increment, arrayUnion } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js'; // <-- CAMBIO: Se añaden query y where
import { wrappedAddDoc, wrappedSetDoc, wrappedGetDocs, wrappedGetDoc, wrappedUpdateDoc } from './FirebaseWrapper.js';
import { registrarOperacion } from './FirebaseMetrics.js';

// --- CAMBIO: La función ahora es asíncrona y busca en Firestore ---
/**
 * Busca en la colección 'turnos' el documento que tenga el campo estado = "activo".
 * @returns {string|null} El valor del campo 'idturno' o null si no se encuentra.
 */
async function obtenerIdTurnoActivo() {
    try {
        const turnosRef = collection(db, 'turnos');
        const q = query(turnosRef, where("estado", "==", "activo"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.error("No se encontró ningún turno con estado 'activo'.");
            return null;
        }

        // Se asume que solo hay un turno activo a la vez
        const turnoActivoDoc = querySnapshot.docs[0];
        const idTurno = turnoActivoDoc.data().idTurno;

        if (!idTurno) {
            console.error("El documento del turno activo no contiene el campo 'idturno'.");
            return null;
        }

        return idTurno;

    } catch (error) {
        console.error("Error al buscar el turno activo:", error);
        throw new Error("No se pudo consultar la base de datos de turnos.");
    }
}


// --- NUEVA FUNCIÓN PRINCIPAL PARA PROCESAR LA COMPRA ---

export async function procesarYGuardarCompra() {
    const carrito = obtenerCarritoCompras();
    if (carrito.length === 0) {
        throw new Error("El carrito está vacío. No hay nada que procesar.");
    }

    const idTurno = await obtenerIdTurnoActivo(); // <-- CAMBIO: Se usa 'await' porque la función ahora es asíncrona
    if (!idTurno) {
        throw new Error("No se pudo determinar el turno activo. La compra no puede continuar.");
    }

    const batch = writeBatch(db);
    const registrosContado = [];
    const registrosCredito = [];
    const ahora = new Date();
    const fechaRegistro = ahora.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaRegistro = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    for (const producto of carrito) {
        const inventarioRef = doc(db, "inventario", producto.nombre);
        const inventarioSnap = await getDoc(inventarioRef);

        const cantidadTotalUnidades = (parseInt(producto.unidades, 10) || 1) * (parseInt(producto.cantidad, 10) || 1);
        const precioCompraUnidadNum = Number(producto.precioCompraUnidad || 0);
        const precioVentaNum = parseFloat(producto.precioVenta || 0);

        if (inventarioSnap.exists()) {
            const inventarioActual = inventarioSnap.data();
            const updates = {
                // Se usa la cantidad total de unidades para el incremento
                cantidad: increment(cantidadTotalUnidades)
            };

            // Se actualiza usando el precio por unidad
            if (inventarioActual.precioCompra !== precioCompraUnidadNum) updates.precioCompra = precioCompraUnidadNum;
            if (inventarioActual.proveedor !== producto.proveedor) updates.proveedor = producto.proveedor;
            if (inventarioActual.precioVenta !== precioVentaNum) updates.precioVenta = precioVentaNum;
            if (inventarioActual.ganancia !== producto.ganancia) updates.ganancia = producto.ganancia;
            if (producto.fechaVencimiento && producto.fechaVencimiento !== "No se estableció") updates.fechaVencimiento = producto.fechaVencimiento;
            
            batch.update(inventarioRef, updates);
        } else {
            const nuevoProductoInventario = {
                nombre: producto.nombre,
                proveedor: producto.proveedor,
                precioVenta: precioVentaNum,
                ganancia: producto.ganancia,
                fechaVencimiento: producto.fechaVencimiento,
                // Se guarda la cantidad total y el precio por unidad
                cantidad: cantidadTotalUnidades,
                precioCompra: precioCompraUnidadNum
            };
            batch.set(inventarioRef, nuevoProductoInventario);
        }

       const totalLinea = parseFloat(producto.precioPresentacion) * parseInt(producto.cantidad);

        const registroCompra = {
            producto: producto.nombre,
            proveedor: producto.proveedor,
            cantidad: cantidadTotalUnidades, // La cantidad total
            tipoCompra: producto.tipoCompra,
            precioCompra: precioCompraUnidadNum, // El precio por unidad
//            precioVenta: precioVentaNum,
//            ganancia: producto.ganancia,
            fechaVencimiento: producto.fechaVencimiento,
            total: totalLinea, // El total de la línea de compra
//            idTurno: idTurno,
//            fechaRegistro: fechaRegistro,
            horaRegistro: horaRegistro
        };

        if (producto.tipoCompra === 'Credito') {
            if (producto.diasCredito && parseInt(producto.diasCredito, 10) > 0) {
                const fechaDePago = new Date();
                fechaDePago.setDate(fechaDePago.getDate() + parseInt(producto.diasCredito, 10));
                registroCompra.fechaDePago = fechaDePago.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
                registroCompra.diasCredito = producto.diasCredito;
            }
            registrosCredito.push(registroCompra);
        } else {
            // Se maneja el caso de 'Contado'
            registroCompra.fechaDePago = "Pago";
            registrosContado.push(registroCompra);
        }
    }

    if (registrosContado.length > 0) {
        const contadoRef = doc(db, "compras", "Contado");
        batch.set(contadoRef, { [idTurno]: arrayUnion(...registrosContado) }, { merge: true });
    }
    if (registrosCredito.length > 0) {
        const creditoRef = doc(db, "compras", "Credito");
        batch.set(creditoRef, { [idTurno]: arrayUnion(...registrosCredito) }, { merge: true });
    }

    await batch.commit();
}


// --- CÓDIGO ORIGINAL DEL ARCHIVO ---

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

// Funciones de servicio originales
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