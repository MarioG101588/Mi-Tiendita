// Compras.js
import {
    db,
    collection,
    doc,
    wrappedAddDoc,
    wrappedSetDoc,
    wrappedGetDocs,
    query,
    orderBy,
    limit,
    serverTimestamp
} from "./Conexion.js";

/**
 * Guarda una nueva compra en Firestore con wrappers
 */
export async function guardarCompra(compra) {
    try {
        if (!compra.productos || compra.productos.length === 0) {
            throw new Error("La compra no tiene productos");
        }

        // 🔹 Registrar compra
        const ref = await wrappedAddDoc(collection(db, "compras"), {
            ...compra,
            fecha: new Date().toLocaleString(),
            timestamp: serverTimestamp()
        });

        console.log("✅ Compra guardada con ID:", ref.id);

        // 🔹 Actualizar inventario
        for (let producto of compra.productos) {
            const safeId = producto.nombre.replace(/\s+/g, "_"); // evita errores por espacios
            const productoRef = doc(db, "inventario", safeId);

            await wrappedSetDoc(productoRef, {
                nombre: producto.nombre,
                cantidad: producto.cantidad,
                precio: producto.precio,
                actualizado: serverTimestamp()
            }, { merge: true });
        }

        return true;
    } catch (err) {
        console.error("❌ Error al guardar compra:", err);
        return false;
    }
}

/**
 * Carga las últimas compras recientes
 */
export async function cargarComprasRecientes() {
    try {
        const lista = document.getElementById("listaComprasRecientes");
        if (!lista) return;

        const q = query(
            collection(db, "compras"),
            orderBy("timestamp", "desc"),
            limit(5)
        );
        const snapshot = await wrappedGetDocs(q);

        if (snapshot.empty) {
            lista.innerHTML = `<p class="text-muted">No hay compras registradas.</p>`;
            return;
        }

        let html = "";
        snapshot.forEach(docSnap => {
            const c = docSnap.data();
            html += `
                <div class="list-group-item">
                    <b>${c.proveedor || "Proveedor"}</b> - 
                    ${formatearPrecio(c.total)} 
                    <small class="text-muted">(${c.fecha})</small>
                </div>`;
        });

        lista.innerHTML = html;
    } catch (err) {
        console.error("❌ Error al cargar compras:", err);
    }
}

/**
 * Formatea precio
 */
function formatearPrecio(valor) {
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        minimumFractionDigits: 0
    }).format(valor);
}
