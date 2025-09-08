import {
    getFirestore, doc, getDoc, setDoc, collection,
    query, where, orderBy, limit, getDocs, updateDoc, arrayUnion,
    runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { app } from "./Conexion.js"; // Se asume que este archivo exporta la app de Firebase inicializada
import { 
    mostrarAdvertencia,
    mostrarFormularioVenta, 
    mostrarCargando, 
    mostrarExito, 
    mostrarError, 
    cerrarModal,
    mostrarValidacion 
} from "./SweetAlertManager.js";
import { mostrarModalMedioPago } from "./Engranaje.js";

const db = getFirestore(app);

/**
 * Procesa una venta de 'Pago en efectivo' directamente a 'cuentasCerradas'.
 * Esta función está adaptada de la lógica de 'cerrarCuenta'.
 * @param {object} carrito - El objeto del carrito de compras.
 * @param {string} medioPago - El medio de pago específico (Efectivo, Nequi, Daviplata).
 */
export async function procesarVentaDirecta(carrito, medioPago) {
    // 1. El medio de pago viene como parámetro desde la selección del usuario

    // 2. Buscar el turno activo para asociar la venta.
    let idTurno = localStorage.getItem("idTurno");
    if (!idTurno) {
        const turnosRef = collection(db, "turnos");
        const q = query(turnosRef, where("estado", "==", "activo"), orderBy("fechaInicio", "desc"), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
            idTurno = snap.docs[0].id;
            localStorage.setItem("idTurno", idTurno);
        }
    }
    if (!idTurno) {
        throw new Error("No se encontró un turno activo. Por favor, inicie un turno para registrar la venta.");
    }
    if (!idTurno) {
        throw new Error("No se encontró un turno activo. Por favor, inicie un turno para registrar la venta.");
    }

    // 3. Preparar el array de productos desde el carrito.
    const productosArray = Object.values(carrito).map(p => ({
        nombreProducto: String(p?.nombre ?? 'sin nombre'),
        precioVenta: Number(p?.precioVenta ?? 0),
        cantidad: Number(p?.cantidad ?? 0)
    }));

    // 4. Calcular el total final de la venta.
    const totalCalculado = Object.values(carrito).reduce((acc, item) => acc + item.total, 0);

    // 5. Construir el objeto de la venta que se va a archivar.
    const horaVenta = new Date().toLocaleTimeString('es-CO', { hour12: false });
    const clienteObj = {
        cliente: 'Cliente Ocasional',
        tipoVenta: medioPago,
        horaVenta,
        total: totalCalculado,
        productos: productosArray,
        turno: idTurno
    };

    if (!clienteObj.productos.length) {
        throw new Error("No hay productos en el carrito para registrar.");
    }

    // 6. Guardar la venta en el documento del turno activo dentro de 'cuentasCerradas'.
    const turnoRef = doc(db, "cuentasCerradas", idTurno);
    const turnoSnap = await getDoc(turnoRef);

    if (!turnoSnap.exists()) {
        await setDoc(turnoRef, { clientes: [clienteObj] });
    } else {
        await updateDoc(turnoRef, { clientes: arrayUnion(clienteObj) });
    }
}


/**
 * Procesa una venta y la agrega a una cuenta en la colección "cuentasActivas".
 * Este flujo se usa para 'Consumo en el local' y 'En cuaderno'.
 * @param {object} carrito - El carrito de compras actual.
 * @param {string} cliente - El nombre del cliente.
 * @param {string} claseVenta - El tipo de venta.
 */
async function procesarVentaCliente(carrito, cliente, claseVenta) {
    const cuentaRef = doc(db, "cuentasActivas", cliente);
    const idTurno = localStorage.getItem("idTurno") || null;
    const fechaActual = new Date();
    const fechaFormateada = fechaActual.toLocaleString('es-CO', { 
        timeZone: 'America/Bogota',
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    await runTransaction(db, async (transaction) => {
        const cuentaDoc = await transaction.get(cuentaRef);
        const productosCuenta = cuentaDoc.exists() ? cuentaDoc.data().productos : {};
        const historialCuenta = cuentaDoc.exists() ? cuentaDoc.data().historial || [] : [];
        let totalCuenta = cuentaDoc.exists() ? cuentaDoc.data().total : 0;

        // Crear registro para el historial de esta compra
        const registroHistorial = {
            fecha: fechaFormateada,
            turno: idTurno,
            productos: [],
            subtotal: 0
        };

        for (const idProducto in carrito) {
            const itemCarrito = carrito[idProducto];
            
            // Agregar al historial
            registroHistorial.productos.push({
                nombre: itemCarrito.nombre,
                cantidad: itemCarrito.cantidad,
                precioVenta: itemCarrito.precioVenta,
                total: itemCarrito.total
            });
            registroHistorial.subtotal += itemCarrito.total;

            if (productosCuenta[idProducto]) {
                productosCuenta[idProducto].cantidad += itemCarrito.cantidad;
                productosCuenta[idProducto].total += itemCarrito.total;
                // Actualizar última fecha de pedido
                productosCuenta[idProducto].ultimaFecha = fechaFormateada;
            } else {
                productosCuenta[idProducto] = {
                    ...itemCarrito,
                    primerPedido: fechaFormateada,
                    ultimaFecha: fechaFormateada
                };
            }
        }

        // Agregar registro al historial
        historialCuenta.push(registroHistorial);

        totalCuenta += Object.values(carrito).reduce((acc, item) => acc + item.total, 0);

        if (cuentaDoc.exists()) {
            transaction.update(cuentaRef, {
                productos: productosCuenta,
                historial: historialCuenta,
                total: totalCuenta,
                ultimaActualizacion: serverTimestamp(),
                turno: idTurno
            });
        } else {
            transaction.set(cuentaRef, {
                cliente: cliente,
                tipo: claseVenta,
                productos: productosCuenta,
                historial: historialCuenta,
                total: totalCuenta,
                fechaApertura: serverTimestamp(),
                turno: idTurno
            });
        }
    });
}

/**
 * Función principal que inicia el proceso de venta y decide el flujo a seguir.
 * @param {object} carrito - El objeto del carrito de compras.
 */
export async function realizarVenta(carrito) {
    if (Object.keys(carrito).length === 0) {
        mostrarAdvertencia('No hay productos para vender.');
        return;
    }

    const { value: formValues } = await mostrarFormularioVenta();

    if (formValues) {
        mostrarCargando('Procesando venta...');

        try {
            if (formValues.claseVenta === 'Pago en efectivo') {
                cerrarModal(); // Cerrar el loading
                
                const total = Object.values(carrito).reduce((acc, item) => acc + item.total, 0);
                const medioPagoFinal = await mostrarModalMedioPago(total);

                if (!medioPagoFinal) {
                    return; // Usuario canceló
                }

                // Mostrar loading nuevamente
                mostrarCargando(`Procesando pago con ${medioPagoFinal}`);

                // Procesar venta con el medio de pago seleccionado
                await procesarVentaDirecta(carrito, medioPagoFinal);
            } else {
                // FLUJO 2: La venta se guarda en 'cuentasActivas'.
                await procesarVentaCliente(carrito, formValues.cliente, formValues.claseVenta);
            }

            window.carrito = {};
            if (window.renderCarrito) window.renderCarrito();
            mostrarExito('La venta ha sido registrada correctamente.');

            // Redirigir a cuentas activas si la función global está disponible
            if (typeof window.mostrarContainer === 'function') {
                window.mostrarContainer('container2');
            }

        } catch (error) {
            mostrarError(`Ocurrió un error al procesar la venta: ${error.message}`);
            // console.error("Error en realizarVenta:", error);
        }
    }
}

/**
 * Procesa una venta de pago en efectivo cuando la caja está cerrada
 * @param {object} carrito - El objeto del carrito de compras.
 * @param {string} medioPago - El medio de pago específico (Efectivo, Nequi, Daviplata).
 */
async function procesarVentaEfectivoACerrada(carrito, medioPago) {
    // Usar la función existente procesarVentaDirecta
    return await procesarVentaDirecta(carrito, medioPago);
}