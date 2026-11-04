var gulp = require('gulp');
var webpack = require('webpack-stream');
const replace = require('gulp-replace');
var clean = require('gulp-clean');
var argv = require('yargs').argv;
var fs = require('fs');
var path = require('path');

gulp.task('drop-cache', function(){
     return gulp.src(['./src/main/resources/public/dist'], { read: false, allowEmpty: true })
		.pipe(clean());
});

// Polices binaires : sans encoding:false, gulp 5 les relit en UTF-8 et les corrompt en silence.
gulp.task('copy-mdi-font', gulp.series('drop-cache', function () {
    return gulp.src('./node_modules/@mdi/font/fonts/*', { encoding: false })
        .pipe(gulp.dest('./src/main/resources/public/font/material-design/fonts'));
}));

gulp.task('webpack', gulp.series('copy-mdi-font', (done) => {
    // Appel direct du webpack embarqué par webpack-stream (webpack 1, celui qui a toujours produit
    // les bundles) : ses flux « through » ne se raccordent pas à ceux de gulp 5. Les erreurs de
    // typage restent signalées sans interrompre le build, comme sous gulp 3.
    var config = require('./webpack.config.js');
    config.output.path = path.resolve(__dirname, './src/main/resources/public/dist');
    webpack.webpack(config, (err, stats) => {
        if (stats) console.log(stats.toString({ colors: false, chunks: false }));
        done(err);
    });
}));

function views() {
    return gulp.src("./src/main/resources/view-src/**/*.html")
        .pipe(replace('@@VERSION', Date.now()))
        .pipe(gulp.dest("./src/main/resources/view"));
}

function copyBehaviours() {
    return gulp.src('./src/main/resources/public/dist/behaviours.js')
        .pipe(gulp.dest('./src/main/resources/public/js'));
}

gulp.task('build', gulp.series('webpack', gulp.parallel(views, copyBehaviours)));

function getModName(fileContent){
    var getProp = function(prop){
        return fileContent.split(prop + '=')[1].split(/\r?\n/)[0];
    }
    return getProp('modowner') + '~' + getProp('modname') + '~' + getProp('version');
}

gulp.task('watch', () => {
    var springboard = argv.springboard;
    if(!springboard){
        springboard = '../springboard-open-ent/';
    }
    if(springboard[springboard.length - 1] !== '/'){
        springboard += '/';
    }

    gulp.watch('./src/main/resources/public/ts/**/*.ts', gulp.series('build'));

    fs.readFile("./gradle.properties", "utf8", function(error, content){
        var modName = getModName(content);
        function copyToSpringboard() {
            console.log('Copying resources to ' + springboard + 'mods/' + modName);
            return gulp.src('./src/main/resources/**/*', { encoding: false })
                .pipe(gulp.dest(springboard + 'mods/' + modName));
        }
        gulp.watch(['./src/main/resources/public/template/**/*.html', '!./src/main/resources/public/template/entcore/*.html'], copyToSpringboard);
        gulp.watch('./src/main/resources/view/**/*.html', copyToSpringboard);
    });
});
