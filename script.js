// Abacus Machine Simulator
// Gaurav Manek
//
// script.js glues the parser and the machine simulator with the UI.

"use strict";

// Configuration
var LOGGING = true;


// Global variables
var editor;
var allfunc;
var tests;
var runner;

function $(s){
	return document.getElementById(s);
}

function start(){
	// Setup
	editor = CodeMirror.fromTextArea($('codeArea'), {
    	lineNumbers: true,
    	mode: "abacusmachine",
    	theme: "default",
		lineWrapping: true
  	});
};

// This function is invoked when the "run" button is pressed.
// It runs the parser, performs intermediate operations, and 
// executes the code on the machine simulator.
function run() {
	var t_start = performance.now();
	var parse;
	try {
		parse = parser.parse(editor.getValue());
	} catch (err) {
		error(err.message, err.location);
		return;
	}

	if(LOGGING)
		console.log("Parsing complete: " + Math.round(performance.now() - t_start) + " ms");
	
	if (parse.length > 0) {
		try {
			// compiled is a list of {code, tests} objects,
			// where code is the "compiled" version of each function
			// and tests is the set of tests associated with that function.
			var compiled = parse.map(Compiler.compile);
			tests = TestEngine(compiled);
			// All the functions
			allfunc = compiled.map(function(v) { return v.code; });

			var t = tests.next();
			runner = MachineRunner(allfunc, t.lhs.fcall, {});

			redrawState();

		} catch (err) {
			console.log(err);
			if (err instanceof Compiler.CompilerException || err instanceof MachineException) {
				error(err.message, err.location);
				return;
			} else {
				throw err;
			}
		}
	} else {
		error("No functions defined.");
		return;
	}

	var t_end = performance.now();
	success("Execution complete: " + Math.round(t_end - t_start) + " ms");
	if(LOGGING)
		console.log("Execution complete: " + Math.round(t_end - t_start) + " ms")
}

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

function graphViz() {
	runner.step();
	console.log(runner.getState());
	redrawState();
}


//
// UI Drawing Functions
//

function emptyNode(tgt) {
	while(tgt.hasChildNodes())
		tgt.removeChild(tgt.childNodes[0]);
}

function switchView(isRunning) {
	if(isRunning) {
		$('defaultView').style.display = "none";
		$('runningView').style.display = "block";
	} else {
		$('defaultView').style.display = "block";
		$('runningView').style.display = "none";
	}
}


var stackTraceNodes = [];
var currStackTraceNode = -1;
function redrawState() {
	switchView(true);

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
		ol.appendChild(li);
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
	var editable = (stackTraceNodes.length - 1 == i);

	var tgt = $('state');
	emptyNode(tgt);
	var s = runner.getState(i);
	
	if(s) {
		jumpTo(s.lineno);
	} else {
		// Error, stack frame not found
	}
}