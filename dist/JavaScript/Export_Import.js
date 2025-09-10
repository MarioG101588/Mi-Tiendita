import { collection, getDocs, doc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { db } from "./Conexion.js";
// Asegúrate de incluir SheetJS en tu HTML: <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>

async function exportarInventarioAExcel() {
    const inventarioRef = collection(db, "inventario");
    const snapshot = await getDocs(inventarioRef);
    const data = [];
    snapshot.forEach(doc => {
        const d = doc.data();
        data.push({
            Producto: doc.id,
            Cantidad: d.cantidad,
            PrecioVenta: d.precioVenta,
            FechaVencimiento: d.fechaVencimiento || ""
        });
    });
    // Generar hoja y archivo Excel
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    XLSX.writeFile(wb, "inventario.xlsx");
}

// Asegúrate de incluir SheetJS en tu HTML

async function importarInventarioDesdeExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const productos = XLSX.utils.sheet_to_json(sheet);
        for (const prod of productos) {
            // Asume que el campo Producto es el nombre/ID del documento
            const docRef = doc(db, "inventario", prod.Producto);
            await setDoc(docRef, {
                cantidad: Number(prod.Cantidad) || 0,
                precioVenta: Number(prod.PrecioVenta) || 0,
                fechaVencimiento: prod.FechaVencimiento || ""
            }, { merge: true });
        }
        alert("Inventario actualizado correctamente.");
    };
    reader.readAsArrayBuffer(file);
}

window.exportarInventarioAExcel = exportarInventarioAExcel;
window.importarInventarioDesdeExcel = importarInventarioDesdeExcel;