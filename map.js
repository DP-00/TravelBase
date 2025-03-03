import { getBasemaps } from "./basemap.js";
// import {loadDropbox} from "./files.js";
// import {loadDropboxToken} from "./files.js";
import { loadFiles } from "./files.js";
import { listLayers } from "./files.js";
import { layerMenu } from "./layers.js";
import { addData, listPropertiesByLayer } from "./add.js";

const infoContainer = document.getElementById("info-container");
const buttonContainer = document.getElementById("button-container");
const map = new ol.Map({
  target: "map",
  view: new ol.View({
    center: ol.proj.fromLonLat([8, 47]),
    zoom: 6,
  }),
});

loadApp();
async function loadApp() {
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
  const specialLayers = ["Basemaps", "TripTemp", "profile-temp"];

  layerMenu(map, layerList);
  addData(map, config, layerList);

  // POP-UP

  let popup = new ol.Overlay.Popup();
  map.addOverlay(popup);

  map.on("click", function (evt) {
    const feature = map.forEachFeatureAtPixel(evt.pixel, function (feature) {
      return feature;
    });

    if (feature) {
      let popContent = "";
      Object.keys(feature.getProperties()).forEach((key) => {
        if ((key != "geometry") & (key != "name") & (key != "img") & (key != "trips")) {
          if (feature.get(key)) {
            popContent += "<p><b>" + key + "</b>:  " + feature.get(key) + "</p>";
          }
        }
      });

      let profile =
        feature.getGeometry() instanceof ol.geom.LineString
          ? "<button id='showProfile' class='profile-button'><img src='icons/panel.png'></button>"
          : "";

      const coord = ol.proj.transform(evt.coordinate, "EPSG:3857", "EPSG:4326");

      // const googleMap = `http://www.google.com/maps/place/${coord[1]},${coord[0]}`;
      const googleMap = `https://www.google.com/maps/dir/?api=1&destination=${coord[1]}%2C${coord[0]}&travelmode=transit`;

      let popupContent = `<div><h2>${feature.get(
        "name"
      )}</h2>${popContent}<p><a  target="_blank" href=${googleMap}>${ol.coordinate.toStringHDMS(coord, 2)}</a>
            </p><img src=${feature.get("img")} alt="">${profile}			
            <button id='popEdit' class='edit-button'><img src='icons/pencil.png'></button>
			<button id='popDelete' class='delete-button'><img src='icons/delete.png'></button>
            </div>`;
      popup.show(evt.coordinate, popupContent);

      document.getElementById("popEdit").onclick = function () {
        editPopup(feature, evt);
      };
      document.getElementById("popDelete").onclick = function () {
        deletePopup(feature);
      };

      if (feature.getGeometry() instanceof ol.geom.LineString) {
        document.getElementById("showProfile").onclick = function () {
          let isProfile = 0;
          map.getControls().forEach(function (control) {
            if (control instanceof ol.control.Profil) {
              // map.removeControl(control);
              deleteProfile(layerList);
              isProfile = 1;
            }
          }, this);

          if (!isProfile) {
            createProfile(feature);
          }
        };
      }
    }
  });

  function editPopup(feature, evt) {
    let content = "";

    layerList.forEach(function (layer) {
      if (!specialLayers.includes(layer.get("name"))) {
        let source = layer.getSource();
        if (source.hasFeature(feature)) {
          console.log(layer);
          const layerKeys = listPropertiesByLayer(layer.get("name"), config);

          for (const [key, value] of layerKeys) {
            let featureValue = feature.get(key) != undefined ? feature.get(key) : "";

            console.log(value);
            switch (value) {
              case "Charset":
                content += "<p><b>" + key + "</b>:  " + '<input value="' + featureValue + '">' + "</p>";
                break;
              case "Number":
                content += "<p><b>" + key + "</b>:  " + '<input type="number" value="' + featureValue + '">' + "</p>";
                break;
              case "Select":
                let options = "";
                for (var i = 0; i < config["layers"].length; i++) {
                  if (layer.get("name") === config["layers"][i]["name"]) {
                    for (var j = 0; j < config["layers"][i]["fields"].length; j++) {
                      console.log(config["layers"][i]["fields"][j]["fieldName"], key);
                      if (config["layers"][i]["fields"][j]["fieldName"] === key) {
                        if (config["layers"][i]["fields"][j]["fieldSelect"]) {
                          let selectArray = config["layers"][i]["fields"][j]["fieldSelect"].split(",");
                          for (let l = 0; l < selectArray.length; l++) {
                            options += `<option value=${selectArray[l]}>${selectArray[l]}</option>`;
                          }
                        }
                      }
                    }
                  }
                }

                content += `<b>${key}</b>:<select multiple>${options}</select> `;

                break;
            }
          }

          let popupContent = `<form  class="trip-form" id="new-trip-form">
                    <div><h2>${feature.get("name")}</h2>${content}			
                    <button id='popSave' class='edit-button'><img src='icons/checked.png'></button>
                    </div>
                    </form>`;

          popup.show(evt.coordinate, popupContent);

          const editForm = document.getElementById("new-trip-form").elements;

          document.getElementById("popSave").onclick = function (event) {
            event.preventDefault();

            let i = 0;
            for (const [key, value] of layerKeys) {
              console.log(editForm[i].selectedOptions);
              if (editForm[i].selectedOptions) {
                let options = "";

                for (let option in editForm[i].selectedOptions) {
                  console.log(editForm[i].selectedOptions[option].value);

                  if (editForm[i].selectedOptions[option].value != undefined) {
                    options += editForm[i].selectedOptions[option].value + ", ";
                  }
                }
                options = options.substring(0, options.length - 2);
                console.log(options);
                feature.set(key, options);
              } else {
                feature.set(key, editForm[i].value);
              }

              i++;
            }
            popup.hide();
          };
        }
      }
    });
  }

  function deletePopup(feature) {
    layerList.forEach(function (layer) {
      console.log(layer);
      if (!specialLayers.includes(layer.get("name"))) {
        let source = layer.getSource();

        if (source.hasFeature(feature)) {
          source.removeFeature(feature);
          popup.hide();
        }
      }
    });

    // dodatkowo usunac z json file
  }

  // MAP WIDGETS

  const bm = new ol.control.GeoBookmark({
    marks: {
      World: { pos: ol.proj.transform([0, 0], "EPSG:4326", "EPSG:3857"), zoom: 1, permanent: true },
      Europe: { pos: ol.proj.transform([8, 42], "EPSG:4326", "EPSG:3857"), zoom: 5, permanent: true },
    },
  });
  map.addControl(bm);

  const scale = new ol.control.ScaleLine({});
  map.addControl(scale);

  const searchPhoton = new ol.control.SearchPhoton({
    lang: "en",
    reverse: true,
    position: true, // Search, with priority to geo position
  });
  map.addControl(searchPhoton);
  searchPhoton.on("select", function (e) {
    console.log("select photon");
    map.getView().animate({
      center: e.coordinate,
      zoom: Math.max(map.getView().getZoom(), 12),
    });
  });

  const searchSource = new ol.source.Vector({
    features: [],
  });
  layerList.forEach((layer) => {
    console.log(layer);
    if (layer.get("name") != "Basemaps") {
      layer.getSource().on("addfeature", function (e) {
        // e.feature.set("featureType", "country");
        searchSource.addFeature(e.feature);
      });
    }
  });
  let search = new ol.control.SearchFeature({
    source: searchSource,
  });
  map.addControl(search);

  let select = new ol.interaction.Select({});
  map.addInteraction(select);
  search.on("select", function (e) {
    select.getFeatures().clear();
    select.getFeatures().push(e.search);
    let p = e.search.getGeometry().getFirstCoordinate();
    map.getView().animate({ center: p, zoom: Math.max(map.getView().getZoom(), 12) });
  });
}

function deleteProfile(layerList) {
  map.getControls().forEach(function (control) {
    if (control instanceof ol.control.Profil) {
      map.removeControl(control);
    }
  }, this);

  for (var j = 0; j < layerList.length; j++) {
    if (layerList[j].get("name") == "profile-temp") {
      map.removeLayer(layerList[j]);
    }
  }
}

function createProfile(feature) {
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
  pt = new ol.Feature(new ol.geom.Point([0, 0]));
  pt.setStyle([]);
  source.addFeature(pt);

  const iconStyle = new ol.style.Style({
    image: new ol.style.Icon({
      anchor: [0.5, 60],
      anchorXUnits: "fraction",
      anchorYUnits: "pixels",
      src: "icons/hiker.png",
    }),
  });

  // Draw a point on the map when mouse fly over profil
  function drawPoint(e) {
    if (!pt) return;
    if (e.type == "over") {
      pt.setGeometry(new ol.geom.Point(e.coord));
      pt.setStyle(iconStyle);
    } else {
      pt.setStyle([]);
    }
  }

  // Show a popup on over
  profil.on(["over", "out"], function (e) {
    if (e.type == "over") profil.popup(e.coord[2] + " m");
    drawPoint(e);
  });

  // Show on map over
  var hover = new ol.interaction.Hover({ cursor: "pointer", hitTolerance: 10 });
  map.addInteraction(hover);
  const profileButton = document.querySelector(".ol-profil").querySelector("button");

  profileButton.addEventListener("click", () => {
    if (profil.isShown()) {
      console.log("shown");
      map.addInteraction(hover);
    } else {
      console.log("hidden");
      map.removeInteraction(hover);
    }
  });

  hover.on("hover", function (e) {
    // Point on the line
    var c = feature.getGeometry().getClosestPoint(e.coordinate);
    drawPoint({ type: "over", coord: c });
    // Show profil
    var p = profil.showAt(e.coordinate);
    profil.popup(p[2] + " m");
  });
  hover.on("leave", function (e) {
    profil.popup();
    profil.showAt();
    drawPoint({});
  });
}

buttonContainer.addEventListener("change", (event) => {
  let content = document.getElementById(event.target.value + "-container");

  if (content.style.display === "block") {
    infoContainer.style.display = "none";
    content.style.display = "none";
  } else {
    infoContainer.style.display = "block";

    for (let i = 0; i < infoContainer.children.length; ++i) {
      infoContainer.children[i].style.display = "none";
    }
    content.style.display = "block";
  }
});
