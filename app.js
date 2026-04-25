// Version 32.1 - U-8 / T-8 System
import { inventoryU8, inventoryT8 } from './data.js?v=32';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyD0YlGepgouMvXR61uDyozlsU-17ZSB6Sw",
    authDomain: "inventario-u-t-8.firebaseapp.com",
    projectId: "inventario-u-t-8",
    storageBucket: "inventario-u-t-8.appspot.com",
    messagingSenderId: "587459146199",
    appId: "1:587459146199:web:9c017998646b9a89c9388a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentUnit = null; // Will be set after selection
let currentInventory = [];
let currentUser = null;

const ELEMENTS = {
    authContainer: document.getElementById('auth-container'),
    unitSelection: document.getElementById('unit-selection-container'),
    appContainer: document.getElementById('app-container'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    tabLogin: document.getElementById('tab-login'),
    tabRegister: document.getElementById('tab-register'),
    inventoryBody: document.getElementById('inventory-body'),
    totalItems: document.getElementById('total-items'),
    reviewedItems: document.getElementById('reviewed-items'),
    searchInput: document.getElementById('search-input'),
    aiInput: document.getElementById('ai-input'),
    aiMessages: document.getElementById('ai-messages'),
    sendAi: document.getElementById('send-ai'),
    exportPdfBtn: document.getElementById('export-pdf-btn'),
    exportExcelBtn: document.getElementById('export-excel-btn'),
    syncBtn: document.getElementById('sync-btn'),
    addItemBtn: document.getElementById('add-item-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    changeUnitBtn: document.getElementById('change-unit-btn'),
    inboxBtn: document.getElementById('inbox-btn'),
    manageUsersBtn: document.getElementById('manage-users-btn'),
    mainTitle: document.getElementById('main-title'),
    unitSubtitle: document.getElementById('unit-subtitle')
};

// --- AUTH LOGIC ---
ELEMENTS.tabLogin.onclick = () => {
    ELEMENTS.loginForm.style.display = 'flex';
    ELEMENTS.registerForm.style.display = 'none';
    ELEMENTS.tabLogin.style.color = 'var(--accent)';
    ELEMENTS.tabLogin.style.borderBottom = '3px solid var(--accent)';
    ELEMENTS.tabRegister.style.color = '#64748b';
    ELEMENTS.tabRegister.style.borderBottom = 'none';
};

ELEMENTS.tabRegister.onclick = () => {
    ELEMENTS.loginForm.style.display = 'none';
    ELEMENTS.registerForm.style.display = 'flex';
    ELEMENTS.tabRegister.style.color = 'var(--accent)';
    ELEMENTS.tabRegister.style.borderBottom = '3px solid var(--accent)';
    ELEMENTS.tabLogin.style.color = '#64748b';
    ELEMENTS.tabLogin.style.borderBottom = 'none';
};

ELEMENTS.loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const user = document.getElementById('login-username').value;
    const pass = document.getElementById('login-password').value;

    if (user === 'administrador' && pass === '12345') {
        currentUser = { username: 'administrador', role: 'commander' };
        showUnitSelection();
        return;
    }

    try {
        const userDoc = await getDoc(doc(db, "users", user));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.password === pass) {
                if (userData.status === 'approved') {
                    currentUser = userData;
                    showUnitSelection();
                } else {
                    alert("Tu cuenta aún no ha sido aprobada por el comandante.");
                }
            } else {
                alert("Contraseña incorrecta.");
            }
        } else {
            alert("Usuario no encontrado.");
        }
    } catch (error) {
        console.error(error);
        alert("Error al iniciar sesión.");
    }
};

ELEMENTS.registerForm.onsubmit = async (e) => {
    e.preventDefault();
    const user = document.getElementById('register-username').value;
    const pass = document.getElementById('register-password').value;

    try {
        await setDoc(doc(db, "users", user), {
            username: user,
            password: pass,
            role: 'user',
            status: 'pending'
        });
        alert("Solicitud enviada. Espera aprobación del comandante.");
        ELEMENTS.tabLogin.onclick();
    } catch (error) {
        alert("Error al registrar.");
    }
};

function showUnitSelection() {
    ELEMENTS.authContainer.style.display = 'none';
    ELEMENTS.unitSelection.style.display = 'flex';
}

document.getElementById('select-u8').onclick = () => startApp('U-8');
document.getElementById('select-t8').onclick = () => startApp('T-8');

function startApp(unit) {
    currentUnit = unit;
    ELEMENTS.unitSelection.style.display = 'none';
    ELEMENTS.appContainer.style.display = 'block';
    ELEMENTS.mainTitle.innerText = `INVENTARIO ${currentUnit}`;
    ELEMENTS.unitSubtitle.innerText = `Gestión y revisión de equipos - Unidad ${currentUnit}`;
    
    if (currentUser.role === 'commander') {
        ELEMENTS.inboxBtn.style.display = 'flex';
        ELEMENTS.manageUsersBtn.style.display = 'flex';
        ELEMENTS.addItemBtn.style.display = 'flex';
        updateInboxBadge();
    } else {
        ELEMENTS.addItemBtn.style.display = 'none';
    }

    loadInventory();
}

ELEMENTS.changeUnitBtn.onclick = () => {
    currentUnit = null;
    ELEMENTS.appContainer.style.display = 'none';
    ELEMENTS.unitSelection.style.display = 'flex';
};

ELEMENTS.logoutBtn.onclick = () => location.reload();

function getColName() {
    return currentUnit === 'U-8' ? 'inventario_u8' : 'inventario_t8';
}

// --- INVENTORY LOGIC ---
async function loadInventory() {
    ELEMENTS.inventoryBody.innerHTML = '<tr><td colspan="17" style="text-align:center; padding:20px;">Cargando inventario...</td></tr>';
    
    const colName = getColName();
    const colRef = collection(db, colName);
    const snapshot = await getDocs(colRef);
    
    if (snapshot.empty) {
        // First time sync from local data
        currentInventory = (currentUnit === 'U-8' ? inventoryU8 : inventoryT8);
        for (const item of currentInventory) {
            await setDoc(doc(db, colName, item.codigo), {
                ...item,
                revisado: false,
                comentarios: "",
                estado: "",
                historial: [],
                ultimaRevision: "",
                proximaRevision: ""
            });
        }
        renderTable(currentInventory);
    } else {
        currentInventory = snapshot.docs.map(doc => doc.data());
        renderTable(currentInventory);
    }
    updateStats();
}

function renderTable(data) {
    ELEMENTS.inventoryBody.innerHTML = '';
    data.sort((a, b) => a.codigo.localeCompare(b.codigo)).forEach((item, index) => {
        // Main row
        const tr = document.createElement('tr');
        if (item.revisado) tr.classList.add('row-reviewed');
        tr.id = `row-${item.codigo}`;
        
        tr.innerHTML = `
            <td style="text-align:center;">${index + 1}</td>
            <td style="text-align:center;">
                <button class="toggle-btn" onclick="togglePhotoRow('${item.codigo}')">
                    <i class="ph ph-caret-down"></i>
                </button>
            </td>
            <td><strong>${item.codigo}</strong></td>
            <td>${item.sicafi || '-'}</td>
            <td>${item.pf || '-'}</td>
            <td>${item.descripcion}</td>
            <td>${item.ubicacion || '-'}</td>
            <td>${item.marca || '-'}</td>
            <td>${item.modelo || '-'}</td>
            <td>${item.serie || '-'}</td>
            <td style="text-align:center;"><span class="badge badge-${item.estado || 'default'}">${item.estado || 'N/A'}</span></td>
            <td>${item.ultimaRevision || '-'}</td>
            <td>${item.proximaRevision || '-'}</td>
            <td class="action-column" style="text-align:center;">
                <input type="checkbox" ${item.revisado ? 'checked' : ''} onchange="toggleReview('${item.codigo}', this.checked)">
            </td>
            <td class="action-column">${item.comentarios || ''}</td>
            <td class="action-column" style="text-align:center;">
                <button class="btn-icon" onclick="showHistory('${item.codigo}')"><i class="ph ph-clock-counter-clockwise"></i></button>
            </td>
            <td class="action-column">
                <div style="display:flex; gap:5px;">
                    <button class="btn-icon" onclick="editItem('${item.codigo}')"><i class="ph ph-pencil"></i></button>
                    ${currentUser.role === 'commander' ? `<button class="btn-icon text-red" onclick="deleteItem('${item.codigo}')"><i class="ph ph-trash"></i></button>` : ''}
                </div>
            </td>
        `;
        ELEMENTS.inventoryBody.appendChild(tr);

        // Expandable photo row
        const photoRow = document.createElement('tr');
        photoRow.id = `photo-row-${item.codigo}`;
        photoRow.className = 'photo-row hidden';
        photoRow.innerHTML = `
            <td colspan="17">
                <div class="photo-container" style="display:flex; flex-direction:column; gap:15px; padding:20px; background:#f8fafc;">
                    <div style="display:flex; gap:15px; align-items:center;">
                        <button onclick="uploadItemPhoto('${item.codigo}')" style="background:#eff6ff; color:#3b82f6; border:1px solid #bfdbfe; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:500; display:flex; align-items:center; gap:8px;">
                            <i class="ph ph-camera"></i> Subir Fotografía
                        </button>
                        <button onclick="deleteItemPhoto('${item.codigo}')" style="background:#ef4444; color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:500; display:flex; align-items:center; gap:8px;">
                            <i class="ph ph-trash"></i> Borrar Foto
                        </button>
                    </div>
                    <div id="preview-container-${item.codigo}" style="display:${item.foto ? 'block' : 'none'};">
                        <img src="${item.foto || ''}" style="max-width:300px; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.1); border:1px solid #e2e8f0;">
                    </div>
                </div>
            </td>
        `;
        ELEMENTS.inventoryBody.appendChild(photoRow);
    });
}

window.togglePhotoRow = (codigo) => {
    const row = document.getElementById(`photo-row-${codigo}`);
    const btn = document.querySelector(`#row-${codigo} .toggle-btn`);
    row.classList.toggle('hidden');
    btn.classList.toggle('expanded');
};

window.uploadItemPhoto = (codigo) => {
    const collectionName = currentUnit === 'U-8' ? 'inventario_u8' : 'inventario_t8';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async () => {
            const base64 = reader.result;
            await updateDoc(doc(db, collectionName, codigo), { foto: base64 });
            loadInventory();
        };
        reader.readAsDataURL(file);
    };
    fileInput.click();
};

window.deleteItemPhoto = async (codigo) => {
    const collectionName = currentUnit === 'U-8' ? 'inventario_u8' : 'inventario_t8';
    if (confirm("¿Eliminar la fotografía de este item?")) {
        await updateDoc(doc(db, collectionName, codigo), { foto: null });
        loadInventory();
    }
};

function updateStats() {
    ELEMENTS.totalItems.innerText = currentInventory.length;
    ELEMENTS.reviewedItems.innerText = currentInventory.filter(i => i.revisado).length;
}

window.toggleReview = async (codigo, val) => {
    if (val && !confirm("¿Marcar este item como revisado?")) {
        loadInventory();
        return;
    }
    await updateDoc(doc(db, getColName(), codigo), { revisado: val });
    addHistory(codigo, `Cambio estado revisión a: ${val ? 'REVISADO' : 'PENDIENTE'}`);
    loadInventory();
};

window.openPhotoModal = (codigo) => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async () => {
            const base64 = reader.result;
            await updateDoc(doc(db, getColName(), codigo), { foto: base64 });
            loadInventory();
        };
        reader.readAsDataURL(file);
    };
    fileInput.click();
};

// --- MODALS ---
window.editItem = (codigo) => {
    const item = currentInventory.find(i => i.codigo === codigo);
    document.getElementById('edit-original-codigo').value = item.codigo;
    document.getElementById('edit-codigo').value = item.codigo;
    document.getElementById('edit-sicafi').value = item.sicafi || "";
    document.getElementById('edit-pf').value = item.pf || "";
    document.getElementById('edit-descripcion').value = item.descripcion;
    document.getElementById('edit-ubicacion').value = item.ubicacion || "";
    document.getElementById('edit-marca').value = item.marca || "";
    document.getElementById('edit-modelo').value = item.modelo || "";
    document.getElementById('edit-serie').value = item.serie || "";
    document.getElementById('edit-estado').value = item.estado || "";
    document.getElementById('edit-ultima-revision').value = item.ultimaRevision || "";
    document.getElementById('edit-proxima-revision').value = item.proximaRevision || "";
    document.getElementById('edit-revisado').checked = item.revisado;
    document.getElementById('edit-comentarios').value = item.comentarios || "";
    
    document.getElementById('edit-item-modal').classList.remove('hidden');
};

document.querySelector('.close-edit-modal').onclick = () => document.getElementById('edit-item-modal').classList.add('hidden');

document.getElementById('edit-item-form').onsubmit = async (e) => {
    e.preventDefault();
    const codigo = document.getElementById('edit-original-codigo').value;
    const updates = {
        sicafi: document.getElementById('edit-sicafi').value,
        pf: document.getElementById('edit-pf').value,
        descripcion: document.getElementById('edit-descripcion').value,
        ubicacion: document.getElementById('edit-ubicacion').value,
        marca: document.getElementById('edit-marca').value,
        modelo: document.getElementById('edit-modelo').value,
        serie: document.getElementById('edit-serie').value,
        estado: document.getElementById('edit-estado').value,
        ultimaRevision: document.getElementById('edit-ultima-revision').value,
        proximaRevision: document.getElementById('edit-proxima-revision').value,
        revisado: document.getElementById('edit-revisado').checked,
        comentarios: document.getElementById('edit-comentarios').value
    };
    
    await updateDoc(doc(db, getColName(), codigo), updates);
    addHistory(codigo, "Edición manual de campos.");
    document.getElementById('edit-item-modal').classList.add('hidden');
    loadInventory();
};

window.deleteItem = async (codigo) => {
    const collectionName = currentUnit === 'U-8' ? 'inventario_u8' : 'inventario_t8';
    if (confirm(`¿Eliminar definitivamente el item ${codigo}?`)) {
        await deleteDoc(doc(db, collectionName, codigo));
        loadInventory();
    }
};

ELEMENTS.addItemBtn.onclick = () => document.getElementById('add-item-modal').classList.remove('hidden');
document.querySelector('.close-add-modal').onclick = () => document.getElementById('add-item-modal').classList.add('hidden');

document.getElementById('add-item-form').onsubmit = async (e) => {
    e.preventDefault();
    const codigo = document.getElementById('add-codigo').value;
    const item = {
        codigo: codigo,
        sicafi: document.getElementById('add-sicafi').value,
        pf: document.getElementById('add-pf').value,
        descripcion: document.getElementById('add-descripcion').value,
        ubicacion: document.getElementById('add-ubicacion').value,
        marca: document.getElementById('add-marca').value,
        modelo: document.getElementById('add-modelo').value,
        serie: document.getElementById('add-serie').value,
        revisado: false,
        comentarios: ""
    };
    await setDoc(doc(db, getColName(), codigo), item);
    document.getElementById('add-item-modal').classList.add('hidden');
    loadInventory();
};

// --- HISTORY ---
async function addHistory(codigo, accion) {
    const historyRef = collection(db, getColName(), codigo, "historial");
    await setDoc(doc(historyRef), {
        accion: accion,
        fecha: new Date().toLocaleString(),
        usuario: currentUser.username
    });
}

window.showHistory = async (codigo) => {
    const list = document.getElementById('history-list');
    list.innerHTML = "Cargando...";
    document.getElementById('history-modal').classList.remove('hidden');
    
    const snap = await getDocs(collection(db, getColName(), codigo, "historial"));
    list.innerHTML = "";
    if (snap.empty) {
        list.innerHTML = "<p>No hay historial para este item.</p>";
    } else {
        snap.docs.forEach(d => {
            const data = d.data();
            const div = document.createElement('div');
            div.style.padding = "10px";
            div.style.borderBottom = "1px solid #eee";
            div.innerHTML = `<strong>${data.fecha}</strong> - ${data.usuario}: ${data.accion}`;
            list.appendChild(div);
        });
    }
};
document.querySelector('.close-history-modal').onclick = () => document.getElementById('history-modal').classList.add('hidden');

// --- AI ASSISTANT ---
ELEMENTS.sendAi.onclick = processAI;
ELEMENTS.aiInput.onkeypress = (e) => { if (e.key === 'Enter') processAI(); };

async function processAI() {
    const queryStr = ELEMENTS.aiInput.value.toLowerCase().trim();
    if (!queryStr) return;

    ELEMENTS.aiMessages.style.maxHeight = '300px';
    ELEMENTS.aiMessages.style.padding = '15px';
    
    appendMessage('user', queryStr);
    ELEMENTS.aiInput.value = '';

    let response = "No encontré información específica. Prueba buscando por nombre o ubicación.";
    
    if (queryStr.includes("cuántos") || queryStr.includes("cuantos")) {
        if (queryStr.includes("tramos")) {
            const count = currentInventory.filter(i => i.descripcion.toLowerCase().includes("tramo")).length;
            response = `En la unidad ${currentUnit} hay ${count} tramos registrados.`;
        } else if (queryStr.includes("pitones")) {
            const count = currentInventory.filter(i => i.descripcion.toLowerCase().includes("piton")).length;
            response = `He contado ${count} pitones en el inventario actual.`;
        } else {
            response = `El inventario total de ${currentUnit} tiene ${currentInventory.length} items.`;
        }
    } else if (queryStr.includes("donde") || queryStr.includes("dónde") || queryStr.includes("ubicacion")) {
        const results = currentInventory.filter(i => queryStr.includes(i.descripcion.toLowerCase()));
        if (results.length > 0) {
            response = results.map(r => `${r.descripcion}: ${r.ubicacion}`).join("<br>");
        }
    } else if (queryStr.includes("analiza") || queryStr.includes("resumen")) {
        const rev = currentInventory.filter(i => i.revisado).length;
        const pend = currentInventory.length - rev;
        response = `Análisis de la ${currentUnit}:<br>- Total: ${currentInventory.length}<br>- Revisados: ${rev}<br>- Pendientes: ${pend}`;
    }

    setTimeout(() => appendMessage('ai', response), 500);
}

function appendMessage(role, text) {
    const div = document.createElement('div');
    div.style.padding = "8px 12px";
    div.style.borderRadius = "8px";
    div.style.maxWidth = "85%";
    if (role === 'user') {
        div.style.alignSelf = "flex-end";
        div.style.background = "#e2e8f0";
    } else {
        div.style.alignSelf = "flex-start";
        div.style.background = "white";
        div.style.border = "1px solid #e2e8f0";
    }
    div.innerHTML = text;
    ELEMENTS.aiMessages.appendChild(div);
    ELEMENTS.aiMessages.scrollTop = ELEMENTS.aiMessages.scrollHeight;
}

// --- EXPORT & SYNC ---
ELEMENTS.exportPdfBtn.onclick = () => generatePDF();

function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'pt', 'a4');
    
    // Header Title
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.text(`Inventario 5ta Brigada`, 40, 45);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Unidad: ${currentUnit} | Fecha: ${new Date().toLocaleString()}`, 40, 65);
    
    const rows = currentInventory.map((item, i) => [
        '', // Foto
        i + 1, 
        item.codigo, 
        item.sicafi || '-',
        item.pf || '-',
        item.descripcion, 
        item.ubicacion || '-', 
        item.marca || '-', 
        item.modelo || '-',
        item.serie || '-',
        item.estado || '-',
        item.revisado ? 'Sí' : 'No',
        item.comentarios || ''
    ]);
    
    doc.autoTable({
        head: [['Foto', '#', 'Código', 'SICAFI', 'PF', 'Descripción', 'Ubicación', 'Marca', 'Modelo', 'Serie', 'Estado', 'Revisado', 'Comentarios']],
        body: rows,
        startY: 85,
        theme: 'grid',
        headStyles: { 
            fillColor: [128, 0, 0], // Dark red
            textColor: 255,
            fontSize: 8,
            halign: 'center'
        },
        styles: {
            fontSize: 7,
            cellPadding: 5,
            minCellHeight: 60,
            valign: 'middle'
        },
        columnStyles: {
            0: { cellWidth: 80 }, // Foto
            1: { cellWidth: 25 }, // #
            2: { cellWidth: 45 }, // Código
            3: { cellWidth: 45 }, // SICAFI
            4: { cellWidth: 45 }, // PF
            5: { cellWidth: 100 }, // Descripción
            6: { cellWidth: 60 }, // Ubicación
            12: { cellWidth: 80 } // Comentarios
        },
        didDrawCell: (data) => {
            if (data.section === 'body' && data.column.index === 0) {
                const item = currentInventory[data.row.index];
                if (item && item.foto) {
                    try {
                        const imgSize = 50;
                        const x = data.cell.x + (data.cell.width - imgSize) / 2;
                        const y = data.cell.y + (data.cell.height - imgSize) / 2;
                        doc.addImage(item.foto, 'JPEG', x, y, imgSize, imgSize);
                    } catch (e) {
                        console.error("Error adding image to PDF", e);
                    }
                }
            }
        }
    });
    
    doc.save(`inventario_${currentUnit}.pdf`);
}

ELEMENTS.exportExcelBtn.onclick = () => {
    const ws = XLSX.utils.json_to_sheet(currentInventory);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    XLSX.writeFile(wb, `inventario_${currentUnit}.xlsx`);
};

ELEMENTS.syncBtn.onclick = loadInventory;

// --- COMMANDER TOOLS ---
async function updateInboxBadge() {
    const snap = await getDocs(query(collection(db, "users"), orderBy("username")));
    const pending = snap.docs.filter(d => d.data().status === 'pending').length;
    document.getElementById('inbox-badge').innerText = pending;
}

ELEMENTS.inboxBtn.onclick = async () => {
    const list = document.getElementById('inbox-list');
    list.innerHTML = "Cargando...";
    document.getElementById('inbox-modal').classList.remove('hidden');
    
    const snap = await getDocs(collection(db, "users"));
    const pending = snap.docs.filter(d => d.data().status === 'pending');
    list.innerHTML = "";
    if (pending.length === 0) list.innerHTML = "No hay solicitudes.";
    pending.forEach(d => {
        const user = d.data();
        const div = document.createElement('div');
        div.className = "stat-card";
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.innerHTML = `
            <span>${user.username}</span>
            <button onclick="approveUser('${user.username}')" style="background:#10b981; color:white; border:none; padding:5px 10px; border-radius:4px;">Aprobar</button>
        `;
        list.appendChild(div);
    });
};
document.querySelector('.close-inbox-modal').onclick = () => document.getElementById('inbox-modal').classList.add('hidden');

window.approveUser = async (user) => {
    await updateDoc(doc(db, "users", user), { status: 'approved' });
    alert("Usuario aprobado.");
    updateInboxBadge();
    ELEMENTS.inboxBtn.onclick();
};

ELEMENTS.manageUsersBtn.onclick = async () => {
    const list = document.getElementById('approved-users-list');
    list.innerHTML = "Cargando...";
    document.getElementById('manage-users-modal').classList.remove('hidden');
    
    const snap = await getDocs(collection(db, "users"));
    const approved = snap.docs.filter(d => d.data().status === 'approved' && d.data().username !== 'administrador');
    list.innerHTML = "";
    approved.forEach(d => {
        const user = d.data();
        const div = document.createElement('div');
        div.style.padding = "10px";
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.innerHTML = `
            <span>${user.username}</span>
            <button onclick="deleteUser('${user.username}')" style="color:#ef4444; border:none; background:none; cursor:pointer;"><i class="ph ph-trash"></i></button>
        `;
        list.appendChild(div);
    });
};
document.querySelector('.close-manage-users-modal').onclick = () => document.getElementById('manage-users-modal').classList.add('hidden');

window.deleteUser = async (user) => {
    if (confirm(`¿Eliminar usuario ${user}?`)) {
        await deleteDoc(doc(db, "users", user));
        ELEMENTS.manageUsersBtn.onclick();
    }
};

document.getElementById('commander-register-form').onsubmit = async (e) => {
    e.preventDefault();
    const user = document.getElementById('cmd-reg-user').value;
    const pass = document.getElementById('cmd-reg-pass').value;
    await setDoc(doc(db, "users", user), { username: user, password: pass, role: 'user', status: 'approved' });
    alert("Usuario creado.");
    ELEMENTS.manageUsersBtn.onclick();
};
