const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  output: {
    path: 'build',
    filename: '[name].js'
  },
  entry: {
    'background': './src/js/laboratory.js',
    'popup/index': './src/popup/js/popup.js'
  },
  resolve: {
    alias: {
      clipboard: 'clipboard/lib/clipboard.js'
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        query: {
          presets: [
            'babel-preset-es2015'
          ]
        }
      },
      {
        test: /\.css$/,
        loaders: [
          'style-loader',
          'css-loader',
          'sass-loader'
        ]
      },
      {
        test: /\.(woff|woff2)$/,
        loader: 'url-loader',
        query: {
          limit: '10000',
          mimetype: 'application/font-woff'
        }
      },
      {
        test: /\.ttf$/,
        loader: 'file-loader'
      },
      {
        test: /\.eot$/,
        loader: 'file-loader'
      },
      {
        test: /\.svg$/,
        loader: 'file-loader'
      }
    ]
  },
  plugins: [
    new webpack.ProvidePlugin({
      Clipboard: 'clipboard',
      $: 'jquery',
      jQuery: 'jquery'
    }),
    new CopyWebpackPlugin([
      {
        from: 'src/manifest.json'
      },
      {
        from: 'src/img',
        to: 'img'
      },
      {
        from: 'src/popup/popup.html',
        to: 'popup/popup.html'
      },
      {
        from: 'src/popup/css',
        to: 'popup/css'
      },
      {
        from: 'src/popup/fonts',
        to: 'popup/fonts'
      }
    ])
  ]
};
