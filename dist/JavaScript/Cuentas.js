import {getFirestore, doc, getDoc, setDoc, deleteDoc, deleteField, collection,query, where, orderBy, limit, getDocs, updateDoc, arrayUnion, serverTimestamp} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { app } from "./Conexion.js"; // debe exportar `app`
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11.10.5/+esm";

const db = getFirestore(app);

/**
 * Carga detalle de una cuenta activa con fecha de apertura y última modificación
 */
export async function cargarDetalleCuenta(clienteId) {
    const detalleContainer = document.getElementById('detalleCuentaContainer');
    if (!detalleContainer) return;

    Swal.fire({ title: 'Cargando detalles...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const cuentaRef = doc(db, "cuentasActivas", clienteId);
        const cuentaDoc = await getDoc(cuentaRef);

        if (!cuentaDoc.exists()) {
            detalleContainer.innerHTML = `<p>La cuenta no fue encontrada.</p>`;
            Swal.close();
            return;
        }

        const cuenta = cuentaDoc.data();

        // Crear fecha de apertura si no existe
        if (!cuenta.fechaApertura) {
            await updateDoc(cuentaRef, {
                fechaApertura: serverTimestamp(),
                fechaUltimaModificacion: serverTimestamp()
            });
            cuenta.fechaApertura = new Date();
            cuenta.fechaUltimaModificacion = new Date();
        }

        let productosHtml = '';
        let total = 0;

        const productosObj = cuenta.productos || {};
        for (const productoId in productosObj) {
            const producto = productosObj[productoId] || {};
            const subtotal = producto.total ?? 0;
            total += subtotal;
            const precioTotalFormateado = new Intl.NumberFormat('es-CO', {
                style: 'currency',
                currency: 'COP'
            }).format(subtotal);

            productosHtml += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        ${producto.nombre || 'sin nombre'} (${producto.cantidad ?? 0} x ${producto.precioUnidad ?? 0})
                    </div>
                    <div>
                        <span class="badge bg-primary rounded-pill me-2">${precioTotalFormateado}</span>
                        <button class="btn btn-sm btn-outline-warning me-1" onclick="editarCantidadProducto('${clienteId}','${productoId}')">✏️</button>
                    </div>
                </li>
            `;
        }

        const totalFormateado = new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP'
        }).format(total);

        const fechaAperturaFormateada = cuenta.fechaApertura?.toDate
            ? cuenta.fechaApertura.toDate().toLocaleString('es-CO')
            : cuenta.fechaApertura.toLocaleString('es-CO');

        const fechaUltimaFormateada = cuenta.fechaUltimaModificacion?.toDate
            ? cuenta.fechaUltimaModificacion.toDate().toLocaleString('es-CO')
            : (cuenta.fechaUltimaModificacion
                ? cuenta.fechaUltimaModificacion.toLocaleString('es-CO')
                : '—');

        detalleContainer.innerHTML = `
            <h2>Cuenta de ${cuenta.cliente || 'sin nombre'}</h2>
            <p><strong>Tipo:</strong> ${cuenta.tipo || '—'}</p>
            <p><strong>Fecha apertura:</strong> ${fechaAperturaFormateada}</p>
            <p><strong>Última modificación:</strong> ${fechaUltimaFormateada}</p>
            <ul class="list-group mb-3">
                ${productosHtml}
            </ul>
            <h4>Total: ${totalFormateado}</h4>
            <div class="mt-3">
                <div class="botones">
                    <button class="btn btn-success me-2" onclick="cerrarCuenta('${clienteId}')">Pagar</button>
                    <button class="btn btn-warning me-2" onclick="pagoAmericano('${clienteId}')">Pago Americano</button>
                    <button class="btn btn-danger me-2" onclick="eliminarCuenta('${clienteId}')">Eliminar venta</button><br><br>
                    <button class="btn btn-secondary" onclick="mostrarContainer('container2')">Volver</button>
                </div>
            </div>
        `;
       Swal.close();
    } catch (error) {
        Swal.fire('Error', `No se pudo cargar el detalle: ${error.message}`, 'error');
        console.error("Error cargarDetalleCuenta:", error);
    }
}

// ---------- FUNCIONES GLOBALES ----------

window.editarCantidadProducto = async function (clienteId, productoId) {
    try {
        const cuentaRef = doc(db, "cuentasActivas", clienteId);
        const cuentaDoc = await getDoc(cuentaRef);
        if (!cuentaDoc.exists()) return Swal.fire("Error", "La cuenta no existe.", "error");

        const cuenta = cuentaDoc.data();
        const producto = cuenta.productos?.[productoId];
        if (!producto) return Swal.fire("Error", "Producto no encontrado.", "error");

        const { value: nuevaCantidad } = await Swal.fire({
            title: `Editar cantidad - ${producto.nombre}`,
            input: 'number',
            inputValue: producto.cantidad ?? 0,
            inputAttributes: { min: 0 },
            showCancelButton: true
        });
        if (nuevaCantidad === undefined) return;

        // 🔹 Calcular precio por unidad seguro
        let precioUnidad = Number(producto.precioUnidad);
        if (!precioUnidad || precioUnidad <= 0) {
            const totalProducto = Number(producto.total) || 0;
            const cantidadProducto = Number(producto.cantidad) || 1;
            precioUnidad = totalProducto / cantidadProducto;
        }

        // 🔹 Si la nueva cantidad es 0, eliminar el producto
        if (Number(nuevaCantidad) === 0) {
            delete cuenta.productos[productoId];

            // 🔹 Recalcular total de la cuenta sin ese producto
            let nuevoTotalCuenta = 0;
            for (const id in cuenta.productos) {
                nuevoTotalCuenta += cuenta.productos[id].total ?? 0;
            }

            await updateDoc(cuentaRef, {
                [`productos.${productoId}`]: deleteField(),
                total: nuevoTotalCuenta,
                fechaUltimaModificacion: serverTimestamp()
            });

            Swal.fire("Eliminado", "El producto fue eliminado de la cuenta.", "success");
            cargarDetalleCuenta(clienteId);
            return;
        }

        // 🔹 Si no es 0, actualizar normalmente
        const nuevoTotalProducto = precioUnidad * nuevaCantidad;
        cuenta.productos[productoId].cantidad = nuevaCantidad;
        cuenta.productos[productoId].precioUnidad = precioUnidad;
        cuenta.productos[productoId].total = nuevoTotalProducto;

        // 🔹 Recalcular total general
        let nuevoTotalCuenta = 0;
        for (const id in cuenta.productos) {
            nuevoTotalCuenta += cuenta.productos[id].total ?? 0;
        }

        await updateDoc(cuentaRef, {
            [`productos.${productoId}.cantidad`]: nuevaCantidad,
            [`productos.${productoId}.precioUnidad`]: precioUnidad,
            [`productos.${productoId}.total`]: nuevoTotalProducto,
            total: nuevoTotalCuenta,
            fechaUltimaModificacion: serverTimestamp()
        });

        Swal.fire("Actualizado", "La cantidad y el total fueron modificados correctamente.", "success");
        cargarDetalleCuenta(clienteId);
    } catch (err) {
        Swal.fire("Error", err.message, "error");
    }
};

// Eliminar cuenta completa
window.eliminarCuenta = async function (clienteId) {
    try {
        const confirm = await Swal.fire({
            title: "¿Eliminar venta?",
            text: "Esta acción borrará la cuenta completa de la colección cuentasActivas.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Sí, eliminar",
            cancelButtonText: "Cancelar"
        });

        if (!confirm.isConfirmed) return;

        await deleteDoc(doc(db, "cuentasActivas", clienteId));
        Swal.fire("Eliminada", "La venta fue borrada.", "success");
        if (typeof mostrarContainer === 'function') mostrarContainer('container2');
    } catch (err) {
        Swal.fire("Error", err.message, "error");
    }
};

window.pagoAmericano = async function (clienteId) {
    await cerrarCuenta(clienteId, true);
};

window.pagoEfectivo = async function (clienteId) {
    await cerrarCuenta(clienteId, false);
};

window.cerrarCuenta = async function (clienteId, esPagoAmericano = false) {
    try {
        Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const cuentaRef = doc(db, "cuentasActivas", clienteId);
        const cuentaDoc = await getDoc(cuentaRef);
        if (!cuentaDoc.exists()) throw new Error("La cuenta no existe.");
        const cuenta = cuentaDoc.data();

        Swal.close();

        if (esPagoAmericano) {
            const { value: partes } = await Swal.fire({
                title: '¿Dividir entre cuántas personas?',
                input: 'number',
                inputValue: 1,
                inputAttributes: { min: 1 },
                showCancelButton: true
            });
            if (!partes) return;

            const montoPorPersona = (cuenta.total ?? 0) / partes;
            await Swal.fire({
                title: 'Monto por persona',
                html: `<b>Total (en cuenta):</b> $${(cuenta.total ?? 0).toFixed(2)}<br>
                       <b>Entre ${partes} personas:</b> $${montoPorPersona.toFixed(2)} cada uno`,
                icon: 'info'
            });
        }

        const { value: medioPago } = await Swal.fire({
            title: 'Medio de pago',
            input: 'select',
            inputOptions: { efectivo: 'Efectivo', nequi: 'Nequi', daviplata: 'Daviplata' },
            inputPlaceholder: 'Selecciona el medio de pago',
            showCancelButton: true
        });
        if (!medioPago) return;

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
        if (!idTurno) throw new Error("No se encontró turno activo.");

        const productosObj = cuenta.productos || {};
        const productosArray = Object.values(productosObj).map(p => {
            const cantidad = Number(p?.cantidad ?? p?.cantidadTotal ?? p?.qty ?? 0);
            let precioVenta = Number(p?.precioUnidad ?? p?.precio ?? p?.precioVenta ?? (cantidad ? p?.total / cantidad : 0)) || 0;
            return {
                nombreProducto: String(p?.nombre ?? p?.nombreProducto ?? 'sin nombre'),
                precioVenta,
                cantidad
            };
        });

        const totalCalculado = productosArray.reduce((acc, prod) => acc + (prod.precioVenta * prod.cantidad), 0);

        const horaVenta = new Date().toLocaleTimeString('es-CO', { hour12: false });
        const clienteNombreFinal = (medioPago.toLowerCase() === 'efectivo') ? 'Cliente Ocasional' : (cuenta.cliente || 'Desconocido');

        const clienteObj = {
            cliente: clienteNombreFinal,
            tipoVenta: medioPago,
            horaVenta,
            total: totalCalculado,
            productos: productosArray
        };

        if (!clienteObj.cliente || !clienteObj.tipoVenta || !clienteObj.productos.length) {
            throw new Error("Datos incompletos para guardar la venta.");
        }

        const turnoRef = doc(db, "ventasCerradas", idTurno);
        const turnoSnap = await getDoc(turnoRef);
        if (!turnoSnap.exists()) {
            await setDoc(turnoRef, { clientes: [clienteObj] });
        } else {
            await updateDoc(turnoRef, { clientes: arrayUnion(clienteObj) });
        }

        await deleteDoc(cuentaRef);

        Swal.fire('¡Éxito!', 'La venta ha sido registrada.', 'success');
        if (typeof mostrarContainer === 'function') mostrarContainer('container2');

    } catch (error) {
        Swal.fire('Error', `No se pudo cerrar la cuenta: ${error.message}`, 'error');
        console.error("Error al cerrar la cuenta:", error);
    }
};
