import app from '../server';
import mongoose from 'mongoose';

export default async function handler(req: any, res: any) {
  try {
    if (mongoose.connection.readyState !== 1) {
      if (!process.env.MONGODB_URI) {
        return res.status(500).json({
          success: false,
          error: "CRITICAL: MONGODB_URI is undefined in process.env"
        });
      }
      await mongoose.connect(process.env.MONGODB_URI);
    }
    return app(req, res);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || "Database Connection Failed",
      stack: error.stack
    });
  }
}
