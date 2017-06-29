var express =require('express');
var app =express();

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

setupControllers(app);
Add_data(app);
Remove_data(app);
Update_data(app);

app.listen(port);