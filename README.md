math-captcha
============

A Node.js package for creating and using CAPTCHAs that ask math questions, rendered with LaTeX.

## Installation

Install this package with npm:

```javascript
npm install math-captcha
```

You must have several additional dependencies installed on your system, including [LaTeX](http://www.latex-project.org/) and [dvipng](http://www.nongnu.org/dvipng/). See the respective project sites for information on how to install these programs.

## Demo

There is a simple demo included that displays and tests captcha images. You can also use this as a reference for how to use math-captcha in your code. Run it with:

```
$ cd node_modules/math-captcha
$ node demo
```

## Usage

This package only creates and manages the images for use with a CAPTCHA. You are responsible for hooking it into your web server application. As a result, the interface is very simple and limited to only a few functions.

First, create an instance of the CAPTCHA object. This will store all of the relevant state. As a result, you can maintain multiple independent CAPTCHAs if you so desire.

```javascript
var c = require('math-captcha');
var mc = new c.CAPTCHA(options);
```

The options are all optional, with ideally reasonable defaults specified, but you may wish to override some or all of them. The complete list, along with defaults is:

```javascript
var default_options = {
	'tex'			: '/usr/bin/latex',
	'dvipng'		: '/usr/bin/dvipng',
	'fg'			: '#ffffff',
	'bg'			: 'Transparent',
	'bounding'		: 'tight',
	'resolution'	: 100,
	'path'			: '/tmp/math-captcha',
	'minOps'		: 3,
	'maxOps'		: 5,
	'values'		: [1, 2, 3, 4, 5, 6, 7, 8, 9],
	'cleanupTime'	: 600
};
```

"tex" and "dvipng" specify the binaries for each respective program. "fg" and "bg" specify the image colors and can be one of 'Transparent', a 6-digit hex value, or a string of the form "rgb(a, b, c)" where a, b, and c are all either integers 0-255, or floats 0-1.0. "bounding" specifies the parameter to the -T option to dvipng, and "resolution" specifies the parameter to the -D option. See the documentation for dvipng for more information about these parameters. "minOps" and "maxOps" specify how many operations should be included in each randomly generated expression, and "values" is an array of possible numerical values to use while generating expressions. "path" is the directory where temporary files should be kept, and "cleanupTime" is a time in seconds indicating how long after a key is generated before it should be automatically cleaned up by the system.

```mc.generate(success, failure)```: This method generates a new expression and associated png image file. If there were no errors during generation, success is called with the corresponding key as its only argument. Otherwise, failure will be called with an error message corresponding to the problem.

```mc.getImage(key)```: This method retrieves the filesystem path of the image for the given key, or null if no such key was defined.

```mc.check(key, answer, places)```: This method tests whether the given answer matches the true answer for the given key, when both are rounded to places places after the decimal point. Because some expressions may produce non-terminating decimals, it is important to specify a reasonable value for your places comparison (i.e. 2) to ensure that users can actually correctly answer these types of questions.

```mc.cleanup(key)```: Deletes the files associated with the given key and removes its information from the internal tracking. If the given key was not previously produced by mc.generate(), this does nothing.

Note that if your server dies, math-captcha currently does not store or track any state, so any files in the temporary directory will be left there. I would recommend deleting all files on server startup, but this is not done automatically in case your temporary folder is shared with other programs.

## Operators and Expressions

The default operators available are addition, subtraction, multiplication, and division. You may define additional operators by creating an instance of c.Operator and adding it to a CAPTCHA instance by calling ```mc.operators.push(operator)```. Currently, new operators are defined by having a precedence, associativity, a latex string for rendering, an arity, and a callback that evaluates the operator when given the correct number of numerical arguments. The LaTeX string will have parameters placed via regular expression matching $1, $2, etc. for n arguments. I would not advise more than 9 arguments, because the replacement is not very sophisticated right now and will likely replace $10 with $1 followed by a zero, and then ignore the actual 10th argument.

Creating custom operators is not very well documented because I anticipate this will change soon, as there are some limitations to the current scheme. Read the code and look at the built in operators if you wish to define your own, for the time being.
