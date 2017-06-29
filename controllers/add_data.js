var mongo=require('mongodb');
var mongoClient=mongo.MongoClient;
var url="mongodb://localhost:27017/mydb";

module.exports = function(app){

app.get('/api',function(req,res)
	{
var starterTodos =[
			{
				username: req.query.username,
				todo: req.query.todo,
				isDone:req.query.isDone,
				hasAttachment:req.query.hasAttachment
			}
		];

		/*Todos.create(starterTodos,function(err, results)
		{
			res.send(results);
		});*/

		mongoClient.connect(url,function(err,db){
			if(err) throw err;
			db.collection("Todos").insertMany(starterTodos,
				function(err,resu){
					if(err) throw err;

					//res.send(resu.ops);
					//res.send("Added SuccessFully");
					res.render('add_a_todo');
					//ops contains the data
					//refer W3school for more datails.
				});
			db.close();
		});
	});	
}		