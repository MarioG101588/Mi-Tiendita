// config-desarrollo.js
// Configuración específica para desarrollo local

// Función para configurar el entorno de desarrollo
export function configurarDesarrollo() {
    // Detectar si estamos en desarrollo local
    const esDesarrollo = location.hostname === 'localhost' || 
                        location.hostname === '127.0.0.1' || 
                        location.hostname.includes('192.168.');

    if (esDesarrollo) {
        console.log('🔧 Configurando entorno de desarrollo...');
        
        // Suprimir errores de políticas de permisos en desarrollo
        const originalConsoleWarn = console.warn;
        console.warn = function(...args) {
            const mensaje = args.join(' ');
            if (mensaje.includes('Permissions policy violation') || 
                mensaje.includes('unload is not allowed')) {
                // Suprimir este error específico en desarrollo
                return;
            }
            originalConsoleWarn.apply(console, args);
        };

        // Configurar políticas de permisos para desarrollo
        if (document.head) {
            const meta = document.createElement('meta');
            meta.httpEquiv = 'Permissions-Policy';
            meta.content = 'unload=()';
            document.head.appendChild(meta);
        }

        // Información de desarrollo
        console.log('ℹ️ Dominio actual:', location.hostname);
        console.log('ℹ️ Puerto:', location.port);
        console.log('ℹ️ Protocolo:', location.protocol);
    }

    return esDesarrollo;
}

// Función para mostrar información del entorno
export function mostrarInfoEntorno() {
    const info = {
        dominio: location.hostname,
        puerto: location.port,
        protocolo: location.protocol,
        url: location.href,
        userAgent: navigator.userAgent.substring(0, 50) + '...'
    };
    
    console.table(info);
    return info;
}
