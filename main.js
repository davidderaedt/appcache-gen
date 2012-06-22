/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */
 
/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

/** extension to generate & validate cache manifest files */
define(function (require, exports, module) {
    
    'use strict';


    var CommandManager      = brackets.getModule("command/CommandManager"),
        ProjectManager      = brackets.getModule("project/ProjectManager"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        NativeFileSystem    = brackets.getModule("file/NativeFileSystem").NativeFileSystem,
        FileUtils           = brackets.getModule("file/FileUtils"),
        Dialogs             = brackets.getModule("widgets/Dialogs"),
        Menus               = brackets.getModule("command/Menus");


    var PROJECT_MENU = "project-menu";
    var PROJECT_MENU_NAME = "Project";
    var GEN_COMMAND_ID = "appcache.appcachegen";
    var GEN_MENU_NAME = "Create app cache manifest";
    var VAL_COMMAND_ID = "appcache.appcacheval";
    var VAL_MENU_NAME = "Validate app cache";
    
    var VAL_API_URL = "http://manifest-validator.com/api/validate";
    
    var CFG_ERROR_MSG = "Unable to parse config";
    var GEN_ERROR_MSG = "Unable to create file list";
    var GEN_DONE_MSG = "Application Cache generated. Please check your console.";
    var VAL_ERROR_MSG = "Unable to use validation service";
    var VAL_VALID_MSG = "Application cache is valid!";
    var VAL_INVALID_MSG = "Application cache is NOT valid";
    
    var TOP_CONTENT1 = "CACHE MANIFEST\n\n# Generated by Brackets";
    var TOP_CONTENT2 = "NETWORK:\n*\n\nCACHE:\n\n";
    var MANIFEST_FILE_NAME = "manifest.appcache";
    var CONFIG_FILE_PATH = "/config.json";
    
    var configData;

    var outputString = "";
    

    
    function showMessage(pMessage) {
        // TODO find a better way to handle dialogs
        // Having to use an existing dialog ID since no better choice seems available
        Dialogs.showModalDialog(Dialogs.DIALOG_ID_ERROR, "App Cache Buddy", pMessage);
    }
    
    
    
    function loadConfig(filePath) {
        
        var fileEntry = new NativeFileSystem.FileEntry(filePath);
        
        FileUtils.readAsText(fileEntry)
            .done(function (text, readTimestamp) {
                try {
                    configData = JSON.parse(text);
                } catch (e) {
                    showMessage(CFG_ERROR_MSG + "\n\n" + filePath);
                }
            })
            .fail(function (error) {
                FileUtils.showFileOpenError(error.code, filePath);
            });
    }
    

    
    function getExtension(fileName) {
        
        var dotIndex = fileName.lastIndexOf(".");
        var fileExt = fileName.substr(dotIndex);
        return fileExt;
        
    }

    
    
    function isValidFile(pName) {
        
        var i;
        var exList = configData.exclusions;
        for (i = 0; i < exList.length; i++) {
            var ex = exList[i];
            
            if (pName === ex) {
                return false;
            } else if (ex.charAt(0) === "*") {
                if (getExtension(pName) === getExtension(ex)) {
                    return false;
                }
            }
            
        }
        
        return true;
    }
    

            
    function getContent(dir, prefix) {
        
        outputString += "\n";
        
        dir.createReader().readEntries(
            
            function (entries) {
                
                var entry,
                    entryI;
                
                for (entryI = 0; entryI < entries.length; entryI++) {
                    
                    entry = entries[entryI];
                    //console.log(entry);
                    
                    if (isValidFile(entry.name)) {
                         
                        if (entry.isDirectory) {
                            getContent(entry, prefix + entry.name + "/");
                        } else {
                            outputString += prefix + entry.name + "\n";
                        }
                    }
                    
                }
                
            },
            
            function (error) {
                window.alert(GEN_ERROR_MSG + error);
            }
        );
    }
    

    
    function createAppCacheFile() {
        
        var destinationDir = ProjectManager.getProjectRoot().fullPath;//FileUtils.getNativeModuleDirectoryPath(module);
        
        var promise = ProjectManager.createNewItem(destinationDir, MANIFEST_FILE_NAME, true)
            .done(function (data) {
                console.log("createAppCacheFile");
                DocumentManager.getDocumentForPath(data.fullPath)
                    .done(function (doc) {
                        doc.setText(outputString);
                    });
            });
    }

    

    function doGenerateAppCache(outputToConsole) {
        
        var now = new Date();
        
        outputString = TOP_CONTENT1 + "\n# " + now + "\n\n" + TOP_CONTENT2;
        
        var root = ProjectManager.getProjectRoot();
        
        getContent(root, "");
                    
        if (outputToConsole) {
            console.log(outputString);
            showMessage(GEN_DONE_MSG);
        } else {
            createAppCacheFile();
        }
    }
    
    
    
    function generateAppCache() {
        
        // We need to first check if a manifest already exists before
        // taking the decision of the output method;
        
        ProjectManager.getProjectRoot().getFile(MANIFEST_FILE_NAME, {},
            function success(entry) {
                doGenerateAppCache(true);
            },
            function error(er) {
                doGenerateAppCache(false);
            });
    }
    
    
    
    function validateAppCache() {
        
        var contents = DocumentManager.getCurrentDocument().getText();
        
        console.log(contents);
        
        $.ajax({
            url: VAL_API_URL,
            type: "GET",
            data: "directinput=" + contents,

            error: function (data) {
                showMessage(VAL_ERROR_MSG);
            },

            success: function (data) {
                if (data.isValid === true) {
                    showMessage(VAL_VALID_MSG);
                } else if (data.isValid === false) {
                    var msg = VAL_INVALID_MSG  + "\n\n";
                    var i;
                    for (i = 0; i < data.errors.length; i++) {
                        var er = data.errors[i];
                        msg += er.error + ":" + er.content + "\n";
                    }
                    showMessage(msg);
                }
            }
        });
    }


    
    function initialize() {

        // Register commands
        CommandManager.register(GEN_MENU_NAME, GEN_COMMAND_ID, generateAppCache);
        CommandManager.register(VAL_MENU_NAME, VAL_COMMAND_ID, validateAppCache);
    
        // Add menus
        var fileMenu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
        var projectMenu =  Menus.getMenu(PROJECT_MENU);
        if (!projectMenu) {
            projectMenu = Menus.addMenu(PROJECT_MENU_NAME, PROJECT_MENU, Menus.FIRST);
        }
        
        projectMenu.addMenuItem(GEN_COMMAND_ID);//"menu-project-appcachegen", 
        fileMenu.addMenuDivider();
        fileMenu.addMenuItem(VAL_COMMAND_ID);//"menu-file-appcacheval", 
        
        // Load config
        var moduleDir = FileUtils.getNativeModuleDirectoryPath(module);
        loadConfig(moduleDir + CONFIG_FILE_PATH);
    }
    
    initialize();
    
});