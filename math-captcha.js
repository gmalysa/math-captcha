/**
 * Node.js CAPTCHA library that produces and uses simple math questions to
 * ask the user
 */

var fs = require('fs');
var crypto = require('crypto');
var _ = require('underscore');
var logger = require('./logger');

/**
 * Default options for the captcha include configuration for LaTeX and
 * dvipng.
 */
var default_options = {
	'tex'			: 'latex',
	'dvipng'		: 'dvipng',
	'fg'			: '#ffffff',
	'bg'			: 'Transparent',
	'bounding'		: 'tight',
	'resolution'	: 100,
	'path'			: '/tmp',
	'minOps'		: 3,
	'maxOps'		: 5,
	'values'		: [1, 2, 3, 4, 5, 6, 7, 8, 9]
};

/**
 * Creates a new instance of the captcha manager and generator, accepting a list of options.
 * Any unspecified options will be defaulted using the above object
 * @param options The list of options to set for this captcha instance
 */
function captcha(options) {
	this.parseOptions(_.extend({}, default_options, options));
}

// Add in member data for the captcha class
_.extend(captcha.prototype, {
	options : {},			//!< Options listing
	dvipngcmd : '',			//!< Command used to invoke dvipng to produce a PNG to send to the user
	texcmd : '',			//!< Command used to invoke LaTeX to produce a dvi file
	operators : [],			//!< Array of operators that we can build expressions from

	/**
	 * Generates a new random math problem, writes it to a png, saves the relevant information locally,
	 * and then passes a key to the given callback. This key can be used to get the png, check answers,
	 * and release the resources associated with the captcha image.
	 * @param success Callback to be called when the captcha image is ready, success(key)
	 * @param failure Callback to be called if there is a problem, failure(err)
	 */
	generate : function(success, failure) {
		
	},

	/**
	 * Parses an options object and saves it as instance data. This updates the commands used to print images
	 * @param options Object whose keys and values are the options for this captcha instance
	 */
	parseOptions : function(options) {
		this.texcmd = options.tex;
		this.dvipngcmd = options.dvipng + ' -fg "' + this.parseColor(options.fg) + '" -bg "' + this.parseColor(options.bg) + '" -T ' + options.bounding + ' -D ' + options.resolution;
		this.options = options;
	},

	/**
	 * Parses a color into the format expected by dvipng for fg or bg arguments
	 * @param color The color to parse as a string, in either hex or rgb format
	 * @return String the color as a string suitable for dvipng input
	 */
	parseColor : function(color) {
		if (color.match(/transparent/i))
			return color;

		var match = color.match(/rgb[\( ]?(\d{1,3}\.?\d*)[, ]+(\d{1,3}\.?\d*)[, ]+(\d{1,3}\.?\d*)\)?/);
		var red, green, blue;

		if (match) {
			red = parseFloat(match[1]);
			green = parseFloat(match[2]);
			blue = parseFloat(match[3]);
		}
		else {
			if (color[0] == '#')
				color = color.substring(1, 7);

			red = parseInt('0x'+color.substring(0, 2));
			green = parseInt('0x'+color.substring(2, 4));
			blue = parseInt('0x'+color.substring(4, 6));
		}
		
		if (red > 1 || blue > 1 || green > 1) {
			red = red / 255;
			green = green / 255;
			blue = blue / 255;
		}

		red = new Number(red);
		green = new Number(green);
		blue = new Number(blue);

		return 'rgb ' + red.toFixed(3) + ' ' + green.toFixed(3) + ' ' + blue.toFixed(3);
	},

	/**
	 * Random helper that produces an integer in the range [n, m], because this comes up a lot
	 * and it's annoying to write out the expression each time
	 * @param n Minimum integer to produce
	 * @param m Maximum integer to produce
	 * @return int random value between n and m, inclusive
	 */
	randInt : function(n, m) {
		return n + Math.floor(Math.random() * (m - n + 1));
	},

	/**
	 * Generates a random expression represented by a stack stored in an array, in prefix notation,
	 * using the number of operators and ranges for values specified.
	 * @param minOps Minimum number of operators to specify
	 * @param maxOps Maximum number of operators to specify
	 * @param values Possible numbers to use when generating random values for the operators
	 * @return Array An array containing a stack that represents the expression
	 */
	generateExpression : function(minOps, maxOps, values) {
		var rtn = [];
		var ops = this.randInt(minOps, maxOps);
		var i;
		var valCount = 0;

		for (i = 0; i < ops; ++i) {
			var op = this.operators[this.randInt(0, this.operators.length-1)];
			
			while (valCount < op.arity) {
				rtn.push(values[this.randInt(0, values.length-1)]);
				valCount += 1;
			}

			rtn.push(op);
			valCount -= 1;
		}

		return rtn;
	},

	/**
	 * Evaluates an expression stack in order to calculate the correct answer for the captcha
	 * @param expression Array the expression stack, as generated by generateExpression
	 * @return float numerical value of evaluating the expression, unrounded
	 */
	solve : function(expression) {
		var exp = expression.pop();

		if (exp instanceof Operator) {
			var args = [];
			var i;
			for (i = 0; i < exp.arity; ++i) {
				args.push(this.solve(expression));
			}
			return exp.op.apply(null, args);
		}
		else {
			return exp;
		}
	},

	/**
	 * Evaluates an expression stack in order to generate the LaTeX necessary to render the
	 * equation. Doesn't actually compute any numbers!
	 * @param expression Array the expression stack as generated by generateExpression
	 * @return string The LaTeX that should be put inside a displaymath tag
	 */
	latex : function(expression) {
		var exp = expression.pop();

		if (exp instanceof Operator) {
			var args = [];
			var i;
			for (i = 0; i < exp.arity; ++i) {
				var tp = this.precedence(expression[expression.length-1]);
				if (tp > exp.precedence)
					args.push('('+this.latex(expression)+')');
				else
					args.push(this.latex(expression));
			}
			return this.substitute(exp.latex, args);
		}
		else {
			return exp+'';
		}
	},

	/**
	 * Determines the precedence of an expression before evaluating it, which is necessary to
	 * decide if we need to insert grouping around it when rendering the latex. All numbers have
	 * precedence zero, which indicates that they are never grouped alone
	 * @param expression The expression, which is an op or a number
	 * @return int precendence value. Lower is higher precedence
	 */
	precedence : function(exp) {
		if (exp instanceof Operator)
			return exp.precedence;
		return 0;
	},

	/**
	 * Performs the string substitution that places values into latex strings
	 * @param latex The latex string to substitute into
	 * @param subs Array of values to substitute for $1, $2, ...
	 * @return String the substituted latex string
	 */
	substitute : function(latex, subs) {
		var i;
		for (i = 0; i < subs.length; ++i) {
			latex = latex.replace(new RegExp('\\$'+(i+1)), subs[i]);
		}
		return latex;
	}

});

/**
 * This represents a single operator that can be used to construct math expressions randomly, including
 * information on arity, latex printing, and evaluation in javascript.
 * @param precedence The precedence of this operator, a higher number is lower precedence
 * @param latex The latex string to insert for this operator, with $n standing in for the nth argument
 * @param arity The arity of this operator
 * @param op A function that can be used to evaluate this operator
 */
function Operator(precedence, latex, arity, op) {
	this.precedence = precedence;
	this.latex = latex;
	this.arity = arity;
	this.op = op;
}

c = new captcha({});
c.operators.push(new Operator(5, '$1 + $2', 2, function(a, b) { return a+b; }));
c.operators.push(new Operator(5, '$1 - $2', 2, function(a, b) { return a-b; }));
c.operators.push(new Operator(3, '$1 \\times $2', 2, function(a, b) { return a*b; }));
c.operators.push(new Operator(3, '\\fract{$1}{$2}', 2, function(a, b) { return a/b; }));

var x = c.generateExpression(3, 4, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
logger.var_dump(x);
logger.debug(c.latex([].concat(x)));
logger.debug(c.solve([].concat(x)));
