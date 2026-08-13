const calendarSupabaseClient = window.centralisSupabase;

const state = {
  appUser: null,
  settings: null,
  view: "month",
  selectedDate: new Date(),
  editingEventId: null,
  visibleMonth: startOfMonth(new Date()),
  miniMonth: startOfMonth(new Date()),
  calendars: [],
  categories: [],
  events: [],
  tasks: [],
  selectedReminderMinutes: new Set(),
  hasLoadedCalendars: false
};

const calendarPage = document.querySelector("[data-calendar-page]");
const calendarList = document.querySelector("[data-calendar-list]");
const calendarStatus = document.querySelector("[data-calendar-status]");
const calendarEmpty = document.querySelector("[data-calendar-empty]");
const calendarTitle = document.querySelector("[data-calendar-title]");
const viewButtons = document.querySelectorAll("[data-calendar-view]");
const sidebarToggle = document.querySelector("[data-calendar-sidebar-toggle]");
const miniMonthTitle = document.querySelector("[data-mini-month]");
const miniWeekdays = document.querySelector("[data-mini-weekdays]");
const miniDays = document.querySelector("[data-mini-days]");
const monthWeekdays = document.querySelector("[data-month-weekdays]");
const monthGrid = document.querySelector("[data-month-grid]");
const weekView = document.querySelector("[data-week-view]");
const dayView = document.querySelector("[data-day-view]");
const agendaView = document.querySelector("[data-agenda-view]");
const newEventButton = document.querySelector("[data-open-event-modal]");
const calendarModal = document.getElementById("calendar-modal");
const calendarForm = document.querySelector("[data-calendar-form]");
const calendarFormStatus = document.querySelector("[data-calendar-form-status]");
const eventModal = document.getElementById("event-modal");
const eventForm = document.querySelector("[data-event-form]");
const eventFormStatus = document.querySelector("[data-event-form-status]");
const eventModalTitle = document.getElementById("event-modal-title");
const eventCalendarSelect = document.querySelector("[data-event-calendar]");
const eventCategorySelect = document.querySelector("[data-event-category]");
const allDayInput = document.querySelector("[data-event-all-day]");
const deleteEventButton = document.querySelector("[data-delete-event]");
const reminderStatus = document.querySelector("[data-reminder-status]");
const reminderPresetWrap = document.querySelector("[data-reminder-presets]");

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const DEFAULT_COLOR = "#6366f1";
const MAX_MONTH_VISIBLE_ITEMS = 3;

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

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfWeek(date) {
  const weekStartsOn = Number(state.settings?.week_starts_on ?? 0);
  const day = startOfDay(date);
  const offset = (day.getDay() - weekStartsOn + 7) % 7;
  return addDays(day, -offset);
}

function getActiveRange() {
  if (state.view === "week") {
    const start = startOfWeek(state.selectedDate);
    return { start, end: addDays(start, 6) };
  }

  if (state.view === "day") {
    const day = startOfDay(state.selectedDate);
    return { start: day, end: day };
  }

  if (state.view === "agenda") {
    return {
      start: startOfMonth(state.visibleMonth),
      end: endOfMonth(state.visibleMonth)
    };
  }

  return getGridRange(state.visibleMonth);
}

function setSelectedDate(date) {
  state.selectedDate = startOfDay(date);
  state.visibleMonth = startOfMonth(date);
  state.miniMonth = startOfMonth(date);
}

function getViewTitle() {
  if (state.view === "week") {
    const { start, end } = getActiveRange();
    return `${DATE_LABEL_FORMATTER.format(start)} - ${DATE_LABEL_FORMATTER.format(end)}, ${end.getFullYear()}`;
  }

  if (state.view === "day") {
    return FULL_DATE_FORMATTER.format(state.selectedDate);
  }

  if (state.view === "agenda") {
    return `Agenda - ${MONTH_FORMATTER.format(state.visibleMonth)}`;
  }

  return MONTH_FORMATTER.format(state.visibleMonth);
}

function updateCalendarTitle() {
  if (calendarTitle) {
    calendarTitle.textContent = getViewTitle();
  }
}

function setCalendarView(view, date = state.selectedDate) {
  state.view = view;
  setSelectedDate(date);
  viewButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.calendarView === view);
  });
}

function shiftActiveView(amount) {
  if (state.view === "week") {
    setSelectedDate(addDays(state.selectedDate, amount * 7));
    return;
  }

  if (state.view === "day") {
    setSelectedDate(addDays(state.selectedDate, amount));
    return;
  }

  const nextMonth = addMonths(state.visibleMonth, amount);
  state.visibleMonth = startOfMonth(nextMonth);
  state.miniMonth = startOfMonth(nextMonth);
  state.selectedDate = startOfDay(nextMonth);
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

function openEventModal(date = state.selectedDate || new Date()) {
  if (!state.calendars.length) {
    setStatus("Create a calendar before adding events.", "error");
    return;
  }

  state.editingEventId = null;
  if (eventModalTitle) {
    eventModalTitle.textContent = "New Event";
  }
  if (deleteEventButton) {
    deleteEventButton.hidden = true;
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

async function openEventEditModal(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event || !state.calendars.some((calendar) => calendar.id === event.calendar_id)) {
    setStatus("Could not find that event.", "error");
    return;
  }

  state.editingEventId = event.id;
  if (eventModalTitle) {
    eventModalTitle.textContent = "Edit Event";
  }
  if (deleteEventButton) {
    deleteEventButton.hidden = false;
  }
  setDialogStatus(eventFormStatus, "");
  eventForm?.reset();
  populateEventSelects();

  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  eventForm.elements["event-title"].value = event.title || "";
  eventForm.elements["event-calendar"].value = String(event.calendar_id || "");
  eventForm.elements["event-category"].value = event.category_id ? String(event.category_id) : "";
  eventForm.elements["event-all-day"].checked = Boolean(event.is_all_day);
  eventForm.elements["event-start-date"].value = localInputDate(start);
  eventForm.elements["event-start-time"].value = localInputTime(start);
  eventForm.elements["event-end-date"].value = localInputDate(end);
  eventForm.elements["event-end-time"].value = localInputTime(end);
  eventForm.elements["event-repeat"].value = rRuleToRepeat(event.recurrence_rule);
  eventForm.elements["event-location"].value = event.location || "";
  eventForm.elements["event-description"].value = event.description || event.notes || "";
  eventForm.elements["event-start-time"].disabled = Boolean(event.is_all_day);
  eventForm.elements["event-end-time"].disabled = Boolean(event.is_all_day);

  state.selectedReminderMinutes.clear();
  try {
    const { data, error } = await calendarSupabaseClient
      .from("reminders")
      .select("minutes_before")
      .eq("event_id", event.id)
      .eq("deleted", false);
    if (error) {
      throw error;
    }
    (data || []).forEach((reminder) => {
      state.selectedReminderMinutes.add(Number(reminder.minutes_before));
    });
  } catch (error) {
    console.warn("Could not load event reminders.", error);
  }
  updateReminderUi();

  if (eventModal) {
    eventModal.hidden = false;
    eventForm.elements["event-title"]?.focus();
  }
}

function closeEventModal() {
  if (eventModal) {
    eventModal.hidden = true;
  }
  state.editingEventId = null;
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
  const selectedKey = dateKey(state.selectedDate);
  const cells = [];

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(start, index);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(date.getDate());
    button.classList.toggle("is-muted", date.getMonth() !== state.miniMonth.getMonth());
    button.classList.toggle("is-today", dateKey(date) === todayKey);
    button.classList.toggle("is-current-month", dateKey(date) === selectedKey);
    button.addEventListener("click", () => {
      setSelectedDate(date);
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
    if (!state.hasLoadedCalendars) {
      calendarList.innerHTML = '<p class="calendar-sidebar-empty">Loading calendars...</p>';
      return;
    }
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
    const dayItems = eventsByDate.get(key) || [];
    dayItems.slice(0, MAX_MONTH_VISIBLE_ITEMS).forEach((item) => {
      list.append(createCalendarItemElement(item, "month"));
    });

    const extra = dayItems.length - MAX_MONTH_VISIBLE_ITEMS;
    if (extra > 0) {
      const chip = document.createElement("span");
      chip.className = "month-event-more";
      chip.textContent = `+${extra}`;
      chip.addEventListener("click", (event) => {
        event.stopPropagation();
        setCalendarView("day", date);
        refreshCalendarData();
      });
      list.append(chip);
    }

    cell.addEventListener("click", () => {
      state.selectedDate = startOfDay(date);
      renderMiniCalendar();
    });
    cell.addEventListener("dblclick", () => openEventModal(date));
    cells.push(cell);
  }

  monthGrid.replaceChildren(...cells);
}

function createCalendarItemElement(item, variant = "card") {
  const element = document.createElement(variant === "month" ? "span" : "article");
  const isTask = item.type === "task";
  element.className = variant === "month"
    ? isTask ? "month-event-chip month-task-chip" : "month-event-chip"
    : isTask ? "calendar-item-card calendar-task-card" : "calendar-item-card";
  element.style.setProperty("--event-color", normalizeColor(item.color));

  if (variant === "month") {
    element.textContent = isTask
      ? `Task: ${item.title}`
      : item.is_all_day ? item.title : `${TIME_FORMATTER.format(item.start)} ${item.title}`;
  } else {
    element.innerHTML = `
      <span class="calendar-item-time">${escapeHtml(getItemTimeLabel(item))}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <span class="calendar-item-kind">${isTask ? "Task" : "Event"}</span>
    `;
  }

  element.tabIndex = 0;
  element.setAttribute("role", "button");

  if (isTask) {
    const openTask = (event) => {
      event.stopPropagation();
      window.location.href = `todo.html?task=${encodeURIComponent(item.id)}`;
    };
    element.setAttribute("aria-label", `Open task ${item.title || "Untitled Task"} in ToDo`);
    element.addEventListener("click", openTask);
    element.addEventListener("dblclick", openTask);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openTask(event);
      }
    });
  } else {
    element.addEventListener("click", (event) => event.stopPropagation());
    element.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      openEventEditModal(item.id);
    });
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        openEventEditModal(item.id);
      }
    });
  }

  return element;
}

function getItemTimeLabel(item) {
  if (item.type === "task") {
    return "Task";
  }
  if (item.is_all_day) {
    return "All day";
  }
  return `${TIME_FORMATTER.format(item.start)} - ${TIME_FORMATTER.format(item.end)}`;
}

function renderWeekView() {
  if (!weekView) return;
  const { start, end } = getActiveRange();
  const itemsByDate = buildCalendarItemsByDate(start, end);
  const columns = [];

  for (let index = 0; index < 7; index += 1) {
    const date = addDays(start, index);
    const key = dateKey(date);
    const column = document.createElement("section");
    column.className = "calendar-week-day";
    column.innerHTML = `
      <button class="calendar-week-day-header" type="button">
        <span>${WEEKDAY_LABELS[date.getDay()]}</span>
        <strong>${date.getDate()}</strong>
      </button>
      <div class="calendar-day-items"></div>
    `;
    column.querySelector(".calendar-week-day-header").addEventListener("click", () => {
      setCalendarView("day", date);
      refreshCalendarData();
    });
    column.addEventListener("dblclick", () => openEventModal(date));
    const list = column.querySelector(".calendar-day-items");
    const items = itemsByDate.get(key) || [];
    if (!items.length) {
      list.innerHTML = '<p class="calendar-view-empty">No items.</p>';
    } else {
      items.forEach((item) => list.append(createCalendarItemElement(item)));
    }
    columns.push(column);
  }

  weekView.replaceChildren(...columns);
}

function renderDayView() {
  if (!dayView) return;
  const day = startOfDay(state.selectedDate);
  const items = buildCalendarItemsByDate(day, day).get(dateKey(day)) || [];
  const panel = document.createElement("section");
  panel.className = "calendar-day-panel";
  panel.addEventListener("dblclick", () => openEventModal(day));
  panel.innerHTML = `
    <div class="calendar-day-heading">
      <span>${WEEKDAY_LABELS[day.getDay()]}</span>
      <strong>${FULL_DATE_FORMATTER.format(day)}</strong>
    </div>
    <div class="calendar-day-items"></div>
  `;
  const list = panel.querySelector(".calendar-day-items");
  if (!items.length) {
    list.innerHTML = '<p class="calendar-view-empty">No events or tasks for this day.</p>';
  } else {
    items.forEach((item) => list.append(createCalendarItemElement(item)));
  }
  dayView.replaceChildren(panel);
}

function renderAgendaView() {
  if (!agendaView) return;
  const start = startOfMonth(state.visibleMonth);
  const end = endOfMonth(state.visibleMonth);
  const itemsByDate = buildCalendarItemsByDate(start, end);
  const groups = [];

  for (let date = new Date(start); date <= end; date = addDays(date, 1)) {
    const items = itemsByDate.get(dateKey(date)) || [];
    if (!items.length) {
      continue;
    }
    const group = document.createElement("section");
    group.className = "calendar-agenda-group";
    group.innerHTML = `
      <button class="calendar-agenda-date" type="button">${escapeHtml(FULL_DATE_FORMATTER.format(date))}</button>
      <div class="calendar-day-items"></div>
    `;
    group.querySelector(".calendar-agenda-date").addEventListener("click", () => {
      setCalendarView("day", date);
      refreshCalendarData();
    });
    const list = group.querySelector(".calendar-day-items");
    items.forEach((item) => list.append(createCalendarItemElement(item)));
    groups.push(group);
  }

  if (!groups.length) {
    agendaView.innerHTML = '<p class="calendar-view-empty calendar-agenda-empty">No events or tasks this month.</p>';
    return;
  }

  agendaView.replaceChildren(...groups);
}

function renderEmptyState() {
  if (!state.hasLoadedCalendars) {
    if (calendarEmpty) {
      calendarEmpty.hidden = true;
    }
    if (monthGrid) {
      monthGrid.hidden = state.view !== "month";
    }
    if (monthWeekdays) {
      monthWeekdays.hidden = state.view !== "month";
    }
    if (weekView) {
      weekView.hidden = state.view !== "week";
    }
    if (dayView) {
      dayView.hidden = state.view !== "day";
    }
    if (agendaView) {
      agendaView.hidden = state.view !== "agenda";
    }
    if (newEventButton) {
      newEventButton.disabled = true;
    }
    return;
  }

  const hasCalendars = state.calendars.length > 0;
  const hasCalendarContent = hasCalendars || state.tasks.length > 0;
  if (calendarEmpty) {
    calendarEmpty.hidden = hasCalendarContent;
  }
  if (monthGrid) {
    monthGrid.hidden = !hasCalendarContent || state.view !== "month";
  }
  if (monthWeekdays) {
    monthWeekdays.hidden = !hasCalendarContent || state.view !== "month";
  }
  if (weekView) {
    weekView.hidden = !hasCalendarContent || state.view !== "week";
  }
  if (dayView) {
    dayView.hidden = !hasCalendarContent || state.view !== "day";
  }
  if (agendaView) {
    agendaView.hidden = !hasCalendarContent || state.view !== "agenda";
  }
  if (newEventButton) {
    newEventButton.disabled = !hasCalendars;
  }
}

function renderAll() {
  updateCalendarTitle();
  viewButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.calendarView === state.view);
  });
  renderWeekdayHeaders();
  renderMiniCalendar();
  renderCalendarList();
  renderEmptyState();
  renderMonthGrid();
  renderWeekView();
  renderDayView();
  renderAgendaView();
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

function rRuleToRepeat(rawRule) {
  const rule = parseRRule(rawRule);
  if (!rawRule) {
    return "none";
  }
  if (rule.BYDAY === "MO,TU,WE,TH,FR") {
    return "weekdays";
  }
  const repeatByFrequency = {
    DAILY: "daily",
    WEEKLY: "weekly",
    MONTHLY: "monthly",
    YEARLY: "yearly"
  };
  return repeatByFrequency[rule.FREQ] || "none";
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

  const { start, end } = getActiveRange();
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

  const { start, end } = getActiveRange();
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
    state.hasLoadedCalendars = true;
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

function buildEventPayload(formData) {
  const title = String(formData.get("event-title") || "").trim();
  const calendarId = Number(formData.get("event-calendar"));
  const categoryId = formData.get("event-category") ? Number(formData.get("event-category")) : null;
  const repeat = String(formData.get("event-repeat") || "none");
  const isAllDay = Boolean(formData.get("event-all-day"));

  if (!title || !calendarId) {
    setDialogStatus(eventFormStatus, "Title and calendar are required.", "error");
    return null;
  }

  if (!state.calendars.some((calendar) => calendar.id === calendarId)) {
    setDialogStatus(eventFormStatus, "Choose one of your calendars.", "error");
    return null;
  }

  const startDate = String(formData.get("event-start-date"));
  const endDate = String(formData.get("event-end-date"));
  const startTime = String(formData.get("event-start-time") || "00:00");
  const endTime = String(formData.get("event-end-time") || "00:00");
  const start = isAllDay ? allDayStart(startDate) : dateTimeFromInputs(startDate, startTime);
  const end = isAllDay ? allDayEnd(endDate) : dateTimeFromInputs(endDate, endTime);

  if (end < start) {
    setDialogStatus(eventFormStatus, "End must be after start.", "error");
    return null;
  }

  const rawRule = repeatToRRule(repeat);
  return {
    repeat,
    rawRule,
    payload: {
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
    }
  };
}

function getDeletedStamp({ includeUpdatedAt = true } = {}) {
  const now = new Date().toISOString();
  const stamp = {
    deleted: true,
    deleted_at: now,
    deleted_by: state.appUser.id
  };

  if (includeUpdatedAt) {
    stamp.updated_at = now;
  }

  return stamp;
}

async function softDeleteEventFollowUps(eventId) {
  const stamp = getDeletedStamp({ includeUpdatedAt: false });
  const results = await Promise.all([
    calendarSupabaseClient
      .from("event_recurrence_rules")
      .update(stamp)
      .eq("event_id", eventId)
      .eq("deleted", false),
    calendarSupabaseClient
      .from("reminders")
      .update(stamp)
      .eq("event_id", eventId)
      .eq("deleted", false)
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw failed.error;
  }
}

async function replaceEventFollowUps(eventId, repeat, rawRule) {
  await softDeleteEventFollowUps(eventId);

  const followUps = [];
  if (rawRule) {
    followUps.push(calendarSupabaseClient
      .from("event_recurrence_rules")
      .insert(repeatToRuleRow(eventId, repeat, rawRule)));
  }

  if (state.selectedReminderMinutes.size) {
    followUps.push(calendarSupabaseClient
      .from("reminders")
      .insert([...state.selectedReminderMinutes].map((minutes) => ({
        event_id: eventId,
        minutes_before: minutes,
        method: "popup"
      }))));
  }

  const results = await Promise.all(followUps);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw failed.error;
  }
}

async function createEvent(formData) {
  const built = buildEventPayload(formData);
  if (!built) {
    return;
  }

  setDialogStatus(eventFormStatus, "Saving event...");
  const { data: event, error } = await calendarSupabaseClient
    .from("events")
    .insert(built.payload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await replaceEventFollowUps(event.id, built.repeat, built.rawRule);

  closeEventModal();
  await refreshCalendarData();
}

async function updateEvent(formData) {
  const built = buildEventPayload(formData);
  if (!built || !state.editingEventId) {
    return;
  }

  const calendarIds = state.calendars.map((calendar) => calendar.id);
  setDialogStatus(eventFormStatus, "Saving event...");
  const { error } = await calendarSupabaseClient
    .from("events")
    .update({
      ...built.payload,
      updated_at: new Date().toISOString()
    })
    .eq("id", state.editingEventId)
    .in("calendar_id", calendarIds)
    .eq("deleted", false);

  if (error) {
    throw error;
  }

  await replaceEventFollowUps(state.editingEventId, built.repeat, built.rawRule);
  closeEventModal();
  await refreshCalendarData();
}

async function deleteEvent(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event || !window.confirm(`Delete event "${event.title}"?`)) {
    return;
  }

  const calendarIds = state.calendars.map((calendar) => calendar.id);
  const { error } = await calendarSupabaseClient
    .from("events")
    .update(getDeletedStamp())
    .eq("id", eventId)
    .in("calendar_id", calendarIds)
    .eq("deleted", false);

  if (error) {
    throw error;
  }

  await softDeleteEventFollowUps(eventId);
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
  renderAll();
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
  setSelectedDate(new Date());
  refreshCalendarData();
});

document.querySelector("[data-calendar-prev]")?.addEventListener("click", () => {
  shiftActiveView(-1);
  refreshCalendarData();
});

document.querySelector("[data-calendar-next]")?.addEventListener("click", () => {
  shiftActiveView(1);
  refreshCalendarData();
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.calendarView;
    if (!view || view === state.view) {
      return;
    }
    setCalendarView(view, state.selectedDate);
    refreshCalendarData();
  });
});

sidebarToggle?.addEventListener("click", () => {
  const isCollapsed = calendarPage?.classList.toggle("is-sidebar-collapsed");
  const label = isCollapsed ? "Expand mini calendar" : "Collapse mini calendar";
  sidebarToggle.setAttribute("aria-label", label);
  sidebarToggle.title = label;
});

document.querySelector("[data-mini-prev]")?.addEventListener("click", () => {
  state.miniMonth = addMonths(state.miniMonth, -1);
  renderMiniCalendar();
});

document.querySelector("[data-mini-next]")?.addEventListener("click", () => {
  state.miniMonth = addMonths(state.miniMonth, 1);
  renderMiniCalendar();
});

newEventButton?.addEventListener("click", () => openEventModal(state.selectedDate || new Date()));

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
    if (state.editingEventId) {
      await updateEvent(new FormData(eventForm));
    } else {
      await createEvent(new FormData(eventForm));
    }
  } catch (error) {
    console.error(error);
    setDialogStatus(eventFormStatus, `Could not save event: ${getReadableError(error)}`, "error");
  }
});

deleteEventButton?.addEventListener("click", async () => {
  if (!state.editingEventId) {
    return;
  }
  try {
    await deleteEvent(state.editingEventId);
  } catch (error) {
    console.error(error);
    setDialogStatus(eventFormStatus, `Could not delete event: ${getReadableError(error)}`, "error");
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
