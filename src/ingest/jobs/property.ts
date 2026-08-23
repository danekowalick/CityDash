/**
 * Ingests zoning and land use applications from Latah County's open ArcGIS
 * services.
 *
 * These are the parts of the property picture that are genuinely public in
 * Idaho. Sale prices are not: the state does not require them to be reported
 * to the recorder or assessor, so no amount of engineering produces them and
 * nothing here pretends to.
 */

import { politeFetch } from "../../lib/fetcher";
import { transaction } from "../../lib/db";
import { finishRun, startRun, storeRawDocument } from "../store";

const SOURCE_ID = "latah-gis";
const GIS = "https://gis.latah.id.us/arcgis/rest/services";

const ZONING_LAYER = GIS + "/Municipalities/MapServer/1";
const LAND_USE_LAYER = GIS + "/PlanningCombined/MapServer/2";

/** ArcGIS caps a response; walk with resultOffset until it stops advancing. */
const PAGE_SIZE = 500;

interface ArcGisFeature {
  attributes: Record<string, unknown>;
}

function queryUrl(layer: string, fields: string, offset: number): string {
  const url = new URL(layer + "/query");
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", fields);
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(PAGE_SIZE));
  url.searchParams.set("f", "json");
  return url.toString();
}

async function fetchAll(layer: string, fields: string): Promise<ArcGisFeature[]> {
  const all: ArcGisFeature[] = [];
  for (let offset = 0; offset < 20000; offset += PAGE_SIZE) {
    const document = await politeFetch(queryUrl(layer, fields, offset), {
      accept: "application/json",
    });
    await storeRawDocument(SOURCE_ID, document);

    const payload = JSON.parse(document.body) as { features?: ArcGisFeature[] };
    const features = payload.features ?? [];
    all.push(...features);
    if (features.length < PAGE_SIZE) break;
  }
  return all;
}

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const integer = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;

/**
 * ArcGIS returns epoch milliseconds. A few county records carry impossible
 * values -- one land use action is dated 2055 -- so anything outside a
 * plausible range becomes null rather than a wrong date on the site.
 */
function epochToDate(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  const year = date.getUTCFullYear();
  if (year < 1900 || year > new Date().getUTCFullYear() + 1) return null;
  return date.toISOString().slice(0, 10);
}

export async function ingestProperty(): Promise<void> {
  const runId = await startRun(SOURCE_ID);
  let itemsSeen = 0;
  let itemsNew = 0;

  try {
    const zoning = await fetchAll(ZONING_LAYER, "OBJECTID,ZONECLASS,ZONEDESC,ORD,Shape_Area");
    itemsSeen += zoning.length;

    await transaction(async (client) => {
      for (const feature of zoning) {
        const a = feature.attributes;
        const id = integer(a.OBJECTID);
        const zoneClass = text(a.ZONECLASS);
        if (id === null || !zoneClass) continue;

        await client.query(
          `INSERT INTO zoning_districts (id, zone_class, zone_desc, ordinance, area_sq_ft)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             zone_class = EXCLUDED.zone_class,
             zone_desc = EXCLUDED.zone_desc,
             ordinance = EXCLUDED.ordinance,
             area_sq_ft = EXCLUDED.area_sq_ft,
             ingested_at = now()`,
          [
            id,
            zoneClass,
            text(a.ZONEDESC),
            text(a.ORD),
            typeof a.Shape_Area === "number" ? a.Shape_Area : null,
          ],
        );
        itemsNew++;
      }
    });
    console.log("  zoning districts: " + zoning.length);

    const actions = await fetchAll(
      LAND_USE_LAYER,
      "OBJECTID,TYPE,NUM,ACTION,DATE_,Applicant,Parcel,LABEL",
    );
    itemsSeen += actions.length;

    let undated = 0;
    await transaction(async (client) => {
      for (const feature of actions) {
        const a = feature.attributes;
        const id = integer(a.OBJECTID);
        if (id === null) continue;

        const decided = epochToDate(a.DATE_);
        if (!decided && a.DATE_ != null) undated++;

        await client.query(
          `INSERT INTO land_use_actions
             (id, label, kind, number, action, applicant, parcel, decided_on)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             label = EXCLUDED.label,
             kind = EXCLUDED.kind,
             number = EXCLUDED.number,
             action = EXCLUDED.action,
             applicant = EXCLUDED.applicant,
             parcel = EXCLUDED.parcel,
             decided_on = EXCLUDED.decided_on,
             ingested_at = now()`,
          [
            id,
            text(a.LABEL),
            text(a.TYPE),
            integer(a.NUM),
            text(a.ACTION),
            text(a.Applicant),
            text(a.Parcel),
            decided,
          ],
        );
        itemsNew++;
      }
    });
    console.log(
      "  land use actions: " + actions.length +
        (undated > 0 ? " (" + undated + " with an implausible date, stored undated)" : ""),
    );

    await finishRun(runId, "ok", { itemsSeen, itemsNew });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(runId, "error", { itemsSeen, itemsNew, error: message });
    throw error;
  }
}
