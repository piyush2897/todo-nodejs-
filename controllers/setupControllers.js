//var Todos =require('../models/todoModel.js');
var mongo=require('mongodb');
var mongoClient=mongo.MongoClient;
var url="mongodb://localhost:27017/mydb";

module.exports = function(app){

	app.get('/api/setupTodos',function(req,res)
	{

		/*var starterTodos =[
			{
				username: 'test',
				todo:'Buy milk',
				isDone:false,
				hasAttachment:false
			},
			{
				username: 'test',
				todo:'Feed Dog',
				isDone:false,
				hasAttachment:false
			},
			{
				username: 'test',
				todo:'drink milk',
				isDone:false,
				hasAttachment:false
			}	

		];

		/*Todos.create(starterTodos,function(err, results)
		{
			res.send(results);
		});*/
		mongoClient.connect(url,function(err,db){
			if(err) throw err;
			/*db.collection("Todos").insertMany(starterTodos,
				function(err,resu){
					if(err) throw err;
					//res.send(resu.ops);
					//ops contains the data
					//refer W3school for more datails.
				});*/
				var c;
			var c=db.collection("Todos").count({},function(err,count)
			{
				if(err) throw err;
					//return(count);
					c=count;
					//res.sendStatus(count);
			});
			//var c=db.collection("Todos").count();
			
			db.collection("Todos").find({}).toArray(function(err,resu)
				{
					if(err) throw err;
					var view_screen='<html><body><div><table><tr><th>INDEX</th><th>UNIQUE ID</th><th>USERNAME</th><th>TODOS</th><th>DONE STATUS</th><th>ATTACHMENTS</th></tr>';
					for(i=0;i<c;i=i+1)
					{
					view_screen=  view_screen +'<tr><td>'+(i+1)+'</td><td>' + resu[i]._id +'</td><td>' + resu[i].username + '</td><td>'+resu[i].todo + '</td><td>'+resu[i].isDone + '</td><td>'+resu[i].hasAttachment +'</td></tr>';
					//console.log(resu[i].username+i);
					//i=i+1;
					}
					var a;
					a=view_screen+'</table></div></body></html>';
					res.send(a);
					//res.send(resu);
				});

			db.close();
		});
		
	});

}