var Montage = require("montage").Montage;

/**
 * @class Movie
 * @extends Montage
 */
exports.Movie = Montage.specialize({

	/**
	 * @type {Category}
	 */
	category: {
		value: undefined
	},

	/**
	 * Primary key for this movie.
	 * @type {number}
	 */
	id: {
		value: undefined
	},

	/**
	 * @type {boolean}
	 */
	isFeatured: {
		value: undefined
	},

	/**
	 * @type {PlotSummary}
	 */
	plotSummary: {
		value: undefined
	},

	/**
	 * @type {Date}
	 */
	releaseDate: {
		value: undefined
	},

	/**
	 * @type {string}
	 */
	title: {
		value: undefined
	},

	/**
	 * @type {number}
	 */
	tomatometer: {
		value: 0
	}

});
