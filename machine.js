// Abacus Machine Simulator
// Gaurav Manek
//
// machine.js compiles the parser output to an intermediate form and simulates the machine.
"use strict";


// The compiler transforms the output of the parser to an intermediate form that the machine can use.
// Encode integer values as negative numbers to allow JavaScript engines in browsers to optimize this away.
function ENCODE_INTEGER(v) { return -v-1; } 
function DECODE_INTEGER(v) { return -v-1; }

var MACHINE_CONSTANTS = (function () {
	var i = 0;
	return {
		CODE_TYPE_CALL 		: i++,
		CODE_TYPE_REGISTER 	: i++,
		CODE_TYPE_GOTO 		: i++,
		CODE_TYPE_RETURN 	: i++,
		CODE_TYPE_VALUES    : i++
	}
})();

var compiler = (function() {
	"use strict";

	function CompilerException(text, location) {
		this.message = text;
    	this.location = location;
	};

	function abacm$except(text, location) {
		throw new CompilerException(text, location);
	}

	// Takes a function specification, spits out the version in an intermediate form that the machine
	// can directly use.
	function abacm$compile(fn) {
		// Compiled form
		var rv = {
			name: fn.name,
			args: [], // The register to put the args into.
			rets: [], // The registers to return.
			deps: [], // Dependencies
			regs: [], // Registers
			exec: []  // Code to execute
		}
		var anchors = {}; // Anchor positions
		var jumpsToRewrite = [];

		// Takes an object that represents a list of arguments,
		// all of which must be numbers, not registers.
		function mapValues(rlist, obj) {
			var rv = [];
			for (var i = 0; i < rlist.length; i++) {	
				if (rlist[i].type == "integer") {
					rv.push(ENCODE_INTEGER(rlist[i].val));
				} else {
					abacm$except("Number expected, but register found.", obj.lineno);
				}
			}
			return rv;
		}

		// Takes an object that represents a function argument,
		// If it is a register, adds it to rv.regs. If not, it 
		// (depending on enforceRegisters) throws an exception
		// or encodes it as a number.
		function addRegister(robj, enforceRegisters, obj) {
			if (robj.type == "register") {
				var id = "" + robj.id;
				var idx = rv.regs.indexOf(id);
				if(idx < 0) {
					idx = rv.regs.length;
					rv.regs.push(id);
				} 
				return idx;
			} else if (enforceRegisters) {
				abacm$except("Register expected, but number found.", obj.lineno);
			} else if (robj.type == "integer") {
				return ENCODE_INTEGER(robj.val);
			}
		}

		// Get the exec number corresponding to an anchor, throwing an exception
		// if the anchor cannot be found. If the anchor is relative, this computes
		// the new line number and returns it.
		// The arguments are:
		//    anc: anchor object
		//      i: index of current line
		//     jR: instruction at line
		function getAnchor(anc, i, jR) {
			if(!anc || anc.type == "rel") {
				if (!anc || anc.val == "next") {
					return (i+1);
				} else {
					abacm$except("Unrecognized relative anchor.", jR.lineno);
				}
			} else if(anc.type == "anchor") {
				if(anchors.hasOwnProperty(anc.val)) {
					return anchors[anc.val];
				} else {
					abacm$except("Jumping to unrecognized anchor.", jR.lineno);
				}
			} else {
				abacm$except("Unrecognized anchor type.", jR.lineno);
			}
		}

		
		// Step 1: go through the arguments and return values, put them in registers;
		rv.args = fn.args.val.map(function(r){ return addRegister(r, true, fn); });
		rv.rets = fn.return.val.map(function(r){ return addRegister(r, true, fn); });

		// Step 2: go through the code and:
		//  (a) convert registers to new registers,
		//  (b) put all anchor positions in anchors, and
		//  (c) log dependencies.
		
		for (var i = 0; i < fn.body.length; i++) {
			// Process fn.body[i] 
			// (b)
			if(fn.body[i].anchor) {
				if(anchors.hasOwnProperty(fn.body[i].anchor.val)) {
					abacm$except("Multiple definition of anchor \":"+fn.body[i].anchor.val + "\".", fn.body[i].lineno);
				}
				anchors[fn.body[i].anchor.val] = rv.exec.length // Make it point to the next instruction.
			}

			// Check to see if there is any instruction here.
			if(fn.body[i].exec) {
				var e = fn.body[i].exec;
				if (e.type == "callandstore") {
					rv.exec.push({
						type: MACHINE_CONSTANTS.CODE_TYPE_CALL,
						// The input to the function call, as registers or integers
						in: e.fn.args.val.map(function(r) {
								return addRegister(r, false, fn.body[i]); 	
							}),
						// The output from the function call, only registers.
						out:e.store.val.map(function(r) {
								return addRegister(r, true, fn.body[i]); 	
							}),
						fn: e.fn.name,
						lineno: fn.body[i].lineno
					});

					var depFind = rv.deps.find(function(n){ return n.name == e.fn.name});
					if (depFind) {
						// Check if the signature is as expected.
						if(depFind.in != e.fn.args.val.length || depFind.out != e.store.val.length) {
							abacm$except("Conflicting function signature for dependency \""+ e.fn.name + "\".", fn.body[i].lineno);
						}
					} else {
						rv.deps.push({name: e.fn.name, in: e.fn.args.val.length, out: e.store.val.length });
					}
				} else if (e.type == "rchange") {
					var ep = {
						type:      MACHINE_CONSTANTS.CODE_TYPE_REGISTER,
						// Register 
						register:  addRegister(e.register, true, fn.body[i]),
						// Operation
						increment: (e.operation=="+"),
						lineno: fn.body[i].lineno
					};

					if (ep.increment) {
						ep.next = e.next;
					} else {
						ep.next_pos = e.npos;
						ep.next_zero = e.nzero;
					}
					
					rv.exec.push(ep);
				} else {
					abacm$except("Unknown instruction type "+e.type + "\".", fn.body[i].lineno);
				}
			} else if (fn.body[i].type == "goto") {
				var ep = {
					type: MACHINE_CONSTANTS.CODE_TYPE_GOTO,
					next: fn.body[i].to,
					lineno: fn.body[i].lineno
				};
				rv.exec.push(ep);
			}
		}
		// Push the return instruction to the end.
		rv.exec.push({type: MACHINE_CONSTANTS.CODE_TYPE_RETURN, lineno: fn.lineno});

		// Next, use the information in anchors to rewrite all the jumps.
		for (var i = 0; i < rv.exec.length; i++) {
			var jR = rv.exec[i];
			if(jR.type == MACHINE_CONSTANTS.CODE_TYPE_GOTO || jR.type == MACHINE_CONSTANTS.CODE_TYPE_CALL) {
				jR.next = getAnchor(jR.next, i, jR);
			} else if (jR.type == MACHINE_CONSTANTS.CODE_TYPE_REGISTER) {
				if (jR.increment) {
					jR.next = getAnchor(jR.next, i, jR);
				} else {
					jR.next_pos = getAnchor(jR.next_pos, i, jR);
					jR.next_zero = getAnchor(jR.next_zero, i, jR);
				}
			}
		}

		// Tests 
		var tests = [];

		function testFunction(l, t) {
			return {
				type: MACHINE_CONSTANTS.CODE_TYPE_CALL,
				// The input to the function call, as registers or integers
				in: mapValues(l.args),
				fn: l.name,
				lineno: t.lineno
			};
		}

		// For each test, store it in the new format, with
		// the function call in lhs, and the comparing function call
		// or list of values in rhs.

		// We enforce the "only numbers no registers" rule here.  
		for(var i = 0; i < fn.tests.length; ++i) {
			var l = fn.tests[i].lhs;
			if(l.type != "functioncall") {
				abacm$except("Expected a function call on the left-hand side.", fn.tests[i].lineno);
			}
			var lhs = testFunction(l, fn.tests[i]);

			var r = fn.tests[i].rhs;
			var rhs;
			if(r.type == "functioncall") {
				rhs = testFunction(r, fn.tests[i]);
			} else if (r.type == "arglist"){
				rhs = mapValues(r.val, fn.tests[i]);
			}
		}

		return {
			code: rv,
			tests: tests
		};
	}

	return {
		compile: abacm$compile,
		CompilerException: CompilerException
	};
})();


var machine = function(compiled) {
  "use strict";

  var code = compiled.code;



  return {
    SyntaxError: peg$SyntaxError,
    parse:       peg$parse
  };
}