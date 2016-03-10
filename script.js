// Abacus Machine Simulator
// Gaurav Manek
//
// script.js glues the parser and the machine simulator with the UI.

"use strict";

// Configuration
var LOGGING = true;
var TEST_DELAY = 10;
var SAVE_DELAY = 1000;

// Global variables
var editor;
var compiled = null; // Is there any compiled code ready to be run? If there is, then this contains the compiled functions. If not, its null
var runner = null; // Is there any code currently being run? If so, this contains the runner. If not, this is null;
// Compiler tests to run
var testTimer;
var saveTimer;

function $(s){
	return document.getElementById(s);
}
// From: http://stackoverflow.com/a/2901298
function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function start(){
	// Setup
	editor = CodeMirror.fromTextArea($('codeArea'), {
    	lineNumbers: true,
    	mode: "abacusmachine",
    	theme: "default",
		lineWrapping: true,
		gutters: ["CodeMirror-linenumbers", "lint"]
  	});
  	editor.on("gutterClick", handleGutterClick);
  	editor.on("change", handleChange);

  	$('runtimeOut').onclick = compileAndTest;
  	document.onkeyup = handleKeyboardShortcuts;
  	$('funcCall').onkeyup = handleDebuggerKeys;

  	loadState();
};

function setRunner(r) {
	runner = r;
	if(r) {
		$('runningView').className = "codeRunning";
		status("Loaded function " + runner.fcall.toString() + ", use step-through commands to continue.");
	} else {
		$('runningView').className = "codeNotRunning";
	}
}

// This function is invoked when someone clicks the top banner
// or hits ctrl+enter. It runs the parser, performs intermediate
// operations, and loads the code on the machine simulator.
function compileAndTest() {
	var t_start = performance.now();
	setRunner(null);
	
	try {
		// Make sure the parser is running.
		var parse = parser.parse(editor.getValue());
		if (parse.length == 0)
			throw new MachineException("No functions defined.");

		// compiled is a list of {code, tests} objects,
		// where code is the "compiled" version of each function
		// and tests is the set of tests associated with that function.
		var compiled = parse.map(p => Compiler.compile(p, { prune: true }));
		var tests = TestEngine(compiled);
		// All the functions
		var allfunc = compiled.map(function(v) { return v.code; });

		// End timer.
		// var t_end = performance.now();
		onCompile(allfunc);
		handleUnreachableLines(compiled);
		clearTimeout(testTimer);
		testTimer = setTimeout(nextTest, TEST_DELAY, tests);
	} catch (err) {
		onCompile(null);
		if (err instanceof Compiler.CompilerException || err instanceof MachineException || (err.name && err.name == "SyntaxError")) {
			error(err.message, err.location);
			clearState();
			return;
		} else {
			throw err;
		}
	}
}

// Runs one test, then schedules the running of future tests.
function nextTest(tests) {
	
	function runTestSide(fcall, t){
		var rr = MachineRunner(compiled, fcall, {});
		var outLhs = rr.run();
		if(outLhs.state == MACHINE_CONSTANTS.EXEC_HALTED) {
			return outLhs.retval;
		} else {
			return "Function " + rr.fcall.toString() + " incomplete after " + numberWithCommas(outLhs.steps) + " steps, too many iterations.";
		}
	}

	if(!tests.hasTest()) {
		var cp = tests.passed();
		var ct = tests.count;
		if(cp == ct) {
			success("Build successful: passed all " + cp + " tests.");
		} else {
			error("Build failed: passed " + cp + " out of " + ct + " tests.");
		}
		return;
	}

	var fatalError = false;

	try {
		// Run the next test
		var t = tests.next();

		var lhs = runTestSide(t.lhs.fcall, t);
		if(Array.isArray(lhs)) {
			
			var rhs;
			if(t.rhs.type == MACHINE_CONSTANTS.CODE_TYPE_CALL) {
				rhs = runTestSide(t.rhs.fcall, t);
				if(!Array.isArray(lhs)) {
					tests.status(false);
					setTestGutter(t.lineno - 1, false, lhs);
					return;
				}
			} else if(t.rhs.type == MACHINE_CONSTANTS.CODE_TYPE_VALUES) {
				rhs = t.rhs.values;
			}

			
			// Compare LHS and RHS:
			var correct = (lhs.length == rhs.length) && lhs.every(function(e, i) { return e === rhs[i]; });
			tests.status(correct);
			setTestGutter(t.lineno - 1, correct, "(" + lhs.join(", ") + ")" + (correct?" is ":" is not ") + "(" + rhs.join(", ") + ")");
		} else {
			tests.status(false);
			setTestGutter(t.lineno - 1, false, lhs);
			return;
		}
		
		// Set up the next test:
	} catch (err) {
		if (err instanceof Compiler.CompilerException || err instanceof MachineException) {
			error("Fatal error while running tests: " + err.message, err.location);
			clearState();
			fatalError = true;
		} else {
			throw err;
		}
	} finally {
		if(!fatalError) {
			testTimer = setTimeout(nextTest, TEST_DELAY, tests);
		}
	}
}

//
// Responding to state changes of the runner/compiler.
//

function onCompile(cm) {
	compiled = cm;
	if(cm) {
		$('defaultView').style.display = "none";
		$('runningView').style.display = "flex";
		clearTimeout(saveTimer);
		saveState();
	} else {
		$('defaultView').style.display = "flex";
		$('runningView').style.display = "none";
	}
	runner = null;
	resetGutter();
	clearState();
}

//
// Responding to UI events.
//

// Toolbar buttons:
function loadAndPause() {
	if(!loadFunction($('funcCall').value))
		return;
	redrawState();
}
function loadAndRun() {
	if(!loadFunction($('funcCall').value))
		return;
	runnerStep(MACHINE_CONSTANTS.DBG_RUN_TO_END);
}
function runToEnd() {
	runnerStep(MACHINE_CONSTANTS.DBG_RUN_TO_END);
}
function stepInto() {
	runnerStep(MACHINE_CONSTANTS.DBG_STEP_INTO);
}
function stepOut() {
	runnerStep(MACHINE_CONSTANTS.DBG_STEP_OUT);
}
function stepOver() {
	runnerStep(MACHINE_CONSTANTS.DBG_STEP_OVER);
}

function handleDebuggerKeys(e){	
	if(e.keyCode == 13){
		if(e.shiftKey) {
			loadAndRun();
		} else {
			loadAndPause();
		}
	}
}

function handleGutterClick(cm, n) {
	checkAndHandleBreakpoint(n);
}
function checkAndHandleBreakpoint(n) {
	var lineinfo = editor.lineInfo(n);
	if(isBreakpointOnLine(lineinfo)) {
		// It's already in the list, so we remove it.
		setBreakpoint(n, false);
		return; 
	}

	if(!compiled) {
		// If we aren't compiled yet, set an empty breakpoint.
		setBreakpoint(n, true, false); 
	} else {
		var m = n + 1; // For compatibility with the engine, enumerates starting at line 1.

		// Now we check to see if this line is elligible to be a breakpoint:
		for(var i = 0; i < compiled.length; ++i) {
			var e = compiled[i];
			if (e.lineno > m)
				return; // We've passed n, so we can return.
			
			if(e.lineno == m) {
				setBreakpoint(n, true, true);
				// The breakpoint corresponds to the function entrypoint
				// We set the triangle flag and return.
				return;
			}

			// We proceed through the breakpoints backwards, so that we can short-circuit
			// evaluation if need be.
			var lineidx = -1;
			for(var j = e.exec.length - 1; j >= 0; --j) {
				if(e.exec[j].type == MACHINE_CONSTANTS.CODE_TYPE_RETURN)
					continue;

				if(e.exec[j].lineno >= m) {
					// Oh, goody! The breakpoint is before this line, so it's probably in this function.
					lineidx = e.exec[j].lineno;
				} else {
					break; // Okay, the breakpoint 
				}
			}

			if(lineidx >= 0) {
				setBreakpoint(lineidx - 1, true, false);
				// The breakpoint corresponds to the line within the function.
				// We set the circle flag and return.
				return;
			}
		}
	}
}

function handleChange() {
	if(compiled) {
		// If the buffer was previously considered "clean"
		// remove the compiled version to mark it as dirty.
		onCompile(null); 
	}
	clearTimeout(saveTimer);
	saveTimer = setTimeout(saveState, SAVE_DELAY);
}

function handleRegisterChange(regName, v) {
	if(!runner) {
		error("Cannot change value of register when code is not running.");
	}

	try {
		runner.set([{reg: regName, val: v}]);
	} catch (err) {
		if (err instanceof Compiler.CompilerException || err instanceof MachineException) {
			error(err.message, err.location);
			return;
		} else {
			throw err;
		}
	}
}

function saveState() {
	if(localStorage)
		localStorage.setItem("CodeString", editor.getValue());
}

function loadState() {
	if(localStorage) {
		var cs = localStorage.getItem("CodeString");
		if(cs && cs.trim().length > 0) {
			editor.setValue(cs);
		}
	}
}


// 
// Compiler/Runner interaction
//

function loadFunction(funstr) {
	if(!compiled) {
		error("Compile your code before running a function!");
		return false;
	}
	
	try {
		// Parse funstr
		var regex = /\s*([A-Za-z_][A-Za-z_0-9]*)\(([0-9]+(\s?,\s?([0-9]+))*)\)\s*/;
		var match = funstr.match(regex);
		if(!match) {
			error("Parser error: your function call is not well-formed.");
			return false;
		}
		var fn = match[1];
		var args = match[2].split(",").map(function(v) { return parseInt(v); });

		// Now we have the function name and the arguments, we construct a FunctionCall object:
		var fcall = FunctionCall(fn, args, 0);
		setRunner(MachineRunner(compiled, fcall));
	} catch (err) {
		if (err instanceof Compiler.CompilerException || err instanceof MachineException) {
			error(err.message, err.location);
			clearState();
			return;
		} else {
			throw err;
		}
		return false;
	}
	return true;
}

function runnerStep(mode) {
	if(!runner) {
		error("You have to load a function before you can step through it.");
		return;
	}

	var rv = runner.run({ stepmode: mode, lines: getBreakpoints(true) });
	if(rv.state == MACHINE_CONSTANTS.EXEC_HALTED){
		success(runner.fcall.toString() + " returned with (" + rv.retval.join(", ") + ")");
		clearState();
		return;
	} else if(rv.state == MACHINE_CONSTANTS.EXEC_RUNNING) {
		var statusStr = runner.fcall.toString() + " run for " + rv.steps + " steps.";
		if(rv.stop == MACHINE_CONSTANTS.STOP_BREAKPOINT)
			statusStr = "[Breakpoint] " + statusStr;
		status(statusStr);
		redrawState();
		jumpTo(rv.lineno);
	}
}

function getBreakpoints(forCompiler) {
	var bp = [];
	var c = forCompiler?1:0;
	editor.eachLine(function (l) {
		if(isBreakpointOnLine(l)) {
			bp.push(l.lineNo() + c);
		}
	});	
	return bp;
}

function handleUnreachableLines(cmp) {
	cmp.forEach(v => v.unreachable.forEach(setUnreachableGutter));
}


//
// Keyboard Interaction
//

function handleKeyboardShortcuts(e) {
  if(e.ctrlKey && e.keyCode == 188) { // "Ctrl+,"
    stepOver();
  } else if(e.ctrlKey && e.keyCode == 190) { // "Ctrl+."
    stepInto();
  } else if(e.ctrlKey && e.keyCode == 191) { // "Ctrl+/"
    stepOut();
  } else if(e.ctrlKey && e.keyCode ==  77) { // "Ctrl+m"
  	runToEnd();
  } else if(e.ctrlKey && e.keyCode ==  13) { // "Ctrl+Enter"
  	compileAndTest();
  } else {
  	return;
  }
  e.preventDefault();
}

//
// Error printing and jumping within the code.
//

function isNumeric(jump) {
	return !isNaN(parseFloat(jump)) && isFinite(jump);
}

function error(str, jump) {
	if (str && str.length > 0) {
		if(isNumeric(jump)) {
			str += " (Line " + jump + ")";
		}
		$('runtimeOut').innerText = str;
		$('runtimeOut').className = "runtimeError";
	}

	jumpTo(jump);
}

function status(str) {
	$('runtimeOut').innerText = str;
	$('runtimeOut').className = "runtimeReady";
}

function jumpTo(jump) {
	if (jump == null) {
		// Do nothing.
	} else if (typeof jump === "object") {
		// Compatibility with PegJS
		editor.setCursor({line: jump.start.line - 1, ch: jump.start.column});
		editor.focus();
	} else if (Array.isArray(jump) && jump.length > 1) { 
		// Compatibility with the machine runner
		editor.setSelection({line: jump[0] - 1, ch: 0}, {line: jump[1] - 1, ch: null});
		editor.focus();
	} else if (isNumeric(jump)) {
		// Compatibility with compiler
		editor.setSelection({line: jump - 1, ch: 0}, {line: jump - 1, ch: null});
		editor.focus();
	}
}

function success(str) {
	if (str && str.length > 0) {
		$('runtimeOut').innerHTML = str;
		$('runtimeOut').className = "runtimeGood";
	}
}


//
// UI Drawing Functions
//

function setUnreachableGutter(l) {
	var marker = document.createElement("div");
	marker.innerHTML = "&nbsp;";
	marker.setAttribute("tt", "This line is unreachable.");
	marker.className = "gutterFlag unreachableFlag";
	
	editor.setGutterMarker(l - 1, "lint", marker);
}

function isBreakpointOnLine(l) {
	return l.gutterMarkers && l.gutterMarkers.lint && l.gutterMarkers.lint.getAttribute("isbreakpoint");
}
function resetGutter() {
	// Before we clear the gutter, we read the current positions of
	// the breakpoints off. We need to do this because CodeMirror
	// keeps track of lines for us automatically. It's easier to
	// use that than to maintain control separately.
	var bp = getBreakpoints();
	
	editor.clearGutter("lint");

	bp.forEach(checkAndHandleBreakpoint);
}
function setTestGutter(line, passed, tooltip) {
	var marker = document.createElement("div");
	marker.innerHTML = "&nbsp;";
	marker.setAttribute("tt", tooltip);
	marker.className = "gutterFlag " + (passed?"testSuccess":"testFailed");
	
	editor.setGutterMarker(line, "lint", marker);
}

function setBreakpoint(line, set, isFuncEntry) {
	var marker = null;
	if(set) {
		marker = document.createElement("div");
		marker.className = "lintBreakpoint" + (compiled?"":" inputDirty");
		marker.innerHTML = isFuncEntry?"&#x25BA;":"&#x25CF;";
		marker.setAttribute("isbreakpoint", true);
	}
	editor.setGutterMarker(line, "lint", marker);
}

function emptyNode(tgt) {
	while(tgt.hasChildNodes())
		tgt.removeChild(tgt.childNodes[0]);
}


var stackTraceNodes = [];
var currStackTraceNode = -1;

function clearState() {
	stackTraceNodes = [];
	currStackTraceNode = -1;
	emptyNode($('registers'));
	emptyNode($('stack'));
	setRunner(null);
}

function redrawState() {
	// If nothing is running, wait to redraw.
	// switchView has already covered up the problem.
	if(!compiled || !runner) {
		return;
	}

	var tgt = $('stack');
	var s = runner.getState();
	emptyNode(tgt); // Clear all children from #state
	stackTraceNodes = [];
	currStackTraceNode = -1;

	// Now we fill in the stack
	var ol = document.createElement('ol');
	s.forEach(function (sf, i) {
		var li = document.createElement('li');
		var nName = document.createElement('span');
		nName.appendChild(document.createTextNode(sf.name));
		var nSteps = document.createElement('span');
		nSteps.appendChild(document.createTextNode("{" + sf.steps + "}"));
		li.appendChild(nName);
		li.appendChild(nSteps);
		li.onclick = function(e) {
			changeSelectedStackFrame(i);
		}
		ol.insertBefore(li, ol.firstChild);
		stackTraceNodes.push(li);
	});
	tgt.appendChild(ol);
	
	changeSelectedStackFrame(s.length - 1, true);
}

function changeSelectedStackFrame(i) {
	if(i == currStackTraceNode)
		return;
	if(currStackTraceNode >= 0)
		stackTraceNodes[currStackTraceNode].className = "";
	stackTraceNodes[i].className = "currStackTrace";
	currStackTraceNode = i;

	// Only the outermost frame in the stack trace is editable.
	var editable = ((stackTraceNodes.length - 1) == i);

	var tgt = $('registers');
	emptyNode(tgt);
	var s = runner.getState(i);
	
	if(!s) 
		return;

	// Now we draw the latest register values:
	s.registers.forEach(function (regName, i) {
		var li = document.createElement('div');

		var label = document.createElement('span');
		label.className = "registerName";
		label.appendChild(document.createTextNode("[" + regName + "]"));
		li.appendChild(label);

		var equals = document.createElement('span');
		equals.className = "equals";
		equals.appendChild(document.createTextNode("="));
		li.appendChild(equals);

		var number = document.createElement('input');
		number.type = "number";
		number.min = 0;
		number.value = s.values[i];
		number.readOnly = !editable;
		if(editable) {
			number.onchange = function (e) {
				handleRegisterChange(regName, number.value);
			}
		}
		li.appendChild(number);

		tgt.appendChild(li);
	});

	jumpTo(s.lineno);
}