const {google} = require('googleapis');
const url = require('url');
const {Datastore} = require('@google-cloud/datastore');
const express = require('express');
const {OAuth2Client} = require('google-auth-library');

const app = express();
const router = express.Router();

app.use(express.json());

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

    console.log(token);
    console.log(client_id);
    oauth2Client.verifyIdToken({
        idToken: token,
        audience: client_id,  // Specify the CLIENT_ID of the app that accesses the backend
        // Or, if multiple clients access the backend:
        //[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3]
    }).then((ticket) => {
        return ticket
        //payload = ticket.getPayload();
        //let userid = payload['sub'];
        //return userid
    }).catch((error) => {
        console.error(error);
    });
    
}

router.get('/', function(req, res){
    res.sendFile(__dirname + '../views/index.html');
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

module.exports = {
    router: router, 
    checkToken: checkToken
};