var express =require('express');
var app =express();
var path = require('path');
var formidable = require('formidable');
var fs = require('fs');

//path is to store incoming data to a specipic location
//formidable will parse the incoming form data (the uploaded files)
//The fs module will be used to rename uploaded files

var url="mongodb://localhost:27017/mydb";

var mongo=require('mongodb');
var mongoClient=mongo.MongoClient;


var setupControllers =require('./controllers/setupControllers.js');
var Add_data =require('./controllers/add_data.js');
var Remove_data =require('./controllers/remove_todo.js');
var Update_data =require('./controllers/update_todo.js');

var port= process.env.PORT || 3000;

app.use('/assets', express.static(__dirname + '/public'));

app.set('view engine','ejs');

mongoClient.connect(url,function(err,db){
	if(err) throw err;
	console.log("Data Base Created");
	db.createCollection("Todos",function(err,res){
		if(err) throw err;
		console.log("Table Created");
		db.close();
	});	
});

/*app.get('/:username',function(req,res){
	//console.log("here");
	res.send('<html><body><h1>person:  '+req.params.username+'  </h1></body></html>');
});*/

/*app.get('/person/:id', function(req, res) {
	res.render('person', { ID: req.params.id, Qstr: req.query.qstr });
});*/

app.get('/person', function(req, res) {
	res.render('person', { Qstr1: req.query.firstname, Qstr2: req.query.lastname });
});

app.use('/',function(req,res,next){
	console.log("req_url"+req.url);
	next();
});

/*app.get('/',function(req,res){
	//console.log("here");
	res.render('index');
});*/
app.get('/',function(req,res){
	//console.log("here");
	res.render('add_a_todo');
});

app.get('/demo',function(req,res){
	res.render('index2.ejs');
});

app.post('/upload', function(req, res){

  // create an incoming form object
  var form = new formidable.IncomingForm();
  console.log(form.file.name);
  // specify that we want to allow the user to upload multiple files in a single request
  form.multiples = true;

  // store all uploads in the /uploads directory
  form.uploadDir = path.join(__dirname, '/uploads');


  // every time a file has been uploaded successfully,
  // rename it to it's orignal name
  form.on('file', function(field, file) {
    fs.rename(file.path, path.join(form.uploadDir, file.name));
  });

  // log any errors that occur
  form.on('error', function(err) {
    console.log('An error has occured: \n' + err);
  });

  // once all the files have been uploaded, send a response to the client
  form.on('end', function() {
    res.end('success');
  });

  // parse the incoming request containing the form data
  form.parse(req);
  //console.log("Success");
  //res.render('add_a_todo');

});



setupControllers(app);
Add_data(app);
Remove_data(app);
Update_data(app);

app.listen(port);