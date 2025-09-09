// ResumenTurno.js
// Módulo para obtener y mostrar el resumen de ventas del turno en curso
import { db } from './Conexion.js';
import { formatearPrecio } from './FormateoPrecios.js';
import { doc, getDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

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
    // console.log('=== INICIANDO RESUMEN PARA TURNO:', idTurno, '===');
    
    // 1. Obtener ventas cerradas del turno
    const cuentasCerradasRef = doc(db, 'cuentasCerradas', idTurno);
    const cuentasCerradasSnap = await getDoc(cuentasCerradasRef);
    const cuentasCerradas = cuentasCerradasSnap.exists() ? cuentasCerradasSnap.data().clientes || [] : [];

    // 2. Obtener cuentas activas del turno específico
    const cuentasActivasRef = collection(db, 'cuentasActivas');
    const q = query(cuentasActivasRef, where('turno', '==', idTurno));
    const cuentasSnap = await getDocs(q);
    const cuentasActivasDelTurno = [];
    cuentasSnap.forEach(doc => {
        // Filtrar el documento especial de historial de abonos
        if (doc.id !== 'historial_abonos') {
            cuentasActivasDelTurno.push({ id: doc.id, ...doc.data() });
        }
    });
    
    // console.log('Cuentas activas del turno encontradas:', cuentasActivasDelTurno.length);

    // 3. TAMBIÉN obtener TODAS las cuentas "En cuaderno" (sin filtrar por turno)
    const todasCuentasRef = collection(db, 'cuentasActivas');
    const qTodas = query(todasCuentasRef, where('tipo', '==', 'En cuaderno'));
    const todasCuentasSnap = await getDocs(qTodas);
    const todasCuentasEnCuaderno = [];
    todasCuentasSnap.forEach(doc => {
        // Filtrar el documento especial de historial de abonos
        if (doc.id !== 'historial_abonos') {
            todasCuentasEnCuaderno.push({ id: doc.id, ...doc.data() });
        }
    });
    
    // console.log('TODAS las cuentas En cuaderno encontradas:', todasCuentasEnCuaderno.length);

    // 4. Calcular totales
    let totalTabaco = 0;
    let totalNoCobradas = 0;
    let cuentasEnCuaderno = []; // Cambio: array en lugar de total
    let totalCuentasCerradas = 0;
    let tipoVenta = { efectivo: 0, nequi: 0, daviplata: 0 };

    // 4. Procesar ventas cerradas y separar abonos
    let totalAbonos = 0;
    let totalVentasCompletas = 0;
    let detalleAbonos = [];
    
    // Validar que cuentasCerradas sea un array
    if (!Array.isArray(cuentasCerradas)) {
        console.warn('cuentasCerradas no es un array:', cuentasCerradas);
        cuentasCerradas = [];
    }
    
    for (const venta of cuentasCerradas) {
        totalCuentasCerradas += venta.total || 0;
        const medioPago = venta.tipoVenta?.toLowerCase();
        if (medioPago && tipoVenta[medioPago] !== undefined) {
            tipoVenta[medioPago] += venta.total || 0;
        }
        
        // Separar abonos de ventas completas
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

        // Tabaco: filtrar por productos específicos de tabaco
        if (venta.productos && Array.isArray(venta.productos)) {
            for (const prod of venta.productos) {
                const nombreProducto = (prod.nombreProducto || '').toLowerCase().trim();
                
                // Normalizar espacios múltiples a uno solo
                const nombreNormalizado = nombreProducto.replace(/\s+/g, ' ');
                
                const esTabaco = nombreNormalizado.includes('rothman azul media') ||
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
                    // Intentar diferentes campos para el precio y cantidad
                    const precio = prod.precioVenta || prod.precio || 0;
                    const cantidad = prod.cantidad || 1;
                    const total = prod.total || (precio * cantidad);
                    
                    totalTabaco += total;
                }
            }
        }
    }

    // 5. Procesar cuentas activas DEL TURNO (para consumo en local)
    if (!Array.isArray(cuentasActivasDelTurno)) {
        console.warn('cuentasActivasDelTurno no es un array:', cuentasActivasDelTurno);
        cuentasActivasDelTurno = [];
    }
    
    for (const cuenta of cuentasActivasDelTurno) {
        // console.log('Procesando cuenta del turno:', cuenta.cliente || cuenta.id, 'Tipo:', cuenta.tipo, 'Total:', cuenta.total);
        
        if (cuenta.tipo === 'Consumo en el local') {
            totalNoCobradas += cuenta.total || 0;
        }
    }
    
    // 6. Procesar TODAS las cuentas "En cuaderno" (independiente del turno)
    if (!Array.isArray(todasCuentasEnCuaderno)) {
        console.warn('todasCuentasEnCuaderno no es un array:', todasCuentasEnCuaderno);
        todasCuentasEnCuaderno = [];
    }
    
    for (const cuenta of todasCuentasEnCuaderno) {
        // console.log('Procesando cuenta En cuaderno:', cuenta.cliente || cuenta.id, 'Turno:', cuenta.turno, 'Total:', cuenta.total);
        
        // Recopilar detalles de cada cuenta en cuaderno
        const cuentaDetalle = {
            cliente: cuenta.cliente || cuenta.id || 'Cliente sin nombre',
            fechaCreacion: formatearFechaAbreviada(cuenta.fechaCreacion || cuenta.timestamp || cuenta.fecha),
            fechaModificacion: formatearFechaAbreviada(cuenta.fechaModificacion || cuenta.ultimaModificacion || cuenta.timestamp || cuenta.fecha),
            total: cuenta.total || 0,
            turno: cuenta.turno || 'Sin turno'
        };
        
        // console.log('Detalle de cuenta agregado:', cuentaDetalle);
        cuentasEnCuaderno.push(cuentaDetalle);
    }
    
    // console.log('Total cuentas En cuaderno encontradas:', cuentasEnCuaderno.length);
    // console.log('Array cuentasEnCuaderno:', cuentasEnCuaderno);

    // 7. Calcular pago de turno
    const pagoTurno = Math.round(totalCuentasCerradas * 0.10 + 7000);

    // console.log('=== RESUMEN FINAL ===');
    // console.log('Total tabaco:', totalTabaco);
    // console.log('Total no cobradas:', totalNoCobradas);
    // console.log('Cuentas en cuaderno:', cuentasEnCuaderno.length);
    // console.log('Total cuentas cerradas:', totalCuentasCerradas);

    return {
        totalTabaco,
        totalNoCobradas,
        cuentasEnCuaderno, // Cambio: array en lugar de total
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
export function renderizarResumenTurno(resumen, containerId) {
    const c = document.getElementById(containerId);
    if (!c) return;
    
    // console.log('Renderizando resumen con:', resumen);
    // console.log('Cuentas en cuaderno recibidas:', resumen.cuentasEnCuaderno);
    
    // Calcular total de cuentas en cuaderno
    const totalEnCuaderno = resumen.cuentasEnCuaderno.reduce((sum, cuenta) => sum + cuenta.total, 0);
    // console.log('Total calculado En cuaderno:', totalEnCuaderno);
    
    // Generar listado de cuentas en cuaderno
    let listadoCuentasEnCuaderno = '';
    if (resumen.cuentasEnCuaderno.length > 0) {
        // console.log('Generando listado para', resumen.cuentasEnCuaderno.length, 'cuentas');
        
        const listItems = resumen.cuentasEnCuaderno.map(cuenta => {
            // console.log('Generando item para:', cuenta);
            return `<li class="small text-muted mt-1">
                👤 <strong>${cuenta.cliente}</strong> 
                <span class="badge bg-secondary ms-1">${cuenta.turno}</span><br>
                📅 ${cuenta.fechaCreacion} → ⏰ ${cuenta.fechaModificacion}<br>
                💰 <span class="text-dark fw-bold">${formatearPrecio(cuenta.total)}</span>
            </li>`;
        }).join('');
        
        listadoCuentasEnCuaderno = `
            <details class="mt-2">
                <summary class="resumen-summary-clickable">
                    Ver detalles (${resumen.cuentasEnCuaderno.length} cuenta${resumen.cuentasEnCuaderno.length !== 1 ? 's' : ''})
                </summary>
                <ul class="list-unstyled mt-2 ms-3">${listItems}</ul>
            </details>
        `;
        
        // console.log('HTML generado para listado:', listadoCuentasEnCuaderno);
    } else {
        // console.log('No hay cuentas En cuaderno para mostrar');
    }
    
    c.innerHTML = `
        <!-- Encabezado principal con información clara -->
        <div class="alert alert-primary text-center mb-4">
            <h3 class="mb-2">📊 Resumen de Tu Turno</h3>
            <p class="mb-0">Así terminaste tu día de trabajo</p>
        </div>

        <!-- SECCIÓN 1: LO MÁS IMPORTANTE - DINERO RECIBIDO -->
        <div class="card mb-4" style="border: 3px solid #28a745;">
            <div class="card-header text-dark text-center" style="background-color: #f8f9fa !important;">
                <h4 class="mb-0">💰 DINERO QUE RECIBISTE HOY</h4>
            </div>
            <div class="card-body">
                <!-- DISEÑO RESPONSIVE: En móvil se apilan, en desktop se mantienen en línea -->
                <div class="row text-center g-3">
                    <div class="col-12 col-md-4">
                        <div class="p-3 rounded" style="background-color: #ffffff !important; border: 1px solid #dee2e6 !important;">
                            <div class="d-flex align-items-center justify-content-center mb-2">
                                <span style="font-size: 2rem;">💵</span>
                                <h5 class="text-dark mb-0 ms-2">Efectivo</h5>
                            </div>
                            <h3 class="text-dark mb-0 fw-bold">${formatearPrecio(resumen.tipoVenta.efectivo)}</h3>
                        </div>
                    </div>
                    <div class="col-12 col-md-4">
                        <div class="p-3 rounded" style="background-color: #ffffff !important; border: 1px solid #dee2e6 !important;">
                            <div class="d-flex align-items-center justify-content-center mb-2">
                                <span style="font-size: 2rem;">📱</span>
                                <h5 class="text-info mb-0 ms-2">Nequi</h5>
                            </div>
                            <h3 class="text-info mb-0 fw-bold">${formatearPrecio(resumen.tipoVenta.nequi)}</h3>
                        </div>
                    </div>
                    <div class="col-12 col-md-4">
                        <div class="p-3 rounded" style="background-color: #ffffff !important; border: 1px solid #dee2e6 !important;">
                            <div class="d-flex align-items-center justify-content-center mb-2">
                                <span style="font-size: 2rem;">💳</span>
                                <h5 class="text-warning mb-0 ms-2">Daviplata</h5>
                            </div>
                            <h3 class="text-warning mb-0 fw-bold">${formatearPrecio(resumen.tipoVenta.daviplata)}</h3>
                        </div>
                    </div>
                </div>
                <hr>
                <div class="text-center">
                    <h3 class="text-dark mb-0">
                        <strong>TOTAL RECIBIDO: ${formatearPrecio(resumen.totalCuentasCerradas)}</strong>
                    </h3>
                    ${resumen.totalAbonos > 0 ? `
                        <div class="mt-2">
                            <small class="text-muted">Incluye:</small><br>
                            <span class="badge bg-primary me-2">💰 Ventas completas: ${formatearPrecio(resumen.totalVentasCompletas)}</span>
                            <span class="badge bg-info">📋 Abonos parciales: ${formatearPrecio(resumen.totalAbonos)}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>

        ${resumen.totalAbonos > 0 ? `
        <!-- SECCIÓN ESPECIAL: ABONOS RECIBIDOS -->
        <div class="card mb-4" style="border: 2px solid #17a2b8;">
            <div class="card-header text-white text-center" style="background-color: #17a2b8 !important;">
                <h4 class="mb-0">📋 ABONOS PARCIALES RECIBIDOS</h4>
            </div>
            <div class="card-body">
                <div class="text-center mb-3">
                    <h4 class="text-info mb-0">Total en abonos: ${formatearPrecio(resumen.totalAbonos)}</h4>
                    <small class="text-muted">${resumen.detalleAbonos.length} abono${resumen.detalleAbonos.length !== 1 ? 's' : ''} procesado${resumen.detalleAbonos.length !== 1 ? 's' : ''}</small>
                </div>
                <details class="mt-2">
                    <summary class="resumen-summary-clickable">
                        Ver detalles de abonos (${resumen.detalleAbonos.length})
                    </summary>
                    <div class="mt-3">
                        ${resumen.detalleAbonos.map(abono => `
                            <div class="border-start border-info border-3 ps-3 mb-2">
                                <div class="d-flex justify-content-between align-items-start">
                                    <div>
                                        <strong>👤 ${abono.cliente}</strong><br>
                                        <small class="text-muted">
                                            📅 ${formatearFechaAbreviada(abono.fecha)}<br>
                                            💳 ${abono.medioPago}<br>
                                            💰 Saldo original: ${formatearPrecio(abono.saldoOriginal)}<br>
                                            💸 Saldo restante: ${formatearPrecio(abono.saldoRestante)}
                                        </small>
                                    </div>
                                    <div class="text-end">
                                        <h5 class="text-info mb-0">${formatearPrecio(abono.monto)}</h5>
                                        <small class="text-success">✅ Abono</small>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </details>
            </div>
        </div>
        ` : ''}

        <!-- SECCIÓN 2: DINERO PENDIENTE DE COBRAR -->
        <div class="card mb-4" style="border: 2px solid #ffc107;">
            <div class="card-header text-dark text-center" style="background-color: #fff3cd !important;">
                <h4 class="mb-0">⏳ DINERO QUE AÚN NO HAS COBRADO</h4>
            </div>
            <div class="card-body">
                <!-- DISEÑO RESPONSIVE: En móvil se apilan, en desktop lado a lado -->
                <div class="row g-3">
                    <div class="col-12 col-md-6">
                        <div class="text-center p-3 rounded shadow-sm h-100" style="background-color: #ffffff !important; border: 1px solid #dee2e6 !important;">
                            <div class="d-flex align-items-center justify-content-center mb-2">
                                <span style="font-size: 2rem;">🍺</span>
                                <div class="ms-2 text-start">
                                    <h6 class="mb-0">Mesas que consumieron</h6>
                                    <small class="text-muted">(aún no han pagado)</small>
                                </div>
                            </div>
                            <h3 class="text-warning mb-0 fw-bold">${formatearPrecio(resumen.totalNoCobradas)}</h3>
                        </div>
                    </div>
                    <div class="col-12 col-md-6">
                        <div class="text-center p-3 rounded shadow-sm h-100" style="background-color: #ffffff !important; border: 1px solid #dee2e6 !important;">
                            <div class="d-flex align-items-center justify-content-center mb-2">
                                <span style="font-size: 2rem;">📝</span>
                                <div class="ms-2 text-start">
                                    <h6 class="mb-0">Cuentas del cuaderno</h6>
                                    <small class="text-muted">(fiadas de otros días)</small>
                                </div>
                            </div>
                            <h3 class="text-warning mb-0 fw-bold">${formatearPrecio(totalEnCuaderno)}</h3>
                            ${listadoCuentasEnCuaderno}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- SECCIÓN 3: OTROS PRODUCTOS -->
        <div class="card mb-4">
            <div class="card-header text-white text-center" style="background-color: #6c757d !important;">
                <h5 class="mb-0">🚬 Otros productos vendidos</h5>
            </div>
            <div class="card-body text-center">
                <h6>Cigarrillos</h6>
                <h4 class="text-secondary">${formatearPrecio(resumen.totalTabaco)}</h4>
                <small class="text-muted">Este dinero ya está incluido en el total recibido</small>
            </div>
        </div>

        <!-- SECCIÓN 4: TU PAGO -->
        <div class="card" style="border: 3px solid #007bff;">
            <div class="card-header text-white text-center" style="background-color: #0d6efd !important;">
                <h4 class="mb-0">💵 TU PAGO DE HOY</h4>
            </div>
            <div class="card-body text-center">
                <h6 class="text-muted">10% de ventas cobradas + $7.000 de aseo</h6>
                <h2 class="text-primary">
                    <strong>${formatearPrecio(resumen.pagoTurno)}</strong>
                </h2>
                <small class="text-muted">Este es el dinero que te corresponde por tu trabajo de hoy</small>
            </div>
        </div>
    `;
}
