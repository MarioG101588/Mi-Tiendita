//JavaScript/inventario.js
//Este archivo contiene la lógica para cargar, filtrar y mostrar el inventario de productos.
import { getFirestore, collection, getDocs, doc, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { wrappedGetDocs, wrappedDeleteDoc, wrappedSetDoc } from "./FirebaseWrapper.js";
import { app } from "./Conexion.js";
import { agregarAlCarrito } from "./CarritoCompras.js";
import { mostrarInputNumerico } from "./SweetAlertManager.js";

const db = getFirestore(app);

/**
 * Carga y muestra el inventario de productos en la interfaz.
 * @param {string} filtro - Filtro de búsqueda para los productos.
 */

export async function cargarInventario(filtro = "") {
    console.log('Inventario.js: cargarInventario llamado con filtro:', filtro);
    const resultadoDiv = document.getElementById("resultadoBusqueda1");
    if (!resultadoDiv) {
        console.error('🔴 No se encontró el elemento resultadoBusqueda1');
        return;
    }

    // Mostrar u ocultar inventario según el filtro
    if (!filtro.trim()) {
        console.log('Inventario.js: Filtro vacío, ocultando inventario');
        resultadoDiv.classList.add("js-hidden", "d-none");
        resultadoDiv.classList.remove("js-visible", "d-block");
        resultadoDiv.innerHTML = "";
        return;
    } else {
        console.log('Inventario.js: Mostrando inventario con filtro');
        resultadoDiv.classList.remove("js-hidden", "d-none");
        resultadoDiv.classList.add("js-visible", "d-block");
    }
    resultadoDiv.innerHTML = "Cargando...";

    try {
        // console.log('🔵 Cargando inventario con filtro:', filtro);
        const inventarioRef = collection(db, "inventario");
        const snapshot = await wrappedGetDocs(inventarioRef);
        console.log('Inventario.js: Documentos obtenidos:', snapshot.size);

        let html = `
            <!-- Cabecera animada del inventario -->
            <div class="inventario-header">
                <img src="./pngs/busqueda.gif" alt="Búsqueda de Inventario" class="inventario-gif" />
                <h5 class="inventario-titulo">📦 Inventario de Productos</h5>
                <button class="btn btn-primary btn-sm" onclick="window.agregarNuevoProducto()">➕ Agregar Nuevo</button>
            </div>
            
            <div class="table-responsive inventario-table-container">
            <table class="table table-striped table-bordered inventario-fija">
                <thead>
                    <tr>
                        <th>PRODUCTOS</th>
                        <th>PRECIO</th>
                        <th>CANTIDAD</th>
                        <th>VENCIMIENTO</th>
                        <th>ACCIONES</th>
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
                        <td>
                            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); window.eliminarProducto('${doc.id}')">🗑️</button>
                        </td>
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
    console.log('Inventario.js: seleccionarProductoDesdeInventario llamado con:', nombreProducto, precioVenta);
    try {
        if (window.modoCompras) {
            console.log('Inventario.js: Modo compras detectado, llamando callback');
            // Modo compras: llamar callback en lugar de agregar al carrito
            if (window.callbackSeleccionProductoCompras) {
                window.callbackSeleccionProductoCompras({ nombre: nombreProducto, precioVenta });
            }
            return;
        }

        console.log('Inventario.js: Modo ventas, agregando al carrito');
        // Modo ventas: comportamiento original
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
    }
}

// Función para eliminar producto
window.eliminarProducto = async function(nombreProducto) {
    try {
        // Verificar stock
        const productoRef = doc(db, 'inventario', nombreProducto);
        const productoSnap = await wrappedGetDocs(collection(db, 'inventario'));
        let stock = 0;
        productoSnap.forEach(doc => {
            if (doc.id === nombreProducto) {
                stock = doc.data().cantidad || 0;
            }
        });

        if (stock > 0) {
            alert('No se puede eliminar el producto porque aún tiene stock.');
            return;
        }

        const confirmacion = confirm(`¿Estás seguro de eliminar "${nombreProducto}"? Esta acción no se puede deshacer.`);
        if (confirmacion) {
            await wrappedDeleteDoc(productoRef);
            alert('Producto eliminado.');
            // Recargar inventario si está visible
            cargarInventario(document.getElementById('campoBusqueda1')?.value || '');
        }
    } catch (error) {
        console.error('Error eliminando producto:', error);
        alert('Error al eliminar producto: ' + error.message);
    }
};

// Función para agregar nuevo producto
window.agregarNuevoProducto = async function() {
    try {
        const nombre = prompt('Nombre del nuevo producto:');
        if (!nombre) return;

        const precio = parseFloat(prompt('Precio unitario estimado:'));
        if (isNaN(precio)) return;

        const presentaciones = prompt('Presentaciones (ej. 30,16,13) - opcional:');
        const productoRef = doc(db, 'inventario', nombre.toLowerCase().replace(/\s+/g, '_'));
        
        await wrappedSetDoc(productoRef, {
            precioVenta: precio,
            cantidad: 0,
            presentaciones: presentaciones ? presentaciones.split(',').map(p => parseInt(p.trim())) : [],
            fechaVencimiento: null
        });

        alert('Producto agregado.');
        // Recargar inventario
        cargarInventario(document.getElementById('campoBusqueda1')?.value || '');
    } catch (error) {
        console.error('Error agregando producto:', error);
        alert('Error al agregar producto: ' + error.message);
    }
};