'use strict'

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').load();
}

const Rx = require('rxjs');
const express = require('express');
const bodyParser = require('body-parser');
const graphqlServer = require('apollo-server-express');
const graphqlExpress = graphqlServer.graphqlExpress;
const graphiqlExpress = graphqlServer.graphiqlExpress;
const graphqlTools = require('graphql-tools');
const path = require('path');
const mergeGraphqlSchemas = require('merge-graphql-schemas');
const fileLoader = mergeGraphqlSchemas.fileLoader;
const mergeTypes = mergeGraphqlSchemas.mergeTypes;
const gqlSchema = require('./graphql/index');
const broker = require('./broker/BrokerFactory')();
const cors = require('cors');
const graphql = require('graphql');
const execute = graphql.execute;
const subscribe = graphql.subscribe;
const http = require('http');
const SubscriptionServer = require('subscriptions-transport-ws').SubscriptionServer;
//This lib is the easiest way to validate through http using express
const expressJwt = require('express-jwt');
//This is for validation through websockets
const jsonwebtoken = require('jsonwebtoken');


//Service Port
const PORT = process.env.GRAPHQL_END_POINT_PORT || 3000;
//graphql types compendium
const typeDefs = gqlSchema.types;
//graphql resolvers compendium
const resolvers = gqlSchema.resolvers;
//graphql schema = join types & resolvers
const schema = graphqlTools.makeExecutableSchema({ typeDefs, resolvers });

// ApolloEngine
const { ApolloEngine } = require('apollo-engine');

// Initialize engine with your API key. Alternatively,
// set the ENGINE_API_KEY environment variable when you
// run your program.
const engine = new ApolloEngine({
    apiKey: process.env.APOLLO_ENGINE_API_KEY,
    logging: {
        level: process.env.APOLLO_ENGINE_LOG_LEVEL // opts: DEBUG, INFO (default), WARN or ERROR.
    },
  });

//Express Server
const server = express();
// bodyParser is needed just for POST.
server.use(cors());

const jwtPublicKey = process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');


//Validate JWT token throug Express HTTP
server.use(
    process.env.GRAPHQL_HTTP_END_POINT,
    bodyParser.json(),
    expressJwt({
        secret: jwtPublicKey,
        requestProperty: 'authToken',
        credentialsRequired: true,
        algorithms: ['RS256']
    }), graphqlExpress(req => ({
        schema,
        context: {
            authToken: req.authToken,
            encodedToken: req.headers['authorization'] ? req.headers['authorization'].replace(/Bearer /i, '') : undefined,
            broker,
        },
        tracing: true,
        cacheControl: true
    })));

// Expose GraphiQl interface
server.use(process.env.GRAPHIQL_HTTP_END_POINT, graphiqlExpress(
    {
        endpointURL: process.env.GRAPHQL_HTTP_END_POINT,
        subscriptionsEndpoint: `ws://${process.env.GRAPHQL_END_POINT_HOST}:${process.env.GRAPHQL_END_POINT_PORT}${process.env.GRAPHQL_WS_END_POINT}`
    }
));


// Wrap the Express server and combined with WebSockets
const ws = http.createServer(server);
engine.listen({
    port: PORT,
    httpServer: ws,    
    // expressApp: server,
    graphqlPaths: [
        process.env.GRAPHQL_HTTP_END_POINT,
        process.env.GRAPHIQL_HTTP_END_POINT
    ],
}, () => {
    new SubscriptionServer(
        {
            execute,
            subscribe,
            schema,
            onConnect: async (connectionParams, webSocket, connectionContext) => {
                console.log(`GraphQL_WS.onConnect: origin=${connectionContext.request.headers.origin} url=${connectionContext.request.url}`);
                const encondedToken$ = connectionParams.authToken
                    ? Rx.Observable.of(connectionParams.authToken)
                    : connectionContext.request.headers['authorization']
                        ? Rx.Observable.of(connectionContext.request.headers['authorization'])
                            .map(header => {
                                return header.replace('Bearer ', '');
                            })
                        : undefined;
                if (!encondedToken$) {
                    throw new Error('Missing auth token!');
                }
                //this is the default action to do when unsuscribing                
                const authToken = await encondedToken$.map(
                    encondedToken => jsonwebtoken.verify(encondedToken, jwtPublicKey))
                    .toPromise()
                    .catch(error => console.error(`Failed to verify jwt token on WebSocket channel: ${error.message}`, error));
                const encondedToken = await encondedToken$.toPromise()
                    .catch(error => console.error(`Failed to extract decoded jwt token on WebSocket channel: ${error.message}`, error));
                return { broker, authToken, encondedToken, webSocket };
            },
            onDisconnect: (webSocket, connectionContext) => {
                if(webSocket.onUnSubscribe){
                    webSocket.onUnSubscribe.subscribe(
                        (evt) => console.log(`webSocket.onUnSubscribe: ${JSON.stringify({evt})};  origin=${connectionContext.request.headers.origin} url=${connectionContext.request.url};`),
                        error => console.error(`GraphQL_WS.onDisconnect + onUnSubscribe; origin=${connectionContext.request.headers.origin} url=${connectionContext.request.url}; Error: ${error.message}`, error),
                        () => console.log(`GraphQL_WS.onDisconnect + onUnSubscribe: Completed OK; origin=${connectionContext.request.headers.origin} url=${connectionContext.request.url};`)
                    );
                }else{
                    console.log(`GraphQL_WS.onDisconnect; origin=${connectionContext.request.headers.origin} url=${connectionContext.request.url}; WARN: no onUnSubscribe callback found`);
                }                
            },
            // DO NOT ACTIVATE: FOR SOME REASON THIS MESS UP WITH CHAIN AND DOES NOT INJECT THE ARG AND CONTEXT ON THE RESOLVER
            // onOperation: (message, params, webSocket) => {
            //     console.log(`GraphQL_WS.onOperation: ${JSON.stringify({ message, params })}`);
            //     return message;
            // },
            onOperationDone: webSocket => {
                console.log(`GraphQL_WS.onOperationDone ==================  ${Object.keys(webSocket)}`);
            },
        },
        {
            server: ws,
            path: process.env.GRAPHQL_WS_END_POINT,
        });
    console.log(`Apollo Server is now running on http://localhost:${PORT}`);
    console.log(`HTTP END POINT: http://${process.env.GRAPHQL_END_POINT_HOST}:${process.env.GRAPHQL_END_POINT_PORT}${process.env.GRAPHQL_HTTP_END_POINT}`);
    console.log(`WEBSOCKET END POINT: ws://${process.env.GRAPHQL_END_POINT_HOST}:${process.env.GRAPHQL_END_POINT_PORT}${process.env.GRAPHQL_WS_END_POINT}`);
    console.log(`GRAPHIQL PAGE: http://${process.env.GRAPHQL_END_POINT_HOST}:${process.env.GRAPHQL_END_POINT_PORT}${process.env.GRAPHIQL_HTTP_END_POINT}`);
});

engine.on('error', (err) => {
    console.log('There was an error starting the server or Engine.');
    console.error(err);
    process.exit(1);
  });