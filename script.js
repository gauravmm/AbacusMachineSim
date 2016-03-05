// Abacus Machine Simulator
// Gaurav Manek
//
// script.js glues the parser and the machine simulator with the UI.

"use strict";

// Configuration
var LOGGING = true;


// Global variables
var isRunning = false;
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

  	$('runtimeOut').onclick = compileAndTest;
  	document.onkeyup = handleKeyboardShortcuts;
};

// This function is invoked when someone clicks the top banner
// or hits ctrl+enter. It runs the parser, performs intermediate
// operations, and loads the code on the machine simulator.
function compileAndTest() {
	var t_start = performance.now();
	var wasRunning = isRunning;
	isRunning = false;
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

			// TODO: Loop through all the tests and see if something fails.
			var t = tests.next();
			runner = MachineRunner(allfunc, t.lhs.fcall, {});

		} catch (err) {
			console.log(err);
			if (err instanceof Compiler.CompilerException || err instanceof MachineException) {
				error(err.message, err.location);
				redrawState();
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
	success("Building and testing complete in " + Math.round(t_end - t_start) + " ms");
	if(LOGGING)
		console.log("Execution complete: " + Math.round(t_end - t_start) + " ms")
}

function step() {
	runner.step();
	console.log(runner.getState());
}

//
// Responding to UI events.
//

function run() {
	compileAndTest();
	redrawState();
}

// Toolbar buttons:
function runToEnd() {

}
function stepInto() {

}
function stepOut() {

}
function stepOver() {

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
  } else if(e.ctrlKey && e.keyCode ==  69) { // "Ctrl+e"
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

function emptyNode(tgt) {
	while(tgt.hasChildNodes())
		tgt.removeChild(tgt.childNodes[0]);
}

function switchView() {
	if(isRunning) {
		$('defaultView').style.display = "none";
		$('runningView').style.display = "flex";
	} else {
		$('defaultView').style.display = "flex";
		$('runningView').style.display = "none";
	}
}


var stackTraceNodes = [];
var currStackTraceNode = -1;
function redrawState() {
	switchView();
	// If nothing is running, wait to redraw.
	// switchView has already covered up the problem.
	if(!isRunning) {
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
		li.appendChild(number);

		tgt.appendChild(li);
	});

	jumpTo(s.lineno);
}