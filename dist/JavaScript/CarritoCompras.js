// JavaScript/carrito.js
// Este archivo maneja toda la lógica del carrito de compras, incluyendo la adición, eliminación y renderización de productos.
// Carrito global (se recomienda manejarlo como un estado en un objeto para mayor control)
window.carrito = {};

/**
 * Agrega un producto al carrito o aumenta su cantidad.
 * @param {string} id - ID del producto.
 * @param {number} precioVenta - Precio de venta del producto.
 */
export function agregarAlCarrito(id, precioVenta) {
    if (window.carrito[id]) {
        window.carrito[id].cantidad += 1;
        window.carrito[id].total = window.carrito[id].cantidad * precioVenta;
    } else {
        window.carrito[id] = {
            nombre: id,
            cantidad: 1,
            precioVenta: precioVenta,
            total: precioVenta
        };
    }
    renderCarrito();
}

/**
 * Aumenta la cantidad de un producto en el carrito.
 * @param {string} id - ID del producto.
 */
export function aumentarCantidad(id) {
    if (window.carrito[id]) {
        window.carrito[id].cantidad += 1;
        window.carrito[id].total = window.carrito[id].cantidad * window.carrito[id].precioVenta;
        renderCarrito();
    }
}

/**
 * Disminuye la cantidad de un producto en el carrito.
 * Si la cantidad llega a 0, lo elimina.
 * @param {string} id - ID del producto.
 */
export function disminuirCantidad(id) {
    if (window.carrito[id]) {
        window.carrito[id].cantidad -= 1;
        if (window.carrito[id].cantidad <= 0) {
            delete window.carrito[id];
        } else {
            window.carrito[id].total = window.carrito[id].cantidad * window.carrito[id].precioVenta;
        }
        renderCarrito();
    }
}

/**
 * Quita un producto del carrito.
 * @param {string} id - ID del producto.
 */
export function quitarDelCarrito(id) {
    if (window.carrito[id]) {
        delete window.carrito[id];
        renderCarrito();
    }
}

/**
 * Renderiza la tabla del carrito de compras en la interfaz.
 */
export function renderCarrito() {
    const divCarrito = document.getElementById('carritoVenta');
    if (!divCarrito) return;

    let html = `
        <table class="table table-sm table-bordered">
            <thead>
                <tr>
                    <th>Producto</th>
                    <th>Cantidad</th>
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
        totalGeneral += window.carrito[id].total;
        html += `
            <tr>
                <td>${window.carrito[id].nombre}</td>
                <td>
                    ${window.carrito[id].cantidad}
                    <button class="btn btn-sm btn-outline-secondary" onclick="window.disminuirCantidad('${id}')">-</button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="window.aumentarCantidad('${id}')">+</button>
                </td>
                <td>${window.carrito[id].total}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="window.quitarDelCarrito('${id}')">Quitar</button>
                </td>
            </tr>
        `;
    }

    html += `
            </tbody>
        </table>
        <div style="text-align:right; font-weight:bold;">
            Total general: $${totalGeneral}
        </div>
        <div style="text-align:right; margin-top:10px;">
            <button class="btn btn-success" onclick="window.realizarVenta()">Realizar venta</button>
        </div>
    `;

    divCarrito.innerHTML = hayItems ? html : "No hay productos seleccionados.";
}