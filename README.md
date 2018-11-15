AAAnalyser
=========

A tool for calculating climbing and AAA points for Audax UK events

Installation
------------

The following is based on a clean AWS Ubuntu 16.04 instance.

Web server for static html and WSGI for the DEM server:

```
sudo apt-get install apache2 libapache2-mod-wsgi
```

Various python dependencies for the DEM server, including the GIS
repository for GDAL, which should also pull in the command line tools for
building VRTs (see below):

```
sudo apt-get install python-scipy python-affine python-flask
sudo apt-get install python-setuptools python-dev python-pip
sudo add-apt-repository ppa:ubuntugis/ppa && sudo apt-get update
sudo apt-get install python-gdal gdal-bin python-shapely
```

For installing Javascript dependencies (see below) and building the
distribution files from source:

```
sudo apt-get install npm nodejs-legacy
sudo npm install -g uglify-js browserify exorcist
```

Get this respository, retrieve node.js dependencies (versions TBC),
build and install static bundle:

```
git clone https://github.com/aukgis/aaanalyser
cd aaanalyser/js
npm install reqwest simplify-js @mapbox/togeojson xmldom leaflet
cd ..
./install
```

Setup webserver, sample config in `etc/httpd`. For development, can run
the flask server directly (`server/server.py`) then proxy this through
apache, as opposed to using WSGI for the production site.

Retrieve the OS Terrain 50 ASCII Grid data from 
https://www.ordnancesurvey.co.uk/opendatadownload/products.html#TERR50
and unpack into somewhere like `~/data/dem/os_terrain50`. Build the
virtual XML file that references all the DTM files:
```
cd ~/data/dem
gdalbuildvrt OS50.vrt os_terrain50/data/*/*.asc
```

The SRTM DEM files need to be retrieved via https://earthexplorer.usgs.gov/
from Data Sets -> Digital Elevation -> SRTM -> SRTM 1 Arc-Second Global using
their bulk download tool into somewhere like ` ~/data/dem/srtm1/zip`. Unzip
and build the VRT:
```
cd ~/data/dem/srtm1/bil
ls -1 ../zip/*.zip | xargs -n 1 unzip
gdalbuildvrt SRTM1.vrt srtm1/bil/*.bil
```

