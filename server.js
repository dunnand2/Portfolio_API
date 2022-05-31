const {google} = require('googleapis');
const url = require('url');
const {Datastore} = require('@google-cloud/datastore');
const axios = require('axios').default;
const express = require('express');
const {OAuth2Client} = require('google-auth-library');

const app = express();
const datastore = new Datastore();
const router = express.Router();

app.use(express.json());

const BOAT = 'boats';

fromDatastore = function fromDatastore(item, url){
    item.id = item[Datastore.KEY].id;
    item.self = url + '/' + item.id;
    return item;
}

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

/* ------------- Begin Boat Model Functions ------------- */
function post_boat(name, type, length, public, sub, url) {
    var key = datastore.key(BOAT);
    const new_boat = { "name": name, "type": type, "length": length, "public": public, "owner": sub};
    return datastore.save({"key": key, "data": new_boat})
    .then(() => {
        new_boat.id = key.id;
        new_boat.self = url + '/boats/' + key.id;
        return new_boat;
    });
}

function get_boats() {
    const q = datastore.createQuery(BOAT);
    return datastore.runQuery(q).then((entities) => {
        return entities[0].map(fromDatastore);
    });
}

function get_boat(id, url){
    const key = datastore.key([BOAT, parseInt(id,10)]);
    return datastore.get(key).then( (data) => {
        if(data[0] == undefined || data[0] == null) {
            return data[0];
        }
            return fromDatastore(data[0], url);
        }
    );
}

function delete_boat(id){
    const key = datastore.key([BOAT, parseInt(id,10)]);
    return datastore.delete(key);
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get('/boats', function(req, res){
    let token = false;
    if (req.headers.authorization) {
        token = req.headers.authorization.substring(7, req.headers.authorization.length);
    }
     
    oauth2Client.verifyIdToken({
        idToken: token,
        audience: client_id,
    }).then((ticket) => {
        const payload = ticket.getPayload();
        const owner = payload['sub'];
        get_boats()
        .then((boats) => {
            let ownedBoats = []
            for (let boat of boats) {
                if (boat.owner == owner) {
                    ownedBoats.push(boat);
                }
            }
            res.status(200).json(ownedBoats);
        });
    }).catch((error) => {
        console.error(error);
        get_boats()
        .then((boats) => {
            let publicBoats = []
            for (let boat of boats) {
                if (boat.public == true) {
                    publicBoats.push(boat);
                }               
            }
            res.status(200).json(publicBoats);
        });
    });

});

router.get('/owners/:owner_id/boats', function(req, res){
    const url = getURL(req);
    get_boats()
	.then( (boats) => {
        let ownedBoats = []
        for (let boat of boats) {
            if (boat.owner == req.params.owner_id && boat.public == true) {
                ownedBoats.push(boat);
            }
            
        }
        res.status(200).json(ownedBoats);
    });
});

router.post('/boats', function(req, res){
    if(req.get('content-type') !== 'application/json'){
        res.status(415).send('Server only accepts application/json data.');
        return;
    }
    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        res.status(406).send('Not Acceptable');
        return;
    }
    if (req.body.name === undefined || req.body.type === undefined || req.body.length === undefined || req.body.public === undefined) {
        res.status(400).json({'Error': 'The request object is missing at least one of the required attributes'});
        return;
    }

    if(!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
        res.status(401).json({'Error': 'The JWT was not provided or is invalid'});
        return;
    }

    let token = req.headers.authorization.substring(7, req.headers.authorization.length);

    oauth2Client.verifyIdToken({
        idToken: token,
        audience: client_id,
    }).then((ticket) => {
        const payload = ticket.getPayload();
        const userid = payload['sub'];
        const url = getURL(req);
        post_boat(req.body.name, req.body.type, req.body.length, req.body.public, userid, url)
        .then(boat => {res.status(201).json(boat)});
    }).catch((error) => {
        console.error(error);
        res.status(401).json({'Error': 'The JWT was not provided or is invalid'});
        return;
    });
});

router.delete('/boats', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});


router.delete('/boats/:id', function(req, res){

    let token = false;
    if (req.headers.authorization) {
        token = req.headers.authorization.substring(7, req.headers.authorization.length);
    }

    oauth2Client.verifyIdToken({
        idToken: token,
        audience: client_id,
    }).then((ticket) => {
        const payload = ticket.getPayload();
        const owner = payload['sub'];
        get_boat(req.params.id, url)
        .then((boat) => {
            if (boat == undefined || boat == null || boat.owner != owner) {
                res.status(403).json({"Error": "The boat you are trying to delete does not exist or is owned by someone else."});
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

/* Oauth/JWT Routes and functions*/
  
const client_id = '59733396940-3rk1q1mquia5av6f7ssq517qqotq4rnc.apps.googleusercontent.com';
const client_sec = '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';
  

const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_sec,
    'http://localhost:8080/oauth'
  );

const scopes = [
    'https://www.googleapis.com/auth/userinfo.profile'
];




// Generate a url that asks permissions for the Drive activity scope
const authorizationUrl = oauth2Client.generateAuthUrl({
    // 'online' (default) or 'offline' (gets refresh_token)
    access_type: 'online',
    /** Pass in the scopes array defined above.
      * Alternatively, if only one scope is needed, you can pass a scope URL as a string */
    scope: scopes,
    // Enable incremental authorization. Recommended as a best practice.
    include_granted_scopes: true
  });

async function checkToken(token) {

    oauth2Client.verifyIdToken({
        idToken: token,
        audience: client_id,  // Specify the CLIENT_ID of the app that accesses the backend
        // Or, if multiple clients access the backend:
        //[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3]
    }).then((ticket) => {
        payload = ticket.getPayload();
        let userid = payload['sub'];
        return userid
    }).catch((error) => {
        console.error(error);
    });
    
}

router.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

router.get('/oauth', async function(req, res){
    // Receive the callback from Google's OAuth 2.0 server.
    if (req.url.startsWith('/oauth')) {
        // Handle the OAuth 2.0 server response
        let q = url.parse(req.url, true).query;
        console.log(q);
        // Get access and refresh tokens (if access_type is offline)
        let { tokens } = await oauth2Client.getToken(q.code);
        let html = '<h1>Here is your Google JWT!</h1>' +
        '<h2>' + tokens.id_token +'</h2>';
        oauth2Client.setCredentials(tokens);
        res.send(html);
        //checkToken(tokens.id_token);
        checkToken(tokens.id_token);
    }

    else {
        res.status(401).json({"Error": "Invalid state provided"});
    }

});

router.get('/redirect', function(req, res) {
    res.writeHead(301, { "Location": authorizationUrl });
    res.end();
})

/* End of Oauth/JWT Routes and functions*/

/* ------------- End Controller Functions ------------- */

app.use('/', router);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});