/**
 * A destination photo behind every trip. Curated Unsplash photo ids (permanent URLs, no API key),
 * ported from the spring app's Dashboard.tsx; Chamonix, Andorra and an Alps fallback are new
 * for the ski trip.
 */
const u = (id: string, w = 1920) => `https://images.unsplash.com/photo-${id}?w=${w}&q=70&auto=format&fit=crop`;

const DESTINATIONS: [string, string][] = [
  ["chamonix", "1531366936337-7c912a4589a7"],
  ["andorra", "1605540436563-5bca919ae766"],
  ["alps", "1531366936337-7c912a4589a7"],
  ["ski", "1551524559-8af4e6624178"],
  ["cancun", "1510414842594-a61c69b5ae57"],
  ["hawaii", "1507876466758-bc54f384809c"],
  ["bali", "1537996194471-e657df975ab4"],
  ["maldives", "1514282401047-d79a71a590e8"],
  ["banff", "1503614472-8c93d56e92ce"],
  ["switzerland", "1531366936337-7c912a4589a7"],
  ["colorado", "1464822759023-fed622ff2c3b"],
  ["denver", "1546156929-a4c0ac411f47"],
  ["paris", "1502602898657-3e91760cbb34"],
  ["rome", "1552832230-c0197dd311b5"],
  ["florence", "1543429258-0f2b960ebaca"],
  ["venice", "1514890547357-a9ee288728e0"],
  ["amalfi", "1534113414509-0eec2bfb493f"],
  ["barcelona", "1583422409516-2895a77efded"],
  ["madrid", "1539037116277-4db20889f2d4"],
  ["london", "1513635269975-59663e0ac1ad"],
  ["edinburgh", "1506377585622-bedcbb027afc"],
  ["amsterdam", "1534351590666-13e3e96b5017"],
  ["santorini", "1570077188670-e3a8d69ac5ff"],
  ["athens", "1555993539-1732b0258235"],
  ["lisbon", "1585208798174-6cedd86e019a"],
  ["berlin", "1560969184-10fe8719e047"],
  ["munich", "1595867818082-083862f3d630"],
  ["dubai", "1512453979798-5ea266f8880c"],
  ["istanbul", "1524231757912-21f4fe3a7200"],
  ["tokyo", "1540959733332-eab4deabeeaf"],
  ["kyoto", "1493976040374-85c8e12f0c0e"],
  ["bangkok", "1508009603885-50cf7c579365"],
  ["singapore", "1525625293386-3f8f99389edd"],
  ["seoul", "1534274988757-a28bf1a57c17"],
  ["new york", "1496442226666-8d4d0e62e6e9"],
  ["los angeles", "1534190760961-74e8c1c5c3da"],
  ["san francisco", "1501594907352-04cda38ebc29"],
  ["miami", "1514214246283-d427a95c5d2f"],
  ["chicago", "1494522855154-9297ac14b55f"],
  ["mexico", "1518638150340-f706e86654de"],
  ["sydney", "1506973035872-a4ec16b8e8d9"],
  ["japan", "1528164344705-47542687000d"],
  ["italy", "1534113414509-0eec2bfb493f"],
  ["spain", "1543783207-ec64e4d95325"],
  ["france", "1499856871958-5b9627545d1a"],
  ["greece", "1570077188670-e3a8d69ac5ff"],
];

const FALLBACKS = ["1476514525535-07fb3b4ae5f1", "1507525428034-b723cf961d3e", "1469854523086-cc02fe5d8800"];

/** Golden-hour beach behind the landing page (spring LandingHub.tsx). */
export const LANDING_PHOTO = u("1507525428034-b723cf961d3e");

/** Picks a photo for a trip from its stop names and title; same input, same photo. */
export function photoFor(text: string, width = 1920): string {
  const lower = text.toLowerCase();
  for (const [key, id] of DESTINATIONS) {
    if (lower.includes(key)) return u(id, width);
  }
  const hash = lower.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return u(FALLBACKS[hash % FALLBACKS.length], width);
}
