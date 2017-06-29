var http = require('http');
var Router = require('node-simple-router');

exports.postmanApi = {
	server: null, //represents the server instance
	router: null,
	responder: null, //the function that will be called with name: and data:
	startServer: function(port, responder) {
		var oldThis = this;
		if(!port) {
			port = 8082;
		}
		if(typeof port === "string") {
			port = parseInt(port,10);
		}

		this.responder = responder;

		this.router = new Router();
		this.setRoutes();
		var server = http.createServer(this.router);
		server.listen(port);
		this.server = server;
		console.log("Server started at port: " + port);
		return server;
	},

	/**
	* POST /capturedRequest to simulate the interceptor sending a request captured from chrome
	*/
	setRoutes: function() {
		var oldThis = this;
		this.router.post("/capturedRequest", function(request, response) {
			console.log("Sending to main.js");
			oldThis.responder({name: "capturedInterceptorRequest", data:request.post});
			response.end();
		});
	}
};