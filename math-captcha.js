/**
 * Node.js CAPTCHA library that produces and uses simple math questions to
 * ask the user
 */

var fs = require('fs');
var crypto = require('crypto');
var exec = require('child_process').exec;
var _ = require('underscore');

/**
 * Default options for the captcha include configuration for LaTeX and
 * dvipng.
 */
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

/**
 * Creates a new instance of the captcha manager and generator, accepting a list of options.
 * Any unspecified options will be defaulted using the above object
 * @param options The list of options to set for this captcha instance
 */
function captcha(options) {
	// Create instance data
	this.options = {};				//!< Options listing
	this.dvipngcmd = '';			//!< Command used to invoke dvipng to produce a PNG to send to the user
	this.texcmd = '';				//!< Command used to invoke LaTeX to produce a dvi file
	this.operators = [];			//!< Array of operators that we can build expressions from
	this.captchas = {};				//!< Map of captchas that are in the wild

	// Cofnigure instance
	this.parseOptions(_.extend({}, default_options, options));
	this.operators.push(new Operator(5, true, true, '$1 + $2', 2, function(a, b) { return a+b; }));
	this.operators.push(new Operator(5, false, true, '$1 - $2', 2, function(a, b) { return a-b; }));
	this.operators.push(new Operator(3, true, true, '$1 \\times $2', 2, function(a, b) { return a*b; }));
	this.operators.push(new Operator(3, false, false, '\\frac{$1}{$2}', 2, function(a, b) { return a/b; }));
}

// Add in member data for the captcha class
_.extend(captcha.prototype, {
	/**
	 * Generates a new random math problem, writes it to a png, saves the relevant information locally,
	 * and then passes a key to the given callback. This key can be used to get the png, check answers,
	 * and release the resources associated with the captcha image.
	 * @param success Callback to be called when the captcha image is ready, success(key)
	 * @param failure Callback to be called if there is a problem, failure(err)
	 */
	generate : function(success, failure) {
		var exp = this.generateExpression(this.options.minOps, this.options.maxOps, this.options.values);
		var latex = this.wrapLatex(this.latex([].concat(exp)));
		var answer = this.solve([].concat(exp));

		// Create information/tracking structure
		var hash = crypto.createHash('md5');
		hash.update(latex, 'utf8');
		var key = hash.digest('hex');
		var file = this.options.path + '/' + key;
		this.captchas[key] = {
			exp : exp,
			latex : latex,
			answer : answer,
			file : file + '.png'
		};

		// Write out latex file, with a nasty callback chain
		var that = this;
		var procopts = {
			encoding : 'utf8',
			env : process.env
		};

		fs.writeFile(file+'.tex', latex, function(err) {
			if (err) {
				that.captchas[key] = undefined;
				failure(err);
			}
			else {
				// Invoke tex
				exec(that.texcmd + ' ' + file+'.tex', procopts, function(err) {
					if (err !== null) {
						that.captchas[key] = undefined;
						failure(err);
					}
					else {
						exec(that.dvipngcmd + ' -o '+file+'.png ' + file + '.dvi', procopts, function(err) {
							if (err !== null) {
								that.captchas[key] = undefined;
								failure(err);
							}
							else {
								that.captchas[key].handler = setTimeout(_.bind(that.cleanup, that, key), that.options.cleanupTime*1000);
								success(key);
							}
						});
					}
				});
			}
		});
	},

	/**
	 * Retrieves the image path for a given key, to be called after success is invoked through generate()
	 * @param key The key for which to retrieve the image path
	 * @return string The path to the image
	 */
	getImage : function(key) {
		if (this.captchas[key])
			return this.captchas[key].file;
		else
			return null;
	},

	/**
	 * Checks an answer for a given captcha against the key, with rounding to the given number of decimal
	 * places
	 * @param key The key to check for
	 * @param answer The answer to compare
	 * @param places The number of decimal places to round to
	 * @return Boolean True if the answer matches, false otherwise
	 */
	check : function(key, answer, places) {
		if (this.captchas[key]) {
			var shift = Math.pow(10, places);
			var rounded = Math.round(this.captchas[key].answer*shift);
			var adjusted = Math.round(answer*shift);
			return adjusted == rounded;
		}
		return false;
	},

	/**
	 * Cleans up the files generated for a specific key and removes the key from the list of captchas
	 * @param key The key to clean up
	 */
	cleanup : function(key) {
		if (this.captchas[key]) {
			clearTimeout(this.captchas[key].handler);
			this.captchas[key] = undefined;
			exec('rm ' + _.map(['.tex', '.aux', '.dvi', '.png', '.log'], function(v) {
				return this.options.path + '/' + key + v;
			}, this));
		}
	},

	/**
	 * Parses an options object and saves it as instance data. This updates the commands used to print images
	 * @param options Object whose keys and values are the options for this captcha instance
	 */
	parseOptions : function(options) {
		this.texcmd = options.tex + ' -halt-on-error -output-directory='+options.path;
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
	 * Wraps a math-only string in some LaTeX document scaffolding
	 * @param math The math string to put inside the document
	 * @return String the entire LaTeX document
	 */
	wrapLatex : function(math) {
		return '\\documentclass[12pt]{article}\n' +
				'\\usepackage{amsmath}\n' +
				'\\pagestyle{empty}\n\n' +
				'\\begin{document}\n\n' +
				'\\begin{displaymath}\n' + math + '\n\\end{displaymath}\n\n' +
				'\\end{document}';
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
				if (exp.doGroup && i > 0 && (tp != 0) && (tp > exp.precedence || !exp.associative))
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
 * @param associative Is this operator associative?
 * @param doGroup If necessary, should this operator group arguments by surrounding with ()? (false for operators whose printing already makes grouping clear, like the fraction bar for division)
 * @param latex The latex string to insert for this operator, with $n standing in for the nth argument
 * @param arity The arity of this operator
 * @param op A function that can be used to evaluate this operator
 */
function Operator(precedence, associative, doGroup, latex, arity, op) {
	this.precedence = precedence;
	this.associative = associative;
	this.doGroup = doGroup;
	this.latex = latex;
	this.arity = arity;
	this.op = op;
}

// Export the two class definitions for people to use
module.exports.CAPTCHA = captcha;
module.exports.Operator = Operator;
