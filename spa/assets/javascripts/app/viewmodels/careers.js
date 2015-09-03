define(function(require) {
    var router = require('plugins/router');
    var app = require('durandal/app');

    var VmBase = require('./vm_base');

    var VmCareers = VmBase.extend({
    	loves: [
    		{love: "Culture"},
    		{love: "Craft Beer"},
    		{love: "Foosball"},
    		{love: "Cats"},
    		{love: "Marketing Savvy"},
    		{love: "Innovation"},
    		{love: "C"},
    		{love: "C++"},
    		{love: "Java"},
    		{love: "Adobe Creative Suite"},
    		{love: "A Can-do Attitude"},
    		{love: "Netflix. Oh yes! Netflix!"}
    	],

        activate: function () {
            
        }
    });

    return VmCareers.create();
});