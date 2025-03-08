import { getBasemaps } from "./basemap.js";
import { fetchFile } from "./files.js";
import { listLayers } from "./files.js";
import { layerMenu, parseStyle } from "./layers.js";
import { addData, listPropertiesByLayer } from "./add.js";
import { filterMenu } from "./filters.js";

const dropboxButton = document.getElementById("dropbox-button");
const infoContainer = document.getElementById("info-container");
const buttonContainer = document.getElementById("button-container");
const specialLayers = ["Basemaps", "TripTemp", "profile-temp"];

const map = new ol.Map({
  target: "map",
  view: new ol.View({
    center: ol.proj.fromLonLat([8, 47]),
    zoom: 6,
  }),
});

// DROPBOX

const REDIRECT_URI = `${window.location.origin}/TravelBase/`; //"http://localhost:8000/";
// const REDIRECT_URI = "http://localhost:8000/"; //"http://localhost:8000/";

const CLIENT_ID = "2h95rnvy2dubcsw";
let dbxAuth = new Dropbox.DropboxAuth({
  clientId: CLIENT_ID,
});
var configLink = "";
var dbx = "";

// Dropbox
window.onload = function () {
  doAuth(); // Runs only once when the page loads
};

// Local (chagne also the beggining of the loadApp function to run it locally + redirect)
// loadApp();

function getCodeFromUrl() {
  return utils.parseQueryString(window.location.search).code;
}

function hasRedirectedFromAuth() {
  return !!getCodeFromUrl();
}

function showPageSection(elementId) {
  document.getElementById(elementId).style.display = "block";
}

function doAuth() {
  if (new URLSearchParams(window.location.search).has("code")) {
    console.log("Already authenticated, skipping...");
    return;
  }

  dbxAuth
    .getAuthenticationUrl(REDIRECT_URI, undefined, "code", "offline", undefined, undefined, true)
    .then((authUrl) => {
      window.sessionStorage.clear();
      window.sessionStorage.setItem("codeVerifier", dbxAuth.codeVerifier);
      window.location.href = authUrl;
    })
    .catch((error) => console.error(error));
}
window.doAuth = doAuth; // Expose to global scope

if (hasRedirectedFromAuth()) {
  showPageSection("authed-section");
  dbxAuth.setCodeVerifier(window.sessionStorage.getItem("codeVerifier"));
  dbxAuth
    .getAccessTokenFromCode(REDIRECT_URI, getCodeFromUrl())
    .then((response) => {
      dbxAuth.setAccessToken(response.result.access_token);
      var dropbox = new Dropbox.Dropbox({
        auth: dbxAuth,
      });

      dbx = dropbox;

      return dropbox.filesGetTemporaryLink({
        path: "/conf.json",
      });
    })
    .then((response) => {
      configLink = response.result.link;
      console.log(configLink);
      loadApp();
    })
    .catch((error) => {
      console.error(error);
    });
} else {
  showPageSection("pre-auth-section");
}

async function loadApp() {
  map.addLayer(getBasemaps(map));

  // Dropbox
  const config = await fetchFile(configLink); // or "data/conf.json" for local files
  await listLayers(map, config.layers, dbx);

  // Local version
  // const config = await fetchFile("data/conf.json"); // or "data/conf.json" for local files
  // await listLayers(map, config.layers, "");

  let layerList = await map.getLayers().getArray();

  layerMenu(map, dbx, layerList);
  addData(map, config, layerList);
  filterMenu(map, config, layerList);

  // UPDATE LAYER WARNING
  let updatedLayers = [];
  setTimeout(closeWarning, 5000);

  // This function adds the layer name to the updatedLayers array if it's not already in there
  function markLayerAsUpdated(layerName) {
    if (!updatedLayers.includes(layerName)) {
      updatedLayers.push(layerName);
    }

    showUpdateWarning();
  }

  // This function displays the warning if there are any updated layers
  function showUpdateWarning() {
    const warningElement = document.getElementById("updateWarning");
    const warningTextElement = document.getElementById("warningText");

    // If there are updated layers, show the warning
    if (updatedLayers.length > 0) {
      warningElement.style.display = "block";
      warningTextElement.innerHTML = `The layers ${updatedLayers.join(", ")} have been updated.`;
    }
  }

  // This function hides the warning and clears the updatedLayers array
  function closeWarning() {
    const warningElement = document.getElementById("updateWarning");
    warningElement.style.display = "none";
    updatedLayers = []; // Clear the updated layers array when the warning is closed
  }

  // Add event listener to the close button of the warning
  document.getElementById("closeWarningButton").onclick = closeWarning;

  // Detect changes in the layers (add, remove, or change features)
  layerList.forEach((layer) => {
    if (layer instanceof ol.layer.Vector) {
      layer.getSource().on("addfeature", function (event) {
        markLayerAsUpdated(layer.get("name"));
      });

      layer.getSource().on("removefeature", function (event) {
        markLayerAsUpdated(layer.get("name"));
      });

      // For updating feature, calling the function in pop-up edit, cause it is not possibe to detect that
    }
  });

  // Show a warning message when the user tries to close the app with unsaved updates
  window.onbeforeunload = function (event) {
    if (updatedLayers.length > 0) {
      event.returnValue = "There are unsaved updates. Are you sure you want to exit?";
    }
  };

  // LAYER STYLING

  config.layers.forEach((layerConfig) => {
    layerList.forEach((layer) => {
      if (layer.get("name") === layerConfig.name) {
        let vectorSource = layer.getSource();
        let features = vectorSource.getFeatures();

        console.log(layer.get("name"), features);
        features.forEach((feature) => {
          feature.setStyle(parseStyle(layerConfig.style, feature));
        });

        vectorSource.on("addfeature", (event) => {
          let feature = event.feature;
          feature.setStyle(parseStyle(layerConfig.style, feature));
        });
      }
    });
  });

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
        if ((key != "geometry") & (key != "name") & (key != "img") & (key != "link")) {
          if (feature.get(key) || feature.get(key) === false) {
            popContent += "<p><b>" + key + "</b>:  " + feature.get(key) + "</p>";
          }
        }
      });

      // input link need to have https or http infront, otherwise it is treated as a local one (for example www.google.com won't work)
      let link =
        feature.get("link") != undefined && feature.get("link") !== ""
          ? `<a  target="_blank" href="${feature.get("link").trim()}">Link</a>`
          : "";

      console.log("link html", link);

      let profile =
        feature.getGeometry() instanceof ol.geom.LineString
          ? "<button id='showProfile' class='profile-button'><img src='icons/panel.png'></button><button id='downloadGPX' class='profile-button'><img src='icons/export.png'></button></button><button id='cesiumGPX' class='profile-button'><img src='icons/cesium.png'></button>"
          : "";

      const coord = ol.proj.transform(evt.coordinate, "EPSG:3857", "EPSG:4326");
      const googleMap = `http://www.google.com/maps/place/${coord[1]},${coord[0]}`; // or `https://www.google.com/maps/dir/?api=1&destination=${coord[1]}%2C${coord[0]}&travelmode=transit`;

      let popupContent = `<div><h2>${feature.get(
        "name"
      )}</h2>${link}${popContent}<p><a  target="_blank" href=${googleMap}>${ol.coordinate.toStringHDMS(coord, 2)}</a>
            </p><img src=${feature.get("img")} alt="">${profile}			
            <button id='popEdit' class='edit-button'><img src='icons/pencil.png'></button>
			      <button id='popDelete' class='delete-button'><img src='icons/delete.png'></button>
            </div>`;

      console.log(popupContent);
      popup.show(evt.coordinate, popupContent);

      document.getElementById("popEdit").onclick = function () {
        editPopup(feature, evt);
      };
      document.getElementById("popDelete").onclick = function () {
        deletePopup(feature);
      };

      if (feature.getGeometry() instanceof ol.geom.LineString) {
        document.getElementById("downloadGPX").onclick = function () {
          const format = new ol.format.GPX();

          // Create a feature collection with only this feature
          const featureClone = feature.clone();
          featureClone.setId(undefined); // Remove the ID if needed
          const source = new ol.source.Vector({
            features: [featureClone],
          });

          const gpxData = format.writeFeatures(source.getFeatures(), {
            dataProjection: "EPSG:4326",
            featureProjection: "EPSG:3857",
          });

          const blob = new Blob([gpxData], { type: "application/gpx+xml" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "track.gpx";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        };

        document.getElementById("cesiumGPX").onclick = function () {
          // Create a feature collection with only this feature
          const featureClone = feature.clone();
          featureClone.setId(undefined); // Remove the ID if needed
          const source = new ol.source.Vector({
            features: [featureClone],
          });
          // Create GPX data from features in the layer
          const writer = new ol.format.GeoJSON();
          const geoJsonStr = writer.writeFeatures(source.getFeatures(), {
            dataProjection: "EPSG:4326",
            featureProjection: "EPSG:3857",
          });
          // Open the cesium.html in a new window (half the size of the screen)
          const cesiumWindow = window.open(
            "cesium.html",
            "_blank",
            `width=${window.innerWidth / 2}, height=${window.innerHeight / 2}`
          );

          // Once the Cesium window is loaded, send the GPX data
          cesiumWindow.addEventListener("load", function () {
            cesiumWindow.postMessage({ gpxData: geoJsonStr }, "*");
            console.log("GPX data sent to Cesium window");
          });
        };

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

    layerList.forEach((layer) => {
      if (specialLayers.includes(layer.get("name"))) return;

      let source = layer.getSource();
      if (!source.hasFeature(feature)) return;

      console.log(layer);
      const layerKeys = listPropertiesByLayer(layer.get("name"), config);

      layerKeys.forEach((value, key) => {
        let featureValue = feature.get(key) ?? "";
        console.log(value);

        if (value === "Charset" || value === "Number" || value === "Bool" || value === "Date") {
          let type = value === "Number" ? "number" : value === "Date" ? "date" : value === "Bool" ? "checkbox" : "text";
          content += `<p><b>${key}</b>: <input type="${type}" value="${featureValue}"></p>`;
        } else if (value === "Select") {
          let options =
            config.layers
              .find((l) => l.name === layer.get("name"))
              ?.fields.find((f) => f.fieldName === key)
              ?.fieldSelect?.split(",")
              .map((opt) => {
                let selected = featureValue
                  .split(",")
                  .map((v) => v.trim())
                  .includes(opt.trim())
                  ? "selected"
                  : "";
                return `<option value="${opt}" ${selected}>${opt}</option>`;
              })
              .join("") || "";

          content += `<b>${key}</b>:<select multiple>${options}</select>`;
        }
      });

      let popupContent = `
            <form class="trip-form" id="new-trip-form">
                <div>
                    <h2>${feature.get("name")}</h2>${content}
                    <button id='popSave' class='edit-button'><img src='icons/checked.png'></button>
                </div>
            </form>`;

      popup.show(evt.coordinate, popupContent);
      const editForm = document.getElementById("new-trip-form").elements;

      document.getElementById("popSave").onclick = function (event) {
        event.preventDefault();
        if (!window.confirm("Update?")) return;

        let i = 0;
        layerKeys.forEach((_, key) => {
          if (editForm[i].selectedOptions) {
            let options = Array.from(editForm[i].selectedOptions)
              .map((option) => option.value)
              .join(", ");
            feature.set(key, options);
          } else {
            feature.set(key, editForm[i].value);
          }
          i++;
        });

        popup.hide();
      };

      markLayerAsUpdated(layer.get("name"));
    });
  }

  function deletePopup(feature) {
    if (!window.confirm("Delete?")) {
      return; // If the user cancels, do nothing
    }

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
  }

  // ELEVATION PROFILE

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

  // closeWarning(); // close first warning on load about updated features

  // MAP WIDGETS

  const bm = new ol.control.GeoBookmark({
    marks: {
      World: { pos: ol.proj.transform([0, 0], "EPSG:4326", "EPSG:3857"), zoom: 1, permanent: true },
      Switzerland: { pos: ol.proj.transform([8.2275, 46.8182], "EPSG:4326", "EPSG:3857"), zoom: 8.5, permanent: true },
      Europe: { pos: ol.proj.transform([10, 55], "EPSG:4326", "EPSG:3857"), zoom: 4.5, permanent: true },
      Asia: { pos: ol.proj.transform([100, 40], "EPSG:4326", "EPSG:3857"), zoom: 4, permanent: true },
      SouthAmerica: { pos: ol.proj.transform([-60, -15], "EPSG:4326", "EPSG:3857"), zoom: 4, permanent: true },
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

// MENU CONTROL

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
