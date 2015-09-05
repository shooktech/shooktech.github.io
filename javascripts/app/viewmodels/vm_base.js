define(function(require) {
	var proto = require('uberproto');
	
    var VmBase = proto.extend({
    	init: function(model) {
    		this.model = model;
    		
    	}
    });

    return VmBase;
});