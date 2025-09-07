// Cuentas.js - versión corregida y adaptada

import {
    getFirestore, doc, getDoc, setDoc, deleteDoc, collection,
    query, where, orderBy, limit, getDocs, updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { app } from "./Conexion.js"; // debe exportar `app`
import { 
    mostrarCargando, 
    mostrarExito, 
    mostrarError, 
    mostrarConfirmacion,
    mostrarInput,
    cerrarModal,
    mostrarPersonalizado
} from "./SweetAlertManager.js";
import { mostrarModalMedioPago } from "./Engranaje.js";

const db = getFirestore(app);

// **FUNCIÓN UTILITARIA PARA CONVERTIR idTurno A FECHA LEGIBLE**
function convertirIdTurnoAFecha(idTurno) {
    if (!idTurno || idTurno === 'Sin turno') return 'Sin fecha';
    
    try {
        // Formato esperado: "2025-9-7_10-18" 
        const partes = idTurno.split('_')[0]; // Tomar solo la parte de fecha: "2025-9-7"
        const [año, mes, dia] = partes.split('-');
        
        // Crear objeto Date
        const fecha = new Date(parseInt(año), parseInt(mes) - 1, parseInt(dia));
        
        // Formatear a español
        const opciones = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        
        return fecha.toLocaleDateString('es-ES', opciones);
    } catch (error) {
        console.error('Error al convertir idTurno a fecha:', error);
        return 'Fecha inválida';
    }
}

/**
 * Carga detalle de una cuenta activa
 */
export async function cargarDetalleCuenta(clienteId) {
    const detalleContainer = document.getElementById('detalleCuentaContainer');
    if (!detalleContainer) return;

    mostrarCargando('Cargando detalles...');

    try {
        const cuentaRef = doc(db, "cuentasActivas", clienteId);
        const cuentaDoc = await getDoc(cuentaRef);

        if (!cuentaDoc.exists()) {
            detalleContainer.innerHTML = `<p>La cuenta no fue encontrada.</p>`;
            cerrarModal();
            return;
        }

        const cuenta = cuentaDoc.data();
        
        let productosHtml = '';
        let historialHtml = '';
        let total = 0;

        // Generar historial si existe
        const historial = cuenta.historial || [];
        if (historial.length > 0) {
            historialHtml = historial.map((registro, index) => {
                const productosDelRegistro = registro.productos.map(p => {
                    const signo = p.cantidad > 0 ? '+' : '';
                    const color = p.cantidad > 0 ? 'text-success' : 'text-danger';
                    return `<li class="${color}">${signo}${p.cantidad} ${p.nombre} (${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(p.precioVenta)} c/u)</li>`;
                }).join('');
                
                // Icono y color según el tipo de registro
                let icono = '🛒';
                let badgeClass = 'bg-primary';
                let tipoLabel = 'Compra';
                
                if (registro.tipo === 'modificacion') {
                    if (registro.operacion === 'Agregado') {
                        icono = '➕';
                        badgeClass = 'bg-success';
                        tipoLabel = 'Agregado';
                    } else if (registro.operacion === 'Reducido') {
                        icono = '➖';
                        badgeClass = 'bg-warning';
                        tipoLabel = 'Reducido';
                    } else if (registro.operacion === 'Eliminado') {
                        icono = '🗑️';
                        badgeClass = 'bg-danger';
                        tipoLabel = 'Eliminado';
                    }
                }
                
                return `
                    <div class="card mb-2">
                        <div class="card-body py-2">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <strong>${icono} ${registro.fecha}</strong>
                                    <span class="badge ${badgeClass} ms-2">${tipoLabel}</span>
                                    <small class="text-muted ms-2">${convertirIdTurnoAFecha(registro.turno)}</small>
                                </div>
                                <span class="badge bg-secondary">${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(registro.subtotal)}</span>
                            </div>
                            <details class="mt-1">
                                <summary class="text-primary" style="cursor: pointer;">Ver detalles de esta operación</summary>
                                <ul class="mt-2 mb-0">${productosDelRegistro}</ul>
                            </details>
                        </div>
                    </div>
                `;
            }).join('');
        }

        const productosObj = cuenta.productos || {};
        for (const productoId in productosObj) {
            const producto = productosObj[productoId] || {};
            const subtotal = producto.total ?? 0;
            total += subtotal;
            const precioUnitario = producto.precioUnidad ?? producto.precioVenta ?? 0;
            const cantidad = producto.cantidad ?? 0;
            const precioUnitarioFormateado = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(precioUnitario);
            const precioTotalFormateado = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(subtotal);
            
            // Información de fechas
            const primerPedido = producto.primerPedido ? `<small class="text-muted">Primer pedido: ${producto.primerPedido}</small>` : '';
            const ultimaFecha = producto.ultimaFecha ? `<small class="text-muted">Último pedido: ${producto.ultimaFecha}</small>` : '';

            productosHtml += `
                <tr>
                    <td>
                        <strong>${producto.nombre || 'Producto sin nombre'}</strong>
                        <div class="mt-1">
                            <button class="btn btn-sm btn-outline-danger" onclick="window.disminuirCantidadCuenta('${clienteId}','${productoId}')">-</button>
                            <span class="mx-2 fw-bold">${cantidad}</span>
                            <button class="btn btn-sm btn-outline-success" onclick="window.aumentarCantidadCuenta('${clienteId}','${productoId}')">+</button>
                        </div>
                        ${primerPedido ? `<div>${primerPedido}</div>` : ''}
                        ${ultimaFecha && ultimaFecha !== primerPedido ? `<div>${ultimaFecha}</div>` : ''}
                    </td>
                    <td class="text-center">${precioUnitarioFormateado}</td>
                    <td class="text-end fw-bold">${precioTotalFormateado}</td>
                </tr>
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
        const historial = [...(cuenta.historial || [])];
        const producto = productos[productoId];
        if (!producto) return;

        const fechaActual = new Date();
        const fechaFormateada = fechaActual.toLocaleString('es-CO', { 
            timeZone: 'America/Bogota',
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        const idTurno = localStorage.getItem("idTurno") || cuenta.turno;

        let cantidadCambio = 0;
        let tipoOperacion = '';

        if (operacion === 'aumentar') {
            producto.cantidad += 1;
            cantidadCambio = 1;
            tipoOperacion = 'Agregado';
            
            // Actualizar fecha de último pedido
            producto.ultimaFecha = fechaFormateada;
            if (!producto.primerPedido) {
                producto.primerPedido = fechaFormateada;
            }
        } else if (operacion === 'disminuir') {
            if (producto.cantidad <= 1) {
                // Si solo queda 1, eliminar el producto completamente
                delete productos[productoId];
                cantidadCambio = -producto.cantidad;
                tipoOperacion = 'Eliminado';
            } else {
                producto.cantidad -= 1;
                cantidadCambio = -1;
                tipoOperacion = 'Reducido';
                // Actualizar fecha de último cambio
                producto.ultimaFecha = fechaFormateada;
            }
        }

        // Recalcular total del producto si aún existe
        if (productos[productoId]) {
            producto.total = producto.cantidad * (producto.precioUnidad ?? producto.precioVenta ?? 0);
            productos[productoId] = producto;
        }

        // Crear registro en el historial para el cambio
        const precioUnitario = producto?.precioUnidad ?? producto?.precioVenta ?? 0;
        const valorCambio = Math.abs(cantidadCambio) * precioUnitario;
        
        const registroHistorial = {
            fecha: fechaFormateada,
            turno: idTurno,
            tipo: 'modificacion',
            operacion: tipoOperacion,
            productos: [{
                nombre: producto?.nombre || 'Producto',
                cantidad: cantidadCambio,
                precioVenta: precioUnitario,
                total: operacion === 'disminuir' ? -valorCambio : valorCambio
            }],
            subtotal: operacion === 'disminuir' ? -valorCambio : valorCambio
        };

        historial.push(registroHistorial);

        // Recalcular total general
        let totalCuenta = 0;
        for (const pid in productos) {
            totalCuenta += productos[pid].total ?? 0;
        }

        await updateDoc(cuentaRef, {
            productos,
            historial,
            total: totalCuenta,
            ultimaActualizacion: new Date()
        });

        // Recargar detalle
        await cargarDetalleCuenta(clienteId);
        
        // Mostrar notificación de la acción
        const mensaje = operacion === 'aumentar' 
            ? `✅ Agregada 1 unidad de ${producto.nombre}` 
            : `➖ ${producto.cantidad === 0 ? 'Eliminado' : 'Reducida 1 unidad de'} ${producto.nombre}`;
        
        mostrarExito(mensaje);

    } catch (error) {
        mostrarError('No se pudo modificar la cantidad: ' + error.message);
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
        const fechaActual = new Date().toLocaleDateString('es-CO', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        detalleContainer.innerHTML = `
            <div class="card">
                <div class="card-header bg-primary text-white">
                    <h3 class="mb-0">📋 Cuenta de ${cuenta.cliente || 'Cliente'}</h3>
                    <small>Estado: <span class="badge bg-warning text-dark">${cuenta.tipo || 'Pendiente'}</span></small>
                </div>
                <div class="card-body">
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <small class="text-muted">Fecha de consulta:</small><br>
                            <strong>${fechaActual}</strong>
                        </div>
                        <div class="col-md-6 text-end">
                            <small class="text-muted">Fecha del turno:</small><br>
                            <code>${convertirIdTurnoAFecha(cuenta.turno)}</code>
                        </div>
                    </div>
                    
                    <h5 class="mb-3">📦 Resumen de productos:</h5>
                    <div class="table-responsive">
                        <table class="table table-striped table-hover">
                            <thead class="table-dark">
                                <tr>
                                    <th>Producto, Cantidad y Fechas</th>
                                    <th class="text-center">Precio Unit.</th>
                                    <th class="text-end">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${productosHtml}
                            </tbody>
                            <tfoot class="table-success">
                                <tr>
                                    <th colspan="2" class="text-end">TOTAL A PAGAR:</th>
                                    <th class="text-end fs-4">${totalFormateado}</th>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    ${historialHtml ? `
                        <div class="mt-4">
                            <h5 class="mb-3">📋 Historial de pedidos (${historial.length} compras):</h5>
                            <div class="accordion accordion-flush" id="historialAccordion">
                                <div class="accordion-item">
                                    <h2 class="accordion-header">
                                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#historialCollapse">
                                            Ver historial completo de compras
                                        </button>
                                    </h2>
                                    <div id="historialCollapse" class="accordion-collapse collapse" data-bs-parent="#historialAccordion">
                                        <div class="accordion-body">
                                            ${historialHtml}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>
                <div class="card-footer">
                    <div class="d-flex flex-wrap gap-2 justify-content-center">
                        <button class="btn btn-secondary" onclick="mostrarContainer('container2')">
                            ↩️ Volver
                        </button>

                        <button class="btn btn-success btn-lg" onclick="cerrarCuenta('${clienteId}')">
                            💰 Pagar cuenta
                        </button>
                        <button class="btn btn-info" onclick="pagoAmericano('${clienteId}')">
                            💳 Pago Americano
                        </button>
                        <button class="btn btn-danger" onclick="window.borrarCuentaActiva('${clienteId}')">
                            🗑️ Eliminar Cuenta
                        </button>
                    </div>
                    <small class="text-muted d-block text-center mt-2">
                        💡 Tip: Use los botones + y - para ajustar cantidades antes del pago. 
                        📅 Cada producto muestra cuándo fue pedido por primera y última vez.
                    </small>
                </div>
            </div>
        `;
// --- BORRAR CUENTA ACTIVA ---
window.borrarCuentaActiva = async function(clienteId) {
    const confirm = await mostrarConfirmacion(
        '¿Borrar cuenta?',
        '¿Seguro que deseas eliminar esta cuenta? Esta acción no se puede deshacer.',
        'Sí, borrar',
        'Cancelar'
    );
    if (!confirm.isConfirmed) return;
    try {
        await deleteDoc(doc(db, "cuentasActivas", clienteId));
        mostrarExito('La cuenta ha sido eliminada.');
        if (typeof mostrarContainer === 'function') mostrarContainer('container2');
    } catch (error) {
        mostrarError('No se pudo eliminar la cuenta: ' + error.message);
    }
};

        cerrarModal();
    } catch (error) {
        mostrarError(`No se pudo cargar el detalle: ${error.message}`);
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
 * Cierra una cuenta activa y la registra en cuentasCerradas/{idTurno}
 * @param {string} clienteId - ID de la cuenta en Firestore
 * @param {boolean} esPagoAmericano - Si true, pregunta división entre personas
 */
window.cerrarCuenta = async function (clienteId, esPagoAmericano = false) {
    try {
        mostrarCargando('Cargando cuenta...');

        // 1) Obtener cuenta
        const cuentaRef = doc(db, "cuentasActivas", clienteId);
        const cuentaDoc = await getDoc(cuentaRef);
        if (!cuentaDoc.exists()) throw new Error("La cuenta no existe.");
        const cuenta = cuentaDoc.data();

        cerrarModal();

        // 2) Pago Americano (opcional)
        if (esPagoAmericano) {
            const { value: partes } = await mostrarInput(
                '¿Dividir entre cuántas personas?',
                '',
                '1'
            );
            if (!partes) return;

            const montoPorPersona = (cuenta.total ?? 0) / partes;
            await mostrarPersonalizado({
                title: 'Monto por persona',
                html: `<b>Total (en cuenta):</b> $${(cuenta.total ?? 0).toFixed(2)}<br>
                       <b>Entre ${partes} personas:</b> $${montoPorPersona.toFixed(2)} cada uno`,
                icon: 'info'
            });
        }

        // 3) Selección de medio de pago - USAR FUNCIÓN UNIFICADA
        const medioPagoFinal = await mostrarModalMedioPago(cuenta.total || 0);

        if (!medioPagoFinal) {
            return; // Usuario canceló
        }

        // Mostrar loading para procesamiento
        mostrarCargando(`Procesando pago con ${medioPagoFinal}`);

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
        const clienteNombreFinal = (medioPagoFinal.toLowerCase() === 'efectivo') ? 'Cliente Ocasional' : (cuenta.cliente || 'Desconocido');

        const clienteObj = {
            cliente: clienteNombreFinal,
            tipoVenta: medioPagoFinal,
            horaVenta,
            total: totalCalculado,
            productos: productosArray,
            turno: idTurno
        };

        // Validaciones
        if (!clienteObj.cliente || !clienteObj.tipoVenta || !clienteObj.productos.length) {
            throw new Error("Datos incompletos para guardar la venta.");
        }

        // 8) Guardar en cuentasCerradas/{idTurno}
        const turnoRef = doc(db, "cuentasCerradas", idTurno);
        const turnoSnap = await getDoc(turnoRef);
        if (!turnoSnap.exists()) {
            await setDoc(turnoRef, { clientes: [clienteObj] });
        } else {
            await updateDoc(turnoRef, { clientes: arrayUnion(clienteObj) });
        }

        // 9) Eliminar cuenta activa
        await deleteDoc(cuentaRef);

        mostrarExito('La venta ha sido registrada.');
        if (typeof mostrarContainer === 'function') mostrarContainer('container2');

    } catch (error) {
        mostrarError(`No se pudo cerrar la cuenta: ${error.message}`);
        console.error("Error al cerrar la cuenta:", error);
    }
};


