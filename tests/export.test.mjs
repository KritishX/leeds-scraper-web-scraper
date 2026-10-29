import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, exportRecords } from "../server/export.mjs";

test("CSV keeps numbers and booleans as values and guards formula text", () => {
  const { body, contentType } = exportRecords(
    [{ lon: -1.548, price: -5, open: true, note: "-1+2", title: "=FORM" }],
    "csv",
  );
  assert.equal(contentType, "text/csv; charset=utf-8");
  assert.equal(
    body,
    '"lon","price","open","note","title"\r\n"-1.548","-5","true","\'-1+2","\'=FORM"',
  );
});

test("CSV cells quote nested objects, escape quotes and guard every formula prefix", () => {
  assert.equal(csvCell({ a: [1, '"x"'] }), '"{""a"":[1,""\\""x\\""""]}"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(undefined), '""');
  for (const prefix of ["=", "+", "-", "@", "\t", "\r"])
    assert.equal(csvCell(prefix + "1"), `"'${prefix}1"`);
  // Leading spaces are not a formula prefix in spreadsheets; the text is kept.
  assert.equal(csvCell("  =1"), '"  =1"');
});

test("exports cover every key across records and reject unknown formats", () => {
  const records = [{ a: 1 }, { b: 2 }];
  assert.equal(
    exportRecords(records, "csv").body,
    '"a","b"\r\n"1",""\r\n"","2"',
  );
  assert.equal(exportRecords(records, "jsonl").body, '{"a":1}\n{"b":2}');
  assert.deepEqual(JSON.parse(exportRecords(records, "json").body), records);
  for (const format of ["xml", "constructor"])
    assert.throws(() => exportRecords(records, format), { status: 400 });
});
