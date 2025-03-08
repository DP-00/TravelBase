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

      // Table
      // Table button
      const tableElem = document.createElement("button");
      tableElem.title = "table";
      layerDiv.appendChild(tableElem);
      const tableElemImg = document.createElement("img");
      tableElemImg.src = "icons/table.png";
      tableElem.appendChild(tableElemImg);

      const highlightStyle = new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: "rgba(255, 0, 0, 1)", // Red outline
          width: 8,
        }),
        fill: new ol.style.Fill({
          color: "rgba(255, 0, 0, 0.3)", // Semi-transparent red fill
        }),
        image: new ol.style.Circle({
          radius: 10, // Radius for the point (to make it visible)
          fill: new ol.style.Fill({ color: "rgba(255, 0, 0, 0.6)" }), // Red fill for point
          stroke: new ol.style.Stroke({ color: "rgba(255, 0, 0, 1)", width: 2 }), // Red stroke for point
        }),
      });
      let highlightFeature = null; // Will hold the feature that's highlighted
      let originalStyle = null; // To store the original style

      tableElem.onclick = function () {
        let vectorSource = layer.getSource();
        let features = vectorSource.getFeatures();

        if (features.length === 0) {
          alert("No features available in this layer.");
          return;
        }

        const tableContainer = document.getElementById("table-container");
        tableContainer.style.resize = "both";
        const tbody = document.querySelector("#feature-table tbody");
        const headerRow = document.getElementById("table-header");

        tbody.innerHTML = ""; // Clear rows
        headerRow.innerHTML = ""; // Clear headers

        // Get properties dynamically from the first feature
        const featureProperties = Object.keys(features[0].getProperties()).filter((prop) => prop !== "geometry");

        // Create table headers
        featureProperties.forEach((prop, index) => {
          const th = document.createElement("th");
          th.innerHTML = `${prop} <button class="sort-btn" data-index="${index}">⬍</button>`;
          headerRow.appendChild(th);
        });

        // Populate table rows
        features.forEach((feature) => {
          const row = document.createElement("tr");

          featureProperties.forEach((prop) => {
            const cell = document.createElement("td");
            cell.textContent = feature.get(prop);
            row.appendChild(cell);
          });

          row.addEventListener("click", () => {
            // const coords = feature.getGeometry().getCoordinates();
            const geometry = feature.getGeometry();

            if (geometry.getType() === "Point") {
              // Zoom to point
              map.getView().animate({ center: geometry.getCoordinates(), zoom: 15 });
            } else {
              // Zoom to line or polygon: Fit the view to the feature's extent
              map.getView().fit(geometry.getExtent(), { duration: 1000, padding: [50, 50, 50, 50] });
            }
            // map.getView().animate({ center: coords, zoom: 15 });

            // Highlight the feature after zooming
            if (highlightFeature) {
              highlightFeature.setStyle(originalStyle); // Restore previous style
            }

            originalStyle = feature.getStyle(); // Save the original style
            feature.setStyle(highlightStyle); // Apply highlight style

            // Remove highlight after 3 seconds
            setTimeout(() => {
              feature.setStyle(originalStyle); // Restore original style
            }, 3000);

            // Set the highlighted feature
            highlightFeature = feature;
          });

          tbody.appendChild(row);
        });

        // Add sorting event listeners
        document.querySelectorAll(".sort-btn").forEach((btn) => {
          btn.addEventListener("click", () => sortTable(parseInt(btn.dataset.index)));
        });

        tableContainer.style.display = "block"; // Show table
      };

      // Close table event
      document.getElementById("close-table").onclick = () => {
        document.getElementById("table-container").style.display = "none";
      };

      function sortTable(columnIndex) {
        const tbody = document.querySelector("#feature-table tbody");
        const rows = Array.from(tbody.querySelectorAll("tr"));

        let ascending = true;
        if (tbody.dataset.sortIndex == columnIndex && tbody.dataset.sortOrder === "asc") {
          ascending = false;
        }

        rows.sort((a, b) => {
          const valA = a.cells[columnIndex].textContent;
          const valB = b.cells[columnIndex].textContent;

          const numA = parseFloat(valA);
          const numB = parseFloat(valB);

          // Check if the values are valid dates
          const dateA = new Date(valA);
          const dateB = new Date(valB);
          const isDate = !isNaN(dateA.getTime()) && !isNaN(dateB.getTime());

          if (isDate) {
            return ascending ? dateA - dateB : dateB - dateA;
          } else if (!isNaN(numA) && !isNaN(numB)) {
            return ascending ? numA - numB : numB - numA;
          }
          return ascending ? valA.localeCompare(valB) : valB.localeCompare(valA);
        });

        tbody.innerHTML = "";
        rows.forEach((row) => tbody.appendChild(row));

        tbody.dataset.sortIndex = columnIndex;
        tbody.dataset.sortOrder = ascending ? "asc" : "desc";
      }

      // Download
      const downloadElem = document.createElement("button");
      layerDiv.appendChild(downloadElem);
      const downloadElemImg = document.createElement("img");
      downloadElemImg.src = "icons/export.png";
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

function evaluateStyleExpression(expression, feature) {
  try {
    return new Function("feature", `return ${expression};`)(feature);
  } catch (error) {
    console.error("Error evaluating style expression:", expression, error);
    return null;
  }
}

export function parseStyle(styleConfig, feature) {
  console.log("Style Config:", styleConfig);

  let styleOptions = {};
  console.log(styleConfig.width, styleConfig.color, styleConfig.icon);
  if (styleConfig.width) {
    let color =
      typeof styleConfig.color === "string"
        ? evaluateStyleExpression(styleConfig.color, feature)
        : styleConfig.color || "black";

    console.log(color);
    let width =
      typeof styleConfig.width === "string"
        ? evaluateStyleExpression(styleConfig.width, feature)
        : styleConfig.width || 2;
    console.log(width);

    styleOptions.stroke = new ol.style.Stroke({
      color: color,
      width: width,
      lineDash: styleConfig.dashed ? [4, 8] : undefined,
    });

    console.log(styleOptions);
  }

  if (styleConfig.radius) {
    let color =
      typeof styleConfig.color === "string"
        ? evaluateStyleExpression(styleConfig.color, feature)
        : styleConfig.color || "black";
    let radius =
      typeof styleConfig.radius === "string"
        ? evaluateStyleExpression(styleConfig.radius, feature)
        : styleConfig.radius || 3;

    styleOptions.image = new ol.style.Circle({
      radius: radius,
      fill: new ol.style.Fill({ color: color }),
    });
  }

  if (styleConfig.icon) {
    let iconSrc = evaluateStyleExpression(styleConfig.icon, feature);
    styleOptions.image = new ol.style.Icon({
      src: iconSrc,
      scale: styleConfig.scale,
    });
  }
  return new ol.style.Style(styleOptions);
}

// export function parseStyle(styleConfig, feature) {
//   console.log("style");
//   let styleOptions = {};

//   if (styleConfig.colorByField && feature) {
//     const fieldValue = feature.get(styleConfig.colorByField.field);

//     styleOptions.stroke = new ol.style.Stroke({
//       color: styleConfig.colorByField.values[fieldValue] || "black",
//       width: styleConfig.width || 2,
//       lineDash: styleConfig.dashed ? [4, 8] : undefined,
//     });
//   } else if (styleConfig.color) {
//     styleOptions.stroke = new ol.style.Stroke({
//       color: styleConfig.color,
//       width: styleConfig.width || 2,
//       lineDash: styleConfig.dashed ? [4, 8] : undefined,
//     });
//   }

//   if (styleConfig.radiusByField && feature) {
//     const fieldValue = feature.get(styleConfig.radiusByField.field);
//     styleOptions.image = new ol.style.Circle({
//       radius: styleConfig.radiusByField.values[fieldValue] || 4,
//       fill: new ol.style.Fill({ color: styleConfig.color || "black" }),
//     });
//   } else if (styleConfig.radius) {
//     styleOptions.image = new ol.style.Circle({
//       radius: styleConfig.radius,
//       fill: new ol.style.Fill({ color: styleConfig.color || "black" }),
//     });
//   }

//   if (styleConfig.iconByField && feature) {
//     const fieldValue = feature.get(styleConfig.iconByField.field);
//     styleOptions.image = new ol.style.Icon({
//       src: styleConfig.iconByField.values[fieldValue] || "icons/unknown.png",
//       scale: styleConfig.scale || 1,
//     });
//   }
//   console.log(styleOptions);

//   return new ol.style.Style(styleOptions);
// }
