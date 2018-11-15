// Export everything here as psuedo-globals
var aaa = module.exports = {};

aaa.DEBUG = 0;

aaa.SERVER_BASE_URL = "http://aukgis.frrt.org/dem";

// Nominal track bin size, tradeoff between speed and accuracy
aaa.TRACK_BIN_SIZE = 1.0;

// Derived empirically through sample track analysis
aaa.MAX_TRACK_SAMPLE_GAP = 2.0;

// Set/approved by the AUK Board via sample track analysis
aaa.SIMPLIFY_TOLERANCE = 0.02 / 1000.0;
aaa.PRESETS = {
    'GB': {'name': 'GB', 'length': 200, 'source': 'OS50_bicubic'}
};

// In metres per km, see http://www.aukweb.net/results/aaa/aaavnts/aaaqual/
// and http://www.aukweb.net/results/aaa/aaaarch/ for definitions. Note that
// the rate varies linearly between the minimum climb definitions for 100,
// 200, 300, 400 and 600 - see intermediate examples in the web pages above.
aaa.rateForDistance = function (d) {
    var M100 = 1500 / 100;
    var M200 = 2800 / 200;
    var M300 = 4000 / 300;
    var M400 = 5100 / 400;
    var M600 = 7000 / 600;
    
    if (d >= 600)
        return M600;
    else if (d >= 400)
        return (M400 * ((600 - d) / 200)) + (M600 * ((d - 400) / 200));
    else if (d >= 300)
        return (M300 * ((400 - d) / 100)) + (M400 * ((d - 300) / 100));
    else if (d >= 200)
        return (M200 * ((300 - d) / 100)) + (M300 * ((d - 200) / 100));
    else if (d >= 100)
        return (M100 * ((200 - d) / 100)) + (M200 * ((d - 100) / 100));
    else
        return M100;
};

aaa.pointsForClimbing = function (c) {
    return Math.round(c / 250.0) / 4.0;
};

aaa.minimumClimbingForDistance = function (d) {
    return d * aaa.rateForDistance(d);
};

aaa.distanceBetweenCoordinates = function(c1, c2) {
    // From http://www.movable-type.co.uk/scripts/latlong.html - Great Circle distance (haversine formula)
    var φ1 = c1[1] * Math.PI / 180;
    var φ2 = c2[1] * Math.PI / 180;
    var Δφ = φ2 - φ1;
    var λ1 = c1[0] * Math.PI / 180;
    var λ2 = c2[0] * Math.PI / 180;
    var Δλ = λ2 - λ1;
    var R = 6371; // results in km
    var a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
	    Math.cos(φ1) * Math.cos(φ2) *
	    Math.sin(Δλ/2) * Math.sin(Δλ/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    var d = R * c;
    return d;
};
