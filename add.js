const addForm = document.getElementById("add-form");
const selectAdd = addForm.querySelector("select");
const newInputs = document.getElementById("new-inputs");

export function addData(map, config, layerList){

	document.getElementById("add-button").addEventListener("click", function() {
            
		selectAdd.innerHTML ="";
	
		const optionElem = document.createElement("option");
		optionElem.innerText = "--Choose layer--";
		optionElem.value="";
		selectAdd.appendChild(optionElem);	
	
		layerList.forEach(layer => {
			if (layer.get("name") != "Basemaps" &&  layer.get("name") != "TripTemp") {
				const optionElem = document.createElement("option");
				optionElem.innerText = layer.get("name");
				optionElem.value=layer.get("name");
				selectAdd.appendChild(optionElem);	
			}
		})
	})

	document.getElementById("new-data-json").onchange = function() {
		newInputs.innerHTML=null;

		layerList.forEach(function(layer) {
			if (layer.get('name') === selectAdd.value) {
				const JSONElem = document.createElement("input");
				JSONElem.type="file";
				JSONElem.accept=".geojson";		
				newInputs.appendChild(JSONElem);
				JSONElem.addEventListener("change", () => {
					const fileFormat = new ol.format.GeoJSON();
					const reader = new FileReader();
					reader.readAsText(JSONElem.files[0], "UTF-8");
					reader.onload = function (evt) {
						const fileFeatures = fileFormat.readFeatures(evt.target.result,{
							dataProjection:'EPSG:4326',
							featureProjection:'EPSG:3857'
						});

						createForm(map, fileFeatures, config, layer);
					}	
				  });
			}
		})
	}

}

function listPropertiesByFeatures(features){
	let propKeys= [];

	features.forEach(feature => {							
		const properties = feature.getProperties();
		for (let property in properties) {
			if(!propKeys.includes(property)){
				propKeys.push(property)												
			}
		}					
	})	
	return propKeys;
}

export function listPropertiesByLayer(layerName, config){
	// let layerKeys =[];
	const layerKeys = new Map();

	for(var i=0; i<config["layers"].length; i++){
		if(layerName === config["layers"][i]["name"]){
			for(var j=0; j<config["layers"][i]["fields"].length; j++)
			{
				layerKeys.set(config["layers"][i]["fields"][j]["fieldName"],config["layers"][i]["fields"][j]["fieldType"]);			
			}

		}
	}

	return layerKeys;
}

function createForm(map, fileFeatures, config, layer){
	
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
		optionElem.value= "";
		selectElem.appendChild(optionElem);	

		for (const propKey of propKeys){
			if(propKey!="geometry"){
				let optionPropElem = document.createElement("option");
				optionPropElem.innerText = propKey;
				optionPropElem.value=propKey;
				selectElem.appendChild(optionPropElem);	
			}
		}		
		fileForm.appendChild(selectElem);
	}
	
	const submitElem = document.createElement("input");
	submitElem.type="submit";
	submitElem.value="ADD";
	fileForm.appendChild(submitElem);
	newInputs.appendChild(fileForm);

	fileForm.onsubmit = function(event){
		event.preventDefault();
		var elements = fileForm.elements;

		fileFeatures.forEach(feature => {	
			const properties = feature.getProperties();
			console.log(properties)
			for (const property in properties) {
				if(property!="geometry"){
					feature.unset(property);
				}
			}

			let i = 0;
			for (const [key, value] of layerKeys) {

				feature.set(key, properties[elements[i].value])
				i++;
			}
		})

		layer.getSource().addFeatures(fileFeatures);
		const ext = fileFeatures[0].getGeometry().getExtent().slice(0);
		fileFeatures.forEach(function(feature){ ol.extent.extend(ext,feature.getGeometry().getExtent())});
		map.getView().fit(ext, map.getSize());

		newInputs.innerHTML="";	

		// save changes to file
	}
}






