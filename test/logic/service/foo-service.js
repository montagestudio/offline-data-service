var OfflineService = require("logic/service/offline-service").OfflineService,
    DataStream = require("montage/data/service/data-stream").DataStream,
    Montage = require("montage").Montage,
    OfflineDataService = require("offline-data-service").OfflineDataService;


exports.FooService = OfflineService.specialize( /** @lends FooService.prototype */ {

    constructor: {
        value: function FooService() {
            //Overridden to prevent immediate creation of offline-data-service
        }
    },

    initWithSchema: {
        value: function (schema) {
            var self = this;
            if (this.database) {
                return this.database.then(function (db) {
                    return db.close();
                }).then(function () {
                    self._initOfflineServiceWithSchema(schema);
                    return self.database;
                });
            } else {
                self._initOfflineServiceWithSchema(schema);
                return this.database;
            }
        }
    },

    _initOfflineServiceWithSchema: {
        value: function (schema) {
            if (schema) {
                this.offlineServiceSchema = schema;
            }
            this._offlineService = new OfflineDataService().initWithName(Montage.getInfoForObject(this).moduleId, 1, this.offlineServiceSchema);
            this.addChildService(this._offlineService);
        }
    },

    database: {
        get: function () {
            return this.offlineService && this.offlineService._db;
        }
    },

    fetchData: {
        value: function (query) {
            var stream = new DataStream(),
                rawQuery = {
                    type: query.type.name,
                    criteria: query.criteria
                };
            return this.offlineService.fetchData(rawQuery, stream);
        }
    },

    offlineServiceSchema: {
        value: {
            "Foo": {
                primaryKey: "id",
                indexes: ["id"],
                versionUpgradeLogic: null
            }
        }
    }

});