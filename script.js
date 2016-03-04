// Abacus Machine Simulator
// Gaurav Manek
//
// script.js glues the parser and the machine simulator with the UI.

"use strict";

// Configuration
var LOGGING = true;


// Global variables
var editor;

function $(s){
	return document.getElementById(s);
}

function start(){
	// Setup
	editor = CodeMirror.fromTextArea($('code'), {
    	lineNumbers: true,
    	mode: "abacusmachine",
    	theme: "default",
		lineWrapping: true,
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
		console.log("Parsing complete: " + Math.round(performance.now() - t_start) + " ms")

	var compiled;
	var tests;
	
	if (parse.length > 0) {
		try {
			compiled = parse.map(Compiler.compile);
			console.log(compiled);
			tests = TestEngine(compiled);
		} catch (err) {
			if (err instanceof Compiler.CompilerException) {
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

function error(str, jump) {
	if (str && str.length > 0) {
		$('runtimeOut').innerHTML = str;
		$('runtimeOut').className = "runtimeError";
	}

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
	} else if (!isNaN(parseFloat(jump)) && isFinite(jump)) {
		// Compatibility with compiler
		editor.setSelection({line: jump - 1, ch: 0}, {line: jump - 1, ch: null});
		editor.focus();

		if(str && str.length > 0) {
			$('runtimeOut').innerHTML = $('runtimeOut').innerHTML + " (Line " + jump + ")";
		}
	}
}

function success(str) {
	if (str && str.length > 0) {
		$('runtimeOut').innerHTML = str;
		$('runtimeOut').className = "runtimeGood";
	}
}

function graphViz() {

}