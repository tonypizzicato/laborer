'use strict';

var fs = require('fs');
var path = require('path');

var gulp = require('gulp');
var gutil = require("gulp-util");
var sass = require('gulp-sass');
var sassLint = require('gulp-sass-lint');
var postcss = require('gulp-postcss');
var autoprefixer = require('autoprefixer');
var tsc = require('gulp-typescript');
var tslint = require('gulp-tslint');
var sourcemaps = require('gulp-sourcemaps');

var merge = require('merge-stream');
var debug = require('gulp-debug');
var del = require('del');
var typescript = require('typescript');

var mocha = require('gulp-mocha');

var tsLintConfig = require('./tslint-rules');
var sassLintRules = require('./sasslint-rules');
var gr = require('./gulp-reporters');

var webpack = require("webpack");

exports.taskStyle = function(opt) {
  var opt = opt || {};
  var rules = opt.rules || sassLintRules;
  return function() {
    var errorTexts = [];

    return gulp.src('./src/client/**/*.scss')
      .pipe(sassLint({ rules: rules }))
      .pipe(gr.sassLintReporterFactory({ errorTexts: errorTexts }))
      .pipe(sass({
        outputStyle: 'compressed'
      }).on('error', gr.sassErrorFactory({
        errorTexts: errorTexts
      })))
      .pipe(postcss([
        autoprefixer({
          browsers: ['> 1%', 'last 3 versions', 'Firefox ESR', 'Opera 12.1'],
          remove: false // If you have no legacy code, this option will make Autoprefixer about 10% faster.
        })
      ]))
      .pipe(gulp.dest('./build/client'))
      .on('finish', function() {
        gr.writeErrors('./webstorm/errors', errorTexts);
      });
  };
};


exports.taskIcons = function() {
  return function() {
    return gulp.src('./src/client/**/*.svg')
      // Just copy for now
      .pipe(gulp.dest('./build/client'))
  };
};


exports.taskHtml = function() {
  return function() {
    return gulp.src('./src/client/**/*.html')
      // Just copy for now
      .pipe(gulp.dest('./build/client'))
  };
};


exports.taskClientTypeScript = function(opt) {
  var opt = opt || {};
  var declaration = opt.declaration || false;
  return function() {
    var errorTexts = [];

    function fixPath(str) {
      return str.replace('/build/tmp/', '/src/');
    }

    var sourceFiles = gulp.src(['./src/{client,common}/**/*.{ts,tsx}'])
      .pipe(tslint({
        configuration: tsLintConfig
      }))
      .pipe(tslint.report(
        gr.tscLintReporterFactory({
          errorTexts: errorTexts,
          fixPath: fixPath
        }),
        { emitError: false }
      ));

    var typeFiles = gulp.src(['./typings/**/*.d.ts']);

    var compiled = merge(sourceFiles, typeFiles)
    //.pipe(sourcemaps.init())
      .pipe(tsc(
        {
          typescript: typescript,
          noImplicitAny: true,
          noFallthroughCasesInSwitch: true,
          noImplicitReturns: true,
          noEmitOnError: true,
          target: 'ES5',
          module: 'commonjs',
          declaration: declaration,
          jsx: 'react'
        },
        undefined,
        gr.tscReporterFactory({
          errorTexts: errorTexts,
          fixPath: fixPath,
          onFinish: function() { gr.writeErrors('./webstorm/errors', errorTexts); }
        })
      ));
    //.pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: '../client' }))

    if (declaration) {
      return merge([
        compiled.dts.pipe(gulp.dest('./build')),
        compiled.js.pipe(gulp.dest('./build'))
      ])
    } else {
      return compiled.pipe(gulp.dest('./build'));
    }
  };
};


exports.taskServerTypeScript = function(opt) {
  var opt = opt || {};
  var declaration = opt.declaration || false;
  return function() {
    var errorTexts = [];

    var sourceFiles = gulp.src(['./src/{server,common}/**/*.ts'])
      .pipe(tslint({
        configuration: tsLintConfig
      }))
      .pipe(tslint.report(
        gr.tscLintReporterFactory({
          errorTexts: errorTexts
        }),
        { emitError: false }
      ));

    var typeFiles = gulp.src(['./typings/**/*.d.ts']);

    var compiled = merge(sourceFiles, typeFiles)
      //.pipe(sourcemaps.init())
      .pipe(tsc(
        {
          typescript: typescript,
          noImplicitAny: true,
          noFallthroughCasesInSwitch: true,
          noImplicitReturns: true,
          noEmitOnError: true,
          target: 'ES5',
          module: 'commonjs',
          declaration: declaration
        },
        undefined,
        gr.tscReporterFactory({
          errorTexts: errorTexts,
          onFinish: function() { gr.writeErrors('./webstorm/errors', errorTexts); }
        })
      ));
      //.pipe(sourcemaps.write('.', {
      //  includeContent: false,
      //  sourceRoot: '../../src/server'
      //}));

    if (declaration) {
      return merge([
        compiled.dts.pipe(gulp.dest('./build')),
        compiled.js.pipe(gulp.dest('./build'))
      ])
    } else {
      return compiled.pipe(gulp.dest('./build'));
    }
  };
};


var mochaParams = {
  reporter: 'spec'
};

exports.taskUtilsTest = function() {
  return function() {
    return gulp.src('./build/utils/**/*.mocha.js', {read: false})
      // gulp-mocha needs filepaths so you can't have any plugins before it
      .pipe(mocha(mochaParams));
  };
};


exports.taskModelsTest = function() {
  return function() {
    return gulp.src('./build/models/**/*.mocha.js', {read: false})
      // gulp-mocha needs filepaths so you can't have any plugins before it
      .pipe(mocha(mochaParams));
  };
};


exports.taskClientTest = function() {
  return function() {
    return gulp.src('./build/client/**/*.mocha.js', {read: false})
      // gulp-mocha needs filepaths so you can't have any plugins before it
      .pipe(mocha(mochaParams));
  };
};


exports.taskServerTest = function() {
  return function() {
    return gulp.src('./build/server/**/*.mocha.js', {read: false})
      // gulp-mocha needs filepaths so you can't have any plugins before it
      .pipe(mocha(mochaParams));
  };
};


function webpackCompilerFactory(opt) {
  var opt = opt || {};
  var cwd = process.cwd();
  var files = fs.readdirSync(path.join(cwd, '/build/client'));

  var entryFiles = files.filter(function(file) { return /-entry\.js$/.test(file) });
  if (!entryFiles.length) return null;

  var entry = {};
  entryFiles.forEach(function(entryFile) {
    entry[entryFile.substr(0, entryFile.length - 9)] = './build/client/' + entryFile;
  });

  //{
  //  pivot: './build/client/pivot-entry.js'
  //}

  var config = Object.assign({
    context: cwd,
    entry: entry,
    target: 'web',
    output: {
      path: path.join(cwd, "/build/public"),
      filename: "[name].js",
      chunkFilename: "[name].[hash].js"
    },
    resolveLoader: {
      root: path.join(__dirname, "node_modules")
    },
    module: {
      loaders: [
        { test: /\.svg$/, loaders: ['raw-loader', 'svgo-loader?useConfig=svgoConfig1'] },
        { test: /\.css$/, loaders: ['style-loader', 'css-loader'] }
      ]
    },
    svgoConfig1: {
      plugins: [
        // https://github.com/svg/svgo
        { removeTitle: true },
        { removeDimensions: true },
        { convertColors: { shorthex: false } },
        { convertPathData: false }
      ]
    }
  }, opt.webpack || {});

  return webpack(config);
}

exports.taskClientPack = function(opt) {
  var opt = opt || {};
  var showStats = opt.showStats || false;
  return function(callback) {
    var webpackCompiler = webpackCompilerFactory(opt);
    if (!webpackCompiler) return callback();
    webpackCompiler.run(function(err, stats) {
      if (err) throw new gutil.PluginError("webpack", err);
      //if (stats.hasErrors) throw new gutil.PluginError("webpack error", "there were errors");
      if (showStats) {
        gutil.log("[webpack]", stats.toString({
          colors: true
        }));
      }
      callback();
    });
  };
};


exports.clientPackWatch = function(opt) {
  var opt = opt || {};
  var showStats = opt.showStats || false;
  var webpackCompiler = webpackCompilerFactory(opt);
  if (!webpackCompiler) throw new Error('no entry files found');
  webpackCompiler.watch({ // watch options:
    aggregateTimeout: 300 // wait so long for more changes
    //poll: true // use polling instead of native watchers
  }, function(err, stats) {
    if (err) throw new gutil.PluginError("webpack", err);
    //if (stats.hasErrors) throw new gutil.PluginError("webpack error", "there were errors");
    if (showStats) {
      gutil.log("[webpack watch]", stats.toString({
        colors: true
      }));
    }
  });
};


exports.taskClean = function() {
  return function() {
    del.sync(['./build/**'])
  }
};
