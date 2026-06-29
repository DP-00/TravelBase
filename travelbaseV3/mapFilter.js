export function setupModeFilter(viewElement, layerFilters, globalFilters) {
  const modeGroup = document.getElementById("modes");

  modeGroup.addEventListener("calciteChipGroupSelect", () => {
    const selected = modeGroup.selectedItems;

    globalFilters.mode = selected.length ? selected[0].value : null;

    viewElement.map.layers.forEach((layer) => applyFilters(layer, layerFilters, globalFilters));

    // viewElement.map.layers.forEach(applyFilters);
  });
}

export async function setupTripFilter(viewElement, layerFilters, globalFilters, config) {
  const trips = config.trips;
  const combobox = document.getElementById("trip-filter");

  for (const t of trips) {
    const item = document.createElement("calcite-combobox-item");
    item.value = t;
    item.textLabel = t;
    combobox.appendChild(item);
  }

  combobox.addEventListener("calciteComboboxChange", () => {
    const selected = combobox.selectedItems.map((i) => i.value);

    globalFilters.trips = selected.length
      ? buildFilterExpr({
          field: "trips",
          values: selected,
          allowNull: false,
        })
      : null;

    viewElement.map.layers.forEach((layer) => applyFilters(layer, layerFilters, globalFilters));
    // viewElement.map.layers.forEach(applyFilters);
  });
}
export async function setupLayerFilter(layer, container, layerFilters, globalFilters) {
  container.innerHTML = "";

  // skip unsupported layers (WMS, group layers, etc.)
  if (!layer || !layer.fields || !Array.isArray(layer.fields)) {
    return;
  }

  await layer.when?.();

  if (!layerFilters[layer.id]) {
    layerFilters[layer.id] = {};
  }

  const resetBtn = document.createElement("calcite-button");
  resetBtn.innerText = "Reset filters";
  resetBtn.width = "full";
  resetBtn.kind = "danger";
  resetBtn.appearance = "outline";
  resetBtn.scale = "s";
  resetBtn.style.padding = "1rem 0";

  resetBtn.onclick = () => {
    layerFilters[layer.id] = {};
    layer.definitionExpression = "1=1";
    setupLayerFilter(layer, container, layerFilters, globalFilters);
  };

  container.appendChild(resetBtn);

  for (const field of layer.fields) {
    const name = field.name;
    const type = field.type?.toLowerCase();
    const domain = field.domain;
    const key = name.toLowerCase();

    if (key === "objectid" || key === "__objectid" || key === "trips") continue;

    const label = document.createElement("calcite-label");

    const needsLabel = type !== "string" || domain?.codedValues?.length || key === "name" || key === "season";

    if (needsLabel) {
      label.textContent = field.alias || name;
      label.layout = "inline-space-between";
      label.scale = "s";
    } else {
      label.style.display = "block";
    }

    // 📅 DATE
    if (type === "date") {
      const picker = document.createElement("calcite-input-date-picker");
      picker.range = true;
      picker.scale = "s";
      picker.style.width = "75%";

      picker.addEventListener("calciteInputDatePickerChange", () => {
        const v = picker.value;

        if (v?.start && v?.end) {
          layerFilters[layer.id][name] = buildFilterExpr({
            field: name,
            range: {
              min: new Date(v.start).getTime(),
              max: new Date(v.end).getTime(),
            },
          });
        } else {
          delete layerFilters[layer.id][name];
        }

        applyFilters(layer, layerFilters, globalFilters);
      });

      label.appendChild(picker);
    }

    // 🔢 NUMERIC → SLIDER
    else if (type === "integer" || type === "double") {
      const min = domain?.minValue;
      const max = domain?.maxValue;

      if (min == null || max == null) continue;

      const slider = document.createElement("calcite-slider");

      slider.range = true;
      slider.min = min;
      slider.max = max;
      slider.minValue = min;
      slider.maxValue = max;

      slider.labelHandles = true;
      slider.labelTicks = true;
      slider.scale = "s";
      slider.style.width = "75%";

      // default filter
      layerFilters[layer.id][name] = buildFilterExpr({
        field: name,
        range: { min, max },
      });

      slider.addEventListener("calciteSliderChange", () => {
        layerFilters[layer.id][name] = buildFilterExpr({
          field: name,
          range: {
            min: slider.minValue,
            max: slider.maxValue,
          },
        });

        applyFilters(layer, layerFilters, globalFilters);
      });

      label.appendChild(slider);
    }

    // 🔘 SMALL INTEGER
    else if (type === "small-integer") {
      const group = document.createElement("calcite-chip-group");
      group.selectionMode = "single";
      group.innerHTML = `
    <calcite-chip value="0">no</calcite-chip>
    <calcite-chip value="1">yes</calcite-chip>
  `;

      group.addEventListener("calciteChipGroupSelect", () => {
        const selected = group.selectedItems;
        let val = selected.length ? selected[0].value : null;

        // const selectedChip = group.querySelector("calcite-chip[selected]");
        // const val = selectedChip?.value;
        console.log(val);
        if (val === null) {
          // nothing selected → no filter
          delete layerFilters[layer.id][name];
        } else {
          // explicit 0 or 1
          layerFilters[layer.id][name] = buildFilterExpr({
            field: name,
            type: "single",
            values: [Number(val)],
          });
        }

        applyFilters(layer, layerFilters, globalFilters);
      });

      label.appendChild(group);
    }

    // 🔤 STRING WITH DOMAIN
    else if (type === "string" && domain?.codedValues?.length) {
      const chipGroup = document.createElement("calcite-chip-group");
      chipGroup.selectionMode = "multiple";
      chipGroup.scale = "s";
      chipGroup.style.width = "75%";
      chipGroup.style.padding = "1rem 0";

      const selected = new Set();

      for (const cv of domain.codedValues) {
        const chip = document.createElement("calcite-chip");
        chip.value = cv.code;
        chip.innerText = cv.name;

        chip.onclick = () => {
          if (selected.has(cv.code)) {
            selected.delete(cv.code);
            chip.selected = false;
          } else {
            selected.add(cv.code);
            chip.selected = true;
          }

          if (selected.size) {
            layerFilters[layer.id][name] = buildFilterExpr({
              field: name,
              values: [...selected],
            });
          } else {
            delete layerFilters[layer.id][name];
          }

          applyFilters(layer, layerFilters, globalFilters);
        };

        chipGroup.appendChild(chip);
      }

      label.appendChild(chipGroup);
    }

    // 📅 SEASON (custom multi-value)
    else if (key === "season") {
      const chipGroup = document.createElement("calcite-chip-group");
      chipGroup.selectionMode = "multiple";
      chipGroup.scale = "s";
      chipGroup.style.width = "75%";

      const selected = new Set();

      for (let i = 1; i <= 12; i++) {
        const chip = document.createElement("calcite-chip");
        chip.value = String(i);
        chip.innerText = String(i);

        chip.onclick = () => {
          if (selected.has(chip.value)) {
            selected.delete(chip.value);
            chip.selected = false;
          } else {
            selected.add(chip.value);
            chip.selected = true;
          }

          if (selected.size) {
            layerFilters[layer.id][name] = buildFilterExpr({
              field: name,
              values: [...selected],
            });
          } else {
            delete layerFilters[layer.id][name];
          }

          applyFilters(layer, layerFilters, globalFilters);
        };

        chipGroup.appendChild(chip);
      }

      label.appendChild(chipGroup);
    }

    // 🔍 NAME INPUT
    else if (key === "name") {
      const input = document.createElement("calcite-input");
      input.scale = "s";

      input.addEventListener("calciteInputInput", () => {
        const v = input.value;

        if (v) {
          layerFilters[layer.id][name] = buildFilterExpr({
            field: name,
            values: [v],
          });
        } else {
          delete layerFilters[layer.id][name];
        }

        applyFilters(layer, layerFilters, globalFilters);
      });

      label.appendChild(input);
    } else {
      continue;
    }

    container.appendChild(label);
  }
}
function applyFilters(layer, layerFilters, globalFilters) {
  if (!layer || !layer.fields) return;

  const isTL = layer.id?.startsWith("TL_");
  const parts = [];

  // 🔹 per-layer filters
  const perLayer = layerFilters[layer.id] || {};
  for (const expr of Object.values(perLayer)) {
    if (expr) parts.push(expr);
  }

  // 🔹 global filters
  if (!isTL) {
    if (globalFilters.trips && hasField(layer, "trips")) {
      parts.push(globalFilters.trips);
    }

    if (globalFilters.mode) {
      const modeExpr = buildModeFilter(layer, globalFilters.mode);
      if (modeExpr) parts.push(modeExpr);
    }
  }

  layer.definitionExpression = parts.length ? parts.join(" AND ") : "1=1";
}

function hasField(layer, fieldName) {
  return layer.fields?.some((f) => f.name === fieldName);
}

function buildFilterExpr({ field, type, values, range, allowNull = true }) {
  if (!field) return null;

  let expr = null;

  // 🔢 RANGE (numbers, dates)
  if (range && range.min != null && range.max != null) {
    expr = `(${field} >= ${range.min} AND ${field} <= ${range.max})`;
  }

  // 🔘 SINGLE VALUE (boolean / switch)
  else if (type === "single" && values?.length === 1) {
    expr = `${field} = ${values[0]}`;
  }

  // 🔤 MULTI VALUE (strings like season, trips, category)
  else if (values?.length) {
    const parts = values.map((v) => `${field} LIKE '%${v}%'`);
    expr = `(${parts.join(" OR ")})`;
  }

  if (!expr) return null;

  // ✅ allow NULL values (important!)
  if (allowNull) {
    expr = `(${expr} OR ${field} IS NULL)`;
  }

  return expr;
}

function buildModeFilter(layer, mode) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;

  const parts = [];

  if (mode === "Archive" && hasField(layer, "isVisited")) {
    parts.push(
      buildFilterExpr({
        field: "isVisited",
        type: "single",
        values: [1],
      }),
    );
  }

  if (mode === "NOW") {
    if (hasField(layer, "isVisited")) {
      parts.push(
        buildFilterExpr({
          field: "isVisited",
          type: "single",
          values: [0],
        }),
      );
    }

    if (hasField(layer, "season")) {
      parts.push(
        buildFilterExpr({
          field: "season",
          values: [currentMonth, nextMonth],
        }),
      );
    }
  }

  if (mode === "Plans" && hasField(layer, "isVisited")) {
    parts.push(
      buildFilterExpr({
        field: "isVisited",
        type: "single",
        values: [0],
      }),
    );
  }

  return parts.filter(Boolean).join(" AND ") || null;
}
