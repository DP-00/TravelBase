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

            let profile = (feature.getGeometry() instanceof ol.geom.LineString)?"<button id='showProfile' class='profile-button'><img src='icons/panel.png'></button>":"";

            const prettyCoord = ol.coordinate.toStringHDMS(ol.proj.transform(evt.coordinate, 'EPSG:3857', 'EPSG:4326'), 2);
            let popupContent = `<div><h2>${feature.get("name")}</h2>${popContent}<p><i>${prettyCoord}</i></p><img src=${feature.get("img")} alt="">${profile}</div>`;
            popup.show(evt.coordinate, popupContent);

            if(feature.getGeometry() instanceof ol.geom.LineString){
                document.getElementById('showProfile').onclick = function() {

                    let isProfile = 0;
                    map.getControls().forEach(function(control) {
                        if (control instanceof ol.control.Profil) {
                            // map.removeControl(control);
                            deleteProfile(layerList);
                            isProfile = 1;
                        }
                    }, this);

                    if(!isProfile){ createProfile(feature);}        
               }
            }

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

function deleteProfile(layerList){
    map.getControls().forEach(function(control) {
        if (control instanceof ol.control.Profil) {
            map.removeControl(control);
        }
    }, this);

    for (var j = 0; j<layerList.length; j++){               
        if (layerList[j].get("name") == "profile-temp") {						  
            map.removeLayer(layerList[j]);
        }
    }
}

function createProfile(feature){

    var profil = new ol.control.Profil({
        width: 600,
        height: 300,
    });
    profil.toggle();
    map.addControl(profil);

    var source = new ol.source.Vector({});
    var vector = new ol.layer.Vector({
        source: source,
        name: "profile-temp",
    });
    map.addLayer(vector);

    var pt;            

    profil.setGeometry(feature);
        pt = new ol.Feature(new ol.geom.Point([0,0]));
        pt.setStyle([]);
        source.addFeature(pt);

    const iconStyle = new ol.style.Style({
        image: new ol.style.Icon({
            anchor: [0.5, 60],
            anchorXUnits: 'fraction',
            anchorYUnits: 'pixels',
            src: 'icons/hiker.png',
        }),
    });

    // Draw a point on the map when mouse fly over profil
    function drawPoint(e) {
        if (!pt) return;
        if (e.type=="over"){
            pt.setGeometry(new ol.geom.Point(e.coord));
            pt.setStyle(iconStyle);
        } else {
            pt.setStyle([]);
        }
    };

    // Show a popup on over
    profil.on(["over","out"], function(e) {
        if (e.type=="over") profil.popup(e.coord[2]+" m");
        drawPoint(e);
    });

    // Show on map over
    var hover = new ol.interaction.Hover({ cursor: "pointer", hitTolerance:10 });
    map.addInteraction(hover);
    const profileButton = document.querySelector(".ol-profil").querySelector("button")

    profileButton.addEventListener("click", () => {

        if(profil.isShown())
        {
            console.log("shown");
            map.addInteraction(hover);
        }else{
            console.log("hidden");
            map.removeInteraction(hover);
        }

    });

    hover.on("hover", function(e) {
        // Point on the line
        var c = feature.getGeometry().getClosestPoint(e.coordinate)
        drawPoint({ type: "over", coord: c });
        // Show profil
        var p = profil.showAt(e.coordinate);
        profil.popup(p[2]+" m");
    
    });
    hover.on("leave", function(e) {
        profil.popup();
        profil.showAt();    
        drawPoint({});
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


