let tasks = JSON.parse(localStorage.getItem('plannerTasks')) || [];
let currentCategory = 'task';
let editingTaskId = null;
let removeFileOnSave = false; // Флаг: нужно ли удалить файл при сохранении
let db;
const DB_NAME = 'PlannerFilesDB';
const DB_VERSION = 1;

const categoryTitles = {
    'task': '✅ Задачи',
    'assignment': '🤝 Поручения',
    'protocol': '📑 Протоколы',
    'note': '💡 Заметки'
};

const categoryLabels = {
    'task': 'Задача',
    'assignment': 'Поручение',
    'protocol': 'Протокол',
    'note': 'Заметка'
};

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject('Ошибка БД');
        request.onsuccess = () => { db = request.result; resolve(db); };
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains('files')) {
                database.createObjectStore('files', { keyPath: 'taskId' });
            }
        };
    });
}

async function saveFileToDB(taskId, file) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['files'], 'readwrite');
        const request = transaction.objectStore('files').put({ taskId, file });
        request.onsuccess = () => resolve();
        request.onerror = () => reject('Ошибка сохранения');
    });
}

async function getFileFromDB(taskId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['files'], 'readonly');
        const request = transaction.objectStore('files').get(taskId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject('Ошибка получения');
    });
}

async function deleteFileFromDB(taskId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['files'], 'readwrite');
        const request = transaction.objectStore('files').delete(taskId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject('Ошибка удаления');
    });
}

// --- Управление формой ---
function toggleForm() {
    const panel = document.getElementById('addFormPanel');
    const isOpening = !panel.classList.contains('active');
    panel.classList.toggle('active');
    
    if (isOpening) {
        if (!editingTaskId) {
            document.getElementById('categoryInput').value = currentCategory;
            handleCategoryChange();
        }
        document.getElementById('taskInput').focus();
    } else {
        resetForm();
    }
}

function handleCategoryChange() {
    const isProtocol = document.getElementById('categoryInput').value === 'protocol';
    const container = document.getElementById('protocolItemsContainer');
    container.style.display = isProtocol ? 'block' : 'none';
    
    if (isProtocol && document.getElementById('protocolItemsList').children.length === 0) {
        addProtocolItemRow();
    }
}

function addProtocolItemRow(text = '', dueDate = '') {
    const container = document.getElementById('protocolItemsList');
    const div = document.createElement('div');
    div.className = 'protocol-item-row';
    div.innerHTML = `
        <input type="text" placeholder="Текст пункта протокола..." class="pi-text" value="${text}" required>
        <input type="datetime-local" class="pi-date" value="${dueDate}">
        <button type="button" class="remove-pi-btn" onclick="this.parentElement.remove()" title="Удалить пункт">
            <i class="ph ph-x"></i>
        </button>
    `;
    container.appendChild(div);
}

function resetForm() {
    document.getElementById('taskInput').value = '';
    document.getElementById('noteInput').value = '';
    document.getElementById('fileInput').value = '';
    document.getElementById('protocolItemsList').innerHTML = '';
    document.getElementById('dueDateInput').value = '';
    document.getElementById('priorityInput').value = 'normal';
    document.getElementById('currentFileDisplay').style.display = 'none';
    editingTaskId = null;
    removeFileOnSave = false;
}

// Показывает информацию о текущем файле при редактировании
function showCurrentFile(fileName) {
    const display = document.getElementById('currentFileDisplay');
    document.getElementById('currentFileName').textContent = fileName;
    display.style.display = 'flex';
}

// Вызывается когда пользователь выбирает новый файл
function handleNewFileSelected() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length > 0) {
        // Если выбран новый файл — скрываем блок "текущий файл"
        // (новый файл заменит старый при сохранении)
        document.getElementById('currentFileDisplay').style.display = 'none';
        removeFileOnSave = false;
    }
}

// Удаляет текущий файл при редактировании
function removeCurrentFile() {
    removeFileOnSave = true;
    document.getElementById('currentFileDisplay').style.display = 'none';
    document.getElementById('fileInput').value = '';
}

// --- Основная логика ---
async function addTask() {
    const text = document.getElementById('taskInput').value.trim();
    if (!text) { alert('Введите название.'); return; }
    
    const category = document.getElementById('categoryInput').value;
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    
    if (file && file.size > 5 * 1024 * 1024) {
        alert('Файл > 5 МБ.');
        return;
    }
    
    let items = [];
    if (category === 'protocol') {
        const rows = document.querySelectorAll('.protocol-item-row');
        rows.forEach(row => {
            const itemText = row.querySelector('.pi-text').value.trim();
            const itemDate = row.querySelector('.pi-date').value;
            if (itemText) {
                items.push({
                    id: 'item_' + Date.now() + Math.random().toString(36).substr(2, 5),
                    text: itemText,
                    dueDate: itemDate || null,
                    completed: false
                });
            }
        });
    }
    
    if (editingTaskId) {
        // === РЕДАКТИРОВАНИЕ СУЩЕСТВУЮЩЕЙ ЗАПИСИ ===
        const taskIndex = tasks.findIndex(t => t.id === editingTaskId);
        if (taskIndex === -1) return;
        
        const oldTask = tasks[taskIndex];
        
        // Определяем финальные значения для файла
        let finalHasFile = oldTask.hasFile;
        let finalFileName = oldTask.fileName;
        
        if (file) {
            // Загружен НОВЫЙ файл — заменяем старый
            if (oldTask.hasFile) {
                try { await deleteFileFromDB(oldTask.id); } catch (e) { console.error(e); }
            }
            try {
                await saveFileToDB(editingTaskId, file);
                finalHasFile = true;
                finalFileName = file.name;
            } catch (e) {
                alert('Не удалось сохранить файл.');
                return;
            }
        } else if (removeFileOnSave) {
            // Пользователь нажал "Удалить файл"
            if (oldTask.hasFile) {
                try { await deleteFileFromDB(oldTask.id); } catch (e) { console.error(e); }
            }
            finalHasFile = false;
            finalFileName = null;
        }
        // Иначе (файл не загружен и не удалён) — оставляем старый файл нетронутым
        
        tasks[taskIndex] = {
            ...oldTask,
            category: category,
            title: text,
            priority: document.getElementById('priorityInput').value,
            dueDate: document.getElementById('dueDateInput').value || null,
            note: document.getElementById('noteInput').value.trim(),
            hasFile: finalHasFile,
            fileName: finalFileName,
            items: items
        };
    } else {
        // === ДОБАВЛЕНИЕ НОВОЙ ЗАПИСИ ===
        const newTask = {
            id: Date.now(),
            category: category,
            title: text,
            completed: false,
            priority: document.getElementById('priorityInput').value,
            dueDate: document.getElementById('dueDateInput').value || null,
            note: document.getElementById('noteInput').value.trim(),
            hasFile: !!file,
            fileName: file ? file.name : null,
            items: items
        };
        
        tasks.push(newTask);
        
        if (file) {
            try { await saveFileToDB(newTask.id, file); }
            catch (e) { 
                alert('Не удалось сохранить файл.');
                tasks.pop();
                return;
            }
        }
    }
    
    saveAndRender();
    toggleForm();
}

function editTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    
    editingTaskId = id;
    removeFileOnSave = false;
    
    // Заполняем форму данными задачи
    document.getElementById('categoryInput').value = task.category;
    document.getElementById('taskInput').value = task.title;
    document.getElementById('priorityInput').value = task.priority;
    document.getElementById('dueDateInput').value = task.dueDate || '';
    document.getElementById('noteInput').value = task.note || '';
    document.getElementById('fileInput').value = '';
    
    // Показываем текущий файл если он есть
    if (task.hasFile && task.fileName) {
        showCurrentFile(task.fileName);
    } else {
        document.getElementById('currentFileDisplay').style.display = 'none';
    }
    
    // Обрабатываем пункты протокола
    handleCategoryChange();
    if (task.category === 'protocol' && task.items) {
        document.getElementById('protocolItemsList').innerHTML = '';
        task.items.forEach(item => {
            addProtocolItemRow(item.text, item.dueDate || '');
        });
    }
    
    // Открываем форму
    const panel = document.getElementById('addFormPanel');
    if (!panel.classList.contains('active')) {
        panel.classList.add('active');
    }
    
    document.getElementById('taskInput').focus();
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        if (task.category === 'protocol' && task.items) {
            task.items.forEach(item => item.completed = !task.completed);
        }
        task.completed = !task.completed;
        saveAndRender();
    }
}

function toggleProtocolItem(taskId, itemId) {
    const task = tasks.find(t => t.id === taskId);
    if (task && task.items) {
        const item = task.items.find(i => i.id === itemId);
        if (item) {
            item.completed = !item.completed;
            task.completed = task.items.length > 0 && task.items.every(i => i.completed);
            saveAndRender();
        }
    }
}

function deleteProtocolItem(taskId, itemId) {
    const task = tasks.find(t => t.id === taskId);
    if (task && task.items) {
        task.items = task.items.filter(i => i.id !== itemId);
        task.completed = task.items.length > 0 && task.items.every(i => i.completed);
        saveAndRender();
    }
}

async function deleteTask(id) {
    if (!confirm('Удалить эту запись?')) return;
    
    const task = tasks.find(t => t.id === id);
    if (task && task.hasFile) {
        try { await deleteFileFromDB(id); } catch (e) { console.error(e); }
    }
    
    tasks = tasks.filter(t => t.id !== id);
    saveAndRender();
}

async function clearAllTasks() {
    const filteredTasks = tasks.filter(t => t.category === currentCategory);
    
    if (filteredTasks.length === 0) {
        alert('Нет записей для удаления.');
        return;
    }
    
    const categoryText = `все ${categoryLabels[currentCategory].toLowerCase()}`;
    
    if (!confirm(`Вы уверены, что хотите удалить ${categoryText} (${filteredTasks.length} шт.)?`)) {
        return;
    }
    
    for (const task of filteredTasks) {
        if (task.hasFile) {
            try { await deleteFileFromDB(task.id); } catch (e) { console.error(e); }
        }
    }
    
    tasks = tasks.filter(t => t.category !== currentCategory);
    saveAndRender();
}

function setCategory(cat, btnElement) {
    currentCategory = cat;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    document.getElementById('currentCategoryTitle').textContent = categoryTitles[cat];
    renderTasks();
}

function saveAndRender() {
    localStorage.setItem('plannerTasks', JSON.stringify(tasks));
    renderTasks();
    updateStats();
}

// --- Статистика ---
function updateStats() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    let todayCount = 0;
    let upcomingCount = 0;
    let overdueCount = 0;
    let completedCount = 0;
    
    tasks.forEach(task => {
        if (task.completed) {
            completedCount++;
            return;
        }
        
        const dates = [];
        
        if (task.category === 'protocol' && task.items) {
            task.items.forEach(item => {
                if (!item.completed && item.dueDate) {
                    dates.push(new Date(item.dueDate));
                }
            });
        } else if (task.dueDate) {
            dates.push(new Date(task.dueDate));
        }
        
        dates.forEach(date => {
            if (date < today) {
                overdueCount++;
            } else if (date <= weekLater) {
                if (date.toDateString() === today.toDateString()) {
                    todayCount++;
                } else {
                    upcomingCount++;
                }
            }
        });
    });
    
    document.getElementById('todayCount').textContent = todayCount;
    document.getElementById('upcomingCount').textContent = upcomingCount;
    document.getElementById('overdueCount').textContent = overdueCount;
    document.getElementById('completedCount').textContent = completedCount;
}

// --- Обратный отсчет ---
function getCountdownHTML(dueDate, completed) {
    if (completed) return `<div class="countdown-badge status-completed">✅</div>`;
    if (!dueDate) return `<div class="countdown-badge status-none">Без срока</div>`;
    
    const now = new Date();
    const due = new Date(dueDate);
    const diffTime = due - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return `<div class="countdown-badge status-overdue">⚠️ -${Math.abs(diffDays)} дн.</div>`;
    if (diffDays === 0) return `<div class="countdown-badge status-urgent">🔥 Сегодня</div>`;
    if (diffDays === 1) return `<div class="countdown-badge status-warning">⏳ Завтра</div>`;
    if (diffDays <= 5) return `<div class="countdown-badge status-warning">⏳ ${diffDays} дн.</div>`;
    return `<div class="countdown-badge status-normal">🗓️ ${diffDays} дн.</div>`;
}

function getEarliestDueDate(task) {
    if (task.category === 'protocol' && task.items && task.items.length > 0) {
        const dates = task.items
            .filter(i => !i.completed && i.dueDate)
            .map(i => new Date(i.dueDate).getTime());
        if (dates.length > 0) return Math.min(...dates);
    }
    return task.dueDate ? new Date(task.dueDate).getTime() : new Date('9999-12-31').getTime();
}

function renderTasks() {
    const container = document.getElementById('tasksContainer');
    container.innerHTML = '';
    
    const filtered = tasks.filter(t => t.category === currentCategory);
    
    const priorityOrder = { urgent: 0, important: 1, normal: 2, low: 3 };
    filtered.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return getEarliestDueDate(a) - getEarliestDueDate(b);
    });
    
    filtered.forEach(task => {
        const div = document.createElement('div');
        div.className = `task-row ${task.completed ? 'completed' : ''}`;
        
        const fileHtml = task.hasFile
            ? `<button class="file-btn" onclick="downloadFile(${task.id})" title="${escapeHtml(task.fileName)}"><i class="ph ph-download-simple"></i> Файл</button>`
            : `<span style="color:#cbd5e1; font-size:0.85rem;">—</span>`;
        
        let itemsHtml = '';
        if (task.category === 'protocol' && task.items && task.items.length > 0) {
            itemsHtml = `<div class="protocol-items-list">`;
            task.items.forEach(item => {
                itemsHtml += `
                    <div class="protocol-item-row-render ${item.completed ? 'completed' : ''}">
                        <input type="checkbox" class="checkbox-custom" ${item.completed ? 'checked' : ''}
                               onclick="toggleProtocolItem(${task.id}, '${item.id}')">
                        <span class="pi-text-render ${item.completed ? 'completed-text' : ''}">${escapeHtml(item.text)}</span>
                        <div class="pi-countdown">${getCountdownHTML(item.dueDate, item.completed)}</div>
                        <button class="delete-pi-btn" onclick="deleteProtocolItem(${task.id}, '${item.id}')" title="Удалить пункт">
                            <i class="ph ph-trash"></i>
                        </button>
                    </div>
                `;
            });
            itemsHtml += `</div>`;
        }
        
        div.innerHTML = `
            <div class="task-header-row">
                <input type="checkbox" class="checkbox-custom" ${task.completed ? 'checked' : ''} onclick="toggleTask(${task.id})" title="Отметить всё">
                <div class="task-content">
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    ${task.note ? `<div class="task-note" title="${escapeHtml(task.note)}">${escapeHtml(task.note)}</div>` : ''}
                </div>
                <div class="task-meta">
                    <span class="cat-label">${categoryLabels[task.category]}</span>
                    <span class="badge badge-${task.priority}">${getPriorityLabel(task.priority)}</span>
                </div>
                <div class="countdown-column">
                    ${getCountdownHTML(task.dueDate, task.completed)}
                </div>
                <div class="task-file">${fileHtml}</div>
                <div class="task-actions">
                    <button class="edit-btn" onclick="editTask(${task.id})" title="Редактировать">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button class="delete-btn" onclick="deleteTask(${task.id})" title="Удалить запись">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </div>
            ${itemsHtml}
        `;
        container.appendChild(div);
    });
}

async function downloadFile(taskId) {
    try {
        const record = await getFileFromDB(taskId);
        if (record && record.file) {
            const task = tasks.find(t => t.id === taskId);
            const url = URL.createObjectURL(record.file);
            const a = document.createElement('a');
            a.href = url;
            a.download = task ? task.fileName : 'download';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            alert('Файл не найден.');
        }
    } catch (e) {
        alert('Ошибка при получении файла.');
    }
}

function getPriorityLabel(value) {
    const labels = {
        urgent: 'Срочно',
        important: 'Важно',
        normal: 'Обычное',
        low: 'Не важно'
    };
    return labels[value] || 'Обычное';
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

initDB().then(() => {
    renderTasks();
    updateStats();
    setInterval(() => {
        renderTasks();
        updateStats();
    }, 60000);
}).catch(err => {
    console.error(err);
    renderTasks();
    updateStats();
});