const infoContainer = document.getElementById("info-container");
const buttonContainer = document.getElementById("button-container");

loadMap();

async function loadMap(){
    const layerOSM = new ol.layer.Tile({
		source: new ol.source.OSM({crossOrigin: 'anonymous',}),
		name: 'OSM',
		visible: true,
	});

    const map = new ol.Map({
        target: 'map',
        layers: [layerOSM],
        view: new ol.View({
            center: ol.proj.fromLonLat([8, 47]),
            zoom: 6
        })
    });
}

function menuButton(buttonId){
    let button = document.getElementById(buttonId);
    let content = document.getElementById(buttonId.replace("button", "container"));
          
    for (let i=0; i < buttonContainer.children.length; ++i){
      buttonContainer.children[i].style.backgroundColor='var(--background)';
    }
  
    if (content.style.display==='block'){
        infoContainer.style.display='none';
        content.style.display='none';
    } else{  
        infoContainer.style.display='block';
        button.style.backgroundColor='var(--dark-background)';
  
        for (let i=0; i < infoContainer.children.length; ++i){
            infoContainer.children[i].style.display='none';
        }
        content.style.display='block';
    }   
  }
