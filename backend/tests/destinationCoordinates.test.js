const destinationSource = require("../scripts/tlv-destinations-source.json").destinations;
const coordinates = require("../config/destinationCoordinates.json").destinations;

test("every approved destination has valid coordinates for Google Weather", () => {
  expect(Object.keys(coordinates)).toHaveLength(destinationSource.length);

  for (const destination of destinationSource) {
    const location = coordinates[destination.city];
    expect(location).toBeDefined();
    expect(location.country).toBe(destination.country);
    expect(location.latitude).toBeGreaterThanOrEqual(-90);
    expect(location.latitude).toBeLessThanOrEqual(90);
    expect(location.longitude).toBeGreaterThanOrEqual(-180);
    expect(location.longitude).toBeLessThanOrEqual(180);
  }
});
