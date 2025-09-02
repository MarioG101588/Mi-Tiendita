// === ESTADO INTERNO DEL MÓDULO ===
let recognition = null;
let isListening = false;
let isSupported = false;
let currentConfig = {
    language: 'es-ES',
    continuous: false,
    interimResults: true,
    maxAlternatives: 1,
    timeout: 10000 // 10 segundos
};

// === CONSTANTES ===
const EVENTOS_VOZ = {
    INICIO: 'voz_inicio',
    RESULTADO: 'voz_resultado',
    ERROR: 'voz_error',
    FIN: 'voz_fin',
    DISPONIBLE: 'voz_disponible',
    NO_DISPONIBLE: 'voz_no_disponible'
};

const ERRORES_VOZ = {
    NO_SPEECH: 'no-speech',
    ABORTED: 'aborted',
    AUDIO_CAPTURE: 'audio-capture',
    NETWORK: 'network',
    NOT_ALLOWED: 'not-allowed',
    SERVICE_NOT_ALLOWED: 'service-not-allowed',
    BAD_GRAMMAR: 'bad-grammar',
    LANGUAGE_NOT_SUPPORTED: 'language-not-supported',
    NO_SUPPORT: 'no-support',
    TIMEOUT: 'timeout'
};

const MENSAJES_ERROR = {
    [ERRORES_VOZ.NO_SPEECH]: 'No se detectó ningún sonido. Inténtalo de nuevo.',
    [ERRORES_VOZ.ABORTED]: 'Reconocimiento de voz cancelado.',
    [ERRORES_VOZ.AUDIO_CAPTURE]: 'No se pudo acceder al micrófono.',
    [ERRORES_VOZ.NETWORK]: 'Error de conexión de red.',
    [ERRORES_VOZ.NOT_ALLOWED]: 'Micrófono bloqueado. Permite el acceso para usar esta función.',
    [ERRORES_VOZ.SERVICE_NOT_ALLOWED]: 'Servicio de reconocimiento de voz no permitido.',
    [ERRORES_VOZ.BAD_GRAMMAR]: 'Error en la configuración de gramática.',
    [ERRORES_VOZ.LANGUAGE_NOT_SUPPORTED]: 'Idioma no soportado.',
    [ERRORES_VOZ.NO_SUPPORT]: 'Tu navegador no soporta reconocimiento de voz.',
    [ERRORES_VOZ.TIMEOUT]: 'Tiempo de espera agotado. Inténtalo de nuevo.'
};

// === SISTEMA DE EVENTOS ===
const eventListeners = new Map();

/**
 * Suscribe a eventos de reconocimiento de voz
 * @param {string} evento - Nombre del evento
 * @param {Function} callback - Función a ejecutar
 * @returns {Function} Función para desuscribirse
 */
export function suscribirEventoVoz(evento, callback) {
    if (!eventListeners.has(evento)) {
        eventListeners.set(evento, new Set());
    }
    
    eventListeners.get(evento).add(callback);
    
    // Retornar función para desuscribirse
    return () => {
        const listeners = eventListeners.get(evento);
        if (listeners) {
            listeners.delete(callback);
        }
    };
}

function emitirEvento(evento, data) {
    const listeners = eventListeners.get(evento);
    if (listeners) {
        listeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`❌ Error en listener de evento ${evento}:`, error);
            }
        });
    }
}

// === FUNCIONES DE DETECCIÓN Y CONFIGURACIÓN ===

/**
 * Verifica si el navegador soporta reconocimiento de voz
 * @returns {boolean} True si está soportado
 */
export function esReconocimientoVozSoportado() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    return !!SpeechRecognition && typeof SpeechRecognition === 'function';
}

/**
 * Verifica si hay permisos de micrófono
 * @returns {Promise<boolean>} True si hay permisos
 */
export async function verificarPermisosMicrofono() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return false;
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Cerrar el stream inmediatamente
        stream.getTracks().forEach(track => track.stop());
        
        return true;
        
    } catch (error) {
        console.warn('⚠️ Sin permisos de micrófono:', error.name);
        return false;
    }
}

/**
 * Inicializa el reconocimiento de voz
 * @param {Object} config - Configuración opcional
 * @returns {Promise<Object>} Resultado de la inicialización
 */
export async function inicializarReconocimientoVoz(config = {}) {
    try {
        // Verificar soporte del navegador
        if (!esReconocimientoVozSoportado()) {
            isSupported = false;
            const resultado = {
                success: false,
                supported: false,
                error: ERRORES_VOZ.NO_SUPPORT,
                message: MENSAJES_ERROR[ERRORES_VOZ.NO_SUPPORT]
            };
            
            emitirEvento(EVENTOS_VOZ.NO_DISPONIBLE, resultado);
            return resultado;
        }
        
        // Verificar permisos de micrófono
        const tienePermisos = await verificarPermisosMicrofono();
        if (!tienePermisos) {
            console.warn('⚠️ Sin permisos de micrófono, el usuario deberá otorgarlos al usar la función');
        }
        
        // Aplicar configuración personalizada
        currentConfig = { ...currentConfig, ...config };
        
        // Crear instancia de reconocimiento
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        
        // Configurar propiedades
        recognition.continuous = currentConfig.continuous;
        recognition.interimResults = currentConfig.interimResults;
        recognition.lang = currentConfig.language;
        recognition.maxAlternatives = currentConfig.maxAlternatives;
        
        // Configurar eventos del reconocimiento
        configurarEventosReconocimiento();
        
        isSupported = true;
        
        const resultado = {
            success: true,
            supported: true,
            config: { ...currentConfig },
            hasPermissions: tienePermisos,
            message: 'Reconocimiento de voz inicializado correctamente'
        };
        
        console.log('🎤 Reconocimiento de voz inicializado');
        emitirEvento(EVENTOS_VOZ.DISPONIBLE, resultado);
        
        return resultado;
        
    } catch (error) {
        console.error('❌ Error inicializando reconocimiento de voz:', error);
        
        isSupported = false;
        const resultado = {
            success: false,
            supported: false,
            error: 'initialization-error',
            message: 'Error al inicializar el reconocimiento de voz',
            originalError: error
        };
        
        emitirEvento(EVENTOS_VOZ.ERROR, resultado);
        return resultado;
    }
}

function configurarEventosReconocimiento() {
    if (!recognition) return;
    
    let timeoutId = null;
    
    recognition.onstart = () => {
        isListening = true;
        console.log('🎤 Reconocimiento de voz iniciado');
        
        // Configurar timeout
        if (currentConfig.timeout > 0) {
            timeoutId = setTimeout(() => {
                if (isListening) {
                    detenerReconocimiento();
                    emitirEvento(EVENTOS_VOZ.ERROR, {
                        error: ERRORES_VOZ.TIMEOUT,
                        message: MENSAJES_ERROR[ERRORES_VOZ.TIMEOUT]
                    });
                }
            }, currentConfig.timeout);
        }
        
        emitirEvento(EVENTOS_VOZ.INICIO, { 
            timestamp: Date.now(),
            config: { ...currentConfig }
        });
    };
    
    recognition.onresult = (event) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        
        let transcript = '';
        let confidence = 0;
        let isFinal = false;
        
        // Procesar todos los resultados
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            transcript += result[0].transcript;
            confidence = Math.max(confidence, result[0].confidence || 0);
            
            if (result.isFinal) {
                isFinal = true;
            }
        }
        
        const resultado = {
            transcript: transcript.trim(),
            confidence,
            isFinal,
            timestamp: Date.now()
        };
        
        console.log(`🎤 ${isFinal ? 'Resultado final' : 'Resultado parcial'}: "${transcript}" (${Math.round(confidence * 100)}%)`);
        
        emitirEvento(EVENTOS_VOZ.RESULTADO, resultado);
    };
    
    recognition.onerror = (event) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        
        isListening = false;
        
        const errorCode = mapearErrorVoz(event.error);
        const resultado = {
            error: errorCode,
            message: MENSAJES_ERROR[errorCode] || 'Error desconocido en el reconocimiento de voz',
            originalError: event.error,
            timestamp: Date.now()
        };
        
        console.error('❌ Error en reconocimiento de voz:', resultado);
        emitirEvento(EVENTOS_VOZ.ERROR, resultado);
    };
    
    recognition.onend = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        
        isListening = false;
        console.log('🎤 Reconocimiento de voz finalizado');
        
        emitirEvento(EVENTOS_VOZ.FIN, { 
            timestamp: Date.now() 
        });
    };
}

function mapearErrorVoz(error) {
    const errorMap = {
        'no-speech': ERRORES_VOZ.NO_SPEECH,
        'aborted': ERRORES_VOZ.ABORTED,
        'audio-capture': ERRORES_VOZ.AUDIO_CAPTURE,
        'network': ERRORES_VOZ.NETWORK,
        'not-allowed': ERRORES_VOZ.NOT_ALLOWED,
        'service-not-allowed': ERRORES_VOZ.SERVICE_NOT_ALLOWED,
        'bad-grammar': ERRORES_VOZ.BAD_GRAMMAR,
        'language-not-supported': ERRORES_VOZ.LANGUAGE_NOT_SUPPORTED
    };
    
    return errorMap[error] || error;
}

// === FUNCIONES PRINCIPALES ===

/**
 * Inicia el reconocimiento de voz
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function iniciarReconocimiento() {
    try {
        if (!isSupported) {
            throw {
                code: 'voice/not-supported',
                message: 'Reconocimiento de voz no soportado'
            };
        }
        
        if (!recognition) {
            throw {
                code: 'voice/not-initialized',
                message: 'Reconocimiento de voz no inicializado'
            };
        }
        
        if (isListening) {
            throw {
                code: 'voice/already-listening',
                message: 'El reconocimiento de voz ya está activo'
            };
        }
        
        recognition.start();
        
        return {
            success: true,
            message: 'Reconocimiento de voz iniciado'
        };
        
    } catch (error) {
        console.error('❌ Error iniciando reconocimiento:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'voice/start-error',
            message: 'Error al iniciar el reconocimiento de voz',
            originalError: error
        };
    }
}

/**
 * Detiene el reconocimiento de voz
 * @returns {Object} Resultado de la operación
 */
export function detenerReconocimiento() {
    try {
        if (!isSupported || !recognition) {
            return {
                success: false,
                message: 'Reconocimiento de voz no disponible'
            };
        }
        
        if (!isListening) {
            return {
                success: false,
                message: 'El reconocimiento de voz no está activo'
            };
        }
        
        recognition.stop();
        
        return {
            success: true,
            message: 'Reconocimiento de voz detenido'
        };
        
    } catch (error) {
        console.error('❌ Error deteniendo reconocimiento:', error);
        return {
            success: false,
            message: 'Error al detener el reconocimiento de voz',
            error
        };
    }
}

/**
 * Cancela el reconocimiento de voz
 * @returns {Object} Resultado de la operación
 */
export function cancelarReconocimiento() {
    try {
        if (!isSupported || !recognition) {
            return {
                success: false,
                message: 'Reconocimiento de voz no disponible'
            };
        }
        
        if (!isListening) {
            return {
                success: false,
                message: 'El reconocimiento de voz no está activo'
            };
        }
        
        recognition.abort();
        
        return {
            success: true,
            message: 'Reconocimiento de voz cancelado'
        };
        
    } catch (error) {
        console.error('❌ Error cancelando reconocimiento:', error);
        return {
            success: false,
            message: 'Error al cancelar el reconocimiento de voz',
            error
        };
    }
}

// === FUNCIONES DE CONSULTA ===

/**
 * Obtiene el estado actual del reconocimiento de voz
 * @returns {Object} Estado actual
 */
export function obtenerEstadoVoz() {
    return {
        isSupported,
        isListening,
        isInitialized: !!recognition,
        config: { ...currentConfig }
    };
}

/**
 * Verifica si está escuchando actualmente
 * @returns {boolean} True si está escuchando
 */
export function estaEscuchando() {
    return isListening;
}

/**
 * Verifica si el reconocimiento de voz está disponible
 * @returns {boolean} True si está disponible
 */
export function estaDisponible() {
    return isSupported && !!recognition;
}

// === FUNCIONES DE CONFIGURACIÓN ===

/**
 * Actualiza la configuración del reconocimiento de voz
 * @param {Object} nuevaConfig - Nueva configuración
 * @returns {Object} Configuración actualizada
 */
export function actualizarConfiguracion(nuevaConfig) {
    const configAnterior = { ...currentConfig };
    currentConfig = { ...currentConfig, ...nuevaConfig };
    
    // Aplicar configuración si hay una instancia activa
    if (recognition) {
        recognition.continuous = currentConfig.continuous;
        recognition.interimResults = currentConfig.interimResults;
        recognition.lang = currentConfig.language;
        recognition.maxAlternatives = currentConfig.maxAlternatives;
    }
    
    console.log('🔧 Configuración de voz actualizada');
    
    return {
        configAnterior,
        configNueva: { ...currentConfig },
        cambios: Object.keys(nuevaConfig)
    };
}

/**
 * Obtiene la configuración actual
 * @returns {Object} Configuración actual
 */
export function obtenerConfiguracion() {
    return { ...currentConfig };
}

// === FUNCIONES DE UTILIDAD PARA BÚSQUEDA ===

/**
 * Procesa texto de voz para búsqueda (MEJORADO para caracteres especiales)
 * @param {string} transcript - Texto transcrito
 * @returns {Object} Texto procesado para búsqueda
 */
export function procesarTextoParaBusqueda(transcript) {
    if (!transcript || typeof transcript !== 'string') {
        return {
            original: '',
            procesado: '',
            palabras: [],
            esValido: false
        };
    }
      
    // 🔧 MEJORADO: Normalizar texto con mapeo de caracteres especiales para voz
    let textoNormalizado = transcript
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // Remover tildes
    
    // 🔧 NUEVO: Mapeo de palabras comúnmente mal interpretadas por reconocimiento de voz
    const mapeoVoz = {
        // Símbolos convertidos a palabras
        '&': ' y ',
        '+': ' mas ',
        '@': ' arroba ',
        '%': ' por ciento ',
        '#': ' numero ',
        '$': ' peso ',
        '°': ' grado ',
        
        // Correcciones de pronunciación comunes
        'cola': 'pola', // También funciona al revés
        'pola': 'cola', // Para que "cola pola" encuentre "Pola & Pola"
        'and': 'y',
        'i': 'y', // Cuando se confunde "y" con "i"
        'e': 'y'  // Cuando se confunde "y" con "e"
    };
    
    // Aplicar mapeos de símbolos
    Object.keys(mapeoVoz).forEach(simbolo => {
        if (simbolo.length === 1 && /[^\w\s]/.test(simbolo)) { // Solo símbolos
            const variante = mapeoVoz[simbolo];
            textoNormalizado = textoNormalizado.replace(new RegExp(`\\${simbolo}`, 'g'), variante);
        }
    });
    
    // Limpiar caracteres especiales restantes
    textoNormalizado = textoNormalizado
        .replace(/[^\w\s]/g, ' ') // Remover caracteres especiales restantes
        .replace(/\s+/g, ' ') // Normalizar espacios múltiples
        .trim();
    
    // 🔧 NUEVO: Generar variaciones para búsqueda
    const variaciones = [];
    
    // Variación original
    variaciones.push(textoNormalizado);
    
    // Aplicar correcciones de pronunciación
    let textoConVariaciones = textoNormalizado;
    Object.keys(mapeoVoz).forEach(palabra => {
        if (palabra.length > 1) { // Solo palabras, no símbolos
            const variante = mapeoVoz[palabra];
            if (textoConVariaciones.includes(palabra)) {
                const nuevaVariacion = textoConVariaciones.replace(new RegExp(palabra, 'g'), variante);
                if (nuevaVariacion !== textoConVariaciones) {
                    variaciones.push(nuevaVariacion);
                }
            }
        }
    });

    // Agregar variaciones generadas
    variaciones.push(textoConVariaciones);

    const palabras = textoNormalizado.split(' ').filter(p => p.length > 0);
    
    return {
        original: transcript,
        procesado: textoNormalizado,
        variaciones: [...new Set(variaciones)], // 🔧 NUEVO: Lista de variaciones
        palabras,
        esValido: palabras.length > 0 && textoNormalizado.length >= 2
    };
}

// === FUNCIÓN INTEGRADA DE BÚSQUEDA POR VOZ ===

/**
 * Inicia una búsqueda por voz con callback personalizado
 * @param {Function} onResultado - Callback para manejar resultados
 * @param {Object} opciones - Opciones de búsqueda
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function iniciarBusquedaPorVoz(onResultado, opciones = {}) {
    try {
        if (typeof onResultado !== 'function') {
            throw {
                code: 'voice/invalid-callback',
                message: 'Se requiere una función callback para manejar los resultados'
            };
        }
        
        // Configurar opciones específicas para búsqueda
        const configBusqueda = {
            continuous: false,
            interimResults: true,
            timeout: opciones.timeout || 8000,
            ...opciones.config
        };
        
        // Actualizar configuración temporalmente
        const configOriginal = { ...currentConfig };
        actualizarConfiguracion(configBusqueda);
        
         // Suscribirse a eventos de resultados
        const unsuscribirResultado = suscribirEventoVoz(EVENTOS_VOZ.RESULTADO, async (data) => {
            const comandos = extraerComandosVoz(data.transcript);
            
            // 🔧 NUEVO: Si es resultado final, intentar búsqueda en inventario
            let resultadoInventario = null;
            if (data.isFinal && comandos.textoBusqueda) {
                try {
                    // Importar función de búsqueda dinámicamente
                    const { buscarPorVoz } = await import('./Inventario.js');
                    const productos = await buscarPorVoz(comandos.textoBusqueda);
                    
                    resultadoInventario = {
                        productos,
                        totalEncontrados: productos.length,
                        textoBusquedaUsado: comandos.textoBusqueda
                    };
                } catch (error) {
                    console.warn('⚠️ Error en búsqueda de inventario:', error);
                }
            }
            
            onResultado({
                ...data,
                ...comandos,
                esComando: comandos.hayComandos,
                inventario: resultadoInventario // 🔧 NUEVO: Agregar resultados de inventario
            });
        });
        
        const unsuscribirError = suscribirEventoVoz(EVENTOS_VOZ.ERROR, (error) => {
            // Restaurar configuración original
            actualizarConfiguracion(configOriginal);
            unsuscribirResultado();
            unsuscribirError();
        });
        
        const unsuscribirFin = suscribirEventoVoz(EVENTOS_VOZ.FIN, () => {
            // Restaurar configuración original
            actualizarConfiguracion(configOriginal);
            unsuscribirResultado();
            unsuscribirError();
            unsuscribirFin();
        });
        
        // Iniciar reconocimiento
        const resultado = await iniciarReconocimiento();
        
        return {
            ...resultado,
            config: configBusqueda,
            callbacks: {
                unsuscribirResultado,
                unsuscribirError,
                unsuscribirFin
            }
        };
        
    } catch (error) {
        console.error('❌ Error iniciando búsqueda por voz:', error);
        
        if (error.code) {
            throw error;
        }
        
        throw {
            code: 'voice/search-error',
            message: 'Error al iniciar búsqueda por voz',
            originalError: error
        };
    }
}

/**
 * Extrae comandos de voz comunes
 * @param {string} transcript - Texto transcrito
 * @returns {Object} Comandos detectados
 */
export function extraerComandosVoz(transcript) {
    const texto = procesarTextoParaBusqueda(transcript);
    
    if (!texto.esValido) {
        return {
            hayComandos: false,
            comandos: [],
            textoBusqueda: ''
        };
    }
    
    const comandos = [];
    let textoBusqueda = texto.procesado;
    
    // Detectar comandos comunes
    const patronesComandos = {
        'buscar': /^(buscar|busca|encuentra|mostrar|ver)\s+(.+)/i,
        'agregar': /^(agregar|agrega|añadir|anadir)\s+(.+)/i,
        'eliminar': /^(eliminar|elimina|quitar|borrar)\s+(.+)/i,
        'cancelar': /^(cancelar|cancela|parar|para|detener|stop)/i,
        'limpiar': /^(limpiar|limpia|borrar todo|vaciar)/i,
        'ayuda': /^(ayuda|help|que puedo decir)/i
    };
    
    for (const [comando, patron] of Object.entries(patronesComandos)) {
        const match = texto.original.match(patron);
        if (match) {
            comandos.push({
                comando,
                parametro: match[2] ? match[2].trim() : null,
                textoCompleto: match[0]
            });
            
            // Para comandos de búsqueda, extraer el término
            if (comando === 'buscar' && match[2]) {
                textoBusqueda = procesarTextoParaBusqueda(match[2]).procesado;
            }
            
            break; // Solo un comando por transcript
        }
    }
    
    // Si no hay comandos específicos, tratar todo como búsqueda
    if (comandos.length === 0) {
        textoBusqueda = texto.procesado;
    }
    
    return {
        hayComandos: comandos.length > 0,
        comandos,
        textoBusqueda,
        textoOriginal: transcript,
        textoProcesado: texto.procesado
    };
}

// === FUNCIONES DE COMPATIBILIDAD ===
// Para mantener compatibilidad con código existente

export async function iniciarBusquedaVoz() {
    console.warn('⚠️ iniciarBusquedaVoz() está deprecada, usa iniciarBusquedaPorVoz()');
    
    return new Promise((resolve, reject) => {
        iniciarBusquedaPorVoz((resultado) => {
            if (resultado.isFinal) {
                resolve({
                    transcript: resultado.textoBusqueda || resultado.transcript,
                    confidence: resultado.confidence,
                    comandos: resultado.comandos
                });
            }
        }).catch(reject);
    });
}

// === INICIALIZACIÓN AUTOMÁTICA ===
// Inicializar automáticamente cuando se carga el módulo
if (typeof document !== 'undefined') {
    // Solo en el navegador
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            const resultado = await inicializarReconocimientoVoz();
            if (resultado.success) {
                console.log('🎤 Buscador de voz listo');
            }
        } catch (error) {
            console.warn('⚠️ Buscador de voz no disponible:', error.message);
        }
    });
}

// === EXPORTACIONES DE CONSTANTES ===
export { EVENTOS_VOZ, ERRORES_VOZ, MENSAJES_ERROR };

// === LOGGING DE DEBUG (SOLO EN DESARROLLO) ===
if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    console.group('🎤 Voice Search Module Debug Info');
    console.log('Speech Recognition supported:', esReconocimientoVozSoportado());
    console.log('Default config:', currentConfig);
    console.log('Available events:', EVENTOS_VOZ);
    console.log('Error codes:', ERRORES_VOZ);
    console.groupEnd();
}