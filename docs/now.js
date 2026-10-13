// Live hero: the current wind at a famous spot, from Open-Meteo, in the app's colours.
(function () {
    "use strict";

    var SPOTS = {
        tarifa:   { name: "Tarifa",    lat: 36.0137,  lon: -5.6049 },
        dakhla:   { name: "Dakhla",    lat: 23.92,    lon: -15.77 },
        maui:     { name: "Maui",      lat: 20.896,   lon: -156.434 },
        capetown: { name: "Cape Town", lat: -33.80,   lon: 18.46 },
        leucate:  { name: "Leucate",   lat: 42.91,    lon: 3.05 }
    };

    // Same buckets as ForecastTablePresenter.windBucketsInKnots in the app.
    var BUCKETS = [[6, "calm"], [11, "light"], [16, "moderate"], [21, "fresh"], [26, "strong"], [33, "veryStrong"]];
    var COMPASS = ["north", "north-northeast", "northeast", "east-northeast", "east", "east-southeast", "southeast",
        "south-southeast", "south", "south-southwest", "southwest", "west-southwest", "west", "west-northwest",
        "northwest", "north-northwest"];
    var HOUR_STEP = 2;
    var STRIP_HOURS = 48;

    var section = document.getElementById("now");
    var knotsEl = document.getElementById("knots");
    var arrowEl = document.getElementById("arrow");
    var detailEl = document.getElementById("detail");
    var outlookEl = document.getElementById("outlook");
    var stripEl = document.getElementById("strip");
    var buttons = document.querySelectorAll(".spot-picker button");
    var requestId = 0;

    function intensity(knots) {
        for (var i = 0; i < BUCKETS.length; i++) {
            if (knots < BUCKETS[i][0]) return BUCKETS[i][1];
        }
        return "extreme";
    }

    function compass(degrees) {
        return COMPASS[Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16];
    }

    // Meteorological direction is where the wind comes from; the arrow points where it goes.
    function arrowTransform(degrees) {
        return "rotate(" + Math.round(degrees + 180) + "deg)";
    }

    function hourLabel(isoLocal) {
        return isoLocal.slice(11, 13);
    }

    function dayLabel(isoLocal) {
        var d = new Date(isoLocal.slice(0, 10) + "T12:00:00");
        return d.toLocaleDateString("en", { weekday: "short" });
    }

    function whenLabel(isoLocal, todayIso) {
        var day = isoLocal.slice(0, 10);
        var time = isoLocal.slice(11, 16);
        if (day === todayIso) return "today at " + time;
        var tomorrow = new Date(todayIso + "T12:00:00");
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (day === tomorrow.toISOString().slice(0, 10)) return "tomorrow at " + time;
        return dayLabel(isoLocal) + " at " + time;
    }

    function render(name, data) {
        var cur = data.current;
        var kt = Math.round(cur.wind_speed_10m);
        var gust = Math.round(cur.wind_gusts_10m);

        section.setAttribute("data-intensity", intensity(kt));
        knotsEl.textContent = kt;
        arrowEl.style.transform = arrowTransform(cur.wind_direction_10m);
        detailEl.textContent = "Gusts " + gust + " kt, from the " + compass(cur.wind_direction_10m) + ".";
        document.title = name + ": " + kt + " kt right now — WindSpots";

        // Next hours from now, every HOUR_STEP hours.
        var h = data.hourly;
        var nowIso = cur.time;
        var start = 0;
        while (start < h.time.length && h.time[start] < nowIso.slice(0, 13)) start++;

        var peak = { kt: -1, time: null };
        var lastDay = null;
        stripEl.textContent = "";
        for (var i = start; i < Math.min(h.time.length, start + STRIP_HOURS); i += HOUR_STEP) {
            var w = Math.round(h.wind_speed_10m[i]);
            var g = Math.round(h.wind_gusts_10m[i]);
            var dir = h.wind_direction_10m[i];
            if (w > peak.kt) { peak = { kt: w, time: h.time[i] }; }

            var day = h.time[i].slice(0, 10);
            var li = document.createElement("li");
            li.setAttribute("data-intensity", intensity(w));
            li.setAttribute("aria-label", hourLabel(h.time[i]) + ":00, " + w + " knots, gusts " + g + ", from the " + compass(dir));
            li.innerHTML =
                '<span class="d">' + (day !== lastDay ? dayLabel(h.time[i]) : "") + "</span>" +
                '<span class="h">' + hourLabel(h.time[i]) + "</span>" +
                '<span class="w">' + w + "</span>" +
                '<span class="g">' + g + "</span>" +
                '<span class="a" aria-hidden="true" style="transform:' + arrowTransform(dir) + '">↑</span>';
            stripEl.appendChild(li);
            lastDay = day;
        }

        if (peak.time && peak.kt > kt) {
            outlookEl.textContent = "Picks up to " + peak.kt + " kt " + whenLabel(peak.time, nowIso.slice(0, 10)) + ".";
        } else {
            outlookEl.textContent = "Easing off over the next two days.";
        }
    }

    function load(name, lat, lon) {
        var id = ++requestId;
        var url = "https://api.open-meteo.com/v1/forecast" +
            "?latitude=" + lat + "&longitude=" + lon +
            "&current=wind_speed_10m,wind_gusts_10m,wind_direction_10m" +
            "&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m" +
            "&wind_speed_unit=kn&timezone=auto&forecast_days=3";

        fetch(url)
            .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(function (data) { if (id === requestId) render(name, data); })
            .catch(function () {
                if (id !== requestId) return;
                detailEl.textContent = "Couldn't load the live forecast right now.";
                outlookEl.textContent = "";
            });
    }

    function select(button) {
        buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b === button)); });
        var key = button.getAttribute("data-spot");

        if (key === "here") {
            if (!navigator.geolocation) return;
            detailEl.textContent = "Finding you…";
            navigator.geolocation.getCurrentPosition(function (pos) {
                load("your spot", pos.coords.latitude.toFixed(3), pos.coords.longitude.toFixed(3));
            }, function () {
                detailEl.textContent = "Location not available. Pick a spot above.";
            }, { maximumAge: 600000, timeout: 10000 });
            return;
        }

        var spot = SPOTS[key];
        load(spot.name, spot.lat, spot.lon);
    }

    buttons.forEach(function (b) {
        b.addEventListener("click", function () { select(b); });
    });

    select(buttons[0]);
})();
