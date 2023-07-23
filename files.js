//  to git ignore
const ACCESS_TOKEN = "sl.BimHWlZLfzKvIbLbkQG5MO2I4dovRfhxwX87xKRlA3l2J2Q33TyzH8lr3Om61ZS1VjniblHzr49E9jf_7h71gYhYL3GY9c7IPJzYX_5c7k_9vJc1UtFsC04cDVBPSK0UdGl62XkCoGZ0Xm5jPxDJ"; // token expires after around one day
const dataPath = "data/"
let layerList;
let dropboxButton = document.getElementById("dropbox-button");
var data;

// DROPBOX FUNCTIONS
const REDIRECT_URI = 'http://localhost:8000/';
const dbxAuth = new Dropbox.DropboxAuth({
	clientId: '2h95rnvy2dubcsw',
});

function getCodeFromUrl() {
	return utils.parseQueryString(window.location.search).code;
}

function hasRedirectedFromAuth() {
	return !!getCodeFromUrl();
}

function showPageSection(elementId) {
	document.getElementById(elementId).style.display = 'block';
}

function doAuth() {
	dbxAuth.getAuthenticationUrl(REDIRECT_URI, undefined, 'code', 'offline', undefined, undefined, true)
		.then(authUrl => {
			window.sessionStorage.clear();
			window.sessionStorage.setItem("codeVerifier", dbxAuth.codeVerifier);
			window.location.href = authUrl;
		})
		.catch((error) => console.error(error));
};

export async function loadDropbox(){
	dropboxButton.addEventListener("click", function(){doAuth()})
	let dbx;
	if (hasRedirectedFromAuth()) {
		showPageSection('authed-section');
		dbxAuth.setCodeVerifier(window.sessionStorage.getItem('codeVerifier'));
		data = await dbxAuth.getAccessTokenFromCode(REDIRECT_URI, getCodeFromUrl())
			.then((response) => {
				dbxAuth.setAccessToken(response.result.access_token);
				dbx = new Dropbox.Dropbox({
					auth: dbxAuth
				});
				return dbx;
			})
			.catch((error) => {
				console.error(error)
			});
	} else {
		showPageSection('pre-auth-section');
	}

	return dbx;
}

export async function loadDropboxToken(){
	let dbx = new Dropbox.Dropbox({ accessToken: ACCESS_TOKEN });
	await dbx.usersGetCurrentAccount().then(function(response) {
		console.log("user", response);
	})
	return dbx;
}

// empty string = local files, otherwise dropbox object is passed
export async function loadFiles(fileSource){

	if(!fileSource){
		let dataLocal =  await fetchFile("data/conf.json");
		return dataLocal;
	}else{
		let dataDropbox = await fetchDropboxFile(fileSource, '/conf.json')
		return dataDropbox;
	}
}


async function fetchFile(link){
	let result = await fetch(link);
	// console.log(result);	
	let layer = await result.json();
	console.log(layer);		
	return layer;
}

async function fetchDropboxLink(dbx, link){
	let dropboxLink = await dbx.filesGetTemporaryLink({path: link}).then(function(response) {
		console.log(response.result.link);	
		return 	response.result.link;
	})
	return dropboxLink;
}

async function fetchDropboxFile(dbx, link){
	let dropboxLink = await fetchDropboxLink(dbx, link)
	let data = await fetchFile(dropboxLink);

	return data;
}

// layers = file.layers
export async function listLayers(map, layers, dataSource){
	console.log(layers);
	for (let i=0; i< layers.length; i++){
		let path = layers[i].name + '.geojson';
		console.log(path);
		let layerFile;
		if(!dataSource){
			path = dataPath + layers[i].name + '.geojson';
		}else{
			// console.log(dataSource, path);
			path = await fetchDropboxLink(dataSource, '/'+path);
		}

		let source = new ol.source.Vector({	
			url: path,
			format: new ol.format.GeoJSON()
		});

		map.addLayer(new ol.layer.Vector(
			{	name: layers[i]["name"],
				source: source,
				zIndex: 5,
			}
		));	
	}
}



	// dbx.filesUpload({path: '/' + file.name, contents: file}).then(function(response) {
    //     console.log(response);
    // })
    				
	// return dbx.filesListFolder({
	// 	path: ''
	// });
