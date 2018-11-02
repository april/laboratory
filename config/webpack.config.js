const CopyWebpackPlugin = require('copy-webpack-plugin');
const LicenseWebpackPlugin = require('license-webpack-plugin').LicenseWebpackPlugin;
const path = require('path');
const webpack = require('webpack');
const production = process.env.NODE_ENV === 'production';

module.exports = {
  output: {
    path: path.resolve(__dirname, '..', 'build'),
    filename: '[name].js'
  },
  entry: {
    'background_scripts/laboratory': path.resolve(__dirname, '..', 'src', 'background_scripts', 'laboratory.js'),
    'popup/popup': path.resolve(__dirname, '..', 'src', 'popup', 'popup.js')
  },
  mode: production ? 'production' : 'development',
  devtool: production ? undefined : 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        include: path.resolve(__dirname, '..', 'src'),
        use: [{
          loader: 'babel-loader',
          options: {
            babelrc: false,
            plugins: [
              '@babel/plugin-proposal-object-rest-spread'
            ],
            presets: [
              ['@babel/preset-env', {
                'targets': {
                  'firefox': 57
                },
                'shippedProposals': true
              }]
            ]
          }
        }]
      }
    ]
  },
  plugins: [
    new CopyWebpackPlugin([
      {
        from: 'src/manifest.json'
      },
      {
        from: 'LICENSE.md'
      },
      {
        from: 'src/popup/*.+(html|css|woff2)',
        to: 'popup/',
        flatten: true
      },
      {
        from: 'src/icons/*.svg',
        to: 'icons/',
        flatten: true
      },
      {
        from: 'node_modules/bootstrap/dist/css/bootstrap.min.css',
        to: 'popup/',
      },
      {
        from: 'node_modules/octicons/build/svg/*.svg',
        to: 'popup/octicons',
        flatten: true
      }
    ]),
    new LicenseWebpackPlugin(
      {
        pattern: /.*/,
        outputFilename: '[name].license.txt'
      }
    ),
    new webpack.ProvidePlugin({
      jQuery: 'jquery',
      $: 'jquery'   
    })
  ]
};
