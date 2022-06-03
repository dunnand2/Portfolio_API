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

module.exports = {
    getURL: getURL,
}