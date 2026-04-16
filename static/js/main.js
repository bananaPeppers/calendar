// Button demo
document.getElementById("btn")?.addEventListener("click", () => {
  alert("Button clicked — start building your UI!");
});

// Populate date tab with today's date in a friendly format
(() => {
  const el = document.getElementById("dateTab");
  if (!el) return;
  const d = new Date();
  const opts = {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  el.textContent = d.toLocaleDateString(undefined, opts);
})();

// Demo: if there are no events, show empty state. If you add events dynamically, hide the empty state.
(() => {
  const list = document.getElementById("eventsList");
  const empty = document.getElementById("emptyState");
  if (!list || !empty) return;
  if (list.children.length === 0) {
    empty.style.display = "flex";
  } else {
    empty.style.display = "none";
  }
})();
// Add event button handler -> open modal
document.getElementById("addEventBtn")?.addEventListener("click", () => {
  openModal();
});

const modal = document.getElementById("eventModal");
const closeModalBtn = document.getElementById("closeModal");
const saveModalBtn = document.getElementById("saveEventBtn");
const eventForm = document.getElementById("eventForm");
const eventDate = document.getElementById("eventDate");
const eventTime = document.getElementById("eventTime");
const eventDesc = document.getElementById("eventDesc");
const eventsList = document.getElementById("eventsList");
const emptyState = document.getElementById("emptyState");

// counter for default event names (Event 1, Event 2, ...)
let defaultEventCounter = 1;

function openModal() {
  if (!modal) return;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  if (eventDate) eventDate.value = `${yyyy}-${mm}-${dd}`;
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  if (eventTime) eventTime.value = `${hh}:${min}`;
  if (eventDesc) {
    eventDesc.value = `Event ${defaultEventCounter}`;
    eventDesc.dataset.isDefault = "true";
  }
  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("show");
  setTimeout(() => eventDate?.focus(), 150);
}

function closeModal() {
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.classList.remove("show");
}

closeModalBtn?.addEventListener("click", closeModal);
saveModalBtn?.addEventListener("click", () => {
  // trigger form submit from header save button
  if (eventForm) {
    if (typeof eventForm.requestSubmit === "function")
      eventForm.requestSubmit();
    else eventForm.submit();
  }
});

// clear default description when focused; mark non-default on input
eventDesc?.addEventListener("focus", (e) => {
  if (e.target.dataset.isDefault === "true") {
    e.target.value = "";
    e.target.dataset.isDefault = "false";
  }
});
eventDesc?.addEventListener("input", (e) => {
  if (e.target.dataset.isDefault === "true")
    e.target.dataset.isDefault = "false";
});

// submit form
eventForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!eventsList) return;
  const date = eventDate.value;
  const time = eventTime.value;
  const desc = (eventDesc.value || "").trim();
  const li = document.createElement("li");
  li.className = "event-item";
  const dot = document.createElement("div");
  dot.className = "event-dot";
  const meta = document.createElement("div");
  meta.className = "event-meta";
  const title = document.createElement("div");
  title.className = "event-title";
  title.textContent = desc || "Untitled event";
  const timeEl = document.createElement("div");
  timeEl.className = "event-time";
  const dt = new Date(date + "T" + (time || "00:00"));
  timeEl.textContent = dt.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
  meta.appendChild(title);
  meta.appendChild(timeEl);
  li.appendChild(dot);
  li.appendChild(meta);
  eventsList.appendChild(li);
  if (emptyState) emptyState.style.display = "none";
  closeModal();
  // increment default counter so next new event gets the next default name
  defaultEventCounter += 1;
});
