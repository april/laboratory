Laboratory
==========

Laboratory is an experimental Firefox extension that helps you generate a proper Content Security Policy (CSP) header for your website.  Simply start recording, browse your site, and enjoy the CSP header that it produces:

![Preview Image](https://i.imgur.com/dKnWrgK.png)

It currently requires at least Firefox 53.  This means that it currently works with Firefox Developer Edition and Nightly, and should work with release once it reaches version 53.

## Developing and Installing Locally

It is recommend that developers use [web-ext](https://github.com/mozilla/web-ext) for installation and testing.  It provides a number of useful features, such as automated installation and autoreload upon source changes:

```bash
$ web-ext run -s src
```

If you are simply looking to give it a single run, you can install it by navigating to:

Firefox -> Tools -> Add-ons -> Extensions -> (Gear Icon) -> Debug Add-ons -> Load Temporary Add-on

Navigate to `src/manifest.json` and it should start running immediately.
