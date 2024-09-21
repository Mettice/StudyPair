// test-db-connection.js
const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
});

async function testConnection() {
  try {
    await client.connect();
    console.log('Connected successfully to MongoDB');
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. Connection is working.");
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
  } finally {
    await client.close();
  }
}

testConnection();