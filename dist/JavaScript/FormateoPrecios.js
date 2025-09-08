// FormateoPrecios.js - Módulo centralizado para formateo de precios
// Versión: 1.0.0
// Propósito: Centralizar el formateo de moneda en todo el proyecto

/**
 * Formatea un número como precio en pesos colombianos
 * @param {number|string} precio - El precio a formatear
 * @param {boolean} incluirSimbolo - Si incluir el símbolo $ (por defecto true)
 * @returns {string} - Precio formateado como "$ 20.000"
 */
export function formatearPrecio(precio, incluirSimbolo = true) {
    // Convertir a número si es string
    const numero = typeof precio === 'string' ? parseFloat(precio) : precio;
    
    // Validar que sea un número válido
    if (isNaN(numero)) {
        return incluirSimbolo ? '$ 0' : '0';
    }
    
    // Formatear con separadores de miles y sin decimales
    const precioFormateado = new Intl.NumberFormat('es-CO', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        useGrouping: true
    }).format(numero);
    
    // Retornar con o sin símbolo según se requiera
    return incluirSimbolo ? `$ ${precioFormateado}` : precioFormateado;
}

/**
 * Formatea múltiples precios en un objeto
 * @param {Object} objeto - Objeto con propiedades que contienen precios
 * @param {Array} campos - Array con nombres de campos a formatear
 * @returns {Object} - Objeto con campos formateados
 */
export function formatearPreciosObjeto(objeto, campos) {
    const objetoFormateado = { ...objeto };
    
    campos.forEach(campo => {
        if (objetoFormateado[campo] !== undefined) {
            objetoFormateado[campo] = formatearPrecio(objetoFormateado[campo]);
        }
    });
    
    return objetoFormateado;
}

/**
 * Extrae el valor numérico de un precio formateado
 * @param {string} precioFormateado - Precio en formato "$ 20.000"
 * @returns {number} - Valor numérico del precio
 */
export function extraerValorPrecio(precioFormateado) {
    if (typeof precioFormateado !== 'string') {
        return parseFloat(precioFormateado) || 0;
    }
    
    // Remover símbolo $ y espacios, luego convertir puntos a vacío
    const numeroLimpio = precioFormateado
        .replace(/[$\s]/g, '')
        .replace(/\./g, '')
        .replace(/,/g, '.');
    
    return parseFloat(numeroLimpio) || 0;
}

/**
 * Valida si un string es un precio válido
 * @param {string} precio - String a validar
 * @returns {boolean} - True si es un precio válido
 */
export function esPrecionValido(precio) {
    const numero = extraerValorPrecio(precio);
    return !isNaN(numero) && numero >= 0;
}

// Configuración global para el proyecto
export const CONFIGURACION_PRECIOS = {
    simbolo: '$',
    separadorMiles: '.',
    locale: 'es-CO',
    decimales: 0
};

// Función de compatibilidad con el formato anterior
export function migrarFormatoAnterior(precioAnterior) {
    // Para precios que vengan en formato "20.000,00" o "$ 20.000,00"
    if (typeof precioAnterior === 'string') {
        const numeroLimpio = precioAnterior
            .replace(/[$\s]/g, '')
            .replace(/\./g, '')
            .replace(/,\d{2}$/, ''); // Remover ,00 al final
        
        return formatearPrecio(parseFloat(numeroLimpio));
    }
    
    return formatearPrecio(precioAnterior);
}

console.log('📊 Módulo FormateoPrecios cargado - Formato: "$ 20.000"');
