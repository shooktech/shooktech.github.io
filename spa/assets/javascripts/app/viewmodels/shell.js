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
            
            this.subscribeEvents();

            return router.activate();
        },

        compositionComplete: function() {

        },

        navClick: function(d, e) {
            router.navigate(d.hash);
            
            if (window.innerWidth < 768) {
                VmShell.collapseNav();
            }
        },

        collapseNav: function() {
            if (!document.getElementById('navbar-toggle')) {
                return 0;
            }

            var navToggle = document.getElementById('navbar-toggle');
            
            if (!navToggle.classList.contains('collapsed')) {
                navToggle.click();
            }
        },

        subscribeEvents: function() {
    
        }
    });

    return VmShell;
});