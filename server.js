const express = require('express');
const app = express();
const router = express.Router();

const boats = require('./routes/boats');
const oauth = require('./routes/oauth');

app.enable('trust proxy');


app.use('/boats', boats);
app.use('/', oauth.router);



// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});
