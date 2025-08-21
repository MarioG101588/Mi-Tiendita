// JavaScript/main.js

// Importaciones de módulos locales
import { iniciarSesion, cerrarSesionConConfirmacion, observarSesion } from "./Autenticacion.js";
import { cargarInventario } from "./Inventario.js";
import { agregarAlCarrito, aumentarCantidad, disminuirCantidad, quitarDelCarrito, renderCarrito } from "./CarritoCompras.js";
import { realizarVenta } from "./VentasApp.js";
import { db } from './Conexion.js';
import { cargarDetalleCuenta } from "./Cuentas.js";
import { exportarInventarioExcel, importarInventarioDesdeExcel } from "./Inventario.js";
// IMPORTACIONES Firebase Firestore
import {doc, getDoc, getDocs, collection, query, where, orderBy, limit, onSnapshot} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

observarSesion((user) => {
    if (user) {
        console.log("✅ Sesión activa detectada:", user.email);
        container.style.display = 'none';
        loginForm.style.display = 'none';
        container1.style.display = 'block';
        cargarInventario("");
        renderCarrito();
        cargarCuentasActivas();
    } else {
        console.log("⚠️ No hay sesión activa");
    }
});


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
    const bebidasConAlcohol = [        "aguila litro", "aguila 330", "aguila light 330", "andina dorada 750",
        "andina 330", "andina light 330", "club colombia 330", "club colombia 850",
        "corona 355 sixpack", "corona 355", "coronita 210 sixpack", "coronita 210",
        "costena 330", "costena 750", "lata aguila 330", "nectar caja litro",
        "nectar caja cuarto", "poker litro", "poker 330 lata sixpack", "poker 330",
        "poker lata 330", "ron v. caldas cuarto"
].map(normalizarNombre);
    const productosDeTabaco = [        "l&m media", "l&m unidad", "lucky media", "lucky unidad", "malboro media",
        "malboro unidad", "rothman blanco unidad", "rothman blanco media",
        "rothman azul unidad", "rothman azul media"
].map(normalizarNombre);

    const formatoCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' });

    try {
        let idTurno = null;
        // 🔧 corregido: antes usaba dbResumen (no definido)
        const turnosRef = collection(db, "turnos");
        console.log("📌 Consultando turnos activos en colección 'turnos'...");
        const qTurno = query(
            turnosRef,
            where("estado", "==", "activo"),
            orderBy("fechaInicio", "desc"),
            limit(1)
        );
        const snapTurno = await getDocs(qTurno);
        console.log("📌 Snap turnos activos:", snapTurno.size);

        if (!snapTurno.empty) {
            const docData = snapTurno.docs[0].data();
            console.log("📌 Datos turno activo encontrado:", docData);
            idTurno = docData.idTurno || snapTurno.docs[0].id;
            console.log("📌 ID turno elegido:", idTurno);
        }

        if (!idTurno) {
            console.warn("⚠️ No hay turno activo.");
            contenedor.innerHTML = "<p>No hay turno activo.</p>";
            return;
        }

        // 🔧 corregido: antes usaba dbResumen
        console.log(`📌 Buscando documento en ventasCerradas con ID turno: ${idTurno}`);
        const cuentaRef = doc(db, "ventasCerradas", idTurno);
        const cuentaSnap = await getDoc(cuentaRef);

        if (!cuentaSnap.exists()) {
            console.warn("⚠️ Documento no encontrado en ventasCerradas:", idTurno);
            contenedor.innerHTML = "<p>No hay datos en ventasCerradas para este turno.</p>";
            return;
        }

        const datos = cuentaSnap.data();
        console.log("📌 Datos obtenidos de ventasCerradas:", datos);
        const clientes = Array.isArray(datos.clientes) ? datos.clientes : [];
        console.log("📌 Clientes en ventasCerradas:", clientes.length);

        let totalEfectivo = 0, totalNequi = 0, totalDaviplata = 0;
        let totalBebidasAlcohol = 0;
        let totalProductosTabaco = 0;

        clientes.forEach(v => {
            if (!v || typeof v !== "object") return;
            console.log("➡️ Procesando venta:", v);

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

                    console.log(`   ➡️ Producto detectado: ${productoNombre}, Total: ${productoTotal}`);

                    if (bebidasConAlcohol.includes(productoNombre)) {
                        totalBebidasAlcohol += productoTotal;
                    }

                    if (productosDeTabaco.includes(productoNombre)) {
                        totalProductosTabaco += productoTotal;
                    }
                });
            }
        });

        const totalGeneral = totalEfectivo + totalNequi + totalDaviplata;
        const diezPorciento = totalGeneral * 0.10;

        console.log("✅ Totales calculados:", {
            totalEfectivo, totalNequi, totalDaviplata,
            totalBebidasAlcohol, totalProductosTabaco,
            totalGeneral, diezPorciento
        });

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
        console.error("❌ Error detallado al cargar resumen:", error);
        contenedor.innerHTML = `<p>Error al cargar resumen: ${error.message}</p>`;
    }
}


/** 📌 Función para cambiar entre contenedores */
function mostrarContainer(idMostrar) {
    document.querySelectorAll('.container, .container1, .container2, .container3, .container4, .container5').forEach(el => {
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
    if (idMostrar === "container5") {
        cargarHistorialTurnos();
    }
}

/** Funcion para Cargar Historial de Turnos */
async function cargarHistorialTurnos() {
    const contenedor = document.getElementById("historialTurnosContainer");
    contenedor.innerHTML = "<p>Cargando historial...</p>";

    try {
        // 🔧 corregido: antes consultaba ventasCerradas
        const turnosRef = collection(db, "turnos");
        const q = query(turnosRef, where("estado", "==", "cerrado"), orderBy("fechaFin", "desc"));
        const snap = await getDocs(q);

        if (snap.empty) {
            contenedor.innerHTML = "<p>No hay turnos cerrados.</p>";
            return;
        }

        let html = '<div class="list-group">';
        for (const docSnap of snap.docs) {
            const datosTurno = docSnap.data();
            const idTurno = docSnap.id;
            const fechaFin = datosTurno.fechaFin?.toDate?.().toLocaleString("es-CO") || "Sin fecha";

            // buscar total en ventasCerradas
            const cuentaRef = doc(db, "ventasCerradas", idTurno);
            const cuentaSnap = await getDoc(cuentaRef);
            let total = 0;
            if (cuentaSnap.exists()) {
                const datos = cuentaSnap.data();
                total = datos?.clientes?.reduce((acc, c) => acc + (c.total || 0), 0) || 0;
            }
            const totalFormateado = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(total);

            html += `
                <div class="list-group-item">
                    <h6>Turno: ${idTurno}</h6>
                    <p>Fecha cierre: ${fechaFin}</p>
                    <p>Total: ${totalFormateado}</p>
                    <button class="btn btn-sm btn-primary" onclick="verResumenTurno('${idTurno}')">Ver detalle</button>
                </div>
            `;
        }
        html += '</div>';
        contenedor.innerHTML = html;
    } catch (err) {
        contenedor.innerHTML = `<p>Error: ${err.message}</p>`;
    }
}

/** Funcion Ver Detalles de Turno */
async function verResumenTurno(idTurno) {
    const contenedor = document.getElementById("historialTurnosContainer");
    contenedor.innerHTML = "<p>Cargando resumen...</p>";

    try {
        const cuentaRef = doc(db, "ventasCerradas", idTurno);
        const cuentaSnap = await getDoc(cuentaRef);

        if (!cuentaSnap.exists()) {
            contenedor.innerHTML = "<p>No hay datos para este turno.</p>";
            return;
        }

        const datos = cuentaSnap.data();
        const clientes = datos.clientes || [];
        let html = `<h3>Resumen del turno ${idTurno}</h3><ul class="list-group">`;

        clientes.forEach((c, i) => {
            html += `
                <li class="list-group-item">
                    <strong>Cliente:</strong> ${c.cliente}<br>
                    <strong>Tipo:</strong> ${c.tipoVenta}<br>
                    <strong>Total:</strong> ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(c.total)}
                </li>
            `;
        });

        html += "</ul>";
        contenedor.innerHTML = html;
    } catch (err) {
        contenedor.innerHTML = `<p>Error: ${err.message}</p>`;
    }
}
/** 📌 Función para cerrar sesión */
async function cerrarSesion() {
    const confirmacion = await cerrarSesionConConfirmacion();

    if (!confirmacion) return; // El usuario canceló

    // Solo si se cerró la sesión, actualiza la interfaz
    document.querySelectorAll('.container, .container1, .container2, .container3, .container4, .container5').forEach(el => {
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
window.verResumenTurno = verResumenTurno;
window.cargarHistorialTurnos = cargarHistorialTurnos;
window.mostrarContainer = mostrarContainer;
window.cargarResumenTurno = cargarResumenTurno;
window.cerrarSesion = cerrarSesion;
window.mostrarDetalleCuenta = mostrarDetalleCuenta;
document.getElementById("btnExportarInventario").addEventListener("click", exportarInventarioExcel);
document.getElementById("importFile") .addEventListener("change", (e) => {
        
    if 
    (e.target.files.length > 0) {
            importarInventarioDesdeExcel(e.target.files[0]);
        }
    });