define(function(require) {
    var router = require('plugins/router');
    var app = require('durandal/app');

    var VmBase = require('./vm_base');

    var VmAbout = VmBase.extend({
        activate: function () {
            
        }
    });

    return VmAbout;
});