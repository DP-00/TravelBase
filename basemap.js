const layerOSM = new ol.layer.Tile({
    source: new ol.source.OSM({crossOrigin: 'anonymous',}),
    name: 'OSM',
    visible: true,
    crossOrigin: 'anonymous',
});

const layerStamenTerrain = new ol.layer.Tile({
    source: new ol.source.Stamen({
        layer: 'terrain',
        crossOrigin: 'anonymous',
    }),
    name: 'Terrain',
    visible: false,
    
});

const layerEsri = new ol.layer.Tile({
    source: new ol.source.XYZ({
        attributions:
        'Tiles © <a href="https://services.arcgisonline.com/ArcGIS/' +
        'rest/services/World_Topo_Map/MapServer">ArcGIS</a>',
        url:
        'https://server.arcgisonline.com/ArcGIS/rest/services/' +
        'World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        crossOrigin: 'anonymous',
    }),
    name: 'ESRI Topo',
    visible: false,
});

const MapboxKey = 'pk.eyJ1IjoiZHAtMDAiLCJhIjoiY2xiOGoyNjh4MDlnZTNwcG04NWRvZmUyYyJ9.OZmfb1TF88Bvs6cxtFr18Q';

const layerMapboxLight =new ol.layer.Tile({
source: new ol.source.TileJSON({
    url:
    'https://api.tiles.mapbox.com/v4/mapbox.world-light.json?secure&access_token=' +
    MapboxKey,
    crossOrigin: 'anonymous',
    
}),
name: 'Mapbox Light',
visible: false,
});

const layerMapboxDark = new ol.layer.Tile({
source: new ol.source.TileJSON({
    url:
    'https://api.tiles.mapbox.com/v4/mapbox.world-black.json?secure&access_token=' +
    MapboxKey,
    crossOrigin: 'anonymous',
    
}),
name: 'Mapbox Dark',
visible: true,
});

const layerMapboxSatellite = new ol.layer.Tile({
    source: new ol.source.TileJSON({
        url:
        'https://api.tiles.mapbox.com/v4/mapbox.satellite.json?secure&access_token=' +
        MapboxKey,
        crossOrigin: 'anonymous',
    }),
    name: 'Mapbox Satellite',
    visible: false,
});
    
const layerBaseMaps = new ol.layer.Group({
    layers: [layerOSM, layerStamenTerrain, layerEsri, layerMapboxDark, layerMapboxLight, layerMapboxSatellite],
    name: 'Basemaps'
});

const basemapContent = document.getElementById('basemap-container').querySelector("div");

export function getBasemaps(map){ 
    
    let basemaps = layerBaseMaps.getLayers().getArray()
    basemaps.forEach(basemap => {
        basemapIcon(map, basemap);
    });

    return layerBaseMaps;
}

function basemapIcon(map, basemap){
    let basemapId = basemap.get("name").replace(" ", "-")

    // adding a box for icon with class name and unique id
    const basemapDiv = document.createElement("div");
    basemapDiv.id = basemapId;
    basemapDiv.className = 'basemap';
    basemapContent.appendChild(basemapDiv);

    const inputElem = document.createElement("input");
    inputElem.type = "checkbox";
    inputElem.id = basemapId+"checkbox";
    inputElem.className = 'basemap-checkbox';
    inputElem.title = "display";
    basemapDiv.appendChild(inputElem);
    inputElem.checked = basemap.getVisible()

    // adding a label for a checkbox with unique id
    const inputLabel = document.createElement("label");
    inputLabel.id = basemapId+"label";
    inputLabel.htmlFor = basemapId+"checkbox";
    basemapDiv.appendChild(inputLabel);


    // adding a preview to each box 
    const imgElem = document.createElement("img");
    imgElem.src = basemap.getPreview(map.getView().getCenter());
    inputLabel.appendChild(imgElem);


    // adding title to each box
    const layerElem = document.createElement("p");
    layerElem.innerText = basemap.get("name") ? basemap.get("name"): basemap.get("title");

    basemapDiv.appendChild(layerElem);

}			