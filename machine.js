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
		CODE_TYPE_CALL     : i++,
		CODE_TYPE_REGISTER : i++,
		CODE_TYPE_GOTO     : i++,
		CODE_TYPE_RETURN   : i++,
		CODE_TYPE_VALUES   : i++,

		EXEC_RUNNING       : i++,
		EXEC_HALTED        : i++,
		EXEC_WAITING       : i++
	}
})();

var Compiler = (function() {
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
			exec: [],  // Code to execute
			lineno: fn.lineno
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

// A simple loop-detecting object, used to check for infinite GOTO loops
// and mutual recursion.
function RepetitionDetector() {
	"use strict";

	var loop = [];

	function repdec$push(id) {
		if(loop.indexOf(id) >= 0) {
			return true;
		}
		loop.push(id);
		return false;	
	}

	function repdec$getLoop(id) {
		var startpos = loop.indexOf(id);
		if(startpos < 0) {
			return [];
		}
		// Note use of slice, not s_p_lice, here:
		return loop.slice(startpos, loop.length);
	}

	function repdec$pop() {
		var cmpid = loop.pop();
	}

	function repdec$reset() {
		loop = [];
	}	

	return {
		// Returns true if a repetition is found,
		// false otherwise. Once it returns true,
		// further pushes are disallowed.
		push : repdec$push,
		// Remove the last element in the checker.
		pop  : repdec$pop,
		// Reset the repetition checker.
		reset: repdec$reset,
		// Get the loop state
		getLoop: repdec$getLoop
	};
}

// Object representing a function call
// _fn is the function name
// _in is the argument list
// _out is either zero to unrestrict the return tuple size, or
//    positive with the expected length of returned tuple.
function FunctionCall(_fn, _in, _out) {
	"use strict";

	// Returns true if the function name and signature match,
	// throws an exception if the name matches but signatures do not,
	// returns false otherwise.
	function fncall$match(other) {
		if(_fn != other.name)
			return false;
		if(_in.length != other.args.length ||  (_out == 0 || _out != other.rets.length))
			throw new MachineException("Function \"" + _fn + "\" with correct name but incorrect signature found");
		return true;
	}

	return {
		fn: fn, 
		in: _in,
		out: _out,
		matches: fncall$match
	};
}

function MachineException(text, location) {
	this.message = text;
	this.location = location;
};


// A Machine object represents the result of running a single function. It relies
// on a MachineRunner object to handle recursion and the stack.
//   compiled: The code object 
//    options: configuration options for the machine
//     - exceptionOnNegativeRegister : Throw an exception if a 0-valued register is decremented.
function Machine(compiled, args, options) {
	"use strict";

	function abacm$except(text, location) {
		throw new MachineException(text, location);
	}

	var code = compiled;
	var opts = options;
	var registers = [];
	var curr = 0;
	var state = MACHINE_CONSTANTS.EXEC_RUNNING;
	var loopDetector = RepetitionDetector();
	
	function abacm$init(compiled, args) {
		// Initialize the registers
		for(var i = 0; i < code.regs.length; ++i) {
			registers.push(0);
		}
		
		// Check the argument array
		if(code.args.length != args.length)
			abacm$except("Incorrect number of arguments to function.", code.lineno);
		// Copy the arguments into the registers.
		for(var i = 0; i < code.args.length; ++i) {
			if(args[i] < 0) {
				abacm$except("Negative argument to function.", code.lineno);
			}
			registers[code.args[i]] = args[i];
		}
	}

	// Advances the state of the machine by one step, accepts parameters:
	//  returns: returns by the recursive function call, if one is expected. null otherwise.
	function abacm$next(returns) {
		var rv = {}; // Return value
		var cL = code.exec[curr]; // The line to evaluate at this step.

		// Check the current state and evolve the machine:
		if (state == MACHINE_CONSTANTS.EXEC_HALTED) {
			abacm$except("Attempting to run halted machine.", cL.lineno);
		} else if (state == MACHINE_CONSTANTS.EXEC_WAITING) {
			// We've been invoked after sending a request to call a function.
			// Make sure that we have the desired values.
			if(cL.type != MACHINE_CONSTANTS.CODE_TYPE_CALL) 
				abacm$except("Internal error, in EXEC_WAITING state but not at a function.", cL.lineno);
			
			if(!returns) 
				abacm$except("Expected return values from function call.", cL.lineno);
			
			if(returns.length != cL.out.length)
				abacm$except("Expected " + cL.out.length + " return values from function call, " + returns.length + " received.", cL.lineno);

			// Now we copy the returned values to the appropriate registers
			for(var i = 0; i < returns.length; ++i) {
				if(returns[i] < 0)
					abacm$except("Negative value returned by " + cL.fn + " return values :" + ", ".join(returns) + ".", cL.lineno);

				registers[cL.out[i]] = returns[i];
			}

			// Excellent, we're done now! We advance `curr` to the next state and change `state`:
			curr = cL.next;
			state = MACHINE_CONSTANTS.EXEC_RUNNING;
		} else if (state == MACHINE_CONSTANTS.EXEC_RUNNING) {
			// We're expecting an null value for returns, so we enforce that.
			if(returns)
				abacm$except("Expected no return values.", cL.lineno);

			// Use the loopDetector to check if we have visited this state before,
			// without going through a branching jump.
			// Since the only branching jump is with register subtractions, we reset
			// loopDetector there.		
			if(loopDetector.push(curr))
				abacm$except("Infinite loop detected in code, see lines " + ", ".join(loopDetector.getLoop(curr)) + ".", cL.lineno);
			
			// We look at the current state and figure out what to do next based on this.
			if (cL.type == MACHINE_CONSTANTS.CODE_TYPE_CALL) {
				// Oh, goody, we need to call a function.
				fnArgs = [];
				// Populate fncall.in with the values of various argument
				for(var i=0;  i<cL.in.length; i++) {
					if(cL.in[i] < 0) {
						// If this is a value argument, decode it.
						fnArgs.push(DECODE_INTEGER(cL.in[i]));
					} else {
						// If this is a register argument, copy the value.
						fnArgs.push(registers[cL.in[i]]);
					}
				}

				// Put this in the return value.
				rv.functioncall = FunctionCall(cL.fn, fnArgs, cL.out.length);
				// Change the state to WAITING
				state = MACHINE_CONSTANTS.EXEC_WAITING;

				// We don't change the pointer curr yet, that happens
				// upon function return.

			} else if (cL.type == MACHINE_CONSTANTS.CODE_TYPE_GOTO) {
				curr = cL.next; // Go to the given line.

			} else if (cL.type == MACHINE_CONSTANTS.CODE_TYPE_REGISTER) {
				// Check if need to increment or decrement:
				if(cL.increment) { // Increment
					registers[cL.register]++;
					curr = cL.next;
				} else { // Decrement
					if(opts.exceptionOnNegativeRegister && registers[cL.register] == 0)
						abacm$except("Decrementing the zero-valued register [" + cL.register + "]", cL.lineno);
					
					// Decrement the register if positive
					if (registers[cL.register] > 0)
						registers[cL.register]--;
					
					// Branch depending on the value of the register
					if (registers[cL.register] == 0) {
						curr = cL.next_zero;
					} else {
						curr = cL.next_pos;
					}

					// Reset the infinite loop detection, because we've found a branching instruction:
					loopDetector.reset();
				}
				
			} else if (cL.type == MACHINE_CONSTANTS.CODE_TYPE_RETURN) {
				// Oh, goody! We're done with this function. We return values in 
				// rv.retval;
				rv.retval = [];
				for(var i = 0; i < code.rets.length; ++i)
					rv.retval.push(registers[code.rets[i]]);

				// And we change the state to HALTED
				state = MACHINE_CONSTANTS.EXEC_HALTED;

			} else if (cL.type == MACHINE_CONSTANTS.CODE_TYPE_VALUES) {
				// Wait, what? How did this ever make it all the way to the machine?
				abacm$except("Unexpected line type: values.", cL.lineno);
			} else {
				abacm$except("Unexpected line type.", cL.lineno);
			}
		}
		// Incorporate the state into the return value.
		rv.state = state;
		rv.lineno = code.excec[curr].lineno;
		return rv;
	}

	function abacm$set(adj) {
		abacm$except("Setting values is not supported yet.", cL.lineno);
	}

	function abacm$state() {
		// Output the current state in a nice manner, easy for the visualization system to use.
		return {
			nextline: code.exec[curr].lineno,
			registers: code.regs,
			values: registers,
			state: state
		}
	}

	abacm$init(compiled, args);
	return {
		step:     abacm$next,
		getState: abacm$state,
		set: abacm$set
	};
}

// Handles the stack, spins up a Machine object for each level 
//   allfn: an array of all compiled functions,
//   fcall: a FunctionCall object representing the function call to make.
function MachineRunner(_allfn, _fcall, _options) {
	"use strict";

	var funcs = _allfn;
	var opts = options;
	var stack = [];
	var state = MACHINE_CONSTANTS.EXEC_RUNNING;
	var recursionDetector = RepetitionDetector();
	var retval = null;

	function mrun$except(text, location) {
		throw new MachineException(text, location);
	}

	// Start a new function call, deepening the stack.
	function mrun$invokefunc(fcall) {
		// Check for recursion
		if(recursionDetector.push(fcall.fn))
			mrun$except("Attempted recursion.", fcall.lineno);

		var f = funcs.find(fcall.matches);
		if(!f)
			mrun$except("Cannot find function \"" + fcall.fn + "\".");

		// Since fcall.matches checks the function signature, we can use it without
		// further checking.
		var m = Machine(f, args, opts);
		stack.push(m);
	}

	function mrun$returnfunc() {
		recursionDetector.pop();
		stack.pop();
	}

	// Initializer, simply invokes the function.
	function mrun$init(allfn, fcall) {
		mrun$invokefunc(fcall);
	}

	function mrun$next() {
		// Get the machine corresponding to the innermost state
		var m = stack[stack.length - 1];
		// Advance it by one step, including the previous return value if one is set.
		var s = m.next(retval);
		retval = null; // Reset retval, if not already done.
		
		if(s.state == MACHINE_CONSTANTS.EXEC_RUNNING) {
			// Do nothing, the machine is still running.

		} else if(s.state == MACHINE_CONSTANTS.EXEC_WAITING) {
			// s.functioncall contains the function call that m needs to continue.
			if(!s.functioncall)
				mrun$except("Machine WAITING without a pending function call.", s.lineno);

			// Invoke the recursive function.
			mrun$invokefunc(s.functioncall);

		} else if(s.state == MACHINE_CONSTANTS.EXEC_HALTED) {
			// s.retval contains the returned value.
			if(!s.retval)
				mrun$except("Machine HALTED without a return value.", s.lineno);

			// Store the return value in retval for the next invocation.
			retval = s.retval;

			// Return the function.
			mrun$returnfunc();
		}
	}

	// Returns a state descriptor, used to render the view of
	// the inner workings of the machine.
	function mrun$state() {
		return stack.map(function(st) { return st.getState(); });
	}

	// Set a value in one of the machines.
	function mrun$set() {
		mrun$except("Setting values is not supported.", s.lineno);
	}

	mrun$init(_allfn, _fcall);
	return {
		step:     mrun$next,
		getState: mrun$state,
		set:      mrun$set
	};
}