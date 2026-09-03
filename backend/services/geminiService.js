const { GoogleGenerativeAI } = require("@google/generative-ai");

// The only bags the app knows how to place items into.
const SUPPORTED_TARGET_BAGS = ["Suitcase", "Backpack"];

// Validate a model-generated packing list before it is persisted (Issue #34).
// The Gemini output is untrusted: it may not be an array, may miss required
// fields, or carry nonsense quantities/bags. Returns the array unchanged when
// every item is valid; throws a descriptive Error otherwise so the caller can
// route invalid output through the same fallback as a failed API call.
function validatePackingItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("packing list must be a non-empty array");
  }

  items.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`item ${index} is not an object`);
    }
    if (typeof item.name !== "string" || item.name.trim() === "") {
      throw new Error(`item ${index} has an invalid name`);
    }
    if (typeof item.category !== "string" || item.category.trim() === "") {
      throw new Error(`item ${index} has an invalid category`);
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error(`item ${index} has a non-positive or non-integer quantity`);
    }
    if (!SUPPORTED_TARGET_BAGS.includes(item.targetBag)) {
      throw new Error(`item ${index} has an unsupported targetBag`);
    }
  });

  return items;
}

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
  passengerComposition,
  vacationType,
  airline,
  weatherSummary,
  baggageAllowance,
}) {
  // Describe the traveler mix in one line for prompt/mock use.
  const travelersLine = passengerComposition
    ? `Traveler Mix: ${JSON.stringify(passengerComposition)}`
    : `Number of People: ${numPeople}`;

  const useMocks = process.env.USE_MOCKS === "true" || !process.env.GEMINI_API_KEY;

  if (useMocks) {
    console.log(`[GEMINI SERVICE] Using mock packing list for ${destination} (${vacationType})`);
    return {
      items: getMockPackingList(vacationType, days, numPeople),
      isMock: true,
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const modelName = process.env.GEMINI_MODEL || "gemini-3.5-flash";
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
      You are an expert packing assistant. Generate a highly personalized packing checklist for a trip with these details:
      - Destination: ${destination}
      - Duration: ${days} days
      - ${travelersLine}
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
    // Parse and validate before returning: invalid model output must not reach
    // persistence. On failure we throw, which the catch below turns into the
    // agreed mock fallback (same contract as a failed API call).
    const parsed = JSON.parse(text);
    const validatedItems = validatePackingItems(parsed);
    return {
      items: validatedItems,
      isMock: false,
    };
  } catch (error) {
    console.error(
      "[GEMINI SERVICE] Invalid or failed live generation, falling back to mock:",
      error.message
    );
    return {
      items: getMockPackingList(vacationType, days, numPeople),
      isMock: true,
      error: error.message,
    };
  }
}

module.exports = { generatePackingList, validatePackingItems };
