// JavaScript/main.js
// Este es el archivo principal que se encargará de importar las funciones de los otros archivos
// y manejar los eventos de la interfaz (botones, inputs, etc.).

// Importaciones de módulos locales
import { iniciarSesion, cerrarSesion as cerrarSesionAuth } from "./Autenticacion.js";
import { cargarInventario } from "./Inventario.js";
import { agregarAlCarrito, aumentarCantidad, disminuirCantidad, quitarDelCarrito, renderCarrito } from "./CarritoCompras.js";
import { realizarVenta } from "./VentasApp.js";
import { db } from './Conexion.js';
import { cargarDetalleCuenta } from "./Cuentas.js";

// IMPORTACIONES de Firebase para la funcionalidad de cuentas
import { collection, onSnapshot, query } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

// Exportar funciones del carrito al ámbito global
window.agregarAlCarrito = agregarAlCarrito;
window.aumentarCantidad = aumentarCantidad;
window.disminuirCantidad = disminuirCantidad;
window.quitarDelCarrito = quitarDelCarrito;
window.renderCarrito = renderCarrito;
window.realizarVenta = () => realizarVenta(window.carrito);

// **FUNCIÓN PARA CARGAR CUENTAS ABIERTAS**
function cargarCuentasActivas() {
    const q = query(collection(db, "cuentasActivas"));
    const container = document.getElementById('cuentasActivasTurno');

    if (!container) {
        console.error("El contenedor para las cuentas activas no fue encontrado.");
        return;
    }

    onSnapshot(q, (querySnapshot) => {
        let htmlContent = '';

        if (querySnapshot.empty) {
            htmlContent = "<p>No hay cuentas activas en este momento.</p>";
        } else {
            htmlContent = '<div class="list-group">';
            querySnapshot.forEach((doc) => {
                const cuenta = doc.data();
                const clienteId = doc.id;
                const totalFormateado = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(cuenta.total);

                htmlContent += `
                    <div class="list-group-item d-flex justify-content-between align-items-center" 
                         onclick="mostrarDetalleCuenta('${clienteId}')"> 
                         <div>
                            <h6 class="mb-0">${cuenta.cliente}</h6>
                            <small class="text-muted">${cuenta.tipo}</small>
                        </div>
                        <span class="badge bg-success rounded-pill fs-6">
                            ${totalFormateado}
                        </span>
                    </div>
                `;
            });
            htmlContent += '</div>';
        }
        container.innerHTML = htmlContent;
    });
}

// Evento que se dispara cuando el DOM está completamente cargado
document.addEventListener("DOMContentLoaded", function () {
    const emailInput = document.getElementById("emailinicio");
    const passwordInput = document.getElementById("passwordinicio");
    const recordarCheckbox = document.getElementById("recordarDatos");
    const btnIniciarSesion = document.getElementById("btnIniciarSesion");
    const container = document.getElementById("container");
    const container1 = document.getElementById("container1");
    const loginForm = document.getElementById("loginForm");
    const loginButton = document.getElementById("loginButton");
    const closeButton = document.getElementById("closeButton");
    const campoBusqueda1 = document.getElementById("campoBusqueda1");

    if (localStorage.getItem("recordar") === "true") {
        emailInput.value = localStorage.getItem("email") || "";
        passwordInput.value = localStorage.getItem("password") || "";
        recordarCheckbox.checked = true;
    }

    loginButton.addEventListener('click', function() {
        loginForm.style.display = 'block';
        loginButton.style.display = 'none';
    });

    closeButton.addEventListener('click', function() {
        loginForm.style.display = 'none';
        loginButton.style.display = 'inline-block';
    });

    btnIniciarSesion.addEventListener("click", async function () {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const recordar = recordarCheckbox.checked;

        try {
            await iniciarSesion(email, password, recordar);
            container.style.display = 'none';
            loginForm.style.display = 'none';
            container1.style.display = 'block';
            cargarInventario("");
            renderCarrito();
            cargarCuentasActivas();
        } catch (error) {
            console.error("Fallo al iniciar sesión:", error);
        }
    });

    if (campoBusqueda1) {
        campoBusqueda1.addEventListener("input", function() {
            cargarInventario(this.value);
        });
    }
});

// Función para cambiar entre contenedores (expuesta globalmente)
function mostrarContainer(idMostrar) {
    document.querySelectorAll('.container, .container1, .container2, .container3').forEach(el => {
        el.style.display = 'none';
    });
    document.getElementById(idMostrar).style.display = 'block';
    if (idMostrar === "container1") {
        cargarInventario("");
        renderCarrito();
    }
    if (idMostrar === "container2") {
        cargarCuentasActivas();
    }
};

// Función para cerrar sesión (expuesta globalmente)
async function cerrarSesion() {
    await cerrarSesionAuth(); // Se llama a la función importada de Autenticacion.js
    // Oculta todos los containers y muestra el de inicio
    document.querySelectorAll('.container, .container1, .container2, .container3').forEach(el => {
        el.style.display = 'none';
    });
    document.getElementById('container').style.display = 'block';
    document.getElementById('loginButton').style.display = 'inline-block';
    document.getElementById('loginForm').style.display = 'none';
};

// Función para mostrar el detalle de una cuenta (expuesta globalmente)
function mostrarDetalleCuenta(clienteId) {
    mostrarContainer('container3');
    cargarDetalleCuenta(clienteId);
};

// Exportar funciones globales para que puedan ser accedidas desde el HTML
window.cerrarSesion = cerrarSesion;
window.mostrarContainer = mostrarContainer;
window.mostrarDetalleCuenta = mostrarDetalleCuenta;