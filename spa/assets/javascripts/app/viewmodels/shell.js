﻿define(function(require) {
    var router = require('plugins/router');
    var app = require('durandal/app');
    var ko = require('knockout');

    var VmBase = require('./vm_base');

    var VmShell = VmBase.extend({
        router: router,

        isMobile: ko.observable(window.innerWidth < 768),
    
        activate: function () {
            this.activeItemTitle = ko.observable('');

            router.map([
                // Non Nav
                { route: 'Policies', title:'Policies', moduleId: 'viewmodels/policies', nav: false},

                // Nav
                { route: '', title:'Home', moduleId: 'viewmodels/home', nav: true },
                { route: 'About', title: 'About', moduleId: 'viewmodels/about', nav: true },
                { route: 'Careers', title: 'Careers', moduleId: 'viewmodels/careers', nav:true },
            ]).buildNavigationModel();
            
            this.subscribeEvents();

            return router.activate();
        },

        compositionComplete: function() {

        },

        navClick: function(d, e) {
            if (window.innerWidth < 768) {
                VmShell.collapseNav();
            }

            router.navigate(d.hash);
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

        getActiveRouteTitle: function() {
            var routes = router.routes;
            var index = routes.map(function(element) { 
                return element.moduleId;
            }).indexOf(router.activeItem().__moduleId__);

            return routes[index].title;
        },

        subscribeEvents: function() {
            router.on('router:navigation:complete').then(function() {
                if (router.activeItem()) {
                    VmShell.activeItemTitle(VmShell.getActiveRouteTitle());
                }
            });
        }
    });

    return VmShell;
});