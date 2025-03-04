const layerContent = document.getElementById("layer-container");
const specialLayers = ["Basemaps", "TripTemp", "profile-temp"];

export function layerMenu(map, dbx, layerList) {
  layerList.forEach((layer) => {
    if (!specialLayers.includes(layer.get("name"))) {
      // adding a box for icon with class name and unique id
      const layerDiv = document.createElement("div");
      layerDiv.id = "layerDiv" + layer.get("name");
      layerDiv.className = "layerDiv";
      layerContent.appendChild(layerDiv);

      // adding a checkbox for display with unique id
      const inputElemLayer = document.createElement("input");
      inputElemLayer.type = "checkbox";
      inputElemLayer.id = "layerCheckbox" + layer.get("name");
      inputElemLayer.title = "display";
      layerDiv.appendChild(inputElemLayer);
      inputElemLayer.checked = layer.getVisible();

      // Visibility
      // adding a label for a checkbox with unique id
      const inputLabelLayer = document.createElement("label");
      inputLabelLayer.id = "layerCheckboxLabel" + layer.get("name");
      inputLabelLayer.htmlFor = "layerCheckbox" + layer.get("name");
      inputLabelLayer.innerText = layer.get("name");
      layerDiv.appendChild(inputLabelLayer);
      inputElemLayer.onclick = function () {
        if (inputElemLayer.checked == true) {
          layer.setVisible(true);
        } else {
          layer.setVisible(false);
        }
      };

      // Zoom to
      const zoomToElem = document.createElement("button");
      zoomToElem.title = "zoom to";
      layerDiv.appendChild(zoomToElem);
      const zoomToElemImg = document.createElement("img");
      zoomToElemImg.src = "icons/zoom.png";
      zoomToElem.appendChild(zoomToElemImg);
      zoomToElem.onclick = function () {
        map.getView().fit(layer.getSource().getExtent());
      };

      // Download
      const downloadElem = document.createElement("button");
      layerDiv.appendChild(downloadElem);
      const downloadElemImg = document.createElement("img");
      downloadElemImg.src = "icons/download.png";
      downloadElem.appendChild(downloadElemImg);
      downloadElem.onclick = function () {
        var writer = new ol.format.GeoJSON();
        var geoJsonStr = writer.writeFeatures(layer.getSource().getFeatures(), {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        });

        var element = document.createElement("a");
        element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(geoJsonStr));
        element.setAttribute("download", "data.geojson");
        element.style.display = "none";
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
      };

      // Save to Dropbox
      const dropboxElem = document.createElement("button");
      layerDiv.appendChild(dropboxElem);
      const dropboxElemImg = document.createElement("img");
      dropboxElemImg.src = "icons/send.png";
      dropboxElem.appendChild(dropboxElemImg);
      dropboxElem.onclick = function () {
        if (!window.confirm("Upload?")) return;

        var writer = new ol.format.GeoJSON();
        var geoJsonStr = writer.writeFeatures(layer.getSource().getFeatures(), {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        });

        // Convert GeoJSON string to a Blob
        const file = new Blob([geoJsonStr], { type: "application/json" });

        // Upload to Dropbox
        dbx
          .filesUpload({
            path: "/" + layer.get("name") + ".geojson",
            contents: file,
            mode: "overwrite", // Ensures the file is replaced if it exists
          })
          .then(function (response) {
            console.log("File uploaded successfully:", response);
          })
          .catch(function (error) {
            console.error("Error uploading file:", error);
          });
      };
    }
  });
}
