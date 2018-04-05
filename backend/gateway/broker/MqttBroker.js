'use strict'

var mqtt = require('mqtt');
const Rx = require('rxjs');
const uuidv4 = require('uuid/v4');

class MqttBroker {

    constructor({ gatewayRepliesTopic, mqttServerUrl, projectId, replyTimeout }) {
        this.gatewayRepliesTopic = gatewayRepliesTopic;
        this.mqttServerUrl = mqttServerUrl;
        this.projectId = projectId;
        this.senderId = uuidv4();
        this.replyTimeout = replyTimeout;
        /**
         * Rx Subject for every message reply
         */
        this.replies$ = new Rx.BehaviorSubject();

        /**
         * MQTT Client
         */
        this.mqttClient = mqtt.connect(this.mqttServerUrl);
        this.configMessageListener();
    }



    /**
     * Forward the Graphql query/mutation to the Microservices
     * @param {string} topic topic to publish
     * @param {Object} message payload {root,args,jwt}
     * @param {Object} ops {correlationId} 
     */
    forward$(topic, payload, { correlationId } = {}) {
        return this.publish$(topic, payload, { correlationId });
    }

    /**
     * Forward the Graphql query/mutation to the Microservices
     * @param {string} topic topic to publish
     * @param { {root,args,jwt} } message payload {root,args,jwt}
     * @param {number} timeout wait timeout millis
     * 
     * Returns an Observable that resolves the message response
     */
    forwardAndGetReply$(topic, payload, timeout = this.replyTimeout) {
        return this.forward$(topic, payload)
            .switchMap((messageId) => this.getMessageReply$(messageId, timeout))
    }


    /**
     * Returns an observable that waits for the message response or throws an error if timeout is exceded
     * @param {string} correlationId 
     * @param {number} timeout 
     */
    getMessageReply$(correlationId, timeout = this.replyTimeout, ignoreSelfEvents = true) {
        return this.replies$
            .filter(msg => msg)
            .filter(msg => !ignoreSelfEvents || msg.attributes.senderId !== this.senderId)
            .filter(msg => msg && msg.correlationId === correlationId)
            .map(msg => msg.data)
            .timeout(timeout)
            .first();
    }


    /**
     * Publish data throught a topic
     * Returns an Observable that resolves to the sent message ID
     * @param {string} topicName 
     * @param {Object} data 
     * @param {Object} ops {correlationId} 
     */
    publish$(topicName, data, { correlationId } = {}) {
        const uuid = uuidv4();
        const dataBuffer = JSON.stringify(
            {
                id: uuid,
                data,
                attributes: {
                    senderId: this.senderId,
                    correlationId
                }
            }
        );

        return Rx.Observable.of(0)
            .map(() => {
                this.mqttClient.publish(`${this.projectId}/${topicName}`, dataBuffer, { qos: 0 });
                return uuid;
            })
            ;
    }


    /**
     * Configure to listen messages
     */
    configMessageListener() {

        const that = this;

        this.mqttClient.on('connect', function () {
            that.mqttClient.subscribe(`${that.projectId}/${that.gatewayRepliesTopic}`);
            console.log(`Mqtt client subscribed to ${that.projectId}/${that.gatewayRepliesTopic}`);
        });

        this.mqttClient.on('message', function (topic, message) {
            const envelope = JSON.parse(message);
            console.log(`Received message id: ${envelope.id}`);
            // message is Buffer
            that.replies$.next(
                {
                    id: envelope.id,
                    data: envelope.data,
                    attributes: envelope.attributes,
                    correlationId: envelope.attributes.correlationId
                }
            );
        })
    }

    /**
     * Stops broker 
     */
    disconnectBroker() {
        this.mqttClient.end();
    }
}

module.exports = MqttBroker;