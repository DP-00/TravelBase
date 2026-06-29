const Graphic = await $arcgis.import("@arcgis/core/Graphic.js");
const reactiveUtils = await $arcgis.import("@arcgis/core/core/reactiveUtils.js");
const { whenOnce } = await $arcgis.import("@arcgis/core/core/reactiveUtils.js");
const projectOperator = await $arcgis.import("@arcgis/core/geometry/operators/projectOperator.js");
import { parseGPXFile } from "./utils.js";

const editorComponent = document.querySelector("arcgis-editor");
const popupComponent = document.querySelector("arcgis-popup");
const toolsExpand = document.getElementById("tools-expand");
const toolsTabs = document.getElementById("tools-tabs");

export async function editThis() {
  if (editorComponent.activeWorkflow) return;
  toolsExpand.expanded = true;
  toolsTabs.querySelector("calcite-tab-title:nth-child(1)").click();

  try {
    await editorComponent.startUpdateWorkflowAtFeatureEdit(popupComponent.selectedFeature);
    await whenOnce(() => !editorComponent.activeWorkflow);
    popupComponent.open = false;
    toolsExpand.expanded = false;
  } catch (e) {
    alert(e?.message || e);
  }
}

// IMPORT FILES
let __objectIdCounter = Date.now();

const fileImportInput = document.getElementById("file-import-input");

export async function importDataFromFile(hasEdits, layer) {
  fileImportInput.click();
  fileImportInput.addEventListener("change", async function (event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    await layer.load();

    let allGraphics = [];

    for (const file of files) {
      const text = await file.text();
      const name = file.name.toLowerCase();

      let features = [];

      try {
        if (name.endsWith(".gpx")) {
          const gpx = await parseGPXFile(text);

          features = gpx.map(function (f) {
            return {
              geometry: {
                type: "polyline",
                paths: f.geometry.paths,
                spatialReference: { wkid: 4326 },
              },
              properties: f.properties || {},
            };
          });
        } else {
          const geojson = JSON.parse(text);

          features = (geojson.features || [])
            .map(function (f) {
              if (!f.geometry) return null;

              const type = f.geometry.type;
              const coords = f.geometry.coordinates;

              if (type === "Point") {
                return {
                  geometry: {
                    type: "point",
                    longitude: coords[0],
                    latitude: coords[1],
                    spatialReference: { wkid: 4326 },
                  },
                  properties: f.properties || {},
                };
              }

              if (type === "LineString") {
                return {
                  geometry: {
                    type: "polyline",
                    paths: [coords],
                    spatialReference: { wkid: 4326 },
                  },
                  properties: f.properties || {},
                };
              }

              if (type === "MultiLineString") {
                return {
                  geometry: {
                    type: "polyline",
                    paths: coords,
                    spatialReference: { wkid: 4326 },
                  },
                  properties: f.properties || {},
                };
              }

              return null;
            })
            .filter(Boolean);
        }
      } catch (err) {
        console.error("Parsing failed:", file.name, err);
        continue;
      }

      features = features.filter(function (f) {
        if (layer.geometryType === "polyline" && f.geometry.type === "polyline") return true;
        if (layer.geometryType === "point" && f.geometry.type === "point") return true;
        return false;
      });

      const graphics = features.map(function (feature) {
        const attributes = {
          ObjectID: __objectIdCounter++, // ✅ CRITICAL
          name: feature.properties?.name || file.name,
        };

        return new Graphic({
          geometry: feature.geometry,
          attributes: attributes,
        });
      });

      allGraphics.push.apply(allGraphics, graphics);
    }

    if (!allGraphics.length) {
      console.warn("No valid features for this layer type:", layer.geometryType);
      return;
    }

    const result = await layer.applyEdits({
      addFeatures: allGraphics,
    });

    console.log("applyEdits:", result);
    viewElement.goTo(allGraphics);

    hasEdits = true;
  });
}
