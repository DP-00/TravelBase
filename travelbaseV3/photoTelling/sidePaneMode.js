import {
  calendarDayDifference,
  formatShortDate,
  formatTimestamp,
  inaturalistPhotoUrl,
  orderedPhotoItems,
  parseLocalTimestamp,
  sameCalendarDay,
} from "./utils.js";

const elements = {
  gridView: document.getElementById("gridView"),
  listView: document.getElementById("listView"),
  sidePane: document.getElementById("sidePane"),
  timelineView: document.getElementById("timelineView"),
};

const photoByElement = new WeakMap();
let interactionCallbacks = {};
let detailItems = [];
let detailIndex = -1;
let framedElement = null;
let hoverEnterTimer = 0;
let hoverLeaveTimer = 0;
let settingsExpandedBeforeDetail = false;
let suppressHoverUntil = 0;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function photoOverlay(photo) {
  const title = escapeHtml(photo.name || "Untitled photo");
  const timestamp = escapeHtml(formatShortDate(photo.timestamp));
  const dateTime = escapeHtml(photo.timestamp);
  return `
    <span class="side-photo-overlay">
      <strong>${title}</strong>
      ${timestamp ? `<time datetime="${dateTime}">${timestamp}</time>` : ""}
    </span>
  `;
}

const renderers = {
  list: (photoItems) =>
    photoItems
      .map(
        (photo, index) => `
          <div class="photo-row list-photo side-photo-item">
            <img class="photo" src="${inaturalistPhotoUrl(photo.url)}" alt="Photo ${index + 1}" loading="lazy" decoding="async" />
            ${photoOverlay(photo)}
          </div>
        `,
      )
      .join(""),
  grid: (photoItems) =>
    `<div class="grid-items">${photoItems
      .map(
        (photo, index) =>
          `<div class="grid-photo side-photo-item">
            <img class="photo" src="${inaturalistPhotoUrl(photo.url)}" alt="Grid photo ${index + 1}" loading="lazy" decoding="async" />
            ${photoOverlay(photo)}
          </div>`,
      )
      .join("")}</div>`,
  timeline: (photoItems) =>
    timelineItems(photoItems)
      .map(
        ({ photo, gap, sameDay }) => `
          <div class="timeline-gap${sameDay ? " same-day" : " new-day"}" style="--timeline-gap: ${gap}%">
            ${sameDay ? "" : `<time datetime="${photo.timestamp}">${timelineLabel(photo.timestamp)}</time>`}
          </div>
          <div class="photo-row timeline-photo side-photo-item${sameDay ? " same-day" : ""}">
            <img class="photo" src="${inaturalistPhotoUrl(photo.url)}" alt="Timeline photo" loading="lazy" decoding="async" />
            ${photoOverlay(photo)}
          </div>
        `,
      )
      .join(""),
};

function timelineLabel(timestamp) {
  const date = new Date(parseLocalTimestamp(timestamp));
  if (!Number.isFinite(date.getTime())) return "UNKNOWN DATE";
  const monthAndDay = date
    .toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
    .toLocaleUpperCase();
  return `<span>${monthAndDay}</span><span>${date.getUTCFullYear()}</span>`;
}

function timelineItems(photoItems) {
  const minimumGapPercent = 6;
  const maximumGapPercent = 66.666;
  const maximumGapDays = 365;
  const times = photoItems.map((photo) => parseLocalTimestamp(photo.timestamp));
  const dayGaps = times
    .slice(1)
    .map((time, index) => calendarDayDifference(times[index], time));
  const differentDayGaps = dayGaps.filter(
    (_, index) => !sameCalendarDay(times[index], times[index + 1]),
  );
  const minimumDayGap = differentDayGaps.length
    ? Math.min(...differentDayGaps)
    : 1;

  return photoItems.map((photo, index) => {
    const sameDay = index
      ? sameCalendarDay(times[index - 1], times[index])
      : false;
    const dayGap = index
      ? calendarDayDifference(times[index - 1], times[index])
      : 1;
    const gapRange = Math.max(1, maximumGapDays - minimumDayGap);
    const gapProgress =
      dayGap >= maximumGapDays
        ? 1
        : Math.max(0, (dayGap - minimumDayGap) / gapRange);
    const gap =
      minimumGapPercent + gapProgress * (maximumGapPercent - minimumGapPercent);
    return {
      photo,
      gap: sameDay ? "0.75" : gap.toFixed(2),
      sameDay,
    };
  });
}

const viewElements = {
  list: elements.listView,
  grid: elements.gridView,
  timeline: elements.timelineView,
};

export function renderSidePaneMode(
  photoItems,
  layout = "grid",
  { order = "config", visiblePhotoItems = null } = {},
) {
  const displayItems = orderedPhotoItems(
    photoItems,
    layout === "timeline" ? "time" : order,
    visiblePhotoItems,
  );
  Object.entries(viewElements).forEach(([name, element]) => {
    element.innerHTML = name === layout ? renderers[name](displayItems) : "";
    if (name !== layout) return;
    element
      .querySelectorAll(".side-photo-item")
      .forEach((photoElement, index) =>
        photoByElement.set(photoElement, displayItems[index]),
      );
  });
}

function detailElements() {
  return {
    detail: document.getElementById("sidePaneDetail"),
    image: document.getElementById("sidePaneDetailImage"),
    title: document.getElementById("sidePaneDetailTitle"),
    timestamp: document.getElementById("sidePaneDetailTimestamp"),
    previous: document.getElementById("sidePaneDetailPrevious"),
    next: document.getElementById("sidePaneDetailNext"),
  };
}

function updateDetailPhoto() {
  const photo = detailItems[detailIndex];
  if (!photo) return;
  const { image, title, timestamp, previous, next } = detailElements();
  image.src = inaturalistPhotoUrl(photo.url);
  image.alt = photo.name || "Selected photo";
  title.textContent = photo.name || "Untitled photo";
  timestamp.textContent = formatTimestamp(photo.timestamp);
  timestamp.dateTime = photo.timestamp || "";
  previous.disabled = detailIndex <= 0;
  next.disabled = detailIndex >= detailItems.length - 1;
}

function closeDetail({ notify = true } = {}) {
  const { detail, image } = detailElements();
  const detailOpen = detail && !detail.hidden;
  const interactionActive = detailOpen || Boolean(framedElement);
  if (detailOpen) {
    suppressHoverUntil = performance.now() + 1_200;
    detail.hidden = true;
    image.removeAttribute("src");
    document.body.classList.remove("side-pane-detail-open");
    detailItems = [];
    detailIndex = -1;
    document.getElementById("settingsExpand").expanded =
      settingsExpandedBeforeDetail;
  }
  framedElement?.classList.remove("is-framed");
  framedElement = null;
  if (notify && interactionActive) interactionCallbacks.onPhotoClose?.();
}

function openDetail(photo, items, { collapseSettings = true } = {}) {
  const { detail } = detailElements();
  const settingsExpand = document.getElementById("settingsExpand");
  clearTimeout(hoverEnterTimer);
  clearTimeout(hoverLeaveTimer);
  detailItems = items;
  detailIndex = Math.max(0, items.indexOf(photo));
  document.body.classList.add("side-pane-detail-open");
  settingsExpandedBeforeDetail = settingsExpand.expanded;
  if (collapseSettings) settingsExpand.expanded = false;
  detail.hidden = false;
  updateDetailPhoto();
  detail.focus();
}

function activePhotoEntries() {
  const activeView = Object.values(viewElements).find((element) =>
    element.classList.contains("active"),
  );
  return [...(activeView?.querySelectorAll(".side-photo-item") || [])].map(
    (element) => ({ element, photo: photoByElement.get(element) }),
  );
}

function navigateDetail(offset) {
  const nextIndex = detailIndex + offset;
  if (nextIndex < 0 || nextIndex >= detailItems.length) return;
  detailIndex = nextIndex;
  updateDetailPhoto();
  interactionCallbacks.onPhotoSelect?.(detailItems[detailIndex]);
}

export function setupSidePaneInteractions(callbacks) {
  interactionCallbacks = callbacks;
  const { detail, previous, next } = detailElements();

  elements.sidePane.addEventListener("pointerover", (event) => {
    if (performance.now() < suppressHoverUntil) return;
    const photoElement = event.target.closest(".side-photo-item");
    if (!photoElement || photoElement.contains(event.relatedTarget)) return;
    clearTimeout(hoverEnterTimer);
    clearTimeout(hoverLeaveTimer);
    hoverEnterTimer = setTimeout(() => {
      framedElement?.classList.remove("is-framed");
      framedElement = photoElement;
      framedElement.classList.add("is-framed");
      interactionCallbacks.onPhotoHover?.(photoByElement.get(photoElement));
    }, 300);
  });
  elements.sidePane.addEventListener("pointerout", (event) => {
    const photoElement = event.target.closest(".side-photo-item");
    if (!photoElement || photoElement.contains(event.relatedTarget)) return;
    clearTimeout(hoverEnterTimer);
    photoElement.classList.remove("is-framed");
    if (framedElement === photoElement) framedElement = null;
    if (event.relatedTarget?.closest?.(".side-photo-item")) return;
    if (!detailElements().detail.hidden) return;
    clearTimeout(hoverLeaveTimer);
    hoverLeaveTimer = setTimeout(
      () => interactionCallbacks.onPhotoLeave?.(),
      120,
    );
  });
  elements.sidePane.addEventListener("click", (event) => {
    const photoElement = event.target.closest(".side-photo-item");
    const photo = photoByElement.get(photoElement);
    if (!photo) return;
    const layout =
      Object.entries(viewElements).find(([, element]) =>
        element.classList.contains("active"),
      )?.[0] || "grid";
    const items = [...viewElements[layout].querySelectorAll(".side-photo-item")]
      .map((element) => photoByElement.get(element))
      .filter(Boolean);
    openDetail(photo, items);
    interactionCallbacks.onPhotoSelect?.(photo);
  });

  document
    .getElementById("sidePaneDetailClose")
    .addEventListener("click", () => closeDetail());
  previous.addEventListener("click", () => navigateDetail(-1));
  next.addEventListener("click", () => navigateDetail(1));
  detail.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDetail();
    if (event.key === "ArrowLeft") navigateDetail(-1);
    if (event.key === "ArrowRight") navigateDetail(1);
  });

  return {
    close: closeDetail,
    autoplayPhoto(index, action) {
      const entries = activePhotoEntries();
      if (!entries.length) return -1;
      const nextIndex = index % entries.length;
      const { element, photo } = entries[nextIndex];
      if (!photo) return -1;

      if (action === "click") {
        const items = entries.map((entry) => entry.photo).filter(Boolean);
        if (detail.hidden) {
          openDetail(photo, items, { collapseSettings: false });
        } else {
          detailItems = items;
          detailIndex = nextIndex;
          updateDetailPhoto();
        }
        interactionCallbacks.onPhotoSelect?.(photo);
      } else {
        framedElement?.classList.remove("is-framed");
        framedElement = element;
        framedElement.classList.add("is-framed");
        framedElement.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
        interactionCallbacks.onPhotoHover?.(photo);
      }
      return (nextIndex + 1) % entries.length;
    },
    showPhoto(photo) {
      if (!detail.hidden) return;
      const photoElement = activePhotoEntries().find(
        (entry) => entry.photo === photo,
      )?.element;
      framedElement?.classList.remove("is-framed");
      framedElement = photoElement || null;
      if (!framedElement) return;
      framedElement.classList.add("is-framed");
      framedElement.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    },
  };
}

export function sidePaneInteractionActive() {
  return Boolean(framedElement) || !detailElements().detail.hidden;
}

export function setSidePaneMode(mode, paneType) {
  elements.sidePane.classList.toggle("active", mode === "side");
  if (mode !== "side") closeDetail({ notify: false });
  setPaneLayout(paneType, mode);
}

export function setPaneLayout(value, mode) {
  elements.listView.classList.toggle("active", value === "list");
  elements.gridView.classList.toggle("active", value === "grid");
  elements.timelineView.classList.toggle("active", value === "timeline");
  elements.sidePane.classList.toggle(
    "strip-layout",
    mode === "side" && (value === "list" || value === "timeline"),
  );
}

function enableWheelScroll(element) {
  element.addEventListener(
    "wheel",
    (event) => {
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;
      if (!delta) return;
      element.scrollLeft += delta;
      event.preventDefault();
    },
    { passive: false },
  );
}

enableWheelScroll(elements.listView);
enableWheelScroll(elements.timelineView);
