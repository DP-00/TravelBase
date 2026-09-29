import { formatTimestamp } from "./utils.js";

export function segmentedValue(control, fallback) {
  return (
    control.value ||
    control.selectedItem?.value ||
    control.querySelector("calcite-segmented-control-item[checked]")?.value ||
    fallback
  );
}

const elements = {
  autoplay: document.getElementById("autoplay"),
  datasetRow: document.getElementById("datasetRow"),
  flyoverSettings: document.getElementById("flyoverSettings"),
  freeSettings: document.getElementById("freeSettings"),
  mapAreaControl: document.getElementById("mapAreaControl"),
  mapAreaRow: document.getElementById("mapAreaRow"),
  mode: document.getElementById("mode"),
  modeSettingsBlock: document.getElementById("modeSettingsBlock"),
  settingsExpand: document.getElementById("settingsExpand"),
  settingsFooter: document.getElementById("settingsFooter"),
  sideAutoplayAction: document.getElementById("sideAutoplayAction"),
  scrollMapModeSettings: document.getElementById("scrollMapModeSettings"),
  scrollSettings: document.getElementById("scrollSettings"),
  sideMapModeSettings: document.getElementById("sideMapModeSettings"),
  sideSettings: document.getElementById("sideSettings"),
  timelineSettingsBlock: document.getElementById("timelineSettingsBlock"),
};

export function setModeSettings(value) {
  const isFree = value === "free";
  elements.settingsExpand.autoCollapse = false;

  elements.freeSettings.hidden = !isFree;
  elements.sideSettings.hidden = value !== "side";
  elements.scrollSettings.hidden = value !== "scroll";
  elements.flyoverSettings.hidden = value !== "flyover";
  elements.timelineSettingsBlock.hidden = !isFree;

  if (value === "side") {
    elements.sideMapModeSettings.prepend(elements.mapAreaRow);
  } else if (value === "scroll") {
    elements.scrollMapModeSettings.append(elements.mapAreaRow);
  }

  elements.modeSettingsBlock.disabled = false;
  elements.modeSettingsBlock.expanded = true;
  elements.autoplay.hidden = isFree || value === "flyover";
  elements.datasetRow.hidden = !isFree;
  elements.settingsFooter.hidden = value === "flyover";
  syncMaximizedMap();
}

export function syncMaximizedMap() {
  const mode = segmentedValue(elements.mode, "free");
  const mapArea = segmentedValue(elements.mapAreaControl, "normal");
  const modeUsesMapArea = mode === "side" || mode === "scroll";

  document.body.classList.toggle(
    "map-area-narrow",
    modeUsesMapArea && mapArea === "narrow",
  );
  document.body.classList.toggle(
    "map-area-wide",
    modeUsesMapArea && mapArea === "wide",
  );
}

function setAutoplayState(playing) {
  elements.autoplay.icon = playing ? "pause" : "play";
  elements.autoplay.text = playing ? "Stop" : "Autoplay";
}

export function setupAutoplay({
  advanceSide,
  startScroll,
  advanceScroll,
  scrollSpeed,
  onScrollStop,
  onSideHoverStop,
}) {
  let sideTimer = 0;
  let sideIndex = 0;
  let scrollTimer = 0;
  let scrollVersion = 0;
  let scrollPlaying = false;

  function sideAction() {
    return segmentedValue(elements.sideAutoplayAction, "hover");
  }

  function stop() {
    const wasPlaying = Boolean(sideTimer);
    const action = sideAction();
    clearInterval(sideTimer);
    clearTimeout(scrollTimer);
    sideTimer = 0;
    scrollTimer = 0;
    const wasScrollPlaying = scrollPlaying;
    scrollPlaying = false;
    scrollVersion += 1;
    sideIndex = 0;
    elements.settingsExpand.autoCollapse = false;
    setAutoplayState(false);
    if (wasPlaying && action === "hover") onSideHoverStop?.();
    if (wasScrollPlaying) onScrollStop?.();
  }

  function advance() {
    sideIndex = advanceSide(sideIndex, sideAction());
    if (sideIndex >= 0) return true;
    stop();
    return false;
  }

  function toggleSide() {
    if (sideTimer) {
      stop();
      return;
    }

    elements.settingsExpand.autoCollapse = false;
    elements.settingsExpand.expanded = true;
    setAutoplayState(true);
    if (advance()) sideTimer = window.setInterval(advance, 2_000);
  }

  function scrollDelay() {
    return 2_000 / Math.max(0.5, Number(scrollSpeed?.()) || 1);
  }

  async function advanceScrollAutoplay(version) {
    let advanced;
    try {
      advanced = await advanceScroll?.();
    } catch (error) {
      console.error("Unable to advance Scroll autoplay", error);
      if (version === scrollVersion) stop();
      return;
    }
    if (version !== scrollVersion) return;
    if (!advanced) {
      stop();
      return;
    }
    scrollTimer = window.setTimeout(
      () => advanceScrollAutoplay(version),
      scrollDelay(),
    );
  }

  async function toggleScroll() {
    if (scrollPlaying) {
      stop();
      return;
    }

    const version = ++scrollVersion;
    scrollPlaying = true;
    elements.settingsExpand.autoCollapse = false;
    elements.settingsExpand.expanded = true;
    setAutoplayState(true);
    const ready = await startScroll?.();
    if (version !== scrollVersion) return;
    if (!ready) {
      stop();
      return;
    }
    advanceScrollAutoplay(version);
  }

  elements.autoplay.addEventListener("click", () => {
    const mode = segmentedValue(elements.mode, "free");
    if (mode === "side") {
      toggleSide();
    } else if (mode === "scroll") {
      toggleScroll();
    } else {
      setAutoplayState(elements.autoplay.icon === "play");
    }
  });

  return {
    isPlaying: () => Boolean(sideTimer) || scrollPlaying,
    stop,
  };
}

export function setupEnvironmentInfo() {
  const info = document.getElementById("environmentInfo");
  const title = document.getElementById("environmentTitle");
  const timestamp = document.getElementById("environmentTimestamp");

  return (photo) => {
    const hasTitle = Boolean(photo?.name);
    const hasTimestamp = Boolean(photo?.timestamp);
    title.hidden = !hasTitle;
    timestamp.hidden = !hasTimestamp;
    title.textContent = photo?.name || "";
    timestamp.textContent = formatTimestamp(photo?.timestamp);
    timestamp.dateTime = photo?.timestamp || "";
    info.hidden = !hasTitle && !hasTimestamp;
  };
}

function viewerPhotoUrl(url) {
  return /^https?:\/\/static\.inaturalist\.org\//i.test(url)
    ? url.replace(
        /\/(?:square|small|medium|large|original)(?=\.[^./?#]+(?:[?#]|$))/i,
        "/large",
      )
    : url;
}

export function setupPhotoViewer() {
  const viewer = document.getElementById("photoViewer");
  const figure = document.getElementById("photoViewerFigure");
  const image = document.getElementById("photoViewerImage");
  const settingsExpand = document.getElementById("settingsExpand");
  const title = document.getElementById("photoViewerTitle");
  const timestamp = document.getElementById("photoViewerTimestamp");
  let photoVersion = 0;
  let previousFocus;

  function hidePhoto() {
    photoVersion += 1;
    viewer.hidden = true;
    image.removeAttribute("src");
    document.body.classList.remove("photo-viewer-open");
    previousFocus?.focus();
  }

  viewer.addEventListener("click", (event) => {
    if (!event.target.closest(".photo-viewer-figure")) hidePhoto();
  });
  viewer.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hidePhoto();
  });

  return (photo) => {
    const version = ++photoVersion;
    const photoTitle = photo.name || "";
    const largeUrl = viewerPhotoUrl(photo.url);
    const preloadLargeImage = largeUrl !== photo.url;
    previousFocus = document.activeElement;
    figure.hidden = preloadLargeImage;
    if (preloadLargeImage) {
      image.removeAttribute("src");
    } else {
      image.src = photo.url;
    }
    image.alt = photoTitle;
    title.textContent = photoTitle;
    timestamp.textContent = formatTimestamp(photo.timestamp);
    timestamp.dateTime = photo.timestamp || "";
    settingsExpand.expanded = false;
    document.body.classList.add("photo-viewer-open");
    viewer.hidden = false;
    viewer.focus();

    if (!preloadLargeImage) return;

    const largeImage = new Image();
    largeImage.addEventListener("load", async () => {
      await largeImage.decode().catch(() => {});
      if (version !== photoVersion) return;
      image.src = largeUrl;
      figure.hidden = false;
    });
    largeImage.addEventListener("error", () => {
      if (version !== photoVersion) return;
      image.src = photo.url;
      figure.hidden = false;
    });
    largeImage.src = largeUrl;
  };
}
