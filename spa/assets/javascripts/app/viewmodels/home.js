define(function(require) {
	var app = require('durandal/app'),
		ko = require('knockout'),
		router = require('plugins/router');

    var swipe = require('touchswipe');

	var VmBase = require('./vm_base');

    var VmHome = VmBase.extend({
    	init: function() {
    		this.carouselItems = [
    			{
    			img: "http://johnrichardthompson.com/images/photographs/mackinac.jpg",
    			caption: "Caption city"
    			},
    			{
    			img: "http://johnrichardthompson.com/images/photographs/camcorder.jpg",
    			caption: "Fuck City"
    			}
    		];
    	},

    	activate: function() {
        
    	},
        binding: function() {

        },
        bindingComplete: function() {
            /*
            var carouselInner = $('.carousel-inner');

            carouselInner.swipe( {
                swipeLeft: function(event, direction, distance, duration, fingerCount) {
                    $(this).parent().carousel('prev');
                },
                swipeRight: function(event, direction, distance, duration, fingerCount) {
                    $(this).parent().carousel('next');
                },
                threshold: 75
            }); */
            
        },
        attached: function() {
    
        },
        compositionComplete: function() {
        
        },

        
    });

  
    return VmHome.create();
});