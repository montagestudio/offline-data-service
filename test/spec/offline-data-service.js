var OfflineDataService = require("offline-data-service").OfflineDataService,
    FooService = require("logic/service/foo-service").FooService;

describe("An OfflineDataService", function() {

    var previousTimeoutInterval, service;
    beforeAll(function () {
        service = new FooService();
    });

    afterAll(function (done) {
        service.offlineService.deleteDBWithName("logic/service/foo-service").then(function () {
            done();
        }).catch(function (e) {
            console.error("Failed to delete all Databases after specs completed");
            done();
        })
    });
    
    it("can create tables for schema", function (done) {
        var error = null,
            query = {type: {name:"Foo"}, criteria: {}},
            database;

        service.initWithSchema().then(function (db) {
            database = db;
            //db is an instance of Dexie
            expect(db).toBeDefined();
            expect(db.tables).toBeDefined();
            if (db.tables) {
                expect(db.tables.length).toBe(2);
            }
            return service.writeOfflineData([{id: 1}, {id: 2}], query);
        }).then(function () {
            return service.fetchData(query);
        }).then(function (data) {
            expect(data).toBeDefined();
            if (data) {
                expect(data.length).toBe(2);
            }
            return null;
        }).catch(function (e) {
            error = e;
        }).finally(function () {
            expect(error).toBe(null);
            database.close();
            done();
        })
    });

    it("can add table to schema", function (done) {
        var newSchema = {
            "Bar": {
				primaryKey: "id",
				indexes: ["id"],
				versionUpgradeLogic: null
			},
            "Foo": {
				primaryKey: "id",
				indexes: ["id"],
				versionUpgradeLogic: null
			}
        },
        fooQuery = {type: {name:"Foo"}, criteria: {}},
        barQuery = {type: {name:"Bar"}, criteria: {}},
        service = new FooService(),
        error = null,
        database;

        service.initWithSchema(newSchema).then(function (db) {
            database = db;
            //db is an instance of Dexie
            expect(db).toBeDefined();
            expect(db.tables).toBeDefined();
            if (db.tables) {
                expect(db.tables.length).toBe(3);
            }
            return service.fetchData(fooQuery);
        }).then(function (data) {
            expect(data).toBeDefined();
            if (data) {
                expect(data.length).toBe(2);
            }
            return null;
        }).then(function () {
            return service.writeOfflineData([{id: 3}, {id: 4}], fooQuery);
        }).then(function () {
            return service.fetchData(fooQuery);
        }).then(function (data) {
            expect(data).toBeDefined();
            if (data) {
                expect(data.length).toBe(2);
            }
        }).then(function () {
            return service.writeOfflineData([{id: 1}, {id: 2}], barQuery);
        }).then(function () {
            return service.fetchData(barQuery);
        }).then(function (data) {
            expect(data).toBeDefined();
            if (data) {
                expect(data.length).toBe(2);
            }
        }).catch(function (e) {
            error = e;
        }).finally(function () {
            expect(error).toBe(null);
            database.close();
            done();
        })
    });


    it("can clear all tables", function (done) {
        var fooQuery = {type: {name:"Foo"}, criteria: {}},
            barQuery = {type: {name:"Bar"}, criteria: {}},
            error = null,
            database;
        
        
            var newSchema = {
                "Bar": {
                    primaryKey: "id",
                    indexes: ["id"],
                    versionUpgradeLogic: null
                },
                "Foo": {
                    primaryKey: "id",
                    indexes: ["id"],
                    versionUpgradeLogic: null
                }
            },
            // fooQuery = {type: {name:"Foo"}, criteria: {}},
            // barQuery = {type: {name:"Bar"}, criteria: {}},
            service = new FooService(),
            error = null;

        service.initWithSchema(newSchema).then(function (db) {
            database = db;
            return OfflineDataService.clearAllTables();
        }).then(function () {
            return service.fetchData(fooQuery);
        }).then(function (data) {
            expect(data.length).toBe(0)
            return service.fetchData(barQuery);
        }).then(function (data) {
            expect(data.length).toBe(0);
            return null;
        }).catch(function (e) {
            error = e;
            console.error(e);
        }).finally(function () {
            expect(error).toBe(null);
            database.close();
            done();
        });

    });

});
