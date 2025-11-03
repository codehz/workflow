import { expect, test } from "bun:test";
import { parseDuration } from "../src/utils";

test("parseDuration 正确解析秒数", () => {
  expect(parseDuration("1 second")).toBe(1000);
  expect(parseDuration("30 seconds")).toBe(30000);
});

test("parseDuration 正确解析分钟", () => {
  expect(parseDuration("1 minute")).toBe(60000);
  expect(parseDuration("2 minutes")).toBe(120000);
});

test("parseDuration 正确解析小时", () => {
  expect(parseDuration("1 hour")).toBe(3600000);
  expect(parseDuration("3 hours")).toBe(10800000);
});

test("parseDuration 正确解析天数", () => {
  expect(parseDuration("1 day")).toBe(86400000);
  expect(parseDuration("4 days")).toBe(345600000);
});

test("parseDuration 对无效格式抛出错误", () => {
  expect(() => parseDuration("invalid")).toThrow(
    "Invalid duration format: invalid",
  );
  expect(() => parseDuration("hour")).toThrow("Invalid duration format: hour");
  expect(() => parseDuration("1 unknown")).toThrow(
    "Invalid duration format: 1 unknown",
  );
});
