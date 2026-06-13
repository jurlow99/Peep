import fs from "fs";

const lines = fs.readFileSync("src/App.jsx", "utf8").split("\n");

// Ranges to remove (1-indexed, inclusive) — extracted to separate modules
const removeRanges = [
  [32, 40],       // useIsMobile → hooks/useIsMobile.ts
  [459, 571],     // NotifBell
  [574, 1198],    // Homepage
  [1200, 1903],   // Browse widgets
  [1904, 2090],   // playerUtils
  [2091, 3097],   // PlayerView
  [3098, 3144],   // recommendations
  [4145, 4287],   // settings helpers (includes PREF constants)
  [4288, 4675],   // SettingsPage
  [4676, 4732],   // Footer
  [4733, 4891],   // Auth gates + Spinner
];

const removeSet = new Set();
for (const [a, b] of removeRanges) {
  for (let i = a; i <= b; i++) removeSet.add(i);
}

const kept = lines.filter((_, idx) => !removeSet.has(idx + 1));

const newImports = `import { useState, useEffect, useRef, useMemo, Component } from "react";
import Hls from "hls.js";
import { supabase } from "./supabase";
import { AuthModal } from "./components/AuthModal";
import { LandingPage } from "./pages/LandingPage";
import { PaywallPage } from "./pages/PaywallPage";
import { ProfileScreen } from "./components/ProfileScreen";
import { ProfileSelect } from "./components/ProfileSelect";
import { CreatorDashboard } from "./pages/CreatorDashboard";
import { LiveTVPage } from "./pages/LiveTV";
import { Homepage } from "./components/browse/Homepage";
import { PlayerView } from "./components/player/PlayerView";
import { SettingsPage } from "./pages/SettingsPage";
import { PasswordResetPage, EmailVerificationGate } from "./components/auth/AuthGates";
import { useAuth } from "./hooks/useAuth";
import { useSubscription, hasActiveSubscription } from "./hooks/useSubscription";
import { useMyList } from "./hooks/useMyList";
import { isOwnerEmail } from "./lib/auth";
import { PAD, CARD_W, SAFE_TOP } from "./lib/theme";
import { useAppNavigation } from "./app/useAppNavigation";
`;

// Replace first import block
let start = 0;
while (start < kept.length && !kept[start].startsWith("import ")) start++;
let end = start;
while (end < kept.length && (kept[end].startsWith("import ") || kept[end].trim() === "")) end++;

const body = kept.slice(end);
const out = newImports + "\n" + body.join("\n");
fs.writeFileSync("src/App.jsx", out);
console.log("Patched App.jsx — removed", removeSet.size, "lines, new length", out.split("\n").length);
