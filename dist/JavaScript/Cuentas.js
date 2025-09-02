// === IMPORTACIONES REQUERIDAS ===
import { 
    getFirestore, 
    collection, 
    addDoc,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { app } from "./Conexion.js";
import { getCurrentUser, getCurrentTurnoId } from "./Autenticacion.js";

// === INICIALIZACIÓN DE SERVICIOS ===
const db = getFirestore(app);

// === ESTADO INTERNO DEL MÓDULO ===
let cuentasCache = new Map();
let clientesCache = new Map();
let lastFetchTime = 0;
const CACHE_DURATION = 3 * 60 * 1000; // 3 minutos en millisegundos

// === CONSTANTES DE CONFIGURACIÓN ===
const ESTADOS_CUENTA = {
    PENDIENTE: 'pendiente',
    PAGADA: 'pagada',
    CANCELADA: 'cancelada',
    VENCIDA: 'vencida'
};

const TIPOS_MOVIMIENTO = {
    VENTA: 'venta',
    PAGO: 'pago',
    AJUSTE: 'ajuste',
    CANCELACION: 'cancelacion'
};

const METODOS_PAGO = {
    EFECTIVO: 'efectivo',
    TARJETA: 'tarjeta',
    TRANSFERENCIA: 'transferencia',
    CHEQUE: 'cheque'
};

// === FUNCIONES DE VALIDACIÓN ===
function validarCliente(cliente) {
    const errores = [];
    
    if (!cliente.nombre?.trim()) {
        errores.push({ field: 'nombre', message: 'El nombre del cliente es requerido' });
    }
    
    if (!cliente.telefono?.trim()) {
        errores.push({ field: 'telefono', message: 'El teléfono es requerido' });
    } else if (!/^\d{10}$/.test(cliente.telefono.replace(/\D/g, ''))) {
        errores.push({ field: 'telefono', message: 'Teléfono debe tener 10 dígitos' });
    }
    
    if (cliente.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) {
        errores.push({ field: 'email', message: 'Email inválido' });
    }
    
    if (cliente.documento && cliente.documento.trim().length < 6) {
        errores.push({ field: 'documento', message: 'Documento debe tener al menos 6 caracteres' });
    }
    
    return errores;
}

function validarCuenta(cuenta) {
    const errores = [];
    
    if (!cuenta.clienteId?.trim()) {
        errores.push({ field: 'clienteId', message: 'Cliente requerido' });
    }
    
    if (typeof cuenta.monto !== 'number' || cuenta.monto <= 0) {
        errores.push({ field: 'monto', message: 'El monto debe ser un número positivo' });
    }
    
    if (!cuenta.concepto?.trim()) {
        errores.push({ field: 'concepto', message: 'El concepto es requerido' });
    }
    
    if (cuenta.fechaVencimiento && new Date(cuenta.fechaVencimiento) <= new Date()) {
        errores.push({ field: 'fechaVencimiento', message: 'La fecha de vencimiento debe ser futura' });
    }
    
    return errores;
}

function validarPago(pago) {
    const errores = [];
    
    if (!pago.cuentaId?.trim()) {
        errores.push({ field: 'cuentaId', message: 'ID de cuenta requerido' });
    }
    
    if (typeof pago.monto !== 'number' || pago.monto <= 0) {
        errores.push({ field: 'monto', message: 'El monto debe ser un número positivo' });
    }
    
    if (!pago.metodoPago || !Object.values(METODOS_PAGO).includes(pago.metodoPago)) {
        errores.push({ field: 'metodoPago', message: 'Método de pago inválido' });
    }
    
    return errores;
}

// === FUNCIONES DE NORMALIZACIÓN ===
function normalizarTexto(texto) {
    if (typeof texto !== 'string') return '';
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function normalizarTelefono(telefono) {
    return telefono.replace(/\D/g, '');
}

// === GESTIÓN DE CLIENTES ===

/**
 * Obtiene todos los clientes
 * @param {boolean} forceRefresh - Forzar actualización ignorando caché
 * @returns {Promise<Array>} Array de clientes
 */
export async function obtenerClientes(forceRefresh = false) {
    try {
        // Verificar caché
        const now = Date.now();
        if (!forceRefresh && clientesCache.size > 0 && (now - lastFetchTime) < CACHE_DURATION) {
            console.log('👥 Usando clientes desde caché');
            return Array.from(clientesCache.values());
        }
        
        console.log('🔄 Obteniendo clientes desde Firebase...');
        
        const clientesRef = collection(db, "clientes");
        const querySnapshot = await getDocs(clientesRef);
        
        const clientes = [];
        clientesCache.clear();
        
        querySnapshot.forEach(docSnap => {
            const data = docSnap.data();
            const cliente = {
                id: docSnap.id,
                nombre: data.nombre || '',
                telefono: data.telefono || '',
                email: data.email || '',
                documento: data.documento || '',
                direccion: data.direccion || '',
                saldoPendiente: parseFloat(data.saldoPendiente) || 0,
                limiteCredito: parseFloat(data.limiteCredito) || 0,
                totalCompras: parseFloat(data.totalCompras) || 0,
                fechaRegistro: data.fechaRegistro || null,
                ultimaCompra: data.ultimaCompra || null,
                activo: data.activo !== false
            };
            
            clientes.push(cliente);
            clientesCache.set(docSnap.id, cliente);
        });
        
        // Ordenar por nombre
        clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));
        
        console.log(`✅ Clientes obtenidos: ${clientes.length}`);
        return clientes;
        
    } catch (error) {
        console.error('❌ Error obteniendo clientes:', error);
        throw {
            code: 'clients/fetch-error',
            message: 'Error al obtener los clientes',
            originalError: error
        };
    }
}

/**
 * Busca un cliente específico por ID
 * @param {string} clienteId - ID del cliente
 * @returns {Promise<Object|null>} Cliente encontrado o null
 */
export async function buscarClientePorId(clienteId) {
    try {
        // Verificar caché primero
        if (clientesCache.has(clienteId)) {
            return { ...clientesCache.get(clienteId) };
        }
        
        const clienteRef = doc(db, "clientes", clienteId);
        const clienteSnap = await getDoc(clienteRef);
        
        if (!clienteSnap.exists()) {
            return null;
        }
        
        const data = clienteSnap.data();
        const cliente = {
            id: clienteSnap.id,
            nombre: data.nombre || '',
            telefono: data.telefono || '',
            email: data.email || '',
            documento: data.documento || '',
            direccion: data.direccion || '',
            saldoPendiente: parseFloat(data.saldoPendiente) || 0,
            limiteCredito: parseFloat(data.limiteCredito) || 0,
            totalCompras: parseFloat(data.totalCompras) || 0,
            fechaRegistro: data.fechaRegistro || null,
            ultimaCompra: data.ultimaCompra || null,
            activo: data.activo !== false
        };
        
        // Actualizar caché
        clientesCache.set(clienteId, cliente);
        
        return cliente;
        
    } catch (error) {
        console.error('❌ Error buscando cliente:', error);
        throw {
            code: 'clients/search-error',
            message: 'Error al buscar el cliente',
            originalError: error
        };
    }
}

/**
 * Busca clientes por texto (nombre, teléfono, documento)
 * @param {string} filtro - Texto a buscar
 * @returns {Promise<Array>} Clientes encontrados
 */
export async function buscarClientes(filtro) {
    try {
        const clientes = await obtenerClientes();
        
        if (!filtro?.trim()) {
            return clientes;
        }
        
        const filtroNormalizado = normalizarTexto(filtro);
        
        const clientesFiltrados = clientes.filter(cliente => {
            const nombre = normalizarTexto(cliente.nombre);
            const telefono = normalizarTelefono(cliente.telefono);
            const documento = normalizarTexto(cliente.documento);
            const email = normalizarTexto(cliente.email);
            
            return nombre.includes(filtroNormalizado) ||
                   telefono.includes(filtro.replace(/\D/g, '')) ||
                   documento.includes(filtroNormalizado) ||
                   email.includes(filtroNormalizado);
        });
        
        console.log(`🔍 Búsqueda "${filtro}": ${clientesFiltrados.length} clientes encontrados`);
        return clientesFiltrados;
        
    } catch (error) {
        console.error('❌ Error buscando clientes:', error);
        throw {
            code: 'clients/search-error',
            message: 'Error al buscar clientes',
            originalError: error
        };
    }
}

/**
 * Crea un nuevo cliente
 * @param {Object} datosCliente - Datos del cliente
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function crearCliente(datosCliente) {
    try {
        // Validar datos
        const erroresValidacion = validarCliente(datosCliente);
        if (erroresValidacion.length > 0) {
            throw {
                code: 'validation/invalid-client',
                message: 'Datos del cliente inválidos',
                errors: erroresValidacion
            };
        }
        
        // Verificar si ya existe un cliente con el mismo teléfono o documento
        const clientesExistentes = await obtenerClientes();
        const telefonoNormalizado = normalizarTelefono(datosCliente.telefono);
        
        const clienteConTelefono = clientesExistentes.find(c => 
            normalizarTelefono(c.telefono) === telefonoNormalizado
        );
        
        if (clienteConTelefono) {
            throw {
                code: 'clients/phone-exists',
                message: 'Ya existe un cliente con ese número de teléfono',
                clienteExistente: clienteConTelefono
            };
        }
        
        if (datosCliente.documento) {
            const clienteConDocumento = clientesExistentes.find(c => 
                normalizarTexto(c.documento) === normalizarTexto(datosCliente.documento)
            );
            
            if (clienteConDocumento) {
                throw {
                    code: 'clients/document-exists',
                    message: 'Ya existe un cliente con ese documento',
                    clienteExistente: clienteConDocumento
                };
            }
        }
        
        // Preparar datos del cliente
        const clienteCompleto = {
            nombre: datosCliente.nombre.trim(),
            telefono: telefonoNormalizado,
            email: datosCliente.email?.trim() || '',
            documento: datosCliente.documento?.trim() || '',
            direccion: datosCliente.direccion?.trim() || '',
            saldoPendiente: 0,
            limiteCredito: parseFloat(datosCliente.limiteCredito) || 0,
            totalCompras: 0,
            fechaRegistro: serverTimestamp(),
            ultimaCompra: null,
            activo: true,
            creadoPor: getCurrentUser()?.email
        };
        
        // Guardar en Firebase
        const docRef = await addDoc(collection(db, "clientes"), clienteCompleto);
        
        // Actualizar caché
        const nuevoCliente = {
            id: docRef.id,
            ...clienteCompleto,
            fechaRegistro: new Date().toISOString()
        };
        clientesCache.set(docRef.id, nuevoCliente);
        
        console.log(`✅ Cliente creado: ${datosCliente.nombre}`);
        
        return {
            success: true,
            clienteId: docRef.id,
            cliente: nuevoCliente,
            message: 'Cliente creado correctamente'
        };
        
    } catch (error) {
        console.error('❌ Error creando cliente:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'clients/create-error',
            message: 'Error al crear el cliente',
            originalError: error
        };
    }
}

/**
 * Actualiza un cliente existente
 * @param {string} clienteId - ID del cliente
 * @param {Object} datosActualizacion - Datos a actualizar
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function actualizarCliente(clienteId, datosActualizacion) {
    try {
        // Verificar que el cliente existe
        const clienteExistente = await buscarClientePorId(clienteId);
        if (!clienteExistente) {
            throw {
                code: 'clients/not-found',
                message: 'Cliente no encontrado'
            };
        }
        
        // Validar datos si se proporcionan
        if (datosActualizacion.nombre || datosActualizacion.telefono) {
            const datosCompletos = { ...clienteExistente, ...datosActualizacion };
            const erroresValidacion = validarCliente(datosCompletos);
            if (erroresValidacion.length > 0) {
                throw {
                    code: 'validation/invalid-client',
                    message: 'Datos del cliente inválidos',
                    errors: erroresValidacion
                };
            }
        }
        
        // Preparar datos de actualización
        const datosLimpios = {
            ...datosActualizacion,
            fechaActualizacion: serverTimestamp()
        };
        
        if (datosActualizacion.telefono) {
            datosLimpios.telefono = normalizarTelefono(datosActualizacion.telefono);
        }
        
        // Actualizar en Firebase
        const clienteRef = doc(db, "clientes", clienteId);
        await updateDoc(clienteRef, datosLimpios);
        
        // Actualizar caché
        if (clientesCache.has(clienteId)) {
            const clienteEnCache = clientesCache.get(clienteId);
            const clienteActualizado = { ...clienteEnCache, ...datosLimpios };
            clientesCache.set(clienteId, clienteActualizado);
        }
        
        console.log(`✅ Cliente actualizado: ${clienteId}`);
        
        return {
            success: true,
            clienteId,
            message: 'Cliente actualizado correctamente'
        };
        
    } catch (error) {
        console.error('❌ Error actualizando cliente:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'clients/update-error',
            message: 'Error al actualizar el cliente',
            originalError: error
        };
    }
}

// === GESTIÓN DE CUENTAS ===

/**
 * Obtiene las cuentas de un cliente
 * @param {string} clienteId - ID del cliente
 * @param {string} estado - Estado de las cuentas a filtrar
 * @returns {Promise<Array>} Array de cuentas
 */
export async function obtenerCuentasCliente(clienteId, estado = null) {
    try {
        console.log(`🔄 Obteniendo cuentas del cliente: ${clienteId}`);
        
        let q = query(
            collection(db, "cuentas"),
            where("clienteId", "==", clienteId),
            orderBy("fechaCreacion", "desc")
        );
        
        if (estado) {
            q = query(
                collection(db, "cuentas"),
                where("clienteId", "==", clienteId),
                where("estado", "==", estado),
                orderBy("fechaCreacion", "desc")
            );
        }
        
        const querySnapshot = await getDocs(q);
        
        const cuentas = [];
        querySnapshot.forEach(docSnap => {
            const data = docSnap.data();
            cuentas.push({
                id: docSnap.id,
                clienteId: data.clienteId,
                monto: parseFloat(data.monto) || 0,
                saldoPendiente: parseFloat(data.saldoPendiente) || 0,
                concepto: data.concepto || '',
                descripcion: data.descripcion || '',
                estado: data.estado || ESTADOS_CUENTA.PENDIENTE,
                fechaCreacion: data.fechaCreacion,
                fechaVencimiento: data.fechaVencimiento,
                fechaPago: data.fechaPago || null,
                ventaId: data.ventaId || null,
                turnoId: data.turnoId || null
            });
        });
        
        console.log(`✅ Cuentas obtenidas: ${cuentas.length}`);
        return cuentas;
        
    } catch (error) {
        console.error('❌ Error obteniendo cuentas:', error);
        throw {
            code: 'accounts/fetch-error',
            message: 'Error al obtener las cuentas',
            originalError: error
        };
    }
}

/**
 * Obtiene todas las cuentas pendientes desde cuentasActivas
 * @returns {Promise<Array>} Array de cuentas pendientes
 */
export async function obtenerCuentasPendientes() {
    try {
        console.log('🔄 Obteniendo cuentas pendientes desde cuentasActivas...');
        
        // 🔧 CORRECCIÓN: Buscar en "cuentasActivas" no en "cuentas"
        const cuentasActivasRef = collection(db, "cuentasActivas");
        const querySnapshot = await getDocs(cuentasActivasRef);
        
        const cuentas = [];
        
        querySnapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            // 🔧 CORRECCIÓN: Usar ID del documento como nombre del cliente
            const nombreCliente = docSnap.id;
            
            const cuenta = {
                id: docSnap.id, // ID del documento (nombre del cliente)
                clienteId: docSnap.id,
                clienteNombre: nombreCliente, // Nombre del cliente es el ID
                monto: parseFloat(data.total) || 0,
                saldoPendiente: parseFloat(data.total) || 0, // En tu estructura, total es el saldo pendiente
                concepto: 'Consumo en local', // Concepto por defecto
                descripcion: `Cuenta de ${nombreCliente}`,
                estado: 'pendiente', // Estado por defecto
                fechaCreacion: data.fechaApertura || data.fechaCreacion || null,
                fechaVencimiento: null, // Tu estructura no maneja vencimiento
                ventaId: null,
                turnoId: data.idTurno || null,
                tipo: data.tipo || 'Consumo en el local',
                productos: data.productos || {},
                clienteTelefono: data.telefono || '', // Si tienes teléfono en los datos
                // Campos adicionales de tu estructura original
                fechaUltimaModificacion: data.fechaUltimaModificacion || null
            };
            
            cuentas.push(cuenta);
        });
        
        // Ordenar por fecha de creación (más recientes primero)
        cuentas.sort((a, b) => {
            if (!a.fechaCreacion && !b.fechaCreacion) return 0;
            if (!a.fechaCreacion) return 1;
            if (!b.fechaCreacion) return -1;
            
            const fechaA = a.fechaCreacion.toDate ? a.fechaCreacion.toDate() : new Date(a.fechaCreacion);
            const fechaB = b.fechaCreacion.toDate ? b.fechaCreacion.toDate() : new Date(b.fechaCreacion);
            
            return fechaB - fechaA;
        });
        
        console.log(`✅ Cuentas pendientes obtenidas: ${cuentas.length}`);
        return cuentas;
        
    } catch (error) {
        console.error('❌ Error obteniendo cuentas pendientes:', error);
        throw {
            code: 'accounts/fetch-pending-error',
            message: 'Error al obtener las cuentas pendientes',
            originalError: error
        };
    }
}

/**
 * Crea una nueva cuenta para un cliente
 * @param {Object} datosCuenta - Datos de la cuenta
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function crearCuenta(datosCuenta) {
    try {
        // Validar datos
        const erroresValidacion = validarCuenta(datosCuenta);
        if (erroresValidacion.length > 0) {
            throw {
                code: 'validation/invalid-account',
                message: 'Datos de la cuenta inválidos',
                errors: erroresValidacion
            };
        }
        
        // Verificar que el cliente existe
        const cliente = await buscarClientePorId(datosCuenta.clienteId);
        if (!cliente) {
            throw {
                code: 'clients/not-found',
                message: 'Cliente no encontrado'
            };
        }
        
        // Verificar límite de crédito si aplica
        if (cliente.limiteCredito > 0) {
            const saldoTotalConNuevaCuenta = cliente.saldoPendiente + datosCuenta.monto;
            if (saldoTotalConNuevaCuenta > cliente.limiteCredito) {
                throw {
                    code: 'accounts/credit-limit-exceeded',
                    message: `Límite de crédito excedido. Límite: $${cliente.limiteCredito}, Saldo actual: $${cliente.saldoPendiente}, Monto solicitado: $${datosCuenta.monto}`,
                    limiteCredito: cliente.limiteCredito,
                    saldoActual: cliente.saldoPendiente,
                    montoSolicitado: datosCuenta.monto
                };
            }
        }
        
        // Preparar datos de la cuenta
        const cuentaCompleta = {
            clienteId: datosCuenta.clienteId,
            monto: parseFloat(datosCuenta.monto),
            saldoPendiente: parseFloat(datosCuenta.monto), // Inicialmente igual al monto
            concepto: datosCuenta.concepto.trim(),
            descripcion: datosCuenta.descripcion?.trim() || '',
            estado: ESTADOS_CUENTA.PENDIENTE,
            fechaCreacion: serverTimestamp(),
            fechaVencimiento: datosCuenta.fechaVencimiento || null,
            ventaId: datosCuenta.ventaId || null,
            turnoId: getCurrentTurnoId(),
            creadaPor: getCurrentUser()?.email
        };
        
        // Guardar cuenta en Firebase
        const docRef = await addDoc(collection(db, "cuentas"), cuentaCompleta);
        
        // Actualizar saldo del cliente
        const nuevoSaldoCliente = cliente.saldoPendiente + datosCuenta.monto;
        await actualizarCliente(datosCuenta.clienteId, {
            saldoPendiente: nuevoSaldoCliente
        });
        
        // Crear movimiento en historial
        await crearMovimientoCuenta(docRef.id, {
            tipo: TIPOS_MOVIMIENTO.VENTA,
            monto: datosCuenta.monto,
            descripcion: `Cuenta creada: ${datosCuenta.concepto}`,
            saldoAnterior: cliente.saldoPendiente,
            saldoNuevo: nuevoSaldoCliente
        });
        
        console.log(`✅ Cuenta creada: ${datosCuenta.concepto} - $${datosCuenta.monto}`);
        
        return {
            success: true,
            cuentaId: docRef.id,
            nuevoSaldoCliente,
            message: 'Cuenta creada correctamente'
        };
        
    } catch (error) {
        console.error('❌ Error creando cuenta:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'accounts/create-error',
            message: 'Error al crear la cuenta',
            originalError: error
        };
    }
}

/**
 * Procesa el pago de una cuenta
 * @param {string} cuentaId - ID de la cuenta
 * @param {Object} datosPago - Datos del pago
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function pagarCuenta(cuentaId, datosPago = {}) {
    try {
        // Validar datos del pago si se proporcionan
        if (Object.keys(datosPago).length > 0) {
            const erroresValidacion = validarPago({ cuentaId, ...datosPago });
            if (erroresValidacion.length > 0) {
                throw {
                    code: 'validation/invalid-payment',
                    message: 'Datos de pago inválidos',
                    errors: erroresValidacion
                };
            }
        }
        
        // Obtener información de la cuenta
        const cuentaRef = doc(db, "cuentas", cuentaId);
        const cuentaSnap = await getDoc(cuentaRef);
        
        if (!cuentaSnap.exists()) {
            throw {
                code: 'accounts/not-found',
                message: 'Cuenta no encontrada'
            };
        }
        
        const cuentaData = cuentaSnap.data();
        
        if (cuentaData.estado === ESTADOS_CUENTA.PAGADA) {
            throw {
                code: 'accounts/already-paid',
                message: 'La cuenta ya está pagada'
            };
        }
        
        if (cuentaData.estado === ESTADOS_CUENTA.CANCELADA) {
            throw {
                code: 'accounts/cancelled',
                message: 'La cuenta está cancelada'
            };
        }
        
        // Obtener información del cliente
        const cliente = await buscarClientePorId(cuentaData.clienteId);
        if (!cliente) {
            throw {
                code: 'clients/not-found',
                message: 'Cliente no encontrado'
            };
        }
        
        const montoPago = datosPago.monto || cuentaData.saldoPendiente;
        const pagoCompleto = montoPago >= cuentaData.saldoPendiente;
        
        // Validar que el monto del pago no exceda el saldo pendiente
        if (montoPago > cuentaData.saldoPendiente) {
            throw {
                code: 'accounts/payment-exceeds-balance',
                message: `El monto del pago ($${montoPago}) excede el saldo pendiente ($${cuentaData.saldoPendiente})`,
                montoPago,
                saldoPendiente: cuentaData.saldoPendiente
            };
        }
        
        // Calcular nuevos saldos
        const nuevoSaldoCuenta = Math.max(0, cuentaData.saldoPendiente - montoPago);
        const nuevoSaldoCliente = Math.max(0, cliente.saldoPendiente - montoPago);
        const nuevoEstadoCuenta = pagoCompleto ? ESTADOS_CUENTA.PAGADA : ESTADOS_CUENTA.PENDIENTE;
        
        // Actualizar cuenta
        await updateDoc(cuentaRef, {
            saldoPendiente: nuevoSaldoCuenta,
            estado: nuevoEstadoCuenta,
            fechaPago: pagoCompleto ? serverTimestamp() : null,
            fechaUltimoPago: serverTimestamp(),
            metodoPago: datosPago.metodoPago || METODOS_PAGO.EFECTIVO,
            observacionesPago: datosPago.observaciones || ''
        });
        
        // Actualizar saldo del cliente
        await actualizarCliente(cuentaData.clienteId, {
            saldoPendiente: nuevoSaldoCliente
        });
        
        // Crear movimiento en historial
        await crearMovimientoCuenta(cuentaId, {
            tipo: TIPOS_MOVIMIENTO.PAGO,
            monto: montoPago,
            descripcion: `Pago ${pagoCompleto ? 'completo' : 'parcial'} - ${datosPago.metodoPago || 'efectivo'}`,
            saldoAnterior: cuentaData.saldoPendiente,
            saldoNuevo: nuevoSaldoCuenta,
            metodoPago: datosPago.metodoPago
        });
        
        console.log(`✅ Pago procesado: $${montoPago} - Cuenta ${pagoCompleto ? 'pagada completamente' : 'pago parcial'}`);
        
        return {
            success: true,
            cuentaId,
            montoPago,
            pagoCompleto,
            nuevoSaldoCuenta,
            nuevoSaldoCliente,
            estadoCuenta: nuevoEstadoCuenta,
            message: `Pago de $${montoPago} procesado correctamente`
        };
        
    } catch (error) {
        console.error('❌ Error procesando pago:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'accounts/payment-error',
            message: 'Error al procesar el pago',
            originalError: error
        };
    }
}

/**
 * Cancela una cuenta
 * @param {string} cuentaId - ID de la cuenta
 * @param {string} motivo - Motivo de la cancelación
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function cancelarCuenta(cuentaId, motivo = '') {
    try {
        // Obtener información de la cuenta
        const cuentaRef = doc(db, "cuentas", cuentaId);
        const cuentaSnap = await getDoc(cuentaRef);
        
        if (!cuentaSnap.exists()) {
            throw {
                code: 'accounts/not-found',
                message: 'Cuenta no encontrada'
            };
        }
        
        const cuentaData = cuentaSnap.data();
        
        if (cuentaData.estado === ESTADOS_CUENTA.CANCELADA) {
            throw {
                code: 'accounts/already-cancelled',
                message: 'La cuenta ya está cancelada'
            };
        }
        
        if (cuentaData.estado === ESTADOS_CUENTA.PAGADA) {
            throw {
                code: 'accounts/cannot-cancel-paid',
                message: 'No se puede cancelar una cuenta pagada'
            };
        }
        
        // Obtener información del cliente
        const cliente = await buscarClientePorId(cuentaData.clienteId);
        if (!cliente) {
            throw {
                code: 'clients/not-found',
                message: 'Cliente no encontrado'
            };
        }
        
        // Actualizar cuenta
        await updateDoc(cuentaRef, {
            estado: ESTADOS_CUENTA.CANCELADA,
            fechaCancelacion: serverTimestamp(),
            motivoCancelacion: motivo,
            canceladaPor: getCurrentUser()?.email
        });
        
        // Actualizar saldo del cliente (restar el saldo pendiente)
        const nuevoSaldoCliente = Math.max(0, cliente.saldoPendiente - cuentaData.saldoPendiente);
        await actualizarCliente(cuentaData.clienteId, {
            saldoPendiente: nuevoSaldoCliente
        });
        
        // Crear movimiento en historial
        await crearMovimientoCuenta(cuentaId, {
            tipo: TIPOS_MOVIMIENTO.CANCELACION,
            monto: -cuentaData.saldoPendiente,
            descripcion: `Cuenta cancelada: ${motivo}`,
            saldoAnterior: cuentaData.saldoPendiente,
            saldoNuevo: 0
        });
        
        console.log(`🚫 Cuenta cancelada: ${cuentaId} - Motivo: ${motivo}`);
        
        return {
            success: true,
            cuentaId,
            montoLiberado: cuentaData.saldoPendiente,
            nuevoSaldoCliente,
            message: 'Cuenta cancelada correctamente'
        };
        
    } catch (error) {
        console.error('❌ Error cancelando cuenta:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'accounts/cancel-error',
            message: 'Error al cancelar la cuenta',
            originalError: error
        };
    }
}

// === FUNCIONES DE MOVIMIENTOS Y HISTORIAL ===
async function crearMovimientoCuenta(cuentaId, datosMovimiento) {
    try {
        const movimiento = {
            cuentaId,
            tipo: datosMovimiento.tipo,
            monto: parseFloat(datosMovimiento.monto),
            descripcion: datosMovimiento.descripcion || '',
            saldoAnterior: parseFloat(datosMovimiento.saldoAnterior) || 0,
            saldoNuevo: parseFloat(datosMovimiento.saldoNuevo) || 0,
            metodoPago: datosMovimiento.metodoPago || null,
            fecha: serverTimestamp(),
            turnoId: getCurrentTurnoId(),
            usuario: getCurrentUser()?.email
        };
        
        await addDoc(collection(db, "movimientos_cuentas"), movimiento);
        
    } catch (error) {
        console.error('❌ Error creando movimiento:', error);
        // No propagamos el error para evitar fallar la operación principal
    }
}

/**
 * Obtiene el historial de movimientos de una cuenta
 * @param {string} cuentaId - ID de la cuenta
 * @returns {Promise<Array>} Array de movimientos
 */
export async function obtenerHistorialCuenta(cuentaId) {
    try {
        const q = query(
            collection(db, "movimientos_cuentas"),
            where("cuentaId", "==", cuentaId),
            orderBy("fecha", "desc")
        );
        
        const querySnapshot = await getDocs(q);
        
        const movimientos = [];
        querySnapshot.forEach(docSnap => {
            movimientos.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });
        
        return movimientos;
        
    } catch (error) {
        console.error('❌ Error obteniendo historial:', error);
        throw {
            code: 'accounts/history-error',
            message: 'Error al obtener el historial de la cuenta',
            originalError: error
        };
    }
}

// === FUNCIONES DE UTILIDAD ===

/**
 * Invalida el caché de clientes
 */
export function invalidarCacheClientes() {
    clientesCache.clear();
    lastFetchTime = 0;
    console.log('🗑️ Caché de clientes invalidado');
}

/**
 * Obtiene estadísticas de cuentas
 * @returns {Promise<Object>} Estadísticas
 */
export async function obtenerEstadisticasCuentas() {
    try {
        const cuentasPendientes = await obtenerCuentasPendientes();
        const clientes = await obtenerClientes();
        
        const totalCuentasPendientes = cuentasPendientes.length;
        const montoTotalPendiente = cuentasPendientes.reduce((sum, cuenta) => sum + cuenta.saldoPendiente, 0);
        const clientesConDeuda = clientes.filter(c => c.saldoPendiente > 0).length;
        const cuentasVencidas = cuentasPendientes.filter(cuenta => {
            if (!cuenta.fechaVencimiento) return false;
            return new Date(cuenta.fechaVencimiento.toDate()) < new Date();
        }).length;
        
        return {
            totalCuentasPendientes,
            montoTotalPendiente,
            clientesConDeuda,
            totalClientes: clientes.length,
            cuentasVencidas,
            promedioDeudaPorCliente: clientesConDeuda > 0 ? montoTotalPendiente / clientesConDeuda : 0
        };
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        throw {
            code: 'accounts/stats-error',
            message: 'Error al obtener estadísticas de cuentas',
            originalError: error
        };
    }
}

// === FUNCIONES DE COMPATIBILIDAD ===
// Para mantener compatibilidad con código existente
export async function cargarCuentas() {
    console.warn('⚠️ cargarCuentas() está deprecada, usa obtenerCuentasPendientes()');
    return await obtenerCuentasPendientes();
}

export async function cargarDetalleCuenta(cuentaId) {
    console.warn('⚠️ cargarDetalleCuenta() está deprecada, usa obtenerHistorialCuenta()');
    return await obtenerHistorialCuenta(cuentaId);
}

// === EXPORTACIONES DE CONSTANTES ===
export { ESTADOS_CUENTA, TIPOS_MOVIMIENTO, METODOS_PAGO };

// === LOGGING DE DEBUG (SOLO EN DESARROLLO) ===
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.group('👥 Accounts Module Debug Info');
    console.log('DB instance:', db);
    console.log('Estados de cuenta:', ESTADOS_CUENTA);
    console.log('Tipos de movimiento:', TIPOS_MOVIMIENTO);
    console.log('Métodos de pago:', METODOS_PAGO);
    console.log('Cache duration:', CACHE_DURATION, 'ms');
    console.groupEnd();
}