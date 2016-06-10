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
        self.downsample(function(err, canvas) {
          URL.revokeObjectURL(self.image.src);
          canvas = self.adjustAngle(canvas);
          self.draw(canvas);
          self.complete = true;
          done(null);
        });
      });
    });
  },

  getOrientation: function(done) {
    exif.getData(this.image, function() {
      done(null, exif.getTag(this, 'Orientation'));
    });
  },

  downsample: function(done) {
    var canvas = document.createElement('canvas');
    var scaled = fill(this.canvas, {
      width: this.naturalWidth,
      height: this.naturalHeight
    });

    canvas.width = scaled.width;
    canvas.height = scaled.height;

    pica.resizeCanvas(this.image, canvas, {}, function() {
      done(null, canvas);
    });
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
