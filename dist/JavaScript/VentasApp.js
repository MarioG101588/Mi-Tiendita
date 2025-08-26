import {getFirestore, doc, getDoc, setDoc, collection,query, where, orderBy, limit, getDocs, updateDoc, arrayUnion,runTransaction, serverTimestamp} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { app } from "./Conexion.js";
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11.10.5/+esm";

const db = getFirestore(app);
// ✅ Utilidad mínima para este archivo (solo añadida, no reemplaza nada)
function calcularTotal(carrito) {
  try {
    if (!carrito) return 0;
    const items = Array.isArray(carrito) ? carrito : Object.values(carrito);
    return items.reduce((acc, p) => {
      const subtotal =
        typeof p?.total === 'number'
          ? p.total
          : (typeof p?.precioVenta === 'number' && typeof p?.cantidad === 'number'
              ? p.precioVenta * p.cantidad
              : 0);
      return acc + subtotal;
    }, 0);
  } catch {
    return 0;
  }
}

/**
 * Procesa una venta de 'Pago en efectivo' directamente a 'ventasCerradas',
 * usando el medio de pago elegido.
 */
async function procesarVentaEfectivoACerrada(carrito, medioPago) {
    // 1. Buscar el turno Activo
    let idTurno = localStorage.getItem("idTurno");
    if (!idTurno) {
        const turnosRef = collection(db, "turnos");
        const q = query(turnosRef, where("estado", "==", "Activo"), orderBy("fechaInicio", "desc"), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
            idTurno = snap.docs[0].id;
            localStorage.setItem("idTurno", idTurno);
        }
    }
    if (!idTurno) {
        throw new Error("No se encontró un turno Activo. Por favor, inicie un turno para registrar la venta.");
    }

    // 2. Preparar productos
    const productosArray = Object.values(carrito).map(p => ({
        nombreProducto: String(p?.nombre ?? 'sin nombre'),
        precioVenta: Number(p?.precioVenta ?? 0),
        cantidad: Number(p?.cantidad ?? 0)
    }));

    // 3. Calcular total
    const totalCalculado = Object.values(carrito).reduce((acc, item) => acc + item.total, 0);
    // 4. Construir objeto venta
    const horaVenta = new Date().toLocaleTimeString('es-CO', { hour12: false });
    const clienteObj = {
        cliente: 'Cliente Ocasional',
        tipoVenta: medioPago, // Medio de pago elegido
        horaVenta,
        total: totalCalculado,
        productos: productosArray
    };

    if (!clienteObj.productos.length) {
        throw new Error("No hay productos en el carrito para registrar.");
    }

    // 5. Guardar en ventasCerradas
    const turnoRef = doc(db, "ventasCerradas", idTurno);
    const turnoSnap = await getDoc(turnoRef);

    if (!turnoSnap.exists()) {
        await setDoc(turnoRef, { clientes: [clienteObj] });
    } else {
        await updateDoc(turnoRef, { clientes: arrayUnion(clienteObj) });
    }
}


async function procesarVentaCliente(carrito, cliente, claseVenta) {
    const cuentaRef = doc(db, "cuentasActivas", cliente);

    await runTransaction(db, async (transaction) => {
        const cuentaDoc = await transaction.get(cuentaRef);

        if (!cuentaDoc.exists()) {
            // Crear nueva cuenta
            transaction.set(cuentaRef, {
                cliente: cliente,
                productos: carrito,
                tipo: claseVenta,
                total: calcularTotal(carrito),
                fechaApertura: serverTimestamp(),
                idTurno: localStorage.getItem("idTurno") // 🔹 agregado
            });
        } else {
            // Actualizar cuenta existente
            const cuentaData = cuentaDoc.data();
            const productosActualizados = { ...cuentaData.productos };

            for (const [idProducto, datosProducto] of Object.entries(carrito)) {
                if (productosActualizados[idProducto]) {
                    productosActualizados[idProducto].cantidad += datosProducto.cantidad;
                    productosActualizados[idProducto].total += datosProducto.total;
                } else {
                    productosActualizados[idProducto] = datosProducto;
                }
            }

            const nuevoTotal = Object.values(productosActualizados).reduce((acc, p) => acc + p.total, 0);

            transaction.update(cuentaRef, {
                productos: productosActualizados,
                total: nuevoTotal,
                fechaUltimaModificacion: serverTimestamp(),
                idTurno: localStorage.getItem("idTurno") // 🔹 agregado
            });
        }
    });
}

/**
 * Función principal de venta
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
            '<select id="swal-select-clase-venta" class="swal2-select" style="width: "Consumo en el local";">' +
            '<option value="Pago en efectivo" selected>Pago en efectivo</option>' +
            '<option value="Consumo en el local">Consumo en el local</option>' +
            '<option value="En Cuaderno">Anotar en el Cuaderno</option>' +

            '</select>',
        focusConfirm: false,
        preConfirm: () => {
            const claseVenta = document.getElementById('swal-select-clase-venta').value;
            const cliente = document.getElementById('swal-input-cliente').value.trim();

            if ((claseVenta === 'En Cuaderno' || claseVenta === 'Consumo en el local') && !cliente) {
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
        try {
            let tipoVenta = formValues.claseVenta;

            if (formValues.claseVenta === 'Pago en efectivo') {
                // Preguntar medio de pago
const { value: medioPago } = await Swal.fire({
    title: 'Medio de pago',
    input: 'select',
    inputOptions: {
        efectivo: 'Efectivo',
        nequi: 'Nequi',
        daviplata: 'Daviplata'
    },
    inputPlaceholder: 'Selecciona el medio de pago',
    showCancelButton: true,
    // --- AÑADE ESTO ---
    didOpen: () => {
        const select = Swal.getInput(); // Obtiene el input actual
        if (select) {
            select.style.width = 'auto'; // Ajusta el ancho al contenido
            select.style.padding = '0.5em 1em'; // Añade un poco de padding para que se vea mejor
        }
    }
    // --- FIN DE LA MODIFICACIÓN ---
});
                if (!medioPago) return; // Cancelado

                tipoVenta = medioPago;

                Swal.fire({
                    title: 'Procesando...',
                    allowOutsideClick: false,
                    didOpen: () => Swal.showLoading()
                });

                await procesarVentaEfectivoACerrada(carrito, tipoVenta);
            } else {
                Swal.fire({
                    title: 'Procesando...',
                    allowOutsideClick: false,
                    didOpen: () => Swal.showLoading()
                });

                await procesarVentaCliente(carrito, formValues.cliente, tipoVenta);
            }

            window.carrito = {};
            if (window.renderCarrito) window.renderCarrito();

Swal.fire('¡Éxito!', 'La venta ha sido registrada correctamente.', 'success');

// Limpiar búsqueda y volver a container2
const campoBusqueda = document.getElementById("campoBusqueda1");
if (campoBusqueda) campoBusqueda.value = "";

window.mostrarContainer("container2");            

        } catch (error) {
            Swal.fire('Error', `Ocurrió un error al procesar la venta: ${error.message}`, 'error');
            console.error("Error en realizarVenta:", error);
        }
    }
}