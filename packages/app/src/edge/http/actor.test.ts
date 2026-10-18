import { Hono } from "hono";
import { expect, it } from "vitest";
import { actorOf, agentBindings, assistantBindings } from "./actor.js";

const app = new Hono().get("/who", (c) => c.text(actorOf(c)));

it("tells the person, an agent and the in-app assistant apart by the in-process bindings", async () => {
  expect(await (await app.request("/who")).text()).toBe("person");
  expect(await (await app.request("/who", {}, agentBindings)).text()).toBe("agent");
  expect(await (await app.request("/who", {}, assistantBindings)).text()).toBe("assistant");
});

it("reads any other binding as the person", async () => {
  expect(await (await app.request("/who", {}, { actor: "robot" })).text()).toBe("person");
  expect(await (await app.request("/who", {}, { incoming: {}, outgoing: {} })).text()).toBe(
    "person",
  );
});
