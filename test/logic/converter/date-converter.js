var Converter = require("montage/core/converter/converter").Converter;

/**
 * @class DateConverter
 * @classdesc Converts a string in ISO-8601 format to a string and vice-versa
 * @extends Converter
 */
exports.DateConverter = Converter.specialize( /** @lends DateConverter# */ {

	/**
	 * Converts the specified value to a Date.
	 * @function
	 * @param {string} The string in ISO-8601 format
	 * @returns {Date} The date.
	 */
	convert: {
		value: function (value) {
			var components = value.split("-"),
				date = new Date();
			date.setFullYear(components[0], components[1] - 1, components[2]);
			return date;
		}
	},

	/**
	 * Reverts a date object to a string in ISO-8601 format.
	 * @function
	 * @param {Date} v The value to revert.
	 * @returns {string} the value.
	 */
	revert: {
		value: function (value) {
			value = value || new Date();
			return [value.getFullYear(), value.getMonth() + 1, value.getDate()].join("-");
		}
	}

});