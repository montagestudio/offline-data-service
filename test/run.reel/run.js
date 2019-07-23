var Component = require("montage/ui/component").Component,
    mainServiceSerialization = require("data/montage-data.mjson");

/**
 * @class Run
 * @extends Component
 */
exports.Run = Component.specialize(/** @lends Run.prototype */ {

    specs: {
        // Require the Jasmine "specs" defining the test here.
        // For maintainability please keep these in alphabetical order.
        value: [
            require("spec/offline-data-service"),
            require("spec/movie-service")
        ]
    },

    enterDocument: {
        value: function (firstTime) {
            if (firstTime) {
                this._beginTesting();
            }
        }
    },

    _beginTesting: {
        value: function () {
            var specs = this.specs;
            this._registerServices().then(function () {
                runJasmine(specs);
            });
        }
    },

    _registerServices: {
        value: function () {
            var service = mainServiceSerialization.montageObject;
            return service._childServiceRegistrationPromise;
        }
    },

    hasTemplate: {
        value: false
    }

});

