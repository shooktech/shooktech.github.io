define(function(require) {
	var app = require('durandal/app'),
		ko = require('knockout'),
		router = require('plugins/router');

    var slick = require('slick');

	var VmBase = require('./vm_base');

    var VmHome = VmBase.extend({
    	init: function() {
    		this.carouselItems = [
    			{
                img: "./images/square-1.jpg",
                imgSmall: "./images/redwoodcity.jpg",
    			header: "Speedy Service",
                description: "With your favorite products"
    			},
    			{
                img: "./images/square-2.jpg",
                imgSmall: "./images/red.png",
    			header: "Friendliness",
                description: "From friendly people"
    			}
    		];

            this.width = ko.observable(window.innerWidth);
    	},

    	activate: function() {
        
    	},
        binding: function() {

        },
        bindingComplete: function() {
           
        },
        attached: function() {
         var carousel = $('.carousel');
            carousel.slick({
                autoplay: true,
                dots: true
            });
        },
        compositionComplete: function() {
            

        },

        
    });

  
    return VmHome.create();
});