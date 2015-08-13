define(function(require) {
    var router = require('plugins/router');
    var app = require('durandal/app');

    var VmBase = require('./vm_base');

    var VmFooter = VmBase.extend({
    	router: router,
        activate: function () {
            
        }
    });

    return VmFooter.create();
});