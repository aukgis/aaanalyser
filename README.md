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
sudo apt-get install python-gdal
```

For installing Javascript dependencies (see below) and building the
distribution files from source:

```
sudo apt-get install npm nodejs-legacy
sudo npm install -g uglify-js browserify exorcist

```
