const tasksList = document.getElementById('tasksList');
const taskInput = document.getElementById('taskInput');
const priorityInput = document.getElementById('priorityInput');
const dueDateInput = document.getElementById('dueDateInput');
const noteInput = document.getElementById('noteInput');
const fileInput = document.getElementById('fileInput');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

let tasks = JSON.parse(localStorage.getItem('dailyTasksSimple')) || [];
let currentFilter = 'all';

// Дата по умолчанию: сегодня + 2 дня
const now = new Date();
const defaultDueDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
defaultDueDate.setSeconds(0, 0);
dueDateInput.value = defaultDueDate.toISOString().slice(0, 16);

// --- IndexedDB для хранения файлов ---
const DB_NAME = 'TaskPlannerFilesDB';
const DB_VERSION = 1;
let db;

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject('Ошибка открытия БД');
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
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
        const store = transaction.objectStore('files');
        const request = store.put({ taskId: taskId, file: file });
        request.onsuccess = () => resolve();
        request.onerror = () => reject('Ошибка сохранения файла');
    });
}

async function getFileFromDB(taskId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['files'], 'readonly');
        const store = transaction.objectStore('files');
        const request = store.get(taskId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject('Ошибка получения файла');
    });
}

async function deleteFileFromDB(taskId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['files'], 'readwrite');
        const store = transaction.objectStore('files');
        const request = store.delete(taskId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject('Ошибка удаления файла');
    });
}

// --- Основная логика приложения ---
async function addTask() {
    const text = taskInput.value.trim();
    if (!text) {
        alert('Пожалуйста, напишите текст задачи.');
        return;
    }
    const file = fileInput.files[0];
    if (file && file.size > 5 * 1024 * 1024) {
        alert('Файл слишком большой! Максимальный размер: 5 МБ.');
        return;
    }

    const newTask = {
        id: Date.now(),
        text: text,
        completed: false,
        priority: priorityInput.value,
        dueDate: dueDateInput.value || null,
        note: noteInput.value.trim(),
        hasFile: !!file,
        fileName: file ? file.name : null
    };

    tasks.push(newTask);
    if (file) {
        try {
            await saveFileToDB(newTask.id, file);
        } catch (e) {
            console.error(e);
            alert('Не удалось сохранить файл. Возможно, превышен лимит хранилища браузера.');
            tasks.pop();
            return;
        }
    }

    saveAndRender();
    taskInput.value = '';
    noteInput.value = '';
    fileInput.value = '';
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        saveAndRender();
    }
}

async function deleteTask(id) {
    if (!confirm('Удалить эту задачу?')) return;
    const task = tasks.find(t => t.id === id);
    if (task && task.hasFile) {
        try {
            await deleteFileFromDB(id);
        } catch (e) {
            console.error('Ошибка удаления файла из БД', e);
        }
    }
    tasks = tasks.filter(t => t.id !== id);
    saveAndRender();
}

function setFilter(filter, btnElement) {
    currentFilter = filter;
    const btns = document.querySelectorAll('.filter-btn');
    btns.forEach(b => b.classList.remove('active'));
    if (btnElement) {
        btnElement.classList.add('active');
    }
    renderTasks();
}

function saveAndRender() {
    localStorage.setItem('dailyTasksSimple', JSON.stringify(tasks));
    renderTasks();
}

function renderTasks() {
    tasksList.innerHTML = '';
    const filteredTasks = tasks.filter(task => {
        const now = new Date();
        const due = task.dueDate ? new Date(task.dueDate) : null;
        if (currentFilter === 'urgent') return task.priority === 'urgent' && !task.completed;
        if (currentFilter === 'overdue') {
            if (task.completed) return false;
            return due && due < now;
        }
        if (currentFilter === 'uncompleted') return !task.completed;
        return true;
    });

    filteredTasks.sort((a, b) => {
        const priorityOrder = { urgent: 0, important: 1, normal: 2, low: 3 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        const dateA = a.dueDate ? new Date(a.dueDate) : new Date('9999-12-31');
        const dateB = b.dueDate ? new Date(b.dueDate) : new Date('9999-12-31');
        return dateA - dateB;
    });

    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    progressBar.style.width = percent + '%';
    progressText.textContent = `${percent}% выполнено`;

    filteredTasks.forEach(task => {
        const li = document.createElement('li');
        li.className = 'task-item'; // Добавлен класс для новых стилей
        if (task.completed) {
            li.classList.add('completed');
        }

        let priorityClass = 'badge-normal';
        if (task.priority === 'urgent') priorityClass = 'badge-urgent';
        else if (task.priority === 'important') priorityClass = 'badge-important';
        else if (task.priority === 'low') priorityClass = 'badge-low';

        const nowDate = new Date();
        const dueObj = task.dueDate ? new Date(task.dueDate) : null;
        const isOverdue = dueObj && !task.completed && dueObj < nowDate;

        const fileHtml = task.hasFile
            ? `<button class="file-btn" onclick="downloadFile(${task.id})" title="Скачать: ${escapeHtml(task.fileName)}"><i class="ph ph-download-simple"></i> Файл</button>`
            : `<span style="color:#cbd5e1; font-size:0.85rem;">—</span>`;

        li.innerHTML = `
            <input type="checkbox" class="checkbox-custom" ${task.completed ? 'checked' : ''} onclick="toggleTask(${task.id})">
            <span class="task-text">${escapeHtml(task.text)}</span>
            <span class="badge ${priorityClass}">${getPriorityLabel(task.priority)}</span>
            <div class="due-date ${isOverdue ? 'overdue' : ''}">
                <i class="ph ph-clock"></i> ${task.dueDate ? formatDate(task.dueDate) : 'Без срока'}
            </div>
            <div class="note-cell" title="${escapeHtml(task.note)}">${task.note ? escapeHtml(task.note) : '—'}</div>
            <div class="file-cell">${fileHtml}</div>
            <button class="delete-btn" onclick="deleteTask(${task.id})" title="Удалить">
                <i class="ph ph-trash"></i>
            </button>
        `;
        tasksList.appendChild(li);
    });
}

async function downloadFile(taskId) {
    try {
        const record = await getFileFromDB(taskId);
        if (record && record.file) {
            const task = tasks.find(t => t.id === taskId);
            const fileName = task ? task.fileName : 'download';
            const url = URL.createObjectURL(record.file);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            alert('Файл не найден или был удален.');
        }
    } catch (e) {
        console.error(e);
        alert('Ошибка при получении файла.');
    }
}

function getPriorityLabel(value) {
    switch(value) {
        case 'urgent': return 'Срочно';
        case 'important': return 'Важно';
        case 'normal': return 'Обычное';
        case 'low': return 'Не важно';
        default: return 'Обычное';
    }
}

function formatDate(dateString) {
    const d = new Date(dateString);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Инициализация
initDB().then(() => {
    renderTasks();
}).catch(err => {
    console.error(err);
    alert('Ошибка инициализации базы данных. Файлы не будут сохраняться, но задачи будут работать.');
    renderTasks();
});

// Темы
const themes = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #0f172a 0%, #334155 100%)' // Добавлена темная тема
];

let themeIndex = parseInt(localStorage.getItem('savedThemeIndex')) || 0;
document.body.style.background = themes[themeIndex];

function changeTheme() {
    themeIndex = (themeIndex + 1) % themes.length;
    document.body.style.background = themes[themeIndex];
    localStorage.setItem('savedThemeIndex', themeIndex);
}
