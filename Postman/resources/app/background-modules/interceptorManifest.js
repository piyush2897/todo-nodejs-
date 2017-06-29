var fs = require('fs');

exports.interceptorManifest = {
	getManifest: function(platform) {
		var filetext = "";
		if(platform==="osx") {
			filetext = fs.readFileSync(__dirname + '/postman-interceptor-manifest-osx.json')
		}
		else {
			throw "Platform: " + platform + " not supported";
		}

		var manifest = JSON.parse(filetext.toString());

		var currentPath = process.resourcesPath;
		var parts = currentPath.split("/");
		parts.splice(-2);
		var appPath = parts.join("/");

		manifest.path = appPath;

		return manifest;
	},

	getUserHome: function() {
		return process.env.HOME || process.env.USERPROFILE;
	},

	saveFile: function(platform, manifest) {		
		var path = this.getUserHome();
		if(platform==="osx") {
			path += "/Library/Application Support/Google/Chrome/NativeMessagingHosts/"
		}
		else {
			throw "Platform: " + platform + " not supported";
		}

		path += manifest.name + ".json";
		try {
			fs.appendFileSync(path, JSON.stringify(manifest));
		}
		catch(e) {
			console.log(e);
		}
		console.log("Manifest installed");
	}
};