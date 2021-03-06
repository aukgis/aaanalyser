#!/usr/bin/env python

import site
from os.path import expanduser
site.addsitedir(expanduser('~/env/lib/python2.7/site-packages'))

from flask import Flask, jsonify, abort, request
from json import dumps
import logging, re, socket, time, urllib2
import dem
from zipfile import ZipFile
from StringIO import StringIO

application = Flask(__name__)

def get_ip_address():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80))
    return s.getsockname()[0]

@application.route('/')
def index_page():
    return 'AUKGIS DEM server running.\n'

@application.route('/status')
def status_page():
    status = 'Connecting via %s\n' % get_ip_address()
    return status

@application.route('/elevations', methods=['POST'])
def elevations_page():
    result = {'errors': []}
    start = time.time()
    try:
        src = request.get_json()
        coordinates = src['coordinates']
    except:
        result['errors'] = ['Invalid input to the elevations lookup: %r' % request.data]
    else:
        if 'source' in src:
            result = dem.elevations(coordinates, src['source'])
        else:
            result = dem.elevations(coordinates)
    result['timing'] = time.time() - start
    return jsonify(result)

@application.route('/gpx', methods=['GET'])
def gpx_page():
    result = {'error': ''}
    url = request.args.get('url')
    # Basic URL sanitisation to avoid this becoming an open proxy
    if not url or not re.search('\.(gpx|zip)$', url):
        result['error'] = 'No/invalid URL specified.'
    else:
        try:
            response = urllib2.urlopen(url)
        except urllib2.URLError as e:
            result['error'] = 'Loading %s failed: %s' % (url, e.reason)
            print result['error']
        else:
            if re.search('zip$', url):
                zipfile = ZipFile(StringIO(response.read()))
                gpxfilename = zipfile.namelist()[0]
                if not re.search('gpx$', gpxfilename):
                    result['error'] = 'Invalid file: %s' % (gpxfilename, )
                    return jsonify(result)
                gpx = zipfile.read(gpxfilename)
                logging.debug(gpx[:100])
            else:
                gpx = response.read()
            # Check isn't arbitrarily small, and is XML
            if len(gpx) < 100 or gpx[:5].lower() != '<?xml':
                result['error'] = 'Invalid GPX.'
            else:
                result['gpx'] = gpx
    return jsonify(result)

@application.route('/analyse', methods=['GET'])
def analyse_page():
    url = request.args.get('url')

logging.getLogger("requests").setLevel(logging.WARNING)
if __name__ == '__main__':
    logging.basicConfig(format='%(levelname)s: %(message)s', level=logging.DEBUG)
    application.run(port=9999, debug=True)
else:
    logging.basicConfig(format='%(asctime)s %(levelname)s: %(message)s', datefmt='%Y-%m-%d %H:%M:%S', filename='/home/aukgis/log/dem_server.log', level=logging.INFO)


