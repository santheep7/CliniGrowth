import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './model/db';
import patientRouter from './router/patientRouter';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database & tables
initDb();

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'CliniGrowth API Server' });
});

// Patient API routes
app.use('/api/patients', patientRouter);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
