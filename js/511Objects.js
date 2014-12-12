/**
 * Created by gavorhes on 11/20/2014.
 */

/*a couple helper functions*/

//guids are used to uniquely identify groups and features
function guid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
        .replace(/[xy]/g, function (c) {
            var r =
                Math.random() * 16 | 0, v = c == 'x' ? r : r & 0x3 | 0x8;
            return v.toString(16);
        });
}

/*helper function for string replacement to keep code clean
 usage
 var aString = 'some{0}stuff{1}replaced';
 var c = 'cat';
 var b = 'bird';
 aString.format(c, b)  returns 'somecatstuffbirdreplaced'
 prettier than
 'some' + c + 'stuff' + b + 'replaced'
 but same effect
 adapted to take a single array that is used for replacement by position ie
 var arrReplacements = [c, b];
 aString.format(arrReplacements)
 */
if (!String.prototype.format) {
    String.prototype.format = function () {
        var args = arguments;
        for (var i = 0; i < args.length; i++) {
            args[i] = (args[i] ? args[i] : '');
        }

        //if the first argument is an array, use that
        if (args[0].constructor == Array) {
            args = args[0];
        }
        return this.replace(/{(\d+)}/g, function (match, number) {
            return typeof args[number] != 'undefined' ? args[number] : match;
        });
    };
}

//complementary functions to convert rgb to hex colors
function _hex(x) {
    var hexDigits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"];
    return isNaN(x) ? "00" : hexDigits[(x - x % 16) / 16] + hexDigits[x % 16];
}

function rgb2hex(rgb) {
    rgb = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    return ("#" + _hex(rgb[1]) + _hex(rgb[2]) + _hex(rgb[3])).toUpperCase();
}

//convert hex with optional alpha to rgb or rbga if alpha value is provided
function hexAlphaToRgbOrRgba(hexString, alphaVal) {
    hexString = ((hexString.charAt(0) == "#") ? hexString.substring(1, 7) : hexString);
    var r = parseInt(hexString.substring(0, 2), 16).toString();
    var g = parseInt(hexString.substring(2, 4), 16).toString();
    var b = parseInt(hexString.substring(4, 6), 16).toString();
    if (alphaVal) {
        return 'rgba({0}, {1}, {2}, {3})'.format((r || 0), (g || 0), (b || 0), alphaVal);
    } else {
        return 'rgb({0}, {1}, {2})'.format((r || 0), (g || 0), (b || 0));
    }
}

//adds alpha value to rgb string 'rgb(r, b, g)', returns 'rgba(r, g, b, a)'
function rgbToRgba(rgb, alpha) {
    var pieces = rgb.split(',');
    pieces[0] = pieces[0].replace('rgb', 'rgba')
    pieces[2] = pieces[2].replace(')', '');
    pieces.push(' ' + alpha.toFixed(1) + ')');
    return pieces.join(',')
}

//Inventory layer for signs, cameras, incidents, lane closures, and travel speeds
function InventoryLayer(inventoryLayerProps) {
    /*inventoryLayerProps objects
     expected properties are
     layerName: string
     rootGetUrl: string, location of api currently at http://www.topslab.wisc.edu/its/inventory/api but will be moved
     getParams: object [
     L: float, min longitude
     R: float, max longitude
     B: float, min latitude
     T: float, max latitude
     }
     resource: string, resource defined by topslab api
     popupTemplate: string, html markup with string replacement placeholders
     ie '<p>Description: {0}<br/>Detour: {1}<br/>Start: {2}<br/>End: {3}</p>'
     popupPropertyNamesArr: array, feature property names as returned from topslab resource response
     order corresponds to popup template replacement placeholders
     ex: ['Description', 'Detour', 'StartDate', 'EndDate']
     iconUrl: string, optional, relative or absolute path to icon images
     startupShow: boolean, flag to show at startup

     */
    //persistent reference to this
    var _this = this;

    //add jsonp to getParams
    inventoryLayerProps.getParams['format'] = 'jsonp';

    this.layerName = inventoryLayerProps.layerName;
    //layerNames should be unique enough not to require guids, just strip out the spaces
    this.layerId = this.layerName.replace(/ /g, '');
    this.getParams = inventoryLayerProps.getParams;
    this.rootGetUrl = inventoryLayerProps.rootGetUrl;
    this.iconUrl = inventoryLayerProps.iconUrl;
    this.startupShow = inventoryLayerProps.startupShow;

    /*unique case for resource linkwithspeed
     build style lookup to be used for legend and feature styling
     */
    if (this.getParams.resource.toLowerCase() == 'linkwithspeed') {
        this.colorLookup = {
            fiftyFivePlus: '#149F08',
            fortyFiveToFiftyFive: '#2CDC11',
            thirtyToFortyFive: '#3FC5DC',
            twentyToThirty: '#DC8FAB',
            lessThanTwenty: '#FF0000',
            noData: '#9C9C9C'
        }
    }

    //build the icon if a url has been provided
    this.icon = null;
    if (this.iconUrl) {
        this.icon = L.icon({
            iconUrl: inventoryLayerProps.iconUrl,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
            popupAnchor: [10, 10]
        });
    }

    /*Create the leaflet layer but no features will be added yet, note null as first parameter
     the onEachFeature function is called as features are added to define style, icon, and popup
     */
    this.leafletGeoJsonLayer = L.geoJson(null, {
        onEachFeature: function (feature, layer) {
            //array to hold property values retrieved by property names in popupPropertyNamesArr
            var substitutionProps = [];
            for (var i = 0; i < inventoryLayerProps.popupPropertyNamesArr.length; i++) {
                substitutionProps.push(feature.properties[inventoryLayerProps.popupPropertyNamesArr[i]]);
            }

            //bind the popup using the popup template and the individual feature property values
            layer.bindPopup(inventoryLayerProps.popupTemplate.format(substitutionProps));
            /*if color lookup is defined, this is the speed link layer
             use the speed and color lookup to assign style
             */
            if (_this.colorLookup) {
                var avgSpeed = feature.properties['speed-average_mph'];
                var linkColor;

                if (!avgSpeed) {
                    linkColor = _this.colorLookup.noData;
                } else if (avgSpeed > 55) {
                    linkColor = _this.colorLookup.fiftyFivePlus;
                } else if (avgSpeed >= 45) {
                    linkColor = _this.colorLookup.fortyFiveToFiftyFive;
                } else if (avgSpeed >= 30) {
                    linkColor = _this.colorLookup.thirtyToFortyFive;
                } else if (avgSpeed >= 20) {
                    linkColor = _this.colorLookup.twentyToThirty;
                } else {
                    linkColor = _this.colorLookup.lessThanTwenty;
                }
                layer.setStyle({color: linkColor, weight: 10, opacity: 0.4, lineCap: 'butt'});
            }
            //in all other cases, just set the icon
            else {
                layer.setIcon(_this.icon);
            }
        }
    });

    /*No features were added to the leaflet layer on instantiation
     function defined to both intialize the layer features and update them on a regular basis
     currently set at every 5 minutes
     */
    this.updateInventoryLayer = function () {
        $.ajax({
            url: _this.rootGetUrl,
            dataType: "jsonp",
            data: _this.getParams,
            success: function (response) {
                //clear the layers in the leafletGeoJsonLayer
                _this.leafletGeoJsonLayer.clearLayers();
                _this.leafletGeoJsonLayer.addData(response);
            }
        });
    };

    //Use random timeouts and intervals to avoid slamming the server, don't know if this is necessary
    setTimeout(this.updateInventoryLayer, Math.floor(Math.random() * 2000));
    //update every 5 minutes, 10 second variablility
    setInterval(_this.updateInventoryLayer, (5 * 60 * 1000) + Math.floor(Math.random() * 10000));
}

//Static value for legend sub item template, used for travel speeds and wrs segments
InventoryLayer.subItemLegendTemplate =
    '<li>{0} <hr style="background-color: {1};' +
    ' margin-right: 15px; height: 6px;"></li>';

//Generate the html markup for the legend
InventoryLayer.prototype.makeLegendHtml = function () {
    //inventory Li element
    var inventoryLegendMarkup =
        '<li class="{0}"><input id="{1}" class="chk-inventory" type="checkbox" {2}>' +
        '<label for="{1}">{3}</label>';

    inventoryLegendMarkup = inventoryLegendMarkup.format(
        (this.colorLookup ? 'collapsed' : ''),
        this.layerId,
        (this.startupShow ? 'checked' : ''),
        this.layerName
    );

    //add the icon if a url has been provided
    if (this.iconUrl) {
        inventoryLegendMarkup += '<img src="{0}" height=15 class="legend-icon">'.format(this.iconUrl);
    }

    //if color lookup is defined, this is the speed link layer, add additional content
    if (this.colorLookup) {
        var speedLiTemplate = '<li>{0} <hr style="background-color: {1}; margin-right: 20px; height: 6px;"></li>';

        inventoryLegendMarkup +=
            '<ul>' +
            InventoryLayer.subItemLegendTemplate.format('&#8805; 55', this.colorLookup.fiftyFivePlus) +
            InventoryLayer.subItemLegendTemplate.format('45 - 55', this.colorLookup.fortyFiveToFiftyFive) +
            InventoryLayer.subItemLegendTemplate.format('30 - 45', this.colorLookup.thirtyToFortyFive) +
            InventoryLayer.subItemLegendTemplate.format('20 - 30', this.colorLookup.twentyToThirty) +
            InventoryLayer.subItemLegendTemplate.format('&lt; 20', this.colorLookup.lessThanTwenty) +
            InventoryLayer.subItemLegendTemplate.format('No Data', this.colorLookup.noData) +
            '</ul>';
    }

    inventoryLegendMarkup += '</li>';
    return inventoryLegendMarkup;
};

/*Object to manage wrs segments layer
 */
function WrsSegments(innerBoundsLayer, defaultOn) {
    /*
     innerBoundsLayer: L.Polygon, inner ring of the project bounds
     defaultOn: boolean, show layer at startup, controls check box status in legend
     */

    //persistent reference to this
    var _this = this;

    //query definintion for arcgis server service
    //production wrs segments
    this._wrsQuery = new L.esri.Tasks.Query('http://transportal.cee.wisc.edu/applications/arcgis2/rest/services/WRS/WRS_CurrentConditions/MapServer/0');
    //testing wrs segments
//    this._wrsQuery = new L.esri.Tasks.Query('http://transportal.cee.wisc.edu/testing/arcgis2/rest/services/WRS/WRS_CurrentConditions/MapServer/0');
    //only return results that intersect the project bounds
    this._wrsQuery.intersects(innerBoundsLayer);

    //color lookup
    this._wrsColorLookup = {
        'Good Winter Driving': "#33CC00",
        'Slippery Stretches': "#D176A2",
        'Snow Covered': "#5DAFE9",
        'Ice Covered': "#FF0000",
        'Travel Not Advised': "#000000",
        'No Information': "#808080"
    };

    //ordered list of conditions
    this._conditionsArray = [
        'Good Winter Driving',
        'Slippery Stretches',
        'Snow Covered',
        'Ice Covered',
        'Travel Not Advised',
        'No Information'
    ];

    this._popupTemplate = "<b>{0}</b> between <br/><b>{1}" +
        "</b> and <b>{2}</b><hr/>" +
        "<b>{3}</b><br/><i>Segment {4}</i>";

    //leaflet layer generated by features, initialized with no features
    this.leafletLayer = new L.GeoJSON(null, {
            style: function (feature) {
                return {color: _this._wrsColorLookup[feature.properties.CONDITION]};
            },
            onEachFeature: function (feature, layer) {
                var ftPrps = feature.properties;
                layer.bindPopup(_this._popupTemplate.format(ftPrps.HWYLIST, ftPrps.START_CITY, ftPrps.END_CITY, ftPrps.CONDITION, ftPrps.SEGMENTID));
            }
        }
    );

    //update layer, called on this object instantiation an at five minute intervals later
    this._updateLayer = function () {
        _this._wrsQuery.run(function (error, featureCollection, response) {
            //test for defined featureCollection response before proceeding
            if (featureCollection && response) {
                var fieldAliases = response['fieldAliases'];

                //reference the feature properties by the ArcGIS Server mapservice field alias name
                for (var i = 0; i < featureCollection.features.length; i++) {
                    var featProps = featureCollection.features[i].properties;
                    for (var key in featProps) {
                        featProps[fieldAliases[key]] = featProps[key];
                        delete featProps[key];
                    }
                }

                _this.leafletLayer.clearLayers();
                _this.leafletLayer.addData(featureCollection);
            }
        });
    };

    //generate the legend html
    this.makeLegendHtml = function () {

        var wrsLegendMarkup =
            '<li class="collapsed"><input id="wrsSegments" type="checkbox" {0}>'.format((defaultOn ? 'checked' : '')) +
            '<label for="wrsSegments">Winter Roads</label>';

        wrsLegendMarkup += '<img src="{0}" height=15 class="legend-icon">'.format('icons/snow-report.png');
        wrsLegendMarkup += '<ul>';
        for (var i = 0; i < _this._conditionsArray.length; i++) {
            //Can use the same template as that for the travel speeds legend subitems
            wrsLegendMarkup += InventoryLayer.subItemLegendTemplate.format(
                _this._conditionsArray[i],
                _this._wrsColorLookup[_this._conditionsArray[i]]);
        }
        wrsLegendMarkup += '</ul></li>';
        return wrsLegendMarkup;
    };

    //load features
    this._updateLayer();

    //update at regular five minute intervals
    setInterval(this._updateLayer, 5 * 60 * 1000);
}

//style lookup for style name to dashArray properties
Layer511.lineStyleLookup = {
    solid: null,
    dashed: '7, 7',
    dotted: '3, 7'
};

//background templates by line style, for legend hr element background
Layer511.backgroundStyleLookup = {
    solid: 'background-color: {0};',
    dashed: 'background-color: {0};' +
        'background-image: linear-gradient(90deg, transparent 50%, rgb(255, 255, 255) 50%);' +
        'background-size: 15px 10px;',
    dotted: 'background-color: {0};' +
        'background-image: linear-gradient(90deg, transparent 50%, rgb(255, 255, 255) 50%);' +
        'background-size: 7px 10px;'
};


//object for managing user edited features
function Layer511(layerConfig) {

    /*layerConfig expects one of two properties depending on this object is to be generated based on
     configuration retrieved if the form of project configuration retrieved from the server or if this object
     is to be created by the create layer group functionality in the editor

     layerConfig.jsonLayerConfig - retrieved from the server when the user visits the page
     expected properties of jsonLayerConfig
     layerId: guid string,
     layerName: string
     expand: boolean, if the layer group should be expanded in the viewer application
     groupColor: string, hex color, if the layer is not expanded, a single color is defined for all features in group
     startupShow: boolean, if the layer group should be shown on startup, overrides individual feature settings
     geojson: object, conforms to geojson spec
     type: string, must be "FeatureCollection"
     features: array of features, each with type, properties, and geometry properties/objects

     layerConfig.newProperties
     expected properties of newProperties
     layerName: string
     expand: same as above
     groupColor: same as above
     startupShow: same as above
     */

    //persistent reference to this
    var _this = this;

    //set this object properties based on passed in argument
    if (layerConfig.jsonLayerConfig) {
        this.layerId = layerConfig.jsonLayerConfig['layerId'];
        this.layerName = layerConfig.jsonLayerConfig['layerName'];
        this.expand = layerConfig.jsonLayerConfig['expand'];
        this.groupColor = layerConfig.jsonLayerConfig['groupColor'];
        this.groupStyle = layerConfig.jsonLayerConfig['groupStyle'];
        this.startupShow = layerConfig.jsonLayerConfig['startupShow'];
        this.geojson = layerConfig.jsonLayerConfig['layerGeoJson'];

    } else if (layerConfig.newProperties) {
        //create a new id for the layer
        this.layerId = guid();
        this.layerName = layerConfig.newProperties.name;
        this.expand = layerConfig.newProperties.expand;
        this.groupColor = layerConfig.newProperties.groupColor;
        this.groupStyle = layerConfig.newProperties.groupStyle;
        this.startupShow = layerConfig.newProperties.startupShow;
        //create skeleton for the geojson
        this.geojson = {
            "type": "FeatureCollection",
            "features": []}

    } else {
        alert('something went wrong');
        return;
    }

    //accounting references to hold sublayers (features) both in an array and a lookup by id object
    this.arrSubLayers = [];
    this.objSubLayers = {};

    //create the leaflet layer
    this.leafletLayer = L.geoJson(this.geojson, {
        style: function (feature) {
            return {
                color: feature.properties.color,
                opacity: feature.properties.opacity,
                weight: feature.properties.lineWidth,
                lineCap: 'butt',
                dashArray: Layer511.lineStyleLookup[feature.properties.lineStyle]
            };
        },
        onEachFeature: function (feature, layer) {
            //bind the popup if a name has been added
            if (feature.properties.name.length > 0) {
                layer.bindPopup(feature.properties.name);
            }
            //add the sublayers/features to the accounting variables
            _this.arrSubLayers.push(layer);
            _this.objSubLayers[feature.properties.featureId] = layer;
        }
    });
}

//make sub item html markup, function used here and on feature create/update
Layer511.prototype.setStyleAndPopupAndMakeEditorSubItemHtml = function (subItemId, isNew) {

    var theLayerProps = this.objSubLayers[subItemId].feature.properties;
    var innerContent = '{0}<hr style="{1}">{2}{3}'.format(
        theLayerProps.name,
        Layer511.backgroundStyleLookup[theLayerProps.lineStyle].format(
            hexAlphaToRgbOrRgba(theLayerProps.color, theLayerProps.opacity)),
        (theLayerProps.legendShow ? '<span title="Show in legend" class="ui-icon ui-icon-check"></span>' : ''),
        (theLayerProps.initialShow ? '<span title="Show on startup" class="ui-icon ui-icon-plusthick"></span>' : ''),
        theLayerProps.featureId
    );

    //flag to see if a name has been provided, use to determine clickable and whether to bind a popup
    var addPopupTrueFalse = theLayerProps.name.length > 0;

    this.objSubLayers[subItemId].setStyle({
        color: theLayerProps.color,
        opacity: theLayerProps.opacity,
        clickable: addPopupTrueFalse,
        weight: theLayerProps.lineWidth,
        dashArray: Layer511.lineStyleLookup[theLayerProps.lineStyle],
        lineCap: 'butt'
    });

    //remove any existing popup
    this.objSubLayers[subItemId].unbindPopup();

    //if a name has been provided, bind a popup
    if (addPopupTrueFalse) {
        this.objSubLayers[subItemId].bindPopup(theLayerProps.name);
    }

    if (isNew) {
        return '<li id="{0}" class="ui-state-default">'.format(subItemId) +
            innerContent + '</li>';
    } else {
        return innerContent;
    }
};

//helper function to make accordion header markup, used in makeEditorHtml and on group create/update
Layer511.prototype.makeEditorH3Content = function () {

    return '{0}{1}'.format(
        this.layerName,
        (this.expand ?
            '<span title="Expand in legend" class="ui-icon ui-icon-arrow-2-n-s"></span>' :
            '<hr style="{0}margin-right: 2px;">'.format(
                Layer511.backgroundStyleLookup[this.groupStyle || 'solid'].format(this.groupColor)
            )
            )
    )
};

//generate the editor markup, accordion panes
Layer511.prototype.makeEditorHtml = function () {
    var editorMarkup = '<div id="{0}_group" class="group"><h3 id="{0}">' +
        this.makeEditorH3Content() +
        '</h3><div><ul id="{0}_ul" class="layer-sort">';


    editorMarkup = editorMarkup.format(this.layerId);

    for (var i = 0; i < this.arrSubLayers.length; i++) {
        editorMarkup += this.setStyleAndPopupAndMakeEditorSubItemHtml(
            this.arrSubLayers[i].feature.properties.featureId, true);
    }

    editorMarkup += '</ul></div></div>';
    return editorMarkup
};

//make the legend markup
Layer511.prototype.makeLegendHtml = function () {
    /*All layers/features are added to the markup but some are hidden if the layer is marked as not expanded
     or if individual features are not marked as display in legend
     class for the li is 'leaf' for non expanded layers, this prevents
     the checkbox tree plugin from displaying the little triangle to expand the group, all child elements are hidden
     Even if the child features are hidden, they still have a checkbox that responds to the group checkbox
     click and checks the box for child elements, triggering the event listener and displaying the features on the map
     */
    var legendMarkup =
        '<li {0}>'.format((!this.expand ? 'class="leaf"' : '')) +
        '<input type="checkbox" id="{0}" class="chk-layer-group" {2}><label for="{0}">{1}</label>'.
            format(this.layerId, this.layerName, (this.startupShow ? 'checked' : '')) +
        '<ul style="{0}">'.format((!this.expand ? 'display: none;' : ''));

    var subLayerTemplate =
        '<li style="{0}">' +
        '<input id="{1}_{2}" type="checkbox" class="chk-layer-subgroup" {3}>' +
        '<label for="{1}_{2}">{4}</label><hr style="{5}">' +
        '</li>';

    /*Add the markup for features/layers in group,
     again, some will be hidden if layer not expanded or marked as not shown in legend
     */
    for (var i = 0; i < this.arrSubLayers.length; i++) {
        var subLyrProps = this.arrSubLayers[i].feature.properties;
        legendMarkup += subLayerTemplate.format(
            (!this.expand || !subLyrProps.legendShow ? 'display: none;' : ''),
            this.layerId,
            subLyrProps.featureId,
            (subLyrProps.initialShow && this.startupShow ? 'checked' : ''),
            subLyrProps.name,
            Layer511.backgroundStyleLookup[subLyrProps.lineStyle].format(hexAlphaToRgbOrRgba(subLyrProps.color, subLyrProps.opacity))
        );
    }

    //if the layer is not expanded, add an hr element with the background color corresponding to the group color
    legendMarkup += '</ul>{0}</li>'.format(
        (!this.expand ? '<hr style="{0}">'.format(Layer511.backgroundStyleLookup[this.groupStyle].format(this.groupColor)) : '')
    );
    return legendMarkup;
};


Layer511.prototype.addSubLayer = function (subLayer, featureProperties) {
    /*
     subLayer: leaflet vector layer
     featureProperties: object, key value
     */

    /*
     layers/features created from geojson with Leaflet's geojson constructor have a
     {leaflet layer}.feature.properties object
     this is not created by the draw control so it can be added manually
     The addition of these allows leaflet's toGeoJson functionality called on the group layer to work as expected
     The definition does not need to be complete as the geometry property of feature is not added and is
     managed elsewhere by leaflet
     However, feature.type must be set as "Feature
     Otherwise, toGeoJson wants to put the properties as a propertie of the geometry object for some reason
     Defining feature.type as 'Feature' seems to resolve this
     */

    //add the 'feature' property as an empty object
    subLayer.feature = {};
    //define feature.type as "Feature"
    subLayer.feature.type = "Feature";
    //add set the properties property of feature to the passed in featureProperties object
    subLayer.feature.properties = featureProperties;

    //add the feature/layer to the leafletLayer layer group
    this.leafletLayer.addLayer(subLayer);

    //add to book keeping array and id reference object
    this.arrSubLayers.push(subLayer);
    this.objSubLayers[subLayer.feature.properties.featureId] = subLayer;
    return subLayer.feature.properties.featureId;
};

//remove all references to the layer
Layer511.prototype.removeSubLayer = function (subLayer) {

    var ind = this.arrSubLayers.indexOf(subLayer);
    if (ind != -1) {
        this.arrSubLayers.splice(ind, 1);
    }
    delete this.objSubLayers[subLayer.feature.properties.featureId];

    //Remove from leaflet layer
    this.leafletLayer.removeLayer(subLayer);
};

//app object constructor, most important part is retrieval of config from server
//single object of this type so functions defined internally instead of prototype
function EditorApp(appConfigObj) {
    //persistent reference to this
    var _this = this;

    //ordered array of Layer511 objects
    this._layersArray = [];
    //lookup object of same Layer511 objects
    this._layersRefObject = {};

    //reference to config json
    this.projectConfig = appConfigObj.projectConfig;

    //map is defined externally to avoid waiting for the project config request
    this.map = appConfigObj.map;

    //root url of the resources api (cameras, message signs, lane closures, travel speeds, incidents)
    this.inventoryResourceUrl = appConfigObj.inventoryResourceUrl;

    //set initial map center and zoom
    this.map.setView(this.projectConfig.initialExtent.center, this.projectConfig.initialExtent.zoom);

    //create an empty polygon layer to be populated with geometry later
    this.boundsLayer = L.polygon([],
        {
            clickable: false,
            weight: 2,
            color: '#FF0000',
            fillColor: '#B9B9B9',
            fillOpacity: 0.7
        }
    ).addTo(this.map);

    //update the bounds layer using an outer all encompassing ring and an inner ring with the project area
    this.innerBoundsPolygon = null;
    this.setBounds = function (bounds, updateBoundsConfig) {
        var innerBoundsGeomArray = [
            L.latLng(bounds.south, bounds.west),
            L.latLng(bounds.north, bounds.west),
            L.latLng(bounds.north, bounds.east),
            L.latLng(bounds.south, bounds.east)
        ];

        this.innerBoundsPolygon = new L.Polygon(innerBoundsGeomArray);

        this.boundsLayer.setLatLngs([
            [
                L.latLng(-90, -180), L.latLng(90, -180), L.latLng(90, 180), L.latLng(-90, 180)
            ],
            innerBoundsGeomArray
        ]);

        //if updateBoundsConfig set to true, update the project config bounds
        if (updateBoundsConfig) {
            this.projectConfig.bounds = bounds;
        }
    };

    this.setBounds(this.projectConfig.bounds);


    var i;
    //Populate the array and lookup object with Layer511 objects
    for (i = 0; i < this.projectConfig.layers.length; i++) {
        //use and array to keep track of order and an object for reference
        var new511Layer = new Layer511({'jsonLayerConfig': this.projectConfig.layers[i]});
        _this._layersArray.push(new511Layer);
        _this._layersRefObject[new511Layer.layerId] = new511Layer;
    }

    $(this.map.getContainer()).append('<div class="map-inset-div">' +
        '<button id="hide-panel-button">Hide Panel</button>' +
        '</div>' +
        '<button id="show-panel-button">Show Panel</button>');

    var $showPanelButton = $("#show-panel-button");
    var $mapInsetDiv = $('.map-inset-div');
    var $hidePanelButton = $('#hide-panel-button');

    this.startInsetMaxHeight = $mapInsetDiv.css('height');
    this.startIndexWidth = $mapInsetDiv.css('width');
    var animateDuration = 250;

    //show legend or accordion panel, hide show panel button on finish
    $showPanelButton.button({
        icons: {
            primary: "ui-icon-arrowthick-1-sw"
        },
        text: false
    }).hide().click(function () {
        $showPanelButton.hide();
        $mapInsetDiv.show();
        $mapInsetDiv.animate({height: _this.startInsetMaxHeight, width: _this.startIndexWidth},
            animateDuration,
            function () {
                $hidePanelButton.prop('disabled', false);
            }
        );
    });

    //hide legend or accordion panel, display show panel button on finish
    $hidePanelButton.button({
        icons: {
            primary: "ui-icon-arrowthick-1-ne"
        },
        text: false
    }).click(function () {
        $hidePanelButton.prop('disabled', true);
        _this.startInsetMaxHeight = $mapInsetDiv.css('height');
        _this.startIndexWidth = $mapInsetDiv.css('width');
        $mapInsetDiv.animate({height: 0, width: 0},
            animateDuration,
            function () {
                $mapInsetDiv.hide();
                $showPanelButton.show();
            });
    });


    //keep events from propagating to the leaflet map parent container
    $('.map-inset-div, #show-panel-button').dblclick(function (event) {
        event.stopPropagation();
    }).mousedown(function (event) {
        event.stopPropagation();
    }).scroll(function (event) {
        event.stopPropagation();
    });


//ui setup for editor
    if (appConfigObj.editor) {
        //Start Editor implementation

        //flag if the drawing tool has been added
        this._polylineDrawAdded = false;
        this._rectangleDrawAdded = false;

        //variable to reference the currently expanded layer for editing purposes
        this.selectedLayer = null;

        //variables to pass around properties to and from the dialog boxes
        this._existingSublayerToEdit = null;
        this._newSubLayerToEdit = null;

        //flag that dragging has started, used to prevent click to open on accordion
        this._isDragging = false;

        //jQuery reference to body
        var $body = $('body');

        //Add feature dialog markup
        $body.append('<div id="feature-dialog" title="Save/Modify Feature">' +
            '<form>' +
            '   <fieldset>' +
            '       <label for="feature_name">Feature Name</label>' +
            '        <input type="text" id="feature_name" name="feature_name" value="" class="text ui-widget-content ui-corner-all"><br/>' +
            '        <label for="legend_show">Show in legend</label>' +
            '        <input type="checkbox" id="legend_show" name="legend_show" class="text ui-widget-content ui-corner-all"><br/>' +
            '        <label for="initial_show">Show on startup</label>' +
            '        <input type="checkbox" id="initial_show" name="initial_show" class="text ui-widget-content ui-corner-all"><br/>' +
            '        <label id="feature_color_label" for="feature_color">Color</label>' +
            '        <input id="feature_color" value="#FF6600" name="feature_color" class="color"><br/>' +
            '        <label id="line-style-label">Style</label>' +
            '        <select id="line-style">' +
            '             <option value="solid">Solid    <span>───</span></option>' +
            '             <option value="dashed">Dashed   <span>- - - -</span></option>' +
            '             <option value="dotted">Dotted   <span>&middot; &middot; &middot; &middot; &middot;</span></option>' +
            '        </select>' +
            '        <label id="feature_width_label" for="feature_width">Line Width: 5</label><br/>' +
            '        <input id="feature_width" type ="range" min ="2" max="20" step ="1" value="5"><br/>' +
            '        <label id="feature_opacity_label" for="feature_opacity">Line Opacity: 80%</label><br/>' +
            '        <input id="feature_opacity" type ="range" min ="0" max="1" step =".01" value="0.8"/><br/>' +
            '        <input id="feature_guid" type="hidden" value="" name="feature_guid">' +
            '    </fieldset>' +
            '</form>' +
            '</div>');

        //update feature width label on slider change
        $('#feature_width').change(function (e) {
            $('#feature_width_label').html('Line Width: ' + this.value.toString());
        });

        //update feature opacity label on slider change
        $('#feature_opacity').change(function (e) {
            $('#feature_opacity_label').html('Line Opacity: ' + (this.value * 100).toFixed() + '%');
        });

        //Add group dialog markup
        $body.append('<div id="group-dialog" title="New/Modify Group">' +
            '<form>' +
            '   <fieldset>' +
            '       <label for="layer_name">Layer Name</label>' +
            '        <input type="text" id="layer_name" name="layer_name" value="" class="text ui-widget-content ui-corner-all"><br/>' +
            '        <label for="group_startup_show">Show at startup</label>' +
            '        <input type="checkbox" id="group_startup_show" name="group_startup_show" class="text ui-widget-content ui-corner-all"><br/>' +
            '        <label for="legend_expand">Expand in legend</label>' +
            '        <input type="checkbox" id="legend_expand" name="legend_expand" class="text ui-widget-content ui-corner-all"><br/>' +
            '        <label id="group_color_label" for="group_color" title="A single color is defined for non expanded groups, line widths and opacity are maintained">Group Color</label>' +
            '        <input id="group_color" value="#FF6600" name="group_color" disabled class="color"><br/>' +
            '        <label id="group-line-style-label">Style</label>' +
            '        <select id="group-line-style">' +
            '             <option value="solid">Solid    <span>───</span></option>' +
            '             <option value="dashed">Dashed   <span>- - - -</span></option>' +
            '             <option value="dotted">Dotted   <span>&middot; &middot; &middot; &middot; &middot;</span></option>' +
            '        </select>' +
            '        <input id="layer_guid" type="hidden" value="" name="layer_guid"><br/>' +
            '    </fieldset>' +
            '</form>' +
            '</div>');

        /*If the group is not expanded, a single color is selected that will be common for all
         layers in the group.  Selecting expanded disables the group color picker
         Colors will be selected for individual features
         If the group is not expanded and a single color is defined for the group,
         the color picker in the inividual feature dialog is diabled
         */
        $('#legend_expand').change(function (e) {
            var $groupColorPicker = $('#group_color');
            var $groupColorPickerLabel = $('#group_color_label');
            var $groupStyleLabel = $('#group-line-style-label');
            var $groupStyle = $('#group-line-style');

            if (this.checked) {
                $groupColorPicker.attr('disabled', true);
                $groupColorPicker.css('background-color', '#7D7D7D');
                $groupColorPickerLabel.css('color', '#7D7D7D');
                $groupStyle.attr('disabled', true);
                $groupStyleLabel.css('color', '#7D7D7D');
            } else {
                $groupColorPicker.removeAttr('disabled');
                $groupColorPicker.css('background-color', 'rgb(255, 102, 0)');
                $groupColorPickerLabel.css('color', 'rgb(0, 0, 0)');
                $groupStyle.removeAttr('disabled');
                $groupStyleLabel.css('color', 'rgb(0, 0, 0)');
            }
        });

        //Add inventory visibility markup
        $body.append('<div id="inventory-visibility" title="Inventory Layer Visibility">' +
            '<form>' +
            '   <fieldset>' +
            '       <label for="incidents">Incidents</label>' +
            '       <input type="checkbox" id="incidents" name="incidents" value="" class="text ui-widget-content ui-corner-all"><br/>' +
            '       <label for="lane-closure">Lane Closures</label>' +
            '       <input type="checkbox" id="lane-closure" name="lane-closure" value="" class="text ui-widget-content ui-corner-all"><br/>' +
            '       <label for="future-lane-closure">Future Lane Closures</label>' +
            '       <input type="checkbox" id="future-lane-closure" name="future-lane-closure" value="" class="text ui-widget-content ui-corner-all"><br/>' +
            '       <label for="cameras">Cameras</label>' +
            '       <input type="checkbox" id="cameras" name="cameras" value="" class="text ui-widget-content ui-corner-all"><br/>' +
            '       <label for="message-signs">Message Signs</label>' +
            '       <input type="checkbox" id="message-signs" name="message-signs" value="" class="text ui-widget-content ui-corner-all"><br/>' +
            '       <label for="traffic-speed">Traffic Speed</label>' +
            '       <input type="checkbox" id="traffic-speed" name="traffic-speed" value="" class="text ui-widget-content ui-corner-all"><br/>' +
            '       <label for="chk-wrs-segments">Winter Roads (Oct-May)</label>' +
            '       <input type="checkbox" id="chk-wrs-segments" name="chk-wrs-segments" value="" class="text ui-widget-content ui-corner-all"><br/>' +
            '    </fieldset>' +
            '</form>' +
            '</div>');


        /*Add the accordion container with buttons at the top and an empty accordion div at the bottom
         to which content will be appended subsequently
         */
        $('.map-inset-div').append(
                '<button id="create_group" class="layer-closed-active">Create Group</button>' +
                '<button id="edit_delete_group" class="layer-open-active">Edit or Delete Group</button>' +
                '<button id="set_initial_extent" class="layer-closed-active">Set initial extent</button>' +
                '<button id="set_feature_bounds" class="layer-closed-active">Set feature bounds</button>' +
//        '<button id="reset" class="layer-closed-active">Reset</button>' +
//        '<button id="save" class="layer-closed-active">Save</button>' +
                '<button id="layerVisbility" class="layer-closed-active">Set Inventory Layer Visibility</button>' +
                '<button id="save" class="">Save</button>' +
                '<div id="accordion"></div>');

        //Add a div to contain flashed messages
        $(this.map.getContainer()).append('<p id="flash-Message"></p>');

        //Dialog to control initial visibility of inventory and speed information layers
        this.layerVisibilityDialog = $('#inventory-visibility').dialog({
            autoOpen: false,
            height: 380,
            width: 350,
            modal: true,
            buttons: {
                "Save": function () {
                    //Update the project configuration based on checked property of boxes
                    _this.projectConfig.showLayers.incidents = $('#incidents')[0].checked;
                    _this.projectConfig.showLayers.laneClosures = $('#lane-closure')[0].checked;
                    _this.projectConfig.showLayers.futureLaneClosures = $('#future-lane-closure')[0].checked;
                    _this.projectConfig.showLayers.cameras = $('#cameras')[0].checked;
                    _this.projectConfig.showLayers.messageSigns = $('#message-signs')[0].checked;
                    _this.projectConfig.showLayers.trafficSpeed = $('#traffic-speed')[0].checked;
                    _this.projectConfig.showLayers.wrsSegments = $('#chk-wrs-segments')[0].checked;
                    $(this).dialog("close");
                }
            },
            open: function () {
                //populate the check boxes with the current values
                $('#incidents')[0].checked = _this.projectConfig.showLayers.incidents;
                $('#lane-closure')[0].checked = _this.projectConfig.showLayers.laneClosures;
                $('#future-lane-closure')[0].checked = _this.projectConfig.showLayers.futureLaneClosures;
                $('#cameras')[0].checked = _this.projectConfig.showLayers.cameras;
                $('#message-signs')[0].checked = _this.projectConfig.showLayers.messageSigns;
                $('#traffic-speed')[0].checked = _this.projectConfig.showLayers.trafficSpeed;
                $('#chk-wrs-segments')[0].checked = _this.projectConfig.showLayers.wrsSegments;

            },
            close: function () {
                setTimeout(function () {
                    _this.layerVisibilityDialog.find('form')[0].reset();
                }, 100);
            }
        });

        //feature dialog
        this.featureDialog = $('#feature-dialog').dialog({
            autoOpen: false,
            height: 520,
            width: 350,
            modal: true,
            buttons: {
                "Save": function () {
                    //Get values from the form
                    var featureName = $('#feature_name').val();

                    var rgbColor, featureColor;
                    if (_this.selectedLayer.expand) {
                        rgbColor = $('#feature_color').css('background-color');
                        featureColor = rgb2hex(rgbColor);
                    } else {
                        rgbColor = hexAlphaToRgbOrRgba(_this.selectedLayer.groupColor, null);
                        featureColor = _this.selectedLayer.groupColor;
                    }

                    var featureLegendShow = $('#legend_show')[0].checked;
                    var featureInitialShow = $('#initial_show')[0].checked;
                    var featureId = $('#feature_guid').val();
                    var featureWidth = parseInt($('#feature_width').val());
                    var featureOpacity = parseFloat($('#feature_opacity').val());
                    var featureStyle = $('#line-style').val();

                    /*If the dialog was opened by a double click on an existing feature li
                     update the values with those in the form
                     */
                    if (_this._existingSublayerToEdit) {
                        //reference to the feature properties to save typing
                        var featProps = _this._existingSublayerToEdit.feature.properties;

                        //update the properties
                        featProps.color = featureColor;
                        featProps.legendShow = featureLegendShow;
                        featProps.name = featureName;
                        featProps.opacity = featureOpacity;
                        featProps.lineWidth = featureWidth;
                        featProps.initialShow = featureInitialShow;
                        featProps.lineStyle = featureStyle;

                        //update the contents of the corresponding feature li
                        $('#' + featureId).html(_this.selectedLayer.setStyleAndPopupAndMakeEditorSubItemHtml(featureId, false));


                    }
                    /*else if this is a new layer, need to create the layer, set style, and add to accounting references
                     the reference newSubLayerToEdit is retrieved by the map on draw created event
                     */
                    else if (_this._newSubLayerToEdit) {
                        //add the layer to the editable features collection used by the draw control
                        _this.editableFeatures.addLayer(_this._newSubLayerToEdit);

                        //add the new sub layer with associated properies to the array and lookup objects
                        var newFeatureId = _this.selectedLayer.addSubLayer(_this._newSubLayerToEdit, {
                            color: featureColor,
                            legendShow: featureLegendShow,
                            name: featureName,
                            featureId: featureId,
                            opacity: featureOpacity,
                            lineWidth: featureWidth,
                            initialShow: featureInitialShow,
                            lineStyle: featureStyle
                        });

                        //Add the markup li to the editor accordion
                        $('#' + _this.selectedLayer.layerId + '_ul').append(
                            _this.selectedLayer.setStyleAndPopupAndMakeEditorSubItemHtml(newFeatureId, true)
                        );
                    } else {
                        alert('something wrong');
                        console.log('something wrong');
                    }
                    $(this).dialog("close");
                },
                "Delete": function () {
                    if (_this._existingSublayerToEdit) {
                        //delete the feature
                        //remove from both leaflet layer and editable features
                        _this.editableFeatures.removeLayer(_this._existingSublayerToEdit);
                        _this.selectedLayer.removeSubLayer(_this._existingSublayerToEdit);

                        //remove the associated li element
                        $('#' + _this._existingSublayerToEdit.feature.properties.featureId).remove();

                    } else if (_this._newSubLayerToEdit) {
                        /*Only need to handle the case for an existing feature
                         as clicking delete in the process of creating a new feature
                         will simply discard the results
                         */
                    } else {
                        alert('something wrong');
                    }
                    $(this).dialog("close");
                }
            },
            open: function () {
                _this.featureDialog.find('form')[0].reset();
                if (_this._existingSublayerToEdit) {
                    //shorthand reference to feature properties
                    var prps = _this._existingSublayerToEdit.feature.properties;

                    //populate the form values using existing properties
                    $('#feature_name').val(prps.name);
                    $('#feature_color').css('background-color', prps.color);
                    $('#legend_show')[0].checked = prps.legendShow;
                    $('#initial_show')[0].checked = prps.initialShow;
                    $('#feature_guid').val(prps.featureId);
                    $('#feature_width').val(prps.lineWidth.toString());
                    $('#feature_width_label').html('Line Width: ' + prps.lineWidth.toString());
                    $('#feature_opacity').val(prps.opacity.toString());
                    $('#feature_opacity_label').html('Line Opacity: ' + (prps.opacity * 100).toFixed() + '%');
                    $('#line-style').val(prps.lineStyle);
                } else {
                    //populate the form with default values
                    $('#feature_guid').val(guid());
                    $('#legend_show')[0].checked = true;
                    $('#initial_show')[0].checked = true;
                    $('#feature_width').val('5');
                    $('#feature_width_label').html('Line Width: 5');
                    $('#feature_opacity').val('0.8');
                    $('#feature_opacity_label').html('Line Opacity: 80%');
                    $('#feature_color').css('background-color',
                        (_this.selectedLayer.expand ? '#FF6600' : _this.selectedLayer.groupColor));
                    $('#line-style').val((_this.selectedLayer.expand ? 'solid' : _this.selectedLayer.groupStyle));
                }

                //enable or disable the color picker and line style depending if the group is marked as expanded
                //disable color picker
                if (_this.selectedLayer.expand) {

                    $('#feature_color').removeAttr('disabled');
                    $('#feature_color_label').css('color', '#000000');
                    $('#line-style-label').css('color', '#000000');
                    $('#line-style').removeAttr('disabled');
                }
                //enable color picker
                else {
                    //
                    $('#feature_color').attr('disabled', true);
                    $('#feature_color_label').css('color', '#7D7D7D');
                    $('#line-style-label').css('color', '#7D7D7D');
                    $('#line-style').attr('disabled', true);
                }
            },
            close: function () {
                _this.updateEventListeners();
                //clear form values and references to existing or new layer to edit
                setTimeout(function () {
                    _this.featureDialog.find('form')[0].reset();
                    //clear variables
                    _this._existingSublayerToEdit = null;
                    _this._newSubLayerToEdit = null;
                }, 100);
            }
        });

        //layer group dialog
        this.groupDialog = $('#group-dialog').dialog({
            autoOpen: false,
            height: 400,
            width: 350,
            modal: true,
            buttons: {
                "Save": function () {
                    //get values from form fields
                    var lyrName = $('#layer_name').val();
                    var lyrExpanded = $('#legend_expand')[0].checked;
                    var groupStartupShow = $('#group_startup_show')[0].checked;

                    var groupColorRgb, groupColorHex, groupLineStyle;

                    if (lyrExpanded) {
                        groupColorRgb = null;
                        groupColorHex = null;
                        groupLineStyle = null;
                    } else {
                        groupColorRgb = $('#group_color').css('background-color');
                        groupColorHex = rgb2hex(groupColorRgb);
                        groupLineStyle = $('#group-line-style').val();
                    }

                    //selected layer will be defined if a group is expanded in the editor accordion
                    if (_this.selectedLayer) {
                        //populate the selected layer with new properties
                        _this.selectedLayer.expand = lyrExpanded;
                        _this.selectedLayer.layerName = lyrName;
                        _this.selectedLayer.groupColor = groupColorHex;
                        _this.selectedLayer.startupShow = groupStartupShow;
                        _this.selectedLayer.groupStyle = groupLineStyle;

                        //update the content of the group h3 element
                        $('#' + _this.selectedLayer.layerId).html(_this.selectedLayer.makeEditorH3Content());

                        /*if the layer group is not expanded, there is a common color and style
                         update the properties, style, and li elements of all members of the layer group
                         */
                        if (!lyrExpanded) {
                            for (var key in _this.selectedLayer.objSubLayers) {
                                //update the color
                                _this.selectedLayer.objSubLayers[key].feature.properties.color = groupColorHex;
                                _this.selectedLayer.objSubLayers[key].feature.properties.lineStyle = groupLineStyle;

                                $('#' + key).html(_this.selectedLayer.setStyleAndPopupAndMakeEditorSubItemHtml(
                                    key, false
                                ));
                            }
                        }
                    }

                    //create a new layer, get here by clicking 'Create Group' button at the top of editor panel
                    else {
                        //instantiate the 511Layer by passing object with 'newProperties'
                        var new511Layer = new Layer511(
                            {
                                'newProperties': {
                                    "name": lyrName,
                                    "expand": lyrExpanded,
                                    "groupColor": groupColorHex,
                                    "startupShow": groupStartupShow,
                                    "groupStyle": groupLineStyle
                                }
                            });
                        //add the markup to the accordion
                        $('#accordion').append(new511Layer.makeEditorHtml());

                        //add new object to accounting array and reference object
                        _this._layersArray.push(new511Layer);
                        _this._layersRefObject[new511Layer.layerId] = new511Layer;
                    }

                    $(this).dialog("close");
                },
                "Delete": function () {
                    if (_this.selectedLayer) {
                        //Remove the layer can all references to it

                        //clear from editable features used by the draw control
                        _this.editableFeatures.clearLayers();

                        //remove the corresponding accordion pane
                        $('#' + _this.selectedLayer.layerId + '_group').remove();

                        //remove from accounting array and ref object
                        var ind = _this._layersArray.indexOf(_this.selectedLayer);
                        if (ind > -1) {
                            _this._layersArray.splice(ind, 1);
                        }
                        delete _this._layersRefObject[_this.selectedLayer.layerId];

                        //set selected layer to null, see setSelectedLayer method
                        _this.setSelectedLayer(null);
                    } else {
                        //do nothing
                    }
                    $(this).dialog("close");
                }
            },
            open: function () {
                _this.groupDialog.find('form')[0].reset();
                //jQuery reference to legend_expand checkbox
                var legendExpandChk = $('#legend_expand')[0];

                //Set the group expanded checkbox and trigger a change event
                //defaults to true for a new group
                legendExpandChk.checked = (_this.selectedLayer ? _this.selectedLayer.expand : true);
                legendExpandChk.dispatchEvent(new Event('change'));

                //set group_startup_show checked, defaults to true for a new group
                $('#group_startup_show')[0].checked = (_this.selectedLayer ? _this.selectedLayer.startupShow : true);

                //populate the form with existing values if editing an existing group
                if (_this.selectedLayer) {
                    $('#layer_name').val(_this.selectedLayer.layerName);
                    $('#layer_guid').val(_this.selectedLayer.layerId);
                    if (!_this.selectedLayer.expand) {
                        $('#group_color').css('background-color', hexAlphaToRgbOrRgba(_this.selectedLayer.groupColor));
                        $('#group-line-style').val(_this.selectedLayer.groupStyle);
                    }
                }
            },
            close: function () {
                //update the event listeners and clear the form after a timeout
                _this.updateEventListeners();
                setTimeout(function () {
                    _this.groupDialog.find('form')[0].reset();
                }, 200);
            }
        });

        /*buttons and event handlers*/

        //Create Group
        $("#create_group").button({
            icons: {
                primary: "ui-icon-plusthick"
            },
            text: false
        }).click(function (event) {
            //Action depends on presence of app.selectedLayer
            _this.groupDialog.dialog('open');
        });

        //Edit group
        $("#edit_delete_group").button({
            icons: {
                primary: "ui-icon-pencil"
            },
            text: false,
            disabled: true
        }).click(function (event) {
            //Action depends on presence of app.selectedLayer
            _this.groupDialog.dialog('open');
        });

        //Set initial extent
        $("#set_initial_extent").button({
            icons: {
                primary: "ui-icon-arrow-4-diag"
            },
            text: false
        }).click(function (event) {
            if (_this.map) {
                var center = _this.map.getCenter();
                _this.projectConfig.initialExtent.center = [center.lat, center.lng];
                _this.projectConfig.initialExtent.zoom = _this.map.getZoom();
                _this.flashMessage('Initial Extent Set');
            }
        });

        //set project extent, shading outside area of interest, also used to query inventory/speed features
        $("#set_feature_bounds").button({
            icons: {
                primary: "ui-icon-newwin"
            },
            text: false
        }).click(function (event) {
            if (_this.map) {
                /*Add the rectangle draw control, the rest of implementation is handled by the
                 map feature added event that distinguishes between rectangle features added for this case
                 and the line features
                 */
                if (!_this._rectangleDrawAdded) {
                    _this.map.addControl(_this.rectangleDrawControl);
                    _this._rectangleDrawAdded = true;
                    //trigger start drawing to avoid an extra click required on the toolbar
                    $('.leaflet-draw-draw-rectangle')[0].click();
                }
            }
        });

        //Open dialog to specify initial display of camera, sign, speeds, etc
        $("#layerVisbility").button({
            icons: {
                primary: "ui-icon-flag"
            },
            text: false
        }).click(function (event) {
            _this.layerVisibilityDialog.dialog('open');
        });

        /*Save the project configuration
         Determines layer style, display, and order based on position of
         html elements in the accordion
         */
        $("#save").button({
            icons: {
                primary: "ui-icon-disk"
            },
            text: false
        }).click(function (event) {
            //Update project config and put them in order according to the accordion pane layout
            //jQuery is good at keeping things in order

            /*Clear projectConfig.layers
             This will be repopulated
             */
            _this.projectConfig.layers = [];

            //create arrays, first to hold the order of the groups, h3 element id is the group id
            var groupOrderArray = [];
            $('.group > h3').each(function () {
                groupOrderArray.push(this.id);
            });

            //second is an array of arrays,
            //first level is order of groups
            //second level is order of individual features
            var subLayerOrderArray = [];
            for (i = 0; i < groupOrderArray.length; i++) {
                var featureOrderArray = [];
                /*ul element has an id with {group id}_ul
                 Use this to find individual li elements within the ul
                 The id of the li elements is the feature id
                 */
                $('#' + groupOrderArray[i] + '_ul li').each(function () {
                    featureOrderArray.push(this.id);
                });
                subLayerOrderArray.push(featureOrderArray);
            }

            /*Now have two arrays
             groupOrderArray = [groupId#1, groupId#2, .... ]
             subLayerOrderArray = [
             [group#1featureId#1, group#1featureId#2, ...],
             [group#2featureId#1, group#2featureId#2, ...],
             ......
             ]
             for (i = 0; i < groupOrderArray.length; i++){
             <process group>
             for (j = 0; j < groupOrderArray[i].length; j++){
             <process individual features>
             }
             }
             */

            //This could be wrapped in the previous iteration but is done separately for clarity
            //loop over the groups and then by the individual features to put everything in order
            for (i = 0; i < groupOrderArray.length; i++) {
                //Reference the Layer511 object using the layer id
                var layerRef = _this._layersRefObject[groupOrderArray[i]];

                /*Create a skeleton for the layer configuration that will be saved to the server
                 Note that features is an empty array, this will be populated in subsequent steps
                 */
                var jsonProps = {
                    "layerId": layerRef.layerId,
                    "layerName": layerRef.layerName,
                    "expand": layerRef.expand,
                    "groupColor": layerRef.groupColor,
                    "groupStyle": layerRef.groupStyle,
                    "startupShow": layerRef.startupShow,
                    "layerGeoJson": {
                        "type": "FeatureCollection",
                        "features": []
                    }
                };

                /*can get the geojson but some more parsing is needed to get it into the right
                 order as defined by the html
                 accounting objects and arrays keep track of properties but they are unaware of geometry changes
                 Leaflet's toGeoJson function is handy for getting that but again, no assurance that the features will
                 be in the correct order (that defined by order of groups and features within groups)
                 */
                var lyrGeoJson = layerRef.leafletLayer.toGeoJSON();

                //create a lookup object for the features using the feature id
                var featureLookupObject = {};
                for (var j = 0; j < lyrGeoJson.features.length; j++) {
                    featureLookupObject[lyrGeoJson.features[j].properties.featureId] = lyrGeoJson.features[j];
                }

                //finally, using the ordered array of feature ids and the lookup, populate the geojson features array
                for (j = 0; j < subLayerOrderArray[i].length; j++) {
                    //subLayerOrderArray[i][j] returns a feature id referenced by the lookup object
                    var featureToAdd = featureLookupObject[subLayerOrderArray[i][j]];
                    //make sure it is defined before proceeding
                    if (featureToAdd) {
                        jsonProps.layerGeoJson.features.push(featureToAdd);
                    } else {
                        alert('null reference caught, something is wrong');
                        console.log('null reference caught, something is wrong');
                        return;
                    }
                }

                //add jsonProps to the projectConfig.layers array
                _this.projectConfig.layers.push(jsonProps);
            }

            //post the data to the server to be saved
            $.post(appConfigObj.ajaxHandler,
                JSON.stringify({ newConfig: _this.projectConfig}),
                function (data, status) {
                    _this.flashMessage('Project saved successfully');
                });
        });

        //project center point used to locate the project on the 511 projects landing page
        this.projectPointLocationLayer = L.marker(
            [this.projectConfig.projectPointLocation.lat, this.projectConfig.projectPointLocation.lng],
            {
                draggable: true,
                title: 'Project Center',
                icon: new L.Icon({
                    iconUrl: 'icons/star.png',
                    iconSize: [40, 40],
                    iconAnchor: [20, 20],
                    popupAnchor: [0, -10]
                })
            });

        //Add some how to information
        this.projectPointLocationLayer.bindPopup('<p><b>Project Center</b><br/>This point defines the location ' +
            'displayed on the landing page of 511 projects.<br/>Set project bounds then drag to desired location.</p>');

        //add layer to map on editor start, removed during editing under setSelectedLayer function
        this.map.addLayer(this.projectPointLocationLayer);

        //update project config on 'dragend' events
        this.projectPointLocationLayer.on('dragend', function (e) {
            var newPointLocation = e.target.getLatLng();
            _this.projectConfig.projectPointLocation.lat = newPointLocation.lat;
            _this.projectConfig.projectPointLocation.lng = newPointLocation.lng;
        });


        //Set the selected layer, layerId can be null
        this.setSelectedLayer = function (layerId) {
            //reference to buttons to enable or disable based on a group being open
            var $layerClosedActive = $('.layer-closed-active');
            var $layerOpenActive = $(".layer-open-active");

            //Remove polyline draw control
            if (this._polylineDrawAdded) {
                this.map.removeControl(this.polylineDrawControl);
                this._polylineDrawAdded = false;
            }

            //Remove rectangle draw control
            if (this._rectangleDrawAdded) {
                this.map.removeControl(this.rectangleDrawControl);
                this._rectangleDrawAdded = false;
            }

            //Remove the project center point
            _this.map.removeLayer(_this.projectPointLocationLayer);

            //if the layer id is null
            if (layerId === null) {
                //set the selected layer to null
                this.selectedLayer = null;
                //enable layer closed buttons
                $layerClosedActive.button('enable');
                //disable layer open buttons
                $layerOpenActive.button('disable');
                //set the accordion to all closed
                $("#accordion").accordion({ active: false });
                //add the project center point
                _this.map.addLayer(_this.projectPointLocationLayer);
            }
            //set the selected layer based on the passed in layer id
            else {
                //Remove the project center point
                _this.map.removeLayer(_this.projectPointLocationLayer);
                //set the corresponding layer by id to be active
                this.selectedLayer = this._layersRefObject[layerId];
                //disable layer closed buttons
                $layerClosedActive.button('disable');
                //enable layer open buttons
                $layerOpenActive.button('enable');
                //add the polyline draw control and added flag
                this.map.addControl(_this.polylineDrawControl);
                this._polylineDrawAdded = true;
                //add the features in this group to the draw control editable features
                _this.selectedLayer.leafletLayer.eachLayer(function (layer) {
                    _this.editableFeatures.addLayer(layer);
                });
            }
        };

        //The draw controls use FeatureGroup defined here
        this.editableFeatures = new L.FeatureGroup();

        /*Add the layer
         The layer is always in the map
         Features are added and removed dynamically based on the currently selected (pane open) layer group
         */
        this.map.addLayer(this.editableFeatures);

        //handle draw created events
        this.map.on('draw:created', function (e) {
            switch (e.layerType) {
                //layer type is rectangle for creating the project bounds
                case 'rectangle':
                    //remove the rectangle draw control
                    _this.map.removeControl(_this.rectangleDrawControl);
                    _this._rectangleDrawAdded = false;

                    //pass bounds to setBounds, updates the bounds layer polygon with a hole (ring)
                    //second parameter set to true to update bounds in project config
                    var layerBounds = e.layer.getBounds();
                    _this.setBounds({
                        south: layerBounds.getSouth(),
                        west: layerBounds.getWest(),
                        east: layerBounds.getEast(),
                        north: layerBounds.getNorth()
                    }, true);

                    /*update the project center point in the middle of
                     the newly drawn extent
                     can be dragged later to the desired location
                     */
                    var centerLat = (layerBounds.getSouth() + layerBounds.getNorth()) / 2;
                    var centerLng = (layerBounds.getWest() + layerBounds.getEast()) / 2;

                    _this.projectPointLocationLayer.setLatLng([centerLat, centerLng]);
                    _this.projectConfig.projectPointLocation.lat = centerLat;
                    _this.projectConfig.projectPointLocation.lng = centerLng;
                    break;
                case 'polyline':
                    /*define _newSubLayerToEdit
                     behavior of the feature dialog depends on definition of _newSubLayerToEdit
                     contrasting with modification of pre existing feature
                     */
                    _this._newSubLayerToEdit = e.layer;
                    _this.featureDialog.dialog('open');
                    break;
                default:
                    alert('not handled');
            }
        });

        /*create the draw controls*/

        //polyline draw control
        this.polylineDrawControl = new L.Control.Draw({
            draw: {
                position: 'topleft',
                polyline: {
                    //self intersection verification is too sensitive and causes problems, set to allow
                    allowIntersection: true,
                    drawError: {
                        color: '#FF0000', // Color the shape will turn when intersects
                        message: "Avoid self intersections", // Message that will show when intersect
                        timeout: 1000
                    },
                    shapeOptions: {
                        color: '#FF00FF'
                    },
                    metric: false
                },
                //disable other shape controls
                circle: false,
                marker: false,
                polygon: false,
                rectangle: false
            },
            edit: {
                featureGroup: this.editableFeatures,
                //don't add remove button to toolbar, delete features handled elsewhere
                remove: false
            }
        });

        //rectangle draw control
        this.rectangleDrawControl = new L.Control.Draw({
            draw: {
                position: 'topleft',
                polyline: false,
                circle: false,
                marker: false,
                polygon: false,
                rectangle: {
                    //self intersection verification is too sensitive and causes problems, set to allow
                    allowIntersection: true,
                    drawError: {
                        color: '#FF0000', // Color the shape will turn when intersects
                        message: "Avoid self intersections", // Message that will show when intersect
                        timeout: 1000
                    },
                    shapeOptions: {
                        color: '#FF00FF'
                    },
                    metric: false
                }
            },
            edit: {
                /*editor needs a feature group but rectangle features are not added to it
                 rather directly to the bounds layer
                 */
                featureGroup: this.editableFeatures,
                //don't add edit button to toolbar
                edit: false,
                //don't add remove button to toolbar
                remove: false
            }
        });

        /*Event listeners are not applied to newly created dom elements
         Need to clear existing listeners and reapply when new elements are created
         */
        this.updateEventListeners = function () {
            //persistent reference to 'this' to be used within callback functions
            var _this = this;

            //jQuery references to elements
            var $accordionH3 = $('#accordion h3');
            var $layerSortLi = $(".layer-sort li");

            //Create the functions on the first call to updateEventListeners as functions are yet undefined
            if (!(this._subLayersDblClick && this._accordionh3click)) {

                this._subLayersDblClick = function (event) {
                    //form field values set in on open of feature dialog
                    //_this.selectedLayer will be defined since the accordion was open in order to click on this
                    _this._existingSublayerToEdit = _this.selectedLayer.objSubLayers[this.id];
                    _this.featureDialog.dialog('open');
                };

                //catch the click event if a drag start has been initiated, prevents pane from open on drag stop
                this._accordionh3click = function (event) {
                    if (_this._isDragging) {
                        event.stopImmediatePropagation();
                        event.preventDefault();
                        _this._isDragging = false;
                    }
                };
            }

            /*remove and reapply listeners*/

            //prevent default action if the click was caused by dragging
            $accordionH3.off('click', _this._accordionh3click);
            $accordionH3.click(_this._accordionh3click);

            //open feature dialog on li double click
            $layerSortLi.off('dblclick', this._subLayersDblClick);
            $layerSortLi.dblclick(this._subLayersDblClick);

            //initialize sortable on feature sub items
            $(".layer-sort").sortable({axis: "y"});
            $('#accordion').accordion('refresh');

            //initialize color picker
            jscolor.init();
        };

        this.flashMessage = function (message) {
            var $flashContainer = $('#flash-Message');
            $flashContainer.html(message);
            $flashContainer.fadeIn();

            setTimeout(function () {
                $flashContainer.fadeOut();
            }, 2500);
        };

        /*build layout*/

        //jQuery reference to #acc
        var $accordion = $("#accordion");

        //Add the markup to the accordion pane
        for (i = 0; i < this._layersArray.length; i++) {
            $accordion.append(this._layersArray[i].makeEditorHtml());
        }

        //build the accordion
        $accordion.accordion({
            collapsible: true,
            heightStyle: "content",
            header: "> div > h3",
            active: false,
            //identify the selected feature layer using the ui object returned on pane open/close
            activate: function (event, ui) {
                //clear editable features
                _this.editableFeatures.clearLayers();

                //identify newly opened panel if there is one, all can be collapsed
                //id retrieved from ui.newPanel.context.id
                if (ui.newPanel.length > 0) {
                    _this.setSelectedLayer(ui.newPanel.context.id);
                } else {
                    _this.setSelectedLayer(null);
                }
            }
        }).sortable({
            axis: "y",
            handle: "h3",
            //flag isDragging as true
            start: function (event, ui) {
                //is dragging flag used to prevent pane open on drag stop
                _this._isDragging = true;
            },
            stop: function (event, ui) {
                // IE doesn't register the blur when sorting
                // so trigger focusout handlers to remove .ui-state-focus
                ui.item.children("h3").triggerHandler("focusout");
                // Refresh accordion to handle new order
                $(this).accordion("refresh");
            }
        });

        this.updateEventListeners();
        //End Editor implementation
    } else {
        //Start Viewer implementation

        //json get parameters common to all resources
        var commonParams = {
            L: this.projectConfig.bounds.west,
            R: this.projectConfig.bounds.east,
            B: this.projectConfig.bounds.south,
            T: this.projectConfig.bounds.north
        };

        //helper function to ensure deep copy of common params, add resource property (cctv, signwithmessage, etc)
        function cloneWithResource(resource) {
            var newParams = {};
            for (var key in commonParams) {
                newParams[key] = commonParams[key];
            }
            newParams['resource'] = resource;
            return newParams
        }

        //create the inventory / travel speed InventoryLayer Objects, all within an array
        this.arrInventoryIncidentLayers = [
            new InventoryLayer({
                layerName: 'Incidents',
                rootGetUrl: this.inventoryResourceUrl,
                getParams: cloneWithResource('INCIDENT'),
                popupTemplate: '<p>{0}</p>',
                popupPropertyNamesArr: ['event-element-details_event-element-detail_element-descriptions_element-description_additional-text_description'],
                iconUrl: 'icons/incident.png',
                startupShow: this.projectConfig.showLayers.incidents
            }),
            new InventoryLayer({
                layerName: 'Lane Closures',
                rootGetUrl: this.inventoryResourceUrl,
                getParams: cloneWithResource('LCSCURRENT'),
                popupTemplate: '<p>Description: {0}<br/>Detour: {1}<br/>Start: {2}<br/>End: {3}</p>',
                popupPropertyNamesArr: ['Description', 'Detour', 'StartDate', 'EndDate'],
                iconUrl: 'icons/roadclosure.png',
                startupShow: this.projectConfig.showLayers.laneClosures
            }),
            new InventoryLayer({
                layerName: 'Future Lane Closures',
                rootGetUrl: this.inventoryResourceUrl,
                getParams: cloneWithResource('LCSFUTURE'),
                popupTemplate: '<p>Description: {0}<br/>Start: {1}<br/>End: {2}</p>',
                popupPropertyNamesArr: ['Description', 'StartDate', 'EndDate'],
                iconUrl: 'icons/futureroadclosure.png',
                startupShow: this.projectConfig.showLayers.futureLaneClosures
            }),
            new InventoryLayer({
                layerName: 'Cameras',
                rootGetUrl: this.inventoryResourceUrl,
                getParams: cloneWithResource('cctv'),
                popupTemplate: '<img src="http://{0}" width=240>',
                popupPropertyNamesArr: ['URL'],
                iconUrl: 'icons/camera.png',
                startupShow: this.projectConfig.showLayers.cameras
            }),
            new InventoryLayer({
                layerName: 'Message Signs',
                rootGetUrl: this.inventoryResourceUrl,
                getParams: cloneWithResource('signwithmessage'),
                popupTemplate: '<p style="background-color: black; color: yellow; min-height: 40px; width: 180px; padding: 10px;">{0}</p>',
                popupPropertyNamesArr: ['dms-current-message'],
                iconUrl: 'icons/messagesign.png',
                startupShow: this.projectConfig.showLayers.messageSigns
            }),
            new InventoryLayer({
                layerName: 'Traffic Speed (mph)',
                rootGetUrl: this.inventoryResourceUrl,
                getParams: cloneWithResource('LINKWITHSPEED'),
                popupTemplate: '<p>Current Speed: {0}</p>',
                popupPropertyNamesArr: ['speed-average_mph'],
                iconUrl: 'icons/traffic.png',
                startupShow: this.projectConfig.showLayers.trafficSpeed
            })
        ];

        //Create a lookup object to get the layer by an id
        this.objInventoryIncidentLayers = {};

        //populate lookup object
        for (i = 0; i < this.arrInventoryIncidentLayers.length; i++) {
            this.objInventoryIncidentLayers[this.arrInventoryIncidentLayers[i].layerId] =
                this.arrInventoryIncidentLayers[i];
        }

        //Add legend markup
        $('.map-inset-div').append('<div id="legend-tree"><ul id="legend-list"></ul></div>');

        //jQuery ref to legend list
        var legendList = $('#legend-list');

        //initialize content for inventory, incidents, lane closures, speed, and winter roads segments
        var inventoryContent = '<li class="legend-header"><p class="legend-header-content">' +
            'WI 511 Real-time Traveler Information</p><ul>';

        //Add the inventory layers that are set to display on startup and add items to the legend
        for (i = 0; i < _this.arrInventoryIncidentLayers.length; i++) {
            if (_this.arrInventoryIncidentLayers[i].startupShow) {
                _this.map.addLayer(_this.arrInventoryIncidentLayers[i].leafletGeoJsonLayer);
            }
            inventoryContent += _this.arrInventoryIncidentLayers[i].makeLegendHtml();
        }


        //Add the wrs segments between October and May, note that January is month 0 in JavaScript
        var d = new Date();
        var month = d.getMonth();

        if (month <= 4 || month >= 9) {
            //Create wrsSegments object passing project bounds(inner hole of polygon and startup show boolean
            var wrsSegments = new WrsSegments(this.innerBoundsPolygon, this.projectConfig.showLayers.wrsSegments);
            //Add the wrs segment layer if configured to show on startup
            if (this.projectConfig.showLayers.wrsSegments) {
                this.map.addLayer(wrsSegments.leafletLayer);
            }

            //append the markup to the legend
            inventoryContent += wrsSegments.makeLegendHtml()

            //add event handler to show and hid the layer on checkbox change
            $('#wrsSegments').change(function (e) {
                if (this.checked) {
                    _this.map.addLayer(wrsSegments.leafletLayer);
                } else {
                    _this.map.removeLayer(wrsSegments.leafletLayer);
                }
            });
        }

        //end the li wrapper for inventory content
        inventoryContent += '</ul></li>';
        legendList.append(inventoryContent);

        //initialize content for inventory, incidents, lane closures, speed, and winter roads segments
        var project511LayerContent = '<li class="legend-header"><p class="legend-header-content">' +
            'WI 511 Construction Project Information</p><ul>';


        /*loop over layer groups and sub layers for digitized features from the editor
         add to the map those for which the group and the individual feature are
         set to be shown at startup
         */
        for (i = 0; i < _this._layersArray.length; i++) {
            var theLayer = _this._layersArray[i];
            var featureLayers = theLayer.leafletLayer.getLayers();
            for (var j = 0; j < featureLayers.length; j++) {
                if (featureLayers[j].feature.properties.initialShow && theLayer.startupShow) {
                    _this.map.addLayer(featureLayers[j]);
                }
            }
            //Add the legend html
            project511LayerContent += theLayer.makeLegendHtml()
        }

        //end the li wrapper for project content
        project511LayerContent += '</ul></li>';
        legendList.append(project511LayerContent);

        //initialize the checkbox tree
        $('#legend-tree').tree({});

        /*event handler for user digitized feature checkbox change
         checkboxes have id in format {group id}_{feature id}
         use the underscore to split the parts
         */
        $('.chk-layer-subgroup').change(function (event) {
            var idSplit = this.id.split('_');
            var groupId = idSplit[0];
            var featId = idSplit[1];

            //add or remove the layer based on status of checked
            if (this.checked) {
                _this.map.addLayer(_this._layersRefObject[groupId].objSubLayers[featId]);
            } else {
                _this.map.removeLayer(_this._layersRefObject[groupId].objSubLayers[featId]);
            }
        });

        /*event handler for inventory/incident/speed layers
         use id lookup object to reference layer and add or remove from map
         */
        $('.chk-inventory').change(function () {
            if (this.checked) {
                _this.map.addLayer(_this.objInventoryIncidentLayers[this.id].leafletGeoJsonLayer);
            } else {
                _this.map.removeLayer(_this.objInventoryIncidentLayers[this.id].leafletGeoJsonLayer);
            }
        });
        //End Viewer implementation
    }

//Start common to viewer and editor


//Leaflet messes with scrolling for divs contained in the map
//implement manually here
    var $mapInsetInnerDiv = $('.map-inset-div > div');

    /*should always find one element based on selector .map-inset-div > div
     id is not used because it is different for editor and viewer implementations
     */
    if ($mapInsetInnerDiv.length > 0) {
        //set scroll to top at init
        $mapInsetInnerDiv[0].scrollTop = 0;

        //helper function to implement scrolling
        function scrollDiv(el, goUp) {
            var increment = 40;
            if (goUp) {
                el.scrollTop -= increment;
            } else {
                el.scrollTop += increment;
            }
        }

        /*events are different for different browsers
         handle events and pass appropriate parameters to function scrolldiv
         theElement (dom Element), and goUp (boolean)
         */
        $mapInsetInnerDiv.bind('mousewheel', function (event) {
            //IE and Chrome
            var wheelData = (event.wheelDelta ? event.wheelDelta : event.originalEvent.wheelDelta);
            scrollDiv(this, wheelData > 0);
            event.preventDefault();
            event.stopPropagation();
        }).bind('DOMMouseScroll', function (event) {
            //firefox and opera
            var wheelData = (event.detail ? event.detail : event.originalEvent.detail);
            scrollDiv(this, wheelData < 0);
            event.preventDefault();
            event.stopPropagation();
        });
    }
}

