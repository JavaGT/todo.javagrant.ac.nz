"use strict";

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

const SERVER = path.join(__dirname, "..", "server.js");

// Each test file run uses a single throwaway DB + port so tests are isolated.
const DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "todo-test-"));
const DB_PATH = path.join(DB_DIR, "test.db");
const PORT =
  18090 + (process.env.JEST_WORKER_ID ? Number(process.env.JEST_WORKER_ID) : 0);
const BASE = `http://127.0.0.1:${PORT}`;

let child;

function request(method, pathname, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      `${BASE}${pathname}`,
      {
        method,
        headers: Object.assign(
          data
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data),
              }
            : {},
          headers,
        ),
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          let json = null;
          try {
            json = buf ? JSON.parse(buf) : null;
          } catch {}
          resolve({ status: res.statusCode, body: json, raw: buf });
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// All mutation requests must carry the CSRF header the server requires.
const MUT = { "x-requested-with": "fetch" };

before(async () => {
  await new Promise((resolve, reject) => {
    child = spawn(process.execPath, [SERVER], {
      env: { ...process.env, TODO_PORT: String(PORT), TODO_DB: DB_PATH },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (out += c));
    const timer = setTimeout(
      () => reject(new Error("server failed to start: " + out)),
      8000,
    );
    child.stdout.on("data", () => {
      if (out.includes("todo server listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
});

after(async () => {
  if (child) {
    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  }
  fs.rmSync(DB_DIR, { recursive: true, force: true });
});

describe("static + routing", () => {
  test("GET / serves index.html", async () => {
    const r = await request("GET", "/");
    assert.equal(r.status, 200);
    assert.match(r.raw, /<html/i);
  });

  test("unknown route returns 404 JSON", async () => {
    const r = await request("GET", "/api/nope");
    assert.equal(r.status, 404);
    assert.equal(r.body.error, "not found");
  });
});

describe("todos CRUD", () => {
  test("seed data is present", async () => {
    const r = await request("GET", "/api/todos");
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.categories));
    assert.ok(r.body.categories.length > 0, "seed categories should exist");
    assert.ok(Array.isArray(r.body.todos));
  });

  test("create + read + update + delete a todo", async () => {
    // pick the first seeded category
    const list = await request("GET", "/api/todos");
    const catId = list.body.categories[0].id;

    const created = await request(
      "POST",
      "/api/todos",
      { category_id: catId, text: "write tests" },
      MUT,
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.text, "write tests");
    assert.equal(created.body.done, false);
    const id = created.body.id;

    const updated = await request(
      "PATCH",
      `/api/todos/${id}`,
      { done: true, text: "write more tests" },
      MUT,
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.done, true);
    assert.equal(updated.body.text, "write more tests");

    const deleted = await request("DELETE", `/api/todos/${id}`, {}, MUT);
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.deleted, true);

    const gone = await request("DELETE", `/api/todos/${id}`, {}, MUT);
    assert.equal(gone.status, 404);
  });

  test("POST without CSRF header is rejected (403)", async () => {
    const list = await request("GET", "/api/todos");
    const catId = list.body.categories[0].id;
    const r = await request("POST", "/api/todos", {
      category_id: catId,
      text: "no header",
    });
    assert.equal(r.status, 403);
  });

  test("invalid category_id is rejected (400)", async () => {
    const r = await request(
      "POST",
      "/api/todos",
      { category_id: 0, text: "x" },
      MUT,
    );
    assert.equal(r.status, 400);
  });

  test("unknown category is 404", async () => {
    const r = await request(
      "POST",
      "/api/todos",
      { category_id: 999999, text: "x" },
      MUT,
    );
    assert.equal(r.status, 404);
  });

  test("empty text is rejected (400)", async () => {
    const list = await request("GET", "/api/todos");
    const catId = list.body.categories[0].id;
    const r = await request(
      "POST",
      "/api/todos",
      { category_id: catId, text: "   " },
      MUT,
    );
    assert.equal(r.status, 400);
  });

  test("text is clamped to MAX_TEXT (500)", async () => {
    const list = await request("GET", "/api/todos");
    const catId = list.body.categories[0].id;
    const long = "x".repeat(600);
    const r = await request(
      "POST",
      "/api/todos",
      { category_id: catId, text: long },
      MUT,
    );
    assert.equal(r.status, 201);
    assert.equal(r.body.text.length, 500);
  });

  test("PATCH on non-existent todo is 404", async () => {
    const r = await request("PATCH", "/api/todos/999999", { done: true }, MUT);
    assert.equal(r.status, 404);
  });
});

describe("categories", () => {
  test("create + update + delete a category", async () => {
    const created = await request(
      "POST",
      "/api/categories",
      { name: "New Cat" },
      MUT,
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.name, "New Cat");
    const id = created.body.id;

    const updated = await request(
      "PATCH",
      `/api/categories/${id}`,
      { name: "Renamed Cat" },
      MUT,
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.name, "Renamed Cat");

    const deleted = await request("DELETE", `/api/categories/${id}`, {}, MUT);
    assert.equal(deleted.status, 200);
  });

  test("cannot delete a non-empty category (409)", async () => {
    // a seeded category with todos
    const list = await request("GET", "/api/todos");
    const cat = list.body.categories.find((c) =>
      list.body.todos.some((t) => t.category_id === c.id),
    );
    const r = await request("DELETE", `/api/categories/${cat.id}`, {}, MUT);
    assert.equal(r.status, 409);
    assert.equal(r.body.error, "category not empty");
    assert.ok(r.body.count > 0);
  });

  test("delete an empty category succeeds", async () => {
    const created = await request(
      "POST",
      "/api/categories",
      { name: "Empty Cat" },
      MUT,
    );
    const r = await request(
      "DELETE",
      `/api/categories/${created.body.id}`,
      {},
      MUT,
    );
    assert.equal(r.status, 200);
  });

  test("empty category name is rejected (400)", async () => {
    const r = await request("POST", "/api/categories", { name: "   " }, MUT);
    assert.equal(r.status, 400);
  });

  test("PATCH non-existent category is 404", async () => {
    const r = await request(
      "PATCH",
      "/api/categories/999999",
      { name: "x" },
      MUT,
    );
    assert.equal(r.status, 404);
  });
});
