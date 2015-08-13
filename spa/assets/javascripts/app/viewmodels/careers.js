define(function(require) {
    var router = require('plugins/router');
    var app = require('durandal/app');

    var VmBase = require('./vm_base');

    var VmCareers = VmBase.extend({
        activate: function () {
            
        }
    });

    return VmCareers.create();
});