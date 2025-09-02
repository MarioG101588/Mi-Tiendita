// === IMPORTACIONES REQUERIDAS ===
import { getFirestore,collection,getDocs,doc,setDoc,updateDoc,deleteDoc,query,where,orderBy,limit} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { app } from "./Conexion.js";
import * as XLSX from 'https://unpkg.com/xlsx@0.18.5/xlsx.mjs';

// === INICIALIZACIÓN DE SERVICIOS ===
const db = getFirestore(app);

// === ESTADO INTERNO DEL MÓDULO ===
let inventarioCache = [];
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos en millisegundos

// === FUNCIONES DE NORMALIZACIÓN DE TEXTO ===
function normalizarTexto(texto) {
    if (typeof texto !== 'string') return '';
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

// === FUNCIONES DE VALIDACIÓN ===
function validarProducto(producto) {
    const errors = [];
    
    // 🔧 CORRECCIÓN: El nombre puede ser el ID del documento si no existe campo nombre
    const nombreEfectivo = producto.nombre || producto.id;
    if (!nombreEfectivo?.trim()) {
        errors.push({ field: 'nombre', message: 'El nombre del producto o ID es requerido' });
    }
    
    if (typeof producto.precio !== 'number' || producto.precio < 0) {
        errors.push({ field: 'precio', message: 'El precio debe ser un número positivo' });
    }
    
    if (typeof producto.cantidad !== 'number' || producto.cantidad < 0) {
        errors.push({ field: 'cantidad', message: 'La cantidad debe ser un número positivo' });
    }
    
    if (!producto.categoria?.trim()) {
        errors.push({ field: 'categoria', message: 'La categoría es requerida' });
    }
    
    return errors;
}

// === FUNCIONES PRINCIPALES DE INVENTARIO ===

/**
 * Obtiene todos los productos del inventario desde Firebase
 * @param {boolean} forceRefresh - Forzar actualización ignorando caché
 * @returns {Promise<Array>} Array de productos
 */
export async function obtenerInventario(forceRefresh = false) {
    try {
        // Verificar caché si no se fuerza refresh
        const now = Date.now();
        if (!forceRefresh && inventarioCache.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
            console.log('📦 Usando inventario desde caché');
            return [...inventarioCache]; // Retornar copia para evitar mutaciones
        }
        
        console.log('🔄 Obteniendo inventario desde Firebase...');
        
        const inventarioRef = collection(db, "inventario");
        const querySnapshot = await getDocs(inventarioRef);
        
        const productos = [];
        querySnapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            // 🔧 CORRECCIÓN PRINCIPAL: Usar ID del documento como nombre si no existe campo nombre
            const nombreProducto = data.nombre || docSnap.id;
            
            productos.push({
                id: docSnap.id,
                nombre: nombreProducto, // ID del documento se usa como nombre
                precio: parseFloat(data.precio || data.precioVenta || 0), // Compatibilidad con ambos campos
                cantidad: parseInt(data.cantidad || 0),
                categoria: data.categoria || 'Sin categoría',
                descripcion: data.descripcion || '',
                codigoBarras: data.codigoBarras || '',
                fechaCreacion: data.fechaCreacion || null,
                fechaActualizacion: data.fechaActualizacion || null,
                // Campos adicionales para compatibilidad
                precioVenta: parseFloat(data.precioVenta || data.precio || 0),
                fechaVencimiento: data.fechaVencimiento || null
            });
        });
        
        // Actualizar caché
        inventarioCache = productos;
        lastFetchTime = now;
        
        console.log(`✅ Inventario obtenido: ${productos.length} productos`);
        return productos;
        
    } catch (error) {
        console.error('❌ Error obteniendo inventario:', error);
        throw {
            code: 'inventory/fetch-error',
            message: 'Error al obtener el inventario',
            originalError: error
        };
    }
}

/**
 * Filtra productos por texto de búsqueda
 * @param {string} filtro - Texto a buscar
 * @param {Array} productos - Array de productos (opcional, usa caché si no se proporciona)
 * @returns {Promise<Array>} Productos filtrados
 */
export async function filtrarInventario(filtro = '', productos = null) {
    try {
        // Obtener productos si no se proporcionan
        const inventario = productos || await obtenerInventario();
        
        if (!filtro.trim()) {
            return inventario;
        }
        
        const filtroNormalizado = normalizarTexto(filtro);
        
        const productosFiltrados = inventario.filter(producto => {
            const nombre = normalizarTexto(producto.nombre);
            const categoria = normalizarTexto(producto.categoria);
            const descripcion = normalizarTexto(producto.descripcion);
            const codigoBarras = normalizarTexto(producto.codigoBarras);
            const idProducto = normalizarTexto(producto.id); // 🔧 AGREGADO: Búsqueda por ID
            
            return nombre.includes(filtroNormalizado) ||
                   categoria.includes(filtroNormalizado) ||
                   descripcion.includes(filtroNormalizado) ||
                   codigoBarras.includes(filtroNormalizado) ||
                   idProducto.includes(filtroNormalizado);
        });
        
        console.log(`🔍 Filtro "${filtro}": ${productosFiltrados.length} productos encontrados`);
        return productosFiltrados;
        
    } catch (error) {
        console.error('❌ Error filtrando inventario:', error);
        throw {
            code: 'inventory/filter-error',
            message: 'Error al filtrar el inventario',
            originalError: error
        };
    }
}

/**
 * Busca un producto específico por ID
 * @param {string} productId - ID del producto
 * @returns {Promise<Object|null>} Producto encontrado o null
 */
export async function buscarProductoPorId(productId) {
    try {
        const inventario = await obtenerInventario();
        const producto = inventario.find(p => p.id === productId);
        
        if (producto) {
            console.log(`✅ Producto encontrado: ${producto.nombre} (ID: ${producto.id})`);
            return producto;
        }
        
        console.log(`❌ Producto no encontrado: ${productId}`);
        return null;
        
    } catch (error) {
        console.error('❌ Error buscando producto:', error);
        throw {
            code: 'inventory/search-error',
            message: 'Error al buscar el producto',
            originalError: error
        };
    }
}

/**
 * Obtiene productos por categoría
 * @param {string} categoria - Nombre de la categoría
 * @returns {Promise<Array>} Productos de la categoría
 */
export async function obtenerProductosPorCategoria(categoria) {
    try {
        const inventario = await obtenerInventario();
        const categoriaNormalizada = normalizarTexto(categoria);
        
        const productos = inventario.filter(producto => 
            normalizarTexto(producto.categoria) === categoriaNormalizada
        );
        
        console.log(`📂 Categoría "${categoria}": ${productos.length} productos`);
        return productos;
        
    } catch (error) {
        console.error('❌ Error obteniendo productos por categoría:', error);
        throw {
            code: 'inventory/category-error',
            message: 'Error al obtener productos por categoría',
            originalError: error
        };
    }
}

/**
 * Obtiene todas las categorías únicas del inventario
 * @returns {Promise<Array>} Array de categorías
 */
export async function obtenerCategorias() {
    try {
        const inventario = await obtenerInventario();
        const categorias = [...new Set(inventario.map(p => p.categoria))];
        
        return categorias.sort();
        
    } catch (error) {
        console.error('❌ Error obteniendo categorías:', error);
        throw {
            code: 'inventory/categories-error',
            message: 'Error al obtener las categorías',
            originalError: error
        };
    }
}

/**
 * Verifica disponibilidad de stock de un producto
 * @param {string} productId - ID del producto
 * @param {number} cantidadSolicitada - Cantidad requerida
 * @returns {Promise<Object>} Estado de disponibilidad
 */
export async function verificarDisponibilidad(productId, cantidadSolicitada) {
    try {
        const producto = await buscarProductoPorId(productId);
        
        if (!producto) {
            return {
                disponible: false,
                motivo: 'Producto no encontrado',
                cantidadDisponible: 0
            };
        }
        
        const disponible = producto.cantidad >= cantidadSolicitada;
        
        return {
            disponible,
            motivo: disponible ? 'Stock suficiente' : 'Stock insuficiente',
            cantidadDisponible: producto.cantidad,
            cantidadSolicitada,
            producto: producto.nombre // Ahora mostrará el ID como nombre
        };
        
    } catch (error) {
        console.error('❌ Error verificando disponibilidad:', error);
        throw {
            code: 'inventory/availability-error',
            message: 'Error al verificar disponibilidad',
            originalError: error
        };
    }
}

// === FUNCIONES DE MANIPULACIÓN DE INVENTARIO ===

/**
 * Agrega un nuevo producto al inventario
 * @param {Object} producto - Datos del producto
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function agregarProducto(producto) {
    try {
        // 🔧 CORRECCIÓN: Ajustar validación para permitir usar ID como nombre
        const productoParaValidar = {
            ...producto,
            nombre: producto.nombre || producto.id || `prod_${Date.now()}`
        };
        
        const validationErrors = validarProducto(productoParaValidar);
        if (validationErrors.length > 0) {
            throw {
                code: 'validation/invalid-product',
                message: 'Datos del producto inválidos',
                errors: validationErrors
            };
        }
        
        const now = new Date().toISOString();
        
        // Generar ID único si no se proporciona
        const productId = producto.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        
        const productoCompleto = {
            // 🔧 CORRECCIÓN: Solo agregar campo nombre si es diferente del ID
            ...(producto.nombre && producto.nombre !== productId ? { nombre: producto.nombre.trim() } : {}),
            precio: parseFloat(producto.precio),
            cantidad: parseInt(producto.cantidad),
            categoria: producto.categoria.trim(),
            descripcion: producto.descripcion?.trim() || '',
            codigoBarras: producto.codigoBarras?.trim() || '',
            fechaCreacion: now,
            fechaActualizacion: now
        };
        
        const docRef = doc(db, "inventario", productId);
        await setDoc(docRef, productoCompleto);
        
        // Invalidar caché
        inventarioCache = [];
        lastFetchTime = 0;
        
        console.log(`✅ Producto agregado: ${productId}`);
        
        return {
            success: true,
            productId,
            message: 'Producto agregado correctamente'
        };
        
    } catch (error) {
        console.error('❌ Error agregando producto:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'inventory/add-error',
            message: 'Error al agregar el producto',
            originalError: error
        };
    }
}

/**
 * Actualiza un producto existente
 * @param {string} productId - ID del producto
 * @param {Object} datosActualizacion - Datos a actualizar
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function actualizarProducto(productId, datosActualizacion) {
    try {
        // Verificar que el producto existe
        const productoExistente = await buscarProductoPorId(productId);
        if (!productoExistente) {
            throw {
                code: 'inventory/product-not-found',
                message: 'Producto no encontrado'
            };
        }
        
        const datosLimpios = {
            ...datosActualizacion,
            fechaActualizacion: new Date().toISOString()
        };
        
        // Validar datos si se proporcionan campos críticos
        if (datosActualizacion.precio !== undefined) {
            datosLimpios.precio = parseFloat(datosActualizacion.precio);
        }
        if (datosActualizacion.cantidad !== undefined) {
            datosLimpios.cantidad = parseInt(datosActualizacion.cantidad);
        }
        
        const docRef = doc(db, "inventario", productId);
        await updateDoc(docRef, datosLimpios);
        
        // Invalidar caché
        inventarioCache = [];
        lastFetchTime = 0;
        
        console.log(`✅ Producto actualizado: ${productId}`);
        
        return {
            success: true,
            productId,
            message: 'Producto actualizado correctamente'
        };
        
    } catch (error) {
        console.error('❌ Error actualizando producto:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'inventory/update-error',
            message: 'Error al actualizar el producto',
            originalError: error
        };
    }
}

/**
 * Actualiza el stock de un producto (para ventas)
 * @param {string} productId - ID del producto
 * @param {number} cantidadVendida - Cantidad vendida (se resta del stock)
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function actualizarStock(productId, cantidadVendida) {
    try {
        const disponibilidad = await verificarDisponibilidad(productId, cantidadVendida);
        
        if (!disponibilidad.disponible) {
            throw {
                code: 'inventory/insufficient-stock',
                message: `Stock insuficiente. Disponible: ${disponibilidad.cantidadDisponible}, Solicitado: ${cantidadVendida}`,
                cantidadDisponible: disponibilidad.cantidadDisponible
            };
        }
        
        const nuevaCantidad = disponibilidad.cantidadDisponible - cantidadVendida;
        
        await actualizarProducto(productId, { cantidad: nuevaCantidad });
        
        console.log(`📦 Stock actualizado: ${productId} - Nueva cantidad: ${nuevaCantidad}`);
        
        return {
            success: true,
            productId,
            cantidadAnterior: disponibilidad.cantidadDisponible,
            cantidadNueva: nuevaCantidad,
            cantidadVendida,
            message: 'Stock actualizado correctamente'
        };
        
    } catch (error) {
        console.error('❌ Error actualizando stock:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'inventory/stock-update-error',
            message: 'Error al actualizar el stock',
            originalError: error
        };
    }
}

// === FUNCIONES DE IMPORTACIÓN/EXPORTACIÓN EXCEL ===

/**
 * Exporta el inventario a un archivo Excel
 * @param {Array} productos - Productos a exportar (opcional, usa inventario completo si no se proporciona)
 * @returns {Promise<void>}
 */
export async function exportarInventarioExcel(productos = null) {
    try {
        const inventario = productos || await obtenerInventario();
        
        if (inventario.length === 0) {
            throw {
                code: 'inventory/empty-inventory',
                message: 'No hay productos para exportar'
            };
        }
        
        // Preparar datos para Excel
        const datosExcel = inventario.map(producto => ({
            'ID': producto.id,
            'Nombre': producto.nombre, // Ahora mostrará el ID como nombre
            'Precio': producto.precio,
            'Cantidad': producto.cantidad,
            'Categoría': producto.categoria,
            'Descripción': producto.descripcion,
            'Código de Barras': producto.codigoBarras,
            'Fecha Creación': producto.fechaCreacion,
            'Fecha Actualización': producto.fechaActualizacion
        }));
        
        // Crear libro de Excel
        const ws = XLSX.utils.json_to_sheet(datosExcel);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Inventario");
        
        // Descargar archivo
        const nombreArchivo = `inventario_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, nombreArchivo);
        
        console.log(`📊 Inventario exportado: ${nombreArchivo}`);
        
        return {
            success: true,
            fileName: nombreArchivo,
            recordsExported: inventario.length,
            message: 'Inventario exportado correctamente'
        };
        
    } catch (error) {
        console.error('❌ Error exportando inventario:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'inventory/export-error',
            message: 'Error al exportar el inventario',
            originalError: error
        };
    }
}

/**
 * Importa productos desde un archivo Excel
 * @param {File} file - Archivo Excel
 * @returns {Promise<Object>} Resultado de la importación
 */
export async function importarInventarioDesdeExcel(file) {
    try {
        if (!file) {
            throw {
                code: 'validation/no-file',
                message: 'No se proporcionó ningún archivo'
            };
        }
        
        if (!file.name.toLowerCase().includes('.xlsx') && !file.name.toLowerCase().includes('.xls')) {
            throw {
                code: 'validation/invalid-file-type',
                message: 'Tipo de archivo inválido. Solo se permiten archivos Excel (.xlsx, .xls)'
            };
        }
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // Leer primera hoja
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);
                    
                    if (jsonData.length === 0) {
                        throw {
                            code: 'validation/empty-file',
                            message: 'El archivo Excel está vacío'
                        };
                    }
                    
                    // Procesar y validar productos
                    const resultados = {
                        exitosos: 0,
                        fallidos: 0,
                        errores: []
                    };
                    
                    for (let i = 0; i < jsonData.length; i++) {
                        const fila = jsonData[i];
                        
                        try {
                            const producto = {
                                id: fila['ID'] || `imported_${Date.now()}_${i}`,
                                nombre: fila['Nombre'], // Puede ser undefined, se usará el ID
                                precio: parseFloat(fila['Precio']) || 0,
                                cantidad: parseInt(fila['Cantidad']) || 0,
                                categoria: fila['Categoría'] || 'Importado',
                                descripcion: fila['Descripción'] || '',
                                codigoBarras: fila['Código de Barras'] || ''
                            };
                            
                            await agregarProducto(producto);
                            resultados.exitosos++;
                            
                        } catch (error) {
                            resultados.fallidos++;
                            resultados.errores.push({
                                fila: i + 1,
                                error: error.message || 'Error desconocido'
                            });
                        }
                    }
                    
                    console.log(`📥 Importación completada: ${resultados.exitosos} exitosos, ${resultados.fallidos} fallidos`);
                    
                    resolve({
                        success: true,
                        totalRows: jsonData.length,
                        ...resultados,
                        message: `Importación completada: ${resultados.exitosos}/${jsonData.length} productos importados`
                    });
                    
                } catch (error) {
                    reject({
                        code: 'inventory/import-error',
                        message: 'Error procesando el archivo Excel',
                        originalError: error
                    });
                }
            };
            
            reader.onerror = () => {
                reject({
                    code: 'file/read-error',
                    message: 'Error leyendo el archivo'
                });
            };
            
            reader.readAsArrayBuffer(file);
        });
        
    } catch (error) {
        console.error('❌ Error importando inventario:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'inventory/import-error',
            message: 'Error al importar el inventario',
            originalError: error
        };
    }
}

// === FUNCIONES DE UTILIDAD ===

/**
 * Invalida el caché del inventario
 */
export function invalidarCache() {
    inventarioCache = [];
    lastFetchTime = 0;
    console.log('🗑️ Caché de inventario invalidado');
}

/**
 * Obtiene estadísticas del inventario
 * @returns {Promise<Object>} Estadísticas del inventario
 */
export async function obtenerEstadisticasInventario() {
    try {
        const inventario = await obtenerInventario();
        
        const estadisticas = {
            totalProductos: inventario.length,
            totalValor: inventario.reduce((sum, p) => sum + (p.precio * p.cantidad), 0),
            totalUnidades: inventario.reduce((sum, p) => sum + p.cantidad, 0),
            categorias: await obtenerCategorias(),
            productosAgotados: inventario.filter(p => p.cantidad === 0).length,
            productosStockBajo: inventario.filter(p => p.cantidad > 0 && p.cantidad < 10).length
        };
        
        return estadisticas;
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        throw {
            code: 'inventory/stats-error',
            message: 'Error al obtener estadísticas del inventario',
            originalError: error
        };
    }
}

// === FUNCIONES DE COMPATIBILIDAD ===
// Mantener nombres originales para compatibilidad con código existente
export async function cargarInventario(filtro = '') {
    console.warn('⚠️ cargarInventario() está deprecada, usa obtenerInventario() y filtrarInventario()');
    
    try {
        const productos = await obtenerInventario();
        const productosFiltrados = await filtrarInventario(filtro, productos);
        
        // 🔧 AGREGADO: Funcionalidad de renderizado directo para compatibilidad con HTML original
        const inventarioContainer = document.getElementById("inventarioContainer");
        const resultadoDiv = document.getElementById("resultadoBusqueda1");
        
        let renderTarget = inventarioContainer || resultadoDiv;
        if (!renderTarget) return productosFiltrados;
        
        if (productosFiltrados.length === 0) {
            renderTarget.innerHTML = "<p>No hay resultados para mostrar.</p>";
            return productosFiltrados;
        }
        
        let html = `
            <div class="table-responsive" style="max-height: 220px; overflow-y: auto;">
                <table class="table table-striped table-bordered inventario-fija">
                    <thead>
                        <tr>
                            <th>PRODUCTOS</th>
                            <th>PRECIO</th>
                            <th>CANTIDAD</th>
                            <th>CATEGORÍA</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        productosFiltrados.forEach(producto => {
            html += `
                <tr style="cursor:pointer" onclick="window.agregarProductoAlCarrito('${producto.id}')">
                    <td><strong>${producto.nombre}</strong></td>
                    <td>$${(producto.precio || 0).toLocaleString()}</td>
                    <td>${producto.cantidad || 0}</td>
                    <td>${producto.categoria}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        renderTarget.innerHTML = html;
        return productosFiltrados;
        
    } catch (error) {
        console.error('❌ Error en cargarInventario:', error);
        
        const inventarioContainer = document.getElementById("inventarioContainer");
        const resultadoDiv = document.getElementById("resultadoBusqueda1");
        let renderTarget = inventarioContainer || resultadoDiv;
        
        if (renderTarget) {
            renderTarget.innerHTML = "<p>Error al cargar el inventario.</p>";
        }
        
        return [];
    }
}

// === LOGGING DE DEBUG (SOLO EN DESARROLLO) ===
if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    console.group('📦 Inventory Module Debug Info');
    console.log('DB instance:', db);
    console.log('Cache duration:', CACHE_DURATION, 'ms');
    console.log('XLSX library:', typeof XLSX !== 'undefined' ? 'Loaded' : 'Not loaded');
    console.groupEnd();
}