"use strict";

var AAAPage = require('./aaa-page.js');

global.aaaPage = new AAAPage();

if (aaaPage.gpxURL) aaaPage.load();

