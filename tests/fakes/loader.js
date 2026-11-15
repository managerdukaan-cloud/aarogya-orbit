const Module = require('module'), path = require('path'), F = require('./firebase-fake.js');
const map = { 'firebase-admin': F.admin, 'firebase-functions/v2/https': F.https, 'firebase-functions/params': F.params, 'firebase-functions/v2/scheduler': F.scheduler };
const orig = Module._load; Module._load = function (req, ...r) { return map[req] || orig.call(this, req, ...r); };
module.exports = (file) => { delete require.cache[require.resolve(file)]; return require(file); };
module.exports.F = F;
