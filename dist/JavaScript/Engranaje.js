// JavaScript/main.js

// Importaciones de módulos locales
import { iniciarSesion, cerrarSesion as cerrarSesionAuth } from "./Autenticacion.js";
import { cargarInventario } from "./Inventario.js";
import { agregarAlCarrito, aumentarCantidad, disminuirCantidad, quitarDelCarrito, renderCarrito } from "./CarritoCompras.js";
import { realizarVenta } from "./VentasApp.js";
import { db } from './Conexion.js';
import { cargarDetalleCuenta } from "./Cuentas.js";

// IMPORTACIONES Firebase Firestore
import { 
    getFirestore, doc, getDoc, getDocs, 
    collection, query, where, orderBy, limit, 
    onSnapshot 
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

const dbResumen = getFirestore();

/** 📌 Función para normalizar nombres de productos */
function normalizarNombre(nombre) {
    return nombre
        .toLowerCase()
        .normalize("NFD")                // separa tildes de las letras
        .replace(/[\u0300-\u036f]/g, "") // elimina las tildes
        .replace(/\s+/g, " ")            // colapsa espacios múltiples
        .trim();
}

/** 📌 Función para cargar resumen del turno activo */
async function cargarResumenTurno() {
    const contenedor = document.getElementById("resumenTurnoDatos");
    contenedor.innerHTML = "<p>Cargando...</p>";

    // 🔹 Listas normalizadas en minúsculas
    const bebidasConAlcohol = [
        "aguila litro", "aguila 330", "aguila light 330", "andina dorada 750",
        "andina 330", "andina light 330", "club colombia 330", "club colombia 850",
        "corona 355 sixpack", "corona 355", "coronita 210 sixpack", "coronita 210",
        "costena 330", "costena 750", "lata aguila 330", "nectar caja litro",
        "nectar caja cuarto", "poker litro", "poker 330 lata sixpack", "poker 330",
        "poker lata 330", "ron v. caldas cuarto"
    ].map(normalizarNombre);

    const productosDeTabaco = [
        "l&m media", "l&m unidad", "lucky media", "lucky unidad", "malboro media",
        "malboro unidad", "rothman blanco unidad", "rothman blanco media",
        "rothman azul unidad", "rothman azul media"
    ].map(normalizarNombre);

    const formatoCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' });

    try {
        let idTurno = null;
        const turnosRef = collection(dbResumen, "turnos");
        const qTurno = query(
            turnosRef,
            where("estado", "==", "activo"),
            orderBy("fechaInicio", "desc"),
            limit(1)
        );
        const snapTurno = await getDocs(qTurno);

        if (!snapTurno.empty) {
            const docData = snapTurno.docs[0].data();
            idTurno = docData.idTurno || snapTurno.docs[0].id;
        }

        if (!idTurno) {
            contenedor.innerHTML = "<p>No hay turno activo.</p>";
            return;
        }

        const cuentaRef = doc(dbResumen, "ventasCerradas", idTurno);
        const cuentaSnap = await getDoc(cuentaRef);

        if (!cuentaSnap.exists()) {
            contenedor.innerHTML = "<p>No hay datos en ventasCerradas para este turno.</p>";
            return;
        }

        const datos = cuentaSnap.data();
        const clientes = Array.isArray(datos.clientes) ? datos.clientes : [];

        let totalEfectivo = 0, totalNequi = 0, totalDaviplata = 0;
        let totalBebidasAlcohol = 0;
        let totalProductosTabaco = 0;

        clientes.forEach(v => {
            if (!v || typeof v !== "object") return;

            const total = Number(v.total) || 0;
            const tipo = (v.tipoVenta || "").toLowerCase();

            if (tipo.includes("efectivo")) totalEfectivo += total;
            if (tipo.includes("nequi")) totalNequi += total;
            if (tipo.includes("daviplata")) totalDaviplata += total;

            if (Array.isArray(v.productos)) {
                v.productos.forEach(p => {
                    if (!p || !p.nombreProducto) return;

                    const productoNombre = normalizarNombre(p.nombreProducto);
                    const productoTotal = (Number(p.precioVenta) || 0) * (Number(p.cantidad) || 0);

                    // 🔹 Log para depuración de alcohol
                    if (bebidasConAlcohol.includes(productoNombre)) {
                        //console.log(`🍺 Producto de ALCOHOL detectado: ${productoNombre} | Cantidad: ${p.cantidad} | Precio: ${p.precioVenta} | Total calculado: ${productoTotal}`);
                        totalBebidasAlcohol += productoTotal;
                    }

                    // 🔹 Log para depuración de tabaco
                    if (productosDeTabaco.includes(productoNombre)) {
                        //console.log(`🚬 Producto de TABACO detectado: ${productoNombre} | Cantidad: ${p.cantidad} | Precio: ${p.precioVenta} | Total calculado: ${productoTotal}`);
                        totalProductosTabaco += productoTotal;
                    }
                });
            }
        });

        const totalGeneral = totalEfectivo + totalNequi + totalDaviplata;
        const diezPorciento = totalGeneral * 0.10;

        // 🔹 Log de totales finales
        //console.log("✅ Total ALCOHOL:", totalBebidasAlcohol);
        //console.log("✅ Total TABACO:", totalProductosTabaco);

        contenedor.innerHTML = `
            <ul class="list-group">
                <li class="list-group-item">Bebidas con<b>Alcohol</b>: ${formatoCOP.format(totalBebidasAlcohol)}</li>
                <li class="list-group-item">Venta de <b>TABACO</b>: ${formatoCOP.format(totalProductosTabaco)}</li>
                <li class="list-group-item">Pagos recibidos por <b>NEQUI</b>: ${formatoCOP.format(totalNequi)}</li>
                <li class="list-group-item">Pagos recibidos por <b>DAVIPLATA</b>: ${formatoCOP.format(totalDaviplata)}</li>
                <li class="list-group-item">Pagos recibidos por <b>EFECTIVO</b>: ${formatoCOP.format(totalEfectivo)}</li>
                <li class="list-group-item active">TOTAL Turno <b>En Curso</b>: ${formatoCOP.format(totalGeneral)}</li>
                <li class="list-group-item">Pago por Turno 10%: ${formatoCOP.format(diezPorciento)}</li>
            </ul>
        `;
    } catch (error) {
        //console.error("❌ Error detallado al cargar resumen:", error);
        contenedor.innerHTML = `<p>Error al cargar resumen: ${error.message}</p>`;
    }
}



/** 📌 Función para cambiar entre contenedores */
function mostrarContainer(idMostrar) {
    document.querySelectorAll('.container, .container1, .container2, .container3, .container4').forEach(el => {
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
    if (idMostrar === "container4") {
        cargarResumenTurno();
    }
}

/** 📌 Función para cerrar sesión */
async function cerrarSesion() {
    await cerrarSesionAuth();
    document.querySelectorAll('.container, .container1, .container2, .container3, .container4').forEach(el => {
        el.style.display = 'none';
    });
    document.getElementById('container').style.display = 'block';
    document.getElementById('loginButton').style.display = 'inline-block';
    document.getElementById('loginForm').style.display = 'none';
}

/** 📌 Función para mostrar detalle de una cuenta */
function mostrarDetalleCuenta(clienteId) {
    mostrarContainer('container3');
    cargarDetalleCuenta(clienteId);
}

/** 📌 Función para cargar cuentas activas */
function cargarCuentasActivas() {
    const q = query(collection(db, "cuentasActivas"));
    const container = document.getElementById('cuentasActivasTurno');

    if (!container) {
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

/** 📌 Eventos al cargar la página */
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

    loginButton.addEventListener('click', () => {
        loginForm.style.display = 'block';
        loginButton.style.display = 'none';
    });

    closeButton.addEventListener('click', () => {
        loginForm.style.display = 'none';
        loginButton.style.display = 'inline-block';
    });

    btnIniciarSesion.addEventListener("click", async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const recordar = recordarCheckbox.checked;

        if (!email || !password) {
            alert("Por favor, completa todos los campos.");
            return;
        }

        try {
            const usuario = await iniciarSesion(email, password, recordar);

            if (!usuario) { // 🚫 Si no hay usuario válido, detener flujo
                alert("Correo o contraseña incorrectos.");
                return;
            }

            container.style.display = 'none';
            loginForm.style.display = 'none';
            container1.style.display = 'block';
            cargarInventario("");
            renderCarrito();
            cargarCuentasActivas();
        } catch (error) {
            alert("Error al iniciar sesión: " + error.message);
        }
    });

    if (campoBusqueda1) {
        campoBusqueda1.addEventListener("input", function() {
            cargarInventario(this.value);
        });
    }
});

/** 📌 Exportar funciones al ámbito global */
window.agregarAlCarrito = agregarAlCarrito;
window.aumentarCantidad = aumentarCantidad;
window.disminuirCantidad = disminuirCantidad;
window.quitarDelCarrito = quitarDelCarrito;
window.renderCarrito = renderCarrito;
window.realizarVenta = () => realizarVenta(window.carrito);
window.cerrarSesion = cerrarSesion;
window.mostrarContainer = mostrarContainer;
window.mostrarDetalleCuenta = mostrarDetalleCuenta;
