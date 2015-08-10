(function () {
/**
 * almond 0.2.6 Copyright (c) 2011-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);

                name = baseParts.concat(name.split("/"));

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    function onResourceLoad(name, defined, deps){
        if(requirejs.onResourceLoad && name){
            requirejs.onResourceLoad({defined:defined}, {id:name}, deps);
        }
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (typeof callback === 'function') {

            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback.apply(defined[name], args);

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }

        onResourceLoad(name, defined, args);
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        config = cfg;
        if (config.deps) {
            req(config.deps, config.callback);
        }
        return req;
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("../vendor/almond-custom", function(){});

/*!
 * jQuery JavaScript Library v1.9.1
 * http://jquery.com/
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 *
 * Copyright 2005, 2012 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2013-2-4
 */
(function( window, undefined ) {

// Can't do this because several apps including ASP.NET trace
// the stack via arguments.caller.callee and Firefox dies if
// you try to trace through "use strict" call chains. (#13335)
// Support: Firefox 18+
//"use strict";
var
	// The deferred used on DOM ready
	readyList,

	// A central reference to the root jQuery(document)
	rootjQuery,

	// Support: IE<9
	// For `typeof node.method` instead of `node.method !== undefined`
	core_strundefined = typeof undefined,

	// Use the correct document accordingly with window argument (sandbox)
	document = window.document,
	location = window.location,

	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$,

	// [[Class]] -> type pairs
	class2type = {},

	// List of deleted data cache ids, so we can reuse them
	core_deletedIds = [],

	core_version = "1.9.1",

	// Save a reference to some core methods
	core_concat = core_deletedIds.concat,
	core_push = core_deletedIds.push,
	core_slice = core_deletedIds.slice,
	core_indexOf = core_deletedIds.indexOf,
	core_toString = class2type.toString,
	core_hasOwn = class2type.hasOwnProperty,
	core_trim = core_version.trim,

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {
		// The jQuery object is actually just the init constructor 'enhanced'
		return new jQuery.fn.init( selector, context, rootjQuery );
	},

	// Used for matching numbers
	core_pnum = /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,

	// Used for splitting on whitespace
	core_rnotwhite = /\S+/g,

	// Make sure we trim BOM and NBSP (here's looking at you, Safari 5.0 and IE)
	rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	// Strict HTML recognition (#11290: must start with <)
	rquickExpr = /^(?:(<[\w\W]+>)[^>]*|#([\w-]*))$/,

	// Match a standalone tag
	rsingleTag = /^<(\w+)\s*\/?>(?:<\/\1>|)$/,

	// JSON RegExp
	rvalidchars = /^[\],:{}\s]*$/,
	rvalidbraces = /(?:^|:|,)(?:\s*\[)+/g,
	rvalidescape = /\\(?:["\\\/bfnrt]|u[\da-fA-F]{4})/g,
	rvalidtokens = /"[^"\\\r\n]*"|true|false|null|-?(?:\d+\.|)\d+(?:[eE][+-]?\d+|)/g,

	// Matches dashed string for camelizing
	rmsPrefix = /^-ms-/,
	rdashAlpha = /-([\da-z])/gi,

	// Used by jQuery.camelCase as callback to replace()
	fcamelCase = function( all, letter ) {
		return letter.toUpperCase();
	},

	// The ready event handler
	completed = function( event ) {

		// readyState === "complete" is good enough for us to call the dom ready in oldIE
		if ( document.addEventListener || event.type === "load" || document.readyState === "complete" ) {
			detach();
			jQuery.ready();
		}
	},
	// Clean-up method for dom ready events
	detach = function() {
		if ( document.addEventListener ) {
			document.removeEventListener( "DOMContentLoaded", completed, false );
			window.removeEventListener( "load", completed, false );

		} else {
			document.detachEvent( "onreadystatechange", completed );
			window.detachEvent( "onload", completed );
		}
	};

jQuery.fn = jQuery.prototype = {
	// The current version of jQuery being used
	jquery: core_version,

	constructor: jQuery,
	init: function( selector, context, rootjQuery ) {
		var match, elem;

		// HANDLE: $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector.charAt(0) === "<" && selector.charAt( selector.length - 1 ) === ">" && selector.length >= 3 ) {
				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && (match[1] || !context) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[1] ) {
					context = context instanceof jQuery ? context[0] : context;

					// scripts is true for back-compat
					jQuery.merge( this, jQuery.parseHTML(
						match[1],
						context && context.nodeType ? context.ownerDocument || context : document,
						true
					) );

					// HANDLE: $(html, props)
					if ( rsingleTag.test( match[1] ) && jQuery.isPlainObject( context ) ) {
						for ( match in context ) {
							// Properties of context are called as methods if possible
							if ( jQuery.isFunction( this[ match ] ) ) {
								this[ match ]( context[ match ] );

							// ...and otherwise set as attributes
							} else {
								this.attr( match, context[ match ] );
							}
						}
					}

					return this;

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[2] );

					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					if ( elem && elem.parentNode ) {
						// Handle the case where IE and Opera return items
						// by name instead of ID
						if ( elem.id !== match[2] ) {
							return rootjQuery.find( selector );
						}

						// Otherwise, we inject the element directly into the jQuery object
						this.length = 1;
						this[0] = elem;
					}

					this.context = document;
					this.selector = selector;
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || rootjQuery ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(DOMElement)
		} else if ( selector.nodeType ) {
			this.context = this[0] = selector;
			this.length = 1;
			return this;

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( jQuery.isFunction( selector ) ) {
			return rootjQuery.ready( selector );
		}

		if ( selector.selector !== undefined ) {
			this.selector = selector.selector;
			this.context = selector.context;
		}

		return jQuery.makeArray( selector, this );
	},

	// Start with an empty selector
	selector: "",

	// The default length of a jQuery object is 0
	length: 0,

	// The number of elements contained in the matched element set
	size: function() {
		return this.length;
	},

	toArray: function() {
		return core_slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {
		return num == null ?

			// Return a 'clean' array
			this.toArray() :

			// Return just the object
			( num < 0 ? this[ this.length + num ] : this[ num ] );
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;
		ret.context = this.context;

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	// (You can seed the arguments with an array of args, but this is
	// only used internally.)
	each: function( callback, args ) {
		return jQuery.each( this, callback, args );
	},

	ready: function( fn ) {
		// Add the callback
		jQuery.ready.promise().done( fn );

		return this;
	},

	slice: function() {
		return this.pushStack( core_slice.apply( this, arguments ) );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	eq: function( i ) {
		var len = this.length,
			j = +i + ( i < 0 ? len : 0 );
		return this.pushStack( j >= 0 && j < len ? [ this[j] ] : [] );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map(this, function( elem, i ) {
			return callback.call( elem, i, elem );
		}));
	},

	end: function() {
		return this.prevObject || this.constructor(null);
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: core_push,
	sort: [].sort,
	splice: [].splice
};

// Give the init function the jQuery prototype for later instantiation
jQuery.fn.init.prototype = jQuery.fn;

jQuery.extend = jQuery.fn.extend = function() {
	var src, copyIsArray, copy, name, options, clone,
		target = arguments[0] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;
		target = arguments[1] || {};
		// skip the boolean and the target
		i = 2;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !jQuery.isFunction(target) ) {
		target = {};
	}

	// extend jQuery itself if only one argument is passed
	if ( length === i ) {
		target = this;
		--i;
	}

	for ( ; i < length; i++ ) {
		// Only deal with non-null/undefined values
		if ( (options = arguments[ i ]) != null ) {
			// Extend the base object
			for ( name in options ) {
				src = target[ name ];
				copy = options[ name ];

				// Prevent never-ending loop
				if ( target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {
					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && jQuery.isArray(src) ? src : [];

					} else {
						clone = src && jQuery.isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend({
	noConflict: function( deep ) {
		if ( window.$ === jQuery ) {
			window.$ = _$;
		}

		if ( deep && window.jQuery === jQuery ) {
			window.jQuery = _jQuery;
		}

		return jQuery;
	},

	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Hold (or release) the ready event
	holdReady: function( hold ) {
		if ( hold ) {
			jQuery.readyWait++;
		} else {
			jQuery.ready( true );
		}
	},

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Make sure body exists, at least, in case IE gets a little overzealous (ticket #5443).
		if ( !document.body ) {
			return setTimeout( jQuery.ready );
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );

		// Trigger any bound ready events
		if ( jQuery.fn.trigger ) {
			jQuery( document ).trigger("ready").off("ready");
		}
	},

	// See test/unit/core.js for details concerning isFunction.
	// Since version 1.3, DOM methods and functions like alert
	// aren't supported. They return false on IE (#2968).
	isFunction: function( obj ) {
		return jQuery.type(obj) === "function";
	},

	isArray: Array.isArray || function( obj ) {
		return jQuery.type(obj) === "array";
	},

	isWindow: function( obj ) {
		return obj != null && obj == obj.window;
	},

	isNumeric: function( obj ) {
		return !isNaN( parseFloat(obj) ) && isFinite( obj );
	},

	type: function( obj ) {
		if ( obj == null ) {
			return String( obj );
		}
		return typeof obj === "object" || typeof obj === "function" ?
			class2type[ core_toString.call(obj) ] || "object" :
			typeof obj;
	},

	isPlainObject: function( obj ) {
		// Must be an Object.
		// Because of IE, we also have to check the presence of the constructor property.
		// Make sure that DOM nodes and window objects don't pass through, as well
		if ( !obj || jQuery.type(obj) !== "object" || obj.nodeType || jQuery.isWindow( obj ) ) {
			return false;
		}

		try {
			// Not own constructor property must be Object
			if ( obj.constructor &&
				!core_hasOwn.call(obj, "constructor") &&
				!core_hasOwn.call(obj.constructor.prototype, "isPrototypeOf") ) {
				return false;
			}
		} catch ( e ) {
			// IE8,9 Will throw exceptions on certain host objects #9897
			return false;
		}

		// Own properties are enumerated firstly, so to speed up,
		// if last one is own, then all properties are own.

		var key;
		for ( key in obj ) {}

		return key === undefined || core_hasOwn.call( obj, key );
	},

	isEmptyObject: function( obj ) {
		var name;
		for ( name in obj ) {
			return false;
		}
		return true;
	},

	error: function( msg ) {
		throw new Error( msg );
	},

	// data: string of html
	// context (optional): If specified, the fragment will be created in this context, defaults to document
	// keepScripts (optional): If true, will include scripts passed in the html string
	parseHTML: function( data, context, keepScripts ) {
		if ( !data || typeof data !== "string" ) {
			return null;
		}
		if ( typeof context === "boolean" ) {
			keepScripts = context;
			context = false;
		}
		context = context || document;

		var parsed = rsingleTag.exec( data ),
			scripts = !keepScripts && [];

		// Single tag
		if ( parsed ) {
			return [ context.createElement( parsed[1] ) ];
		}

		parsed = jQuery.buildFragment( [ data ], context, scripts );
		if ( scripts ) {
			jQuery( scripts ).remove();
		}
		return jQuery.merge( [], parsed.childNodes );
	},

	parseJSON: function( data ) {
		// Attempt to parse using the native JSON parser first
		if ( window.JSON && window.JSON.parse ) {
			return window.JSON.parse( data );
		}

		if ( data === null ) {
			return data;
		}

		if ( typeof data === "string" ) {

			// Make sure leading/trailing whitespace is removed (IE can't handle it)
			data = jQuery.trim( data );

			if ( data ) {
				// Make sure the incoming data is actual JSON
				// Logic borrowed from http://json.org/json2.js
				if ( rvalidchars.test( data.replace( rvalidescape, "@" )
					.replace( rvalidtokens, "]" )
					.replace( rvalidbraces, "")) ) {

					return ( new Function( "return " + data ) )();
				}
			}
		}

		jQuery.error( "Invalid JSON: " + data );
	},

	// Cross-browser xml parsing
	parseXML: function( data ) {
		var xml, tmp;
		if ( !data || typeof data !== "string" ) {
			return null;
		}
		try {
			if ( window.DOMParser ) { // Standard
				tmp = new DOMParser();
				xml = tmp.parseFromString( data , "text/xml" );
			} else { // IE
				xml = new ActiveXObject( "Microsoft.XMLDOM" );
				xml.async = "false";
				xml.loadXML( data );
			}
		} catch( e ) {
			xml = undefined;
		}
		if ( !xml || !xml.documentElement || xml.getElementsByTagName( "parsererror" ).length ) {
			jQuery.error( "Invalid XML: " + data );
		}
		return xml;
	},

	noop: function() {},

	// Evaluates a script in a global context
	// Workarounds based on findings by Jim Driscoll
	// http://weblogs.java.net/blog/driscoll/archive/2009/09/08/eval-javascript-global-context
	globalEval: function( data ) {
		if ( data && jQuery.trim( data ) ) {
			// We use execScript on Internet Explorer
			// We use an anonymous function so that context is window
			// rather than jQuery in Firefox
			( window.execScript || function( data ) {
				window[ "eval" ].call( window, data );
			} )( data );
		}
	},

	// Convert dashed to camelCase; used by the css and data modules
	// Microsoft forgot to hump their vendor prefix (#9572)
	camelCase: function( string ) {
		return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
	},

	nodeName: function( elem, name ) {
		return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
	},

	// args is for internal usage only
	each: function( obj, callback, args ) {
		var value,
			i = 0,
			length = obj.length,
			isArray = isArraylike( obj );

		if ( args ) {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			}

		// A special, fast, case for the most common use of each
		} else {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			}
		}

		return obj;
	},

	// Use native String.trim function wherever possible
	trim: core_trim && !core_trim.call("\uFEFF\xA0") ?
		function( text ) {
			return text == null ?
				"" :
				core_trim.call( text );
		} :

		// Otherwise use our own trimming functionality
		function( text ) {
			return text == null ?
				"" :
				( text + "" ).replace( rtrim, "" );
		},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArraylike( Object(arr) ) ) {
				jQuery.merge( ret,
					typeof arr === "string" ?
					[ arr ] : arr
				);
			} else {
				core_push.call( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		var len;

		if ( arr ) {
			if ( core_indexOf ) {
				return core_indexOf.call( arr, elem, i );
			}

			len = arr.length;
			i = i ? i < 0 ? Math.max( 0, len + i ) : i : 0;

			for ( ; i < len; i++ ) {
				// Skip accessing in sparse arrays
				if ( i in arr && arr[ i ] === elem ) {
					return i;
				}
			}
		}

		return -1;
	},

	merge: function( first, second ) {
		var l = second.length,
			i = first.length,
			j = 0;

		if ( typeof l === "number" ) {
			for ( ; j < l; j++ ) {
				first[ i++ ] = second[ j ];
			}
		} else {
			while ( second[j] !== undefined ) {
				first[ i++ ] = second[ j++ ];
			}
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, inv ) {
		var retVal,
			ret = [],
			i = 0,
			length = elems.length;
		inv = !!inv;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			retVal = !!callback( elems[ i ], i );
			if ( inv !== retVal ) {
				ret.push( elems[ i ] );
			}
		}

		return ret;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var value,
			i = 0,
			length = elems.length,
			isArray = isArraylike( elems ),
			ret = [];

		// Go through the array, translating each of the items to their
		if ( isArray ) {
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret[ ret.length ] = value;
				}
			}

		// Go through every key on the object,
		} else {
			for ( i in elems ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret[ ret.length ] = value;
				}
			}
		}

		// Flatten any nested arrays
		return core_concat.apply( [], ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// Bind a function to a context, optionally partially applying any
	// arguments.
	proxy: function( fn, context ) {
		var args, proxy, tmp;

		if ( typeof context === "string" ) {
			tmp = fn[ context ];
			context = fn;
			fn = tmp;
		}

		// Quick check to determine if target is callable, in the spec
		// this throws a TypeError, but we will just return undefined.
		if ( !jQuery.isFunction( fn ) ) {
			return undefined;
		}

		// Simulated bind
		args = core_slice.call( arguments, 2 );
		proxy = function() {
			return fn.apply( context || this, args.concat( core_slice.call( arguments ) ) );
		};

		// Set the guid of unique handler to the same of original handler, so it can be removed
		proxy.guid = fn.guid = fn.guid || jQuery.guid++;

		return proxy;
	},

	// Multifunctional method to get and set values of a collection
	// The value/s can optionally be executed if it's a function
	access: function( elems, fn, key, value, chainable, emptyGet, raw ) {
		var i = 0,
			length = elems.length,
			bulk = key == null;

		// Sets many values
		if ( jQuery.type( key ) === "object" ) {
			chainable = true;
			for ( i in key ) {
				jQuery.access( elems, fn, i, key[i], true, emptyGet, raw );
			}

		// Sets one value
		} else if ( value !== undefined ) {
			chainable = true;

			if ( !jQuery.isFunction( value ) ) {
				raw = true;
			}

			if ( bulk ) {
				// Bulk operations run against the entire set
				if ( raw ) {
					fn.call( elems, value );
					fn = null;

				// ...except when executing function values
				} else {
					bulk = fn;
					fn = function( elem, key, value ) {
						return bulk.call( jQuery( elem ), value );
					};
				}
			}

			if ( fn ) {
				for ( ; i < length; i++ ) {
					fn( elems[i], key, raw ? value : value.call( elems[i], i, fn( elems[i], key ) ) );
				}
			}
		}

		return chainable ?
			elems :

			// Gets
			bulk ?
				fn.call( elems ) :
				length ? fn( elems[0], key ) : emptyGet;
	},

	now: function() {
		return ( new Date() ).getTime();
	}
});

jQuery.ready.promise = function( obj ) {
	if ( !readyList ) {

		readyList = jQuery.Deferred();

		// Catch cases where $(document).ready() is called after the browser event has already occurred.
		// we once tried to use readyState "interactive" here, but it caused issues like the one
		// discovered by ChrisS here: http://bugs.jquery.com/ticket/12282#comment:15
		if ( document.readyState === "complete" ) {
			// Handle it asynchronously to allow scripts the opportunity to delay ready
			setTimeout( jQuery.ready );

		// Standards-based browsers support DOMContentLoaded
		} else if ( document.addEventListener ) {
			// Use the handy event callback
			document.addEventListener( "DOMContentLoaded", completed, false );

			// A fallback to window.onload, that will always work
			window.addEventListener( "load", completed, false );

		// If IE event model is used
		} else {
			// Ensure firing before onload, maybe late but safe also for iframes
			document.attachEvent( "onreadystatechange", completed );

			// A fallback to window.onload, that will always work
			window.attachEvent( "onload", completed );

			// If IE and not a frame
			// continually check to see if the document is ready
			var top = false;

			try {
				top = window.frameElement == null && document.documentElement;
			} catch(e) {}

			if ( top && top.doScroll ) {
				(function doScrollCheck() {
					if ( !jQuery.isReady ) {

						try {
							// Use the trick by Diego Perini
							// http://javascript.nwbox.com/IEContentLoaded/
							top.doScroll("left");
						} catch(e) {
							return setTimeout( doScrollCheck, 50 );
						}

						// detach all dom ready events
						detach();

						// and execute any waiting functions
						jQuery.ready();
					}
				})();
			}
		}
	}
	return readyList.promise( obj );
};

// Populate the class2type map
jQuery.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function(i, name) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
});

function isArraylike( obj ) {
	var length = obj.length,
		type = jQuery.type( obj );

	if ( jQuery.isWindow( obj ) ) {
		return false;
	}

	if ( obj.nodeType === 1 && length ) {
		return true;
	}

	return type === "array" || type !== "function" &&
		( length === 0 ||
		typeof length === "number" && length > 0 && ( length - 1 ) in obj );
}

// All jQuery objects should point back to these
rootjQuery = jQuery(document);
// String to Object options format cache
var optionsCache = {};

// Convert String-formatted options into Object-formatted ones and store in cache
function createOptions( options ) {
	var object = optionsCache[ options ] = {};
	jQuery.each( options.match( core_rnotwhite ) || [], function( _, flag ) {
		object[ flag ] = true;
	});
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		( optionsCache[ options ] || createOptions( options ) ) :
		jQuery.extend( {}, options );

	var // Flag to know if list is currently firing
		firing,
		// Last fire value (for non-forgettable lists)
		memory,
		// Flag to know if list was already fired
		fired,
		// End of the loop when firing
		firingLength,
		// Index of currently firing callback (modified by remove if needed)
		firingIndex,
		// First callback to fire (used internally by add and fireWith)
		firingStart,
		// Actual callback list
		list = [],
		// Stack of fire calls for repeatable lists
		stack = !options.once && [],
		// Fire callbacks
		fire = function( data ) {
			memory = options.memory && data;
			fired = true;
			firingIndex = firingStart || 0;
			firingStart = 0;
			firingLength = list.length;
			firing = true;
			for ( ; list && firingIndex < firingLength; firingIndex++ ) {
				if ( list[ firingIndex ].apply( data[ 0 ], data[ 1 ] ) === false && options.stopOnFalse ) {
					memory = false; // To prevent further calls using add
					break;
				}
			}
			firing = false;
			if ( list ) {
				if ( stack ) {
					if ( stack.length ) {
						fire( stack.shift() );
					}
				} else if ( memory ) {
					list = [];
				} else {
					self.disable();
				}
			}
		},
		// Actual Callbacks object
		self = {
			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {
					// First, we save the current length
					var start = list.length;
					(function add( args ) {
						jQuery.each( args, function( _, arg ) {
							var type = jQuery.type( arg );
							if ( type === "function" ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && type !== "string" ) {
								// Inspect recursively
								add( arg );
							}
						});
					})( arguments );
					// Do we need to add the callbacks to the
					// current firing batch?
					if ( firing ) {
						firingLength = list.length;
					// With memory, if we're not firing then
					// we should call right away
					} else if ( memory ) {
						firingStart = start;
						fire( memory );
					}
				}
				return this;
			},
			// Remove a callback from the list
			remove: function() {
				if ( list ) {
					jQuery.each( arguments, function( _, arg ) {
						var index;
						while( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
							list.splice( index, 1 );
							// Handle firing indexes
							if ( firing ) {
								if ( index <= firingLength ) {
									firingLength--;
								}
								if ( index <= firingIndex ) {
									firingIndex--;
								}
							}
						}
					});
				}
				return this;
			},
			// Check if a given callback is in the list.
			// If no argument is given, return whether or not list has callbacks attached.
			has: function( fn ) {
				return fn ? jQuery.inArray( fn, list ) > -1 : !!( list && list.length );
			},
			// Remove all callbacks from the list
			empty: function() {
				list = [];
				return this;
			},
			// Have the list do nothing anymore
			disable: function() {
				list = stack = memory = undefined;
				return this;
			},
			// Is it disabled?
			disabled: function() {
				return !list;
			},
			// Lock the list in its current state
			lock: function() {
				stack = undefined;
				if ( !memory ) {
					self.disable();
				}
				return this;
			},
			// Is it locked?
			locked: function() {
				return !stack;
			},
			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				args = args || [];
				args = [ context, args.slice ? args.slice() : args ];
				if ( list && ( !fired || stack ) ) {
					if ( firing ) {
						stack.push( args );
					} else {
						fire( args );
					}
				}
				return this;
			},
			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},
			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};
jQuery.extend({

	Deferred: function( func ) {
		var tuples = [
				// action, add listener, listener list, final state
				[ "resolve", "done", jQuery.Callbacks("once memory"), "resolved" ],
				[ "reject", "fail", jQuery.Callbacks("once memory"), "rejected" ],
				[ "notify", "progress", jQuery.Callbacks("memory") ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				then: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;
					return jQuery.Deferred(function( newDefer ) {
						jQuery.each( tuples, function( i, tuple ) {
							var action = tuple[ 0 ],
								fn = jQuery.isFunction( fns[ i ] ) && fns[ i ];
							// deferred[ done | fail | progress ] for forwarding actions to newDefer
							deferred[ tuple[1] ](function() {
								var returned = fn && fn.apply( this, arguments );
								if ( returned && jQuery.isFunction( returned.promise ) ) {
									returned.promise()
										.done( newDefer.resolve )
										.fail( newDefer.reject )
										.progress( newDefer.notify );
								} else {
									newDefer[ action + "With" ]( this === promise ? newDefer.promise() : this, fn ? [ returned ] : arguments );
								}
							});
						});
						fns = null;
					}).promise();
				},
				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Keep pipe for back-compat
		promise.pipe = promise.then;

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 3 ];

			// promise[ done | fail | progress ] = list.add
			promise[ tuple[1] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(function() {
					// state = [ resolved | rejected ]
					state = stateString;

				// [ reject_list | resolve_list ].disable; progress_list.lock
				}, tuples[ i ^ 1 ][ 2 ].disable, tuples[ 2 ][ 2 ].lock );
			}

			// deferred[ resolve | reject | notify ]
			deferred[ tuple[0] ] = function() {
				deferred[ tuple[0] + "With" ]( this === deferred ? promise : this, arguments );
				return this;
			};
			deferred[ tuple[0] + "With" ] = list.fireWith;
		});

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( subordinate /* , ..., subordinateN */ ) {
		var i = 0,
			resolveValues = core_slice.call( arguments ),
			length = resolveValues.length,

			// the count of uncompleted subordinates
			remaining = length !== 1 || ( subordinate && jQuery.isFunction( subordinate.promise ) ) ? length : 0,

			// the master Deferred. If resolveValues consist of only a single Deferred, just use that.
			deferred = remaining === 1 ? subordinate : jQuery.Deferred(),

			// Update function for both resolve and progress values
			updateFunc = function( i, contexts, values ) {
				return function( value ) {
					contexts[ i ] = this;
					values[ i ] = arguments.length > 1 ? core_slice.call( arguments ) : value;
					if( values === progressValues ) {
						deferred.notifyWith( contexts, values );
					} else if ( !( --remaining ) ) {
						deferred.resolveWith( contexts, values );
					}
				};
			},

			progressValues, progressContexts, resolveContexts;

		// add listeners to Deferred subordinates; treat others as resolved
		if ( length > 1 ) {
			progressValues = new Array( length );
			progressContexts = new Array( length );
			resolveContexts = new Array( length );
			for ( ; i < length; i++ ) {
				if ( resolveValues[ i ] && jQuery.isFunction( resolveValues[ i ].promise ) ) {
					resolveValues[ i ].promise()
						.done( updateFunc( i, resolveContexts, resolveValues ) )
						.fail( deferred.reject )
						.progress( updateFunc( i, progressContexts, progressValues ) );
				} else {
					--remaining;
				}
			}
		}

		// if we're not waiting on anything, resolve the master
		if ( !remaining ) {
			deferred.resolveWith( resolveContexts, resolveValues );
		}

		return deferred.promise();
	}
});
jQuery.support = (function() {

	var support, all, a,
		input, select, fragment,
		opt, eventName, isSupported, i,
		div = document.createElement("div");

	// Setup
	div.setAttribute( "className", "t" );
	div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";

	// Support tests won't run in some limited or non-browser environments
	all = div.getElementsByTagName("*");
	a = div.getElementsByTagName("a")[ 0 ];
	if ( !all || !a || !all.length ) {
		return {};
	}

	// First batch of tests
	select = document.createElement("select");
	opt = select.appendChild( document.createElement("option") );
	input = div.getElementsByTagName("input")[ 0 ];

	a.style.cssText = "top:1px;float:left;opacity:.5";
	support = {
		// Test setAttribute on camelCase class. If it works, we need attrFixes when doing get/setAttribute (ie6/7)
		getSetAttribute: div.className !== "t",

		// IE strips leading whitespace when .innerHTML is used
		leadingWhitespace: div.firstChild.nodeType === 3,

		// Make sure that tbody elements aren't automatically inserted
		// IE will insert them into empty tables
		tbody: !div.getElementsByTagName("tbody").length,

		// Make sure that link elements get serialized correctly by innerHTML
		// This requires a wrapper element in IE
		htmlSerialize: !!div.getElementsByTagName("link").length,

		// Get the style information from getAttribute
		// (IE uses .cssText instead)
		style: /top/.test( a.getAttribute("style") ),

		// Make sure that URLs aren't manipulated
		// (IE normalizes it by default)
		hrefNormalized: a.getAttribute("href") === "/a",

		// Make sure that element opacity exists
		// (IE uses filter instead)
		// Use a regex to work around a WebKit issue. See #5145
		opacity: /^0.5/.test( a.style.opacity ),

		// Verify style float existence
		// (IE uses styleFloat instead of cssFloat)
		cssFloat: !!a.style.cssFloat,

		// Check the default checkbox/radio value ("" on WebKit; "on" elsewhere)
		checkOn: !!input.value,

		// Make sure that a selected-by-default option has a working selected property.
		// (WebKit defaults to false instead of true, IE too, if it's in an optgroup)
		optSelected: opt.selected,

		// Tests for enctype support on a form (#6743)
		enctype: !!document.createElement("form").enctype,

		// Makes sure cloning an html5 element does not cause problems
		// Where outerHTML is undefined, this still works
		html5Clone: document.createElement("nav").cloneNode( true ).outerHTML !== "<:nav></:nav>",

		// jQuery.support.boxModel DEPRECATED in 1.8 since we don't support Quirks Mode
		boxModel: document.compatMode === "CSS1Compat",

		// Will be defined later
		deleteExpando: true,
		noCloneEvent: true,
		inlineBlockNeedsLayout: false,
		shrinkWrapBlocks: false,
		reliableMarginRight: true,
		boxSizingReliable: true,
		pixelPosition: false
	};

	// Make sure checked status is properly cloned
	input.checked = true;
	support.noCloneChecked = input.cloneNode( true ).checked;

	// Make sure that the options inside disabled selects aren't marked as disabled
	// (WebKit marks them as disabled)
	select.disabled = true;
	support.optDisabled = !opt.disabled;

	// Support: IE<9
	try {
		delete div.test;
	} catch( e ) {
		support.deleteExpando = false;
	}

	// Check if we can trust getAttribute("value")
	input = document.createElement("input");
	input.setAttribute( "value", "" );
	support.input = input.getAttribute( "value" ) === "";

	// Check if an input maintains its value after becoming a radio
	input.value = "t";
	input.setAttribute( "type", "radio" );
	support.radioValue = input.value === "t";

	// #11217 - WebKit loses check when the name is after the checked attribute
	input.setAttribute( "checked", "t" );
	input.setAttribute( "name", "t" );

	fragment = document.createDocumentFragment();
	fragment.appendChild( input );

	// Check if a disconnected checkbox will retain its checked
	// value of true after appended to the DOM (IE6/7)
	support.appendChecked = input.checked;

	// WebKit doesn't clone checked state correctly in fragments
	support.checkClone = fragment.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Support: IE<9
	// Opera does not clone events (and typeof div.attachEvent === undefined).
	// IE9-10 clones events bound via attachEvent, but they don't trigger with .click()
	if ( div.attachEvent ) {
		div.attachEvent( "onclick", function() {
			support.noCloneEvent = false;
		});

		div.cloneNode( true ).click();
	}

	// Support: IE<9 (lack submit/change bubble), Firefox 17+ (lack focusin event)
	// Beware of CSP restrictions (https://developer.mozilla.org/en/Security/CSP), test/csp.php
	for ( i in { submit: true, change: true, focusin: true }) {
		div.setAttribute( eventName = "on" + i, "t" );

		support[ i + "Bubbles" ] = eventName in window || div.attributes[ eventName ].expando === false;
	}

	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	// Run tests that need a body at doc ready
	jQuery(function() {
		var container, marginDiv, tds,
			divReset = "padding:0;margin:0;border:0;display:block;box-sizing:content-box;-moz-box-sizing:content-box;-webkit-box-sizing:content-box;",
			body = document.getElementsByTagName("body")[0];

		if ( !body ) {
			// Return for frameset docs that don't have a body
			return;
		}

		container = document.createElement("div");
		container.style.cssText = "border:0;width:0;height:0;position:absolute;top:0;left:-9999px;margin-top:1px";

		body.appendChild( container ).appendChild( div );

		// Support: IE8
		// Check if table cells still have offsetWidth/Height when they are set
		// to display:none and there are still other visible table cells in a
		// table row; if so, offsetWidth/Height are not reliable for use when
		// determining if an element has been hidden directly using
		// display:none (it is still safe to use offsets if a parent element is
		// hidden; don safety goggles and see bug #4512 for more information).
		div.innerHTML = "<table><tr><td></td><td>t</td></tr></table>";
		tds = div.getElementsByTagName("td");
		tds[ 0 ].style.cssText = "padding:0;margin:0;border:0;display:none";
		isSupported = ( tds[ 0 ].offsetHeight === 0 );

		tds[ 0 ].style.display = "";
		tds[ 1 ].style.display = "none";

		// Support: IE8
		// Check if empty table cells still have offsetWidth/Height
		support.reliableHiddenOffsets = isSupported && ( tds[ 0 ].offsetHeight === 0 );

		// Check box-sizing and margin behavior
		div.innerHTML = "";
		div.style.cssText = "box-sizing:border-box;-moz-box-sizing:border-box;-webkit-box-sizing:border-box;padding:1px;border:1px;display:block;width:4px;margin-top:1%;position:absolute;top:1%;";
		support.boxSizing = ( div.offsetWidth === 4 );
		support.doesNotIncludeMarginInBodyOffset = ( body.offsetTop !== 1 );

		// Use window.getComputedStyle because jsdom on node.js will break without it.
		if ( window.getComputedStyle ) {
			support.pixelPosition = ( window.getComputedStyle( div, null ) || {} ).top !== "1%";
			support.boxSizingReliable = ( window.getComputedStyle( div, null ) || { width: "4px" } ).width === "4px";

			// Check if div with explicit width and no margin-right incorrectly
			// gets computed margin-right based on width of container. (#3333)
			// Fails in WebKit before Feb 2011 nightlies
			// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
			marginDiv = div.appendChild( document.createElement("div") );
			marginDiv.style.cssText = div.style.cssText = divReset;
			marginDiv.style.marginRight = marginDiv.style.width = "0";
			div.style.width = "1px";

			support.reliableMarginRight =
				!parseFloat( ( window.getComputedStyle( marginDiv, null ) || {} ).marginRight );
		}

		if ( typeof div.style.zoom !== core_strundefined ) {
			// Support: IE<8
			// Check if natively block-level elements act like inline-block
			// elements when setting their display to 'inline' and giving
			// them layout
			div.innerHTML = "";
			div.style.cssText = divReset + "width:1px;padding:1px;display:inline;zoom:1";
			support.inlineBlockNeedsLayout = ( div.offsetWidth === 3 );

			// Support: IE6
			// Check if elements with layout shrink-wrap their children
			div.style.display = "block";
			div.innerHTML = "<div></div>";
			div.firstChild.style.width = "5px";
			support.shrinkWrapBlocks = ( div.offsetWidth !== 3 );

			if ( support.inlineBlockNeedsLayout ) {
				// Prevent IE 6 from affecting layout for positioned elements #11048
				// Prevent IE from shrinking the body in IE 7 mode #12869
				// Support: IE<8
				body.style.zoom = 1;
			}
		}

		body.removeChild( container );

		// Null elements to avoid leaks in IE
		container = div = tds = marginDiv = null;
	});

	// Null elements to avoid leaks in IE
	all = select = fragment = opt = a = input = null;

	return support;
})();

var rbrace = /(?:\{[\s\S]*\}|\[[\s\S]*\])$/,
	rmultiDash = /([A-Z])/g;

function internalData( elem, name, data, pvt /* Internal Use Only */ ){
	if ( !jQuery.acceptData( elem ) ) {
		return;
	}

	var thisCache, ret,
		internalKey = jQuery.expando,
		getByName = typeof name === "string",

		// We have to handle DOM nodes and JS objects differently because IE6-7
		// can't GC object references properly across the DOM-JS boundary
		isNode = elem.nodeType,

		// Only DOM nodes need the global jQuery cache; JS object data is
		// attached directly to the object so GC can occur automatically
		cache = isNode ? jQuery.cache : elem,

		// Only defining an ID for JS objects if its cache already exists allows
		// the code to shortcut on the same path as a DOM node with no cache
		id = isNode ? elem[ internalKey ] : elem[ internalKey ] && internalKey;

	// Avoid doing any more work than we need to when trying to get data on an
	// object that has no data at all
	if ( (!id || !cache[id] || (!pvt && !cache[id].data)) && getByName && data === undefined ) {
		return;
	}

	if ( !id ) {
		// Only DOM nodes need a new unique ID for each element since their data
		// ends up in the global cache
		if ( isNode ) {
			elem[ internalKey ] = id = core_deletedIds.pop() || jQuery.guid++;
		} else {
			id = internalKey;
		}
	}

	if ( !cache[ id ] ) {
		cache[ id ] = {};

		// Avoids exposing jQuery metadata on plain JS objects when the object
		// is serialized using JSON.stringify
		if ( !isNode ) {
			cache[ id ].toJSON = jQuery.noop;
		}
	}

	// An object can be passed to jQuery.data instead of a key/value pair; this gets
	// shallow copied over onto the existing cache
	if ( typeof name === "object" || typeof name === "function" ) {
		if ( pvt ) {
			cache[ id ] = jQuery.extend( cache[ id ], name );
		} else {
			cache[ id ].data = jQuery.extend( cache[ id ].data, name );
		}
	}

	thisCache = cache[ id ];

	// jQuery data() is stored in a separate object inside the object's internal data
	// cache in order to avoid key collisions between internal data and user-defined
	// data.
	if ( !pvt ) {
		if ( !thisCache.data ) {
			thisCache.data = {};
		}

		thisCache = thisCache.data;
	}

	if ( data !== undefined ) {
		thisCache[ jQuery.camelCase( name ) ] = data;
	}

	// Check for both converted-to-camel and non-converted data property names
	// If a data property was specified
	if ( getByName ) {

		// First Try to find as-is property data
		ret = thisCache[ name ];

		// Test for null|undefined property data
		if ( ret == null ) {

			// Try to find the camelCased property
			ret = thisCache[ jQuery.camelCase( name ) ];
		}
	} else {
		ret = thisCache;
	}

	return ret;
}

function internalRemoveData( elem, name, pvt ) {
	if ( !jQuery.acceptData( elem ) ) {
		return;
	}

	var i, l, thisCache,
		isNode = elem.nodeType,

		// See jQuery.data for more information
		cache = isNode ? jQuery.cache : elem,
		id = isNode ? elem[ jQuery.expando ] : jQuery.expando;

	// If there is already no cache entry for this object, there is no
	// purpose in continuing
	if ( !cache[ id ] ) {
		return;
	}

	if ( name ) {

		thisCache = pvt ? cache[ id ] : cache[ id ].data;

		if ( thisCache ) {

			// Support array or space separated string names for data keys
			if ( !jQuery.isArray( name ) ) {

				// try the string as a key before any manipulation
				if ( name in thisCache ) {
					name = [ name ];
				} else {

					// split the camel cased version by spaces unless a key with the spaces exists
					name = jQuery.camelCase( name );
					if ( name in thisCache ) {
						name = [ name ];
					} else {
						name = name.split(" ");
					}
				}
			} else {
				// If "name" is an array of keys...
				// When data is initially created, via ("key", "val") signature,
				// keys will be converted to camelCase.
				// Since there is no way to tell _how_ a key was added, remove
				// both plain key and camelCase key. #12786
				// This will only penalize the array argument path.
				name = name.concat( jQuery.map( name, jQuery.camelCase ) );
			}

			for ( i = 0, l = name.length; i < l; i++ ) {
				delete thisCache[ name[i] ];
			}

			// If there is no data left in the cache, we want to continue
			// and let the cache object itself get destroyed
			if ( !( pvt ? isEmptyDataObject : jQuery.isEmptyObject )( thisCache ) ) {
				return;
			}
		}
	}

	// See jQuery.data for more information
	if ( !pvt ) {
		delete cache[ id ].data;

		// Don't destroy the parent cache unless the internal data object
		// had been the only thing left in it
		if ( !isEmptyDataObject( cache[ id ] ) ) {
			return;
		}
	}

	// Destroy the cache
	if ( isNode ) {
		jQuery.cleanData( [ elem ], true );

	// Use delete when supported for expandos or `cache` is not a window per isWindow (#10080)
	} else if ( jQuery.support.deleteExpando || cache != cache.window ) {
		delete cache[ id ];

	// When all else fails, null
	} else {
		cache[ id ] = null;
	}
}

jQuery.extend({
	cache: {},

	// Unique for each copy of jQuery on the page
	// Non-digits removed to match rinlinejQuery
	expando: "jQuery" + ( core_version + Math.random() ).replace( /\D/g, "" ),

	// The following elements throw uncatchable exceptions if you
	// attempt to add expando properties to them.
	noData: {
		"embed": true,
		// Ban all objects except for Flash (which handle expandos)
		"object": "clsid:D27CDB6E-AE6D-11cf-96B8-444553540000",
		"applet": true
	},

	hasData: function( elem ) {
		elem = elem.nodeType ? jQuery.cache[ elem[jQuery.expando] ] : elem[ jQuery.expando ];
		return !!elem && !isEmptyDataObject( elem );
	},

	data: function( elem, name, data ) {
		return internalData( elem, name, data );
	},

	removeData: function( elem, name ) {
		return internalRemoveData( elem, name );
	},

	// For internal use only.
	_data: function( elem, name, data ) {
		return internalData( elem, name, data, true );
	},

	_removeData: function( elem, name ) {
		return internalRemoveData( elem, name, true );
	},

	// A method for determining if a DOM node can handle the data expando
	acceptData: function( elem ) {
		// Do not set data on non-element because it will not be cleared (#8335).
		if ( elem.nodeType && elem.nodeType !== 1 && elem.nodeType !== 9 ) {
			return false;
		}

		var noData = elem.nodeName && jQuery.noData[ elem.nodeName.toLowerCase() ];

		// nodes accept data unless otherwise specified; rejection can be conditional
		return !noData || noData !== true && elem.getAttribute("classid") === noData;
	}
});

jQuery.fn.extend({
	data: function( key, value ) {
		var attrs, name,
			elem = this[0],
			i = 0,
			data = null;

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = jQuery.data( elem );

				if ( elem.nodeType === 1 && !jQuery._data( elem, "parsedAttrs" ) ) {
					attrs = elem.attributes;
					for ( ; i < attrs.length; i++ ) {
						name = attrs[i].name;

						if ( !name.indexOf( "data-" ) ) {
							name = jQuery.camelCase( name.slice(5) );

							dataAttr( elem, name, data[ name ] );
						}
					}
					jQuery._data( elem, "parsedAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each(function() {
				jQuery.data( this, key );
			});
		}

		return jQuery.access( this, function( value ) {

			if ( value === undefined ) {
				// Try to fetch any internally stored data first
				return elem ? dataAttr( elem, key, jQuery.data( elem, key ) ) : null;
			}

			this.each(function() {
				jQuery.data( this, key, value );
			});
		}, null, value, arguments.length > 1, null, true );
	},

	removeData: function( key ) {
		return this.each(function() {
			jQuery.removeData( this, key );
		});
	}
});

function dataAttr( elem, key, data ) {
	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {

		var name = "data-" + key.replace( rmultiDash, "-$1" ).toLowerCase();

		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = data === "true" ? true :
					data === "false" ? false :
					data === "null" ? null :
					// Only convert to a number if it doesn't change the string
					+data + "" === data ? +data :
					rbrace.test( data ) ? jQuery.parseJSON( data ) :
						data;
			} catch( e ) {}

			// Make sure we set the data so it isn't changed later
			jQuery.data( elem, key, data );

		} else {
			data = undefined;
		}
	}

	return data;
}

// checks a cache object for emptiness
function isEmptyDataObject( obj ) {
	var name;
	for ( name in obj ) {

		// if the public data object is empty, the private is still empty
		if ( name === "data" && jQuery.isEmptyObject( obj[name] ) ) {
			continue;
		}
		if ( name !== "toJSON" ) {
			return false;
		}
	}

	return true;
}
jQuery.extend({
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = jQuery._data( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || jQuery.isArray(data) ) {
					queue = jQuery._data( elem, type, jQuery.makeArray(data) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		hooks.cur = fn;
		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// not intended for public consumption - generates a queueHooks object, or returns the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return jQuery._data( elem, key ) || jQuery._data( elem, key, {
			empty: jQuery.Callbacks("once memory").add(function() {
				jQuery._removeData( elem, type + "queue" );
				jQuery._removeData( elem, key );
			})
		});
	}
});

jQuery.fn.extend({
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[0], type );
		}

		return data === undefined ?
			this :
			this.each(function() {
				var queue = jQuery.queue( this, type, data );

				// ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[0] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			});
	},
	dequeue: function( type ) {
		return this.each(function() {
			jQuery.dequeue( this, type );
		});
	},
	// Based off of the plugin by Clint Helfers, with permission.
	// http://blindsignals.com/index.php/2009/07/jquery-delay/
	delay: function( time, type ) {
		time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
		type = type || "fx";

		return this.queue( type, function( next, hooks ) {
			var timeout = setTimeout( next, time );
			hooks.stop = function() {
				clearTimeout( timeout );
			};
		});
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},
	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while( i-- ) {
			tmp = jQuery._data( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
});
var nodeHook, boolHook,
	rclass = /[\t\r\n]/g,
	rreturn = /\r/g,
	rfocusable = /^(?:input|select|textarea|button|object)$/i,
	rclickable = /^(?:a|area)$/i,
	rboolean = /^(?:checked|selected|autofocus|autoplay|async|controls|defer|disabled|hidden|loop|multiple|open|readonly|required|scoped)$/i,
	ruseDefault = /^(?:checked|selected)$/i,
	getSetAttribute = jQuery.support.getSetAttribute,
	getSetInput = jQuery.support.input;

jQuery.fn.extend({
	attr: function( name, value ) {
		return jQuery.access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each(function() {
			jQuery.removeAttr( this, name );
		});
	},

	prop: function( name, value ) {
		return jQuery.access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		name = jQuery.propFix[ name ] || name;
		return this.each(function() {
			// try/catch handles cases where IE balks (such as removing a property on window)
			try {
				this[ name ] = undefined;
				delete this[ name ];
			} catch( e ) {}
		});
	},

	addClass: function( value ) {
		var classes, elem, cur, clazz, j,
			i = 0,
			len = this.length,
			proceed = typeof value === "string" && value;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).addClass( value.call( this, j, this.className ) );
			});
		}

		if ( proceed ) {
			// The disjunction here is for better compressibility (see removeClass)
			classes = ( value || "" ).match( core_rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					" "
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						if ( cur.indexOf( " " + clazz + " " ) < 0 ) {
							cur += clazz + " ";
						}
					}
					elem.className = jQuery.trim( cur );

				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var classes, elem, cur, clazz, j,
			i = 0,
			len = this.length,
			proceed = arguments.length === 0 || typeof value === "string" && value;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).removeClass( value.call( this, j, this.className ) );
			});
		}
		if ( proceed ) {
			classes = ( value || "" ).match( core_rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				// This expression is here for better compressibility (see addClass)
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					""
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						// Remove *all* instances
						while ( cur.indexOf( " " + clazz + " " ) >= 0 ) {
							cur = cur.replace( " " + clazz + " ", " " );
						}
					}
					elem.className = value ? jQuery.trim( cur ) : "";
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value,
			isBool = typeof stateVal === "boolean";

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( i ) {
				jQuery( this ).toggleClass( value.call(this, i, this.className, stateVal), stateVal );
			});
		}

		return this.each(function() {
			if ( type === "string" ) {
				// toggle individual class names
				var className,
					i = 0,
					self = jQuery( this ),
					state = stateVal,
					classNames = value.match( core_rnotwhite ) || [];

				while ( (className = classNames[ i++ ]) ) {
					// check each className given, space separated list
					state = isBool ? state : !self.hasClass( className );
					self[ state ? "addClass" : "removeClass" ]( className );
				}

			// Toggle whole class name
			} else if ( type === core_strundefined || type === "boolean" ) {
				if ( this.className ) {
					// store className if set
					jQuery._data( this, "__className__", this.className );
				}

				// If the element has a class name or if we're passed "false",
				// then remove the whole classname (if there was one, the above saved it).
				// Otherwise bring back whatever was previously saved (if anything),
				// falling back to the empty string if nothing was stored.
				this.className = this.className || value === false ? "" : jQuery._data( this, "__className__" ) || "";
			}
		});
	},

	hasClass: function( selector ) {
		var className = " " + selector + " ",
			i = 0,
			l = this.length;
		for ( ; i < l; i++ ) {
			if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) >= 0 ) {
				return true;
			}
		}

		return false;
	},

	val: function( value ) {
		var ret, hooks, isFunction,
			elem = this[0];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] || jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks && "get" in hooks && (ret = hooks.get( elem, "value" )) !== undefined ) {
					return ret;
				}

				ret = elem.value;

				return typeof ret === "string" ?
					// handle most common string cases
					ret.replace(rreturn, "") :
					// handle cases where value is null/undef or number
					ret == null ? "" : ret;
			}

			return;
		}

		isFunction = jQuery.isFunction( value );

		return this.each(function( i ) {
			var val,
				self = jQuery(this);

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( isFunction ) {
				val = value.call( this, i, self.val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";
			} else if ( typeof val === "number" ) {
				val += "";
			} else if ( jQuery.isArray( val ) ) {
				val = jQuery.map(val, function ( value ) {
					return value == null ? "" : value + "";
				});
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !("set" in hooks) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		});
	}
});

jQuery.extend({
	valHooks: {
		option: {
			get: function( elem ) {
				// attributes.value is undefined in Blackberry 4.7 but
				// uses .value. See #6932
				var val = elem.attributes.value;
				return !val || val.specified ? elem.value : elem.text;
			}
		},
		select: {
			get: function( elem ) {
				var value, option,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one" || index < 0,
					values = one ? null : [],
					max = one ? index + 1 : options.length,
					i = index < 0 ?
						max :
						one ? index : 0;

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// oldIE doesn't update selected after form reset (#2551)
					if ( ( option.selected || i === index ) &&
							// Don't return options that are disabled or in a disabled optgroup
							( jQuery.support.optDisabled ? !option.disabled : option.getAttribute("disabled") === null ) &&
							( !option.parentNode.disabled || !jQuery.nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var values = jQuery.makeArray( value );

				jQuery(elem).find("option").each(function() {
					this.selected = jQuery.inArray( jQuery(this).val(), values ) >= 0;
				});

				if ( !values.length ) {
					elem.selectedIndex = -1;
				}
				return values;
			}
		}
	},

	attr: function( elem, name, value ) {
		var hooks, notxml, ret,
			nType = elem.nodeType;

		// don't get/set attributes on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === core_strundefined ) {
			return jQuery.prop( elem, name, value );
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		// All attributes are lowercase
		// Grab necessary hook if one is defined
		if ( notxml ) {
			name = name.toLowerCase();
			hooks = jQuery.attrHooks[ name ] || ( rboolean.test( name ) ? boolHook : nodeHook );
		}

		if ( value !== undefined ) {

			if ( value === null ) {
				jQuery.removeAttr( elem, name );

			} else if ( hooks && notxml && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				elem.setAttribute( name, value + "" );
				return value;
			}

		} else if ( hooks && notxml && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
			return ret;

		} else {

			// In IE9+, Flash objects don't have .getAttribute (#12945)
			// Support: IE9+
			if ( typeof elem.getAttribute !== core_strundefined ) {
				ret =  elem.getAttribute( name );
			}

			// Non-existent attributes return null, we normalize to undefined
			return ret == null ?
				undefined :
				ret;
		}
	},

	removeAttr: function( elem, value ) {
		var name, propName,
			i = 0,
			attrNames = value && value.match( core_rnotwhite );

		if ( attrNames && elem.nodeType === 1 ) {
			while ( (name = attrNames[i++]) ) {
				propName = jQuery.propFix[ name ] || name;

				// Boolean attributes get special treatment (#10870)
				if ( rboolean.test( name ) ) {
					// Set corresponding property to false for boolean attributes
					// Also clear defaultChecked/defaultSelected (if appropriate) for IE<8
					if ( !getSetAttribute && ruseDefault.test( name ) ) {
						elem[ jQuery.camelCase( "default-" + name ) ] =
							elem[ propName ] = false;
					} else {
						elem[ propName ] = false;
					}

				// See #9699 for explanation of this approach (setting first, then removal)
				} else {
					jQuery.attr( elem, name, "" );
				}

				elem.removeAttribute( getSetAttribute ? name : propName );
			}
		}
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				if ( !jQuery.support.radioValue && value === "radio" && jQuery.nodeName(elem, "input") ) {
					// Setting the type on a radio button after the value resets the value in IE6-9
					// Reset value to default in case type is set after value during creation
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		}
	},

	propFix: {
		tabindex: "tabIndex",
		readonly: "readOnly",
		"for": "htmlFor",
		"class": "className",
		maxlength: "maxLength",
		cellspacing: "cellSpacing",
		cellpadding: "cellPadding",
		rowspan: "rowSpan",
		colspan: "colSpan",
		usemap: "useMap",
		frameborder: "frameBorder",
		contenteditable: "contentEditable"
	},

	prop: function( elem, name, value ) {
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// don't get/set properties on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		if ( notxml ) {
			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			if ( hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				return ( elem[ name ] = value );
			}

		} else {
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
				return ret;

			} else {
				return elem[ name ];
			}
		}
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {
				// elem.tabIndex doesn't always return the correct value when it hasn't been explicitly set
				// http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
				var attributeNode = elem.getAttributeNode("tabindex");

				return attributeNode && attributeNode.specified ?
					parseInt( attributeNode.value, 10 ) :
					rfocusable.test( elem.nodeName ) || rclickable.test( elem.nodeName ) && elem.href ?
						0 :
						undefined;
			}
		}
	}
});

// Hook for boolean attributes
boolHook = {
	get: function( elem, name ) {
		var
			// Use .prop to determine if this attribute is understood as boolean
			prop = jQuery.prop( elem, name ),

			// Fetch it accordingly
			attr = typeof prop === "boolean" && elem.getAttribute( name ),
			detail = typeof prop === "boolean" ?

				getSetInput && getSetAttribute ?
					attr != null :
					// oldIE fabricates an empty string for missing boolean attributes
					// and conflates checked/selected into attroperties
					ruseDefault.test( name ) ?
						elem[ jQuery.camelCase( "default-" + name ) ] :
						!!attr :

				// fetch an attribute node for properties not recognized as boolean
				elem.getAttributeNode( name );

		return detail && detail.value !== false ?
			name.toLowerCase() :
			undefined;
	},
	set: function( elem, value, name ) {
		if ( value === false ) {
			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else if ( getSetInput && getSetAttribute || !ruseDefault.test( name ) ) {
			// IE<8 needs the *property* name
			elem.setAttribute( !getSetAttribute && jQuery.propFix[ name ] || name, name );

		// Use defaultChecked and defaultSelected for oldIE
		} else {
			elem[ jQuery.camelCase( "default-" + name ) ] = elem[ name ] = true;
		}

		return name;
	}
};

// fix oldIE value attroperty
if ( !getSetInput || !getSetAttribute ) {
	jQuery.attrHooks.value = {
		get: function( elem, name ) {
			var ret = elem.getAttributeNode( name );
			return jQuery.nodeName( elem, "input" ) ?

				// Ignore the value *property* by using defaultValue
				elem.defaultValue :

				ret && ret.specified ? ret.value : undefined;
		},
		set: function( elem, value, name ) {
			if ( jQuery.nodeName( elem, "input" ) ) {
				// Does not return so that setAttribute is also used
				elem.defaultValue = value;
			} else {
				// Use nodeHook if defined (#1954); otherwise setAttribute is fine
				return nodeHook && nodeHook.set( elem, value, name );
			}
		}
	};
}

// IE6/7 do not support getting/setting some attributes with get/setAttribute
if ( !getSetAttribute ) {

	// Use this for any attribute in IE6/7
	// This fixes almost every IE6/7 issue
	nodeHook = jQuery.valHooks.button = {
		get: function( elem, name ) {
			var ret = elem.getAttributeNode( name );
			return ret && ( name === "id" || name === "name" || name === "coords" ? ret.value !== "" : ret.specified ) ?
				ret.value :
				undefined;
		},
		set: function( elem, value, name ) {
			// Set the existing or create a new attribute node
			var ret = elem.getAttributeNode( name );
			if ( !ret ) {
				elem.setAttributeNode(
					(ret = elem.ownerDocument.createAttribute( name ))
				);
			}

			ret.value = value += "";

			// Break association with cloned elements by also using setAttribute (#9646)
			return name === "value" || value === elem.getAttribute( name ) ?
				value :
				undefined;
		}
	};

	// Set contenteditable to false on removals(#10429)
	// Setting to empty string throws an error as an invalid value
	jQuery.attrHooks.contenteditable = {
		get: nodeHook.get,
		set: function( elem, value, name ) {
			nodeHook.set( elem, value === "" ? false : value, name );
		}
	};

	// Set width and height to auto instead of 0 on empty string( Bug #8150 )
	// This is for removals
	jQuery.each([ "width", "height" ], function( i, name ) {
		jQuery.attrHooks[ name ] = jQuery.extend( jQuery.attrHooks[ name ], {
			set: function( elem, value ) {
				if ( value === "" ) {
					elem.setAttribute( name, "auto" );
					return value;
				}
			}
		});
	});
}


// Some attributes require a special call on IE
// http://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !jQuery.support.hrefNormalized ) {
	jQuery.each([ "href", "src", "width", "height" ], function( i, name ) {
		jQuery.attrHooks[ name ] = jQuery.extend( jQuery.attrHooks[ name ], {
			get: function( elem ) {
				var ret = elem.getAttribute( name, 2 );
				return ret == null ? undefined : ret;
			}
		});
	});

	// href/src property should get the full normalized URL (#10299/#12915)
	jQuery.each([ "href", "src" ], function( i, name ) {
		jQuery.propHooks[ name ] = {
			get: function( elem ) {
				return elem.getAttribute( name, 4 );
			}
		};
	});
}

if ( !jQuery.support.style ) {
	jQuery.attrHooks.style = {
		get: function( elem ) {
			// Return undefined in the case of empty string
			// Note: IE uppercases css property names, but if we were to .toLowerCase()
			// .cssText, that would destroy case senstitivity in URL's, like in "background"
			return elem.style.cssText || undefined;
		},
		set: function( elem, value ) {
			return ( elem.style.cssText = value + "" );
		}
	};
}

// Safari mis-reports the default selected property of an option
// Accessing the parent's selectedIndex property fixes it
if ( !jQuery.support.optSelected ) {
	jQuery.propHooks.selected = jQuery.extend( jQuery.propHooks.selected, {
		get: function( elem ) {
			var parent = elem.parentNode;

			if ( parent ) {
				parent.selectedIndex;

				// Make sure that it also works with optgroups, see #5701
				if ( parent.parentNode ) {
					parent.parentNode.selectedIndex;
				}
			}
			return null;
		}
	});
}

// IE6/7 call enctype encoding
if ( !jQuery.support.enctype ) {
	jQuery.propFix.enctype = "encoding";
}

// Radios and checkboxes getter/setter
if ( !jQuery.support.checkOn ) {
	jQuery.each([ "radio", "checkbox" ], function() {
		jQuery.valHooks[ this ] = {
			get: function( elem ) {
				// Handle the case where in Webkit "" is returned instead of "on" if a value isn't specified
				return elem.getAttribute("value") === null ? "on" : elem.value;
			}
		};
	});
}
jQuery.each([ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = jQuery.extend( jQuery.valHooks[ this ], {
		set: function( elem, value ) {
			if ( jQuery.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0 );
			}
		}
	});
});
var rformElems = /^(?:input|select|textarea)$/i,
	rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|contextmenu)|click/,
	rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	rtypenamespace = /^([^.]*)(?:\.(.+)|)$/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	global: {},

	add: function( elem, types, handler, data, selector ) {
		var tmp, events, t, handleObjIn,
			special, eventHandle, handleObj,
			handlers, type, namespaces, origType,
			elemData = jQuery._data( elem );

		// Don't attach events to noData or text/comment nodes (but allow plain objects)
		if ( !elemData ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		if ( !(events = elemData.events) ) {
			events = elemData.events = {};
		}
		if ( !(eventHandle = elemData.handle) ) {
			eventHandle = elemData.handle = function( e ) {
				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== core_strundefined && (!e || jQuery.event.triggered !== e.type) ?
					jQuery.event.dispatch.apply( eventHandle.elem, arguments ) :
					undefined;
			};
			// Add elem as a property of the handle fn to prevent a memory leak with IE non-native events
			eventHandle.elem = elem;
		}

		// Handle multiple events separated by a space
		// jQuery(...).bind("mouseover mouseout", fn);
		types = ( types || "" ).match( core_rnotwhite ) || [""];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend({
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join(".")
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !(handlers = events[ type ]) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener/attachEvent if the special events handler returns false
				if ( !special.setup || special.setup.call( elem, data, namespaces, eventHandle ) === false ) {
					// Bind the global event handler to the element
					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle, false );

					} else if ( elem.attachEvent ) {
						elem.attachEvent( "on" + type, eventHandle );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

		// Nullify elem to prevent memory leaks in IE
		elem = null;
	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {
		var j, handleObj, tmp,
			origCount, t, events,
			special, handlers, type,
			namespaces, origType,
			elemData = jQuery.hasData( elem ) && jQuery._data( elem );

		if ( !elemData || !(events = elemData.events) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( core_rnotwhite ) || [""];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[2] && new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector || selector === "**" && handleObj.selector ) ) {
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( origCount && !handlers.length ) {
				if ( !special.teardown || special.teardown.call( elem, namespaces, elemData.handle ) === false ) {
					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			delete elemData.handle;

			// removeData also checks for emptiness and clears the expando if empty
			// so use it instead of delete
			jQuery._removeData( elem, "events" );
		}
	},

	trigger: function( event, data, elem, onlyHandlers ) {
		var handle, ontype, cur,
			bubbleType, special, tmp, i,
			eventPath = [ elem || document ],
			type = core_hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = core_hasOwn.call( event, "namespace" ) ? event.namespace.split(".") : [];

		cur = tmp = elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf(".") >= 0 ) {
			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split(".");
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf(":") < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		event.isTrigger = true;
		event.namespace = namespaces.join(".");
		event.namespace_re = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		if ( !onlyHandlers && !special.noBubble && !jQuery.isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === (elem.ownerDocument || document) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( (cur = eventPath[i++]) && !event.isPropagationStopped() ) {

			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// jQuery handler
			handle = ( jQuery._data( cur, "events" ) || {} )[ event.type ] && jQuery._data( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}

			// Native handler
			handle = ontype && cur[ ontype ];
			if ( handle && jQuery.acceptData( cur ) && handle.apply && handle.apply( cur, data ) === false ) {
				event.preventDefault();
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( (!special._default || special._default.apply( elem.ownerDocument, data ) === false) &&
				!(type === "click" && jQuery.nodeName( elem, "a" )) && jQuery.acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name name as the event.
				// Can't use an .isFunction() check here because IE6/7 fails that test.
				// Don't do default actions on window, that's where global variables be (#6170)
				if ( ontype && elem[ type ] && !jQuery.isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;
					try {
						elem[ type ]();
					} catch ( e ) {
						// IE<9 dies on focus/blur to hidden element (#1486,#12518)
						// only reproducible on winXP IE8 native, not IE9 in IE8 mode
					}
					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	dispatch: function( event ) {

		// Make a writable jQuery.Event from the native event object
		event = jQuery.event.fix( event );

		var i, ret, handleObj, matched, j,
			handlerQueue = [],
			args = core_slice.call( arguments ),
			handlers = ( jQuery._data( this, "events" ) || {} )[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[0] = event;
		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( (matched = handlerQueue[ i++ ]) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( (handleObj = matched.handlers[ j++ ]) && !event.isImmediatePropagationStopped() ) {

				// Triggered event must either 1) have no namespace, or
				// 2) have namespace(s) a subset or equal to those in the bound event (both can have no namespace).
				if ( !event.namespace_re || event.namespace_re.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( (jQuery.event.special[ handleObj.origType ] || {}).handle || handleObj.handler )
							.apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( (event.result = ret) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var sel, handleObj, matches, i,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

		// Find delegate handlers
		// Black-hole SVG <use> instance trees (#13180)
		// Avoid non-left-click bubbling in Firefox (#3861)
		if ( delegateCount && cur.nodeType && (!event.button || event.type !== "click") ) {

			for ( ; cur != this; cur = cur.parentNode || this ) {

				// Don't check non-elements (#13208)
				// Don't process clicks on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.nodeType === 1 && (cur.disabled !== true || event.type !== "click") ) {
					matches = [];
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

						// Don't conflict with Object.prototype properties (#13203)
						sel = handleObj.selector + " ";

						if ( matches[ sel ] === undefined ) {
							matches[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) >= 0 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matches[ sel ] ) {
							matches.push( handleObj );
						}
					}
					if ( matches.length ) {
						handlerQueue.push({ elem: cur, handlers: matches });
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		if ( delegateCount < handlers.length ) {
			handlerQueue.push({ elem: this, handlers: handlers.slice( delegateCount ) });
		}

		return handlerQueue;
	},

	fix: function( event ) {
		if ( event[ jQuery.expando ] ) {
			return event;
		}

		// Create a writable copy of the event object and normalize some properties
		var i, prop, copy,
			type = event.type,
			originalEvent = event,
			fixHook = this.fixHooks[ type ];

		if ( !fixHook ) {
			this.fixHooks[ type ] = fixHook =
				rmouseEvent.test( type ) ? this.mouseHooks :
				rkeyEvent.test( type ) ? this.keyHooks :
				{};
		}
		copy = fixHook.props ? this.props.concat( fixHook.props ) : this.props;

		event = new jQuery.Event( originalEvent );

		i = copy.length;
		while ( i-- ) {
			prop = copy[ i ];
			event[ prop ] = originalEvent[ prop ];
		}

		// Support: IE<9
		// Fix target property (#1925)
		if ( !event.target ) {
			event.target = originalEvent.srcElement || document;
		}

		// Support: Chrome 23+, Safari?
		// Target should not be a text node (#504, #13143)
		if ( event.target.nodeType === 3 ) {
			event.target = event.target.parentNode;
		}

		// Support: IE<9
		// For mouse/key events, metaKey==false if it's undefined (#3368, #11328)
		event.metaKey = !!event.metaKey;

		return fixHook.filter ? fixHook.filter( event, originalEvent ) : event;
	},

	// Includes some event props shared by KeyEvent and MouseEvent
	props: "altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),

	fixHooks: {},

	keyHooks: {
		props: "char charCode key keyCode".split(" "),
		filter: function( event, original ) {

			// Add which for key events
			if ( event.which == null ) {
				event.which = original.charCode != null ? original.charCode : original.keyCode;
			}

			return event;
		}
	},

	mouseHooks: {
		props: "button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
		filter: function( event, original ) {
			var body, eventDoc, doc,
				button = original.button,
				fromElement = original.fromElement;

			// Calculate pageX/Y if missing and clientX/Y available
			if ( event.pageX == null && original.clientX != null ) {
				eventDoc = event.target.ownerDocument || document;
				doc = eventDoc.documentElement;
				body = eventDoc.body;

				event.pageX = original.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
				event.pageY = original.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 ) - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
			}

			// Add relatedTarget, if necessary
			if ( !event.relatedTarget && fromElement ) {
				event.relatedTarget = fromElement === event.target ? original.toElement : fromElement;
			}

			// Add which for click: 1 === left; 2 === middle; 3 === right
			// Note: button is not normalized, so don't use it
			if ( !event.which && button !== undefined ) {
				event.which = ( button & 1 ? 1 : ( button & 2 ? 3 : ( button & 4 ? 2 : 0 ) ) );
			}

			return event;
		}
	},

	special: {
		load: {
			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		click: {
			// For checkbox, fire native event so checked state will be right
			trigger: function() {
				if ( jQuery.nodeName( this, "input" ) && this.type === "checkbox" && this.click ) {
					this.click();
					return false;
				}
			}
		},
		focus: {
			// Fire native event if possible so blur/focus sequence is correct
			trigger: function() {
				if ( this !== document.activeElement && this.focus ) {
					try {
						this.focus();
						return false;
					} catch ( e ) {
						// Support: IE<9
						// If we error on focus to hidden element (#1486, #12518),
						// let .trigger() run the handlers
					}
				}
			},
			delegateType: "focusin"
		},
		blur: {
			trigger: function() {
				if ( this === document.activeElement && this.blur ) {
					this.blur();
					return false;
				}
			},
			delegateType: "focusout"
		},

		beforeunload: {
			postDispatch: function( event ) {

				// Even when returnValue equals to undefined Firefox will still show alert
				if ( event.result !== undefined ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	},

	simulate: function( type, elem, event, bubble ) {
		// Piggyback on a donor event to simulate a different one.
		// Fake originalEvent to avoid donor's stopPropagation, but if the
		// simulated event prevents default then we do the same on the donor.
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{ type: type,
				isSimulated: true,
				originalEvent: {}
			}
		);
		if ( bubble ) {
			jQuery.event.trigger( e, null, elem );
		} else {
			jQuery.event.dispatch.call( elem, e );
		}
		if ( e.isDefaultPrevented() ) {
			event.preventDefault();
		}
	}
};

jQuery.removeEvent = document.removeEventListener ?
	function( elem, type, handle ) {
		if ( elem.removeEventListener ) {
			elem.removeEventListener( type, handle, false );
		}
	} :
	function( elem, type, handle ) {
		var name = "on" + type;

		if ( elem.detachEvent ) {

			// #8545, #7054, preventing memory leaks for custom events in IE6-8
			// detachEvent needed property on element, by name of that event, to properly expose it to GC
			if ( typeof elem[ name ] === core_strundefined ) {
				elem[ name ] = null;
			}

			elem.detachEvent( name, handle );
		}
	};

jQuery.Event = function( src, props ) {
	// Allow instantiation without the 'new' keyword
	if ( !(this instanceof jQuery.Event) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = ( src.defaultPrevented || src.returnValue === false ||
			src.getPreventDefault && src.getPreventDefault() ) ? returnTrue : returnFalse;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || jQuery.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;
		if ( !e ) {
			return;
		}

		// If preventDefault exists, run it on the original event
		if ( e.preventDefault ) {
			e.preventDefault();

		// Support: IE
		// Otherwise set the returnValue property of the original event to false
		} else {
			e.returnValue = false;
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;
		if ( !e ) {
			return;
		}
		// If stopPropagation exists, run it on the original event
		if ( e.stopPropagation ) {
			e.stopPropagation();
		}

		// Support: IE
		// Set the cancelBubble property of the original event to true
		e.cancelBubble = true;
	},
	stopImmediatePropagation: function() {
		this.isImmediatePropagationStopped = returnTrue;
		this.stopPropagation();
	}
};

// Create mouseenter/leave events using mouseover/out and event-time checks
jQuery.each({
	mouseenter: "mouseover",
	mouseleave: "mouseout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mousenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || (related !== target && !jQuery.contains( target, related )) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
});

// IE submit delegation
if ( !jQuery.support.submitBubbles ) {

	jQuery.event.special.submit = {
		setup: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Lazy-add a submit handler when a descendant form may potentially be submitted
			jQuery.event.add( this, "click._submit keypress._submit", function( e ) {
				// Node name check avoids a VML-related crash in IE (#9807)
				var elem = e.target,
					form = jQuery.nodeName( elem, "input" ) || jQuery.nodeName( elem, "button" ) ? elem.form : undefined;
				if ( form && !jQuery._data( form, "submitBubbles" ) ) {
					jQuery.event.add( form, "submit._submit", function( event ) {
						event._submit_bubble = true;
					});
					jQuery._data( form, "submitBubbles", true );
				}
			});
			// return undefined since we don't need an event listener
		},

		postDispatch: function( event ) {
			// If form was submitted by the user, bubble the event up the tree
			if ( event._submit_bubble ) {
				delete event._submit_bubble;
				if ( this.parentNode && !event.isTrigger ) {
					jQuery.event.simulate( "submit", this.parentNode, event, true );
				}
			}
		},

		teardown: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Remove delegated handlers; cleanData eventually reaps submit handlers attached above
			jQuery.event.remove( this, "._submit" );
		}
	};
}

// IE change delegation and checkbox/radio fix
if ( !jQuery.support.changeBubbles ) {

	jQuery.event.special.change = {

		setup: function() {

			if ( rformElems.test( this.nodeName ) ) {
				// IE doesn't fire change on a check/radio until blur; trigger it on click
				// after a propertychange. Eat the blur-change in special.change.handle.
				// This still fires onchange a second time for check/radio after blur.
				if ( this.type === "checkbox" || this.type === "radio" ) {
					jQuery.event.add( this, "propertychange._change", function( event ) {
						if ( event.originalEvent.propertyName === "checked" ) {
							this._just_changed = true;
						}
					});
					jQuery.event.add( this, "click._change", function( event ) {
						if ( this._just_changed && !event.isTrigger ) {
							this._just_changed = false;
						}
						// Allow triggered, simulated change events (#11500)
						jQuery.event.simulate( "change", this, event, true );
					});
				}
				return false;
			}
			// Delegated event; lazy-add a change handler on descendant inputs
			jQuery.event.add( this, "beforeactivate._change", function( e ) {
				var elem = e.target;

				if ( rformElems.test( elem.nodeName ) && !jQuery._data( elem, "changeBubbles" ) ) {
					jQuery.event.add( elem, "change._change", function( event ) {
						if ( this.parentNode && !event.isSimulated && !event.isTrigger ) {
							jQuery.event.simulate( "change", this.parentNode, event, true );
						}
					});
					jQuery._data( elem, "changeBubbles", true );
				}
			});
		},

		handle: function( event ) {
			var elem = event.target;

			// Swallow native change events from checkbox/radio, we already triggered them above
			if ( this !== elem || event.isSimulated || event.isTrigger || (elem.type !== "radio" && elem.type !== "checkbox") ) {
				return event.handleObj.handler.apply( this, arguments );
			}
		},

		teardown: function() {
			jQuery.event.remove( this, "._change" );

			return !rformElems.test( this.nodeName );
		}
	};
}

// Create "bubbling" focus and blur events
if ( !jQuery.support.focusinBubbles ) {
	jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler while someone wants focusin/focusout
		var attaches = 0,
			handler = function( event ) {
				jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ), true );
			};

		jQuery.event.special[ fix ] = {
			setup: function() {
				if ( attaches++ === 0 ) {
					document.addEventListener( orig, handler, true );
				}
			},
			teardown: function() {
				if ( --attaches === 0 ) {
					document.removeEventListener( orig, handler, true );
				}
			}
		};
	});
}

jQuery.fn.extend({

	on: function( types, selector, data, fn, /*INTERNAL*/ one ) {
		var type, origFn;

		// Types can be a map of types/handlers
		if ( typeof types === "object" ) {
			// ( types-Object, selector, data )
			if ( typeof selector !== "string" ) {
				// ( types-Object, data )
				data = data || selector;
				selector = undefined;
			}
			for ( type in types ) {
				this.on( type, selector, data, types[ type ], one );
			}
			return this;
		}

		if ( data == null && fn == null ) {
			// ( types, fn )
			fn = selector;
			data = selector = undefined;
		} else if ( fn == null ) {
			if ( typeof selector === "string" ) {
				// ( types, selector, fn )
				fn = data;
				data = undefined;
			} else {
				// ( types, data, fn )
				fn = data;
				data = selector;
				selector = undefined;
			}
		}
		if ( fn === false ) {
			fn = returnFalse;
		} else if ( !fn ) {
			return this;
		}

		if ( one === 1 ) {
			origFn = fn;
			fn = function( event ) {
				// Can use an empty set, since event contains the info
				jQuery().off( event );
				return origFn.apply( this, arguments );
			};
			// Use same guid so caller can remove using origFn
			fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
		}
		return this.each( function() {
			jQuery.event.add( this, types, fn, data, selector );
		});
	},
	one: function( types, selector, data, fn ) {
		return this.on( types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {
			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {
			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {
			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each(function() {
			jQuery.event.remove( this, types, fn, selector );
		});
	},

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {
		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ? this.off( selector, "**" ) : this.off( types, selector || "**", fn );
	},

	trigger: function( type, data ) {
		return this.each(function() {
			jQuery.event.trigger( type, data, this );
		});
	},
	triggerHandler: function( type, data ) {
		var elem = this[0];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
});
/*!
 * Sizzle CSS Selector Engine
 * Copyright 2012 jQuery Foundation and other contributors
 * Released under the MIT license
 * http://sizzlejs.com/
 */
(function( window, undefined ) {

var i,
	cachedruns,
	Expr,
	getText,
	isXML,
	compile,
	hasDuplicate,
	outermostContext,

	// Local document vars
	setDocument,
	document,
	docElem,
	documentIsXML,
	rbuggyQSA,
	rbuggyMatches,
	matches,
	contains,
	sortOrder,

	// Instance-specific data
	expando = "sizzle" + -(new Date()),
	preferredDoc = window.document,
	support = {},
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),

	// General-purpose constants
	strundefined = typeof undefined,
	MAX_NEGATIVE = 1 << 31,

	// Array methods
	arr = [],
	pop = arr.pop,
	push = arr.push,
	slice = arr.slice,
	// Use a stripped-down indexOf if we can't use a native one
	indexOf = arr.indexOf || function( elem ) {
		var i = 0,
			len = this.length;
		for ( ; i < len; i++ ) {
			if ( this[i] === elem ) {
				return i;
			}
		}
		return -1;
	},


	// Regular expressions

	// Whitespace characters http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",
	// http://www.w3.org/TR/css3-syntax/#characters
	characterEncoding = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",

	// Loosely modeled on CSS identifier characters
	// An unquoted value should be a CSS identifier http://www.w3.org/TR/css3-selectors/#attribute-selectors
	// Proper syntax: http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
	identifier = characterEncoding.replace( "w", "w#" ),

	// Acceptable operators http://www.w3.org/TR/selectors/#attribute-selectors
	operators = "([*^$|!~]?=)",
	attributes = "\\[" + whitespace + "*(" + characterEncoding + ")" + whitespace +
		"*(?:" + operators + whitespace + "*(?:(['\"])((?:\\\\.|[^\\\\])*?)\\3|(" + identifier + ")|)|)" + whitespace + "*\\]",

	// Prefer arguments quoted,
	//   then not containing pseudos/brackets,
	//   then attribute selectors/non-parenthetical expressions,
	//   then anything else
	// These preferences are here to reduce the number of selectors
	//   needing tokenize in the PSEUDO preFilter
	pseudos = ":(" + characterEncoding + ")(?:\\(((['\"])((?:\\\\.|[^\\\\])*?)\\3|((?:\\\\.|[^\\\\()[\\]]|" + attributes.replace( 3, 8 ) + ")*)|.*)\\)|)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([\\x20\\t\\r\\n\\f>+~])" + whitespace + "*" ),
	rpseudo = new RegExp( pseudos ),
	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = {
		"ID": new RegExp( "^#(" + characterEncoding + ")" ),
		"CLASS": new RegExp( "^\\.(" + characterEncoding + ")" ),
		"NAME": new RegExp( "^\\[name=['\"]?(" + characterEncoding + ")['\"]?\\]" ),
		"TAG": new RegExp( "^(" + characterEncoding.replace( "w", "w*" ) + ")" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace +
			"*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
			"*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		"needsContext": new RegExp( "^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" +
			whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	},

	rsibling = /[\x20\t\r\n\f]*[+~]/,

	rnative = /^[^{]+\{\s*\[native code/,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	rescape = /'|\\/g,
	rattributeQuotes = /\=[\x20\t\r\n\f]*([^'"\]]*)[\x20\t\r\n\f]*\]/g,

	// CSS escapes http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
	runescape = /\\([\da-fA-F]{1,6}[\x20\t\r\n\f]?|.)/g,
	funescape = function( _, escaped ) {
		var high = "0x" + escaped - 0x10000;
		// NaN means non-codepoint
		return high !== high ?
			escaped :
			// BMP codepoint
			high < 0 ?
				String.fromCharCode( high + 0x10000 ) :
				// Supplemental Plane codepoint (surrogate pair)
				String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	};

// Use a stripped-down slice if we can't use a native one
try {
	slice.call( preferredDoc.documentElement.childNodes, 0 )[0].nodeType;
} catch ( e ) {
	slice = function( i ) {
		var elem,
			results = [];
		while ( (elem = this[i++]) ) {
			results.push( elem );
		}
		return results;
	};
}

/**
 * For feature detection
 * @param {Function} fn The function to test for native support
 */
function isNative( fn ) {
	return rnative.test( fn + "" );
}

/**
 * Create key-value caches of limited size
 * @returns {Function(string, Object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var cache,
		keys = [];

	return (cache = function( key, value ) {
		// Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
		if ( keys.push( key += " " ) > Expr.cacheLength ) {
			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return (cache[ key ] = value);
	});
}

/**
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ expando ] = true;
	return fn;
}

/**
 * Support testing using an element
 * @param {Function} fn Passed the created div and expects a boolean result
 */
function assert( fn ) {
	var div = document.createElement("div");

	try {
		return fn( div );
	} catch (e) {
		return false;
	} finally {
		// release memory in IE
		div = null;
	}
}

function Sizzle( selector, context, results, seed ) {
	var match, elem, m, nodeType,
		// QSA vars
		i, groups, old, nid, newContext, newSelector;

	if ( ( context ? context.ownerDocument || context : preferredDoc ) !== document ) {
		setDocument( context );
	}

	context = context || document;
	results = results || [];

	if ( !selector || typeof selector !== "string" ) {
		return results;
	}

	if ( (nodeType = context.nodeType) !== 1 && nodeType !== 9 ) {
		return [];
	}

	if ( !documentIsXML && !seed ) {

		// Shortcuts
		if ( (match = rquickExpr.exec( selector )) ) {
			// Speed-up: Sizzle("#ID")
			if ( (m = match[1]) ) {
				if ( nodeType === 9 ) {
					elem = context.getElementById( m );
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					if ( elem && elem.parentNode ) {
						// Handle the case where IE, Opera, and Webkit return items
						// by name instead of ID
						if ( elem.id === m ) {
							results.push( elem );
							return results;
						}
					} else {
						return results;
					}
				} else {
					// Context is not a document
					if ( context.ownerDocument && (elem = context.ownerDocument.getElementById( m )) &&
						contains( context, elem ) && elem.id === m ) {
						results.push( elem );
						return results;
					}
				}

			// Speed-up: Sizzle("TAG")
			} else if ( match[2] ) {
				push.apply( results, slice.call(context.getElementsByTagName( selector ), 0) );
				return results;

			// Speed-up: Sizzle(".CLASS")
			} else if ( (m = match[3]) && support.getByClassName && context.getElementsByClassName ) {
				push.apply( results, slice.call(context.getElementsByClassName( m ), 0) );
				return results;
			}
		}

		// QSA path
		if ( support.qsa && !rbuggyQSA.test(selector) ) {
			old = true;
			nid = expando;
			newContext = context;
			newSelector = nodeType === 9 && selector;

			// qSA works strangely on Element-rooted queries
			// We can work around this by specifying an extra ID on the root
			// and working up from there (Thanks to Andrew Dupont for the technique)
			// IE 8 doesn't work on object elements
			if ( nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
				groups = tokenize( selector );

				if ( (old = context.getAttribute("id")) ) {
					nid = old.replace( rescape, "\\$&" );
				} else {
					context.setAttribute( "id", nid );
				}
				nid = "[id='" + nid + "'] ";

				i = groups.length;
				while ( i-- ) {
					groups[i] = nid + toSelector( groups[i] );
				}
				newContext = rsibling.test( selector ) && context.parentNode || context;
				newSelector = groups.join(",");
			}

			if ( newSelector ) {
				try {
					push.apply( results, slice.call( newContext.querySelectorAll(
						newSelector
					), 0 ) );
					return results;
				} catch(qsaError) {
				} finally {
					if ( !old ) {
						context.removeAttribute("id");
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/**
 * Detect xml
 * @param {Element|Object} elem An element or a document
 */
isXML = Sizzle.isXML = function( elem ) {
	// documentElement is verified for cases where it doesn't yet exist
	// (such as loading iframes in IE - #4833)
	var documentElement = elem && (elem.ownerDocument || elem).documentElement;
	return documentElement ? documentElement.nodeName !== "HTML" : false;
};

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
	var doc = node ? node.ownerDocument || node : preferredDoc;

	// If no document and documentElement is available, return
	if ( doc === document || doc.nodeType !== 9 || !doc.documentElement ) {
		return document;
	}

	// Set our document
	document = doc;
	docElem = doc.documentElement;

	// Support tests
	documentIsXML = isXML( doc );

	// Check if getElementsByTagName("*") returns only elements
	support.tagNameNoComments = assert(function( div ) {
		div.appendChild( doc.createComment("") );
		return !div.getElementsByTagName("*").length;
	});

	// Check if attributes should be retrieved by attribute nodes
	support.attributes = assert(function( div ) {
		div.innerHTML = "<select></select>";
		var type = typeof div.lastChild.getAttribute("multiple");
		// IE8 returns a string for some attributes even when not present
		return type !== "boolean" && type !== "string";
	});

	// Check if getElementsByClassName can be trusted
	support.getByClassName = assert(function( div ) {
		// Opera can't find a second classname (in 9.6)
		div.innerHTML = "<div class='hidden e'></div><div class='hidden'></div>";
		if ( !div.getElementsByClassName || !div.getElementsByClassName("e").length ) {
			return false;
		}

		// Safari 3.2 caches class attributes and doesn't catch changes
		div.lastChild.className = "e";
		return div.getElementsByClassName("e").length === 2;
	});

	// Check if getElementById returns elements by name
	// Check if getElementsByName privileges form controls or returns elements by ID
	support.getByName = assert(function( div ) {
		// Inject content
		div.id = expando + 0;
		div.innerHTML = "<a name='" + expando + "'></a><div name='" + expando + "'></div>";
		docElem.insertBefore( div, docElem.firstChild );

		// Test
		var pass = doc.getElementsByName &&
			// buggy browsers will return fewer than the correct 2
			doc.getElementsByName( expando ).length === 2 +
			// buggy browsers will return more than the correct 0
			doc.getElementsByName( expando + 0 ).length;
		support.getIdNotName = !doc.getElementById( expando );

		// Cleanup
		docElem.removeChild( div );

		return pass;
	});

	// IE6/7 return modified attributes
	Expr.attrHandle = assert(function( div ) {
		div.innerHTML = "<a href='#'></a>";
		return div.firstChild && typeof div.firstChild.getAttribute !== strundefined &&
			div.firstChild.getAttribute("href") === "#";
	}) ?
		{} :
		{
			"href": function( elem ) {
				return elem.getAttribute( "href", 2 );
			},
			"type": function( elem ) {
				return elem.getAttribute("type");
			}
		};

	// ID find and filter
	if ( support.getIdNotName ) {
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== strundefined && !documentIsXML ) {
				var m = context.getElementById( id );
				// Check parentNode to catch when Blackberry 4.6 returns
				// nodes that are no longer in the document #6963
				return m && m.parentNode ? [m] : [];
			}
		};
		Expr.filter["ID"] = function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				return elem.getAttribute("id") === attrId;
			};
		};
	} else {
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== strundefined && !documentIsXML ) {
				var m = context.getElementById( id );

				return m ?
					m.id === id || typeof m.getAttributeNode !== strundefined && m.getAttributeNode("id").value === id ?
						[m] :
						undefined :
					[];
			}
		};
		Expr.filter["ID"] =  function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				var node = typeof elem.getAttributeNode !== strundefined && elem.getAttributeNode("id");
				return node && node.value === attrId;
			};
		};
	}

	// Tag
	Expr.find["TAG"] = support.tagNameNoComments ?
		function( tag, context ) {
			if ( typeof context.getElementsByTagName !== strundefined ) {
				return context.getElementsByTagName( tag );
			}
		} :
		function( tag, context ) {
			var elem,
				tmp = [],
				i = 0,
				results = context.getElementsByTagName( tag );

			// Filter out possible comments
			if ( tag === "*" ) {
				while ( (elem = results[i++]) ) {
					if ( elem.nodeType === 1 ) {
						tmp.push( elem );
					}
				}

				return tmp;
			}
			return results;
		};

	// Name
	Expr.find["NAME"] = support.getByName && function( tag, context ) {
		if ( typeof context.getElementsByName !== strundefined ) {
			return context.getElementsByName( name );
		}
	};

	// Class
	Expr.find["CLASS"] = support.getByClassName && function( className, context ) {
		if ( typeof context.getElementsByClassName !== strundefined && !documentIsXML ) {
			return context.getElementsByClassName( className );
		}
	};

	// QSA and matchesSelector support

	// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
	rbuggyMatches = [];

	// qSa(:focus) reports false when true (Chrome 21),
	// no need to also add to buggyMatches since matches checks buggyQSA
	// A support test would require too much code (would include document ready)
	rbuggyQSA = [ ":focus" ];

	if ( (support.qsa = isNative(doc.querySelectorAll)) ) {
		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert(function( div ) {
			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explictly
			// setting a boolean content attribute,
			// since its presence should be enough
			// http://bugs.jquery.com/ticket/12359
			div.innerHTML = "<select><option selected=''></option></select>";

			// IE8 - Some boolean attributes are not treated correctly
			if ( !div.querySelectorAll("[selected]").length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:checked|disabled|ismap|multiple|readonly|selected|value)" );
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":checked").length ) {
				rbuggyQSA.push(":checked");
			}
		});

		assert(function( div ) {

			// Opera 10-12/IE8 - ^= $= *= and empty values
			// Should not select anything
			div.innerHTML = "<input type='hidden' i=''/>";
			if ( div.querySelectorAll("[i^='']").length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:\"\"|'')" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":enabled").length ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Opera 10-11 does not throw on post-comma invalid pseudos
			div.querySelectorAll("*,:x");
			rbuggyQSA.push(",.*:");
		});
	}

	if ( (support.matchesSelector = isNative( (matches = docElem.matchesSelector ||
		docElem.mozMatchesSelector ||
		docElem.webkitMatchesSelector ||
		docElem.oMatchesSelector ||
		docElem.msMatchesSelector) )) ) {

		assert(function( div ) {
			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9)
			support.disconnectedMatch = matches.call( div, "div" );

			// This should fail with an exception
			// Gecko does not error, returns false instead
			matches.call( div, "[s!='']:x" );
			rbuggyMatches.push( "!=", pseudos );
		});
	}

	rbuggyQSA = new RegExp( rbuggyQSA.join("|") );
	rbuggyMatches = new RegExp( rbuggyMatches.join("|") );

	// Element contains another
	// Purposefully does not implement inclusive descendent
	// As in, an element does not contain itself
	contains = isNative(docElem.contains) || docElem.compareDocumentPosition ?
		function( a, b ) {
			var adown = a.nodeType === 9 ? a.documentElement : a,
				bup = b && b.parentNode;
			return a === bup || !!( bup && bup.nodeType === 1 && (
				adown.contains ?
					adown.contains( bup ) :
					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
			));
		} :
		function( a, b ) {
			if ( b ) {
				while ( (b = b.parentNode) ) {
					if ( b === a ) {
						return true;
					}
				}
			}
			return false;
		};

	// Document order sorting
	sortOrder = docElem.compareDocumentPosition ?
	function( a, b ) {
		var compare;

		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		if ( (compare = b.compareDocumentPosition && a.compareDocumentPosition && a.compareDocumentPosition( b )) ) {
			if ( compare & 1 || a.parentNode && a.parentNode.nodeType === 11 ) {
				if ( a === doc || contains( preferredDoc, a ) ) {
					return -1;
				}
				if ( b === doc || contains( preferredDoc, b ) ) {
					return 1;
				}
				return 0;
			}
			return compare & 4 ? -1 : 1;
		}

		return a.compareDocumentPosition ? -1 : 1;
	} :
	function( a, b ) {
		var cur,
			i = 0,
			aup = a.parentNode,
			bup = b.parentNode,
			ap = [ a ],
			bp = [ b ];

		// Exit early if the nodes are identical
		if ( a === b ) {
			hasDuplicate = true;
			return 0;

		// Parentless nodes are either documents or disconnected
		} else if ( !aup || !bup ) {
			return a === doc ? -1 :
				b === doc ? 1 :
				aup ? -1 :
				bup ? 1 :
				0;

		// If the nodes are siblings, we can do a quick check
		} else if ( aup === bup ) {
			return siblingCheck( a, b );
		}

		// Otherwise we need full lists of their ancestors for comparison
		cur = a;
		while ( (cur = cur.parentNode) ) {
			ap.unshift( cur );
		}
		cur = b;
		while ( (cur = cur.parentNode) ) {
			bp.unshift( cur );
		}

		// Walk down the tree looking for a discrepancy
		while ( ap[i] === bp[i] ) {
			i++;
		}

		return i ?
			// Do a sibling check if the nodes have a common ancestor
			siblingCheck( ap[i], bp[i] ) :

			// Otherwise nodes in our document sort first
			ap[i] === preferredDoc ? -1 :
			bp[i] === preferredDoc ? 1 :
			0;
	};

	// Always assume the presence of duplicates if sort doesn't
	// pass them to our comparison function (as in Google Chrome).
	hasDuplicate = false;
	[0, 0].sort( sortOrder );
	support.detectDuplicates = hasDuplicate;

	return document;
};

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	// Make sure that attribute selectors are quoted
	expr = expr.replace( rattributeQuotes, "='$1']" );

	// rbuggyQSA always contains :focus, so no need for an existence check
	if ( support.matchesSelector && !documentIsXML && (!rbuggyMatches || !rbuggyMatches.test(expr)) && !rbuggyQSA.test(expr) ) {
		try {
			var ret = matches.call( elem, expr );

			// IE 9's matchesSelector returns false on disconnected nodes
			if ( ret || support.disconnectedMatch ||
					// As well, disconnected nodes are said to be in a document
					// fragment in IE 9
					elem.document && elem.document.nodeType !== 11 ) {
				return ret;
			}
		} catch(e) {}
	}

	return Sizzle( expr, document, null, [elem] ).length > 0;
};

Sizzle.contains = function( context, elem ) {
	// Set document vars if needed
	if ( ( context.ownerDocument || context ) !== document ) {
		setDocument( context );
	}
	return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {
	var val;

	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	if ( !documentIsXML ) {
		name = name.toLowerCase();
	}
	if ( (val = Expr.attrHandle[ name ]) ) {
		return val( elem );
	}
	if ( documentIsXML || support.attributes ) {
		return elem.getAttribute( name );
	}
	return ( (val = elem.getAttributeNode( name )) || elem.getAttribute( name ) ) && elem[ name ] === true ?
		name :
		val && val.specified ? val.value : null;
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

// Document sorting and removing duplicates
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		i = 1,
		j = 0;

	// Unless we *know* we can detect duplicates, assume their presence
	hasDuplicate = !support.detectDuplicates;
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		for ( ; (elem = results[i]); i++ ) {
			if ( elem === results[ i - 1 ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	return results;
};

function siblingCheck( a, b ) {
	var cur = b && a,
		diff = cur && ( ~b.sourceIndex || MAX_NEGATIVE ) - ( ~a.sourceIndex || MAX_NEGATIVE );

	// Use IE sourceIndex if available on both nodes
	if ( diff ) {
		return diff;
	}

	// Check if b follows a
	if ( cur ) {
		while ( (cur = cur.nextSibling) ) {
			if ( cur === b ) {
				return -1;
			}
		}
	}

	return a ? 1 : -1;
}

// Returns a function to use in pseudos for input types
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

// Returns a function to use in pseudos for buttons
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return (name === "input" || name === "button") && elem.type === type;
	};
}

// Returns a function to use in pseudos for positionals
function createPositionalPseudo( fn ) {
	return markFunction(function( argument ) {
		argument = +argument;
		return markFunction(function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ (j = matchIndexes[i]) ] ) {
					seed[j] = !(matches[j] = seed[j]);
				}
			}
		});
	});
}

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( !nodeType ) {
		// If no nodeType, this is expected to be an array
		for ( ; (node = elem[i]); i++ ) {
			// Do not traverse comment nodes
			ret += getText( node );
		}
	} else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
		// Use textContent for elements
		// innerText usage removed for consistency of new lines (see #11153)
		if ( typeof elem.textContent === "string" ) {
			return elem.textContent;
		} else {
			// Traverse its children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				ret += getText( elem );
			}
		}
	} else if ( nodeType === 3 || nodeType === 4 ) {
		return elem.nodeValue;
	}
	// Do not include comment or processing instruction nodes

	return ret;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	find: {},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[1] = match[1].replace( runescape, funescape );

			// Move the given value to match[3] whether quoted or unquoted
			match[3] = ( match[4] || match[5] || "" ).replace( runescape, funescape );

			if ( match[2] === "~=" ) {
				match[3] = " " + match[3] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {
			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 what (child|of-type)
				3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				4 xn-component of xn+y argument ([+-]?\d*n|)
				5 sign of xn-component
				6 x of xn-component
				7 sign of y-component
				8 y of y-component
			*/
			match[1] = match[1].toLowerCase();

			if ( match[1].slice( 0, 3 ) === "nth" ) {
				// nth-* requires argument
				if ( !match[3] ) {
					Sizzle.error( match[0] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[4] = +( match[4] ? match[5] + (match[6] || 1) : 2 * ( match[3] === "even" || match[3] === "odd" ) );
				match[5] = +( ( match[7] + match[8] ) || match[3] === "odd" );

			// other types prohibit arguments
			} else if ( match[3] ) {
				Sizzle.error( match[0] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var excess,
				unquoted = !match[5] && match[2];

			if ( matchExpr["CHILD"].test( match[0] ) ) {
				return null;
			}

			// Accept quoted arguments as-is
			if ( match[4] ) {
				match[2] = match[4];

			// Strip excess characters from unquoted arguments
			} else if ( unquoted && rpseudo.test( unquoted ) &&
				// Get excess from tokenize (recursively)
				(excess = tokenize( unquoted, true )) &&
				// advance to the next closing parenthesis
				(excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

				// excess is a negative index
				match[0] = match[0].slice( 0, excess );
				match[2] = unquoted.slice( 0, excess );
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {

		"TAG": function( nodeName ) {
			if ( nodeName === "*" ) {
				return function() { return true; };
			}

			nodeName = nodeName.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
			};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				(pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
				classCache( className, function( elem ) {
					return pattern.test( elem.className || (typeof elem.getAttribute !== strundefined && elem.getAttribute("class")) || "" );
				});
		},

		"ATTR": function( name, operator, check ) {
			return function( elem ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.slice( -check.length ) === check :
					operator === "~=" ? ( " " + result + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
					false;
			};
		},

		"CHILD": function( type, what, argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, context, xml ) {
					var cache, outerCache, node, diff, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( (node = node[ dir ]) ) {
									if ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) {
										return false;
									}
								}
								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {
							// Seek `elem` from a previously-cached index
							outerCache = parent[ expando ] || (parent[ expando ] = {});
							cache = outerCache[ type ] || [];
							nodeIndex = cache[0] === dirruns && cache[1];
							diff = cache[0] === dirruns && cache[2];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( (node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								(diff = nodeIndex = 0) || start.pop()) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									outerCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						// Use previously-cached element index if available
						} else if ( useCache && (cache = (elem[ expando ] || (elem[ expando ] = {}))[ type ]) && cache[0] === dirruns ) {
							diff = cache[1];

						// xml :nth-child(...) or :nth-last-child(...) or :nth(-last)?-of-type(...)
						} else {
							// Use the same loop as above to seek `elem` from the start
							while ( (node = ++nodeIndex && node && node[ dir ] ||
								(diff = nodeIndex = 0) || start.pop()) ) {

								if ( ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) && ++diff ) {
									// Cache the index of each encountered element
									if ( useCache ) {
										(node[ expando ] || (node[ expando ] = {}))[ type ] = [ dirruns, diff ];
									}

									if ( node === elem ) {
										break;
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		"PSEUDO": function( pseudo, argument ) {
			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction(function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf.call( seed, matched[i] );
							seed[ idx ] = !( matches[ idx ] = matched[i] );
						}
					}) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {
		// Potentially complex pseudos
		"not": markFunction(function( selector ) {
			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction(function( seed, matches, context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( (elem = unmatched[i]) ) {
							seed[i] = !(matches[i] = elem);
						}
					}
				}) :
				function( elem, context, xml ) {
					input[0] = elem;
					matcher( input, null, xml, results );
					return !results.pop();
				};
		}),

		"has": markFunction(function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		}),

		"contains": markFunction(function( text ) {
			return function( elem ) {
				return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
			};
		}),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// http://www.w3.org/TR/selectors/#lang-pseudo
		"lang": markFunction( function( lang ) {
			// lang value must be a valid identifider
			if ( !ridentifier.test(lang || "") ) {
				Sizzle.error( "unsupported lang: " + lang );
			}
			lang = lang.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( (elemLang = documentIsXML ?
						elem.getAttribute("xml:lang") || elem.getAttribute("lang") :
						elem.lang) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( (elem = elem.parentNode) && elem.nodeType === 1 );
				return false;
			};
		}),

		// Miscellaneous
		"target": function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		"root": function( elem ) {
			return elem === docElem;
		},

		"focus": function( elem ) {
			return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
		},

		// Boolean properties
		"enabled": function( elem ) {
			return elem.disabled === false;
		},

		"disabled": function( elem ) {
			return elem.disabled === true;
		},

		"checked": function( elem ) {
			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
		},

		"selected": function( elem ) {
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		"empty": function( elem ) {
			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is only affected by element nodes and content nodes(including text(3), cdata(4)),
			//   not comment, processing instructions, or others
			// Thanks to Diego Perini for the nodeName shortcut
			//   Greater than "@" means alpha characters (specifically not starting with "#" or "?")
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeName > "@" || elem.nodeType === 3 || elem.nodeType === 4 ) {
					return false;
				}
			}
			return true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos["empty"]( elem );
		},

		// Element/input types
		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"text": function( elem ) {
			var attr;
			// IE6 and 7 will map elem.type to 'text' for new HTML5 types (search, etc)
			// use getAttribute instead to test this case
			return elem.nodeName.toLowerCase() === "input" &&
				elem.type === "text" &&
				( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === elem.type );
		},

		// Position-in-collection
		"first": createPositionalPseudo(function() {
			return [ 0 ];
		}),

		"last": createPositionalPseudo(function( matchIndexes, length ) {
			return [ length - 1 ];
		}),

		"eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		}),

		"even": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"odd": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		})
	}
};

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	Expr.pseudos[ i ] = createButtonPseudo( i );
}

function tokenize( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || (match = rcomma.exec( soFar )) ) {
			if ( match ) {
				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[0].length ) || soFar;
			}
			groups.push( tokens = [] );
		}

		matched = false;

		// Combinators
		if ( (match = rcombinators.exec( soFar )) ) {
			matched = match.shift();
			tokens.push( {
				value: matched,
				// Cast descendant combinators to space
				type: match[0].replace( rtrim, " " )
			} );
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
				(match = preFilters[ type ]( match ))) ) {
				matched = match.shift();
				tokens.push( {
					value: matched,
					type: type,
					matches: match
				} );
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :
			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
}

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[i].value;
	}
	return selector;
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		checkNonElements = base && dir === "parentNode",
		doneName = done++;

	return combinator.first ?
		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( (elem = elem[ dir ]) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var data, cache, outerCache,
				dirkey = dirruns + " " + doneName;

			// We can't set arbitrary data on XML nodes, so they don't benefit from dir caching
			if ( xml ) {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ expando ] || (elem[ expando ] = {});
						if ( (cache = outerCache[ dir ]) && cache[0] === dirkey ) {
							if ( (data = cache[1]) === true || data === cachedruns ) {
								return data === true;
							}
						} else {
							cache = outerCache[ dir ] = [ dirkey ];
							cache[1] = matcher( elem, context, xml ) || cachedruns;
							if ( cache[1] === true ) {
								return true;
							}
						}
					}
				}
			}
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[i]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[0];
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( (elem = unmatched[i]) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction(function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?
				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( (elem = temp[i]) ) {
					matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {
					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( (elem = matcherOut[i]) ) {
							// Restore matcherIn since elem is not yet a final match
							temp.push( (matcherIn[i] = elem) );
						}
					}
					postFinder( null, (matcherOut = []), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( (elem = matcherOut[i]) &&
						(temp = postFinder ? indexOf.call( seed, elem ) : preMap[i]) > -1 ) {

						seed[temp] = !(results[temp] = elem);
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	});
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[0].type ],
		implicitRelative = leadingRelative || Expr.relative[" "],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf.call( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			return ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				(checkContext = context).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );
		} ];

	for ( ; i < len; i++ ) {
		if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
			matchers = [ addCombinator(elementMatcher( matchers ), matcher) ];
		} else {
			matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {
				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[j].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector( tokens.slice( 0, i - 1 ) ).replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	// A counter to specify which element is currently being matched
	var matcherCachedRuns = 0,
		bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, expandContext ) {
			var elem, j, matcher,
				setMatched = [],
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				outermost = expandContext != null,
				contextBackup = outermostContext,
				// We must always have either seed elements or context
				elems = seed || byElement && Expr.find["TAG"]( "*", expandContext && context.parentNode || context ),
				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1);

			if ( outermost ) {
				outermostContext = context !== document && context;
				cachedruns = matcherCachedRuns;
			}

			// Add elements passing elementMatchers directly to results
			// Keep `i` a string if there are no elements so `matchedCount` will be "00" below
			for ( ; (elem = elems[i]) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;
					while ( (matcher = elementMatchers[j++]) ) {
						if ( matcher( elem, context, xml ) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
						cachedruns = ++matcherCachedRuns;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {
					// They will have gone through all possible matchers
					if ( (elem = !matcher && elem) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// Apply set filters to unmatched elements
			matchedCount += i;
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( (matcher = setMatchers[j++]) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {
					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !(unmatched[i] || setMatched[i]) ) {
								setMatched[i] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, group /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {
		// Generate a function of recursive functions that can be used to check each element
		if ( !group ) {
			group = tokenize( selector );
		}
		i = group.length;
		while ( i-- ) {
			cached = matcherFromTokens( group[i] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );
	}
	return cached;
};

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[i], results );
	}
	return results;
}

function select( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		match = tokenize( selector );

	if ( !seed ) {
		// Try to minimize operations if there is only one group
		if ( match.length === 1 ) {

			// Take a shortcut and set the context if the root selector is an ID
			tokens = match[0] = match[0].slice( 0 );
			if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
					context.nodeType === 9 && !documentIsXML &&
					Expr.relative[ tokens[1].type ] ) {

				context = Expr.find["ID"]( token.matches[0].replace( runescape, funescape ), context )[0];
				if ( !context ) {
					return results;
				}

				selector = selector.slice( tokens.shift().value.length );
			}

			// Fetch a seed set for right-to-left matching
			i = matchExpr["needsContext"].test( selector ) ? 0 : tokens.length;
			while ( i-- ) {
				token = tokens[i];

				// Abort if we hit a combinator
				if ( Expr.relative[ (type = token.type) ] ) {
					break;
				}
				if ( (find = Expr.find[ type ]) ) {
					// Search, expanding context for leading sibling combinators
					if ( (seed = find(
						token.matches[0].replace( runescape, funescape ),
						rsibling.test( tokens[0].type ) && context.parentNode || context
					)) ) {

						// If seed is empty or no tokens remain, we can return early
						tokens.splice( i, 1 );
						selector = seed.length && toSelector( tokens );
						if ( !selector ) {
							push.apply( results, slice.call( seed, 0 ) );
							return results;
						}

						break;
					}
				}
			}
		}
	}

	// Compile and execute a filtering function
	// Provide `match` to avoid retokenization if we modified the selector above
	compile( selector, match )(
		seed,
		context,
		documentIsXML,
		results,
		rsibling.test( selector )
	);
	return results;
}

// Deprecated
Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Easy API for creating new setFilters
function setFilters() {}
Expr.filters = setFilters.prototype = Expr.pseudos;
Expr.setFilters = new setFilters();

// Initialize with the default document
setDocument();

// Override sizzle attribute retrieval
Sizzle.attr = jQuery.attr;
jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;
jQuery.expr[":"] = jQuery.expr.pseudos;
jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;


})( window );
var runtil = /Until$/,
	rparentsprev = /^(?:parents|prev(?:Until|All))/,
	isSimple = /^.[^:#\[\.,]*$/,
	rneedsContext = jQuery.expr.match.needsContext,
	// methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.fn.extend({
	find: function( selector ) {
		var i, ret, self,
			len = this.length;

		if ( typeof selector !== "string" ) {
			self = this;
			return this.pushStack( jQuery( selector ).filter(function() {
				for ( i = 0; i < len; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			}) );
		}

		ret = [];
		for ( i = 0; i < len; i++ ) {
			jQuery.find( selector, this[ i ], ret );
		}

		// Needed because $( selector, context ) becomes $( context ).find( selector )
		ret = this.pushStack( len > 1 ? jQuery.unique( ret ) : ret );
		ret.selector = ( this.selector ? this.selector + " " : "" ) + selector;
		return ret;
	},

	has: function( target ) {
		var i,
			targets = jQuery( target, this ),
			len = targets.length;

		return this.filter(function() {
			for ( i = 0; i < len; i++ ) {
				if ( jQuery.contains( this, targets[i] ) ) {
					return true;
				}
			}
		});
	},

	not: function( selector ) {
		return this.pushStack( winnow(this, selector, false) );
	},

	filter: function( selector ) {
		return this.pushStack( winnow(this, selector, true) );
	},

	is: function( selector ) {
		return !!selector && (
			typeof selector === "string" ?
				// If this is a positional/relative selector, check membership in the returned set
				// so $("p:first").is("p:last") won't return true for a doc with two "p".
				rneedsContext.test( selector ) ?
					jQuery( selector, this.context ).index( this[0] ) >= 0 :
					jQuery.filter( selector, this ).length > 0 :
				this.filter( selector ).length > 0 );
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			ret = [],
			pos = rneedsContext.test( selectors ) || typeof selectors !== "string" ?
				jQuery( selectors, context || this.context ) :
				0;

		for ( ; i < l; i++ ) {
			cur = this[i];

			while ( cur && cur.ownerDocument && cur !== context && cur.nodeType !== 11 ) {
				if ( pos ? pos.index(cur) > -1 : jQuery.find.matchesSelector(cur, selectors) ) {
					ret.push( cur );
					break;
				}
				cur = cur.parentNode;
			}
		}

		return this.pushStack( ret.length > 1 ? jQuery.unique( ret ) : ret );
	},

	// Determine the position of an element within
	// the matched set of elements
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[0] && this[0].parentNode ) ? this.first().prevAll().length : -1;
		}

		// index in selector
		if ( typeof elem === "string" ) {
			return jQuery.inArray( this[0], jQuery( elem ) );
		}

		// Locate the position of the desired element
		return jQuery.inArray(
			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[0] : elem, this );
	},

	add: function( selector, context ) {
		var set = typeof selector === "string" ?
				jQuery( selector, context ) :
				jQuery.makeArray( selector && selector.nodeType ? [ selector ] : selector ),
			all = jQuery.merge( this.get(), set );

		return this.pushStack( jQuery.unique(all) );
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter(selector)
		);
	}
});

jQuery.fn.andSelf = jQuery.fn.addBack;

function sibling( cur, dir ) {
	do {
		cur = cur[ dir ];
	} while ( cur && cur.nodeType !== 1 );

	return cur;
}

jQuery.each({
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return jQuery.dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return jQuery.dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return jQuery.dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return jQuery.sibling( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return jQuery.sibling( elem.firstChild );
	},
	contents: function( elem ) {
		return jQuery.nodeName( elem, "iframe" ) ?
			elem.contentDocument || elem.contentWindow.document :
			jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var ret = jQuery.map( this, fn, until );

		if ( !runtil.test( name ) ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			ret = jQuery.filter( selector, ret );
		}

		ret = this.length > 1 && !guaranteedUnique[ name ] ? jQuery.unique( ret ) : ret;

		if ( this.length > 1 && rparentsprev.test( name ) ) {
			ret = ret.reverse();
		}

		return this.pushStack( ret );
	};
});

jQuery.extend({
	filter: function( expr, elems, not ) {
		if ( not ) {
			expr = ":not(" + expr + ")";
		}

		return elems.length === 1 ?
			jQuery.find.matchesSelector(elems[0], expr) ? [ elems[0] ] : [] :
			jQuery.find.matches(expr, elems);
	},

	dir: function( elem, dir, until ) {
		var matched = [],
			cur = elem[ dir ];

		while ( cur && cur.nodeType !== 9 && (until === undefined || cur.nodeType !== 1 || !jQuery( cur ).is( until )) ) {
			if ( cur.nodeType === 1 ) {
				matched.push( cur );
			}
			cur = cur[dir];
		}
		return matched;
	},

	sibling: function( n, elem ) {
		var r = [];

		for ( ; n; n = n.nextSibling ) {
			if ( n.nodeType === 1 && n !== elem ) {
				r.push( n );
			}
		}

		return r;
	}
});

// Implement the identical functionality for filter and not
function winnow( elements, qualifier, keep ) {

	// Can't pass null or undefined to indexOf in Firefox 4
	// Set to 0 to skip string check
	qualifier = qualifier || 0;

	if ( jQuery.isFunction( qualifier ) ) {
		return jQuery.grep(elements, function( elem, i ) {
			var retVal = !!qualifier.call( elem, i, elem );
			return retVal === keep;
		});

	} else if ( qualifier.nodeType ) {
		return jQuery.grep(elements, function( elem ) {
			return ( elem === qualifier ) === keep;
		});

	} else if ( typeof qualifier === "string" ) {
		var filtered = jQuery.grep(elements, function( elem ) {
			return elem.nodeType === 1;
		});

		if ( isSimple.test( qualifier ) ) {
			return jQuery.filter(qualifier, filtered, !keep);
		} else {
			qualifier = jQuery.filter( qualifier, filtered );
		}
	}

	return jQuery.grep(elements, function( elem ) {
		return ( jQuery.inArray( elem, qualifier ) >= 0 ) === keep;
	});
}
function createSafeFragment( document ) {
	var list = nodeNames.split( "|" ),
		safeFrag = document.createDocumentFragment();

	if ( safeFrag.createElement ) {
		while ( list.length ) {
			safeFrag.createElement(
				list.pop()
			);
		}
	}
	return safeFrag;
}

var nodeNames = "abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|" +
		"header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",
	rinlinejQuery = / jQuery\d+="(?:null|\d+)"/g,
	rnoshimcache = new RegExp("<(?:" + nodeNames + ")[\\s/>]", "i"),
	rleadingWhitespace = /^\s+/,
	rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
	rtagName = /<([\w:]+)/,
	rtbody = /<tbody/i,
	rhtml = /<|&#?\w+;/,
	rnoInnerhtml = /<(?:script|style|link)/i,
	manipulation_rcheckableType = /^(?:checkbox|radio)$/i,
	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rscriptType = /^$|\/(?:java|ecma)script/i,
	rscriptTypeMasked = /^true\/(.*)/,
	rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,

	// We have to close these tags to support XHTML (#13200)
	wrapMap = {
		option: [ 1, "<select multiple='multiple'>", "</select>" ],
		legend: [ 1, "<fieldset>", "</fieldset>" ],
		area: [ 1, "<map>", "</map>" ],
		param: [ 1, "<object>", "</object>" ],
		thead: [ 1, "<table>", "</table>" ],
		tr: [ 2, "<table><tbody>", "</tbody></table>" ],
		col: [ 2, "<table><tbody></tbody><colgroup>", "</colgroup></table>" ],
		td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

		// IE6-8 can't serialize link, script, style, or any html5 (NoScope) tags,
		// unless wrapped in a div with non-breaking characters in front of it.
		_default: jQuery.support.htmlSerialize ? [ 0, "", "" ] : [ 1, "X<div>", "</div>"  ]
	},
	safeFragment = createSafeFragment( document ),
	fragmentDiv = safeFragment.appendChild( document.createElement("div") );

wrapMap.optgroup = wrapMap.option;
wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

jQuery.fn.extend({
	text: function( value ) {
		return jQuery.access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().append( ( this[0] && this[0].ownerDocument || document ).createTextNode( value ) );
		}, null, value, arguments.length );
	},

	wrapAll: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function(i) {
				jQuery(this).wrapAll( html.call(this, i) );
			});
		}

		if ( this[0] ) {
			// The elements to wrap the target around
			var wrap = jQuery( html, this[0].ownerDocument ).eq(0).clone(true);

			if ( this[0].parentNode ) {
				wrap.insertBefore( this[0] );
			}

			wrap.map(function() {
				var elem = this;

				while ( elem.firstChild && elem.firstChild.nodeType === 1 ) {
					elem = elem.firstChild;
				}

				return elem;
			}).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function(i) {
				jQuery(this).wrapInner( html.call(this, i) );
			});
		}

		return this.each(function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		});
	},

	wrap: function( html ) {
		var isFunction = jQuery.isFunction( html );

		return this.each(function(i) {
			jQuery( this ).wrapAll( isFunction ? html.call(this, i) : html );
		});
	},

	unwrap: function() {
		return this.parent().each(function() {
			if ( !jQuery.nodeName( this, "body" ) ) {
				jQuery( this ).replaceWith( this.childNodes );
			}
		}).end();
	},

	append: function() {
		return this.domManip(arguments, true, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				this.appendChild( elem );
			}
		});
	},

	prepend: function() {
		return this.domManip(arguments, true, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				this.insertBefore( elem, this.firstChild );
			}
		});
	},

	before: function() {
		return this.domManip( arguments, false, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		});
	},

	after: function() {
		return this.domManip( arguments, false, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		});
	},

	// keepData is for internal use only--do not document
	remove: function( selector, keepData ) {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			if ( !selector || jQuery.filter( selector, [ elem ] ).length > 0 ) {
				if ( !keepData && elem.nodeType === 1 ) {
					jQuery.cleanData( getAll( elem ) );
				}

				if ( elem.parentNode ) {
					if ( keepData && jQuery.contains( elem.ownerDocument, elem ) ) {
						setGlobalEval( getAll( elem, "script" ) );
					}
					elem.parentNode.removeChild( elem );
				}
			}
		}

		return this;
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			// Remove element nodes and prevent memory leaks
			if ( elem.nodeType === 1 ) {
				jQuery.cleanData( getAll( elem, false ) );
			}

			// Remove any remaining nodes
			while ( elem.firstChild ) {
				elem.removeChild( elem.firstChild );
			}

			// If this is a select, ensure that it displays empty (#12336)
			// Support: IE<9
			if ( elem.options && jQuery.nodeName( elem, "select" ) ) {
				elem.options.length = 0;
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map( function () {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		});
	},

	html: function( value ) {
		return jQuery.access( this, function( value ) {
			var elem = this[0] || {},
				i = 0,
				l = this.length;

			if ( value === undefined ) {
				return elem.nodeType === 1 ?
					elem.innerHTML.replace( rinlinejQuery, "" ) :
					undefined;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				( jQuery.support.htmlSerialize || !rnoshimcache.test( value )  ) &&
				( jQuery.support.leadingWhitespace || !rleadingWhitespace.test( value ) ) &&
				!wrapMap[ ( rtagName.exec( value ) || ["", ""] )[1].toLowerCase() ] ) {

				value = value.replace( rxhtmlTag, "<$1></$2>" );

				try {
					for (; i < l; i++ ) {
						// Remove element nodes and prevent memory leaks
						elem = this[i] || {};
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch(e) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function( value ) {
		var isFunc = jQuery.isFunction( value );

		// Make sure that the elements are removed from the DOM before they are inserted
		// this can help fix replacing a parent with child elements
		if ( !isFunc && typeof value !== "string" ) {
			value = jQuery( value ).not( this ).detach();
		}

		return this.domManip( [ value ], true, function( elem ) {
			var next = this.nextSibling,
				parent = this.parentNode;

			if ( parent ) {
				jQuery( this ).remove();
				parent.insertBefore( elem, next );
			}
		});
	},

	detach: function( selector ) {
		return this.remove( selector, true );
	},

	domManip: function( args, table, callback ) {

		// Flatten any nested arrays
		args = core_concat.apply( [], args );

		var first, node, hasScripts,
			scripts, doc, fragment,
			i = 0,
			l = this.length,
			set = this,
			iNoClone = l - 1,
			value = args[0],
			isFunction = jQuery.isFunction( value );

		// We can't cloneNode fragments that contain checked, in WebKit
		if ( isFunction || !( l <= 1 || typeof value !== "string" || jQuery.support.checkClone || !rchecked.test( value ) ) ) {
			return this.each(function( index ) {
				var self = set.eq( index );
				if ( isFunction ) {
					args[0] = value.call( this, index, table ? self.html() : undefined );
				}
				self.domManip( args, table, callback );
			});
		}

		if ( l ) {
			fragment = jQuery.buildFragment( args, this[ 0 ].ownerDocument, false, this );
			first = fragment.firstChild;

			if ( fragment.childNodes.length === 1 ) {
				fragment = first;
			}

			if ( first ) {
				table = table && jQuery.nodeName( first, "tr" );
				scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
				hasScripts = scripts.length;

				// Use the original fragment for the last item instead of the first because it can end up
				// being emptied incorrectly in certain situations (#8070).
				for ( ; i < l; i++ ) {
					node = fragment;

					if ( i !== iNoClone ) {
						node = jQuery.clone( node, true, true );

						// Keep references to cloned scripts for later restoration
						if ( hasScripts ) {
							jQuery.merge( scripts, getAll( node, "script" ) );
						}
					}

					callback.call(
						table && jQuery.nodeName( this[i], "table" ) ?
							findOrAppend( this[i], "tbody" ) :
							this[i],
						node,
						i
					);
				}

				if ( hasScripts ) {
					doc = scripts[ scripts.length - 1 ].ownerDocument;

					// Reenable scripts
					jQuery.map( scripts, restoreScript );

					// Evaluate executable scripts on first document insertion
					for ( i = 0; i < hasScripts; i++ ) {
						node = scripts[ i ];
						if ( rscriptType.test( node.type || "" ) &&
							!jQuery._data( node, "globalEval" ) && jQuery.contains( doc, node ) ) {

							if ( node.src ) {
								// Hope ajax is available...
								jQuery.ajax({
									url: node.src,
									type: "GET",
									dataType: "script",
									async: false,
									global: false,
									"throws": true
								});
							} else {
								jQuery.globalEval( ( node.text || node.textContent || node.innerHTML || "" ).replace( rcleanScript, "" ) );
							}
						}
					}
				}

				// Fix #11809: Avoid leaking memory
				fragment = first = null;
			}
		}

		return this;
	}
});

function findOrAppend( elem, tag ) {
	return elem.getElementsByTagName( tag )[0] || elem.appendChild( elem.ownerDocument.createElement( tag ) );
}

// Replace/restore the type attribute of script elements for safe DOM manipulation
function disableScript( elem ) {
	var attr = elem.getAttributeNode("type");
	elem.type = ( attr && attr.specified ) + "/" + elem.type;
	return elem;
}
function restoreScript( elem ) {
	var match = rscriptTypeMasked.exec( elem.type );
	if ( match ) {
		elem.type = match[1];
	} else {
		elem.removeAttribute("type");
	}
	return elem;
}

// Mark scripts as having already been evaluated
function setGlobalEval( elems, refElements ) {
	var elem,
		i = 0;
	for ( ; (elem = elems[i]) != null; i++ ) {
		jQuery._data( elem, "globalEval", !refElements || jQuery._data( refElements[i], "globalEval" ) );
	}
}

function cloneCopyEvent( src, dest ) {

	if ( dest.nodeType !== 1 || !jQuery.hasData( src ) ) {
		return;
	}

	var type, i, l,
		oldData = jQuery._data( src ),
		curData = jQuery._data( dest, oldData ),
		events = oldData.events;

	if ( events ) {
		delete curData.handle;
		curData.events = {};

		for ( type in events ) {
			for ( i = 0, l = events[ type ].length; i < l; i++ ) {
				jQuery.event.add( dest, type, events[ type ][ i ] );
			}
		}
	}

	// make the cloned public data object a copy from the original
	if ( curData.data ) {
		curData.data = jQuery.extend( {}, curData.data );
	}
}

function fixCloneNodeIssues( src, dest ) {
	var nodeName, e, data;

	// We do not need to do anything for non-Elements
	if ( dest.nodeType !== 1 ) {
		return;
	}

	nodeName = dest.nodeName.toLowerCase();

	// IE6-8 copies events bound via attachEvent when using cloneNode.
	if ( !jQuery.support.noCloneEvent && dest[ jQuery.expando ] ) {
		data = jQuery._data( dest );

		for ( e in data.events ) {
			jQuery.removeEvent( dest, e, data.handle );
		}

		// Event data gets referenced instead of copied if the expando gets copied too
		dest.removeAttribute( jQuery.expando );
	}

	// IE blanks contents when cloning scripts, and tries to evaluate newly-set text
	if ( nodeName === "script" && dest.text !== src.text ) {
		disableScript( dest ).text = src.text;
		restoreScript( dest );

	// IE6-10 improperly clones children of object elements using classid.
	// IE10 throws NoModificationAllowedError if parent is null, #12132.
	} else if ( nodeName === "object" ) {
		if ( dest.parentNode ) {
			dest.outerHTML = src.outerHTML;
		}

		// This path appears unavoidable for IE9. When cloning an object
		// element in IE9, the outerHTML strategy above is not sufficient.
		// If the src has innerHTML and the destination does not,
		// copy the src.innerHTML into the dest.innerHTML. #10324
		if ( jQuery.support.html5Clone && ( src.innerHTML && !jQuery.trim(dest.innerHTML) ) ) {
			dest.innerHTML = src.innerHTML;
		}

	} else if ( nodeName === "input" && manipulation_rcheckableType.test( src.type ) ) {
		// IE6-8 fails to persist the checked state of a cloned checkbox
		// or radio button. Worse, IE6-7 fail to give the cloned element
		// a checked appearance if the defaultChecked value isn't also set

		dest.defaultChecked = dest.checked = src.checked;

		// IE6-7 get confused and end up setting the value of a cloned
		// checkbox/radio button to an empty string instead of "on"
		if ( dest.value !== src.value ) {
			dest.value = src.value;
		}

	// IE6-8 fails to return the selected option to the default selected
	// state when cloning options
	} else if ( nodeName === "option" ) {
		dest.defaultSelected = dest.selected = src.defaultSelected;

	// IE6-8 fails to set the defaultValue to the correct value when
	// cloning other types of input fields
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;
	}
}

jQuery.each({
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			i = 0,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone(true);
			jQuery( insert[i] )[ original ]( elems );

			// Modern browsers can apply jQuery collections as arrays, but oldIE needs a .get()
			core_push.apply( ret, elems.get() );
		}

		return this.pushStack( ret );
	};
});

function getAll( context, tag ) {
	var elems, elem,
		i = 0,
		found = typeof context.getElementsByTagName !== core_strundefined ? context.getElementsByTagName( tag || "*" ) :
			typeof context.querySelectorAll !== core_strundefined ? context.querySelectorAll( tag || "*" ) :
			undefined;

	if ( !found ) {
		for ( found = [], elems = context.childNodes || context; (elem = elems[i]) != null; i++ ) {
			if ( !tag || jQuery.nodeName( elem, tag ) ) {
				found.push( elem );
			} else {
				jQuery.merge( found, getAll( elem, tag ) );
			}
		}
	}

	return tag === undefined || tag && jQuery.nodeName( context, tag ) ?
		jQuery.merge( [ context ], found ) :
		found;
}

// Used in buildFragment, fixes the defaultChecked property
function fixDefaultChecked( elem ) {
	if ( manipulation_rcheckableType.test( elem.type ) ) {
		elem.defaultChecked = elem.checked;
	}
}

jQuery.extend({
	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var destElements, node, clone, i, srcElements,
			inPage = jQuery.contains( elem.ownerDocument, elem );

		if ( jQuery.support.html5Clone || jQuery.isXMLDoc(elem) || !rnoshimcache.test( "<" + elem.nodeName + ">" ) ) {
			clone = elem.cloneNode( true );

		// IE<=8 does not properly clone detached, unknown element nodes
		} else {
			fragmentDiv.innerHTML = elem.outerHTML;
			fragmentDiv.removeChild( clone = fragmentDiv.firstChild );
		}

		if ( (!jQuery.support.noCloneEvent || !jQuery.support.noCloneChecked) &&
				(elem.nodeType === 1 || elem.nodeType === 11) && !jQuery.isXMLDoc(elem) ) {

			// We eschew Sizzle here for performance reasons: http://jsperf.com/getall-vs-sizzle/2
			destElements = getAll( clone );
			srcElements = getAll( elem );

			// Fix all IE cloning issues
			for ( i = 0; (node = srcElements[i]) != null; ++i ) {
				// Ensure that the destination node is not null; Fixes #9587
				if ( destElements[i] ) {
					fixCloneNodeIssues( node, destElements[i] );
				}
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = srcElements || getAll( elem );
				destElements = destElements || getAll( clone );

				for ( i = 0; (node = srcElements[i]) != null; i++ ) {
					cloneCopyEvent( node, destElements[i] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		destElements = srcElements = node = null;

		// Return the cloned set
		return clone;
	},

	buildFragment: function( elems, context, scripts, selection ) {
		var j, elem, contains,
			tmp, tag, tbody, wrap,
			l = elems.length,

			// Ensure a safe fragment
			safe = createSafeFragment( context ),

			nodes = [],
			i = 0;

		for ( ; i < l; i++ ) {
			elem = elems[ i ];

			if ( elem || elem === 0 ) {

				// Add nodes directly
				if ( jQuery.type( elem ) === "object" ) {
					jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

				// Convert non-html into a text node
				} else if ( !rhtml.test( elem ) ) {
					nodes.push( context.createTextNode( elem ) );

				// Convert html into DOM nodes
				} else {
					tmp = tmp || safe.appendChild( context.createElement("div") );

					// Deserialize a standard representation
					tag = ( rtagName.exec( elem ) || ["", ""] )[1].toLowerCase();
					wrap = wrapMap[ tag ] || wrapMap._default;

					tmp.innerHTML = wrap[1] + elem.replace( rxhtmlTag, "<$1></$2>" ) + wrap[2];

					// Descend through wrappers to the right content
					j = wrap[0];
					while ( j-- ) {
						tmp = tmp.lastChild;
					}

					// Manually add leading whitespace removed by IE
					if ( !jQuery.support.leadingWhitespace && rleadingWhitespace.test( elem ) ) {
						nodes.push( context.createTextNode( rleadingWhitespace.exec( elem )[0] ) );
					}

					// Remove IE's autoinserted <tbody> from table fragments
					if ( !jQuery.support.tbody ) {

						// String was a <table>, *may* have spurious <tbody>
						elem = tag === "table" && !rtbody.test( elem ) ?
							tmp.firstChild :

							// String was a bare <thead> or <tfoot>
							wrap[1] === "<table>" && !rtbody.test( elem ) ?
								tmp :
								0;

						j = elem && elem.childNodes.length;
						while ( j-- ) {
							if ( jQuery.nodeName( (tbody = elem.childNodes[j]), "tbody" ) && !tbody.childNodes.length ) {
								elem.removeChild( tbody );
							}
						}
					}

					jQuery.merge( nodes, tmp.childNodes );

					// Fix #12392 for WebKit and IE > 9
					tmp.textContent = "";

					// Fix #12392 for oldIE
					while ( tmp.firstChild ) {
						tmp.removeChild( tmp.firstChild );
					}

					// Remember the top-level container for proper cleanup
					tmp = safe.lastChild;
				}
			}
		}

		// Fix #11356: Clear elements from fragment
		if ( tmp ) {
			safe.removeChild( tmp );
		}

		// Reset defaultChecked for any radios and checkboxes
		// about to be appended to the DOM in IE 6/7 (#8060)
		if ( !jQuery.support.appendChecked ) {
			jQuery.grep( getAll( nodes, "input" ), fixDefaultChecked );
		}

		i = 0;
		while ( (elem = nodes[ i++ ]) ) {

			// #4087 - If origin and destination elements are the same, and this is
			// that element, do not do anything
			if ( selection && jQuery.inArray( elem, selection ) !== -1 ) {
				continue;
			}

			contains = jQuery.contains( elem.ownerDocument, elem );

			// Append to fragment
			tmp = getAll( safe.appendChild( elem ), "script" );

			// Preserve script evaluation history
			if ( contains ) {
				setGlobalEval( tmp );
			}

			// Capture executables
			if ( scripts ) {
				j = 0;
				while ( (elem = tmp[ j++ ]) ) {
					if ( rscriptType.test( elem.type || "" ) ) {
						scripts.push( elem );
					}
				}
			}
		}

		tmp = null;

		return safe;
	},

	cleanData: function( elems, /* internal */ acceptData ) {
		var elem, type, id, data,
			i = 0,
			internalKey = jQuery.expando,
			cache = jQuery.cache,
			deleteExpando = jQuery.support.deleteExpando,
			special = jQuery.event.special;

		for ( ; (elem = elems[i]) != null; i++ ) {

			if ( acceptData || jQuery.acceptData( elem ) ) {

				id = elem[ internalKey ];
				data = id && cache[ id ];

				if ( data ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}

					// Remove cache only if it was not already removed by jQuery.event.remove
					if ( cache[ id ] ) {

						delete cache[ id ];

						// IE does not allow us to delete expando properties from nodes,
						// nor does it have a removeAttribute function on Document nodes;
						// we must handle all of these cases
						if ( deleteExpando ) {
							delete elem[ internalKey ];

						} else if ( typeof elem.removeAttribute !== core_strundefined ) {
							elem.removeAttribute( internalKey );

						} else {
							elem[ internalKey ] = null;
						}

						core_deletedIds.push( id );
					}
				}
			}
		}
	}
});
var iframe, getStyles, curCSS,
	ralpha = /alpha\([^)]*\)/i,
	ropacity = /opacity\s*=\s*([^)]*)/,
	rposition = /^(top|right|bottom|left)$/,
	// swappable if display is none or starts with table except "table", "table-cell", or "table-caption"
	// see here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rmargin = /^margin/,
	rnumsplit = new RegExp( "^(" + core_pnum + ")(.*)$", "i" ),
	rnumnonpx = new RegExp( "^(" + core_pnum + ")(?!px)[a-z%]+$", "i" ),
	rrelNum = new RegExp( "^([+-])=(" + core_pnum + ")", "i" ),
	elemdisplay = { BODY: "block" },

	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: 0,
		fontWeight: 400
	},

	cssExpand = [ "Top", "Right", "Bottom", "Left" ],
	cssPrefixes = [ "Webkit", "O", "Moz", "ms" ];

// return a css property mapped to a potentially vendor prefixed property
function vendorPropName( style, name ) {

	// shortcut for names that are not vendor prefixed
	if ( name in style ) {
		return name;
	}

	// check for vendor prefixed names
	var capName = name.charAt(0).toUpperCase() + name.slice(1),
		origName = name,
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in style ) {
			return name;
		}
	}

	return origName;
}

function isHidden( elem, el ) {
	// isHidden might be called from jQuery#filter function;
	// in that case, element will be second argument
	elem = el || elem;
	return jQuery.css( elem, "display" ) === "none" || !jQuery.contains( elem.ownerDocument, elem );
}

function showHide( elements, show ) {
	var display, elem, hidden,
		values = [],
		index = 0,
		length = elements.length;

	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}

		values[ index ] = jQuery._data( elem, "olddisplay" );
		display = elem.style.display;
		if ( show ) {
			// Reset the inline display of this element to learn if it is
			// being hidden by cascaded rules or not
			if ( !values[ index ] && display === "none" ) {
				elem.style.display = "";
			}

			// Set elements which have been overridden with display: none
			// in a stylesheet to whatever the default browser style is
			// for such an element
			if ( elem.style.display === "" && isHidden( elem ) ) {
				values[ index ] = jQuery._data( elem, "olddisplay", css_defaultDisplay(elem.nodeName) );
			}
		} else {

			if ( !values[ index ] ) {
				hidden = isHidden( elem );

				if ( display && display !== "none" || !hidden ) {
					jQuery._data( elem, "olddisplay", hidden ? display : jQuery.css( elem, "display" ) );
				}
			}
		}
	}

	// Set the display of most of the elements in a second loop
	// to avoid the constant reflow
	for ( index = 0; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}
		if ( !show || elem.style.display === "none" || elem.style.display === "" ) {
			elem.style.display = show ? values[ index ] || "" : "none";
		}
	}

	return elements;
}

jQuery.fn.extend({
	css: function( name, value ) {
		return jQuery.access( this, function( elem, name, value ) {
			var len, styles,
				map = {},
				i = 0;

			if ( jQuery.isArray( name ) ) {
				styles = getStyles( elem );
				len = name.length;

				for ( ; i < len; i++ ) {
					map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
				}

				return map;
			}

			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	},
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state ) {
		var bool = typeof state === "boolean";

		return this.each(function() {
			if ( bool ? state : isHidden( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		});
	}
});

jQuery.extend({
	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {
					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;
				}
			}
		}
	},

	// Exclude the following css properties to add px
	cssNumber: {
		"columnCount": true,
		"fillOpacity": true,
		"fontWeight": true,
		"lineHeight": true,
		"opacity": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {
		// normalize float css property
		"float": jQuery.support.cssFloat ? "cssFloat" : "styleFloat"
	},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {
		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = jQuery.camelCase( name ),
			style = elem.style;

		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// convert relative number strings (+= or -=) to relative numbers. #7345
			if ( type === "string" && (ret = rrelNum.exec( value )) ) {
				value = ( ret[1] + 1 ) * ret[2] + parseFloat( jQuery.css( elem, name ) );
				// Fixes bug #9237
				type = "number";
			}

			// Make sure that NaN and null values aren't set. See: #7116
			if ( value == null || type === "number" && isNaN( value ) ) {
				return;
			}

			// If a number was passed in, add 'px' to the (except for certain CSS properties)
			if ( type === "number" && !jQuery.cssNumber[ origName ] ) {
				value += "px";
			}

			// Fixes #8908, it can be done more correctly by specifing setters in cssHooks,
			// but it would mean to define eight (for every problematic property) identical functions
			if ( !jQuery.support.clearCloneStyle && value === "" && name.indexOf("background") === 0 ) {
				style[ name ] = "inherit";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !("set" in hooks) || (value = hooks.set( elem, value, extra )) !== undefined ) {

				// Wrapped to prevent IE from throwing errors when 'invalid' values are provided
				// Fixes bug #5509
				try {
					style[ name ] = value;
				} catch(e) {}
			}

		} else {
			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, false, extra )) !== undefined ) {
				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, extra, styles ) {
		var num, val, hooks,
			origName = jQuery.camelCase( name );

		// Make sure that we're working with the right name
		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( elem.style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name, styles );
		}

		//convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Return, converting to number if forced or a qualifier was provided and val looks numeric
		if ( extra === "" || extra ) {
			num = parseFloat( val );
			return extra === true || jQuery.isNumeric( num ) ? num || 0 : val;
		}
		return val;
	},

	// A method for quickly swapping in/out CSS properties to get correct calculations
	swap: function( elem, options, callback, args ) {
		var ret, name,
			old = {};

		// Remember the old values, and insert the new ones
		for ( name in options ) {
			old[ name ] = elem.style[ name ];
			elem.style[ name ] = options[ name ];
		}

		ret = callback.apply( elem, args || [] );

		// Revert the old values
		for ( name in options ) {
			elem.style[ name ] = old[ name ];
		}

		return ret;
	}
});

// NOTE: we've included the "window" in window.getComputedStyle
// because jsdom on node.js will break without it.
if ( window.getComputedStyle ) {
	getStyles = function( elem ) {
		return window.getComputedStyle( elem, null );
	};

	curCSS = function( elem, name, _computed ) {
		var width, minWidth, maxWidth,
			computed = _computed || getStyles( elem ),

			// getPropertyValue is only needed for .css('filter') in IE9, see #12537
			ret = computed ? computed.getPropertyValue( name ) || computed[ name ] : undefined,
			style = elem.style;

		if ( computed ) {

			if ( ret === "" && !jQuery.contains( elem.ownerDocument, elem ) ) {
				ret = jQuery.style( elem, name );
			}

			// A tribute to the "awesome hack by Dean Edwards"
			// Chrome < 17 and Safari 5.0 uses "computed value" instead of "used value" for margin-right
			// Safari 5.1.7 (at least) returns percentage for a larger set of values, but width seems to be reliably pixels
			// this is against the CSSOM draft spec: http://dev.w3.org/csswg/cssom/#resolved-values
			if ( rnumnonpx.test( ret ) && rmargin.test( name ) ) {

				// Remember the original values
				width = style.width;
				minWidth = style.minWidth;
				maxWidth = style.maxWidth;

				// Put in the new values to get a computed value out
				style.minWidth = style.maxWidth = style.width = ret;
				ret = computed.width;

				// Revert the changed values
				style.width = width;
				style.minWidth = minWidth;
				style.maxWidth = maxWidth;
			}
		}

		return ret;
	};
} else if ( document.documentElement.currentStyle ) {
	getStyles = function( elem ) {
		return elem.currentStyle;
	};

	curCSS = function( elem, name, _computed ) {
		var left, rs, rsLeft,
			computed = _computed || getStyles( elem ),
			ret = computed ? computed[ name ] : undefined,
			style = elem.style;

		// Avoid setting ret to empty string here
		// so we don't default to auto
		if ( ret == null && style && style[ name ] ) {
			ret = style[ name ];
		}

		// From the awesome hack by Dean Edwards
		// http://erik.eae.net/archives/2007/07/27/18.54.15/#comment-102291

		// If we're not dealing with a regular pixel number
		// but a number that has a weird ending, we need to convert it to pixels
		// but not position css attributes, as those are proportional to the parent element instead
		// and we can't measure the parent instead because it might trigger a "stacking dolls" problem
		if ( rnumnonpx.test( ret ) && !rposition.test( name ) ) {

			// Remember the original values
			left = style.left;
			rs = elem.runtimeStyle;
			rsLeft = rs && rs.left;

			// Put in the new values to get a computed value out
			if ( rsLeft ) {
				rs.left = elem.currentStyle.left;
			}
			style.left = name === "fontSize" ? "1em" : ret;
			ret = style.pixelLeft + "px";

			// Revert the changed values
			style.left = left;
			if ( rsLeft ) {
				rs.left = rsLeft;
			}
		}

		return ret === "" ? "auto" : ret;
	};
}

function setPositiveNumber( elem, value, subtract ) {
	var matches = rnumsplit.exec( value );
	return matches ?
		// Guard against undefined "subtract", e.g., when used as in cssHooks
		Math.max( 0, matches[ 1 ] - ( subtract || 0 ) ) + ( matches[ 2 ] || "px" ) :
		value;
}

function augmentWidthOrHeight( elem, name, extra, isBorderBox, styles ) {
	var i = extra === ( isBorderBox ? "border" : "content" ) ?
		// If we already have the right measurement, avoid augmentation
		4 :
		// Otherwise initialize for horizontal or vertical properties
		name === "width" ? 1 : 0,

		val = 0;

	for ( ; i < 4; i += 2 ) {
		// both box models exclude margin, so add it if we want it
		if ( extra === "margin" ) {
			val += jQuery.css( elem, extra + cssExpand[ i ], true, styles );
		}

		if ( isBorderBox ) {
			// border-box includes padding, so remove it if we want content
			if ( extra === "content" ) {
				val -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
			}

			// at this point, extra isn't border nor margin, so remove border
			if ( extra !== "margin" ) {
				val -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		} else {
			// at this point, extra isn't content, so add padding
			val += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

			// at this point, extra isn't content nor padding, so add border
			if ( extra !== "padding" ) {
				val += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		}
	}

	return val;
}

function getWidthOrHeight( elem, name, extra ) {

	// Start with offset property, which is equivalent to the border-box value
	var valueIsBorderBox = true,
		val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
		styles = getStyles( elem ),
		isBorderBox = jQuery.support.boxSizing && jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

	// some non-html elements return undefined for offsetWidth, so check for null/undefined
	// svg - https://bugzilla.mozilla.org/show_bug.cgi?id=649285
	// MathML - https://bugzilla.mozilla.org/show_bug.cgi?id=491668
	if ( val <= 0 || val == null ) {
		// Fall back to computed then uncomputed css if necessary
		val = curCSS( elem, name, styles );
		if ( val < 0 || val == null ) {
			val = elem.style[ name ];
		}

		// Computed unit is not pixels. Stop here and return.
		if ( rnumnonpx.test(val) ) {
			return val;
		}

		// we need the check for style in case a browser which returns unreliable values
		// for getComputedStyle silently falls back to the reliable elem.style
		valueIsBorderBox = isBorderBox && ( jQuery.support.boxSizingReliable || val === elem.style[ name ] );

		// Normalize "", auto, and prepare for extra
		val = parseFloat( val ) || 0;
	}

	// use the active box-sizing model to add/subtract irrelevant styles
	return ( val +
		augmentWidthOrHeight(
			elem,
			name,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox,
			styles
		)
	) + "px";
}

// Try to determine the default display value of an element
function css_defaultDisplay( nodeName ) {
	var doc = document,
		display = elemdisplay[ nodeName ];

	if ( !display ) {
		display = actualDisplay( nodeName, doc );

		// If the simple way fails, read from inside an iframe
		if ( display === "none" || !display ) {
			// Use the already-created iframe if possible
			iframe = ( iframe ||
				jQuery("<iframe frameborder='0' width='0' height='0'/>")
				.css( "cssText", "display:block !important" )
			).appendTo( doc.documentElement );

			// Always write a new HTML skeleton so Webkit and Firefox don't choke on reuse
			doc = ( iframe[0].contentWindow || iframe[0].contentDocument ).document;
			doc.write("<!doctype html><html><body>");
			doc.close();

			display = actualDisplay( nodeName, doc );
			iframe.detach();
		}

		// Store the correct default display
		elemdisplay[ nodeName ] = display;
	}

	return display;
}

// Called ONLY from within css_defaultDisplay
function actualDisplay( name, doc ) {
	var elem = jQuery( doc.createElement( name ) ).appendTo( doc.body ),
		display = jQuery.css( elem[0], "display" );
	elem.remove();
	return display;
}

jQuery.each([ "height", "width" ], function( i, name ) {
	jQuery.cssHooks[ name ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {
				// certain elements can have dimension info if we invisibly show them
				// however, it must have a current display style that would benefit from this
				return elem.offsetWidth === 0 && rdisplayswap.test( jQuery.css( elem, "display" ) ) ?
					jQuery.swap( elem, cssShow, function() {
						return getWidthOrHeight( elem, name, extra );
					}) :
					getWidthOrHeight( elem, name, extra );
			}
		},

		set: function( elem, value, extra ) {
			var styles = extra && getStyles( elem );
			return setPositiveNumber( elem, value, extra ?
				augmentWidthOrHeight(
					elem,
					name,
					extra,
					jQuery.support.boxSizing && jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
					styles
				) : 0
			);
		}
	};
});

if ( !jQuery.support.opacity ) {
	jQuery.cssHooks.opacity = {
		get: function( elem, computed ) {
			// IE uses filters for opacity
			return ropacity.test( (computed && elem.currentStyle ? elem.currentStyle.filter : elem.style.filter) || "" ) ?
				( 0.01 * parseFloat( RegExp.$1 ) ) + "" :
				computed ? "1" : "";
		},

		set: function( elem, value ) {
			var style = elem.style,
				currentStyle = elem.currentStyle,
				opacity = jQuery.isNumeric( value ) ? "alpha(opacity=" + value * 100 + ")" : "",
				filter = currentStyle && currentStyle.filter || style.filter || "";

			// IE has trouble with opacity if it does not have layout
			// Force it by setting the zoom level
			style.zoom = 1;

			// if setting opacity to 1, and no other filters exist - attempt to remove filter attribute #6652
			// if value === "", then remove inline opacity #12685
			if ( ( value >= 1 || value === "" ) &&
					jQuery.trim( filter.replace( ralpha, "" ) ) === "" &&
					style.removeAttribute ) {

				// Setting style.filter to null, "" & " " still leave "filter:" in the cssText
				// if "filter:" is present at all, clearType is disabled, we want to avoid this
				// style.removeAttribute is IE Only, but so apparently is this code path...
				style.removeAttribute( "filter" );

				// if there is no filter style applied in a css rule or unset inline opacity, we are done
				if ( value === "" || currentStyle && !currentStyle.filter ) {
					return;
				}
			}

			// otherwise, set new filter values
			style.filter = ralpha.test( filter ) ?
				filter.replace( ralpha, opacity ) :
				filter + " " + opacity;
		}
	};
}

// These hooks cannot be added until DOM ready because the support test
// for it is not run until after DOM ready
jQuery(function() {
	if ( !jQuery.support.reliableMarginRight ) {
		jQuery.cssHooks.marginRight = {
			get: function( elem, computed ) {
				if ( computed ) {
					// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
					// Work around by temporarily setting element display to inline-block
					return jQuery.swap( elem, { "display": "inline-block" },
						curCSS, [ elem, "marginRight" ] );
				}
			}
		};
	}

	// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
	// getComputedStyle returns percent when specified for top/left/bottom/right
	// rather than make the css module depend on the offset module, we just check for it here
	if ( !jQuery.support.pixelPosition && jQuery.fn.position ) {
		jQuery.each( [ "top", "left" ], function( i, prop ) {
			jQuery.cssHooks[ prop ] = {
				get: function( elem, computed ) {
					if ( computed ) {
						computed = curCSS( elem, prop );
						// if curCSS returns percentage, fallback to offset
						return rnumnonpx.test( computed ) ?
							jQuery( elem ).position()[ prop ] + "px" :
							computed;
					}
				}
			};
		});
	}

});

if ( jQuery.expr && jQuery.expr.filters ) {
	jQuery.expr.filters.hidden = function( elem ) {
		// Support: Opera <= 12.12
		// Opera reports offsetWidths and offsetHeights less than zero on some elements
		return elem.offsetWidth <= 0 && elem.offsetHeight <= 0 ||
			(!jQuery.support.reliableHiddenOffsets && ((elem.style && elem.style.display) || jQuery.css( elem, "display" )) === "none");
	};

	jQuery.expr.filters.visible = function( elem ) {
		return !jQuery.expr.filters.hidden( elem );
	};
}

// These hooks are used by animate to expand properties
jQuery.each({
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i = 0,
				expanded = {},

				// assumes a single number if not a string
				parts = typeof value === "string" ? value.split(" ") : [ value ];

			for ( ; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( !rmargin.test( prefix ) ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
});
var r20 = /%20/g,
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;

jQuery.fn.extend({
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map(function(){
			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		})
		.filter(function(){
			var type = this.type;
			// Use .is(":disabled") so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !manipulation_rcheckableType.test( type ) );
		})
		.map(function( i, elem ){
			var val = jQuery( this ).val();

			return val == null ?
				null :
				jQuery.isArray( val ) ?
					jQuery.map( val, function( val ){
						return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
					}) :
					{ name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		}).get();
	}
});

//Serialize an array of form elements or a set of
//key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, value ) {
			// If value is a function, invoke it and return its value
			value = jQuery.isFunction( value ) ? value() : ( value == null ? "" : value );
			s[ s.length ] = encodeURIComponent( key ) + "=" + encodeURIComponent( value );
		};

	// Set traditional to true for jQuery <= 1.3.2 behavior.
	if ( traditional === undefined ) {
		traditional = jQuery.ajaxSettings && jQuery.ajaxSettings.traditional;
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( jQuery.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {
		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		});

	} else {
		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" ).replace( r20, "+" );
};

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( jQuery.isArray( obj ) ) {
		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {
				// Treat each array item as a scalar.
				add( prefix, v );

			} else {
				// Item is non-scalar (array or object), encode its numeric index.
				buildParams( prefix + "[" + ( typeof v === "object" ? i : "" ) + "]", v, traditional, add );
			}
		});

	} else if ( !traditional && jQuery.type( obj ) === "object" ) {
		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {
		// Serialize scalar item.
		add( prefix, obj );
	}
}
jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup error contextmenu").split(" "), function( i, name ) {

	// Handle event binding
	jQuery.fn[ name ] = function( data, fn ) {
		return arguments.length > 0 ?
			this.on( name, null, data, fn ) :
			this.trigger( name );
	};
});

jQuery.fn.hover = function( fnOver, fnOut ) {
	return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
};
var
	// Document location
	ajaxLocParts,
	ajaxLocation,
	ajax_nonce = jQuery.now(),

	ajax_rquery = /\?/,
	rhash = /#.*$/,
	rts = /([?&])_=[^&]*/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)\r?$/mg, // IE leaves an \r character at EOL
	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,
	rurl = /^([\w.+-]+:)(?:\/\/([^\/?#:]*)(?::(\d+)|)|)/,

	// Keep a copy of the old load method
	_load = jQuery.fn.load,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = "*/".concat("*");

// #8138, IE may throw an exception when accessing
// a field from window.location if document.domain has been set
try {
	ajaxLocation = location.href;
} catch( e ) {
	// Use the href attribute of an A element
	// since IE will modify it given document.location
	ajaxLocation = document.createElement( "a" );
	ajaxLocation.href = "";
	ajaxLocation = ajaxLocation.href;
}

// Segment location into parts
ajaxLocParts = rurl.exec( ajaxLocation.toLowerCase() ) || [];

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType,
			i = 0,
			dataTypes = dataTypeExpression.toLowerCase().match( core_rnotwhite ) || [];

		if ( jQuery.isFunction( func ) ) {
			// For each dataType in the dataTypeExpression
			while ( (dataType = dataTypes[i++]) ) {
				// Prepend if requested
				if ( dataType[0] === "+" ) {
					dataType = dataType.slice( 1 ) || "*";
					(structure[ dataType ] = structure[ dataType ] || []).unshift( func );

				// Otherwise append
				} else {
					(structure[ dataType ] = structure[ dataType ] || []).push( func );
				}
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

	var inspected = {},
		seekingTransport = ( structure === transports );

	function inspect( dataType ) {
		var selected;
		inspected[ dataType ] = true;
		jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
			var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
			if( typeof dataTypeOrTransport === "string" && !seekingTransport && !inspected[ dataTypeOrTransport ] ) {
				options.dataTypes.unshift( dataTypeOrTransport );
				inspect( dataTypeOrTransport );
				return false;
			} else if ( seekingTransport ) {
				return !( selected = dataTypeOrTransport );
			}
		});
		return selected;
	}

	return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var deep, key,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};

	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || (deep = {}) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}

	return target;
}

jQuery.fn.load = function( url, params, callback ) {
	if ( typeof url !== "string" && _load ) {
		return _load.apply( this, arguments );
	}

	var selector, response, type,
		self = this,
		off = url.indexOf(" ");

	if ( off >= 0 ) {
		selector = url.slice( off, url.length );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( jQuery.isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// If we have elements to modify, make the request
	if ( self.length > 0 ) {
		jQuery.ajax({
			url: url,

			// if "type" variable is undefined, then "GET" method will be used
			type: type,
			dataType: "html",
			data: params
		}).done(function( responseText ) {

			// Save response for use in complete callback
			response = arguments;

			self.html( selector ?

				// If a selector was specified, locate the right elements in a dummy div
				// Exclude scripts to avoid IE 'Permission Denied' errors
				jQuery("<div>").append( jQuery.parseHTML( responseText ) ).find( selector ) :

				// Otherwise use the full result
				responseText );

		}).complete( callback && function( jqXHR, status ) {
			self.each( callback, response || [ jqXHR.responseText, status, jqXHR ] );
		});
	}

	return this;
};

// Attach a bunch of functions for handling common AJAX events
jQuery.each( [ "ajaxStart", "ajaxStop", "ajaxComplete", "ajaxError", "ajaxSuccess", "ajaxSend" ], function( i, type ){
	jQuery.fn[ type ] = function( fn ){
		return this.on( type, fn );
	};
});

jQuery.each( [ "get", "post" ], function( i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {
		// shift arguments if data argument was omitted
		if ( jQuery.isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		return jQuery.ajax({
			url: url,
			type: method,
			dataType: type,
			data: data,
			success: callback
		});
	};
});

jQuery.extend({

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {},

	ajaxSettings: {
		url: ajaxLocation,
		type: "GET",
		isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",
		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			"*": allTypes,
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /xml/,
			html: /html/,
			json: /json/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": window.String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": jQuery.parseJSON,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		return settings ?

			// Building a settings object
			ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

			// Extending ajaxSettings
			ajaxExtend( jQuery.ajaxSettings, target );
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var // Cross-domain detection vars
			parts,
			// Loop variable
			i,
			// URL without anti-cache param
			cacheURL,
			// Response headers as string
			responseHeadersString,
			// timeout handle
			timeoutTimer,

			// To know if global events are to be dispatched
			fireGlobals,

			transport,
			// Response headers
			responseHeaders,
			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),
			// Callbacks context
			callbackContext = s.context || s,
			// Context for global events is callbackContext if it is a DOM node or jQuery collection
			globalEventContext = s.context && ( callbackContext.nodeType || callbackContext.jquery ) ?
				jQuery( callbackContext ) :
				jQuery.event,
			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks("once memory"),
			// Status-dependent callbacks
			statusCode = s.statusCode || {},
			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},
			// The jqXHR state
			state = 0,
			// Default abort message
			strAbort = "canceled",
			// Fake xhr
			jqXHR = {
				readyState: 0,

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( state === 2 ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while ( (match = rheaders.exec( responseHeadersString )) ) {
								responseHeaders[ match[1].toLowerCase() ] = match[ 2 ];
							}
						}
						match = responseHeaders[ key.toLowerCase() ];
					}
					return match == null ? null : match;
				},

				// Raw string
				getAllResponseHeaders: function() {
					return state === 2 ? responseHeadersString : null;
				},

				// Caches the header
				setRequestHeader: function( name, value ) {
					var lname = name.toLowerCase();
					if ( !state ) {
						name = requestHeadersNames[ lname ] = requestHeadersNames[ lname ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( !state ) {
						s.mimeType = type;
					}
					return this;
				},

				// Status-dependent callbacks
				statusCode: function( map ) {
					var code;
					if ( map ) {
						if ( state < 2 ) {
							for ( code in map ) {
								// Lazy-add the new callback in a way that preserves old ones
								statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
							}
						} else {
							// Execute the appropriate callbacks
							jqXHR.always( map[ jqXHR.status ] );
						}
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					var finalText = statusText || strAbort;
					if ( transport ) {
						transport.abort( finalText );
					}
					done( 0, finalText );
					return this;
				}
			};

		// Attach deferreds
		deferred.promise( jqXHR ).complete = completeDeferred.add;
		jqXHR.success = jqXHR.done;
		jqXHR.error = jqXHR.fail;

		// Remove hash character (#7531: and string promotion)
		// Add protocol if not provided (#5866: IE7 issue with protocol-less urls)
		// Handle falsy url in the settings object (#10093: consistency with old signature)
		// We also use the url parameter if available
		s.url = ( ( url || s.url || ajaxLocation ) + "" ).replace( rhash, "" ).replace( rprotocol, ajaxLocParts[ 1 ] + "//" );

		// Alias method option to type as per ticket #12004
		s.type = options.method || options.type || s.method || s.type;

		// Extract dataTypes list
		s.dataTypes = jQuery.trim( s.dataType || "*" ).toLowerCase().match( core_rnotwhite ) || [""];

		// A cross-domain request is in order when we have a protocol:host:port mismatch
		if ( s.crossDomain == null ) {
			parts = rurl.exec( s.url.toLowerCase() );
			s.crossDomain = !!( parts &&
				( parts[ 1 ] !== ajaxLocParts[ 1 ] || parts[ 2 ] !== ajaxLocParts[ 2 ] ||
					( parts[ 3 ] || ( parts[ 1 ] === "http:" ? 80 : 443 ) ) !=
						( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? 80 : 443 ) ) )
			);
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( state === 2 ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		fireGlobals = s.global;

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger("ajaxStart");
		}

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Save the URL in case we're toying with the If-Modified-Since
		// and/or If-None-Match header later on
		cacheURL = s.url;

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// If data is available, append data to url
			if ( s.data ) {
				cacheURL = ( s.url += ( ajax_rquery.test( cacheURL ) ? "&" : "?" ) + s.data );
				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Add anti-cache in url if needed
			if ( s.cache === false ) {
				s.url = rts.test( cacheURL ) ?

					// If there is already a '_' parameter, set its value
					cacheURL.replace( rts, "$1_=" + ajax_nonce++ ) :

					// Otherwise add one to the end
					cacheURL + ( ajax_rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + ajax_nonce++;
			}
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			if ( jQuery.lastModified[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
			}
			if ( jQuery.etag[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[0] ] ?
				s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend && ( s.beforeSend.call( callbackContext, jqXHR, s ) === false || state === 2 ) ) {
			// Abort if not done already and return
			return jqXHR.abort();
		}

		// aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		for ( i in { success: 1, error: 1, complete: 1 } ) {
			jqXHR[ i ]( s[ i ] );
		}

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;

			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}
			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = setTimeout(function() {
					jqXHR.abort("timeout");
				}, s.timeout );
			}

			try {
				state = 1;
				transport.send( requestHeaders, done );
			} catch ( e ) {
				// Propagate exception as error if not done
				if ( state < 2 ) {
					done( -1, e );
				// Simply rethrow otherwise
				} else {
					throw e;
				}
			}
		}

		// Callback for when everything is done
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Called once
			if ( state === 2 ) {
				return;
			}

			// State is "done" now
			state = 2;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// If successful, handle type chaining
			if ( status >= 200 && status < 300 || status === 304 ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {
					modified = jqXHR.getResponseHeader("Last-Modified");
					if ( modified ) {
						jQuery.lastModified[ cacheURL ] = modified;
					}
					modified = jqXHR.getResponseHeader("etag");
					if ( modified ) {
						jQuery.etag[ cacheURL ] = modified;
					}
				}

				// if no content
				if ( status === 204 ) {
					isSuccess = true;
					statusText = "nocontent";

				// if not modified
				} else if ( status === 304 ) {
					isSuccess = true;
					statusText = "notmodified";

				// If we have data, let's convert it
				} else {
					isSuccess = ajaxConvert( s, response );
					statusText = isSuccess.state;
					success = isSuccess.data;
					error = isSuccess.error;
					isSuccess = !error;
				}
			} else {
				// We extract error from statusText
				// then normalize statusText and status for non-aborts
				error = statusText;
				if ( status || !statusText ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
					[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );
				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger("ajaxStop");
				}
			}
		}

		return jqXHR;
	},

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	}
});

/* Handles responses to an ajax request:
 * - sets all responseXXX fields accordingly
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {
	var firstDataType, ct, finalDataType, type,
		contents = s.contents,
		dataTypes = s.dataTypes,
		responseFields = s.responseFields;

	// Fill responseXXX fields
	for ( type in responseFields ) {
		if ( type in responses ) {
			jqXHR[ responseFields[type] ] = responses[ type ];
		}
	}

	// Remove auto dataType and get content-type in the process
	while( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader("Content-Type");
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {
		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[0] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}
		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

// Chain conversions given the request and the original response
function ajaxConvert( s, response ) {
	var conv2, current, conv, tmp,
		converters = {},
		i = 0,
		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice(),
		prev = dataTypes[ 0 ];

	// Apply the dataFilter if provided
	if ( s.dataFilter ) {
		response = s.dataFilter( response, s.dataType );
	}

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	// Convert to each sequential dataType, tolerating list modification
	for ( ; (current = dataTypes[++i]); ) {

		// There's only work to do if current dataType is non-auto
		if ( current !== "*" ) {

			// Convert response if prev dataType is non-auto and differs from current
			if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split(" ");
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {
								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.splice( i--, 0, current );
								}

								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s["throws"] ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return { state: "parsererror", error: conv ? e : "No conversion from " + prev + " to " + current };
						}
					}
				}
			}

			// Update prev for next iteration
			prev = current;
		}
	}

	return { state: "success", data: response };
}
// Install script dataType
jQuery.ajaxSetup({
	accepts: {
		script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /(?:java|ecma)script/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
});

// Handle cache's special case and global
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
		s.global = false;
	}
});

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function(s) {

	// This transport only deals with cross domain requests
	if ( s.crossDomain ) {

		var script,
			head = document.head || jQuery("head")[0] || document.documentElement;

		return {

			send: function( _, callback ) {

				script = document.createElement("script");

				script.async = true;

				if ( s.scriptCharset ) {
					script.charset = s.scriptCharset;
				}

				script.src = s.url;

				// Attach handlers for all browsers
				script.onload = script.onreadystatechange = function( _, isAbort ) {

					if ( isAbort || !script.readyState || /loaded|complete/.test( script.readyState ) ) {

						// Handle memory leak in IE
						script.onload = script.onreadystatechange = null;

						// Remove the script
						if ( script.parentNode ) {
							script.parentNode.removeChild( script );
						}

						// Dereference the script
						script = null;

						// Callback if not abort
						if ( !isAbort ) {
							callback( 200, "success" );
						}
					}
				};

				// Circumvent IE6 bugs with base elements (#2709 and #4378) by prepending
				// Use native DOM manipulation to avoid our domManip AJAX trickery
				head.insertBefore( script, head.firstChild );
			},

			abort: function() {
				if ( script ) {
					script.onload( undefined, true );
				}
			}
		};
	}
});
var oldCallbacks = [],
	rjsonp = /(=)\?(?=&|$)|\?\?/;

// Default jsonp settings
jQuery.ajaxSetup({
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( ajax_nonce++ ) );
		this[ callback ] = true;
		return callback;
	}
});

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
			"url" :
			typeof s.data === "string" && !( s.contentType || "" ).indexOf("application/x-www-form-urlencoded") && rjsonp.test( s.data ) && "data"
		);

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = jQuery.isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;

		// Insert callback into url or form data
		if ( jsonProp ) {
			s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
		} else if ( s.jsonp !== false ) {
			s.url += ( ajax_rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters["script json"] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		overwritten = window[ callbackName ];
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always(function() {
			// Restore preexisting value
			window[ callbackName ] = overwritten;

			// Save back as free
			if ( s[ callbackName ] ) {
				// make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && jQuery.isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		});

		// Delegate to script
		return "script";
	}
});
var xhrCallbacks, xhrSupported,
	xhrId = 0,
	// #5280: Internet Explorer will keep connections alive if we don't abort on unload
	xhrOnUnloadAbort = window.ActiveXObject && function() {
		// Abort all pending requests
		var key;
		for ( key in xhrCallbacks ) {
			xhrCallbacks[ key ]( undefined, true );
		}
	};

// Functions to create xhrs
function createStandardXHR() {
	try {
		return new window.XMLHttpRequest();
	} catch( e ) {}
}

function createActiveXHR() {
	try {
		return new window.ActiveXObject("Microsoft.XMLHTTP");
	} catch( e ) {}
}

// Create the request object
// (This is still attached to ajaxSettings for backward compatibility)
jQuery.ajaxSettings.xhr = window.ActiveXObject ?
	/* Microsoft failed to properly
	 * implement the XMLHttpRequest in IE7 (can't request local files),
	 * so we use the ActiveXObject when it is available
	 * Additionally XMLHttpRequest can be disabled in IE7/IE8 so
	 * we need a fallback.
	 */
	function() {
		return !this.isLocal && createStandardXHR() || createActiveXHR();
	} :
	// For all other browsers, use the standard XMLHttpRequest object
	createStandardXHR;

// Determine support properties
xhrSupported = jQuery.ajaxSettings.xhr();
jQuery.support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
xhrSupported = jQuery.support.ajax = !!xhrSupported;

// Create transport if the browser can provide an xhr
if ( xhrSupported ) {

	jQuery.ajaxTransport(function( s ) {
		// Cross domain only allowed if supported through XMLHttpRequest
		if ( !s.crossDomain || jQuery.support.cors ) {

			var callback;

			return {
				send: function( headers, complete ) {

					// Get a new xhr
					var handle, i,
						xhr = s.xhr();

					// Open the socket
					// Passing null username, generates a login popup on Opera (#2865)
					if ( s.username ) {
						xhr.open( s.type, s.url, s.async, s.username, s.password );
					} else {
						xhr.open( s.type, s.url, s.async );
					}

					// Apply custom fields if provided
					if ( s.xhrFields ) {
						for ( i in s.xhrFields ) {
							xhr[ i ] = s.xhrFields[ i ];
						}
					}

					// Override mime type if needed
					if ( s.mimeType && xhr.overrideMimeType ) {
						xhr.overrideMimeType( s.mimeType );
					}

					// X-Requested-With header
					// For cross-domain requests, seeing as conditions for a preflight are
					// akin to a jigsaw puzzle, we simply never set it to be sure.
					// (it can always be set on a per-request basis or even using ajaxSetup)
					// For same-domain requests, won't change header if already provided.
					if ( !s.crossDomain && !headers["X-Requested-With"] ) {
						headers["X-Requested-With"] = "XMLHttpRequest";
					}

					// Need an extra try/catch for cross domain requests in Firefox 3
					try {
						for ( i in headers ) {
							xhr.setRequestHeader( i, headers[ i ] );
						}
					} catch( err ) {}

					// Do send the request
					// This may raise an exception which is actually
					// handled in jQuery.ajax (so no try/catch here)
					xhr.send( ( s.hasContent && s.data ) || null );

					// Listener
					callback = function( _, isAbort ) {
						var status, responseHeaders, statusText, responses;

						// Firefox throws exceptions when accessing properties
						// of an xhr when a network error occurred
						// http://helpful.knobs-dials.com/index.php/Component_returned_failure_code:_0x80040111_(NS_ERROR_NOT_AVAILABLE)
						try {

							// Was never called and is aborted or complete
							if ( callback && ( isAbort || xhr.readyState === 4 ) ) {

								// Only called once
								callback = undefined;

								// Do not keep as active anymore
								if ( handle ) {
									xhr.onreadystatechange = jQuery.noop;
									if ( xhrOnUnloadAbort ) {
										delete xhrCallbacks[ handle ];
									}
								}

								// If it's an abort
								if ( isAbort ) {
									// Abort it manually if needed
									if ( xhr.readyState !== 4 ) {
										xhr.abort();
									}
								} else {
									responses = {};
									status = xhr.status;
									responseHeaders = xhr.getAllResponseHeaders();

									// When requesting binary data, IE6-9 will throw an exception
									// on any attempt to access responseText (#11426)
									if ( typeof xhr.responseText === "string" ) {
										responses.text = xhr.responseText;
									}

									// Firefox throws an exception when accessing
									// statusText for faulty cross-domain requests
									try {
										statusText = xhr.statusText;
									} catch( e ) {
										// We normalize with Webkit giving an empty statusText
										statusText = "";
									}

									// Filter status for non standard behaviors

									// If the request is local and we have data: assume a success
									// (success with no data won't get notified, that's the best we
									// can do given current implementations)
									if ( !status && s.isLocal && !s.crossDomain ) {
										status = responses.text ? 200 : 404;
									// IE - #1450: sometimes returns 1223 when it should be 204
									} else if ( status === 1223 ) {
										status = 204;
									}
								}
							}
						} catch( firefoxAccessException ) {
							if ( !isAbort ) {
								complete( -1, firefoxAccessException );
							}
						}

						// Call complete if needed
						if ( responses ) {
							complete( status, statusText, responses, responseHeaders );
						}
					};

					if ( !s.async ) {
						// if we're in sync mode we fire the callback
						callback();
					} else if ( xhr.readyState === 4 ) {
						// (IE6 & IE7) if it's in cache and has been
						// retrieved directly we need to fire the callback
						setTimeout( callback );
					} else {
						handle = ++xhrId;
						if ( xhrOnUnloadAbort ) {
							// Create the active xhrs callbacks list if needed
							// and attach the unload handler
							if ( !xhrCallbacks ) {
								xhrCallbacks = {};
								jQuery( window ).unload( xhrOnUnloadAbort );
							}
							// Add to list of active xhrs callbacks
							xhrCallbacks[ handle ] = callback;
						}
						xhr.onreadystatechange = callback;
					}
				},

				abort: function() {
					if ( callback ) {
						callback( undefined, true );
					}
				}
			};
		}
	});
}
var fxNow, timerId,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rfxnum = new RegExp( "^(?:([+-])=|)(" + core_pnum + ")([a-z%]*)$", "i" ),
	rrun = /queueHooks$/,
	animationPrefilters = [ defaultPrefilter ],
	tweeners = {
		"*": [function( prop, value ) {
			var end, unit,
				tween = this.createTween( prop, value ),
				parts = rfxnum.exec( value ),
				target = tween.cur(),
				start = +target || 0,
				scale = 1,
				maxIterations = 20;

			if ( parts ) {
				end = +parts[2];
				unit = parts[3] || ( jQuery.cssNumber[ prop ] ? "" : "px" );

				// We need to compute starting value
				if ( unit !== "px" && start ) {
					// Iteratively approximate from a nonzero starting point
					// Prefer the current property, because this process will be trivial if it uses the same units
					// Fallback to end or a simple constant
					start = jQuery.css( tween.elem, prop, true ) || end || 1;

					do {
						// If previous iteration zeroed out, double until we get *something*
						// Use a string for doubling factor so we don't accidentally see scale as unchanged below
						scale = scale || ".5";

						// Adjust and apply
						start = start / scale;
						jQuery.style( tween.elem, prop, start + unit );

					// Update scale, tolerating zero or NaN from tween.cur()
					// And breaking the loop if scale is unchanged or perfect, or if we've just had enough
					} while ( scale !== (scale = tween.cur() / target) && scale !== 1 && --maxIterations );
				}

				tween.unit = unit;
				tween.start = start;
				// If a +=/-= token was provided, we're doing a relative animation
				tween.end = parts[1] ? start + ( parts[1] + 1 ) * end : end;
			}
			return tween;
		}]
	};

// Animations created synchronously will run synchronously
function createFxNow() {
	setTimeout(function() {
		fxNow = undefined;
	});
	return ( fxNow = jQuery.now() );
}

function createTweens( animation, props ) {
	jQuery.each( props, function( prop, value ) {
		var collection = ( tweeners[ prop ] || [] ).concat( tweeners[ "*" ] ),
			index = 0,
			length = collection.length;
		for ( ; index < length; index++ ) {
			if ( collection[ index ].call( animation, prop, value ) ) {

				// we're done with this property
				return;
			}
		}
	});
}

function Animation( elem, properties, options ) {
	var result,
		stopped,
		index = 0,
		length = animationPrefilters.length,
		deferred = jQuery.Deferred().always( function() {
			// don't match elem in the :animated selector
			delete tick.elem;
		}),
		tick = function() {
			if ( stopped ) {
				return false;
			}
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),
				// archaic crash bug won't allow us to use 1 - ( 0.5 || 0 ) (#12497)
				temp = remaining / animation.duration || 0,
				percent = 1 - temp,
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length ; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ]);

			if ( percent < 1 && length ) {
				return remaining;
			} else {
				deferred.resolveWith( elem, [ animation ] );
				return false;
			}
		},
		animation = deferred.promise({
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, { specialEasing: {} }, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
						animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,
					// if we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;
				if ( stopped ) {
					return this;
				}
				stopped = true;
				for ( ; index < length ; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// resolve when we played the last frame
				// otherwise, reject
				if ( gotoEnd ) {
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		}),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length ; index++ ) {
		result = animationPrefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			return result;
		}
	}

	createTweens( animation, props );

	if ( jQuery.isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	jQuery.fx.timer(
		jQuery.extend( tick, {
			elem: elem,
			anim: animation,
			queue: animation.opts.queue
		})
	);

	// attach callbacks from options
	return animation.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );
}

function propFilter( props, specialEasing ) {
	var value, name, index, easing, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = jQuery.camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( jQuery.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// not quite $.extend, this wont overwrite keys already present.
			// also - reusing 'index' from above because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

jQuery.Animation = jQuery.extend( Animation, {

	tweener: function( props, callback ) {
		if ( jQuery.isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.split(" ");
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length ; index++ ) {
			prop = props[ index ];
			tweeners[ prop ] = tweeners[ prop ] || [];
			tweeners[ prop ].unshift( callback );
		}
	},

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			animationPrefilters.unshift( callback );
		} else {
			animationPrefilters.push( callback );
		}
	}
});

function defaultPrefilter( elem, props, opts ) {
	/*jshint validthis:true */
	var prop, index, length,
		value, dataShow, toggle,
		tween, hooks, oldfire,
		anim = this,
		style = elem.style,
		orig = {},
		handled = [],
		hidden = elem.nodeType && isHidden( elem );

	// handle queue: false promises
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always(function() {
			// doing this makes sure that the complete handler will be called
			// before this completes
			anim.always(function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			});
		});
	}

	// height/width overflow pass
	if ( elem.nodeType === 1 && ( "height" in props || "width" in props ) ) {
		// Make sure that nothing sneaks out
		// Record all 3 overflow attributes because IE does not
		// change the overflow attribute when overflowX and
		// overflowY are set to the same value
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Set display property to inline-block for height/width
		// animations on inline elements that are having width/height animated
		if ( jQuery.css( elem, "display" ) === "inline" &&
				jQuery.css( elem, "float" ) === "none" ) {

			// inline-level elements accept inline-block;
			// block-level elements need to be inline with layout
			if ( !jQuery.support.inlineBlockNeedsLayout || css_defaultDisplay( elem.nodeName ) === "inline" ) {
				style.display = "inline-block";

			} else {
				style.zoom = 1;
			}
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		if ( !jQuery.support.shrinkWrapBlocks ) {
			anim.always(function() {
				style.overflow = opts.overflow[ 0 ];
				style.overflowX = opts.overflow[ 1 ];
				style.overflowY = opts.overflow[ 2 ];
			});
		}
	}


	// show/hide pass
	for ( index in props ) {
		value = props[ index ];
		if ( rfxtypes.exec( value ) ) {
			delete props[ index ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {
				continue;
			}
			handled.push( index );
		}
	}

	length = handled.length;
	if ( length ) {
		dataShow = jQuery._data( elem, "fxshow" ) || jQuery._data( elem, "fxshow", {} );
		if ( "hidden" in dataShow ) {
			hidden = dataShow.hidden;
		}

		// store state if its toggle - enables .stop().toggle() to "reverse"
		if ( toggle ) {
			dataShow.hidden = !hidden;
		}
		if ( hidden ) {
			jQuery( elem ).show();
		} else {
			anim.done(function() {
				jQuery( elem ).hide();
			});
		}
		anim.done(function() {
			var prop;
			jQuery._removeData( elem, "fxshow" );
			for ( prop in orig ) {
				jQuery.style( elem, prop, orig[ prop ] );
			}
		});
		for ( index = 0 ; index < length ; index++ ) {
			prop = handled[ index ];
			tween = anim.createTween( prop, hidden ? dataShow[ prop ] : 0 );
			orig[ prop ] = dataShow[ prop ] || jQuery.style( elem, prop );

			if ( !( prop in dataShow ) ) {
				dataShow[ prop ] = tween.start;
				if ( hidden ) {
					tween.end = tween.start;
					tween.start = prop === "width" || prop === "height" ? 1 : 0;
				}
			}
		}
	}
}

function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || "swing";
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			if ( tween.elem[ tween.prop ] != null &&
				(!tween.elem.style || tween.elem.style[ tween.prop ] == null) ) {
				return tween.elem[ tween.prop ];
			}

			// passing an empty string as a 3rd parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails
			// so, simple values such as "10px" are parsed to Float.
			// complex values such as "rotate(1rad)" are returned as is.
			result = jQuery.css( tween.elem, tween.prop, "" );
			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {
			// use step hook for back compat - use cssHook if its there - use .style if its
			// available and use plain properties where available
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.style && ( tween.elem.style[ jQuery.cssProps[ tween.prop ] ] != null || jQuery.cssHooks[ tween.prop ] ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Remove in 2.0 - this supports IE8's panic based approach
// to setting things on disconnected nodes

Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.each([ "toggle", "show", "hide" ], function( i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
});

jQuery.fn.extend({
	fadeTo: function( speed, to, easing, callback ) {

		// show any hidden elements after setting opacity to 0
		return this.filter( isHidden ).css( "opacity", 0 ).show()

			// animate to the value specified
			.end().animate({ opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {
				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );
				doAnimation.finish = function() {
					anim.stop( true );
				};
				// Empty animations, or finishing resolves immediately
				if ( empty || jQuery._data( this, "finish" ) ) {
					anim.stop( true );
				}
			};
			doAnimation.finish = doAnimation;

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue && type !== false ) {
			this.queue( type || "fx", [] );
		}

		return this.each(function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = jQuery._data( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && (type == null || timers[ index ].queue === type) ) {
					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// start the next in the queue if the last step wasn't forced
			// timers currently will call their complete callbacks, which will dequeue
			// but only if they were gotoEnd
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		});
	},
	finish: function( type ) {
		if ( type !== false ) {
			type = type || "fx";
		}
		return this.each(function() {
			var index,
				data = jQuery._data( this ),
				queue = data[ type + "queue" ],
				hooks = data[ type + "queueHooks" ],
				timers = jQuery.timers,
				length = queue ? queue.length : 0;

			// enable finishing flag on private data
			data.finish = true;

			// empty the queue first
			jQuery.queue( this, type, [] );

			if ( hooks && hooks.cur && hooks.cur.finish ) {
				hooks.cur.finish.call( this );
			}

			// look for any active animations, and finish them
			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
					timers[ index ].anim.stop( true );
					timers.splice( index, 1 );
				}
			}

			// look for any animations in the old queue and finish them
			for ( index = 0; index < length; index++ ) {
				if ( queue[ index ] && queue[ index ].finish ) {
					queue[ index ].finish.call( this );
				}
			}

			// turn off finishing flag
			delete data.finish;
		});
	}
});

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		attrs = { height: type },
		i = 0;

	// if we include width, step value is 1 to do all cssExpand values,
	// if we don't include width, step value is 2 to skip over Left and Right
	includeWidth = includeWidth? 1 : 0;
	for( ; i < 4 ; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

// Generate shortcuts for custom animations
jQuery.each({
	slideDown: genFx("show"),
	slideUp: genFx("hide"),
	slideToggle: genFx("toggle"),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
});

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			jQuery.isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !jQuery.isFunction( easing ) && easing
	};

	opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
		opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[ opt.duration ] : jQuery.fx.speeds._default;

	// normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( jQuery.isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p*Math.PI ) / 2;
	}
};

jQuery.timers = [];
jQuery.fx = Tween.prototype.init;
jQuery.fx.tick = function() {
	var timer,
		timers = jQuery.timers,
		i = 0;

	fxNow = jQuery.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];
		// Checks the timer has not already been removed
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	if ( timer() && jQuery.timers.push( timer ) ) {
		jQuery.fx.start();
	}
};

jQuery.fx.interval = 13;

jQuery.fx.start = function() {
	if ( !timerId ) {
		timerId = setInterval( jQuery.fx.tick, jQuery.fx.interval );
	}
};

jQuery.fx.stop = function() {
	clearInterval( timerId );
	timerId = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,
	// Default speed
	_default: 400
};

// Back Compat <1.8 extension point
jQuery.fx.step = {};

if ( jQuery.expr && jQuery.expr.filters ) {
	jQuery.expr.filters.animated = function( elem ) {
		return jQuery.grep(jQuery.timers, function( fn ) {
			return elem === fn.elem;
		}).length;
	};
}
jQuery.fn.offset = function( options ) {
	if ( arguments.length ) {
		return options === undefined ?
			this :
			this.each(function( i ) {
				jQuery.offset.setOffset( this, options, i );
			});
	}

	var docElem, win,
		box = { top: 0, left: 0 },
		elem = this[ 0 ],
		doc = elem && elem.ownerDocument;

	if ( !doc ) {
		return;
	}

	docElem = doc.documentElement;

	// Make sure it's not a disconnected DOM node
	if ( !jQuery.contains( docElem, elem ) ) {
		return box;
	}

	// If we don't have gBCR, just use 0,0 rather than error
	// BlackBerry 5, iOS 3 (original iPhone)
	if ( typeof elem.getBoundingClientRect !== core_strundefined ) {
		box = elem.getBoundingClientRect();
	}
	win = getWindow( doc );
	return {
		top: box.top  + ( win.pageYOffset || docElem.scrollTop )  - ( docElem.clientTop  || 0 ),
		left: box.left + ( win.pageXOffset || docElem.scrollLeft ) - ( docElem.clientLeft || 0 )
	};
};

jQuery.offset = {

	setOffset: function( elem, options, i ) {
		var position = jQuery.css( elem, "position" );

		// set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		var curElem = jQuery( elem ),
			curOffset = curElem.offset(),
			curCSSTop = jQuery.css( elem, "top" ),
			curCSSLeft = jQuery.css( elem, "left" ),
			calculatePosition = ( position === "absolute" || position === "fixed" ) && jQuery.inArray("auto", [curCSSTop, curCSSLeft]) > -1,
			props = {}, curPosition = {}, curTop, curLeft;

		// need to be able to calculate position if either top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;
		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( jQuery.isFunction( options ) ) {
			options = options.call( elem, i, curOffset );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );
		} else {
			curElem.css( props );
		}
	}
};


jQuery.fn.extend({

	position: function() {
		if ( !this[ 0 ] ) {
			return;
		}

		var offsetParent, offset,
			parentOffset = { top: 0, left: 0 },
			elem = this[ 0 ];

		// fixed elements are offset from window (parentOffset = {top:0, left: 0}, because it is it's only offset parent
		if ( jQuery.css( elem, "position" ) === "fixed" ) {
			// we assume that getBoundingClientRect is available when computed position is fixed
			offset = elem.getBoundingClientRect();
		} else {
			// Get *real* offsetParent
			offsetParent = this.offsetParent();

			// Get correct offsets
			offset = this.offset();
			if ( !jQuery.nodeName( offsetParent[ 0 ], "html" ) ) {
				parentOffset = offsetParent.offset();
			}

			// Add offsetParent borders
			parentOffset.top  += jQuery.css( offsetParent[ 0 ], "borderTopWidth", true );
			parentOffset.left += jQuery.css( offsetParent[ 0 ], "borderLeftWidth", true );
		}

		// Subtract parent offsets and element margins
		// note: when an element has margin: auto the offsetLeft and marginLeft
		// are the same in Safari causing offset.left to incorrectly be 0
		return {
			top:  offset.top  - parentOffset.top - jQuery.css( elem, "marginTop", true ),
			left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true)
		};
	},

	offsetParent: function() {
		return this.map(function() {
			var offsetParent = this.offsetParent || document.documentElement;
			while ( offsetParent && ( !jQuery.nodeName( offsetParent, "html" ) && jQuery.css( offsetParent, "position") === "static" ) ) {
				offsetParent = offsetParent.offsetParent;
			}
			return offsetParent || document.documentElement;
		});
	}
});


// Create scrollLeft and scrollTop methods
jQuery.each( {scrollLeft: "pageXOffset", scrollTop: "pageYOffset"}, function( method, prop ) {
	var top = /Y/.test( prop );

	jQuery.fn[ method ] = function( val ) {
		return jQuery.access( this, function( elem, method, val ) {
			var win = getWindow( elem );

			if ( val === undefined ) {
				return win ? (prop in win) ? win[ prop ] :
					win.document.documentElement[ method ] :
					elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : jQuery( win ).scrollLeft(),
					top ? val : jQuery( win ).scrollTop()
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length, null );
	};
});

function getWindow( elem ) {
	return jQuery.isWindow( elem ) ?
		elem :
		elem.nodeType === 9 ?
			elem.defaultView || elem.parentWindow :
			false;
}
// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name }, function( defaultExtra, funcName ) {
		// margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return jQuery.access( this, function( elem, type, value ) {
				var doc;

				if ( jQuery.isWindow( elem ) ) {
					// As of 5/8/2012 this will yield incorrect results for Mobile Safari, but there
					// isn't a whole lot we can do. See pull request at this URL for discussion:
					// https://github.com/jquery/jquery/pull/764
					return elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height], whichever is greatest
					// unfortunately, this causes bug #3838 in IE6/8 only, but there is currently no good, small way to fix it.
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?
					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable, null );
		};
	});
});
// Limit scope pollution from any deprecated API
// (function() {

// })();
// Expose jQuery to the global object
window.jQuery = window.$ = jQuery;

// Expose jQuery as an AMD module, but only for AMD loaders that
// understand the issues with loading multiple versions of jQuery
// in a page that all might call define(). The loader will indicate
// they have special allowances for multiple jQuery versions by
// specifying define.amd.jQuery = true. Register as a named module,
// since jQuery can be concatenated with other files that may use define,
// but not use a proper concatenation script that understands anonymous
// AMD modules. A named AMD is safest and most robust way to register.
// Lowercase jquery is used because AMD module names are derived from
// file names, and jQuery is normally delivered in a lowercase file name.
// Do this after creating the global so that if an AMD module wants to call
// noConflict to hide this version of jQuery, it will work.
if ( typeof define === "function" && define.amd && define.amd.jQuery ) {
	define( "jquery", [], function () { return jQuery; } );
}

})( window );
/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * The system module encapsulates the most basic features used by other modules.
 * @module system
 * @requires require
 * @requires jquery
 */
define('durandal/system',['require', 'jquery'], function(require, $) {
    var isDebugging = false,
        nativeKeys = Object.keys,
        hasOwnProperty = Object.prototype.hasOwnProperty,
        toString = Object.prototype.toString,
        system,
        treatAsIE8 = false,
        nativeIsArray = Array.isArray,
        slice = Array.prototype.slice;

    //polyfill from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/Trim
    if (!String.prototype.trim) {
        String.prototype.trim = function () {
            return this.replace(/^\s+|\s+$/g, '');
        };
    }

    //see http://patik.com/blog/complete-cross-browser-console-log/
    // Tell IE9 to use its built-in console
    if (Function.prototype.bind && (typeof console === 'object' || typeof console === 'function') && typeof console.log == 'object') {
        try {
            ['log', 'info', 'warn', 'error', 'assert', 'dir', 'clear', 'profile', 'profileEnd']
                .forEach(function(method) {
                    console[method] = this.call(console[method], console);
                }, Function.prototype.bind);
        } catch (ex) {
            treatAsIE8 = true;
        }
    }

    // callback for dojo's loader 
    // note: if you wish to use Durandal with dojo's AMD loader,
    // currently you must fork the dojo source with the following
    // dojo/dojo.js, line 1187, the last line of the finishExec() function: 
    //  (add) signal("moduleLoaded", [module.result, module.mid]);
    // an enhancement request has been submitted to dojo to make this
    // a permanent change. To view the status of this request, visit:
    // http://bugs.dojotoolkit.org/ticket/16727

    if (require.on) {
        require.on("moduleLoaded", function(module, mid) {
            system.setModuleId(module, mid);
        });
    }

    // callback for require.js loader
    if (typeof requirejs !== 'undefined') {
        requirejs.onResourceLoad = function(context, map, depArray) {
            system.setModuleId(context.defined[map.id], map.id);
        };
    }

    var noop = function() { };

    var log = function() {
        try {
            // Modern browsers
            if (typeof console != 'undefined' && typeof console.log == 'function') {
                // Opera 11
                if (window.opera) {
                    var i = 0;
                    while (i < arguments.length) {
                        console.log('Item ' + (i + 1) + ': ' + arguments[i]);
                        i++;
                    }
                }
                // All other modern browsers
                else if ((slice.call(arguments)).length == 1 && typeof slice.call(arguments)[0] == 'string') {
                    console.log((slice.call(arguments)).toString());
                } else {
                    console.log.apply(console, slice.call(arguments));
                }
            }
            // IE8
            else if ((!Function.prototype.bind || treatAsIE8) && typeof console != 'undefined' && typeof console.log == 'object') {
                Function.prototype.call.call(console.log, console, slice.call(arguments));
            }

            // IE7 and lower, and other old browsers
        } catch (ignore) { }
    };

    var logError = function(error, err) {
        var exception;
        
        if(error instanceof Error){
            exception = error;
        } else {
            exception = new Error(error);
        }
        
        exception.innerError = err;
        
        //Report the error as an error, not as a log
        try {
            // Modern browsers (it's only a single item, no need for argument splitting as in log() above)
            if (typeof console != 'undefined' && typeof console.error == 'function') {
                console.error(exception);
            }
            // IE8
            else if ((!Function.prototype.bind || treatAsIE8) && typeof console != 'undefined' && typeof console.error == 'object') {
                Function.prototype.call.call(console.error, console, exception);
            }
            // IE7 and lower, and other old browsers
        } catch (ignore) { }

        throw exception;
    };

    /**
     * @class SystemModule
     * @static
     */
    system = {
        /**
         * Durandal's version.
         * @property {string} version
         */
        version: "2.1.0",
        /**
         * A noop function.
         * @method noop
         */
        noop: noop,
        /**
         * Gets the module id for the specified object.
         * @method getModuleId
         * @param {object} obj The object whose module id you wish to determine.
         * @return {string} The module id.
         */
        getModuleId: function(obj) {
            if (!obj) {
                return null;
            }

            if (typeof obj == 'function' && obj.prototype) {
                return obj.prototype.__moduleId__;
            }

            if (typeof obj == 'string') {
                return null;
            }

            return obj.__moduleId__;
        },
        /**
         * Sets the module id for the specified object.
         * @method setModuleId
         * @param {object} obj The object whose module id you wish to set.
         * @param {string} id The id to set for the specified object.
         */
        setModuleId: function(obj, id) {
            if (!obj) {
                return;
            }

            if (typeof obj == 'function' && obj.prototype) {
                obj.prototype.__moduleId__ = id;
                return;
            }

            if (typeof obj == 'string') {
                return;
            }

            obj.__moduleId__ = id;
        },
        /**
         * Resolves the default object instance for a module. If the module is an object, the module is returned. If the module is a function, that function is called with `new` and it's result is returned.
         * @method resolveObject
         * @param {object} module The module to use to get/create the default object for.
         * @return {object} The default object for the module.
         */
        resolveObject: function(module) {
            if (system.isFunction(module)) {
                return new module();
            } else {
                return module;
            }
        },
        /**
         * Gets/Sets whether or not Durandal is in debug mode.
         * @method debug
         * @param {boolean} [enable] Turns on/off debugging.
         * @return {boolean} Whether or not Durandal is current debugging.
         */
        debug: function(enable) {
            if (arguments.length == 1) {
                isDebugging = enable;
                if (isDebugging) {
                    this.log = log;
                    this.error = logError;
                    this.log('Debug:Enabled');
                } else {
                    this.log('Debug:Disabled');
                    this.log = noop;
                    this.error = noop;
                }
            }

            return isDebugging;
        },
        /**
         * Logs data to the console. Pass any number of parameters to be logged. Log output is not processed if the framework is not running in debug mode.
         * @method log
         * @param {object} info* The objects to log.
         */
        log: noop,
        /**
         * Logs an error.
         * @method error
         * @param {string|Error} obj The error to report.
         */
        error: noop,
        /**
         * Asserts a condition by throwing an error if the condition fails.
         * @method assert
         * @param {boolean} condition The condition to check.
         * @param {string} message The message to report in the error if the condition check fails.
         */
        assert: function (condition, message) {
            if (!condition) {
                system.error(new Error(message || 'Assert:Failed'));
            }
        },
        /**
         * Creates a deferred object which can be used to create a promise. Optionally pass a function action to perform which will be passed an object used in resolving the promise.
         * @method defer
         * @param {function} [action] The action to defer. You will be passed the deferred object as a paramter.
         * @return {Deferred} The deferred object.
         */
        defer: function(action) {
            return $.Deferred(action);
        },
        /**
         * Creates a simple V4 UUID. This should not be used as a PK in your database. It can be used to generate internal, unique ids. For a more robust solution see [node-uuid](https://github.com/broofa/node-uuid).
         * @method guid
         * @return {string} The guid.
         */
        guid: function() {
            var d = new Date().getTime();
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = (d + Math.random() * 16) % 16 | 0;
                d = Math.floor(d/16);
                return (c == 'x' ? r : (r & 0x7 | 0x8)).toString(16);
            });
        },
        /**
         * Uses require.js to obtain a module. This function returns a promise which resolves with the module instance. You can pass more than one module id to this function or an array of ids. If more than one or an array is passed, then the promise will resolve with an array of module instances.
         * @method acquire
         * @param {string|string[]} moduleId The id(s) of the modules to load.
         * @return {Promise} A promise for the loaded module(s).
         */
        acquire: function() {
            var modules,
                first = arguments[0],
                arrayRequest = false;

            if(system.isArray(first)){
                modules = first;
                arrayRequest = true;
            }else{
                modules = slice.call(arguments, 0);
            }

            return this.defer(function(dfd) {
                require(modules, function() {
                    var args = arguments;
                    setTimeout(function() {
                        if(args.length > 1 || arrayRequest){
                            dfd.resolve(slice.call(args, 0));
                        }else{
                            dfd.resolve(args[0]);
                        }
                    }, 1);
                }, function(err){
                    dfd.reject(err);
                });
            }).promise();
        },
        /**
         * Extends the first object with the properties of the following objects.
         * @method extend
         * @param {object} obj The target object to extend.
         * @param {object} extension* Uses to extend the target object.
         */
        extend: function(obj) {
            var rest = slice.call(arguments, 1);

            for (var i = 0; i < rest.length; i++) {
                var source = rest[i];

                if (source) {
                    for (var prop in source) {
                        obj[prop] = source[prop];
                    }
                }
            }

            return obj;
        },
        /**
         * Uses a setTimeout to wait the specified milliseconds.
         * @method wait
         * @param {number} milliseconds The number of milliseconds to wait.
         * @return {Promise}
         */
        wait: function(milliseconds) {
            return system.defer(function(dfd) {
                setTimeout(dfd.resolve, milliseconds);
            }).promise();
        }
    };

    /**
     * Gets all the owned keys of the specified object.
     * @method keys
     * @param {object} object The object whose owned keys should be returned.
     * @return {string[]} The keys.
     */
    system.keys = nativeKeys || function(obj) {
        if (obj !== Object(obj)) {
            throw new TypeError('Invalid object');
        }

        var keys = [];

        for (var key in obj) {
            if (hasOwnProperty.call(obj, key)) {
                keys[keys.length] = key;
            }
        }

        return keys;
    };

    /**
     * Determines if the specified object is an html element.
     * @method isElement
     * @param {object} object The object to check.
     * @return {boolean} True if matches the type, false otherwise.
     */
    system.isElement = function(obj) {
        return !!(obj && obj.nodeType === 1);
    };

    /**
     * Determines if the specified object is an array.
     * @method isArray
     * @param {object} object The object to check.
     * @return {boolean} True if matches the type, false otherwise.
     */
    system.isArray = nativeIsArray || function(obj) {
        return toString.call(obj) == '[object Array]';
    };

    /**
     * Determines if the specified object is...an object. ie. Not an array, string, etc.
     * @method isObject
     * @param {object} object The object to check.
     * @return {boolean} True if matches the type, false otherwise.
     */
    system.isObject = function(obj) {
        return obj === Object(obj);
    };

    /**
     * Determines if the specified object is a boolean.
     * @method isBoolean
     * @param {object} object The object to check.
     * @return {boolean} True if matches the type, false otherwise.
     */
    system.isBoolean = function(obj) {
        return typeof(obj) === "boolean";
    };

    /**
     * Determines if the specified object is a promise.
     * @method isPromise
     * @param {object} object The object to check.
     * @return {boolean} True if matches the type, false otherwise.
     */
    system.isPromise = function(obj) {
        return obj && system.isFunction(obj.then);
    };

    /**
     * Determines if the specified object is a function arguments object.
     * @method isArguments
     * @param {object} object The object to check.
     * @return {boolean} True if matches the type, false otherwise.
     */

    /**
     * Determines if the specified object is a function.
     * @method isFunction
     * @param {object} object The object to check.
     * @return {boolean} True if matches the type, false otherwise.
     */

    /**
     * Determines if the specified object is a string.
     * @method isString
     * @param {object} object The object to check.
     * @return {boolean} True if matches the type, false otherwise.
     */

    /**
     * Determines if the specified object is a number.
     * @method isNumber
     * @param {object} object The object to check.
     * @return {boolean} True if matches the type, false otherwise.
     */

    /**
     * Determines if the specified object is a date.
     * @method isDate
     * @param {object} object The object to check.
     * @return {boolean} True if matches the type, false otherwise.
     */

    /**
     * Determines if the specified object is a boolean.
     * @method isBoolean
     * @param {object} object The object to check.
     * @return {boolean} True if matches the type, false otherwise.
     */

    //isArguments, isFunction, isString, isNumber, isDate, isRegExp.
    var isChecks = ['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'];

    function makeIsFunction(name) {
        var value = '[object ' + name + ']';
        system['is' + name] = function(obj) {
            return toString.call(obj) == value;
        };
    }

    for (var i = 0; i < isChecks.length; i++) {
        makeIsFunction(isChecks[i]);
    }

    return system;
});

/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * The viewEngine module provides information to the viewLocator module which is used to locate the view's source file. The viewEngine also transforms a view id into a view instance.
 * @module viewEngine
 * @requires system
 * @requires jquery
 */
define('durandal/viewEngine',['durandal/system', 'jquery'], function (system, $) {
    var parseMarkup;

    if ($.parseHTML) {
        parseMarkup = function (html) {
            return $.parseHTML(html);
        };
    } else {
        parseMarkup = function (html) {
            return $(html).get();
        };
    }

    /**
     * @class ViewEngineModule
     * @static
     */
    return {
        cache:{},
        /**
         * The file extension that view source files are expected to have.
         * @property {string} viewExtension
         * @default .html
         */
        viewExtension: '.html',
        /**
         * The name of the RequireJS loader plugin used by the viewLocator to obtain the view source. (Use requirejs to map the plugin's full path).
         * @property {string} viewPlugin
         * @default text
         */
        viewPlugin: 'text',
        /**
         * Parameters passed to the RequireJS loader plugin used by the viewLocator to obtain the view source.
         * @property {string} viewPluginParameters
         * @default The empty string by default.
         */
        viewPluginParameters: '',
        /**
         * Determines if the url is a url for a view, according to the view engine.
         * @method isViewUrl
         * @param {string} url The potential view url.
         * @return {boolean} True if the url is a view url, false otherwise.
         */
        isViewUrl: function (url) {
            return url.indexOf(this.viewExtension, url.length - this.viewExtension.length) !== -1;
        },
        /**
         * Converts a view url into a view id.
         * @method convertViewUrlToViewId
         * @param {string} url The url to convert.
         * @return {string} The view id.
         */
        convertViewUrlToViewId: function (url) {
            return url.substring(0, url.length - this.viewExtension.length);
        },
        /**
         * Converts a view id into a full RequireJS path.
         * @method convertViewIdToRequirePath
         * @param {string} viewId The view id to convert.
         * @return {string} The require path.
         */
        convertViewIdToRequirePath: function (viewId) {
            var plugin = this.viewPlugin ? this.viewPlugin + '!' : '';
            return plugin + viewId + this.viewExtension + this.viewPluginParameters;
        },
        /**
         * Parses the view engine recognized markup and returns DOM elements.
         * @method parseMarkup
         * @param {string} markup The markup to parse.
         * @return {DOMElement[]} The elements.
         */
        parseMarkup: parseMarkup,
        /**
         * Calls `parseMarkup` and then pipes the results through `ensureSingleElement`.
         * @method processMarkup
         * @param {string} markup The markup to process.
         * @return {DOMElement} The view.
         */
        processMarkup: function (markup) {
            var allElements = this.parseMarkup(markup);
            return this.ensureSingleElement(allElements);
        },
        /**
         * Converts an array of elements into a single element. White space and comments are removed. If a single element does not remain, then the elements are wrapped.
         * @method ensureSingleElement
         * @param {DOMElement[]} allElements The elements.
         * @return {DOMElement} A single element.
         */
        ensureSingleElement:function(allElements){
            if (allElements.length == 1) {
                return allElements[0];
            }

            var withoutCommentsOrEmptyText = [];

            for (var i = 0; i < allElements.length; i++) {
                var current = allElements[i];
                if (current.nodeType != 8) {
                    if (current.nodeType == 3) {
                        var result = /\S/.test(current.nodeValue);
                        if (!result) {
                            continue;
                        }
                    }

                    withoutCommentsOrEmptyText.push(current);
                }
            }

            if (withoutCommentsOrEmptyText.length > 1) {
                return $(withoutCommentsOrEmptyText).wrapAll('<div class="durandal-wrapper"></div>').parent().get(0);
            }

            return withoutCommentsOrEmptyText[0];
        },
        /**
         * Gets the view associated with the id from the cache of parsed views.
         * @method tryGetViewFromCache
         * @param {string} id The view id to lookup in the cache.
         * @return {DOMElement|null} The cached view or null if it's not in the cache.
         */
        tryGetViewFromCache:function(id) {
            return this.cache[id];
        },
        /**
         * Puts the view associated with the id into the cache of parsed views.
         * @method putViewInCache
         * @param {string} id The view id whose view should be cached.
         * @param {DOMElement} view The view to cache.
         */
        putViewInCache: function (id, view) {
            this.cache[id] = view;
        },
        /**
         * Creates the view associated with the view id.
         * @method createView
         * @param {string} viewId The view id whose view should be created.
         * @return {Promise} A promise of the view.
         */
        createView: function(viewId) {
            var that = this;
            var requirePath = this.convertViewIdToRequirePath(viewId);
            var existing = this.tryGetViewFromCache(requirePath);

            if (existing) {
                return system.defer(function(dfd) {
                    dfd.resolve(existing.cloneNode(true));
                }).promise();
            }

            return system.defer(function(dfd) {
                system.acquire(requirePath).then(function(markup) {
                    var element = that.processMarkup(markup);
                    element.setAttribute('data-view', viewId);
                    that.putViewInCache(requirePath, element);
                    dfd.resolve(element.cloneNode(true));
                }).fail(function(err) {
                    that.createFallbackView(viewId, requirePath, err).then(function(element) {
                        element.setAttribute('data-view', viewId);
                        that.cache[requirePath] = element;
                        dfd.resolve(element.cloneNode(true));
                    });
                });
            }).promise();
        },
        /**
         * Called when a view cannot be found to provide the opportunity to locate or generate a fallback view. Mainly used to ease development.
         * @method createFallbackView
         * @param {string} viewId The view id whose view should be created.
         * @param {string} requirePath The require path that was attempted.
         * @param {Error} requirePath The error that was returned from the attempt to locate the default view.
         * @return {Promise} A promise for the fallback view.
         */
        createFallbackView: function (viewId, requirePath, err) {
            var that = this,
                message = 'View Not Found. Searched for "' + viewId + '" via path "' + requirePath + '".';

            return system.defer(function(dfd) {
                dfd.resolve(that.processMarkup('<div class="durandal-view-404">' + message + '</div>'));
            }).promise();
        }
    };
});

/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * The viewLocator module collaborates with the viewEngine module to provide views (literally dom sub-trees) to other parts of the framework as needed. The primary consumer of the viewLocator is the composition module.
 * @module viewLocator
 * @requires system
 * @requires viewEngine
 */
define('durandal/viewLocator',['durandal/system', 'durandal/viewEngine'], function (system, viewEngine) {
    function findInElements(nodes, url) {
        for (var i = 0; i < nodes.length; i++) {
            var current = nodes[i];
            var existingUrl = current.getAttribute('data-view');
            if (existingUrl == url) {
                return current;
            }
        }
    }
    
    function escape(str) {
        return (str + '').replace(/([\\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:])/g, "\\$1");
    }

    /**
     * @class ViewLocatorModule
     * @static
     */
    return {
        /**
         * Allows you to set up a convention for mapping module folders to view folders. It is a convenience method that customizes `convertModuleIdToViewId` and `translateViewIdToArea` under the covers.
         * @method useConvention
         * @param {string} [modulesPath] A string to match in the path and replace with the viewsPath. If not specified, the match is 'viewmodels'.
         * @param {string} [viewsPath] The replacement for the modulesPath. If not specified, the replacement is 'views'.
         * @param {string} [areasPath] Partial views are mapped to the "views" folder if not specified. Use this parameter to change their location.
         */
        useConvention: function(modulesPath, viewsPath, areasPath) {
            modulesPath = modulesPath || 'viewmodels';
            viewsPath = viewsPath || 'views';
            areasPath = areasPath || viewsPath;

            var reg = new RegExp(escape(modulesPath), 'gi');

            this.convertModuleIdToViewId = function (moduleId) {
                return moduleId.replace(reg, viewsPath);
            };

            this.translateViewIdToArea = function (viewId, area) {
                if (!area || area == 'partial') {
                    return areasPath + '/' + viewId;
                }
                
                return areasPath + '/' + area + '/' + viewId;
            };
        },
        /**
         * Maps an object instance to a view instance.
         * @method locateViewForObject
         * @param {object} obj The object to locate the view for.
         * @param {string} [area] The area to translate the view to.
         * @param {DOMElement[]} [elementsToSearch] An existing set of elements to search first.
         * @return {Promise} A promise of the view.
         */
        locateViewForObject: function(obj, area, elementsToSearch) {
            var view;

            if (obj.getView) {
                view = obj.getView();
                if (view) {
                    return this.locateView(view, area, elementsToSearch);
                }
            }

            if (obj.viewUrl) {
                return this.locateView(obj.viewUrl, area, elementsToSearch);
            }

            var id = system.getModuleId(obj);
            if (id) {
                return this.locateView(this.convertModuleIdToViewId(id), area, elementsToSearch);
            }

            return this.locateView(this.determineFallbackViewId(obj), area, elementsToSearch);
        },
        /**
         * Converts a module id into a view id. By default the ids are the same.
         * @method convertModuleIdToViewId
         * @param {string} moduleId The module id.
         * @return {string} The view id.
         */
        convertModuleIdToViewId: function(moduleId) {
            return moduleId;
        },
        /**
         * If no view id can be determined, this function is called to genreate one. By default it attempts to determine the object's type and use that.
         * @method determineFallbackViewId
         * @param {object} obj The object to determine the fallback id for.
         * @return {string} The view id.
         */
        determineFallbackViewId: function (obj) {
            var funcNameRegex = /function (.{1,})\(/;
            var results = (funcNameRegex).exec((obj).constructor.toString());
            var typeName = (results && results.length > 1) ? results[1] : "";
            typeName = typeName.trim();
            return 'views/' + typeName;
        },
        /**
         * Takes a view id and translates it into a particular area. By default, no translation occurs.
         * @method translateViewIdToArea
         * @param {string} viewId The view id.
         * @param {string} area The area to translate the view to.
         * @return {string} The translated view id.
         */
        translateViewIdToArea: function (viewId, area) {
            return viewId;
        },
        /**
         * Locates the specified view.
         * @method locateView
         * @param {string|DOMElement} viewOrUrlOrId A view, view url or view id to locate.
         * @param {string} [area] The area to translate the view to.
         * @param {DOMElement[]} [elementsToSearch] An existing set of elements to search first.
         * @return {Promise} A promise of the view.
         */
        locateView: function(viewOrUrlOrId, area, elementsToSearch) {
            if (typeof viewOrUrlOrId === 'string') {
                var viewId;

                if (viewEngine.isViewUrl(viewOrUrlOrId)) {
                    viewId = viewEngine.convertViewUrlToViewId(viewOrUrlOrId);
                } else {
                    viewId = viewOrUrlOrId;
                }

                if (area) {
                    viewId = this.translateViewIdToArea(viewId, area);
                }

                if (elementsToSearch) {
                    var existing = findInElements(elementsToSearch, viewId);
                    if (existing) {
                        return system.defer(function(dfd) {
                            dfd.resolve(existing);
                        }).promise();
                    }
                }

                return viewEngine.createView(viewId);
            }

            return system.defer(function(dfd) {
                dfd.resolve(viewOrUrlOrId);
            }).promise();
        }
    };
});

// Knockout JavaScript library v3.1.0
// (c) Steven Sanderson - http://knockoutjs.com/
// License: MIT (http://www.opensource.org/licenses/mit-license.php)

(function() {(function(p){var A=this||(0,eval)("this"),w=A.document,K=A.navigator,t=A.jQuery,C=A.JSON;(function(p){"function"===typeof require&&"object"===typeof exports&&"object"===typeof module?p(module.exports||exports):"function"===typeof define&&define.amd?define('knockout',["exports"],p):p(A.ko={})})(function(z){function G(a,c){return null===a||typeof a in M?a===c:!1}function N(a,c){var d;return function(){d||(d=setTimeout(function(){d=p;a()},c))}}function O(a,c){var d;return function(){clearTimeout(d);d=setTimeout(a,
c)}}function H(b,c,d,e){a.d[b]={init:function(b,h,g,k,l){var n,r;a.ba(function(){var g=a.a.c(h()),k=!d!==!g,s=!r;if(s||c||k!==n)s&&a.ca.fa()&&(r=a.a.lb(a.e.childNodes(b),!0)),k?(s||a.e.U(b,a.a.lb(r)),a.gb(e?e(l,g):l,b)):a.e.da(b),n=k},null,{G:b});return{controlsDescendantBindings:!0}}};a.g.aa[b]=!1;a.e.Q[b]=!0}var a="undefined"!==typeof z?z:{};a.b=function(b,c){for(var d=b.split("."),e=a,f=0;f<d.length-1;f++)e=e[d[f]];e[d[d.length-1]]=c};a.s=function(a,c,d){a[c]=d};a.version="3.1.0";a.b("version",
a.version);a.a=function(){function b(a,b){for(var c in a)a.hasOwnProperty(c)&&b(c,a[c])}function c(a,b){if(b)for(var c in b)b.hasOwnProperty(c)&&(a[c]=b[c]);return a}function d(a,b){a.__proto__=b;return a}var e={__proto__:[]}instanceof Array,f={},h={};f[K&&/Firefox\/2/i.test(K.userAgent)?"KeyboardEvent":"UIEvents"]=["keyup","keydown","keypress"];f.MouseEvents="click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave".split(" ");b(f,function(a,b){if(b.length)for(var c=0,
d=b.length;c<d;c++)h[b[c]]=a});var g={propertychange:!0},k=w&&function(){for(var a=3,b=w.createElement("div"),c=b.getElementsByTagName("i");b.innerHTML="\x3c!--[if gt IE "+ ++a+"]><i></i><![endif]--\x3e",c[0];);return 4<a?a:p}();return{mb:["authenticity_token",/^__RequestVerificationToken(_.*)?$/],r:function(a,b){for(var c=0,d=a.length;c<d;c++)b(a[c],c)},l:function(a,b){if("function"==typeof Array.prototype.indexOf)return Array.prototype.indexOf.call(a,b);for(var c=0,d=a.length;c<d;c++)if(a[c]===
b)return c;return-1},hb:function(a,b,c){for(var d=0,e=a.length;d<e;d++)if(b.call(c,a[d],d))return a[d];return null},ma:function(b,c){var d=a.a.l(b,c);0<d?b.splice(d,1):0===d&&b.shift()},ib:function(b){b=b||[];for(var c=[],d=0,e=b.length;d<e;d++)0>a.a.l(c,b[d])&&c.push(b[d]);return c},ya:function(a,b){a=a||[];for(var c=[],d=0,e=a.length;d<e;d++)c.push(b(a[d],d));return c},la:function(a,b){a=a||[];for(var c=[],d=0,e=a.length;d<e;d++)b(a[d],d)&&c.push(a[d]);return c},$:function(a,b){if(b instanceof Array)a.push.apply(a,
b);else for(var c=0,d=b.length;c<d;c++)a.push(b[c]);return a},Y:function(b,c,d){var e=a.a.l(a.a.Sa(b),c);0>e?d&&b.push(c):d||b.splice(e,1)},na:e,extend:c,ra:d,sa:e?d:c,A:b,Oa:function(a,b){if(!a)return a;var c={},d;for(d in a)a.hasOwnProperty(d)&&(c[d]=b(a[d],d,a));return c},Fa:function(b){for(;b.firstChild;)a.removeNode(b.firstChild)},ec:function(b){b=a.a.R(b);for(var c=w.createElement("div"),d=0,e=b.length;d<e;d++)c.appendChild(a.M(b[d]));return c},lb:function(b,c){for(var d=0,e=b.length,g=[];d<
e;d++){var k=b[d].cloneNode(!0);g.push(c?a.M(k):k)}return g},U:function(b,c){a.a.Fa(b);if(c)for(var d=0,e=c.length;d<e;d++)b.appendChild(c[d])},Bb:function(b,c){var d=b.nodeType?[b]:b;if(0<d.length){for(var e=d[0],g=e.parentNode,k=0,h=c.length;k<h;k++)g.insertBefore(c[k],e);k=0;for(h=d.length;k<h;k++)a.removeNode(d[k])}},ea:function(a,b){if(a.length){for(b=8===b.nodeType&&b.parentNode||b;a.length&&a[0].parentNode!==b;)a.shift();if(1<a.length){var c=a[0],d=a[a.length-1];for(a.length=0;c!==d;)if(a.push(c),
c=c.nextSibling,!c)return;a.push(d)}}return a},Db:function(a,b){7>k?a.setAttribute("selected",b):a.selected=b},ta:function(a){return null===a||a===p?"":a.trim?a.trim():a.toString().replace(/^[\s\xa0]+|[\s\xa0]+$/g,"")},oc:function(b,c){for(var d=[],e=(b||"").split(c),g=0,k=e.length;g<k;g++){var h=a.a.ta(e[g]);""!==h&&d.push(h)}return d},kc:function(a,b){a=a||"";return b.length>a.length?!1:a.substring(0,b.length)===b},Sb:function(a,b){if(a===b)return!0;if(11===a.nodeType)return!1;if(b.contains)return b.contains(3===
a.nodeType?a.parentNode:a);if(b.compareDocumentPosition)return 16==(b.compareDocumentPosition(a)&16);for(;a&&a!=b;)a=a.parentNode;return!!a},Ea:function(b){return a.a.Sb(b,b.ownerDocument.documentElement)},eb:function(b){return!!a.a.hb(b,a.a.Ea)},B:function(a){return a&&a.tagName&&a.tagName.toLowerCase()},q:function(b,c,d){var e=k&&g[c];if(!e&&t)t(b).bind(c,d);else if(e||"function"!=typeof b.addEventListener)if("undefined"!=typeof b.attachEvent){var h=function(a){d.call(b,a)},f="on"+c;b.attachEvent(f,
h);a.a.u.ja(b,function(){b.detachEvent(f,h)})}else throw Error("Browser doesn't support addEventListener or attachEvent");else b.addEventListener(c,d,!1)},ha:function(b,c){if(!b||!b.nodeType)throw Error("element must be a DOM node when calling triggerEvent");var d;"input"===a.a.B(b)&&b.type&&"click"==c.toLowerCase()?(d=b.type,d="checkbox"==d||"radio"==d):d=!1;if(t&&!d)t(b).trigger(c);else if("function"==typeof w.createEvent)if("function"==typeof b.dispatchEvent)d=w.createEvent(h[c]||"HTMLEvents"),
d.initEvent(c,!0,!0,A,0,0,0,0,0,!1,!1,!1,!1,0,b),b.dispatchEvent(d);else throw Error("The supplied element doesn't support dispatchEvent");else if(d&&b.click)b.click();else if("undefined"!=typeof b.fireEvent)b.fireEvent("on"+c);else throw Error("Browser doesn't support triggering events");},c:function(b){return a.v(b)?b():b},Sa:function(b){return a.v(b)?b.o():b},ua:function(b,c,d){if(c){var e=/\S+/g,g=b.className.match(e)||[];a.a.r(c.match(e),function(b){a.a.Y(g,b,d)});b.className=g.join(" ")}},Xa:function(b,
c){var d=a.a.c(c);if(null===d||d===p)d="";var e=a.e.firstChild(b);!e||3!=e.nodeType||a.e.nextSibling(e)?a.e.U(b,[b.ownerDocument.createTextNode(d)]):e.data=d;a.a.Vb(b)},Cb:function(a,b){a.name=b;if(7>=k)try{a.mergeAttributes(w.createElement("<input name='"+a.name+"'/>"),!1)}catch(c){}},Vb:function(a){9<=k&&(a=1==a.nodeType?a:a.parentNode,a.style&&(a.style.zoom=a.style.zoom))},Tb:function(a){if(k){var b=a.style.width;a.style.width=0;a.style.width=b}},ic:function(b,c){b=a.a.c(b);c=a.a.c(c);for(var d=
[],e=b;e<=c;e++)d.push(e);return d},R:function(a){for(var b=[],c=0,d=a.length;c<d;c++)b.push(a[c]);return b},mc:6===k,nc:7===k,oa:k,ob:function(b,c){for(var d=a.a.R(b.getElementsByTagName("input")).concat(a.a.R(b.getElementsByTagName("textarea"))),e="string"==typeof c?function(a){return a.name===c}:function(a){return c.test(a.name)},g=[],k=d.length-1;0<=k;k--)e(d[k])&&g.push(d[k]);return g},fc:function(b){return"string"==typeof b&&(b=a.a.ta(b))?C&&C.parse?C.parse(b):(new Function("return "+b))():
null},Ya:function(b,c,d){if(!C||!C.stringify)throw Error("Cannot find JSON.stringify(). Some browsers (e.g., IE < 8) don't support it natively, but you can overcome this by adding a script reference to json2.js, downloadable from http://www.json.org/json2.js");return C.stringify(a.a.c(b),c,d)},gc:function(c,d,e){e=e||{};var g=e.params||{},k=e.includeFields||this.mb,h=c;if("object"==typeof c&&"form"===a.a.B(c))for(var h=c.action,f=k.length-1;0<=f;f--)for(var u=a.a.ob(c,k[f]),D=u.length-1;0<=D;D--)g[u[D].name]=
u[D].value;d=a.a.c(d);var y=w.createElement("form");y.style.display="none";y.action=h;y.method="post";for(var p in d)c=w.createElement("input"),c.name=p,c.value=a.a.Ya(a.a.c(d[p])),y.appendChild(c);b(g,function(a,b){var c=w.createElement("input");c.name=a;c.value=b;y.appendChild(c)});w.body.appendChild(y);e.submitter?e.submitter(y):y.submit();setTimeout(function(){y.parentNode.removeChild(y)},0)}}}();a.b("utils",a.a);a.b("utils.arrayForEach",a.a.r);a.b("utils.arrayFirst",a.a.hb);a.b("utils.arrayFilter",
a.a.la);a.b("utils.arrayGetDistinctValues",a.a.ib);a.b("utils.arrayIndexOf",a.a.l);a.b("utils.arrayMap",a.a.ya);a.b("utils.arrayPushAll",a.a.$);a.b("utils.arrayRemoveItem",a.a.ma);a.b("utils.extend",a.a.extend);a.b("utils.fieldsIncludedWithJsonPost",a.a.mb);a.b("utils.getFormFields",a.a.ob);a.b("utils.peekObservable",a.a.Sa);a.b("utils.postJson",a.a.gc);a.b("utils.parseJson",a.a.fc);a.b("utils.registerEventHandler",a.a.q);a.b("utils.stringifyJson",a.a.Ya);a.b("utils.range",a.a.ic);a.b("utils.toggleDomNodeCssClass",
a.a.ua);a.b("utils.triggerEvent",a.a.ha);a.b("utils.unwrapObservable",a.a.c);a.b("utils.objectForEach",a.a.A);a.b("utils.addOrRemoveItem",a.a.Y);a.b("unwrap",a.a.c);Function.prototype.bind||(Function.prototype.bind=function(a){var c=this,d=Array.prototype.slice.call(arguments);a=d.shift();return function(){return c.apply(a,d.concat(Array.prototype.slice.call(arguments)))}});a.a.f=new function(){function a(b,h){var g=b[d];if(!g||"null"===g||!e[g]){if(!h)return p;g=b[d]="ko"+c++;e[g]={}}return e[g]}
var c=0,d="__ko__"+(new Date).getTime(),e={};return{get:function(c,d){var e=a(c,!1);return e===p?p:e[d]},set:function(c,d,e){if(e!==p||a(c,!1)!==p)a(c,!0)[d]=e},clear:function(a){var b=a[d];return b?(delete e[b],a[d]=null,!0):!1},L:function(){return c++ +d}}};a.b("utils.domData",a.a.f);a.b("utils.domData.clear",a.a.f.clear);a.a.u=new function(){function b(b,c){var e=a.a.f.get(b,d);e===p&&c&&(e=[],a.a.f.set(b,d,e));return e}function c(d){var e=b(d,!1);if(e)for(var e=e.slice(0),k=0;k<e.length;k++)e[k](d);
a.a.f.clear(d);a.a.u.cleanExternalData(d);if(f[d.nodeType])for(e=d.firstChild;d=e;)e=d.nextSibling,8===d.nodeType&&c(d)}var d=a.a.f.L(),e={1:!0,8:!0,9:!0},f={1:!0,9:!0};return{ja:function(a,c){if("function"!=typeof c)throw Error("Callback must be a function");b(a,!0).push(c)},Ab:function(c,e){var k=b(c,!1);k&&(a.a.ma(k,e),0==k.length&&a.a.f.set(c,d,p))},M:function(b){if(e[b.nodeType]&&(c(b),f[b.nodeType])){var d=[];a.a.$(d,b.getElementsByTagName("*"));for(var k=0,l=d.length;k<l;k++)c(d[k])}return b},
removeNode:function(b){a.M(b);b.parentNode&&b.parentNode.removeChild(b)},cleanExternalData:function(a){t&&"function"==typeof t.cleanData&&t.cleanData([a])}}};a.M=a.a.u.M;a.removeNode=a.a.u.removeNode;a.b("cleanNode",a.M);a.b("removeNode",a.removeNode);a.b("utils.domNodeDisposal",a.a.u);a.b("utils.domNodeDisposal.addDisposeCallback",a.a.u.ja);a.b("utils.domNodeDisposal.removeDisposeCallback",a.a.u.Ab);(function(){a.a.Qa=function(b){var c;if(t)if(t.parseHTML)c=t.parseHTML(b)||[];else{if((c=t.clean([b]))&&
c[0]){for(b=c[0];b.parentNode&&11!==b.parentNode.nodeType;)b=b.parentNode;b.parentNode&&b.parentNode.removeChild(b)}}else{var d=a.a.ta(b).toLowerCase();c=w.createElement("div");d=d.match(/^<(thead|tbody|tfoot)/)&&[1,"<table>","</table>"]||!d.indexOf("<tr")&&[2,"<table><tbody>","</tbody></table>"]||(!d.indexOf("<td")||!d.indexOf("<th"))&&[3,"<table><tbody><tr>","</tr></tbody></table>"]||[0,"",""];b="ignored<div>"+d[1]+b+d[2]+"</div>";for("function"==typeof A.innerShiv?c.appendChild(A.innerShiv(b)):
c.innerHTML=b;d[0]--;)c=c.lastChild;c=a.a.R(c.lastChild.childNodes)}return c};a.a.Va=function(b,c){a.a.Fa(b);c=a.a.c(c);if(null!==c&&c!==p)if("string"!=typeof c&&(c=c.toString()),t)t(b).html(c);else for(var d=a.a.Qa(c),e=0;e<d.length;e++)b.appendChild(d[e])}})();a.b("utils.parseHtmlFragment",a.a.Qa);a.b("utils.setHtml",a.a.Va);a.w=function(){function b(c,e){if(c)if(8==c.nodeType){var f=a.w.xb(c.nodeValue);null!=f&&e.push({Rb:c,cc:f})}else if(1==c.nodeType)for(var f=0,h=c.childNodes,g=h.length;f<g;f++)b(h[f],
e)}var c={};return{Na:function(a){if("function"!=typeof a)throw Error("You can only pass a function to ko.memoization.memoize()");var b=(4294967296*(1+Math.random())|0).toString(16).substring(1)+(4294967296*(1+Math.random())|0).toString(16).substring(1);c[b]=a;return"\x3c!--[ko_memo:"+b+"]--\x3e"},Hb:function(a,b){var f=c[a];if(f===p)throw Error("Couldn't find any memo with ID "+a+". Perhaps it's already been unmemoized.");try{return f.apply(null,b||[]),!0}finally{delete c[a]}},Ib:function(c,e){var f=
[];b(c,f);for(var h=0,g=f.length;h<g;h++){var k=f[h].Rb,l=[k];e&&a.a.$(l,e);a.w.Hb(f[h].cc,l);k.nodeValue="";k.parentNode&&k.parentNode.removeChild(k)}},xb:function(a){return(a=a.match(/^\[ko_memo\:(.*?)\]$/))?a[1]:null}}}();a.b("memoization",a.w);a.b("memoization.memoize",a.w.Na);a.b("memoization.unmemoize",a.w.Hb);a.b("memoization.parseMemoText",a.w.xb);a.b("memoization.unmemoizeDomNodeAndDescendants",a.w.Ib);a.Ga={throttle:function(b,c){b.throttleEvaluation=c;var d=null;return a.h({read:b,write:function(a){clearTimeout(d);
d=setTimeout(function(){b(a)},c)}})},rateLimit:function(a,c){var d,e,f;"number"==typeof c?d=c:(d=c.timeout,e=c.method);f="notifyWhenChangesStop"==e?O:N;a.Ma(function(a){return f(a,d)})},notify:function(a,c){a.equalityComparer="always"==c?null:G}};var M={undefined:1,"boolean":1,number:1,string:1};a.b("extenders",a.Ga);a.Fb=function(b,c,d){this.target=b;this.za=c;this.Qb=d;this.sb=!1;a.s(this,"dispose",this.F)};a.Fb.prototype.F=function(){this.sb=!0;this.Qb()};a.N=function(){a.a.sa(this,a.N.fn);this.H=
{}};var F="change";z={V:function(b,c,d){var e=this;d=d||F;var f=new a.Fb(e,c?b.bind(c):b,function(){a.a.ma(e.H[d],f)});e.o&&e.o();e.H[d]||(e.H[d]=[]);e.H[d].push(f);return f},notifySubscribers:function(b,c){c=c||F;if(this.qb(c))try{a.k.jb();for(var d=this.H[c].slice(0),e=0,f;f=d[e];++e)f.sb||f.za(b)}finally{a.k.end()}},Ma:function(b){var c=this,d=a.v(c),e,f,h;c.ia||(c.ia=c.notifySubscribers,c.notifySubscribers=function(a,b){b&&b!==F?"beforeChange"===b?c.bb(a):c.ia(a,b):c.cb(a)});var g=b(function(){d&&
h===c&&(h=c());e=!1;c.Ka(f,h)&&c.ia(f=h)});c.cb=function(a){e=!0;h=a;g()};c.bb=function(a){e||(f=a,c.ia(a,"beforeChange"))}},qb:function(a){return this.H[a]&&this.H[a].length},Wb:function(){var b=0;a.a.A(this.H,function(a,d){b+=d.length});return b},Ka:function(a,c){return!this.equalityComparer||!this.equalityComparer(a,c)},extend:function(b){var c=this;b&&a.a.A(b,function(b,e){var f=a.Ga[b];"function"==typeof f&&(c=f(c,e)||c)});return c}};a.s(z,"subscribe",z.V);a.s(z,"extend",z.extend);a.s(z,"getSubscriptionsCount",
z.Wb);a.a.na&&a.a.ra(z,Function.prototype);a.N.fn=z;a.tb=function(a){return null!=a&&"function"==typeof a.V&&"function"==typeof a.notifySubscribers};a.b("subscribable",a.N);a.b("isSubscribable",a.tb);a.ca=a.k=function(){function b(a){d.push(e);e=a}function c(){e=d.pop()}var d=[],e,f=0;return{jb:b,end:c,zb:function(b){if(e){if(!a.tb(b))throw Error("Only subscribable things can act as dependencies");e.za(b,b.Kb||(b.Kb=++f))}},t:function(a,d,e){try{return b(),a.apply(d,e||[])}finally{c()}},fa:function(){if(e)return e.ba.fa()},
pa:function(){if(e)return e.pa}}}();a.b("computedContext",a.ca);a.b("computedContext.getDependenciesCount",a.ca.fa);a.b("computedContext.isInitial",a.ca.pa);a.m=function(b){function c(){if(0<arguments.length)return c.Ka(d,arguments[0])&&(c.P(),d=arguments[0],c.O()),this;a.k.zb(c);return d}var d=b;a.N.call(c);a.a.sa(c,a.m.fn);c.o=function(){return d};c.O=function(){c.notifySubscribers(d)};c.P=function(){c.notifySubscribers(d,"beforeChange")};a.s(c,"peek",c.o);a.s(c,"valueHasMutated",c.O);a.s(c,"valueWillMutate",
c.P);return c};a.m.fn={equalityComparer:G};var E=a.m.hc="__ko_proto__";a.m.fn[E]=a.m;a.a.na&&a.a.ra(a.m.fn,a.N.fn);a.Ha=function(b,c){return null===b||b===p||b[E]===p?!1:b[E]===c?!0:a.Ha(b[E],c)};a.v=function(b){return a.Ha(b,a.m)};a.ub=function(b){return"function"==typeof b&&b[E]===a.m||"function"==typeof b&&b[E]===a.h&&b.Yb?!0:!1};a.b("observable",a.m);a.b("isObservable",a.v);a.b("isWriteableObservable",a.ub);a.T=function(b){b=b||[];if("object"!=typeof b||!("length"in b))throw Error("The argument passed when initializing an observable array must be an array, or null, or undefined.");
b=a.m(b);a.a.sa(b,a.T.fn);return b.extend({trackArrayChanges:!0})};a.T.fn={remove:function(b){for(var c=this.o(),d=[],e="function"!=typeof b||a.v(b)?function(a){return a===b}:b,f=0;f<c.length;f++){var h=c[f];e(h)&&(0===d.length&&this.P(),d.push(h),c.splice(f,1),f--)}d.length&&this.O();return d},removeAll:function(b){if(b===p){var c=this.o(),d=c.slice(0);this.P();c.splice(0,c.length);this.O();return d}return b?this.remove(function(c){return 0<=a.a.l(b,c)}):[]},destroy:function(b){var c=this.o(),d=
"function"!=typeof b||a.v(b)?function(a){return a===b}:b;this.P();for(var e=c.length-1;0<=e;e--)d(c[e])&&(c[e]._destroy=!0);this.O()},destroyAll:function(b){return b===p?this.destroy(function(){return!0}):b?this.destroy(function(c){return 0<=a.a.l(b,c)}):[]},indexOf:function(b){var c=this();return a.a.l(c,b)},replace:function(a,c){var d=this.indexOf(a);0<=d&&(this.P(),this.o()[d]=c,this.O())}};a.a.r("pop push reverse shift sort splice unshift".split(" "),function(b){a.T.fn[b]=function(){var a=this.o();
this.P();this.kb(a,b,arguments);a=a[b].apply(a,arguments);this.O();return a}});a.a.r(["slice"],function(b){a.T.fn[b]=function(){var a=this();return a[b].apply(a,arguments)}});a.a.na&&a.a.ra(a.T.fn,a.m.fn);a.b("observableArray",a.T);var I="arrayChange";a.Ga.trackArrayChanges=function(b){function c(){if(!d){d=!0;var c=b.notifySubscribers;b.notifySubscribers=function(a,b){b&&b!==F||++f;return c.apply(this,arguments)};var k=[].concat(b.o()||[]);e=null;b.V(function(c){c=[].concat(c||[]);if(b.qb(I)){var d;
if(!e||1<f)e=a.a.Aa(k,c,{sparse:!0});d=e;d.length&&b.notifySubscribers(d,I)}k=c;e=null;f=0})}}if(!b.kb){var d=!1,e=null,f=0,h=b.V;b.V=b.subscribe=function(a,b,d){d===I&&c();return h.apply(this,arguments)};b.kb=function(b,c,l){function h(a,b,c){return r[r.length]={status:a,value:b,index:c}}if(d&&!f){var r=[],m=b.length,q=l.length,s=0;switch(c){case "push":s=m;case "unshift":for(c=0;c<q;c++)h("added",l[c],s+c);break;case "pop":s=m-1;case "shift":m&&h("deleted",b[s],s);break;case "splice":c=Math.min(Math.max(0,
0>l[0]?m+l[0]:l[0]),m);for(var m=1===q?m:Math.min(c+(l[1]||0),m),q=c+q-2,s=Math.max(m,q),B=[],u=[],D=2;c<s;++c,++D)c<m&&u.push(h("deleted",b[c],c)),c<q&&B.push(h("added",l[D],c));a.a.nb(u,B);break;default:return}e=r}}}};a.ba=a.h=function(b,c,d){function e(){q=!0;a.a.A(v,function(a,b){b.F()});v={};x=0;n=!1}function f(){var a=g.throttleEvaluation;a&&0<=a?(clearTimeout(t),t=setTimeout(h,a)):g.wa?g.wa():h()}function h(){if(!r&&!q){if(y&&y()){if(!m){p();return}}else m=!1;r=!0;try{var b=v,d=x;a.k.jb({za:function(a,
c){q||(d&&b[c]?(v[c]=b[c],++x,delete b[c],--d):v[c]||(v[c]=a.V(f),++x))},ba:g,pa:!x});v={};x=0;try{var e=c?s.call(c):s()}finally{a.k.end(),d&&a.a.A(b,function(a,b){b.F()}),n=!1}g.Ka(l,e)&&(g.notifySubscribers(l,"beforeChange"),l=e,g.wa&&!g.throttleEvaluation||g.notifySubscribers(l))}finally{r=!1}x||p()}}function g(){if(0<arguments.length){if("function"===typeof B)B.apply(c,arguments);else throw Error("Cannot write a value to a ko.computed unless you specify a 'write' option. If you wish to read the current value, don't pass any parameters.");
return this}n&&h();a.k.zb(g);return l}function k(){return n||0<x}var l,n=!0,r=!1,m=!1,q=!1,s=b;s&&"object"==typeof s?(d=s,s=d.read):(d=d||{},s||(s=d.read));if("function"!=typeof s)throw Error("Pass a function that returns the value of the ko.computed");var B=d.write,u=d.disposeWhenNodeIsRemoved||d.G||null,D=d.disposeWhen||d.Da,y=D,p=e,v={},x=0,t=null;c||(c=d.owner);a.N.call(g);a.a.sa(g,a.h.fn);g.o=function(){n&&!x&&h();return l};g.fa=function(){return x};g.Yb="function"===typeof d.write;g.F=function(){p()};
g.ga=k;var w=g.Ma;g.Ma=function(a){w.call(g,a);g.wa=function(){g.bb(l);n=!0;g.cb(g)}};a.s(g,"peek",g.o);a.s(g,"dispose",g.F);a.s(g,"isActive",g.ga);a.s(g,"getDependenciesCount",g.fa);u&&(m=!0,u.nodeType&&(y=function(){return!a.a.Ea(u)||D&&D()}));!0!==d.deferEvaluation&&h();u&&k()&&u.nodeType&&(p=function(){a.a.u.Ab(u,p);e()},a.a.u.ja(u,p));return g};a.$b=function(b){return a.Ha(b,a.h)};z=a.m.hc;a.h[z]=a.m;a.h.fn={equalityComparer:G};a.h.fn[z]=a.h;a.a.na&&a.a.ra(a.h.fn,a.N.fn);a.b("dependentObservable",
a.h);a.b("computed",a.h);a.b("isComputed",a.$b);(function(){function b(a,f,h){h=h||new d;a=f(a);if("object"!=typeof a||null===a||a===p||a instanceof Date||a instanceof String||a instanceof Number||a instanceof Boolean)return a;var g=a instanceof Array?[]:{};h.save(a,g);c(a,function(c){var d=f(a[c]);switch(typeof d){case "boolean":case "number":case "string":case "function":g[c]=d;break;case "object":case "undefined":var n=h.get(d);g[c]=n!==p?n:b(d,f,h)}});return g}function c(a,b){if(a instanceof Array){for(var c=
0;c<a.length;c++)b(c);"function"==typeof a.toJSON&&b("toJSON")}else for(c in a)b(c)}function d(){this.keys=[];this.ab=[]}a.Gb=function(c){if(0==arguments.length)throw Error("When calling ko.toJS, pass the object you want to convert.");return b(c,function(b){for(var c=0;a.v(b)&&10>c;c++)b=b();return b})};a.toJSON=function(b,c,d){b=a.Gb(b);return a.a.Ya(b,c,d)};d.prototype={save:function(b,c){var d=a.a.l(this.keys,b);0<=d?this.ab[d]=c:(this.keys.push(b),this.ab.push(c))},get:function(b){b=a.a.l(this.keys,
b);return 0<=b?this.ab[b]:p}}})();a.b("toJS",a.Gb);a.b("toJSON",a.toJSON);(function(){a.i={p:function(b){switch(a.a.B(b)){case "option":return!0===b.__ko__hasDomDataOptionValue__?a.a.f.get(b,a.d.options.Pa):7>=a.a.oa?b.getAttributeNode("value")&&b.getAttributeNode("value").specified?b.value:b.text:b.value;case "select":return 0<=b.selectedIndex?a.i.p(b.options[b.selectedIndex]):p;default:return b.value}},X:function(b,c,d){switch(a.a.B(b)){case "option":switch(typeof c){case "string":a.a.f.set(b,a.d.options.Pa,
p);"__ko__hasDomDataOptionValue__"in b&&delete b.__ko__hasDomDataOptionValue__;b.value=c;break;default:a.a.f.set(b,a.d.options.Pa,c),b.__ko__hasDomDataOptionValue__=!0,b.value="number"===typeof c?c:""}break;case "select":if(""===c||null===c)c=p;for(var e=-1,f=0,h=b.options.length,g;f<h;++f)if(g=a.i.p(b.options[f]),g==c||""==g&&c===p){e=f;break}if(d||0<=e||c===p&&1<b.size)b.selectedIndex=e;break;default:if(null===c||c===p)c="";b.value=c}}}})();a.b("selectExtensions",a.i);a.b("selectExtensions.readValue",
a.i.p);a.b("selectExtensions.writeValue",a.i.X);a.g=function(){function b(b){b=a.a.ta(b);123===b.charCodeAt(0)&&(b=b.slice(1,-1));var c=[],d=b.match(e),g,m,q=0;if(d){d.push(",");for(var s=0,B;B=d[s];++s){var u=B.charCodeAt(0);if(44===u){if(0>=q){g&&c.push(m?{key:g,value:m.join("")}:{unknown:g});g=m=q=0;continue}}else if(58===u){if(!m)continue}else if(47===u&&s&&1<B.length)(u=d[s-1].match(f))&&!h[u[0]]&&(b=b.substr(b.indexOf(B)+1),d=b.match(e),d.push(","),s=-1,B="/");else if(40===u||123===u||91===
u)++q;else if(41===u||125===u||93===u)--q;else if(!g&&!m){g=34===u||39===u?B.slice(1,-1):B;continue}m?m.push(B):m=[B]}}return c}var c=["true","false","null","undefined"],d=/^(?:[$_a-z][$\w]*|(.+)(\.\s*[$_a-z][$\w]*|\[.+\]))$/i,e=RegExp("\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|/(?:[^/\\\\]|\\\\.)*/w*|[^\\s:,/][^,\"'{}()/:[\\]]*[^\\s,\"'{}()/:[\\]]|[^\\s]","g"),f=/[\])"'A-Za-z0-9_$]+$/,h={"in":1,"return":1,"typeof":1},g={};return{aa:[],W:g,Ra:b,qa:function(e,l){function f(b,e){var l,k=a.getBindingHandler(b);
if(k&&k.preprocess?e=k.preprocess(e,b,f):1){if(k=g[b])l=e,0<=a.a.l(c,l)?l=!1:(k=l.match(d),l=null===k?!1:k[1]?"Object("+k[1]+")"+k[2]:l),k=l;k&&m.push("'"+b+"':function(_z){"+l+"=_z}");q&&(e="function(){return "+e+" }");h.push("'"+b+"':"+e)}}l=l||{};var h=[],m=[],q=l.valueAccessors,s="string"===typeof e?b(e):e;a.a.r(s,function(a){f(a.key||a.unknown,a.value)});m.length&&f("_ko_property_writers","{"+m.join(",")+" }");return h.join(",")},bc:function(a,b){for(var c=0;c<a.length;c++)if(a[c].key==b)return!0;
return!1},va:function(b,c,d,e,g){if(b&&a.v(b))!a.ub(b)||g&&b.o()===e||b(e);else if((b=c.get("_ko_property_writers"))&&b[d])b[d](e)}}}();a.b("expressionRewriting",a.g);a.b("expressionRewriting.bindingRewriteValidators",a.g.aa);a.b("expressionRewriting.parseObjectLiteral",a.g.Ra);a.b("expressionRewriting.preProcessBindings",a.g.qa);a.b("expressionRewriting._twoWayBindings",a.g.W);a.b("jsonExpressionRewriting",a.g);a.b("jsonExpressionRewriting.insertPropertyAccessorsIntoJson",a.g.qa);(function(){function b(a){return 8==
a.nodeType&&h.test(f?a.text:a.nodeValue)}function c(a){return 8==a.nodeType&&g.test(f?a.text:a.nodeValue)}function d(a,d){for(var e=a,g=1,k=[];e=e.nextSibling;){if(c(e)&&(g--,0===g))return k;k.push(e);b(e)&&g++}if(!d)throw Error("Cannot find closing comment tag to match: "+a.nodeValue);return null}function e(a,b){var c=d(a,b);return c?0<c.length?c[c.length-1].nextSibling:a.nextSibling:null}var f=w&&"\x3c!--test--\x3e"===w.createComment("test").text,h=f?/^\x3c!--\s*ko(?:\s+([\s\S]+))?\s*--\x3e$/:/^\s*ko(?:\s+([\s\S]+))?\s*$/,
g=f?/^\x3c!--\s*\/ko\s*--\x3e$/:/^\s*\/ko\s*$/,k={ul:!0,ol:!0};a.e={Q:{},childNodes:function(a){return b(a)?d(a):a.childNodes},da:function(c){if(b(c)){c=a.e.childNodes(c);for(var d=0,e=c.length;d<e;d++)a.removeNode(c[d])}else a.a.Fa(c)},U:function(c,d){if(b(c)){a.e.da(c);for(var e=c.nextSibling,g=0,k=d.length;g<k;g++)e.parentNode.insertBefore(d[g],e)}else a.a.U(c,d)},yb:function(a,c){b(a)?a.parentNode.insertBefore(c,a.nextSibling):a.firstChild?a.insertBefore(c,a.firstChild):a.appendChild(c)},rb:function(c,
d,e){e?b(c)?c.parentNode.insertBefore(d,e.nextSibling):e.nextSibling?c.insertBefore(d,e.nextSibling):c.appendChild(d):a.e.yb(c,d)},firstChild:function(a){return b(a)?!a.nextSibling||c(a.nextSibling)?null:a.nextSibling:a.firstChild},nextSibling:function(a){b(a)&&(a=e(a));return a.nextSibling&&c(a.nextSibling)?null:a.nextSibling},Xb:b,lc:function(a){return(a=(f?a.text:a.nodeValue).match(h))?a[1]:null},wb:function(d){if(k[a.a.B(d)]){var g=d.firstChild;if(g){do if(1===g.nodeType){var f;f=g.firstChild;
var h=null;if(f){do if(h)h.push(f);else if(b(f)){var q=e(f,!0);q?f=q:h=[f]}else c(f)&&(h=[f]);while(f=f.nextSibling)}if(f=h)for(h=g.nextSibling,q=0;q<f.length;q++)h?d.insertBefore(f[q],h):d.appendChild(f[q])}while(g=g.nextSibling)}}}}})();a.b("virtualElements",a.e);a.b("virtualElements.allowedBindings",a.e.Q);a.b("virtualElements.emptyNode",a.e.da);a.b("virtualElements.insertAfter",a.e.rb);a.b("virtualElements.prepend",a.e.yb);a.b("virtualElements.setDomNodeChildren",a.e.U);(function(){a.J=function(){this.Nb=
{}};a.a.extend(a.J.prototype,{nodeHasBindings:function(b){switch(b.nodeType){case 1:return null!=b.getAttribute("data-bind");case 8:return a.e.Xb(b);default:return!1}},getBindings:function(a,c){var d=this.getBindingsString(a,c);return d?this.parseBindingsString(d,c,a):null},getBindingAccessors:function(a,c){var d=this.getBindingsString(a,c);return d?this.parseBindingsString(d,c,a,{valueAccessors:!0}):null},getBindingsString:function(b){switch(b.nodeType){case 1:return b.getAttribute("data-bind");
case 8:return a.e.lc(b);default:return null}},parseBindingsString:function(b,c,d,e){try{var f=this.Nb,h=b+(e&&e.valueAccessors||""),g;if(!(g=f[h])){var k,l="with($context){with($data||{}){return{"+a.g.qa(b,e)+"}}}";k=new Function("$context","$element",l);g=f[h]=k}return g(c,d)}catch(n){throw n.message="Unable to parse bindings.\nBindings value: "+b+"\nMessage: "+n.message,n;}}});a.J.instance=new a.J})();a.b("bindingProvider",a.J);(function(){function b(a){return function(){return a}}function c(a){return a()}
function d(b){return a.a.Oa(a.k.t(b),function(a,c){return function(){return b()[c]}})}function e(a,b){return d(this.getBindings.bind(this,a,b))}function f(b,c,d){var e,g=a.e.firstChild(c),k=a.J.instance,f=k.preprocessNode;if(f){for(;e=g;)g=a.e.nextSibling(e),f.call(k,e);g=a.e.firstChild(c)}for(;e=g;)g=a.e.nextSibling(e),h(b,e,d)}function h(b,c,d){var e=!0,g=1===c.nodeType;g&&a.e.wb(c);if(g&&d||a.J.instance.nodeHasBindings(c))e=k(c,null,b,d).shouldBindDescendants;e&&!n[a.a.B(c)]&&f(b,c,!g)}function g(b){var c=
[],d={},e=[];a.a.A(b,function y(g){if(!d[g]){var k=a.getBindingHandler(g);k&&(k.after&&(e.push(g),a.a.r(k.after,function(c){if(b[c]){if(-1!==a.a.l(e,c))throw Error("Cannot combine the following bindings, because they have a cyclic dependency: "+e.join(", "));y(c)}}),e.length--),c.push({key:g,pb:k}));d[g]=!0}});return c}function k(b,d,k,f){var h=a.a.f.get(b,r);if(!d){if(h)throw Error("You cannot apply bindings multiple times to the same element.");a.a.f.set(b,r,!0)}!h&&f&&a.Eb(b,k);var l;if(d&&"function"!==
typeof d)l=d;else{var n=a.J.instance,m=n.getBindingAccessors||e,x=a.h(function(){(l=d?d(k,b):m.call(n,b,k))&&k.D&&k.D();return l},null,{G:b});l&&x.ga()||(x=null)}var t;if(l){var w=x?function(a){return function(){return c(x()[a])}}:function(a){return l[a]},z=function(){return a.a.Oa(x?x():l,c)};z.get=function(a){return l[a]&&c(w(a))};z.has=function(a){return a in l};f=g(l);a.a.r(f,function(c){var d=c.pb.init,e=c.pb.update,g=c.key;if(8===b.nodeType&&!a.e.Q[g])throw Error("The binding '"+g+"' cannot be used with virtual elements");
try{"function"==typeof d&&a.k.t(function(){var a=d(b,w(g),z,k.$data,k);if(a&&a.controlsDescendantBindings){if(t!==p)throw Error("Multiple bindings ("+t+" and "+g+") are trying to control descendant bindings of the same element. You cannot use these bindings together on the same element.");t=g}}),"function"==typeof e&&a.h(function(){e(b,w(g),z,k.$data,k)},null,{G:b})}catch(f){throw f.message='Unable to process binding "'+g+": "+l[g]+'"\nMessage: '+f.message,f;}})}return{shouldBindDescendants:t===p}}
function l(b){return b&&b instanceof a.I?b:new a.I(b)}a.d={};var n={script:!0};a.getBindingHandler=function(b){return a.d[b]};a.I=function(b,c,d,e){var g=this,k="function"==typeof b&&!a.v(b),f,h=a.h(function(){var f=k?b():b,l=a.a.c(f);c?(c.D&&c.D(),a.a.extend(g,c),h&&(g.D=h)):(g.$parents=[],g.$root=l,g.ko=a);g.$rawData=f;g.$data=l;d&&(g[d]=l);e&&e(g,c,l);return g.$data},null,{Da:function(){return f&&!a.a.eb(f)},G:!0});h.ga()&&(g.D=h,h.equalityComparer=null,f=[],h.Jb=function(b){f.push(b);a.a.u.ja(b,
function(b){a.a.ma(f,b);f.length||(h.F(),g.D=h=p)})})};a.I.prototype.createChildContext=function(b,c,d){return new a.I(b,this,c,function(a,b){a.$parentContext=b;a.$parent=b.$data;a.$parents=(b.$parents||[]).slice(0);a.$parents.unshift(a.$parent);d&&d(a)})};a.I.prototype.extend=function(b){return new a.I(this.D||this.$data,this,null,function(c,d){c.$rawData=d.$rawData;a.a.extend(c,"function"==typeof b?b():b)})};var r=a.a.f.L(),m=a.a.f.L();a.Eb=function(b,c){if(2==arguments.length)a.a.f.set(b,m,c),
c.D&&c.D.Jb(b);else return a.a.f.get(b,m)};a.xa=function(b,c,d){1===b.nodeType&&a.e.wb(b);return k(b,c,l(d),!0)};a.Lb=function(c,e,g){g=l(g);return a.xa(c,"function"===typeof e?d(e.bind(null,g,c)):a.a.Oa(e,b),g)};a.gb=function(a,b){1!==b.nodeType&&8!==b.nodeType||f(l(a),b,!0)};a.fb=function(a,b){!t&&A.jQuery&&(t=A.jQuery);if(b&&1!==b.nodeType&&8!==b.nodeType)throw Error("ko.applyBindings: first parameter should be your view model; second parameter should be a DOM node");b=b||A.document.body;h(l(a),
b,!0)};a.Ca=function(b){switch(b.nodeType){case 1:case 8:var c=a.Eb(b);if(c)return c;if(b.parentNode)return a.Ca(b.parentNode)}return p};a.Pb=function(b){return(b=a.Ca(b))?b.$data:p};a.b("bindingHandlers",a.d);a.b("applyBindings",a.fb);a.b("applyBindingsToDescendants",a.gb);a.b("applyBindingAccessorsToNode",a.xa);a.b("applyBindingsToNode",a.Lb);a.b("contextFor",a.Ca);a.b("dataFor",a.Pb)})();var L={"class":"className","for":"htmlFor"};a.d.attr={update:function(b,c){var d=a.a.c(c())||{};a.a.A(d,function(c,
d){d=a.a.c(d);var h=!1===d||null===d||d===p;h&&b.removeAttribute(c);8>=a.a.oa&&c in L?(c=L[c],h?b.removeAttribute(c):b[c]=d):h||b.setAttribute(c,d.toString());"name"===c&&a.a.Cb(b,h?"":d.toString())})}};(function(){a.d.checked={after:["value","attr"],init:function(b,c,d){function e(){return d.has("checkedValue")?a.a.c(d.get("checkedValue")):b.value}function f(){var g=b.checked,f=r?e():g;if(!a.ca.pa()&&(!k||g)){var h=a.k.t(c);l?n!==f?(g&&(a.a.Y(h,f,!0),a.a.Y(h,n,!1)),n=f):a.a.Y(h,f,g):a.g.va(h,d,"checked",
f,!0)}}function h(){var d=a.a.c(c());b.checked=l?0<=a.a.l(d,e()):g?d:e()===d}var g="checkbox"==b.type,k="radio"==b.type;if(g||k){var l=g&&a.a.c(c())instanceof Array,n=l?e():p,r=k||l;k&&!b.name&&a.d.uniqueName.init(b,function(){return!0});a.ba(f,null,{G:b});a.a.q(b,"click",f);a.ba(h,null,{G:b})}}};a.g.W.checked=!0;a.d.checkedValue={update:function(b,c){b.value=a.a.c(c())}}})();a.d.css={update:function(b,c){var d=a.a.c(c());"object"==typeof d?a.a.A(d,function(c,d){d=a.a.c(d);a.a.ua(b,c,d)}):(d=String(d||
""),a.a.ua(b,b.__ko__cssValue,!1),b.__ko__cssValue=d,a.a.ua(b,d,!0))}};a.d.enable={update:function(b,c){var d=a.a.c(c());d&&b.disabled?b.removeAttribute("disabled"):d||b.disabled||(b.disabled=!0)}};a.d.disable={update:function(b,c){a.d.enable.update(b,function(){return!a.a.c(c())})}};a.d.event={init:function(b,c,d,e,f){var h=c()||{};a.a.A(h,function(g){"string"==typeof g&&a.a.q(b,g,function(b){var h,n=c()[g];if(n){try{var r=a.a.R(arguments);e=f.$data;r.unshift(e);h=n.apply(e,r)}finally{!0!==h&&(b.preventDefault?
b.preventDefault():b.returnValue=!1)}!1===d.get(g+"Bubble")&&(b.cancelBubble=!0,b.stopPropagation&&b.stopPropagation())}})})}};a.d.foreach={vb:function(b){return function(){var c=b(),d=a.a.Sa(c);if(!d||"number"==typeof d.length)return{foreach:c,templateEngine:a.K.Ja};a.a.c(c);return{foreach:d.data,as:d.as,includeDestroyed:d.includeDestroyed,afterAdd:d.afterAdd,beforeRemove:d.beforeRemove,afterRender:d.afterRender,beforeMove:d.beforeMove,afterMove:d.afterMove,templateEngine:a.K.Ja}}},init:function(b,
c){return a.d.template.init(b,a.d.foreach.vb(c))},update:function(b,c,d,e,f){return a.d.template.update(b,a.d.foreach.vb(c),d,e,f)}};a.g.aa.foreach=!1;a.e.Q.foreach=!0;a.d.hasfocus={init:function(b,c,d){function e(e){b.__ko_hasfocusUpdating=!0;var k=b.ownerDocument;if("activeElement"in k){var f;try{f=k.activeElement}catch(h){f=k.body}e=f===b}k=c();a.g.va(k,d,"hasfocus",e,!0);b.__ko_hasfocusLastValue=e;b.__ko_hasfocusUpdating=!1}var f=e.bind(null,!0),h=e.bind(null,!1);a.a.q(b,"focus",f);a.a.q(b,"focusin",
f);a.a.q(b,"blur",h);a.a.q(b,"focusout",h)},update:function(b,c){var d=!!a.a.c(c());b.__ko_hasfocusUpdating||b.__ko_hasfocusLastValue===d||(d?b.focus():b.blur(),a.k.t(a.a.ha,null,[b,d?"focusin":"focusout"]))}};a.g.W.hasfocus=!0;a.d.hasFocus=a.d.hasfocus;a.g.W.hasFocus=!0;a.d.html={init:function(){return{controlsDescendantBindings:!0}},update:function(b,c){a.a.Va(b,c())}};H("if");H("ifnot",!1,!0);H("with",!0,!1,function(a,c){return a.createChildContext(c)});var J={};a.d.options={init:function(b){if("select"!==
a.a.B(b))throw Error("options binding applies only to SELECT elements");for(;0<b.length;)b.remove(0);return{controlsDescendantBindings:!0}},update:function(b,c,d){function e(){return a.a.la(b.options,function(a){return a.selected})}function f(a,b,c){var d=typeof b;return"function"==d?b(a):"string"==d?a[b]:c}function h(c,d){if(r.length){var e=0<=a.a.l(r,a.i.p(d[0]));a.a.Db(d[0],e);m&&!e&&a.k.t(a.a.ha,null,[b,"change"])}}var g=0!=b.length&&b.multiple?b.scrollTop:null,k=a.a.c(c()),l=d.get("optionsIncludeDestroyed");
c={};var n,r;r=b.multiple?a.a.ya(e(),a.i.p):0<=b.selectedIndex?[a.i.p(b.options[b.selectedIndex])]:[];k&&("undefined"==typeof k.length&&(k=[k]),n=a.a.la(k,function(b){return l||b===p||null===b||!a.a.c(b._destroy)}),d.has("optionsCaption")&&(k=a.a.c(d.get("optionsCaption")),null!==k&&k!==p&&n.unshift(J)));var m=!1;c.beforeRemove=function(a){b.removeChild(a)};k=h;d.has("optionsAfterRender")&&(k=function(b,c){h(0,c);a.k.t(d.get("optionsAfterRender"),null,[c[0],b!==J?b:p])});a.a.Ua(b,n,function(c,e,g){g.length&&
(r=g[0].selected?[a.i.p(g[0])]:[],m=!0);e=b.ownerDocument.createElement("option");c===J?(a.a.Xa(e,d.get("optionsCaption")),a.i.X(e,p)):(g=f(c,d.get("optionsValue"),c),a.i.X(e,a.a.c(g)),c=f(c,d.get("optionsText"),g),a.a.Xa(e,c));return[e]},c,k);a.k.t(function(){d.get("valueAllowUnset")&&d.has("value")?a.i.X(b,a.a.c(d.get("value")),!0):(b.multiple?r.length&&e().length<r.length:r.length&&0<=b.selectedIndex?a.i.p(b.options[b.selectedIndex])!==r[0]:r.length||0<=b.selectedIndex)&&a.a.ha(b,"change")});a.a.Tb(b);
g&&20<Math.abs(g-b.scrollTop)&&(b.scrollTop=g)}};a.d.options.Pa=a.a.f.L();a.d.selectedOptions={after:["options","foreach"],init:function(b,c,d){a.a.q(b,"change",function(){var e=c(),f=[];a.a.r(b.getElementsByTagName("option"),function(b){b.selected&&f.push(a.i.p(b))});a.g.va(e,d,"selectedOptions",f)})},update:function(b,c){if("select"!=a.a.B(b))throw Error("values binding applies only to SELECT elements");var d=a.a.c(c());d&&"number"==typeof d.length&&a.a.r(b.getElementsByTagName("option"),function(b){var c=
0<=a.a.l(d,a.i.p(b));a.a.Db(b,c)})}};a.g.W.selectedOptions=!0;a.d.style={update:function(b,c){var d=a.a.c(c()||{});a.a.A(d,function(c,d){d=a.a.c(d);b.style[c]=d||""})}};a.d.submit={init:function(b,c,d,e,f){if("function"!=typeof c())throw Error("The value for a submit binding must be a function");a.a.q(b,"submit",function(a){var d,e=c();try{d=e.call(f.$data,b)}finally{!0!==d&&(a.preventDefault?a.preventDefault():a.returnValue=!1)}})}};a.d.text={init:function(){return{controlsDescendantBindings:!0}},
update:function(b,c){a.a.Xa(b,c())}};a.e.Q.text=!0;a.d.uniqueName={init:function(b,c){if(c()){var d="ko_unique_"+ ++a.d.uniqueName.Ob;a.a.Cb(b,d)}}};a.d.uniqueName.Ob=0;a.d.value={after:["options","foreach"],init:function(b,c,d){function e(){g=!1;var e=c(),f=a.i.p(b);a.g.va(e,d,"value",f)}var f=["change"],h=d.get("valueUpdate"),g=!1;h&&("string"==typeof h&&(h=[h]),a.a.$(f,h),f=a.a.ib(f));!a.a.oa||"input"!=b.tagName.toLowerCase()||"text"!=b.type||"off"==b.autocomplete||b.form&&"off"==b.form.autocomplete||
-1!=a.a.l(f,"propertychange")||(a.a.q(b,"propertychange",function(){g=!0}),a.a.q(b,"focus",function(){g=!1}),a.a.q(b,"blur",function(){g&&e()}));a.a.r(f,function(c){var d=e;a.a.kc(c,"after")&&(d=function(){setTimeout(e,0)},c=c.substring(5));a.a.q(b,c,d)})},update:function(b,c,d){var e=a.a.c(c());c=a.i.p(b);if(e!==c)if("select"===a.a.B(b)){var f=d.get("valueAllowUnset");d=function(){a.i.X(b,e,f)};d();f||e===a.i.p(b)?setTimeout(d,0):a.k.t(a.a.ha,null,[b,"change"])}else a.i.X(b,e)}};a.g.W.value=!0;a.d.visible=
{update:function(b,c){var d=a.a.c(c()),e="none"!=b.style.display;d&&!e?b.style.display="":!d&&e&&(b.style.display="none")}};(function(b){a.d[b]={init:function(c,d,e,f,h){return a.d.event.init.call(this,c,function(){var a={};a[b]=d();return a},e,f,h)}}})("click");a.C=function(){};a.C.prototype.renderTemplateSource=function(){throw Error("Override renderTemplateSource");};a.C.prototype.createJavaScriptEvaluatorBlock=function(){throw Error("Override createJavaScriptEvaluatorBlock");};a.C.prototype.makeTemplateSource=
function(b,c){if("string"==typeof b){c=c||w;var d=c.getElementById(b);if(!d)throw Error("Cannot find template with ID "+b);return new a.n.j(d)}if(1==b.nodeType||8==b.nodeType)return new a.n.Z(b);throw Error("Unknown template type: "+b);};a.C.prototype.renderTemplate=function(a,c,d,e){a=this.makeTemplateSource(a,e);return this.renderTemplateSource(a,c,d)};a.C.prototype.isTemplateRewritten=function(a,c){return!1===this.allowTemplateRewriting?!0:this.makeTemplateSource(a,c).data("isRewritten")};a.C.prototype.rewriteTemplate=
function(a,c,d){a=this.makeTemplateSource(a,d);c=c(a.text());a.text(c);a.data("isRewritten",!0)};a.b("templateEngine",a.C);a.Za=function(){function b(b,c,d,g){b=a.g.Ra(b);for(var k=a.g.aa,l=0;l<b.length;l++){var n=b[l].key;if(k.hasOwnProperty(n)){var r=k[n];if("function"===typeof r){if(n=r(b[l].value))throw Error(n);}else if(!r)throw Error("This template engine does not support the '"+n+"' binding within its templates");}}d="ko.__tr_ambtns(function($context,$element){return(function(){return{ "+a.g.qa(b,
{valueAccessors:!0})+" } })()},'"+d.toLowerCase()+"')";return g.createJavaScriptEvaluatorBlock(d)+c}var c=/(<([a-z]+\d*)(?:\s+(?!data-bind\s*=\s*)[a-z0-9\-]+(?:=(?:\"[^\"]*\"|\'[^\']*\'))?)*\s+)data-bind\s*=\s*(["'])([\s\S]*?)\3/gi,d=/\x3c!--\s*ko\b\s*([\s\S]*?)\s*--\x3e/g;return{Ub:function(b,c,d){c.isTemplateRewritten(b,d)||c.rewriteTemplate(b,function(b){return a.Za.dc(b,c)},d)},dc:function(a,f){return a.replace(c,function(a,c,d,e,n){return b(n,c,d,f)}).replace(d,function(a,c){return b(c,"\x3c!-- ko --\x3e",
"#comment",f)})},Mb:function(b,c){return a.w.Na(function(d,g){var k=d.nextSibling;k&&k.nodeName.toLowerCase()===c&&a.xa(k,b,g)})}}}();a.b("__tr_ambtns",a.Za.Mb);(function(){a.n={};a.n.j=function(a){this.j=a};a.n.j.prototype.text=function(){var b=a.a.B(this.j),b="script"===b?"text":"textarea"===b?"value":"innerHTML";if(0==arguments.length)return this.j[b];var c=arguments[0];"innerHTML"===b?a.a.Va(this.j,c):this.j[b]=c};var b=a.a.f.L()+"_";a.n.j.prototype.data=function(c){if(1===arguments.length)return a.a.f.get(this.j,
b+c);a.a.f.set(this.j,b+c,arguments[1])};var c=a.a.f.L();a.n.Z=function(a){this.j=a};a.n.Z.prototype=new a.n.j;a.n.Z.prototype.text=function(){if(0==arguments.length){var b=a.a.f.get(this.j,c)||{};b.$a===p&&b.Ba&&(b.$a=b.Ba.innerHTML);return b.$a}a.a.f.set(this.j,c,{$a:arguments[0]})};a.n.j.prototype.nodes=function(){if(0==arguments.length)return(a.a.f.get(this.j,c)||{}).Ba;a.a.f.set(this.j,c,{Ba:arguments[0]})};a.b("templateSources",a.n);a.b("templateSources.domElement",a.n.j);a.b("templateSources.anonymousTemplate",
a.n.Z)})();(function(){function b(b,c,d){var e;for(c=a.e.nextSibling(c);b&&(e=b)!==c;)b=a.e.nextSibling(e),d(e,b)}function c(c,d){if(c.length){var e=c[0],f=c[c.length-1],h=e.parentNode,m=a.J.instance,q=m.preprocessNode;if(q){b(e,f,function(a,b){var c=a.previousSibling,d=q.call(m,a);d&&(a===e&&(e=d[0]||b),a===f&&(f=d[d.length-1]||c))});c.length=0;if(!e)return;e===f?c.push(e):(c.push(e,f),a.a.ea(c,h))}b(e,f,function(b){1!==b.nodeType&&8!==b.nodeType||a.fb(d,b)});b(e,f,function(b){1!==b.nodeType&&8!==
b.nodeType||a.w.Ib(b,[d])});a.a.ea(c,h)}}function d(a){return a.nodeType?a:0<a.length?a[0]:null}function e(b,e,h,n,r){r=r||{};var m=b&&d(b),m=m&&m.ownerDocument,q=r.templateEngine||f;a.Za.Ub(h,q,m);h=q.renderTemplate(h,n,r,m);if("number"!=typeof h.length||0<h.length&&"number"!=typeof h[0].nodeType)throw Error("Template engine must return an array of DOM nodes");m=!1;switch(e){case "replaceChildren":a.e.U(b,h);m=!0;break;case "replaceNode":a.a.Bb(b,h);m=!0;break;case "ignoreTargetNode":break;default:throw Error("Unknown renderMode: "+
e);}m&&(c(h,n),r.afterRender&&a.k.t(r.afterRender,null,[h,n.$data]));return h}var f;a.Wa=function(b){if(b!=p&&!(b instanceof a.C))throw Error("templateEngine must inherit from ko.templateEngine");f=b};a.Ta=function(b,c,h,n,r){h=h||{};if((h.templateEngine||f)==p)throw Error("Set a template engine before calling renderTemplate");r=r||"replaceChildren";if(n){var m=d(n);return a.h(function(){var f=c&&c instanceof a.I?c:new a.I(a.a.c(c)),p=a.v(b)?b():"function"==typeof b?b(f.$data,f):b,f=e(n,r,p,f,h);
"replaceNode"==r&&(n=f,m=d(n))},null,{Da:function(){return!m||!a.a.Ea(m)},G:m&&"replaceNode"==r?m.parentNode:m})}return a.w.Na(function(d){a.Ta(b,c,h,d,"replaceNode")})};a.jc=function(b,d,f,h,r){function m(a,b){c(b,s);f.afterRender&&f.afterRender(b,a)}function q(a,c){s=r.createChildContext(a,f.as,function(a){a.$index=c});var d="function"==typeof b?b(a,s):b;return e(null,"ignoreTargetNode",d,s,f)}var s;return a.h(function(){var b=a.a.c(d)||[];"undefined"==typeof b.length&&(b=[b]);b=a.a.la(b,function(b){return f.includeDestroyed||
b===p||null===b||!a.a.c(b._destroy)});a.k.t(a.a.Ua,null,[h,b,q,f,m])},null,{G:h})};var h=a.a.f.L();a.d.template={init:function(b,c){var d=a.a.c(c());"string"==typeof d||d.name?a.e.da(b):(d=a.e.childNodes(b),d=a.a.ec(d),(new a.n.Z(b)).nodes(d));return{controlsDescendantBindings:!0}},update:function(b,c,d,e,f){var m=c(),q;c=a.a.c(m);d=!0;e=null;"string"==typeof c?c={}:(m=c.name,"if"in c&&(d=a.a.c(c["if"])),d&&"ifnot"in c&&(d=!a.a.c(c.ifnot)),q=a.a.c(c.data));"foreach"in c?e=a.jc(m||b,d&&c.foreach||
[],c,b,f):d?(f="data"in c?f.createChildContext(q,c.as):f,e=a.Ta(m||b,f,c,b)):a.e.da(b);f=e;(q=a.a.f.get(b,h))&&"function"==typeof q.F&&q.F();a.a.f.set(b,h,f&&f.ga()?f:p)}};a.g.aa.template=function(b){b=a.g.Ra(b);return 1==b.length&&b[0].unknown||a.g.bc(b,"name")?null:"This template engine does not support anonymous templates nested within its templates"};a.e.Q.template=!0})();a.b("setTemplateEngine",a.Wa);a.b("renderTemplate",a.Ta);a.a.nb=function(a,c,d){if(a.length&&c.length){var e,f,h,g,k;for(e=
f=0;(!d||e<d)&&(g=a[f]);++f){for(h=0;k=c[h];++h)if(g.value===k.value){g.moved=k.index;k.moved=g.index;c.splice(h,1);e=h=0;break}e+=h}}};a.a.Aa=function(){function b(b,d,e,f,h){var g=Math.min,k=Math.max,l=[],n,p=b.length,m,q=d.length,s=q-p||1,t=p+q+1,u,w,y;for(n=0;n<=p;n++)for(w=u,l.push(u=[]),y=g(q,n+s),m=k(0,n-1);m<=y;m++)u[m]=m?n?b[n-1]===d[m-1]?w[m-1]:g(w[m]||t,u[m-1]||t)+1:m+1:n+1;g=[];k=[];s=[];n=p;for(m=q;n||m;)q=l[n][m]-1,m&&q===l[n][m-1]?k.push(g[g.length]={status:e,value:d[--m],index:m}):
n&&q===l[n-1][m]?s.push(g[g.length]={status:f,value:b[--n],index:n}):(--m,--n,h.sparse||g.push({status:"retained",value:d[m]}));a.a.nb(k,s,10*p);return g.reverse()}return function(a,d,e){e="boolean"===typeof e?{dontLimitMoves:e}:e||{};a=a||[];d=d||[];return a.length<=d.length?b(a,d,"added","deleted",e):b(d,a,"deleted","added",e)}}();a.b("utils.compareArrays",a.a.Aa);(function(){function b(b,c,f,h,g){var k=[],l=a.h(function(){var l=c(f,g,a.a.ea(k,b))||[];0<k.length&&(a.a.Bb(k,l),h&&a.k.t(h,null,[f,
l,g]));k.length=0;a.a.$(k,l)},null,{G:b,Da:function(){return!a.a.eb(k)}});return{S:k,h:l.ga()?l:p}}var c=a.a.f.L();a.a.Ua=function(d,e,f,h,g){function k(b,c){v=r[c];u!==c&&(z[b]=v);v.Ia(u++);a.a.ea(v.S,d);s.push(v);y.push(v)}function l(b,c){if(b)for(var d=0,e=c.length;d<e;d++)c[d]&&a.a.r(c[d].S,function(a){b(a,d,c[d].ka)})}e=e||[];h=h||{};var n=a.a.f.get(d,c)===p,r=a.a.f.get(d,c)||[],m=a.a.ya(r,function(a){return a.ka}),q=a.a.Aa(m,e,h.dontLimitMoves),s=[],t=0,u=0,w=[],y=[];e=[];for(var z=[],m=[],
v,x=0,A,C;A=q[x];x++)switch(C=A.moved,A.status){case "deleted":C===p&&(v=r[t],v.h&&v.h.F(),w.push.apply(w,a.a.ea(v.S,d)),h.beforeRemove&&(e[x]=v,y.push(v)));t++;break;case "retained":k(x,t++);break;case "added":C!==p?k(x,C):(v={ka:A.value,Ia:a.m(u++)},s.push(v),y.push(v),n||(m[x]=v))}l(h.beforeMove,z);a.a.r(w,h.beforeRemove?a.M:a.removeNode);for(var x=0,n=a.e.firstChild(d),E;v=y[x];x++){v.S||a.a.extend(v,b(d,f,v.ka,g,v.Ia));for(t=0;q=v.S[t];n=q.nextSibling,E=q,t++)q!==n&&a.e.rb(d,q,E);!v.Zb&&g&&(g(v.ka,
v.S,v.Ia),v.Zb=!0)}l(h.beforeRemove,e);l(h.afterMove,z);l(h.afterAdd,m);a.a.f.set(d,c,s)}})();a.b("utils.setDomNodeChildrenFromArrayMapping",a.a.Ua);a.K=function(){this.allowTemplateRewriting=!1};a.K.prototype=new a.C;a.K.prototype.renderTemplateSource=function(b){var c=(9>a.a.oa?0:b.nodes)?b.nodes():null;if(c)return a.a.R(c.cloneNode(!0).childNodes);b=b.text();return a.a.Qa(b)};a.K.Ja=new a.K;a.Wa(a.K.Ja);a.b("nativeTemplateEngine",a.K);(function(){a.La=function(){var a=this.ac=function(){if(!t||
!t.tmpl)return 0;try{if(0<=t.tmpl.tag.tmpl.open.toString().indexOf("__"))return 2}catch(a){}return 1}();this.renderTemplateSource=function(b,e,f){f=f||{};if(2>a)throw Error("Your version of jQuery.tmpl is too old. Please upgrade to jQuery.tmpl 1.0.0pre or later.");var h=b.data("precompiled");h||(h=b.text()||"",h=t.template(null,"{{ko_with $item.koBindingContext}}"+h+"{{/ko_with}}"),b.data("precompiled",h));b=[e.$data];e=t.extend({koBindingContext:e},f.templateOptions);e=t.tmpl(h,b,e);e.appendTo(w.createElement("div"));
t.fragments={};return e};this.createJavaScriptEvaluatorBlock=function(a){return"{{ko_code ((function() { return "+a+" })()) }}"};this.addTemplate=function(a,b){w.write("<script type='text/html' id='"+a+"'>"+b+"\x3c/script>")};0<a&&(t.tmpl.tag.ko_code={open:"__.push($1 || '');"},t.tmpl.tag.ko_with={open:"with($1) {",close:"} "})};a.La.prototype=new a.C;var b=new a.La;0<b.ac&&a.Wa(b);a.b("jqueryTmplTemplateEngine",a.La)})()})})();})();

/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * The binder joins an object instance and a DOM element tree by applying databinding and/or invoking binding lifecycle callbacks (binding and bindingComplete).
 * @module binder
 * @requires system
 * @requires knockout
 */
define('durandal/binder',['durandal/system', 'knockout'], function (system, ko) {
    var binder,
        insufficientInfoMessage = 'Insufficient Information to Bind',
        unexpectedViewMessage = 'Unexpected View Type',
        bindingInstructionKey = 'durandal-binding-instruction',
        koBindingContextKey = '__ko_bindingContext__';

    function normalizeBindingInstruction(result){
        if(result === undefined){
            return { applyBindings: true };
        }

        if(system.isBoolean(result)){
            return { applyBindings:result };
        }

        if(result.applyBindings === undefined){
            result.applyBindings = true;
        }

        return result;
    }

    function doBind(obj, view, bindingTarget, data){
        if (!view || !bindingTarget) {
            if (binder.throwOnErrors) {
                system.error(insufficientInfoMessage);
            } else {
                system.log(insufficientInfoMessage, view, data);
            }
            return;
        }

        if (!view.getAttribute) {
            if (binder.throwOnErrors) {
                system.error(unexpectedViewMessage);
            } else {
                system.log(unexpectedViewMessage, view, data);
            }
            return;
        }

        var viewName = view.getAttribute('data-view');

        try {
            var instruction;

            if (obj && obj.binding) {
                instruction = obj.binding(view);
            }

            instruction = normalizeBindingInstruction(instruction);
            binder.binding(data, view, instruction);

            if(instruction.applyBindings){
                system.log('Binding', viewName, data);
                ko.applyBindings(bindingTarget, view);
            }else if(obj){
                ko.utils.domData.set(view, koBindingContextKey, { $data:obj });
            }

            binder.bindingComplete(data, view, instruction);

            if (obj && obj.bindingComplete) {
                obj.bindingComplete(view);
            }

            ko.utils.domData.set(view, bindingInstructionKey, instruction);
            return instruction;
        } catch (e) {
            e.message = e.message + ';\nView: ' + viewName + ";\nModuleId: " + system.getModuleId(data);
            if (binder.throwOnErrors) {
                system.error(e);
            } else {
                system.log(e.message);
            }
        }
    }

    /**
     * @class BinderModule
     * @static
     */
    return binder = {
        /**
         * Called before every binding operation. Does nothing by default.
         * @method binding
         * @param {object} data The data that is about to be bound.
         * @param {DOMElement} view The view that is about to be bound.
         * @param {object} instruction The object that carries the binding instructions.
         */
        binding: system.noop,
        /**
         * Called after every binding operation. Does nothing by default.
         * @method bindingComplete
         * @param {object} data The data that has just been bound.
         * @param {DOMElement} view The view that has just been bound.
         * @param {object} instruction The object that carries the binding instructions.
         */
        bindingComplete: system.noop,
        /**
         * Indicates whether or not the binding system should throw errors or not.
         * @property {boolean} throwOnErrors
         * @default false The binding system will not throw errors by default. Instead it will log them.
         */
        throwOnErrors: false,
        /**
         * Gets the binding instruction that was associated with a view when it was bound.
         * @method getBindingInstruction
         * @param {DOMElement} view The view that was previously bound.
         * @return {object} The object that carries the binding instructions.
         */
        getBindingInstruction:function(view){
            return ko.utils.domData.get(view, bindingInstructionKey);
        },
        /**
         * Binds the view, preserving the existing binding context. Optionally, a new context can be created, parented to the previous context.
         * @method bindContext
         * @param {KnockoutBindingContext} bindingContext The current binding context.
         * @param {DOMElement} view The view to bind.
         * @param {object} [obj] The data to bind to, causing the creation of a child binding context if present.
         * @param {string} [dataAlias] An alias for $data if present.
         */
        bindContext: function(bindingContext, view, obj, dataAlias) {
            if (obj && bindingContext) {
                bindingContext = bindingContext.createChildContext(obj, typeof(dataAlias) === 'string' ? dataAlias : null);
            }

            return doBind(obj, view, bindingContext, obj || (bindingContext ? bindingContext.$data : null));
        },
        /**
         * Binds the view, preserving the existing binding context. Optionally, a new context can be created, parented to the previous context.
         * @method bind
         * @param {object} obj The data to bind to.
         * @param {DOMElement} view The view to bind.
         */
        bind: function(obj, view) {
            return doBind(obj, view, obj, obj);
        }
    };
});

/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * The activator module encapsulates all logic related to screen/component activation.
 * An activator is essentially an asynchronous state machine that understands a particular state transition protocol.
 * The protocol ensures that the following series of events always occur: `canDeactivate` (previous state), `canActivate` (new state), `deactivate` (previous state), `activate` (new state).
 * Each of the _can_ callbacks may return a boolean, affirmative value or promise for one of those. If either of the _can_ functions yields a false result, then activation halts.
 * @module activator
 * @requires system
 * @requires knockout
 */
define('durandal/activator',['durandal/system', 'knockout'], function (system, ko) {
    var activator;
    var defaultOptions = {
        canDeactivate:true
    };

    function ensureSettings(settings) {
        if (settings == undefined) {
            settings = {};
        }

        if (!system.isBoolean(settings.closeOnDeactivate)) {
            settings.closeOnDeactivate = activator.defaults.closeOnDeactivate;
        }

        if (!settings.beforeActivate) {
            settings.beforeActivate = activator.defaults.beforeActivate;
        }

        if (!settings.afterDeactivate) {
            settings.afterDeactivate = activator.defaults.afterDeactivate;
        }

        if(!settings.affirmations){
            settings.affirmations = activator.defaults.affirmations;
        }

        if (!settings.interpretResponse) {
            settings.interpretResponse = activator.defaults.interpretResponse;
        }

        if (!settings.areSameItem) {
            settings.areSameItem = activator.defaults.areSameItem;
        }

        if (!settings.findChildActivator) {
            settings.findChildActivator = activator.defaults.findChildActivator;
        }

        return settings;
    }

    function invoke(target, method, data) {
        if (system.isArray(data)) {
            return target[method].apply(target, data);
        }

        return target[method](data);
    }

    function deactivate(item, close, settings, dfd, setter) {
        if (item && item.deactivate) {
            system.log('Deactivating', item);

            var result;
            try {
                result = item.deactivate(close);
            } catch(error) {
                system.log('ERROR: ' + error.message, error);
                dfd.resolve(false);
                return;
            }

            if (result && result.then) {
                result.then(function() {
                    settings.afterDeactivate(item, close, setter);
                    dfd.resolve(true);
                }, function(reason) {
                    system.log(reason);
                    dfd.resolve(false);
                });
            } else {
                settings.afterDeactivate(item, close, setter);
                dfd.resolve(true);
            }
        } else {
            if (item) {
                settings.afterDeactivate(item, close, setter);
            }

            dfd.resolve(true);
        }
    }

    function activate(newItem, activeItem, callback, activationData) {
        var result;

        if(newItem && newItem.activate) {
            system.log('Activating', newItem);

            try {
                result = invoke(newItem, 'activate', activationData);
            } catch(error) {
                system.log('ERROR: ' + error.message, error);
                callback(false);
                return;
            }
        }

        if(result && result.then) {
            result.then(function() {
                activeItem(newItem);
                callback(true);
            }, function(reason) {
                system.log('ERROR: ' + reason.message, reason);
                callback(false);
            });
        } else {
            activeItem(newItem);
            callback(true);
        }
    }

    function canDeactivateItem(item, close, settings, options) {
        options = system.extend({}, defaultOptions, options);
        settings.lifecycleData = null;

        return system.defer(function (dfd) {
            function continueCanDeactivate() {
                if (item && item.canDeactivate && options.canDeactivate) {
                    var resultOrPromise;
                    try {
                        resultOrPromise = item.canDeactivate(close);
                    } catch (error) {
                        system.log('ERROR: ' + error.message, error);
                        dfd.resolve(false);
                        return;
                    }

                    if (resultOrPromise.then) {
                        resultOrPromise.then(function (result) {
                            settings.lifecycleData = result;
                            dfd.resolve(settings.interpretResponse(result));
                        }, function (reason) {
                            system.log('ERROR: ' + reason.message, reason);
                            dfd.resolve(false);
                        });
                    } else {
                        settings.lifecycleData = resultOrPromise;
                        dfd.resolve(settings.interpretResponse(resultOrPromise));
                    }
                } else {
                    dfd.resolve(true);
                }
            }

            var childActivator = settings.findChildActivator(item);
            if (childActivator) {
                childActivator.canDeactivate().then(function(result) {
                    if (result) {
                        continueCanDeactivate();
                    } else {
                        dfd.resolve(false);
                    }
                });
            } else {
                continueCanDeactivate();
            }
        }).promise();
    };

    function canActivateItem(newItem, activeItem, settings, activeData, newActivationData) {
        settings.lifecycleData = null;

        return system.defer(function (dfd) {
            if (settings.areSameItem(activeItem(), newItem, activeData, newActivationData)) {
                dfd.resolve(true);
                return;
            }

            if (newItem && newItem.canActivate) {
                var resultOrPromise;
                try {
                    resultOrPromise = invoke(newItem, 'canActivate', newActivationData);
                } catch (error) {
                    system.log('ERROR: ' + error.message, error);
                    dfd.resolve(false);
                    return;
                }

                if (resultOrPromise.then) {
                    resultOrPromise.then(function(result) {
                        settings.lifecycleData = result;
                        dfd.resolve(settings.interpretResponse(result));
                    }, function(reason) {
                        system.log('ERROR: ' + reason.message, reason);
                        dfd.resolve(false);
                    });
                } else {
                    settings.lifecycleData = resultOrPromise;
                    dfd.resolve(settings.interpretResponse(resultOrPromise));
                }
            } else {
                dfd.resolve(true);
            }
        }).promise();
    };

    /**
     * An activator is a read/write computed observable that enforces the activation lifecycle whenever changing values.
     * @class Activator
     */
    function createActivator(initialActiveItem, settings) {
        var activeItem = ko.observable(null);
        var activeData;

        settings = ensureSettings(settings);

        var computed = ko.computed({
            read: function () {
                return activeItem();
            },
            write: function (newValue) {
                computed.viaSetter = true;
                computed.activateItem(newValue);
            }
        });

        computed.__activator__ = true;

        /**
         * The settings for this activator.
         * @property {ActivatorSettings} settings
         */
        computed.settings = settings;
        settings.activator = computed;

        /**
         * An observable which indicates whether or not the activator is currently in the process of activating an instance.
         * @method isActivating
         * @return {boolean}
         */
        computed.isActivating = ko.observable(false);

        computed.forceActiveItem = function (item) {
            activeItem(item);
        };

        /**
         * Determines whether or not the specified item can be deactivated.
         * @method canDeactivateItem
         * @param {object} item The item to check.
         * @param {boolean} close Whether or not to check if close is possible.
         * @param {object} options Options for controlling the activation process.
         * @return {promise}
         */
        computed.canDeactivateItem = function (item, close, options) {
            return canDeactivateItem(item, close, settings, options);
        };

        /**
         * Deactivates the specified item.
         * @method deactivateItem
         * @param {object} item The item to deactivate.
         * @param {boolean} close Whether or not to close the item.
         * @return {promise}
         */
        computed.deactivateItem = function (item, close) {
            return system.defer(function(dfd) {
                computed.canDeactivateItem(item, close).then(function(canDeactivate) {
                    if (canDeactivate) {
                        deactivate(item, close, settings, dfd, activeItem);
                    } else {
                        computed.notifySubscribers();
                        dfd.resolve(false);
                    }
                });
            }).promise();
        };

        /**
         * Determines whether or not the specified item can be activated.
         * @method canActivateItem
         * @param {object} item The item to check.
         * @param {object} activationData Data associated with the activation.
         * @return {promise}
         */
        computed.canActivateItem = function (newItem, activationData) {
            return canActivateItem(newItem, activeItem, settings, activeData, activationData);
        };

        /**
         * Activates the specified item.
         * @method activateItem
         * @param {object} newItem The item to activate.
         * @param {object} newActivationData Data associated with the activation.
         * @param {object} options Options for controlling the activation process.
         * @return {promise}
         */
        computed.activateItem = function (newItem, newActivationData, options) {
            var viaSetter = computed.viaSetter;
            computed.viaSetter = false;

            return system.defer(function (dfd) {
                if (computed.isActivating()) {
                    dfd.resolve(false);
                    return;
                }

                computed.isActivating(true);

                var currentItem = activeItem();
                if (settings.areSameItem(currentItem, newItem, activeData, newActivationData)) {
                    computed.isActivating(false);
                    dfd.resolve(true);
                    return;
                }

                computed.canDeactivateItem(currentItem, settings.closeOnDeactivate, options).then(function (canDeactivate) {
                    if (canDeactivate) {
                        computed.canActivateItem(newItem, newActivationData).then(function (canActivate) {
                            if (canActivate) {
                                system.defer(function (dfd2) {
                                    deactivate(currentItem, settings.closeOnDeactivate, settings, dfd2);
                                }).promise().then(function () {
                                        newItem = settings.beforeActivate(newItem, newActivationData);
                                        activate(newItem, activeItem, function (result) {
                                            activeData = newActivationData;
                                            computed.isActivating(false);
                                            dfd.resolve(result);
                                        }, newActivationData);
                                    });
                            } else {
                                if (viaSetter) {
                                    computed.notifySubscribers();
                                }

                                computed.isActivating(false);
                                dfd.resolve(false);
                            }
                        });
                    } else {
                        if (viaSetter) {
                            computed.notifySubscribers();
                        }

                        computed.isActivating(false);
                        dfd.resolve(false);
                    }
                });
            }).promise();
        };

        /**
         * Determines whether or not the activator, in its current state, can be activated.
         * @method canActivate
         * @return {promise}
         */
        computed.canActivate = function () {
            var toCheck;

            if (initialActiveItem) {
                toCheck = initialActiveItem;
                initialActiveItem = false;
            } else {
                toCheck = computed();
            }

            return computed.canActivateItem(toCheck);
        };

        /**
         * Activates the activator, in its current state.
         * @method activate
         * @return {promise}
         */
        computed.activate = function () {
            var toActivate;

            if (initialActiveItem) {
                toActivate = initialActiveItem;
                initialActiveItem = false;
            } else {
                toActivate = computed();
            }

            return computed.activateItem(toActivate);
        };

        /**
         * Determines whether or not the activator, in its current state, can be deactivated.
         * @method canDeactivate
         * @return {promise}
         */
        computed.canDeactivate = function (close) {
            return computed.canDeactivateItem(computed(), close);
        };

        /**
         * Deactivates the activator, in its current state.
         * @method deactivate
         * @return {promise}
         */
        computed.deactivate = function (close) {
            return computed.deactivateItem(computed(), close);
        };

        computed.includeIn = function (includeIn) {
            includeIn.canActivate = function () {
                return computed.canActivate();
            };

            includeIn.activate = function () {
                return computed.activate();
            };

            includeIn.canDeactivate = function (close) {
                return computed.canDeactivate(close);
            };

            includeIn.deactivate = function (close) {
                return computed.deactivate(close);
            };
        };

        if (settings.includeIn) {
            computed.includeIn(settings.includeIn);
        } else if (initialActiveItem) {
            computed.activate();
        }

        computed.forItems = function (items) {
            settings.closeOnDeactivate = false;

            settings.determineNextItemToActivate = function (list, lastIndex) {
                var toRemoveAt = lastIndex - 1;

                if (toRemoveAt == -1 && list.length > 1) {
                    return list[1];
                }

                if (toRemoveAt > -1 && toRemoveAt < list.length - 1) {
                    return list[toRemoveAt];
                }

                return null;
            };

            settings.beforeActivate = function (newItem) {
                var currentItem = computed();

                if (!newItem) {
                    newItem = settings.determineNextItemToActivate(items, currentItem ? items.indexOf(currentItem) : 0);
                } else {
                    var index = items.indexOf(newItem);

                    if (index == -1) {
                        items.push(newItem);
                    } else {
                        newItem = items()[index];
                    }
                }

                return newItem;
            };

            settings.afterDeactivate = function (oldItem, close) {
                if (close) {
                    items.remove(oldItem);
                }
            };

            var originalCanDeactivate = computed.canDeactivate;
            computed.canDeactivate = function (close) {
                if (close) {
                    return system.defer(function (dfd) {
                        var list = items();
                        var results = [];

                        function finish() {
                            for (var j = 0; j < results.length; j++) {
                                if (!results[j]) {
                                    dfd.resolve(false);
                                    return;
                                }
                            }

                            dfd.resolve(true);
                        }

                        for (var i = 0; i < list.length; i++) {
                            computed.canDeactivateItem(list[i], close).then(function (result) {
                                results.push(result);
                                if (results.length == list.length) {
                                    finish();
                                }
                            });
                        }
                    }).promise();
                } else {
                    return originalCanDeactivate();
                }
            };

            var originalDeactivate = computed.deactivate;
            computed.deactivate = function (close) {
                if (close) {
                    return system.defer(function (dfd) {
                        var list = items();
                        var results = 0;
                        var listLength = list.length;

                        function doDeactivate(item) {
                            setTimeout(function () {
                                computed.deactivateItem(item, close).then(function () {
                                    results++;
                                    items.remove(item);
                                    if (results == listLength) {
                                        dfd.resolve();
                                    }
                                });
                            }, 1);
                        }

                        for (var i = 0; i < listLength; i++) {
                            doDeactivate(list[i]);
                        }
                    }).promise();
                } else {
                    return originalDeactivate();
                }
            };

            return computed;
        };

        return computed;
    }

    /**
     * @class ActivatorSettings
     * @static
     */
    var activatorSettings = {
        /**
         * The default value passed to an object's deactivate function as its close parameter.
         * @property {boolean} closeOnDeactivate
         * @default true
         */
        closeOnDeactivate: true,
        /**
         * Lower-cased words which represent a truthy value.
         * @property {string[]} affirmations
         * @default ['yes', 'ok', 'true']
         */
        affirmations: ['yes', 'ok', 'true'],
        /**
         * Interprets the response of a `canActivate` or `canDeactivate` call using the known affirmative values in the `affirmations` array.
         * @method interpretResponse
         * @param {object} value
         * @return {boolean}
         */
        interpretResponse: function(value) {
            if(system.isObject(value)) {
                value = value.can || false;
            }

            if(system.isString(value)) {
                return ko.utils.arrayIndexOf(this.affirmations, value.toLowerCase()) !== -1;
            }

            return value;
        },
        /**
         * Determines whether or not the current item and the new item are the same.
         * @method areSameItem
         * @param {object} currentItem
         * @param {object} newItem
         * @param {object} currentActivationData
         * @param {object} newActivationData
         * @return {boolean}
         */
        areSameItem: function(currentItem, newItem, currentActivationData, newActivationData) {
            return currentItem == newItem;
        },
        /**
         * Called immediately before the new item is activated.
         * @method beforeActivate
         * @param {object} newItem
         */
        beforeActivate: function(newItem) {
            return newItem;
        },
        /**
         * Called immediately after the old item is deactivated.
         * @method afterDeactivate
         * @param {object} oldItem The previous item.
         * @param {boolean} close Whether or not the previous item was closed.
         * @param {function} setter The activate item setter function.
         */
        afterDeactivate: function(oldItem, close, setter) {
            if(close && setter) {
                setter(null);
            }
        },
        findChildActivator: function(item){
            return null;
        }
    };

    /**
     * @class ActivatorModule
     * @static
     */
    activator = {
        /**
         * The default settings used by activators.
         * @property {ActivatorSettings} defaults
         */
        defaults: activatorSettings,
        /**
         * Creates a new activator.
         * @method create
         * @param {object} [initialActiveItem] The item which should be immediately activated upon creation of the ativator.
         * @param {ActivatorSettings} [settings] Per activator overrides of the default activator settings.
         * @return {Activator} The created activator.
         */
        create: createActivator,
        /**
         * Determines whether or not the provided object is an activator or not.
         * @method isActivator
         * @param {object} object Any object you wish to verify as an activator or not.
         * @return {boolean} True if the object is an activator; false otherwise.
         */
        isActivator:function(object){
            return object && object.__activator__;
        }
    };

    return activator;
});

/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * The composition module encapsulates all functionality related to visual composition.
 * @module composition
 * @requires system
 * @requires viewLocator
 * @requires binder
 * @requires viewEngine
 * @requires activator
 * @requires jquery
 * @requires knockout
 */
define('durandal/composition',['durandal/system', 'durandal/viewLocator', 'durandal/binder', 'durandal/viewEngine', 'durandal/activator', 'jquery', 'knockout'], function (system, viewLocator, binder, viewEngine, activator, $, ko) {
    var dummyModel = {},
        activeViewAttributeName = 'data-active-view',
        composition,
        compositionCompleteCallbacks = [],
        compositionCount = 0,
        compositionDataKey = 'durandal-composition-data',
        partAttributeName = 'data-part',
        bindableSettings = ['model', 'view', 'transition', 'area', 'strategy', 'activationData', 'onError'],
        visibilityKey = "durandal-visibility-data",
        composeBindings = ['compose:'];
    
    function onError(context, error, element) {
        try {
            if (context.onError) {
                try {
                    context.onError(error, element);
                } catch (e) {
                    system.error(e);
                }
            } else {
                system.error(error);
            }
        } finally {
            endComposition(context, element, true);
        }
    }

    function getHostState(parent) {
        var elements = [];
        var state = {
            childElements: elements,
            activeView: null
        };

        var child = ko.virtualElements.firstChild(parent);

        while (child) {
            if (child.nodeType == 1) {
                elements.push(child);
                if (child.getAttribute(activeViewAttributeName)) {
                    state.activeView = child;
                }
            }

            child = ko.virtualElements.nextSibling(child);
        }

        if(!state.activeView){
            state.activeView = elements[0];
        }

        return state;
    }

    function endComposition(context, element, error) {
        compositionCount--;

        if(compositionCount === 0) {
            var callBacks = compositionCompleteCallbacks;
            compositionCompleteCallbacks = [];
            
            if (!error) {
                setTimeout(function () {
                    var i = callBacks.length;

                    while (i--) {
                        try {
                            callBacks[i]();
                        } catch (e) {
                            onError(context, e, element);
                        }
                    }
                }, 1);
            }
        }

        cleanUp(context);
    }

    function cleanUp(context){
        delete context.activeView;
        delete context.viewElements;
    }

    function tryActivate(context, successCallback, skipActivation, element) {
        if(skipActivation){
            successCallback();
        } else if (context.activate && context.model && context.model.activate) {
            var result;

            try{
                if(system.isArray(context.activationData)) {
                    result = context.model.activate.apply(context.model, context.activationData);
                } else {
                    result = context.model.activate(context.activationData);
                }

                if(result && result.then) {
                    result.then(successCallback, function(reason) {
                        onError(context, reason, element);
                        successCallback();
                    });
                } else if(result || result === undefined) {
                    successCallback();
                } else {
                    endComposition(context, element);
                }
            }
            catch(e){
                onError(context, e, element);
            }
        } else {
            successCallback();
        }
    }

    function triggerAttach(context, element) {
        var context = this;

        if (context.activeView) {
            context.activeView.removeAttribute(activeViewAttributeName);
        }

        if (context.child) {
            try{
                if (context.model && context.model.attached) {
                    if (context.composingNewView || context.alwaysTriggerAttach) {
                        context.model.attached(context.child, context.parent, context);
                    }
                }

                if (context.attached) {
                    context.attached(context.child, context.parent, context);
                }

                context.child.setAttribute(activeViewAttributeName, true);

                if (context.composingNewView && context.model && context.model.detached) {
                    ko.utils.domNodeDisposal.addDisposeCallback(context.child, function () {
                        try{
                            context.model.detached(context.child, context.parent, context);
                        }catch(e2){
                            onError(context, e2, element);
                        }
                    });
                }
            }catch(e){
                onError(context, e, element);
            }
        }

        context.triggerAttach = system.noop;
    }

    function shouldTransition(context) {
        if (system.isString(context.transition)) {
            if (context.activeView) {
                if (context.activeView == context.child) {
                    return false;
                }

                if (!context.child) {
                    return true;
                }

                if (context.skipTransitionOnSameViewId) {
                    var currentViewId = context.activeView.getAttribute('data-view');
                    var newViewId = context.child.getAttribute('data-view');
                    return currentViewId != newViewId;
                }
            }

            return true;
        }

        return false;
    }

    function cloneNodes(nodesArray) {
        for (var i = 0, j = nodesArray.length, newNodesArray = []; i < j; i++) {
            var clonedNode = nodesArray[i].cloneNode(true);
            newNodesArray.push(clonedNode);
        }
        return newNodesArray;
    }

    function replaceParts(context){
        var parts = cloneNodes(context.parts);
        var replacementParts = composition.getParts(parts);
        var standardParts = composition.getParts(context.child);

        for (var partId in replacementParts) {
            var toReplace = standardParts[partId];
            if (!toReplace) {
                toReplace = $('[data-part="' + partId + '"]', context.child).get(0);
                if (!toReplace) {
                    system.log('Could not find part to override: ' + partId);
                    continue;
                }
            }

            toReplace.parentNode.replaceChild(replacementParts[partId], toReplace);
        }
    }

    function removePreviousView(context){
        var children = ko.virtualElements.childNodes(context.parent), i, len;

        if(!system.isArray(children)){
            var arrayChildren = [];
            for(i = 0, len = children.length; i < len; i++){
                arrayChildren[i] = children[i];
            }
            children = arrayChildren;
        }

        for(i = 1,len = children.length; i < len; i++){
            ko.removeNode(children[i]);
        }
    }

    function hide(view) {
        ko.utils.domData.set(view, visibilityKey, view.style.display);
        view.style.display = 'none';
    }

    function show(view) {
        var displayStyle = ko.utils.domData.get(view, visibilityKey);
        view.style.display = displayStyle === 'none' ? 'block' : displayStyle;
    }

    function hasComposition(element){
        var dataBind = element.getAttribute('data-bind');
        if(!dataBind){
            return false;
        }

        for(var i = 0, length = composeBindings.length; i < length; i++){
            if(dataBind.indexOf(composeBindings[i]) > -1){
                return true;
            }
        }

        return false;
    }

    /**
     * @class CompositionTransaction
     * @static
     */
    var compositionTransaction = {
        /**
         * Registers a callback which will be invoked when the current composition transaction has completed. The transaction includes all parent and children compositions.
         * @method complete
         * @param {function} callback The callback to be invoked when composition is complete.
         */
        complete: function (callback) {
            compositionCompleteCallbacks.push(callback);
        }
    };

    /**
     * @class CompositionModule
     * @static
     */
    composition = {
        /**
         * An array of all the binding handler names (includeing :) that trigger a composition.
         * @property {string} composeBindings
         * @default ['compose:']
         */
        composeBindings:composeBindings,
        /**
         * Converts a transition name to its moduleId.
         * @method convertTransitionToModuleId
         * @param {string} name The name of the transtion.
         * @return {string} The moduleId.
         */
        convertTransitionToModuleId: function (name) {
            return 'transitions/' + name;
        },
        /**
         * The name of the transition to use in all compositions.
         * @property {string} defaultTransitionName
         * @default null
         */
        defaultTransitionName: null,
        /**
         * Represents the currently executing composition transaction.
         * @property {CompositionTransaction} current
         */
        current: compositionTransaction,
        /**
         * Registers a binding handler that will be invoked when the current composition transaction is complete.
         * @method addBindingHandler
         * @param {string} name The name of the binding handler.
         * @param {object} [config] The binding handler instance. If none is provided, the name will be used to look up an existing handler which will then be converted to a composition handler.
         * @param {function} [initOptionsFactory] If the registered binding needs to return options from its init call back to knockout, this function will server as a factory for those options. It will receive the same parameters that the init function does.
         */
        addBindingHandler:function(name, config, initOptionsFactory){
            var key,
                dataKey = 'composition-handler-' + name,
                handler;

            config = config || ko.bindingHandlers[name];
            initOptionsFactory = initOptionsFactory || function(){ return undefined;  };

            handler = ko.bindingHandlers[name] = {
                init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
                    if(compositionCount > 0){
                        var data = {
                            trigger:ko.observable(null)
                        };

                        composition.current.complete(function(){
                            if(config.init){
                                config.init(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext);
                            }

                            if(config.update){
                                ko.utils.domData.set(element, dataKey, config);
                                data.trigger('trigger');
                            }
                        });

                        ko.utils.domData.set(element, dataKey, data);
                    }else{
                        ko.utils.domData.set(element, dataKey, config);

                        if(config.init){
                            config.init(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext);
                        }
                    }

                    return initOptionsFactory(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext);
                },
                update: function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
                    var data = ko.utils.domData.get(element, dataKey);

                    if(data.update){
                        return data.update(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext);
                    }

                    if(data.trigger){
                        data.trigger();
                    }
                }
            };

            for (key in config) {
                if (key !== "init" && key !== "update") {
                    handler[key] = config[key];
                }
            }
        },
        /**
         * Gets an object keyed with all the elements that are replacable parts, found within the supplied elements. The key will be the part name and the value will be the element itself.
         * @method getParts
         * @param {DOMElement\DOMElement[]} elements The element(s) to search for parts.
         * @return {object} An object keyed by part.
         */
        getParts: function(elements, parts) {
            parts = parts || {};

            if (!elements) {
                return parts;
            }

            if (elements.length === undefined) {
                elements = [elements];
            }

            for (var i = 0, length = elements.length; i < length; i++) {
                var element = elements[i],
                    id;

                if (element.getAttribute) {
                    id = element.getAttribute(partAttributeName);
                    if (id) {
                        parts[id] = element;
                    }

                    if (element.hasChildNodes() && !hasComposition(element)) {
                        composition.getParts(element.childNodes, parts);
                    }
                }
            }

            return parts;
        },
        cloneNodes:cloneNodes,
        finalize: function (context, element) {
            if(context.transition === undefined) {
                context.transition = this.defaultTransitionName;
            }

            if(!context.child && !context.activeView){
                if (!context.cacheViews) {
                    ko.virtualElements.emptyNode(context.parent);
                }

                context.triggerAttach(context, element);
                endComposition(context, element);
            } else if (shouldTransition(context)) {
                var transitionModuleId = this.convertTransitionToModuleId(context.transition);

                system.acquire(transitionModuleId).then(function (transition) {
                    context.transition = transition;

                    transition(context).then(function () {
                        if (!context.cacheViews) {
                            if(!context.child){
                                ko.virtualElements.emptyNode(context.parent);
                            }else{
                                removePreviousView(context);
                            }
                        }else if(context.activeView){
                            var instruction = binder.getBindingInstruction(context.activeView);
                            if(instruction && instruction.cacheViews != undefined && !instruction.cacheViews){
                                ko.removeNode(context.activeView);
                            }else{
                                hide(context.activeView);
                            }
                        }

                        if (context.child) {
                            show(context.child);
                        }

                        context.triggerAttach(context, element);
                        endComposition(context, element);
                    });
                }).fail(function(err){
                    onError(context, 'Failed to load transition (' + transitionModuleId + '). Details: ' + err.message, element);
                });
            } else {
                if (context.child != context.activeView) {
                    if (context.cacheViews && context.activeView) {
                        var instruction = binder.getBindingInstruction(context.activeView);
                        if(!instruction || (instruction.cacheViews != undefined && !instruction.cacheViews)){
                            ko.removeNode(context.activeView);
                        }else{
                            hide(context.activeView);
                        }
                    }

                    if (!context.child) {
                        if (!context.cacheViews) {
                            ko.virtualElements.emptyNode(context.parent);
                        }
                    } else {
                        if (!context.cacheViews) {
                            removePreviousView(context);
                        }

                        show(context.child);
                    }
                }

                context.triggerAttach(context, element);
                endComposition(context, element);
            }
        },
        bindAndShow: function (child, element, context, skipActivation) {
            context.child = child;
            context.parent.__composition_context = context;

            if (context.cacheViews) {
                context.composingNewView = (ko.utils.arrayIndexOf(context.viewElements, child) == -1);
            } else {
                context.composingNewView = true;
            }

            tryActivate(context, function () {
                if (context.parent.__composition_context == context) {
                    delete context.parent.__composition_context;

                    if (context.binding) {
                        context.binding(context.child, context.parent, context);
                    }

                    if (context.preserveContext && context.bindingContext) {
                        if (context.composingNewView) {
                            if(context.parts){
                                replaceParts(context);
                            }

                            hide(child);
                            ko.virtualElements.prepend(context.parent, child);

                        binder.bindContext(context.bindingContext, child, context.model, context.as);
                        }
                    } else if (child) {
                        var modelToBind = context.model || dummyModel;
                        var currentModel = ko.dataFor(child);

                        if (currentModel != modelToBind) {
                            if (!context.composingNewView) {
                                ko.removeNode(child);
                                viewEngine.createView(child.getAttribute('data-view')).then(function(recreatedView) {
                                    composition.bindAndShow(recreatedView, element, context, true);
                                });
                                return;
                            }

                            if(context.parts){
                                replaceParts(context);
                            }

                            hide(child);
                            ko.virtualElements.prepend(context.parent, child);

                            binder.bind(modelToBind, child);
                        }
                    }

                    composition.finalize(context, element);
                } else {
                    endComposition(context, element);
                }
            }, skipActivation, element);
        },
        /**
         * Eecutes the default view location strategy.
         * @method defaultStrategy
         * @param {object} context The composition context containing the model and possibly existing viewElements.
         * @return {promise} A promise for the view.
         */
        defaultStrategy: function (context) {
            return viewLocator.locateViewForObject(context.model, context.area, context.viewElements);
        },
        getSettings: function (valueAccessor, element) {
            var value = valueAccessor(),
                settings = ko.utils.unwrapObservable(value) || {},
                activatorPresent = activator.isActivator(value),
                moduleId;

            if (system.isString(settings)) {
                if (viewEngine.isViewUrl(settings)) {
                    settings = {
                        view: settings
                    };
                } else {
                    settings = {
                        model: settings,
                        activate: !activatorPresent
                    };
                }

                return settings;
            }

            moduleId = system.getModuleId(settings);
            if (moduleId) {
                settings = {
                    model: settings,
                    activate: !activatorPresent
                };

                return settings;
            }

            if(!activatorPresent && settings.model) {
                activatorPresent = activator.isActivator(settings.model);
            }

            for (var attrName in settings) {
                if (ko.utils.arrayIndexOf(bindableSettings, attrName) != -1) {
                    settings[attrName] = ko.utils.unwrapObservable(settings[attrName]);
                } else {
                    settings[attrName] = settings[attrName];
                }
            }

            if (activatorPresent) {
                settings.activate = false;
            } else if (settings.activate === undefined) {
                settings.activate = true;
            }

            return settings;
        },
        executeStrategy: function (context, element) {
            context.strategy(context).then(function (child) {
                composition.bindAndShow(child, element, context);
            });
        },
        inject: function (context, element) {
            if (!context.model) {
                this.bindAndShow(null, element, context);
                return;
            }

            if (context.view) {
                viewLocator.locateView(context.view, context.area, context.viewElements).then(function (child) {
                    composition.bindAndShow(child, element, context);
                });
                return;
            }

            if (!context.strategy) {
                context.strategy = this.defaultStrategy;
            }

            if (system.isString(context.strategy)) {
                system.acquire(context.strategy).then(function (strategy) {
                    context.strategy = strategy;
                    composition.executeStrategy(context, element);
                }).fail(function (err) {
                    onError(context, 'Failed to load view strategy (' + context.strategy + '). Details: ' + err.message, element);
                });
            } else {
                this.executeStrategy(context, element);
            }
        },
        /**
         * Initiates a composition.
         * @method compose
         * @param {DOMElement} element The DOMElement or knockout virtual element that serves as the parent for the composition.
         * @param {object} settings The composition settings.
         * @param {object} [bindingContext] The current binding context.
         */
        compose: function (element, settings, bindingContext, fromBinding) {
            compositionCount++;

            if(!fromBinding){
                settings = composition.getSettings(function() { return settings; }, element);
            }

            if (settings.compositionComplete) {
                compositionCompleteCallbacks.push(function () {
                    settings.compositionComplete(settings.child, settings.parent, settings);
                });
            }

            compositionCompleteCallbacks.push(function () {
                if(settings.composingNewView && settings.model && settings.model.compositionComplete){
                    settings.model.compositionComplete(settings.child, settings.parent, settings);
                }
            });

            var hostState = getHostState(element);

            settings.activeView = hostState.activeView;
            settings.parent = element;
            settings.triggerAttach = triggerAttach;
            settings.bindingContext = bindingContext;

            if (settings.cacheViews && !settings.viewElements) {
                settings.viewElements = hostState.childElements;
            }

            if (!settings.model) {
                if (!settings.view) {
                    this.bindAndShow(null, element, settings);
                } else {
                    settings.area = settings.area || 'partial';
                    settings.preserveContext = true;

                    viewLocator.locateView(settings.view, settings.area, settings.viewElements).then(function (child) {
                        composition.bindAndShow(child, element, settings);
                    });
                }
            } else if (system.isString(settings.model)) {
                system.acquire(settings.model).then(function (module) {
                    settings.model = system.resolveObject(module);
                    composition.inject(settings, element);
                }).fail(function (err) {
                    onError(settings, 'Failed to load composed module (' + settings.model + '). Details: ' + err.message, element);
                });
            } else {
                composition.inject(settings, element);
            }
        }
    };

    ko.bindingHandlers.compose = {
        init: function() {
            return { controlsDescendantBindings: true };
        },
        update: function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
            var settings = composition.getSettings(valueAccessor, element);
            if(settings.mode){
                var data = ko.utils.domData.get(element, compositionDataKey);
                if(!data){
                    var childNodes = ko.virtualElements.childNodes(element);
                    data = {};

                    if(settings.mode === 'inline'){
                        data.view = viewEngine.ensureSingleElement(childNodes);
                    }else if(settings.mode === 'templated'){
                        data.parts = cloneNodes(childNodes);
                    }

                    ko.virtualElements.emptyNode(element);
                    ko.utils.domData.set(element, compositionDataKey, data);
                }

                if(settings.mode === 'inline'){
                    settings.view = data.view.cloneNode(true);
                }else if(settings.mode === 'templated'){
                    settings.parts = data.parts;
                }

                settings.preserveContext = true;
            }

            composition.compose(element, settings, bindingContext, true);
        }
    };

    ko.virtualElements.allowedBindings.compose = true;

    return composition;
});

/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * Durandal events originate from backbone.js but also combine some ideas from signals.js as well as some additional improvements.
 * Events can be installed into any object and are installed into the `app` module by default for convenient app-wide eventing.
 * @module events
 * @requires system
 */
define('durandal/events',['durandal/system'], function (system) {
    var eventSplitter = /\s+/;
    var Events = function() { };

    /**
     * Represents an event subscription.
     * @class Subscription
     */
    var Subscription = function(owner, events) {
        this.owner = owner;
        this.events = events;
    };

    /**
     * Attaches a callback to the event subscription.
     * @method then
     * @param {function} callback The callback function to invoke when the event is triggered.
     * @param {object} [context] An object to use as `this` when invoking the `callback`.
     * @chainable
     */
    Subscription.prototype.then = function (callback, context) {
        this.callback = callback || this.callback;
        this.context = context || this.context;
        
        if (!this.callback) {
            return this;
        }

        this.owner.on(this.events, this.callback, this.context);
        return this;
    };

    /**
     * Attaches a callback to the event subscription.
     * @method on
     * @param {function} [callback] The callback function to invoke when the event is triggered. If `callback` is not provided, the previous callback will be re-activated.
     * @param {object} [context] An object to use as `this` when invoking the `callback`.
     * @chainable
     */
    Subscription.prototype.on = Subscription.prototype.then;

    /**
     * Cancels the subscription.
     * @method off
     * @chainable
     */
    Subscription.prototype.off = function () {
        this.owner.off(this.events, this.callback, this.context);
        return this;
    };

    /**
     * Creates an object with eventing capabilities.
     * @class Events
     */

    /**
     * Creates a subscription or registers a callback for the specified event.
     * @method on
     * @param {string} events One or more events, separated by white space.
     * @param {function} [callback] The callback function to invoke when the event is triggered. If `callback` is not provided, a subscription instance is returned.
     * @param {object} [context] An object to use as `this` when invoking the `callback`.
     * @return {Subscription|Events} A subscription is returned if no callback is supplied, otherwise the events object is returned for chaining.
     */
    Events.prototype.on = function(events, callback, context) {
        var calls, event, list;

        if (!callback) {
            return new Subscription(this, events);
        } else {
            calls = this.callbacks || (this.callbacks = {});
            events = events.split(eventSplitter);

            while (event = events.shift()) {
                list = calls[event] || (calls[event] = []);
                list.push(callback, context);
            }

            return this;
        }
    };

    /**
     * Removes the callbacks for the specified events.
     * @method off
     * @param {string} [events] One or more events, separated by white space to turn off. If no events are specified, then the callbacks will be removed.
     * @param {function} [callback] The callback function to remove. If `callback` is not provided, all callbacks for the specified events will be removed.
     * @param {object} [context] The object that was used as `this`. Callbacks with this context will be removed.
     * @chainable
     */
    Events.prototype.off = function(events, callback, context) {
        var event, calls, list, i;

        // No events
        if (!(calls = this.callbacks)) {
            return this;
        }

        //removing all
        if (!(events || callback || context)) {
            delete this.callbacks;
            return this;
        }

        events = events ? events.split(eventSplitter) : system.keys(calls);

        // Loop through the callback list, splicing where appropriate.
        while (event = events.shift()) {
            if (!(list = calls[event]) || !(callback || context)) {
                delete calls[event];
                continue;
            }

            for (i = list.length - 2; i >= 0; i -= 2) {
                if (!(callback && list[i] !== callback || context && list[i + 1] !== context)) {
                    list.splice(i, 2);
                }
            }
        }

        return this;
    };

    /**
     * Triggers the specified events.
     * @method trigger
     * @param {string} [events] One or more events, separated by white space to trigger.
     * @chainable
     */
    Events.prototype.trigger = function(events) {
        var event, calls, list, i, length, args, all, rest;
        if (!(calls = this.callbacks)) {
            return this;
        }

        rest = [];
        events = events.split(eventSplitter);
        for (i = 1, length = arguments.length; i < length; i++) {
            rest[i - 1] = arguments[i];
        }

        // For each event, walk through the list of callbacks twice, first to
        // trigger the event, then to trigger any `"all"` callbacks.
        while (event = events.shift()) {
            // Copy callback lists to prevent modification.
            if (all = calls.all) {
                all = all.slice();
            }

            if (list = calls[event]) {
                list = list.slice();
            }

            // Execute event callbacks.
            if (list) {
                for (i = 0, length = list.length; i < length; i += 2) {
                    list[i].apply(list[i + 1] || this, rest);
                }
            }

            // Execute "all" callbacks.
            if (all) {
                args = [event].concat(rest);
                for (i = 0, length = all.length; i < length; i += 2) {
                    all[i].apply(all[i + 1] || this, args);
                }
            }
        }

        return this;
    };

    /**
     * Creates a function that will trigger the specified events when called. Simplifies proxying jQuery (or other) events through to the events object.
     * @method proxy
     * @param {string} events One or more events, separated by white space to trigger by invoking the returned function.
     * @return {function} Calling the function will invoke the previously specified events on the events object.
     */
    Events.prototype.proxy = function(events) {
        var that = this;
        return (function(arg) {
            that.trigger(events, arg);
        });
    };

    /**
     * Creates an object with eventing capabilities.
     * @class EventsModule
     * @static
     */

    /**
     * Adds eventing capabilities to the specified object.
     * @method includeIn
     * @param {object} targetObject The object to add eventing capabilities to.
     */
    Events.includeIn = function(targetObject) {
        targetObject.on = Events.prototype.on;
        targetObject.off = Events.prototype.off;
        targetObject.trigger = Events.prototype.trigger;
        targetObject.proxy = Events.prototype.proxy;
    };

    return Events;
});

/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * The app module controls app startup, plugin loading/configuration and root visual display.
 * @module app
 * @requires system
 * @requires viewEngine
 * @requires composition
 * @requires events
 * @requires jquery
 */
define('durandal/app',['durandal/system', 'durandal/viewEngine', 'durandal/composition', 'durandal/events', 'jquery'], function(system, viewEngine, composition, Events, $) {
    var app,
        allPluginIds = [],
        allPluginConfigs = [];

    function loadPlugins(){
        return system.defer(function(dfd){
            if(allPluginIds.length == 0){
                dfd.resolve();
                return;
            }

            system.acquire(allPluginIds).then(function(loaded){
                for(var i = 0; i < loaded.length; i++){
                    var currentModule = loaded[i];

                    if(currentModule.install){
                        var config = allPluginConfigs[i];
                        if(!system.isObject(config)){
                            config = {};
                        }

                        currentModule.install(config);
                        system.log('Plugin:Installed ' + allPluginIds[i]);
                    }else{
                        system.log('Plugin:Loaded ' + allPluginIds[i]);
                    }
                }

                dfd.resolve();
            }).fail(function(err){
                system.error('Failed to load plugin(s). Details: ' + err.message);
            });
        }).promise();
    }

    /**
     * @class AppModule
     * @static
     * @uses Events
     */
    app = {
        /**
         * The title of your application.
         * @property {string} title
         */
        title: 'Application',
        /**
         * Configures one or more plugins to be loaded and installed into the application.
         * @method configurePlugins
         * @param {object} config Keys are plugin names. Values can be truthy, to simply install the plugin, or a configuration object to pass to the plugin.
         * @param {string} [baseUrl] The base url to load the plugins from.
         */
        configurePlugins:function(config, baseUrl){
            var pluginIds = system.keys(config);
            baseUrl = baseUrl || 'plugins/';

            if(baseUrl.indexOf('/', baseUrl.length - 1) === -1){
                baseUrl += '/';
            }

            for(var i = 0; i < pluginIds.length; i++){
                var key = pluginIds[i];
                allPluginIds.push(baseUrl + key);
                allPluginConfigs.push(config[key]);
            }
        },
        /**
         * Starts the application.
         * @method start
         * @return {promise}
         */
        start: function() {
            system.log('Application:Starting');

            if (this.title) {
                document.title = this.title;
            }

            return system.defer(function (dfd) {
                $(function() {
                    loadPlugins().then(function(){
                        dfd.resolve();
                        system.log('Application:Started');
                    });
                });
            }).promise();
        },
        /**
         * Sets the root module/view for the application.
         * @method setRoot
         * @param {string} root The root view or module.
         * @param {string} [transition] The transition to use from the previous root (or splash screen) into the new root.
         * @param {string} [applicationHost] The application host element or id. By default the id 'applicationHost' will be used.
         */
        setRoot: function(root, transition, applicationHost) {
            var hostElement, settings = { activate:true, transition: transition };

            if (!applicationHost || system.isString(applicationHost)) {
                hostElement = document.getElementById(applicationHost || 'applicationHost');
            } else {
                hostElement = applicationHost;
            }

            if (system.isString(root)) {
                if (viewEngine.isViewUrl(root)) {
                    settings.view = root;
                } else {
                    settings.model = root;
                }
            } else {
                settings.model = root;
            }

            function finishComposition() {
                if(settings.model) {
                    if (settings.model.canActivate) {
                        try {
                            var result = settings.model.canActivate();
                            if (result && result.then) {
                                result.then(function (actualResult) {
                                    if (actualResult) {
                                        composition.compose(hostElement, settings);
                                    }
                                }).fail(function (err) {
                                    system.error(err);
                                });
                            } else if (result) {
                                composition.compose(hostElement, settings);
                            }
                        } catch (er) {
                            system.error(er);
                        }
                    } else {
                        composition.compose(hostElement, settings);
                    }
                } else {
                    composition.compose(hostElement, settings);
                }
            }

            if(system.isString(settings.model)) {
                system.acquire(settings.model).then(function(module) {
                    settings.model = system.resolveObject(module);
                    finishComposition();
                }).fail(function(err) {
                    system.error('Failed to load root module (' + settings.model + '). Details: ' + err.message);
                });
            } else {
                finishComposition();
            }
        }
    };

    Events.includeIn(app);

    return app;
});

;(function () {
	'use strict';

	/**
	 * @preserve FastClick: polyfill to remove click delays on browsers with touch UIs.
	 *
	 * @codingstandard ftlabs-jsv2
	 * @copyright The Financial Times Limited [All Rights Reserved]
	 * @license MIT License (see LICENSE.txt)
	 */

	/*jslint browser:true, node:true*/
	/*global define, Event, Node*/


	/**
	 * Instantiate fast-clicking listeners on the specified layer.
	 *
	 * @constructor
	 * @param {Element} layer The layer to listen on
	 * @param {Object} [options={}] The options to override the defaults
	 */
	function FastClick(layer, options) {
		var oldOnClick;

		options = options || {};

		/**
		 * Whether a click is currently being tracked.
		 *
		 * @type boolean
		 */
		this.trackingClick = false;


		/**
		 * Timestamp for when click tracking started.
		 *
		 * @type number
		 */
		this.trackingClickStart = 0;


		/**
		 * The element being tracked for a click.
		 *
		 * @type EventTarget
		 */
		this.targetElement = null;


		/**
		 * X-coordinate of touch start event.
		 *
		 * @type number
		 */
		this.touchStartX = 0;


		/**
		 * Y-coordinate of touch start event.
		 *
		 * @type number
		 */
		this.touchStartY = 0;


		/**
		 * ID of the last touch, retrieved from Touch.identifier.
		 *
		 * @type number
		 */
		this.lastTouchIdentifier = 0;


		/**
		 * Touchmove boundary, beyond which a click will be cancelled.
		 *
		 * @type number
		 */
		this.touchBoundary = options.touchBoundary || 10;


		/**
		 * The FastClick layer.
		 *
		 * @type Element
		 */
		this.layer = layer;

		/**
		 * The minimum time between tap(touchstart and touchend) events
		 *
		 * @type number
		 */
		this.tapDelay = options.tapDelay || 200;

		/**
		 * The maximum time for a tap
		 *
		 * @type number
		 */
		this.tapTimeout = options.tapTimeout || 700;

		if (FastClick.notNeeded(layer)) {
			return;
		}

		// Some old versions of Android don't have Function.prototype.bind
		function bind(method, context) {
			return function() { return method.apply(context, arguments); };
		}


		var methods = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
		var context = this;
		for (var i = 0, l = methods.length; i < l; i++) {
			context[methods[i]] = bind(context[methods[i]], context);
		}

		// Set up event handlers as required
		if (deviceIsAndroid) {
			layer.addEventListener('mouseover', this.onMouse, true);
			layer.addEventListener('mousedown', this.onMouse, true);
			layer.addEventListener('mouseup', this.onMouse, true);
		}

		layer.addEventListener('click', this.onClick, true);
		layer.addEventListener('touchstart', this.onTouchStart, false);
		layer.addEventListener('touchmove', this.onTouchMove, false);
		layer.addEventListener('touchend', this.onTouchEnd, false);
		layer.addEventListener('touchcancel', this.onTouchCancel, false);

		// Hack is required for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
		// which is how FastClick normally stops click events bubbling to callbacks registered on the FastClick
		// layer when they are cancelled.
		if (!Event.prototype.stopImmediatePropagation) {
			layer.removeEventListener = function(type, callback, capture) {
				var rmv = Node.prototype.removeEventListener;
				if (type === 'click') {
					rmv.call(layer, type, callback.hijacked || callback, capture);
				} else {
					rmv.call(layer, type, callback, capture);
				}
			};

			layer.addEventListener = function(type, callback, capture) {
				var adv = Node.prototype.addEventListener;
				if (type === 'click') {
					adv.call(layer, type, callback.hijacked || (callback.hijacked = function(event) {
						if (!event.propagationStopped) {
							callback(event);
						}
					}), capture);
				} else {
					adv.call(layer, type, callback, capture);
				}
			};
		}

		// If a handler is already declared in the element's onclick attribute, it will be fired before
		// FastClick's onClick handler. Fix this by pulling out the user-defined handler function and
		// adding it as listener.
		if (typeof layer.onclick === 'function') {

			// Android browser on at least 3.2 requires a new reference to the function in layer.onclick
			// - the old one won't work if passed to addEventListener directly.
			oldOnClick = layer.onclick;
			layer.addEventListener('click', function(event) {
				oldOnClick(event);
			}, false);
			layer.onclick = null;
		}
	}

	/**
	* Windows Phone 8.1 fakes user agent string to look like Android and iPhone.
	*
	* @type boolean
	*/
	var deviceIsWindowsPhone = navigator.userAgent.indexOf("Windows Phone") >= 0;

	/**
	 * Android requires exceptions.
	 *
	 * @type boolean
	 */
	var deviceIsAndroid = navigator.userAgent.indexOf('Android') > 0 && !deviceIsWindowsPhone;


	/**
	 * iOS requires exceptions.
	 *
	 * @type boolean
	 */
	var deviceIsIOS = /iP(ad|hone|od)/.test(navigator.userAgent) && !deviceIsWindowsPhone;


	/**
	 * iOS 4 requires an exception for select elements.
	 *
	 * @type boolean
	 */
	var deviceIsIOS4 = deviceIsIOS && (/OS 4_\d(_\d)?/).test(navigator.userAgent);


	/**
	 * iOS 6.0-7.* requires the target element to be manually derived
	 *
	 * @type boolean
	 */
	var deviceIsIOSWithBadTarget = deviceIsIOS && (/OS [6-7]_\d/).test(navigator.userAgent);

	/**
	 * BlackBerry requires exceptions.
	 *
	 * @type boolean
	 */
	var deviceIsBlackBerry10 = navigator.userAgent.indexOf('BB10') > 0;

	/**
	 * Determine whether a given element requires a native click.
	 *
	 * @param {EventTarget|Element} target Target DOM element
	 * @returns {boolean} Returns true if the element needs a native click
	 */
	FastClick.prototype.needsClick = function(target) {
		switch (target.nodeName.toLowerCase()) {

		// Don't send a synthetic click to disabled inputs (issue #62)
		case 'button':
		case 'select':
		case 'textarea':
			if (target.disabled) {
				return true;
			}

			break;
		case 'input':

			// File inputs need real clicks on iOS 6 due to a browser bug (issue #68)
			if ((deviceIsIOS && target.type === 'file') || target.disabled) {
				return true;
			}

			break;
		case 'label':
		case 'iframe': // iOS8 homescreen apps can prevent events bubbling into frames
		case 'video':
			return true;
		}

		return (/\bneedsclick\b/).test(target.className);
	};


	/**
	 * Determine whether a given element requires a call to focus to simulate click into element.
	 *
	 * @param {EventTarget|Element} target Target DOM element
	 * @returns {boolean} Returns true if the element requires a call to focus to simulate native click.
	 */
	FastClick.prototype.needsFocus = function(target) {
		switch (target.nodeName.toLowerCase()) {
		case 'textarea':
			return true;
		case 'select':
			return !deviceIsAndroid;
		case 'input':
			switch (target.type) {
			case 'button':
			case 'checkbox':
			case 'file':
			case 'image':
			case 'radio':
			case 'submit':
				return false;
			}

			// No point in attempting to focus disabled inputs
			return !target.disabled && !target.readOnly;
		default:
			return (/\bneedsfocus\b/).test(target.className);
		}
	};


	/**
	 * Send a click event to the specified element.
	 *
	 * @param {EventTarget|Element} targetElement
	 * @param {Event} event
	 */
	FastClick.prototype.sendClick = function(targetElement, event) {
		var clickEvent, touch;

		// On some Android devices activeElement needs to be blurred otherwise the synthetic click will have no effect (#24)
		if (document.activeElement && document.activeElement !== targetElement) {
			document.activeElement.blur();
		}

		touch = event.changedTouches[0];

		// Synthesise a click event, with an extra attribute so it can be tracked
		clickEvent = document.createEvent('MouseEvents');
		clickEvent.initMouseEvent(this.determineEventType(targetElement), true, true, window, 1, touch.screenX, touch.screenY, touch.clientX, touch.clientY, false, false, false, false, 0, null);
		clickEvent.forwardedTouchEvent = true;
		targetElement.dispatchEvent(clickEvent);
	};

	FastClick.prototype.determineEventType = function(targetElement) {

		//Issue #159: Android Chrome Select Box does not open with a synthetic click event
		if (deviceIsAndroid && targetElement.tagName.toLowerCase() === 'select') {
			return 'mousedown';
		}

		return 'click';
	};


	/**
	 * @param {EventTarget|Element} targetElement
	 */
	FastClick.prototype.focus = function(targetElement) {
		var length;

		// Issue #160: on iOS 7, some input elements (e.g. date datetime month) throw a vague TypeError on setSelectionRange. These elements don't have an integer value for the selectionStart and selectionEnd properties, but unfortunately that can't be used for detection because accessing the properties also throws a TypeError. Just check the type instead. Filed as Apple bug #15122724.
		if (deviceIsIOS && targetElement.setSelectionRange && targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time' && targetElement.type !== 'month') {
			length = targetElement.value.length;
			targetElement.setSelectionRange(length, length);
		} else {
			targetElement.focus();
		}
	};


	/**
	 * Check whether the given target element is a child of a scrollable layer and if so, set a flag on it.
	 *
	 * @param {EventTarget|Element} targetElement
	 */
	FastClick.prototype.updateScrollParent = function(targetElement) {
		var scrollParent, parentElement;

		scrollParent = targetElement.fastClickScrollParent;

		// Attempt to discover whether the target element is contained within a scrollable layer. Re-check if the
		// target element was moved to another parent.
		if (!scrollParent || !scrollParent.contains(targetElement)) {
			parentElement = targetElement;
			do {
				if (parentElement.scrollHeight > parentElement.offsetHeight) {
					scrollParent = parentElement;
					targetElement.fastClickScrollParent = parentElement;
					break;
				}

				parentElement = parentElement.parentElement;
			} while (parentElement);
		}

		// Always update the scroll top tracker if possible.
		if (scrollParent) {
			scrollParent.fastClickLastScrollTop = scrollParent.scrollTop;
		}
	};


	/**
	 * @param {EventTarget} targetElement
	 * @returns {Element|EventTarget}
	 */
	FastClick.prototype.getTargetElementFromEventTarget = function(eventTarget) {

		// On some older browsers (notably Safari on iOS 4.1 - see issue #56) the event target may be a text node.
		if (eventTarget.nodeType === Node.TEXT_NODE) {
			return eventTarget.parentNode;
		}

		return eventTarget;
	};


	/**
	 * On touch start, record the position and scroll offset.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onTouchStart = function(event) {
		var targetElement, touch, selection;

		// Ignore multiple touches, otherwise pinch-to-zoom is prevented if both fingers are on the FastClick element (issue #111).
		if (event.targetTouches.length > 1) {
			return true;
		}

		targetElement = this.getTargetElementFromEventTarget(event.target);
		touch = event.targetTouches[0];

		if (deviceIsIOS) {

			// Only trusted events will deselect text on iOS (issue #49)
			selection = window.getSelection();
			if (selection.rangeCount && !selection.isCollapsed) {
				return true;
			}

			if (!deviceIsIOS4) {

				// Weird things happen on iOS when an alert or confirm dialog is opened from a click event callback (issue #23):
				// when the user next taps anywhere else on the page, new touchstart and touchend events are dispatched
				// with the same identifier as the touch event that previously triggered the click that triggered the alert.
				// Sadly, there is an issue on iOS 4 that causes some normal touch events to have the same identifier as an
				// immediately preceeding touch event (issue #52), so this fix is unavailable on that platform.
				// Issue 120: touch.identifier is 0 when Chrome dev tools 'Emulate touch events' is set with an iOS device UA string,
				// which causes all touch events to be ignored. As this block only applies to iOS, and iOS identifiers are always long,
				// random integers, it's safe to to continue if the identifier is 0 here.
				if (touch.identifier && touch.identifier === this.lastTouchIdentifier) {
					event.preventDefault();
					return false;
				}

				this.lastTouchIdentifier = touch.identifier;

				// If the target element is a child of a scrollable layer (using -webkit-overflow-scrolling: touch) and:
				// 1) the user does a fling scroll on the scrollable layer
				// 2) the user stops the fling scroll with another tap
				// then the event.target of the last 'touchend' event will be the element that was under the user's finger
				// when the fling scroll was started, causing FastClick to send a click event to that layer - unless a check
				// is made to ensure that a parent layer was not scrolled before sending a synthetic click (issue #42).
				this.updateScrollParent(targetElement);
			}
		}

		this.trackingClick = true;
		this.trackingClickStart = event.timeStamp;
		this.targetElement = targetElement;

		this.touchStartX = touch.pageX;
		this.touchStartY = touch.pageY;

		// Prevent phantom clicks on fast double-tap (issue #36)
		if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
			event.preventDefault();
		}

		return true;
	};


	/**
	 * Based on a touchmove event object, check whether the touch has moved past a boundary since it started.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.touchHasMoved = function(event) {
		var touch = event.changedTouches[0], boundary = this.touchBoundary;

		if (Math.abs(touch.pageX - this.touchStartX) > boundary || Math.abs(touch.pageY - this.touchStartY) > boundary) {
			return true;
		}

		return false;
	};


	/**
	 * Update the last position.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onTouchMove = function(event) {
		if (!this.trackingClick) {
			return true;
		}

		// If the touch has moved, cancel the click tracking
		if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this.touchHasMoved(event)) {
			this.trackingClick = false;
			this.targetElement = null;
		}

		return true;
	};


	/**
	 * Attempt to find the labelled control for the given label element.
	 *
	 * @param {EventTarget|HTMLLabelElement} labelElement
	 * @returns {Element|null}
	 */
	FastClick.prototype.findControl = function(labelElement) {

		// Fast path for newer browsers supporting the HTML5 control attribute
		if (labelElement.control !== undefined) {
			return labelElement.control;
		}

		// All browsers under test that support touch events also support the HTML5 htmlFor attribute
		if (labelElement.htmlFor) {
			return document.getElementById(labelElement.htmlFor);
		}

		// If no for attribute exists, attempt to retrieve the first labellable descendant element
		// the list of which is defined here: http://www.w3.org/TR/html5/forms.html#category-label
		return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
	};


	/**
	 * On touch end, determine whether to send a click event at once.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onTouchEnd = function(event) {
		var forElement, trackingClickStart, targetTagName, scrollParent, touch, targetElement = this.targetElement;

		if (!this.trackingClick) {
			return true;
		}

		// Prevent phantom clicks on fast double-tap (issue #36)
		if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
			this.cancelNextClick = true;
			return true;
		}

		if ((event.timeStamp - this.trackingClickStart) > this.tapTimeout) {
			return true;
		}

		// Reset to prevent wrong click cancel on input (issue #156).
		this.cancelNextClick = false;

		this.lastClickTime = event.timeStamp;

		trackingClickStart = this.trackingClickStart;
		this.trackingClick = false;
		this.trackingClickStart = 0;

		// On some iOS devices, the targetElement supplied with the event is invalid if the layer
		// is performing a transition or scroll, and has to be re-detected manually. Note that
		// for this to function correctly, it must be called *after* the event target is checked!
		// See issue #57; also filed as rdar://13048589 .
		if (deviceIsIOSWithBadTarget) {
			touch = event.changedTouches[0];

			// In certain cases arguments of elementFromPoint can be negative, so prevent setting targetElement to null
			targetElement = document.elementFromPoint(touch.pageX - window.pageXOffset, touch.pageY - window.pageYOffset) || targetElement;
			targetElement.fastClickScrollParent = this.targetElement.fastClickScrollParent;
		}

		targetTagName = targetElement.tagName.toLowerCase();
		if (targetTagName === 'label') {
			forElement = this.findControl(targetElement);
			if (forElement) {
				this.focus(targetElement);
				if (deviceIsAndroid) {
					return false;
				}

				targetElement = forElement;
			}
		} else if (this.needsFocus(targetElement)) {

			// Case 1: If the touch started a while ago (best guess is 100ms based on tests for issue #36) then focus will be triggered anyway. Return early and unset the target element reference so that the subsequent click will be allowed through.
			// Case 2: Without this exception for input elements tapped when the document is contained in an iframe, then any inputted text won't be visible even though the value attribute is updated as the user types (issue #37).
			if ((event.timeStamp - trackingClickStart) > 100 || (deviceIsIOS && window.top !== window && targetTagName === 'input')) {
				this.targetElement = null;
				return false;
			}

			this.focus(targetElement);
			this.sendClick(targetElement, event);

			// Select elements need the event to go through on iOS 4, otherwise the selector menu won't open.
			// Also this breaks opening selects when VoiceOver is active on iOS6, iOS7 (and possibly others)
			if (!deviceIsIOS || targetTagName !== 'select') {
				this.targetElement = null;
				event.preventDefault();
			}

			return false;
		}

		if (deviceIsIOS && !deviceIsIOS4) {

			// Don't send a synthetic click event if the target element is contained within a parent layer that was scrolled
			// and this tap is being used to stop the scrolling (usually initiated by a fling - issue #42).
			scrollParent = targetElement.fastClickScrollParent;
			if (scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop) {
				return true;
			}
		}

		// Prevent the actual click from going though - unless the target node is marked as requiring
		// real clicks or if it is in the whitelist in which case only non-programmatic clicks are permitted.
		if (!this.needsClick(targetElement)) {
			event.preventDefault();
			this.sendClick(targetElement, event);
		}

		return false;
	};


	/**
	 * On touch cancel, stop tracking the click.
	 *
	 * @returns {void}
	 */
	FastClick.prototype.onTouchCancel = function() {
		this.trackingClick = false;
		this.targetElement = null;
	};


	/**
	 * Determine mouse events which should be permitted.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onMouse = function(event) {

		// If a target element was never set (because a touch event was never fired) allow the event
		if (!this.targetElement) {
			return true;
		}

		if (event.forwardedTouchEvent) {
			return true;
		}

		// Programmatically generated events targeting a specific element should be permitted
		if (!event.cancelable) {
			return true;
		}

		// Derive and check the target element to see whether the mouse event needs to be permitted;
		// unless explicitly enabled, prevent non-touch click events from triggering actions,
		// to prevent ghost/doubleclicks.
		if (!this.needsClick(this.targetElement) || this.cancelNextClick) {

			// Prevent any user-added listeners declared on FastClick element from being fired.
			if (event.stopImmediatePropagation) {
				event.stopImmediatePropagation();
			} else {

				// Part of the hack for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
				event.propagationStopped = true;
			}

			// Cancel the event
			event.stopPropagation();
			event.preventDefault();

			return false;
		}

		// If the mouse event is permitted, return true for the action to go through.
		return true;
	};


	/**
	 * On actual clicks, determine whether this is a touch-generated click, a click action occurring
	 * naturally after a delay after a touch (which needs to be cancelled to avoid duplication), or
	 * an actual click which should be permitted.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onClick = function(event) {
		var permitted;

		// It's possible for another FastClick-like library delivered with third-party code to fire a click event before FastClick does (issue #44). In that case, set the click-tracking flag back to false and return early. This will cause onTouchEnd to return early.
		if (this.trackingClick) {
			this.targetElement = null;
			this.trackingClick = false;
			return true;
		}

		// Very odd behaviour on iOS (issue #18): if a submit element is present inside a form and the user hits enter in the iOS simulator or clicks the Go button on the pop-up OS keyboard the a kind of 'fake' click event will be triggered with the submit-type input element as the target.
		if (event.target.type === 'submit' && event.detail === 0) {
			return true;
		}

		permitted = this.onMouse(event);

		// Only unset targetElement if the click is not permitted. This will ensure that the check for !targetElement in onMouse fails and the browser's click doesn't go through.
		if (!permitted) {
			this.targetElement = null;
		}

		// If clicks are permitted, return true for the action to go through.
		return permitted;
	};


	/**
	 * Remove all FastClick's event listeners.
	 *
	 * @returns {void}
	 */
	FastClick.prototype.destroy = function() {
		var layer = this.layer;

		if (deviceIsAndroid) {
			layer.removeEventListener('mouseover', this.onMouse, true);
			layer.removeEventListener('mousedown', this.onMouse, true);
			layer.removeEventListener('mouseup', this.onMouse, true);
		}

		layer.removeEventListener('click', this.onClick, true);
		layer.removeEventListener('touchstart', this.onTouchStart, false);
		layer.removeEventListener('touchmove', this.onTouchMove, false);
		layer.removeEventListener('touchend', this.onTouchEnd, false);
		layer.removeEventListener('touchcancel', this.onTouchCancel, false);
	};


	/**
	 * Check whether FastClick is needed.
	 *
	 * @param {Element} layer The layer to listen on
	 */
	FastClick.notNeeded = function(layer) {
		var metaViewport;
		var chromeVersion;
		var blackberryVersion;
		var firefoxVersion;

		// Devices that don't support touch don't need FastClick
		if (typeof window.ontouchstart === 'undefined') {
			return true;
		}

		// Chrome version - zero for other browsers
		chromeVersion = +(/Chrome\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];

		if (chromeVersion) {

			if (deviceIsAndroid) {
				metaViewport = document.querySelector('meta[name=viewport]');

				if (metaViewport) {
					// Chrome on Android with user-scalable="no" doesn't need FastClick (issue #89)
					if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
						return true;
					}
					// Chrome 32 and above with width=device-width or less don't need FastClick
					if (chromeVersion > 31 && document.documentElement.scrollWidth <= window.outerWidth) {
						return true;
					}
				}

			// Chrome desktop doesn't need FastClick (issue #15)
			} else {
				return true;
			}
		}

		if (deviceIsBlackBerry10) {
			blackberryVersion = navigator.userAgent.match(/Version\/([0-9]*)\.([0-9]*)/);

			// BlackBerry 10.3+ does not require Fastclick library.
			// https://github.com/ftlabs/fastclick/issues/251
			if (blackberryVersion[1] >= 10 && blackberryVersion[2] >= 3) {
				metaViewport = document.querySelector('meta[name=viewport]');

				if (metaViewport) {
					// user-scalable=no eliminates click delay.
					if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
						return true;
					}
					// width=device-width (or less than device-width) eliminates click delay.
					if (document.documentElement.scrollWidth <= window.outerWidth) {
						return true;
					}
				}
			}
		}

		// IE10 with -ms-touch-action: none or manipulation, which disables double-tap-to-zoom (issue #97)
		if (layer.style.msTouchAction === 'none' || layer.style.touchAction === 'manipulation') {
			return true;
		}

		// Firefox version - zero for other browsers
		firefoxVersion = +(/Firefox\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];

		if (firefoxVersion >= 27) {
			// Firefox 27+ does not have tap delay if the content is not zoomable - https://bugzilla.mozilla.org/show_bug.cgi?id=922896

			metaViewport = document.querySelector('meta[name=viewport]');
			if (metaViewport && (metaViewport.content.indexOf('user-scalable=no') !== -1 || document.documentElement.scrollWidth <= window.outerWidth)) {
				return true;
			}
		}

		// IE11: prefixed -ms-touch-action is no longer supported and it's recomended to use non-prefixed version
		// http://msdn.microsoft.com/en-us/library/windows/apps/Hh767313.aspx
		if (layer.style.touchAction === 'none' || layer.style.touchAction === 'manipulation') {
			return true;
		}

		return false;
	};


	/**
	 * Factory method for creating a FastClick object
	 *
	 * @param {Element} layer The layer to listen on
	 * @param {Object} [options={}] The options to override the defaults
	 */
	FastClick.attach = function(layer, options) {
		return new FastClick(layer, options);
	};


	if (typeof define === 'function' && typeof define.amd === 'object' && define.amd) {

		// AMD. Register as an anonymous module.
		define('fastclick',[],function() {
			return FastClick;
		});
	} else if (typeof module !== 'undefined' && module.exports) {
		module.exports = FastClick.attach;
		module.exports.FastClick = FastClick;
	} else {
		window.FastClick = FastClick;
	}
}());

/*!
 * Bootstrap v3.0.2 by @fat and @mdo
 * Copyright 2013 Twitter, Inc.
 * Licensed under http://www.apache.org/licenses/LICENSE-2.0
 *
 * Designed and built with all the love in the world by @mdo and @fat.
 */

if (typeof jQuery === "undefined") { throw new Error("Bootstrap requires jQuery") }

/* ========================================================================
 * Bootstrap: transition.js v3.0.2
 * http://getbootstrap.com/javascript/#transitions
 * ========================================================================
 * Copyright 2013 Twitter, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ======================================================================== */


+function ($) { "use strict";

  // CSS TRANSITION SUPPORT (Shoutout: http://www.modernizr.com/)
  // ============================================================

  function transitionEnd() {
    var el = document.createElement('bootstrap')

    var transEndEventNames = {
      'WebkitTransition' : 'webkitTransitionEnd'
    , 'MozTransition'    : 'transitionend'
    , 'OTransition'      : 'oTransitionEnd otransitionend'
    , 'transition'       : 'transitionend'
    }

    for (var name in transEndEventNames) {
      if (el.style[name] !== undefined) {
        return { end: transEndEventNames[name] }
      }
    }
  }

  // http://blog.alexmaccaw.com/css-transitions
  $.fn.emulateTransitionEnd = function (duration) {
    var called = false, $el = this
    $(this).one($.support.transition.end, function () { called = true })
    var callback = function () { if (!called) $($el).trigger($.support.transition.end) }
    setTimeout(callback, duration)
    return this
  }

  $(function () {
    $.support.transition = transitionEnd()
  })

}(jQuery);

/* ========================================================================
 * Bootstrap: alert.js v3.0.2
 * http://getbootstrap.com/javascript/#alerts
 * ========================================================================
 * Copyright 2013 Twitter, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ======================================================================== */


+function ($) { "use strict";

  // ALERT CLASS DEFINITION
  // ======================

  var dismiss = '[data-dismiss="alert"]'
  var Alert   = function (el) {
    $(el).on('click', dismiss, this.close)
  }

  Alert.prototype.close = function (e) {
    var $this    = $(this)
    var selector = $this.attr('data-target')

    if (!selector) {
      selector = $this.attr('href')
      selector = selector && selector.replace(/.*(?=#[^\s]*$)/, '') // strip for ie7
    }

    var $parent = $(selector)

    if (e) e.preventDefault()

    if (!$parent.length) {
      $parent = $this.hasClass('alert') ? $this : $this.parent()
    }

    $parent.trigger(e = $.Event('close.bs.alert'))

    if (e.isDefaultPrevented()) return

    $parent.removeClass('in')

    function removeElement() {
      $parent.trigger('closed.bs.alert').remove()
    }

    $.support.transition && $parent.hasClass('fade') ?
      $parent
        .one($.support.transition.end, removeElement)
        .emulateTransitionEnd(150) :
      removeElement()
  }


  // ALERT PLUGIN DEFINITION
  // =======================

  var old = $.fn.alert

  $.fn.alert = function (option) {
    return this.each(function () {
      var $this = $(this)
      var data  = $this.data('bs.alert')

      if (!data) $this.data('bs.alert', (data = new Alert(this)))
      if (typeof option == 'string') data[option].call($this)
    })
  }

  $.fn.alert.Constructor = Alert


  // ALERT NO CONFLICT
  // =================

  $.fn.alert.noConflict = function () {
    $.fn.alert = old
    return this
  }


  // ALERT DATA-API
  // ==============

  $(document).on('click.bs.alert.data-api', dismiss, Alert.prototype.close)

}(jQuery);

/* ========================================================================
 * Bootstrap: button.js v3.0.2
 * http://getbootstrap.com/javascript/#buttons
 * ========================================================================
 * Copyright 2013 Twitter, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ======================================================================== */


+function ($) { "use strict";

  // BUTTON PUBLIC CLASS DEFINITION
  // ==============================

  var Button = function (element, options) {
    this.$element = $(element)
    this.options  = $.extend({}, Button.DEFAULTS, options)
  }

  Button.DEFAULTS = {
    loadingText: 'loading...'
  }

  Button.prototype.setState = function (state) {
    var d    = 'disabled'
    var $el  = this.$element
    var val  = $el.is('input') ? 'val' : 'html'
    var data = $el.data()

    state = state + 'Text'

    if (!data.resetText) $el.data('resetText', $el[val]())

    $el[val](data[state] || this.options[state])

    // push to event loop to allow forms to submit
    setTimeout(function () {
      state == 'loadingText' ?
        $el.addClass(d).attr(d, d) :
        $el.removeClass(d).removeAttr(d);
    }, 0)
  }

  Button.prototype.toggle = function () {
    var $parent = this.$element.closest('[data-toggle="buttons"]')

    if ($parent.length) {
      var $input = this.$element.find('input')
        .prop('checked', !this.$element.hasClass('active'))
        .trigger('change')
      if ($input.prop('type') === 'radio') $parent.find('.active').removeClass('active')
    }

    this.$element.toggleClass('active')
  }


  // BUTTON PLUGIN DEFINITION
  // ========================

  var old = $.fn.button

  $.fn.button = function (option) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.button')
      var options = typeof option == 'object' && option

      if (!data) $this.data('bs.button', (data = new Button(this, options)))

      if (option == 'toggle') data.toggle()
      else if (option) data.setState(option)
    })
  }

  $.fn.button.Constructor = Button


  // BUTTON NO CONFLICT
  // ==================

  $.fn.button.noConflict = function () {
    $.fn.button = old
    return this
  }


  // BUTTON DATA-API
  // ===============

  $(document).on('click.bs.button.data-api', '[data-toggle^=button]', function (e) {
    var $btn = $(e.target)
    if (!$btn.hasClass('btn')) $btn = $btn.closest('.btn')
    $btn.button('toggle')
    e.preventDefault()
  })

}(jQuery);

/* ========================================================================
 * Bootstrap: carousel.js v3.0.2
 * http://getbootstrap.com/javascript/#carousel
 * ========================================================================
 * Copyright 2013 Twitter, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ======================================================================== */


+function ($) { "use strict";

  // CAROUSEL CLASS DEFINITION
  // =========================

  var Carousel = function (element, options) {
    this.$element    = $(element)
    this.$indicators = this.$element.find('.carousel-indicators')
    this.options     = options
    this.paused      =
    this.sliding     =
    this.interval    =
    this.$active     =
    this.$items      = null

    this.options.pause == 'hover' && this.$element
      .on('mouseenter', $.proxy(this.pause, this))
      .on('mouseleave', $.proxy(this.cycle, this))
  }

  Carousel.DEFAULTS = {
    interval: 5000
  , pause: 'hover'
  , wrap: true
  }

  Carousel.prototype.cycle =  function (e) {
    e || (this.paused = false)

    this.interval && clearInterval(this.interval)

    this.options.interval
      && !this.paused
      && (this.interval = setInterval($.proxy(this.next, this), this.options.interval))

    return this
  }

  Carousel.prototype.getActiveIndex = function () {
    this.$active = this.$element.find('.item.active')
    this.$items  = this.$active.parent().children()

    return this.$items.index(this.$active)
  }

  Carousel.prototype.to = function (pos) {
    var that        = this
    var activeIndex = this.getActiveIndex()

    if (pos > (this.$items.length - 1) || pos < 0) return

    if (this.sliding)       return this.$element.one('slid', function () { that.to(pos) })
    if (activeIndex == pos) return this.pause().cycle()

    return this.slide(pos > activeIndex ? 'next' : 'prev', $(this.$items[pos]))
  }

  Carousel.prototype.pause = function (e) {
    e || (this.paused = true)

    if (this.$element.find('.next, .prev').length && $.support.transition.end) {
      this.$element.trigger($.support.transition.end)
      this.cycle(true)
    }

    this.interval = clearInterval(this.interval)

    return this
  }

  Carousel.prototype.next = function () {
    if (this.sliding) return
    return this.slide('next')
  }

  Carousel.prototype.prev = function () {
    if (this.sliding) return
    return this.slide('prev')
  }

  Carousel.prototype.slide = function (type, next) {
    var $active   = this.$element.find('.item.active')
    var $next     = next || $active[type]()
    var isCycling = this.interval
    var direction = type == 'next' ? 'left' : 'right'
    var fallback  = type == 'next' ? 'first' : 'last'
    var that      = this

    if (!$next.length) {
      if (!this.options.wrap) return
      $next = this.$element.find('.item')[fallback]()
    }

    this.sliding = true

    isCycling && this.pause()

    var e = $.Event('slide.bs.carousel', { relatedTarget: $next[0], direction: direction })

    if ($next.hasClass('active')) return

    if (this.$indicators.length) {
      this.$indicators.find('.active').removeClass('active')
      this.$element.one('slid', function () {
        var $nextIndicator = $(that.$indicators.children()[that.getActiveIndex()])
        $nextIndicator && $nextIndicator.addClass('active')
      })
    }

    if ($.support.transition && this.$element.hasClass('slide')) {
      this.$element.trigger(e)
      if (e.isDefaultPrevented()) return
      $next.addClass(type)
      $next[0].offsetWidth // force reflow
      $active.addClass(direction)
      $next.addClass(direction)
      $active
        .one($.support.transition.end, function () {
          $next.removeClass([type, direction].join(' ')).addClass('active')
          $active.removeClass(['active', direction].join(' '))
          that.sliding = false
          setTimeout(function () { that.$element.trigger('slid') }, 0)
        })
        .emulateTransitionEnd(600)
    } else {
      this.$element.trigger(e)
      if (e.isDefaultPrevented()) return
      $active.removeClass('active')
      $next.addClass('active')
      this.sliding = false
      this.$element.trigger('slid')
    }

    isCycling && this.cycle()

    return this
  }


  // CAROUSEL PLUGIN DEFINITION
  // ==========================

  var old = $.fn.carousel

  $.fn.carousel = function (option) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.carousel')
      var options = $.extend({}, Carousel.DEFAULTS, $this.data(), typeof option == 'object' && option)
      var action  = typeof option == 'string' ? option : options.slide

      if (!data) $this.data('bs.carousel', (data = new Carousel(this, options)))
      if (typeof option == 'number') data.to(option)
      else if (action) data[action]()
      else if (options.interval) data.pause().cycle()
    })
  }

  $.fn.carousel.Constructor = Carousel


  // CAROUSEL NO CONFLICT
  // ====================

  $.fn.carousel.noConflict = function () {
    $.fn.carousel = old
    return this
  }


  // CAROUSEL DATA-API
  // =================

  $(document).on('click.bs.carousel.data-api', '[data-slide], [data-slide-to]', function (e) {
    var $this   = $(this), href
    var $target = $($this.attr('data-target') || (href = $this.attr('href')) && href.replace(/.*(?=#[^\s]+$)/, '')) //strip for ie7
    var options = $.extend({}, $target.data(), $this.data())
    var slideIndex = $this.attr('data-slide-to')
    if (slideIndex) options.interval = false

    $target.carousel(options)

    if (slideIndex = $this.attr('data-slide-to')) {
      $target.data('bs.carousel').to(slideIndex)
    }

    e.preventDefault()
  })

  $(window).on('load', function () {
    $('[data-ride="carousel"]').each(function () {
      var $carousel = $(this)
      $carousel.carousel($carousel.data())
    })
  })

}(jQuery);

/* ========================================================================
 * Bootstrap: collapse.js v3.0.2
 * http://getbootstrap.com/javascript/#collapse
 * ========================================================================
 * Copyright 2013 Twitter, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ======================================================================== */


+function ($) { "use strict";

  // COLLAPSE PUBLIC CLASS DEFINITION
  // ================================

  var Collapse = function (element, options) {
    this.$element      = $(element)
    this.options       = $.extend({}, Collapse.DEFAULTS, options)
    this.transitioning = null

    if (this.options.parent) this.$parent = $(this.options.parent)
    if (this.options.toggle) this.toggle()
  }

  Collapse.DEFAULTS = {
    toggle: true
  }

  Collapse.prototype.dimension = function () {
    var hasWidth = this.$element.hasClass('width')
    return hasWidth ? 'width' : 'height'
  }

  Collapse.prototype.show = function () {
    if (this.transitioning || this.$element.hasClass('in')) return

    var startEvent = $.Event('show.bs.collapse')
    this.$element.trigger(startEvent)
    if (startEvent.isDefaultPrevented()) return

    var actives = this.$parent && this.$parent.find('> .panel > .in')

    if (actives && actives.length) {
      var hasData = actives.data('bs.collapse')
      if (hasData && hasData.transitioning) return
      actives.collapse('hide')
      hasData || actives.data('bs.collapse', null)
    }

    var dimension = this.dimension()

    this.$element
      .removeClass('collapse')
      .addClass('collapsing')
      [dimension](0)

    this.transitioning = 1

    var complete = function () {
      this.$element
        .removeClass('collapsing')
        .addClass('in')
        [dimension]('auto')
      this.transitioning = 0
      this.$element.trigger('shown.bs.collapse')
    }

    if (!$.support.transition) return complete.call(this)

    var scrollSize = $.camelCase(['scroll', dimension].join('-'))

    this.$element
      .one($.support.transition.end, $.proxy(complete, this))
      .emulateTransitionEnd(350)
      [dimension](this.$element[0][scrollSize])
  }

  Collapse.prototype.hide = function () {
    if (this.transitioning || !this.$element.hasClass('in')) return

    var startEvent = $.Event('hide.bs.collapse')
    this.$element.trigger(startEvent)
    if (startEvent.isDefaultPrevented()) return

    var dimension = this.dimension()

    this.$element
      [dimension](this.$element[dimension]())
      [0].offsetHeight

    this.$element
      .addClass('collapsing')
      .removeClass('collapse')
      .removeClass('in')

    this.transitioning = 1

    var complete = function () {
      this.transitioning = 0
      this.$element
        .trigger('hidden.bs.collapse')
        .removeClass('collapsing')
        .addClass('collapse')
    }

    if (!$.support.transition) return complete.call(this)

    this.$element
      [dimension](0)
      .one($.support.transition.end, $.proxy(complete, this))
      .emulateTransitionEnd(350)
  }

  Collapse.prototype.toggle = function () {
    this[this.$element.hasClass('in') ? 'hide' : 'show']()
  }


  // COLLAPSE PLUGIN DEFINITION
  // ==========================

  var old = $.fn.collapse

  $.fn.collapse = function (option) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.collapse')
      var options = $.extend({}, Collapse.DEFAULTS, $this.data(), typeof option == 'object' && option)

      if (!data) $this.data('bs.collapse', (data = new Collapse(this, options)))
      if (typeof option == 'string') data[option]()
    })
  }

  $.fn.collapse.Constructor = Collapse


  // COLLAPSE NO CONFLICT
  // ====================

  $.fn.collapse.noConflict = function () {
    $.fn.collapse = old
    return this
  }


  // COLLAPSE DATA-API
  // =================

  $(document).on('click.bs.collapse.data-api', '[data-toggle=collapse]', function (e) {
    var $this   = $(this), href
    var target  = $this.attr('data-target')
        || e.preventDefault()
        || (href = $this.attr('href')) && href.replace(/.*(?=#[^\s]+$)/, '') //strip for ie7
    var $target = $(target)
    var data    = $target.data('bs.collapse')
    var option  = data ? 'toggle' : $this.data()
    var parent  = $this.attr('data-parent')
    var $parent = parent && $(parent)

    if (!data || !data.transitioning) {
      if ($parent) $parent.find('[data-toggle=collapse][data-parent="' + parent + '"]').not($this).addClass('collapsed')
      $this[$target.hasClass('in') ? 'addClass' : 'removeClass']('collapsed')
    }

    $target.collapse(option)
  })

}(jQuery);

/* ========================================================================
 * Bootstrap: dropdown.js v3.0.2
 * http://getbootstrap.com/javascript/#dropdowns
 * ========================================================================
 * Copyright 2013 Twitter, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ======================================================================== */


+function ($) { "use strict";

  // DROPDOWN CLASS DEFINITION
  // =========================

  var backdrop = '.dropdown-backdrop'
  var toggle   = '[data-toggle=dropdown]'
  var Dropdown = function (element) {
    var $el = $(element).on('click.bs.dropdown', this.toggle)
  }

  Dropdown.prototype.toggle = function (e) {
    var $this = $(this)

    if ($this.is('.disabled, :disabled')) return

    var $parent  = getParent($this)
    var isActive = $parent.hasClass('open')

    clearMenus()

    if (!isActive) {
      if ('ontouchstart' in document.documentElement && !$parent.closest('.navbar-nav').length) {
        // if mobile we we use a backdrop because click events don't delegate
        $('<div class="dropdown-backdrop"/>').insertAfter($(this)).on('click', clearMenus)
      }

      $parent.trigger(e = $.Event('show.bs.dropdown'))

      if (e.isDefaultPrevented()) return

      $parent
        .toggleClass('open')
        .trigger('shown.bs.dropdown')

      $this.focus()
    }

    return false
  }

  Dropdown.prototype.keydown = function (e) {
    if (!/(38|40|27)/.test(e.keyCode)) return

    var $this = $(this)

    e.preventDefault()
    e.stopPropagation()

    if ($this.is('.disabled, :disabled')) return

    var $parent  = getParent($this)
    var isActive = $parent.hasClass('open')

    if (!isActive || (isActive && e.keyCode == 27)) {
      if (e.which == 27) $parent.find(toggle).focus()
      return $this.click()
    }

    var $items = $('[role=menu] li:not(.divider):visible a', $parent)

    if (!$items.length) return

    var index = $items.index($items.filter(':focus'))

    if (e.keyCode == 38 && index > 0)                 index--                        // up
    if (e.keyCode == 40 && index < $items.length - 1) index++                        // down
    if (!~index)                                      index=0

    $items.eq(index).focus()
  }

  function clearMenus() {
    $(backdrop).remove()
    $(toggle).each(function (e) {
      var $parent = getParent($(this))
      if (!$parent.hasClass('open')) return
      $parent.trigger(e = $.Event('hide.bs.dropdown'))
      if (e.isDefaultPrevented()) return
      $parent.removeClass('open').trigger('hidden.bs.dropdown')
    })
  }

  function getParent($this) {
    var selector = $this.attr('data-target')

    if (!selector) {
      selector = $this.attr('href')
      selector = selector && /#/.test(selector) && selector.replace(/.*(?=#[^\s]*$)/, '') //strip for ie7
    }

    var $parent = selector && $(selector)

    return $parent && $parent.length ? $parent : $this.parent()
  }


  // DROPDOWN PLUGIN DEFINITION
  // ==========================

  var old = $.fn.dropdown

  $.fn.dropdown = function (option) {
    return this.each(function () {
      var $this = $(this)
      var data  = $this.data('dropdown')

      if (!data) $this.data('dropdown', (data = new Dropdown(this)))
      if (typeof option == 'string') data[option].call($this)
    })
  }

  $.fn.dropdown.Constructor = Dropdown


  // DROPDOWN NO CONFLICT
  // ====================

  $.fn.dropdown.noConflict = function () {
    $.fn.dropdown = old
    return this
  }


  // APPLY TO STANDARD DROPDOWN ELEMENTS
  // ===================================

  $(document)
    .on('click.bs.dropdown.data-api', clearMenus)
    .on('click.bs.dropdown.data-api', '.dropdown form', function (e) { e.stopPropagation() })
    .on('click.bs.dropdown.data-api'  , toggle, Dropdown.prototype.toggle)
    .on('keydown.bs.dropdown.data-api', toggle + ', [role=menu]' , Dropdown.prototype.keydown)

}(jQuery);

/* ========================================================================
 * Bootstrap: modal.js v3.0.2
 * http://getbootstrap.com/javascript/#modals
 * ========================================================================
 * Copyright 2013 Twitter, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ======================================================================== */


+function ($) { "use strict";

  // MODAL CLASS DEFINITION
  // ======================

  var Modal = function (element, options) {
    this.options   = options
    this.$element  = $(element)
    this.$backdrop =
    this.isShown   = null

    if (this.options.remote) this.$element.load(this.options.remote)
  }

  Modal.DEFAULTS = {
      backdrop: true
    , keyboard: true
    , show: true
  }

  Modal.prototype.toggle = function (_relatedTarget) {
    return this[!this.isShown ? 'show' : 'hide'](_relatedTarget)
  }

  Modal.prototype.show = function (_relatedTarget) {
    var that = this
    var e    = $.Event('show.bs.modal', { relatedTarget: _relatedTarget })

    this.$element.trigger(e)

    if (this.isShown || e.isDefaultPrevented()) return

    this.isShown = true

    this.escape()

    this.$element.on('click.dismiss.modal', '[data-dismiss="modal"]', $.proxy(this.hide, this))

    this.backdrop(function () {
      var transition = $.support.transition && that.$element.hasClass('fade')

      if (!that.$element.parent().length) {
        that.$element.appendTo(document.body) // don't move modals dom position
      }

      that.$element.show()

      if (transition) {
        that.$element[0].offsetWidth // force reflow
      }

      that.$element
        .addClass('in')
        .attr('aria-hidden', false)

      that.enforceFocus()

      var e = $.Event('shown.bs.modal', { relatedTarget: _relatedTarget })

      transition ?
        that.$element.find('.modal-dialog') // wait for modal to slide in
          .one($.support.transition.end, function () {
            that.$element.focus().trigger(e)
          })
          .emulateTransitionEnd(300) :
        that.$element.focus().trigger(e)
    })
  }

  Modal.prototype.hide = function (e) {
    if (e) e.preventDefault()

    e = $.Event('hide.bs.modal')

    this.$element.trigger(e)

    if (!this.isShown || e.isDefaultPrevented()) return

    this.isShown = false

    this.escape()

    $(document).off('focusin.bs.modal')

    this.$element
      .removeClass('in')
      .attr('aria-hidden', true)
      .off('click.dismiss.modal')

    $.support.transition && this.$element.hasClass('fade') ?
      this.$element
        .one($.support.transition.end, $.proxy(this.hideModal, this))
        .emulateTransitionEnd(300) :
      this.hideModal()
  }

  Modal.prototype.enforceFocus = function () {
    $(document)
      .off('focusin.bs.modal') // guard against infinite focus loop
      .on('focusin.bs.modal', $.proxy(function (e) {
        if (this.$element[0] !== e.target && !this.$element.has(e.target).length) {
          this.$element.focus()
        }
      }, this))
  }

  Modal.prototype.escape = function () {
    if (this.isShown && this.options.keyboard) {
      this.$element.on('keyup.dismiss.bs.modal', $.proxy(function (e) {
        e.which == 27 && this.hide()
      }, this))
    } else if (!this.isShown) {
      this.$element.off('keyup.dismiss.bs.modal')
    }
  }

  Modal.prototype.hideModal = function () {
    var that = this
    this.$element.hide()
    this.backdrop(function () {
      that.removeBackdrop()
      that.$element.trigger('hidden.bs.modal')
    })
  }

  Modal.prototype.removeBackdrop = function () {
    this.$backdrop && this.$backdrop.remove()
    this.$backdrop = null
  }

  Modal.prototype.backdrop = function (callback) {
    var that    = this
    var animate = this.$element.hasClass('fade') ? 'fade' : ''

    if (this.isShown && this.options.backdrop) {
      var doAnimate = $.support.transition && animate

      this.$backdrop = $('<div class="modal-backdrop ' + animate + '" />')
        .appendTo(document.body)

      this.$element.on('click.dismiss.modal', $.proxy(function (e) {
        if (e.target !== e.currentTarget) return
        this.options.backdrop == 'static'
          ? this.$element[0].focus.call(this.$element[0])
          : this.hide.call(this)
      }, this))

      if (doAnimate) this.$backdrop[0].offsetWidth // force reflow

      this.$backdrop.addClass('in')

      if (!callback) return

      doAnimate ?
        this.$backdrop
          .one($.support.transition.end, callback)
          .emulateTransitionEnd(150) :
        callback()

    } else if (!this.isShown && this.$backdrop) {
      this.$backdrop.removeClass('in')

      $.support.transition && this.$element.hasClass('fade')?
        this.$backdrop
          .one($.support.transition.end, callback)
          .emulateTransitionEnd(150) :
        callback()

    } else if (callback) {
      callback()
    }
  }


  // MODAL PLUGIN DEFINITION
  // =======================

  var old = $.fn.modal

  $.fn.modal = function (option, _relatedTarget) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.modal')
      var options = $.extend({}, Modal.DEFAULTS, $this.data(), typeof option == 'object' && option)

      if (!data) $this.data('bs.modal', (data = new Modal(this, options)))
      if (typeof option == 'string') data[option](_relatedTarget)
      else if (options.show) data.show(_relatedTarget)
    })
  }

  $.fn.modal.Constructor = Modal


  // MODAL NO CONFLICT
  // =================

  $.fn.modal.noConflict = function () {
    $.fn.modal = old
    return this
  }


  // MODAL DATA-API
  // ==============

  $(document).on('click.bs.modal.data-api', '[data-toggle="modal"]', function (e) {
    var $this   = $(this)
    var href    = $this.attr('href')
    var $target = $($this.attr('data-target') || (href && href.replace(/.*(?=#[^\s]+$)/, ''))) //strip for ie7
    var option  = $target.data('modal') ? 'toggle' : $.extend({ remote: !/#/.test(href) && href }, $target.data(), $this.data())

    e.preventDefault()

    $target
      .modal(option, this)
      .one('hide', function () {
        $this.is(':visible') && $this.focus()
      })
  })

  $(document)
    .on('show.bs.modal',  '.modal', function () { $(document.body).addClass('modal-open') })
    .on('hidden.bs.modal', '.modal', function () { $(document.body).removeClass('modal-open') })

}(jQuery);

/* ========================================================================
 * Bootstrap: tooltip.js v3.0.2
 * http://getbootstrap.com/javascript/#tooltip
 * Inspired by the original jQuery.tipsy by Jason Frame
 * ========================================================================
 * Copyright 2013 Twitter, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ======================================================================== */


+function ($) { "use strict";

  // TOOLTIP PUBLIC CLASS DEFINITION
  // ===============================

  var Tooltip = function (element, options) {
    this.type       =
    this.options    =
    this.enabled    =
    this.timeout    =
    this.hoverState =
    this.$element   = null

    this.init('tooltip', element, options)
  }

  Tooltip.DEFAULTS = {
    animation: true
  , placement: 'top'
  , selector: false
  , template: '<div class="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner"></div></div>'
  , trigger: 'hover focus'
  , title: ''
  , delay: 0
  , html: false
  , container: false
  }

  Tooltip.prototype.init = function (type, element, options) {
    this.enabled  = true
    this.type     = type
    this.$element = $(element)
    this.options  = this.getOptions(options)

    var triggers = this.options.trigger.split(' ')

    for (var i = triggers.length; i--;) {
      var trigger = triggers[i]

      if (trigger == 'click') {
        this.$element.on('click.' + this.type, this.options.selector, $.proxy(this.toggle, this))
      } else if (trigger != 'manual') {
        var eventIn  = trigger == 'hover' ? 'mouseenter' : 'focus'
        var eventOut = trigger == 'hover' ? 'mouseleave' : 'blur'

        this.$element.on(eventIn  + '.' + this.type, this.options.selector, $.proxy(this.enter, this))
        this.$element.on(eventOut + '.' + this.type, this.options.selector, $.proxy(this.leave, this))
      }
    }

    this.options.selector ?
      (this._options = $.extend({}, this.options, { trigger: 'manual', selector: '' })) :
      this.fixTitle()
  }

  Tooltip.prototype.getDefaults = function () {
    return Tooltip.DEFAULTS
  }

  Tooltip.prototype.getOptions = function (options) {
    options = $.extend({}, this.getDefaults(), this.$element.data(), options)

    if (options.delay && typeof options.delay == 'number') {
      options.delay = {
        show: options.delay
      , hide: options.delay
      }
    }

    return options
  }

  Tooltip.prototype.getDelegateOptions = function () {
    var options  = {}
    var defaults = this.getDefaults()

    this._options && $.each(this._options, function (key, value) {
      if (defaults[key] != value) options[key] = value
    })

    return options
  }

  Tooltip.prototype.enter = function (obj) {
    var self = obj instanceof this.constructor ?
      obj : $(obj.currentTarget)[this.type](this.getDelegateOptions()).data('bs.' + this.type)

    clearTimeout(self.timeout)

    self.hoverState = 'in'

    if (!self.options.delay || !self.options.delay.show) return self.show()

    self.timeout = setTimeout(function () {
      if (self.hoverState == 'in') self.show()
    }, self.options.delay.show)
  }

  Tooltip.prototype.leave = function (obj) {
    var self = obj instanceof this.constructor ?
      obj : $(obj.currentTarget)[this.type](this.getDelegateOptions()).data('bs.' + this.type)

    clearTimeout(self.timeout)

    self.hoverState = 'out'

    if (!self.options.delay || !self.options.delay.hide) return self.hide()

    self.timeout = setTimeout(function () {
      if (self.hoverState == 'out') self.hide()
    }, self.options.delay.hide)
  }

  Tooltip.prototype.show = function () {
    var e = $.Event('show.bs.'+ this.type)

    if (this.hasContent() && this.enabled) {
      this.$element.trigger(e)

      if (e.isDefaultPrevented()) return

      var $tip = this.tip()

      this.setContent()

      if (this.options.animation) $tip.addClass('fade')

      var placement = typeof this.options.placement == 'function' ?
        this.options.placement.call(this, $tip[0], this.$element[0]) :
        this.options.placement

      var autoToken = /\s?auto?\s?/i
      var autoPlace = autoToken.test(placement)
      if (autoPlace) placement = placement.replace(autoToken, '') || 'top'

      $tip
        .detach()
        .css({ top: 0, left: 0, display: 'block' })
        .addClass(placement)

      this.options.container ? $tip.appendTo(this.options.container) : $tip.insertAfter(this.$element)

      var pos          = this.getPosition()
      var actualWidth  = $tip[0].offsetWidth
      var actualHeight = $tip[0].offsetHeight

      if (autoPlace) {
        var $parent = this.$element.parent()

        var orgPlacement = placement
        var docScroll    = document.documentElement.scrollTop || document.body.scrollTop
        var parentWidth  = this.options.container == 'body' ? window.innerWidth  : $parent.outerWidth()
        var parentHeight = this.options.container == 'body' ? window.innerHeight : $parent.outerHeight()
        var parentLeft   = this.options.container == 'body' ? 0 : $parent.offset().left

        placement = placement == 'bottom' && pos.top   + pos.height  + actualHeight - docScroll > parentHeight  ? 'top'    :
                    placement == 'top'    && pos.top   - docScroll   - actualHeight < 0                         ? 'bottom' :
                    placement == 'right'  && pos.right + actualWidth > parentWidth                              ? 'left'   :
                    placement == 'left'   && pos.left  - actualWidth < parentLeft                               ? 'right'  :
                    placement

        $tip
          .removeClass(orgPlacement)
          .addClass(placement)
      }

      var calculatedOffset = this.getCalculatedOffset(placement, pos, actualWidth, actualHeight)

      this.applyPlacement(calculatedOffset, placement)
      this.$element.trigger('shown.bs.' + this.type)
    }
  }

  Tooltip.prototype.applyPlacement = function(offset, placement) {
    var replace
    var $tip   = this.tip()
    var width  = $tip[0].offsetWidth
    var height = $tip[0].offsetHeight

    // manually read margins because getBoundingClientRect includes difference
    var marginTop = parseInt($tip.css('margin-top'), 10)
    var marginLeft = parseInt($tip.css('margin-left'), 10)

    // we must check for NaN for ie 8/9
    if (isNaN(marginTop))  marginTop  = 0
    if (isNaN(marginLeft)) marginLeft = 0

    offset.top  = offset.top  + marginTop
    offset.left = offset.left + marginLeft

    $tip
      .offset(offset)
      .addClass('in')

    // check to see if placing tip in new offset caused the tip to resize itself
    var actualWidth  = $tip[0].offsetWidth
    var actualHeight = $tip[0].offsetHeight

    if (placement == 'top' && actualHeight != height) {
      replace = true
      offset.top = offset.top + height - actualHeight
    }

    if (/bottom|top/.test(placement)) {
      var delta = 0

      if (offset.left < 0) {
        delta       = offset.left * -2
        offset.left = 0

        $tip.offset(offset)

        actualWidth  = $tip[0].offsetWidth
        actualHeight = $tip[0].offsetHeight
      }

      this.replaceArrow(delta - width + actualWidth, actualWidth, 'left')
    } else {
      this.replaceArrow(actualHeight - height, actualHeight, 'top')
    }

    if (replace) $tip.offset(offset)
  }

  Tooltip.prototype.replaceArrow = function(delta, dimension, position) {
    this.arrow().css(position, delta ? (50 * (1 - delta / dimension) + "%") : '')
  }

  Tooltip.prototype.setContent = function () {
    var $tip  = this.tip()
    var title = this.getTitle()

    $tip.find('.tooltip-inner')[this.options.html ? 'html' : 'text'](title)
    $tip.removeClass('fade in top bottom left right')
  }

  Tooltip.prototype.hide = function () {
    var that = this
    var $tip = this.tip()
    var e    = $.Event('hide.bs.' + this.type)

    function complete() {
      if (that.hoverState != 'in') $tip.detach()
    }

    this.$element.trigger(e)

    if (e.isDefaultPrevented()) return

    $tip.removeClass('in')

    $.support.transition && this.$tip.hasClass('fade') ?
      $tip
        .one($.support.transition.end, complete)
        .emulateTransitionEnd(150) :
      complete()

    this.$element.trigger('hidden.bs.' + this.type)

    return this
  }

  Tooltip.prototype.fixTitle = function () {
    var $e = this.$element
    if ($e.attr('title') || typeof($e.attr('data-original-title')) != 'string') {
      $e.attr('data-original-title', $e.attr('title') || '').attr('title', '')
    }
  }

  Tooltip.prototype.hasContent = function () {
    return this.getTitle()
  }

  Tooltip.prototype.getPosition = function () {
    var el = this.$element[0]
    return $.extend({}, (typeof el.getBoundingClientRect == 'function') ? el.getBoundingClientRect() : {
      width: el.offsetWidth
    , height: el.offsetHeight
    }, this.$element.offset())
  }

  Tooltip.prototype.getCalculatedOffset = function (placement, pos, actualWidth, actualHeight) {
    return placement == 'bottom' ? { top: pos.top + pos.height,   left: pos.left + pos.width / 2 - actualWidth / 2  } :
           placement == 'top'    ? { top: pos.top - actualHeight, left: pos.left + pos.width / 2 - actualWidth / 2  } :
           placement == 'left'   ? { top: pos.top + pos.height / 2 - actualHeight / 2, left: pos.left - actualWidth } :
        /* placement == 'right' */ { top: pos.top + pos.height / 2 - actualHeight / 2, left: pos.left + pos.width   }
  }

  Tooltip.prototype.getTitle = function () {
    var title
    var $e = this.$element
    var o  = this.options

    title = $e.attr('data-original-title')
      || (typeof o.title == 'function' ? o.title.call($e[0]) :  o.title)

    return title
  }

  Tooltip.prototype.tip = function () {
    return this.$tip = this.$tip || $(this.options.template)
  }

  Tooltip.prototype.arrow = function () {
    return this.$arrow = this.$arrow || this.tip().find('.tooltip-arrow')
  }

  Tooltip.prototype.validate = function () {
    if (!this.$element[0].parentNode) {
      this.hide()
      this.$element = null
      this.options  = null
    }
  }

  Tooltip.prototype.enable = function () {
    this.enabled = true
  }

  Tooltip.prototype.disable = function () {
    this.enabled = false
  }

  Tooltip.prototype.toggleEnabled = function () {
    this.enabled = !this.enabled
  }

  Tooltip.prototype.toggle = function (e) {
    var self = e ? $(e.currentTarget)[this.type](this.getDelegateOptions()).data('bs.' + this.type) : this
    self.tip().hasClass('in') ? self.leave(self) : self.enter(self)
  }

  Tooltip.prototype.destroy = function () {
    this.hide().$element.off('.' + this.type).removeData('bs.' + this.type)
  }


  // TOOLTIP PLUGIN DEFINITION
  // =========================

  var old = $.fn.tooltip

  $.fn.tooltip = function (option) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.tooltip')
      var options = typeof option == 'object' && option

      if (!data) $this.data('bs.tooltip', (data = new Tooltip(this, options)))
      if (typeof option == 'string') data[option]()
    })
  }

  $.fn.tooltip.Constructor = Tooltip


  // TOOLTIP NO CONFLICT
  // ===================

  $.fn.tooltip.noConflict = function () {
    $.fn.tooltip = old
    return this
  }

}(jQuery);

/* ========================================================================
 * Bootstrap: popover.js v3.0.2
 * http://getbootstrap.com/javascript/#popovers
 * ========================================================================
 * Copyright 2013 Twitter, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ======================================================================== */


+function ($) { "use strict";

  // POPOVER PUBLIC CLASS DEFINITION
  // ===============================

  var Popover = function (element, options) {
    this.init('popover', element, options)
  }

  if (!$.fn.tooltip) throw new Error('Popover requires tooltip.js')

  Popover.DEFAULTS = $.extend({} , $.fn.tooltip.Constructor.DEFAULTS, {
    placement: 'right'
  , trigger: 'click'
  , content: ''
  , template: '<div class="popover"><div class="arrow"></div><h3 class="popover-title"></h3><div class="popover-content"></div></div>'
  })


  // NOTE: POPOVER EXTENDS tooltip.js
  // ================================

  Popover.prototype = $.extend({}, $.fn.tooltip.Constructor.prototype)

  Popover.prototype.constructor = Popover

  Popover.prototype.getDefaults = function () {
    return Popover.DEFAULTS
  }

  Popover.prototype.setContent = function () {
    var $tip    = this.tip()
    var title   = this.getTitle()
    var content = this.getContent()

    $tip.find('.popover-title')[this.options.html ? 'html' : 'text'](title)
    $tip.find('.popover-content')[this.options.html ? 'html' : 'text'](content)

    $tip.removeClass('fade top bottom left right in')

    // IE8 doesn't accept hiding via the `:empty` pseudo selector, we have to do
    // this manually by checking the contents.
    if (!$tip.find('.popover-title').html()) $tip.find('.popover-title').hide()
  }

  Popover.prototype.hasContent = function () {
    return this.getTitle() || this.getContent()
  }

  Popover.prototype.getContent = function () {
    var $e = this.$element
    var o  = this.options

    return $e.attr('data-content')
      || (typeof o.content == 'function' ?
            o.content.call($e[0]) :
            o.content)
  }

  Popover.prototype.arrow = function () {
    return this.$arrow = this.$arrow || this.tip().find('.arrow')
  }

  Popover.prototype.tip = function () {
    if (!this.$tip) this.$tip = $(this.options.template)
    return this.$tip
  }


  // POPOVER PLUGIN DEFINITION
  // =========================

  var old = $.fn.popover

  $.fn.popover = function (option) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.popover')
      var options = typeof option == 'object' && option

      if (!data) $this.data('bs.popover', (data = new Popover(this, options)))
      if (typeof option == 'string') data[option]()
    })
  }

  $.fn.popover.Constructor = Popover


  // POPOVER NO CONFLICT
  // ===================

  $.fn.popover.noConflict = function () {
    $.fn.popover = old
    return this
  }

}(jQuery);

/* ========================================================================
 * Bootstrap: scrollspy.js v3.0.2
 * http://getbootstrap.com/javascript/#scrollspy
 * ========================================================================
 * Copyright 2013 Twitter, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ======================================================================== */


+function ($) { "use strict";

  // SCROLLSPY CLASS DEFINITION
  // ==========================

  function ScrollSpy(element, options) {
    var href
    var process  = $.proxy(this.process, this)

    this.$element       = $(element).is('body') ? $(window) : $(element)
    this.$body          = $('body')
    this.$scrollElement = this.$element.on('scroll.bs.scroll-spy.data-api', process)
    this.options        = $.extend({}, ScrollSpy.DEFAULTS, options)
    this.selector       = (this.options.target
      || ((href = $(element).attr('href')) && href.replace(/.*(?=#[^\s]+$)/, '')) //strip for ie7
      || '') + ' .nav li > a'
    this.offsets        = $([])
    this.targets        = $([])
    this.activeTarget   = null

    this.refresh()
    this.process()
  }

  ScrollSpy.DEFAULTS = {
    offset: 10
  }

  ScrollSpy.prototype.refresh = function () {
    var offsetMethod = this.$element[0] == window ? 'offset' : 'position'

    this.offsets = $([])
    this.targets = $([])

    var self     = this
    var $targets = this.$body
      .find(this.selector)
      .map(function () {
        var $el   = $(this)
        var href  = $el.data('target') || $el.attr('href')
        var $href = /^#\w/.test(href) && $(href)

        return ($href
          && $href.length
          && [[ $href[offsetMethod]().top + (!$.isWindow(self.$scrollElement.get(0)) && self.$scrollElement.scrollTop()), href ]]) || null
      })
      .sort(function (a, b) { return a[0] - b[0] })
      .each(function () {
        self.offsets.push(this[0])
        self.targets.push(this[1])
      })
  }

  ScrollSpy.prototype.process = function () {
    var scrollTop    = this.$scrollElement.scrollTop() + this.options.offset
    var scrollHeight = this.$scrollElement[0].scrollHeight || this.$body[0].scrollHeight
    var maxScroll    = scrollHeight - this.$scrollElement.height()
    var offsets      = this.offsets
    var targets      = this.targets
    var activeTarget = this.activeTarget
    var i

    if (scrollTop >= maxScroll) {
      return activeTarget != (i = targets.last()[0]) && this.activate(i)
    }

    for (i = offsets.length; i--;) {
      activeTarget != targets[i]
        && scrollTop >= offsets[i]
        && (!offsets[i + 1] || scrollTop <= offsets[i + 1])
        && this.activate( targets[i] )
    }
  }

  ScrollSpy.prototype.activate = function (target) {
    this.activeTarget = target

    $(this.selector)
      .parents('.active')
      .removeClass('active')

    var selector = this.selector
      + '[data-target="' + target + '"],'
      + this.selector + '[href="' + target + '"]'

    var active = $(selector)
      .parents('li')
      .addClass('active')

    if (active.parent('.dropdown-menu').length)  {
      active = active
        .closest('li.dropdown')
        .addClass('active')
    }

    active.trigger('activate')
  }


  // SCROLLSPY PLUGIN DEFINITION
  // ===========================

  var old = $.fn.scrollspy

  $.fn.scrollspy = function (option) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.scrollspy')
      var options = typeof option == 'object' && option

      if (!data) $this.data('bs.scrollspy', (data = new ScrollSpy(this, options)))
      if (typeof option == 'string') data[option]()
    })
  }

  $.fn.scrollspy.Constructor = ScrollSpy


  // SCROLLSPY NO CONFLICT
  // =====================

  $.fn.scrollspy.noConflict = function () {
    $.fn.scrollspy = old
    return this
  }


  // SCROLLSPY DATA-API
  // ==================

  $(window).on('load', function () {
    $('[data-spy="scroll"]').each(function () {
      var $spy = $(this)
      $spy.scrollspy($spy.data())
    })
  })

}(jQuery);

/* ========================================================================
 * Bootstrap: tab.js v3.0.2
 * http://getbootstrap.com/javascript/#tabs
 * ========================================================================
 * Copyright 2013 Twitter, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ======================================================================== */


+function ($) { "use strict";

  // TAB CLASS DEFINITION
  // ====================

  var Tab = function (element) {
    this.element = $(element)
  }

  Tab.prototype.show = function () {
    var $this    = this.element
    var $ul      = $this.closest('ul:not(.dropdown-menu)')
    var selector = $this.data('target')

    if (!selector) {
      selector = $this.attr('href')
      selector = selector && selector.replace(/.*(?=#[^\s]*$)/, '') //strip for ie7
    }

    if ($this.parent('li').hasClass('active')) return

    var previous = $ul.find('.active:last a')[0]
    var e        = $.Event('show.bs.tab', {
      relatedTarget: previous
    })

    $this.trigger(e)

    if (e.isDefaultPrevented()) return

    var $target = $(selector)

    this.activate($this.parent('li'), $ul)
    this.activate($target, $target.parent(), function () {
      $this.trigger({
        type: 'shown.bs.tab'
      , relatedTarget: previous
      })
    })
  }

  Tab.prototype.activate = function (element, container, callback) {
    var $active    = container.find('> .active')
    var transition = callback
      && $.support.transition
      && $active.hasClass('fade')

    function next() {
      $active
        .removeClass('active')
        .find('> .dropdown-menu > .active')
        .removeClass('active')

      element.addClass('active')

      if (transition) {
        element[0].offsetWidth // reflow for transition
        element.addClass('in')
      } else {
        element.removeClass('fade')
      }

      if (element.parent('.dropdown-menu')) {
        element.closest('li.dropdown').addClass('active')
      }

      callback && callback()
    }

    transition ?
      $active
        .one($.support.transition.end, next)
        .emulateTransitionEnd(150) :
      next()

    $active.removeClass('in')
  }


  // TAB PLUGIN DEFINITION
  // =====================

  var old = $.fn.tab

  $.fn.tab = function ( option ) {
    return this.each(function () {
      var $this = $(this)
      var data  = $this.data('bs.tab')

      if (!data) $this.data('bs.tab', (data = new Tab(this)))
      if (typeof option == 'string') data[option]()
    })
  }

  $.fn.tab.Constructor = Tab


  // TAB NO CONFLICT
  // ===============

  $.fn.tab.noConflict = function () {
    $.fn.tab = old
    return this
  }


  // TAB DATA-API
  // ============

  $(document).on('click.bs.tab.data-api', '[data-toggle="tab"], [data-toggle="pill"]', function (e) {
    e.preventDefault()
    $(this).tab('show')
  })

}(jQuery);

/* ========================================================================
 * Bootstrap: affix.js v3.0.2
 * http://getbootstrap.com/javascript/#affix
 * ========================================================================
 * Copyright 2013 Twitter, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ======================================================================== */


+function ($) { "use strict";

  // AFFIX CLASS DEFINITION
  // ======================

  var Affix = function (element, options) {
    this.options = $.extend({}, Affix.DEFAULTS, options)
    this.$window = $(window)
      .on('scroll.bs.affix.data-api', $.proxy(this.checkPosition, this))
      .on('click.bs.affix.data-api',  $.proxy(this.checkPositionWithEventLoop, this))

    this.$element = $(element)
    this.affixed  =
    this.unpin    = null

    this.checkPosition()
  }

  Affix.RESET = 'affix affix-top affix-bottom'

  Affix.DEFAULTS = {
    offset: 0
  }

  Affix.prototype.checkPositionWithEventLoop = function () {
    setTimeout($.proxy(this.checkPosition, this), 1)
  }

  Affix.prototype.checkPosition = function () {
    if (!this.$element.is(':visible')) return

    var scrollHeight = $(document).height()
    var scrollTop    = this.$window.scrollTop()
    var position     = this.$element.offset()
    var offset       = this.options.offset
    var offsetTop    = offset.top
    var offsetBottom = offset.bottom

    if (typeof offset != 'object')         offsetBottom = offsetTop = offset
    if (typeof offsetTop == 'function')    offsetTop    = offset.top()
    if (typeof offsetBottom == 'function') offsetBottom = offset.bottom()

    var affix = this.unpin   != null && (scrollTop + this.unpin <= position.top) ? false :
                offsetBottom != null && (position.top + this.$element.height() >= scrollHeight - offsetBottom) ? 'bottom' :
                offsetTop    != null && (scrollTop <= offsetTop) ? 'top' : false

    if (this.affixed === affix) return
    if (this.unpin) this.$element.css('top', '')

    this.affixed = affix
    this.unpin   = affix == 'bottom' ? position.top - scrollTop : null

    this.$element.removeClass(Affix.RESET).addClass('affix' + (affix ? '-' + affix : ''))

    if (affix == 'bottom') {
      this.$element.offset({ top: document.body.offsetHeight - offsetBottom - this.$element.height() })
    }
  }


  // AFFIX PLUGIN DEFINITION
  // =======================

  var old = $.fn.affix

  $.fn.affix = function (option) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.affix')
      var options = typeof option == 'object' && option

      if (!data) $this.data('bs.affix', (data = new Affix(this, options)))
      if (typeof option == 'string') data[option]()
    })
  }

  $.fn.affix.Constructor = Affix


  // AFFIX NO CONFLICT
  // =================

  $.fn.affix.noConflict = function () {
    $.fn.affix = old
    return this
  }


  // AFFIX DATA-API
  // ==============

  $(window).on('load', function () {
    $('[data-spy="affix"]').each(function () {
      var $spy = $(this)
      var data = $spy.data()

      data.offset = data.offset || {}

      if (data.offsetBottom) data.offset.bottom = data.offsetBottom
      if (data.offsetTop)    data.offset.top    = data.offsetTop

      $spy.affix(data)
    })
  })

}(jQuery);

define("bootstrap", ["jquery"], (function (global) {
    return function () {
        var ret, fn;
        return ret || global.jQuery;
    };
}(this)));

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
        'fastclick': '../vendor/fastclick/fastclick'
    },
    shim: {
        'bootstrap': {
            deps: ['jquery'],
            exports: 'jQuery'
        }
    }
});

define('main',['require','durandal/app','durandal/viewLocator','durandal/system','fastclick','bootstrap'],function(require) {
    var app = require('durandal/app'),
        viewLocator = require('durandal/viewLocator'),
        system = require('durandal/system');

    var fastclick = require('fastclick');

    fastclick.attach(document.body);

    //>>excludeStart("build", true);
    system.debug(true);
    //>>excludeEnd("build");

    require('bootstrap');

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
/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * This module is based on Backbone's core history support. It abstracts away the low level details of working with browser history and url changes in order to provide a solid foundation for a router.
 * @module history
 * @requires system
 * @requires jquery
 */
define('plugins/history',['durandal/system', 'jquery'], function (system, $) {
    // Cached regex for stripping a leading hash/slash and trailing space.
    var routeStripper = /^[#\/]|\s+$/g;

    // Cached regex for stripping leading and trailing slashes.
    var rootStripper = /^\/+|\/+$/g;

    // Cached regex for detecting MSIE.
    var isExplorer = /msie [\w.]+/;

    // Cached regex for removing a trailing slash.
    var trailingSlash = /\/$/;

    // Update the hash location, either replacing the current entry, or adding
    // a new one to the browser history.
    function updateHash(location, fragment, replace) {
        if (replace) {
            var href = location.href.replace(/(javascript:|#).*$/, '');

            if (history.history.replaceState) {
                history.history.replaceState({}, document.title, href + '#' + fragment); // using history.replaceState instead of location.replace to work around chrom bug
            } else {
                location.replace(href + '#' + fragment);
            }
        } else {
            // Some browsers require that `hash` contains a leading #.
            location.hash = '#' + fragment;
        }
    };

    /**
     * @class HistoryModule
     * @static
     */
    var history = {
        /**
         * The setTimeout interval used when the browser does not support hash change events.
         * @property {string} interval
         * @default 50
         */
        interval: 50,
        /**
         * Indicates whether or not the history module is actively tracking history.
         * @property {string} active
         */
        active: false
    };
    
    // Ensure that `History` can be used outside of the browser.
    if (typeof window !== 'undefined') {
        history.location = window.location;
        history.history = window.history;
    }

    /**
     * Gets the true hash value. Cannot use location.hash directly due to a bug in Firefox where location.hash will always be decoded.
     * @method getHash
     * @param {string} [window] The optional window instance
     * @return {string} The hash.
     */
    history.getHash = function(window) {
        var match = (window || history).location.href.match(/#(.*)$/);
        return match ? match[1] : '';
    };
    
    /**
     * Get the cross-browser normalized URL fragment, either from the URL, the hash, or the override.
     * @method getFragment
     * @param {string} fragment The fragment.
     * @param {boolean} forcePushState Should we force push state?
     * @return {string} he fragment.
     */
    history.getFragment = function(fragment, forcePushState) {
        if (fragment == null) {
            if (history._hasPushState || !history._wantsHashChange || forcePushState) {
                fragment = history.location.pathname + history.location.search;
                var root = history.root.replace(trailingSlash, '');
                if (!fragment.indexOf(root)) {
                    fragment = fragment.substr(root.length);
                }
            } else {
                fragment = history.getHash();
            }
        }
        
        return fragment.replace(routeStripper, '');
    };

    /**
     * Activate the hash change handling, returning `true` if the current URL matches an existing route, and `false` otherwise.
     * @method activate
     * @param {HistoryOptions} options.
     * @return {boolean|undefined} Returns true/false from loading the url unless the silent option was selected.
     */
    history.activate = function(options) {
        if (history.active) {
            system.error("History has already been activated.");
        }

        history.active = true;

        // Figure out the initial configuration. Do we need an iframe?
        // Is pushState desired ... is it available?
        history.options = system.extend({}, { root: '/' }, history.options, options);
        history.root = history.options.root;
        history._wantsHashChange = history.options.hashChange !== false;
        history._wantsPushState = !!history.options.pushState;
        history._hasPushState = !!(history.options.pushState && history.history && history.history.pushState);

        var fragment = history.getFragment();
        var docMode = document.documentMode;
        var oldIE = (isExplorer.exec(navigator.userAgent.toLowerCase()) && (!docMode || docMode <= 7));

        // Normalize root to always include a leading and trailing slash.
        history.root = ('/' + history.root + '/').replace(rootStripper, '/');

        if (oldIE && history._wantsHashChange) {
            history.iframe = $('<iframe src="javascript:0" tabindex="-1" />').hide().appendTo('body')[0].contentWindow;
            history.navigate(fragment, false);
        }

        // Depending on whether we're using pushState or hashes, and whether
        // 'onhashchange' is supported, determine how we check the URL state.
        if (history._hasPushState) {
            $(window).on('popstate', history.checkUrl);
        } else if (history._wantsHashChange && ('onhashchange' in window) && !oldIE) {
            $(window).on('hashchange', history.checkUrl);
        } else if (history._wantsHashChange) {
            history._checkUrlInterval = setInterval(history.checkUrl, history.interval);
        }

        // Determine if we need to change the base url, for a pushState link
        // opened by a non-pushState browser.
        history.fragment = fragment;
        var loc = history.location;
        var atRoot = loc.pathname.replace(/[^\/]$/, '$&/') === history.root;

        // Transition from hashChange to pushState or vice versa if both are requested.
        if (history._wantsHashChange && history._wantsPushState) {
            // If we've started off with a route from a `pushState`-enabled
            // browser, but we're currently in a browser that doesn't support it...
            if (!history._hasPushState && !atRoot) {
                history.fragment = history.getFragment(null, true);
                history.location.replace(history.root + history.location.search + '#' + history.fragment);
                // Return immediately as browser will do redirect to new url
                return true;

            // Or if we've started out with a hash-based route, but we're currently
            // in a browser where it could be `pushState`-based instead...
            } else if (history._hasPushState && atRoot && loc.hash) {
                this.fragment = history.getHash().replace(routeStripper, '');
                this.history.replaceState({}, document.title, history.root + history.fragment + loc.search);
            }
        }

        if (!history.options.silent) {
            return history.loadUrl(options.startRoute);
        }
    };

    /**
     * Disable history, perhaps temporarily. Not useful in a real app, but possibly useful for unit testing Routers.
     * @method deactivate
     */
    history.deactivate = function() {
        $(window).off('popstate', history.checkUrl).off('hashchange', history.checkUrl);
        clearInterval(history._checkUrlInterval);
        history.active = false;
    };

    /**
     * Checks the current URL to see if it has changed, and if it has, calls `loadUrl`, normalizing across the hidden iframe.
     * @method checkUrl
     * @return {boolean} Returns true/false from loading the url.
     */
    history.checkUrl = function() {
        var current = history.getFragment();
        if (current === history.fragment && history.iframe) {
            current = history.getFragment(history.getHash(history.iframe));
        }

        if (current === history.fragment) {
            return false;
        }

        if (history.iframe) {
            history.navigate(current, false);
        }
        
        history.loadUrl();
    };
    
    /**
     * Attempts to load the current URL fragment. A pass-through to options.routeHandler.
     * @method loadUrl
     * @return {boolean} Returns true/false from the route handler.
     */
    history.loadUrl = function(fragmentOverride) {
        var fragment = history.fragment = history.getFragment(fragmentOverride);

        return history.options.routeHandler ?
            history.options.routeHandler(fragment) :
            false;
    };

    /**
     * Save a fragment into the hash history, or replace the URL state if the
     * 'replace' option is passed. You are responsible for properly URL-encoding
     * the fragment in advance.
     * The options object can contain `trigger: false` if you wish to not have the
     * route callback be fired, or `replace: true`, if
     * you wish to modify the current URL without adding an entry to the history.
     * @method navigate
     * @param {string} fragment The url fragment to navigate to.
     * @param {object|boolean} options An options object with optional trigger and replace flags. You can also pass a boolean directly to set the trigger option. Trigger is `true` by default.
     * @return {boolean} Returns true/false from loading the url.
     */
    history.navigate = function(fragment, options) {
        if (!history.active) {
            return false;
        }

        if(options === undefined) {
            options = {
                trigger: true
            };
        }else if(system.isBoolean(options)) {
            options = {
                trigger: options
            };
        }

        fragment = history.getFragment(fragment || '');

        if (history.fragment === fragment) {
            return;
        }

        history.fragment = fragment;

        var url = history.root + fragment;

        // Don't include a trailing slash on the root.
        if(fragment === '' && url !== '/') {
            url = url.slice(0, -1);
        }

        // If pushState is available, we use it to set the fragment as a real URL.
        if (history._hasPushState) {
            history.history[options.replace ? 'replaceState' : 'pushState']({}, document.title, url);

            // If hash changes haven't been explicitly disabled, update the hash
            // fragment to store history.
        } else if (history._wantsHashChange) {
            updateHash(history.location, fragment, options.replace);
            
            if (history.iframe && (fragment !== history.getFragment(history.getHash(history.iframe)))) {
                // Opening and closing the iframe tricks IE7 and earlier to push a
                // history entry on hash-tag change.  When replace is true, we don't
                // want history.
                if (!options.replace) {
                    history.iframe.document.open().close();
                }
                
                updateHash(history.iframe.location, fragment, options.replace);
            }

            // If you've told us that you explicitly don't want fallback hashchange-
            // based history, then `navigate` becomes a page refresh.
        } else {
            return history.location.assign(url);
        }

        if (options.trigger) {
            return history.loadUrl(fragment);
        }
    };

    /**
     * Navigates back in the browser history.
     * @method navigateBack
     */
    history.navigateBack = function() {
        history.history.back();
    };

    /**
     * @class HistoryOptions
     * @static
     */

    /**
     * The function that will be called back when the fragment changes.
     * @property {function} routeHandler
     */

    /**
     * The url root used to extract the fragment when using push state.
     * @property {string} root
     */

    /**
     * Use hash change when present.
     * @property {boolean} hashChange
     * @default true
     */

    /**
     * Use push state when present.
     * @property {boolean} pushState
     * @default false
     */

    /**
     * Prevents loading of the current url when activating history.
     * @property {boolean} silent
     * @default false
     */

    return history;
});

/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * Connects the history module's url and history tracking support to Durandal's activation and composition engine allowing you to easily build navigation-style applications.
 * @module router
 * @requires system
 * @requires app
 * @requires activator
 * @requires events
 * @requires composition
 * @requires history
 * @requires knockout
 * @requires jquery
 */
define('plugins/router',['durandal/system', 'durandal/app', 'durandal/activator', 'durandal/events', 'durandal/composition', 'plugins/history', 'knockout', 'jquery'], function(system, app, activator, events, composition, history, ko, $) {
    var optionalParam = /\((.*?)\)/g;
    var namedParam = /(\(\?)?:\w+/g;
    var splatParam = /\*\w+/g;
    var escapeRegExp = /[\-{}\[\]+?.,\\\^$|#\s]/g;
    var startDeferred, rootRouter;
    var trailingSlash = /\/$/;
    var routesAreCaseSensitive = false;
    var lastUrl = '/', lastTryUrl = '/';

    function routeStringToRegExp(routeString) {
        routeString = routeString.replace(escapeRegExp, '\\$&')
            .replace(optionalParam, '(?:$1)?')
            .replace(namedParam, function(match, optional) {
                return optional ? match : '([^\/]+)';
            })
            .replace(splatParam, '(.*?)');

        return new RegExp('^' + routeString + '$', routesAreCaseSensitive ? undefined : 'i');
    }

    function stripParametersFromRoute(route) {
        var colonIndex = route.indexOf(':');
        var length = colonIndex > 0 ? colonIndex - 1 : route.length;
        return route.substring(0, length);
    }

    function endsWith(str, suffix) {
        return str.indexOf(suffix, str.length - suffix.length) !== -1;
    }

    function compareArrays(first, second) {
        if (!first || !second){
            return false;
        }

        if (first.length != second.length) {
            return false;
        }

        for (var i = 0, len = first.length; i < len; i++) {
            if (first[i] != second[i]) {
                return false;
            }
        }

        return true;
    }

    function reconstructUrl(instruction){
        if(!instruction.queryString){
            return instruction.fragment;
        }

        return instruction.fragment + '?' + instruction.queryString;
    }

    /**
     * @class Router
     * @uses Events
     */

    /**
     * Triggered when the navigation logic has completed.
     * @event router:navigation:complete
     * @param {object} instance The activated instance.
     * @param {object} instruction The routing instruction.
     * @param {Router} router The router.
     */

    /**
     * Triggered when the navigation has been cancelled.
     * @event router:navigation:cancelled
     * @param {object} instance The activated instance.
     * @param {object} instruction The routing instruction.
     * @param {Router} router The router.
     */

    /**
     * Triggered when navigation begins.
     * @event router:navigation:processing
     * @param {object} instruction The routing instruction.
     * @param {Router} router The router.
     */

    /**
     * Triggered right before a route is activated.
     * @event router:route:activating
     * @param {object} instance The activated instance.
     * @param {object} instruction The routing instruction.
     * @param {Router} router The router.
     */

    /**
     * Triggered right before a route is configured.
     * @event router:route:before-config
     * @param {object} config The route config.
     * @param {Router} router The router.
     */

    /**
     * Triggered just after a route is configured.
     * @event router:route:after-config
     * @param {object} config The route config.
     * @param {Router} router The router.
     */

    /**
     * Triggered when the view for the activated instance is attached.
     * @event router:navigation:attached
     * @param {object} instance The activated instance.
     * @param {object} instruction The routing instruction.
     * @param {Router} router The router.
     */

    /**
     * Triggered when the composition that the activated instance participates in is complete.
     * @event router:navigation:composition-complete
     * @param {object} instance The activated instance.
     * @param {object} instruction The routing instruction.
     * @param {Router} router The router.
     */

    /**
     * Triggered when the router does not find a matching route.
     * @event router:route:not-found
     * @param {string} fragment The url fragment.
     * @param {Router} router The router.
     */

    var createRouter = function() {
        var queue = [],
            isProcessing = ko.observable(false),
            currentActivation,
            currentInstruction,
            activeItem = activator.create();

        var router = {
            /**
             * The route handlers that are registered. Each handler consists of a `routePattern` and a `callback`.
             * @property {object[]} handlers
             */
            handlers: [],
            /**
             * The route configs that are registered.
             * @property {object[]} routes
             */
            routes: [],
            /**
             * The route configurations that have been designated as displayable in a nav ui (nav:true).
             * @property {KnockoutObservableArray} navigationModel
             */
            navigationModel: ko.observableArray([]),
            /**
             * The active item/screen based on the current navigation state.
             * @property {Activator} activeItem
             */
            activeItem: activeItem,
            /**
             * Indicates that the router (or a child router) is currently in the process of navigating.
             * @property {KnockoutComputed} isNavigating
             */
            isNavigating: ko.computed(function() {
                var current = activeItem();
                var processing = isProcessing();
                var currentRouterIsProcesing = current
                    && current.router
                    && current.router != router
                    && current.router.isNavigating() ? true : false;
                return  processing || currentRouterIsProcesing;
            }),
            /**
             * An observable surfacing the active routing instruction that is currently being processed or has recently finished processing.
             * The instruction object has `config`, `fragment`, `queryString`, `params` and `queryParams` properties.
             * @property {KnockoutObservable} activeInstruction
             */
            activeInstruction:ko.observable(null),
            __router__:true
        };

        events.includeIn(router);

        activeItem.settings.areSameItem = function (currentItem, newItem, currentActivationData, newActivationData) {
            if (currentItem == newItem) {
                return compareArrays(currentActivationData, newActivationData);
            }

            return false;
        };

        activeItem.settings.findChildActivator = function(item) {
            if (item && item.router && item.router.parent == router) {
                return item.router.activeItem;
            }

            return null;
        };

        function hasChildRouter(instance, parentRouter) {
            return instance.router && instance.router.parent == parentRouter;
        }

        function setCurrentInstructionRouteIsActive(flag) {
            if (currentInstruction && currentInstruction.config.isActive) {
                currentInstruction.config.isActive(flag);
            }
        }

        function completeNavigation(instance, instruction, mode) {
            system.log('Navigation Complete', instance, instruction);

            var fromModuleId = system.getModuleId(currentActivation);
            if (fromModuleId) {
                router.trigger('router:navigation:from:' + fromModuleId);
            }

            currentActivation = instance;

            setCurrentInstructionRouteIsActive(false);
            currentInstruction = instruction;
            setCurrentInstructionRouteIsActive(true);

            var toModuleId = system.getModuleId(currentActivation);
            if (toModuleId) {
                router.trigger('router:navigation:to:' + toModuleId);
            }

            if (!hasChildRouter(instance, router)) {
                router.updateDocumentTitle(instance, instruction);
            }

            switch (mode) {
                case 'rootRouter':
                    lastUrl = reconstructUrl(currentInstruction);
                    break;
                case 'rootRouterWithChild':
                    lastTryUrl = reconstructUrl(currentInstruction);
                    break;
                case 'lastChildRouter':
                    lastUrl = lastTryUrl;
                    break;
            }

            rootRouter.explicitNavigation = false;
            rootRouter.navigatingBack = false;

            router.trigger('router:navigation:complete', instance, instruction, router);
        }

        function cancelNavigation(instance, instruction) {
            system.log('Navigation Cancelled');

            router.activeInstruction(currentInstruction);

            router.navigate(lastUrl, false);

            isProcessing(false);
            rootRouter.explicitNavigation = false;
            rootRouter.navigatingBack = false;
            router.trigger('router:navigation:cancelled', instance, instruction, router);
        }

        function redirect(url) {
            system.log('Navigation Redirecting');

            isProcessing(false);
            rootRouter.explicitNavigation = false;
            rootRouter.navigatingBack = false;
            router.navigate(url, { trigger: true, replace: true });
        }

        function activateRoute(activator, instance, instruction) {
            rootRouter.navigatingBack = !rootRouter.explicitNavigation && currentActivation != instruction.fragment;
            router.trigger('router:route:activating', instance, instruction, router);

            var options = {
                canDeactivate: !router.parent
            };

            activator.activateItem(instance, instruction.params, options).then(function(succeeded) {
                if (succeeded) {
                    var previousActivation = currentActivation;
                    var withChild = hasChildRouter(instance, router);
                    var mode = '';

                    if (router.parent) {
                        if(!withChild) {
                            mode = 'lastChildRouter';
                        }
                    } else {
                        if (withChild) {
                            mode = 'rootRouterWithChild';
                        } else {
                            mode = 'rootRouter';
                        }
                    }

                    completeNavigation(instance, instruction, mode);

                    if (withChild) {
                        instance.router.trigger('router:route:before-child-routes', instance, instruction, router);

                        var fullFragment = instruction.fragment;
                        if (instruction.queryString) {
                            fullFragment += "?" + instruction.queryString;
                        }

                        instance.router.loadUrl(fullFragment);
                    }

                    if (previousActivation == instance) {
                        router.attached();
                        router.compositionComplete();
                    }
                } else if(activator.settings.lifecycleData && activator.settings.lifecycleData.redirect){
                    redirect(activator.settings.lifecycleData.redirect);
                }else{
                    cancelNavigation(instance, instruction);
                }

                if (startDeferred) {
                    startDeferred.resolve();
                    startDeferred = null;
                }
            }).fail(function(err){
                system.error(err);
            });
        }

        /**
         * Inspects routes and modules before activation. Can be used to protect access by cancelling navigation or redirecting.
         * @method guardRoute
         * @param {object} instance The module instance that is about to be activated by the router.
         * @param {object} instruction The route instruction. The instruction object has config, fragment, queryString, params and queryParams properties.
         * @return {Promise|Boolean|String} If a boolean, determines whether or not the route should activate or be cancelled. If a string, causes a redirect to the specified route. Can also be a promise for either of these value types.
         */
        function handleGuardedRoute(activator, instance, instruction) {
            var resultOrPromise = router.guardRoute(instance, instruction);
            if (resultOrPromise || resultOrPromise === '') {
                if (resultOrPromise.then) {
                    resultOrPromise.then(function(result) {
                        if (result) {
                            if (system.isString(result)) {
                                redirect(result);
                            } else {
                                activateRoute(activator, instance, instruction);
                            }
                        } else {
                            cancelNavigation(instance, instruction);
                        }
                    });
                } else {
                    if (system.isString(resultOrPromise)) {
                        redirect(resultOrPromise);
                    } else {
                        activateRoute(activator, instance, instruction);
                    }
                }
            } else {
                cancelNavigation(instance, instruction);
            }
        }

        function ensureActivation(activator, instance, instruction) {
            if (router.guardRoute) {
                handleGuardedRoute(activator, instance, instruction);
            } else {
                activateRoute(activator, instance, instruction);
            }
        }

        function canReuseCurrentActivation(instruction) {
            return currentInstruction
                && currentInstruction.config.moduleId == instruction.config.moduleId
                && currentActivation
                && ((currentActivation.canReuseForRoute && currentActivation.canReuseForRoute.apply(currentActivation, instruction.params))
                || (!currentActivation.canReuseForRoute && currentActivation.router && currentActivation.router.loadUrl));
        }

        function dequeueInstruction() {
            if (isProcessing()) {
                return;
            }

            var instruction = queue.shift();
            queue = [];

            if (!instruction) {
                return;
            }

            isProcessing(true);
            router.activeInstruction(instruction);
            router.trigger('router:navigation:processing', instruction, router);

            if (canReuseCurrentActivation(instruction)) {
                var tempActivator = activator.create();
                tempActivator.forceActiveItem(currentActivation); //enforce lifecycle without re-compose
                tempActivator.settings.areSameItem = activeItem.settings.areSameItem;
                tempActivator.settings.findChildActivator = activeItem.settings.findChildActivator;
                ensureActivation(tempActivator, currentActivation, instruction);
            } else if(!instruction.config.moduleId) {
                ensureActivation(activeItem, {
                    viewUrl:instruction.config.viewUrl,
                    canReuseForRoute:function() {
                        return true;
                    }
                }, instruction);
            } else {
                system.acquire(instruction.config.moduleId).then(function(m) {
                    var instance = system.resolveObject(m);

                    if(instruction.config.viewUrl) {
                        instance.viewUrl = instruction.config.viewUrl;
                    }

                    ensureActivation(activeItem, instance, instruction);
                }).fail(function(err) {
                    system.error('Failed to load routed module (' + instruction.config.moduleId + '). Details: ' + err.message, err);
                });
            }
        }

        function queueInstruction(instruction) {
            queue.unshift(instruction);
            dequeueInstruction();
        }

        // Given a route, and a URL fragment that it matches, return the array of
        // extracted decoded parameters. Empty or unmatched parameters will be
        // treated as `null` to normalize cross-browser behavior.
        function createParams(routePattern, fragment, queryString) {
            var params = routePattern.exec(fragment).slice(1);

            for (var i = 0; i < params.length; i++) {
                var current = params[i];
                params[i] = current ? decodeURIComponent(current) : null;
            }

            var queryParams = router.parseQueryString(queryString);
            if (queryParams) {
                params.push(queryParams);
            }

            return {
                params:params,
                queryParams:queryParams
            };
        }

        function configureRoute(config){
            router.trigger('router:route:before-config', config, router);

            if (!system.isRegExp(config.route)) {
                config.title = config.title || router.convertRouteToTitle(config.route);

                if (!config.viewUrl) {
                    config.moduleId = config.moduleId || router.convertRouteToModuleId(config.route);
                }
                
                config.hash = config.hash || router.convertRouteToHash(config.route);

                if (config.hasChildRoutes) {
                    config.route = config.route + '*childRoutes';
                }

                config.routePattern = routeStringToRegExp(config.route);
            }else{
                config.routePattern = config.route;
            }

            config.isActive = config.isActive || ko.observable(false);
            router.trigger('router:route:after-config', config, router);
            router.routes.push(config);

            router.route(config.routePattern, function(fragment, queryString) {
                var paramInfo = createParams(config.routePattern, fragment, queryString);
                queueInstruction({
                    fragment: fragment,
                    queryString:queryString,
                    config: config,
                    params: paramInfo.params,
                    queryParams:paramInfo.queryParams
                });
            });
        };

        function mapRoute(config) {
            if(system.isArray(config.route)){
                var isActive = config.isActive || ko.observable(false);

                for(var i = 0, length = config.route.length; i < length; i++){
                    var current = system.extend({}, config);

                    current.route = config.route[i];
                    current.isActive = isActive;

                    if(i > 0){
                        delete current.nav;
                    }

                    configureRoute(current);
                }
            }else{
                configureRoute(config);
            }

            return router;
        }

        /**
         * Parses a query string into an object.
         * @method parseQueryString
         * @param {string} queryString The query string to parse.
         * @return {object} An object keyed according to the query string parameters.
         */
        router.parseQueryString = function (queryString) {
            var queryObject, pairs;

            if (!queryString) {
                return null;
            }

            pairs = queryString.split('&');

            if (pairs.length == 0) {
                return null;
            }

            queryObject = {};

            for (var i = 0; i < pairs.length; i++) {
                var pair = pairs[i];
                if (pair === '') {
                    continue;
                }

                var parts = pair.split(/=(.+)?/),
                    key = parts[0],
                    value = parts[1] && decodeURIComponent(parts[1].replace(/\+/g, ' '));

                var existing = queryObject[key];

                if (existing) {
                    if (system.isArray(existing)) {
                        existing.push(value);
                    } else {
                        queryObject[key] = [existing, value];
                    }
                }
                else {
                    queryObject[key] = value;
                }
            }

            return queryObject;
        };

        /**
         * Add a route to be tested when the url fragment changes.
         * @method route
         * @param {RegEx} routePattern The route pattern to test against.
         * @param {function} callback The callback to execute when the route pattern is matched.
         */
        router.route = function(routePattern, callback) {
            router.handlers.push({ routePattern: routePattern, callback: callback });
        };

        /**
         * Attempt to load the specified URL fragment. If a route succeeds with a match, returns `true`. If no defined routes matches the fragment, returns `false`.
         * @method loadUrl
         * @param {string} fragment The URL fragment to find a match for.
         * @return {boolean} True if a match was found, false otherwise.
         */
        router.loadUrl = function(fragment) {
            var handlers = router.handlers,
                queryString = null,
                coreFragment = fragment,
                queryIndex = fragment.indexOf('?');

            if (queryIndex != -1) {
                coreFragment = fragment.substring(0, queryIndex);
                queryString = fragment.substr(queryIndex + 1);
            }

            if(router.relativeToParentRouter){
                var instruction = this.parent.activeInstruction();
				coreFragment = queryIndex == -1 ? instruction.params.join('/') : instruction.params.slice(0, -1).join('/');

                if(coreFragment && coreFragment.charAt(0) == '/'){
                    coreFragment = coreFragment.substr(1);
                }

                if(!coreFragment){
                    coreFragment = '';
                }

                coreFragment = coreFragment.replace('//', '/').replace('//', '/');
            }

            coreFragment = coreFragment.replace(trailingSlash, '');

            for (var i = 0; i < handlers.length; i++) {
                var current = handlers[i];
                if (current.routePattern.test(coreFragment)) {
                    current.callback(coreFragment, queryString);
                    return true;
                }
            }

            system.log('Route Not Found', fragment, currentInstruction);
            router.trigger('router:route:not-found', fragment, router);

            if (router.parent) {
                lastUrl = lastTryUrl;
            }

            history.navigate(lastUrl, { trigger:false, replace:true });

            rootRouter.explicitNavigation = false;
            rootRouter.navigatingBack = false;

            return false;
        };

        var titleSubscription;
        function setTitle(value) {
            var appTitle = ko.unwrap(app.title);

            if (appTitle) {
                document.title = value + " | " + appTitle;
            } else {
                document.title = value;
            }
        }  
        
        // Allow observable to be used for app.title
        if(ko.isObservable(app.title)) {
            app.title.subscribe(function () {
                var instruction = router.activeInstruction();
                var title = instruction != null ? ko.unwrap(instruction.config.title) : '';
                setTitle(title);
            });
        }
        
        /**
         * Updates the document title based on the activated module instance, the routing instruction and the app.title.
         * @method updateDocumentTitle
         * @param {object} instance The activated module.
         * @param {object} instruction The routing instruction associated with the action. It has a `config` property that references the original route mapping config.
         */
        router.updateDocumentTitle = function (instance, instruction) {
            var appTitle = ko.unwrap(app.title),
                title = instruction.config.title;
                
            if (titleSubscription) {
                titleSubscription.dispose();
            }

            if (title) {
                if (ko.isObservable(title)) {
                    titleSubscription = title.subscribe(setTitle);
                    setTitle(title());
                } else {
                    setTitle(title);
                }
            } else if (appTitle) {
                document.title = appTitle;
            }
        };

        /**
         * Save a fragment into the hash history, or replace the URL state if the
         * 'replace' option is passed. You are responsible for properly URL-encoding
         * the fragment in advance.
         * The options object can contain `trigger: false` if you wish to not have the
         * route callback be fired, or `replace: true`, if
         * you wish to modify the current URL without adding an entry to the history.
         * @method navigate
         * @param {string} fragment The url fragment to navigate to.
         * @param {object|boolean} options An options object with optional trigger and replace flags. You can also pass a boolean directly to set the trigger option. Trigger is `true` by default.
         * @return {boolean} Returns true/false from loading the url.
         */
        router.navigate = function(fragment, options) {
            if(fragment && fragment.indexOf('://') != -1) {
                window.location.href = fragment;
                return true;
            }

            if(options === undefined || (system.isBoolean(options) && options) || (system.isObject(options) && options.trigger)) {
                rootRouter.explicitNavigation = true;
            }

            if ((system.isBoolean(options) && !options) || (options && options.trigger != undefined && !options.trigger)) {
                lastUrl = fragment;
            }

            return history.navigate(fragment, options);
        };

        /**
         * Navigates back in the browser history.
         * @method navigateBack
         */
        router.navigateBack = function() {
            history.navigateBack();
        };

        router.attached = function() {
            router.trigger('router:navigation:attached', currentActivation, currentInstruction, router);
        };

        router.compositionComplete = function(){
            isProcessing(false);
            router.trigger('router:navigation:composition-complete', currentActivation, currentInstruction, router);
            dequeueInstruction();
        };

        /**
         * Converts a route to a hash suitable for binding to a link's href.
         * @method convertRouteToHash
         * @param {string} route
         * @return {string} The hash.
         */
        router.convertRouteToHash = function(route) {
            route = route.replace(/\*.*$/, '');

            if(router.relativeToParentRouter){
                var instruction = router.parent.activeInstruction(),
                    hash = route ? instruction.config.hash + '/' + route : instruction.config.hash;

                if(history._hasPushState){
                    hash = '/' + hash;
                }

                hash = hash.replace('//', '/').replace('//', '/');
                return hash;
            }

            if(history._hasPushState){
                return route;
            }

            return "#" + route;
        };

        /**
         * Converts a route to a module id. This is only called if no module id is supplied as part of the route mapping.
         * @method convertRouteToModuleId
         * @param {string} route
         * @return {string} The module id.
         */
        router.convertRouteToModuleId = function(route) {
            return stripParametersFromRoute(route);
        };

        /**
         * Converts a route to a displayable title. This is only called if no title is specified as part of the route mapping.
         * @method convertRouteToTitle
         * @param {string} route
         * @return {string} The title.
         */
        router.convertRouteToTitle = function(route) {
            var value = stripParametersFromRoute(route);
            return value.substring(0, 1).toUpperCase() + value.substring(1);
        };

        /**
         * Maps route patterns to modules.
         * @method map
         * @param {string|object|object[]} route A route, config or array of configs.
         * @param {object} [config] The config for the specified route.
         * @chainable
         * @example
         router.map([
         { route: '', title:'Home', moduleId: 'homeScreen', nav: true },
         { route: 'customer/:id', moduleId: 'customerDetails'}
         ]);
         */
        router.map = function(route, config) {
            if (system.isArray(route)) {
                for (var i = 0; i < route.length; i++) {
                    router.map(route[i]);
                }

                return router;
            }

            if (system.isString(route) || system.isRegExp(route)) {
                if (!config) {
                    config = {};
                } else if (system.isString(config)) {
                    config = { moduleId: config };
                }

                config.route = route;
            } else {
                config = route;
            }

            return mapRoute(config);
        };

        /**
         * Builds an observable array designed to bind a navigation UI to. The model will exist in the `navigationModel` property.
         * @method buildNavigationModel
         * @param {number} defaultOrder The default order to use for navigation visible routes that don't specify an order. The default is 100 and each successive route will be one more than that.
         * @chainable
         */
        router.buildNavigationModel = function(defaultOrder) {
            var nav = [], routes = router.routes;
            var fallbackOrder = defaultOrder || 100;

            for (var i = 0; i < routes.length; i++) {
                var current = routes[i];

                if (current.nav) {
                    if (!system.isNumber(current.nav)) {
                        current.nav = ++fallbackOrder;
                    }

                    nav.push(current);
                }
            }

            nav.sort(function(a, b) { return a.nav - b.nav; });
            router.navigationModel(nav);

            return router;
        };

        /**
         * Configures how the router will handle unknown routes.
         * @method mapUnknownRoutes
         * @param {string|function} [config] If not supplied, then the router will map routes to modules with the same name.
         * If a string is supplied, it represents the module id to route all unknown routes to.
         * Finally, if config is a function, it will be called back with the route instruction containing the route info. The function can then modify the instruction by adding a moduleId and the router will take over from there.
         * @param {string} [replaceRoute] If config is a module id, then you can optionally provide a route to replace the url with.
         * @chainable
         */
        router.mapUnknownRoutes = function(config, replaceRoute) {
            var catchAllRoute = "*catchall";
            var catchAllPattern = routeStringToRegExp(catchAllRoute);

            router.route(catchAllPattern, function (fragment, queryString) {
                var paramInfo = createParams(catchAllPattern, fragment, queryString);
                var instruction = {
                    fragment: fragment,
                    queryString: queryString,
                    config: {
                        route: catchAllRoute,
                        routePattern: catchAllPattern
                    },
                    params: paramInfo.params,
                    queryParams: paramInfo.queryParams
                };

                if (!config) {
                    instruction.config.moduleId = fragment;
                } else if (system.isString(config)) {
                    instruction.config.moduleId = config;
                    if(replaceRoute){
                        history.navigate(replaceRoute, { trigger:false, replace:true });
                    }
                } else if (system.isFunction(config)) {
                    var result = config(instruction);
                    if (result && result.then) {
                        result.then(function() {
                            router.trigger('router:route:before-config', instruction.config, router);
                            router.trigger('router:route:after-config', instruction.config, router);
                            queueInstruction(instruction);
                        });
                        return;
                    }
                } else {
                    instruction.config = config;
                    instruction.config.route = catchAllRoute;
                    instruction.config.routePattern = catchAllPattern;
                }

                router.trigger('router:route:before-config', instruction.config, router);
                router.trigger('router:route:after-config', instruction.config, router);
                queueInstruction(instruction);
            });

            return router;
        };

        /**
         * Resets the router by removing handlers, routes, event handlers and previously configured options.
         * @method reset
         * @chainable
         */
        router.reset = function() {
            currentInstruction = currentActivation = undefined;
            router.handlers = [];
            router.routes = [];
            router.off();
            delete router.options;
            return router;
        };

        /**
         * Makes all configured routes and/or module ids relative to a certain base url.
         * @method makeRelative
         * @param {string|object} settings If string, the value is used as the base for routes and module ids. If an object, you can specify `route` and `moduleId` separately. In place of specifying route, you can set `fromParent:true` to make routes automatically relative to the parent router's active route.
         * @chainable
         */
        router.makeRelative = function(settings){
            if(system.isString(settings)){
                settings = {
                    moduleId:settings,
                    route:settings
                };
            }

            if(settings.moduleId && !endsWith(settings.moduleId, '/')){
                settings.moduleId += '/';
            }

            if(settings.route && !endsWith(settings.route, '/')){
                settings.route += '/';
            }

            if(settings.fromParent){
                router.relativeToParentRouter = true;
            }

            router.on('router:route:before-config').then(function(config){
                if(settings.moduleId){
                    config.moduleId = settings.moduleId + config.moduleId;
                }

                if(settings.route){
                    if(config.route === ''){
                        config.route = settings.route.substring(0, settings.route.length - 1);
                    }else{
                        config.route = settings.route + config.route;
                    }
                }
            });

            if (settings.dynamicHash) {
                router.on('router:route:after-config').then(function (config) {
                    config.routePattern = routeStringToRegExp(config.route ? settings.dynamicHash + '/' + config.route : settings.dynamicHash);
                    config.dynamicHash = config.dynamicHash || ko.observable(config.hash);
                });

                router.on('router:route:before-child-routes').then(function(instance, instruction, parentRouter) {
                    var childRouter = instance.router;

                    for(var i = 0; i < childRouter.routes.length; i++) {
                        var route = childRouter.routes[i];
                        var params = instruction.params.slice(0);

                        route.hash = childRouter.convertRouteToHash(route.route)
                            .replace(namedParam, function(match) {
                                return params.length > 0 ? params.shift() : match;
                            });

                        route.dynamicHash(route.hash);
                    }
                });
            }

            return router;
        };

        /**
         * Creates a child router.
         * @method createChildRouter
         * @return {Router} The child router.
         */
        router.createChildRouter = function() {
            var childRouter = createRouter();
            childRouter.parent = router;
            return childRouter;
        };

        return router;
    };

    /**
     * @class RouterModule
     * @extends Router
     * @static
     */
    rootRouter = createRouter();
    rootRouter.explicitNavigation = false;
    rootRouter.navigatingBack = false;

    /**
     * Makes the RegExp generated for routes case sensitive, rather than the default of case insensitive.
     * @method makeRoutesCaseSensitive
     */
    rootRouter.makeRoutesCaseSensitive = function(){
        routesAreCaseSensitive = true;
    };

    /**
     * Verify that the target is the current window
     * @method targetIsThisWindow
     * @return {boolean} True if the event's target is the current window, false otherwise.
     */
    rootRouter.targetIsThisWindow = function(event) {
        var targetWindow = $(event.target).attr('target');

        if (!targetWindow ||
            targetWindow === window.name ||
            targetWindow === '_self' ||
            (targetWindow === 'top' && window === window.top)) { return true; }

        return false;
    };

    /**
     * Activates the router and the underlying history tracking mechanism.
     * @method activate
     * @return {Promise} A promise that resolves when the router is ready.
     */
    rootRouter.activate = function(options) {
        return system.defer(function(dfd) {
            startDeferred = dfd;
            rootRouter.options = system.extend({ routeHandler: rootRouter.loadUrl }, rootRouter.options, options);

            history.activate(rootRouter.options);

            if(history._hasPushState){
                var routes = rootRouter.routes,
                    i = routes.length;

                while(i--){
                    var current = routes[i];
                    current.hash = current.hash.replace('#', '/');
                }
            }

            var rootStripper = rootRouter.options.root && new RegExp("^" + rootRouter.options.root + "/");

            $(document).delegate("a", 'click', function(evt){
                if(history._hasPushState){
                    if(!evt.altKey && !evt.ctrlKey && !evt.metaKey && !evt.shiftKey && rootRouter.targetIsThisWindow(evt)){
                        var href = $(this).attr("href");

                        // Ensure the protocol is not part of URL, meaning its relative.
                        // Stop the event bubbling to ensure the link will not cause a page refresh.
                        if (href != null && !(href.charAt(0) === "#" || /^[a-z]+:/i.test(href))) {
                            rootRouter.explicitNavigation = true;
                            evt.preventDefault();

                            if (rootStripper) {
                                href = href.replace(rootStripper, "");
                            }

                            history.navigate(href);
                        }
                    }
                }else{
                    rootRouter.explicitNavigation = true;
                }
            });

            if(history.options.silent && startDeferred){
                startDeferred.resolve();
                startDeferred = null;
            }
        }).promise();
    };

    /**
     * Disable history, perhaps temporarily. Not useful in a real app, but possibly useful for unit testing Routers.
     * @method deactivate
     */
    rootRouter.deactivate = function() {
        history.deactivate();
    };

    /**
     * Installs the router's custom ko binding handler.
     * @method install
     */
    rootRouter.install = function(){
        ko.bindingHandlers.router = {
            init: function() {
                return { controlsDescendantBindings: true };
            },
            update: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
                var settings = ko.utils.unwrapObservable(valueAccessor()) || {};

                if (settings.__router__) {
                    settings = {
                        model:settings.activeItem(),
                        attached:settings.attached,
                        compositionComplete:settings.compositionComplete,
                        activate: false
                    };
                } else {
                    var theRouter = ko.utils.unwrapObservable(settings.router || viewModel.router) || rootRouter;
                    settings.model = theRouter.activeItem();
                    settings.attached = theRouter.attached;
                    settings.compositionComplete = theRouter.compositionComplete;
                    settings.activate = false;
                }

                composition.compose(element, settings, bindingContext);
            }
        };

        ko.virtualElements.allowedBindings.router = true;
    };

    return rootRouter;
});

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
		define('uberproto',[], factory);
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

define('viewmodels/vm_base',['require','uberproto'],function(require) {
	var proto = require('uberproto');
	
    var VmBase = proto.extend({
    	init: function(model) {
    		this.model = model;
    		
    	}
    });

    return VmBase;
});
define('viewmodels/about',['require','plugins/router','durandal/app','./vm_base'],function(require) {
    var router = require('plugins/router');
    var app = require('durandal/app');

    var VmBase = require('./vm_base');

    var VmAbout = VmBase.extend({
        activate: function () {
            
        }
    });

    return VmAbout;
});
define('viewmodels/careers',['require','plugins/router','durandal/app','./vm_base'],function(require) {
    var router = require('plugins/router');
    var app = require('durandal/app');

    var VmBase = require('./vm_base');

    var VmCareers = VmBase.extend({
        activate: function () {
            
        }
    });

    return VmCareers;
});
define('viewmodels/footer',['require','plugins/router','durandal/app','./vm_base'],function(require) {
    var router = require('plugins/router');
    var app = require('durandal/app');

    var VmBase = require('./vm_base');

    var VmFooter = VmBase.extend({
    	router: router,
        activate: function () {
            
        }
    });

    return VmFooter;
});
define('viewmodels/home',['require','durandal/app','knockout','plugins/router','./vm_base'],function(require) {
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
define('viewmodels/shell',['require','plugins/router','durandal/app','knockout','./vm_base'],function(require) {
    var router = require('plugins/router');
    var app = require('durandal/app');
    var ko = require('knockout');

    var VmBase = require('./vm_base');

    var VmShell = VmBase.extend({
        router: router,
    
        activate: function () {
            this.activeItemTitle = ko.observable('');

            router.map([
                // Non Nav

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

            console.log(router.activeItem().__moduleId__);
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
/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * The dialog module enables the display of message boxes, custom modal dialogs and other overlays or slide-out UI abstractions. Dialogs are constructed by the composition system which interacts with a user defined dialog context. The dialog module enforced the activator lifecycle.
 * @module dialog
 * @requires system
 * @requires app
 * @requires composition
 * @requires activator
 * @requires viewEngine
 * @requires jquery
 * @requires knockout
 */
define('plugins/dialog',['durandal/system', 'durandal/app', 'durandal/composition', 'durandal/activator', 'durandal/viewEngine', 'jquery', 'knockout'], function (system, app, composition, activator, viewEngine, $, ko) {
    var contexts = {},
        dialogCount = ko.observable(0),
        dialog;

    /**
     * Models a message box's message, title and options.
     * @class MessageBox
     */
    var MessageBox = function (message, title, options, autoclose, settings) {
        this.message = message;
        this.title = title || MessageBox.defaultTitle;
        this.options = options || MessageBox.defaultOptions;
        this.autoclose = autoclose || false;
        this.settings = $.extend({}, MessageBox.defaultSettings, settings);
    };

    /**
     * Selects an option and closes the message box, returning the selected option through the dialog system's promise.
     * @method selectOption
     * @param {string} dialogResult The result to select.
     */
    MessageBox.prototype.selectOption = function (dialogResult) {
        dialog.close(this, dialogResult);
    };

    /**
     * Provides the view to the composition system.
     * @method getView
     * @return {DOMElement} The view of the message box.
     */
    MessageBox.prototype.getView = function () {
        return viewEngine.processMarkup(MessageBox.defaultViewMarkup);
    };

    /**
     * Configures a custom view to use when displaying message boxes.
     * @method setViewUrl
     * @param {string} viewUrl The view url relative to the base url which the view locator will use to find the message box's view.
     * @static
     */
    MessageBox.setViewUrl = function (viewUrl) {
        delete MessageBox.prototype.getView;
        MessageBox.prototype.viewUrl = viewUrl;
    };

    /**
     * The title to be used for the message box if one is not provided.
     * @property {string} defaultTitle
     * @default Application
     * @static
     */
    MessageBox.defaultTitle = app.title || 'Application';

    /**
     * The options to display in the message box if none are specified.
     * @property {string[]} defaultOptions
     * @default ['Ok']
     * @static
     */
    MessageBox.defaultOptions = ['Ok'];

    
    MessageBox.defaultSettings = { buttonClass: "btn btn-default", primaryButtonClass: "btn-primary autofocus", secondaryButtonClass: "", "class": "modal-content messageBox", style: null };

    /**
    * Sets the classes and styles used throughout the message box markup.
    * @method setDefaults
    * @param {object} settings A settings object containing the following optional properties: buttonClass, primaryButtonClass, secondaryButtonClass, class, style.
    */
    MessageBox.setDefaults = function (settings) {
        $.extend(MessageBox.defaultSettings, settings);
    };

    MessageBox.prototype.getButtonClass = function ($index) {
        var c = "";
        if (this.settings) {
            if (this.settings.buttonClass) {
                c = this.settings.buttonClass;
            }
            if ($index() === 0 && this.settings.primaryButtonClass) {
                if (c.length > 0) {
                    c += " ";
                }
                c += this.settings.primaryButtonClass;
            }
            if ($index() > 0 && this.settings.secondaryButtonClass) {
                if (c.length > 0) {
                    c += " ";
                }
                c += this.settings.secondaryButtonClass;
            }
        }
        return c;
    };

    MessageBox.prototype.getClass = function () {
        if (this.settings) {
            return this.settings["class"];
        }
        return "messageBox";
    };

    MessageBox.prototype.getStyle = function () {
        if (this.settings) {
            return this.settings.style;
        }
        return null;
    };

    MessageBox.prototype.getButtonText = function (stringOrObject) {
        var t = $.type(stringOrObject);
        if (t === "string") {
            return stringOrObject;
        }
        else if (t === "object") {
            if ($.type(stringOrObject.text) === "string") {
                return stringOrObject.text;
            } else {
                system.error('The object for a MessageBox button does not have a text property that is a string.');
                return null;
            }
        }
        system.error('Object for a MessageBox button is not a string or object but ' + t + '.');
        return null;
    };

    MessageBox.prototype.getButtonValue = function (stringOrObject) {
        var t = $.type(stringOrObject);
        if (t === "string") {
            return stringOrObject;
        }
        else if (t === "object") {
            if ($.type(stringOrObject.text) === "undefined") {
                system.error('The object for a MessageBox button does not have a value property defined.');
                return null;
            } else {
                return stringOrObject.value;
            }
        }
        system.error('Object for a MessageBox button is not a string or object but ' + t + '.');
        return null;
    };

    /**
     * The markup for the message box's view.
     * @property {string} defaultViewMarkup
     * @static
     */
    MessageBox.defaultViewMarkup = [
        '<div data-view="plugins/messageBox" data-bind="css: getClass(), style: getStyle()">',
            '<div class="modal-header">',
                '<h3 data-bind="html: title"></h3>',
            '</div>',
            '<div class="modal-body">',
                '<p class="message" data-bind="html: message"></p>',
            '</div>',
            '<div class="modal-footer">',
                '<!-- ko foreach: options -->',
                '<button data-bind="click: function () { $parent.selectOption($parent.getButtonValue($data)); }, text: $parent.getButtonText($data), css: $parent.getButtonClass($index)"></button>',
                '<!-- /ko -->',
                '<div style="clear:both;"></div>',
            '</div>',
        '</div>'
    ].join('\n');

    function ensureDialogInstance(objOrModuleId) {
        return system.defer(function (dfd) {
            if (system.isString(objOrModuleId)) {
                system.acquire(objOrModuleId).then(function (module) {
                    dfd.resolve(system.resolveObject(module));
                }).fail(function (err) {
                    system.error('Failed to load dialog module (' + objOrModuleId + '). Details: ' + err.message);
                });
            } else {
                dfd.resolve(objOrModuleId);
            }
        }).promise();
    }

    /**
     * @class DialogModule
     * @static
     */
    dialog = {
        /**
         * The constructor function used to create message boxes.
         * @property {MessageBox} MessageBox
         */
        MessageBox: MessageBox,
        /**
         * The css zIndex that the last dialog was displayed at.
         * @property {number} currentZIndex
         */
        currentZIndex: 1050,
        /**
         * Gets the next css zIndex at which a dialog should be displayed.
         * @method getNextZIndex
         * @return {number} The next usable zIndex.
         */
        getNextZIndex: function () {
            return ++this.currentZIndex;
        },
        /**
         * Determines whether or not there are any dialogs open.
         * @method isOpen
         * @return {boolean} True if a dialog is open. false otherwise.
         */
        isOpen: ko.computed(function() {
            return dialogCount() > 0;
        }),
        /**
         * Gets the dialog context by name or returns the default context if no name is specified.
         * @method getContext
         * @param {string} [name] The name of the context to retrieve.
         * @return {DialogContext} True context.
         */
        getContext: function (name) {
            return contexts[name || 'default'];
        },
        /**
         * Adds (or replaces) a dialog context.
         * @method addContext
         * @param {string} name The name of the context to add.
         * @param {DialogContext} dialogContext The context to add.
         */
        addContext: function (name, dialogContext) {
            dialogContext.name = name;
            contexts[name] = dialogContext;

            var helperName = 'show' + name.substr(0, 1).toUpperCase() + name.substr(1);
            this[helperName] = function (obj, activationData) {
                return this.show(obj, activationData, name);
            };
        },
        createCompositionSettings: function (obj, dialogContext) {
            var settings = {
                model: obj,
                activate: false,
                transition: false
            };

            if (dialogContext.binding) {
                settings.binding = dialogContext.binding;
            }

            if (dialogContext.attached) {
                settings.attached = dialogContext.attached;
            }

            if (dialogContext.compositionComplete) {
                settings.compositionComplete = dialogContext.compositionComplete;
            }

            return settings;
        },
        /**
         * Gets the dialog model that is associated with the specified object.
         * @method getDialog
         * @param {object} obj The object for whom to retrieve the dialog.
         * @return {Dialog} The dialog model.
         */
        getDialog: function (obj) {
            if (obj) {
                return obj.__dialog__;
            }

            return undefined;
        },
        /**
         * Closes the dialog associated with the specified object.
         * @method close
         * @param {object} obj The object whose dialog should be closed.
         * @param {object} results* The results to return back to the dialog caller after closing.
         */
        close: function (obj) {
            var theDialog = this.getDialog(obj);
            if (theDialog) {
                var rest = Array.prototype.slice.call(arguments, 1);
                theDialog.close.apply(theDialog, rest);
            }
        },
        /**
         * Shows a dialog.
         * @method show
         * @param {object|string} obj The object (or moduleId) to display as a dialog.
         * @param {object} [activationData] The data that should be passed to the object upon activation.
         * @param {string} [context] The name of the dialog context to use. Uses the default context if none is specified.
         * @return {Promise} A promise that resolves when the dialog is closed and returns any data passed at the time of closing.
         */
        show: function (obj, activationData, context) {
            var that = this;
            var dialogContext = contexts[context || 'default'];

            return system.defer(function (dfd) {
                ensureDialogInstance(obj).then(function (instance) {
                    var dialogActivator = activator.create();

                    dialogActivator.activateItem(instance, activationData).then(function (success) {
                        if (success) {
                            var theDialog = instance.__dialog__ = {
                                owner: instance,
                                context: dialogContext,
                                activator: dialogActivator,
                                close: function () {
                                    var args = arguments;
                                    dialogActivator.deactivateItem(instance, true).then(function (closeSuccess) {
                                        if (closeSuccess) {
                                            dialogCount(dialogCount() - 1);
                                            dialogContext.removeHost(theDialog);
                                            delete instance.__dialog__;

                                            if (args.length === 0) {
                                                dfd.resolve();
                                            } else if (args.length === 1) {
                                                dfd.resolve(args[0]);
                                            } else {
                                                dfd.resolve.apply(dfd, args);
                                            }
                                        }
                                    });
                                }
                            };

                            theDialog.settings = that.createCompositionSettings(instance, dialogContext);
                            dialogContext.addHost(theDialog);

                            dialogCount(dialogCount() + 1);
                            composition.compose(theDialog.host, theDialog.settings);
                        } else {
                            dfd.resolve(false);
                        }
                    });
                });
            }).promise();
        },
        /**
         * Shows a message box.
         * @method showMessage
         * @param {string} message The message to display in the dialog.
         * @param {string} [title] The title message.
         * @param {string[]} [options] The options to provide to the user.
         * @param {boolean} [autoclose] Automatically close the the message box when clicking outside?
         * @param {Object} [settings] Custom settings for this instance of the messsage box, used to change classes and styles.
         * @return {Promise} A promise that resolves when the message box is closed and returns the selected option.
         */
        showMessage: function (message, title, options, autoclose, settings) {
            if (system.isString(this.MessageBox)) {
                return dialog.show(this.MessageBox, [
                    message,
                    title || MessageBox.defaultTitle,
                    options || MessageBox.defaultOptions,
                    autoclose || false,
                    settings || {}
                ]);
            }

            return dialog.show(new this.MessageBox(message, title, options, autoclose, settings));
        },
        /**
         * Installs this module into Durandal; called by the framework. Adds `app.showDialog` and `app.showMessage` convenience methods.
         * @method install
         * @param {object} [config] Add a `messageBox` property to supply a custom message box constructor. Add a `messageBoxView` property to supply custom view markup for the built-in message box. You can also use messageBoxViewUrl to specify the view url.
         */
        install: function (config) {
            app.showDialog = function (obj, activationData, context) {
                return dialog.show(obj, activationData, context);
            };

            app.closeDialog = function () {
                return dialog.close.apply(dialog, arguments);
            };

            app.showMessage = function (message, title, options, autoclose, settings) {
                return dialog.showMessage(message, title, options, autoclose, settings);
            };

            if (config.messageBox) {
                dialog.MessageBox = config.messageBox;
            }

            if (config.messageBoxView) {
                dialog.MessageBox.prototype.getView = function () {
                    return viewEngine.processMarkup(config.messageBoxView);
                };
            }

            if (config.messageBoxViewUrl) {
                dialog.MessageBox.setViewUrl(config.messageBoxViewUrl);
            }
        }
    };

    /**
     * @class DialogContext
     */
    dialog.addContext('default', {
        blockoutOpacity: 0.2,
        removeDelay: 200,
        /**
         * In this function, you are expected to add a DOM element to the tree which will serve as the "host" for the modal's composed view. You must add a property called host to the modalWindow object which references the dom element. It is this host which is passed to the composition module.
         * @method addHost
         * @param {Dialog} theDialog The dialog model.
         */
        addHost: function (theDialog) {
            var body = $('body');
            var blockout = $('<div class="modalBlockout"></div>')
                .css({ 'z-index': dialog.getNextZIndex(), 'opacity': this.blockoutOpacity })
                .appendTo(body);

            var host = $('<div class="modalHost"></div>')
                .css({ 'z-index': dialog.getNextZIndex() })
                .appendTo(body);

            theDialog.host = host.get(0);
            theDialog.blockout = blockout.get(0);

            if (!dialog.isOpen()) {
                theDialog.oldBodyMarginRight = body.css("margin-right");
                theDialog.oldInlineMarginRight = body.get(0).style.marginRight;

                var html = $("html");
                var oldBodyOuterWidth = body.outerWidth(true);
                var oldScrollTop = html.scrollTop();
                $("html").css("overflow-y", "hidden");
                var newBodyOuterWidth = $("body").outerWidth(true);
                body.css("margin-right", (newBodyOuterWidth - oldBodyOuterWidth + parseInt(theDialog.oldBodyMarginRight, 10)) + "px");
                html.scrollTop(oldScrollTop); // necessary for Firefox
            }
        },
        /**
         * This function is expected to remove any DOM machinery associated with the specified dialog and do any other necessary cleanup.
         * @method removeHost
         * @param {Dialog} theDialog The dialog model.
         */
        removeHost: function (theDialog) {
            $(theDialog.host).css('opacity', 0);
            $(theDialog.blockout).css('opacity', 0);

            setTimeout(function () {
                ko.removeNode(theDialog.host);
                ko.removeNode(theDialog.blockout);
            }, this.removeDelay);

            if (!dialog.isOpen()) {
                var html = $("html");
                var oldScrollTop = html.scrollTop(); // necessary for Firefox.
                html.css("overflow-y", "").scrollTop(oldScrollTop);

                if (theDialog.oldInlineMarginRight) {
                    $("body").css("margin-right", theDialog.oldBodyMarginRight);
                } else {
                    $("body").css("margin-right", '');
                }
            }
        },
        attached: function (view) {
            //To prevent flickering in IE8, we set visibility to hidden first, and later restore it
            $(view).css("visibility", "hidden");
        },
        /**
         * This function is called after the modal is fully composed into the DOM, allowing your implementation to do any final modifications, such as positioning or animation. You can obtain the original dialog object by using `getDialog` on context.model.
         * @method compositionComplete
         * @param {DOMElement} child The dialog view.
         * @param {DOMElement} parent The parent view.
         * @param {object} context The composition context.
         */
        compositionComplete: function (child, parent, context) {
            var theDialog = dialog.getDialog(context.model);
            var $child = $(child);
            var loadables = $child.find("img").filter(function () {
                //Remove images with known width and height
                var $this = $(this);
                return !(this.style.width && this.style.height) && !($this.attr("width") && $this.attr("height"));
            });

            $child.data("predefinedWidth", $child.get(0).style.width);

            var setDialogPosition = function (childView, objDialog) {
                //Setting a short timeout is need in IE8, otherwise we could do this straight away
                setTimeout(function () {
                    var $childView = $(childView);

                    objDialog.context.reposition(childView);

                    $(objDialog.host).css('opacity', 1);
                    $childView.css("visibility", "visible");

                    $childView.find('.autofocus').first().focus();
                }, 1);
            };

            setDialogPosition(child, theDialog);
            loadables.load(function () {
                setDialogPosition(child, theDialog);
            });

            if ($child.hasClass('autoclose') || context.model.autoclose) {
                $(theDialog.blockout).click(function () {
                    theDialog.close();
                });
            }
        },
        /**
         * This function is called to reposition the model view.
         * @method reposition
         * @param {DOMElement} view The dialog view.
         */
        reposition: function (view) {
            var $view = $(view),
                $window = $(window);

            //We will clear and then set width for dialogs without width set 
            if (!$view.data("predefinedWidth")) {
                $view.css({ width: '' }); //Reset width
            }
            var width = $view.outerWidth(false),
                height = $view.outerHeight(false),
                windowHeight = $window.height() - 10, //leave at least 10 pixels free
                windowWidth = $window.width() - 10, //leave at least 10 pixels free
                constrainedHeight = Math.min(height, windowHeight),
                constrainedWidth = Math.min(width, windowWidth);

            $view.css({
                'margin-top': (-constrainedHeight / 2).toString() + 'px',
                'margin-left': (-constrainedWidth / 2).toString() + 'px'
            });

            if (height > windowHeight) {
                $view.css("overflow-y", "auto").outerHeight(windowHeight);
            } else {
                $view.css({
                    "overflow-y": "",
                    "height": ""
                });
            }

            if (width > windowWidth) {
                $view.css("overflow-x", "auto").outerWidth(windowWidth);
            } else {
                $view.css("overflow-x", "");

                if (!$view.data("predefinedWidth")) {
                    //Ensure the correct width after margin-left has been set
                    $view.outerWidth(constrainedWidth);
                } else {
                    $view.css("width", $view.data("predefinedWidth"));
                }
            }
        }
    });

    return dialog;
});

/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * Enables common http request scenarios.
 * @module http
 * @requires jquery
 * @requires knockout
 */
define('plugins/http',['jquery', 'knockout'], function ($, ko) {
    /**
     * @class HTTPModule
     * @static
     */
    return {
        /**
         * The name of the callback parameter to inject into jsonp requests by default.
         * @property {string} callbackParam
         * @default callback
         */
        callbackParam: 'callback',
        /**
         * Converts the data to JSON.
         * @method toJSON
         * @param {object} data The data to convert to JSON.
         * @return {string} JSON.
         */
        toJSON: function(data) {
            return ko.toJSON(data);
        },
        /**
         * Makes an HTTP GET request.
         * @method get
         * @param {string} url The url to send the get request to.
         * @param {object} [query] An optional key/value object to transform into query string parameters.
         * @param {object} [headers] The data to add to the request header.  It will be converted to JSON. If the data contains Knockout observables, they will be converted into normal properties before serialization.
         * @return {Promise} A promise of the get response data.
         */
        get: function (url, query, headers) {
            return $.ajax(url, { data: query, headers: ko.toJS(headers) });
        },
        /**
         * Makes an JSONP request.
         * @method jsonp
         * @param {string} url The url to send the get request to.
         * @param {object} [query] An optional key/value object to transform into query string parameters.
         * @param {string} [callbackParam] The name of the callback parameter the api expects (overrides the default callbackParam).
         * @param {object} [headers] The data to add to the request header.  It will be converted to JSON. If the data contains Knockout observables, they will be converted into normal properties before serialization.
         * @return {Promise} A promise of the response data.
         */
        jsonp: function (url, query, callbackParam, headers) {
            if (url.indexOf('=?') == -1) {
                callbackParam = callbackParam || this.callbackParam;

                if (url.indexOf('?') == -1) {
                    url += '?';
                } else {
                    url += '&';
                }

                url += callbackParam + '=?';
            }

            return $.ajax({
                url: url,
                dataType: 'jsonp',
                data: query,
                headers: ko.toJS(headers)
            });
        },
        /**
         * Makes an HTTP PUT request.
         * @method put
         * @param {string} url The url to send the put request to.
         * @param {object} data The data to put. It will be converted to JSON. If the data contains Knockout observables, they will be converted into normal properties before serialization.
         * @param {object} [headers] The data to add to the request header.  It will be converted to JSON. If the data contains Knockout observables, they will be converted into normal properties before serialization.
         * @return {Promise} A promise of the response data.
         */
        put:function(url, data, headers) {
            return $.ajax({
                url: url,
                data: this.toJSON(data),
                type: 'PUT',
                contentType: 'application/json',
                dataType: 'json',
                headers: ko.toJS(headers)
            });
        },
        /**
         * Makes an HTTP POST request.
         * @method post
         * @param {string} url The url to send the post request to.
         * @param {object} data The data to post. It will be converted to JSON. If the data contains Knockout observables, they will be converted into normal properties before serialization.
         * @param {object} [headers] The data to add to the request header.  It will be converted to JSON. If the data contains Knockout observables, they will be converted into normal properties before serialization.
         * @return {Promise} A promise of the response data.
         */
        post: function (url, data, headers) {
            return $.ajax({
                url: url,
                data: this.toJSON(data),
                type: 'POST',
                contentType: 'application/json',
                dataType: 'json',
                headers: ko.toJS(headers)
            });
        },
        /**
         * Makes an HTTP DELETE request.
         * @method remove
         * @param {string} url The url to send the delete request to.
         * @param {object} [query] An optional key/value object to transform into query string parameters.
         * @param {object} [headers] The data to add to the request header.  It will be converted to JSON. If the data contains Knockout observables, they will be converted into normal properties before serialization.
         * @return {Promise} A promise of the get response data.
         */
        remove:function(url, query, headers) {
            return $.ajax({
                url: url,
                data: query,
                type: 'DELETE',
                headers: ko.toJS(headers)
            });
        }
    };
});

/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * Enables automatic observability of plain javascript object for ES5 compatible browsers. Also, converts promise properties into observables that are updated when the promise resolves.
 * @module observable
 * @requires system
 * @requires binder
 * @requires knockout
 */
define('plugins/observable',['durandal/system', 'durandal/binder', 'knockout'], function(system, binder, ko) {
    var observableModule,
        toString = Object.prototype.toString,
        nonObservableTypes = ['[object Function]', '[object String]', '[object Boolean]', '[object Number]', '[object Date]', '[object RegExp]'],
        observableArrayMethods = ['remove', 'removeAll', 'destroy', 'destroyAll', 'replace'],
        arrayMethods = ['pop', 'reverse', 'sort', 'shift', 'slice'],
        additiveArrayFunctions = ['push', 'unshift'],
        es5Functions = ['filter', 'map', 'reduce', 'reduceRight', 'forEach', 'every', 'some'],
        arrayProto = Array.prototype,
        observableArrayFunctions = ko.observableArray.fn,
        logConversion = false,
        changeDetectionMethod = undefined,
        skipPromises = false,
        shouldIgnorePropertyName;

    /**
     * You can call observable(obj, propertyName) to get the observable function for the specified property on the object.
     * @class ObservableModule
     */

    if (!('getPropertyDescriptor' in Object)) {
        var getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
        var getPrototypeOf = Object.getPrototypeOf;

        Object['getPropertyDescriptor'] = function(o, name) {
            var proto = o, descriptor;

            while(proto && !(descriptor = getOwnPropertyDescriptor(proto, name))) {
                proto = getPrototypeOf(proto);
            }

            return descriptor;
        };
    }

    function defaultShouldIgnorePropertyName(propertyName){
        var first = propertyName[0];
        return first === '_' || first === '$' || (changeDetectionMethod && propertyName === changeDetectionMethod);
    }

    function isNode(obj) {
        return !!(obj && obj.nodeType !== undefined && system.isNumber(obj.nodeType));
    }

    function canConvertType(value) {
        if (!value || isNode(value) || value.ko === ko || value.jquery) {
            return false;
        }

        var type = toString.call(value);

        return nonObservableTypes.indexOf(type) == -1 && !(value === true || value === false);
    }

    function createLookup(obj) {
        var value = {};

        Object.defineProperty(obj, "__observable__", {
            enumerable: false,
            configurable: false,
            writable: false,
            value: value
        });

        return value;
    }

    function makeObservableArray(original, observable, hasChanged) {
        var lookup = original.__observable__, notify = true;

        if(lookup && lookup.__full__){
            return;
        }

        lookup = lookup || createLookup(original);
        lookup.__full__ = true;

        es5Functions.forEach(function (methodName) {
            observable[methodName] = function () {
                return arrayProto[methodName].apply(original, arguments);
            };
        });

        observableArrayMethods.forEach(function(methodName) {
            original[methodName] = function() {
                notify = false;
                var methodCallResult = observableArrayFunctions[methodName].apply(observable, arguments);
                notify = true;
                return methodCallResult;
            };
        });

        arrayMethods.forEach(function(methodName) {
            original[methodName] = function() {
                if(notify){
                    observable.valueWillMutate();
                }

                var methodCallResult = arrayProto[methodName].apply(original, arguments);

                if(notify){
                    observable.valueHasMutated();
                }

                return methodCallResult;
            };
        });

        additiveArrayFunctions.forEach(function(methodName){
            original[methodName] = function() {
                for (var i = 0, len = arguments.length; i < len; i++) {
                    convertObject(arguments[i], hasChanged);
                }

                if(notify){
                    observable.valueWillMutate();
                }

                var methodCallResult = arrayProto[methodName].apply(original, arguments);

                if(notify){
                    observable.valueHasMutated();
                }

                return methodCallResult;
            };
        });

        original['splice'] = function() {
            for (var i = 2, len = arguments.length; i < len; i++) {
                convertObject(arguments[i], hasChanged);
            }

            if(notify){
                observable.valueWillMutate();
            }

            var methodCallResult = arrayProto['splice'].apply(original, arguments);

            if(notify){
                observable.valueHasMutated();
            }

            return methodCallResult;
        };

        for (var i = 0, len = original.length; i < len; i++) {
            convertObject(original[i], hasChanged);
        }
    }

    /**
     * Converts an entire object into an observable object by re-writing its attributes using ES5 getters and setters. Attributes beginning with '_' or '$' are ignored.
     * @method convertObject
     * @param {object} obj The target object to convert.
     */
    function convertObject(obj, hasChanged) {
        var lookup, value;

        if (changeDetectionMethod) {
            if(obj && obj[changeDetectionMethod]) {
                if (hasChanged) {
                    hasChanged = hasChanged.slice(0);
                } else {
                    hasChanged = [];
                }
                hasChanged.push(obj[changeDetectionMethod]);
            }
        }

        if(!canConvertType(obj)){
            return;
        }

        lookup = obj.__observable__;

        if(lookup && lookup.__full__){
            return;
        }

        lookup = lookup || createLookup(obj);
        lookup.__full__ = true;

        if (system.isArray(obj)) {
            var observable = ko.observableArray(obj);
            makeObservableArray(obj, observable, hasChanged);
        } else {
            for (var propertyName in obj) {
                if(shouldIgnorePropertyName(propertyName)){
                    continue;
                }

                if (!lookup[propertyName]) {
                    var descriptor = Object.getPropertyDescriptor(obj, propertyName);
                    if (descriptor && (descriptor.get || descriptor.set)) {
                        defineProperty(obj, propertyName, {
                            get:descriptor.get,
                            set:descriptor.set
                        });
                    } else {
                        value = obj[propertyName];

                        if(!system.isFunction(value)) {
                            convertProperty(obj, propertyName, value, hasChanged);
                        }
                    }
                }
            }
        }

        if(logConversion) {
            system.log('Converted', obj);
        }
    }

    function innerSetter(observable, newValue, isArray) {
        //if this was originally an observableArray, then always check to see if we need to add/replace the array methods (if newValue was an entirely new array)
        if (isArray) {
            if (!newValue) {
                //don't allow null, force to an empty array
                newValue = [];
                makeObservableArray(newValue, observable);
            }
            else if (!newValue.destroyAll) {
                makeObservableArray(newValue, observable);
            }
        } else {
            convertObject(newValue);
        }

        //call the update to the observable after the array as been updated.
        observable(newValue);
    }

    /**
     * Converts a normal property into an observable property using ES5 getters and setters.
     * @method convertProperty
     * @param {object} obj The target object on which the property to convert lives.
     * @param {string} propertyName The name of the property to convert.
     * @param {object} [original] The original value of the property. If not specified, it will be retrieved from the object.
     * @return {KnockoutObservable} The underlying observable.
     */
    function convertProperty(obj, propertyName, original, hasChanged) {
        var observable,
            isArray,
            lookup = obj.__observable__ || createLookup(obj);

        if(original === undefined){
            original = obj[propertyName];
        }

        if (system.isArray(original)) {
            observable = ko.observableArray(original);
            makeObservableArray(original, observable, hasChanged);
            isArray = true;
        } else if (typeof original == "function") {
            if(ko.isObservable(original)){
                observable = original;
            }else{
                return null;
            }
        } else if(!skipPromises && system.isPromise(original)) {
            observable = ko.observable();

            original.then(function (result) {
                if(system.isArray(result)) {
                    var oa = ko.observableArray(result);
                    makeObservableArray(result, oa, hasChanged);
                    result = oa;
                }

                observable(result);
            });
        } else {
            observable = ko.observable(original);
            convertObject(original, hasChanged);
        }

        if (hasChanged && hasChanged.length > 0) {
            hasChanged.forEach(function (func) {
                if (system.isArray(original)) {
                    observable.subscribe(function (arrayChanges) {
                        func(obj, propertyName, null, arrayChanges);
                    }, null, "arrayChange");
                } else {
                    observable.subscribe(function (newValue) {
                        func(obj, propertyName, newValue, null);
                    });
                }
            });
        }

        Object.defineProperty(obj, propertyName, {
            configurable: true,
            enumerable: true,
            get: observable,
            set: ko.isWriteableObservable(observable) ? (function (newValue) {
                if (newValue && system.isPromise(newValue) && !skipPromises) {
                    newValue.then(function (result) {
                        innerSetter(observable, result, system.isArray(result));
                    });
                } else {
                    innerSetter(observable, newValue, isArray);
                }
            }) : undefined
        });

        lookup[propertyName] = observable;
        return observable;
    }

    /**
     * Defines a computed property using ES5 getters and setters.
     * @method defineProperty
     * @param {object} obj The target object on which to create the property.
     * @param {string} propertyName The name of the property to define.
     * @param {function|object} evaluatorOrOptions The Knockout computed function or computed options object.
     * @return {KnockoutObservable} The underlying computed observable.
     */
    function defineProperty(obj, propertyName, evaluatorOrOptions) {
        var computedOptions = { owner: obj, deferEvaluation: true },
            computed;

        if (typeof evaluatorOrOptions === 'function') {
            computedOptions.read = evaluatorOrOptions;
        } else {
            if ('value' in evaluatorOrOptions) {
                system.error('For defineProperty, you must not specify a "value" for the property. You must provide a "get" function.');
            }

            if (typeof evaluatorOrOptions.get !== 'function' && typeof evaluatorOrOptions.read !== 'function') {
                system.error('For defineProperty, the third parameter must be either an evaluator function, or an options object containing a function called "get".');
            }

            computedOptions.read = evaluatorOrOptions.get || evaluatorOrOptions.read;
            computedOptions.write = evaluatorOrOptions.set || evaluatorOrOptions.write;
        }

        computed = ko.computed(computedOptions);
        obj[propertyName] = computed;

        return convertProperty(obj, propertyName, computed);
    }

    observableModule = function(obj, propertyName){
        var lookup, observable, value;

        if (!obj) {
            return null;
        }

        lookup = obj.__observable__;
        if(lookup){
            observable = lookup[propertyName];
            if(observable){
                return observable;
            }
        }

        value = obj[propertyName];

        if(ko.isObservable(value)){
            return value;
        }

        return convertProperty(obj, propertyName, value);
    };

    observableModule.defineProperty = defineProperty;
    observableModule.convertProperty = convertProperty;
    observableModule.convertObject = convertObject;

    /**
     * Installs the plugin into the view model binder's `beforeBind` hook so that objects are automatically converted before being bound.
     * @method install
     */
    observableModule.install = function(options) {
        var original = binder.binding;

        binder.binding = function(obj, view, instruction) {
            if(instruction.applyBindings && !instruction.skipConversion){
                convertObject(obj);
            }

            original(obj, view);
        };

        logConversion = options.logConversion;
        if (options.changeDetection) {
            changeDetectionMethod = options.changeDetection;
        }

        skipPromises = options.skipPromises;
        shouldIgnorePropertyName = options.shouldIgnorePropertyName || defaultShouldIgnorePropertyName;
    };

    return observableModule;
});

/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * Serializes and deserializes data to/from JSON.
 * @module serializer
 * @requires system
 */
define('plugins/serializer',['durandal/system'], function(system) {
    /**
     * @class SerializerModule
     * @static
     */
    return {
        /**
         * The name of the attribute that the serializer should use to identify an object's type.
         * @property {string} typeAttribute
         * @default type
         */
        typeAttribute: 'type',
        /**
         * The amount of space to use for indentation when writing out JSON.
         * @property {string|number} space
         * @default undefined
         */
        space:undefined,
        /**
         * The default replacer function used during serialization. By default properties starting with '_' or '$' are removed from the serialized object.
         * @method replacer
         * @param {string} key The object key to check.
         * @param {object} value The object value to check.
         * @return {object} The value to serialize.
         */
        replacer: function(key, value) {
            if(key){
                var first = key[0];
                if(first === '_' || first === '$'){
                    return undefined;
                }
            }

            return value;
        },
        /**
         * Serializes the object.
         * @method serialize
         * @param {object} object The object to serialize.
         * @param {object} [settings] Settings can specify a replacer or space to override the serializer defaults.
         * @return {string} The JSON string.
         */
        serialize: function(object, settings) {
            settings = (settings === undefined) ? {} : settings;

            if(system.isString(settings) || system.isNumber(settings)) {
                settings = { space: settings };
            }

            return JSON.stringify(object, settings.replacer || this.replacer, settings.space || this.space);
        },
        /**
         * Gets the type id for an object instance, using the configured `typeAttribute`.
         * @method getTypeId
         * @param {object} object The object to serialize.
         * @return {string} The type.
         */
        getTypeId: function(object) {
            if (object) {
                return object[this.typeAttribute];
            }

            return undefined;
        },
        /**
         * Maps type ids to object constructor functions. Keys are type ids and values are functions.
         * @property {object} typeMap.
         */
        typeMap: {},
        /**
         * Adds a type id/constructor function mampping to the `typeMap`.
         * @method registerType
         * @param {string} typeId The type id.
         * @param {function} constructor The constructor.
         */
        registerType: function() {
            var first = arguments[0];

            if (arguments.length == 1) {
                var id = first[this.typeAttribute] || system.getModuleId(first);
                this.typeMap[id] = first;
            } else {
                this.typeMap[first] = arguments[1];
            }
        },
        /**
         * The default reviver function used during deserialization. By default is detects type properties on objects and uses them to re-construct the correct object using the provided constructor mapping.
         * @method reviver
         * @param {string} key The attribute key.
         * @param {object} value The object value associated with the key.
         * @param {function} getTypeId A custom function used to get the type id from a value.
         * @param {object} getConstructor A custom function used to get the constructor function associated with a type id.
         * @return {object} The value.
         */
        reviver: function(key, value, getTypeId, getConstructor) {
            var typeId = getTypeId(value);
            if (typeId) {
                var ctor = getConstructor(typeId);
                if (ctor) {
                    if (ctor.fromJSON) {
                        return ctor.fromJSON(value);
                    }

                    return new ctor(value);
                }
            }

            return value;
        },
        /**
         * Deserialize the JSON.
         * @method deserialize
         * @param {string} text The JSON string.
         * @param {object} [settings] Settings can specify a reviver, getTypeId function or getConstructor function.
         * @return {object} The deserialized object.
         */
        deserialize: function(text, settings) {
            var that = this;
            settings = settings || {};

            var getTypeId = settings.getTypeId || function(object) { return that.getTypeId(object); };
            var getConstructor = settings.getConstructor || function(id) { return that.typeMap[id]; };
            var reviver = settings.reviver || function(key, value) { return that.reviver(key, value, getTypeId, getConstructor); };

            return JSON.parse(text, reviver);
        },
        /**
         * Clone the object.
         * @method clone
         * @param {object} obj The object to clone.
         * @param {object} [settings] Settings can specify any of the options allowed by the serialize or deserialize methods.
         * @return {object} The new clone.
         */
        clone:function(obj, settings) {
            return this.deserialize(this.serialize(obj, settings), settings);
        }
    };
});

/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * Layers the widget sugar on top of the composition system.
 * @module widget
 * @requires system
 * @requires composition
 * @requires jquery
 * @requires knockout
 */
define('plugins/widget',['durandal/system', 'durandal/composition', 'jquery', 'knockout'], function(system, composition, $, ko) {
    var kindModuleMaps = {},
        kindViewMaps = {},
        bindableSettings = ['model', 'view', 'kind'],
        widgetDataKey = 'durandal-widget-data';

    function extractParts(element, settings){
        var data = ko.utils.domData.get(element, widgetDataKey);

        if(!data){
            data = {
                parts:composition.cloneNodes(ko.virtualElements.childNodes(element))
            };

            ko.virtualElements.emptyNode(element);
            ko.utils.domData.set(element, widgetDataKey, data);
        }

        settings.parts = data.parts;
    }

    /**
     * @class WidgetModule
     * @static
     */
    var widget = {
        getSettings: function(valueAccessor) {
            var settings = ko.utils.unwrapObservable(valueAccessor()) || {};

            if (system.isString(settings)) {
                return { kind: settings };
            }

            for (var attrName in settings) {
                if (ko.utils.arrayIndexOf(bindableSettings, attrName) != -1) {
                    settings[attrName] = ko.utils.unwrapObservable(settings[attrName]);
                } else {
                    settings[attrName] = settings[attrName];
                }
            }

            return settings;
        },
        /**
         * Creates a ko binding handler for the specified kind.
         * @method registerKind
         * @param {string} kind The kind to create a custom binding handler for.
         */
        registerKind: function(kind) {
            ko.bindingHandlers[kind] = {
                init: function() {
                    return { controlsDescendantBindings: true };
                },
                update: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
                    var settings = widget.getSettings(valueAccessor);
                    settings.kind = kind;
                    extractParts(element, settings);
                    widget.create(element, settings, bindingContext, true);
                }
            };

            ko.virtualElements.allowedBindings[kind] = true;
            composition.composeBindings.push(kind + ':');
        },
        /**
         * Maps views and module to the kind identifier if a non-standard pattern is desired.
         * @method mapKind
         * @param {string} kind The kind name.
         * @param {string} [viewId] The unconventional view id to map the kind to.
         * @param {string} [moduleId] The unconventional module id to map the kind to.
         */
        mapKind: function(kind, viewId, moduleId) {
            if (viewId) {
                kindViewMaps[kind] = viewId;
            }

            if (moduleId) {
                kindModuleMaps[kind] = moduleId;
            }
        },
        /**
         * Maps a kind name to it's module id. First it looks up a custom mapped kind, then falls back to `convertKindToModulePath`.
         * @method mapKindToModuleId
         * @param {string} kind The kind name.
         * @return {string} The module id.
         */
        mapKindToModuleId: function(kind) {
            return kindModuleMaps[kind] || widget.convertKindToModulePath(kind);
        },
        /**
         * Converts a kind name to it's module path. Used to conventionally map kinds who aren't explicitly mapped through `mapKind`.
         * @method convertKindToModulePath
         * @param {string} kind The kind name.
         * @return {string} The module path.
         */
        convertKindToModulePath: function(kind) {
            return 'widgets/' + kind + '/viewmodel';
        },
        /**
         * Maps a kind name to it's view id. First it looks up a custom mapped kind, then falls back to `convertKindToViewPath`.
         * @method mapKindToViewId
         * @param {string} kind The kind name.
         * @return {string} The view id.
         */
        mapKindToViewId: function(kind) {
            return kindViewMaps[kind] || widget.convertKindToViewPath(kind);
        },
        /**
         * Converts a kind name to it's view id. Used to conventionally map kinds who aren't explicitly mapped through `mapKind`.
         * @method convertKindToViewPath
         * @param {string} kind The kind name.
         * @return {string} The view id.
         */
        convertKindToViewPath: function(kind) {
            return 'widgets/' + kind + '/view';
        },
        createCompositionSettings: function(element, settings) {
            if (!settings.model) {
                settings.model = this.mapKindToModuleId(settings.kind);
            }

            if (!settings.view) {
                settings.view = this.mapKindToViewId(settings.kind);
            }

            settings.preserveContext = true;
            settings.activate = true;
            settings.activationData = settings;
            settings.mode = 'templated';

            return settings;
        },
        /**
         * Creates a widget.
         * @method create
         * @param {DOMElement} element The DOMElement or knockout virtual element that serves as the target element for the widget.
         * @param {object} settings The widget settings.
         * @param {object} [bindingContext] The current binding context.
         */
        create: function(element, settings, bindingContext, fromBinding) {
            if(!fromBinding){
                settings = widget.getSettings(function() { return settings; }, element);
            }

            var compositionSettings = widget.createCompositionSettings(element, settings);

            composition.compose(element, compositionSettings, bindingContext);
        },
        /**
         * Installs the widget module by adding the widget binding handler and optionally registering kinds.
         * @method install
         * @param {object} config The module config. Add a `kinds` array with the names of widgets to automatically register. You can also specify a `bindingName` if you wish to use another name for the widget binding, such as "control" for example.
         */
        install:function(config){
            config.bindingName = config.bindingName || 'widget';

            if(config.kinds){
                var toRegister = config.kinds;

                for(var i = 0; i < toRegister.length; i++){
                    widget.registerKind(toRegister[i]);
                }
            }

            ko.bindingHandlers[config.bindingName] = {
                init: function() {
                    return { controlsDescendantBindings: true };
                },
                update: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
                    var settings = widget.getSettings(valueAccessor);
                    extractParts(element, settings);
                    widget.create(element, settings, bindingContext, true);
                }
            };

            composition.composeBindings.push(config.bindingName + ':');
            ko.virtualElements.allowedBindings[config.bindingName] = true;
        }
    };

    return widget;
});

/**
 * Durandal 2.1.0 Copyright (c) 2012 Blue Spire Consulting, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://durandaljs.com or https://github.com/BlueSpire/Durandal for details.
 */
/**
 * The entrance transition module.
 * @module entrance
 * @requires system
 * @requires composition
 * @requires jquery
 */
define('transitions/entrance',['durandal/system', 'durandal/composition', 'jquery'], function(system, composition, $) {
    var fadeOutDuration = 100;
    var endValues = {
        left: '0px',
        opacity: 1
    };
    var clearValues = {
        left: '',
        top: '',
        right: '',
        bottom:'',
        position:'',
        opacity: ''
    };

    var isIE = navigator.userAgent.match(/Trident/) || navigator.userAgent.match(/MSIE/);

    var animation = false,
        domPrefixes = 'Webkit Moz O ms Khtml'.split(' '),
        elm = document.createElement('div');

    if(elm.style.animationName !== undefined) {
        animation = true;
    }

    if(!animation) {
        for(var i = 0; i < domPrefixes.length; i++) {
            if(elm.style[domPrefixes[i] + 'AnimationName'] !== undefined) {
                animation = true;
                break;
            }
        }
    }

    if(animation) {
        if(isIE){
            system.log('Using CSS3/jQuery mixed animations.');
        }else{
            system.log('Using CSS3 animations.');
        }
    } else {
        system.log('Using jQuery animations.');
    }

    function removeAnimationClasses(ele, fadeOnly){
        ele.classList.remove(fadeOnly ? 'entrance-in-fade' : 'entrance-in');
        ele.classList.remove('entrance-out');
    }

    /**
     * @class EntranceModule
     * @constructor
     */
    var entrance = function(context) {
        return system.defer(function(dfd) {
            function endTransition() {
                dfd.resolve();
            }

            function scrollIfNeeded() {
                if (!context.keepScrollPosition) {
                    $(document).scrollTop(0);
                }
            }

            if (!context.child) {
                $(context.activeView).fadeOut(fadeOutDuration, endTransition);
            } else {
                var duration = context.duration || 500;
                var $child = $(context.child);
                var fadeOnly = !!context.fadeOnly;
                var startValues = {
                    display: 'block',
                    opacity: 0,
                    position: 'absolute',
                    left: fadeOnly || animation ? '0px' : '20px',
                    right: 0,
                    top: 0,
                    bottom: 0
                };

                function startTransition() {
                    scrollIfNeeded();
                    context.triggerAttach();

                    if (animation) {
                        removeAnimationClasses(context.child, fadeOnly);
                        context.child.classList.add(fadeOnly ? 'entrance-in-fade' : 'entrance-in');
                        setTimeout(function () {
                            removeAnimationClasses(context.child, fadeOnly);
                            if(context.activeView){
                                removeAnimationClasses(context.activeView, fadeOnly);
                            }
                            $child.css(clearValues);
                            endTransition();
                        }, duration);
                    } else {
                        $child.animate(endValues, {
                            duration: duration,
                            easing: 'swing',
                            always: function() {
                                $child.css(clearValues);
                                endTransition();
                            }
                        });
                    }
                }

                $child.css(startValues);

                if(context.activeView) {
                    if (animation && !isIE) {
                        removeAnimationClasses(context.activeView, fadeOnly);
                        context.activeView.classList.add('entrance-out');
                        setTimeout(startTransition, fadeOutDuration);
                    } else {
                        $(context.activeView).fadeOut({ duration: fadeOutDuration, always: startTransition });
                    }
                } else {
                    startTransition();
                }
            }
        }).promise();
    };

    return entrance;
});

define('text',{load: function(id){throw new Error("Dynamic load not allowed: " + id);}});
define('text!views/about.html',[],function () { return '<section class="row" id="about">\r\n\t<div class="col-lg-8 col-lg-offset-2">\r\n\t\t<div class="col-sm-12">\r\n\t\t\t<h1 id="message">Gadgets, fashion, entertainment, cats<span>-Just Kidding, for now...-</span>, and collectibles</h1>\r\n\t\t</div>\r\n\r\n\t\t<div class="col-sm-8 col-sm-offset-2 col-lg-6 col-lg-offset-3">\r\n\t\t\t<p class="statement">\r\n\t\t\tWe had a hobby of selling things online, using our dorm at <a href="https://en.wikipedia.org/wiki/Michigan_State_University">MSU</a> \r\n\t\t\tas a warehouse. It was a small operation. Linksys routers and the occasional burner. selling on Amazon was so novel to us that we \r\n\t\t\tthought it was the coolest thing even though we hardly made money. But our operation matured. \r\n\t\t\tWe had moved from the dorms tp a house. We were shipping a dozen 50 pound boxes twice a week. \r\n\t\t\tThe house had a security camera. The UPS employees passive-aggresively coerced us into helping load and unload our boxes. We \r\n\t\t\tevaded them by going out for pizza when they came. It was undeniable. We had a small business.\r\n\r\n\t\t\t<br>\r\n\t\t\t<br>\r\n\r\n\t\t\tAfter graduation, yes we finished unlike the cool kids, we decided that the status quo wasn\'t enough. We didn\'t want to just get "jobs" \r\n\t\t\tor own "businesses" We wanted to be make an impact! \r\n\t\t\tWe wanted to save the world. We wanted to be super heroes. So we moved to the only logical place to do that. We moved to The Bay, where people obviate economic and social inequality \r\n\t\t\tfrom the most unaffordable metropolis in the world!\r\n\t\t\t\r\n\t\t\t<br>\r\n\t\t\t<br>\r\n\r\n\t\t\tThe DPC isn\'t just some startup full of craft beer drinking, slacklining millennials with nothing palpable to contribute. We actually do and mean business! \r\n\t\t\tWe are an innovative creative group of Michiganders who are spreading the Detroit quality one package at a time.\r\n\r\n\t\t\t<br>\r\n\t\t\t<br>\r\n\r\n\t\t\tDue to recent global cybersecurity concerns our website doesn\'t offer e-commerce currently, but will soon! We are building our secure e-store, as you read this, line by line of code. In the meantime you can securely shop with us through our\r\n\t\t\t<a href="http://www.amazon.com/gp/aag/main?ie=UTF8&asin=&seller=A13ZDU6VPG0TGQ" target="_blank">Amazon</a> and <a href="https://squareup.com/market/detroit-packing-co" target="_blank">Square</a> \r\n\t\t\tstorefronts. Make sure to leave feedback, whether it be good or bad; we want to \r\n\t\t\tlearn from you.\r\n\r\n\t\t\t<br>\r\n\t\t\t<br>\r\n\r\n\t\t\tIf you need a job and live around the Bay Area, then click <a href="http://sfbay.craigslist.org/search/jjj" target="_blank">here</a>.\r\n\r\n\t\t\t<br>\r\n\t\t\t<br>\r\n\r\n\t\t\tBecause we don\'t have time for people who need jobs, we\'re looking for people who <span class="emphasis">want</span> them!\r\n\t\t\t If this sounds like you then you might make a good \r\n\t\t\t<a href="#careers">addition to our team.</a>\r\n\t\t\t</p>\r\n\t\t</div>\r\n\t</div>\r\n</section>\r\n\r\n<footer data-bind="compose: \'viewmodels/footer\'"></footer>';});

define('text!views/careers.html',[],function () { return '<section class="row" id="careers">\r\n\t<div class="row">\r\n\t\t<div class="col-lg-8 col-lg-offset-2">\r\n\t\t\t<div class="col-sm-4">\r\n\t\t\t\t<h2>DESTINATION:</h2>\r\n\t\t\t</div>\r\n\r\n\t\t\t<div class="col-sm-8">\r\n\t\t\t\t<h2 id="redwoodcity">\r\n\t\t\t\t\t<span style="color:red;">RED</span>WOOD CITY\r\n\t\t\t\t</h2>\r\n\t\t\t</div>\r\n\r\n\t\t\t<div class="row">\r\n\t\t\t\t<div class="col-sm-4">\r\n\t\t\t\t\t<blockquote>"Climate Best By Government Test"</blockquote>\r\n\t\t\t\t</div>\r\n\r\n\t\t\t\t<div class="col-sm-8">\r\n\t\t\t\t\t<p class="statement">\r\n\t\t\t\t\t\tWant to live at the heart of the heart of The Bay?\r\n\t\t\t\t\t\tWe have the best climate according to government tests! \r\n\t\t\t\t\t\tWhy would you live and work anywhere else?\r\n\r\n\t\t\t\t\t\t<br>\r\n\t\t\t\t\t\t<br>\r\n\r\n\t\t\t\t\t\tWe love our employees and they love us. It\'s not uncommon for \r\n\t\t\t\t\t\tour team to discuss philosophy while kicking back a couple craft beers. Of \r\n\t\t\t\t\t\tcourse after satisfying our customers.\r\n\t\t\t\t\t\t<br>\r\n\t\t\t\t\t\t<br>\r\n\r\n\t\t\t\t\t\tWe offer competitive salaries and generous benefits. We prefer to \r\n\t\t\t\t\t\thire locals. No remote work please!\r\n\t\t\t\t\t</p>\r\n\t\t\t\t</div>\r\n\t\t\t</div>\r\n\t\t</div>\r\n\t</div>\r\n\r\n\t<div class="row banner-jobs">\r\n\t\t<div class="col-lg-8 col-lg-offset-2">\r\n\t\t\t<div class="col-sm-4">\r\n\t\t\t\t<h5>We love</h5>\r\n\t\t\t</div>\r\n\t\t\t<div class="col-sm-8">\r\n\t\t\t\t<ul>\r\n\t\t\t\t\t<li>Culture</li>\r\n\t\t\t\t\t<li>Craft Beer</li>\r\n\t\t\t\t\t<li>Ping Pong</li>\r\n\t\t\t\t\t<li>Foosball</li>\r\n\t\t\t\t\t<li>Cats</li>\r\n\t\t\t\t\t<li>Marketing Savvy</li>\r\n\t\t\t\t\t<li>Innovation</li>\r\n\t\t\t\t\t<li>C, C++, or Java</li>\r\n\t\t\t\t\t<li>Adobe Creative Suite</li>\r\n\t\t\t\t</ul>\r\n\t\t\t</div>\r\n\t\t</div>\r\n\t</div>\r\n\r\n\t<div class="row">\r\n\t\t<div class="col-lg-8 col-lg-offset-2">\r\n\t\t\t<div class="col-sm-4">\r\n\t\t\t\t<h5>Currently looking for:</h5>\r\n\t\t\t</div>\r\n\r\n\t\t\t<div class="col-sm-8">\r\n\t\t\t\t<h5>Sorry. We currently have no openings. Check again soon!</h5>\r\n\t\t\t</div>\r\n\t\t</div>\r\n\t</div>\r\n</section>\r\n\r\n<footer data-bind="compose: \'viewmodels/footer\'"></footer>';});

define('text!views/footer.html',[],function () { return '<section class="row" id="footer">\r\n        <img class="col-xs-12 col-sm-2 logo" src="./images/white.png" />\r\n\r\n        <div class="col-sm-10 col-md-8">\r\n                <div class="col-sm-5 col-sm-offset-2 col-md-offset-4 col-md-4" id="contact">\r\n                    <a href="mailto:info@detroitpacking.co">\r\n                        <i class="fa fa-envelope"></i> info@detroitpacking.co\r\n                    </a>\r\n                    <br>\r\n                    <a href="tel:0000000000">\r\n                        <i class="fa fa-phone"></i> 000.000.0000\r\n                    </a>\r\n                    <br>\r\n                    <br>\r\n                    <a href="http://www.amazon.com/gp/aag/main?ie=UTF8&asin=&seller=A13ZDU6VPG0TGQ">\r\n                        Amazon\r\n                    </a>\r\n                    <br>\r\n                    <a href="https://squareup.com/market/detroit-packing-co">\r\n                        Square\r\n                    </a>\r\n\r\n                </div>\r\n                \r\n                <ul class="col-sm-5 col-md-4" id="site-map" data-bind="foreach: router.routes">\r\n                    <li data-bind="css: { active: isActive }">\r\n                        <a data-bind="attr: { href: hash }, text: title"></a>\r\n                    </li>\r\n                </ul>\r\n        </div>\r\n</section>';});

define('text!views/home.html',[],function () { return '<div id="carousel-example-generic" class="carousel slide col-xs-12" data-ride="carousel">\r\n    <!-- Indicators -->\r\n    <ol class="carousel-indicators" data-bind="foreach: carouselItems">\r\n      <li data-bind="attr: {\'data-target\': \'#carousel-example-generic\',\r\n                            \'data-slide-to\': $index}">\r\n      </li>\r\n    </ol>\r\n\r\n    <!-- Wrapper for slides -->\r\n    <div class="carousel-inner" role="listbox">\r\n      <!-- ko foreach: carouselItems -->\r\n      <div class="item" data-bind="css: { active: $index() == 0 }">\r\n        <img data-bind="attr {src: img}" alt="...description">\r\n        <div class="carousel-caption" data-bind="text: caption"></div>\r\n      </div>\r\n      <!-- /ko -->\r\n    </div>\r\n\r\n    <!-- Controls -->\r\n    <a class="left carousel-control" href="#carousel-example-generic" role="button" data-slide="prev">\r\n      <span class="glyphicon glyphicon-chevron-left" aria-hidden="true"></span>\r\n      <span class="sr-only">Previous</span>\r\n    </a>\r\n    <a class="right carousel-control" href="#carousel-example-generic" role="button" data-slide="next">\r\n      <span class="glyphicon glyphicon-chevron-right" aria-hidden="true"></span>\r\n      <span class="sr-only">Next</span>\r\n    </a>\r\n</div>\r\n\r\n<section class="row" id="banner-statement">\r\n  <div class="col-lg-8 col-lg-offset-2">\r\n    <h1 class="text-right">\r\n      DETROIT quality service\r\n    </h1>\r\n    <h2 class="text-right">\r\n      Anywhere in the WORLD*\r\n    </h2>\r\n    <h3 class="text-right">\r\n      Based in the BAY AREA\r\n    </h3>\r\n  </div>\r\n</section>\r\n\r\n<section class="row">\r\n  <div class="col-lg-8 col-lg-offset-2">\r\n    <div class="col-sm-4 facade-mission text-center">\r\n      <h3 class=\'\'>What we do</h3>\r\n      <i class="fa fa-shopping-cart fa-4x"></i>\r\n      <p class="body-text">We purvey quality products in tech, fashion, and niche collectibles</p>\r\n    </div>\r\n    <div class="col-sm-4 facade-mission text-center">\r\n      <h3 class=\'\'>Detroit Quality</h3>\r\n      <i class="fa fa-thumbs-up fa-4x"></i>\r\n      <p class="body-text">Established in Detroit, we know quality when it comes to products and service</p>\r\n    </div>\r\n    <div class="col-sm-4 facade-mission text-center">\r\n      <h3 class="">Sustainable Practices</h3>\r\n      <i class="fa fa-heart fa-4x"></i>\r\n      <p class="body-text">We value our environmental and strive to perform \r\n        our business ethically and sustainably. We are the Detroit Packing, not Fracking, Co.\r\n      </p>\r\n    </div>\r\n  </div>\r\n</section>\r\n\r\n<section class="row">\r\n  <div class="col-lg-8 col-lg-offset-2">\r\n    <div class="col-sm-4">\r\n      Image here\r\n    </div>\r\n\r\n    <div class="col-sm-8">\r\n      <h2 class="header-primary">People love us</h2>\r\n      <p class="statement">\r\n        With a proven track record, people are satisifed with our service. Just \r\n        read our customer feedback. Others were happy with our speedy and friendly \r\n        service and we are sure that you will love us, too!\r\n      </p>\r\n    </div>\r\n  </div>\r\n</section>\r\n\r\n<footer data-bind="compose: \'viewmodels/footer\'"></footer>\r\n';});

define('text!views/shell.html',[],function () { return '<div class="container-fluid">\r\n    <nav class="navbar navbar-default navbar-fixed-top" id="main-nav" role="navigation">\r\n        <div class="col-xs-12 col-lg-8 col-lg-offset-2">\r\n            <div class="navbar-header">\r\n                <button type="button" id= "navbar-toggle" class="navbar-toggle" data-toggle="collapse" data-target="#bs-example-navbar-collapse-1">\r\n                    <span class="sr-only">Toggle Navigation</span>\r\n                    <span class="icon-bar"></span>\r\n                    <span class="icon-bar"></span>\r\n                    <span class="icon-bar"></span>\r\n                </button>\r\n                <p id="activeTitle" class="visible-xs" data-bind="text: activeItemTitle"></p>\r\n            </div>\r\n\r\n            <div class="collapse navbar-collapse" id="bs-example-navbar-collapse-1">\r\n                <ul class="nav navbar-nav" data-bind="foreach: router.navigationModel">\r\n                    <li class="needsclick" data-bind="css: { active: isActive }">\r\n                        <a class="needsclick"\r\n                        data-bind="attr: { href: hash }, text: title, click: $root.navClick"></a>\r\n                    </li>\r\n                </ul>\r\n\r\n                <ul class="nav navbar-nav navbar-right">\r\n                    <li>\r\n                        <a>\r\n                            Shop:\r\n                        </a>\r\n                    </li>\r\n                    <li>\r\n                        <a href="http://www.amazon.com/gp/aag/main?ie=UTF8&asin=&seller=A13ZDU6VPG0TGQ" target="_blank">\r\n                          <strong>Amazon</strong> \r\n                        </a>\r\n                    </li>\r\n                    <li>\r\n                        <a href="https://squareup.com/market/detroit-packing-co"\r\n                            target="_blank">\r\n                            <strong>Square</strong>\r\n                        </a>\r\n                    </li>\r\n                    <!--\r\n                    <li class="loader" data-bind="css: { active: router.isNavigating }">\r\n                        <i class="fa fa-spinner fa-spin fa-2x"></i>\r\n                    </li>\r\n                -->\r\n                </ul>\r\n            </div>\r\n        </div>\r\n    </nav>\r\n\r\n    <div class="page-host" data-bind="router: { transition:\'entrance\' }"></div>\r\n\r\n</div>';});

define('text!views/welcome.html',[],function () { return '<section>\r\n\r\n  <div id="carousel-example-generic" class="carousel slide col-md-12" data-ride="carousel">\r\n    <!-- Indicators -->\r\n    <ol class="carousel-indicators">\r\n      <li data-target="#carousel-example-generic" data-slide-to="0" class="active"></li>\r\n      <li data-target="#carousel-example-generic" data-slide-to="1"></li>\r\n      <li data-target="#carousel-example-generic" data-slide-to="2"></li>\r\n    </ol>\r\n\r\n    <!-- Wrapper for slides -->\r\n    <div class="carousel-inner" role="listbox">\r\n      <div class="item active">\r\n        <img src="http://johnrichardthompson.com/images/photographs/mackinac.jpg" alt="...">\r\n        <div class="carousel-caption">\r\n          ...\r\n        </div>\r\n      </div>\r\n      <div class="item">\r\n        <img src="http://johnrichardthompson.com/images/photographs/camcorder.jpg" alt="...">\r\n        <div class="carousel-caption">\r\n          ...\r\n        </div>\r\n      </div>\r\n      ...\r\n    </div>\r\n\r\n    <!-- Controls -->\r\n    <a class="left carousel-control" href="#carousel-example-generic" role="button" data-slide="prev">\r\n      <span class="glyphicon glyphicon-chevron-left" aria-hidden="true"></span>\r\n      <span class="sr-only">Previous</span>\r\n    </a>\r\n    <a class="right carousel-control" href="#carousel-example-generic" role="button" data-slide="next">\r\n      <span class="glyphicon glyphicon-chevron-right" aria-hidden="true"></span>\r\n      <span class="sr-only">Next</span>\r\n    </a>\r\n  </div>\r\n\r\n  <div class="col-md-8 col-md-offset-2">\r\n    Generic WEbsite for the best company ever made! Detroit PAcking Company!\r\n    Based in the Bay Area, but called the Detroit PAcking Company!!\r\n    Generic WEbsite for the best company ever made! Detroit PAcking Company!\r\n    Based in the Bay Area, but called the Detroit PAcking Company!!\r\n  </div>\r\n    \r\n</section>';});

require(["main"]);
}());