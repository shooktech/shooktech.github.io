define(function(require) {
    var router = require('plugins/router');
    var app = require('durandal/app');

    var VmBase = require('./vm_base');

    var VmShell = VmBase.extend({
        router: router,
    
        activate: function () {
            router.map([
                // Non Nav
                { route: '', title:'Home', moduleId: 'viewmodels/home', nav: false },

                // Nav
                { route: 'About', moduleId: 'viewmodels/about', nav: true },
                { route: 'Careers', moduleId: 'viewmodels/careers', nav:true },
            ]).buildNavigationModel();
            
            return router.activate();
        },

        compositionComplete: function() {

        }
    });

    return VmShell;
});