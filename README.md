Laboratory
==========

Laboratory is an experimental Firefox extension that helps you generate a proper Content Security Policy (CSP) header for your website.  Simply start recording, browse your site, and enjoy the CSP header that it produces:

![Preview Image](https://i.imgur.com/Ij1agqQ.png)

Laboratory requires Firefox 57 (Quantum) to function properly.

## Developing and Installing Locally

It is recommend that developers use [web-ext](https://github.com/mozilla/web-ext) for installation and testing.  It provides a number of useful features, such as automated installation and autoreload upon source changes. For testing and development, run `npm install` and then run the following commands in two separate terminal windows:

```bash
$ npm run-script watch
```

```bash
$ web-ext run --browser-console -s build --start-url 'https://badssl.com/'
```

If you are simply looking to give it a single run, you can compile it by running:

```bash
$ npm install
$ npm run-script compile
```

And then in Firefox, go to -> Add-ons -> Extensions -> (Gear Icon) -> Debug Add-ons -> Load Temporary Add-on

Navigate to `build/manifest.json` and it should start running immediately.

Lastly, for a "production" release, simply run:

```bash
$ npm install
$ NODE_ENV=production npm run build
```
