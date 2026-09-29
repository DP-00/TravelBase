import {
  getHistoricalWeather,
  getPlayableAudioUrl,
  parseLocalTimestamp,
} from "./utils.js";
import { createCameraController } from "./camera.js";

const PLAIN_ELEVATION_URL =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
const WORLD_CONTOURS_URL =
  "https://basemaps.arcgis.com/arcgis/rest/services/World_Contours_v2/VectorTileServer";

const contourLayerIds = {
  minor: ["Contour_11/0", "Contour_12/0", "Contour_13/0", "Contour_14/0"],
  major: [
    "Contour_11_main/0",
    "Contour_12_main/0",
    "Contour_13_main/0",
    "Contour_14_main/0",
  ],
  labels: [
    "Contour_11_main_text",
    "Contour_12_main_text",
    "Contour_13_main_text",
    "Contour_14_main_text",
  ],
};

function updateContourStyleLayer(layer, layerId, paint, layout) {
  const styleLayer = layer.getStyleLayer(layerId);
  if (!styleLayer) return;

  layer.setStyleLayer({
    ...styleLayer,
    paint: { ...styleLayer.paint, ...paint },
    layout: { ...styleLayer.layout, ...layout },
  });
}

async function styleReliefContours(layer) {
  await layer.when();
  contourLayerIds.minor.forEach((id) =>
    updateContourStyleLayer(layer, id, {
      "line-color": "#f4caa7",
      "line-opacity": 0.72,
      "line-width": {
        base: 1.1,
        stops: [
          [10, 0.8],
          [13, 1.25],
          [16, 1.7],
        ],
      },
    }),
  );
  contourLayerIds.major.forEach((id) =>
    updateContourStyleLayer(layer, id, {
      "line-color": "#fff1d6",
      "line-opacity": 0.88,
      "line-width": {
        base: 1.2,
        stops: [
          [10, 1.4],
          [13, 2],
          [16, 2.7],
        ],
      },
    }),
  );
  contourLayerIds.labels.forEach((id) =>
    updateContourStyleLayer(
      layer,
      id,
      {
        "text-color": "#fff6e8",
        "text-halo-color": "#18212a",
        "text-halo-width": 1.2,
        "text-opacity": 0.92,
      },
      {
        "text-size": {
          base: 1.1,
          stops: [
            [14, 11],
            [17, 13],
          ],
        },
      },
    ),
  );
}

function createReliefColorRamp(MultipartColorRamp, AlgorithmicColorRamp) {
  const stops = [
    [[15, 25, 34, 255], [34, 92, 91, 255], "cie-lab"],
    [[34, 92, 91, 255], [154, 139, 88, 255], "cie-lab"],
    [[154, 139, 88, 255], [128, 105, 83, 255], "hsv"],
    [[128, 105, 83, 255], [205, 208, 204, 255], "hsv"],
  ];

  return new MultipartColorRamp({
    colorRamps: stops.map(
      ([fromColor, toColor, algorithm]) =>
        new AlgorithmicColorRamp({ fromColor, toColor, algorithm }),
    ),
  });
}

function createReliefElevationLayer(
  ImageryTileLayer,
  RasterStretchRenderer,
  colorRamp,
) {
  return new ImageryTileLayer({
    url: PLAIN_ELEVATION_URL,
    opacity: 0.9,
    renderer: new RasterStretchRenderer({
      stretchType: "min-max",
      statistics: [[-300, 6000, 1200, 1050]],
      colorRamp,
    }),
  });
}

function createReliefContourLayer(VectorTileLayer) {
  const layer = new VectorTileLayer({
    title: "Global Contours",
    url: WORLD_CONTOURS_URL,
    opacity: 0.98,
  });
  styleReliefContours(layer).catch((error) =>
    console.error("Unable to apply contour style", error),
  );
  return layer;
}

export async function createPlainElevationBasemap() {
  const [
    Basemap,
    ImageryTileLayer,
    VectorTileLayer,
    RasterStretchRenderer,
    MultipartColorRamp,
    AlgorithmicColorRamp,
  ] = await Promise.all([
    $arcgis.import("@arcgis/core/Basemap.js"),
    $arcgis.import("@arcgis/core/layers/ImageryTileLayer.js"),
    $arcgis.import("@arcgis/core/layers/VectorTileLayer.js"),
    $arcgis.import("@arcgis/core/renderers/RasterStretchRenderer.js"),
    $arcgis.import("@arcgis/core/rest/support/MultipartColorRamp.js"),
    $arcgis.import("@arcgis/core/rest/support/AlgorithmicColorRamp.js"),
  ]);

  const colorRamp = createReliefColorRamp(
    MultipartColorRamp,
    AlgorithmicColorRamp,
  );
  const elevation = createReliefElevationLayer(
    ImageryTileLayer,
    RasterStretchRenderer,
    colorRamp,
  );
  const contours = createReliefContourLayer(VectorTileLayer);

  return new Basemap({
    id: "plain-elevation",
    title: "Styled Relief",
    baseLayers: [elevation],
    referenceLayers: [contours],
  });
}

export async function setupMap(
  initialPhotoItems,
  {
    onMapPhotoHover,
    onPhotoHover,
    onPhotoSelect,
    onVisibleAreaChange,
    sounds = {},
  } = {},
) {
  const billboardTilt = 66;
  const billboardGroundClearance = 1;
  const billboardHeightThreshold = 3000;
  const photoLayerGroundOffset = 12;
  const maxVisibleBillboards = 36;
  const scene = document.getElementById("scene");
  await scene.viewOnReady();
  const view = scene.view;
  view.map.ground.navigationConstraint = { type: "stay-above" };

  const [GraphicsLayer, Graphic, Point, TimeExtent, reactiveUtils, Glow] =
    await Promise.all([
      $arcgis.import("@arcgis/core/layers/GraphicsLayer.js"),
      $arcgis.import("@arcgis/core/Graphic.js"),
      $arcgis.import("@arcgis/core/geometry/Point.js"),
      $arcgis.import("@arcgis/core/time/TimeExtent.js"),
      $arcgis.import("@arcgis/core/core/reactiveUtils.js"),
      $arcgis.import("@arcgis/core/webscene/Glow.js"),
    ]);
  const cameraController = createCameraController(view);
  const defaultHighlight = view.highlights.find(
    (highlight) => highlight.name === "default",
  );
  if (defaultHighlight) {
    defaultHighlight.color = "#aed8cc";
    defaultHighlight.haloColor = "#d7ebe5";
    defaultHighlight.fillOpacity = 0.35;
    defaultHighlight.haloOpacity = 1;
  }
  view.qualityProfile = "high";
  const defaultLighting = {
    type: "virtual",
    directShadowsEnabled: false,
    glow: new Glow({ intensity: 0.6 }),
  };
  view.environment.lighting = defaultLighting;
  view.environment.weather = { type: "sunny" };
  const routeLayers = {
    tracks: new GraphicsLayer({
      title: "Transit routes",
      elevationInfo: { mode: "on-the-ground" },
    }),
    paths: new GraphicsLayer({
      title: "Hiking paths",
      elevationInfo: { mode: "on-the-ground" },
    }),
  };
  const circularIconUrls = new Map();
  const styledIconUrls = new Map();
  const styledTextureQueue = [];
  const photoByBillboard = new WeakMap();
  const photoByGraphic = new WeakMap();
  const routeGraphicCache = new WeakMap();
  let markerStyleVersion = 0;
  let markerStyle = "point";
  let markerTreatment = "none";
  let activeStyledTextureJobs = 0;
  let photoSize = 0.9;
  let photoItems = initialPhotoItems;
  let photoGraphics = [];
  let photoGraphicsUpdateFrame = 0;
  let photoGraphicsUpdateVersion = 0;
  let photoSetVersion = 0;
  let meshModulePromise;
  let plainElevationBasemap;
  const timeSlider = document.getElementById("photoTimeSlider");
  let freeExploreMode = true;
  let timelineMode = "none";
  let timelinePacing = "equal";
  let timelineTimeExtent = null;
  let enhancedEnvironmentEnabled = true;
  let environmentVersion = 0;
  let audioVersion = 0;
  let rainAudioVersion = 0;
  let hoveredPhoto = null;
  let hoverMoveVersion = 0;
  let photoAudio = null;
  let rainAudio = null;
  let flyoverContentVisibility = null;
  let flyoverTime = null;
  let flyoverLightingOffset = null;

  function photoTime(photo) {
    const time = parseLocalTimestamp(photo.timestamp);
    return Number.isFinite(time) ? time : null;
  }

  function photoVisibleInTimeline(photo) {
    if (timelineMode === "none" || !timelineTimeExtent) {
      return true;
    }

    const time = photoTime(photo);
    if (time === null) return false;
    const start = timelineTimeExtent.start?.getTime();
    const end = timelineTimeExtent.end?.getTime();
    if (timelineMode === "cumulative-from-start") return time <= end;
    if (timelineMode === "instant") {
      if (timelinePacing === "equal") return time === end;
      const interval = timeSlider.stops?.interval;
      const intervalHours =
        interval?.unit === "esriTimeUnitsDays"
          ? interval.value * 24
          : interval?.value || 1;
      return time > end - intervalHours * 3_600_000 && time <= end;
    }
    return time >= start && time <= end;
  }

  function actualTimeStops(start, end) {
    const durationHours = Math.max(1, (end - start) / 3_600_000);
    if (durationHours <= 45 * 24) {
      return {
        interval: {
          value: Math.max(1, Math.ceil(durationHours / 600)),
          unit: "hours",
        },
      };
    }

    return {
      interval: {
        value: Math.max(1, Math.ceil(durationHours / 24 / 600)),
        unit: "days",
      },
    };
  }

  function configureTimeSlider() {
    const dates = photoItems
      .map((photo) => photoTime(photo))
      .filter((time) => time !== null)
      .sort((first, second) => first - second)
      .filter(
        (time, index, values) => index === 0 || time !== values[index - 1],
      )
      .map((time) => new Date(time));
    if (!dates.length) {
      timelineTimeExtent = null;
      timeSlider.hidden = true;
      return;
    }

    timeSlider.stops =
      timelinePacing === "actual"
        ? actualTimeStops(dates[0], dates.at(-1))
        : { dates };
    timeSlider.fullTimeExtent = new TimeExtent({
      start: dates[0],
      end: dates.at(-1),
    });
    timelineTimeExtent = new TimeExtent({
      start: dates[0],
      end: timelineMode === "time-window" ? dates.at(-1) : dates[0],
    });
    timeSlider.timeExtent = timelineTimeExtent;
    timeSlider.hidden = !freeExploreMode || timelineMode === "none";
  }

  function refreshTimeline() {
    if (hoveredPhoto && !photoVisibleInTimeline(hoveredPhoto)) {
      restoreEnvironment();
    }
    requestPhotoGraphicsUpdate();
  }

  const clamp = (value, min = 0, max = 1) =>
    Math.min(max, Math.max(min, Number(value) || 0));

  function sceneWeather(reading) {
    const code = Number(reading.weather_code);
    const cloudCover = clamp(reading.cloud_cover / 100);
    if (reading.snowfall > 0 || (code >= 71 && code <= 86)) {
      return {
        type: "snowy",
        cloudCover: Math.max(0.55, cloudCover),
        precipitation: clamp((reading.snowfall || 0) / 3, 0.2, 1),
      };
    }
    if (
      reading.precipitation > 0 ||
      (code >= 51 && code <= 67) ||
      (code >= 80 && code <= 82) ||
      code >= 95
    ) {
      return {
        type: "rainy",
        cloudCover: Math.max(0.5, cloudCover),
        precipitation: clamp(
          Math.max(reading.precipitation || 0, reading.rain || 0) / 5,
          0.18,
          1,
        ),
      };
    }
    if (code === 45 || code === 48) {
      return {
        type: "foggy",
        fogStrength: clamp(reading.relative_humidity_2m / 100, 0.55, 0.95),
      };
    }
    return cloudCover >= 0.15
      ? { type: "cloudy", cloudCover }
      : { type: "sunny" };
  }

  function rainVolume(reading) {
    const code = Number(reading.weather_code);
    if (reading.snowfall > 0 || (code >= 71 && code <= 86)) return 0;
    const intensity = Math.max(
      Number(reading.rain) || 0,
      Number(reading.precipitation) || 0,
    );
    const rainyCode =
      (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
    return intensity > 0 || rainyCode ? clamp(intensity / 5, 0.05, 0.3) : 0;
  }

  function stopRainAudio() {
    rainAudioVersion += 1;
    if (!rainAudio) return;
    rainAudio.pause();
    rainAudio.currentTime = 0;
    rainAudio = null;
  }

  async function updateRainAudio(reading) {
    const volume = rainVolume(reading);
    if (!volume || !sounds.rain) {
      stopRainAudio();
      return;
    }
    if (rainAudio) {
      rainAudio.volume = volume;
      return;
    }

    const version = ++rainAudioVersion;
    try {
      const url = await getPlayableAudioUrl(sounds.rain);
      if (version !== rainAudioVersion) return;
      rainAudio = new Audio(url);
      rainAudio.loop = true;
      rainAudio.volume = volume;
      await rainAudio.play();
    } catch (error) {
      if (version === rainAudioVersion) {
        console.warn("Unable to play rain ambience", error);
      }
    }
  }

  function stopPhotoAudio() {
    audioVersion += 1;
    if (!photoAudio) return;
    photoAudio.pause();
    photoAudio.currentTime = 0;
    photoAudio = null;
  }

  async function playPhotoAudio(path) {
    const version = ++audioVersion;
    try {
      const url = await getPlayableAudioUrl(path);
      if (version !== audioVersion) return;
      photoAudio = new Audio(url);
      photoAudio.loop = true;
      await photoAudio.play();
    } catch (error) {
      if (version === audioVersion) {
        console.warn("Unable to play photo ambience", error);
      }
    }
  }

  function restoreEnvironment() {
    environmentVersion += 1;
    hoveredPhoto = null;
    stopPhotoAudio();
    stopRainAudio();
    onPhotoHover?.(null);
    view.environment.weather = { type: "sunny" };
    view.environment.lighting = defaultLighting;
  }

  function setSunLighting(date) {
    if (view.environment.lighting.type === "sun") {
      view.environment.lighting.date = date;
      return;
    }
    view.environment.lighting = {
      type: "sun",
      date,
      directShadowsEnabled: true,
      glow: new Glow({ intensity: 0.6 }),
    };
  }

  async function activateEnvironment(photo, showInfo = true) {
    const version = ++environmentVersion;
    hoveredPhoto = photo;
    if (showInfo) onPhotoHover?.(photo);

    view.environment.lighting = defaultLighting;
    view.environment.weather = { type: "sunny" };
    stopRainAudio();

    stopPhotoAudio();
    if (photo.soundPath) {
      playPhotoAudio(photo.soundPath);
    }

    try {
      const weather = await getHistoricalWeather(
        photo.location,
        photo.timestamp,
      );
      if (!weather || version !== environmentVersion) return;
      view.environment.weather = sceneWeather(weather.reading);
      updateRainAudio(weather.reading);
      setSunLighting(weather.lightingDate);
    } catch (error) {
      if (version === environmentVersion) {
        console.warn("Unable to load historical weather", error);
      }
    }
  }

  function setFlyoverTime(timestamp) {
    flyoverTime = timestamp;
    if (!enhancedEnvironmentEnabled || flyoverLightingOffset === null) return;
    setSunLighting(new Date(timestamp - flyoverLightingOffset));
  }

  async function setFlyoverWeather(location, timestamp) {
    if (!enhancedEnvironmentEnabled) return;
    const version = ++environmentVersion;
    try {
      const weather = await getHistoricalWeather(location, timestamp);
      if (!weather || version !== environmentVersion) return;
      view.environment.weather = sceneWeather(weather.reading);
      updateRainAudio(weather.reading);
      flyoverLightingOffset = timestamp - weather.lightingDate.getTime();
      setFlyoverTime(flyoverTime ?? timestamp);
    } catch (error) {
      if (version === environmentVersion) {
        console.warn("Unable to load historical weather", error);
      }
    }
  }

  function clearFlyoverWeather() {
    environmentVersion += 1;
    flyoverTime = null;
    flyoverLightingOffset = null;
    stopRainAudio();
    view.environment.weather = { type: "sunny" };
    view.environment.lighting = defaultLighting;
  }

  function playFlyoverPhotoAudio(photo) {
    stopPhotoAudio();
    if (enhancedEnvironmentEnabled && photo?.soundPath) {
      playPhotoAudio(photo.soundPath);
    }
  }

  function setHoveredPhoto(photo, showInfo = true) {
    if (photo === hoveredPhoto) return;
    if (!photo) {
      restoreEnvironment();
      return;
    }
    restoreEnvironment();
    activateEnvironment(photo, showInfo);
  }

  function billboardPhotoAt(hitTestResults) {
    const hit = hitTestResults.find(({ graphic }) =>
      photoByBillboard.has(graphic),
    );
    return hit ? photoByBillboard.get(hit.graphic) : null;
  }

  function loadMeshModule() {
    meshModulePromise ||= $arcgis.import("@arcgis/core/geometry/Mesh.js");
    return meshModulePromise;
  }

  function photoUrl(photo, inaturalistSize) {
    if (!/^https?:\/\/static\.inaturalist\.org\//i.test(photo.url)) {
      return photo.url;
    }

    const sourceUrl = inaturalistSize
      ? photo.url.replace(
          /\/(?:square|small|medium|large|original)(?=\.[^./?#]+(?:[?#]|$))/i,
          `/${inaturalistSize}`,
        )
      : photo.url;
    return `https://images.weserv.nl/?url=${encodeURIComponent(sourceUrl)}`;
  }

  function serverCircularPhotoIconUrl(photo) {
    if (!/^https?:\/\//i.test(photo.url)) {
      return null;
    }

    const sourceUrl = /^https?:\/\/static\.inaturalist\.org\//i.test(photo.url)
      ? photo.url.replace(
          /\/(?:square|small|medium|large|original)(?=\.[^./?#]+(?:[?#]|$))/i,
          "/square",
        )
      : photo.url;
    return `https://wsrv.nl/?url=${encodeURIComponent(sourceUrl)}&w=128&h=128&fit=cover&mask=circle`;
  }

  async function circularPngIconUrl(blob) {
    const image = await createImageBitmap(blob);
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const scale = Math.max(size / image.width, size / image.height);
    const width = image.width * scale;
    const height = image.height * scale;

    context.beginPath();
    context.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    context.clip();
    context.drawImage(
      image,
      (size - width) / 2,
      (size - height) / 2,
      width,
      height,
    );
    image.close();
    return canvas.toDataURL("image/png");
  }

  function circularPhotoIconUrl(photo) {
    const serverUrl = serverCircularPhotoIconUrl(photo);
    if (serverUrl) return serverUrl;

    const imageUrl = photoUrl(photo, "small");
    if (!circularIconUrls.has(imageUrl)) {
      circularIconUrls.set(
        imageUrl,
        fetch(imageUrl, { mode: "cors" })
          .then((response) => {
            if (!response.ok) throw new Error("Image fetch failed");
            return response.blob();
          })
          .then(circularPngIconUrl)
          .catch(() => null),
      );
    }
    return circularIconUrls.get(imageUrl);
  }

  function drawCover(context, image, x, y, width, height) {
    const scale = Math.max(width / image.width, height / image.height);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    context.drawImage(
      image,
      (image.width - sourceWidth) / 2,
      (image.height - sourceHeight) / 2,
      sourceWidth,
      sourceHeight,
      x,
      y,
      width,
      height,
    );
  }

  function pointAuraUrl() {
    const canvas = document.createElement("canvas");
    const size = 96;
    const center = size / 2;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(
      center,
      center,
      0,
      center,
      center,
      center,
    );
    gradient.addColorStop(0, "rgba(215, 235, 229, 0.42)");
    gradient.addColorStop(0.35, "rgba(174, 216, 204, 0.2)");
    gradient.addColorStop(0.72, "rgba(174, 216, 204, 0.06)");
    gradient.addColorStop(1, "rgba(174, 216, 204, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return canvas.toDataURL("image/png");
  }

  const emptyIconCanvas = document.createElement("canvas");
  emptyIconCanvas.width = 1;
  emptyIconCanvas.height = 1;
  const emptyIconUrl = emptyIconCanvas.toDataURL("image/png");
  const pointGlowUrl = pointAuraUrl();

  function createStyledIconTexture(image, shape, treatment) {
    const circle = shape === "circle";
    const glow = treatment === "glow";
    const frameWidth = circle ? 140 : 230;
    const frameHeight = circle ? 140 : frameWidth / 1.5;
    const glowPadding = glow ? 11 : 0;
    const canvasSize = frameWidth + glowPadding * 2;
    const frame = {
      x: glowPadding,
      y: canvasSize - frameHeight,
      width: frameWidth,
      height: frameHeight,
      radius: circle ? frameWidth / 2 : 8,
    };
    const canvas = document.createElement("canvas");
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const context = canvas.getContext("2d");
    const traceFrame = (expand = 0) => {
      if (circle) {
        context.beginPath();
        context.arc(
          frame.x + frame.width / 2,
          frame.y + frame.height / 2,
          frame.radius + expand,
          0,
          Math.PI * 2,
        );
        return;
      }
      context.beginPath();
      context.roundRect(
        frame.x - expand,
        frame.y - expand,
        frame.width + expand * 2,
        frame.height + expand * 2,
        frame.radius + expand,
      );
    };

    if (glow) {
      const glowPixels = context.createImageData(canvasSize, canvasSize);
      const centerX = frame.x + frame.width / 2;
      const centerY = frame.y + frame.height / 2;
      const halfWidth = frame.width / 2;
      const halfHeight = frame.height / 2;
      const radius = frame.radius;
      for (let y = 0; y < canvasSize; y += 1) {
        for (let x = 0; x < canvasSize; x += 1) {
          let distance;
          if (circle) {
            distance = Math.hypot(x - centerX, y - centerY) - frame.radius;
          } else {
            const horizontal = Math.abs(x - centerX) - (halfWidth - radius);
            const vertical = Math.abs(y - centerY) - (halfHeight - radius);
            distance =
              Math.hypot(Math.max(horizontal, 0), Math.max(vertical, 0)) +
              Math.min(Math.max(horizontal, vertical), 0) -
              radius;
          }
          if (distance <= 0 || distance > 10) continue;
          const alpha = 0.42 * Math.exp(-(distance ** 2) / 40);
          const offset = (y * canvasSize + x) * 4;
          glowPixels.data[offset] = 174;
          glowPixels.data[offset + 1] = 216;
          glowPixels.data[offset + 2] = 204;
          glowPixels.data[offset + 3] = Math.round(alpha * 255);
        }
      }
      context.putImageData(glowPixels, 0, 0);
    }

    context.save();
    traceFrame();
    context.clip();
    drawCover(context, image, frame.x, frame.y, frame.width, frame.height);
    context.restore();

    traceFrame(-4);
    context.strokeStyle = "rgba(215, 235, 229, 0.9)";
    context.lineWidth = 9;
    context.stroke();
    return canvas.toDataURL("image/png");
  }

  function pumpStyledTextureQueue() {
    while (activeStyledTextureJobs < 4 && styledTextureQueue.length) {
      const job = styledTextureQueue.shift();
      if (job.version !== markerStyleVersion) {
        job.resolve(null);
        continue;
      }
      activeStyledTextureJobs += 1;
      job
        .create()
        .then(job.resolve)
        .finally(() => {
          activeStyledTextureJobs -= 1;
          pumpStyledTextureQueue();
        });
    }
  }

  function enqueueStyledTexture(create, version) {
    const promise = new Promise((resolve) => {
      styledTextureQueue.push({ create, resolve, version });
    });
    pumpStyledTextureQueue();
    return promise;
  }

  function styledPhotoIconUrl(photo, shape, treatment, version) {
    const imageUrl = photoUrl(photo, "small");
    const key = `${imageUrl}:${shape}:${treatment}`;
    if (!styledIconUrls.has(key)) {
      const promise = enqueueStyledTexture(
        () =>
          fetch(imageUrl, { mode: "cors" })
            .then((response) => {
              if (!response.ok) throw new Error("Image fetch failed");
              return response.blob();
            })
            .then(createImageBitmap)
            .then((image) => {
              const url = createStyledIconTexture(image, shape, treatment);
              image.close();
              return url;
            })
            .catch(() => null),
        version,
      ).then((url) => {
        if (!url) {
          styledIconUrls.delete(key);
          return null;
        }
        if (styledIconUrls.size > Math.max(64, photoItems.length * 2)) {
          styledIconUrls.delete(styledIconUrls.keys().next().value);
        }
        return url;
      });
      styledIconUrls.set(key, promise);
    }
    return styledIconUrls.get(key);
  }

  function styledVerticalOffset() {
    return {
      screenLength: 15,
      minWorldLength: 0,
      maxWorldLength: 10000,
    };
  }

  function styledCallout() {
    return {
      type: "line",
      color: "#d7ebe5",
      size: 3,
      border: { color: [255, 255, 255, 0], size: 0 },
    };
  }

  function styledPointSymbol(treatment, withCallout = true) {
    const emphasized = treatment !== "none";
    return {
      type: "point-3d",
      symbolLayers: [
        ...(treatment === "glow"
          ? [
              {
                type: "icon",
                resource: { href: pointGlowUrl },
                size: 32 * photoSize,
              },
            ]
          : []),
        {
          type: "icon",
          resource: { primitive: "circle" },
          size: (emphasized ? 16 : 12) * photoSize,
          material: { color: "#d7ebe5" },
          outline: { color: [255, 255, 255, 0], size: 0 },
        },
        {
          type: "icon",
          resource: { primitive: "circle" },
          size: (emphasized ? 11 : 10) * photoSize,
          material: { color: "#192a27" },
          outline: { color: [255, 255, 255, 0], size: 0 },
        },
      ],
      verticalOffset: withCallout ? styledVerticalOffset() : null,
      callout: withCallout ? styledCallout() : null,
    };
  }

  function styledPhotoSymbol(style, treatment, iconUrl = emptyIconUrl) {
    const circle = style === "circle";
    const frameSize = circle ? 140 : 230;
    const textureSize = treatment === "glow" ? frameSize + 22 : frameSize;
    const markerSize = circle ? 58 : 96;
    const ready = iconUrl !== emptyIconUrl;
    return {
      type: "point-3d",
      symbolLayers: [
        {
          type: "icon",
          anchor: "bottom",
          resource: { href: iconUrl },
          size: markerSize * (textureSize / frameSize) * photoSize,
        },
      ],
      verticalOffset: ready ? styledVerticalOffset() : null,
      callout: ready ? styledCallout() : null,
    };
  }

  function unstyledPhotoSymbol(photo, style, circleIconUrl) {
    if (style === "circle") {
      if (!circleIconUrl) return styledPointSymbol("none", false);
      return {
        type: "picture-marker",
        url: circleIconUrl,
        width: `${58 * photoSize}px`,
        height: `${58 * photoSize}px`,
      };
    }

    return {
      type: "picture-marker",
      url: photoUrl(photo, "small"),
      width: `${96 * photoSize}px`,
      height: `${64 * photoSize}px`,
    };
  }

  function photoIconSymbol(photo, style, circleIconUrl, styledIconUrl) {
    const treatment = freeExploreMode ? markerTreatment : "none";
    if (style === "point") {
      if (!freeExploreMode) return styledPointSymbol("border");
      return styledPointSymbol(treatment, treatment !== "none");
    }
    if (treatment !== "none") {
      return styledPhotoSymbol(style, treatment, styledIconUrl);
    }
    return unstyledPhotoSymbol(photo, style, circleIconUrl);
  }

  const photos = new GraphicsLayer({
    title: "Photos",
    elevationInfo: {
      mode: "relative-to-ground",
      offset: photoLayerGroundOffset,
      unit: "meters",
    },
  });
  scene.map.addMany([routeLayers.tracks, routeLayers.paths, photos]);
  const photosLayerView = view.whenLayerView(photos);
  let sidePaneHighlight = null;
  let sidePaneHighlightVersion = 0;

  async function highlightSidePanePhoto(photo) {
    const version = ++sidePaneHighlightVersion;
    sidePaneHighlight?.remove();
    sidePaneHighlight = null;
    if (!photo) return;

    const photoGraphic = photoGraphics.find((item) => item.photo === photo);
    if (!photoGraphic) return;
    const layerView = await photosLayerView;
    if (version !== sidePaneHighlightVersion) return;
    sidePaneHighlight = layerView.highlight(photoGraphic.icon);
  }

  function routeSymbol(kind) {
    if (kind === "track") {
      return {
        type: "line-3d",
        symbolLayers: [
          {
            type: "line",
            size: 9,
            material: {
              color: [18, 42, 58, 0.96],
              emissive: { source: "color", strength: 0.45 },
            },
            cap: "round",
            join: "round",
          },
          {
            type: "line",
            size: 4,
            material: {
              color: [174, 216, 204, 1],
              emissive: { source: "color", strength: 1.5 },
            },
            cap: "round",
            join: "round",
          },
        ],
      };
    }

    return {
      type: "line-3d",
      symbolLayers: [
        {
          type: "line",
          size: 7,
          material: {
            color: [67, 31, 45, 0.96],
            emissive: { source: "color", strength: 0.5 },
          },
          cap: "round",
          join: "round",
        },
        {
          type: "line",
          size: 2.5,
          material: {
            color: [239, 124, 100, 1],
            emissive: { source: "color", strength: 1.5 },
          },
          cap: "round",
          join: "round",
          pattern: { type: "style", style: "dash" },
        },
      ],
    };
  }

  function geojsonRouteGraphics(route) {
    const features =
      route.data.type === "FeatureCollection"
        ? route.data.features || []
        : route.data.type === "Feature"
          ? [route.data]
          : [{ type: "Feature", geometry: route.data, properties: {} }];

    return features.flatMap((feature, index) => {
      const geometry = feature.geometry || {};
      const paths =
        geometry.type === "LineString"
          ? [geometry.coordinates]
          : geometry.type === "MultiLineString"
            ? geometry.coordinates
            : [];
      if (!paths.length) return [];

      return new Graphic({
        geometry: {
          type: "polyline",
          paths: paths.map((path) =>
            path.map((coordinate) => [coordinate[0], coordinate[1]]),
          ),
          spatialReference: { wkid: 4326 },
        },
        attributes: {
          name: feature.properties?.name || route.name || `Route ${index + 1}`,
        },
        symbol: routeSymbol(route.kind),
        popupTemplate: { title: "{name}" },
      });
    });
  }

  function gpxTextElements(parent, localName) {
    return [...parent.getElementsByTagNameNS("*", localName)];
  }

  function directGpxText(parent, localName) {
    return (
      [...parent.children]
        .find((child) => child.localName === localName)
        ?.textContent?.trim() || ""
    );
  }

  function gpxRouteGraphics(route) {
    const document = new DOMParser().parseFromString(
      route.data,
      "application/xml",
    );
    if (document.querySelector("parsererror")) return [];

    const paths = [];
    gpxTextElements(document, "trkseg").forEach((segment, index) => {
      const track = segment.parentElement;
      paths.push({
        name:
          directGpxText(track, "name") || route.name || `Track ${index + 1}`,
        points: gpxTextElements(segment, "trkpt"),
      });
    });
    gpxTextElements(document, "rte").forEach((gpxRoute, index) => {
      paths.push({
        name:
          directGpxText(gpxRoute, "name") || route.name || `Route ${index + 1}`,
        points: gpxTextElements(gpxRoute, "rtept"),
      });
    });

    return paths.flatMap((path) => {
      const coordinates = path.points
        .map((point) => [
          Number(point.getAttribute("lon")),
          Number(point.getAttribute("lat")),
        ])
        .filter(
          ([longitude, latitude]) =>
            Number.isFinite(longitude) && Number.isFinite(latitude),
        );
      if (coordinates.length < 2) return [];
      return new Graphic({
        geometry: {
          type: "polyline",
          paths: [coordinates],
          spatialReference: { wkid: 4326 },
        },
        attributes: { name: path.name },
        symbol: routeSymbol(route.kind),
        popupTemplate: { title: "{name}" },
      });
    });
  }

  function routeGraphics(route) {
    if (!routeGraphicCache.has(route)) {
      routeGraphicCache.set(
        route,
        route.type === "gpx"
          ? gpxRouteGraphics(route)
          : geojsonRouteGraphics(route),
      );
    }
    return routeGraphicCache.get(route);
  }

  function setRoutes({ tracks = [], paths = [] }) {
    const pathGraphics = paths.flatMap(routeGraphics);

    routeLayers.tracks.removeAll();
    routeLayers.paths.removeAll();
    routeLayers.tracks.addMany(tracks.flatMap(routeGraphics));
    routeLayers.paths.addMany(pathGraphics);
  }

  async function goToPhotoExtent(version = photoSetVersion) {
    if (!photoGraphics.length) return;

    await view.goTo(
      photoGraphics.map(({ point }) => point),
      { animate: false },
    );
    if (version !== photoSetVersion) return;
    document.querySelector("arcgis-home").viewpoint = view.viewpoint.clone();
  }

  function distanceToCamera(point) {
    const radians = Math.PI / 180;
    const latitude1 = view.camera.position.latitude * radians;
    const latitude2 = point.latitude * radians;
    const latitudeDelta =
      (point.latitude - view.camera.position.latitude) * radians;
    const longitudeDelta =
      (point.longitude - view.camera.position.longitude) * radians;
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(latitude1) *
        Math.cos(latitude2) *
        Math.sin(longitudeDelta / 2) ** 2;
    return (
      2 * 6371000 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
  }

  function createBillboardGraphic(photo, point, Mesh) {
    const billboardHeight = 54 * photoSize;
    const billboardCenter = point.clone();
    billboardCenter.z =
      (billboardHeight / 2) * Math.sin((billboardTilt * Math.PI) / 180) +
      billboardGroundClearance -
      photoLayerGroundOffset;
    const billboard = Mesh.createPlane(billboardCenter, {
      size: { width: 80 * photoSize, height: billboardHeight },
      material: { colorTexture: photoUrl(photo, "large") },
    });
    billboard.rotate(billboardTilt, 0, photo.orientation || 0);

    const graphic = new Graphic({
      geometry: billboard,
      symbol: {
        type: "mesh-3d",
        symbolLayers: [
          {
            type: "fill",
            material: {
              color: "#ffffff",
              emissive: { source: "color", strength: 0.1 },
            },
          },
        ],
      },
    });
    photoByGraphic.set(graphic, photo);
    photoByBillboard.set(graphic, photo);
    return graphic;
  }

  function rebuildPhotoGraphics() {
    const version = ++photoSetVersion;
    photos.removeAll();
    photoGraphics = photoItems.map((photo) => {
      const point = new Point({
        longitude: photo.location.longitude,
        latitude: photo.location.latitude,
        z: 0,
        spatialReference: { wkid: 4326 },
      });

      const icon = new Graphic({
        geometry: point,
        symbol: photoIconSymbol(photo, markerStyle),
      });
      photoByGraphic.set(icon, photo);

      return {
        photo,
        point,
        icon,
        billboard: null,
      };
    });

    photos.addMany(photoGraphics.map(({ icon }) => icon));
    highlightSidePanePhoto(null);
    updatePhotoGraphics();
    return version;
  }

  function cameraHeightAboveGround() {
    try {
      if (!view.groundView?.elevationSampler) {
        return Infinity;
      }

      const groundPoint = view.groundView.elevationSampler.queryElevation(
        new Point({
          longitude: view.camera.position.longitude,
          latitude: view.camera.position.latitude,
          spatialReference: { wkid: 4326 },
        }),
      );

      const height = view.camera.position.z - groundPoint.z;
      return Number.isFinite(height) && height > 0 ? height : Infinity;
    } catch {
      return Infinity;
    }
  }

  async function updatePhotoGraphics() {
    photoGraphicsUpdateFrame = 0;
    const updateVersion = ++photoGraphicsUpdateVersion;
    const showBillboard =
      freeExploreMode && cameraHeightAboveGround() < billboardHeightThreshold;
    const visibleBillboards = showBillboard
      ? new Set(
          [...photoGraphics]
            .filter(({ photo }) => photoVisibleInTimeline(photo))
            .sort(
              (first, second) =>
                distanceToCamera(first.point) - distanceToCamera(second.point),
            )
            .slice(0, maxVisibleBillboards),
        )
      : new Set();
    const Mesh = visibleBillboards.size ? await loadMeshModule() : null;
    if (updateVersion !== photoGraphicsUpdateVersion) return;

    photoGraphics.forEach((photoGraphic) => {
      const { icon } = photoGraphic;
      const timelineVisible = photoVisibleInTimeline(photoGraphic.photo);
      const showThisBillboard =
        timelineVisible && visibleBillboards.has(photoGraphic);
      icon.visible = timelineVisible && !showThisBillboard;
      if (showThisBillboard && !photoGraphic.billboard) {
        photoGraphic.billboard = createBillboardGraphic(
          photoGraphic.photo,
          photoGraphic.point,
          Mesh,
        );
        photos.add(photoGraphic.billboard);
      } else if (!showThisBillboard && photoGraphic.billboard) {
        if (hoveredPhoto === photoGraphic.photo) restoreEnvironment();
        photos.remove(photoGraphic.billboard);
        photoGraphic.billboard = null;
      }
    });
  }

  function requestPhotoGraphicsUpdate() {
    if (!freeExploreMode || photoGraphicsUpdateFrame) return;
    photoGraphicsUpdateFrame = requestAnimationFrame(updatePhotoGraphics);
  }

  function getVisiblePhotoItems() {
    const visibleArea = view.visibleArea;
    if (!visibleArea) return [];

    const sidePane = document.getElementById("sidePane");
    const excludePaddedArea = sidePane.classList.contains("active");

    return photoGraphics
      .filter(({ point }) => {
        if (!visibleArea.contains(point)) return false;
        if (!excludePaddedArea) return true;
        const screenPoint = view.toScreen(point);
        if (!screenPoint) return false;
        return (
          screenPoint.x >= view.padding.left &&
          screenPoint.x <= view.width - view.padding.right &&
          screenPoint.y >= view.padding.top &&
          screenPoint.y <= view.height - view.padding.bottom
        );
      })
      .map(({ photo }) => photo);
  }

  function setSidePanePadding(enabled, layout, paneId = "sidePane") {
    if (!enabled) {
      view.padding = { top: 0, right: 0, bottom: 0, left: 0 };
      cameraController.resetToOverview();
      requestAnimationFrame(() => onVisibleAreaChange?.());
      return;
    }

    const paneRect = document.getElementById(paneId).getBoundingClientRect();
    const viewRect = view.container.getBoundingClientRect();
    view.padding =
      layout === "grid"
        ? {
            top: 0,
            right: 0,
            bottom: 0,
            left: Math.round(paneRect.right - viewRect.left + 12),
          }
        : {
            top: 0,
            right: 0,
            bottom: Math.round(viewRect.bottom - paneRect.top + 12),
            left: 0,
          };
    requestAnimationFrame(() => onVisibleAreaChange?.());
  }

  function removeBillboards() {
    photoGraphics.forEach((photoGraphic) => {
      if (!photoGraphic.billboard) return;
      if (hoveredPhoto === photoGraphic.photo) restoreEnvironment();
      photos.remove(photoGraphic.billboard);
      photoGraphic.billboard = null;
    });
  }

  function updatePhotoIconSymbols() {
    const version = ++markerStyleVersion;
    photoGraphics.forEach(({ photo, icon }) => {
      icon.symbol = photoIconSymbol(
        photo,
        freeExploreMode ? markerStyle : "point",
        freeExploreMode && markerStyle === "circle"
          ? serverCircularPhotoIconUrl(photo)
          : null,
      );
    });
    if (!freeExploreMode) return;
    if (markerTreatment !== "none" && markerStyle !== "point") {
      updateStyledPhotoIcons(version).catch((error) =>
        console.error("Unable to style photo icons", error),
      );
    } else if (markerTreatment === "none" && markerStyle === "circle") {
      updateCirclePhotoIcons(version).catch((error) =>
        console.error("Unable to create circular photo icons", error),
      );
    }
  }

  async function updateCirclePhotoIcons(version) {
    const pendingPhotoGraphics = photoGraphics.filter(
      ({ photo }) => !serverCircularPhotoIconUrl(photo),
    );

    await Promise.all(
      pendingPhotoGraphics.map(async ({ photo, icon }) => {
        const circleIconUrl = await circularPhotoIconUrl(photo);
        if (
          version !== markerStyleVersion ||
          markerStyle !== "circle" ||
          markerTreatment !== "none"
        )
          return;

        icon.symbol = photoIconSymbol(photo, markerStyle, circleIconUrl);
      }),
    );
  }

  async function updateStyledPhotoIcons(version) {
    const style = markerStyle;
    const treatment = markerTreatment;
    const shape = style === "circle" ? "circle" : "photo";
    const prioritizedPhotoGraphics = photoGraphics
      .map((photoGraphic) => {
        const screenPoint = view.toScreen(photoGraphic.point);
        const onScreen =
          screenPoint &&
          screenPoint.x >= 0 &&
          screenPoint.x <= view.width &&
          screenPoint.y >= 0 &&
          screenPoint.y <= view.height;
        return {
          photoGraphic,
          priority: onScreen ? 0 : 1,
        };
      })
      .sort((first, second) => first.priority - second.priority)
      .map(({ photoGraphic }) => photoGraphic);
    let nextIndex = 0;
    async function processNextIcon() {
      while (nextIndex < prioritizedPhotoGraphics.length) {
        if (
          version !== markerStyleVersion ||
          style !== markerStyle ||
          treatment !== markerTreatment ||
          !freeExploreMode
        )
          return;
        const { photo, icon } = prioritizedPhotoGraphics[nextIndex];
        nextIndex += 1;
        const styledIconUrl = await styledPhotoIconUrl(
          photo,
          shape,
          treatment,
          version,
        );
        if (
          !styledIconUrl ||
          version !== markerStyleVersion ||
          style !== markerStyle ||
          treatment !== markerTreatment ||
          !freeExploreMode
        )
          return;
        icon.symbol = photoIconSymbol(photo, style, null, styledIconUrl);
      }
    }
    await Promise.all(
      Array.from(
        { length: Math.min(16, prioritizedPhotoGraphics.length) },
        processNextIcon,
      ),
    );
  }

  const initialPhotoSetVersion = rebuildPhotoGraphics();
  configureTimeSlider();
  await goToPhotoExtent(initialPhotoSetVersion).catch((error) =>
    console.error("Unable to zoom to photo extent", error),
  );
  cameraController.setOverviewViewpoint();
  reactiveUtils.watch(() => view.camera, requestPhotoGraphicsUpdate);
  reactiveUtils.watch(
    () => [view.stationary, view.width, view.height],
    ([stationary]) => {
      if (stationary) onVisibleAreaChange?.();
    },
  );
  timeSlider.addEventListener("arcgisPropertyChange", (event) => {
    if (event.detail?.name !== "timeExtent" || !timeSlider.timeExtent) return;
    timelineTimeExtent = timeSlider.timeExtent;
    refreshTimeline();
  });
  view.on("pointer-move", async (event) => {
    const moveVersion = ++hoverMoveVersion;
    const response = await view.hitTest(event, { include: photos });
    if (moveVersion !== hoverMoveVersion) return;
    const photoHit = response.results.find(({ graphic }) =>
      photoByGraphic.has(graphic),
    );
    const billboardPhoto = billboardPhotoAt(response.results);
    const photo = photoHit
      ? photoByGraphic.get(photoHit.graphic)
      : billboardPhoto;
    view.container.style.cursor = photo ? "pointer" : "default";
    onMapPhotoHover?.(photo);
    if (enhancedEnvironmentEnabled && freeExploreMode) {
      setHoveredPhoto(billboardPhoto);
    }
  });
  view.container.addEventListener("pointerleave", () => {
    hoverMoveVersion += 1;
    view.container.style.cursor = "default";
    onMapPhotoHover?.(null);
    if (freeExploreMode && hoveredPhoto) restoreEnvironment();
  });
  if (onPhotoSelect) {
    view.on("click", async (event) => {
      const response = await view.hitTest(event, { include: photos });
      const hit = response.results.find(({ graphic }) =>
        photoByGraphic.has(graphic),
      );
      if (hit) onPhotoSelect(photoByGraphic.get(hit.graphic));
    });
  }

  async function setPhotoMarkerStyle(style, { force = false } = {}) {
    if (!force && style === markerStyle) return;

    markerStyle = style;
    updatePhotoIconSymbols();
  }

  function setPhotoMarkerTreatment(treatment) {
    if (treatment === markerTreatment) return;
    markerTreatment = treatment;
    updatePhotoIconSymbols();
  }

  return {
    getVisiblePhotoItems,
    setSidePanePadding,
    indicateSidePanePhoto(photo) {
      highlightSidePanePhoto(photo);
    },
    frameSidePanePhoto(photo) {
      highlightSidePanePhoto(photo);
      if (hoveredPhoto) restoreEnvironment();
      return cameraController.framePhoto(photo);
    },
    async focusSidePanePhoto(photo) {
      highlightSidePanePhoto(photo);
      const completed = await cameraController.focusPhoto(photo);
      if (completed && enhancedEnvironmentEnabled) {
        setHoveredPhoto(photo, false);
      }
      return completed;
    },
    async orbitSidePanePhoto(photo) {
      highlightSidePanePhoto(photo);
      const completed = await cameraController.orbitPhoto(photo);
      if (completed && enhancedEnvironmentEnabled) {
        setHoveredPhoto(photo, false);
      }
      return completed;
    },
    leaveSidePanePhoto() {
      highlightSidePanePhoto(null);
      cameraController.endFrame();
      restoreEnvironment();
    },
    closeSidePanePhoto() {
      highlightSidePanePhoto(null);
      restoreEnvironment();
      return cameraController.restoreFocusViewpoint();
    },
    stopSidePaneCamera() {
      highlightSidePanePhoto(null);
      cameraController.stop();
      cameraController.endFrame();
      restoreEnvironment();
    },
    setPhotoMarkerStyle,
    setPhotoMarkerTreatment,
    setFlyoverWeather,
    setFlyoverTime,
    clearFlyoverWeather,
    playFlyoverPhotoAudio,
    stopFlyoverPhotoAudio: stopPhotoAudio,
    setRoutes,
    setFreeExploreMode(enabled) {
      freeExploreMode = enabled;
      timeSlider.hidden = !enabled || timelineMode === "none";
      if (!enabled) {
        cancelAnimationFrame(photoGraphicsUpdateFrame);
        photoGraphicsUpdateFrame = 0;
        photoGraphicsUpdateVersion += 1;
        hoverMoveVersion += 1;
        view.container.style.cursor = "default";
        restoreEnvironment();
        removeBillboards();
      }
      updatePhotoIconSymbols();
      refreshTimeline();
    },
    setFlyoverContentVisible(visible) {
      if (!visible && !flyoverContentVisibility) {
        flyoverContentVisibility = {
          photos: photos.visible,
          tracks: routeLayers.tracks.visible,
          paths: routeLayers.paths.visible,
        };
        photos.visible = false;
        Object.values(routeLayers).forEach((layer) => {
          layer.visible = false;
        });
        return;
      }
      if (visible && flyoverContentVisibility) {
        photos.visible = flyoverContentVisibility.photos;
        routeLayers.tracks.visible = flyoverContentVisibility.tracks;
        routeLayers.paths.visible = flyoverContentVisibility.paths;
        flyoverContentVisibility = null;
      }
    },
    setTimelineMode(mode) {
      timelineMode = mode;
      timeSlider.mode = mode === "none" ? "cumulative-from-start" : mode;
      configureTimeSlider();
      refreshTimeline();
    },
    setTimelinePacing(pacing) {
      timelinePacing = pacing;
      configureTimeSlider();
      refreshTimeline();
    },
    setTimelineSpeed(speed) {
      timeSlider.playRate = 1000 / Math.max(0.25, Number(speed) || 1);
    },
    setEnhancedEnvironmentEnabled(enabled) {
      enhancedEnvironmentEnabled = enabled;
      if (!enabled) {
        hoverMoveVersion += 1;
        view.container.style.cursor = "default";
        restoreEnvironment();
      }
    },
    setRouteVisibility(kind, visible) {
      if (flyoverContentVisibility) {
        flyoverContentVisibility[kind] = visible;
        return;
      }
      routeLayers[kind].visible = visible;
    },
    async setPhotoItems(items) {
      restoreEnvironment();
      styledIconUrls.clear();
      photoItems = items;
      const version = rebuildPhotoGraphics();
      configureTimeSlider();
      updatePhotoIconSymbols();
      await goToPhotoExtent(version).catch((error) =>
        console.error("Unable to zoom to photo extent", error),
      );
      cameraController.setOverviewViewpoint();
    },
    async setPhotoSize(size) {
      const nextSize = Math.min(1.4, Math.max(0.5, Number(size) || 0.9));
      if (nextSize === photoSize) return;

      photoSize = nextSize;
      removeBillboards();
      updatePhotoIconSymbols();
      requestPhotoGraphicsUpdate();
    },
    async setBasemap(id) {
      if (id === "plain-elevation") {
        plainElevationBasemap ||= await createPlainElevationBasemap();
        scene.map.basemap = plainElevationBasemap;
        return;
      }
      scene.map.basemap = id;
    },
  };
}
