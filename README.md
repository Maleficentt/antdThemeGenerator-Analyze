# antd-theme-generator 源码解读

`antd-theme-generator`只是针对于颜色的定制，对于其他属性例如字体大小，边框，边距等样式不提供定制

这里只针对`generateTheme`方法和其涉及到的方法进行讲解，其他的方法不予以讲解。官方文档有使用这个方法的例子，请参考：[https://github.com/mzohaibqc/antd-theme-generator](https://github.com/mzohaibqc/antd-theme-generator "antd-theme-generator")

## 参数
### options
* `antDir`: antd包目录，（`path.join(__dirname, './node_modules/antd')`）
* `antdStylesDir`: 可选，antd包目录，（`path.join(__dirname, './node_modules/antd/lib')`）
* `stylesDir`: 自己写的样式目录（后文统称自定义样式），（`path.join(__dirname, './src/styles')`）
* `mainLessFile`: 自定义样式入口文件，（`path.join(__dirname, './src/styles/index.less')`）
* `varFile`: 自定义样式入口文件，（`path.join(__dirname, './src/styles/index.less')`）
* `outputFilePath`: 输出less文件路径，（`path.join(__dirname, './src/styles/index.less')`）
* `themeVariables`: 需要改写的antd主题变量
* `customColorRegexArray`：自定义匹配有效颜色值的正则表达式

## 源码分析
```js
let antdPath;
if (antdStylesDir) {
  antdPath = antdStylesDir;
} else {
  antdPath = path.join(antDir, 'lib');
}
const entry = path.join(antdPath, './styles/index.less'); // antd样式入口文件（less）
const styles = glob.sync(path.join(antdPath, './*/styles/index.less')); // antd中所有的样式文件（less）
/* glob.sync的作用是提取指定文件夹内匹配到的文件目录，返回一个目录数组，如下
 [ 'E:/personal/react/antd-demo/node_modules/antd/lib/affix/style/index.less',        
 'E:/personal/react/antd-demo/node_modules/antd/lib/alert/style/index.less',        
'E:/personal/react/antd-demo/node_modules/antd/lib/anchor/style/index.less', ...]
为节省篇幅我这里只展示一部分 */
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
// content其实就是包含了antd所有样式文件和自定义变量的less文件
```
对于这一段代码，可以先去看一下antd包的目录结构，这样会更清楚  
  
    
```js
return bundle({
  src: varFile
})
  .then(colorsLess => {
    const mappings = Object.assign(generateColorMap(colorsLess, customColorRegexArray), generateColorMap(mainLessFile, customColorRegexArray)); // 色值map（值为色值，不含变量）: { '@blue-base': '#1890ff' }
    return [mappings, colorsLess];
  })
/*
bundle的作用就是把指定样式文件里引入的外部文件的内容全部合在一起
最后我们就得到antd的主题变量的字符串，如下
    '// color palettes
    @blue-base: #1890ff;
    @blue-1: color(~`colorPalette('@{blue-6}', 1) `);
    @blue-2: color(~`colorPalette('@{blue-6}', 2) `);
    @blue-3: color(~`colorPalette('@{blue-6}', 3) `);
    @blue-4: color(~`colorPalette('@{blue-6}', 4) `);
    @blue-5: color(~`colorPalette('@{blue-6}', 5) `);
    @blue-6: @blue-base;
    @blue-7: color(~`colorPalette('@{blue-6}', 7) `);
    @blue-8: color(~`colorPalette('@{blue-6}', 8) `);
    @blue-9: color(~`colorPalette('@{blue-6}', 9) `);
    @blue-10: color(~`colorPalette('@{blue-6}', 10) `);
    ....'

generateColorMap() 过滤掉不是色值的变量，并将变量和具体色值对应起来，最后得到了一个色值的map，如下
    {"@blue-base":"#1890ff","@blue-1":"color(~`colorPalette('@{blue-6}', 1) `)","@blue-2":"color(~`colorPalette('@{blue-6}', 2) `)","@blue-3":"color(~`colorPalette('@{blue-6}', 3) `)","@blue-4":"color(~`colorPalette('@{blue-6}', 4) `)","@blue-5":"color(~`colorPalette('@{blue-6}', 5) `)","@blue-6":"#1890ff","@blue-7":"color(~`colorPalette('@{blue-6}', 7) `)","@blue-8":"color(~`colorPalette('@{blue-6}', 8) `)","@blue-9":"color(~`colorPalette('@{blue-6}', 9) `)","@blue-10":"color(~`colorPalette('@{blue-6}', 10) `)", ....}
  这里的colorPalette方法的实际效果是，输入一个base color，通过输入参数1~5得到比base颜色浅一些的5种颜色，参数7-10可获得比base color深一些的颜色
*/
```
  
    

```js
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
  // 把自定义颜色变量转换成antd变量那样，使用colorPalette方法计算出10个色值

  css = `${colorsLess}\n${css}`; // 与旧的colorsLess字符串进行拼接
  return render(css, lessPaths).then(({ css }) => [ // render方法的作用就是将less文件转换为css
    css,
    mappings,
    colorsLess
  ]);
})
```

* render方法解析
```js
/*
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
```
  
    

```js
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
    return getCssModulesStyles(stylesDir, antdStylesDir).then(customCss => { // 将自定义less样式转换为css, 其实也是利用less.render()进行转换的
      return [
        `${customCss}\n${css}`, // 自定义样式和antd样式
        mappings,
        colorsLess
      ];
    })

  });
})
```

  
    

```js
.then(([css, mappings, colorsLess]) => {
  // css: 自定义样式和antd样式的总和
  return postcss([reducePlugin])
    .process(css, {
      parser: less.parser,
      from: entry
    })
    .then(({ css }) => [css, mappings, colorsLess]);
})
/*
  reducePlugin是自定义postcss插件：删除所有除了颜色以外的css属性
 * /
```
  
    

```js
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
    fs.writeFileSync(outputFilePath, css); // 输出到指定目录
    console.log(
      `🌈 Theme generated successfully. OutputFile: ${outputFilePath}`
    );
  } else {
    console.log(`Theme generated successfully`);
  }
  cssCache = css;
  return resolve(css);
})
````

