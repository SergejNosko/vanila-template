'use strict';

const path = require('path');
const del = require('del');
const gulp = require('gulp');
const gulplog = require('gulplog');
const combine = require('stream-combiner2').obj;
const throttle = require('lodash.throttle');
const debug = require('gulp-debug');
const sourcemaps = require('gulp-sourcemaps');
const stylus = require('gulp-stylus');
const sass = require('gulp-sass');
const browserSync = require('browser-sync').create();
const gulpIf = require('gulp-if');
const cssnano = require('gulp-cssnano');
const rev = require('gulp-rev');
const revReplace = require('gulp-rev-replace');
const plumber = require('gulp-plumber');
const notify = require('gulp-notify');
const uglify = require('gulp-uglify');
const resolver = require('stylus').resolver;
const AssetsPlugin = require('assets-webpack-plugin');
const webpack = require('webpack');
const notifier = require('node-notifier');

const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV == 'development';

gulp.task('styles', function () {

    return gulp.src('src/css/index.scss')
        .pipe(plumber({
            errorHandler: notify.onError(err => ({
                title: 'Styles',
                message: err.message
            }))
        }))
        .pipe(gulpIf(isDevelopment, sourcemaps.init()))
        .pipe(sass().on('error', sass.logError))
        .pipe(gulpIf(isDevelopment, sourcemaps.write()))
        .pipe(gulpIf(!isDevelopment, combine(cssnano(), rev())))
        .pipe(gulp.dest('dist/css'))
        .pipe(gulpIf(!isDevelopment, combine(rev.manifest('css.json'), gulp.dest('manifest'))));

});

gulp.task('assets', function () {
    return gulp.src('src/*.html', {since: gulp.lastRun('assets')})
        .pipe(gulpIf(!isDevelopment, revReplace({
            manifest: gulp.src('manifest/css.json', {allowEmpty: true})
        })))
        .pipe(gulpIf(!isDevelopment, revReplace({
            manifest: gulp.src('manifest/webpack.json', {allowEmpty: true})
        })))
        .pipe(gulp.dest('dist'));
});

gulp.task('styles:assets', function () {
    return gulp.src('src/images/*.{svg,png}', {since: gulp.lastRun('styles:assets')})
        .pipe(gulp.dest('dist/images'));
});

gulp.task('webpack', function (callback) {

    let options = {
        entry: {
            index: path.join(__dirname, "src/js/index"),
        },
        output: {
            path: __dirname + '/dist/js',
            publicPath: '/js/',
            filename: isDevelopment ? '[name].js' : '[name]-[chunkhash:10].js'
        },
        watch: isDevelopment,
        devtool: isDevelopment ? 'cheap-module-inline-source-map' : null,
        module: {
            loaders: [{
                test: /\.js$/,
                include: path.join(__dirname, "src"),
                loader: 'babel?presets[]=es2015'
            }]
        },
        plugins: [
            new webpack.NoErrorsPlugin() // otherwise error still gives a file
        ]
    };

    if (!isDevelopment) {
        options.plugins.push(
            new webpack.optimize.UglifyJsPlugin({
                compress: {
                    // don't show unreachable variables etc
                    warnings: false,
                    unsafe: true
                }
            }),
            new AssetsPlugin({
                filename: 'webpack.json',
                path: __dirname + '/manifest',
                processOutput(assets) {
                    for (let key in assets) {
                        assets[key + '.js'] = assets[key].js.slice(options.output.publicPath.length);
                        delete assets[key];
                    }
                    return JSON.stringify(assets);
                }
            })
        );

    }

    // https://webpack.github.io/docs/node.js-api.html
    webpack(options, function (err, stats) {
        if (!err) { // no hard error
            // try to get a soft error from stats
            err = stats.toJson().errors[0];
        }

        if (err) {
            notifier.notify({
                title: 'Webpack',
                message: err
            });

            gulplog.error(err);
        } else {
            gulplog.info(stats.toString({
                colors: true
            }));
        }

        // task never errs in watch mode, it waits and recompiles
        if (!options.watch && err) {
            callback(err);
        } else {
            callback();
        }

    });


});

gulp.task('clean', function () {
    return del(['dist', 'manifest']);
});

gulp.task('build', gulp.series('clean', gulp.parallel('styles:assets', 'styles', 'webpack'), 'assets'));

gulp.task('serve', function () {
    browserSync.init({
        server: 'dist'
    });

    browserSync.watch('dist/**/*.*').on('change', browserSync.reload);
});


gulp.task('dev',
    gulp.series(
        'build',
        gulp.parallel(
            'serve',
            function () {
                gulp.watch('src/css/*.scss', gulp.series('styles'));
                gulp.watch('src/*.html', gulp.series('assets'));
                gulp.watch('src/images/*.{svg,png}', gulp.series('styles:assets'));
            }
        )
    )
);
