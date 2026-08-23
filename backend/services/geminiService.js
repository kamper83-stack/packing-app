const { GoogleGenerativeAI } = require("@google/generative-ai");

// Mock list generator based on vacation type
function getMockPackingList(vacationType, days, numPeople) {
  const baseItems = [
    { name: "Underwear", category: "Clothing", quantity: days * numPeople, targetBag: "Suitcase" },
    { name: "Socks", category: "Clothing", quantity: days * numPeople, targetBag: "Suitcase" },
    { name: "Shirts", category: "Clothing", quantity: Math.ceil(days * 1.2) * numPeople, targetBag: "Suitcase" },
    { name: "Pants", category: "Clothing", quantity: Math.ceil(days / 2) * numPeople, targetBag: "Suitcase" },
    { name: "Toothbrush", category: "Toiletries", quantity: numPeople, targetBag: "Backpack" },
    { name: "Toothpaste", category: "Toiletries", quantity: 1, targetBag: "Backpack" },
    { name: "Phone Charger", category: "Electronics", quantity: numPeople, targetBag: "Backpack" },
    { name: "Passport", category: "Documents", quantity: numPeople, targetBag: "Backpack" },
    { name: "Flight Tickets", category: "Documents", quantity: numPeople, targetBag: "Backpack" },
  ];

  if (vacationType.toLowerCase().includes("beach")) {
    baseItems.push(
      { name: "Swimsuit", category: "Clothing", quantity: 2 * numPeople, targetBag: "Suitcase" },
      { name: "Sunscreen", category: "Toiletries", quantity: 1, targetBag: "Suitcase" },
      { name: "Sunglasses", category: "Accessories", quantity: numPeople, targetBag: "Backpack" },
      { name: "Beach Towel", category: "Accessories", quantity: numPeople, targetBag: "Suitcase" }
    );
  } else if (vacationType.toLowerCase().includes("winter") || vacationType.toLowerCase().includes("snow")) {
    baseItems.push(
      { name: "Winter Coat", category: "Clothing", quantity: numPeople, targetBag: "Suitcase" },
      { name: "Thermal Underwear", category: "Clothing", quantity: days * numPeople, targetBag: "Suitcase" },
      { name: "Gloves & Beanie", category: "Clothing", quantity: numPeople, targetBag: "Suitcase" },
      { name: "Lip Balm", category: "Toiletries", quantity: numPeople, targetBag: "Backpack" }
    );
  } else if (vacationType.toLowerCase().includes("hike") || vacationType.toLowerCase().includes("active")) {
    baseItems.push(
      { name: "Hiking Boots", category: "Clothing", quantity: numPeople, targetBag: "Suitcase" },
      { name: "Water Bottle", category: "Accessories", quantity: numPeople, targetBag: "Backpack" },
      { name: "First Aid Kit", category: "Safety", quantity: 1, targetBag: "Backpack" },
      { name: "Rain Jacket", category: "Clothing", quantity: numPeople, targetBag: "Suitcase" }
    );
  }

  return baseItems;
}

async function generatePackingList({
  destination,
  days,
  numPeople,
  vacationType,
  airline,
  weatherSummary,
  baggageAllowance,
}) {
  const useMocks = process.env.USE_MOCKS === "true" || !process.env.GEMINI_API_KEY;

  if (useMocks) {
    console.log(`[GEMINI SERVICE] Using mock packing list for ${destination} (${vacationType})`);
    return getMockPackingList(vacationType, days, numPeople);
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });

    const prompt = `
      You are an expert packing assistant. Generate a highly personalized packing checklist for a trip with these details:
      - Destination: ${destination}
      - Duration: ${days} days
      - Number of People: ${numPeople}
      - Vacation Type: ${vacationType}
      - Airline: ${airline}
      - Weather forecast summary: ${JSON.stringify(weatherSummary)}
      - Allowed baggage: ${JSON.stringify(baggageAllowance)}

      Output MUST be a JSON array of objects. Do not include any markdown format tags like \`\`\`json. Only return the raw JSON array.
      Each object must match this schema:
      {
        "name": "Item name (e.g. Shirts, Swimsuit, Charger)",
        "category": "Category of the item (e.g. Clothing, Toiletries, Electronics, Documents, Specialized Gear)",
        "quantity": integer value,
        "targetBag": "Suitcase" or "Backpack"
      }
      
      Optimize the packing list using the weather: if it's rainy, suggest raincoats/umbrellas. If it's cold, suggest warm layers. If it's a beach trip, suggest swimwear. Keep quantities realistic for the number of days (${days}) and people (${numPeople}).
    `;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const text = result.response.text();
    return JSON.parse(text);
  } catch (error) {
    console.error("[GEMINI SERVICE] Error calling Gemini API, falling back to mock:", error.message);
    return getMockPackingList(vacationType, days, numPeople);
  }
}

module.exports = { generatePackingList };
