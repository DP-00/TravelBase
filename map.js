import {getBasemaps} from "./basemap.js";
import {loadDropbox} from "./files.js";
import {loadDropboxToken} from "./files.js";
import {loadFiles} from "./files.js";
import {listLayers} from "./files.js";



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
    // let dropboxToken = await loadDropboxToken();
    // let dropbox = await loadDropbox();
    const local = "";
    
    const dataSource = local; // "" - local | await loadDropboxToken() | await loadDropbox()
    console.log(dataSource);
    map.addLayer(getBasemaps(map));
    const config = await loadFiles(dataSource); // if empty, then local files
    console.log(config);
    console.log(await listLayers(map, config.layers, dataSource));
}

const data = "data/POIAll.geojson";

// map.addLayer(new ol.layer.Vector(
//     {	
//         name: "test data",
//         source: new ol.source.Vector({	
//             url: data,
//             format: new ol.format.GeoJSON()
//         }),
//         zIndex: 5,
// }));

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

// POP-UP

let popup = new ol.Overlay.Popup();
map.addOverlay(popup);

map.on('click', function(evt) {

    const feature = map.forEachFeatureAtPixel(evt.pixel, function (feature) {
        return feature;
    });

    if(feature){

        let popContent='';
        Object.keys(feature.getProperties()).forEach(key => {

            if(key != "geometry" & key != "name" & key != "img" & key != "trips"){
                popContent += '<p><b>' + key +'</b>:  '+feature.get(key)+ '</p>';
            }         
        });

        const prettyCoord = ol.coordinate.toStringHDMS(ol.proj.transform(evt.coordinate, 'EPSG:3857', 'EPSG:4326'), 2);
        let popupContent = `<div><h2>${feature.get("name")}</h2>${popContent}<p><i>${prettyCoord}</i></p><img src=${feature.get("img")} alt=""></div>`
        popup.show(evt.coordinate, popupContent);
    }
});
