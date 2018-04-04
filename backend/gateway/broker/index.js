'use strict'

//Service Port
const BROKER_TYPE = process.env.BROKER_TYPE || 'PUBSUB';
let broker = undefined;

switch (BROKER_TYPE) {
    case 'PUBSUB':
        const PubSubBroker = require('./PubSubBroker');
        broker = new PubSubBroker();
        break;
    case 'MQTT':
        const MqttBroker = require('./MqttBroker');
        broker = new MqttBroker();
        break;
}

module.exports = broker;