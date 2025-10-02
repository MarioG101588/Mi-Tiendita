import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, query, where, orderBy, limit, getDocs, updateDoc, arrayUnion, runTransaction, increment } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";import { app } from "./Conexion.js"; // debe exportar `app`
import { formatearPrecio } from "./FormateoPrecios.js";
import { mostrarCargando, mostrarExito, mostrarError, mostrarConfirmacion, mostrarInput, mostrarInputNumerico, mostrarAdvertencia, cerrarModal, mostrarPersonalizado, mostrarModalAbono} from "./SweetAlertManager.js";
import { procesarAbono, obtenerHistorialAbono, renderizarHistorialAbonos, puedeRecibirAbono, eliminarHistorialAbono } from "./Abonos.js";
import { mostrarModalMedioPago } from "./Engranaje.js";
import { wrappedGetDoc, wrappedGetDocs, wrappedSetDoc, wrappedUpdateDoc, wrappedDeleteDoc, wrappedRunTransaction } from "./FirebaseWrapper.js";
import { registrarOperacion } from "./FirebaseMetrics.js";
modificarCantidadProductoCuenta
const db = getFirestore(app);

// **FUNCIÓN DE DIAGNÓSTICO COMPLETO PARA FIRESTORE**
window.diagnosticarFirestore = async function() {
    try {
        const collectionRef = collection(db, "cuentasActivas");
        const q = query(collectionRef, limit(1));
        const snapshot = await wrappedGetDocs(q);
        if (snapshot.empty) {
            console.error('❌ No hay documentos en cuentasActivas');
            return;
        }
        const primeraCtasnapshot = snapshot.docs[0];
        const primerDocId = primeraCtasnapshot.id;
        const datosOriginales = primeraCtasnapshot.data();
        const testRef = doc(db, "cuentasActivas", primerDocId);
        try {
            await wrappedUpdateDoc(testRef, {
                pruebaEscritura: new Date().toISOString(),
                contadorPruebas: (datosOriginales.contadorPruebas || 0) + 1
            });
        } catch (writeError) {
            console.error('❌ Error en escritura simple:', writeError);
            return;
        }
        const docActualizado = await wrappedGetDoc(testRef);
        const datosNuevos = docActualizado.data();
        if (!datosNuevos.pruebaEscritura) {
            console.error('❌ Los datos NO se guardaron en Firestore');
        }
        try {
            await wrappedUpdateDoc(testRef, {
                'productos.productoPrueba': {
                    nombre: 'Producto de Prueba',
                    precio: 1000,
                    cantidad: 1
                },
                ultimaModificacion: new Date().toISOString()
            });
        } catch (complexError) {
            console.error('❌ Error en operación compleja:', complexError);
        }
    } catch (error) {
        console.error('❌ Error general en diagnóstico:', error);
        console.error('❌ Stack trace:', error.stack);
    }
};

// **FUNCIÓN DE PRUEBA ESPECÍFICA PARA CAMBIO DE NOMBRES**
window.probarCambioNombre = async function(clienteId, nuevoNombre) {
    try {
        const cuentaRef = doc(db, "cuentasActivas", clienteId);
        const docActual = await wrappedGetDoc(cuentaRef);
        if (!docActual.exists()) {
            console.error('❌ El documento no existe');
            return;
        }
        const datosActuales = docActual.data();
        await wrappedUpdateDoc(cuentaRef, {
            cliente: nuevoNombre,
            ultimaModificacion: new Date().toISOString(),
            pruebaTimestamp: Date.now()
        });
        const docVerificacion = await wrappedGetDoc(cuentaRef);
        const datosVerificacion = docVerificacion.data();
        if (datosVerificacion.cliente !== nuevoNombre) {
            console.error('❌ FALLO: El cambio de nombre NO funcionó');
        }
    } catch (error) {
        console.error('❌ Error en prueba de cambio de nombre:', error);
    }
};

// **FUNCIÓN UTILITARIA PARA CONVERTIR idTurno A FECHA LEGIBLE**
function convertirIdTurnoAFecha(idTurno) {
    if (!idTurno || idTurno === 'Sin turno') return 'Sin fecha';
    try {
        const partes = idTurno.split('_')[0];
        const [año, mes, dia] = partes.split('-');
        const fecha = new Date(parseInt(año), parseInt(mes) - 1, parseInt(dia));
        const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return fecha.toLocaleDateString('es-ES', opciones);
    } catch (error) {
        return 'Fecha inválida';
    }
}

function formatearFechaCorta(fechaStr) {
    if (!fechaStr) return '';
    // Intenta parsear la fecha
    let fecha;
    if (fechaStr instanceof Date) {
        fecha = fechaStr;
    } else {
        // Soporta formatos ISO y locales
        fecha = new Date(fechaStr);
        if (isNaN(fecha)) return fechaStr; // Si no se puede parsear, muestra original
    }
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const diaSemana = dias[fecha.getDay()];
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = meses[fecha.getMonth()];
    const año = fecha.getFullYear();
    const hora = String(fecha.getHours()).padStart(2, '0');
    const min = String(fecha.getMinutes()).padStart(2, '0');
    return `${diaSemana}-${dia}-${mes}-${año}_${hora}:${min}`;
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
        const cuentaDoc = await wrappedGetDoc(cuentaRef);

        if (!cuentaDoc.exists()) {
            detalleContainer.innerHTML = `<p>La cuenta no fue encontrada.</p>`;
            cerrarModal();
            return;
        }

        const cuenta = cuentaDoc.data();

        // --- BLOQUE PARA PRODUCTOS ---
        const productosObj = cuenta.productos || {};
        const esTipoEnCuaderno = cuenta.tipo === 'En cuaderno';

        // Obtener la fecha de creación real del primer producto (opcional)
        let fechaCreacionReal = 'No disponible';
        if (esTipoEnCuaderno) {
            const primerProducto = Object.values(productosObj)[0];
            if (primerProducto && primerProducto.primerPedido) {
                fechaCreacionReal = primerProducto.primerPedido;
            }
        }

        // Convertir a array y ordenar por timestamp de creación o nombre para orden consistente
        const productosArray = Object.entries(productosObj).map(([productoId, producto]) => ({
            id: productoId,
            ...producto,
            ordenSort: producto.timestampCreacion || producto.primerPedido || producto.nombre || productoId
        }));

        productosArray.sort((a, b) => {
            if (a.ordenSort && b.ordenSort && typeof a.ordenSort === 'string' && a.ordenSort.includes('-')) {
                return a.ordenSort.localeCompare(b.ordenSort);
            }
            return (a.nombre || a.id).localeCompare(b.nombre || b.id);
        });

        // Calcula el total general
        const total = productosArray.reduce((acc, p) => acc + (p.total ?? 0), 0);
        const totalFormateado = formatearPrecio(total);

        // Tarjetas de producto con scroll horizontal
        let productosHtml = `
  <div class="d-flex flex-row flex-nowrap gap-3" style="overflow-x: auto; padding-bottom: 8px;">
    ${productosArray.map(p => `
      <div class="card shadow-sm" style="min-width: 240px; max-width: 260px;">
        <div class="card-body p-2 text-center">
          <div class="mb-1 text-secondary" style="font-size:0.95rem;">
  ${formatearFechaCorta(p.fechaCreacion || p.primerPedido)}
</div>
          <div class="mb-2 fw-bold" style="font-size:1.1rem;">${p.nombre}</div>
          <div class="mb-2">
            <span class="text-muted">Precio c/u: </span>
            <span>${formatearPrecio(p.precioUnidad ?? p.precioVenta ?? 0)}</span>
          </div>
          <div class="mb-2">
            <span class="text-muted">Cantidad: </span>
            ${
              !esTipoEnCuaderno
                ? `<div class="d-flex align-items-center justify-content-center">
                    <button class="btn btn-cantidad btn-menos" onclick="window.disminuirCantidadCuenta('${clienteId}','${p.id}')">−</button>
                    <span class="cantidad-display mx-2">${p.cantidad ?? 0}</span>
                    <button class="btn btn-cantidad btn-mas" onclick="window.aumentarCantidadCuenta('${clienteId}','${p.id}')">+</button>
                  </div>`
                : `<span class="cantidad-display">${p.cantidad ?? 0}</span>`
            }
          </div>
          <div>
            <span class="text-muted">Total: </span>
            <span>${formatearPrecio(p.total ?? 0)}</span>
          </div>
        </div>
      </div>
    `).join('')}
  </div>
`;
        // Obtener historial de abonos si la cuenta es "En cuaderno"
        let historialHTML = '';
        if (cuenta.tipo === 'En cuaderno') {
            const historialAbonos = await obtenerHistorialAbono(clienteId);
            if (historialAbonos.length > 0) {
                historialHTML = renderizarHistorialAbonos(historialAbonos);
            }
        }

        detalleContainer.innerHTML = `
            <div class="card">
                
                <div class="card-body">
                    <!-- Logo del local -->
                    <div class="logo-container-detalle mb-3">
                        <img src="./pngs/LogoLocal.png" alt="Logo El Arrendajo Azul" class="logo-detalle" />
                    </div>
                    
                    <div class="text-center mb-3">
                        <button class="btn btn-primary btn-lg" onclick="agregarProductoACuenta('${clienteId}')">
                            ➕ Agregar Producto
                        </button>
                    </div>
                    <div class="card-header bg-primary text-white">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <h3 class="mb-0 titulo-cuenta-resaltado">📋 Cuenta: 
                                <span id="nombreCliente" class="nombre-editable" 
                                      onclick="editarNombreCliente('${clienteId}', '${cuenta.cliente || 'Cliente'}')"
                                      title="¿Quién es este cliente? Clic para cambiar el nombre"
                                      style="cursor: pointer; text-decoration: underline; text-decoration-style: dashed;">
                                    ${cuenta.cliente || 'Cliente'}
                                </span>
                                <small class="ms-2">✏️</small>
                            </h3>
                        </div>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mt-2">
                        <span class="badge bg-warning text-dark fs-6">${cuenta.tipo || 'Pendiente'}</span>
                        ${esTipoEnCuaderno ? `<small>📅 Creada: ${fechaCreacionReal}</small>` : ''}
                    </div>
                </div>
                    <h5 class="mb-3 text-center">📦 Total:</h5>
                    
                    <!-- TOTAL FIJO VISIBLE -->
                    <div class="alert alert-success text-center mb-3" style="background: linear-gradient(135deg, #28a745, #20c997); border: none; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                        <h1 class="mb-0 text-white fw-bold" style="font-size: 1.8rem;">
                            💰 ${totalFormateado}
                        </h1>
                    </div>

                    <!-- Tarjetas de productos con scroll horizontal -->
                    ${productosHtml}
                    
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
                    
                    ${historialHTML}
                </div>
                <div class="card-footer">
                    <div class="d-flex flex-wrap gap-2 justify-content-center">
                        <button class="btn btn-secondary btn-lg" onclick="mostrarContainer('container2')">
                            ↩️ Volver
                        </button>
                        <button class="btn btn-success btn-lg" onclick="cerrarCuenta('${clienteId}')">
                            💰 Pagar cuenta
                        </button>
                        <button class="btn btn-warning btn-lg" onclick="window.procesarAbonoCliente('${clienteId}')">
                            💵 Abono
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
    }
}

// --- FUNCIONES PARA EDITAR CANTIDAD DE PRODUCTOS EN CUENTAS ACTIVAS ---

async function modificarCantidadProductoCuenta(clienteId, productoId, operacion) {
    const cuentaRef = doc(db, "cuentasActivas", clienteId);

    try {
        // Envolvemos toda la lógica en una transacción para seguridad
        await wrappedRunTransaction(db, async (transaction) => {
            const cuentaDoc = await transaction.get(cuentaRef);
            if (!cuentaDoc.exists()) {
                throw new Error("La cuenta no fue encontrada");
            }

            const cuenta = cuentaDoc.data();
            const productos = { ...cuenta.productos };
            const historial = [...(cuenta.historial || [])];
            const producto = productos[productoId];
            if (!producto) return;

            // Referencia al producto en el inventario
            const inventarioRef = doc(db, "inventario", productoId);

            const fechaActual = new Date();
            const fechaFormateada = fechaActual.toLocaleString('es-CO', { timeZone: 'America/Bogota' });
            const idTurno = localStorage.getItem("idTurno") || cuenta.turno;
            let cantidadCambio = 0;
            let tipoOperacion = '';

            if (operacion === 'aumentar') {
                producto.cantidad += 1;
                cantidadCambio = 1;
                tipoOperacion = 'Agregado';
                producto.ultimaFecha = fechaFormateada;
                // Descontar 1 del inventario
                transaction.update(inventarioRef, { cantidad: increment(-1) });

            } else if (operacion === 'disminuir') {
                cantidadCambio = -1;
                tipoOperacion = 'Reducido';
                producto.ultimaFecha = fechaFormateada;

                // Devolver 1 al inventario
                transaction.update(inventarioRef, { cantidad: increment(1) });

                if (producto.cantidad <= 1) {
                    delete productos[productoId];
                    tipoOperacion = 'Eliminado';
                } else {
                    producto.cantidad -= 1;
                }
            }

            if (productos[productoId]) {
                producto.total = producto.cantidad * (producto.precioUnidad ?? producto.precioVenta ?? 0);
                productos[productoId] = producto;
            }

            let totalCuenta = 0;
            for (const pid in productos) {
                totalCuenta += productos[pid].total ?? 0;
            }

            // Lógica para registrar el cambio en el historial
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

            // Actualizar la cuenta en la base de datos
            transaction.update(cuentaRef, {
                productos,
                historial,
                total: totalCuenta,
                ultimaActualizacion: new Date()
            });
        }, { lecturas: 1, escrituras: 2 }); // Opciones para el wrapper

        // Actualizar la vista en la pantalla DESPUÉS de que la transacción fue exitosa
        await cargarDetalleCuenta(clienteId);

    } catch (error) {
        console.error('❌ ERROR COMPLETO EN modificarCantidadProductoCuenta:', error);
        mostrarError('No se pudo modificar la cantidad: ' + error.message);
    }
}
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
        await wrappedDeleteDoc(doc(db, "cuentasActivas", clienteId));
        mostrarExito('La cuenta ha sido eliminada.');
        if (typeof mostrarContainer === 'function') mostrarContainer('container2');
    } catch (error) {
        mostrarError('No se pudo eliminar la cuenta: ' + error.message);
    }
};

// ---------- FUNCIONES GLOBALES ----------

window.pagoAmericano = async function (clienteId) {
    await cerrarCuenta(clienteId, true);
};
window.pagoEfectivo = async function (clienteId) {
    await cerrarCuenta(clienteId, false);
};

window.cerrarCuenta = async function (clienteId, esPagoAmericano = false) {
    try {
        mostrarCargando('Cargando cuenta...');
        const cuentaRef = doc(db, "cuentasActivas", clienteId);
        const cuentaDoc = await wrappedGetDoc(cuentaRef);
        if (!cuentaDoc.exists()) throw new Error("La cuenta no existe.");
        const cuenta = cuentaDoc.data();
        cerrarModal();
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
        const medioPagoFinal = await mostrarModalMedioPago(cuenta.total || 0);
        if (!medioPagoFinal) return;
        mostrarCargando(`Procesando pago con ${medioPagoFinal}`);
        let idTurno = localStorage.getItem("idTurno");
        if (!idTurno) {
            const turnosRef = collection(db, "turnos");
            const q = query(turnosRef, where("estado", "==", "activo"), orderBy("fechaInicio", "desc"), limit(1));
            const snap = await wrappedGetDocs(q);
            if (!snap.empty) {
                idTurno = snap.docs[0].id;
                localStorage.setItem("idTurno", idTurno);
            }
        }
        if (!idTurno) throw new Error("No se encontró turno activo.");
        const totalCalculado = cuenta.total || 0;
        const productosObj = cuenta.productos || {};
        const productosArray = Object.values(productosObj).map(p => ({
            nombreProducto: String(p?.nombre ?? p?.nombreProducto ?? 'sin nombre'),
            precioVenta: Number(p?.precioUnidad ?? p?.precioVenta ?? 0),
            cantidad: Number(p?.cantidad ?? 0)
        }));
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
        if (!clienteObj.cliente || !clienteObj.tipoVenta || !clienteObj.productos.length) {
            throw new Error("Datos incompletos para guardar la venta.");
        }
        const turnoRef = doc(db, "cuentasCerradas", idTurno);
        const turnoSnap = await wrappedGetDoc(turnoRef);
        if (!turnoSnap.exists()) {
            await wrappedSetDoc(turnoRef, { clientes: [clienteObj] });
        } else {
            await wrappedUpdateDoc(turnoRef, { clientes: arrayUnion(clienteObj) });
        }
        await wrappedDeleteDoc(cuentaRef);
        await eliminarHistorialAbono(clienteId);
        mostrarExito('La venta ha sido registrada.');
        if (typeof mostrarContainer === 'function') mostrarContainer('container2');
    } catch (error) {
        mostrarError(`No se pudo cerrar la cuenta: ${error.message}`);
    }
};

window.agregarProductoACuenta = async function(clienteId) {
    try {
        mostrarModalBusquedaProductos(clienteId);
    } catch (error) {
        mostrarError(`Error al abrir búsqueda de productos: ${error.message}`);
        console.error("Error agregarProductoACuenta:", error);
    }
};

window.editarNombreCliente = async function(clienteId, nombreActual) {
    try {
        const resultado = await mostrarPersonalizado({
            title: '👤 ¿Quién es el cliente?',
            text: `Cambie el nombre de "${nombreActual}" por el nombre real del cliente`,
            input: 'text',
            inputPlaceholder: 'Escriba el nombre del cliente...',
            inputValue: nombreActual,
            showCancelButton: true,
            confirmButtonText: '✅ Cambiar Nombre',
            cancelButtonText: '❌ Cancelar',
            inputValidator: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'El nombre no puede estar vacío';
                }
                if (value.trim().length > 50) {
                    return 'el nombre no puede tener más de 50 caracteres';
                }
                return null;
            }
        });

        if (resultado.isConfirmed && resultado.value) {
            const nuevoNombre = resultado.value.trim();
            if (nuevoNombre !== nombreActual) {
                mostrarCargando('Actualizando nombre...');
                try {
                    const cuentaRef = doc(db, "cuentasActivas", clienteId);
                    const docSnapshot = await wrappedGetDoc(cuentaRef);
                    if (!docSnapshot.exists()) {
                        throw new Error(`El documento con ID ${clienteId} no existe en cuentasActivas`);
                    }
                    await wrappedUpdateDoc(cuentaRef, {
                        cliente: nuevoNombre,
                        ultimaModificacion: new Date().toISOString()
                    });
                    const spanNombre = document.getElementById('nombreCliente');
                    if (spanNombre) {
                        spanNombre.textContent = nuevoNombre;
                        spanNombre.onclick = () => editarNombreCliente(clienteId, nuevoNombre);
                    }
                    mostrarExito(`✅ Cliente identificado como: "${nuevoNombre}"`);
                } catch (firestoreError) {
                    console.error('❌ Error específico de Firestore:', firestoreError);
                    mostrarError(`Error al guardar en la base de datos: ${firestoreError.message}`);
                    throw firestoreError;
                }
            }
        }
    } catch (error) {
        mostrarError(`Error al actualizar el nombre: ${error.message}`);
        console.error("Error editarNombreCliente:", error);
    }
};

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
            input.addEventListener('input', async (e) => {
                await buscarProductosEnInventario(e.target.value, resultados, clienteId);
            });
            input.focus();
        }
    });
}

async function buscarProductosEnInventario(termino, resultadosDiv, clienteId) {
    if (!termino.trim()) {
        resultadosDiv.innerHTML = '<p class="text-muted">Escriba para buscar productos...</p>';
        return;
    }
    try {
        resultadosDiv.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"></div><br>Buscando...</div>';
        const inventarioRef = collection(db, "inventario");
        const snapshot = await wrappedGetDocs(inventarioRef);
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
                        onclick="seleccionarProductoParaAgregar('${clienteId}', '${producto.id}', ${producto.precio})"
                        style="min-height: 55px; border-left: 3px solid #28a745;">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="fw-bold" style="color: #333; font-size: 1rem;">${producto.nombre}</div>
                            <small style="color: #ffffff; font-size: 0.85rem;">Stock: ${producto.cantidad} disponibles</small>
                        </div>
                        <div class="text-end">
                            <div class="fw-bold" style="color: #fff; background: #28a745; padding: 3px 8px; border-radius: 4px; font-size: 1rem;">${precio}</div>
                        </div>
                    </div>
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

window.seleccionarProductoParaAgregar = async function(clienteId, nombreProducto, precioVenta) {
    try {
        cerrarModal();
        const result = await mostrarInputNumerico(
            'Cantidad a agregar',
            `¿Cuántas unidades de "${nombreProducto}" desea agregar?`
        );
        if (result.dismiss) {
            return;
        }
        const cantidad = result.value;
        if (!cantidad || isNaN(cantidad) || parseInt(cantidad) <= 0) {
            mostrarAdvertencia('Debe ingresar una cantidad válida mayor a 0.');
            return;
        }
        const cantidadNum = parseInt(cantidad);
        await agregarProductoACuentaEnBD(clienteId, nombreProducto, precioVenta, cantidadNum);
        cargarDetalleCuenta(clienteId);
    } catch (error) {
        mostrarError(`Error al agregar producto: ${error.message}`);
        console.error("Error seleccionarProductoParaAgregar:", error);
    }
};

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

    try {
        await wrappedRunTransaction(db, async (transaction) => {
        const cuentaDoc = await transaction.get(cuentaRef);
        if (!cuentaDoc.exists()) {
            throw new Error(`La cuenta del cliente ${clienteId} no existe.`);
        }

        const inventarioRef = doc(db, "inventario", nombreProducto);
            transaction.update(inventarioRef, {
                cantidad: increment(-cantidad) // Resta la cantidad que se está agregando
            });

        const dataCuenta = cuentaDoc.data();
        const productosCuenta = dataCuenta.productos || {};
        const historialCuenta = dataCuenta.historial || [];
        let totalCuenta = dataCuenta.total || 0;
        const totalProducto = cantidad * precioVenta;
        if (productosCuenta[nombreProducto]) {
            productosCuenta[nombreProducto].cantidad += cantidad;
            productosCuenta[nombreProducto].total += totalProducto;
            productosCuenta[nombreProducto].ultimaFecha = fechaFormateada;
        } else {
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
        totalCuenta += totalProducto;
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
        transaction.update(cuentaRef, {
            productos: productosCuenta,
            total: totalCuenta,
            historial: historialCuenta,
            ultimaModificacion: fechaFormateada
        });
    }, { lecturas: 1, escrituras: 1 });
    } catch (error) {
        console.error('❌ ERROR EN agregarProductoACuentaEnBD:', error);
        throw error;
    }
}

// =====================================================
// FUNCIONES PARA MANEJO DE ABONOS
// =====================================================

window.procesarAbonoCliente = async function(clienteId) {
    try {
        mostrarCargando('Cargando datos de la cuenta...');
        const cuentaRef = doc(db, "cuentasActivas", clienteId);
        const cuentaSnap = await wrappedGetDoc(cuentaRef);
        if (!cuentaSnap.exists()) {
            cerrarModal();
            await mostrarError('Cuenta no encontrada');
            return;
        }
        const cuenta = cuentaSnap.data();
        if (!puedeRecibirAbono(cuenta)) {
            cerrarModal();
            await mostrarAdvertencia('Esta cuenta no puede recibir abonos');
            return;
        }
        cerrarModal();
        const datosAbono = await mostrarModalAbono(cuenta.cliente, cuenta.total);
        if (datosAbono) {
            const exito = await procesarAbono(
                clienteId, 
                datosAbono.monto, 
                datosAbono.medioPago, 
                cuenta.total
            );
            if (exito) {
                if (window.cargarCuentasAbiertas) {
                    window.cargarCuentasAbiertas();
                }
            }
        }
    } catch (error) {
        cerrarModal();
        console.error('Error procesando abono:', error);
        await mostrarError(`Error: ${error.message}`);
    }
};

async function actualizarVistaConHistorial(clienteId, contenidoHTML) {
    try {
        const historial = await obtenerHistorialAbono(clienteId);
        if (historial.length > 0) {
            const historialHTML = renderizarHistorialAbonos(historial);
            const botonesIndex = contenidoHTML.lastIndexOf('<div class="d-grid gap-2">');
            if (botonesIndex !== -1) {
                return contenidoHTML.slice(0, botonesIndex) + historialHTML + contenidoHTML.slice(botonesIndex);
            }
        }
        return contenidoHTML;
    } catch (error) {
        console.error('Error cargando historial de abonos:', error);
        return contenidoHTML;
    }
}