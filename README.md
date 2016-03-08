# Abacus Machine Simulator
Gaurav Manek, 2016

## Attribution
This work is released under [The MIT License](./LICENSE). It uses a parser generated by [PEG.js](http://pegjs.org/) for parsing, and [CodeMirror](http://codemirror.net/) with packages for syntax highlighting.

This work was made possible by [Prof. Richard Heck](http://rgheck.frege.org/), who has graciously given direction and time to this project.

A big thank you to [Prof. Shriram Krishnamurthi](https://cs.brown.edu/~sk/) for advice in the design of the language.


## Language
The `abacusmachine` language is desgined to be a simple and effective language for specifying abacus machines. It comes with built-in testing and scope features to make it easier to build complex functions and verify code correctness.

### Control Flow
Control flow proceeds sequentially forwards unless changed by a `goto` or branching within a register command. Jump anchors are specified at the start of a line with a leading `:`. All names must begin with a letter and can include letters, numbers, and `_`. Examples are:
```
	:anchor_name
	:this123 /* code continues on this line */
```

Within register commands, `next` can be used to refer to the next line instead of an anchor. You cannot place an anchor on the same line as a `goto`.

Runtime detection of infinite loops has been implemented, so some types of infinite loops will stop the engine automatically.

### Registers
As with any abacus machine, an unlimited number of registers storing natural numbers are available. Registers are always specified by square brackets, and may be defined numerically (`[1]`, `[5]`, etc.) or by name (`[ret_val]`, `[arg1]`, etc.). Registers contain the value 0 by default.

Two operations can be performed on registers, addition and subtraction. They are written as:
```
  
  [7]+; // Increment register 1 and continue.
  [7]-; // Decrement register 1 and continue.
  [7]+, next;         // Increment and go to the next line.
  [7]-, :start, next; // Decrement, and if the register is
                      //  still positive go to :start. If
                      //  zero, go to the next line.
```

### Functions
All executable code is organized into functions, each with its own scope. The functions are written as:
```
function rem([1],[arg2]) -> [rv1], [7] {
   /* code omitted */
} where {
  rem(5,7) is rem(12,7);
  rem(10,6) is 4;
}
```

Where `rem` is the function name, the function arguments are given as a comma-separated list of registers. The registers containing the return value are specified after the `->`. At the end of the function whatever the value stored in the return registers is passed to the calling function.

Function calls are made as follows: `quo([1], [2]) -> [6], [8];`. Registers in the parenthesis are passed by value to the function, and the return values are copied to the source registers, overwriting whatever previous values were stored.

### Recursion
In actual abacus machines the function abstraction does not exist, and functions are implemented by "copying" the structure of the abacus machine into each place the function is invoked. To ensure that this language does not (accidentally) allow for an abacus machine with infinite states to be implemented, recursive calls (including mutual recursion) are not allowed.

### Testing
Tests are built into the language to encourage good testing practices. A `where` block at the end of a function contains tests of the form `name(1, 2, 3) is 2, 3` or `name(1, 2) is name(4, 5)`. The left-hand side must be a function call and the right-hand side can be a list of integers or another function call. The `is` operator is checks for equality: a test is only considered passed if the output of the function on the left and right (or the values on the right) are of equal length and value.


## Features

### Automatic Saving of Code
Each time code is updated, it is automatically saved by the platform. To restore the starting code, delete everything in the editor window, wait for at least two seconds, then refresh the window.

### Testing 

Upon a successful compilation, tests are automatically run, and the result of each test is displayed in the gutter next to the test. Hovering over the gutter will show the result of evaluation underneath the line. Function tests are automatically run in *dependency order*, where function `a` is evaluated before `b` if `b` depends on `a`. Testing may be stopped early if some types of errors are encountered, so this may be useful under some circumstances.

### Debugger

Upon a successful compilation, the pane on the left is replaced by the debugger pane, which can be used to examine the abacus machine as it is executing. Enter a function call in the toolbar at the top of the pane and click "Load and Pause" (or press `Enter`) to load the function in the debugger. Once loaded, you can step through the function in four different ways:
  - Run to End (`Ctrl+E`), to run the function until it returns.
  - Step Over (`Ctrl+,`), to take one step, not descending into function calls.
  - Step Into (`Ctrl+.`), to take one step, descending into function calls.
  - Step Out (`Ctrl+/`), to run until the current function returns.

Each time you take a step in a function, the next line to be executed is highlighted.

When execution is paused, the stack is displayed at the bottom of the debugger pane, and you can examine the state of the machine at different levels of the stack by clicking on different stack frames. When examining any stack frame, you can see the values of all registers in the function in the state area above the stack.

When examining the current stack frame, you can edit the value of the register stored there in the state view. The change takes effect immediately, so the next step executes with the changed value.

In addition to these options, you can use breakpoints to pause execution and inspect the machine during execution:

### Breakpoints

Clicking on the gutter next to a line will set a breakpoint on that line. When running code from the debugger, execution is paused when it reaches a breakpoint. Breakpoints may be set at the head or within the body of a function, but not within empty space or a where block.

Before code is compiled, breakpoints are set in a blue color and may be set at any line. Upon compilation, breakpoints positions are recalculated and only valid breakpoints (those that meet the above conditions) are kept and colored red.

Breakpoints set at a function header will stop execution just before a function returns. Breakpoints set within a function will stop execution so that the highlighted line is the next to be executed.


## Open Source

### Issues

Feel free to report bugs and request features by creating a [new issue](https://github.com/gauravmm/AbacusMachineSim/issues) and tagging it appropriately.

If you are reporting a bug with the code, please include a minimum working example. If you are reporting a bug with the design/style, please include a screenshot and your OS, browser, and version. (Note that we only support IE9 or better.)

### Contribution

Please only contribute your own work, and only if you are willing to release it under the license of this work.

Branch management is done via [gitflow](http://nvie.com/posts/a-successful-git-branching-model/). Please fork off `develop` and target all pull requests to the same. Feature branches should be named `feature-name` and hotfixes `hotfix-name`. 
