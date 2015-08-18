requirejs.config({
    paths: {
        'text': '../vendor/requirejs-text/text',
        'knockout': '../vendor/knockout.js/knockout-3.1.0',
        'jquery': '../vendor/jquery/jquery',
        'bootstrap': '../vendor/bootstrap/bootstrap',
        'durandal':'../vendor/durandal',
        'plugins' : '../vendor/durandal/plugins',
        'transitions' : '../vendor/durandal/transitions',
        'uberproto': '../vendor/uberproto/proto',
        'fastclick': '../vendor/fastclick/fastclick',
        'touchswipe': '../vendor/jquery-touchswipe/jquery.touchSwipe',
        'slick': '../vendor/slick-carousel/slick.min',
        'poly-classlist': '../vendor/polyfill-classlist/index'
    },
    shim: {
        'bootstrap': {
            deps: ['jquery'],
            exports: 'jQuery'
        },
        'touchswipe': {
            deps: ['jquery'],
            exports: 'jQuery'
        },
        'slick': {
            deps: ['jquery'],
            exports: 'jQuery'
        }
    }
});

define(function(require) {
    var app = require('durandal/app'),
        viewLocator = require('durandal/viewLocator'),
        system = require('durandal/system');

    var fastclick = require('fastclick');
    fastclick.attach(document.body);

    //>>excludeStart("build", true);
    system.debug(true);
    //>>excludeEnd("build");

    require('bootstrap');
    require('poly-classlist');

    app.title = 'Detroit Packing Co.';

    app.configurePlugins({
        router:true,
        dialog: true
    });

    app.start().then(function() {
        //Replace 'viewmodels' in the moduleId with 'views' to locate the view.
        //Look for partial views in a 'views' folder in the root.
        viewLocator.useConvention();

        //Show the app by setting the root view model for our application with a transition.
        app.setRoot('viewmodels/shell', 'entrance');
    });
});