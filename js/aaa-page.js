var leaflet = require('leaflet');
var reqwest = require('reqwest');

var aaa = require('./aaa-base.js');
var AAATrack = require('./aaa-track.js');

function AAAPage () {
    this.track = null;
    this.preset = 'GB';
    this.gpxFile = null;
    this.gpxURL = null;
    this.parseURL();
    // Delay displaying the form until this has loaded and parsed any URL
    document.getElementById('form').style.display = 'block';
}

AAAPage.prototype = {
    constructor: AAAPage,

    parseURL: function() {
        var url = window.location.href;
        var parts = url.split('?');
        var query, attributes = {};
        if (parts.length > 1) {
            query = parts[1].split('&');
            query.map(function(q) {
                var split = q.split('=');
                attributes[split[0]] = split[1];
            });
        }
        this.gpxURL = attributes['gpx'];
	if (this.gpxURL) {
	    document.getElementById('input').innerHTML = 'Reading GPX from ' + this.gpxURL;
            document.getElementById('load').disabled = false;
        }
        aaa.DEBUG = attributes['debug'] ? 1 : 0;
        if (aaa.DEBUG)
            document.getElementById('debug-input').style.display = 'block';
    },

    initMap: function() {
        this.trackLayer = null;
        var osmLayer = L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' });
        this.map = L.map('map', {layers: [osmLayer], scrollWheelZoom: false, touchZoom: false}).setView([54.5, -4], 6);
    },

    load: function() {
        document.getElementById('spinner').style.display = 'block';
	var track = new AAATrack(this);
        if (aaa.DEBUG) {
            this.preset = 'DEBUG';
            var l = document.getElementById('debug-sample-length');
            var s = document.getElementById('debug-dem-source');
            aaa.PRESETS['DEBUG'] = {'name': 'Debug',
                'length': l.value,
                'source': s.options[s.selectedIndex].text
            };
        }
        track.resampleSettings = document.getElementById('resample').checked ? aaa.PRESETS[this.preset] : null;
        track.skipGaps = (document.getElementById('skip-gaps') && document.getElementById('skip-gaps').checked);
        this.track = track;
        // Don't hide old results if we're reanalysing same file
        if (this.gpxURL || this.gpxFile != document.getElementById('file').files[0]) {
            document.getElementById('warnings').style.display = 'none';
            document.getElementById('stats').style.display = 'none';
            document.getElementById('chart').style.display = 'none';
            if (this.trackLayer)
                this.map.removeLayer(this.trackLayer);
            this.trackLayer = null;
        }
        if (this.gpxURL) {
            // FIXME: Should escape the url here, or just use POST?
            var url = aaa.SERVER_BASE_URL + '/gpx?url=' + this.gpxURL;
            if (aaa.DEBUG) console.log('URL: %s', url);
	    reqwest({
		url: url,
		method: 'get',
                type: 'json',
                contentType: 'application/json',
		success: function (response) {
                    if (response && response['gpx']) {
                        track.loadGPX(response['gpx']);
                        track.process();
                    } else {
                        if (aaa.DEBUG) console.log(response);
                        track.warnings.push('Error retrieving GPX URL.');
                        track.p.displayResults();
                    }
		},
		error: function (err) {
		    if (aaa.DEBUG) console.log('Reqwest Error: '+ err);
		    track.warnings.push('Error retrieving GPX URL.');
		    track.p.displayResults();
		}
            });
        } else {
            this.gpxFile = document.getElementById('file').files[0];
            var reader = new FileReader();
            reader.onload = function(e) {
                track.loadGPX(reader.result);
                track.process();
            };
            reader.readAsText(this.gpxFile);
        }
    },

    displayResults: function() {
        document.getElementById('spinner').style.display = 'none';
        var html = '';
        if (this.track.warnings.length > 0) {
            html = this.track.warnings.length == 1 ? 'Warning:' : 'Warnings:';
            html += '<ul><li>' + this.track.warnings.join('</li><li>') + '</li></ul>';
        }
        document.getElementById('warnings').innerHTML = html;
        document.getElementById('warnings').style.display = 'block';
        var stats = this.track.stats();
        if (stats) {
            html = 'Results:<ul>';
            for (var i = 0; i < stats['fields'].length; i++) {
                html += '<li>' + stats['fields'][i] + ': ' + stats['values'][i] + ' ' + stats['units'][i] + '</li>';
            }
            html += '</ul>';
            document.getElementById('stats').innerHTML = html;
            document.getElementById('stats').style.display = 'block';
            this.plotChart();
            if (this.track.gapDetected)
                document.getElementById('skip-gaps-container').innerHTML = '<input type="checkbox" id="skip-gaps"' + (this.track.skipGaps ? 'checked' : '') + '/> Skip gaps in track';
            else
                document.getElementById('skip-gaps-container').innerHTML = '';
            this.updateMap();
        }
    },

    updateMap: function() {
        if (!this.map)
            this.initMap();
        if (this.trackLayer)
            this.map.removeLayer(this.trackLayer);
        this.trackLayer = L.geoJSON(this.track.asGeometry(), { style: {'color': '#0010C0', 'opacity': 0.7}}).addTo(this.map);
        document.getElementById('map').style.display = 'block';
        this.map.fitBounds(this.trackLayer.getBounds());
        this.map.invalidateSize();
    },

    plotChart: function() {
        document.getElementById('chart').style.display = 'block';
        // TODO: consider simplifying geometry prior to plotting, to speed this up?
        var elevation = this.track.elevation;
        var dist = this.track.distance;
        var climb = this.track.climbing;
        var chart = [
            { yaxis: 1, label: '10km average climb rate', color: "rgba(0, 16, 128, 0.9)", lines: { lineWidth: 2 }, data: [] },
            { yaxis: 1, label: 'Average climb rate', color: "rgba(0, 16, 128, 0.5)", lines: { lineWidth: 2 }, data: [[0, climb/dist], [dist, climb/dist]] },
            { yaxis: 1, label: 'AAA minimum rate', color: "rgba(128, 16, 16, 0.5)", lines: { lineWidth: 2 }, data: [[0, aaa.rateForDistance(dist)], [dist, aaa.rateForDistance(dist)]] },
            { yaxis: 2, label: 'Altitude', color: "rgba(0, 16, 128, 0.15)", lines: { lineWidth: 0.5, fill: true, fillColor: "rgba(0, 16, 128, 0.1)" }, data: elevation  },
        ];
        if (this.track.aaaPoints && this.track.aaaDistance != dist) {
            chart.push({ label: 'AAA section rate', data: [[this.track.aaaStart, 0], [this.track.aaaStart, aaa.rateForDistance(this.track.aaaDistance)], [this.track.aaaStart + this.track.aaaDistance, aaa.rateForDistance(this.track.aaaDistance)], [this.track.aaaStart + this.track.aaaDistance, 0]], yaxis: 1, color: "rgba(16, 128, 16, 0.3)", lines: {lineWidth: 1, fill: true, fillColor: "rgba(16, 128, 16, 0.1)"} });
        }
        // Coalesce into 10km sections for visibility - FIXME: hardcoded bin size dependency
        for (var i = 0; i < this.track.bins.length; i += 10) {
            var j = 0, d = 0, c = 0;
            for (; j < 10; j++) {
                if ((i + j) >= this.track.bins.length)
                    break;
                c += this.track.bins[i+j].climbing;
                d += this.track.bins[i+j].length;
            }
            chart[0].data.push([this.track.bins[i].start, c / d])
            chart[0].data.push([this.track.bins[i+j-1].start + this.track.bins[i+j-1].length, c / d])
        }

        var plot = $.plot("#chart", chart, {
            xaxes: [ { tickFormatter: function(v, axis) {return ''+v+' km';} } ],
            yaxes: [ { min:0, max:35, tickFormatter: function(v, axis) {return ''+v+' m/km';} },
                     { min:0, tickFormatter: function(v, axis) {return ''+v+' m';}, position: 'right' } ],
            legend: { position: "nw" },
            crosshair: { mode: "x" },
            grid: { hoverable: true, autoHighlight: false },
        });
        // Interactivity between chart and map...
        if (!this.chartCursor)
            this.chartCursor = L.circleMarker([0, 0], { color: 'white', fillColor: '#028', fillOpacity: 0.5, radius: 6 });
        var updateLegendTimeout = null;
        var pos = null;
        var page = this;
        function updateLegend() {
            updateLegendTimeout = null;
            var axes = plot.getAxes();
            if (pos.x > axes.xaxis.min && pos.x < axes.xaxis.max && pos.y > axes.yaxis.min && pos.y < axes.yaxis.max) {
                // Use the bins to quickly locate the approximate region - could refine it from here
                var offset = 0;
                for (var i = 0; i < page.track.bins.length; i++) {
                    if (pos.x < page.track.bins[i].start) {
                        offset = page.track.bins[i - 1].offset;
                        if (aaa.DEBUG) console.log(page.track.coordinates[offset][1].toFixed(2), page.track.coordinates[offset][0].toFixed(2));
                        break;
                    }
                }
                page.chartCursor.setLatLng(L.latLng(page.track.coordinates[offset][1], page.track.coordinates[offset][0]));
                if (!page.chartCursor._map)
                    page.chartCursor.addTo(page.map);
            }
        }
        function removeLegend() {
            if (page.chartCursor)
                page.map.removeLayer(page.chartCursor);
        }
        $("#chart").bind("plothover",  function (event, newPos, item) {
            pos = newPos;
            if (!updateLegendTimeout) {
                updateLegendTimeout = setTimeout(updateLegend, 50);
            }
        });
        $("#chart").bind("mouseout",  function (event, newPos, item) {
            setTimeout(removeLegend, 50);
        });
    },
}

module.exports = AAAPage;
