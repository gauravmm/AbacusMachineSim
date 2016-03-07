// Abacus Machine Simulator
// Gaurav Manek

// Syntax highlighting mode for our custom abacus machine language.
// Uses CodeMirror's simple mode.

CodeMirror.defineSimpleMode("abacusmachine", {
  // The start state contains the rules that are intially used
  start: [
    {regex: /"(?:[^\\]|\\.)*?"/, token: "string"},
    {regex: /(function)(\s+)([a-z$][\w$]*)/,
     token: ["keyword", null, "variable"]},
    {regex: /((?:function|goto|where|next|is)\b)/, token: "keyword"},
    {regex: /\[[a-z0-9$]+\]/i, token: "variable-2"},
    {regex: /:[a-z0-9_$]+\w/i, token: "atom"},
    {regex: /(?:\d+)/i, token: "number"},
    // Inline comment:
    {regex: /\/\/.*/, token: "comment"},
    {regex: /\/(?:[^\\]|\\.)*?\//, token: "variable-3"},
    // A next property will cause the mode to move to a different state
    {regex: /\/\*/, token: "comment", next: "comment"},
    {regex: /[-+\/*=<>!]+/, token: "operator"},
    // indent and dedent properties guide autoindentation
    {regex: /[\{\[\(]/, indent: true},
    {regex: /[\}\]\)]/, dedent: true},
  ],
  // The multi-line comment state.
  comment: [
    {regex: /.*?\*\//, token: "comment", next: "start"},
    {regex: /.*/, token: "comment"}
  ],
  meta: {
    dontIndentStates: ["comment"],
    lineComment: "//"
  }
});

CodeMirror.defineMIME("script/x-abacm", "abacusmachine");
