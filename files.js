const dataPath = "data/";

// DATA LOADING

export async function fetchFile(link) {
  let result = await fetch(link);
  // console.log(result);
  let layer = await result.json();
  console.log(layer);
  return layer;
}

async function fetchDropboxLink(dbx, link) {
  let dropboxLink = await dbx.filesGetTemporaryLink({ path: link }).then(function (response) {
    console.log(response.result.link);
    return response.result.link;
  });
  return dropboxLink;
}

async function fetchDropboxFile(dbx, link) {
  let dropboxLink = await fetchDropboxLink(dbx, link);
  let data = await fetchFile(dropboxLink);
  return data;
}

// layers = file.layers
export async function listLayers(map, layers, dataSource) {
  console.log(layers);
  for (let i = 0; i < layers.length; i++) {
    let path = layers[i].name + ".geojson";
    console.log(path);
    let layerFile;
    if (!dataSource) {
      path = dataPath + layers[i].name + ".geojson";
    } else {
      // console.log(dataSource, path);
      path = await fetchDropboxLink(dataSource, "/" + path);
    }

    let source = new ol.source.Vector({
      url: path,
      format: new ol.format.GeoJSON(),
    });

    map.addLayer(new ol.layer.Vector({ name: layers[i]["name"], source: source, zIndex: 5 }));
  }
}

// dbx.filesUpload({path: '/' + file.name, contents: file}).then(function(response) {
//     console.log(response);
// })

// return dbx.filesListFolder({
// 	path: ''
// });
