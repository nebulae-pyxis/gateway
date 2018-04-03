const express = require('express');
const bodyParser = require('body-parser');

const graphqlServer = require('apollo-server-express');
const graphqlExpress = graphqlServer.graphqlExpress;
const graphiqlExpress = graphqlServer.graphiqlExpress;

const graphqlTools = require('graphql-tools');


const path = require('path')
const mergeGraphqlSchemas = require('merge-graphql-schemas')
const fileLoader = mergeGraphqlSchemas.fileLoader
const mergeTypes = mergeGraphqlSchemas.mergeTypes

const graphql = require('./graphql/index');
const typeDefs = graphql.types;
const resolvers = graphql.resolvers;

const schema = graphqlTools.makeExecutableSchema({ typeDefs, resolvers });

const PORT = process.env.PORT || 3000;

const app = express();

// bodyParser is needed just for POST.
app.use('/graphql', bodyParser.json(), graphqlExpress({ schema }));
app.use('/graphiql', graphiqlExpress({ endpointURL: '/graphql' }));

app.listen(PORT);



