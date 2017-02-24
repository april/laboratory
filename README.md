Laboratory
==========

Laboratory is an experimental Firefox extension that helps you generate a proper Content Security Policy (CSP) header for your website.  Simply start recording, browse your site, and enjoy the CSP header that it produces:

![Preview Image](https://i.imgur.com/dKnWrgK.png)

It currently requires at least Firefox 53, so works with Dev Edition and should work with Firefox release once version 53 is released.

## Developing and Installing locally

It is recommend that developers use [web-ext](https://github.com/mozilla/web-ext) for installation and testing.  It provides a number of useful features, such as automated installation and autoreload upon source changes.

```bash
$ web-ext -s src
```

If you are simply looking to give it a single run, you can install it by navigating to:

Firefox -> Tools -> Add-ons -> Extensions -> (Gear Icon) -> Debug Add-ons -> Load Temporary Add-on

Navigate to `src/manifest.json` and it should start running immediately.