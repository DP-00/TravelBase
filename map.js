import {getBasemaps} from "./basemap.js";
import {loadFiles} from "./files.js";

const infoContainer = document.getElementById("info-container");
const buttonContainer = document.getElementById("button-container");

const layerOSM = new ol.layer.Tile({
    source: new ol.source.OSM({crossOrigin: 'anonymous',}),
    name: 'OSM',
    visible: true,
});

const map = new ol.Map({
    target: 'map',
    view: new ol.View({
        center: ol.proj.fromLonLat([8, 47]),
        zoom: 6
    })
});
loadApp();
async function loadApp(){
    map.addLayer(getBasemaps(map));
    console.log(await loadFiles("local"));
}

const data = "data/POIAll.geojson";

map.addLayer(new ol.layer.Vector(
    {	
        name: "test data",
        source: new ol.source.Vector({	
            url: data,
            format: new ol.format.GeoJSON()
        }),
        zIndex: 5,
}));

buttonContainer.addEventListener("change", (event) => {

    let content = document.getElementById( event.target.value + "-container");

    if (content.style.display==='block'){
        infoContainer.style.display='none';
        content.style.display='none';
    } else{  
        infoContainer.style.display='block';
    
        for (let i=0; i < infoContainer.children.length; ++i){
            infoContainer.children[i].style.display='none';
        }
        content.style.display='block';
    }   
});

