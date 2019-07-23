var OfflineDataService = require("offline-data-service").OfflineDataService,
	Criteria = require("montage/core/criteria").Criteria,
	DataQuery = require("montage/data/model/data-query").DataQuery,
	DataService = require('montage/data/service/data-service').DataService,
	Movie = require("logic/model/movie").Movie;

describe("A Movie Service", function() {

	it("can fetch data", function (done) {
		DataService.mainService.fetchData(Movie).then(function (movies) {
			expect(Array.isArray(movies));
			expect(movies.length).toBe(2);
			expect(movies[0].id).toBe(1);
			expect(movies[0].isFeatured).toBe(true);
			expect(movies[0].releaseDate instanceof Date).toBe(true);
			expect(movies[0].releaseDate.getUTCFullYear()).toBe(2019);
			expect(movies[0].releaseDate.getUTCMonth()).toBe(11);
			expect(movies[0].releaseDate.getUTCDate()).toBe(20);
			expect(movies[0].title).toBe("Star Wars: The Rise of Skywalker");
			expect(movies[1].id).toBe(2);
			expect(movies[1].isFeatured).toBe(false);
			expect(movies[1].releaseDate instanceof Date).toBe(true);
			expect(movies[1].releaseDate.getUTCFullYear()).toBe(2019);
			expect(movies[1].releaseDate.getUTCMonth()).toBe(7);
			expect(movies[1].releaseDate.getUTCDate()).toBe(16);
			expect(movies[1].title).toBe("The Informer");
			done();
		});
	});

	it("can fetch data when offline", function (done) {
		DataService.mainService.isOffline = true;
		DataService.mainService.fetchData(Movie).then(function (movies) {
			expect(Array.isArray(movies));
			expect(movies.length).toBe(2);
			expect(movies[0].id).toBe(1);
			expect(movies[0].isFeatured).toBe(true);
			expect(movies[0].releaseDate instanceof Date).toBe(true);
			expect(movies[0].releaseDate.getUTCFullYear()).toBe(2019);
			expect(movies[0].releaseDate.getUTCMonth()).toBe(11);
			expect(movies[0].releaseDate.getUTCDate()).toBe(20);
			expect(movies[0].title).toBe("Star Wars: The Rise of Skywalker");
			expect(movies[1].id).toBe(2);
			expect(movies[1].isFeatured).toBe(false);
			expect(movies[1].releaseDate instanceof Date).toBe(true);
			expect(movies[1].releaseDate.getUTCFullYear()).toBe(2019);
			expect(movies[1].releaseDate.getUTCMonth()).toBe(7);
			expect(movies[1].releaseDate.getUTCDate()).toBe(16);
			expect(movies[1].title).toBe("The Informer");
			DataService.mainService.isOffline = false; // is async.
			setTimeout(function () {
				done(); // to compensate for isOffline#set being async.
			}, 1000);
		});
	});

	it("can fetch data with criteria", function (done) {
		var expression = "$id == id",
			parameters = {id: 1},
			criteria = new Criteria().initWithExpression(expression, parameters),
			query = DataQuery.withTypeAndCriteria(Movie, criteria);
		DataService.mainService.fetchData(query).then(function (movies) {
			expect(Array.isArray(movies));
			expect(movies.length).toBe(1);
			expect(movies[0].id).toBe(1);
			expect(movies[0].isFeatured).toBe(true);
			expect(movies[0].releaseDate instanceof Date).toBe(true);
			expect(movies[0].releaseDate.getUTCFullYear()).toBe(2019);
			expect(movies[0].releaseDate.getUTCMonth()).toBe(11);
			expect(movies[0].releaseDate.getUTCDate()).toBe(20);
			expect(movies[0].title).toBe("Star Wars: The Rise of Skywalker");
			done();
		});
	});

	it("can fetch data with criteria when offline", function (done) {
		var expression = "$id == id",
			parameters = {id: 1},
			criteria = new Criteria().initWithExpression(expression, parameters),
			query = DataQuery.withTypeAndCriteria(Movie, criteria);
		DataService.mainService.isOffline = true;
		DataService.mainService.fetchData(query).then(function (movies) {
			expect(Array.isArray(movies));
			expect(movies.length).toBe(1);
			expect(movies[0].id).toBe(1);
			expect(movies[0].isFeatured).toBe(true);
			expect(movies[0].releaseDate instanceof Date).toBe(true);
			expect(movies[0].releaseDate.getUTCFullYear()).toBe(2019);
			expect(movies[0].releaseDate.getUTCMonth()).toBe(11);
			expect(movies[0].releaseDate.getUTCDate()).toBe(20);
			expect(movies[0].title).toBe("Star Wars: The Rise of Skywalker");
			DataService.mainService.isOffline = false;
			done();
		});
	});

});
