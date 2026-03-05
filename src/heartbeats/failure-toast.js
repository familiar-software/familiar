const DEFAULT_HEARTBEAT_TOPIC_LABEL = 'Heartbeat'

const normalizeTopic = (topic) => {
  const normalized = typeof topic === 'string' ? topic.trim() : ''
  return normalized.length > 0 ? normalized : DEFAULT_HEARTBEAT_TOPIC_LABEL
}

const buildHeartbeatFailureToastBody = (topic) => {
  return `heartbeat ${normalizeTopic(topic)} failed. for further information, check the logs`
}

module.exports = {
  buildHeartbeatFailureToastBody
}
