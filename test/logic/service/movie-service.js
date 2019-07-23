var OfflineService = require("logic/service/offline-service").OfflineService,
	DataQuery = require("montage/data/model/data-query").DataQuery,
	DataService = require("montage/data/service/data-service").DataService,
	DataStream = require("montage/data/service/data-stream").DataStream;

exports.MovieService = OfflineService.specialize(/** @lends MovieService.prototype */ {

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
				response = parameters && parameters.id ?    MOVIE_RESPONSE.splice(0, 1) :
															MOVIE_RESPONSE;
			this.addRawData(stream, response);
			this.rawDataDone(stream);
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

var MOVIE_RESPONSE = [
	{
		id: 1,
		isFeatured: true,
		releaseDate: "2019-12-20",
		title: "Star Wars: The Rise of Skywalker"
	},
	{
		id: 2,
		isFeatured: false,
		releaseDate: "2019-08-16",
		title: "The Informer"
	}
];