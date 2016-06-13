(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

/**
 * Dependencies
 */

var UPLOAD_URL = require('./config.json').upload_url;
var exif = require('exif-js');
var pica = require('pica');

function App(el) {
  this.el = el;
  this.els = {};
  this.render();
  this.setState('empty');
}

App.prototype = {
  render: function() {
    this.el.innerHTML = this.template();

    // grab refs
    this.els = {
      preview: this.el.querySelector('.preview'),
      input: this.el.querySelector('.file-input'),
      upload: this.el.querySelector('.button-upload'),
      cancel: this.el.querySelector('.button-cancel')
    };

    // events
    this.els.input.addEventListener('change', this.onFileChanged.bind(this));
    this.els.cancel.addEventListener('click', this.clear.bind(this));
    this.els.upload.addEventListener('click', this.upload.bind(this));
  },

  template: function() {
    return '<div class="container">' +
      '<div class="preview"></div>' +
      '<div class="canvas-overlay">' +
        '<label class="button-file-input">' +
          '<input type="file" class="file-input"/>' +
        '</label>' +
        '<h2 class="scaling">Resizing image</h2>' +
        '<button class="button-upload">Upload</button>' +
        '<button class="button-cancel">Cancel</button>' +
        '<h2 class="confirmation">Image uploaded</h2>' +
      '</div>' +
    '</div>';
  },

  onFileChanged: function(e) {
    var file = e.target.files[0];
    if (!file) return;
    this.renderImage(file);
  },

  renderImage: function(file) {
    this.setState('scaling');

    this.image = new ScaledImage(file, {
      width: 600,
      height: 600
    });

    this.image.process(function() {
      this.setState('uploadable');
      this.els.preview.appendChild(this.image.canvas);
    }.bind(this));
  },

  upload: function() {
    if (!(this.image && this.image.complete)) return;
    var self = this;
    upload(this.image.toBlob(), this.image.name, function(err) {
      if (err) throw err;
      self.setState('uploaded');
      setTimeout(function() {
        self.clear();
      }, 3000);
    });
  },

  clear: function() {
    this.els.preview.innerHTML = '';
    this.els.input.value = '';
    this.image = null;
    this.setState('empty');
  },

  setState: function(value) {
    this.state = value;
    this.el.setAttribute('state', value);
  }
};

function ScaledImage(file, options) {
  this.canvas = document.createElement('canvas');
  this.canvas.width = options.width;
  this.canvas.height = options.height;
  this.name = file.name;
  this.file = file;
  this.image = new Image();
}

ScaledImage.prototype = {
  load: function(done) {
    this.image.src = URL.createObjectURL(this.file);
    this.image.onload = function() {
      this.naturalWidth = this.image.naturalWidth;
      this.naturalHeight = this.image.naturalHeight;
      done();
    }.bind(this);
  },

  process: function(done) {
    var self = this;
    this.load(function() {
      self.getOrientation(function(err, orientation) {
        self.orientation = orientation;
        var canvas = self.downsample();
        URL.revokeObjectURL(self.image.src);
        canvas = self.adjustAngle(canvas);
        self.draw(canvas);
        self.complete = true;
        done(null);
      });
    });
  },

  getOrientation: function(done) {
    exif.getData(this.image, function() {
      done(null, exif.getTag(this, 'Orientation'));
    });
  },

  downsample: function() {
    var size = {
      width: this.naturalWidth,
      height: this.naturalHeight
    };

    var scaled = fill(this.canvas, size);
    return resizeImage(this.image, size, scaled);
  },

  adjustAngle: function(canvas) {
    return applyOrientation(canvas, this.orientation);
  },

  draw: function(image) {
    var ctx = this.canvas.getContext('2d');
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
  },

  toBlob: function() {
    var type = this.file.type;
    var uri = this.canvas.toDataURL(type)
    return dataUriToBlob(uri, type);
  }
};

function fill(parent, child) {
  var sw = parent.width / child.width;
  var sh = parent.height / child.height;

  // select the largest scale to fill image
  // completely within the container
  var scale = Math.max(sw, sh);

  var w = child.width * scale;
  var h = child.height * scale;

  return {
    width: w,
    height: h
  };
}

function resizeImage(image, from, to) {
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  var steps = 2;
  var pxPerStep = (from.width - to.width) / steps;
  var w = from.width;
  var h = from.height;

  for (var i = 0; i < steps; i++) {
    var w2 = w - pxPerStep;
    var scale = w2 / w;
    var h2 = h * scale;

    canvas.width = w2;
    canvas.height = h2;
    // ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(
      image,
      0,
      0,
      w2,
      h2
    );

    w = w2;
    h = h2;
  }

  return canvas;
}

/**
 * Applys transforms to rotate/flip
 * image so that it appears upright.
 *
 * Spec: http://jpegclub.org/exif_orientation.html
 *
 * @param  {HTMLCanvasElement} canvas
 * @param  {Number} orientation
 * @return {HTMLCanvasElement}
 */
function applyOrientation(canvas, orientation) {
  switch (orientation) {
    case 1: return canvas;
    case 2: return flipHorizontal(canvas);
    case 3: return rotate(canvas, 180);
    case 4: return flipVertical(canvas);
    case 5: return flipHorizontal(rotate(canvas, 90));
    case 6: return rotate(canvas, 90);
    case 7: return flipVertical(rotate(canvas, 90));
    case 8: return rotate(canvas, 270);
    case undefined: return canvas;
    default: throw Error('unknown orientation value: ' + orientation);
  }
}

function flipHorizontal(image) {
  return flip(image, 'horizontal');
}

function flipVertical(image) {
  return flip(image, 'vertical');
}

function flip(image, direction) {
  var canvas = document.createElement('canvas');
  var vertical = direction == 'vertical';
  var ctx = canvas.getContext('2d');

  canvas.width = image.width;
  canvas.height = image.height;

  ctx.translate(
    !vertical ? canvas.width : 0,
    vertical ? canvas.height : 0
  );

  ctx.scale(
    vertical ? 1 : -1,
    vertical ? -1 : 1
  );

  ctx.drawImage(image, 0, 0);
  return canvas;
}

function rotate(canvas, deg) {
  var rotated = document.createElement('canvas');
  rotated.ctx = rotated.getContext('2d');

  var rotatedSize = getRotatedSize(canvas, deg);
  rotated.width = rotatedSize.width;
  rotated.height = rotatedSize.height;

  rotated.ctx.translate(rotated.width / 2, rotated.height / 2);
  rotated.ctx.rotate(deg * Math.PI / 180);
  rotated.ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return rotated;
}

function getRotatedSize(size, deg) {
  switch (deg) {
    case 90:
    case 270: return { width: size.height, height: size.width }
    case 180:
    case 0: return size;
  }
}

function upload(blob, name, callback) {
  var formData = new FormData();
  var xhr = new XMLHttpRequest();

  formData.append('image', blob, name);
  xhr.open('POST', UPLOAD_URL, true);
  xhr.send(formData);

  xhr.onreadystatechange = function() {
    if (xhr.readyState !== XMLHttpRequest.DONE) return;
    callback(null, xhr.responseText);
  };
}

function dataUriToBlob(string, type) {
  var binary = atob(string.split(',')[1]);
  var array = [];

  for (var i = 0; i < binary.length; i++) {
    array.push(binary.charCodeAt(i));
  }

  return new Blob([new Uint8Array(array)], { type: type });
}

new App(document.querySelector('.app'));

},{"./config.json":2,"exif-js":3,"pica":6}],2:[function(require,module,exports){
module.exports={
  "upload_url": "https://tengam.org/photowall/api/v1/images"
}

},{}],3:[function(require,module,exports){
(function() {

    var debug = false;

    var root = this;

    var EXIF = function(obj) {
        if (obj instanceof EXIF) return obj;
        if (!(this instanceof EXIF)) return new EXIF(obj);
        this.EXIFwrapped = obj;
    };

    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = EXIF;
        }
        exports.EXIF = EXIF;
    } else {
        root.EXIF = EXIF;
    }

    var ExifTags = EXIF.Tags = {

        // version tags
        0x9000 : "ExifVersion",             // EXIF version
        0xA000 : "FlashpixVersion",         // Flashpix format version

        // colorspace tags
        0xA001 : "ColorSpace",              // Color space information tag

        // image configuration
        0xA002 : "PixelXDimension",         // Valid width of meaningful image
        0xA003 : "PixelYDimension",         // Valid height of meaningful image
        0x9101 : "ComponentsConfiguration", // Information about channels
        0x9102 : "CompressedBitsPerPixel",  // Compressed bits per pixel

        // user information
        0x927C : "MakerNote",               // Any desired information written by the manufacturer
        0x9286 : "UserComment",             // Comments by user

        // related file
        0xA004 : "RelatedSoundFile",        // Name of related sound file

        // date and time
        0x9003 : "DateTimeOriginal",        // Date and time when the original image was generated
        0x9004 : "DateTimeDigitized",       // Date and time when the image was stored digitally
        0x9290 : "SubsecTime",              // Fractions of seconds for DateTime
        0x9291 : "SubsecTimeOriginal",      // Fractions of seconds for DateTimeOriginal
        0x9292 : "SubsecTimeDigitized",     // Fractions of seconds for DateTimeDigitized

        // picture-taking conditions
        0x829A : "ExposureTime",            // Exposure time (in seconds)
        0x829D : "FNumber",                 // F number
        0x8822 : "ExposureProgram",         // Exposure program
        0x8824 : "SpectralSensitivity",     // Spectral sensitivity
        0x8827 : "ISOSpeedRatings",         // ISO speed rating
        0x8828 : "OECF",                    // Optoelectric conversion factor
        0x9201 : "ShutterSpeedValue",       // Shutter speed
        0x9202 : "ApertureValue",           // Lens aperture
        0x9203 : "BrightnessValue",         // Value of brightness
        0x9204 : "ExposureBias",            // Exposure bias
        0x9205 : "MaxApertureValue",        // Smallest F number of lens
        0x9206 : "SubjectDistance",         // Distance to subject in meters
        0x9207 : "MeteringMode",            // Metering mode
        0x9208 : "LightSource",             // Kind of light source
        0x9209 : "Flash",                   // Flash status
        0x9214 : "SubjectArea",             // Location and area of main subject
        0x920A : "FocalLength",             // Focal length of the lens in mm
        0xA20B : "FlashEnergy",             // Strobe energy in BCPS
        0xA20C : "SpatialFrequencyResponse",    //
        0xA20E : "FocalPlaneXResolution",   // Number of pixels in width direction per FocalPlaneResolutionUnit
        0xA20F : "FocalPlaneYResolution",   // Number of pixels in height direction per FocalPlaneResolutionUnit
        0xA210 : "FocalPlaneResolutionUnit",    // Unit for measuring FocalPlaneXResolution and FocalPlaneYResolution
        0xA214 : "SubjectLocation",         // Location of subject in image
        0xA215 : "ExposureIndex",           // Exposure index selected on camera
        0xA217 : "SensingMethod",           // Image sensor type
        0xA300 : "FileSource",              // Image source (3 == DSC)
        0xA301 : "SceneType",               // Scene type (1 == directly photographed)
        0xA302 : "CFAPattern",              // Color filter array geometric pattern
        0xA401 : "CustomRendered",          // Special processing
        0xA402 : "ExposureMode",            // Exposure mode
        0xA403 : "WhiteBalance",            // 1 = auto white balance, 2 = manual
        0xA404 : "DigitalZoomRation",       // Digital zoom ratio
        0xA405 : "FocalLengthIn35mmFilm",   // Equivalent foacl length assuming 35mm film camera (in mm)
        0xA406 : "SceneCaptureType",        // Type of scene
        0xA407 : "GainControl",             // Degree of overall image gain adjustment
        0xA408 : "Contrast",                // Direction of contrast processing applied by camera
        0xA409 : "Saturation",              // Direction of saturation processing applied by camera
        0xA40A : "Sharpness",               // Direction of sharpness processing applied by camera
        0xA40B : "DeviceSettingDescription",    //
        0xA40C : "SubjectDistanceRange",    // Distance to subject

        // other tags
        0xA005 : "InteroperabilityIFDPointer",
        0xA420 : "ImageUniqueID"            // Identifier assigned uniquely to each image
    };

    var TiffTags = EXIF.TiffTags = {
        0x0100 : "ImageWidth",
        0x0101 : "ImageHeight",
        0x8769 : "ExifIFDPointer",
        0x8825 : "GPSInfoIFDPointer",
        0xA005 : "InteroperabilityIFDPointer",
        0x0102 : "BitsPerSample",
        0x0103 : "Compression",
        0x0106 : "PhotometricInterpretation",
        0x0112 : "Orientation",
        0x0115 : "SamplesPerPixel",
        0x011C : "PlanarConfiguration",
        0x0212 : "YCbCrSubSampling",
        0x0213 : "YCbCrPositioning",
        0x011A : "XResolution",
        0x011B : "YResolution",
        0x0128 : "ResolutionUnit",
        0x0111 : "StripOffsets",
        0x0116 : "RowsPerStrip",
        0x0117 : "StripByteCounts",
        0x0201 : "JPEGInterchangeFormat",
        0x0202 : "JPEGInterchangeFormatLength",
        0x012D : "TransferFunction",
        0x013E : "WhitePoint",
        0x013F : "PrimaryChromaticities",
        0x0211 : "YCbCrCoefficients",
        0x0214 : "ReferenceBlackWhite",
        0x0132 : "DateTime",
        0x010E : "ImageDescription",
        0x010F : "Make",
        0x0110 : "Model",
        0x0131 : "Software",
        0x013B : "Artist",
        0x8298 : "Copyright"
    };

    var GPSTags = EXIF.GPSTags = {
        0x0000 : "GPSVersionID",
        0x0001 : "GPSLatitudeRef",
        0x0002 : "GPSLatitude",
        0x0003 : "GPSLongitudeRef",
        0x0004 : "GPSLongitude",
        0x0005 : "GPSAltitudeRef",
        0x0006 : "GPSAltitude",
        0x0007 : "GPSTimeStamp",
        0x0008 : "GPSSatellites",
        0x0009 : "GPSStatus",
        0x000A : "GPSMeasureMode",
        0x000B : "GPSDOP",
        0x000C : "GPSSpeedRef",
        0x000D : "GPSSpeed",
        0x000E : "GPSTrackRef",
        0x000F : "GPSTrack",
        0x0010 : "GPSImgDirectionRef",
        0x0011 : "GPSImgDirection",
        0x0012 : "GPSMapDatum",
        0x0013 : "GPSDestLatitudeRef",
        0x0014 : "GPSDestLatitude",
        0x0015 : "GPSDestLongitudeRef",
        0x0016 : "GPSDestLongitude",
        0x0017 : "GPSDestBearingRef",
        0x0018 : "GPSDestBearing",
        0x0019 : "GPSDestDistanceRef",
        0x001A : "GPSDestDistance",
        0x001B : "GPSProcessingMethod",
        0x001C : "GPSAreaInformation",
        0x001D : "GPSDateStamp",
        0x001E : "GPSDifferential"
    };

    var StringValues = EXIF.StringValues = {
        ExposureProgram : {
            0 : "Not defined",
            1 : "Manual",
            2 : "Normal program",
            3 : "Aperture priority",
            4 : "Shutter priority",
            5 : "Creative program",
            6 : "Action program",
            7 : "Portrait mode",
            8 : "Landscape mode"
        },
        MeteringMode : {
            0 : "Unknown",
            1 : "Average",
            2 : "CenterWeightedAverage",
            3 : "Spot",
            4 : "MultiSpot",
            5 : "Pattern",
            6 : "Partial",
            255 : "Other"
        },
        LightSource : {
            0 : "Unknown",
            1 : "Daylight",
            2 : "Fluorescent",
            3 : "Tungsten (incandescent light)",
            4 : "Flash",
            9 : "Fine weather",
            10 : "Cloudy weather",
            11 : "Shade",
            12 : "Daylight fluorescent (D 5700 - 7100K)",
            13 : "Day white fluorescent (N 4600 - 5400K)",
            14 : "Cool white fluorescent (W 3900 - 4500K)",
            15 : "White fluorescent (WW 3200 - 3700K)",
            17 : "Standard light A",
            18 : "Standard light B",
            19 : "Standard light C",
            20 : "D55",
            21 : "D65",
            22 : "D75",
            23 : "D50",
            24 : "ISO studio tungsten",
            255 : "Other"
        },
        Flash : {
            0x0000 : "Flash did not fire",
            0x0001 : "Flash fired",
            0x0005 : "Strobe return light not detected",
            0x0007 : "Strobe return light detected",
            0x0009 : "Flash fired, compulsory flash mode",
            0x000D : "Flash fired, compulsory flash mode, return light not detected",
            0x000F : "Flash fired, compulsory flash mode, return light detected",
            0x0010 : "Flash did not fire, compulsory flash mode",
            0x0018 : "Flash did not fire, auto mode",
            0x0019 : "Flash fired, auto mode",
            0x001D : "Flash fired, auto mode, return light not detected",
            0x001F : "Flash fired, auto mode, return light detected",
            0x0020 : "No flash function",
            0x0041 : "Flash fired, red-eye reduction mode",
            0x0045 : "Flash fired, red-eye reduction mode, return light not detected",
            0x0047 : "Flash fired, red-eye reduction mode, return light detected",
            0x0049 : "Flash fired, compulsory flash mode, red-eye reduction mode",
            0x004D : "Flash fired, compulsory flash mode, red-eye reduction mode, return light not detected",
            0x004F : "Flash fired, compulsory flash mode, red-eye reduction mode, return light detected",
            0x0059 : "Flash fired, auto mode, red-eye reduction mode",
            0x005D : "Flash fired, auto mode, return light not detected, red-eye reduction mode",
            0x005F : "Flash fired, auto mode, return light detected, red-eye reduction mode"
        },
        SensingMethod : {
            1 : "Not defined",
            2 : "One-chip color area sensor",
            3 : "Two-chip color area sensor",
            4 : "Three-chip color area sensor",
            5 : "Color sequential area sensor",
            7 : "Trilinear sensor",
            8 : "Color sequential linear sensor"
        },
        SceneCaptureType : {
            0 : "Standard",
            1 : "Landscape",
            2 : "Portrait",
            3 : "Night scene"
        },
        SceneType : {
            1 : "Directly photographed"
        },
        CustomRendered : {
            0 : "Normal process",
            1 : "Custom process"
        },
        WhiteBalance : {
            0 : "Auto white balance",
            1 : "Manual white balance"
        },
        GainControl : {
            0 : "None",
            1 : "Low gain up",
            2 : "High gain up",
            3 : "Low gain down",
            4 : "High gain down"
        },
        Contrast : {
            0 : "Normal",
            1 : "Soft",
            2 : "Hard"
        },
        Saturation : {
            0 : "Normal",
            1 : "Low saturation",
            2 : "High saturation"
        },
        Sharpness : {
            0 : "Normal",
            1 : "Soft",
            2 : "Hard"
        },
        SubjectDistanceRange : {
            0 : "Unknown",
            1 : "Macro",
            2 : "Close view",
            3 : "Distant view"
        },
        FileSource : {
            3 : "DSC"
        },

        Components : {
            0 : "",
            1 : "Y",
            2 : "Cb",
            3 : "Cr",
            4 : "R",
            5 : "G",
            6 : "B"
        }
    };

    function addEvent(element, event, handler) {
        if (element.addEventListener) {
            element.addEventListener(event, handler, false);
        } else if (element.attachEvent) {
            element.attachEvent("on" + event, handler);
        }
    }

    function imageHasData(img) {
        return !!(img.exifdata);
    }


    function base64ToArrayBuffer(base64, contentType) {
        contentType = contentType || base64.match(/^data\:([^\;]+)\;base64,/mi)[1] || ''; // e.g. 'data:image/jpeg;base64,...' => 'image/jpeg'
        base64 = base64.replace(/^data\:([^\;]+)\;base64,/gmi, '');
        var binary = atob(base64);
        var len = binary.length;
        var buffer = new ArrayBuffer(len);
        var view = new Uint8Array(buffer);
        for (var i = 0; i < len; i++) {
            view[i] = binary.charCodeAt(i);
        }
        return buffer;
    }

    function objectURLToBlob(url, callback) {
        var http = new XMLHttpRequest();
        http.open("GET", url, true);
        http.responseType = "blob";
        http.onload = function(e) {
            if (this.status == 200 || this.status === 0) {
                callback(this.response);
            }
        };
        http.send();
    }

    function getImageData(img, callback) {
        function handleBinaryFile(binFile) {
            var data = findEXIFinJPEG(binFile);
            var iptcdata = findIPTCinJPEG(binFile);
            img.exifdata = data || {};
            img.iptcdata = iptcdata || {};
            if (callback) {
                callback.call(img);
            }
        }

        if (img.src) {
            if (/^data\:/i.test(img.src)) { // Data URI
                var arrayBuffer = base64ToArrayBuffer(img.src);
                handleBinaryFile(arrayBuffer);

            } else if (/^blob\:/i.test(img.src)) { // Object URL
                var fileReader = new FileReader();
                fileReader.onload = function(e) {
                    handleBinaryFile(e.target.result);
                };
                objectURLToBlob(img.src, function (blob) {
                    fileReader.readAsArrayBuffer(blob);
                });
            } else {
                var http = new XMLHttpRequest();
                http.onload = function() {
                    if (this.status == 200 || this.status === 0) {
                        handleBinaryFile(http.response);
                    } else {
                        throw "Could not load image";
                    }
                    http = null;
                };
                http.open("GET", img.src, true);
                http.responseType = "arraybuffer";
                http.send(null);
            }
        } else if (window.FileReader && (img instanceof window.Blob || img instanceof window.File)) {
            var fileReader = new FileReader();
            fileReader.onload = function(e) {
                if (debug) console.log("Got file of length " + e.target.result.byteLength);
                handleBinaryFile(e.target.result);
            };

            fileReader.readAsArrayBuffer(img);
        }
    }

    function findEXIFinJPEG(file) {
        var dataView = new DataView(file);

        if (debug) console.log("Got file of length " + file.byteLength);
        if ((dataView.getUint8(0) != 0xFF) || (dataView.getUint8(1) != 0xD8)) {
            if (debug) console.log("Not a valid JPEG");
            return false; // not a valid jpeg
        }

        var offset = 2,
            length = file.byteLength,
            marker;

        while (offset < length) {
            if (dataView.getUint8(offset) != 0xFF) {
                if (debug) console.log("Not a valid marker at offset " + offset + ", found: " + dataView.getUint8(offset));
                return false; // not a valid marker, something is wrong
            }

            marker = dataView.getUint8(offset + 1);
            if (debug) console.log(marker);

            // we could implement handling for other markers here,
            // but we're only looking for 0xFFE1 for EXIF data

            if (marker == 225) {
                if (debug) console.log("Found 0xFFE1 marker");

                return readEXIFData(dataView, offset + 4, dataView.getUint16(offset + 2) - 2);

                // offset += 2 + file.getShortAt(offset+2, true);

            } else {
                offset += 2 + dataView.getUint16(offset+2);
            }

        }

    }

    function findIPTCinJPEG(file) {
        var dataView = new DataView(file);

        if (debug) console.log("Got file of length " + file.byteLength);
        if ((dataView.getUint8(0) != 0xFF) || (dataView.getUint8(1) != 0xD8)) {
            if (debug) console.log("Not a valid JPEG");
            return false; // not a valid jpeg
        }

        var offset = 2,
            length = file.byteLength;


        var isFieldSegmentStart = function(dataView, offset){
            return (
                dataView.getUint8(offset) === 0x38 &&
                dataView.getUint8(offset+1) === 0x42 &&
                dataView.getUint8(offset+2) === 0x49 &&
                dataView.getUint8(offset+3) === 0x4D &&
                dataView.getUint8(offset+4) === 0x04 &&
                dataView.getUint8(offset+5) === 0x04
            );
        };

        while (offset < length) {

            if ( isFieldSegmentStart(dataView, offset )){

                // Get the length of the name header (which is padded to an even number of bytes)
                var nameHeaderLength = dataView.getUint8(offset+7);
                if(nameHeaderLength % 2 !== 0) nameHeaderLength += 1;
                // Check for pre photoshop 6 format
                if(nameHeaderLength === 0) {
                    // Always 4
                    nameHeaderLength = 4;
                }

                var startOffset = offset + 8 + nameHeaderLength;
                var sectionLength = dataView.getUint16(offset + 6 + nameHeaderLength);

                return readIPTCData(file, startOffset, sectionLength);

                break;

            }


            // Not the marker, continue searching
            offset++;

        }

    }
    var IptcFieldMap = {
        0x78 : 'caption',
        0x6E : 'credit',
        0x19 : 'keywords',
        0x37 : 'dateCreated',
        0x50 : 'byline',
        0x55 : 'bylineTitle',
        0x7A : 'captionWriter',
        0x69 : 'headline',
        0x74 : 'copyright',
        0x0F : 'category'
    };
    function readIPTCData(file, startOffset, sectionLength){
        var dataView = new DataView(file);
        var data = {};
        var fieldValue, fieldName, dataSize, segmentType, segmentSize;
        var segmentStartPos = startOffset;
        while(segmentStartPos < startOffset+sectionLength) {
            if(dataView.getUint8(segmentStartPos) === 0x1C && dataView.getUint8(segmentStartPos+1) === 0x02){
                segmentType = dataView.getUint8(segmentStartPos+2);
                if(segmentType in IptcFieldMap) {
                    dataSize = dataView.getInt16(segmentStartPos+3);
                    segmentSize = dataSize + 5;
                    fieldName = IptcFieldMap[segmentType];
                    fieldValue = getStringFromDB(dataView, segmentStartPos+5, dataSize);
                    // Check if we already stored a value with this name
                    if(data.hasOwnProperty(fieldName)) {
                        // Value already stored with this name, create multivalue field
                        if(data[fieldName] instanceof Array) {
                            data[fieldName].push(fieldValue);
                        }
                        else {
                            data[fieldName] = [data[fieldName], fieldValue];
                        }
                    }
                    else {
                        data[fieldName] = fieldValue;
                    }
                }

            }
            segmentStartPos++;
        }
        return data;
    }



    function readTags(file, tiffStart, dirStart, strings, bigEnd) {
        var entries = file.getUint16(dirStart, !bigEnd),
            tags = {},
            entryOffset, tag,
            i;

        for (i=0;i<entries;i++) {
            entryOffset = dirStart + i*12 + 2;
            tag = strings[file.getUint16(entryOffset, !bigEnd)];
            if (!tag && debug) console.log("Unknown tag: " + file.getUint16(entryOffset, !bigEnd));
            tags[tag] = readTagValue(file, entryOffset, tiffStart, dirStart, bigEnd);
        }
        return tags;
    }


    function readTagValue(file, entryOffset, tiffStart, dirStart, bigEnd) {
        var type = file.getUint16(entryOffset+2, !bigEnd),
            numValues = file.getUint32(entryOffset+4, !bigEnd),
            valueOffset = file.getUint32(entryOffset+8, !bigEnd) + tiffStart,
            offset,
            vals, val, n,
            numerator, denominator;

        switch (type) {
            case 1: // byte, 8-bit unsigned int
            case 7: // undefined, 8-bit byte, value depending on field
                if (numValues == 1) {
                    return file.getUint8(entryOffset + 8, !bigEnd);
                } else {
                    offset = numValues > 4 ? valueOffset : (entryOffset + 8);
                    vals = [];
                    for (n=0;n<numValues;n++) {
                        vals[n] = file.getUint8(offset + n);
                    }
                    return vals;
                }

            case 2: // ascii, 8-bit byte
                offset = numValues > 4 ? valueOffset : (entryOffset + 8);
                return getStringFromDB(file, offset, numValues-1);

            case 3: // short, 16 bit int
                if (numValues == 1) {
                    return file.getUint16(entryOffset + 8, !bigEnd);
                } else {
                    offset = numValues > 2 ? valueOffset : (entryOffset + 8);
                    vals = [];
                    for (n=0;n<numValues;n++) {
                        vals[n] = file.getUint16(offset + 2*n, !bigEnd);
                    }
                    return vals;
                }

            case 4: // long, 32 bit int
                if (numValues == 1) {
                    return file.getUint32(entryOffset + 8, !bigEnd);
                } else {
                    vals = [];
                    for (n=0;n<numValues;n++) {
                        vals[n] = file.getUint32(valueOffset + 4*n, !bigEnd);
                    }
                    return vals;
                }

            case 5:    // rational = two long values, first is numerator, second is denominator
                if (numValues == 1) {
                    numerator = file.getUint32(valueOffset, !bigEnd);
                    denominator = file.getUint32(valueOffset+4, !bigEnd);
                    val = new Number(numerator / denominator);
                    val.numerator = numerator;
                    val.denominator = denominator;
                    return val;
                } else {
                    vals = [];
                    for (n=0;n<numValues;n++) {
                        numerator = file.getUint32(valueOffset + 8*n, !bigEnd);
                        denominator = file.getUint32(valueOffset+4 + 8*n, !bigEnd);
                        vals[n] = new Number(numerator / denominator);
                        vals[n].numerator = numerator;
                        vals[n].denominator = denominator;
                    }
                    return vals;
                }

            case 9: // slong, 32 bit signed int
                if (numValues == 1) {
                    return file.getInt32(entryOffset + 8, !bigEnd);
                } else {
                    vals = [];
                    for (n=0;n<numValues;n++) {
                        vals[n] = file.getInt32(valueOffset + 4*n, !bigEnd);
                    }
                    return vals;
                }

            case 10: // signed rational, two slongs, first is numerator, second is denominator
                if (numValues == 1) {
                    return file.getInt32(valueOffset, !bigEnd) / file.getInt32(valueOffset+4, !bigEnd);
                } else {
                    vals = [];
                    for (n=0;n<numValues;n++) {
                        vals[n] = file.getInt32(valueOffset + 8*n, !bigEnd) / file.getInt32(valueOffset+4 + 8*n, !bigEnd);
                    }
                    return vals;
                }
        }
    }

    function getStringFromDB(buffer, start, length) {
        var outstr = "";
        for (n = start; n < start+length; n++) {
            outstr += String.fromCharCode(buffer.getUint8(n));
        }
        return outstr;
    }

    function readEXIFData(file, start) {
        if (getStringFromDB(file, start, 4) != "Exif") {
            if (debug) console.log("Not valid EXIF data! " + getStringFromDB(file, start, 4));
            return false;
        }

        var bigEnd,
            tags, tag,
            exifData, gpsData,
            tiffOffset = start + 6;

        // test for TIFF validity and endianness
        if (file.getUint16(tiffOffset) == 0x4949) {
            bigEnd = false;
        } else if (file.getUint16(tiffOffset) == 0x4D4D) {
            bigEnd = true;
        } else {
            if (debug) console.log("Not valid TIFF data! (no 0x4949 or 0x4D4D)");
            return false;
        }

        if (file.getUint16(tiffOffset+2, !bigEnd) != 0x002A) {
            if (debug) console.log("Not valid TIFF data! (no 0x002A)");
            return false;
        }

        var firstIFDOffset = file.getUint32(tiffOffset+4, !bigEnd);

        if (firstIFDOffset < 0x00000008) {
            if (debug) console.log("Not valid TIFF data! (First offset less than 8)", file.getUint32(tiffOffset+4, !bigEnd));
            return false;
        }

        tags = readTags(file, tiffOffset, tiffOffset + firstIFDOffset, TiffTags, bigEnd);

        if (tags.ExifIFDPointer) {
            exifData = readTags(file, tiffOffset, tiffOffset + tags.ExifIFDPointer, ExifTags, bigEnd);
            for (tag in exifData) {
                switch (tag) {
                    case "LightSource" :
                    case "Flash" :
                    case "MeteringMode" :
                    case "ExposureProgram" :
                    case "SensingMethod" :
                    case "SceneCaptureType" :
                    case "SceneType" :
                    case "CustomRendered" :
                    case "WhiteBalance" :
                    case "GainControl" :
                    case "Contrast" :
                    case "Saturation" :
                    case "Sharpness" :
                    case "SubjectDistanceRange" :
                    case "FileSource" :
                        exifData[tag] = StringValues[tag][exifData[tag]];
                        break;

                    case "ExifVersion" :
                    case "FlashpixVersion" :
                        exifData[tag] = String.fromCharCode(exifData[tag][0], exifData[tag][1], exifData[tag][2], exifData[tag][3]);
                        break;

                    case "ComponentsConfiguration" :
                        exifData[tag] =
                            StringValues.Components[exifData[tag][0]] +
                            StringValues.Components[exifData[tag][1]] +
                            StringValues.Components[exifData[tag][2]] +
                            StringValues.Components[exifData[tag][3]];
                        break;
                }
                tags[tag] = exifData[tag];
            }
        }

        if (tags.GPSInfoIFDPointer) {
            gpsData = readTags(file, tiffOffset, tiffOffset + tags.GPSInfoIFDPointer, GPSTags, bigEnd);
            for (tag in gpsData) {
                switch (tag) {
                    case "GPSVersionID" :
                        gpsData[tag] = gpsData[tag][0] +
                            "." + gpsData[tag][1] +
                            "." + gpsData[tag][2] +
                            "." + gpsData[tag][3];
                        break;
                }
                tags[tag] = gpsData[tag];
            }
        }

        return tags;
    }

    EXIF.getData = function(img, callback) {
        if ((img instanceof Image || img instanceof HTMLImageElement) && !img.complete) return false;

        if (!imageHasData(img)) {
            getImageData(img, callback);
        } else {
            if (callback) {
                callback.call(img);
            }
        }
        return true;
    }

    EXIF.getTag = function(img, tag) {
        if (!imageHasData(img)) return;
        return img.exifdata[tag];
    }

    EXIF.getAllTags = function(img) {
        if (!imageHasData(img)) return {};
        var a,
            data = img.exifdata,
            tags = {};
        for (a in data) {
            if (data.hasOwnProperty(a)) {
                tags[a] = data[a];
            }
        }
        return tags;
    }

    EXIF.pretty = function(img) {
        if (!imageHasData(img)) return "";
        var a,
            data = img.exifdata,
            strPretty = "";
        for (a in data) {
            if (data.hasOwnProperty(a)) {
                if (typeof data[a] == "object") {
                    if (data[a] instanceof Number) {
                        strPretty += a + " : " + data[a] + " [" + data[a].numerator + "/" + data[a].denominator + "]\r\n";
                    } else {
                        strPretty += a + " : [" + data[a].length + " values]\r\n";
                    }
                } else {
                    strPretty += a + " : " + data[a] + "\r\n";
                }
            }
        }
        return strPretty;
    }

    EXIF.readFromBinaryFile = function(file) {
        return findEXIFinJPEG(file);
    }

    if (typeof define === 'function' && define.amd) {
        define('exif-js', [], function() {
            return EXIF;
        });
    }
}.call(this));


},{}],4:[function(require,module,exports){
// Calculate Gaussian blur of an image using IIR filter
// The method is taken from Intel's white paper and code example attached to it:
// https://software.intel.com/en-us/articles/iir-gaussian-blur-filter
// -implementation-using-intel-advanced-vector-extensions

var a0, a1, a2, a3, b1, b2, left_corner, right_corner;

function gaussCoef(sigma) {
  if (sigma < 0.5) {
    sigma = 0.5;
  }

  var a = Math.exp(0.726 * 0.726) / sigma,
      g1 = Math.exp(-a),
      g2 = Math.exp(-2 * a),
      k = (1 - g1) * (1 - g1) / (1 + 2 * a * g1 - g2);

  a0 = k;
  a1 = k * (a - 1) * g1;
  a2 = k * (a + 1) * g1;
  a3 = -k * g2;
  b1 = 2 * g1;
  b2 = -g2;
  left_corner = (a0 + a1) / (1 - b1 - b2);
  right_corner = (a2 + a3) / (1 - b1 - b2);

  // Attempt to force type to FP32.
  return new Float32Array([ a0, a1, a2, a3, b1, b2, left_corner, right_corner ]);
}

function convolveMono16(src, out, line, coeff, width, height) {
  // takes src image and writes the blurred and transposed result into out

  var prev_src, curr_src, curr_out, prev_out, prev_prev_out;
  var src_index, out_index, line_index;
  var i, j;
  var coeff_a0, coeff_a1, coeff_b1, coeff_b2;

  for (i = 0; i < height; i++) {
    src_index = i * width;
    out_index = i;
    line_index = 0;

    // left to right
    prev_src = src[src_index];
    prev_prev_out = prev_src * coeff[6];
    prev_out = prev_prev_out;

    coeff_a0 = coeff[0];
    coeff_a1 = coeff[1];
    coeff_b1 = coeff[4];
    coeff_b2 = coeff[5];

    for (j = 0; j < width; j++) {
      curr_src = src[src_index];

      curr_out = curr_src * coeff_a0 +
                 prev_src * coeff_a1 +
                 prev_out * coeff_b1 +
                 prev_prev_out * coeff_b2;

      prev_prev_out = prev_out;
      prev_out = curr_out;
      prev_src = curr_src;

      line[line_index] = prev_out;
      line_index++;
      src_index++;
    }

    src_index--;
    line_index--;
    out_index += height * (width - 1);

    // right to left
    prev_src = src[src_index];
    prev_prev_out = prev_src * coeff[7];
    prev_out = prev_prev_out;
    curr_src = prev_src;

    coeff_a0 = coeff[2];
    coeff_a1 = coeff[3];

    for (j = width - 1; j >= 0; j--) {
      curr_out = curr_src * coeff_a0 +
                 prev_src * coeff_a1 +
                 prev_out * coeff_b1 +
                 prev_prev_out * coeff_b2;

      prev_prev_out = prev_out;
      prev_out = curr_out;

      prev_src = curr_src;
      curr_src = src[src_index];

      out[out_index] = line[line_index] + prev_out;

      src_index--;
      line_index--;
      out_index -= height;
    }
  }
}


function blurMono16(src, width, height, radius) {
  // Quick exit on zero radius
  if (!radius) { return; }

  var out      = new Uint16Array(src.length),
      tmp_line = new Float32Array(Math.max(width, height));

  var coeff = gaussCoef(radius);

  convolveMono16(src, out, tmp_line, coeff, width, height, radius);
  convolveMono16(out, src, tmp_line, coeff, height, width, radius);
}

module.exports = blurMono16;

},{}],5:[function(require,module,exports){
'use strict';
/* eslint-disable no-unused-vars */
var hasOwnProperty = Object.prototype.hasOwnProperty;
var propIsEnumerable = Object.prototype.propertyIsEnumerable;

function toObject(val) {
	if (val === null || val === undefined) {
		throw new TypeError('Object.assign cannot be called with null or undefined');
	}

	return Object(val);
}

function shouldUseNative() {
	try {
		if (!Object.assign) {
			return false;
		}

		// Detect buggy property enumeration order in older V8 versions.

		// https://bugs.chromium.org/p/v8/issues/detail?id=4118
		var test1 = new String('abc');  // eslint-disable-line
		test1[5] = 'de';
		if (Object.getOwnPropertyNames(test1)[0] === '5') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test2 = {};
		for (var i = 0; i < 10; i++) {
			test2['_' + String.fromCharCode(i)] = i;
		}
		var order2 = Object.getOwnPropertyNames(test2).map(function (n) {
			return test2[n];
		});
		if (order2.join('') !== '0123456789') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test3 = {};
		'abcdefghijklmnopqrst'.split('').forEach(function (letter) {
			test3[letter] = letter;
		});
		if (Object.keys(Object.assign({}, test3)).join('') !==
				'abcdefghijklmnopqrst') {
			return false;
		}

		return true;
	} catch (e) {
		// We don't expect any of the above to throw, but better to be safe.
		return false;
	}
}

module.exports = shouldUseNative() ? Object.assign : function (target, source) {
	var from;
	var to = toObject(target);
	var symbols;

	for (var s = 1; s < arguments.length; s++) {
		from = Object(arguments[s]);

		for (var key in from) {
			if (hasOwnProperty.call(from, key)) {
				to[key] = from[key];
			}
		}

		if (Object.getOwnPropertySymbols) {
			symbols = Object.getOwnPropertySymbols(from);
			for (var i = 0; i < symbols.length; i++) {
				if (propIsEnumerable.call(from, symbols[i])) {
					to[symbols[i]] = from[symbols[i]];
				}
			}
		}
	}

	return to;
};

},{}],6:[function(require,module,exports){
'use strict';

/*global window, document*/
/*eslint space-infix-ops:0*/

// Feature detect
var WORKER = (typeof window !== 'undefined') && ('Worker' in window);
if (WORKER) {
  // IE don't allow to create webworkers from string. We should check it.
  // https://connect.microsoft.com/IE/feedback/details/801810/web-workers-from-blob-urls-in-ie-10-and-11
  try {
    var wkr = require('webworkify')(function () {});
    wkr.terminate();
  } catch (__) {
    WORKER = false;
  }
}

var WEBGL = false,
    __cvs;
try {
  if (typeof document !== 'undefined' &&
      typeof window !== 'undefined' &&
      window.WebGLRenderingContext) {

    __cvs = document.createElement('canvas');

    if (__cvs.getContext('webgl') || __cvs.getContext('experimental-webgl')) {
      WEBGL = true;
    }
  }
} catch (__) {
} finally {
  __cvs = null;
}

var resize_js     = require('./lib/resize_js');
var resize_js_ww  = require('./lib/resize_js_ww');
var resize_webgl  = require('./lib/resize_webgl');
var resize_array  = require('./lib/js/resize_array');
var unsharp       = require('./lib/js/unsharp');
var assign        = require('object-assign');

////////////////////////////////////////////////////////////////////////////////
// Helpers
function _class(obj) { return Object.prototype.toString.call(obj); }
function isFunction(obj) { return _class(obj) === '[object Function]'; }

////////////////////////////////////////////////////////////////////////////////
// API methods

// Canvas async resize
//
function resizeCanvas(from, to, options, callback) {
  if (isFunction(options)) {
    callback = options;
    options = {};
  }

  if (!isNaN(options)) {
    options = { quality: options, alpha: false };
  }

  // Force flag reset to simplify status check
  if (!WEBGL) { exports.WEBGL = false; }

  if (WEBGL && exports.WEBGL) {
    exports.debug('Resize canvas with WebGL');

    var id = resize_webgl(from, to, options, function (err) {
      if (err) {
        exports.debug('WebGL resize failed, do fallback and cancel next attempts');
        exports.debug(err);

        WEBGL = false;
        resizeCanvas(from, to, assign({}, options, { _id: id }), callback);
      } else {
        callback();
      }
    });
    return id;
  }

  // Force flag reset to simplify status check
  if (!WORKER) { exports.WW = false; }

  if (WORKER && exports.WW) {
    exports.debug('Resize buffer in WebWorker');

    return resize_js_ww(from, to, options, callback);
  }

  // Fallback to sync call, if WebWorkers not available
  exports.debug('Resize buffer sync (freeze event loop)');

  return resize_js(from, to, options, callback);
}

// RGBA buffer resize
//
function resizeBuffer(options, callback) {
  var _opts = {
    src:      options.src,
    dest:     options.dest,
    width:    options.width|0,
    height:   options.height|0,
    toWidth:  options.toWidth|0,
    toHeight: options.toHeight|0,
    quality:  options.quality,
    alpha:    options.alpha,
    unsharpAmount:    options.unsharpAmount,
    unsharpRadius:    options.unsharpRadius,
    unsharpThreshold: options.unsharpThreshold
  };

  _opts.dest = resize_array(_opts);

  if (_opts.unsharpAmount) {
    unsharp(_opts.dest, _opts.toWidth, _opts.toHeight,
      _opts.unsharpAmount, _opts.unsharpRadius, _opts.unsharpThreshold);
  }

  callback(null, _opts.dest);
}

function terminate(id) {
  resize_js.terminate(id);
  resize_js_ww.terminate(id);
  resize_webgl.terminate(id);
}

exports.resizeCanvas = resizeCanvas;
exports.resizeBuffer = resizeBuffer;
exports.terminate = terminate;
exports.WW = WORKER;
exports.WEBGL = false; // WEBGL;
exports.debug = function () {};

},{"./lib/js/resize_array":10,"./lib/js/unsharp":11,"./lib/resize_js":14,"./lib/resize_js_ww":15,"./lib/resize_webgl":16,"object-assign":5,"webworkify":17}],7:[function(require,module,exports){
'use strict';

/* global document */

module.exports = function () {
  return document.createElement('canvas');
};

},{}],8:[function(require,module,exports){
'use strict';

var lastId = 1;

module.exports = function () {
  return lastId++;
};

},{}],9:[function(require,module,exports){
'use strict';

var IDLE = 2000;
var TIMEOUT = 500;

function Pool(create) {
  this.create = create;

  this.available = [];
  this.acquired = {};
  this.lastId = 1;

  this.timeoutId = 0;
}

Pool.prototype.acquire = function () {
  var self = this;
  var resource;
  if (this.available.length !== 0) {
    resource = this.available.pop();
  } else {
    resource = this.create();
    resource.id = this.lastId++;
    resource.release = function () {
      self.release(resource);
    };
  }
  this.acquired[resource.id] = resource;
  return resource;
};

Pool.prototype.release = function (resource) {
  delete this.acquired[resource.id];
  resource.lastUsed = Date.now();
  this.available.push(resource);

  if (this.timeoutId === 0) {
    this.timeoutId = setTimeout(this.gc.bind(this), TIMEOUT);
  }
};

Pool.prototype.gc = function () {
  var now = Date.now();

  this.available = this.available.filter(function (resource) {
    if (now - resource.lastUsed > IDLE) {
      resource.destroy();
      return false;
    }
    return true;
  });

  if (this.available.length !== 0) {
    this.timeoutId = setTimeout(this.gc.bind(this), TIMEOUT);
  } else {
    this.timeoutId = 0;
  }
};

module.exports = Pool;

},{}],10:[function(require,module,exports){
// High speed resize with tuneable speed/quality ratio

'use strict';


// Precision of fixed FP values
var FIXED_FRAC_BITS = 14;


//
// Presets for quality 0..3. Filter functions + window size
//
var FILTER_INFO = [
  { // Nearest neibor (Box)
    win: 0.5,
    filter: function (x) {
      return (x >= -0.5 && x < 0.5) ? 1.0 : 0.0;
    }
  },
  { // Hamming
    win: 1.0,
    filter: function (x) {
      if (x <= -1.0 || x >= 1.0) { return 0.0; }
      if (x > -1.19209290E-07 && x < 1.19209290E-07) { return 1.0; }
      var xpi = x * Math.PI;
      return ((Math.sin(xpi) / xpi) *  (0.54 + 0.46 * Math.cos(xpi / 1.0)));
    }
  },
  { // Lanczos, win = 2
    win: 2.0,
    filter: function (x) {
      if (x <= -2.0 || x >= 2.0) { return 0.0; }
      if (x > -1.19209290E-07 && x < 1.19209290E-07) { return 1.0; }
      var xpi = x * Math.PI;
      return (Math.sin(xpi) / xpi) * Math.sin(xpi / 2.0) / (xpi / 2.0);
    }
  },
  { // Lanczos, win = 3
    win: 3.0,
    filter: function (x) {
      if (x <= -3.0 || x >= 3.0) { return 0.0; }
      if (x > -1.19209290E-07 && x < 1.19209290E-07) { return 1.0; }
      var xpi = x * Math.PI;
      return (Math.sin(xpi) / xpi) * Math.sin(xpi / 3.0) / (xpi / 3.0);
    }
  }
];

function clampTo8(i) { return i < 0 ? 0 : (i > 255 ? 255 : i); }

function toFixedPoint(num) { return Math.round(num * ((1 << FIXED_FRAC_BITS) - 1)); }


// Calculate convolution filters for each destination point,
// and pack data to Int16Array:
//
// [ shift, length, data..., shift2, length2, data..., ... ]
//
// - shift - offset in src image
// - length - filter length (in src points)
// - data - filter values sequence
//
function createFilters(quality, srcSize, destSize, scale, offset) {

  var filterFunction = FILTER_INFO[quality].filter;

  var scaleInverted = 1.0 / scale;
  var scaleClamped  = Math.min(1.0, scale); // For upscale

  // Filter window (averaging interval), scaled to src image
  var srcWindow = FILTER_INFO[quality].win / scaleClamped;

  var destPixel, srcPixel, srcFirst, srcLast, filterElementSize,
      floatFilter, fxpFilter, total, pxl, idx, floatVal, filterTotal, filterVal;
  var leftNotEmpty, rightNotEmpty, filterShift, filterSize;

  var maxFilterElementSize = Math.floor((srcWindow + 1) * 2);
  var packedFilter    = new Int16Array((maxFilterElementSize + 2) * destSize);
  var packedFilterPtr = 0;

  // For each destination pixel calculate source range and built filter values
  for (destPixel = 0; destPixel < destSize; destPixel++) {

    // Scaling should be done relative to central pixel point
    srcPixel = (destPixel + 0.5) * scaleInverted + offset;

    srcFirst = Math.max(0, Math.floor(srcPixel - srcWindow));
    srcLast  = Math.min(srcSize - 1, Math.ceil(srcPixel + srcWindow));

    filterElementSize = srcLast - srcFirst + 1;
    floatFilter = new Float32Array(filterElementSize);
    fxpFilter = new Int16Array(filterElementSize);

    total = 0.0;

    // Fill filter values for calculated range
    for (pxl = srcFirst, idx = 0; pxl <= srcLast; pxl++, idx++) {
      floatVal = filterFunction(((pxl + 0.5) - srcPixel) * scaleClamped);
      total += floatVal;
      floatFilter[idx] = floatVal;
    }

    // Normalize filter, convert to fixed point and accumulate conversion error
    filterTotal = 0;

    for (idx = 0; idx < floatFilter.length; idx++) {
      filterVal = floatFilter[idx] / total;
      filterTotal += filterVal;
      fxpFilter[idx] = toFixedPoint(filterVal);
    }

    // Compensate normalization error, to minimize brightness drift
    fxpFilter[destSize >> 1] += toFixedPoint(1.0 - filterTotal);

    //
    // Now pack filter to useable form
    //
    // 1. Trim heading and tailing zero values, and compensate shitf/length
    // 2. Put all to single array in this format:
    //
    //    [ pos shift, data length, value1, value2, value3, ... ]
    //

    leftNotEmpty = 0;
    while (leftNotEmpty < fxpFilter.length && fxpFilter[leftNotEmpty] === 0) {
      leftNotEmpty++;
    }

    if (leftNotEmpty < fxpFilter.length) {
      rightNotEmpty = fxpFilter.length - 1;
      while (rightNotEmpty > 0 && fxpFilter[rightNotEmpty] === 0) {
        rightNotEmpty--;
      }

      filterShift = srcFirst + leftNotEmpty;
      filterSize = rightNotEmpty - leftNotEmpty + 1;

      packedFilter[packedFilterPtr++] = filterShift; // shift
      packedFilter[packedFilterPtr++] = filterSize; // size

      packedFilter.set(fxpFilter.subarray(leftNotEmpty, rightNotEmpty + 1), packedFilterPtr);
      packedFilterPtr += filterSize;
    } else {
      // zero data, write header only
      packedFilter[packedFilterPtr++] = 0; // shift
      packedFilter[packedFilterPtr++] = 0; // size
    }
  }
  return packedFilter;
}

// Convolve image in horizontal directions and transpose output. In theory,
// transpose allow:
//
// - use the same convolver for both passes (this fails due different
//   types of input array and temporary buffer)
// - making vertical pass by horisonltal lines inprove CPU cache use.
//
// But in real life this doesn't work :)
//
function convolveHorizontally(src, dest, srcW, srcH, destW, filters) {

  var r, g, b, a;
  var filterPtr, filterShift, filterSize;
  var srcPtr, srcY, destX, filterVal;
  var srcOffset = 0, destOffset = 0;

  // For each row
  for (srcY = 0; srcY < srcH; srcY++) {
    filterPtr  = 0;

    /*eslint-disable space-infix-ops*/

    // Apply precomputed filters to each destination row point
    for (destX = 0; destX < destW; destX++) {
      // Get the filter that determines the current output pixel.
      filterShift = filters[filterPtr++];
      filterSize  = filters[filterPtr++];

      srcPtr = (srcOffset + (filterShift * 4))|0;

      r = g = b = a = 0;

      // Apply the filter to the row to get the destination pixel r, g, b, a
      for (; filterSize > 0; filterSize--) {
        filterVal = filters[filterPtr++];

        // Use reverse order to workaround deopts in old v8 (node v.10)
        // Big thanks to @mraleph (Vyacheslav Egorov) for the tip.
        a = (a + filterVal * src[srcPtr + 3])|0;
        b = (b + filterVal * src[srcPtr + 2])|0;
        g = (g + filterVal * src[srcPtr + 1])|0;
        r = (r + filterVal * src[srcPtr])|0;
        srcPtr = (srcPtr + 4)|0;
      }

      // Bring this value back in range. All of the filter scaling factors
      // are in fixed point with FIXED_FRAC_BITS bits of fractional part.
      //
      // (!) Add 1/2 of value before clamping to get proper rounding. In other
      // case brightness loss will be noticeable if you resize image with white
      // border and place it on white background.
      //
      dest[destOffset + 3] = clampTo8((a + (1 << 13)) >> 14/*FIXED_FRAC_BITS*/);
      dest[destOffset + 2] = clampTo8((b + (1 << 13)) >> 14/*FIXED_FRAC_BITS*/);
      dest[destOffset + 1] = clampTo8((g + (1 << 13)) >> 14/*FIXED_FRAC_BITS*/);
      dest[destOffset]     = clampTo8((r + (1 << 13)) >> 14/*FIXED_FRAC_BITS*/);
      destOffset = (destOffset + srcH * 4)|0;
    }

    destOffset = ((srcY + 1) * 4)|0;
    srcOffset  = ((srcY + 1) * srcW * 4)|0;
  }
}

// Technically, convolvers are the same. But input array and temporary
// buffer can be of different type (especially, in old browsers). So,
// keep code in separate functions to avoid deoptimizations & speed loss.

function convolveVertically(src, dest, srcW, srcH, destW, filters) {

  var r, g, b, a;
  var filterPtr, filterShift, filterSize;
  var srcPtr, srcY, destX, filterVal;
  var srcOffset = 0, destOffset = 0;

  // For each row
  for (srcY = 0; srcY < srcH; srcY++) {
    filterPtr  = 0;

    /*eslint-disable space-infix-ops*/

    // Apply precomputed filters to each destination row point
    for (destX = 0; destX < destW; destX++) {
      // Get the filter that determines the current output pixel.
      filterShift = filters[filterPtr++];
      filterSize  = filters[filterPtr++];

      srcPtr = (srcOffset + (filterShift * 4))|0;

      r = g = b = a = 0;

      // Apply the filter to the row to get the destination pixel r, g, b, a
      for (; filterSize > 0; filterSize--) {
        filterVal = filters[filterPtr++];

        // Use reverse order to workaround deopts in old v8 (node v.10)
        // Big thanks to @mraleph (Vyacheslav Egorov) for the tip.
        a = (a + filterVal * src[srcPtr + 3])|0;
        b = (b + filterVal * src[srcPtr + 2])|0;
        g = (g + filterVal * src[srcPtr + 1])|0;
        r = (r + filterVal * src[srcPtr])|0;
        srcPtr = (srcPtr + 4)|0;
      }

      // Bring this value back in range. All of the filter scaling factors
      // are in fixed point with FIXED_FRAC_BITS bits of fractional part.
      //
      // (!) Add 1/2 of value before clamping to get proper rounding. In other
      // case brightness loss will be noticeable if you resize image with white
      // border and place it on white background.
      //
      dest[destOffset + 3] = clampTo8((a + (1 << 13)) >> 14/*FIXED_FRAC_BITS*/);
      dest[destOffset + 2] = clampTo8((b + (1 << 13)) >> 14/*FIXED_FRAC_BITS*/);
      dest[destOffset + 1] = clampTo8((g + (1 << 13)) >> 14/*FIXED_FRAC_BITS*/);
      dest[destOffset]     = clampTo8((r + (1 << 13)) >> 14/*FIXED_FRAC_BITS*/);
      destOffset = (destOffset + srcH * 4)|0;
    }

    destOffset = ((srcY + 1) * 4)|0;
    srcOffset  = ((srcY + 1) * srcW * 4)|0;
  }
}


function resetAlpha(dst, width, height) {
  var ptr = 3, len = (width * height * 4)|0;
  while (ptr < len) { dst[ptr] = 0xFF; ptr = (ptr + 4)|0; }
}


function resize(options) {
  var src   = options.src;
  var srcW  = options.width;
  var srcH  = options.height;
  var destW = options.toWidth;
  var destH = options.toHeight;
  var scaleX = options.scaleX || options.toWidth / options.width;
  var scaleY = options.scaleY || options.toHeight / options.height;
  var offsetX = options.offsetX || 0;
  var offsetY = options.offsetY || 0;
  var dest  = options.dest || new Uint8Array(destW * destH * 4);
  var quality = typeof options.quality === 'undefined' ? 3 : options.quality;
  var alpha = options.alpha || false;

  if (srcW < 1 || srcH < 1 || destW < 1 || destH < 1) { return []; }

  var filtersX = createFilters(quality, srcW, destW, scaleX, offsetX),
      filtersY = createFilters(quality, srcH, destH, scaleY, offsetY);

  var tmp  = new Uint8Array(destW * srcH * 4);

  // To use single function we need src & tmp of the same type.
  // But src can be CanvasPixelArray, and tmp - Uint8Array. So, keep
  // vertical and horizontal passes separately to avoid deoptimization.

  convolveHorizontally(src, tmp, srcW, srcH, destW, filtersX);
  convolveVertically(tmp, dest, srcH, destW, destH, filtersY);

  // That's faster than doing checks in convolver.
  // !!! Note, canvas data is not premultipled. We don't need other
  // alpha corrections.

  if (!alpha) {
    resetAlpha(dest, destW, destH);
  }

  return dest;
}


module.exports = resize;

},{}],11:[function(require,module,exports){
// Unsharp mask filter
//
// http://stackoverflow.com/a/23322820/1031804
// USM(O) = O + (2 * (Amount / 100) * (O - GB))
// GB - gaussian blur.
//
// Image is converted from RGB to HSL, unsharp mask is applied to the
// lightness channel and then image is converted back to RGB.

'use strict';


var glurMono16 = require('glur/mono16');

function getLightness(img, width, height) {
  var size = width * height;
  var out = new Uint16Array(size);
  var r, g, b, min, max;
  for (var i = 0; i < size; i++) {
    r = img[4 * i];
    g = img[4 * i + 1];
    b = img[4 * i + 2];
    max = (r >= g && r >= b) ? r : (g >= b && g >= r) ? g : b;
    min = (r <= g && r <= b) ? r : (g <= b && g <= r) ? g : b;
    out[i] = (max + min) * 257 >> 1;
  }
  return out;
}

function unsharp(img, width, height, amount, radius, threshold) {
  var r, g, b;
  var h, s, l;
  var min, max;
  var m1, m2, hShifted;
  var diff, iTimes4;

  if (amount === 0 || radius < 0.5) {
    return;
  }
  if (radius > 2.0) {
    radius = 2.0;
  }

  var lightness = getLightness(img, width, height);

  var blured = new Uint16Array(lightness); // copy, because blur modify src

  glurMono16(blured, width, height, radius);

  /* eslint-disable space-infix-ops */
  var amountFp = (amount / 100 * 0x1000 + 0.5)|0;
  var thresholdFp = (threshold * 257)|0;

  var size = width * height;

  for (var i = 0; i < size; i++) {
    diff = 2 * (lightness[i] - blured[i]);

    if (Math.abs(diff) >= thresholdFp) {
      iTimes4 = i * 4;
      r = img[iTimes4];
      g = img[iTimes4 + 1];
      b = img[iTimes4 + 2];

      // convert RGB to HSL
      // take RGB, 8-bit unsigned integer per each channel
      // save HSL, H and L are 16-bit unsigned integers, S is 12-bit unsigned integer
      // math is taken from here: http://www.easyrgb.com/index.php?X=MATH&H=18
      // and adopted to be integer (fixed point in fact) for sake of performance
      max = (r >= g && r >= b) ? r : (g >= r && g >= b) ? g : b; // min and max are in [0..0xff]
      min = (r <= g && r <= b) ? r : (g <= r && g <= b) ? g : b;
      l = (max + min) * 257 >> 1; // l is in [0..0xffff] that is caused by multiplication by 257

      if (min === max) {
        h = s = 0;
      } else {
        s = (l <= 0x7fff) ?
          (((max - min) * 0xfff) / (max + min))|0 :
          (((max - min) * 0xfff) / (2 * 0xff - max - min))|0; // s is in [0..0xfff]
        // h could be less 0, it will be fixed in backward conversion to RGB, |h| <= 0xffff / 6
        h = (r === max) ? (((g - b) * 0xffff) / (6 * (max - min)))|0
          : (g === max) ? 0x5555 + ((((b - r) * 0xffff) / (6 * (max - min)))|0) // 0x5555 == 0xffff / 3
          : 0xaaaa + ((((r - g) * 0xffff) / (6 * (max - min)))|0); // 0xaaaa == 0xffff * 2 / 3
      }

      // add unsharp mask mask to the lightness channel
      l += (amountFp * diff + 0x800) >> 12;
      if (l > 0xffff) {
        l = 0xffff;
      } else if (l < 0) {
        l = 0;
      }

      // convert HSL back to RGB
      // for information about math look above
      if (s === 0) {
        r = g = b = l >> 8;
      } else {
        m2 = (l <= 0x7fff) ? (l * (0x1000 + s) + 0x800) >> 12 :
          l  + (((0xffff - l) * s + 0x800) >>  12);
        m1 = 2 * l - m2 >> 8;
        m2 >>= 8;
        // save result to RGB channels
        // R channel
        hShifted = (h + 0x5555) & 0xffff; // 0x5555 == 0xffff / 3
        r = (hShifted >= 0xaaaa) ? m1 // 0xaaaa == 0xffff * 2 / 3
          : (hShifted >= 0x7fff) ?  m1 + ((m2 - m1) * 6 * (0xaaaa - hShifted) + 0x8000 >> 16)
          : (hShifted >= 0x2aaa) ? m2 // 0x2aaa == 0xffff / 6
          : m1 + ((m2 - m1) * 6 * hShifted + 0x8000 >> 16);
        // G channel
        hShifted = h & 0xffff;
        g = (hShifted >= 0xaaaa) ? m1 // 0xaaaa == 0xffff * 2 / 3
          : (hShifted >= 0x7fff) ?  m1 + ((m2 - m1) * 6 * (0xaaaa - hShifted) + 0x8000 >> 16)
          : (hShifted >= 0x2aaa) ? m2 // 0x2aaa == 0xffff / 6
          : m1 + ((m2 - m1) * 6 * hShifted + 0x8000 >> 16);
        // B channel
        hShifted = (h - 0x5555) & 0xffff;
        b = (hShifted >= 0xaaaa) ? m1 // 0xaaaa == 0xffff * 2 / 3
          : (hShifted >= 0x7fff) ?  m1 + ((m2 - m1) * 6 * (0xaaaa - hShifted) + 0x8000 >> 16)
          : (hShifted >= 0x2aaa) ? m2 // 0x2aaa == 0xffff / 6
          : m1 + ((m2 - m1) * 6 * hShifted + 0x8000 >> 16);
      }

      img[iTimes4] = r;
      img[iTimes4 + 1] = g;
      img[iTimes4 + 2] = b;
    }
  }
}

module.exports = unsharp;
module.exports.lightness = getLightness;

},{"glur/mono16":4}],12:[function(require,module,exports){
'use strict';

module.exports.createRegions = function createRegions(options) {
  var scaleX = options.toWidth / options.width;
  var scaleY = options.toHeight / options.height;

  var innerTileWidth = Math.floor(options.srcTileSize * scaleX) - 2 * options.destTileBorder;
  var innerTileHeight = Math.floor(options.srcTileSize * scaleY) - 2 * options.destTileBorder;

  var x, y;
  var innerX, innerY, toTileWidth, toTileHeight;
  var tiles = [];
  var tile;

  // we go top-to-down instead of left-to-right to make image displayed from top to
  // doesn in the browser
  for (innerY = 0; innerY < options.toHeight; innerY += innerTileHeight) {
    for (innerX = 0; innerX < options.toWidth; innerX += innerTileWidth) {
      x = innerX - options.destTileBorder;
      if (x < 0) { x = 0; }
      toTileWidth = innerX + innerTileWidth + options.destTileBorder - x;
      if (x + toTileWidth >= options.toWidth) {
        toTileWidth = options.toWidth - x;
      }

      y = innerY - options.destTileBorder;
      if (y < 0) { y = 0; }
      toTileHeight = innerY + innerTileHeight + options.destTileBorder - y;
      if (y + toTileHeight >= options.toHeight) {
        toTileHeight = options.toHeight - y;
      }

      tile = {
        toX: x,
        toY: y,
        toWidth: toTileWidth,
        toHeight: toTileHeight,

        toInnerX: innerX,
        toInnerY: innerY,
        toInnerWidth: innerTileWidth,
        toInnerHeight: innerTileHeight,

        offsetX: x / scaleX - Math.floor(x / scaleX),
        offsetY: y / scaleY - Math.floor(y / scaleY),
        scaleX: scaleX,
        scaleY: scaleY,

        x: Math.floor(x / scaleX),
        y: Math.floor(y / scaleY),
        width: Math.ceil(toTileWidth / scaleX),
        height: Math.ceil(toTileHeight / scaleY)
      };

      tiles.push(tile);
    }
  }

  return tiles;
};

module.exports.eachLimit = function eachLimit(list, limit, iterator, callback) {
  if (list.length === 0) {
    callback();
  }

  var executed = 0;
  var finished = 0;
  var failed = false;

  var next = function (err) {
    if (failed) {
      return;
    }
    if (err) {
      failed = true;
      callback(err);
      return;
    }

    finished++;
    if (finished === list.length) {
      callback();
    } else if (executed < list.length) {
      iterator(list[executed++], next);
    }
  };

  while (executed < limit && executed < list.length) {
    iterator(list[executed++], next);
  }
};

},{}],13:[function(require,module,exports){
// Web Worker wrapper for image resize function

'use strict';

module.exports = function(self) {
  var resize = require('./resize_array');
  var unsharp = require('./unsharp');

  self.onmessage = function (ev) {
    var options = ev.data;
    options.dest = new Uint8Array(options.toWidth * options.toHeight * 4);

    resize(options);

    if (options.unsharpAmount) {
      unsharp(options.dest, options.toWidth, options.toHeight,
        options.unsharpAmount, options.unsharpRadius, options.unsharpThreshold);
    }

    self.postMessage({ output: options.dest }, [ options.dest.buffer ]);
  };
};

},{"./resize_array":10,"./unsharp":11}],14:[function(require,module,exports){
/*eslint space-infix-ops:0*/

'use strict';

var resize        = require('./js/resize_array');
var unsharp       = require('./js/unsharp');
var createRegions = require('./js/utils').createRegions;
var eachLimit     = require('./js/utils').eachLimit;
var generateId    = require('./js/generate_id');
var createCanvas  = require('./js/create_canvas');

var SRC_TILE_SIZE = 1024;
var DEST_TILE_BORDER = 3;

function resize_js(from, to, options, callback) {
  var toCtx = to.getContext('2d', { alpha: Boolean(options.alpha) });

  // We use intermediate canvases because, getImageData() from canvas region
  // is 8x times slower in FF than getImageData() from whole canvas.
  // That adds ~20% delay in Chrome :(.
  //
  // See https://bugzilla.mozilla.org/show_bug.cgi?id=1001069

  var fromTile = createCanvas();

  fromTile.width = Math.min(SRC_TILE_SIZE, from.width);
  fromTile.height = Math.min(SRC_TILE_SIZE, from.height);

  var fromTileCtx = fromTile.getContext('2d', { alpha: Boolean(options.alpha) });

  // Should not use previous content of reused canvas when alpha exists.
  fromTileCtx.globalCompositeOperation = 'copy';

  var regions = createRegions({
    width: from.naturalWidth || from.width,
    height: from.naturalHeight || from.height,
    srcTileSize: SRC_TILE_SIZE,
    toWidth: to.width,
    toHeight: to.height,
    destTileBorder: Math.ceil(Math.max(DEST_TILE_BORDER, 2.5 * options.unsharpRadius|0))
  });

  eachLimit(regions, 1, function (tile, next) {
    fromTileCtx.drawImage(from, tile.x, tile.y, tile.width, tile.height,
      0, 0, tile.width, tile.height);

    var fromImageData = fromTileCtx.getImageData(0, 0, tile.width, tile.height);
    var toImageData   = toCtx.createImageData(tile.toWidth, tile.toHeight);

    var _opts = {
      src:      fromImageData.data,
      dest:     toImageData.data,
      width:    tile.width,
      height:   tile.height,
      toWidth:  tile.toWidth,
      toHeight: tile.toHeight,
      scaleX:   tile.scaleX,
      scaleY:   tile.scaleY,
      offsetX:  tile.offsetX,
      offsetY:  tile.offsetY,
      quality:  options.quality,
      alpha:    options.alpha,
      unsharpAmount:    options.unsharpAmount,
      unsharpRadius:    options.unsharpRadius,
      unsharpThreshold: options.unsharpThreshold
    };

    resize(_opts);

    if (options.unsharpAmount) {
      unsharp(_opts.dest, _opts.toWidth, _opts.toHeight,
        _opts.unsharpAmount, _opts.unsharpRadius, _opts.unsharpThreshold);
    }

    toCtx.putImageData(toImageData, tile.toX, tile.toY,
      tile.toInnerX - tile.toX, tile.toInnerY - tile.toY,
      tile.toInnerWidth, tile.toInnerHeight);
    next();
  }, callback);

  return generateId();
}

module.exports = resize_js;
module.exports.terminate = function () {};

},{"./js/create_canvas":7,"./js/generate_id":8,"./js/resize_array":10,"./js/unsharp":11,"./js/utils":12}],15:[function(require,module,exports){
/* global navigator */
/*eslint space-infix-ops:0*/

'use strict';


var webworkify    = require('webworkify');
var resizeWorker  = require('./js/worker.js');
var createRegions = require('./js/utils').createRegions;
var eachLimit     = require('./js/utils').eachLimit;
var generateId    = require('./js/generate_id');
var createCanvas  = require('./js/create_canvas');
var Pool          = require('./js/pool');

var SRC_TILE_SIZE = 1024;
var DEST_TILE_BORDER = 3;

var workersPool = new Pool(function () {
  return {
    value: webworkify(resizeWorker),
    destroy: function () {
      this.value.terminate();
    }
  };
});

var running = {};

function resize_js_ww(from, to, options, callback) {
  var toCtx = to.getContext('2d', { alpha: Boolean(options.alpha) });
  /* We use intermediate canvases because without it Firefox resizes 8x times slower
   * than with it. It makes resize 20% slower in Chrome */
  var fromTile = createCanvas();

  fromTile.width = Math.min(SRC_TILE_SIZE, from.naturalWidth || from.width);
  fromTile.height = Math.min(SRC_TILE_SIZE, from.naturalHeight || from.height);

  var fromTileCtx = fromTile.getContext('2d', { alpha: Boolean(options.alpha) });

  // Should not use previous content of reused canvas when alpha exists.
  fromTileCtx.globalCompositeOperation = 'copy';

  var regions = createRegions({
    width: from.naturalWidth || from.width,
    height: from.naturalHeight || from.height,
    srcTileSize: SRC_TILE_SIZE,
    toWidth: to.width,
    toHeight: to.height,
    destTileBorder: Math.ceil(Math.max(DEST_TILE_BORDER, 2.5 * options.unsharpRadius|0))
  });

  var concurrency = navigator && navigator.hardwareConcurrency || 4;
  var id = options._id || generateId();

  running[id] = true;
  eachLimit(regions, concurrency, function (tile, next) {
    fromTileCtx.drawImage(from, tile.x, tile.y, tile.width, tile.height,
      0, 0, tile.width, tile.height);

    var fromImageData = fromTileCtx.getImageData(0, 0, tile.width, tile.height);

    var _opts = {
      src:      fromImageData.data,
      width:    tile.width,
      height:   tile.height,
      toWidth:  tile.toWidth,
      toHeight: tile.toHeight,
      scaleX:   tile.scaleX,
      scaleY:   tile.scaleY,
      offsetX:  tile.offsetX,
      offsetY:  tile.offsetY,
      quality:  options.quality,
      alpha:    options.alpha,
      unsharpAmount:    options.unsharpAmount,
      unsharpRadius:    options.unsharpRadius,
      unsharpThreshold: options.unsharpThreshold
    };

    var worker = workersPool.acquire();

    worker.value.onmessage = function (ev) {
      var i, l;
      var imageDataTo, output, dest;

      worker.release();

      if (!running[id]) {
        next(true);
        return;
      }
      if (ev.data.err) {
        next(ev.data.err);
        return;
      }

      imageDataTo = toCtx.createImageData(tile.toWidth, tile.toHeight);
      output = ev.data.output;
      dest = imageDataTo.data;

      if (dest.set) {
        dest.set(output);
      } else {
        for (i = 0, l = output.length; i < l; i++) {
          dest[i] = output[i];
        }
      }

      toCtx.putImageData(imageDataTo, tile.toX, tile.toY,
        tile.toInnerX - tile.toX, tile.toInnerY - tile.toY,
        tile.toInnerWidth, tile.toInnerHeight);
      next();
    };

    worker.value.postMessage(_opts, [ _opts.src.buffer ]);
  }, function (err) {
    if (running[id]) {
      delete running[id];
      callback(err);
    }
  });

  return id;
}

function terminate(id) {
  if (running[id]) {
    delete running[id];
  }
}

module.exports = resize_js_ww;
module.exports.terminate = terminate;

},{"./js/create_canvas":7,"./js/generate_id":8,"./js/pool":9,"./js/utils":12,"./js/worker.js":13,"webworkify":17}],16:[function(require,module,exports){
/*global window,document*/
'use strict';


var unsharp = require('./js/unsharp');
var generateId = require('./js/generate_id');

var shadersContent = {};

/*eslint-disable no-path-concat*/
shadersContent['#vsh-basic'] =
  "precision highp float;\nattribute vec2 a_position;\nattribute vec2 a_texCoord;\n\nuniform vec2 u_resolution;\n\nvarying vec2 v_texCoord;\n\nvoid main() {\n   vec2 clipSpace = a_position / u_resolution * 2.0 - 1.0;\n\n   gl_Position = vec4(clipSpace, 0, 1);\n   v_texCoord = a_texCoord;\n}\n";
shadersContent['#fsh-lanczos-1d-covolve-horizontal'] =
  "precision highp float;\nuniform vec2 u_resolution;\nuniform sampler2D u_image;\nuniform vec2 u_imageSize;\n\n#define winSize 3.0\n\nvarying vec2 v_texCoord;\n\n#define sinc(a) (sin(a)/a)\n#define M_PI 3.1415926535897932384626433832795\n\nvoid main() {\n  vec2 pixel = vec2(1.) / u_imageSize;\n  gl_FragColor = vec4(0.);\n\n  float total = 0.;\n  float scale = u_imageSize.x / u_resolution.x;\n  float count = winSize * scale * 2.;\n  for (int i = 0; i < 1024*8; i++) {\n    if (float(i) >= count) {\n      break;\n    }\n    float k = float(i) - (count / 2.);\n    vec2 offset = vec2(pixel.x * k, 0.);\n    vec4 c = texture2D(u_image, v_texCoord+offset);\n    float x = k / scale; // max [-3, 3]\n    float xpi = x * M_PI;\n    float b = sinc(xpi) * sinc(xpi / winSize);\n    if (x > -1.19209290E-07 && x < 1.19209290E-07) { \n      b = 1.;\n    }\n    total += b;\n    c *= vec4(b);\n    gl_FragColor += c;\n  }\n  gl_FragColor /= vec4(total);\n}\n";
shadersContent['#fsh-lanczos-1d-covolve-vertical'] =
  "precision highp float;\nuniform vec2 u_resolution;\nuniform sampler2D u_image;\nuniform vec2 u_imageSize;\n\n#define winSize 3.0\n\nvarying vec2 v_texCoord;\n\n#define sinc(a) (sin(a)/a)\n#define M_PI 3.1415926535897932384626433832795\n\nvoid main() {\n  vec2 pixel = vec2(1.) / u_imageSize;\n  gl_FragColor = vec4(0.);\n\n  float total = 0.;\n  float scale = u_imageSize.y / u_resolution.y;\n  float count = winSize * scale * 2.;\n  for (int i = 0; i < 1024*8; i++) {\n    if (float(i) >= count) {\n      break;\n    }\n    float k = float(i) - (count / 2.);\n    vec2 offset = vec2(0., pixel.y * k);\n    vec4 c = texture2D(u_image, v_texCoord+offset);\n    float x = k / scale; // max [-3, 3]\n    float xpi = x * M_PI;\n    float b = sinc(xpi) * sinc(xpi / winSize);\n    if (x > -1.19209290E-07 && x < 1.19209290E-07) { \n      b = 1.;\n    }\n    total += b;\n    c *= vec4(b);\n    gl_FragColor += c;\n  }\n  gl_FragColor /= vec4(total);\n}\n";

function error(msg) {
  try {
    (window.console.error || window.console.log).call(window.console, msg);
  } catch (__) {}
}


function checkGlError(gl) {
  var e = gl.getError();
  if (e !== gl.NO_ERROR) { throw new Error('gl error ' + e); }
}


function createGl(canvas) {
  return canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
}


function createShader(gl, type, src) {
  var shader = gl.createShader(type);

  gl.shaderSource(shader, src);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    error('Shader compile error: ' + gl.getShaderInfoLog(shader) + '. Source: `' + src + '`');
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}


function createProgram(gl, vshFile, fshFile) {
  var vertexShader = createShader(gl, gl.VERTEX_SHADER, shadersContent[vshFile]);
  var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, shadersContent[fshFile]);

  var program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);

  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    error('Program linking error: ' + gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
  }

  checkGlError(gl);
  return program;
}


function setAttributeValues(gl, program, name, values, options) {
  var a = gl.getAttribLocation(program, name);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, options.elementSize, gl.FLOAT, false, 0, 0);
  checkGlError(gl);
}


function loadTexture(gl, texUnit, data) {
  var tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + texUnit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
  checkGlError(gl);
  return tex;
}


function setUniform1i(gl, program, name, i0) {
  var u = gl.getUniformLocation(program, name);
  gl.uniform1i(u, i0);
}


function setUniform2f(gl, program, name, f0, f1) {
  var u = gl.getUniformLocation(program, name);
  gl.uniform2f(u, f0, f1);
}


function vec2Rectangle(x, y, w, h) {
  var x1 = x;
  var x2 = x + w;
  var y1 = y;
  var y2 = y + h;
  return [ x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2 ];
}


function createTextureSize(gl, texUnit, width, height) {
  var tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + texUnit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  checkGlError(gl);
  return tex;
}


function setupTextureFBO(gl, texUnit, width, height) {
  var texture = createTextureSize(gl, texUnit, width, height);

  var oldFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);

  var fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

//  gl.viewport(0, 0, width, height);

  checkGlError(gl);

  return {
    fbo: fbo,
    texture: texture,
    oldFbo: oldFbo
  };
}


function convolve(gl, texUnit0, texWidth, texHeight, texUnit, fsh, destW, destH, flipY) {
  var program = createProgram(gl, '#vsh-basic', fsh);

  gl.useProgram(program);

  setUniform1i(gl, program, 'u_image', texUnit0);
  setUniform2f(gl, program, 'u_imageSize', texWidth, texHeight);
  setUniform2f(gl, program, 'u_resolution', destW, destH);

  setAttributeValues(gl, program, 'a_texCoord',
    [ 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1 ], { elementSize: 2 });
  setAttributeValues(gl, program, 'a_position',
    !flipY ? vec2Rectangle(0, 0, destW, destH) : vec2Rectangle(0, destH, destW, -destH), { elementSize: 2 });

  gl.viewport(0, 0, destW, destH);

  var fboObject = setupTextureFBO(gl, texUnit, destW, destH);

  gl.viewport(0, 0, destW, destH);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboObject.oldFbo);

  checkGlError(gl);

  return fboObject;
}


function webglProcessResize(from, gl, options) {

  var srcW = from.naturalWidth || from.width,
      srcH = from.naturalHeight || from.height,
      dstW = gl.canvas.width,
      dstH = gl.canvas.height;

  gl.viewport(0, 0, dstW, dstH);

  var texUnit0 = 0;

  loadTexture(gl, texUnit0, from);

  // resize [

  var texUnit2 = 2;
  var texUnit3 = 3;

  convolve(gl, texUnit0, srcW, srcH,
    texUnit2, '#fsh-lanczos-1d-covolve-horizontal', dstW, srcH, false);

  var finalFboObject = convolve(gl, texUnit2, dstW, srcH,
    texUnit3, '#fsh-lanczos-1d-covolve-vertical', dstW, dstH, true);

  // resize ]

  gl.flush();

  var fb = gl.createFramebuffer();

  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, finalFboObject.texture, 0);

  var fb_status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

  if (fb_status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('Bad framebuffer status: ' + fb_status);
  }

  // Clear alpha for sure, if disabled.
  if (!options.alpha) {
    gl.clearColor(1, 1, 1, 1);
    gl.colorMask(false, false, false, true);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  var pixels = new Uint8Array(dstW * dstH * 4);

  gl.readPixels(0, 0, dstW, dstH, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  var unsharpAmount = typeof options.unsharpAmount === 'undefined' ? 0 : (options.unsharpAmount | 0);
  var unsharpRadius = typeof options.unsharpRadius === 'undefined' ? 0 : (options.unsharpRadius);
  var unsharpThreshold = typeof options.unsharpThreshold === 'undefined' ? 0 : (options.unsharpThreshold | 0);

  if (unsharpAmount) {
    unsharp(pixels, dstW, dstH, unsharpAmount, unsharpRadius, unsharpThreshold);
  }

  return pixels;
}


module.exports = function (from, to, options, callback) {
  var gl, canvas;

  try {
    // create temporarry canvas [

    canvas = document.createElement('canvas');
    canvas.id = 'pica-webgl-temporarry-canvas';
    canvas.height = to.height;
    canvas.width = to.width;
    document.body.appendChild(canvas);

    // create temporarry canvas ]

    gl = createGl(canvas);

    var data = webglProcessResize(from, gl, options);

    gl.finish();
    document.body.removeChild(canvas);

    var ctxTo = to.getContext('2d');
    var imageDataTo = ctxTo.createImageData(to.width, to.height);

    imageDataTo.data.set(data);
    ctxTo.putImageData(imageDataTo, 0, 0);

    callback(null, data);
  } catch (e) {
    error(e);
    gl.finish();
    document.body.removeChild(canvas);
    callback(e);
  }

  return generateId();
};

module.exports.terminate = function () {};

},{"./js/generate_id":8,"./js/unsharp":11}],17:[function(require,module,exports){
var bundleFn = arguments[3];
var sources = arguments[4];
var cache = arguments[5];

var stringify = JSON.stringify;

module.exports = function (fn) {
    var keys = [];
    var wkey;
    var cacheKeys = Object.keys(cache);
    
    for (var i = 0, l = cacheKeys.length; i < l; i++) {
        var key = cacheKeys[i];
        if (cache[key].exports === fn) {
            wkey = key;
            break;
        }
    }
    
    if (!wkey) {
        wkey = Math.floor(Math.pow(16, 8) * Math.random()).toString(16);
        var wcache = {};
        for (var i = 0, l = cacheKeys.length; i < l; i++) {
            var key = cacheKeys[i];
            wcache[key] = key;
        }
        sources[wkey] = [
            Function(['require','module','exports'], '(' + fn + ')(self)'),
            wcache
        ];
    }
    var skey = Math.floor(Math.pow(16, 8) * Math.random()).toString(16);
    
    var scache = {}; scache[wkey] = wkey;
    sources[skey] = [
        Function(['require'],'require(' + stringify(wkey) + ')(self)'),
        scache
    ];
    
    var src = '(' + bundleFn + ')({'
        + Object.keys(sources).map(function (key) {
            return stringify(key) + ':['
                + sources[key][0]
                + ',' + stringify(sources[key][1]) + ']'
            ;
        }).join(',')
        + '},{},[' + stringify(skey) + '])'
    ;
    
    var URL = window.URL || window.webkitURL || window.mozURL || window.msURL;
    
    return new Worker(URL.createObjectURL(
        new Blob([src], { type: 'text/javascript' })
    ));
};

},{}]},{},[1]);
