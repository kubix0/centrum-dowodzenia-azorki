/*
 * L.Terminator displays the day/night terminator on a Leaflet map.
 */

L.Terminator = L.Polygon.extend({
	options: {
		color: '#000000',
		opacity: 0.5,
		fillColor: '#000000',
		fillOpacity: 0.5,
		resolution: 2 // degrees between vertices
	},

	initialize: function (options) {
		L.Util.setOptions(this, options);
		this._latLngs = this._computeLatLngs();
		this._bounds = L.latLngBounds(this._latLngs);
		L.Polygon.prototype.initialize.call(this, this._latLngs, this.options);
	},

	setTime : function( time ) {
		this.time = time;
		this.setLatLngs( this._computeLatLngs() );
	},

	// https://github.com/Leaflet/Leaflet/blob/v0.7.7/src/layer/vector/Path.SVG.js#L268
	_getLat: function(a){
		return a.lat;
	},

	// https://github.com/Leaflet/Leaflet/blob/v0.7.7/src/layer/vector/Path.SVG.js#L271
	_getLng: function(a){
		return a.lng;
	},

	// Calculate the Latitude/Longitude of the terminator path
	_computeLatLngs: function () {
		var time = this.time || new Date();
		var T = this.julian(time);
		var U = (T - 2451545.0) / 36525; // centuries since J2000

		var lngHour = this.gmst(time); // Greenwich Mean Sidereal Time

		var slon = this.sunEclipticLongitude(T); // solar ecliptic longitude
		var ecc = this.eccentricityEarthOrbit(U); // eccentricity of earth's orbit
		var tanec = this.meanObliquityOfEcliptic(U); // mean obliquity of the ecliptic

		var slat = 0; // solar ecliptic latitude ?

		// Delta T is the difference between Terrestrial Time (TT) and Universal Time (UT1)
		// approximately seconds; varies. See http://asa.usno.navy.mil/SecK/DeltaT.html
		// TT is needed for the calculation of sun position, but TAI is the basis
		// of the time sent in the packet. TAI is approximately TT - 32.184 seconds.
		// We can fudge delta T to be 32.184 + 36 = 68.184 (36 is leap seconds)
		// This is not critical.

		var eqtime = this.equationOfTime(U, slon, ecc, tanec); // equation of time
		var anom = this.sunTrueAnomaly(U, slon, ecc); // true anomaly
		var sdec = this.sunDeclination(slon, slat, tanec); // sun declination

		// apparent sidereal time at greenwich
		var ast = lngHour + eqtime - (0.0053*Math.sin(anom) - 0.0069*Math.sin(2*slon));
		var hourAngle = ast - this.sunApparentLongitude(slon, slat, tanec); // apparent longitude ?

		var resolution = this.options.resolution;
		var latLngs = [];

		for (var i = -180; i <= 180; i += resolution) {
			var lon = L.Util.wrapNum(i + hourAngle, [-180, 180]); // radians(i) ??
			var lat = Math.atan(-Math.cos(this.radians(lon)) / Math.tan(this.radians(sdec)));
			latLngs.push(L.latLng(this.degrees(lat), i)); // was lon instead of i
		}

		if (sdec > 0) {
			latLngs.push(L.latLng(90, 180));
			latLngs.push(L.latLng(90, -180));
		} else {
			latLngs.push(L.latLng(-90, 180));
			latLngs.push(L.latLng(-90, -180));
		}
		// Sort by longitude
		// https://github.com/Leaflet/Leaflet/blob/v0.7.7/src/layer/vector/Path.SVG.js#L266
		latLngs.sort(function(a,b) {
			return this._getLng(a) - this._getLng(b);
		}.bind(this));
		return latLngs;
	},

	// Calculate the Julian date for a given time
	// https://gist.github.com/jiffyclub/1297840
	julian: function (time) {
		/* Calculate the present UTC Julian Date. Function is valid after
		 * the beginning of the UNIX epoch 1970-01-01 and ignores leap
		 * seconds. */
		return (time.getTime() / 86400000) + 2440587.5;
	},

	gmst: function (time) {
		// Calculate Greenwich Mean Sidereal Time for a given time
		// http://aa.usno.navy.mil/faq/docs/GAST.php
		var j = this.julian(time);
		var jd0 = Math.floor(j - 0.5) + 0.5; // julian day number
		var T = (jd0 - 2451545.0) / 36525.0; // centuries since J2000

		// Greenwich mean sidereal time in hours
		var gmst = 6.697374558 + (2400.051336 * T) + (0.000025862 * T * T) + (j - jd0) * 24 * 1.00273790935;
		return gmst % 24 * 15; // in degrees
	},

	sunEclipticLongitude: function (T) {
		// Calculate the Geometric Mean Longitude of the Sun
		// http://aa.usno.navy.mil/faq/docs/SunApprox.php
		var L = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360; // in degrees
		// Calculate the Mean Anomaly of the Sun
		var M = (357.52911 + T * (35999.05029 - T * 0.0001537)); // in degrees
		// Calculate the Equation of the Center
		var C = (1.914602 - T * (0.004817 + T * 0.000014)) * Math.sin(this.radians(M)) +
				(0.019993 - T * 0.000101) * Math.sin(this.radians(2*M)) +
				0.000289 * Math.sin(this.radians(3*M));
		// Calculate the true longitude of the sun
		var lon = L + C;
		// Calculate the apparent longitude of the sun (corrected for aberration)
		var apparentLon = lon - 0.00569 - 0.00478 * Math.sin(this.radians(125.04 - 1934.136 * T));
		return apparentLon; // in degrees
	},

	sunApparentLongitude: function(slon, slat, tanec) {
		// TODO: Implement this calculation
		// For now, returning the ecliptic longitude as an approximation
		return slon; // Placeholder
	},

	eccentricityEarthOrbit: function (U) {
		// Calculate the eccentricity of Earth's orbit
		// http://aa.usno.navy.mil/faq/docs/SunApprox.php
		var e = 0.016708634 - U * (0.000042037 + U * 0.0000001267);
		return e; // unitless
	},

	meanObliquityOfEcliptic: function (U) {
		// Calculate the mean obliquity of the ecliptic
		// http://aa.usno.navy.mil/faq/docs/SunApprox.php
		var seconds = 21.448 - U * (46.8150 + U * (0.00059 - U * 0.001813));
		var e0 = 23 + (26 + (seconds / 60)) / 60;
		return e0; // in degrees
	},

	equationOfTime: function (U, slon, ecc, tanec) {
		// Calculate the difference between apparent and mean solar time
		var L0 = (280.46646 + U * (36000.76983 + U * 0.0003032)) % 360; // mean longitude of the sun
		var M = (357.52911 + U * (35999.05029 - U * 0.0001537)); // mean anomaly of the sun

		var y = Math.tan(this.radians(tanec/2));
		y *= y;

		var Etime = y * Math.sin(this.radians(2*L0)) -
					2 * ecc * Math.sin(this.radians(M)) +
					4 * ecc * y * Math.sin(this.radians(M)) * Math.cos(this.radians(2*L0)) -
					0.5 * y * y * Math.sin(this.radians(4*L0)) -
					1.25 * ecc * ecc * Math.sin(this.radians(2*M));

		return this.degrees(Etime)/15; // in degrees / Equation of time in hours
	},

	sunTrueAnomaly: function(U, slon, ecc) {
		// Calculate the true anomaly of the sun
		var M = (357.52911 + U * (35999.05029 - U * 0.0001537)); // mean anomaly
		var C = (1.914602 - U * (0.004817 + U * 0.000014)) * Math.sin(this.radians(M)) +
				(0.019993 - U * 0.000101) * Math.sin(this.radians(2*M)) +
				0.000289 * Math.sin(this.radians(3*M)); // equation of center
		return M + C; // in degrees
	},

	sunDeclination: function (slon, slat, tanec) {
		// Calculate the declination of the sun
		// http://aa.usno.navy.mil/faq/docs/SunApprox.php
		var sint = Math.sin(this.radians(tanec)) * Math.sin(this.radians(slon));
		var theta = Math.asin(sint);
		return this.degrees(theta); // in degrees
	},

	radians: function (degrees) {
		return degrees * Math.PI / 180;
	},

	degrees: function (radians) {
		return radians * 180 / Math.PI;
	}
});

L.terminator = function (options) {
	return new L.Terminator(options);
};