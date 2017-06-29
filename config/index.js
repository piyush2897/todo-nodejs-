var mongo=require('mongodb');
var mongoClient=mongo.MongoClient;

var url="mongodb://localhost:27017/mydb";

module.exports = {

	getDbConnectionString : function(err,db){
	if(err) throw err;
	console.log("Data Base Created");
	db.close();
}

}
