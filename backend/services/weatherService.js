const axios = require("axios");

async function getForecast(destination, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  const days = Math.min(Math.max(diffDays, 1), 14); // WeatherAPI supports up to 14 days

  const useMocks = process.env.USE_MOCKS === "true" || !process.env.WEATHER_API_KEY;

  if (useMocks) {
    console.log(`[WEATHER SERVICE] Using mock weather for ${destination}`);
    // Mock weather payload
    return {
      forecast: Array.from({ length: days }).map((_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return {
          date: date.toISOString().split("T")[0],
          tempC: 22 + Math.floor(Math.random() * 6) - 3, // Random temp between 19 and 25
          condition: index % 3 === 0 ? "Sunny" : index % 3 === 1 ? "Partly Cloudy" : "Rainy",
        };
      }),
      isMock: true,
    };
  }

  try {
    const apiKey = process.env.WEATHER_API_KEY;
    const response = await axios.get(`http://api.weatherapi.com/v1/forecast.json`, {
      params: {
        key: apiKey,
        q: destination,
        days: days,
      },
    });

    const forecastDays = response.data.forecast.forecastday;
    return {
      forecast: forecastDays.map((day) => ({
        date: day.date,
        tempC: day.day.avgtemp_c,
        condition: day.day.condition.text,
      })),
      isMock: false,
    };
  } catch (error) {
    console.error("[WEATHER SERVICE] Error fetching real weather, falling back to mock:", error.message);
    return {
      forecast: Array.from({ length: days }).map((_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return {
          date: date.toISOString().split("T")[0],
          tempC: 20,
          condition: "Mild",
        };
      }),
      isMock: true,
      error: error.message,
    };
  }
}

module.exports = { getForecast };
