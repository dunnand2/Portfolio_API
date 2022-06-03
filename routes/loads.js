const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const ds = require('../datastore');
const datastore = ds.datastore;

router.use(bodyParser.json());
const { getURL } = require('../getURL');
const { checkToken, getTokenOwner } = require('../oauth');

const LOAD = "load"

/* ------------- Begin Load Model Functions ------------- */

function post_load(volume, item, creation_date, owner, url) {
    var key = datastore.key(LOAD);
    let new_load = { "volume": volume, "item": item, "creation_date": creation_date, "carrier": null, "owner": owner};
    return datastore.save({"key": key, "data": new_load})
    .then(() => {
         new_load.id = key.id;
         new_load.self = url + '/loads/' + key.id;
        return new_load;
    });
}

function put_load(volume, item, creation_date, load, url){
    const key = datastore.key([LOAD, parseInt(load.id,10)]);
    const new_load = {"volume": volume, "item": item, "creation_date": creation_date, "carrier": load.carrier, "owner": load.owner};
    return datastore.save({"key":key, "data":new_load})
    .then(() => {
        new_load.id = key.id;
        new_load.self = url + '/loads/' + key.id;
        return new_load;
    });
}

async function get_load(id, url) {
    let load_url = url + '/loads'
    const key = datastore.key(["load", parseInt(id, 10)]);
    return datastore.get(key).then(async (entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            return entity[0];
        } else {
            return entity.map( function(entity) {
                return ds.fromDatastore(entity, load_url);
            });
        }
    });
}

async function get_user_loads(req, url, owner){
    const query = datastore.createQuery(LOAD).filter('owner', '=', owner).limit(5);
    const load_url = url + '/loads';
    if(Object.keys(req.query).includes("cursor")){
        q = q.start(req.query.cursor);
    }
    const results = {};
    return datastore.runQuery(query).then((entities) => {
        results.loads = entities[0].map( function(entity) {
            return ds.fromDatastore(entity, load_url);
        });
        if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results
    });
}

async function get_user_loads_count(owner) {
    const query = datastore.createQuery(LOAD).select('__key__').filter('owner', '=', owner);
    const [keys] =  await datastore.runQuery(query);
    return keys.length;
}

function get_loads(url, req) {
    const q = datastore.createQuery("load").limit(3);
    const load_url = url + '/loads';
    const results = {};
    if(Object.keys(req.query).includes("cursor")){
        q = q.start(req.query.cursor);
    }
    return datastore.runQuery(q).then((entities) => {
        // Use Array.map to call the function fromDatastore. This function
        // adds id attribute to every element in the array at element 0 of
        // the variable entities
        results.loads = entities[0].map( function(entity) {
            return ds.fromDatastore(entity, load_url);
        });

        if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results
    });
}

function convert_load_carrier_json(load, boat) {
    let carrier = {"id":boat.id, "name":boat.name, "self":boat.self};
    load.carrier = carrier;
    return load
}

// Sets the carrier parameter for a load object
function set_load_carrier(load, load_id, boat_id) {
    const key = datastore.key(["load", parseInt(load_id, 10)]);
    let updated_load = { "volume": load.volume, "item": load.item, "creation_date": load.creation_date, "carrier": boat_id};
    return datastore.save({'key': key, "data": updated_load})
    .then(() => {
        return key.id;
    })
}

function delete_load(id) {
    const key = datastore.key(["load", parseInt(id, 10)]);
    return datastore.delete(key);
}

/* ------------- End Load Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.post('/', function (req, res) {
    if (req.body.volume === undefined || req.body.item === undefined || req.body.creation_date === undefined) {
        res.status(400).json({'Error': 'The request object is missing at least one of the required attributes'})
    }

    if(!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
        res.status(401).json({'Error': 'The JWT was not provided or is invalid'});
        return;
    }

    let token = req.headers.authorization.substring(7, req.headers.authorization.length);
    checkToken(token).then((ticket) => {
        if (ticket) {
            const owner = getTokenOwner(ticket);
            const url = getURL(req);
            post_load(req.body.volume, req.body.item, req.body.creation_date, owner, url)
            .then(load => {res.status(201).json(load)});
        }
    }).catch((error) => {
        console.error(error);
        res.status(401).json({'Error': 'The JWT was not provided or is invalid'});
        return;
    });

});

router.put('/:id', function(req, res){
    if (req.body.volume === undefined || req.body.item === undefined || req.body.creation_date === undefined) {
        res.status(400).json({'Error': 'The request object has an invalid or missing attribute'});
    }
    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        res.status(406).send('Not Acceptable');
    }
    if(req.get('content-type') !== 'application/json'){
        res.status(415).send('Server only accepts application/json data.')
    }

    if(!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
        res.status(401).json({'Error': 'The JWT was not provided or is invalid'});
        return;
    }

    let token = req.headers.authorization.substring(7, req.headers.authorization.length);

    let ticket = checkToken(token).catch((error ) => console.error(error));
    let load = get_load(req.params.id).catch((error) => console.error(error));

    Promise.all([ticket, load]).then((values) => {
        ticket = values[0];
        load = values[1][0];
        if(ticket) {
            owner = getTokenOwner(ticket)
            if (load === undefined || load === null) {
                res.status(404).json({ 'Error': 'No load with this load_id exists' });
            } 
            else if(load.owner != owner) {
                res.status(403).json({"Error": "You do not have permission to edit this load"});
            }
            else {
                const url = getURL(req);
                put_load(req.body.volume, req.body.item, req.body.creation_date, load, url)
                .then((load) => {
                    res.status(200).json(load);
                });
            }
        }
        else {
            res.status(401).json({'Error': 'The JWT was not provided or is invalid'});
        }
    })
    
});

router.get('/', function(req, res) {
    if(!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
        res.status(401).json({'Error': 'The JWT was not provided or is invalid'});
        return;
    }

    let token = req.headers.authorization.substring(7, req.headers.authorization.length);
   
    checkToken(token).then((ticket) => {
        if (ticket) {
            const owner = getTokenOwner(ticket);
            const url = getURL(req);
            let loads = get_user_loads(req, url, owner);
            let count = get_user_loads_count(owner);
            Promise.all([loads, count]).then(values => {
                loads = values[0];
                count = values[1];
                loads['owned_loads'] = count;
                res.status(200).json(loads);
            })
        }
    }).catch((error) => {
        console.error(error);
    });
})

router.get('/:load_id', function (req, res) {
    const url = getURL(req);
    get_load(req.params.load_id, url)
        .then(load => {
            if (load[0] === undefined || load[0] === null) {
                // The 0th element is undefined. This means there is no lodging with this id
                res.status(404).json({ 'Error': 'No load with this load_id exists' });
            } else {
                if (load[0].carrier != null) {
                    boat_queries.get_boat(load[0].carrier, url).then((boat) => {
                        load = load_queries.convert_load_carrier_json(load[0], boat[0]);
                        res.status(200).json(load);
                    })
                } else {
                    res.status(200).json(load[0]);
                }
            }
        });
});

router.delete('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});

router.delete('/:load_id', function (req, res) {
    get_load(req.params.load_id)
    .then((load) => {
        if (load[0] === undefined || load[0] === null) {
            res.status(404).json({'Error': "No load with this load_id exists"});
        } else {
            if (load[0].carrier != null) {
                boat_queries.remove_load_from_boat(load[0].carrier, req.params.load_id);
            }
            delete_load(req.params.load_id).then(res.status(204).end());
        }
    })
});

/* ------------- End Controller Functions ------------- */

module.exports = router ;