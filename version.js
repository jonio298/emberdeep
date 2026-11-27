/* version.js - the game's version and build number, shown at the bottom of the title screen.
 * BUILD NUMBERS: every build from here on gets the next number in BUILDS.md and the same number here.
 * Format YYYYMMDD.N (N = 1, 2, ... for that day). Bump `build` (and add a line to BUILDS.md) with each commit that changes the game;
 * bump `version` for a real release. tests/version.test.mjs checks that this file, package.json and BUILDS.md agree. */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {};
  CC.VERSION = { version: '0.3.0', build: '20261126.41', label: 'v0.3.0 · build 20261126.41' };
})(typeof window !== 'undefined' ? window : globalThis);
