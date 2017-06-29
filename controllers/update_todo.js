var mongo=require('mongodb');
var mongoClient=mongo.MongoClient;
var url="mongodb://localhost:27017/mydb";

module.exports = function(app){

app.get('/api/update',function(req,res)
	{

//var myquery = { _id : req.query.unique_id };
var myquery={ username : req.query.username , todo: req.query.todo };
var newvalues= { $set : {isDone : req.query.isDone , hasAttachment : req.query.hasAttachment }};


		mongoClient.connect(url,function(err,db){
			if(err) throw err;
						db.collection("Todos").updateOne(myquery, newvalues ,
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