const GeoJSONLayer = await $arcgis.import("@arcgis/core/layers/GeoJSONLayer.js");
import { downloadGPXForFeature } from "./utils.js";
import { editThis } from "./mapEdit.js";
import { setupLayerFilter } from "./mapFilter.js";
import { importDataFromFile } from "./mapEdit.js";

export async function setupMainLayers(viewElement, dbx, config) {
  const layers = [];

  for (const layerConfig of config.layers) {
    const path = `/${layerConfig.name}.geojson`;
    const response = await dbx.filesGetTemporaryLink({ path });

    const layer = new GeoJSONLayer({
      url: response.result.link,
      // source: geojson,
      title: layerConfig.name,
      id: layerConfig.name,
      editingEnabled: true,
      visible: layerConfig.visible || false,
      fields: layerConfig.fields,
      geometryType: layerConfig.geometryType,
      elevationInfo: { mode: "on-the-ground" },
    });

    if (layerConfig.renderer) {
      layer.renderer = buildRenderer(layerConfig);
    }

    layer.load().then(() => {
      layer.popupTemplate = setupPopupTemplate(layer);
    });

    layers.push(layer);
  }

  viewElement.map.addMany(layers);
}

export async function setupMainLayerList(viewElement, layerFilters, globalFilters, hasEdits) {
  const isThematicItem = (item) => {
    const id = (item.layer?.id || item.id || item.title || "").toString().toLowerCase();
    return id.startsWith("tl_");
  };

  const isSwissHikingItem = (item) => {
    const title = (item.layer?.title || item.title || "").toString().toLowerCase();
    const id = (item.layer?.id || item.id || item.sublayer?.id || item.sublayer?.name || item.sublayer?.title || "").toString().toLowerCase();
    const url = (item.layer?.url || "").toString().toLowerCase();
    return (
      title.includes("swisstopo") ||
      title.includes("hiking trails") ||
      id.includes("swisstlm3d-wanderwege") ||
      id.includes("swisstopo") ||
      id.includes("tl_swisstopo_hiking_trails") ||
      id.includes("tl_hiking_trails") ||
      url.includes("wms.geo.admin.ch") ||
      url.includes("www.ogd.stadt-zuerich.ch") ||
      id.includes("tl_waterzurich") ||
      title.includes("water zurich") ||
      id.includes("TL_Brunnen") ||
      title.includes("Brunnen")
    );
  };

  const mainLayerListEl = document.getElementById("main-layers");
  mainLayerListEl.filterPredicate = (item) => {
    return !isThematicItem(item) && !isSwissHikingItem(item);
  };
  const toolsExpand = document.getElementById("tools-expand");
  const toolsTabs = document.getElementById("tools-tabs");
  const attributesTable = document.getElementById("attributes-table");
  const elevationProfile = document.getElementById("elevation-profile");

  mainLayerListEl.listItemCreatedFunction = async (event) => {
    const item = event.item;
    const container = document.createElement("layerDiv");

    await setupLayerFilter(item.layer, container, layerFilters, globalFilters);

    item.panel = {
      content: container,
      icon: "filter",
      open: false,
      // open: item.visible,
    };

    item.actionsSections = [
      [
        {
          id: "add-features",
          title: "Add features",
          icon: "plus",
        },
        {
          id: "add-from-file",
          title: "Add from file",
          icon: "file-gpx",
        },
        {
          id: "open-attributes",
          title: "Attribute table",
          icon: "table",
        },
        {
          id: "zoom-to-layer",
          title: "Zoom to layer",
          icon: "magnifying-glass-plus",
        },
      ],
    ];
  };

  mainLayerListEl.addEventListener("arcgisTriggerAction", async (event) => {
    const { action, item } = event.detail;
    const layer = item.layer;
    if (!layer) return;

    if (action.id === "add-features") {
      //  todo
      return;
    }
    if (action.id === "add-from-file") {
      importDataFromFile(hasEdits, layer);
      return;
    }
    if (action.id === "zoom-to-layer") {
      await layer.load();
      if (layer.fullExtent) {
        viewElement.goTo(layer.fullExtent.expand(1.2));
      }
      return;
    }
    if (action.id === "open-attributes") {
      if (!layer.type || !layer.fields) {
        console.warn("Layer has no attributes:", layer.title);
        return;
      }
      attributesTable.layer = layer;
      toolsExpand.expanded = true;
      toolsTabs.querySelector("calcite-tab-title:nth-child(3)").click();
      viewElement.addEventListener("arcgisViewChange", () => {
        attributesTable.filterGeometry = viewElement.extent;
      });

      attributesTable.actionColumnConfig = {
        label: "Go to feature",
        icon: "zoom-to-object",
        callback: (event) => viewElement.goTo(event.feature, { zoom: 12 }),
      };
    }
  });
}
export async function setupSearch(viewElement) {
  const searchComponent = document.querySelector("arcgis-search");
  if (!searchComponent || !viewElement?.map) return;

  const isSearchableLayer = (layer) => {
    const id = (layer.id || layer.title || "").toString().toLowerCase();
    if (id.startsWith("tl_")) {
      return false;
    }

    if (typeof layer.queryFeatures !== "function") {
      return false;
    }

    const fields = layer.fields;
    if (!fields || !fields.length) {
      return true;
    }

    return fields.some((field) => (field.name || "").toString().toLowerCase() === "name");
  };

  const layers = viewElement.map.allLayers.toArray().filter(isSearchableLayer);

  searchComponent.sources = layers.map((layer) => ({
    layer,
    searchFields: ["name"],
    displayField: "name",
    exactMatch: false,
    outFields: ["*"],
    name: layer.title || layer.id || "Layer",
    prefix: "%",
  }));
}
function setupPopupTemplate(layer) {
  const content = [];
  const fields = layer.fields || [];
  const fieldNames = fields.map((field) => field.name.toLowerCase());

  if (fieldNames.includes("img")) {
    content.push({
      type: "text",
      text: "<div style='margin-bottom:0.75rem'><img src='{img}' style='max-width:100%;height:auto;display:block;' onerror=\"this.style.display='none'\" /></div>",
    });
  }
  if (fieldNames.includes("link")) {
    content.push({
      type: "text",
      text: "<div style='margin-bottom:0.75rem'><a href='{link}' target='_blank' rel='noopener noreferrer'>{link}</a></div>",
    });
  }

  const exclude = ["name", "title", "img", "link", "objectid"];

  const fieldInfos = (layer.fields || []).filter((field) => !exclude.includes(field.name.toLowerCase())).map((field) => ({ fieldName: field.name, label: field.alias || field.name }));

  if (fieldInfos.length) {
    content.push({
      type: "fields",
      fieldInfos,
    });
  }

  return {
    title: "{name}",
    content,
  };
}

export async function setupPopup(viewElement) {
  const popupComponent = document.querySelector("arcgis-popup");
  let currentPopupFeature = null;

  viewElement.addEventListener("arcgisViewClick", async (event) => {
    const view = viewElement.view;
    const screenPoint = event.detail?.screenPoint || { x: event.detail?.x, y: event.detail?.y };
    const mapPoint = event.detail?.mapPoint;
    window.currentPopupLocation = mapPoint;
    const hit = await view.hitTest(screenPoint);

    const result = hit?.results?.find((r) => r.graphic && r.graphic.attributes);
    if (!result) {
      popupComponent.clear();
      return;
    }

    let feature = result.graphic;
    currentPopupFeature = feature;
    showPopupForFeature(feature, mapPoint);
  });

  popupComponent.addEventListener("arcgisTriggerAction", (event) => {
    const actionId = event.detail?.action?.id;
    if (!currentPopupFeature) {
      return;
    }
    if (actionId === "edit-feature") {
      editThis();
      return;
    }
    if (actionId === "download-gpx") {
      downloadGPXForFeature(currentPopupFeature);
      return;
    }
    if (actionId === "show-profile") {
      const elevationProfile = document.querySelector("arcgis-elevation-profile");
      elevationProfile.geometry = currentPopupFeature.geometry;
      //   toggleDetailWidget(elevationProfile);
      return;
    }
    if (actionId === "share-feature") {
      const ft = currentPopupFeature.geometry;
      const pt = ft.type === "point" ? ft : ft.extent.center;
      const shareUrl = `https://www.google.com/maps/search/?api=1&query=${pt.latitude},${pt.longitude}`;
      if (shareUrl) window.open(shareUrl, "_blank");
    }
  });

  function showPopupForFeature(feature, mapPoint) {
    if (!feature) {
      popupComponent.clear();
      return;
    }
    const layer = feature.layer;
    const attributes = feature.attributes || {};
    const template = layer?.popupTemplate;
    const isLine = feature.geometry?.type === "polyline";
    const actions = [
      { id: "edit-feature", icon: "pencil" },
      ...(isLine
        ? [
            { id: "show-profile", icon: "altitude" },
            { id: "download-gpx", icon: "download" },
          ]
        : []),
      { id: "share-feature", icon: "share" },
    ];

    popupComponent.clear();
    popupComponent.location = mapPoint;
    popupComponent.heading = attributes.name;
    popupComponent.content = template?.content;
    popupComponent.actions = actions;
    popupComponent.open = true;
  }
}

function buildRenderer(layerConfig) {
  const r = layerConfig.renderer;

  if (r.type === "simple") {
    return {
      type: "simple",
      symbol: buildSymbol(layerConfig.geometryType, r.color, r.style),
    };
  }

  if (r.type === "unique-value") {
    return {
      type: "unique-value",
      field: r.field,
      uniqueValueInfos: r.uniqueValueInfos.map((info) => ({
        value: info.value,
        symbol: buildSymbol(layerConfig.geometryType, info.color, r.style),
      })),
    };
  }
}
function buildSymbol(geometryType, color, style) {
  // ======================
  // POINT WITH HALO
  // ======================
  if (geometryType === "point" && style === "point-halo") {
    return {
      type: "point-3d",
      symbolLayers: [
        // halo
        {
          type: "icon",
          resource: { primitive: "circle" },
          size: 8,
          material: { color: [...color.slice(0, 3), 0.2] },
        },
        // core
        {
          type: "icon",
          resource: { primitive: "circle" },
          size: 3,
          material: { color },
        },
      ],
    };
  }

  // ======================
  // DASHED LINE
  // ======================
  if (geometryType === "polyline" && style === "line-dashed") {
    return {
      type: "line-3d",
      symbolLayers: [
        {
          type: "line",
          size: 2,
          material: { color },
        },
      ],
    };
  }

  // ======================
  // WIDE LINE
  // ======================
  if (geometryType === "polyline" && style === "line-wide") {
    return {
      type: "line-3d",
      symbolLayers: [
        {
          type: "line",
          size: 4,
          material: { color },
        },
      ],
    };
  }

  return null;
}
