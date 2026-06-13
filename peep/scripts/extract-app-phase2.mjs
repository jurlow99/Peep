import fs from "fs";
import path from "path";

const lines = fs.readFileSync("src/App.jsx", "utf8").split("\n");

function extract(start, end, file, header, footer = "") {
  const chunk = lines.slice(start - 1, end).join("\n");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, header + chunk + footer);
  console.log("Wrote", file);
}

extract(
  459,
  571,
  "src/components/browse/NotifBell.jsx",
  `import { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase";

`
);

extract(
  1200,
  1903,
  "src/components/browse/BrowseWidgets.jsx",
  `import { useState, useMemo } from "react";
import { PAD, CARD_W } from "../../lib/theme";
import { useIsMobile } from "../../hooks/useIsMobile";

`
);

extract(
  1904,
  2090,
  "src/lib/playerUtils.js",
  ""
);

extract(
  3098,
  3144,
  "src/lib/recommendations.js",
  ""
);

extract(
  4149,
  4287,
  "src/pages/settingsHelpers.jsx",
  `import { useState } from "react";
import { supabase } from "../supabase";
import { captureError } from "../lib/observability";

`
);

extract(
  4676,
  4732,
  "src/components/browse/Footer.jsx",
  `import { PAD } from "../../lib/theme";

`
);

extract(
  4876,
  4883,
  "src/components/ui/Spinner.jsx",
  `export `
);
