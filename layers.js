const layerContent = document.getElementById('layer-container');

export function layerMenu(map, layerList){

    layerList.forEach(layer => {

        if (layer.get("name") != "Basemaps" &&  layer.get("name") != "TripTemp") {
            console.log(layer);
            
            // adding a box for icon with class name and unique id
            const layerDiv = document.createElement("div");
            layerDiv.id = 'layerDiv'+layer.get("name");
            layerDiv.className = 'layerDiv';
            layerContent.appendChild(layerDiv);


            // adding a checkbox for display  with unique id
            const inputElemLayer = document.createElement("input");
            inputElemLayer.type = "checkbox";
            inputElemLayer.id = "layerCheckbox"+layer.get("name");
            inputElemLayer.title = "display";
            layerDiv.appendChild(inputElemLayer);
            inputElemLayer.checked = layer.getVisible()


            // adding a label for a checkbox with unique id
            const inputLabelLayer = document.createElement("label");
            inputLabelLayer.id = "layerCheckboxLabel"+layer.get("name");
            inputLabelLayer.htmlFor = "layerCheckbox"+layer.get("name");
            inputLabelLayer.innerText = layer.get("name");
            layerDiv.appendChild(inputLabelLayer);

            // adding title to each box
            const layerElemLayer = document.createElement("p");
            layerElemLayer.innerText = layer.get("name");
            // layerDiv.appendChild(layerElemLayer);

            // adding zoomto button
            const zoomToElem = document.createElement("button");
            // zoomToElem.innerText = "zoomto";
            // zoomToElem.title = "zoom to";
            layerDiv.appendChild(zoomToElem);
            const zoomToElemImg = document.createElement("img");
            zoomToElemImg.src = "icons/zoom.png";
            // zoomToElem.title = "zoom to";
            zoomToElem.appendChild(zoomToElemImg);


                // changing visibility of layers
            inputElemLayer.onclick = function () {
                if (inputElemLayer.checked == true){
                    layer.setVisible(true);
                } else {
                    layer.setVisible(false);
                }
            };

            // zoom to layer
            zoomToElem.onclick = function () {
                map.getView().fit(layer.getSource().getExtent());
            };

            const downloadElem = document.createElement("button");
            layerDiv.appendChild(downloadElem);
            const downloadElemImg = document.createElement("img");
            downloadElemImg.src = "icons/download.png";
            downloadElem.appendChild(downloadElemImg);
            downloadElem.onclick = function () {

                var writer = new ol.format.GeoJSON();
                var geoJsonStr = writer.writeFeatures(layer.getSource().getFeatures(), {
                    dataProjection: 'EPSG:4326',
                    featureProjection: 'EPSG:3857'
                });

                var element = document.createElement('a');
                element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(geoJsonStr));
                element.setAttribute('download', 'data.geojson');        
                element.style.display = 'none';
                document.body.appendChild(element);             
                element.click();          
                document.body.removeChild(element);
            };
        }      
    });
}

// layerContent.innerHTML='';


// defining layer icon
function layerIcon(layer){

    console.log(layer)
    // adding a box for icon with class name and unique id
    const layerDiv = document.createElement("div");
    layerDiv.id = 'layerDiv'+layer.get("name");
    layerDiv.className = 'layerDiv';
    layerContent.appendChild(layerDiv);


    // adding a checkbox for display  with unique id
    const inputElemLayer = document.createElement("input");
    inputElemLayer.type = "checkbox";
    inputElemLayer.id = "layerCheckbox"+layer.get("name");
    inputElemLayer.title = "display";
    layerDiv.appendChild(inputElemLayer);
    inputElemLayer.checked = layer.getVisible()


    // adding a label for a checkbox with unique id
    const inputLabelLayer = document.createElement("label");
    inputLabelLayer.id = "layerCheckboxLabel"+layer.get("name");
    inputLabelLayer.htmlFor = "layerCheckbox"+layer.get("name");
    inputLabelLayer.innerText = layer.get("name");
    layerDiv.appendChild(inputLabelLayer);

    // adding title to each box
    const layerElemLayer = document.createElement("p");
    layerElemLayer.innerText = layer.get("name");
    // layerDiv.appendChild(layerElemLayer);

    // adding zoomto button
    const zoomToElem = document.createElement("button");
    // zoomToElem.innerText = "zoomto";
    // zoomToElem.title = "zoom to";
    layerDiv.appendChild(zoomToElem);
    const zoomToElemImg = document.createElement("img");
    zoomToElemImg.src = "img/zoom.png";
    // zoomToElem.title = "zoom to";
    zoomToElem.appendChild(zoomToElemImg);
    
    // adding edit button
    const editElem = document.createElement("button");
    // editElem.innerText = "edit";
    editElem.title = "edit";
    layerDiv.appendChild(editElem);
    const editElemImg = document.createElement("img");
    editElemImg.src = "img/edit.png";		
    editElem.appendChild(editElemImg);

    // adding table button
    const tableElem = document.createElement("button");
    // editElem.innerText = "edit";
    tableElem.title = "table";
    layerDiv.appendChild(tableElem);
    const tableElemImg = document.createElement("img");
    tableElemImg.src = "img/table.png";		
    tableElem.appendChild(tableElemImg);
            
    
    // adding download button
    // const downloadElem = document.createElement("button");
    // downloadElem.innerText = "download";
    // downloadElem.title="download";
    // layerDiv.appendChild(downloadElem);	

    // adding style button
    const styleElem = document.createElement("button");
    // styleElem.innerText = "style";
    styleElem.title="style";
    layerDiv.appendChild(styleElem);
    const styleElemImg = document.createElement("img");
    styleElemImg.src = "img/style.png";		
    styleElem.appendChild(styleElemImg);		

    // adding delete button
    const deleteElem = document.createElement("button");
    // deleteElem.innerText = "delete";
    deleteElem.title="delete";
    layerDiv.appendChild(deleteElem);	
    const deleteElemImg = document.createElement("img");
    deleteElemImg.src = "img/close.png";		
    deleteElem.appendChild(deleteElemImg);


    
    // changing visibility of layers
    inputElemLayer.onclick = function () {
        if (inputElemLayer.checked == true){
            layer.setVisible(true);
        } else {
            layer.setVisible(false);
        }
    };

    // zoom to layer
    zoomToElem.onclick = function () {
        map.getView().fit(layer.getSource().getExtent());
    };

    		// changing type of the default input based on field type
		fieldList = document.getElementsByClassName("fields-spec")[0];
		selectFieldList = fieldList.querySelector("select")
		// defaultFieldList = fieldList.querySelectorAll("input")[1]
		selectFieldList.addEventListener('change', updateDefault)

		function updateDefault(event){
		
			

			defaultFieldList = event.target.parentElement.parentElement.parentElement.querySelectorAll("input")[2]
			constraintFieldList = event.target.parentElement.parentElement.parentElement.querySelectorAll("input")[1]
			// constraintFieldList.placeholder = "Constraints"
			constraintFieldList.style.display="none";
			switch (event.target.value) {
				case 'Charset':
					defaultFieldList.type = "text"
					constraintFieldList
					break;
				case 'Number':
					defaultFieldList.type = "number"
					break;
				case 'Date':
					defaultFieldList.type = "date"
					break;
				case 'Select':
					defaultFieldList.type = "text"
					constraintFieldList.style.display="inline";
					constraintFieldList.placeholder = "Select values"

					break;
				case 'Bool':
					defaultFieldList.type = "checkbox"	
					defaultFieldList.innerText = "True"			
					break;
				default:
					console.log(`Error.`);
				}
		  };



}