import {test} from 'node:test';import assert from 'node:assert/strict';import {shopToday,reportRange} from '../src/report-range.js';
test('report presets use shop timezone and inclusive seven-day range',()=>{
 const instant=new Date('2026-09-27T19:00:00Z');
 assert.equal(shopToday('Asia/Colombo',instant),'2026-09-28');
 assert.deepEqual(reportRange('today','Asia/Colombo',instant),{from:'2026-09-28',to:'2026-09-28'});
 assert.deepEqual(reportRange('7days','Asia/Colombo',instant),{from:'2026-09-22',to:'2026-09-28'});
 assert.deepEqual(reportRange('month','Asia/Colombo',instant),{from:'2026-09-01',to:'2026-09-28'});
 assert.deepEqual(reportRange('year','Asia/Colombo',instant),{from:'2026-01-01',to:'2026-09-28'});
 assert.deepEqual(reportRange('today','America/New_York',instant),{from:'2026-09-27',to:'2026-09-27'});
});
