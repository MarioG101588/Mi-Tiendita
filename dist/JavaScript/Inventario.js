//JavaScript/inventario.js
//Este archivo contiene la lógica para cargar, filtrar y mostrar el inventario de productos.
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { app } from "./Conexion.js";
import { agregarAlCarrito } from "./CarritoCompras.js";
import { mostrarInputNumerico } from "./SweetAlertManager.js";

const db = getFirestore(app);

/**
 * Carga y muestra el inventario de productos en la interfaz.
 * @param {string} filtro - Filtro de búsqueda para los productos.
 */

export async function cargarInventario(filtro = "") {
    const resultadoDiv = document.getElementById("resultadoBusqueda1");
    if (!resultadoDiv) {
        console.error('🔴 No se encontró el elemento resultadoBusqueda1');
        return;
    }

    // Mostrar u ocultar inventario según el filtro
    if (!filtro.trim()) {
        resultadoDiv.classList.add("js-hidden", "d-none");
        resultadoDiv.classList.remove("js-visible", "d-block");
        resultadoDiv.innerHTML = "";
        return;
    } else {
        resultadoDiv.classList.remove("js-hidden", "d-none");
        resultadoDiv.classList.add("js-visible", "d-block");
    }
    resultadoDiv.innerHTML = "Cargando...";

    try {
        // console.log('🔵 Cargando inventario con filtro:', filtro);
        const inventarioRef = collection(db, "inventario");
        const snapshot = await getDocs(inventarioRef);
        // console.log('✅ Documentos obtenidos:', snapshot.size);

        let html = `
            <!-- Cabecera animada del inventario -->
            <div class="inventario-header">
                <img src="./pngs/busqueda.gif" alt="Búsqueda de Inventario" class="inventario-gif" />
                <h5 class="inventario-titulo">📦 Inventario de Productos</h5>
            </div>
            
            <div class="table-responsive inventario-table-container">
            <table class="table table-striped table-bordered inventario-fija">
                <thead>
                    <tr>
                        <th>PRODUCTOS</th>
                        <th>PRECIO</th>
                        <th>CANTIDAD</th>
                        <th>VENCIMIENTO</th>
                    </tr>
                </thead>
                <tbody>
        `;

        let hayResultados = false;
        const filtroLower = filtro.trim().toLowerCase();

        snapshot.forEach(doc => {
            if (!filtroLower || doc.id.toLowerCase().includes(filtroLower)) {
                const data = doc.data();
                hayResultados = true;
                html += `
                    <tr class="inventario-row-clickable" onclick="window.seleccionarProductoDesdeInventario('${doc.id}', ${data.precioVenta})">
                        <td>${doc.id}</td>
                        <td>${data.precioVenta !== undefined ? data.precioVenta : "-"}</td>
                        <td>${data.cantidad !== undefined ? data.cantidad : "-"}</td>
                        <td>${data.fechaVencimiento || "-"}</td>
                    </tr>
                `;
            }
        });

        html += `
                </tbody>
            </table>
            </div>
        `;
    resultadoDiv.innerHTML = hayResultados ? html : "No hay resultados.";
    } catch (error) {
        resultadoDiv.innerHTML = "Error al cargar inventario.";
        console.error('🔴 Error cargando inventario:', error);
        // Remover dependencia de SweetAlert temporalmente
        alert('Error al cargar inventario: ' + error.message);
    }
}

// Función para manejar el clic en filas del inventario con input de cantidad
window.seleccionarProductoDesdeInventario = async function(nombreProducto, precioVenta) {
    try {
        // Mostrar input numérico para cantidad
        const { value: cantidad } = await mostrarInputNumerico(`Cantidad para ${nombreProducto}`, 'Ingrese la cantidad');
        
        if (!cantidad || cantidad <= 0) {
            // Usuario canceló o ingresó cantidad inválida
            return;
        }
        
        // Agregar al carrito con la cantidad especificada
        agregarAlCarrito(nombreProducto, precioVenta, cantidad);
        
        // Ocultar inventario después de agregar
        ocultarInventario();
        
    } catch (error) {
        console.error('Error al seleccionar producto desde inventario:', error);
        alert('Error al agregar producto al carrito: ' + error.message);
    }
};

// Función para ocultar el inventario desde otros módulos
export function ocultarInventario() {
    const resultadoDiv = document.getElementById("resultadoBusqueda1");
    if (resultadoDiv) {
        resultadoDiv.classList.add("js-hidden", "d-none");
        resultadoDiv.classList.remove("js-visible", "d-block");
        resultadoDiv.innerHTML = "";
        // console.log('✅ Inventario ocultado');
    }
}