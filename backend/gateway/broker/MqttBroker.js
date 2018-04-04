'use strict'

var mqtt = require('mqtt');
const Rx = require('rxjs');
const uuidv4 = require('uuid/v4');
const REPLY_TIMEOUT = process.env.REPLY_TIMEOUT || 2000;
const projectId = process.env.GCLOUD_PROJECT_ID;
const GATEWAY_REPLIES_TOPIC = process.env.GATEWAY_REPLIES_TOPIC;
const MQTT_SERVER_URL = process.env.MQTT_SERVER_URL;

class MqttBroker {

    constructor() {
        /**
         * Rx Subject for every message reply
         */
        this.replies$ = new Rx.BehaviorSubject();

        /**
         * MQTT Client
         */
        this.mqttClient = mqtt.connect(MQTT_SERVER_URL);
        this.configMessageListener();
    }

    /**
     * Forward the Graphql query/mutation to the Microservices
     * @param {string} topic topic to publish
     * @param { {root,args,jwt} } message payload {root,args,jwt}
     */
    forward$(topic, payload) {
        return this.publish$(topic, payload);
    }

    /**
     * Forward the Graphql query/mutation to the Microservices
     * @param {string} topic topic to publish
     * @param { {root,args,jwt} } message payload {root,args,jwt}
     * @param {number} timeout wait timeout millis
     * 
     * Returns an Observable that resolves the message response
     */
    forwardAndGetReply$(topic, payload, timeout = REPLY_TIMEOUT) {
        return this.forward$(topic, payload)
            .switchMap((messageId) => this.getMessageReply$(messageId, timeout))
    }


    /**
     * Returns an observable that waits for the message response or throws an error if timeout is exceded
     * @param {string} correlationId 
     * @param {number} timeout 
     */
    getMessageReply$(correlationId, timeout = REPLY_TIMEOUT) {
        return this.replies$
            .filter(msg => msg && msg.correlationId === correlationId)
            .map(msg => msg.data)
            .timeout(2000)
            .first();
    }


    /**
     * Publish data throught a topic
     * Returns an Observable that resolves to the sent message ID
     * @param {string} topicName 
     * @param {Object} data 
     */
    publish$(topicName, data) {
        const uuid = uuidv4();
        const dataBuffer = JSON.stringify(
            {
                id: uuid,
                data,
                attributes: { replyTo: GATEWAY_REPLIES_TOPIC }
            }
        );

        return Rx.Observable.of(0)
            .map(() => {
                this.mqttClient.publish(`${projectId}/${topicName}`, dataBuffer, { qos: 0 });
                return uuid;
            })
            .do(messageId => console.log(`Message published through ${topicName}, MessageId=${messageId}`))

            //auto reply, for testing only
            // .do(messageId =>
            //     this.mqttClient.publish(
            //         `${projectId}/${GATEWAY_REPLIES_TOPIC}`,
            //         JSON.stringify(
            //             {
            //                 id: 111,
            //                 data: { id: 1, firstName: 'aaa', lastName: 'bbb' },
            //                 attributes: { correlationId: uuid, id: uuidv4() }
            //             }
            //         ))
            // )
            ;
    }


    /**
     * Configure to listen messages
     */
    configMessageListener() {

        const that = this;

        this.mqttClient.on('connect', function () {
            that.mqttClient.subscribe(`${projectId}/${GATEWAY_REPLIES_TOPIC}`);
            console.log(`Mqtt client subscribed to ${projectId}/${GATEWAY_REPLIES_TOPIC}`);
        });

        this.mqttClient.on('message', function (topic, message) {
            const envelope = JSON.parse(message);
            console.log(`Received message id: ${envelope.attributes.id}`);
            // message is Buffer
            that.replies$.next(
                {
                    id: envelope.attributes.id,
                    data: envelope.data,
                    attributes: envelope.attributes,
                    correlationId: envelope.attributes.correlationId
                }
            );
        })
    }
}

module.exports = MqttBroker;