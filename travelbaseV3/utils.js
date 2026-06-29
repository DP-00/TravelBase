export async function downloadGPXForFeature(feature) {
  const originalFeature = await getOriginalLayerFeature(feature);

  if (!originalFeature || !originalFeature.geometry || originalFeature.geometry.type !== "polyline") {
    window.alert("GPX export is only available for line features.");
    return;
  }

  const geometry = originalFeature.geometry.spatialReference?.wkid === 4326 ? originalFeature.geometry : webMercatorUtils.webMercatorToGeographic(originalFeature.geometry);
  const tracks = geometry.paths
    .map(
      (path) =>
        `<trkseg>${path
          .map((coord) => {
            const lat = coord[1];
            const lon = coord[0];
            const ele = coord.length > 2 && coord[2] != null ? `<ele>${coord[2]}</ele>` : "";
            return `<trkpt lat="${lat}" lon="${lon}">${ele}</trkpt>`;
          })
          .join("")}</trkseg>`,
    )
    .join("");
  const name = originalFeature.attributes?.name || originalFeature.attributes?.title || "Track";
  const escapedName = `${name}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="TravelBase" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${escapedName}</name>${tracks}</trk>\n</gpx>`;
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-zA-Z0-9_-]/g, "_") || "track"}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function getOriginalLayerFeature(feature) {
  if (!feature?.layer || typeof feature.layer.queryFeatures !== "function") {
    return feature;
  }
  const objectIdField = feature.layer.objectIdField;
  const objectId = objectIdField && feature.attributes ? feature.attributes[objectIdField] : null;
  if (!objectId) {
    return feature;
  }
  try {
    const result = await feature.layer.queryFeatures({
      objectIds: [objectId],
      outFields: ["*"],
      returnGeometry: true,
      returnZ: true,
      returnM: true,
    });
    if (result.features && result.features.length) {
      const full = result.features[0];
      full.attributes = { ...feature.attributes, ...full.attributes };
      return full;
    }
  } catch (error) {
    console.warn("Failed to query full feature geometry:", error);
  }
  return feature;
}

export async function parseGPXFile(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  const tracks = Array.from(xml.getElementsByTagName("trk"));
  const features = [];

  tracks.forEach((track) => {
    const trackName = track.getElementsByTagName("name")[0]?.textContent || "Track";
    const segments = Array.from(track.getElementsByTagName("trkseg"));
    const paths = segments
      .map((seg) => {
        return Array.from(seg.getElementsByTagName("trkpt")).map((pt) => [parseFloat(pt.getAttribute("lon")), parseFloat(pt.getAttribute("lat"))]);
      })
      .filter((path) => path.length);

    if (paths.length) {
      features.push({
        geometry: {
          type: "polyline",
          paths,
          spatialReference: { wkid: 4326 },
        },
        properties: { name: trackName },
      });
    }
  });

  return features;
}
