const addForm = document.getElementById("add-form");
const selectAdd = addForm.querySelector("select");
const newInputs = document.getElementById("new-inputs");

export function addData(map, config, layerList) {
  document.getElementById("add-button").addEventListener("click", function () {
    selectAdd.innerHTML = "";

    const optionElem = document.createElement("option");
    optionElem.innerText = "--Choose layer--";
    optionElem.value = "";
    selectAdd.appendChild(optionElem);

    layerList.forEach((layer) => {
      if (layer.get("name") != "Basemaps" && layer.get("name") != "TripTemp") {
        const optionElem = document.createElement("option");
        optionElem.innerText = layer.get("name");
        optionElem.value = layer.get("name");
        selectAdd.appendChild(optionElem);
      }
    });
  });

  document.getElementById("new-data-map").onchange = function () {
    newInputs.innerHTML = "";

    layerList.forEach((layer) => {
      if (layer.get("name") === selectAdd.value) {
        console.log(selectAdd.value);
        const layerKeys = listPropertiesByLayer(selectAdd.value, config);

        createFeatureForm(layerKeys, selectAdd.value, config, newInputs);

        const submitElem = document.createElement("button");
        submitElem.innerText = "Place";
        newInputs.appendChild(submitElem);
        console.log(newInputs);
        var newInputsSaved = newInputs.querySelectorAll("input, select");
        console.log(newInputsSaved);

        submitElem.onclick = function (event) {
          console.log(newInputsSaved);
          event.preventDefault();
          let draw = new ol.interaction.Draw({
            source: layer.getSource(),
            type: "Point",
          });

          map.addInteraction(draw);

          draw.on("drawend", function (evt) {
            map.removeInteraction(draw);
            var feature = evt.feature;
            const inputElements = newInputs.querySelectorAll("input, select");
            console.log(inputElements);

            inputElements.forEach((input) => {
              console.log(input.name, input.value);
              if (input.multiple) {
                feature.set(input.name, [...input.selectedOptions].map((opt) => opt.value).join(","));
              } else if (input.type === "checkbox") {
                feature.set(input.name, input.checked);
              } else {
                feature.set(input.name, input.value);
              }
            });

            selectAdd.value = "";
            newInputs.innerHTML = null;
          });
        };
      }
    });
  };

  document.getElementById("new-data-json").onchange = function () {
    newInputs.innerHTML = null;

    layerList.forEach(function (layer) {
      if (layer.get("name") === selectAdd.value) {
        const JSONElem = document.createElement("input");
        JSONElem.type = "file";
        JSONElem.accept = ".geojson";
        newInputs.appendChild(JSONElem);
        JSONElem.addEventListener("change", () => {
          const fileFormat = new ol.format.GeoJSON();
          const reader = new FileReader();
          reader.readAsText(JSONElem.files[0], "UTF-8");
          reader.onload = function (evt) {
            const fileFeatures = fileFormat.readFeatures(evt.target.result, {
              dataProjection: "EPSG:4326",
              featureProjection: "EPSG:3857",
            });
            addLineCalulcations(fileFeatures);
            createFileForm(map, fileFeatures, config, layer);
          };
        });
      }
    });
  };

  document.getElementById("new-data-gpx").onchange = function () {
    newInputs.innerHTML = null;

    layerList.forEach(function (layer) {
      if (layer.get("name") === selectAdd.value) {
        const GPXElem = document.createElement("input");
        GPXElem.type = "file";
        GPXElem.accept = ".gpx";
        newInputs.appendChild(GPXElem);
        GPXElem.addEventListener("change", () => {
          const fileFormat = new ol.format.GPX();
          const reader = new FileReader();
          reader.readAsText(GPXElem.files[0], "UTF-8");
          reader.onload = function (evt) {
            const fileFeatures = fileFormat.readFeatures(evt.target.result, {
              dataProjection: "EPSG:4326",
              featureProjection: "EPSG:3857",
            });

            addLineCalulcations(fileFeatures);

            createFileForm(map, fileFeatures, config, layer);
          };
        });
      }
    });
  };
}

function addLineCalulcations(fileFeatures) {
  // Convert MultiLineString geometries to LineString if necessary
  fileFeatures.forEach((feature) => {
    const geometry = feature.getGeometry();
    if (geometry instanceof ol.geom.Point) {
      return;
    }
    if (geometry instanceof ol.geom.MultiLineString) {
      // Convert MultiLineString to LineString by taking the first line
      const lineString = new ol.geom.LineString(geometry.getCoordinates()[0]);
      feature.setGeometry(lineString);
    }

    // Calculate and set additional properties
    const coords = feature.getGeometry().getCoordinates();
    if (coords.length > 1) {
      let distance = 0;
      let elevationGain = 0;
      let elevationLoss = 0;
      let minAltitude = Infinity;
      let maxAltitude = -Infinity;
      let startTime = null;
      let endTime = null;

      for (let i = 0; i < coords.length - 1; i++) {
        const [x1, y1, alt1, time1] = coords[i];
        const [x2, y2, alt2, time2] = coords[i + 1];

        // Convert EPSG:3857 coordinates to EPSG:4326 for distance calculation
        const coord1 = ol.proj.transform([x1, y1], "EPSG:3857", "EPSG:4326");
        const coord2 = ol.proj.transform([x2, y2], "EPSG:3857", "EPSG:4326");

        // Calculate distance in meters
        distance += ol.sphere.getDistance(coord1, coord2);

        if (alt1 !== undefined && alt2 !== undefined) {
          const elevationDiff = alt2 - alt1;
          if (elevationDiff > 0) {
            elevationGain += elevationDiff;
          } else {
            elevationLoss += Math.abs(elevationDiff);
          }
        }

        // Track max and min altitude
        if (alt1 !== undefined) {
          minAltitude = Math.min(minAltitude, alt1);
          maxAltitude = Math.max(maxAltitude, alt1);
        }

        // Get start and end timestamps
        if (time1 && !startTime) startTime = new Date(time1 * 1000);
        if (time2) endTime = new Date(time2 * 1000);
      }

      // Convert duration from seconds to hours with 3 decimal places
      let duration = startTime && endTime ? (endTime - startTime) / 3600000 : null; // Hours

      // Extract only the date part (YYYY-MM-DD) from the start time
      const dateVisited = startTime ? startTime.toISOString().split("T")[0] : null;

      // Assign calculated properties to feature
      feature.set("dateVisited", dateVisited); // Convert to km
      feature.set("isVisited", true);
      feature.set("distance", (distance / 1000).toFixed(2)); // Convert to km
      feature.set("elevation_gain", elevationGain.toFixed(2));
      feature.set("elevation_loss", elevationLoss.toFixed(2));
      feature.set("min_altitude", minAltitude === Infinity ? null : minAltitude.toFixed(2));
      feature.set("max_altitude", maxAltitude === -Infinity ? null : maxAltitude.toFixed(2));
      feature.set("duration", duration !== null ? duration.toFixed(2) : "N/A"); // Hours

      console.log(feature);
    }
  });
}

export function createFeatureForm(layerKeys, layerName, config, newInputs) {
  layerKeys.forEach((type, name) => {
    const labelElem = document.createElement("label");
    labelElem.innerText = `${name}: `;
    newInputs.appendChild(labelElem);

    let inputElem;
    console.log(config);

    const fieldData = config["layers"].find((l) => l.name === layerName)["fields"].find((f) => f.fieldName === name);

    if (!fieldData) {
      console.warn(`Field '${name}' not found in layer config. Skipping.`);
      return;
    }

    const defaultValue = fieldData?.fieldDefault || ""; // Get the default value for the field

    if (type === "Select") {
      inputElem = document.createElement("select");
      inputElem.name = name;
      inputElem.multiple = true;

      const options = fieldData?.fieldSelect?.split(",") || [];
      options.forEach((option) => {
        const optionElem = document.createElement("option");
        optionElem.value = optionElem.innerText = option;
        inputElem.appendChild(optionElem);
      });

      // Set default value for the select input
      if (defaultValue) {
        inputElem.value = defaultValue; // Set the default selected option
      }
    } else {
      inputElem = document.createElement("input");
      inputElem.name = name;

      if (type === "Number") {
        inputElem.type = "number";
      } else if (type === "Date") {
        inputElem.type = "date";
      } else if (type === "Bool") {
        inputElem.type = "checkbox";
        inputElem.checked = defaultValue === true; // Check the checkbox if default is "true"
      } else {
        inputElem.type = "text";
      }

      // Set the default value for text, number, or date inputs
      if (defaultValue && type !== "Bool") {
        inputElem.value = defaultValue; // Set the default value
      }
    }
    console.log(newInputs);
    newInputs.appendChild(inputElem);
  });
}

export function createFileForm(map, fileFeatures, config, layer) {
  const propKeys = listPropertiesByFeatures(fileFeatures);
  const layerKeys = listPropertiesByLayer(selectAdd.value, config);

  const fileForm = document.createElement("form");
  for (const [key, value] of layerKeys) {
    const labelElem = document.createElement("label");
    labelElem.innerText = key;
    fileForm.appendChild(labelElem);

    const selectElem = document.createElement("select");

    let optionElem = document.createElement("option");
    optionElem.innerText = "---";
    optionElem.value = "";
    selectElem.appendChild(optionElem);

    for (const propKey of propKeys) {
      if (propKey != "geometry") {
        let optionPropElem = document.createElement("option");
        optionPropElem.innerText = propKey;
        optionPropElem.value = propKey;

        // Auto-select if the key matches the property name
        if (key.toLowerCase() === propKey.toLowerCase()) {
          optionPropElem.selected = true;
        }

        selectElem.appendChild(optionPropElem);
      }
    }
    fileForm.appendChild(selectElem);
  }

  const submitElem = document.createElement("input");
  submitElem.type = "submit";
  submitElem.value = "ADD";
  fileForm.appendChild(submitElem);
  newInputs.appendChild(fileForm);

  fileForm.onsubmit = function (event) {
    event.preventDefault();
    var elements = fileForm.elements;

    fileFeatures.forEach((feature) => {
      const properties = feature.getProperties();
      console.log(properties);
      for (const property in properties) {
        if (property != "geometry") {
          feature.unset(property);
        }
      }

      let i = 0;
      for (const [key, value] of layerKeys) {
        feature.set(key, properties[elements[i].value]);
        i++;
      }
    });

    layer.getSource().addFeatures(fileFeatures);
    const ext = fileFeatures[0].getGeometry().getExtent().slice(0);
    fileFeatures.forEach(function (feature) {
      ol.extent.extend(ext, feature.getGeometry().getExtent());
    });
    map.getView().fit(ext, map.getSize());

    newInputs.innerHTML = "";

    // save changes to file
  };
}

export function listPropertiesByFeatures(features) {
  let propKeys = [];

  features.forEach((feature) => {
    const properties = feature.getProperties();
    for (let property in properties) {
      if (!propKeys.includes(property)) {
        propKeys.push(property);
      }
    }
  });
  return propKeys;
}

export function listPropertiesByLayer(layerName, config) {
  // let layerKeys =[];
  const layerKeys = new Map();

  for (var i = 0; i < config["layers"].length; i++) {
    if (layerName === config["layers"][i]["name"]) {
      for (var j = 0; j < config["layers"][i]["fields"].length; j++) {
        layerKeys.set(config["layers"][i]["fields"][j]["fieldName"], config["layers"][i]["fields"][j]["fieldType"]);
      }
    }
  }

  return layerKeys;
}
