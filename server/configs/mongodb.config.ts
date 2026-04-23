import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const url = process.env.MONGO_URL;

if (!url) {
  throw new Error("MONGO_URL is not defined in environment variables");
}

const client = new MongoClient(url);

export const clientPromise = client.connect();