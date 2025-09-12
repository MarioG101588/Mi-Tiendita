import { formatearPrecio } from './FormateoPrecios.js';

// Carrito global (se recomienda manejarlo como un estado en un objeto para mayor control)
window.carrito = {};

/**
 * Agrega un producto al carrito o aumenta su cantidad.
 * @param {string} id - ID del producto.
 * @param {number} precioVenta - Precio de venta del producto.
 * @param {number} cantidad - Cantidad a agregar (opcional, por defecto 1).
 */
export function agregarAlCarrito(id, precioVenta, cantidad = 1) {
    if (window.carrito[id]) {
        window.carrito[id].cantidad += cantidad;
        window.carrito[id].total = window.carrito[id].cantidad * precioVenta;
    } else {
        window.carrito[id] = {
            nombre: id,
            cantidad: cantidad,
            precioVenta: precioVenta,
            total: precioVenta * cantidad
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
        <!-- Header del carrito con icono -->
        <div class="carrito-header">
            <img src="./pngs/CarritoC.png" alt="Carrito de Compras" class="carrito-icon" />
            <h4 class="carrito-titulo">Carrito de Compras</h4>
        </div>
        
        <div class="table-responsive carrito-table-container">
            <table class="table table-striped table-bordered inventario-fija">
                <thead>
                    <tr>
                        <th>PRODUCTO</th>
                        <th>CANTIDAD</th>
                        <th>TOTAL</th>
                        <th>ACCIONES</th>
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
            <tr class="inventario-row-clickable">
                <td>${window.carrito[id].nombre}</td>
                <td class="text-center">
                    <div class="cantidad-controls">
                        <button class="btn-cantidad btn-menos" onclick="window.disminuirCantidad('${id}')">-</button>
                        <span class="cantidad-display">${window.carrito[id].cantidad}</span>
                        <button class="btn-cantidad btn-mas" onclick="window.aumentarCantidad('${id}')">+</button>
                    </div>
                </td>
                <td class="text-end">${formatearPrecio(window.carrito[id].total)}</td>
                <td class="text-center">
                    <button class="btn-quitar" onclick="window.quitarDelCarrito('${id}')">Quitar</button>
                </td>
            </tr>
        `;
    }

    html += `
            </tbody>
        </table>
        </div>
        
        <div class="carrito-footer">
            <div class="carrito-total">
                <span class="total-label">Total General:</span>
                <span class="total-amount">${formatearPrecio(totalGeneral)}</span>
            </div>
            <div class="carrito-actions">
                <button class="btn-realizar-venta" onclick="window.realizarVenta()">
                    Realizar Venta
                </button>
            </div>
        </div>
        </div>
    `;

    divCarrito.innerHTML = hayItems ? html : "No hay productos seleccionados.";
}
