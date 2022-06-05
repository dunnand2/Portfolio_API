const {OAuth2Client} = require('google-auth-library');
const url = require('url');
const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const ds = require('../datastore');
const datastore = ds.datastore;
const { set_load_carrier, get_load } = require('./loads');
router.use(bodyParser.json());

const client_id = '59733396940-3rk1q1mquia5av6f7ssq517qqotq4rnc.apps.googleusercontent.com';
const client = new OAuth2Client(client_id);

const BOAT = "boats"

/* ------------- Begin Boat Model Functions ------------- */
function getURL(req) {
    let url = "";
    if (req.hostname == "localhost") {
        url = req.protocol + '://' + req.hostname + ':8080';
    }
    else {
        url = req.protocol + '://' + req.hostname;
    }
    return url;
}

function patch_boat(name, type, length, boat_id, boat, url){
    if (!name) {
        name = boat.name;
    }
    if(!type) {
        type = boat.type;
    }
    if (!length) {
        length = boat.length;
    }
    const key = datastore.key([BOAT, parseInt(boat_id,10)]);
    const new_boat = {"name": name, "type": type, "length": length, "owner": boat.owner, loads: boat.loads};
    return datastore.save({"key":key, "data":new_boat})
    .then(() => {
        new_boat.id = key.id;
        new_boat.self = url + '/boats/' + key.id;
        return new_boat;
    });
}

function post_boat(name, type, length, sub, url) {
    var key = datastore.key(BOAT);
    const new_boat = { "name": name, "type": type, "length": length, "owner": sub, loads: []};
    return datastore.save({"key": key, "data": new_boat})
    .then(() => {
        new_boat.id = key.id;
        new_boat.self = url + '/boats/' + key.id;
        return new_boat;
    });
}

function put_boat(name, type, length, boat_id, url, loads, owner){
    const key = datastore.key([BOAT, parseInt(boat_id,10)]);
    const boat = {"name": name, "type": type, "length": length, "loads": loads, "owner": owner};
    return datastore.save({"key":key, "data":boat})
    .then(() => {
        boat.id = key.id;
        boat.self = url + '/boats/' + key.id;
        return boat;
    });
}

function put_load_in_boat(load, boat, url){
    const key = datastore.key(["boat", parseInt(boat.id, 10)]);
    let loads = boat.loads;
    loads.push(load.id);
    let updated_boat = { "name": boat.name, "type": boat.type, "length": boat.length, "loads": loads};
    return datastore.save({"key": key, "data":updated_boat})
    .then(() => {
        set_load_carrier(load, boat.id);
        updated_boat.id = key.id;
        boat.self = url + '/boats/' + key.id
        return boat;
    })
}

function get_boats() {
    const q = datastore.createQuery(BOAT);
    return datastore.runQuery(q).then((entities) => {
        return entities[0].map(fromDatastore);
    });
}

async function get_user_boats(req, url, owner){
    const query = datastore.createQuery(BOAT).filter('owner', '=', owner).limit(5);
    const boat_url = url + '/boats';
    if(Object.keys(req.query).includes("cursor")){
        q = q.start(req.query.cursor);
    }
    const results = {};
    return datastore.runQuery(query).then((entities) => {
        results.boats = entities[0].map( function(entity) {
            return ds.fromDatastore(entity, boat_url);
        });
        if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results
    });
}

async function get_user_boats_count(googleID) {
    const query = datastore.createQuery(BOAT).select('__key__').filter('owner', '=', googleID);
    const [keys] =  await datastore.runQuery(query);
    return keys.length;
}

function get_boat(id, url){
    const key = datastore.key([BOAT, parseInt(id,10)]);
    return datastore.get(key).then( (data) => {
        if(data[0] == undefined || data[0] == null) {
            return data[0];
        }
            return ds.fromDatastore(data[0], url);
        }
    );
}

function delete_boat(id){
    const key = datastore.key([BOAT, parseInt(id,10)]);
    return datastore.delete(key);
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get('/', function(req, res){

    if(!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
        res.status(401).json({'Error': 'Authorization was not provided or is invalid'});
        return;
    }

    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        res.status(406).json({"Error": " Cannot respond with requested media type"});
        return;
    }

    let token = req.headers.authorization.substring(7, req.headers.authorization.length);
    
    let = client.verifyIdToken({
        idToken: token,
        audience: client_id,
    }).then((ticket) => {
        const payload = ticket.getPayload();
        const owner = payload['sub'];
        const url = getURL(req)
        let boats = get_user_boats(req, url, owner);
        let count = get_user_boats_count(owner);
        Promise.all([boats, count]).then(values => {
            boats = values[0];
            count = values[1];
            boats['owned_boats'] = count;
            res.status(200).json(boats);
        })
    }).catch((error) => {
        console.error(error);
    });

});

router.patch('/:id', function(req, res) {
    if (req.body.name === undefined && req.body.type === undefined && req.body.length === undefined){
        res.status(400).json({'Error': 'The request object requires at least one attribute'});
        return;
    }
    
    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        res.status(406).send('Not Acceptable');
        return;
    }
    if(req.get('content-type') !== 'application/json'){
        res.status(415).send('Server only accepts application/json data.');
        return;
    }

    if(!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
        res.status(401).json({'Error': 'Authorization was not provided or is invalid'});
        return;
    }

    let token = req.headers.authorization.substring(7, req.headers.authorization.length);
    
    let ticket = client.verifyIdToken({idToken: token, audience: client_id});
    let boat = get_boat(req.params.id);

    Promise.all([ticket, boat]).then((values) => {
        ticket = values[0];
        boat = values[1];
        owner = ticket.getPayload().sub;
        if (boat === undefined || boat === null) {
            res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
        } 
        else if(boat.owner != owner) {
            res.status(403).json({"Error": "You are not authorized to access this boat"});
        }
        else {
            patch_boat(req.body.name, req.body.type, req.body.length, req.params.id, boat, url)
            .then((boat) => {
                res.status(201).json(boat);
            });
        }
    })
})

router.post('/', function(req, res){
    if(req.get('content-type') !== 'application/json'){
        res.status(415).json({"Error": 'Server only accepts application/json data'});
        return;
    }
    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        res.status(406).json({"Error": 'Cannot respond with requested media type'});
        return;
    }
    if (req.body.name === undefined || req.body.type === undefined || req.body.length === undefined) {
        res.status(400).json({'Error': 'The request object is missing at least one of the required attributes'});
        return;
    }

    if(!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
        res.status(401).json({'Error': 'Authorization was not provided or is invalid'});
        return;
    }

    let token = req.headers.authorization.substring(7, req.headers.authorization.length);

    client.verifyIdToken({
        idToken: token,
        audience: client_id,
    }).then((ticket) => {
        const payload = ticket.getPayload();
        const userid = payload['sub'];
        const url = getURL(req);
        post_boat(req.body.name, req.body.type, req.body.length, userid, url)
        .then(boat => {res.status(201).json(boat)});
    }).catch((error) => {
        console.error(error);
        res.status(401).json({'Error': 'Authorization was not provided or is invalid'});
        return;
    });
});


router.put('/:id', function(req, res){
    if(req.get('content-type') !== 'application/json'){
        res.status(415).json({"Error": 'Server only accepts application/json data'});
        return;
    }
    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        res.status(406).json({"Error": 'Cannot respond with requested media type'});
        return;
    }
    if (req.body.name === undefined || req.body.type === undefined || req.body.length === undefined) {
        res.status(400).json({'Error': 'The request object is missing at least one of the required attributes'});
        return;
    }

    if(!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
        res.status(401).json({'Error': 'Authorization was not provided or is invalid'});
        return;
    }

    let token = false;
    if (req.headers.authorization) {
        token = req.headers.authorization.substring(7, req.headers.authorization.length);
    }

    let ticket = client.verifyIdToken({idToken: token, audience: client_id});
    let boat = get_boat(req.params.id);

    Promise.all([ticket, boat]).then((values) => {
        ticket = values[0];
        boat = values[1];
        owner = ticket.getPayload().sub;
        if (boat === undefined || boat === null) {
            res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
        } 
        else if(boat.owner != owner) {
            res.status(403).json({"Error": "You are not authorized to access this boat"});
        }
        else {
            const url = getURL(req);
            put_boat(req.body.name, req.body.type, req.body.length, req.params.id, url, boat.loads, owner)
            .then((boat) => {
                res.status(200).json(boat);
            });
        }
    })
    
});

router.put('/:boat_id/loads/:load_id', function(req, res){
    if(req.get('content-type') !== 'application/json'){
        res.status(415).json({"Error": 'Server only accepts application/json data'});
        return;
    }
    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        res.status(406).json({"Error": 'Cannot respond with requested media type'});
        return;
    }
    if(!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
        res.status(401).json({'Error': 'Authorization was not provided or is invalid'});
        return;
    }

    let token =  req.headers.authorization.substring(7, req.headers.authorization.length);

    let ticket = client.verifyIdToken({idToken: token, audience: client_id});
    let boat = get_boat(req.params.boat_id);
    let load = get_load(req.params.load_id)

    Promise.all([ticket, boat, load]).then((values) => {
        ticket = values[0];
        boat = values[1];
        load = values[2][0];
        owner = ticket.getPayload().sub;
        if (boat === undefined || boat === null || load === undefined || load === null) {
            res.status(404).json({ 'Error': 'Invalid boat_id or load_id' });
        } 

        else if(boat.owner != owner || load.owner != owner) {
            res.status(403).json({"Error": "You are not authorized to access this boat or this load"});
        }
        else if(load.carrier != null && load.carrier != null) {
            res.status(403).json({"Error": "This load is already stored on another boat"})
        }
        else {
            const url = getURL(req);
            put_load_in_boat(load, boat, url)
            .then((boat) => {
                res.status(200).json(boat);
            });
        }
    })
    
});


router.delete('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});


router.delete('/:id', function(req, res){

    if(!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
        res.status(401).json({'Error': 'The JWT was not provided or is invalid'});
        return;
    }

    let token = req.headers.authorization.substring(7, req.headers.authorization.length);


    client.verifyIdToken({
        idToken: token,
        audience: client_id,
    }).then((ticket) => {
        const payload = ticket.getPayload();
        const owner = payload['sub'];
        get_boat(req.params.id, url)
        .then((boat) => {
            if (boat === undefined || boat === null) {
                res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
            } 
            else if(boat.owner != owner) {
                res.status(403).json({"Error": "You are not authorized to access this boat"});
            }
            else {
                delete_boat(req.params.id).then(res.status(204).end())
            }
        })
        .catch((error) => {
            console.error(error);
            res.status(403).json({"Error": "The boat you are trying to delete does not exist or is owned by someone else."});
        })
    }).catch((error) => {
        console.error(error);
        res.status(401).json({"Error": "You don't have authorization to access this resource."});
        return;
    });
});

/* ------------- End Controller Functions ------------- */

module.exports = router ;