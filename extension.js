const vscode = require('vscode');
const css = require('css')
const fs = require('fs')
const less = require('less')
const path = require('path')

// 从css中匹配class
const classNameRegex = /[.]([\w-]+)/
// 触发提示的字符
const completionTriggerChars = ['"', "'", " ", "."]
// 缓存的类名
let classnameList = new Set()
// 锁
let caching = false
let statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)

function readFile(uri) {
    return new Promise((resolve, reject) => {
        fs.readFile(uri, (err, data) => {
            if (err) reject(err)
            resolve(data.toString())
        })
    })
}


async function startCacheClassName(uri = '') {
    if (caching) return
    caching = true
    statusBarItem.text = 'caching'
    try {
        await asyncCache(uri)
        statusBarItem.text = 'cache classname(cached)'
        console.log(classnameList.size)
    } catch (error) {
        console.error(error);
        vscode.window.showErrorMessage('Failed to cache the CSS classes in the workspace');
        statusBarItem.text = 'cache classname(cache fail)'
    } finally {
        caching = false
    }
}

async function asyncCache(uri) {
    let uris = []
    let asyncCacheTasks = []
    if(uri) {
        return Promise.resolve(createAsyncTask(uri))
    }
    classnameList.clear()
    uris = await vscode.workspace.findFiles('**/*.less')
    asyncCacheTasks = uris.map((uri, index) => createAsyncTask(uri))
    return Promise.all(asyncCacheTasks)
}

function createAsyncTask(uri) {
    return readFile(uri.fsPath)
        .then(textString => {
            return less.parse(textString, {
                filename: path.resolve(uri.fsPath),
                javascriptEnabled: true
            })
        }).then(ast => {
            catchToList(ast)
        })
        .catch(err => {
            throw err
        })
}

function parseAst(rules, selectors) {
    if (!rules || !rules.length) return
    for (let i = 0; i < rules.length; i++) {
        let rule = rules[i]
        if (rule.selectors) {
            selectors.push(rule.selectors)
        }
        if (rule.rules && rule.rules.length > 0) {
            parseAst(rule.rules, selectors)
        }
    }
}

function catchToList(ast) {
    let rules = ast.rules
    let selectors = []
    parseAst(ast.rules, selectors)
    selectors.forEach(selectorArr => {
        selectorArr.forEach(selector => {
            selector.elements.forEach(element => {
                let item = classNameRegex.exec(element.value)
                if (item) {
                    classnameList.add(item[1])
                }
            })
        })
    })
}

// 配置代码提示框内容
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
            for (let classname of classnameList.values()) {
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
    statusBarItem.text = 'caching classname'
    statusBarItem.command = 'classname.cache'
    statusBarItem.show()
    await startCacheClassName()
    context.subscriptions.push(vscode.commands.registerCommand("classname.cache", async () => {
        await startCacheClassName()
    }));
    // Javascript based extensions
    ["typescriptreact", "javascript", "javascriptreact"].forEach((extension) => {
        context.subscriptions.push(provideCompletionItemsGenerator(extension, /className=["|']([\w- ]*$)/));
        context.subscriptions.push(provideCompletionItemsGenerator(extension, /class=["|']([\w- ]*$)/));
    });
    vscode.workspace.onDidSaveTextDocument((e) => {
        let path = e.uri.fsPath
        let lessRe = /\.less$/
        if (lessRe.test(path)) {
            startCacheClassName(e.uri)
        }
    })
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {}
exports.deactivate = deactivate;