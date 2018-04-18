'use strict'

const Rx = require('rxjs');
const uuidv4 = require('uuid/v4');

class PubSubBroker {

    constructor({ projectId, gatewayRepliesTopic, gatewayRepliesTopicSubscription,gatewayEventsTopic, gatewayEventsTopicSubscription, replyTimeOut }) {
        this.projectId = projectId
        this.gatewayRepliesTopic = gatewayRepliesTopic;
        this.gatewayRepliesTopicSubscription = gatewayRepliesTopicSubscription;
        this.gatewayEventsTopic = gatewayEventsTopic;
        this.gatewayEventsTopicSubscription = gatewayEventsTopicSubscription;
        this.replyTimeOut = replyTimeOut;

        /**
         * Rx Subject for every message reply
         */
        this.replies$ = new Rx.BehaviorSubject();
        this.senderId = uuidv4();
        /**
         * Map of verified topics
         */
        this.verifiedTopics = {};

        const PubSub = require('@google-cloud/pubsub');
        this.pubsubClient = new PubSub({
            projectId: this.projectId,
        });
        //lets start listening to messages
        this.startMessageListener();
    }

    /**
     * Forward the Graphql query/mutation to the Microservices
     * @param {string} topic topic to publish
     * @param {string} type message(payload) type
     * @param { {root,args,jwt} } message payload {root,args,jwt}
     * @param {Object} ops {correlationId, messageId} 
     */
    forward$(topic, type, payload, ops = {}) {
        return this.getTopic$(topic)
            .switchMap(topic => this.publish$(topic, type, payload, ops))
    }

    /**
     * Forward the Graphql query/mutation to the Microservices
     * @param {string} topic topic to publish
     * @param {string} type message(payload) type
     * @param { {root,args,jwt} } message payload {root,args,jwt}
     * @param {number} timeout wait timeout millis
     * @param {boolean} ignoreSelfEvents ignore messages comming from this clien
     * @param {Object} ops {correlationId, messageId}
     * 
     * Returns an Observable that resolves the message response
     */
    forwardAndGetReply$(topic, type, payload, timeout = this.replyTimeout, ignoreSelfEvents = true, ops) {
        return this.forward$(topic, type, payload, ops)
            .switchMap((messageId) => this.getMessageReply$(messageId, timeout, ignoreSelfEvents))
    }


    /**
     * Returns an observable that waits for the message response or throws an error if timeout is exceded
     * @param {string} correlationId 
     * @param {number} timeout 
     */
    getMessageReply$(correlationId, timeout = this.replyTimeOut, ignoreSelfEvents = true) {
        return this.replies$
            .filter(msg => msg)
            .filter(msg => !ignoreSelfEvents || msg.attributes.senderId !== this.senderId)
            .filter(msg => msg.correlationId === correlationId)
            .map(msg => msg.data)
            .timeout(timeout)
            .first();
    }

    /**
     * Returns an observable listen to events, and returns the entire message
     * @param {array} types Message types to filter. if undefined means all types
     * @param {number} timeout 
     */
    getEvents$(types, ignoreSelfEvents = true) {
        return this.replies$
            .filter(msg => msg)
            .filter(msg => msg.topic === this.gatewayEventsTopic)
            .filter(msg => types ? types.indexOf(msg.type) !== -1 : true)
            .filter(msg => !ignoreSelfEvents || msg.attributes.senderId !== this.senderId);
    }

    /**
     * Returns an observable listen to messages from MaterializedViewsUpdate topic.
     * @param {array} types Message types to filter. if undefined means all types
     * @param {number} timeout 
     */
    getMaterializedViewsUpdates$(types, ignoreSelfEvents = true) {
        return this.replies$
            .filter(msg => msg)
            .filter(msg => msg.topic === this.materializedViewUpdates)
            .filter(msg => types ? types.indexOf(msg.type) !== -1 : true)
            .filter(msg => !ignoreSelfEvents || msg.attributes.senderId !== this.senderId);
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
                console.log(`Topic ${topicName} have been created and set into the cache`);
                return Rx.Observable.of(this.verifiedTopics[topicName]);
            });
    }

    /**
     * Publish data throught a topic
     * Returns an Observable that resolves to the sent message ID
     * @param {Topic} topic 
     * @param {string} type message(payload) type
     * @param {Object} data 
     * @param {Object} ops {correlationId, messageId} 
     */
    publish$(topic, type, data, { correlationId, messageId } = {}) {
        const dataBuffer = Buffer.from(JSON.stringify(data));
        return Rx.Observable.fromPromise(
            topic.publisher().publish(dataBuffer,
                {
                    senderId: this.senderId,
                    correlationId,
                    type
                }))
            //.do(messageId => console.log(`Message published through ${topic.name}, MessageId=${messageId}`))
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
        this.getSubscription$(this.gatewayRepliesTopic, this.gatewayRepliesTopicSubscription)
            .subscribe(
                (pubSubSubscription) => {
                    pubSubSubscription.on(`message`, message => {
                        //console.log(`Received message ${message.id}:`);
                        this.replies$.next(
                            {
                                id: message.id,
                                type: message.attributes.type,
                                data: JSON.parse(message.data),
                                attributes: message.attributes,
                                correlationId: message.attributes.correlationId
                            }
                        );
                        message.ack();
                    });
                },
                (err) => {
                    console.error('Failed to obtain GatewayReplies subscription', err);
                },
                () => {
                    //console.log('GatewayReplies listener has completed!');
                }
            );
    }

    /**
     * Stops broker 
     */
    disconnectBroker() {
        this.getSubscription$(this.gatewayRepliesTopic, this.gatewayRepliesTopicSubscription).subscribe(
            (subscription) => subscription.removeListener(`message`),
            (error) => console.error(`Error disconnecting Broker`, error),
            () => console.log('Broker disconnected')
        );
    }
}

module.exports = PubSubBroker;