//  to git ignore
const ACCESS_TOKEN = ""; // token expires after around one day

let layerList;
let dropboxButton = document.getElementById("dropbox-button");
var data;
export async function loadFiles(option){

	switch(option){
		case "local":
			let dataLocal =  await getConfig("data/conf.json");
			return dataLocal;
			
		case "DropboxToken":
			let dbx = new Dropbox.Dropbox({ accessToken: ACCESS_TOKEN });
			let dataDropboxToken = await dbx.usersGetCurrentAccount().then(function(response) {
					console.log("user", response);
					return dbx.filesGetTemporaryLink({
					path: '/conf.json'
				})
			}).then((response) => {
				console.log(response.result.link);
				return getConfig(response.result.link);
			}).catch(function(error) {
				console.error(error);
			});
			
			return dataDropboxToken;

		case "Dropbox":
			var dbxAll = '';
			const REDIRECT_URI = 'http://localhost:8000/';
			var dbxAuth = new Dropbox.DropboxAuth({
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
			let data;
			if (hasRedirectedFromAuth()) {
				showPageSection('authed-section');
				dbxAuth.setCodeVerifier(window.sessionStorage.getItem('codeVerifier'));
				data = await dbxAuth.getAccessTokenFromCode(REDIRECT_URI, getCodeFromUrl())
					.then((response) => {
						dbxAuth.setAccessToken(response.result.access_token);
						var dbx = new Dropbox.Dropbox({
							auth: dbxAuth
						});
						dbxAll = dbx;
						return dbx.filesGetTemporaryLink({
							path: '/conf.json'
						})
					})
					.then((response) => {	
						console.log(response.result.link)					
						return getConfig(response.result.link)
					})
					.catch((error) => {
						console.error(error)
					});
			} else {
				showPageSection('pre-auth-section');
			}
			
			
			dropboxButton.addEventListener("click", function(){doAuth()})
			console.log(data);
			return data;
	}	
}

async function getConfig(file){

	const res = await fetch(file);
	const configJSON = await res.json();
	console.log(configJSON);

	return configJSON;
}



	// dbx.filesUpload({path: '/' + file.name, contents: file}).then(function(response) {
    //     console.log(response);
    // })

	// dbx.sharingGetSharedLinkFile({url: SHARED_LINK}).then(function(data) {
		// var downloadUrl = URL.createObjectURL(data.fileBlob);
		// var downloadButton = document.createElement('a');
		// downloadButton.setAttribute('href', downloadUrl);
		// downloadButton.setAttribute('download', data.name);
		// downloadButton.setAttribute('class', 'button');
		// downloadButton.innerText = 'Download: ' + data.name;
		// document.getElementById('results').appendChild(downloadButton);
	// })
    				
	// return dbx.filesListFolder({
	// 	path: ''
	// });
    

    // var file = 	''
    // dbxAll.filesGetTemporaryLink({path: path})
    // .then(function(response) {
    //     file = response.result.link;	
    //     console.log(file);	
    //     // var res1 = await fetch(file);
    //     // console.log(res1);	
    //     // var configJSON1 = await res1.json();
    //     // console.log(configJSON1);		

    //     // layers[i] = await response.json(); // creating arrays with geojson objects
    //             // var geojsonUrl = URL.createObjectURL(data.fileBlob);

    //     // creating layers
    //     map.addLayer(new ol.layer.Vector(
    //         {	
    //             name: "test data",
    //             source: new ol.source.Vector({	
    //                 url: data,
    //                 format: new ol.format.GeoJSON()
    //             }),
    //             zIndex: 5,
    //     }));
            
    // })
