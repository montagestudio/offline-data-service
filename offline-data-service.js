var RawDataService = require("montage/data/service/raw-data-service").RawDataService,
    Criteria = require("montage/core/criteria").Criteria,
    DataQuery = require("montage/data/model/data-query").DataQuery,
    DataStream = require("montage/data/service/data-stream").DataStream,
    Dexie = require("dexie"),
    Montage = require("montage").Montage,
    Promise = require("montage/core/promise").Promise,
    uuid = require("montage/core/uuid"),
    DataOrdering = require("montage/data/model/data-ordering").DataOrdering,
    DESCENDING = DataOrdering.DESCENDING,
    evaluate = require("montage/frb/evaluate"),
    Set = require("montage/collections/set"),
    OfflineDataService;

/**
 * TODO: Document
 *
 * @class
 * @extends RawDataService
 */
exports.OfflineDataService = OfflineDataService = RawDataService.specialize( /** @lends OfflineDataService.prototype */ {

    /***************************************************************************
     * Initializing
     */

    constructor: {
        value: function OfflineDataService() {
            RawDataService.call(this);
        }
    },

    _db: {
        value: void 0
    },

    schema: {
        value: void 0
    },

    name: {
        value: void 0
    },

    /**
     * @type {string}
     */
    _isOperationsTableClearedKey: {
        value: "is_operations_table_cleared"
    },

    _isIndexedDBMigrated: {
        value: function (name) {
            return !!localStorage.getItem(name + "." + this._isOperationsTableClearedKey);
        }
    },

    _checkAndClearOperationsTable: {
        value: function (name) {
            var self = this;
            return this._databaseExists(name).then(function (isInitialized) {
                return isInitialized && !self._isIndexedDBMigrated(name) ? self._recreateDatabase(name, true) : Promise.resolve(null);
            }).then(function () {
                localStorage.setItem(name + "." + self._isOperationsTableClearedKey, true);
                return null;
            });
        }
    },

    _databaseExists: {
        value: function (name) {
            return Dexie.exists(name);
        }
    },

    _recreateDatabase: {
        value: function recreateDatabase(name, omitOperations, newSchema) {
            var self = this,
                tempName = name + "_tmp";
            return this._copyDatabase(name, tempName, omitOperations, newSchema).then(function () {
                return Dexie.delete(name);
            }).then(function () {
                return self._copyDatabase(tempName, name);
            }).then(function () {
                return Dexie.delete(tempName);
            });
        }
    },

    _buildIndexes: {
        value: function (indexes) {
            return indexes.map(function (index) {
                return index.src;
            });
        }
    },

    _makeSchema: {
        value: function (tables) {
            var self = this,
                schema = {},
                primaryKey,
                indexes,
                table;

            for (var i = 0, n = tables.length; i < n; i += 1) {
                table = tables[i];
                primaryKey = [table.schema.primKey.src];
                indexes = self._buildIndexes(table.schema.indexes);
                if (indexes.length) {
                    primaryKey = primaryKey.concat(indexes);
                }
                schema[table.name] = primaryKey.join(",");
            }

            return schema;
        }
    },

    _copyDatabase: {
        value: function copyDatabase(fromDbName, toDbName, omitOperations, newSchema) {
            var self = this,
                dexie = new Dexie(fromDbName);
            return dexie.open().then(function (db) {
                var schema = newSchema || self._makeSchema(db.tables),
                    dbCopy = new Dexie(toDbName);

                dbCopy.version(db.verno).stores(schema);

                return dbCopy.open().then(function () {
                    // dbCopy is now successfully created with same version and schema as source db.
                    // Now also copy the data

                    return Promise.all(db.tables.map(function (table) {
                        if (table.name === self.operationTableName && omitOperations) {
                            return dbCopy.table(table.name);
                        } else {
                            return table.toArray().then(function (rows) {
                                return dbCopy.table(table.name).bulkAdd(rows);
                            });
                        }
                    }));
                }).catch(function (error) {
                    console.error("Error copying database (", error, ")");
                }).finally(function () {
                    db.close();
                    dbCopy.close();
                });
            });
        }
    },

    /**
     * Main initialization method
     *
     * @method
     * @argument {String} name          - Defines the name of the database offline service will create/use.
     * @argument {Number} version       - Storage version
     * @argument {Object} scheme        - A schema with the following structure:
     *
     *   {
     *      "Person": {
     *           primaryKey: "id",
     *           indexes: ["firstName","lastName],
     *           versionUpgradeLogic: function() {}
     *       },
     *       "Product": {
     *
     *       }
     *   }
     *
     */
    initWithName: {
        value: function (name, version, schema) {
            var self = this;
            if (!this._db) {
                this._db = this._checkAndClearOperationsTable(name).then(function () {
                    return self._initWithName(name, version, schema);
                });
            }
            return this;
        }
    },

    _initWithName: {
        value: function (name, version, schema) {
            this.name = name;
            return schema ? this._initWithSchema(schema) : null;
        }
    },


    _initializeNewSchemaDefinition: {
        value: function () {
            var newSchema = {};
            newSchema[this.operationTableName] = this.operationSchemaDefinition;
            return newSchema;
        }
    },

    _initWithSchema: {
        value: function (schema) {
            var self = this,
                name = this.name,
                db = new Dexie(name),
                table, tableSchema, dbTable, dbSchema, dbIndexes,
                shouldUpgradeToNewVersion = false,
                newDbSchema = this._initializeNewSchemaDefinition(),
                schemaDefinition, tableIndexes, tablePrimaryKey;

            this.schema = schema;
            //We automatically create an extra table that will track offline operations the record was last updated
            // If the database exists, we must open it before we  
            // can check whether a particular table exists
            return this._databaseExists(name).then(function (exists) {
                return exists ? db.open().then(function () {
                    return true;
                }) : false;
            }).then(function (exists) {
                for (table in schema) {
                    tableSchema = schema[table];
                    tableIndexes = tableSchema.indexes;
                    tablePrimaryKey = tableSchema.primaryKey;
                    dbTable = self.tableNamed(db, table);

                    if (dbTable) {
                        //That table is defined, now let's compare primaryKey and indexes
                        dbSchema = dbTable.schema;
                        if (dbSchema.primKey.keyPath !== tablePrimaryKey && dbSchema.primKey.src !== tablePrimaryKey) {
                            //Existing table has different primaryKey, needs new version
                            shouldUpgradeToNewVersion = true;
                        }
                        //test if indexes aren't the same.
                        dbIndexes = dbSchema.indexes;
                        // if (dbIndexes !== tableSchema.indexes) {
                        if (!self._doIndexesMatch(dbIndexes, tableSchema.indexes, tablePrimaryKey)) {
                            //Existing table has different indexes, needs new version
                            shouldUpgradeToNewVersion = true;
                        }

                    } else {
                        //That table doesn't exists, which means we need to update.
                        shouldUpgradeToNewVersion = true;
                    }
                    if (shouldUpgradeToNewVersion) {
                        //We automatically add an index for lastUpdatedPropertyName ("montage-online-last-updated")
                        schemaDefinition = tablePrimaryKey;
                        for (var i = 0, iIndexName;
                            (iIndexName = tableIndexes[i]); i++) {
                            if (iIndexName !== tablePrimaryKey) {
                                schemaDefinition += ",";
                                schemaDefinition += iIndexName;
                            }
                        }
                        newDbSchema[table] = schemaDefinition;
                    }
                }

                OfflineDataService.registerOfflineDataService(self);
                if (shouldUpgradeToNewVersion && exists) {
                    return self._recreateDatabase(name, false, newDbSchema).then(function () {
                        return db.open().then(function () {
                            return db;
                        });
                    });
                } else if (shouldUpgradeToNewVersion) {
                    db.version(db.verno + 1).stores(newDbSchema);
                    return db.open().then(function () {
                        return db;
                    });
                } else {
                    return db;
                }
            });
        }
    },

    _doIndexesMatch: {
        value: function (indexes, rawIndexes, primaryKey) {
            var rawIndexSet = new Set(rawIndexes),
                dbIndexSet = new Set(indexes.map(function (index) {
                    return index.keyPath;
                }));
            rawIndexSet.delete(primaryKey);

            indexes.forEach(function (index) {
                if (rawIndexSet.has(index.keyPath)) {
                    rawIndexSet.delete(index.keyPath);
                }
            });
            rawIndexes.forEach(function (index) {
                if (dbIndexSet.has(index)) {
                    dbIndexSet.delete(index);
                }
            });
            return rawIndexSet.size === 0 && dbIndexSet.size === 0;
        }
    },

    // createObjectStoreFromSample: {
    //     value: function (objectStoreName, primaryKey, sampleData) {
    //         if(!sampleData) return;

    //         var sampleDataKeys = Object.keys(sampleData),
    //             db = this._db,
    //             currentSchema = {};

    //         db.tables.forEach(function (table) {
    //             currentSchema[table.name] = JSON.stringify(table.schema);
    //         });

    //         var schemaDefinition = primaryKey;
    //         for(var i=0, iKey;(iKey = sampleDataKeys[i]);i++) {
    //             if(iKey !== primaryKey) {
    //                 schemaDefinition += ",";
    //                 schemaDefinition +=  iKey;
    //             }
    //         }
    //         currentSchema[objectStoreName] = schemaDefinition;
    //         db.version(db.verno+1).stores(currentSchema);

    //     }
    // },

    operationSchemaDefinition: {
        get: function () {
            var schemaDefinition;
            if (!this._operationSchemaDefinition) {
                schemaDefinition = "++id";
                schemaDefinition += ",";
                schemaDefinition += "dataID";
                schemaDefinition += ",";
                schemaDefinition += this.typePropertyName;
                schemaDefinition += ",";
                schemaDefinition += this.lastFetchedPropertyName;
                schemaDefinition += ",";
                schemaDefinition += this.lastModifiedPropertyName;
                schemaDefinition += ",";
                schemaDefinition += this.operationPropertyName;
                schemaDefinition += ",";
                schemaDefinition += this.changesPropertyName;
                schemaDefinition += ",";
                schemaDefinition += this.contextPropertyName;
                this._operationSchemaDefinition = schemaDefinition;
            }
            return this._operationSchemaDefinition;
        }
    },

    /**
     * table/property/index name that tracks the date the record was last updated
     *
     * @returns {String}
     */
    operationTableName: {
        value: "Operation"
    },

    /**
     * name of the schema property that stores the name of the type/object store
     * of the object the operation impacts
     *
     * @returns {String}
     */
    typePropertyName: {
        value: "type"
    },

    /**
     * name of the schema property that stores the last time the operation's object
     * (dataID) was last fetched.
     *
     * @returns {String}
     */
    lastFetchedPropertyName: {
        value: "lastFetched"
    },

    /**
     * name of the schema property that stores the last time the operation's
     * object was last modified.
     *
     * @returns {String}
     */
    lastModifiedPropertyName: {
        value: "lastModified"
    },

    /**
     * name of the schema property that stores the type of operation:
     * This will be create or update or delete
     *
     * @returns {String}
     */
    operationPropertyName: {
        value: "operation"
    },

    operationCreateName: {
        value: "create"
    },

    operationUpdateName: {
        value: "update"
    },

    operationDeleteName: {
        value: "delete"
    },

    /**
     * name of the schema property that stores the  changes made to the object in this operation
     *
     * @returns {String}
     */
    changesPropertyName: {
        value: "changes" //This contains
    },

    /**
     * name of the schema property that stores the primary key of the object the operation impacts
     *
     * @returns {String}
     */
    dataIDPropertyName: {
        value: "dataID"
    },

    /**
     * name of the schema property that stores unstructured/custom data for a service
     * to stash what it may need for further use.
     *
     * @returns {String}
     */
    contextPropertyName: {
        value: "context"
    },

    /**
     *
     *  Returns all records, ordered by time, that reflect what happened when offline.
     *  We should
     *  [{
     *      // NO primaryKey: uuid-uuid-uuid,
     *      lastFetched: Date("08-02-2016"),
     *      lastModified: Date("08-02-2016"),
     *      operation: "create",
     *      data: {
     *          hazard_id:  uuid-uuid-uuid,
     *          "foo":"abc",
     *          "bla":23
     *      }
     *  },
     *  {
     *      lastFetched: Date("08-02-2016"),
     *      lastModified: Date("08-02-2016"),
     *      operation: "update"
     *  },
     *  {
     *      lastFetched: Date("08-02-2016"),
     *      lastModified: Date("08-02-2016"),
     *      operation: "update"
     *  }]
     */
    offlineOperations: {
        get: function () {
            //Fetch
        }
    },

    clearOfflineOperations: {
        value: function (operations) {
            //Fetch
        }
    },

    /* Feels like that should return the data, in case it's called with null and created inside?*/
    mapToRawSelector: {
        value: function (object, data) {
            // TO DO: Provide a default mapping based on object.TYPE.
            // For now, subclasses must override this.
        }
    },

    _tableByName: {
        get: function () {
            if (!this.__tableByName) {
                this.__tableByName = new Map();
            }
            return this.__tableByName;
        }
    },

    tableNamed: {
        value: function (db, tableName) {
            var table = this._tableByName.get(tableName);
            if (!table) {
                table = db[tableName];
                if (!table) {
                    var tables = db.tables,
                        iTable, i, length;
                    for (i = 0, length = tables.length; i < length && !table; i++) {
                        iTable = tables[i];
                        if (iTable.name === tableName) {
                            table = iTable;
                            this._tableByName.set(tableName, table);
                        }
                    }
                }
            }
            return table;
        }
    },

    _operationTable: {
        value: void 0
    },

    operationTable: {
        value: function (db) {
            if (!this._operationTable) {
                this._operationTable = this.tableNamed(db, this.operationTableName);
            }
            return this._operationTable;
        }
    },

    fetchData: {
        value: function (selector, stream) {

            var criteria = selector.criteria,
                orderings = selector.orderings,
                self = this;

            /*
             The idea here (to finish) is to use the first criteria in the where, assuming it's the most
             important, and then filter the rest in memory by looping on remaining
             whereProperties amd whereEqualValues, index matches. Not sure how Dexie's Collection fits there
             results in the then is an Array... This first pass fetches offline Hazards with status === "A",
             which seems to be the only fetch for Hazards on load when offline.
             */

            this._db.then(function (myDB) {
                myDB.open().then(function () {
                    var table = self.tableNamed(myDB, selector.type),
                        whereProperties = (criteria && criteria.parameters) ? Object.keys(criteria.parameters) : undefined;

                    if (whereProperties && whereProperties.length) {
                        var wherePromise,
                            resultPromise,
                            whereProperty = whereProperties.shift(),
                            whereValue = criteria.parameters[whereProperty];

                        if (whereProperties.length > 0) {
                            //db.table1.where("key1").between(8,12).and(function (x) { return x.key2 >= 3 && x.key2 < 18; }).toArray();

                            wherePromise = Array.isArray(whereValue) ? table.where(whereProperty).anyOf(whereValue) :
                                table.where(whereProperty).equals(whereValue);

                            resultPromise = wherePromise.and(function (aRecord) {
                                var result = true;
                                for (var i = 0, iKey, iValue, iKeyMatchValue, iOrValue;
                                    (iKey = whereProperties[i]); i++) {
                                    iValue = criteria.parameters[iKey];
                                    iKeyMatchValue = false;
                                    if (Array.isArray(iValue)) {
                                        iOrValue = false;
                                        for (var j = 0, jValue;
                                            (jValue = iValue[j]); j++) {
                                            if (aRecord[iKey] === jValue) {
                                                if (!iKeyMatchValue) iKeyMatchValue = true;
                                            }
                                        }
                                    } else {
                                        iKeyMatchValue = aRecord[iKey] === iValue;
                                    }

                                    if (!(result = result && iKeyMatchValue)) {
                                        break;
                                    }
                                }
                                return result;
                            });
                        } else {
                            if (Array.isArray(whereValue)) {
                                resultPromise = table.where(whereProperty).anyOf(whereValue);
                            } else {
                                resultPromise = table.where(whereProperty).equals(whereValue);
                            }
                        }
                        resultPromise.toArray(function (results) {
                            if (orderings) {
                                var expression = "";
                                //Build combined expression
                                for (var i = 0, iDataOrdering, iExpression;
                                    (iDataOrdering = orderings[i]); i++) {
                                    iExpression = iDataOrdering.expression;

                                    if (expression.length)
                                        expression += ".";

                                    expression += "sorted{";
                                    expression += iExpression;
                                    expression += "}";
                                    if (iDataOrdering.order === DESCENDING) {
                                        expression += ".reversed()";
                                    }
                                }
                                results = evaluate(expression, results);
                            }

                            stream.addData(results);
                            stream.dataDone();

                        });

                    } else {
                        table.toArray().then(function (results) {
                            stream.addData(results);
                            stream.dataDone();
                        });
                    }

                }).catch('NoSuchDatabaseError', function (e) {
                    // Database with that name did not exist
                    stream.dataError(e);
                }).catch(function (e) {
                    stream.dataError(e);
                });
            }).catch(function (e) {
                stream.dataError(e);
            });

            // Return the passed in or created stream.
            return stream;
        }
    },

    /**
     * Called every time [addRawData()]{@link RawDataService#addRawData} is
     * called while online to optionally cache that data for offline use.
     *
     * The default implementation does nothing. This is appropriate for
     * subclasses that do not support offline operation or which operate the
     * same way when offline as when online.
     *
     * Other subclasses may override this method to cache data fetched when
     * online so [fetchOfflineData]{@link RawDataSource#fetchOfflineData} can
     * use that data when offline.
     *
     * @method
     * @argument {DataStream} stream   - The stream to which the fetched data is
     *                                   being added.
     * @argument {Array} rawDataArray  - An array of objects whose properties'
     *                                   values hold the raw data.
     * @argument {?} context           - The context value passed to the
     *                                   [addRawData()]{@link DataMapping#addRawData}
     *                                   call that is invoking this method.
     */
    writeOfflineData: {
        value: function (rawDataArray, selector) {
            var self = this,
                clonedArray = [],
                updateOperationArray = [],
                cookedSelector, criteria,
                primaryKey, db;

            return this._db.then(function (theDB) {
                db = theDB;
                return self._deleteExistingFetchOperations(db, selector.type);
            }).then(function () {
                var tableName = selector.type,
                    table = self.tableNamed(db, tableName),
                    lastUpdated = Date.now(),
                    dataID = self.dataIDPropertyName,
                    lastUpdatedPropertyName = self.lastFetchedPropertyName,
                    rawDataStream = new DataStream(),
                    i, countI, iRawData, iLastUpdated;

                primaryKey = table.schema.primKey.name;

                rawDataStream.query = selector;

                // Make a clone of the array and create the record to track the online Last Updated date
                for (i = 0, countI = rawDataArray.length; i < countI; i++) {
                    if ((iRawData = rawDataArray[i])) {
                        clonedArray.push(iRawData);

                        //Create the record to track the online Last Updated date
                        iLastUpdated = {};
                        iLastUpdated[dataID] = iRawData[primaryKey];
                        iLastUpdated[lastUpdatedPropertyName] = lastUpdated;
                        iLastUpdated[self.typePropertyName] = tableName;
                        updateOperationArray.push(iLastUpdated);
                    }
                }

                // Create a criteria and query compatible with fetchData()
                // - writeOfflineData accepts a raw selector such that selector.criteria is a POJO.
                // - fetchData() accepts a cooked selector such that selector.criteria is a formal Criteria object.
                if (selector.criteria instanceof Criteria) {
                    cookedSelector = selector;
                } else {
                    criteria = new Criteria().initWithExpression("", selector.criteria);
                    cookedSelector = DataQuery.withTypeAndCriteria(selector.type, criteria);
                }

                return self.fetchData(cookedSelector, rawDataStream);

            }).then(function (offlineSelectedRecords) {
                var offlineObjectsToClear = [],
                    iRecord, iRecordPrimaryKey, rawDataPrimaryKeys, i, countI;

                for (i = 0, countI = offlineSelectedRecords.length; i < countI; i++) {

                    iRecord = offlineSelectedRecords[i];
                    iRecordPrimaryKey = iRecord[primaryKey];

                    if (!rawDataPrimaryKeys) {
                        rawDataPrimaryKeys = new Set();
                        rawDataArray.forEach(function (rawData) {
                            rawDataPrimaryKeys.add(rawData[primaryKey]);
                        });
                    }

                    if (!rawDataPrimaryKeys.has(iRecordPrimaryKey)) {
                        offlineObjectsToClear.push(iRecordPrimaryKey);
                    }

                }

                //Now we now what to delete: offlineObjectsToClear, what to put: rawDataArray.
                //We need to be able to build a transaction and pass

                // 3) Put new objects
                return self.performOfflineSelectorChanges(selector, clonedArray, updateOperationArray, offlineObjectsToClear);

            }).catch(function (e) {
                console.error(selector.type + ": performOfflineSelectorChanges failed");
                console.error(e);
            });
        }
    },

    _deleteExistingFetchOperations: {
        value: function (db, tableName) {
            var operationtableName = this.operationTableName,
                operationTable = this.tableNamed(db, operationtableName),
                typePropertyName = this.typePropertyName,
                lastFetchedPropertyName = this.lastFetchedPropertyName,
                filtered = operationTable.toCollection().filter(function (object) {
                    return object.hasOwnProperty(lastFetchedPropertyName) &&
                        object[typePropertyName] === tableName;
                });
            return filtered.delete();
        }
    },

    readOfflineOperations: {
        value: function ( /* operationMapToService */ ) {
            var self = this;
            return new Promise(function (resolve, reject) {
                self._db.then(function (db) {
                    db.open().then(function () {
                        self.operationTable(db).where("operation").anyOf("create", "update", "delete").toArray(function (offlineOperations) {
                            resolve(offlineOperations);
                        }).catch(function (e) {
                            console.error(selector.type + ": performOfflineSelectorChanges failed"); // Error selector is not defined.
                            console.error(e);
                            reject(e);
                        });
                    });
                }).catch(function (e) {
                    console.error(e);
                    reject(e);
                });
            });
        }
    },

    performOfflineSelectorChanges: {
        value: function (selector, rawDataArray, updateOperationArray, offlineObjectsToClear) {
            var self = this,
                clonedRawDataArray = rawDataArray.slice(0), // why clone twice?
                clonedUpdateOperationArray = updateOperationArray.slice(0),
                clonedOfflineObjectsToClear = offlineObjectsToClear.slice(0),
                indexedDB;

            return this._db.then(function (myDb) {
                indexedDB = myDb;
                return myDb.open();
            }).then(function (db) {
                var table = self.tableNamed(db, selector.type),
                    operationTable = self.operationTable(indexedDB);

                //Transaction:
                //Objects to put:
                //      rawDataArray
                //      updateOperationArray
                //Objects to delete:
                //      offlineObjectsToClear in table and operationTable

                return db.transaction('rw', table, operationTable, function () {
                    return Dexie.Promise.all([
                        table.bulkPut(clonedRawDataArray),
                        operationTable.bulkPut(clonedUpdateOperationArray),
                        table.bulkDelete(clonedOfflineObjectsToClear),
                        operationTable.bulkDelete(clonedOfflineObjectsToClear)
                    ]);

                    // }).then(function(value) {
                    //     //console.log(selector.type + ": performOfflineSelectorChanges succesful: "+rawDataArray.length+" rawDataArray, "+clonedUpdateOperationArray.length+" updateOperationArray");
                });
            }).catch(function (e) {
                console.error(selector.type + ": performOfflineSelectorChanges failed", e);
                console.error(e);
            });
        }
    },

    registerOfflinePrimaryKeyDependenciesForData: {
        value: function (data, tableName, primaryKeyPropertyName) {

            if (data.length === 0) return;

            return OfflineDataService.registerOfflinePrimaryKeyDependenciesForData(data, tableName, primaryKeyPropertyName, this);
        }
    },

    //TODO
    deleteOfflinePrimaryKeyDependenciesForData: {
        value: function (data, tableName, primaryKeyPropertyName) {
            if (data.length === 0) return;

            var tableSchema = this.schema[tableName],
                //if we don't have a known list of foreign keys, we'll consider all potential candidate
                foreignKeys = tableSchema.foreignKeys;


            OfflineDataService.deleteOfflinePrimaryKeyDependenciesForData(data, tableName, primaryKeyPropertyName, foreignKeys);
        }
    },

    /**
     * Save new data passed in objects of type
     *
     * @method
     * @argument {Object} objects   - objects whose data should be created.
     * @argument {String} type   - type of objects, likely to mean a "table" in storage
     * @returns {external:Promise} - A promise fulfilled when all of the data in
     * the changed object has been saved.
     */
    createData: {
        value: function (objects, type, context) {
            var self = this,
                typeName;

            if (typeof type !== "string") {
                var moduleInfo = Montage.getInfoForObject(type);
                typeName = moduleInfo.objectName;
            } else {
                typeName = type;
            }
            return new Promise(function (resolve, reject) {
                self._db.then(function (myDB) {

                    var table = self.tableNamed(myDB, typeName),
                        operationTable = self.operationTable(myDB),
                        clonedObjects = [],
                        operations = [],
                        primaryKey = table.schema.primKey.name,
                        dataID = self.dataIDPropertyName,
                        lastModifiedPropertyName = self.lastModifiedPropertyName,
                        lastModified = Date.now(),
                        typePropertyName = self.typePropertyName,
                        changesPropertyName = self.changesPropertyName,
                        operationPropertyName = self.operationPropertyName,
                        operationCreateName = self.operationCreateName,
                        primaryKeys = [];


                    return myDB.open().then(function (db) {
                        db.transaction('rw', table, operationTable, function () {
                            //Assign primary keys and build operations
                            for (var i = 0, countI = objects.length, iRawData, iPrimaryKey, iOperation; i < countI; i++) {

                                if ((iRawData = objects[i])) {

                                    if (typeof iRawData[primaryKey] === "undefined" || iRawData[primaryKey] === "") {
                                        //Set offline uuid based primary key
                                        iRawData[primaryKey] = iPrimaryKey = uuid.generate();

                                        //keep track of primaryKeys:
                                        primaryKeys.push(iPrimaryKey);
                                    } else {
                                        console.log("### OfflineDataService createData ", typeName, ": iRawData ", iRawData, " already have a primaryKey[", primaryKey, "]");
                                    }

                                    clonedObjects.push(iRawData);

                                    //Create the record to track of last modified date
                                    iOperation = {};
                                    iOperation[dataID] = iPrimaryKey;
                                    iOperation[lastModifiedPropertyName] = lastModified;
                                    iOperation[typePropertyName] = typeName;
                                    iOperation[changesPropertyName] = iRawData;
                                    iOperation[operationPropertyName] = operationCreateName;
                                    iOperation.context = context;

                                    operations.push(iOperation);
                                }
                            }

                            return Dexie.Promise.all([table.bulkAdd(clonedObjects), operationTable.bulkAdd(operations)]);

                        }).then(function (value) {
                            //Now write new offline primaryKeys
                            OfflineDataService.writeOfflinePrimaryKeys(primaryKeys).then(function () {
                                //To verify it's there
                                // OfflineDataService.fetchOfflinePrimaryKeys()
                                // .then(function(offlinePrimaryKeys) {
                                //     console.log(offlinePrimaryKeys);
                                // });

                                //Once this succedded, we need to add our temporary primary keys bookkeeping:
                                //Register potential temporary primaryKeys
                                self.registerOfflinePrimaryKeyDependenciesForData(objects, table.name, primaryKey)
                                    .then(function () {
                                        resolve(objects);
                                    });
                            }).catch(function (e) {
                                reject(e);
                                console.error(e);
                            });
                        }).catch(function (e) {
                            reject(e);
                            console.error(e);
                        });
                    });
                }).catch(function (e) {
                    reject(e);
                    console.error(e);
                });
            });
        }
    },

    updatePrimaryKey: {
        value: function (currentPrimaryKey, newPrimaryKey, type) {
            var self = this;
            return this._db.then(function (myDB) {
                var table = self.tableNamed(myDB, type),
                    primaryKeyProperty = table.schema.primKey.name,
                    record;

                //because it's a primary key, we need to delete the record and re-create it...
                //We fetch it first
                return table.where(primaryKeyProperty).equals(currentPrimaryKey).first(function (record) {
                    table.delete(currentPrimaryKey).then(function () {
                        //Assign the new one
                        record[primaryKeyProperty] = newPrimaryKey;
                        //Re-save
                        return table.put(record);
                    }).catch(function (e) {
                        // console.log("tableName:failed to addO ffline Data",e)
                        console.error(table.name, ": failed to delete record with primaryKwy ", currentPrimaryKey, e);
                    });
                });
            }).catch(function (e) {
                // console.log("tableName:failed to addO ffline Data",e)
                console.error(e);
            });
        }
    },

    /**
     * Save updates made to an array of existing data objects.
     *
     * @method
     * @argument {Array} objects   - objects whose data should be updated.
     * @argument {String} type   - type of objects, likely to mean a "table" in storage
     * @argument {Object} context   - an object that will be associated with operations
     * @returns {external:Promise} - A promise fulfilled when all of the data in
     * objects has been saved.
     */
    updateData: {
        value: function (objects, type, context) {
            var self = this,
                moduleInfo, typeName;

            if (typeof type !== "string") {
                moduleInfo = Montage.getInfoForObject(type);
                typeName = moduleInfo.objectName;
            } else {
                typeName = type;
            }
            if (!objects || objects.length === 0) return Dexie.Promise.resolve();

            return new Promise(function (resolve, reject) {
                self._db.then(function (myDB) {
                    var table = self.tableNamed(myDB, typeName),
                        operationTable = self.operationTable(myDB),
                        clonedObjects = objects.slice(0),
                        primaryKey = table.schema.primKey.name,
                        dataID = self.dataIDPropertyName,
                        lastModifiedPropertyName = self.lastModifiedPropertyName,
                        lastModified = Date.now(),
                        updateDataPromises = [],
                        typePropertyName = self.typePropertyName,
                        changesPropertyName = self.changesPropertyName,
                        operationPropertyName = self.operationPropertyName,
                        operationUpdateName = self.operationUpdateName;

                    myDB.open().then(function (db) {
                        db.transaction('rw', table, operationTable, function () {

                            //Make a clone of the array and create the record to track the online Last Updated date
                            var iOperation, iRawData, iPrimaryKey;
                            for (var i = 0, countI = objects.length; i < countI; i++) {
                                if ((iRawData = objects[i])) {
                                    iPrimaryKey = iRawData[primaryKey];
                                    updateDataPromises.push(table.update(iPrimaryKey, iRawData));

                                    //Create the record to track of last modified date
                                    iOperation = {};
                                    iOperation[dataID] = iPrimaryKey;
                                    iOperation[lastModifiedPropertyName] = lastModified;
                                    iOperation[typePropertyName] = typeName;
                                    iOperation[changesPropertyName] = iRawData;
                                    iOperation[operationPropertyName] = operationUpdateName;
                                    iOperation.context = context;

                                    updateDataPromises.push(operationTable.put(iOperation));
                                }
                            }
                            return Dexie.Promise.all(updateDataPromises);
                        }).then(function (value) {
                            //Once this succedded, we need to add our temporary primary keys bookeeping:
                            //Register potential temporary primaryKeys
                            self.registerOfflinePrimaryKeyDependenciesForData(objects, table.name, primaryKey);
                            resolve(clonedObjects);
                        }).catch(function (e) {
                            console.error(table.name, ": failed to updateData for ", objects.length, " objects with error", e);
                            reject(e);
                        });
                    });
                }).catch(function (e) {
                    // console.log("tableName:failed to addO ffline Data",e)
                    console.error(e);
                    reject(e);
                });
            });
        }
    },

    /**
     * Delete data passed in array.
     *
     * @method
     * @argument {Object} objects   - objects whose data should be saved.
     * @argument {String} type   - type of objects, likely to mean a "table" in storage
     * @returns {external:Promise} - A promise fulfilled when all of the data in
     * the changed object has been saved.
     */
    deleteData: {
        value: function (objects, type, context) {
            var self = this,
                moduleInfo;

            if (!objects || objects.length === 0) return Dexie.Promise.resolve();

            if (typeof type !== "string") {
                moduleInfo = Montage.getInfoForObject(type);
                type = moduleInfo.objectName;
            } else {
                type = type;
            }

            return new Promise(function (resolve, reject) {
                self._db.then(function (myDB) {
                    var table = self.tableNamed(myDB, type),
                        operationTable = self.operationTable(myDB),
                        clonedObjects = objects.slice(0),
                        primaryKey = table.schema.primKey.name,
                        dataID = self.dataIDPropertyName,
                        lastModifiedPropertyName = self.lastModifiedPropertyName,
                        lastModified = Date.now(),
                        changesPropertyName = self.changesPropertyName,
                        typePropertyName = self.typePropertyName,
                        operationPropertyName = self.operationPropertyName,
                        operationDeleteName = self.operationDeleteName,
                        updateDataPromises = [];

                    myDB.open().then(function (db) {
                        db.transaction('rw', table, operationTable, function () {
                            //Make a clone of the array and create the record to track the online Last Updated date
                            for (var i = 0, countI = objects.length, iRawData, iOperation, iPrimaryKey; i < countI; i++) {
                                if ((iRawData = objects[i])) {
                                    iPrimaryKey = iRawData[primaryKey];
                                    updateDataPromises.push(table.delete(iPrimaryKey, iRawData));

                                    //Create the record to track of last modified date
                                    iOperation = {};
                                    iOperation[dataID] = iPrimaryKey;
                                    iOperation[lastModifiedPropertyName] = lastModified;
                                    iOperation[typePropertyName] = type;
                                    iOperation[changesPropertyName] = iRawData;
                                    iOperation[operationPropertyName] = operationDeleteName;
                                    iOperation.context = context;

                                    updateDataPromises.push(operationTable.put(iOperation));
                                }
                            }
                            return Dexie.Promise.all(updateDataPromises);

                        }).then(function () {
                            //Once this succeeded, we need to add our temporary primary keys bookkeeping:
                            //Register potential temporary primaryKeys
                            self.deleteOfflinePrimaryKeyDependenciesForData(objects, type, primaryKey);
                            resolve(clonedObjects);
                            //console.log(table.name,": updateData for ",objects.length," objects successfully",value);
                        }).catch(function (e) {
                            reject(e);
                            // console.log("tableName:failed to add Offline Data",e)
                            console.error(table.name, ": failed to deleteData for ", objects.length, " objects with error", e);
                        });
                    });
                }).catch(function (e) {
                    console.error(e);
                    reject(e);
                });
            });
        }
    },

    deleteOfflineOperations: {
        value: function (operations) {

            var self = this;
            if (!operations || operations.length === 0) return Promise.resolve();

            return new Promise(function (resolve, reject) {
                self._db.then(function (myDB) {
                    var operationTable = self.operationTable(myDB),
                        primaryKey = operationTable.schema.primKey.name,
                        deleteOperationPromises = [];

                    myDB.open().then(function (db) {
                        db.transaction('rw', operationTable, function () {
                            //Make a clone of the array and create the record to track the online Last Updated date
                            for (var i = 0, countI = operations.length, iOperation; i < countI; i++) {
                                if ((iOperation = operations[i])) {
                                    deleteOperationPromises.push(operationTable.delete(iOperation[primaryKey], iOperation));
                                }
                            }
                            return Dexie.Promise.all(deleteOperationPromises);
                        }).then(function (value) {
                            resolve();
                            //console.log(table.name,": updateData for ",objects.length," objects succesfully",value);
                        }).catch(function (e) {
                            reject(e);
                            // console.log("tableName:failed to add Offline Data",e)
                            console.error(table.name, ": failed to updateData for ", objects.length, " objects with error", e);
                        });
                    });
                });
            });
        }
    },

    onlinePrimaryKeyForOfflinePrimaryKey: {
        value: function (offlinePrimaryKey) {
            return OfflineDataService.onlinePrimaryKeyForOfflinePrimaryKey(offlinePrimaryKey);
        }
    },

    replaceOfflinePrimaryKey: {
        value: function (offlinePrimaryKey, onlinePrimaryKey, type, service) {
            return OfflineDataService.replaceOfflinePrimaryKey(offlinePrimaryKey, onlinePrimaryKey, type, service);
        }
    },

    deleteDBWithName: {
        value: function (name) {
            return this._databaseExists(name).then(function (exists) {
                return exists ? Dexie.delete(name) : Promise.resolve(null);
            });
        }
    }

}, {




    _registeredOfflineDataServiceByName: {
        value: new Map()
    },

    registerOfflineDataService: {
        value: function (anOfflineDataService) {
            this._registeredOfflineDataServiceByName.set(anOfflineDataService.name, anOfflineDataService);
        }
    },

    registeredOfflineDataServiceNamed: {
        value: function (anOfflineDataServiceName) {
            return this._registeredOfflineDataServiceByName.get(anOfflineDataServiceName);
        }
    },

    __offlinePrimaryKeyDB: {
        value: null
    },

    _offlinePrimaryKeyDB: {
        get: function () {
            if (!this.__offlinePrimaryKeyDB) {

                var db = this.__offlinePrimaryKeyDB = new Dexie("OfflinePrimaryKeys"),
                    primaryKeysTable = db["PrimaryKeys"];

                if (!primaryKeysTable) {
                    /**
                     *  PrimaryKeys has offlinePrimaryKey and a property "dependencies" that contains an array of
                     *  {
                     *      offlinePrimaryKey:"uuid-1111-4444-5555",
                     *      dependencies:[{
                     *          serviceName: "AServiceName",
                     *          tableName:"BlahTable",
                     *          primaryKey:"uuid-1233-3455",
                     *          foreignKeyName:"foo_ID"
                     *      }]
                     *  }
                     *  This tells us that the primaryKey "uuid-1111-4444-5555" appears as a foreignKey
                     *  named "foo_ID" of the record in "BlahTable" that has the primaryKey value of
                     *  "uuid-1233-3455"
                     */
                    var newDbSchema = {
                        PrimaryKeys: "offlinePrimaryKey,dependencies.serviceName, dependencies.tableName, dependencies.primaryKey, dependencies.foreignKeyName"
                    };
                    db.version(db.verno + 1).stores(newDbSchema);
                }

            }
            return this.__offlinePrimaryKeyDB;
        }
    },

    _primaryKeysTable: {
        value: null
    },

    primaryKeysTable: {
        get: function () {
            return this._primaryKeysTable || (this._primaryKeysTable = this._offlinePrimaryKeyDB.PrimaryKeys);
        }
    },

    writeOfflinePrimaryKey: {
        value: function (aPrimaryKey) {
            return this.writeOfflinePrimaryKeys([aPrimaryKey]);
        }
    },

    writeOfflinePrimaryKeys: {
        value: function (primaryKeys) {
            var db = this._offlinePrimaryKeyDB,
                table = this.primaryKeysTable,
                primaryKeysRecords = [],
                self = this;

            for (var i = 0, countI = primaryKeys.length, iRawData, iPrimaryKey; i < countI; i++) {
                primaryKeysRecords.push({
                    offlinePrimaryKey: primaryKeys[i]
                });
            }
            return new Promise(function (resolve, reject) {
                var i, iPrimaryKey;
                // _offlinePrimaryKeys = self._offlinePrimaryKeys;

                table.bulkAdd(primaryKeysRecords).then(function (lastKey) {
                    self.fetchOfflinePrimaryKeys().then(function (offlinePrimaryKeys) {
                        //Update local cache:
                        for (i = 0;
                            (iPrimaryKey = primaryKeys[i]); i++) {
                            offlinePrimaryKeys.add(iPrimaryKey.offlinePrimaryKey, primaryKeysRecords[i]);
                        }
                        resolve(lastKey);
                    });
                }).catch(function (e) {
                    console.error("deleteOfflinePrimaryKeys failed", e);
                    reject(e);
                });
            });
        }
    },

    registerOfflinePrimaryKeyDependenciesForData: {
        value: function (data, tableName, primaryKeyPropertyName, service) {

            if (data.length === 0) return;

            var keys = Object.keys(data[0]),
                i, iData, countI, iPrimaryKey,
                j, jForeignKey, jForeignKeyValue,
                offlineService = OfflineDataService,
                tableSchema = service.schema[tableName],
                //if we don't have a known list of foreign keys, we'll consider all potential candidate
                foreignKeys = tableSchema.foreignKeys,
                updatedRecord, updatedRecords,
                self = this;

            if (!foreignKeys) {
                foreignKeys = tableSchema._computedForeignKeys ||
                    (tableSchema._computedForeignKeys = keys);
            }

            //We need the cache populated from storage before we can do this:
            return this.fetchOfflinePrimaryKeys()
                .then(function (offlinePrimaryKeys) {

                    for (i = 0, countI = data.length;
                        (i < countI); i++) {
                        iData = data[i];
                        iPrimaryKey = iData[primaryKeyPropertyName];
                        for (j = 0;
                            (jForeignKey = foreignKeys[j]); j++) {
                            jForeignKeyValue = iData[jForeignKey];
                            //if we have a value in this foreignKey:
                            if (jForeignKeyValue) {
                                if (updatedRecord = self.addPrimaryKeyDependency(jForeignKeyValue, tableName, iPrimaryKey, jForeignKey, service.name)) {
                                    updatedRecords = updatedRecords || [];
                                    updatedRecords.push(updatedRecord);
                                }
                            }
                        }
                    }

                    if (updatedRecords && updatedRecords.length) {
                        //We need to save:
                        self.primaryKeysTable.bulkPut(updatedRecords)
                            .then(function (lastKey) {
                                console.log("Updated  offline primaryKeys dependencies" + lastKey); // Will be 100000.
                            }).catch(Dexie.BulkError, function (e) {
                                console.error(e);
                            });

                    }
                });
        }
    },

    deleteOfflinePrimaryKeyDependenciesForData: {
        value: function (data, tableName, primaryKeyPropertyName, tableForeignKeys) {

        }
    },

    /**
     * this assumes this._offlinePrimaryKeys has already been fetched
     * @returns {Object} - if we found a record to update, returns it
     * otherwise returns null
     */

    addPrimaryKeyDependency: {
        value: function (aPrimaryKey, tableName, tablePrimaryKey, tableForeignKey, serviceName) {

            if (this._offlinePrimaryKeys.has(aPrimaryKey)) {
                var aPrimaryKeyRecord = this._offlinePrimaryKeys.get(aPrimaryKey),
                    dependencies = aPrimaryKeyRecord.dependencies,
                    i, iDependency, found = false,
                    primaryKeysRecord;

                //Now we search for a match... wish we could use an in-memory
                //compound-index...
                if (dependencies) {
                    for (i = 0;
                        (iDependency = dependencies[i]); i++) {
                        if (iDependency.tableName === tableName &&
                            iDependency.primaryKey === tablePrimaryKey &&
                            iDependency.foreignKeyName === tableForeignKey) {
                            found = true;
                            break;
                        }
                    }
                }

                if (!found) {
                    primaryKeysRecord = {
                        serviceName: serviceName,
                        tableName: tableName,
                        primaryKey: tablePrimaryKey,
                        foreignKeyName: tableForeignKey
                    };
                    if (!dependencies) {
                        dependencies = aPrimaryKeyRecord.dependencies = [];
                    }
                    dependencies.push(primaryKeysRecord);
                    return aPrimaryKeyRecord;
                }
                return null;
            }
        }
    },

    _offlinePrimaryKeyToOnlinePrimaryKey: {
        value: new Map()
    },

    onlinePrimaryKeyForOfflinePrimaryKey: {
        value: function (offlinePrimaryKey) {
            return this._offlinePrimaryKeyToOnlinePrimaryKey.get(offlinePrimaryKey);
        }
    },

    /*
     * Returns a promise resolved when onlinePrimaryKey has replaced offlinePrimaryKey
     * both in memory and in IndexedDB
     * @type {Promise}
     */

    replaceOfflinePrimaryKey: {
        value: function (offlinePrimaryKey, onlinePrimaryKey, type, service) {

            var self = this;
            //Update the central table used by DataService's performOfflineOperations
            //to update operations are they are processed
            this._offlinePrimaryKeyToOnlinePrimaryKey.set(offlinePrimaryKey, onlinePrimaryKey);

            //Update the stored primaryKey
            return service.offlineService.updatePrimaryKey(offlinePrimaryKey, onlinePrimaryKey, type).then(function () {
                //Now we need to update stored data as well and we need the cache populated from storage before we can do this:
                //We shouldn't just rely on the fact that the app will immediately refetch everything and things would be broken
                //if somehow the App would get offline again before a full refetch is done across every kind of data.
                return self.fetchOfflinePrimaryKeys().then(function (offlinePrimaryKeys) {
                    if (offlinePrimaryKeys.has(offlinePrimaryKey)) {
                        var aPrimaryKeyRecord = offlinePrimaryKeys.get(offlinePrimaryKey),
                            dependencies = aPrimaryKeyRecord.dependencies;

                        if (dependencies) {
                            var i, iDependency, iOfflineDataService, iTableName, iPrimaryKey, iForeignKeyName, iUpdateRecord, updateArray = [];

                            for (i = 0;
                                (iDependency = dependencies[i]); i++) {
                                //The service that handles iTableName
                                iOfflineDataService = OfflineDataService.registeredOfflineDataServiceNamed(iDependency.serviceName);
                                iTableName = iDependency.tableName;
                                iPrimaryKey = iDependency.primaryKey;
                                iForeignKeyName = iDependency.foreignKeyName;

                                iUpdateRecord = {};
                                // updateArray[0] = iUpdateRecord;
                                iUpdateRecord[iOfflineDataService.schema[iTableName].primaryKey] = iPrimaryKey;
                                iUpdateRecord[iForeignKeyName] = onlinePrimaryKey;

                                return iOfflineDataService.tableNamed(iTableName).update(iPrimaryKey, iUpdateRecord);
                                //Using updateData creates offlineOperations we don't want here, hence direct use of table:
                                //This is internal to OfflineDataService and descendants.
                                // iOfflineDataService.updateData(updateArray, iTableName, null);


                            }
                        }

                    }

                });
            }).catch(function (e) {
                console.error("updatePrimaryKey failed with exception (", e, ")");
                reject(e);
            });
        }
    },

    /**
     * caches the primary keys only
     */
    _offlinePrimaryKeys: {
        value: null
    },

    _offlinePrimaryKeysPromise: {
        value: null
    },

    fetchOfflinePrimaryKeys: {
        value: function () {
            if (!this._offlinePrimaryKeys) {
                var _offlinePrimaryKeys = this._offlinePrimaryKeys = new Map(),
                    self = this;
                return new Promise(function (resolve, reject) {
                    self._offlinePrimaryKeyDB.PrimaryKeys.each(function (item, cursor) {
                        _offlinePrimaryKeys.set(item.offlinePrimaryKey, item);
                    }).then(function () {
                        resolve(_offlinePrimaryKeys);
                    }).catch(function (e) {
                        console.error("fetchOfflinePrimaryKeys failed", e);
                        reject(e);
                    });
                });
            } else {
                if (!this._offlinePrimaryKeysPromise) {
                    this._offlinePrimaryKeysPromise = Promise.resolve(this._offlinePrimaryKeys);
                }
                return this._offlinePrimaryKeysPromise;
            }
        }
    },

    deleteOfflinePrimaryKeys: {
        value: function (primaryKeys) {

            var self = this,
                _offlinePrimaryKeys = this._offlinePrimaryKeys;

            if (!primaryKeys || primaryKeys.length === 0) return Promise.resolve();

            return new Promise(function (resolve, reject) {
                self._offlinePrimaryKeyDB.PrimaryKeys.bulkDelete(primaryKeys).then(function () {
                    //Update local cache:
                    for (var i = 0, iPrimaryKey;
                        (iPrimaryKey = primaryKeys[i]); i++) {
                        _offlinePrimaryKeys.delete(iPrimaryKey.offlinePrimaryKey);
                    }
                    resolve();
                }).catch(function (e) {
                    console.error("deleteOfflinePrimaryKeys failed", e);
                    reject(e);
                });
            });
        }
    },


    deleteAllDBs: {
        value: function () {
            var promises = this._registeredOfflineDataServiceByName.map(function (value, key) {
                return Dexie.delete(key);
            });
            return Promise.all(promises).then(function () {
                console.log("Databases Deleted");
            });
        }
    }
});

global.deleteAllDBs = exports.OfflineDataService.deleteAllDBs.bind(exports.OfflineDataService);