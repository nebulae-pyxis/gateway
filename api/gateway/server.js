'use strict'

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').load();
}

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
const broker = require('./broker/index');
const cors = require('cors');
const graphql = require('graphql');
const execute = graphql.execute;
const subscribe = graphql.subscribe;
const http = require('http');
const SubscriptionServer = require('subscriptions-transport-ws').SubscriptionServer;
const jwt = require('express-jwt');

//Service Port
const PORT = process.env.GRAPHQL_END_POINT_PORT || 3000;
//graphql types compendium
const typeDefs = gqlSchema.types;
//graphql resolvers compendium
const resolvers = gqlSchema.resolvers;
//graphql schema = join types & resolvers
const schema = graphqlTools.makeExecutableSchema({ typeDefs, resolvers });


//Express Server
const server = express();
// bodyParser is needed just for POST.
server.use(cors());

// server.use(
//     process.env.GRAPHQL_HTTP_END_POINT,
//     bodyParser.json(),
//     graphqlExpress({ schema, context }));


server.use(
    process.env.GRAPHQL_HTTP_END_POINT,
    bodyParser.json(),
    jwt({
        secret: process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n'),
        requestProperty: 'authToken',
        credentialsRequired: true,
        algorithms: ['RS256']
    }), graphqlExpress(req => ({
        schema,
        context: {
            authToken: req.authToken,
            broker
        },
    })));

server.use(process.env.GRAPHIQL_HTTP_END_POINT, graphiqlExpress(
    {
        endpointURL: process.env.GRAPHQL_HTTP_END_POINT,
        subscriptionsEndpoint: `ws://${process.env.GRAPHQL_END_POINT_HOST}:${process.env.GRAPHQL_END_POINT_PORT}${process.env.GRAPHQL_WS_END_POINT}`
    }
));


// Wrap the Express server
const ws = http.createServer(server);
ws.listen(PORT, () => {
    new SubscriptionServer(
        {
            execute,
            subscribe,
            schema,
            onConnect: (connectionParams, webSocket, context) => {
                console.log(`GraphQL_WS.onConnect: ${JSON.stringify({ connectionParams })}`);
                if (!connectionParams.authToken) {
                    // return validateToken(connectionParams.authToken)
                    //     .then(findUser(connectionParams.authToken))
                    //     .then((user) => {
                    //         return {
                    //             currentUser: user,
                    //         };
                    //     });
                    console.log('Missing auth token!');
                    console.log(`para,s: :${JSON.stringify(connectionParams,null,2)}`);
                    throw new Error('Missing auth token!');
                }else{
                    console.log(`auth token: :${connectionParams.auth}`);
                }

                
            },
            onOperation: (message, params, webSocket) => {
                console.log(`GraphQL_WS.onOperation: ${JSON.stringify({ message, params })}`);
                return message;
            },
            onOperationDone: webSocket => {
                console.log(`GraphQL_WS.onOperationDone ${JSON.stringify({})}`);
            },
            onDisconnect: (webSocket, context) => {
                console.log(`GraphQL_WS.onDisconnect: ${JSON.stringify({})}`);
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

    // Set up the WebSocket for handling GraphQL subscriptions
});