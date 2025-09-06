// Cuentas.js - versión corregida y adaptada

import {
    getFirestore, doc, getDoc, setDoc, deleteDoc, collection,
    query, where, orderBy, limit, getDocs, updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { app } from "./Conexion.js"; // debe exportar `app`
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11.10.5/+esm";

const db = getFirestore(app);

/**
 * Carga detalle de una cuenta activa
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
        let productosHtml = '';
        let total = 0;

        const productosObj = cuenta.productos || {};
        for (const productoId in productosObj) {
            const producto = productosObj[productoId] || {};
            const subtotal = producto.total ?? 0;
            total += subtotal;
            const precioTotalFormateado = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(subtotal);

            productosHtml += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        ${producto.nombre || 'sin nombre'}
                        <span style="margin-left:10px;">
                            <button class="btn btn-sm btn-outline-secondary" onclick="window.disminuirCantidadCuenta('${clienteId}','${productoId}')">-</button>
                            <span style="margin:0 8px;">${producto.cantidad ?? 0}</span>
                            <button class="btn btn-sm btn-outline-secondary" onclick="window.aumentarCantidadCuenta('${clienteId}','${productoId}')">+</button>
                        </span>
                        <span style="margin-left:10px;">x ${producto.precioUnidad ?? 0}</span>
                    </div>
                    <span class="badge bg-primary rounded-pill">${precioTotalFormateado}</span>
                </li>
            `;
        }
// --- FUNCIONES PARA EDITAR CANTIDAD DE PRODUCTOS EN CUENTAS ACTIVAS ---

async function modificarCantidadProductoCuenta(clienteId, productoId, operacion) {
    try {
        const cuentaRef = doc(db, "cuentasActivas", clienteId);
        const cuentaDoc = await getDoc(cuentaRef);
        if (!cuentaDoc.exists()) return;
        const cuenta = cuentaDoc.data();
        const productos = { ...cuenta.productos };
        const producto = productos[productoId];
        if (!producto) return;

        if (operacion === 'aumentar') {
            producto.cantidad += 1;
        } else if (operacion === 'disminuir') {
            producto.cantidad -= 1;
            if (producto.cantidad <= 0) {
                delete productos[productoId];
            }
        }
        // Recalcular total del producto y total general
        if (productos[productoId]) {
            producto.total = producto.cantidad * (producto.precioUnidad ?? producto.precioVenta ?? 0);
            productos[productoId] = producto;
        }
        let totalCuenta = 0;
        for (const pid in productos) {
            totalCuenta += productos[pid].total ?? 0;
        }
        await updateDoc(cuentaRef, {
            productos,
            total: totalCuenta
        });
        // Recargar detalle
        await cargarDetalleCuenta(clienteId);
    } catch (error) {
        Swal.fire('Error', 'No se pudo modificar la cantidad: ' + error.message, 'error');
    }
}

// Exponer funciones globales para los botones
window.aumentarCantidadCuenta = function(clienteId, productoId) {
    modificarCantidadProductoCuenta(clienteId, productoId, 'aumentar');
};
window.disminuirCantidadCuenta = function(clienteId, productoId) {
    modificarCantidadProductoCuenta(clienteId, productoId, 'disminuir');
};

        const totalFormateado = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(total);

        detalleContainer.innerHTML = `
            <h2>Cuenta de ${cuenta.cliente || 'sin nombre'}</h2>
            <p><strong>Tipo:</strong> ${cuenta.tipo || '—'}</p>
            <ul class="list-group mb-3">
                ${productosHtml}
            </ul>
            <h4>Total: ${totalFormateado}</h4>
            <div class="mt-3">
                <button class="btn btn-success me-2" onclick="cerrarCuenta('${clienteId}')">Pagar</button>
                <button class="btn btn-warning me-2" onclick="pagoAmericano('${clienteId}')">Pago Americano</button>
                <button class="btn btn-danger me-2" onclick="window.borrarCuentaActiva('${clienteId}')">Borrar cuenta</button>
                <button class="btn btn-secondary" onclick="mostrarContainer('container2')">Volver</button>
            </div>
        `;
// --- BORRAR CUENTA ACTIVA ---
window.borrarCuentaActiva = async function(clienteId) {
    const confirm = await Swal.fire({
        title: '¿Borrar cuenta?',
        text: '¿Seguro que deseas eliminar esta cuenta? Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, borrar',
        cancelButtonText: 'Cancelar'
    });
    if (!confirm.isConfirmed) return;
    try {
        await deleteDoc(doc(db, "cuentasActivas", clienteId));
        Swal.fire('Eliminada', 'La cuenta ha sido eliminada.', 'success');
        if (typeof mostrarContainer === 'function') mostrarContainer('container2');
    } catch (error) {
        Swal.fire('Error', 'No se pudo eliminar la cuenta: ' + error.message, 'error');
    }
};

        Swal.close();
    } catch (error) {
        Swal.fire('Error', `No se pudo cargar el detalle: ${error.message}`, 'error');
        console.error("Error cargarDetalleCuenta:", error);
    }
}

// ---------- FUNCIONES GLOBALES ----------

// Pago Americano (divide el valor entre personas, pero igual cierra la cuenta)
window.pagoAmericano = async function (clienteId) {
    await cerrarCuenta(clienteId, true);
};

// Pago Efectivo directo
window.pagoEfectivo = async function (clienteId) {
    await cerrarCuenta(clienteId, false);
};

/**
 * Cierra una cuenta activa y la registra en ventasCerradas/{idTurno}
 * @param {string} clienteId - ID de la cuenta en Firestore
 * @param {boolean} esPagoAmericano - Si true, pregunta división entre personas
 */
window.cerrarCuenta = async function (clienteId, esPagoAmericano = false) {
    const confirm = await Swal.fire({
        title: '¿Estás seguro?',
        text: 'Esta acción marcará la cuenta como pagada y la archivará.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, cerrar cuenta',
        cancelButtonText: 'Cancelar'
    });
    if (!confirm.isConfirmed) return;

    try {
        Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        // 1) Obtener cuenta
        const cuentaRef = doc(db, "cuentasActivas", clienteId);
        const cuentaDoc = await getDoc(cuentaRef);
        if (!cuentaDoc.exists()) throw new Error("La cuenta no existe.");
        const cuenta = cuentaDoc.data();

        Swal.close();

        // 2) Pago Americano (opcional)
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

        // 3) Medio de pago
        const { value: medioPago } = await Swal.fire({
            title: 'Medio de pago',
            input: 'select',
            inputOptions: { efectivo: 'Efectivo', nequi: 'Nequi', daviplata: 'Daviplata' },
            inputPlaceholder: 'Selecciona el medio de pago',
            showCancelButton: true
        });
        if (!medioPago) return;

        // 4) Buscar turno activo
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

        // 5) Procesar productos
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

        // 6) Calcular total real
        const totalCalculado = productosArray.reduce((acc, prod) => acc + (prod.precioVenta * prod.cantidad), 0);

        // 7) Armar objeto cliente
        const horaVenta = new Date().toLocaleTimeString('es-CO', { hour12: false });
        const clienteNombreFinal = (medioPago.toLowerCase() === 'efectivo') ? 'Cliente Ocasional' : (cuenta.cliente || 'Desconocido');

        const clienteObj = {
            cliente: clienteNombreFinal,
            tipoVenta: medioPago,
            horaVenta,
            total: totalCalculado,
            productos: productosArray
        };

        // Validaciones
        if (!clienteObj.cliente || !clienteObj.tipoVenta || !clienteObj.productos.length) {
            throw new Error("Datos incompletos para guardar la venta.");
        }

        // 8) Guardar en ventasCerradas/{idTurno}
        const turnoRef = doc(db, "ventasCerradas", idTurno);
        const turnoSnap = await getDoc(turnoRef);
        if (!turnoSnap.exists()) {
            await setDoc(turnoRef, { clientes: [clienteObj] });
        } else {
            await updateDoc(turnoRef, { clientes: arrayUnion(clienteObj) });
        }

        // 9) Eliminar cuenta activa
        await deleteDoc(cuentaRef);

        Swal.fire('¡Éxito!', 'La venta ha sido registrada.', 'success');
        if (typeof mostrarContainer === 'function') mostrarContainer('container2');

    } catch (error) {
        Swal.fire('Error', `No se pudo cerrar la cuenta: ${error.message}`, 'error');
        console.error("Error al cerrar la cuenta:", error);
    }
};
