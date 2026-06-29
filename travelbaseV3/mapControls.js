const Bookmark = await $arcgis.import("@arcgis/core/webmap/Bookmark.js");
const Graphic = await $arcgis.import("@arcgis/core/Graphic.js");
const Point = await $arcgis.import("@arcgis/core/geometry/Point.js");
const Portal = await $arcgis.import("@arcgis/core/portal/Portal.js");
const Basemap = await $arcgis.import("@arcgis/core/Basemap.js");
const VectorTileLayer = await $arcgis.import("@arcgis/core/layers/VectorTileLayer.js");
const TileLayer = await $arcgis.import("@arcgis/core/layers/TileLayer.js");
const ImageryTileLayer = await $arcgis.import("@arcgis/core/layers/ImageryTileLayer.js");
const ImageryLayer = await $arcgis.import("@arcgis/core/layers/ImageryLayer.js");
const LocalBasemapsSource = await $arcgis.import("@arcgis/core/widgets/BasemapGallery/support/LocalBasemapsSource.js");
const WebTileLayer = await $arcgis.import("@arcgis/core/layers/WebTileLayer.js");
const WMSLayer = await $arcgis.import("@arcgis/core/layers/WMSLayer.js");
const WMTSLayer = await $arcgis.import("@arcgis/core/layers/WMTSLayer.js");
const FeatureLayer = await $arcgis.import("@arcgis/core/layers/FeatureLayer.js");
const rasterFunctionUtils = await $arcgis.import("@arcgis/core/layers/support/rasterFunctionUtils.js");

export function setupBookmarks() {
  const bookmarksElement = document.querySelector("arcgis-bookmarks");
  bookmarksElement.bookmarks = [
    new Bookmark({
      name: "World",
      viewpoint: {
        targetGeometry: {
          type: "extent",
          spatialReference: {
            wkid: 4326, // WGS 84
          },
          xmin: -180,
          ymin: -90,
          xmax: 180,
          ymax: 90,
        },
      },
    }),
    new Bookmark({
      name: "Europe",
      viewpoint: {
        targetGeometry: {
          type: "extent",
          spatialReference: {
            wkid: 4326, // WGS 84
          },
          xmin: -25,
          ymin: 34,
          xmax: 45,
          ymax: 72,
        },
      },
    }),
    new Bookmark({
      name: "Switzerland",
      viewpoint: {
        targetGeometry: {
          type: "extent",
          spatialReference: {
            wkid: 4326, // WGS 84
          },
          xmin: 5.8,
          ymin: 45.8,
          xmax: 10.7,
          ymax: 47.9,
        },
      },
    }),
  ];
}
export function setupBasemaps() {
  const standardBasemaps = [Basemap.fromId("dark-gray"), Basemap.fromId("osm"), Basemap.fromId("osm-3d"), Basemap.fromId("topo"), Basemap.fromId("topo-3d"), Basemap.fromId("oceans"), Basemap.fromId("hybrid"), Basemap.fromId("satellite")];
  const customBasemaps = [
    new Basemap({
      baseLayers: [
        new TileLayer({
          portalItem: {
            id: "a66bfb7dd3b14228bf7ba42b138fe2ea",
          },
        }),
      ],
      title: "Dark Imagery",
      id: "firefly",
    }),
    new Basemap({
      baseLayers: [
        new TileLayer({
          portalItem: {
            id: "a8588e0401e246469260f03ee44d69f1",
          },
        }),
      ],
      title: "Vintage Shaded Relief ",
      id: "vintage",
    }),
    new Basemap({
      title: "Outline",
      baseLayers: [
        new VectorTileLayer({
          portalItem: {
            id: "ba99a4a4f5ce48debbeca6713e051f1e",
          },
        }),
      ],
    }),
    new Basemap({
      title: "Blueprint",
      baseLayers: [
        new VectorTileLayer({
          portalItem: {
            id: "b426a8073b8c4a418d1b73ecbc40a0c2",
          },
        }),
      ],
    }),
    new Basemap({
      title: "World Hillshade",
      baseLayers: [
        new TileLayer({
          portalItem: {
            id: "1b243539f4514b6ba35e7d995890db1d",
          },
        }),
      ],
    }),
    new Basemap({
      title: "World Hillshade (Dark)",
      baseLayers: [
        new TileLayer({
          portalItem: {
            id: "428539ef9cab4017b69d15a40a9ee98b",
          },
        }),
      ],
    }),
    new Basemap({
      title: "Plain Elevation",
      baseLayers: [
        new ImageryTileLayer({
          url: "https://elevation3d.arcgis.com/arcgis/rest/services/" + "WorldElevation3D/Terrain3D/ImageServer",
        }),
      ],
    }),
  ];
  customBasemaps.forEach((basemap) => {
    const layer = basemap.baseLayers.getItemAt(0);
    layer?.load?.().then(() => {
      const thumb = layer?.portalItem?.thumbnailUrl;
      if (thumb) basemap.thumbnailUrl = thumb;
    });
  });
  const webBasemapIds = [
    "d3b04b4e7a844d1e85ce07a67a6d8f86", // OSM with relief
    "539985c0e9c743b39aaeb280654ba4b0", // OSM topographic
    "7378ae8b471940cb9f9d114b67cd09b8", // World Basemap (Vector)
    "2e8a3ccdfd6d42a995b79812b3b0ebc6", // Outdoor
    "a69f14ea2e784e019f4a4b6835ffd376", // Environment
    "f33a34de3a294590ab48f246e99958c9", // National Geographic
    "21812b28afea4091bc57472297aa73d4", // Watercolour
    "826498a48bd0424f9c9315214f2165d4", // Colored Pencil
    "f35ef07c9ed24020aadd65c8a65d3754", // Modern Antique
    "75a3ce8990674a5ebd5b9ab66bdab893", // Newspaper
    "8d91bd39e873417ea21673e0fee87604", // Nova
    "d92d38b812da4a0884e47e68c57ac451", // Earth at night
  ];
  const portal = new Portal({
    url: "https://www.arcgis.com",
  });
  const webBasemaps = webBasemapIds.map(
    (id) =>
      new Basemap({
        portalItem: {
          id,
          portal,
        },
      }),
  );
  const allBasemaps = [...standardBasemaps, ...customBasemaps, ...webBasemaps];
  document.querySelector("arcgis-basemap-gallery").source = new LocalBasemapsSource({
    basemaps: allBasemaps,
  });
}
export function setupThematicLayers(viewElement) {
  const footprintLayer = new TileLayer({
    portalItem: {
      id: "cfe002c152204bd8b6e392f3f39f2878",
    },
    id: "TL_Human_Footprint",
    title: "Human Footprint",
    visible: false,
  });
  const canopyLayer = new ImageryTileLayer({
    portalItem: {
      id: "2a3dfb00c2c6425f85bd70da420d58eb",
    },
    id: "TL_Forest_Canopy_Height",
    title: "Forest Canopy Height",
    visible: false,
  });
  const biointactnessLayer = new ImageryTileLayer({
    portalItem: {
      id: "25543641e4ce461baa2b7863dc0f80b7",
    },
    id: "TL_Biodiversity_Intactness",
    title: "Biodiversity Intactness",
    visible: false,
  });
  const landCoverLayer = new ImageryLayer({
    url: "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer",
    id: "TL_Land_Cover",
    title: "Land Cover",
    visible: false,
  });
  const ecosystemLayer = new ImageryLayer({
    portalItem: {
      id: "926a206393ec40a590d8caf29ae9a93e",
    },
    id: "TL_Ecosystems",
    title: "Ecosystems",
    visible: false,
  });
  const ndviLayer = new ImageryLayer({
    portalItem: {
      id: "f6bb66f1c11e467f9a9a859343e27cf8",
    },
    id: "TL_NDVI",
    title: "NDVI",
    visible: false,
  });

  const swissParksLayer = new FeatureLayer({
    portalItem: {
      id: "40e8a5d24b02474b901b35870d0101b5",
    },
    id: "TL_Swiss_National_Parks",
    title: "Swiss National Parks",
    visible: false,
  });
  const protectedAreasLayer = new VectorTileLayer({
    id: "TL_Protected_Areas",
    title: "Protected areas",
    opacity: 0.7,
    visible: false,
    style: {
      layers: [
        {
          id: "WDPA_poly_Latest",
          type: "fill",
          source: "WDPA_World_Database_of_Protected_Areas_VTS",
          "source-layer": "WDPA_poly_Latest",
          layout: {},
          paint: {
            "fill-color": "#71a970",
            "fill-outline-color": "#3d5c3d",
          },
        },
      ],
      glyphs: "https://basemaps.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer/resources/fonts/{fontstack}/{range}.pbf",
      version: 8,
      sprite: "https://www.arcgis.com/sharing/rest/content/items/7675d44bb1e4428aa2c30a9b68f97822/resources/sprites/sprite",
      sources: {
        WDPA_World_Database_of_Protected_Areas_VTS: {
          url: "https://vectortileservices5.arcgis.com/Mj0hjvkNtV7NRhA7/arcgis/rest/services/WDPA_World_Database_of_Protected_Areas_VTS/VectorTileServer",
          type: "vector",
        },
      },
    },
  });

  const swissTopo = new WebTileLayer({
    urlTemplate: "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg",
    id: "TL_swisstopo",
    title: "swisstopo",

    visible: false,
  });

  // only in LV95, so not usable
  // const snowLayer = new WMSLayer({
  //   url: "https://wms.geo.admin.ch/",
  //   sublayers: [
  //     {
  //       name: "ch.slf.snowdepth",
  //       title: "CH Snow depth",
  //       id: "TL_snowdepth",
  //     },
  //     {
  //       name: "ch.slf.snowdepth-latest",
  //       title: "CH Snow depth (latest)",
  //       id: "TL_snowdepth_latest",
  //     },
  //   ],
  //   id: "TL_swisstopo",
  //   title: "swisstopo",

  //   visible: false,
  // });

  const swissTopoHikingLayer = new WMSLayer({
    url: "https://wms.geo.admin.ch/",
    id: "TL_swisstopo_Hiking_Trails",
    title: "swisstopo Hiking Trails",
    sublayers: [
      {
        name: "ch.swisstopo.swisstlm3d-wanderwege",
        // ch.bafu.wildruhezonen
        // ch.bafu.bundesinventare-vogelreservate
        title: "Hiking trails",
        id: "TL_Hiking_Trails",
      },
    ],
    opacity: 0.9,
    visible: false,
  });
  const iNaturalistLayer = new FeatureLayer({
    portalItem: {
      id: "99e3e9ccfaec422db6d4266569aa19d7",
    },
    id: "TL_iNaturalist",
    title: "iNaturalist",
    visible: false,
    definitionExpression: `taxon_category_name IN ('Mammalia', 'Aves', 'Reptilia', 'Amphibia')`,
  });

  const slope = rasterFunctionUtils.slope({
    slopeType: "degree",
    zFactor: 1,
  });
  const remapSlope = rasterFunctionUtils.remap({
    rangeMaps: [
      {
        range: [30, 35],
        output: 30,
      },
      {
        range: [35, 40],
        output: 35,
      },
      {
        range: [40, 45],
        output: 40,
      },
      {
        range: [45, 90],
        output: 45,
      },
    ],
    outputPixelType: "u8",
    raster: slope,
  });
  const colorMapSlope = rasterFunctionUtils.colormap({
    colormap: [
      [30, 255, 255, 0],
      [35, 255, 165, 0],
      [40, 255, 0, 0],
      [45, 128, 0, 128],
    ],
    raster: remapSlope,
  });
  const slopeLayer = new ImageryTileLayer({
    url: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer",
    id: "TL_Slope",
    title: "Slope (°)",
    rasterFunction: colorMapSlope,
    visible: false,
  });
  const DEMLayer = new ImageryTileLayer({
    url: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer",
    id: "TL_Elevation",
    title: "Elevation (m a.s.l.)",
    rasterFunction: rasterFunctionUtils.colormap({
      colorRampName: "elevation1",
    }),
    opacity: 0.7,
    visible: false,
  });

  //     .queryFeatures({
  // outFields: ["*"],
  // where: "1=1",
  // returnGeometry: true,
  // outSpatialReference: {
  //   wkid: 4326,
  // }

  const transportLayer = new FeatureLayer({
    portalItem: {
      id: "bd16f5a9ce574a14b5a68b65397b466e",
    },
    id: "TL_Transport_Stops",
    title: "Transport stops",
    visible: false,
  });
  const openRailwayMap = new WebTileLayer({
    urlTemplate: "https://tiles.openrailwaymap.org/standard/{level}/{col}/{row}.png",
    id: "TL_OpenRailwayMap",
    title: "OpenRailwayMap",
    attribution: "© OpenStreetMap contributors | OpenRailwayMap (CC-BY-SA 2.0)",
    visible: false,
  });

  const fountainsZurich = new WMSLayer({
    url: "https://www.ogd.stadt-zuerich.ch/wms/geoportal/Brunnen",
    id: "TL_WaterZurich",
    title: "Water Zurich",
    visible: false,
    sublayers: [
      {
        title: "Water Zurich",
        name: "Brunnen",
        id: "TL_Brunnen",
      },
    ],
  });

  // const toilets = new GeoJSONLayer({
  //   url: "https://overpass-api.de/api/interpreter?data=%5Bout:json%5D%5Btimeout:25%5D;(node%5B%22amenity%22=%22toilets%22%5D(45.8,5.9,47.9,10.5);way%5B%22amenity%22=%22toilets%22%5D(45.8,5.9,47.9,10.5););out%20center;&format=geojson",
  //   title: "Public toilets (OSM)",
  // });
  viewElement.map.addMany([
    // toilets,
    fountainsZurich,
    openRailwayMap,
    transportLayer,
    swissTopo,
    canopyLayer,
    biointactnessLayer,
    landCoverLayer,
    ecosystemLayer,
    ndviLayer,
    swissParksLayer,
    protectedAreasLayer,
    swissTopoHikingLayer,
    slopeLayer,
    DEMLayer,
    iNaturalistLayer,
  ]);
}
export function setupThematicLayerList(viewElement) {
  const isThematicItem = (item) => {
    const id = (item.layer?.id || item.id || item.title || "").toString().toLowerCase();
    return id.startsWith("tl_");
  };

  const thematicLayerListEl = document.getElementById("thematic-layers");
  thematicLayerListEl.filterPredicate = (item) => {
    return isThematicItem(item);
  };

  thematicLayerListEl.listItemCreatedFunction = (event) => {
    const item = event.item;
    if (item.layer?.legendEnabled) {
      item.panel = {
        content: "legend",
        open: false,
      };
    }

    item.actionsSections = [
      [
        {
          id: "zoom-to-layer",
          title: "Zoom to layer",
          icon: "magnifying-glass-plus",
        },
      ],
    ];
  };
  thematicLayerListEl.addEventListener("arcgisTriggerAction", async (event) => {
    const { action, item } = event.detail;
    if (action.id !== "zoom-to-layer") return;
    const layer = item.layer;
    await layer.load();
    if (layer.fullExtent) {
      viewElement.goTo(layer.fullExtent.expand(1.2));
    }
  });
}
