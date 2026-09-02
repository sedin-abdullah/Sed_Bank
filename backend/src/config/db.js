/**
 * Mongoose connection management.
 *
 * Two modes:
 *  - MONGO_URI set   -> connect to that cluster (MongoDB Atlas free M0 in deployment)
 *  - otherwise       -> spin up an in-process mongodb-memory-server so `npm run dev`
 *                       works on a clean machine with no database installed.
 */
import mongoose from 'mongoose';
import env from './env.js';
import logger from '../utils/logger.js';

let memoryServer = null;

export async function connectDatabase() {
  mongoose.set('strictQuery', true);

  let uri = env.mongoUri;

  if (!uri || env.useMemoryDb) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri('sedbank');
    logger.warn('No MONGO_URI provided — started an in-memory MongoDB (data is not persisted).');
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    autoIndex: true,
  });

  logger.info(`MongoDB connected (${memoryServer ? 'in-memory' : 'remote cluster'}).`);
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.connection.close();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

export default { connectDatabase, disconnectDatabase };
