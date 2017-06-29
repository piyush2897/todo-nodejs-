var mongo=require('mongodb');
var mongoClient=mongo.MongoClient;
var url="mongodb://localhost:27017/mydb";

module.exports = function(app){

app.get('/api/remove',function(req,res)
	{

//var myquery = { _id : req.query.unique_id };
var myquery={ username : req.query.username , todo: req.query.todo };



		mongoClient.connect(url,function(err,db){
			if(err) throw err;
						db.collection("Todos").deleteMany(myquery,
							function(err,resu){
								if(err) throw err;

								//res.send(resu.ops);
								//res.send(myquery);
								res.render('add_a_todo');
								//ops contains the data
								//refer W3school for more datails.
							});
			db.close();
		});
	});
}