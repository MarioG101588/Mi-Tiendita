// === IMPORTACIONES REQUERIDAS ===
import { inicializarAuth, iniciarSesion, cerrarSesion, observarSesion, getCurrentUser, getRememberedCredentials } from "./Autenticacion.js";
import { obtenerInventario, filtrarInventario } from "./Inventario.js";
import { inicializarCarrito, agregarAlCarrito, obtenerEstadoCarrito, vaciarCarrito, actualizarCantidad, eliminarDelCarrito } from "./CarritoCompras.js";
import { procesarVenta, TIPOS_PAGO } from "./VentasApp.js";
import { obtenerCuentasPendientes, pagarCuenta } from "./Cuentas.js";
import { inicializarReconocimientoVoz, iniciarBusquedaPorVoz } from "./BuscadorVoz.js";

// === ESTADO GLOBAL ===
let inventarioActual = [];
let vistaActual = 'container';
let appReady = false;

// === FUNCIONES DE UTILIDAD ===
function mostrarError(mensaje, elemento = null) {
    console.error('❌', mensaje);
    
    if (elemento) {
        elemento.innerHTML = `<div class="error">${mensaje}</div>`;
    } else {
        // Mostrar en consola o alert como fallback
        if (typeof alert !== 'undefined') {
            alert(`Error: ${mensaje}`);
        }
    }
}

function mostrarCargando(elemento, mensaje = 'Cargando...') {
    if (elemento) {
        elemento.innerHTML = `<div style="text-align: center; padding: 2rem; color: #666;">${mensaje}</div>`;
    }
}

// === FUNCIONES DE NAVEGACIÓN ===
function mostrarContainer(idMostrar) {
    try {
        console.log(`📱 Navegando a: ${idMostrar}`);
        
        // Ocultar todos los contenedores
        const contenedores = ['container', 'container1', 'container2', 'container3', 'container4', 'container5', 'container6'];
        
        contenedores.forEach(id => {
            const elemento = document.getElementById(id);
            if (elemento) {
                elemento.classList.remove('visible');
                elemento.classList.add('hidden');
            }
        });
        
        // Mostrar el contenedor solicitado
        const contenedorDestino = document.getElementById(idMostrar);
        if (contenedorDestino) {
            contenedorDestino.classList.remove('hidden');
            contenedorDestino.classList.add('visible');
            vistaActual = idMostrar;
            
            // Cargar datos específicos según la vista
            setTimeout(() => cargarDatosVista(idMostrar), 100);
        } else {
            console.error(`Contenedor no encontrado: ${idMostrar}`);
        }
        
    } catch (error) {
        console.error('Error en navegación:', error);
    }
}

async function cargarDatosVista(vista) {
    try {
        switch(vista) {
            case 'container1':
                await cargarInventarioVista();
                await renderCarritoVista();
                break;
            case 'container2':
                await cargarCuentasActivasVista();
                break;
            case 'container4':
                await cargarResumenTurnoVista();
                break;
            case 'container6':
                await cargarCuentasPendientesVista();
                break;
        }
    } catch (error) {
        console.error(`Error cargando vista ${vista}:`, error);
    }
}

// === FUNCIONES DE VISTA DE INVENTARIO ===
async function cargarInventarioVista(filtro = '') {
    const container = document.getElementById('inventarioContainer');
    if (!container) return;
    
    try {
        mostrarCargando(container, 'Cargando inventario...');
        
        if (inventarioActual.length === 0) {
            inventarioActual = await obtenerInventario();
        }
        
        const productosFiltrados = filtro ? 
            await filtrarInventario(filtro, inventarioActual) : 
            inventarioActual;
        
        if (productosFiltrados.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">No se encontraron productos.</div>';
            return;
        }
        
        let html = '<div class="productos-grid">';
        
        productosFiltrados.forEach(producto => {
            html += `
                <div class="producto-card" data-id="${producto.id}">
                    <h4>${producto.nombre}</h4>
                    <p class="precio">$${producto.precio.toLocaleString()}</p>
                    <p class="stock">Stock: ${producto.cantidad}</p>
                    <p class="categoria">${producto.categoria || 'Sin categoría'}</p>
                    <button class="btn btn-success" onclick="agregarProductoAlCarrito('${producto.id}')">
                        Agregar al Carrito
                    </button>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        mostrarError('Error al cargar el inventario: ' + error.message, container);
    }
}

// === FUNCIONES DE CARRITO ===
async function renderCarritoVista() {
    const container = document.getElementById('carritoContainer');
    const totalContainer = document.getElementById('totalContainer');
    
    if (!container) return;
    
    try {
        const estadoCarrito = obtenerEstadoCarrito();
        
        if (estadoCarrito.estaVacio) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">No hay productos en el carrito.</div>';
            if (totalContainer) {
                totalContainer.innerHTML = '<div class="resumen-total"><div><strong>Total: $0</strong></div></div>';
            }
            return;
        }
        
        let html = '<div class="carrito-items">';
        
        estadoCarrito.items.forEach(item => {
            html += `
                <div class="carrito-item" data-id="${item.id}">
                    <div class="item-info">
                        <h5>${item.nombre}</h5>
                        <p>$${item.precio.toLocaleString()} x ${item.cantidad}</p>
                    </div>
                    <div class="item-controls">
                        <button class="btn btn-sm" onclick="cambiarCantidadCarrito('${item.id}', -1)">-</button>
                        <span class="cantidad">${item.cantidad}</span>
                        <button class="btn btn-sm" onclick="cambiarCantidadCarrito('${item.id}', 1)">+</button>
                        <button class="btn btn-danger btn-sm" onclick="eliminarDelCarritoVista('${item.id}')">🗑️</button>
                    </div>
                    <div class="item-total">
                        $${item.subtotal.toLocaleString()}
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
        // Actualizar total
        if (totalContainer) {
            totalContainer.innerHTML = `
                <div class="resumen-total">
                    <div>Subtotal: $${estadoCarrito.totales.subtotal.toLocaleString()}</div>
                    <div>IVA (19%): $${estadoCarrito.totales.iva.toLocaleString()}</div>
                    <div class="total-final"><strong>Total: $${estadoCarrito.totales.total.toLocaleString()}</strong></div>
                </div>
            `;
        }
        
    } catch (error) {
        mostrarError('Error al mostrar el carrito: ' + error.message, container);
    }
}

// === FUNCIONES DE CUENTAS ===
async function cargarCuentasActivasVista() {
    const container = document.getElementById('cuentasActivasTurno');
    if (!container) return;
    
    try {
        mostrarCargando(container, 'Cargando cuentas activas...');
        
        // Aquí cargarías las cuentas reales del turno actual
        setTimeout(() => {
            container.innerHTML = `
                <div style="background: #f8f9fa; padding: 1rem; border-radius: 4px; border-left: 4px solid #007bff;">
                    <h4>Cuentas del Turno Actual</h4>
                    <p>No hay cuentas activas en este turno.</p>
                </div>
            `;
        }, 500);
        
    } catch (error) {
        mostrarError('Error al cargar cuentas activas: ' + error.message, container);
    }
}

async function cargarCuentasPendientesVista() {
    const container = document.getElementById('cuentasPendientesContainer');
    if (!container) return;
    
    try {
        mostrarCargando(container, 'Cargando cuentas pendientes...');
        
        const cuentasPendientes = await obtenerCuentasPendientes();
        
        if (cuentasPendientes.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">No hay cuentas pendientes.</div>';
            return;
        }
        
        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Cliente</th>
                        <th>Monto</th>
                        <th>Fecha</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        cuentasPendientes.forEach(cuenta => {
            const fecha = cuenta.fechaCreacion ? 
                new Date(cuenta.fechaCreacion.seconds * 1000).toLocaleDateString() : 
                'N/A';
            
            html += `
                <tr>
                    <td>${cuenta.clienteNombre || 'Cliente'}</td>
                    <td>$${cuenta.saldoPendiente.toLocaleString()}</td>
                    <td>${fecha}</td>
                    <td>${cuenta.estado}</td>
                    <td>
                        <button class="btn btn-success btn-sm" onclick="pagarCuentaVista('${cuenta.id}')">
                            Pagar
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
        
    } catch (error) {
        mostrarError('Error al cargar cuentas pendientes: ' + error.message, container);
    }
}

async function cargarResumenTurnoVista() {
    const container = document.getElementById('resumenTurnoDatos');
    if (!container) return;
    
    try {
        const usuario = getCurrentUser();
        const turnoId = localStorage.getItem('pos_current_turno_id');
        
        container.innerHTML = `
            <div class="resumen-turno">
                <h4>Resumen del Turno</h4>
                <p><strong>Usuario:</strong> ${usuario?.email || 'No definido'}</p>
                <p><strong>Turno ID:</strong> ${turnoId || 'No definido'}</p>
                <p><strong>Inicio:</strong> ${new Date().toLocaleString()}</p>
                <div class="estadisticas">
                    <div class="stat-card">
                        <h5>Ventas Realizadas</h5>
                        <p class="stat-number">0</p>
                    </div>
                    <div class="stat-card">
                        <h5>Total Vendido</h5>
                        <p class="stat-number">$0</p>
                    </div>
                </div>
            </div>
        `;
        
    } catch (error) {
        mostrarError('Error al cargar resumen del turno: ' + error.message, container);
    }
}

// === FUNCIONES DE INTERACCIÓN (GLOBALES) ===
window.mostrarContainer = mostrarContainer;

window.agregarProductoAlCarrito = async function(productId) {
    try {
        const resultado = await agregarAlCarrito(productId, 1);
        if (resultado.success) {
            await renderCarritoVista();
            console.log('✅ Producto agregado al carrito');
        }
    } catch (error) {
        console.error('Error agregando al carrito:', error);
        mostrarError('Error al agregar producto al carrito: ' + error.message);
    }
};

window.cambiarCantidadCarrito = async function(productId, cambio) {
    try {
        const estadoActual = obtenerEstadoCarrito();
        const itemActual = estadoActual.items.find(i => i.id === productId);
        
        if (!itemActual) return;
        
        const nuevaCantidad = itemActual.cantidad + cambio;
        
        if (nuevaCantidad <= 0) {
            window.eliminarDelCarritoVista(productId);
            return;
        }
        
        const resultado = await actualizarCantidad(productId, nuevaCantidad);
        
        if (resultado.success) {
            await renderCarritoVista();
        }
        
    } catch (error) {
        console.error('Error cambiando cantidad:', error);
        mostrarError('Error al cambiar cantidad: ' + error.message);
    }
};

window.eliminarDelCarritoVista = async function(productId) {
    try {
        const resultado = eliminarDelCarrito(productId);
        
        if (resultado.success) {
            await renderCarritoVista();
        }
        
    } catch (error) {
        console.error('Error eliminando del carrito:', error);
        mostrarError('Error al eliminar del carrito: ' + error.message);
    }
};

window.finalizarVentaVista = async function() {
    try {
        const estadoCarrito = obtenerEstadoCarrito();
        
        if (estadoCarrito.estaVacio) {
            mostrarError('El carrito está vacío');
            return;
        }
        
        // Seleccionar tipo de pago
        const tipoPago = prompt('Seleccione método de pago:\n1. Efectivo\n2. Tarjeta\n3. Transferencia', '1');
        
        let tipoSeleccionado;
        switch(tipoPago) {
            case '1': tipoSeleccionado = TIPOS_PAGO.EFECTIVO; break;
            case '2': tipoSeleccionado = TIPOS_PAGO.TARJETA; break;
            case '3': tipoSeleccionado = TIPOS_PAGO.TRANSFERENCIA; break;
            default: tipoSeleccionado = TIPOS_PAGO.EFECTIVO;
        }
        
        const resultado = await procesarVenta(estadoCarrito.items, tipoSeleccionado, {
            total: estadoCarrito.totales.total
        });
        
        if (resultado.success) {
            alert('✅ Venta procesada correctamente');
            vaciarCarrito();
            await renderCarritoVista();
        }
        
    } catch (error) {
        console.error('Error procesando venta:', error);
        mostrarError('Error al procesar la venta: ' + error.message);
    }
};

window.pagarCuentaVista = async function(cuentaId) {
    try {
        const monto = prompt('Ingrese el monto del pago:');
        if (!monto || isNaN(monto)) return;
        
        const resultado = await pagarCuenta(cuentaId, {
            monto: parseFloat(monto),
            metodoPago: 'efectivo'
        });
        
        if (resultado.success) {
            alert('✅ Pago procesado correctamente');
            await cargarCuentasPendientesVista();
        }
        
    } catch (error) {
        console.error('Error procesando pago:', error);
        mostrarError('Error al procesar el pago: ' + error.message);
    }
};

// === INICIALIZACIÓN DE LA APLICACIÓN ===
async function inicializarApp() {
    try {
        console.log('🚀 Iniciando aplicación POS...');
        
        // 1. Inicializar autenticación
        await inicializarAuth();
        
        // 2. Inicializar carrito
        inicializarCarrito();
        
        // 3. Inicializar reconocimiento de voz
        try {
            await inicializarReconocimientoVoz();
            console.log('🎤 Reconocimiento de voz inicializado');
        } catch (error) {
            console.warn('⚠️ Reconocimiento de voz no disponible:', error.message);
        }
        
        appReady = true;
        console.log('✅ Aplicación inicializada correctamente');
        
    } catch (error) {
        console.error('❌ Error inicializando aplicación:', error);
        mostrarError('Error al inicializar la aplicación: ' + error.message);
    }
}

// === CONFIGURACIÓN DE EVENTOS DOM ===
document.addEventListener('DOMContentLoaded', async function() {
    try {
        console.log('🔧 Configurando eventos DOM...');
        
        // Inicializar aplicación
        await inicializarApp();
        
        // Configurar búsqueda
        const campoBusqueda = document.getElementById('campoBusqueda1');
        if (campoBusqueda) {
            campoBusqueda.addEventListener('input', function() {
                const filtro = this.value;
                if (vistaActual === 'container1') {
                    cargarInventarioVista(filtro);
                }
            });
        }
        
        // Configurar búsqueda por voz
        const btnVoz = document.getElementById('btnVozBuscar');
        if (btnVoz) {
            btnVoz.addEventListener('click', async function() {
                try {
                    btnVoz.textContent = '🔴';
                    btnVoz.disabled = true;
                    
                    await iniciarBusquedaPorVoz((resultado) => {
                        if (resultado.isFinal && campoBusqueda) {
                            campoBusqueda.value = resultado.textoBusqueda || resultado.transcript;
                            cargarInventarioVista(campoBusqueda.value);
                        }
                    });
                    
                } catch (error) {
                    console.error('Error con búsqueda por voz:', error);
                    mostrarError('Error en búsqueda por voz: ' + error.message);
                } finally {
                    btnVoz.textContent = '🎤';
                    btnVoz.disabled = false;
                }
            });
        }
        
        // Configurar botones de navegación
        const navButtons = document.querySelectorAll('.nav-button[data-action="show-view"]');
        navButtons.forEach(button => {
            button.addEventListener('click', function() {
                const target = this.getAttribute('data-target');
                if (target) {
                    mostrarContainer(target);
                }
            });
        });
        
        // Configurar botón finalizar venta
        const btnFinalizar = document.getElementById('btnFinalizarVenta');
        if (btnFinalizar) {
            btnFinalizar.addEventListener('click', window.finalizarVentaVista);
        }
        
        // Configurar formulario de login
        const loginButton = document.getElementById('loginButton');
        const loginForm = document.getElementById('loginForm');
        const btnIniciarSesion = document.getElementById('btnIniciarSesion');
        const btnCancelar = document.getElementById('btnCancelar');
        const logoutButton = document.getElementById('logoutButton');
        
        if (loginButton) {
            loginButton.addEventListener('click', function() {
                if (loginForm) {
                    const isHidden = loginForm.classList.contains('hidden');
                    if (isHidden) {
                        loginForm.classList.remove('hidden');
                        this.textContent = 'Cancelar';
                    } else {
                        loginForm.classList.add('hidden');
                        this.textContent = 'Iniciar Sesión';
                    }
                }
            });
        }
        
        if (btnCancelar) {
            btnCancelar.addEventListener('click', function() {
                if (loginForm) {
                    loginForm.classList.add('hidden');
                }
                if (loginButton) {
                    loginButton.textContent = 'Iniciar Sesión';
                }
            });
        }
        
        if (btnIniciarSesion) {
            btnIniciarSesion.addEventListener('click', async function() {
                const email = document.getElementById('emailinicio')?.value;
                const password = document.getElementById('passwordinicio')?.value;
                const recordar = document.getElementById('recordarCheckbox')?.checked;
                
                if (!email || !password) {
                    mostrarError('Por favor complete todos los campos');
                    return;
                }
                
                try {
                    btnIniciarSesion.disabled = true;
                    btnIniciarSesion.textContent = 'Iniciando...';
                    
                    const resultado = await iniciarSesion(email, password, recordar);
                    
                    if (resultado.success) {
                        mostrarContainer('container1');
                        if (loginForm) loginForm.classList.add('hidden');
                        if (loginButton) loginButton.textContent = 'Iniciar Sesión';
                    }
                    
                } catch (error) {
                    console.error('Error en login:', error);
                    mostrarError('Error al iniciar sesión: ' + error.message);
                } finally {
                    btnIniciarSesion.disabled = false;
                    btnIniciarSesion.textContent = 'Iniciar Sesión';
                }
            });
        }
        
        if (logoutButton) {
            logoutButton.addEventListener('click', async function() {
                try {
                    if (confirm('¿Está seguro que desea cerrar sesión?')) {
                        const resultado = await cerrarSesion();
                        if (resultado.success) {
                            mostrarContainer('container');
                        }
                    }
                } catch (error) {
                    console.error('Error cerrando sesión:', error);
                    mostrarError('Error al cerrar sesión: ' + error.message);
                }
            });
        }
        
        // Restaurar credenciales si están guardadas
        try {
            const credenciales = getRememberedCredentials();
            if (credenciales.recordar) {
                const emailInput = document.getElementById('emailinicio');
                const recordarCheckbox = document.getElementById('recordarCheckbox');
                
                if (emailInput) emailInput.value = credenciales.email;
                if (recordarCheckbox) recordarCheckbox.checked = true;
            }
        } catch (error) {
            console.warn('Error cargando credenciales guardadas:', error);
        }
        
        // Observar cambios de sesión
        observarSesion((user) => {
            const loginButton = document.getElementById('loginButton');
            const logoutButton = document.getElementById('logoutButton');
            
            if (user) {
                // Usuario logueado
                if (loginButton) loginButton.classList.add('hidden');
                if (logoutButton) logoutButton.classList.remove('hidden');
                
                if (vistaActual === 'container') {
                    mostrarContainer('container1');
                }
            } else {
                // Usuario deslogueado
                if (loginButton) loginButton.classList.remove('hidden');
                if (logoutButton) logoutButton.classList.add('hidden');
                
                mostrarContainer('container');
            }
        });
        
        // Mostrar vista inicial
        mostrarContainer('container');
        
        console.log('✅ Eventos DOM configurados correctamente');
        
    } catch (error) {
        console.error('❌ Error configurando eventos DOM:', error);
        mostrarError('Error al configurar la aplicación: ' + error.message);
    }
});