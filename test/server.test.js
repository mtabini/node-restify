// Copyright 2012 Mark Cavage, Inc.  All rights reserved.

var fs = require('fs');
var http = require('http');

var filed = require('filed');
var uuid = require('node-uuid');

var HttpError = require('../lib/errors').HttpError;
var RestError = require('../lib/errors').RestError;
var restify = require('../lib');

if (require.cache[__dirname + '/helper.js'])
        delete require.cache[__dirname + '/helper.js'];
var helper = require('./helper.js');



///--- Globals

var after = helper.after;
var before = helper.before;
var test = helper.test;

var PORT = process.env.UNIT_TEST_PORT || 12345;
var CLIENT;
var SERVER;



///--- Tests

before(function (callback) {
        try {
                SERVER = restify.createServer({
                        dtrace: helper.dtrace,
                        log: helper.getLog('server')
                });
                SERVER.listen(PORT, '127.0.0.1', function () {
                        CLIENT = restify.createJsonClient({
                                url: 'http://127.0.0.1:' + PORT,
                                dtrace: helper.dtrace,
                                retry: false
                        });

                        process.nextTick(callback);
                });
        } catch (e) {
                console.error(e.stack);
                process.exit(1);
        }
});


after(function (callback) {
        try {
                SERVER.close(callback);
        } catch (e) {
                console.error(e.stack);
                process.exit(1);
        }
});


test('ok', function (t) {
        t.ok(SERVER);
        t.end();
});


test('ok (ssl)', function (t) {
        // Lame, just make sure we go down the https path
        try {
                // t.ok(restify.createServer({
                //         certificate: 'hello',
                //         key: 'world'
                // }));

        } catch (e) {
                t.fail('HTTPS server not created: ' + e.message);
        }
        t.end();
});


test('listen and close (port only)', function (t) {
        var server = restify.createServer();
        server.listen(PORT, function () {
                server.close(function () {
                        t.end();
                });
        });
});


test('listen and close (port only) w/ port number as string', function (t) {
        var server = restify.createServer();
        server.listen(String(PORT), function () {
                server.close(function () {
                        t.end();
                });
        });
});


test('listen and close (socketPath)', function (t) {
        var server = restify.createServer();
        server.listen('/tmp/.' + uuid(), function () {
                server.close(function () {
                        t.end();
                });
        });
});


test('get (path only)', function (t) {
        var r = SERVER.get('/foo/:id', function echoId(req, res, next) {
                t.ok(req.params);
                t.equal(req.params.id, 'bar');
                res.send();
                return next();
        });

        var count = 0;
        SERVER.on('after', function (req, res, route) {
                t.ok(req);
                t.ok(res);
                t.equal(r, route);
                if (++count === 2)
                        t.end();
        });

        CLIENT.get('/foo/bar', function (err, _, res) {
                t.ifError(err);
                t.equal(res.statusCode, 200);
                if (++count === 2)
                        t.end();
        });
});


test('use + get (path only)', function (t) {
        var handler = 0;
        SERVER.use(function (req, res, next) {
                handler++;
                next();
        });
        SERVER.get('/foo/:id', function tester(req, res, next) {
                t.ok(req.params);
                t.equal(req.params.id, 'bar');
                handler++;
                res.send();
                next();
        });

        CLIENT.get('/foo/bar', function (err, _, res) {
                t.ifError(err);
                t.equal(res.statusCode, 200);
                t.end();
        });
});


test('rm', function (t) {
        var route = SERVER.get('/foo/:id', function foosy(req, res, next) {
                next();
        });

        SERVER.get('/bar/:id', function barsy(req, res, next) {
                t.ok(req.params);
                t.equal(req.params.id, 'foo');
                res.send();
                next();
        });

        t.ok(SERVER.rm(route));

        CLIENT.get('/foo/bar', function (err, _, res) {
                t.ok(err);
                t.equal(res.statusCode, 404);
                CLIENT.get('/bar/foo', function (err2, __, res2) {
                        t.ifError(err2);
                        t.equal(res2.statusCode, 200);
                        t.end();
                });
        });
});


test('405', function (t) {
        SERVER.post('/foo/:id', function posty(req, res, next) {
                t.ok(req.params);
                t.equal(req.params.id, 'bar');
                res.send();
                next();
        });

        CLIENT.get('/foo/bar', function (err, _, res) {
                t.ok(err);
                t.equal(res.statusCode, 405);
                t.equal(res.headers.allow, 'POST');
                t.end();
        });
});


test('PUT ok', function (t) {
        SERVER.put('/foo/:id', function tester(req, res, next) {
                t.ok(req.params);
                t.equal(req.params.id, 'bar');
                res.send();
                next();
        });

        CLIENT.put('/foo/bar', {}, function (err, _, res) {
                t.ifError(err);
                t.equal(res.statusCode, 200);
                t.end();
        });
});


test('PATCH ok', function (t) {
        SERVER.patch('/foo/:id', function tester(req, res, next) {
                t.ok(req.params);
                t.equal(req.params.id, 'bar');
                res.send();
                return next();
        });

        var opts = {
                hostname: 'localhost',
                port: PORT,
                path: '/foo/bar',
                method: 'PATCH',
                agent: false
        };
        http.request(opts, function (res) {
                t.equal(res.statusCode, 200);
                res.on('end', function () {
                        t.end();
                });
        }).end();
});



test('HEAD ok', function (t) {
        SERVER.head('/foo/:id', function tester(req, res, next) {
                t.ok(req.params);
                t.equal(req.params.id, 'bar');
                res.send('hi there');
                next();
        });

        var opts = {
                hostname: 'localhost',
                port: PORT,
                path: '/foo/bar',
                method: 'HEAD',
                agent: false
        };
        http.request(opts, function (res) {
                t.equal(res.statusCode, 200);
                res.on('data', function (chunk) {
                        t.fail('Data was sent on HEAD');
                });
                res.on('end', function () {
                        t.end();
                });
        }).end();
});


test('DELETE ok', function (t) {
        SERVER.del('/foo/:id', function tester(req, res, next) {
                t.ok(req.params);
                t.equal(req.params.id, 'bar');
                res.send(204, 'hi there');
                next();
        });

        var opts = {
                hostname: 'localhost',
                port: PORT,
                path: '/foo/bar',
                method: 'DELETE',
                        agent: false
        };
        http.request(opts, function (res) {
                t.equal(res.statusCode, 204);
                res.on('data', function (chunk) {
                        t.fail('Data was sent on 204');
                });
                t.end();
        }).end();
});


test('OPTIONS', function (t) {
        ['get', 'post', 'put', 'del'].forEach(function (method) {
                SERVER[method]('/foo/:id', function tester(req, res, next) {
                        t.ok(req.params);
                        t.equal(req.params.id, 'bar');
                        res.send();
                        next();
                });
        });

        var opts = {
                hostname: 'localhost',
                port: PORT,
                path: '/foo/bar',
                method: 'OPTIONS',
                agent: false
        };
        http.request(opts, function (res) {
                t.equal(res.statusCode, 200);
                t.ok(res.headers.allow);
                t.equal(res.headers.allow, 'GET, POST, PUT, DELETE');
                t.end();
        }).end();
});


test('RegExp ok', function (t) {
        SERVER.get(/\/foo/, function tester(req, res, next) {
                res.send('hi there');
                next();
        });

        CLIENT.get('/foo', function (err, _, res, obj) {
                t.ifError(err);
                t.equal(res.statusCode, 200);
                t.equal(obj, 'hi there');
                t.end();
        });
});


test('get (path and version ok)', function (t) {
        SERVER.get({
                url: '/foo/:id',
                version: '1.2.3'
        }, function tester(req, res, next) {
                t.ok(req.params);
                t.equal(req.params.id, 'bar');
                res.send();
                next();
        });

        var opts = {
                path: '/foo/bar',
                headers: {
                        'accept-version': '~1.2'
                }
        };
        CLIENT.get(opts, function (err, _, res) {
                t.ifError(err);
                t.equal(res.statusCode, 200);
                t.end();
        });
});


test('get (path and version not ok)', function (t) {
        function respond(req, res, next) {
                res.send();
                next();
        }

        SERVER.get({ url: '/foo/:id', version: '1.2.3' }, respond);
        SERVER.get({ url: '/foo/:id', version: '3.2.1' }, respond);

        var opts = {
                path: '/foo/bar',
                headers: {
                        'accept-version': '~2.1'
                }
        };
        CLIENT.get(opts, function (err, _, res) {
                t.ok(err);
                console.log(err)
                t.equal(err.message, '~2.1');
                t.equal(res.statusCode, 400);
                t.end();
        });
});


test('GH-56 streaming with filed (download)', function (t) {
        SERVER.get('/', function tester(req, res, next) {
                filed(__filename).pipe(res);
        });

        var opts = {
                hostname: 'localhost',
                port: PORT,
                path: '/',
                method: 'GET',
                agent: false
        };
        http.request(opts, function (res) {
                t.equal(res.statusCode, 200);
                var body = '';
                res.setEncoding('utf8');
                res.on('data', function (chunk) {
                        body += chunk;
                });
                res.on('end', function () {
                        t.ok(body.length > 0);
                        t.end();
                });
        }).end();
});


test('GH-59 Query params with / result in a 404', function (t) {
        SERVER.get('/', function tester(req, res, next) {
                res.send('hello world');
                next();
        });

        CLIENT.get('/?foo=bar/foo', function (err, _, res, obj) {
                t.ifError(err);
                t.equal(res.statusCode, 200);
                t.equal(obj, 'hello world');
                t.end();
        });
});


test('GH-63 res.send 204 is sending a body', function (t) {
        SERVER.del('/hello/:name', function tester(req, res, next) {
                res.send(204);
                next();
        });

        var opts = {
                hostname: 'localhost',
                port: PORT,
                path: '/hello/mark',
                method: 'DELETE',
                agent: false,
                headers: {
                        accept: 'text/plain'
                }
        };

        http.request(opts, function (res) {
                t.equal(res.statusCode, 204);
                var body = '';
                res.setEncoding('utf8');
                res.on('data', function (chunk) {
                        body += chunk;
                });
                res.on('end', function () {
                        t.notOk(body);
                        t.end();
                });
        }).end();
});


test('GH-64 prerouting chain', function (t) {
        SERVER.pre(function (req, res, next) {
                req.headers.accept = 'application/json';
                next();
        });

        SERVER.get('/hello/:name', function tester(req, res, next) {
                res.send(req.params.name);
                next();
        });

        var opts = {
                hostname: 'localhost',
                port: PORT,
                path: '/hello/mark',
                method: 'GET',
                agent: false,
                headers: {
                        accept: 'text/plain'
                }
        };
        http.request(opts, function (res) {
                t.equal(res.statusCode, 200);
                var body = '';
                res.setEncoding('utf8');
                res.on('data', function (chunk) {
                        body += chunk;
                });
                res.on('end', function () {
                        t.equal(body, '\"mark\"');
                        t.end();
                });
        }).end();
});


test('GH-64 prerouting chain with error', function (t) {
        SERVER.pre(function (req, res, next) {
                next(new RestError(400, 'BadRequest', 'screw you client'));
        });

        SERVER.get('/hello/:name', function tester(req, res, next) {
                res.send(req.params.name);
                return next();
        });

        CLIENT.get('/hello/mark', function (err, _, res) {
                t.ok(err);
                t.equal(res.statusCode, 400);
                t.end();
        });
});


test('GH-67 extend access-control headers', function (t) {
        SERVER.get('/hello/:name', function tester(req, res, next) {
                res.header('Access-Control-Allow-Headers',
                           (res.header('Access-Control-Allow-Headers') +
                            ', If-Match, If-None-Match'));

                res.send(req.params.name);
                return next();
        });

        CLIENT.get('/hello/mark', function (err, _, res) {
                t.ifError(err);
                t.equal(res.statusCode, 200);
                t.ok(res.headers['access-control-allow-headers']
                     .indexOf('If-Match'));
                t.end();
        });
});


test('GH-77 uncaughtException (default behavior)', function (t) {
        SERVER.get('/', function (req, res, next) {
                throw new Error('Catch me!');
        });

        CLIENT.get('/', function (err, _, res) {
                t.ok(err);
                t.equal(res.statusCode, 500);
                t.end();
        });
});


test('GH-77 uncaughtException (with custom handler)', function (t) {
        SERVER.on('uncaughtException', function (req, res, route, err) {
                res.send(204);
        });
        SERVER.get('/', function (req, res, next) {
                throw new Error('Catch me!');
        });

        CLIENT.get('/', function (err, _, res) {
                t.ifError(err);
                t.equal(res.statusCode, 204);
                t.end();
        });
});


test('GH-97 malformed URI breaks server', function (t) {
        SERVER.get('/echo/:name', function (req, res, next) {
                res.send(200);
                next();
        });

        CLIENT.get('/echo/mark%', function (err, _, res) {
                t.ok(err);
                t.equal(res.statusCode, 400);
                t.end();
        });
});


test('GH-109 RegExp flags not honored', function (t) {
        SERVER.get(/\/echo\/(\w+)/i, function (req, res, next) {
                res.send(200, req.params[0]);
                next();
        });

        CLIENT.get('/ECHO/mark', function (err, _, res, obj) {
                t.ifError(err);
                t.equal(res.statusCode, 200);
                t.equal(obj, 'mark');
                t.end();
        });
});


//
// Disabled, as Heroku (travis) doesn't allow us to write to /tmp
//
/*
test('GH-56 streaming with filed (upload)', function (t) {
        var file = '/tmp/.' + uuid();
        SERVER.put('/foo', function tester(req, res, next) {
                req.pipe(filed(file)).pipe(res);
        });

        CLIENT.put('/foo', 'hello world', function (err, _, res) {
                t.ifError(err);
                t.equal(res.statusCode, 201);
                fs.readFile(file, 'utf8', function (err, data) {
                        t.ifError(err);
                        t.equal(JSON.parse(data), 'hello world');
                        fs.unlink(file, function () {
                                t.end();
                        });
                });
        });
});
*/
