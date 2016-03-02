/*
 * Abacus Machine Grammar
 * Gaurav Manek
 * ==========================
 * Built with PegJS
 * Large amounts of this grammar are borrowed from PegJS
 * https://github.com/pegjs/pegjs/blob/master/src/parser.pegjs
 * 
 */
{
  function mapPos(arr, pos) {
      return arr.map(function(v){ return v[pos] });
  }
  
  function relativePositionMarker() {
    return { type:"rel", val:"next" };
  }
}

Code 
  = __ fn:(Function __)* {return mapPos(fn, 0);}

Function
  = "function" _ name:Identifier _ "(" args:ArgumentList ")" _ "->" _ dest:ArgumentList _ "{" body: FunctionBody "}" test:(__ "where" __ "{" TestBody "}")? {
      var loc = location();
      return {name: name, args: args, return: dest, body: body, lineno: loc.start.line,
                 tests: (test)?test[4]:[] };
    }

FunctionBody
  = ln:(__ Line)* __ {
    return mapPos(ln, 1);
  }
 
TestBody
  = tst:(__ TestLine _ ";")* __ {
    return mapPos(tst, 1);
  }
  
Line
  = _ label:MarkerAnchor? _ line:(FunctionCall/RegisterChange) _ ";" {
    var loc = location();
    var rv = { type:"ln", lineno:loc["start"]["line"], exec:line };
    if (label)
      rv["anchor"] = label;
    return rv;
  }
  / _ label:MarkerAnchor {
    var loc = location();
    return {anchor: label, lineno:loc["start"]["line"]};
  }
  
  / _ KeywordGoto _ to:Marker _ ";" {
    var loc = location();
    return { type:"goto", to:to, lineno:loc["start"]["line"]}
  }
  
TestLine "test case"
  = _ lhs:FunctionCallHead _ "is" _ rhs:(FunctionCallHead/ArgumentList) {
    var loc = location();
      return { type:"ln", lineno:loc["start"]["line"], lhs: lhs, rhs: rhs };
  }
  
  
Marker "position marker"
  = MarkerAnchor 
  / RelativeMarker
  
MarkerAnchor "position anchor"
  = ":" id:Identifier {
    return {type:"anchor", val:id};
  }
  
RelativeMarker "relative position marker"
  = "next"/"~" {
    return relativePositionMarker("next");
  }

FunctionCall
  = head:FunctionCallHead _ "->" _ to:ArgumentList {
    return { type:"callandstore", fn:head, store:to };
  }

FunctionCallHead
  = fn:Identifier _ "(" args:ArgumentList ")" {
    return { type:"functioncall", name:fn, args:args };
  }

RegisterChange
  = reg:Register "+" (_ "," _ marker:Marker)? {
    return { type:"rchange", register:reg, operation:"+", next:(typeof marker !== 'undefined')?marker:relativePositionMarker("next") };
  }
  / reg:Register "-" (_ "," _ ifpos:Marker _ "," _ ifzero:Marker)? {
    return { type:"rchange", register:reg, operation:"-", npos:(typeof ifpos !== 'undefined')?ifpos:relativePositionMarker("next"), nzero:(typeof ifzero !== 'undefined')?ifzero:relativePositionMarker("next") };
  }
  
//
// Basic Identifier Types and Groups
//

Keyword
  = KeywordGoto
  / RelativeMarker

IntegerArgument 
  = int:Integer { return {type: "integer", val: int }; }

ArgumentList 
  = _ regs:((Register/IntegerArgument) _ ("," _)?)* _ { return { type:"arglist", val:mapPos(regs, 0) }; }

Register
  = "[" _ val:NumericIdentifier _ "]" { return { type: "register", id: val } }

NumericIdentifier // Identifier type used with registers
  = Integer
  / Identifier

Identifier
  = id:(Alpha AlphaNumeric*) { return text(); }

//
// Keywords
//

KeywordGoto
  = "goto"

// 
// Comment Support
// 

Comment "comment"
  = MultiLineComment
  / SingleLineComment

MultiLineComment
  = "/*" (!"*/" SourceCharacter)* "*/" { return text(); }

MultiLineCommentNoLineTerminator
  = "/*" (!("*/" / LineTerminator) SourceCharacter)* "*/" { return text(); }

SingleLineComment
  = "//" (!LineTerminator SourceCharacter)* { return text(); }
  
  
//
// Core data types
//

AlphaNumeric
  = (Alpha/Numeric)

Integer "integer"
  = Numeric+ { return parseInt(text(), 10); }

Alpha "letter"
  = [a-zA-Z_]

Numeric "digit"
  = [0-9]

SourceCharacter
  = .

WhiteSpace "whitespace"
  = "\t"
  / "\v"
  / "\f"
  / " "
  / "\u00A0"
  / "\uFEFF"

LineTerminator
  = [\n\r\u2028\u2029]

LineTerminatorSequence "end of line"
  = "\n"
  / "\r\n"
  / "\r"
  / "\u2028"
  / "\u2029"

__
  = (WhiteSpace / LineTerminatorSequence / Comment)* {return "";}

_
  = (WhiteSpace / MultiLineCommentNoLineTerminator)* {return "";}
