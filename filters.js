import { createFeatureForm, listPropertiesByLayer } from "./add.js";

const layerContent = document.getElementById("filter-container");
const filterForm = document.getElementById("filter-form");
const listFilter = document.getElementById("filter-list");
const newInputsFilter = document.getElementById("new-inputs-filter");

export function filterMenu(map, config, layerList) {
  newInputsFilter.innerHTML = "";

  layerList.forEach((layer) => {
    const layerName = layer.get("name");
    console.log(layerName);
    const layerKeys = listPropertiesByLayer(layerName, config);
    if (!layerKeys.size) return;

    // Create a wrapper for each layer filter form
    const formWrapper = document.createElement("div");
    formWrapper.classList.add("filter-form-wrapper");

    // Create a header for the form
    const layerHeader = document.createElement("h3");
    layerHeader.innerText = `${layerName}`;
    formWrapper.appendChild(layerHeader);

    // Create the form
    const formElem = document.createElement("form");
    formElem.classList.add("filter-form");
    createFeatureForm2(layerKeys, layerName, config, formElem);

    const submitElem = document.createElement("button");
    submitElem.innerText = "Filter";
    formElem.appendChild(submitElem);

    const resetButton = document.createElement("button");
    resetButton.innerText = "Reset";
    formElem.appendChild(resetButton);
    resetButton.onclick = function () {
      formElem.reset(); // Reset form inputs
      layer
        .getSource()
        .getFeatures()
        .forEach((feature) => {
          feature.setStyle(null); // Restore all features
        });
    };

    // var newInputsFilterSaved = newInputsFilter.querySelectorAll("input, select");
    // console.log(newInputsFilterSaved);
    formWrapper.appendChild(formElem);
    newInputsFilter.appendChild(formWrapper);
    formElem.onsubmit = function (event) {
      //   console.log(newInputsFilterSaved);
      event.preventDefault();
      applyFilter(layer, formElem);
    };
  });

  document.getElementById("filter-all-button").onclick = function () {
    layerList.forEach((layer) => {
      if (layer instanceof ol.layer.Vector) {
        layer
          .getSource()
          .getFeatures()
          .forEach((feature) => {
            feature.setStyle(null); // Show all features
          });
      }
    });
  };

  document.getElementById("filter-visited-button").onclick = function () {
    layerList.forEach((layer) => {
      if (layer instanceof ol.layer.Vector) {
        layer
          .getSource()
          .getFeatures()
          .forEach((feature) => {
            const hasProperty = feature.get("isVisited") !== undefined;
            const isVisited = feature.get("isVisited") === true || feature.get("isVisited") === "true";

            // Hide features that don't have the property or are not visited
            feature.setStyle(hasProperty && isVisited ? null : new ol.style.Style({}));
          });
      }
    });
  };

  document.getElementById("filter-notvisited-button").onclick = function () {
    layerList.forEach((layer) => {
      if (layer instanceof ol.layer.Vector) {
        layer
          .getSource()
          .getFeatures()
          .forEach((feature) => {
            const isVisited = feature.get("isVisited");
            const hasProperty = isVisited !== undefined;

            // Normalize boolean values (in case they are stored as strings)
            const isNotVisited = isVisited === false || isVisited === "false";

            // Hide features that are visited or missing the property
            feature.setStyle(hasProperty && isNotVisited ? null : new ol.style.Style({}));
          });
      }
    });
  };

  document.getElementById("filter-now-button").onclick = function () {
    const currentMonth = (new Date().getMonth() + 1).toString(); // Get current month as string

    layerList.forEach((layer) => {
      if (layer instanceof ol.layer.Vector) {
        layer
          .getSource()
          .getFeatures()
          .forEach((feature) => {
            const season = feature.get("season"); // Get the stored months as string

            // Check if the property exists and is not empty
            const hasProperty = season !== undefined && season !== null;

            // Convert stored months into an array
            const allowedMonths = hasProperty ? season.split(",").map((month) => month.trim()) : [];

            // Condition: Show feature if it has a valid property AND the current month is in the list or the field is empty
            const filteredFeatures = hasProperty && (season === "" || allowedMonths.includes(currentMonth));

            // Hide features that don't match the condition
            feature.setStyle(filteredFeatures ? null : new ol.style.Style({}));
          });
      }
    });
  };
}

function createFeatureForm2(layerKeys, layerName, config, newInputs) {
  layerKeys.forEach((type, name) => {
    const labelElem = document.createElement("label");
    labelElem.innerText = `${name}: `;
    newInputs.appendChild(labelElem);

    let inputWrapper = document.createElement("div"); // Wrapper for styling

    if (type === "Select") {
      let inputElem = document.createElement("select");
      inputElem.name = name;
      inputElem.multiple = true;

      const fieldData = config["layers"].find((l) => l.name === layerName)?.fields.find((f) => f.fieldName === name);

      const options = fieldData?.fieldSelect?.split(",") || [];
      options.forEach((option) => {
        const optionElem = document.createElement("option");
        optionElem.value = optionElem.innerText = option;
        inputElem.appendChild(optionElem);
      });

      inputWrapper.appendChild(inputElem);
    } else if (type === "Number" || type === "Date" || type === "Time") {
      let minInput = document.createElement("input");
      let maxInput = document.createElement("input");

      minInput.type = maxInput.type = type.toLowerCase();
      minInput.name = `${name}_min`;
      maxInput.name = `${name}_max`;

      minInput.placeholder = "Min";
      maxInput.placeholder = "Max";

      inputWrapper.appendChild(minInput);
      inputWrapper.appendChild(maxInput);
    } else if (type === "Bool") {
      let checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = name;
      inputWrapper.appendChild(checkbox);
    } else {
      let textInput = document.createElement("input");
      textInput.type = "text";
      textInput.name = name;
      textInput.placeholder = "Comma-separated values (e.g., John, Jane)";

      inputWrapper.appendChild(textInput);
    }

    newInputs.appendChild(inputWrapper);
  });
}

// function applyFilter(layer, formElem) {
//   const filterValues = {};

//   const inputElements = formElem.querySelectorAll("input, select");
//   inputElements.forEach((input) => {
//     if (input.multiple) {
//       filterValues[input.name] = [...input.selectedOptions].map((opt) => opt.value);
//     } else if (input.type === "checkbox") {
//       filterValues[input.name] = input.checked;
//     } else if (input.name.endsWith("_min") || input.name.endsWith("_max")) {
//       const baseName = input.name.replace(/_(min|max)$/, "");
//       if (!filterValues[baseName]) {
//         filterValues[baseName] = {};
//       }
//       if (input.value) {
//         filterValues[baseName][input.name.endsWith("_min") ? "min" : "max"] = parseFloat(input.value);
//       }
//     } else if (input.type === "text" && input.value.includes(",")) {
//       filterValues[input.name] = input.value.split(",").map((v) => v.trim().toLowerCase());
//     } else if (input.value) {
//       filterValues[input.name] = input.value.toLowerCase();
//     }
//   });

//   // Remove empty filters
//   Object.keys(filterValues).forEach((key) => {
//     if (typeof filterValues[key] === "object" && Object.keys(filterValues[key]).length === 0) {
//       delete filterValues[key];
//     }
//   });

//   console.log("Processed Filters:", filterValues);

//   layer
//     .getSource()
//     .getFeatures()
//     .forEach((feature) => {
//       let isVisible = true;

//       console.log("Feature Properties:", feature.getProperties());

//       for (const [key, value] of Object.entries(filterValues)) {
//         let featureValue = feature.get(key);

//         console.log(`Checking ${key}:`, featureValue, "against", value);

//         if (value === undefined) continue;

//         if (typeof value === "object" && ("min" in value || "max" in value)) {
//           const featureNum = parseFloat(featureValue);
//           if (!isNaN(featureNum)) {
//             if (value.min !== undefined && featureNum < value.min) {
//               isVisible = false;
//               break;
//             }
//             if (value.max !== undefined && featureNum > value.max) {
//               isVisible = false;
//               break;
//             }
//           }
//         } else if (Array.isArray(value)) {
//           // Fix: Convert everything to lowercase before comparison
//           if (!featureValue || !value.map((v) => v.toLowerCase()).includes(String(featureValue).toLowerCase())) {
//             isVisible = false;
//             break;
//           }
//         } else if (value && (!featureValue || String(featureValue).toLowerCase() !== value)) {
//           isVisible = false;
//           break;
//         }
//       }

//       console.log(`Feature visibility: ${isVisible}`);

//       feature.setStyle(isVisible ? null : new ol.style.Style({}));
//     });
// }

function applyFilter(layer, formElem) {
  const filterValues = {};

  const inputElements = formElem.querySelectorAll("input, select");
  inputElements.forEach((input) => {
    if (input.multiple) {
      filterValues[input.name] = [...input.selectedOptions].map((opt) => opt.value);
    } else if (input.type === "checkbox") {
      filterValues[input.name] = input.checked;
    } else if (input.name.endsWith("_min") || input.name.endsWith("_max")) {
      console.log("input text", input.value);
      const baseName = input.name.replace(/_(min|max)$/, "");
      if (!filterValues[baseName]) {
        filterValues[baseName] = {};
      }
      if (input.value) {
        filterValues[baseName][input.name.endsWith("_min") ? "min" : "max"] = input.value;
      }
    } else if (input.type === "text" && input.value.includes(",")) {
      filterValues[input.name] = input.value.split(",").map((v) => v.trim().toLowerCase());
    } else if (input.value) {
      filterValues[input.name] = input.value.toLowerCase();
    }
  });

  // Remove empty filters
  Object.keys(filterValues).forEach((key) => {
    if (typeof filterValues[key] === "object" && Object.keys(filterValues[key]).length === 0) {
      delete filterValues[key];
    }
  });

  console.log("Processed Filters:", filterValues);

  layer
    .getSource()
    .getFeatures()
    .forEach((feature) => {
      let isVisible = true;

      for (const [key, value] of Object.entries(filterValues)) {
        let featureValue = feature.get(key);

        console.log(`Checking ${key}:`, featureValue, "against", value);

        if (value === undefined) continue;

        if (typeof value === "object" && ("min" in value || "max" in value)) {
          // Check if date
          if (typeof featureValue === "string" && !isNaN(Date.parse(featureValue))) {
            const featureDate = new Date(featureValue);

            if (typeof value === "object") {
              // If value is a filter range
              const minDate = value.min ? new Date(value.min) : null;
              const maxDate = value.max ? new Date(value.max) : null;

              if ((minDate && featureDate <= minDate) || (maxDate && featureDate >= maxDate)) {
                isVisible = false;
              }
            }
          } else {
            const featureNum = parseFloat(featureValue);
            if (!isNaN(featureNum)) {
              if (value.min !== undefined && featureNum < value.min) {
                isVisible = false;
                break;
              }
              if (value.max !== undefined && featureNum > value.max) {
                isVisible = false;
                break;
              }
            }
          }
        } else if (Array.isArray(value)) {
          // Fix: Convert everything to lowercase before comparison
          if (!featureValue || !value.map((v) => v.toLowerCase()).includes(String(featureValue).toLowerCase())) {
            isVisible = false;
            break;
          }
        } else if (value && (!featureValue || String(featureValue).toLowerCase() !== value)) {
          isVisible = false;
          break;
        }
      }

      console.log(`Feature visibility: ${isVisible}`);

      feature.setStyle(isVisible ? null : new ol.style.Style({}));
    });
}
