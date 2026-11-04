// Room layout rules: generate many rooms per map hazard and check that none breaks a rule.
import { generateRoom, WATER, BARREL } from "../web/js/map.js";
import { auditRoom } from "../web/js/roomrules.js";
let bad = 0, rooms = 0, fallbacks = 0;
const stat = {};
for (const [theme, hazard] of [[0, "mud"], [2, "ice"], [3, "lava"], [1, "mud"]])
  for (const kind of ["combat", "boss", "shop"])
    for (let s = 0; s < 1500; s++) {
      const m = generateRoom(kind, s * 7 + 1, theme, { hazard });
      rooms++;
      const v = auditRoom(m);
      if (v.length) { bad++; for (const k of v) stat[k] = (stat[k] || 0) + 1; }
    }
console.log("rooms", rooms, "with violations", bad, JSON.stringify(stat));
process.exit(bad ? 1 : 0);
