import { POST } from "../../src/app/api/themes/market-active/route";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  PASS ${msg}`);
  } else {
    failed++;
    console.error(`  FAIL ${msg}`);
  }
}

async function run() {
  console.log("-- Themes Market Active Route Contract Tests --\n");

  const unauthReq = new Request("http://localhost/api/themes/market-active", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme_id: "abc", active: true }),
  });

  const unauthRes = await POST(unauthReq);
  const unauthBody = await unauthRes.json();

  assert(unauthRes.status === 401, "missing auth returns 401");
  assert(unauthBody?.error === "Unauthorized", "missing auth returns Unauthorized error");

  const blankAuthReq = new Request("http://localhost/api/themes/market-active", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer ",
    },
    body: JSON.stringify({ theme_id: "abc", active: false }),
  });

  const blankAuthRes = await POST(blankAuthReq);
  const blankAuthBody = await blankAuthRes.json();

  assert(blankAuthRes.status === 401, "blank bearer token returns 401");
  assert(blankAuthBody?.error === "Unauthorized", "blank bearer returns Unauthorized error");

  console.log(`\n-- Results: ${passed} passed, ${failed} failed --`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
