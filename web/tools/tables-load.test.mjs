// The table loader: CSV parsing and the clear-error law. Run: node --import ./tools/tables/register-json.mjs --test tools/tables-load.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsv, readTable, checkSchema, TableError } from '../src/data/tables/load.js';

const schema = {
  table: 'T', family: 'f', key: 'Name', description: 'A test table for the loader.',
  columns: [
    { name: 'Name', type: 'string', path: null, required: true },
    { name: 'Len_m', type: 'float', unit: 'm', path: 'len', required: true, min: 0 },
    { name: 'Seats', type: 'int', unit: '', path: 'seats' },
    { name: 'Kind', type: 'string', path: 'kind', enum: ['a', 'b'] },
    { name: 'Open', type: 'bool', path: 'open' },
    { name: 'Source', type: 'string', path: null, required: true },
  ],
};
const head = 'Name,Len_m,Seats,Kind,Open,Source\n';
const err = (csv, re) => assert.throws(() => readTable(schema, head + csv, 'f/T.csv'), (e) => e instanceof TableError && re.test(e.message), csv);

test('the schema itself is checked', () => { assert.deepEqual(checkSchema(schema), []); assert.ok(checkSchema({ ...schema, columns: schema.columns.map((c) => (c.name === 'Len_m' ? { ...c, unit: undefined } : c)) }).length); });
test('quotes, commas and newlines inside cells', () => {
  assert.deepEqual(parseCsv('a,"b,c","d ""q"""\n1,2,3\n').map((r) => r.cells), [['a', 'b,c', 'd "q"'], ['1', '2', '3']]);
  assert.deepEqual(parseCsv('a,"x\ny"\r\nb,c\r\n').map((r) => [r.line, r.cells]), [[1, ['a', 'x\ny']], [3, ['b', 'c']]]);
});
test('a good row reads', () => { const t = readTable(schema, head + 'car,4.5,,a,true,design\n', 'f/T.csv'); assert.deepEqual(t.rows[0].cells, { Name: 'car', Len_m: 4.5, Kind: 'a', Open: true, Source: 'design' }); });
test('a bad row is a clear error with the file and the line', () => {
  err('car,4.5,,a,true,design\nbus,abc,,a,,design\n', /^f\/T\.csv:3: Len_m: "abc" is not a float/);
  err('car,-1,,,,design\n', /^f\/T\.csv:2: Len_m: -1 is under the minimum 0/);
  err('car,1,2.5,,,design\n', /^f\/T\.csv:2: Seats: 2\.5 is not a whole number/);
  err('car,1,,z,,design\n', /^f\/T\.csv:2: Kind: "z" is not one of a\|b/);
  err('car,1,,,yes,design\n', /^f\/T\.csv:2: Open: "yes" is not a bool/);
  err('car,1,,,,\n', /^f\/T\.csv:2: Source is required/);
  err('car,,,,,design\n', /^f\/T\.csv:2: Len_m is required/);
  err('car,1,,,,design\ncar,2,,,,design\n', /^f\/T\.csv:3: Name car already used on line 2/);
  err('two-lane,1,,,,design\n', /^f\/T\.csv:2: Name "two-lane" must be letters/);
  err('car,1,,,design\n', /^f\/T\.csv:2: 5 cells, the header has 6/);
});
test('a header that disagrees with the schema is refused', () => {
  assert.throws(() => readTable(schema, 'Name,Len_m,Source\ncar,1,design\n', 'f/T.csv'), /f\/T\.csv:1: schema column Seats is missing from the header/);
  assert.throws(() => readTable(schema, 'Name,Len_m,Seats,Kind,Open,Source,Extra\ncar,1,,,,design,x\n', 'f/T.csv'), /f\/T\.csv:1: column Extra is not in T\.schema\.json/);
});
