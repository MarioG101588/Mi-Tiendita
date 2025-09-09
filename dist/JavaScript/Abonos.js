// Abonos.js
// Módulo para manejar abonos parciales de cuentas activas
import { db } from './Conexion.js';
import { formatearPrecio } from './FormateoPrecios.js';
import { mostrarExito, mostrarError, mostrarCargando, cerrarModal } from './SweetAlertManager.js';
import { doc, getDoc, setDoc, updateDoc, collection, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

/**
 * Procesa un abono parcial de una cuenta
 * @param {string} clienteId - ID del cliente
 * @param {number} montoAbono - Monto del abono
 * @param {string} medioPago - Medio de pago (Efectivo, Nequi, Daviplata)
 * @param {number} saldoActual - Saldo actual de la cuenta
 * @returns {Promise<boolean>} - Éxito de la operación
 */
export async function procesarAbono(clienteId, montoAbono, medioPago, saldoActual) {
    try {
        mostrarCargando('Procesando abono...');

        const idTurno = localStorage.getItem('idTurno');
        if (!idTurno) {
            throw new Error('No hay turno activo');
        }

        // Validaciones
        if (montoAbono <= 0) {
            throw new Error('El monto del abono debe ser mayor a 0');
        }
        if (montoAbono > saldoActual) {
            throw new Error('El abono no puede ser mayor al saldo actual');
        }

        const resultado = await runTransaction(db, async (transaction) => {
            // 1. Obtener datos actuales de la cuenta
            const cuentaRef = doc(db, 'cuentasActivas', clienteId);
            const cuentaDoc = await transaction.get(cuentaRef);
            
            if (!cuentaDoc.exists()) {
                throw new Error('Cuenta no encontrada');
            }

            const datosActuales = cuentaDoc.data();
            const saldoRestante = datosActuales.total - montoAbono;

            // 2. Registrar venta cerrada (abono)
            const ventaCerrada = {
                cliente: datosActuales.cliente,
                productos: datosActuales.productos,
                total: montoAbono,
                tipoVenta: medioPago,
                turno: idTurno,
                fechaCierre: new Date().toLocaleString('es-CO'),
                timestamp: new Date(),
                esAbono: true,
                saldoOriginal: datosActuales.total,
                saldoRestante: saldoRestante
            };

            // Agregar a cuentas cerradas
            await registrarVentaCerrada(ventaCerrada, idTurno);

            // 3. Guardar en historial de abonos
            await guardarHistorialAbono(clienteId, {
                fecha: new Date().toLocaleString('es-CO'),
                monto: montoAbono,
                medioPago: medioPago,
                turno: idTurno,
                saldoAnterior: datosActuales.total,
                saldoRestante: saldoRestante
            });

            // 4. Actualizar cuenta
            if (saldoRestante > 0) {
                // Cuenta pasa a "En cuaderno" con saldo restante
                transaction.update(cuentaRef, {
                    total: saldoRestante,
                    tipo: 'En cuaderno',
                    ultimaActualizacion: new Date(),
                    tieneAbonos: true
                });
            } else {
                // Saldo completo pagado - eliminar cuenta y historial
                transaction.delete(cuentaRef);
                await eliminarHistorialAbono(clienteId);
            }

            return { saldoRestante, ventaCerrada };
        });

        cerrarModal();
        
        if (resultado.saldoRestante > 0) {
            await mostrarExito(`Abono procesado exitosamente\n\nAbono: ${formatearPrecio(montoAbono)}\nSaldo restante: ${formatearPrecio(resultado.saldoRestante)}\n\nLa cuenta ahora está "En cuaderno"`);
        } else {
            await mostrarExito(`¡Cuenta pagada completamente!\n\nÚltimo abono: ${formatearPrecio(montoAbono)}\nLa cuenta ha sido cerrada`);
        }

        return true;

    } catch (error) {
        cerrarModal();
        console.error('Error procesando abono:', error);
        await mostrarError(`Error al procesar el abono: ${error.message}`);
        return false;
    }
}

/**
 * Registra una venta cerrada por abono
 */
async function registrarVentaCerrada(ventaData, idTurno) {
    const cuentasCerradasRef = doc(db, 'cuentasCerradas', idTurno);
    const cuentasCerradasSnap = await getDoc(cuentasCerradasRef);
    
    let clientesArray = [];
    if (cuentasCerradasSnap.exists()) {
        clientesArray = cuentasCerradasSnap.data().clientes || [];
    }
    
    clientesArray.push(ventaData);
    
    await setDoc(cuentasCerradasRef, { clientes: clientesArray }, { merge: true });
}

/**
 * Guarda el historial de abono para un cliente
 */
export async function guardarHistorialAbono(clienteId, abonoData) {
    try {
        const historialRef = doc(db, 'cuentasActivas', 'historial_abonos');
        const historialSnap = await getDoc(historialRef);
        
        let historialCompleto = {};
        if (historialSnap.exists()) {
            historialCompleto = historialSnap.data();
        }
        
        if (!historialCompleto[clienteId]) {
            historialCompleto[clienteId] = [];
        }
        
        historialCompleto[clienteId].push(abonoData);
        
        await setDoc(historialRef, historialCompleto);
        
    } catch (error) {
        console.error('Error guardando historial de abono:', error);
        throw error;
    }
}

/**
 * Obtiene el historial de abonos de un cliente
 */
export async function obtenerHistorialAbono(clienteId) {
    try {
        const historialRef = doc(db, 'cuentasActivas', 'historial_abonos');
        const historialSnap = await getDoc(historialRef);
        
        if (historialSnap.exists()) {
            const historial = historialSnap.data();
            return historial[clienteId] || [];
        }
        
        return [];
        
    } catch (error) {
        console.error('Error obteniendo historial de abono:', error);
        return [];
    }
}

/**
 * Elimina el historial de abonos cuando se completa el pago
 */
async function eliminarHistorialAbono(clienteId) {
    try {
        const historialRef = doc(db, 'cuentasActivas', 'historial_abonos');
        const historialSnap = await getDoc(historialRef);
        
        if (historialSnap.exists()) {
            const historialCompleto = historialSnap.data();
            delete historialCompleto[clienteId];
            
            await setDoc(historialRef, historialCompleto);
        }
        
    } catch (error) {
        console.error('Error eliminando historial de abono:', error);
    }
}

/**
 * Renderiza el historial de abonos en el HTML
 */
export function renderizarHistorialAbonos(abonos) {
    if (!abonos || abonos.length === 0) {
        return '';
    }
    
    const totalAbonos = abonos.reduce((sum, abono) => sum + abono.monto, 0);
    
    return `
        <div class="mt-3 p-3 border rounded bg-light">
            <h6 class="text-primary mb-2">
                <i class="fas fa-history"></i> Historial de Abonos
            </h6>
            <div class="small mb-2">
                <strong>Total abonado: ${formatearPrecio(totalAbonos)}</strong>
            </div>
            ${abonos.map(abono => `
                <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                    <div class="small">
                        <div><strong>${abono.fecha}</strong></div>
                        <div class="text-muted">${abono.medioPago} - Turno: ${abono.turno}</div>
                    </div>
                    <div class="text-success fw-bold">${formatearPrecio(abono.monto)}</div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Valida si una cuenta puede recibir abonos
 */
export function puedeRecibirAbono(cuenta) {
    return cuenta.total > 0 && 
           (cuenta.tipo === 'Consumo en el local' || cuenta.tipo === 'En cuaderno');
}

/**
 * Obtiene todos los clientes que tienen historial de abonos
 */
export async function obtenerClientesConAbonos() {
    try {
        const historialRef = doc(db, 'cuentasActivas', 'historial_abonos');
        const historialSnap = await getDoc(historialRef);
        
        if (historialSnap.exists()) {
            const historial = historialSnap.data();
            const clientesConAbonos = [];
            
            for (const clienteId in historial) {
                const abonos = historial[clienteId];
                if (abonos && abonos.length > 0) {
                    // Obtener nombre del cliente desde la cuenta activa
                    const cuentaRef = doc(db, 'cuentasActivas', clienteId);
                    const cuentaSnap = await getDoc(cuentaRef);
                    
                    let nombreCliente = clienteId;
                    if (cuentaSnap.exists()) {
                        nombreCliente = cuentaSnap.data().cliente || clienteId;
                    }
                    
                    clientesConAbonos.push({
                        id: clienteId,
                        nombre: nombreCliente,
                        totalAbonos: abonos.length,
                        ultimoAbono: abonos[abonos.length - 1]
                    });
                }
            }
            
            // Ordenar por fecha del último abono (más reciente primero)
            clientesConAbonos.sort((a, b) => {
                return new Date(b.ultimoAbono.fecha) - new Date(a.ultimoAbono.fecha);
            });
            
            return clientesConAbonos;
        }
        
        return [];
        
    } catch (error) {
        console.error('Error obteniendo clientes con abonos:', error);
        return [];
    }
}
