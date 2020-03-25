const fs = require("fs");
const path = require("path");
const glob = require("glob");
const postcss = require("postcss");
const less = require("less");
const bundle = require("less-bundle-promise"); // 把多个less文件合并成一个
const hash = require("hash.js");
const NpmImportPlugin = require('less-plugin-npm-import');
const colorsOnly = require('postcss-colors-only');

const options = {
  withoutGrey: true, // set to true to remove rules that only have grey colors
  withoutMonochrome: true, // set to true to remove rules that only have grey, black, or white colors
};

let hashCache = "";
let cssCache = "";

function randomColor() {
  return '#' + (Math.random() * 0xFFFFFF << 0).toString(16);
}

/*
  Recursively get the color code assigned to a variable e.g.
  @primary-color: #1890ff;
  @link-color: @primary-color;
 
  @link-color -> @primary-color ->  #1890ff
  Which means
  @link-color: #1890ff
*/
function getColor(varName, mappings) { // getColor'(@yellow-base', {})
  const color = mappings[varName];
  if (color in mappings) { // 在mappings中查找该颜色属性是否存在， 存在则返回对应的属性值
    return getColor(color, mappings);
  } else {
    return color; // return (@yellow-base
  }
}
/*
  Read following files and generate color variables and color codes mapping
    - Ant design color.less, themes/default.less
    - Your own variables.less
  It will generate map like this
  {
    '@primary-color': '#00375B',
    '@info-color': '#1890ff',
    '@success-color': '#52c41a',
    '@error-color': '#f5222d',
    '@normal-color': '#d9d9d9',
    '@primary-6': '#1890ff',
    '@heading-color': '#fa8c16',
    '@text-color': '#cccccc',
    ....
  }
*/
function generateColorMap(content, customColorRegexArray = []) {
  return content
    .split("\n") // 换行符分隔字符串
    .filter(line => line.startsWith("@") && line.indexOf(":") > -1) // 筛选出less变量
    .reduce((prev, next) => {
      /**
       * arr.reduce(callback(accumulator, currentValue[, index[, array]])[, initialValue]) => arr.reduce(reducer, initialValue)
       *   reducer(accumulator, currentValue, index, array)
       *     accumulator: 累计器累计回调的返回值; 它是上一次调用回调时返回的累积值，或initialValue。
       *     currentValue: 数组中正在处理的元素。
       *     index（可选）: 数组中正在处理的当前元素的索引。如果提供了initialValue，则起始索引号为0，否则从索引1起始。
       *     array（可选）: 调用reduce()的数组
       *   initialValue（可选）: 作为第一次调用 callback函数时的第一个参数的值。 如果没有提供初始值，则将使用数组中的第一个元素。
       */
      try {
        /**
         * ?=  非捕获元，正向预查，在任何开始匹配圆括号内的正则表达式模式的位置来匹配搜索字符串
         * \S  匹配任何非空字符
         * *   匹配前面的子表达式零次或多次
         * .   匹配除换行符 \n 之外的任何单字符
         * +   匹配前面的子表达式一次或多次, + 等价于 {1,}
         */
        const matches = next.match(
          /(?=\S*['-])([@a-zA-Z0-9'-]+).*:[ ]{1,}(.*);/
        );
        // 假设next = '@yellow-6: @yellow-base;'
        // matches = [ '@yellow-6: @yellow-base;', '@yellow-6', '@yellow-base', index: 0, input: '@yellow-6: @yellow-base;' ]
        if (!matches) {
          return prev;
        }
        let [, varName, color] = matches; // varName = '@yellow-6', color = '@yellow-base'
        /**
         * 判断是否有效的色值
         * 有效则存进prev
         * prev: {
         *   '@blue-base': '#1890ff'
         * }
         */
        if (color && color.startsWith("@")) {
          color = getColor(color, prev); // 将对应的颜色变量转换为颜色值 '@yellow-6: @yellow-base;' => '@yellow-6: #123456'
          if (!isValidColor(color, customColorRegexArray)) return prev;
          prev[varName] = color;
        } else if (isValidColor(color, customColorRegexArray)) {
          prev[varName] = color;
        }
        return prev;
      } catch (e) {
        console.log("e", e);
        return prev;
      }
    }, {});
}

/*
 This plugin will remove all css rules except those are related to colors
 e.g.
 Input: 
 .body { 
    font-family: 'Lato';
    background: #cccccc;
    color: #000;
    padding: 0;
    pargin: 0
 }

 Output: 
  .body {
    background: #cccccc;
    color: #000;
 }

 自定义postcss插件：删除所有除了颜色以外的属性

*/
const reducePlugin = postcss.plugin("reducePlugin", () => {
  const cleanRule = rule => { // 清除以.main-color .palatte-开头的选择器
    if (rule.selector.startsWith(".main-color .palatte-")) {
      rule.remove();
      return;
    }
    let removeRule = true;
    rule.walkDecls(decl => { // 遍历所有属性
      if (
        !decl.prop.includes("color") &&
        !decl.prop.includes("background") &&
        !decl.prop.includes("border") &&
        !decl.prop.includes("box-shadow")
      ) { // 过滤除了color, background, border, box-shadow以外的属性
        decl.remove();
      } else {
        removeRule = false;
      }
    });
    if (removeRule) {
      rule.remove();
    }
  };
  return css => {
    css.walkAtRules(atRule => { // 遍历带@标识的部分并清除
      atRule.remove();
    });

    css.walkRules(cleanRule); // 遍历所有选择器

    css.walkComments(c => c.remove()); // 删除注释
  };
});


// 将自定义变量的css转化为map
function getMatches(string, regex) {
  const matches = {};
  let match;
  /**
   * 在调用非全局的 RegExp 对象的 exec() 方法时，返回的数组与调用方法 String.match() 返回的数组是相同的。
   * 可以通过反复调用 exec() 方法来遍历字符串中的所有匹配文本
   */
  while ((match = regex.exec(string))) {
    if (match[2].startsWith("rgba") || match[2].startsWith("#")) {
      matches[`@${match[1]}`] = match[2];
    }
  }
  return matches;
}

/*
  This function takes less input as string and compiles into css.
  将less编译成css
*/
/**
 * Less 程序化使用
 * less.render(css, options, function(error, output) {})
 * 或
 * less.render(input_data, options)
 *  .then(function(output) {
 *      //code here
 *  },
 *  function(error) {
 *  });
 * options 是一个可选参数，当您不指定回调时返回promise，并在指定回调时返回promise。 您可以通过将其读入字符串并设置主文件的文件名字段来显示文件。
 * options = {
 *   path: [], 如果@import规则中的文件在那个确切的位置不存在，Less将在传递给这个选项的位置上查找它。
 *   javascriptEnabled: true/false,
 *   plugins: [], 预加载插件
 * }
 *
 */
function render(text, paths) {
  return less.render.call(less, text, {
    paths: paths,
    javascriptEnabled: true,
    plugins: [new NpmImportPlugin({ prefix: '~' })]
  });
}

/*
  This funtion reads a less file and create an object with keys as variable names 
  and values as variables respective values. e.g.
  //variabables.less
    @primary-color : #1890ff;
    @heading-color : #fa8c16;
    @text-color : #cccccc;
  
    to

    {
      '@primary-color' : '#1890ff',
      '@heading-color' : '#fa8c16',
      '@text-color' : '#cccccc'
    }

*/
function getLessVars(filtPath) {
  const sheet = fs.readFileSync(filtPath).toString();
  const lessVars = {};
  const matches = sheet.match(/@(.*:[^;]*)/g) || [];

  matches.forEach(variable => {
    const definition = variable.split(/:\s*/);
    const varName = definition[0].replace(/['"]+/g, "").trim();
    lessVars[varName] = definition.splice(1).join(":");
  });
  return lessVars;
}

/*
  This function take primary color palette name and returns @primary-color dependent value
  这个函数接受主色调名称并返回@primary-color相关的值
  .e.g 
  Input: @primary-1
  Output: color(~`colorPalette("@{primary-color}", ' 1 ')`)
*/
function getShade(varName) {
  let [, className, number] = varName.match(/(.*)-(\d)/);
  if (/primary-\d/.test(varName)) className = '@primary-color';
  return 'color(~`colorPalette("@{' + className.replace('@', '') + '}", ' + number + ")`)";
}

/*
  This function takes color string as input and return true if string is a valid color otherwise returns false.
  e.g.
  isValidColor('#ffffff'); //true
  isValidColor('#fff'); //true 
  isValidColor('rgba(0, 0, 0, 0.5)'); //true
  isValidColor('20px'); //false
*/
function isValidColor(color, customColorRegexArray = []) {
  if (!color || color.match(/px/g)) return false;
  if (color.match(/colorPalette|fade/g)) return true;
  if (color.charAt(0) === "#") {
    color = color.substring(1);
    return (
      [3, 4, 6, 8].indexOf(color.length) > -1 && !isNaN(parseInt(color, 16))
    );
  }
  const isColor = /^(rgb|hsl|hsv)a?\((\d+%?(deg|rad|grad|turn)?[,\s]+){2,3}[\s\/]*[\d\.]+%?\)$/i.test(
    color
  );
  if (isColor) return true;
  if (customColorRegexArray.length > 0) {
    return customColorRegexArray.reduce((prev, regex) => {
      return prev || regex.test(color);
    }, false);
  }
  return false;
}

/**
 * 将自定义less样式文件全部转化为css
 * @param {*} stylesDir 
 * @param {*} antdStylesDir 
 */
function getCssModulesStyles(stylesDir, antdStylesDir) {
  const styles = glob.sync(path.join(stylesDir, './**/*.less'));
  return Promise.all(
    styles.map(p =>
      less
        .render(fs.readFileSync(p).toString(), {
          paths: [
            stylesDir,
            antdStylesDir,
          ],
          filename: path.resolve(p),
          javascriptEnabled: true,
          plugins: [new NpmImportPlugin({ prefix: '~' })],
        })
        .catch(() => '\n')
    )
  )
    .then(csss => csss.map(c => c.css).join('\n'))
    .catch(err => {
      console.log('Error', err);
      return '';
    });
}

/*
  This is main function which call all other functions to generate color.less file which contins all color
  related css rules based on Ant Design styles and your own custom styles
  By default color.less will be generated in /public directory
*/
function generateTheme({
  antDir,         // antd包目录
  antdStylesDir,  // antd样式文件目录
  stylesDir,      // 输出样式的目录
  mainLessFile,   // 自定义样式入口文件
  varFile,        // 自定义主题样式文件
  outputFilePath, // 输出样式文件的路径
  cssModules = false,
  themeVariables = ['@primary-color'], // 需要改写的主题变量
  customColorRegexArray = [] // 自定义有效颜色值正则表达式
}) {
  return new Promise((resolve, reject) => {
    /*
    Ant Design Specific Files (Change according to your project structure)
    You can even use different less based css framework and create color.less for  that
  
    - antDir - ant design instalation path
    - entry - Ant Design less main file / entry file
    - styles - Ant Design less styles for each component
  */
    let antdPath;
    if (antdStylesDir) {
      antdPath = antdStylesDir;
    } else {
      antdPath = path.join(antDir, 'lib');
    }
    const entry = path.join(antdPath, './styles/index.less'); // antd样式入口文件（less）
    const styles = glob.sync(path.join(antdPath, './*/styles/index.less')); // antd中所有的样式文件（less）

    /*
      You own custom styles (Change according to your project structure)
      
      - stylesDir - styles directory containing all less files 
      - mainLessFile - less main file which imports all other custom styles
      - varFile - variable file containing ant design specific and your own custom variables
    */
    varFile = varFile || path.join(antdPath, "./styles/common/index.less"); // 包含antd和自定义变量的变量文件

    let content = fs.readFileSync(entry).toString(); // 读取antd样式入口文件
    content += "\n";
    styles.forEach(style => { // 在样式入口文件中引入所有样式文件
      content += `@import "${style}";\n`;
    });
    if (mainLessFile) {
      const customStyles = fs.readFileSync(mainLessFile).toString(); // 读取自定义样式入口文件
      content += `\n${customStyles}`; // 自定义样式追加至antd样式入口文件
    }

    // 添加哈希缓存， 判断文件内容是否有变化
    const hashCode = hash.sha256().update(content).digest('hex');
    if (hashCode === hashCache) {
      resolve(cssCache);
      return;
    }
    hashCache = hashCode;

    let themeCompiledVars = {};
    let themeVars = themeVariables || ["@primary-color"];
    const lessPaths = [
      path.join(antdPath, "./style"),
      stylesDir
    ];

    return bundle({
      src: varFile
    })
      .then(colorsLess => {
        const mappings = Object.assign(generateColorMap(colorsLess, customColorRegexArray), generateColorMap(mainLessFile, customColorRegexArray)); // 色值map（值为色值，不含变量）: { '@blue-base': '#1890ff' }
        return [mappings, colorsLess];
      })
      .then(([mappings, colorsLess]) => {
        let css = "";
        themeVars = themeVars.filter(name => name in mappings); // 筛选出自定义变量中与antd重复的变量
        themeVars.forEach(varName => {
          const color = mappings[varName];
          css = `.${varName.replace("@", "")} { color: ${color}; }\n ${css}`; // 转换为类选择器
        });
        // css:
        // .link-color { color: #00375B; }
        // .primary-color { color: #00375B; }

        themeVars.forEach(varName => {
          [1, 2, 3, 4, 5, 7].forEach(key => {
            let name = varName === '@primary-color' ? `@primary-${key}` : `${varName}-${key}`;
            css = `.${name.replace("@", "")} { color: ${getShade(name)}; }\n ${css}`; //  color(~`colorPalette("@{primary-color}", ' 1 ')`)
          });
        });
        // colorPalette方法的作用：输入一个base color，通过输入参数1~5得到比base颜色浅一些的5种颜色，参数7-10可获得比base color深一些的颜色。
        // .link-color-7 { color: color(~`colorPalette("@{link-color}", 7)`); }
        // .link-color-5 { color: color(~`colorPalette("@{link-color}", 5)`); }
        // .link-color-4 { color: color(~`colorPalette("@{link-color}", 4)`); }
        // .link-color-3 { color: color(~`colorPalette("@{link-color}", 3)`); }
        // .link-color-2 { color: color(~`colorPalette("@{link-color}", 2)`); }
        // .link-color-1 { color: color(~`colorPalette("@{link-color}", 1)`); }
        // .primary-7 { color: color(~`colorPalette("@{primary-color}", 7)`); }
        // .primary-5 { color: color(~`colorPalette("@{primary-color}", 5)`); }
        // .primary-4 { color: color(~`colorPalette("@{primary-color}", 4)`); }
        // .primary-3 { color: color(~`colorPalette("@{primary-color}", 3)`); }
        // .primary-2 { color: color(~`colorPalette("@{primary-color}", 2)`); }
        // .primary-1 { color: color(~`colorPalette("@{primary-color}", 1)`); }
        // .link-color { color: #00375B; }
        // .primary-color { color: #00375B; }

        css = `${colorsLess}\n${css}`; // 与旧的colorsLess字符串进行拼接
        return render(css, lessPaths).then(({ css }) => [ // 将自定义变量less文件转换为css
          css,
          mappings,
          colorsLess
        ]);
      })
      .then(([css, mappings, colorsLess]) => {
        css = css.replace(/(\/.*\/)/g, ""); // 清除css中的注释
        const regex = /.(?=\S*['-])([.a-zA-Z0-9'-]+)\ {\n\ \ color:\ (.*);/g;
        themeCompiledVars = getMatches(css, regex); // 将自定义变量转换为map的形式
        /**
         * { '@link-color-7': '#001e36',
              '@link-color-5': '#114869',
              '@link-color-4': '#265b75',
              '@link-color-3': '#3e6e82',
              '@link-color-2': '#5b818f',
              '@link-color-1': '#8c989c',
              '@primary-7': '#001e36',
              '@primary-5': '#114869',
              '@primary-4': '#265b75',
              '@primary-3': '#3e6e82',
              '@primary-2': '#5b818f',
              '@primary-1': '#8c989c',
              '@link-color': '#00375B',
              '@primary-color': '#00375B' }
         */
        content = `${content}\n${colorsLess}`; // 将antd变量less文件的内容添加到content
        return render(content, lessPaths).then(({ css }) => { //将antd的所有less样式文件转化为css
          return getCssModulesStyles(stylesDir, antdStylesDir).then(customCss => { // 将自定义less样式转换为css
            return [
              `${customCss}\n${css}`, // 自定义样式和antd样式
              mappings,
              colorsLess
            ];
          })

        });
      })
      .then(([css, mappings, colorsLess]) => {
        // css: 自定义样式和antd样式的总和
        return postcss([reducePlugin])
          // return postcss.use(colorsOnly(options))
          .process(css, {
            parser: less.parser,
            from: entry
          })
          .then(({ css }) => [css, mappings, colorsLess]);
      })
      .then(([css, mappings, colorsLess]) => {
        Object.keys(themeCompiledVars).forEach(varName => {
          let color;
          if (/(.*)-(\d)/.test(varName)) {
            color = themeCompiledVars[varName];
            varName = getShade(varName);
          } else {
            color = themeCompiledVars[varName];
          }
          color = color.replace('(', '\\(').replace(')', '\\)');
          // css = css.replace(new RegExp(`${color}`, "g"), varName); // Fixed bug https://github.com/mzohaibqc/antd-theme-webpack-plugin/issues/25
          css = css.replace(new RegExp(`${color}` + ' *;', "g"), `${varName};`); //将颜色值替换为变量名
        });

        css = `${colorsLess}\n${css}`; // less变量 + css样式

        themeVars.reverse().forEach(varName => {
          css = css.replace(new RegExp(`${varName}(\ *):(.*);`, 'g'), ''); // 去除antd原有的变量
          css = `${varName}: ${mappings[varName]};\n${css}\n`; // 添加自定义变量
        });
        css = css.replace(/\\9/g, '');
        if (outputFilePath) { 
          fs.writeFileSync(outputFilePath, css);
          console.log(
            `🌈 Theme generated successfully. OutputFile: ${outputFilePath}`
          );
        } else {
          console.log(`Theme generated successfully`);
        }
        cssCache = css;
        return resolve(css);
      })
      .catch(err => {
        console.log("Error", err);
        reject(err);
      });
  });
}

module.exports = {
  generateTheme,
  isValidColor,
  getLessVars,
  randomColor,
  renderLessContent: render
};
