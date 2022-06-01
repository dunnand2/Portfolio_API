const {Datastore} = require('@google-cloud/datastore');

module.exports.Datastore = Datastore;
module.exports.datastore = new Datastore();
module.exports.fromDatastore = function fromDatastore(item, url){
    item.id = item[Datastore.KEY].id;
    item.self = url + '/' + item.id;
    return item;
}