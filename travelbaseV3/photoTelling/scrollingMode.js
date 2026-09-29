import {
  formatStackedDate,
  formatTimestamp,
  inaturalistPhotoUrl,
  orderedPhotoItems,
  parseLocalTimestamp,
} from "./utils.js";

const storyPane = document.getElementById("storyPane");
const elements = {
  caption: document.getElementById("storyCaption"),
  currentImage: document.getElementById("storyCurrentImage"),
  incomingImage: document.getElementById("storyIncomingImage"),
  mainButton: document.getElementById("storyMainButton"),
  next: document.getElementById("storyNext"),
  nextImage: document.getElementById("storyNextImage"),
  previous: document.getElementById("storyPrevious"),
  previousImage: document.getElementById("storyPreviousImage"),
  timelineFill: document.getElementById("storyTimelineFill"),
  timelineEnd: document.getElementById("storyTimelineEnd"),
  timelinePhotoFill: document.getElementById("storyTimelinePhotoFill"),
  timelineProgress: document.getElementById("storyTimelineProgress"),
  timelineStart: document.getElementById("storyTimelineStart"),
  timestamp: document.getElementById("storyTimestamp"),
  title: document.getElementById("storyTitle"),
};

let activeIndex = 0;
let cameraCallbacks = {};
let modeActive = false;
let photoItems = [];
let transitionTimer = 0;
let transitionVersion = 0;
let lastWheelAdvance = 0;

function setImage(image, photo, alt) {
  if (!photo) {
    image.removeAttribute("src");
    image.alt = "";
    return;
  }
  image.src = inaturalistPhotoUrl(photo.url);
  image.alt = alt;
}

async function loadMainImage(image, photo, version) {
  image.alt = "";
  image.src = inaturalistPhotoUrl(photo.url);
  await image.decode().catch(() => {});
  if (version !== transitionVersion || !image.complete || !image.naturalWidth) {
    return false;
  }
  image.alt = photo.name || "Journey photo";
  return true;
}

function updateSupportingContent() {
  const photo = photoItems[activeIndex];
  const previousPhoto = photoItems[activeIndex - 1];
  const nextPhoto = photoItems[activeIndex + 1];
  const title = photo?.name || "";
  const timestamp = photo?.timestamp || "";
  const progress = photoItems.length
    ? (activeIndex + 1) / photoItems.length
    : 1;
  const firstTimestamp = photoItems[0]?.timestamp || "";
  const lastTimestamp = photoItems.at(-1)?.timestamp || "";
  const firstTime = parseLocalTimestamp(firstTimestamp);
  const lastTime = parseLocalTimestamp(lastTimestamp);
  const currentTime = parseLocalTimestamp(timestamp);
  const timeProgress =
    Number.isFinite(firstTime) &&
    Number.isFinite(lastTime) &&
    Number.isFinite(currentTime) &&
    lastTime > firstTime
      ? Math.min(
          1,
          Math.max(0, (currentTime - firstTime) / (lastTime - firstTime)),
        )
      : progress;

  setImage(
    elements.previousImage,
    previousPhoto,
    previousPhoto?.name || "Previous photo",
  );
  setImage(elements.nextImage, nextPhoto, nextPhoto?.name || "Next photo");
  elements.previous.disabled = !previousPhoto;
  elements.next.disabled = !nextPhoto;
  elements.title.textContent = title;
  elements.title.hidden = !title;
  elements.timestamp.textContent = formatTimestamp(timestamp);
  elements.timestamp.dateTime = timestamp;
  elements.timestamp.hidden = !timestamp;
  elements.caption.hidden = !title && !timestamp;
  elements.mainButton.ariaLabel = title
    ? `Enlarge ${title}`
    : "Enlarge current photo";
  elements.timelineStart.textContent = formatStackedDate(firstTimestamp);
  elements.timelineStart.dateTime = firstTimestamp;
  elements.timelineEnd.textContent = formatStackedDate(lastTimestamp);
  elements.timelineEnd.dateTime = lastTimestamp;
  elements.timelineFill.style.height = `${timeProgress * 100}%`;
  elements.timelinePhotoFill.style.height = `${progress * 100}%`;
  elements.timelineProgress.textContent = `${activeIndex + 1}/${photoItems.length}`;
}

async function transitionToPhoto(photo, direction) {
  const version = ++transitionVersion;
  const currentImage = elements.currentImage;
  const incomingImage = elements.incomingImage;
  clearTimeout(transitionTimer);

  if (!currentImage.src || !direction) {
    currentImage.className = "story-main-image";
    incomingImage.className = "story-main-image story-main-incoming";
    incomingImage.removeAttribute("src");
    await loadMainImage(currentImage, photo, version);
    return;
  }

  currentImage.className = "story-main-image";
  incomingImage.className = "story-main-image story-main-incoming";
  incomingImage.removeAttribute("src");
  if (!(await loadMainImage(incomingImage, photo, version))) return;
  incomingImage.className = `story-main-image story-main-incoming story-from-${
    direction > 0 ? "next" : "previous"
  }`;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (version !== transitionVersion) return;
      currentImage.classList.add(
        direction > 0 ? "story-exit-previous" : "story-exit-next",
      );
      incomingImage.classList.add("is-visible");
    });
  });

  transitionTimer = window.setTimeout(() => {
    if (version !== transitionVersion) return;
    currentImage.className = "story-main-image story-main-incoming";
    currentImage.removeAttribute("src");
    currentImage.alt = "";
    incomingImage.className = "story-main-image";
    elements.currentImage = incomingImage;
    elements.incomingImage = currentImage;
  }, 520);
}

async function setActiveIndex(
  nextIndex,
  { animate = true, notify = true } = {},
) {
  if (!photoItems.length) return false;
  const clampedIndex = Math.min(photoItems.length - 1, Math.max(0, nextIndex));
  const direction = clampedIndex - activeIndex;
  if (!direction && animate) return false;

  activeIndex = clampedIndex;
  const transition = transitionToPhoto(
    photoItems[activeIndex],
    animate ? direction : 0,
  );
  updateSupportingContent();
  let cameraTransition;
  if (notify && modeActive) {
    cameraTransition = cameraCallbacks.onPhotoChange?.(photoItems[activeIndex]);
  }
  await Promise.all([transition, cameraTransition]);
  return true;
}

function nearestPhotoIndex(timestamp) {
  const target = parseLocalTimestamp(timestamp);
  if (!Number.isFinite(target)) return 0;
  return photoItems.reduce((nearest, photo, index) => {
    const time = parseLocalTimestamp(photo.timestamp);
    const nearestTime = parseLocalTimestamp(photoItems[nearest]?.timestamp);
    return Math.abs(time - target) < Math.abs(nearestTime - target)
      ? index
      : nearest;
  }, 0);
}

export function renderScrollingMode(items, timestamp) {
  photoItems = orderedPhotoItems(
    items.filter((photo) => photo?.url),
    "time",
  );
  if (!photoItems.length) return;
  activeIndex = nearestPhotoIndex(timestamp);
  setActiveIndex(activeIndex, { animate: false, notify: false });
}

export function setScrollingMode(mode, { notify = true } = {}) {
  const active = mode === "scroll";
  storyPane.classList.toggle("active", active);
  modeActive = active;
  if (active && notify && photoItems.length) {
    cameraCallbacks.onPhotoChange?.(photoItems[activeIndex]);
  } else if (!active) {
    cameraCallbacks.onDeactivate?.();
  }
}

export function setupScrollingModeInteractions(callbacks) {
  cameraCallbacks = callbacks;

  elements.previous.addEventListener("click", () =>
    setActiveIndex(activeIndex - 1),
  );
  elements.next.addEventListener("click", () =>
    setActiveIndex(activeIndex + 1),
  );
  elements.mainButton.addEventListener("click", () => {
    if (photoItems[activeIndex]) {
      cameraCallbacks.onPhotoOpen?.(photoItems[activeIndex]);
    }
  });
  storyPane.addEventListener(
    "wheel",
    (event) => {
      if (!modeActive || photoItems.length < 2) return;
      event.preventDefault();
      const now = performance.now();
      if (now - lastWheelAdvance < 480) return;
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;
      if (Math.abs(delta) < 8) return;
      lastWheelAdvance = now;
      setActiveIndex(activeIndex + Math.sign(delta));
    },
    { passive: false },
  );
  storyPane.addEventListener("keydown", (event) => {
    if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const direction =
      event.key === "ArrowUp" || event.key === "PageUp" ? -1 : 1;
    setActiveIndex(activeIndex + direction);
  });

  return {
    showTimestamp(timestamp) {
      if (!photoItems.length) return;
      setActiveIndex(nearestPhotoIndex(timestamp), {
        animate: false,
        notify: false,
      });
    },
    async startAutoplay() {
      modeActive = true;
      if (!photoItems.length) return false;
      if (activeIndex >= photoItems.length - 1) {
        await setActiveIndex(0);
      }
      return true;
    },
    autoplayNext() {
      if (!modeActive || activeIndex >= photoItems.length - 1) {
        return Promise.resolve(false);
      }
      return setActiveIndex(activeIndex + 1);
    },
    refreshCamera() {
      if (modeActive && photoItems.length) {
        cameraCallbacks.onPhotoChange?.(photoItems[activeIndex]);
      }
    },
  };
}
