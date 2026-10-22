/* Versi umum (APK kawan): tiada data peribadi. APK peribadi user guna personal/seed.js (build.ps1 -Personal). */
(function (root) {
  'use strict';
  var api = {
    NAME_PAIRS: [],
    migrate: function () { return false; },
    ensureMine: function () { return false; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GajiSeed = api;
})(this);
