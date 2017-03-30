/*jslint browser:true, nomen:true, plusplus: true */
/*global mx, mendix, require, console, alert, define, module, logger */
/**
    Widget Name
    ========================

    @file      : BootstrapTreeViewWidget.js
    @version   : 1.0
    @author    : Marcel Groeneweg
    @date      : 16-02-2017
    @copyright : ITvisors
    @license   : Apache License, Version 2.0, January 2004

    Documentation
    =============
    Mendix Tree view widget
    This widget was started as pure Dojo widget. Only the parts related to drag/drop are implemented using jQuery

*/
define([

    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",
    "dojo/dom",
    "dojo/query",
    "dojo/dom-class",
    "dojo/dom-construct",
    "dojo/dom-style",
    "dojo/_base/lang",
    "dojo/text",
    "dojo/_base/event",
    "dojo/window",
    "BootstrapTreeViewWidget/lib/jquery.ui.touch-punch"

], function (declare, _WidgetBase, dom, dojoQuery, domClass, domConstruct, domStyle, lang, text, dojoEvent, dojoWindow, $) {
    "use strict";

    // Declare widget.
    return declare("BootstrapTreeViewWidget.widget.BootstrapTreeViewWidget", [ _WidgetBase ], {

        /**
         * Widget properties.
         * ======================
         */

        // Configuration
        actionAttr: "",
        selectionKeyAttr: "",
        allowDnD: false,
        draggedReference: "",
        dropTargetReference: "",

        // Data source
        dataEntity: "",
        captionAttr: "",
        appKeyAttr: "",
        classAttr: "",
        draggableClassAttr: "",
        dropTargetSelectorAttr: "",
        parentReference: "",

        // Events
        getDataMicroflow: "",
        onClickMicroflow: "",
        onDropMicroflow: "",

        // Styling
        baseClass: "",
        mainNodeClass: "",
        subNodeClass: "",
        expandableNodeClass: "",
        expandedClass: "",
        collapsedClass: "",
        leafNodeClass: "",
        clickableNodeClass: "",
        nonClickableNodeClass: "",
        selectedNodeClass: "",
        draggableNodeClass: "",
        dropTargetNodeClass: "",
        dropTargetHoverClass: "",

        /**
         * Internal variables.
         * ======================
         */
        _contextObj                         : null,
        _handle                             : null,

        // Extra variables
        _objMap                             : null,     // The objects as returned by the microflow
        _appKeyMap                          : null,     // Application key map
        _nodeClassMap                       : null,     // The node classes as set on the widget. These are kept separately because we need to
                                                        // remove the previous value from the DOM element when updating the tree.
                                                        // The Mendix object has already been changed when the node is updated
        _parentObjMap                       : null,
        _collapsedElementMap                : null,
        _ulMainElement                      : null,
        _currentDepth                       : 0,
        _parentReferenceName                : null,
        _getDataMicroflowCallPending        : null,
        _progressDialogId                   : null,

        // Fixed values
        MAX_DEPTH                           : 50,
        ATTR_LEVEL                          : "data-level",
        ATTR_OBJ_ID                         : "data-objId",
        ACTION_REFRESH                      : "refresh",
        ACTION_UPDATE                       : "update",
        ACTION_SET_SELECTION                : "setSelection",

        /**
         * Mendix Widget methods.
         * ======================
         */

            // DOJO.WidgetBase -> PostCreate is fired after the properties of the widget are set.
        postCreate: function () {

            // postCreate
        //    console.log("BootstrapTreeViewWidget - postCreate");
                
            this._objMap = {};
            this._appKeyMap = {};
            this._nodeClassMap = {};
            this._parentObjMap = {};
            this._collapsedElementMap = {};

            // Load CSS ... automatically from ui directory

            // Setup widget
            this._setupWidget();

            // Setup events
            this._setupEvents();

        },

        /**
         * What to do when data is loaded?
         */

        update : function (obj, callback) {

        //    console.log("BootstrapTreeViewWidget  - update");

            if (this._handle) {
                mx.data.unsubscribe(this._handle);
            }

            this._contextObj = obj;

            if (obj === null) {
                // Sorry no data no show!
                console.log("BootstrapTreeViewWidget  - update - We did not get any context object!");
            } else {
                // Almost all data is cleared with each refresh of the widget.
                // The collapsed element map is kept to collaps nodes that were collapsed before the refresh.
                // When we get a new context object, the map must be cleared.
                this._collapsedElementMap = {};
                // Load data
                this._loadData();
                this._handle = mx.data.subscribe({
                    guid: this._contextObj.getGuid(),
                    callback: lang.hitch(this, this._loadData)
                });
            }

        //    console.log("BootstrapTreeViewWidget  - update end");

            if (callback !== "undefined") {
                callback();
            }
        },

        uninitialize: function () {
            if (this._handle) {
                mx.data.unsubscribe(this._handle);
            }
            if (this._progressDialogId) {
                this._hideProgress();
            }
        },

        /**
         * Extra setup widget methods.
         * ======================
         */
        _setupWidget: function () {

            this._parentReferenceName = this.parentReference.substr(0, this.parentReference.indexOf("/"));

            domClass.add(this.domNode, this.baseClass);
        },

        // Attach events to newly created nodes.
        _setupEvents: function () {

        },

        /**
         * Interaction widget methods.
         * ======================
         */
        _loadData : function () {

        //    console.log("_loadData: " + this._contextObj.get(this.actionAttr));

            switch (this._contextObj.get(this.actionAttr)) {
            case this.ACTION_REFRESH:
            case this.ACTION_UPDATE:
                // Reload or update data
                if (this._getDataMicroflowCallPending) {
                    // When the microflow commits the context object, we might go into an endless loop!
                    console.log("Skipped microflow call as we did not get an answer from a previous call.");
                } else {
                    this._getDataMicroflowCallPending = true;
                    this._showProgress();
                    mx.data.action({
                        params: {
                            applyto: "selection",
                            actionname: this.getDataMicroflow,
                            guids: [this._contextObj.getGuid()]
                        },
                        callback: lang.hitch(this, this._showData),
                        error: function (error) {
                            this._hideProgress();
                            this._getDataMicroflowCallPending = false;
                            console.log(error.description);
                        }
                    }, this);
                }
                break;

            case this.ACTION_SET_SELECTION:
                this._setSelection(this._contextObj.get(this.selectionKeyAttr));
                this._resetAction();

                break;

            default:
            }

        //    console.log("_loadData end");

        },

        _showData : function (objList) {
            var action,
                selectedKey;

        //    console.log("_showData");

            action = this._contextObj.get(this.actionAttr);
            switch (action) {
            case this.ACTION_REFRESH:
                // Reload entire tree
                this._reloadTree(objList);
        //            console.log("_showData tree has been created");
                break;

            case this.ACTION_UPDATE:
                // Update data, add or update nodes
                this._updateTree(objList);
        //            console.log("_showData tree has been updated");
                break;

            }

            // If a selection was passed in, select it again
            selectedKey = this._contextObj.get(this.selectionKeyAttr);
            if (selectedKey) {
                this._setSelection(selectedKey);
            }

            // Reset the action before processing the selection to prevent a loop
            this._resetAction();
            this._getDataMicroflowCallPending = false;
            this._hideProgress();

        //    console.log("_showData end");
        },

        _resetAction : function () {

            this._contextObj.set(this.actionAttr, "");
            this._contextObj.set(this.selectionKeyAttr, "");
            mx.data.commit({
                mxobj    : this._contextObj,
                callback : function (obj) {},
                error    : function (error) {
                    console.log(error.description);
                    console.dir(error);
                }
            });
        },

        _reloadTree : function (objList) {
            var appKey,
                element,
                mainObjMap = {},
                obj,
                objId,
                objIndex,
                parentId;

            // Destroy any old data.
            domConstruct.empty(this.domNode);
            this._objMap = {};
            this._appKeyMap = {};
            this._parentObjMap = {};
            this._nodeClassMap = {};

            // Process all nodes, group by parent node and find the nodes with no parent.
            for (objIndex = 0; objIndex < objList.length; objIndex = objIndex + 1) {
                obj = objList[objIndex];
                objId = obj.getGuid();
                parentId = obj.getReference(this._parentReferenceName);
                this._updateObjMaps(obj);
                if (!parentId) {
                    mainObjMap[objId] = obj;
                }
            }

            // Create the list(s)
            this._ulMainElement = document.createElement("ul");
            this._ulMainElement.id = "ul" + this._contextObj.getGuid();
            domClass.add(this._ulMainElement, this.baseClass);
            this._currentDepth = 0;
            this._showObjList(this._ulMainElement, mainObjMap, this.mainNodeClass);

            // Show the tree
            this.domNode.appendChild(this._ulMainElement);

            // Set collapsed status on nodes that were collapsed before the refresh
            for (appKey in this._collapsedElementMap) {
                if (this._collapsedElementMap.hasOwnProperty(appKey)) {
                    obj = this._appKeyMap[appKey];
                    element = dom.byId("li" + obj.getGuid());
                    if (element) {
                        this._hideNode(element);
                    } else {
                        // No longer exists
                        delete this._collapsedElementMap[appKey];
                    }
                }
            }

        },

        _updateTree : function (objList) {
            var elementCreated,
                existingObjList = [],
                newObjList = [],
                obj,
                objId,
                objIndex,
                parentElement,
                parentId,
                spanClass,
                spanElement,
                skippedObjList;

            // No data returned
            if (objList === null) {
                return;
            }

            // No array returned
            if (Object.prototype.toString.call(objList) !== "[object Array]") {
                return;
            }


            // First split the list in new and existing objects and update the object maps
            for (objIndex = 0; objIndex < objList.length; objIndex = objIndex + 1) {
                obj = objList[objIndex];
                objId = obj.getGuid();
                if (this._objMap.hasOwnProperty(objId)) {
                    existingObjList.push(obj);
                } else {
                    newObjList.push(obj);
                }
            }

            // Process the existing objects
            for (objIndex = 0; objIndex < existingObjList.length; objIndex = objIndex + 1) {
                obj = existingObjList[objIndex];
                objId = obj.getGuid();

                // Find the element and set the caption
                spanElement = dom.byId("span" + objId);
                spanElement.firstChild.nodeValue = obj.get(this.captionAttr);

                // Remove the node class if there is one.
                spanClass = this._nodeClassMap[objId];
                if (spanClass) {
                    domClass.remove(spanElement, spanClass);
                }

                // If the new object has a node class, set it.
                spanClass = obj.get(this.classAttr);
                spanElement.id = "span" + objId;
                if (spanClass) {
                    domClass.add(spanElement, spanClass);
                    this._nodeClassMap[objId] = spanClass;
                }

                // Update the object maps.
                this._updateObjMaps(obj);
            }

            // Process the new objects, these may be in any order.
            // To prevent an endless loop, a flag is set during each run whether an element was created.
            do {
                elementCreated = false;
                skippedObjList = [];
                for (objIndex = 0; objIndex < newObjList.length; objIndex = objIndex + 1) {
                    obj = newObjList[objIndex];
                    objId = obj.getGuid();
                    // Add object in the tree
                    parentId = obj.getReference(this._parentReferenceName);
                    if (parentId) {
                        // Attempt to find list item node. If the objects are not ordered correctly, the parent may not be in the tree yet.
                        parentElement = dom.byId("li" + parentId);
                        if (parentElement) {
                            // Is parent element currently a leaf node? If so, transform to expandable node
                            if (domClass.contains(parentElement, this.leafNodeClass)) {
                                domClass.replace(parentElement, this.expandableNodeClass + " " + this.expandedClass, this.leafNodeClass);
                            }
                            this._createNode(parentElement, obj, this.subNodeClass);
                            elementCreated = true;
                            // Update the object maps.
                            this._updateObjMaps(obj);
                        } else {
                            skippedObjList.push(obj);
                        }
                    } else {
                        // No parent, add at highest level
                        this._createNode(this._ulMainElement, obj, this.mainNodeClass);
                        elementCreated = true;
                    }
                }
                // In the next run, only process the objects that were skipped.
                newObjList = skippedObjList;

            } while (elementCreated);


        },

        _updateObjMaps : function (obj) {
            var appKey,
                objId,
                objMap,
                parentId;

            objId = obj.getGuid();
            parentId = obj.getReference(this._parentReferenceName);
            this._objMap[objId] = obj;
            if (parentId) {
                if (this._parentObjMap[parentId]) {
                    objMap = this._parentObjMap[parentId];
                    objMap[objId] = obj;
                } else {
                    objMap = {};
                    objMap[objId] = obj;
                    this._parentObjMap[parentId] = objMap;
                }
            }
            appKey = obj.get(this.appKeyAttr);
            if (appKey) {
                this._appKeyMap[appKey] = obj;
            }
        },

        _showObjList : function (parentElement, objMap, extraLiClass) {
            var
                liElement,
                obj,
                objId;

            if (this._currentDepth === this.MAX_DEPTH) {
                console.log(this.domNode.id + ": Recursion depth exceeded maximum: " + this.MAX_DEPTH);
                return;
            }
            this._currentDepth = this._currentDepth + 1;
            for (objId in objMap) {
                if (objMap.hasOwnProperty(objId)) {
                    obj = objMap[objId];
                    liElement = this._createNode(parentElement, obj, extraLiClass);

                    // Object has child objects?
                    if (this._parentObjMap[objId]) {
                        this._showObjList(liElement, this._parentObjMap[objId], this.subNodeClass);
                    }
                }
            }

            this._currentDepth = this._currentDepth - 1;
        },

        _createNode : function (parentElement, obj, extraLiClass) {
            var draggableClass,
                dropTargetSelector,
                liElement,
                objId,
                spanClass,
                spanElement;

            objId = obj.getGuid();

            // Create the list item element
            liElement = document.createElement("li");
            liElement.setAttribute(this.ATTR_LEVEL, this._currentDepth);
            liElement.setAttribute(this.ATTR_OBJ_ID, objId);
            liElement.id = "li" + objId;
            if (extraLiClass) {
                domClass.add(liElement, extraLiClass);
            }

            // Create the span with the caption
            spanElement = domConstruct.create("span", { innerHTML: obj.get(this.captionAttr) });
            spanElement.setAttribute(this.ATTR_LEVEL, this._currentDepth);
            spanElement.setAttribute(this.ATTR_OBJ_ID, objId);
            spanClass = obj.get(this.classAttr);
            spanElement.id = "span" + objId;
            if (spanClass) {
                domClass.add(spanElement, spanClass);
                // Save the node class value separately as we need it when updating tree nodes.
                this._nodeClassMap[objId] = spanClass;
            }

            // Add onClick handlers
            this.connect(liElement, "click", lang.hitch(this, this._handleExpandCollapse));
            if (this.onClickMicroflow) {
                this.connect(spanElement, "click", lang.hitch(this, this._handleItemClick));
                domClass.add(spanElement, this.clickableNodeClass);
            } else {
                domClass.add(spanElement, this.nonClickableNodeClass);
            }

            // Drag and drop. The span is used to make because large dragged structures make it difficult to see where to drop them.
            if (this.allowDnD) {
                draggableClass = obj.get(this.draggableClassAttr);
                if (draggableClass) {
                    this._makeDraggable(spanElement, obj, draggableClass);
                }
                dropTargetSelector = obj.get(this.dropTargetSelectorAttr);
                if (dropTargetSelector) {
                    this._makeDropTarget(spanElement, obj, dropTargetSelector);
                }
            }

            // Put the pieces together
            liElement.appendChild(spanElement);
            parentElement.appendChild(liElement);

            // Object has child objects?
            if (this._parentObjMap[objId]) {
                domClass.add(liElement, this.expandableNodeClass + " " + this.expandedClass);
            } else {
                domClass.add(liElement, this.leafNodeClass);
            }

            return liElement;
        },

        _handleExpandCollapse : function (evt) {
            var appKey,
                obj,
                objId,
                target,
                targetId;

            target = evt.target;
            targetId = target.id;
            objId = target.getAttribute(this.ATTR_OBJ_ID);
            obj = this._objMap[objId];
            appKey = obj.get(this.appKeyAttr);

            if (domClass.contains(target, this.expandedClass)) {
                this._hideNode(target);
                this._collapsedElementMap[appKey] = appKey;
            } else if (domClass.contains(target, this.collapsedClass)) {
                this._showNode(target);
                delete this._collapsedElementMap[appKey];
            }
            evt.stopPropagation();
        },

        _hideNode : function (target) {
            // Hide all li elements but not the span under the clicked element
            dojoQuery("#" + target.id + " > li").forEach(function (liElement) {
                dojoQuery("#" + liElement.id).style("display", "none");
            });
            domClass.replace(target, this.collapsedClass, this.expandedClass);
        },

        _showNode : function (target) {
            dojoQuery("#" + target.id + " > li").style("display", "");
            domClass.replace(target, this.expandedClass, this.collapsedClass);
        },

        _handleItemClick : function (evt) {
            this._setSelectionById(evt.target.getAttribute(this.ATTR_OBJ_ID));
            evt.stopPropagation();
        },
        
        _makeDraggable : function (element, obj, draggableClass) {
            var args;

            domClass.add(element, this.draggableNodeClass);
            domClass.add(element, draggableClass);
            
            // This widget was started as pure Dojo widget. Only the parts related to drag/drop are implemented using jQuery
            
            args = {
                containment : "#" + this.id,
                helper      : "clone",
                revert      : "invalid"
            };
            $(element).draggable(args);
        },

        _makeDropTarget : function (element, obj, dropTargetSelector) {
            var args = {},
                thisObj = this;

            domClass.add(element, this.dropTargetNodeClass);
            
            // This widget was started as pure Dojo widget. Only the parts related to drag/drop are implemented using jQuery
            args = {
                accept      : dropTargetSelector,
                greedy      : true,
                hoverClass  : this.dropTargetHoverClass
            };
            args.drop = function (event, ui) {
                thisObj._handleDropEvent(event, ui, obj);
            };
            $(element).droppable(args);
        },
        
            
        _handleDropEvent : function (event, ui, obj) {
            var draggedReferenceName,
                draggedObjectGuid,
                dropTargetReferenceName;
            
            draggedObjectGuid = ui.draggable.attr(this.ATTR_OBJ_ID);
            
            event.stopImmediatePropagation();
            
            draggedReferenceName = this.draggedReference.substr(0, this.draggedReference.indexOf('/'));
            dropTargetReferenceName = this.dropTargetReference.substr(0, this.dropTargetReference.indexOf('/'));
            
            this._contextObj.addReference(draggedReferenceName, draggedObjectGuid);
            this._contextObj.addReference(dropTargetReferenceName, obj.getGuid());
            if (this.onDropMicroflow) {
                mx.data.action({
                    params: {
                        applyto: "selection",
                        actionname: this.onDropMicroflow,
                        guids: [this._contextObj.getGuid()]
                    },
                    error: function (error) {
                        console.log(error.description);
                    }
                }, this);
            } else {
                console.log("Treeview: no microflow set to receive drop events");
            }
        },
            
        _setSelection : function (selectedKey) {
        //    console.log("_setSelection");
            var obj;
            // Mark the selected node
            obj = this._appKeyMap[selectedKey];
            if (obj) {
                this._setSelectionById(obj.getGuid());
            } else {
                this._setSelectionById(null);
            }
        //    console.log("_setSelection end");
        },

        _setSelectionById : function (objId) {
        //    console.log("_setSelectionById");
            var node,
                nodeList,
                selectedNode,
                targetId,
                thisObj = this;

            // Remove the mark on any other node
            dojoQuery("#" + this._ulMainElement.id + " span." + this.selectedNodeClass).forEach(function (element) {
                domClass.remove(element, thisObj.selectedNodeClass);
            });

            selectedNode = null;
            if (objId) {
                targetId = "span" + objId;
                nodeList = dojoQuery("#" + targetId);
                if (nodeList.length > 0) {
                    // Expand parent nodes if necessary
                    selectedNode = nodeList[0];
                    node = selectedNode.parentElement;
                    while (node.nodeName === "LI") {
                        if (domClass.contains(node, this.collapsedClass)) {
                            this._showNode(node);
                        }
                        node = node.parentElement;
                    }
                    // Set the selected class and scroll into view
                    domClass.add(selectedNode, this.selectedNodeClass);
                    dojoWindow.scrollIntoView(selectedNode);
                    // Call the microflow
        //                console.log("_setSelectionById call microflow");
                    mx.data.action({
                        params: {
                            applyto: "selection",
                            actionname: this.onClickMicroflow,
                            guids: [objId]
                        },
                        error: function (error) {
                            console.log(error.description);
                        }
                    }, this);
                }
            }
        //    console.log("_setSelectionById end");
        },

        /**
         * Show progress indicator, depends on Mendix version
         */
        _showProgress: function () {
            this._progressDialogId = mx.ui.showProgress();
        },

        /**
         * Hide progress indicator, depends on Mendix version
         */
        _hideProgress: function () {
            mx.ui.hideProgress(this._progressDialogId);
            this._progressDialogId = null;
        },


        // We want to stop events on a mobile device
        _stopBubblingEventOnMobile: function (e) {
            logger.debug(this.id + "._stopBubblingEventOnMobile");
            if (typeof document.ontouchstart !== "undefined") {
                dojoEvent.stop(e);
            }
        }
    });
});

require(["BootstrapTreeViewWidget/widget/BootstrapTreeViewWidget"]);
