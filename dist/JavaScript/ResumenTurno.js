// ResumenTurno.js
// Módulo para obtener y mostrar el resumen de ventas del turno en curso
import { db } from './Conexion.js';
import { formatearPrecio } from './FormateoPrecios.js';
import { doc, getDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { obtenerResumenFirebase } from "./FirebaseMetrics.js";
import { obtenerConsumoHistorico } from "./FirebaseStats.js";
import { wrappedGetDoc, wrappedGetDocs } from "./FirebaseWrapper.js";

/**
 * Formatea una fecha a formato abreviado (DD/MM HH:mm)
 * @param {string|Date} fecha 
 * @returns {string}
 */
function formatearFechaAbreviada(fecha) {
    if (!fecha) return 'N/A';
    
    try {
        const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
        return d.toLocaleDateString('es-CO', { 
            day: '2-digit', 
            month: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit' 
        }).replace(',', '');
    } catch (error) {
        return 'Fecha inválida';
    }
}

/**
 * Obtiene y calcula el resumen del turno en curso
 * @param {string} idTurno
 * @returns {Promise<Object>} resumen
 */
export async function obtenerResumenTurno(idTurno) {
    const cuentasCerradasRef = doc(db, 'cuentasCerradas', idTurno);
    const cuentasCerradasSnap = await wrappedGetDoc(cuentasCerradasRef);
    const cuentasCerradas = cuentasCerradasSnap.exists() ? cuentasCerradasSnap.data().clientes || [] : [];

    const cuentasActivasRef = collection(db, 'cuentasActivas');
    const q = query(cuentasActivasRef, where('turno', '==', idTurno));
    const cuentasSnap = await wrappedGetDocs(q);
    const cuentasActivasDelTurno = [];
    cuentasSnap.forEach(doc => {
        if (doc.id !== 'historial_abonos') {
            cuentasActivasDelTurno.push({ id: doc.id, ...doc.data() });
        }
    });

    const todasCuentasRef = collection(db, 'cuentasActivas');
    const qTodas = query(todasCuentasRef, where('tipo', '==', 'En cuaderno'));
    const todasCuentasSnap = await wrappedGetDocs(qTodas);
    const todasCuentasEnCuaderno = [];
    todasCuentasSnap.forEach(doc => {
        if (doc.id !== 'historial_abonos') {
            todasCuentasEnCuaderno.push({ id: doc.id, ...doc.data() });
        }
    });

    let totalTabaco = 0;
    let totalNoCobradas = 0;
    let cuentasEnCuaderno = [];
    let totalCuentasCerradas = 0;
    let tipoVenta = { efectivo: 0, nequi: 0, daviplata: 0 };

    let totalAbonos = 0;
    let totalVentasCompletas = 0;
    let detalleAbonos = [];
    
    for (const venta of cuentasCerradas) {
        totalCuentasCerradas += venta.total || 0;
        const medioPago = venta.tipoVenta?.toLowerCase();
        if (medioPago === 'daviplata' || medioPago === 'daviplat') {
            tipoVenta.daviplata += venta.total || 0;
        } else if (medioPago && tipoVenta[medioPago] !== undefined) {
            tipoVenta[medioPago] += venta.total || 0;
        }        
        if (venta.esAbono) {
            totalAbonos += venta.total || 0;
            detalleAbonos.push({
                cliente: venta.cliente,
                monto: venta.total || 0,
                medioPago: venta.tipoVenta,
                fecha: venta.fechaCierre,
                saldoOriginal: venta.saldoOriginal,
                saldoRestante: venta.saldoRestante
            });
        } else {
            totalVentasCompletas += venta.total || 0;
        }

        if (venta.productos && Array.isArray(venta.productos)) {
            for (const prod of venta.productos) {
                const nombreProducto = (prod.nombreProducto || '').toLowerCase().trim();
                const nombreNormalizado = nombreProducto.replace(/\s+/g, ' ');
                const esTabaco =
                    nombreNormalizado.includes('rothman azul media') ||
                    nombreNormalizado.includes('rothman azul unidad') ||
                    nombreNormalizado.includes('rothman blanco media') ||
                    nombreNormalizado.includes('rothman blanco unidad') ||
                    nombreNormalizado.includes('l&m media') ||
                    nombreNormalizado.includes('l&m unidad') ||
                    nombreNormalizado.includes('lucky media') ||
                    nombreNormalizado.includes('lucky unidad') ||
                    nombreNormalizado.includes('malboro media') ||
                    nombreNormalizado.includes('malboro unidad');
                if (esTabaco) {
                    const precio = prod.precioVenta || prod.precio || 0;
                    const cantidad = prod.cantidad || 1;
                    const total = prod.total || (precio * cantidad);
                    totalTabaco += total;
                }
            }
        }
    }

    for (const cuenta of cuentasActivasDelTurno) {
        if (cuenta.tipo === 'Consumo en el local') {
            totalNoCobradas += cuenta.total || 0;
        }
    }
    
    for (const cuenta of todasCuentasEnCuaderno) {
        cuentasEnCuaderno.push({
            cliente: cuenta.cliente || cuenta.id || 'Cliente sin nombre',
            fechaCreacion: formatearFechaAbreviada(cuenta.fechaCreacion || cuenta.timestamp || cuenta.fecha),
            fechaModificacion: formatearFechaAbreviada(cuenta.fechaModificacion || cuenta.ultimaModificacion || cuenta.timestamp || cuenta.fecha),
            total: cuenta.total || 0,
            turno: cuenta.turno || 'Sin turno'
        });
    }

    const pagoTurno = Math.round(totalCuentasCerradas * 0.10 + 7000);

    return {
        totalTabaco,
        totalNoCobradas,
        cuentasEnCuaderno,
        totalCuentasCerradas,
        totalAbonos,
        totalVentasCompletas,
        detalleAbonos,
        tipoVenta,
        pagoTurno
    };
}

/**
 * Renderiza el resumen en el container indicado
 * @param {Object} resumen
 * @param {string} containerId
 */
export async function renderizarResumenTurno(resumen, containerId) {
    const c = document.getElementById(containerId);
    if (!c) return;
    
    const totalEnCuaderno = resumen.cuentasEnCuaderno.reduce((sum, cuenta) => sum + cuenta.total, 0);
    let listadoCuentasEnCuaderno = '';
    if (resumen.cuentasEnCuaderno.length > 0) {
        listadoCuentasEnCuaderno = `
            <details class="mt-2">
                <summary class="resumen-summary-clickable">
                    Ver detalles (${resumen.cuentasEnCuaderno.length} cuenta${resumen.cuentasEnCuaderno.length !== 1 ? 's' : ''})
                </summary>
                <ul class="list-unstyled mt-2 ms-3">
                    ${resumen.cuentasEnCuaderno.map(cuenta => `
                        <li class="small text-muted mt-1">
                            👤 <strong>${cuenta.cliente}</strong> 
                            <span class="badge bg-secondary ms-1">${cuenta.turno}</span><br>
                            📅 ${cuenta.fechaCreacion} → ⏰ ${cuenta.fechaModificacion}<br>
                            💰 <span class="text-dark fw-bold">${formatearPrecio(cuenta.total)}</span>
                        </li>
                    `).join('')}
                </ul>
            </details>
        `;
    }

    // 🔹 Obtener métricas Firebase
    const actual = obtenerResumenFirebase();
    const acumulado = await obtenerConsumoHistorico();

    c.innerHTML = `
        <div class="alert alert-primary text-center mb-4">
            <h3 class="mb-2">📊 Resumen de Tu Turno</h3>
            <p class="mb-0">Así terminaste tu día de trabajo</p>
        </div>

        <!-- SECCIÓN DINERO RECIBIDO -->
        <div class="card mb-4" style="border: 3px solid #28a745;">
            <div class="card-header text-dark text-center">
                <h4 class="mb-0">💰 DINERO QUE RECIBISTE HOY</h4>
            </div>
            <div class="card-body">
                <div class="row text-center g-3">
                    <div class="col-12 col-md-4"><h5>💵 Efectivo</h5><h3>${formatearPrecio(resumen.tipoVenta.efectivo)}</h3></div>
                    <div class="col-12 col-md-4"><h5>📱 Nequi</h5><h3>${formatearPrecio(resumen.tipoVenta.nequi)}</h3></div>
                    <div class="col-12 col-md-4"><h5>💳 Daviplata</h5><h3>${formatearPrecio(resumen.tipoVenta.daviplata)}</h3></div>
                </div>
                <hr>
                <div class="text-center">
                    <h3><strong>TOTAL: ${formatearPrecio(resumen.totalCuentasCerradas)}</strong></h3>
                </div>
            </div>
        </div>

        <!-- SECCIÓN PENDIENTES -->
        <div class="card mb-4">
            <div class="card-header text-dark text-center bg-warning">
                <h4 class="mb-0">⏳ DINERO PENDIENTE DE COBRAR</h4>
            </div>
            <div class="card-body">
                <div class="row g-3 text-center">
                    <div class="col-6">🍺 Consumo local<br><h4>${formatearPrecio(resumen.totalNoCobradas)}</h4></div>
                    <div class="col-6">📝 Cuaderno<br><h4>${formatearPrecio(totalEnCuaderno)}</h4>${listadoCuentasEnCuaderno}</div>
                </div>
            </div>
        </div>

        <!-- SECCIÓN PRODUCTOS -->
        <div class="card mb-4">
            <div class="card-header text-white text-center bg-secondary">
                🚬 Otros productos vendidos
            </div>
            <div class="card-body text-center">
                <h6>Cigarrillos</h6>
                <h4>${formatearPrecio(resumen.totalTabaco)}</h4>
            </div>
        </div>

        <!-- SECCIÓN PAGO -->
        <div class="card">
            <div class="card-header text-white text-center bg-primary">
                💵 TU PAGO DE HOY
            </div>
            <div class="card-body text-center">
                <h2>${formatearPrecio(resumen.pagoTurno)}</h2>
            </div>
        </div>

        <!-- 🔹 MÉTRICAS FIREBASE -->
        <div class="card mt-3">
            <div class="card-header">📊 Consumo Firebase (Turno actual)</div>
            <div class="card-body small">
                📖 Lecturas: ${actual.lecturas || 0}<br>
                ✍️ Escrituras: ${actual.escrituras || 0}<br>
                🗑️ Borrados: ${actual.borrados || 0}<br>
                💾 Almacenamiento estimado: ${actual.almacenamiento || 0} KB<br>
                📡 Transferencia estimada: ${actual.transferencia || 0} KB
                ${actual.lecturas === 0 && actual.escrituras === 0 && actual.borrados === 0 ? '<br><em>No hay datos en este turno.</em>' : ''}
            </div>
        </div>

        <div class="card mt-3">
            <div class="card-header">📈 Acumulado histórico</div>
            <div class="card-body small">
                📖 Lecturas: ${acumulado.lecturas || 0}<br>
                ✍️ Escrituras: ${acumulado.escrituras || 0}<br>
                🗑️ Borrados: ${acumulado.borrados || 0}<br>
                💾 Almacenamiento neto estimado: ${acumulado.almacenamientoNeto || 0} KB<br>
                📡 Transferencia estimada: ${acumulado.transferencia || 0} KB
                ${acumulado.lecturas === 0 && acumulado.escrituras === 0 && acumulado.borrados === 0 ? '<br><em>No hay datos históricos.</em>' : ''}
            </div>
        </div>
    `;
}
