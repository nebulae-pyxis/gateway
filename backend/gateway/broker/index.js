'use strict'

//Service Port
const BROKER_TYPE = process.env.BROKER_TYPE || 'PUBSUB';
let broker = undefined;

switch (BROKER_TYPE) {
    case 'PUBSUB':
        const PubSubBroker = require('./PubSubBroker');
        broker = new PubSubBroker({
            replyTimeOut: process.env.REPLY_TIMEOUT || 2000,
            projectId: process.env.GCLOUD_PROJECT_ID,
            gatewayRepliesTopic: process.env.GATEWAY_REPLIES_TOPIC,
            gatewayRepliesTopicSubscription: process.env.GATEWAY_REPLIES_TOPIC_SUBSCRIPTION
        });
        break;
    case 'MQTT':
        const MqttBroker = require('./MqttBroker');
        broker = new MqttBroker({
            gatewayRepliesTopic: process.env.GATEWAY_REPLIES_TOPIC,
            projectId: process.env.GCLOUD_PROJECT_ID,
            mqttServerUrl: process.env.MQTT_SERVER_URL,
            replyTimeout: process.env.REPLY_TIMEOUT ||  2000
        });
        break;
}

module.exports = broker;