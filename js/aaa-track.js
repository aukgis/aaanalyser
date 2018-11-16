var reqwest = require('reqwest');
var simplify = require('simplify-js');
var toGeoJSON = require('togeojson');
var DOMParser = require('xmldom').DOMParser;

var aaa = require('./aaa-base.js');

/*
 * Divides the track up into SIZE (1km) bins
 * for partial AAA searching
 */
function AAATrackBin (start) {
    this.start = start;
    this.length = 0.0;
    this.climbing = 0.0;
    this.offset = 0;
}

AAATrackBin.prototype = {
    constructor: AAATrackBin,

    rate: function() {
        return this.climbing / this.length;
    }
}

/*
 * Encapsulate everything to do with the track
 */
function AAATrack (myParent) {
    this.p = myParent;
    this.timing = 0.0;
    this.geometry = null;
    this.coordinates = [];
    this.distance = 0.0;
    this.climbing = 0.0;
    this.warnings = [];
    this.bins = [];
    this.aaaPoints = 0.0;
    this.aaaStart = 0.0;
    this.aaaDistance = 0.0;
    this.aaaClimbing = 0.0;
    this.resampleSettings = null;
    this.gapDetected = false;
    this.skipGaps = false;
}

AAATrack.prototype = {
    constructor: AAATrack,
    
    loadGPX: function (text) {
        var dom = (new DOMParser()).parseFromString(text, 'text/xml');
        this.geometry = toGeoJSON.gpx(dom);
        if (this.geometry.features.length == 0) {
            this.warnings.push('Invalid GPX');
            return;
        }
        this.coordinates = [];
        for (var i = 0; i < this.geometry.features.length; i++) {
            var g = this.geometry.features[i].geometry;
            if (g.type == 'LineString') {
                this.coordinates = this.coordinates.concat(g.coordinates);
            } else if (g.type == 'MultiLineString') {
                for (var j = 0; j < g.coordinates.length; j++) {
                    this.coordinates = this.coordinates.concat(g.coordinates[j]);
                }
            } 
        }
        // Reduce original geometry to single track
        this.geometry.features[0].geometry.type = 'LineString';
        this.geometry.features[0].geometry.coordinates = this.coordinates;
        this.geometry.features.length = 1;
    },

    sourceCoordinates: function () {
        if (this.geometry.features.length == 0)
            return [];
        else
            return this.geometry.features[0].geometry.coordinates;
    },

    asGeometry: function() {
        // Clone the original geometry and drop in any correct (reduced) line coordinates
        var geo = JSON.parse(JSON.stringify(this.geometry));
        geo.features[0].geometry.coordinates = this.coordinates;
	return geo;
    },

    process: function() {
        // Most likely due to load failure above
        if (this.coordinates.length == 0)
            this.p.displayResults();
        else if (this.resampleSettings)
            this.resample();
        else
            this.analyse();
    },

    /*
     * Take the supplied track and resample, using following process:
     *   - simplify track to remove noise and make recorded and planned tracks
     *     equivalent, using filtering value derived empirically
     *   - build new track containing points every 'sampleLength' for elevation
     *     lookup, this handles both over and under sampling
     *   - lookup elevations via callback, then apply these values to all points
     */
    resample: function () {
        // simplify() takes an x,y tuple, so need to reformat array each way
        var source = this.sourceCoordinates();
        var simplified = simplify(source.map(function(c) { return {'x': c[0], 'y': c[1]}; }), aaa.SIMPLIFY_TOLERANCE);
        simplified = simplified.map(function(c) { return [c.x, c.y]; });
        // Resample on a regular basis
        var samples = [simplified[0]];
        // And also add these back into the original to 'bind' elevations to
        var active = [simplified[0]];
        var sampleOffset = 1;
        var sampleLength = this.resampleSettings.length / 1000.0;
        var d = 0.0;
        for (var i = 1; i < simplified.length; i++) {
            var curr = simplified[i];
            var prev = simplified[i-1];
            var l = aaa.distanceBetweenCoordinates(curr, prev);
            if (l == 0.0)
                continue;
            if (l > aaa.MAX_TRACK_SAMPLE_GAP) {
                this.warnings.push('Gap in track from ' + d.toFixed(1) + ' km to ' + (d + l).toFixed(1) + ' km.');
                this.gapDetected = true;
            }
            while ((d + l) > (sampleOffset * sampleLength)) {
                var ratio = ((sampleOffset * sampleLength) - d) / l;
                // Linear interpolation not strictly correct here, but can assume flat earth for this scale of interpolation?
                var resampled = [prev[0] + ratio * (curr[0] - prev[0]), prev[1] + ratio * (curr[1] - prev[1])];
                samples.push(resampled);
                if (!this.skipGaps || l < aaa.MAX_TRACK_SAMPLE_GAP)
                    active.push(resampled);
                sampleOffset++;
            }
            // Include the original point as well so not to shorten the route & not reduce elevation!
            active.push(curr);
            if (i == (simplified.length - 1))
                samples.push(curr);
            d += l;
        }
        this.coordinates = active;
        var track = this;
        reqwest({
            url: aaa.SERVER_BASE_URL + '/elevations',
            method: 'post',
            type: 'json',
            contentType: 'application/json',
            data: JSON.stringify({'coordinates': samples, 'source': this.resampleSettings.source}),
            success: function (resp) {
                track.resampleHandler(resp);
            },
            error: function (err) {
                console.log('Reqwest Error: '+ err);
                track.warnings.push('Error retrieving elevations for track.');
                //FIXME: This seems wrong - don't want to show stats / graph?
                track.p.displayResults();
            }
        });
    },
    
    resampleHandler: function(response) {
        // This is rather fragile, assumes elevation list corresponds to above samples
        var elevations = response['elevations'];
        this.warnings = this.warnings.concat(response['errors']);
        var d = 0.0;
        var sampleLength = this.resampleSettings.length / 1000.0;
        this.coordinates[0][2] = elevations[0];
        for (var i = 1; i < this.coordinates.length; i++) {
            var l = aaa.distanceBetweenCoordinates(this.coordinates[i], this.coordinates[i-1]);
            d += l;
            var offset = Math.ceil(d / sampleLength);
            this.coordinates[i][2] = elevations[offset];
        }
        this.timing = response['timing'];
        this.analyse();
    },

    analyse: function() {
        // Convert any 2D coordinates to 3D
        for (var i = 0; i < this.coordinates.length; i++) {
            if (this.coordinates[i].length < 3) 
                this.coordinates[i].push(0.0)
        }
        var bin = new AAATrackBin(0.0);
        this.bins = [bin];
        var last = this.coordinates[0];
        this.distance = 0.0;
        this.climbing = 0.0;
        this.elevation = [[0.0, last[2]]];
        for (var i = 1; i < this.coordinates.length; i++) {
            var c = this.coordinates[i];
            var d = aaa.distanceBetweenCoordinates(last, c);
            if ((d + bin.length) > aaa.TRACK_BIN_SIZE) {
                bin = new AAATrackBin(this.distance); 
                bin.offset = i;
                this.bins.push(bin);
            }
            bin.length += d;
            this.distance += d;
            this.elevation.push([this.distance, c[2]]);
            if (c[2] > last[2]) {
                bin.climbing += c[2] - last[2];
                this.climbing += c[2] - last[2];
            }
            last = c;
        }
        this.aaaPoints = 0.0;
        this.aaaStart = 0.0;
        this.aaaDistance = 0.0;
        this.aaaClimbing = 0.0;
        if (this.climbing >= aaa.minimumClimbingForDistance(this.distance)) {
            this.aaaPoints = aaa.pointsForClimbing(this.climbing);
            this.aaaDistance = this.distance;
            this.aaaClimbing = this.climbing;
        } 
        // Search for AAA section only over 100km
        else if (this.distance > 100) {
        // FIXME: Bins are no larger than 1km, so don't need to consider < 100 - this would need to adapt to bin.SIZE
            for (var i = this.bins.length - 2; i >= 100; i--) {
                for (var j = 0; j < (this.bins.length - i); j++) {
                    var c = 0;
                    var d = 0
                    for (var k = j; k < (i + j); k++) {
                        c += this.bins[k].climbing;
                        d += this.bins[k].length;
                    }
                    if (d > 100 && c >= aaa.minimumClimbingForDistance(d)) {
                        var p = aaa.pointsForClimbing(c);
                        // Find the section with the most points (favouring climbing in case of tie)
                        if (p >= this.aaaPoints && c > this.aaaClimbing) {
                            this.aaaPoints = p;
                            this.aaaStart = this.bins[j].start
                            this.aaaClimbing = c;
                            this.aaaDistance = d;
                        }
                    }
                }
            }
        }
        this.p.displayResults();
    },

    stats: function() {
        if (this.coordinates.length == 0)
            return
        var s = {'fields': [], 'values': [], 'units': []};
        s['fields'].push('Total Distance');
        s['values'].push(this.distance.toFixed(1));
        s['units'].push('km');

        s['fields'].push('Total Climbing');
        s['values'].push(this.climbing.toFixed(0));
        s['units'].push('m');

        if (this.aaaDistance > 0 && this.aaaDistance < this.distance) {
            s['fields'].push('AAA Climbing');
            s['values'].push(this.aaaClimbing.toFixed(0));
            s['units'].push('m');
            s['fields'].push('AAA Start');
            s['values'].push(this.aaaStart.toFixed(1));
            s['units'].push('km');
            s['fields'].push('AAA Distance');
            s['values'].push(this.aaaDistance.toFixed(1));
            s['units'].push('km');
        }

        s['fields'].push('AAA Points');
        s['values'].push(this.aaaPoints);
        s['units'].push('');
        
        s['fields'].push('Data Source');
        if (this.resampleSettings) {
            s['values'].push('Elevation model (' + this.resampleSettings.name + ')');
        } else {
            s['values'].push('GPX file');
        }
        s['units'].push('');

        if (aaa.DEBUG) {
            s['fields'].push('Min. Climbing Threshold');
            s['values'].push(aaa.minimumClimbingForDistance(this.distance).toFixed(0));
            s['units'].push('m');
            s['fields'].push('Min. Climbing Rate');
            s['values'].push(aaa.rateForDistance(this.distance).toFixed(2));
            s['units'].push('m/km');
        }
        return s;
    },
}

module.exports = AAATrack;
