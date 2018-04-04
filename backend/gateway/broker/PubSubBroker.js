'use strict'

const Rx = require('rxjs');
const REPLY_TIMEOUT = process.env.REPLY_TIMEOUT || 2000;
// Imports the Google Cloud client library
const PubSub = require('@google-cloud/pubsub');
const projectId = process.env.GCLOUD_PROJECT_ID;
const GATEWAY_REPLIES_TOPIC = process.env.GATEWAY_REPLIES_TOPIC;
const GATEWAY_REPLIES_TOPIC_SUBSCRIPTION = process.env.GATEWAY_REPLIES_TOPIC_SUBSCRIPTION;

class PubSubBroker {

    constructor() {
        /**
         * Rx Subject for every message reply
         */
        this.replies$ = new Rx.BehaviorSubject();
        /**
         * Map of verified topics
         */
        this.verifiedTopics = {};

        this.pubsubClient = new PubSub({
            projectId: projectId,
        });
        //lets start listening to messages
        this.startMessageListener();
    }

    /**
     * Forward the Graphql query/mutation to the Microservices
     * @param {string} topic topic to publish
     * @param { {root,args,jwt} } message payload {root,args,jwt}
     */
    forward$(topic, payload) {
        return this.getTopic$(topic)
            .switchMap(topic => this.publish$(topic, payload))
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
     * Gets an observable that resolves to the topic object
     * @param {string} topicName 
     */
    getTopic$(topicName) {
        //Tries to get a cached topic
        const cachedTopic = this.verifiedTopics[topicName];
        if (!cachedTopic) {
            //if not cached, then tries to know if the topic exists
            const topic = this.pubsubClient.topic(topicName);
            return Rx.Observable.fromPromise(topic.exists())
                .map(data => data[0])
                .switchMap(exists => {
                    if (exists) {
                        //if it does exists, then store it on the cache and return it
                        this.verifiedTopics[topicName] = topic;
                        console.log(`Topic ${topicName} already existed and has been set into the cache`);
                        return Rx.Observable.of(topic);
                    } else {
                        //if it does NOT exists, then create it, store it in the cache and return it
                        return this.createTopic$(topicName);
                    }
                })
                ;
        }
        //return cached topic
        console.log(`Topic ${topicName} already existed it is cached`);
        return Rx.Observable.of(cachedTopic);
    }

    /**
     * Creates a Topic and return an observable that resolves to the created topic
     * @param {string} topicName 
     */
    createTopic$(topicName) {
        return Rx.Observable.fromPromise(this.pubsubClient.createTopic(topicName))
            .switchMap(data => {
                this.verifiedTopics[topicName] = this.pubsubClient.topic(topicName);
                console.log(`Topic ${topicName} have been created set into the cache`);
                return Rx.Observable.of(this.verifiedTopics[topicName]);
            });
    }

    /**
     * Publish data throught a topic
     * Returns an Observable that resolves to the sent message ID
     * @param {Topic} topic 
     * @param {Object} data 
     */
    publish$(topic, data) {
        const dataBuffer = Buffer.from(JSON.stringify(data));
        return Rx.Observable.fromPromise(
            topic.publisher().publish(dataBuffer))
            .do(messageId => console.log(`Message published through ${topic.name}, MessageId=${messageId}`))
            
            // auto reply, for testing only
            //.do(messageId => this.verifiedTopics[GATEWAY_REPLIES_TOPIC].publisher().publish(Buffer.from(JSON.stringify( { id: 1, firstName:'aaa', lastName:'bbb' })),{correlationId:messageId}).then(result => console.log(`========${result}`)) )
            ;
    }

    /**
     * Returns an Observable that resolves to the subscription
     * @param {string} topicName 
     * @param {string} subscriptionName 
     */
    getSubscription$(topicName, subscriptionName) {
        return this.getTopic$(topicName)
            .switchMap(topic => Rx.Observable.fromPromise(
                topic.subscription(subscriptionName)
                    .get({ autoCreate: true }))
            ).map(results => results[0]);
    }

    /**
     * Starts to listen messages
     */
    startMessageListener() {
        this.getSubscription$(GATEWAY_REPLIES_TOPIC, GATEWAY_REPLIES_TOPIC_SUBSCRIPTION)
            .subscribe(
                (pubSubSubscription) => {
                    pubSubSubscription.on(`message`, message => {
                        console.log(`Received message ${message.id}:`);
                        this.replies$.next({ id: message.id, data: JSON.parse(message.data), attributes: message.attributes, correlationId: message.attributes.correlationId });
                        message.ack();
                    });
                },
                (err) => {
                    console.error('Failed to obtain GatewayReplies subscription', err);
                },
                () => {
                    console.log('GatewayReplies listener has completed!');
                }
            );
    }
}

module.exports = PubSubBroker;