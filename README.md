# Abacus Machine Simulator
Gaurav Manek, 2016
For PHIL 1880, Spring 2016, Brown University ([http://rgheck.frege.org/](Prof. Richard Heck))

## Attribution
This work is released under [The MIT License](./LICENSE). It uses a parser generated by [PEG.js](http://pegjs.org/) for parsing, and [CodeMirror](http://codemirror.net/) with packages for syntax highlighting.

## Language
The `abacusmachine` language is desgined to be a simple and effective language for specifying abacus machines. It comes with built-in testing and scope features to make it easier to build complex functions and verify code correctness.

### Control Flow

Control flow proceeds sequentially forwards unless changed by a `goto` or branching within a register command. Jump anchors are specified at the start of a line with a leading `:`. All names must begin with a letter and can include letters, numbers, and `_`. Examples are:
```
	:anchor_name
	:this123 /* code continues on this line */
```

Within register commands, either `next` or `~` can be used to refer to the next line instead of an anchor.


### Registers

As with any abacus machine, an unlimited number of registers storing natural numbers are available. Registers are always specified by square brackets, and may be defined numerically (`[1]`, `[5]`, etc.) or by name (`[ret_val]`, `[arg1]`, etc.). Registers contain the value 0 by default.

Two operations can be performed on registers, addition and subtraction. They are written as:
```
  
  [7]+; // Increment register 1 and continue.
  [7]-; // Decrement register 1 and continue.
  [7]+, next;      // Increment and go to the next line.
  [7]-, :start, ~; // Decrement, and if the register is
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
