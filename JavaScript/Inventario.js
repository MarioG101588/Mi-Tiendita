// JavaScript/inventario.js
import { 
    getFirestore, collection, getDocs, setDoc, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { app } from "./Conexion.js";

// Librería para Excel
import * as XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs";

const db = getFirestore(app);

// ================== CARGAR INVENTARIO ==================
export async function cargarInventario(filtro = "") {
    const resultadoDiv = document.getElementById("resultadoBusqueda1");
    if (!resultadoDiv) return;
    resultadoDiv.innerHTML = "Cargando...";

    try {
        const inventarioRef = collection(db, "inventario");
        const snapshot = await getDocs(inventarioRef);

        let html = `
            <div class="table-responsive" style="max-height: 220px; overflow-y: auto;">
            <table class="table table-striped table-bordered inventario-fija">
                <thead>
                    <tr>
                        <th>PRODUCTOS</th>
                        <th>PRECIO</th>
                        <th>CANTIDAD</th>
                        <th>VENCE</th>
                    </tr>
                </thead>
                <tbody>
        `;

        let hayResultados = false;
        const filtroLower = filtro.trim().toLowerCase();

        snapshot.forEach(docSnap => {
            if (!filtroLower || docSnap.id.toLowerCase().includes(filtroLower)) {
                const data = docSnap.data();
                hayResultados = true;
                html += `
                    <tr style="cursor:pointer" onclick="window.agregarAlCarrito('${docSnap.id}', ${data.precioVenta})">
                        <td>${docSnap.id}</td>
                        <td>${data.precioVenta ?? "-"}</td>
                        <td>${data.cantidad ?? "-"}</td>
                        <td>${data.fechaVencimiento || "-"}</td>
                    </tr>
                `;
            }
        });

        html += `
                </tbody>
            </table>
            </div>
        `;
        resultadoDiv.innerHTML = hayResultados ? html : "No hay resultados.";
    } catch (error) {
        resultadoDiv.innerHTML = "Error al cargar inventario.";
        console.error(error);
    }
}

// ================== EXPORTAR A EXCEL ==================
export async function exportarInventarioExcel() {
    try {
        const inventarioRef = collection(db, "inventario");
        const snapshot = await getDocs(inventarioRef);

        const data = [];
        snapshot.forEach(docSnap => {
            const item = docSnap.data();
            data.push({
                Producto: docSnap.id,
                PrecioVenta: item.precioVenta ?? "",
                Cantidad: item.cantidad ?? "",
                FechaVencimiento: item.fechaVencimiento ?? ""
            });
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Inventario");

        XLSX.writeFile(wb, "inventario.xlsx");
        alert("Inventario exportado correctamente.");
    } catch (error) {
        console.error("Error exportando inventario:", error);
    }
}

// ================== IMPORTAR DESDE EXCEL (BORRAR Y REESCRIBIR) ==================
export async function importarInventarioDesdeExcel(file) {
    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: "array" });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet);

            // Validación: que haya filas y columnas correctas
            if (!jsonData.length) {
                alert("El archivo Excel está vacío.");
                return;
            }

            const columnasValidas = ["Producto", "PrecioVenta", "Cantidad"];
            const primeraFila = Object.keys(jsonData[0]);
            const faltantes = columnasValidas.filter(col => !primeraFila.includes(col));
            if (faltantes.length) {
                alert(`Faltan columnas obligatorias en el Excel: ${faltantes.join(", ")}`);
                return;
            }

            // Si pasa las validaciones → ahora sí borrar inventario
            const inventarioRef = collection(db, "inventario");
            const snapshot = await getDocs(inventarioRef);
            await Promise.all(snapshot.docs.map(docSnap => 
                deleteDoc(doc(db, "inventario", docSnap.id))
            ));

            // Insertar nuevos registros
            await Promise.all(jsonData.map(row => {
                const productoId = row.Producto?.toString().trim();
                if (!productoId) return null;
                return setDoc(doc(db, "inventario", productoId), {
                    precioVenta: Number(row.PrecioVenta) || 0,
                    cantidad: Number(row.Cantidad) || 0,
                    fechaVencimiento: row.FechaVencimiento?.toString() || ""
                });
            }));

            alert("Inventario sobrescrito correctamente.");
            cargarInventario();
        };

        reader.readAsArrayBuffer(file);
    } catch (error) {
        console.error("Error importando inventario:", error);
        alert("Ocurrió un error al importar. No se modificó el inventario.");
    }
}
