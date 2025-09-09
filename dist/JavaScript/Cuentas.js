// Cuentas.js - versión corregida y adaptada

import {
    getFirestore, doc, getDoc, setDoc, deleteDoc, collection,
    query, where, orderBy, limit, getDocs, updateDoc, arrayUnion, runTransaction
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { app } from "./Conexion.js"; // debe exportar `app`
import { formatearPrecio } from "./FormateoPrecios.js";
import { 
    mostrarCargando, 
    mostrarExito, 
    mostrarError, 
    mostrarConfirmacion,
    mostrarInput,
    mostrarInputNumerico,
    mostrarAdvertencia,
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
        // console.error('Error al convertir idTurno a fecha:', error);
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
                    return `<li class="${color}">${signo}${p.cantidad} ${p.nombre} (${formatearPrecio(p.precioVenta)} c/u)</li>`;
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
                                <span class="badge bg-secondary">${formatearPrecio(registro.subtotal)}</span>
                            </div>
                            <details class="mt-1">
                                <summary class="text-primary cuentas-summary-clickable">Ver detalles de esta operación</summary>
                                <ul class="mt-2 mb-0">${productosDelRegistro}</ul>
                            </details>
                        </div>
                    </div>
                `;
            }).join('');
        }

        const productosObj = cuenta.productos || {};
        const esTipoEnCuaderno = cuenta.tipo === 'En cuaderno';
        
        // Obtener la fecha de creación real del primer producto
        let fechaCreacionReal = 'No disponible';
        if (esTipoEnCuaderno) {
            const primerProducto = Object.values(productosObj)[0];
            if (primerProducto && primerProducto.primerPedido) {
                fechaCreacionReal = primerProducto.primerPedido;
            }
        }
        
        // 🔧 SOLUCIÓN: Mantener ORDEN FIJO de productos para evitar confusión de la operaria
        // Convertir a array y ordenar por timestamp de creación o nombre para orden consistente
        const productosArray = Object.entries(productosObj).map(([productoId, producto]) => ({
            id: productoId,
            ...producto,
            // Usar timestamp de creación si existe, sino usar nombre como fallback
            ordenSort: producto.timestampCreacion || producto.primerPedido || producto.nombre || productoId
        }));
        
        // Ordenar por timestamp de creación (más antiguo primero) para mantener orden cronológico
        productosArray.sort((a, b) => {
            // Si ambos tienen timestamp, ordenar cronológicamente
            if (a.ordenSort && b.ordenSort && typeof a.ordenSort === 'string' && a.ordenSort.includes('-')) {
                return a.ordenSort.localeCompare(b.ordenSort);
            }
            // Sino, ordenar alfabéticamente por nombre
            return (a.nombre || a.id).localeCompare(b.nombre || b.id);
        });
        
        // Ahora iterar en orden FIJO
        for (const producto of productosArray) {
            const productoId = producto.id;
            const subtotal = producto.total ?? 0;
            total += subtotal;
            const precioUnitario = producto.precioUnidad ?? producto.precioVenta ?? 0;
            const cantidad = producto.cantidad ?? 0;
            const precioUnitarioFormateado = formatearPrecio(precioUnitario);
            const precioTotalFormateado = formatearPrecio(subtotal);
            
            // Botones de cantidad solo para "Consumo en el local"
            let botonesEdicion = '';
            if (!esTipoEnCuaderno) {
                botonesEdicion = `
                    <div class="mt-2 d-flex align-items-center justify-content-center">
                        <button class="btn btn-danger btn-cantidad-mejorado me-2" onclick="window.disminuirCantidadCuenta('${clienteId}','${productoId}')" 
                                style="width: 40px; height: 40px; border-radius: 50%; font-size: 1.2rem; font-weight: bold; border: 2px solid #dc3545;">
                            −
                        </button>
                        <span class="mx-3 fw-bold text-primary" style="font-size: 1.5rem; min-width: 30px; text-align: center; background: #e3f2fd; padding: 8px 16px; border-radius: 8px; border: 2px solid #2196f3;">${cantidad}</span>
                        <button class="btn btn-success btn-cantidad-mejorado ms-2" onclick="window.aumentarCantidadCuenta('${clienteId}','${productoId}')" 
                                style="width: 40px; height: 40px; border-radius: 50%; font-size: 1.2rem; font-weight: bold; border: 2px solid #28a745;">
                            +
                        </button>
                    </div>
                `;
            } else {
                botonesEdicion = `<span class="fw-bold fs-5 text-primary">Cantidad: ${cantidad}</span>`;
            }

            productosHtml += `
                <tr style="height: 80px;">
                    <td class="py-4 align-middle">
                        <div class="fw-bold fs-5 mb-2 text-dark">${producto.nombre || 'Producto sin nombre'}</div>
                        ${botonesEdicion}
                    </td>
                    <td class="text-center py-4 align-middle">
                        <span class="fs-5 fw-semibold text-success">${precioUnitarioFormateado}</span>
                    </td>
                    <td class="text-end py-4 align-middle">
                        <span class="fs-4 fw-bold text-primary">${precioTotalFormateado}</span>
                    </td>
                </tr>
            `;
        }

        const totalFormateado = formatearPrecio(total);

        detalleContainer.innerHTML = `
            <div class="card">
                <div class="card-header bg-primary text-white">
                    <h3 class="mb-0 titulo-cuenta-resaltado">📋 Cuenta: ${cuenta.cliente || 'Cliente'}</h3>
                    <div class="d-flex justify-content-between align-items-center mt-2">
                        <span class="badge bg-warning text-dark fs-6">${cuenta.tipo || 'Pendiente'}</span>
                        ${esTipoEnCuaderno ? `<small>📅 Creada: ${fechaCreacionReal}</small>` : ''}
                    </div>
                </div>
                <div class="card-body">
                    <!-- Logo del local -->
                    <div class="logo-container-detalle mb-3">
                        <img src="./pngs/LogoLocal.png" alt="Logo El Arrendajo Azul" class="logo-detalle" />
                    </div>
                    
                    ${!esTipoEnCuaderno ? `
                        <div class="text-center mb-3">
                            <button class="btn btn-primary btn-lg" onclick="agregarProductoACuenta('${clienteId}')">
                                ➕ Agregar Producto
                            </button>
                        </div>
                    ` : ''}
                    
                    <h5 class="mb-3 text-center">📦 Productos ordenados:</h5>
                    
                    <!-- TOTAL FIJO VISIBLE -->
                    <div class="alert alert-success text-center mb-3" style="background: linear-gradient(135deg, #28a745, #20c997); border: none; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                        <h4 class="mb-0 text-white fw-bold" style="font-size: 1.4rem;">
                            💰 TOTAL A PAGAR: ${totalFormateado}
                        </h4>
                    </div>
                    
                    <div class="table-responsive">
                        <table class="table table-striped table-hover">
                            <thead class="table-dark">
                                <tr>
                                    <th style="font-size: 1.1rem; width: 50%;">Producto</th>
                                    <th class="text-center" style="font-size: 1.1rem; width: 25%;">Precio c/u</th>
                                    <th class="text-end" style="font-size: 1.1rem; width: 25%;">Total</th>
                                </tr>
                            </thead>
                            <tbody style="font-size: 1rem;">
                                ${productosHtml}
                            </tbody>
                        </table>
                    </div>
                    
                    ${!esTipoEnCuaderno ? `
                        <!--<div class="alert alert-info text-center mt-3">
                            <i class="bi bi-info-circle"></i> <strong>Consumo en el local:</strong> 
                            Puedes ajustar las cantidades usando los botones + y -
                        </div>-->
                    ` : `
                        <!--<div class="alert alert-warning text-center mt-3">
                            <i class="bi bi-journal-text"></i> <strong>Cuenta en cuaderno:</strong> 
                            Solo lectura - No se pueden modificar las cantidades
                        </div>-->
                    `}
                </div>
                <div class="card-footer">
                    <div class="d-flex flex-wrap gap-2 justify-content-center">
                        <button class="btn btn-secondary btn-lg" onclick="mostrarContainer('container2')">
                            ↩️ Volver
                        </button>

                        <button class="btn btn-success btn-lg" onclick="cerrarCuenta('${clienteId}')">
                            💰 Pagar cuenta
                        </button>
                        <button class="btn btn-info btn-lg" onclick="pagoAmericano('${clienteId}')">
                            💳 Pago Americano
                        </button>
                        <button class="btn btn-danger btn-lg" onclick="window.borrarCuentaActiva('${clienteId}')">
                            🗑️ Eliminar
                        </button>
                    </div>
                </div>
            </div>
        `;

        cerrarModal();
    } catch (error) {
        mostrarError(`No se pudo cargar el detalle: ${error.message}`);
        // console.error("Error cargarDetalleCuenta:", error);
    }
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
            const { value: partes } = await mostrarInputNumerico(
                '¿Dividir entre cuántas personas?',
                'Número de personas'
            );
            if (!partes) return;

            const montoPorPersona = (cuenta.total ?? 0) / partes;
            await mostrarPersonalizado({
                title: 'Monto por persona',
                html: `<b>Total (en cuenta):</b> ${formatearPrecio(cuenta.total ?? 0)}<br>
                       <b>Entre ${partes} personas:</b> ${formatearPrecio(montoPorPersona)} cada uno`,
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
        // console.error("Error al cerrar la cuenta:", error);
    }
};

// **FUNCIÓN PARA ABRIR MODAL DE BÚSQUEDA DE PRODUCTOS Y AGREGAR A UNA CUENTA**
window.agregarProductoACuenta = async function(clienteId) {
    try {
        mostrarModalBusquedaProductos(clienteId);
    } catch (error) {
        mostrarError(`Error al abrir búsqueda de productos: ${error.message}`);
        console.error("Error agregarProductoACuenta:", error);
    }
};

// **FUNCIÓN PARA MOSTRAR MODAL DE BÚSQUEDA DE PRODUCTOS**
async function mostrarModalBusquedaProductos(clienteId) {
    const resultado = await mostrarPersonalizado({
        title: '🔍 Buscar Producto',
        html: `
            <div class="text-start mb-3">
                <h6 class="text-primary mb-2">Cliente: ${clienteId}</h6>
                <p class="text-muted small">Escriba el nombre del producto que desea agregar</p>
            </div>
            <input type="text" id="searchProducto" class="swal2-input" placeholder="Escriba el nombre del producto..." style="font-size: 1.1rem;">
            <div id="resultadosProductos" class="mt-3" style="max-height: 300px; overflow-y: auto;">
                <p class="text-muted">Escriba para buscar productos...</p>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Cerrar',
        cancelButtonText: 'Cancelar',
        allowOutsideClick: false,
        didOpen: () => {
            const input = document.getElementById('searchProducto');
            const resultados = document.getElementById('resultadosProductos');
            
            // Listener para búsqueda en tiempo real
            input.addEventListener('input', async (e) => {
                await buscarProductosEnInventario(e.target.value, resultados, clienteId);
            });
            
            // Enfocar el campo de búsqueda
            input.focus();
        }
    });
}

// **FUNCIÓN PARA BUSCAR PRODUCTOS EN EL INVENTARIO**
async function buscarProductosEnInventario(termino, resultadosDiv, clienteId) {
    if (!termino.trim()) {
        resultadosDiv.innerHTML = '<p class="text-muted">Escriba para buscar productos...</p>';
        return;
    }
    
    try {
        resultadosDiv.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"></div><br>Buscando...</div>';
        
        const inventarioRef = collection(db, "inventario");
        const snapshot = await getDocs(inventarioRef);
        
        const productos = [];
        const terminoLower = termino.toLowerCase();
        
        snapshot.forEach(doc => {
            const nombreProducto = doc.id.toLowerCase();
            if (nombreProducto.includes(terminoLower)) {
                const data = doc.data();
                productos.push({
                    id: doc.id,
                    nombre: doc.id,
                    precio: data.precioVenta || 0,
                    cantidad: data.cantidad || 0
                });
            }
        });
        
        if (productos.length === 0) {
            resultadosDiv.innerHTML = '<p class="text-warning">No se encontraron productos con ese nombre.</p>';
            return;
        }
        
        let html = '<div class="list-group">';
        productos.forEach(producto => {
            const precio = formatearPrecio(producto.precio);
            html += `
                <button type="button" class="list-group-item list-group-item-action text-start" 
                        onclick="seleccionarProductoParaAgregar('${clienteId}', '${producto.id}', ${producto.precio})">
                    <div class="fw-bold">${producto.nombre}</div>
                    <small class="text-muted">Precio: ${precio} | Stock: ${producto.cantidad}</small>
                </button>
            `;
        });
        html += '</div>';
        
        resultadosDiv.innerHTML = html;
        
    } catch (error) {
        resultadosDiv.innerHTML = '<p class="text-danger">Error al buscar productos.</p>';
        console.error('Error buscando productos:', error);
    }
}

// **FUNCIÓN PARA SELECCIONAR UN PRODUCTO Y AGREGARLO A LA CUENTA**
window.seleccionarProductoParaAgregar = async function(clienteId, nombreProducto, precioVenta) {
    try {
        // Cerrar el modal de búsqueda
        cerrarModal();
        
        // Pedir cantidad
        const result = await mostrarInputNumerico(
            'Cantidad a agregar',
            `¿Cuántas unidades de "${nombreProducto}" desea agregar?`
        );
        
        // Si el usuario canceló
        if (result.dismiss) {
            return;
        }
        
        const cantidad = result.value;
        
        if (!cantidad || isNaN(cantidad) || parseInt(cantidad) <= 0) {
            mostrarAdvertencia('Debe ingresar una cantidad válida mayor a 0.');
            return;
        }
        
        const cantidadNum = parseInt(cantidad);
        const totalProducto = cantidadNum * precioVenta;
        
        // Agregar producto directamente sin confirmación molesta
        await agregarProductoACuentaEnBD(clienteId, nombreProducto, precioVenta, cantidadNum);
        
        // Recargar el detalle de la cuenta inmediatamente
        cargarDetalleCuenta(clienteId);
        
    } catch (error) {
        mostrarError(`Error al agregar producto: ${error.message}`);
        console.error("Error seleccionarProductoParaAgregar:", error);
    }
};

// **FUNCIÓN PARA AGREGAR FÍSICAMENTE EL PRODUCTO A LA BASE DE DATOS**
async function agregarProductoACuentaEnBD(clienteId, nombreProducto, precioVenta, cantidad) {
    const cuentaRef = doc(db, "cuentasActivas", clienteId);
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
        
        if (!cuentaDoc.exists()) {
            throw new Error(`La cuenta del cliente ${clienteId} no existe.`);
        }
        
        const dataCuenta = cuentaDoc.data();
        const productosCuenta = dataCuenta.productos || {};
        const historialCuenta = dataCuenta.historial || [];
        let totalCuenta = dataCuenta.total || 0;
        
        const totalProducto = cantidad * precioVenta;
        
        // Si el producto ya existe en la cuenta, sumar cantidades
        if (productosCuenta[nombreProducto]) {
            productosCuenta[nombreProducto].cantidad += cantidad;
            productosCuenta[nombreProducto].total += totalProducto;
            productosCuenta[nombreProducto].ultimaFecha = fechaFormateada;
        } else {
            // Nuevo producto en la cuenta
            productosCuenta[nombreProducto] = {
                nombre: nombreProducto,
                precioVenta: precioVenta,
                precioUnidad: precioVenta,
                cantidad: cantidad,
                total: totalProducto,
                fechaCreacion: fechaFormateada,
                ultimaFecha: fechaFormateada,
                timestampCreacion: new Date().toISOString(),
                ordenSort: new Date().toISOString()
            };
        }
        
        // Actualizar total de la cuenta
        totalCuenta += totalProducto;
        
        // Agregar al historial
        const registroHistorial = {
            fecha: fechaFormateada,
            turno: idTurno,
            productos: [{
                nombre: nombreProducto,
                cantidad: cantidad,
                precioVenta: precioVenta,
                total: totalProducto
            }],
            subtotal: totalProducto,
            accion: 'AGREGADO MANUAL'
        };
        
        historialCuenta.push(registroHistorial);
        
        // Actualizar la cuenta
        transaction.update(cuentaRef, {
            productos: productosCuenta,
            total: totalCuenta,
            historial: historialCuenta,
            ultimaModificacion: fechaFormateada
        });
    });
}


