editor511
=========

Client side mapping application to configure map viewer component of 511 projects sites.

Given projectConfigTemplate.json as a starting point, the user can digitize closures, 
detours, and other linear features.  Order of layer groups and individual features can be 
changed by dragging groups or individual features.  

There are four configuration parameters at the application level.
1. bounds - The min/max lat/lng of the project.  Inventory features and winter road condition and current speed 
  segments that intersect the spatial range are displayed on the viewer side of the application.  The area
  outside of this extent is displayed with transparent grey.
2. initialExtent - The map center and zoom displayed on page load.
3. projectPointLocation.  The user defined center point of the project.  This can be used to define the project
  location on the 511 projects landing page map.
4. showLayers - The startup visibility of layers for inventory features (cameras, message signs, lane closures),
  current travel speed segments, and winter road conditions segments.  

Of note is that Leaflet has a peculiar way of organizing layers and features from the point of view of 
a GIS data set.  Within desktop GIS, a layer is thought of as a combination of a collection of features and
the style definition.  However, Leaflet adds an additional tier.  A GeoJson "layer" is created from
geojson data.  However, this "layer" is really a layer group with each layer containing a single feature and
style information.  Keep this in mind when reading comments as individual features are referred to as sublayers or
features with these terms being synonymous.  




editor511
