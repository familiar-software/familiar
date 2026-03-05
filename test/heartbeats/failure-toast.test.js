const test = require('node:test');
const assert = require('node:assert/strict');

const { buildHeartbeatFailureToastBody } = require('../../src/heartbeats/failure-toast');

test('buildHeartbeatFailureToastBody includes the new wording and topic', () => {
  const result = buildHeartbeatFailureToastBody('daily_summary')
  assert.equal(result, 'heartbeat daily_summary failed. for further information, check the logs')
});

test('buildHeartbeatFailureToastBody falls back to Heartbeat when topic missing', () => {
  const result = buildHeartbeatFailureToastBody('')
  assert.equal(result, 'heartbeat Heartbeat failed. for further information, check the logs')
});
