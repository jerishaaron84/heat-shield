// ============================================================
// HEATSHIELD V2 — REAL WEATHER DATA SERVICE
// ============================================================
//
// Data:
//   • Open-Meteo Weather API
//   • Open-Meteo Geocoding API
//   • OpenStreetMap Nominatim reverse geocoding fallback
//
// Derived locally (WEATHER READINGS ONLY):
//   • NWS Rothfusz Heat Index  (a temperature-like reading for charts)
//   • Wet-bulb temperature estimate using Stull approximation
//
// RISK IS NOT CALCULATED HERE.
//   Risk score / category / level / factors / explanation come from the
//   Python Heat Risk Engine (Person 2) via POST /api/risk. See
//   src/services/riskApi.js. The former JS heat-category and explanation
//   logic was removed so there is a single source of truth.
//
// ============================================================


const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast'

const GEOCODING_URL =
  'https://geocoding-api.open-meteo.com/v1/search'

const NOMINATIM_REVERSE_URL =
  'https://nominatim.openstreetmap.org/reverse'


// ============================================================
// DEFAULT LOCATION
// ============================================================

export const DEFAULT_LOCATION = {

  id: 'default-chennai',

  name: 'Chennai, Tamil Nadu, India',

  shortName: 'Chennai',

  city: 'Chennai',

  country: 'India',

  latitude: 13.0827,

  longitude: 80.2707,

}


// ============================================================
// SMALL HELPERS
// ============================================================

function round(
  value,
  decimals = 1
) {

  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {

    return null

  }


  const factor =
    10 ** decimals


  return (
    Math.round(
      Number(value) *
      factor
    ) /
    factor
  )

}


function celsiusToFahrenheit(
  celsius
) {

  return (
    Number(celsius) *
    9 /
    5 +
    32
  )

}


function fahrenheitToCelsius(
  fahrenheit
) {

  return (
    (
      Number(fahrenheit) -
      32
    ) *
    5 /
    9
  )

}


// ============================================================
// NWS HEAT INDEX
// ============================================================
//
// Heat Index is normally applicable to warm/humid conditions.
//
// For cooler conditions we return the air temperature rather
// than pretending the Rothfusz equation is meaningful there.
//
// ============================================================

function calculateHeatIndex(
  temperatureC,
  humidity
) {

  const T =
    celsiusToFahrenheit(
      temperatureC
    )

  const RH =
    Number(humidity)


  if (
    !Number.isFinite(T) ||
    !Number.isFinite(RH)
  ) {

    return Number(
      temperatureC
    )

  }


  // ----------------------------------------------------------
  // Initial simple NWS approximation
  // ----------------------------------------------------------

  let simpleHI =

    0.5 *

    (
      T +
      61.0 +
      (
        (
          T -
          68.0
        ) *
        1.2
      ) +
      (
        RH *
        0.094
      )
    )


  simpleHI =
    (
      simpleHI +
      T
    ) /
    2


  // ----------------------------------------------------------
  // If conditions are not hot enough for Rothfusz,
  // use air temperature.
  // ----------------------------------------------------------

  if (
    simpleHI < 80
  ) {

    return round(
      temperatureC,
      1
    )

  }


  // ----------------------------------------------------------
  // Rothfusz regression
  // ----------------------------------------------------------

  let HI =

    -42.379 +

    2.04901523 * T +

    10.14333127 * RH -

    0.22475541 * T * RH -

    0.00683783 * T * T -

    0.05481717 * RH * RH +

    0.00122874 *
      T *
      T *
      RH +

    0.00085282 *
      T *
      RH *
      RH -

    0.00000199 *
      T *
      T *
      RH *
      RH


  // ----------------------------------------------------------
  // Low humidity adjustment
  // ----------------------------------------------------------

  if (
    RH < 13 &&
    T >= 80 &&
    T <= 112
  ) {

    const adjustment =

      (
        (13 - RH) /
        4
      ) *

      Math.sqrt(

        (
          17 -
          Math.abs(
            T -
            95
          )
        ) /
        17

      )


    HI -= adjustment

  }


  // ----------------------------------------------------------
  // High humidity adjustment
  // ----------------------------------------------------------

  if (
    RH > 85 &&
    T >= 80 &&
    T <= 87
  ) {

    const adjustment =

      (
        (RH - 85) /
        10
      ) *

      (
        (87 - T) /
        5
      )


    HI += adjustment

  }


  return round(

    fahrenheitToCelsius(
      HI
    ),

    1

  )

}


// ============================================================
// WET-BULB TEMPERATURE ESTIMATE
// ============================================================
//
// Stull approximation.
//
// This is an ESTIMATE calculated locally from:
//   temperature + relative humidity
//
// It is NOT presented as a direct sensor measurement.
//
// ============================================================

function estimateWetBulb(
  temperature,
  humidity
) {

  const T =
    Number(
      temperature
    )

  const RH =
    Number(
      humidity
    )


  if (
    !Number.isFinite(T) ||
    !Number.isFinite(RH)
  ) {

    return null

  }


  const wetBulb =

    T *
      Math.atan(
        0.151977 *
        Math.sqrt(
          RH +
          8.313659
        )
      ) +

    Math.atan(
      T +
      RH
    ) -

    Math.atan(
      RH -
      1.676331
    ) +

    0.00391838 *
      Math.pow(
        RH,
        1.5
      ) *
      Math.atan(
        0.023101 *
        RH
      ) -

    4.686035


  return round(
    wetBulb,
    1
  )

}


// ============================================================
// UV CATEGORY
// ============================================================

function getUVCategory(
  uv
) {

  const value =
    Number(uv)


  if (
    !Number.isFinite(value)
  ) {

    return 'Unavailable'

  }


  if (
    value < 3
  ) {

    return 'Low'

  }


  if (
    value < 6
  ) {

    return 'Moderate'

  }


  if (
    value < 8
  ) {

    return 'High'

  }


  if (
    value < 11
  ) {

    return 'Very High'

  }


  return 'Extreme'

}


// ============================================================
// SOLAR EXPOSURE LABEL
// ============================================================

function getSolarExposure(
  radiation
) {

  const value =
    Number(
      radiation
    )


  if (
    !Number.isFinite(value)
  ) {

    return 'Unavailable'

  }


  if (
    value < 200
  ) {

    return 'Low'

  }


  if (
    value < 500
  ) {

    return 'Moderate'

  }


  if (
    value < 750
  ) {

    return 'High'

  }


  return 'Very High'

}


// ============================================================
// LOCATION SEARCH
// ============================================================

export async function searchLocations(
  searchText
) {

  const query =
    searchText.trim()


  if (
    query.length < 2
  ) {

    return []

  }


  const url =

    `${GEOCODING_URL}` +

    `?name=${encodeURIComponent(
      query
    )}` +

    `&count=8` +

    `&language=en` +

    `&format=json`


  const response =
    await fetch(url)


  if (
    !response.ok
  ) {

    throw new Error(
      'Location search is temporarily unavailable.'
    )

  }


  const data =
    await response.json()


  if (
    !Array.isArray(
      data.results
    )
  ) {

    return []

  }


  return data.results.map(
    (place) => {

      const pieces = [

        place.name,

        place.admin1,

        place.country,

      ].filter(Boolean)


      const uniquePieces =
        [
          ...new Set(
            pieces
          ),
        ]


      return {

        id:
          place.id ||
          `${place.latitude}-${place.longitude}`,

        name:
          uniquePieces.join(
            ', '
          ),

        shortName:
          place.name ||
          'Selected place',

        city:
          place.name ||
          'Selected place',

        country:
          place.country ||
          '',

        admin1:
          place.admin1 ||
          '',

        latitude:
          Number(
            place.latitude
          ),

        longitude:
          Number(
            place.longitude
          ),

      }

    }
  )

}


// ============================================================
// REVERSE GEOCODING
// ============================================================
//
// Used when:
//   • user clicks map
//   • user chooses "Use my location"
//
// ============================================================

export async function reverseGeocode(
  latitude,
  longitude
) {

  const lat =
    Number(latitude)

  const lon =
    Number(longitude)


  const coordinateFallback = {

    id:
      `coord-${lat}-${lon}`,

    name:
      `${lat.toFixed(4)}, ${lon.toFixed(4)}`,

    shortName:
      'Selected location',

    city:
      'Selected location',

    country:
      '',

    latitude:
      lat,

    longitude:
      lon,

  }


  try {

    const url =

      `${NOMINATIM_REVERSE_URL}` +

      `?format=jsonv2` +

      `&lat=${encodeURIComponent(
        lat
      )}` +

      `&lon=${encodeURIComponent(
        lon
      )}` +

      `&zoom=18` +

      `&addressdetails=1`


    const response =
      await fetch(
        url,
        {
          headers: {
            Accept:
              'application/json',
          },
        }
      )


    if (
      !response.ok
    ) {

      return coordinateFallback

    }


    const data =
      await response.json()


    const address =
      data.address ||
      {}


    const city =

      address.city ||

      address.town ||

      address.village ||

      address.municipality ||

      address.county ||

      address.state_district ||

      'Selected location'


    const localName =

      address.suburb ||

      address.neighbourhood ||

      address.quarter ||

      address.road ||

      city


    const state =
      address.state ||
      ''


    const country =
      address.country ||
      ''


    const pieces = [

      localName,

      city !== localName
        ? city
        : null,

      state,

      country,

    ].filter(Boolean)


    const uniquePieces =
      [
        ...new Set(
          pieces
        ),
      ]


    return {

      id:
        data.place_id ||
        `coord-${lat}-${lon}`,

      name:
        data.display_name ||
        uniquePieces.join(
          ', '
        ),

      shortName:
        localName,

      city,

      country,

      state,

      latitude:
        lat,

      longitude:
        lon,

    }


  } catch (
    error
  ) {

    console.warn(
      'Reverse geocoding fallback:',
      error
    )


    return coordinateFallback

  }

}


// ============================================================
// LOCATION NORMALIZER
// ============================================================

function normalizeLocation(
  location
) {

  const latitude =
    Number(

      location?.latitude ??

      location?.lat ??

      DEFAULT_LOCATION.latitude

    )


  const longitude =
    Number(

      location?.longitude ??

      location?.lon ??

      DEFAULT_LOCATION.longitude

    )


  return {

    ...DEFAULT_LOCATION,

    ...location,

    latitude,

    longitude,

  }

}


// ============================================================
// BUILD WEATHER URL
// ============================================================

function buildWeatherUrl(
  location
) {

  const params =
    new URLSearchParams()


  params.set(
    'latitude',
    location.latitude
  )


  params.set(
    'longitude',
    location.longitude
  )


  params.set(

    'current',

    [

      'temperature_2m',

      'relative_humidity_2m',

      'apparent_temperature',

      'is_day',

      'weather_code',

      'cloud_cover',

      'surface_pressure',

      'wind_speed_10m',

      'wind_direction_10m',

      'wind_gusts_10m',

      'shortwave_radiation',

    ].join(',')

  )


  params.set(

    'hourly',

    [

      'temperature_2m',

      'relative_humidity_2m',

      'dew_point_2m',

      'apparent_temperature',

      'wind_speed_10m',

      'wind_gusts_10m',

      'shortwave_radiation',

    ].join(',')

  )


  params.set(

    'daily',

    [

      'uv_index_max',

      'temperature_2m_max',

      'temperature_2m_min',

      'apparent_temperature_max',

      'apparent_temperature_min',

    ].join(',')

  )


  params.set(
    'temperature_unit',
    'celsius'
  )


  params.set(
    'wind_speed_unit',
    'kmh'
  )


  params.set(
    'forecast_days',
    '2'
  )


  params.set(
    'timezone',
    'auto'
  )


  return (
    `${WEATHER_URL}?${params.toString()}`
  )

}


// ============================================================
// FIND CURRENT HOURLY INDEX
// ============================================================

function findCurrentHourlyIndex(
  hourlyTimes,
  currentTime
) {

  if (
    !Array.isArray(
      hourlyTimes
    ) ||
    hourlyTimes.length === 0
  ) {

    return 0

  }


  const current =
    new Date(
      currentTime
    ).getTime()


  if (
    !Number.isFinite(current)
  ) {

    return 0

  }


  let bestIndex = 0
  let bestDifference =
    Infinity


  hourlyTimes.forEach(
    (
      time,
      index
    ) => {

      const timestamp =
        new Date(
          time
        ).getTime()


      const difference =
        Math.abs(
          timestamp -
          current
        )


      if (
        difference <
        bestDifference
      ) {

        bestDifference =
          difference

        bestIndex =
          index

      }

    }
  )


  return bestIndex

}


// ============================================================
// FORMAT HOURLY TIME
// ============================================================

function formatHour(
  isoTime
) {

  if (
    !isoTime
  ) {

    return '—'

  }


  const date =
    new Date(
      isoTime
    )


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return '—'

  }


  return date.toLocaleTimeString(
    [],
    {
      hour:
        'numeric',
    }
  )

}


// ============================================================
// BUILD FORECAST TREND
// ============================================================
//
// 12 samples, every 2 hours
// ≈ 22 hours forward from current hourly index.
//
// ============================================================

function buildTrend(
  hourly,
  startIndex
) {

  const trend = []


  if (
    !hourly ||
    !Array.isArray(
      hourly.time
    )
  ) {

    return trend

  }


  for (
    let step = 0;
    step < 12;
    step += 1
  ) {

    const index =
      startIndex +
      step * 2


    if (
      index >=
      hourly.time.length
    ) {

      break

    }


    const temperature =
      Number(
        hourly.temperature_2m?.[
          index
        ]
      )


    const humidity =
      Number(
        hourly.relative_humidity_2m?.[
          index
        ]
      )


    if (
      !Number.isFinite(
        temperature
      ) ||
      !Number.isFinite(
        humidity
      )
    ) {

      continue

    }


    const heatIndex =
      calculateHeatIndex(
        temperature,
        humidity
      )



    trend.push({

      time:
        formatHour(
          hourly.time[index]
        ),

      isoTime:
        hourly.time[index],

      temperature:
        round(
          temperature,
          1
        ),

      humidity:
        round(
          humidity,
          0
        ),

      heatIndex,

      apparentTemperature:
        round(
          hourly.apparent_temperature?.[
            index
          ],
          1
        ),

      dewPoint:
        round(
          hourly.dew_point_2m?.[
            index
          ],
          1
        ),

      wind:
        round(
          hourly.wind_speed_10m?.[
            index
          ],
          1
        ),

      windGust:
        round(
          hourly.wind_gusts_10m?.[
            index
          ],
          1
        ),

      radiation:
        round(
          hourly.shortwave_radiation?.[
            index
          ],
          0
        ),

    })

  }


  return trend

}


// ============================================================
// MAIN WEATHER FUNCTION
// ============================================================

export async function getLiveWeather(
  inputLocation =
    DEFAULT_LOCATION
) {

  const location =
    normalizeLocation(
      inputLocation
    )


  const url =
    buildWeatherUrl(
      location
    )


  const response =
    await fetch(url)


  if (
    !response.ok
  ) {

    throw new Error(
      'Live weather data is temporarily unavailable.'
    )

  }


  const data =
    await response.json()


  if (
    !data.current
  ) {

    throw new Error(
      'The weather service returned no current conditions.'
    )

  }


  const current =
    data.current


  const hourly =
    data.hourly ||
    {}


  const daily =
    data.daily ||
    {}


  // ----------------------------------------------------------
  // Current API values
  // ----------------------------------------------------------

  const temperature =
    round(
      current.temperature_2m,
      1
    )


  const humidity =
    round(
      current.relative_humidity_2m,
      0
    )


  const apparentTemperature =
    round(
      current.apparent_temperature,
      1
    )


  const wind =
    round(
      current.wind_speed_10m,
      1
    )


  const windGust =
    round(
      current.wind_gusts_10m,
      1
    )


  const windDirection =
    round(
      current.wind_direction_10m,
      0
    )


  const radiation =
    round(
      current.shortwave_radiation,
      0
    )


  const cloudCover =
    round(
      current.cloud_cover,
      0
    )


  const surfacePressure =
    round(
      current.surface_pressure,
      0
    )


  // ----------------------------------------------------------
  // Derived Heat Index
  // ----------------------------------------------------------

  const heatIndex =
    calculateHeatIndex(
      temperature,
      humidity
    )


  // ----------------------------------------------------------
  // Current hourly index
  // ----------------------------------------------------------

  const currentHourlyIndex =
    findCurrentHourlyIndex(

      hourly.time,

      current.time

    )


  // ----------------------------------------------------------
  // Dew point from hourly data
  // ----------------------------------------------------------

  const dewPoint =
    round(

      hourly.dew_point_2m?.[
        currentHourlyIndex
      ],

      1

    )


  // ----------------------------------------------------------
  // Wet-bulb estimate
  // ----------------------------------------------------------

  const wetBulb =
    estimateWetBulb(
      temperature,
      humidity
    )


  // ----------------------------------------------------------
  // UV
  // ----------------------------------------------------------

  const uvIndex =
    round(
      daily.uv_index_max?.[
        0
      ],
      1
    )


  const uvCategory =
    getUVCategory(
      uvIndex
    )


  // ----------------------------------------------------------
  // Forecast trend
  // ----------------------------------------------------------

  const trend =
    buildTrend(

      hourly,

      currentHourlyIndex

    )


  // ----------------------------------------------------------
  // Daily values
  // ----------------------------------------------------------

  const dailyMaximum =
    round(
      daily.temperature_2m_max?.[
        0
      ],
      1
    )


  const dailyMinimum =
    round(
      daily.temperature_2m_min?.[
        0
      ],
      1
    )


  const dailyApparentMaximum =
    round(
      daily.apparent_temperature_max?.[
        0
      ],
      1
    )


  const dailyApparentMinimum =
    round(
      daily.apparent_temperature_min?.[
        0
      ],
      1
    )


  // ----------------------------------------------------------
  // FINAL OBJECT USED BY APP.JSX
  // ----------------------------------------------------------

  return {

    // Location
    id:
      location.id,

    name:
      location.name ||
      location.shortName ||
      'Selected location',

    shortName:
      location.shortName ||
      location.city ||
      location.name ||
      'Selected location',

    city:
      location.city ||
      location.shortName ||
      'Selected location',

    country:
      location.country ||
      '',

    latitude:
      Number(
        data.latitude ??
        location.latitude
      ),

    longitude:
      Number(
        data.longitude ??
        location.longitude
      ),

    timezone:
      data.timezone ||
      '',


    // Current weather
    temperature,

    humidity,

    apparentTemperature,

    dewPoint,

    wetBulb,

    wind,

    windGust,

    windDirection,

    radiation,

    solar:
      getSolarExposure(
        radiation
      ),

    cloudCover,

    surfacePressure,

    isDay:
      Number(
        current.is_day
      ) === 1,

    weatherCode:
      Number(
        current.weather_code
      ),


    // UV
    uvIndex,

    uvCategory,


    // Heat Index
    heatIndex,


    // Daily
    dailyMaximum,

    dailyMinimum,

    dailyApparentMaximum,

    dailyApparentMinimum,


    // Forecast
    trend,


    // Timestamps
    weatherTime:
      current.time,

    updatedAt:
      new Date().toLocaleString(),

  }

}