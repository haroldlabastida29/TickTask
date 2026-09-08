/* ==========================================
   1. CONFIG & DATA MODELS
   ========================================== */
const PRIORITY_WEIGHTS = {
  High: 3,
  Medium: 2,
  Low: 1
};

class Task {
  constructor(taskId, userId, title, subject, category, deadline, priority, description = "", status = "Pending") {
    this.taskId = String(taskId); // Force consistency as a string
    this.userId = userId;
    this.title = title;
    this.subject = subject;
    this.category = category;
    this.deadline = deadline;
    this.priority = priority;
    this.description = description;
    this.status = status;
  }
}

class TaskManager {
  constructor() {
    this.taskArray = [];
    this.taskMap = new Map();
  }

  loadTasks(rawTasks) {
    this.taskArray = [];
    this.taskMap.clear();

    if (!Array.isArray(rawTasks)) return;

    rawTasks.forEach(record => {
      const task = new Task(
        record.taskId,
        record.userId,
        record.title,
        record.subject,
        record.category,
        record.deadline,
        record.priority,
        record.description || "",
        record.status
      );
      this.taskArray.push(task);
      this.taskMap.set(task.taskId, task);
    });
  }

  addTask(taskData) {
    const newTask = new Task(
      taskData.taskId,
      taskData.userId,
      taskData.title,
      taskData.subject,
      taskData.category,
      taskData.deadline,
      taskData.priority,
      taskData.description || "",
      taskData.status
    );

    this.taskArray.push(newTask);
    this.taskMap.set(newTask.taskId, newTask);
    return newTask;
  }

  updateTask(taskId, updatedFields) {
    const stringId = String(taskId);
    if (this.taskMap.has(stringId)) {
      const task = this.taskMap.get(stringId);
      Object.assign(task, updatedFields);
      return true;
    }
    return false;
  }

  updateTaskStatus(taskId, newStatus) {
    const stringId = String(taskId);
    if (this.taskMap.has(stringId)) {
      const task = this.taskMap.get(stringId);
      task.status = newStatus;
      return true;
    }
    return false;
  }

  deleteTask(taskId) {
    const stringId = String(taskId);
    if (this.taskMap.has(stringId)) {
      this.taskMap.delete(stringId);
      const index = this.taskArray.findIndex(task => task.taskId === stringId);
      if (index !== -1) {
        this.taskArray.splice(index, 1);
      }
      return true;
    }
    return false;
  }

  searchTasks(keyword) {
    if (!keyword || keyword.trim() === "") {
      return [...this.taskArray];
    }

    const lowerKeyword = keyword.toLowerCase().trim();
    return this.taskArray.filter(task => 
      (task.title && task.title.toLowerCase().includes(lowerKeyword)) ||
      (task.subject && task.subject.toLowerCase().includes(lowerKeyword)) ||
      (task.category && task.category.toLowerCase().includes(lowerKeyword)) ||
      (task.description && task.description.toLowerCase().includes(lowerKeyword))
    );
  }

  filterTasks(taskList, statusFilter, categoryFilter) {
    return taskList.filter(task => {
      const sFilter = (statusFilter || "ALL").trim().toUpperCase();
      const cFilter = (categoryFilter || "ALL").trim().toUpperCase();

      const taskStatus = (task.status || "").trim().toUpperCase();
      const taskCategory = (task.category || "").trim().toUpperCase();

      const matchesStatus = (sFilter === "ALL" || taskStatus === sFilter);
      const matchesCategory = (cFilter === "ALL" || taskCategory === cFilter);

      return matchesStatus && matchesCategory;
    });
  }

  sortByDeadlineAndPriority(taskList, ascending = true) {
    return [...taskList].sort((a, b) => {
      const dateA = new Date(a.deadline);
      const dateB = new Date(b.deadline);

      if (dateA.getTime() !== dateB.getTime()) {
        return ascending ? dateA - dateB : dateB - dateA;
      }

      const weightA = PRIORITY_WEIGHTS[a.priority] || 0;
      const weightB = PRIORITY_WEIGHTS[b.priority] || 0;

      return weightB - weightA;
    });
  }
}

const taskManager = new TaskManager();
let currentUser = null;
let currentDisplayList = [];
let sortAscending = true;
let isLoading = false;

/* ==========================================
   2. EXPRESS BACKEND DATABASE HELPERS
   ========================================== */
async function fetchUserTasksFromFirestore(userId) {
  try {
    const response = await fetch(`./tasks.php?userId=${userId}`, {
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Failed to fetch tasks');
    const tasks = await response.json();
    return tasks;
  } catch (error) {
    console.error("Error loading tasks:", error);
    return [];
  }
}

async function saveTaskToFirestore(taskData) {
  const response = await fetch('./tasks.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: currentUser ? currentUser.uid : localStorage.getItem("userId"),
      ...taskData
    })
  });
  const responseText = await response.text();
  let result;
  try {
      result = responseText ? JSON.parse(responseText) : {};
  } catch (parseErr) {
      throw new Error(responseText || "Server returned an invalid response.");
  }
  if (!response.ok) throw new Error(result.error || 'Failed to save task');
  return result.taskId;
}

async function updateFirestoreTaskData(taskId, updatedFields) {
  await fetch(`./tasks.php`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ taskId, ...updatedFields })
  });
}

async function updateFirestoreTaskStatus(taskId, newStatus) {
  await fetch(`./tasks.php`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ taskId, status: newStatus })
  });
}

async function deleteFirestoreTask(taskId) {
  await fetch(`./tasks.php?taskId=${taskId}`, {
    method: 'DELETE',
    credentials: 'include'
  });
}

/* ==========================================
   3. AUTHENTICATION & INITIALIZATION LOGIC
   ========================================== */
const authContainer = document.getElementById("auth-container");
const dashboardContainer = document.getElementById("dashboard-container");
const userDisplayName = document.getElementById("user-display-name");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const globalLoader = document.getElementById("global-loader");

function showLoader(show = true) {
  if (!globalLoader) return;
  if (show) {
    globalLoader.classList.remove("hidden");
  } else {
    globalLoader.classList.add("hidden");
  }
}

function clearAuthForms() {
  if (loginForm) loginForm.reset();
  if (registerForm) registerForm.reset();
}

if (tabLogin) {
  tabLogin.addEventListener("click", () => {
    tabLogin.classList.add("active-tab");
    tabRegister.classList.remove("active-tab");
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
  });
}

if (tabRegister) {
  tabRegister.addEventListener("click", () => {
    tabRegister.classList.add("active-tab");
    tabLogin.classList.remove("active-tab");
    registerForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
  });
}

function initializeApp() {
  if (authContainer) authContainer.classList.remove("hidden");
  if (dashboardContainer) dashboardContainer.classList.add("hidden");
  
  document.title = "TickTask | Task Manager";
  
  const savedUserId = localStorage.getItem("userId");
  const savedEmail = localStorage.getItem("userEmail");
  const savedFullName = localStorage.getItem("userFullName") || "";

  if (savedUserId) {
    enterDashboard(savedUserId, savedEmail, savedFullName);
  }

  const addDateContainer = document.getElementById("add-date-container");
  if (addDateContainer) {
    setupTripleDateContainer(addDateContainer);
  }

  const editDateContainer = document.getElementById("edit-date-container");
  if (editDateContainer) {
    setupTripleDateContainer(editDateContainer);
  }
}

async function enterDashboard(userId, email, fullName) {
  currentUser = { uid: userId, email: email, fullName: fullName };
  
  localStorage.setItem("userId", userId);
  localStorage.setItem("userEmail", email || "");
  localStorage.setItem("userFullName", fullName || "");

  if (authContainer) authContainer.classList.add("hidden");
  if (dashboardContainer) dashboardContainer.classList.remove("hidden");
  if (userDisplayName) {
    userDisplayName.textContent = `User: ${currentUser.fullName || (currentUser.email ? currentUser.email.split('@')[0] : '')}`;
  }

  taskManager.loadTasks([]);
  isLoading = true;
  showLoader(true);
  renderUI();

  const userTasks = await fetchUserTasksFromFirestore(currentUser.uid);
  taskManager.loadTasks(userTasks);
  isLoading = false;
  showLoader(false);
  renderUI();
}

// Handle Login Form Submission
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const errorMsgEl = document.getElementById("login-error-msg");
    if (errorMsgEl) errorMsgEl.style.display = "none";

    const emailInput = document.getElementById("login-email");
    const passInput = document.getElementById("login-password");
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passInput ? passInput.value : "";

    if (emailInput) emailInput.disabled = true;
    if (passInput) passInput.disabled = true;
    if (submitBtn) submitBtn.classList.add("is-loading");
    showLoader(true);

    try {
      const response = await fetch(`./auth.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'login', email, password })
      });

      const responseText = await response.text();
      let result;
      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch (parseErr) {
        throw new Error(responseText || "Server returned an invalid response.");
      }

      if (!response.ok) throw new Error(result.error || 'Login failed');

      enterDashboard(result.userId, result.email, result.fullName);
    } catch (err) {
      if (errorMsgEl) {
        errorMsgEl.textContent = err.message;
        errorMsgEl.style.display = "block";
      }

      showLoader(false);
      
      if (emailInput) emailInput.disabled = false;
      if (passInput) {
        passInput.disabled = false;
        passInput.value = "";
        setTimeout(() => {
          passInput.focus();
        }, 50);
      }
    } finally {
      if (submitBtn) submitBtn.classList.remove("is-loading");
    }
  });
}

// Handle Register Form Submission
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const nameInput = document.getElementById("register-name");
    const usernameInput = document.getElementById("reg-username");
    const emailInput = document.getElementById("reg-email");
    const passInput = document.getElementById("reg-password");
    const submitBtn = registerForm.querySelector('button[type="submit"]');

    const fullName = nameInput ? nameInput.value.trim() : "";
    const username = usernameInput ? usernameInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passInput ? passInput.value : "";

    if (submitBtn) submitBtn.classList.add("is-loading");
    showLoader(true);

    try {
      const response = await fetch(`./auth.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'register', email, password, fullName, username })
      });

      const responseText = await response.text();
      let result;
      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch (parseErr) {
        throw new Error(responseText || "Server returned an invalid response.");
      }

      if (!response.ok) throw new Error(result.error || 'Registration failed');

      alert("Account created successfully! Logging you in...");
      enterDashboard(result.userId, result.email, result.fullName);
    } catch (err) {
      alert(err.message);
      showLoader(false);
    } finally {
      if (submitBtn) submitBtn.classList.remove("is-loading");
    }
  });
}

const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    currentUser = null;
    
    localStorage.removeItem("userId");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userFullName");

    taskManager.loadTasks([]);
    if (taskListContainer) taskListContainer.innerHTML = "";
    if (dashboardContainer) dashboardContainer.classList.add("hidden");
    if (authContainer) authContainer.classList.remove("hidden");
    
    clearAuthForms();

    const loginEmailInput = document.getElementById("login-email");
    const loginPassInput = document.getElementById("login-password");
    const errorMsgEl = document.getElementById("login-error-msg");

    if (loginEmailInput) loginEmailInput.disabled = false;
    if (loginPassInput) loginPassInput.disabled = false;
    if (errorMsgEl) errorMsgEl.style.display = "none";

    if (tabLogin) tabLogin.classList.add("active-tab");
    if (tabRegister) tabRegister.classList.remove("active-tab");
    if (loginForm) loginForm.classList.remove("hidden");
    if (registerForm) registerForm.classList.add("hidden");
  });
}

/* ==========================================
   4. DOM ELEMENTS & TOOLBAR DECLARATIONS
   ========================================== */
const searchInput = document.getElementById("search-input");
const filterStatus = document.getElementById("filter-status");
const filterCategory = document.getElementById("filter-category");
const sortDeadlineBtn = document.getElementById("sort-deadline-btn");
const taskListContainer = document.getElementById("task-list");

const editModal = document.getElementById("edit-modal");
const editTaskForm = document.getElementById("edit-task-form");
const closeModalBtn = document.getElementById("close-modal-btn");

/* ==========================================
   5. TASK FORM HANDLERS & MODAL EVENTS
   ========================================== */
const addTaskForm = document.getElementById("add-task-form");
if (addTaskForm) {
  addTaskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) {
      alert("No active session found.");
      return;
    }

    const submitBtn = addTaskForm.querySelector('button[type="submit"]');
    const tempId = "temp_" + Date.now();
    const descEl = document.getElementById("task-description");
    const addDateContainer = document.getElementById("add-date-container");
    const deadlineVal = addDateContainer ? getTripleDateValue(addDateContainer) : document.getElementById("task-deadline")?.value;

    if (!deadlineVal) {
      alert("Please provide a valid deadline date.");
      return;
    }

    const rawTaskData = {
      userId: currentUser.uid,
      title: document.getElementById("task-title").value.trim(),
      subject: document.getElementById("task-subject").value.trim(),
      category: document.getElementById("task-category").value,
      priority: document.getElementById("task-priority").value,
      deadline: deadlineVal,
      description: descEl ? descEl.value.trim() : "",
      status: "Pending"
    };

    const addedTask = taskManager.addTask({ taskId: tempId, ...rawTaskData });

    addTaskForm.reset();
    if (addDateContainer) setTripleDateValue(addDateContainer, "");
    if (searchInput) searchInput.value = "";
    if (filterStatus) filterStatus.value = "ALL";
    if (filterCategory) filterCategory.value = "ALL";

    renderUI();
    if (submitBtn) submitBtn.classList.add("is-loading");

    try {
      const phpTaskId = await saveTaskToFirestore(rawTaskData);
      taskManager.taskMap.delete(tempId);
      addedTask.taskId = String(phpTaskId);
      taskManager.taskMap.set(addedTask.taskId, addedTask);
      renderUI();
    } catch (err) {
      console.error("Database save failed:", err);
      alert("Failed to sync task with local database: " + err.message);
    } finally {
      if (submitBtn) submitBtn.classList.remove("is-loading");
    }
  });
}

if (taskListContainer) {
  taskListContainer.addEventListener("click", async (e) => {
    const completeBtn = e.target.closest(".btn-complete");
    const deleteBtn = e.target.closest(".btn-delete");
    const editBtn = e.target.closest(".btn-edit");
    const toggleBtn = e.target.closest(".toggle-details-btn");

    if (completeBtn) {
      const taskId = completeBtn.getAttribute("data-id");
      completeBtn.classList.add("is-loading");
      taskManager.updateTaskStatus(taskId, "Completed");
      renderUI();
      await updateFirestoreTaskStatus(taskId, "Completed");
      completeBtn.classList.remove("is-loading");
      return;
    } 
    
    if (deleteBtn) {
      const taskId = deleteBtn.getAttribute("data-id");
      deleteBtn.classList.add("is-loading");
      taskManager.deleteTask(taskId);
      renderUI();
      await deleteFirestoreTask(taskId);
      return;
    } 
    
    if (editBtn) {
      const taskId = editBtn.getAttribute("data-id");
      openEditModal(taskId);
      return;
    }

    if (toggleBtn) {
      const taskId = toggleBtn.getAttribute("data-id");
      const descEl = document.getElementById(`desc-${taskId}`);
      if (descEl) {
        descEl.classList.toggle("expanded");
        toggleBtn.classList.toggle("flipped");
      }
      return;
    }
  });
}

function openEditModal(taskId) {
  const task = taskManager.taskMap.get(String(taskId));
  if (!task) return;

  document.getElementById("edit-task-id").value = task.taskId;
  document.getElementById("edit-task-title").value = task.title;
  document.getElementById("edit-task-subject").value = task.subject;
  document.getElementById("edit-task-category").value = task.category;
  document.getElementById("edit-task-priority").value = task.priority;
  
  const editDateContainer = document.getElementById("edit-date-container");
  if (editDateContainer) {
    setTripleDateValue(editDateContainer, task.deadline);
  } else {
    const deadlineInput = document.getElementById("edit-task-deadline");
    if (deadlineInput) deadlineInput.value = task.deadline;
  }
  
  const editDescEl = document.getElementById("edit-task-description");
  if (editDescEl) editDescEl.value = task.description || "";

  if (editModal) editModal.classList.remove("hidden");
}

if (closeModalBtn) {
  closeModalBtn.addEventListener("click", () => {
    if (editModal) editModal.classList.add("hidden");
  });
}

if (editTaskForm) {
  editTaskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const taskId = document.getElementById("edit-task-id").value;
    const editDescEl = document.getElementById("edit-task-description");
    const editDateContainer = document.getElementById("edit-date-container");
    const deadlineVal = editDateContainer ? getTripleDateValue(editDateContainer) : document.getElementById("edit-task-deadline")?.value;
    const submitBtn = editTaskForm.querySelector('button[type="submit"]');

    if (!deadlineVal) {
      alert("Please provide a valid deadline date.");
      return;
    }
    
    const updatedFields = {
      title: document.getElementById("edit-task-title").value.trim(),
      subject: document.getElementById("edit-task-subject").value.trim(),
      category: document.getElementById("edit-task-category").value,
      priority: document.getElementById("edit-task-priority").value,
      deadline: deadlineVal,
      description: editDescEl ? editDescEl.value.trim() : ""
    };

    taskManager.updateTask(taskId, updatedFields);
    if (editModal) editModal.classList.add("hidden");
    renderUI();
    if (submitBtn) submitBtn.classList.add("is-loading");

    try {
      await updateFirestoreTaskData(taskId, updatedFields);
    } catch (err) {
      console.error("Failed to update task:", err);
      alert("Failed to save updates to local database.");
    } finally {
      if (submitBtn) submitBtn.classList.remove("is-loading");
    }
  });
}

if (searchInput) searchInput.addEventListener("input", () => renderUI());
if (filterStatus) filterStatus.addEventListener("change", () => renderUI());
if (filterCategory) filterCategory.addEventListener("change", () => renderUI());

if (sortDeadlineBtn) {
  sortDeadlineBtn.addEventListener("click", () => {
    sortAscending = !sortAscending;
    sortDeadlineBtn.textContent = `Sort by Deadline ${sortAscending ? "↑" : "↓"}`;
    renderUI();
  });
}

/* ==========================================
   6. DISPLAY RENDERERS
   ========================================== */
function formatDate(dateString) {
  if (!dateString) return "";
  const parts = dateString.split("-");
  if (parts.length !== 3) return dateString;
  
  const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
  return dateObj.toLocaleDateString("en-US", {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function renderUI() {
  if (isLoading) {
    if (taskListContainer) {
      taskListContainer.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">Loading tasks...</p>`;
    }
    return;
  }

  const searchVal = searchInput ? searchInput.value : "";
  const statusVal = filterStatus ? filterStatus.value : "ALL";
  const categoryVal = filterCategory ? filterCategory.value : "ALL";

  let result = taskManager.searchTasks(searchVal);
  result = taskManager.filterTasks(result, statusVal, categoryVal);
  result = taskManager.sortByDeadlineAndPriority(result, sortAscending);
  
  currentDisplayList = result;
  renderTaskList(currentDisplayList);
}

function isOverdue(deadlineStr, status) {
  if (status === "Completed") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(deadlineStr);
  return deadline < today;
}

function renderTaskList(tasks) {
  if (!taskListContainer) return;
  taskListContainer.innerHTML = "";

  if (tasks.length === 0) {
    taskListContainer.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">No tasks found.</p>`;
    return;
  }

  tasks.forEach(task => {
    const taskCard = document.createElement("div");
    const overdue = isOverdue(task.deadline, task.status);
    taskCard.className = `task-card ${overdue ? "task-overdue" : ""}`;

    const hasDescription = task.description && task.description.trim() !== "";

    taskCard.innerHTML = `
      <div class="task-info" style="flex: 1; padding-right: 15px;">
        <div class="task-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <h4 style="margin: 0;">
            ${task.title}
            ${overdue ? `<span class="badge" style="background:#ef4444; color:#fff; font-size:10px; margin-left:8px;">OVERDUE</span>` : ""}
          </h4>
          ${hasDescription ? `
            <button class="toggle-details-btn" type="button" data-id="${task.taskId}" title="Toggle Details">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>` : ""}
        </div>
        
        <p style="margin: 0 0 8px 0;"><strong>${task.subject}</strong> | Due: ${formatDate(task.deadline)}</p>
        
        <div class="task-tags">
          <span class="badge badge-priority-${task.priority}">${task.priority}</span>
          <span class="badge badge-status-${task.status}">${task.status}</span>
          <span class="badge" style="background: var(--border-color); color: var(--text-main);">${task.category}</span>
        </div>

        ${hasDescription ? `
          <div class="task-description-collapse" id="desc-${task.taskId}">
            <p style="margin: 0;">${task.description}</p>
          </div>
        ` : ""}
      </div>

      <div class="task-actions">
        ${task.status === "Pending" ? `<button class="btn-complete" data-id="${task.taskId}">✓ Complete</button>` : ""}
        <button class="btn-edit" data-id="${task.taskId}">✎ Edit</button>
        <button class="btn-delete" data-id="${task.taskId}">✕ Delete</button>
      </div>
    `;

    taskListContainer.appendChild(taskCard);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  initializeApp();
  const addDateContainer = document.getElementById("add-date-container");
  if (addDateContainer) setupTripleDateContainer(addDateContainer);

  const editDateContainer = document.getElementById("edit-date-container");
  if (editDateContainer) setupTripleDateContainer(editDateContainer);
});

/* ==========================================
   7. PWA SERVICE WORKER REGISTRATION (Bypassed for Electron file protocol)
   ========================================== */
if ('serviceWorker' in navigator && !window.location.protocol.includes('file:')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('Service Worker registered successfully:', reg.scope))
      .catch((err) => console.log('Service Worker registration failed:', err));
  });
}

/* ==========================================
   TRIPLE DROPDOWN DATE INITIALIZATION & HANDLERS
   ========================================== */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function populateMonthSelector(monthSelect) {
  if (!monthSelect) return;
  monthSelect.innerHTML = `<option value="" disabled selected>Month</option>`;
  MONTH_NAMES.forEach((name, index) => {
    const monthNum = String(index + 1).padStart(2, '0');
    const opt = document.createElement('option');
    opt.value = monthNum;
    opt.textContent = name;
    monthSelect.appendChild(opt);
  });
}

function populateYearSelector(yearSelect) {
  if (!yearSelect) return;
  yearSelect.innerHTML = `<option value="" disabled selected>Year</option>`;
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y <= currentYear + 5; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }
}

function updateDays(container, targetDayVal = null) {
  const monthSelect = container.querySelector(".select-month");
  const daySelect = container.querySelector(".select-day");
  const yearSelect = container.querySelector(".select-year");
  if (!monthSelect || !daySelect || !yearSelect) return;

  const currentSelectedDay = targetDayVal !== null ? targetDayVal : daySelect.value;
  
  const month = parseInt(monthSelect.value, 10);
  const year = parseInt(yearSelect.value, 10);

  let daysInMonth = 31;
  if (!isNaN(month)) {
    const calcYear = !isNaN(year) ? year : new Date().getFullYear();
    daysInMonth = new Date(calcYear, month, 0).getDate();
  }

  daySelect.innerHTML = `<option value="" disabled selected>Day</option>`;
  for (let i = 1; i <= daysInMonth; i++) {
    const dayNum = String(i).padStart(2, '0');
    const opt = document.createElement('option');
    opt.value = dayNum;
    opt.textContent = i;
    daySelect.appendChild(opt);
  }

  if (currentSelectedDay) {
    const numericDay = parseInt(currentSelectedDay, 10);
    if (!isNaN(numericDay) && numericDay <= daysInMonth) {
      daySelect.value = currentSelectedDay;
    } else if (!isNaN(numericDay)) {
      daySelect.value = String(daysInMonth).padStart(2, '0');
    }
  }
}

function setupTripleDateContainer(container) {
  if (!container) return;
  const monthSelect = container.querySelector(".select-month");
  const daySelect = container.querySelector(".select-day");
  const yearSelect = container.querySelector(".select-year");

  populateMonthSelector(monthSelect);
  populateYearSelector(yearSelect);
  updateDays(container);

  if (monthSelect && !monthSelect.dataset.listenerAttached) {
    monthSelect.addEventListener("change", () => updateDays(container));
    monthSelect.dataset.listenerAttached = "true";
  }

  if (yearSelect && !yearSelect.dataset.listenerAttached) {
    yearSelect.addEventListener("change", () => updateDays(container));
    yearSelect.dataset.listenerAttached = "true";
  }
}

function getTripleDateValue(container) {
  if (!container) return "";
  const month = container.querySelector(".select-month")?.value || "";
  const day = container.querySelector(".select-day")?.value || "";
  const year = container.querySelector(".select-year")?.value || "";

  if (!month || !day || !year) return "";
  return `${year}-${month}-${day}`;
}

function setTripleDateValue(container, dateString) {
  if (!container) return;
  const monthSelect = container.querySelector(".select-month");
  const daySelect = container.querySelector(".select-day");
  const yearSelect = container.querySelector(".select-year");

  if (!dateString) {
    if (monthSelect) monthSelect.value = "";
    if (yearSelect) yearSelect.value = "";
    updateDays(container, "");
    return;
  }

  const parts = dateString.split("-");
  if (parts.length === 3) {
    if (yearSelect) yearSelect.value = parts[0];
    if (monthSelect) monthSelect.value = parts[1];
    updateDays(container, parts[2]);
  }
}