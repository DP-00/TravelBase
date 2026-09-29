const catalogUrl = new URL("https://dropbox.local/travelImg.json");
let catalogPromise;
const datasetCache = new Map();
const temporaryLinks = new Map();
let dropboxClient;
const largePhotoSetThreshold = 150;
const photoLinkBatchSize = 30;
const photoLinkBatchPauseMs = 300;

const asArray = (value) => (Array.isArray(value) ? value : []);

export function setDropboxClient(client) {
  dropboxClient = client;
}

function getAccessibleUrl(url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "dropbox.local") return Promise.resolve(url);
  if (!dropboxClient) return Promise.reject(new Error("Dropbox is not connected."));

  const path = decodeURIComponent(parsed.pathname);
  if (!temporaryLinks.has(path)) {
    temporaryLinks.set(
      path,
      dropboxClient
        .filesGetTemporaryLink({ path })
        .then((response) => response.result.link)
        .catch((error) => handleRateLimitedDropboxLink(path, error))
        .catch((error) => {
          temporaryLinks.delete(path);
          console.error(`[PhotoTelling] Failed to get Dropbox temporary link for ${path}`, error);
          throw error;
        }),
    );
  }
  return temporaryLinks.get(path);
}

function handleRateLimitedDropboxLink(path, firstError) {
  const isRateLimitError = (error) => {
    const details = [error?.name, error?.message, typeof error?.error === "string" ? error.error : "", error?.error?.error_summary, error?.status, error?.statusCode, error?.response?.status, error?.response?.statusText].join(" ");
    return /\b429\b|too[\s_-]*many[\s_-]*requests/i.test(details);
  };
  if (!isRateLimitError(firstError)) return Promise.reject(firstError);

  const state =
    handleRateLimitedDropboxLink.state ||
    (handleRateLimitedDropboxLink.state = {
      pending: [],
      running: false,
      timer: null,
    });
  const delayAfter = (error, attempt) => {
    const retryAfter = Number(error?.headers?.get?.("Retry-After") || error?.response?.headers?.get?.("Retry-After") || error?.headers?.["Retry-After"]);
    const serverDelay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0;
    return Math.max(250 * 2 ** (attempt - 1), serverDelay) + Math.random() * 150;
  };

  const processBatch = async () => {
    state.timer = null;
    if (state.running || !state.pending.length) return;
    state.running = true;
    const batch = state.pending.splice(0, 8);
    let nextDelay = 100;
    const results = await Promise.allSettled(batch.map(({ path: filePath }) => dropboxClient.filesGetTemporaryLink({ path: filePath })));

    results.forEach((result, index) => {
      const job = batch[index];
      if (result.status === "fulfilled") {
        job.resolve(result.value.result.link);
      } else if (isRateLimitError(result.reason) && job.attempt < 5) {
        job.attempt++;
        state.pending.push(job);
        nextDelay = Math.max(nextDelay, delayAfter(result.reason, job.attempt));
      } else {
        job.reject(result.reason);
      }
    });

    state.running = false;
    if (state.pending.length && !state.timer) {
      state.timer = setTimeout(processBatch, nextDelay);
    }
  };

  return new Promise((resolve, reject) => {
    state.pending.push({ attempt: 1, path, reject, resolve });
    if (!state.running && !state.timer) {
      state.timer = setTimeout(processBatch, Math.max(250, delayAfter(firstError, 1)));
    }
  });
}

function createStorageResolver(storage = {}) {
  const localBase = new URL("./", catalogUrl).href;
  const remoteBase = new URL(storage.baseUrl || "./", catalogUrl);
  if (!remoteBase.pathname.endsWith("/")) remoteBase.pathname += "/";
  const overrides = new Map(Object.entries(storage.urls || {}).map(([path, url]) => [new URL(path, catalogUrl).href, new URL(url, catalogUrl).href]));
  return (path) => {
    const source = new URL(path, catalogUrl).href;
    const target = new URL(overrides.get(source) || (source.startsWith(localBase) ? new URL(source.slice(localBase.length), remoteBase).href : source));
    if (["dropbox.com", "www.dropbox.com"].includes(target.hostname) && /^\/(s\/|scl\/fi\/)/.test(target.pathname)) {
      target.searchParams.delete("dl");
      target.searchParams.set("raw", "1");
    }
    return target.href;
  };
}

async function readJson(url) {
  const accessibleUrl = await getAccessibleUrl(url);
  const response = await fetch(accessibleUrl);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  return response.json();
}

export function loadTravelConfig() {
  catalogPromise ||= readJson(catalogUrl)
    .then(async (config) => {
      const resolveUrl = createStorageResolver(config.storage);
      const datasets = config.datasets || config.travelImgsets;
      if (!Array.isArray(datasets)) throw new Error("Dropbox travelImg.json has no datasets array.");
      const sounds = await Promise.all(Object.entries(config.sounds || {}).map(async ([name, url]) => [name, url ? await getAccessibleUrl(resolveUrl(url)) : null]));
      return {
        ...config,
        defaultDataset: config.defaultDataset ?? config.defaulttravelImgset ?? datasets[0]?.id,
        datasets: datasets.map((source) => ({
          ...source,
          url: new URL(source.url, catalogUrl).href,
        })),
        resolveUrl,
        sounds: Object.fromEntries(sounds),
      };
    })
    .catch((error) => {
      catalogPromise = null;
      throw error;
    });
  return catalogPromise;
}

function routePath(route) {
  if (typeof route === "string") return route;
  return route?.url || route?.path || route?.href || "";
}

async function loadRoute(route, kind) {
  const url = routePath(route);
  if (!url) return null;
  const accessibleUrl = await getAccessibleUrl(url);
  const response = await fetch(accessibleUrl);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  const isGpx = route.type === "gpx";
  return {
    name: route?.name || url.replace(/^.*\//, "").replace(/\.[^.]+$/, ""),
    url: accessibleUrl,
    kind,
    type: isGpx ? "gpx" : "geojson",
    data: isGpx ? await response.text() : await response.json(),
  };
}

async function loadRoutes(dataset) {
  const [tracks, paths] = await Promise.all([Promise.all(dataset.tracks.map((route) => loadRoute(route, "track"))), Promise.all(dataset.paths.map((route) => loadRoute(route, "path")))]);

  return {
    tracks: tracks.filter(Boolean),
    paths: paths.filter(Boolean),
  };
}

function resolveRoute(route, baseUrl, resolveUrl) {
  const url = routePath(route);
  if (!url) return route;
  const source = new URL(url, baseUrl);
  return {
    ...(typeof route === "string" ? {} : route),
    name:
      route?.name ||
      source.pathname
        .split("/")
        .pop()
        .replace(/\.[^.]+$/, ""),
    type: source.pathname.toLowerCase().endsWith(".gpx") ? "gpx" : "geojson",
    url: resolveUrl(source.href),
  };
}

function resolvePhoto(photo, photoBaseUrl, soundBaseUrl, resolveUrl) {
  if (!photo?.url) return photo;
  return {
    ...photo,
    url: resolveUrl(new URL(photo.url, photoBaseUrl).href),
    soundPath: photo.soundPath ? resolveUrl(new URL(photo.soundPath, soundBaseUrl).href) : photo.soundPath,
  };
}

export function resolveDatasetAssets(dataset, datasetUrl, resolveUrl = createStorageResolver()) {
  const sourceUrl = new URL(datasetUrl, catalogUrl);
  const baseUrl = (kind) => {
    const url = new URL(dataset.basePaths?.[kind] || "./", sourceUrl);
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url;
  };
  const photoBaseUrl = baseUrl("photos");
  const soundBaseUrl = baseUrl("sounds");
  const routeBaseUrl = baseUrl("routes");
  return {
    ...dataset,
    photos: asArray(dataset.photos).map((photo) => resolvePhoto(photo, photoBaseUrl, soundBaseUrl, resolveUrl)),
    tracks: asArray(dataset.tracks).map((route) => resolveRoute(route, routeBaseUrl, resolveUrl)),
    paths: asArray(dataset.paths).map((route) => resolveRoute(route, routeBaseUrl, resolveUrl)),
  };
}

function mapDatasetPaths(dataset, transform) {
  const mapRoute = (route) => {
    const path = routePath(route);
    return path
      ? {
          ...(typeof route === "string" ? {} : route),
          url: transform(path, "routes"),
        }
      : route;
  };
  return {
    ...dataset,
    photos: asArray(dataset.photos).map((photo) => ({
      ...photo,
      url: photo.url ? transform(photo.url, "photos") : photo.url,
      soundPath: photo.soundPath ? transform(photo.soundPath, "sounds") : photo.soundPath,
    })),
    tracks: asArray(dataset.tracks).map(mapRoute),
    paths: asArray(dataset.paths).map(mapRoute),
  };
}

const absoluteAssetPath = /^(?:[a-z][a-z0-9+.-]*:|\/)/i;

export function expandDatasetPaths(dataset) {
  return mapDatasetPaths(dataset, (path, kind) => {
    const base = dataset.basePaths?.[kind] || "./";
    if (absoluteAssetPath.test(path) || base === "./" || base === ".") return path;
    if (/^[a-z][a-z0-9+.-]*:/i.test(base)) {
      const url = new URL(base);
      if (!url.pathname.endsWith("/")) url.pathname += "/";
      return new URL(path, url).href;
    }
    return `${base.replace(/\/?$/, "/")}${path.replace(/^\.\//, "")}`;
  });
}

export function compactDatasetPaths(dataset) {
  const folders = { photos: [], sounds: [], routes: [] };
  const references = { photos: [], sounds: [], routes: [] };
  mapDatasetPaths(dataset, (path, kind) => {
    references[kind].push(path);
    if (!absoluteAssetPath.test(path)) folders[kind].push(path.split("/").slice(0, -1));
    return path;
  });
  const basePaths = Object.fromEntries(
    Object.entries(folders).map(([kind, directories]) => {
      const preferred = dataset.basePaths?.[kind]?.replace(/\/?$/, "/");
      if (preferred && references[kind].every((path) => path.startsWith(preferred) || absoluteAssetPath.test(path))) return [kind, preferred];
      const common = [...(directories[0] || [])];
      for (const directory of directories.slice(1)) {
        while (common.some((part, index) => directory[index] !== part)) common.pop();
      }
      return [kind, common.length ? `${common.join("/")}/` : "./"];
    }),
  );
  return {
    ...mapDatasetPaths(dataset, (path, kind) => (path.startsWith(basePaths[kind]) ? path.slice(basePaths[kind].length) : path)),
    basePaths,
  };
}

export async function loadDataset(value, { routes = true } = {}) {
  const config = await loadTravelConfig();
  const source = config.datasets.find((dataset) => dataset.id === value);
  if (!source) throw new Error(`Unknown dataset: ${value}`);

  if (!datasetCache.has(source.url)) {
    const request = readJson(config.resolveUrl(source.url))
      .then(async (data) => {
        const dataset = resolveDatasetAssets(data, source.url, config.resolveUrl);
        let routeDataPromise;
        const waitForLinks = async (requests) => {
          const results = await Promise.allSettled(requests);
          const failed = results.find((result) => result.status === "rejected");
          if (failed) throw failed.reason;
          return results.map((result) => result.value);
        };
        const resolvePhotos = (photos) =>
          waitForLinks(
            photos.map(async (photo) => ({
              ...photo,
              url: photo.url ? await getAccessibleUrl(photo.url) : photo.url,
              soundPath: photo.soundPath ? await getAccessibleUrl(photo.soundPath) : photo.soundPath,
            })),
          );
        let photos;
        if (dataset.photos.length > largePhotoSetThreshold) {
          photos = dataset.photos.map((photo) => ({ ...photo }));
          const linkRequests = [];
          photos.forEach((photo, photoIndex) => {
            for (const key of ["url", "soundPath"]) {
              if (photo[key]) linkRequests.push({ key, photoIndex, url: photo[key] });
            }
          });
          const batchCount = Math.ceil(linkRequests.length / photoLinkBatchSize);
          console.info(`[PhotoTelling] ${value}: ${photos.length} photo files; requesting up to ${photoLinkBatchSize} Dropbox links at once (${batchCount} batches).`);
          for (let index = 0; index < linkRequests.length; index += photoLinkBatchSize) {
            const batch = linkRequests.slice(index, index + photoLinkBatchSize);
            console.info(`[PhotoTelling] ${value}: batch ${Math.floor(index / photoLinkBatchSize) + 1}/${batchCount}, requesting ${batch.length} links at once.`);
            const resolvedUrls = await waitForLinks(batch.map((request) => getAccessibleUrl(request.url)));
            batch.forEach((request, batchIndex) => {
              photos[request.photoIndex][request.key] = resolvedUrls[batchIndex];
            });
            if (index + photoLinkBatchSize < linkRequests.length) {
              await new Promise((resolve) => setTimeout(resolve, photoLinkBatchPauseMs));
            }
          }
        } else {
          const linkCount = dataset.photos.reduce((count, photo) => count + Number(Boolean(photo.url)) + Number(Boolean(photo.soundPath)), 0);
          console.info(`[PhotoTelling] ${value}: ${dataset.photos.length} photo files; requesting ${linkCount} Dropbox links at once.`);
          photos = await resolvePhotos(dataset.photos);
        }
        return {
          photos,
          loadRoutes: () => {
            routeDataPromise ||= loadRoutes(dataset).catch((error) => {
              routeDataPromise = null;
              throw error;
            });
            return routeDataPromise;
          },
        };
      })
      .catch((error) => {
        datasetCache.delete(source.url);
        throw error;
      });
    datasetCache.set(source.url, request);
  }

  const cachedDataset = await datasetCache.get(source.url);

  if (!routes) {
    return {
      photos: cachedDataset.photos,
      tracks: [],
      paths: [],
      loadRoutes: cachedDataset.loadRoutes,
    };
  }

  const routeData = await cachedDataset.loadRoutes();

  return {
    photos: cachedDataset.photos,
    ...routeData,
    loadRoutes: cachedDataset.loadRoutes,
  };
}
