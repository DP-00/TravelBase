import { animateCamera, photoHeading } from "./camera.js";
import {
  dayBounds,
  dayKey,
  formatDate,
  formatTime,
  parseLocalTimestamp,
} from "./utils.js";

const PHOTO_DISTANCE_LIMIT = 1200;
const PHOTO_PAUSE_MS = 3000;
const PHOTO_FLY_MS = 1400;
const PHOTO_CHAIN_LIMIT_MS = 15 * 60 * 1000;
const CAMERA_GROUND_CLEARANCE = 25;
const CAMERA_HEADING_RESPONSE = 0.045;
const DETAIL_TOLERANCES = { medium: 160, low: 1800 };
const HEADING_LOOKAHEAD = {
  path: { medium: 750, low: 2400 },
  track: { medium: 1100, low: 6200 },
};
const ROUTE_RENDER_TOLERANCE = 8;
const ROUTE_PRESETS = {
  path: { detail: "medium", height: 200, speed: "500" },
  track: { detail: "low", height: 2000, speed: "100" },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (start, end, progress) => start + (end - start) * progress;

function distanceBetween(first, second) {
  const latitude = ((first.latitude + second.latitude) * Math.PI) / 360;
  const north = (second.latitude - first.latitude) * 111320;
  const east =
    (second.longitude - first.longitude) * 111320 * Math.cos(latitude);
  return Math.hypot(east, north);
}

function headingBetween(first, second) {
  const latitude = ((first.latitude + second.latitude) * Math.PI) / 360;
  const east = (second.longitude - first.longitude) * Math.cos(latitude);
  const north = second.latitude - first.latitude;
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

function routeFromPoints(points, kind, name) {
  const validPoints = points.filter(
    (point) =>
      Number.isFinite(point.longitude) &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.time),
  );
  if (validPoints.length < 2) return null;
  validPoints[0].distance = 0;
  for (let index = 1; index < validPoints.length; index += 1) {
    validPoints[index].distance =
      validPoints[index - 1].distance +
      distanceBetween(validPoints[index - 1], validPoints[index]);
  }
  return {
    kind,
    name,
    points: validPoints,
    start: validPoints[0].time,
    end: validPoints.at(-1).time,
    distance: kind === "path" ? validPoints.at(-1).distance : null,
  };
}

function parseGpxRoutes(source) {
  const documentNode = new DOMParser().parseFromString(
    source.data,
    "application/xml",
  );
  if (documentNode.querySelector("parsererror")) return [];
  const routes = [];
  const elements = (parent, name) => [
    ...parent.getElementsByTagNameNS("*", name),
  ];
  const pointValue = (point) => ({
    longitude: Number(point.getAttribute("lon")),
    latitude: Number(point.getAttribute("lat")),
    elevation: Number(elements(point, "ele")[0]?.textContent) || 0,
    time: parseLocalTimestamp(elements(point, "time")[0]?.textContent),
    distance: 0,
  });
  elements(documentNode, "trkseg").forEach((segment, index) => {
    const track = segment.parentElement;
    const name =
      [...track.children]
        .find((child) => child.localName === "name")
        ?.textContent?.trim() || `${source.name} ${index + 1}`;
    const route = routeFromPoints(
      elements(segment, "trkpt").map(pointValue),
      source.kind,
      name,
    );
    if (route) routes.push(route);
  });
  elements(documentNode, "rte").forEach((routeElement, index) => {
    const name =
      [...routeElement.children]
        .find((child) => child.localName === "name")
        ?.textContent?.trim() || `${source.name} ${index + 1}`;
    const route = routeFromPoints(
      elements(routeElement, "rtept").map(pointValue),
      source.kind,
      name,
    );
    if (route) routes.push(route);
  });
  return routes;
}

function parseGeoJsonRoutes(source) {
  const features =
    source.data?.type === "FeatureCollection"
      ? source.data.features || []
      : source.data?.type === "Feature"
        ? [source.data]
        : [{ type: "Feature", geometry: source.data, properties: {} }];
  return features.flatMap((feature, featureIndex) => {
    const geometry = feature.geometry || {};
    const paths =
      geometry.type === "LineString"
        ? [geometry.coordinates]
        : geometry.type === "MultiLineString"
          ? geometry.coordinates
          : [];
    const times = feature.properties?.coordTimes || feature.properties?.times;
    return paths
      .map((path, pathIndex) =>
        routeFromPoints(
          path.map((coordinate, pointIndex) => ({
            longitude: Number(coordinate[0]),
            latitude: Number(coordinate[1]),
            elevation: Number(coordinate[2]) || 0,
            time: parseLocalTimestamp(
              Array.isArray(times?.[pathIndex])
                ? times[pathIndex][pointIndex]
                : (times?.[pointIndex] ?? coordinate[3]),
            ),
            distance: 0,
          })),
          source.kind,
          feature.properties?.name ||
            `${source.name} ${featureIndex + 1}.${pathIndex + 1}`,
        ),
      )
      .filter(Boolean);
  });
}

function pointToSegmentDistance(point, start, end) {
  const latitude = ((start.latitude + end.latitude) * Math.PI) / 360;
  const longitudeScale = 111320 * Math.cos(latitude);
  const pointX = (point.longitude - start.longitude) * longitudeScale;
  const pointY = (point.latitude - start.latitude) * 111320;
  const endX = (end.longitude - start.longitude) * longitudeScale;
  const endY = (end.latitude - start.latitude) * 111320;
  const lengthSquared = endX * endX + endY * endY;
  const progress = lengthSquared
    ? clamp((pointX * endX + pointY * endY) / lengthSquared, 0, 1)
    : 0;
  return Math.hypot(pointX - endX * progress, pointY - endY * progress);
}

function simplifyRoute(route, tolerance) {
  const points = route.points;
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]);
  const segments = [[0, points.length - 1]];
  while (segments.length) {
    const [startIndex, endIndex] = segments.pop();
    let maximumDistance = 0;
    let maximumIndex = -1;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = pointToSegmentDistance(
        points[index],
        points[startIndex],
        points[endIndex],
      );
      if (distance > maximumDistance) {
        maximumDistance = distance;
        maximumIndex = index;
      }
    }
    if (maximumDistance <= tolerance) continue;
    keep.add(maximumIndex);
    segments.push([startIndex, maximumIndex], [maximumIndex, endIndex]);
  }
  return [...keep]
    .sort((first, second) => first - second)
    .map((index) => points[index]);
}

function locationOn(points, time) {
  if (time <= points[0].time) return { point: points[0], index: 0 };
  if (time >= points.at(-1).time) {
    return { point: points.at(-1), index: Math.max(0, points.length - 2) };
  }
  let low = 0;
  let high = points.length - 1;
  while (low < high - 1) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].time <= time) low = middle;
    else high = middle;
  }
  const first = points[low];
  const second = points[high];
  const progress = (time - first.time) / Math.max(1, second.time - first.time);
  return {
    index: low,
    point: {
      longitude: lerp(first.longitude, second.longitude, progress),
      latitude: lerp(first.latitude, second.latitude, progress),
      elevation: lerp(first.elevation, second.elevation, progress),
      distance: lerp(first.distance, second.distance, progress),
      time,
    },
  };
}

function pointAtDistance(points, distance) {
  const target = clamp(distance, 0, points.at(-1).distance);
  let low = 0;
  let high = points.length - 1;
  while (low < high - 1) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].distance <= target) low = middle;
    else high = middle;
  }
  const first = points[low];
  const second = points[high];
  const progress =
    (target - first.distance) / Math.max(1, second.distance - first.distance);
  return {
    longitude: lerp(first.longitude, second.longitude, progress),
    latitude: lerp(first.latitude, second.latitude, progress),
  };
}

function compassPoint(heading) {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
    Math.round(heading / 45) % 8
  ];
}

export async function setupFollowMode({ scene, map, controls }) {
  await scene.viewOnReady();
  const view = scene.view;
  const [GraphicsLayer, Graphic, Point, Camera, Mesh, webMercatorUtils] =
    await Promise.all([
      $arcgis.import("@arcgis/core/layers/GraphicsLayer.js"),
      $arcgis.import("@arcgis/core/Graphic.js"),
      $arcgis.import("@arcgis/core/geometry/Point.js"),
      $arcgis.import("@arcgis/core/Camera.js"),
      $arcgis.import("@arcgis/core/geometry/Mesh.js"),
      $arcgis.import("@arcgis/core/geometry/support/webMercatorUtils.js"),
    ]);

  const elements = {
    root: document.getElementById("flyover"),
    timelineWrap: document.getElementById("flyoverTimelineWrap"),
    timeline: document.getElementById("flyoverTimeline"),
    play: document.getElementById("flyoverPlay"),
    activityStrip: document.getElementById("flyoverActivityStrip"),
    empty: document.getElementById("flyoverEmpty"),
    elevation: document.getElementById("flyoverElevation"),
    time: document.getElementById("flyoverTime"),
    date: document.getElementById("flyoverDate"),
    heading: document.getElementById("flyoverHeading"),
    headingArrow: document.getElementById("flyoverHeadingArrow"),
    distance: document.getElementById("flyoverDistance"),
    profile: document.getElementById("flyoverElevationProfile"),
    photoTitle: document.getElementById("flyoverPhotoTitle"),
  };

  function configureTimelineAppearance() {
    const playButton =
      elements.play.shadowRoot?.querySelector("calcite-button");
    if (
      !elements.timeline.shadowRoot ||
      !elements.play.shadowRoot ||
      !playButton?.shadowRoot
    ) {
      requestAnimationFrame(configureTimelineAppearance);
      return;
    }
    const sliderStyle = document.createElement("style");
    sliderStyle.textContent = ".tick__label { font-weight: 700 !important; }";
    elements.timeline.shadowRoot.append(sliderStyle);

    const playStyle = document.createElement("style");
    playStyle.textContent = `.button {
      --calcite-button-background-color: transparent !important;
      --calcite-button-border-color: #aed8cc !important;
      --calcite-button-corner-radius: 50% !important;
    }`;
    elements.play.shadowRoot.append(playStyle);

    const playButtonStyle = document.createElement("style");
    playButtonStyle.textContent = `button {
      border-width: 3px !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.9) !important;
    }`;
    playButton.shadowRoot.append(playButtonStyle);
  }

  let dataset = { photos: [], tracks: [], paths: [] };
  let active = false;
  let prepared = false;
  let routes = [];
  let photos = [];
  let route = null;
  let routeIndex = 0;
  let currentTime = 0;
  let previousTime = 0;
  let playbackActive = false;
  let animationFrame = 0;
  let photoFrame = 0;
  let lastFrameTime = 0;
  let lastPhotoFrameTime = 0;
  let activePhoto = null;
  let activePhotoReady = false;
  let activePhotoRemaining = 0;
  let photoReturning = false;
  let pendingPhotos = [];
  let routeAfterPhoto = null;
  let routeLayer = null;
  let photoLayer = null;
  let travelerLayer = null;
  let elapsedGraphic = null;
  let travelerGraphic = null;
  let renderedRoutePoint = -1;
  let scrubbingTimeline = false;
  let selectedDay = "";
  let displayedDay = "";
  let orbitDrag = null;
  let orbitHeadingOffset = 0;
  let orbitTiltOffset = 0;
  let cameraPoint = null;
  let cameraHeading = null;
  let photoFocusCamera = null;
  let prepareVersion = 0;
  let weatherKey = "";
  let environmentEnabled = true;
  let requestedStartTime = null;

  function routeSymbol(kind) {
    const track = kind === "track";
    return {
      type: "line-3d",
      symbolLayers: track
        ? [
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
          ]
        : [
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

  function travelerSymbol(heading = 0, color = "#aed8cc", scale = 1) {
    return {
      type: "point-3d",
      symbolLayers: [
        {
          type: "object",
          resource: { primitive: "diamond" },
          width: 36 * scale,
          height: 56 * scale,
          depth: 36 * scale,
          heading,
          material: { color },
        },
      ],
    };
  }

  function lockedPhotoSymbol() {
    return {
      type: "point-3d",
      symbolLayers: [
        {
          type: "icon",
          resource: { primitive: "circle" },
          size: 16,
          material: { color: "#192a27" },
          outline: { color: "#d7ebe5", size: 2 },
        },
      ],
      verticalOffset: {
        screenLength: 34,
        minWorldLength: 8,
        maxWorldLength: 260,
      },
      callout: { type: "line", color: "#aed8cc", size: 1.5 },
    };
  }

  function revealedPhotoSymbol(photo) {
    return {
      type: "point-3d",
      symbolLayers: [
        {
          type: "icon",
          anchor: "bottom",
          resource: photo.circleUrl
            ? { href: photo.circleUrl }
            : { primitive: "circle" },
          size: 58,
          material: photo.circleUrl ? undefined : { color: "#69d2c5" },
        },
      ],
      verticalOffset: {
        screenLength: 58,
        minWorldLength: 12,
        maxWorldLength: 520,
      },
      callout: { type: "line", color: "#d7ebe5", size: 2 },
    };
  }

  function makeCircleTexture(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 140;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.beginPath();
        context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        context.clip();
        context.drawImage(
          image,
          (size - width) / 2,
          (size - height) / 2,
          width,
          height,
        );
        context.beginPath();
        context.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
        context.strokeStyle = "rgba(215, 235, 229, 0.9)";
        context.lineWidth = 9;
        context.stroke();
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = reject;
      image.src = url;
    });
  }

  function createLayers() {
    routeLayer = new GraphicsLayer({
      title: "Flyover route",
      elevationInfo: { mode: "on-the-ground" },
      listMode: "hide",
    });
    photoLayer = new GraphicsLayer({
      title: "Flyover photos",
      elevationInfo: { mode: "relative-to-ground" },
      listMode: "hide",
    });
    travelerLayer = new GraphicsLayer({
      title: "Flyover traveler",
      elevationInfo: { mode: "absolute-height" },
      listMode: "hide",
    });
    elapsedGraphic = null;
    travelerGraphic = new Graphic({ symbol: travelerSymbol() });
    scene.map.addMany([routeLayer, photoLayer, travelerLayer]);
  }

  function removeLayers() {
    [routeLayer, photoLayer, travelerLayer].forEach((layer) => {
      if (!layer) return;
      layer.removeAll();
      scene.map.remove(layer);
    });
    routeLayer = null;
    photoLayer = null;
    travelerLayer = null;
    elapsedGraphic = null;
    travelerGraphic = null;
  }

  function prepareRoutes() {
    const sources = [...(dataset.paths || []), ...(dataset.tracks || [])];
    routes = sources
      .flatMap((source) =>
        source.type === "gpx"
          ? parseGpxRoutes(source)
          : parseGeoJsonRoutes(source),
      )
      .sort((first, second) => first.start - second.start);
    routes.forEach((candidate) => {
      candidate.renderPoints = simplifyRoute(candidate, ROUTE_RENDER_TOLERANCE);
      candidate.cameraRoutes = {
        high: candidate.points,
        medium: simplifyRoute(candidate, DETAIL_TOLERANCES.medium),
        low: simplifyRoute(candidate, DETAIL_TOLERANCES.low),
      };
      candidate.fullGeometry = {
        type: "polyline",
        paths: [
          candidate.renderPoints.map((point) => [
            point.longitude,
            point.latitude,
          ]),
        ],
        spatialReference: { wkid: 4326 },
      };
      candidate.graphic = new Graphic({
        geometry: candidate.fullGeometry,
        symbol: routeSymbol(candidate.kind),
      });
    });
  }

  function nearestRouteDistance(photo) {
    let nearest = Infinity;
    routes.forEach((candidate) => {
      const routePoint =
        photo.time <= candidate.start
          ? candidate.points[0]
          : photo.time >= candidate.end
            ? candidate.points.at(-1)
            : locationOn(candidate.points, photo.time).point;
      const distance = distanceBetween(photo, routePoint);
      if (distance < nearest) {
        nearest = distance;
        photo.elevation = routePoint.elevation;
      }
    });
    return nearest;
  }

  function preparePhotos() {
    if (!routes.length) {
      photos = [];
      return;
    }
    const minimumTime = routes[0].start - 2 * 60 * 60 * 1000;
    const maximumTime = routes.at(-1).end + 2 * 60 * 60 * 1000;
    photos = (dataset.photos || [])
      .map((photo) => ({
        source: photo,
        id: photo.id || photo.name,
        name: photo.name || photo.id || "Photo",
        longitude: Number(photo.location?.longitude),
        latitude: Number(photo.location?.latitude),
        elevation: 0,
        time: parseLocalTimestamp(photo.timestamp),
        orientation: Number(photo.orientation) || 0,
        url: photo.url,
        shown: false,
        displayState: "",
      }))
      .filter(
        (photo) =>
          Number.isFinite(photo.longitude) &&
          Number.isFinite(photo.latitude) &&
          Number.isFinite(photo.time) &&
          photo.time >= minimumTime &&
          photo.time <= maximumTime &&
          nearestRouteDistance(photo) <= PHOTO_DISTANCE_LIMIT,
      )
      .sort((first, second) => first.time - second.time);
  }

  function createPhotoGraphics() {
    photos.forEach((photo) => {
      photo.icon = new Graphic({
        geometry: new Point({
          longitude: photo.longitude,
          latitude: photo.latitude,
          z: 2,
          spatialReference: { wkid: 4326 },
        }),
        symbol: lockedPhotoSymbol(),
      });
      photo.lockedSymbol = photo.icon.symbol;
      photoLayer.add(photo.icon);
      makeCircleTexture(photo.url)
        .then((url) => {
          if (!photo.icon || !active) return;
          photo.circleUrl = url;
          photo.revealedSymbol = revealedPhotoSymbol(photo);
          photo.displayState = "";
          updatePhotoGraphic(photo);
        })
        .catch(() => {});
    });
  }

  function resetPreparedData() {
    routes = [];
    photos = [];
    route = null;
    routeIndex = 0;
    pendingPhotos = [];
    routeAfterPhoto = null;
    prepared = false;
    elements.activityStrip.replaceChildren();
    controls.flyoverDay.replaceChildren();
  }

  async function prepare() {
    const version = ++prepareVersion;
    resetPreparedData();
    createLayers();
    prepareRoutes();
    preparePhotos();
    if (version !== prepareVersion || !active) return;
    prepared = true;
    elements.empty.hidden = routes.length > 0;
    elements.timelineWrap.hidden = routes.length === 0;
    if (!routes.length) return;
    createPhotoGraphics();
    travelerLayer.add(travelerGraphic);
    const days = [
      ...new Set(routes.map((candidate) => dayKey(candidate.start))),
    ];
    days.forEach((key) => {
      const option = document.createElement("calcite-option");
      option.value = key;
      option.textContent = formatDate(key, { weekday: "short" });
      controls.flyoverDay.append(option);
    });
    const initialRouteIndex = Number.isFinite(requestedStartTime)
      ? routes.reduce((nearest, candidate, index) => {
          const distance = Math.max(
            candidate.start - requestedStartTime,
            requestedStartTime - candidate.end,
            0,
          );
          const nearestRoute = routes[nearest];
          const nearestDistance = Math.max(
            nearestRoute.start - requestedStartTime,
            requestedStartTime - nearestRoute.end,
            0,
          );
          return distance < nearestDistance ? index : nearest;
        }, 0)
      : 0;
    activateRoute(
      initialRouteIndex,
      Number.isFinite(requestedStartTime)
        ? requestedStartTime
        : routes[initialRouteIndex].start,
    );
    requestedStartTime = null;
    previousTime = Math.min(currentTime, photos[0]?.time ?? currentTime) - 1;
    await configureDay(dayKey(currentTime), currentTime);
    if (version !== prepareVersion || !active) return;
    updateScene(false, true);
  }

  function locationAt(time) {
    return locationOn(route.points, time);
  }

  function cameraPointAt(time) {
    return locationOn(route.cameraRoutes[controls.flyoverDetail.value], time)
      .point;
  }

  function cameraLocation(location, exactHeading) {
    if (controls.flyoverDetail.value === "high") {
      return { point: location.point, heading: exactHeading };
    }
    const detail = controls.flyoverDetail.value;
    const lookahead = HEADING_LOOKAHEAD[route.kind][detail];
    const behind = pointAtDistance(
      route.points,
      location.point.distance - lookahead * 0.35,
    );
    const ahead = pointAtDistance(
      route.points,
      location.point.distance + lookahead,
    );
    const targetHeading = headingBetween(behind, ahead);
    if (cameraHeading === null) {
      return { point: cameraPointAt(currentTime), heading: targetHeading };
    }
    const difference = ((targetHeading - cameraHeading + 540) % 360) - 180;
    const smoothedHeading =
      (cameraHeading + difference * CAMERA_HEADING_RESPONSE + 360) % 360;
    return {
      point: cameraPointAt(currentTime),
      heading: smoothedHeading,
    };
  }

  function followCamera(point, heading) {
    const altitude = Number(controls.flyoverHeight.value) || 200;
    const heightProgress = clamp((altitude - 2) / 2998, 0, 1);
    const distanceFactor = lerp(5, 1.35, Math.pow(heightProgress, 0.65));
    const baseTilt =
      (Math.atan2(altitude * distanceFactor, altitude) * 180) / Math.PI;
    const behind = controls.flyoverCamera.value === "back";
    const lookHeading = heading + (behind ? orbitHeadingOffset : 180);
    const tilt = clamp(baseTilt + (behind ? orbitTiltOffset : 0), 24, 86);
    const orbitRadius = altitude / Math.cos((baseTilt * Math.PI) / 180);
    const distance = Math.max(
      10,
      orbitRadius * Math.sin((tilt * Math.PI) / 180),
    );
    const cameraHeight = orbitRadius * Math.cos((tilt * Math.PI) / 180);
    const origin = webMercatorUtils.geographicToWebMercator(
      new Point({
        longitude: point.longitude,
        latitude: point.latitude,
        z: point.elevation + 5,
        spatialReference: { wkid: 4326 },
      }),
    );
    const radians = (lookHeading * Math.PI) / 180;
    const latitudeScale = Math.max(
      Math.cos((point.latitude * Math.PI) / 180),
      0.2,
    );
    const projectedDistance = distance / latitudeScale;
    const position = new Point({
      x: origin.x - projectedDistance * Math.sin(radians),
      y: origin.y - projectedDistance * Math.cos(radians),
      z: origin.z + cameraHeight,
      spatialReference: origin.spatialReference,
    });
    try {
      const groundPoint = view.groundView?.elevationSampler?.queryElevation(
        new Point({
          x: position.x,
          y: position.y,
          spatialReference: position.spatialReference,
        }),
      );
      if (Number.isFinite(groundPoint?.z)) {
        position.z = Math.max(
          position.z,
          groundPoint.z + CAMERA_GROUND_CLEARANCE,
        );
      }
    } catch {}
    return new Camera({
      position,
      heading: (lookHeading + 360) % 360,
      tilt,
      fov: 105,
    });
  }

  function routeCoordinates(location) {
    const points = route.renderPoints;
    let index = 0;
    while (index < points.length - 1 && points[index + 1].time <= currentTime) {
      index += 1;
    }
    const coordinates = points
      .slice(0, index + 1)
      .map((point) => [point.longitude, point.latitude]);
    coordinates.push([location.point.longitude, location.point.latitude]);
    if (coordinates.length === 1) coordinates.push(coordinates[0]);
    return { coordinates, index };
  }

  function updatePhotoGraphic(photo) {
    const revealed = photo.time <= currentTime;
    photo.icon.visible = !activePhoto;
    const state = revealed ? "revealed" : "locked";
    if (state === photo.displayState) return;
    photo.displayState = state;
    photo.icon.symbol = revealed
      ? photo.revealedSymbol || photo.lockedSymbol
      : photo.lockedSymbol;
  }

  function drawProfile(location) {
    if (elements.profile.hidden) return;
    const width = Math.max(1, elements.profile.clientWidth);
    const height = Math.max(1, elements.profile.clientHeight);
    const ratio = window.devicePixelRatio || 1;
    if (
      elements.profile.width !== width * ratio ||
      elements.profile.height !== height * ratio
    ) {
      elements.profile.width = width * ratio;
      elements.profile.height = height * ratio;
    }
    const context = elements.profile.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const elevations = route.points.map((point) => point.elevation);
    const minimum = Math.min(...elevations);
    const maximum = Math.max(...elevations);
    const range = Math.max(1, maximum - minimum);
    const yFor = (elevation) =>
      height - 6 - ((elevation - minimum) / range) * (height - 14);
    const step = Math.max(1, Math.ceil(route.points.length / width));
    context.beginPath();
    route.points.forEach((point, index) => {
      if (index % step && index !== route.points.length - 1) return;
      const x = (point.distance / route.distance) * width;
      const y = yFor(point.elevation);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = "#aed8cc";
    context.lineWidth = 2;
    context.stroke();
    context.lineTo(width, height);
    context.lineTo(0, height);
    context.closePath();
    context.fillStyle = "rgba(25, 42, 39, 0.45)";
    context.fill();
    const markerX = (location.point.distance / route.distance) * width;
    context.beginPath();
    context.moveTo(markerX, 0);
    context.lineTo(markerX, height);
    context.strokeStyle = "#aed8cc";
    context.lineWidth = 2;
    context.stroke();
  }

  function updatePhotos(checkUnlock = false) {
    photos.forEach(updatePhotoGraphic);
    if (!checkUnlock || activePhoto) return;
    const unlocked = photos.filter(
      (photo) =>
        !photo.shown && photo.time > previousTime && photo.time <= currentTime,
    );
    if (!unlocked.length) return;
    pendingPhotos.push(...unlocked.slice(1));
    beginPhotoReveal(unlocked[0]);
  }

  function updateDashboardDate() {
    const currentDay = dayKey(currentTime);
    elements.date.textContent = formatDate(currentTime);
    if (displayedDay && displayedDay !== currentDay) {
      elements.date.classList.remove("day-change");
      void elements.date.offsetWidth;
      elements.date.classList.add("day-change");
    }
    displayedDay = currentDay;
  }

  function updateWeather(location) {
    if (!environmentEnabled) return;
    const key = `${routeIndex}:${new Date(currentTime).toISOString().slice(0, 13)}`;
    if (key === weatherKey) return;
    weatherKey = key;
    map.setFlyoverWeather(location.point, currentTime);
  }

  function updateScene(updateCamera = true, checkPhotos = true) {
    if (!route) return;
    const location = locationAt(currentTime);
    const next =
      route.points[Math.min(route.points.length - 1, location.index + 1)];
    const previous = route.points[Math.max(0, location.index)];
    const heading = headingBetween(previous, next);
    const routeDisplay = routeCoordinates(location);
    if (routeDisplay.index !== renderedRoutePoint) {
      renderedRoutePoint = routeDisplay.index;
      elapsedGraphic.geometry = {
        type: "polyline",
        paths: [routeDisplay.coordinates],
        spatialReference: { wkid: 4326 },
      };
    }
    travelerGraphic.geometry = new Point({
      longitude: location.point.longitude,
      latitude: location.point.latitude,
      z: location.point.elevation + 5,
      spatialReference: { wkid: 4326 },
    });
    travelerGraphic.symbol.symbolLayers.getItemAt(0).heading =
      Math.round(heading);
    const camera = cameraLocation(location, heading);
    cameraPoint = camera.point;
    cameraHeading = camera.heading;
    if (
      updateCamera &&
      controls.flyoverCamera.value !== "free" &&
      !activePhoto
    ) {
      view.camera = followCamera(cameraPoint, cameraHeading);
    }
    const date = new Date(currentTime);
    view.timeExtent = { start: date, end: date };
    map.setFlyoverTime(currentTime);
    updateWeather(location);
    elements.elevation.textContent = `${Math.round(location.point.elevation)} m asl`;
    elements.time.textContent = formatTime(currentTime);
    updateDashboardDate();
    elements.heading.textContent = compassPoint(heading);
    elements.headingArrow.style.transform = `rotate(${heading}deg)`;
    elements.distance.hidden = route.kind === "track";
    if (route.kind === "path") {
      elements.distance.textContent = `${Math.round(location.point.distance / 1000)} / ${Math.round(route.distance / 1000)} km`;
    }
    drawProfile(location);
    updatePhotos(checkPhotos);
    previousTime = currentTime;
  }

  function createPhotoBillboard(photo) {
    if (photo.billboard) return;
    const center = new Point({
      longitude: photo.longitude,
      latitude: photo.latitude,
      z: 27,
      spatialReference: { wkid: 4326 },
    });
    const mesh = Mesh.createPlane(center, {
      size: { width: 120, height: 80 },
      material: { colorTexture: photo.url },
    });
    mesh.rotate(66, 0, photo.orientation);
    photo.billboard = new Graphic({
      geometry: mesh,
      symbol: {
        type: "mesh-3d",
        symbolLayers: [
          {
            type: "fill",
            material: {
              color: "#fff",
              emissive: { source: "color", strength: 0.1 },
            },
          },
        ],
      },
    });
    photoLayer.add(photo.billboard);
  }

  function removePhotoBillboard(photo) {
    if (!photo?.billboard) return;
    photoLayer?.remove(photo.billboard);
    photo.billboard.geometry = null;
    photo.billboard = null;
  }

  function focusPhoto(photo) {
    if (controls.flyoverCamera.value === "free") return Promise.resolve();
    const origin = webMercatorUtils.geographicToWebMercator(
      new Point({
        longitude: photo.longitude,
        latitude: photo.latitude,
        z: (photo.elevation || 0) + 28,
        spatialReference: { wkid: 4326 },
      }),
    );
    const heading = photoHeading(photo);
    const radians = (heading * Math.PI) / 180;
    const latitudeScale = Math.max(
      Math.cos((photo.latitude * Math.PI) / 180),
      0.2,
    );
    photoFocusCamera = new Camera({
      position: new Point({
        x: origin.x - (220 / latitudeScale) * Math.sin(radians),
        y: origin.y - (220 / latitudeScale) * Math.cos(radians),
        z: origin.z + 38,
        spatialReference: origin.spatialReference,
      }),
      heading,
      tilt: 80,
      fov: 58,
    });
    return view
      .goTo(photoFocusCamera, {
        duration: PHOTO_FLY_MS,
        easing: "cubic-in-out",
      })
      .catch((error) => {
        if (error.name !== "AbortError") console.error(error);
      });
  }

  function returnFromPhoto() {
    if (controls.flyoverCamera.value === "free" || !cameraPoint) {
      return Promise.resolve();
    }
    return view
      .goTo(followCamera(cameraPoint, cameraHeading), {
        duration: PHOTO_FLY_MS,
        easing: "cubic-in-out",
      })
      .catch((error) => {
        if (error.name !== "AbortError") console.error(error);
      });
  }

  function beginPhotoReveal(photo) {
    photo.shown = true;
    activePhoto = photo;
    activePhotoRemaining = PHOTO_PAUSE_MS;
    activePhotoReady = false;
    photoReturning = false;
    lastPhotoFrameTime = 0;
    // Temporarily hide Flyover photo titles.
    // elements.photoTitle.textContent = photo.name
    //   .replace(/^IMG[_\s-]*/i, "Photo ")
    //   .replaceAll("_", " ");
    // elements.photoTitle.classList.add("active");
    map.playFlyoverPhotoAudio(photo.source);
    createPhotoBillboard(photo);
    travelerGraphic.visible = false;
    photos.forEach(updatePhotoGraphic);
    focusPhoto(photo).then(() => {
      if (activePhoto !== photo) return;
      activePhotoReady = true;
    });
    if (!photoFrame) photoFrame = requestAnimationFrame(updatePhotoReveal);
  }

  function finishPhoto(completedPhoto) {
    map.stopFlyoverPhotoAudio();
    removePhotoBillboard(completedPhoto);
    activePhoto = null;
    activePhotoReady = false;
    photoReturning = false;
  }

  function updatePhotoReveal(now) {
    photoFrame = 0;
    if (!active || !activePhoto) return;
    if (activePhotoReady && !photoReturning && playbackActive) {
      if (lastPhotoFrameTime) {
        activePhotoRemaining -= now - lastPhotoFrameTime;
      }
      lastPhotoFrameTime = now;
    } else {
      lastPhotoFrameTime = 0;
    }
    if (!activePhotoReady || activePhotoRemaining > 0 || photoReturning) {
      photoFrame = requestAnimationFrame(updatePhotoReveal);
      return;
    }
    photoReturning = true;
    const completedPhoto = activePhoto;
    const nextPhoto = pendingPhotos.shift();
    if (nextPhoto) {
      finishPhoto(completedPhoto);
      previousTime = currentTime;
      currentTime = nextPhoto.time;
      updateScene(false, false);
      syncTimeline(true);
      beginPhotoReveal(nextPhoto);
      return;
    }
    if (routeAfterPhoto !== null) {
      const handoff = routeAfterPhoto;
      routeAfterPhoto = null;
      finishPhoto(completedPhoto);
      elements.photoTitle.classList.remove("active");
      travelerGraphic.visible = true;
      transitionToRoute(handoff.index, handoff.time);
      return;
    }
    const chainedPhoto = photos.find(
      (photo) =>
        !photo.shown &&
        photo.time > completedPhoto.time &&
        photo.time - completedPhoto.time <= PHOTO_CHAIN_LIMIT_MS &&
        photo.time >= route.start &&
        photo.time <= route.end,
    );
    if (chainedPhoto) {
      finishPhoto(completedPhoto);
      previousTime = currentTime;
      currentTime = chainedPhoto.time;
      updateScene(false, false);
      syncTimeline(true);
      beginPhotoReveal(chainedPhoto);
      return;
    }
    returnFromPhoto().then(() => {
      if (!active || activePhoto !== completedPhoto) return;
      finishPhoto(completedPhoto);
      elements.photoTitle.classList.remove("active");
      travelerGraphic.visible = true;
      updatePhotos();
    });
    photoFrame = requestAnimationFrame(updatePhotoReveal);
  }

  function routesForDay(key) {
    const bounds = dayBounds(key);
    return routes.filter(
      (candidate) =>
        candidate.start < bounds.end && candidate.end >= bounds.start,
    );
  }

  function configureDay(key, time = currentTime) {
    selectedDay = key;
    controls.flyoverDay.value = key;
    const bounds = dayBounds(key);
    const selectedTime = clamp(time, bounds.start, bounds.end - 1);
    elements.activityStrip.replaceChildren();
    routesForDay(key).forEach((candidate) => {
      const start = Math.max(candidate.start, bounds.start);
      const end = Math.min(candidate.end, bounds.end);
      const segment = document.createElement("span");
      segment.className = `flyover-activity ${candidate.kind}`;
      segment.style.left = `${((start - bounds.start) / (bounds.end - bounds.start)) * 100}%`;
      segment.style.width = `${Math.max(0.2, ((end - start) / (bounds.end - bounds.start)) * 100)}%`;
      elements.activityStrip.append(segment);
    });
    elements.timeline.value = selectedTime - bounds.start;
  }

  function syncTimeline() {
    if (!selectedDay) return;
    elements.timeline.value = currentTime - dayBounds(selectedDay).start;
  }

  function syncPhotoHistory(time) {
    photos.forEach((photo) => {
      photo.shown = photo.time <= time;
      photo.displayState = "";
      updatePhotoGraphic(photo);
    });
  }

  function routeIndexAt(time) {
    const containing = routes.findIndex(
      (candidate) => time >= candidate.start && time <= candidate.end,
    );
    if (containing >= 0) return containing;
    const next = routes.findIndex((candidate) => time < candidate.start);
    return next >= 0 ? next : routes.length - 1;
  }

  function applyPreset(kind) {
    const preset = ROUTE_PRESETS[kind];
    controls.flyoverDetail.value = preset.detail;
    controls.flyoverHeight.value = preset.height;
    controls.flyoverSpeed.value = preset.speed;
  }

  function setTravelerActivity(kind) {
    travelerGraphic.symbol = travelerSymbol(
      travelerGraphic.symbol?.symbolLayers?.getItemAt(0)?.heading || 0,
      kind === "path" ? "#aed8cc" : "#ef7c64",
      kind === "track" ? 6 : 1,
    );
  }

  function activateRoute(index, requestedTime, applyRoutePreset = true) {
    routeIndex = index;
    route = routes[index];
    currentTime = clamp(requestedTime, route.start, route.end);
    renderedRoutePoint = -1;
    cameraHeading = null;
    routeLayer.removeAll();
    routes.slice(0, index).forEach((candidate) => {
      candidate.graphic.geometry = candidate.fullGeometry;
      routeLayer.add(candidate.graphic);
    });
    elapsedGraphic = route.graphic;
    elapsedGraphic.symbol = routeSymbol(route.kind);
    routeLayer.add(elapsedGraphic);
    setTravelerActivity(route.kind);
    elements.profile.hidden = route.kind === "track";

    if (applyRoutePreset) applyPreset(route.kind);
  }

  async function transitionToRoute(index, requestedTime = routes[index].start) {
    const resume = playbackActive;
    const crossesGap = route && requestedTime > route.end;
    activateRoute(index, requestedTime);
    const nextDay = dayKey(currentTime);
    if (nextDay !== selectedDay) await configureDay(nextDay, currentTime);
    previousTime = currentTime - 1;
    updateScene(false, false);
    syncTimeline(true);
    if (controls.flyoverCamera.value !== "free") {
      if (crossesGap) setTravelerActivity("gap");
      await animateCamera(view, followCamera(cameraPoint, cameraHeading));
      setTravelerActivity(route.kind);
    }
    lastFrameTime = 0;
    if (resume) startAnimation();
  }

  function animate(now) {
    animationFrame = 0;
    if (!active || !playbackActive || !route) return;
    if (activePhoto || scrubbingTimeline) {
      lastFrameTime = now;
      animationFrame = requestAnimationFrame(animate);
      return;
    }
    if (lastFrameTime) {
      const nextTime =
        currentTime +
        (now - lastFrameTime) * Number(controls.flyoverSpeed.value || 1);
      if (nextTime >= route.end && routeIndex < routes.length - 1) {
        const nextIndex = routeIndex + 1;
        const handoffTime = Math.max(route.end, routes[nextIndex].start);
        const handoffPhotos = photos.filter(
          (photo) =>
            !photo.shown &&
            photo.time > currentTime &&
            photo.time <= handoffTime,
        );
        if (handoffPhotos.length) {
          const [gapPhoto, ...remaining] = handoffPhotos;
          pendingPhotos.push(...remaining);
          currentTime = gapPhoto.time;
          routeAfterPhoto = { index: nextIndex, time: handoffTime };
          updateScene(false, false);
          syncTimeline(true);
          beginPhotoReveal(gapPhoto);
          return;
        }
        transitionToRoute(nextIndex, handoffTime);
        return;
      }
      if (nextTime >= route.end && routeIndex === routes.length - 1) {
        const finalPhotos = photos.filter(
          (photo) => !photo.shown && photo.time > currentTime,
        );
        if (finalPhotos.length) {
          const [finalPhoto, ...remaining] = finalPhotos;
          pendingPhotos.push(...remaining);
          currentTime = finalPhoto.time;
          updateScene(false, false);
          syncTimeline(true);
          beginPhotoReveal(finalPhoto);
          return;
        }
      }
      currentTime = Math.min(route.end, nextTime);
      updateScene();
      syncTimeline();
      if (routeIndex === routes.length - 1 && currentTime >= route.end) {
        setPlayback(false);
        return;
      }
    }
    lastFrameTime = now;
    animationFrame = requestAnimationFrame(animate);
  }

  function startAnimation() {
    if (!animationFrame && playbackActive) {
      lastFrameTime = 0;
      animationFrame = requestAnimationFrame(animate);
    }
  }

  function stopAnimation() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    lastFrameTime = 0;
  }

  function updatePlayButton() {
    const label = playbackActive ? "Pause" : "Play";
    elements.play.icon = playbackActive ? "pause-f" : "play-f";
    elements.play.text = label;
    elements.play.setAttribute("aria-label", label);
    elements.play.title = label;
  }

  function setPlayback(enabled) {
    playbackActive = enabled && active && routes.length > 0;
    updatePlayButton();
    if (playbackActive) startAnimation();
    else stopAnimation();
  }

  function cancelPhotoReveal() {
    if (photoFrame) cancelAnimationFrame(photoFrame);
    photoFrame = 0;
    if (activePhoto) removePhotoBillboard(activePhoto);
    activePhoto = null;
    activePhotoReady = false;
    pendingPhotos = [];
    routeAfterPhoto = null;
    map.stopFlyoverPhotoAudio();
    elements.photoTitle.classList.remove("active");
  }

  function deactivate() {
    active = false;
    setPlayback(false);
    cancelPhotoReveal();
    prepareVersion += 1;
    view.animation?.stop();
    removeLayers();
    resetPreparedData();
    map.setFlyoverContentVisible(true);
    map.clearFlyoverWeather();
    weatherKey = "";
    elements.root.classList.remove("active");
  }

  async function activate() {
    if (active) return;
    active = true;
    elements.root.classList.add("active");
    map.setFlyoverContentVisible(false);
    await prepare();
    if (!active || !route) return;
    updateScene(false, false);
  }

  controls.flyoverDay.addEventListener("calciteSelectChange", () => {
    if (!active || !routes.length) return;
    const dayRoutes = routesForDay(controls.flyoverDay.value);
    if (!dayRoutes.length) return;
    cancelPhotoReveal();
    travelerGraphic.visible = true;
    syncPhotoHistory(dayRoutes[0].start);
    transitionToRoute(routes.indexOf(dayRoutes[0]), dayRoutes[0].start);
  });
  controls.flyoverCamera.addEventListener(
    "calciteSegmentedControlChange",
    () => {
      orbitHeadingOffset = 0;
      orbitTiltOffset = 0;
      updateScene(false, false);
    },
  );
  controls.flyoverDetail.addEventListener("calciteSegmentedControlChange", () =>
    updateScene(false, false),
  );
  controls.flyoverHeight.addEventListener("calciteSliderInput", () => {
    if (active && cameraPoint && controls.flyoverCamera.value !== "free") {
      view.camera = followCamera(cameraPoint, cameraHeading);
    }
  });
  elements.timeline.labelFormatter = (value, type) => {
    if (type !== "tick") return undefined;
    return `${String(Math.round(value / 3600000)).padStart(2, "0")}:00`;
  };
  configureTimelineAppearance();
  elements.play.addEventListener("click", () => {
    setPlayback(!playbackActive);
  });
  elements.timeline.addEventListener("calciteSliderInput", () => {
    if (!active || !routes.length || !selectedDay) return;
    const bounds = dayBounds(selectedDay);
    const selectedTime = bounds.start + Number(elements.timeline.value);
    syncPhotoHistory(selectedTime);
    const index = routeIndexAt(selectedTime);
    if (index !== routeIndex) {
      activateRoute(index, selectedTime);
    } else {
      previousTime = currentTime;
      currentTime = clamp(selectedTime, route.start, route.end);
    }
    updateScene(true, false);
  });
  elements.timeline.addEventListener("pointerdown", () => {
    scrubbingTimeline = true;
  });
  window.addEventListener("pointerup", () => {
    if (!scrubbingTimeline) return;
    scrubbingTimeline = false;
    lastFrameTime = performance.now();
  });
  view.on("drag", (event) => {
    if (!active || controls.flyoverCamera.value !== "back") return;
    if (event.action === "start") {
      if (event.button !== 2) return;
      orbitDrag = {
        x: event.x,
        y: event.y,
        heading: orbitHeadingOffset,
        tilt: orbitTiltOffset,
        camera: activePhoto ? view.camera.clone() : null,
      };
    }
    if (!orbitDrag) return;
    event.stopPropagation();
    if (orbitDrag.camera) {
      const camera = orbitDrag.camera.clone();
      camera.heading =
        orbitDrag.camera.heading - (event.x - orbitDrag.x) * 0.22;
      camera.tilt = clamp(
        orbitDrag.camera.tilt + (event.y - orbitDrag.y) * 0.12,
        0,
        179,
      );
      view.camera = camera;
      if (event.action === "end") {
        orbitDrag = null;
        if (photoFocusCamera) view.camera = photoFocusCamera.clone();
      }
      return;
    }
    orbitHeadingOffset = orbitDrag.heading - (event.x - orbitDrag.x) * 0.22;
    orbitTiltOffset = clamp(
      orbitDrag.tilt + (event.y - orbitDrag.y) * 0.12,
      -45,
      45,
    );
    if (cameraPoint) view.camera = followCamera(cameraPoint, cameraHeading);
    if (event.action === "end") {
      orbitDrag = null;
      orbitHeadingOffset = 0;
      orbitTiltOffset = 0;
      if (cameraPoint) view.camera = followCamera(cameraPoint, cameraHeading);
    }
  });
  view.on("mouse-wheel", (event) => {
    if (!active || controls.flyoverCamera.value !== "back") return;
    event.stopPropagation();
    const altitude = Number(controls.flyoverHeight.value) || 200;
    const zoomFactor = event.deltaY > 0 ? 0.82 : 1.22;
    controls.flyoverHeight.value = Math.round(
      clamp(altitude * zoomFactor, 2, 3000),
    );
    if (cameraPoint) view.camera = followCamera(cameraPoint, cameraHeading);
  });
  updatePlayButton();

  return {
    setDataset(nextDataset) {
      dataset = nextDataset || { photos: [], tracks: [], paths: [] };
      if (!active) return;
      setPlayback(false);
      cancelPhotoReveal();
      map.clearFlyoverWeather();
      weatherKey = "";
      prepareVersion += 1;
      removeLayers();
      resetPreparedData();
      prepare();
    },
    setMode(mode, timestamp) {
      if (mode === "flyover") {
        requestedStartTime = Number.isFinite(timestamp) ? timestamp : null;
        activate();
      } else if (active) deactivate();
    },
    getCurrentTimestamp() {
      return route ? currentTime : null;
    },
    setEnhancedEnvironmentEnabled(enabled) {
      environmentEnabled = enabled;
      weatherKey = "";
      if (!active) return;
      map.stopFlyoverPhotoAudio();
      map.clearFlyoverWeather();
      if (!enabled) return;
      updateScene(false, false);
      if (activePhoto) map.playFlyoverPhotoAudio(activePhoto.source);
    },
  };
}
