const GeoJSONLayer = await $arcgis.import("@arcgis/core/layers/GeoJSONLayer.js");

export async function doAuth(dbxAuth, REDIRECT_URI) {
  if (dbxAuth.getAccessToken()) return true;
  const authUrl = await dbxAuth.getAuthenticationUrl(REDIRECT_URI, undefined, "code", "offline", undefined, undefined, true);
  const codeVerifier = dbxAuth.getCodeVerifier();
  sessionStorage.setItem("codeVerifier", codeVerifier);
  window.location.href = authUrl;
  return false;
}

export async function handleAuthRedirect(dbx, dbxAuth, REDIRECT_URI) {
  if (!hasRedirectedFromAuth()) return;

  try {
    const codeVerifier = sessionStorage.getItem("codeVerifier");
    if (!codeVerifier) {
      console.error("Missing codeVerifier");
      return;
    }
    dbxAuth.setCodeVerifier(codeVerifier);

    const token = await dbxAuth.getAccessTokenFromCode(REDIRECT_URI, getCodeFromUrl());
    const accessToken = token?.result?.access_token;
    if (!accessToken) throw new Error("No access token");
    dbxAuth.setAccessToken(accessToken);
    sessionStorage.removeItem("codeVerifier");

    // clean URL
    window.history.replaceState({}, document.title, window.location.pathname);

    return true;
  } catch (err) {
    console.error("Auth failed:", err);
  }
}

function getCodeFromUrl() {
  return new URLSearchParams(window.location.search).get("code");
}

function hasRedirectedFromAuth() {
  return !!getCodeFromUrl();
}

export async function fetchDropboxFile(dbx, file) {
  const pathToFetch = `/${file}`; // All files are at app folder root
  console.log("Fetching file:", file, "-> path:", pathToFetch);

  try {
    // List all files in the app folder for debugging
    const filesList = await dbx.filesListFolder({ path: "" });
    console.log(
      "Files in app folder:",
      filesList.result.entries.map((f) => f.name),
    );

    const response = await dbx.filesGetTemporaryLink({ path: pathToFetch });
    const res = await fetch(response.result.link);

    return await res.json();
  } catch (err) {
    console.error("Error fetching file:", file, err);
    return "";
  }
}

async function uploadGeoJSONToDropbox(dbx, path, jsonStr) {
  try {
    const res = await dbx.filesUpload({
      path,
      contents: new Blob([jsonStr], { type: "application/json" }),
      mode: { ".tag": "overwrite" },
    });
    return res;
  } catch (err) {
    throw err;
  }
}

async function layerToGeoJSON(layer) {
  try {
    await layer.load();
  } catch (e) {
    console.warn("Failed to load layer for export:", layer && (layer.id || layer.title), e);
  }

  if (typeof layer.queryFeatures !== "function") return null;

  const q = await layer.queryFeatures({ where: "1=1", outFields: ["*"], returnGeometry: true, outSpatialReference: { wkid: 4326 } });

  const features = (q.features || []).map((f) => {
    const geom = f.geometry || null;
    let geometry = null;

    if (geom) {
      // POINT
      if (geom.type === "point") {
        const lon = geom.longitude ?? geom.x ?? (geom.coordinates && geom.coordinates[0]);
        const lat = geom.latitude ?? geom.y ?? (geom.coordinates && geom.coordinates[1]);
        const coords = typeof lon === "number" && typeof lat === "number" ? [lon, lat] : null;
        if (coords) geometry = { type: "Point", coordinates: coords };
      }

      // POLYLINE -> LineString or MultiLineString
      else if (geom.type === "polyline") {
        const paths = geom.paths || [];
        if (paths.length === 1) geometry = { type: "LineString", coordinates: paths[0] };
        else geometry = { type: "MultiLineString", coordinates: paths };
      }
    }

    // clone attributes and remove internal object id field
    const props = { ...(f.attributes || {}) };
    const objectIdField = layer.objectIdField;
    if (objectIdField && props[objectIdField] != null) delete props[objectIdField];

    // if attributes contain 'id', move it to feature id (to match original files)
    let featureId = null;
    if (props.id != null) {
      featureId = props.id;
      delete props.id;
    }

    const out = { type: "Feature", geometry, properties: props };
    if (featureId != null) out.id = featureId;
    return out;
  });

  return { type: "FeatureCollection", features };
}

export async function saveAllLayersToDropbox(dbx, viewElement) {
  const layers = viewElement.map.allLayers.toArray?.() || [];
  const geojsonLayers = layers.filter((l) => {
    if (!l) return false;
    const id = String(l.id || "");
    if (/^tl_/i.test(id)) return false;
    const url = String(l.url || "");
    return l.type === "geojson" || l instanceof GeoJSONLayer || url.toLowerCase().includes(".geojson") || id.toLowerCase().endsWith(".geojson");
  });

  console.log(
    `Found ${geojsonLayers.length} GeoJSON layers to export:`,
    geojsonLayers.map((l) => l.id || l.title),
  );
  if (!geojsonLayers.length) {
    window.alert("No editable GeoJSON layers found to save.");
    return;
  }

  const results = [];

  for (const layer of geojsonLayers) {
    try {
      const fc = await layerToGeoJSON(layer);
      if (!fc) {
        results.push({ layer: layer.id || layer.title, ok: false, error: "no features" });
        continue;
      }

      const jsonStr = JSON.stringify(fc, null, 2);
      const filename = `/${layer.id || layer.title || "layer"}.geojson`;

      console.log(`Exporting layer "${layer.id || layer.title}":`, filename);
      await uploadGeoJSONToDropbox(dbx, filename, jsonStr);
      results.push({ layer: layer.id || layer.title, ok: true });
    } catch (err) {
      console.error("Failed to export/upload layer", layer && (layer.id || layer.title), err);
      results.push({ layer: layer.id || layer.title, ok: false, error: err?.message || err });
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (!failed.length) {
    window.alert(`Upload successful: ${results.length} layer(s) saved to Dropbox.`);
  } else {
    window.alert(`Upload finished with ${failed.length} failure(s). See console for details.`);
  }
  return results;
}
