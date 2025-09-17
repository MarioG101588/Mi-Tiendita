// ComprasUI.js
import { guardarCompraEnBD, cargarComprasRecientesDesdeBD, buscarProveedores, guardarProveedor, guardarCompraCredito, calcularFechaVencimientoCompra } from "./ComprasService.js";
import { mostrarPersonalizado } from "./SweetAlertManager.js";
import { agregarProductoAlCarrito, obtenerCarritoCompras } from "./ComprasService.js";
function renderCarritoComprasInternas() {
    const cont = document.getElementById('productosAgregadosContainer');
    if (!cont) return;
    const productos = obtenerCarritoCompras();
    if (!productos.length) {
        cont.innerHTML = '<div class="text-muted">No hay productos agregados.</div>';
        return;
    }
    let html = '';
    let totalGeneral = 0;
    productos.forEach((p, idx) => {
        const unidades = parseInt(p.unidades) || 1;
        const cantidad = parseInt(p.cantidad) || 1;
        const cantidadTotal = unidades * cantidad;
        const precioPresentacion = parseFloat(p.precioPresentacion) || 0;
        const totalCompra = precioPresentacion * cantidad;
        totalGeneral += totalCompra;
        // Mostrar siempre el precio compra c/u con formato y decimales
        let precioCompraUnidad = '';
        // Siempre usar el módulo FormateoPrecios.js para mostrar el valor
        let valorCompraUnidad = 0;
        if (typeof p.precioCompraUnidad === 'number') {
            valorCompraUnidad = p.precioCompraUnidad;
        } else if (typeof p.precioCompraUnidad === 'string' && p.precioCompraUnidad.trim() !== '') {
            valorCompraUnidad = parseFloat(p.precioCompraUnidad.replace(/[^\d\.]/g, ''));
        }
    // Formatear con 3 decimales y símbolo
    precioCompraUnidad = `$ ${valorCompraUnidad.toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
        const precioVenta = p.precioVenta ? formatearCOP(p.precioVenta) : '';
        const totalCompraFormateado = formatearCOP(totalCompra);
        const ganancia = p.ganancia || '';
        const fechaVencimiento = p.fechaVencimiento ? p.fechaVencimiento : 'No se estableció';
        html += `
            <div class="card d-inline-block m-2 p-2" style="min-width:260px;max-width:300px;background:#f8f9fa;border:2px solid #007bff;box-shadow:0 2px 8px #007bff33;vertical-align:top;">
                <div><b>Producto:</b> ${p.nombre}</div>
                <div><b>Proveedor:</b> ${p.proveedor}</div>
                <div><b>Cantidad:</b> ${cantidadTotal}</div>
                <div><b>Tipo de compra:</b> ${p.tipoCompra ? p.tipoCompra : 'No definido'}</div>
                <div><b>Precio compra c/u:</b> ${precioCompraUnidad}</div>
                <div><b>Total:</b> ${totalCompraFormateado}</div>
                <div><b>Precio venta c/u:</b> ${precioVenta}</div>
                <div><b>Ganancia (%):</b> ${ganancia}</div>
                <div><b>Fecha vencimiento:</b> ${fechaVencimiento}</div>
                <div class="mt-2">
                    <button class="btn btn-warning btn-sm" onclick="window.editarProductoCarrito(${idx})">Editar</button><br>
                    <button class="btn btn-danger btn-sm" onclick="window.eliminarProductoCarrito(${idx})">Borrar</button>
                </div>
            </div>
        `;
    });
    // Fijar el total y el botón fuera del scroll
    const totalYBoton = `<div class="mt-3 fw-bold" style="font-size:1.1em;color:#007bff;position:sticky;bottom:0;left:0;z-index:10;background:#fff;padding:8px 0;">Total de la compra: ${formatearCOP(totalGeneral)}</div>
    <button class="btn btn-success w-100 mt-2" style="position:sticky;bottom:0;left:0;z-index:10;" onclick="window.realizarCompraCarrito()">Realizar compra</button>`;
    cont.innerHTML = `<div style="overflow-x:auto;white-space:nowrap;">${html}</div>${totalYBoton}`;
    // Exponer funciones globales para editar/borrar/realizar compra
    window.eliminarProductoCarrito = idx => {
        import('./ComprasService.js').then(mod => {
            mod.eliminarProductoDelCarrito(idx);
            renderCarritoComprasInternas();
        });
    };
    window.editarProductoCarrito = idx => {
        // Aquí puedes implementar la lógica de edición (abrir modal con datos)
        alert('Función de edición no implementada aún.');
    };
    window.realizarCompraCarrito = () => {
        // Aquí puedes implementar la lógica para procesar la compra
        alert('Compra realizada correctamente.');
        import('./ComprasService.js').then(mod => {
            mod.limpiarCarritoCompras();
            renderCarritoComprasInternas();
        });
    };
}
import { formatearPrecio as formatearCOP } from "./FormateoPrecios.js";

/**
 * Inicializa el módulo de compras
 */
export function renderizarModuloCompras() {
    const cont = document.getElementById("containerCompras");
    if (!cont) return;

    cont.innerHTML = `
        <div class="logo-container-compras">
            <img src="pngs/CarritoC.png" class="logo-compras" alt="Compras">
        </div>
        <h2>Gestión de Compras</h2>
        <div class="botones">
            <button id="btnNuevaCompra" class="btn btn-primary">Nueva Compra</button>
            <button onclick="mostrarContainer('container2')" class="btn btn-primary">📋 Ir a INICIO</button>
        </div>
        <div id="comprasFormContainer"></div>
        <div id="productosAgregadosContainer" class="mt-4" style="overflow-x:auto; white-space:nowrap;"></div>
        <div class="botones mt-3">
            <button id="btnSiguienteCompra" class="btn btn-success d-none">Siguiente</button>
        </div>
    `;

        document.getElementById("btnNuevaCompra").addEventListener("click", mostrarModalSeleccionProducto);
}

    // Paso 1: Modal visual para seleccionar producto del inventario
    async function mostrarModalSeleccionProducto() {
        // Simulación: obtener lista de productos del inventario
        let inventario = [];
        try {
            inventario = await obtenerInventarioCompletoMock();
        } catch (e) {
            inventario = [];
        }
        if (!inventario.length) {
            await mostrarPersonalizado({
                title: 'Inventario vacío',
                text: 'No hay productos en el inventario.',
                icon: 'warning',
                confirmButtonText: 'Cerrar'
            });
            return;
        }
        const html = `
            <label for='inputProducto'>Selecciona el producto:</label>
            <input id='inputProducto' class='swal2-input' style='width:100%;margin-bottom:1em;' list='productosList' autocomplete='off'>
            <datalist id='productosList'></datalist>
            <div id='mensajeNuevoProducto' style='color:#007bff;display:none;margin-top:0.5em;'>Nuevo producto, se registrará</div>
        `;
        let inventarioActual = [];
        async function consultarInventarioFirebase(filtro) {
            // Consulta directa a Firestore, no afecta Inventario.js
            try {
                const { getFirestore, collection } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
                const { wrappedGetDocs } = await import('./FirebaseWrapper.js');
                const { app } = await import('./Conexion.js');
                const db = getFirestore(app);
                const inventarioRef = collection(db, 'inventario');
                const snapshot = await wrappedGetDocs(inventarioRef);
                const filtroLower = filtro.trim().toLowerCase();
                const productos = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (!filtroLower || doc.id.toLowerCase().includes(filtroLower)) {
                        productos.push({
                            id: doc.id,
                            nombre: doc.id,
                            ...data
                        });
                    }
                });
                return productos;
            } catch (e) {
                return [];
            }
        }
        await mostrarPersonalizado({
            title: 'Selecciona el producto',
            html,
            showCancelButton: true,
            confirmButtonText: 'Continuar',
            cancelButtonText: 'Cancelar',
            focusConfirm: false,
            didOpen: () => {
                const input = document.getElementById('inputProducto');
                const datalist = document.getElementById('productosList');
                const mensajeNuevo = document.getElementById('mensajeNuevoProducto');
                input.addEventListener('input', async () => {
                    const texto = input.value.trim().toLowerCase();
                    inventarioActual = await consultarInventarioFirebase(texto);
                    datalist.innerHTML = inventarioActual.map(p => `<option value='${p.nombre}'>`).join("");
                    const existe = inventarioActual.some(p => p.nombre.toLowerCase() === texto);
                    mensajeNuevo.style.display = (!existe && texto.length > 0) ? 'block' : 'none';
                });
                // Primer carga sin filtro
                consultarInventarioFirebase('').then(productos => {
                    inventarioActual = productos;
                    datalist.innerHTML = inventarioActual.map(p => `<option value='${p.nombre}'>`).join("");
                });
            }
        }).then(async result => {
            if (!result.isConfirmed) return;
            const nombreIngresado = document.getElementById('inputProducto').value.trim();
            if (!nombreIngresado) return;
            const productoExistente = inventarioActual.find(p => p.nombre.toLowerCase() === nombreIngresado.toLowerCase());
            if (productoExistente) {
                mostrarModalFormularioProducto(productoExistente);
            } else {
                // Nuevo registro
                mostrarModalFormularioProducto({ nombre: nombreIngresado });
            }
        });
    }

    // Paso 2: Modal visual para formulario de ingreso de datos del producto seleccionado
    async function mostrarModalFormularioProducto(producto) {
        // Simulación: obtener cantidades predeterminadas
        let cantidadesPredeterminadas = await obtenerCantidadesPredeterminadasMock();
        if (!Array.isArray(cantidadesPredeterminadas)) cantidadesPredeterminadas = [];
        let presentacionOpciones = '';
        cantidadesPredeterminadas.forEach(c => {
            presentacionOpciones += `<option value='${c}'>${c}</option>`;
        });
        presentacionOpciones += `<option value='__nuevo__'>Nueva cantidad</option>`;
        // Proveedor
        const proveedor = producto.proveedor || '';
        const proveedorDisabled = proveedor ? 'disabled' : '';
        // Presentación
        const presentacion = producto.presentacion || '';
        // Etiqueta para precio presentación
        const etiquetaPresentacion = presentacion ? presentacion : 'presentación';
        // Fecha vencimiento
        const fechaVenc = producto.fechaVencimiento || '';
        const html = `
            <form id='formProductoCompra' style='text-align:left;'>
                <label>Nombre producto</label>
                <input type='text' class='form-control mb-2' value='${producto.nombre}' disabled>
                <label>Proveedor</label>
                <input type='text' id='proveedorInput' class='form-control mb-2' value='${proveedor}' ${proveedorDisabled} list='proveedoresList' autocomplete='off'>
                <datalist id='proveedoresList'></datalist>
                <div id='mensajeNuevoProveedor' style='color:#007bff;display:none;margin-top:0.5em;'>Nuevo proveedor, se registrará</div>
                <label>Tipo de compra</label>
                <select id='tipoCompraSelect' class='form-control mb-2'>
                    <option value='Contado'>Contado</option>
                    <option value='Credito'>Crédito</option>
                </select>
                                <div class="row mb-2">
                                    <div class="col-7">
                                        <label>Nombre presentación</label>
                                        <input type="text" id="nombrePresentacionInput" class="form-control" placeholder="Ej: Canasta, Caja, Bolsa" value="${producto.nombrePresentacion || ''}">
                                    </div>
                                    <div class="col-5">
                                        <label>Unidades</label>
                                        <input type="number" id="unidadesPresentacionInput" class="form-control" min="1" inputmode="numeric" pattern="[0-9]*" placeholder="Ej: 30" value="${producto.unidadesPresentacion || ''}">
                                    </div>
                                </div>
                <label>Precio ${etiquetaPresentacion}</label>
                <div class="input-group mb-2">
                    <span class="input-group-text">$</span>
                    <input type='number' id='precioPresentacionInput' class='form-control' min='0' inputmode="numeric" pattern="[0-9]*" value='${producto.precioPresentacion || ''}'>
                </div>
                <label>Cantidad</label>
                <input type='number' id='cantidadInput' class='form-control mb-2' min='1' inputmode="numeric" pattern="[0-9]*" value='${producto.cantidad || ''}'>
                <label>Precio compra c/u</label>
                <div class="input-group mb-2">
                    <span class="input-group-text">$</span>
                    <input type='text' id='precioCompraUnidadInput' class='form-control' min='0' value='' disabled>
                </div>
                <div class="row mb-2">
                    <div class="col-7">
                        <label>Precio venta</label>
                        <div class="input-group">
                            <span class="input-group-text">$</span>
                            <input type="number" id="precioVentaUnidadInput" class="form-control" min="0" inputmode="numeric" pattern="[0-9]*" value="${producto.precioVentaUnidad || ''}">
                
                        </div>
                    </div>
                    <div class="col-5">
                        <label>Ganancia (%)</label>
                        <input type="number" id="gananciaInput" class="form-control" value="" disabled>
                    </div>
                </div>
                <label>Fecha de vencimiento</label>
                <input type='date' id='fechaVencimientoInput' class='form-control mb-2' value='${fechaVenc}'>
                <div class='form-check mb-2'>
                    <input class='form-check-input' type='checkbox' id='noRequiereVencimientoCheck'>
                    <label class='form-check-label' for='noRequiereVencimientoCheck'>No requiere fecha de vencimiento</label>
                </div>
            </form>
        `;
        setTimeout(() => {
                    // Ocultar teclado numérico al perder foco en campos relevantes (solo móvil)
                    const camposNumericos = [
                        'unidadesPresentacionInput',
                        'precioPresentacionInput',
                        'cantidadInput',
                        'precioVentaUnidadInput'
                    ];
                    camposNumericos.forEach(id => {
                        const campo = document.getElementById(id);
                        if (campo) {
                            campo.addEventListener('blur', () => {
                                if (window.innerWidth <= 900) {
                                    campo.blur();
                                }
                            });
                        }
                    });
                }, 100);
        let proveedoresActual = [];
        async function consultarProveedoresFirebase(filtro) {
            try {
                const { getFirestore, collection } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
                const { wrappedGetDocs } = await import('./FirebaseWrapper.js');
                const { app } = await import('./Conexion.js');
                const db = getFirestore(app);
                const proveedoresRef = collection(db, 'proveedores');
                const snapshot = await wrappedGetDocs(proveedoresRef);
                const filtroLower = filtro.trim().toLowerCase();
                const proveedores = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (!filtroLower || doc.id.toLowerCase().includes(filtroLower)) {
                        proveedores.push({
                            id: doc.id,
                            nombre: doc.id,
                            ...data
                        });
                    }
                });
                return proveedores;
            } catch (e) {
                return [];
            }
        }
        await mostrarPersonalizado({
            title: 'Datos del producto',
            html,
            showCancelButton: true,
            confirmButtonText: 'Agregar',
            cancelButtonText: 'Cancelar',
            focusConfirm: false,
            didOpen: () => {
                // Lógica para check de vencimiento
                const noRequiereCheck = document.getElementById('noRequiereVencimientoCheck');
                const fechaVencInput = document.getElementById('fechaVencimientoInput');
                noRequiereCheck.onchange = () => {
                    fechaVencInput.disabled = noRequiereCheck.checked;
                };
                // Autocompletado y filtrado de proveedores
                const proveedorInput = document.getElementById('proveedorInput');
                const proveedoresList = document.getElementById('proveedoresList');
                const mensajeNuevoProveedor = document.getElementById('mensajeNuevoProveedor');
                proveedorInput.addEventListener('input', async () => {
                    const texto = proveedorInput.value.trim().toLowerCase();
                    proveedoresActual = await consultarProveedoresFirebase(texto);
                    proveedoresList.innerHTML = proveedoresActual.map(p => `<option value='${p.nombre}'>`).join("");
                    const existe = proveedoresActual.some(p => p.nombre.toLowerCase() === texto);
                    mensajeNuevoProveedor.style.display = (!existe && texto.length > 0) ? 'block' : 'none';
                });
                // Primer carga sin filtro
                consultarProveedoresFirebase('').then(proveedores => {
                    proveedoresActual = proveedores;
                    proveedoresList.innerHTML = proveedoresActual.map(p => `<option value='${p.nombre}'>`).join("");
                });

                // Lógica de cálculo automático de precio compra c/u y ganancia
                function calcularValores() {
                    const precioPresentacion = parseFloat(document.getElementById('precioPresentacionInput').value) || 0;
                    const cantidad = parseInt(document.getElementById('cantidadInput').value) || 1;
                    const unidadesPresentacion = parseInt(document.getElementById('unidadesPresentacionInput').value) || 1;
                    const precioVentaUnidad = parseFloat(document.getElementById('precioVentaUnidadInput').value) || 0;
                    // Precio compra c/u CORREGIDO
                    let precioCompraUnidad = 0;
                    const totalPresentacion = precioPresentacion * cantidad;
                    const totalUnidades = unidadesPresentacion * cantidad;
                    if (totalUnidades > 0) {
                        precioCompraUnidad = totalPresentacion / totalUnidades;
                    }
                    document.getElementById('precioCompraUnidadInput').value = precioCompraUnidad ? formatearCOP(precioCompraUnidad) : '';
                    // Ganancia
                    let ganancia = 0;
                    if (precioVentaUnidad > 0 && precioCompraUnidad > 0) {
                        ganancia = ((precioVentaUnidad - precioCompraUnidad) / precioVentaUnidad) * 100;
                    }
                    document.getElementById('gananciaInput').value = ganancia ? ganancia.toFixed(2) : '';
                }
                document.getElementById('precioPresentacionInput').addEventListener('input', calcularValores);
                document.getElementById('cantidadInput').addEventListener('input', calcularValores);
                document.getElementById('unidadesPresentacionInput').addEventListener('input', calcularValores);
                document.getElementById('precioVentaUnidadInput').addEventListener('input', calcularValores);
                // Inicializar valores al abrir
                calcularValores();
            }
        }).then(result => {
            if (!result.isConfirmed) return;
            // Obtener datos del formulario
            const nombre = producto.nombre || '';
            const proveedor = document.getElementById('proveedorInput')?.value || '';
            const presentacion = document.getElementById('nombrePresentacionInput')?.value || '';
            const unidades = document.getElementById('unidadesPresentacionInput')?.value || '';
            const precioPresentacion = document.getElementById('precioPresentacionInput')?.value || '';
            const cantidad = document.getElementById('cantidadInput')?.value || '';
            // Capturar el valor numérico real de precio compra c/u
            let precioCompraUnidad = document.getElementById('precioCompraUnidadInput')?.value || '';
            // Si el valor viene formateado, extraer el número decimal
            if (typeof precioCompraUnidad === 'string') {
                // Si el valor tiene separador de miles, quitarlo y convertir a float
                precioCompraUnidad = precioCompraUnidad.replace(/[^\d\.]/g, '');
            }
            // No redondear, conservar todos los decimales posibles
            precioCompraUnidad = parseFloat(precioCompraUnidad);
            if (isNaN(precioCompraUnidad)) precioCompraUnidad = 0;
            const precioVenta = document.getElementById('precioVentaUnidadInput')?.value || '';
            const ganancia = document.getElementById('gananciaInput')?.value || '';
            const fechaVencimiento = document.getElementById('fechaVencimientoInput')?.value || '';
            // Validación básica
            if (!nombre || !presentacion || !unidades || !precioPresentacion || !cantidad || !precioVenta) {
                alert('Completa todos los campos obligatorios.');
                return;
            }
            // Obtener tipo de compra
            const tipoCompra = document.getElementById('tipoCompraSelect')?.value || 'Contado';
            // Agregar al carrito interno usando el servicio
            agregarProductoAlCarrito({
                nombre,
                proveedor,
                presentacion,
                unidades,
                precioPresentacion,
                cantidad,
                tipoCompra,
                precioCompraUnidad,
                precioVenta,
                ganancia,
                fechaVencimiento
            });
            renderCarritoComprasInternas();
        });
    }

    // Mock: obtener inventario completo
    async function obtenerInventarioCompletoMock() {
        // Simulación de inventario
        return [
            { id: 'prod1', nombre: 'Canasta', proveedor: 'Bavaria', presentacion: '30', precioPresentacion: 30000, precioVentaUnidad: 1200, fechaVencimiento: '' },
            { id: 'prod2', nombre: 'Botella', proveedor: 'Postobon', presentacion: '24', precioPresentacion: 24000, precioVentaUnidad: 1500, fechaVencimiento: '' }
        ];
    }

    // Mock: obtener cantidades predeterminadas
    async function obtenerCantidadesPredeterminadasMock() {
    }
/**
 * Flujo de nueva compra (simplificado)
 */
async function iniciarNuevaCompra() {
    // Estado temporal de la compra
    const compra = {
        proveedor: null,
        productos: []
    };
    let productoEditando = null;

    // Paso 1: Selección de proveedor
    const proveedorSeleccionado = await pedirProveedor();
    if (!proveedorSeleccionado) {
        alert('Flujo de compra cancelado: no se seleccionó proveedor.');
        return;
    }
    compra.proveedor = proveedorSeleccionado.nombre || proveedorSeleccionado.id || proveedorSeleccionado;

    // Renderizar formulario de producto
    renderFormularioProducto(compra, proveedorSeleccionado);

    // Renderizar tabla de productos agregados
    renderTablaProductos(compra);

    // Botón siguiente solo visible si hay productos
    const btnSiguiente = document.getElementById('btnSiguienteCompra');
    btnSiguiente.classList.add('d-none');
    btnSiguiente.onclick = () => {
        // Aquí iría el paso de método de pago y guardado
        alert('Siguiente paso: método de pago (no implementado en este parche)');
    };
}

function renderFormularioProducto(compra, proveedor) {
    const cont = document.getElementById('comprasFormContainer');
    if (!cont) return;
    cont.innerHTML = `
        <div class="card p-3" style="max-width:500px;margin:auto;background:#fff;border:2px solid #007bff;box-shadow:0 2px 8px #007bff33;">
            <h4 class="mb-3" style="color:#007bff;">Agregar producto</h4>
            <div class="mb-2"><label>Proveedor</label>
                <input type="text" class="form-control" value="${proveedor.nombre || proveedor.id || proveedor}" disabled></div>
            <div class="mb-2"><label>Nombre producto</label>
                <input type="text" id="nombreProductoInput" class="form-control" placeholder="Buscar producto..." autocomplete="off"></div>
            <div class="mb-2"><label>Presentación habitual</label>
                <input type="text" id="presentacionInput" class="form-control" placeholder="Ej: caja, bolsa, pack, etc."></div>
            <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" id="porUnidadCheck">
                <label class="form-check-label" for="porUnidadCheck">¿Por unidad?</label>
            </div>
            <div class="mb-2"><label>Cantidad unidades</label>
                <input type="number" id="cantidadUnidadesInput" class="form-control" min="1" value="1"></div>
            <div class="mb-2"><label>Precio presentación</label>
                <input type="number" id="precioPresentacionInput" class="form-control" min="0" value="0"></div>
            <div class="mb-2"><label>Precio venta por unidad</label>
                <input type="number" id="precioVentaUnidadInput" class="form-control" min="0" value="0"></div>
            <div class="mb-2"><label>Cantidad presentaciones</label>
                <input type="number" id="cantidadPresentacionInput" class="form-control" min="1" value="1"></div>
            <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" id="noAplicaCheck">
                <label class="form-check-label" for="noAplicaCheck">No aplica fecha de vencimiento</label>
            </div>
            <div class="mb-2"><label>Fecha de vencimiento</label>
                <input type="date" id="fechaVencimientoInput" class="form-control">
            </div>
            <button id="btnAgregarProducto" class="btn btn-primary w-100">Agregar</button>
        </div>
    `;
    // Lógica de controles
    const porUnidadCheck = document.getElementById('porUnidadCheck');
    const cantidadUnidadesInput = document.getElementById('cantidadUnidadesInput');
    porUnidadCheck.onchange = () => {
        if (porUnidadCheck.checked) {
            cantidadUnidadesInput.value = 1;
            cantidadUnidadesInput.disabled = true;
        } else {
            cantidadUnidadesInput.disabled = false;
        }
    };
    const noAplicaCheck = document.getElementById('noAplicaCheck');
    const fechaVencimientoInput = document.getElementById('fechaVencimientoInput');
    noAplicaCheck.onchange = () => {
        fechaVencimientoInput.disabled = noAplicaCheck.checked;
    };
    // Agregar producto
    document.getElementById('btnAgregarProducto').onclick = () => {
        const nombre = document.getElementById('nombreProductoInput').value.trim();
        const presentacion = document.getElementById('presentacionInput').value.trim();
        const porUnidad = porUnidadCheck.checked;
        const cantidadUnidades = parseInt(cantidadUnidadesInput.value, 10) || 1;
        const precioPresentacion = parseFloat(document.getElementById('precioPresentacionInput').value) || 0;
        const precioVentaUnidad = parseFloat(document.getElementById('precioVentaUnidadInput').value) || 0;
        const cantidadPresentacion = parseInt(document.getElementById('cantidadPresentacionInput').value, 10) || 1;
        const fechaVencimiento = noAplicaCheck.checked ? 'No Aplica' : fechaVencimientoInput.value;
        if (!nombre || !presentacion || precioPresentacion <= 0 || precioVentaUnidad <= 0) {
            alert('Completa todos los campos obligatorios.');
            return;
        }
        // Calcular precio compra c/u con decimales
        let precioCompraUnidad = 0;
        const totalPresentacion = precioPresentacion * cantidadPresentacion;
        const totalUnidades = cantidadUnidades * cantidadPresentacion;
        if (totalUnidades > 0) {
            precioCompraUnidad = totalPresentacion / totalUnidades;
        }
        // Agregar a la lista, sin duplicidad ni contaminación
        compra.productos.push({
            proveedor: proveedor.nombre || proveedor.id || proveedor,
            nombre,
            presentacion,
            porUnidad,
            cantidadUnidades,
            precioPresentacion,
            precioVentaUnidad,
            cantidadPresentacion,
            precioCompraUnidad: Number(precioCompraUnidad.toFixed(3)),
            fechaVencimiento
        });
        renderTablaProductos(compra);
        // Limpiar formulario
        renderFormularioProducto(compra, proveedor);
    };
}

function renderTablaProductos(compra) {
    const cont = document.getElementById('productosAgregadosContainer');
    if (!cont) return;
    if (!compra.productos || compra.productos.length === 0) {
        cont.innerHTML = '<div class="text-muted">No hay productos agregados.</div>';
        document.getElementById('btnSiguienteCompra').classList.add('d-none');
        return;
    }
    let html = '';
    compra.productos.forEach((p, idx) => {
        const costoUnidad = p.precioPresentacion / (p.porUnidad ? 1 : p.cantidadUnidades);
        const unidades = (p.porUnidad ? 1 : p.cantidadUnidades) * p.cantidadPresentacion;
        html += `
            <div class="card d-inline-block m-2 p-2" style="min-width:260px;max-width:300px;background:#f8f9fa;border:2px solid #007bff;box-shadow:0 2px 8px #007bff33;vertical-align:top;">
                <div class="fw-bold mb-1" style="color:#007bff;">${p.proveedor}</div>
                <div><b>Producto:</b> ${p.nombre}</div>
                <div><b>Costo por unidad:</b> ${formatearPrecio(costoUnidad)}</div>
                <div><b>Unidades:</b> ${unidades}</div>
                <div><b>Precio venta:</b> ${formatearPrecio(p.precioVentaUnidad)}</div>
                <div><b>Fecha vencimiento:</b> ${p.fechaVencimiento}</div>
                <div class="mt-2">
                    <button class="btn btn-warning btn-sm" onclick="window.editarProductoCompra(${idx})">Editar</button>
                    <button class="btn btn-danger btn-sm" onclick="window.eliminarProductoCompra(${idx})">Eliminar</button>
                </div>
            </div>
        `;
    });
    cont.innerHTML = html;
    document.getElementById('btnSiguienteCompra').classList.remove('d-none');
    // Exponer funciones globales para edición/eliminación
    window.editarProductoCompra = idx => {
        // Cargar datos en el formulario para edición
        const p = compra.productos[idx];
        renderFormularioProductoEdicion(compra, p, idx);
    };
    window.eliminarProductoCompra = idx => {
        compra.productos.splice(idx, 1);
        renderTablaProductos(compra);
    };
}

function renderFormularioProductoEdicion(compra, producto, idx) {
    const cont = document.getElementById('comprasFormContainer');
    if (!cont) return;
    cont.innerHTML = `
        <div class="card p-3" style="max-width:500px;margin:auto;background:#fff;border:2px solid #007bff;box-shadow:0 2px 8px #007bff33;">
            <h4 class="mb-3" style="color:#007bff;">Editar producto</h4>
            <div class="mb-2"><label>Proveedor</label>
                <input type="text" class="form-control" value="${producto.proveedor}" disabled></div>
            <div class="mb-2"><label>Nombre producto</label>
                <input type="text" class="form-control" value="${producto.nombre}" disabled></div>
            <div class="mb-2"><label>Presentación habitual</label>
                <input type="text" id="presentacionInput" class="form-control" value="${producto.presentacion}"></div>
            <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" id="porUnidadCheck" ${producto.porUnidad ? 'checked' : ''}>
                <label class="form-check-label" for="porUnidadCheck">¿Por unidad?</label>
            </div>
            <div class="mb-2"><label>Cantidad unidades</label>
                <input type="number" id="cantidadUnidadesInput" class="form-control" min="1" value="${producto.cantidadUnidades}"></div>
            <div class="mb-2"><label>Precio presentación</label>
                <input type="number" id="precioPresentacionInput" class="form-control" min="0" value="${producto.precioPresentacion}"></div>
            <div class="mb-2"><label>Precio venta por unidad</label>
                <input type="number" id="precioVentaUnidadInput" class="form-control" min="0" value="${producto.precioVentaUnidad}"></div>
            <div class="mb-2"><label>Cantidad presentaciones</label>
                <input type="number" id="cantidadPresentacionInput" class="form-control" min="1" value="${producto.cantidadPresentacion}"></div>
            <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" id="noAplicaCheck" ${producto.fechaVencimiento === 'No Aplica' ? 'checked' : ''}>
                <label class="form-check-label" for="noAplicaCheck">No aplica fecha de vencimiento</label>
            </div>
            <div class="mb-2"><label>Fecha de vencimiento</label>
                <input type="date" id="fechaVencimientoInput" class="form-control" value="${producto.fechaVencimiento !== 'No Aplica' ? producto.fechaVencimiento : ''}">
            </div>
            <button id="btnEditarProducto" class="btn btn-warning w-100">Editar</button>
        </div>
    `;
    // Lógica de controles
    const porUnidadCheck = document.getElementById('porUnidadCheck');
    const cantidadUnidadesInput = document.getElementById('cantidadUnidadesInput');
    porUnidadCheck.onchange = () => {
        if (porUnidadCheck.checked) {
            cantidadUnidadesInput.value = 1;
            cantidadUnidadesInput.disabled = true;
        } else {
            cantidadUnidadesInput.disabled = false;
        }
    };
    const noAplicaCheck = document.getElementById('noAplicaCheck');
    const fechaVencimientoInput = document.getElementById('fechaVencimientoInput');
    noAplicaCheck.onchange = () => {
        fechaVencimientoInput.disabled = noAplicaCheck.checked;
    };
    // Editar producto
    document.getElementById('btnEditarProducto').onclick = () => {
        const presentacion = document.getElementById('presentacionInput').value.trim();
        const porUnidad = porUnidadCheck.checked;
        const cantidadUnidades = parseInt(cantidadUnidadesInput.value, 10) || 1;
        const precioPresentacion = parseFloat(document.getElementById('precioPresentacionInput').value) || 0;
        const precioVentaUnidad = parseFloat(document.getElementById('precioVentaUnidadInput').value) || 0;
        const cantidadPresentacion = parseInt(document.getElementById('cantidadPresentacionInput').value, 10) || 1;
        const fechaVencimiento = noAplicaCheck.checked ? 'No Aplica' : fechaVencimientoInput.value;
        if (!presentacion || precioPresentacion <= 0 || precioVentaUnidad <= 0) {
            alert('Completa todos los campos obligatorios.');
            return;
        }
        // Actualizar producto
        compra.productos[idx] = {
            ...producto,
            presentacion,
            porUnidad,
            cantidadUnidades,
            precioPresentacion,
            precioVentaUnidad,
            cantidadPresentacion,
            fechaVencimiento
        };
        renderTablaProductos(compra);
        renderFormularioProducto(compra, { nombre: producto.proveedor });
    };
}

/**
 * Pide proveedor: permite buscar por nombre, seleccionar o crear uno nuevo.
 * Retorna objeto proveedor o null si el usuario cancela.
 */
async function pedirProveedor() {
    try {
        const termino = prompt('Buscar proveedor por nombre (dejar vacío para crear nuevo):');
        if (termino === null) return null; // cancelado

        // Buscar coincidencias
        const resultados = await buscarProveedores(termino || '');
        if (resultados && resultados.length > 0) {
            // Mostrar lista simple y pedir índice
            const opciones = resultados.map((r, i) => `${i + 1}. ${r.nombre || r.id}`).join('\n');
            const sel = prompt('Proveedores encontrados:\n' + opciones + '\nEscriba el número para seleccionar, o C para crear nuevo');
            if (sel === null) return null;
            if (sel.toLowerCase() === 'c') {
                return await crearProveedorInteractivo(termino);
            }
            const idx = parseInt(sel, 10) - 1;
            if (!isNaN(idx) && resultados[idx]) return resultados[idx];
        }

        // Si no hay resultados o el usuario decidió crear nuevo
        return await crearProveedorInteractivo(termino);
    } catch (error) {
        console.error('Error pedirProveedor:', error);
        return null;
    }
}

async function crearProveedorInteractivo(nombreInicial = '') {
    const nombre = prompt('Nombre del proveedor:', nombreInicial || '');
    if (nombre === null || !nombre.trim()) return null;
    const representante = prompt('Nombre del representante (opcional):', '');
    if (representante === null) return null; // abortar
    const telefono = prompt('Teléfono del representante (opcional):', '');
    if (telefono === null) return null; // abortar

    const datos = { nombre: nombre.trim(), representante: representante.trim() || null, telefono: telefono.trim() || null };
    try {
        await guardarProveedor(nombre.trim(), datos);
        return { id: nombre.trim(), ...datos };
    } catch (error) {
        console.error('Error creando proveedor:', error);
        alert('No se pudo guardar proveedor. Intente de nuevo.');
        return null;
    }
}

/**
 * Formatea precio
 */
function formatearPrecio(valor) {
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        minimumFractionDigits: 0
    }).format(valor);
}
