#!/usr/bin/env node
/* Validates data/datacenters.json against the schema the app expects.
   Run: node scripts/validate-data.js */

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "datacenters.json");

const VALID_STATUS = ["operational", "under_construction", "planned", "announced"];

// Rough bounding box for India (incl. islands), used to catch bad geocodes.
const INDIA_BOUNDS = { minLat: 6, maxLat: 37.5, minLng: 68, maxLng: 97.5 };

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

function main() {
  if (!fs.existsSync(DATA_PATH)) {
    fail(`Missing ${DATA_PATH}`);
    return;
  }

  let raw;
  try {
    raw = fs.readFileSync(DATA_PATH, "utf8");
  } catch (e) {
    fail(`Could not read data file: ${e.message}`);
    return;
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    fail(`Invalid JSON: ${e.message}`);
    return;
  }

  if (!json.meta || !json.meta.lastUpdated) {
    fail("meta.lastUpdated is required");
  }

  if (!Array.isArray(json.facilities)) {
    fail("facilities must be an array");
    return;
  }

  const seenIds = new Set();
  let warnings = 0;

  json.facilities.forEach((f, i) => {
    const where = `facilities[${i}] (${f.id || f.name || "unknown"})`;

    if (!f.id) fail(`${where}: missing "id"`);
    else if (seenIds.has(f.id)) fail(`${where}: duplicate id "${f.id}"`);
    else seenIds.add(f.id);

    if (!f.name) fail(`${where}: missing "name"`);
    if (!f.operator) fail(`${where}: missing "operator"`);
    if (!f.status || !VALID_STATUS.includes(f.status)) {
      fail(`${where}: "status" must be one of ${VALID_STATUS.join(", ")}`);
    }

    if (typeof f.lat !== "number" || typeof f.lng !== "number") {
      console.warn(`~ ${where}: missing/invalid lat/lng — will not render on map`);
      warnings++;
    } else if (
      f.lat < INDIA_BOUNDS.minLat ||
      f.lat > INDIA_BOUNDS.maxLat ||
      f.lng < INDIA_BOUNDS.minLng ||
      f.lng > INDIA_BOUNDS.maxLng
    ) {
      fail(`${where}: lat/lng (${f.lat}, ${f.lng}) falls outside India's bounding box — check for a geocoding error`);
    }

    if (f.capacityMW != null && typeof f.capacityMW !== "number") {
      fail(`${where}: "capacityMW" must be a number (MW), got ${typeof f.capacityMW}`);
    }
    if (f.investmentUSD != null && typeof f.investmentUSD !== "number") {
      fail(`${where}: "investmentUSD" must be a number (USD), got ${typeof f.investmentUSD}`);
    }
    if (f.sources && !Array.isArray(f.sources)) {
      fail(`${where}: "sources" must be an array of {title, url}`);
    }
    if ((!f.sources || !f.sources.length) && f.status !== "operational") {
      // Not a hard failure, but flag entries with unverifiable claims.
    }
  });

  console.log(`Checked ${json.facilities.length} facilities, ${seenIds.size} unique ids, ${warnings} warning(s).`);
  if (process.exitCode) {
    console.error("\nValidation FAILED.");
  } else {
    console.log("Validation passed.");
  }
}

main();
