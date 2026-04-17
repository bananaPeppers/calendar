// Populate date tab with today's date.
(() => {
  const el = document.getElementById("dateTab");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
})();

const modal = document.getElementById("eventModal");
const closeModalBtn = document.getElementById("closeModal");
const saveModalBtn = document.getElementById("saveEventBtn");
const addEventBtn = document.getElementById("addEventBtn");
const eventForm = document.getElementById("eventForm");
const eventTitle = document.getElementById("eventTitle");
const eventDate = document.getElementById("eventDate");
const eventTime = document.getElementById("eventTime");
const eventEndTime = document.getElementById("eventEndTime");
const eventsList = document.getElementById("eventsList");
const emptyState = document.getElementById("emptyState");
const appMessage = document.getElementById("appMessage");
const googleConnectBtn = document.getElementById("googleConnectBtn");
const googleDisconnectBtn = document.getElementById("googleDisconnectBtn");
const miniCalendar = document.getElementById("miniCalendar");
const miniCalPrev = document.getElementById("miniCalPrev");
const miniCalNext = document.getElementById("miniCalNext");
const miniCalMonthLabel = document.getElementById("miniCalMonthLabel");
const miniCalGrid = document.getElementById("miniCalGrid");
const timeDial = document.getElementById("timeDial");
const timeDialRing = document.getElementById("timeDialRing");
const timeDialStartHandle = document.getElementById("timeDialStartHandle");
const timeDialEndHandle = document.getElementById("timeDialEndHandle");
const timeDialStartText = document.getElementById("timeDialStartText");
const timeDialEndRow = document.getElementById("timeDialEndRow");
const timeDialEndText = document.getElementById("timeDialEndText");
const timeDialDuration = document.getElementById("timeDialDuration");
const modalConflictMessage = document.getElementById("modalConflictMessage");
const modalConflictText = modalConflictMessage?.querySelector(".modal-conflict-text");

const wheelPicker = document.getElementById("wheelPicker");
const wheelBackdrop = document.getElementById("wheelBackdrop");
const wheelColumns = document.getElementById("wheelColumns");
const wheelPickerTitle = document.getElementById("wheelPickerTitle");
const wheelCancelBtn = document.getElementById("wheelCancelBtn");
const wheelDoneBtn = document.getElementById("wheelDoneBtn");

let defaultEventCounter = 1;
let isGoogleConnected = false;
let wheelState = null;
let miniCalendarView = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let miniCalendarSelectedIso = "";
let dialStartMinutes = 0;
let dialEndMinutes = 60;
let activeDialHandle = null;
let isDialEndHandleVisible = false;
let didMoveStartInCurrentDrag = false;
let isDialEndTimePlaced = false;
let wasEndVisibleBeforeStartDrag = false;
let wasEndPlacedBeforeStartDrag = false;
const DIAL_TOP_MINUTES = 360; // Top of dial = 6:00 AM
const DIAL_MINUTE_STEP = 15;
const DIAL_MAX_MINUTES = 1440 - DIAL_MINUTE_STEP;
const MINUTES_PER_DAY = 1440;

const WHEEL_ITEM_HEIGHT = 44;
const softClasses = [
  "date-bubble--t0",
  "date-bubble--t1",
  "date-bubble--t2",
  "date-bubble--t3",
  "date-bubble--t4",
  "date-bubble--t5",
  "date-bubble--t6",
];

function pad2(num) {
  return String(num).padStart(2, "0");
}

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toIsoDate(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function formatDateDisplayFromIso(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${pad2(m)}/${pad2(d)}/${y}`;
}

function normalizeDateInput(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const dt = new Date(year, month - 1, day);
    if (
      dt.getFullYear() === year &&
      dt.getMonth() + 1 === month &&
      dt.getDate() === day
    ) {
      return toIsoDate(year, month, day);
    }
  }

  const slashMatch = raw.match(/^(\d{1,2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    const dt = new Date(year, month - 1, day);
    if (
      dt.getFullYear() === year &&
      dt.getMonth() + 1 === month &&
      dt.getDate() === day
    ) {
      return toIsoDate(year, month, day);
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return toIsoDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

function normalizeTimeInput(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  const h24Match = raw.match(/^([01]?\d|2[0-3])\s*:\s*([0-5]\d)$/);
  if (h24Match) {
    return `${pad2(Number(h24Match[1]))}:${h24Match[2]}`;
  }

  const h12Match = raw.match(/^(\d{1,2})(?:\s*:\s*([0-5]\d))?\s*([AaPp][Mm])$/);
  if (h12Match) {
    let hour = Number(h12Match[1]);
    const minute = h12Match[2] ? Number(h12Match[2]) : 0;
    const period = h12Match[3].toUpperCase();
    if (hour < 1 || hour > 12) return "";
    if (period === "PM" && hour < 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
    return `${pad2(hour)}:${pad2(minute)}`;
  }

  return "";
}

function formatTimeDisplay(time24) {
  if (!time24) return "";
  const normalized = normalizeTimeInput(time24);
  if (!normalized) return "";
  let [hour, minute] = normalized.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${pad2(minute)} ${period}`;
}

function time24ToParts(time24) {
  const normalized = normalizeTimeInput(time24) || "00:00";
  let [hour, minute] = normalized.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return { hour: String(hour), minute: pad2(minute), period };
}

function partsToTime24(hour12, minute, period) {
  let hour = Number(hour12);
  const mins = Number(minute);
  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return `${pad2(hour)}:${pad2(mins)}`;
}

function roundMinuteToStep(minute, step = 5) {
  const val = clamp(Number(minute) || 0, 0, 59);
  return Math.floor(val / step) * step;
}

function getClockwiseMinutesBetween(startMinutes, endMinutes) {
  return ((endMinutes - startMinutes) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function getCircularMinuteDistance(aMinutes, bMinutes) {
  const diff = Math.abs(aMinutes - bMinutes);
  return Math.min(diff, MINUTES_PER_DAY - diff);
}

function time24ToMinutes(time24) {
  const normalized = normalizeTimeInput(time24);
  if (!normalized) return 0;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTime24(totalMinutes) {
  const safe = ((Number(totalMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return `${pad2(hour)}:${pad2(minute)}`;
}

function formatDurationLabel(startMinutes, endMinutes) {
  const clockwise = getClockwiseMinutesBetween(startMinutes, endMinutes);
  const diff = Math.max(DIAL_MINUTE_STEP, clockwise || DIAL_MINUTE_STEP);
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  return `${hours}:${pad2(minutes)}`;
}

function showAppMessage(text, type = "info") {
  if (!appMessage || !text) return;
  appMessage.hidden = false;
  appMessage.textContent = text;
  appMessage.classList.remove("is-success", "is-error");
  if (type === "success") appMessage.classList.add("is-success");
  if (type === "error") appMessage.classList.add("is-error");
}

function clearAppMessage() {
  if (!appMessage) return;
  appMessage.hidden = true;
  appMessage.textContent = "";
  appMessage.classList.remove("is-success", "is-error");
}

function setModalConflictMessage(message = "") {
  const text = String(message || "").trim();
  const hasConflict = Boolean(text);

  if (modalConflictMessage) {
    modalConflictMessage.hidden = !hasConflict;
    if (modalConflictText) {
      modalConflictText.textContent = text;
    } else {
      modalConflictMessage.textContent = text;
    }
  }

  if (saveModalBtn) {
    saveModalBtn.disabled = hasConflict;
  }
}

function clearModalConflictMessage() {
  setModalConflictMessage("");
}

function rangesOverlap(a, b) {
  if (!a || !b) return false;
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

function buildEventRange(startDate, startTime, options = {}) {
  const allDay = Boolean(options.allDay);
  const endDate = options.endDate || startDate;
  const normalizedStart = allDay ? "00:00" : normalizeTimeInput(startTime || "");
  if (!startDate || !normalizedStart) return null;

  const startAt = parseIsoDateTime(startDate, normalizedStart);
  if (!startAt || Number.isNaN(startAt.getTime())) return null;

  let endAt = null;
  if (allDay) {
    endAt = parseIsoDateTime(endDate || startDate, "00:00");
    if (!endAt || endAt <= startAt) {
      endAt = new Date(startAt);
      endAt.setDate(endAt.getDate() + 1);
    }
  } else {
    const normalizedEnd = normalizeTimeInput(options.endTime || "") || normalizedStart;
    endAt = parseIsoDateTime(endDate || startDate, normalizedEnd);
    if (!endAt) {
      endAt = new Date(startAt);
      endAt.setMinutes(endAt.getMinutes() + 1);
    }
    if (endAt <= startAt) {
      endAt.setDate(endAt.getDate() + 1);
    }
  }

  return { startAt, endAt };
}

function getModalDraftRange() {
  const draftDate = normalizeDateInput(eventDate?.value || "");
  const draftStart = normalizeTimeInput(eventTime?.value || "");
  const draftEnd = normalizeTimeInput(eventEndTime?.value || "");
  if (!draftDate || !draftStart || !draftEnd) return null;

  const startMinutes = time24ToMinutes(draftStart);
  const endMinutes = time24ToMinutes(draftEnd);
  if (getClockwiseMinutesBetween(startMinutes, endMinutes) < DIAL_MINUTE_STEP) return null;

  return buildEventRange(draftDate, draftStart, {
    endDate: draftDate,
    endTime: draftEnd,
    allDay: false,
  });
}

function findModalConflictEvent(draftRange) {
  if (!eventsList || !draftRange) return null;
  const rows = eventsList.querySelectorAll(".event-row");

  for (const row of rows) {
    const startDate = row.dataset.startDate || "";
    const startTime = row.dataset.startTime || "";
    const endDate = row.dataset.endDate || startDate;
    const endTime = row.dataset.endTime || startTime;
    const allDay = row.dataset.allDay === "1";
    if (!startDate || !startTime) continue;

    const existingRange = buildEventRange(startDate, startTime, {
      endDate,
      endTime,
      allDay,
    });
    if (!rangesOverlap(draftRange, existingRange)) continue;

    return {
      title: row.dataset.title || row.querySelector(".event-title")?.textContent?.trim() || "Existing event",
      startTime,
      endTime,
      allDay,
    };
  }

  return null;
}

function validateModalTimeConflict() {
  if (!modal || modal.getAttribute("aria-hidden") !== "false") {
    clearModalConflictMessage();
    return false;
  }

  const draftRange = getModalDraftRange();
  if (!draftRange) {
    clearModalConflictMessage();
    return false;
  }

  const conflict = findModalConflictEvent(draftRange);
  if (!conflict) {
    clearModalConflictMessage();
    return false;
  }

  const timeRangeText = conflict.allDay
    ? "All day"
    : `${formatTimeDisplay(conflict.startTime)} - ${formatTimeDisplay(conflict.endTime)}`;
  setModalConflictMessage(`Time conflict with "${conflict.title}" (${timeRangeText}).`);
  return true;
}

function syncEmptyState() {
  if (!eventsList || !emptyState) return;
  const hasEvents = Boolean(eventsList.querySelector(".event-row"));
  emptyState.style.display = hasEvents ? "none" : "flex";
}

function clearRenderedEvents() {
  if (!eventsList) return;
  eventsList.innerHTML = "";
  syncEmptyState();
}

function updateGoogleUi(connected) {
  if (googleConnectBtn) googleConnectBtn.hidden = connected;
  if (googleDisconnectBtn) googleDisconnectBtn.hidden = !connected;
}

function consumeQueryMessages() {
  const params = new URLSearchParams(window.location.search);
  const connected = params.get("google");
  const error = params.get("google_error");

  if (connected === "connected") {
    showAppMessage("Google Calendar connected.", "success");
  } else if (error) {
    showAppMessage(`Google Calendar error: ${error}`, "error");
  }

  if (connected || error) {
    params.delete("google");
    params.delete("google_error");
    const query = params.toString();
    const next = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState({}, "", next);
  }
}

function getStableColorClass(dateString) {
  let hash = 0;
  for (let i = 0; i < dateString.length; i += 1) {
    hash = (hash * 31 + dateString.charCodeAt(i)) % softClasses.length;
  }
  return softClasses[Math.abs(hash) % softClasses.length];
}

function getDateBubbleLabel(dateString) {
  const target = new Date(`${dateString}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const prettyDate = target.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  if (target.getTime() === today.getTime()) return `Today, ${prettyDate}`;
  if (target.getTime() === tomorrow.getTime()) return `Tomorrow, ${prettyDate}`;

  return target.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function getDateSortValue(dateString) {
  const stamp = new Date(`${dateString}T00:00:00`).getTime();
  return Number.isNaN(stamp) ? Number.MAX_SAFE_INTEGER : stamp;
}

function parseIsoDateTime(dateString, timeString = "00:00") {
  const dateMatch = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const normalizedTime = normalizeTimeInput(timeString) || "00:00";
  const timeMatch = normalizedTime.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function shouldDisplayInUpcoming(date, time, options = {}) {
  const allDay = Boolean(options.allDay);
  const endDate = options.endDate || date;
  const endTime = options.endTime || "";

  const startAt = parseIsoDateTime(date, allDay ? "00:00" : time);
  if (!startAt || Number.isNaN(startAt.getTime())) return false;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const dayAfterTomorrowStart = new Date(todayStart);
  dayAfterTomorrowStart.setDate(dayAfterTomorrowStart.getDate() + 2);

  if (startAt < todayStart) return false;
  if (startAt >= dayAfterTomorrowStart) return false;

  const now = new Date();
  let endAt = null;
  if (allDay) {
    endAt = parseIsoDateTime(endDate || date, "00:00");
    if (!endAt || endAt <= startAt) {
      endAt = new Date(startAt);
      endAt.setDate(endAt.getDate() + 1);
    }
  } else {
    endAt = endTime ? parseIsoDateTime(date, endTime) : null;
    if (!endAt) {
      endAt = new Date(startAt);
      endAt.setMinutes(endAt.getMinutes() + 1);
    }
    if (endAt <= startAt) endAt.setDate(endAt.getDate() + 1);
  }

  return endAt > now;
}

function getTimeSortValue(timeString, allDay = false) {
  if (allDay) return -1;
  const normalized = normalizeTimeInput(timeString);
  if (!normalized) return 0;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function insertGroupInDateOrder(group, dateString) {
  if (!eventsList) return;
  const target = getDateSortValue(dateString);
  const groups = eventsList.querySelectorAll(".date-group");

  for (const existing of groups) {
    const existingDate = existing.getAttribute("data-date") || "";
    if (getDateSortValue(existingDate) > target) {
      eventsList.insertBefore(group, existing);
      return;
    }
  }

  eventsList.appendChild(group);
}

function insertEventInTimeOrder(groupEventsEl, row, timeString, allDay = false) {
  if (!groupEventsEl) return;
  const target = getTimeSortValue(timeString, allDay);
  const rows = groupEventsEl.querySelectorAll(".event-row");

  for (const existingRow of rows) {
    const existing = Number(existingRow.dataset.sortTime || "0");
    if (existing > target) {
      groupEventsEl.insertBefore(row, existingRow);
      return;
    }
  }

  groupEventsEl.appendChild(row);
}

function buildTimeLabel(date, time, endTime, allDay = false) {
  if (allDay) return "All day";

  const startText = formatTimeDisplay(time);
  if (!endTime) return startText;

  const endText = formatTimeDisplay(endTime);
  return `${startText} - ${endText}`;
}

function addEventToList(date, time, title, options = {}) {
  if (!eventsList || !date) return;

  const allDay = Boolean(options.allDay);
  const endTime = options.endTime || "";
  const endDate = options.endDate || date;
  const safeTitle = (title || "").trim() || "Untitled event";
  const normalizedStartTime = normalizeTimeInput(time) || "00:00";
  const normalizedEndTime = normalizeTimeInput(endTime) || normalizedStartTime;
  if (!shouldDisplayInUpcoming(date, time, { allDay, endTime, endDate })) return;

  let group = eventsList.querySelector(`[data-date="${date}"]`);
  if (!group) {
    group = document.createElement("li");
    group.className = "date-group";
    group.setAttribute("data-date", date);

    const header = document.createElement("div");
    header.className = "group-header";
    const bubble = document.createElement("div");
    bubble.className = `date-bubble ${getStableColorClass(date)}`;
    bubble.textContent = getDateBubbleLabel(date);
    header.appendChild(bubble);

    const dayCard = document.createElement("div");
    dayCard.className = "day-card";
    const groupEvents = document.createElement("ul");
    groupEvents.className = "group-events";
    dayCard.appendChild(groupEvents);

    group.appendChild(header);
    group.appendChild(dayCard);
    insertGroupInDateOrder(group, date);
  }

  const groupEventsEl = group.querySelector(".group-events");
  const row = document.createElement("li");
  row.className = "event-row";
  row.dataset.sortTime = String(getTimeSortValue(time, allDay));
  row.dataset.startDate = date;
  row.dataset.startTime = normalizedStartTime;
  row.dataset.endDate = endDate;
  row.dataset.endTime = normalizedEndTime;
  row.dataset.allDay = allDay ? "1" : "0";
  row.dataset.title = safeTitle;

  const titleEl = document.createElement("div");
  titleEl.className = "event-title";
  titleEl.textContent = safeTitle;

  const timeEl = document.createElement("div");
  timeEl.className = "event-time";
  timeEl.textContent = buildTimeLabel(date, time, endTime, allDay);

  row.appendChild(titleEl);
  row.appendChild(timeEl);
  insertEventInTimeOrder(groupEventsEl, row, time, allDay);
  syncEmptyState();
}

function getInputForPickerKind(kind) {
  if (kind === "date") return eventDate;
  if (kind === "start-time") return eventTime;
  if (kind === "end-time") return eventEndTime;
  return null;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getTodayIsoDate() {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function renderMiniCalendar() {
  if (!miniCalendar || !miniCalMonthLabel || !miniCalGrid) return;

  const year = miniCalendarView.getFullYear();
  const monthIndex = miniCalendarView.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = getDaysInMonth(year, monthIndex + 1);
  const todayIso = getTodayIsoDate();

  miniCalMonthLabel.textContent = new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  miniCalGrid.innerHTML = "";

  for (let i = 0; i < firstDay; i += 1) {
    const empty = document.createElement("span");
    empty.className = "mini-cal-empty";
    empty.setAttribute("aria-hidden", "true");
    miniCalGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const isoDate = toIsoDate(year, monthIndex + 1, day);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mini-cal-day";
    btn.textContent = String(day);
    btn.setAttribute("role", "gridcell");
    btn.setAttribute("aria-label", new Date(year, monthIndex, day).toDateString());
    if (isoDate === miniCalendarSelectedIso) btn.classList.add("is-selected");
    if (isoDate === todayIso) btn.classList.add("is-today");

    btn.addEventListener("click", () => {
      miniCalendarSelectedIso = isoDate;
      if (eventDate) eventDate.value = formatDateDisplayFromIso(isoDate);
      renderMiniCalendar();
      validateModalTimeConflict();
    });

    miniCalGrid.appendChild(btn);
  }

  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const tail = totalCells - (firstDay + daysInMonth);
  for (let i = 0; i < tail; i += 1) {
    const empty = document.createElement("span");
    empty.className = "mini-cal-empty";
    empty.setAttribute("aria-hidden", "true");
    miniCalGrid.appendChild(empty);
  }
}

function syncMiniCalendarFromInput() {
  const normalized = normalizeDateInput(eventDate?.value || "");
  if (!normalized) {
    miniCalendarSelectedIso = "";
    renderMiniCalendar();
    validateModalTimeConflict();
    return;
  }

  miniCalendarSelectedIso = normalized;
  if (eventDate) eventDate.value = formatDateDisplayFromIso(normalized);

  const [year, month] = normalized.split("-").map(Number);
  miniCalendarView = new Date(year, month - 1, 1);
  renderMiniCalendar();
  validateModalTimeConflict();
}

function minutesToDialAngle(minutes) {
  const normalized = ((minutes - DIAL_TOP_MINUTES) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return (normalized / MINUTES_PER_DAY) * 360;
}

function getDialMinutesFromPoint(clientX, clientY) {
  if (!timeDialRing) return 0;
  const rect = timeDialRing.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let angle = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI + 90;
  if (angle < 0) angle += 360;
  const raw = ((angle / 360) * MINUTES_PER_DAY + DIAL_TOP_MINUTES) % MINUTES_PER_DAY;
  const snapped = Math.round(raw / DIAL_MINUTE_STEP) * DIAL_MINUTE_STEP;
  return clamp(snapped, 0, DIAL_MAX_MINUTES);
}

function setDialEndHandleVisible(visible) {
  isDialEndHandleVisible = Boolean(visible);
  if (timeDial) {
    timeDial.classList.toggle("is-end-handle-visible", isDialEndHandleVisible);
  }
}

function beginStartHandlePlacementCycle() {
  wasEndVisibleBeforeStartDrag = isDialEndHandleVisible;
  wasEndPlacedBeforeStartDrag = isDialEndTimePlaced;
  setDialEndHandleVisible(false);
  isDialEndTimePlaced = false;
  didMoveStartInCurrentDrag = false;
}

function placeDialHandle(handle, minutes) {
  if (!timeDialRing || !handle) return;
  const rect = timeDialRing.getBoundingClientRect();
  const radius = rect.width / 2 - rect.width * 0.038;
  const normalized = ((minutes - DIAL_TOP_MINUTES) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const angle = (normalized / MINUTES_PER_DAY) * Math.PI * 2 - Math.PI / 2;
  const x = rect.width / 2 + Math.cos(angle) * radius;
  const y = rect.height / 2 + Math.sin(angle) * radius;
  handle.style.left = `${x}px`;
  handle.style.top = `${y}px`;
}

function renderTimeDial() {
  if (!timeDialRing) return;

  const startAngle = minutesToDialAngle(dialStartMinutes);
  const endAngle = minutesToDialAngle(dialEndMinutes);
  timeDialRing.style.setProperty("--dial-start-angle", `${startAngle}deg`);
  timeDialRing.style.setProperty("--dial-end-angle", `${endAngle}deg`);

  placeDialHandle(timeDialStartHandle, dialStartMinutes);
  placeDialHandle(timeDialEndHandle, dialEndMinutes);

  const startText = formatTimeDisplay(minutesToTime24(dialStartMinutes));
  const endText = formatTimeDisplay(minutesToTime24(dialEndMinutes));
  if (eventTime) eventTime.value = startText;
  if (eventEndTime) eventEndTime.value = endText;
  if (timeDialStartText) timeDialStartText.textContent = startText;
  if (timeDialEndRow) timeDialEndRow.hidden = !isDialEndTimePlaced;
  if (timeDialEndText) timeDialEndText.textContent = endText;
  if (timeDialDuration) timeDialDuration.textContent = `Duration ${formatDurationLabel(dialStartMinutes, dialEndMinutes)}`;
  validateModalTimeConflict();
}

function setDialFromInputValues() {
  const now = new Date();
  const defaultStart = `${pad2(now.getHours())}:${pad2(roundMinuteToStep(now.getMinutes(), DIAL_MINUTE_STEP))}`;
  const startNormalized = normalizeTimeInput(eventTime?.value || "") || defaultStart;
  const fallbackEnd = (() => {
    const startMin = clamp(
      Math.round(time24ToMinutes(startNormalized) / DIAL_MINUTE_STEP) * DIAL_MINUTE_STEP,
      0,
      DIAL_MAX_MINUTES,
    );
    return minutesToTime24((startMin + 60) % MINUTES_PER_DAY);
  })();
  const endNormalized = normalizeTimeInput(eventEndTime?.value || "") || fallbackEnd;

  dialStartMinutes = clamp(
    Math.round(time24ToMinutes(startNormalized) / DIAL_MINUTE_STEP) * DIAL_MINUTE_STEP,
    0,
    DIAL_MAX_MINUTES,
  );
  dialEndMinutes = clamp(
    Math.round(time24ToMinutes(endNormalized) / DIAL_MINUTE_STEP) * DIAL_MINUTE_STEP,
    0,
    DIAL_MAX_MINUTES,
  );
  if (getClockwiseMinutesBetween(dialStartMinutes, dialEndMinutes) < DIAL_MINUTE_STEP) {
    dialEndMinutes = (dialStartMinutes + 60) % MINUTES_PER_DAY;
  }
  setDialEndHandleVisible(false);
  isDialEndTimePlaced = false;
  didMoveStartInCurrentDrag = false;
  renderTimeDial();
}

function chooseClosestDialHandle(targetMinutes) {
  if (!isDialEndHandleVisible) return "start";
  const startDist = getCircularMinuteDistance(targetMinutes, dialStartMinutes);
  const endDist = getCircularMinuteDistance(targetMinutes, dialEndMinutes);
  return startDist <= endDist ? "start" : "end";
}

function updateActiveDialHandle(clientX, clientY) {
  const nextMinutes = getDialMinutesFromPoint(clientX, clientY);
  if (activeDialHandle === "start") {
    if (!isDialEndHandleVisible) {
      const previousStart = dialStartMinutes;
      dialStartMinutes = clamp(nextMinutes, 0, DIAL_MAX_MINUTES);
      if (dialStartMinutes !== previousStart) {
        didMoveStartInCurrentDrag = true;
      }
      dialEndMinutes = (dialStartMinutes + 60) % MINUTES_PER_DAY;
    } else {
      dialStartMinutes = clamp(nextMinutes, 0, DIAL_MAX_MINUTES);
      if (getClockwiseMinutesBetween(dialStartMinutes, dialEndMinutes) < DIAL_MINUTE_STEP) {
        dialStartMinutes = (dialEndMinutes - DIAL_MINUTE_STEP + MINUTES_PER_DAY) % MINUTES_PER_DAY;
      }
    }
  } else if (activeDialHandle === "end") {
    dialEndMinutes = clamp(nextMinutes, 0, DIAL_MAX_MINUTES);
    if (getClockwiseMinutesBetween(dialStartMinutes, dialEndMinutes) < DIAL_MINUTE_STEP) {
      dialEndMinutes = (dialStartMinutes + DIAL_MINUTE_STEP) % MINUTES_PER_DAY;
    }
    isDialEndTimePlaced = true;
  }
  renderTimeDial();
}

function onDialPointerMove(event) {
  if (!activeDialHandle) return;
  updateActiveDialHandle(event.clientX, event.clientY);
}

function stopDialDrag() {
  if (activeDialHandle === "start") {
    if (!isDialEndHandleVisible && didMoveStartInCurrentDrag) {
      setDialEndHandleVisible(true);
    } else if (!didMoveStartInCurrentDrag && wasEndVisibleBeforeStartDrag) {
      setDialEndHandleVisible(true);
      isDialEndTimePlaced = wasEndPlacedBeforeStartDrag;
      renderTimeDial();
    }
  }
  activeDialHandle = null;
  didMoveStartInCurrentDrag = false;
  wasEndVisibleBeforeStartDrag = false;
  wasEndPlacedBeforeStartDrag = false;
}

function buildWheelColumn(key, options, selectedValue) {
  const column = document.createElement("div");
  column.className = "wheel-column";
  column.dataset.key = key;

  options.forEach((option, index) => {
    const item = document.createElement("div");
    item.className = "wheel-item";
    item.dataset.index = String(index);
    item.textContent = option.label;
    column.appendChild(item);
  });

  const selectedIndex = Math.max(
    0,
    options.findIndex((opt) => String(opt.value) === String(selectedValue)),
  );
  column.scrollTop = selectedIndex * WHEEL_ITEM_HEIGHT;
  applyWheelSelection(column, selectedIndex, true);

  column.addEventListener("click", (event) => {
    const item = event.target.closest(".wheel-item");
    if (!item) return;
    snapColumnToIndex(column, Number(item.dataset.index), "smooth");
  });

  column.addEventListener("scroll", () => {
    clearTimeout(column._wheelSnapTimer);
    column._wheelSnapTimer = setTimeout(() => {
      const maxIndex = Math.max(options.length - 1, 0);
      const index = clamp(Math.round(column.scrollTop / WHEEL_ITEM_HEIGHT), 0, maxIndex);
      snapColumnToIndex(column, index, "auto");
    }, 70);
  });

  return column;
}

function applyWheelSelection(column, index, silent = false) {
  if (!wheelState) return;
  const key = column.dataset.key;
  const options = wheelState.columnOptions[key] || [];
  const option = options[index];
  if (!option) return;

  const items = column.querySelectorAll(".wheel-item");
  items.forEach((item, idx) => {
    item.classList.toggle("is-selected", idx === index);
  });

  const previous = String(wheelState.values[key]);
  const next = String(option.value);
  wheelState.values[key] = next;

  if (!silent && previous !== next) {
    onWheelValueChanged(key);
  }
}

function snapColumnToIndex(column, index, behavior = "smooth") {
  if (!wheelState) return;
  const key = column.dataset.key;
  const options = wheelState.columnOptions[key] || [];
  const maxIndex = Math.max(options.length - 1, 0);
  const safeIndex = clamp(index, 0, maxIndex);
  column.scrollTo({ top: safeIndex * WHEEL_ITEM_HEIGHT, behavior });
  applyWheelSelection(column, safeIndex);
}

function renderDateWheel() {
  if (!wheelState || !wheelColumns) return;

  const year = Number(wheelState.values.year);
  const month = Number(wheelState.values.month);
  const maxDay = getDaysInMonth(year, month);
  if (Number(wheelState.values.day) > maxDay) {
    wheelState.values.day = String(maxDay);
  }

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Date(2026, i, 1).toLocaleDateString(undefined, { month: "short" }),
  }));
  const dayOptions = Array.from({ length: maxDay }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1),
  }));
  const centerYear = Number(wheelState.values.year);
  const yearOptions = Array.from({ length: 11 }, (_, i) => {
    const yr = centerYear - 5 + i;
    return { value: String(yr), label: String(yr) };
  });

  wheelState.columnOptions = {
    month: monthOptions,
    day: dayOptions,
    year: yearOptions,
  };

  wheelColumns.style.setProperty("--wheel-columns", "3");
  wheelColumns.innerHTML = "";
  wheelColumns.appendChild(buildWheelColumn("month", monthOptions, wheelState.values.month));
  wheelColumns.appendChild(buildWheelColumn("day", dayOptions, wheelState.values.day));
  wheelColumns.appendChild(buildWheelColumn("year", yearOptions, wheelState.values.year));
}

function renderTimeWheel() {
  if (!wheelState || !wheelColumns) return;

  const hourOptions = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1),
  }));
  const minuteOptions = Array.from({ length: 12 }, (_, i) => {
    const val = pad2(i * 5);
    return { value: val, label: val };
  });
  const periodOptions = [
    { value: "AM", label: "AM" },
    { value: "PM", label: "PM" },
  ];

  wheelState.columnOptions = {
    hour: hourOptions,
    minute: minuteOptions,
    period: periodOptions,
  };

  wheelColumns.style.setProperty("--wheel-columns", "3");
  wheelColumns.innerHTML = "";
  wheelColumns.appendChild(buildWheelColumn("hour", hourOptions, wheelState.values.hour));
  wheelColumns.appendChild(buildWheelColumn("minute", minuteOptions, wheelState.values.minute));
  wheelColumns.appendChild(buildWheelColumn("period", periodOptions, wheelState.values.period));
}

function onWheelValueChanged(key) {
  if (!wheelState) return;
  if (wheelState.kind === "date" && (key === "month" || key === "year")) {
    renderDateWheel();
  }
}

function openWheelPicker(kind) {
  if (!wheelPicker || !wheelColumns || !wheelPickerTitle) return;
  const input = getInputForPickerKind(kind);
  if (!input) return;

  wheelState = {
    kind,
    input,
    values: {},
    columnOptions: {},
  };

  if (kind === "date") {
    const iso = normalizeDateInput(input.value) || toIsoDate(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      new Date().getDate(),
    );
    const [year, month, day] = iso.split("-");
    wheelState.values = { year, month: String(Number(month)), day: String(Number(day)) };
    wheelPickerTitle.textContent = "Select Date";
    renderDateWheel();
  } else {
    const base = new Date();
    if (kind === "end-time") base.setHours(base.getHours() + 1);
    const defaultTime = `${pad2(base.getHours())}:${pad2(base.getMinutes())}`;
    const normalized = normalizeTimeInput(input.value) || defaultTime;
    const parts = time24ToParts(normalized);
    const minuteRounded = pad2(roundMinuteToStep(parts.minute, 5));
    wheelState.values = { hour: parts.hour, minute: minuteRounded, period: parts.period };
    wheelPickerTitle.textContent = kind === "end-time" ? "Select End Time" : "Select Time";
    renderTimeWheel();
  }

  wheelPicker.hidden = false;
  wheelPicker.setAttribute("aria-hidden", "false");
  document.body.classList.add("wheel-open");
}

function closeWheelPicker() {
  if (!wheelPicker) return;
  wheelPicker.hidden = true;
  wheelPicker.setAttribute("aria-hidden", "true");
  document.body.classList.remove("wheel-open");
  wheelState = null;
}

function applyWheelPickerValue() {
  if (!wheelState || !wheelState.input) return;

  if (wheelState.kind === "date") {
    const isoDate = toIsoDate(
      Number(wheelState.values.year),
      Number(wheelState.values.month),
      Number(wheelState.values.day),
    );
    wheelState.input.value = formatDateDisplayFromIso(isoDate);
  } else {
    const time24 = partsToTime24(
      wheelState.values.hour,
      wheelState.values.minute,
      wheelState.values.period,
    );
    wheelState.input.value = formatTimeDisplay(time24);
  }

  wheelState.input.focus();
  closeWheelPicker();
}

async function fetchGoogleStatus() {
  const response = await fetch("/api/google/status");
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Unable to check Google connection status.");
  }
  return data;
}

async function loadGoogleEvents() {
  clearRenderedEvents();
  try {
    const params = new URLSearchParams({ time_zone: getBrowserTimeZone() });
    const response = await fetch(`/api/google/events?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unable to fetch Google Calendar events.");
    }

    const events = data.events || [];
    events.forEach((event) => {
      addEventToList(event.date, event.time, event.title, {
        endTime: event.end_time,
        endDate: event.end_date,
        allDay: event.all_day,
      });
    });
    syncEmptyState();
  } catch (err) {
    showAppMessage(err.message, "error");
    syncEmptyState();
  }
}

async function createGoogleCalendarEvent(payload) {
  const response = await fetch("/api/google/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Unable to create Google Calendar event.");
  }
  return data.event;
}

async function disconnectGoogleCalendar() {
  const response = await fetch("/api/google/disconnect", {
    method: "POST",
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Unable to disconnect Google Calendar.");
  }
  return data;
}

function openModal() {
  if (!modal) return;
  clearAppMessage();
  clearModalConflictMessage();

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = pad2(now.getMonth() + 1);
  const dd = pad2(now.getDate());
  if (eventDate) eventDate.value = formatDateDisplayFromIso(`${yyyy}-${mm}-${dd}`);
  syncMiniCalendarFromInput();

  const hh = pad2(now.getHours());
  const mins = pad2(now.getMinutes());
  if (eventTime) eventTime.value = formatTimeDisplay(`${hh}:${mins}`);

  const end = new Date(now.getTime() + 60 * 60 * 1000);
  const endHH = pad2(end.getHours());
  const endMM = pad2(end.getMinutes());
  if (eventEndTime) eventEndTime.value = formatTimeDisplay(`${endHH}:${endMM}`);
  setDialFromInputValues();

  if (eventTitle) {
    eventTitle.value = `Event ${defaultEventCounter}`;
    eventTitle.dataset.isDefault = "true";
  }

  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("show");
  setTimeout(() => {
    renderTimeDial();
    eventTitle?.focus();
  }, 100);
}

function closeModal() {
  if (!modal) return;
  closeWheelPicker();
  clearModalConflictMessage();
  modal.setAttribute("aria-hidden", "true");
  modal.classList.remove("show");
}

window.openModal = openModal;
window.closeModal = closeModal;

addEventBtn?.addEventListener("click", openModal);
closeModalBtn?.addEventListener("click", closeModal);

saveModalBtn?.addEventListener("click", () => {
  if (!eventForm) return;
  if (typeof eventForm.requestSubmit === "function") eventForm.requestSubmit();
  else eventForm.submit();
});

eventTitle?.addEventListener("focus", (e) => {
  if (e.target.dataset.isDefault === "true") {
    e.target.value = "";
    e.target.dataset.isDefault = "false";
  }
});

eventTitle?.addEventListener("input", (e) => {
  if (e.target.dataset.isDefault === "true") e.target.dataset.isDefault = "false";
});

eventDate?.addEventListener("blur", () => {
  syncMiniCalendarFromInput();
});

miniCalPrev?.addEventListener("click", () => {
  miniCalendarView = new Date(miniCalendarView.getFullYear(), miniCalendarView.getMonth() - 1, 1);
  renderMiniCalendar();
});

miniCalNext?.addEventListener("click", () => {
  miniCalendarView = new Date(miniCalendarView.getFullYear(), miniCalendarView.getMonth() + 1, 1);
  renderMiniCalendar();
});

timeDialStartHandle?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  activeDialHandle = "start";
  beginStartHandlePlacementCycle();
  updateActiveDialHandle(event.clientX, event.clientY);
});

timeDialEndHandle?.addEventListener("pointerdown", (event) => {
  if (!isDialEndHandleVisible) return;
  event.preventDefault();
  activeDialHandle = "end";
  updateActiveDialHandle(event.clientX, event.clientY);
});

timeDialRing?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (event.target === timeDialStartHandle || event.target === timeDialEndHandle) return;
  const minutes = getDialMinutesFromPoint(event.clientX, event.clientY);
  activeDialHandle = chooseClosestDialHandle(minutes);
  if (activeDialHandle === "start") {
    beginStartHandlePlacementCycle();
  }
  updateActiveDialHandle(event.clientX, event.clientY);
});

window.addEventListener("pointermove", onDialPointerMove);
window.addEventListener("pointerup", stopDialDrag);
window.addEventListener("pointercancel", stopDialDrag);
window.addEventListener("resize", renderTimeDial);

wheelBackdrop?.addEventListener("click", closeWheelPicker);
wheelCancelBtn?.addEventListener("click", closeWheelPicker);
wheelDoneBtn?.addEventListener("click", applyWheelPickerValue);
googleDisconnectBtn?.addEventListener("click", async () => {
  clearAppMessage();
  try {
    await disconnectGoogleCalendar();
    isGoogleConnected = false;
    updateGoogleUi(false);
    clearRenderedEvents();
    showAppMessage("Google Calendar disconnected.", "success");
  } catch (err) {
    showAppMessage(err.message, "error");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && wheelState) {
    closeWheelPicker();
  }
});

eventForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAppMessage();

  const title = (eventTitle?.value || "").trim() || `Event ${defaultEventCounter}`;
  const normalizedDate = normalizeDateInput(eventDate?.value || "");
  const normalizedStart = normalizeTimeInput(eventTime?.value || "");
  const normalizedEnd = normalizeTimeInput(eventEndTime?.value || "");

  if (!normalizedDate || !normalizedStart || !normalizedEnd) {
    showAppMessage("Use valid date and time values (MM/DD/YYYY, h:mm AM/PM, or 24h).", "error");
    return;
  }

  const startMinutes = time24ToMinutes(normalizedStart);
  const endMinutes = time24ToMinutes(normalizedEnd);
  if (getClockwiseMinutesBetween(startMinutes, endMinutes) < DIAL_MINUTE_STEP) {
    showAppMessage("End time must be at least 15 minutes after start time.", "error");
    return;
  }

  if (validateModalTimeConflict()) {
    return;
  }

  try {
    if (isGoogleConnected) {
      const createdEvent = await createGoogleCalendarEvent({
        summary: title,
        date: normalizedDate,
        start_time: normalizedStart,
        end_time: normalizedEnd,
        time_zone: getBrowserTimeZone(),
      });
      if (createdEvent) {
        addEventToList(createdEvent.date, createdEvent.time, createdEvent.title, {
          endTime: createdEvent.end_time,
          endDate: createdEvent.end_date,
          allDay: createdEvent.all_day,
        });
      }
    } else {
      addEventToList(normalizedDate, normalizedStart, title, {
        endTime: normalizedEnd,
        allDay: false,
      });
    }

    closeModal();
    defaultEventCounter += 1;
  } catch (err) {
    showAppMessage(err.message, "error");
  }
});

window.addEventListener("DOMContentLoaded", async () => {
  consumeQueryMessages();
  renderMiniCalendar();
  setDialFromInputValues();

  if (googleConnectBtn) {
    googleConnectBtn.addEventListener("click", (e) => {
      if (googleConnectBtn.hidden) e.preventDefault();
    });
  }

  try {
    const status = await fetchGoogleStatus();
    isGoogleConnected = Boolean(status.connected);
    updateGoogleUi(isGoogleConnected);

    if (isGoogleConnected) {
      await loadGoogleEvents();
    } else {
      clearRenderedEvents();
      if (!status.configured) {
        showAppMessage(
          "Google Calendar OAuth is not configured yet. Set environment variables to enable connection.",
          "error",
        );
      }
    }
  } catch (err) {
    updateGoogleUi(false);
    showAppMessage(err.message, "error");
    clearRenderedEvents();
  }
});
