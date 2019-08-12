var RawDataService = require("montage/data/service/raw-data-service").RawDataService,
	Criteria = require("montage/core/criteria").Criteria,
	DataObjectDescriptor = require("montage/data/model/data-object-descriptor").DataObjectDescriptor,
	DataQuery = require("montage/data/model/data-query").DataQuery,
	Montage = require("montage").Montage,
	ObjectDescriptor = require("montage/core/meta/object-descriptor").ObjectDescriptor,
	OfflineDataService = require("offline-data-service").OfflineDataService,
	Promise = require("montage/core/promise").Promise;

/**
 * Provides hazard data.
 *
 * @class
 * @extends external:HttpService
 */
exports.OfflineService = RawDataService.specialize(/** @lends HttpService.prototype */ {

	constructor: {
		value: function OfflineService() {
			var schema;
			RawDataService.call(this);
			if ((schema = this.offlineServiceSchema)) {
				this._offlineService = new OfflineDataService().initWithName(Montage.getInfoForObject(this).moduleId, 1, schema);
				this.addChildService(this._offlineService);
			}
		}
	},

	/**************************************************************************
	 * Offline
	 */

	/**
	 * The conduit for storing data in indexed DB.
	 * @type {OfflineDataService}
	 */
	offlineService: {
		get: function() {
			return this._offlineService;
		}
	},

	/**
	 * Convenience method for calling readOfflineOperations on the offline service.
	 * Returns a null promise if the offline service is not defined.
	 * @param {Map|WeakMap} - the operations map
	 * @returns {Promise}
	 */
	readOfflineOperations: {
		value: function (operationMapToService) {
			return this.offlineService ? this.offlineService.readOfflineOperations(operationMapToService) :
				this.nullPromise;
		}
	},


	/**
	 * Fetches the 'lastFetched' operations from the database. This is used for testing only. 
	 * 
	 * 
	 * @param {Map|WeakMap} - the operations map
	 * @returns {Promise}
	 */
	readStoredFetchOperations: {
		value: function () {
			var	service = this.offlineService;
			if (!this.offlineService) {
				return this.nullPromise;
			}
			return new Promise(function (resolve, reject) {
                service._db.then(function (db) {
                    db.open().then(function () {
                        service.operationTable(db).filter(function (operation) {
							return !operation.operation && operation.lastFetched;
						}).toArray(function (fetchOperations) {
                            resolve(fetchOperations);
                        }).catch(function (e) {
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

	
	/**
	 * Convenience method for calling deleteOfflineOperations on the offline
	 * service.  Returns a null promise if the offline service is not defined,
	 * otherwise returns a promise that is resolved when the operations have
	 * been removed.
	 * @param {Array<Operation>} - the operations to delete.
	 * @returns {Promise}
	 */
	deleteOfflineOperations: {
		value: function(operations) {
			return this.offlineService ?  this.offlineService.deleteOfflineOperations(operations) :
				this.nullPromise;
		}
	},

	/**
	 * A mapping of properties to raw properties.  Should be implemented in the
	 * subclasses.
	 * @type {Map}
	 */
	propertyToRawPropertyMap: {
		value: null
	},

	/**
	 * A mapping of properties to rest properties.  Should be implemented in the
	 * subclasses.
	 * @type {Map}
	 */
	rawPropertyToRestPropertyMap: {
		value: null
	},

	/**
	 * Returns the the property name defined in the rawPropertyToRestPropertyMap
	 * @param {String} -    the property to map
	 * @returns {String} -  the mapped property name if it exists or the supplied
	 *                      property name if it does not.
	 */
	mapRawPropertyNameToRESTPropertyName: {
		/* Candidate to move up in RawDataService
			transform the name of a property of objects used in the App to property understood by the sever*/
		value: function (property) {
			var map = this.rawPropertyToRestPropertyMap;
			return map ? (map.get(property) || property) : property;
		}
	},

	/**
	 * Returns the the property name defined in the propertyToRawPropertyMap
	 * @param {String} -    the property to map
	 * @returns {String} -  the mapped property name if it exists or the supplied
	 *                      property name if it does not.
	 */
	mapToRawPropertyName: {
		value: function (property) {
			/* Candidate to move up in RawDataService
				transform the name of a property of objects used in the App to property understood by the sever*/
			var map = this.propertyToRawPropertyMap;
			return map ? (map.get(property) || property) : property;
		}
	},


	/**
	 * Returns the the property value for the provided propertyName
	 * @param {String} -    the propertyName to map
	 * @param {*} -    the propertyName to map
	 * @returns {*} -  the mapped property value
	 */
	mapToRawPropertyValue: {
		/* Candidate to move up in RawDataService
		   Not totally clear what this is supposed to do.
		*/
		value: function (propertyName, propertyValue) {
			return propertyValue;
		}
	},

	/**
	 * The name of the provided type.
	 * @param{DataObjectDescriptor|ObjectDescriptor|constructor|string} - type
	 * @returns {string}
	 */
	mapToRawType: {
		/* Candidate to move up in RawDataService */
		/**
		 * @returns {string} = the name of this type.
		 */
		value: function (type) {
			var service = this.rootService;
			type =  type instanceof DataObjectDescriptor ?  type : // TODO: Remove after getting rid of DataObjectDescriptor
			type instanceof ObjectDescriptor ?              type :
															service._objectDescriptorForType(type); // Should be a public method on the data service?
			return  type.typeName || type.name;
		}
	},

	/**
	 * Maps the selector aka query to one that can be used by the offlineData-
	 * Service.
	 * @param {DataQuery} - query
	 * @returns {DataQuery} - the mapped query
	 */
	mapToRawSelector: {
		/* Candidate to move up in RawDataService */
		value: function (selector) {
			var criteria = selector.criteria.parameters || selector.criteria,
				keys = Object.keys(criteria),
				rawCriteria = {};

			keys.forEach(function (key) {
				var propertyValue = this._mapRawPropertyValue(key, criteria[key]),
					propertyName = this.mapToRawPropertyName(key);
				rawCriteria[propertyName] = propertyValue;
			}, this);

			return DataQuery.withTypeAndCriteria(this.mapToRawType(selector.type), rawCriteria);
		}
	},

	_mapRawPropertyValue: {
		value: function (key, rawValue) {
			var value;
			if(Array.isArray(rawValue) && rawValue.length > 1) {
				value = rawValue.map(function (item) {
					return this.mapToRawPropertyValue(key, item);
				}, this);
			} else if(Array.isArray(rawValue) && rawValue.length === 1) {
				value = this.mapToRawPropertyValue(key, rawValue[0]);
			} else if(Array.isArray(rawValue)) {
				value = void 0;
			} else {
				value = rawValue && this.mapToRawPropertyValue(key, rawValue);
			}
			if (typeof value !== "undefined" && !Array.isArray(value)) {
				value = this.onlinePrimaryKeyForOfflinePrimaryKey(value) || value;
			}
			return value;
		}
	},

	/**
	 * This implementation of sawRawData saves the object through the offline
	 * service.
	 * @param {object} - The raw data version of this object.
	 * @param {*} - The object that is being saved.
	 * @returns {Promise} - a promise that resolves when the save operation has
	 * been completed.
	 */
	saveRawData: {
		value: function (data, object) {
			return this._saveOfflineRawData(data, object).catch(function () {
				console.log("Failed to save offline data for type (" + object.constructor + ")");
				return null;
			});
		}
	},

	_saveOfflineRawData: {
		value: function (data, object) {
			var shouldCreateData = this.rootService.createdDataObjects.has(object),
				saveContext = this.contextForSavingRawData(data, object),
				service = this.offlineService,
				constructor = object.constructor;

			//We save locally no matter what:
			//Hard code hazard.type.name to Hazard.TYPE.
			return shouldCreateData ?   service.createData([data], constructor, saveContext) :
										service.updateData([data], constructor, saveContext);
		}
	},

	deleteRawData: {
		value: function (data, object) {
			var service = this.offlineService,
				saveContext = this.contextForSavingRawData(data, object),
				constructor = object.constructor;
			return service.deleteData([data], constructor, saveContext);
		}
	},

	contextForSavingRawData: {
		value: function (/* data, object */) {
			return undefined;
		}
	},

	/**
	 * This is a proxy method for writing raw data to the offline service.  It
	 * does some safety checking to ensure the provided criteria is not the new
	 * Criteria object.
	 * TODO: Determine why we cannot use a Criteria object when writing data.
	 * @param {Array<object>} - the data to be saved.
	 * @param {object} - the query aka selector used when fetching the data.
	 * @returns {Promise}
	 */
	writeOfflineData: {
		value: function (rawDataArray, selector) {
			var offlineService = this.offlineService,

				// updateDateDataOrdering = DataOrdering.withExpressionAndOrder("update_Date",DataOrdering.DESCENDING),
				rawSelector = this.mapToRawSelector(selector);

			// rawSelector.orderings = [updateDateDataOrdering];
			if (selector.criteria instanceof Criteria) {
				// console.warn("!!!OfflineDataService not compatible new criteria's syntax");
				return this.nullPromise;
			} else if (!this.offlineService) {
				return this.nullPromise;
			} else {
				return offlineService.writeOfflineData(rawDataArray, rawSelector).catch(function (e) {
					console.warn("Failed to write offline data for type (" + rawSelector.type + ")");
					console.warn(e);
					return null;
				});
			}
		}
	}

});

