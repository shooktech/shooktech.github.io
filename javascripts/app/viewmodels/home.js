define(function(require) {
	var app = require('durandal/app'),
		ko = require('knockout'),
		router = require('plugins/router');

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

        
    });

  
    return VmHome.create();
});