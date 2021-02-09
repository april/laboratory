Laboratory
==========

Laboratory is an experimental Firefox extension that helps you generate a proper Content Security Policy (CSP) header for your website.  Simply start recording, browse your site, and enjoy the CSP header that it produces:

![Preview Image](https://i.imgur.com/Ij1agqQ.png)

Laboratory requires Firefox 57 (Quantum) to function properly.

## Developing and Installing Locally

It is recommend that developers use [web-ext](https://github.com/mozilla/web-ext) for installation and testing.  It provides a number of useful features, such as automated installation and autoreload upon source changes. For testing and development, run `npm install` and then run the following commands in two separate terminal windows:

```bash
$ npm run watch
```

```bash
$ npm run start'
```

This will launch it in both Firefox and Chrome simultaneously. You can alternatively run `npm run start:firefox` or `npm run start:chromium` if you wish to launch it only in a single browser.

Lastly, for a "production" release, run:

```bash
$ npm install
$ NODE_ENV=production npm run build
$ zip dist/laboratory.src.zip *.md config package* src
```
