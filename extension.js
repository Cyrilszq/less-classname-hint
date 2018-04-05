const vscode = require('vscode');
const css = require('css')
const fs = require('fs')
const less = require('less')
const path = require('path')

// 从css中匹配class
const classNameRegex = /[.]([\w-]+)/g
// 触发提示的字符
const completionTriggerChars = ['"', "'", " ", "."]
// 缓存的类名
let classnameList = new Set()
// 锁
let caching = false

/**
 * 读取文件内容，转成字符串
 * @param {文件地址} uri 
 */
function readFile(uri) {
    return new Promise((resolve, reject) => {
        fs.readFile(uri, (err, data) => {
            if(err) reject(err)
            resolve(data.toString())
        })
    })
}

/**
 * 保存所有类名
 */
async function catheClassName() {
    return new Promise(async(resolve, reject) => {
        try {
            let uris = await vscode.workspace.findFiles('**/*.less')
            for(let i = 0; i < uris.length; i++ ) {
                let uri = uris[i]
                let textString = await readFile(uri.fsPath)
                let output = await less.render(textString, {
                    filename: path.resolve(uri.fsPath)
                })
                let ast = css.parse(output.css)
                ast.stylesheet.rules.forEach(rule => {
                if (rule.type === "rule") {
                    rule.selectors.forEach(selector => {
                        let item = classNameRegex.exec(selector)
                        while (item) {
                            classnameList.add(item[1]);
                            item = classNameRegex.exec(selector)
                        }
                    })
                } 
                })
            }
            resolve(classnameList)
        } catch (error) {
            reject(error)
        }
    })
}

// copy from https://github.com/Zignd/HTML-CSS-Class-Completion
function provideCompletionItemsGenerator(languageSelector, classMatchRegex, classPrefix = "", splitChar = " ") {
    return vscode.languages.registerCompletionItemProvider(languageSelector, {
        provideCompletionItems(document, position) {
            const start = new vscode.Position(position.line, 0);
            const range = new vscode.Range(start, position);
            const text = document.getText(range);

            // Check if the cursor is on a class attribute and retrieve all the css rules in this class attribute
            const rawClasses = text.match(classMatchRegex);
            if (!rawClasses || rawClasses.length === 1) {
                return [];
            }

            // Will store the classes found on the class attribute
            // const classesOnAttribute = rawClasses[1].split(splitChar);
            const completionItems = []
            for(let classname of classnameList.values()) {
                const completionItem = new vscode.CompletionItem(classname, vscode.CompletionItemKind.Variable);
                const completionClassName = `${classPrefix}${classname}`;

                completionItem.filterText = completionClassName;
                completionItem.insertText = completionClassName;

                completionItems.push(completionItem)
            }
            return completionItems;
        },
    }, ...completionTriggerChars);
}

async function activate(context) {
    await catheClassName();
    context.subscriptions.push(vscode.commands.registerCommand("classname.cache", async () => {
        if (caching) {
            return;
        }
        caching = true;
        try {
            await catheClassName();
            vscode.window.showInformationMessage('cache success')
        } catch (err) {
            err = new VError(err, "Failed to cache the CSS classes in the workspace");
            console.error(err);
            vscode.window.showErrorMessage(err.message);
        } finally {
            caching = false;
        }
    }));
     // Javascript based extensions
    ["typescriptreact", "javascript", "javascriptreact"].forEach((extension) => {
        context.subscriptions.push(provideCompletionItemsGenerator(extension, /className=["|']([\w- ]*$)/));
        context.subscriptions.push(provideCompletionItemsGenerator(extension, /class=["|']([\w- ]*$)/));
    });

    let statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)
    statusBarItem.text = 'cache classname'
    statusBarItem.command = 'classname.cache'
    statusBarItem.show()
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {}
exports.deactivate = deactivate;