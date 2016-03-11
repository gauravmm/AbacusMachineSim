// Abacus Machine Simulator
// Gaurav Manek
//
// pprint.js provides pretty-print interfaces:
//   - For code: PPCode
//   - For graphviz: PPGraph (TODO)
// Tests are not supported.
"use strict";

var PPCode = (function () {

	function PPCodeException(text, location) {
		this.message = text;
		this.location = location;
	};

	function ppc$register(fn, opts, i) {
		if(i < 0)
			return INTEGER_DECODE(i) + "";
		if(opts.keepRegisteredNames)
			return "[" + fn.regs[i] + "]";
		return "[" + (i) + "]";
	}

	function ppc$rchange(fn, opts, e) {
		var rv = ppc$register(fn, opts, e.register);
		if(e.increment) {
			rv = rv + "+";
			if(e.next) {
				rv = rv + ", " + e.next;
			}
		} else {
			rv = rv + "-";
			if(e.next_pos || e.next_zero) {
				rv = rv + ", " + (e.next_pos?e.next_pos:"next") + ", " + (e.next_zero?e.next_zero:"next");
			}
		}
		return rv;
	}

	// Return anchor labels for lines that need labelling,
	// or null otherwise. Also change nexts within code
	// accordingly.
	function ppc$findanchors(exec) {
		var ct = 1;
		var anch = exec.map((v) => null);
		exec.forEach(function (e, i) {
			if(e.type == MACHINE_CONSTANTS.CODE_TYPE_RETURN) {
				return null;
			} else if(e.type == MACHINE_CONSTANTS.CODE_TYPE_CALL) {
				throw new PPCodeException("Function calls unsupported in PPCode");
			} else {
				["next", "next_pos", "next_zero"].forEach(function (next) {
					if(e.hasOwnProperty(next)) {
						if(e[next] == i + 1) {
							e[next] = null;	
						} else {
							// If e.next does not have an anchor,
							// give it an anchor name.
							if(!anch[e[next]]){
								anch[e[next]] = (":anchor" + ct);
								ct++;
							}
							e[next] = anch[e[next]];
						}
					}
				});
			}
		});

		return anch;
	}

	function ppc$deepCopyCode(obj) {
		var temp = {};
		for (var key in obj) {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				if(Array.isArray(obj[key])) {
					temp[key] = obj[key].slice(0);
				} else {
					temp[key] = obj[key];
				}
			}
		}
		return temp;
	}


	function ppc$pp(fn, opts) {
		if(!opts)
			opts = {};

		var lines = [];

		// Function head:
		lines.push("function " + fn.name + "(" + fn.args.map((r) => ppc$register(fn, opts, r)).join(", ") + ") -> " + fn.rets.map((r) => ppc$register(fn, opts, r)).join(", ") + " {");

		// Now we need to figure out where the jumps are so we can label them.
		var exec = fn.exec.map(ppc$deepCopyCode);
		var anch = ppc$findanchors(exec);
		exec.forEach(function (e, i) {
			if(anch[i]) {
				lines.push("\t");
				lines.push("\t" + anch[i]);
			}
			var ln = "\t";
			switch(e.type) {
				case MACHINE_CONSTANTS.CODE_TYPE_CALL:
					throw new PPCodeException("Function calls unsupported in PPCode");
				case MACHINE_CONSTANTS.CODE_TYPE_VALUES:
					throw new PPCodeException("Value lists unsupported in PPCode");
				default: 
					throw new PPCodeException("Unknown line type in PPCode");

				case MACHINE_CONSTANTS.CODE_TYPE_REGISTER:
					lines.push(ln + ppc$rchange(fn, opts, e) + ";");
					break;

				case MACHINE_CONSTANTS.CODE_TYPE_GOTO:
					if (e.next) 
						lines.push(ln + "goto " + e.next + ";");
					break;

				case MACHINE_CONSTANTS.CODE_TYPE_RETURN:
				     // Nothing
			}
		});

		lines.push("}");
		return lines.join("\n");
	}

	return {
		PPCodeException: PPCodeException,
		prettyFunction: ppc$pp
	};
})();