// End-to-end API checks, run inside the frontend container so requests go
// Next.js -> FastAPI -> (Rust worker) -> Postgres exactly as in production.
// Identity headers stand in for oauth2-proxy, which can't do a real login in CI.

const BASE = "http://127.0.0.1:3000/api";
const alice = { "x-forwarded-email": "alice@ci.local" };
const bob = { "x-forwarded-email": "bob@ci.local" };

async function call(method, path, headers = {}, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

let failed = false;
function check(condition, message, detail) {
  console.log(`${condition ? "ok  " : "FAIL"} - ${message}`);
  if (!condition) {
    failed = true;
    if (detail !== undefined) console.log("       got:", JSON.stringify(detail));
  }
}

const created = await call("POST", "/todos", alice, { title: "smoke test todo" });
check(created.status === 201, "create todo (FastAPI) -> 201", created);
const id = created.json?.id;

const list = await call("GET", "/todos", alice);
check(list.json?.some((t) => t.id === id), "todo appears in owner's list", list);

const other = await call("GET", "/todos", bob);
check(!other.json?.some((t) => t.id === id), "todo hidden from other users", other);

const done = await call("PATCH", `/todos/${id}`, alice, { done: true });
check(done.json?.done === true, "complete todo (FastAPI) -> done=true", done);

const bobDelete = await call("DELETE", `/todos/${id}`, bob);
check(bobDelete.status === 404, "other user cannot delete (Rust) -> 404", bobDelete);

const del = await call("DELETE", `/todos/${id}`, alice);
check(del.status === 204, "owner deletes todo (Rust) -> 204", del);

const again = await call("DELETE", `/todos/${id}`, alice);
check(again.status === 404, "deleting again -> 404", again);

const hello = await call("GET", "/hello", alice);
check(hello.json?.message === "hello world from Rust", "hello from Rust worker", hello);

const anon = await call("GET", "/todos");
check(anon.status === 401, "no identity -> 401", anon);

if (failed) {
  console.log("\nSmoke test FAILED");
  process.exit(1);
}
console.log("\nSmoke test passed");
