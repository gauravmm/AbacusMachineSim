"use strict";

var editor;

function $(s){
	return document.getElementById(s);
}

function start(){
	// Setup
	var editor = CodeMirror.fromTextArea($('code'), {
    	lineNumbers: true,
    	mode: "abacusmachine",
    	theme: "default",
		lineWrapping: true,
  	});
};

function run() {

}

function graphViz() {

}