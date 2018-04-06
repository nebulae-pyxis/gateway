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
const graphql = require('./graphql/index');
const broker = require('./broker/index');

//Service Port
const PORT = process.env.PORT || 3000;
//graphql types compendium
const typeDefs = graphql.types;
//graphql resolvers compendium
const resolvers = graphql.resolvers;
//graphql schema = join types & resolvers
const schema = graphqlTools.makeExecutableSchema({ typeDefs, resolvers });

const context = {
    broker
};

//Express Server
const app = express();
// bodyParser is needed just for POST.
app.use('/graphql', bodyParser.json(), graphqlExpress({ schema, context }));
app.use('/graphiql', graphiqlExpress({ endpointURL: '/graphql' }));

app.listen(PORT);