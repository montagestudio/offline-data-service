var OfflineService = require("logic/service/offline-service").OfflineService,
	DataQuery = require("montage/data/model/data-query").DataQuery,
	DataService = require("montage/data/service/data-service").DataService,
	DataStream = require("montage/data/service/data-stream").DataStream,
	Promise = require("montage/core/promise").Promise;

var MOVIE_RESPONSE = [];

exports.MovieService = OfflineService.specialize(/** @lends MovieService.prototype */ {

	constructor: {
		value: function MovieService() {
			OfflineService.call(this);
			MOVIE_RESPONSE.push({
				id: this._nextPrimaryKey(),
				isFeatured: true,
				releaseDate: "1977-12-20",
				title: "Star Wars: The Rise of Skywalker",
				tomatometer: 93
			},
			{
				id: this._nextPrimaryKey(),
				isFeatured: false,
				releaseDate: "2019-08-16",
				title: "The Informer",
				tomatometer: undefined
			});
		}
	},

	_primaryKey: {
		value: 0
	},

	_nextPrimaryKey: {
		value: function () {
			this._primaryKey = this._primaryKey + 1;
			return this._primaryKey;
		}
	},

	/**************************************************************************
	 * Fetching Data
	 */

	fetchRawData: {
		value: function (stream) {
			var isOffline = DataService.mainService.isOffline;
			if (isOffline) {
				this._fetchOfflineMovieData(stream);
			} else {
				this._fetchOnlineMovieData(stream);
			}
		}
	},

	_fetchOfflineMovieData: {
		value: function (stream) {
			var self = this,
				query = stream.query,
				type = this.mapToRawType(query.type),
				criteria = query.criteria,
				rawSelector = DataQuery.withTypeAndCriteria(type, criteria),
				inlineStream = DataStream.withTypeOrQuery(query);
			return this.offlineService.fetchData(rawSelector, inlineStream)
				.then(function (rawData) {
					self.addRawData(stream, rawData);
					self.rawDataDone(stream);
				});
		}
	},

	_fetchOnlineMovieData: {
		value: function (stream) {
			var criteria = stream.query.criteria,
				parameters = criteria && criteria.parameters,
				response = parameters && parameters.id ?    MOVIE_RESPONSE.slice(0, 1) :
															MOVIE_RESPONSE;
			this.addRawData(stream, response);
			this.rawDataDone(stream);
		}
	},

	/**************************************************************************
	 * Saving Data
	 */

	saveRawData: {
		value: function (data, object) {
			return this.isOffline ?     this.super(data, object) :
										this._saveRawDataOnline(data, object);
		}
	},

	_saveRawDataOnline: {
		value: function (data, object) {
			var isNew = this.rootService.createdDataObjects.has(object);
			return isNew ?  this._saveNewMovieOnline(data, object) :
							this._updateMovieOnline(data, object);
		}
	},

	_saveNewMovieOnline: {
		value: function (data /*, object*/) {
			var response = Object.assign({}, data);
			MOVIE_RESPONSE.push(response);
			response.id = this._nextPrimaryKey();
			return Promise.resolve(response);
		}
	},

	_updateMovieOnline: {
		value: function (data /*, object */) {
			var movie = MOVIE_RESPONSE.find(function (item) {
				if (item.id === data.id) {
					return item;
				}
			});
			if (movie) {
				movie.isFeatured = data.isFeatured;
				movie.releaseDate = data.releaseDate;
				movie.title = data.title;
				movie.tomatometer = data.tomatometer;
			}
			return this.nullPromise;
		}
	},

	/**************************************************************************
	 * Deleting Data
	 */

	deleteRawData: {
		value: function (data, object) {
			return this.isOffline ? this.super(data, object) :
									this._deleteMovieOnline(data, object);
		}
	},

	_deleteMovieOnline: {
		value: function (data, object) {
			var movie = MOVIE_RESPONSE.find(function (item) {
					return item.id === data.id;
				}),
				index = MOVIE_RESPONSE.indexOf(movie);
			if (index > -1) {
				MOVIE_RESPONSE.splice(index, 1);
			}
			return this.nullPromise;
		}
	},

	/**************************************************************************
	 * Offline Schema & Delegate Methods
	 */

	performMovieOfflineOperation: {
		value: function (operation) {
			var operationKind = operation.operation,
				isCreateOperation = (operationKind === "create"),
				operationChanges = operation.changes;

			console.log("Performing Operation for Movie (", operation, ")");
			return isCreateOperation ?  this._saveNewOfflineMovieOnline(operationChanges) :
										this._updateMovieOnline(operationChanges);
		}
	},

	_saveNewOfflineMovieOnline: {
		value: function (data) {
			var self = this;
			return this._saveNewMovieOnline(data).then(function (movie) {
				var offlinePrimaryKey = data.id,
					onlinePrimaryKey = movie.id;
				return self.offlineService.replaceOfflinePrimaryKey(offlinePrimaryKey, onlinePrimaryKey, "Movie", self);
			});
		}
	},

	offlineServiceSchema: {
		writable: false,
		value: {
			"Movie": {
				primaryKey: "id",
				indexes: ["id"],
				versionUpgradeLogic: null
			}
		}
	}

});