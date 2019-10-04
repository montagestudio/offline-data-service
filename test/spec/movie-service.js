var OfflineDataService = require("offline-data-service").OfflineDataService,
	Criteria = require("montage/core/criteria").Criteria,
	DataQuery = require("montage/data/model/data-query").DataQuery,
	DataService = require('montage/data/service/data-service').DataService,
	Movie = require("logic/model/movie").Movie,
	Promise = require("montage/core/promise").Promise;

function goOnline(callback) {
	DataService.mainService.isOffline = false;
	setTimeout(function () {
		callback();
	}, 1000);
}


describe("A Movie Service", function() {

	it("can fetch data", function (done) {
		DataService.mainService.fetchData(Movie).then(function (movies) {
			expect(Array.isArray(movies));
			expect(movies.length).toBe(2);
			expect(movies[0].id).toBe(1);
			expect(movies[0].isFeatured).toBe(true);
			expect(movies[0].releaseDate instanceof Date).toBe(true);
			expect(movies[0].releaseDate.getFullYear()).toBe(1977);
			expect(movies[0].releaseDate.getMonth()).toBe(11);
			expect(movies[0].releaseDate.getDate()).toBe(20);
			expect(movies[0].title).toBe("Star Wars: The Rise of Skywalker");
			expect(movies[1].id).toBe(2);
			expect(movies[1].isFeatured).toBe(false);
			expect(movies[1].releaseDate instanceof Date).toBe(true);
			expect(movies[1].releaseDate.getFullYear()).toBe(2019);
			expect(movies[1].releaseDate.getMonth()).toBe(7);
			expect(movies[1].releaseDate.getDate()).toBe(16);
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
			expect(movies[0].releaseDate.getFullYear()).toBe(1977);
			expect(movies[0].releaseDate.getMonth()).toBe(11);
			expect(movies[0].releaseDate.getDate()).toBe(20);
			expect(movies[0].title).toBe("Star Wars: The Rise of Skywalker");
			expect(movies[1].id).toBe(2);
			expect(movies[1].isFeatured).toBe(false);
			expect(movies[1].releaseDate instanceof Date).toBe(true);
			expect(movies[1].releaseDate.getFullYear()).toBe(2019);
			expect(movies[1].releaseDate.getMonth()).toBe(7);
			expect(movies[1].releaseDate.getDate()).toBe(16);
			expect(movies[1].title).toBe("The Informer");
			goOnline(done);
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
			expect(movies[0].releaseDate.getFullYear()).toBe(1977);
			expect(movies[0].releaseDate.getMonth()).toBe(11);
			expect(movies[0].releaseDate.getDate()).toBe(20);
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
			expect(movies[0].releaseDate.getFullYear()).toBe(1977);
			expect(movies[0].releaseDate.getMonth()).toBe(11);
			expect(movies[0].releaseDate.getDate()).toBe(20);
			expect(movies[0].title).toBe("Star Wars: The Rise of Skywalker");
			goOnline(done);
			done();
		});
	});

	it("can update data when online", function (done) {
		var service = DataService.mainService;
		service.fetchData(Movie).then(function (movies) {
			var starWars = movies[0];
			starWars.tomatometer = 100;
			return service.saveDataObject(starWars);
		}).then(function () {
			return service.fetchData(Movie);
		}).then(function (movies) {
			var starWars = movies[0];
			expect(starWars.tomatometer).toBe(100);
			starWars.tomatometer = 93;
			return service.saveDataObject(starWars);
		}).then(function () {
			done();
		});
	});

	it("can create data when online", function (done) {
		var service = DataService.mainService,
			eSB = service.createDataObject(Movie),
			date = new Date();
		date.setFullYear(1980, 5, 20);
		eSB.title = "Star Wars: The Empire Strikes Back";
		eSB.isFeatured = true;
		eSB.releaseDate = date;
		eSB.tomatometer = 95;
		service.saveDataObject(eSB).then(function () {
			return service.fetchData(Movie);
		}).then(function (movies) {
			var eSB;
			expect(movies.length).toBe(3);
			eSB = movies[2];
			expect(eSB.id).toBe(3);
			expect(eSB.isFeatured).toBe(true);
			expect(eSB.releaseDate instanceof Date).toBe(true);
			expect(eSB.releaseDate.getFullYear()).toBe(1980);
			expect(eSB.releaseDate.getMonth()).toBe(5);
			expect(eSB.releaseDate.getDate()).toBe(20);
			expect(eSB.title).toBe("Star Wars: The Empire Strikes Back");
			done();
		});
	});

	it("can update data when offline and perform offline changes when online", function (done) {
		var service = DataService.mainService;
		service.isOffline = true;
		service.fetchData(Movie).then(function (movies) {
			var starWars = movies[0];
			starWars.tomatometer = 98;
			return service.saveDataObject(starWars);
		}).then(function () {
			return service.fetchData(Movie);
		}).then(function (movies) {
			var starWars = movies[0],
				promise = new Promise(function (resolve, reject) {
					goOnline(resolve);
				});
			expect(starWars.tomatometer).toBe(98);
			return promise;
		}).then(function () {
			var waitForOfflineOperations = new Promise(function (resolve, reject) {
				goOnline(resolve);
			});
			return waitForOfflineOperations;
		}).then(function () {
			return service.fetchData(Movie);
		}).then(function (movies) {
			expect(movies[0].tomatometer).toBe(98);
			done();
		});
	});

	it("can create data when offline and perform offline changes when online", function (done) {
		var service = DataService.mainService,
			rOJ = service.createDataObject(Movie),
			date = new Date();
		service.isOffline = true;
		date.setFullYear(1983, 4, 23);
		rOJ.title = "Star Wars: The Return of the Jedi";
		rOJ.isFeatured = true;
		rOJ.releaseDate = date;
		rOJ.tomatometer = 81;
		service.saveDataObject(rOJ).then(function () {
			return service.fetchData(Movie);
		}).then(function (movies) {
			var onlinePromise = new Promise(function (resolve, reject) {
					goOnline(resolve);
				}),
				rOJ;
			expect(movies.length).toBe(4);
			rOJ = movies[3];
			expect(rOJ.id).toBeDefined();
			expect(rOJ.isFeatured).toBe(true);
			expect(rOJ.releaseDate instanceof Date).toBe(true);
			expect(rOJ.releaseDate.getFullYear()).toBe(1983);
			expect(rOJ.releaseDate.getMonth()).toBe(4);
			expect(rOJ.releaseDate.getDate()).toBe(23);
			expect(rOJ.title).toBe("Star Wars: The Return of the Jedi");
			expect(rOJ.tomatometer).toBe(81);
			return onlinePromise;
		}).then(function () {
			var waitForOfflineOperations = new Promise(function (resolve, reject) {
				goOnline(resolve);
			});
			return waitForOfflineOperations;
		}).then(function () {
			return service.fetchData(Movie);
		}).then(function (movies) {
			var rOJ;
			expect(movies.length).toBe(4);
			rOJ = movies[3];
			expect(rOJ.id).toBe(4);
			expect(rOJ.isFeatured).toBe(true);
			expect(rOJ.releaseDate instanceof Date).toBe(true);
			expect(rOJ.releaseDate.getFullYear()).toBe(1983);
			expect(rOJ.releaseDate.getMonth()).toBe(4);
			expect(rOJ.releaseDate.getDate()).toBe(23);
			expect(rOJ.title).toBe("Star Wars: The Return of the Jedi");
			expect(rOJ.tomatometer).toBe(81);
			done();
			return null;
		});
	});

	it("can delete a movie when online", function (done) {
		var service = DataService.mainService;
		return service.fetchData(Movie).then(function (movies) {
			var informer = movies.find(function (movie) {
					return movie.id === 2;
				});
			return service.deleteDataObject(informer);
		}).then(function () {
			return service.fetchData(Movie);
		}).then(function (movies) {
			var informer = movies.find(function (movie) {
				return movie.id === 2;
			});
			expect(informer).toBe(undefined);
			expect(movies.length).toBe(3);
			done();
		});
	});

	it("can delete a movie when offline and perform changes when online", function (done) {
		var service = DataService.mainService;
		service.isOffline = true;
		return service.fetchData(Movie).then(function (movies) {
			var eSB = movies.find(function (movie) {
				return movie.id === 3;
			});
			return service.deleteDataObject(eSB);
		}).then(function () {
			return service.fetchData(Movie);
		}).then(function (movies) {
			var onlinePromise = new Promise(function (resolve, reject) {
					goOnline(resolve);
				}),
				eSB = movies.find(function (movie) {
				return movie.id === 3;
			});
			expect(eSB).toBe(undefined);
			expect(movies.length).toBe(2);
			return onlinePromise;
		}).then(function () {
			var waitForOfflineOperations = new Promise(function (resolve, reject) {
				goOnline(resolve);
			});
			return waitForOfflineOperations;
		}).then(function () {
			return service.fetchData(Movie);
		}).then(function (movies) {
			expect(movies.length).toBe(3);
			done();
		});
	});

	it("can read offline operations", function (done) {
		var service = DataService.mainService.childServiceForType(Movie);
		service.readOfflineOperations().then(function (operations) {
			expect(Array.isArray(operations)).toBe(true);
			done();
		})
	});

});
