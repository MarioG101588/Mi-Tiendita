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
                // FLUJO 1: Preguntar primero el medio de pago específico
                Swal.close(); // Cerrar el loading
                
                // Preguntar medio de pago con botones personalizados
                const { value: medioPago } = await Swal.fire({
                    title: '💳 Seleccionar Medio de Pago',
                    text: `Total a pagar: ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(Object.values(carrito).reduce((acc, item) => acc + item.total, 0))}`,
                    html: `
                        <style>
                            .pago-btn {
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 12px;
                                padding: 18px 24px;
                                font-size: 18px;
                                font-weight: bold;
                                border: none;
                                border-radius: 12px;
                                width: 100%;
                                margin-bottom: 12px;
                                cursor: pointer;
                                transition: all 0.2s ease;
                                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                            }
                            .pago-btn:hover {
                                transform: translateY(-2px);
                                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                            }
                            .pago-efectivo {
                                background: linear-gradient(135deg, #28a745, #20c997);
                                color: white;
                            }
                            .pago-nequi {
                                background: linear-gradient(135deg, #6f42c1, #7c4dff);
                                color: white;
                            }
                            .pago-daviplata {
                                background: linear-gradient(135deg, #fd7e14, #ffc107);
                                color: white;
                            }
                            .icono-pago {
                                width: 32px;
                                height: 32px;
                                border-radius: 6px;
                            }
                        </style>
                        <div style="display: flex; flex-direction: column; gap: 8px; margin: 20px 0;">
                            <button type="button" class="pago-btn pago-efectivo" onclick="window.seleccionarMedioPago('Efectivo')">
                                <span style="font-size: 28px;">💵</span>
                                <span>Efectivo</span>
                            </button>
                            <button type="button" class="pago-btn pago-nequi" onclick="window.seleccionarMedioPago('Nequi')">
                                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Nequi_logo.svg/1200px-Nequi_logo.svg.png" 
                                     alt="Nequi" class="icono-pago" style="background: white; padding: 4px;">
                                <span>Nequi</span>
                            </button>
                            <button type="button" class="pago-btn pago-daviplata" onclick="window.seleccionarMedioPago('Daviplata')">
                                <img src="https://play-lh.googleusercontent.com/EMobDJKabP1eVoxKVuHBGZsO-YMCvSDyyAWGnwh12LqHHPgjRdcOh7rpzrM6-T5Gf8E=w240-h480-rw" 
                                     alt="DaviPlata" class="icono-pago">
                                <span>DaviPlata</span>
                            </button>
                        </div>
                    `,
                    showConfirmButton: false,
                    showCancelButton: true,
                    cancelButtonText: 'Cancelar',
                    allowOutsideClick: false,
                    didOpen: () => {
                        // Función temporal para manejar la selección
                        window.seleccionarMedioPago = (pago) => {
                            Swal.close();
                            window.medioPagoSeleccionado = pago;
                        };
                    },
                    willClose: () => {
                        // Limpiar función temporal
                        delete window.seleccionarMedioPago;
                    }
                });

                const medioPagoFinal = window.medioPagoSeleccionado;
                delete window.medioPagoSeleccionado;

                if (!medioPagoFinal) {
                    return; // Usuario canceló
                }

                // Mostrar loading nuevamente
                Swal.fire({
                    title: 'Procesando pago...',
                    text: `Procesando pago con ${medioPagoFinal}`,
                    allowOutsideClick: false,
                    didOpen: () => Swal.showLoading()
                });

                // Procesar venta con el medio de pago seleccionado
                await procesarVentaEfectivoACerrada(carrito, medioPagoFinal);
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