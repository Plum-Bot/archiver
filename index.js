/*
 * Copyright (c) 2020 Bowser65
 * Licensed under the Open Software License version 3.0
 */

const { existsSync, createReadStream } = require('fs')
const { resolve, join } = require('path')
const mime = require('mime-types')
const https = require('https')
const ejs = require('ejs')
const { minify } = require('html-minifier')

const markdown = require('./src/markdown')
const Formatter = require('./src/formatter')

// Stuff
const assets = require('./src/assets')
const config = require('./config')
const testData = require('./example')

function startServer(port) {
    return require('http')
        .createServer((req, res) => {
            if (!['GET', 'POST'].includes(req.method)) {
                res.writeHead(405)
                return res.end()
            }

            // Assets
            if (req.url.startsWith('/dist/')) {
                const target = req.url.split('/')[2]
                const file = resolve(__dirname, 'dist', target)
                if (existsSync(file) && target && target !== '.' && target !== '..') {
                    res.setHeader('content-type', mime.lookup(file) || 'application/octet-stream')
                    res.setHeader('Access-Control-Allow-Origin', '*')
                    return createReadStream(file).pipe(res)
                }        
            }

            // Attachments
            if (req.url.startsWith('/attachments/')) {
                const headers = {}
                if (req.headers.range) {
                    headers.range = req.headers.range
                }

                https.get({
                    host: 'cdn.discordapp.com',
                    path: req.url,
                    port: 443,
                    headers
                }, resp => {
                    delete resp.headers['content-disposition']
                    res.writeHead(resp.statusCode, {
                        ...resp.headers,
                        'Access-Control-Allow-Origin': '*'
                    })
                    resp.pipe(res)
                })
                return
            }

            // Serve
            const handler = async (data) => {
                const fm = new Formatter(data)
                const formatted = await fm.format()
                if (!formatted) {
                    res.writeHead(400)
                    return res.end()
                }
                const hostname = config.hostname ? config.hostname : `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`
                ejs.renderFile('./views/index.ejs', {
                    data: formatted,
                    assets,
                    markdown,
                    hostname
                }, null, (err, str) => {
                    if (err) {
                        res.writeHead(500)
                        res.end('Internal Server Error')
                        console.error(err)
                    }
                    try {
                        res.end(minify(str, {
                            collapseWhitespace: true,
                            removeComments: true
                        }))
                    } catch (e) {
                        console.log(res.end(str));
                    }
                })
            }

            res.setHeader('content-type', 'text/html')
            if (req.method === 'POST') {
                let data = ''
                req.on('data', chunk => (data += chunk))
                req.on('end', () => handler(JSON.parse(data)))
            } else {
                return handler(testData)
            }
        }).listen(port)
}


function generatePage(data) {
    return new Promise(async (resolve, reject) => {
        const fm = new Formatter(data);
        const formatted = await fm.format()
        if (!formatted) {
            console.log(400);
            reject({ code: 400 });
        }
        const hostname = config.hostname // ? config.hostname : `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`
        ejs.renderFile(join(__dirname, 'views', 'index.ejs'), {
            data: formatted,
            assets,
            markdown,
            hostname
        }, null, (err, str) => {
            if (err) {
                console.log(500, err)
                return reject({ code: 500, err: 'Internal Server Error' })
            }
            try {
                return resolve(minify(str, {
                    collapseWhitespace: true,
                    removeComments: true
                }));
            } catch (e) {
                // console.log(str);
                return resolve(str);
            }
        })
    })
}

module.exports = {
    generatePage,
    startServer
}