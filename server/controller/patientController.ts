import { Request, Response } from 'express';
import { pool } from '../model/db';

// Get all patients with visits
export const getAllPatients = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT p.*, 
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', v.id,
                   'date', to_char(v.visit_date, 'YYYY-MM-DD'),
                   'height', COALESCE(v.height::text, ''),
                   'weight', COALESCE(v.weight::text, ''),
                   'headCirc', COALESCE(v.head_circ::text, '')
                 ) ORDER BY v.visit_date
               ) FILTER (WHERE v.id IS NOT NULL), '[]'
             ) AS visits
      FROM patients p
      LEFT JOIN visits v ON p.id = v.patient_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching patients:', err);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
};

// Get single patient with visits
export const getPatientById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const patientResult = await pool.query('SELECT * FROM patients WHERE id = $1', [id]);

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const visitsResult = await pool.query('SELECT * FROM visits WHERE patient_id = $1 ORDER BY visit_date', [id]);

    res.json({
      patient: patientResult.rows[0],
      visits: visitsResult.rows,
    });
  } catch (err) {
    console.error('Error fetching patient:', err);
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
};

// Create new patient with visits
export const createPatient = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { patientName, gender, dob, gaAtBirth, termWeek, visits } = req.body;

    // Insert patient
    const patientResult = await client.query(
      'INSERT INTO patients (patient_name, gender, dob, ga_at_birth, term_week) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [patientName, gender, dob, gaAtBirth, termWeek]
    );

    const patientId = patientResult.rows[0].id;

    // Insert visits
    if (visits && visits.length > 0) {
      for (const visit of visits) {
        await client.query(
          'INSERT INTO visits (patient_id, visit_date, height, weight, head_circ) VALUES ($1, $2, $3, $4, $5)',
          [patientId, visit.date, visit.height, visit.weight, visit.headCirc]
        );
      }
    }

    await client.query('COMMIT');

    // Fetch the complete patient data with visits
    const visitsResult = await client.query('SELECT * FROM visits WHERE patient_id = $1 ORDER BY visit_date', [patientId]);

    res.json({
      patient: patientResult.rows[0],
      visits: visitsResult.rows,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating patient:', err);
    res.status(500).json({ error: 'Failed to create patient' });
  } finally {
    client.release();
  }
};

// Update patient with visits
export const updatePatient = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { patientName, gender, dob, gaAtBirth, termWeek, visits } = req.body;

    // Update patient
    const patientResult = await client.query(
      'UPDATE patients SET patient_name = $1, gender = $2, dob = $3, ga_at_birth = $4, term_week = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING *',
      [patientName, gender, dob, gaAtBirth, termWeek, id]
    );

    if (patientResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Delete existing visits
    await client.query('DELETE FROM visits WHERE patient_id = $1', [id]);

    // Insert new visits
    if (visits && visits.length > 0) {
      for (const visit of visits) {
        await client.query(
          'INSERT INTO visits (patient_id, visit_date, height, weight, head_circ) VALUES ($1, $2, $3, $4, $5)',
          [id, visit.date, visit.height, visit.weight, visit.headCirc]
        );
      }
    }

    await client.query('COMMIT');

    // Fetch the complete patient data with visits
    const visitsResult = await client.query('SELECT * FROM visits WHERE patient_id = $1 ORDER BY visit_date', [id]);

    res.json({
      patient: patientResult.rows[0],
      visits: visitsResult.rows,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating patient:', err);
    res.status(500).json({ error: 'Failed to update patient' });
  } finally {
    client.release();
  }
};

// Delete patient
export const deletePatient = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM patients WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json({ message: 'Patient deleted successfully' });
  } catch (err) {
    console.error('Error deleting patient:', err);
    res.status(500).json({ error: 'Failed to delete patient' });
  }
};
