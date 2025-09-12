import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { db } from "./Conexion.js";

async function sincronizarPreciosDesdeInventario() {
    // 1. Obtener inventario
    const inventarioRef = collection(db, "inventario");
    const inventarioSnap = await getDocs(inventarioRef);
    const inventario = {};
    inventarioSnap.forEach(doc => {
        inventario[doc.id] = doc.data();
    });

    // 2. Obtener cuentas activas
    const cuentasRef = collection(db, "cuentasActivas");
    const cuentasSnap = await getDocs(cuentasRef);

    for (const cuentaDoc of cuentasSnap.docs) {
        const cuenta = cuentaDoc.data();
        let actualizado = false;
        let totalCuenta = 0;

        if (cuenta.productos) {
            for (const [prodKey, prod] of Object.entries(cuenta.productos)) {
                if (inventario[prodKey]) {
                    const nuevoNombre = inventario[prodKey].nombre || prodKey;
                    const nuevoPrecio = inventario[prodKey].precioVenta;
                    const cantidad = prod.cantidad || 0;
                    const nuevoTotal = nuevoPrecio * cantidad;

                    // Solo actualiza si hay cambios
                    if (
                        prod.nombre !== nuevoNombre ||
                        prod.precioVenta !== nuevoPrecio ||
                        prod.total !== nuevoTotal
                    ) {
                        prod.nombre = nuevoNombre;
                        prod.precioVenta = nuevoPrecio;
                        prod.total = nuevoTotal;
                        actualizado = true;
                    }
                    totalCuenta += nuevoTotal;
                } else {
                    // Si el producto ya no existe en inventario, suma el total actual
                    totalCuenta += prod.total || 0;
                }
            }
            if (actualizado) {
                await updateDoc(doc(db, "cuentasActivas", cuentaDoc.id), { 
                    productos: cuenta.productos,
                    total: totalCuenta
                });
            } else {
                // Si no hubo cambios pero el total no coincide, igual actualiza el total
                if (typeof cuenta.total !== "number" || cuenta.total !== totalCuenta) {
                    await updateDoc(doc(db, "cuentasActivas", cuentaDoc.id), { total: totalCuenta });
                }
            }
        }
    }
    alert("Sincronización de productos, precios y totales completada.");
}

// Exponer para el HTML
window.sincronizarPreciosDesdeInventario = sincronizarPreciosDesdeInventario;