const calendarSupabaseClient = window.centralisSupabase;

const state = {
  appUser: null,
  settings: null,
  visibleMonth: startOfMonth(new Date()),
  miniMonth: startOfMonth(new Date()),
  calendars: [],
  categories: [],
  events: [],
  tasks: [],
  selectedReminderMinutes: new Set()
};

const calendarList = document.querySelector("[data-calendar-list]");
const calendarStatus = document.querySelector("[data-calendar-status]");
const calendarEmpty = document.querySelector("[data-calendar-empty]");
const calendarTitle = document.querySelector("[data-calendar-title]");
const miniMonthTitle = document.querySelector("[data-mini-month]");
const miniWeekdays = document.querySelector("[data-mini-weekdays]");
const miniDays = document.querySelector("[data-mini-days]");
const monthWeekdays = document.querySelector("[data-month-weekdays]");
const monthGrid = document.querySelector("[data-month-grid]");
const newEventButton = document.querySelector("[data-open-event-modal]");
const calendarModal = document.getElementById("calendar-modal");
const calendarForm = document.querySelector("[data-calendar-form]");
const calendarFormStatus = document.querySelector("[data-calendar-form-status]");
const eventModal = document.getElementById("event-modal");
const eventForm = document.querySelector("[data-event-form]");
const eventFormStatus = document.querySelector("[data-event-form-status]");
const eventCalendarSelect = document.querySelector("[data-event-calendar]");
const eventCategorySelect = document.querySelector("[data-event-category]");
const allDayInput = document.querySelector("[data-event-all-day]");
const reminderStatus = document.querySelector("[data-reminder-status]");
const reminderPresetWrap = document.querySelector("[data-reminder-presets]");

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const DEFAULT_COLOR = "#6366f1";

window.centralisCalendarLoaded = true;

function setStatus(message, type) {
  if (!calendarStatus) {
    return;
  }

  calendarStatus.textContent = message || "";
  calendarStatus.classList.toggle("is-error", type === "error");
  calendarStatus.classList.toggle("is-success", type === "success");
}

function setDialogStatus(element, message, type) {
  if (!element) {
    return;
  }

  element.textContent = message || "";
  element.classList.toggle("is-error", type === "error");
  element.classList.toggle("is-success", type === "success");
}

function getReadableError(error) {
  return error?.message || String(error || "Unknown error");
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addYears(date, amount) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + amount);
  return next;
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthGridStart(month, weekStartsOn) {
  const start = startOfMonth(month);
  const offset = (start.getDay() - weekStartsOn + 7) % 7;
  return addDays(start, -offset);
}

function getGridRange(month) {
  const weekStartsOn = Number(state.settings?.week_starts_on ?? 0);
  const start = monthGridStart(month, weekStartsOn);
  return {
    start,
    end: addDays(start, 41)
  };
}

function localInputDate(date) {
  return dateKey(date);
}

function localInputTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function dateTimeFromInputs(dateValue, timeValue) {
  return new Date(`${dateValue}T${timeValue || "00:00"}`);
}

function allDayStart(dateValue) {
  return new Date(`${dateValue}T00:00`);
}

function allDayEnd(dateValue) {
  return new Date(`${dateValue}T23:59:59`);
}

function normalizeColor(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color || "")) ? color : DEFAULT_COLOR;
}

function openCalendarModal() {
  setDialogStatus(calendarFormStatus, "");
  calendarForm?.reset();
  const colorInput = calendarForm?.querySelector('input[name="calendar-color"]');
  if (colorInput) {
    colorInput.value = DEFAULT_COLOR;
  }
  if (calendarModal) {
    calendarModal.hidden = false;
    calendarModal.querySelector("input")?.focus();
  }
}

function closeCalendarModal() {
  if (calendarModal) {
    calendarModal.hidden = true;
  }
}

function openEventModal(date = new Date()) {
  if (!state.calendars.length) {
    setStatus("Create a calendar before adding events.", "error");
    return;
  }

  setDialogStatus(eventFormStatus, "");
  eventForm?.reset();
  state.selectedReminderMinutes.clear();
  updateReminderUi();
  populateEventSelects();

  const duration = Number(state.settings?.default_event_duration || 60);
  const start = new Date(date);
  start.setMinutes(0, 0, 0);
  if (start < new Date()) {
    const now = new Date();
    start.setHours(now.getHours() + 1, 0, 0, 0);
  }
  const end = new Date(start.getTime() + duration * 60 * 1000);

  eventForm.elements["event-start-date"].value = localInputDate(start);
  eventForm.elements["event-start-time"].value = localInputTime(start);
  eventForm.elements["event-end-date"].value = localInputDate(end);
  eventForm.elements["event-end-time"].value = localInputTime(end);

  if (eventModal) {
    eventModal.hidden = false;
    eventForm.elements["event-title"]?.focus();
  }
}

function closeEventModal() {
  if (eventModal) {
    eventModal.hidden = true;
  }
}

function getOrderedWeekdays() {
  const weekStartsOn = Number(state.settings?.week_starts_on ?? 0);
  return Array.from({ length: 7 }, (_, index) => WEEKDAY_LABELS[(weekStartsOn + index) % 7]);
}

function renderWeekdayHeaders() {
  const labels = getOrderedWeekdays();
  if (miniWeekdays) {
    miniWeekdays.replaceChildren(...labels.map((label) => {
      const span = document.createElement("span");
      span.textContent = label.slice(0, 1);
      return span;
    }));
  }

  if (monthWeekdays) {
    monthWeekdays.replaceChildren(...labels.map((label) => {
      const span = document.createElement("span");
      span.textContent = label.toUpperCase();
      return span;
    }));
  }
}

function renderMiniCalendar() {
  if (miniMonthTitle) {
    miniMonthTitle.textContent = MONTH_FORMATTER.format(state.miniMonth);
  }
  if (!miniDays) {
    return;
  }

  const { start } = getGridRange(state.miniMonth);
  const todayKey = dateKey(new Date());
  const selectedMonthKey = `${state.visibleMonth.getFullYear()}-${state.visibleMonth.getMonth()}`;
  const cells = [];

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(start, index);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(date.getDate());
    button.classList.toggle("is-muted", date.getMonth() !== state.miniMonth.getMonth());
    button.classList.toggle("is-today", dateKey(date) === todayKey);
    button.classList.toggle("is-current-month", `${date.getFullYear()}-${date.getMonth()}` === selectedMonthKey);
    button.addEventListener("click", () => {
      state.visibleMonth = startOfMonth(date);
      state.miniMonth = startOfMonth(date);
      refreshCalendarData();
    });
    cells.push(button);
  }

  miniDays.replaceChildren(...cells);
}

function renderCalendarList() {
  if (!calendarList) {
    return;
  }

  if (!state.calendars.length) {
    calendarList.innerHTML = '<p class="calendar-sidebar-empty">No calendars yet.</p>';
    return;
  }

  const rows = state.calendars.map((calendar) => {
    const row = document.createElement("div");
    row.className = "calendar-list-item";
    row.innerHTML = `
      <span class="calendar-color-dot" style="--calendar-color: ${normalizeColor(calendar.color)}"></span>
      <strong>${escapeHtml(calendar.name)}</strong>
      <button type="button" data-calendar-visible="${calendar.id}" aria-label="${calendar.is_visible ? "Hide" : "Show"} ${escapeHtml(calendar.name)}">
        <ph-eye${calendar.is_visible ? "" : "-slash"} weight="bold" aria-hidden="true"></ph-eye${calendar.is_visible ? "" : "-slash"}>
      </button>
      <button type="button" data-calendar-delete="${calendar.id}" aria-label="Delete ${escapeHtml(calendar.name)}">
        <ph-trash weight="bold" aria-hidden="true"></ph-trash>
      </button>
    `;
    return row;
  });

  calendarList.replaceChildren(...rows);
}

function renderMonthGrid() {
  if (calendarTitle) {
    calendarTitle.textContent = MONTH_FORMATTER.format(state.visibleMonth);
  }
  if (!monthGrid) {
    return;
  }

  const { start } = getGridRange(state.visibleMonth);
  const todayKey = dateKey(new Date());
  const eventsByDate = buildCalendarItemsByDate(start, addDays(start, 41));
  const cells = [];

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(start, index);
    const key = dateKey(date);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "month-day";
    cell.classList.toggle("is-muted", date.getMonth() !== state.visibleMonth.getMonth());
    cell.classList.toggle("is-today", key === todayKey);
    cell.innerHTML = `
      <span class="month-day-number">${date.getDate()}</span>
      <span class="month-event-list"></span>
    `;
    const list = cell.querySelector(".month-event-list");
    (eventsByDate.get(key) || []).slice(0, 4).forEach((event) => {
      const chip = document.createElement("span");
      chip.className = event.type === "task" ? "month-event-chip month-task-chip" : "month-event-chip";
      chip.style.setProperty("--event-color", normalizeColor(event.color));
      chip.textContent = event.type === "task"
        ? `Task: ${event.title}`
        : event.is_all_day ? event.title : `${TIME_FORMATTER.format(event.start)} ${event.title}`;
      list.append(chip);
    });

    const extra = (eventsByDate.get(key) || []).length - 4;
    if (extra > 0) {
      const chip = document.createElement("span");
      chip.className = "month-event-more";
      chip.textContent = `+${extra} more`;
      list.append(chip);
    }

    cell.addEventListener("dblclick", () => openEventModal(date));
    cells.push(cell);
  }

  monthGrid.replaceChildren(...cells);
}

function renderEmptyState() {
  const hasCalendars = state.calendars.length > 0;
  const hasCalendarContent = hasCalendars || state.tasks.length > 0;
  if (calendarEmpty) {
    calendarEmpty.hidden = hasCalendarContent;
  }
  if (monthGrid) {
    monthGrid.hidden = !hasCalendarContent;
  }
  if (monthWeekdays) {
    monthWeekdays.hidden = !hasCalendarContent;
  }
  if (newEventButton) {
    newEventButton.disabled = !hasCalendars;
  }
}

function renderAll() {
  renderWeekdayHeaders();
  renderMiniCalendar();
  renderCalendarList();
  renderEmptyState();
  renderMonthGrid();
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function waitForCurrentAppUser() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (window.centralisCurrentAppUser) {
      return window.centralisCurrentAppUser;
    }

    if (window.centralisGetCurrentAppUser) {
      const appUser = await window.centralisGetCurrentAppUser();
      if (appUser) {
        return appUser;
      }
    }

    if (calendarSupabaseClient) {
      const { data } = await calendarSupabaseClient.auth.getSession();
      const authUser = data?.session?.user;
      if (authUser) {
        const { data: appUser } = await calendarSupabaseClient
          .from("users")
          .select("*")
          .eq("clerk_user_id", authUser.id)
          .maybeSingle();
        if (appUser) {
          window.centralisCurrentAppUser = appUser;
          return appUser;
        }
      }
    }

    await wait(200);
  }

  return null;
}

function buildEventsByDate(rangeStart, rangeEnd) {
  const eventsByDate = new Map();
  const rangeStartTime = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate()).getTime();
  const rangeEndTime = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate(), 23, 59, 59).getTime();

  state.events.forEach((event) => {
    const occurrences = expandEventOccurrences(event, rangeStart, rangeEnd);
    occurrences.forEach((occurrence) => {
      const occurrenceTime = occurrence.start.getTime();
      if (occurrenceTime < rangeStartTime || occurrenceTime > rangeEndTime) {
        return;
      }

      const key = dateKey(occurrence.start);
      if (!eventsByDate.has(key)) {
        eventsByDate.set(key, []);
      }
      eventsByDate.get(key).push(occurrence);
    });
  });

  eventsByDate.forEach((events) => {
    events.sort((first, second) => {
      if (first.is_all_day !== second.is_all_day) {
        return first.is_all_day ? -1 : 1;
      }
      return first.start - second.start;
    });
  });

  return eventsByDate;
}

function getTaskPriorityColor(priority) {
  const colors = {
    low: "#74c69d",
    medium: "#6ccbd2",
    high: "#f0a33a",
    urgent: "#ef4444"
  };
  return colors[priority] || colors.medium;
}

function buildCalendarItemsByDate(rangeStart, rangeEnd) {
  const itemsByDate = buildEventsByDate(rangeStart, rangeEnd);
  state.tasks.forEach((task) => {
    if (!task.due_date) return;
    const due = new Date(`${task.due_date}T00:00:00`);
    if (due < rangeStart || due > addDays(rangeEnd, 1)) return;
    const key = dateKey(due);
    if (!itemsByDate.has(key)) {
      itemsByDate.set(key, []);
    }
    itemsByDate.get(key).push({
      type: "task",
      id: task.id,
      title: task.title || "Untitled Task",
      start: due,
      is_all_day: true,
      color: getTaskPriorityColor(task.priority)
    });
  });

  itemsByDate.forEach((items) => {
    items.sort((first, second) => {
      if (first.type !== second.type) {
        return first.type === "task" ? 1 : -1;
      }
      if (first.is_all_day !== second.is_all_day) {
        return first.is_all_day ? -1 : 1;
      }
      return first.start - second.start;
    });
  });

  return itemsByDate;
}

function expandEventOccurrences(event, rangeStart, rangeEnd) {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const duration = end.getTime() - start.getTime();
  const calendar = state.calendars.find((item) => item.id === event.calendar_id);
  const base = {
    id: event.id,
    title: event.title,
    color: event.color || calendar?.color || DEFAULT_COLOR,
    is_all_day: event.is_all_day
  };

  if (!event.is_recurring || !event.recurrence_rule) {
    if (end < rangeStart || start > addDays(rangeEnd, 1)) {
      return [];
    }
    return [{ ...base, start, end }];
  }

  const rule = parseRRule(event.recurrence_rule);
  const until = event.recurrence_end ? new Date(event.recurrence_end) : addDays(rangeEnd, 1);
  const occurrences = [];
  let cursor = new Date(start);
  let guard = 0;

  while (cursor < rangeStart && guard < 5000) {
    cursor = nextRuleCursor(cursor, rule);
    guard += 1;
  }

  while (cursor <= rangeEnd && cursor <= until && guard < 5000) {
    if (cursor >= rangeStart && matchesRuleDate(cursor, start, rule)) {
      occurrences.push({
        ...base,
        start: new Date(cursor),
        end: new Date(cursor.getTime() + duration)
      });
    }

    cursor = nextRuleCursor(cursor, rule);
    guard += 1;
  }

  return occurrences;
}

function parseRRule(rawRule) {
  return String(rawRule || "").split(";").reduce((rule, part) => {
    const [key, value] = part.split("=");
    if (key && value) {
      rule[key] = value;
    }
    return rule;
  }, {});
}

function matchesRuleDate(date, originalStart, rule) {
  if (rule.BYDAY) {
    const dayCodes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    return rule.BYDAY.split(",").includes(dayCodes[date.getDay()]);
  }

  if (rule.FREQ === "MONTHLY") {
    return date.getDate() === originalStart.getDate();
  }

  if (rule.FREQ === "YEARLY") {
    return date.getMonth() === originalStart.getMonth() && date.getDate() === originalStart.getDate();
  }

  return true;
}

function nextRuleCursor(date, rule) {
  if (rule.FREQ === "WEEKLY") {
    return addDays(date, 7);
  }
  if (rule.FREQ === "MONTHLY") {
    return addMonths(date, 1);
  }
  if (rule.FREQ === "YEARLY") {
    return addYears(date, 1);
  }
  return addDays(date, 1);
}

function repeatToRRule(repeat) {
  const rules = {
    daily: "FREQ=DAILY;INTERVAL=1",
    weekly: "FREQ=WEEKLY;INTERVAL=1",
    monthly: "FREQ=MONTHLY;INTERVAL=1",
    yearly: "FREQ=YEARLY;INTERVAL=1",
    weekdays: "FREQ=DAILY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR"
  };
  return rules[repeat] || null;
}

function repeatToRuleRow(eventId, repeat, rawRule) {
  const frequencyByRepeat = {
    daily: "daily",
    weekly: "weekly",
    monthly: "monthly",
    yearly: "yearly",
    weekdays: "daily"
  };

  return {
    event_id: eventId,
    frequency: frequencyByRepeat[repeat] || "daily",
    interval: 1,
    by_day: repeat === "weekdays" ? "MO,TU,WE,TH,FR" : null,
    raw_rrule: rawRule
  };
}

async function loadSettings() {
  const { data, error } = await calendarSupabaseClient
    .from("user_settings")
    .select("*")
    .eq("user_id", state.appUser.id)
    .eq("deleted", false)
    .maybeSingle();

  if (error) {
    throw error;
  }

  state.settings = data || {};
}

async function loadCalendars() {
  const { data, error } = await calendarSupabaseClient
    .from("calendars")
    .select("*")
    .eq("user_id", state.appUser.id)
    .eq("deleted", false)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  state.calendars = data || [];
}

async function loadCategories() {
  const { data, error } = await calendarSupabaseClient
    .from("categories")
    .select("*")
    .eq("user_id", state.appUser.id)
    .eq("deleted", false)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  state.categories = data || [];
}

async function loadEvents() {
  const calendarIds = state.calendars
    .filter((calendar) => calendar.is_visible)
    .map((calendar) => calendar.id);
  if (!calendarIds.length) {
    state.events = [];
    return;
  }

  const { start, end } = getGridRange(state.visibleMonth);
  const { data, error } = await calendarSupabaseClient
    .from("events")
    .select("*")
    .in("calendar_id", calendarIds)
    .eq("deleted", false)
    .lte("start_time", addDays(end, 1).toISOString())
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  state.events = (data || []).filter((event) => {
    if (!event.is_recurring) {
      return new Date(event.end_time) >= start;
    }
    return !event.recurrence_end || new Date(event.recurrence_end) >= start;
  });
}

async function loadTasks() {
  if (!state.appUser) {
    state.tasks = [];
    return;
  }

  const { start, end } = getGridRange(state.visibleMonth);
  const { data, error } = await calendarSupabaseClient
    .from("todo_tasks")
    .select("id,title,due_date,status,priority,category")
    .eq("user_id", state.appUser.id)
    .eq("deleted", false)
    .not("due_date", "is", null)
    .gte("due_date", localInputDate(start))
    .lte("due_date", localInputDate(end))
    .order("due_date", { ascending: true });

  if (error) {
    throw error;
  }

  state.tasks = data || [];
}

async function refreshCalendarData() {
  setStatus("Loading calendar...");
  try {
    await loadSettings();
    await loadCalendars();
    await loadCategories();
    await loadEvents();
    await loadTasks();
    renderAll();
    setStatus("");
  } catch (error) {
    console.error(error);
    setStatus(`Could not load calendar: ${getReadableError(error)}`, "error");
  }
}

function populateEventSelects() {
  eventCalendarSelect.replaceChildren(...state.calendars.map((calendar) => {
    const option = document.createElement("option");
    option.value = calendar.id;
    option.textContent = calendar.name;
    return option;
  }));

  const none = document.createElement("option");
  none.value = "";
  none.textContent = "None";
  eventCategorySelect.replaceChildren(none, ...state.categories.map((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    return option;
  }));
}

function updateReminderUi() {
  reminderPresetWrap.querySelectorAll("button").forEach((button) => {
    const minutes = Number(button.dataset.reminderMinutes);
    button.classList.toggle("is-selected", state.selectedReminderMinutes.has(minutes));
  });

  if (!state.selectedReminderMinutes.size) {
    reminderStatus.textContent = "No reminders set. Click a preset or add custom.";
    return;
  }

  const labels = [...state.selectedReminderMinutes].sort((a, b) => a - b).map((minutes) => {
    if (minutes === 60) return "1 hour";
    if (minutes === 1440) return "1 day";
    return `${minutes} min`;
  });
  reminderStatus.textContent = `Reminders: ${labels.join(", ")}`;
}

async function createCalendar(formData) {
  const name = String(formData.get("calendar-name") || "").trim();
  const color = normalizeColor(formData.get("calendar-color"));

  if (!name) {
    setDialogStatus(calendarFormStatus, "Calendar name is required.", "error");
    return;
  }

  setDialogStatus(calendarFormStatus, "Creating calendar...");
  const { error } = await calendarSupabaseClient
    .from("calendars")
    .insert({
      user_id: state.appUser.id,
      name,
      color,
      is_visible: true,
      is_default: state.calendars.length === 0,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    });

  if (error) {
    throw error;
  }

  closeCalendarModal();
  await refreshCalendarData();
}

async function createEvent(formData) {
  const title = String(formData.get("event-title") || "").trim();
  const calendarId = Number(formData.get("event-calendar"));
  const categoryId = formData.get("event-category") ? Number(formData.get("event-category")) : null;
  const repeat = String(formData.get("event-repeat") || "none");
  const isAllDay = Boolean(formData.get("event-all-day"));

  if (!title || !calendarId) {
    setDialogStatus(eventFormStatus, "Title and calendar are required.", "error");
    return;
  }

  const startDate = String(formData.get("event-start-date"));
  const endDate = String(formData.get("event-end-date"));
  const startTime = String(formData.get("event-start-time") || "00:00");
  const endTime = String(formData.get("event-end-time") || "00:00");
  const start = isAllDay ? allDayStart(startDate) : dateTimeFromInputs(startDate, startTime);
  const end = isAllDay ? allDayEnd(endDate) : dateTimeFromInputs(endDate, endTime);

  if (end < start) {
    setDialogStatus(eventFormStatus, "End must be after start.", "error");
    return;
  }

  const rawRule = repeatToRRule(repeat);
  setDialogStatus(eventFormStatus, "Saving event...");
  const { data: event, error } = await calendarSupabaseClient
    .from("events")
    .insert({
      calendar_id: calendarId,
      category_id: categoryId,
      title,
      description: String(formData.get("event-description") || "").trim() || null,
      location: String(formData.get("event-location") || "").trim() || null,
      notes: String(formData.get("event-description") || "").trim() || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      is_all_day: isAllDay,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      is_recurring: Boolean(rawRule),
      recurrence_rule: rawRule
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const followUps = [];
  if (rawRule) {
    followUps.push(calendarSupabaseClient
      .from("event_recurrence_rules")
      .insert(repeatToRuleRow(event.id, repeat, rawRule)));
  }

  if (state.selectedReminderMinutes.size) {
    followUps.push(calendarSupabaseClient
      .from("reminders")
      .insert([...state.selectedReminderMinutes].map((minutes) => ({
        event_id: event.id,
        minutes_before: minutes,
        method: "popup"
      }))));
  }

  const results = await Promise.all(followUps);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw failed.error;
  }

  closeEventModal();
  await refreshCalendarData();
}

async function toggleCalendarVisibility(calendarId) {
  const calendar = state.calendars.find((item) => item.id === calendarId);
  if (!calendar) {
    return;
  }

  const { error } = await calendarSupabaseClient
    .from("calendars")
    .update({ is_visible: !calendar.is_visible, updated_at: new Date().toISOString() })
    .eq("id", calendar.id)
    .eq("user_id", state.appUser.id);

  if (error) {
    throw error;
  }

  await refreshCalendarData();
}

async function deleteCalendar(calendarId) {
  const calendar = state.calendars.find((item) => item.id === calendarId);
  if (!calendar || !window.confirm(`Delete calendar "${calendar.name}"? Events must be removed first if your database blocks calendar deletion.`)) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await calendarSupabaseClient
    .from("calendars")
    .update({ deleted: true, deleted_at: now, deleted_by: state.appUser.id, updated_at: now })
    .eq("id", calendar.id)
    .eq("user_id", state.appUser.id)
    .eq("deleted", false);

  if (error) {
    throw error;
  }

  await refreshCalendarData();
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

async function initializeCalendar() {
  renderWeekdayHeaders();
  renderMiniCalendar();
  renderEmptyState();
  renderMonthGrid();
  if (calendarTitle) {
    calendarTitle.textContent = MONTH_FORMATTER.format(state.visibleMonth);
  }
  setStatus("Loading calendar...");

  if (!calendarSupabaseClient) {
    setStatus("Calendar could not initialize Supabase.", "error");
    return;
  }

  try {
    state.appUser = await waitForCurrentAppUser();
    if (!state.appUser) {
      setStatus("Still waiting for your profile. Refresh the page if this does not clear.", "error");
      return;
    }
    await refreshCalendarData();
  } catch (error) {
    console.error(error);
    setStatus(`Could not initialize calendar: ${getReadableError(error)}`, "error");
  }
}

document.querySelectorAll("[data-open-calendar-modal]").forEach((button) => {
  button.addEventListener("click", openCalendarModal);
});

document.querySelectorAll("[data-close-calendar-modal]").forEach((button) => {
  button.addEventListener("click", closeCalendarModal);
});

document.querySelectorAll("[data-close-event-modal]").forEach((button) => {
  button.addEventListener("click", closeEventModal);
});

document.querySelector("[data-calendar-today]")?.addEventListener("click", () => {
  state.visibleMonth = startOfMonth(new Date());
  state.miniMonth = startOfMonth(new Date());
  refreshCalendarData();
});

document.querySelector("[data-calendar-prev]")?.addEventListener("click", () => {
  state.visibleMonth = addMonths(state.visibleMonth, -1);
  state.miniMonth = startOfMonth(state.visibleMonth);
  refreshCalendarData();
});

document.querySelector("[data-calendar-next]")?.addEventListener("click", () => {
  state.visibleMonth = addMonths(state.visibleMonth, 1);
  state.miniMonth = startOfMonth(state.visibleMonth);
  refreshCalendarData();
});

document.querySelector("[data-mini-prev]")?.addEventListener("click", () => {
  state.miniMonth = addMonths(state.miniMonth, -1);
  renderMiniCalendar();
});

document.querySelector("[data-mini-next]")?.addEventListener("click", () => {
  state.miniMonth = addMonths(state.miniMonth, 1);
  renderMiniCalendar();
});

newEventButton?.addEventListener("click", () => openEventModal(new Date()));

calendarList?.addEventListener("click", async (event) => {
  const visibilityButton = event.target.closest("[data-calendar-visible]");
  const deleteButton = event.target.closest("[data-calendar-delete]");

  try {
    if (visibilityButton) {
      await toggleCalendarVisibility(Number(visibilityButton.dataset.calendarVisible));
    } else if (deleteButton) {
      await deleteCalendar(Number(deleteButton.dataset.calendarDelete));
    }
  } catch (error) {
    console.error(error);
    setStatus(`Calendar update failed: ${getReadableError(error)}`, "error");
  }
});

calendarForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await createCalendar(new FormData(calendarForm));
  } catch (error) {
    console.error(error);
    setDialogStatus(calendarFormStatus, `Could not create calendar: ${getReadableError(error)}`, "error");
  }
});

eventForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await createEvent(new FormData(eventForm));
  } catch (error) {
    console.error(error);
    setDialogStatus(eventFormStatus, `Could not save event: ${getReadableError(error)}`, "error");
  }
});

allDayInput?.addEventListener("change", () => {
  eventForm.elements["event-start-time"].disabled = allDayInput.checked;
  eventForm.elements["event-end-time"].disabled = allDayInput.checked;
});

reminderPresetWrap?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-reminder-minutes]");
  if (!button) {
    return;
  }

  const minutes = Number(button.dataset.reminderMinutes);
  if (state.selectedReminderMinutes.has(minutes)) {
    state.selectedReminderMinutes.delete(minutes);
  } else {
    state.selectedReminderMinutes.add(minutes);
  }
  updateReminderUi();
});

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (event) => {
    if (event.target !== backdrop) {
      return;
    }
    if (backdrop.dataset.strictModal !== undefined) {
      return;
    }
    closeCalendarModal();
    closeEventModal();
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (calendarModal?.dataset.strictModal === undefined) {
      closeCalendarModal();
    }
    if (eventModal?.dataset.strictModal === undefined) {
      closeEventModal();
    }
  }
});

function bootCalendar() {
  try {
    initializeCalendar();
  } catch (error) {
    console.error("Calendar startup failed:", error);
    setStatus(`Calendar startup failed: ${getReadableError(error)}`, "error");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootCalendar, { once: true });
} else {
  bootCalendar();
}
