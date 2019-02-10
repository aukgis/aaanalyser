#!/usr/bin/env python

import os, re, struct
from os.path import expanduser
from osgeo import ogr, osr, gdal
from affine import Affine
from math import floor
from scipy import interpolate
from shapely.geometry import Polygon, Point

DEM_DIR = expanduser('~/data/dem')
# From http://download.geofabrik.de/europe/great-britain.poly - could do better!
GB_EXTENT = (
(   9.805678E-01 , 5.059591E+01),
(   5.807600E-02 , 5.010375E+01),
(   -1.246112E+00,  4.989032E+01),
(   -2.027284E+00,  4.977612E+01),
(   -2.020900E+00,  4.976352E+01),
(   -2.031990E+00,  4.976171E+01),
(   -1.808598E+00,  4.910263E+01),
(   -1.835368E+00,  4.900443E+01),
(   -3.940324E+00,  4.915592E+01),
(   -7.024780E+00,  4.970097E+01),
(   -5.441616E+00,  5.278017E+01),
(   -5.206178E+00,  5.377268E+01),
(   -5.488813E+00,  5.486510E+01),
(   -6.208707E+00,  5.533747E+01),
(   -6.604158E+00,  5.543057E+01),
(   -7.148041E+00,  5.566455E+01),
(   -1.486751E+01,  5.746894E+01),
(   -1.499070E+01,  5.768017E+01),
(   -1.208287E+01,  5.853333E+01),
(   -1.637515E+00,  6.113564E+01),
(   -2.670263E-01,  6.110300E+01),
(   1.278458E-01 , 5.976591E+01),
(   9.781600E-02 , 5.942198E+01),
(   7.998970E-01 , 5.579959E+01),
(   1.678940E+00 , 5.451369E+01),
(   2.250000E+00 , 5.258000E+01),
(   1.951517E+00 , 5.118620E+01),
(   9.805678E-01 , 5.059591E+01)
)

def elevations(coordinates, source='OS50_bicubic'):
    result = {'errors': [], 'elevations': []}
    points = []
    for c in coordinates:
        p = ogr.Geometry(ogr.wkbPoint)
        p.AddPoint(c[0], c[1])
        points.append(p)

    match = re.search('^(\w+)_(\w+)', source)
    if not match:
        result['errors'] = ['Failed to extract filename and interpolation from source: %s' % source]
        return result
    model = match.group(1)
    interp = match.group(2)
    vrt = os.path.join(DEM_DIR, '%s.vrt' % model)
    if not os.path.exists(vrt):
        result['errors'] = ['DEM source not found for %s' % model]
        print(result)
        return result
    if model == 'OS50':
        gb = Polygon(GB_EXTENT)
        out_of_area = 0
        for c in coordinates:
            p = Point(c)
            if not gb.contains(p):
                out_of_area += 1
        if out_of_area:
           result['errors'].append('%d points appear to be out of the area of coverage' % out_of_area)
    # Check for srtm1/bil/n50_w001_1arc_v3.bil 
    if model == 'SRTM1':
        tiles = {}
        for c in coordinates:
            tiles['%s%02d_%s%03d' % ('s' if c[1] < -1 else 'n', abs(c[1]), 'w' if c[0] < -1 else 'e', abs(c[0]))] = 1
        for t in sorted(tiles.iterkeys()):
            if not os.path.exists(os.path.join(DEM_DIR, 'srtm1/bil/%s_1arc_v3.bil' % t)):
                result['errors'].append('Missing tile %s' % t)
    result['elevations'] = extract_points_from_raster(points, vrt, interp)
    return result

def extract_points_from_raster(points, filename, interp=None):
    gdal.UseExceptions()
    data_source  = gdal.Open(filename)
    # Convert point co-ordinates so that they are in same projection as raster
    point_sr = osr.SpatialReference()
    point_sr.ImportFromEPSG(4326)
    raster_sr = osr.SpatialReference()
    raster_sr.ImportFromWkt(data_source.GetProjection())
    transform = osr.CoordinateTransformation(point_sr, raster_sr)
    forward_transform = Affine.from_gdal(*data_source.GetGeoTransform())
    reverse_transform = ~forward_transform

    # Extract pixel value - hardcoded to band 1
    band = data_source.GetRasterBand(1)
    elevations = []
    for point in points:
        point.Transform(transform)
        # Convert geographic co-ordinates to pixel co-ordinates
        x, y = point.GetX(), point.GetY()
        px, py = reverse_transform * (x, y)
        try:
            if interp == 'bilinear':
                fx, fy = floor(px), floor(py)
                # x & y are transposed when read for use in Z, so flip here
                X, Y = [fy, fy + 1], [fx, fx + 1]
                structval = band.ReadRaster(fx, fy, 2, 2, buf_type=gdal.GDT_Float32)
                Z = struct.unpack('ffff', structval)
                f = interpolate.interp2d(X, Y, Z, 'linear')
                result = f(py, px)[0]
            elif interp == 'bicubic':
                fx, fy = floor(px), floor(py)
                # x & y are transposed when read for use in Z, so flip here
                X = [fy - 1, fy, fy + 1, fy + 2]
                Y = [fx - 1, fx, fx + 1, fx + 2]
                structval = band.ReadRaster(fx - 1, fy - 1, 4, 4, buf_type=gdal.GDT_Float32)
                Z = struct.unpack('ffffffffffffffff', structval)
                #print 'Z: %r' % (Z, )
                f = interpolate.interp2d(X, Y, Z, 'cubic')
                result = f(py, px)[0]
            else:
                px, py = int(px + 0.5), int(py + 0.5)
                structval = band.ReadRaster(px, py, 1, 1, buf_type=gdal.GDT_Float32)
                result = struct.unpack('f', structval)[0]
        # Swallow all errors for now, should return to caller?
        except Exception as e:
            if len(elevations):
                result = elevations[-1]
            else:
                result = -10000
        elevations.append(result)
    return elevations

if __name__ == "__main__":
    #gdallocationinfo -xml -wgs84 ~/data/dem/OS50.vrt -4.075 53.068

    print elevations([[-4.075, 53.068]])
    print elevations([[-4.075, 53.068]], 'OS50_bilinear')
    print elevations([[-24.075, 53.068]], 'OS50_bilinear')
    print elevations([[-4.075, 53.068], [-24.075, 53.068]], 'OS50_bilinear')
    print elevations([[-4.075, 53.068]], 'SRTM1_bilinear')

