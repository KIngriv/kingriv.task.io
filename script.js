// ============ STATE ============
let tasks = JSON.parse(localStorage.getItem('plannerTasks')) || [];
let currentCategory = 'task';
let editingTaskId = null;
let removeFileOnSave = false;
let currentView = 'list';
let calendarDate = new Date();
let db;
const DB_NAME = 'PlannerFilesDB';
const DB_VERSION = 1;

const categoryTitles = {
  'task': 'ЗАДАЧИ',
  'assignment': 'ПОРУЧЕНИЯ',
  'protocol': 'ПРОТОКОЛЫ',
  'note': 'ЗАМЕТКИ'
};
const categoryLabels = {
  'task': 'Задача',
  'assignment': 'Поручение',
  'protocol': 'Протокол',
  'note': 'Заметка'
};
const categoryIcons = {
  'task': '✓',
  'assignment': '🤝',
  'protocol': '📑',
  'note': '💡'
};
const motivationalQuotes = [
  "Успех — это сумма маленьких усилий, повторяемых день за днём.",
  "Не откладывай на завтра то, что можешь сделать сегодня.",
  "Каждый день — это новая возможность стать лучше.",
  "Дисциплина — это мост между целями и достижениями.",
  "Начинай делать, что необходимо, а затем делай, что возможно.",
  "Путь в тысячу ли начинается с первого шага.",
  "Твоё будущее создаётся тем, что ты делаешь сегодня.",
  "Сложнее всего начать действовать, всё остальное зависит только от упорства.",
  "Не бойся идти медленно, бойся стоять на месте.",
  "Лучшее время, чтобы посадить дерево, было 20 лет назад. Второе лучшее время — сегодня.",
  "Маленькие ежедневные достижения приводят к потрясающим результатам.",
  "Фокус — это ключ к высокой продуктивности.",
  "Действие — это основной ключ к успеху.",
  "Прокрастинация — вор времени.",
  "Сделай сегодня то, что другие не хотят, и завтра будешь жить так, как другие не могут."
];

// ============ MUSIC PLAYER ============
const audioPlayer = document.getElementById('audioPlayer');
const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const progressBar = document.getElementById('progressBar');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const trackNameEl = document.getElementById('trackName');
const volumeSlider = document.getElementById('volumeSlider');

function loadMusicFile(event) {
  const file = event.target.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    audioPlayer.src = url;
    trackNameEl.textContent = file.name.replace(/\.[^/.]+$/, "");
    audioPlayer.load();
  }
}

function togglePlay() {
  if (audioPlayer.src) {
    if (audioPlayer.paused) {
      audioPlayer.play();
      playIcon.className = 'ph ph-pause';
    } else {
      audioPlayer.pause();
      playIcon.className = 'ph ph-play';
    }
  }
}

audioPlayer.addEventListener('timeupdate', () => {
  if (audioPlayer.duration) {
    const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    progressBar.style.width = progress + '%';
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
  }
});

audioPlayer.addEventListener('loadedmetadata', () => {
  durationEl.textContent = formatTime(audioPlayer.duration);
});

audioPlayer.addEventListener('ended', () => {
  playIcon.className = 'ph ph-play';
  progressBar.style.width = '0%';
});

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function setVolume(value) {
  audioPlayer.volume = value / 100;
}

document.getElementById('musicProgress').addEventListener('click', (e) => {
  if (audioPlayer.duration) {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audioPlayer.currentTime = percent * audioPlayer.duration;
  }
});

// ============ INDEXEDDB ============
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject('DB error');
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
    const tx = db.transaction(['files'], 'readwrite');
    const req = tx.objectStore('files').put({ taskId, file });
    req.onsuccess = () => resolve();
    req.onerror = () => reject('Save error');
  });
}
async function getFileFromDB(taskId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['files'], 'readonly');
    const req = tx.objectStore('files').get(taskId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject('Get error');
  });
}
async function deleteFileFromDB(taskId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['files'], 'readwrite');
    const req = tx.objectStore('files').delete(taskId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject('Delete error');
  });
}

// ============ MODAL ============
function openModal() {
  document.getElementById('modalBackdrop').classList.add('active');
  if (!editingTaskId) {
    resetForm();
    document.getElementById('categoryInput').value = currentCategory;
    updateCategorySegment();
    document.getElementById('formTitle').textContent = 'Новая запись';
    handleCategoryChange();
  }
  setTimeout(() => document.getElementById('taskInput').focus(), 100);
}
function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('active');
  if (!editingTaskId) resetForm();
}

function pickCategory(cat) {
  document.getElementById('categoryInput').value = cat;
  updateCategorySegment();
  handleCategoryChange();
}
function updateCategorySegment() {
  const cat = document.getElementById('categoryInput').value;
  document.querySelectorAll('.seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === cat);
  });
}

function handleCategoryChange() {
  const cat = document.getElementById('categoryInput').value;
  document.getElementById('protocolItemsContainer').style.display = cat === 'protocol' ? 'flex' : 'none';
  document.getElementById('noteInteractiveBlock').style.display = cat === 'note' ? 'flex' : 'none';
  if (cat === 'protocol' && document.getElementById('protocolItemsList').children.length === 0) {
    addProtocolItemRow();
  }
  if (cat === 'note') {
    generateNewQuote();
    updateCharCounter();
  }
}

function addProtocolItemRow(text = '', dueDate = '') {
  const container = document.getElementById('protocolItemsList');
  const row = document.createElement('div');
  row.className = 'pi-editor-row';
  row.innerHTML = `
    <input type="text" placeholder="Текст пункта..." class="pi-text" value="${escapeHtml(text)}" required>
    <input type="date" class="pi-date" value="${dueDate}">
    <button type="button" class="pi-remove" onclick="this.parentElement.remove()" title="Удалить">
      <i class="ph ph-x"></i>
    </button>
  `;
  container.appendChild(row);
}

function resetForm() {
  document.getElementById('taskInput').value = '';
  document.getElementById('noteInput').value = '';
  document.getElementById('fileInput').value = '';
  document.getElementById('protocolItemsList').innerHTML = '';
  document.getElementById('dueDateInput').value = '';
  document.getElementById('priorityInput').value = 'normal';
  document.getElementById('currentFileDisplay').style.display = 'none';
  document.getElementById('formTitle').textContent = 'Новая запись';
  document.getElementById('charCount').textContent = '0';
  editingTaskId = null;
  removeFileOnSave = false;
}

function showCurrentFile(fileName) {
  document.getElementById('currentFileName').textContent = fileName;
  document.getElementById('currentFileDisplay').style.display = 'flex';
}

function handleNewFileSelected() {
  const fileInput = document.getElementById('fileInput');
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    if (file.size > 5 * 1024 * 1024) {
      alert('Файл больше 5 МБ.');
      fileInput.value = '';
      return;
    }
    showCurrentFile(file.name);
    removeFileOnSave = false;
  }
}

function removeCurrentFile() {
  removeFileOnSave = true;
  document.getElementById('currentFileDisplay').style.display = 'none';
  document.getElementById('fileInput').value = '';
}

// ============ NOTE INTERACTIVE ============
function generateNewQuote() {
  const quoteText = document.getElementById('quoteText');
  quoteText.style.opacity = '0';
  setTimeout(() => {
    const idx = Math.floor(Math.random() * motivationalQuotes.length);
    quoteText.textContent = motivationalQuotes[idx];
    quoteText.style.opacity = '1';
  }, 250);
}

function insertTemplate(type) {
  const noteInput = document.getElementById('noteInput');
  const templates = {
    meeting: '📅 Встреча:\nУчастники: \nТема: \nРезультаты: ',
    idea: '💡 Идея:\nОписание: \nКак реализовать: \nПриоритет: ',
    todo: '✓ TODO список:\n- \n- \n- ',
    question: '❓ Вопрос:\nСуть: \nКонтекст: \nВозможные ответы: '
  };
  if (noteInput.value && !noteInput.value.endsWith('\n')) noteInput.value += '\n\n';
  noteInput.value += templates[type];
  updateCharCounter();
  noteInput.focus();
}

function updateCharCounter() {
  const noteInput = document.getElementById('noteInput');
  document.getElementById('charCount').textContent = noteInput.value.length;
}

// ============ TASK CRUD ============
async function addTask() {
  const text = document.getElementById('taskInput').value.trim();
  if (!text) { alert('Введите название.'); return; }

  const category = document.getElementById('categoryInput').value;
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];

  if (file && file.size > 5 * 1024 * 1024) {
    alert('Файл больше 5 МБ.');
    return;
  }

  let items = [];
  if (category === 'protocol') {
    document.querySelectorAll('.pi-editor-row').forEach(row => {
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
    const idx = tasks.findIndex(t => t.id === editingTaskId);
    if (idx === -1) return;
    const oldTask = tasks[idx];
    let finalHasFile = oldTask.hasFile;
    let finalFileName = oldTask.fileName;

    if (file) {
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
      if (oldTask.hasFile) {
        try { await deleteFileFromDB(oldTask.id); } catch (e) { console.error(e); }
      }
      finalHasFile = false;
      finalFileName = null;
    }

    tasks[idx] = {
      ...oldTask,
      category,
      title: text,
      priority: document.getElementById('priorityInput').value,
      dueDate: document.getElementById('dueDateInput').value || null,
      note: document.getElementById('noteInput').value.trim(),
      hasFile: finalHasFile,
      fileName: finalFileName,
      items
    };
  } else {
    const newTask = {
      id: Date.now(),
      category,
      title: text,
      completed: false,
      priority: document.getElementById('priorityInput').value,
      dueDate: document.getElementById('dueDateInput').value || null,
      note: document.getElementById('noteInput').value.trim(),
      hasFile: !!file,
      fileName: file ? file.name : null,
      items
    };
    tasks.push(newTask);
    if (file) {
      try {
        await saveFileToDB(newTask.id, file);
      } catch (e) {
        alert('Не удалось сохранить файл.');
        tasks.pop();
        return;
      }
    }
  }

  saveAndRender();
  editingTaskId = null;
  closeModal();
}

function editTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingTaskId = id;
  removeFileOnSave = false;

  document.getElementById('categoryInput').value = task.category;
  updateCategorySegment();
  document.getElementById('taskInput').value = task.title;
  document.getElementById('priorityInput').value = task.priority;
  document.getElementById('dueDateInput').value = task.dueDate || '';
  document.getElementById('noteInput').value = task.note || '';
  document.getElementById('fileInput').value = '';

  if (task.hasFile && task.fileName) {
    showCurrentFile(task.fileName);
  } else {
    document.getElementById('currentFileDisplay').style.display = 'none';
  }

  handleCategoryChange();

  if (task.category === 'protocol' && task.items) {
    document.getElementById('protocolItemsList').innerHTML = '';
    task.items.forEach(item => addProtocolItemRow(item.text, item.dueDate || ''));
  }

  document.getElementById('formTitle').textContent = 'Редактирование';
  document.getElementById('modalBackdrop').classList.add('active');
  setTimeout(() => document.getElementById('taskInput').focus(), 100);
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
  const filtered = tasks.filter(t => t.category === currentCategory);
  if (filtered.length === 0) { alert('Нет записей для удаления.'); return; }
  const label = categoryLabels[currentCategory].toLowerCase();
  if (!confirm(`Удалить все ${label} (${filtered.length} шт.)?`)) return;
  for (const task of filtered) {
    if (task.hasFile) {
      try { await deleteFileFromDB(task.id); } catch (e) { console.error(e); }
    }
  }
  tasks = tasks.filter(t => t.category !== currentCategory);
  saveAndRender();
}

function setCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('currentCategoryTitle').textContent = categoryTitles[cat];
  renderTasks();
  if (currentView === 'calendar') renderCalendar();
}

function saveAndRender() {
  localStorage.setItem('plannerTasks', JSON.stringify(tasks));
  renderTasks();
  updateStats();
  updateCategoryCounts();
  if (currentView === 'calendar') renderCalendar();
}

// ============ FILTERS ============
function applyFilters() { renderTasks(); }
function resetFilters() {
  document.getElementById('filterPriority').value = 'all';
  document.getElementById('filterStatus').value = 'all';
  document.getElementById('filterDate').value = 'all';
  renderTasks();
}

function getFilteredTasks() {
  const priority = document.getElementById('filterPriority').value;
  const status = document.getElementById('filterStatus').value;
  const dateFilter = document.getElementById('filterDate').value;

  let filtered = tasks.filter(t => t.category === currentCategory);
  if (priority !== 'all') filtered = filtered.filter(t => t.priority === priority);
  if (status === 'active') filtered = filtered.filter(t => !t.completed);
  else if (status === 'completed') filtered = filtered.filter(t => t.completed);

  if (dateFilter !== 'all') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    filtered = filtered.filter(task => {
      const dates = [];
      if (task.category === 'protocol' && task.items) {
        task.items.forEach(item => {
          if (item.dueDate) dates.push(new Date(item.dueDate));
        });
      } else if (task.dueDate) {
        dates.push(new Date(task.dueDate));
      }
      if (dateFilter === 'nodate') return dates.length === 0;
      if (dates.length === 0) return false;
      return dates.some(date => {
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        if (dateFilter === 'today') return dayStart.getTime() === today.getTime();
        if (dateFilter === 'week') return dayStart >= today && dayStart <= weekLater;
        if (dateFilter === 'overdue') return dayStart < today;
        return true;
      });
    });
  }
  return filtered;
}

// ============ VIEW SWITCH ============
function switchView(view) {
  currentView = view;
  document.getElementById('viewListBtn').classList.toggle('active', view === 'list');
  document.getElementById('viewCalendarBtn').classList.toggle('active', view === 'calendar');
  document.getElementById('tasksContainer').style.display = view === 'list' ? 'flex' : 'none';
  document.getElementById('calendarContainer').style.display = view === 'calendar' ? 'block' : 'none';
  document.getElementById('compactToolbar').style.display = view === 'list' ? 'flex' : 'none';
  if (view === 'calendar') renderCalendar();
}

// ============ CALENDAR ============
const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function changeMonth(delta) {
  calendarDate.setMonth(calendarDate.getMonth() + delta);
  renderCalendar();
}
function goToToday() {
  calendarDate = new Date();
  renderCalendar();
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  document.getElementById('calendarTitle').textContent = `${monthNames[month]} ${year}`;

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  let startWeekday = firstDay.getDay() - 1;
  if (startWeekday < 0) startWeekday = 6;

  const today = new Date();
  const todayStr = today.toDateString();
  const prevMonthLastDay = new Date(year, month, 0).getDate();

  for (let i = startWeekday - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    const cellDate = new Date(year, month - 1, dayNum);
    grid.appendChild(createCalendarCell(dayNum, cellDate, true, todayStr));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(year, month, d);
    grid.appendChild(createCalendarCell(d, cellDate, false, todayStr));
  }
  const totalCells = grid.children.length;
  const remaining = (totalCells <= 35) ? 35 - totalCells : 42 - totalCells;
  for (let d = 1; d <= remaining; d++) {
    const cellDate = new Date(year, month + 1, d);
    grid.appendChild(createCalendarCell(d, cellDate, true, todayStr));
  }
}

function createCalendarCell(dayNum, cellDate, isOtherMonth, todayStr) {
  const cell = document.createElement('div');
  cell.className = 'cal-day';
  if (isOtherMonth) cell.classList.add('other-month');
  if (cellDate.toDateString() === todayStr) cell.classList.add('today');

  const numEl = document.createElement('div');
  numEl.className = 'cal-day-number';
  numEl.textContent = dayNum;
  cell.appendChild(numEl);

  const cellDayStart = new Date(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
  const cellDayEnd = new Date(cellDayStart.getTime() + 24 * 60 * 60 * 1000);

  const dayTasks = [];
  tasks.forEach(task => {
    const dates = [];
    if (task.category === 'protocol' && task.items) {
      task.items.forEach(item => {
        if (item.dueDate) dates.push({
          date: new Date(item.dueDate),
          title: item.text,
          priority: task.priority,
          completed: item.completed || task.completed,
          taskId: task.id,
          category: task.category
        });
      });
    } else if (task.dueDate) {
      dates.push({
        date: new Date(task.dueDate),
        title: task.title,
        priority: task.priority,
        completed: task.completed,
        taskId: task.id,
        category: task.category
      });
    }
    dates.forEach(d => {
      if (d.date >= cellDayStart && d.date < cellDayEnd) dayTasks.push(d);
    });
  });

  const priorityOrder = { urgent: 0, important: 1, normal: 2, low: 3 };
  dayTasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const maxVisible = 3;
  dayTasks.slice(0, maxVisible).forEach(t => {
    const taskEl = document.createElement('div');
    taskEl.className = `cal-task cat-${t.category} priority-${t.priority} ${t.completed ? 'completed' : ''}`;
    const icon = categoryIcons[t.category] || '';
    taskEl.innerHTML = `<span>${icon}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.title)}</span>`;
    taskEl.title = `${categoryLabels[t.category]}: ${t.title}`;
    taskEl.onclick = (e) => { e.stopPropagation(); editTask(t.taskId); };
    cell.appendChild(taskEl);
  });

  if (dayTasks.length > maxVisible) {
    const moreEl = document.createElement('div');
    moreEl.className = 'cal-task-more';
    moreEl.textContent = `+${dayTasks.length - maxVisible} ещё`;
    cell.appendChild(moreEl);
  }
  return cell;
}

// ============ STATS ============
function animateNumber(el, target) {
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;
  const duration = 500;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(current + (target - current) * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateStats() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  let todayCount = 0, upcomingCount = 0, overdueCount = 0, completedCount = 0;

  tasks.forEach(task => {
    if (task.completed) { completedCount++; return; }
    const dates = [];
    if (task.category === 'protocol' && task.items) {
      task.items.forEach(item => {
        if (!item.completed && item.dueDate) dates.push(new Date(item.dueDate));
      });
    } else if (task.dueDate) {
      dates.push(new Date(task.dueDate));
    }
    dates.forEach(date => {
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      if (dayStart < today) overdueCount++;
      else if (dayStart <= weekLater) {
        if (dayStart.getTime() === today.getTime()) todayCount++;
        else upcomingCount++;
      }
    });
  });

  animateNumber(document.getElementById('todayCount'), todayCount);
  animateNumber(document.getElementById('upcomingCount'), upcomingCount);
  animateNumber(document.getElementById('overdueCount'), overdueCount);
  animateNumber(document.getElementById('completedCount'), completedCount);
  document.getElementById('footer-done').textContent = completedCount;
  document.getElementById('footer-overdue').textContent = overdueCount;
}

function updateCategoryCounts() {
  ['task', 'assignment', 'protocol', 'note'].forEach(cat => {
    const count = tasks.filter(t => t.category === cat && !t.completed).length;
    const el = document.getElementById(`count-${cat}`);
    if (el) el.textContent = count;
  });
}

// ============ COUNTDOWN ============
function getCountdownHTML(dueDate, completed) {
  if (completed) return `<div class="countdown cd-completed"><i class="ph ph-check"></i>Готово</div>`;
  if (!dueDate) return `<div class="countdown cd-none">Без срока</div>`;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(dueDate);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `<div class="countdown cd-overdue"><i class="ph ph-warning"></i>-${Math.abs(diffDays)} дн.</div>`;
  if (diffDays === 0) return `<div class="countdown cd-urgent"><i class="ph ph-fire"></i>Сегодня</div>`;
  if (diffDays === 1) return `<div class="countdown cd-warning"><i class="ph ph-hourglass"></i>Завтра</div>`;
  if (diffDays <= 5) return `<div class="countdown cd-warning"><i class="ph ph-hourglass"></i>${diffDays} дн.</div>`;
  return `<div class="countdown cd-normal"><i class="ph ph-calendar"></i>${diffDays} дн.</div>`;
}

function getEarliestDueDate(task) {
  if (task.category === 'protocol' && task.items && task.items.length > 0) {
    const dates = task.items.filter(i => !i.completed && i.dueDate).map(i => new Date(i.dueDate).getTime());
    if (dates.length > 0) return Math.min(...dates);
  }
  return task.dueDate ? new Date(task.dueDate).getTime() : new Date('9999-12-31').getTime();
}

// ============ RENDER ============
function renderTasks() {
  const container = document.getElementById('tasksContainer');
  container.innerHTML = '';
  let filtered = getFilteredTasks();

  const priorityOrder = { urgent: 0, important: 1, normal: 2, low: 3 };
  filtered.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return getEarliestDueDate(a) - getEarliestDueDate(b);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="ph ph-inbox"></i>
        <p>Нет задач по выбранным фильтрам</p>
        <p>Попробуйте изменить параметры или добавить новую запись</p>
      </div>
    `;
    return;
  }

  filtered.forEach(task => {
    const div = document.createElement('div');
    div.className = `task-row ${task.completed ? 'completed' : ''}`;
    div.dataset.cat = task.category;

    const fileHtml = task.hasFile
      ? `<button class="task-file-btn" onclick="downloadFile(${task.id})" title="${escapeHtml(task.fileName)}"><i class="ph ph-download-simple"></i>Файл</button>`
      : `<span class="task-file-empty">—</span>`;

    let itemsHtml = '';
    if (task.category === 'protocol' && task.items && task.items.length > 0) {
      itemsHtml = `<div class="protocol-items-list">`;
      task.items.forEach(item => {
        itemsHtml += `
          <div class="pi-row ${item.completed ? 'completed' : ''}">
            <button class="task-check ${item.completed ? 'checked' : ''}" onclick="toggleProtocolItem(${task.id}, '${item.id}')">
              <i class="ph ${item.completed ? 'ph-check' : ''}"></i>
            </button>
            <span class="pi-text">${escapeHtml(item.text)}</span>
            <div class="pi-countdown">${getCountdownHTML(item.dueDate, item.completed)}</div>
            <button class="icon-btn danger" onclick="deleteProtocolItem(${task.id}, '${item.id}')" title="Удалить пункт">
              <i class="ph ph-trash"></i>
            </button>
          </div>
        `;
      });
      itemsHtml += `</div>`;
    }

    div.innerHTML = `
      <div class="task-main">
        <button class="task-check ${task.completed ? 'checked' : ''}" onclick="toggleTask(${task.id})" title="Отметить">
          <i class="ph ${task.completed ? 'ph-check' : ''}"></i>
        </button>
        <div class="task-body">
          <div class="task-title">${escapeHtml(task.title)}</div>
          ${task.note ? `<div class="task-note-inline" title="${escapeHtml(task.note)}">${escapeHtml(task.note)}</div>` : ''}
        </div>
        <span class="task-badge badge-${task.priority}">${getPriorityLabel(task.priority)}</span>
        <div>${getCountdownHTML(task.dueDate, task.completed)}</div>
        <div>${fileHtml}</div>
        <div class="task-actions">
          <button class="icon-btn" onclick="editTask(${task.id})" title="Редактировать">
            <i class="ph ph-pencil-simple"></i>
          </button>
          <button class="icon-btn danger" onclick="deleteTask(${task.id})" title="Удалить">
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
    urgent: '🔥 Срочно',
    important: '⭐ Важно',
    normal: '📌 Обычное',
    low: '☕ Не важно'
  };
  return labels[value] || '📌 Обычное';
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============ INIT ============
function setCurrentDate() {
  const now = new Date();
  const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const formatted = now.toLocaleDateString('ru-RU', opts);
  document.getElementById('currentDate').textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

initDB().then(() => {
  setCurrentDate();
  renderTasks();
  updateStats();
  updateCategoryCounts();
  setInterval(() => {
    renderTasks();
    updateStats();
  }, 60000);
}).catch(err => {
  console.error(err);
  setCurrentDate();
  renderTasks();
  updateStats();
  updateCategoryCounts();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    openModal();
  }
});