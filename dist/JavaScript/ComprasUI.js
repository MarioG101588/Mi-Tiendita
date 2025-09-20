// ComprasUI.js
import { mostrarPersonalizado } from "./SweetAlertManager.js";
// Se importan todas las funciones necesarias del servicio, incluyendo la nueva
import {
    agregarProductoAlCarrito,
    obtenerCarritoCompras,
    actualizarProductoEnCarrito,
    eliminarProductoDelCarrito,
    limpiarCarritoCompras,
    procesarYGuardarCompra, // <-- Nueva función importada
    buscarProveedores,     // <-- Se mantienen las importaciones originales
    guardarProveedor
} from "./ComprasService.js";
import { formatearPrecio as formatearCOP } from "./FormateoPrecios.js";


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
        let precioCompraUnidad = '';
        let valorCompraUnidad =
            0;
        if (typeof p.precioCompraUnidad === 'number') {
            valorCompraUnidad = p.precioCompraUnidad;
        } else if (typeof p.precioCompraUnidad === 'string' && p.precioCompraUnidad.trim() !== '') {
            valorCompraUnidad = parseFloat(p.precioCompraUnidad.replace(/[^\d\.]/g, ''));
        }
        precioCompraUnidad = `$ ${valorCompraUnidad.toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
        const precioVenta = p.precioVenta ? formatearCOP(p.precioVenta)
            : '';
        const totalCompraFormateado = formatearCOP(totalCompra);
        const ganancia = p.ganancia || '';
        const fechaVencimiento = p.fechaVencimiento ? p.fechaVencimiento : 'No se estableció';

        let tipoCompraDisplay = p.tipoCompra ? p.tipoCompra : 'No definido';
        if (p.tipoCompra === 'Credito' && p.diasCredito) {
            tipoCompraDisplay += ` (${p.diasCredito} días)`;
        }

        html += `
            <div class="card d-inline-block m-2 p-2" style="min-width:260px;max-width:300px;background:#f8f9fa;border:2px solid #007bff;box-shadow:0 2px 8px #007bff33;vertical-align:top;">
                <div><b>Producto:</b> ${p.nombre}</div>
                <div><b>Proveedor:</b> ${p.proveedor}</div>
                <div><b>Cantidad:</b> ${cantidadTotal}</div>
                <div><b>Tipo de compra:</b> ${tipoCompraDisplay}</div>
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
    const totalYBoton = `<div class="mt-3 fw-bold" style="font-size:1.1em;color:#007bff;position:sticky;bottom:0;left:0;z-index:10;background:#fff;padding:8px 0;">Total de la compra: ${formatearCOP(totalGeneral)}</div>
    <button class="btn btn-success w-100 mt-2" style="position:sticky;bottom:0;left:0;z-index:10;"
    onclick="window.realizarCompraCarrito()">Realizar compra</button>`;
    cont.innerHTML = `<div style="overflow-x:auto;white-space:nowrap;">${html}</div>${totalYBoton}`;
}

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

async function mostrarModalSeleccionProducto() {
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
        <input id='inputProducto' class='swal2-input' style='width:100%;margin-bottom:1em;'
        list='productosList' autocomplete='off'>
        <datalist id='productosList'></datalist>
        <div id='mensajeNuevoProducto' style='color:#007bff;display:none;margin-top:0.5em;'>Nuevo producto, se registrará</div>
    `;
    let inventarioActual = [];
    async function consultarInventarioFirebase(filtro) {
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
            mostrarModalFormularioProducto({ nombre: nombreIngresado });
        }
    });
}

async function mostrarModalFormularioProducto(producto, editIndex = null) {
    const isEditing = editIndex !== null;
    const modalTitle = isEditing ? 'Editar producto' : 'Datos del producto';
    const confirmButtonText = isEditing ? 'Aplicar cambios' : 'Agregar';
    const proveedor = producto.proveedor || '';
    const proveedorDisabled = isEditing ? '' : (producto.proveedor ? 'disabled' : '');
    const etiquetaPresentacion = producto.presentacion ? producto.presentacion : 'presentación';
    const fechaVenc = producto.fechaVencimiento || '';
    const html = `
        <form id='formProductoCompra' style='text-align:left;'>
            <label>Nombre producto</label>
            <input type='text' class='form-control mb-2' value='${producto.nombre}' disabled>
            <label>Proveedor</label>
            <input type='text' id='proveedorInput' class='form-control mb-2' value='${proveedor}' ${proveedorDisabled} list='proveedoresList' autocomplete='off'>
            <datalist id='proveedoresList'></datalist>
            <div id='mensajeNuevoProveedor' style='color:#007bff;display:none;margin-top:0.5em;'>Nuevo proveedor, se registrará</div>
            
            <div class="row mb-2">
                <div class="col">
                    <label>Tipo de compra</label>
                    <select id='tipoCompraSelect' class='form-control'>
                        <option value='Contado'>Contado</option>
                        <option value='Credito'>Crédito</option>
                    </select>
                </div>
                <div class="col">
                    <label>Pagar en # de días</label>
                    <input type="number" id="diasCreditoInput" class="form-control" min="1" disabled placeholder="Solo para crédito" value="${producto.diasCredito || ''}">
                </div>
            </div>
            
            <div class="row mb-2">
                <div class="col-7">
                    <label>Nombre presentación</label>
                    <input type="text" id="nombrePresentacionInput" class="form-control" placeholder="Ej: Canasta" value="${producto.presentacion || ''}">
                </div>
                <div class="col-5">
                    <label>Unidades</label>
                    <input type="number" id="unidadesPresentacionInput" class="form-control" min="1" placeholder="Ej: 30" value="${producto.unidades || ''}">
                </div>
            </div>
            <label>Precio ${etiquetaPresentacion}</label>
            <div class="input-group mb-2">
                <span class="input-group-text">$</span>
                <input type='number' id='precioPresentacionInput' class='form-control' min='0' value='${producto.precioPresentacion || ''}'>
            </div>
            <label>Cantidad</label>
            <input type='number' id='cantidadInput' class='form-control mb-2' min='1' value='${producto.cantidad || ''}'>
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
                        <input type="number" id="precioVentaUnidadInput" class="form-control" min="0" value="${producto.precioVenta || ''}">
                    </div>
                </div>
                <div class="col-5">
                    <label>Ganancia (%)</label>
                    <input type="number" id="gananciaInput" class="form-control" value="${producto.ganancia || ''}" disabled>
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
                    proveedores.push({ id: doc.id, nombre: doc.id, ...data });
                }
            });
            return proveedores;
        } catch (e) {
            return [];
        }
    }
    await mostrarPersonalizado({
        title: modalTitle,
        html,
        showCancelButton: true,
        confirmButtonText: confirmButtonText,
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        didOpen: () => {
            const tipoCompraSelect = document.getElementById('tipoCompraSelect');
            const diasCreditoInput = document.getElementById('diasCreditoInput');

            if (isEditing && producto.tipoCompra) {
                tipoCompraSelect.value = producto.tipoCompra;
                if (producto.tipoCompra === 'Credito') {
                    diasCreditoInput.disabled = false;
                }
            }

            tipoCompraSelect.addEventListener('change', () => {
                if (tipoCompraSelect.value === 'Credito') {
                    diasCreditoInput.disabled = false;
                    diasCreditoInput.placeholder = 'Ej: 30';
                } else {
                    diasCreditoInput.disabled = true;
                    diasCreditoInput.value = '';
                    diasCreditoInput.placeholder = 'Solo para crédito';
                }
            });
            const noRequiereCheck = document.getElementById('noRequiereVencimientoCheck');
            const fechaVencInput = document.getElementById('fechaVencimientoInput');
            noRequiereCheck.onchange = () => {
                fechaVencInput.disabled = noRequiereCheck.checked;
            };

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
            consultarProveedoresFirebase('').then(proveedores => {
                proveedoresActual = proveedores;
                proveedoresList.innerHTML = proveedoresActual.map(p => `<option value='${p.nombre}'>`).join("");
            });
            function calcularValores() {
                const precioPresentacion = parseFloat(document.getElementById('precioPresentacionInput').value) ||
                    0;
                const cantidad = parseInt(document.getElementById('cantidadInput').value) || 1;
                const unidadesPresentacion = parseInt(document.getElementById('unidadesPresentacionInput').value) || 1;
                const precioVentaUnidad = parseFloat(document.getElementById('precioVentaUnidadInput').value) || 0;
                let precioCompraUnidad = 0;
                const totalPresentacion = precioPresentacion * cantidad;
                const totalUnidades = unidadesPresentacion * cantidad;
                if (totalUnidades > 0) {
                    precioCompraUnidad = totalPresentacion / totalUnidades;
                }
                document.getElementById('precioCompraUnidadInput').value = precioCompraUnidad ?
                    formatearCOP(precioCompraUnidad) : '';
                let ganancia = 0;
                if (precioVentaUnidad > 0 && precioCompraUnidad > 0) {
                    ganancia = ((precioVentaUnidad - precioCompraUnidad) / precioVentaUnidad) * 100;
                }
                document.getElementById('gananciaInput').value = ganancia ?
                    ganancia.toFixed(2) : '';
            }
            ['precioPresentacionInput', 'cantidadInput', 'unidadesPresentacionInput', 'precioVentaUnidadInput'].forEach(id => {
                document.getElementById(id).addEventListener('input', calcularValores);
            });
            calcularValores();
        }
    }).then(result => {
        if (!result.isConfirmed) return;

        const datosFormulario = {
            nombre: producto.nombre || '',
            proveedor: document.getElementById('proveedorInput')?.value || '',
            presentacion: document.getElementById('nombrePresentacionInput')?.value || '',
            unidades: document.getElementById('unidadesPresentacionInput')?.value || '',
            precioPresentacion: document.getElementById('precioPresentacionInput')?.value || '',
            cantidad: document.getElementById('cantidadInput')?.value || '',
            precioVenta: document.getElementById('precioVentaUnidadInput')?.value || '',
            ganancia: document.getElementById('gananciaInput')?.value || '',
            fechaVencimiento: document.getElementById('fechaVencimientoInput')?.value || '',
            tipoCompra: document.getElementById('tipoCompraSelect')?.value || 'Contado',
            diasCredito: document.getElementById('diasCreditoInput')?.value || ''
        };

        let precioCompraUnidad = document.getElementById('precioCompraUnidadInput')?.value || '';
        if (typeof precioCompraUnidad === 'string') {
            precioCompraUnidad = precioCompraUnidad.replace(/[^\d\.]/g, '');
        }
        datosFormulario.precioCompraUnidad = parseFloat(precioCompraUnidad) || 0;
        if (!datosFormulario.nombre || !datosFormulario.presentacion || !datosFormulario.unidades || !datosFormulario.precioPresentacion || !datosFormulario.cantidad || !datosFormulario.precioVenta) {
            alert('Completa todos los campos obligatorios.');
            return;
        }

        if (isEditing) {
            actualizarProductoEnCarrito(editIndex, datosFormulario);
        } else {
            agregarProductoAlCarrito(datosFormulario);
        }

        renderCarritoComprasInternas();
    });
}

async function obtenerInventarioCompletoMock() {
    return [
        { id: 'prod1', nombre: 'Canasta', proveedor: 'Bavaria', presentacion: '30', precioPresentacion: 30000, precioVentaUnidad: 1200, fechaVencimiento: '' },
        { id: 'prod2', nombre: 'Botella', proveedor: 'Postobon', presentacion: '24', precioPresentacion: 24000, precioVentaUnidad: 1500, fechaVencimiento: '' }
    ];
}

async function obtenerCantidadesPredeterminadasMock() {}

async function pedirProveedor() {
    try {
        const termino = prompt('Buscar proveedor por nombre (dejar vacío para crear nuevo):');
        if (termino === null) return null;

        const resultados = await buscarProveedores(termino || '');
        if (resultados && resultados.length > 0) {
            const opciones = resultados.map((r, i) => `${i + 1}. ${r.nombre || r.id}`).join('\n');
            const sel = prompt('Proveedores encontrados:\n' + opciones + '\nEscriba el número para seleccionar, o C para crear nuevo');
            if (sel === null) return null;
            if (sel.toLowerCase() === 'c') {
                return await crearProveedorInteractivo(termino);
            }
            const idx = parseInt(sel, 10) - 1;
            if (!isNaN(idx) && resultados[idx]) return resultados[idx];
        }

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
    if (representante === null) return null;
    const telefono = prompt('Teléfono del representante (opcional):', '');
    if (telefono === null) return null;
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

function formatearPrecio(valor) {
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        minimumFractionDigits: 0
    }).format(valor);
}

// --- FUNCIONES GLOBALES PARA BOTONES ---

window.editarProductoCarrito = (idx) => {
    const producto = obtenerCarritoCompras()[idx];
    if (producto) {
        mostrarModalFormularioProducto(producto, idx);
    }
};

window.eliminarProductoCarrito = (idx) => {
    eliminarProductoDelCarrito(idx);
    renderCarritoComprasInternas();
};

// --- MODIFICACIÓN DEL BOTÓN "REALIZAR COMPRA" ---
window.realizarCompraCarrito = async () => {
    const productosEnCarrito = obtenerCarritoCompras();
    if (productosEnCarrito.length === 0) {
        mostrarPersonalizado({
            title: 'Carrito vacío',
            text: 'Agrega productos antes de realizar la compra.',
            icon: 'warning'
        });
        return;
    }

    // Mensaje de confirmación
    const confirmacion = await mostrarPersonalizado({
        title: '¿Confirmar compra?',
        text: `Se procesarán ${productosEnCarrito.length} producto(s). Esta acción actualizará el inventario y guardará los registros.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, realizar compra',
        cancelButtonText: 'Cancelar'
    });

    if (!confirmacion.isConfirmed) {
        return;
    }

    // Mensaje de "Procesando"
    mostrarPersonalizado({
        title: 'Procesando compra...',
        text: 'Por favor, espera un momento.',
        allowOutsideClick: false,
        didOpen: () => {
            mostrarPersonalizado.showLoading();
        }
    });

    try {
        await procesarYGuardarCompra();
        
        limpiarCarritoCompras();
        renderCarritoComprasInternas();

        await mostrarPersonalizado({
            title: '¡Compra Exitosa!',
            text: 'El inventario ha sido actualizado y la compra ha sido registrada.',
            icon: 'success'
        });

    } catch (error) {
        console.error("Error al realizar la compra:", error);
        await mostrarPersonalizado({
            title: 'Error',
            text: `No se pudo completar la compra. ${error.message}`,
            icon: 'error'
        });
    }
};