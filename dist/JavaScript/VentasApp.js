import { getFirestore, doc, getDoc, setDoc, collection, query, where, orderBy, limit, getDocs, updateDoc, arrayUnion, runTransaction, serverTimestamp, increment} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { app } from "./Conexion.js"; // Se asume que este archivo exporta la app de Firebase inicializada
import { mostrarAdvertencia, mostrarFormularioVenta, mostrarCargando, mostrarExito, mostrarError, cerrarModal, mostrarValidacion } from "./SweetAlertManager.js";
import { mostrarModalMedioPago } from "./Engranaje.js";
import { wrappedGetDocs, wrappedGetDoc, wrappedSetDoc, wrappedUpdateDoc, wrappedRunTransaction } from "./FirebaseWrapper.js";
import { registrarOperacion } from "./FirebaseMetrics.js";

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
        const snap = await wrappedGetDocs(q);
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

    try {
        await wrappedRunTransaction(db, async (transaction) => {
            
            // A. LÓGICA AÑADIDA: Descontar cada producto del inventario
            for (const idProducto in carrito) {
                const itemCarrito = carrito[idProducto];
                const inventarioRef = doc(db, "inventario", itemCarrito.nombre);
                
                // Usamos increment() para restar la cantidad de forma segura
                transaction.update(inventarioRef, {
                    cantidad: increment(-itemCarrito.cantidad)
                });
            }

            // B. LÓGICA ORIGINAL (ADAPTADA): Guardar la venta en 'cuentasCerradas'
            const turnoRef = doc(db, "cuentasCerradas", idTurno);
            const turnoSnap = await transaction.get(turnoRef);

            if (!turnoSnap.exists()) {
                transaction.set(turnoRef, { clientes: [clienteObj] });
            } else {
                transaction.update(turnoRef, { clientes: arrayUnion(clienteObj) });
            }
        });
    } catch (error) {
        console.error("Error en la transacción de venta directa:", error);
        throw new Error("No se pudo completar la venta y actualizar el inventario.");
    }


    // 6. Guardar la venta en el documento del turno activo dentro de 'cuentasCerradas'.
    const turnoRef = doc(db, "cuentasCerradas", idTurno);
    const turnoSnap = await wrappedGetDoc(turnoRef);

    if (!turnoSnap.exists()) {
        await wrappedSetDoc(turnoRef, { clientes: [clienteObj] });
    } else {
        await wrappedUpdateDoc(turnoRef, { clientes: arrayUnion(clienteObj) });
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
    // console.log('🔍 [PROCESAR VENTA CLIENTE] - Parámetros recibidos:');
    // console.log('   👤 Cliente:', cliente);
    // console.log('   📋 Clase Venta:', claseVenta);
    // console.log('   🛒 Carrito:', carrito);
    
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

    await wrappedRunTransaction(db, async (transaction) => {
        const cuentaDoc = await transaction.get(cuentaRef);
        
        // console.log('🔍 [TRANSACCIÓN] - Estado de la cuenta:');
        // console.log('   🗃️  Cuenta existe:', cuentaDoc.exists());
        // if (cuentaDoc.exists()) {
        //     console.log('   📋 Tipo actual en BD:', cuentaDoc.data().tipo);
        //     console.log('   💰 Total actual:', cuentaDoc.data().total);
        // }
        
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
            
            const inventarioRef = doc(db, "inventario", itemCarrito.nombre);
            transaction.update(inventarioRef, {
                cantidad: increment(-itemCarrito.cantidad) // Resta la cantidad del carrito
            });

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
                    ultimaFecha: fechaFormateada,
                    // 🔧 Agregar timestamp específico para mantener orden fijo en la lista
                    timestampCreacion: new Date().toISOString()
                };
            }
        }

        // Agregar registro al historial
        historialCuenta.push(registroHistorial);

        totalCuenta += Object.values(carrito).reduce((acc, item) => acc + item.total, 0);

        if (cuentaDoc.exists()) {
            const tipoOriginal = cuentaDoc.data().tipo;
            // console.log('📝 [PROCESAR VENTA CLIENTE] - Actualizando cuenta existente:');
            // console.log('   👤 Cliente:', cliente);
            // console.log('   📋 Tipo original:', tipoOriginal);
            // console.log('   📋 Clase Venta nueva:', claseVenta);
            // console.log('   💰 Total anterior:', cuentaDoc.data().total);
            // console.log('   💰 Total nuevo:', totalCuenta);
            
            // Verificar si necesita actualizar el tipo
            // if (tipoOriginal !== claseVenta) {
            //     console.log('   🔄 ACTUALIZANDO TIPO: de "' + tipoOriginal + '" a "' + claseVenta + '"');
            // } else {
            //     console.log('   ✅ TIPO MANTENIDO: "' + claseVenta + '"');
            // }
            
            transaction.update(cuentaRef, {
                productos: productosCuenta,
                historial: historialCuenta,
                total: totalCuenta,
                tipo: claseVenta, // 🔧 AHORA SÍ ACTUALIZA EL TIPO
                ultimaActualizacion: serverTimestamp(),
                turno: idTurno
            });
        } else {
            // console.log('💾 [PROCESAR VENTA CLIENTE] - Creando nueva cuenta con:');
            // console.log('   👤 Cliente:', cliente);
            // console.log('   📋 Tipo:', claseVenta);
            // console.log('   💰 Total:', totalCuenta);
            
            transaction.set(cuentaRef, {
                cliente: cliente,
                tipo: claseVenta,
                productos: productosCuenta,
                historial: historialCuenta,
                total: totalCuenta,
                fechaApertura: serverTimestamp(),
                turno: idTurno
            });
            
            // console.log('✅ [TRANSACCIÓN] - SET ejecutado para nueva cuenta:', cliente, 'con tipo:', claseVenta);
        }
        
        // console.log('🔄 [TRANSACCIÓN] - Ejecutando runTransaction...');
    }, { lecturas: 1, escrituras: 1 }).then(() => {
        // console.log('✅ [TRANSACCIÓN] - runTransaction COMPLETADA exitosamente');
    }).catch((error) => {
        console.error('❌ [TRANSACCIÓN] - runTransaction FALLÓ:', error);
        throw error;
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

    // console.log('🔍 [REALIZAR VENTA] - FormValues recibidos:', formValues);

    if (formValues) {
        // console.log('✅ [REALIZAR VENTA] - Procesando venta con clase:', formValues.claseVenta);
        mostrarCargando('Procesando venta...');

        try {
            if (formValues.claseVenta === 'Pago en efectivo') {
                // console.log('💰 [REALIZAR VENTA] - Flujo: Pago en efectivo');
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
                // console.log('📝 [REALIZAR VENTA] - Flujo: Cuenta de cliente');
                // console.log('   👤 Cliente:', formValues.cliente);
                // console.log('   📋 Clase Venta:', formValues.claseVenta);
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

// ===============================================
// FUNCIONES DE MEJORA PARA MÓVILES ANDROID
// ===============================================

/**
 * Cierra el teclado virtual y quita el foco del campo activo
 */
window.cerrarTeclado = function() {
    const campoActivo = document.activeElement;
    if (campoActivo && (campoActivo.tagName === 'INPUT' || campoActivo.tagName === 'TEXTAREA')) {
        campoActivo.blur();
    }
    
    // Remover clase de campo activo
    document.querySelectorAll('.input-active').forEach(el => {
        el.classList.remove('input-active');
    });
    
    // Quitar clase del body
    document.body.classList.remove('keyboard-active');
    
    // Scroll suave hacia arriba para reorganizar la vista
    setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
};

/**
 * Limpia el contenido del campo de búsqueda
 */
window.limpiarBusqueda = function() {
    const campoBusqueda = document.getElementById('campoBusqueda1');
    if (campoBusqueda) {
        campoBusqueda.value = '';
        campoBusqueda.focus();
        
        // Limpiar resultados de búsqueda
        const resultados = document.getElementById('resultadoBusqueda1');
        if (resultados) {
            resultados.innerHTML = '';
            resultados.classList.add('d-none');
        }
    }
};

/**
 * Configura los event listeners para mejorar la experiencia en móviles
 */
function configurarEventosMobiles() {
    // Detectar cuando se abre/cierra el teclado
    const campoBusqueda = document.getElementById('campoBusqueda1');
    
    if (campoBusqueda) {
        // Cuando el campo recibe foco
        campoBusqueda.addEventListener('focus', function() {
            this.classList.add('input-active');
            document.body.classList.add('keyboard-active');
            
            // Scroll automático para que el campo sea visible
            setTimeout(() => {
                this.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
            }, 300); // Delay para que el teclado aparezca
        });
        
        // Cuando el campo pierde foco
        campoBusqueda.addEventListener('blur', function() {
            this.classList.remove('input-active');
            document.body.classList.remove('keyboard-active');
        });
        
        // Mejorar la experiencia de escritura
        campoBusqueda.addEventListener('input', function() {
            // Esto ayuda a mantener el campo visible mientras se escribe
            if (this.classList.contains('input-active')) {
                setTimeout(() => {
                    this.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'center' 
                    });
                }, 100);
            }
        });
    }
    
    // Detectar cambios en el tamaño de viewport (cuando aparece/desaparece el teclado)
    let lastHeight = window.innerHeight;
    
    window.addEventListener('resize', function() {
        const currentHeight = window.innerHeight;
        const heightDifference = lastHeight - currentHeight;
        
        // Si la altura se reduce significativamente, probablemente apareció el teclado
        if (heightDifference > 150) {
            document.body.classList.add('keyboard-active');
        } 
        // Si la altura aumenta, probablemente se cerró el teclado
        else if (heightDifference < -150) {
            document.body.classList.remove('keyboard-active');
        }
        
        lastHeight = currentHeight;
    });
    
    // Prevenir zoom en doble tap en iOS
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function(event) {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
}

// Inicializar las mejoras para móviles cuando se carga la página
document.addEventListener('DOMContentLoaded', configurarEventosMobiles);