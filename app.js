// Version 32.1 - U-8 / T-8 System
import { inventoryU8 } from './data.js?v=32.3';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB6ExzbxT6vWH7a195TdWD8yv7xNDjbkBc",
  authDomain: "cia28-dff38.firebaseapp.com",
  projectId: "cia28-dff38",
  storageBucket: "cia28-dff38.firebasestorage.app",
  messagingSenderId: "127192013068",
  appId: "1:127192013068:web:bf2f00eba74c6037a0d129",
  measurementId: "G-D2GSQC0MH4"
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

document.getElementById('select-u8').onclick = () => startApp('CIA-28');

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
    return 'inventario_cia28';
}

let inventoryListener = null;

// --- INVENTORY LOGIC ---
async function loadInventory() {
    if (inventoryListener) inventoryListener(); // Detener listener previo si existe
    
    ELEMENTS.inventoryBody.innerHTML = '<tr><td colspan="17" style="text-align:center; padding:20px;">Sincronizando en tiempo real...</td></tr>';
    
    const colName = getColName();
    const colRef = collection(db, colName);
    
    // Verificación inicial para sincronizar si está vacío
    const initialSnap = await getDocs(colRef);
    if (initialSnap.empty) {
        for (const item of inventoryU8) {
            await setDoc(doc(db, colName, item.codigo), {
                ...item,
                revisado: false,
                comentarios: "",
                estado: "",
                ultimaRevision: "",
                proximaRevision: "",
                revisadoPor: ""
            });
        }
    }

    // Listener en tiempo real: Actualiza la UI automáticamente al detectar cambios en Firebase
    inventoryListener = onSnapshot(colRef, (snapshot) => {
        const changes = snapshot.docChanges();
        
        // Si hay cambios pero la tabla está vacía o el número de documentos cambió, re-render total
        if (currentInventory.length === 0 || changes.length > 5 || snapshot.size !== currentInventory.length) {
            currentInventory = snapshot.docs.map(doc => doc.data());
            renderTable(currentInventory);
        } else {
            // Actualización incremental para evitar el "refresco" visual
            changes.forEach(change => {
                const data = change.doc.data();
                const idx = currentInventory.findIndex(i => i.codigo === data.codigo);
                if (idx !== -1) currentInventory[idx] = data;
                
                if (change.type === "modified") {
                    updateRowUI(data);
                }
            });
        }
        updateStats();
    });
}

function updateRowUI(item) {
    const row = document.getElementById(`row-${item.codigo}`);
    if (!row) return;

    // Actualizar clases
    if (item.revisado) row.classList.add('row-reviewed');
    else row.classList.remove('row-reviewed');

    // Actualizar celdas críticas sin reconstruir toda la fila
    const cells = row.cells;
    
    // Estado (select)
    const select = row.querySelector('.status-select');
    if (select) {
        select.value = item.estado || "";
        select.className = `status-select status-${item.estado || 'default'}`;
        select.disabled = item.revisado;
    }

    // Última Revisión
    const revCell = cells[11];
    if (revCell) {
        revCell.innerHTML = `
            <div style="font-size:0.75rem; color:${item.revisado ? '#059669' : '#64748b'}; font-weight:600;">
                ${item.ultimaRevision || '-'}
                ${item.revisadoPor ? `<br><span style="color:#64748b; font-weight:400;">Por: ${item.revisadoPor}</span>` : ''}
            </div>`;
    }

    // Próxima Revisión
    const dateInput = row.querySelector('input[type="date"]');
    if (dateInput) {
        dateInput.value = item.proximaRevision || "";
        dateInput.disabled = item.revisado;
    }

    // Checkbox
    const checkbox = row.querySelector('.custom-checkbox');
    if (checkbox) checkbox.checked = item.revisado;

    // Comentarios
    const textarea = row.querySelector('.comment-input');
    if (textarea) {
        textarea.value = item.comentarios || "";
        textarea.disabled = item.revisado;
    }

    // Botones de acción
    row.querySelectorAll('.btn-icon').forEach(btn => {
        if (!btn.classList.contains('text-red')) { // No deshabilitar borrar para el comandante si se desea
             btn.disabled = item.revisado;
        }
    });
}

function renderTable(data) {
    ELEMENTS.inventoryBody.innerHTML = '';
    data.sort((a, b) => a.codigo.localeCompare(b.codigo)).forEach((item, index) => {
        // Main row
        const tr = document.createElement('tr');
        if (item.revisado) tr.classList.add('row-reviewed');
        tr.id = `row-${item.codigo}`;
        
        const lockAttr = item.revisado ? 'disabled' : '';
        const revisionInfo = `
            <div style="font-size:0.75rem; color:${item.revisado ? '#059669' : '#64748b'}; font-weight:600;">
                ${item.ultimaRevision || '-'}
                ${item.revisadoPor ? `<br><span style="color:#64748b; font-weight:400;">Por: ${item.revisadoPor}</span>` : ''}
            </div>`;

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
            <td style="text-align:center;">
                <select ${lockAttr} class="status-select status-${item.estado || 'default'}" onchange="updateItemInline('${item.codigo}', 'estado', this.value)">
                    <option value="">Seleccionar...</option>
                    <option value="bueno" ${item.estado === 'bueno' ? 'selected' : ''}>Bueno</option>
                    <option value="malo" ${item.estado === 'malo' ? 'selected' : ''}>Malo</option>
                    <option value="regular" ${item.estado === 'regular' ? 'selected' : ''}>Regular</option>
                    <option value="no-existe" ${item.estado === 'no-existe' ? 'selected' : ''}>No Existe</option>
                </select>
            </td>
            <td style="text-align:center;">${revisionInfo}</td>
            <td>
                <input ${lockAttr} type="date" value="${item.proximaRevision || ''}" onchange="updateItemInline('${item.codigo}', 'proximaRevision', this.value)" style="border:1px solid #e2e8f0; border-radius:6px; padding:4px; font-size:0.85rem;">
            </td>
            <td class="action-column" style="text-align:center;">
                <div class="checkbox-wrapper">
                    <input type="checkbox" class="custom-checkbox" ${item.revisado ? 'checked' : ''} onchange="toggleReview('${item.codigo}', this.checked)">
                </div>
            </td>
            <td class="action-column">
                <textarea ${lockAttr} class="comment-input" onblur="updateItemInline('${item.codigo}', 'comentarios', this.value)" placeholder="Agregar comentarios..." style="min-height:40px; font-size:0.85rem;">${item.comentarios || ''}</textarea>
            </td>
            <td class="action-column" style="text-align:center;">
                <button class="btn-icon" onclick="showHistory('${item.codigo}')"><i class="ph ph-clock-counter-clockwise"></i></button>
            </td>
            <td class="action-column">
                <div style="display:flex; gap:5px;">
                    <button ${lockAttr} class="btn-icon" onclick="editItem('${item.codigo}')"><i class="ph ph-pencil"></i></button>
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
                        <button ${lockAttr} onclick="uploadItemPhoto('${item.codigo}')" style="background:#eff6ff; color:#3b82f6; border:1px solid #bfdbfe; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:500; display:flex; align-items:center; gap:8px;">
                            <i class="ph ph-camera"></i> Subir Fotografía
                        </button>
                        <button ${lockAttr} onclick="deleteItemPhoto('${item.codigo}')" style="background:#ef4444; color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:500; display:flex; align-items:center; gap:8px;">
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

window.updateItemInline = async (codigo, field, value) => {
    const colName = getColName();
    const updates = {};
    updates[field] = value;
    
    await updateDoc(doc(db, colName, codigo), updates);
    addHistory(codigo, `Actualización inline: ${field} = ${value}`);
};

window.togglePhotoRow = (codigo) => {
    const row = document.getElementById(`photo-row-${codigo}`);
    const btn = document.querySelector(`#row-${codigo} .toggle-btn`);
    row.classList.toggle('hidden');
    btn.classList.toggle('expanded');
};

window.uploadItemPhoto = (codigo) => {
    const collectionName = getColName();
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async () => {
            const base64 = reader.result;
            await updateDoc(doc(db, collectionName, codigo), { foto: base64 });
        };
        reader.readAsDataURL(file);
    };
    fileInput.click();
};

window.deleteItemPhoto = async (codigo) => {
    const collectionName = getColName();
    if (confirm("¿Eliminar la fotografía de este item?")) {
        await updateDoc(doc(db, collectionName, codigo), { foto: null });
    }
};

function updateStats() {
    ELEMENTS.totalItems.innerText = currentInventory.length;
    ELEMENTS.reviewedItems.innerText = currentInventory.filter(i => i.revisado).length;
}

window.toggleReview = async (codigo, val) => {
    if (val) {
        if (!confirm("¿Desea BLOQUEAR este item y marcarlo como revisado? No podrá editarlo hasta desbloquearlo.")) {
            renderTable(currentInventory); // Reset UI
            return;
        }
        const updates = {
            revisado: true,
            ultimaRevision: new Date().toLocaleDateString(),
            revisadoPor: currentUser.username
        };
        await updateDoc(doc(db, getColName(), codigo), updates);
        addHistory(codigo, `Item BLOQUEADO y REVISADO por ${currentUser.username}`);
    } else {
        if (!confirm("¿Desea DESBLOQUEAR este item para permitir ediciones?")) {
            renderTable(currentInventory); // Reset UI
            return;
        }
        await updateDoc(doc(db, getColName(), codigo), { 
            revisado: false,
            ultimaRevision: "",
            revisadoPor: ""
        });
        addHistory(codigo, `Item DESBLOQUEADO y REVISIÓN REINICIADA por ${currentUser.username}`);
    }
    // No es necesario llamar a loadInventory() porque onSnapshot detectará el cambio y actualizará la UI
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
};

window.deleteItem = async (codigo) => {
    const collectionName = getColName();
    if (confirm(`¿Eliminar definitivamente el item ${codigo}?`)) {
        await deleteDoc(doc(db, collectionName, codigo));
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

let aiContext = {
    lastTopic: null,
    lastResults: []
};

async function processAI() {
    const queryStrRaw = ELEMENTS.aiInput.value.trim();
    const queryStr = queryStrRaw.toLowerCase();
    if (!queryStr) return;

    ELEMENTS.aiMessages.style.maxHeight = '450px';
    ELEMENTS.aiMessages.style.padding = '15px';
    
    appendMessage('user', queryStrRaw);
    ELEMENTS.aiInput.value = '';

    // Typing indicator
    const typingId = 'typing-' + Date.now();
    const typingDiv = document.createElement('div');
    typingDiv.id = typingId;
    typingDiv.className = 'ai-message assistant typing-dots';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';
    ELEMENTS.aiMessages.appendChild(typingDiv);
    ELEMENTS.aiMessages.scrollTop = ELEMENTS.aiMessages.scrollHeight;

    let response = "";
    const greetings = ["¡Hola!", "¡Claro que sí!", "Con muchísimo gusto.", "¡Aquí tienes!", "¡Entendido!", "¡Listo!"];
    const prefix = greetings[Math.floor(Math.random() * greetings.length)];

    // Normalizar texto para ignorar tildes
    const normalizedQuery = queryStr.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Función segura para buscar intenciones
    const hasWord = (words) => {
        const tokens = normalizedQuery.split(/[ \.\?,]+/);
        return words.some(w => tokens.some(t => t.includes(w)));
    };

    let intent = null;
    if (hasWord(["cuant", "cantid", "total"])) intent = "count";
    else if (hasWord(["donde", "ubicacion", "lugar", "estan", "están", "cuarto"])) intent = "location";
    else if (hasWord(["tipo", "clase", "cuales", "modelo", "marca"])) intent = "types";
    else if (hasWord(["mal", "dañad", "danad", "reparar", "defectuoso", "roto"])) intent = "damaged";
    else if (hasWord(["falta", "pendient", "sin revisar"])) intent = "pending";
    else if (hasWord(["revisad", "listo", "progreso", "avance"])) intent = "reviewed";

    // Stop words para extraer solo el "Sujeto/Item"
    const stopWords = ["quiero", "saber", "buscar", "busca", "muestrame", "dime", "sobre", "los", "las", "el", "la", "un", "una", "unos", "unas", "hay", "tienen", "tiene", "cuanto", "cuantos", "cuantas", "cantidad", "total", "donde", "ubicacion", "lugar", "estan", "están", "cuarto", "tipo", "tipos", "clase", "clases", "cuales", "modelo", "marca", "mal", "malo", "malos", "dañado", "dañados", "danado", "danados", "reparar", "defectuoso", "roto", "falta", "faltan", "pendiente", "pendientes", "sin", "revisar", "revisado", "revisados", "listo", "progreso", "avance", "hola", "buenos", "buenas", "ayuda", "que", "haces", "quien", "eres", "saludos", "para", "como", "con", "estamos"];

    // Detectar de qué estamos hablando (Entidad)
    let searchWords = normalizedQuery.split(/[ \.\?,]+/).filter(w => w.length > 2 && !stopWords.includes(w));
    
    let topic = aiContext.lastTopic;
    let results = aiContext.lastResults || currentInventory;
    let newTopicDetected = false;

    // Búsqueda directa por ubicación
    const ubiMatch = queryStr.match(/i-\d+-u-\d+/i) || queryStr.match(/i-\d+-u-28/i) || queryStr.match(/i-\d+-u-8/i);
    
    if (ubiMatch) {
        topic = ubiMatch[0].toUpperCase();
        results = currentInventory.filter(i => i.ubicacion && i.ubicacion.toUpperCase().includes(topic));
        newTopicDetected = true;
    } else if (searchWords.length > 0) {
        // Búsqueda dinámica ultra-inteligente
        const searchResults = currentInventory.filter(i => 
            searchWords.some(w => 
                i.descripcion.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(w) || 
                (i.codigo && i.codigo.toLowerCase().includes(w))
            )
        );
        if (searchResults.length > 0) {
            topic = searchWords.join(" ");
            results = searchResults;
            newTopicDetected = true;
        }
    }

    // Lógica de fallback si no detectamos nada nuevo ni había tema anterior
    if (!newTopicDetected && !topic && !intent && !hasWord(["hola", "ayuda"])) {
        topic = "all";
        results = currentInventory;
    } else if (!newTopicDetected && topic && !intent) {
        if (searchWords.length > 0 && !hasWord(["hola", "ayuda"])) {
            response = `Uy, he revisado todo el inventario pero no encontré nada relacionado con "<strong>${searchWords.join(" ")}</strong>". 😔 ¿Podrías intentar con otro nombre o revisar cómo está escrito?`;
            setTimeout(() => { document.getElementById(typingId)?.remove(); appendMessage('ai', response); }, 800);
            return;
        }
    }

    // ¡La Memoria! Guardamos el contexto si no estamos hablando del general
    if (topic !== "all" && topic) {
        aiContext.lastTopic = topic;
        aiContext.lastResults = results;
    }

    // Funciones de formato
    const groupBy = (array, key) => {
        return array.reduce((res, curr) => {
            const groupKey = curr[key] || "Sin asignar";
            (res[groupKey] = res[groupKey] || []).push(curr);
            return res;
        }, {});
    };

    const topicName = topic === "all" ? "ítems en general" : `<strong>${topic}</strong>`;

    // Generar la respuesta mágica
    if (hasWord(["hola", "buenos", "buenas", "ayuda", "que haces", "eres"])) {
        response = `¡Hola! 👋 Soy tu Cerebro Logístico Súper Inteligente. Puedo ayudarte con todo el inventario.<br><br>Dime qué buscas (ej: <em>"escalera"</em>, <em>"pitones"</em>) y luego simplemente sígueme preguntando (<em>"tipos"</em>, <em>"dónde están"</em>, <em>"estado"</em>). ¡Tengo memoria para hacer la charla súper natural! 🧠✨`;
        aiContext.lastTopic = null;
    } else if (intent === "count") {
        response = `${prefix} Tenemos un total de <strong>${results.length}</strong> ${topicName} registrados.`;
    } else if (intent === "location") {
        if (results.length === 0) {
            response = `No encontré ${topicName} para mostrarte su ubicación.`;
        } else {
            const groups = groupBy(results, "ubicacion");
            const locStrings = Object.keys(groups).map(loc => `📍 <strong>${loc}</strong>: ${groups[loc].length} unidades`).join("<br>");
            response = `${prefix} Los ${topicName} están distribuidos así:<br>${locStrings}`;
        }
    } else if (intent === "types") {
        if (results.length === 0) {
             response = `No hay ${topicName} para mostrarte los tipos.`;
        } else {
            const types = [...new Set(results.map(i => i.descripcion))];
            response = `${prefix} Sobre los ${topicName}, tenemos estas clases:<br>🔹 ` + types.join("<br>🔹 ");
        }
    } else if (intent === "damaged") {
        const bad = results.filter(i => (i.estado && i.estado.toLowerCase().includes("dañad")) || i.estado === "malo");
        if (bad.length > 0) {
            response = `${prefix} Encontré <strong>${bad.length}</strong> ${topicName} en mal estado:<br>⚠️ ` + bad.slice(0,5).map(i => `${i.descripcion} (${i.codigo}) en ${i.ubicacion || 'S/U'}`).join("<br>⚠️ ");
        } else {
            response = `${prefix} ¡Excelentes noticias! 🥳 No hay ${topicName} reportados como dañados.`;
        }
    } else if (intent === "pending") {
        const pending = results.filter(i => !i.revisado);
        response = `${prefix} Todavía nos faltan <strong>${pending.length}</strong> ${topicName} por revisar.`;
    } else if (intent === "reviewed") {
        const rev = results.filter(i => i.revisado).length;
        const total = results.length;
        const porc = total === 0 ? 0 : ((rev / total) * 100).toFixed(1);
        response = `${prefix} El progreso de revisión para los ${topicName} es del <strong>${porc}%</strong> (${rev}/${total} completados).`;
    } else if (newTopicDetected && !intent) {
        response = `${prefix} ¡Los encontré! Hay <strong>${results.length}</strong> ${topicName}.<br><br>💡 <em>¡Prueba a preguntarme "tipos", "dónde están", "cuántos hay" o "cuáles están dañados"! Te seguiré el hilo.</em>`;
    } else {
        response = `Mmm, recuerdo que hablábamos de ${topicName}, pero no me quedó muy clara la pregunta. 😅 Intenta pedirme "ubicaciones", "tipos" o "resumen".`;
    }

    setTimeout(() => {
        document.getElementById(typingId)?.remove();
        appendMessage('ai', response);
    }, 800);
}

function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `ai-message ${role === 'user' ? 'user' : 'assistant'}`;
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
        item.ultimaRevision || '-',
        item.revisadoPor || '-',
        item.revisado ? 'Sí' : 'No',
        item.comentarios || ''
    ]);
    
    doc.autoTable({
        head: [['Foto', '#', 'Código', 'SICAFI', 'PF', 'Descripción', 'Ubicación', 'Marca', 'Modelo', 'Serie', 'Estado', 'Última Rev.', 'Personal', 'Revisado', 'Comentarios']],
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
            0: { cellWidth: 70 }, // Foto
            1: { cellWidth: 20 }, // #
            2: { cellWidth: 40 }, // Código
            3: { cellWidth: 40 }, // SICAFI
            4: { cellWidth: 40 }, // PF
            5: { cellWidth: 80 }, // Descripción
            6: { cellWidth: 50 }, // Ubicación
            10: { cellWidth: 40 }, // Estado
            11: { cellWidth: 50 }, // Última Rev.
            12: { cellWidth: 50 }, // Personal
            13: { cellWidth: 40 }, // Revisado
            14: { cellWidth: 70 } // Comentarios
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
