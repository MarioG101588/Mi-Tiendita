// JavaScript/main.js

// Importaciones de módulos locales
import { iniciarSesion, cerrarSesionConConfirmacion } from "./Autenticacion.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { cargarInventario } from "./Inventario.js";
import { agregarAlCarrito, aumentarCantidad, disminuirCantidad, quitarDelCarrito, renderCarrito } from "./CarritoCompras.js";
import { realizarVenta } from "./VentasApp.js";
import { db } from './Conexion.js';
import { cargarDetalleCuenta } from "./Cuentas.js";
import { exportarInventarioExcel, importarInventarioDesdeExcel } from "./Inventario.js";
// IMPORTACIONES Firebase Firestore
import { auth } from "./Conexion.js";
import { doc, getDoc, getDocs, collection, query, where, orderBy, limit, onSnapshot, updateDoc } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

// --- ADAPTACIÓN PARA CIERRE GLOBAL ---
let unsubscribeTurnoListener = null;

function obtenerTurnoActivoId() {
    return localStorage.getItem("idTurno") || null;
}

function normalizarNombre(nombre) {
    return nombre
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function observarEstadoTurno(idTurno) {
    if (!idTurno) return null;
    const turnoRef = doc(db, "turnos", idTurno);
    const unsubscribe = onSnapshot(turnoRef, async (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.estado && data.estado.toLowerCase() === "cerrado") {
            console.warn("⛔ El turno ha sido Cerrado. Cerrando sesión global...");
            await signOut(auth);
            alert("El turno fue Cerrado. Tu sesión ha finalizado.");
        }
    });
    return unsubscribe;
}

/** 📌 Función para cargar resumen del turno Activo */
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
        console.log("📌 Consultando turnos Activos en colección 'turnos'...");
        const qTurno = query(
            turnosRef,
            where("estado", "==", "Activo"),
            orderBy("fechaInicio", "desc"),
            limit(1)
        );
        const snapTurno = await getDocs(qTurno);
        console.log("📌 Snap turnos Activos:", snapTurno.size);

        if (!snapTurno.empty) {
            const docData = snapTurno.docs[0].data();
            console.log("📌 Datos turno Activo encontrado:", docData);
            idTurno = docData.idTurno || snapTurno.docs[0].id;
            console.log("📌 ID turno elegido:", idTurno);
        }

        if (!idTurno) {
            console.warn("⚠️ No hay turno Activo.");
            contenedor.innerHTML = "<p>No hay turno Activo.</p>";
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
                <li class="list-group-item">Bebidas <b>ALCOHOLICAS</b>:<BR> ${formatoCOP.format(totalBebidasAlcohol)}</li>
                <li class="list-group-item">Venta de <b>TABACO</b>:<BR> ${formatoCOP.format(totalProductosTabaco)}</li>
                <li class="list-group-item">Pagos recibidos en <b>NEQUI</b>:<BR> ${formatoCOP.format(totalNequi)}</li>
                <li class="list-group-item">Pagos recibidos en <b>DAVIPLATA</b>:<BR> ${formatoCOP.format(totalDaviplata)}</li>
                <li class="list-group-item">Pagos recibidos en <b>EFECTIVO</b>:<BR> ${formatoCOP.format(totalEfectivo)}</li><BR>
                <li class="list-group-item active">TOTAL VENTAS <b>HASTA AHORA</b>:<BR><b> ${formatoCOP.format(totalGeneral)}</b></li>
                <li class="list-group-item">Pago del 10% por Turno:<BR> <b>${formatoCOP.format(diezPorciento)}</b></li>
            </ul>
        `;
    } catch (error) {
        console.error("❌ Error detallado al cargar resumen:", error);
        contenedor.innerHTML = `<p>Error al cargar resumen: ${error.message}</p>`;
    }
}

async function marcarCuentasPasadasEnCuaderno(idTurnoActual) {
  if (!idTurnoActual) return;

  const snap = await getDocs(collection(db, "cuentasActivas"));
  for (const d of snap.docs) {
    const c = d.data();

    if (!c.idTurno || c.idTurno === idTurnoActual) continue;

    if ((c.tipo || "").toLowerCase() !== "consumo local" && c.tipo !== "En cuaderno") {
      await updateDoc(doc(db, "cuentasActivas", d.id), { tipo: "En cuaderno" });
    }
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
        verificarCuentasPendientes();
    }
    if (idMostrar === "container4") {
        cargarResumenTurno();
    }
    if (idMostrar === "container5") {
        cargarHistorialTurnos();
    }
    if (idMostrar === "container6") {
        cargarCuentasPendientes();
    }
}

/** Funcion para Cargar Historial de Turnos */
async function cargarHistorialTurnos() {
    const contenedor = document.getElementById("historialTurnosContainer");
    contenedor.innerHTML = "<p>Cargando historial...</p>";

    try {
        // 🔧 corregido: antes consultaba ventasCerradas
        const turnosRef = collection(db, "turnos");
        const q = query(turnosRef, where("estado", "==", "Cerrado"), orderBy("fechaFin", "desc"));
        const snap = await getDocs(q);

        if (snap.empty) {
            contenedor.innerHTML = "<p>No hay turnos Cerrados.</p>";
            return;
        }

        let html = '<div class="list-group">';
        for (const docSnap of snap.docs) {
            const datosTurno = docSnap.data();
            const idTurno = docSnap.id;

            // 🔹 fechas de inicio y fin
            const fechaInicio = datosTurno.fechaInicio?.toDate?.().toLocaleString("es-CO") || "Sin fecha";
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
                    <p>Fecha inicio: ${fechaInicio}</p>
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
// JavaScript/Engranaje.js - CÓDIGO CORREGIDO Y FINAL

async function cerrarSesion() {
    await cerrarSesionConConfirmacion();
}

/** 📌 Función para mostrar detalle de una cuenta */
function mostrarDetalleCuenta(clienteId) {
    mostrarContainer('container3');
    cargarDetalleCuenta(clienteId);
}

function cargarCuentasActivas() {
    const container = document.getElementById('cuentasActivasTurno');
    if (!container) return;

    // ⬇️ obtenemos el idTurno del localStorage
    const idTurno = obtenerTurnoActivoId();
    if (!idTurno) {
        container.innerHTML = "<p>No hay turno Activo.</p>";
        return;
    }

    // ⬇️ declaramos explícitamente la colección
    const cuentasActivasCol = collection(db, "cuentasActivas");
    const q = query(cuentasActivasCol, where("idTurno", "==", idTurno));

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

/* 🔔 NUEVO: Nota en container 2 con cantidad de "En cuaderno" y apertura de container6 */
function verificarCuentasPendientes() {
    const nota = document.getElementById("notaCuentasPendientes");
    if (!nota) return;
    const q = query(collection(db, "cuentasActivas"), where("tipo", "==", "En cuaderno"));

    onSnapshot(q, (querySnapshot) => {
        const cantidad = querySnapshot.size;
        if (cantidad > 0) {
            nota.style.display = "block";
            nota.innerHTML = `📌 Tienes <b>${cantidad}</b> Cuentas Anotadas en el Cuaderno, Toca Aquí para verlas.`;
            nota.onclick = () => {
                mostrarContainer("container6");
                cargarCuentasPendientes();
            };
        } else {
            nota.style.display = "none";
            nota.onclick = null;
        }
    });
}

/* 🔔 Lista en container6: 
   - cuentas "En cuaderno" de turnos anteriores
   - cuentas "En cuaderno" del turno actual
*/
function cargarCuentasPendientes() {
    const container = document.getElementById("cuentasPendientesContainer");
    if (!container) return;

    const turnoActual = localStorage.getItem("turnoActual");

    const q = query(collection(db, "cuentasActivas"), where("tipo", "==", "En cuaderno"));
    onSnapshot(q, (querySnapshot) => {
        if (querySnapshot.empty) {
            container.innerHTML = "<p>No hay cuentas pendientes.</p>";
            return;
        }

        let html = '<div class="list-group">';

        querySnapshot.forEach((docu) => {
            const cuenta = docu.data();
            const clienteId = docu.id;
            const totalFormateado = new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
            }).format(cuenta.total);

            // Distinción visual: si es turno actual o anterior
            const turnoTexto = (cuenta.idTurno === turnoActual) 
                ? "Turno actual" 
                : `Turno anterior (${cuenta.idTurno || "Desconocido"})`;

            html += `
                <div class="list-group-item d-flex justify-content-between align-items-center" 
                     onclick="mostrarDetalleCuenta('${clienteId}')">
                    <div>
                        <h6 class="mb-0">${cuenta.cliente || "Cliente sin nombre"}</h6>
                        <small class="text-muted">${turnoTexto}</small>
                    </div>
                    <span class="badge bg-danger rounded-pill fs-6">
                        ${totalFormateado}
                    </span>
                </div>
            `;
        });

        html += "</div>";
        container.innerHTML = html;
    });
}

// --- ADAPTACIÓN PARA CIERRE GLOBAL ---
document.addEventListener("DOMContentLoaded", function () {
    const emailInput = document.getElementById("emailinicio");
    const passwordInput = document.getElementById("passwordinicio");
    const recordarCheckbox = document.getElementById("recordarDatos");
    const btnIniciarSesion = document.getElementById("btnIniciarSesion");
    const loginForm = document.getElementById("loginForm");
    const loginButton = document.getElementById("loginButton");
    const closeButton = document.getElementById("closeButton");
    const campoBusqueda1 = document.getElementById("campoBusqueda1");
    const auth = getAuth();

    // --- ADAPTACIÓN PARA CIERRE GLOBAL ---
    onAuthStateChanged(auth, (user) => {
        if (unsubscribeTurnoListener) {
            unsubscribeTurnoListener();
            unsubscribeTurnoListener = null;
        }

        if (user) {
            const idTurno = obtenerTurnoActivoId();
            if (idTurno) {
                console.log(`Usuario ${user.email} autenticado con turno ${idTurno}.`);
                unsubscribeTurnoListener = observarEstadoTurno(idTurno);
                mostrarContainer("container2");
                cargarCuentasActivas();
                verificarCuentasPendientes();
            } else {
                // Caso anómalo: Autenticado pero sin turno. Limpiamos.
                console.warn(`Usuario ${user.email} autenticado pero sin turno. Cerrando sesión.`);
                signOut(auth);
            }
        } else {
            // Usuario no autenticado: limpiar turno y actualizar UI
            localStorage.removeItem("idTurno");
            document.querySelectorAll('.container, .container1, .container2, .container3, .container4, .container5, .container6')
                .forEach(el => el.style.display = 'none');
            document.getElementById('container').style.display = 'block';
            document.getElementById('loginButton').style.display = 'inline-block';
            document.getElementById('loginForm').style.display = 'none';
        }
    });

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

        const idTurno = await iniciarSesion(email, password, recordar);

        if (idTurno) {
            console.log(`Proceso de login completado para el turno: ${idTurno}`);
        } else {
            console.error("El proceso de inicio de sesión falló.");
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
window.marcarCuentasPasadasEnCuaderno = marcarCuentasPasadasEnCuaderno;
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
