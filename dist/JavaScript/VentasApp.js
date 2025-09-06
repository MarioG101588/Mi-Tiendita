import {
    getFirestore, doc, getDoc, setDoc, collection,
    query, where, orderBy, limit, getDocs, updateDoc, arrayUnion,
    runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { app } from "./Conexion.js"; // Se asume que este archivo exporta la app de Firebase inicializada
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11.10.5/+esm";

const db = getFirestore(app);

/**
 * Procesa una venta de 'Pago en efectivo' directamente a 'ventasCerradas'.
 * Esta función está adaptada de la lógica de 'cerrarCuenta'.
 * @param {object} carrito - El objeto del carrito de compras.
 */
async function procesarVentaEfectivoACerrada(carrito) {
    // 1. El medio de pago se asume como 'Efectivo'.

    const medioPago = 'Efectivo';

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

    // 6. Guardar la venta en el documento del turno activo dentro de 'ventasCerradas'.
    const turnoRef = doc(db, "ventasCerradas", idTurno);
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

    await runTransaction(db, async (transaction) => {
        const cuentaDoc = await transaction.get(cuentaRef);
        const productosCuenta = cuentaDoc.exists() ? cuentaDoc.data().productos : {};
        let totalCuenta = cuentaDoc.exists() ? cuentaDoc.data().total : 0;

        for (const idProducto in carrito) {
            const itemCarrito = carrito[idProducto];
            if (productosCuenta[idProducto]) {
                productosCuenta[idProducto].cantidad += itemCarrito.cantidad;
                productosCuenta[idProducto].total += itemCarrito.total;
            } else {
                productosCuenta[idProducto] = itemCarrito;
            }
        }

        totalCuenta += Object.values(carrito).reduce((acc, item) => acc + item.total, 0);

        if (cuentaDoc.exists()) {
            transaction.update(cuentaRef, {
                productos: productosCuenta,
                total: totalCuenta,
                ultimaActualizacion: serverTimestamp(),
                turno: idTurno
            });
        } else {
            transaction.set(cuentaRef, {
                cliente: cliente,
                tipo: claseVenta,
                productos: productosCuenta,
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
        Swal.fire('Carrito vacío', 'No hay productos para vender.', 'warning');
        return;
    }

    const { value: formValues } = await Swal.fire({
        title: 'Finalizar Venta',
        html:
            '<input id="swal-input-cliente" class="swal2-input" placeholder="Nombre del Cliente (opcional)">' +
            '<select id="swal-select-clase-venta" class="swal2-select">' +
            '<option value="Pago en efectivo" selected>Pago en efectivo</option>' +
            '<option value="Consumo en el local">Consumo en el local</option>' +
            '<option value="En cuaderno">En cuaderno</option>' +
            '</select>',
        focusConfirm: false,
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

    if (formValues) {
        Swal.fire({
            title: 'Procesando...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            if (formValues.claseVenta === 'Pago en efectivo') {
                // FLUJO 1: La venta va directamente a 'ventasCerradas'.
                await procesarVentaEfectivoACerrada(carrito);
            } else {
                // FLUJO 2: La venta se guarda en 'cuentasActivas'.
                await procesarVentaCliente(carrito, formValues.cliente, formValues.claseVenta);
            }

            window.carrito = {};
            if (window.renderCarrito) window.renderCarrito();
            Swal.fire('¡Éxito!', 'La venta ha sido registrada correctamente.', 'success');

            // Redirigir a cuentas activas si la función global está disponible
            if (typeof window.mostrarContainer === 'function') {
                window.mostrarContainer('container2');
            }

        } catch (error) {
            Swal.fire('Error', `Ocurrió un error al procesar la venta: ${error.message}`, 'error');
            console.error("Error en realizarVenta:", error);
        }
    }
}