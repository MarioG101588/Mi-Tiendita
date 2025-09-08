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
    cuentasSnap.forEach(doc => cuentasActivasDelTurno.push({ id: doc.id, ...doc.data() }));
    
    // console.log('Cuentas activas del turno encontradas:', cuentasActivasDelTurno.length);

    // 3. TAMBIÉN obtener TODAS las cuentas "En cuaderno" (sin filtrar por turno)
    const todasCuentasRef = collection(db, 'cuentasActivas');
    const qTodas = query(todasCuentasRef, where('tipo', '==', 'En cuaderno'));
    const todasCuentasSnap = await getDocs(qTodas);
    const todasCuentasEnCuaderno = [];
    todasCuentasSnap.forEach(doc => todasCuentasEnCuaderno.push({ id: doc.id, ...doc.data() }));
    
    // console.log('TODAS las cuentas En cuaderno encontradas:', todasCuentasEnCuaderno.length);

    // 4. Calcular totales
    let totalTabaco = 0;
    let totalNoCobradas = 0;
    let cuentasEnCuaderno = []; // Cambio: array en lugar de total
    let totalCuentasCerradas = 0;
    let tipoVenta = { efectivo: 0, nequi: 0, daviplata: 0 };

    // 4. Procesar ventas cerradas
    for (const venta of cuentasCerradas) {
        totalCuentasCerradas += venta.total || 0;
        const medioPago = venta.tipoVenta?.toLowerCase();
        if (medioPago && tipoVenta[medioPago] !== undefined) {
            tipoVenta[medioPago] += venta.total || 0;
        }
        // Tabaco: filtrar por productos específicos de tabaco
        if (venta.productos) {
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
    for (const cuenta of cuentasActivasDelTurno) {
        // console.log('Procesando cuenta del turno:', cuenta.cliente || cuenta.id, 'Tipo:', cuenta.tipo, 'Total:', cuenta.total);
        
        if (cuenta.tipo === 'Consumo en el local') {
            totalNoCobradas += cuenta.total || 0;
        }
    }
    
    // 6. Procesar TODAS las cuentas "En cuaderno" (independiente del turno)
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
                💰 <span class="text-success fw-bold">${formatearPrecio(cuenta.total)}</span>
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
        <h2>Resumen del Turno</h2>
        <ul class="list-group mb-3">
            <li class="list-group-item">Total ventas de Cigarrillo: <b>${formatearPrecio(resumen.totalTabaco)}</b></li>
            <li class="list-group-item">Total ventas Consumo en el local no Pagas: <b>${formatearPrecio(resumen.totalNoCobradas)}</b></li>
            <li class="list-group-item">
                Cuentas Anotadas En El Cuaderno: <b>${formatearPrecio(totalEnCuaderno)}</b>
                ${listadoCuentasEnCuaderno}
            </li>
            <li class="list-group-item">Efectivo: <b>${formatearPrecio(resumen.tipoVenta.efectivo)}</b></li>
            <li class="list-group-item">Nequi: <b>${formatearPrecio(resumen.tipoVenta.nequi)}</b></li>
            <li class="list-group-item">Daviplata: <b>${formatearPrecio(resumen.tipoVenta.daviplata)}</b></li>
            <li class="list-group-item">Total Pagos Recibidos: <b>${formatearPrecio(resumen.totalCuentasCerradas)}</b></li>
            </ul>
        <div class="alert alert-info">
            Pago de turno (10% ventas cerradas + aseo $ 7.000): <b>${formatearPrecio(resumen.pagoTurno)}</b>
        </div>
    `;
}
