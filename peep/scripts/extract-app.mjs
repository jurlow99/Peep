import fs from "fs";
import path from "path";

const lines = fs.readFileSync("src/App.jsx", "utf8").split("\n");

function extract(start, end, file, header, footer = "") {
  const chunk = lines.slice(start - 1, end).join("\n");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, header + chunk + footer);
  console.log("Wrote", file, end - start + 1, "lines");
}

extract(
  574,
  1198,
  "src/components/browse/Homepage.jsx",
  `import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../../supabase";
import { PAD, CARD_W, SAFE_TOP } from "../../lib/theme";
import { useIsMobile } from "../../hooks/useIsMobile";
import { contentSelect } from "../../lib/contentQueries";

export function Homepage`
);

extract(
  4288,
  4675,
  "src/pages/SettingsPage.jsx",
  `import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { PAD } from "../lib/theme";
import { captureError } from "../lib/observability";

export `
);

extract(
  2091,
  3097,
  "src/components/player/PlayerView.jsx",
  `import { useState, useEffect, useRef, useMemo } from "react";
import Hls from "hls.js";
import { supabase } from "../../supabase";
import { PAD, SAFE_TOP } from "../../lib/theme";
import { contentSelect } from "../../lib/contentQueries";

export function PlayerView`
);

extract(
  4733,
  4891,
  "src/components/auth/AuthGates.jsx",
  `import { useState } from "react";
import { supabase } from "../../supabase";

export `
);
