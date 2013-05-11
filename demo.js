// Simple test/demonstration script for math-captcha

var http = require('http');
var fs = require('fs');
var url = require('url');
var port = 8124;
var c = require('./math-captcha');
var mc = new c.CAPTCHA({fg : '#000000'});

var server = http.createServer();
server.on('request', function(req, res) {
	var key = req.url.match(/\/captcha\/([a-zA-Z0-9]*).png/);
	if (key) {
		var imagePath = mc.getImage(key[1]);
		if (imagePath) {
			// If using express or connect, all of this can be handled with res.sendfile(imagePath)
			fs.readFile(imagePath, function(err, data) {
				if (err) {
					res.writeHead(404);
					res.end();
				}
				else {
					res.statusCode = 200;
					res.setHeader('Content-Type', 'image/png');
					res.write(data);
					res.end();
				}
			});
		}
		else {
			res.writeHead(404);
			res.end();
		}
	}
	else {
		res.write('<html><head><title>math-captcha demo</title></head><body>');

		// Check a submitted captcha
		var params = url.parse(req.url, true);
		if (params.query.key) {
			var ans = parseInt(params.query.answer);
			var valid = mc.check(params.query.key, ans, 2);
			mc.cleanup(params.key);
			if (valid) {
				res.write('<div>Correct!</div>');
			}
			else {
				res.write('<div>Incorrect!</div>');
			}
		}

		// Make a new captcha image
		mc.generate(function(key) {
			res.write('<form method="get"><image src="captcha/'+key+'.png" /><br />');
			res.write('Answer: <input type="text" name="answer" />');
			res.write('<input type="hidden" value="'+key+'" name="key" />');
			res.write('<br /><input type="submit" value="Go" /></form>');
			res.write('</body></html>');
			res.end();
		}, function(err) {
			res.statusCode = 500;
			res.end();
		});
	}
});

server.listen(port);
