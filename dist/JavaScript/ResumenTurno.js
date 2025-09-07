// ResumenTurno.js
// Módulo para obtener y mostrar el resumen de ventas del turno en curso
import { db } from './Conexion.js';
import { doc, getDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

/**
 * Obtiene y calcula el resumen del turno en curso
 * @param {string} idTurno
 * @returns {Promise<Object>} resumen
 */
export async function obtenerResumenTurno(idTurno) {
    // 1. Obtener ventas cerradas del turno
    const cuentasCerradasRef = doc(db, 'cuentasCerradas', idTurno);
    const cuentasCerradasSnap = await getDoc(cuentasCerradasRef);
    const cuentasCerradas = cuentasCerradasSnap.exists() ? cuentasCerradasSnap.data().clientes || [] : [];

    // 2. Obtener cuentas activas del turno
    const cuentasActivasRef = collection(db, 'cuentasActivas');
    const q = query(cuentasActivasRef, where('turno', '==', idTurno));
    const cuentasSnap = await getDocs(q);
    const cuentasActivas = [];
    cuentasSnap.forEach(doc => cuentasActivas.push({ id: doc.id, ...doc.data() }));

    // 3. Calcular totales
    let totalTabaco = 0;
    let totalNoCobradas = 0;
    let totalEnCuaderno = 0;
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

    // 5. Procesar cuentas activas
    for (const cuenta of cuentasActivas) {
        if (cuenta.tipo === 'Consumo en el local') {
            totalNoCobradas += cuenta.total || 0;
        }
        if (cuenta.tipo === 'En cuaderno') {
            totalEnCuaderno += cuenta.total || 0;
        }
    }

    // 6. Calcular pago de turno
    const pagoTurno = Math.round(totalCuentasCerradas * 0.10 + 7000);

    return {
        totalTabaco,
        totalNoCobradas,
        totalEnCuaderno,
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
    c.innerHTML = `
        <h2>Resumen del Turno</h2>
        <ul class="list-group mb-3">
            <li class="list-group-item">Total ventas de tabaco: <b>$${resumen.totalTabaco}</b></li>
            <li class="list-group-item">Total ventas no Pagas (Consumo en el local): <b>$${resumen.totalNoCobradas}</b></li>
            <li class="list-group-item">Total cuentas En cuaderno: <b>$${resumen.totalEnCuaderno}</b></li>
            <li class="list-group-item">Total cuentas cerradas: <b>$${resumen.totalCuentasCerradas}</b></li>
            <li class="list-group-item">Efectivo: <b>$${resumen.tipoVenta.efectivo}</b></li>
            <li class="list-group-item">Nequi: <b>$${resumen.tipoVenta.nequi}</b></li>
            <li class="list-group-item">Daviplata: <b>$${resumen.tipoVenta.daviplata}</b></li>
        </ul>
        <div class="alert alert-info">
            Pago de turno (10% ventas cerradas + aseo $7.000): <b>$${resumen.pagoTurno}</b>
        </div>
    `;
}
