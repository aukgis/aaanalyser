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

Get this respository, retrieve node.js dependencies (versions that worked
in testing, YMMV), build and install static bundle and index.html:

```
git clone https://github.com/aukgis/aaanalyser
cd aaanalyser/js
npm install reqwest@2.0.5 simplify-js@1.2.3 @mapbox/togeojson@0.16.0 xmldom@0.1.27 leaflet@1.4.0 brfs@1.4.3 browserify@16.2.3 uglify-js@3.4.9 exorcist@1.0.1 tcx@0.1.0
# Avoid having to install nodejs-legacy at the system level
ln -s /usr/bin/nodejs node_modules/.bin/node
cd ..
./install
```

Setup webserver, sample config in `etc/apache2_aukgis.conf`. For development, can run
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
### CentOS 7 Alternative Installation Notes

Setup up Python environment:
```
virtualenv --python=python2.7 ~/env
source ~/env/bin/activate
pip install --upgrade pip
pip install scipy Affine shapely flask
```

Install GDAL from source:
```
sudo yum install proj-devel SFCGAL-devel
mkdir build && cd build
https://github.com/OSGeo/gdal/archive/v2.3.2.tar.gz
tar xvfz v2.3.2.tar.gz
cd gdal-2.3.2/gdal
./configure --with-python=/home/aukgis/env/bin/python
make
su
make install
echo "/usr/local/lib" > /etc/ld.so.conf.d/local.conf
ldconfig
```

Use nginx for the main server (see `etc/nginx_aukgis.conf`),
with apache's mod_wsgi for the dem server (`etc/httpd_aukgis.conf`).

