const todoSupabaseClient = window.centralisSupabase;

const todoState = {
  appUser: null,
  tasks: [],
  subtasks: [],
  modalSubtasks: [],
  editingTaskId: null,
  saving: false,
};

const TODO_STATUS_LABELS = {
  todo: "To Do",
  in_progress: "In Progress",
  completed: "Completed",
  pending: "Pending",
};

const TODO_PRIORITY_LABELS = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const els = {
  summary: document.querySelector("[data-todo-summary]"),
  status: document.querySelector("[data-todo-status]"),
  list: document.querySelector("[data-todo-list]"),
  search: document.querySelector("[data-todo-search]"),
  hideCompleted: document.querySelector("[data-todo-hide-completed]"),
  statusFilter: document.querySelector("[data-todo-status-filter]"),
  priorityFilter: document.querySelector("[data-todo-priority-filter]"),
  categoryFilter: document.querySelector("[data-todo-category-filter]"),
  categoryOptions: document.querySelector("[data-todo-category-options]"),
  newButton: document.querySelector("[data-todo-new]"),
  modal: document.getElementById("todo-task-modal"),
  form: document.querySelector("[data-todo-form]"),
  modalTitle: document.querySelector("[data-todo-modal-title]"),
  modalSubtitle: document.querySelector("[data-todo-modal-subtitle]"),
  taskId: document.querySelector("[data-todo-task-id]"),
  formStatus: document.querySelector("[data-todo-form-status]"),
  saveButton: document.querySelector("[data-todo-save]"),
  deleteButton: document.querySelector("[data-todo-delete]"),
  subtaskList: document.querySelector("[data-todo-subtask-list]"),
  subtaskCount: document.querySelector("[data-todo-subtask-count]"),
  subtaskTitle: document.querySelector("[data-todo-subtask-title]"),
  subtaskRequired: document.querySelector("[data-todo-subtask-required]"),
  addSubtask: document.querySelector("[data-todo-add-subtask]"),
};

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function setStatus(message, type = "") {
  if (!els.status) return;
  els.status.textContent = message || "";
  els.status.classList.toggle("is-error", type === "error");
  els.status.classList.toggle("is-success", type === "success");
}

function setFormStatus(message, type = "") {
  if (!els.formStatus) return;
  els.formStatus.textContent = message || "";
  els.formStatus.classList.toggle("is-error", type === "error");
  els.formStatus.classList.toggle("is-success", type === "success");
}

function getReadableError(error) {
  return error?.message || error?.details || error?.hint || String(error || "Unknown error");
}

function dateKey(date) {
  const value = new Date(`${date}T00:00:00`);
  if (Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(value);
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitForCurrentAppUser() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (window.centralisCurrentAppUser) return window.centralisCurrentAppUser;
    if (window.centralisGetCurrentAppUser) {
      const appUser = await window.centralisGetCurrentAppUser();
      if (appUser) return appUser;
    }
    await wait(200);
  }
  return null;
}

function subtasksForTask(taskId) {
  return todoState.subtasks
    .filter((subtask) => subtask.task_id === taskId)
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
}

function displayStatus(task) {
  if (!task.status && !task.due_date) return "pending";
  return task.status || "todo";
}

function taskProgress(task) {
  const subtasks = subtasksForTask(task.id);
  const completed = subtasks.filter((subtask) => subtask.completed).length;
  const required = subtasks.filter((subtask) => subtask.is_required);
  const requiredCompleted = required.filter((subtask) => subtask.completed).length;
  return { subtasks, completed, required, requiredCompleted };
}

function updateTaskCardSubtaskUi(taskId) {
  const task = todoState.tasks.find((item) => item.id === taskId);
  const card = els.list?.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`);
  if (!task || !card) return;

  const progress = taskProgress(task);
  const completedText = progress.subtasks.length
    ? `${progress.completed}/${progress.subtasks.length} subtasks`
    : "No subtasks";
  const requiredText = progress.required.length
    ? `${progress.requiredCompleted}/${progress.required.length} required`
    : "No required subtasks";

  card.querySelectorAll("[data-card-subtask-id]").forEach((row) => {
    const subtask = todoState.subtasks.find((item) => item.id === row.dataset.cardSubtaskId);
    if (!subtask) return;
    row.classList.toggle("is-complete", Boolean(subtask.completed));
    const check = row.querySelector("[data-todo-toggle-subtask]");
    if (check) {
      check.innerHTML = subtask.completed ? '<ph-check weight="bold"></ph-check>' : "";
    }
  });

  const summaryCount = card.querySelector("[data-card-subtask-summary]");
  if (summaryCount) summaryCount.textContent = completedText;
  const metaCount = card.querySelector("[data-card-subtask-count]");
  if (metaCount) metaCount.textContent = completedText;
  const requiredCount = card.querySelector("[data-card-required-count]");
  if (requiredCount) requiredCount.textContent = requiredText;
}

function requiredSubtasksComplete(subtasks) {
  return subtasks.filter((subtask) => subtask.is_required).every((subtask) => subtask.completed);
}

function getCategoryValues() {
  return [...new Set(todoState.tasks.map((task) => String(task.category || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function populateCategoryControls() {
  const categories = getCategoryValues();
  if (els.categoryFilter) {
    const current = els.categoryFilter.value;
    els.categoryFilter.innerHTML = '<option value="">All categories</option>';
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      els.categoryFilter.append(option);
    });
    els.categoryFilter.value = categories.includes(current) ? current : "";
  }
  if (els.categoryOptions) {
    els.categoryOptions.replaceChildren(...categories.map((category) => {
      const option = document.createElement("option");
      option.value = category;
      return option;
    }));
  }
}

function taskMatchesFilters(task) {
  const search = String(els.search?.value || "").trim().toLowerCase();
  const status = els.statusFilter?.value || "";
  const priority = els.priorityFilter?.value || "";
  const category = els.categoryFilter?.value || "";
  const display = displayStatus(task);

  if (els.hideCompleted?.checked && task.status === "completed") return false;
  if (status && display !== status) return false;
  if (priority && task.priority !== priority) return false;
  if (category && task.category !== category) return false;
  if (!search) return true;

  return [
    task.title,
    task.description,
    task.category,
    TODO_STATUS_LABELS[display],
    TODO_PRIORITY_LABELS[task.priority],
  ].some((value) => String(value || "").toLowerCase().includes(search));
}

function renderSummary() {
  const total = todoState.tasks.length;
  const completed = todoState.tasks.filter((task) => task.status === "completed").length;
  const due = todoState.tasks.filter((task) => task.due_date).length;
  if (els.summary) {
    els.summary.textContent = `${total} ${total === 1 ? "task" : "tasks"} - ${completed} completed - ${due} scheduled`;
  }
}

function renderTasks() {
  if (!els.list) return;

  populateCategoryControls();
  renderSummary();

  const visibleTasks = todoState.tasks.filter(taskMatchesFilters);
  if (!visibleTasks.length) {
    els.list.innerHTML = '<p class="empty-state">No matching tasks.</p>';
    return;
  }

  els.list.innerHTML = visibleTasks.map((task) => {
    const status = displayStatus(task);
    const progress = taskProgress(task);
    const priority = task.priority || "medium";
    const completedText = progress.subtasks.length
      ? `${progress.completed}/${progress.subtasks.length} subtasks`
      : "No subtasks";
    const requiredText = progress.required.length
      ? `${progress.requiredCompleted}/${progress.required.length} required`
      : "No required subtasks";
    const subtaskMarkup = progress.subtasks.length
      ? `
          <details class="todo-card-subtasks">
            <summary>
              <span data-card-subtask-summary>${escapeHtml(completedText)}</span>
              <ph-caret-down weight="bold" aria-hidden="true"></ph-caret-down>
            </summary>
            <ul>
              ${progress.subtasks.map((subtask) => `
                <li class="${subtask.completed ? "is-complete" : ""}" data-card-subtask-id="${escapeHtml(subtask.id)}">
                  <button class="todo-subtask-check" type="button" data-todo-toggle-subtask="${escapeHtml(subtask.id)}" aria-label="Toggle ${escapeHtml(subtask.title)} complete">
                    ${subtask.completed ? '<ph-check weight="bold"></ph-check>' : ""}
                  </button>
                  <span>${escapeHtml(subtask.title)}</span>
                  ${subtask.is_required ? '<em>Required</em>' : ""}
                </li>
              `).join("")}
            </ul>
          </details>
        `
      : "";
    return `
      <article class="todo-card ${task.status === "completed" ? "is-completed" : ""}" data-task-id="${escapeHtml(task.id)}">
        <button class="todo-complete-toggle" type="button" data-todo-toggle-complete="${escapeHtml(task.id)}" aria-label="Toggle ${escapeHtml(task.title)} complete">
          ${task.status === "completed"
            ? '<ph-check-square weight="duotone" aria-hidden="true"></ph-check-square>'
            : '<ph-square weight="duotone" aria-hidden="true"></ph-square>'}
        </button>
        <div class="todo-card-main">
          <div class="todo-card-title-row">
            <h2>${escapeHtml(task.title)}</h2>
            ${task.category ? `<span class="todo-category-pill">${escapeHtml(task.category)}</span>` : ""}
            <span class="todo-priority-pill is-${escapeHtml(priority)}">${escapeHtml(TODO_PRIORITY_LABELS[priority] || priority)}</span>
            <span class="todo-status-pill is-${escapeHtml(status)}">Status: ${escapeHtml(TODO_STATUS_LABELS[status] || status)}</span>
          </div>
          ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ""}
          <div class="todo-card-meta">
            <span><ph-calendar-blank weight="bold" aria-hidden="true"></ph-calendar-blank>${task.due_date ? `Due ${escapeHtml(dateKey(task.due_date))}` : "No due date"}</span>
            <span><ph-list-checks weight="bold" aria-hidden="true"></ph-list-checks><span data-card-subtask-count>${escapeHtml(completedText)}</span></span>
            <span data-card-required-count>${escapeHtml(requiredText)}</span>
          </div>
          ${subtaskMarkup}
        </div>
        <button class="todo-card-open" type="button" data-todo-edit="${escapeHtml(task.id)}">
          Edit
          <ph-arrow-right weight="bold" aria-hidden="true"></ph-arrow-right>
        </button>
      </article>
    `;
  }).join("");
}

async function loadTasks() {
  if (!todoSupabaseClient || !todoState.appUser) return;
  setStatus("Loading tasks...");
  if (els.list) els.list.innerHTML = '<p class="empty-state">Loading tasks...</p>';

  const { data: tasks, error: taskError } = await todoSupabaseClient
    .from("todo_tasks")
    .select("*")
    .eq("user_id", todoState.appUser.id)
    .order("created_at", { ascending: false });
  if (taskError) throw taskError;

  const taskIds = (tasks || []).map((task) => task.id);
  let subtasks = [];
  if (taskIds.length) {
    const { data, error } = await todoSupabaseClient
      .from("todo_subtasks")
      .select("*")
      .in("task_id", taskIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    subtasks = data || [];
  }

  todoState.tasks = tasks || [];
  todoState.subtasks = subtasks;
  renderTasks();
  setStatus("");
}

function openTaskModal(task = null) {
  todoState.editingTaskId = task?.id || null;
  todoState.modalSubtasks = task ? subtasksForTask(task.id).map((subtask) => ({ ...subtask })) : [];
  setFormStatus("");
  els.form?.reset();
  if (els.modalTitle) els.modalTitle.textContent = task ? "Edit Task" : "New Task";
  if (els.modalSubtitle) els.modalSubtitle.textContent = task ? "Update task details and manage subtasks." : "Create a task and optional subtasks.";
  if (els.taskId) els.taskId.value = task?.id || "";
  if (els.deleteButton) els.deleteButton.hidden = !task;

  if (els.form) {
    els.form.elements.title.value = task?.title || "";
    els.form.elements.description.value = task?.description || "";
    els.form.elements.status.value = task?.status || "";
    els.form.elements.priority.value = task?.priority || "medium";
    els.form.elements.due_date.value = task?.due_date || "";
    els.form.elements.category.value = task?.category || "";
  }
  renderModalSubtasks();
  if (els.modal) {
    els.modal.hidden = false;
    document.body.classList.add("todo-modal-open");
    els.form?.elements.title?.focus();
  }
}

function closeTaskModal(options = {}) {
  if ((todoState.saving && !options.force) || !els.modal) return;
  els.modal.hidden = true;
  document.body.classList.remove("todo-modal-open");
  todoState.editingTaskId = null;
  todoState.modalSubtasks = [];
}

function renderModalSubtasks() {
  if (!els.subtaskList) return;
  if (els.subtaskCount) {
    const count = todoState.modalSubtasks.length;
    els.subtaskCount.textContent = `${count} ${count === 1 ? "subtask" : "subtasks"}`;
  }
  if (!todoState.modalSubtasks.length) {
    els.subtaskList.innerHTML = '<p class="empty-state">No subtasks yet.</p>';
    return;
  }
  els.subtaskList.innerHTML = todoState.modalSubtasks.map((subtask, index) => `
    <div class="todo-subtask-row" data-subtask-index="${index}">
      <label class="todo-subtask-complete">
        <input type="checkbox" data-subtask-completed="${index}" ${subtask.completed ? "checked" : ""}>
        <span>${escapeHtml(subtask.title)}</span>
      </label>
      <label class="todo-required-toggle">
        <input type="checkbox" data-subtask-required="${index}" ${subtask.is_required ? "checked" : ""}>
        Required
      </label>
      <button class="icon-button" type="button" data-subtask-remove="${index}" aria-label="Remove subtask">
        <ph-x weight="bold" aria-hidden="true"></ph-x>
      </button>
    </div>
  `).join("");
}

function addModalSubtask() {
  const title = String(els.subtaskTitle?.value || "").trim();
  if (!title) return;
  todoState.modalSubtasks.push({
    id: null,
    title,
    completed: false,
    is_required: Boolean(els.subtaskRequired?.checked),
    sort_order: todoState.modalSubtasks.length,
  });
  if (els.subtaskTitle) els.subtaskTitle.value = "";
  if (els.subtaskRequired) els.subtaskRequired.checked = false;
  renderModalSubtasks();
}

function buildTaskPayload(formData) {
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const status = String(formData.get("status") || "").trim() || null;
  const priority = String(formData.get("priority") || "medium").trim() || "medium";
  const category = String(formData.get("category") || "").trim();
  const dueDate = String(formData.get("due_date") || "").trim();
  return {
    title,
    description: description || null,
    status,
    priority,
    category: category || null,
    due_date: dueDate || null,
    updated_at: new Date().toISOString(),
  };
}

async function saveTask(event) {
  event.preventDefault();
  if (!todoSupabaseClient || !todoState.appUser || todoState.saving) return;

  const formData = new FormData(els.form);
  const payload = buildTaskPayload(formData);
  if (!payload.title) {
    setFormStatus("Title is required.", "error");
    return;
  }
  if (payload.status === "completed" && !requiredSubtasksComplete(todoState.modalSubtasks)) {
    setFormStatus("Complete all required subtasks before marking this task completed.", "error");
    return;
  }

  todoState.saving = true;
  if (els.saveButton) els.saveButton.disabled = true;
  setFormStatus("Saving task...");
  try {
    const isEditing = Boolean(todoState.editingTaskId);
    let taskId = todoState.editingTaskId;
    if (isEditing) {
      const { error } = await todoSupabaseClient
        .from("todo_tasks")
        .update(payload)
        .eq("id", taskId)
        .eq("user_id", todoState.appUser.id);
      if (error) throw error;
    } else {
      const { data, error } = await todoSupabaseClient
        .from("todo_tasks")
        .insert({ ...payload, user_id: todoState.appUser.id })
        .select("id")
        .single();
      if (error) throw error;
      taskId = data.id;
    }

    await syncSubtasks(taskId);
    closeTaskModal({ force: true });
    await loadTasks();
  } catch (error) {
    setFormStatus(`Could not save task: ${getReadableError(error)}`, "error");
  } finally {
    todoState.saving = false;
    if (els.saveButton) els.saveButton.disabled = false;
  }
}

async function syncSubtasks(taskId) {
  const existing = subtasksForTask(taskId);
  const modalIds = new Set(todoState.modalSubtasks.map((subtask) => subtask.id).filter(Boolean));
  const deletes = existing.filter((subtask) => !modalIds.has(subtask.id));
  if (deletes.length) {
    const { error } = await todoSupabaseClient
      .from("todo_subtasks")
      .delete()
      .in("id", deletes.map((subtask) => subtask.id));
    if (error) throw error;
  }

  for (const [index, subtask] of todoState.modalSubtasks.entries()) {
    const payload = {
      task_id: taskId,
      title: String(subtask.title || "").trim(),
      is_required: Boolean(subtask.is_required),
      completed: Boolean(subtask.completed),
      sort_order: index,
      updated_at: new Date().toISOString(),
    };
    if (subtask.id) {
      const { error } = await todoSupabaseClient
        .from("todo_subtasks")
        .update(payload)
        .eq("id", subtask.id);
      if (error) throw error;
    } else {
      const { error } = await todoSupabaseClient
        .from("todo_subtasks")
        .insert(payload);
      if (error) throw error;
    }
  }
}

async function deleteCurrentTask() {
  if (!todoState.editingTaskId || !window.confirm("Delete this task and its subtasks?")) return;
  todoState.saving = true;
  setFormStatus("Deleting task...");
  try {
    const { error } = await todoSupabaseClient
      .from("todo_tasks")
      .delete()
      .eq("id", todoState.editingTaskId)
      .eq("user_id", todoState.appUser.id);
    if (error) throw error;
    closeTaskModal({ force: true });
    await loadTasks();
  } catch (error) {
    setFormStatus(`Could not delete task: ${getReadableError(error)}`, "error");
  } finally {
    todoState.saving = false;
  }
}

async function toggleTaskComplete(taskId) {
  const task = todoState.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const subtasks = subtasksForTask(task.id);
  const nextStatus = task.status === "completed" ? "todo" : "completed";
  if (nextStatus === "completed" && !requiredSubtasksComplete(subtasks)) {
    setStatus("Complete required subtasks before completing that task.", "error");
    return;
  }
  const { error } = await todoSupabaseClient
    .from("todo_tasks")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", task.id)
    .eq("user_id", todoState.appUser.id);
  if (error) {
    setStatus(`Could not update task: ${getReadableError(error)}`, "error");
    return;
  }
  await loadTasks();
}

async function toggleSubtaskComplete(subtaskId) {
  const subtask = todoState.subtasks.find((item) => item.id === subtaskId);
  if (!subtask || !todoSupabaseClient) return;

  const parentTask = todoState.tasks.find((task) => task.id === subtask.task_id);
  if (parentTask?.status === "completed" && subtask.is_required && subtask.completed) {
    setStatus("Required subtasks must stay complete while the task is completed.", "error");
    return;
  }

  const { error } = await todoSupabaseClient
    .from("todo_subtasks")
    .update({ completed: !subtask.completed, updated_at: new Date().toISOString() })
    .eq("id", subtask.id);
  if (error) {
    setStatus(`Could not update subtask: ${getReadableError(error)}`, "error");
    return;
  }
  subtask.completed = !subtask.completed;
  subtask.updated_at = new Date().toISOString();
  updateTaskCardSubtaskUi(subtask.task_id);
  setStatus("");
}

async function initializeTodo() {
  if (!todoSupabaseClient) {
    setStatus("ToDo could not initialize Supabase.", "error");
    return;
  }
  try {
    todoState.appUser = await waitForCurrentAppUser();
    if (!todoState.appUser) {
      setStatus("Still waiting for your profile. Refresh the page if this does not clear.", "error");
      return;
    }
    await loadTasks();
  } catch (error) {
    setStatus(`Could not load ToDo: ${getReadableError(error)}`, "error");
  }
}

els.newButton?.addEventListener("click", () => openTaskModal());
els.form?.addEventListener("submit", saveTask);
els.deleteButton?.addEventListener("click", deleteCurrentTask);
document.querySelectorAll("[data-todo-close]").forEach((button) => button.addEventListener("click", closeTaskModal));
els.modal?.addEventListener("click", (event) => {
  if (event.target === els.modal) {
    event.preventDefault();
    event.stopPropagation();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.modal && !els.modal.hidden) {
    closeTaskModal();
  }
});
els.addSubtask?.addEventListener("click", addModalSubtask);
els.subtaskTitle?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addModalSubtask();
  }
});

[els.search, els.hideCompleted, els.statusFilter, els.priorityFilter, els.categoryFilter].forEach((control) => {
  control?.addEventListener("input", renderTasks);
  control?.addEventListener("change", renderTasks);
});

els.list?.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-todo-edit]");
  if (editButton) {
    const task = todoState.tasks.find((item) => item.id === editButton.dataset.todoEdit);
    if (task) openTaskModal(task);
    return;
  }
  const completeButton = event.target.closest("[data-todo-toggle-complete]");
  if (completeButton) {
    toggleTaskComplete(completeButton.dataset.todoToggleComplete);
    return;
  }
  const subtaskButton = event.target.closest("[data-todo-toggle-subtask]");
  if (subtaskButton) {
    toggleSubtaskComplete(subtaskButton.dataset.todoToggleSubtask);
  }
});

els.subtaskList?.addEventListener("change", (event) => {
  const completed = event.target.closest("[data-subtask-completed]");
  const required = event.target.closest("[data-subtask-required]");
  if (completed) {
    todoState.modalSubtasks[Number(completed.dataset.subtaskCompleted)].completed = completed.checked;
  }
  if (required) {
    todoState.modalSubtasks[Number(required.dataset.subtaskRequired)].is_required = required.checked;
  }
});

els.subtaskList?.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-subtask-remove]");
  if (!remove) return;
  todoState.modalSubtasks.splice(Number(remove.dataset.subtaskRemove), 1);
  renderModalSubtasks();
});

initializeTodo();
