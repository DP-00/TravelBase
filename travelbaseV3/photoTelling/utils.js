export function inaturalistPhotoUrl(url, size = "large") {
  if (!/^https?:\/\/static\.inaturalist\.org\//i.test(url)) return url;
  return url.replace(/\/(?:square|small|medium|large|original)(?=\.[^./?#]+(?:[?#]|$))/i, `/${size}`);
}

export function parseLocalTimestamp(value) {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string") return NaN;

  const parts = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(?:Z|[+-]\d{2}:?\d{2})?)?$/i);
  if (!parts) return NaN;
  const time = Date.parse(`${parts[1]}T${parts[2] || "00:00:00"}Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === parts[1] ? time : NaN;
}

export async function parseGpsFile(file) {
  try {
    const text = await file.text();
    if (!/\.gpx$/i.test(file.name)) return JSON.parse(text);

    const { SaxesParser } = await import("https://esm.sh/saxes@6.0.0");
    const parser = new SaxesParser({ xmlns: true });
    const paths = [];
    const elements = [];
    let trackName = "";
    let currentPath = null;
    let currentPoint = null;
    let content = "";
    let root = null;
    const coordinate = (value, limit) => {
      if (value == null || value.trim() === "") return NaN;
      const number = Number(value);
      return Number.isFinite(number) && Math.abs(number) <= limit ? number : NaN;
    };

    parser.on("opentag", (tag) => {
      root ||= tag.local;
      elements.push(tag.local);
      content = "";
      if (tag.local === "trk") trackName = "";
      if (tag.local === "trkseg" || tag.local === "rte") {
        currentPath = {
          name: trackName || file.name.replace(/\.gpx$/i, ""),
          points: [],
        };
      }
      if (tag.local === "trkpt" || tag.local === "rtept") {
        currentPoint = {
          longitude: coordinate(tag.attributes.lon?.value, 180),
          latitude: coordinate(tag.attributes.lat?.value, 90),
          time: NaN,
        };
      }
    });
    parser.on("text", (text) => {
      content += text;
    });
    parser.on("cdata", (text) => {
      content += text;
    });
    parser.on("closetag", (tag) => {
      const parent = elements.at(-2);
      if (tag.local === "name" && parent === "trk") trackName = content.trim();
      if (tag.local === "name" && parent === "rte" && currentPath) currentPath.name = content.trim();
      if (tag.local === "time" && ["trkpt", "rtept"].includes(parent) && currentPoint) {
        const timestamp = content.trim();
        currentPoint.time = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp) ? Date.parse(timestamp) : parseLocalTimestamp(timestamp);
      }
      if (tag.local === "trkpt" || tag.local === "rtept") {
        if (currentPath && currentPoint && Object.values(currentPoint).every(Number.isFinite)) {
          currentPath.points.push(currentPoint);
        }
        currentPoint = null;
      }
      if ((tag.local === "trkseg" || tag.local === "rte") && currentPath) {
        paths.push(currentPath);
        currentPath = null;
      }
      elements.pop();
      content = "";
    });
    parser.write(text).close();
    if (root !== "gpx") throw new Error("Expected a GPX document");
    return paths;
  } catch (error) {
    throw new Error(error.message || "Could not parse GPS file");
  }
}

export function formatTimestamp(value) {
  if (value == null || value === "") return "";

  const date = new Date(parseLocalTimestamp(value));
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        hourCycle: "h23",
        timeZone: "UTC",
      }).format(date);
}

export function formatShortDate(value) {
  if (value == null || value === "") return "";

  const date = new Date(parseLocalTimestamp(value));
  if (Number.isNaN(date.getTime())) return value;
  return [date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear() % 100].map((part) => String(part).padStart(2, "0")).join(".");
}

export function formatStackedDate(value) {
  if (value == null || value === "") return "";

  const date = new Date(parseLocalTimestamp(value));
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}\n${date.getUTCFullYear()}`;
}

export function dayKey(value) {
  const time = parseLocalTimestamp(value);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : "";
}

export function dayBounds(key) {
  const start = parseLocalTimestamp(key);
  return { start, end: start + 86_400_000 };
}

export function sameCalendarDay(firstTime, secondTime) {
  const firstDay = dayKey(firstTime);
  return Boolean(firstDay) && firstDay === dayKey(secondTime);
}

export function calendarDayDifference(firstTime, secondTime) {
  if (!Number.isFinite(firstTime) || !Number.isFinite(secondTime)) return 1;
  return Math.max(1, Math.floor(secondTime / 86_400_000) - Math.floor(firstTime / 86_400_000));
}

export function formatTime(time) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(parseLocalTimestamp(time));
}

export function formatDate(time, options = {}) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
    timeZone: "UTC",
  }).format(parseLocalTimestamp(time));
}

export function orderedPhotoItems(photoItems, order = "config", visiblePhotoItems = null) {
  const visiblePhotos = visiblePhotoItems && new Set(visiblePhotoItems);
  const items = visiblePhotos ? photoItems.filter((photo) => visiblePhotos.has(photo)) : [...photoItems];

  if (order === "time" || order === "time-desc") {
    const direction = order === "time" ? 1 : -1;
    const sortTime = (photo) => {
      const time = parseLocalTimestamp(photo.timestamp);
      return Number.isFinite(time) ? direction * time : Infinity;
    };
    items.sort((first, second) => sortTime(first) - sortTime(second));
  } else if (order === "title") {
    items.sort((first, second) =>
      (first.name || "").localeCompare(second.name || "", undefined, {
        sensitivity: "base",
      }),
    );
  }

  return items;
}

const audioUrlCache = new Map();

export function getPlayableAudioUrl(url) {
  const resolvedUrl = new URL(url, window.location.href);
  if (resolvedUrl.protocol !== "file:") return Promise.resolve(resolvedUrl.href);
  if (audioUrlCache.has(resolvedUrl.href)) {
    return audioUrlCache.get(resolvedUrl.href);
  }

  const playableUrl = fetch(resolvedUrl.href)
    .then((response) => {
      if (!response.ok) throw new Error(`Sound request failed (${response.status})`);
      return response.blob();
    })
    .then((blob) => URL.createObjectURL(blob))
    .catch((error) => {
      audioUrlCache.delete(resolvedUrl.href);
      throw error;
    });
  audioUrlCache.set(resolvedUrl.href, playableUrl);
  return playableUrl;
}

const weatherCache = new Map();
const weatherVariables = ["relative_humidity_2m", "precipitation", "rain", "snowfall", "cloud_cover", "weather_code"].join(",");

export function getHistoricalWeather(location, timestamp) {
  const time = parseLocalTimestamp(timestamp);
  if (!location || !Number.isFinite(time)) return Promise.resolve(null);

  const date = dayKey(time);
  const key = [Number(location.latitude).toFixed(4), Number(location.longitude).toFixed(4), date].join(":");
  if (!weatherCache.has(key)) {
    const request = (async () => {
      const params = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        start_date: date,
        end_date: date,
        hourly: weatherVariables,
        timezone: "auto",
        timeformat: "unixtime",
      });
      const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`, { signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.reason || `Weather request failed (${response.status})`);
      }

      const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: data.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      });
      const hours = data.hourly.time.map((seconds) => {
        const instant = seconds * 1000;
        const parts = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value }) => [type, value]));
        const localTime = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
        return { instant, localTime };
      });
      return { hourly: data.hourly, hours };
    })().catch((error) => {
      weatherCache.delete(key);
      throw error;
    });
    weatherCache.set(key, request);
  }

  return weatherCache.get(key).then(({ hourly, hours }) => {
    const targetHour = Math.floor(time / 3_600_000);
    const index = hours.findIndex((hour) => Math.floor(hour.localTime / 3_600_000) === targetHour);
    if (index < 0) throw new Error("No hourly weather record was returned");
    const reading = Object.fromEntries(
      Object.entries(hourly)
        .filter(([name]) => name !== "time")
        .map(([name, values]) => [name, values[index]]),
    );
    return {
      reading,
      lightingDate: new Date(hours[index].instant + time - hours[index].localTime),
    };
  });
}
