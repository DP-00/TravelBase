import {getBasemaps} from "./basemap.js";
import {loadDropbox} from "./files.js";
import {loadDropboxToken} from "./files.js";
import {loadFiles} from "./files.js";
import {listLayers} from "./files.js";



const infoContainer = document.getElementById("info-container");
const buttonContainer = document.getElementById("button-container");

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
    await listLayers(map, config.layers, dataSource);

    let layerList = await map.getLayers().getArray();

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


    // MAP WIDGETS

    const bm = new ol.control.GeoBookmark({	
        marks:{World: {pos:ol.proj.transform([0,0], 'EPSG:4326', 'EPSG:3857'), zoom:1, permanent: true },
        Europe: {pos:ol.proj.transform([8,42], 'EPSG:4326', 'EPSG:3857'), zoom:5, permanent: true }}
    });
    map.addControl(bm);

    const scale = new ol.control.ScaleLine({})
    map.addControl(scale);

    const searchPhoton = new ol.control.SearchPhoton({    
        lang:"en",		
        reverse: true,
        position: true	// Search, with priority to geo position
    });
    map.addControl (searchPhoton);  
    searchPhoton.on('select', function(e) {		
        console.log("select photon")
        map.getView().animate({		
            center:e.coordinate,
            zoom: Math.max (map.getView().getZoom(), 12)
        });
    });

    const searchSource = new ol.source.Vector({
        features: []
    });
    layerList.forEach(layer => {
        console.log(layer)
        if(layer.get("name") != "Basemaps"){
            layer.getSource().on("addfeature", function (e) {
                // e.feature.set("featureType", "country");
                searchSource.addFeature(e.feature);
            });  
        }

    });
    let search = new ol.control.SearchFeature({	
        source: searchSource,
    });
    map.addControl (search);

    let select = new ol.interaction.Select({});
	map.addInteraction(select);
    search.on('select', function(e)
    {	select.getFeatures().clear();
        select.getFeatures().push (e.search);
        let p = e.search.getGeometry().getFirstCoordinate();
        map.getView().animate({ center:p, zoom: Math.max (map.getView().getZoom(), 12)  });
    });
}



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


