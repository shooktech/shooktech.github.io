define(function(require) {
    var router = require('plugins/router');
    var app = require('durandal/app');

    var VmBase = require('./vm_base');

    var VmPolicies = VmBase.extend({
        activate: function () {
            
        }
    });

    return VmPolicies.create();
});