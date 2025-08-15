// JavaScript/carrito.js
// Manejo del carrito de compras: agregar, aumentar/disminuir, quitar y renderizar.
// Deja disponible un objeto global por simplicidad en esta app.
window.carrito = {};

/**
 * Agrega un producto al carrito o aumenta su cantidad.
 * @param {string} id - ID/nombre del producto.
 * @param {number} precioVenta - Precio unitario del producto.
 */
export function agregarAlCarrito(id, precioVenta) {
    if (window.carrito[id]) {
        window.carrito[id].cantidad += 1;
        window.carrito[id].total = window.carrito[id].cantidad * window.carrito[id].precioVenta;
    } else {
        window.carrito[id] = {
            nombre: id,
            cantidad: 1,
            precioVenta: Number(precioVenta) || 0,
            total: Number(precioVenta) || 0
        };
    }
    renderCarrito();
}

/**
 * Aumenta la cantidad de un producto.
 * @param {string} id
 */
export function aumentarCantidad(id) {
    if (!window.carrito[id]) return;
    window.carrito[id].cantidad += 1;
    window.carrito[id].total = window.carrito[id].cantidad * window.carrito[id].precioVenta;
    renderCarrito();
}

/**
 * Disminuye la cantidad de un producto. Si llega a 0, lo elimina.
 * @param {string} id
 */
export function disminuirCantidad(id) {
    if (!window.carrito[id]) return;
    window.carrito[id].cantidad -= 1;
    if (window.carrito[id].cantidad <= 0) {
        delete window.carrito[id];
    } else {
        window.carrito[id].total = window.carrito[id].cantidad * window.carrito[id].precioVenta;
    }
    renderCarrito();
}

/**
 * Quita un producto del carrito.
 * @param {string} id
 */
export function quitarDelCarrito(id) {
    if (!window.carrito[id]) return;
    delete window.carrito[id];
    renderCarrito();
}

/** Formato de moneda COP */
function formatoCOP(valor) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(valor) || 0);
}

/**
 * Renderiza la tabla del carrito en #carritoVenta con los botones de cantidad
 * alineados horizontalmente ( - [n] + ).
 */
export function renderCarrito() {
    const divCarrito = document.getElementById('carritoVenta');
    if (!divCarrito) return;

    let html = `
        <table class="table table-sm table-bordered">
            <thead>
                <tr>
                    <th>Producto</th>
                        <th class="col-cantidad">Cantidad</th>
                    <th>Precio Total</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
    `;

    let hayItems = false;
    let totalGeneral = 0;

    for (const id in window.carrito) {
        hayItems = true;
        const item = window.carrito[id];
        totalGeneral += item.total;

        html += `
            <tr>
                <td>${item.nombre}</td>
<td class="col-cantidad">
    <div class="cantidad-container">
        <button class="btn-cantidad" aria-label="Disminuir" onclick="window.disminuirCantidad('${id}')">-</button>
        <span class="cantidad-num" aria-live="polite">${item.cantidad}</span>
        <button class="btn-cantidad" aria-label="Aumentar" onclick="window.aumentarCantidad('${id}')">+</button>
    </div>
</td>
                <td>${formatoCOP(item.total)}</td>
                <td>
                    <button class="btn-cantidad btn-quitar" onclick="window.quitarDelCarrito('${id}')">Quitar</button>
                </td>
            </tr>
        `;
    }

    html += `
            </tbody>
        </table>
        <div style="text-align:right; font-weight:bold;">
            Total general: ${formatoCOP(totalGeneral)}
        </div>
        <div class="botones" style="margin-top:10px;">
            <button class="btn btn-success" onclick="window.realizarVenta()">Realizar venta</button>
        </div>
    `;

    divCarrito.innerHTML = hayItems ? html : "No hay productos seleccionados.";
}

/* Exponer también en window por si el HTML los usa directamente antes de que main.js los asigne */
window.agregarAlCarrito = agregarAlCarrito;
window.aumentarCantidad = aumentarCantidad;
window.disminuirCantidad = disminuirCantidad;
window.quitarDelCarrito = quitarDelCarrito;
window.renderCarrito = renderCarrito;
