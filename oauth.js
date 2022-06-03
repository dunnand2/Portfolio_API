const {OAuth2Client} = require('google-auth-library');

const client_id = '59733396940-3rk1q1mquia5av6f7ssq517qqotq4rnc.apps.googleusercontent.com';
const client = new OAuth2Client(client_id);

async function checkToken(token) {
    return client.verifyIdToken({idToken: token, audience: client_id})
}

function getTokenOwner(ticket) {
    const payload = ticket.getPayload();
    return payload['sub'];
}

module.exports = {
    checkToken: checkToken,
    getTokenOwner: getTokenOwner
};