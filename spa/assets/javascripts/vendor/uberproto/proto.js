/*! uberproto - v1.1.1 - 2014-06-13
* http://daffl.github.com/uberproto
* Copyright (c) 2014 ; Licensed MIT */
(function () {
	Object.create = Object.create || function (o) {
		if (arguments.length > 1) {
			throw new Error('Object.create implementation only accepts the first parameter.');
		}
		function F() {
		}

		F.prototype = o;
		return new F();
	};

	Object.getPrototypeOf = Object.getPrototypeOf || function (object) {
		return object.proto || object.constructor.prototype;
	};

	Function.prototype.bind = Function.prototype.bind || function (oThis) {
		if (typeof this !== "function") {
			// closest thing possible to the ECMAScript 5 internal IsCallable function
			throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
		}

		var aArgs = Array.prototype.slice.call(arguments, 1),
			fToBind = this,
			FNOP = function () {
			},
			fBound = function () {
				return fToBind.apply(this instanceof FNOP && oThis ? this : oThis,
					aArgs.concat(Array.prototype.slice.call(arguments)));
			};

		FNOP.prototype = this.prototype;
		fBound.prototype = new FNOP();

		return fBound;
	};
})();

/**
 * A base object for ECMAScript 5 style prototypal inheritance.
 *
 * @see https://github.com/rauschma/proto-js/
 * @see http://ejohn.org/blog/simple-javascript-inheritance/
 * @see http://uxebu.com/blog/2011/02/23/object-based-inheritance-for-ecmascript-5/
 */
(function (root, factory) {
	if (typeof define === 'function' && define.amd) {
		define([], factory);
	} else if (typeof exports === 'object') {
		module.exports = factory();
	} else {
		root.Proto = factory();
	}
}(this, function () {
	return {
		/**
		 * Create a new object using Object.create. The arguments will be
		 * passed to the new instances init method or to a method name set in
		 * __init.
		 */
		create: function () {
			var instance = Object.create(this),
				init = typeof instance.__init === 'string' ? instance.__init : 'init';
			if (typeof instance[init] === "function") {
				instance[init].apply(instance, arguments);
			}
			return instance;
		},
		/**
		 * Mixin a given set of properties
		 * @param prop The properties to mix in
		 * @param obj [optional] The object to add the mixin
		 */
		mixin: function (prop, obj) {
			var self = obj || this,
				fnTest = /\b_super\b/,
				_super = Object.getPrototypeOf(self) || self.prototype,
				_old;

			// Copy the properties over
			for (var name in prop) {
				// store the old function which would be overwritten
				_old = self[name];
				// Check if we're overwriting an existing function
				self[name] = (typeof prop[name] === "function" && typeof _super[name] === "function" && fnTest.test(prop[name])) ||
					(typeof _old === "function" && typeof prop[name] === "function") ? //
					(function (old, name, fn) {
						return function () {
							var tmp = this._super;

							// Add a new ._super() method that is the same method
							// but either pointing to the prototype method
							// or to the overwritten method
							this._super = (typeof old === 'function') ? old : _super[name];

							// The method only need to be bound temporarily, so we
							// remove it when we're done executing
							var ret = fn.apply(this, arguments);
							this._super = tmp;

							return ret;
						};
					})(_old, name, prop[name]) : prop[name];
			}

			return self;
		},
		/**
		 * Extend the current or a given object with the given property
		 * and return the extended object.
		 * @param prop The properties to extend with
		 * @param obj [optional] The object to extend from
		 * @returns The extended object
		 */
		extend: function (prop, obj) {
			return this.mixin(prop, Object.create(obj || this));
		},
		/**
		 * Return a callback function with this set to the current or a given context object.
		 * @param name Name of the method to proxy
		 * @param args... [optional] Arguments to use for partial application
		 */
		proxy: function (name) {
			var fn = this[name],
				args = Array.prototype.slice.call(arguments, 1);

			args.unshift(this);
			return fn.bind.apply(fn, args);
		}
	};
}));
